import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { requireFamilyAdmin, requireFamilyMember } from '../middleware/family';
import { config } from '../lib/config';
import { logger } from '../lib/logger';

const router = Router();

export function requirePayments(_req: Request, res: Response, next: NextFunction) {
  if (!config.premiumPaymentsEnabled) {
    return res.status(501).json({
      error: { code: "PAYMENTS_DISABLED", message: "I pagamenti Premium non sono ancora attivi" },
    });
  }
  next();
}

router.get('/status', (_req: Request, res: Response) => {
  res.json({
    paymentsEnabled: config.premiumPaymentsEnabled,
    plans: [
      { name: "Premium Mensile", price: "\u20AC4,99/mese", interval: "month" },
      { name: "Premium Annuale", price: "\u20AC39,99/anno", interval: "year", badge: "Risparmia 33%" },
    ],
    features: [
      "Suggerimenti AI",
      "Membri Illimitati",
      "Sincronizzazione Real-time",
      "Statistiche Avanzate",
      "Temi Personalizzati",
      "Supporto Prioritario",
    ],
  });
});

router.get('/publishable-key', requirePayments, async (_req: Request, res: Response) => {
  try {
    const { getStripePublishableKey } = await import('../lib/stripeClient');
    const publishableKey = await getStripePublishableKey();
    res.json({ publishableKey });
  } catch (error) {
    logger.error('Error getting publishable key', { error: String(error) });
    res.status(500).json({ error: { code: "STRIPE_ERROR", message: "Errore nel recupero della chiave Stripe" } });
  }
});

router.get('/products', requirePayments, async (_req: Request, res: Response) => {
  try {
    const { stripeService } = await import('../lib/stripeService');
    const products = await stripeService.listProducts();
    res.json({ data: products });
  } catch (error) {
    logger.error('Error listing products', { error: String(error) });
    res.status(500).json({ error: { code: "STRIPE_ERROR", message: "Errore nel recupero dei prodotti" } });
  }
});

router.get('/products-with-prices', requirePayments, async (_req: Request, res: Response) => {
  try {
    const { stripeService } = await import('../lib/stripeService');
    const rows = await stripeService.listProductsWithPrices();

    if (rows.length > 0 && 'prices' in rows[0]) {
      res.json({ data: rows.map((row: any) => ({
        id: row.product_id,
        name: row.product_name,
        description: row.product_description,
        active: row.product_active,
        metadata: row.product_metadata,
        prices: row.prices.map((price: any) => ({
          id: price.price_id,
          unit_amount: price.unit_amount,
          currency: price.currency,
          recurring: price.recurring,
          active: price.price_active
        }))
      }))});
      return;
    }

    const productsMap = new Map();
    for (const row of rows as any[]) {
      if (!productsMap.has(row.product_id)) {
        productsMap.set(row.product_id, {
          id: row.product_id,
          name: row.product_name,
          description: row.product_description,
          active: row.product_active,
          metadata: row.product_metadata,
          prices: []
        });
      }
      if (row.price_id) {
        productsMap.get(row.product_id).prices.push({
          id: row.price_id,
          unit_amount: row.unit_amount,
          currency: row.currency,
          recurring: row.recurring,
          active: row.price_active,
        });
      }
    }

    res.json({ data: Array.from(productsMap.values()) });
  } catch (error) {
    logger.error('Error listing products with prices', { error: String(error) });
    res.status(500).json({ error: { code: "STRIPE_ERROR", message: "Errore nel recupero dei prodotti" } });
  }
});

router.get('/prices', requirePayments, async (_req: Request, res: Response) => {
  try {
    const { stripeService } = await import('../lib/stripeService');
    const prices = await stripeService.listPrices();
    res.json({ data: prices });
  } catch (error) {
    logger.error('Error listing prices', { error: String(error) });
    res.status(500).json({ error: { code: "STRIPE_ERROR", message: "Errore nel recupero dei prezzi" } });
  }
});

router.use(authenticate);

