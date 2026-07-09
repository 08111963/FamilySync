import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getParam } from '../lib/http-params';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { families, familyMembers, familyInvites, users, calendarEvents, shoppingItems, shoppingLists, chores } from '../../shared/schema';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireFamilyMember, requireFamilyAdmin } from '../middleware/family';
import { sendFamilyInviteEmail, isEmailConfigured } from '../lib/email';
import { broadcastToFamily } from '../lib/websocket';
import { config } from '../lib/config';
import { logger } from '../lib/logger';
import { generateInviteToken, hashInviteToken, generateJoinCode } from '../lib/invite-token';
import { isFamilyMemberLimitReached, isFamilyMemberLimitReachedTx, FREE_MAX_FAMILY_MEMBERS } from '../lib/entitlements';

const router = Router();

const createFamilySchema = z.object({
  name: z.string().min(1, "Il nome è obbligatorio").max(50),
  colorTheme: z.string().optional().default("#6366F1"),
});

const updateFamilySchema = z.object({
  name: z.string().min(2, "Il nome deve avere almeno 2 caratteri").max(50).optional(),
  colorTheme: z.string().optional(),
});

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email non valida"),
  invitedName: z.string().trim().max(255).optional(),
  role: z.enum(["admin", "adult", "teen", "child"]).optional().default("adult"),
});

const INVITE_TTL_MS = 72 * 60 * 60 * 1000;

// Rate limiter dedicato alla creazione inviti: più stretto del limiter globale /api,
// per evitare abusi di invio email (enumerazione / spam) anche da admin compromessi.
const createInviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const parsed = createFamilySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const [family] = await db.insert(families).values({
      name: parsed.data.name,
      colorTheme: parsed.data.colorTheme,
    }).returning();

    await db.insert(familyMembers).values({
      familyId: family.id,
      userId: req.user!.userId,
      role: 'admin',
      nickname: 'Admin',
      color: '#6366F1',
      points: 0,
    });

    res.status(201).json(family);
  } catch (error) {
    logger.error('Create family error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione della famiglia" } });
  }
});

router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const myFamilies = await db
      .select({ family: families, member: familyMembers })
      .from(familyMembers)
      .innerJoin(families, eq(familyMembers.familyId, families.id))
      .where(eq(familyMembers.userId, req.user!.userId));

    res.json(myFamilies.map(f => ({ ...f.family, myRole: f.member.role, myMemberId: f.member.id })));
  } catch (error) {
    logger.error('Get families error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero delle famiglie" } });
  }
});

router.get('/:familyId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');

    const [family] = await db.select().from(families).where(eq(families.id, familyId)).limit(1);

    if (!family) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Famiglia non trovata" } });
    }

    const members = await db
      .select({ member: familyMembers, user: users })
      .from(familyMembers)
      .innerJoin(users, eq(familyMembers.userId, users.id))
      .where(eq(familyMembers.familyId, familyId));

    const [eventsCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(calendarEvents)
      .where(and(eq(calendarEvents.familyId, familyId), isNull(calendarEvents.createdBy)));

    const [itemsCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(shoppingItems)
      .innerJoin(shoppingLists, eq(shoppingItems.listId, shoppingLists.id))
      .where(and(eq(shoppingLists.familyId, familyId), isNull(shoppingItems.createdBy)));

    const [choresCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(chores)
      .where(and(eq(chores.familyId, familyId), isNull(chores.createdBy)));

    console.log(JSON.stringify({
      tag: "LEGACY_NULL_CREATED_BY",
      familyId,
      counts: { events: eventsCount.count, shoppingItems: itemsCount.count, chores: choresCount.count }
    }));

    res.json({
      ...family,
      members: members.map(m => ({
        id: m.member.id,
        userId: m.user.id,
        name: m.user.name,
        nickname: m.member.nickname,
        role: m.member.role,
        color: m.member.color,
        points: m.member.points,
        avatarUrl: m.user.avatarUrl,
      })),
    });
  } catch (error) {
    logger.error('Get family detail error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero della famiglia" } });
  }
});

router.put('/:familyId', authenticate, requireFamilyAdmin(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const parsed = updateFamilySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const [updatedFamily] = await db.update(families)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(families.id, familyId))
      .returning();

    broadcastToFamily(familyId, 'family_updated', updatedFamily);
    res.json(updatedFamily);
  } catch (error) {
    logger.error('Update family error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento della famiglia" } });
  }
});

