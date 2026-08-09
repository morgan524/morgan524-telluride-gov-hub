// Source-trust hierarchy for cross-source date-conflict reconciliation.
//
// Generalizes the Mountain Village fix: when two sources list the same event
// (by sorted-token title) within a few days on DIFFERENT dates, the unreliable
// source's copy is dropped — the event still shows from the trusted source on
// its correct date. See memory: mv-calendar-wrong-dates.
//
// CONSERVATIVE BY DESIGN: only sources explicitly ranked LOW get their
// conflicting copies dropped (against any higher-trust source). MID/HIGH
// sources are never auto-dropped, so widening the trusted set can't silently
// remove vetted content. To mark a newly-discovered unreliable source, just add
// it here at LOW — no new code.

const { filterMvConflicts } = require('./sanitize.js'); // pairwise (lowArr, trustedArrs) → {kept,dropped}

const LOW = 1, MID = 2, HIGH = 3;

const TRUST = {
  // Authoritative for their own dates (primary organizers / direct feeds).
  KOTO_COMMUNITY_EVENTS: HIGH,
  SHERIDAN_EVENTS: HIGH,
  TELLURIDE_COM_EVENTS: HIGH,
  TELLURIDE_SCIENCE_EVENTS: HIGH,
  WILKINSON_EVENTS: HIGH,
  COMMUNITY_EVENTS: HIGH,
  // Known-unreliable mirror — publishes events a day off (documented).
  MOUNTAIN_VILLAGE_EVENTS: LOW,
  // Everything else defaults to MID (neither auto-trusted-over nor auto-dropped).
};
const DEFAULT_TRUST = MID;

function trustOf(name) {
  return Object.prototype.hasOwnProperty.call(TRUST, name) ? TRUST[name] : DEFAULT_TRUST;
}

// arraysByName: { NAME: [records] }. Returns { NAME: { kept, dropped } } only
// for LOW-trust sources that had date-conflicting copies removed.
function reconcileByTrust(arraysByName) {
  const names = Object.keys(arraysByName);
  const result = {};
  for (const name of names) {
    if (trustOf(name) !== LOW) continue;                 // only the explicitly-unreliable tier
    const higher = names
      .filter(n => n !== name && trustOf(n) > LOW)
      .map(n => arraysByName[n] || []);
    if (!higher.length) continue;
    const { kept, dropped } = filterMvConflicts(arraysByName[name] || [], higher);
    if (dropped.length) result[name] = { kept, dropped };
  }
  return result;
}

// ── Festival-anchored date reconciliation ────────────────────────────────
//
// The trust tiers above can't settle a festival's start date, because the
// sources that disagree are all ranked HIGH — and correctly so. The Sheridan
// Opera House is authoritative for ITS OWN shows, so it can't be demoted; but
// it also republishes town-wide festivals under the bare festival name, on
// whatever day its own programming starts. On 2026-08-09 the Telluride Mushroom
// Festival appeared on THREE different start dates across the site: Aug 12
// (KOTO, telluride.com), Aug 13 (Sheridan), and Aug 14 (TELLURIDE_FESTIVALS,
// which was simply wrong and has been corrected to the 12th).
//
// TELLURIDE_FESTIVALS is hand-vetted, drives the Festival Tickets sidebar, and
// is the closest thing the site has to festival truth — so it anchors the date.
// A record whose title IS a festival's name, dated anything other than that
// festival's start, is a duplicate header and gets dropped. The festival still
// renders from the sources that had it right.
//
// Deliberately narrow, because the cost of over-matching is deleting real
// events: the title must equal the festival name EXACTLY once normalized. That
// keeps the festival's individual shows — "Banshee Tree w/ Quattlebaum -
// Telluride Mushroom Fest" in ALIBI_EVENTS — which are distinct events on their
// own nights, not duplicate headers.
const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function recordDateKey(rec) {
  const raw = rec && (rec.date || rec.pubDate || rec.startDate);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw || ''));
  return m ? m[0] : null;
}

// festivals: TELLURIDE_FESTIVALS rows ({ name, month /* 0-indexed */, dayStart }).
// Returns { NAME: { kept, dropped } } only for arrays that lost a record.
function reconcileFestivalDates(arraysByName, festivals) {
  const byName = new Map();
  for (const f of festivals || []) {
    const key = normName(f && f.name);
    if (!key || !Number.isInteger(f.month) || !Number.isInteger(f.dayStart)) continue;
    byName.set(key, f);
  }
  if (!byName.size) return {};

  const pad = (n) => String(n).padStart(2, '0');
  const result = {};
  for (const [name, arr] of Object.entries(arraysByName || {})) {
    const kept = [];
    const dropped = [];
    for (const rec of arr || []) {
      const fest = byName.get(normName(rec && rec.title));
      const dateKey = recordDateKey(rec);
      if (!fest || !dateKey) { kept.push(rec); continue; }
      // Anchor to the record's OWN year so this stays correct across years.
      const canonical = `${dateKey.slice(0, 4)}-${pad(fest.month + 1)}-${pad(fest.dayStart)}`;
      if (dateKey === canonical) { kept.push(rec); continue; }
      // Only reconcile copies near the festival itself; an identically-named
      // event months away is something else and is left alone.
      const gap = Math.abs(Date.parse(dateKey + 'T00:00:00Z') - Date.parse(canonical + 'T00:00:00Z')) / 86400000;
      if (!Number.isFinite(gap) || gap > 30) { kept.push(rec); continue; }
      dropped.push({ title: rec.title, wrongDate: dateKey, canonicalDate: canonical });
    }
    if (dropped.length) result[name] = { kept, dropped };
  }
  return result;
}

module.exports = { TRUST, trustOf, reconcileByTrust, reconcileFestivalDates, LOW, MID, HIGH };
