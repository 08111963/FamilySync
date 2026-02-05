import { Router } from 'express';
import { stripeService } from '../lib/stripeService';
import { getStripePublishableKey } from '../lib/stripeClient';
import { authenticate } from '../middleware/auth';

const router = Router();

router.get('/publishable-key', async (req, res) => {
  try {
    const publishableKey = await getStripePublishableKey();
    res.json({ publishableKey });
  } catch (error) {
    console.error('Error getting publishable key:', error);
    res.status(500).json({ error: 'Errore nel recupero della chiave Stripe' });
  }
});

router.get('/products', async (req, res) => {
  try {
    const products = await stripeService.listProducts();
    res.json({ data: products });
  } catch (error) {
    console.error('Error listing products:', error);
    res.status(500).json({ error: 'Errore nel recupero dei prodotti' });
  }
});

router.get('/products-with-prices', async (req, res) => {
  try {
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
    console.error('Error listing products with prices:', error);
    res.status(500).json({ error: 'Errore nel recupero dei prodotti' });
  }
});

router.get('/prices', async (req, res) => {
  try {
    const prices = await stripeService.listPrices();
    res.json({ data: prices });
  } catch (error) {
    console.error('Error listing prices:', error);
    res.status(500).json({ error: 'Errore nel recupero dei prezzi' });
  }
});

router.use(authenticate);

router.get('/subscription', async (req, res) => {
  try {
    const user = (req as any).user;
    
    const { db } = await import('../db');
    const { familyMembers } = await import('../../shared/schema');
    const { eq } = await import('drizzle-orm');
    
    const [membership] = await db
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.userId, user.userId));
    
    if (!membership) {
      return res.json({ subscription: null, status: 'free' });
    }
    
    const family = await stripeService.getFamily(membership.familyId);
    
    if (!family?.stripeSubscriptionId) {
      return res.json({ subscription: null, status: 'free' });
    }

    const subscription = await stripeService.getSubscription(family.stripeSubscriptionId);
    res.json({ 
      subscription,
      status: family.subscriptionStatus || 'free'
    });
  } catch (error) {
    console.error('Error getting subscription:', error);
    res.status(500).json({ error: 'Errore nel recupero dell\'abbonamento' });
  }
});

router.post('/checkout', async (req, res) => {
  try {
    const user = (req as any).user;
    const { priceId, familyId } = req.body;

    if (!priceId || !familyId) {
      return res.status(400).json({ error: 'priceId e familyId sono richiesti' });
    }

    const family = await stripeService.getFamily(familyId);
    if (!family) {
      return res.status(404).json({ error: 'Famiglia non trovata' });
    }

    let customerId = family.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeService.createCustomer(user.email, familyId, family.name);
      await stripeService.updateFamilyStripeInfo(familyId, { stripeCustomerId: customer.id });
      customerId = customer.id;
    }

    const protocol = req.header('x-forwarded-proto') || req.protocol || 'https';
    const host = req.header('x-forwarded-host') || req.get('host');
    const baseUrl = `${protocol}://${host}`;

    const session = await stripeService.createCheckoutSession(
      customerId,
      priceId,
      `${baseUrl}/checkout/success`,
      `${baseUrl}/checkout/cancel`
    );

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Errore nella creazione della sessione di pagamento' });
  }
});

router.post('/portal', async (req, res) => {
  try {
    const user = (req as any).user;
    const { familyId } = req.body;

    if (!familyId) {
      return res.status(400).json({ error: 'familyId è richiesto' });
    }

    const family = await stripeService.getFamily(familyId);
    if (!family?.stripeCustomerId) {
      return res.status(400).json({ error: 'Nessun abbonamento attivo per questa famiglia' });
    }

    const protocol = req.header('x-forwarded-proto') || req.protocol || 'https';
    const host = req.header('x-forwarded-host') || req.get('host');
    const baseUrl = `${protocol}://${host}`;

    const session = await stripeService.createCustomerPortalSession(
      family.stripeCustomerId,
      `${baseUrl}/settings`
    );

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating portal session:', error);
    res.status(500).json({ error: 'Errore nella creazione del portale di gestione' });
  }
});

export default router;
