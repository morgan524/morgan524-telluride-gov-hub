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

module.exports = { readBaseline, writeBaseline, updateBaseline, detectAnomalies, baselineFile, EXCLUDE };

// ── CLI: update + persist the baseline (run by content-refresh.yml) ──
if (require.main === module) {
  const REPO_ROOT = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..');
  const { loadDataArrays } = require('./lib/load-data.js');
  try {
    const { arrays } = loadDataArrays(REPO_ROOT);
    const today = todayDenver();
    const baseline = readBaseline(REPO_ROOT);
    updateBaseline(baseline, arrays, today);
    writeBaseline(REPO_ROOT, baseline);
    const anomalies = detectAnomalies(arrays, baseline);
    console.log(`source-health: tracked ${Object.keys(arrays).length} source arrays (${today}); baseline updated.`);
    if (anomalies.length) {
      console.log(`source-health: ${anomalies.length} anomaly(ies) — content-review will alert:`);
      for (const a of anomalies) console.log(`  ⚠ [${a.severity}] ${a.message}`);
    } else {
      console.log('source-health: no anomalies.');
    }
  } catch (e) {
    // Never fail the content-refresh workflow over a monitoring hiccup.
    console.warn('source-health: skipped —', e.message);
  }
}
