import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SubscriberStore } from '../src/subscribers/store.js';
import { createDryRunAdapter } from '../src/esp/dryRun.js';
import { sendIssue } from '../src/sendIssue.js';

const CONFIG = {
  fromEmail: 'hello@thebeachesbeat.com',
  fromName: 'The Beaches Beat',
  baseUrl: 'https://thebeachesbeat.com',
  unsubSecret: 'test-secret',
};
const ISSUE = { subject: 'Test', bodyHtml: '<p>hi</p>', bodyText: 'hi' };

async function storeWith(subs) {
  const dir = await mkdtemp(join(tmpdir(), 'bb-'));
  const path = join(dir, 'subs.json');
  await writeFile(path, JSON.stringify(subs));
  return new SubscriberStore(path);
}

test('sends only to confirmed subscribers, excluding pending/unsub/bounced/complained', async () => {
  const store = await storeWith([
    { email: 'a@x.com', status: 'confirmed' },
    { email: 'b@x.com', status: 'confirmed' },
    { email: 'pending@x.com', status: 'pending' },
    { email: 'gone@x.com', status: 'unsubscribed' },
    { email: 'dead@x.com', status: 'bounced' },
    { email: 'spam@x.com', status: 'complained' },
  ]);
  const adapter = createDryRunAdapter();
  const report = await sendIssue({ issue: ISSUE, store, adapter, config: CONFIG, pauseMs: 0 });

  assert.equal(report.totalConfirmed, 2);
  assert.equal(report.sent, 2);
  assert.equal(report.failed, 0);
  const recipients = adapter._sent.map((m) => m.to).sort();
  assert.deepEqual(recipients, ['a@x.com', 'b@x.com']);
});

test('every message carries one-click unsubscribe headers', async () => {
  const store = await storeWith([{ email: 'a@x.com', status: 'confirmed' }]);
  const adapter = createDryRunAdapter();
  await sendIssue({ issue: ISSUE, store, adapter, config: CONFIG, pauseMs: 0 });
  const msg = adapter._sent[0];
  assert.match(msg.headers['List-Unsubscribe'], /unsubscribe\?email=/);
  assert.equal(msg.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.match(msg.html, /Unsubscribe in one click/);
});

test('a permanent send failure is recorded but does not abort the run', async () => {
  const store = await storeWith([
    { email: 'ok@x.com', status: 'confirmed' },
    { email: 'boom@x.com', status: 'confirmed' },
    { email: 'ok2@x.com', status: 'confirmed' },
  ]);
  const adapter = {
    name: 'flaky',
    async send(msg) {
      if (msg.to === 'boom@x.com') {
        const e = new Error('bad address');
        e.retryable = false;
        throw e;
      }
      return { id: 'ok' };
    },
  };
  const report = await sendIssue({ issue: ISSUE, store, adapter, config: CONFIG, pauseMs: 0 });
  assert.equal(report.sent, 2);
  assert.equal(report.failed, 1);
  assert.equal(report.results.find((r) => r.email === 'boom@x.com').ok, false);
});

test('transient failures are retried then succeed', async () => {
  const store = await storeWith([{ email: 'a@x.com', status: 'confirmed' }]);
  let attempts = 0;
  const adapter = {
    name: 'retry',
    async send() {
      attempts++;
      if (attempts < 3) {
        const e = new Error('429');
        e.retryable = true;
        throw e;
      }
      return { id: 'ok' };
    },
  };
  const report = await sendIssue({ issue: ISSUE, store, adapter, config: CONFIG, pauseMs: 0 });
  assert.equal(report.sent, 1);
  assert.equal(attempts, 3);
});
