import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { z } from 'zod';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { db } from '../db';
import {
  bills,
  billSplits,
  billAttachments,
  billPaymentHistory,
  familyMembers,
  users,
  calendarEvents,
} from '../../shared/schema';
import { getParam } from '../lib/http-params';
import { requireFamilyMember } from '../middleware/family';
import { isPremium, getPlanForFamily } from '../lib/entitlements';
import { broadcastToFamily } from '../lib/websocket';
import { logger } from '../lib/logger';
import {
  computeBillStatus,
  computeBillReminders,
  canCreateBill,
  splitEqually,
  type BillStoredStatus,
} from '../lib/bills';
import {
  buildStoredFilename,
  verifyMagicBytes,
  readMagicBytes,
  resolveSafeUploadPath,
  MAX_UPLOAD_BYTES,
} from './chat';

const router = Router();

// Bollette: accettiamo solo PDF e immagini (no documenti Word).
const BILL_ALLOWED_MIMES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

const uploadsDir = path.resolve('uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const name = crypto.randomBytes(16).toString('hex');
    cb(null, buildStoredFilename(file.mimetype, name));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (BILL_ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo di file non supportato'));
    }
  },
});

function handleUploadError(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: 'File troppo grande (max 10MB)' } });
    }
    return res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: 'Errore nel caricamento del file' } });
  }
  return res.status(415).json({ error: { code: 'UNSUPPORTED_TYPE', message: 'Tipo di file non supportato (solo PDF o immagini)' } });
}

// Gate Premium: le funzioni avanzate (allegati, ricevute, ripartizioni, storico)
// richiedono un abbonamento Premium attivo. isPremium è fail-closed.
function requirePremium() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const familyId = getParam(req, 'familyId');
    const premium = await isPremium(familyId);
    if (!premium) {
      return res.status(403).json({
        error: { code: 'PREMIUM_REQUIRED', message: 'Questa funzione è disponibile solo con Premium' },
      });
    }
    next();
  };
}

// True solo se la stringa è una data ISO reale del calendario (no rollover, es. 2026-13-40).
function isRealIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

const ISO_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** True se è un promemoria valido: data reale con orario (AAAA-MM-GGTHH:MM) o solo data. */
function isRealReminderValue(s: string): boolean {
  const dt = ISO_DATETIME_RE.exec(s);
  if (dt) {
    const hour = Number(dt[4]);
    const minute = Number(dt[5]);
    if (hour > 23 || minute > 59) return false;
    return isRealIsoDate(`${dt[1]}-${dt[2]}-${dt[3]}`);
  }
  return isRealIsoDate(s);
}

const customReminderDatesSchema = z
  .array(z.string().refine(isRealReminderValue, 'Promemoria non valido (data o data+ora)'))
  .max(20, 'Massimo 20 promemoria')
  .optional()
  .transform((v) => (v ? Array.from(new Set(v)).sort() : v));

