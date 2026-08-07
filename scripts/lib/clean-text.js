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

module.exports = {
  stripDescPreamble,
  isPlaceholderSummary,
  summaryInputFingerprint,
  placeholderIsCurrent,
};
