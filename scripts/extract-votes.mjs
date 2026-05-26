#!/usr/bin/env node
/**
 * extract-votes.mjs — semi-automated vote-tracker entry extractor.
 *
 * Usage:
 *   node scripts/extract-votes.mjs \
 *     --pdf  /path/to/minutes.pdf \
 *     --entity tomv \
 *     --date 2024-05-16 \
 *     [--asset-id 40000] \
 *     [--out scripts/pending/<auto>.json]
 *
 * Also accepts --text /path/to/already-extracted.txt to skip the PDF
 * step (useful when the PDF is scanned and you've already OCR'd it
 * separately, or when iterating on the prompt against a known text).
 *
 * Pipeline:
 *   1. Read PDF (pdfjs-dist) OR pre-extracted .txt
 *   2. Look up roster valid on --date from vote-tracker-config.json
 *   3. Call Claude API with a tool-use schema that forces structured
 *      JSON output — array of vote entries in the vote-tracker.html
 *      schema.
 *   4. Run deterministic validation:
 *        - every member id in `votes` exists in the roster
 *        - every roster member appears exactly once in `votes`
 *        - tally arithmetic matches yes/no/abstain/absent counts
 *        - outcome ∈ {Passed, Failed, Tabled, Continued}
 *        - id follows convention and is unique within the file
 *   5. Write to scripts/pending/<entity>-<date>.json
 *   6. Print a summary: N entries, M warnings, P errors
 *
 * The script DOES NOT insert into vote-tracker.html. Review the JSON
 * first, then run scripts/insert-votes.mjs (separate tool, not yet
 * built) to splice approved entries in.
 *
 * Requires ANTHROPIC_API_KEY in env.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import https from 'node:https';

const require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const CONFIG_PATH = join(__dirname, 'vote-tracker-config.json');
const PENDING_DIR = join(__dirname, 'pending');

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';

// ──────────────────────────── CLI parsing ───────────────────────────
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) { out[key] = true; }
      else { out[key] = next; i++; }
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args.help || (!args.pdf && !args.text) || !args.entity || !args.date) {
  console.log(`Usage: node scripts/extract-votes.mjs --pdf <path> --entity <tomv|bocc|pc> --date YYYY-MM-DD [--asset-id N] [--out path]
       node scripts/extract-votes.mjs --text <path> --entity <tomv|...> --date YYYY-MM-DD [...]`);
  process.exit(args.help ? 0 : 1);
}

if (!process.env.ANTHROPIC_API_KEY && !args['dry-run']) {
  console.error('ERROR: ANTHROPIC_API_KEY not set in environment (or pass --dry-run to skip the API call)');
  process.exit(2);
}

// ─────────────────────────── Config lookup ──────────────────────────
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const entity = config[args.entity];
if (!entity || !entity.rosters || entity.rosters.length === 0) {
  console.error(`ERROR: entity "${args.entity}" not configured or has empty rosters in ${CONFIG_PATH}`);
  process.exit(3);
}

function rosterForDate(rosters, isoDate) {
  for (const r of rosters) {
    const startOk = isoDate >= r.start;
    const endOk = r.end === null || isoDate <= r.end;
    if (startOk && endOk) return r.members;
  }
  return null;
}

const roster = rosterForDate(entity.rosters, args.date);
if (!roster) {
  console.error(`ERROR: no roster found for entity ${args.entity} on date ${args.date}`);
  console.error('Known roster ranges:', entity.rosters.map(r => `${r.start} → ${r.end || 'present'}`).join(', '));
  process.exit(4);
}

console.log(`Entity: ${entity.label}`);
console.log(`Date:   ${args.date}`);
console.log(`Roster: ${roster.join(', ')}`);

// ───────────────────────── PDF / text loading ───────────────────────
async function extractPdfText(pdfPath) {
  // pdfjs-dist v3 ships only a CommonJS build under legacy/; use
  // createRequire to load it from this .mjs file.
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
  } catch { /* worker auto-resolves in many packagings */ }

  const buffer = readFileSync(pdfPath);
  const data = new Uint8Array(buffer);
  const pdf = await pdfjsLib.getDocument({ data, disableFontFace: true, verbosity: 0 }).promise;
  const chunks = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      chunks.push(content.items.map((it) => it.str).join(' '));
    } catch (e) {
      console.warn(`  pdfjs page ${i} warning: ${e.message}`);
    }
  }
  return chunks.join('\n');
}

