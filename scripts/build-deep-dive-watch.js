#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * build-deep-dive-watch.js — deep-dive ⇄ gov-hub cross-reference
 *
 * Deterministic (no AI). Runs at the end of content-refresh, after
 * build-week-meetings.js, and writes data/deep-dive-watch.json:
 *
 *   { generated, topics: { <key>: {
 *       label, lastUpdated,
 *       upcoming: [week-meetings records whose title/summary/hook
 *                  match the topic's keywords],
 *       recent:   [{source, date, title, snippet}] — past-14-day
 *                  meeting summaries that mention the topic,
 *       developments: [DEEP_DIVE_UPDATES entries for the topic],
 *       stale:    [human-readable reasons this dive needs an edit]
 *   } } }
 *
 * Consumers:
 *   - redesign/deep-dive.js → live "On upcoming agendas" sidebar
 *   - maintenance.js reviewDeepDiveStale() → daily findings issue
 *
 * Keywords come from scripts/deep-dive-refresh.js TOPICS (one map,
 * two consumers). lastUpdated comes from gov-data.js (mirrored to
 * data/land-use-issues.json / data/gondola-data.json) and must be
 * bumped whenever a topic is hand-edited.
 * ══════════════════════════════════════════════════════════════
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { TOPICS } = require('./deep-dive-refresh.js');

const RECENT_DAYS = 14;

function mtToday() {
  // Calendar-date in America/Denver regardless of runner TZ (MT-anchored rule).
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date());
}

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (_) { return fallback; }
}

// The TOPICS keywords were written for Claude triage (a human-quality filter
// runs downstream). This matcher is deterministic, so it needs tighter rules:
//  - '.*' gaps are clamped to within-sentence ("Gondola Corridor Overlay …
//    <two sentences later> … project" must NOT match 'gondola.*project')
//  - some topics get replacement keywords or a source allow-list
const WATCH_OVERRIDES = {
  society: { // bare 'valley floor' matches routine Open Space stewardship (weed pulls)
    keywords: ['society turn', 'valley entrance', 'genesee',
               'valley floor.*(entrance|develop|project|rezon|annex|entitle)',
               '19\\.7.*acre']
  },
  gondola: { // 'Gondola Corridor Overlay' is town zoning jargon, not Gondola 3A
    keywords: ['gondola 3a', '3a gondola', 'new gondola', 'second gondola',
               'gondola.*(funding|ballot|iga|agreement|lawsuit|appeal|extension|study|mountain village)',
               'smart.*(gondola|appeal|ballot)']
  },
  code: { sources: ['telluride', 'county'] } // the dive covers Telluride + SMC code reform, not other towns'
};

function topicRegexes() {
  const out = {};
  for (const [key, t] of Object.entries(TOPICS)) {
    const kws = (WATCH_OVERRIDES[key] && WATCH_OVERRIDES[key].keywords) || t.keywords;
    // \b at both ends: without it a keyword matches mid-word, and on
    // 2026-08-25 'lot l' matched inside "revised MLO bal|lot l|anguage",
    // putting the school board's monthly meeting on the Carhenge/Shandoka
    // watch and onto the homepage Featured Action card. Every keyword starts
    // and ends with a word character, so the boundaries are unconditional.
    out[key] = kws.map(k => new RegExp('\\b' + k.replace(/\.\*/g, '[^.!?]{0,60}') + '\\b', 'i'));
  }
  return out;
}

function matchTopics(regexes, text, source) {
  return Object.keys(regexes).filter(key => {
    const allow = WATCH_OVERRIDES[key] && WATCH_OVERRIDES[key].sources;
    if (allow && source && allow.indexOf(source) === -1) return false;
    return regexes[key].some(re => re.test(text));
  });
}

// Parse the freeform timeline dates ('Jul 23, 2026', 'Jul 6–17, 2026',
// 'May 2026') far enough to compare with today. Unparseable → null (skipped).
function parseLooseDate(s) {
  const m = String(s || '').match(/^([A-Z][a-z]{2,8})\.? (\d{1,2})(?:\s*[–—-]\s*\d{1,2})?, (\d{4})$/) ||
            String(s || '').match(/^([A-Z][a-z]{2,8})\.? (\d{4})$/);
  if (!m) return null;
  const d = m.length === 4 ? new Date(`${m[1]} ${m[2]}, ${m[3]}`) : new Date(`${m[1]} 1, ${m[2]}`);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

function snippet(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, '') + '…';
}

