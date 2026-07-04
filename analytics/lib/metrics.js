// The Beaches Beat — analytics metrics engine.
//
// Pure functions. No I/O, no dates-from-now, fully deterministic given input.
// Runs in Node (build step) and in the browser (live recompute) — CommonJS +
// global export shim at the bottom.
//
// ---------------------------------------------------------------------------
// DATA CONTRACT — this is the schema the real platform emits.
//
//   subscriber = {
//     id, email, source,                         // "landing", "referral", ...
//     status: "pending"|"confirmed"|"unsubscribed"|"bounced"|"complained",
//     createdAt,        // ISO — signup (double opt-in requested)
//     confirmedAt,      // ISO | null — opt-in confirmed
//     unsubscribedAt,   // ISO | null
//   }
//
//   issue = {                                    // one weekly send
//     id, subject, sentAt,                        // ISO
//     sent,             // messages handed to the ESP
//     delivered,        // sent - bounces (ESP "delivered" webhook count)
//     uniqueOpens,      // distinct subscribers who opened
//     uniqueClicks,     // distinct subscribers who clicked a link
//     bounces,          // hard + soft bounces
//     complaints,       // spam/abuse reports (FBL)
//     unsubscribes,     // unsubs attributed to this issue
//   }
//
// CUB-4 (subscriber DB) produces `subscribers`. CUB-5 (ESP pipeline) writes an
// `issue` row per send from the ESP's delivery/engagement webhooks. Swap the
// seed loader for those two queries and every number below is live.
// ---------------------------------------------------------------------------

'use strict';

const pct = (num, den) => (den > 0 ? num / den : 0);
const round = (x, d = 1) => {
  const f = Math.pow(10, d);
  return Math.round(x * f) / f;
};

// --- Subscriber-side metrics -------------------------------------------------

// A subscriber counts as an active recipient if they confirmed and have not
// since unsubscribed / bounced / complained.
function isActive(s) {
  return s.status === 'confirmed';
}

function subscriberTotals(subscribers) {
  const total = subscribers.length;
  const confirmed = subscribers.filter((s) => s.confirmedAt).length;
  const active = subscribers.filter(isActive).length;
  const pending = subscribers.filter((s) => s.status === 'pending').length;
  const unsubscribed = subscribers.filter((s) => s.status === 'unsubscribed').length;
  const bounced = subscribers.filter((s) => s.status === 'bounced').length;
  const complained = subscribers.filter((s) => s.status === 'complained').length;
  return {
    total,
    confirmed,
    active,
    pending,
    unsubscribed,
    bounced,
    complained,
    // Confirmation rate = how many signups completed double opt-in.
    confirmationRate: pct(confirmed, total),
  };
}