const createBillSchema = z.object({
  title: z.string().min(1, 'Il titolo è obbligatorio'),
  provider: z.string().optional(),
  category: z.enum(['luce', 'gas', 'acqua', 'telefono', 'scuola', 'assicurazione', 'tasse', 'altro']).optional().default('altro'),
  amount: z.number().nonnegative('Importo non valido'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data scadenza non valida (AAAA-MM-GG)').optional(),
  holder: z.string().optional(),
  assignedTo: z.string().uuid().optional().nullable(),
  notes: z.string().optional(),
  remindersEnabled: z.boolean().optional().default(true),
  // Date promemoria personalizzate (ISO AAAA-MM-GG): deduplicate e ordinate.
  customReminderDates: customReminderDatesSchema,
  // Bolletta registrata come GIÀ pagata: paid=true + data di pagamento.
  // In questo caso la scadenza è facoltativa (default: la data di pagamento).
  paid: z.boolean().optional().default(false),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data pagamento non valida (AAAA-MM-GG)').optional(),
}).superRefine((data, ctx) => {
  if (!data.paid && !data.dueDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dueDate'], message: 'Data scadenza obbligatoria' });
  }
  if (data.paid && !data.paidAt && !data.dueDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paidAt'], message: 'Data pagamento obbligatoria' });
  }
});

const updateBillSchema = z.object({
  title: z.string().min(1).optional(),
  provider: z.string().nullable().optional(),
  category: z.enum(['luce', 'gas', 'acqua', 'telefono', 'scuola', 'assicurazione', 'tasse', 'altro']).optional(),
  amount: z.number().nonnegative().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  holder: z.string().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  remindersEnabled: z.boolean().optional(),
  customReminderDates: customReminderDatesSchema,
  // Data di pagamento (AAAA-MM-GG): modificabile solo per bollette già pagate.
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

// Verifica che il membro assegnato (assignedTo) appartenga alla stessa famiglia.
async function assignedToBelongsToFamily(assignedTo: string, familyId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: familyMembers.id })
    .from(familyMembers)
    .where(and(eq(familyMembers.id, assignedTo), eq(familyMembers.familyId, familyId)))
    .limit(1);
  return !!row;
}

// --- Sincronizzazione con il calendario famiglia ---------------------------
// Ogni bolletta "da pagare" ha un evento tutto-il-giorno alla data di scadenza,
// cosi' compare nel calendario dell'app, nel feed ICS (Google/Apple Calendar)
// e puo' essere salvata sul telefono. L'evento viene aggiornato se cambia la
// bolletta e rimosso quando viene pagata o eliminata. Gli errori di sync non
// bloccano mai l'operazione principale sulla bolletta (best-effort + log).

const BILL_EVENT_COLOR = '#F59E0B';

function billEventFields(bill: { title: string; provider?: string | null; amount: string; dueDate: string }) {
  const parts: string[] = [];
  if (bill.provider) parts.push(`Fornitore: ${bill.provider}`);
  parts.push(`Importo: €${bill.amount}`);
  parts.push('Creato automaticamente dalla sezione Bollette');
  return {
    title: `Scadenza bolletta: ${bill.title}`,
    description: parts.join('\n'),
    date: bill.dueDate,
    time: null as string | null,
    endTime: null as string | null,
    allDay: true,
    category: 'other' as const,
    color: BILL_EVENT_COLOR,
  };
}

/** Crea l'evento calendario per una bolletta e collega bills.calendarEventId. Ritorna la bolletta aggiornata. */
async function createBillCalendarEvent(
  bill: typeof bills.$inferSelect,
  userId: string
): Promise<typeof bills.$inferSelect> {
  try {
    const [event] = await db
      .insert(calendarEvents)
      .values({
        familyId: bill.familyId,
        ...billEventFields(bill),
        createdBy: userId,
      })
      .returning();
    // Check-and-set atomico: collega l'evento solo se la bolletta non ne ha
    // gia' uno (richieste concorrenti non devono creare eventi duplicati).
    const [updated] = await db
      .update(bills)
      .set({ calendarEventId: event.id })
      .where(and(eq(bills.id, bill.id), isNull(bills.calendarEventId)))
      .returning();
    if (!updated) {
      // Un'altra richiesta ha gia' collegato un evento: rimuovi il duplicato.
      await db.delete(calendarEvents).where(eq(calendarEvents.id, event.id));
      const [current] = await db.select().from(bills).where(eq(bills.id, bill.id)).limit(1);
      return current ?? bill;
    }
    broadcastToFamily(bill.familyId, 'event_created', event);
    return updated;
  } catch (error) {
    logger.warn('Bill calendar sync (create) failed', { billId: bill.id, error: String(error) });
    return bill;
  }
}

/** Aggiorna l'evento calendario collegato (titolo/data/descrizione). */
async function updateBillCalendarEvent(bill: typeof bills.$inferSelect): Promise<void> {
  if (!bill.calendarEventId) return;
  try {
    const [event] = await db
      .update(calendarEvents)
      .set({ ...billEventFields(bill), updatedAt: new Date() })
      .where(and(eq(calendarEvents.id, bill.calendarEventId), eq(calendarEvents.familyId, bill.familyId)))
      .returning();
    if (event) broadcastToFamily(bill.familyId, 'event_updated', event);
  } catch (error) {
    logger.warn('Bill calendar sync (update) failed', { billId: bill.id, error: String(error) });
  }
}

/** Elimina l'evento calendario collegato (bolletta pagata o eliminata). */
async function deleteBillCalendarEvent(
  familyId: string,
  billId: string,
  calendarEventId: string | null
): Promise<void> {
  if (!calendarEventId) return;
  try {
    await db
      .delete(calendarEvents)
      .where(and(eq(calendarEvents.id, calendarEventId), eq(calendarEvents.familyId, familyId)));
    await db.update(bills).set({ calendarEventId: null }).where(eq(bills.id, billId));
    broadcastToFamily(familyId, 'event_deleted', { eventId: calendarEventId });
  } catch (error) {
    logger.warn('Bill calendar sync (delete) failed', { billId, error: String(error) });
  }
}

function serializeBill(bill: typeof bills.$inferSelect) {
  return {
    ...bill,
    computedStatus: computeBillStatus({ status: bill.status as BillStoredStatus, dueDate: bill.dueDate }),
  };
}

// GET /:familyId — elenco bollette della famiglia (con stato calcolato).
router.get('/:familyId', requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const rows = await db
      .select()
      .from(bills)
      .where(eq(bills.familyId, familyId))
      .orderBy(desc(bills.dueDate));
    res.json(rows.map(serializeBill));
  } catch (error) {
    logger.error('Get bills error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore nel recupero delle bollette' } });
  }
});

