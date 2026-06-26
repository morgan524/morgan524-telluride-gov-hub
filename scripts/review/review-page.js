#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Website review · single-page reviewer (review-page.js)
// ════════════════════════════════════════════════════════════════════
//
// Loads ONE page in a headless browser, gathers automated signals (console
// errors, failed requests, axe-core a11y, a link check, SEO/meta), captures
// desktop + mobile screenshots, asks Claude (vision) for judgment-level issues,
// optionally runs an adversarial verify pass, and returns severity-ranked
// findings. Deterministic signals stand alone (never depend on the LLM); AI
// findings are additive and deduped against them (higher severity wins).
//
// Used as a MODULE by review-site.js (exports reviewPage), and as a CLI:
//   node scripts/review/review-page.js https://livabletelluride.org/events.html
//   node scripts/review/review-page.js <url> --no-ai      # signals only
//   node scripts/review/review-page.js <url> --verify     # + adversarial verify
//
// Needs: Playwright + chromium (scripts/node_modules) and ANTHROPIC_API_KEY
// (unless --no-ai).

const fs = require('fs');
const path = require('path');
const https = require('https');
const { chromium } = require('playwright');
const { SONNET } = require('../lib/claude-model.js');

const MODEL = process.env.REVIEW_MODEL || SONNET;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const AXE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js';
const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

async function cappedShot(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(900);
  const h = await page.evaluate(() => document.body.scrollHeight).catch(() => 2000);
  const opts = { type: 'jpeg', quality: 55 };
  if (h > 7000) opts.clip = { x: 0, y: 0, width, height: 7000 }; else opts.fullPage = true;
  return page.screenshot(opts);
}

async function checkLinks(hrefs, targetHost) {
  const reqHeaders = { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'en-US,en;q=0.9' };
  const head = (u) => new Promise((res) => {
    let done = false; const fin = (r) => { if (!done) { done = true; res(r); } };
    try {
      const req = https.request(u, { method: 'HEAD', headers: reqHeaders, timeout: 8000 }, (r) => {
        if (r.statusCode === 405 || r.statusCode === 403 || r.statusCode === 501) {
          const g = https.get(u, { headers: reqHeaders, timeout: 8000 }, (gr) => { fin({ status: gr.statusCode }); gr.destroy(); });
          g.on('error', (e) => fin({ error: e.code || 'ERR' }));
          g.on('timeout', () => { g.destroy(); fin({ error: 'TIMEOUT' }); });
        } else fin({ status: r.statusCode });
        r.resume();
      });
      req.on('error', (e) => fin({ error: e.code || 'ERR' }));
      req.on('timeout', () => { req.destroy(); fin({ error: 'TIMEOUT' }); });
      req.end();
    } catch (e) { fin({ error: 'BADURL' }); }
  });
  const out = []; let i = 0;
  const worker = async () => { while (i < hrefs.length) { const u = hrefs[i++]; const r = await head(u); out.push({ url: u, ...r, external: !u.includes(targetHost) }); } };
  await Promise.all(Array.from({ length: 6 }, worker));
  return out;
}

// External 403/timeouts are bot-blocking, NOT broken → "unverified". External is
// "broken" only on a definitive 404/410/DNS failure. Internal links are strict.
function linkStatus(l) {
  if (l.status && l.status >= 200 && l.status < 400) return 'ok';
  if (l.external) return (l.status === 404 || l.status === 410 || l.error === 'ENOTFOUND') ? 'broken' : 'unverified';
  return (l.status >= 400 || l.error) ? 'broken' : 'ok';
}

