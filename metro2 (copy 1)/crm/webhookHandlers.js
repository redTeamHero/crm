import { getStripeSync } from './stripeClient.js';
import { emitHostNotification } from './hostNotificationsStore.js';
import { logWarn } from './logger.js';

// Map Stripe webhook event types → CRM notification event types
const STRIPE_NOTIFICATION_MAP = {
  'customer.subscription.updated': 'subscription_renewed',
  'customer.subscription.deleted': 'subscription_renewed',
  'invoice.paid': 'subscription_renewed',
  'charge.refunded': 'refund_issued',
  'customer.subscription.trial_will_end': 'trial_ending_soon',
};

export class WebhookHandlers {
  static async processWebhook(payload, signature) {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // Emit CRM notifications for Stripe billing events
    try {
      const event = JSON.parse(payload.toString('utf8'));
      const notifType = STRIPE_NOTIFICATION_MAP[event?.type];
      if (notifType) {
        const obj = event?.data?.object || {};
        let message = '';
        if (notifType === 'subscription_renewed') {
          message = `Subscription updated${obj.customer ? ` for customer ${obj.customer}` : ''}`;
        } else if (notifType === 'refund_issued') {
          const amt = obj.amount_refunded != null ? ` ($${(obj.amount_refunded / 100).toFixed(2)})` : '';
          message = `Refund issued${amt}`;
        } else if (notifType === 'trial_ending_soon') {
          message = `Trial ending soon${obj.trial_end ? ` on ${new Date(obj.trial_end * 1000).toDateString()}` : ''}`;
        } else {
          message = `Stripe event: ${event.type}`;
        }
        await emitHostNotification(notifType, message, { stripeEventType: event.type, stripeObjectId: obj.id || null }).catch(() => {});
      }
    } catch (parseErr) {
      logWarn('STRIPE_NOTIF_EMIT_ERROR', parseErr?.message || String(parseErr));
    }
  }
}
