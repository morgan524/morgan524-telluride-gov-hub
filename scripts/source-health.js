#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * Livable Telluride — Source Health (silent-scraper-failure detector)
 *
 * The #1 latent reliability risk: a source changes its HTML/feed, the scraper
 * silently matches nothing, and that section goes stale for days with no alert
 * (the same failure class as the June 2026 model-retirement incident).
 *
 * This tracks each data array's item count against a rolling 14-day baseline
 * and flags a source that suddenly drops to zero (or far below normal).
 *
 * TWO ROLES (so the bot that has git-write access maintains the baseline, but
 * the alerting flows through the channel the owner already watches):
 *   • CLI  (run by content-refresh.yml, which can commit): UPDATES the rolling
 *     baseline file scripts/source-baselines.json. No alerting here.
 *   • Module: content-review.js requires detectAnomalies()/readBaseline() and
 *     turns anomalies into findings → the same GitHub issue + exception email.
 *
 * The baseline file stores only per-source dailyMax keyed by date (pruned to
 * 14 days), so it stays stable run-to-run unless counts actually move — no
 * commit spam.
 * ══════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const WINDOW_DAYS = 14;
const MIN_EXPECTED = 3;     // a source that recently had ≥3 items dropping to 0 ⇒ likely broken
const PARTIAL_FLOOR = 15;   // only flag a partial drop when the baseline is sizeable…
const PARTIAL_RATIO = 0.2;  // …and the current count is < 20% of it

// Arrays that legitimately go to zero (sporadic by nature) — never alarm on these.
const EXCLUDE = new Set(['LEGAL_NOTICES', 'SMC_ALERTS']);

function baselineFile(repoRoot) { return path.join(repoRoot, 'scripts', 'source-baselines.json'); }

function todayDenver() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
}
function isoMinusDays(iso, days) {
  return new Date(Date.parse(iso + 'T00:00:00Z') - days * 86400000).toISOString().slice(0, 10);
}

function readBaseline(repoRoot) {
  try {
    const raw = fs.readFileSync(baselineFile(repoRoot), 'utf8');
    const b = JSON.parse(raw);
    if (b && typeof b === 'object' && b.sources) return b;
  } catch { /* missing or unparseable → start fresh */ }
  return { sources: {} };
}

function writeBaseline(repoRoot, baseline) {
  fs.writeFileSync(baselineFile(repoRoot), JSON.stringify(baseline, null, 2) + '\n');
}

// Record today's count into each source's rolling dailyMax and prune > WINDOW_DAYS.
function updateBaseline(baseline, arrays, today) {
  const cutoff = isoMinusDays(today, WINDOW_DAYS);
  for (const [name, arr] of Object.entries(arrays)) {
    const count = Array.isArray(arr) ? arr.length : 0;
    const s = baseline.sources[name] || (baseline.sources[name] = { dailyMax: {} });
    s.dailyMax[today] = Math.max(s.dailyMax[today] || 0, count);
    for (const d of Object.keys(s.dailyMax)) if (d < cutoff) delete s.dailyMax[d];
  }
  return baseline;
}

// Compare current counts to the baseline. Pure — does NOT mutate the baseline,
// so content-review can call it read-only. recentMax includes today's value
// (a max, so today's 0 never masks a prior high).
function detectAnomalies(arrays, baseline) {
  const out = [];
  for (const [name, arr] of Object.entries(arrays)) {
    if (EXCLUDE.has(name)) continue;
    const count = Array.isArray(arr) ? arr.length : 0;
    const dm = (baseline.sources[name] && baseline.sources[name].dailyMax) || {};
    const recentMax = Math.max(0, ...Object.values(dm));
    if (count === 0 && recentMax >= MIN_EXPECTED) {
      out.push({
        name, count, recentMax, severity: 'High',
        message: `${name}: 0 items now — had up to ${recentMax} in the last ${WINDOW_DAYS} days. ` +
          `The scraper has likely broken (the source's HTML/feed changed) and this section is going stale. ` +
          `Check the corresponding sync function in content-refresh.js.`
      });
    } else if (count > 0 && recentMax >= PARTIAL_FLOOR && count < PARTIAL_RATIO * recentMax) {
      out.push({
        name, count, recentMax, severity: 'Medium',
        message: `${name}: ${count} items now, down from ~${recentMax} recently (last ${WINDOW_DAYS}d) — ` +
          `possible partial scraper failure; verify the source still lists the expected items.`
      });
    }
  }
  return out;
}

