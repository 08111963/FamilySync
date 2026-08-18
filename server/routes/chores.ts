import { Router } from 'express';
import { getParam } from '../lib/http-params';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { chores, familyMembers, calendarEvents, users } from '../../shared/schema';
import { eq, and, sql, isNull, lt } from 'drizzle-orm';
import { authenticate, blockChildAccount } from '../middleware/auth';
import { requireFamilyMember } from '../middleware/family';
import { broadcastToFamily } from '../lib/websocket';
import { sendPushToUser, sendPushToFamily } from '../lib/push';
import { getBlockedUserIds, getBlockRelatedUserIds, applyBlockedFilter } from '../lib/block-filter';
import { logger } from '../lib/logger';
import { trackServerEvent } from '../lib/test-analytics';
import { nextDueDate, parseRecurrenceRule } from '../../shared/chore-recurrence';
import { syncCreatedEvents, syncUpdatedEvent, syncDeletedEvents, getLinksForEvents } from '../lib/google-calendar-sync';

const TIME_HHMM_REGEX = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Data in formato italiano GG/MM/AAAA per i testi delle notifiche. */
function formatDateIt(d: Date): string {
  const iso = d.toISOString().slice(0, 10);
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

const router = Router();

const createChoreSchema = z.object({
  title: z.string().min(1, "Il titolo è obbligatorio"),
  description: z.string().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  points: z.number().int().min(1).optional().default(10),
  estimatedMinutes: z.number().int().min(0).optional(),
  assignedTo: z.string().optional(),
  dueDate: z.string().optional(),
  dueTime: z.string().regex(TIME_HHMM_REGEX, "Orario non valido (usa HH:MM)").optional(),
  recurrenceRule: z.string()
    .refine((v) => parseRecurrenceRule(v) !== null, "Regola di ricorrenza non valida")
    .optional(),
});

const updateChoreSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  difficulty: z.number().int().min(1).max(5).nullable().optional(),
  points: z.number().int().min(1).optional(),
  estimatedMinutes: z.number().int().min(0).nullable().optional(),
  assignedTo: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  dueTime: z.string().regex(TIME_HHMM_REGEX, "Orario non valido (usa HH:MM)").nullable().optional(),
  recurrenceRule: z.string()
    .refine((v) => parseRecurrenceRule(v) !== null, "Regola di ricorrenza non valida")
    .nullable().optional(),
  isCompleted: z.boolean().optional(),
}).strict();

// --- Sincronizzazione con il calendario famiglia ---------------------------
// Ogni faccenda con scadenza (e non completata) ha un evento tutto-il-giorno
// alla data di scadenza, cosi' compare nel calendario dell'app, nel feed ICS
// (Google/Apple Calendar) e puo' essere salvata sul telefono. L'evento viene
// aggiornato se cambia la faccenda e rimosso al completamento/eliminazione.
// Gli errori di sync non bloccano mai l'operazione principale (best-effort).

const CHORE_EVENT_COLOR = '#8B5CF6';

// Le faccende completate restano visibili per questo numero di giorni,
// poi vengono eliminate automaticamente.
const COMPLETED_RETENTION_DAYS = 5;

/** Verifica che l'assegnatario sia un membro della famiglia indicata. */
async function isFamilyMemberId(familyId: string, memberId: string): Promise<boolean> {
  const [member] = await db.select({ id: familyMembers.id }).from(familyMembers)
    .where(and(eq(familyMembers.id, memberId), eq(familyMembers.familyId, familyId)))
    .limit(1);
  return !!member;
}

function choreEventFields(chore: typeof chores.$inferSelect) {
  const parts: string[] = [];
  if (chore.description) parts.push(chore.description);
  if (chore.points) parts.push(`Punti: ${chore.points}`);
  parts.push('Creato automaticamente dalla sezione Faccende');
  return {
    title: `Faccenda: ${chore.title}`,
    description: parts.join('\n'),
    date: chore.dueDate!.toISOString().split('T')[0]!,
    time: (chore.dueTime ?? null) as string | null,
    endTime: null as string | null,
    allDay: !chore.dueTime,
    category: 'other' as const,
    color: CHORE_EVENT_COLOR,
    memberId: chore.assignedTo,
  };
}

