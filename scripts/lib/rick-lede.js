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
  const spec = weekend
    ? 'a 2-3 sentence (40-70 word) plain-prose intro to the weekend. LEAD with the single best or biggest thing happening, then briefly fold in a couple of the others. Warm and grounded — like a local telling a friend what is worth getting out for.'
    : 'a 2-4 sentence (50-90 word) plain-prose intro that orients a busy local. LEAD with the single biggest or most important thing this week, then briefly fold in the rest.';
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
    const raw = await callClaude(key, ledePrompt({ meetings: mtg, events: ev, cadence }), 500);
    const m = raw.match(/\{[\s\S]*\}/);          // tolerate a stray markdown fence
    const parsed = JSON.parse(m ? m[0] : raw);
    const lede = String(parsed.lede || '').trim();
    if (lede) { cache[fp] = { lede, at: new Date().toISOString().slice(0, 10) }; saveLedeCache(cacheFile, cache); }
    return lede || null;
  } catch (e) {
    console.log('  ! Rick lede generation failed (' + e.message + ') — using fallback');
    return null;
  }
}

module.exports = { generateRickLede, ledePrompt, RICK_VOICE, ledeInputFingerprint };
