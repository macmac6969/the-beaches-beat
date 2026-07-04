import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SubscriberStore } from '../src/subscribers/store.js';
import { classifyEvent, handleWebhook } from '../src/webhook.js';

async function store() {
  const dir = await mkdtemp(join(tmpdir(), 'bb-wh-'));
  const path = join(dir, 'subs.json');
  await writeFile(
    path,
    JSON.stringify([
      { email: 'bounce@x.com', status: 'confirmed' },
      { email: 'spam@x.com', status: 'confirmed' },
    ]),
  );
  return new SubscriberStore(path);
}

test('classifies Resend hard bounce and complaint', () => {
  assert.deepEqual(
    classifyEvent({ type: 'email.bounced', data: { to: ['bounce@x.com'], bounce: { type: 'Permanent' } } }),
    { email: 'bounce@x.com', status: 'bounced' },
  );
  assert.deepEqual(
    classifyEvent({ type: 'email.complained', data: { to: ['spam@x.com'] } }),
    { email: 'spam@x.com', status: 'complained' },
  );
});

test('ignores soft bounces (should retry later, not suppress)', () => {
  assert.equal(
    classifyEvent({ type: 'email.bounced', data: { to: ['x@x.com'], bounce: { type: 'Transient' } } }),
    null,
  );
});

test('classifies Amazon SES-over-SNS bounce and complaint', () => {
  assert.deepEqual(
    classifyEvent({
      notificationType: 'Bounce',
      bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: 'bounce@x.com' }] },
    }),
    { email: 'bounce@x.com', status: 'bounced' },
  );
  assert.deepEqual(
    classifyEvent({
      notificationType: 'Complaint',
      complaint: { complainedRecipients: [{ emailAddress: 'spam@x.com' }] },
    }),
    { email: 'spam@x.com', status: 'complained' },
  );
});

test('webhook suppresses a bounced address in the store', async () => {
  const s = await store();
  const res = await handleWebhook({ type: 'email.bounced', data: { to: ['bounce@x.com'] } }, s);
  assert.equal(res.handled, true);
  assert.equal(res.status, 'bounced');
  const saved = JSON.parse(await readFile(s.path, 'utf8'));
  assert.equal(saved.find((x) => x.email === 'bounce@x.com').status, 'bounced');
  // Confirmed count drops — the address will never be emailed again.
  assert.deepEqual((await s.sendableRecipients()).map((r) => r.email), ['spam@x.com']);
});

test('unknown events are ignored, not errors', async () => {
  const s = await store();
  const res = await handleWebhook({ type: 'email.delivered', data: { to: ['bounce@x.com'] } }, s);
  assert.equal(res.handled, false);
});