// GET /:familyId/reminders — promemoria calcolati per le bollette non pagate.
router.get('/:familyId/reminders', requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const plan = await getPlanForFamily(familyId);
    const rows = await db
      .select()
      .from(bills)
      .where(and(eq(bills.familyId, familyId), eq(bills.status, 'da_pagare')));

    const reminders = rows.flatMap((bill) =>
      computeBillReminders({
        dueDate: bill.dueDate,
        remindersEnabled: bill.remindersEnabled,
        plan,
        status: bill.status as BillStoredStatus,
      }).map((r) => ({
        billId: bill.id,
        billTitle: bill.title,
        dueDate: bill.dueDate,
        ...r,
      })),
    );

    res.json(reminders);
  } catch (error) {
    logger.error('Get bill reminders error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore nel recupero dei promemoria' } });
  }
});

// GET /:familyId/:billId — dettaglio (bolletta + ripartizioni + allegati + storico + promemoria).
router.get('/:familyId/:billId', requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const billId = getParam(req, 'billId');

    const [bill] = await db
      .select()
      .from(bills)
      .where(and(eq(bills.id, billId), eq(bills.familyId, familyId)))
      .limit(1);

    if (!bill) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Bolletta non trovata' } });
    }

    const plan = await getPlanForFamily(familyId);
    const isPremiumPlan = plan === 'premium';

    // Funzioni Premium (ripartizioni, allegati, storico) gated lato server:
    // il backend resta l'unica fonte di verità fail-closed, anche in lettura.
    const splits = isPremiumPlan
      ? await db
          .select({
            id: billSplits.id,
            memberId: billSplits.memberId,
            amount: billSplits.amount,
            isPaid: billSplits.isPaid,
            memberName: familyMembers.nickname,
            memberColor: familyMembers.color,
          })
          .from(billSplits)
          .leftJoin(familyMembers, eq(billSplits.memberId, familyMembers.id))
          .where(eq(billSplits.billId, billId))
      : [];

    const attachments = isPremiumPlan
      ? await db
          .select()
          .from(billAttachments)
          .where(eq(billAttachments.billId, billId))
          .orderBy(desc(billAttachments.createdAt))
      : [];

    const history = plan === 'premium'
      ? await db
          .select({
            id: billPaymentHistory.id,
            amount: billPaymentHistory.amount,
            note: billPaymentHistory.note,
            paidAt: billPaymentHistory.paidAt,
            paidByUserId: billPaymentHistory.paidByUserId,
            paidByName: users.name,
          })
          .from(billPaymentHistory)
          .leftJoin(users, eq(billPaymentHistory.paidByUserId, users.id))
          .where(eq(billPaymentHistory.billId, billId))
          .orderBy(desc(billPaymentHistory.paidAt))
      : [];

    const reminders = computeBillReminders({
      dueDate: bill.dueDate,
      remindersEnabled: bill.remindersEnabled,
      plan,
      status: bill.status as BillStoredStatus,
    });

    res.json({ ...serializeBill(bill), splits, attachments, history, reminders });
  } catch (error) {
    logger.error('Get bill detail error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore nel recupero della bolletta' } });
  }
});

