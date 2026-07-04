#!/usr/bin/env node
// CLI: send one issue to the confirmed list.
//
//   node bin/send.js <issue.json> [subscribers.json]
//
// With no ESP key in the environment this runs in dry-run mode and prints
// exactly what *would* be sent — safe to run anytime. With RESEND_API_KEY set
// (once the CEO provisions it) the same command performs the real send.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SubscriberStore } from '../src/subscribers/store.js';
import { selectAdapter } from '../src/esp/index.js';
import { sendIssue } from '../src/sendIssue.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

async function main() {
  const issuePath = process.argv[2] || join(root, 'data/issues/2026-07-04-welcome.json');
  const subsPath = process.argv[3] || join(root, 'data/subscribers.sample.json');

  const issue = JSON.parse(await readFile(issuePath, 'utf8'));
  const store = new SubscriberStore(subsPath);
  const adapter = selectAdapter();

  const config = {
    fromEmail: process.env.FROM_EMAIL || 'hello@thebeachesbeat.com',
    fromName: process.env.FROM_NAME || 'The Beaches Beat',
    baseUrl: process.env.SITE_BASE_URL || 'https://thebeachesbeat.com',
    // In production this MUST come from the environment; the fallback only
    // exists so dry-runs work out of the box.
    unsubSecret: process.env.UNSUB_SECRET || 'dev-only-unsub-secret',
  };

  if (adapter.name === 'dry-run') {
    console.log('\n⚠  No ESP key found — running in DRY-RUN mode (no real emails sent).');
    console.log('   Set RESEND_API_KEY (see README / CUB-5 escalation) to send for real.\n');
  }

  const report = await sendIssue({ issue, store, adapter, config, log: (m) => console.log(m) });

  const outDir = join(root, 'data/send-logs');
  await mkdir(outDir, { recursive: true });
  const stamp = report.startedAt.replace(/[:.]/g, '-');
  const outPath = join(outDir, `${stamp}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`\nSend report written to ${outPath}`);

  // Dry-run: show the concrete messages that would go out.
  if (adapter._sent) {
    console.log(`\n${adapter._sent.length} message(s) prepared:`);
    for (const m of adapter._sent) {
      console.log(`  → ${m.to} | "${m.subject}" | List-Unsubscribe: ${m.headers?.['List-Unsubscribe'] ? 'yes' : 'no'}`);
    }
  }
}

main().catch((err) => {
  console.error('Send failed:', err);
  process.exit(1);
});
