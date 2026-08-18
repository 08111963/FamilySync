import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { expenses, familyBudgets, billPaymentHistory } from '../../shared/schema';
import { eq, and, sql, desc, gte, lt } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { requireFamilyMember } from '../middleware/family';
import { getParam } from '../lib/http-params';
import { broadcastToFamily } from '../lib/websocket';
import { logger } from '../lib/logger';

const router = Router();

// Categorie di spesa canoniche (il client mostra le etichette in italiano).
export const EXPENSE_CATEGORIES = [
  'alimentari',
  'trasporti',
  'svago',
  'salute',
  'casa',
  'abbigliamento',
  'istruzione',
  'altro',
] as const;

// 'bollette' è una categoria calcolata (dallo storico pagamenti bollette),
// non registrabile a mano — ma può avere un tetto di budget.
const BUDGET_CATEGORIES = ['total', 'bollette', ...EXPENSE_CATEGORIES] as const;

/** Valida che la stringa YYYY-MM-DD sia una data reale. */
function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d;
}

const expenseSchema = z.object({
  amount: z.number().positive('L\'importo deve essere maggiore di zero').max(1000000),
  category: z.enum(EXPENSE_CATEGORIES),
  description: z.string().trim().max(255).optional().nullable(),
  date: z.string().refine(isRealDate, 'Data non valida (YYYY-MM-DD)'),
});

const budgetSchema = z.object({
  category: z.enum(BUDGET_CATEGORIES),
  // null/0 = rimuovi il tetto
  monthlyLimit: z.number().min(0).max(10000000).nullable(),
});