/** Crea l'evento calendario per una faccenda e collega chores.calendarEventId. */
async function createChoreCalendarEvent(
  chore: typeof chores.$inferSelect,
  userId: string
): Promise<typeof chores.$inferSelect> {
  if (!chore.dueDate || chore.isCompleted) return chore;
  try {
    const [event] = await db
      .insert(calendarEvents)
      .values({
        familyId: chore.familyId,
        ...choreEventFields(chore),
        createdBy: userId,
      })
      .returning();
    // Check-and-set atomico: collega l'evento solo se la faccenda non ne ha
    // gia' uno, non e' stata completata nel frattempo e ha ancora una scadenza
    // (richieste concorrenti non devono creare eventi duplicati o "fantasma").
    const [updated] = await db
      .update(chores)
      .set({ calendarEventId: event.id })
      .where(and(
        eq(chores.id, chore.id),
        isNull(chores.calendarEventId),
        eq(chores.isCompleted, false),
        sql`${chores.dueDate} IS NOT NULL`
      ))
      .returning();
    if (!updated) {
      await db.delete(calendarEvents).where(eq(calendarEvents.id, event.id));
      const [current] = await db.select().from(chores).where(eq(chores.id, chore.id)).limit(1);
      return current ?? chore;
    }
    broadcastToFamily(chore.familyId, 'event_created', event);
    // Sync diretta Google Calendar (best-effort, in background): così le
    // faccende con orario ricevono anche il promemoria Google 1 ora prima.
    void syncCreatedEvents(chore.familyId, [event], userId);
    return updated;
  } catch (error) {
    logger.warn('Chore calendar sync (create) failed', { choreId: chore.id, error: String(error) });
    return chore;
  }
}

/** Aggiorna l'evento calendario collegato (titolo/data/descrizione/assegnatario). */
async function updateChoreCalendarEvent(chore: typeof chores.$inferSelect): Promise<void> {
  if (!chore.calendarEventId || !chore.dueDate) return;
  try {
    const [event] = await db
      .update(calendarEvents)
      .set({ ...choreEventFields(chore), updatedAt: new Date() })
      .where(and(eq(calendarEvents.id, chore.calendarEventId), eq(calendarEvents.familyId, chore.familyId)))
      .returning();
    if (event) {
      broadcastToFamily(chore.familyId, 'event_updated', event);
      void syncUpdatedEvent(event);
    }
  } catch (error) {
    logger.warn('Chore calendar sync (update) failed', { choreId: chore.id, error: String(error) });
  }
}

/** Elimina l'evento calendario collegato (faccenda completata o eliminata). */
async function deleteChoreCalendarEvent(
  familyId: string,
  choreId: string,
  calendarEventId: string | null
): Promise<void> {
  if (!calendarEventId) return;
  try {
    // I link Google vanno letti PRIMA della delete (cascade sul DB).
    const gcalLinks = await getLinksForEvents([calendarEventId]);
    await db
      .delete(calendarEvents)
      .where(and(eq(calendarEvents.id, calendarEventId), eq(calendarEvents.familyId, familyId)));
    await db.update(chores).set({ calendarEventId: null }).where(eq(chores.id, choreId));
    broadcastToFamily(familyId, 'event_deleted', { eventId: calendarEventId });
    void syncDeletedEvents(gcalLinks);
  } catch (error) {
    logger.warn('Chore calendar sync (delete) failed', { choreId, error: String(error) });
  }
}

/**
 * Push a tutta la famiglia per un'azione su una faccenda (creata, modificata,
 * completata). Esclusi: l'autore dell'azione, gli utenti in blocco reciproco
 * con l'autore e (opzionale) l'assegnatario quando riceve già la push
 * dedicata "assegnata a te".
 */
