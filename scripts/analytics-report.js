#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * Telluride Gov Hub — Cloudflare Web Analytics report
 *
 * Pulls real traffic numbers for livabletelluride.org out of the
 * Cloudflare GraphQL Analytics API and prints a readable summary.
 *
 * The site is served by GitHub Pages, so there are no server logs to
 * read — the ONLY traffic record is the Web Analytics beacon that
 * site.js injects (see site.js ~line 150). This script is the way to
 * read it without opening the dashboard.
 *
 * Auth:
 *   export CF_API_TOKEN=...      # Account → Account Analytics → Read
 * The token is read from the environment ONLY. Never hardcode it here;
 * this file is public.
 *
 * Usage:
 *   node scripts/analytics-report.js                 # last 28 days
 *   node scripts/analytics-report.js --days=90
 *   node scripts/analytics-report.js --since=2026-06-14 --until=2026-08-16
 *   node scripts/analytics-report.js --sites          # verify token, list site tags
 *   node scripts/analytics-report.js --introspect     # dump the real dataset schema
 *   node scripts/analytics-report.js --json           # machine-readable output
 *
 * NOTE ON DATA HISTORY (matters when reading the output):
 *   • Tracking began 2026-06-14 (commit 895acac, beacon added to all
 *     public pages). Nothing exists before that date.
 *   • The redesign cutover landed 2026-07-22 (commit 0e7e033) and deleted
 *     18 legacy pages. Per-path numbers spanning that date show old URLs
 *     dying and new ones starting from zero — that is an inventory change,
 *     not a traffic change. Totals are comparable across it; paths are not.
 * ══════════════════════════════════════════════════════════════
 */

'use strict';

// Both of these are already public (the beacon token ships in the HTML of
// every page; the account ID is in docs/operations.md). Not secrets.
const ACCOUNT_ID = '8f020e73de4e9956f0e3ad7dce070ef4';
const SITE_TAG   = '6500d02421bc4da1bebfad6099e6027c';

const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';
const REST_BASE   = 'https://api.cloudflare.com/client/v4';

// Date tracking started. Requests earlier than this return empty, which
// reads as "traffic collapsed" if you don't know why.
const TRACKING_START = '2026-06-14';
const CUTOVER_DATE   = '2026-07-22';

const TOKEN = process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN;

// ── args ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const hasFlag = (n) => args.includes('--' + n);
const getOpt  = (n, d) => {
  const hit = args.find((a) => a.startsWith('--' + n + '='));
  return hit ? hit.slice(n.length + 3) : d;
};

const AS_JSON = hasFlag('json');

function isoDay(d) { return d.toISOString().slice(0, 10); }

function resolveRange() {
  const until = getOpt('until', isoDay(new Date()));
  let since = getOpt('since', null);
  if (!since) {
    const days = parseInt(getOpt('days', '28'), 10);
    const d = new Date(until + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - days);
    since = isoDay(d);
  }
  return { since, until };
}

// ── HTTP ──────────────────────────────────────────────────────
async function cfGraphQL(query, variables) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); }
  catch { throw new Error(`Non-JSON reply (HTTP ${res.status}): ${text.slice(0, 400)}`); }

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  if (body.errors && body.errors.length) {
    // Surface the real GraphQL error — a wrong field name shows up here and
    // is the single most likely failure, since the schema docs are not
    // reachable from the CI container.
    throw new Error('GraphQL error: ' + body.errors.map((e) => e.message).join(' | '));
  }
  return body.data;
}

