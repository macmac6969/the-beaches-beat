// Deterministic sample dataset for The Beaches Beat analytics dashboard.
//
// Shape matches lib/metrics.js DATA CONTRACT exactly, so the dashboard renders
// identically whether fed this seed or the real CUB-4 / CUB-5 queries.
//
// Deterministic: a seeded PRNG (no Date.now / Math.random) => the build is
// reproducible and diffs are meaningful. Models 8 weekly issues, ~May–Jul 2026,
// growing from launch toward the 1,000-subscriber goal.

'use strict';

// mulberry32 — tiny seeded PRNG.
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WEEK_MS = 7 * 24 * 3600 * 1000;
const FIRST_MONDAY = Date.UTC(2026, 4, 11); // Mon 2026-05-11
const WEEKS = 8;

// Weekly gross signups — accelerating as word spreads locally.
const SIGNUPS_PER_WEEK = [46, 58, 61, 79, 88, 97, 104, 118];
const CONFIRM_RATE = 0.84; // realistic double-opt-in completion

function addDays(base, days) {
  return new Date(base + days * 24 * 3600 * 1000).toISOString();
}

function buildSubscribers() {
  const r = rng(20260704);
  const subs = [];
  const sources = ['landing', 'landing', 'landing', 'referral', 'instagram', 'partner'];
  let n = 0;
  for (let w = 0; w < WEEKS; w++) {
    const weekStart = FIRST_MONDAY + w * WEEK_MS;
    for (let i = 0; i < SIGNUPS_PER_WEEK[w]; i++) {
      n += 1;
      const createdAt = addDays(weekStart, r() * 7);
      const confirmed = r() < CONFIRM_RATE;
      // Confirmations land within ~a day of signup.
      const confirmedAt = confirmed
        ? new Date(new Date(createdAt).getTime() + r() * 20 * 3600 * 1000).toISOString()
        : null;
      const sub = {
        id: `sub_${String(n).padStart(4, '0')}`,
        email: `reader${n}@example.com`,
        source: sources[Math.floor(r() * sources.length)],
        status: confirmed ? 'confirmed' : 'pending',
        createdAt,
        confirmedAt,
        unsubscribedAt: null,
      };
      subs.push(sub);
    }
  }

  // Attrition: a small share of confirmed subs later unsubscribe / bounce /
  // complain, weighted toward earlier cohorts (more time to churn).
  const confirmedSubs = subs.filter((s) => s.confirmedAt);
  const churnCount = Math.round(confirmedSubs.length * 0.06);
  for (let i = 0; i < churnCount; i++) {
    const s = confirmedSubs[Math.floor(r() * confirmedSubs.length)];
    if (s.status !== 'confirmed') continue;
    const roll = r();
    const churnAt = addDays(FIRST_MONDAY + (3 + r() * (WEEKS - 3)) * WEEK_MS, r() * 7);
    if (roll < 0.7) {
      s.status = 'unsubscribed';
      s.unsubscribedAt = churnAt;
    } else if (roll < 0.95) {
      s.status = 'bounced';
    } else {
      s.status = 'complained';
    }
  }
  return subs;
}

// One issue per week from week 1 onward (week 0 was signup-collection only).
function buildIssues(subscribers) {
  const r = rng(70420260);
  const subjects = [
    'Issue #1 — Welcome to The Beaches Beat 🏖️',
    'Issue #2 — The boardwalk repaving fight',
    'Issue #3 — 7 spots for the best fish & chips',
    'Issue #4 — Council candidates, side by side',
    'Issue #5 — Surf report + the shark-net debate',
    'Issue #6 — Where the Saturday markets moved',
    'Issue #7 — Summer events calendar is here',
  ];
  const issues = [];
  for (let w = 1; w <= subjects.length; w++) {
    const sentAt = addDays(FIRST_MONDAY + w * WEEK_MS, 2 + r()); // ~Wednesday

    // Active-at-send-time = confirmed before send and not yet churned.
    const sentTime = new Date(sentAt).getTime();
    const audience = subscribers.filter(
      (s) =>
        s.confirmedAt &&
        new Date(s.confirmedAt).getTime() <= sentTime &&
        (!s.unsubscribedAt || new Date(s.unsubscribedAt).getTime() > sentTime) &&
        s.status !== 'bounced' &&
        s.status !== 'complained'
    ).length;

    const sent = audience;
    const bounceRate = 0.006 + r() * 0.012; // 0.6–1.8%
    const bounces = Math.round(sent * bounceRate);
    const delivered = sent - bounces;
    const openRate = 0.42 + r() * 0.08; // 42–50%
    const uniqueOpens = Math.round(delivered * openRate);
    const ctor = 0.15 + r() * 0.07; // click-to-open 15–22%
    const uniqueClicks = Math.round(uniqueOpens * ctor);
    const complaints = Math.round(delivered * (0.0002 + r() * 0.0004));
    const unsubscribes = Math.round(delivered * (0.003 + r() * 0.003));

    issues.push({
      id: `issue_${w}`,
      subject: subjects[w - 1],
      sentAt,
      sent,
      delivered,
      uniqueOpens,
      uniqueClicks,
      bounces,
      complaints,
      unsubscribes,
    });
  }
  return issues;
}

function buildDataset() {
  const subscribers = buildSubscribers();
  const issues = buildIssues(subscribers);
  return { subscribers, issues, generatedFor: '2026-07-04', sample: true };
}

const dataset = buildDataset();

if (typeof module !== 'undefined' && module.exports) module.exports = { buildDataset, dataset };
