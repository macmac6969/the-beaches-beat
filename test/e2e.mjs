// End-to-end proof of the consent loop:
//   signup -> (confirmation email) -> click confirm -> appears as confirmed on send list
//   -> click one-click unsubscribe -> excluded from send list.
// Uses the outbox transport and reads the real confirmation email a subscriber would receive.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'beaches-e2e-'));
process.env.DB_PATH = path.join(tmp, 'subs.db');
process.env.OUTBOX_DIR = path.join(tmp, 'outbox');
process.env.PUBLIC_BASE_URL = 'http://127.0.0.1:0'; // overwritten below once we know the port
process.env.MAIL_TRANSPORT = 'outbox';

// Import AFTER env is set so config picks it up.
const { openDb, SubscriberStore } = await import('../src/db.js');
const { createApp } = await import('../src/server.js');

const db = openDb(process.env.DB_PATH);
const store = new SubscriberStore(db);
const server = createApp(store);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// Rewrite config.publicBaseUrl to the live port so email links are clickable against this server.
const { config } = await import('../src/config.js');
config.publicBaseUrl = base;

const log = (...a) => console.log(...a);
const step = (n, s) => log(`\n[${n}] ${s}`);

function latestEmailFor(email) {
  const files = fs
    .readdirSync(process.env.OUTBOX_DIR)
    .filter((f) => f.includes(email.replace(/[^a-z0-9]+/gi, '_')))
    .sort();
  const msg = JSON.parse(fs.readFileSync(path.join(process.env.OUTBOX_DIR, files.at(-1))));
  return msg;
}
const urlFrom = (text, re) => text.match(re)[1];

const EMAIL = 'reader@beaches.example';

try {
  // 1. Signup
  step(1, `Signup: POST /api/subscribe  {email: ${EMAIL}}`);
  let r = await fetch(`${base}/api/subscribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, source: 'e2e-test' }),
  });
  assert.equal(r.status, 202, 'subscribe should return 202');
  log('    ->', JSON.stringify(await r.json()));
  assert.equal(store.getByEmail(EMAIL).state, 'pending', 'state should be pending after signup');
  log('    DB state: pending ✓');

  // 2. Read the confirmation email (as the subscriber would) and click the confirm link.
  step(2, 'Open confirmation email from outbox, click the confirm link');
  const mail = latestEmailFor(EMAIL);
  log('    Subject:', mail.subject);
  assert.ok(mail.headers['List-Unsubscribe'], 'email must carry List-Unsubscribe header');
  assert.ok(mail.text.includes(config.physicalAddress.slice(0, 12)), 'footer must include physical address');
  const confirmLink = urlFrom(mail.text, /(https?:\/\/\S*\/confirm\?token=\S+)/);
  log('    Confirm link:', confirmLink);
  r = await fetch(confirmLink);
  assert.equal(r.status, 200);
  assert.equal(store.getByEmail(EMAIL).state, 'confirmed', 'state should be confirmed after clicking link');
  assert.ok(store.getByEmail(EMAIL).confirmed_at, 'confirmed_at timestamp should be set');
  log('    DB state: confirmed ✓  confirmed_at:', store.getByEmail(EMAIL).confirmed_at);

  // 3. Appears on the send list
  step(3, 'GET /api/send-list — confirmed subscriber is included');
  let list = await (await fetch(`${base}/api/send-list`)).json();
  assert.ok(list.some((s) => s.email === EMAIL), 'confirmed subscriber must be on send list');
  log('    send-list:', JSON.stringify(list));

  // 4. One-click unsubscribe (RFC 8058 POST, the mailbox-provider path)
  step(4, 'One-click unsubscribe: POST /unsubscribe (RFC 8058 List-Unsubscribe-Post)');
  const unsubLink = urlFrom(mail.text, /Unsubscribe \(one-click\): (https?:\/\/\S+)/);
  log('    Unsubscribe link:', unsubLink);
  r = await fetch(unsubLink, { method: 'POST', body: 'List-Unsubscribe=One-Click' });
  assert.equal(r.status, 200);
  assert.equal(store.getByEmail(EMAIL).state, 'unsubscribed', 'state should be unsubscribed');
  assert.ok(store.getByEmail(EMAIL).unsubscribed_at, 'unsubscribed_at timestamp should be set');
  log('    DB state: unsubscribed ✓  unsubscribed_at:', store.getByEmail(EMAIL).unsubscribed_at);

  // 5. Excluded from send list
  step(5, 'GET /api/send-list — unsubscribed subscriber is excluded');
  list = await (await fetch(`${base}/api/send-list`)).json();
  assert.ok(!list.some((s) => s.email === EMAIL), 'unsubscribed subscriber must NOT be on send list');
  log('    send-list:', JSON.stringify(list));

  // 6. Idempotency + edge cases
  step(6, 'Edge cases: bad email rejected, confirm-after-unsub blocked, unsubscribe idempotent');
  r = await fetch(`${base}/api/subscribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email' }),
  });
  assert.equal(r.status, 400, 'invalid email must be rejected');
  const c2 = store.confirm(store.getByEmail(EMAIL).confirm_token);
  assert.equal(c2.outcome, 'unsubscribed', 'cannot re-confirm an unsubscribed address via old link');
  const u2 = store.unsubscribe(store.getByEmail(EMAIL).unsubscribe_token);
  assert.equal(u2.outcome, 'already_unsubscribed', 'unsubscribe is idempotent');
  log('    All edge cases held ✓');

  log('\nSTATS:', JSON.stringify(store.stats()));
  log('\n✅ E2E PASSED: signup → confirm → on send list → unsubscribe → off send list.');
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
} catch (err) {
  console.error('\n❌ E2E FAILED:', err.message);
  server.close();
  process.exitCode = 1;
}
