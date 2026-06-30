// Write-time schema validation for the bot's scraped data. Runs at the single
// write funnel (content-refresh.js replaceJsValue → after sanitizeRecords,
// before serializeArray) so clearly-malformed records are QUARANTINED before
// they reach the live data file — the preventative complement to the daily
// content review's after-the-fact flagging.
//
// DELIBERATELY CONSERVATIVE: this drops live civic content, so it only acts on
// records that are unambiguously broken/unrenderable. Borderline cases are kept
// and left for the content review (a human decides). A mass-quarantine (a whole
// source going malformed because its format changed) shrinks the array, which
// source-health then flags — so we don't silently lose a whole section.

// Matches the site's localDate() acceptance: ISO, "Month D, YYYY", or anything
// the JS Date parser accepts. Returns true if the date string is renderable.
function isParseableDate(d) {
  const s = String(d).trim();
  if (!s) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true;            // ISO
  if (/^[A-Za-z]+\s+\d{1,2},?\s+\d{4}/.test(s)) return true; // "July 4, 2026"
  return !isNaN(Date.parse(s));
}

const ID_FIELDS = ['title', 'name', 'headline'];
const DATE_FIELDS = ['date', 'pubDate', 'startDate', 'eventDate'];
const CONTENT_FIELDS = ['description', 'copy', 'summary', 'body'];

function firstNonEmpty(o, fields) {
  for (const f of fields) {
    const v = o[f];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

// Returns { kept, quarantined: [{ record, reason }] }. Non-objects and records
// with no date-ish field at all (i.e. not event-like — e.g. config rows) pass
// through untouched.
function validateRecords(arr) {
  if (!Array.isArray(arr)) return { kept: arr, quarantined: [] };
  const kept = [];
  const quarantined = [];
  for (const o of arr) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) { kept.push(o); continue; }

    const rawDate = DATE_FIELDS.map(f => o[f]).find(v => v !== undefined && v !== null && String(v).trim() !== '');
    const hasDate = rawDate !== undefined;

    // Only event-like records (those carrying a date) are validated; config-style
    // rows without any date field are left alone.
    if (!hasDate) { kept.push(o); continue; }

    // Rule 1 — a date is present but unrenderable. Always broken: it would
    // mis-sort or vanish on the site.
    if (!isParseableDate(rawDate)) {
      quarantined.push({ record: o, reason: `unparseable date "${rawDate}"` });
      continue;
    }

    // Rule 2 — a dated entry with NO identifier AND NO content is a junk
    // fragment (renders as a blank card). A dated entry that has a title OR
    // some descriptive content is kept (the review flags a missing title; a
    // human decides — we don't auto-delete real content).
    const hasId = !!firstNonEmpty(o, ID_FIELDS);
    const hasContent = !!firstNonEmpty(o, CONTENT_FIELDS);
    if (!hasId && !hasContent) {
      quarantined.push({ record: o, reason: 'no title/name and no content' });
      continue;
    }

    kept.push(o);
  }
  return { kept, quarantined };
}

module.exports = { validateRecords, isParseableDate };