let minutesText;
if (args.text) {
  minutesText = readFileSync(args.text, 'utf8');
  console.log(`Loaded text from ${args.text} (${minutesText.length.toLocaleString()} chars)`);
} else {
  console.log(`Extracting text from PDF: ${args.pdf}`);
  minutesText = await extractPdfText(args.pdf);
  console.log(`Extracted ${minutesText.length.toLocaleString()} chars`);
}

if (minutesText.length < 500) {
  console.error('ERROR: extracted text is suspiciously short. PDF may be scanned (no text layer). Render to images and OCR separately, then re-run with --text.');
  process.exit(5);
}

// ───────────────────── Build the extraction prompt ──────────────────
const SCHEMA_EXAMPLE = `{
  "id": "mv2024-X1",
  "date": "2024-05-16",
  "year": 2024,
  "meeting": "Mountain Village Town Council — May 16, 2024",
  "minutesUrl": "https://townofmountainvillage.com/site/assets/files/40000/may_16-_2024_town_council_meeting_minutes.pdf",
  "title": "Short imperative-style title; flag splits/abstentions in title (e.g. '— SPLIT 5-2, Magid Opposed' or '— TABLED 5-0, Mogenson Abstaining')",
  "description": "1-3 sentence prose describing what was approved/denied/tabled, with conditions, amendments, dollar amounts, dates where present. NO motion-procedural language ('On a MOTION by...'); just the substantive outcome.",
  "tags": ["Land Use", "Zoning"],
  "outcome": "Passed",
  "tally": "7-0",
  "votes": { "prohaska":"Yes", "pearson":"Yes", "magid":"Yes", "mogenson":"Yes", "duprey":"Yes", "gomez":"Yes", "gilbride":"Yes" }
}`;

const SYSTEM_PROMPT = `You are extracting substantive Council vote entries from official meeting minutes for the ${entity.label}. You will be given the full minutes text and must identify every recorded vote that resulted in a substantive decision, then output them as structured JSON.

WHAT COUNTS AS A "SUBSTANTIVE VOTE":
- Ordinances (1st reading, 2nd reading, adoption)
- Resolutions
- Letters of support / opposition
- Intergovernmental Agreements
- Variances, CUPs, PUDs, code amendments
- Settlement agreements, contracts, MOUs
- Board/committee appointments and re-appointments
- Tabling motions (output as outcome:"Tabled")
- Major budget actions (financials approval, change orders, fund appropriations)

WHAT TO SKIP:
- Motions to go into / out of Executive Session
- Motions to convene/reconvene as Housing Authority or other boards (procedural)
- Motions to adjourn
- Routine meeting-minutes approval (UNLESS it's a Consent Agenda containing a substantive item — then capture the substantive item)
- Procedural moves (motion to move to next agenda item, etc.)

ROSTER FOR THIS MEETING DATE:
Valid member ids on ${args.date}: ${roster.map(id => `"${id}"`).join(', ')}

EVERY VOTE ENTRY MUST INCLUDE A VALUE FOR EVERY ID IN THE ROSTER. Use:
  - "Yes"      = voted in favor
  - "No"       = voted against
  - "Abstain"  = explicitly abstained (recorded in minutes)
  - "Absent"   = not in attendance, OR left before vote, OR recused
  - "Recused"  = explicit recusal recorded in minutes (preferred over Absent when clear)

CRITICAL RULES:
1. If a council member arrived late or left early, their votes during their absence are "Absent". Read the minutes carefully for arrival/departure timestamps.
2. "Council voted unanimously" with all roster members present = tally is N-0 where N is the number present. Members not present are "Absent".
3. "Council voted 5-2 (with X and Y dissenting)" — X and Y are "No", others present are "Yes".
4. "Council voted 5-0 (with Z abstaining)" — Z is "Abstain", tally is "5-0 (1 abstain)".
5. For tabled motions, set outcome:"Tabled", tally still reflects how members voted on the tabling motion.
6. The "tally" string should reflect Yes-No, then "(K abstain)" or "(K recused)" suffix if applicable. Examples: "7-0", "6-0", "5-2", "5-0 (1 abstain)", "4-1 (1 recused)".
7. The "id" field uses prefix "${entity.idPrefix}YYYY-" followed by a meeting-month-initial + a sequence number for the entries in that meeting. Use sensible single-letter initials (J=Jan, F=Feb, M=Mar, A=Apr, MY=May to avoid Mar clash, JN=Jun, JL=Jul, AU=Aug, S=Sep, O=Oct, N=Nov, D=Dec). When unsure, just use a 2-3 letter month code that's clearly distinct.
8. The "title" must surface split votes and abstentions: append "— SPLIT N-N, [Names] Opposed" or "— TABLED N-N, [Name] Abstaining" so a scanner can spot dissent without reading the description.
9. "tags" should be 1-4 short topic tags drawn from this vocabulary (or close synonyms): Land Use, Zoning, Building Code, Housing, Environment, Public Safety, Transportation, Intergovernmental, Charter, Elections, Governance, Budget, Boards & Commissions, Appointments, Liquor, Business Development, Regulation, Variance, PUD, Vested Rights, Open Space, Energy, Grants, Public Lands, Legal, Administrative, Recreation, Hospitality, Infrastructure, Gondola.
10. The "description" must NOT start with procedural language. Write what the council DID, not what was MOVED. Include: dollar amounts, dates set for follow-up readings, named conditions/amendments, dissent rationale if stated.

OUTPUT VIA THE record_votes TOOL. Do not output prose. Every vote in the minutes that meets the "substantive vote" definition above must appear in the array.`;

const SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      description: "Every substantive vote from the meeting, in the order they appear in the minutes.",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: `Format: ${entity.idPrefix}YYYY-<month-initial><N>, e.g. ${entity.idPrefix}2024-MY1 for the first vote on a May meeting.` },
          date: { type: "string", description: "ISO date YYYY-MM-DD" },
          year: { type: "integer" },
          meeting: { type: "string", description: `Format: "${entity.meetingPrefix} — <Month D, YYYY>"` },
          minutesUrl: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          outcome: { type: "string", enum: ["Passed", "Failed", "Tabled", "Continued"] },
          tally: { type: "string" },
          votes: {
            type: "object",
            description: `Object with one key per roster member id. Valid ids: ${roster.join(', ')}. Values: "Yes" | "No" | "Abstain" | "Absent" | "Recused".`,
            additionalProperties: { type: "string", enum: ["Yes", "No", "Abstain", "Absent", "Recused"] }
          }
        },
        required: ["id", "date", "year", "meeting", "minutesUrl", "title", "description", "tags", "outcome", "tally", "votes"]
      }
    }
  },
  required: ["entries"]
};

// Build the URL template
function fmtUrl() {
  if (!entity.urlTemplate) return '';
  const slug = (basename(args.pdf || '', '.pdf') || `${args.date}_minutes`).replace(/\s+/g, '_');
  return entity.urlTemplate
    .replace('{ASSET_ID}', args['asset-id'] || '40000')
    .replace('{SLUG}', slug);
}

const expectedUrl = fmtUrl();
const USER_PROMPT = `Meeting date: ${args.date}
Expected minutesUrl for these entries: ${expectedUrl}

Roster valid on this date: ${roster.join(', ')}

=== MINUTES TEXT BEGIN ===
${minutesText}
=== MINUTES TEXT END ===

Extract every substantive vote. Use the record_votes tool to return the JSON array.`;

