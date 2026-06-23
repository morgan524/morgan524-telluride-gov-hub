// Canonical Claude model IDs for the Node scripts in scripts/.
//
// These used to be hardcoded separately in 5 files; a model retirement then
// silently broke API calls one file at a time (the June 2026 incident: 5 days
// of empty meeting summaries). Centralizing makes a retirement bump a ONE-FILE
// edit. See memory/claude-model-inventory.md.
//
// Prefer FLOATING ALIASES (sonnet/opus) — they auto-track Anthropic's stable
// release pointer and survive minor-version retirements. Haiku has no
// documented non-dated alias yet, so it's date-pinned.
//
// NOT shared with the two other deployments, which keep their own copies:
//   • cloudflare-worker/livabletelluride-rss-proxy/worker.js  (Opus, inline)
//   • govhub-summary-backend/functions/index.js               (Sonnet)
// When bumping a model, update those two by hand too (the inventory note lists
// them) — there's no import path across deployment boundaries.

module.exports = {
  SONNET: 'claude-sonnet-4-6',
  OPUS:   'claude-opus-4-8',
  HAIKU:  'claude-haiku-4-5-20251001',
};
