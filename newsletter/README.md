# Newsletter — template & publishing workflow (CUB-6)

Everything needed to produce a weekly issue of **The Beaches Beat** the same way each time.

```
newsletter/
├── templates/
│   └── issue.html                  # Reusable, client-safe email shell + content blocks
├── samples/
│   ├── issue-012-sample.html       # Rendered sample (placeholder editorial copy)
│   ├── issue-012-sample-desktop.png# Rendered proof — desktop width
│   └── issue-012-sample-mobile.png # Rendered proof — mobile width
└── docs/
    └── PUBLISHING-WORKFLOW.md       # draft → review → schedule → send → check
```

## What this is
- **Reusable HTML issue template** — table-based, inline-CSS, 600px, renders across
  Gmail / Apple Mail / Outlook / Yahoo, dark-mode aware, bulletproof CTA button.
  Footer carries **one-click unsubscribe, manage-preferences, physical address, and
  identity line** (CAN-SPAM / bulk-sender compliant).
- **Documented workflow** — [`docs/PUBLISHING-WORKFLOW.md`](docs/PUBLISHING-WORKFLOW.md),
  including the pre-send QA checklist and deliverability/compliance rules.
- **Rendered sample** — real-shaped issue with placeholder copy, plus PNGs.

## Boundaries & dependencies
- Editorial **content and voice are the editor's**, not engineering's. The sample copy
  is placeholder, for render/QA only.
- The template is **ESP-agnostic**: it uses merge tags an ESP fills at send. Live values
  for the sending domain, unsubscribe/preferences URLs, and mailing address come from
  **CUB-2** (DNS/auth), **CUB-4** (opt-in DB + unsubscribe), **CUB-5** (ESP). Those are
  wire-up dependencies, not blockers for the template itself.

## Regenerate the sample PNGs
```sh
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless --disable-gpu --force-device-scale-factor=2 --window-size=680,1900 \
  --screenshot="newsletter/samples/issue-012-sample-desktop.png" \
  "file://$PWD/newsletter/samples/issue-012-sample.html"
```
