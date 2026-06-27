import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireFamilyMember } from '../middleware/family';
import { config } from '../lib/config';
import { logger } from '../lib/logger';
import { verifyPurchase, isPurchaseVerificationError } from '../lib/iap-verifier';
import { applyPurchase, getEntitlement, isEntitlementActive } from '../lib/entitlements';

const router = Router();

/**
 * Acquisti Premium store-native (Google Play / Apple). NIENTE Stripe qui: il
 * Premium mobile dipende solo dagli store. La verifica è server-side e aggiorna
 * la tabella entitlements + families.subscriptionStatus (fonte: isPremium).
 */

// Config pubblica (autenticata): productId da usare nel client per piattaforma.
router.get('/config', (_req: Request, res: Response) => {
  res.json({
    androidProductId: config.iap.androidProductId,
    iosProductId: config.iap.iosProductId,
    verificationConfigured: {
      google: config.isIapVerificationConfigured('google'),
      apple: config.isIapVerificationConfigured('apple'),
    },
  });
});

const verifySchema = z.object({
  familyId: z.string().min(1, 'familyId è obbligatorio'),
  platform: z.enum(['google', 'apple']),
  productId: z.string().min(1).optional(),
  purchaseToken: z.string().min(1).optional(),
  receiptData: z.string().min(1).optional(),
  transactionId: z.string().min(1).optional(),
});

router.post('/verify', requireFamilyMember('familyId'), async (req: Request, res: Response) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Dati non validi', details: parsed.error.flatten().fieldErrors },
    });
  }
  const { familyId, platform, transactionId } = parsed.data;
  // SICUREZZA: il productId NON è preso dal client. Si usa SEMPRE quello del
  // prodotto Premium configurato per la piattaforma, così un client non può
  // far validare uno SKU diverso e ottenere un entitlement premium indebito.
  const productId = config.premiumProductIdFor(platform);

  try {
    const outcome = await verifyPurchase({
      platform,
      productId,
      purchaseToken: parsed.data.purchaseToken,
      receiptData: parsed.data.receiptData,
      transactionId,
    });
    const result = await applyPurchase({
      familyId,
      userId: req.user!.userId,
      platform,
      outcome,
    });
    return res.json({
      premium: result.premium,
      status: result.status,
      expiresAt: result.expiresAt,
      plan: result.premium ? 'premium' : 'free',
    });
  } catch (error) {
    if (isPurchaseVerificationError(error)) {
      return res.status(error.httpStatus).json({ error: { code: error.code, message: error.userMessage } });
    }
    logger.error('Purchase verify error', { error: String(error) });
    return res.status(500).json({ error: { code: 'PURCHASE_ERROR', message: 'Errore nella verifica dell\'acquisto' } });
  }
});

const restoreSchema = z.object({
  familyId: z.string().min(1, 'familyId è obbligatorio'),
  platform: z.enum(['google', 'apple']),
  productId: z.string().min(1).optional(),
  purchaseToken: z.string().min(1).optional(),
  receiptData: z.string().min(1).optional(),
  transactionId: z.string().min(1).optional(),
});

// Ripristina acquisti: ri-verifica la ricevuta/token e riallinea l'entitlement.
router.post('/restore', requireFamilyMember('familyId'), async (req: Request, res: Response) => {
  const parsed = restoreSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Dati non validi', details: parsed.error.flatten().fieldErrors },
    });
  }
  const { familyId, platform, transactionId } = parsed.data;
  // SICUREZZA: productId forzato a quello configurato (vedi /verify).
  const productId = config.premiumProductIdFor(platform);

  if (!parsed.data.purchaseToken && !parsed.data.receiptData) {
    return res.status(400).json({
      error: { code: 'NO_RECEIPT', message: 'Nessuna ricevuta da ripristinare' },
    });
  }

  try {
    const outcome = await verifyPurchase({
      platform,
      productId,
      purchaseToken: parsed.data.purchaseToken,
      receiptData: parsed.data.receiptData,
      transactionId,
    });
    const result = await applyPurchase({
      familyId,
      userId: req.user!.userId,
      platform,
      outcome,
    });
    return res.json({
      restored: result.premium,
      premium: result.premium,
      status: result.status,
      expiresAt: result.expiresAt,
      plan: result.premium ? 'premium' : 'free',
    });
  } catch (error) {
    if (isPurchaseVerificationError(error)) {
      return res.status(error.httpStatus).json({ error: { code: error.code, message: error.userMessage } });
    }
    logger.error('Purchase restore error', { error: String(error) });
    return res.status(500).json({ error: { code: 'PURCHASE_ERROR', message: 'Errore nel ripristino degli acquisti' } });
  }
});

// Stato Premium della famiglia (per la UI). Fonte di verità: entitlements.
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

export default router;
