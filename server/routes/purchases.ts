import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireFamilyMember } from '../middleware/family';
import { config } from '../lib/config';
import { logger } from '../lib/logger';
import { getSubscriberEntitlement } from '../lib/revenuecat-server';
import { syncEntitlementFromRevenueCat, getEntitlement, isEntitlementActive } from '../lib/entitlements';

/**
 * Premium store-native tramite RevenueCat. NIENTE Stripe qui: il Premium mobile
 * dipende solo dagli store via RevenueCat. Il client NON decide il Premium: dopo
 * un acquisto/ripristino chiama POST /sync e il backend interroga RevenueCat
 * (AppUserID = familyId) aggiornando la tabella entitlements (fonte: isPremium).
 */

const router = Router();

// Config pubblica (autenticata): identificatori RevenueCat utili al client. I
// prezzi NON sono qui: il client li legge dall'offering di RevenueCat.
router.get('/config', (_req: Request, res: Response) => {
  res.json({
    entitlementId: config.revenuecat.entitlementId,
    projectConfigured: !!config.revenuecat.projectId,
  });
});

const syncSchema = z.object({
  familyId: z.string().min(1, 'familyId è obbligatorio'),
});

/**
 * Sincronizza l'entitlement Premium della famiglia interrogando RevenueCat.
 * Chiamato dal client dopo un acquisto o un ripristino, e usabile per refresh.
 */
router.post('/sync', requireFamilyMember('familyId'), async (req: Request, res: Response) => {
  const parsed = syncSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Dati non validi', details: parsed.error.flatten().fieldErrors },
    });
  }
  const { familyId } = parsed.data;

  // Solo admin (proprietario) della famiglia può attivare/aggiornare il Premium.
  // requireFamilyMember ha già caricato la membership su req.
  const membership = (req as any).membership as { role?: string } | undefined;
  if (membership?.role !== 'admin') {
    return res.status(403).json({
      error: { code: 'NOT_ALLOWED', message: 'Solo l\'amministratore della famiglia può gestire il Premium.' },
    });
  }

  try {
    const rc = await getSubscriberEntitlement(familyId);
    const result = await syncEntitlementFromRevenueCat({
      familyId,
      userId: req.user!.userId,
      active: rc.active,
      expiresAt: rc.expiresAt,
    });
    return res.json({
      premium: result.premium,
      status: result.status,
      expiresAt: result.expiresAt,
      plan: result.premium ? 'premium' : 'free',
    });
  } catch (error) {
    logger.error('Purchase sync error', { error: String(error) });
    return res.status(502).json({ error: { code: 'SYNC_ERROR', message: 'Non è stato possibile sincronizzare lo stato Premium. Riprova tra poco.' } });
  }
});

// Stato Premium della famiglia (per la UI). Fonte di verità: entitlements (DB).
router.get('/status/:familyId', requireFamilyMember('familyId'), async (req: Request, res: Response) => {
  try {
    const familyId = req.params.familyId as string;
    const ent = await getEntitlement(familyId);
    const premium = isEntitlementActive(ent);
    return res.json({
      premium,
      plan: premium ? 'premium' : 'free',
      status: ent?.status ?? null,
      expiresAt: ent?.expiresAt ?? null,
    });
  } catch (error) {
    logger.error('Purchase status error', { error: String(error) });
    return res.status(500).json({ error: { code: 'PURCHASE_ERROR', message: 'Errore nel recupero dello stato Premium' } });
  }
});

/**
 * Webhook RevenueCat (rinnovi, cancellazioni, scadenze). Pubblico (chiamato da
 * RevenueCat, senza JWT): viene montato fuori dalla catena authenticate in
 * routes.ts. L'autenticazione è via header Authorization confrontato con
 * config.revenuecat.webhookAuthHeader. Non ci fidiamo del payload: estraiamo
 * l'app_user_id (= familyId) e ri-sincronizziamo da RevenueCat (autorevole).
 */
export async function handleRevenueCatWebhook(req: Request, res: Response) {
  const expected = config.revenuecat.webhookAuthHeader;
  if (!expected) {
    // Fail-closed in produzione: senza header configurato non processiamo
    // webhook non autenticati (in sviluppo è tollerato per i test locali).
    if (process.env.NODE_ENV === 'production') {
      logger.error('RevenueCat webhook rifiutato: REVENUECAT_WEBHOOK_AUTH_HEADER non configurato in produzione');
      return res.status(503).json({ error: { code: 'WEBHOOK_NOT_CONFIGURED', message: 'Webhook non configurato' } });
    }
  } else {
    const provided = req.header('authorization') || '';
    if (provided !== expected) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Webhook non autorizzato' } });
    }
  }

  const event = (req.body && (req.body.event ?? req.body)) as { app_user_id?: string; original_app_user_id?: string } | undefined;
  const familyId = event?.app_user_id || event?.original_app_user_id;

  // Acknowledge sempre 200 per evitare retry inutili; gli errori di sync sono loggati.
  if (!familyId) {
    logger.error('RevenueCat webhook senza app_user_id', { body: JSON.stringify(req.body)?.slice(0, 500) });
    return res.status(200).json({ ok: true });
  }

  try {
    const rc = await getSubscriberEntitlement(familyId);
    await syncEntitlementFromRevenueCat({
      familyId,
      userId: null,
      active: rc.active,
      expiresAt: rc.expiresAt,
    });
  } catch (error) {
    logger.error('RevenueCat webhook sync error', { familyId, error: String(error) });
  }
  return res.status(200).json({ ok: true });
}

export default router;