router.post('/:familyId/invite', createInviteLimiter, authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const parsed = inviteSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const { email, invitedName, role } = parsed.data;

    // Chi può invitare = qualsiasi membro. Ma SOLO un admin può assegnare il
    // ruolo "admin": un membro non-admin che prova a invitare qualcuno come
    // admin lo crea come "adult" (niente escalation di privilegi).
    const inviterRole = (req as any).membership?.role;
    const effectiveRole = role === "admin" && inviterRole !== "admin" ? "adult" : role;

    // In produzione l'invio email è obbligatorio: senza Resend non possiamo
    // recapitare il link, quindi non creiamo nemmeno l'invito.
    if (config.isProduction && !isEmailConfigured()) {
      return res.status(503).json({
        error: { code: "EMAIL_NOT_CONFIGURED", message: "Il servizio email non è configurato. Impossibile inviare l'invito." },
      });
    }

    const [family] = await db.select().from(families).where(eq(families.id, familyId)).limit(1);
    const [inviter] = await db.select().from(users).where(eq(users.id, req.user!.userId)).limit(1);

    // Se esiste già un membro con quell'email nella famiglia, evitiamo l'invito.
    const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser) {
      const [alreadyMember] = await db.select()
        .from(familyMembers)
        .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, existingUser.id)))
        .limit(1);
      if (alreadyMember) {
        return res.status(409).json({ error: { code: "ALREADY_MEMBER", message: "Questa persona fa già parte della famiglia" } });
      }
    }

    // Piano Free: massimo FREE_MAX_FAMILY_MEMBERS membri. Blocchiamo già l'invito
    // per non creare token che non potrebbero comunque essere accettati.
    if (await isFamilyMemberLimitReached(familyId)) {
      return res.status(403).json({
        error: {
          code: "MEMBER_LIMIT_REACHED",
          message: `Il piano Free consente al massimo ${FREE_MAX_FAMILY_MEMBERS} membri. Passa a Premium per aggiungere altri familiari.`,
        },
      });
    }

    const token = generateInviteToken();
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const [createdInvite] = await db.insert(familyInvites).values({
      familyId,
      tokenHash,
      email,
      invitedName: invitedName || null,
      invitedBy: req.user!.userId,
      role: effectiveRole,
      expiresAt,
    }).returning();

    const baseUrl = process.env.CLIENT_URL || config.getBaseUrl(req);
    const inviteLink = `${baseUrl}/join/${token}`;

    try {
      await sendFamilyInviteEmail(email, family.name, inviter.name, inviteLink, invitedName);
    } catch (mailError) {
      logger.error('Invite email send failed', { error: String(mailError) });
      // In produzione un fallimento di invio è bloccante: l'invito non è
      // recapitabile, quindi facciamo rollback per non lasciare token orfani.
      if (config.isProduction) {
        await db.delete(familyInvites).where(eq(familyInvites.id, createdInvite.id));
        return res.status(502).json({
          error: { code: "EMAIL_SEND_FAILED", message: "Invio email fallito. Riprova più tardi." },
        });
      }
    }

    // Non logghiamo mai token o link completi.
    logger.info('Family invite created', { familyId, role });

    // Restituiamo il link all'admin autenticato che ha creato l'invito, così può
    // condividerlo anche via WhatsApp o QR code oltre all'email già inviata.
    const response: Record<string, unknown> = { ok: true, email, expiresAt, inviteLink };
    res.json(response);
  } catch (error) {
    logger.error('Create invite error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione dell'invito" } });
  }
});