async function notifyFamilyChoreAction(
  familyId: string,
  chore: typeof chores.$inferSelect,
  actorUserId: string,
  action: 'created' | 'updated' | 'completed',
  opts?: { excludeAssignee?: boolean }
) {
  try {
    const excluded = new Set(await getBlockRelatedUserIds(actorUserId, familyId));
    excluded.add(actorUserId);
    if (opts?.excludeAssignee && chore.assignedTo) {
      const [assignee] = await db
        .select({ userId: familyMembers.userId })
        .from(familyMembers)
        .where(and(eq(familyMembers.id, chore.assignedTo), eq(familyMembers.familyId, familyId)))
        .limit(1);
      if (assignee?.userId) excluded.add(assignee.userId);
    }

    const [author] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, actorUserId))
      .limit(1);
    const who = author?.name ?? 'Un familiare';
    const due = chore.dueDate
      ? ` (scadenza ${formatDateIt(chore.dueDate)}${chore.dueTime ? ` alle ${chore.dueTime}` : ''})`
      : '';

    await sendPushToFamily(
      familyId,
      {
        title:
          action === 'created' ? 'Nuova faccenda'
          : action === 'updated' ? 'Faccenda modificata'
          : 'Faccenda completata',
        body:
          action === 'created' ? `${who} ha creato la faccenda "${chore.title}"${due}`
          : action === 'updated' ? `${who} ha modificato la faccenda "${chore.title}"${due}`
          : `${who} ha completato la faccenda "${chore.title}" (+${chore.points} punti)`,
        data: { route: '/(tabs)/chores' },
      },
      { excludeUserIds: excluded }
    );
  } catch (error) {
    logger.error('notifyFamilyChoreAction error', { error: String(error), action });
  }
}

/**
 * Push all'assegnatario di una faccenda (se diverso da chi ha fatto l'azione).
 * assignedTo è l'id di familyMembers: viene mappato allo userId.
 */
async function notifyChoreAssignee(
  familyId: string,
  chore: typeof chores.$inferSelect,
  actorUserId: string
) {
  try {
    if (!chore.assignedTo) return;

    const [member] = await db
      .select({ userId: familyMembers.userId })
      .from(familyMembers)
      .where(and(eq(familyMembers.id, chore.assignedTo), eq(familyMembers.familyId, familyId)))
      .limit(1);

    // Profili bambino gestiti (userId NULL): nessun account, nessuna push.
    if (!member || !member.userId || member.userId === actorUserId) return;

    // Niente push tra utenti in blocco reciproco.
    const blockRelated = await getBlockRelatedUserIds(actorUserId, familyId);
    if (blockRelated.includes(member.userId)) return;

    const due = chore.dueDate
      ? ` · scadenza ${formatDateIt(chore.dueDate)}${chore.dueTime ? ` alle ${chore.dueTime}` : ''}`
      : '';
    await sendPushToUser(member.userId, {
      title: 'Nuova faccenda assegnata',
      body: `${chore.title}${due}`,
      data: { route: '/(tabs)/chores' },
    });
  } catch (error) {
    logger.error('notifyChoreAssignee error', { error: String(error) });
  }
}

router.get('/:familyId', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');

    // Pulizia automatica: le faccende completate da più di 5 giorni vengono
    // eliminate (best-effort, non blocca la lettura della lista).
    try {
      const cutoff = new Date(Date.now() - COMPLETED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      await db.delete(chores).where(and(
        eq(chores.familyId, familyId),
        eq(chores.isCompleted, true),
        lt(chores.completedAt, cutoff)
      ));
    } catch (cleanupError) {
      logger.error('Completed chores cleanup failed', { familyId, error: String(cleanupError) });
    }

    const blockedIds = await getBlockedUserIds(req.user!.userId, familyId);

    const conditions: any[] = [eq(chores.familyId, familyId)];
    const blockFilter = applyBlockedFilter(chores.createdBy, blockedIds);
    if (blockFilter) conditions.push(blockFilter);

    const choresList = await db.select().from(chores).where(and(...conditions));
    res.json(choresList);
  } catch (error) {
    logger.error('Get chores error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel recupero faccende" } });
  }
});

// Creazione riservata agli adulti: un account bambino potrebbe altrimenti
// auto-assegnarsi faccende con punti arbitrari (escalation punti/premi).
router.post('/:familyId', authenticate, blockChildAccount, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const parsed = createChoreSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    if (parsed.data.assignedTo && !(await isFamilyMemberId(familyId, parsed.data.assignedTo))) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "L'assegnatario non appartiene a questa famiglia" },
      });
    }

    let [chore] = await db.insert(chores).values({
      familyId,
      title: parsed.data.title,
      description: parsed.data.description,
      difficulty: parsed.data.difficulty ?? null,
      points: parsed.data.points,
      estimatedMinutes: parsed.data.estimatedMinutes ?? null,
      assignedTo: parsed.data.assignedTo,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      // L'orario ha senso solo insieme alla scadenza.
      dueTime: parsed.data.dueDate ? (parsed.data.dueTime ?? null) : null,
      recurrenceRule: parsed.data.recurrenceRule,
      createdBy: req.user!.userId,
    }).returning();

    // Sync calendario: la faccenda con scadenza compare anche nel calendario.
    chore = await createChoreCalendarEvent(chore, req.user!.userId);

    broadcastToFamily(familyId, 'chore_created', chore);
    void notifyChoreAssignee(familyId, chore, req.user!.userId);
    void notifyFamilyChoreAction(familyId, chore, req.user!.userId, 'created', { excludeAssignee: true });
    if (chore.assignedTo) {
      trackServerEvent('first_chore_assigned', { userId: req.user!.userId, familyId, oncePerFamily: true }).catch(() => {});
    }

    res.status(201).json(chore);
  } catch (error) {
    logger.error('Create chore error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nella creazione della faccenda" } });
  }
});

