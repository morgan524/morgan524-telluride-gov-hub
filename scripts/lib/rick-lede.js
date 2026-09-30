'use strict';
// ──────────────────────────────────────────────────────────────────────────
// Canonical "Rick"-voice lede generator — the ONE source of truth for the
// one-paragraph intro on Livable Telluride's community emails.
//
// Two callers use this:
//   • scripts/build-rss-feed.js — the weekly Mailchimp RSS digest (imports
//     RICK_VOICE so its lede+notable prompt shares the exact persona).
//   • scripts/weekly-email.js   — the weekly AND weekend digest-desk emails
//     (calls generateRickLede() to write the intro from the real events).
//
// Before this module existed, only the RSS path had a Rick lede; the
// digest-desk weekend email fell back to a hand-maintained JSON that defaulted
// to a generic canned line whenever nobody typed a dated entry — which is why
// the "Weekend Ahead Outlook" intro was never in Rick's voice. Keeping the
// persona here means the two paths can't drift.
// ──────────────────────────────────────────────────────────────────────────
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const { SONNET } = require('./claude-model.js');

// The persona line. Cadence-neutral ("community email", not "weekly") so it
// reads correctly for both the weekly and the weekend send; the window line in
// the prompt below establishes which one.
const RICK_VOICE = 'You are "Rick" — a long-time Telluride local writing the one-paragraph intro to Livable Telluride\'s community email. You\'ve seen it all, you love this valley, and you\'re not cynical but you pay attention when something real is at stake. Voice: warm, plain-spoken, grounded.';

function callClaude(apiKey, prompt, maxTokens) {
  const body = JSON.stringify({
    model: SONNET,
    max_tokens: maxTokens || 500,
    messages: [{ role: 'user', content: prompt }],
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 45000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) { reject(new Error(json.error.message)); return; }
          resolve((json.content?.[0]?.text || '').trim());
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Claude API timeout')); });
    req.write(body); req.end();
  });
}

// Build the lede-only prompt. `cadence` is 'weekend' (Fri–Sun, events only) or
// 'week' (Fri–Thu, meetings + events).
function ledePrompt({ meetings, events, cadence }) {
  const weekend = cadence === 'weekend';
  const windowLine = weekend
    ? 'Below are the notable community events for THIS COMING WEEKEND (Friday through Sunday) across the Telluride region.'
    : 'Below are the UPCOMING government meetings and community events for the coming week (Friday through Thursday) across the Telluride region.';
  // HOUSE STYLE (Morgan, 2026-09-21 — "save that style for all future
  // digests"): cover MORE of the window, put the DAY OF THE WEEK on every item,
  // and wrap each body / event name in **double asterisks**. weekly-email.js
  // renders **…** as bold (escBold); nothing else is markup.
  const style = ' Every meeting or event you mention MUST carry its day of the week (e.g. "Tuesday", "on Saturday"). Wrap the NAME of each governing body and each event in double asterisks for bold, exactly like **Telluride Town Council** or **Slap Dragon** — the name only, not the day or the venue. No other markup.' +
    // Morgan 2026-09-30: the region has many town councils, so a bare
    // "Town Council" is ambiguous. Every mention names its town.
    ' ALWAYS name a governing body with its town or county, every time you mention it — use the "body" name given for each meeting, e.g. **Telluride Town Council**, **Mountain Village Town Council**, **Ridgway Town Council**, **Ouray City Council**, **San Miguel County Board of County Commissioners**. NEVER write a bare "Town Council", "City Council", "Council", or "the Board" — not even on a second reference in the same paragraph.';
  // Morgan 2026-09-30: a line break after each summarized day. The paragraphs
  // are separated by a newline inside the JSON string; weekly-email.js renders
  // each one on its own line.
  const byDay = ' Separate the day paragraphs with a single newline character (\\n) inside the "lede" string; do not put two days in one paragraph.';
  const spec = weekend
    ? 'a plain-prose intro to the weekend (70-120 words), written DAY BY DAY: one short paragraph per day that has something worth doing (Friday, then Saturday, then Sunday), each opening with that day. Give the single best or biggest thing the most weight within its day, and fold in three or four of the others across the weekend. Warm and grounded — like a local telling a friend what is worth getting out for.' + style + byDay
    : 'a plain-prose intro that orients a busy local (120-200 words), written DAY BY DAY in date order: one short paragraph per day that has a meeting or event worth mentioning, each opening with that day (e.g. "Monday, …"). Give the single biggest or most important meeting of the week the most weight within its day, cover the other consequential meetings on their days, and fold in three or so events "on the lighter side" on theirs. Aim to name most of the meetings and several events, not just one or two.' + style + byDay;
  const parts = [
    RICK_VOICE,
    '',
    windowLine,
    '',
    'Return ONLY a JSON object (no markdown fence) with exactly one field, "lede": ' + spec + ' Be specific and grounded — only use what is in the lists below; never invent times, prices, lineups, vote outcomes, or details you were not given. No greeting, no sign-off, no "Rick here", no calls to action, no emoji.',
    '',
  ];
  if (!weekend) { parts.push('MEETINGS:', JSON.stringify(meetings || [], null, 1), ''); }
  parts.push('EVENTS:', JSON.stringify(events || [], null, 1));
  return parts.join('\n');
}

