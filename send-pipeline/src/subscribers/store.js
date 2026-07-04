// Subscriber store.
//
// Reversibility note: this is a thin, file-backed store today so the send
// pipeline is fully testable before CUB-4's real subscriber DB exists. The
// interface (loadSubscribers / sendableRecipients / markStatus) is what the
// rest of the pipeline depends on, so swapping the JSON file for Postgres /
// Supabase later is a one-file change with no impact on sendIssue or webhook.

import { readFile, writeFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';

/**
 * @typedef {'pending'|'confirmed'|'unsubscribed'|'bounced'|'complained'} SubStatus
 * @typedef {{ email: string, name?: string, status: SubStatus,
 *   confirmedAt?: string|null, unsubscribedAt?: string|null }} Subscriber
 */

// Only double-opt-in confirmed subscribers receive an issue. Everything else
// (pending confirmation, unsubscribed, hard-bounced, complained) is excluded
// to protect deliverability — sending to unconfirmed or dead addresses is the
// fastest way to wreck sender reputation.
export const SENDABLE_STATUS = 'confirmed';

/** @param {Subscriber} sub */
export function isSendable(sub) {
  return sub.status === SENDABLE_STATUS;
}

export class SubscriberStore {
  /** @param {string} path Path to the JSON-backed subscriber list. */
  constructor(path) {
    this.path = path;
  }

  /** @returns {Promise<Subscriber[]>} */
  async load() {
    const raw = await readFile(this.path, 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error('subscriber file must be a JSON array');
    return data;
  }

  /** Confirmed recipients only, unsubscribes/bounces/complaints excluded. */
  async sendableRecipients() {
    const all = await this.load();
    return all.filter(isSendable);
  }

  /**
   * Update a subscriber's status and persist. Used by the webhook handler to
   * suppress an address after a hard bounce or spam complaint.
   * @param {string} email
   * @param {SubStatus} status
   */
  async markStatus(email, status) {
    const all = await this.load();
    const norm = email.trim().toLowerCase();
    const sub = all.find((s) => s.email.trim().toLowerCase() === norm);
    if (!sub) return { updated: false };
    sub.status = status;
    if (status === 'unsubscribed') sub.unsubscribedAt = new Date().toISOString();
    await writeFile(this.path, JSON.stringify(all, null, 2) + '\n');
    return { updated: true, email: sub.email, status };
  }
}

/**
 * Deterministic, non-guessable per-recipient unsubscribe token. Lets the
 * one-click unsubscribe endpoint (CUB-4) verify a request without a DB lookup
 * secret leaking into the URL. Uses HMAC so tokens can't be forged.
 * @param {string} email
 * @param {string} secret
 */
export function unsubscribeToken(email, secret) {
  return createHmac('sha256', secret)
    .update(email.trim().toLowerCase())
    .digest('hex')
    .slice(0, 32);
}
