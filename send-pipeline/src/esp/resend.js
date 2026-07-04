// Resend ESP adapter.
//
// Resend is the *recommended* provider (see README + CEO escalation on CUB-5):
// free tier of 3,000 emails/mo with no card, clean HTTP API, DKIM in minutes,
// and native bounce/complaint webhooks. Nothing below is Resend-specific in a
// way that locks us in — it's a standard REST call, so this file is the only
// thing that changes if we ever move to SES/Postmark/etc.

const ENDPOINT = 'https://api.resend.com/emails';

/**
 * @param {{ apiKey: string, fetchImpl?: typeof fetch }} opts
 */
export function createResendAdapter({ apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('Resend adapter requires an apiKey');
  return {
    name: 'resend',
    /** @param {{from:string, to:string, subject:string, html:string, text:string, headers?:object}} msg */
    async send(msg) {
      const res = await fetchImpl(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
          headers: msg.headers,
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        const err = new Error(`Resend send failed ${res.status}: ${detail}`);
        err.status = res.status;
        // 429 / 5xx are retried by sendIssue; 4xx (bad address etc.) are not.
        err.retryable = res.status === 429 || res.status >= 500;
        throw err;
      }
      const body = await res.json();
      return { id: body.id, provider: 'resend', accepted: true };
    },
  };
}
