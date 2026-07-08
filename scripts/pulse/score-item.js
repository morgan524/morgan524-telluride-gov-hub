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

What scores HIGH (4-5) — these are the priority topics, in roughly this order:
  1. NEW or MAJOR public projects — a town/county/district redevelopment, a new building, a garage, a capital project, land the government is buying or building on (e.g. Carhenge, Shandoka, a new parking structure). Milestones count: a design going to review, story poles going up, a bond, a groundbreaking.
  2. MAJOR CODE or LAND-USE CHANGES by ANY public entity (Town, County, Mountain Village, or a district) that affect AFFORDABLE HOUSING or DENSITY — height limits, unit counts, zoning / Land Use Code amendments, PUDs, deed-restriction rules.
  3. SCANDAL / ACCOUNTABILITY — conflicts of interest, misuse of public money, closed-door dealings, an official under scrutiny.
  4. TRAFFIC, PARKING, TRANSIT, and ROADS.
  5. BIG MONEY — taxes, fees, bonds, budgets, subsidies, public debt.
  Also strong: short-term-rental rules, water, and any real land-use fight. The test is "would two reasonable locals disagree about this?" AND "is it one of the topics above?"

What scores LOW (0-2): routine procedure (consent agenda, appointments, proclamations, minutes), ceremonial items, and MINOR/NARROW regulatory tweaks with no real density, housing, money, or project stake — e.g. an energy-mitigation program detail, a small program rule, a seasonal notice. When in doubt between "interesting rule" and "narrow rule," score it low.

Be strict. Most items are 1-2. Reserve 4-5 for the priority topics above with real, nameable tension.

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
