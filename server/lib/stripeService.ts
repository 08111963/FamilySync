import { db } from '../db';
import { sql, eq } from 'drizzle-orm';
import { families } from '../../shared/schema';
import { getUncachableStripeClient } from './stripeClient';
import type Stripe from 'stripe';

export type Plan = 'monthly' | 'yearly';

export const PLAN_TO_INTERVAL: Record<Plan, 'month' | 'year'> = {
  monthly: 'month',
  yearly: 'year',
};

const PREMIUM_CURRENCY = 'eur';

/** Errore di configurazione/validazione pagamenti, con codice mappabile a HTTP. */
export class PaymentConfigError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'PaymentConfigError';
  }
}

/** Valida il piano inviato dal client. Throwa PaymentConfigError('INVALID_PLAN'). */
export function validatePlan(plan: unknown): Plan {
  if (plan === 'monthly' || plan === 'yearly') return plan;
  throw new PaymentConfigError('INVALID_PLAN', 'Piano non valido: usa "monthly" o "yearly"');
}

/**
 * Mappa lo stato di una subscription Stripe sullo stato famiglia (enum app).
 * - active / trialing / past_due (grace) -> "premium"
 * - tutto il resto (canceled, incomplete, incomplete_expired, unpaid, paused) -> "canceled"
 */
export function mapStripeStatusToFamily(status: string | null | undefined): 'premium' | 'canceled' {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due':
      return 'premium';
    default:
      return 'canceled';
  }
}

/** Estrae il riferimento famiglia da una subscription Stripe (metadata o customer). */
export function extractFamilyRefFromSubscription(subscription: any): {
  familyId?: string;
  customerId?: string;
} {
  const familyId = subscription?.metadata?.familyId as string | undefined;
  const customerId =
    typeof subscription?.customer === 'string'
      ? subscription.customer
      : subscription?.customer?.id;
  return { familyId: familyId || undefined, customerId: customerId || undefined };
}

/**
 * Costruisce i parametri della checkout session includendo familyId e userId
 * come metadata + client_reference_id + subscription_data.metadata, così il
 * webhook può riconciliare sessione/subscription con la famiglia corretta.
 */
