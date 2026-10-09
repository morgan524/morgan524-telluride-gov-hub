#!/usr/bin/env node
/**
 * archive-customerio-newsletters.js — publish every SENT Customer.io newsletter
 * to digest/one-off/ so it shows up in the blog list on deep-dives.html.
 *
 * WHY (2026-10-09): editorial newsletters are composed and sent in the
 * Customer.io UI, not through the digest Worker's /send path, so they never
 * reach data/sent-broadcasts.json. syncOneOffBlog() in content-refresh.js only
 * sees what is in digest/one-off/, so each send had to be archived by hand, and
 * four (Jul 9, Aug 16, Aug 24, Sep 10) plus the Oct 8 send never were. This
 * closes the gap: Content Refresh runs it right before content-refresh.js.
 *
 * For each newsletter with a sent_at that is not yet archived:
 *   - body from GET /v1/newsletters/{id}/contents (verified 2026-10-09 to match
 *     the archived sent message; it is the broadcast /contents that goes stale);
 *   - <title> set to the subject, so syncOneOffBlog() titles the card;
 *   - Customer.io-hosted images copied to assets/newsletters/<slug>/;
 *   - Liquid tags removed (unsubscribe links point at profile.html instead);
 *   - written to digest/one-off/<slug>-<YYYY-MM-DD>.html (send date, Mountain).
 *
 * data/customerio-newsletters.json records each newsletter id that is handled,
 * so a later edit to a subject or a hand-tweaked archive is never overwritten.
 * A send already on the blog (matched by title) or already archived by hand
 * (one-off file with the same send date) is recorded and skipped.
 *
 * Usage:  CUSTOMERIO_APP_API_KEY=... node scripts/archive-customerio-newsletters.js [--dry]
 * No key → logs and exits 0, so a missing secret never fails Content Refresh.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry');
const ROOT = path.resolve(__dirname, '..');
const ONE_OFF_DIR = path.join(ROOT, 'digest', 'one-off');
const ASSET_ROOT = path.join(ROOT, 'assets', 'newsletters');
const MANIFEST = path.join(ROOT, 'data', 'customerio-newsletters.json');
const BLOG_JSON = path.join(ROOT, 'data', 'blog-posts.json');
const API = 'https://api.customer.io/v1';
const SITE = 'https://livabletelluride.org';

const KEY = process.env.CUSTOMERIO_APP_API_KEY;

async function api(p) {
  const r = await fetch(API + p, { headers: { Authorization: 'Bearer ' + KEY }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Customer.io ${p} → HTTP ${r.status}`);
  return r.json();
}

async function listNewsletters() {
  const all = [];
  let start = '';
  for (let page = 0; page < 20; page++) {
    const d = await api('/newsletters?limit=50' + (start ? '&start=' + encodeURIComponent(start) : ''));
    const got = d.newsletters || [];
    all.push(...got);
    // Customer.io returns a `next` cursor even on the last page.
    if (!got.length || got.length < 50 || !d.next || d.next === start) break;
    start = d.next;
  }
  return all;
}

const readJson = (p, dflt) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return dflt; } };
// Accent- and apostrophe-insensitive: the CIO subject "Deja VooDoo" must match
// the blog's "Déjà VooDoo".
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function slugify(s) {
  return norm(s).split(' ').slice(0, 8).join('-') || 'newsletter';
}

// Send date in Mountain time — the date readers saw on the email.
function mtDate(sec) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(sec * 1000));
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Put the subject in <title>, adding a <head> (or a whole skeleton) if the
// Customer.io body is a bare fragment.
function setTitle(html, subject) {
  const t = `<title>${escHtml(subject)} — Livable Telluride</title>`;
  if (/<title>[\s\S]*?<\/title>/i.test(html)) return html.replace(/<title>[\s\S]*?<\/title>/i, t);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => m + t);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => m + '<head><meta charset="utf-8">' + t + '</head>');
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' + t + '</head><body>' + html + '</body></html>';
}

function stripLiquid(html) {
  return html
    .replace(/href\s*=\s*"\{%\s*unsubscribe(?:_url)?\s*%\}"/gi, `href="${SITE}/profile.html"`)
    .replace(/\{%[\s\S]*?%\}/g, '')
    .replace(/\{\{[\s\S]*?\}\}/g, '');
}

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/svg+xml': '.svg' };

// Copy Customer.io-hosted images to the site so the archive outlives the CDN.
async function localiseImages(html, slug) {
  const re = /https:\/\/[a-z0-9.-]*customeriomail\.com\/[^"'\s)]+/gi;
  const urls = [...new Set(html.match(re) || [])];
  let n = 0;
  for (const url of urls) {
    n++;
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) { console.warn(`    image ${url} → HTTP ${r.status}; left as-is`); continue; }
    const buf = Buffer.from(await r.arrayBuffer());   // always drain, or the socket keeps node alive
    const type = (r.headers.get('content-type') || '').split(';')[0].trim();
    const name = `image-${n}${EXT[type] || path.extname(new URL(url).pathname) || '.png'}`;
    const dir = path.join(ASSET_ROOT, slug);
    if (!DRY) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, name), buf);
    }
    html = html.split(url).join(`${SITE}/assets/newsletters/${slug}/${name}`);
  }
  return html;
}

async function main() {
  if (!KEY) { console.log('archive-customerio-newsletters: CUSTOMERIO_APP_API_KEY not set — skipping'); return; }

  const manifest = readJson(MANIFEST, {});
  const blogTitles = new Set(readJson(BLOG_JSON, []).map((p) => norm(p && p.title)));
  const oneOffs = fs.existsSync(ONE_OFF_DIR) ? fs.readdirSync(ONE_OFF_DIR).filter((f) => f.endsWith('.html')) : [];
  const oneOffDates = new Set(oneOffs.map((f) => (f.match(/(\d{4}-\d{2}-\d{2})\.html$/) || [])[1]).filter(Boolean));

  const sent = (await listNewsletters()).filter((n) => n.sent_at).sort((a, b) => a.sent_at - b.sent_at);
  let added = 0;
  for (const n of sent) {
    if (manifest[n.id]) continue;
    const contents = ((await api(`/newsletters/${n.id}/contents`)).contents || [])
      .filter((c) => c.type === 'email' && c.body).sort((a, b) => a.id - b.id);
    if (!contents.length) { console.log(`  #${n.id} "${n.name}": no email body — skipping`); continue; }
    const c = contents[0];
    const subject = String(c.subject || n.name || '').trim();
    const date = mtDate(n.sent_at);

    // ±1 day: hand-archived one-offs were sometimes dated the day before the send.
    const near = [-1, 0, 1].map((d) => mtDate(n.sent_at + d * 86400));
    if (blogTitles.has(norm(subject)) || near.some((d) => oneOffDates.has(d))) {
      console.log(`  #${n.id} "${subject}" (${date}): already on the blog — recording only`);
      manifest[n.id] = { subject, date, file: null, note: 'already listed before automation' };
      continue;
    }

    const slug = slugify(subject);
    const file = `${slug}-${date}.html`;
    let html = setTitle(stripLiquid(c.body), subject);
    html = await localiseImages(html, `${slug}-${date}`);
    if (!DRY) fs.writeFileSync(path.join(ONE_OFF_DIR, file), html);
    manifest[n.id] = { subject, date, file: `digest/one-off/${file}` };
    added++;
    console.log(`  #${n.id} "${subject}" (${date}) → digest/one-off/${file}`);
  }

  if (!DRY) fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`archive-customerio-newsletters: ${added} newsletter(s) archived${DRY ? ' (dry run)' : ''}`);
}

main().catch((err) => {
  // A Customer.io outage must not block the rest of Content Refresh; the next
  // run picks up anything missed.
  console.warn('archive-customerio-newsletters: ' + err.message);
});
