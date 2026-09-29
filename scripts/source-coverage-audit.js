#!/usr/bin/env node
/**
 * source-coverage-audit.js — MONTHLY "is every source still delivering what it
 * should?" review (Morgan, 2026-09-29).
 *
 * The daily/weekly checks catch a source that suddenly BREAKS (count drops to
 * zero). They can't see a source that never worked or degraded quietly — the
 * 2026-09-29 session found five of those at once: Ouray County dead for a year
 * (feed went empty, no baseline to drop from), CivicClerk silently capping
 * every County query at 15, packets never read for County/Norwood/Airport,
 * BOCC votes keyed to the wrong commissioners, Telluride votes stuck since June.
 *
 * This compares EXPECTED (scripts/source-coverage-expect.json) with ACTUAL per
 * source:
 *   1. Scorecard — upcoming meetings, % with a start time, recent meetings
 *      with an agenda / packet, near-term agendas with no summary.
 *   2. Probes   — the listing page/API each scraper reads still answers and
 *      still matches; JSON lists returning a round count (15/20/25/50/100)
 *      are flagged as possible silent truncation.
 *   3. Config   — vote-tracker-config roster ids must exist in the tracker's
 *      *_ALL_MEMBERS; every `recaps` source must have a CHANNELS entry.
 *   4. The weekly recap + vote-tracker checks, folded into one report.
 * With ANTHROPIC_API_KEY set, each RED probe gets a short Claude diagnosis
 * ("what probably changed, where to fix it").
 *
 * scripts/source-coverage-baseline.json remembers when each issue was first
 * seen, so the report separates NEW from STILL OPEN.
 *
 * Usage:  node scripts/source-coverage-audit.js [--out report.md] [--update-baseline] [--no-ai]
 * Exit 0 = nothing red. Exit 1 = at least one RED item (CI opens an issue).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');
const { loadDataArrays } = require('./lib/load-data.js');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const argVal = (f) => { const i = args.indexOf(f); return i > -1 ? args[i + 1] : null; };
const OUT = argVal('--out');
const UPDATE_BASELINE = args.includes('--update-baseline');
const NO_AI = args.includes('--no-ai');
const BASELINE = path.join(__dirname, 'source-coverage-baseline.json');

const EXPECT = JSON.parse(fs.readFileSync(path.join(__dirname, 'source-coverage-expect.json'), 'utf8'));
const today = new Date(); today.setHours(0, 0, 0, 0);
const day = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

function get(url, headers = {}) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', ...headers }, timeout: 30000 }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume(); return resolve(get(new URL(r.headers.location, url).href, headers));
      }
      let t = ''; r.setEncoding('utf8'); r.on('data', (c) => { t += c; }); r.on('end', () => resolve({ status: r.statusCode, text: t }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, text: '' }); });
    req.on('error', () => resolve({ status: 0, text: '' }));
  });
}

const findings = [];   // { id, level: 'RED'|'YELLOW', source, what, detail }
const add = (level, source, key, what, detail = '') => findings.push({ id: `${source}:${key}`, level, source, what, detail });

(async () => {
  // ── 1. Scorecard from the same getters every surface uses ───────────────────
  const { captured } = loadDataArrays(ROOT);
  const gSrc = fs.readFileSync(path.join(__dirname, 'build-week-meetings.js'), 'utf8');
  const GETTERS = [...gSrc.matchAll(/\['(\w+)',\s*'([^']+)',\s*'(get\w+)'\]/g)].map((m) => ({ key: m[1], label: m[2], fn: m[3] }));
  const isPlaceholder = (() => { try { return require('./lib/clean-text.js').isPlaceholderSummary; } catch (e) { return () => false; } })();
  const rows = [];
  for (const g of GETTERS) {
    const exp = EXPECT[g.key] || {};
    let arr = [];
    try { arr = (captured[g.fn] && captured[g.fn]()) || []; } catch (e) { add('RED', g.key, 'getter', `${g.fn}() threw`, e.message); }
    arr = arr.filter((m) => m && m.eventDate instanceof Date && !isNaN(m.eventDate));
    const upcoming = arr.filter((m) => m.eventDate >= today && m.eventDate <= new Date(+today + 30 * day));
    const withTime = upcoming.filter((m) => String(m.eventTimes || '').trim());
    // Meetings that should already have their documents: the last 10 days
    // through 2 days out (Colorado bodies post agendas 24–72h ahead).
    const recent = arr.filter((m) => m.eventDate >= new Date(+today - 10 * day) && m.eventDate <= new Date(+today + 2 * day));
    const hasAgenda = (m) => !!(m.agendaLink || m.agendaUrl || (m.hasAgenda && m.link) || m.packetUrl);
    const withAgenda = recent.filter(hasAgenda);
    const withPacket = recent.filter((m) => m.packetUrl);
    const soon = upcoming.filter((m) => m.eventDate <= new Date(+today + 7 * day) && hasAgenda(m));
    let noSummary = 0;
    for (const m of soon) {
      let s = ''; try { s = captured.getMeetingSummary(m) || ''; } catch (e) { /* none */ }
      if (!s || isPlaceholder(s)) noSummary++;
    }
    const r = { key: g.key, label: g.label, upcoming: upcoming.length, timePct: pct(withTime.length, upcoming.length),
      recent: recent.length, agendaPct: pct(withAgenda.length, recent.length), packetPct: pct(withPacket.length, recent.length), noSummary };
    rows.push(r);
    if (!upcoming.length) add('RED', g.key, 'no-upcoming', `${g.label}: no meetings in the next 30 days`, 'Either the body is on break or its scraper/feed has stopped. Check the probe below and the content-refresh log.');
    if (exp.times && upcoming.length >= 2 && r.timePct < 50) add('YELLOW', g.key, 'times', `${g.label}: only ${r.timePct}% of upcoming meetings have a start time`);
    if (recent.length >= 2 && r.agendaPct === 0) add('YELLOW', g.key, 'agendas', `${g.label}: none of ${recent.length} recent/imminent meetings has an agenda link`);
    if (exp.packets && recent.length >= 2 && withAgenda.length >= 1 && r.packetPct === 0) add('YELLOW', g.key, 'packets', `${g.label}: agendas found but no packets on ${recent.length} recent meetings`);
    if (noSummary) add('YELLOW', g.key, 'summaries', `${g.label}: ${noSummary} meeting(s) this week have an agenda but no summary`);
  }
  for (const k of Object.keys(EXPECT)) if (!k.startsWith('_') && !GETTERS.find((g) => g.key === k)) add('RED', k, 'unregistered', `${k}: in source-coverage-expect.json but not in build-week-meetings GETTERS`);

  // ── 2. Probes: is the upstream page/API still there and still shaped the same? ─
  const probes = [];
  const fill = (u) => u.replace(/\{today\}/g, iso(today)).replace(/\{plus30\}/g, iso(new Date(+today + 30 * day))).replace(/\{year\}/g, String(today.getFullYear()));
  for (const [key, exp] of Object.entries(EXPECT)) {
    if (key.startsWith('_') || !exp.probe) continue;
    const url = fill(exp.probe.url);
    const r = await get(url);
    const p = { key, url, status: r.status, note: '' };
    if (r.status !== 200) { add('RED', key, 'probe-http', `${key}: listing ${r.status ? 'HTTP ' + r.status : 'unreachable'}`, url); p.note = `HTTP ${r.status}`; p.body = r.text; }
    else if (exp.probe.api) {
      let n = null; try { const j = JSON.parse(r.text); n = Array.isArray(j) ? j.length : (j.value || j.d || []).length; } catch (e) { /* not json */ }
      p.note = n == null ? 'not JSON' : `${n} items`;
      if (n == null) { add('RED', key, 'probe-json', `${key}: API no longer returns JSON`, url); p.body = r.text; }
      else if ([15, 20, 25, 50, 100].includes(n)) add('YELLOW', key, 'probe-cap', `${key}: API returned exactly ${n} items — check for a silent page cap`, 'The CivicClerk API caps at 15 (fixed with fetchCivicClerkAll). If this source has no paging, results may be truncated.');
    } else if (exp.probe.match) {
      const n = (r.text.match(new RegExp(exp.probe.match, 'gi')) || []).length;
      p.note = `${n} match(es)`;
      if (!n) { add('RED', key, 'probe-match', `${key}: listing page no longer matches /${exp.probe.match}/`, `The page loads but its layout/filenames changed — the scraper is probably finding nothing. ${url}`); p.body = r.text; }
    }
    probes.push(p);
  }

  // ── 3. Config drift ─────────────────────────────────────────────────────────
  const tracker = fs.readFileSync(path.join(ROOT, 'v2', 'vote-tracker.html'), 'utf8');
  const members = (name) => { const i = tracker.indexOf(`const ${name} = [`); if (i < 0) return null; const blk = tracker.slice(i, tracker.indexOf('];', i)); return new Set([...blk.matchAll(/id\s*:\s*'([^']+)'/g)].map((m) => m[1])); };
  const MEMBER_CONST = { telluride: 'ALL_MEMBERS', bocc: 'BOCC_ALL_MEMBERS', rico: 'RICO_ALL_MEMBERS', pc: 'PC_ALL_MEMBERS', tomv: 'TOMV_ALL_MEMBERS', drb: 'DRB_ALL_MEMBERS' };
  const vtc = JSON.parse(fs.readFileSync(path.join(__dirname, 'vote-tracker-config.json'), 'utf8'));
  for (const [ent, cfg] of Object.entries(vtc)) {
    if (!cfg || typeof cfg !== 'object' || !Array.isArray(cfg.rosters)) continue;
    const known = MEMBER_CONST[ent] ? members(MEMBER_CONST[ent]) : null;
    if (!cfg.rosters.length) { add('RED', ent, 'roster-empty', `vote-tracker-config '${ent}' has no roster — its votes can never be drafted`); continue; }
    const cur = cfg.rosters[cfg.rosters.length - 1].members || [];
    const bad = known ? cur.filter((id) => !known.has(id)) : [];
    if (bad.length) add('RED', ent, 'roster-ids', `vote-tracker-config '${ent}' roster ids not in the tracker's ${MEMBER_CONST[ent]}: ${bad.join(', ')}`, 'Votes saved under these ids render as empty cells.');
  }
  const recapSrc = fs.readFileSync(path.join(__dirname, 'meeting-recaps.js'), 'utf8');
  const chBlock = recapSrc.slice(recapSrc.indexOf('const CHANNELS = ['), recapSrc.indexOf('];', recapSrc.indexOf('const CHANNELS = [')));
  const channelKeys = new Set([...chBlock.matchAll(/sourceKey:\s*'([^']+)'/g)].map((m) => m[1]));
  for (const [key, exp] of Object.entries(EXPECT)) if (exp.recaps && !channelKeys.has(exp.recaps)) add('RED', key, 'no-channel', `${key}: expected recaps but meeting-recaps.js has no '${exp.recaps}' channel`);

  // ── 4. The existing recap + vote-tracker freshness checks ───────────────────
  const run = (script) => { try { return { ok: true, out: execFileSync('node', [path.join(__dirname, script)], { encoding: 'utf8' }) }; } catch (e) { return { ok: false, out: String(e.stdout || e.message) }; } };
  const recapChk = run('check-recap-freshness.js');
  const voteChk = run('check-vote-tracker-freshness.js');
  if (!recapChk.ok) add('YELLOW', 'recaps', 'freshness', 'Meeting recaps: at least one entity is behind (see below)');
  if (!voteChk.ok) add('YELLOW', 'votes', 'freshness', 'Vote Tracker: at least one body is behind (see below)');

  // ── Optional: Claude diagnosis for RED probe failures ───────────────────────
  const diagnoses = {};
  if (process.env.ANTHROPIC_API_KEY && !NO_AI) {
    const { SONNET } = require('./lib/claude-model.js');
    for (const p of probes.filter((x) => x.body != null).slice(0, 6)) {
      const excerpt = String(p.body).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<a [^>]*href="([^"]+)"[^>]*>/gi, ' [link $1] ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 6000);
      const exp = EXPECT[p.key];
      const prompt = `A civic-info site scrapes public meeting agendas for "${p.key}" from ${p.url}. Expected: ${exp.probe.api ? 'a JSON list of meetings' : 'links matching /' + exp.probe.match + '/'}. Observed: ${p.note}. Page excerpt (tags stripped, links shown as [link URL]):\n\n${excerpt}\n\nIn at most 4 sentences: what most likely changed, and where the agendas/packets are published now (exact URL pattern if visible). Plain text.`;
      const body = JSON.stringify({ model: SONNET, max_tokens: 400, messages: [{ role: 'user', content: prompt }] });
      diagnoses[p.key] = await new Promise((resolve) => {
        const req = https.request('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } }, (r) => {
          let t = ''; r.on('data', (c) => { t += c; }); r.on('end', () => { try { resolve((JSON.parse(t).content || []).map((c) => c.text || '').join('').trim()); } catch (e) { resolve(''); } });
        });
        req.on('error', () => resolve('')); req.end(body);
      });
    }
  }

  // ── Baseline: NEW vs STILL OPEN ─────────────────────────────────────────────
  let base = { items: {} };
  try { base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); } catch (e) { /* first run */ }
  for (const f of findings) f.since = (base.items[f.id] && base.items[f.id].since) || iso(today);
  if (UPDATE_BASELINE) {
    const items = {};
    for (const f of findings) items[f.id] = { level: f.level, since: f.since, what: f.what };
    fs.writeFileSync(BASELINE, JSON.stringify({ updated: iso(today), items }, null, 2) + '\n');
  }
  const resolved = Object.entries(base.items || {}).filter(([id]) => !findings.find((f) => f.id === id));

  // ── Report ──────────────────────────────────────────────────────────────────
  const L = [];
  const reds = findings.filter((f) => f.level === 'RED'), yellows = findings.filter((f) => f.level === 'YELLOW');
  L.push(`# Source coverage audit — ${iso(today)}`, '');
  L.push(`**${reds.length} red · ${yellows.length} yellow · ${resolved.length} resolved since last run**`, '');
  const fmt = (f) => `- ${f.level === 'RED' ? '🔴' : '🟡'} ${f.since === iso(today) ? '**NEW** ' : `(open since ${f.since}) `}${f.what}${f.detail ? `\n  - ${f.detail}` : ''}${diagnoses[f.source] && /probe/.test(f.id) ? `\n  - 🤖 ${diagnoses[f.source].replace(/\n+/g, ' ')}` : ''}`;
  if (reds.length) { L.push('## Red — information is not coming in', ''); reds.forEach((f) => L.push(fmt(f))); L.push(''); }
  if (yellows.length) { L.push('## Yellow — partial or degraded', ''); yellows.forEach((f) => L.push(fmt(f))); L.push(''); }
  if (resolved.length) { L.push('## Resolved since last run', ''); resolved.forEach(([id, v]) => L.push(`- ✅ ${v.what}`)); L.push(''); }
  L.push('## Scorecard', '', '| Source | Upcoming 30d | With time | Recent mtgs | With agenda | With packet | Expect packets |', '|---|---|---|---|---|---|---|');
  const pv = (v) => (v == null ? '—' : v + '%');
  for (const r of rows) L.push(`| ${r.label} | ${r.upcoming} | ${pv(r.timePct)} | ${r.recent} | ${pv(r.agendaPct)} | ${pv(r.packetPct)} | ${(EXPECT[r.key] || {}).packets ? 'yes' : 'no'} |`);
  L.push('', '## Probes', '', '| Source | Status | Result |', '|---|---|---|');
  for (const p of probes) L.push(`| ${p.key} | ${p.status || 'unreachable'} | ${p.note} |`);
  L.push('', '## Weekly checks', '', '```', recapChk.out.trim(), '```', '', '```', voteChk.out.trim(), '```', '');
  L.push('_Expected behaviour lives in `scripts/source-coverage-expect.json`; update it when a body changes how it publishes._');
  const report = L.join('\n');
  if (OUT) fs.writeFileSync(OUT, report + '\n');
  console.log(report);
  process.exit(reds.length ? 1 : 0);
})();
