#!/usr/bin/env node
/**
 * digest-review.js — the Sunday-morning review of the Monday digests.
 *
 * Morgan 2026-10-04: review both digests (Week Ahead + Past Meetings) early
 * Sunday so errors are caught before the afternoon read-through; after the
 * review the bot stops re-rendering them until Monday afternoon (see
 * digest-sunday-review.yml and the freeze guard in digest-refresh.yml).
 *
 * Report only — it never edits a digest. Two layers:
 *   1. Mechanical checks: every link fetched; every "TUE, OCT 6" badge's
 *      weekday matches its date and falls in the email's window; recap links
 *      point at a real recap; size / inline-image limits.
 *   2. An editorial read by Claude of each email's text (what everyone sees):
 *      contradictions, wrong days or times, meetings in the wrong section,
 *      bare "Town Council" names, typos, stale wording.
 *
 * Usage: node scripts/digest-review.js [outDir=digest]
 *   writes <outDir>/review.json, review.md, review.html; prints ISSUES=<n>.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const RR = require('./lib/recap-regions.js');
const { SONNET } = require('./lib/claude-model.js');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.resolve(process.argv[2] || path.join(ROOT, 'digest'));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const decode = (s) => String(s)
  .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n))
  .replace(/&rsquo;|&lsquo;/g, '’').replace(/&rarr;/g, '→').replace(/&middot;/g, '·').replace(/&mdash;/g, '—')
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// The everyone (ALL) copy: what a reader with no region sees, and what the
// archive keeps. Same split the digest Worker uses (ltRegionVariant offset 1).
function variant(html, off) {
  if (!html.includes(RR.REGION_MARK)) return html;
  return html.split(RR.REGION_MARK).filter((p, i) => i % 5 === 0 || i % 5 === off).join('')
    .split(RR.HIDE_OPEN).join('').split(RR.HIDE_CLOSE).join('');
}
const allVariant = (html) => variant(html, 1);
function textOf(html) {
  return decode(html.replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // The gray source tag ("Town of Telluride") sits beside the date badge and
    // the meeting title is on the next line; keep them apart so the reader of
    // this text doesn't see "Town of Telluride Town of Telluride …".
    .replace(/<\/span>(?=<div)/gi, ' · ')
    .replace(/<\/(p|div|tr|td|h\d)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n').trim();
}

// ── 1. Mechanical checks ────────────────────────────────────────────────────
function checkDates(key, html, d) {
  const issues = [];
  const ws = d.weekStart;
  const [ps, pe] = RR.priorBusinessWeek(ws);
  const windows = key === 'past'
    ? [[ps, pe, 'last week (' + ps + ' to ' + pe + ')']]
    : [[ws, addDays(ws, 6), 'the coming week'], [ps, pe, 'last week (recaps)']];
  const seen = new Set();
  for (const m of decode(html).matchAll(/\b(SUN|MON|TUE|WED|THU|FRI|SAT), (JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC) (\d{1,2})\b/g)) {
    const badge = m[0]; if (seen.has(badge)) continue; seen.add(badge);
    const mon = MONTHS.indexOf(m[2]), day = +m[3];
    // The year that puts this date nearest the email's week (handles Dec/Jan).
    const y0 = +ws.slice(0, 4);
    const cands = [y0 - 1, y0, y0 + 1].map((y) => new Date(Date.UTC(y, mon, day, 12)));
    const dt = cands.sort((a, b) => Math.abs(a - new Date(ws)) - Math.abs(b - new Date(ws)))[0];
    const actual = DAYS[dt.getUTCDay()];
    if (actual !== m[1]) issues.push({ severity: 'high', check: 'date', where: badge, problem: `${badge} is a ${actual}, not a ${m[1]}.` });
    const s = iso(dt);
    if (!windows.some(([a, b]) => s >= a && s <= b)) {
      issues.push({ severity: 'medium', check: 'date', where: badge, problem: `${badge} (${s}) falls outside ${windows.map((w) => w[2]).join(' and ')}.` });
    }
  }
  return issues;
}

function checkSize(key, html) {
  const issues = [];
  if (html.includes('data:image')) issues.push({ severity: 'high', check: 'size', where: key, problem: 'Contains inline data:image payloads; the send will refuse it. Re-approve at the Review Desk.' });
  // Each reader gets one regional copy, so measure the biggest copy, exactly
  // as the digest Worker's send gate does.
  const biggest = Math.max(...[1, 2, 3, 4].map((o) => variant(html, o).length));
  if (biggest > 120000) issues.push({ severity: 'high', check: 'size', where: key, problem: `The largest copy a reader gets is ${biggest} bytes, over the 120 KB send limit.` });
  return issues;
}

function checkRecapAnchors(html, recaps) {
  const ids = new Set(recaps.map(RR.recapId));
  const issues = [];
  for (const m of html.matchAll(/gov-hub-past\.html[^"#]*#(r-[^"]+)"/g)) {
    if (!ids.has(m[1])) issues.push({ severity: 'medium', check: 'link', where: '#' + m[1], problem: 'Recap link points at a recap that is not in data/meeting-recaps.json, so the page will not jump to it.' });
  }
  return issues;
}

// Hosts on the RSS proxy's allow-list block GitHub runner IPs (KOTO's 403s,
// timeouts); check those through the proxy so a blocked runner isn't reported
// as a dead link.
const PROXY = (process.env.RSS_PROXY_URL || '').replace(/\/$/, '');
let proxyHosts = null;
async function viaProxy(url) {
  if (!PROXY) return url;
  if (!proxyHosts) {
    try { proxyHosts = new Set((await (await fetch(PROXY + '/health')).json()).allowed || []); } catch (_) { proxyHosts = new Set(); }
  }
  const host = new URL(url).hostname;
  const ok = [...proxyHosts].some((h) => host === h || host.endsWith('.' + h));
  return ok ? PROXY + '/proxy?url=' + encodeURIComponent(url) : url;
}

async function fetchStatus(url) {
  url = await viaProxy(url);
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctl.signal, headers: { 'User-Agent': UA, Accept: 'text/html,application/pdf,*/*' } });
    try { await r.body?.cancel(); } catch (_) {}
    return r.status;
  } catch (e) { return e.name === 'AbortError' ? 'timeout' : 'error: ' + (e.cause?.code || e.message); }
  finally { clearTimeout(t); }
}

