#!/usr/bin/env node
/**
 * SMC Housing Code Update / SSR project page watcher
 *
 * Scrapes https://www.sanmiguelcountyco.gov/882/Housing-Code-Update,
 * extracts every link that points to /DocumentCenter/View/<id>/<slug>, and
 * mirrors any newly-seen document into the repo at assets/ssr/.  Maintains a
 * manifest at assets/ssr/manifest.json so we never re-download what we
 * already have, and so subsequent runs surface a clean list of "new" docs.
 *
 * On a content change, this script writes:
 *   - assets/ssr/<id>-<slug>.<ext>    (the document, mirrored offline)
 *   - assets/ssr/manifest.json        (full inventory, sorted)
 *   - assets/ssr/last-check.txt       (ISO timestamp of last successful run)
 *
 * The accompanying GitHub Action (smc-watch.yml) commits any changes.
 *
 * Run locally:   node scripts/smc-housing-code-watch.js
 * Run in CI:     same command from the repo root.
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const https = require('https');

const SMC_URL = 'https://www.sanmiguelcountyco.gov/882/Housing-Code-Update';
const OUT_DIR  = path.resolve(__dirname, '..', 'assets', 'ssr');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const LAST_CHECK = path.join(OUT_DIR, 'last-check.txt');

function fetchUrl(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.get({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'User-Agent': 'TelluridGovHub-SSR-Watch/1.0 (+https://livabletelluride.org)' }
    }, res => {
      if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        return resolve(fetchUrl(next, redirects - 1));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || '' }));
    });
    req.on('error', reject);
    req.setTimeout(30_000, () => { req.destroy(new Error('timeout')); });
  });
}

function safeSlug(s) {
  return String(s)
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

function extFromContentType(ct) {
  if (!ct) return 'pdf';
  if (/pdf/i.test(ct)) return 'pdf';
  if (/(jpe?g)/i.test(ct)) return 'jpg';
  if (/png/i.test(ct)) return 'png';
  if (/word|officedocument\.wordprocessingml/i.test(ct)) return 'docx';
  if (/excel|spreadsheetml/i.test(ct)) return 'xlsx';
  return 'bin';
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Fetching ${SMC_URL}`);
  const { buffer: pageBuf } = await fetchUrl(SMC_URL);
  const html = pageBuf.toString('utf8');

  // Extract /DocumentCenter/View/<id>/<slug?> links + their human-readable
  // text.  CivicPlus pages render anchors like:
  //   <a href="/DocumentCenter/View/14206/April-SSR-No-5-Meeting-Packet">…</a>
  // Match any /DocumentCenter/View/<id>/<slug?> URL anywhere in the HTML --
  // robust to multi-line <a> tags, query-string suffixes (?bidId=...), and IDs
  // that appear without a trailing slug.
  const idRe = /\/DocumentCenter\/View\/(\d+)(?:\/([^"?#\s<>]+))?/g;
  const seen = new Map();
  // First pass: every doc id + slug + a sane source URL.
  for (const m of html.matchAll(idRe)) {
    const [, id, slug] = m;
    if (seen.has(id)) continue;
    const slugPart = slug ? '/' + slug : '';
    seen.set(id, {
      id,
      slug: slug || ('document-' + id),
      text: '',
      sourceUrl: 'https://www.sanmiguelcountyco.gov/DocumentCenter/View/' + id + slugPart
    });
  }
  // Second pass: attach human-readable anchor text where we can find it.
  const anchorRe = /<a\b[^>]*href="[^"]*?\/DocumentCenter\/View\/(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(anchorRe)) {
    const [, id, inner] = m;
    if (!seen.has(id)) continue;
    const text = inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (text && !seen.get(id).text) seen.get(id).text = text;
  }
    console.log(`Found ${seen.size} document links`);

  // Load existing manifest
  let manifest = { documents: [], lastChecked: null };
  if (fs.existsSync(MANIFEST)) {
    try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); }
    catch (e) { console.warn('manifest unparseable, starting fresh'); }
  }
  const knownById = new Map((manifest.documents || []).map(d => [d.id, d]));

  const fresh = [];
  for (const doc of seen.values()) {
    const known = knownById.get(doc.id);
    if (known && known.localPath && fs.existsSync(path.resolve(__dirname, '..', known.localPath))) {
      // already mirrored, no work
      continue;
    }
    console.log(`  → mirroring new doc #${doc.id} (${doc.slug})`);
    try {
      const { buffer, contentType } = await fetchUrl(doc.sourceUrl);
      const ext = extFromContentType(contentType);
      const fname = `${doc.id}-${safeSlug(doc.slug)}.${ext}`;
      const fpath = path.join(OUT_DIR, fname);
      fs.writeFileSync(fpath, buffer);
      const localPath = path.relative(path.resolve(__dirname, '..'), fpath).split(path.sep).join('/');
      fresh.push({
        id: doc.id,
        title: doc.text || doc.slug.replace(/-/g, ' '),
        slug: doc.slug,
        sourceUrl: doc.sourceUrl,
        localPath,
        contentType,
        bytes: buffer.length,
        firstSeen: new Date().toISOString()
      });
    } catch (err) {
      console.warn(`  ✗ failed to mirror #${doc.id}: ${err.message}`);
    }
  }

  // Merge: keep existing + add fresh, sorted by id descending (newest first)
  const merged = [...(manifest.documents || []), ...fresh]
    .reduce((acc, d) => {
      acc[d.id] = { ...(acc[d.id] || {}), ...d };
      return acc;
    }, {});
  const sorted = Object.values(merged).sort((a, b) => Number(b.id) - Number(a.id));
  manifest = { documents: sorted, lastChecked: new Date().toISOString() };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(LAST_CHECK, manifest.lastChecked + '\n');

  console.log(`\nDone. ${fresh.length} new doc(s) mirrored. Total tracked: ${sorted.length}`);
  if (fresh.length > 0) {
    console.log('\nNEW:');
    fresh.forEach(d => console.log(`  • ${d.title}  →  ${d.localPath}`));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
