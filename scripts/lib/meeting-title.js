// Digest meeting cards: make the headline name the body on its own.
//
// The card shows a jurisdiction chip beside the date and the meeting name
// underneath, so a Norwood card read:
//
//     WED, AUG 12   Norwood
//     Board of Trustees Meeting
//
// "Board of Trustees Meeting" means nothing once the line is separated from the
// chip — forwarded, skimmed, read aloud, or pulled into a calendar entry. So
// the headline gets the entity: "Norwood Board of Trustees Meeting".
// (Morgan, 2026-08-09.)
//
// The whole difficulty is NOT doing that when the name already carries the body,
// which is common and inconsistent across sources:
//
//     Norwood          + "Norwood Water Commission Meeting"      already there
//     Town of Ridgway  + "Ridgway Town Council Regular Meeting"  already there
//     SMART Transit    + "SMART Board of Directors"              already there
//     School District  + "Telluride Board of Education Meeting"  reads as a body
//
// Blind prefixing gives "Norwood Norwood Water Commission Meeting". Used by
// scripts/weekly-email.js for both the Week Ahead and Weekend Ahead digests.

'use strict';

// Words that identify an organization type rather than WHICH organization.
// Dropped from the source label before looking for it in the meeting name, so
// "Fire District" is matched on "fire" and "Town of Ridgway" on "ridgway".
const GENERIC_SRC_WORDS = new Set([
  'town', 'of', 'the', 'district', 'transit', 'center', 'authority',
  'county', 'r', '1', 'r1', 'board', 'commission', 'committee',
]);

// A name starting with one of these already announces its own body, even when
// it shares no word with the source label — "Telluride Board of Education"
// under the "School District R-1" label, "TRAA Board of Commissioners" under
// "Airport". Prefixing those reads as bureaucratic stutter.
const SELF_IDENTIFYING = /^(telluride|norwood|ridgway|ouray|rico|ophir|mountain village|san miguel|smart|tmvoa|traa|nucla|naturita|west end)\b/i;

const words = (s) => String(s || '').toLowerCase().match(/[a-z0-9]+/g) || [];

// The tokens of `src` that actually identify the body.
function distinctiveTokens(src) {
  return words(src).filter(w => !GENERIC_SRC_WORDS.has(w));
}

/**
 * Headline for a meeting card.
 * @param {string} name meeting title as published ("Board of Trustees Meeting")
 * @param {string} src  jurisdiction label shown in the chip ("Norwood")
 * @returns {string}    "Norwood Board of Trustees Meeting"
 */
function meetingDisplayName(name, src) {
  const title = String(name || '').trim();
  const label = String(src || '').trim();
  if (!title) return '';
  if (!label) return title;

  const nameWords = new Set(words(title));
  const tokens = distinctiveTokens(label);

  // Already names its body — leave it exactly as published.
  if (tokens.length && tokens.some(t => nameWords.has(t))) return title;
  if (SELF_IDENTIFYING.test(title)) return title;

  // A label with nothing distinctive left (e.g. "The District") can't usefully
  // prefix anything; better a bare title than a vague one.
  if (!tokens.length) return title;

  return `${label} ${title}`;
}

module.exports = { meetingDisplayName, distinctiveTokens, SELF_IDENTIFYING, GENERIC_SRC_WORDS };
