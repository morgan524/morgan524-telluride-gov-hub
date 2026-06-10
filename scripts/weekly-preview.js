#!/usr/bin/env node
/**
 * weekly-preview.js — render the upcoming weekly email as an HTML preview.
 *
 * Reads feed.xml (built by build-rss-feed.js — the SAME source Mailchimp's
 * Friday campaign sends from) and renders it as a review email. Run by
 * .github/workflows/weekly-preview.yml every THURSDAY; the workflow emails
 * the output to info@livabletelluride.org so the team can review/edit the
 * "Week Ahead" lede before Friday's send.
 *
 * Output: writes weekly-preview.html to the path in argv[2] (default
 * ./weekly-preview.html). Prints nothing sensitive.
 *
 * To edit before send: drop the corrected lede into
 * data/week-ahead-override.json ({ "weekKey": "<YYYY-Wn>", "lede": "..." });
 * build-rss-feed.js's applyWeekAhead() uses it instead of the AI lede.
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..');
const FEED = path.join(REPO_ROOT, 'feed.xml');
const OUT = process.argv[2] || path.join(REPO_ROOT, 'weekly-preview.html');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function field(item, tag) {
  const m = item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return '';
  return m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim();
}
function unescapeXml(s) {
  return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function main() {
  if (!fs.existsSync(FEED)) {
    console.error('weekly-preview: feed.xml not found — run build-rss-feed.js first.');
    process.exit(1);
  }
  const xml = fs.readFileSync(FEED, 'utf8');
  const items = (xml.match(/<item>[\s\S]*?<\/item>/g) || []).map((it) => ({
    title: unescapeXml(field(it, 'title')),
    desc: unescapeXml(field(it, 'description')),
    link: field(it, 'link'),
  }));

  const ledeItem = items.find((i) => /^📅 The Week Ahead/.test(i.title));
  const meetings = items.filter((i) => /^⚡?\s*\[Meeting\]/.test(i.title));
  const events = items.filter((i) => /^\[(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/.test(i.title));

  const rangeMatch = ledeItem ? ledeItem.title.replace('📅 The Week Ahead — ', '') : '';

  const meetingHtml = meetings.map((m) => {
    const notable = /⚡/.test(m.title);
    const title = esc(m.title.replace(/^⚡\s*/, '').replace(/^\[Meeting\]\s*/, ''));
    const body = esc(m.desc).replace(/\n+/g, '<br>');
    return `<div style="padding:13px 0;border-top:1px solid #eef1ee;${notable ? 'background:linear-gradient(180deg,rgba(198,148,55,0.08),rgba(198,148,55,0));border-left:4px solid #c69437;padding-left:12px;' : ''}">
      ${notable ? '<div style="display:inline-block;font-size:0.66rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#fff;background:#b45309;padding:2px 8px;border-radius:6px;margin-bottom:4px;">⚡ Notable</div>' : ''}
      <div style="font-size:1.02rem;font-weight:700;color:#21302b;">${title}</div>
      <div style="font-size:0.86rem;color:#5a6b64;margin-top:3px;line-height:1.5;">${body}</div>
    </div>`;
  }).join('');

  const eventHtml = events.map((e) => {
    const m = e.title.match(/^\[([^\]]+)\]\s*(.*)$/);
    const when = m ? esc(m[1]) : '';
    const title = m ? esc(m[2]) : esc(e.title);
    const body = esc(e.desc).split('\n').filter(Boolean).slice(0, 2).join(' · ');
    return `<div style="padding:13px 0;border-top:1px solid #eef1ee;">
      <div style="font-size:0.74rem;font-weight:800;color:#2f7a5f;">${when}</div>
      <div style="font-size:1.02rem;font-weight:700;color:#21302b;margin-top:2px;">${title}</div>
      <div style="font-size:0.84rem;color:#6b7a74;margin-top:3px;">${esc(body)}</div>
    </div>`;
  }).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#eef1ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#21302b;">
<div style="max-width:620px;margin:0 auto;background:#fff;">
  <div style="background:#b45309;color:#fff;padding:10px 26px;font-size:0.82rem;font-weight:700;">
    REVIEW DRAFT — this is Friday's email. Reply to info@livabletelluride.org with any edits to the "Week Ahead" lede by Friday morning.
  </div>
  <div style="background:#21443c;color:#fff;padding:22px 26px;">
    <div style="font-size:0.72rem;letter-spacing:0.16em;text-transform:uppercase;opacity:0.8;">Livable Telluride · Weekly Update</div>
    <div style="margin-top:4px;font-family:Georgia,serif;font-size:1.5rem;font-weight:700;">The Week Ahead — ${esc(rangeMatch)}</div>
  </div>
  ${ledeItem ? `<div style="padding:22px 26px 6px;">
    <span style="display:inline-block;font-size:0.7rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#2f7a5f;background:rgba(47,122,95,0.10);padding:3px 9px;border-radius:999px;">📅 The Week Ahead</span>
    <p style="margin:10px 0 0;font-size:1.04rem;line-height:1.6;color:#2c3b35;">${esc(ledeItem.desc)}</p>
  </div>` : '<div style="padding:22px 26px;color:#b44b3c;">No "Week Ahead" lede in the feed yet (the 6-hour build may not have generated it).</div>'}
  ${meetings.length ? `<div style="padding:24px 26px 0;font-size:0.74rem;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#7a8a85;">Upcoming meetings</div><div style="padding:0 26px;">${meetingHtml}</div>` : ''}
  ${events.length ? `<div style="padding:24px 26px 0;font-size:0.74rem;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#7a8a85;">Events this week</div><div style="padding:0 26px;">${eventHtml}</div>` : ''}
  <div style="padding:22px 26px 28px;font-size:0.8rem;color:#9aa7a1;">
    ${meetings.length + events.length} items · sends Friday to the Weekly Update group. To change the lede, reply with the corrected text.
  </div>
</div></body></html>`;

  fs.writeFileSync(OUT, html);
  const subjectDate = rangeMatch || new Date().toISOString().slice(0, 10);
  console.log(`weekly-preview: wrote ${OUT} (${meetings.length} meetings, ${events.length} events, lede=${ledeItem ? 'yes' : 'no'})`);
  // Emit a subject line for the workflow to consume.
  console.log(`SUBJECT=Weekly email preview — ${subjectDate} (review by Fri AM)`);
}

main();
