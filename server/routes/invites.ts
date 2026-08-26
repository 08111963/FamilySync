import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { getParam } from '../lib/http-params';
import { db } from '../db';
import { families, familyMembers, familyInvites, users } from '../../shared/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { generateAccessToken, generateRefreshToken } from '../lib/jwt';
import { hashInviteToken } from '../lib/invite-token';
import { isFamilyMemberLimitReached, isFamilyMemberLimitReachedTx, FREE_MAX_FAMILY_MEMBERS } from '../lib/entitlements';
import { broadcastToFamily } from '../lib/websocket';
import { logger } from '../lib/logger';
import { trackServerEvent, trackSecondMemberActiveIfEligible } from '../lib/test-analytics';
import { recordConsent } from '../lib/consents';

const router = Router();

// Rate limit dedicato per gli endpoint pubblici di invito (lookup + accept).
export const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Troppe richieste. Riprova più tardi." } },
});

const strongPasswordSchema = z
  .string()
  .min(8, "La password deve avere almeno 8 caratteri")
  .regex(/[a-z]/, "La password deve contenere almeno una lettera minuscola")
  .regex(/[A-Z]/, "La password deve contenere almeno una lettera maiuscola")
  .regex(/[0-9]/, "La password deve contenere almeno un numero");

const acceptSchema = z.object({
  name: z.string().trim().min(2, "Il nome deve avere almeno 2 caratteri").max(255).optional(),
  password: strongPasswordSchema,
  acceptedTerms: z.literal(true),
});

