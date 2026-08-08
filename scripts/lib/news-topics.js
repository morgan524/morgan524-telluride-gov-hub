'use strict';

// Topic tagging for news items.
//
// This was a first-match-wins cascade of unanchored substrings, which produced
// two whole classes of wrong tag (Morgan, 2026-08-07):
//   * ordering — "Logan Metz and the fork in the road", a singer-songwriter
//     preview, hit /road/ (infrastructure) three rules before /music/
//     (arts-culture) could ever be tested;
//   * substrings — /rent/ matched "current", /art/ matched "part", /park/
//     matched "parking", /district/ matched "fire district", and /mountain/
//     matched "Mountain Village" in nearly every article we carry.
// Every pattern is now word-anchored and topics are SCORED rather than raced,
// with the headline weighted over the body, so one incidental word in a title
// cannot outvote a body that is plainly about something else.
const TOPIC_RULES = [
  ['public-safety', [/\bwild ?fires?\b/, /\bfires?\b/, /\bfire (district|department|ban|restrictions?)\b/,
                     /\bmarshals?\b/, /\bpolice\b/, /\bsheriff\b/, /\brescue\b/, /\bevacuat\w*\b/,
                     /\bcrash(es)?\b/, /\baccidents?\b/, /\bavalanche\w*\b/, /\bemergency\b/, /\bsmoke\b/]],
  ['housing',       [/\bhousing\b/, /\baffordab\w*\b/, /\bdeed[- ]restrict\w*\b/, /\bsmrha\b/,
                     /\brents?\b/, /\brental\w*\b/, /\bworkforce\b/, /\bapartments?\b/,
                     /\bdeed restriction\b/, /\bshort[- ]term rental\b/, /\bvacancy\b/]],
  ['land-use',      [/\bzoning\b/, /\bland[- ]use\b/, /\bpud\b/, /\bsubdivision\b/, /\bvariance\b/,
                     /\bsetbacks?\b/, /\bharc\b/, /\bhistoric (district|preservation|landmark)\b/,
                     /\bbuilding permits?\b/, /\bdesign standards?\b/, /\bmaster plan\b/, /\bannexation\b/]],
  ['government',    [/\bbudget\b/, /\btaxes?\b/, /\btax\b/, /\brevenues?\b/, /\bbonds?\b/, /\bfiscal\b/,
                     /\bappropriation\w*\b/, /\btown councils?\b/, /\bcounty commission\w*\b/,
                     /\bcommissioners?\b/, /\belections?\b/, /\bballots?\b/, /\bordinances?\b/,
                     /\bresolutions?\b/, /\bboards?\b/, /\bcouncils?\b/]],
  ['infrastructure',[/\broads?\b/, /\bhighways?\b/, /\bbridges?\b/, /\bpaving\b/,
                     /\bwater (system|line|main|rights?|treatment)\b/, /\bsewer\w*\b/, /\bwastewater\b/,
                     /\btransit\b/, /\bgondola\b/, /\bsmart\b/, /\binfrastructure\b/, /\bbroadband\b/,
                     /\butility\b/, /\bconstruction (project|season)\b/, /\bdetour\w*\b/,
                     // "closure" alone is far too broad — it also means fishing
                     // closures, trail closures, business closures. Anchor to travel.
                     /\b(road|highway|lane|pass|bridge)\s+closures?\b/, /\bclosed to traffic\b/]],
  ['education',     [/\bschools?\b/, /\bstudents?\b/, /\beducation\b/, /\bteachers?\b/,
                     /\bschool district\b/, /\bclassrooms?\b/, /\bgraduat\w*\b/, /\bscholarships?\b/]],
  ['arts-culture',  [/\barts?\b/, /\bartists?\b/, /\bmusic\b/, /\bmusicians?\b/, /\bconcerts?\b/,
                     /\bsongwriters?\b/, /\bbands?\b/, /\balbums?\b/, /\bfestivals?\b/, /\bfilms?\b/,
                     /\bgalleries\b/, /\bgallery\b/, /\btheat(er|re)\b/, /\bculture\b/, /\bcultural\b/,
                     /\bexhibit\w*\b/, /\bauthors?\b/, /\bpoetry\b/, /\bdance\b/, /\bperform\w*\b/]],
  ['recreation',    [/\bski(ing|ers?)?\b/, /\btrails?\b/, /\bhik\w*\b/, /\bbik\w*\b/, /\bclimb\w*\b/,
                     /\brecreation\w*\b/, /\bopen space\b/, /\bparks?\b/, /\bcampground\w*\b/,
                     /\bfishing\b/, /\brafting\b/, /\bpass (is )?(now )?open\b/]],
  ['health',        [/\bhealth\b/, /\bmedical\b/, /\bhospitals?\b/, /\bclinics?\b/, /\bcovid\b/,
                     /\bmental health\b/, /\bpublic health\b/, /\bvaccin\w*\b/]],
];
const TOPIC_TITLE_WEIGHT = 3;
const TOPIC_BODY_WEIGHT = 2;

function classifyNewsTopic(title, desc) {
  const t = String(title || '').toLowerCase();
  const d = String(desc || '').toLowerCase();
  let best = 'community', bestScore = 0;
  for (const [topic, patterns] of TOPIC_RULES) {
    let score = 0;
    for (const re of patterns) {
      if (re.test(t)) score += TOPIC_TITLE_WEIGHT;
      else if (re.test(d)) score += TOPIC_BODY_WEIGHT;
    }
    // Strictly greater keeps TOPIC_RULES order as the tiebreak, so a genuine
    // tie resolves to the more specific topic listed first.
    if (score > bestScore) { best = topic; bestScore = score; }
  }
  return bestScore > 0 ? best : 'community';
}

// Re-tag a record that's being carried forward from a previous run rather than
// re-scraped. Both carry-forward paths below used to `push(existing)` verbatim,
// which meant an article kept whatever topic the rules assigned the first time
// it was ingested — the RSS feeds only serve the most recent handful of items,
// so most of what's on screen is a carry-forward and a rules change reached
// almost none of it. When the scoring rewrite landed on 2026-08-07, 34 of the
// 83 live Telluride Times articles were still on tags from the old
// first-match-wins cascade ("Logan Metz and the fork in the road" filed under
// infrastructure because the headline contains "road"), and would have stayed
// there until they aged out of the 14-day window.
//
// Safe to recompute unconditionally: newsTopic has no hand-set override path —
// content-refresh is its only writer, and local-news.html only reads it.
function retagCarriedForward(rec) {
  if (!rec || typeof rec !== 'object') return rec;
  if (!('newsTopic' in rec)) return rec;   // never add the field to records that lack it
  return { ...rec, newsTopic: classifyNewsTopic(rec.title || '', rec.copy || '') };
}
module.exports = { TOPIC_RULES, TOPIC_TITLE_WEIGHT, TOPIC_BODY_WEIGHT, classifyNewsTopic, retagCarriedForward };
