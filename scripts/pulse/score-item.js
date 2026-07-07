// ════════════════════════════════════════════════════════════════════
// Hub-Bub surfacing · Step 2: TRIAGE — scoreItem()
// ════════════════════════════════════════════════════════════════════
//
// One Claude call per candidate → parseable JSON (brief §4.3). Judges whether a
// local item is worth turning into a Hub-Bub discussion prompt: is there a real
// tension residents would have OPINIONS about? A routine consent-agenda item is
// a 1; a fee hike, a development fight, an STR rule, a budget tradeoff is a 4-5.
//
//   score < 2   → ignore (log + drop)
//   score 2-3   → flag    (hold in queue, no draft)
//   score >= 4  → draft
//
// Human-submitted floor: run-pulse floors submitted_by_human items to >=3 so
// nothing Morgan forwards is silently dropped.
//
// Pure: no fetching, no state. Returns the JSON object (or a score:0 fallback).

const https = require('https');
const { SONNET } = require('../lib/claude-model.js');

const TRIAGE_MODEL = process.env.PULSE_MODEL || process.env.EDITORIAL_MODEL || SONNET;

const TRIAGE_SYSTEM_PROMPT = `You are the assignment editor for Livable Telluride's community discussion board (Hub-Bub), for the Telluride, Colorado region. You decide which local items deserve to become a short discussion PROMPT that invites residents to weigh in.

You are NOT writing anything yet. You are scoring ONE item and returning JSON.

What scores HIGH (4-5): a genuine local tension — something residents will hold real, differing opinions about. Fee or tax changes, short-term-rental rules, development / PUD fights, housing tradeoffs, budget priorities, parking, transit, land use, water, a rule that helps one group and costs another. The test is: "would two reasonable locals disagree about this?"

What scores LOW (0-2): routine procedure with no tradeoff (consent agenda, appointments, proclamations, minutes approval), purely ceremonial items, or anything with no resident-facing stake.

Be strict. Most items are 1-2. Reserve 4-5 for real, nameable tension.

Judge ONLY from the text provided. Do not import outside facts. If the item is thin, score it low.

Return ONLY valid JSON, no prose, no code fence:
{
  "score": 0,
  "topics": ["short tag", "short tag"],
  "angle": "one plain line: why a resident would care",
  "controversy": { "level": 0, "sides": ["one side, briefly", "the other side, briefly"] },
  "needs_context": ["e.g. a prior decision this builds on, or [] if none"],
  "confidence": "high | medium | low"
}
score and controversy.level are integers 0-5. sides is [] when there is no real disagreement.`;

function buildUserPrompt(candidate) {
  let p = `Score this local item for the Hub-Bub discussion board.\n\n`;
  p += `SOURCE: ${candidate.source}\nTITLE: ${candidate.title}\n`;
  if (candidate.origin_date) p += `DATE: ${candidate.origin_date}\n`;
  p += `\nITEM TEXT:\n"""\n${(candidate.raw_text || '').slice(0, 6000)}\n"""\n\n`;
  p += `Return ONLY the JSON object.`;
  return p;
}

function callClaude(candidate, { apiKey, model } = {}) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  const body = JSON.stringify({
    model: model || TRIAGE_MODEL,
    max_tokens: 512,
    system: TRIAGE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(candidate) }],
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'x-api-key': key,
        'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body),
      },
      timeout: 60000,
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
        } catch (e) { reject(new Error(`triage parse failed: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Anthropic API timeout')); });
    req.write(body);
    req.end();
  });
}

function normalize(raw) {
  const n = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(5, Math.round(Number(v)))) : d);
  const arr = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : []);
  const c = (raw && raw.controversy) || {};
  return {
    score: n(raw && raw.score),
    topics: arr(raw && raw.topics).slice(0, 5),
    angle: String((raw && raw.angle) || '').slice(0, 200),
    controversy: { level: n(c.level), sides: arr(c.sides).slice(0, 3) },
    needs_context: arr(raw && raw.needs_context).slice(0, 4),
    confidence: ['high', 'medium', 'low'].includes(raw && raw.confidence) ? raw.confidence : 'low',
  };
}

// PUBLIC. candidate = { source, title, raw_text, origin_date, ... }
async function scoreItem(candidate, opts = {}) {
  try {
    return normalize(await callClaude(candidate, opts));
  } catch (e) {
    return { score: 0, topics: [], angle: '', controversy: { level: 0, sides: [] }, needs_context: [], confidence: 'low', error: String(e.message || e) };
  }
}

module.exports = { scoreItem, TRIAGE_SYSTEM_PROMPT, TRIAGE_MODEL };