// ── Staleness + orphan detection ───────────────────────────────────────────
// detectAnomalies only sees a source DROP TO ZERO. The hand-curated meeting
// lists (*_CACHED_DATA) fail differently: they stop GROWING. The row count never
// falls, so nothing trips — yet new meetings, and any summaries written for them,
// never render. Two signals catch that:
//   1. A *_CACHE_DATE constant older than STALE_DAYS — the list hasn't been
//      refreshed since that date.
//   2. A MANUAL_SUMMARIES entry for a future meeting whose date appears in NO
//      cached list — a summary that can never render (the "July 1 BOCC had a
//      summary but no list row" bug class).
const STALE_DAYS = 30;

function calDay(localDate, v) {
  const d = localDate ? localDate(v) : null;
  if (!d || isNaN(d)) return null;
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function detectStaleData(captured, localDate, today) {
  const out = [];
  if (!captured || typeof captured !== 'object') return out;
  const todayMs = Date.parse(today + 'T00:00:00Z');

  // 1) Cache-date age
  for (const [name, val] of Object.entries(captured)) {
    if (!/_CACHE_DATE$/.test(name) || typeof val !== 'string') continue;
    const m = val.match(/^\d{4}-\d{2}-\d{2}/);
    if (!m) continue;
    const age = Math.round((todayMs - Date.parse(m[0] + 'T00:00:00Z')) / 86400000);
    if (age > STALE_DAYS) {
      const list = name.replace(/_CACHE_DATE$/, '_CACHED_DATA');
      out.push({ name: list, severity: 'Medium',
        message: `${list}: last refreshed ${m[0]} (${age}d ago). The cached meeting list has stopped updating — new meetings, and any summaries written for them, won't render. Refresh the snapshot.` });
    }
  }

  // 2) Orphan future summaries: a summary dated >= today with no cached list row
  //    on that date. Source-agnostic (coarse) to stay low-noise; a precise
  //    per-body check belongs to the list+summary unification (overhaul Phase 2).
  const ms = captured.MANUAL_SUMMARIES;
  if (ms && typeof ms === 'object' && !Array.isArray(ms)) {
    const listDays = new Set();
    for (const [k, v] of Object.entries(captured)) {
      if (!/_CACHED_DATA$/.test(k) || !Array.isArray(v)) continue;
      for (const row of v) { const d = calDay(localDate, row && (row.date || row.eventDate)); if (d) listDays.add(d); }
    }
    if (listDays.size) {
      const orphans = [];
      for (const key of Object.keys(ms)) {
        const seg = key.split('|');
        if (seg.length < 2) continue;
        const d = calDay(localDate, seg[1]);
        if (d && d >= today && !listDays.has(d)) orphans.push(seg.slice(0, 2).join(' '));
      }
      if (orphans.length) {
        out.push({ name: 'MANUAL_SUMMARIES', severity: 'Medium',
          message: `${orphans.length} future meeting summary(ies) have no cached list row, so they won't render: ` +
            orphans.slice(0, 8).join('; ') + (orphans.length > 8 ? ' …' : '') + `. Add the meeting(s) to the matching *_CACHED_DATA list.` });
      }
    }
  }
  return out;
}

module.exports = { readBaseline, writeBaseline, updateBaseline, detectAnomalies, detectStaleData, baselineFile, EXCLUDE };

// ── CLI: update + persist the baseline (run by content-refresh.yml) ──
if (require.main === module) {
  const REPO_ROOT = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..');
  const { loadDataArrays } = require('./lib/load-data.js');
  try {
    const { arrays, captured, localDate } = loadDataArrays(REPO_ROOT);
    const today = todayDenver();
    const baseline = readBaseline(REPO_ROOT);
    updateBaseline(baseline, arrays, today);
    writeBaseline(REPO_ROOT, baseline);
    const findings = detectAnomalies(arrays, baseline).concat(detectStaleData(captured, localDate, today));
    console.log(`source-health: tracked ${Object.keys(arrays).length} source arrays (${today}); baseline updated.`);
    if (findings.length) {
      console.log(`source-health: ${findings.length} finding(s) — content-review will alert:`);
      for (const a of findings) console.log(`  ⚠ [${a.severity}] ${a.message}`);
    } else {
      console.log('source-health: no anomalies.');
    }
  } catch (e) {
    // Never fail the content-refresh workflow over a monitoring hiccup.
    console.warn('source-health: skipped —', e.message);
  }
}
