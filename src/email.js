// Email building + pluggable transport.
// Transport 'outbox' writes rendered emails to disk so the full opt-in loop is
// demonstrable with NO ESP. CUB-5 will add an 'esp' transport behind sendEmail().

import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

/** Compliance footer — CAN-SPAM (physical address + clear identity) + one-click unsubscribe. */
export function footerText(unsubscribeUrl) {
  return [
    '',
    '—',
    `${config.sender.name} · ${config.listName}`,
    config.physicalAddress,
    `Unsubscribe (one-click): ${unsubscribeUrl}`,
    'You are receiving this because you signed up at The Beaches Beat. We never share your email.',
  ].join('\n');
}

export function confirmUrl(subscriber) {
  return `${config.publicBaseUrl}/confirm?token=${subscriber.confirm_token}`;
}

export function unsubscribeUrl(subscriber) {
  return `${config.publicBaseUrl}/unsubscribe?token=${subscriber.unsubscribe_token}`;
}

/** Build the double opt-in confirmation email for a pending subscriber. */
export function buildConfirmationEmail(subscriber) {
  const cUrl = confirmUrl(subscriber);
  const uUrl = unsubscribeUrl(subscriber);
  const body =
    `Thanks for signing up to ${config.listName}.\n\n` +
    `Please confirm your subscription by clicking this link:\n${cUrl}\n\n` +
    `If you didn't request this, just ignore this email — you won't be added.\n` +
    footerText(uUrl);
  return {
    to: subscriber.email,
    from: `${config.sender.name} <${config.sender.email}>`,
    subject: `Confirm your subscription to ${config.listName}`,
    text: body,
    headers: {
      // RFC 8058 one-click unsubscribe so mailbox providers can honor it directly.
      'List-Unsubscribe': `<${uUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

/** Transport dispatch. Returns metadata about where the message went. */
export function sendEmail(message) {
  if (config.mailTransport === 'outbox') {
    fs.mkdirSync(config.outboxDir, { recursive: true });
    const safe = message.to.replace(/[^a-z0-9]+/gi, '_');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(config.outboxDir, `${stamp}__${safe}.json`);
    fs.writeFileSync(file, JSON.stringify(message, null, 2));
    return { transport: 'outbox', file };
  }
  // CUB-5 hook point: implement 'esp' transport here (SES/Postmark/etc) once provisioned.
  throw new Error(`unknown mail transport: ${config.mailTransport}`);
}