async function checkLinks(htmlByKey) {
  const urls = new Map();   // url → [keys]
  for (const [key, html] of Object.entries(htmlByKey)) {
    for (const m of html.matchAll(/href="([^"]+)"/g)) {
      let u = decode(m[1]);
      if (!/^https?:\/\//.test(u) || u.includes('*|') || u.includes('{{')) continue;   // merge tags, mailto, anchors
      if (/buy\.stripe\.com/.test(u)) continue;
      u = u.replace(/[?&]utm_[^#]*/, '');
      if (!urls.has(u)) urls.set(u, new Set());
      urls.get(u).add(key);
    }
  }
  const list = [...urls.keys()];
  const results = [];
  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < list.length) { const u = list[i++]; results.push([u, await fetchStatus(u)]); }
  }));
  const issues = [];
  for (const [u, st] of results) {
    const where = [...urls.get(u)].join(', ');
    if (typeof st === 'number' && st < 400) continue;
    // 401/403/429 from big sites usually means "bots not welcome", and a
    // timeout or reset is usually the network; only a 404/410/5xx or a host
    // that doesn't exist is reported as broken.
    const soft = st === 401 || st === 403 || st === 429 || st === 'timeout' ||
      (typeof st === 'string' && !/ENOTFOUND|EAI_AGAIN/.test(st));
    issues.push({ severity: soft ? 'low' : 'high', check: 'link', where, url: u,
      problem: soft ? `Could not verify (${st}); the site may block automated checks. Click it once to be sure.` : `Link is broken (${st}).` });
  }
  return { issues, checked: list.length };
}

// ── 2. Editorial read ───────────────────────────────────────────────────────
function callClaude(apiKey, prompt) {
  const body = JSON.stringify({ model: SONNET, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] });
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST', timeout: 120000,
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) } },
    (res) => { let d = ''; res.on('data', (c) => d += c); res.on('end', () => {
      try { const j = JSON.parse(d); if (j.error) return reject(new Error(j.error.message)); resolve((j.content?.[0]?.text || '').trim()); } catch (e) { reject(e); } }); });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('Claude API timeout')); });
    req.write(body); req.end();
  });
}