async function gather(url, browser) {
  const ownBrowser = !browser;
  if (ownBrowser) browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, userAgent: UA });
  const page = await ctx.newPage();
  const consoleErrors = [], pageErrors = [], failed = [], badResponses = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 300)));
  page.on('requestfailed', (r) => failed.push((r.url() || '').slice(0, 200) + ' — ' + (r.failure()?.errorText || 'failed')));
  page.on('response', (r) => { const s = r.status(); if (s >= 400) badResponses.push(s + ' ' + r.url().slice(0, 200)); });

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);

    const meta = await page.evaluate(() => {
      const g = (sel, attr) => { const el = document.querySelector(sel); return el ? (el.getAttribute(attr) || el.textContent || '').trim() : ''; };
      const imgs = [...document.querySelectorAll('img')];
      return { title: document.title || '', description: g('meta[name="description"]', 'content'),
        lang: document.documentElement.getAttribute('lang') || '', h1Count: document.querySelectorAll('h1').length,
        imgCount: imgs.length, imgsNoAlt: imgs.filter((i) => !i.getAttribute('alt')).length,
        bodyChars: (document.body.innerText || '').trim().length };
    }).catch(() => ({}));

    const hrefs = [...new Set(await page.$$eval('a[href]', (els) => els.map((a) => a.href)).catch(() => []))]
      .filter((h) => /^https?:\/\//.test(h)).slice(0, 80);

    let axe = { violations: [], error: null };
    try {
      await page.addScriptTag({ url: AXE_CDN });
      const res = await page.evaluate(async () => await window.axe.run(document, { resultTypes: ['violations'] }));
      axe.violations = (res.violations || []).map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, sample: (v.nodes[0]?.target || []).join(' ') }));
    } catch (e) { axe.error = String(e.message || e).slice(0, 120); }

    const shotDesktop = await cappedShot(page, 1366);
    const shotMobile = await cappedShot(page, 390);
    const links = await checkLinks(hrefs, new URL(url).host);
    return { meta, consoleErrors, pageErrors, failed, badResponses, axe, links, shotDesktop, shotMobile };
  } finally {
    await ctx.close().catch(() => {});
    if (ownBrowser) await browser.close().catch(() => {});
  }
}

function deterministicFindings(g) {
  const f = [];
  g.pageErrors.forEach((e) => f.push({ severity: 'high', area: 'functional', title: 'Uncaught JS error', evidence: e, fix: 'Trace and fix the script error; the page may be partly broken.', source: 'auto' }));
  if (g.consoleErrors.length) f.push({ severity: 'medium', area: 'functional', title: `${g.consoleErrors.length} console error(s)`, evidence: g.consoleErrors.slice(0, 5).join(' | '), fix: 'Investigate console errors (failed fetches, undefined vars).', source: 'auto' });
  const badReq = [...g.failed, ...g.badResponses].filter((x) => !/google-analytics|cloudflareinsights|doubleclick/i.test(x));
  if (badReq.length) f.push({ severity: 'high', area: 'functional', title: `${badReq.length} failed request(s)`, evidence: badReq.slice(0, 6).join(' | '), fix: 'Fix or remove the failing resource/endpoint.', source: 'auto' });
  g.links.filter((l) => linkStatus(l) === 'broken').forEach((l) =>
    f.push({ severity: l.external ? 'medium' : 'high', area: 'functional', title: `Broken link (${l.status || l.error})${l.external ? ' [external]' : ''}`, evidence: l.url, fix: 'Update or remove the link.', source: 'auto' }));
  (g.axe.violations || []).filter((v) => v.impact === 'critical' || v.impact === 'serious').forEach((v) =>
    f.push({ severity: v.impact === 'critical' ? 'high' : 'medium', area: 'accessibility', title: `a11y: ${v.help}`, evidence: `${v.id} — ${v.nodes} node(s), e.g. ${v.sample}`, fix: 'Resolve the accessibility violation.', source: 'auto' }));
  if (g.meta.title === '') f.push({ severity: 'medium', area: 'seo', title: 'Missing <title>', evidence: '', fix: 'Add a descriptive page title.', source: 'auto' });
  if (g.meta.description === '') f.push({ severity: 'low', area: 'seo', title: 'Missing meta description', evidence: '', fix: 'Add a meta description.', source: 'auto' });
  if (!g.meta.lang) f.push({ severity: 'low', area: 'accessibility', title: 'Missing <html lang>', evidence: '', fix: 'Add lang="en" to <html>.', source: 'auto' });
  if (g.meta.h1Count === 0) f.push({ severity: 'low', area: 'seo', title: 'No <h1> on page', evidence: '', fix: 'Add a single top-level heading.', source: 'auto' });
  if (g.meta.imgsNoAlt > 0) f.push({ severity: 'low', area: 'accessibility', title: `${g.meta.imgsNoAlt}/${g.meta.imgCount} images missing alt`, evidence: '', fix: 'Add alt text (empty alt="" for decorative).', source: 'auto' });
  if ((g.meta.bodyChars || 0) < 200) f.push({ severity: 'high', area: 'functional', title: 'Page appears nearly empty', evidence: `only ${g.meta.bodyChars} chars of text rendered`, fix: 'Content/data may have failed to load — check the data fetch.', source: 'auto' });
  return f;
}

