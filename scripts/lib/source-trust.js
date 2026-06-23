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

module.exports = { TRUST, trustOf, reconcileByTrust, LOW, MID, HIGH };
