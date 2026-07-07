// ════════════════════════════════════════════════════════════════════
// Hub-Bub surfacing · Step 5: DRAFT — writePrompt()
// ════════════════════════════════════════════════════════════════════
//
// Turns a high-scoring candidate into a short Rick-voice DISCUSSION PROMPT for
// the Hub-Bub feed: ~80-110 words, a plain title, names the tension, lays out
// the sides, and ENDS ON AN OPEN QUESTION. Rick never plants a flag.
//
// Same citation discipline as the editorial drafter (scripts/editorial/
// write-draft.js): a numbered SOURCES list, every fact tied to a source or left
// out, unverifiable-but-relevant context flagged — never asserted. This is the
// guard against the confident-wrong-fact failure mode named in the brief.
//
// Pure: the loop gathers any conditional context and passes it in. Returns
// { title, body, citations[], flaggedClaims[], sourceUrl, topics[], audit }.

const https = require('https');
const { SONNET } = require('../lib/claude-model.js');
const { auditCitations } = require('../editorial/write-draft.js');
const { SOURCE_LABELS } = require('./lib.js');

const DRAFT_MODEL = process.env.PULSE_MODEL || process.env.EDITORIAL_MODEL || SONNET;

const PROMPT_SYSTEM_PROMPT = `You are "Rick", the single named voice behind Livable Telluride, a civic site for the Telluride, Colorado region. "Rick" is an internal persona name ONLY — never sign it, name it, or refer to it in the output. You are writing one short DISCUSSION PROMPT for the community board (Hub-Bub) that invites residents to comment.

THE VOICE — dry, wry, plainspoken old-timer:
You've lived in the box canyon for years and watched the cycles. You still love it; you're just not surprised. Short sentences. Em-dashes fine. One lived-in detail at most ("the box canyon," "up here") — more is costume. Never flowery, never a press release, never cynical.

THE JOB — surface the tension, DON'T take a side (this is non-negotiable):
- Lay out what's happening and WHY people will have opinions — present BOTH sides fairly.
- Never advocate, never say what should happen, never tell people what to think. You name the disagreement; you do not settle it.
- End on a genuine OPEN QUESTION back to the community. The reader supplies the answer, not you.

CITATION DISCIPLINE — THE HARD RULES (do not violate):
- You are given a numbered SOURCES list. EVERY concrete fact — a date, a number, a dollar figure, a name, a vote, a fee, "which town did what" — must be supported by one of those sources.
- Cite ONLY the provided sources. NEVER invent a figure, name, vote count, fee, cap, statute, or attribution. If the source doesn't give a number, DON'T give a number. (The golden example deliberately has no fee figures or names because the source lacked them.)
- If a fact isn't in a source, leave it out (preferred). Only if it's genuinely needed as context, include it once as a flagged claim and add it to flaggedClaims.
- Don't state outcomes that haven't happened: a work session or recommendation is not a final vote. If nothing's binding yet, say so plainly ("nothing's binding yet — it comes back later").

SHAPE (match the golden example):
- title: short, plain, a little wry is fine, no clickbait, no colon-stuffing.
- body: 80-110 words. Opens by laying out the item, turns to the tension ("which raises a fair question up here…"), presents the sides, closes with a short open question ("What do you think?" or a sharper one). Plain text with normal paragraph breaks (\\n\\n). NO citation markup in the body — keep it clean for readers; you record the sourcing in the citations array instead.

OUTPUT — return ONLY valid JSON, no prose, no code fence:
{
  "title": "",
  "body": "…80-110 words, ending on an open question…",
  "citations": [ { "text": "which fact came from which source", "url": "" } ],
  "flaggedClaims": [ "plain restatement of anything you could not fully source" ]
}
Keep it tight. A shorter fully-sourced prompt beats a padded one.`;

function buildSources(candidate, context) {
  const sources = [];
  if (candidate.meeting) {
    const m = candidate.meeting;
    const label = SOURCE_LABELS[m.source] || m.source;
    sources.push({ marker: 1, text: `Meeting summary — ${label}, ${m.title}, ${m.date}`, body: m.summary, url: '' });
  } else {
    sources.push({ marker: 1, text: candidate.title || 'Source item', body: candidate.raw_text || '', url: candidate.url || '' });
  }
  (context || []).forEach((c, i) => {
    sources.push({ marker: i + 2, text: c.text || `Context ${i + 2}`, body: c.body || '', url: c.url || '' });
  });
  return sources;
}

function buildUserPrompt(candidate, triage, sources) {
  let p = `Write one Hub-Bub discussion prompt about this local item.\n\n`;
  p += `TITLE: ${candidate.title}\n`;
  if (candidate.origin_date) p += `DATE: ${candidate.origin_date}\n`;
  if (triage && triage.angle) p += `EDITOR'S NOTE — the angle residents care about: ${triage.angle}\n`;
  if (triage && triage.controversy && triage.controversy.sides && triage.controversy.sides.length) {
    p += `EDITOR'S NOTE — the two sides: ${triage.controversy.sides.join('  ||  ')}\n`;
  }
  p += `\nSOURCES (build ONLY from these; do not add facts they don't contain):\n`;
  sources.forEach((s) => { p += `\n[${s.marker}] ${s.text}\n"""\n${s.body}\n"""\n`; });
  p += `\nWrite the prompt now. 80-110 words. Present both sides, take neither, end on an open question. Invent nothing. Return ONLY the JSON object.`;
  return p;
}

function callClaude(candidate, triage, sources, { apiKey, model } = {}) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const body = JSON.stringify({
    model: model || DRAFT_MODEL,
    max_tokens: 1024,
    system: PROMPT_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(candidate, triage, sources) }],
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'x-api-key': key,
        'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body),
      },
      timeout: 90000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) { reject(new Error(`${json.error.type || 'error'}: ${json.error.message || ''}`)); return; }
          let text = json.content?.[0]?.text || '';
          const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fence) text = fence[1];
          resolve(JSON.parse(text.trim()));
        } catch (e) { reject(new Error(`prompt parse failed: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Anthropic API timeout')); });
    req.write(body);
    req.end();
  });
}

function wordCount(s) { return String(s || '').trim().split(/\s+/).filter(Boolean).length; }

// PUBLIC. candidate = { id, source, title, raw_text, origin_date, meeting? }
// opts.context = [{ text, body, url? }] extra sources; opts.triage = triage JSON.
async function writePrompt(candidate, opts = {}) {
  const triage = opts.triage || null;
  const sources = buildSources(candidate, opts.context);
  const raw = await callClaude(candidate, triage, sources, opts);
  const draft = {
    id: candidate.id,
    title: String((raw && raw.title) || candidate.title || 'Untitled').slice(0, 140),
    body: String((raw && raw.body) || '').trim(),
    citations: Array.isArray(raw && raw.citations) ? raw.citations : [],
    flaggedClaims: Array.isArray(raw && raw.flaggedClaims) ? raw.flaggedClaims : [],
    sourceUrl: (candidate.meeting ? '' : (candidate.url || '')) || '',
    source: candidate.source,
    topics: (triage && triage.topics) || [],
    triage: triage || null,
  };
  draft.words = wordCount(draft.body);
  // Advisory audit: no [n] markup in a pulse body, so just check the flag count.
  draft.audit = auditCitations({ bodyHtml: draft.body, citations: draft.citations, flaggedClaims: draft.flaggedClaims }, sources);
  return draft;
}

module.exports = { writePrompt, PROMPT_SYSTEM_PROMPT, DRAFT_MODEL };