// POST /:familyId — crea bolletta (limite Free: max 5 attive).
router.post('/:familyId', requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const parsed = createBillSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Dati non validi', details: parsed.error.flatten().fieldErrors },
      });
    }

    if (parsed.data.assignedTo) {
      const ok = await assignedToBelongsToFamily(parsed.data.assignedTo, familyId);
      if (!ok) {
        return res.status(400).json({
          error: { code: 'INVALID_MEMBER', message: 'Il membro assegnato non appartiene a questa famiglia' },
        });
      }
    }

    const createAsPaid = parsed.data.paid === true;

    // Il limite Free riguarda solo le bollette ATTIVE (da pagare):
    // registrare una bolletta già pagata non lo consuma.
    if (!createAsPaid) {
      const plan = await getPlanForFamily(familyId);
      const activeRows = await db
        .select({ id: bills.id })
        .from(bills)
        .where(and(eq(bills.familyId, familyId), eq(bills.status, 'da_pagare')));

      if (!canCreateBill(plan, activeRows.length)) {
        return res.status(403).json({
          error: {
            code: 'FREE_LIMIT_REACHED',
            message: 'Hai raggiunto il limite di 5 bollette attive del piano Free. Passa a Premium per bollette illimitate.',
          },
        });
      }
    }

    // Per una bolletta già pagata: data pagamento = paidAt (o scadenza se assente);
    // la scadenza, se non indicata, coincide con la data di pagamento.
    const paidDateStr = parsed.data.paidAt ?? parsed.data.dueDate ?? new Date().toISOString().slice(0, 10);
    const dueDate = parsed.data.dueDate ?? paidDateStr;

    const [created] = await db
      .insert(bills)
      .values({
        familyId,
        title: parsed.data.title,
        provider: parsed.data.provider,
        category: parsed.data.category,
        amount: parsed.data.amount.toFixed(2),
        dueDate,
        holder: parsed.data.holder,
        assignedTo: parsed.data.assignedTo ?? null,
        notes: parsed.data.notes,
        remindersEnabled: parsed.data.remindersEnabled,
        customReminderDates: parsed.data.customReminderDates ?? [],
        createdBy: req.user!.userId,
        ...(createAsPaid
          ? {
              status: 'pagata' as const,
              paidAt: new Date(`${paidDateStr}T12:00:00.000Z`),
              paidBy: req.user!.userId,
            }
          : {}),
      })
      .returning();

    let bill = created;
    if (createAsPaid) {
      // Storico pagamenti coerente con PATCH /pay.
      await db.insert(billPaymentHistory).values({
        billId: created.id,
        familyId,
        paidByUserId: req.user!.userId,
        amount: parsed.data.amount.toFixed(2),
      });
    } else {
      // Sincronizza col calendario: evento tutto-il-giorno alla scadenza
      // (solo per bollette da pagare: quelle pagate non vanno in calendario).
      bill = await createBillCalendarEvent(created, req.user!.userId);
    }

    broadcastToFamily(familyId, 'bill_created', serializeBill(bill));
    res.status(201).json(serializeBill(bill));
  } catch (error) {
    logger.error('Create bill error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore nella creazione della bolletta' } });
  }
});

