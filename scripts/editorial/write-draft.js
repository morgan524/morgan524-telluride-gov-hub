// ════════════════════════════════════════════════════════════════════
// Editorial layer · Step 5: DRAFT — writeDraft()
// ════════════════════════════════════════════════════════════════════
//
// Given a newsworthy meeting (one that scoreMeeting() branched to 'draft')
// plus any conditional context the loop gathered (a budget-doc excerpt, an
// earlier summary it follows up on), draft a short article in the Livable
// Telluride voice ("Rick").
//
// CITATION DISCIPLINE is the whole point. The model is handed a NUMBERED
// SOURCES list and may cite ONLY those, inline, right after each claim. Any
// claim it can't tie to a provided source must either be omitted or wrapped
// as a FLAGGED claim — never asserted confidently. This is the design guard
// against the confident-error failure mode (the CRS § 29-4-210 hazard named
// in the brief): better to flag uncertainty than to state a wrong fact.
//
// writeDraft does NOT fetch anything itself — the loop does the conditional
// fetches (budget cross-check on spending, prior-summary pull on
// follow_up_to) and passes the results in as `opts.context`. That keeps this
// module pure and testable, mirroring score-meeting.js.
//
// Returns: { title, dek, bodyHtml, citations[], flaggedClaims[], slug,
//            source, bodyLabel, meetingDate, meetingKey }

const https = require('https');
const { SONNET } = require('../lib/claude-model.js');

const DRAFT_MODEL = process.env.EDITORIAL_MODEL || SONNET;

const SOURCE_LABELS = {
  telluride: 'Town of Telluride', mv: 'Mountain Village', county: 'San Miguel County',
  smart: 'SMART / Gondola', school: 'Telluride Board of Education', fire: 'Fire District',
  med: 'Hospital District', norwood: 'Norwood', ophir: 'Ophir', smrha: 'SMRHA Housing',
  ouray: 'Ouray County',
};

const ARTICLE_SYSTEM_PROMPT = `You are "Rick", the single named voice behind Livable Telluride, a civic news site for the Telluride, Colorado region. "Rick" is an internal persona name only — NEVER sign, name, or refer to "Rick" in the output. You are drafting a SHORT NEWS ARTICLE about one government meeting, for residents.

THE VOICE — knowing, not cynical:
You've lived in the box canyon for years and watched the cycles — booms and squeezes, development fights, housing crises, budget debates. You still love it; you're just not surprised. Bring that long view as CONTEXT, never as editorial verdict.
- Plainspoken. Short sentences work. Em-dashes are fine. Never flowery, never a press release.
- Critical of processes and patterns only — never of named individuals.
- NOT advocacy. Describe what's happening and why it matters here, then trust the reader. Never tell them what to think or do.
- Lived-in detail sparingly — at most one ("the box canyon," "both sides of the canyon"). More than that is costume.
- Comfortable with civic vocabulary (PUD, second reading, work session, BOCC, HARC, P&Z) used naturally.

CITATION DISCIPLINE — THE HARD RULES (do not violate):
- You are given a numbered SOURCES list. EVERY factual claim — every date, number, dollar figure, name, decision, vote, deadline — must be supported by one of those sources and tagged inline IMMEDIATELY after the claim with an HTML superscript: <sup class="cite">[n]</sup>, where n is the source number.
- Cite ONLY the provided sources. Never invent a source, URL, statistic, quote, vote count, or attribution.
- If a fact is NOT supported by any provided source, you have two choices: (a) leave it out entirely (preferred), or (b) if it is genuinely important context, include it ONCE wrapped as a flagged claim — <span class="flag">the claim</span><sup class="cite">⚠</sup> — and also add it to the flaggedClaims array. Flagging is for unverifiable-but-relevant context, NOT a license to speculate. When in doubt, omit.
- Do NOT state outcomes that haven't happened. A work session or recommendation is not a final vote — say so if the source says so.
- It is better to write a shorter, fully-sourced article than a longer one padded with unverifiable claims.

ARTICLE SHAPE:
- A headline: specific, plain, no clickbait, no colon-stuffing.
- A dek (standfirst): one sentence, ~25-40 words, sets the stakes for this community.
- Body: 3-6 short paragraphs, ~250-420 words total. Lead with the most consequential item. Plain HTML <p> paragraphs only (plus the <sup>/<span> citation/flag markup). No headings, no lists unless genuinely warranted.

OUTPUT — return ONLY valid JSON, no prose, no code fence:
{
  "title": "",
  "dek": "",
  "bodyHtml": "<p>…<sup class=\\"cite\\">[1]</sup></p><p>…</p>",
  "citations": [ { "marker": 1, "text": "human-readable source description", "url": "" } ],
  "flaggedClaims": [ "plain-text restatement of each claim you wrapped in <span class=\\"flag\\">" ]
}
The citations array MUST list every [n] you used, with text matching the provided SOURCES. Leave url "" unless a source provided one.`;

