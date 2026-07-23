#!/usr/bin/env node
/**
 * migrate-mailchimp-archive.js — bring Mailchimp-hosted campaign archives home.
 *
 * WHY (2026-07-23): four BLOG_POSTS entries linked to mailchi.mp archive pages.
 * Cancelling Mailchimp would 404 every one of them AND kill the images, which
 * are served from mcusercontent.com. This pulls each campaign down, localises
 * every image under assets/newsletters/<slug>/, strips Mailchimp chrome
 * (scripts, tracking pixels, unsubscribe / list-manage links, the "view in
 * browser" bar, the referral badge), and writes a standalone archive page to
 * digest/archive/<date>-<slug>.html.
 *
 * Then point BLOG_POSTS at the local URL and re-run scripts/mirror-json.js and
 * scripts/build-search-index.js.
 *
 * Usage:  node scripts/migrate-mailchimp-archive.js [--dry]
 * Re-runnable: re-downloads and overwrites, so it's safe to run again.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DRY = process.argv.includes('--dry');
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'digest', 'archive');
const ASSET_ROOT = path.join(ROOT, 'assets', 'newsletters');

// slug/date/title mirror the BLOG_POSTS entries these replace.
const CAMPAIGNS = [
  { slug: 'when-the-town-judges-its-own-projects', date: '2026-06-30',
    title: 'When the Town Judges Its Own Projects',
    url: 'https://mailchi.mp/42e61aa77a19/when-the-town-judges-its-own-projects' },
  { slug: 'butcher-creek-decision', date: '2026-06-17',
    title: 'The Colorado Supreme Court’s “Butcher Creek” Decision',
    url: 'https://mailchi.mp/99279f8aa0a7/participate-in-the-bocc-meeting-on-december-20251559' },
  { slug: 'livable-telluride-kickoff-event', date: '2026-06-09',
    title: 'Come to the Livable Telluride Kickoff Event',
    url: 'https://mailchi.mp/862595911df1/come-to-the-livable-telluride-kickoff-event' },
  { slug: 'welcome-to-the-new-livable-telluride', date: '2026-06-02',
    title: 'Welcome to the New Livable Telluride',
    url: 'https://mailchi.mp/4f766c920f0e/participate-in-the-bocc-meeting-on-december-20251398' },
];

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Pull the email out of the Mailchimp archive shell and drop everything that
// only makes sense while Mailchimp is hosting it.
async function extract(page) {
  return page.evaluate(() => {
    const kill = sel => document.querySelectorAll(sel).forEach(n => n.remove());
    kill('script, noscript, iframe, link[rel="stylesheet"][href*="mailchimp"]');

    // 1x1 open-tracking pixels and any beacon-ish image
    document.querySelectorAll('img').forEach(img => {
      const w = +(img.getAttribute('width') || 0), h = +(img.getAttribute('height') || 0);
      const src = img.getAttribute('src') || '';
      if ((w && w <= 1) || (h && h <= 1) || /open\.php|\/track\/|beacon/i.test(src)) img.remove();
    });

    // Mailchimp archive chrome: the "view this email in your browser" bar and
    // the referral badge / footer widgets.
    document.querySelectorAll('#awesomebar, .awesomebar, #mcPreviewText, .mcnPreviewText').forEach(n => n.remove());
    document.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href') || '';
      const txt = (a.textContent || '').trim();
      const dead = /list-manage\.com|mailchimp\.com|eepurl\.com/i.test(href)
        || /unsubscribe|update (your )?preferences|view this email in your browser|email marketing powered by/i.test(txt);
      if (dead) {
        // Keep the words, drop the dead link (and any badge image inside it).
        if (a.querySelector('img') || !txt) a.remove();
        else a.replaceWith(document.createTextNode(txt));
      }
    });
    // Footer rows that are now just orphaned unsubscribe boilerplate.
    document.querySelectorAll('td, div, p').forEach(n => {
      const t = (n.textContent || '').trim();
      if (t && t.length < 400 && /why did I get this\?|unsubscribe from this list|update subscription preferences/i.test(t)
          && !n.querySelector('table')) n.remove();
    });

    // Mailchimp archive nav ("Subscribe | Past Issues | RSS | Translate") and
    // the campaign-URL / tweet share widget — chrome, not the newsletter.
    document.querySelectorAll('a').forEach(a => {
      if (/^(subscribe|past issues|rss|translate)$/i.test((a.textContent || '').trim())) a.remove();
    });
    document.querySelectorAll('div, td, span, p').forEach(n => {
      const t = (n.textContent || '').trim();
      if (t && t.length < 140 && /campaign url|copy\s*twitter|\d+\s+tweets?/i.test(t)
          && !n.querySelector('table, img')) n.remove();
    });

    const styles = Array.from(document.querySelectorAll('style')).map(s => s.textContent || '').join('\n');
    // Prefer Mailchimp's known body ids; otherwise take the table holding the
    // most text (outermost on a tie) — some older templates have no ids at all,
    // and #awesomewrap can contain only the share widget.
    let body = document.querySelector('#bodyTable') || document.querySelector('#templateBody');
    if (!body) {
      let best = null, bestLen = 0;
      document.querySelectorAll('table').forEach(t => {
        const len = (t.innerText || '').trim().length;
        if (len > bestLen) { best = t; bestLen = len; }
        else if (len === bestLen && best && t.contains(best)) { best = t; }
      });
      body = best || document.body;
    }
    const html = body === document.body ? body.innerHTML : body.outerHTML;
    const imgs = Array.from(document.querySelectorAll('img'))
      .map(i => i.getAttribute('src') || '').filter(Boolean);
    return { html, styles, imgs };
  });
}

function filenameFor(src, i) {
  if (src.startsWith('data:')) {
    const m = /^data:image\/([a-z0-9+]+)/i.exec(src);
    return `inline-${i + 1}.${(m ? m[1] : 'png').replace('jpeg', 'jpg')}`;
  }
  let base = '';
  try { base = path.basename(new URL(src).pathname); } catch { base = ''; }
  base = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!/\.(jpe?g|png|gif|webp|svg)$/i.test(base)) base = (base || `img-${i + 1}`) + '.jpg';
  return base;
}

async function saveImage(src, destDir, name) {
  if (src.startsWith('data:')) {
    const b64 = src.slice(src.indexOf(',') + 1);
    fs.writeFileSync(path.join(destDir, name), Buffer.from(b64, 'base64'));
    return true;
  }
  const r = await fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0 LivableTelluride-archiver' } });
  if (!r.ok) return false;
  fs.writeFileSync(path.join(destDir, name), Buffer.from(await r.arrayBuffer()));
  return true;
}

(async () => {
  const onlyIdx = process.argv.indexOf('--only');
  const only = onlyIdx > -1 ? process.argv[onlyIdx + 1] : '';
  const browser = await chromium.launch();
  const results = [];
  for (const c of CAMPAIGNS.filter(c => !only || c.slug === only)) {
    const page = await browser.newPage();
    await page.goto(c.url, { waitUntil: 'networkidle', timeout: 60000 });
    const { html, styles, imgs } = await extract(page);
    await page.close();

    const destDir = path.join(ASSET_ROOT, c.slug);
    if (!DRY) fs.mkdirSync(destDir, { recursive: true });

    // Localise every image; de-dupe by source URL.
    let body = html, saved = 0, failed = 0;
    const seen = new Map();
    for (let i = 0; i < imgs.length; i++) {
      const src = imgs[i];
      if (seen.has(src)) continue;
      const name = filenameFor(src, i);
      const localUrl = `/assets/newsletters/${c.slug}/${name}`;
      let ok = true;
      if (!DRY) { try { ok = await saveImage(src, destDir, name); } catch { ok = false; } }
      if (ok) { seen.set(src, localUrl); saved++; } else { failed++; }
    }
    for (const [src, localUrl] of seen) body = body.split(src).join(localUrl);

    const outName = `${c.date}-${c.slug}.html`;
    const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.title)} — Livable Telluride</title>
<meta name="description" content="Livable Telluride newsletter archive: ${esc(c.title)} (${c.date}).">
<link rel="icon" href="/logo/icon-192.png?v=2">
<!-- Newsletter archive. Migrated off Mailchimp ${new Date().toISOString().slice(0, 10)}
     from ${c.url} — images localised to /assets/newsletters/${c.slug}/ so this
     page survives the Mailchimp account being closed. -->
<style>
${styles}
body{margin:0;background:#f4efe4;}
.lt-archive-bar{font:600 15.5px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#24483f;color:#fff;padding:12px 20px;text-align:center;}
.lt-archive-bar a{color:#e3c87a;text-decoration:underline;}
.lt-archive-bar .d{display:block;font-weight:400;font-size:13.5px;color:#c9d6cf;margin-top:3px;}
</style>
</head>
<body>
<div class="lt-archive-bar">
  Newsletter archive &mdash; <a href="/">Livable Telluride</a> &middot; <a href="/deep-dives.html">All newsletters</a>
  <span class="d">Originally emailed ${esc(new Date(c.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))}</span>
</div>
${body}
</body>
</html>
`;
    if (!DRY) fs.writeFileSync(path.join(OUT_DIR, outName), doc);
    results.push({ slug: c.slug, out: `digest/archive/${outName}`, bytes: doc.length, images: saved, failed });
    console.log(`${DRY ? '[dry] ' : ''}${outName.padEnd(52)} ${String(doc.length).padStart(8)}B  images:${saved}${failed ? `  FAILED:${failed}` : ''}`);
  }
  await browser.close();

  console.log('\nNew hrefs for BLOG_POSTS:');
  for (const r of results) console.log(`  https://livabletelluride.org/${r.out}`);
})().catch(e => { console.error(e); process.exit(1); });