function dedupSig(f) {
  const t = (f.title || '').toLowerCase();
  if (/contrast/.test(t)) return 'contrast';
  if (/meta description/.test(t)) return 'meta-desc';
  if (/missing alt|alt text|images? missing|missing.*alt/.test(t)) return 'alt';
  if (/form.*label|label.*form|unlabel|inputs?.*label|no labels|without.*label/.test(t)) return 'form-label';
  if (/html lang|lang attribute|<html lang|missing.*\blang\b/.test(t)) return 'lang';
  if (/console error/.test(t)) return 'console';
  if (/is not defined|uncaught|\bjs error\b|javascript.*error|runtime error/.test(t)) return 'js-error';
  if (/missing.*title|no.*<title>/.test(t)) return 'title';
  if (/broken link|\b404\b|\b410\b|dead link/i.test(t)) {
    const u = ((f.title + ' ' + (f.evidence || '')).match(/https?:\/\/[^\s)"']+/) || [])[0];
    if (u) return 'link:' + u.replace(/[).,]+$/, '');
  }
  return null;
}

function merge(det, aiF) {
  const all = [...det, ...aiF.map((x) => ({ ...x, source: 'ai' }))];
  const bySig = new Map(); const keep = [];
  for (const f of all) {
    const s = dedupSig(f);
    if (!s) { keep.push(f); continue; }
    const cur = bySig.get(s);
    if (!cur) { bySig.set(s, f); continue; }
    const fr = SEV_ORDER[f.severity] ?? 9, cr = SEV_ORDER[cur.severity] ?? 9;
    bySig.set(s, fr < cr ? f : (fr === cr && f.source === 'auto') ? f : cur);
  }
  keep.push(...bySig.values());
  return keep.sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
}

const REVIEW_SYSTEM = `You are a meticulous web-QA reviewer for livabletelluride.org, a civic news/government-hub site for the Telluride, Colorado region. You are reviewing ONE page.

You are given: the page URL, automated signals (console errors, failed requests, accessibility violations, broken links, basic SEO/meta), and a DESKTOP and a MOBILE screenshot.

Find REAL, actionable issues a maintainer should fix. Focus on what only judgment/vision can catch:
- visual/layout bugs (overflow, overlap, broken/empty sections, mis-sized or broken images, things cut off), especially on mobile
- content problems (placeholder text, obviously stale dates, broken-looking widgets, empty lists/cards, lorem ipsum, duplicated blocks)
- consistency (nav/footer/styling that looks off)
- anything that looks broken or unprofessional to a visitor

RULES:
- Be precise and conservative. Do NOT invent issues or speculate. If the page looks fine, return few or no findings.
- The automated signals are FACTS the deterministic layer already reports — only raise one yourself if you ADD something (e.g. the visual impact). Do NOT flag external links as broken from the screenshot; you don't have their status.
- Each finding: severity (critical|high|medium|low), area (functional|visual|content|accessibility|seo|consistency|performance), short title, evidence (what you SAW, citing desktop/mobile), a concrete fix, confidence 0-1.

Output ONLY JSON: {"summary":"one-line overall read","findings":[{"severity","area","title","evidence","fix","confidence"}]}`;

const VERIFY_SYSTEM = `You are an adversarial QA verifier. You are given a page's DESKTOP and MOBILE screenshots and a numbered list of candidate issues an automated reviewer flagged. For EACH, decide whether it is a REAL, defensible issue actually supported by the screenshots, or a false positive / over-reach / vague claim. Be skeptical: if the evidence doesn't clearly support it, mark it not real.
Output ONLY JSON: {"verdicts":[{"index":0,"real":true,"reason":"short"}]}`;

function callClaude(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = https.request({ hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(payload) }, timeout: 120000 },
      (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => { try { const j = JSON.parse(d); if (j.error) return reject(new Error(`${j.error.type}: ${j.error.message}`)); let t = j.content?.[0]?.text || ''; const m = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (m) t = m[1]; resolve(JSON.parse(t.trim())); } catch (e) { reject(e); } }); });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('Anthropic timeout')); });
    req.write(payload); req.end();
  });
}