async function editorialRead(key, d, text, apiKey) {
  const [ps, pe] = RR.priorBusinessWeek(d.weekStart);
  const scope = key === 'past'
    ? `This is the "Past Meetings" email: summaries of public meetings held ${ps} to ${pe}, each with a link to the full recap. It is sent ${d.weekStart}.`
    : `This is "The Week Ahead Outlook": upcoming public meetings and events for ${d.weekStart} to ${addDays(d.weekStart, 6)} (sent the morning of ${d.weekStart}), plus a section of recaps of meetings held ${ps} to ${pe}.`;
  const prompt = [
    'You are proofreading a community email newsletter for Livable Telluride before it is sent. It covers the whole region: San Miguel County (Telluride, Mountain Village, Ophir, Rico, Norwood and the West End) and Ouray County (Ridgway, Ouray), plus regional bodies such as SMART. Find concrete errors a reader would notice or be misled by.',
    'Each meeting is shown with a small town or agency tag before its title (e.g. "Town of Telluride · Town Council"), so a title that relies on that tag for the town is fine. Recap teasers are cut to a sentence or two and may end with "…" by design.',
    scope,
    'Look for: a weekday that does not match its date; times or dates that contradict each other; an upcoming meeting described in the past tense or a past one described as upcoming; an item listed in the wrong section; the same meeting or event listed twice; a governing body named without its town (a bare "Town Council", "City Council", "the Board"); an intro paragraph that mentions something not in the body or gets a detail wrong; "agenda not posted" wording next to an item that does have an agenda link; misspellings, broken sentences, and leftover placeholder text.',
    'Do NOT flag: style preferences, the length of summaries, the order of sections, or links (they are checked separately). Do not invent problems; if the email is clean, return an empty list.',
    'Report each problem once. Do your checking silently: include only confirmed problems, never items you checked and found fine, and keep each "problem" to one or two sentences.',
    'Return ONLY a JSON object, no markdown fence: {"issues":[{"severity":"high|medium|low","where":"the section or item name","quote":"the exact words, under 20 words","problem":"what is wrong","suggestion":"how to fix it"}]}',
    '', 'EMAIL TEXT:', text.slice(0, 60000),
  ].join('\n');
  // Take the JSON object even if the model wraps it in prose; retry once.
  let json = null, lastErr = null;
  for (let attempt = 0; attempt < 2 && !json; attempt++) {
    const raw = await callClaude(apiKey, attempt ? prompt + '\n\nReply with the JSON object only.' : prompt);
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    try { json = JSON.parse(raw.slice(a, b + 1)); } catch (e) { lastErr = e; }
  }
  if (!json) throw lastErr || new Error('no JSON in reply');
  // Drop items the model itself withdrew ("no change needed").
  return (json.issues || [])
    .filter((x) => !/\bwithdrawn\b|no concrete error/i.test(x.problem || '') && !/^no change needed\.?$/i.test(String(x.suggestion || '').trim()))
    .map((x) => Object.assign({ check: 'editorial' }, x));
}

