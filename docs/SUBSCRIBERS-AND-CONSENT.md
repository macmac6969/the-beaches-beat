# Subscribers, consent & unsubscribe (CUB-4)

Owns subscriber data and consent state end to end. Zero external dependencies:
Node built-ins only (`node:http`, `node:sqlite`, `node:crypto`). Fully local and
reversible — the store is a single SQLite file; nothing is locked to a vendor.

## Consent state machine

```
          POST /api/subscribe            GET/POST  (confirm link)
  (new) ─────────────────────▶ pending ───────────────────────▶ confirmed
                                  │                                  │
                                  │  one-click unsubscribe           │  one-click unsubscribe
                                  ▼                                  ▼
                            unsubscribed  ◀───────────────────── unsubscribed
```

- **pending** — signed up, confirmation email sent, *not yet* mailable.
- **confirmed** — clicked the double-opt-in link. The **only** state on the send list.
- **unsubscribed** — reachable from any state; permanently excluded from sends until re-consent.

Re-subscribing an unsubscribed address resets it to `pending` with **fresh tokens**, so a
new double opt-in is always required (GDPR re-consent).

## Data model (`subscribers` table)

| column | purpose |
|---|---|
| `email` | unique, case-insensitive |
| `state` | `pending` \| `confirmed` \| `unsubscribed` (CHECK-constrained) |
| `confirm_token` / `unsubscribe_token` | 256-bit url-safe, **separate** tokens so a link can only do its one action |
| `source`, `consent_ip` | provenance for GDPR proof-of-consent |
| `created_at`, `confirmed_at`, `unsubscribed_at`, `updated_at` | consent timestamps |

## Endpoints

| method | path | effect |
|---|---|---|
| `POST` | `/api/subscribe` | JSON or form `{email}` → creates `pending`, sends confirmation email. Always returns `202` (never leaks whether an email exists). |
| `GET` | `/confirm?token=` | `pending` → `confirmed`; idempotent |
| `GET` / `POST` | `/unsubscribe?token=` | → `unsubscribed`; idempotent. `POST` supports RFC 8058 one-click. |
| `GET` | `/api/send-list` | confirmed-only list (what the send pipeline consumes) |
| `GET` | `/api/stats` | `{pending, confirmed, unsubscribed, total}` |

## Deliverability / compliance

- Every email carries **`List-Unsubscribe`** + **`List-Unsubscribe-Post: List-Unsubscribe=One-Click`** (RFC 8058), so Gmail/Yahoo honor one-click unsubscribe natively.
- Footer includes sender identity + **physical postal address** (CAN-SPAM) — see `src/config.js`.
  ⚠️ The physical address is a placeholder **pending the CEO** (escalated on CUB-4).
- Unsubscribe is honored on send by construction: `sendList()` returns `state='confirmed'` only.

## Interfaces to sibling issues

- **CUB-3 (landing page):** POST the capture form to `/api/subscribe` (form-encoded is accepted).
- **CUB-5 (ESP / send):** consume `GET /api/send-list`; swap `email.js`'s `outbox` transport for an `esp` transport behind the same `sendEmail()` interface.

## Run / verify

```bash
npm start        # http://localhost:3000
npm test         # end-to-end: signup → confirm → on send list → unsubscribe → off send list
```
