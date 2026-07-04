// The Beaches Beat platform HTTP server.
// Owns: subscribe (double opt-in), confirm, one-click unsubscribe, stats, send-list.
// Zero external deps: node:http + node:sqlite + node:crypto.

import http from 'node:http';
import { config } from './config.js';
import { openDb, SubscriberStore, isValidEmail } from './db.js';
import { buildConfirmationEmail, sendEmail, unsubscribeUrl } from './email.js';

export function createApp(store) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const { pathname } = url;
      const method = req.method;

      if (method === 'GET' && pathname === '/') return sendHtml(res, 200, pageHome());
      if (method === 'GET' && pathname === '/healthz') return sendJson(res, 200, { ok: true });

      if (method === 'POST' && pathname === '/api/subscribe') return handleSubscribe(req, res, store);
      if (method === 'GET' && pathname === '/confirm') return handleConfirm(url, res, store);
      if ((method === 'GET' || method === 'POST') && pathname === '/unsubscribe')
        return handleUnsubscribe(url, res, store);

      if (method === 'GET' && pathname === '/api/stats') return sendJson(res, 200, store.stats());
      if (method === 'GET' && pathname === '/api/send-list')
        return sendJson(res, 200, store.sendList().map(publicRow));

      return sendJson(res, 404, { error: 'not_found' });
    } catch (err) {
      return sendJson(res, 500, { error: 'internal', detail: String(err && err.message) });
    }
  });
}

function publicRow(s) {
  return { email: s.email, state: s.state, confirmed_at: s.confirmed_at };
}

async function handleSubscribe(req, res, store) {
  const body = await readBody(req);
  let email = null;
  let source = 'api';
  const ct = req.headers['content-type'] || '';
  if (ct.includes('application/json')) {
    try {
      const j = JSON.parse(body || '{}');
      email = j.email;
      source = j.source || source;
    } catch {
      return sendJson(res, 400, { error: 'invalid_json' });
    }
  } else {
    const params = new URLSearchParams(body);
    email = params.get('email');
    source = params.get('source') || source;
  }

  if (!isValidEmail(email)) return sendJson(res, 400, { error: 'invalid_email' });

  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
  const { subscriber, outcome } = store.subscribe(email, { source, ip });

  // Send the confirmation email on any state where double opt-in is still open.
  let mail = null;
  if (outcome === 'created' || outcome === 'resubscribed' || outcome === 'already_pending') {
    mail = sendEmail(buildConfirmationEmail(subscriber));
  }

  // Always return the same 202 shape so we never leak whether an email already exists.
  return sendJson(res, 202, {
    status: 'confirmation_sent',
    message: 'Check your inbox to confirm your subscription.',
    outcome,
    mail_transport: mail ? mail.transport : null,
  });
}

function handleConfirm(url, res, store) {
  const t = url.searchParams.get('token') || '';
  const { subscriber, outcome } = store.confirm(t);
  if (outcome === 'not_found') return sendHtml(res, 404, pageMessage('Link not valid', 'This confirmation link is invalid or has expired.'));
  if (outcome === 'unsubscribed')
    return sendHtml(res, 200, pageMessage('Already unsubscribed', `${subscriber.email} previously unsubscribed. Subscribe again if you changed your mind.`));
  const title = outcome === 'already_confirmed' ? "You're already confirmed" : "You're confirmed 🎉";
  return sendHtml(res, 200, pageMessage(title, `${subscriber.email} is now on ${config.listName}. Welcome to The Beaches Beat.`));
}

function handleUnsubscribe(url, res, store) {
  const t = url.searchParams.get('token') || '';
  const { subscriber, outcome } = store.unsubscribe(t);
  if (outcome === 'not_found') return sendHtml(res, 404, pageMessage('Link not valid', 'This unsubscribe link is invalid.'));
  const email = subscriber ? subscriber.email : 'You';
  return sendHtml(res, 200, pageMessage('Unsubscribed', `${email} has been removed from ${config.listName}. You will receive no further emails.`));
}

// ---- tiny helpers ----

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) req.destroy();
    });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}

function sendJson(res, code, obj) {
  const s = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}

function sendHtml(res, code, html) {
  res.writeHead(code, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function shell(title, inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ${esc(config.sender.name)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:34rem;margin:12vh auto;padding:0 1.25rem;color:#1a2b3c;line-height:1.5}
h1{font-size:1.6rem}.card{border:1px solid #e2e8f0;border-radius:12px;padding:1.5rem}small{color:#64748b}</style>
</head><body>${inner}</body></html>`;
}

function pageMessage(title, body) {
  return shell(title, `<div class="card"><h1>${esc(title)}</h1><p>${esc(body)}</p>
<p><small>${esc(config.sender.name)} · ${esc(config.physicalAddress)}</small></p></div>`);
}

function pageHome() {
  return shell('Subscribe', `<div class="card"><h1>${esc(config.sender.name)}</h1>
<p>${esc(config.listName)}. Confirm-first (double opt-in), one-click unsubscribe, no spam.</p>
<form method="post" action="/api/subscribe" enctype="application/x-www-form-urlencoded">
<input name="email" type="email" placeholder="you@example.com" required style="padding:.6rem;width:70%">
<button type="submit" style="padding:.6rem 1rem">Subscribe</button></form>
<p><small>API: POST /api/subscribe · GET /api/stats · GET /api/send-list</small></p></div>`);
}

// ---- boot ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const db = openDb(config.dbPath);
  const store = new SubscriberStore(db);
  createApp(store).listen(config.port, () => {
    console.log(`Beaches Beat platform on ${config.publicBaseUrl} (db: ${config.dbPath}, mail: ${config.mailTransport})`);
  });
}
