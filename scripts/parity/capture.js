#!/usr/bin/env node
// Parity harness (overhaul Phase 1). Captures normalized snapshots of the digest
// and the data-layer outputs so a refactor can be PROVEN behavior-preserving:
// run it before a change, run it after, then `diff -ru` the two directories —
// the diff isolates exactly what the change did. This is the safety mechanism
// the strangler roadmap depends on (Phase 2 data migration, the deferred
// getMeetingSummary/AI_SUMMARIES fix, any renderer refactor).
//
//   node scripts/parity/capture.js <out-dir> [weekStart] [label]
//
// Determinism: the digest render is deterministic given the data files + the
// weekStart arg. A couple of data-layer getters filter by "today", so run the
// BEFORE and AFTER captures close in time (minutes, not days) or a legitimate
// date rollover will show as noise. Reads only local files; no network, no
// secrets (MAILCHIMP_API_KEY is cleared so the "What We're Reading" auto-source
// falls back deterministically).

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { loadDataArrays } = require('../lib/load-data.js');

const REPO = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(process.argv[2] || path.join(REPO, 'parity-snapshot'));
const WEEK = process.argv[3] || '2026-07-06';
const LABEL = process.argv[4] || 'July 6 - July 12, 2026';
fs.mkdirSync(OUT, { recursive: true });

const write = (name, data) =>
  fs.writeFileSync(path.join(OUT, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n');

// ── 1. End-to-end: the rendered digests (deterministic given data + week) ────
function renderDigest(envExtra, outFile) {
  try {
    cp.execFileSync('node', [
      path.join(REPO, 'scripts', 'weekly-email.js'),
      path.join(REPO, 'js', 'gov-data.js'), path.join(REPO, 'js', 'gov-helpers.js'),
      WEEK, LABEL, path.join(OUT, outFile),
    ], { stdio: ['ignore', 'ignore', 'ignore'], env: { ...process.env, MAILCHIMP_API_KEY: '', ...envExtra } });
  } catch (e) {
    write(outFile.replace(/\.html$/, '.error.txt'), String((e && e.message) || e));
  }
}
renderDigest({}, 'digest-weekly.html');
renderDigest({ WEEKEND: '1' }, 'digest-weekend.html');

// ── 2. Data layer: normalized meeting + summary + image outputs ──────────────
const { captured, arrays } = loadDataArrays(REPO);
const p2 = (n) => String(n).padStart(2, '0');
const dkey = (d) => (d instanceof Date && !isNaN(d)) ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` : null;
const sortMeet = (a, b) => (a.date || '').localeCompare(b.date || '') || (a.title || '').localeCompare(b.title || '');
const normMeeting = (m) => ({
  title: m.title, date: dkey(m.eventDate), category: m.category || null, source: m.source || null,
  hasAgenda: !!m.hasAgenda, agendaLink: m.agendaLink || null, descLen: (m.description || '').length,
});

for (const fn of ['getCountyCachedMeetings', 'getTellurideMeetings']) {
  const f = captured[fn];
  if (typeof f !== 'function') { write(fn + '.json', { skipped: 'not captured' }); continue; }
  try { write(fn + '.json', f().map(normMeeting).sort(sortMeet)); }
  catch (e) { write(fn + '.json', { error: String((e && e.message) || e) }); }
}

// getMeetingSummary over the county meetings — length + head, so a summary change
// is visible without dumping full text.
try {
  const gms = captured.getMeetingSummary, county = captured.getCountyCachedMeetings;
  if (typeof gms === 'function' && typeof county === 'function') {
    write('getMeetingSummary.json', county().map((m) => {
      let s = '';
      try { s = gms(m) || ''; } catch (e) { s = 'THREW: ' + ((e && e.message) || e); }
      return { title: m.title, date: dkey(m.eventDate), summaryLen: s.length, head: s.slice(0, 80) };
    }).sort(sortMeet));
  }
} catch (e) { write('getMeetingSummary.json', { error: String((e && e.message) || e) }); }

// resolveEventImage over the Music on the Green series (a stable curated source).
try {
  const rei = captured.resolveEventImage, mog = arrays.MUSIC_ON_THE_GREEN || [];
  if (typeof rei === 'function') {
    write('resolveEventImage.json', mog.map((e) =>
      ({ title: e.title, ...rei(e, { origin: 'https://livabletelluride.org', exists: () => true }) })));
  } else {
    write('resolveEventImage.json', { skipped: 'not captured' });
  }
} catch (e) { write('resolveEventImage.json', { error: String((e && e.message) || e) }); }

console.log('parity snapshot →', OUT);