// ── Lede cache ──────────────────────────────────────────────────────────────
// The lede is a Claude call, so the SAME inputs used to produce a DIFFERENT
// paragraph on every render. That made the digest render non-deterministic,
// which mattered once the digest started re-rendering whenever the bot data
// changes (digest-refresh.yml runs after Content Refresh): every run rewrote
// digest/week.html with a reworded intro, so "commit only if the render
// changed" always committed, and a real change (an agenda link appearing) was
// buried in lede churn.
//
// Fix: content-address the lede. The key is a hash of EXACTLY what the prompt
// is built from — cadence + the meetings/events list — so the same window
// returns the same paragraph with no API call, and the lede is rewritten only
// when the underlying meetings/events actually change (e.g. an agenda posts
// and a placeholder summary becomes a real one). Same pattern as
// data/meeting-hooks-cache.json.
function ledeInputFingerprint({ meetings, events, cadence } = {}) {
  // Hash the prompt inputs, not the prompt string: prompt wording can be
  // edited without invalidating every cached lede in the file.
  const payload = JSON.stringify({
    // Bump when the HOUSE STYLE in ledePrompt changes so every cached lede
    // written under the old style is regenerated (v2 = bold names + weekdays,
    // v3 = every body named with its town — no bare "Town Council",
    // v4 = one paragraph per day, line break between days).
    style: 4,
    cadence: cadence === 'weekend' ? 'weekend' : 'week',
    // Weekend ledes are events-only (see ledePrompt), so meetings must not
    // enter the key there — otherwise a meeting change would bust a cache
    // entry whose text can't possibly depend on it.
    meetings: cadence === 'weekend' ? [] : (meetings || []),
    events: events || [],
  });
  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16);
}

function loadLedeCache(cacheFile) {
  if (!cacheFile) return {};
  try { return JSON.parse(fs.readFileSync(cacheFile, 'utf8')) || {}; }
  catch (e) { return {}; }   // missing/corrupt cache is a miss, never an error
}

function saveLedeCache(cacheFile, cache) {
  if (!cacheFile) return;
  // Keep the file from growing without bound: ledes are per-window and go
  // stale the moment the window passes. 40 entries is several weeks of both
  // cadences; oldest-written are dropped first.
  const keys = Object.keys(cache);
  if (keys.length > 40) {
    const trimmed = {};
    for (const k of keys.slice(-40)) trimmed[k] = cache[k];
    cache = trimmed;
  }
  try { fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 1) + '\n'); }
  catch (e) { /* best-effort: a read-only FS must not fail the render */ }
}