// Link/QR RIUTILIZZABILE della famiglia: qualsiasi membro ottiene (o crea) un
// codice invito persistente da condividere via WhatsApp o QR. Chi lo apre entra
// registrando la PROPRIA email (vedi /api/join-link), fino al limite del piano.
router.post('/:familyId/invite-link', authenticate, requireFamilyMember(), createInviteLimiter, async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');

    const [family] = await db.select().from(families).where(eq(families.id, familyId)).limit(1);
    if (!family) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Famiglia non trovata" } });
    }

    let code = family.inviteCode;
    if (!code) {
      // Get-or-create: generiamo un codice unico e lo persistiamo. In caso di
      // improbabile collisione sul vincolo unique riproviamo poche volte.
      for (let attempt = 0; attempt < 5 && !code; attempt++) {
        const candidate = generateJoinCode();
        try {
          const [updated] = await db.update(families)
            .set({ inviteCode: candidate })
            .where(and(eq(families.id, familyId), isNull(families.inviteCode)))
            .returning();
          if (updated?.inviteCode) {
            code = updated.inviteCode;
          } else {
            // Un'altra richiesta concorrente ha già impostato il codice: rileggiamo.
            const [refreshed] = await db.select().from(families).where(eq(families.id, familyId)).limit(1);
            code = refreshed?.inviteCode ?? null;
          }
        } catch {
          // Collisione sul vincolo unique: riprova con un nuovo candidato.
        }
      }
    }

    if (!code) {
      return res.status(500).json({ error: { code: "SERVER_ERROR", message: "Impossibile generare il link di invito" } });
    }

    const baseUrl = process.env.CLIENT_URL || config.getBaseUrl(req);
    const inviteLink = `${baseUrl}/join-link/${code}`;

    logger.info('Family invite-link retrieved', { familyId });
    res.json({ ok: true, inviteLink, code, familyName: family.name });
  } catch (error) {
    logger.error('Get invite-link error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero del link di invito" } });
  }
});

// Accettazione del link RIUTILIZZABILE da parte di un utente GIÀ loggato.
// A differenza dell'invito email-bound, qui non c'è vincolo sull'email: chiunque
// abbia il codice può entrare (fino al limite piano). Ruolo sempre "adult".
router.post('/join-link/:code', authenticate, async (req: Request, res: Response) => {
  try {
    const code = getParam(req, 'code');
    const { nickname, color } = req.body;

    const [family] = await db.select().from(families).where(eq(families.inviteCode, code)).limit(1);
    if (!family) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Link di invito non valido" } });
    }

    const [currentUser] = await db.select().from(users).where(eq(users.id, req.user!.userId)).limit(1);
    if (!currentUser) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Utente non trovato" } });
    }

    const existing = await db.select()
      .from(familyMembers)
      .where(and(eq(familyMembers.familyId, family.id), eq(familyMembers.userId, req.user!.userId)))
      .limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: { code: "ALREADY_MEMBER", message: "Fai già parte di questa famiglia" } });
    }

    let txResult: { limitReached: true } | { limitReached: false; member: typeof familyMembers.$inferSelect };
    try {
      txResult = await db.transaction(async (tx) => {
        if (await isFamilyMemberLimitReachedTx(tx, family.id)) {
          return { limitReached: true as const };
        }
        const [member] = await tx.insert(familyMembers).values({
          familyId: family.id,
          userId: req.user!.userId,
          role: 'adult',
          nickname: nickname || currentUser.name || 'Membro',
          color: color || '#6366F1',
          points: 0,
        }).returning();
        return { limitReached: false as const, member };
      });
    } catch (err: unknown) {
      // Vincolo unico (family_id, user_id): richieste concorrenti dello stesso
      // utente possono superare il check pre-transazione; il DB è la garanzia finale.
      if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505') {
        return res.status(409).json({ error: { code: "ALREADY_MEMBER", message: "Fai già parte di questa famiglia" } });
      }
      throw err;
    }

    if (txResult.limitReached) {
      return res.status(403).json({
        error: {
          code: "MEMBER_LIMIT_REACHED",
          message: `Questa famiglia ha raggiunto il limite di ${FREE_MAX_FAMILY_MEMBERS} membri del piano Free.`,
        },
      });
    }

    broadcastToFamily(family.id, 'member_joined', txResult.member);
    res.json({ message: 'Sei entrato nella famiglia!', family });
  } catch (error) {
    logger.error('Join via invite-link error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'accettazione dell'invito" } });
  }
});

