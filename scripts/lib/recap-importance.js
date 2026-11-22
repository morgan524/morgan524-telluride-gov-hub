// Importance scoring for the Past Meetings email and the Week Ahead lede
// (Morgan 2026-10-19).
//
// The key decision-making bodies get a longer summary than the ~230-char
// teaser everyone else gets: Telluride Town Council, Planning & Zoning and
// HARC; the San Miguel BOCC and County Planning Commission; Mountain Village
// Town Council and its planning body (the Design Review Board).
//
// Within those recaps, sentences about issues that affect everyone (budgets,
// taxes, code changes, housing policy, the gondola, wildfire, ballot measures,
// town-owned projects) are favoured, and sentences about a single private lot
// (an address, "Lot 640A", a variance, an architecture review, a liquor
// license) are pushed down. A key-body meeting that turns out to be only lot
// decisions keeps the short teaser.
const RR = require('./recap-regions.js');

// sourceKey → title pattern for the key bodies.
const KEY_BODIES = {
  telluride: /town council|planning\s*(&|and)\s*zoning|\bp\s*&\s*z\b|\bharc\b|historic and architectural/i,
  county: /county commissioners|\bbocc\b|planning commission/i,
  mv: /town council|planning|design review/i,
};

function isKeyBody(r) {
  const re = r && KEY_BODIES[r.sourceKey];
  return !!(re && re.test(r.title || ''));
}

// Issues that reach the whole community. Each distinct match adds a point.
const COMMUNITY = [
  /\bbudget|appropriat|general fund|capital (fund|plan|project)|deficit|revenue/i,
  /\btax(es)?\b|mill levy|\bfees?\b|bond|ballot|election|amendment \d+|proposition|initiative/i,
  /ordinance|land use code|\bcode (amendment|update|change)|zoning (code|map)|comprehensive plan|master plan|moratorium|annex/i,
  /affordable|workforce|employee housing|attainable|housing (code|policy|authority|fund|mitigation)|mitigation fee|deed restrict/i,
  /gondola|transit|\bbus\b|parking|traffic|intercept lot|trail|bike path|road|highway/i,
  /wildfire|fire mitigation|water (supply|rights|plant|system)|sewer|utilit|climate|open space|forest/i,
  /town[- ]owned|county[- ]owned|municipal building|public (safety|health|land)|marshal|sheriff|license plate|police/i,
  /short[- ]term rental|\bstr\b|business license|town manager|county manager|policy|regulat|town[- ]?wide|county[- ]?wide|region(al)?\b|every (resident|household)/i,
  /carhenge|shandoka|airport|medical center|school district/i,
  /building codes?|international codes|energy code|zone district|density|accessory dwelling|\badus?\b|cottage housing|co-housing|subdivision exemption|\bpud\b/i,
  /grants?\b|nonprofit funding|contingency|reserve|audit|\bcip\b|enterprise fund|rates?\b/i,
];

// One private parcel. Each distinct match subtracts a point.
const LOT = [
  /\blots? \d+[A-Z0-9-]*\b|\bunits? \d+[A-Z]?\b|\bparcel\b/i,
  /\b\d{2,5} (West |East |North |South |W\.? |E\.? |N\.? |S\.? )?[A-Z][a-z]+ (Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Place|Pl|Way|Boulevard|Blvd|Court|Ct|Trail|Circle)\b/,
  /single[- ]family|duplex|residence|home ?owner|property owner|applicant/i,
  /variance|setback|architecture (and site )?review|site review|initial architecture|final architecture|design variation|landscap|fence|deck|addition|remodel|window|roof|siding|paint/i,
  /lot line|replat|plat amendment|minor subdivision|easement|liquor license|tavern|food truck|conditional use permit|special event permit/i,
  /consent agenda|minutes|proclamation/i,
];

function count(list, s) { return list.reduce((n, re) => n + (re.test(s) ? 1 : 0), 0); }

function sentenceScore(s) { return count(COMMUNITY, s) - count(LOT, s); }

// Whole-meeting score: how much of the recap is about issues affecting everyone.
function meetingScore(r) {
  const sents = splitSentences(r && r.recap);
  let community = 0, lot = 0;
  for (const s of sents) { const c = count(COMMUNITY, s), l = count(LOT, s); if (c > l) community++; else if (l > c) lot++; }
  return { community, lot, score: community - lot };
}

// Abbreviations that end in a period mid-sentence ("3,000 sq. ft. floor-area
// cap", "45 ft. for multifamily") — the 2026-10-08 County Planning recap split
// into fragments without this.
const ABBREV = /\b(sq|ft|no|nos|st|ave|rd|dr|blvd|mr|mrs|ms|dr|jr|sr|vs|approx|est|inc|co|u\.s|e\.g|i\.e|a\.m|p\.m)\.$/i;

function splitSentences(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  // Same rule as RR.shortRecap: . ! ? only end a sentence before a space or the end.
  const raw = (t.match(/(?:[^.!?]|[.!?](?!\s|$))+[.!?]+(?=\s|$)/g) || [t]).map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const s of raw) {
    const prev = out[out.length - 1];
    // Rejoin after an abbreviation, or when the "sentence" starts lower-case or with a digit.
    if (prev && (ABBREV.test(prev) || /^[a-z0-9(]/.test(s))) out[out.length - 1] = prev + ' ' + s;
    else out.push(s);
  }
  return out;
}

// A key meeting earns the long summary when its community-wide sentences are
// at least as many as its lot-by-lot ones, and either two or more sentences are
// community-wide or the opening sentence (which frames the meeting) clearly is
// (the 2026-09-30 HARC session was entirely the town-owned Carhenge project).
// Also used for UPCOMING meetings in the Week Ahead lede (pass the agenda
// summary as `text`): a meeting with no agenda summary yet is not major.
function isMajor(r, text) {
  if (!isKeyBody(r)) return false;
  const body = typeof text === 'string' ? text : r.recap;
  const m = meetingScore({ recap: body });
  if (!m.community || m.community < m.lot) return false;
  const first = splitSentences(body)[0] || '';
  return m.community >= 2 || sentenceScore(first) >= 2;
}

// The long summary: the highest-scoring sentences, kept in their original
// order, up to ~max characters. The opening sentence stays unless it is about
// a single lot, since it usually frames the meeting. Lot-only sentences are
// left for the full recap on the Past Meetings page.
function longRecap(text, max = 720) {
  const sents = splitSentences(text);
  if (!sents.length) return '';
  const scored = sents.map((s, i) => ({ s, i, score: sentenceScore(s) }));
  const keep = new Set();
  let len = 0;
  if (scored[0].score >= 0) { keep.add(0); len = scored[0].s.length; }
  const ranked = scored.slice(1).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.i - b.i);
  for (const x of ranked) {
    if (len && len + x.s.length + 1 > max) continue;
    keep.add(x.i); len += x.s.length + 1;
  }
  // Then fill, in order, with the neutral sentences (votes, outcomes, next
  // steps) that aren't about a single lot, so the summary reads as one.
  for (const x of scored) {
    if (keep.has(x.i) || x.score < 0 || len + x.s.length + 1 > max) continue;
    keep.add(x.i); len += x.s.length + 1;
  }
  if (!keep.size) return RR.shortRecap(text);
  return scored.filter((x) => keep.has(x.i)).map((x) => x.s).join(' ');
}

module.exports = { KEY_BODIES, isKeyBody, sentenceScore, meetingScore, splitSentences, isMajor, longRecap };
