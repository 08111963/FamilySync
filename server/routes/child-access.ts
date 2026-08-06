import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { db } from '../db';
import { childAccessCodes, familyMembers, families, users } from '../../shared/schema';
import { eq, and, isNull, gt, sql } from 'drizzle-orm';
import { generateAccessToken, generateRefreshToken } from '../lib/jwt';
import { hashChildAccessCode, childSyntheticEmail } from '../lib/child-access';
import { logger } from '../lib/logger';
import { broadcastToFamily } from '../lib/websocket';
import { PRIVACY_POLICY_VERSION } from '../../shared/policy-version';

const router = Router();

// Rate limiter STRETTO: il codice è corto, quindi l'endpoint pubblico di
// attivazione deve essere fortemente limitato contro il brute force.
export const childAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Troppi tentativi. Riprova più tardi." } },
});

const activateSchema = z.object({
  code: z.string().trim().min(6).max(20),
});

// Messaggio unico per ogni esito negativo: non rivelare se un codice esiste,
// è scaduto o è stato revocato (anti-enumeration).
const INVALID = { error: { code: "CODE_INVALID", message: "Codice non valido o scaduto. Chiedi ai tuoi genitori un nuovo codice." } };

/**
 * POST /api/child-access/activate — PUBBLICO (con limiter dedicato).
 * Il bambino inserisce il codice generato dal genitore: consumo monouso in
 * transazione, creazione (o riuso) dell'account "dispositivo bambino" collegato
 * al profilo gestito, e login immediato con i normali token JWT.
 */
router.post('/activate', async (req: Request, res: Response) => {
  try {
    const parsed = activateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(INVALID);
    }

    const codeHash = hashChildAccessCode(parsed.data.code);

    let childUser;
    let member;
    try {
      const result = await db.transaction(async (tx) => {
        // Consumo ATOMICO monouso: claim del codice solo se non usato,
        // non revocato e non scaduto.
        const claimed = await tx.update(childAccessCodes)
          .set({ usedAt: new Date() })
          .where(and(
            eq(childAccessCodes.codeHash, codeHash),
            isNull(childAccessCodes.usedAt),
            isNull(childAccessCodes.revokedAt),
            gt(childAccessCodes.expiresAt, new Date()),
          ))
          .returning();

        if (claimed.length === 0) {
          throw new Error('CODE_INVALID');
        }
        const code = claimed[0];

        const [m] = await tx.select().from(familyMembers)
          .where(and(eq(familyMembers.id, code.memberId), eq(familyMembers.familyId, code.familyId)))
          .limit(1);
        if (!m) {
          throw new Error('CODE_INVALID');
        }

        let user;
        if (m.userId) {
          // Il profilo è già collegato: valido SOLO se a un account bambino
          // attivo (riattivazione su nuovo dispositivo). Mai per account veri.
          const [existing] = await tx.select().from(users).where(eq(users.id, m.userId)).limit(1);
          if (!existing || !existing.isChildAccount || existing.deletedAt) {
            throw new Error('CODE_INVALID');
          }
          // Nuovo dispositivo = nuova sessione; invalidiamo i refresh vecchi.
          const [updated] = await tx.update(users)
            .set({ tokenVersion: sql`${users.tokenVersion} + 1`, updatedAt: new Date() })
            .where(eq(users.id, existing.id))
            .returning();
          user = updated;
        } else {
          // Account "dispositivo bambino": email sintetica NON recapitabile,
          // nessuna password (login classico impossibile), email "verificata"
          // per superare requireEmailVerified, niente onboarding (il consenso
          // ai Termini è del genitore che ha generato il codice).
          const syntheticEmail = childSyntheticEmail(m.id);

          // RIATTIVAZIONE dopo revoca: la revoca soft-elimina lo shadow user ma
          // NON libera l'email sintetica (deterministica dal memberId). Se
          // esiste già, va ripristinata quella riga — un nuovo INSERT
          // violerebbe l'unicità dell'email. Fail-closed: l'email sintetica
          // deve appartenere a un account bambino, mai a un account vero.
          const [existingShadow] = await tx.select().from(users)
            .where(eq(users.email, syntheticEmail))
            .limit(1);

          if (existingShadow && !existingShadow.isChildAccount) {
            throw new Error('CODE_INVALID');
          }

          let childRow;
          if (existingShadow) {
            const [restored] = await tx.update(users)
              .set({
                deletedAt: null,
                name: m.name ?? m.nickname ?? 'Bambino',
                tokenVersion: sql`${users.tokenVersion} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(users.id, existingShadow.id))
              .returning();
            childRow = restored;
          } else {
            const [created] = await tx.insert(users).values({
              email: syntheticEmail,
              passwordHash: null,
              name: m.name ?? m.nickname ?? 'Bambino',
              emailVerified: true,
              isChildAccount: true,
              termsAcceptedAt: new Date(),
              ageBand: 'under14',
              aiFeaturesEnabled: false,
              privacyPolicySeenVersion: PRIVACY_POLICY_VERSION,
            }).returning();
            childRow = created;
          }

          const linked = await tx.update(familyMembers)
            .set({ userId: childRow.id })
            .where(and(eq(familyMembers.id, m.id), isNull(familyMembers.userId)))
            .returning();
          if (linked.length === 0) {
            throw new Error('CODE_INVALID');
          }
          user = childRow;
        }

        return { user, member: m };
      });
      childUser = result.user;
      member = result.member;
    } catch (txError: any) {
      if (txError?.message === 'CODE_INVALID') {
        return res.status(400).json(INVALID);
      }
      throw txError;
    }

    const [family] = await db.select().from(families).where(eq(families.id, member.familyId)).limit(1);

    broadcastToFamily(member.familyId, 'member_updated', { ...member, userId: childUser.id });

    const accessToken = generateAccessToken(childUser);
    const refreshToken = generateRefreshToken(childUser);

    res.status(200).json({
      user: {
        id: childUser.id,
        email: childUser.email,
        name: childUser.name,
        emailVerified: true,
        isChildAccount: true,
      },
      accessToken,
      refreshToken,
      family: family ? { id: family.id, name: family.name } : null,
    });
  } catch (error) {
    logger.error('Child access activate error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore durante l'attivazione del codice" } });
  }
});

export default router;
