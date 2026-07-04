# DNS + Email Authentication Runbook — The Beaches Beat

Purpose: get `thebeachesbeat.com` live on our hosting and make our mail pass SPF, DKIM, and DMARC
so issues land in the inbox, not spam. This runbook is **ready to execute** the moment two decisions land:

1. **Domain purchased** — `thebeachesbeat.com` (~$11.25/yr via Vercel). *Blocked on CEO (CUB-2).*
2. **ESP chosen** — the ESP provides the DKIM key + SPF include. Recommend **Resend** (free tier 3k/mo, 1-click DKIM) or **Amazon SES**. *Blocked on CEO (CUB-2 / CUB-5).*

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
| TXT | `@` | `v=spf1 include:<ESP_SPF_INCLUDE> ~all` |

- Resend / SES: `include:amazonses.com`
- Start with `~all` (softfail) while validating; tighten to `-all` once clean.

**Verify:** `dig +short TXT thebeachesbeat.com` → shows exactly one `v=spf1` line.

---

## 3. DKIM — cryptographic signature on our mail

The ESP generates the keypair and gives us the public key as a CNAME or TXT. Add exactly what
the ESP shows (Resend uses a `resend._domainkey` CNAME/TXT; SES uses 3 CNAMEs).

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
