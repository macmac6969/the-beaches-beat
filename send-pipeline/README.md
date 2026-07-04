# The Beaches Beat — Weekly Send Pipeline (CUB-5)

Reliable, repeatable weekly sending. **ESP-agnostic** so the CEO's vendor choice
stays a two-way door: the pipeline only depends on a tiny `adapter.send(msg)`
contract.

## What works today (dry-run, no key, no spend)

```bash
cd send-pipeline
npm test          # 9 tests: filtering, retries, unsubscribe headers, bounce/complaint webhook
npm run send      # dry-run send of a test issue to the sample confirmed list
```

Dry-run runs the **entire** pipeline — loads subscribers, excludes everyone who
isn't `confirmed`, renders each message with one-click unsubscribe, batches with
retry, and writes a structured send report to `data/send-logs/` — without
touching a provider. This is how we prove the loop before spending a cent.

## Acceptance criteria → where it's met

| Criterion | Implementation |
|---|---|
| ESP integrated | `src/esp/` — `resend.js` (recommended), `dryRun.js`, `index.js` selects by env. Swap-in-place. |
| Send to confirmed list, exclude unsubscribes | `src/subscribers/store.js` `sendableRecipients()` — only `status === 'confirmed'`; pending/unsubscribed/bounced/complained excluded. Proven in tests. |
| Bounces/complaints handled | `src/webhook.js` — normalizes Resend + SES events, suppresses hard bounces & complaints (ignores soft bounces). Proven in tests. |
| Test issue to a real inbox | ⛔ **Needs CEO**: ESP API key + verified sending domain. See below. |

## Going live (blocked on CEO — see CUB-5 escalation)

The code is done. Two things I can't self-provision (vendor/spend + DNS):

1. **ESP account + API key.** Recommended: **Resend** — 3,000 emails/mo free (no
   card), clean API, DKIM in minutes, native bounce/complaint webhooks. Once the
   CEO provisions it, set `RESEND_API_KEY` and the *same* `npm run send` performs
   a real send — zero code change.
2. **Verified sending domain (depends on CUB-2).** DKIM/SPF/DMARC on
   `thebeachesbeat.com` so mail authenticates and lands in the inbox.

```bash
export RESEND_API_KEY=re_xxx            # provisioned by CEO
export FROM_EMAIL=hello@thebeachesbeat.com
export SITE_BASE_URL=https://thebeachesbeat.com
export UNSUB_SECRET=<random 32+ char secret>
npm run send -- data/issues/2026-07-04-welcome.json data/subscribers.sample.json
```

Point the ESP's bounce/complaint webhook at an endpoint that calls
`handleWebhook(payload, store)` (`src/webhook.js`).

## Design notes

- **Reversible by construction.** Provider lives behind one file; subscriber
  storage behind one interface (file-backed now, swap for CUB-4's DB later).
- **Deliverability first.** Confirmed-only sending, one-click `List-Unsubscribe`
  (RFC 8058), automatic suppression on hard bounce/complaint.
- **Trustworthy analytics.** Every run writes a send report (sent/failed/per-
  recipient) for CUB-7 to consume.