function kebab(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 7)
    .join('-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Build the numbered SOURCES block the model is allowed to cite. Source [1]
// is always the meeting agenda summary. Extra context (prior summary, budget
// excerpt) the loop gathered is appended as [2], [3], … and the model is told
// it may cite those too.
function buildSources(meeting, context) {
  const label = SOURCE_LABELS[meeting.source] || meeting.source;
  const sources = [{
    marker: 1,
    text: `Meeting agenda summary — ${label}, ${meeting.title}, ${meeting.date}`,
    body: meeting.summary,
    url: '',
  }];
  (context || []).forEach((c, i) => {
    sources.push({ marker: i + 2, text: c.text || `Context ${i + 2}`, body: c.body || '', url: c.url || '' });
  });
  return sources;
}

function buildUserPrompt(meeting, triage, sources) {
  const label = SOURCE_LABELS[meeting.source] || meeting.source;
  let p = `Draft a short Livable Telluride article about this meeting.\n\n`;
  p += `ENTITY: ${label}\nMEETING: ${meeting.title}\nDATE: ${meeting.date}\n`;
  if (triage && Array.isArray(triage.topics) && triage.topics.length) {
    p += `EDITOR'S NOTE — most newsworthy angles: ${triage.topics.join('; ')}.\n`;
  }
  if (triage && triage.follow_up_to) {
    p += `EDITOR'S NOTE — this follows up on: ${triage.follow_up_to}.\n`;
  }
  p += `\nSOURCES (cite ONLY these, by number):\n`;
  sources.forEach((s) => {
    p += `\n[${s.marker}] ${s.text}\n"""\n${s.body}\n"""\n`;
  });
  p += `\nWrite the article now. Tag every factual claim with <sup class="cite">[n]</sup>. Flag anything you cannot tie to a source. Return ONLY the JSON object.`;
  return p;
}

function callDraft(meeting, triage, sources, { apiKey, model, maxTokens = 2048 } = {}) {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');

  const body = JSON.stringify({
    model: model || DRAFT_MODEL,
    max_tokens: maxTokens,
    system: ARTICLE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(meeting, triage, sources) }],
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 90000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) { reject(new Error(`${json.error.type || 'error'}: ${json.error.message || JSON.stringify(json.error)}`)); return; }
          let text = json.content?.[0]?.text || '';
          const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (fence) text = fence[1];
          resolve(JSON.parse(text.trim()));
        } catch (e) { reject(new Error(`draft parse failed: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Anthropic API timeout')); });
    req.write(body);
    req.end();
  });
}

// Validate that every [n] used in the body actually appears in the citations
// array, and that the body doesn't cite a source number we never provided.
// Returns { ok, problems[] } — advisory; the loop decides what to do with it.
function auditCitations(draft, sources) {
  const problems = [];
  const used = new Set();
  const re = /\[(\d+)\]/g;
  let m;
  while ((m = re.exec(draft.bodyHtml || '')) !== null) used.add(Number(m[1]));
  const provided = new Set(sources.map((s) => s.marker));
  const listed = new Set((draft.citations || []).map((c) => Number(c.marker)));
  for (const n of used) {
    if (!provided.has(n)) problems.push(`Body cites [${n}] but no such source was provided`);
    if (!listed.has(n)) problems.push(`Body cites [${n}] but it's missing from the citations list`);
  }
  const flagCount = (draft.bodyHtml || '').match(/class="flag"/g)?.length || 0;
  if (flagCount !== (draft.flaggedClaims || []).length) {
    problems.push(`${flagCount} inline flag(s) in body but ${(draft.flaggedClaims || []).length} listed in flaggedClaims`);
  }
  return { ok: problems.length === 0, problems };
}

function normalize(raw, meeting, sources) {
  const title = (raw && raw.title) || meeting.title;
  return {
    slug: `${meeting.date}-${kebab(title)}`,
    title,
    dek: (raw && raw.dek) || '',
    bodyHtml: (raw && raw.bodyHtml) || '',
    citations: Array.isArray(raw && raw.citations) ? raw.citations : [],
    flaggedClaims: Array.isArray(raw && raw.flaggedClaims) ? raw.flaggedClaims : [],
    source: meeting.source,
    bodyLabel: SOURCE_LABELS[meeting.source] || meeting.source,
    meetingDate: meeting.date,
    meetingKey: `${meeting.source}|${meeting.date}|${meeting.title}`,
    // triage is carried so the decision page can show why it was drafted
    triage: meeting.triage || null,
  };
}

// PUBLIC. meeting = { source, date, title, summary, triage? }.
// opts.context = [{ text, body, url? }, …] extra sources from the loop.
async function writeDraft(meeting, opts = {}) {
  const triage = opts.triage || meeting.triage || null;
  const sources = buildSources(meeting, opts.context);
  const raw = await callDraft(meeting, triage, sources, opts);
  const draft = normalize(raw, Object.assign({}, meeting, { triage }), sources);
  draft.audit = auditCitations(draft, sources);
  return draft;
}

module.exports = { writeDraft, auditCitations, ARTICLE_SYSTEM_PROMPT, DRAFT_MODEL, SOURCE_LABELS };
