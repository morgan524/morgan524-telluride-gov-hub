// Permanent spellings of local people's names (Morgan, 2026-10-26).
//
// Recaps are drafted by Claude from YouTube auto-captions, which mangle names
// ("Grace Crossland" for Grace Franklin, "Marchin Ashki" for Marcin Ostromecki).
// Unlike data/content-corrections.json these rows NEVER expire — a person's
// name doesn't stop being spelled right.
//
// Applied to new recaps in meeting-recaps.js and to every digest render in
// weekly-email.js + past-meetings-email.js. Add a row whenever Morgan supplies a
// correct spelling or a recap turns up a garbled one; each pattern matches only
// WRONG forms, so the right spelling passes through. Keep patterns anchored to
// a first name where the bare surname is also a real, different name (Betton,
// Dupree, Jensen).
'use strict';

// Current members of the bodies we recap, as published by the bodies themselves
// (verified 2026-10-26). Reference for the correction rows below and for
// anyone checking a recap by hand — update when a roster changes.
//   Telluride Council   https://www.telluride.gov/89/Mayor-Town-Council
//   Telluride P&Z       https://telluride.civicweb.net/portal/members.aspx?id=31
//   Telluride HARC      https://telluride.civicweb.net/portal/members.aspx?id=35
//   MV Town Council     https://townofmountainvillage.com/government/town-council/town-council/
//   MV DRB              https://townofmountainvillage.com/business/planning/design-review-board/
const ROSTERS = {
  'Telluride Town Council': ['Teddy Errico (Mayor)', 'Elena Levin (Mayor Pro Tem)', 'Ashley Story Von Spreecken', 'Charles Dalton', 'Dan Enright', 'Marya Stark', 'Kristen Permakoff'],
  'Telluride Planning & Zoning Commission': ['Angela Dye (Chair)', 'Kathy Green (Vice Chair)', 'Todd Brown', 'Lee Shea Betten', 'Peter Sante', 'Dan Enright (Council liaison)', 'Shayni Saftler (Alternate)', 'Marcin Ostromecki (Alternate)'],
  'Telluride HARC': ['Mark Shambaugh (Chair)', 'Stacy Lake (Vice Chair)', 'Robert Mather', 'Andrew Williamson', 'Sherry Gourlay (Alternate)', 'Troy Gulec (Alternate)', 'staff: Deryn Candelaria (Historic Preservation Planner)'],
  'Mountain Village Town Council': ['Scott Pearson (Mayor)', 'Tucker Magid (Mayor Pro Tem)', 'Peter (Pete) Duprey', 'Harvey Mogenson', 'Huascar E. (Rick) Gomez', 'Alline Arguelles', 'Dan Jansen'],
  'Mountain Village Design Review Board': ['Banks Brown (Chair)', 'Liz Newton', 'Adam Miller', 'Ellen Kramer', 'Greer Garner', 'Scott Bennett', 'David Eckman', 'Jim Austin (Alternate)', 'Tobin Brown (Alternate)'],
  'Other': ['Public Health Director Grace Franklin', 'Jim Botenhagen'],
};

