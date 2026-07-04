// Subscriber store + consent state machine.
// States: pending -> confirmed -> unsubscribed (unsubscribe reachable from any state).
// Backed by SQLite via Node's built-in node:sqlite (no external deps, fully portable/reversible).

import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const STATES = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  UNSUBSCRIBED: 'unsubscribed',
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email.trim());
}

function nowIso() {
  return new Date().toISOString();
}

function token() {
  // 256 bits, url-safe, unguessable. Separate tokens per action so an
  // unsubscribe link can never confirm and a confirm link can never unsubscribe.
  return randomBytes(32).toString('base64url');
}

export function openDb(dbPath) {
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      email             TEXT NOT NULL UNIQUE COLLATE NOCASE,
      state             TEXT NOT NULL DEFAULT 'pending'
                          CHECK (state IN ('pending','confirmed','unsubscribed')),
      confirm_token     TEXT NOT NULL,
      unsubscribe_token TEXT NOT NULL,
      source            TEXT,
      consent_ip        TEXT,
      created_at        TEXT NOT NULL,
      confirmed_at      TEXT,
      unsubscribed_at   TEXT,
      updated_at        TEXT NOT NULL
    );
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_subscribers_state ON subscribers(state);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_subscribers_confirm ON subscribers(confirm_token);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_subscribers_unsub ON subscribers(unsubscribe_token);');
  return db;
}

export class SubscriberStore {
  constructor(db) {
    this.db = db;
  }

  getByEmail(email) {
    return this.db
      .prepare('SELECT * FROM subscribers WHERE email = ? COLLATE NOCASE')
      .get(String(email).trim());
  }

  getByConfirmToken(t) {
    return this.db.prepare('SELECT * FROM subscribers WHERE confirm_token = ?').get(t);
  }

  getByUnsubscribeToken(t) {
    return this.db.prepare('SELECT * FROM subscribers WHERE unsubscribe_token = ?').get(t);
  }

  /**
   * Idempotent signup. Returns { subscriber, outcome }.
   * outcome: 'created' | 'already_pending' | 'already_confirmed' | 'resubscribed'
   * A pending or resubscribed outcome means a confirmation email should be (re)sent.
   */
  subscribe(email, { source = null, ip = null } = {}) {
    const clean = String(email).trim();
    if (!isValidEmail(clean)) {
      const err = new Error('invalid_email');
      err.code = 'invalid_email';
      throw err;
    }
    const existing = this.getByEmail(clean);
    const ts = nowIso();

    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO subscribers
             (email, state, confirm_token, unsubscribe_token, source, consent_ip, created_at, updated_at)
           VALUES (?, 'pending', ?, ?, ?, ?, ?, ?)`
        )
        .run(clean, token(), token(), source, ip, ts, ts);
      return { subscriber: this.getByEmail(clean), outcome: 'created' };
    }

    if (existing.state === STATES.CONFIRMED) {
      return { subscriber: existing, outcome: 'already_confirmed' };
    }

    if (existing.state === STATES.UNSUBSCRIBED) {
      // Re-consent: reset to pending with fresh tokens so a new double opt-in is required.
      this.db
        .prepare(
          `UPDATE subscribers
             SET state='pending', confirm_token=?, unsubscribe_token=?, source=?, consent_ip=?,
                 confirmed_at=NULL, unsubscribed_at=NULL, updated_at=?
           WHERE id=?`
        )
        .run(token(), token(), source, ip, ts, existing.id);
      return { subscriber: this.db.prepare('SELECT * FROM subscribers WHERE id=?').get(existing.id), outcome: 'resubscribed' };
    }

    // Already pending: keep the same confirm token so the prior link still works; just re-send.
    return { subscriber: existing, outcome: 'already_pending' };
  }

  /** Confirm via token. Returns { subscriber, outcome }. outcome: 'confirmed' | 'already_confirmed' | 'unsubscribed' | 'not_found' */
  confirm(confirmToken) {
    const row = this.getByConfirmToken(confirmToken);
    if (!row) return { subscriber: null, outcome: 'not_found' };
    if (row.state === STATES.CONFIRMED) return { subscriber: row, outcome: 'already_confirmed' };
    if (row.state === STATES.UNSUBSCRIBED) return { subscriber: row, outcome: 'unsubscribed' };
    const ts = nowIso();
    this.db
      .prepare(`UPDATE subscribers SET state='confirmed', confirmed_at=?, updated_at=? WHERE id=?`)
      .run(ts, ts, row.id);
    return { subscriber: this.db.prepare('SELECT * FROM subscribers WHERE id=?').get(row.id), outcome: 'confirmed' };
  }

  /** Unsubscribe via token. Idempotent. Returns { subscriber, outcome }. outcome: 'unsubscribed' | 'already_unsubscribed' | 'not_found' */
  unsubscribe(unsubToken) {
    const row = this.getByUnsubscribeToken(unsubToken);
    if (!row) return { subscriber: null, outcome: 'not_found' };
    if (row.state === STATES.UNSUBSCRIBED) return { subscriber: row, outcome: 'already_unsubscribed' };
    const ts = nowIso();
    this.db
      .prepare(`UPDATE subscribers SET state='unsubscribed', unsubscribed_at=?, updated_at=? WHERE id=?`)
      .run(ts, ts, row.id);
    return { subscriber: this.db.prepare('SELECT * FROM subscribers WHERE id=?').get(row.id), outcome: 'unsubscribed' };
  }

  /** The send list: only confirmed subscribers. Unsubscribes and pendings are excluded by construction. */
  sendList() {
    return this.db
      .prepare(`SELECT * FROM subscribers WHERE state='confirmed' ORDER BY confirmed_at ASC`)
      .all();
  }

  stats() {
    const rows = this.db
      .prepare('SELECT state, COUNT(*) AS n FROM subscribers GROUP BY state')
      .all();
    const out = { pending: 0, confirmed: 0, unsubscribed: 0, total: 0 };
    for (const r of rows) {
      out[r.state] = r.n;
      out.total += r.n;
    }
    // Confirm rate = confirmed / (pending + confirmed + unsubscribed that ever confirmed is unknown here);
    // report the simple confirmed / total-ever-pending proxy.
    return out;
  }
}
