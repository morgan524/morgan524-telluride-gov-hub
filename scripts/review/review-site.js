#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Website review · STEP 2 — full-site orchestrator (review-site.js)
// ════════════════════════════════════════════════════════════════════
//
// Fans review-page.js out across every public page, runs the per-page
// adversarial verify, then synthesizes: dedups findings across pages, flags
// site-wide issues, writes a JSON report, and opens a GitHub issue.
//
// Per-page work is browser automation (Playwright + a vision call), so the
// fan-out is a Node orchestrator (shared browser, bounded concurrency) rather
// than one Claude subagent per page — same LLM judgment, a fraction of the cost.
//
// Usage:
//   node scripts/review/review-site.js                 # all pages, verify, open issue
//   node scripts/review/review-site.js --limit 5 --no-issue   # quick test
//   node scripts/review/review-site.js --concurrency 3 --no-verify
//
// Needs: Playwright + chromium, ANTHROPIC_API_KEY, and (to open an issue) gh.

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { reviewPage, SEV_ORDER, dedupSig } = require('./review-page.js');
const { SONNET } = require('../lib/claude-model.js');

const MODEL = process.env.REVIEW_MODEL || SONNET;
const SITE = process.env.REVIEW_SITE || 'https://livabletelluride.org';
const OUT = path.join(__dirname, 'site-review.json');
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const REPO = process.env.REVIEW_REPO || 'morgan524/morgan524-telluride-gov-hub';

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const valOf = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const LIMIT = parseInt(valOf('--limit', '0'), 10);
const CONC = parseInt(valOf('--concurrency', '4'), 10);
const ISSUE_TITLE = valOf('--issue-title', null);
const NO_AI = flag('--no-ai');
const NO_VERIFY = flag('--no-verify');
const NO_ISSUE = flag('--no-issue');

function get(url) {
  return new Promise((res, rej) => { https.get(url, { headers: { 'User-Agent': 'review-bot' }, timeout: 15000 }, (r) => { let d = ''; r.on('data', (c) => { d += c; }); r.on('end', () => res(d)); }).on('error', rej).on('timeout', function () { this.destroy(); rej(new Error('timeout')); }); });
}

// Page list: prefer the deployed sitemap.xml; fall back to repo root *.html.
async function discoverPages() {
  try {
    const xml = await get(`${SITE}/sitemap.xml`);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter((u) => /^https?:\/\//.test(u));
    if (locs.length) return [...new Set(locs)];
  } catch (e) { /* fall through */ }
  const htmls = fs.readdirSync(REPO_ROOT).filter((f) => f.endsWith('.html') && !/backup|preview|mockup|test/i.test(f));
  return htmls.map((f) => `${SITE}/${f}`);
}

function normTitle(f) {
  return (f.title || '').toLowerCase().replace(/https?:\/\/\S+/g, '').replace(/[0-9]+/g, '').replace(/[^a-z ]+/g, ' ').split(/\s+/).filter(Boolean).slice(0, 6).join(' ');
}
const groupKey = (f) => dedupSig(f) || `${f.area}:${normTitle(f)}`;

async function synthesize(pages, siteWide) {
  if (NO_AI || !process.env.ANTHROPIC_API_KEY) return '';
  const digest = {
    pagesReviewed: pages.filter((p) => !p.error).length,
    severityCounts: pages.flatMap((p) => p.findings || []).reduce((m, f) => ((m[f.severity] = (m[f.severity] || 0) + 1), m), {}),
    siteWide: siteWide.map((s) => `${s.example.title} (${s.pages.length} pages, ${s.example.severity})`).slice(0, 12),
    topPerPage: pages.filter((p) => !p.error).map((p) => ({ page: p.url.replace(SITE, ''), top: (p.findings || []).filter((f) => f.severity === 'critical' || f.severity === 'high').map((f) => f.title).slice(0, 4) })).filter((p) => p.top.length).slice(0, 25),
  };
  const body = JSON.stringify({ model: MODEL, max_tokens: 600,
    system: 'You are the editor of a website-QA report for livabletelluride.org. Given a digest of findings across the whole site, write a tight 2-4 sentence executive summary: overall health, the most important themes/site-wide issues, and what to fix first. Plain prose, no markdown headers, no preamble.',
    messages: [{ role: 'user', content: 'DIGEST:\n' + JSON.stringify(digest, null, 2) }] });
  return new Promise((resolve) => {
    const req = https.request({ hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) }, timeout: 60000 },
      (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => { try { resolve((JSON.parse(d).content?.[0]?.text || '').trim()); } catch { resolve(''); } }); });
    req.on('error', () => resolve('')); req.on('timeout', () => { req.destroy(); resolve(''); }); req.write(body); req.end();
  });
}

