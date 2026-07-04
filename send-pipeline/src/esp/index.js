// Adapter selection.
//
// The pipeline is provider-agnostic: it depends only on `adapter.send(msg)`.
// If a real ESP key is present in the environment we use it; otherwise we fall
// back to the dry-run adapter so `npm start` and the tests always work. This is
// the seam that keeps the CEO's vendor choice a two-way door.

import { createResendAdapter } from './resend.js';
import { createDryRunAdapter } from './dryRun.js';

export function selectAdapter(env = process.env) {
  if (env.RESEND_API_KEY) {
    return createResendAdapter({ apiKey: env.RESEND_API_KEY });
  }
  // Extend here when the CEO picks a different provider, e.g.:
  //   if (env.POSTMARK_TOKEN) return createPostmarkAdapter(...)
  return createDryRunAdapter();
}