export function buildCheckoutSessionParams(opts: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  familyId: string;
  userId: string;
}): Stripe.Checkout.SessionCreateParams {
  return {
    customer: opts.customerId,
    payment_method_types: ['card'],
    line_items: [{ price: opts.priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.familyId,
    metadata: { familyId: opts.familyId, userId: opts.userId },
    subscription_data: {
      metadata: { familyId: opts.familyId, userId: opts.userId },
    },
  };
}

/**
 * Risolve il priceId lato server a partire dal piano scelto dal client.
 * Il client NON invia mai il priceId: lo scegliamo noi dal prodotto
 * "FamilySync Premium" su Stripe, validando: prodotto premium, prezzo attivo,
 * intervallo ricorrente coerente, valuta EUR.
 */
export async function resolvePriceIdForPlan(plan: Plan, stripe: Stripe): Promise<string> {
  const interval = PLAN_TO_INTERVAL[validatePlan(plan)];

  let product: Stripe.Product | undefined;
  try {
    const search = await stripe.products.search({
      query: "name:'FamilySync Premium' AND active:'true'",
    });
    product =
      search.data.find((p) => p.metadata?.tier === 'premium') || search.data[0];
  } catch {
    // search API non disponibile -> fallback su list
  }

  if (!product) {
    const list = await stripe.products.list({ active: true, limit: 100 });
    product = list.data.find(
      (p) => p.metadata?.tier === 'premium' || p.name === 'FamilySync Premium',
    );
  }

  if (!product) {
    throw new PaymentConfigError(
      'PRODUCT_NOT_FOUND',
      'Prodotto FamilySync Premium non trovato su Stripe',
    );
  }

  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  const match = prices.data.find(
    (pr) =>
      pr.active &&
      pr.recurring?.interval === interval &&
      pr.currency?.toLowerCase() === PREMIUM_CURRENCY,
  );

  if (!match) {
    throw new PaymentConfigError(
      'PRICE_NOT_FOUND',
      `Nessun prezzo ${interval} attivo in ${PREMIUM_CURRENCY.toUpperCase()} per FamilySync Premium`,
    );
  }

  return match.id;
}

export class StripeService {
  async createCustomer(email: string, familyId: string, familyName: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.customers.create({
      email,
      metadata: { familyId, familyName },
    });
  }

  /** Risolve il priceId attivo per il piano usando il client Stripe reale. */
  async getPriceIdForPlan(plan: Plan): Promise<string> {
    const stripe = await getUncachableStripeClient();
    return resolvePriceIdForPlan(plan, stripe);
  }

  async createCheckoutSession(opts: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    familyId: string;
    userId: string;
  }) {
    const stripe = await getUncachableStripeClient();
    return await stripe.checkout.sessions.create(buildCheckoutSessionParams(opts));
  }

  async createCustomerPortalSession(customerId: string, returnUrl: string) {
    const stripe = await getUncachableStripeClient();
    return await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  async getProduct(productId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.products WHERE id = ${productId}`
    );
    return result.rows[0] || null;
  }

  async listProducts(active = true, limit = 20, offset = 0) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.products WHERE active = ${active} LIMIT ${limit} OFFSET ${offset}`
    );
    if (result.rows.length === 0) {
      const stripe = await getUncachableStripeClient();
      const products = await stripe.products.list({ active, limit });
      return products.data;
    }
    return result.rows;
  }

  async listProductsWithPrices(active = true, limit = 20, offset = 0) {
    const result = await db.execute(
      sql`
        WITH paginated_products AS (
          SELECT id, name, description, metadata, active
          FROM stripe.products
          WHERE active = ${active}
          ORDER BY id
          LIMIT ${limit} OFFSET ${offset}
        )
        SELECT 
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          p.active as product_active,
          p.metadata as product_metadata,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency,
          pr.recurring,
          pr.active as price_active,
          pr.metadata as price_metadata
        FROM paginated_products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        ORDER BY p.id, pr.unit_amount
      `
    );
    
    if (result.rows.length === 0) {
      const stripe = await getUncachableStripeClient();
      const products = await stripe.products.list({ active, limit });
      const productsWithPrices = await Promise.all(
        products.data.map(async (product) => {
          const prices = await stripe.prices.list({ product: product.id, active: true });
          return {
            product_id: product.id,
            product_name: product.name,
            product_description: product.description,
            product_active: product.active,
            product_metadata: product.metadata,
            prices: prices.data.map(price => ({
              price_id: price.id,
              unit_amount: price.unit_amount,
              currency: price.currency,
              recurring: price.recurring,
              price_active: price.active,
              price_metadata: price.metadata
            }))
          };
        })
      );
      return productsWithPrices;
    }
    
    return result.rows;
  }

  async getPrice(priceId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.prices WHERE id = ${priceId}`
    );
    return result.rows[0] || null;
  }

  async listPrices(active = true, limit = 20, offset = 0) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.prices WHERE active = ${active} LIMIT ${limit} OFFSET ${offset}`
    );
    return result.rows;
  }

  async getPricesForProduct(productId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.prices WHERE product = ${productId} AND active = true`
    );
    return result.rows;
  }

  async getSubscription(subscriptionId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.subscriptions WHERE id = ${subscriptionId}`
    );
    return result.rows[0] || null;
  }

  async updateFamilyStripeInfo(familyId: string, stripeInfo: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    subscriptionStatus?: 'free' | 'premium' | 'canceled';
    subscriptionCurrentPeriodEnd?: Date;
  }) {
    const [family] = await db
      .update(families)
      .set(stripeInfo)
      .where(eq(families.id, familyId))
      .returning();
    return family;
  }

  /**
   * Aggiorna la tabella `families` a partire da un oggetto subscription Stripe
   * (eventi customer.subscription.*). L'app legge lo stato Premium da `families`,
   * quindi non basta sincronizzare le tabelle stripe.*.
   */
  async updateFamilyFromStripeSubscription(subscription: any) {
    const { familyId, customerId } = extractFamilyRefFromSubscription(subscription);
    const status = mapStripeStatusToFamily(subscription?.status);
    const periodEnd =
      typeof subscription?.current_period_end === 'number'
        ? new Date(subscription.current_period_end * 1000)
        : undefined;

    const set: {
      subscriptionStatus: 'free' | 'premium' | 'canceled';
      stripeSubscriptionId: string | null;
      subscriptionCurrentPeriodEnd?: Date;
    } = {
      subscriptionStatus: status,
      stripeSubscriptionId: subscription?.id ?? null,
    };
    if (periodEnd) set.subscriptionCurrentPeriodEnd = periodEnd;

    if (familyId) {
      const [family] = await db
        .update(families)
        .set(set)
        .where(eq(families.id, familyId))
        .returning();
      return family;
    }

    if (customerId) {
      const [family] = await db
        .update(families)
        .set(set)
        .where(eq(families.stripeCustomerId, customerId))
        .returning();
      return family;
    }

    return undefined;
  }

  async getFamily(familyId: string) {
    const [family] = await db.select().from(families).where(eq(families.id, familyId));
    return family;
  }
}

export const stripeService = new StripeService();