/** Ritorna [inizio, fine) del mese YYYY-MM; null se il formato non è valido. */
function monthRange(month: string): { start: string; end: string } | null {
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const start = `${m[1]}-${m[2]}-01`;
  const nextY = mo === 12 ? y + 1 : y;
  const nextM = mo === 12 ? 1 : mo + 1;
  const end = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  return { start, end };
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Riepilogo mensile: totali per categoria (spese registrate + bollette pagate
 * nel mese dallo storico pagamenti), tetti di budget e trend degli ultimi 6 mesi.
 * Riutilizzato sia dalla rotta /summary sia dall'endpoint AI budget-insights.
 */
export async function getBudgetSummary(familyId: string, month: string) {
  const range = monthRange(month);
  if (!range) return null;

  const byCategory = await db
    .select({
      category: expenses.category,
      total: sql<string>`SUM(${expenses.amount})`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(expenses)
    .where(and(
      eq(expenses.familyId, familyId),
      gte(expenses.date, range.start),
      lt(expenses.date, range.end),
    ))
    .groupBy(expenses.category);

  // Bollette pagate nel mese (storico pagamenti, con importo registrato).
  const [billsRow] = await db
    .select({
      total: sql<string | null>`SUM(${billPaymentHistory.amount})`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(billPaymentHistory)
    .where(and(
      eq(billPaymentHistory.familyId, familyId),
      gte(billPaymentHistory.paidAt, new Date(range.start + 'T00:00:00Z')),
      lt(billPaymentHistory.paidAt, new Date(range.end + 'T00:00:00Z')),
    ));

  const categories: Record<string, { total: number; count: number }> = {};
  for (const row of byCategory) {
    categories[row.category] = { total: Number(row.total || 0), count: row.count };
  }
  const billsTotal = Number(billsRow?.total || 0);
  if (billsTotal > 0 || (billsRow?.count || 0) > 0) {
    categories['bollette'] = { total: billsTotal, count: billsRow?.count || 0 };
  }

  const total = Object.values(categories).reduce((s, c) => s + c.total, 0);

  const budgets = await db
    .select()
    .from(familyBudgets)
    .where(eq(familyBudgets.familyId, familyId));

  // Trend: totale spese (incluse bollette) degli ultimi 6 mesi, mese corrente incluso.
  const trendStartDate = new Date(range.start + 'T00:00:00Z');
  trendStartDate.setUTCMonth(trendStartDate.getUTCMonth() - 5);
  const trendStart = trendStartDate.toISOString().slice(0, 10);

  const expenseTrend = await db
    .select({
      month: sql<string>`to_char(${expenses.date}, 'YYYY-MM')`,
      total: sql<string>`SUM(${expenses.amount})`,
    })
    .from(expenses)
    .where(and(
      eq(expenses.familyId, familyId),
      gte(expenses.date, trendStart),
      lt(expenses.date, range.end),
    ))
    .groupBy(sql`to_char(${expenses.date}, 'YYYY-MM')`);

  const billsTrend = await db
    .select({
      month: sql<string>`to_char(${billPaymentHistory.paidAt}, 'YYYY-MM')`,
      total: sql<string>`SUM(${billPaymentHistory.amount})`,
    })
    .from(billPaymentHistory)
    .where(and(
      eq(billPaymentHistory.familyId, familyId),
      gte(billPaymentHistory.paidAt, new Date(trendStart + 'T00:00:00Z')),
      lt(billPaymentHistory.paidAt, new Date(range.end + 'T00:00:00Z')),
    ))
    .groupBy(sql`to_char(${billPaymentHistory.paidAt}, 'YYYY-MM')`);

  const trendMap = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(range.start + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() - i);
    trendMap.set(d.toISOString().slice(0, 7), 0);
  }
  for (const row of expenseTrend) {
    if (trendMap.has(row.month)) trendMap.set(row.month, (trendMap.get(row.month) || 0) + Number(row.total || 0));
  }
  for (const row of billsTrend) {
    if (trendMap.has(row.month)) trendMap.set(row.month, (trendMap.get(row.month) || 0) + Number(row.total || 0));
  }
  const trend = [...trendMap.entries()].map(([m, t]) => ({ month: m, total: Math.round(t * 100) / 100 }));

  return {
    month,
    total: Math.round(total * 100) / 100,
    categories,
    budgets: budgets.map(b => ({ category: b.category, monthlyLimit: Number(b.monthlyLimit) })),
    trend,
  };
}

// Riepilogo mensile (default: mese corrente). ?month=YYYY-MM
router.get('/:familyId/summary', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const month = typeof req.query.month === 'string' ? req.query.month : currentMonth();
    const summary = await getBudgetSummary(familyId, month);
    if (!summary) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Mese non valido (YYYY-MM)' } });
    }
    res.json(summary);
  } catch (error) {
    logger.error('Budget summary error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore nel riepilogo del budget' } });
  }
});

// Lista spese del mese (default: mese corrente). ?month=YYYY-MM
router.get('/:familyId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const month = typeof req.query.month === 'string' ? req.query.month : currentMonth();
    const range = monthRange(month);
    if (!range) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Mese non valido (YYYY-MM)' } });
    }
    const items = await db
      .select()
      .from(expenses)
      .where(and(
        eq(expenses.familyId, familyId),
        gte(expenses.date, range.start),
        lt(expenses.date, range.end),
      ))
      .orderBy(desc(expenses.date), desc(expenses.createdAt))
      .limit(500);
    res.json({ items });
  } catch (error) {
    logger.error('List expenses error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore nel recupero delle spese' } });
  }
});

router.post('/:familyId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const parsed = expenseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Dati non validi', details: parsed.error.flatten().fieldErrors },
      });
    }
    const membership = (req as any).membership as { id: string };
    // La spesa è sempre attribuita al membro autenticato: mai fidarsi di un
    // memberId dal client (rischio attribuzione cross-family).
    const [created] = await db.insert(expenses).values({
      familyId,
      memberId: membership.id,
      amount: String(parsed.data.amount),
      category: parsed.data.category,
      description: parsed.data.description?.trim() || null,
      date: parsed.data.date,
      createdBy: req.user!.userId,
    }).returning();

    broadcastToFamily(familyId, 'expenses_updated', { item: created });
    res.status(201).json(created);
  } catch (error) {
    logger.error('Create expense error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: "Errore nell'aggiunta della spesa" } });
  }
});