const imgPart = (buf) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') } });

async function aiFindings(g, url) {
  const signals = { url, title: g.meta.title, description: g.meta.description, h1Count: g.meta.h1Count,
    consoleErrors: g.consoleErrors.slice(0, 8), pageErrors: g.pageErrors, failedRequests: [...g.failed, ...g.badResponses].slice(0, 8),
    axeViolations: g.axe.violations.slice(0, 8), brokenLinks: g.links.filter((l) => linkStatus(l) === 'broken').map((l) => `${l.url} (${l.status || l.error})`).slice(0, 8) };
  const content = [
    { type: 'text', text: `PAGE: ${url}\n\nAUTOMATED SIGNALS:\n${JSON.stringify(signals, null, 2)}\n\nDESKTOP screenshot:` },
    imgPart(g.shotDesktop), { type: 'text', text: 'MOBILE screenshot:' }, imgPart(g.shotMobile),
    { type: 'text', text: 'Review the page. Return ONLY the JSON.' }];
  try { return await callClaude({ model: MODEL, max_tokens: 2000, system: REVIEW_SYSTEM, messages: [{ role: 'user', content }] }); }
  catch (e) {
    try { return await callClaude({ model: MODEL, max_tokens: 2000, system: REVIEW_SYSTEM, messages: [{ role: 'user', content: [{ type: 'text', text: `PAGE: ${url}\n(screenshots unavailable)\nSIGNALS:\n${JSON.stringify(signals, null, 2)}\nReturn ONLY JSON.` }] }] }); }
    catch (e2) { return { summary: 'AI review failed: ' + (e2.message || e2), findings: [] }; }
  }
}

// Adversarial verify: drop AI findings the screenshots don't support.
async function verifyFindings(g, findings) {
  if (!findings.length) return findings;
  const list = findings.map((f, i) => `${i}. [${f.severity}/${f.area}] ${f.title} — ${f.evidence || ''}`).join('\n');
  const content = [{ type: 'text', text: 'CANDIDATE ISSUES:\n' + list + '\n\nDESKTOP:' }, imgPart(g.shotDesktop), { type: 'text', text: 'MOBILE:' }, imgPart(g.shotMobile), { type: 'text', text: 'Verdict for each index. Return ONLY JSON.' }];
  try {
    const r = await callClaude({ model: MODEL, max_tokens: 1200, system: VERIFY_SYSTEM, messages: [{ role: 'user', content }] });
    const real = new Set((r.verdicts || []).filter((v) => v.real).map((v) => v.index));
    const kept = findings.filter((_, i) => real.has(i));
    return kept.length || !(r.verdicts || []).length ? kept : findings; // if verifier returned nothing usable, keep originals
  } catch (e) { return findings; } // verify is best-effort
}

