import { Router } from 'express';
import type { Request, Response } from 'express';
import { db } from '../db';
import { familyMembers, shoppingHistory, calendarEvents, chores, aiInsights } from '../../shared/schema';
import { eq, and, gte, desc } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { generateShoppingSuggestions, optimizeChoreSchedule, generateFamilyInsights } from '../lib/openai';

const router = Router();

async function checkFamilyAccess(userId: string, familyId: string) {
  const membership = await db.select()
    .from(familyMembers)
    .where(and(
      eq(familyMembers.userId, userId),
      eq(familyMembers.familyId, familyId)
    ))
    .limit(1);
  return membership.length > 0;
}

function getCurrentSeason(): string {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'primavera';
  if (month >= 5 && month <= 7) return 'estate';
  if (month >= 8 && month <= 10) return 'autunno';
  return 'inverno';
}

// GET SHOPPING SUGGESTIONS
router.get('/:familyId/shopping-suggestions', authenticate, async (req: Request, res: Response) => {
  try {
    const { familyId } = req.params;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    const members = await db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId));
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const history = await db.select()
      .from(shoppingHistory)
      .where(and(
        eq(shoppingHistory.familyId, familyId),
        gte(shoppingHistory.purchasedAt, thirtyDaysAgo)
      ))
      .limit(50);
    
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const today = new Date().toISOString().split('T')[0];
    const futureDate = sevenDaysFromNow.toISOString().split('T')[0];
    
    const upcomingEvents = await db.select()
      .from(calendarEvents)
      .where(and(
        eq(calendarEvents.familyId, familyId),
        gte(calendarEvents.date, today)
      ))
      .limit(10);
    
    const suggestions = await generateShoppingSuggestions({
      familySize: members.length,
      recentPurchases: history.map(h => h.itemName),
      upcomingEvents: upcomingEvents.map(e => e.title),
      season: getCurrentSeason(),
    });
    
    res.json(suggestions);
  } catch (error) {
    console.error('Shopping suggestions error:', error);
    res.status(500).json({ error: 'Errore nella generazione suggerimenti' });
  }
});

// GET CHORE OPTIMIZATION
router.get('/:familyId/chore-optimization', authenticate, async (req: Request, res: Response) => {
  try {
    const { familyId } = req.params;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    const members = await db.select()
      .from(familyMembers)
      .where(eq(familyMembers.familyId, familyId));
    
    const pendingChores = await db.select()
      .from(chores)
      .where(and(
        eq(chores.familyId, familyId),
        eq(chores.isCompleted, false)
      ));
    
    if (pendingChores.length === 0) {
      return res.json({ assignments: [], message: 'Nessuna faccenda da assegnare' });
    }
    
    const optimization = await optimizeChoreSchedule({
      members: members.map(m => ({
        id: m.id,
        name: m.nickname || 'Membro',
        points: m.points || 0,
      })),
      chores: pendingChores.map(c => ({
        id: c.id,
        title: c.title,
        estimatedMinutes: c.estimatedMinutes || 30,
      })),
    });
    
    res.json(optimization);
  } catch (error) {
    console.error('Chore optimization error:', error);
    res.status(500).json({ error: 'Errore nell\'ottimizzazione' });
  }
});

// GET FAMILY INSIGHTS
router.get('/:familyId/insights', authenticate, async (req: Request, res: Response) => {
  try {
    const { familyId } = req.params;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    const savedInsights = await db.select()
      .from(aiInsights)
      .where(and(
        eq(aiInsights.familyId, familyId),
        eq(aiInsights.dismissed, false)
      ))
      .orderBy(desc(aiInsights.createdAt))
      .limit(5);
    
    res.json(savedInsights);
  } catch (error) {
    res.status(500).json({ error: 'Errore nel recupero insights' });
  }
});

// GENERATE NEW INSIGHTS
router.post('/:familyId/insights/generate', authenticate, async (req: Request, res: Response) => {
  try {
    const { familyId } = req.params;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    const members = await db.select().from(familyMembers).where(eq(familyMembers.familyId, familyId));
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const weekAgo = sevenDaysAgo.toISOString().split('T')[0];
    
    const events = await db.select()
      .from(calendarEvents)
      .where(and(
        eq(calendarEvents.familyId, familyId),
        gte(calendarEvents.date, weekAgo)
      ));
    
    const completedChores = await db.select()
      .from(chores)
      .where(and(
        eq(chores.familyId, familyId),
        eq(chores.isCompleted, true),
        gte(chores.completedAt, sevenDaysAgo)
      ));
    
    const pendingChores = await db.select()
      .from(chores)
      .where(and(
        eq(chores.familyId, familyId),
        eq(chores.isCompleted, false)
      ));
    
    const topMember = members.reduce((top, m) => 
      (m.points || 0) > (top.points || 0) ? m : top, members[0]);
    
    const insights = await generateFamilyInsights({
      events: events.length,
      completedChores: completedChores.length,
      pendingChores: pendingChores.length,
      topContributor: topMember?.nickname || 'Nessuno',
      weeklyPoints: completedChores.reduce((sum, c) => sum + (c.points || 0), 0),
    });
    
    const savedInsights = [];
    for (const insight of insights.insights || []) {
      const [saved] = await db.insert(aiInsights).values({
        familyId,
        type: insight.type || 'suggestion',
        title: insight.title,
        description: insight.description,
      }).returning();
      savedInsights.push(saved);
    }
    
    res.json(savedInsights);
  } catch (error) {
    console.error('Generate insights error:', error);
    res.status(500).json({ error: 'Errore nella generazione insights' });
  }
});

// DISMISS INSIGHT
router.patch('/:familyId/insights/:insightId/dismiss', authenticate, async (req: Request, res: Response) => {
  try {
    const { familyId, insightId } = req.params;
    
    if (!await checkFamilyAccess(req.user!.userId, familyId)) {
      return res.status(403).json({ error: 'Non autorizzato' });
    }
    
    await db.update(aiInsights)
      .set({ dismissed: true })
      .where(eq(aiInsights.id, insightId));
    
    res.json({ message: 'Insight nascosto' });
  } catch (error) {
    res.status(500).json({ error: 'Errore' });
  }
});

export default router;