router.post('/join/:token', authenticate, async (req: Request, res: Response) => {
  try {
    const token = getParam(req, 'token');
    const { nickname, color } = req.body;
    const tokenHash = hashInviteToken(token);

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

    // L'email dell'utente loggato deve coincidere con quella invitata.
    const [currentUser] = await db.select().from(users).where(eq(users.id, req.user!.userId)).limit(1);
    if (!currentUser || currentUser.email.toLowerCase() !== invite.email.toLowerCase()) {
      return res.status(403).json({
        error: { code: "EMAIL_MISMATCH", message: "Questo invito è destinato a un altro indirizzo email" },
      });
    }

    const existing = await db.select()
      .from(familyMembers)
      .where(and(eq(familyMembers.familyId, invite.familyId), eq(familyMembers.userId, req.user!.userId)))
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({ error: { code: "ALREADY_MEMBER", message: "Fai già parte di questa famiglia" } });
    }

    // Ricontrolliamo il limite del piano Free anche in accettazione: l'invito
    // potrebbe essere stato creato quando c'era ancora posto.
    if (await isFamilyMemberLimitReached(invite.familyId)) {
      return res.status(403).json({
        error: {
          code: "MEMBER_LIMIT_REACHED",
          message: `Questa famiglia ha raggiunto il limite di ${FREE_MAX_FAMILY_MEMBERS} membri del piano Free.`,
        },
      });
    }

    // Consumo monouso + creazione membership nella STESSA transazione: se l'insert
    // del membro fallisce, il claim del token viene annullato (rollback atomico).
    const txResult = await db.transaction(async (tx) => {
      // Guardia ATOMICA del limite Free: advisory lock per-famiglia + conteggio
      // dentro la transazione, così accettazioni concorrenti non superano 5.
      if (await isFamilyMemberLimitReachedTx(tx, invite.familyId)) {
        return { limitReached: true as const };
      }

      const claimed = await tx.update(familyInvites)
        .set({ acceptedAt: new Date(), acceptedByUserId: req.user!.userId })
        .where(and(eq(familyInvites.id, invite.id), isNull(familyInvites.acceptedAt)))
        .returning();

      if (claimed.length === 0) {
        return { conflict: true as const };
      }

      const [member] = await tx.insert(familyMembers).values({
        familyId: invite.familyId,
        userId: req.user!.userId,
        role: invite.role,
        nickname: nickname || invite.invitedName || currentUser.name || 'Membro',
        color: color || '#6366F1',
        points: 0,
      }).returning();

      return { conflict: false as const, member };
    });

    if (txResult.limitReached) {
      return res.status(403).json({
        error: {
          code: "MEMBER_LIMIT_REACHED",
          message: `Questa famiglia ha raggiunto il limite di ${FREE_MAX_FAMILY_MEMBERS} membri del piano Free.`,
        },
      });
    }

    if (txResult.conflict) {
      return res.status(409).json({ error: { code: "ALREADY_ACCEPTED", message: "Invito già accettato" } });
    }

    const newMember = txResult.member;
    const [family] = await db.select().from(families).where(eq(families.id, invite.familyId)).limit(1);

    broadcastToFamily(invite.familyId, 'member_joined', newMember);

    res.json({ message: 'Invito accettato!', family });
  } catch (error) {
    logger.error('Accept invite error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'accettazione dell'invito" } });
  }
});

router.put('/:familyId/members/:memberId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const memberId = getParam(req, 'memberId');
    const { nickname, color, role } = req.body;
    const membership = (req as any).membership;

    // Ognuno può personalizzare SOLO il proprio profilo (nickname/colore); un
    // admin può invece modificare qualsiasi membro. Impedisce a un membro di
    // cambiare nome/colore altrui.
    const [target] = await db.select()
      .from(familyMembers)
      .where(and(eq(familyMembers.id, memberId), eq(familyMembers.familyId, familyId)))
      .limit(1);

    if (!target) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Membro non trovato" } });
    }

    const isSelf = target.userId === req.user!.userId;
    if (!isSelf && membership.role !== 'admin') {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Puoi modificare solo il tuo profilo" } });
    }

    const updateData: any = {};
    if (nickname !== undefined) updateData.nickname = nickname || null;
    if (color) updateData.color = color;

    // Il ruolo lo può cambiare SOLO un admin (mai su se stesso via questa rotta).
    if (role && membership.role === 'admin') {
      updateData.role = role;
    }

    const [updated] = await db.update(familyMembers)
      .set(updateData)
      .where(and(eq(familyMembers.id, memberId), eq(familyMembers.familyId, familyId)))
      .returning();

    broadcastToFamily(familyId, 'member_updated', updated);
    res.json(updated);
  } catch (error) {
    logger.error('Update member error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento del membro" } });
  }
});

router.delete('/:familyId/members/:memberId', authenticate, requireFamilyAdmin(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const memberId = getParam(req, 'memberId');

    await db.delete(familyMembers)
      .where(and(eq(familyMembers.id, memberId), eq(familyMembers.familyId, familyId)));

    broadcastToFamily(familyId, 'member_removed', { memberId });
    res.json({ message: 'Membro rimosso' });
  } catch (error) {
    logger.error('Remove member error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella rimozione del membro" } });
  }
});

export default router;
