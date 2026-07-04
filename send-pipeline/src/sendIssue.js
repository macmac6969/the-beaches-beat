// Core send pipeline: the repeatable, reliable "send a weekly issue" action.
//
// Guarantees:
//  - Only double-opt-in *confirmed* recipients are emailed (unsubscribes,
//    bounces and complaints are excluded by the store).
//  - Every message carries one-click unsubscribe headers.
//  - Transient provider failures (429/5xx) are retried with backoff; permanent
//    failures are recorded, never retried, and never abort the whole run.
//  - A structured send report is returned (and can be logged) so CUB-7
//    analytics has a trustworthy source for "sent" counts.

import { renderMessage } from './render.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object}   opts
 * @param {import('./render.js').Issue} opts.issue
 * @param {import('./subscribers/store.js').SubscriberStore} opts.store
 * @param {{ send: Function, name: string }} opts.adapter
 * @param {{ fromEmail:string, fromName:string, baseUrl:string, unsubSecret:string }} opts.config
 * @param {number} [opts.batchSize=50]      Messages per batch.
 * @param {number} [opts.pauseMs=1000]      Pause between batches (rate limiting).
 * @param {number} [opts.maxRetries=3]      Retries per message on transient error.
 * @param {(m:string)=>void} [opts.log]
 */
export async function sendIssue(opts) {
  const {
    issue,
    store,
    adapter,
    config,
    batchSize = 50,
    pauseMs = 1000,
    maxRetries = 3,
    log = () => {},
  } = opts;

  const recipients = await store.sendableRecipients();
  const report = {
    issueSubject: issue.subject,
    provider: adapter.name,
    startedAt: new Date().toISOString(),
    totalConfirmed: recipients.length,
    sent: 0,
    failed: 0,
    results: /** @type {Array<{email:string, ok:boolean, id?:string, error?:string}>} */ ([]),
  };

  log(`Sending "${issue.subject}" to ${recipients.length} confirmed subscriber(s) via ${adapter.name}`);

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    for (const sub of batch) {
      const msg = renderMessage(issue, sub, config);
      const res = await sendWithRetry(adapter, msg, maxRetries);
      if (res.ok) {
        report.sent++;
        report.results.push({ email: sub.email, ok: true, id: res.id });
      } else {
        report.failed++;
        report.results.push({ email: sub.email, ok: false, error: res.error });
        log(`  FAILED ${sub.email}: ${res.error}`);
      }
    }
    if (i + batchSize < recipients.length && pauseMs > 0) await sleep(pauseMs);
  }

  report.finishedAt = new Date().toISOString();
  log(`Done: ${report.sent} sent, ${report.failed} failed of ${report.totalConfirmed}`);
  return report;
}

async function sendWithRetry(adapter, msg, maxRetries) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const r = await adapter.send(msg);
      return { ok: true, id: r.id };
    } catch (err) {
      const retryable = err.retryable !== false; // default retryable unless adapter says otherwise
      if (retryable && attempt < maxRetries) {
        attempt++;
        await sleep(250 * 2 ** (attempt - 1)); // 250ms, 500ms, 1s backoff
        continue;
      }
      return { ok: false, error: err.message };
    }
  }
}
