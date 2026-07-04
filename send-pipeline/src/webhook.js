// Bounce & complaint webhook handler.
//
// Deliverability protection is an acceptance criterion: when the ESP tells us
// an address hard-bounced or a recipient marked us as spam, we must suppress
// that address immediately so we never send to it again. This normalizes the
// two provider event shapes we care about (Resend native events, and Amazon
// SES-over-SNS in case the CEO picks SES) into a single action on the store.

/**
 * Map a raw provider webhook payload to a suppression action.
 * @param {any} payload Parsed JSON body from the ESP webhook.
 * @returns {{ email: string, status: 'bounced'|'complained' }|null}
 */
export function classifyEvent(payload) {
  if (!payload || typeof payload !== 'object') return null;

  // --- Resend native events: { type: 'email.bounced', data: { to: [...] } }
  if (typeof payload.type === 'string' && payload.type.startsWith('email.')) {
    const email = firstRecipient(payload.data);
    if (!email) return null;
    if (payload.type === 'email.bounced') {
      // Only hard bounces suppress; soft/transient bounces should retry later.
      const kind = payload.data?.bounce?.type || payload.data?.type;
      if (kind && /soft|transient/i.test(kind)) return null;
      return { email, status: 'bounced' };
    }
    if (payload.type === 'email.complained') return { email, status: 'complained' };
    return null;
  }

  // --- Amazon SES over SNS: { notificationType: 'Bounce'|'Complaint', ... }
  if (payload.notificationType === 'Bounce') {
    if (payload.bounce?.bounceType && payload.bounce.bounceType !== 'Permanent') return null;
    const email = payload.bounce?.bouncedRecipients?.[0]?.emailAddress;
    return email ? { email, status: 'bounced' } : null;
  }
  if (payload.notificationType === 'Complaint') {
    const email = payload.complaint?.complainedRecipients?.[0]?.emailAddress;
    return email ? { email, status: 'complained' } : null;
  }

  return null;
}

function firstRecipient(data) {
  if (!data) return null;
  if (Array.isArray(data.to)) return data.to[0];
  if (typeof data.to === 'string') return data.to;
  if (Array.isArray(data.email)) return data.email[0];
  return data.email || null;
}

/**
 * Process one webhook payload against the store. Returns what it did so the
 * HTTP layer can log / return 200.
 * @param {any} payload
 * @param {import('./subscribers/store.js').SubscriberStore} store
 */
export async function handleWebhook(payload, store) {
  const action = classifyEvent(payload);
  if (!action) return { handled: false, reason: 'ignored event' };
  const result = await store.markStatus(action.email, action.status);
  return { handled: result.updated, email: action.email, status: action.status };
}