function run(repoRoot) {
  const dataDir = path.join(repoRoot, 'data');
  const weekMeetings = readJson(path.join(dataDir, 'week-meetings.json'), []);
  const summaries = readJson(path.join(dataDir, 'manual-summaries.json'), {});
  const issues = readJson(path.join(dataDir, 'land-use-issues.json'), {});
  const gondola = readJson(path.join(dataDir, 'gondola-data.json'), {});
  const updates = readJson(path.join(dataDir, 'deep-dive-updates.json'), []);
  if (gondola && gondola.label) issues.gondola = gondola;

  const regexes = topicRegexes();
  const today = mtToday();
  const cutoff = new Date(Date.parse(today) - RECENT_DAYS * 86400000).toISOString().slice(0, 10);

  const topics = {};
  for (const key of Object.keys(TOPICS)) {
    topics[key] = {
      label: TOPICS[key].label,
      lastUpdated: (issues[key] && issues[key].lastUpdated) || '',
      upcoming: [], recent: [], developments: [], stale: []
    };
  }

  // ── Upcoming: this week's meetings whose visible text mentions a topic ──
  for (const m of weekMeetings) {
    const text = [m.title, m.summary, m.hook].filter(Boolean).join(' ');
    for (const key of matchTopics(regexes, text, m.source)) {
      topics[key].upcoming.push({
        source: m.source, sourceLabel: m.sourceLabel, title: m.title,
        date: m.date, time: m.time || '', location: m.location || '',
        agendaUrl: m.agendaUrl || '', link: m.link || '',
        zoomLink: m.zoomLink || '', livestream: m.livestream || ''
      });
    }
  }

  // ── Recent: past-14-day meeting summaries that mention a topic ──
  // manual-summaries.json keys are 'source|YYYY-MM-DD|Title'.
  for (const [k, summary] of Object.entries(summaries)) {
    const parts = k.split('|');
    if (parts.length < 3) continue;
    const [source, date] = parts;
    const title = parts.slice(2).join('|');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date >= today || date < cutoff) continue;
    for (const key of matchTopics(regexes, title + ' ' + summary, source)) {
      topics[key].recent.push({ source, date, title, snippet: snippet(summary, 200) });
    }
  }
  for (const t of Object.values(topics)) t.recent.sort((a, b) => b.date.localeCompare(a.date));

  // ── Developments: deep-dive-refresh.js triaged updates (if any) ──
  for (const u of updates) {
    if (u && u.topic && topics[u.topic]) topics[u.topic].developments.push(u);
  }

  // ── Staleness: watched activity newer than the topic's last hand-edit ──
  for (const [key, t] of Object.entries(topics)) {
    if (t.lastUpdated) {
      for (const r of t.recent) {
        if (r.date > t.lastUpdated) {
          t.stale.push(`${t.label}: ${r.sourceLabel || r.source} discussed it on ${r.date} ` +
            `("${snippet(r.title, 60)}") but the deep dive was last edited ${t.lastUpdated}.`);
        }
      }
    }
    // A timeline entry still marked future:true whose date has passed.
    const tl = (issues[key] && issues[key].timeline) || [];
    for (const entry of tl) {
      if (!entry.future) continue;
      const d = parseLooseDate(entry.date);
      if (d && d < today) {
        t.stale.push(`${t.label}: timeline entry "${snippet(entry.title, 60)}" (${entry.date}) ` +
          `is still marked upcoming but the date has passed.`);
      }
    }
  }

  const out = { generated: new Date().toISOString(), topics };
  fs.writeFileSync(path.join(dataDir, 'deep-dive-watch.json'), JSON.stringify(out, null, 1) + '\n');
  const counts = Object.entries(topics)
    .map(([k, t]) => `${k}:${t.upcoming.length}u/${t.recent.length}r${t.stale.length ? '/' + t.stale.length + 'STALE' : ''}`)
    .join(' ');
  console.log(`  deep-dive-watch: ${counts}`);
  return out;
}

module.exports = { run };

if (require.main === module) {
  run(process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..'));
}