// ─────────────────────────── Claude call ────────────────────────────
function callClaudeOnce() {
  const body = JSON.stringify({
    model: CLAUDE_MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: "record_votes",
        description: "Record the structured vote entries extracted from the meeting minutes.",
        input_schema: SCHEMA
      }
    ],
    tool_choice: { type: "tool", name: "record_votes" },
    messages: [{ role: "user", content: USER_PROMPT }]
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 120000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            const err = new Error(json.error.message || JSON.stringify(json.error));
            err.statusCode = res.statusCode;
            // Anthropic sets retry-after on 429 (sometimes; not always).
            // Also exposes a reset epoch in anthropic-ratelimit-*-reset headers.
            err.retryAfterSec = parseInt(res.headers['retry-after'] || '0', 10) || null;
            err.resetAt = res.headers['anthropic-ratelimit-input-tokens-reset'] || null;
            return reject(err);
          }
          const toolUse = (json.content || []).find(b => b.type === 'tool_use' && b.name === 'record_votes');
          if (!toolUse) return reject(new Error(`No tool_use block in response. Stop reason: ${json.stop_reason}. First content type: ${json.content?.[0]?.type}`));
          resolve({ entries: toolUse.input.entries, usage: json.usage });
        } catch (e) {
          reject(new Error(`Parse failed: ${e.message}\nRaw: ${data.slice(0, 500)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Claude API timeout')); });
    req.write(body);
    req.end();
  });
}

// Call with automatic retry on rate-limit (429). Anthropic returns
// either a retry-after header (in seconds) or an ISO timestamp in
// anthropic-ratelimit-input-tokens-reset. Falls back to 65s if both
// are missing (the bucket is per-minute, so 65s clears it).
async function callClaude() {
  const MAX_RETRIES = 4;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callClaudeOnce();
    } catch (e) {
      const isRateLimit = e.statusCode === 429 || /rate limit/i.test(e.message);
      if (!isRateLimit || attempt === MAX_RETRIES) throw e;

      let waitSec = e.retryAfterSec || 0;
      if (!waitSec && e.resetAt) {
        const resetMs = new Date(e.resetAt).getTime();
        waitSec = Math.max(5, Math.ceil((resetMs - Date.now()) / 1000) + 2);
      }
      if (!waitSec) waitSec = 65;

      console.log(`  ⚠ Rate-limited (attempt ${attempt}/${MAX_RETRIES}). Waiting ${waitSec}s before retry...`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
    }
  }
}

let entries, usage;
if (args['dry-run']) {
  console.log('\n[DRY RUN] Skipping Claude API call. Prompt would be:');
  console.log(`  system prompt: ${SYSTEM_PROMPT.length} chars`);
  console.log(`  user prompt:   ${USER_PROMPT.length} chars (minutes text included)`);
  console.log(`  model:         ${CLAUDE_MODEL}`);
  console.log(`  expected URL:  ${expectedUrl}`);
  console.log('\nPDF/text extraction OK. To run for real:');
  console.log('  export ANTHROPIC_API_KEY=sk-ant-...');
  console.log('  ' + process.argv.slice(1).filter(a => a !== '--dry-run').join(' '));
  process.exit(0);
}

console.log(`\nCalling Claude (${CLAUDE_MODEL})...`);
const t0 = Date.now();
({ entries, usage } = await callClaude());
const dt = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`✓ Received ${entries.length} entries in ${dt}s (in: ${usage?.input_tokens} tok, out: ${usage?.output_tokens} tok)`);

// ───────────────────── Deterministic validation ─────────────────────
const errors = [];
const warnings = [];

function tallyMath(tallyStr) {
  // Parse "7-0" or "5-0 (1 abstain)" or "4-1 (1 recused)"
  const m = tallyStr.match(/^(\d+)-(\d+)(?:\s*\((\d+)\s*(abstain|abstaining|recused)\))?/i);
  if (!m) return null;
  return {
    yes: parseInt(m[1], 10),
    no: parseInt(m[2], 10),
    extra: m[3] ? parseInt(m[3], 10) : 0,
    extraKind: m[4] ? m[4].toLowerCase().replace('ing', '') : null
  };
}

const seenIds = new Set();
entries.forEach((e, idx) => {
  const ctx = `entries[${idx}] (${e.id || '?'})`;

  // ID uniqueness
  if (!e.id) errors.push(`${ctx}: missing id`);
  else if (seenIds.has(e.id)) errors.push(`${ctx}: duplicate id "${e.id}" within this batch`);
  else seenIds.add(e.id);

  // ID prefix
  const expectedPrefix = `${entity.idPrefix}${args.date.slice(0, 4)}-`;
  if (e.id && !e.id.startsWith(expectedPrefix)) {
    warnings.push(`${ctx}: id "${e.id}" does not start with expected prefix "${expectedPrefix}"`);
  }

  // Date matches
  if (e.date !== args.date) warnings.push(`${ctx}: date "${e.date}" doesn't match --date ${args.date}`);
  if (e.year !== parseInt(args.date.slice(0, 4), 10)) warnings.push(`${ctx}: year ${e.year} doesn't match date`);

  // Outcome
  if (!['Passed', 'Failed', 'Tabled', 'Continued'].includes(e.outcome)) {
    errors.push(`${ctx}: invalid outcome "${e.outcome}"`);
  }

  // Roster coverage
  const voteKeys = Object.keys(e.votes || {});
  const expectedSet = new Set(roster);
  const actualSet = new Set(voteKeys);

  for (const m of roster) {
    if (!actualSet.has(m)) errors.push(`${ctx}: missing roster member "${m}" in votes`);
  }
  for (const k of voteKeys) {
    if (!expectedSet.has(k)) errors.push(`${ctx}: unknown member id "${k}" in votes (not in roster)`);
  }

  // Vote value validity
  for (const [k, v] of Object.entries(e.votes || {})) {
    if (!['Yes', 'No', 'Abstain', 'Absent', 'Recused'].includes(v)) {
      errors.push(`${ctx}: invalid vote value "${v}" for member "${k}"`);
    }
  }

  // Tally arithmetic
  const t = tallyMath(e.tally);
  if (!t) {
    warnings.push(`${ctx}: tally "${e.tally}" doesn't match expected format`);
  } else {
    const counts = { Yes: 0, No: 0, Abstain: 0, Absent: 0, Recused: 0 };
    for (const v of Object.values(e.votes || {})) {
      if (v in counts) counts[v]++;
    }
    if (counts.Yes !== t.yes) errors.push(`${ctx}: tally says ${t.yes} yes but votes object has ${counts.Yes}`);
    if (counts.No !== t.no) errors.push(`${ctx}: tally says ${t.no} no but votes object has ${counts.No}`);
    if (t.extra > 0) {
      const expectExtra = t.extraKind === 'abstain' ? counts.Abstain : counts.Recused;
      if (t.extra !== expectExtra) {
        errors.push(`${ctx}: tally says ${t.extra} ${t.extraKind} but votes object has ${expectExtra}`);
      }
    }
  }

  // Description sanity
  if (e.description && /^On a MOTION by/i.test(e.description)) {
    warnings.push(`${ctx}: description starts with procedural "On a MOTION by..." — should describe the substantive outcome instead`);
  }
  if (e.description && e.description.length < 30) {
    warnings.push(`${ctx}: description very short (${e.description.length} chars) — verify`);
  }
});

// ─────────────────────────── Write output ──────────────────────────
if (!existsSync(PENDING_DIR)) mkdirSync(PENDING_DIR, { recursive: true });
const outPath = args.out || join(PENDING_DIR, `${args.entity}-${args.date}.json`);
const payload = {
  entity: args.entity,
  entityLabel: entity.label,
  date: args.date,
  rosterUsed: roster,
  source: args.text ? `text:${args.text}` : `pdf:${args.pdf}`,
  generatedAt: new Date().toISOString(),
  model: CLAUDE_MODEL,
  usage,
  validation: { errors, warnings },
  entries
};
writeFileSync(outPath, JSON.stringify(payload, null, 2));

// ─────────────────────────── Summary ──────────────────────────────
console.log(`\n────── Validation summary ──────`);
console.log(`Entries:   ${entries.length}`);
console.log(`Errors:    ${errors.length}`);
console.log(`Warnings:  ${warnings.length}`);
if (errors.length) {
  console.log('\nERRORS:');
  errors.forEach(e => console.log('  ✗ ' + e));
}
if (warnings.length) {
  console.log('\nWARNINGS:');
  warnings.forEach(w => console.log('  ⚠ ' + w));
}
console.log(`\nOutput: ${outPath}`);
console.log(`\nNext steps:`);
console.log(`  1. Review ${outPath}`);
console.log(`  2. Spot-check splits/abstentions against the source minutes`);
console.log(`  3. If OK, run insert-votes.mjs to splice into v2/vote-tracker.html`);
console.log(`     (insert-votes.mjs not yet built — manual splice for now)`);

process.exit(errors.length > 0 ? 1 : 0);
