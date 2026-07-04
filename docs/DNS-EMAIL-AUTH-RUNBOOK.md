# DNS + Email Authentication Runbook — The Beaches Beat

Purpose: get our site live on hosting and make our mail pass SPF, DKIM, and DMARC
so issues land in the inbox, not spam.

## Decisions locked (2026-07-04, CEO)

- **Hosting:** free hosting for now — **live at https://the-beaches-beat.vercel.app/**
  (Vercel, git integration: push-to-`main` auto-deploys). No paid custom domain yet.
  Vercel serves the static landing page only (`framework: null`, `index.html` → `dist/`);
  the Node backend in `src/` is never built or exposed.
- **ESP:** **Resend** (free tier 3k/mo, 1-click DKIM). Activate with `RESEND_API_KEY`.

## Email auth is deferred until a custom domain is bought

SPF/DKIM/DMARC are **domain-based** — they require DNS TXT/CNAME records on a domain we control.
A free `*.github.io` (or `*.vercel.app`) subdomain does **not** let us add DNS records, so full
email authentication **cannot** be configured or validated until we own a custom domain
(e.g. `thebeachesbeat.com`, ~$11.25/yr via Vercel — available as of 2026-07-04).

Everything below is **ready to execute** the moment a custom domain is purchased. Until then,
Resend can only send to the account owner's own verified address (test mode); production
newsletter sends need a verified custom domain.

DNS is managed at the registrar/Vercel DNS. All records below are added there once.

---

## 1. Domain → hosting

| Type | Name | Value | Notes |
|------|------|-------|-------|
| A / ALIAS | `@` (apex) | Vercel-provided (`76.76.21.21` or ALIAS to `cname.vercel-dns.com`) | apex → production site |
| CNAME | `www` | `cname.vercel-dns.com` | www → apex |

Vercel auto-issues TLS once the domain is added to the project and DNS resolves.

**Verify:** `dig +short thebeachesbeat.com` and load `https://thebeachesbeat.com`.

---

## 2. SPF — who is allowed to send as us

One SPF record only (multiple `v=spf1` records = a fail). Merge all senders into one.

| Type | Name | Value |
|------|------|-------|
| TXT | `@` | `v=spf1 include:amazonses.com ~all` |

- Resend (our ESP) sends via Amazon SES infrastructure, so the include is `amazonses.com`.
- Start with `~all` (softfail) while validating; tighten to `-all` once clean.

**Verify:** `dig +short TXT thebeachesbeat.com` → shows exactly one `v=spf1` line.

---

## 3. DKIM — cryptographic signature on our mail

Resend generates the keypair and gives us the public key as a CNAME/TXT to add. Add exactly what
the Resend dashboard shows for the domain (typically a `resend._domainkey` record). Then click
"Verify" in Resend.

| Type | Name | Value |
|------|------|-------|
| TXT/CNAME | `<selector>._domainkey` | `<ESP_PROVIDED_PUBLIC_KEY>` |

**Verify:** `dig +short TXT <selector>._domainkey.thebeachesbeat.com` → resolves; ESP dashboard shows "verified".

---

## 4. DMARC — policy + reporting

| Type | Name | Value |
|------|------|-------|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@thebeachesbeat.com; fo=1; adkim=s; aspf=s` |

Policy progression (don't skip stages):
1. `p=none` — monitor only. Collect aggregate reports for ~1–2 weeks.
2. `p=quarantine` — once SPF+DKIM align cleanly for all our mail.
3. `p=reject` — full enforcement once confident.

**Verify:** `dig +short TXT _dmarc.thebeachesbeat.com`.

---

## 5. Deliverability compliance (ties into CUB-4/CUB-5)

- One-click unsubscribe: `List-Unsubscribe` + `List-Unsubscribe-Post` headers on every send.
- Physical mailing address + clear identity in every footer (CAN-SPAM / GDPR).
- Only send to `confirmed` subscribers (double opt-in) — protects reputation from day one.

---

## 6. Passing-check evidence (the CUB-2 acceptance criterion)

Once records propagate, capture evidence with either:

- **mail-tester.com** — send a test issue to the generated address, screenshot the 10/10 (SPF ✓ DKIM ✓ DMARC ✓).
- **dig output** — paste `dig +short TXT thebeachesbeat.com`, `dig +short TXT _dmarc.thebeachesbeat.com`,
  and the DKIM selector lookup showing all three resolve.

Attach to CUB-2 as the passing DNS/email-auth check.
