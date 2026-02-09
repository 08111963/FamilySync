import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { families, familyMembers, familyInvites, users } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireFamilyMember, requireFamilyAdmin } from '../middleware/family';
import { sendFamilyInviteEmail } from '../lib/email';
import { broadcastToFamily } from '../lib/websocket';
import { config } from '../lib/config';
import { logger } from '../lib/logger';
import { v4 as uuidv4 } from 'uuid';

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
  email: z.string().email("Email non valida").optional(),
  role: z.enum(["admin", "adult", "child"]).optional().default("adult"),
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
    const familyId = req.params.familyId;

    const [family] = await db.select().from(families).where(eq(families.id, familyId)).limit(1);

    if (!family) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Famiglia non trovata" } });
    }

    const members = await db
      .select({ member: familyMembers, user: users })
      .from(familyMembers)
      .innerJoin(users, eq(familyMembers.userId, users.id))
      .where(eq(familyMembers.familyId, familyId));

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
    const familyId = req.params.familyId;
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

router.post('/:familyId/invite', authenticate, requireFamilyAdmin(), async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId;
    const parsed = inviteSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const [family] = await db.select().from(families).where(eq(families.id, familyId)).limit(1);
    const [inviter] = await db.select().from(users).where(eq(users.id, req.user!.userId)).limit(1);

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

    await db.insert(familyInvites).values({
      familyId,
      token,
      invitedBy: req.user!.userId,
      role: parsed.data.role,
      expiresAt,
    });

    if (parsed.data.email) {
      await sendFamilyInviteEmail(parsed.data.email, family.name, inviter.name, token);
    }

    const baseUrl = config.getBaseUrl(req);

    res.json({
      token,
      inviteLink: `${baseUrl}/join/${token}`,
      expiresAt,
    });
  } catch (error) {
    logger.error('Create invite error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione dell'invito" } });
  }
});

router.post('/join/:token', authenticate, async (req: Request, res: Response) => {
  try {
    const token = req.params.token;
    const { nickname, color } = req.body;

    const [invite] = await db.select()
      .from(familyInvites)
      .where(eq(familyInvites.token, token))
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

    const existing = await db.select()
      .from(familyMembers)
      .where(and(eq(familyMembers.familyId, invite.familyId), eq(familyMembers.userId, req.user!.userId)))
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({ error: { code: "ALREADY_MEMBER", message: "Fai già parte di questa famiglia" } });
    }

    const [newMember] = await db.insert(familyMembers).values({
      familyId: invite.familyId,
      userId: req.user!.userId,
      role: invite.role,
      nickname: nickname || 'Membro',
      color: color || '#6366F1',
      points: 0,
    }).returning();

    await db.update(familyInvites)
      .set({ acceptedAt: new Date() })
      .where(eq(familyInvites.token, token));

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
    const { familyId, memberId } = req.params;
    const { nickname, color, role } = req.body;
    const membership = (req as any).membership;

    const updateData: any = {};
    if (nickname) updateData.nickname = nickname;
    if (color) updateData.color = color;

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
    const { familyId, memberId } = req.params;

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