// L'abbonamento è legato alla FAMIGLIA: familyId è obbligatorio e l'utente deve
// esserne membro (requireFamilyMember). Niente più "prima famiglia dell'utente".
router.get('/subscription/:familyId', requirePayments, requireFamilyMember(), async (req: Request, res: Response) => {
  try {
    const { stripeService } = await import('../lib/stripeService');
    const familyId = req.params.familyId as string;

    const family = await stripeService.getFamily(familyId);

    if (!family?.stripeSubscriptionId) {
      return res.json({ subscription: null, status: family?.subscriptionStatus || 'free' });
    }

    const subscription = await stripeService.getSubscription(family.stripeSubscriptionId);
    res.json({
      subscription,
      status: family.subscriptionStatus || 'free',
    });
  } catch (error) {
    logger.error('Error getting subscription', { error: String(error) });
    res.status(500).json({ error: { code: "STRIPE_ERROR", message: "Errore nel recupero dell'abbonamento" } });
  }
});

// Il client invia solo `plan` (monthly|yearly): il priceId viene scelto e
// validato lato server, mai accettato dal client.
const checkoutSchema = z.object({
  plan: z.enum(['monthly', 'yearly']),
  familyId: z.string().min(1, "familyId è obbligatorio"),
});

router.post('/checkout', requirePayments, requireFamilyAdmin("familyId"), async (req: Request, res: Response) => {
  try {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const { stripeService, PaymentConfigError } = await import('../lib/stripeService');
    const { plan, familyId } = parsed.data;

    const family = await stripeService.getFamily(familyId);
    if (!family) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Famiglia non trovata" } });
    }

    let priceId: string;
    try {
      priceId = await stripeService.getPriceIdForPlan(plan);
    } catch (error) {
      if (error instanceof PaymentConfigError && error.code === 'INVALID_PLAN') {
        return res.status(400).json({ error: { code: "INVALID_PLAN", message: error.message } });
      }
      logger.error('Error resolving price for plan', { error: String(error) });
      return res.status(503).json({ error: { code: "PRICE_UNAVAILABLE", message: "Configurazione prezzi non disponibile" } });
    }

    let customerId = family.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeService.createCustomer(req.user!.email, familyId, family.name);
      await stripeService.updateFamilyStripeInfo(familyId, { stripeCustomerId: customer.id });
      customerId = customer.id;
    }

    const baseUrl = config.getBaseUrl(req);

    const session = await stripeService.createCheckoutSession({
      customerId,
      priceId,
      successUrl: `${baseUrl}/checkout/success`,
      cancelUrl: `${baseUrl}/checkout/cancel`,
      familyId,
      userId: req.user!.userId,
    });

    res.json({ url: session.url });
  } catch (error) {
    logger.error('Error creating checkout session', { error: String(error) });
    res.status(500).json({ error: { code: "STRIPE_ERROR", message: "Errore nella creazione della sessione di pagamento" } });
  }
});

const portalSchema = z.object({
  familyId: z.string().min(1, "familyId è obbligatorio"),
});

router.post('/portal', requirePayments, requireFamilyAdmin("familyId"), async (req: Request, res: Response) => {
  try {
    const parsed = portalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Dati non validi", details: parsed.error.flatten().fieldErrors },
      });
    }

    const { stripeService } = await import('../lib/stripeService');
    const { familyId } = parsed.data;

    const family = await stripeService.getFamily(familyId);
    if (!family?.stripeCustomerId) {
      return res.status(400).json({ error: { code: "NO_SUBSCRIPTION", message: "Nessun abbonamento attivo per questa famiglia" } });
    }

    const baseUrl = config.getBaseUrl(req);

    const session = await stripeService.createCustomerPortalSession(
      family.stripeCustomerId,
      `${baseUrl}/premium`
    );

    res.json({ url: session.url });
  } catch (error) {
    logger.error('Error creating portal session', { error: String(error) });
    res.status(500).json({ error: { code: "STRIPE_ERROR", message: "Errore nella creazione del portale di gestione" } });
  }
});

export default router;