function buildIssueBody(pages, siteWide, summary) {
  const rel = (u) => u.replace(SITE, '') || '/';
  const ok = pages.filter((p) => !p.error);
  const errored = pages.filter((p) => p.error);
  const all = ok.flatMap((p) => (p.findings || []).map((f) => ({ ...f, page: rel(p.url) })));
  const counts = all.reduce((m, f) => ((m[f.severity] = (m[f.severity] || 0) + 1), m), {});
  const tag = { critical: '🟥', high: '🟧', medium: '🟨', low: '⬜' };
  let md = '';
  md += `_Updated ${new Date().toUTCString()}_\n\n`;
  if (summary) md += `${summary}\n\n`;
  md += `**${ok.length} pages reviewed** · ${all.length} findings: `
    + ['critical', 'high', 'medium', 'low'].map((s) => `${counts[s] || 0} ${s}`).join(' · ')
    + (errored.length ? ` · ⚠️ ${errored.length} page(s) failed to load` : '') + `\n\n`;

  if (siteWide.length) {
    md += `## 🌐 Site-wide issues (appear on multiple pages)\n`;
    for (const s of siteWide.sort((a, b) => (SEV_ORDER[a.example.severity] ?? 9) - (SEV_ORDER[b.example.severity] ?? 9))) {
      md += `- ${tag[s.example.severity] || ''} **[${s.example.severity}]** (${s.example.area}) ${s.example.title} — *${s.pages.length} pages*\n  ↳ ${s.example.fix || ''}\n`;
    }
    md += `\n`;
  }

  md += `## 📄 Per-page findings (critical + high)\n`;
  for (const p of ok) {
    const hi = (p.findings || []).filter((f) => f.severity === 'critical' || f.severity === 'high');
    const lowN = (p.findings || []).length - hi.length;
    if (!hi.length && !lowN) continue;
    md += `\n### [${rel(p.url)}](${p.url})\n`;
    if (p.summary) md += `_${p.summary}_\n`;
    for (const f of hi) md += `- ${tag[f.severity]} **[${f.severity}]** (${f.area}) ${f.title}${f.evidence ? ` — ${f.evidence}` : ''}\n  ↳ ${f.fix || ''}\n`;
    if (lowN) md += `- …and ${lowN} medium/low finding(s).\n`;
  }
  if (errored.length) md += `\n## ⚠️ Pages that failed to load\n` + errored.map((p) => `- ${rel(p.url)} — ${p.error}`).join('\n') + '\n';
  md += `\n---\n<sub>Generated by \`scripts/review/review-site.js\`. Full detail (incl. medium/low + unverified links) in \`scripts/review/site-review.json\`.</sub>\n`;
  return md;
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  const worker = async () => { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

(async () => {
  if (!NO_AI && !process.env.ANTHROPIC_API_KEY) { console.error('  ✗ ANTHROPIC_API_KEY not set (use --no-ai)'); process.exit(1); }
  let urls = await discoverPages();
  if (LIMIT > 0) urls = urls.slice(0, LIMIT);
  console.log(`\n  Full-site review — ${urls.length} page(s), concurrency ${CONC}${NO_AI ? ', signals only' : NO_VERIFY ? ', no verify' : ', with verify'}\n  ${'─'.repeat(70)}`);

  const browser = await chromium.launch({ headless: true });
  let done = 0;
  const pages = await pool(urls, CONC, async (url) => {
    try {
      const r = await reviewPage(url, { browser, noAi: NO_AI, verify: !NO_VERIFY });
      const { shots, ...clean } = r;
      const c = r.findings.filter((f) => f.severity === 'critical' || f.severity === 'high').length;
      console.log(`  ✓ (${++done}/${urls.length}) ${url.replace(SITE, '') || '/'} — ${r.findings.length} findings (${c} crit/high)`);
      return clean;
    } catch (e) {
      console.log(`  ✗ (${++done}/${urls.length}) ${url.replace(SITE, '') || '/'} — ERROR ${String(e.message || e).slice(0, 80)}`);
      return { url, error: String(e.message || e).slice(0, 200), findings: [] };
    }
  });
  await browser.close().catch(() => {});

  // Cross-page grouping → site-wide detection.
  const groups = new Map();
  for (const p of pages) for (const f of (p.findings || [])) {
    const k = groupKey(f); const g = groups.get(k) || { example: f, pages: new Set() };
    g.pages.add(p.url.replace(SITE, '') || '/');
    if ((SEV_ORDER[f.severity] ?? 9) < (SEV_ORDER[g.example.severity] ?? 9)) g.example = f;
    groups.set(k, g);
  }
  const pagesReviewed = pages.filter((p) => !p.error).length;
  const swThreshold = Math.max(4, Math.ceil(pagesReviewed * 0.3));
  const siteWide = [...groups.values()].filter((g) => g.pages.size >= swThreshold).map((g) => ({ example: g.example, pages: [...g.pages] }));

  const summary = await synthesize(pages, siteWide);

  fs.writeFileSync(OUT, JSON.stringify({ site: SITE, reviewedAt: new Date().toISOString(), model: NO_AI ? null : MODEL, summary, pagesReviewed, siteWide, pages }, null, 2));
  const issueBody = buildIssueBody(pages, siteWide, summary);
  const bodyFile = path.join(require('os').tmpdir(), 'site-review-issue.md');
  fs.writeFileSync(bodyFile, issueBody);

  const total = pages.flatMap((p) => p.findings || []).length;
  console.log(`  ${'─'.repeat(70)}`);
  if (summary) console.log(`  ${summary}\n`);
  console.log(`  ${pagesReviewed} pages · ${total} findings · ${siteWide.length} site-wide`);
  console.log(`  Report: ${path.relative(REPO_ROOT, OUT)}`);

  if (NO_ISSUE) { console.log(`  (--no-issue) Issue body written to ${bodyFile}\n`); return; }
  // Rolling issue: with --issue-title, update the open issue of that exact title
  // (no daily spam); otherwise open a fresh dated issue (manual one-off runs).
  const date = new Date().toISOString().slice(0, 10);
  const title = ISSUE_TITLE || `🔎 Full-site review — ${date}`;
  try {
    let num = null;
    if (ISSUE_TITLE) {
      try {
        const list = JSON.parse(execFileSync('gh', ['issue', 'list', '--repo', REPO, '--state', 'open', '--search', 'in:title ' + ISSUE_TITLE, '--json', 'number,title'], { encoding: 'utf8' }));
        const m = list.find((i) => i.title === ISSUE_TITLE); if (m) num = m.number;
      } catch (e) { /* fall through to create */ }
    }
    if (num) {
      execFileSync('gh', ['issue', 'edit', String(num), '--repo', REPO, '--body-file', bodyFile], { encoding: 'utf8' });
      console.log(`  ✓ Updated issue #${num}: ${title}\n`);
    } else {
      const url = execFileSync('gh', ['issue', 'create', '--repo', REPO, '--title', title, '--body-file', bodyFile], { encoding: 'utf8' }).trim();
      console.log(`  ✓ Opened issue: ${url}\n`);
    }
  } catch (e) { console.log(`  ✗ Could not write issue (${String(e.message || e).slice(0, 100)}). Body at ${bodyFile}\n`); }
})().catch((e) => { console.error(e); process.exit(1); });