// PUBLIC: review one page. opts: { noAi, verify, browser } → result object.
async function reviewPage(url, opts = {}) {
  const g = await gather(url, opts.browser);
  const det = deterministicFindings(g);
  let ai = { summary: '', findings: [] };
  if (!opts.noAi) {
    ai = await aiFindings(g, url);
    if (opts.verify && ai.findings && ai.findings.length) ai.findings = await verifyFindings(g, ai.findings);
  }
  const findings = merge(det, ai.findings || []);
  const unverified = g.links.filter((l) => linkStatus(l) === 'unverified').map((l) => `${l.url} (${l.status || l.error})`);
  return { url, summary: ai.summary || '', findings, unverifiedExternalLinks: unverified, meta: g.meta, shots: { desktop: g.shotDesktop, mobile: g.shotMobile } };
}

module.exports = { reviewPage, SEV_ORDER, dedupSig };

// ── CLI ──
if (require.main === module) {
  const args = process.argv.slice(2);
  const url = args.find((a) => /^https?:\/\//.test(a));
  const noAi = args.includes('--no-ai');
  const verify = args.includes('--verify');
  if (!url) { console.error('Usage: node scripts/review/review-page.js <url> [--no-ai] [--verify]'); process.exit(1); }
  if (!noAi && !process.env.ANTHROPIC_API_KEY) { console.error('  ✗ ANTHROPIC_API_KEY not set (use --no-ai for signals only)'); process.exit(1); }
  (async () => {
    console.log(`\n  Reviewing ${url}\n  ${'─'.repeat(70)}`);
    if (!noAi) process.stdout.write('  Running review' + (verify ? ' + verify' : '') + '… ');
    const r = await reviewPage(url, { noAi, verify });
    if (!noAi) console.log('done.');
    try { fs.writeFileSync('/tmp/review-desktop.jpg', r.shots.desktop); fs.writeFileSync('/tmp/review-mobile.jpg', r.shots.mobile); } catch {}
    console.log('');
    if (r.summary) console.log(`  Overall: ${r.summary}\n`);
    if (!r.findings.length) console.log('  ✓ No issues found.');
    for (const f of r.findings) {
      const tag = { critical: '🟥', high: '🟧', medium: '🟨', low: '⬜' }[f.severity] || '·';
      console.log(`  ${tag} [${f.severity.toUpperCase()}] (${f.area}${f.source === 'ai' ? '' : ', auto'}) ${f.title}`);
      if (f.evidence) console.log(`        ${f.evidence}`);
      if (f.fix) console.log(`        → ${f.fix}`);
    }
    const counts = r.findings.reduce((m, f) => ((m[f.severity] = (m[f.severity] || 0) + 1), m), {});
    console.log(`\n  ${'─'.repeat(70)}`);
    console.log(`  ${r.findings.length} finding(s): ` + ['critical', 'high', 'medium', 'low'].map((s) => `${counts[s] || 0} ${s}`).join(' · '));
    if (r.unverifiedExternalLinks.length) console.log(`  ${r.unverifiedExternalLinks.length} external link(s) unverified (likely bot-blocking; not counted).`);
    const out = path.join(__dirname, 'last-review.json');
    const { shots, ...clean } = r;
    fs.writeFileSync(out, JSON.stringify({ ...clean, reviewedAt: new Date().toISOString(), model: noAi ? null : MODEL }, null, 2));
    console.log(`  Screenshots: /tmp/review-desktop.jpg, /tmp/review-mobile.jpg\n  Report: ${path.relative(path.resolve(__dirname, '..', '..'), out)}\n`);
  })().catch((e) => { console.error(e); process.exit(1); });
}
