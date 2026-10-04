// Past-meeting recaps in the weekly email, filtered by the reader's region.
//
// Customer.io stores the reader's region as customer.region (profile form
// field MMERGE6): "East End", "West End", "Ridgway/Ouray", or blank. The
// broadcast template does NOT render Liquid inside trigger.body, so the email
// carries every variant and the template picks one (see REGION_MARK below and
// docs/customerio-regional-recaps.md). Blank / unknown region → the ALL list.
//
// Region membership per Morgan 2026-09-30. SMART and San Miguel County serve
// both ends of the county. Fire (Telluride Fire Protection District) wasn't in
// Morgan's list; it serves Telluride/Mountain Village, so it rides with East End.
const RECAP_REGIONS = {
  'East End': ['telluride', 'mv', 'school', 'smart', 'airport', 'med', 'county', 'ophir', 'fire'],
  'West End': ['norwood', 'smart', 'county'],
  'Ridgway/Ouray': ['ouraycity', 'ouray', 'ridgway'],
};
// Upcoming "Public Meetings This Week" use the same map, plus Rico in the East
// End (Morgan 2026-09-30: Ophir and Rico are East End for future meetings,
// though Rico stays off the past-meeting recap lists).
const MEETING_REGIONS = Object.assign({}, RECAP_REGIONS, {
  'East End': RECAP_REGIONS['East End'].concat(['rico']),
});
// Never in the emailed recap lists (still shown on gov-hub-past.html).
const RECAP_EMAIL_EXCLUDE = new Set(['rico', 'tmvoa']);

// Delimiter the Customer.io template splits trigger.body on. Each regional
// section is  MARK all MARK hidden(East) MARK hidden(West) MARK hidden(Ridgway/Ouray) MARK,
// so with k sections the body splits into 5k+1 parts: part i is shared email
// chrome when i % 5 == 0, else the ALL (1), East (2), West (3) or
// Ridgway/Ouray (4) copy of a section. The template keeps the chrome plus the
// reader's copy of every section. See docs/customerio-regional-recaps.md.
const REGION_MARK = '<!--LT-RGN-->';
// Regional variants ship hidden so an email rendered WITHOUT the template's
// region logic (test sends, previews, the blog archive) shows only the ALL list.
// The template strips these two wrappers from the variant it picks.
const HIDE_OPEN = '<!--[if !mso]><!--><tbody style="display:none;">';
const HIDE_CLOSE = '</tbody><!--<![endif]-->';

// Same anchor gov-hub-past.html puts on each recap card.
function recapId(r) {
  const slug = String(r.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return 'r-' + (r.sourceKey || 'x') + '-' + (r.date || '') + (slug ? '-' + slug : '');
}

// First sentence or two, ~230 chars — the email teaser; the page has the rest.
function shortRecap(text, max = 230) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  // A sentence may contain . ! ? that aren't followed by a space ("$1.5–1.6
  // million", "U.S."); only punctuation followed by a space or the end ends
  // it. The old [^.!?]+ form skipped any sentence with a decimal in it, so the
  // teaser began mid-figure ("6 million general fund deficit." — 2026-10-04).
  const sents = t.match(/(?:[^.!?]|[.!?](?!\s|$))+[.!?]+(?=\s|$)/g) || [t];
  let out = '';
  for (const s of sents) {
    if (out && (out + s).length > max) break;
    out += s;
  }
  out = out.trim() || t;
  if (out.length > max + 30) out = out.slice(0, max).replace(/\s+\S*$/, '') + '…';
  return out;
}

// The five business days (Mon–Fri) immediately before weekStart (YYYY-MM-DD),
// i.e. last week's workweek — Morgan 2026-09-30. Returns [first, last] dates.
function priorBusinessWeek(weekStart) {
  const days = [];
  const d = new Date(weekStart + 'T12:00:00Z');
  while (days.length < 5) {
    d.setUTCDate(d.getUTCDate() - 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) days.push(d.toISOString().slice(0, 10));
  }
  return [days[4], days[0]];
}

// Recaps from last week's five business days, newest first, minus the email
// exclusions.
function recapsForWeek(recaps, weekStart) {
  const [s, e] = priorBusinessWeek(weekStart);
  return (recaps || [])
    .filter((r) => r && r.date >= s && r.date <= e && r.recap && !RECAP_EMAIL_EXCLUDE.has(r.sourceKey))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

function recapsForRegion(recaps, region) {
  const keys = RECAP_REGIONS[region];
  return keys ? recaps.filter((r) => keys.includes(r.sourceKey)) : recaps;
}


// Region order inside each block — the template's part offsets 2, 3, 4.
const REGION_ORDER = ['East End', 'West End', 'Ridgway/Ouray'];

// One regional block: the ALL copy visible, each region's copy hidden.
function regionBlock(allHtml, byRegion) {
  return REGION_MARK + allHtml +
    REGION_ORDER.map((g) => REGION_MARK + HIDE_OPEN + (byRegion[g] || allHtml) + HIDE_CLOSE).join('') +
    REGION_MARK;
}

// Region for a "What to Attend" event: its location or title first, then the
// source feed's name. Anything unplaced is a Telluride-area listing (the
// email's town label defaults to Telluride too). Rico → null (no region).
function eventRegion(e) {
  const lt = ((e.location || '') + ' ' + (e.title || '')).toLowerCase();
  const src = String(e.source || '').toLowerCase();
  if (/\bnorwood\b|\bnucla\b|\bnaturita\b|\bredvale\b|\bparadox\b|\begnar\b/.test(lt)) return 'West End';
  if (/\bridgway\b|\bouray\b/.test(lt)) return 'Ridgway/Ouray';
  if (/\brico\b/.test(lt)) return null;
  if (/telluride|mountain village|\bophir\b|placerville|sawpit/.test(lt)) return 'East End';
  if (/norwood|nucla|naturita/.test(src)) return 'West End';
  if (/ouray|ridgway|sherbino|\boray\b/.test(src)) return 'Ridgway/Ouray';
  if (/\brico\b/.test(src)) return null;
  return 'East End';
}

module.exports = { RECAP_REGIONS, MEETING_REGIONS, RECAP_EMAIL_EXCLUDE, REGION_MARK, HIDE_OPEN, HIDE_CLOSE, recapId, shortRecap, priorBusinessWeek, recapsForWeek, recapsForRegion, REGION_ORDER, regionBlock, eventRegion };
