#!/usr/bin/env node
/**
 * Extract data-only consts and pure helper functions from js/gov-hub.js
 * into js/data-only.js. v2 pages load data-only.js INSTEAD of gov-hub.js,
 * avoiding the top-level DOM-touching code in gov-hub.js (subscribeForm,
 * sidebarReset, etc.) that throws on v2 pages without the live single-page
 * DOM.
 *
 * Run by:
 *   node scripts/extract-data-only.js
 *
 * Auto-invoked at the end of scripts/content-refresh.js so the bot keeps
 * data-only.js in sync with gov-hub.js on every 6h refresh.
 */

const fs = require('fs');
const path = require('path');

const GOV_HUB_PATH = path.join(__dirname, '..', 'js', 'gov-hub.js');
const DATA_ONLY_PATH = path.join(__dirname, '..', 'js', 'data-only.js');

/**
 * What to extract. Each entry is one named top-level declaration.
 *   - 'const' = `const NAME = [...]` or `const NAME = {...}` (balanced braces)
 *   - 'function' = `function NAME(...) {...}` (balanced braces)
 */
const TARGETS = [
  // ── Pure helpers ──
  { kind: 'function', name: 'truncate' },
  { kind: 'function', name: 'localDate' },
  { kind: 'function', name: 'isBadSummary' },   // referenced by getMeetingSummary
  // ── Bot-updated data consts ──
  { kind: 'const',    name: 'MANUAL_SUMMARIES' },
  { kind: 'const',    name: 'TELLURIDE_TIMES_ARTICLES' },
  { kind: 'const',    name: 'KOTO_NEWSCASTS' },
  { kind: 'const',    name: 'KOTO_FEATURED_STORIES' },
  { kind: 'const',    name: 'BLOG_POSTS' },
  { kind: 'const',    name: 'COMMUNITY_EVENTS' },
  { kind: 'const',    name: 'KOTO_COMMUNITY_EVENTS' },
  { kind: 'const',    name: 'WILKINSON_EVENTS' },
  { kind: 'const',    name: 'HUMANE_SOCIETY_ANIMALS' },
  { kind: 'const',    name: 'TELLURIDE_FOUNDATION_EVENTS' },
  { kind: 'const',    name: 'OURAY_COUNTY_EVENTS' },
  { kind: 'const',    name: 'OURAY_RIDGWAY_EVENTS' },
  // ── Additional event arrays the bot populates (added 2026-05-15 when
  //    events.html was wired to read these too). If the bot ever stops
  //    populating one of these (and the const becomes []), the events
  //    page just shows fewer cards — no error. ──
  { kind: 'const',    name: 'NORWOOD_EVENTS' },
  { kind: 'const',    name: 'MOUNTAIN_VILLAGE_EVENTS' },
  { kind: 'const',    name: 'TELLURIDE_COM_EVENTS' },
  { kind: 'const',    name: 'PAPER_LOGOS' },
  { kind: 'const',    name: 'LEGAL_ENTITY_LOGOS' },
  { kind: 'const',    name: 'LEGAL_NOTICES' },
  { kind: 'const',    name: 'HOUSING_LISTINGS' },
  // ── Ridgway agenda PDF map (bot-populated every 6h by syncRidgwayAgendas) ──
  { kind: 'const',    name: 'RIDGWAY_AGENDA_MAP' },
  // ── Pure get*Meetings normalization functions ──
  { kind: 'function', name: 'getCountyCachedMeetings' },
  { kind: 'function', name: 'getMVMeetings' },
  { kind: 'function', name: 'getSchoolMeetings' },
  { kind: 'function', name: 'getFireMeetings' },
  { kind: 'function', name: 'getMedMeetings' },
  { kind: 'function', name: 'getNorwoodMeetings' },
  { kind: 'function', name: 'getOphirMeetings' },
  { kind: 'function', name: 'getAirportMeetings' },
  { kind: 'function', name: 'getSmartMeetings' },
  { kind: 'function', name: 'getTownAgendaLink' },
  { kind: 'function', name: 'getTellurideMeetings' },
  { kind: 'function', name: 'getMeetingSummary' },
];

/**
 * Find the closing position of a balanced [...] or {...} block starting at
 * `openIdx` (which must point at the opening bracket).
 */