// Places that make a council name unambiguous. Anything else in front of
// "Council" (or nothing) is a bare reference.
const PLACE_RE = /(telluride|mountain village|ridgway|norwood|ophir|rico|ouray|nucla|naturita|sawpit|placerville|montrose|dolores|san miguel)\s*(town|city)?\s*$/i;

// Bare council references in a lede: "Town Council", "City Council" or
// "Council" not directly preceded by a place name. Returns the offending
// snippets (empty when the lede is fine).
function bareCouncilRefs(lede) {
  const out = [];
  const t = String(lede || '').replace(/\*\*/g, '');
  const re = /\b(?:(?:Town|City)\s+)?Council\b/g;
  let m;
  while ((m = re.exec(t))) {
    const before = t.slice(Math.max(0, m.index - 40), m.index) + (/^(town|city)/i.test(m[0]) ? m[0].split(/\s+/)[0] : '');
    if (!PLACE_RE.test(before.replace(/\s+$/, '') + ' ') && !PLACE_RE.test(before)) out.push(t.slice(Math.max(0, m.index - 20), m.index + m[0].length));
  }
  return out;
}

// Generate the Rick-voice lede from the ACTUAL meetings + events in the window.
// Best-effort: returns null (never throws) when there is no API key, nothing to
// write about, or the call/parse fails — so the caller keeps its fallback lede.
async function generateRickLede({ meetings, events, apiKey, cadence, cacheFile } = {}) {
  const ev = Array.isArray(events) ? events : [];
  const mtg = Array.isArray(meetings) ? meetings : [];
  if (!ev.length && !mtg.length) return null;   // nothing to summarize

  // A cache hit needs no API key — that's the point: re-rendering the same
  // window is free and byte-identical, so only a real content change moves
  // the digest.
  const fp = ledeInputFingerprint({ meetings: mtg, events: ev, cadence });
  const cache = loadLedeCache(cacheFile);
  if (cache[fp] && cache[fp].lede) {
    console.log('  i Rick lede cache hit (' + fp + ') — no Claude call');
    return cache[fp].lede;
  }

  // Log the fingerprint on a MISS too: when a digest re-render moves the lede,
  // this is the one line that says why (the inputs changed, and to what key).
  console.log('  i Rick lede cache miss (' + fp + ') — generating');
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) { console.log('  i No ANTHROPIC_API_KEY — skipping Rick lede (using fallback)'); return null; }
  try {
    const parse = (raw) => { const m = raw.match(/\{[\s\S]*\}/); return String(JSON.parse(m ? m[0] : raw).lede || '').trim(); };
    const prompt = ledePrompt({ meetings: mtg, events: ev, cadence });
    let lede = parse(await callClaude(key, prompt, 500));
    // One corrective retry when a bare "Town Council" / "Council" slips through.
    const bad = bareCouncilRefs(lede);
    if (lede && bad.length) {
      console.log('  ! Rick lede named a council without its town (' + bad.join(' | ') + ') — retrying');
      const fixed = parse(await callClaude(key, prompt + '\n\nYour previous draft was:\n' + lede +
        '\n\nIt used a bare council name here: ' + bad.map((b) => '"' + b + '"').join(', ') +
        '. Rewrite it so EVERY mention of a council or board names its town or county (e.g. **Telluride Town Council**). Same JSON format.', 500));
      const stillBad = bareCouncilRefs(fixed);
      if (fixed && stillBad.length < bad.length) lede = fixed;
      if (stillBad.length) console.log('  ! Rick lede still has a bare council reference after retry: ' + stillBad.join(' | '));
    }
    if (lede) { cache[fp] = { lede, at: new Date().toISOString().slice(0, 10) }; saveLedeCache(cacheFile, cache); }
    return lede || null;
  } catch (e) {
    console.log('  ! Rick lede generation failed (' + e.message + ') — using fallback');
    return null;
  }
}

module.exports = { generateRickLede, ledePrompt, RICK_VOICE, ledeInputFingerprint, bareCouncilRefs };