// PUT /:familyId/:billId — aggiorna bolletta.
router.put('/:familyId/:billId', requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const billId = getParam(req, 'billId');
    const parsed = updateBillSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Dati non validi', details: parsed.error.flatten().fieldErrors },
      });
    }

    if (parsed.data.assignedTo) {
      const ok = await assignedToBelongsToFamily(parsed.data.assignedTo, familyId);
      if (!ok) {
        return res.status(400).json({
          error: { code: 'INVALID_MEMBER', message: 'Il membro assegnato non appartiene a questa famiglia' },
        });
      }
    }

    const { paidAt: paidAtInput, ...updateFields } = parsed.data;
    const updateData: Record<string, any> = { ...updateFields, updatedAt: new Date() };
    if (parsed.data.amount !== undefined) {
      updateData.amount = parsed.data.amount.toFixed(2);
    }

    // La data di pagamento si può correggere solo su bollette già pagate.
    if (paidAtInput !== undefined) {
      const [current] = await db
        .select({ status: bills.status })
        .from(bills)
        .where(and(eq(bills.id, billId), eq(bills.familyId, familyId)))
        .limit(1);
      if (!current) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Bolletta non trovata' } });
      }
      if (current.status !== 'pagata') {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'La data di pagamento è modificabile solo per bollette pagate' },
        });
      }
      updateData.paidAt = new Date(`${paidAtInput}T12:00:00.000Z`);
    }

    // Se si aggiorna paidAt, il vincolo di stato è parte della query (nessuna
    // finestra tra il check precedente e l'update: se nel frattempo la bolletta
    // torna "da pagare", l'update non tocca nulla).
    const whereConditions = [eq(bills.id, billId), eq(bills.familyId, familyId)];
    if (paidAtInput !== undefined) {
      whereConditions.push(eq(bills.status, 'pagata'));
    }

    let [bill] = await db
      .update(bills)
      .set(updateData)
      .where(and(...whereConditions))
      .returning();

    if (!bill) {
      if (paidAtInput !== undefined) {
        return res.status(409).json({
          error: { code: 'CONFLICT', message: 'La bolletta non è più pagata: riprova dopo aver aggiornato la pagina' },
        });
      }
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Bolletta non trovata' } });
    }

    // Sincronizza l'evento calendario: aggiorna se esiste, altrimenti
    // crealo per le bollette "da pagare" (es. bollette create prima della sync).
    if (bill.calendarEventId) {
      await updateBillCalendarEvent(bill);
    } else if (bill.status === 'da_pagare') {
      bill = await createBillCalendarEvent(bill, req.user!.userId);
    }

    broadcastToFamily(familyId, 'bill_updated', serializeBill(bill));
    res.json(serializeBill(bill));
  } catch (error) {
    logger.error('Update bill error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: "Errore nell'aggiornamento della bolletta" } });
  }
});

// PATCH /:familyId/:billId/pay — segna come pagata (o annulla). Registra lo storico.
const paySchema = z.object({
  paid: z.boolean().optional().default(true),
  amount: z.number().nonnegative().optional(),
  note: z.string().optional(),
}).strict();

router.patch('/:familyId/:billId/pay', requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const billId = getParam(req, 'billId');
    const parsed = paySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Dati non validi', details: parsed.error.flatten().fieldErrors },
      });
    }

    const [existing] = await db
      .select()
      .from(bills)
      .where(and(eq(bills.id, billId), eq(bills.familyId, familyId)))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Bolletta non trovata' } });
    }

    const markPaid = parsed.data.paid;

    // Anti-aggiramento limite Free: riportare una bolletta pagata a "da_pagare"
    // non deve permettere di superare il limite di bollette attive del piano Free.
    // Se è già "da_pagare" non si conta due volte (nessun controllo).
    if (!markPaid && existing.status !== 'da_pagare') {
      const plan = await getPlanForFamily(familyId);
      const activeRows = await db
        .select({ id: bills.id })
        .from(bills)
        .where(and(eq(bills.familyId, familyId), eq(bills.status, 'da_pagare')));
      if (!canCreateBill(plan, activeRows.length)) {
        return res.status(403).json({
          error: {
            code: 'FREE_LIMIT_REACHED',
            message: 'Hai raggiunto il limite di 5 bollette attive del piano Free. Passa a Premium per bollette illimitate.',
          },
        });
      }
    }

    let [bill] = await db
      .update(bills)
      .set({
        status: markPaid ? 'pagata' : 'da_pagare',
        paidAt: markPaid ? new Date() : null,
        paidBy: markPaid ? req.user!.userId : null,
        updatedAt: new Date(),
      })
      .where(and(eq(bills.id, billId), eq(bills.familyId, familyId)))
      .returning();

    // Sincronizza il calendario: pagata → rimuovi l'evento scadenza;
    // riportata a "da pagare" → ricrea l'evento.
    if (markPaid) {
      await deleteBillCalendarEvent(familyId, billId, bill.calendarEventId);
      bill = { ...bill, calendarEventId: null };
    } else if (!bill.calendarEventId) {
      bill = await createBillCalendarEvent(bill, req.user!.userId);
    }

    if (markPaid) {
      await db.insert(billPaymentHistory).values({
        billId,
        familyId,
        paidByUserId: req.user!.userId,
        amount: (parsed.data.amount ?? Number(existing.amount)).toFixed(2),
        note: parsed.data.note,
      });
    }

    broadcastToFamily(familyId, 'bill_updated', serializeBill(bill));
    res.json(serializeBill(bill));
  } catch (error) {
    logger.error('Pay bill error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore nel segnare la bolletta come pagata' } });
  }
});