async function cfRest(path) {
  const res = await fetch(REST_BASE + path, {
    headers: { 'Authorization': 'Bearer ' + TOKEN },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.success === false) {
    const msg = body && body.errors ? JSON.stringify(body.errors) : `HTTP ${res.status}`;
    throw new Error('REST error: ' + msg);
  }
  return body.result;
}

// ── queries ───────────────────────────────────────────────────
// Adaptive sampling: Cloudflare does not sample low-volume sites, so for a
// site this size sampleInterval is virtually always 1 and raw == weighted.
// We still weight, so the numbers stay correct if volume ever grows into
// the sampled range. Weighted metric = Σ(value × sampleInterval).
const METRICS = `
  count
  sum { visits }
  avg { sampleInterval }
`;

function groupQuery(dimensions) {
  return `
    query ($accountTag: String!, $siteTag: String!, $since: Time!, $until: Time!, $limit: Int!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          rumPageloadEventsAdaptiveGroups(
            filter: { siteTag: $siteTag, datetime_geq: $since, datetime_leq: $until, bot: 0 }
            limit: $limit
            orderBy: [count_DESC]
          ) {
            ${METRICS}
            ${dimensions ? `dimensions { ${dimensions} }` : ''}
          }
        }
      }
    }`;
}

function tally(rows) {
  let pageviews = 0, visits = 0, sampled = false;
  for (const r of rows) {
    const si = (r.avg && r.avg.sampleInterval) || 1;
    if (si > 1) sampled = true;
    pageviews += (r.count || 0) * si;
    visits    += ((r.sum && r.sum.visits) || 0) * si;
  }
  return { pageviews: Math.round(pageviews), visits: Math.round(visits), sampled };
}

async function section(label, dimensions, limit, range) {
  try {
    const data = await cfGraphQL(groupQuery(dimensions), {
      accountTag: ACCOUNT_ID,
      siteTag: SITE_TAG,
      since: range.since + 'T00:00:00Z',
      until: range.until + 'T23:59:59Z',
      limit,
    });
    const accounts = (data && data.viewer && data.viewer.accounts) || [];
    return { label, rows: accounts.length ? accounts[0].rumPageloadEventsAdaptiveGroups : [] };
  } catch (err) {
    // One bad dimension name must not kill the whole report.
    return { label, rows: [], error: err.message };
  }
}

// ── output ────────────────────────────────────────────────────
function bar(n, max, width) {
  if (!max) return '';
  return '█'.repeat(Math.max(1, Math.round((n / max) * width)));
}

function printRanked(title, sec, keyFn, topN) {
  console.log('\n' + title);
  if (sec.error) { console.log('  ⚠️  unavailable — ' + sec.error); return; }
  if (!sec.rows.length) { console.log('  (no data)'); return; }
  const ranked = sec.rows
    .map((r) => ({ key: keyFn(r.dimensions), ...tally([r]) }))
    .sort((a, b) => b.pageviews - a.pageviews)
    .slice(0, topN);
  const max = ranked[0].pageviews;
  const wide = Math.max(...ranked.map((r) => String(r.key).length));
  for (const r of ranked) {
    console.log(
      '  ' + String(r.key).padEnd(Math.min(wide, 48)).slice(0, 48) +
      '  ' + String(r.pageviews).padStart(7) +
      '  ' + bar(r.pageviews, max, 24)
    );
  }
}

// ── modes ─────────────────────────────────────────────────────
async function listSites() {
  const sites = await cfRest(`/accounts/${ACCOUNT_ID}/rum/site_info/list`);
  console.log('Web Analytics sites on this account:\n');
  for (const s of sites) {
    const tag = s.site_tag || s.siteTag;
    const host = (s.ruleset && s.ruleset.zone_name) || s.host || '(host not set)';
    const mark = tag === SITE_TAG ? '  ← livabletelluride.org (the tag this script uses)' : '';
    console.log(`  ${tag}  ${host}${mark}`);
  }
  if (!sites.some((s) => (s.site_tag || s.siteTag) === SITE_TAG)) {
    console.log(
      `\n⚠️  SITE_TAG ${SITE_TAG} was not in this list. The beacon token in ` +
      `site.js may not be the analytics site tag — use one of the tags above.`
    );
  }
}

async function introspect() {
  // The schema docs are egress-blocked from this container, so ask the API
  // itself what the dataset actually accepts.
  const q = `
    query {
      __type(name: "AccountRumPageloadEventsAdaptiveGroups") {
        fields { name type { name kind ofType { name } } }
      }
      filt: __type(name: "AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject") {
        inputFields { name }
      }
      dims: __type(name: "AccountRumPageloadEventsAdaptiveGroupsDimensions") {
        fields { name }
      }
    }`;
  const data = await cfGraphQL(q, {});
  console.log(JSON.stringify(data, null, 2));
}

async function report() {
  const range = resolveRange();

  if (range.since < TRACKING_START) {
    console.log(
      `ℹ️  Range starts ${range.since}, but tracking only began ${TRACKING_START}. ` +
      `Days before that are empty by definition, not a traffic drop.\n`
    );
  }

  const [totals, daily, paths, referers, countries, devices] = await Promise.all([
    section('totals',    null,                 1,    range),
    section('daily',     'date',               400,  range),
    section('paths',     'requestPath',        200,  range),
    section('referers',  'refererHost',        100,  range),
    section('countries', 'countryName',        100,  range),
    section('devices',   'deviceType',         20,   range),
  ]);

  if (AS_JSON) {
    console.log(JSON.stringify({ range, totals, daily, paths, referers, countries, devices }, null, 2));
    return;
  }

  const t = tally(totals.rows);
  const days = Math.max(1,
    Math.round((new Date(range.until) - new Date(range.since)) / 86400000));

  console.log('═'.repeat(62));
  console.log(`  livabletelluride.org — ${range.since} → ${range.until}  (${days} days)`);
  console.log('═'.repeat(62));

  if (totals.error) {
    console.log('\n⚠️  Totals query failed — ' + totals.error);
    console.log('    Run with --introspect to see the field names this account actually exposes.');
  } else {
    console.log(`\n  Visits      ${String(t.visits).padStart(8)}   (${(t.visits / days).toFixed(1)}/day)`);
    console.log(`  Pageviews   ${String(t.pageviews).padStart(8)}   (${(t.pageviews / days).toFixed(1)}/day)`);
    if (t.visits) console.log(`  Pages/visit ${(t.pageviews / t.visits).toFixed(2).padStart(8)}`);
    if (t.sampled) console.log('\n  ⚠️  Adaptive sampling was active — figures are extrapolated.');
  }

  printRanked('Top pages (by pageview)', paths, (d) => d.requestPath, 15);
  printRanked('Top referrers', referers, (d) => d.refererHost || '(direct)', 10);
  printRanked('Countries', countries, (d) => d.countryName, 8);
  printRanked('Devices', devices, (d) => d.deviceType || '(unknown)', 5);

  // Weekly trend — the useful "how are we doing" signal.
  if (!daily.error && daily.rows.length) {
    console.log('\nWeekly trend (visits)');
    const byWeek = new Map();
    for (const r of daily.rows) {
      const d = new Date(r.dimensions.date + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // snap to Monday
      const k = isoDay(d);
      const cur = byWeek.get(k) || 0;
      byWeek.set(k, cur + tally([r]).visits);
    }
    const weeks = [...byWeek.entries()].sort();
    const max = Math.max(...weeks.map((w) => w[1]));
    for (const [wk, v] of weeks) {
      const flag = (wk <= CUTOVER_DATE && CUTOVER_DATE < isoDay(new Date(new Date(wk).getTime() + 7 * 86400000)))
        ? '  ← redesign cutover'
        : '';
      console.log(`  ${wk}  ${String(v).padStart(6)}  ${bar(v, max, 24)}${flag}`);
    }
  }

  console.log(
    '\nReminder: this beacon is client-side JS. It does not count RSS/feed readers,\n' +
    'digest email opens (those are in Mailchimp), or visitors with JS blocked.\n' +
    'Treat these as a floor on human reach.\n'
  );
}

// ── main ──────────────────────────────────────────────────────
(async () => {
  if (!TOKEN) {
    console.error(
      'CF_API_TOKEN is not set.\n\n' +
      'Create a token at https://dash.cloudflare.com/profile/api-tokens with\n' +
      '  Permissions: Account → Account Analytics → Read\n' +
      `  Account resources: Morgan@brieflink.ai's Account\n\n` +
      'Then:  export CF_API_TOKEN=... && node scripts/analytics-report.js'
    );
    process.exit(1);
  }
  try {
    if (hasFlag('sites'))           await listSites();
    else if (hasFlag('introspect')) await introspect();
    else                            await report();
  } catch (err) {
    console.error('\n✖ ' + err.message);
    process.exit(1);
  }
})();
