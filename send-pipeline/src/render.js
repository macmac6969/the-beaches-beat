// Issue rendering: turn an issue + a recipient into a personalized message.
//
// Kept deliberately small. CUB-6 owns the real newsletter template; this just
// guarantees every send carries the compliance essentials: a visible
// unsubscribe link and the List-Unsubscribe headers (CAN-SPAM / one-click).

import { unsubscribeToken } from './subscribers/store.js';

/**
 * @typedef {{ subject: string, bodyHtml: string, bodyText: string }} Issue
 */

/**
 * @param {Issue} issue
 * @param {import('./subscribers/store.js').Subscriber} sub
 * @param {{ fromEmail: string, fromName: string, baseUrl: string, unsubSecret: string }} cfg
 */
export function renderMessage(issue, sub, cfg) {
  const token = unsubscribeToken(sub.email, cfg.unsubSecret);
  const unsubUrl = `${cfg.baseUrl.replace(/\/$/, '')}/unsubscribe?email=${encodeURIComponent(
    sub.email,
  )}&t=${token}`;

  const html = `${issue.bodyHtml}
<hr>
<p style="font-size:12px;color:#888">
  You're receiving this because you confirmed your subscription to The Beaches Beat.<br>
  <a href="${unsubUrl}">Unsubscribe in one click</a>.
</p>`;

  const text = `${issue.bodyText}

--
You're receiving this because you confirmed your subscription to The Beaches Beat.
Unsubscribe: ${unsubUrl}`;

  return {
    from: `${cfg.fromName} <${cfg.fromEmail}>`,
    to: sub.email,
    subject: issue.subject,
    html,
    text,
    headers: {
      // RFC 8058 one-click unsubscribe — required for good deliverability at
      // Gmail/Yahoo and satisfies CAN-SPAM. POST target handled by CUB-4.
      'List-Unsubscribe': `<${unsubUrl}>, <mailto:${cfg.fromEmail}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
