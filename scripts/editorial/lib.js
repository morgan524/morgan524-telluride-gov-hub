// Shared helpers for the editorial layer (loop + publish job).

const fs = require('fs');
const path = require('path');
const https = require('https');
const { extractJsObject } = require('../lib/extract.js');
const { SOURCE_LABELS } = require('./write-draft.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WORKER_DEFAULT = 'https://livabletelluride-rss-proxy.morgan-8f0.workers.dev';

function kebab(s, words) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim()
    .split(/\s+/).slice(0, words || 7).join('-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// Deterministic Firestore doc id / dedup key derived from the MEETING (not the
// generated headline), so the loop can check "already drafted?" before spending
// on scoring/drafting. The public URL uses draft.slug (headline-based) instead.
function meetingId(m) {
  return `${m.date}-${m.source}-${kebab(m.title, 6)}`;
}

function daysSince(isoDate) {
  const d = new Date(isoDate + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function loadMeetings() {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'js', 'gov-helpers.js'), 'utf8');
  const summaries = extractJsObject(src, 'MANUAL_SUMMARIES');
  if (!summaries) throw new Error('Could not extract MANUAL_SUMMARIES');
  return Object.entries(summaries).map(([key, summary]) => {
    const [source, date, ...rest] = key.split('|');
    return { key, source, date, title: rest.join('|'), summary };
  });
}

// JSON HTTP helpers for talking to the Worker.
function httpJson(method, url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      timeout: 30000,
    }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; });
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(d || '{}') }); } catch (e) { resolve({ status: res.statusCode, json: {}, raw: d }); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('worker timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

// ── Conditional context (brief's step 4): gather only when warranted ──
// Prior-summary pull: when triage flagged a follow_up_to, attach the most
// recent earlier non-placeholder summary from the same body. Budget cross-check:
// when the summary references spending, attach a local Town-budget digest if
// one has been provided at data/town-budget-context.txt (v1 hook — deepen to a
// live budget-doc fetch/parse later).
function isPlaceholder(s) {
  return !s || s.trim().length < 40 || /agenda\s+(text\s+|details\s+)?(not|isn'?t)\s+(yet\s+)?(available|posted)|hasn'?t\s+been\s+posted|no\s+agenda/i.test(s);
}

function gatherContext(meeting, triage, allMeetings) {
  const context = [];
  if (triage && triage.follow_up_to) {
    const prior = allMeetings
      .filter((m) => m.source === meeting.source && m.date < meeting.date && !isPlaceholder(m.summary))
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (prior) {
      context.push({
        text: `Earlier related meeting — ${SOURCE_LABELS[prior.source] || prior.source}, ${prior.title}, ${prior.date}`,
        body: prior.summary,
      });
    }
  }
  const mentionsMoney = /\$[\d,]|\bbudget\b|\bappropriat|\bmill levy\b|\bfunding\b|\bspend(ing)?\b|\bcost(s)?\b/i.test(meeting.summary || '');
  if (mentionsMoney) {
    const budgetFile = path.join(REPO_ROOT, 'data', 'town-budget-context.txt');
    if (fs.existsSync(budgetFile)) {
      const body = fs.readFileSync(budgetFile, 'utf8').slice(0, 6000);
      if (body.trim()) context.push({ text: 'Town of Telluride budget reference (for cross-checking dollar figures)', body });
    }
  }
  return context;
}

// ── Published article page (/meetings/<slug>/index.html) ──
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function fmtDate(date) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    const d = new Date(date + 'T12:00:00');
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Denver' });
  }
  return date || '';
}

function renderArticlePage(draft) {
  const title = draft.editedTitle || draft.title || 'Untitled';
  const dek = draft.editedDek || draft.dek || '';
  const body = draft.editedBodyHtml || draft.bodyHtml || '';
  const label = draft.bodyLabel || draft.source || '';
  const cites = (draft.citations || []).map((c) => {
    const u = /^https?:\/\//i.test(c.url || '') ? c.url : '';
    return `<li>${u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(c.text)}</a>` : esc(c.text)}</li>`;
  }).join('');
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — Livable Telluride</title>
<meta name="description" content="${esc(dek)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(dek)}">
<meta property="og:type" content="article">
<style>
:root{--forest:#21443c;--accent-green:#2f7a5f;--gold:#b58a2c;--rust:#a0531f;--bg-warm:#fdfbf6;--text-primary:#1a2e29;--text-secondary:#4a5e57;--text-muted:#7a8a85;--border-soft:rgba(33,68,60,.12);--font-heading:'Georgia','Times New Roman',serif;--font-main:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;}
*{box-sizing:border-box;}body{margin:0;font-family:var(--font-main);color:var(--text-primary);background:var(--bg-warm);line-height:1.5;}
.nav{display:flex;align-items:center;gap:18px;flex-wrap:wrap;max-width:760px;margin:0 auto;padding:16px 20px;border-bottom:1px solid var(--border-soft);}
.nav img{height:40px;}.nav a{color:var(--forest);text-decoration:none;font-size:.85rem;font-weight:600;}.nav a:hover{color:var(--accent-green);}
.wrap{max-width:680px;margin:0 auto;padding:30px 20px 70px;}
.eyebrow{font-size:.78rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);margin:0 0 8px;}
h1{font-family:var(--font-heading);font-size:2.1rem;line-height:1.15;color:var(--forest);margin:0 0 12px;}
.dek{font-size:1.15rem;font-style:italic;color:var(--text-secondary);line-height:1.5;margin:0 0 16px;}
.byline{font-size:.9rem;color:var(--text-muted);border-bottom:1px solid var(--border-soft);padding-bottom:16px;margin-bottom:22px;}
.body{font-size:1.08rem;line-height:1.72;}.body p{margin:0 0 18px;}
.body sup.cite{color:var(--accent-green);font-weight:700;font-size:.72em;}
.body .flag{font-style:italic;}
.sources{margin-top:30px;padding-top:18px;border-top:1px solid var(--border-soft);}
.sources h2{font-size:.76rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted);margin:0 0 10px;}
.sources ol{margin:0;padding-left:20px;}.sources li{font-size:.88rem;color:var(--text-secondary);margin:5px 0;}.sources a{color:var(--accent-green);}
.foot{margin-top:34px;font-size:.9rem;}.foot a{color:var(--accent-green);font-weight:600;text-decoration:none;}
</style></head>
<body>
<nav class="nav">
  <a href="/"><img src="/logo/Livable%20Telluride%20Logo.png" alt="Livable Telluride" onerror="this.style.display='none'"></a>
  <a href="/local-news.html">Local News</a><a href="/gov-hub.html">Gov-Hub</a><a href="/events.html">Events</a><a href="/hub-bub.html">Hub-Bub</a>
</nav>
<div class="wrap">
  <div class="eyebrow">${esc(label)} · Meeting coverage</div>
  <h1>${esc(title)}</h1>
  ${dek ? `<p class="dek">${esc(dek)}</p>` : ''}
  <div class="byline">Livable Telluride · ${esc(fmtDate(draft.meetingDate))}</div>
  <div class="body">${body}</div>
  ${cites ? `<div class="sources"><h2>Sources</h2><ol>${cites}</ol></div>` : ''}
  <p class="foot"><a href="/gov-hub.html">← More from the Gov-Hub</a></p>
</div>
</body></html>`;
}

module.exports = {
  REPO_ROOT, WORKER_DEFAULT, kebab, meetingId, daysSince, loadMeetings,
  httpJson, gatherContext, isPlaceholder, renderArticlePage, esc, fmtDate,
};