/**
 * Verifica che la spesa esista nella famiglia e che il chiamante possa
 * modificarla/eliminarla: solo il membro che l'ha registrata, oppure un admin.
 * Risponde 404/403 e ritorna true se l'accesso è negato.
 */
async function checkExpenseOwnership(
  expenseId: string,
  familyId: string,
  membership: { id: string; role: string },
  res: Response,
): Promise<boolean> {
  const [existing] = await db
    .select({ memberId: expenses.memberId })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.familyId, familyId)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Spesa non trovata' } });
    return true;
  }
  if (existing.memberId !== membership.id && membership.role !== 'admin') {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Puoi modificare solo le spese registrate da te' },
    });
    return true;
  }
  return false;
}

router.put('/:familyId/:expenseId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const expenseId = getParam(req, 'expenseId');
    const parsed = expenseSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Dati non validi', details: parsed.error.flatten().fieldErrors },
      });
    }
    const membership = (req as any).membership as { id: string; role: string };
    const denied = await checkExpenseOwnership(expenseId, familyId, membership, res);
    if (denied) return;

    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (parsed.data.amount !== undefined) updateData.amount = String(parsed.data.amount);
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category;
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description?.trim() || null;
    if (parsed.data.date !== undefined) updateData.date = parsed.data.date;

    const [item] = await db.update(expenses)
      .set(updateData)
      .where(and(eq(expenses.id, expenseId), eq(expenses.familyId, familyId)))
      .returning();
    if (!item) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Spesa non trovata' } });
    }
    broadcastToFamily(familyId, 'expenses_updated', { item });
    res.json(item);
  } catch (error) {
    logger.error('Update expense error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: "Errore nell'aggiornamento della spesa" } });
  }
});

router.delete('/:familyId/:expenseId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const expenseId = getParam(req, 'expenseId');
    const membership = (req as any).membership as { id: string; role: string };
    const denied = await checkExpenseOwnership(expenseId, familyId, membership, res);
    if (denied) return;

    const [deleted] = await db.delete(expenses)
      .where(and(eq(expenses.id, expenseId), eq(expenses.familyId, familyId)))
      .returning();
    if (!deleted) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Spesa non trovata' } });
    }
    broadcastToFamily(familyId, 'expenses_updated', { removedId: expenseId });
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete expense error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: "Errore nell'eliminazione della spesa" } });
  }
});

// Imposta o rimuove un tetto di budget. Solo admin e adulti.
router.put('/:familyId/budget/limit', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const membership = (req as any).membership as { role: string };
    if (membership.role !== 'admin' && membership.role !== 'adult') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Solo admin e adulti possono impostare il budget' },
      });
    }
    const parsed = budgetSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Dati non validi', details: parsed.error.flatten().fieldErrors },
      });
    }

    if (parsed.data.monthlyLimit == null || parsed.data.monthlyLimit <= 0) {
      await db.delete(familyBudgets)
        .where(and(eq(familyBudgets.familyId, familyId), eq(familyBudgets.category, parsed.data.category)));
      broadcastToFamily(familyId, 'expenses_updated', { budgetRemoved: parsed.data.category });
      return res.json({ success: true, removed: true });
    }

    // Upsert atomico sul vincolo univoco (family_id, category).
    const [saved] = await db.insert(familyBudgets)
      .values({
        familyId,
        category: parsed.data.category,
        monthlyLimit: String(parsed.data.monthlyLimit),
      })
      .onConflictDoUpdate({
        target: [familyBudgets.familyId, familyBudgets.category],
        set: { monthlyLimit: String(parsed.data.monthlyLimit), updatedAt: new Date() },
      })
      .returning();

    broadcastToFamily(familyId, 'expenses_updated', { budget: saved });
    res.json(saved);
  } catch (error) {
    logger.error('Set budget error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: "Errore nell'impostazione del budget" } });
  }
});

export default router;
