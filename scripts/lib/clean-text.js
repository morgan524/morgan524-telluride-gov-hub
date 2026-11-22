// Strip a leaked AI/meta "preamble" that some aggregated or user-submitted event
// descriptions carry. People increasingly draft calendar copy with an AI tool
// and paste the whole response, lead-in and all, e.g.:
//
//   "Here's a polished calendar description focused on the opening reception
//    while capturing the details from the poster: Join us for the opening…"
//
// We ingest source descriptions verbatim, so that meta-sentence lands in the
// data and then in the events page + weekly email. Remove it conservatively:
// only when the text STARTS with a lead-in ("Here's…", "Sure, here's…",
// "Below is…", "I've written…"), that lead-in mentions a copy/description noun,
// and it ends at the first colon within ~160 chars — so a normal description
// that merely contains a colon is never touched.
function stripDescPreamble(s) {
  s = String(s == null ? '' : s);
  const m = s.match(/^\s*((?:sure[,!.]?\s*)?(?:here(?:'|’|&#0?39;|&rsquo;)?s|here is|below is|this is|i(?:'|’|&#0?39;)?ve\s+\w+)\b[^:]{0,160}?):\s+/i);
  if (m && /\b(description|calendar|summary|blurb|write[- ]?up|copy|version|draft|caption|text|paragraph)\b/i.test(m[1])) {
    return s.slice(m[0].length).trim();
  }
  return s.trim();
}

// A "placeholder" summary is the stub written when an agenda isn't posted yet
// ("…agenda hasn't been posted yet." / "Agenda not yet available" / "agenda
// TBD/pending"). Shared by content-refresh (regenerate stubs when the real
// agenda lands) and build-week-meetings (hasAgenda derives from the summary so
// the card's button can never contradict its text — 2026-07-23). Patterns stay
// ANCHORED to the word "agenda" so a real summary mentioning a "pending
// application" isn't mistaken for a stub.
function isPlaceholderSummary(s) {
  if (!s || typeof s !== 'string') return true;
  // "agenda … hasn't been posted yet" tolerates intervening words ("The
  // agenda for this July 29 joint work session hasn't been posted yet") but
  // stays within one sentence ([^.]{0,140}) so a real summary can't match.
  return /agenda[^.]{0,140}?\b(?:hasn'?t|has not)\s+been posted yet|agenda not yet available|no agenda(?:\s+text)?\s+available|agenda\s+(?:details\s+)?(?:tbd|pending|forthcoming|to be (?:determined|announced|posted))|meeting information unavailable|meeting scheduled for|list of past meetings|agenda content for this/i.test(s);
}

// Fingerprint of the ONLY two inputs a meeting summary is derived from. Stored
// on a placeholder's agenda-meta as `ph` so content-refresh can tell "nothing
// has changed since I last wrote this stub" from "a real agenda just landed".
//
// Why this exists: the previous guard skipped the Claude call only when BOTH
// the agenda text and the seed text were empty. `agendaSeedText` is 50-140
// chars of never-changing metadata (title/category from the source API), so on
// every seed-text meeting the guard never fired and Claude re-derived a
// byte-equivalent "agenda hasn't been posted yet" stub on all 8 daily runs,
// forever. Measured 2026-08-07: 10 wasted calls/run, 80/day.
function summaryInputFingerprint(agendaText, seedText) {
  return require('crypto').createHash('sha1')
    .update(`${agendaText || ''} ${seedText || ''}`)
    .digest('hex').slice(0, 16);
}

// True when a placeholder stub can be left alone — same inputs as last time, so
// re-asking would just re-roll the same sentence at full price. Any change to
// the agenda/seed text (notably: a real agenda posting) flips this to false and
// the summary regenerates, which is what keeps the cards self-healing.
function placeholderIsCurrent(isPlaceholder, priorFingerprint, currentFingerprint) {
  return !!isPlaceholder && !!priorFingerprint && priorFingerprint === currentFingerprint;
}

// Event pages built as a labeled form ("WHEN? Wednesday… WHERE? Wright Opera
// House… RUN TIME: … ABOUT THE FILM A Monster Calls follows…") came through
// with the raw labels as the card text (2026-10-04 Week Ahead). When there is
// an "ABOUT …" section, that is the description; otherwise drop the labels.
// Only applies when a WHEN?/WHERE? label is present, so ordinary prose is
// never touched.
function stripFormLabels(s) {
  s = String(s == null ? '' : s);
  if (!/\b(?:WHEN|WHERE)\?(?:\s|$)/.test(s)) return s;
  const about = s.match(/\bABOUT(?: THE (?:FILM|MOVIE|EVENT|SHOW|PROGRAM|CONCERT|PERFORMANCE))?\s+(?=[A-Z])/);
  if (about && s.length - (about.index + about[0].length) > 40) return s.slice(about.index + about[0].length).trim();
  return s.replace(/\b(?:WHEN|WHERE|WHO|WHAT|COST|TICKETS)\?\s*/g, '')
    .replace(/\b(?:RUN TIME|RATING|ROTTEN TOMATOES SCORE|COST|TICKETS|ADMISSION):\s*/g, '')
    .replace(/\s+/g, ' ').trim();
}

// Event titles in Title Case (Morgan 2026-10-19): "TODDLER STORYTIME ART FOR
// AGES 2.5-5" → "Toddler Storytime Art for Ages 2.5-5", "Up-off Gymnastics" →
// "Up-Off Gymnastics". An ALL-CAPS title is lowered first (known acronyms and
// vowel-less tokens like DJ/BBQ stay capitalized); then every word starting
// with a lowercase letter is capitalized, except short joining words mid-title.
// Words with inner capitals or digits (iPhone, 2.5-5, 5k) are left alone.
const TC_MINOR = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'per', 'the', 'to', 'vs', 'via', 'with']);
const TC_ACRONYMS = new Set(['KOTO', 'TSRC', 'ADA', 'AA', 'NA', 'ESL', 'STEM', 'LGBTQ', 'LGBTQIA', 'USA', 'US', 'HOA', 'TMVOA', 'SMART', 'BOCC', 'HARC', 'P&Z', 'Q&A', 'AI', 'EMT', 'ID', 'II', 'III', 'IV', 'VI', 'VFW', 'YMCA', 'AARP', 'ASL', 'RSVP', 'NYE', 'NFL', 'NBA', 'UFC', 'FAQ', 'TBA', 'TBD', 'MLK', 'CO', 'UTV', 'ATV', 'PTA', 'PTO', 'K-12', '4-H', 'TCA', 'TAB', 'TMC', 'TPAF', 'AHAA', 'SMRT', 'CORA', 'LT']);
function titleCaseEventTitle(title) {
  let t = String(title == null ? '' : title);
  if (!/[a-z]/i.test(t)) return t;
  const allCaps = !/[a-z]/.test(t);
  const words = t.split(/(\s+)/);
  let first = true;
  return words.map((w, i) => {
    if (/^\s+$/.test(w) || !w) return w;
    const isFirst = first; first = false;
    const prev = words.slice(0, i).join('').trim();
    const afterColon = /[:—–-]$/.test(prev) || /[:(]$/.test(prev);
    const isLast = !words.slice(i + 1).join('').trim();
    const core = w.replace(/^[^A-Za-z0-9&]+|[^A-Za-z0-9&+]+$/g, '');
    if (allCaps) {
      if (TC_ACRONYMS.has(core.replace(/'S$/, '')) || (/^[A-Z&]{2,}$/.test(core) && !/[AEIOUY]/.test(core))) return w;
      w = w.toLowerCase();
    }
    if (/^(https?:|www\.)|@/.test(w) || /^w\/$/i.test(w)) return w.replace(/^W\//, 'w/');
    return w.split('-').map((seg, j) => {
      const lead = seg.match(/^[^A-Za-z0-9]*/)[0];
      const rest = seg.slice(lead.length);
      if (!rest || !/^[a-z]/.test(rest)) return seg;                  // already capitalized, digit-led, or empty
      if (/[A-Z0-9]/.test(rest.slice(1))) return seg;                 // iPhone, eBay, x2
      const bare = rest.replace(/[^a-z']+$/, '');
      if (j === 0 && !isFirst && !isLast && !afterColon && TC_MINOR.has(bare)) return seg;
      return lead + rest[0].toUpperCase() + rest.slice(1);
    }).join('-');
  }).join('');
}

module.exports = {
  titleCaseEventTitle,
  stripDescPreamble,
  stripFormLabels,
  isPlaceholderSummary,
  summaryInputFingerprint,
  placeholderIsCurrent,
};