// Modifica riservata agli adulti (punti, scadenze e assegnazioni non sono
// alterabili da un account bambino).
router.put('/:familyId/:choreId', authenticate, blockChildAccount, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const choreId = getParam(req, 'choreId');

    const parsed = updateChoreSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    if (parsed.data.assignedTo && !(await isFamilyMemberId(familyId, parsed.data.assignedTo))) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "L'assegnatario non appartiene a questa famiglia" },
      });
    }

    const updateData: Record<string, any> = { ...parsed.data, updatedAt: new Date() };
    if (updateData.dueDate) {
      updateData.dueDate = new Date(updateData.dueDate);
    }
    // Scadenza rimossa → anche l'orario perde significato.
    if (parsed.data.dueDate === null) {
      updateData.dueTime = null;
    } else if (parsed.data.dueTime && parsed.data.dueDate === undefined) {
      // Orario senza data nel body: valido solo se la faccenda ha già una scadenza.
      const [existing] = await db
        .select({ dueDate: chores.dueDate })
        .from(chores)
        .where(and(eq(chores.id, choreId), eq(chores.familyId, familyId)))
        .limit(1);
      if (!existing) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Faccenda non trovata" } });
      }
      if (!existing.dueDate) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Per impostare un orario serve anche la data di scadenza" },
        });
      }
    }

    let [chore] = await db.update(chores)
      .set(updateData)
      .where(and(eq(chores.id, choreId), eq(chores.familyId, familyId)))
      .returning();

    if (!chore) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Faccenda non trovata" } });
    }

    // Funnel: prima faccenda assegnata — copre anche il flusso "crea senza
    // assegnatario, poi assegna" via PUT (dedup oncePerFamily nel tracker).
    if (parsed.data.assignedTo && chore.assignedTo) {
      trackServerEvent('first_chore_assigned', { userId: req.user!.userId, familyId, oncePerFamily: true }).catch(() => {});
    }

    // Sync calendario: evento presente solo se c'e' scadenza e non completata.
    if (chore.isCompleted || !chore.dueDate) {
      await deleteChoreCalendarEvent(familyId, chore.id, chore.calendarEventId);
      chore = { ...chore, calendarEventId: null };
    } else if (chore.calendarEventId) {
      await updateChoreCalendarEvent(chore);
    } else {
      chore = await createChoreCalendarEvent(chore, req.user!.userId);
    }

    broadcastToFamily(familyId, 'chore_updated', chore);
    const assigneeNotified = !!parsed.data.assignedTo && !chore.isCompleted;
    if (assigneeNotified) {
      void notifyChoreAssignee(familyId, chore, req.user!.userId);
    }
    void notifyFamilyChoreAction(familyId, chore, req.user!.userId, 'updated', { excludeAssignee: assigneeNotified });
    res.json(chore);
  } catch (error) {
    logger.error('Update chore error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'aggiornamento" } });
  }
});

