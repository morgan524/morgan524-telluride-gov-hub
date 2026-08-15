// Durable editorial corrections, applied on every content refresh.
//
// WHY A SEPARATE FILE (2026-08-09): almost every array the content review flags
// is REWRITTEN from scratch every six hours by content-refresh.js. Editing a bad
// date directly in js/gov-helpers.js therefore fixes nothing — the next scrape
// puts it back, and the finding reappears forever. A correction has to be an
// OVERRIDE that re-applies after each scrape, the same shape as the source-trust
// and festival-anchor reconciles.
//
// Everything here is deliberately boring and inspectable: a correction is a
// small JSON row a human can read, argue with, and delete. The auto-fixer
// (scripts/content-autofix.js) writes rows; this module applies them.
//
// EVERY CORRECTION EXPIRES. A permanent override is a landmine — it silently
// distorts data long after the source fixed its own mistake, and nobody
// remembers it exists. Expired rows are pruned automatically.

'use strict';

const fs = require('fs');
const path = require('path');

const FILE = 'content-corrections.json';

// Correction kinds:
//   event-date  — the source published the wrong date; set it to correctDate
//   clear-link  — the link 404s; keep the event, drop the dead href
//   set-link    — the link 404s but a working one is known; point it at newLink
//   drop-event  — the entry is phantom/cancelled; remove it entirely
const KINDS = new Set(['event-date', 'clear-link', 'set-link', 'drop-event']);

// The semantic identity of a correction — what it does, to which record, on the
// strength of which evidence. NOT the id: auto-written ids embed the date they
// were minted, so id-equality says "written in the same run", never "already
// handled". Deduping on the id let the autofixer append a byte-identical
// clear-link row every single day (four for one dead Shabbat href before this
// was caught), each carrying a fresh 60-day expiry so the pile never drained.
function correctionKey(c) {
  return [c.kind, c.array, norm(c.titleMatch), c.wrongDate || '', c.evidence || ''].join('|');
}

function correctionsPath(repoRoot) {
  return path.join(repoRoot, 'data', FILE);
}

function readCorrections(repoRoot) {
  try {
    const doc = JSON.parse(fs.readFileSync(correctionsPath(repoRoot), 'utf8'));
    return { doc, corrections: Array.isArray(doc.corrections) ? doc.corrections : [] };
  } catch (e) {
    return { doc: { _comment: '', corrections: [] }, corrections: [] };
  }
}

function writeCorrections(repoRoot, doc) {
  const p = correctionsPath(repoRoot);
  const json = JSON.stringify(doc, null, 2) + '\n';
  let cur = null;
  try { cur = fs.readFileSync(p, 'utf8'); } catch (_) { /* first write */ }
  if (cur !== json) fs.writeFileSync(p, json);
  return p;
}

// "&" becomes "and" BEFORE punctuation is stripped. A correction's titleMatch
// is taken from whichever source the review happened to list first, but it has
// to match the record in a DIFFERENT array — and sources punctuate differently
// ("Tea & Tarot" vs "Tea and Tarot"). Without this the correction silently
// no-ops, which is the worst outcome: the finding looks handled and isn't.
// Still not fuzzy — "Tea and Tarot Workshop" remains a different event.
const norm = (s) => String(s || '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// Records store their date under different keys depending on the source.
function recordDate(rec) {
  const raw = rec && (rec.date || rec.pubDate || rec.startDate);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(raw || ''));
  return m ? m[1] : null;
}

// A correction targets a record by array + normalized title + the date the
// SOURCE currently publishes. Matching on the wrong date (not the right one) is
// what makes this idempotent: once the source fixes itself, the row stops
// matching and simply expires.
function matches(correction, rec) {
  if (norm(correction.titleMatch) !== norm(rec && rec.title)) return false;
  if (!correction.wrongDate) return true;
  return recordDate(rec) === correction.wrongDate;
}

function isExpired(correction, todayISO) {
  return !!correction.expiresOn && String(correction.expiresOn) < todayISO;
}

// Apply the active corrections to { NAME: [records] }.
// Returns { arrays, applied: [{ id, kind, array, before, after }] }.
// Never throws on a malformed row — it's skipped and reported.
function applyCorrections(arraysByName, corrections, todayISO) {
  const applied = [];
  const skipped = [];
  const arrays = {};

  for (const [name, arr] of Object.entries(arraysByName || {})) arrays[name] = (arr || []).slice();

  for (const c of corrections || []) {
    if (!c || !KINDS.has(c.kind) || !c.array || !c.titleMatch) { skipped.push({ c, why: 'malformed' }); continue; }
    if (isExpired(c, todayISO)) continue;                       // pruned separately
    const arr = arrays[c.array];
    if (!arr) { skipped.push({ c, why: `array ${c.array} not loaded` }); continue; }

    if (c.kind === 'drop-event') {
      const kept = arr.filter(r => !matches(c, r));
      if (kept.length !== arr.length) {
        applied.push({ id: c.id, kind: c.kind, array: c.array, before: arr.length, after: kept.length });
        arrays[c.array] = kept;
      }
      continue;
    }

    let hits = 0;
    arrays[c.array] = arr.map(r => {
      if (!matches(c, r)) return r;
      hits++;
      if (c.kind === 'event-date') {
        const out = { ...r };
        // Write back to whichever key this record actually uses, so the fix
        // survives however the source shaped it.
        if (out.date !== undefined && out.date !== null && out.date !== '') out.date = c.correctDate;
        else if (out.pubDate !== undefined) out.pubDate = c.correctDate;
        else out.date = c.correctDate;
        return out;
      }
      // set-link: the dead href has a known-good replacement.
      if (c.kind === 'set-link') return { ...r, link: c.newLink || '' };
      // clear-link: keep the event, drop the dead href.
      return { ...r, link: '' };
    });
    if (hits) applied.push({ id: c.id, kind: c.kind, array: c.array, hits });
  }

  return { arrays, applied, skipped };
}

// Drop rows whose expiresOn has passed. Returns { kept, removed }.
function pruneExpired(corrections, todayISO) {
  const kept = [], removed = [];
  for (const c of corrections || []) (isExpired(c, todayISO) ? removed : kept).push(c);
  return { kept, removed };
}

// A correction with no expiry is a landmine; default to 30 days past the date it
// concerns, or 60 days out when it concerns no particular date.
function defaultExpiry(correction, todayISO) {
  const anchor = correction.correctDate || correction.wrongDate || todayISO;
  const base = Date.parse(anchor + 'T00:00:00Z');
  const days = (correction.correctDate || correction.wrongDate) ? 30 : 60;
  if (!Number.isFinite(base)) return null;
  return new Date(base + days * 86400000).toISOString().slice(0, 10);
}

module.exports = {
  FILE, KINDS, correctionsPath, readCorrections, writeCorrections,
  applyCorrections, pruneExpired, defaultExpiry, isExpired, matches, recordDate, norm,
  correctionKey,
};
