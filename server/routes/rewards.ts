import { Router } from 'express';
import { getParam } from '../lib/http-params';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { rewards, rewardRedemptions, familyMembers, users } from '../../shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireFamilyMember } from '../middleware/family';
import { broadcastToFamily } from '../lib/websocket';
import { sendPushToFamily } from '../lib/push';
import { getBlockRelatedUserIds } from '../lib/block-filter';
import { logger } from '../lib/logger';

const router = Router();

const createRewardSchema = z.object({
  title: z.string().trim().min(1, 'Il titolo è obbligatorio').max(200),
  description: z.string().trim().max(1000).optional(),
  pointsCost: z.number().int().min(1, 'Il costo deve essere almeno 1 punto').max(100000),
});

const updateRewardSchema = createRewardSchema.partial();

/** Solo admin e adulti gestiscono il catalogo premi. */
function canManageRewards(membership: { role: string }): boolean {
  return membership.role === 'admin' || membership.role === 'adult';
}

// Catalogo premi attivi + cronologia riscatti recente.
router.get('/:familyId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');

    const rewardsList = await db
      .select()
      .from(rewards)
      .where(and(eq(rewards.familyId, familyId), eq(rewards.isActive, true)))
      .orderBy(rewards.pointsCost);

    const redemptions = await db
      .select({
        id: rewardRedemptions.id,
        rewardTitle: rewardRedemptions.rewardTitle,
        pointsSpent: rewardRedemptions.pointsSpent,
        redeemedAt: rewardRedemptions.redeemedAt,
        memberId: rewardRedemptions.memberId,
      })
      .from(rewardRedemptions)
      .where(eq(rewardRedemptions.familyId, familyId))
      .orderBy(desc(rewardRedemptions.redeemedAt))
      .limit(30);

    res.json({ rewards: rewardsList, redemptions });
  } catch (error) {
    logger.error('Get rewards error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore nel recupero dei premi' } });
  }
});

router.post('/:familyId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const membership = (req as any).membership;

    if (!canManageRewards(membership)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Solo admin e adulti possono gestire i premi' } });
    }

    const parsed = createRewardSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Dati non validi', details: parsed.error.flatten().fieldErrors },
      });
    }

    const [reward] = await db.insert(rewards).values({
      familyId,
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() || null,
      pointsCost: parsed.data.pointsCost,
      createdBy: req.user!.userId,
    }).returning();

    broadcastToFamily(familyId, 'reward_created', reward);
    res.status(201).json(reward);
  } catch (error) {
    logger.error('Create reward error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore nella creazione del premio' } });
  }
});

router.put('/:familyId/:rewardId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const rewardId = getParam(req, 'rewardId');
    const membership = (req as any).membership;

    if (!canManageRewards(membership)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Solo admin e adulti possono gestire i premi' } });
    }

    const parsed = updateRewardSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Dati non validi', details: parsed.error.flatten().fieldErrors },
      });
    }

    const updateData: Record<string, any> = {};
    if (parsed.data.title !== undefined) updateData.title = parsed.data.title.trim();
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description?.trim() || null;
    if (parsed.data.pointsCost !== undefined) updateData.pointsCost = parsed.data.pointsCost;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Nessun dato da aggiornare' } });
    }

    const [reward] = await db.update(rewards)
      .set(updateData)
      .where(and(eq(rewards.id, rewardId), eq(rewards.familyId, familyId), eq(rewards.isActive, true)))
      .returning();

    if (!reward) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Premio non trovato' } });
    }

    broadcastToFamily(familyId, 'reward_updated', reward);
    res.json(reward);
  } catch (error) {
    logger.error('Update reward error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: "Errore nell'aggiornamento del premio" } });
  }
});

// Eliminazione soft: il premio sparisce dal catalogo ma la cronologia resta.
router.delete('/:familyId/:rewardId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const rewardId = getParam(req, 'rewardId');
    const membership = (req as any).membership;

    if (!canManageRewards(membership)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Solo admin e adulti possono gestire i premi' } });
    }

    const [reward] = await db.update(rewards)
      .set({ isActive: false })
      .where(and(eq(rewards.id, rewardId), eq(rewards.familyId, familyId), eq(rewards.isActive, true)))
      .returning();

    if (!reward) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Premio non trovato' } });
    }

    broadcastToFamily(familyId, 'reward_deleted', { rewardId });
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete reward error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: "Errore nell'eliminazione del premio" } });
  }
});

// Riscatto: scala i punti in modo atomico (guardia points >= costo nella WHERE,
// così due richieste concorrenti non possono mandare i punti in negativo).
router.post('/:familyId/:rewardId/redeem', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const rewardId = getParam(req, 'rewardId');
    const membership = (req as any).membership;
    const userId = req.user!.userId;

    const [reward] = await db
      .select()
      .from(rewards)
      .where(and(eq(rewards.id, rewardId), eq(rewards.familyId, familyId), eq(rewards.isActive, true)))
      .limit(1);

    if (!reward) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Premio non trovato' } });
    }

    const redemption = await db.transaction(async (tx) => {
      const [updatedMember] = await tx.update(familyMembers)
        .set({ points: sql`${familyMembers.points} - ${reward.pointsCost}` })
        .where(and(
          eq(familyMembers.id, membership.id),
          eq(familyMembers.familyId, familyId),
          sql`COALESCE(${familyMembers.points}, 0) >= ${reward.pointsCost}`
        ))
        .returning();

      if (!updatedMember) return null;

      const [row] = await tx.insert(rewardRedemptions).values({
        familyId,
        rewardId: reward.id,
        memberId: membership.id,
        rewardTitle: reward.title,
        pointsSpent: reward.pointsCost,
      }).returning();

      return { redemption: row, remainingPoints: updatedMember.points ?? 0 };
    });

    if (!redemption) {
      return res.status(400).json({
        error: { code: 'INSUFFICIENT_POINTS', message: 'Punti insufficienti per riscattare questo premio' },
      });
    }

    broadcastToFamily(familyId, 'reward_redeemed', {
      redemption: redemption.redemption,
      memberId: membership.id,
      remainingPoints: redemption.remainingPoints,
    });

    // Push agli altri membri (esclusi autore e utenti in blocco reciproco).
    void (async () => {
      const excluded = new Set(await getBlockRelatedUserIds(userId, familyId));
      excluded.add(userId);
      const [author] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
      await sendPushToFamily(familyId, {
        title: 'Premio riscattato! 🎉',
        body: `${author?.name ?? 'Un familiare'} ha riscattato "${reward.title}" (${reward.pointsCost} punti)`,
        data: { route: '/rewards' },
      }, { excludeUserIds: excluded });
    })().catch(() => {});

    res.status(201).json(redemption);
  } catch (error) {
    logger.error('Redeem reward error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore nel riscatto del premio' } });
  }
});

export default router;