// DELETE /:familyId/:billId — elimina bolletta (e file allegati su disco).
router.delete('/:familyId/:billId', requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const billId = getParam(req, 'billId');

    const [bill] = await db
      .select({ id: bills.id, calendarEventId: bills.calendarEventId })
      .from(bills)
      .where(and(eq(bills.id, billId), eq(bills.familyId, familyId)))
      .limit(1);

    if (!bill) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Bolletta non trovata' } });
    }

    // Rimuovi l'evento calendario collegato prima di eliminare la bolletta.
    await deleteBillCalendarEvent(familyId, billId, bill.calendarEventId);

    const attachments = await db
      .select({ fileUrl: billAttachments.fileUrl })
      .from(billAttachments)
      .where(eq(billAttachments.billId, billId));

    for (const att of attachments) {
      const safePath = resolveSafeUploadPath(att.fileUrl);
      if (safePath) fs.unlink(safePath, () => {});
    }

    await db.delete(bills).where(and(eq(bills.id, billId), eq(bills.familyId, familyId)));

    broadcastToFamily(familyId, 'bill_deleted', { billId });
    res.json({ message: 'Bolletta eliminata' });
  } catch (error) {
    logger.error('Delete bill error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: "Errore nell'eliminazione della bolletta" } });
  }
});

// PUT /:familyId/:billId/splits — imposta la ripartizione (Premium).
const splitsSchema = z.object({
  type: z.enum(['equal', 'custom']),
  memberIds: z.array(z.string().uuid()).optional(),
  splits: z.array(z.object({ memberId: z.string().uuid(), amount: z.number().nonnegative() })).optional(),
}).strict();

router.put('/:familyId/:billId/splits', requireFamilyMember(), requirePremium(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const billId = getParam(req, 'billId');
    const parsed = splitsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Dati non validi', details: parsed.error.flatten().fieldErrors },
      });
    }

    const [bill] = await db
      .select()
      .from(bills)
      .where(and(eq(bills.id, billId), eq(bills.familyId, familyId)))
      .limit(1);

    if (!bill) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Bolletta non trovata' } });
    }

    let rows: { memberId: string; amount: string }[] = [];

    if (parsed.data.type === 'equal') {
      const memberIds = parsed.data.memberIds ?? [];
      if (memberIds.length === 0) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Seleziona almeno un membro' } });
      }
      const shares = splitEqually(Number(bill.amount), memberIds.length);
      rows = memberIds.map((memberId, i) => ({ memberId, amount: shares[i] }));
    } else {
      const splits = parsed.data.splits ?? [];
      if (splits.length === 0) {
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Inserisci almeno una quota' } });
      }
      const splitTotal = splits.reduce((sum, s) => sum + s.amount, 0);
      // La somma delle quote deve coincidere con l'importo (tolleranza 1 centesimo).
      if (Math.abs(splitTotal - Number(bill.amount)) > 0.01) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'La somma delle quote deve essere uguale all\u2019importo della bolletta',
          },
        });
      }
      rows = splits.map((s) => ({ memberId: s.memberId, amount: s.amount.toFixed(2) }));
    }

    // Verifica che i membri appartengano alla famiglia.
    const familyMemberRows = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(eq(familyMembers.familyId, familyId));
    const validIds = new Set(familyMemberRows.map((m) => m.id));
    if (rows.some((r) => !validIds.has(r.memberId))) {
      return res.status(400).json({ error: { code: 'INVALID_MEMBER', message: 'Membro non valido per questa famiglia' } });
    }

    await db.delete(billSplits).where(eq(billSplits.billId, billId));
    if (rows.length > 0) {
      await db.insert(billSplits).values(rows.map((r) => ({ billId, memberId: r.memberId, amount: r.amount })));
    }
    await db.update(bills).set({ splitType: parsed.data.type, updatedAt: new Date() }).where(eq(bills.id, billId));

    const splits = await db
      .select({
        id: billSplits.id,
        memberId: billSplits.memberId,
        amount: billSplits.amount,
        isPaid: billSplits.isPaid,
        memberName: familyMembers.nickname,
        memberColor: familyMembers.color,
      })
      .from(billSplits)
      .leftJoin(familyMembers, eq(billSplits.memberId, familyMembers.id))
      .where(eq(billSplits.billId, billId));

    broadcastToFamily(familyId, 'bill_updated', { billId });
    res.json({ splitType: parsed.data.type, splits });
  } catch (error) {
    logger.error('Set bill splits error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore nella ripartizione' } });
  }
});

