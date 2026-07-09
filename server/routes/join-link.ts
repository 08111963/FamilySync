import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { getParam } from '../lib/http-params';
import { db } from '../db';
import { families, familyMembers, users } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { generateAccessToken, generateRefreshToken } from '../lib/jwt';
import { isFamilyMemberLimitReached, isFamilyMemberLimitReachedTx, FREE_MAX_FAMILY_MEMBERS } from '../lib/entitlements';
import { broadcastToFamily } from '../lib/websocket';
import { logger } from '../lib/logger';

const router = Router();

// Rate limit dedicato per il link RIUTILIZZABILE (lookup + accept nuovo utente).
export const joinLinkLimiter = rateLimit({
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
  email: z.string().trim().toLowerCase().email("Email non valida"),
  name: z.string().trim().min(2, "Il nome deve avere almeno 2 caratteri").max(255),
  password: strongPasswordSchema,
  acceptedTerms: z.literal(true),
});

// GET /api/join-link/:code — stato pubblico del link riutilizzabile.
// Non espone dati sensibili: solo se è valido e se la famiglia è al completo.
router.get('/:code', async (req: Request, res: Response) => {
  try {
    const code = getParam(req, 'code');

    const [family] = await db.select().from(families).where(eq(families.inviteCode, code)).limit(1);
    if (!family) {
      return res.status(404).json({ status: "not_found" });
    }

    const full = await isFamilyMemberLimitReached(family.id);

    res.json({
      status: full ? "full" : "valid",
      familyName: family.name,
      memberLimitReached: full,
    });
  } catch (error) {
    logger.error('Get join-link error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero del link" } });
  }
});

// POST /api/join-link/:code/accept — NUOVO utente: inserisce la PROPRIA email,
// crea l'account (email verificata), entra in famiglia come "adult" e fa
// auto-login. Il link è MULTI-USO: non viene consumato, entrano più persone
// fino al limite del piano.
router.post('/:code/accept', async (req: Request, res: Response) => {
  try {
    const code = getParam(req, 'code');

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

    const { email, name, password } = parsed.data;

    const [family] = await db.select().from(families).where(eq(families.inviteCode, code)).limit(1);
    if (!family) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Link di invito non valido" } });
    }

    // Se l'email è già registrata, l'utente deve accedere ed entrare da loggato.
    const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser) {
      return res.status(409).json({
        error: { code: "USER_EXISTS", message: "Esiste già un account con questa email. Accedi per entrare nella famiglia." },
      });
    }

    if (await isFamilyMemberLimitReached(family.id)) {
      return res.status(403).json({
        error: {
          code: "MEMBER_LIMIT_REACHED",
          message: `Questa famiglia ha raggiunto il limite di ${FREE_MAX_FAMILY_MEMBERS} membri del piano Free.`,
        },
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    let createdUser;
    let createdMember;
    try {
      const result = await db.transaction(async (tx) => {
        // Guardia ATOMICA del limite Free: advisory lock per-famiglia + conteggio
        // dentro la transazione, così accessi concorrenti non superano il limite.
        if (await isFamilyMemberLimitReachedTx(tx, family.id)) {
          throw new Error('MEMBER_LIMIT_REACHED');
        }

        const [user] = await tx.insert(users).values({
          email,
          passwordHash,
          name,
          emailVerified: true,
          termsAcceptedAt: new Date(),
        }).returning();

        const [member] = await tx.insert(familyMembers).values({
          familyId: family.id,
          userId: user.id,
          role: 'adult',
          nickname: name,
          color: '#6366F1',
          points: 0,
        }).returning();

        return { user, member };
      });
      createdUser = result.user;
      createdMember = result.member;
    } catch (txError: any) {
      if (txError?.message === 'MEMBER_LIMIT_REACHED') {
        return res.status(403).json({
          error: {
            code: "MEMBER_LIMIT_REACHED",
            message: `Questa famiglia ha raggiunto il limite di ${FREE_MAX_FAMILY_MEMBERS} membri del piano Free.`,
          },
        });
      }
      if (txError?.code === '23505') {
        return res.status(409).json({ error: { code: "USER_EXISTS", message: "Esiste già un account con questa email" } });
      }
      throw txError;
    }

    broadcastToFamily(family.id, 'member_joined', createdMember);

    const accessToken = generateAccessToken(createdUser);
    const refreshToken = generateRefreshToken(createdUser);

    res.status(201).json({
      user: { id: createdUser.id, email: createdUser.email, name: createdUser.name, emailVerified: true },
      accessToken,
      refreshToken,
      family,
    });
  } catch (error) {
    logger.error('Accept join-link (public) error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'accettazione dell'invito" } });
  }
});

export default router;
