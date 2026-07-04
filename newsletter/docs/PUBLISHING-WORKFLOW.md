# Publishing workflow — The Beaches Beat

**One issue, every week, the same way each time:** `draft → review → schedule → send → check`.

This doc owns the *mechanics*. Editorial content and voice are the editor's, not
engineering's. Roles below: **Editor** = whoever writes the issue; **Eng** = me
(founding engineer), owner of the template, ESP config, and deliverability.

---

## The template

- **Shell:** [`newsletter/templates/issue.html`](../templates/issue.html) — the
  reusable, client-safe frame (masthead, issue meta, body slot, compliant footer).
- **Content blocks:** reusable STORY / DIVIDER / BUTTON / IMAGE partials are in the
  comment at the bottom of the shell. The editor stacks these inside `{{content}}`.
- **Rendered sample:** [`newsletter/samples/issue-012-sample.html`](../samples/issue-012-sample.html)
  and the PNGs beside it (desktop + mobile).

### Merge-tag contract

The template ships ESP-agnostic. These tags must be mapped once in the ESP; the ESP
fills them per-recipient at send. (Syntax shown is `{{tag}}` — swap delimiters to
your ESP, e.g. Mailchimp `*|TAG|*`, Buttondown `{{ tag }}`, Resend/React props.)

| Tag | Filled by | Notes |
|---|---|---|
| `{{preheader}}` | Editor | ~90-char inbox preview |
| `{{web_version_url}}` | ESP | Hosted "view in browser" |
| `{{issue_number}}` / `{{issue_date}}` | Editor | |
| `{{issue_title}}` / `{{issue_dek}}` | Editor | Dek optional |
| `{{content}}` | Editor | Assembled from content blocks |
| `{{subscriber_email}}` | ESP | Per-recipient |
| `{{unsubscribe_url}}` | ESP | **Required.** Must also drive the `List-Unsubscribe` + `List-Unsubscribe-Post` headers (one-click) — see Deliverability |
| `{{preferences_url}}` | ESP | Manage-preferences page |
| `{{company_name}}` / `{{company_address}}` | ESP defaults | Address is a legal requirement (below) |
| `{{current_year}}` | ESP | |

> **Open dependency (not a blocker for this template):** the real values for
> `unsubscribe_url`, `preferences_url`, sending domain, and `company_address` come
> from **CUB-2** (domain/DNS), **CUB-4** (unsubscribe/opt-in DB), and **CUB-5** (ESP).
> The template consumes them as tags, so it's done independently and wired up when
> those land.

---

## Step 1 — Draft

1. Editor copies the shell (or works in the ESP's editor bound to this template).
2. Fill the header tags (`issue_number`, `issue_date`, `issue_title`, `issue_dek`,
   `preheader`).
3. Build the body: stack STORY / DIVIDER / BUTTON / IMAGE blocks inside `{{content}}`.
4. **Every image needs `alt` text and an explicit `width`** — many clients block
   images by default; the alt text is the fallback.
5. **Every link is a real, tested URL** (no `#`). Prefer the ESP's link-wrapping so
   clicks are tracked (feeds CUB-7 analytics).

**Definition of a done draft:** renders in the browser preview, no `#`/`lorem`
placeholders, preheader set, one clear primary link.

## Step 2 — Review (pre-send QA)

Run this checklist before anything is scheduled. Two people ideally; at minimum the
Editor self-checks + Eng spot-checks a live test send.

- [ ] **Send a live test** to the seed list (Gmail, Apple Mail, Outlook, one mobile).
- [ ] Subject line + preheader read well together in the inbox row (not duplicated).
- [ ] Renders on desktop **and** mobile; dark mode looks intentional.
- [ ] All links click through to the right place; primary CTA works.
- [ ] Images load; alt text sensible when they don't.
- [ ] Footer shows unsubscribe, manage-preferences, physical address, identity line.
- [ ] Click the **unsubscribe** link in the test — it must actually work one-click.
- [ ] Spam check: run through the ESP's spam/inbox test (or mail-tester.com); aim ≥ 8/10.
- [ ] Personalization tags resolve (no raw `{{subscriber_email}}` leaking through).

**Editorial sign-off is the editor's**, on content/voice. Eng signs off on render +
deliverability only.

## Step 3 — Schedule

1. Confirm the recipient segment (default: all confirmed subscribers; never
   unconfirmed — double opt-in only, per CUB-4).
2. Set send time. **Default cadence: Saturday ~8:00am local.** One issue/week.
3. Schedule in the ESP. Do **not** hand-send at the last minute — scheduling leaves an
   audit trail and avoids fat-finger sends.
4. Leave the test/seed addresses on the list so we always get our own copy.

## Step 4 — Send

- The ESP sends on schedule. No manual step here if Step 3 was done right.
- If sending manually (recovery only): send to yourself first, confirm, then release.

## Step 5 — Check (post-send, same day)

- [ ] Confirm the issue actually left (ESP "sent" count ≈ segment size).
- [ ] Bounce rate sane (< 2%); investigate spikes — a bounce spike is a
      deliverability bug, surface it early.
- [ ] Spot the first opens/clicks come through (sanity that tracking works → CUB-7).
- [ ] Skim replies for "didn't render" / "couldn't unsubscribe" reports.
- [ ] Log issue #, send date, list size, open/click once they settle (CUB-7 dashboard).

---

## Deliverability & compliance (non-negotiable)

These are legal + inbox-placement requirements, not nice-to-haves:

- **One-click unsubscribe** in the footer **and** via `List-Unsubscribe` +
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers (Gmail/Yahoo bulk-sender
  rules). The ESP sets the headers; the footer link is in the template.
- **Physical mailing address** in every issue (CAN-SPAM; template footer has the slot).
- **Identity line** — who this is and why they're getting it (template footer has it).
- **Only confirmed subscribers** get sent to (GDPR/double opt-in — CUB-4).
- **SPF, DKIM, DMARC** aligned on the sending domain (CUB-2) before any real send.
- **Honour unsubscribes promptly** — the ESP + subscriber DB (CUB-4/CUB-5) handle
  suppression automatically; never re-add a suppressed address.

## Rollback / recovery

- **Bad issue already scheduled:** unschedule in the ESP before send time. Two-way door.
- **Bad issue already sent:** you can't unsend. Send a short correction as a follow-up
  only if materially wrong (broken links, wrong date). Don't spam a correction for typos.
- **Template regression:** the shell is version-controlled here; revert the file and
  re-render the sample to confirm before the next send.