function findBalancedClose(src, openIdx) {
  const open = src[openIdx];
  const close = open === '[' ? ']' : open === '{' ? '}' : open === '(' ? ')' : null;
  if (!close) throw new Error(`Not a bracket at ${openIdx}: ${open}`);
  let depth = 0;
  let inStr = null;        // null | '"' | "'" | '`'
  let escape = false;
  let inLineComment = false;
  let inBlockComment = false;
  let inRegex = false;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    const c2 = src[i+1] || '';
    // String/comment/regex tracking
    if (inLineComment)  { if (c === '\n') inLineComment = false; continue; }
    if (inBlockComment) { if (c === '*' && c2 === '/') { inBlockComment = false; i++; } continue; }
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (inRegex) {
      if (escape) { escape = false; continue; }
      if (c === '\\') { escape = true; continue; }
      if (c === '/') inRegex = false;
      continue;
    }
    if (c === '/' && c2 === '/') { inLineComment = true; i++; continue; }
    if (c === '/' && c2 === '*') { inBlockComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    // Bracket tracking
    if (c === open)  depth++;
    if (c === close) { depth--; if (depth === 0) return i; }
  }
  throw new Error(`Unbalanced ${open} starting at ${openIdx}`);
}

function extractConst(src, name) {
  // Match `^const NAME = (anything starting with [ or { or expression)`
  const re = new RegExp(`^const\\s+${name}\\s*=\\s*`, 'm');
  const m = src.match(re);
  if (!m) return null;
  const start = m.index;
  const valueStart = m.index + m[0].length;
  // Value should start with [ or { (data structure)
  const firstChar = src[valueStart];
  if (firstChar !== '[' && firstChar !== '{') {
    // Fallback: take through next semicolon at column 0 (single-line const)
    const semi = src.indexOf('\n', valueStart);
    return src.slice(start, semi + 1);
  }
  const closeIdx = findBalancedClose(src, valueStart);
  // Include trailing semicolon
  let end = closeIdx + 1;
  while (end < src.length && src[end] !== ';') end++;
  return src.slice(start, end + 1);
}

function extractFunction(src, name) {
  const re = new RegExp(`^function\\s+${name}\\s*\\(`, 'm');
  const m = src.match(re);
  if (!m) return null;
  const start = m.index;
  // Find the opening brace of the function body
  const parenOpen = src.indexOf('(', start);
  const parenClose = findBalancedClose(src, parenOpen);
  // Find { after the parens
  let i = parenClose + 1;
  while (i < src.length && src[i] !== '{') i++;
  const closeIdx = findBalancedClose(src, i);
  return src.slice(start, closeIdx + 1);
}

// ── Run ──
const src = fs.readFileSync(GOV_HUB_PATH, 'utf8');
const blocks = [];
const missing = [];

for (const t of TARGETS) {
  const ext = t.kind === 'const' ? extractConst(src, t.name) : extractFunction(src, t.name);
  if (!ext) {
    missing.push(t.name);
    continue;
  }
  blocks.push(ext);
}

if (missing.length) {
  console.warn('Could not extract:', missing.join(', '));
}

const HEADER = `/* AUTO-GENERATED by scripts/extract-data-only.js — DO NOT EDIT.
 *
 * Pulls data-only consts and pure helper functions out of gov-hub.js so
 * v2 pages can load them without dragging in the legacy single-page DOM
 * code that throws on /v2/ (subscribeForm, sidebarReset, etc.).
 *
 * gov-hub.js is the source of truth; the content-refresh bot regenerates
 * this file every 6 hours. To add or remove an export, edit the TARGETS
 * list in scripts/extract-data-only.js.
 *
 * This file requires gov-data.js to be loaded FIRST (depends on
 * COUNTY_CACHED_DATA, MV_CACHED_DATA, COUNTY_CIVICCLERK_BASE, etc.).
 */

`;

fs.writeFileSync(DATA_ONLY_PATH, HEADER + blocks.join('\n\n') + '\n');
console.log(`Wrote ${DATA_ONLY_PATH} — ${blocks.length} blocks, ${(HEADER + blocks.join('\n\n')).length} chars.`);