router.patch('/:familyId/:choreId/complete', authenticate, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const choreId = getParam(req, 'choreId');

    // Account bambino: può completare SOLO le faccende assegnate al proprio
    // membro (i punti restano quelli decisi dal genitore alla creazione).
    // Fail-closed: senza assegnazione o su faccende altrui → 403.
    if (req.user!.isChildAccount === true) {
      const membership = (req as any).membership as { id: string } | undefined;
      const [target] = await db.select({ assignedTo: chores.assignedTo }).from(chores)
        .where(and(eq(chores.id, choreId), eq(chores.familyId, familyId)))
        .limit(1);
      if (!target) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Faccenda non trovata" } });
      }
      if (!membership?.id || !target.assignedTo || target.assignedTo !== membership.id) {
        return res.status(403).json({ error: { code: "CHILD_FORBIDDEN", message: "Questa funzione non è disponibile per gli accessi bambino" } });
      }
    }

    // Aggiornamento atomico: la guardia isCompleted=false nella WHERE evita
    // che due richieste concorrenti assegnino i punti (o ricreino la
    // ricorrenza) due volte.
    let [chore] = await db.update(chores)
      .set({
        isCompleted: true,
        completedAt: new Date(),
        completedBy: req.user!.userId,
        updatedAt: new Date(),
      })
      .where(and(
        eq(chores.id, choreId),
        eq(chores.familyId, familyId),
        eq(chores.isCompleted, false)
      ))
      .returning();

    if (!chore) {
      const [existing] = await db.select({ id: chores.id }).from(chores)
        .where(and(eq(chores.id, choreId), eq(chores.familyId, familyId)))
        .limit(1);
      if (!existing) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Faccenda non trovata" } });
      }
      return res.status(400).json({ error: { code: "ALREADY_COMPLETED", message: "Faccenda già completata" } });
    }

    const pointsToAdd = chore.points || 10;

    // Sync calendario: faccenda completata → evento rimosso.
    await deleteChoreCalendarEvent(familyId, choreId, chore.calendarEventId);
    chore = { ...chore, calendarEventId: null };

    if (chore.assignedTo) {
      await db.update(familyMembers)
        .set({
          points: sql`COALESCE(${familyMembers.points}, 0) + ${pointsToAdd}`,
        })
        .where(and(
          eq(familyMembers.id, chore.assignedTo),
          eq(familyMembers.familyId, familyId)
        ));
    }

    // Ricorrenza: la faccenda si ricrea per la prossima occorrenza.
    // Base: la scadenza attuale se presente e nel futuro-non-passato, altrimenti oggi
    // (evita di generare occorrenze arretrate se la faccenda era in ritardo).
    let nextChore: typeof chores.$inferSelect | null = null;
    if (chore.recurrenceRule) {
      // "Oggi" nel fuso orario degli utenti (Italia), non in UTC: vicino alla
      // mezzanotte l'UTC slitterebbe di un giorno.
      const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
      const dueIso = chore.dueDate ? chore.dueDate.toISOString().slice(0, 10) : null;
      const baseIso = dueIso && dueIso > todayIso ? dueIso : todayIso;
      const nextIso = nextDueDate(chore.recurrenceRule, baseIso);
      if (nextIso) {
        try {
          const [created] = await db.insert(chores).values({
            familyId,
            title: chore.title,
            description: chore.description,
            difficulty: chore.difficulty,
            points: chore.points,
            estimatedMinutes: chore.estimatedMinutes,
            assignedTo: chore.assignedTo,
            dueDate: new Date(nextIso),
            dueTime: chore.dueTime,
            recurrenceRule: chore.recurrenceRule,
            createdBy: chore.createdBy,
          }).returning();
          nextChore = await createChoreCalendarEvent(created, req.user!.userId);
          broadcastToFamily(familyId, 'chore_created', nextChore);
        } catch (error) {
          logger.error('Recurring chore recreation failed', { choreId, error: String(error) });
        }
      }
    }

    broadcastToFamily(familyId, 'chore_completed', chore);
    void notifyFamilyChoreAction(familyId, chore, req.user!.userId, 'completed');
    res.json({ ...chore, nextChore });
  } catch (error) {
    logger.error('Complete chore error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nel completamento" } });
  }
});

// Eliminazione riservata agli adulti.
router.delete('/:familyId/:choreId', authenticate, blockChildAccount, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const familyId = getParam(req, 'familyId');
    const choreId = getParam(req, 'choreId');

    const [existing] = await db.select().from(chores)
      .where(and(eq(chores.id, choreId), eq(chores.familyId, familyId)))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Faccenda non trovata" } });
    }

    // Sync calendario: rimuovi PRIMA l'evento collegato (come per le bollette),
    // cosi' un eventuale errore non lascia eventi orfani nel calendario.
    await deleteChoreCalendarEvent(familyId, choreId, existing.calendarEventId);

    await db.delete(chores)
      .where(and(eq(chores.id, choreId), eq(chores.familyId, familyId)));

    broadcastToFamily(familyId, 'chore_deleted', { choreId });
    res.json({ message: 'Faccenda eliminata' });
  } catch (error) {
    logger.error('Delete chore error', { error: String(error) });
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Errore nell'eliminazione" } });
  }
});

export default router;