// Monday-anchored week key, e.g. "2026-05-11".
function weekKey(iso) {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

// Weekly signups, confirmations and cumulative active-subscriber curve.
function subscriberGrowthWeekly(subscribers) {
  const weeks = new Map();
  const bump = (key, field) => {
    if (!weeks.has(key)) weeks.set(key, { week: key, signups: 0, confirmations: 0, unsubs: 0 });
    weeks.get(key)[field] += 1;
  };
  for (const s of subscribers) {
    bump(weekKey(s.createdAt), 'signups');
    if (s.confirmedAt) bump(weekKey(s.confirmedAt), 'confirmations');
    if (s.unsubscribedAt) bump(weekKey(s.unsubscribedAt), 'unsubs');
  }
  const rows = [...weeks.values()].sort((a, b) => a.week.localeCompare(b.week));
  let cumulative = 0;
  for (const r of rows) {
    cumulative += r.confirmations - r.unsubs;
    r.netActive = r.confirmations - r.unsubs;
    r.cumulativeActive = cumulative;
  }
  return rows;
}

// --- Send / engagement metrics ----------------------------------------------

function issueRates(issue) {
  return {
    ...issue,
    deliveryRate: pct(issue.delivered, issue.sent),
    openRate: pct(issue.uniqueOpens, issue.delivered),
    clickRate: pct(issue.uniqueClicks, issue.delivered),
    // Click-to-open — of those who opened, how many clicked.
    clickToOpenRate: pct(issue.uniqueClicks, issue.uniqueOpens),
    unsubRate: pct(issue.unsubscribes, issue.delivered),
    bounceRate: pct(issue.bounces, issue.sent),
    complaintRate: pct(issue.complaints, issue.delivered),
  };
}

// Program-wide engagement, weighted by volume (not a mean of rates).
function engagementOverall(issues) {
  const sum = (f) => issues.reduce((a, i) => a + f(i), 0);
  const sent = sum((i) => i.sent);
  const delivered = sum((i) => i.delivered);
  const opens = sum((i) => i.uniqueOpens);
  const clicks = sum((i) => i.uniqueClicks);
  const bounces = sum((i) => i.bounces);
  const complaints = sum((i) => i.complaints);
  const unsubs = sum((i) => i.unsubscribes);
  return {
    issues: issues.length,
    sent,
    delivered,
    deliveryRate: pct(delivered, sent),
    openRate: pct(opens, delivered),
    clickRate: pct(clicks, delivered),
    clickToOpenRate: pct(clicks, opens),
    unsubRate: pct(unsubs, delivered),
    bounceRate: pct(bounces, sent),
    complaintRate: pct(complaints, delivered),
  };
}

// --- Deliverability thresholds (industry / ESP norms) ------------------------
// good < warn <= serious < critical. Used to color the deliverability panel.
const THRESHOLDS = {
  bounceRate: { warn: 0.02, serious: 0.05, critical: 0.1 },
  complaintRate: { warn: 0.001, serious: 0.002, critical: 0.003 },
  unsubRate: { warn: 0.005, serious: 0.01, critical: 0.02 },
};

function statusFor(metric, value) {
  const t = THRESHOLDS[metric];
  if (!t) return 'good';
  if (value >= t.critical) return 'critical';
  if (value >= t.serious) return 'serious';
  if (value >= t.warn) return 'warning';
  return 'good';
}

// --- Period-over-period deltas ----------------------------------------------
// Compares the latest issue to the previous one (points, not %).
function latestDeltas(issues) {
  if (issues.length < 2) return {};
  const a = issueRates(issues[issues.length - 2]);
  const b = issueRates(issues[issues.length - 1]);
  const d = (k) => b[k] - a[k];
  return {
    openRate: d('openRate'),
    clickRate: d('clickRate'),
    unsubRate: d('unsubRate'),
    bounceRate: d('bounceRate'),
    complaintRate: d('complaintRate'),
  };
}

// --- Top-level assembler -----------------------------------------------------
function computeDashboard(subscribers, issues) {
  const sortedIssues = [...issues].sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt));
  const totals = subscriberTotals(subscribers);
  const growth = subscriberGrowthWeekly(subscribers);
  const engagement = engagementOverall(sortedIssues);
  const perIssue = sortedIssues.map(issueRates);
  const deltas = latestDeltas(sortedIssues);

  const funnel = [
    { stage: 'Signed up', count: totals.total },
    { stage: 'Confirmed', count: totals.confirmed },
    { stage: 'Active', count: totals.active },
  ];

  const deliverability = {
    bounceRate: { value: engagement.bounceRate, status: statusFor('bounceRate', engagement.bounceRate) },
    complaintRate: { value: engagement.complaintRate, status: statusFor('complaintRate', engagement.complaintRate) },
    unsubRate: { value: engagement.unsubRate, status: statusFor('unsubRate', engagement.unsubRate) },
  };

  return { totals, growth, engagement, perIssue, deltas, funnel, deliverability, thresholds: THRESHOLDS };
}

const api = {
  pct,
  round,
  isActive,
  subscriberTotals,
  weekKey,
  subscriberGrowthWeekly,
  issueRates,
  engagementOverall,
  statusFor,
  latestDeltas,
  computeDashboard,
  THRESHOLDS,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof window !== 'undefined') window.BeatMetrics = api;