// ── Report ──────────────────────────────────────────────────────────────────
const SEV = { high: 0, medium: 1, low: 2 };
const NO_KEY = 'ANTHROPIC_API_KEY not set — editorial read skipped; mechanical checks only';
function toMarkdown(rep) {
  const L = [`# Digest review: ${rep.weekStart}`, '', `Reviewed ${rep.reviewedAt} (UTC). ${rep.total} issue(s) found; ${rep.linksChecked} links checked.`, ''];
  for (const dg of rep.digests) {
    L.push(`## ${dg.name}`, `*${dg.subject}*`, '');
    if (!dg.issues.length) { L.push('No issues found.', ''); continue; }
    for (const x of dg.issues) {
      L.push(`- **${x.severity.toUpperCase()}** · ${x.check} · ${x.where || ''}${x.quote ? ` · "${x.quote}"` : ''}`);
      L.push(`  ${x.problem}${x.suggestion ? ` *Fix:* ${x.suggestion}` : ''}${x.url ? ` (${x.url})` : ''}`);
    }
    L.push('');
  }
  if (rep.errors.length) L.push('## Review problems', ...rep.errors.map((e) => '- ' + e), '');
  L.push('Edit or approve at https://livabletelluride.org/digest-review.html');
  return L.join('\n');
}
function toHtml(rep) {
  const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const color = { high: '#a8401f', medium: '#b58a2c', low: '#5a6b64' };
  const sec = rep.digests.map((dg) => `<h2 style="font-family:Georgia,serif;color:#21443c;margin:22px 0 4px;">${esc(dg.name)}</h2><div style="color:#5a6b64;font-size:13px;margin-bottom:8px;">${esc(dg.subject)}</div>` +
    (dg.issues.length ? '<ul style="padding-left:18px;margin:0;">' + dg.issues.map((x) => `<li style="margin:0 0 10px;line-height:1.5;"><span style="font-weight:700;color:${color[x.severity] || '#333'};">${esc(x.severity.toUpperCase())}</span> &middot; ${esc(x.check)} &middot; ${esc(x.where)}${x.quote ? ` &middot; &ldquo;${esc(x.quote)}&rdquo;` : ''}<br>${esc(x.problem)}${x.suggestion ? ` <em>Fix:</em> ${esc(x.suggestion)}` : ''}${x.url ? `<br><a href="${esc(x.url)}">${esc(x.url)}</a>` : ''}</li>`).join('') + '</ul>'
      : '<p style="margin:0;">No issues found.</p>')).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Digest review ${esc(rep.weekStart)}</title></head><body style="margin:0;background:#f0ece3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2c3b35;"><div style="max-width:640px;margin:0 auto;background:#fdfbf6;padding:24px 28px;"><div style="font-family:Georgia,serif;font-size:11px;color:#b58a2c;letter-spacing:.18em;text-transform:uppercase;">Livable Telluride &middot; Sunday digest review</div><h1 style="font-family:Georgia,serif;font-size:22px;margin:6px 0 4px;">${rep.total} issue${rep.total === 1 ? '' : 's'} for the ${esc(rep.weekStart)} send</h1><div style="font-size:13px;color:#5a6b64;">Reviewed ${esc(rep.reviewedAt)} UTC &middot; ${rep.linksChecked} links checked &middot; the bot will not re-render these digests until ${esc(rep.frozenUntil || 'Monday afternoon')}.</div>${sec}${rep.errors.length ? '<h2 style="font-family:Georgia,serif;">Review problems</h2><ul>' + rep.errors.map((e) => `<li>${esc(e)}</li>`).join('') + '</ul>' : ''}<p style="margin-top:22px;"><a href="https://livabletelluride.org/digest-review.html" style="color:#a0531f;font-weight:700;">Edit or approve at the Review Desk &rarr;</a></p></div></body></html>`;
}

async function main() {
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'digest', 'manifest.json'), 'utf8'));
  let recaps = [];
  try { recaps = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'meeting-recaps.json'), 'utf8')); } catch (_) {}
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  const rep = { reviewedAt: new Date().toISOString().replace('T', ' ').slice(0, 16), weekStart: man.digests?.weekly?.weekStart || '',
    frozenUntil: process.env.FROZEN_UNTIL || '', digests: [], errors: [], total: 0, linksChecked: 0 };
  const htmlByKey = {};
  for (const key of ['weekly', 'past']) {
    const d = man.digests && man.digests[key]; if (!d) continue;
    try { htmlByKey[key] = fs.readFileSync(path.join(ROOT, d.file), 'utf8'); }
    catch (e) { rep.errors.push(`${key}: ${d.file} is missing`); }
  }
  const links = await checkLinks(htmlByKey);
  rep.linksChecked = links.checked;
  for (const [key, html] of Object.entries(htmlByKey)) {
    const d = man.digests[key];
    let issues = [...checkSize(key, html), ...checkDates(key, allVariant(html), d), ...checkRecapAnchors(html, recaps),
      ...links.issues.filter((x) => x.where.split(', ').includes(key)).map((x) => Object.assign({}, x, { where: x.url }))];
    if (apiKey) {
      try { issues = issues.concat(await editorialRead(key, d, textOf(allVariant(html)), apiKey)); }
      catch (e) { rep.errors.push(`${key}: editorial read failed (${e.message}); mechanical checks still ran`); }
    } else if (!rep.errors.includes(NO_KEY)) rep.errors.push(NO_KEY);
    issues.sort((a, b) => (SEV[a.severity] ?? 3) - (SEV[b.severity] ?? 3));
    rep.digests.push({ key, name: d.name, subject: d.subject, issues });
    rep.total += issues.length;
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'review.json'), JSON.stringify(rep, null, 2) + '\n');
  fs.writeFileSync(path.join(OUT_DIR, 'review.md'), toMarkdown(rep) + '\n');
  fs.writeFileSync(path.join(OUT_DIR, 'review.html'), toHtml(rep));
  const high = rep.digests.reduce((n, dg) => n + dg.issues.filter((x) => x.severity === 'high').length, 0);
  console.log(`digest-review: ${rep.total} issue(s) (${high} high) across ${rep.digests.length} digest(s); ${rep.linksChecked} links checked`);
  console.log('ISSUES=' + rep.total);
  console.log('HIGH=' + high);
}

module.exports = { checkDates, allVariant, variant, textOf };
if (require.main === module) main().catch((e) => { console.error('digest-review FATAL', e.message); process.exit(1); });