// POST /:familyId/:billId/attachments — carica allegato/ricevuta (Premium).
router.post(
  '/:familyId/:billId/attachments',
  requireFamilyMember(),
  requirePremium(),
  upload.single('file'),
  handleUploadError,
  async (req: Request, res: Response) => {
    try {
      const familyId = getParam(req, 'familyId');
      const billId = getParam(req, 'billId');
      const kindRaw = (req.body.kind as string) || 'document';
      const kind = kindRaw === 'receipt' ? 'receipt' : 'document';

      if (!req.file) {
        return res.status(400).json({ error: { code: 'NO_FILE', message: 'Nessun file caricato' } });
      }

      const [bill] = await db
        .select({ id: bills.id })
        .from(bills)
        .where(and(eq(bills.id, billId), eq(bills.familyId, familyId)))
        .limit(1);

      if (!bill) {
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Bolletta non trovata' } });
      }

      // Verifica magic bytes: il contenuto reale deve corrispondere al MIME.
      const magic = readMagicBytes(req.file.path);
      if (!verifyMagicBytes(magic, req.file.mimetype)) {
        fs.unlink(req.file.path, () => {});
        return res.status(415).json({ error: { code: 'CONTENT_MISMATCH', message: 'Il contenuto del file non corrisponde al tipo dichiarato' } });
      }

      const [attachment] = await db
        .insert(billAttachments)
        .values({
          billId,
          familyId,
          kind,
          fileUrl: `/uploads/${req.file.filename}`,
          fileName: req.file.originalname,
          fileMimeType: req.file.mimetype,
          fileSize: req.file.size,
          uploadedBy: req.user!.userId,
        })
        .returning();

      broadcastToFamily(familyId, 'bill_updated', { billId });
      res.status(201).json(attachment);
    } catch (error) {
      logger.error('Upload bill attachment error', { error: String(error) });
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Errore nel caricamento del file' } });
    }
  },
);

// DELETE /:familyId/:billId/attachments/:attachmentId — elimina allegato (Premium).
router.delete('/:familyId/:billId/attachments/:attachmentId', requireFamilyMember(), requirePremium(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const billId = getParam(req, 'billId');
    const attachmentId = getParam(req, 'attachmentId');

    const [attachment] = await db
      .select()
      .from(billAttachments)
      .where(and(eq(billAttachments.id, attachmentId), eq(billAttachments.billId, billId), eq(billAttachments.familyId, familyId)))
      .limit(1);

    if (!attachment) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Allegato non trovato' } });
    }

    const safePath = resolveSafeUploadPath(attachment.fileUrl);
    if (safePath) fs.unlink(safePath, () => {});

    await db.delete(billAttachments).where(eq(billAttachments.id, attachmentId));

    broadcastToFamily(familyId, 'bill_updated', { billId });
    res.json({ message: 'Allegato eliminato' });
  } catch (error) {
    logger.error('Delete bill attachment error', { error: String(error) });
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: "Errore nell'eliminazione dell'allegato" } });
  }
});

export default router;
