// Permanent spellings of local people's names (Morgan, 2026-10-26).
//
// Recaps are drafted by Claude from YouTube auto-captions, which mangle names
// ("Grace Crossland" for Grace Franklin). Unlike data/content-corrections.json
// these rows NEVER expire — a person's name doesn't stop being spelled right.
//
// Applied to new recaps in meeting-recaps.js and to every digest render in
// weekly-email.js. Add a row whenever Morgan supplies a correct spelling; each
// pattern matches only the WRONG forms, so the right spelling passes through.
'use strict';

const NAME_SPELLINGS = [
  // Public Health Director Grace Franklin
  { wrong: /\bGrace (?:Crossland|Franklen|Franklyn|Frankland)\b/g, right: 'Grace Franklin' },
  // Jim Botenhagen
  { wrong: /\bBot(?:tenh|henh|tenhh|enhh)agen\b/g, right: 'Botenhagen' },
  { wrong: /\bBoten[- ]?Hagen\b/g, right: 'Botenhagen' },
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

module.exports = { NAME_SPELLINGS, fixNames, fixNamesDeep };
