import { getStripeSync } from './stripeClient';
import { stripeService } from './stripeService';
import { logger } from './logger';

/**
 * Riconcilia la tabella `families` a partire da un evento Stripe già verificato.
 * L'app legge lo stato Premium da `families`, quindi oltre alla sync delle
 * tabelle stripe.* dobbiamo aggiornare esplicitamente la famiglia.
 */
type FamilyReconciler = Pick<
  typeof stripeService,
  'updateFamilyFromStripeSubscription' | 'updateFamilyStripeInfo'
>;

export async function reconcileFamilyFromEvent(
  event: any,
  service: FamilyReconciler = stripeService,
): Promise<void> {
  const type = event?.type as string | undefined;
  const obj = event?.data?.object;
  if (!type || !obj) return;

  if (type.startsWith('customer.subscription.')) {
    // created / updated / deleted: lo stato viene mappato da mapStripeStatusToFamily
    // (deleted arriva con status "canceled" -> famiglia "canceled").
    await service.updateFamilyFromStripeSubscription(obj);
    return;
  }

  if (type === 'checkout.session.completed') {
    const familyId = obj.client_reference_id || obj.metadata?.familyId;
    const customerId =
      typeof obj.customer === 'string' ? obj.customer : obj.customer?.id;
    const subscriptionId =
      typeof obj.subscription === 'string' ? obj.subscription : obj.subscription?.id;

    if (familyId) {
      await service.updateFamilyStripeInfo(familyId, {
        ...(customerId ? { stripeCustomerId: customerId } : {}),
        ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
        subscriptionStatus: 'premium',
      });
    }
    return;
  }
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    // Verifica la firma + sincronizza le tabelle stripe.*. Throwa se la firma è
    // invalida, quindi il payload qui sotto è già verificato.
    await sync.processWebhook(payload, signature);

    try {
      const event = JSON.parse(payload.toString('utf8'));
      await reconcileFamilyFromEvent(event);
    } catch (error) {
      logger.error('Errore riconciliazione famiglia da webhook', { error: String(error) });
    }
  }
}
