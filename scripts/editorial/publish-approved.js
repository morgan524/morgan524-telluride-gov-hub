#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Editorial layer · PUBLISH BRIDGE — publish-approved.js
// ════════════════════════════════════════════════════════════════════
//
// The pull side of the human gate. Runs on a schedule; asks the Worker for
// drafts you've APPROVED (status=='approved') and turns each into a live page.
//
// Two phases so a draft is only marked "published" after its page is actually
// committed (avoids a published flag pointing at a page that never landed):
//
//   node publish-approved.js          # phase 1: generate pages + update
//                                     #   data/published-articles.json, record
//                                     #   ids to .just-published.json
//   <workflow commits & pushes>
//   node publish-approved.js --mark   # phase 2: POST /article-published per id
//
// Env: EDITORIAL_SECRET, EDITORIAL_WORKER (optional override).

const fs = require('fs');
const path = require('path');
const { REPO_ROOT, WORKER_DEFAULT, httpJson, renderArticlePage } = require('./lib.js');

const WORKER = process.env.EDITORIAL_WORKER || WORKER_DEFAULT;
const SECRET = process.env.EDITORIAL_SECRET || '';
const MARK = process.argv.includes('--mark');

const PUBLISHED_JSON = path.join(REPO_ROOT, 'data', 'published-articles.json');
const JUST_PUBLISHED = path.join(__dirname, '.just-published.json');

function readJson(p, fallback) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } }

async function phaseMark() {
  const ids = readJson(JUST_PUBLISHED, []);
  if (!ids.length) { console.log('  Nothing to mark.'); return; }
  let ok = 0;
  for (const id of ids) {
    try { const r = await httpJson('POST', `${WORKER}/article-published`, { secret: SECRET, id });
      if (r.json && r.json.ok) ok++; else console.log(`  ✗ mark failed for ${id}: ${(r.json && r.json.msg) || r.status}`); }
    catch (e) { console.log(`  ✗ mark error for ${id}: ${e.message}`); }
  }
  console.log(`  Marked ${ok}/${ids.length} published.`);
  try { fs.unlinkSync(JUST_PUBLISHED); } catch {}
}

async function phaseGenerate() {
  if (!SECRET) { console.error('  ✗ EDITORIAL_SECRET not set'); process.exit(1); }
  const res = await httpJson('GET', `${WORKER}/article-pending-publish?secret=${encodeURIComponent(SECRET)}`);
  if (!res.json || !res.json.ok) { console.error(`  ✗ could not list approved drafts: ${(res.json && res.json.msg) || res.status}`); process.exit(1); }
  const drafts = res.json.drafts || [];
  console.log(`\n  ${drafts.length} approved draft(s) to publish.`);
  if (!drafts.length) { fs.writeFileSync(JUST_PUBLISHED, '[]'); return; }

  const index = readJson(PUBLISHED_JSON, {});
  const justPublished = [];

  for (const draft of drafts) {
    const slug = draft.slug || draft.id;
    const dir = path.join(REPO_ROOT, 'meetings', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), renderArticlePage(draft));
    const url = `/meetings/${slug}/`;
    // Keyed by meetingKey so the gov-hub card + weekly summary can show a
    // "Full article →" button for exactly that meeting.
    if (draft.meetingKey) {
      index[draft.meetingKey] = {
        url, title: draft.editedTitle || draft.title || '', dek: draft.editedDek || draft.dek || '',
        publishedAt: new Date().toISOString().slice(0, 10),
      };
    }
    justPublished.push(draft.id);
    console.log(`  ✓ generated  ${url}  (${draft.editedTitle || draft.title || draft.id})`);
  }

  fs.mkdirSync(path.dirname(PUBLISHED_JSON), { recursive: true });
  fs.writeFileSync(PUBLISHED_JSON, JSON.stringify(index, null, 2) + '\n');
  fs.writeFileSync(JUST_PUBLISHED, JSON.stringify(justPublished));
  console.log(`  Updated ${path.relative(REPO_ROOT, PUBLISHED_JSON)} and wrote ${justPublished.length} page(s).`);
  console.log('  Commit these, then run with --mark to flip Firestore status to published.\n');
}

(MARK ? phaseMark() : phaseGenerate()).catch((e) => { console.error(e); process.exit(1); });
