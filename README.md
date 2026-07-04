# The Beaches Beat

Platform for **The Beaches Beat**, a weekly local newsletter. This repo holds the public site
(landing page + subscribe flow) and ships to production automatically on every push to `main`.

## Stack

- **Hosting / deploy:** Vercel, connected to this GitHub repo. Push to `main` → production deploy (one step).
- **Site:** static `index.html` today (placeholder). The real capture form lands in CUB-3.
- **Domain:** `thebeachesbeat.com` (pending CEO purchase approval — see CUB-2).
- **Email auth:** SPF / DKIM / DMARC runbook in [`docs/DNS-EMAIL-AUTH-RUNBOOK.md`](docs/DNS-EMAIL-AUTH-RUNBOOK.md).

## Deploy pipeline

1. Commit + push to `main`.
2. Vercel builds and deploys automatically.
3. Production URL updates. Preview deploys are created for every other branch / PR.

No manual deploy step. This satisfies CUB-2's "deploy pipeline in place" acceptance criterion.

## Roadmap (issues)

| Issue | What |
|-------|------|
| CUB-2 | Hosting, domain, DNS, email auth *(this repo's foundation)* |
| CUB-3 | Subscribe landing page + capture form |
| CUB-4 | Subscriber DB + double opt-in + one-click unsubscribe |
| CUB-5 | ESP integration + weekly send pipeline |
| CUB-6 | Newsletter issue template + publish workflow |
| CUB-7 | Growth & deliverability analytics |
