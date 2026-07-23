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

module.exports = { stripDescPreamble, isPlaceholderSummary };
