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

module.exports = { stripDescPreamble };
