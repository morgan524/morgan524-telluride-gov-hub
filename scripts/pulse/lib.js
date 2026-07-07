// Shared helpers for the Hub-Bub surfacing pipeline (the "pulse" loop).
//
// Same agentic shape as scripts/editorial/*, pointed at a different OUTPUT:
// instead of a long article on /meetings/<slug>/, it drafts a short Rick-voice
// DISCUSSION PROMPT and — on human approval — publishes it as a system-authored
// post in the Hub-Bub feed (Firestore `posts`), inviting residents to comment.
//
// Candidate sourcing is deliberately pluggable. v1 draws from the meeting
// summaries the content-refresh pipeline already produces (the richest source
// of local controversy — STRs, budgets, land use). News/events/email lanes are
// fast-follows: add a loader that returns the same candidate shape and push it
// into loadCandidates().

const path = require('path');
// Reuse the editorial helpers verbatim — same Worker, same extraction, same
// date math — so the two pipelines can't drift.
const {
  WORKER_DEFAULT, kebab, daysSince, loadMeetings, httpJson, isPlaceholder,
} = require('../editorial/lib.js');
const { SOURCE_LABELS } = require('../editorial/write-draft.js');

// Deterministic dedup key / Firestore doc id for a candidate (from the SOURCE
// item, not the generated title), so the loop can ask "already surfaced?"
// before spending on scoring/drafting.
function pulseItemId(c) {
  return `${c.source}-${c.origin_date || 'x'}-${kebab(c.title, 6)}`;
}

// A candidate record (brief §4.1):
//   { id, source, url, title, raw_text, submitted_by_human, origin_date,
//     fetched_at, meeting? }
// `meeting` is carried when the candidate came from a meeting summary, so the
// draft step can build a proper numbered SOURCES list and pull prior context.

function meetingsToCandidates(weeks) {
  const cutoff = weeks * 7;
  return loadMeetings()
    .filter((m) => !isPlaceholder(m.summary) && daysSince(m.date) <= cutoff)
    .map((m) => {
      const label = SOURCE_LABELS[m.source] || m.source;
      return {
        source: 'govhub',
        origin_date: m.date,
        url: '',
        title: `${label}: ${m.title}`,
        raw_text: m.summary,
        submitted_by_human: false,
        meeting: m,
        get id() { return pulseItemId(this); },
      };
    });
}

// The union of every enabled lane. Add news/events/email loaders here — each
// must return records of the candidate shape above.
function loadCandidates(opts = {}) {
  const weeks = opts.weeks || 3;
  const out = [];
  out.push(...meetingsToCandidates(weeks));
  // out.push(...newsToCandidates(...));   // fast-follow
  // out.push(...emailQueueCandidates());  // fast-follow (email-in lane)
  // stamp id + fetched_at now that the shape is final
  return out.map((c) => ({ ...c, id: c.id, fetched_at: new Date().toISOString() }));
}

module.exports = {
  WORKER_DEFAULT, httpJson, kebab, daysSince, isPlaceholder, SOURCE_LABELS,
  pulseItemId, loadCandidates, meetingsToCandidates,
};