// GET /api/invites/:token — stato pubblico dell'invito (nessun dato sensibile).
router.get('/:token', async (req: Request, res: Response) => {
  try {
    const token = getParam(req, 'token');
    const tokenHash = hashInviteToken(token);

    const [invite] = await db.select()
      .from(familyInvites)
      .where(eq(familyInvites.tokenHash, tokenHash))
      .limit(1);

    if (!invite) {
      return res.status(404).json({ status: "not_found" });
    }

    const [family] = await db.select().from(families).where(eq(families.id, invite.familyId)).limit(1);
    const [existingUser] = await db.select().from(users).where(eq(users.email, invite.email)).limit(1);

    let status: 'valid' | 'expired' | 'accepted' = 'valid';
    if (invite.acceptedAt) {
      status = 'accepted';
    } else if (new Date() > invite.expiresAt) {
      status = 'expired';
    }

    res.json({
      status,
      email: invite.email,
      invitedName: invite.invitedName,
      familyName: family?.name ?? null,
      userExists: !!existingUser,
      // true se l'invito collega un profilo bambino esistente (promozione).
      isPromotion: invite.memberId !== null,
      expiresAt: invite.expiresAt,
    });
  } catch (error) {
    logger.error('Get invite error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero dell'invito" } });
  }
});

// POST /api/invites/:token/accept — accetta come NUOVO utente: crea account
// (email verificata), imposta la password scelta, entra in famiglia e fa auto-login.
router.post('/:token/accept', async (req: Request, res: Response) => {
  try {
    const token = getParam(req, 'token');
    const tokenHash = hashInviteToken(token);

    // Il consenso ai termini deve essere esplicito: nessun default lato server.
    if (req.body?.acceptedTerms !== true) {
      return res.status(400).json({
        error: { code: "TERMS_REQUIRED", message: "Devi accettare i Termini di servizio e la Privacy Policy" },
      });
    }

    const parsed = acceptSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const [invite] = await db.select()
      .from(familyInvites)
      .where(eq(familyInvites.tokenHash, tokenHash))
      .limit(1);

    if (!invite) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Invito non trovato" } });
    }

    if (invite.acceptedAt) {
      return res.status(409).json({ error: { code: "ALREADY_ACCEPTED", message: "Invito già accettato" } });
    }

    if (new Date() > invite.expiresAt) {
      return res.status(400).json({ error: { code: "INVITE_EXPIRED", message: "Invito scaduto" } });
    }

    // Se l'email è già registrata, l'utente deve accedere e accettare da loggato.
    const [existingUser] = await db.select().from(users).where(eq(users.email, invite.email)).limit(1);
    if (existingUser) {
      return res.status(409).json({
        error: { code: "USER_EXISTS", message: "Esiste già un account con questa email. Accedi per accettare l'invito." },
      });
    }

    // Invito di PROMOZIONE (memberId valorizzato): l'account viene COLLEGATO al
    // familyMembers esistente (profilo bambino) preservando punti e storico.
    // In quel caso il membro conta già nel totale: niente controllo limite.
    const isPromotion = invite.memberId !== null;

    // Piano Free: limite di membri. Verifichiamo prima di creare account+membership.
    if (!isPromotion && await isFamilyMemberLimitReached(invite.familyId)) {
      return res.status(403).json({
        error: {
          code: "MEMBER_LIMIT_REACHED",
          message: `Questa famiglia ha raggiunto il limite di ${FREE_MAX_FAMILY_MEMBERS} membri del piano Free.`,
        },
      });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const name = parsed.data.name || invite.invitedName || invite.email.split('@')[0];

    let createdUser;
    let createdMember;
    try {
      const result = await db.transaction(async (tx) => {
        // Guardia ATOMICA del limite Free: advisory lock per-famiglia + conteggio
        // dentro la transazione, così accettazioni concorrenti non superano 5.
        // (Salta per la promozione: il membro esiste già e conta già nel totale.)
        if (!isPromotion && await isFamilyMemberLimitReachedTx(tx, invite.familyId)) {
          throw new Error('MEMBER_LIMIT_REACHED');
        }

        // Consumo atomico monouso dell'invito.
        const claimed = await tx.update(familyInvites)
          .set({ acceptedAt: new Date() })
          .where(and(eq(familyInvites.id, invite.id), isNull(familyInvites.acceptedAt)))
          .returning();

        if (claimed.length === 0) {
          throw new Error('INVITE_RACE');
        }

        const [user] = await tx.insert(users).values({
          email: invite.email,
          passwordHash,
          name,
          emailVerified: true,
          termsAcceptedAt: new Date(),
          aiFeaturesEnabled: true,
          aiHealthConsent: true,
        }).returning();

        let member;
        if (isPromotion) {
          // Collega l'account appena creato al membro esistente SOLO se è
          // ancora un profilo senza account (userId NULL): punti/storico intatti.
          const updated = await tx.update(familyMembers)
            .set({ userId: user.id })
            .where(and(
              eq(familyMembers.id, invite.memberId!),
              eq(familyMembers.familyId, invite.familyId),
              isNull(familyMembers.userId),
            ))
            .returning();

          if (updated.length === 0) {
            // Profilo eliminato o già collegato: rollback di claim+account.
            throw new Error('PROMOTION_TARGET_GONE');
          }
          member = updated[0];
        } else {
          const [inserted] = await tx.insert(familyMembers).values({
            familyId: invite.familyId,
            userId: user.id,
            role: invite.role,
            nickname: invite.invitedName || name,
            color: '#6366F1',
            points: 0,
          }).returning();
          member = inserted;
        }

        await tx.update(familyInvites)
          .set({ acceptedByUserId: user.id })
          .where(eq(familyInvites.id, invite.id));

        return { user, member };
      });
      createdUser = result.user;
      createdMember = result.member;
      // Registro dell'accettazione dei Termini in registrazione via invito.
      await recordConsent(createdUser.id, "terms", true);
    } catch (txError: any) {
      if (txError?.message === 'MEMBER_LIMIT_REACHED') {
        return res.status(403).json({
          error: {
            code: "MEMBER_LIMIT_REACHED",
            message: `Questa famiglia ha raggiunto il limite di ${FREE_MAX_FAMILY_MEMBERS} membri del piano Free.`,
          },
        });
      }
      if (txError?.message === 'INVITE_RACE') {
        return res.status(409).json({ error: { code: "ALREADY_ACCEPTED", message: "Invito già accettato" } });
      }
      if (txError?.message === 'PROMOTION_TARGET_GONE') {
        return res.status(409).json({
          error: { code: "PROFILE_GONE", message: "Il profilo da collegare non esiste più o è già collegato a un account" },
        });
      }
      if (txError?.code === '23505') {
        return res.status(409).json({ error: { code: "USER_EXISTS", message: "Esiste già un account con questa email" } });
      }
      throw txError;
    }

    const [family] = await db.select().from(families).where(eq(families.id, invite.familyId)).limit(1);

    // Per la promozione il membro esisteva già: agli altri client basta un update.
    broadcastToFamily(invite.familyId, isPromotion ? 'member_updated' : 'member_joined', createdMember);

    const accessToken = generateAccessToken(createdUser);
    const refreshToken = generateRefreshToken(createdUser);

    trackServerEvent('invite_accepted', { userId: createdUser.id, familyId: invite.familyId }).catch(() => {});
    trackSecondMemberActiveIfEligible(invite.familyId).catch(() => {});

    res.status(201).json({
      user: { id: createdUser.id, email: createdUser.email, name: createdUser.name, emailVerified: true },
      accessToken,
      refreshToken,
      family,
    });
  } catch (error) {
    logger.error('Accept invite (public) error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'accettazione dell'invito" } });
  }
});

export default router;
