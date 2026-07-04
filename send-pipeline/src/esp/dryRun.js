// Dry-run ESP adapter.
//
// Records every message it would send instead of hitting a provider. This is
// what runs until the CEO provisions a real ESP key, and it's what the tests
// run against — so the whole pipeline (filtering, rendering, batching,
// suppression) is proven before a single real email or dollar is spent.

export function createDryRunAdapter() {
  const sent = [];
  return {
    name: 'dry-run',
    /** @param {{to:string, subject:string, html:string, text:string, headers?:object}} msg */
    async send(msg) {
      const id = `dryrun-${sent.length + 1}`;
      sent.push({ id, ...msg });
      return { id, provider: 'dry-run', accepted: true };
    },
    // Test/inspection hook — not part of the adapter contract used by sendIssue.
    _sent: sent,
  };
}
