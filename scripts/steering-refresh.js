#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * Telluride Gov Hub — Steering Committee Roster Refresh
 * Runs weekly via GitHub Actions (steering-refresh.yml)
 *
 * Syncs STEERING_MEMBERS (js/gov-helpers.js) to the current membership of
 * the steering@livabletelluride.org Google Group, so /steering.html always
 * shows who's actually on the list — no hand-editing when someone joins or
 * leaves.
 *
 * Auth: a Google Cloud service account with domain-wide delegation,
 * authorized in the Workspace Admin console for the
 * admin.directory.group.member.readonly + admin.directory.user.readonly
 * scopes, impersonating a real Workspace admin. See docs/operations.md for
 * the one-time setup — this script no-ops (not a failure) until
 * GOOGLE_ADMIN_SA_KEY / GOOGLE_ADMIN_IMPERSONATE_EMAIL are set.
 *
 * PRIVACY: only display NAMES are ever written to this (public) repo.
 * Member email addresses are used in-memory to look up a name and then
 * discarded — never committed, never mirrored. A member whose name can't be
 * resolved automatically (an external, non-Workspace address — the normal
 * case for a volunteer committee) needs an entry in the
 * STEERING_NAME_OVERRIDES secret (also email-keyed, also never committed),
 * or falls back to a guess derived from their email's local part, logged so
 * it gets noticed and fixed.
 * ══════════════════════════════════════════════════════════════
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { assertParses } = require('./lib/write-guard.js');
const { writeMirror } = require('./lib/json-mirror.js');
const { extractJsArray } = require('./lib/extract.js');
const { spliceConst, replaceConstStringStrict } = require('./lib/replace.js');

const REPO_ROOT = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..');
const GOV_HELPERS_JS = path.join(REPO_ROOT, 'js', 'gov-helpers.js');
const GROUP_EMAIL = 'steering@livabletelluride.org';
const SCOPES = [
  'https://www.googleapis.com/auth/admin.directory.group.member.readonly',
  'https://www.googleapis.com/auth/admin.directory.user.readonly',
];

function today() {
  return new Date().toISOString().split('T')[0];
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Signs a domain-wide-delegation JWT and exchanges it for an access token.
// No googleapis dependency — this is the entire OAuth surface we need, and
// hand-signing with Node's built-in crypto keeps a weekly cron job from
// pulling in a multi-MB client library for two REST calls.
async function getAccessToken(saKey, impersonate) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: saKey.client_email,
    sub: impersonate,
    scope: SCOPES.join(' '),
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claims));
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), saKey.private_key);
  const jwt = unsigned + '.' + base64url(signature);

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Google OAuth token exchange failed: ${resp.status} ${JSON.stringify(data)}`);
  return data.access_token;
}

async function listGroupMembers(accessToken, groupKey) {
  const members = [];
  let pageToken = '';
  do {
    const url = new URL(`https://admin.googleapis.com/admin/directory/v1/groups/${encodeURIComponent(groupKey)}/members`);
    url.searchParams.set('maxResults', '200');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await resp.json();
    if (!resp.ok) throw new Error(`Group members.list failed: ${resp.status} ${JSON.stringify(data)}`);
    members.push(...(data.members || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return members;
}

// Only resolves for accounts inside the livabletelluride.org Workspace — an
// external member (personal Gmail, etc.) 403s/404s here by design; that's
// expected, not an error, so the caller falls back rather than throwing.
async function resolveWorkspaceName(accessToken, email) {
  const resp = await fetch(`https://admin.googleapis.com/admin/directory/v1/users/${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return (data.name && data.name.fullName) || null;
}

function guessNameFromEmail(email) {
  const local = String(email).split('@')[0];
  const words = local.split(/[._+-]+/).filter(Boolean);
  if (!words.length) return email;
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

async function main() {
  const rawKey = process.env.GOOGLE_ADMIN_SA_KEY;
  const impersonate = process.env.GOOGLE_ADMIN_IMPERSONATE_EMAIL;
  if (!rawKey || !impersonate) {
    console.warn('GOOGLE_ADMIN_SA_KEY / GOOGLE_ADMIN_IMPERSONATE_EMAIL not set — steering sync not configured yet, skipping (not a failure). See docs/operations.md.');
    return;
  }

  let saKey;
  try { saKey = JSON.parse(rawKey); }
  catch (e) { throw new Error(`GOOGLE_ADMIN_SA_KEY is not valid JSON: ${e.message}`); }

  let overrides = {};
  if (process.env.STEERING_NAME_OVERRIDES) {
    try { overrides = JSON.parse(process.env.STEERING_NAME_OVERRIDES); }
    catch (e) { console.warn(`STEERING_NAME_OVERRIDES is not valid JSON, ignoring it this run: ${e.message}`); }
  }
  const overridesLower = {};
  for (const [k, v] of Object.entries(overrides)) overridesLower[String(k).toLowerCase()] = v;

  console.log(`\n🧭 Syncing ${GROUP_EMAIL} membership...`);
  const accessToken = await getAccessToken(saKey, impersonate);
  const members = await listGroupMembers(accessToken, GROUP_EMAIL);
  console.log(`  Found ${members.length} member record(s) on the group.`);

  const names = [];
  const unresolved = [];
  for (const m of members) {
    if (m.status && m.status !== 'ACTIVE') continue;
    if (m.type === 'GROUP') { console.warn(`  Nested group member skipped (not expanded): ${m.email}`); continue; }
    const email = String(m.email || '').toLowerCase();
    if (!email) continue;
    let name = overridesLower[email];
    if (!name) name = await resolveWorkspaceName(accessToken, email);
    if (!name) { name = guessNameFromEmail(email); unresolved.push(email); }
    names.push(name);
  }
  if (unresolved.length) {
    console.warn(`  ${unresolved.length} member(s) had no resolvable Workspace name (external account) — guessed from email; add a real name to the STEERING_NAME_OVERRIDES secret to fix:\n    ` + unresolved.join('\n    '));
  }

  const uniqueSorted = [...new Set(names)].sort((a, b) => a.localeCompare(b));

  const src = fs.readFileSync(GOV_HELPERS_JS, 'utf8');
  const existing = extractJsArray(src, 'STEERING_MEMBERS') || [];

  if (JSON.stringify(uniqueSorted) === JSON.stringify(existing)) {
    console.log(`✓ No change — ${uniqueSorted.length} steering member(s), same as last sync.`);
    return;
  }

  let updated = spliceConst(src, 'STEERING_MEMBERS', `const STEERING_MEMBERS = ${JSON.stringify(uniqueSorted, null, 2)};`, false);
  updated = replaceConstStringStrict(updated, 'STEERING_LAST_SYNCED', today());
  assertParses('gov-helpers.js', updated);
  fs.writeFileSync(GOV_HELPERS_JS, updated, 'utf8');
  writeMirror('STEERING_MEMBERS', uniqueSorted, path.join(REPO_ROOT, 'data'));

  console.log(`✅ STEERING_MEMBERS updated: ${existing.length} → ${uniqueSorted.length} member(s).`);
}

main().catch(err => {
  console.error('\n✗ Fatal error:', err.message);
  process.exit(1);
});