const NAME_SPELLINGS = [
  // Public Health Director Grace Franklin
  { wrong: /\bGrace (?:Crossland|Franklen|Franklyn|Frankland)\b/g, right: 'Grace Franklin' },
  // Jim Botenhagen
  { wrong: /\bBot(?:tenh|henh|tenhh|enhh)agen\b/g, right: 'Botenhagen' },
  { wrong: /\bBoten[- ]?Hagen\b/g, right: 'Botenhagen' },
  { wrong: /\bJim (?:Roenhagen|Rodenhagen|Bodenhagen|Botenhaggen|Boden Hagen)\b/g, right: 'Jim Botenhagen' },

  // ── Telluride Town Council ──
  { wrong: /\bTeddy Er(?:ic+o|rico?)\b/g, right: 'Teddy Errico' },
  { wrong: /\b(?:Ellen|Elena|Elaine) Lev(?:en|ine|ein)\b|\bEllen Levin\b/g, right: 'Elena Levin' },
  { wrong: /\b[Vv]on Spre(?:ck|ek|eck|cek)(?:en|in|on)\b|\b[Vv]on Spreckels\b|\bvon Spreecken\b/g, right: 'Von Spreecken' },
  { wrong: /\bMaria Stark\b/g, right: 'Marya Stark' },
  { wrong: /\bPerm(?:acoff|akov|akof|acov|ikoff)\b/g, right: 'Permakoff' },
  { wrong: /\bDan Enwright\b/g, right: 'Dan Enright' },

  // ── Telluride P&Z ──
  { wrong: /\bAngela (?:Dai|Die|Dyer)\b/g, right: 'Angela Dye' },
  { wrong: /\b(?:Lache|Lashay|Leshay|Lee Shay|Lee Shae) Bett[eo]n\b|\bLee Shea Betton\b/g, right: 'Lee Shea Betten' },
  { wrong: /\bPeter (?:Santi|Santee|Santy)\b/g, right: 'Peter Sante' },
  { wrong: /\b(?:Sheney|Shaney|Shayne|Shaynie|Shani|Shaini) Saf(?:t|f)ler\b/g, right: 'Shayni Saftler' },
  { wrong: /\bSaffler\b/g, right: 'Saftler' },
  { wrong: /\bMarchin Ashki\b|\bMar(?:chin|tin|cin) Ostrom(?:eck[ey]|eki|etsky|ecky)\b/g, right: 'Marcin Ostromecki' },
  { wrong: /\bAshki\b/g, right: 'Ostromecki' },

  // ── Telluride HARC ──
  { wrong: /\bMark Shamb(?:ough|o|ah|aw|augh?e)\b/g, right: 'Mark Shambaugh' },
  { wrong: /\bStacey Lake\b/g, right: 'Stacy Lake' },
  { wrong: /\bRobert Math(?:ers|ur|ere)\b/g, right: 'Robert Mather' },
  { wrong: /\bSherry Gourl(?:ey|ie|y)\b/g, right: 'Sherry Gourlay' },
  { wrong: /\bTroy Gul(?:ek|eck|ack|ic)\b/g, right: 'Troy Gulec' },
  { wrong: /\b(?:Darren|Derin|Deren|Daryn|Deryn) Candel(?:aria|eria|ario)\b/g, right: 'Deryn Candelaria' },

  // ── Mountain Village Town Council ──
  { wrong: /\bTucker Ma(?:ggid|jid|gged|gid)\b/g, right: 'Tucker Magid' },
  { wrong: /\b(Pete|Peter) Dupr(?:ee|ay|ey)\b/g, right: '$1 Duprey' },
  { wrong: /\bHarvey Mogens[ea]n\b/g, right: 'Harvey Mogenson' },
  { wrong: /\b(?:Wascar|Guascar|Huasca|Waskar) Gomez\b/g, right: 'Huascar Gomez' },
  { wrong: /\b(?:Aline|Alene|Allene|Arlene|Alline) Argu(?:ellos|elas|eyes|eles|elles)\b/g, right: 'Alline Arguelles' },
  { wrong: /\bDan (?:Janssen|Jansson|Jensen)\b/g, right: 'Dan Jansen' },

  // ── Mountain Village DRB ──
  { wrong: /\bBanks? Browne?\b/g, right: 'Banks Brown' },
  { wrong: /\bGreer Gardner\b/g, right: 'Greer Garner' },
  { wrong: /\bDavid E(?:ckmann|kman)\b/g, right: 'David Eckman' },
  { wrong: /\bScott Bennet\b/g, right: 'Scott Bennett' },

  // ── San Miguel County Planning Commission ──
  { wrong: /\bMathew Bayma\b/g, right: 'Matthew Bayma' },
];

function fixNames(s) {
  if (typeof s !== 'string') return s;
  for (const { wrong, right } of NAME_SPELLINGS) s = s.replace(wrong, right);
  return s;
}

// Deep-applies fixNames to every string in a plain JSON value (recap objects
// carry names in recap, title and votes[]).
function fixNamesDeep(v) {
  if (typeof v === 'string') return fixNames(v);
  if (Array.isArray(v)) return v.map(fixNamesDeep);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = fixNamesDeep(v[k]);
    return o;
  }
  return v;
}

module.exports = { ROSTERS, NAME_SPELLINGS, fixNames, fixNamesDeep };
