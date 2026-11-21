/* js/gov-helpers.js — bot-managed data + pure helper functions.
 *
 * Loaded by EVERY page (after gov-data.js, before gov-helpers.js if at all).
 *   Legacy index.html:    gov-data.js + gov-helpers.js + gov-helpers.js
 *   v2 standalone pages:  gov-data.js + gov-helpers.js
 *
 * This used to be auto-generated as data-only.js from gov-helpers.js by
 * scripts/extract-data-only.js. As of 2026-05-18 it's the SINGLE SOURCE
 * of truth — both the content-refresh bot and humans edit it directly,
 * and gov-helpers.js no longer carries duplicates of these consts.
 *
 * Depends on gov-data.js (must load first) for COUNTY_CACHED_DATA,
 * MV_CACHED_DATA, COUNTY_CIVICCLERK_BASE, MEETING_ZOOM_LINKS,
 * MEETING_PASSCODES, SCHOOL_ZOOM_LINK, ENTITY_REMOTE, etc.
 */

function truncate(text, maxLen = 200) {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
}

function localDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  // ISO format "YYYY-MM-DD..." — split on dash to avoid UTC interpretation.
  //
  // EXCEPT when the string carries an explicit UTC offset ("...T00:30:00Z").
  // That is an INSTANT, not a calendar day, and reading its literal date prefix
  // silently publishes evening events one day late: the Ouray/Ridgway feed
  // stamps a 6:30 PM Mountain show as 00:30Z the NEXT day, so a literal read
  // showed the Sherbino's Sept 1 film on Sept 2 and its "First Friday" concert
  // on a Saturday. Honor the offset and resolve to the Mountain calendar day.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2}))?/);
  if (iso) {
    if (iso[4]) {
      const inst = new Date(s);
      if (!isNaN(inst)) {
        const mt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(inst).split('-');
        return new Date(+mt[0], +mt[1] - 1, +mt[2]);
      }
    }
    return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  }
  // Named month format "Month Day, Year"
  const named = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (named) {
    const d = new Date(named[1] + ' ' + named[2] + ', ' + named[3]);
    // new Date("March 31, 2026") may be UTC — re-create as local
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  // Fallback — parse then force to local midnight.
  // Use UTC components to preserve the intended calendar date when input is a
  // UTC-midnight timestamp (e.g. RFC 2822 RSS pubDate "+0000"). Using local
  // getDate() on a UTC-midnight Date returns the previous day in timezones
  // west of UTC (e.g. MDT = UTC-6).
  const d = new Date(s);
  if (isNaN(d)) return null;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

// Calendar-date key (YYYY-MM-DD) for a Date built by localDate(). Those Dates
// are local-midnight on the intended calendar day, so the day lives in the
// Date's LOCAL components. Deriving the key via toISOString() (UTC) silently
// shifts the day for evening/timestamped dates or runtimes east of UTC —
// breaking summary / agenda / zoom lookups. Read the local components instead.
// (For date-only meetings in a west-of-UTC browser this is identical to the old
// toISOString().slice(0,10), so it's a zero-regression correctness fix.)
function localDateKey(d) {
  if (!d || isNaN(d)) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// A "meta-summary" / refusal: the model explaining WHY it can't summarize —
// corrupt/garbled text, a paywall, no readable content, "can't be produced",
// "resubmit" — instead of actually summarizing. NEVER show these on a card: a
// blank summary is strictly better than an apology about the source. Used by
// the renderers (local-news.html) AND mirrored in scripts/content-refresh.js so
// such text is never stored in the first place. Kept narrow so it only catches
// refusals, not real summaries that happen to mention access or a document.
function isRefusalSummary(text) {
  if (!text) return false;
  const t = String(text);
  return /\b(?:article|article text|text|content|source)\b[^.!?]{0,60}\b(?:corrupt(?:ed)?|garbl(?:ed)?|unreadable|not readable|no readable content|isn'?t accessible|is not accessible|not accessible|(?:login\/)?paywall|boilerplate)\b/i.test(t)
      || /\b(?:can'?t|cannot|could ?n'?t|couldn'?t|unable to)\b[^.!?]{0,40}\b(?:produce|generate|summar\w*|extract|access|read|be produced)\b/i.test(t)
      || /\bresubmit\b|check the source article|based on what'?s visible|no reliable summary/i.test(t);
}

function isBadSummary(text) {
  if (!text) return false;
  if (isRefusalSummary(text)) return true;
  if (SUMMARY_REJECT_PATTERNS.some(pat => pat.test(text))) return true;
  // Catch scraped-page artifacts that slip past SUMMARY_REJECT_PATTERNS — text
  // describing the agenda DOCUMENT/PAGE itself, not the meeting's substance.
  // Do NOT trip on the bare word "agenda": it appears in many real summaries
  // ("A full agenda for the last day of June…") and was silently suppressing
  // them (Town Council, BOCC, MV Council, etc.).
  if (text.length > 120 && !text.includes(' · ') &&
      /\b(agenda|meeting) (page|pdf|document|text|content)\b|\bpage (navigation|content|text)\b|\b(skip to|main content|click here)\b/i.test(text)) return true;
  return false;
}

// ── Shared event-image resolution ───────────────────────────────────────────
// The ONE place that decides which image an event shows, used by BOTH the
// events page (browser) and the weekly email (Node). Returns { primary, fallback }:
//   primary  = the event's own image (band photo / flyer) as a usable URL, or ''
//   fallback = a series poster when the event matches one (e.g. Music on the
//              Green), else ''
// Environment-agnostic: the caller supplies how to absolutize a relative /img/
// path (opts.origin) and, optionally, how to check whether that local file
// exists (opts.exists). The email passes BOTH — it needs absolute URLs and can
// read the repo on disk, so a relative image whose file is missing is dropped in
// favor of the poster. The page passes NEITHER — it keeps paths relative and
// lets <img onerror> fall back to the poster at runtime.
// To add a new series poster, add one line to SERIES_POSTERS.
function resolveEventImage(e, opts) {
  opts = opts || {};
  var origin = opts.origin || '';
  var exists = opts.exists || function () { return true; };
  var abs = function (p) { return (!p || /^https?:\/\//.test(p) || !origin) ? p : origin + p; };
  var usable = function (p) {
    if (!p) return '';
    if (/^https?:\/\//.test(p)) return p;                       // already absolute
    if (/^\/img\//.test(p)) return exists(p) ? abs(p) : '';     // local file — keep only if present
    return abs(p);                                              // other relative path — best effort
  };
  var own = (e && (e.img || e.imageUrl)) || '';
  var hay = (((e && e.title) || '') + ' ' + ((e && e.source) || '') + ' ' + ((e && e.sourceLabel) || '')).toLowerCase();
  var SERIES_POSTERS = [
    { match: 'music on the green', img: '/img/music-on-the-green/music-on-the-green.jpg' },
  ];
  var series = '';
  for (var i = 0; i < SERIES_POSTERS.length; i++) {
    if (hay.indexOf(SERIES_POSTERS[i].match) !== -1) { series = SERIES_POSTERS[i].img; break; }
  }
  return { primary: usable(own), fallback: usable(series) };
}

// Per-meeting Zoom info parsed out of the agenda PDF by
// scripts/content-refresh.js (parseZoomFromAgenda). Keyed by the same
// source|date|title string as MANUAL_SUMMARIES. Read by zoomPanel() in
// gov-hub.html in preference to the static MEETING_ZOOM_LINKS /
// MEETING_PASSCODES config — agenda-extracted info is per-meeting and
// stays current automatically; the static config is the fallback for
// sources without a PDF agenda.
const MEETING_AGENDA_META = {
  "med|2026-10-22|Regular Board Meeting":
    {"sv":4,"agendaUrl":"https://www.tellmed.org/files/51579856e/THD+Reg+BOD+Mtg+10.22.26+Agenda.pdf","zoomUrl":"https://us02web.zoom.us/j/89509331558","meetingId":"895 0933 1558"},

  "tmvoa|2026-10-22|TMVOA Board of Directors Meeting":
    {"sv":4,"agendaUrl":"https://tmvoa.org/site/assets/files/4868/tmvoa_board_meeting_agenda_10_22_26.pdf","zoomUrl":"https://us02web.zoom.us/meeting/register/kOgdEpzPSm6ngU0nJxoTXQ","meetingId":"885 4321 0595","passcode":"070912","phone":"970) 728-1904"},

  "telluride|2026-10-22|Planning & Zoning Commission - Oct 22 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8106","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/OC4r5SGcR6S0q5DBnXPh8Q","meetingId":"893 9320 2174","passcode":"963785.","phone":"301-715-8592"},

  "telluride|2026-10-22|Planning & Zoning Commission Chair - Oct 22 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8105","sv":4,"ph":"d0e0554de56351fb"},

  "county|2026-10-22|Board of Adjustment Meeting":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1072/files/agenda/2046","zoomUrl":"https://us06web.zoom.us/j/89983740568?pwd=Dl2LOcbcDvSP6Ifh2K09u2KB0cdBZH.1","meetingId":"899 8374 0568","passcode":"022414"},

  "county|2026-10-26|Open Space Commission Meeting":
    {"sv":4,"ph":"1ff606174e68cca5"},

  "telluride|2026-10-27|Town Council - Oct 27 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8045","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/DaEVzy_NTsub9PbJHzPwTg","meetingId":"896 6851 5669","passcode":"714517.","phone":"719) 359-4580"},

  "county|2026-10-28|Board of County Commissioners Work Session":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1036/files/agenda/2056","zoomUrl":"https://us02web.zoom.us/meeting/register/oIcj4FR6RoCy142-aHzo5w","meetingId":"868 9105 7971","passcode":"451656","phone":"719-359-4580"},

  "telluride|2026-11-04|Ecology Commission - Nov 04 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8120","sv":4,"zoomUrl":"https://us06web.zoom.us/j/84372531870?pwd=Dzpb3SzCKOLJejMu5DGalEWqJghGlM.1","phone":"970-728-2496"},

  "telluride|2026-11-04|Commission for Community Assistance, Arts & Special Events - Nov 04 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8068","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/tZ0pc-ChqDwsGNFpPigfqqLQptmoMmpJdiOx"},

  "telluride|2026-11-04|Telluride Housing Authority Subcommittee - Nov 04 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8165","sv":4,"ph":"89b54e4a61932908"},

  "county|2026-11-04|Board of County Commissioners Meeting":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/889/files/agenda/2064","zoomUrl":"https://us02web.zoom.us/meeting/register/yEtLDh7pSEiLm35vgwuJWQ","meetingId":"848 3698 7431","passcode":"369177","phone":"719-359-4580"},

  "telluride|2026-11-05|Special Meeting - Planning & Zoning Commission - Nov 05 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8312","sv":4,"ph":"930623a06e6efd7f"},

  "telluride|2026-11-05|Town Council Budget - Nov 05 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8054","sv":4,"ph":"6dd7ca52c2d0336e"},

  "tmvoa|2026-11-06|TMVOA Board of Directors Budget Meeting #1":
    {"sv":4,"agendaUrl":"https://tmvoa.org/site/assets/files/4890/tmvoa_board_meeting_agenda_11_06_26_revised_pl.pdf","zoomUrl":"https://us02web.zoom.us/meeting/register/Zl-93MeNQwyWYiRsQ3YGAA","meetingId":"871 5717 3224","passcode":"186923","phone":"970) 728-1904"},

  "telluride|2026-11-09|Open Space Commission - Nov 09 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8133","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/ePrh_CzmTLKqp0syEbUesw","meetingId":"894 7506 0147","passcode":"314276.","phone":"719) 359-4580"},

  "norwood|2026-11-10|Norwood Water Commission Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "norwood|2026-11-11|Board of Trustees Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "ridgway|2026-11-11|Ridgway Town Council Regular Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-11-02|Rescheduled/Special Meeting - Planning & Zoning Commission Chair - Nov 02 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8326","zoomUrl":"https://us06web.zoom.us/meeting/register/m65fl_EfRuC-m1IoGX6uiQ","meetingId":"815 3599 7736","passcode":"769982.","phone":"312-626-6799","sv":4},

  "telluride|2026-10-22|(Rescheduled to 11/2) Planning & Zoning Commission Chair - Oct 22 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8105","sv":4},

  "smart|2026-11-12|SMART Board of Directors":
    {"sv":4,"ph":"b858cb282617fb09"},

  "school|2026-11-16|Telluride Board of Education Work Session":
    {"sv":4,"agendaUrl":"https://files.smartsites.parentsquare.com/3403/111626_ws_packet.pdf","zoomUrl":"https://telluridek12.zoom.us/j/86585124120?pwd=TGd6c3A3WFMvRTI2blBnUStwdVI5Zz09","meetingId":"865 8512 4120","passcode":"468668"},

  "norwood|2026-11-16|Planning and Zoning Commission Meeting":
    {"sv":4,"agendaUrl":"https://www.norwoodtown.com/files/6a9b8d335/11.16.2026+P%26Z+BOA+AGENDA.pdf","zoomUrl":"https://us02web.zoom.us/j/85001344971","meetingId":"850 0134 4971","passcode":"8142302","phone":"970-327-4288"},

  "fire|2026-11-17|Board of Directors Meeting":
    {"sv":4,"agendaUrl":"https://www.telluridefire.com/files/db88b55e6/Agenda+-November+17th%2C+2026.pdf"},

  "school|2026-11-17|Telluride Board of Education Monthly Meeting":
    {"sv":4,"agendaUrl":"https://files.smartsites.parentsquare.com/3403/111726_mm_packet.pdf","zoomUrl":"https://telluridek12.zoom.us/j/86585124120?pwd=TGd6c3A3WFMvRTI2blBnUStwdVI5Zz09","meetingId":"865 8512 4120","passcode":"468668","phone":"579 354 7517"},

  "ophir|2026-11-17|General Assembly Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-11-17|Town Council - Nov 17 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8046","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/lsl6_LyUQreJPEkCInZv8A","meetingId":"840 7405 0490","passcode":"203716.","phone":"719) 359-4580"},

  "rico|2026-11-18|Rico Board of Trustees Regular Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-11-18|Historic & Architectural Review Commission Chair - Nov 18 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8027","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/dRjdHtmeTB6DmemBLALAFw","meetingId":"854 0207 9752","passcode":"775535.","phone":"301-715-8592"},

  "telluride|2026-11-18|Historic & Architectural Review Commission - Nov 18 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8026","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/KKzcuKFdTuyXzpw65k2aAA","meetingId":"812 9136 3866","passcode":"440860.","phone":"301-715-8592"},

  "telluride|2026-11-18|Parks & Recreation Commission - Nov 18 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8084","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/tZIufu6srzwsH9X0sfxgA_In-LUt0azBIi8Z"},

  "county|2026-11-18|Board of County Commissioners Meeting":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/902/files/agenda/2077","zoomUrl":"https://us02web.zoom.us/meeting/register/3oa6IAwwScu2-a0JGVOl8Q","meetingId":"845 8283 9046","passcode":"556147","phone":"719-359-4580"},

  "county|2026-11-09|Intergovernmental Meeting - San Miguel County Hosts":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1077/files/agenda/2067","zoomUrl":"https://us02web.zoom.us/meeting/register/-Xc7XRV5QtSEK4_gcCq7Hw","meetingId":"816 7927 3686","passcode":"275604","phone":"719-359-4580"},

  "smart|2026-11-16|SMART Gondola Advisory Committee":
    {"sv":4,"ph":"b858cb282617fb09"},

  "mv|2026-11-05|Design Review Board":
    {"sv":4,"agendaUrl":"https://townofmountainvillage.com/site/assets/files/50155/november_5-_2026_design_review_board_meeting_agenda.pdf","zoomUrl":"https://us06web.zoom.us/j/82514604948?pwd=i0xGIqUZB5sk4vpv27kGSDMUpyzbNU.1","meetingId":"825 1460 4948"},

  "mv|2026-11-19|Town Council Meeting":
    {"sv":4,"agendaUrl":"https://townofmountainvillage.com/site/assets/files/50275/november_19-_2026_town_council_meeting_agenda.pdf","zoomUrl":"https://us06web.zoom.us/webinar/register/WN_t5hWlTN2Qvy0rx0NxKKR6g","phone":"970-369-6429"},

  "airport|2026-11-19|TRAA Board of Commissioners Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "tmvoa|2026-11-19|TMVOA Board of Directors Budget Meeting #2":
    {"sv":4,"agendaUrl":"https://tmvoa.org/site/assets/files/4891/tmvoa_board_meeting_agenda_11_19_26-1.pdf","zoomUrl":"https://us02web.zoom.us/meeting/register/_hAMuenpTESyoldHUHB1WA","meetingId":"8 94 1215 6221","passcode":"812579"},

  "county|2026-11-12|Planning Commission Meeting":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1078/files/agenda/2071","zoomUrl":"https://us06web.zoom.us/j/81323528392?pwd=6mxcRmpL4YivaaHMcNBnsN3TwRLIoU.1","meetingId":"813 2352 8392","passcode":"279143","phone":"970-728-3844"},

  "telluride|2026-11-19|Resident Advisory Committee - Nov 19 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8320","sv":4,"ph":"a1a1d79c5ae0155d"},

  "telluride|2026-11-19|Planning & Zoning Commission - Nov 19 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8108","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/OC4r5SGcR6S0q5DBnXPh8Q","meetingId":"893 9320 2174","passcode":"963785","phone":"301-715-8592"},

  "telluride|2026-11-19|Planning & Zoning Commission Chair - Nov 19 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8107","sv":4,"ph":"377b24ec8cc33675"},

  "telluride|2026-11-19|Liquor Licensing Authority - Nov 19 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8147","sv":4,"zoomUrl":"https://us06web.zoom.us/j/86169871704?pwd=oK56hZLiXIbBia4HLKYI9XqWcVl8Uz.1","meetingId":"861 6987 1704","passcode":"281002.","phone":"346-248-7799"},

  "telluride|2026-10-26|Gondola Sub Committee - Oct 26 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8327","zoomUrl":"https://urldefense.com/v3/__https:/gbsm.zoom.us/j/82559576086__;!!ETWISUBM!3x58A-FfNf9JhIvrh2mHeq3wy9OHc7S76v3Obypudr5m-ILQvLZAsE3ZuUUqFUGuSSfFOzlMG_ETBGmg3kQV-w$","sv":4},

  "smart|2026-10-26|SMART Gondola Advisory Committee":
    {"agendaUrl":"https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/2026.10.26-Gsub-Agenda.pdf","zoomUrl":"https://urldefense.com/v3/__https:/gbsm.zoom.us/j/82559576086__;!!ETWISUBM!3x58A-FfNf9JhIvrh2mHeq3wy9OHc7S76v3Obypudr5m-ILQvLZAsE3ZuUUqFUGuSSfFOzlMG_ETBGmg3kQV-w$","sv":4},

  "tmvoa|2026-10-27|TMVOA Finance &amp; Budget Committee":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-10-23|Commission for Community Assistance, Arts & Special Events - Grant Subcommittee -Oct 23 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8328","sv":4},

  "county|2026-10-26|San Miguel Basin Fair Board Meeting 10/26":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1092/files/agenda/2058"},

  "ouray|2026-10-27|Board of County Commissioners":
    {"agendaUrl":"https://ouraycoco.portal.civicclerk.com/event/1081/files/agenda/7575","zoomUrl":"https://us06web.zoom.us/j/87606375697?pwd=F4epE8XNbLwY5HjLUYeETbwoQsL0ps.1","meetingId":"876 0637 5697","passcode":"946299","phone":"346-248-7799","sv":4},

  "ouray|2026-10-27|Board of County Commissioners Work Session":
    {"agendaUrl":"https://ouraycoco.portal.civicclerk.com/event/1105/files/agenda/7571","zoomUrl":"https://us06web.zoom.us/j/87606375697?pwd=F4epE8XNbLwY5HjLUYeETbwoQsL0ps.1","meetingId":"876 0637 5697","passcode":"946299","phone":"346-248-7799","sv":4},

  "ouray|2026-10-28|Board of County Commissioners Work Session":
    {"agendaUrl":"https://ouraycoco.portal.civicclerk.com/event/1129/files/agenda/7573","zoomUrl":"https://us06web.zoom.us/j/87606375697?pwd=F4epE8XNbLwY5HjLUYeETbwoQsL0ps.1","meetingId":"876 0637 5697","passcode":"946299","phone":"346-248-7799","sv":4},

  "school|2026-11-04|Telluride Board of Education Work Session":
    {"sv":4,"agendaUrl":"https://files.smartsites.parentsquare.com/3403/1142026_ws_packet.pdf"},

  "county|2026-11-23|Open Space Commission Meeting":
    {"sv":4,"ph":"1ff606174e68cca5"},

  "county|2026-11-23|Open Space Commission Meeting 11/23":
    {"sv":4,"ph":"5b6f06437c0ffd41"},

  "med|2026-11-26|Regular Board Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "county|2026-10-29|Citizen's Weed Advisory Board":
    {"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1093/files/agenda/2059","zoomUrl":"https://us06web.zoom.us/j/88116514360?pwd=8CSCcqAImeFR8z2mhAEpMoGhiugbeT.1","meetingId":"881 1651 4360","passcode":"463594","phone":"970-728-3174","sv":4},

  "tmvoa|2026-10-29|TMVOA Audit &amp; Compliance Committee":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-11-17|(Lottery) Telluride Housing Authority - Nov 17 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8329","sv":4,"ph":"044820362edecae3"},

  "telluride|2026-11-12|Vending Subcommittee - Nov 12 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8358","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/Rpy5H2UfTx6pLRSkJpuMKA","meetingId":"865 1629 3864","passcode":"480624"},

  "norwood|2026-11-02|Norwood Water Commission Work Session":
    {"agendaUrl":"https://www.norwoodtown.com/files/bbfdcc5d9/11.02.2026+NWC+Work+Session.pdf","zoomUrl":"https://us02web.zoom.us/j/84889491102","meetingId":"848 8949 1102","passcode":"841533","sv":4},

  "telluride|2026-11-02|Special Meeting - Planning & Zoning Commission Chair - Nov 02 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8359","sv":4,"ph":"d54c281fa29cd3e1"},

  "med|2026-11-03|Regular Board Meeting":
    {"agendaUrl":"https://www.tellmed.org/files/123ee1a0f/THD+Special+Bd+Mtg+Agenda+11.3.26.pdf","zoomUrl":"https://us02web.zoom.us/j/81643831702?pwd=0XmN8YVZcrXW0wphr0yCMnI0hISL77.1&from=addon","meetingId":"816 4383 1702","passcode":"525157","sv":4},

  "telluride|2026-11-02|Special Meeting - Planning & Zoning Commission Chair - Nov 02 2026 at 10:30 AM":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8359","zoomUrl":"https://us06web.zoom.us/meeting/register/m65fl_EfRuC-m1IoGX6uiQ","meetingId":"815 3599 7736","passcode":"769982","phone":"301-715-8592","sv":4},

  "ouraycity|2026-11-02|Ouray City Council Regular Meeting":
    {"agendaUrl":"https://meetings.boardbook.org/Public/Agenda/2503?meeting=773056","sv":4},

  "telluride|2026-12-02|Commission for Community Assistance, Arts & Special Events - Dec 02 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8069","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/tZ0pc-ChqDwsGNFpPigfqqLQptmoMmpJdiOx"},

  "telluride|2026-12-02|Telluride Housing Authority Subcommittee - Dec 02 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8166","sv":4,"ph":"318a8fe2a3798f29"},

  "county|2026-11-25|Board of County Commissioners Work Session":
    {"sv":4,"ph":"155b8bb013cf3ec0"},

  "mv|2026-12-03|Design Review Board":
    {"sv":4,"ph":"b858cb282617fb09"},

  "norwood|2026-11-04|Board of Trustees Budget Work Session":
    {"agendaUrl":"https://www.norwoodtown.com/files/8bb3805e6/11.04.2026+BOT+Work+Session+Agenda.pdf","zoomUrl":"https://us02web.zoom.us/j/88369352327","meetingId":"883 6935 2327","passcode":"122688","phone":"970-327-4288","sv":4},

  "tmvoa|2026-12-03|TMVOA Board of Directors Budget Meeting #3":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-12-03|Town Council Retreat - Dec 03 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8051","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/SvscXljMQ1ukEeEL6Kf0mg","meetingId":"897 7434 7074","passcode":"604217.","phone":"719) 359-4580"},

  "county|2026-11-09|San Miguel Basin Fair Board":
    {"sv":4,"ph":"6825174845a5ec0c"},

  "county|2026-11-16|Open Space Commission Meeting":
    {"sv":4,"ph":"1ff606174e68cca5"},

  "telluride|2026-12-04|Special Town Council - Dec 04 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8324","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/LyUziwYoTiaZTkcdYc8iiA","meetingId":"830 8270 2436","passcode":"535925.","phone":"719) 359-4580"},

  "telluride|2026-11-09|Intergovernmental Meeting - Nov 09 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8360","meetingId":"816 7927 3686","passcode":"275604","phone":"719-359-4580","sv":4},

  "ouray|2026-11-10|Board of County Commissioners":
    {"agendaUrl":"https://ouraycoco.portal.civicclerk.com/event/1070/files/agenda/7579","zoomUrl":"https://us06web.zoom.us/j/87606375697?pwd=F4epE8XNbLwY5HjLUYeETbwoQsL0ps.1","meetingId":"876 0637 5697","passcode":"946299","phone":"346-248-7799","sv":4},

  "ouray|2026-11-10|Board of County Commissioners Work Session":
    {"agendaUrl":"https://ouraycoco.portal.civicclerk.com/event/1094/files/agenda/7581","zoomUrl":"https://us06web.zoom.us/j/87606375697?pwd=F4epE8XNbLwY5HjLUYeETbwoQsL0ps.1","meetingId":"876 0637 5697","passcode":"946299","phone":"346-248-7799","sv":4},

  "county|2026-11-16|Open Space Commission Meeting 11/23":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1091/files/agenda/2075"},

  "ouraycity|2026-11-10|Ouray Planning Commission Regular Meeting":
    {"agendaUrl":"https://meetings.boardbook.org/Public/Agenda/2503?meeting=776213","sv":4},

  "telluride|2026-12-07|Open Space Commission - Dec 07 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8134","sv":4,"ph":"73dde754d9947413"},

  "norwood|2026-12-08|Norwood Water Commission Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "tmvoa|2026-12-08|Mountain Village Merchant Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "norwood|2026-12-09|Board of Trustees Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "ridgway|2026-12-09|Ridgway Town Council Regular Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "county|2026-12-09|Board of County Commissioners Regular Meeting":
    {"sv":4,"ph":"9aaa47f1803242c3"},

  "telluride|2026-11-17|(Master Lease Lottery) Telluride Housing Authority - Nov 17 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8329","sv":4},

  "mv|2026-12-10|Town Council Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "county|2026-12-10|Planning Commission Meeting":
    {"sv":4,"ph":"66dd61a1d3bb2812"},

  "telluride|2026-11-12|San Miguel Authority for Regional Transportation - Nov 12 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8361","zoomUrl":"https://us02web.zoom.us/j/89092438576?pwd=wbYXpfraF25klegZlpgVZz5PwtIUNv.1","sv":4},

  "county|2026-12-03|One Time Event":
    {"sv":4},

  "smart|2026-12-10|SMART Board of Directors":
    {"sv":4,"ph":"b858cb282617fb09"},

  "med|2026-11-19|Regular Board Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "ouray|2026-11-17|Board of County Commissioners":
    {"agendaUrl":"https://ouraycoco.portal.civicclerk.com/event/1082/files/agenda/7595","zoomUrl":"https://us06web.zoom.us/j/87606375697?pwd=F4epE8XNbLwY5HjLUYeETbwoQsL0ps.1","meetingId":"876 0637 5697","passcode":"946299","phone":"346-248-7799","sv":4},

  "ouray|2026-11-18|Board of County Commissioners Work Session":
    {"agendaUrl":"https://ouraycoco.portal.civicclerk.com/event/1130/files/agenda/7600","zoomUrl":"https://us06web.zoom.us/j/87606375697?pwd=F4epE8XNbLwY5HjLUYeETbwoQsL0ps.1","meetingId":"876 0637 5697","passcode":"946299","phone":"346-248-7799","sv":4},

  "telluride|2026-12-03|Planning & Zoning Commission - Special Meeting - Dec 03 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8362","sv":4,"ph":"a5aeca1c51c0115f"},

  "ouraycity|2026-11-16|Ouray City Council Regular Meeting":
    {"agendaUrl":"https://meetings.boardbook.org/Public/Agenda/2503?meeting=774802","sv":4},

  "school|2026-12-14|Telluride Board of Education Work Session":
    {"sv":4,"ph":"b858cb282617fb09"},

  "county|2026-12-14|Open Space Commission Meeting":
    {"sv":4,"ph":"1ff606174e68cca5"},

  "fire|2026-12-15|Board of Directors Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "school|2026-12-15|Telluride Board of Education Monthly Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "ophir|2026-12-15|General Assembly Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-12-15|Town Council - Dec 15 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8047","sv":4,"ph":"6d6f5991d037fa3a"},

  "rico|2026-12-16|Rico Board of Trustees Regular Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-12-16|Historic & Architectural Review Commission Chair - Dec 16 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8029","sv":4,"ph":"c6ce421268a71d96"},

  "telluride|2026-12-16|Historic & Architectural Review Commission - Dec 16 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8028","sv":4,"ph":"b3cd4bc3eb8e2235"},

  "telluride|2026-12-16|Parks & Recreation Commission - Dec 16 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8085","sv":4,"ph":"0875ac690f9acac0"},

  "county|2026-12-16|Board of County Commissioners Meeting":
    {"sv":4,"ph":"a12dfd2ce826475e"},

  "telluride|2026-12-11|Telluride Housing Authority Subcommittee Special Meeting - Dec 11 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8365","sv":4,"ph":"7936b664b0cd4d30"},

  "telluride|2026-12-08|Telluride Housing Authority Subcommittee Special Meeting - Dec 08 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8364","sv":4,"ph":"1eed6ec987641b2d"},

  "telluride|2026-11-18|Telluride Housing Authority Subcommittee Special Meeting - Nov 18 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8363","zoomUrl":"https://us06web.zoom.us/meeting/register/vCd8aZy5TLOCOVod7PLOyQ","meetingId":"896 9784 6227","passcode":"734380.","phone":"719) 359-4580","sv":4},

  "norwood|2026-11-18|Board of Trustees Meeting":
    {"agendaUrl":"https://www.norwoodtown.com/files/8ec8087d1/11.18.2026+Board+of+Trustee+Agenda+ADA.pdf","zoomUrl":"https://us02web.zoom.us/j/87556267477?pwd=VmNTcmQ3S3lpTWJFbS80TVZ3NjU5Zz09","meetingId":"875 5626 7477","passcode":"8142301","phone":"970-327-4288","sv":4},

  "airport|2026-12-17|TRAA Board of Commissioners Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "tmvoa|2026-12-17|TMVOA Members Budget Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-12-17|Liquor Licensing Authority - Dec 17 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8123","sv":4,"ph":"e8c092d7dc733b1f"},

  "telluride|2026-12-17|Planning & Zoning Commission - Dec 17 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8110","sv":4,"ph":"17e4f9dd2ee65452"},

  "telluride|2026-12-17|Planning & Zoning Commission Chair - Dec 17 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8109","sv":4,"ph":"0454c5807aedf511"},

  "county|2026-12-18|Board of County Commissioners Special Meeting":
    {"sv":4,"ph":"7751bc604656aec0"},

  "school|2026-11-20|Telluride Board of Education Special Meeting":
    {"agendaUrl":"https://files.smartsites.parentsquare.com/3403/112026_sm_packet.pdf","zoomUrl":"https://telluridek12.zoom.us/j/86585124120?pwd=TGd6c3A3WFMvRTI2blBnUStwdVI5Zz09","meetingId":"865 8512 4120","passcode":"468668","sv":4},

  "telluride|2026-12-15|Special Joint Town Council - Dec 15 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8366","sv":4,"ph":"057310c1bdf7122a"},

  "telluride|2026-12-15|Special Joint Historic & Architectural Review Commission - Dec 15 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8367","sv":4,"ph":"6f777296adfe6d4b"},

  "telluride|2026-12-15|Special Joint Planning & Zoning Commission - Dec 15 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8368","sv":4,"ph":"48c342c8e69c52ee"},

  "norwood|2026-12-21|Planning and Zoning Commission Meeting":
    {"sv":4,"ph":"b858cb282617fb09"}
};

// Deep-dive auto-updates written by scripts/deep-dive-refresh.js (Haiku
// triage of Town/County news + agendas). Seeded 2026-07-20 — the writer
// existed for months but this const was missing, so writes never landed.
const DEEP_DIVE_UPDATES = [];

// Hub-Bub Question of the Day, written by content-refresh.js (Task 24) on the
// first run of each Mountain-Time day. Newest first, capped at 30. Each entry:
// { date: 'YYYY-MM-DD' (MT), title, body, choices: [2-4 short strings],
//   sourceUrl, topics: [] }. Rendered by hub-bub.html from the JSON mirror
// (data/daily-questions.json); votes live in Firestore daily_questions/{date}.
const DAILY_QUESTIONS = [
  {
    date: "2026-11-20",
    title: "Open space money — or keep the lights on?",
    body: "Council is voting on a second reading of an ordinance that would suspend the 5% Open Space Fund dedication from Real Estate Transfer Tax revenue for the 2027 budget year. The fund is how the town has long honored a voter expectation around land conservation — skipping a year frees up money when budgets are tight. Supporters say fiscal pressure is real and one year isn't a broken promise. Critics say it sets a pattern and that conservation commitments are easiest to honor when they're inconvenient.\n\nSo which is it — a reasonable pause, or the first chip in something that holds?",
    choices: ["Reasonable one-year pause", "Bad precedent for open space", "Depends on what else is cut", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-11-19",
    title: "Should the town rethink how it rents to its own workers?",
    body: "The Resident Advisory Committee is taking up consulting services for a comprehensive review of Telluride's employee rental housing policies. That means the rules governing who gets town-owned housing, on what terms, could change.\n\nSome residents will say the current policies need a hard look — the workforce has shifted and the housing crunch is real. Others will push back on spending consulting dollars to revisit a system that, however imperfect, is already running.\n\nWhat do you think — is a full policy review the right move, or not worth the cost?",
    choices: ["Review is overdue", "Not worth the cost", "Depends on the scope", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-11-18",
    title: "Exception or precedent?",
    body: "The Telluride Housing Authority Subcommittee has a stack of requests on its plate — residents including Nichole Zangara, Jim Riley, and Anthony and Melannie Tavano are asking for exceptions to the Affordable Housing Guidelines around lenders and mortgages. That's a lot of individual cases at once.\n\nSome will see this as the system working: real people hitting real obstacles, and a process that lets them ask for relief. Others will wonder whether a pile of exception requests signals that the underlying guidelines need a harder look — or whether exceptions, granted often enough, quietly become the new rule.\n\nSo: when residents need exceptions to make affordable housing work for them, is that a feature of the system or a sign something's off?",
    choices: ["It's the system working as intended", "Too many exceptions breaks the rules", "Time to revisit the guidelines", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-11-17",
    title: "Old buildings, new changes — who decides what fits?",
    body: "The Historic and Architectural Review Commission is set to take up applications for Certificates of Appropriateness — meaning proposed changes to structures or signs in Telluride need their sign-off before moving forward. Some residents see that oversight as exactly right: the town's historic character doesn't protect itself. Others find the process slow and subjective — a barrier to owners who want to maintain or improve their own property. Neither complaint is wrong.\n\nWhere do you come down — is design review a fair trade for preserving what makes this place worth living in, or does it put too much control in the hands of a commission?",
    choices: ["Fair trade for what we have", "Too much control over owners", "Depends on the project"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-11-16",
    title: "The county wants a housing action plan — but what does that mean?",
    body: "The Board of County Commissioners is set to consider creating a housing action plan. That sounds straightforward until you ask what it actually commits anyone to. Supporters would say the region's housing crunch demands a real roadmap — something with teeth. Skeptics might wonder whether another plan just means more process, more delay, and outcomes that look good on paper but don't move the needle. Nothing's been adopted yet; this is still at the consideration stage.\n\nSo: is a housing action plan a meaningful step forward, or one more document that gathers dust?",
    choices: ["Real step forward", "More process, less action", "Depends what's in it"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-11-15",
    title: "Who gets to say yes — and who just gets to watch?",
    body: "The Liquor Licensing Authority is set to review license applications or modifications, but with a catch built into the process: the hearing officer handles most matters, while new licenses require Town Council approval on top of that. So the same question comes up again — how much of this decision really belongs to the licensing body, and how much gets handed up the chain?\n\nSome folks think layered oversight keeps things accountable. Others think it slows things down and muddies who's actually responsible. Where do you land?",
    choices: ["Layered approval makes sense", "One body should decide", "Depends on the license", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-11-14",
    title: "Hazard plan — worth the county's time right now?",
    body: "The Board of County Commissioners is expected to consider developing a multi-jurisdictional hazard mitigation plan. That means pulling multiple local governments together to map out risks and responses before something goes wrong. Some residents will say that kind of coordinated planning is exactly what a mountain community needs — better late than never. Others may wonder whether it's another layer of process that moves slowly and costs money the county could spend on more immediate needs. Nothing's decided yet. So: is a multi-jurisdictional hazard plan a smart use of county attention right now?",
    choices: ["Yes, long overdue", "Wrong priority right now", "Depends on the cost", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-11-13",
    title: "New license, new fight — or no fight at all?",
    body: "The Liquor Licensing Authority meets November 19 to review license applications or modifications. The setup is worth noting: the hearing officer handles most matters, but new licenses require Town Council approval — and both local and state sign-off are needed before anything is issued. Some residents will say that two-step process is exactly the right amount of scrutiny for a small mountain town. Others will say it's a gauntlet that slows legitimate businesses down. Neither side is wrong.\n\nSo where do you land — is the dual-approval requirement the right call, or is it more hurdle than help?",
    choices: ["Right amount of oversight", "Too many hoops", "Depends on the applicant", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-11-12",
    title: "New pour, new rules",
    body: "The Liquor Licensing Authority meets to act on license applications or modifications. The hearing officer handles most matters, but new licenses require Town Council approval — and both local and state sign-off are needed before anything is issued. That split process is where the tension lives. Some residents see multiple checkpoints as the right way to protect the character of a small town. Others think the layered approval structure slows legitimate business down or gives too many hands a veto. So: does the current approval process strike the right balance — or is it too much gatekeeping for a place this size?",
    choices: ["The checkpoints make sense", "Too many hoops", "Depends on the applicant", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-11-11",
    title: "Should the town hire a consultant to review its employee housing rules?",
    body: "Town Council is expected to discuss bringing in consulting services for a comprehensive review of Telluride's employee rental housing policies. That sounds procedural — until you think about what it means.\n\nSome residents will say outside expertise is exactly what's needed: fresh eyes, no local politics, a real audit of whether the rules are working. Others will push back — consultants cost money, and the people who know how employee housing actually functions up here are already in town.\n\nIs outside help the right move for something this local?",
    choices: ["Fresh eyes are worth it", "We know our own problems", "Depends on the cost", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-11-10",
    title: "A trail, a canopy, and a fresh coat for the jail",
    body: "The Planning Commission has a mixed plate: a connector trail, a fuel island canopy, and painting the county jail are all on the table. Each one sounds routine until you think about what it competes with. Trail access is something a lot of people here care about. Jail upkeep is a public obligation. A fuel canopy is infrastructure. The question is whether these get weighed against each other — or just rubber-stamped one by one.\n\nWhich of these would you most want the commission to slow down and scrutinize?",
    choices: ["The connector trail", "The fuel island canopy", "The jail painting", "All deserve a closer look"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-11-09",
    title: "Who gets to pour — and who decides?",
    body: "The Liquor Licensing Authority meets to act on license applications or modifications for local establishments. A hearing officer presides, but new licenses require Town Council approval on top of that — and state sign-off too. Some residents think layered oversight protects the character of a small town. Others figure it slows things down and adds hoops for businesses that already face long odds up here. Both camps have a point.\n\nSo where do you land — is multi-level liquor licensing oversight the right call for Telluride, or is it more process than the situation warrants?",
    choices: ["Oversight protects the community", "Too many hoops for businesses", "State plus town is about right", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-11-08",
    title: "The county wants a housing action plan",
    body: "The Board of County Commissioners is set to consider creating a housing action plan at its November 18 meeting. No details on what that plan would contain are available yet — it's still a proposal.\n\nThat's where the tension lives. Some residents will say a formal plan is long overdue and that without one, housing decisions stay reactive. Others will wonder whether another plan just produces a document that sits on a shelf while the actual problem doesn't move.\n\nSo — does a housing action plan change anything, or is the county already past the point where planning helps?",
    choices: ["Plans lead to real change", "Another doc, same problem", "Depends what's in it"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-11-07",
    title: "Who reviews the rent rules — and does it matter who does it?",
    body: "Council is moving toward hiring outside consultants to do a comprehensive review of Telluride's employee rental housing policies. Some residents will see that as a smart move — fresh eyes, no local baggage, a real audit of whether the policies are actually working. Others will push back: local housing is a local problem, and paying consultants to study it can feel like a way to delay hard decisions the town already has the information to make. No contract has been approved yet — this is still at the discussion stage.\n\nSo where do you land: is outside expertise the right tool here, or is this one the town should work out itself?",
    choices: ["Bring in the consultants", "Keep it in-house", "Need more info first"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-11-06",
    title: "Should the county have an AI policy — and what should it say?",
    body: "Commissioners are expected to dig into a draft AI resolution and policy, alongside Senate Bill 26-189, at a work session. It's not a final vote — just a conversation. But the tension is real. Some residents will want the county ahead of this, with clear rules before AI tools become routine in government work. Others will wonder why a small mountain county needs a formal AI policy at all, or worry that outside legislation like SB 26-189 is already doing the steering for them. Where do you come down?",
    choices: ["Get the policy in place now", "Overkill for a county this size", "Let the state law handle it", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-11-05",
    title: "One deed restriction, one exception request",
    body: "The Board of County Commissioners, sitting as the Housing Authority, will consider an exception request from Esperanza Reyes to continuing residency and employment standards under her deed restriction. Deed restrictions on affordable units exist for a reason — they keep housing in local hands over time. But life doesn't always fit the rules: circumstances change, and a flat denial can feel punishing. Some neighbors will say exceptions undermine the whole system. Others will say a case-by-case review is exactly how fair administration works.\n\nWhere do you come down — should deed restriction exceptions be granted case by case, or held firm?",
    choices: ["Case-by-case review makes sense", "Hold the restrictions firm", "Depends on the reason", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-11-04",
    title: "Gas-powered leaf blowers — next to go?",
    body: "The Ecology Commission is set to review a proposed ordinance that would phase out combustion-powered lawn and garden equipment. Up here, that means gas blowers, trimmers, mowers — the whole category. Supporters will say it's overdue: cleaner air, quieter streets, fewer fumes in a canyon that traps everything. Skeptics will push back on who actually bears the cost — landscapers and contractors switching equipment mid-career aren't absorbing that lightly. Nothing is adopted yet; this is still a review. So: is a phase-out of gas lawn equipment a reasonable next step, or an overreach?",
    choices: ["Reasonable next step", "Overreach", "Depends on the timeline", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-11-03",
    title: "Deck repairs — or something more?",
    body: "The Design Review Board has a work session coming up on deck repairs and possible extensions at 120 Vischer Dr. Work sessions are exploratory — nothing's decided yet. But that phrase \"possible extensions\" is where opinions tend to split. Some neighbors see deck work as routine upkeep that keeps older structures sound. Others worry that a repair conversation quietly becomes an expansion conversation, adding mass or footprint to something that wasn't originally sized for it. Where's the line between fixing what's there and changing what's there?",
    choices: ["Repairs only — hold the line", "Extensions can be reasonable", "Depends on the specifics", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-11-02",
    title: "How many boards does it take to hire one consultant?",
    body: "The Planning & Zoning Commission is holding a special meeting to discuss a Request for Proposal for consulting services to review Telluride's employee rental housing policies. It's also on the agenda — in the same week — for the Housing Authority Subcommittee, the Arts & Special Events Commission, Town Council budget talks, and the Ecology Commission. Some residents will see that as thorough, multi-angle vetting before anything changes. Others will wonder why so many boards are weighing in before a consultant is even hired. Who actually drives this process — and does spreading it across this many tables help or slow things down?",
    choices: ["Broad input makes it stronger", "Too many cooks here", "Just hire someone and move on", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-11-01",
    title: "One lot line erased on W. Columbia",
    body: "A minor subdivision application for 510 W Columbia Avenue would vacate the lot line between two existing parcels and merge them into a single roughly 5,625-square-foot lot — Lot 40R. Straightforward on paper. But combining parcels can change what's buildable, and neighbors tend to notice when a lot suddenly has more room to work with. Some will see a reasonable consolidation of property a landowner already holds. Others will wonder what comes next on a freshly enlarged footprint.\n\nWhat's your read — routine paperwork, or does it matter?",
    choices: ["Routine, no big deal", "Worth watching closely", "Depends what gets built", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-10-31",
    title: "A height variance before it's built",
    body: "The Design Review Board is taking up a height variance request for an undeveloped lot on Mountain Village Blvd. Nothing's approved yet — it's on the agenda, not in the books.\n\nThat's where the split usually starts. One side figures variances on empty lots are exactly the right moment to ask: before anything goes up, before neighbors are staring at it. The other side worries that granting height exceptions on undeveloped land sets a precedent that quietly rewrites what the rules actually mean.\n\nSo — is a pre-construction variance the responsible time to be flexible, or the riskiest?",
    choices: ["Best time to bend the rules", "Sets a bad precedent", "Depends on the project"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-10-30",
    title: "Should an outside consultant rewrite the housing rules?",
    body: "The Telluride Housing Authority Subcommittee is set to discuss a request for proposals to hire outside consulting services for a comprehensive review of the town's employee rental housing policies. That means fresh eyes — but also outside hands — on rules that shape who gets to live up here and under what terms.\n\nSome will see it as overdue: policies calcify, and an independent review could surface fixes insiders are too close to see. Others will wonder whether handing that work to consultants risks losing the local knowledge — and accountability — that should drive housing decisions.\n\nSo: is outside expertise the right tool for this, or should the community be leading its own review?",
    choices: ["Bring in the outside experts", "Keep it local and in-house", "Depends on who they hire", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-10-29",
    title: "Pause the open space fund — or hold the line?",
    body: "Council is taking up an ordinance that would suspend the 5% capital fund allocation for open space in 2027. It's a first reading, so nothing is decided yet. The argument for: the town is facing budget pressure, and a one-year pause buys room to maneuver. The argument against: open space protection is exactly what gets quietly eroded during tight years, and a suspension sets a precedent. Both sides have a point.\n\nSo — is one year off a reasonable trade-off, or does pausing the open space fund open a door that's hard to close?",
    choices: ["One year is fine, budgets are tight", "Don't touch the open space fund", "Sets a bad precedent either way", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-10-28",
    title: "Should someone outside town hall review the housing rules?",
    body: "Multiple boards — the Housing Authority Subcommittee, Planning & Zoning, the Arts & Special Events Commission, and the Town Council budget session — are all being asked to weigh in on hiring outside consultants to do a comprehensive review of Telluride's employee rental housing policies. That's a lot of simultaneous attention on one question.\n\nSome residents will see outside eyes as overdue — fresh perspective on rules that may have calcified. Others will wonder why the town needs to pay consultants to evaluate programs that local staff and elected boards already know inside out.\n\nSo: does a third-party review of workforce housing policy sound like a good use of town resources to you — or not?",
    choices: ["Worth bringing in outside eyes", "Local boards can handle this", "Depends on the cost", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-10-27",
    title: "Two nights of concerts in Town Park — good idea?",
    body: "Council is looking at a proposed two-night concert in Town Park for August 2027. Up here, Town Park events are a long-running argument: they bring energy and economic life, and they also bring noise, crowds, and wear on a space that neighbors actually live next to. Supporters will say it's part of what makes this place tick. Skeptics will say two nights is one more than the canyon needs. Nothing's been decided — this is still a review stage. So: how do you feel about adding another multi-night concert to Town Park?",
    choices: ["Bring it on", "One night is enough", "Depends on the details", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-10-26",
    title: "Should a Veteran's Flag fly at the 4-H Event Center?",
    body: "The Board of County Commissioners is expected to decide whether to hang a Veteran's Flag at the 4-H Event Center. Sounds simple. But these calls rarely are — some residents will see it as a straightforward act of recognition, long overdue. Others may wonder about precedent: once one flag goes up, what comes next, and who decides? Public comment is on the agenda, so the board wants to hear from people before the vote.\n\nWhere do you come down on it?",
    choices: ["Hang the flag", "Leave it as is", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-10-25",
    title: "The gondola update nobody's agreed on yet",
    body: "The Gondola Sub Committee meets to hear an update on the FTA Capital Investment Program — federal transit money that could move the Telluride-Mountain Village gondola project forward. Some residents see a federally backed gondola connection as the right answer to traffic and parking up here. Others wonder whether chasing federal capital funding means ceding control, adding complexity, or committing to a project before the community has fully weighed in. Nothing's been decided — this is an update, not a vote.\n\nSo where do you stand: is federal investment in the gondola a good path forward, or does it give you pause?",
    choices: ["Get the federal money", "Too many strings attached", "Need way more info"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-10-24",
    title: "One lot line goes away in West Telluride",
    body: "A minor subdivision application for 510 W Columbia Avenue is headed to the Planning & Zoning Commission Chair. The proposal would vacate the lot line between two existing parcels and combine them into a single lot — roughly 5,625 square feet — to be known as Lot 40R.\n\nStraightforward paperwork to some. To others, consolidating lots in a tight mountain town raises a familiar question: does merging parcels quietly remove a future opportunity for more housing, or is private owners managing their own property simply nobody else's business?\n\nWhat do you think — does a lot-line vacation like this matter to the broader community, or is it a private decision that doesn't warrant much scrutiny?",
    choices: ["Private call, not our business", "These decisions add up", "Depends on what gets built", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-10-23",
    title: "Merge EMS and Ridgway Fire — or keep them separate?",
    body: "Commissioners are sitting down to talk about a potential merger between EMS and Ridgway Fire services. There's a preliminary draft agreement on the table, along with budget and operational questions. Consolidation backers tend to argue it stretches resources further and streamlines response. Critics worry that merging two distinct cultures and service areas creates more problems than it solves — and that \"preliminary\" can become fait accompli fast. Nothing's been decided; this is a work session. So: does combining these services sound like smart regionalism to you, or a deal that deserves a harder look first?",
    choices: ["Makes sense — consolidate", "Too many unknowns yet", "Keep them separate", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-10-22",
    title: "Shandoka lot: what goes there?",
    body: "The Planning & Zoning Commission is holding a public hearing on the Shandoka Lot Redevelopment Project — specifically a Preliminary Planned Unit Development application. A PUD gives developers flexibility to shape density and use in ways standard zoning might not allow. That's the tension. Some residents see PUDs as a practical tool for getting housing and mixed uses into tight spots. Others see them as a workaround that lets projects exceed what the neighborhood signed up for. Nothing is decided yet — this is a hearing, not a final vote.\n\nWhat's your read on PUD redevelopment in town: reasonable flexibility or too much room to maneuver?",
    choices: ["Reasonable flexibility", "Too much room to maneuver", "Depends on the project"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  }
];

// ── Seeds for bot writers whose targets were lost in the May 2026
// gov-hub.js/data-only.js retirement (2026-07-22 audit P0-3). Each of these
// had a content-refresh.js write path that silently no-opped because the
// const no longer existed anywhere; the writers now THROW on a missing
// target, and these seeds let the data start landing again. No page renders
// them yet — restoring (or retiring) the reader UIs is tracked separately.
const MEETING_PREVIEWS = {
  "county|2026-11-23|Open Space Commission Meeting":
    "The Open Space Commission is expected to meet on November 23, 2026. Related county activity includes active requests for proposals covering jail painting, a multi-jurisdictional hazard mitigation plan update, and a housing action plan, alongside several ongoing public trustee and sheriff foreclosure proceedings in the Norwood and Telluride areas.",

  "county|2026-11-23|Open Space Commission Meeting 11/23":
    "The San Miguel County Open Space Commission is expected to meet on November 23, 2026. Related county activity includes active requests for proposals covering jail painting, a multi-jurisdictional hazard mitigation plan update, and a housing action plan, alongside several ongoing foreclosure proceedings on local properties.",

  "telluride|2026-12-02|Commission for Community Assistance, Arts & Special Events - Dec 02 2026":
    "The Commission for Community Assistance, Arts & Special Events is expected to meet on December 2, 2026, to address its regular responsibilities, which may include funding allocations for community, arts, and special events organizations, and consideration of special events policies, street closures, and banner applications.",

  "telluride|2026-12-02|Telluride Housing Authority Subcommittee - Dec 02 2026":
    "The Telluride Housing Authority Subcommittee is expected to discuss a request for proposals seeking qualified consultants to conduct a comprehensive review of the Town of Telluride's employee rental housing policies.",

  "county|2026-11-25|Board of County Commissioners Work Session":
    "Board will consider procurement matters including proposals for jail painting, a multi-jurisdictional hazard mitigation plan update, and a county housing action plan. Related financial activity includes sheriff's and public trustee foreclosure sales and a proposed 2027 budget submission from the Southwestern Water Conservation District.",

  "telluride|2026-12-03|Town Council Retreat - Dec 03 2026":
    "Council is expected to discuss employee rental housing policies as part of a retreat session. A related request for proposals has been issued seeking consulting services to conduct a comprehensive review of the town's existing employee rental housing policies.",

  "telluride|2026-12-04|Special Town Council - Dec 04 2026":
    "Council is expected to discuss consulting services for a comprehensive review of Telluride's employee rental housing policies, including consideration of a related request for proposals seeking qualified respondents to conduct the review.",

  "telluride|2026-12-07|Open Space Commission - Dec 07 2026":
    "The Open Space Commission is expected to meet on December 7, 2026, to address priorities and management of Telluride's open space properties. Discussion may also touch on employee rental housing policy matters, as the Town is simultaneously seeking consulting services for a comprehensive review of those policies.",

  "county|2026-12-09|Board of County Commissioners Regular Meeting":
    "Board will consider procurement matters including proposals for a multi-jurisdictional hazard mitigation plan update, a housing action plan, and material hauling services. Related legal notices include several foreclosure sales and a proposed 2027 budget from the Southwestern Water Conservation District.",

  "county|2026-12-10|Planning Commission Meeting":
    "The San Miguel County Planning Commission is expected to meet on December 10, 2026. Related notices suggest the county is actively pursuing planning initiatives, including an all-hazard mitigation plan update and a housing action plan, which may inform discussions around land use, development, and community resilience priorities.",

  "county|2026-12-03|One Time Event":
    "San Miguel County is expected to address several procurement and financial matters, including requests for proposals for a multi-jurisdictional hazard mitigation plan update and a housing action plan, along with multiple foreclosure sales, a proposed 2027 water district budget, and bids for airport and conference center services.",

  "telluride|2026-12-03|Planning & Zoning Commission - Special Meeting - Dec 03 2026":
    "The Planning & Zoning Commission is expected to discuss a comprehensive review of Telluride's employee rental housing policies, as the town seeks consulting services to evaluate existing regulations. The special meeting may address the scope and direction of this policy review effort.",

  "county|2026-12-14|Open Space Commission Meeting":
    "The Open Space Commission is expected to discuss the proposed Lawson Hill Connector Trail Project, for which the county is seeking qualified respondents. Additional county matters, including material hauling services and housing action planning, may provide context for open space and land use considerations.",

  "telluride|2026-12-15|Town Council - Dec 15 2026":
    "Council is expected to discuss a request for proposals for consulting services related to a comprehensive review of the Town of Telluride's employee rental housing policies.",

  "telluride|2026-12-16|Historic & Architectural Review Commission Chair - Dec 16 2026":
    "No agenda details are available for the December 16, 2026 Historic & Architectural Review Commission meeting. A related legal notice indicates the Town of Telluride is seeking consulting services for a comprehensive review of its Employee Rental Housing Policies, though a direct connection to this meeting's agenda has not been confirmed.",

  "telluride|2026-12-16|Historic & Architectural Review Commission - Dec 16 2026":
    "The Historic and Architectural Review Commission is expected to review applications for Certificates of Appropriateness related to proposed construction, renovation, demolition, or alterations to structures within Telluride. The commission may also address matters concerning historic designation, preservation standards, and inventories of architecturally or historically significant properties.",

  "telluride|2026-12-16|Parks & Recreation Commission - Dec 16 2026":
    "The Telluride Parks & Recreation Commission is expected to meet on December 16, 2026. No specific agenda items have been published. Separately, the Town is seeking consulting services for a comprehensive review of its Employee Rental Housing Policies, though this matter falls outside the Commission's typical jurisdiction.",

  "county|2026-12-16|Board of County Commissioners Meeting":
    "Board will consider several procurement matters, including requests for proposals on a Housing Action Plan, a trail connector project, and fuel island canopy construction, along with a material hauling quote. Related legal notices include multiple foreclosure sales and a proposed 2027 budget from the Southwestern Water Conservation District.",

  "telluride|2026-12-11|Telluride Housing Authority Subcommittee Special Meeting - Dec 11 2026":
    "The Telluride Housing Authority Subcommittee is expected to discuss a Request for Proposals seeking qualified consultants to conduct a comprehensive review of the Town of Telluride's employee rental housing policies.",

  "telluride|2026-12-08|Telluride Housing Authority Subcommittee Special Meeting - Dec 08 2026":
    "The Telluride Housing Authority Subcommittee is expected to discuss a Request for Proposal for consulting services to conduct a comprehensive review of the Town of Telluride's employee rental housing policies.",

  "telluride|2026-12-17|Liquor Licensing Authority - Dec 17 2026":
    "The Telluride Liquor Licensing Authority is expected to convene its regular monthly meeting on December 17, 2026. Specific agenda items have not been detailed, but the authority typically reviews liquor license applications and modifications requiring local approval in coordination with the Colorado Department of Revenue.",

  "telluride|2026-12-17|Planning & Zoning Commission - Dec 17 2026":
    "The Planning & Zoning Commission is expected to discuss a comprehensive review of Telluride's Employee Rental Housing Policies, as the Town is seeking consulting services to evaluate the program. Additional land use and zoning matters may also be considered, though a full agenda was not available.",

  "telluride|2026-12-17|Planning & Zoning Commission Chair - Dec 17 2026":
    "The Planning & Zoning Commission Chair is expected to meet on December 17, 2026. Key topics may include a comprehensive review of Telluride's Employee Rental Housing Policies, with the town currently seeking consulting services to assess and potentially update those housing regulations.",

  "county|2026-12-18|Board of County Commissioners Special Meeting":
    "Board will consider procurement matters including a Housing Action Plan, material hauling services, a Lawson Hill Connector Trail project, and a fuel island canopy construction. Related legal notices include multiple foreclosure sales and a proposed 2027 budget from the Southwestern Water Conservation District.",

  "telluride|2026-12-15|Special Joint Town Council - Dec 15 2026":
    "Council is expected to discuss employee rental housing policies as part of a special joint session. The Town of Telluride has issued a Request for Proposal seeking consulting services to conduct a comprehensive review of its employee rental housing policies, suggesting housing affordability remains a key focus.",

  "telluride|2026-12-15|Special Joint Historic & Architectural Review Commission - Dec 15 2026":
    "The Historic and Architectural Review Commission is expected to convene in a special joint session to review matters related to historic preservation and architectural appropriateness in Telluride. The meeting may also touch on employee rental housing policy, as the town is separately seeking consulting services for a comprehensive review of those policies.",

  "telluride|2026-12-15|Special Joint Planning & Zoning Commission - Dec 15 2026":
    "The Planning & Zoning Commission is expected to discuss a comprehensive review of Telluride's employee rental housing policies, including consideration of consulting services to evaluate and potentially update the town's existing framework governing employee rental housing."
};        // pre-meeting agenda previews (Claude)
const REGIONAL_NEWS_ARTICLES = [
  {
    title: "2026 Chamber Meeting, December",
    source: "Norwood Colorado",
    sourceKey: "norwood",
    date: "December 8, 2026",
    newsTopic: "community",
    copy: "Monthly Chamber of Commerce meeting open to all.",
    href: "https://norwoodcolorado.com/event/2026-chamber-meeting-december/",
    img: ""
  },
  {
    title: "Noel Night",
    source: "Norwood Colorado",
    sourceKey: "norwood",
    date: "December 4, 2026",
    newsTopic: "community",
    copy: "Community shopping event and celebration.",
    href: "https://norwoodcolorado.com/event/noel-night-3/",
    img: ""
  },
  {
    title: "West End Parade of Lights & Elfin Eve",
    source: "Norwood Colorado",
    sourceKey: "norwood",
    date: "December 3, 2026",
    newsTopic: "arts-culture",
    copy: "Holiday parade and festival.",
    href: "https://norwoodcolorado.com/event/west-end-parade-of-lights-elfin-eve-2/",
    img: ""
  },
  {
    title: "Flood damage fixed in a rush",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "November 19, 2026",
    newsTopic: "public-safety",
    copy: "In just over two months, an emergency public works project erected more than 2,000 feet of concrete flood barrier walls before another storm could torrent more debris flows down the Gold Mountain Fire burn scar and damage more homes. The project to repair and re-engineer the damaged watershed betwee",
    href: "https://www.ouraynews.com/2026/11/18/flood-damage-fixed-rush/",
    img: ""
  },
  {
    title: "Electricity rate hikes approved",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "November 19, 2026",
    newsTopic: "recreation",
    copy: "San Miguel Power Association’s board voted unanimously Tuesday to hike nearly all of its rate categories for the next year, including a 27% increase to the flat access fee levied on the vast majority of the co-op’s customers. Marking the fifth straight year of rate increases for the electric provide",
    href: "https://www.ouraynews.com/2026/11/18/electricity-rate-hikes-approved/?ta_paidstory",
    img: ""
  },
  {
    title: "In Ouray, the fireworks show will go on",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "November 19, 2026",
    newsTopic: "public-safety",
    copy: "Despite fire danger concerns, council favors traditional July 4 pyrotechnics over drone display The familiar sights and sounds of Ouray’s Fourth of July fireworks display will return in 2027 — assuming high fire danger doesn’t crash the party. A split city council agreed earlier this month to set as",
    href: "https://www.ouraynews.com/2026/11/18/ouray-fireworks-show-will-go/",
    img: ""
  },
  {
    title: "County signs off on artificial intelligence policy",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "November 19, 2026",
    newsTopic: "government",
    copy: "Ouray County employees will have new guardrails for how to use artificial intelligence tools in their work starting in January, after county commissioners on Tuesday approved their first-ever AI policy. The county developed a draft of the new policy in April, and fleshed it out with feedback from co",
    href: "https://www.ouraynews.com/2026/11/18/county-signs-off-artificial-intelligence-policy/?ta_paidstory",
    img: ""
  },
  {
    title: "Changes looming for city’s remote attendance policy",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "November 19, 2026",
    newsTopic: "government",
    copy: "Ouray City Council members will continue to be able to attend a limited number of meetings online each year, although councilors appear ready to tighten the rules dictating remote governance. The council voted 4-1 Monday night against repealing a five-year-old policy that allows councilors to attend",
    href: "https://www.ouraynews.com/2026/11/18/changes-looming-citys-remote-attendance-policy/",
    img: ""
  },
  {
    title: "Poisonings contradict Top of the Pines’ mission",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "November 19, 2026",
    newsTopic: "recreation",
    copy: "Dear Editor: When the land for Top of the Pines was donated by the Girl Scouts of America in 2002, it was specified that the wildlife must be protected in the future. The TOP mission statement provides for recreational activities while “preserving open space and wildlife habitat and creating a model",
    href: "https://www.ouraynews.com/2026/11/18/poisonings-contradict-top-pines-mission/",
    img: ""
  },
  {
    title: "County budget decisions reinforce skepticism",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "November 19, 2026",
    newsTopic: "government",
    copy: "Dear Editor: As nearly 30-year residents of Log Hill Village, we are deeply concerned by the Ouray County Board of County Commissioners unilateral decision to appropriate the $223,000 remaining in the Piñon Special Assessment Paving District for general county use. When the paving district was estab",
    href: "https://www.ouraynews.com/2026/11/18/county-budget-decisions-reinforce-skepticism/",
    img: ""
  },
  {
    title: "CORRECTION",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "November 19, 2026",
    newsTopic: "infrastructure",
    copy: "An article in the Nov. 12-18 edition of the Plaindealer about the elimination of Ouray County s austerity policy incorrectly indicated Road and Bridge Supervisor Ty Barger declined to comment on his resignation. Barger did not respond to a reporter s emailed request for comment. Instead, he sent an ",
    href: "https://www.ouraynews.com/2026/11/18/correction-20261119-0207-212168/",
    img: ""
  },
  {
    title: "Looking Back",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "November 19, 2026",
    newsTopic: "community",
    copy: "Compiled from the files of The Ouray County Herald, The Ridgway Sun, and The Ouray County Plaindealer 60 Years Ago November 17, 1966 Five Denver youths were sentenced last Thursday in Delta after pleading guilty to reduced charges of malicious mischief in damaging power transformers belonging to the",
    href: "https://www.ouraynews.com/2026/11/18/looking-back-20261119-0207-340361/",
    img: ""
  },
  {
    title: "Long before Mears, pathfinders had four legs",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "November 19, 2026",
    newsTopic: "infrastructure",
    copy: "Visitors to Ouray often look up at the towering peaks and wonder how early miners ever reached their high-altitude claims. We rightfully memorialize Otto Mears, dubbed the Pathfinder of the San Juan Mountains.” Long before Mears blasted his famous toll roads into sheer canyon walls, however, mines w",
    href: "https://www.ouraynews.com/2026/11/18/long-mears-pathfinders-four-legs/?ta_paidstory",
    img: ""
  },
  {
    title: "Parish Bulletin for the Week of November 15th",
    source: "St. Patrick's Catholic Church",
    sourceKey: "stpatricks",
    date: "November 14, 2026",
    newsTopic: "community",
    copy: "This week's parish bulletin is attached. As always, please check the Parish Calendar for the most updated information.Reminders:There will be Lector’s class this weekend right after eachHoly Mass.Altar Server Class Sunday, November 15th at 5:30.T...",
    href: "https://stpatrickstelluride.com/2026/parish-news/parish-bulletin-for-the-week-of-november-15th/",
    img: ""
  },
  {
    title: "Stuff a Cruiser Thanksgiving Food Drive",
    source: "Ouray County",
    sourceKey: "ouray-county",
    date: "November 12, 2026",
    newsTopic: "public-safety",
    copy: "Help the Ouray County Sheriff's Office Stuff a Cruiser full of food for Thanksgiving!",
    href: "https://ouraycountyco.gov/CivicAlerts.aspx?aid=969",
    img: "https://ouraycountyco.gov/ImageRepository/Document?documentID=23006"
  },
  {
    title: "Music Concert December 20th: An Evening of Violin and Piano",
    source: "St. Patrick's Catholic Church",
    sourceKey: "stpatricks",
    date: "November 12, 2026",
    newsTopic: "arts-culture",
    copy: "AN EVENING OF VIOLIN & PIANO Across the Centuries: From Mozart to Piazzolla Sunday, December 20 6:00pm St. Patrick s Catholic Church Telluride, CO Featuring John Flores (violin) Victória Paulino (piano) Warner Solano (piano) Music by Mozart, Beethoven, Rachmaninorf, Villa-Lobos, Piazzolla, Ponce, an",
    href: "https://stpatrickstelluride.com/2026/parish-news/event/music-concert-december-20th-an-evening-of-violin-and-piano/",
    img: ""
  }
];  // 7 regional feeds (West End, Ouray, …)
const SMC_ALERTS = [
  {
    title: "Fairground Facilities Closed Until Further Notice",
    source: "San Miguel County",
    sourceLabel: "San Miguel County",
    category: "Alert",
    date: "2026-11-20",
    pubDate: "2026-11-20T22:36:04.000Z",
    copy: "Due to unforeseen circumstances, the San Miguel County Fairground facilities will be closed until further notice, beginning Friday, November 6th.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=552",
    img: ""
  },
  {
    title: "Treasurer's Office Closed 11/11 - 11/13",
    source: "San Miguel County",
    sourceLabel: "San Miguel County",
    category: "Alert",
    date: "2026-11-12",
    pubDate: "2026-11-12T17:19:09.000Z",
    copy: "The Treasurer's office will be closed Weds 11/11 - Fri 11/13.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=553",
    img: ""
  },
  {
    title: "Black Bear and Imogene Passes Closed for the Winter",
    source: "San Miguel County",
    sourceLabel: "San Miguel County",
    category: "Alert",
    date: "2026-11-03",
    pubDate: "2026-11-03T21:09:59.000Z",
    copy: "Due to changing weather conditions and the onset of winter, Imogene and Black Bear Passes are now officially closed for the season.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=551",
    img: ""
  }
];              // SMC AlertCenter items
const ENGAGE_MEETINGS = [
  {
    projectName: "Facilities Master Plan",
    projectUrl: "https://engagetelluride.org/facilities-master-plan",
    title: "Fruen Building | HARC Site Walks and Preliminary Large Scale Hearings",
    date: "2026-12-02",
    board: "harc",
    dateUrl: "https://engagetelluride.org/facilities-master-plan/widgets/99345/key_dates#43153"
  }
];         // Engage Telluride project key dates
const MANUAL_SUMMARIES_CACHE_DATE = '2026-11-21';
const LEGAL_NOTICES_CACHE_DATE = '2026-11-21';

const MANUAL_SUMMARIES = {
  "med|2026-10-22|Regular Board Meeting":
    "The Telluride Hospital District board meets October 22 at the Wellness Annex (and via Zoom) for a session that's heavier than usual on strategic decisions. The two items worth watching: a discussion and possible action on a Two Site Model — what that means for where and how THD delivers care is the kind of question that has long-term consequences for the whole region — and a Letter of Intent with CommonSpirit Health, a major Catholic health system, which could shape the district's clinical and financial future considerably. New facility updates and partnership reports round out the facility-planning conversation. On the finance side, the board reviews September draft financials, a mill levy budget discussion, and updates on benefits and grants.",

  "tmvoa|2026-10-22|TMVOA Board of Directors Meeting":
    "The TMVOA Board meets October 22 with a full plate. The main event is a 60-minute feasibility analysis of Lots 1007/1008 — whatever direction that study points will likely shape conversation for a while. The board also takes up funding for Mountain Munchkins childcare, Plaza Guest Services, and Conference Center Plaza enhancements, along with a Telluride Arts grant request and an MV Post Office expansion. A Workforce Housing Working Group recap is on for informational purposes. Budget planning meetings are set for November 5, 19, and December 3, with a Members Meeting December 17. The session closes with executive session on personnel matters.",

  "telluride|2026-10-22|Planning & Zoning Commission - Oct 22 2026":
    "The October 22 P&Z meeting carries two items of broader public consequence. First, the Shandoka Lot Redevelopment — a Preliminary PUD application for Town-owned property at 860 Black Bear Rd — finally gets its hearing after being continued from the September 24 meeting due to staff capacity. The proposal would increase certain dimensional limitations in exchange for public benefits on the 4.07-acre Accommodations 2-zoned parcel. Second, a Minor Subdivision at 238 North Pine Street has been making the rounds since February; the applicant now requests it be tabled another eight months. A work session on a proposed four-lot commercial subdivision at 216 & 222 W San Juan Avenue rounds out the evening.",

  "telluride|2026-10-22|Planning & Zoning Commission Chair - Oct 22 2026":
    "The October 22, 2026 Planning & Zoning Commission Chair agenda hasn't been posted yet.",

  "county|2026-10-22|Board of Adjustment Meeting":
    "The San Miguel County Board of Adjustment meets October 22 with one substantive item: a variance request from a Mountain Village parcel (Parcel #456536200023) to reduce the required setback from County Road 63L right-of-way. Board members will visit the site — located across from the County Jail — at 9 a.m. before convening. Approval of October 2025 minutes is also on the agenda. The meeting opens with a moment of silence for Jim Botenhagen.",

  "county|2026-10-26|Open Space Commission Meeting":
    "The October 26 Open Space Commission agenda hasn't been posted yet.",

  "telluride|2026-10-27|Town Council - Oct 27 2026":
    "Three substantive items anchor this meeting. Council takes up the Fourth Supplement to the Gondola IGA, extending cost-sharing for the 2027 planning and development budget on the gondola replacement project — a line that connects directly to the SMART 3A funding voters approved. Two ordinances get first reading: one amending the Telluride Energy Mitigation Program (TEMP) under the municipal code, and one that would suspend the 5% capital fund allocation for open space in 2027 — a notable carve-out worth watching given the town's budget pressures. A work session covers special events on town property in 2026 and a proposed two-night concert in Town Park in August 2027. The long-running Stender Residence HARC appeal is continued again. Council also appoints an Open Space Commission member and approves routine minutes and a liquor licensing hearing officer.",

  "county|2026-10-28|Board of County Commissioners Work Session":
    "The October 28 BOCC Work Session in Placerville has been posted, but no agenda detail beyond the meeting name and location has been provided. There's no way to know what's on the table until the full agenda drops.",

  "telluride|2026-11-04|Ecology Commission - Nov 04 2026":
    "The Ecology Commission meets to finalize its 2027 workplan and, more consequentially, to discuss a draft ordinance that would phase out combustion-powered lawn and garden equipment within town limits. The proposed ordinance — a new Article 10 added to Chapter 7 of the Municipal Code — would ban gas-powered leaf blowers by 2028 and all other covered equipment by 2030. The recitals cite the box canyon's particular sensitivity to noise (90–110 decibels, amplified by the terrain) and air quality impacts. Colorado's HB23-1161 already provides a 30% point-of-sale discount on electric replacements, and the San Miguel Power Association offers additional rebates up to 25%, potentially offsetting roughly half the replacement cost. Exceptions are included for pre-adoption dual-use enclosed-cab tractors. The commission also votes to formally adopt its 2027 workplan, which carries forward ongoing threads: the Climate Action Plan update, bear safety programming, Trash Bash, Green Grants, and landscaping ordinance advocacy.",

  "telluride|2026-11-04|Commission for Community Assistance, Arts & Special Events - Nov 04 2026":
    "The Commission for Community Assistance, Arts & Special Events works through a full plate of calendar and banner requests from Telluride Arts — Art Walk dates running from December 2026 through May 2027, plus a Holiday Arts Bazaar in December 2027 — and a date change request from SBG Productions moving the Telluride Jazz Festival to August 13–15, 2027. The more consequential work happens in the afternoon worksession: the Grant Subcommittee's financial training, a discussion of 2027 grant guidelines and philosophies, and a first look at revised 2027 special event policies. The subcommittee also brings back a recommendation on grant application discrepancies it flagged at its October 23 meeting.",

  "telluride|2026-11-04|Telluride Housing Authority Subcommittee - Nov 04 2026":
    "The November 4, 2026 Telluride Housing Authority Subcommittee agenda hasn't been posted yet.",

  "county|2026-11-04|Board of County Commissioners Meeting":
    "A relatively light BOCC session. The consent agenda includes acceptance of the September road report, approval of October minutes, and ratification of a letter supporting a ban on recreational prairie dog shooting on public lands. Administrative matters include a quarterly update from the Tres Rios BLM Field Office, adoption of Resolution 2027-38 setting the 2027 meeting schedule, a resolution setting the 2027 Vegetation Control and Management Fee schedule, and a professional services agreement with RMMI Digital Document Solutions to digitize Planning Department files. The Natural Resources and Climate Resilience update includes a motion to sign on to a CC4CA letter opposing legal immunity for Big Oil. The Board will also convene in executive session to discuss potential legislation related to the county's Suncor/Exxon litigation. Sitting as the Housing Authority, commissioners will consider exception requests from Esperanza Reyes to continuing residency and employment standards under her deed restriction.",

  "telluride|2026-11-05|Special Meeting - Planning & Zoning Commission - Nov 05 2026":
    "The November 5, 2026 Special Meeting – Planning & Zoning Commission agenda hasn't been posted yet.",

  "telluride|2026-11-05|Town Council Budget - Nov 05 2026":
    "The November 5, 2026 Town Council Budget agenda hasn't been posted yet.",

  "tmvoa|2026-11-06|TMVOA Board of Directors Budget Meeting #1":
    "The Telluride Mountain Village Owners Association opens its three-meeting budget cycle for 2027 with this first session on November 6. The bulk of the afternoon goes to two substantive items: a presentation of the completed 2025 audit and tax return by CLA (Clifton, Larson, Allen LP), and a first look at the 2027 draft budget. Two more budget sessions follow — November 19 and December 3 — before the Members Meeting on December 17, where the budget is expected to be finalized. Routine minutes approval and public comment round out the agenda.",

  "telluride|2026-11-09|Open Space Commission - Nov 09 2026":
    "The Open Space Commission takes up three items Monday. First is a letter from resident Ramona Gaylord pressing the Commission for a full accounting of the goat grazing pilot on the Valley Floor — two seasons in, she wants the pre- and post-grazing vegetation data, the established success criteria, total program costs, wildlife disturbance assessments (particularly regarding the elk herd and the long-standing dog prohibition), and a clear public timeline for deciding whether goats return in 2027. Second is review and approval of the 2026/2027 Annual Winter Use Operational Plan for the Valley Floor, covering Nordic grooming schedules, trail routes, temporary bridge installation, and the SMBA Fat Bike Nordic Relay (capped at 50 participants, December 15–March 19). Third is an update from Nancy Craft on native engagement activities, including an August meeting with Ernest House Jr. of the Ute Mountain Ute Tribe on Valley Floor signage updates and the question of a land acknowledgment.",

  "norwood|2026-11-10|Norwood Water Commission Meeting":
    "The November 10, 2026 Norwood Water Commission Meeting agenda hasn't been posted yet.",

  "norwood|2026-11-11|Board of Trustees Meeting":
    "The November 11, 2026 Norwood Board of Trustees Meeting agenda hasn't been posted yet.",

  "ridgway|2026-11-11|Ridgway Town Council Regular Meeting":
    "The November 11, 2026 Ridgway Town Council Regular Meeting agenda hasn't been posted yet.",

  "telluride|2026-11-02|Rescheduled/Special Meeting - Planning & Zoning Commission Chair - Nov 02 2026":
    "This rescheduled P&Z Chair meeting — moved from October 22 to November 2 — has a single item on it: a minor subdivision at 510 W Columbia Avenue/129 N Townsend Street. The application asks to vacate the internal lot line between Lots 39 and 40 in the West Telluride Addition and merge them into one approximately 5,625-square-foot lot. It's a lot consolidation in the Historic Residential zone district, not a new development proposal.",

  "telluride|2026-10-22|(Rescheduled to 11/2) Planning & Zoning Commission Chair - Oct 22 2026":
    "This October 22 Planning & Zoning Commission meeting has been rescheduled to Monday, November 2nd at 9:00 a.m. at Rebekah Hall, 113 W Columbia Ave.",

  "smart|2026-11-12|SMART Board of Directors":
    "The November 12, 2026 SMART Board of Directors agenda hasn't been posted yet.",

  "school|2026-11-16|Telluride Board of Education Work Session":
    "A work session, so no votes — but four discussion items are on the table. The board revisits takeaways from its August governance retreat, where members worked through strategic priorities, community engagement, and financial stewardship with an outside facilitator. Strategic financial planning gets its own dedicated slot, relevant context given that a Special Board Meeting to approve the mill levy is already scheduled for December 14. The board also takes up homeschool student enrollment in specials and electives, and short-term enrollment — a perennial question in a small district where community boundaries blur. Finally, there's a brief discussion of KOTO access on November 19.",

  "norwood|2026-11-16|Planning and Zoning Commission Meeting":
    "Norwood's Planning and Zoning Commission meets November 16 at 6:30 p.m. at Town Hall. The substantive work is on two fronts that tend to shape everything else: a Land Use Code update and a Master Plan update — the kind of foundational documents that determine what gets built where for years to come. The commission also takes up a discussion of the Board of Adjustments, which handles variance requests and sits at the intersection of the code and how it actually gets applied on the ground.",

  "fire|2026-11-17|Board of Directors Meeting":
    "The Telluride Fire Protection District board meets November 17th at 5:30 p.m. at 131 W. Columbia Ave. The heaviest lifting is financial: a Municipal Capital Markets Group presentation suggests the district is exploring debt or financing options, FCI pre-build estimates point toward construction planning, and the budget gets its second reading. On the ongoing side, the board continues tracking the Station 3 project, an inclusion initiative, and PANO system usage. Staff reports round out the evening.",

  "school|2026-11-17|Telluride Board of Education Monthly Meeting":
    "The board opens with a debrief on November ballot results — Ballot Measure 5A (the MLO), Proposition NN, Amendment 87, and Propositions 134 and 135 — which will shape school funding going forward. Flood expense estimation is on the table as well, a reminder that the canyon's geography comes with costs that don't show up in a normal budget cycle. The superintendent search moves into action: the board takes up approval of a search consultant. Policy updates get a first reading, covering four board-level policies (IHCDA, KDB, IKF-E, AC) and four superintendent-level policies (KF, KF-E, IKA, IKA-R). The meeting closes with an executive session on collective bargaining strategy with the Telluride Education Association. A December 14 special meeting is already scheduled to approve the mill levy.",

  "ophir|2026-11-17|General Assembly Meeting":
    "The November 17, 2026 Ophir General Assembly Meeting agenda hasn't been posted yet.",

  "telluride|2026-11-17|Town Council - Nov 17 2026":
    "The big item this meeting is the 2027 budget — Council takes it to a vote alongside the property tax levy that funds it. Woven into that same session: second reading of an ordinance suspending the 5% Open Space Fund dedication from Real Estate Transfer Tax revenue for the 2027 budget year, a recurring tension between fiscal pressure and the land-conservation commitments voters have long expected. Also on second reading: amendments to the Telluride Energy Mitigation Program (TEMP), with a companion action item updating TEMP's energy offset fee calculator. The morning work sessions carry weight too — a 60-minute discussion on establishing a sewer authority is the kind of infrastructure governance question that tends to reshape how utilities are managed and funded for years. An extended producer responsibility update covers the state's new composting mandate and what local curbside service might look like. A Canyonlands/Tower House project update appears in the manager's report. Two executive sessions close the day: one on open space property interests, one on town facilities.",

  "rico|2026-11-18|Rico Board of Trustees Regular Meeting":
    "The November 18, 2026 Rico Board of Trustees Regular Meeting agenda hasn't been posted yet.",

  "telluride|2026-11-18|Historic & Architectural Review Commission Chair - Nov 18 2026":
    "One item on this HARC agenda: a request to extend a certificate of appropriateness for a minor activity at 115 W Colorado, a Historic Commercial zone property owned by Monkeywrench Industries LLC. Extensions like this are routine housekeeping — keeping an approved project alive a little longer inside the Historic Preservation Overlay District.",

  "telluride|2026-11-18|Historic & Architectural Review Commission - Nov 18 2026":
    "A heavy agenda for November 18. The two items that have been waiting since August — the Shandoka Lot redevelopment preliminary large-scale reviews for Buildings 1 & 2 and Buildings 3 & 4 at 860 Black Bear Rd — are finally being heard, with the Town of Telluride as applicant and Design Workshop doing the design work. Both involve new construction outside the historic district exceeding 5,000 sq ft in an Accommodations 2 zone. Also on the docket: preliminary large-scale reviews for two other Town-owned sites — 113 W Columbia (Rebekah Hall itself, demolition of the existing principal structure plus new construction over 5,000 sq ft) and 335 W Colorado (demolition of a THAS-rated primary structure, large-scale new construction, and relocation of two historic sheds). A privately owned property at 421 E Columbia gets a small-scale addition and minor alterations. The two 238 N Pine applications are continued without discussion to April 21, 2027. HARC also elects its chair and vice chair and reviews its 2026 annual report.",

  "telluride|2026-11-18|Parks & Recreation Commission - Nov 18 2026":
    "A routine Parks & Recreation Commission meeting. The one action item is a proposed update to the Town Park Pavilion Banner Policy — specifically to add a category recognizing Telluride high school senior athletes participating in winter sports organizations under contract with the town. The policy sets display timing (first day back from holiday break through end of ice rink season), design standards keyed to Telluride R-1 School District specs, and a $10 installation fee per banner. The worksession covers a recap of P&R facilities and operations across spring, summer, and fall 2026. Staff reports touch on the Warner Field fence and safety netting project (Phase 1 of Core Area Improvements), the Hanley Ice Rink opening for 2026–2027, the coed hockey league launching November 15 with 11 teams, winter programming, the Winter Community Housing Program starting in the Town Park lot on November 23, and upcoming events including Noel Night and New Year's Eve.",

  "county|2026-11-18|Board of County Commissioners Meeting":
    "The November 18 Board of County Commissioners regular meeting is being held in Norwood. The posted agenda doesn't include any item detail beyond the location — nothing on what's actually being taken up.",

  "county|2026-11-09|Intergovernmental Meeting - San Miguel County Hosts":
    "The November 9 Intergovernmental Meeting hosted by San Miguel County has been posted, but the agenda carries no substantive detail beyond the meeting title itself. When the county convenes with its municipal partners — Telluride, Mountain Village, Norwood, and others — the conversations tend to touch the issues that don't fit neatly inside any single jurisdiction's boundaries. What exactly is on the table this time hasn't been shared yet.",

  "smart|2026-11-16|SMART Gondola Advisory Committee":
    "The November 16 SMART Gondola Advisory Committee agenda hasn't been posted yet.",

  "mv|2026-11-05|Design Review Board":
    "The November 5 Design Review Board agenda is made up entirely of single-family residence items — an easement encroachment work session at 120 Vischer Dr., an easement encroachment quasi-judicial review at 112 Stevens Dr., and three linked items for a new home at Lot 98 on Mountain Village Blvd. (height variance, initial architecture review, and vested property rights, the latter two going to Town Council as recommendations). Nothing of broad public consequence is on the agenda.",

  "mv|2026-11-19|Town Council Meeting":
    "A full agenda this Thursday. The budget cycle is front and center: Council opens a public hearing on the Mountain Village Metro District's proposed 2027 budget, then takes up first readings on both the 2027 Town budget ordinance and the 2026 property tax levy ordinance, followed by adoption of the 2027 fee schedules. On the land use side, a minor subdivision for Lots 640A and OSP-35-A gets a resolution vote. Items 14 and 15 — a height variance and vested property right for a single-family home on Lot 98 — are both continued to January. Two work sessions carry real weight: one on the draft sewer authority agreement between Mountain Village and Telluride for a new regional wastewater treatment plant, and one checking in on the Rural Homes Ilium affordable housing feasibility study. Council also considers a letter of support for the Colorado Association of Ski Towns' 2027 legislative agenda, votes on a Public Art Commission appointment, and reviews third-quarter financials. The evening closes with an executive session on the ongoing Sunset Concert litigation.",

  "airport|2026-11-19|TRAA Board of Commissioners Meeting":
    "The November 19 TRAA Board of Commissioners Meeting agenda hasn't been posted yet.",

  "tmvoa|2026-11-19|TMVOA Board of Directors Budget Meeting #2":
    "The TMVOA Board holds its second budget meeting of the cycle, working through the 2027 budget ahead of a members meeting on December 17. The board will also review the 2025 Form 990 — the organization's annual federal financial disclosure — and hear a briefing on the overall budget process. The meeting closes with a 30-minute executive session with legal counsel on ongoing negotiations, under C.R.S. § 38-33.3-308(4)(b) and (f); no action will be taken in that session. A third budget session is scheduled for December 3.",

  "county|2026-11-12|Planning Commission Meeting":
    "Two substantive items on the November 12 agenda. The morning work session takes up proposed amendments to LUC Section 5-1303 — the Affordable Housing Impact Mitigation Fee — along with a broader discussion of housing incentive ideas. That fee structure has real implications for how (and whether) workforce housing gets built across the county, so the conversation is worth watching. After lunch, the commission moves to a formal land use application: a county-initiated rezoning of a portion of Placerville Park around the fire station, from Forestry, Agriculture, and Open (F) to Public (P) — a housekeeping move to bring the zoning in line with the site's actual public use.",

  "telluride|2026-11-19|Resident Advisory Committee - Nov 19 2026":
    "The November 19, 2026 Resident Advisory Committee agenda hasn't been posted yet.",

  "telluride|2026-11-19|Planning & Zoning Commission - Nov 19 2026":
    "A light agenda for this one. The 222 West San Juan Avenue subdivision work session — which had been continued from October — has since been withdrawn by the applicant, so it won't be heard. The commission will get a presentation on wildfire modeling technologies from Firebird Chief Scientist Jason Sibold, and continue a work session on potential Land Use Code amendments to landscaping requirements (LUC 3-502) and tree maintenance and removal rules (LUC 3-505). The board will also elect a new chair and vice chair, hear about the December 3 Comprehensive Plan community engagement session, and review the draft 2027 meeting calendar.",

  "telluride|2026-11-19|Planning & Zoning Commission Chair - Nov 19 2026":
    "The November 19, 2026 Planning & Zoning Commission Chair agenda hasn't been posted yet.",

  "telluride|2026-11-19|Liquor Licensing Authority - Nov 19 2026":
    "Three special event liquor permits are on the table for early December. The Telluride Nordic Association is requesting a permit for its annual membership party on December 2 (5:00–7:30 pm, ~50 attendees) at 300 S. Townsend St. Second Chance Humane Society follows with a holiday wreath-making workshop benefiting animal rescue on December 3 (4:00–8:30 pm, ~30–35 people) at the same location. The Town of Telluride itself is seeking a permit for its employee holiday party on December 10 (3:00–10:00 pm), also at 300 S. Townsend. Staff recommends approval on all three. The Authority will also ratify minutes from the October 14 special meeting, where permits for the Telluride Horror Show were approved.",

  "telluride|2026-10-26|Gondola Sub Committee - Oct 26 2026":
    "The Gondola Advisory Committee meets virtually on October 26 at 3:00 PM. The main substantive item is a Federal Transit Administration Capital Investment Program update from Ed Parks and Gavin Poindexter — a signal of where federal funding pursuit stands for the gondola project. Amber Blake follows with SMART and partner jurisdiction updates. Miles Graham handles new business and public comment, each allotted five minutes.",

  "smart|2026-10-26|SMART Gondola Advisory Committee":
    "The Gondola Advisory Committee meets virtually on October 26. The main item is a 25-minute informational update on the FTA Capital Investment Program — the federal funding pipeline that the gondola project depends on — presented by Ed Parks and Gavin Poindexter. Amber Blake follows with SMART and partner jurisdiction updates. Miles Graham handles new business and public comment, each allotted five minutes. No votes or formal actions are on the agenda; this is a status-check meeting.",

  "tmvoa|2026-10-27|TMVOA Finance &amp; Budget Committee":
    "The October 27 TMVOA Finance & Budget Committee agenda hasn't been posted yet.",

  "telluride|2026-10-23|Commission for Community Assistance, Arts & Special Events - Grant Subcommittee -Oct 23 2026":
    "The Grant Subcommittee meets to work through discrepancy matrices from the 2027 grant applications — the internal reconciliation step where reviewers compare scores and flag inconsistencies before recommendations move forward.",

  "county|2026-10-26|San Miguel Basin Fair Board Meeting 10/26":
    "The San Miguel Basin Fair Board holds its regular October meeting with County Manager Mike Bordogna presenting alongside a guest presentation on the Fair Board nonprofit structure. Financial business includes outstanding receipts from the Junior Livestock Sale, sponsorships, and added money, plus an early look at the 2027 budget and grant updates from Westmeath and Lone Cone Legacy Trust. Coordinators for 4-H, the fairgrounds, and Parks & Open Space each give reports. Old business covers proposed rule changes and panel/gate purchases for next year. New business takes up a board member application from Ashley Tomlinson, setting 2027 weigh-in dates, and brainstorming band and entertainment options. Next meeting is set for November 9.",

  "ouray|2026-10-27|Board of County Commissioners":
    "The Ouray County BOCC meets October 27 at the 4-H Event Center in Ridgway. The board takes up a fifth extension of the Emergency Disaster Declaration — a marker of how long the county has been navigating that situation. General business includes two vacancy-fill requests under the austerity resolution (Clerk and Recorder's Office, Treasurer's Office), a response letter on the Si Se Puede trademark dispute with UFW, a road materials supply agreement, and a resolution supporting Proposition 137 on the November 3 ballot. The board also considers a proclamation naming October 28 Gold Mountain Fire First Responder Appreciation Day. Sitting as the Local Licensing Authority, commissioners review a liquor license renewal for Divide Ranch. Sitting as the Board of Adjustment, they hold a public hearing on a Land Use Code variance request from Martha Campbell and the Home Trust of Ouray County for a property on County Road 24D. Blair & Associates presents the 2025 audited financial report.",

  "ouray|2026-10-27|Board of County Commissioners Work Session":
    "A work session, so no formal votes — but the main business is consequential: commissioners take up the proposed merger of EMS and Ridgway Fire, with a budget and operational discussion followed by a preliminary draft agreement for BOCC input. Merging emergency services is the kind of structural decision that shapes response times, staffing, and costs for years. Commissioner and administrative reports fill the earlier part of the afternoon.",

  "ouray|2026-10-28|Board of County Commissioners Work Session":
    "A work session — no formal votes — with two substantive conversations on the table. First, CDOT walks the commissioners through its annual planning presentation, covering what the state transportation agency has in store for the US-550 corridor and surrounding roads. Then the discussion shifts to FEMA Public Assistance, focusing on Ouray County's ongoing recovery projects and road damage assessments. Anyone who's watched mountain roads take a beating through wet cycles knows how long the repair queue can get — and how much of the funding story runs through federal reimbursement timelines.",

  "school|2026-11-04|Telluride Board of Education Work Session":
    "The Board of Education meets Wednesday, November 4 at 3:30 PM at Bridal Veil for a work session focused on one item: interviewing student candidates for the Student Representative seat on the school board. Each candidate gets two minutes per question, covering their motivations, how they'd gather and share peer input, how they'd elevate underrepresented student voices, and how they'd manage the time commitment — which includes twice-monthly board meetings and a Colorado Association of School Boards conference in Colorado Springs, December 3–5, 2026.",

  "county|2026-11-23|Open Space Commission Meeting":
    "The November 23 Open Space Commission Meeting agenda hasn't been posted yet.",

  "county|2026-11-23|Open Space Commission Meeting 11/23":
    "The November 23 San Miguel County Open Space Commission agenda hasn't been posted yet.",

  "med|2026-11-26|Regular Board Meeting":
    "The November 26, 2026 Mountain Village Metropolitan District Regular Board Meeting agenda hasn't been posted yet.",

  "county|2026-10-29|Citizen's Weed Advisory Board":
    "The Citizens Weed Advisory Board meets October 29 in Norwood for a routine session covering administrative ground: approving August 2026 minutes, setting three proposed 2027 meeting dates (March 25, August 26, October 28), and working through several standing administrative questions — whether Vegetation Control & Management has the authority to handle enforcement, how grant funds are shaping up for 2027, the status of America the Beautiful funds, and who has actually signed the board's Code of Conduct. The included meeting minutes from 2025 show the operational backdrop: 419 acres treated last year, ongoing Tamarisk biocontrol monitoring in Disappointment Valley with uncertain beetle results, and a persistent gap in board membership and enforcement capacity under Senate Bill 2431.",

  "tmvoa|2026-10-29|TMVOA Audit &amp; Compliance Committee":
    "The October 29 TMVOA Audit & Compliance Committee agenda hasn't been posted yet.",

  "telluride|2026-11-17|(Lottery) Telluride Housing Authority - Nov 17 2026":
    "The November 17, 2026 Telluride Housing Authority agenda hasn't been posted yet.",

  "telluride|2026-11-12|Vending Subcommittee - Nov 12 2026":
    "The Vending Subcommittee meets to approve minutes from September 23 and to act on the remaining open permit for the 2026-2027 winter vending season at Gondola Plaza. The Gondola Plaza East spot was already awarded to Mini Deli (PhilAm, LLC) in September. Up now is Gondola Plaza West, where The Gyro Cart — a returning vendor with eight consecutive summer seasons on Oak Street East — has submitted a late application to operate through the winter season serving lamb gyros, chicken shawarma, Greek salads, and related items, 11am to 4pm. Staff recommends granting the permit. Winter vending permits run $250 for the season.",

  "norwood|2026-11-02|Norwood Water Commission Work Session":
    "The Norwood Water Commission sits down for a work session focused on a single item: the 2027 draft budget. Work sessions are deliberative — no formal action can be taken — so this is the commission's chance to work through the numbers before anything goes to a vote. The meeting is at Norwood Town Hall on Naturita Street at 6:00 p.m., with a Zoom option available.",

  "telluride|2026-11-02|Special Meeting - Planning & Zoning Commission Chair - Nov 02 2026":
    "The November 2, 2026 Planning & Zoning Commission Chair special meeting agenda hasn't been posted yet.",

  "med|2026-11-03|Regular Board Meeting":
    "A short special meeting — just 30 minutes on the books — with one substantive item: a proposal from Jensen Partners to provide support through the due diligence process with CommonSpirit. CommonSpirit Health is one of the largest nonprofit hospital systems in the country, and any formal due diligence engagement signals that a potential partnership, affiliation, or transaction is being evaluated seriously. The board meets at the Wellness Annex (500 W Pacific Ave) and via Zoom at 3:00 PM. The next regular board meeting is November 19.",

  "telluride|2026-11-02|Special Meeting - Planning & Zoning Commission Chair - Nov 02 2026 at 10:30 AM":
    "A single item is on this rescheduled P&Z Chair meeting: a minor subdivision at 510 W Columbia Avenue / 129 N Townsend Street. The application asks to vacate the internal lot line between Lots 39 and 40 in Block 9 of the West Telluride Addition, merging them into one roughly 5,625-square-foot lot designated Lot 40R. The property sits in the Historic Residential zone district. Nothing of broad public consequence is on the agenda beyond this routine lot consolidation.",

  "ouraycity|2026-11-02|Ouray City Council Regular Meeting":
    "The main business this evening is the 2027 budget. Council holds a public hearing on the proposed City of Ouray budget and takes up two ordinances on second reading: Ordinance 7 sets the 2027 rates for water, sewer, surcharge, refuse, and recycling; Ordinance 8 amends the municipal code to add a rate category specifically for light industrial operations — a new wrinkle in how the city classifies utility customers. Council also considers ratifying a Caterpillar equipment lease-purchase agreement and approving an MOU with the Ridgway Fire Protection District covering fire, EMS, training, and operational cooperation. On the liquor license side, The Yankee Girl Café has a new application before the council. The consent agenda includes four appointments to the Main Street Committee and a liquor license renewal for Ouray Lodge No. 492.",

  "telluride|2026-12-02|Commission for Community Assistance, Arts & Special Events - Dec 02 2026":
    "The December 2 CCAASE meeting is largely a calendar and banner housekeeping session for 2026-2027 events, with one item that carries a bit more weight. The commission holds a public hearing on a street closure request from AB Legacy (Telluride Sleighs and Wagons) for the 2027 Telluride Skijoring and Winter Celebration — an expanded footprint compared to the one-year-only approval granted for 2026. The 2027 request adds closure of South Pine St., both sides of Fir St., and extends the closure window from Thursday, March 11 through Monday, March 15. That dates overlap with the Spring Break Festival (March 11–13) is flagged in the staff memo. Beyond skijoring, the board takes up calendar and banner requests from Telluride Arts (Noel Night), Telluride AIDS Benefit (Fashion Week date shift to Feb 18–March 1), and Telluride Youth Lacrosse (May 22–23 tournament), plus a full slate of 2027 single, double, and triple banner hang approvals. The commission also considers adopting its 2027 Special Event Policies — a document that was workshopped in November and returns here for formal action.",

  "telluride|2026-12-02|Telluride Housing Authority Subcommittee - Dec 02 2026":
    "The December 2, 2026 Telluride Housing Authority Subcommittee agenda hasn't been posted yet.",

  "county|2026-11-25|Board of County Commissioners Work Session":
    "The November 25 Board of County Commissioners Work Session agenda hasn't been posted yet.",

  "mv|2026-12-03|Design Review Board":
    "The December 3 Mountain Village Design Review Board agenda hasn't been posted yet.",

  "norwood|2026-11-04|Board of Trustees Budget Work Session":
    "The Norwood Board of Trustees sits down for a work session on the 2027 draft budget. No formal action can be taken at a work session — this is the stage where trustees dig into the numbers before any votes. Budget season in a small mountain town is always a tight exercise, and what gets funded (and what doesn't) shapes everything from road maintenance to staffing.",

  "tmvoa|2026-12-03|TMVOA Board of Directors Budget Meeting #3":
    "The December 3 TMVOA Board of Directors Budget Meeting #3 agenda hasn't been posted yet.",

  "telluride|2026-12-03|Town Council Retreat - Dec 03 2026":
    "The December 3 Town Council Retreat is a single three-hour work session: a comprehensive overview of Town funds, presented by Finance staff Zach Cartya, Heather Pezzella, and Zoe Dohnal. No action items or votes are scheduled — this is a working briefing for Council, the kind of session where the numbers get laid out before the formal budget process moves forward.",

  "county|2026-11-09|San Miguel Basin Fair Board":
    "The November 9 San Miguel Basin Fair Board agenda hasn't been posted yet.",

  "county|2026-11-16|Open Space Commission Meeting":
    "The November 16 Open Space Commission agenda hasn't been posted yet.",

  "telluride|2026-12-04|Special Town Council - Dec 04 2026":
    "This special meeting is a single-item public hearing: Town Council sits as an appellate body to review a challenge to HARC's September 16, 2026 approval of a new construction project at 208 S Fir Street. The appellant, an adjacent property owner at 150 W Pacific Avenue, filed the appeal on September 30, 2026. At issue is a three-story, 34.88-foot addition behind a reconstructed historic Supporting structure — bringing the project to 5,033 sq ft on a 3,525 sq ft lot in the Commercial zone, within the Telluride Historic Landmark District. The core argument: HARC approved the building without ever formally determining which design guidelines govern it — whether the replica qualifies as a rated Supporting structure reconstruction (triggering subordination and height standards) or as new construction on a vacant lot. HARC also amended a sequencing condition from its 2021 demolition approval, and the appellant contends that amendment was made without the findings the Land Use Code requires. Council will hear both appeals.",

  "telluride|2026-11-09|Intergovernmental Meeting - Nov 09 2026":
    "San Miguel County hosts this intergovernmental work session with representatives from Telluride, Mountain Village, Ophir, Norwood, and the county itself. The session opens with a regional large-projects update covering all five jurisdictions — the kind of cross-entity check-in that surfaces where development pressures and infrastructure needs are colliding across the valley. From there, County Emergency Manager Shannon Armstrong presents an updated Multi-Jurisdictional Hazard Mitigation Plan process, followed by an update on Indigenous tribal relations from Marya Stark, lead for the Indigenous People's working group. The session closes with a presentation from Elaine Demas of the Telluride Foundation on a shared inter-jurisdictional housing framework being structured to qualify under Proposition 123 — the state affordable housing program that comes with real money attached, if the jurisdictions can demonstrate the required coordination. No formal action can be taken at a work session.",

  "ouray|2026-11-10|Board of County Commissioners":
    "The November 10 BOCC meeting carries a full load. The afternoon brings two public hearings: the Curry Regular PUD, a request to split a 14.42-acre parcel on County Road 1 into two lots and open space via a combined preliminary/final development plan; and a 2026 budget amendment. In general business, the board takes up a request to repeal Resolution 2025-043 — the austerity resolution that has been governing hiring — alongside four separate vacancy-fill requests under that same resolution for EMS and Road & Bridge. Also on the docket: a termination notice for the Ourway service due to lack of funding, the Albertson's opioid settlement form, potential negotiations with the City of Ouray over the Emergency Management Department and Coroner's Office, courthouse HVAC repairs, a rodeo shed replacement, and retirement plan participation agreement updates. The consent agenda wraps up multiple Corbett Creek project change orders and project acceptance.",

  "ouray|2026-11-10|Board of County Commissioners Work Session":
    "A work session, so no formal votes — but the direction set here shapes what comes next. The afternoon opens with back-to-back presentations from EcoAction Partners and San Miguel Power Association, covering an hour on energy and environmental programming. Then the commissioners shift to something newer on the civic agenda: a review of a draft AI resolution and draft policy, tied to Colorado Senate Bill 26-189, the state's emerging AI governance framework. Commissioner and administrative updates close things out.",

  "county|2026-11-16|Open Space Commission Meeting 11/23":
    "The Open Space Commission meets November 16 with a full slate of trail, park, and conservation updates. On the trail side, three projects get status reports: the Down Valley Connector, the East End Connector, and the South Side Perimeter Trail — each one part of the longer effort to stitch together accessible routes across both sides of the canyon. Parks updates cover Mill Creek and Galloping Goose. Conservation easement work continues on three properties: Beaver Mesa Ranch, Indian Ridge Farm, and O.A. Greager. The commission also takes up a membership appointment, considering Daniel Alvarado for a regular seat.",

  "ouraycity|2026-11-10|Ouray Planning Commission Regular Meeting":
    "The Ouray Planning Commission takes up two substantive matters at its November 10 meeting. First, an action item on restricting natural medicine — a proposed ordinance that would regulate or limit psychedelic substances in city limits, a question municipalities across Colorado have been navigating since voters passed Proposition 122 in 2022. Second, a discussion on proposed amendments to Chapter 7 of the Land Use Code that would define short-term rentals and bed-and-breakfasts — the kind of definitional work that tends to quietly shape how STR enforcement and permitting plays out for years afterward. The commission also considers a remote-participation request from Commissioner Wood and approves minutes from three prior meetings dating back to February. Planning Commission vacancies round out the agenda.",

  "telluride|2026-12-07|Open Space Commission - Dec 07 2026":
    "The December 7, 2026 Open Space Commission agenda hasn't been posted yet.",

  "norwood|2026-12-08|Norwood Water Commission Meeting":
    "The December 8, 2026 Norwood Water Commission Meeting agenda hasn't been posted yet.",

  "tmvoa|2026-12-08|Mountain Village Merchant Meeting":
    "The December 8 Mountain Village Merchant Meeting agenda hasn't been posted yet.",

  "norwood|2026-12-09|Board of Trustees Meeting":
    "The December 9, 2026 Norwood Board of Trustees Meeting agenda hasn't been posted yet.",

  "ridgway|2026-12-09|Ridgway Town Council Regular Meeting":
    "The December 9, 2026 Ridgway Town Council Regular Meeting agenda hasn't been posted yet.",

  "county|2026-12-09|Board of County Commissioners Regular Meeting":
    "The December 9 Board of County Commissioners Regular Meeting agenda hasn't been posted yet.",

  "telluride|2026-11-17|(Master Lease Lottery) Telluride Housing Authority - Nov 17 2026":
    "The Telluride Housing Authority meets to conduct two Master Lease Lottery drawings — one for the Telluride Boarding House at 1100 Black Bear Rd and one for the Virginia Placer IIA Apartments at 1280 Black Bear Rd. Both drawings proceed under Employee Rental Housing Policies §107 and 707.2. For anyone waiting on workforce housing up on Black Bear Road, this is the meeting that determines who gets in.",

  "mv|2026-12-10|Town Council Meeting":
    "The December 10, 2026 Mountain Village Town Council Meeting agenda hasn't been posted yet.",

  "county|2026-12-10|Planning Commission Meeting":
    "The December 10 San Miguel County Planning Commission agenda hasn't been posted yet.",

  "telluride|2026-11-12|San Miguel Authority for Regional Transportation - Nov 12 2026":
    "SMART's board convenes virtually to act on three resolutions: routine agenda/minutes approval, a resolution of support for comments on proposed changes to a federal Capital Investments Grant Program, and an amendment to the Executive Director's employment agreement. The gondola project gets a verbal update — always worth watching given the ongoing SMART Ballot Issue 3A context. The board also receives the November operations report and Q3 2026 performance data before closing with an executive session on personnel matters concerning the Executive Director position.",

  "county|2026-12-03|One Time Event":
    "San Miguel County commissioners are holding a special meeting on December 3rd. No agenda has been posted yet.",

  "smart|2026-12-10|SMART Board of Directors":
    "The December 10, 2026 SMART Board of Directors agenda hasn't been posted yet.",

  "med|2026-11-19|Regular Board Meeting":
    "The November 19, 2026 Mountain Village Metropolitan District Regular Board Meeting agenda hasn't been posted yet.",

  "ouray|2026-11-17|Board of County Commissioners":
    "A substantive session for the Ouray County BOCC. Two resolutions stand out: Resolution 2026-031 repeals the county's austerity measures (Resolution 2026-008), signaling a shift in the county's fiscal posture; and Resolution 2026-032 adopts a formal AI policy and governance standards — one of the first such moves in the region. The 2027 budget gets an update and discussion, followed by a public hearing on amending the 2026 budget via Resolution 2026-033. On the infrastructure side, commissioners take up a change order on the Corbett Creek project, a runoff concern on CR-361's upper bridge, and an OHV grant application for an Alpine Ranger Program through Colorado Parks and Wildlife. Human Services business includes MOUs with CASA and an IGA with Montrose County for child support services. Executive session covers active water and civil litigation — dockets dating back to 2019 — plus potential code enforcement action for unpermitted structures and road closures in the McIntyre Gulch high alpine area, and a possible property transaction at 800 N. Oak Street in Ouray.",

  "ouray|2026-11-18|Board of County Commissioners Work Session":
    "A work session, so no formal votes — but the direction commissioners give here shapes what comes back for action later. The morning opens with EMS director Nathan McCullough's quarterly update and a discussion of an intergovernmental agreement between the county and Ridgway Fire. Then come two memoranda of understanding: one with the City of Ouray at 10:00, one with the Town of Ridgway at 10:30 — the specifics of each aren't spelled out in the agenda, but MOUs with both municipal neighbors in the same session suggests coordinated service or cost-sharing conversations are in motion. The afternoon wraps with commissioner and administrative reports, then 2027 budget discussion picks up wherever it left off the previous day.",

  "telluride|2026-12-03|Planning & Zoning Commission - Special Meeting - Dec 03 2026":
    "The December 3, 2026 Planning & Zoning Commission Special Meeting agenda hasn't been posted yet.",

  "ouraycity|2026-11-16|Ouray City Council Regular Meeting":
    "The big lift at this meeting is the 2027 budget cycle — council takes up four linked resolutions adopting the budget, appropriating funds to city accounts, setting the mill levy, and locking in the 2027 fee schedule. Alongside that, a second amendment to the management agreement with Ouray Ice Park, Inc. goes to a vote, and council approves a professional services agreement with Short Elliott Hendrickson for a facility condition assessment of the Hot Springs Pool House — a signal that the city is taking stock of aging infrastructure. A parking plan is on the table for discussion and direction to staff. On the consent agenda, the city ratifies its participation in the South Ouray Erosion Control Project. Council also repeals the 2022 remote participation policy.",

  "school|2026-12-14|Telluride Board of Education Work Session":
    "The December 14 Telluride Board of Education Work Session agenda hasn't been posted yet.",

  "county|2026-12-14|Open Space Commission Meeting":
    "The December 14 Open Space Commission agenda hasn't been posted yet.",

  "fire|2026-12-15|Board of Directors Meeting":
    "The December 15 fire Board of Directors Meeting agenda hasn't been posted yet.",

  "school|2026-12-15|Telluride Board of Education Monthly Meeting":
    "The December 15 Telluride Board of Education Monthly Meeting agenda hasn't been posted yet.",

  "ophir|2026-12-15|General Assembly Meeting":
    "The December 15 Ophir General Assembly Meeting agenda hasn't been posted yet.",

  "telluride|2026-12-15|Town Council - Dec 15 2026":
    "The December 15, 2026 Town Council agenda hasn't been posted yet.",

  "rico|2026-12-16|Rico Board of Trustees Regular Meeting":
    "The December 16, 2026 Rico Board of Trustees Regular Meeting agenda hasn't been posted yet.",

  "telluride|2026-12-16|Historic & Architectural Review Commission Chair - Dec 16 2026":
    "The December 16, 2026 Historic & Architectural Review Commission Chair agenda hasn't been posted yet.",

  "telluride|2026-12-16|Historic & Architectural Review Commission - Dec 16 2026":
    "The December 16, 2026 HARC agenda hasn't been posted yet.",

  "telluride|2026-12-16|Parks & Recreation Commission - Dec 16 2026":
    "The December 16, 2026 Parks & Recreation Commission agenda hasn't been posted yet.",

  "county|2026-12-16|Board of County Commissioners Meeting":
    "The December 16 Board of County Commissioners agenda hasn't been posted yet.",

  "telluride|2026-12-11|Telluride Housing Authority Subcommittee Special Meeting - Dec 11 2026":
    "The December 11, 2026 Telluride Housing Authority Subcommittee Special Meeting agenda hasn't been posted yet.",

  "telluride|2026-12-08|Telluride Housing Authority Subcommittee Special Meeting - Dec 08 2026":
    "The December 8, 2026 Telluride Housing Authority Subcommittee Special Meeting agenda hasn't been posted yet.",

  "telluride|2026-11-18|Telluride Housing Authority Subcommittee Special Meeting - Nov 18 2026":
    "The Telluride Housing Authority Subcommittee meets in special session to rule on two categories of exceptions tied to the current THA lottery. First, Nichole Zangara and Jim Riley are seeking approval to use an unconventional loan to purchase a Spruce House unit — a request that must clear the Guidelines' §110.2 lender standards, with a closing deadline of February 28, 2027. Second, six households — the Tavanos, Gulec/Davis, Candelaria/Schiefelbein, Bayon/McLaughlin, Tarris/Krell, and Kaunelis — are each requesting an exception to the minimum household size requirement under §103.3B. Neither type of exception, if granted, guarantees lottery qualification; full household eligibility review still follows. The subcommittee is asked to consider each application separately.",

  "norwood|2026-11-18|Board of Trustees Meeting":
    "The Norwood Board of Trustees meets Wednesday, November 18 at 7:00 p.m. at Town Hall. The main item is first action on Ordinance No. 1118, Series 2026, which would amend Sections 6.01 and 6.13 of the Land Use Code to align the membership structure of the Planning and Zoning Commission and Board of Adjustment — regular and alternate seats would be treated identically — while keeping each body's separate powers and procedures intact. The board also takes up a CRA employee retirement, a fireworks display contract, and the 2027 draft budget. The budget presentation is worth watching; like most small towns on the Western Slope, Norwood has been navigating the tension between rising costs and a limited revenue base.",

  "airport|2026-12-17|TRAA Board of Commissioners Meeting":
    "The December 17 TRAA Board of Commissioners Meeting agenda hasn't been posted yet.",

  "tmvoa|2026-12-17|TMVOA Members Budget Meeting":
    "The December 17 TMVOA Members Budget Meeting agenda hasn't been posted yet.",

  "telluride|2026-12-17|Liquor Licensing Authority - Dec 17 2026":
    "The Dec 17 2026 Liquor Licensing Authority agenda hasn't been posted yet.",

  "telluride|2026-12-17|Planning & Zoning Commission - Dec 17 2026":
    "The December 17, 2026 Planning & Zoning Commission agenda hasn't been posted yet.",

  "telluride|2026-12-17|Planning & Zoning Commission Chair - Dec 17 2026":
    "The December 17, 2026 Planning & Zoning Commission Chair agenda hasn't been posted yet.",

  "county|2026-12-18|Board of County Commissioners Special Meeting":
    "The December 18 Board of County Commissioners Special Meeting agenda hasn't been posted yet.",

  "school|2026-11-20|Telluride Board of Education Special Meeting":
    "A special meeting with a lot packed into one Friday morning. The board takes up a first reading of Policy JJJ — a revised extracurricular eligibility policy that incorporates Colorado's statutory definitions of male and female for athletic team participation, along with updated rules for homeschooled, charter, and nonpublic-school students seeking to participate in district activities. Then the meeting moves into executive session on two fronts: selecting a superintendent search consultant (with reference-check materials protected under CORA's mandatory nondisclosure provisions), and a personnel matter involving Superintendent John Pandolfo. Coming out of executive session, the board votes on approving the search consultant and any investigative action tied to the Pandolfo matter. The board also conducts a self-assessment under GP-4-E.",

  "telluride|2026-12-15|Special Joint Town Council - Dec 15 2026":
    "The December 15, 2026 Special Joint Town Council agenda hasn't been posted yet.",

  "telluride|2026-12-15|Special Joint Historic & Architectural Review Commission - Dec 15 2026":
    "The December 15, 2026 Special Joint Historic & Architectural Review Commission agenda hasn't been posted yet.",

  "telluride|2026-12-15|Special Joint Planning & Zoning Commission - Dec 15 2026":
    "The December 15, 2026 Special Joint Planning & Zoning Commission agenda hasn't been posted yet.",

  "norwood|2026-12-21|Planning and Zoning Commission Meeting":
    "The December 21, 2026 Norwood Planning and Zoning Commission Meeting agenda hasn't been posted yet."
};

/* ── Post-meeting "Rick" recaps ───────────────────────────────────────
   A plain-spoken ~100-word summary of what happened at a meeting, in the
   voice of "Rick" (a long-time local). Gov-Hub shows each recap as a
   "Past Meeting Summaries" card for 3 days after the meeting date, then it
   drops off automatically. Extracted from the meeting video transcript
   (see the vote-tracker pipeline). Append new recaps to the TOP.
   Schema: { sourceKey, sourceLabel, date (YYYY-MM-DD), title, recap,
             videoUrl }                                                    */
const MEETING_RECAPS = [
  {
    sourceKey: "rico",
    sourceLabel: "Rico",
    date: "2026-11-19",
    title: "Rico Board of Trustees — Nov 19, 2026",
    recap: "The board passed the second reading of the **2027 town budget**, with a note that equipment purchase figures may be adjusted before final signature depending on whether the town buys two pieces of street equipment outright rather than through a lease.\n\nOn equipment, trustees approved an outright purchase of a John Deere 325P skid steer and separately converted a proposed lease on a John Deere 344P loader to an outright purchase, authorizing staff to execute both agreements and negotiate the best price.\n\nThe board approved a liquor license for the Rico Trails Alliance special event on January 8, 2027, and approved a historic commercial building permit for the Rico Theater Cafe.\n\nTrustees approved an **intergovernmental agreement with the Town of Ignacio** for Proposition 123 affordable housing credits, subject to minor cleanup edits agreeable to Ignacio. After an extended discussion on a transfer station feasibility study brought by the Rico Land Collaborative, the board reached general consensus that a centralized collection facility is not the right fit at this time, directing staff to bring an updated bear/trash ordinance to December's meeting for a first reading instead.\n\nWater rates for 2027 will increase by **$2/month for residential** accounts and **$4/month for commercial** accounts, with tap fees unchanged; a resolution comes next month. Year-end staff bonuses totaling **$7,300** were approved.",
    votes: [{"item":"2027 town budget — second reading","outcome":"Passed","tally":""}, {"item":"Purchase agreement — John Deere 325P skid steer","outcome":"Passed","tally":""}, {"item":"Outright purchase — John Deere 344P loader","outcome":"Passed","tally":""}, {"item":"Rico Trails Alliance liquor license — Jan 8, 2027","outcome":"Passed","tally":""}, {"item":"Historic commercial building permit — Rico Theater Cafe","outcome":"Passed","tally":""}, {"item":"IGA with Town of Ignacio — Prop 123 housing credits","outcome":"Passed","tally":""}, {"item":"Year-end staff bonuses — $7,300 total","outcome":"Passed","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=XNlShke6Xss"
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-11-19",
    title: "Mountain Village Town Council — Nov 19, 2026",
    recap: "Council approved the **2027 budget** on first reading, 6-1, with a projected deficit offset by roughly $33 million in reserves. The companion ordinance levying 2026 property taxes passed 7-0. Both are set for a public hearing and second reading December 10. Discussion touched on a temporary mill levy rate reduction continuing into 2027, the unresolved **Big Billy's breezeway** cost-share with Telski (**$750,000** earmarked), and a proposed chamber of commerce funding mechanism that needs legal review before the second reading.\n\nThe 2027 fee schedule resolution passed unanimously, covering water/sewer rates (3% increase), Mountain Munchkins childcare rates, and community development fees. The 3rd quarter 2026 financial statements were accepted; the general fund showed a $1.5 million surplus year-to-date.\n\nCouncil approved a minor subdivision replat for Lot 640A/OSP 35A (Mountain View Apartments expansion), 5-2, with added conditions requiring the adjacent open space be maintained consistent with the comp plan, the welcome sign be relocated, and the contested eastern footpath be replaced with stairs. Council also approved a resolution establishing the alternative review process for the **Pond Plaza Improvements Project**, setting a task force and DRB review timeline through a target May 2027 development order.\n\nPaul Zoitis was appointed to the Public Art Commission as the Mountain Village business community representative for a four-year term. Council received a work session update on the draft **regional wastewater treatment plant** sewer authority creation agreement with Telluride — a 50/50 intergovernmental authority with a five-member board — expected for formal adoption in December. Rural Homes presented a feasibility update on 49 deed-restricted for-sale homes on the Alexander Parcel in Ilium, with a notice to proceed toward entitlements anticipated at the December 10 meeting.",
    votes: [{"item":"2027 budget ordinance — first reading","outcome":"Passed","tally":"6-1"}, {"item":"2026 property tax levy ordinance — first reading","outcome":"Passed","tally":"7-0"}, {"item":"2027 fee schedules resolution","outcome":"Passed","tally":""}, {"item":"3rd quarter 2026 financial statements","outcome":"Passed","tally":""}, {"item":"Paul Zoitis appointed to Public Art Commission","outcome":"Passed","tally":""}, {"item":"Pond Plaza Improvements review procedure resolution","outcome":"Passed","tally":""}, {"item":"Minor subdivision — Lot 640A/OSP 35A (Mountain View Apts)","outcome":"Passed","tally":"5-2"}, {"item":"Continue agenda items 14 and 15","outcome":"Passed","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/ccbb2627-96d6-4df4-9461-f04a177129b8"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-11-18",
    title: "HARC — Nov 18, 2026",
    recap: "HARC elected a new chair and vice chair: Mark Shamba was voted chair and Stacy Lake (absent) was voted vice chair, both unanimously.\n\nThe commission continued the **Shandoka Lot redevelopment** at 860 Black Bear Road — a town-owned mixed-use project combining a parking structure, affordable housing, transit infrastructure, and neighborhood commercial — to its January 20, 2027 meeting. For Buildings 1 & 2, commissioners added conditions requiring Building 1's east-west length be reduced to a maximum of 200 ft with at least 30 ft of additional setback off Mahoney Drive, a cut to the east end to give the appearance of two separate buildings, Building 2's river-trail facades reduced to two stories per design guideline RC 11-A-1, more green space on the rooftop in place of solar panels, and substantially reduced board-form concrete. For Buildings 3 & 4, approval was made contingent on approval of Buildings 1 & 2. Both votes passed 4-1, with commissioner Matt Lee dissenting.\n\nThe small-scale addition at 421 East Columbia was continued to February 17, 2027. Conditions require changing the addition's roof from shed to gable matching the historic pitch, eliminating or fully screening the spiral stair from public view, and protecting a neighboring tree's critical root zone.\n\nThe new Marshal's Department facility proposed at 113 West Columbia — demolition of Rebecca Hall and construction of a new municipal building adjacent to the landmark Miners Union building — was continued to January 20, 2027. Key added conditions: set back the east module at least an additional 5 ft, reduce the height of the main gable, replace the flat ancillary roof with a minimum code-compliant pitched roof, change the primary facade material away from all-brick to a wood-predominant mix, reduce west-elevation windows, shorten the two alley dormers by one window each, and delete the two northernmost first-floor windows on the east elevation.\n\nTwo items at 238 North Pine (Lots 18A and 18B) and one item at 335 West Colorado were continued without discussion — 335 West Colorado to the December 16, 2026 meeting, including its required story-pole site walk.",
    votes: [{"item":"HARC Chair — Mark Shamba","outcome":"Passed","tally":""}, {"item":"HARC Vice Chair — Stacy Lake","outcome":"Passed","tally":""}, {"item":"Shandoka Lot Bldgs 1 & 2 — continue to Jan 20, 2027","outcome":"Continued","tally":"4-1"}, {"item":"Shandoka Lot Bldgs 3 & 4 — continue to Jan 20, 2027","outcome":"Continued","tally":"4-1"}, {"item":"421 East Columbia addition — continue to Feb 17, 2027","outcome":"Continued","tally":""}, {"item":"113 West Columbia Marshal's facility — continue Jan 20","outcome":"Continued","tally":""}, {"item":"238 North Pine Lot 18A — continue to Apr 21, 2027","outcome":"Continued","tally":""}, {"item":"238 North Pine Lot 18B — continue to Apr 21, 2027","outcome":"Continued","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=rK0565zpmlE"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-11-18",
    title: "Board of County Commissioners — Nov 18, 2026",
    recap: "The board approved a revised employee tuition reimbursement policy, changing the eligibility waiting period from one year to six months and directing staff to align all related documents for consistency.\n\nThe board approved a mutual aid agreement with several southern Colorado counties and two tribal nations, committing up to 48 hours of assistance per activation on a voluntary basis — an expansion beyond the existing one-period state requirement.\n\nThe board held a deep-dive public hearing on the draft 2027 budget. Projected all-funds revenue is roughly $40.2 million against $40.7 million in expenditures, drawing down reserves by approximately **$476,000**. Key budget items discussed included a 4% employee wage adjustment, a 17% health insurance renewal partially passed to employees, **$426,763** to pay off new road-and-bridge tractor-trailers, **$65,000** for wildfire mitigation projects, a **$30,000** investment-grade energy audit of county facilities, and a **$50,000** placeholder for seed funding for a proposed regional chamber of commerce. Final budget adoption is scheduled for December 9.\n\nThe board approved land use code amendments adding standards for major and minor subdivisions and a new condominium/townhouse plat exemption process. The board approved a six-month SIA extension for Lasal Vista subdivision, authorized the chair's signature on a peace officer training fund compliance resolution, and allocated **$100,000** toward the 2027 Telluride Foundation down payment assistance program. The board also appointed a new fair board member.",
    votes: [{"item":"Consent agenda","outcome":"Passed","tally":""}, {"item":"Tuition reimbursement policy revisions","outcome":"Passed","tally":""}, {"item":"Southern counties/tribes mutual aid agreement","outcome":"Passed","tally":""}, {"item":"Resolution 2027-38: 2027 BOCC meeting schedule","outcome":"Passed","tally":""}, {"item":"Land use code amendments — subdivisions/condo plats","outcome":"Passed","tally":""}, {"item":"Lasal Vista SIA extension to Feb 1, 2027","outcome":"Passed","tally":""}, {"item":"Resolution 2026-47: peace officer training fund","outcome":"Passed","tally":""}, {"item":"$100,000 for 2027 down payment assistance program","outcome":"Passed","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=63NGMBu4oIM"
  },
  {
    sourceKey: "ridgway",
    sourceLabel: "Town of Ridgway",
    date: "2026-11-18",
    title: "Planning Commission — Nov 18, 2026",
    recap: "The commission recommended approval of a **resubdivision of lots 16–20, block 22** (North Laura and Clinton streets) from one parcel back into five historic 25-foot lots, with conditions including payment of excise tax before recording and minor staff red-line corrections. A tap-fee deferral until sale or development of each lot was included. The vote was unanimous. Discussion followed about how the town came to treat historic platted lots as single parcels by default through the county assessor, and commissioners noted more similar situations likely exist.\n\nOn a conditional use permit amendment for outdoor storage at 542 North Kora (light industrial), a motion to approve with staff conditions failed on a 3–3 tie. A revised motion passed unanimously requiring the screening fence be completed by December 31, 2026, with no administrative extension.\n\nThe commission unanimously recommended approval of a **text amendment reducing planning commission terms from six years to three years**, and separately adopted conforming bylaw amendments. Both items advance to town council for ordinance action.\n\nIn open discussion, commissioners expressed interest in exploring a code amendment that would allow workforce housing above light industrial uses — prompted by public comment — and agreed to bring the concept forward through staff and council.",
    votes: [{"item":"Resubdivision lots 16–20, block 22 (recommendation)","outcome":"Passed","tally":""}, {"item":"CUP amendment 542 N Kora — staff conditions as written","outcome":"Failed","tally":"3-3"}, {"item":"CUP amendment 542 N Kora — fence by Dec 31, 2026","outcome":"Passed","tally":""}, {"item":"Text amendment — PC terms 6 yrs to 3 yrs (recommendation)","outcome":"Passed","tally":""}, {"item":"Planning commission bylaw amendments","outcome":"Passed","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=8elbrg_Iphw"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-11-17",
    title: "Town Council — Nov 17, 2026",
    recap: "Council held a work session on the proposed formation of a **regional wastewater treatment plant** sewer authority with the Town of Mountain Village. The joint authority would be a separate political subdivision with five directors (two from each town plus one at-large), 50/50 ownership and capacity split, and a supermajority threshold for debt above **$10 million**. Staff is targeting a resolution vote at the December 15 meeting; Mountain Village holds its own work session November 19.\n\nCouncil unanimously passed the **2027 budget** (covering more than 20 funds) and an accompanying fee resolution. Notable adjustments: water rates up 12%, wastewater rates up 18%, tap fees up 15–21%, with council directing removal of a per-square-foot discount on tap fees for homes above 3,500 sq ft and a correction to building-permit fees for valuations over $1 million.\n\nCouncil also passed on second reading an ordinance updating the **Telluride Energy Mitigation Program (TEMP)** and an ordinance suspending the 5% open-space-fund dedication from RET revenues for the 2027 budget year. The TEMP offset calculator was adopted by separate resolution (6-0, one absent).\n\nOther votes: Todd Brown reappointed to Planning & Zoning Commission; Jessica Galbo (regular seat) and Natalie Woring (alternate) appointed to the Public Art Commission; the town authorized purchase of deed-restricted Wilin Court Unit M for re-tiering and lottery resale; and the Telluride Jazz Festival was granted a code exemption to add Sunday to its 2027 three-day run.",
    votes: [{"item":"TEMP ordinance amendment — 2nd reading","outcome":"Passed","tally":"7-0"}, {"item":"Open space fund 5% suspension ordinance — 2nd reading","outcome":"Passed","tally":"7-0"}, {"item":"2027 budget resolution adoption","outcome":"Passed","tally":"7-0"}, {"item":"2027 fees and charges resolution","outcome":"Passed","tally":"7-0"}, {"item":"TEMP energy offset calculator resolution","outcome":"Passed","tally":"6-0"}, {"item":"Todd Brown reappointed to P&Z Commission","outcome":"Passed","tally":"7-0"}, {"item":"Jessica Galbo & Natalie Woring — Public Art Commission","outcome":"Passed","tally":"7-0"}, {"item":"2027 Ecology Commission work plan","outcome":"Passed","tally":"7-0"}],
    videoUrl: "https://www.youtube.com/watch?v=R73vZJH5QXM"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2026-11-16",
    title: "Gondola Advisory Committee — Nov 16, 2026",
    recap: "The committee received a report from staff and board members who toured gondola systems in Utah, including Doppelmayr's new Salt Lake City manufacturing facility, the East Village gondola at Deer Valley, and the new Leitner-Poma installation at Park City's Canyons. Key takeaways centered on cabin storage and maintenance infrastructure, phased construction timelines, and the feasibility of onsite assembly as a potential path toward Buy America, Build America compliance.\n\nOn the **gondola project** itself, staff reported the structural assessment remains on track for December delivery, with findings to be presented to the SMART board in January or February. A Buy America memo is being finalized for submission to FTA legal counsel before Thanksgiving, requesting the gondola be evaluated as rolling stock. A lobbying RFQ closes November 24th, and the IGA supplement with TMVA remains in progress.\n\nThe committee also reviewed SMART's participation in the FTA Capital Investment Grants Program comment period, which closed the same day. The SMART board-approved letter focused on project justification criteria, capacity warrants, and local financial commitment standards.\n\nThe committee agreed to keep monthly meetings on the calendar but gave co-chairs discretion to cancel when the agenda is light, with that call to be made at the co-chair meeting two weeks prior. The December meeting was tentatively moved from December 21st to December 14th.",
    votes: [],
    videoUrl: "https://www.youtube.com/watch?v=RvyVNWFc3os"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2026-11-12",
    title: "SMART Board — Nov 12, 2026",
    recap: "The board passed a resolution authorizing a formal comment letter to the Federal Transit Administration on proposed changes to the **Capital Investments Grant program** — the federal funding pathway for the gondola replacement project. Staff described most proposed changes as favorable to SMART's position. Chair Harvey was directed to sign the letter ahead of the November 16 public comment deadline.\n\nThe board also approved an amendment to the executive director's employment agreement, extending David Averill's contract on a **month-to-month basis** at an annualized salary of **$170,000** while the executive search continues. The search committee reported a solid pool of six candidates advancing to interviews, with in-person finalist meetings planned for December 6–7 in Telluride.\n\nStaff updates covered the ongoing gondola condition assessment, a lobbying firm RFQ with proposals due November 24, and a goal of bringing a lobbying contract recommendation to the December board meeting. The FY2027 budget will be adopted at the December 10 meeting, scheduled at 10:00 a.m.",
    votes: [{"item":"Resolution 2026-23: minutes & agenda approval","outcome":"Passed","tally":""}, {"item":"Resolution 2026-24: CIG comment letter support","outcome":"Passed","tally":""}, {"item":"Resolution 2026-25: ED employment agreement amendment","outcome":"Passed","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=Fcjjuwxmk08"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-11-12",
    title: "San Miguel County Planning Commission — Nov 12, 2026",
    recap: "The commission held a joint work session with the Board of County Commissioners on proposed amendments to the **employee housing impact mitigation fee** (Land Use Code section 5-130). Staff presented three options adjusting the exemption threshold and graduated mitigation rates. After extended discussion, commissioners gave staff direction to model a fourth option: no fee below 2,500 sq ft, a low rate (around 5%) from 2,501 to 3,000 sq ft, scaling to roughly 80% at 5,500 sq ft (tied to a one-employee generation threshold), and 90% at 8,500 sq ft (two-employee threshold). No vote was taken; a formal recommendation is expected at the December meeting.\n\nThe commission voted to recommend that the Board of County Commissioners approve a rezoning of a 2.397-acre portion of the Placerville park parcel — surrounding the Telluride Fire Protection District Station No. 3 — from Forestry A and Open to Public. The change corrects a longstanding nonconformity; a fire-department training tower (funded by a **$575,000** FEMA grant) and station expansion are anticipated to follow as separate one-step applications. The vote was 5-0 with one abstention (alternate).",
    votes: [{"item":"Rezoning ~2.4 acres Placerville park to Public","outcome":"Passed","tally":"5-0"}],
    videoUrl: "https://www.youtube.com/watch?v=l0PnZyGgFEI"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-11-09",
    title: "Intergovernmental Meeting — Nov 9, 2026",
    recap: "The meeting was a regional work session — no votes were taken. Updates came from across the county.\n\nSan Miguel County reported completing its multi-year natural resources regulations, adopting rules covering solar, mining, oil and gas, forestry, and deep geothermal, now to be integrated into the land use code. A joint work session with the county planning commission on employee impact mitigation fees was set for that Thursday. The county also remains in an MOU with CDOT on a workforce housing site at Deep Creek.\n\nThe **regional wastewater treatment plant** was a recurring thread. Telluride is heading to council November 17 for a first work session on the sewer authority; Mountain Village follows November 19. The county holds an observer seat and noted the authority should launch by January 1.\n\nA substantial portion of the meeting focused on **Proposition 123 housing compliance**. Across the Telluride Foundation service area, most jurisdictions are reaching phase-one compliance through waivers, naturally occurring affordable housing units, and intergovernmental unit-sharing agreements. The region received roughly $4.2 million of the statewide $618 million awarded in phase one — none of it for new construction locally. All ten jurisdictions have opted into phase two (2027–2029). The county is exploring a rural resort AMI petition that could raise the qualifying income ceiling to 160% AMI. The Telluride Foundation's down payment assistance program has made 22 loans totaling **$727,000** over its two-year pilot; a funding ask to jurisdictions for 2027 is forthcoming.",
    votes: [],
    videoUrl: "https://www.youtube.com/watch?v=fBFx18qXMc0"
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-11-05",
    title: "Design Review Board — Nov 5, 2026",
    recap: "The board denied a general easement encroachment request at 112 Stevens Drive for a backup generator, finding that alternative locations exist and that the proposed fence enclosure did not adequately satisfy the code requirement for an improved garage or storage enclosure to mitigate noise and visual impacts.\n\nA work session on deck repairs and possible expansion at the Pine Meadows condominiums (120 Fisher Drive) produced non-binding feedback. Most board members indicated they would not support expanding existing deck encroachments further into the general easement, though several were open to like-for-like replacement. The HOA was encouraged to bring a single comprehensive application covering all decks with uniform design and materials.\n\nThe board continued both the height variance recommendation and the initial architecture and site review for a proposed single-family home on Lot 98, Mountain Village Boulevard, to January 7, 2027. Members expressed general openness to some variance given the lot's topography and proximity to the Four Seasons, but found the requested **21-foot 6-inch variance** excessive. For vested property rights on the same lot, the board recommended to town council a three-year period rather than the requested five years, with one dissent.",
    votes: [{"item":"GE encroachment denial — 112 Stevens Dr generator","outcome":"Failed","tally":""}, {"item":"Height variance continuance — Lot 98 to Jan 7, 2027","outcome":"Continued","tally":""}, {"item":"Initial arch. review continuance — Lot 98 to Jan 7, 2027","outcome":"Continued","tally":""}, {"item":"3-year vested property rights — Lot 98","outcome":"Passed","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/3172e27a-47be-46d5-a99a-b98d1befea43"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-11-04",
    title: "Board of County Commissioners — Nov 4, 2026",
    recap: "The board approved the **2027 BOCC meeting schedule** (resolution 2027-38), adding a Telluride evening listening session on June 30 and an \"if needed\" designation for the Thanksgiving-week meeting.\n\nThe board approved a **10% increase to the 2027 vegetation control and management fee schedule** (resolution 2026-44), keeping fees below full cost recovery to encourage participation in the shared program with Ouray County.\n\nA **$32,898 contract with RMMI Digital Document Solutions** was approved to scan and digitize the planning department's paper files, piggybacking on a Jefferson County procurement.\n\nThe board awarded **$5,000 to the Norwood Community Garden** from the general fund (not parks and open space), with an expectation that the garden seek additional partners for its remaining $3,000 water-storage need. The board provisionally approved signing onto a CC4CA letter opposing legal immunity for oil companies (HR8330), pending confirmation from outside counsel. Resolution 2026-45, establishing revised housing authority administrative fees — including lowering the exception fee to $220 — passed unanimously.",
    votes: [{"item":"Resolution 2027-38: 2027 BOCC meeting schedule","outcome":"Passed","tally":"2-0"}, {"item":"Resolution 2026-44: 2027 vegetation fee schedule","outcome":"Passed","tally":"2-0"}, {"item":"RMMI document scanning contract (~$32,898)","outcome":"Passed","tally":"2-0"}, {"item":"$5,000 grant to Norwood Community Garden","outcome":"Passed","tally":"2-0"}, {"item":"CC4CA letter opposing HR8330 (provisional)","outcome":"Passed","tally":"2-0"}, {"item":"Resolution 2026-45: housing authority admin fees","outcome":"Passed","tally":"2-0"}, {"item":"Endorse CAST 2027 legislative priorities","outcome":"Passed","tally":"2-0"}],
    videoUrl: "https://www.youtube.com/watch?v=VlbkJ7oIQG4"
  },
  {
    sourceKey: "ridgway",
    sourceLabel: "Town of Ridgway",
    date: "2026-10-31",
    title: "Ridgway Town Council — Oct 31, 2026",
    recap: "This was an all-day budget retreat focused on the draft 2027 fiscal year budget. Council agreed to hold the line on staff pay — a 5.6% step adjustment — and set the Home Trust of Ouray County contribution at **$35,000**. The Eco Action Partners contribution of **$9,750** was approved. A proposed **$75,000 website redesign** was removed from the budget.\n\nCouncil directed staff to add $45,000 for Green Street Park design documents and $50,000 to an athletic park reserve fund, while keeping $50,000 already budgeted for bike park design. A recurring concern throughout: the town has been drawing on reserves to cover operating gaps, and members debated whether cuts, revenue increases — sales tax, mill levy — or both would be needed to correct the trend.\n\nOn the wastewater treatment plant, engineer Joanne Greaves presented siting and treatment options. The consensus was to pursue a mechanical treatment plant at the existing site rather than relocating, given relocation costs estimated at roughly $4 million in infrastructure alone before any treatment construction. Rate increases to cover a project in the $6–10 million range were discussed as unavoidable.\n\nThe commuter transit pilot (Rway route) will end when its MMO grant expires at year's end; neither the city nor the county will fund continuation. Staff will bring a contract termination notice to the November 19 meeting. Two resignations in the marshal's office were noted.",
    votes: [],
    videoUrl: "https://www.youtube.com/watch?v=c5pFM1_YPew"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-10-28",
    title: "Board of County Commissioners — Oct 28, 2026",
    recap: "In a work session held in Placerville, commissioners met with CDOT representatives to discuss how to deploy **$250,000 in earmarked multimodal funding** for Saw Pit and Placerville. Ideas floated included lane restriping to narrow through-lanes, improved transit stops in partnership with SMART, tree trimming for sign visibility, and a possible pedestrian crosswalk near the Lemon Hot Springs bridge. CDOT will price out options and return early next year for a follow-up community meeting. Separately, CDOT confirmed a long-range statewide plan already includes multimodal improvements on Highway 145 from Placerville to Telluride, though funding for that project has slipped.\n\nSMART director David Averill — announced as departing his position — noted the system went fare-free in 2025 and added a midday weekend trip on the Norwood route. Schedule restructuring for winter service is under review. A bus stop improvement inventory has been completed district-wide, and SMART expressed willingness to partner with CDOT on stop upgrades in Saw Pit and Placerville.\n\nThe county attorney outlined limited options for regulating engine brakes, citing enforcement challenges and CDOT signage restrictions. A fire station expansion update noted the project is in rezoning and permitting, with a planning commission hearing scheduled for November 12 and a possible Board of County Commissioners hearing in December. The training tower grant has a hard deadline. Staff also reported that a planned fiber buildout down valley by Clear Networks collapsed when pole infrastructure proved inadequate; a meeting with SAMA is set for December 9 to address pole replacement and fire mitigation on power line corridors.",
    votes: [],
    videoUrl: "https://www.youtube.com/watch?v=jmvK_Q2q9PU"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-10-27",
    title: "Town Council — Oct 27, 2026",
    recap: "Council took up a work session on a proposed two-night EDM concert in Town Park on August 27–28, 2027, presented by Planet Bluegrass with AEG as a partner. The request included up to 9,000 attendees per day, a curfew extension to 11 p.m., and recurring-event status. The proposed dates directly conflict with the Telluride Mountain Run, which holds an existing approval for Town Park that same weekend. After extensive public comment and council discussion, the informal direction ran roughly 4–2 against advancing the current proposal to Parks & Recreation Commission and CASE. Supporters of the concert were asked to explore alternate dates or reach a voluntary coordination agreement with the Mountain Run before reapplying.\n\nCouncil unanimously approved a **fourth supplement to the gondola IGA**, committing approximately **$1.6 million** as the town's 25% share of the **gondola project development** planning budget for 2027.\n\nFirst reading of an ordinance updating the **Telluride Energy Mitigation Program (TEMP)** — expanding covered outdoor energy features and adding a 125 million BTU/year cap on residential properties — passed unanimously and was set for second reading November 17.\n\nFirst reading of an ordinance suspending for 2027 the 5% real estate transfer tax dedication to the open space fund, redirecting those dollars to the capital reserve fund, also passed unanimously. Edith Willie was unanimously reappointed to a two-year regular seat on the Open Space Commission.",
    votes: [{"item":"Gondola IGA 4th supplement — 2027 cost share","outcome":"Passed","tally":"7-0"}, {"item":"TEMP ordinance — 1st reading","outcome":"Passed","tally":"7-0"}, {"item":"RETT open space fund suspension — 1st reading","outcome":"Passed","tally":"7-0"}, {"item":"Edith Willie — Open Space Commission appt.","outcome":"Passed","tally":"7-0"}, {"item":"Consent calendar (minutes, resolutions)","outcome":"Passed","tally":"7-0"}, {"item":"Consent 7A-7B (minutes, subdivision resolution)","outcome":"Passed","tally":"4-0"}, {"item":"HARC appeal continuance to Jan 12, 2027","outcome":"Continued","tally":"7-0"}],
    videoUrl: "https://www.youtube.com/watch?v=ZG8-zoCHSGg"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2026-10-26",
    title: "SMART Gondola Advisory Committee — Oct 26, 2026",
    recap: "The committee met without a quorum initially; no prior meeting summary was approved. The bulk of the meeting was a technical briefing on the FTA's proposed updates to the **Capital Investment Grant program**, open for public comment through November 16th. Key proposed changes include requiring 50% of non-CIG funds committed before entering engineering (up from 30%), shifting cost-effectiveness to 25% of project justification weighting, rounding ratings down rather than rounding to nearest whole, and introducing a formula-driven federal share starting at 40%.\n\nStaff identified the expanded use of project justification warrants as a potential benefit — both gondola segments may qualify for a streamlined 50% federal share if ridership and cost thresholds are met. The committee agreed SMART's formal comment letter should support the warrant expansion and push back on the rounding change and increased discretion in local financial commitment ratings. A shorter version will be shared with partner jurisdictions to encourage parallel comment submissions before the deadline.\n\nOn other updates: gondola structural inspections are on track for December reports; a lobbying firm RFQ is nearly ready to issue; and San Miguel County approved the IGA supplement on its consent calendar. A report on a recent trip to visit Doppelmayr operations is planned for the November meeting.",
    votes: [],
    videoUrl: "https://www.youtube.com/watch?v=VDG3lAFoWhU"
  },
  {
    sourceKey: "rico",
    sourceLabel: "Rico",
    date: "2026-10-22",
    title: "Rico Board of Trustees — Oct 22, 2026",
    recap: "The board denied a request by a property owner to waive or reduce the $9,535 water system improvement fee, citing lack of demonstrated hardship, precedent concerns, and the fee's direct nexus to each user's share of capital projects including Silver Creek reactivation and a third water tank.\n\nThe board approved renewal of the liquor license for Rock Lobster LLC (Mountain Top Liquor) and approved a use agreement for Rico Trails Alliance to hold a mountain film event at the Rico Community Center on January 8, 2027.\n\nThe board cancelled the November 3 municipal election, as only one write-in candidate qualified for the available trustee seat. First reading of the 2027 budget ordinance passed; second readings of three housekeeping ordinances repealing outdated provisions on town warrants, the old firehouse lease, and temporary sidewalk seating permits also passed. Third-quarter financial statements were approved.\n\nThe board received a Colorado Parks and Wildlife presentation on human-bear conflict reduction grants and discussed bear-resistant trash infrastructure options, including a possible centralized transfer station. Staff updated trustees on wastewater collection system design progress, Proposition 123 affordable-housing compliance, and mine-waste road remediation sampling showing 26 of 39 samples above action levels — the board directed staff to push Atlantic Richfield to include additional road segments.",
    votes: [{"item":"Waiver of water system improvement fee — Greg Brown","outcome":"Failed","tally":""}, {"item":"Liquor license renewal — Rock Lobster LLC","outcome":"Passed","tally":""}, {"item":"Use agreement — Trails Alliance / Community Center Jan 8","outcome":"Passed","tally":""}, {"item":"Resolution 2026-01 — cancel municipal election","outcome":"Passed","tally":""}, {"item":"Letter of support — Historical Society Rico Center grant","outcome":"Passed","tally":""}, {"item":"Q3 financial statements","outcome":"Passed","tally":""}, {"item":"Ordinance 2026-13 first reading — 2027 budget","outcome":"Passed","tally":""}, {"item":"Ordinance 2026-10 second reading — repeal town warrants ordinance","outcome":"Passed","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=1DNWCbGEQOk"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-10-22",
    title: "Board of Adjustment — Oct 22, 2026",
    recap: "The board opened with a remembrance of Jim Botenhagen, a longtime Board of Adjustment member and chair who passed away recently.\n\nThe board's sole substantive item was a variance application from the Town of Mountain Village. The board approved a reduction in the front-yard setback along County Road 63L from 20 feet to 7 feet on a roughly 56-acre parcel in Illium Valley, zoned Community Housing. The variance is intended to allow construction of **49 units of deed-restricted affordable housing** while keeping buildings away from wetlands, floodplain, and the riparian corridor on the opposite side of the parcel.\n\nApproval came with conditions: the variance is tied specifically to this affordable housing development, all required permits must be obtained, and a building permit for at least one phase must be secured within five years of recording. The project still requires subdivision review and Planning Commission approval before construction.",
    votes: [{"item":"Variance: setback reduction, CR 63L, Illium Valley affordable housing","outcome":"Passed","tally":"4-0"}],
    videoUrl: "https://www.youtube.com/watch?v=jSLaPW_lKyQ"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-10-22",
    title: "Planning & Zoning — Oct 22, 2026",
    recap: "The commission continued the **Shandoka lot redevelopment preliminary PUD** to its December 17, 2026 meeting, requesting additional information before acting. The project proposes a mixed-use development at 860 Black Bear Road — combining a parking structure, affordable housing (80% deed-restricted), child care, a food bank, and a transit hub — with dimensional variations for building height, site coverage, and floor area.\n\nThe commission cited several unresolved issues: no cross-sections showing the relationship of proposed structures to the river, the water table, and neighboring buildings; no snow-removal or pedestrian-safety plan for shaded areas; no EV or e-bike charging plan; no strategy for accommodating high-clearance vehicles; inadequate detail on covered bike parking; and missing data on how many vehicles and bicycles are currently authorized to park on Lots L and J.\n\nThe minor subdivision application for 238 North Pine Street was continued to April 22, 2027, at the applicant's request, to allow time to pursue a single-family HARC approval instead. The 222 West San Juan Avenue subdivision work session was continued to November 19, 2026, at the applicant's request.",
    votes: [{"item":"Shandoka lot prelim. PUD — continue to Dec 17","outcome":"Continued","tally":""}, {"item":"238 N. Pine St. minor subdivision — continue to Apr 22","outcome":"Continued","tally":""}, {"item":"222 W. San Juan Ave. subdivision work session — continue to Nov 19","outcome":"Continued","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=jzRVXoqZaec"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-10-21",
    title: "HARC — Oct 21, 2026",
    recap: "HARC approved a payment-in-lieu of one required parking space at 510 West Columbia / 129 North Townsend. The property contains a contributing historic shed too narrow and low to accommodate a vehicle, and site constraints — including a utility transformer — preclude a second on-site space. The vote authorizes the planning director to proceed with administrative approval under Land Use Code 3-205.E.2. One commissioner voted no, believing tandem parking might be feasible.\n\nHARC approved **small-scale new construction at 785 Primrose Lane** (Lot 9, the Overlook at Telluride) with conditions: remove all building elements from the eastern 5-ft side yard setback except egress and retaining; significantly reduce glazing on Level 2 overall and at the south elevation of Level 3; and change the entry door side lights to no more than two-thirds light. Conditions regarding mass/scale and materials were struck. Vote was unanimous.\n\nA pending CA amendment for 214 South Fir, which had already been continued multiple times, was withdrawn by the applicant at the meeting rather than pursuing an 8-month tabling request.",
    votes: [{"item":"Payment-in-lieu of parking, 510 W Columbia/129 N Townsend","outcome":"Passed","tally":""}, {"item":"Small-scale new construction, 785 Primrose Lane","outcome":"Passed","tally":"5-0"}],
    videoUrl: "https://www.youtube.com/watch?v=zY-yjS_ESdo"
  },
  {
    sourceKey: "ridgway",
    sourceLabel: "Town of Ridgway",
    date: "2026-10-21",
    title: "Planning Commission — Oct 21, 2026",
    recap: "The commission voted unanimously to recommend that town council adopt the **2026 Water Supply Element** as an addendum to the 2019 Ridgway Master Plan. The element covers the town's two water sources (Cottonwood Creek and Beaver Creek), supply and demand projections, infrastructure needs, and conservation goals. Staff noted the state requires a water supply element by December 31 to maintain compliance. Town council is expected to ratify it at its November 19 meeting.\n\nThe commission also received a work session update on Chapter 7 land use code updates. A walking tour of town is planned for November 18 before the next regular meeting, with a final planning commission hearing on the code updates pushed from December to January.\n\nOn other business: the Lena Street Commons applicant withdrew its proposed PUD amendment and will proceed under the existing approved development agreement. A third amendment to that agreement — addressing timeline only, not workforce housing obligations — will go to town council.",
    votes: [{"item":"Recommend adoption of 2026 Water Supply Element","outcome":"Passed","tally":"7-0"}, {"item":"Approve September meeting minutes (w/ clerical edits)","outcome":"Passed","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=zwaIUKRxtAI"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-10-21",
    title: "Board of County Commissioners — Oct 21, 2026",
    recap: "The board adopted three new natural-resources sections of the Land Use Code, each by unanimous vote. **Resolution 2026-40** adds Article 6, Section 6-4 on forestry practices, establishing tiered review levels (general permit for qualifying wildfire-mitigation work under 40 acres, administrative for minor practices, two-step planning commission/BOCC for major projects over 80 acres) and updated wetland buffers. **Resolution 2026-41** adds Section 6-5 on oil and gas operations, with 2,000-foot setbacks from sensitive uses and a new requirement that all taxes and mitigation payments be paid in full before permit transfer. **Resolution 2026-42** adds Section 6-6 on deep geothermal operations, with 1,000-foot well setbacks and explicit coverage of surface energy-generation facilities. A companion **Resolution 2026-43** cleans up related references throughout Articles 3, 4, 5, and 6.\n\nThe board approved **2027 community support funding** as presented, adding **$20,000** for Telluride Senior Lunch and **$5,000** for the Telluride Institute's TESSLE environmental research program, contingent on required data-sharing with county staff and partners. A separate emergency allocation of **$12,000** from the community funding reserve was approved for West End Family Link to help restore food-pantry services; the organization was directed to apply through the regular grant cycle in future years.\n\nThe board directed staff to prepare an MOU with Telluride Pines HOA to co-sponsor applications for state and federal loan and grant funding to restore the HOA's safe water supply — no county financial contribution was committed. The 2027 county holiday schedule was approved with the deletion of the day after Veterans Day (November 12).\n\nPublic Health Director Grace Franklin briefed the board on flu and COVID vaccine uptake, behavioral health initiatives including a half-million-dollar RHTP regional award, and a forthcoming strategic-plan refresh. County Manager Mike Bordona reported receiving his Credentialed Manager certification and flagged the Cornerstone Golf Course access and infrastructure-compliance issue with Montrose and Ouray counties.",
    votes: [{"item":"Resolution 2026-40: Forestry Practices LUC amendment","outcome":"Passed","tally":"3-0"}, {"item":"Resolution 2026-41: Oil & Gas Operations LUC amendment","outcome":"Passed","tally":"3-0"}, {"item":"Resolution 2026-42: Deep Geothermal Operations LUC amendment","outcome":"Passed","tally":"3-0"}, {"item":"Resolution 2026-43: Related LUC amendments Arts. 3-6","outcome":"Passed","tally":"3-0"}, {"item":"2027 community support funding allocations","outcome":"Passed","tally":"3-0"}, {"item":"$12,000 emergency grant — West End Family Link","outcome":"Passed","tally":"3-0"}, {"item":"Resolution 2027-37: 2027 holiday schedule (amended)","outcome":"Passed","tally":"3-0"}, {"item":"Direct staff to MOU with Telluride Pines HOA","outcome":"Passed","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=Skgdyzwae8s"
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-10-15",
    title: "Mountain Village Town Council — Oct 15, 2026",
    recap: "Council approved a new tavern liquor license for El Rhino (TCA LLC) at 456 Mountain Village Boulevard, authorizing beer, wine, and full liquor service including takeout. Discussion followed on whether future routine liquor applications could be handled administratively by staff; new applications will continue to come before council, while renewals stay at the staff level.\n\nCouncil approved an employment agreement for incoming Town Manager Michael Bouchard, with a January 1, 2027 start date, base salary of $249,526.60, a $2,500/month housing allowance, $12,500 moving allowance, and a six-month severance provision absent termination for cause.\n\nThe Mountain Village Housing Authority passed two items on second reading: an ordinance amending municipal code sections 16.01 and 16.02 to reference the annual fee schedule, and a resolution adopting the 2027 Housing Authority fee schedule including Village Court Apartment rents. A $0 application fee for deed-restricted housing de-restriction was noted.\n\nCouncil approved the fourth supplement to the intergovernmental agreement for gondola project development, committing $812,000 as Mountain Village's share of the 2027 planning budget. Council also approved a memorandum of understanding with San Miguel County and the Ridge at Telluride HOA clarifying the Coonskin viewplane height interpretation. The Walk of Joy food truck conditional use permit was renewed for three years through fall 2029. Council approved a three-year tourism marketing services agreement with the Telluride Tourism Board beginning January 1, 2027.\n\nA work session on the draft Mountain Village Beaver Management Plan produced no vote; staff will return in November with a prioritized risk ranking and cost estimates before a potential December resolution.",
    votes: [{"item":"New tavern license — El Rhino / TCA LLC","outcome":"Passed","tally":""}, {"item":"Town Manager employment agreement — M. Bouchard","outcome":"Passed","tally":""}, {"item":"Ordinance amending MVMC ch. 16.01 & 16.02 (2nd reading)","outcome":"Passed","tally":""}, {"item":"Resolution adopting 2027 MVHA fee schedule / VCA rents","outcome":"Passed","tally":""}, {"item":"4th amendment to gondola IGA — 2027 budget","outcome":"Passed","tally":""}, {"item":"MOU — Ridge Viewplane interpretation","outcome":"Passed","tally":""}, {"item":"Walk of Joy food truck CUP renewal — 3 years","outcome":"Passed","tally":""}, {"item":"Tourism marketing services agreement — TTB, 3 years","outcome":"Passed","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/4c730f8b-ae31-4f67-a23a-8874b2f5b385"
  },
  {
    sourceKey: "ridgway",
    sourceLabel: "Town of Ridgway",
    date: "2026-10-14",
    title: "Town Council — Oct 14, 2026",
    recap: "Council approved the **Riverbend Townhome site plan** — five townhomes on Lot 10 of the Liddell-Stanton Business Park — with conditions including recordation of a 20-foot drainage and utility easement and approval of a companion amended plat. The project generated public comment focused on stormwater and flood modeling concerns from the neighboring property owner, who offered to fund a 2D flood study. Council found the approval criteria met and noted that multi-family housing is a use by right in the Historic Business District.\n\nThe companion **amended plat of Lot 4 and Outlot, Riverview Business Park** was also approved, vacating two 10-foot easements and creating a 20-foot drainage easement to route stormwater to the Uncompahgre River.\n\nCouncil adopted the town's **Housing Action Plan** per state Senate Bill 24-174 requirements and approved a resolution expressing intent to participate in the Proposition 123 **2027–2029 commitment cycle**, with a projected unit commitment of 13 units for Ridgeway.\n\nThe Workforce and Affordable Housing Committee declined to exercise right of first refusal on a deed-restricted unit at 683 Frederick Street, citing budget constraints and the absence of a housing acquisition fund. Council also approved a revised water conservation and management plan, a permanent easement with Wolf Lang Company for the Ridgeway Ditch diversion structure, an MOU with the Ridgeway Independent Film Festival organization allocating **$15,000**, confirmation of Stage 1 fire restrictions, and a target of **$100,000** for the 2027 community grant program. The draft 2027 fiscal year budget was introduced to meet statutory requirements, with a retreat scheduled for October 31.",
    votes: [{"item":"Riverbend Townhome site plan approval","outcome":"Passed","tally":""}, {"item":"Amended plat, Riverview Business Park","outcome":"Passed","tally":""}, {"item":"Resolution 26-08: Housing Action Plan adoption","outcome":"Passed","tally":""}, {"item":"Prop 123 2027–2029 opt-in resolution","outcome":"Passed","tally":""}, {"item":"Decline right of first refusal – 683 Frederick St","outcome":"Passed","tally":""}, {"item":"Resolution 26-10: Water conservation plan","outcome":"Passed","tally":""}, {"item":"Permanent easement – Wolf Lang Company","outcome":"Passed","tally":""}, {"item":"MOU – Ridgeway Independent Film Festival ($15,000)","outcome":"Passed","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=DP8JCxYE6Mo"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-10-14",
    title: "Board of County Commissioners — Oct 14, 2026",
    recap: "Commissioners approved a consent agenda item authorizing the chair's signature on an amendment request letter for a local planning capacity grant, following the county's recent adoption of an expedited housing review policy. The $45,000 grant would direct $30,000 toward architectural and engineering fees for potential workforce housing at the Deep Creek Road and Bridge property, with $15,000 for personnel costs.\n\nCommissioners unanimously adopted Resolution 2026-39, amending a prior resolution to clarify the Office of Emergency Management's reporting structure. Emergency Manager Shannon Armstrong will now operate with greater autonomy as her own department head, reporting to commissioners through the county manager rather than under the sheriff's direct supervision.\n\nThe Veterans Service Officer reported a $45,000 grant secured a new vehicle to launch a regional veterans transportation service, running Wednesdays from Norwood through Ridgway to Montrose and Grand Junction. San Miguel County ranked first in the state for increasing veteran benefits last year.\n\nCommissioners discussed a proposed state excise tax bill that would allow counties to levy taxes on specific goods or activities, subject to voter approval — potentially targeting solar energy production or recreation services. Several county concerns from July feedback were not addressed in the revised draft. The topic was deferred for further reporting after a scheduled CCAT meeting. Commissioners also flagged an incoming $12,000 funding request from West End Family Link for a future agenda.",
    votes: [{"item":"Consent agenda — planning capacity grant letter","outcome":"Passed","tally":""}, {"item":"Resolution 2026-39 — emergency management restructure","outcome":"Passed","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=rk14kQjSs4Y"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-10-13",
    title: "Town Council Budget — Oct 13, 2026",
    recap: "Council held a budget work session covering enterprise and special-revenue funds for the proposed 2027 budget, with adoption scheduled for November 17.\n\nFor water and wastewater, staff proposed a 12% rate increase for water and 18% for wastewater — along with matching tap-fee increases. Council gave direction to approve those rate levels. On tap fees, a majority supported raising them higher than the base rate increases — 15% for water and 21% for wastewater — to begin building fund balances ahead of significant capital needs, including a new regional wastewater treatment plant. Council also approved in concept a paper-check fee for utility billing, with a hardship waiver process.\n\nOn affordable housing rental rates, council reaffirmed a 0% adjustment to AMI rent tables for 2027, deferring any structural changes pending a third-party policy review expected in 2027. Staff noted this increases reliance on transfers from the affordable housing fund.\n\nOther funds discussed — parking, transportation, child care, open space, airline guarantee, lodgers tax, and communications — carried forward largely as presented, including converting a part-time communications coordinator to full-time. The open space fund balance was noted at approximately $4.6 million, with the capital-fund reallocation of a portion of RET funding affirmed by council.",
    votes: [],
    videoUrl: "https://www.youtube.com/watch?v=unJL5UflFdg"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-10-08",
    title: "San Miguel County Planning Commission — Oct 8, 2026",
    recap: "The commission held a joint work session with the Board of County Commissioners on a sweeping housing code update more than a year in the making. Staff walked through proposed amendments covering the Community Housing zone district (including a new 3,000 sq. ft. floor-area cap on dwelling units, a 175-unit maximum before a PUD is required, and a height increase to 45 ft. for multifamily), changes to subordinate residential units (ADUs expanded to 1,000 sq. ft., a second deed-restricted unit allowed), new definitions for cottage housing and co-housing, and density-tier frameworks for the high-, medium-, and low-density zones. No vote was taken; the session was advisory.\n\nThe commission voted unanimously to recommend that the BOCC adopt land use code amendments adding a new condominium/townhouse plat subdivision exemption process and creating distinct procedures for minor subdivisions (five or fewer lots, two-step review) and major subdivisions (six or more lots, five-step review).\n\nThe commission also voted to approve the minutes from its prior meeting with one textual correction. The meeting included a formal resolution expressing appreciation for outgoing Planning Director Kay Simson, who retires October 30.",
    votes: [{"item":"Resolution appreciating Planning Director Kay Simson","outcome":"Passed","tally":""}, {"item":"Recommend BOCC adopt subdivision/condo plat LUC amendments","outcome":"Passed","tally":""}, {"item":"Approval of prior meeting minutes (as amended)","outcome":"Passed","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=rlWxLkU5OZE"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2026-10-08",
    title: "SMART Board of Directors — Oct 8, 2026",
    recap: "The board took up two votes at its October meeting. The main action was approving the **FY27 amendment to the gondola project development IGA**, which covers a total project development budget of slightly more than **$6.5 million**, with SMART on the hook for half. The expanded budget reflects more intensive work planned for fiscal year 2027, including advancing engineering toward roughly 30% conceptual design, completing environmental clearance under NEPA, and hiring outside technical experts. The board also heard that negotiations with Telluride Ski & Golf over easements are expected later in the process, and that federal policy changes could shift how money is spent across quarters, even if the total stays the same.\n\nStaff also walked the board through a revised draft FY 2027 operating budget, noting a proposed **$1,650,000 gondola operating reserve** to be funded in FY27 and available when SMART takes over gondola operations in 2028. The main remaining unknown is property-tax revenue, pending final county valuation certificates expected in early December. On operations, staff reported corrective steps taken after a bus lift inspection concern raised at the prior meeting, and provided updates on new Rico and Norwood weekend routes, driver training for off-season schedules, and progress on facility improvements at the Ilium parcel. The board also entered a brief executive session on personnel matters related to the executive director position and a pending legal case.",
    votes: [{"item":"Resolution 2026-22 — FY27 Amendment to Gondola Project Development IGA","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/Board-Packet_November-12th-2026.pdf#minutes-2026-10-08",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/Board-Packet_November-12th-2026.pdf"
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-10-07",
    title: "Mountain Village Town Council — Oct 7, 2026",
    recap: "This was an all-day special budget work session for the proposed 2027 budget. No formal votes were taken; council gave staff direction on several items.\n\nOn the temporary mill levy credit: council reached rough consensus to continue it for another year but at a reduced level — approximately 5% year-over-year growth on existing property valuations rather than the 10% cap used last year. Staff will recalculate and bring a formal proposal to the next meeting.\n\nOther notable direction: the $750,000 Big Billy's breezeway snowmelt project stays in the budget as a placeholder pending a November work session to clarify legal easements and rights-of-way on Telski property. The community grants budget was directed upward by roughly 5% (from ~$203,000 to ~$213,000). Staff was asked to scale back and further define the IT/AI budget line items, with the understanding that supplemental appropriations would be sought once a program is defined. Council also discussed the 10-year capital plan including gondola controls, waterline replacements, the new wastewater plant design costs, and a possible parking garage expansion.",
    votes: [],
    videoUrl: "https://media.avcaptureall.cloud/meeting/56775c5f-d4a3-4a53-97b4-6bfa11c3a4dd"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-10-07",
    title: "Board of County Commissioners — Oct 7, 2026",
    recap: "The board approved a tax abatement refund for a property owner after the assessor's office determined the parcel had been over-valued — because the refund exceeded $10,000, commissioner approval was required.\n\nA revised intergovernmental agreement for a veteran medical transportation program with Ouray County was approved at no cost to Ouray. The county is covering the program through existing grant funds, with a cost-sharing conversation deferred to the 2028 budget cycle given Ouray's severe financial strain following the Gold Mountain fire.\n\nA lease-purchase agreement with Paccar Financial for two road tractors at Rams Ridge was approved, within amounts already authorized in the 2026 budget. Planning application fees — roughly $4,000 — were waived for the Town of Mountain Village's affordable housing project in Ilium Valley. A lot-line adjustment for a duplex in the Lawson Hill PUD was approved, correcting a minor foundation placement error.\n\nThe board reviewed the 2027 preliminary budget. No vote was taken; the document goes on public display by October 15, with a deeper commission session set for November 18. Staff flagged a 17% health insurance renewal, a proposed 4% wage adjustment, and a 20% year-to-date drop in sales tax through April. A code enforcement stipulation with Dihedral Fate LLC — requiring removal of one unpermitted structure and permitting of another on Lot 4, Avalon Mesa — was approved and authorized for county court filing. The board also approved a construction agreement with the Lawson Hill Property Owners Association and a CDOT concurrence-to-award letter for the Lawson Hill Connector Trail project, and authorized a letter of support for a forest restoration and wildfire mitigation grant application.",
    votes: [{"item":"Consent agenda","outcome":"Passed","tally":""}, {"item":"Tax abatement — Richard F. Owen trust (ABMT 2026-30)","outcome":"Passed","tally":""}, {"item":"IGA — veteran medical transport w/ Ouray County (revised)","outcome":"Passed","tally":""}, {"item":"Resolution 2026-35 — lease-purchase agreement, Paccar Financial","outcome":"Passed","tally":""}, {"item":"Fee waiver — Mountain Village affordable housing, Ilium Valley","outcome":"Passed","tally":""}, {"item":"Subdivision exemption — lot-line adj., Lawson Hill PUD lots 320A/B","outcome":"Passed","tally":""}, {"item":"Dept. of Human Services financials — chair signature","outcome":"Passed","tally":""}, {"item":"Agreement w/ Lawson Hill POA — connector trail construction","outcome":"Passed","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=YucG9EKdbAo"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-10-06",
    title: "Town Council — Oct 6, 2026",
    recap: "The dominant topic was a two-hour work session on the Marshal's Department's use of Flock automated license plate readers (ALPRs). Chief Marshall presented the technology's legal basis, operational uses, audit controls, and data-sharing limits under Colorado law. Council members raised concerns about data security, civil liberties, and potential federal misuse. The consensus at the end was to remove the Flock contract from the budget, effectively ending the program. No formal vote was taken during the work session; the direction was given to staff as a budget decision.\n\nCouncil unanimously approved a three-year extension of vested property rights for 221 West Colorado (New Sheridan Hotel), allowing additional suites and two employee housing units to move forward when market conditions improve.\n\nThe ethics code amendment (removal of the word \"profanity\" from general guidelines) passed on second reading, 6-0.\n\nTwo new alternates — Shayni Saftler and Marcin Ostromecki — were appointed to the Planning & Zoning Commission, 6-0. For HARC, council appointed Mark Shamba to a one-year regular seat, Matt Lee to a two-year regular seat, and Troy Gulick to a two-year alternate seat, all unanimously. Discussion touched on whether to impose term limits on HARC and P&Z chairs; staff was directed to prepare a work session on chair term limits.\n\nAn appeal hearing for 208 South Fir was scheduled for December 4.",
    votes: [{"item":"Vested property rights extension — 221 W Colorado","outcome":"Passed","tally":"6-0"}, {"item":"Ethics code amendment — 2nd reading","outcome":"Passed","tally":"6-0"}, {"item":"P&Z alternate appointments — Saftler & Ostromecki","outcome":"Passed","tally":"6-0"}, {"item":"HARC appointments — Shamba, Lee, Gulick","outcome":"Passed","tally":"7-0"}],
    videoUrl: "https://www.youtube.com/watch?v=4qp_ZrxhG2I"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-10-01",
    title: "Town Council Budget Work Session — Oct 1, 2026",
    recap: "Council held its first 2027 budget work session, covering the general fund, capital fund, and street/bridge/alley fund. The draft general fund shows revenues running about $1.88 million below expenditures, but with vacancy savings, contingency reserves, and one-time items factored in, the net shortfall is just over $800,000 — while the fund balance remains above 50%, well clear of the 35% target. Sales tax revenue for 2026 is down roughly 4.5% through August but recovering; the 2027 projection uses 3.2% growth over audited 2025 figures rather than the anomalous 2026 year.\n\nA $150,000 expense for floodplain (AO zone) remapping — inadvertently omitted from the proposed budget — was directed to be added back. Staff also flagged that the $100,000 previously listed for the Telluride Historic and Architectural Survey update was a memo error; that work will proceed only if grant funding is secured.\n\nOn the capital side, council gave direction to withhold the 2027 open-space fund transfer (roughly $348,500) for one year, structured as a one-time withholding rather than a loan, requiring an ordinance amendment. The gondola replacement project carries a $1.63 million capital fund allocation representing the town's 25% regional share. Council also directed staff to analyze whether TEMP funds can support upgrading the historic information center boiler to electric rather than gas-to-gas replacement.",
    votes: [],
    videoUrl: "https://www.youtube.com/watch?v=VM3hlLkPw0E"
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-10-01",
    title: "Design Review Board — Oct 1, 2026",
    recap: "The board approved the final architecture review for a new 15-unit, three-story employee apartment building at 306 Adams Ranch Road (Lot 640A), bringing the site's total to 45 units. Approval included design variations for hardy board siding, an alternative parking requirement (65 spaces instead of the required 68), and a reduced stone percentage — but the board added conditions requiring the stone percentage be raised to 35%, balcony recessed lights be replaced with sconces on all three floors, permanent irrigation of the adjacent open-space field (with TSG/Telski responsible), and courtyard drainage resolved before building permit.\n\nThe board also approved the final architecture review for four new condominium units at TBD Pennington Place (Lot 726-R1), with specific approvals for a secondary curb cut and outdoor-living-space lighting. A condition was added reducing fixtures at the Unit 7 entry to three and the shared LCE terrace to seven.\n\nThe board voted to recommend town council approval of a three-year conditional use permit renewal for the Walk of Joy food truck at Conference Center Plaza, expiring at gondola closure in fall 2029, with a new condition requiring skirting around the trailer base.\n\nThe board approved the 2027 DRB meeting schedule, moving the September meeting from September 2 to September 9 to avoid conflict with the Telluride Film Festival. A single-family home item (Lot 224B, Snowdrift Lane) was continued to December 3, 2026; another single-family item (Lot 1171R, San Joaquin Road) was tabled to February 4, 2027.",
    votes: [{"item":"Final arch. review — 306 Adams Ranch Rd (15 units)","outcome":"Passed","tally":""}, {"item":"Final arch. review — TBD Pennington Place (4 units)","outcome":"Passed","tally":""}, {"item":"CUP renewal — Walk of Joy food truck (3 yrs)","outcome":"Passed","tally":""}, {"item":"2027 DRB meeting schedule (Sept moved to Sep 9)","outcome":"Passed","tally":""}, {"item":"Continuance — Lot 224B Snowdrift Lane to Dec 3","outcome":"Continued","tally":""}, {"item":"Tabling — Lot 1171R San Joaquin Rd to Feb 4, 2027","outcome":"Tabled","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/233b6e7a-82d2-414a-a219-b5d66250e153"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-09-30",
    title: "HARC — Sep 30, 2026",
    recap: "A special meeting was devoted entirely to the Carhenge Redevelopment project at 700 West Pacific — a proposed mixed-use, attainable-housing complex on town-owned land. The project is divided into three separate applications; none received approval. All three were continued to December 15–16, 2026 with revised conditions.\n\nFor Buildings A, B, and C (along the river), HARC directed the applicant to significantly reduce mass and scale, eliminate the loft level on Building C, step down facades more intentionally, reduce glazing on specific elevations, and add a dedicated pedestrian bridge per Accommodations Policy 6.\n\nFor Buildings D1 and D2, HARC called for significant mass-and-scale reductions including stepping the northwest corner down to a two-story element, eliminating fourth-story elements, and varying building materials across the three applications per AC31D.\n\nFor Buildings E1, E2, and E3, HARC again required significant reductions in perceived mass and scale — most urgently on E3 — elimination of fourth-story elements, breaking up continuous roof ridges on all three buildings, and increased attention to positive open space, site planning, and natural resources per AC3, AC13, and AC14. All three votes were unanimous.",
    votes: [{"item":"Buildings A, B & C — continue to Dec w/ conditions","outcome":"Continued","tally":"6-0"}, {"item":"Buildings D1 & D2 — continue to Dec w/ conditions","outcome":"Continued","tally":"6-0"}, {"item":"Buildings E1, E2 & E3 — continue to Dec w/ conditions","outcome":"Continued","tally":"6-0"}],
    videoUrl: "https://www.youtube.com/watch?v=xXw2-gwfaXA"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-09-30",
    title: "Town Council (Special) — Sep 30, 2026",
    recap: "Council met in special session to hear an appeal of the Planning and Zoning Commission's unanimous July 23 approval of a preliminary large-scale subdivision to consolidate two lots — Lot 34 and Lot 34B — into a single parcel at 700 West Pacific Avenue (the Carhenge lot). Three council members were recused due to proximity to the property, leaving a four-member quorum.\n\nAppellants argued that the town attorney never performed a required gatekeeping review of whether the applicant had authority to submit the application under the Bachmann Village covenants, that 17 of 23 subdivision design criteria were improperly bypassed, and that a pending HARC application showed development was in fact being proposed. Staff and the applicant's attorney countered that covenants are a private matter outside the land use code, that staging applications is lawful, and that inapplicable criteria are not waived. Acting town attorney advised that no written town-attorney sign-off is required under the code.\n\nCouncil voted 3-1 to affirm the PNZ decision. The dissenting member expressed concern that the Bachmann Village covenants were not factored into PNZ's factual basis. Council directed special counsel to draft a resolution memorializing the decision.",
    votes: [{"item":"Affirm PNZ approval — Carhenge lot consolidation","outcome":"Passed","tally":"3-1"}],
    videoUrl: "https://www.youtube.com/watch?v=vMvbknjbh4g"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-09-30",
    title: "Board of County Commissioners — Sep 30, 2026",
    recap: "This was a work session — no formal votes were taken. The morning focused entirely on the Employee Housing Impact Mitigation Fee. Staff presented the formula, fee history, and regional comparisons. The county has collected roughly $4.4 million since major fee adjustments in 2022, averaging about $1 million a year — well short of the estimated $4 million annual target needed to bond for affordable housing construction. No units have been built with those funds yet; the county is still in planning and infrastructure assessment stages.\n\nPublic comment ran long and was largely critical. Residents, real estate professionals, builders, and attorneys cited the outdated 2000 employee generation study, a steep jump in the affordability gap (from $527 to $1,112 per square foot since 2022), declining vacant land sales, and a chilling effect on construction — particularly for local families building primary homes. Suggestions included raising the 2,000-square-foot threshold before fees kick in, smoothing the rate curve, deferring or forgiving fees for full-time local residents, incentivizing deed-restricted ADU construction, and pursuing private-public development partnerships. An attorney noted a challenge to the fee structure is pending at the Colorado Supreme Court. Commissioners signaled openness to revisions and committed to a future decision-making meeting.\n\nIn the afternoon, commissioners reviewed 13 CCI legislative proposals for the 2027 session. No binding positions were set; Commissioner Gleason was authorized to vote on Friday with flexibility to adjust based on floor discussion. Tentative leanings included support for AI/data-privacy modernization, ground ambulance billing reform, and HUTF rural funding negotiations; lukewarm support for online legal notice publication; and opposition or abstention on several others including autopsy record changes, unfunded mandate study committees, and a Medicaid expansion for justice-involved individuals.\n\nOn community support grants: the Telluride Historical Museum was tentatively approved at $2,500 (down from the $5,000 request, reflecting prior funding history). The Telluride Environmental Science and Engineering Laboratory request for $10,000 was continued pending a presentation from the project team; commissioners want clarity on deliverables and actual partnerships before committing funds. The Telluride Junior Nordic Ski Program equipment request was denied, consistent with past precedent on capital and gear funding.",
    votes: [{"item":"Telluride Historical Museum grant — $2,500","outcome":"Passed","tally":""}, {"item":"TESSL grant — continued pending presentation","outcome":"Continued","tally":""}, {"item":"Telluride Junior Nordic equipment grant","outcome":"Failed","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=UAjUR20ORiw"
  },
  {
    sourceKey: "ouray",
    sourceLabel: "Ouray County",
    date: "2026-09-29",
    title: "BOCC — Sep 29, 2026",
    recap: "Ouray County held its second 2027 budget work session, working through department spending plans aimed at closing a roughly $1.5–1.6 million general fund deficit. No formal votes were taken; commissioners gave direction to department heads and the county manager on bottom-line budgets, with a formal adoption meeting set for December 8.\n\nEMS presented the largest single development: a restructured budget that eliminates the general fund transfer entirely for 2027 — saving approximately $155,000 — through a revised billing matrix, moving employees onto Ridgway Fire's health insurance plan, and zeroing out the ambulance barn lease after Ouray Fire agreed to provide bay access at no cost.\n\nLand use was directed to meet the 15% reduction target even if it requires reducing staff hours or eliminating a position, with the county manager to work out specifics. A fee schedule update covering building permits (a ~29% inflation adjustment), land use permits, short-term rental renewals (proposed increase from $235 to $400), and road impact fees was authorized to proceed to a hearing.\n\nThe assessor, clerk/elections, treasurer, public health, IT/GIS, road and bridge, and human services budgets were reviewed and accepted as placeholders pending final reconciliation. Commissioners discussed including the BOCC share in the cost allocation to road and bridge (potentially ~$200,000), directing staff to verify feasibility. A sheriff's office work session is scheduled for the following Tuesday, following a Monday joint session with the City of Ouray on a proposed law enforcement cooperation agreement.",
    votes: [],
    videoUrl: "https://vimeo.com/1231719755"
  },
  {
    sourceKey: "rico",
    sourceLabel: "Rico",
    date: "2026-09-29",
    title: "Board of Trustees — Sep 29, 2026",
    recap: "The board held its first budget hearing for the 2027 fiscal year. Staff flagged a larger-than-expected sales tax decline, attributed partly to a slowdown in building permits and the wind-down of a major local project. The budget is described as conservative, with possible draws on reserves if the board later prioritizes a master plan or avalanche study. Grant funding for either item may also be pursued if opportunities arise.\n\nA $25,000 placeholder was included in the Rico Center grant line for back-stair repairs and AV equipment replacement. The board discussed combining maintenance and grooming positions and explored a volunteer grooming program for the coming winter.\n\nThe board directed staff to bring numbers to first reading on a pay increase for town marshals — options discussed included a $5/hour raise for the senior marshal and adding paid travel time for both officers. No vote was taken.\n\nOn the water fund, staff detailed the condition of an aging storage tank, with restoration quotes ranging from roughly $50,000 to $70,000. Two vendors offered to split payment across two budget cycles at no additional cost. A Silver Creek design-engineering grant previously expected did not materialize; staff is monitoring for the funding to reopen.",
    votes: [],
    videoUrl: "https://www.youtube.com/watch?v=OJHEQPCmfrs"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2026-09-28",
    title: "SMART Gondola Leadership Committee — Sep 28, 2026",
    recap: "The Leadership Committee reached consensus to stay the course pursuing federal funding through the FTA's Capital Investment Grant (CIG) program rather than pivoting to a locally funded project. Staff presented a side-by-side comparison: the federalized path is estimated at $140 million with a 2031 construction midpoint and a potential net benefit of $33–$60 million after federal match; the non-federalized path comes in at roughly $131 million with a possible one-year earlier delivery, but only if local funding is already in place — which it is not.\n\nThe Gondola Advisory Board (GUB) unanimously recommended continuing the federal path, and leadership members from both Telluride and Mountain Village spoke in support, noting that key FTA eligibility questions — including capacity thresholds and Buy/Build America compliance — are expected to be answered in the near term.\n\nTMVA signaled it would take the lead on hiring a lobbyist, using funds already budgeted within its own share of the project. After some confusion, the group confirmed no change to the current 2027 IGA budget is proposed.\n\nOn other updates: the gondola condition assessment is underway with draft reports expected in November and finals in December; the Buy/Build America compliance memo to the FTA is planned for October submission; and the 2027 IGA supplement has been routed to all funding partners for execution via DocuSign, with the Standing SMART adoption date set for October 8.",
    votes: [],
    videoUrl: "https://www.youtube.com/watch?v=tm1wqvFtFms"
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-09-25",
    title: "Mountain Village Town Council — Sep 25, 2026",
    recap: "A brief special meeting convened solely to move into executive session for two purposes: discussing town manager finalists (a personnel matter not involving current employees) and instructing negotiators on a potential town manager contract. The public meeting immediately adjourned after that vote.",
    votes: [],
    videoUrl: "https://media.avcaptureall.cloud/meeting/f0518ee8-8370-4a16-9138-d66835eaf7cd"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-09-24",
    title: "Planning & Zoning — Sep 24, 2026",
    recap: "The commission held a work session on a proposed Telluride R-1 School District employee housing project at the northwest corner of the Telluride Middle-High School site (725 West Colorado). The IGA between the town and the school district, already executed and effective, frames P&Z's review as limited to density, parking, and traffic. The proposal calls for four duplex buildings — eight one-bedroom units on a 0.91-acre site — which is within both the IGA's cap of ten units and the zone district's density limits. Staff noted that converting existing commuter parking spaces to resident parking produces no net parking loss and no added traffic.\n\nThe Shandoka Lot preliminary PUD public hearing was continued to the October 22, 2026 P&Z meeting at staff's request due to staff capacity.\n\nThe commission continued its work session on potential amendments to land use code sections 3-502 and 3-505 (landscaping and tree removal). Staff presented a peer-review of Aspen, Crested Butte, Boulder, and Breckenridge codes. Discussion centered on protection zones, damage definitions, replacement standards, and enforcement. The commission directed staff to convene a small working group — including arborists, a HARC member, and public works representation — to identify specific code problems before a draft amendment comes forward, likely in November.",
    votes: [{"item":"Shandoka Lot preliminary PUD — continued to Oct 22","outcome":"Continued","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=B2bYEedrpbo"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-09-24",
    title: "San Miguel County 5x5 Meeting — Sep 24, 2026",
    recap: "San Miguel County hosted the regional 5x5 meeting, bringing together commissioners and staff from Archuleta, Dolores, Montezuma, La Plata, and San Miguel counties, along with state and federal legislative representatives.\n\nWildfire dominated the discussion. Counties shared experiences from a brutal season — a 1,700-acre fire in Archuleta, the roughly 90,000-acre Ferris fire in Dolores — and compared strategies including water-storage tanks, Pano AI detection cameras, and defensible-space funding gaps. Montezuma County announced it is using Title III SRS funds to install two Pano cameras at Park Point in partnership with Mesa Verde National Park. San Miguel noted its cameras have already enabled early response. Pitkin County is reportedly developing legislation for statewide Pano funding; Proposition 137 on the November ballot would direct sporting-goods sales tax toward wildfire prevention and watershed restoration.\n\nSan Miguel County reported an 870-unit housing deficit projected to exceed 1,000 units by 2030. A citizen stakeholder group has completed a package of land-use code changes for planning commission and commissioner review. The county also adopted the Colorado model low-energy and carbon building code. A CDOT partnership at the Draco shop site targets 12 initial workforce-housing units, expandable to 46 if a wastewater plant is built. The county is re-advertising for a planning director after the first round yielded no suitable hire.\n\nLa Plata County updated two Urban Renewal Authority projects: up to 135 housing units with a childcare facility on Florida Road, and a redevelopment study of the Durango Mall area. A Region 9 broadband grant of $823,000 was approved for the Wolf Creek fiber project, adding redundant connectivity for Archuleta County. La Plata and Archuleta counties jointly filed a complaint with the PUC over repeated fiber cuts by Lumen Technologies that knock out 911 services.\n\nState Representative Stewart highlighted a new treatment-in-place law allowing EMS reimbursement under Medicaid without hospital transport, effective January 1, 2027, with commercial-plan expansion under study. Senator Hickenlooper's office flagged the Fix Our Forest Act (passed Senate committee), the 340B rural hospital prescription drug bill, and concern over a proposed OMB rule that would let agencies terminate federal grants without notice. The group agreed by consensus to extend standing invitations to the Southern Ute Indian Council and Ute Mountain Ute Tribe for future 5x5 meetings.",
    votes: [],
    videoUrl: "https://www.youtube.com/watch?v=wPoEdes-hkU"
  },
  {
    sourceKey: "ouray",
    sourceLabel: "Ouray County",
    date: "2026-09-23",
    title: "BOCC Budget Work Session — Sep 23, 2026",
    recap: "The Board held its first 2026–27 budget work session, aiming to identify roughly $1.5 million in general-fund reductions. No formal votes were taken; commissioners gave direction to staff for a preliminary budget due October 13 and a final adoption December 8.\n\nKey directional outcomes: the County Attorney's office outside-legal-services line was set at $18,000 (down from $27,000); the Fairgrounds budget was accepted as presented, with staff projecting the facility could break even in 2027; the Building & Facilities and Courthouse Security budgets were held at 2026 levels with no cuts identified; the Emergency Management budget was accepted with a direction to seek $14,000 each from the City of Ouray and Town of Ridgway (up from $5,000 each) under the annual MOU; and the Vegetation Management budget was accepted with the second seasonal position eliminated.\n\nThe Sheriff's Office discussion was deferred — commissioners lacked the revenue data needed to evaluate the department's position. A follow-up work session was scheduled for the morning of October 6, after a joint city-county meeting on October 5.\n\nCommissioners directed staff to prepare a resolution dissolving the Pinon Local Improvement District and sweeping its roughly $224,000 surplus to offset Sheriff's Office expenditures. Outside contributions to EcoAction Partners, West Region Wildfire Council, UWP, and CAIC were each reduced to $100. A 15% reduction placeholder of approximately $34,400 was set for the District Attorney's budget. Staff reported that confirmed cuts so far total roughly $400,000, with the Pinon LID sweep bringing the running total to an estimated $624,000 of the $1.5 million target.",
    votes: [],
    videoUrl: "https://vimeo.com/1231717718"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-09-23",
    title: "San Miguel County BOCC — Sep 23, 2026",
    recap: "Commissioners voted to direct staff to budget $700,000 as the county's share of the Lawson Hill intercept lot bike-path connector trail, contingent on the Lawson Hill POA board matching roughly $700,000. The project's low bid came in near $2 million — about double the original estimate — but the CDOT grant funding ($740,000) requires ADA-compliant design, making a cheaper rustic alternative essentially cost the same without the grant.\n\nThe board adopted the 2024 International Codes and Colorado Model Low Energy and Carbon Code (LEC) by resolution, with planning-commission amendments but setting the \"large home\" threshold at 4,000 square feet rather than the planning commission's 3,600 or the state's 5,000.\n\nA letter of support for Rural Homes in assisting Mountain Village with a CDOLA Local Land Planning Capacity Grant was approved unanimously.\n\nThe board reviewed 2027 nonprofit funding requests totaling roughly $296,000 and provisionally allocated approximately $241,000, with three organizations (Telluride Historical Museum, Telluride Institute science lab, Telluride Junior Nordic) held for further discussion. A $15,000 contingency reserve replaced the prior $20,000 buffer.",
    votes: [{"item":"Budget $700K for Lawson Hill bike-path connector","outcome":"Passed","tally":"3-0"}, {"item":"Adopt 2024 I-Codes and LEC (large home = 4,000 sq ft)","outcome":"Passed","tally":"3-0"}, {"item":"Letter of support for Rural Homes/Mountain Village CDOLA grant","outcome":"Passed","tally":"3-0"}],
    videoUrl: "https://www.youtube.com/watch?v=ewp7KVhoj-s"
  },
  {
    sourceKey: "ouray",
    sourceLabel: "Ouray County",
    date: "2026-09-22",
    title: "Ouray County BOCC — Sep 22, 2026",
    recap: "The board approved a $145,000 supplemental grant amendment for the regional affordable housing Local Planning Capacity Grant, extending the agreement through October 2028 with no additional local match required. It also authorized the county's signature on a GOCO grant agreement with Trust for Land Restoration for the Silver Mountain Mine Property Acquisition — a roughly 100-acre parcel the county can secure for about $10,000 in Conservation Trust funds against nearly $400,000 in grant money.\n\nThe board approved cancellation of four software contracts (items 1, 3, 4, and 5 from a five-item list), preserving the Tyler Host Reporting Services needed for financial data backups, saving an estimated $30,000 in the 2027 budget. It also approved waivers of the active-rental requirement for all county short-term rentals for 2026, citing broad impacts from the Gold Mountain fire; 2027 cases will be handled individually.\n\nA public hearing resulted in unanimous approval of a special use permit amendment for a restaurant expansion at 35 Hotchkiss Avenue in Kelowna, with a four-year staff-renewal term and added conditions on parking lot access from Highway 550 and cooperation on the election drop box.\n\nOther unanimous actions: a DHSEM intergovernmental grant agreement covering 75% of the county's 25% EWP match; adoption of Resolution 2026-23 replacing the State Wildfire Code (effective September 24) to close a 35-acre exemption loophole and restore PUD/subdivision language; ratification of a LEAP MOU with Goodwill Colorado; a therapeutic-services purchase agreement for child welfare; appointment of Lexi Marr to the County Fair Board through October 2028; and a fourth extension of the emergency disaster declaration. The board deferred action on a veteran medical transportation IGA and new position with San Miguel County, directing staff to renegotiate terms given the county's budget constraints. Direction was given to opt in to the 2027–29 Proposition 123 affordable housing cycle with an 18-unit regional commitment.",
    votes: [{"item":"Expenditures — consent agenda","outcome":"Passed","tally":""}, {"item":"Domestic Violence Awareness Month proclamation","outcome":"Passed","tally":""}, {"item":"Local Planning Capacity Grant amendment ($145k)","outcome":"Passed","tally":""}, {"item":"GOCO/TLR Silver Mountain Mine grant agreement","outcome":"Passed","tally":""}, {"item":"Contract cancellations (items 1,3,4,5) — ~$30k savings","outcome":"Passed","tally":""}, {"item":"Lexi Marr appointed to County Fair Board","outcome":"Passed","tally":""}, {"item":"DFPC Assumption of Control form","outcome":"Passed","tally":""}, {"item":"Conditional letter of intent — gravel pit shared access","outcome":"Passed","tally":""}],
    videoUrl: "https://vimeo.com/1231715111"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-09-22",
    title: "Town Council — Sep 22, 2026",
    recap: "Council unanimously approved a resolution converting two Feno2 affordable housing units (215 East Colorado Avenue, units 1A and 2A) from town-constructed units to employee dwelling units, removing the maximum sale price cap. The Telluride Housing Authority board then approved the same conversion on its end, as required by the dual-beneficiary deed restriction structure.\n\nTHA also approved a policy statement setting 0% rent increases for 2027 rental rates, and extended the waitlist policy suspension through January 31, 2027, pending results of a third-party policy review.\n\nOn second reading, council unanimously authorized the sale of three affordable units: Spruce House unit H (226 East Pacific Ave) and both Feno2 units (1A and 2A). Sale timelines and lottery details will be worked out at the October 7 THA subcommittee meeting.\n\nCouncil approved on first reading an ethics code amendment removing the phrase \"above reproach\" and replacing it with specific conduct expectations — with a floor amendment dropping \"profanity\" in favor of language focused on civility and respect. Second reading is set for October 6.",
    votes: [{"item":"Resolution: convert Feno2 units 1A & 2A to EDUs (Council)","outcome":"Passed","tally":"7-0"}, {"item":"Resolution: convert Feno2 units 1A & 2A to EDUs (THA)","outcome":"Passed","tally":"7-0"}, {"item":"Policy statement: 0% rent increase for 2027","outcome":"Passed","tally":"7-0"}, {"item":"Policy statement: extend waitlist suspension to Jan 31, 2027","outcome":"Passed","tally":"7-0"}, {"item":"Ordinance 2nd reading: sale of Spruce House unit H","outcome":"Passed","tally":"7-0"}, {"item":"Ordinance 2nd reading: sale of Feno2 unit 1A","outcome":"Passed","tally":"7-0"}, {"item":"Ordinance 2nd reading: sale of Feno2 unit 2A","outcome":"Passed","tally":"7-0"}, {"item":"Ordinance 1st reading: ethics code conduct amendment","outcome":"Passed","tally":"7-0"}],
    videoUrl: "https://www.youtube.com/watch?v=M6Gkc6D0qTw"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2026-09-21",
    title: "Gondola Advisory Committee (SMART) — Sep 21, 2026",
    recap: "The committee spent most of the meeting workshopping how to present the federal versus locally funded gondola comparison to the Leadership Committee meeting the following week. The core debate: whether to lead with an apples-to-apples same-scope cost comparison (federal vs. local funding, identical project) before showing a scaled-down baseline project, or to present both simultaneously. Members pushed back on the current presentation order, and the project team agreed to restructure it — starting with the cost delta of pursuing the federal CIG program, then showing trade-offs of scope reductions without assigning a fully defined alternative project.\n\nThe group landed on a draft recommendation to leadership: continue pursuing the CIG federal funding pathway, given the potential for roughly $70 million in grant funding, while acknowledging that a gondola has never been funded through the program. A second bullet directing further definition of a baseline project was dropped from the recommendation. The committee also noted the Buy America compliance memo is expected to be submitted to the FTA in October, and structural condition assessment reports are due by year-end.",
    votes: [],
    videoUrl: "https://www.youtube.com/watch?v=4_CJClKqOWM"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-09-19",
    title: "HARC — Sep 19, 2026",
    recap: "HARC held a work session on a proposed new municipal building at 113 West Columbia (Rebecca Hall), where the town is seeking to demolish the existing structure and replace it with a new Marshals Department facility. Commissioners offered extensive feedback: concerns included the three-story south facade at pedestrian scale, the building projecting beyond the adjacent historic Miners Union Hospital, excessive brick competing with that landmark, shallow shed-roof slopes, dormer size, garage-door visibility, and insufficient setback from the Miners Union. No vote was taken; the work session is a preliminary step before a formal application.\n\nHARC approved a three-year extension of Certificate of Appropriateness #10263 for the Phoenix Market project at 221 West Colorado, and the HARC chair recommended that Town Council grant a matching extension of the associated vested property rights, citing high construction costs, interest rates, and contractor availability.\n\nHARC approved a small-scale CA amendment for a residence at 845 Primrose Lane, with conditions including more stone on the east elevation at the garage level and reduced transom glazing on the east facade at the second level.\n\nHARC approved a final large-scale new-construction application at 208 South Fur with eight conditions, including reverting to the original arborist-report language for a mature spruce on the neighboring property, adjusting facade references in two conditions, and reducing third-level sliding-door glazing panels from four to six three-foot panels.\n\nHARC approved a small-scale new-construction application at 461 Dakota Avenue with four conditions, including further contouring the site to reduce retaining walls and restore natural topography, a revised lighting plan, voiding the prior CA, and reducing concentrated glazing on the south and north elevations.\n\nHARC approved a small-scale new-construction application at 734 Primrose Lane with three conditions, replacing a staff condition on deck massing with a requirement to eliminate or replace corrugated metal cladding on the south and west facades with a code-compliant material.",
    votes: [{"item":"Phoenix Market COA #10263 — 3-yr extension","outcome":"Passed","tally":""}, {"item":"Phoenix Market vested rights — recommend to Council","outcome":"Passed","tally":""}, {"item":"845 Primrose Ln — small-scale CA amendment","outcome":"Passed","tally":"4-1"}, {"item":"208 South Fur �� final large-scale new construction","outcome":"Passed","tally":""}, {"item":"208 South Fur — amend 2021 development agreement","outcome":"Passed","tally":""}, {"item":"461 Dakota Ave — small-scale new construction","outcome":"Passed","tally":""}, {"item":"734 Primrose Ln — small-scale new construction","outcome":"Passed","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=cuSYCwY9lMA"
  },
  {
    sourceKey: "rico",
    sourceLabel: "Rico",
    date: "2026-09-17",
    title: "Rico Board of Trustees — Sep 17, 2026",
    recap: "The board approved a revocable license and operating plan agreement with the Rico Trails Alliance for the Rio Grande Southern River Trail North, covering trail construction, bridge maintenance, insurance, and periodic inspection reimbursements. The vote was 5-1, with one trustee voting no.\n\nA liquor license renewal for Boulder City Mixology LLC (Enterprise Bar and Grill) was approved unanimously. The mayor recused himself due to a planned future event with the licensee.\n\nThe board passed first readings of three ordinances repealing outdated local laws: Ordinance 2026-10 (town warrants), Ordinance 2026-11 (old firehouse lease), and Ordinance 2026-12 (temporary sidewalk service area permits). All passed 6-0. The sidewalk ordinance repeal drew discussion about liquor license boundaries and state highway jurisdiction; staff will research further before the second reading.\n\nA road erosion control access agreement was approved 6-0, allowing a contractor to begin mitigation work on town roads. Staff also briefed the board on plans to open investment accounts for the parks and sewer funds to capture higher interest returns. A special budget hearing was scheduled for Monday, September 28 at 6:30 p.m. The board voted to enter executive session to discuss a potential property transfer for road access to the north Argentine neighborhood.",
    votes: [{"item":"RGS River Trail North license & operating plan","outcome":"Passed","tally":"5-1"}, {"item":"Liquor license renewal — Enterprise Bar and Grill","outcome":"Passed","tally":""}, {"item":"First reading — Ordinance 2026-10 (town warrants)","outcome":"Passed","tally":"6-0"}, {"item":"First reading — Ordinance 2026-11 (firehouse lease)","outcome":"Passed","tally":"6-0"}, {"item":"First reading — Ordinance 2026-12 (sidewalk permits)","outcome":"Passed","tally":"6-0"}, {"item":"Road erosion control access agreement","outcome":"Passed","tally":"6-0"}],
    videoUrl: "https://www.youtube.com/watch?v=8RfRG5-CKhs"
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-09-17",
    title: "Mountain Village Town Council — Sep 17, 2026",
    recap: "Council approved two proclamations: one designating September 2026 as Suicide Prevention Month, and a second — added from the dais after a resident's comment — proclaiming September 11th as Patriot Day and Day of Remembrance.\n\nOn the consent agenda, minutes and the Telluride Foundation agency funding agreement passed without discussion. An improvement and maintenance agreement with the Cortina Land Condominium Owners Association — settling a dispute over road and utility responsibility — was pulled for discussion and passed 5-1. Winter parking policies and rates were approved unchanged from last year.\n\nJennifer Vogel was appointed to a four-year term on the Telluride Regional Airport Authority through September 2030. Patrick Latcham was appointed as the TMVOA representative to the Plaza Vending Committee.\n\nCouncil passed second reading of an ordinance amending the municipal code governing the Public Art Commission, moving operational details from code into bylaws. A companion resolution adopting those bylaws — replacing a staff seat with a business-community appointee — also passed.\n\nTelski's conditional use permit for a temporary food truck and outdoor seating at OSP-35-C (the Big Billy's meadow area) was approved for one ski season, expiring April 4, 2027, with conditions: regular snow removal, maintenance in a clean and attractive condition, no tent structure, and a long-term plan presented to council upon expiration. Council sentiment leaned toward the improvement for ski school children but was broadly skeptical of the tent and food-truck aesthetic.\n\nA first reading passed on an ordinance amending housing code sections 16.01 and 16.02 to replace fixed fee amounts with a reference to the annually adopted MVHA fee schedule; a public hearing was set for October 15.\n\nDesign Workshop presented three conceptual designs for pond plaza improvements. Council provided direction favoring elements from multiple concepts — particularly stairs to the water's edge, wetland enhancement, snow melt, and integration with Four Seasons retail — and supported expanding the scope to include the adjacent conference center plaza. No vote was taken; staff will develop a preferred alternative and bring a formal resolution to initiate the entitlement process.\n\nThe Telluride Tourism Board presented a contract-renewal update. The existing three-year agreement auto-renews October 1; council directed staff to place an agenda item at a special meeting to extend the deadline, with a goal of voting on a new multi-year agreement by the October 15 meeting.\n\nA draft 2027 budget was presented at a high level as required by the town charter. Revenues are projected up roughly 8.6% excluding joint-project contributions; operating expenses up about 2.4%. The 2026 general fund swung from an $880,000 projected deficit to an estimated $390,000 surplus. A detailed budget presentation, including a new ten-year capital plan, is scheduled for October 8.",
    votes: [{"item":"Suicide Prevention Month proclamation","outcome":"Passed","tally":""}, {"item":"Patriot Day / 9-11 proclamation","outcome":"Passed","tally":""}, {"item":"Consent agenda items A, B, E (minutes + Telluride Foundation agreement)","outcome":"Passed","tally":""}, {"item":"Cortina Land COA maintenance agreement","outcome":"Passed","tally":"5-1"}, {"item":"Winter 2026-27 parking policies and rates","outcome":"Passed","tally":""}, {"item":"Jennifer Vogel appointment to TRAA (4-year term)","outcome":"Passed","tally":""}, {"item":"Patrick Latcham appointment to Plaza Vending Committee","outcome":"Passed","tally":""}, {"item":"Ordinance amending Ch. 2.18 — Public Art Commission (2nd reading)","outcome":"Passed","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/cccbf5e1-eca4-4a46-b8b3-2ee4452ed273"
  },
  {
    sourceKey: "ridgway",
    sourceLabel: "Town of Ridgway",
    date: "2026-09-16",
    title: "Planning Commission — Sep 16, 2026",
    recap: "The commission approved two linked applications for the Riverbend Town Homes project on Liddell Drive. A site plan for a five-unit, three-story townhome development was recommended to town council unanimously, with conditions including recordation of a 20-foot drainage and utility easement, approval of the related amended plat, and a revised geotech report before any building permit. The commission also unanimously approved a conditional use permit — within its own authority — for the building's size in the historic business zone.\n\nA companion amended plat for nearby parcels in the Riverview Business Park subdivision was recommended unanimously to town council. The plat vacates two existing 10-foot drainage easements that dead-end at a neighboring property line and replaces them with a new 20-foot easement connecting to the Uncompahgre River, establishing a public stormwater outfall that could eventually serve a broader drainage problem area.\n\nA third item — an amended plat and PUD amendment for Lena Street Commons — was continued to October 21 at the applicant's request.",
    votes: [{"item":"Riverbend Town Homes site plan — recommend to council","outcome":"Passed","tally":""}, {"item":"Riverbend Town Homes conditional use permit","outcome":"Passed","tally":""}, {"item":"Amended plat, Riverview Business Park — recommend to council","outcome":"Passed","tally":""}, {"item":"Lena Street Commons amended plat/PUD — continued to Oct 21","outcome":"Continued","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=A2zrmObL01E"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-09-16",
    title: "Board of County Commissioners — Sep 16, 2026",
    recap: "Commissioners took opposed positions on Amendment 81 (law enforcement/ICE communication), citing Sheriff Kovalt's memo that it circumvents existing statute, is vague, and raises due process concerns. On Amendment 86 (congressional redistricting), commissioners took no position, viewing it as redundant with existing safeguards.\n\nCommissioners approved a memorandum of understanding with the Town of Mountain Village and the Ridge at Telluride HOA clarifying that the 1999 Coonskin viewplane restriction uses a continuously sloped rather than stepped interpretation — with staff authorized to finalize details.\n\nThe 2025 county audit received a clean (unmodified) opinion on financial statements and federal single-audit compliance. Auditors flagged best-practice recommendations around communication between the finance and treasurer's offices, including joint reconciliation schedules and cross-training.\n\nA housing authority exception was approved for a deed-restricted property owner to rent his unit to qualified employees for another year, with conditions carried forward from the prior agreement plus a new prohibition on subleasing. The 2024 International Building Code and Low Energy Code adoption was continued to September 23. An IGA with Ouray County for veterans medical transportation was approved, as was a new part-time driver position to support the program. A year-round 32-hour fairgrounds maintenance position was also approved. Commissioners directed staff to update a resolution raising the assessor's authority to settle abatements to $20,000 (from $10,000) per new state law.",
    votes: [{"item":"MOU with Mountain Village on viewplane interpretation","outcome":"Passed","tally":"3-0"}, {"item":"Housing exception — David Whitlaw, annual leave","outcome":"Passed","tally":"3-0"}, {"item":"Continue 2024 IBC/Low Energy Code to Sep 23","outcome":"Continued","tally":"3-0"}, {"item":"IGA with Ouray County — veterans transportation","outcome":"Passed","tally":"3-0"}, {"item":"New veteran transportation driver position","outcome":"Passed","tally":"3-0"}, {"item":"New 32-hr year-round fairgrounds maintenance position","outcome":"Passed","tally":"3-0"}],
    videoUrl: "https://www.youtube.com/watch?v=VR6L_qdCyz4"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-09-15",
    title: "SSR (Strategic Stakeholder Roundtable) — Sep 15, 2026",
    recap: "The group's eighth meeting focused on proposed land use code changes aimed at making affordable and workforce housing easier to build in San Miguel County. Staff walked through previously discussed items — revised minimum lot sizes (2 acres for low density, half-acre for medium density, no minimum for high density), reduced building setbacks from 12.5 to 10 feet, streamlined one- and two-step review tiers for projects with significant deed restrictions, and expanded ADU and caretaker unit allowances.\n\nThe bulk of the meeting centered on the Community Housing (CH) zone. The central question was whether to set a unit cap above which a project would require the full five-step PUD process. After extended discussion, voting members reached a rough consensus — though not the full 70% supermajority — around 175 units as that trigger, with one member dissenting in favor of a higher cap. Staff noted the recommendation is nonbinding and will be passed to the Planning Commission and Board of County Commissioners.\n\nThe group also flagged two items for future meetings: whether to raise the 30% housing mitigation requirement for high-density free-market development (which may require a new linkage study), and whether the September 30th impact mitigation fee session could open that conversation.",
    votes: [{"item":"Cap on CH zone units before PUD required","outcome":"Passed","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=DsJdIBnDlME"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-09-10",
    title: "San Miguel County Planning Commission — Sep 10, 2026",
    recap: "The commission worked through three land use code amendments, each recommended to the BOCC by unanimous vote.\n\nForestry Practices (new Section 6-4): Adds a regulatory framework focused on surface disturbance rather than board feet. Key thresholds: activities under 1.5 acres are exempt; 1.5–80 acres is minor (administrative); over 80 acres is major (two-step Planning Commission/BOCC review). Qualifying wildfire mitigation work done under West Region Wildfire Council or Colorado State Forest Service operates under a general permit. The commission added language on aerial resources (replacing \"aerial extraction\"), clarified streamside management zone buffers, and required emergency preparedness plans to explicitly address red flag warnings and fire restrictions.\n\nOil & Gas Operations (new Section 6-5): Replaces existing Section 5-26. All operations move to two-step review. Written notice to neighbors increased from 20 to 30 days. A 500-foot riparian/water-body buffer was added. Visual quality language was amended to require no adverse road impacts.\n\nDeep Geothermal Operations (new Section 6-6): Entirely new regulations. Two-step review required. Residential setback set at 1,000 feet (up from a draft 500 feet), with a 500-foot buffer added for riparian areas. Continuous seismic monitoring required for injection wells. A related amendment broadens the data-center renewable-energy provision to cover all Article 6 energy sources, not just solar.",
    votes: [{"item":"Forestry Practices code amendment (Sec 6-4)","outcome":"Passed","tally":"5-0"}, {"item":"Oil & Gas Operations code amendment (Sec 6-5)","outcome":"Passed","tally":"5-0"}, {"item":"Deep Geothermal Operations code amendment (Sec 6-6)","outcome":"Passed","tally":"5-0"}],
    videoUrl: "https://www.youtube.com/watch?v=7ZuqrWyORbE"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2026-09-10",
    title: "SMART Board of Directors — Sep 10, 2026",
    recap: "At its September 10, 2026 regular meeting, the SMART Board accepted the FY25 financial audit report, which contained no findings, and noted that the auditor reviewed the agency's first-year 3A sales tax revenue allocations without concern. The Board also selected PFM Asset Management as SMART's investment advisor and approved joining the CSIP Investment Pool to better manage the agency's growing reserves.\n\nThe Board spent significant time on FY27 budget development, directing staff to refine how overhead costs are allocated between the operating and gondola funds before presenting a revised draft in October. Staff also updated the Board on gondola project activities — including a structural analysis, Buy America compliance, and the development of a 2027 cost-sharing intergovernmental agreement — as well as proposed off-season transit schedule changes and potential cost-sharing with other jurisdictions to expand the Montrose Route. A brief executive session on personnel matters closed out the meeting.",
    votes: [{"item":"Resolution 2026-19 — FY25 Financials Audit Report and Acceptance","outcome":"Passed","tally":"7-0"}, {"item":"Resolution 2026-20 — Selection of PFM Asset Management for Investment Advisory Services and Approval of Entry into CSIP Investment Pool","outcome":"Passed","tally":"7-0"}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-Meeting-Packet_October-8th-2026.pdf#minutes-2026-09-10",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-Meeting-Packet_October-8th-2026.pdf"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-09-09",
    title: "Board of County Commissioners — Sep 9, 2026",
    recap: "Commissioners reviewed Colorado's November ballot measures and staked out positions. They agreed to oppose the constitutional right to natural gas (formerly Initiative 177), oppose the income tax rate cap, support the graduated income tax amendment (Amendment 87), support the TABOR revenue cap increase for K-12 education (Prop NN), and oppose the mandatory life-without-parole sentencing for human trafficking of a minor — taking an abstain position on the latter instead. Commissioners also agreed to oppose Amendment 84 (mail ballot ID requirement), oppose the constitutional right to hunt and fish, and oppose Prop 132 (mandatory fentanyl sentencing), with Sheriff Kovalt detailing the unfunded-mandate burden on rural jails. Amendment 85 (plain-language ballot requirement) drew initial interest but ended in an oppose position after staff flagged conflicts with existing constitutional ballot language. Amendment 81 (law enforcement/federal immigration communication) was held pending the sheriff's further research.\n\nCommissioners, sitting as the San Miguel County Housing Authority, approved Resolution 2026-34 amending the area median income limitations for certain Pinion Park deed-restricted properties — raising qualifying units from 80% AMI to 100% AMI, with the third \"whereas\" clause corrected to reflect AMI limits ranging from 80% to 180%.\n\nThe board held a lengthy work session on potential amendments to the county's deed-restriction covenant. Commissioners coalesced around a 4% annual appreciation cap (excluding Lawson Hill due to HOA declaration conflicts), dropping the \"subject to market forces\" language, maintaining the 1,200-hour employment standard, removing the option-to-purchase provision in favor of ensuring deed restrictions survive foreclosure via recording-order instructions, and tightening trust/estate provisions. Questions around qualifying income and remote workers were tabled for a follow-up session by end of October.\n\nOn staffing and capital matters, the county manager reported the Illium housing project (five sheriff's office units) came in at a $3.3 million GMP — roughly $1 million over initial estimates — and the project will be rebid rather than contracted at current figures. A new parks and open space manager, JD Wise, was hired and starts October 19. The planning director search was relaunched after the first round of interviews did not yield a hire.",
    votes: [{"item":"Consent agenda","outcome":"Passed","tally":"3-0"}, {"item":"Resolution 2026-34: Pinion Park AMI limit change (80% to 100%)","outcome":"Passed","tally":"3-0"}, {"item":"Appoint Commissioner Gleason as CCI alternate for 2027 legislative priorities vote","outcome":"Passed","tally":"3-0"}],
    videoUrl: "https://www.youtube.com/watch?v=i1grtO2SwzE"
  },
  {
    sourceKey: "ouray",
    sourceLabel: "Ouray County",
    date: "2026-09-09",
    title: "Ouray County BOCC — Sep 9, 2026",
    recap: "The board held a work session with Rural Homes nonprofit developer Paul Nager on the status of Waterview Homes Phase 2 in Ouray. Phase 1's 21 homes are fully occupied, including two units operating as licensed home-based childcare centers — both reported successful. Phase 2 is platted for roughly 42 units but faces several hurdles: a $1.9 million state loan due July 2027, a pending $1.4 million congressional-directed HUD grant whose terms are not yet finalized, and the need for new city water and sewer capacity. Next steps include a community/city work session to assess rental vs. ownership mix and market absorption.\n\nThe board then received a detailed budget overview from Finance Director Jason, projecting a roughly $1.5 million general fund structural deficit for 2027 — about 15% of general fund spending. Personnel represents approximately 70% of general fund expenditures. Department heads' combined proposed cuts reached only about $80,000, or 3% of operating costs. Options discussed included reducing hours from 40 to 36 for applicable employees (~$275,000 savings), furlough days tied to the 13 county holidays (~$260,000), a 1% merit bonus elimination (~$43,000), retirement contribution reductions (~$45,000–50,000 per percentage point), and benefit plan analysis. Staff and commissioners acknowledged that reduction in force remains a likely outcome.\n\nCommissioners agreed on a budget process: department-by-department work sessions on September 23rd and a special session September 29th to set top-line department allocations, a preliminary budget presentation October 13th, and budget adoption targeted for December 8th.\n\nIn admin reports, County Manager Mendez announced the hire of Henry Mitchell as the county's new Recovery Manager, beginning September 28th. A TABOR notice for the November disaster sales tax ballot measure is active; pro/con statements are due to the county manager by noon September 18th.",
    votes: [],
    videoUrl: "https://vimeo.com/1225421786"
  },
  {
    sourceKey: "ridgway",
    sourceLabel: "Town of Ridgway",
    date: "2026-09-09",
    title: "Ridgway Town Council — Sep 9, 2026",
    recap: "Council unanimously approved a proclamation declaring September 2026 National Suicide Prevention Awareness Month. Two community events were approved: a parking-lot sale at the library on October 10th and a trunk-or-treat event at the same location on October 30th.\n\nTwo applicants were appointed to the Sustainability Advisory Board, filling vacancies left by three departing members. The board now has five members, still below its seven-member cap.\n\nCouncil authorized staff to issue an RFP for a consultant to develop 100% construction-level documents for the Ridgway Athletic Park Bike Park, drawing on $125,000 in previously earmarked athletic-park reserves. The move is aimed at making the coalition's application for a GO Colorado grant competitive.\n\nA contract with Surf Structures LLC (not to exceed $50,000) was approved for post-office-area sidewalk and Clinton Street valley-pan repairs, with Mesa Concrete as a named backup. Council also awarded a professional-services agreement to 2757 Design Co. to develop four pre-approved ADU plan sets, largely offset by a DOLA grant leaving the town's share just over $7,000.\n\nThe revised Marshal's Office overtime policy — lowering the overtime threshold from 86 to 80 hours in a 14-day pay period — was adopted. Resolution 26-07 formally accepted completion of the ductile-iron pipe replacement project. Stage Two fire restrictions were rescinded in favor of Stage One, and mandatory water restrictions were lifted entirely.",
    votes: [{"item":"Suicide Prevention Awareness Month proclamation","outcome":"Passed","tally":""}, {"item":"Library parking lot use — Oct 10 community sale","outcome":"Passed","tally":""}, {"item":"Sustainability Advisory Board appointments","outcome":"Passed","tally":""}, {"item":"Award ADU plans contract to 2757 Design Co.","outcome":"Passed","tally":""}, {"item":"Sidewalk/valley-pan repairs — Surf Structures LLC","outcome":"Passed","tally":""}, {"item":"Library parking lot use — Oct 30 trunk-or-treat","outcome":"Passed","tally":""}, {"item":"Authorize RFP for Bike Park construction docs","outcome":"Passed","tally":""}, {"item":"Revised Marshal's Office overtime policy","outcome":"Passed","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=O0WD-MM9NfQ"
  },
  {
    sourceKey: "ouray",
    sourceLabel: "Ouray County",
    date: "2026-09-08",
    title: "Ouray County BOCC — Sep 8, 2026",
    recap: "The board approved expenditures including a $403,000-plus Haynes excavation invoice and a $221,000 ambulance purchase, contingent on passage of the budget amendment later in the session. A proclamation declaring September 2026 Suicide Prevention Awareness Month was adopted unanimously.\n\nThe board authorized a special event permit for a Chevrolet commercial film shoot on County Road 361 on September 18th — with County Road 20 removed from the original request — contingent on approval from the Forest Service, Ouray County Sheriff's Office, and State Patrol. The board unanimously authorized the county manager, county attorney, and sheriff to continue negotiating and finalize an assumption-of-control form for the Gold Mountain Fire, with the chair's eventual signature subject to ratification.\n\nCommissioners approved proceeding with an IGA for functional consolidation of Ouray County EMS with the Ridgway Fire Protection District for 2027. A hazardous tree removal at Top of the Pines campground and an election services agreement with the Regional Service Authority were approved. The board also approved a support letter for the Blue Lakes fee proposal, attaching the county's 2023 comments for reference.\n\nThe assessor's office received authorization to issue an RFP for new CAMA software in 2026, using savings from an unfilled staff position. Two Road and Bridge mechanic vacancies were approved for refilling; Public Health was approved to replace a full-time administrative position with a 24-hour part-time role. A public hearing resulted in unanimous approval of Resolution 2026-21, a supplemental budget amendment for emergency-related expenditures, with a $50,000 transfer from the Pinion Special Assessment account struck pending resolution of a local improvement district dissolution. Resolution 2026-22, repealing Section 16 of the Land Use Code (wildfire regulations, now adopted by reference), passed unanimously.",
    votes: [{"item":"Expenditures approval (contingent on budget amendment)","outcome":"Passed","tally":""}, {"item":"Proclamation 2026-13: Suicide Prevention Awareness Month","outcome":"Passed","tally":""}, {"item":"Special event permit — commercial film shoot, CR 361, Sep 18","outcome":"Passed","tally":""}, {"item":"IGA authorization: EMS / Ridgway Fire functional consolidation","outcome":"Passed","tally":""}, {"item":"Hazardous tree removal — Top of the Pines","outcome":"Passed","tally":""}, {"item":"Election services agreement — RSA","outcome":"Passed","tally":""}, {"item":"Blue Lakes fee proposal support letter w/ 2023 attachment","outcome":"Passed","tally":""}, {"item":"Gold Mountain Fire assumption-of-control negotiation authorization","outcome":"Passed","tally":""}],
    videoUrl: "https://vimeo.com/1225420433"
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-09-03",
    title: "Design Review Board — Sep 3, 2026",
    recap: "The DRB recommended approval to Town Council of a conditional use permit for a temporary food truck, tent, and outdoor seating at the Meadows base area (332 Adams Ranch Road), operated by Telluride Ski & Golf. Board members trimmed the requested three-year term down to cover only the 2026–27 ski season, citing concern over the net loss of roughly 200 indoor seats at Big Billy's. The vote was unanimous.\n\nThe board approved a general easement encroachment at 4140 Cortina Drive for after-the-fact soil nail and mesh slope stabilization installed during construction, with conditions including restoration to original grade and a requirement to return for any future retaining wall.\n\nFinal architecture review was approved for a new single-family detached condominium on Lot AR-54 Adams Way, with the board adding a condition that the roof eave be pulled out of the general easement and requiring fire marshal sign-off on the steep driveway grade. One member dissented.\n\nFinal architecture review was also approved for a new single-family home on Lot 164-B1R San Joaquin Road. Key conditions include a requirement that the applicant obtain and record easement agreements with the adjacent property owner covering driveway access and utilities before a building permit is issued. One member dissented. A detached condominium on Lot 155-7 San Joaquin Road received unanimous final approval.\n\nThe board received an informational presentation from Design Workshop on three concept alternatives for redeveloping Pond Plaza near the Four Seasons construction site. No vote was taken; the project moves next toward a Town Council resolution and task force formation.",
    votes: [{"item":"CUP — temp food truck/tent, 332 Adams Ranch Rd","outcome":"Passed","tally":""}, {"item":"GE encroachment — 4140 Cortina Dr soil nails","outcome":"Passed","tally":""}, {"item":"Final arch review — Lot AR-54 Adams Way","outcome":"Passed","tally":""}, {"item":"Final arch review — Lot 164-B1R San Joaquin Rd","outcome":"Passed","tally":""}, {"item":"Final arch review — Lot 155-7 San Joaquin Rd","outcome":"Passed","tally":""}, {"item":"Continuation — Lot 224B Snowdrift Ln to Oct 1","outcome":"Passed","tally":""}, {"item":"Continuation — 306 Adams Ranch Rd to Oct 1","outcome":"Passed","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/f8033e3a-ac1b-40c1-b990-3bf86a9ed677"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-09-01",
    title: "Town Council — Sep 1, 2026",
    recap: "Council received work-session updates on the comprehensive plan (phase 2 outreach planned for late September) and the gondola replacement project, including a proposed 2027 IGA budget of $6.53 million with a 30% contingency as required for FTA project-development entry. An economic analysis presented by AECOM estimated that losing the gondola could put 10–15% of visitor spending at risk.\n\nOn the 2027 affordable-housing rental rates, council directed staff to hold rents flat (scenario 2 — no AMI increase applied) rather than pass through the 9.7% HUD AMI increase, citing the difficult 2025–26 economic year for residents. One member preferred scenario 1 (full increase) on budget grounds.\n\nThe 2026 mid-year budget amendment passed on second reading. First readings authorizing sale of three town-owned units — Spruce House H and two Feno 2 units — were approved, with public hearings set for September 22. Council approved a resolution formalizing the 30-minute free parking program, unanimously approved a wildfire mitigation project at Shandoka ($63,245 from the affordable-housing fund), and approved a valley-floor management-plan amendment permitting dogs on a relocated river-trail segment near the public-works facility.\n\nAppointments: Thomas Thatcher reappointed to Parks & Recreation Commission; Jill Alon appointed to CASE (alternate); Lee Shea Betten appointed to Planning & Zoning Commission (regular seat); Bob Mather reappointed to HARC; Public Art Commission appointment tabled pending records review. The Telluride Historical Museum received a special-event liquor permit for September 10.",
    votes: [{"item":"2026 mid-year budget amendment (2nd reading)","outcome":"Passed","tally":"7-0"}, {"item":"Wildfire mitigation at Shandoka ($63,245)","outcome":"Passed","tally":"7-0"}, {"item":"Valley floor mgmt plan amendment — dogs on river trail","outcome":"Passed","tally":"7-0"}, {"item":"30-minute free parking program resolution","outcome":"Passed","tally":"7-0"}, {"item":"1st reading — sale of Spruce House Unit H","outcome":"Passed","tally":"7-0"}, {"item":"1st reading — sale of Feno 2 Unit 1A","outcome":"Passed","tally":"7-0"}, {"item":"1st reading — sale of Feno 2 Unit 2A","outcome":"Passed","tally":"7-0"}, {"item":"Appoint Thomas Thatcher, Parks & Rec Commission","outcome":"Passed","tally":"7-0"}],
    videoUrl: "https://www.youtube.com/watch?v=I1B3OGB1XzE"
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-08-20",
    title: "Mountain Village Town Council — Aug 20, 2026",
    recap: "Council approved a budget appropriation resolution covering several items: $500,000 from TMVOA for fire mitigation efforts (defensive space rebates, assessments, and dead-tree removal on vacant lots); replacement of two Mountain Munchkins vans funded through the Child Development Fund; and $200,000 for the first-ever YES Program down payment assistance application, helping a longtime local purchase a home in Placerville with a deed restriction and 4% annual price appreciation cap attached.\n\nCouncil also passed a resolution setting a 4% annual price appreciation cap for affordable housing restriction properties under municipal code section 16.02.070, aligning those units with the Meadowlark and YES Program standards.\n\nOver DRB's 5-1 recommendation for denial, council approved a conditional use permit allowing a temporary office use at the vacant Wells Fargo space (Lot 68R, Unit 1A) for up to three years — through August 20, 2029 — to house construction staff for the Four Seasons project. The approval included conditions requiring Telski to market all vacant commercial spaces publicly within 45 days and prohibiting tenants from using the 11 parking spaces directly in front of the unit. The staff-level one-year extension was removed.\n\nCouncil approved amended bylaws for the Plaza Vending Committee, replacing the staff voting seat with a TMVOA-recommended representative to be appointed by council. First reading of an ordinance making a parallel change to the Public Art Commission's composition also passed. A worker protection ordinance proposal — covering anonymous complaint portals, up-the-chain contractor liability, business license accountability, and a CEO pay-ratio fee — was presented by Thrive Community Health Network and Raíces en Fronteras; council directed staff to research a framework and return with options.",
    votes: [{"item":"Budget appropriation resolution (fire mitigation, vans, YES Program)","outcome":"Passed","tally":"6-0"}, {"item":"Resolution setting 4% price appreciation cap (16.02.070)","outcome":"Passed","tally":""}, {"item":"CUP for temporary office at Lot 68R Unit 1A (Wells Fargo space)","outcome":"Passed","tally":"5-1"}, {"item":"Resolution amending Plaza Vending Committee bylaws","outcome":"Passed","tally":""}, {"item":"First reading: ordinance amending Public Art Commission (Ch. 2.18)","outcome":"Passed","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/3e38de7b-9e4f-43e3-8a96-2d5b71511d10"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-08-20",
    title: "Planning & Zoning — Aug 20, 2026",
    recap: "Two items were continued without discussion. The Telluride School District R-1 employee housing work session — proposed new construction at the middle school site — was continued to September 24, pending the town's intergovernmental agreement with the district, which awaits the school board's signature. A minor subdivision application for 238 North Pine Street was continued to October 22, with staff noting it will be recommended for withdrawal if the applicant is not ready to proceed at that meeting.\n\nThe commission held a comprehensive plan status update with consultants Logan Simpson. Phase one outreach reached roughly 480 in-person contacts and 357 questionnaire responses; top themes were housing and affordability, sustainability, and community equity. Commissioners flagged concerns about census data understating the Hispanic population, the absence of natural-hazard topics (wildfire, flood, mudslide) from phase-one findings, and the need for higher engagement numbers. The team is targeting a major community outreach push in late September through October, with a follow-up work session tentatively set for September 17.\n\nThe commission then took up a discussion on Land Use Code Section 3-505 governing tree maintenance, removal, and relocation. Two local arborists addressed the commission, raising concerns about inconsistent permitting, the lack of a clear hazard-tree definition, mitigation fees that discourage removal of genuinely dangerous trees, and staff turnover creating unpredictable reviews. Key themes included the need for a formal hazard-tree definition, a public tree inventory, streamlined site-visit protocols, and the long-term possibility of a municipal arborist position. No code amendments were adopted; next steps include a community info session for contractors on August 25 and a follow-up work session at the September 24 regular meeting.",
    votes: [{"item":"Continue R-1 employee housing work session to Sep 24","outcome":"Continued","tally":""}, {"item":"Continue 238 N Pine St minor subdivision to Oct 22","outcome":"Continued","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=owcOgLJ1Qto"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-08-19",
    title: "HARC — Aug 19, 2026",
    recap: "HARC held its second work session on a proposed new county-town municipal building at 335 West Colorado. The applicant presented revisions responding to earlier feedback, including additional third-floor setbacks, simplified massing along Aspen Street, and reduced glazing. Commissioners offered eight areas for further refinement: better differentiation between the new building and the adjacent Miramonte building, increased third-floor setbacks from Colorado Avenue and Aspen Street, material changes on the west elevation, corner redesign at Aspen and Colorado, improved alley-facing windows, relief near the historic shed, more street-level perspectives, and a clearer main entry. The question of where to relocate a second historic shed — the applicant proposes a nearby county pocket park — remains unresolved; several commissioners and public commenters said it belongs on an alley.\n\nHARC then held preliminary public hearings on the Shandoka Lot redevelopment (860 Black Bear Road), a four-building mixed-use project combining affordable housing, underground parking, transit infrastructure, and neighborhood commercial uses on town-owned land. After extensive public comment — nearly universally critical of mass and scale — commissioners voted to continue both applications to October 21, 2026, with conditions requiring substantial reductions: all corners capped at two stories, elimination of the fifth floor of Building One, Building Two reduced to two stories and broken into two or three separate structures, east and west setbacks increased by at least 20 feet on each end, no unbroken three-story wall planes, revised rooftop treatment replacing the large green space with landscape islands, and completion of a hydrostatic study before the next hearing. The motion on Buildings One and Two passed 4-1; Buildings Three and Four passed 5-0, with an added condition to increase the setback on Building Three's west side for pedestrian access.\n\nFive additional applications — the Carhenge redevelopment (Buildings A–E, three separate items) and two items at 238 North Pine — were continued without discussion, Carhenge to September 30 and North Pine to November 18. Three further individual-property items were continued to the September 16 regular meeting.",
    votes: [{"item":"335 W Colorado work session (no formal vote)","outcome":"Tabled","tally":""}, {"item":"Shandoka Lot Bldgs 1&2 — continue to Oct 21","outcome":"Continued","tally":"4-1"}, {"item":"Shandoka Lot Bldgs 3&4 — continue to Oct 21","outcome":"Continued","tally":"5-0"}, {"item":"Carhenge Bldgs A-E (3 items) — continue to Sep 30","outcome":"Continued","tally":""}, {"item":"238 North Pine (2 items) — continue to Nov 18","outcome":"Continued","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=5Nuo30i3vGk"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2026-08-13",
    title: "SMART Board of Directors — Aug 13, 2026",
    recap: "The SMART Board held its August 13, 2026 regular meeting with directors from Telluride, Mountain Village, and San Miguel County. The board unanimously approved four resolutions: adopting the agenda and July 23 minutes; restructuring the Gondola Advisory Committee based on a recommendation from the Gondola Leadership Committee; reassigning general counsel Paul Taddune's professional services contract to the law firm JF AM, PLLC; and amending the FY26 Budget and Capital Spending Plan to reflect updated funding needs for gondola and bus projects.\n\nThe board also provided direction for FY27 budget development, instructing staff to assume flat sales and lodging tax revenues relative to FY26, a modest property tax increase within the statutory cap, reduced rental income, and higher grant revenue from anticipated SB230 funding. Executive Director Averill updated the board on gondola project activities — including structural analysis, Buy America compliance, FTA coordination, and vendor procurement — while Operations Director Distefano discussed potential off-season schedule modifications and facilities planning. The meeting concluded with an executive session on personnel matters.",
    votes: [{"item":"Resolution 2026-15 — Gondola Advisory Committee restructuring","outcome":"Passed","tally":""}, {"item":"Resolution 2026-16 — Assignment of Professional Services Contract to JF AM, PLLC","outcome":"Passed","tally":""}, {"item":"Resolution 2026-17 — Amendment to the FY26 Budget and Capital Spending Plan","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-Meeting-Packet_September-10th-2026.pdf#minutes-2026-08-13",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-Meeting-Packet_September-10th-2026.pdf"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-08-11",
    title: "Town Council — Aug 11, 2026",
    recap: "Council approved on third reading an ordinance amending the land use code to implement the Colorado Wildfire Resiliency Code (CWRC). The key revision removes tree-mitigation requirements for trees removed specifically under the CWRC. The vote was 6-1, with one dissenting vote.\n\nCouncil approved on first reading a mid-year budget amendment totaling approximately $5.4 million, covering carry-forward items from 2025 (road improvements, fleet, sewer lining) and new 2026 appropriations including costs tied to the ski patrol strike, sewer line relocates, and a wayfinding project. A public hearing for second reading was set for September 1.\n\nJohn Kirkindall was unanimously appointed to a regular seat on the Telluride Regional Airport Authority for a four-year term. Council also directed staff to pursue a FEMA flood-plane remapping project — the town's map dates to 1992 — with a placeholder to be included in the 2027 budget. Estimated cost is $225,000–$275,000 and the process is expected to take roughly two years.\n\nFor the two Feno deed-restricted units, council reached consensus via straw poll to convert them to EDUs (removing the price and income caps while retaining occupancy qualification requirements) and market them broadly, potentially through an MLS listing. The recently acquired Spruce House unit will go to a general lottery, timing to be determined by staff. A new hotel-and-restaurant liquor license for \"The Patio\" at 138 East Colorado Avenue was approved unanimously by the Liquor Licensing Authority.",
    votes: [{"item":"CWRC land use code amendments — 3rd reading","outcome":"Passed","tally":"6-1"}, {"item":"Mid-year 2026 budget amendment — 1st reading","outcome":"Passed","tally":"7-0"}, {"item":"Kirkindall appointment — Airport Authority","outcome":"Passed","tally":"7-0"}, {"item":"Liquor license — The Patio (FA Wining Pigs Bar 10)","outcome":"Passed","tally":"5-0"}],
    videoUrl: "https://www.youtube.com/watch?v=-3l48zNnbBU"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-08-10",
    title: "Intergovernmental Meeting — Aug 10, 2026",
    recap: "This joint session of the Town of Telluride, San Miguel County, Mountain Village, Norwood, and Ophir was devoted to work sessions — no formal votes were taken.\n\nRegional housing updates: Telluride's Canyonlands and Towerhouse projects (36 deed-restricted units) are on track for Q1–Q2 2027 completion. The county's Illium Valley five-unit workforce project is in trouble after preliminary bids came in above $1,200 per square foot — without land costs. The county's Deep Creek project remains conceptual at up to 35 units, pending water and wastewater confirmation.\n\nTelluride Regional Medical Center board chair provided a detailed update: Newmont has offered a 30-year lease extension on the current town site, opening a two-site path — a freestanding emergency department at Society Turn and a refurbished primary-care facility in town. A capital campaign (no public bonds anticipated) is the funding vehicle; architects would be engaged this fall with a construction target around 2029–2031.\n\nMountain Village's Munchkins childcare program reported 41 children on its wait list, 26 of them infants — against a regional infant capacity of 18 slots. The program costs the town roughly $650,000 in subsidy for 2026. Mountain Village signaled it may seek regional partners to help fund a roughly $1 million expansion. Telluride noted its planned Shandoka Lot redevelopment includes 2,000 square feet of childcare space.\n\nThe Forest Service reported the Telluride Ski Area environmental analysis objection period closed with no objections filed, putting a final decision weeks away. The Telluride Mountain Club trails EA received one objection, currently under review. Fire mitigation for the broader Telluride valley was flagged as a priority following the nearby Gold Mountain and Elk fires. A heritage-specialist vacancy on the Norwood Ranger District remains unfilled.",
    votes: [],
    videoUrl: "https://www.youtube.com/watch?v=WG-Yk5DXzLQ"
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-08-06",
    title: "Design Review Board — Aug 6, 2026",
    recap: "The board approved an initial architecture and site review for a new four-unit multi-family condominium building at Lot 726-R1 on Pennington Place. The J-shaped, three-level structure will complement the existing six-unit Pennington Lodge, stepping down the hillside at well under the 48-foot height limit. A specific approval was granted for a secondary curb cut off Pennington Place, supported by both the public works director and fire marshal. A required fire-truck turnaround condition was dropped after staff confirmed the driveway falls under the 150-foot trigger length.\n\nThe board approved a final architecture review for Belvedere 3, a 19-condominium and two employee-unit multi-family building at Lot 27A on Lost Creek Lane. The vote was not unanimous; one member dissented, citing concerns about the scope of encroachments into the general easements — including a pool and spa — and unresolved lighting plan compliance. Conditions added include: stone cladding raised to 35% (with staff and chair sign-off on revised elevations), full ADA parking compliance, a lighting plan with foot-candle study reviewed by staff and one board member, and a blanket requirement that the applicant secure all necessary easements before construction.\n\nThe board voted to recommend denial to Town Council of a conditional use permit that would have allowed Telluride Ski & Golf to lease the vacant former Wells Fargo ground-floor space in the Palmyra Building as temporary office space for up to three years. Members broadly agreed the use conflicts with long-standing goals for ground-floor retail vitality on a primary pedestrian route in the village core.",
    votes: [{"item":"Initial arch/site review — 4 units, Pennington Place","outcome":"Passed","tally":""}, {"item":"Final arch review — Belvedere 3, Lost Creek Lane","outcome":"Passed","tally":""}, {"item":"CUP recommendation — office space, 620 MV Blvd 1A","outcome":"Failed","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/8ba62c5e-4012-4c9d-881e-7f6940944abd"
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-08-06",
    title: "Mountain Village Town Council — Jul 16, 2025",
    recap: "Council approved a rezone and density transfer at 306 Adams Ranch Road (Lot 640A), allowing Telluride Ski & Golf to add 15 deed-restricted employee apartments to an existing 30-unit complex. The vote was 4-3, with the dissenting members preferring to continue the application until a formal use-and-maintenance agreement for the adjacent open-space lawn was secured as a condition. The majority chose to approve without that condition, expressing trust that a park agreement would follow.\n\nCouncil also approved a variance allowing the existing 1,716-square-foot accessory dwelling unit at 500 Benchmark Drive to exceed the CDC's 1,500-square-foot ADU limit, resolving a pre-purchase discrepancy.\n\nA lighting-code amendment (CDC Section 17.5.12) passed on second reading, with a last-minute addition exempting wall-mounted sconces and soffit fixtures on existing structures from mandatory replacement — provided bulbs meet a 2,700 Kelvin-or-below color temperature. Staff was directed to develop an incentive program proposal for the 2027 budget.\n\nCouncil also approved Q2 2026 financials, appointed three members to the VCA Residents Committee for two-year terms, adopted a resolution correcting application types in the Prop 123 expedited-review policy, and extended the Stage 2 fire restrictions.",
    votes: [{"item":"Rezone & density transfer — 306 Adams Ranch Rd","outcome":"Passed","tally":"4-3"}, {"item":"ADU floor-area variance — 500 Benchmark Dr","outcome":"Passed","tally":""}, {"item":"Lighting code amendment — 2nd reading","outcome":"Passed","tally":""}, {"item":"Q2 2026 financials approval","outcome":"Passed","tally":""}, {"item":"VCA Residents Committee — 3 appointments","outcome":"Passed","tally":""}, {"item":"Prop 123 resolution correction","outcome":"Passed","tally":""}, {"item":"Extend Stage 2 fire restrictions","outcome":"Passed","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/400b4a0e-0d7e-40d9-b64d-71fca2f808aa"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-07-27",
    title: "Town Council (Liquor Authority) — Jul 27, 2026",
    recap: "The council, sitting as the Telluride Liquor Licensing Authority, approved a special event liquor permit for KOTO Radio (San Miguel Educational Fund) for its \"Live at the Drive\" event on North Pine Street, July 30, 2026, from 2–9:30 p.m. The vote was unanimous.",
    votes: [{"item":"KOTO Radio special event liquor permit — Jul 30","outcome":"Passed","tally":"5-0"}],
    videoUrl: "https://www.youtube.com/watch?v=ki-YpIByL6s"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-07-23",
    title: "Planning & Zoning — Jul 23, 2026",
    recap: "The commission approved the preliminary large-scale subdivision consolidating two town-owned parcels at 700 West Pacific (the Carhenge lot) — lots 34 and 34B, Bachmann Village — into one 4.1-acre lot. The vote was 3-0, with two members recused for proximity. Public comment centered on Bachmann Village covenant consent requirements and the lack of a concurrent development plan; staff and applicant counsel held that private covenants fall outside P&Z's purview.\n\nThe commission also approved the conceptual planned unit development for the Shandoka lot (860 Black Bear Road, Lot L) on a 4-0 vote, allowing the applicant to advance to a preliminary PUD submittal. The project proposes roughly 55 deed-restricted affordable housing units, approximately 300 net-new parking spaces in a structured garage, a transit center, and roughly 7,700 sq ft of neighborhood-serving commercial including child care and a food bank.\n\nApproval came with five conditions added by the board: (1) a clear presentation of PUD public benefits including the net parking-space gain and a commitment to free public parking in perpetuity; (2) a multimodal traffic study covering vehicles, bikes, and pedestrians; (3) a detailed construction-dewatering/mitigation plan for below-water-table work; (4) a vehicle-ownership survey of current Shandoka residents; and (5) the food bank placed in phase one.\n\nA minor subdivision at 238 North Pine Street was continued without discussion to the August 20 regular meeting. The commission also noted that Town Council, at second reading of the Colorado Wildfire Resiliency Code land use amendments, eliminated all tree-removal mitigation requirements for CWRC-mandated removals; a third reading is set for August 11. Todd Brown was appointed to the Ethics Commission and Peter Sante to the vending subcommittee.",
    votes: [{"item":"Carhenge lot preliminary large-scale subdivision","outcome":"Passed","tally":"3-0"}, {"item":"Shandoka conceptual PUD approval","outcome":"Passed","tally":"4-0"}, {"item":"238 North Pine St minor subdivision — continue to Aug 20","outcome":"Continued","tally":""}, {"item":"Appoint Todd Brown to Ethics Commission","outcome":"Passed","tally":""}, {"item":"Appoint Peter Sante to vending subcommittee","outcome":"Passed","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=INMRfOP1TEs"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2026-07-23",
    title: "SMART Board of Directors — Jul 23, 2026",
    recap: "At its July 23 regular meeting, the SMART Board took action on two gondola-related procurement items, selecting SCJ Alliance to conduct a structural analysis of the gondola system and the Gondola Shop to perform a separate structural analysis of the gondola cabins. Both awards followed a competitive RFP process. The board also approved routine housekeeping items including the upcoming August 13 agenda and the current meeting's minutes.\n\nBeyond the votes, the board discussed a proposed restructuring of the Gondola Advisory (Subcommittee) composition, expressing general support for changes that would remove Telluride Ski and Golf and San Miguel County as voting members, and directing staff to communicate the rationale to Telluride Ski and Golf. Staff provided a gondola project update covering Buy America requirements, FTA coordination, and a planned FY27 cost-sharing IGA supplement. Executive Director Averill introduced a forthcoming FY26 budget amendment driven by changes in revenue and expenses—including lower-than-anticipated Lodging Tax receipts—to be formally considered at the August meeting. The board also received a second-quarter 2026 performance report before entering executive session on personnel matters.",
    votes: [{"item":"Resolution 2026-12 — Selection of SCJ Alliance for Gondola Structural Analysis","outcome":"Passed","tally":""}, {"item":"Resolution 2026-13 — Selection of the Gondola Shop for Gondola Cabin Structural Analysis","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-meeting-packet_August-13th-2026.pdf#minutes-2026-07-23",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-meeting-packet_August-13th-2026.pdf"
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-07-21",
    title: "Mountain Village Town Council — Jul 21, 2026",
    recap: "Council appointed three new members to the VCA Residents Advisory Committee for two-year terms.\n\nThe main event was a 4-2 vote approving second reading of an ordinance rezoning and authorizing a density transfer at Lot 640A, 306 Adams Ranch Road, allowing 15 additional employee apartment units (all two-bedroom) in a new building on the northeast corner of the existing Mountain View employee housing site. The dissenting votes came from two councilmembers who wanted conditions requiring a formal use-and-maintenance agreement for the adjacent open-space field before the project could proceed. The majority chose to approve without that condition, citing the value of private workforce housing and a desire to extend goodwill toward the developer.\n\nCouncil approved second reading of an ordinance amending the Community Development Code's lighting regulations. A late amendment exempts existing wall-mounted fixtures and sconces attached to a structure from mandatory replacement, while still requiring bulb color temperature at or below 2,700 Kelvin. New construction remains fully subject to the updated rules; the five- and ten-year compliance timelines for other exterior lighting are unchanged. Staff was directed to study a potential fixture-incentive program for the 2027 budget.\n\nOther actions: Q2 2026 financials approved; a resolution correcting application types under Proposition 123 affordable-housing expedited review approved; Stage 2 fire restrictions extended; and an ADU floor-area variance for an existing structure at 500 Benchmark Drive approved.",
    votes: [{"item":"VCA Residents Advisory Committee appointments (3)","outcome":"Passed","tally":""}, {"item":"Q2 2026 financials approval","outcome":"Passed","tally":""}, {"item":"Rezone & density transfer — 306 Adams Ranch Rd (15 units)","outcome":"Passed","tally":"4-2"}, {"item":"ADU floor-area variance — 500 Benchmark Drive","outcome":"Passed","tally":""}, {"item":"Lighting regulations code amendment (CDC §17.5.12)","outcome":"Passed","tally":""}, {"item":"Prop 123 resolution correction — expedited review types","outcome":"Passed","tally":""}, {"item":"Stage 2 fire restrictions extension","outcome":"Passed","tally":""}, {"item":"Motion to extend meeting beyond time limit","outcome":"Passed","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/cd3f90c7-4db2-46f9-a23e-94cd069ced43"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-07-21",
    title: "Town Council — Jul 21, 2026",
    recap: "Council swore in two new members, Marya Stark and Charles Dalton, bringing the body to full seven-member strength.\n\nA work session covered an East Colorado Avenue speed study by KLJ Engineering, focusing on the Gold Run corridor between North Alder Street and Liberty Bell Lane. Staff found that segment two has the worst speeding problem, with 20–30% of vehicles exceeding the 15 mph limit. No votes were taken; council discussion centered on raised crosswalks, edge-line striping, a possible speed limit reduction, and a mini-roundabout near the Galloping Goose turnaround. Recommendations will feed into 2027 budget discussions.\n\nOn the Colorado Wildfire Resiliency Code, council approved second reading of the land use code amendments 6-1 (Charles Dalton dissenting), with an amendment stripping mitigation requirements for trees removed pursuant to the CWRC. A third reading is set for August 11.\n\nCouncil approved a temporary-structure permit for three patio tents at 221 South Oak Street (restaurant use), 180 days per year for three consecutive years, unanimously. A contested appeal involving a North Aspen Street property was continued to September 1 at 10 a.m., unanimously.\n\nLily Acres was appointed to a regular seat on the Ecology Commission for a two-year term, unanimously. Council reassigned board and commission liaisons to incorporate the two new members, approved unanimously.\n\nSitting as the Telluride Housing Authority, council reappointed Elena Levin as chair, Dan Enright as co-chair, and Kristen Permakoff as secretary (unanimously), and adopted a policy statement on primary residency for dependents of multiple custodial parents — setting a 20% custody threshold and covering children through age 18 — on a 4-3 vote. The wait-list suspension was extended through September 30, unanimously.\n\nSitting as Block 23 Housing Corporation, officers were retained and authorized signers updated, unanimously.",
    votes: [{"item":"CWRC land use code amendments — 2nd reading","outcome":"Passed","tally":"6-1"}, {"item":"Temp structure — 221 South Oak patio tents","outcome":"Passed","tally":"7-0"}, {"item":"Stender Residence appeal — continued to Sep 1","outcome":"Continued","tally":"7-0"}, {"item":"Appoint Lily Acres — Ecology Commission","outcome":"Passed","tally":"7-0"}, {"item":"Council board/commission appointments","outcome":"Passed","tally":"7-0"}, {"item":"THA officer certifications","outcome":"Passed","tally":"7-0"}, {"item":"THA custody/primary residency policy statement","outcome":"Passed","tally":"4-3"}],
    videoUrl: "https://www.youtube.com/watch?v=UTOwo9BuR88"
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-07-16",
    title: "Mountain Village Town Council — Jul 16, 2026",
    recap: "Council approved the second reading of an ordinance rezoning and transferring density at Lot 640A, 306 Adams Ranch Road, allowing Telluride Ski & Golf to add 15 employee apartment units to the existing Mountain View workforce housing complex. The vote was 4-2. Conditions require completion of the Class 3 design review by the DRB and approval of a minor subdivision plat. Several councilmembers had pushed for an additional condition tying approval to a formal use-and-maintenance agreement for the adjacent open-space field; that condition was not included in the motion that passed.\n\nCouncil also approved on second reading an ordinance amending the Community Development Code's lighting regulations. A last-minute amendment exempts existing wall-mounted sconces and soffit/covered-roof/under-deck fixtures from mandatory replacement, provided bulbs are 2,700 Kelvin or below; staff was directed to explore an incentive program for the 2027 budget. The vote appeared unanimous.\n\nCouncil approved a resolution correcting application types in a previously adopted Proposition 123 affordable-housing expedited-review resolution, and approved a resolution extending the Stage 2 fire restrictions. Three members were appointed to the VCA Resident Advisory Committee for two-year terms. Q2 2026 financials were approved; the town is roughly $500,000 behind in sales tax year-to-date.",
    votes: [{"item":"Rezone & density transfer — 306 Adams Ranch Rd","outcome":"Passed","tally":"4-2"}, {"item":"Lighting regulations CDC amendment — 2nd reading","outcome":"Passed","tally":""}, {"item":"ADU floor-area variance — 500 Benchmark Dr","outcome":"Passed","tally":""}, {"item":"Prop 123 expedited-review resolution correction","outcome":"Passed","tally":""}, {"item":"Stage 2 fire restrictions extension","outcome":"Passed","tally":""}, {"item":"Q2 2026 financials approval","outcome":"Passed","tally":""}, {"item":"VCA Resident Advisory Committee appointments (3)","outcome":"Passed","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/912ff751-d475-434d-ac8f-dd55087c180e"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-07-16",
    title: "Strategic Stakeholders Roundtable — Jul 16, 2026",
    recap: "San Miguel County's Strategic Stakeholders Roundtable held its sixth session focused on proposed land use code changes tied to workforce housing. The group reached informal consensus on two density questions: by-right density in both the low-density and medium-density zone districts will remain at one dwelling unit per 35 acres, with any additional density available only through affordable-housing bonuses.\n\nA side setback reduction from 12.5 to 10 feet in medium and high-density zones was approved by a show of hands with one dissent.\n\nDiscussion on high-density zones and the structure of density-bonus tiers was left unresolved; staff will develop bonus scenarios for a follow-up session scheduled for the morning of Monday, July 28. A joint planning commission and Board of County Commissioners work session is set for July 29.",
    videoUrl: "https://www.youtube.com/watch?v=T8SXtsAOB70",
    votes: []
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-07-15",
    title: "HARC — Jul 15, 2026",
    recap: "HARC held its first public hearing on the Carhenge redevelopment project at 700 West Pacific, a large mixed-use affordable housing proposal encompassing buildings A–E on town-owned land.\n\nAfter extensive presentations, public comment, and deliberations focused on mass and scale, the board voted to continue all three applications (buildings A/B/C, D1/D2, and E1/E2/E3) to the August 19, 2026 meeting, each with multiple conditions centered on significantly reducing perceived mass and scale, stepping down facades toward the river and roads, breaking up continuous roof ridges, reducing low-slope roof areas, and adding a dedicated pedestrian and bicycle bridge.\n\nThe board also continued a work session on the Shandoka Lot L redevelopment, offering preliminary design feedback with no formal action taken.",
    videoUrl: "https://www.youtube.com/watch?v=mW_65sJwquY",
    votes: [{"item":"Carhenge buildings A–E design review","outcome":"Continued","tally":""}]
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-07-02",
    title: "Design Review Board — Jul 2, 2026",
    recap: "The board approved initial architecture and site reviews for three single-family homes: a revised proposal on San Joaquin Road (Lot 164-B1R) that had withdrawn its height variance request and reduced maximum height to 39.8 ft; a new single-family detached condominium on Adams Way (Lot AR 54) on a steep, constrained lot with direct street access; and a detached condo unit (Lot 155-7) on San Joaquin Road, the last undeveloped unit in an existing condo community, with conditions including updating the condo map prior to certificate of occupancy and removal of condition requiring re-approval from the HOA.\n\nThe board voted to recommend Town Council approval of a variance allowing an existing accessory dwelling unit at 500 Benchmark Drive to remain at its current size — roughly 200 sq ft over the 1,500 sq ft ADU limit — after determining the overage appeared to be a measurement error from original construction, not a subsequent addition. The board found it unreasonable to require demolition or alteration.\n\nThe board also approved an initial architecture and site review for a new 15-unit employee apartment building at 306 Adams Ranch Road, a Telski project. Changes since the prior hearing included a revised roofline, repositioned parking to preserve open space, and added stormwater infrastructure. Conditions include updated height calculations, wetland delineation review, drainage details, and a sidewalk connection to Country Club Drive.",
    votes: [{"item":"ISR — single-family, Lot 164-B1R, San Joaquin Rd","outcome":"Passed","tally":""}, {"item":"ISR — single-family condo, Lot AR 54, Adams Way","outcome":"Passed","tally":""}, {"item":"ISR — detached condo, Lot 155-7, San Joaquin Rd","outcome":"Passed","tally":""}, {"item":"Recommend approval — ADU area variance, 500 Benchmark Dr","outcome":"Passed","tally":""}, {"item":"ISR — 15-unit employee apartments, 306 Adams Ranch Rd","outcome":"Passed","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/c4ac98cd-6cbf-4ec7-bac6-831703c2e54c"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-06-30",
    title: "Town Council — Jun 30, 2026",
    recap: "Council held two executive sessions (deputy municipal court judge personnel matter; town manager check-in). On action items, the Black Hills Energy gas franchise was renewed for 10 years (unanimous, second reading). A 50% tap-fee waiver and payment plan for the Telluride School District's employee housing project passed 5-1, with one dissent favoring a full waiver.\n\nOrdinances authorizing sale of two town-employee housing units (907 East Colorado and Longwill 16-B3) passed unanimously. An emergency Stage 2 fire-restrictions ordinance was adopted unanimously. Ronald Carlson was appointed deputy municipal court judge unanimously. A land use code amendment to implement Colorado Wildfire Resiliency Code passed unanimously on first reading. The town authorized purchase of Spruce House Unit H unanimously. Stephanie Hatcher was reappointed to CCASE unanimously. The Telluride Housing Authority appointed seven resident advisory committee members unanimously.\n\nWork sessions covered updates to the Telluride Energy Mitigation Program (TEMP) and presentation of the 2026 community survey, which showed declining confidence in local government and economic health alongside improving marks for public safety and mobility. Substantial public comment opposed converting the Town Park Oval green space to a hard-surface sports court.",
    videoUrl: "https://www.youtube.com/watch?v=I4t6u53slF8",
    votes: [{"item":"Black Hills gas franchise, 2nd reading","outcome":"Passed","tally":"Unanimous"}, {"item":"School District tap-fee waiver (50%)","outcome":"Passed","tally":"5-1"}, {"item":"Sale of two town-employee housing units","outcome":"Passed","tally":"Unanimous"}, {"item":"Stage 2 fire restrictions (emergency)","outcome":"Passed","tally":"Unanimous"}, {"item":"Wildfire Resiliency Code LUC amendment, 1st","outcome":"Passed","tally":"Unanimous"}, {"item":"Purchase of Spruce House Unit H","outcome":"Passed","tally":"Unanimous"}]
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-06-25",
    title: "Planning & Zoning — Jun 25, 2026",
    recap: "The commission continued the 238 North Pine Street minor subdivision application to its July 23 meeting without discussion.\n\nThe bulk of the meeting was a work session on the Shandoka Lot redevelopment project — a town-owned 4-acre parcel at 860 Black Bear Road proposed for a large-scale PUD that would include roughly 50–60 housing units (mostly affordable, with a limited free-market share), approximately 300 net new public parking spaces within a structured garage, neighborhood-serving commercial uses (daycare, food bank, restaurant, retail, fitness), and a transit center. No votes were taken on the project; commissioners raised extensive questions about parking demand calculations, water-table and flood-zone risks for below-grade construction, traffic impacts, green space adequacy, building massing and solar access along the river trail, and EV charging.\n\nThe commission also voted to recommend that Town Council adopt land use code amendments to Section 3-505 (tree removal/maintenance) to align with the Colorado Wildfire Resiliency Code, with several wording revisions directed by the commission; the ordinance is scheduled for council consideration June 30.",
    videoUrl: "https://www.youtube.com/watch?v=m0qjXC2TCfo",
    votes: [{"item":"Tree-removal LUC amendment (recommend)","outcome":"Passed","tally":""}]
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-06-17",
    title: "Mountain Village Town Council — Jun 17, 2026",
    recap: "The council approved two special-event liquor permits: one for the San Miguel Resource Center's Play It Forward event at the Telluride Racquet Club (June 28) and one for the Jaman Family Foundation/Telluride Reserve event (July 31). Mayor Pearson recused himself from those votes.\n\nThe council approved a license agreement with the Telluride Racquet Club for seasonal pickleball use of the town's platform paddle courts, and approved a 2026 sponsorship agreement with the Telluride Film Festival authorizing staff to negotiate a lease of the council chambers as a screening venue during Bluegrass and Film Festival season.\n\nThe council approved a resolution establishing an expedited review policy for affordable housing projects to maintain eligibility for Proposition 123 state funds — potentially unlocking up to $45,000 for the Ilium workforce housing project if adopted before July. The council also authorized the interim town manager to execute a Trout Lake water augmentation lease (~$3,000/year) to secure legal water rights for the Ilium development. Two agenda items — a lighting code amendment and a separate item — were continued to the July 16 meeting.\n\nA work session covered findings of an independent investigation into actions by the former mayor and town manager, with the investigator stating unequivocally that no ethics-code violations, corruption, embezzlement, or personal gain were found, and that the full council had no knowledge of or involvement in the events. A second work session segment reviewed draft recommendations for strengthening the ethics code and procurement procedures; no votes were taken, with council directing staff to return revised language emphasizing clear, fact-based conflict standards over subjective \"appearance\" tests.",
    votes: [{"item":"Special event permit — San Miguel Resource Center","outcome":"Passed","tally":""}, {"item":"Special event permit — Jaman Family Foundation/Telluride Reserve","outcome":"Passed","tally":""}, {"item":"License agreement — Telluride Racquet Club pickleball","outcome":"Passed","tally":""}, {"item":"Sponsorship/lease agreement — Telluride Film Festival","outcome":"Passed","tally":""}, {"item":"Resolution — Prop 123 expedited affordable housing review","outcome":"Passed","tally":""}, {"item":"Trout Lake water augmentation lease — Ilium project","outcome":"Passed","tally":""}, {"item":"Lighting code amendment — continued to Jul 16","outcome":"Continued","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/978b9375-97e0-4500-82ac-b73e839a14a6"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-06-17",
    title: "HARC — Jun 17, 2026",
    recap: "For 208 South Fir, a large commercial new-construction project in the warehouse district, HARC granted preliminary approval (4-1) with conditions addressing roof material, building height and depth, wall-plane articulation along the alley, an arborist report, parking payment-in-lieu, and building materials.",
    videoUrl: "https://www.youtube.com/watch?v=3naByhxnyjE",
    votes: [{"item":"208 S Fir commercial — preliminary approval","outcome":"Passed","tally":"4-1"}]
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2026-06-11",
    title: "SMART Board of Directors — Jun 11, 2026",
    recap: "The SMART Board held its June 2026 regular meeting virtually, approving its agenda and prior meeting minutes and renewing a lease with the Telluride Gymnastics Academy at 137 Society Drive. Board members discussed the implications of the lease renewal for SMART's longer-term plans for the building, though no objections were raised. The board also heard an informational report from Director Ashley Story Von Spreecken on a trip to view Leitner Poma of America gondola installations in Europe, covering technology, station design, and operations.\n\nStaff provided several updates: Gondola Project Manager Amber Blake reported on Buy America requirements, website updates, and procurement for a Gondola Structural Assessment. Transit Director Kari Distefano presented the deferred First Quarter 2026 Performance Report—covering ridership trends, cost per rider, and other metrics—as well as the June Operations Report, which addressed NTD reporting, bad-weather policy development, and SMART's carbon emissions footprint. Executive Director David Averill updated the board on the Lawson Intercept Lot enforcement strategy, grant activities, and a potential CDOT site visit later in 2026.",
    votes: [{"item":"Resolution 2026-10 — Renewal of Lease with Telluride Gymnastics Academy","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-meeting-packet_July-23rd-2026.pdf#minutes-2026-06-11",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-meeting-packet_July-23rd-2026.pdf"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-06-09",
    title: "Town Council — Jun 9, 2026",
    videoUrl: "https://www.youtube.com/watch?v=vxrKceCqXaM",
    recap: "A housing-heavy June meeting. Council gave first-reading approval to selling two more deed-restricted units (907 East Colorado and Longwell 16), accepted the 2025 audit, and approved a first reading of the Black Hills gas franchise.\n\nThe fire-restriction ordinance passed on second reading. Three residents were reappointed to commissions and the airport board.\n\nThe one split vote was a partial waiver of school-district tap fees for teacher housing, which passed 4-2 with Stark and Enright opposed.",
    votes: [{"item":"Sale of two deed-restricted units, 1st","outcome":"Passed","tally":""}, {"item":"2025 audit accepted","outcome":"Passed","tally":""}, {"item":"Black Hills gas franchise, 1st reading","outcome":"Passed","tally":""}, {"item":"Fire-restriction ordinance, 2nd reading","outcome":"Passed","tally":""}, {"item":"School tap-fee partial waiver","outcome":"Passed","tally":"4-2"}]
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-06-04",
    title: "Design Review Board — Jun 4, 2026",
    recap: "The board reviewed an initial architecture and site review and an associated height variance request for a proposed single-family home on a steep lot on San Joaquin Road. After extensive discussion — centering on whether topographic hardship justified the variance, the extent of general easement encroachments, lighting levels, and uncertainty about the precise height ask — the board voted unanimously to continue both the height variance recommendation to Town Council and the initial site review to the July 2 DRB meeting.\n\nThe board also took up the initial architecture and site review for a second single-family home on an adjacent steep San Joaquin Road lot. Staff noted height-calculation discrepancies that the applicant addressed during the meeting. The board voted unanimously to approve the initial site review with the conditions, design variations, and specific approvals listed in the staff report.\n\nThe board considered an initial architecture and site review for Little Rose (Lot 27A, Moss Creek Lane), a proposed 19-unit plus 2 employee-unit multi-family condominium building in the village center. Key issues included general easement encroachments, a stone-percentage design variation, alternative drop-off/loading at Blue Mesa, large glazing spans, and concerns raised by the Belvedere Phase 1 owners association about access and construction impacts. A motion to continue to August 6 failed 3–3. A subsequent motion to approve the initial site review passed 4–2.",
    votes: [{"item":"Height variance & site review — San Joaquin Rd lot 164-BR1","outcome":"Continued","tally":"6-0"}, {"item":"Initial site review — San Joaquin Rd Lot 1171-R","outcome":"Passed","tally":"6-0"}, {"item":"Continue Little Rose (Lot 27A) to August 6","outcome":"Failed","tally":"3-3"}, {"item":"Initial site review — Little Rose multi-family, Lot 27A","outcome":"Passed","tally":"4-2"}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/e65c2506-fb20-4941-8c8b-1dc6c371a5e0"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-06-03",
    title: "Board of County Commissioners — Jun 3, 2026",
    videoUrl: "https://www.youtube.com/watch?v=3nSAqRc0Cpk",
    recap: "A land-and-housing day for the BOCC. They approved an additional $100,000 to the Telluride Foundation's Housing Opportunity Fund and renamed their new fast-track development rule from 'Accelerated' to 'Prioritized' Housing Review.\n\nA bouldering gym in Illium received a PUD amendment, accessory-dwelling-unit sizing was clarified, and new on-site wastewater regulations were adopted. All votes passed 3-0.",
    votes: [{"item":"Housing Opportunity Fund +$100,000","outcome":"Passed","tally":"3-0"}, {"item":"Illium bouldering gym PUD amendment","outcome":"Passed","tally":"3-0"}, {"item":"ADU sizing clarification","outcome":"Passed","tally":"3-0"}, {"item":"On-site wastewater regulations","outcome":"Passed","tally":"3-0"}]
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-05-28",
    title: "Planning & Zoning Commission — May 28, 2026",
    recap: "The commission took action on two public hearing items and one work session. On the minor subdivision application for 238 North Pine Street — which would split a 7,500-square-foot corner lot into two 25-foot lots — the commission voted unanimously to continue the hearing to June 25, directing staff to analyze grounds for a potential denial motion and to examine setback and height implications.\n\nOn the Carhenge lot conceptual PUD (700 West Pacific Avenue, proposing roughly 220–230 affordable units with height and site-coverage variations), the commission voted unanimously to continue to July 23, directing the applicant to consider reductions in height, maximum floor area, and site coverage, and to provide preliminary flood-plain and traffic studies.\n\nThe Shandoka lot work session was continued without discussion to June 25.",
    videoUrl: "https://www.youtube.com/watch?v=ies_4xRTogs",
    votes: [{"item":"238 N Pine minor subdivision","outcome":"Continued","tally":"Unanimous"}, {"item":"Carhenge conceptual PUD","outcome":"Continued","tally":"Unanimous"}]
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-05-27",
    title: "Board of County Commissioners — May 27, 2026",
    videoUrl: "https://www.youtube.com/watch?v=CkFxc1DpoNM",
    recap: "The commissioners approved two Ophir septic setback variances, released a 2024 deed-restriction settlement on a Lawson Hill lot, and accepted a state (DOLA) housing-planning grant. All votes were unanimous.\n\nAn earlier Placerville session that day was a work session with no votes.",
    votes: [{"item":"Two Ophir septic setback variances","outcome":"Passed","tally":"Unanimous"}, {"item":"Lawson Hill deed-restriction settlement","outcome":"Passed","tally":"Unanimous"}, {"item":"DOLA housing-planning grant","outcome":"Passed","tally":"Unanimous"}]
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-05-21",
    title: "Mountain Village Town Council — May 21, 2026",
    recap: "Council approved a license agreement allowing the Town of Norwood to use Mountain Village property for a relocated disc golf course (Norwood's current course sits on the future school site). After discussion about termination flexibility and neighbor concerns, the agreement passed unanimously.\n\nCouncil approved applying for a Clean Transit Enterprise (SB 230) formula grant to fund operations and purchase two battery-electric buses for the Meadows Express route, with the budget request scaled up 5% annually. Staff noted the buses would run summers only, mitigating cold-weather battery concerns.\n\nA supplemental appropriation resolution passed, adjusting the 2026 budget by roughly $1.5 million above the original deficit. Major items: $350,000 for the ongoing investigation, $330,000 in additional Heritage boiler costs, $132,000 for a regional marketing recovery program, and water-system work at Ski Ranches. Council discussed but did not direct any offsetting cuts, choosing to monitor summer revenue before acting.\n\nOn the Mountain View Apartments rezone and density transfer (Lot 640A, 306 Adams Ranch Road), council gave first-reading approval 4-1 to add 15 employee-housing units, but conditioned the approval on DRB design approval, subdivision approval, and — critically — a landscaping plan that council itself must approve, preserving adequate green space and screening the building from Adams Ranch Road. Second reading is set for July 16. The sole dissenting vote cited concerns about building siting and impact on the open-space field.\n\nCouncil also adopted Vision Zero as town policy and adopted the Telluride–Mountain Village Transportation Safety Action Plan — both required to apply for an SS4A federal safety implementation grant due the following week. A special event liquor permit for two Telluride Food and Vine events (June 12–13, Conference Center Plaza) passed unanimously. An ordinance amending building-regulations code language passed on second reading. Mountain Munchkins moved to a full-time (5-day) model starting September 2026, with revised late-pickup and sign-in/sign-out fees approved. A conditional use permit for a padel court at 112 Autumn Lane and a road right-of-way encroachment agreement and earthwork easement vacation for separate properties also passed.",
    votes: [{"item":"Mental Health Awareness Month proclamation","outcome":"Passed","tally":""}, {"item":"Consent agenda items A and D (minutes; housing mitigation amendment)","outcome":"Passed","tally":""}, {"item":"License agreement with Norwood for disc golf course","outcome":"Passed","tally":""}, {"item":"Clean Transit SB 230 grant application — 2 electric buses","outcome":"Passed","tally":""}, {"item":"Special event liquor permit — Telluride Food and Vine","outcome":"Passed","tally":""}, {"item":"Supplemental 2026 budget appropriations resolution","outcome":"Passed","tally":""}, {"item":"Q1 2026 financial statements approval","outcome":"Passed","tally":""}, {"item":"Mountain Munchkins 2026 fee schedule resolution","outcome":"Passed","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/ea492304-65f7-4939-95b1-9e9a73fddfbf"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-05-20",
    title: "Board of County Commissioners — May 20, 2026",
    videoUrl: "https://www.youtube.com/watch?v=xDE7B7x2C5U",
    recap: "The commissioners approved the consent agenda and appointed two residents to community boards — Jackie Kenik to the Lone Tree Cemetery board and Marcus Kirkwood to the San Miguel Basin Fairboard. They updated the County's drug-and-alcohol policy and approved a conduit-and-fiber exchange with Clear Networks.\n\nTwo land-use hearings followed: a lot-line vacation near Sawpit and a multi-year logging and wildfire-mitigation permit on Wilson Mesa.\n\nThey also adopted the state's septic Regulation 43 Appendix A, keeping variance authority at the county level. All votes were 3-0.",
    votes: [{"item":"Two community-board appointments","outcome":"Passed","tally":"3-0"}, {"item":"Drug-and-alcohol policy update","outcome":"Passed","tally":"3-0"}, {"item":"Clear Networks conduit-fiber exchange","outcome":"Passed","tally":"3-0"}, {"item":"Sawpit lot-line vacation","outcome":"Passed","tally":"3-0"}, {"item":"Wilson Mesa logging & mitigation permit","outcome":"Passed","tally":"3-0"}, {"item":"Septic Regulation 43 Appendix A","outcome":"Passed","tally":"3-0"}]
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-05-19",
    title: "Town Council — May 19, 2026",
    videoUrl: "https://www.youtube.com/watch?v=U3QyzfSWDlE",
    recap: "Council adopted the federal Safe Streets and Roads for All regional transportation safety plan and a Vision Zero resolution targeting no traffic deaths by 2040.\n\nThey authorized acquisition of a town employee unit at Mandota, approved a first reading of new fire-restriction rules, and reappointed Carly Shaw to the Election Commission.\n\nThey also granted a seasonal rooftop shade structure for the National building on Colorado Avenue, with conditions. All votes were 6-0.",
    votes: [{"item":"Safe Streets plan + Vision Zero resolution","outcome":"Passed","tally":"6-0"}, {"item":"Mandota employee-unit acquisition","outcome":"Passed","tally":"6-0"}, {"item":"Fire-restriction rules, 1st reading","outcome":"Passed","tally":"6-0"}, {"item":"National building rooftop shade structure","outcome":"Passed","tally":"6-0"}]
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-05-14",
    title: "Planning Commission — May 14, 2026",
    videoUrl: "https://www.youtube.com/watch?v=R9nnXLvOGCY",
    recap: "The two contested public hearings — the Garlock and Crockett applications on the Mesas — were tabled and withdrawn.\n\nThe Commission recommended approval of a PUD amendment for a climbing gym in the former Illium tire shop and a code amendment defining 'footprint' and clarifying ADU maximum size.\n\nIt also recommended adopting an accelerated review process for affordable housing to keep San Miguel eligible for Prop 123 funding. All recommendations go to the BOCC.",
    votes: [{"item":"Illium climbing-gym PUD amendment (rec.)","outcome":"Passed","tally":""}, {"item":"Footprint / ADU-size code amendment (rec.)","outcome":"Passed","tally":""}, {"item":"Accelerated affordable-housing review (rec.)","outcome":"Passed","tally":""}]
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2026-05-14",
    title: "SMART Board of Directors — May 14, 2026",
    recap: "At the May 14, 2026 regular meeting, the SMART Board handled two formal votes. First, the Board approved the meeting agenda and the minutes from the March 12, 2026 meeting. Second, the Board appointed Director Marya Stark to the SMART Investment Committee, with Executive Director Averill providing background on why her appointment was needed.\n\nThe Board received a gondola project update covering Build/Buy America strategy, structural analysis, Capital Investments Grant (CIG) Program preparation, and an economic benefits white paper in progress. Due to time constraints, the 1st Quarter 2026 Performance Report and the May 2026 Operations Report were both deferred to the June meeting. Averill also reported on current finances, year-to-date revenues and expenses, fund balances, grant activity, and the status of an Investment Services RFP. The Board then convened a brief executive session regarding the Masson vs. San Miguel County BOCC litigation, after which no action was taken.",
    votes: [{"item":"Resolution 2026-8 — Appointment of Marya Stark to the SMART Investment Committee","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-Meeting-Packet_June-11th-2026.pdf#minutes-2026-05-14",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-Meeting-Packet_June-11th-2026.pdf"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-05-13",
    title: "Board of County Commissioners — May 13, 2026",
    videoUrl: "https://www.youtube.com/watch?v=Q6xLvyjwDgs",
    recap: "A special session focused on presentations and public comment. The board heard from a Rights Mesa resident about an HOA and code-enforcement dispute, reviewed the parks and open space work plan, and discussed housing funding with the Telluride Association of Realtors, including a proposed state vacancy tax that failed at the Legislature.\n\nThe formal votes were unanimous: green grants, a letter of support for a street-safety grant, and gift cards for spring-cleanup volunteers.",
    votes: [{"item":"Green grants","outcome":"Passed","tally":"Unanimous"}, {"item":"Street-safety grant support letter","outcome":"Passed","tally":"Unanimous"}]
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-05-07",
    title: "Design Review Board — May 7, 2026",
    recap: "The board seated five members and one alternate, administered oaths of office, and elected Banks Brown as chair and Scott Bennett as vice chair for the coming term.\n\nThe board voted to recommend approval to Town Council of a rezone and density transfer for Lot 640A, 306 Adams Ranch Road — the Mountain View Apartments site — to allow 15 additional employee-housing units, bringing the total to 45. One member voted against, citing concern over reducing the open park space. Two regular members were absent; both alternates voted.\n\nOn the concurrent initial architectural and site review for the proposed 50-unit, roughly 11,000-square-foot multi-family building at the same site, the board continued the application to the July meeting. Key concerns raised: massing along the Adams Ranch Road façade, unresolved drainage in the interior courtyard, access to the adjacent open-space parcel, and landscaping/fire-mitigation details.",
    votes: [{"item":"Oath of office / election of chair & vice chair","outcome":"Passed","tally":""}, {"item":"Rezone & density transfer — 306 Adams Ranch Rd","outcome":"Passed","tally":""}, {"item":"Initial design review — 306 Adams Ranch Rd (50-unit)","outcome":"Continued","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/8bd3a237-8440-4e98-88f1-8c796ab7860f"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-04-28",
    title: "Town Council — Apr 28, 2026",
    videoUrl: "https://www.youtube.com/watch?v=vWaP0Ba4GYY",
    recap: "A housing-focused meeting. The Stender HARC appeal was continued at the appellant's request.\n\nCouncil reappointed Peter Sante to the Planning & Zoning Commission and adopted second readings authorizing the sale of two deed-restricted units — the Element 52 unit on South Davis and the Silverjack unit on West Pacific — to lottery winners.\n\nSitting as the Housing Authority, they adopted a policy temporarily suspending certain waitlist rules, with a set sunset date, to reduce vacancies.",
    votes: [{"item":"Sale of Element 52 + Silverjack units, 2nd","outcome":"Passed","tally":""}, {"item":"Waitlist-rule suspension (with sunset)","outcome":"Passed","tally":""}, {"item":"Stender HARC appeal","outcome":"Continued","tally":""}]
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-04-23",
    title: "Mountain Village Town Council — Apr 23, 2026",
    recap: "Council made several board appointments: Luke Trujillo to the Building Board of Appeals, Alison Wright as the at-large member of the Plaza Vending Committee, and Banks Brown, Adam Miller, Scott Bennett, and David Eckman to regular seats on the Design Review Board. Jim Austin was reappointed to a DRB alternate seat, and Tobin Brown was appointed to fill the remaining alternate term vacated by Eckman's upgrade.\n\nOn second reading, council adopted an ordinance incorporating the state-mandated Colorado Wildfire Resiliency Code into the Community Development Code. The adopted version includes locally added thresholds requiring cedar shake roof replacement for single-family remodels valued between $1M–$2M, and full home-hardening compliance for alterations above $2M, effective July 1, 2026. Council also passed second readings of an ordinance creating a background-check process for massage facility operators and an ordinance adjusting municipal penalties to conform with a Colorado Supreme Court ruling. A first reading was approved for a technical cleanup ordinance correcting internal code references.\n\nCouncil passed an emergency ordinance on water conservation, delegating authority to the public works director to impose irrigation restrictions during drought conditions and providing penalties for violations, effective immediately. Forestry director Rodney presented a detailed report on 2025 wildfire mitigation work, including 38 hazard-tree projects, roughly 139,000 cubic feet of woody fuel removed, and 485 burn piles completed this winter.\n\nThe lighting regulations ordinance (CDC amendments to Section 17.5.12) passed first reading with direction to staff to return at the May 21 second reading with modifications addressing motion-sensor lighting near home approaches, soffit lighting on existing structures, and a compliance process and potential incentive program for existing homeowners. A padel court conditional use permit was continued to May 21. Separately, the mayor reported the independent investigation into the former mayor's resignation has now included 21 interviews and a public report is expected within two to four weeks.",
    votes: [{"item":"Appoint Luke Trujillo — Building Board of Appeals","outcome":"Passed","tally":""}, {"item":"Appoint Alison Wright — Plaza Vending Committee at-large","outcome":"Passed","tally":""}, {"item":"Appoint Banks Brown, Adam Miller, Scott Bennett, David Eckman — DRB regular seats; Jim Austin — DRB alternate","outcome":"Passed","tally":""}, {"item":"Appoint Tobin Brown — DRB alternate (Eckman vacancy)","outcome":"Passed","tally":""}, {"item":"Colorado Wildfire Resiliency Code — CDC amendment (2nd reading)","outcome":"Passed","tally":""}, {"item":"Background check process — massage facilities (2nd reading)","outcome":"Passed","tally":""}, {"item":"Penalty adjustments ordinance (2nd reading)","outcome":"Passed","tally":""}, {"item":"Building regulations technical cleanup ordinance (1st reading)","outcome":"Passed","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/e1110b6e-5f94-4546-b46b-6d22d03f2f3e"
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-04-02",
    title: "Design Review Board — Apr 2, 2026",
    recap: "The board recommended that Town Council adopt an ordinance amending Chapter 17.7 of the Mountain Village Community Development Code to correct clerical errors — mismatched code-version citations and vague amendment language — left over from last spring's international building code adoption. No substantive policy changes were involved.\n\nThe board approved a final architecture review for a new ADU and accessory Padel court complex at Lot 382R, along with a conditional use permit recommendation to Town Council for the Padel court itself. An acoustic study submitted since the January hearing found the court quieter than a pickleball court. Approval came with conditions including a required fire-mitigation plan update, replacement of one non-compliant light fixture, and a reservation of the town's right to impose additional mitigation — with any future revocation requiring a new public hearing process. Both votes were unanimous.\n\nThe board also approved a specific approval for a general-easement encroachment at Lot 360, 101 Snowfield Drive, allowing underground soil nails and micro-piles needed to shore a foundation on a constrained lot. The approval is contingent on Town Council also approving the associated right-of-way encroachment and on the applicant providing section drawings showing soil-nail depths relative to the road and utilities.\n\nOn board membership, the DRB voted to recommend that Town Council reappoint Banks Brown, Adam Miller, David Eckman, and Scott Bennett to regular seats and Jim Austin and Tobin Brown to alternate seats.",
    votes: [{"item":"CDC 17.7 clerical cleanup — recommend adoption","outcome":"Passed","tally":""}, {"item":"Conditional use permit — Padel court, Lot 382R","outcome":"Passed","tally":""}, {"item":"Final architecture review — Lot 382R addition/ADU/Padel","outcome":"Passed","tally":""}, {"item":"GE encroachment — Lot 360, 101 Snowfield Dr","outcome":"Passed","tally":""}, {"item":"DRB membership recommendation to Town Council","outcome":"Passed","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/3a0cfc44-92da-4f39-9281-58a16e13f84c"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2026-03-12",
    title: "SMART Board of Directors — Mar 12, 2026",
    recap: "At the March 12, 2026 regular meeting, the SMART Board addressed several operational and governance matters. The board approved the January 8, 2026 meeting minutes (with Marya Stark recused), adopted an intergovernmental agreement with the Town of Mountain Village to pass through 2A lift tax revenue to SMART, and elected a new Vice-Chair to fill a board vacancy. The board also discussed enforcement at the Lawson Hill Intercept Lot, agreeing on a staged approach beginning with tickets from the San Miguel County Sheriff's Office and escalating to towing; staff was directed to develop a formal plan and timeline.\n\nOn longer-range planning, the board discussed scoping a Regional Transportation Plan but decided to defer a broad regional visioning effort by one to two years so it can align with the next 5-Year Strategic Operating Plan cycle. In the near term, staff was directed to explore a collaborative, facility-specific planning effort focused on sites such as the Spur. The board also received the Q4 2025/Annual Performance Report covering ridership and cost-per-passenger metrics, heard the March 2026 Operations Report, and received an Executive Director update on grants and retreat follow-up items. The meeting concluded with a closed executive session regarding Masson vs. San Miguel County BOCC, with no action taken.",
    votes: [{"item":"Resolution 2026-5 — Intergovernmental Agreement with Town of Mountain Village for 2A Tax Revenue Pass-Through","outcome":"Passed","tally":"6-0"}, {"item":"Resolution 2026-6 — SMART Board of Directors Vice-Chair Election","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Meeting%20Packet%20May%2014th%202026.pdf#minutes-2026-03-12",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Meeting%20Packet%20May%2014th%202026.pdf"
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-03-05",
    title: "Design Review Board — Mar 5, 2026",
    recap: "The board approved four individual-property applications and advanced a town-wide code amendment.\n\nOn the CDC amendment front, the board voted unanimously to recommend town council adopt proposed ordinance language updating Community Development Code Section 17.5.6 (building design/exterior materials) and adding Section 17.7.22 to bring Mountain Village into compliance with the Colorado Wildfire Resiliency Code, effective July 1, 2026. The amendment adds descriptive criteria for synthetic and non-combustible materials reviewed under specific approval, while maintaining that specific-approval requirement rather than making such materials by right.\n\nA final architecture application for a single-family detached condominium at Lot 165, Unit 3 on Cortina Drive passed 4–3, with three members dissenting on grounds that the construction mitigation plan — particularly slope remediation and soil nailing questions tied to adjacent Lot 4 — was unresolved. The approval was conditioned on a development agreement and a complete, approvable construction mitigation plan being finalized before any building permit is issued.",
    votes: [{"item":"Initial arch/site review — Lot 224B Snowdrift Ln (SFH)","outcome":"Passed","tally":""}, {"item":"Initial arch/site review — Lot 355, 129 Rocky Rd (ADU)","outcome":"Passed","tally":""}, {"item":"Final arch review — Lot 533 Russell Drive (SFH)","outcome":"Passed","tally":""}, {"item":"Final arch review — Lot 628H Double Eagle Way (SFH)","outcome":"Passed","tally":""}, {"item":"Final arch review — Lot 165 Unit 3 Cortina Dr (condo)","outcome":"Passed","tally":"4-3"}, {"item":"Specific approval — re-roof 581 Mountain Village Blvd","outcome":"Passed","tally":""}, {"item":"Recommend CDC amendment for CWRC compliance","outcome":"Passed","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/7a3320c7-90aa-4bdc-89e0-fddf0120d4a5"
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-02-19",
    title: "Mountain Village Town Council — Feb 19, 2026",
    recap: "Council approved a license agreement with Telluride Ski and Golf to place lift-ticket kiosks on town property, with amendments requiring a periodic review mechanism, restoration to original condition at lease end, and a typo correction.\n\nTwo ordinances passed on second reading: one repealing remaining COVID-19 emergency ordinances and resolutions, and one prohibiting greywater use and installation of greywater treatment works within town boundaries, maintaining the status quo while staff works through water-rights and plumbing code questions.\n\nA conditional-use permit for a paddle court was continued to April 23. A first reading on lighting-regulation amendments (CDC 17.5.12) was also continued to April 23 after extensive discussion about seasonal lighting windows, compliance timelines, enforcement, and dark-sky goals. The Colorado Wildfire Resiliency Code amendment was presented as a work session; a full ordinance will return next meeting.\n\nCouncil voted 5-1 to adopt the Mountain Village Community Resilience Advisory Plan as an advisory document. Council approved the purchase of five acres from Alexander Ranch LLP and approved a related declaration of restrictive covenant; closing is set for February 27. A density-transfer/rezone work session for Lot 152R was continued to March 19. Council ratified the contract with Wheeler Trigg O'Donnell to conduct an internal investigation, capped at $350,000. Dan Jansen was appointed by paper-ballot straw poll and voice vote to fill the vacant council seat and was sworn in at the meeting.",
    votes: [{"item":"Consent agenda items A–F","outcome":"Passed","tally":""}, {"item":"License agreement with TSG for lift kiosks (item G)","outcome":"Passed","tally":""}, {"item":"Ordinance repealing COVID-19 ordinances, 2nd reading","outcome":"Passed","tally":""}, {"item":"Ordinance prohibiting greywater use, 2nd reading","outcome":"Passed","tally":""}, {"item":"Continue CUP for paddle court to Apr 23","outcome":"Passed","tally":""}, {"item":"Continue lighting code amendment (1st reading) to Apr 23","outcome":"Passed","tally":""}, {"item":"Table MV Housing Authority guidelines","outcome":"Tabled","tally":""}, {"item":"Purchase 5 acres from Alexander Ranch LLP","outcome":"Passed","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/c43cb56c-8567-4d3d-8585-990fa5b27e4a"
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-02-05",
    title: "Design Review Board — Feb 5, 2026",
    recap: "The board approved final architectural review for a new single-family home at Lot 629 Double Eagle Drive, continued from January. The applicant had significantly reduced the lighting plan — from 77 fixtures down to 34 — and addressed prior board concerns about chimney size, driveway backout space, and landscaping.\n\nFinal review for Lot 533 Russell Drive was continued to the March 5 meeting. The board cited an incomplete lighting plan (including a non-compliant fixture), unresolved landscaping and fire-mitigation concerns, and a missing materials board.\n\nInitial review for Lot 523R Russell Drive was approved with conditions. The board directed the applicant to relocate a proposed sauna out of the general easement. Members raised questions about standing-seam metal as a siding material and asked for more specification detail before final review.\n\nInitial review for an accessory dwelling unit at Lot 17, 102 Yellow Brick Road — a compact, non-combustible cabin connected to the main house by a 63-foot metal footbridge — was approved with conditions, including an updated construction-mitigation plan.\n\nA specific approval for a general-easement encroachment at Lot 154, 111 San Joaquin Drive — retaining walls and irrigation lines for a landscaped garden area — was approved.\n\nThe board held a work session on the Colorado Wildfire Resiliency Code, which must be adopted by July 1. Staff recommended adopting Chapters 1–4 largely as written and skipping Chapter 5, since the town's existing defensible-space code already meets or exceeds state requirements. No vote was taken; staff will return next month with a draft amendment.\n\nThe board also held a work session on a potential density transfer and rezone at Lot 152R, Country Club Drive — a request to increase an approved 8-condominium project to 14 units, with underground parking reducing curb cuts from 11 to 3. No vote was taken. Members expressed general openness to the density increase but called for greater building articulation, separation between structures, and reduced massing before a formal application.\n\nFinally, the board voted to recommend Town Council approval of amendments to CDC Section 17.5.12 governing lighting regulations, with one amendment: replacing a generic flag reference with a citation to the U.S. Flag Code.",
    votes: [{"item":"Final arch. review — Lot 629 Double Eagle Dr.","outcome":"Passed","tally":""}, {"item":"Final arch. review — Lot 533 Russell Dr.","outcome":"Continued","tally":""}, {"item":"Initial arch. review — Lot 523R Russell Dr.","outcome":"Passed","tally":""}, {"item":"Initial arch. review — ADU, Lot 17, 102 Yellow Brick Rd.","outcome":"Passed","tally":""}, {"item":"GE encroachment — Lot 154, 111 San Joaquin Dr.","outcome":"Passed","tally":""}, {"item":"CDC amendment — lighting regs §17.5.12","outcome":"Passed","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/601aedd6-f28c-41e1-a8e5-af4c2723c0e0"
  },
  {
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-01-28",
    title: "Mountain Village Town Council — Jan 28, 2026",
    recap: "The council's main business was filling two vacancies left by Mayor Prohaska's resignation. Town attorney Hayley Carmer walked through the Home Rule Charter provisions requiring the seats be filled by council majority vote within 30 days. Scott Pearson was unanimously appointed mayor and Tucker Maggot was unanimously appointed mayor pro tem; both took their oaths of office. Applications for the vacant council seat are open through February 11.\n\nStaff presented an economic recovery update. December sales tax came in roughly 35.6% below the prior year, with in-town retailers down about 46%. Gondola ridership for January is down 27% year-over-year, though the gap has narrowed week by week since the resort reopened. A $100,000 business assistance grant program is being drafted in coordination with TMVOA, which has not yet committed matching funds.\n\nOn the ongoing investigation into recent town management events, the new mayor reported that the town's attorneys are compiling a list of outside law firms to hire. A firm could be selected by end of the following week, with a hoped-for four-week investigation timeline. The council noted the investigation cannot compel outside parties to cooperate. The meeting closed with a move into executive session on Colorado Open Records Act matters.",
    votes: [{"item":"Appoint Scott Pearson as mayor","outcome":"Passed","tally":""}, {"item":"Appoint Tucker Maggot as mayor pro tem","outcome":"Passed","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/66650890-1548-4443-97e0-9ec4f350fd9d"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2026-01-08",
    title: "SMART Board of Directors — Jan 8, 2026",
    recap: "At its January 8, 2026 regular meeting, the SMART Board of Directors handled several organizational and policy matters. After receiving public comment from six members of the public and holding a closed executive session regarding the Masson vs. San Miguel County BOCC litigation (with no action taken), the Board approved the meeting agenda, amended December 2025 minutes, and adopted a new SMART Investment Policy (Resolution 2026-2) with five votes in favor and one abstention from Rico representative Gregg Anderson.\n\nThe Board also elected Gregg Anderson as SMART Board Secretary and appointed Anderson and Ashley Story Von Sprecken to the newly established Investment Committee. Directors discussed how SMART might respond to ongoing regional economic uncertainty tied to a potential extended ski area closure. Staff presented the January 2026 Operations Report, highlighting parking at the Lawson Hill Intercept lot and ridership trends. Executive Director David Averill announced the hiring of TJ Burr as a new SMART staff member.",
    votes: [{"item":"Resolution 2026-2 — Adoption of the SMART Investment Policy","outcome":"Passed","tally":"5-0"}, {"item":"Resolution 2026-3 — Board Secretary Election and Investment Committee Appointments","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_March%2012th%202026.pdf#minutes-2026-01-08",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_March%2012th%202026.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2025-12-09",
    title: "SMART Board of Directors — Dec 9, 2025",
    recap: "At its December 9, 2025 regular meeting, the SMART Board of Directors took action on several key year-end items. The Board certified the FY26 mill levy at an effective rate of 1.989 mills, reflecting a temporary credit of 0.097 mills required by the state-mandated cap on property tax revenue growth. The Board also unanimously adopted the FY26 budget and capital plan, which had been developed over the preceding four months and includes pending capital projects. Additionally, the Board approved the 2026 regular meeting schedule, adjusting the December 2026 meeting to a 10:00 a.m. start time.\n\nThe Board discussed but did not vote on the proposed SMART Investment Policy, directing staff to return with a revised version in January 2026 that clarifies the Investment Committee's directive role over the Executive Director's investment decisions, transitions committee membership to at-large Board appointments rather than officer positions, and removes a voting role from the portfolio manager. Staff also reported on operations at the Society Drive properties, ridership trends, and parking at the Lawson Hill Intercept lot. The meeting concluded with a closed executive session for the Executive Director's performance review, after which no action was taken.",
    votes: [{"item":"Resolution 2025-22 — FY26 Mill Levy Certification","outcome":"Passed","tally":""}, {"item":"Resolution 2025-23 — FY26 Budget and Capital Plan Adoption and Appropriations Certification","outcome":"Passed","tally":""}, {"item":"Resolution 2025-24 — 2026 Regular Board Meeting Date Schedule","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_January%208th%202026.pdf#minutes-2025-12-09",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_January%208th%202026.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2025-11-13",
    title: "SMART Board of Directors — Nov 13, 2025",
    recap: "At its November 13, 2025 regular meeting, the SMART Board of Directors approved two resolutions. The board unanimously adopted Resolution 2025-19 to approve the meeting agenda and the September 11, 2025 minutes. It then unanimously adopted Resolution 2025-20, authorizing the FY25 Gondola Project Development Intergovernmental Agreement. Staff presented details on the IGA budget and how it connects to the 2026 workplan; board members emphasized the need for transparency and increasing detail as the gondola project budget grows over time.\n\nThe board also held a substantive discussion on the FY26 budget and capital plan. The key remaining question was the mill levy rate, and the board opted for the scenario incorporating the state-mandated 5.25% revenue growth cap, directing staff to bring a final recommended budget to the December meeting for adoption. Staff also presented the 3rd Quarter 2025 Performance Report covering ridership trends and costs, and the Executive Director provided updates on hiring for a Business and Communications Manager, PlacerAI data tools, and pending grant applications. Commissioner Gleason raised the topic of workforce housing impacts from major construction projects on west end communities and SMART's potential role in addressing them.",
    votes: [{"item":"Resolution 2025-20 — FY25 Gondola Project Development IGA","outcome":"Passed","tally":"5-0"}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Meeting%20Packet_December%209th%202025.pdf#minutes-2025-11-13",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Meeting%20Packet_December%209th%202025.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2025-09-11",
    title: "SMART Board of Directors — Sep 11, 2025",
    recap: "At its September 11, 2025 regular meeting, the SMART Board of Directors took action on four resolutions. The board unanimously adopted the FY25 Budget Amendment (Resolution 2025-16), formalizing adjustments to the current fiscal year budget after discussions held over the August and September meetings. The board also unanimously accepted the FY24 Audit Report (Resolution 2025-17), which included a review of the Single Audit process, and updated its Public Comment Policy (Resolution 2025-18) to give the Board Chair discretion to extend individual speaking time when the situation calls for it.\n\nThe board also held a preliminary discussion on the FY26 budget, reviewing forecasted revenues, anticipated costs, and proposed special projects. A key topic was the mill levy rate for FY26; the board concluded it needs additional information from the Department of Revenue and wants to see what other special districts are doing before making a decision. Staff also presented the September 2025 Operations Report, which prompted brief discussion before the meeting adjourned.",
    votes: [{"item":"Resolution 2025-16 — FY25 Budget Amendment Adoption","outcome":"Passed","tally":"5-0"}, {"item":"Resolution 2025-17 — FY24 Audit Report and Acceptance","outcome":"Passed","tally":"5-0"}, {"item":"Resolution 2025-18 — Public Comment Policy modification","outcome":"Passed","tally":"5-0"}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/Packet2025.11.13_r.pdf#minutes-2025-09-11",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/Packet2025.11.13_r.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2025-08-14",
    title: "SMART Board of Directors — Aug 14, 2025",
    recap: "At its August 14, 2025 regular meeting, the SMART Board approved its agenda and prior meeting minutes, then turned to several financial and operational discussions. Staff introduced a draft Investment Policy modeled on the Roaring Fork Transportation Authority's policy, covering topics such as segregating gondola fund investments, forming a SMART Investment Committee, and permissible investment types; a revised draft will return at a future meeting. The Board also reviewed a proposed FY25 Budget Amendment reflecting unanticipated savings, interest income, and expenditures including bus purchases and gondola project development costs, with formal adoption expected in September.\n\nFor the FY26 preliminary budget, the Board directed staff to assume declining sales tax revenue (−3%), declining lodging tax revenue (−2%), and a 5.25% cap on property tax growth, while also anticipating lower rental income and increased grant revenue from anticipated SB230 funding. Staff presented the 2nd Quarter 2025 Performance Report and the July 2025 Operations Report without significant concerns. The meeting closed with an executive session regarding the legal matter of Masson vs. San Miguel County BOCC.",
    votes: [],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_September%2011th%202025.pdf#minutes-2025-08-14",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_September%2011th%202025.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2025-07-10",
    title: "SMART Board of Directors — Jul 10, 2025",
    recap: "At its July 10, 2025 regular meeting, the SMART Board of Directors unanimously approved the meeting agenda and June 12 meeting minutes. Board member J. Meehan Fee then presented a debrief from a technical gondola tour she participated in across several European systems, covering ropeway technology types, drive systems, cabin design options, station layouts, and a factory visit. Board discussion emphasized that a cabin storage and maintenance facility is a top priority for any new gondola system SMART pursues.\n\nThe Board also received the July 2025 operations report from staff, which flagged an unusual decline in ridership on the Norwood route that falls outside typical seasonal patterns — staff will investigate further. Executive Director David Averill provided updates on CDOT grant opportunities, the ongoing FY2024 financial audit, and the status of pending bus orders. No public comment or roundtable updates were offered, and the meeting adjourned at 4:44 p.m.",
    votes: [],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_August%2014th%202025.pdf#minutes-2025-07-10",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_August%2014th%202025.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2025-06-12",
    title: "SMART Board of Directors — Jun 12, 2025",
    recap: "At its June 12, 2025 virtual regular meeting, the SMART Board of Directors approved the agenda and prior meeting minutes, then turned to a wide-ranging finance discussion. Executive Director Averill reported on revenues received from the voter-approved 3A measure and noted that the board may want to revisit investment strategies beyond the current high-interest money market account; Mogenson and Averill agreed to bring alternative low-risk investment options back to a future meeting. The board also discussed FY26 property tax projections, noting that significantly higher assessed valuations are driving larger tax bills for district residents, and expressed broad support for exploring some degree of property tax relief in the FY26 budget, while acknowledging new state legislation that caps future property tax revenue growth at 5% beginning in FY26.\n\nOperations Manager Distefano presented the June 2025 operations report, covering the rollout of Token Transit for fare payment, a tabletop mass emergency evacuation exercise hosted by San Miguel County, and off-season ridership trends. Averill also updated the board on ongoing legal proceedings related to the 3A election complaint and current CDOT grant activities. No public comment or roundtable updates were offered, and the meeting adjourned at 4:25 p.m.",
    votes: [],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/Packet2025.07.10_r.pdf#minutes-2025-06-12",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/Packet2025.07.10_r.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2025-05-08",
    title: "SMART Board of Directors — May 8, 2025",
    recap: "At its May 8, 2025 regular meeting, the SMART Board unanimously approved the agenda, consent items, and April 10 meeting minutes, with a clarifying amendment specifying that any new percentage fare discount must be evaluated in total rather than stacked on top of existing discounts. The Board also unanimously passed Resolution 2025-11 in support of the Town of Mountain Village's lift tax question, which is headed to the June 2025 municipal ballot. Several directors voiced disappointment that a SMART agreement with TSG had not come to fruition, making the lift tax question all the more significant.\n\nThe Board received the Q1 2025 Performance Report and the May 2025 Operations Report without discussion. The Executive Director's Report focused primarily on the potential hire of a deputy gondola project manager; staff shared a draft job description and collected board input, with further discussions planned for upcoming meetings. No public comments or roundtable updates were offered, and the meeting adjourned at 4:14 p.m.",
    votes: [{"item":"Resolution 2025-11 — Support for Town of Mountain Village lift tax ballot question","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_June%2012th%202025.pdf#minutes-2025-05-08",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_June%2012th%202025.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2025-04-10",
    title: "SMART Board of Directors — Apr 10, 2025",
    recap: "At the April 10, 2025 regular meeting, the SMART Board of Directors — with representatives from the Town of Telluride and Town of Mountain Village — took up several transit operations matters. The main discussion centered on new pass products to be offered through the Token Transit app. After some debate about annual and biannual options, the Board settled on discounted monthly passes as the preferred offering, approving a 20% discount off the standard fare. The Board also agreed to provide a deeper 25% discount for seniors and students.\n\nBoard members received updates on March 2025 ridership and operations, and Executive Director Averill briefed the Board on preliminary formula funding from the Clean Transit Enterprise, a conversation with Representative Hurd's office, and vehicle replacement planning. The Board held two executive sessions — one on the Executive Director's work plan and one for legal consultation regarding the Masson vs. San Miguel County BOCC lawsuit — taking no action from either session before adjourning at 5:10 p.m.",
    votes: [{"item":"SMART Pass — 20% discount on monthly passes","outcome":"Passed","tally":""}, {"item":"SMART Pass — 25% discount for seniors and students","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_May%208th%202025.pdf#minutes-2025-04-10",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_May%208th%202025.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2025-03-13",
    title: "SMART Board of Directors — Mar 13, 2025",
    recap: "At the March 13, 2025 regular meeting, the SMART Board of Directors first heard public comment from Rico's Town Manager about crowding on the Rico bus route, prompting a discussion about expanding the mid-sized bus fleet to meet growing ridership demand. The board then approved its agenda and the prior meeting's minutes without dissent.\n\nThe most significant action of the meeting concerned a proposed funding agreement with Telluride Ski and Golf (TSG). A last-minute modified offer from TSG arrived too late for inclusion in the meeting packet, leading the board to enter a closed Executive Session with legal counsel to review negotiating options. After returning from Executive Session and reviewing TSG's revised proposal, the board unanimously voted to deny Resolution 2025-9, rejecting ratification of the agreement. In other business, staff reported on February ridership figures, the newly launched Montrose–Telluride route, the Transit Royale rollout, and ongoing research into bus Wi-Fi. The Executive Director also provided updates on gondola station area planning efforts in the Towns and the status of current state and federal grant applications.",
    votes: [{"item":"Resolution 2025-9 — Ratification of funding agreement with Telluride Ski and Golf","outcome":"Failed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Meeting%20Packet_April%2010th%202025.pdf#minutes-2025-03-13",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Meeting%20Packet_April%2010th%202025.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2025-03-03",
    title: "SMART Board of Directors Special — Mar 3, 2025",
    recap: "The March 3 special meeting was called primarily to allow the SMART Board to convene in executive session on two separate matters. The first executive session, held from 3:04 to 3:50 p.m., addressed negotiating positions and strategy related to the TSG funding agreement. The second executive session, held from 3:51 to 4:31 p.m., concerned pending litigation in the matter of Masson vs. BOCC et al. No action was taken coming out of either executive session.\n\nThe only formal vote of the meeting was the unanimous approval of the special meeting agenda (Resolution 2025-7). There were no public comments, no operational or project updates, and no round table reports offered. The meeting adjourned at 4:33 p.m.",
    votes: [],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Meeting%20Packet_March%2013th%202025.pdf#minutes-2025-03-03",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Meeting%20Packet_March%2013th%202025.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2025-02-13",
    title: "SMART Board of Directors — Feb 13, 2025",
    recap: "At the February 13 regular meeting, the SMART Board took action on five resolutions. The board approved an extension of the lease for Telluride Crossfit and Gymnastics Academy at 137 Society Drive, contingent on CDOT approval, and adopted a Memorandum of Understanding with San Miguel County covering emergency services. The board also approved an amendment to the Intergovernmental Agreement for the Gondola Project Development and adopted SMART's Strategic Operating Plan, a comprehensive document developed with consultant Fehr and Peers that outlines bus and vanpool service expansion recommendations and associated capital needs. The board discussed how to publicize the final plan and noted minor edits needed to reflect current conditions.\n\nStaff also presented the 4th Quarter 2024 and full-year 2024 performance summaries, as well as the January 2025 operations report, which included updates on the Montrose route and spring off-season preparations. No significant concerns were raised on either report. The board then entered executive session to discuss negotiating positions and strategy, exiting with no action taken. All five resolutions passed unanimously.",
    votes: [{"item":"Resolution 2025-3 — Extension of Lease for Telluride Crossfit and Gymnastics Academy","outcome":"Passed","tally":""}, {"item":"Resolution 2025-4 — Emergency Services MOU with San Miguel County","outcome":"Passed","tally":""}, {"item":"Resolution 2025-5 — Gondola Project Development IGA Amendment","outcome":"Passed","tally":""}, {"item":"Resolution 2025-6 — SMART Strategic Operating Plan Adoption","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Meeting%20Packet_March%2013th%202025.pdf#minutes-2025-02-13",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Meeting%20Packet_March%2013th%202025.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2025-01-09",
    title: "SMART Board of Directors — Jan 9, 2025",
    recap: "At its January 9, 2025 regular meeting, the SMART Board took up several key items. The only formal vote was the approval of the meeting agenda, consent items, and prior meeting minutes, which passed without objection. Two resolutions were deferred: Resolution 2025-2, an Emergency Services Agreement with San Miguel County, was tabled pending minor County-requested revisions and will return at the February meeting. Similarly, the Board discussed SMART's potential financial participation in the Gondola Project Development IGA and reached consensus that SMART should contribute financially, directing staff to amend the IGA accordingly for consideration at the February meeting.\n\nThe Board also received the December 2024 Operations Report without significant concerns. An Executive Session was held for the Executive Director's performance review, lasting from 4:35 p.m. to 5:31 p.m. A second agendized Executive Session on negotiations strategy was tabled by the Board. Public comment was offered by Lee Zeller regarding lodging tax implementation and a request for a special meeting on that subject. The meeting adjourned at 5:32 p.m.",
    votes: [],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-Packet_February-13th-2025.pdf#minutes-2025-01-09",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-Packet_February-13th-2025.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2024-12-12",
    title: "SMART Board of Directors — Dec 12, 2024",
    recap: "At the December 12, 2024 regular meeting, the SMART Board unanimously approved five resolutions covering routine governance and financial matters. The board certified FY24 mill levies, adopted the 2025 budget and capital spending plan, set meeting dates for 2025 (with a possible July cancellation to be decided later), and elected board officers for 2025–2026: Mogenson as Chair, Fee as Vice-Chair, Brown as Treasurer, and Dillsworth as Secretary.\n\nThe board also held a discussion on fares for out-of-district routes, as all in-district services are now fare-free following the passage of Ballot Question 3A. Fares for the Norwood and Nucla/Naturita routes were left unchanged for now, and staff was directed to explore automatic fare collection options. For the new Montrose route, the board agreed on a $5.00 one-way fare ($10.00 round trip) from Montrose to Telluride and a $4.00 one-way fare ($8.00 round trip) from Ridgway to Telluride. The board also held two executive sessions covering contract negotiations and a personnel matter (Executive Director performance review).",
    votes: [{"item":"Resolution 2024-21 — FY24 Mill Levy Certifications","outcome":"Passed","tally":"5-0"}, {"item":"Resolution 2024-22 — Approval of FY25 Budget, Capital Plan and Spending","outcome":"Passed","tally":"5-0"}, {"item":"Resolution 2024-23 — 2025 Meeting Dates","outcome":"Passed","tally":"5-0"}, {"item":"Resolution 2024-24 — 2025–2026 Board Officer Elections","outcome":"Passed","tally":"5-0"}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_January%209th%202025.pdf#minutes-2024-12-12",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_January%209th%202025.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2024-11-14",
    title: "SMART Board of Directors — Nov 14, 2024",
    recap: "The SMART Board of Directors held its November 2024 regular meeting, addressing several policy and budget topics. Following the passage of Ballot Question 3A, the Board briefly debriefed on next steps with no concerns raised. Staff presented a fare policy discussion, with the Board agreeing to make routes within the SMART district — including Rico and Down Valley — free, potentially effective December 1, 2024, since annual budget targets had already been met. Discussion of a proposed Montrose route prompted questions about farebox recovery at a $4.00 fare and how to handle riders from non-contributing communities like Nucla, Naturita, and Redvale; staff was directed to analyze appropriate subsidy levels for out-of-district riders.\n\nThe Board also reviewed the draft FY25 budget and capital plan. After minimal discussion, directors instructed staff to increase a proposed 0.5 FTE position to a full 1.0 FTE and to plan for hiring a financial or business manager in FY25. The 3rd Quarter 2024 Performance Report and the October 2024 Operations Report were presented without significant questions. The Board then entered a brief executive session related to negotiating positions and strategy before adjourning.",
    votes: [],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_December%2012th%202024.pdf#minutes-2024-11-14",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_December%2012th%202024.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2024-10-10",
    title: "SMART Board of Directors — Oct 10, 2024",
    recap: "At its October 10, 2024 regular meeting, the SMART Board of Directors took up several significant topics. The board unanimously approved the meeting agenda and the prior month's minutes. Staff provided an update on the pending TSG Agreement, discussing key terms such as fees, local exemptions, funding flexibility, and the urgency of getting the agreement executed. The board also received a presentation from consultant Sydney Provan of Fehr and Peers on the finalized Strategic Operating Plan, which outlined two sets of service expansion recommendations depending on whether the ballot measure (3A) passed or failed. If passed, improvements would be phased, with fare-free service within the SMART district potentially available immediately upon board approval.\n\nDirector Joe Dillsworth advocated for an additional round trip between Rico and Telluride, while other board members discussed the balance between capital investments and service improvements and the need for additional buses with expanded service. Provan agreed to include estimated capital costs in the final report. Staff also presented two draft FY25 budget scenarios accounting for the outcome of the 3A vote, incorporating new contract rates and a potential 0.5 FTE staff addition. The board then entered executive session to discuss negotiation strategy before adjourning.",
    votes: [],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_November%2014th%202024.pdf#minutes-2024-10-10",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_November%2014th%202024.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2024-09-05",
    title: "SMART Board of Directors — Sep 5, 2024",
    recap: "At its September 5, 2024 regular meeting, the SMART Board of Directors took action on three resolutions. The board unanimously approved the meeting agenda and August 8 minutes, then turned its attention to a significant governance matter: referring a ballot question to registered SMART electors for the November 2024 election. Executive Director Averill provided background on the importance of the November timing, and the board discussed the process for developing the ballot package and finalizing ballot language. A member of the public, Douglas Tooley, offered comment during the public hearing on the gondola planning process and ballot question development before the board voted unanimously to approve Resolution 2024-15.\n\nThe board also unanimously accepted the FY2023 audited financial statements under Resolution 2024-16, with no concerns raised. Staff presented the September 2024 Operations Report without significant board questions. The board then entered a nearly one-hour executive session related to negotiation positions and strategy, after which no further public business was conducted and the meeting adjourned at 4:42 p.m.",
    votes: [{"item":"Resolution 2024-15 — Referring a Ballot Question to Registered Electors of SMART","outcome":"Passed","tally":""}, {"item":"Resolution 2024-16 — FY23 Audit Report and Acceptance","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_October%2010th%202024.pdf#minutes-2024-09-05",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_October%2010th%202024.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2024-08-08",
    title: "SMART Board of Directors — Aug 8, 2024",
    recap: "At its August 8, 2024 regular meeting, the SMART Board of Directors handled several items of business. The board unanimously approved the meeting agenda and the prior month's minutes, then turned its attention to Resolution 2024-13, which authorizes SMART to move forward with a November 2024 ballot question. As part of that discussion, the board designated Director Harvey Mogenson to serve as the Designated Election Official responsible for referring the question to voters. The board also received a brief update on gondola planning activities, with staff previewing topics scheduled for the August 19th Gondola Subcommittee meeting.\n\nStaff also presented the August 2024 Operations Report and the 2024 Second Quarter Performance Report, covering year-to-date ridership, service delivery, and cost measures; the board raised no significant concerns with either report. The meeting included an executive session lasting approximately one hour, held pursuant to Colorado's Open Meetings Law, for the purpose of negotiation strategy and instructing negotiators. No public roundtable updates were offered and the meeting adjourned at 4:42 p.m.",
    votes: [{"item":"Resolution 2024-13 — Preparing SMART for a November 2024 Ballot Question","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet%20for%20September%205th%202024.pdf#minutes-2024-08-08",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet%20for%20September%205th%202024.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2024-07-11",
    title: "SMART Board of Directors — Jul 11, 2024",
    recap: "At its July 11, 2024 regular meeting, the SMART Board unanimously adopted Resolution 2024-11 amending the SMART Governing Intergovernmental Agreement (IGA), noting that all member jurisdictions had already approved the change. The Board also heard a brief update on gondola planning activities, with a preview of topics slated for the July 15 Gondola Subcommittee meeting.\n\nThe Board discussed route alternatives as part of the SMART Strategic Operating Plan, with Fehr and Peers presenting service change options informed by a Board survey and public input. Key directions included a preference for an incremental approach to combining the Lawson Hill and Mountain Village routes, follow-up with the Telluride R1 School District on Rico route service, potential service agreement talks with the Town of Norwood for expanded Down Valley service, and a request for financial scenarios tied to an upcoming election outcome. Staff was directed to plan a retreat to finalize next steps. The Board also received the July 2024 Operations Report before entering Executive Session.",
    votes: [{"item":"Resolution 2024-11 — Amendment to the SMART Governing IGA","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_August%208th%202024.pdf#minutes-2024-07-11",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_August%208th%202024.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2024-06-13",
    title: "SMART Board of Directors — Jun 13, 2024",
    recap: "At its June 13, 2024 regular meeting, the SMART Board of Directors received a brief update on gondola planning activities, including a preview of topics scheduled for the June 17th Gondola Subcommittee meeting. Staff and consultants from Fehr & Peers presented an analysis of peer agency fare structures and potential alternatives for SMART's own fare model. While no formal decision was reached, the Board expressed a general preference for a fare-free model within the SMART district taxing boundary, paired with a zonal fare structure for the broader service area; refined alternatives are to be presented at a future meeting.\n\nThe Board also received the May 2024 Operations Report and an Executive Director's update covering the FY24 financial audit process, rolling stock, grants, and outside meetings. The meeting included an executive session related to negotiations strategy, as authorized under Colorado's Open Meetings Law and SMART Bylaws. The sole recorded vote was unanimous approval of the agenda and the May 9, 2024 meeting minutes.",
    votes: [],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Meeting%20Packet_July%2011th%202024.pdf#minutes-2024-06-13",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Meeting%20Packet_July%2011th%202024.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2024-05-09",
    title: "SMART Board of Directors — May 9, 2024",
    recap: "At its May 9, 2024 regular meeting, the SMART Board of Directors approved the meeting agenda and prior meeting minutes unanimously. Executive Director David Averill provided updates on gondola planning activities, including legislative matters, a potential tax mix for a November 2024 ballot question, and revised cost estimates, which generated no significant board concerns.\n\nOperations Manager Kari Distefano presented several potential service changes and enhancements under the SMART Strategic Operating Plan project; the board requested a follow-up workshop to continue that discussion. Distefano also presented the 1st Quarter 2024 Performance Report and the May 2024 Operations Report, both without significant board concern. Averill updated the board on rolling stock, grants, and outside appointments. The board then convened an executive session regarding negotiating positions and strategy before adjourning at 4:40 p.m.",
    votes: [],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_061324.pdf#minutes-2024-05-09",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_061324.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2024-04-11",
    title: "SMART Board of Directors — Apr 11, 2024",
    recap: "At its April 11, 2024 regular meeting, the SMART Board of Directors unanimously approved the meeting agenda and the prior month's minutes (Resolution 2024-6), then unanimously adopted an amendment to the Gondola Intergovernmental Agreement (Resolution 2024-7) with no substantive questions or concerns raised.\n\nThe board also received informational updates on several ongoing matters: the status of the SMART Governing IGA amendment being considered by local governments; gondola planning activities, including campaign timeline, revenue scenarios, potential ballot language, and a legislative update; the April 2024 operations report from staff; and the Executive Director's report covering rolling stock, grants, outside meetings, and the upcoming CASTA conference in Fort Collins. No public comment was offered and no roundtable updates were provided.",
    votes: [{"item":"Resolution 2024-7 — Gondola IGA Amendment","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Meeting%20Packet_May%209th%202024.pdf#minutes-2024-04-11",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Meeting%20Packet_May%209th%202024.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2024-03-14",
    title: "SMART Board of Directors — Mar 14, 2024",
    recap: "At the March 14, 2024 regular meeting, the SMART Board of Directors unanimously approved the meeting agenda and the prior month's minutes under Resolution 2024-5. Staff presented a progress report on the Strategic Operating Plan, outlining activities completed to date and the next steps ahead. The board also received an update on the ongoing SMART Governing IGA amendment process, with the Executive Director noting that no substantive changes beyond those previously identified would be brought forward for consideration.\n\nThe board heard updates on gondola planning activities, including a pending grant amendment, a shift in grant strategy, highlights from recent gondola tours, and an overview of the campaign timeline. Kari Distefano presented the March 2024 Operations Report, and Executive Director David Averill reported on rolling stock matters, grant pursuits, the legislative session, and outside meetings attended on behalf of SMART. No public comment or roundtable updates were offered, and the meeting adjourned at 4:23 p.m.",
    votes: [],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Packet_April%2011th%202024.pdf#minutes-2024-03-14",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Packet_April%2011th%202024.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2024-02-08",
    title: "SMART Board of Directors — Feb 8, 2024",
    recap: "At its February 8, 2024 regular meeting, the SMART Board of Directors unanimously approved Resolution 2024-4, adopting the meeting agenda and the January 5, 2024 minutes with a minor name correction for alternate director Rick Gomez. Staff then provided informational presentations on two topics: an introductory discussion on the need to update SMART's Intergovernmental Agreement (IGA) to reflect changes in Colorado State Statute, and the 4th Quarter 2023 Performance Report, which covered ridership trends compared to Q3 2023, incidents and complaints, and on-time performance metrics.\n\nThe board also received the February 2024 Operations Report, which included updates on the Strategic Operating Plan and monthly ridership figures. Following the public portion of the meeting, the board convened an executive session under Colorado's Open Meetings Law to discuss negotiating positions and strategy, adjourning the session after approximately 53 minutes with no formal action taken. No public comment was offered, and no roundtable updates were provided.",
    votes: [],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-Meeting-Packet-March-14-2024.pdf#minutes-2024-02-08",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-Meeting-Packet-March-14-2024.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2024-01-05",
    title: "SMART Board of Directors — Jan 5, 2024",
    recap: "At its January 5, 2024 regular meeting, the SMART Board of Directors unanimously approved three resolutions in a short 36-minute session. The board first approved the meeting agenda and the prior meeting's minutes, then certified the mill levies needed to fund SMART's operations for fiscal year 2024. Finally, the board adopted the full fiscal year 2024 budget, capital plan, and appropriations after Executive Director David Averill recapped prior discussions on the budget's development; no concerns or questions were raised on any of the financial items.\n\nOn the operations side, Deputy Director Kari Distefano presented the January 2024 operations report, which included an update on planning for a new Montrose route and a monthly ridership summary. No public comments were received, and no round-table updates were offered by board members. The meeting adjourned at 3:37 p.m.",
    votes: [{"item":"Resolution 2024-2 — Mill Levy Certification for FY24","outcome":"Passed","tally":""}, {"item":"Resolution 2024-3 — Adoption of Fiscal Year 2024 Budget, Capital Plan, and Appropriations","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_020824.pdf#minutes-2024-01-05",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_020824.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2023-12-14",
    title: "SMART Board of Directors — Dec 14, 2023",
    recap: "At its December 14, 2023 regular meeting, the SMART Board of Directors handled three action items and received informational reports. The board unanimously selected a consultant team—AECOM, Design Workshop, Iron Mountain Engineering, and PST Engineering—to provide on-call services for gondola work and smaller SMART capital projects. The board also unanimously approved the 2024 meeting calendar, adjusting the January date forward by one week to accommodate the State's budget filing deadlines.\n\nIn addition to the votes, staff presented the 3rd Quarter FY2023 Performance Report, covering ridership, on-time performance, complaint monitoring, and cost per rider, as well as the December 2023 Operations Report, which included updates on Montrose route planning, the Strategic Operating Plan, and monthly ridership figures. The board then went into executive session for just over an hour to conduct the Executive Director's performance review, after which the meeting adjourned.",
    votes: [{"item":"Resolution 2023-27 — Consultant team selection for On-Call Services RFQ","outcome":"Passed","tally":""}, {"item":"Resolution 2023-28 — Establishing SMART Board of Directors Meeting Dates for 2024","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Meeting%20Packet_January%205th%202024.pdf#minutes-2023-12-14",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Meeting%20Packet_January%205th%202024.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2023-11-09",
    title: "SMART Board of Directors — Nov 9, 2023",
    recap: "At its November 9, 2023 regular meeting, the SMART Board unanimously approved the agenda and October meeting minutes, then turned to two significant gondola-related items. The board approved an Intergovernmental Agreement (Resolution 2023-24) formalizing cost-sharing among participating jurisdictions for the planning and development phase of the regional Gondola Project. The board also established the Gondola Advisory Committee (Resolution 2023-25), adjusting its membership composition following discussion to include a designated 'Mountain Village Entity' category.\n\nThe board also received informational reports on third-quarter FY2024 financials and the October 2023 operations update, which included planning progress on a new Montrose route, off-season service details, a paired ridership analysis examining regional origin-destination patterns, and current ridership figures. The board then convened a brief executive session related to negotiation strategy, after which no action was taken. The meeting adjourned at 4:26 p.m.",
    votes: [{"item":"Resolution 2023-24 — Intergovernmental Agreement for Cost-Sharing of the Gondola Project Planning and Development Phase","outcome":"Passed","tally":""}, {"item":"Resolution 2023-25 — Establishing the Gondola Advisory Committee (with modified membership)","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_December%2014th%202023.pdf#minutes-2023-11-09",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_December%2014th%202023.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2023-10-12",
    title: "SMART Board of Directors — Oct 12, 2023",
    recap: "At the October 12, 2023 regular meeting, the SMART Board unanimously approved the agenda and prior meeting minutes, then unanimously voted to award a new transit operations and maintenance contract to San Juan Mountain Ventures, doing business as Telluride Express. Staff noted that the company's proposal responded fully to RFP 2023-2 requirements and that proposed pricing was consistent with comparable transit agencies across Colorado.\n\nThe board also reviewed a draft FY2024 budget incorporating updated contract rates, the possibility of adding a 0.5 FTE staff position, and funding for special projects, though little discussion took place. Staff provided an operations update covering the Meadows Trail underpass design project, the Strategic Operating Plan, the upcoming Fall 2024 off-season schedule, and monthly ridership figures. The meeting adjourned at 3:47 p.m.",
    votes: [{"item":"Resolution 2023-22 — Selection of San Juan Mountain Ventures (DBA Telluride Express) for Contracted Transit Operations","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-Packet_November-9th-2023.pdf#minutes-2023-10-12",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-Packet_November-9th-2023.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2023-09-14",
    title: "SMART Board of Directors — Sep 14, 2023",
    recap: "At the September 14, 2023 regular meeting, the SMART Board unanimously approved the agenda, prior meeting minutes, and the FY22 financial audit report. Executive Director David Averill presented the audited financial statements without any questions or concerns raised by directors. The board also held a preliminary discussion on the FY24 budget, covering topics such as sales tax revenue forecasting, anticipated increases in property tax revenues, and RETA contributions; a draft FY24 budget will be brought forward at the October meeting.\n\nOperations Manager Kari Distefano provided updates on the Meadows Trail underpass design project, a transit propensity analysis for Montrose and Ridgway, and monthly ridership figures. Averill additionally briefed the board on gondola transition planning activities, an employee housing opportunity under consideration, and an upcoming vehicle delivery. The meeting adjourned at 3:55 p.m.",
    votes: [{"item":"Resolution 2023-20 — Acceptance of FY22 Financial Audit and Report","outcome":"Passed","tally":"5-0"}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/October%2012th%202023%20SMART%20Board%20Meeting%20packet_101223.pdf#minutes-2023-09-14",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/October%2012th%202023%20SMART%20Board%20Meeting%20packet_101223.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2023-08-10",
    title: "SMART Board of Directors — Aug 10, 2023",
    recap: "At its August 10, 2023 regular meeting, the SMART Board of Directors unanimously approved the meeting agenda and the prior month's minutes under Resolution 2023-18. The board then received informational reports from staff: Executive Director David Averill presented the FY23 Second Quarter Performance Report, covering key metrics such as ridership, cost per passenger, and passenger complaints, as well as the Second Quarter Financials Report, which reviewed year-to-date revenues and expenses and prompted discussion about facility repair and maintenance costs.\n\nOperations Manager Kari Distefano provided the August Operations Report, including a recap of a recent Community Advisory Committee meeting, ridership updates, and off-season service performance. Averill also shared executive updates on gondola transition planning, a potential Ilium property purchase, grant opportunities, and a possible employee housing opportunity. No public comment was offered, and the meeting adjourned at 3:41 p.m.",
    votes: [],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_%20September%2014th%202023.pdf#minutes-2023-08-10",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_%20September%2014th%202023.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2023-06-08",
    title: "SMART Board of Directors — Jun 8, 2023",
    recap: "At the June 8, 2023 regular meeting, the SMART Board of Directors approved its agenda and the prior month's meeting minutes without dissent. The board then heard a presentation from Executive Director David Averill on a draft mid-year FY23 budget and capital plan amendment, which addressed both unanticipated expenses and unanticipated revenues requiring appropriation. Much of the discussion centered on mandated accessibility updates to the SMART website and their associated costs; the board directed staff to provide additional detail on the scope of the work and to explore cost-reduction options.\n\nThe board also received the June 2023 Operations Report from Kari Distefano, which generated no discussion. Averill provided updates during his Executive Director's report on the FY22 audit, gondola subcommittee activities, a pending property purchase, and upcoming personal travel. The meeting adjourned at 3:47 p.m.",
    votes: [],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Packet_July%2013th%202023.pdf#minutes-2023-06-08",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Packet_July%2013th%202023.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2023-05-11",
    title: "SMART Board of Directors — May 11, 2023",
    recap: "At the May 11, 2023 regular meeting, the SMART Board of Directors approved two resolutions. The board unanimously adopted Resolution 2023-13, approving the meeting agenda and the April 13, 2023 meeting minutes. They also unanimously adopted Resolution 2023-14, selecting Fehr and Peers as the consultant team to assist with developing a new Strategic Operating Plan following an RFP and review process.\n\nExecutive Director David Averill provided Q1 2023 performance and financial reports, which prompted no concerns from the board. Averill also gave updates on House Bill 1101, ongoing property purchase negotiations, and gondola subcommittee activities, and introduced Amber Kyle-Blake as the new gondola senior project manager. The board discussed elements of a pending intergovernmental agreement (IGA) for cost sharing during the project development and planning phase, in anticipation of a potential November 2024 ballot question related to the gondola project.",
    votes: [{"item":"Resolution 2023-14 — Selection of Fehr and Peers for Strategic Operating Plan","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_June%208th%202023.pdf#minutes-2023-05-11",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_June%208th%202023.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2023-04-13",
    title: "SMART Board of Directors — Apr 13, 2023",
    recap: "At its April 13, 2023 regular meeting, the SMART Board of Directors received operational updates from staff, including progress on the Swiftly real-time bus app, Spring Offseason service adjustments, a new online payment feature for vanpool customers, and ongoing marketing efforts. Executive Director David Averill also briefed the Board on the status of HB1101, vehicle orders, and gondola subcommittee activities.\n\nThe Board held two executive sessions: the first addressed matters related to the Mountain Village Gondola, and the second focused on strategy for a potential real estate acquisition. Following those closed sessions, the Board adopted Resolution 2023-10 concerning the gondola and Resolution 2023-12 authorizing SMART to enter into a contract for the purchase of real property. All motions passed without recorded dissent, and the meeting adjourned at 3:42 p.m.",
    votes: [{"item":"Resolution 2023-12 — Authorization to enter into contract for purchase of real property","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Packet_May%2011th%202023.pdf#minutes-2023-04-13",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Packet_May%2011th%202023.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2023-03-09",
    title: "SMART Board of Directors — Mar 9, 2023",
    recap: "At the March 9, 2023 regular meeting, the SMART Board of Directors approved four resolutions. The board unanimously extended Telluride Crossfit and Gymnastics' lease at 137 Society Drive for another 12 months, and voted to opt out of Colorado's new paid Family and Medical Leave Insurance (FAMLI) program, noting that SMART already provides comparable paid leave to its employees. The board also adopted the final Specialized Transit Roadmap, a planning document developed with consultant Fehr and Peers to improve service for older adults and people with disabilities, with an emphasis on building regional partnerships to carry out the plan's recommendations.\n\nBeyond the formal votes, the board discussed SMART's investment strategy for its cash reserves. Staff presented options including placing funds with the Colorado Trust, but the board directed staff to continue using Alpine Bank's money market account, which has recently seen stronger interest earnings, while continuing exploratory conversations with the Colorado Trust. The Executive Director also briefed the board on active grant pursuits, state legislative efforts related to RTA property tax authority and sales tax cap increases, and the upcoming Southwest Transit Association annual meeting in Denver.",
    votes: [{"item":"Resolution 2023-8 — Lease extension for 137 Society Drive with Telluride Crossfit and Gymnastics","outcome":"Passed","tally":""}, {"item":"Resolution 2023-9 — Opt out of Colorado's paid Family and Medical Leave Insurance (FAMLI) Program","outcome":"Passed","tally":""}, {"item":"Resolution 2023-10 — Adoption of Specialized Transit Road Map for older adults and people with disabilities","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_April%2013th%202023.pdf#minutes-2023-03-09",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_April%2013th%202023.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2023-02-09",
    title: "SMART Board of Directors — Feb 9, 2023",
    recap: "At its February 9, 2023 regular meeting, the SMART Board of Directors unanimously approved all three resolutions brought before it. The board selected Blair and Associates as SMART's new independent auditor (Resolution 2023-5) following a staff-led review of candidates. The board also adopted a Gondola Resolution of Intent (Resolution 2023-6), affirming the agency's continued commitment to the gondola planning process and directing Executive Director Averill to negotiate an agreement with regional partners that clarifies roles and responsibilities going forward, including the creation of a project manager position.\n\nIn addition to the votes, the board received informational updates on fourth-quarter 2022 performance measures and financials, which highlighted positive ridership trends alongside rising maintenance costs. Staff also presented the December 2022 operations report and an executive director's update covering recent grant activity, state legislative developments affecting Colorado RTAs — including potential property tax authority and a higher sales tax cap — and rolling stock matters. No public comment was offered and no roundtable items were raised.",
    votes: [{"item":"Resolution 2023-5 — Selection of Blair and Associates for outside auditing services","outcome":"Passed","tally":""}, {"item":"Resolution 2023-6 — Gondola Resolution of Intent","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_March%209th%202023.pdf#minutes-2023-02-09",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_March%209th%202023.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2022-12-08",
    title: "SMART Board of Directors — Dec 8, 2022",
    recap: "At its December 8, 2022 regular meeting, the SMART Board of Directors addressed several end-of-year administrative and financial items. The board approved its agenda and the prior month's minutes with a note that Joe Dillsworth was in attendance, then unanimously certified the fiscal year 2023 mill levies and adopted the FY 2023 budget, capital plan, and spending appropriations. The board also set its 2023 meeting schedule, continuing the tradition of holding meetings on the second Thursday of each month at 3 p.m.\n\nThe board elected officers for 2023/2024, notably splitting the previously combined Secretary/Treasurer role into two positions: Joe Dillsworth as Chair, Patrick Berry as Vice-Chair, Meehan Fee as Treasurer, and Lance Waring as Secretary. Staff provided the October 2022 operations update, and board member Patrick Berry offered a brief update on the Chondola project. All five resolutions passed unanimously, and the meeting adjourned at 9:40 a.m.",
    votes: [{"item":"Resolution 2022-20 — Fiscal Year 2023 Mill Levy Certifications","outcome":"Passed","tally":""}, {"item":"Resolution 2022-21 — Fiscal Year 2023 Budget, Capital Plan, and Spending Appropriations","outcome":"Passed","tally":""}, {"item":"Resolution 2022-22 — 2023 Board Meeting Dates","outcome":"Passed","tally":""}, {"item":"Resolution 2022-23 — Election of Board Officers for 2023/2024","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_%20January%2012th%202023.pdf#minutes-2022-12-08",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_%20January%2012th%202023.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2022-11-10",
    title: "SMART Board of Directors — Nov 10, 2022",
    recap: "At its November 10, 2022 regular meeting, the SMART Board unanimously approved the agenda, consent items, and prior meeting minutes, then unanimously approved Resolution 2022-18 authorizing a Memorandum of Understanding with Continuum of Colorado Inc. and the Colorado Department of Transportation to transfer a transit vehicle into SMART's fleet. Executive Director David Averill walked the board through the vehicle transfer process and next steps needed to put the vehicle into service.\n\nThe board also received several informational presentations: the 3rd Quarter 2022 Performance Report (highlighting increased ridership and lower costs per passenger trip, though with some upticks in road calls and passenger complaints), the 3rd Quarter 2022 Financials Report, a draft FY23 Capital Plan with project descriptions and grant funding options, and an October 2022 Operations Update. Averill additionally reported on grant statuses and vehicle procurement progress. The meeting concluded with two closed executive sessions covering a potential real estate transaction and the Executive Director's performance review; no action was taken in either session.",
    votes: [{"item":"Resolution 2022-18 — MOU with Continuum of Colorado Inc. and CDOT for Transit Vehicle Transfer","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Packet_%20December%208th%202022.pdf#minutes-2022-11-10",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Packet_%20December%208th%202022.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2022-10-13",
    title: "SMART Board of Directors — Oct 13, 2022",
    recap: "At its October 13, 2022 virtual regular meeting, the SMART Board of Directors unanimously approved the September 8 consent agenda and the August 11 meeting minutes. The board then heard several informational updates: a presentation on the Older Adults and Disabled Mobility Gaps Study, a draft FY23 operating budget that accounts for rising fuel, labor, and maintenance costs while remaining balanced, and a September operations report covering the upcoming fall off-season schedule, household access to SMART routes, planning for new Lawson Hill–Mountain Village service, marketing efforts, and ridership figures.\n\nExecutive Director Averill also briefed the board on the Meadows Underpass design project, recent outside meetings and conferences, vehicle procurement progress, and follow-up on the FY21 financial audit. The board then entered executive session to discuss a potential real estate transaction, but no action was taken. No public comment was offered and no round-table updates were provided. The meeting adjourned at 4:45 p.m.",
    votes: [],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/1-SMART-Board-Packet_%20November%2010th%202022.pdf#minutes-2022-10-13",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/1-SMART-Board-Packet_%20November%2010th%202022.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2022-09-08",
    title: "SMART Board of Directors — Sep 8, 2022",
    recap: "At its September 8, 2022 regular meeting, the SMART Board of Directors unanimously approved the meeting agenda and August minutes, then unanimously accepted the FY21 Audit Report after discussion of the audit process and Single Audit findings. The board also received a preliminary overview of FY23 budget revenue assumptions and expected expenditure changes, directing staff to bring a draft FY23 Budget and Capital Plan to the October meeting.\n\nThe board discussed SMART's potential expanded role in the regional gondola planning process, noting the Leadership Committee's desire for greater SMART involvement. Staff was asked to return with a proposed resolution of intent clarifying SMART's commitments before any enhanced role is assumed. Additional topics included a strategic plan update—with a new planning grant effort targeting a 2023 launch and 2024 completion—an August operations report covering the Zero Fare campaign, the Lawson Hill to Mountain Village pilot route, and ridership data, as well as executive director updates on grants and the CIRSA risk audit. The meeting concluded with an executive session regarding a potential real estate transaction.",
    votes: [{"item":"Resolution 2022-15 — Acceptance of FY21 Audit Report","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-meeting-packet_October-13th-2022.pdf#minutes-2022-09-08",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-meeting-packet_October-13th-2022.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2022-08-11",
    title: "SMART Board of Directors — Aug 11, 2022",
    recap: "At its August 11, 2022 regular meeting, the SMART Board of Directors unanimously approved the agenda, consent items, and the June 9, 2022 meeting minutes. The board received a second-quarter FY22 performance report covering ridership trends, cost-per-passenger metrics, and the impact of rising fuel costs, as well as a financial update showing strong revenues and a favorable overall fiscal position for SMART.\n\nThe board also heard an operations update for June and July, including progress on the Older Adults and Disabled Mobility Gaps Study and marketing and ridership efforts. Executive Director David Averill reported on grant activity, the Meadows Underpass design project, and the status of the FY21 fiscal audit. The meeting concluded with an executive session to discuss a potential real estate transaction, including negotiation positions and strategy regarding possible property acquisition.",
    votes: [],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20packet_September%208%202022.pdf#minutes-2022-08-11",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20packet_September%208%202022.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2022-06-09",
    title: "SMART Board of Directors — Jun 9, 2022",
    recap: "At its June 9, 2022 regular meeting, the SMART Board unanimously approved three resolutions. The board extended the lease for Telluride Gymnastics, LLC at the 137 Society Drive property and adopted a supplemental FY22 Budget along with a revised FY22 Capital Plan, building on discussion from the previous month's meeting.\n\nStaff provided several informational updates. Operations Director Kari Distefano reported on the Older Adults and Disabled Mobility Gaps Study, schedule adjustments for the Lawson Hill and Norwood routes following the off-season, and ridership figures for May. Executive Director David Averill updated the board on grant progress, repairs at the Lawson facility, the Meadows Underpass design project, and the status of the FY21 fiscal audit. The meeting adjourned at 3:39 p.m.",
    votes: [{"item":"Resolution 2022-11 — Lease Amendment at 137 Society Drive with Telluride Gymnastics, LLC","outcome":"Passed","tally":""}, {"item":"Resolution 2022-12 — Supplemental FY22 Budget and Capital Plan","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-Packet_August-11th-2022.pdf#minutes-2022-06-09",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-Packet_August-11th-2022.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2022-05-12",
    title: "SMART Board of Directors — May 12, 2022",
    recap: "At its May 12, 2022 virtual regular meeting, the SMART Board of Directors unanimously approved the meeting agenda and prior meeting minutes, and then unanimously approved an intergovernmental agreement with San Miguel County and the Telluride Library District to install a drop-off kiosk at the Lawson Hill Intercept Lot. The board also received first-quarter 2022 performance and financial reports, with staff noting strong ridership growth, rising fuel costs, and an overall strong fiscal position.\n\nThe board reviewed a draft amended FY22 budget and capital plan, which proposes increasing projected revenues by $220,000 to reflect better-than-expected receipts while also accounting for higher operational expenses and capital purchases; formal action on the amendment is planned for the June meeting. Staff also provided operations updates covering off-season service changes to the Lawson Hill and Norwood schedules, a passenger app in development, facility repairs, the Meadows Underpass design project, and progress on the FY21 fiscal audit. The meeting concluded with an executive session regarding a potential real estate transaction.",
    votes: [{"item":"Resolution 2022-9 — Intergovernmental Agreement with San Miguel County and Telluride Library District for Lawson Hill Intercept Lot Drop Off Kiosk","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Packet_%20June%202022.pdf#minutes-2022-05-12",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Packet_%20June%202022.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2022-03-10",
    title: "SMART Board of Directors — Mar 10, 2022",
    recap: "At the March 10, 2022 virtual meeting, the SMART Board of Directors unanimously approved all three resolutions on the agenda. The board adopted its agenda and the prior month's minutes, then approved an amended agreement with the Town of Mountain Village governing maintenance of SMART's vanpool vehicles. The board also committed local matching funds via a Letter of Commitment to support a grant application for the Meadows Trail Underpass construction project.\n\nIn informational updates, staff reported on February ridership figures and flagged potential schedule changes for the Off-Season and Lawson Hill routes, as well as ongoing development of a passenger app. Executive Director David Averill briefed the board on grant activity, repairs at the Lawson facility, progress on the Meadows Underpass design, and the status of the FY2021 fiscal audit. The meeting adjourned at 4:03 p.m.",
    votes: [{"item":"Resolution 2022-6 — Amended Memorandum of Agreement with Town of Mountain Village for SMART vanpool vehicle maintenance","outcome":"Passed","tally":""}, {"item":"Resolution 2022-7 — Letter of Commitment for local grant matching funds for the Meadows Trail Underpass project","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-meeting-packet_%20May%202022.pdf#minutes-2022-03-10",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART-Board-meeting-packet_%20May%202022.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2022-02-10",
    title: "SMART Board of Directors — Feb 10, 2022",
    recap: "At its February 10, 2022 regular meeting, the SMART Board unanimously approved the meeting agenda, consented to the January 13 minutes, and formally designated Patrick Berry as the Board's Secretary/Treasurer. No public comment was received.\n\nThe Board received informational updates on several fronts: Executive Director Averill reviewed the 4th Quarter 2021 financial and performance reports, noting ridership figures and cost-per-passenger variances. Operations Manager Distefano reported on potential Off-Season and Lawson Hill schedule changes, progress toward a passenger app, and January ridership. Averill also updated the Board on grant activities, repairs at the Lawson facility, the Meadows Underpass design project, and the status of the FY21 fiscal audit. The meeting adjourned just after 4:00 p.m.",
    votes: [{"item":"Resolution 2022-4 — Designation of Patrick Berry as SMART Board Secretary/Treasurer","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Meeting%20Packet_%20March%2010th%202022.pdf#minutes-2022-02-10",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Meeting%20Packet_%20March%2010th%202022.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2022-01-13",
    title: "SMART Board of Directors — Jan 13, 2022",
    recap: "At the January 13, 2022 regular meeting, the SMART Board of Directors took care of housekeeping items by unanimously approving the meeting agenda and the minutes from the December 9, 2021 meeting. The board then unanimously approved Resolution 2022-2, selecting Fehr and Peers as the lead planning consultant for the FY22 Seniors and Disabled Mobility Gaps Study, following a competitive RFP process. Executive Director Averill was authorized to move forward with contract negotiations and execution.\n\nBeyond the votes, staff provided operational updates covering the SPOT project, the vanpool transition, and the Nucla/Naturita route extension, along with a review of December 2021 ridership trends and marketing efforts. Executive Director Averill also briefed the board on active grant pursuits, facility work, upcoming vehicle deliveries, and the status of the FY21 audit. The meeting adjourned at 4:06 p.m.",
    votes: [{"item":"Resolution 2022-2 — FY22 Selection of Planning Consultant for the Seniors and Disabled Mobility Gaps Study","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20packet_February%202022.pdf#minutes-2022-01-13",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20packet_February%202022.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2022-01-12",
    title: "SMART Board of Directors — Jan 12, 2022",
    recap: "At its January 12, 2022 regular meeting, the SMART Board unanimously approved three resolutions. The board adopted the meeting agenda and the December 9, 2022 minutes, authorized an extension of a rental lease with Proset Construction, and approved a cooperative purchasing agreement with the Washington State Department of Transportation to acquire large, heavy-duty transit buses recently funded through a federal 5339 grant.\n\nBeyond the votes, staff presented the December 2022 operations report and the Executive Director provided updates on grants, an Audit RFP, the gondola subcommittee, legislative matters affecting SMART, and rolling stock. Board members also held a roundtable discussion touching on Park City Transit's electrification efforts, the Town of Telluride's own electrification planning, and gondola crowding during peak periods — including how SMART might help ease that congestion in the future.",
    votes: [{"item":"Resolution 2023-2 — Extension of rental lease with Proset Construction","outcome":"Passed","tally":""}, {"item":"Resolution 2023-3 — Cooperative Purchase Agreement with Washington State DOT for heavy-duty transit buses","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_February%209th%202023.pdf#minutes-2022-01-12",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20meeting%20packet_February%209th%202023.pdf"
  },
  {
    sourceKey: "smart",
    sourceLabel: "SMART",
    date: "2021-12-09",
    title: "SMART Board of Directors — Dec 9, 2021",
    recap: "At its December 9, 2021 regular meeting, the SMART Board of Directors unanimously approved all four resolutions on the agenda. The board certified the FY22 mill levy amounts (Resolution 2021-18) and formally adopted the FY22 budget, capital plan, and appropriations (Resolution 2021-19), with Executive Director David Averill noting meaningful changes in both revenues and expenses compared to the prior fiscal year. The board also set the 2022 board meeting schedule (Resolution 2021-20).\n\nBeyond the formal votes, staff provided informational updates on several ongoing initiatives. Transit Director Kari Distefano reported on November ridership trends, marketing efforts, the SPOT project, and the Nucla/Naturita service expansion. Averill followed with updates on active grants, facility improvements, pending vehicle deliveries, the Meadows Underpass Project, and various interagency meetings. No public comment was received, and the meeting adjourned at 4:12 p.m.",
    votes: [{"item":"Resolution 2021-18 — FY22 Mill Levy Certifications","outcome":"Passed","tally":""}, {"item":"Resolution 2021-19 — FY22 Budget/Capital Plan and Appropriations","outcome":"Passed","tally":""}, {"item":"Resolution 2021-20 — 2022 SMART Board Meeting Dates","outcome":"Passed","tally":""}],
    videoUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Packet_%20January%202022.pdf#minutes-2021-12-09",
    minutesUrl: "https://smarttelluride.colorado.gov/sites/g/files/lrnvjt2346/files/documents/SMART%20Board%20Packet_%20January%202022.pdf"
  }
];

const TELLURIDE_TIMES_ARTICLES = [
  {
    title: "Bingo: Sen. Cleave Simpson scores sleeper win as card spells ‘cabinet’",
    source: "Telluride Times",
    date: "November 20, 2026",
    firstSeen: "2026-11-21",
    newsTopic: "government",
    copy: "Colorado State Sen. Cleave Simpson, a fourth-generation San Luis Valley farmer and the senate's minority leader, was surprised by Gov.-elect Phil Weiser's offer to serve as state agriculture commissioner — his first cabinet pick. Simpson had been winding down his final senate term and planning a return to farming. The cross-party appointment is seen as a bridge between Colorado's urban and rural interests.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_02c81429-4d20-4590-8ece-ac6526097ee8.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/76/8762a9be-7238-43ae-9d77-680e4acadb41/6aff9d06497f1.image.jpg",
    imgHiRes: true
  },
  {
    title: "Honoring those who have served",
    source: "Telluride Times",
    date: "November 20, 2026",
    firstSeen: "2026-11-20",
    newsTopic: "public-safety",
    copy: "Norwood's Veterans Day gathering at the school has been a community staple since 1999. This year, Sheriff Dan Covault gave the keynote, and veterans stayed for lunch — same as always.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_8a37aef7-b69f-4bcb-9eeb-46bcb755ae6e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/94/5940828c-262e-4b22-880d-2e022fa395d2/6afb77da26f51.image.jpg",
    imgHiRes: true
  },
  {
    title: "Chalkboard",
    source: "Telluride Times",
    date: "November 20, 2026",
    firstSeen: "2026-11-20",
    newsTopic: "government",
    copy: "Birthdays are listed for community members from Nov. 12–25. Regular local meetings and services continue as scheduled, including town board, school board, food pantry, senior meals, pickleball, AA, and free legal aid.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_66869c7d-d030-4373-a6f0-245cb450611a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/16/81611f83-2d88-447c-9067-df757b86bc10/6af78388cc0f3.image.jpg",
    imgHiRes: true
  },
  {
    title: "San Miguel Juvenile Services expands programming",
    source: "Telluride Times",
    date: "November 20, 2026",
    firstSeen: "2026-11-20",
    newsTopic: "education",
    copy: "San Miguel Juvenile Services, now nearly 40 years old, recently sent 10 local high schoolers to a peer leadership training in Boulder focused on turning anxiety into a productive tool. Those students will now go into middle school classrooms across the region to mentor younger peers. The program runs on a patchwork of local, state, and private funding.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_2ae823a8-a51f-4b4c-a1fe-df51c8667bda.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/c9/5c97d510-4c1b-428f-a438-dc39101d6887/6af76b81ac400.image.png",
    imgHiRes: true
  },
  {
    title: "Telluride Town Council talks recycling, composting",
    source: "Telluride Times",
    date: "November 20, 2026",
    firstSeen: "2026-11-20",
    newsTopic: "government",
    copy: "Colorado's Extended Producer Responsibility law shifts recycling costs from residents to packaging producers, and Telluride has opted in. Once the Town's contract with the Circular Action Alliance is finalized, recycling automatically becomes free for anyone already receiving service — no action needed. Bruin Waste is handling most of the reporting burden; the application process has been slow but is moving forward.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_39e8b487-e60e-43dc-9896-973180a8b86c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/34/f3444de8-2e04-4591-ae0b-6ef1a6f43c34/6afca8cbc5eb9.image.jpg",
    imgHiRes: true
  },
  {
    title: "Lawfully wedded weirdos",
    source: "Telluride Times",
    date: "November 19, 2026",
    firstSeen: "2026-11-20",
    newsTopic: "arts-culture",
    copy: "Kris Kwasniewski and Scott Upshur, both well-known in Telluride's arts community, got married November 5th on the courthouse steps in front of over 200 guests. The two met on Main Street in 2015 and celebrated with a reception at the Sheridan Opera House featuring local band Chrome Velvet.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_569bdca9-b6de-41e0-aad4-59b02931a9a5.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/d2/6d23006c-62b7-4492-b425-d3f79cc28bbc/6afdc36850b3f.image.jpg",
    imgHiRes: true
  },
  {
    title: "Upcoming youth events",
    source: "Telluride Times",
    date: "November 19, 2026",
    firstSeen: "2026-11-19",
    newsTopic: "community",
    copy: "Three quick dates for Telluride families: House winners get announced Nov. 19, boys basketball league finals land Nov. 21, and kids are out Nov. 23–27 for Thanksgiving break.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_83843478-b79a-46b2-b73a-13722b11658d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/6b/26b6eb94-3c4f-421c-b115-c2a957f3ca4f/6af77e44f3953.image.png",
    imgHiRes: true
  },
  {
    title: "Keeping Norwood's community garden growing",
    source: "Telluride Times",
    date: "November 19, 2026",
    firstSeen: "2026-11-19",
    newsTopic: "housing",
    copy: "The Norwood Community Garden — started in 2009, with 30+ plots and water included in annual rents as low as $25 — has been struggling with drought, aging infrastructure, and a volunteer base that's largely older. San Miguel County just approved $5,000 for a planning consultant to map out a more water-efficient, lower-labor future for the space.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_68fcccc6-9e71-4ed4-9ec4-8b627fce5ea2.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/f3/af3b7695-2da9-45b1-856a-e9bf504a994d/6af737a5555df.image.webp",
    imgHiRes: true
  },
  {
    title: "Norwood School November newsletter",
    source: "Telluride Times",
    date: "November 19, 2026",
    firstSeen: "2026-11-19",
    newsTopic: "education",
    copy: "Norwood School's Homecoming Week drew strong community turnout for games, a bonfire, and a dance, with local businesses and families pitching in to make it happen. Construction on the new school building is on track, with completion expected March 2028 and move-in planned for summer 2028.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_dc5e2023-dbc5-4772-91bc-b4cc6a7b9b07.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Suicide Loss Remembrance Day is Saturday, Nov. 21",
    source: "Telluride Times",
    date: "November 19, 2026",
    firstSeen: "2026-11-19",
    newsTopic: "health",
    copy: "Saturday, Nov. 21 marks International Suicide Loss Remembrance Day — observed the Saturday before Thanksgiving for 27 years. Local group SPARC, part of Thrive Community Health Network, invites anyone who has lost someone to suicide to connect with others regionally and nationally. Resources and virtual memorial events at tchnetwork.org/sparc.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_cc83607d-3958-4ac0-964f-7ff8a96cbcd2.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/80/b806fe29-e7e0-4b6b-b681-6c9e0aa4b235/6af70ec38e7d7.image.jpg",
    imgHiRes: true
  },
  {
    title: "Sarah E. Schantz wins 2026 Cantor Poetry Prize contest",
    source: "Telluride Times",
    date: "November 19, 2026",
    firstSeen: "2026-11-19",
    newsTopic: "arts-culture",
    copy: "Sarah Elizabeth Schantz of Longmont took the ninth annual Cantor Poetry Prize from the Telluride Institute's Talking Gourds program for her poem \"Swan Soup.\" Five finalists each received $250, and five honorable mentions were named from 102 entries by 58 poets. The prize goes to Colorado poets or anyone writing about Colorado.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_9e7f6e5d-7998-43ff-8493-42f9594715aa.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/20/6206dad8-49c1-4f74-9241-19327464559d/6af76a2e47fe1.image.jpg",
    imgHiRes: true
  },
  {
    title: "Mountain Munchkins launches fundraising campaign for childcare expansion",
    source: "Telluride Times",
    date: "November 19, 2026",
    firstSeen: "2026-11-19",
    newsTopic: "government",
    copy: "Mountain Munchkins — the only infant childcare provider in the east end of San Miguel County — is raising funds to expand in 2027, adding 10 infant slots, 4 toddler slots, and a new after-school program. The center currently serves 38 kids but has 40+ on its waitlist. Donations are tax-deductible and qualify for a 50% Colorado state tax credit.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_4e0f18a3-2e8e-4aa1-8d27-29cb32e34ecf.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/c0/cc077517-ed9a-4519-ab18-39c5e8a8e737/6afb631e9a74f.image.jpg",
    imgHiRes: true
  },
  {
    title: "MTN Lodge responds to recent court ruling",
    source: "Telluride Times",
    date: "November 19, 2026",
    firstSeen: "2026-11-19",
    newsTopic: "government",
    copy: "MTN Lodge in Ridgway has amended its agreement with the Four Seasons developer and is paying all applicable taxes following a recent court ruling it has appealed. The hotel says occupancy has jumped from 12% to 72% year-over-year, with Ridgway Pizza & Tap reopening as a result. MTN Lodge contends local and state code permit extended hotel stays and plans to keep engaging with town leadership.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_921019c5-d381-46e3-a4cf-31386c2b55e1.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/4b/64ba6ccf-46ae-4fba-b02e-e32fe745e0a2/6af74d65cdf05.image.jpg",
    imgHiRes: true
  },
  {
    title: "Venture Network, Telluride Science host AI Summit for Rural Communities",
    source: "Telluride Times",
    date: "November 19, 2026",
    firstSeen: "2026-11-19",
    newsTopic: "community",
    copy: "TVN and Telluride Science are hosting their second annual AI Summit for Rural Communities on Jan. 13–14 at the Telluride Innovation Center. Day 1 (free, public) covers the shift from chatbots to AI agents; Day 2 is a hands-on business sprint, free but limited to six businesses. Deadline to apply is Nov. 25.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_1b97a5ad-3e6d-4087-a5cf-08ae57f9090d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/33/b3336362-26be-4a15-b500-648687374ea2/6af71069cbf4a.image.jpg",
    imgHiRes: true
  },
  {
    title: "Mountain Village to conduct slash pile burning as conditions allow",
    source: "Telluride Times",
    date: "November 19, 2026",
    firstSeen: "2026-11-19",
    newsTopic: "public-safety",
    copy: "Mountain Village's Forestry Department will burn slash piles from dead timber cleared across 17+ acres this season, running roughly Nov. 18–Dec. 18 along the north boundary and below See Forever Village. Burns happen sunrise to sunset, Mon–Thu, weather permitting. If you see ridge smoke, don't call 911.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_7b4320f7-bfee-4dce-a0c4-bca7e3e7d824.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Letters to the Editor",
    source: "Telluride Times",
    date: "November 19, 2026",
    firstSeen: "2026-11-19",
    newsTopic: "education",
    copy: "Two THS students share positive experiences from the school's mentorship program — one working with a local pastor, another in a fifth-grade dual-immersion classroom. Separately, a resident questions school district spending amid a 21% enrollment drop since 2019-20 and rising per-pupil costs. The Sheridan Opera House and a local condo owner both thank the Town's Green Grant program for helping fund energy-efficiency upgrades.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/article_30ac257a-69a5-48f2-bdcc-5005215f2cde.html",
    img: "",
    letterAuthor: "Sincerely, Hazel Noel",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Compassion (even for a rat)",
    source: "Telluride Times",
    date: "November 19, 2026",
    firstSeen: "2026-11-19",
    newsTopic: "community",
    copy: "A writer recalls discovering a rat had swum aboard their sailboat while anchored in storm-damaged Puerto Rico. After failed sticky traps, they caught it in a live trap — and instead of drowning it, motored it to shore. Small moment, but it stuck with her.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_75232578-f647-41f6-9fb8-5f89f2996bfc.html",
    img: "",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Wilson Peak’s viral moment",
    source: "Telluride Times",
    date: "November 19, 2026",
    firstSeen: "2026-11-19",
    newsTopic: "recreation",
    copy: "A flyer appeared on West Colorado Avenue riffing on a viral Chicago stunt where hundreds gathered at Millennium Park on Nov. 8 attempting to \"move\" the 110-ton Cloud Gate sculpture. Telluride's version called for moving Wilson Peak. Mostly just made the rounds on social media.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_bd58ab29-6c31-403f-aad6-4e98226297a2.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/45/b45e6455-6c83-4a90-a457-cb4a5f7b04c1/6afafee5a905e.image.png",
    imgHiRes: true
  },
  {
    title: "Pushback 101: finding a balance",
    source: "Telluride Times",
    date: "November 19, 2026",
    firstSeen: "2026-11-19",
    newsTopic: "community",
    copy: "A personal essay in the Telluride Times reflects on the costs of reflexive pushback — personally and culturally — and points to three recent books exploring acceptance, non-reactivity, and letting go of control. Practical reads for anyone feeling worn down by the urge to fight every battle.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_645b761f-ff38-4ef1-a98f-195316fa6575.html",
    img: "",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "'Still showing up' for democracy on the courthouse steps",
    source: "Telluride Times",
    date: "November 19, 2026",
    firstSeen: "2026-11-19",
    newsTopic: "government",
    copy: "Telluride's monthly People's March continues at the San Miguel County Courthouse, with organizers saying recent election results haven't slowed their plans. The Nov. 21 gathering starts at noon, features local speakers, a walk to Town Park and back, and ends with a singalong. December's march is already scheduled with speakers lined up.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_bfe5ecbf-0f49-4c38-bfcb-51bb774889dd.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/35/3359ab5d-85a2-4161-8db6-4781b0f9b870/6af781a00a64a.image.jpg",
    imgHiRes: true
  },
  {
    title: "Legals and Public Notices for Nov. 19-25, 2026",
    source: "Telluride Times",
    date: "November 19, 2026",
    firstSeen: "2026-11-19",
    newsTopic: "infrastructure",
    copy: "A property at 53 East Homestead Road in Norwood is headed to public auction December 17, 2026, after the owner fell behind on a Rocket Mortgage loan with roughly $172,000 still owed. A second San Miguel County foreclosure involving an Alpine Bank loan on a separate property is also moving through the legal process.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/legals/article_a0b9535a-57a0-48ea-91a5-bf3583aa9d95.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "TSD Superintendent John Pandolfo to retire",
    source: "Telluride Times",
    date: "November 18, 2026",
    firstSeen: "2026-11-19",
    newsTopic: "government",
    copy: "Telluride R-1 Superintendent John Pandolfo announced he'll retire July 1 after seven years leading the district. School Board Chair Cheryl Carstens Miller called him her favorite of five superintendents she's worked with. He plans to split time between southwest Colorado and Italy, where he recently secured dual citizenship.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_17fe9dbd-50cb-4400-8ccb-5d6563173559.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/26/726d36a3-7ba3-42d0-86ba-3cd637b60d15/6afb2eb6964d9.image.png",
    imgHiRes: true
  },
  {
    title: "Every animal deserves a family, but where are the adopters?",
    source: "Telluride Times",
    date: "November 18, 2026",
    firstSeen: "2026-11-19",
    newsTopic: "community",
    copy: "Second Chance Humane Society in Ridgway says adoption rates have dropped in recent years, with dogs and even kittens like 2-month-waiting Hocus staying longer. They're open daily 11–5, no appointment needed, and hold weekly community events to connect pets with people.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_fcd4fb73-cc70-4625-a3cc-4848c7ccccff.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Miner boys' soccer edged out in semifinals at State",
    source: "Telluride Times",
    date: "November 18, 2026",
    firstSeen: "2026-11-18",
    newsTopic: "community",
    copy: "Top-seeded Telluride boys soccer fell 4-3 in double overtime to no. 5 seed St. John Paul the Great in the 2A state semifinals, with SJPG's Luke Sri scoring the winner off a 93rd-minute corner kick. The Miners had led 3-2 heading into the final stretch before the Mountaineers forced overtime.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_9fa6595c-a903-4954-8f82-ff120ce1908c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/e9/ee94ec24-ab0c-44e8-8797-029d535d5bae/6afc430be80aa.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride Ski Resort revises winter season opening date",
    source: "Telluride Times",
    date: "November 17, 2026",
    firstSeen: "2026-11-18",
    newsTopic: "recreation",
    copy: "Telluride Ski Resort pushed its opening day back to Saturday, Dec. 5, citing warm high pressure that's made low-elevation snowmaking difficult despite solid snowpack up high. The mountain stays closed to all activity until then. The town-to-Mountain Village gondola reopens Nov. 20; the Chondola stays closed until ski season opens.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_05e05805-a6de-4272-82a4-f6c0b39a61f7.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/6a/96aa3c9e-d835-4391-ba92-098813f855b9/6afcb2ef2655a.image.jpg",
    imgHiRes: true
  },
  {
    title: "Shake it up: Sneak peek at Telluride Bluegrass Festival's 2027 lineup",
    source: "Telluride Times",
    date: "November 17, 2026",
    firstSeen: "2026-11-17",
    newsTopic: "arts-culture",
    copy: "Planet Bluegrass gave the Times an early look at the 2027 Telluride Bluegrass Festival lineup ahead of the official Dec. 1 announcement. It's the 54th fest, with heavy turnover — only five and a half acts returning from 2026 — alongside bluegrass hall-of-famers Sam Bush, Del McCoury, Bela Fleck, and Jerry Douglas. Tickets go on sale Dec. 10.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_9a01e184-c8a3-4137-8716-ef6fa0427e7d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/d0/ad092fe3-f24b-4a56-ba84-131a206cf435/6afa91c013d65.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘This would really rewrite the rulebook for public lands policy’",
    source: "Telluride Times",
    date: "November 16, 2026",
    firstSeen: "2026-11-17",
    newsTopic: "land-use",
    copy: "The Interior Department has proposed changes to how the BLM handles land use planning, including reducing public comment requirements for Areas of Critical Environmental Concern. San Miguel County has two ACECs — the San Miguel River corridor and Gunnison Sage Grouse habitat — that could see reduced protections or boundaries under the new rule. A public comment period on the proposal is open.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_1be34e4a-cfdb-4c9e-81a2-8764324f9573.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/36/5366b191-d7d0-4c8a-b43e-dddfa9f0bab0/6afaea46c93ed.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride Rewind",
    source: "Telluride Times",
    date: "November 16, 2026",
    firstSeen: "2026-11-16",
    newsTopic: "government",
    copy: "Back in 1971, a property owner notified Telluride's town board he planned to subdivide 15–20 acres at the mouth of Bear Creek Canyon. Town efforts through the '80s to purchase and preserve the land fell through, but a private buyer ultimately acquired the 320-acre parcel and transferred it to the San Miguel Conservation Foundation in 1995.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_850099a0-59f3-4adf-b030-7d81862d213f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/8d/48dee0e9-92f4-435a-9f69-2474876bb546/6af76dd24fc9d.image.jpg",
    imgHiRes: true
  },
  {
    title: "New turns and U-turns on Telluride Hospital District's road forward",
    source: "Telluride Times",
    date: "November 15, 2026",
    firstSeen: "2026-11-16",
    newsTopic: "health",
    copy: "The Telluride Hospital District board signed a letter of intent with CommonSpirit Health (formerly Catholic Health Initiatives Colorado) and hired Jensen Partners for due diligence support. The LOI includes potentially transferring substantially all medical center assets to CommonSpirit — something board chair Tom Crabtree called \"TBD.\" Key sticking points include preserving staff, tax dollars, and reproductive health services the community currently relies on.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_06d37a7b-663f-4a7a-abfe-de5a6059fc37.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/05/5058fb36-47a4-4f6d-ad9a-03ea784e2fbc/6af6b1981a817.image.jpg",
    imgHiRes: true
  },
  {
    title: "TSSC brings on new staff, board members and approach",
    source: "Telluride Times",
    date: "November 15, 2026",
    firstSeen: "2026-11-16",
    newsTopic: "government",
    copy: "The 41-year-old Telluride Ski and Snowboard Club heads into the season with a new board chair, Lauren Woodward, new secretary/treasurer Jason Soules, two additional board members, and a new operations manager, Jessica Lockwood. The club is emphasizing cross-discipline training, clearer communication with families, and a refreshed clubhouse. On-snow training starts in December, with a ski-athon and festival presence planned.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_1e79501b-a444-4012-bcc4-d993e7b994da.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/48/f48664cd-675f-4eea-a4c0-5da978a61b23/6af755b2778da.image.jpg",
    imgHiRes: true
  },
  {
    title: "Mountain League champs",
    source: "Telluride Times",
    date: "November 12, 2026",
    firstSeen: "2026-11-12",
    newsTopic: "community",
    copy: "Norwood's Mavericks football program wrapped up an 8-2 season and a second straight state playoff appearance under coach Brad Campbell, losing a close one to Front Range Christian 32-30. Campbell also picked up a Denver Broncos coach of the week honor, nominated through CHSAA for how he and his staff run a clean, competitive program.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_e2603e9c-9fcf-4ff4-aedf-0db4b293e310.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/56/356f9558-bc8d-4b4a-a42e-4196f7f80c4b/6af1c042adcb7.image.jpg",
    imgHiRes: true
  },
  {
    title: "County discusses housing mitigation impact fee",
    source: "Telluride Times",
    date: "November 14, 2026",
    firstSeen: "2026-11-15",
    newsTopic: "education",
    copy: "San Miguel County commissioners and planners met to review three possible changes to the unincorporated county's affordable housing impact fee, which applies to new residential construction within the R-1 School District. All three options would adjust the exemption threshold and graduated mitigation rates, which currently run 18–90% of a $1,112-per-square-foot market gap figure. Some locals and one commissioner raised concerns that the fees are pricing out full-time residents looking to build free-market homes.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_7af836c2-160e-4635-ab2c-d00c9f4759e0.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/0c/b0cd5a5f-ac31-4879-a162-41cd8b2cd2f7/6af61466ddb84.image.jpg",
    imgHiRes: true
  },
  {
    title: "A community-wide effort to help residents thrive",
    source: "Telluride Times",
    date: "November 14, 2026",
    firstSeen: "2026-11-14",
    newsTopic: "education",
    copy: "San Miguel County has just 40 behavioral health providers for 7,000-plus residents, and local surveys show 74% of respondents have been directly affected by someone's substance use. Telluride High School students report binge drinking and marijuana use well above state averages. The county is now updating its behavioral health strategic plan through a collaborative process involving several new work groups.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_b8b30502-5f97-4ffc-8a9e-0fad266a25e6.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/f4/2f45c9b2-ae17-4472-aef7-1866ef201bf8/6af7667a97409.image.jpg",
    imgHiRes: true
  },
  {
    title: "Ah Haa School fellowship offers art outside the classroom",
    source: "Telluride Times",
    date: "November 13, 2026",
    firstSeen: "2026-11-14",
    newsTopic: "arts-culture",
    copy: "Ah Haa School for the Arts is accepting applications through November 30 for its Teen Fellowship, open to high schoolers across the San Miguel Watershed. The 16-week program runs January through May, pairing fellows with local artist mentors to develop independent projects that culminate in a gallery exhibition. Now in its third year, the program is funded by Ah Haa with additional fundraising by the fellows themselves.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_89f6b011-2f00-4a80-8394-5daef2d3bf28.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/a6/6a64449e-ee88-4a55-afd8-014a7d606cc7/6af49be95f300.image.jpg",
    imgHiRes: true
  },
  {
    title: "A tremendous experience",
    source: "Telluride Times",
    date: "November 13, 2026",
    firstSeen: "2026-11-13",
    newsTopic: "community",
    copy: "Norwood's Hunter Johnson ran the Class 2A Boys' state cross-country race in Colorado Springs on Oct. 31, finishing 62nd out of 145 runners with a time of 18:46.5 on the Norris-Penrose course.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_982c6473-d202-4a48-b79c-c7a32d594766.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/b2/eb2ca665-946c-4d4a-8fff-7e1ae129bf97/6aee48bcb1ee5.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride Rewind",
    source: "Telluride Times",
    date: "November 13, 2026",
    firstSeen: "2026-11-13",
    newsTopic: "infrastructure",
    copy: "Highway 145 was completed and the Telluride Chamber was notifying oil companies to update their maps — projections called for 3,000 cars a day once the road got known. Meanwhile in 1976, direct dial came to the 728 exchange, and the Sheridan changed hands with new partners promising restaurant improvements while keeping the bar mostly as it was.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_0bae94c9-6ca9-47ff-b2ce-139fb33cd61d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/4e/b4e52673-3793-4a8b-a123-b1289f309b78/6af1d46b641c9.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telski appeals dismissed lawsuit against Fee, Prohaska, Wisor",
    source: "Telluride Times",
    date: "November 13, 2026",
    firstSeen: "2026-11-13",
    newsTopic: "recreation",
    copy: "Telski's lawsuit against three former local officials — dismissed in August — is now heading to the Colorado Court of Appeals after Telski filed an appeal in October. The defendants have also filed for attorney fees, which Telski is contesting, questioning rates and work it says falls outside direct case defense. The legal back-and-forth over the ski patrol strike-era purchase offer continues to grind on.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_058213a9-59a7-4b22-aeeb-f365acc63082.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/8c/88cb9c2a-1684-47be-a7ba-8d4d3602b630/6af3bdd1af9f6.image.jpg",
    imgHiRes: true
  },
  {
    title: "Gathering around the communal table once more",
    source: "Telluride Times",
    date: "November 12, 2026",
    firstSeen: "2026-11-12",
    newsTopic: "education",
    copy: "Alpine Chapel's free Thanksgiving sit-down dinner returns Nov. 21, 5–7 p.m., at Telluride High School Cafeteria after years of Covid-era takeout. No reservations, all welcome — catered turkey dinner plus live music, games, and a dessert bar.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_eeeb680d-fcb5-4367-958c-26b857b358b0.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/31/931e9413-0ccf-4597-bb7d-fc050bc0a1f5/6af501c0c1424.image.jpg",
    imgHiRes: true
  },
  {
    title: "Storytelling and poetry with locals Craig Childs and Daiva Česonis",
    source: "Telluride Times",
    date: "November 12, 2026",
    firstSeen: "2026-11-12",
    newsTopic: "arts-culture",
    copy: "Craig Childs and his wife Daiva Česonis — both living near Norwood — are bringing an evening of storytelling and poetry to Wilkinson Public Library's magazine room Tuesday, Nov. 17 at 5:15 p.m. Childs is a 16-book author and John Burroughs Medal winner; Česonis is a former San Miguel County poet laureate with deep Telluride roots. Free, all ages, and open-mic friendly — the prompt this month is \"Quiet.\"",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_6a62cce7-264a-4631-b246-d9ab86ca088a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/a8/9a8d009b-33c6-4328-be12-55a10a318ecb/6aee4ef7e8811.image.jpg",
    imgHiRes: true
  },
  {
    title: "Uncompahgre Medical Center expands access to addiction treatment",
    source: "Telluride Times",
    date: "November 12, 2026",
    firstSeen: "2026-11-12",
    newsTopic: "health",
    copy: "Federal grants are bringing expanded addiction treatment to San Miguel County and the West End, with Uncompahgre Medical Center, Telluride Regional Medical Center, and Basin Clinic all receiving funding through Colorado's Rural Health Transformation Program. Services include specialist consultations, telehealth, monthly in-person visits, and free naloxone kits. A peer support specialist will also be available at UMC at no cost to patients.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_6c5692f4-8c6e-4e67-8a45-ac9be42088a9.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/02/10257dc4-fccf-428f-90d9-4b0463d859a0/6aee3f4ae1c97.image.png",
    imgHiRes: true
  },
  {
    title: "Upcoming youth events",
    source: "Telluride Times",
    date: "November 12, 2026",
    firstSeen: "2026-11-12",
    newsTopic: "government",
    copy: "Busy week for local kids: talent show and middle school dance on the 12th, state football quarterfinals and basketball games through the week, and winter sports practice kicking off the 16th. Jacob Lukaszewski plays The Livery on the 13th. School board meets the 18th.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_b0f26baf-ea34-4473-8033-8d523d621412.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/25/f25d43e3-ebe4-48b4-a322-1460b4927628/6aee4b663d26c.image.png",
    imgHiRes: true
  },
  {
    title: "The kestrel is some kind of storyteller",
    source: "Telluride Times",
    date: "November 12, 2026",
    firstSeen: "2026-11-12",
    newsTopic: "community",
    copy: "Kestrels — North America's smallest falcon — are a regular sight along the Western Slope's pastures, orchards, and desert margins. The male sports blue-gray wings; the female, reddish brown — both marked by rusty backs and dark facial stripes. Small enough to miss on a fence wire until they move.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_16557668-75cf-4439-828a-10af6665d784.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "SMPA’s proposed rate increase meets needs in challenging situation",
    source: "Telluride Times",
    date: "November 12, 2026",
    firstSeen: "2026-11-12",
    newsTopic: "public-safety",
    copy: "SMPA is proposing a rate increase taking effect Dec. 15, driven by rising wholesale power costs, insurance, equipment, and expanded wildfire mitigation work. For most residential members, the monthly access charge would rise $9 to $42, with on-peak rates climbing to 31¢/kWh. The board votes Nov. 17 at 9 a.m. via Zoom — open to the public.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_d1e9175b-d273-4c4b-8ef7-9e80fc9d5ac4.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/04/e0475813-7cac-4852-bf1d-bce96f209c5f/6af221d489efa.image.jpg",
    imgHiRes: true
  },
  {
    title: "Barthold Lichtenbelt joins Citizens State Bank board of directors",
    source: "Telluride Times",
    date: "November 12, 2026",
    firstSeen: "2026-11-12",
    newsTopic: "government",
    copy: "Barthold Lichtenbelt, a retired NVIDIA vice president with over 20 years in graphics and AI software, has joined the Citizens State Bank board. He and his wife Cat have deep roots across Ouray and San Miguel counties, known locally for founding the Ouray County Response Fund and helping Swiss Village Mobile Home Park residents gain land ownership.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_61ba937a-bf69-4e50-aad8-9164d06182a8.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/7a/67ab6b15-28b6-4652-b277-a37e8edefae3/6af1d18c9d6d2.image.png",
    imgHiRes: true
  },
  {
    title: "Get dialed for winter: avalanche education returns to Telluride",
    source: "Telluride Times",
    date: "November 12, 2026",
    firstSeen: "2026-11-12",
    newsTopic: "education",
    copy: "Telluride Mountain Club's Peter Inglis Avalanche Education Fund is accepting scholarship applications through Dec. 31 for residents of five surrounding counties. Four Backcountry Chats are planned at the library this winter, starting Dec. 10. First one covers snowpack, local radio systems, and SAR communication.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_42ea4081-c71b-4b6f-a649-bc2080fa7281.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/8b/68bb51b7-7627-41c8-9069-0ad2b8c278ab/6af1e4a590362.image.jpg",
    imgHiRes: true
  },
  {
    title: "Pups and pickup trucks",
    source: "Telluride Times",
    date: "November 12, 2026",
    firstSeen: "2026-11-12",
    newsTopic: "community",
    copy: "Around 100,000 dogs die each year from falling or jumping out of pickup truck beds — from fractures, trauma, or getting hit by other vehicles. Secure crates help but still carry risks. The safest spot for a dog is inside the cab.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_cf4f14dc-ba09-4c76-82bb-ff958ca5a41b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/7c/37cfd853-b51c-4f75-bc5f-d45796caaaa3/6af1ebf24b687.image.jpg",
    imgHiRes: true
  },
  {
    title: "Local governments meet to discuss big regional projects",
    source: "Telluride Times",
    date: "November 12, 2026",
    firstSeen: "2026-11-12",
    newsTopic: "housing",
    copy: "Officials from Telluride, Mountain Village, San Miguel County, Norwood, and Ophir met Nov. 9 to swap updates on regional projects. Big items included Mountain Village's 49-unit workforce housing plan in Ilium (Phase 1 groundbreaking targeted fall 2027), a future regional wastewater plant also eyed for Ilium, and Telluride's Canyonlands and Shandoka housing projects moving through approvals.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_be4a3c6b-7f35-4484-a65b-3961ed0f082a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/b5/3b57f3d8-0644-4ca0-856c-2c3bf5517887/6af36f9065492.image.jpg",
    imgHiRes: true
  },
  {
    title: "Golden hours",
    source: "Telluride Times",
    date: "November 12, 2026",
    firstSeen: "2026-11-12",
    newsTopic: "recreation",
    copy: "A solo evening mountain bike ride on a new desert trail near town — winding through junipers, red dirt, and rimrock as the sun dropped. Well-built singletrack, good light, nobody else around. Some rides just land right.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_fcf5d513-065e-43a4-adb8-a3be927f2db4.html",
    img: "",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "New regulations prepare County for natural resources development",
    source: "Telluride Times",
    date: "November 12, 2026",
    firstSeen: "2026-11-12",
    newsTopic: "community",
    copy: "San Miguel County wrapped up seven years of work on Oct. 21, passing final regulations covering five natural resource categories — solar, mining, forestry, oil and gas, and deep geothermal. The rules are meant to balance development with protecting land, water, wildlife, and community character. Planning Director Kaye Simonson retired at the close of the project.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_77edfb33-89bf-4734-9a2e-bdfa40ba2390.html",
    img: "",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Letters to the editor",
    source: "Telluride Times",
    date: "November 12, 2026",
    firstSeen: "2026-11-12",
    newsTopic: "education",
    copy: "Three letters this week: a resident crediting the town's Green Grant program with helping replace decades-old windows and cutting heat loss; a student raving about her Early Intervention OT internship through the THS Mentorship Program; and another student who shadowed the pastor at Telluride Alpine Chapel.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_768123d9-e5bc-4298-8537-f15dde2eadff.html",
    img: "",
    letterAuthor: "Sincerely, Bridger Barret",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "American jurors",
    source: "Telluride Times",
    date: "November 12, 2026",
    firstSeen: "2026-11-12",
    newsTopic: "community",
    copy: "Juries are being asked to weigh increasingly complex factors — trauma histories, mental illness, drug effects, even genetic predispositions — when deciding criminal responsibility. Two cases, Lindsay Clancy and Christa Pike, show how murky that line has become. Some are asking whether verdicts like \"guilty but insane\" might help juries navigate cases that current options don't fit cleanly.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_5636bc3f-ec18-4584-8c38-22773bb78428.html",
    img: "",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Legals and Public Notices for Nov. 12-18, 2026",
    source: "Telluride Times",
    date: "November 12, 2026",
    firstSeen: "2026-11-12",
    newsTopic: "infrastructure",
    copy: "A foreclosure sale is scheduled for December 17, 2026 at the San Miguel County Public Trustee's office for a Norwood property at 53 East Homestead Road, with an outstanding balance of roughly $172,000. A second foreclosure involves a San Miguel County property held by Alpine Bank, with about $30,000 remaining on the loan.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/legals/article_88be68bb-ea46-4015-9b5f-01e0e2540cfc.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Bright Futures receives grant award to support perinatal families",
    source: "Telluride Times",
    date: "November 11, 2026",
    firstSeen: "2026-11-12",
    newsTopic: "health",
    copy: "Bright Futures landed a 12-month behavioral health grant from the Colorado Perinatal Care Quality Collaborative to build out screening and referral networks for families from pregnancy through a baby's first year. Monthly in-person support groups launch in December in Telluride and Ridgway, with an online option available. Isolation is a recognized challenge out here, and the grant targets that alongside mental health, basic needs, and safety screenings.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_fb9248de-20b3-4db0-93f6-17913c762be7.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/d1/dd13c1eb-3da6-40de-a356-505ce6fb9093/6aef52306d858.image.png",
    imgHiRes: true
  },
  {
    title: "Telluride’s volleyball season ends on Eastern Plains",
    source: "Telluride Times",
    date: "November 11, 2026",
    firstSeen: "2026-11-11",
    newsTopic: "community",
    copy: "Telluride's volleyball season ended Nov. 6-7 at regionals in Wiggins, where the Lady Miners fell to top-seeded Wiggins in three sets before losing a five-set thriller to Ascent Classical Academy-Northern Colorado 17-15 in the decisive fifth. It was the first time in four playoff appearances THS had won a set. They finished 11-14 on the year.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_5432bf3c-d483-44b5-b5e0-9e9ec9bd7563.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/0d/f0d78fbe-6c9d-4311-b20d-f2e1cea071ee/6af23c2a85783.image.jpg",
    imgHiRes: true
  },
  {
    title: "Great deals for steep slopes at annual KOTO event",
    source: "Telluride Times",
    date: "November 10, 2026",
    firstSeen: "2026-11-10",
    newsTopic: "recreation",
    copy: "KOTO's annual ski swap runs Nov. 13–16 at the Wilkinson Library garage — drop off Friday, shop Saturday 10–4. Now in its third decade, it's a solid fundraiser for the station and a real way to find quality gear without paying resort-town retail prices. New this year: sellers can pre-list items at MySkiSwap.com.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_90524283-8c15-4f14-a0fc-67da62b7ffbb.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/d5/ed550b27-2fa0-4c4c-9890-419dde4eb074/6aed1d9f135b3.image.jpg",
    imgHiRes: true
  },
  {
    title: "Chair 7 coalition shares concerns about Carhenge, Shandoka projects",
    source: "Telluride Times",
    date: "November 10, 2026",
    firstSeen: "2026-11-10",
    newsTopic: "housing",
    copy: "Neighbors near the base of Chair 7 have formed a 200-member nonprofit coalition raising concerns about proposed variances that would push Carhenge from 151 to 220-230 units and balloon permitted square footage well beyond current limits. Members largely support affordable housing and childcare but want smaller scale and preserved open space. Town Council voted 3-1 in September to uphold P&Z's lot-consolidation approval; full development review is still ahead.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_2eadc4c2-f0d0-4186-bbde-0a5cba04aa48.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/ac/eac779d3-8cc8-4d9c-b146-5a862f1f41be/6aea3ded244bf.image.png",
    imgHiRes: true
  },
  {
    title: "After two wins at State, the Miners are moving on",
    source: "Telluride Times",
    date: "November 9, 2026",
    firstSeen: "2026-11-09",
    newsTopic: "community",
    copy: "Telluride's soccer Miners are through to the Class 2A Final Four after back-to-back home wins — 6-1 over Loveland Campion and 4-2 over Vanguard Classical. The No. 1 seed faces St. John Paul the Great on Nov. 11 in Westminster, with a potential championship matchup against rival Crested Butte still on the table.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_31a9c6e0-3689-4de8-b340-b33ba37f8156.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/ce/acedbd0f-20c2-4933-bef1-121395411674/6af2377a99908.image.jpg",
    imgHiRes: true
  },
  {
    title: "The festival tapestry of Telluride: Is a 50-year legacy unraveling?",
    source: "Telluride Times",
    date: "November 9, 2026",
    firstSeen: "2026-11-09",
    newsTopic: "arts-culture",
    copy: "Telluride's festival scene is hitting a rough patch — ticket sales were down across the board in summer 2026, continuing a three-year slide after the post-Covid boom. Mushroom Festival saw a 38% drop and laid off its three full-time staff. A new Festival and Special Event Alliance has formed to draw attention to what organizers are calling a real threat to a 50-year legacy.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_d38ea20e-a280-4051-a365-885e2d413887.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/30/230f93da-7cb4-4cc2-b9f4-970205e117f9/6aef13276f934.image.jpg",
    imgHiRes: true
  },
  {
    title: "Work begins on Mill Creek PUD",
    source: "Telluride Times",
    date: "November 8, 2026",
    firstSeen: "2026-11-09",
    newsTopic: "land-use",
    copy: "Ground is being broken on the Mill Creek PUD west of Telluride — a project approved back in 2016 that will bring 20 single-family lots to a 121-acre parcel north of the Spur. Infrastructure work runs through spring 2029, with a 3.2-acre piece set aside for up to 72 affordable units once the first lot sells.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_e5c8aa7f-8778-4458-9ffa-9b6fe1330736.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/49/a4960fc1-5d07-4313-8e39-4a4aa8d7a6b3/6aee421a1d65b.image.png",
    imgHiRes: true
  },
  {
    title: "A festival for the town where the theme is joy",
    source: "Telluride Times",
    date: "November 8, 2026",
    firstSeen: "2026-11-08",
    newsTopic: "arts-culture",
    copy: "Raíces Sin Fronteras hosts its fourth annual Semana de Bienestar — Wellness Week — in Telluride, Nov. 12–15, timed for the off-season when year-round residents are still here. Free, bilingual, and open to all ages, this year's theme is alegría — joy — with events ranging from dance and wellness workshops to a Mayan bonfire ceremony. Around 500 community members participated last year.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_463e28d1-d4d5-4134-87a3-5553416f7e46.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/36/a36fd091-88de-44d4-a0dd-c3ba96e2d1a9/6aee58578f832.image.jpg",
    imgHiRes: true
  },
  {
    title: "Local Employers Invited to Apply for Employee Housing Master Leases",
    source: "Town of Telluride",
    date: "October 23, 2026",
    newsTopic: "housing",
    copy: "(October 22, 2026) – The Telluride Housing Authority (THA) is offering master leases on five apartments at the new Virginia Placer IIA building and two rooms at the Telluride Boarding House to local businesses and organizations.",
    href: "https://www.telluride.gov/CivicAlerts.aspx?aid=408",
    img: ""
  },
  {
    title: "Deed-Restricted Housing Lottery Applications Now Available for Spruce House H",
    source: "Town of Telluride",
    date: "October 22, 2026",
    newsTopic: "housing",
    copy: "(October 22, 2026) - The Town of Telluride and the San Miguel Regional Housing Authority (SMRHA) opened applications today for a deed-restricted homeownership lottery for Spruce House H at 226 East Pacific Avenue, Unit H, Telluride, Colorado, 81435.",
    href: "https://www.telluride.gov/CivicAlerts.aspx?aid=407",
    img: ""
  },
  {
    title: "Sign Up for the 2026 Turkey Trot!",
    source: "San Miguel County",
    date: "November 5, 2026",
    newsTopic: "community",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1424",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14909"
  },
  {
    title: "Black Bear and Imogene Passes Closed for the Winter",
    source: "San Miguel County",
    date: "November 3, 2026",
    newsTopic: "community",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1423",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14906"
  },
  {
    title: "Fairground Facilities Closed Until Further Notice",
    source: "San Miguel County",
    date: "November 20, 2026",
    newsTopic: "community",
    copy: "Due to unforeseen circumstances, the San Miguel County Fairground facilities will be closed until further notice, beginning Friday, November 6th.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=552",
    img: ""
  },
  {
    title: "Treasurer's Office Closed 11/11 - 11/13",
    source: "San Miguel County",
    date: "November 12, 2026",
    newsTopic: "community",
    copy: "The Treasurer's office will be closed Weds 11/11 - Fri 11/13.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=553",
    img: ""
  },
  {
    title: "Black Bear and Imogene Passes Closed for the Winter",
    source: "San Miguel County",
    date: "November 3, 2026",
    newsTopic: "community",
    copy: "Due to changing weather conditions and the onset of winter, Imogene and Black Bear Passes are now officially closed for the season.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=551",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14906"
  },
  {
    title: "Ridgway Bank Building Officially Added to the National Register of Historic Places",
    source: "Town of Ridgway",
    date: "October 9, 2027",
    firstSeen: "2026-10-09",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Bank-Building-PR-2026-10-09.pdf",
    img: ""
  },
  {
    title: "Ridgway Reminds Pet Owners of Responsibilities",
    source: "Town of Ridgway",
    date: "October 6, 2027",
    firstSeen: "2026-10-06",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway-reminds-pet-owners-of-responsibilities-2026-10-06.pdf",
    img: ""
  },
  {
    title: "Notice and Call of 2027 Fiscal Year Budget Meetings of the Ridgway Town Council - Notice dated September 10, 2026",
    source: "Town of Ridgway",
    date: "November 21, 2026",
    firstSeen: "2026-09-29",
    newsTopic: "government",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Budget-meetings-notice-2026.pdf",
    img: ""
  },
  {
    title: "Town of Ridgway, City of Ouray, and Ouray County Establish New Three-Year Affordable Housing Goals",
    source: "Town of Ridgway",
    date: "November 21, 2026",
    firstSeen: "2026-10-21",
    newsTopic: "housing",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Prop-123-Opt-In-Unit-Count-NewsRelease_FINAL-10.20.26-acc.pdf",
    img: ""
  }
];

const KOTO_NEWSCASTS = [
  {
    title: "Newscast 11-20-26",
    source: "KOTO Community Radio",
    date: "November 21, 2026",
    newsTopic: "infrastructure",
    copy: "Telluride and Mountain Village Move Towards Sewer Authority; Geothermal Energy Is Piping Hot in Rico; Cat Movie Fisher with Risho Unda",
    href: "https://koto.org/news/newscast-11-20-26/"
  },
  {
    title: "Newscast 11-19-26",
    source: "KOTO Community Radio",
    date: "November 20, 2026",
    newsTopic: "public-safety",
    copy: "Forest Service Acquires Lizard Head Property; West End Roundup with the San Miguel Basin Forum; GMUG Looks at Gold Mountain Fire Recovery",
    href: "https://koto.org/news/newscast-11-19-26/"
  },
  {
    title: "Newscast 11-18-26",
    source: "KOTO Community Radio",
    date: "November 19, 2026",
    newsTopic: "housing",
    copy: "Telluride Approves its 2027 Budget; Hospital District Considers Partnership with CommonSpirit; County Examines Housing Mitigation Fee",
    href: "https://koto.org/news/newscast-11-18-26/"
  },
  {
    title: "Newscast 11-16-26",
    source: "KOTO Community Radio",
    date: "November 17, 2026",
    newsTopic: "housing",
    copy: "Telski Delays Opening Day; Local Communities Grapple with Affordable Housing Requirements; Coming Up Next, Telluride",
    href: "https://koto.org/news/newscast-11-16-26/"
  },
  {
    title: "Newscast 11-13-26",
    source: "KOTO Community Radio",
    date: "November 14, 2026",
    newsTopic: "government",
    copy: "On this week’s Regional Roundup, we hear about an abortion ban recently approved by voters in Idaho. Then, we continue our election coverage with a look at how the climate crisis figured into this year’s midterms. We head to Arizona, where historic flooding didn’t stop Diné voters from casting their ballots. Then we travel to Montrose, Colorado, fo",
    href: "https://koto.org/news/newscast-11-13-26/"
  },
  {
    title: "Newscast 11-12-26",
    source: "KOTO Community Radio",
    date: "November 13, 2026",
    newsTopic: "community",
    copy: "West End Roundup with the San Miguel Basin Forum; Kaye Simonson Retires as County Planning Director; Songs from the San Miguel Take to the Stage",
    href: "https://koto.org/news/newscast-11-12-26/"
  },
  {
    title: "Newscast 11-11-26",
    source: "KOTO Community Radio",
    date: "November 12, 2026",
    newsTopic: "education",
    copy: "Telluride School Superintendent John Pandolfo Announces Retirement; CO 150, US 250, BG 52; Cat Movie Fisher with Risho Unda",
    href: "https://koto.org/news/newscast-11-11-26/"
  },
  {
    title: "Newscast 11-9-26",
    source: "KOTO Community Radio",
    date: "November 10, 2026",
    newsTopic: "community",
    copy: "Remembering Christel Leimgruber; County Discusses Flooding Support",
    href: "https://koto.org/news/newscast-11-9-26/"
  }
];

const KOTO_FEATURED_STORIES = [
  {
    title: "Remembering Christel Leimgruber",
    source: "KOTO Community Radio",
    date: "November 10, 2026",
    newsTopic: "recreation",
    copy: "Telluride legend Christel Leimgruber passed away in October. An local icon, her generosity, laugh, and joy made Leimgruber’s the place to be for après ski.",
    href: "https://koto.org/news/remembering-christel-leimgruber/"
  }
];

// San Miguel Basin Forum (West End — Norwood, Nucla, Naturita, Paradox).
// Populated by scripts/content-refresh.js → pullSmbForum() every 6 hours.
// Schema: { title, source: 'San Miguel Basin Forum', sourceKey: 'smb',
//   date, firstSeen, newsTopic, copy, href, img }.
//
// Date model (2026-05-26): "Publish date" on the site = the day WE
// first observe the article on SMBF (`firstSeen`), NOT the article's
// own byline date. SMBF is print-first and stories appear in the
// print edition well before they're posted online, so trusting the
// online byline would understate freshness. The displayed `date`
// field mirrors `firstSeen` in human form.
//
// Carry-forward in pullSmbForum() preserves entries whose firstSeen
// is within the 35-day window even when they roll off SMBF's short
// front-page rotation.
//
// ── Seeded for first-deploy ──
//
// The top two entries are the two articles the user wanted to feature
// as the launch pair (today = 2026-05-26).
//
// The remaining 23 entries are the OTHER articles currently on the
// SMBF landing page, stamped with sentinel firstSeen='2025-01-01'.
// They exist solely so that on the bot's first run after deploy,
// pullSmbForum() recognises them as "already known" and DOESN'T
// flood the Local News tab by stamping all 25 articles with today's
// date. Local News applies its own 35-day-firstSeen filter, so these
// sentinel-dated entries never display — they just block re-detection.
//

// As genuinely-new articles appear at the top of the SMBF landing
// page over the coming weeks, the bot will add them with firstSeen=today
// and the array will naturally shed the sentinels via the same logic.
const SMB_FORUM_ARTICLES = [
  {
    title: "Cell tower building permit, EMF testing approved",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "November 18, 2026",
    firstSeen: "2026-11-18",
    dateSource: "article",
    newsTopic: "land-use",
    copy: "Nucla trustees voted 3-2 to approve a building permit for the T-Mobile cell tower site and 3-2 to spend $11,750 on EMF radiation testing. Questions lingered over the original lease contract's Section 14 language and whether the $800/month lease rate — cited by one resident as far below what other towns receive — was adequate.",
    claudeSummary: true,
    href: "https://www.sanmiguelbasinforum.com/stories/cell-tower-building-permit-emf-testing-approved,136357",
    img: ""
  },
  {
    title: "Pentz reflects on PVS, grateful for school sale and Redd family",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "November 11, 2026",
    firstSeen: "2026-11-11",
    dateSource: "article",
    newsTopic: "education",
    copy: "Paradox Valley School closed in 2023 after years of challenges, but the property stayed in community hands — the Redd family donated funds for nonprofit UI Charitable to purchase the campus and hold it as a charitable asset. Future uses being discussed include a community hub, classes, recreation, emergency services, and possibly a school again.",
    claudeSummary: true,
    href: "https://www.sanmiguelbasinforum.com/stories/pentz-reflects-on-pvs-grateful-for-school-sale-and-redd-family,135769",
    img: ""
  },
  {
    title: "Art at the Apothecary announces community art events",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "November 11, 2026",
    firstSeen: "2026-11-11",
    dateSource: "article",
    newsTopic: "arts-culture",
    copy: "Art at the Apothecary in Nucla has a craft fair Nov. 28 (10 a.m.–4 p.m.) and Elfin Eve on Dec. 3, featuring local makers selling quilts, baskets, crocheted goods, 3-D printing, tinctures, and more. Quilting classes are set to resume in January.",
    claudeSummary: true,
    href: "https://www.sanmiguelbasinforum.com/stories/art-at-the-apothecary-announces-community-art-events,135771",
    img: "https://zeta.creativecirclecdn.com/smb/original/20261111-095952-4aa-F2%20-%20photo%20option.jpg"
  },
  {
    title: "Norwood celebrates league championship after Campbell named Broncos coach of the week",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "November 4, 2026",
    firstSeen: "2026-11-04",
    dateSource: "article",
    newsTopic: "education",
    copy: "Norwood Mavericks coach Brad Campbell was named Denver Broncos High School Tackle Football Coach of the Week, recognized for his team's on-field play and sportsmanship. The Mavericks then won the league championship 28-24 over Sanford — their first title in roughly 10 years. Now 8-1, Norwood hosts Front Range Christian Saturday at 1 p.m.",
    claudeSummary: true,
    href: "https://www.sanmiguelbasinforum.com/stories/norwood-celebrates-league-championship-after-campbell-named-broncos-coach-of-the-week,134927",
    img: "https://zeta.creativecirclecdn.com/smb/original/20261103-091444-060-F2%20-%20front%20page%20pic.jpeg"
  }
];

// Hand-curated featured items for the Local News page. The bot never rewrites
// this array (it only manages TELLURIDE_TIMES_ARTICLES / KOTO_* / SMB_*), so a
// pinned letter or feature here is stable. local-news.html prepends these and
// honors `featured: true`. Set `isLetter: true` to get the Letter-to-the-Editor
// treatment (byline + logo) while still using a custom `img` as the hero.
//
// Standing rule (Morgan, 2026-08-06): a FEATURE lasts only until the morning
// review, where the next one is picked. `expires: "YYYY-MM-DD"` = "retire at
// 6:30 AM MT on this date" (NOT midnight), so a story featured today gets
// expires = tomorrow and hands off cleanly at the next morning review. Longer
// runs only when Morgan directs one. Non-featured pins (e.g. the standing
// letter below) may omit `expires` and run until hand-removed.
//
// 6:30 rather than 6:00 because content-refresh commits land 1.5–3h after their
// cron fires — the morning batch shows up ~5:30am MT, so 6:30 guarantees the
// review is picking from today's news, not yesterday's.
//
// Do NOT re-feature a story that has already had its day — once `featured` is
// dropped it stays dropped; the review finds something new.
const LOCAL_NEWS_FEATURED = [
  {
    title: "Herding unicorns",
    source: "Telluride Times",
    sourceKey: "ttimes",
    date: "November 5, 2026",
    summary: "John Metzger writes that Telluride is a one-of-a-kind unicorn, livable for the few but unaffordable for the workers who keep it humming, and that rural stars must align for small towns to thrive. State and federal money is starting to flow into the region through Enterprise Zone expansions and a $50B rural health program, a new emergency hub is under construction outside Telluride, and Norwood is planning a new school and a reimagined medical center. Coordination between districts remains the stubborn obstacle.",
    href: "https://www.telluridenews.com/norwood_post/article_fd7f8dfa-b21f-48c8-a4aa-5a9feb679e90.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/05/b05007ac-70f0-47ba-abc9-1844981e5de0/6ae4e34f633d2.image.jpg",
    category: "Opinion",
    newsTopic: "health",
    featured: true,
    expires: "2026-11-08"   // Morgan directed a three-day run: Nov 5–7, off at the Sun 11/8 review
  },
  {
    title: "Does platted density mean anything in town planning?",
    source: "Telluride Times",
    sourceKey: "ttimes",
    date: "October 20, 2026",
    summary: "A letter to the editor raises pointed questions about the Carhenge/Backman Village project after the Sept. 30 Town Council meeting upheld a lot-line vacation. The writer notes the platted density shows 176 units — or 151 plus commercial space — yet planning has advanced a 230-unit proposal, with over $1M reportedly spent on consultants. She's asking what legal weight a recorded plat actually carries if staff can set it aside during project review.",
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_085bdee6-f590-475f-93af-399bea9a04de.html",
    category: "Opinion",
    newsTopic: "housing",
    isLetter: true,
    letterAuthor: "Madelaine Whiteman",
    featured: true,
    expires: "2026-10-31"   // Morgan directed a three-day run: Oct 28–30, off at the Sat 10/31 review
  },
  {
    title: "Another view of housing",
    source: "Telluride Times",
    sourceKey: "ttimes",
    date: "September 15, 2026",
    summary: "In a letter to the editor, Madelaine Whiteman contrasts Telluride's single-plan approach to its Town-led workforce housing project with San Rafael, California, where five developers competed for an affordable-housing site and three finalists presented distinct proposals on cost, density, and public benefit. She asks why Telluride taxpayers are being asked to move forward on a Town-developed project without competing bids or a known final cost, and questions whether housing development, management, and rental should be a core municipal responsibility at all.",
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_9823f845-c4a0-4cf8-afe5-28cb216da161.html",
    category: "Opinion",
    newsTopic: "housing",
    isLetter: true,
    letterAuthor: "Madelaine Whiteman",
    featured: true,
    expires: "2026-09-17"
  },
  {
    title: "New medicine for a vulnerable economy",
    source: "Telluride Times",
    sourceKey: "ttimes",
    date: "September 3, 2026",
    summary: "San Miguel County has joined Colorado's Region 10 Enterprise Zone, unlocking state grants and tax credits aimed at shoring up the region's economy. The designation is paired with a push to better coordinate emergency medical care across Telluride, Norwood, Ridgway, and other remote communities, including satellite clinic networks and shared triage protocols. Dr. Kim Hewson outlines a strategy for pooling medical resources across town lines rather than each community going it alone.",
    href: "https://www.telluridenews.com/article_443b80a1-ddbc-5133-8843-fc9a06df6359.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/c4/7c456985-867a-50e6-a5e7-715c13382d79/6a994f3985289.image.jpg",
    category: "Health",
    newsTopic: "health",
    featured: true,
    expires: "2026-09-07"   // Morgan directed a longer run: through Sunday 9/6, off at the Monday 9/7 review
  },
  {
    title: "Fire management moonshot",
    source: "Telluride Times",
    sourceKey: "ttimes",
    date: "August 6, 2026",
    summary: "In a guest column, Norwood's John Metzger argues that a half-century of suppress-everything forest policy has left Western timberlands overgrown and primed to burn, and that the fix is industrial-scale thinning paired with utility-grade biomass plants that turn the excess fuel into energy. He points to the 1990s WHIMS defensible-space program -- which stalled on political resistance and thin rural fire budgets -- as the model to revive, and calls for a CCC-style national service corps to do the work.",
    href: "https://www.telluridenews.com/article_c6fb9425-1ec8-5321-969c-ad7808f56cf5.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/84/e849a731-98e2-5067-a168-3729aa39f798/6a745ca4b69ef.image.jpg?crop=766%2C403%2C0%2C11",
    category: "Opinion",
    newsTopic: "public-safety",
    featured: false   // had its run as the feature (Aug 6 – Sep 4); never re-feature
  },
  {
    title: "Stakeholders discuss housing density",
    source: "Telluride Times",
    sourceKey: "ttimes",
    date: "July 19, 2026",
    summary: "San Miguel County's Stakeholder Strategic Roundtable held its sixth meeting July 16, focusing on workforce housing types, zoning density definitions, and density bonus incentives as part of the ongoing land code audit. The county estimates it needs roughly 1,100 housing units by 2030, with nearly half its workers already commuting over 25 miles.",
    href: "https://www.telluridenews.com/news/article_3fa56ff6-1d64-4c3b-b271-0802fcb74db2.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/94/1948eea0-c2e0-49bc-afdc-e5c61414fd91/6a5ac8e016a5b.image.jpg",
    category: "Housing",
    newsTopic: "housing",
    featured: false   // had its run as the feature (Jul 19–Aug 6); never re-feature
  },
  {
    title: "Dry thunderstorms could complicate firefighting efforts",
    source: "Telluride Times",
    sourceKey: "ttimes",
    date: "July 6, 2026",
    summary: "The Gold Mountain Fire near Ouray has grown to nearly 30,000 acres with just 3% containment, while the Ferris Fire near Dolores has reached 50,000 acres at 21% contained. San Miguel County is under an air quality health advisory through at least Tuesday due to smoke. No active fires are currently burning in San Miguel County, which is under Stage 2 fire restrictions.",
    href: "https://www.telluridenews.com/news/article_8e9913c5-3691-468d-a3ae-eaa7ca037c48.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/47/a47d7dfb-9699-46ee-8b6e-87a921969428/6a4c0938939c5.image.jpg",
    category: "Public Safety",
    newsTopic: "public-safety"
  },
  {
    title: "Is Telluride Paradise?",
    source: "Letter to the Editor",
    sourceKey: "letter",
    date: "June 17, 2026",
    summary: "Paradise, California was a beautiful mountain town until the 2018 Camp Fire killed 85 people. Kate Fedack draws a direct comparison to Telluride -- a wildland-urban interface community at the dead end of a box canyon with one primary paved way out -- and asks why dense new development at the canyon's throat is advancing with no public wildfire egress analysis.",
    href: "/Blog%20Posts/is-telluride-paradise/",
    img: "/images/blog/telluride-paradise-fire.jpg",
    category: "Opinion",
    isLetter: true,
    letterAuthor: "Kate Fedack"
  }
];

const BLOG_POSTS = [
  {
    title: "Finding Your Way Around the New Website",
    date: "Oct 30, 2026",
    href: "https://livabletelluride.org/digest/one-off/finding-your-way-around-the-new-website-2026-10-30.html",
    image: "https://livabletelluride.org/assets/newsletters/site-tour-2026-10/menu-government.jpg",
    excerpt: "Livable Telluride Inform · Connect · Engage · Together Finding Your Way Around the New Site, and a New Past Meetings Email October 30, 2026 Quite a few of you dedicated readers have written in since we redesigned the landing page for livabletelluride.org . Most of the notes said some version of the same two things: “I like it,” but “where did such-and-such go?” Fair enough. So this newsletter is a",
    category: "Newsletter",
    source: "one-off"
  },
  {
    title: "Rocket Science Not Required: Making Sense of School District Measure 5A",
    date: "Oct 21, 2026",
    href: "https://livabletelluride.org/digest/one-off/rocket-science-not-required-making-sense-of-school-2026-10-21.html",
    image: "https://livabletelluride.org/assets/newsletters/rocket-science-not-required-making-sense-of-school-2026-10-21/image-1.png",
    excerpt: "  Rocket Science Not Required: Making Sense of School District Measure 5A By Morgan Smith - October 21, 2026 I readily admit there are days when I wonder why I spend time writing these newsletters, and today is one of them! I’m going to dive into the debate over Telluride School District Ballot Measure 5A, even though my brother-in-law, David Lavender, serves on the school board and strongly suppo",
    category: "Newsletter",
    source: "one-off"
  },
  {
    title: "Can the Town Simply Ignore its own Contract?",
    date: "Oct 8, 2026",
    href: "https://livabletelluride.org/digest/one-off/can-the-town-simply-ignore-its-own-contract-2026-10-08.html",
    image: "https://livabletelluride.org/assets/newsletters/can-the-town-simply-ignore-its-own-contract-2026-10-08/image-1.png",
    excerpt: "  Can the Town Simply Ignore Its Own Contract? by Morgan Smith October 8, 2026 In 1979, the Town of Telluride signed a contract with Telco, the owner of Backman Village land. That contract, the recorded plat , and the covenants set the number of residential units that can be built on the lots now called Carhenge, and the total is 157 plus some commercial . The Town’s proposed design for this prope",
    category: "Newsletter",
    source: "one-off"
  },
  {
    title: "The Town Wrote the Rules, and Apparently, They’re for Everyone Else",
    date: "Sep 27, 2026",
    href: "https://livabletelluride.org/digest/one-off/carhenge-rules-2026-09-27.html",
    image: "https://livabletelluride.org/assets/Carhenge/carhenge-site-plan-buildings.jpg?v=20260927",
    excerpt: "On September 30, the Town’s design proposal for Carhenge goes before HARC, and the Town of Telluride remains the applicant, asking the Town of Telluride to approve its development. The Town’s plan now calls for 220 units. The 1979 subdivision agreements that created Backman Village, which the Town signed, allow a maximum of 157. For three months, Backman Village owners have asked the Town one question, and all we hear is crickets.",
    category: "Newsletter",
    source: "one-off"
  },
  {
    title: "To Gondola or Not to Gondola, That Is the Question",
    date: "Sep 10, 2026",
    href: "https://livabletelluride.org/digest/one-off/to-gondola-or-not-to-gondola-that-is-2026-09-10.html",
    image: "https://livabletelluride.org/assets/newsletters/to-gondola-or-not-to-gondola-that-is-2026-09-10/image-1.png",
    excerpt: "The Gondola and the Great Money Question -Morgan Smith, Sept. 10, 2026 The Telluride Times just ran a strong article on the issues surrounding the gondola replacement that is worth a read. As with many things, the process, not the goal, is the problem. I imagine most everyone would love a replacement gondola if someone else has to pay to build and run it. The love of the gondola, however, can star",
    category: "Newsletter",
    source: "one-off"
  },
  {
    title: "The story poles that told the story",
    date: "Aug 24, 2026",
    href: "https://livabletelluride.org/digest/one-off/the-story-poles-that-told-the-story-2026-08-24.html",
    image: "https://livabletelluride.org/assets/newsletters/uploads/2026-08/hero-image-2-1787159212573.png",
    excerpt: "Livable Telluride Shandoka Watch The story poles that told the story By Morgan Smith For months, the proposed redevelopment of the parking area in front of Shandoka existed, as most large public projects do: plans, elevations, presentations, and meeting packets, all readily available. Then the story poles went up, and something changed. Livable Telluride held an online survey from August 15 to Aug",
    category: "Newsletter",
    source: "one-off"
  },
  {
    title: "Last Call on the Shandoka Survey",
    date: "Aug 17, 2026",
    href: "https://livabletelluride.org/digest/one-off/shandoka-survey-2026-08-17.html",
    image: "https://livabletelluride.org/assets/Shandoka/shandoka-story-poles-hero.jpg?v=20260817",
    excerpt: "Last Call on the Shandoka Survey We submit the survey response by noon Tuesday, ahead of Wednesday’s HARC meeting. Your window to comment is closing. Livable Telluride Shandoka Watch Last Call on the Shandoka Survey By Morgan Smith · August 17, 2026 This email is a quick update on our online survey, which has received a great response. Thank you all so far. In light of the HARC meeting on W",
    category: "Newsletter",
    source: "one-off"
  },
  {
    title: "It's Story Time at Shandoka",
    date: "Aug 15, 2026",
    href: "https://livabletelluride.org/digest/one-off/its-story-time-at-shandoka-2026-08-15.html",
    image: "https://livabletelluride.org/assets/Shandoka/shandoka-story-poles.jpg",
    excerpt: "Livable Telluride Inform · Connect · Engage · Together This Week Only It’s Story Time at Shandoka The poles come down on the 21st. Until then, you can stand inside the proposed building and judge it for yourself. By Morgan Smith · August 15, 2026 If you’ve driven past Shandoka this week, you’ve seen it: a thicket of lodgepoles rising out of the parking lot, strung together with orange and yellow f",
    category: "Newsletter",
    source: "one-off"
  },
  {
    title: "It’s Like Déjà VooDoo All Over Again",
    date: "Jul 27, 2026",
    href: "https://livabletelluride.org/digest/one-off/deja-voodoo-2026-07-27.html",
    image: "https://livabletelluride.org/voodoo-timeline/deja-voodoo-hero.jpg",
    excerpt: "VooDoo’s project debt offers a preview of what two much larger projects could cost if Telluride waits again to ask the right questions. When the Telluride Housing Authority approved financing for its VooDoo apartments in December 2022, the vote took less than half an hour. The building’s design had",
    category: "Newsletter",
    source: "livable"
  },
  {
    title: "Speak Up by Noon Wednesday: the Carhenge Subdivision and Backman Village P&Z Meeting",
    date: "Jul 21, 2026",
    href: "https://livabletelluride.org/digest/archive/2026-07-22-weekly.html",
    image: "https://livabletelluride.org/assets/Carhenge/carhenge-lots-aerial.png",
    excerpt: "Livable Telluride Inform Connect Engage Together Speak Up July 23 Hearing Speak Up by Noon Wednesday: the Carhenge Subdivision and Backman Village P Z Meeting By Morgan Smith July 22, 2026 This Thursday, July 23, the Town of Telluride s Planning and Zoning Commission takes up an application that deserves more attention than it s received. It s called the Carhenge Preliminary Large-Scale Subdivisio",
    category: "Newsletter",
    source: "customerio"
  },
  {
    title: "The Carhenge Story Poles Are Going Up. So Are the Questions.",
    date: "Jul 9, 2026",
    href: "https://livabletelluride.org/digest/one-off/the-carhenge-story-poles-are-going-up-so-2026-07-09.html",
    image: "https://livabletelluride.org/assets/Carhenge/carhenge-story-poles-1.jpg",
    excerpt: "The lot is closed, the poles are up, and serious legal and process questions remain unresolved. Livable Telluride Carhenge Watch The Carhenge Story Poles Are Going Up. So Are the Questions. By LT Staff · July 8, 2026 For all of you who use Carhenge for parking regularly, get ready for a wrinkle in your plans. The Town of Telluride has announced that the Carhenge Lot will be closed to parking and v",
    category: "Newsletter",
    source: "one-off"
  },
  {
    title: "When the Town Judges Its Own Projects",
    date: "Jun 30, 2026",
    href: "https://livabletelluride.org/digest/archive/2026-06-30-when-the-town-judges-its-own-projects.html",
    image: "https://livabletelluride.org/assets/newsletters/when-the-town-judges-its-own-projects/70e4c678-537d-d838-1a32-38095e444284.png",
    excerpt: "Apparently, our little newsletter has made a ripple. Possibly even a wave! At the June 25 Planning and Zoning meeting in Telluride , Town Attorney Kevin Geiger called out our last newsletter for “misrepresentation.” He said the recent Colorado Supreme Court decision in the “ Butcher Creek ” PUD case",
    category: "Newsletter",
    source: "mailchimp"
  },
  {
    title: "The Colorado Supreme Court's \"Butcher Creek\" Decision",
    date: "Jun 17, 2026",
    href: "https://livabletelluride.org/digest/archive/2026-06-17-butcher-creek-decision.html",
    image: "https://firebasestorage.googleapis.com/v0/b/telluride-gov-hub.firebasestorage.app/o/newsletter-images%2Fbutcher-creek-pud-lot-a.jpg?alt=media&token=48edbaf5-841d-42c8-abea-6beafedc3381",
    excerpt: "The Colorado Supreme Court's ruling in Kavanaugh v. Telluride Locals Coalition holds that a PUD agreement functions like a contract -- it can't be amended without following its own terms and the owner consent they require. We break down what the \"Butcher Creek\" decision means and how it could shape the pending fights over Backman Village/Carhenge and Diamond Ridge/Aldasoro.",
    category: "Newsletter",
    readTime: "4 min",
    source: "mailchimp"
  },
  {
    title: "Come to the Livable Telluride Kickoff Event",
    date: "Jun 9, 2026",
    href: "https://livabletelluride.org/digest/archive/2026-06-09-livable-telluride-kickoff-event.html",
    image: "https://livabletelluride.org/assets/newsletters/livable-telluride-kickoff-event/inline-1.jpg",
    excerpt: "Livable Telluride Kickoff Event Join Us for the Livable Telluride Kickoff Event Please join us tomorrow (Wednesday, June 10) from 5&ndash;7 PM at the Elks Club for the launch of Livable Telluride , a new community resource designed to make local information easier to find, understand, and use, and to bring people together. We'll have appetizers and a cash bar available. Livable Telluride is built ",
    category: "Newsletter",
    source: "mailchimp"
  },
  {
    title: "Welcome to the New Livable Telluride",
    date: "Jun 2, 2026",
    href: "https://livabletelluride.org/digest/archive/2026-06-02-welcome-to-the-new-livable-telluride.html",
    image: "https://livabletelluride.org/assets/newsletters/welcome-to-the-new-livable-telluride/498ec74a-abaf-7ec3-a6f6-330a0bc09d3f.jpg",
    excerpt: "(A continuación, la versión en español.) The Measure 300 process revealed something important about civic life in San Miguel County: even in a small, highly engaged community, it is remarkably difficult for ordinary citizens to keep track of what is actually happening across all the public bodies th",
    category: "Newsletter",
    source: "mailchimp"
  }
];

const COMMUNITY_EVENTS = [
  {
    title: "Voter Registration Group Training",
    source: "San Miguel County Democrats",
    date: "July 23, 2026",
    time: "4:00 PM - 5:30 PM",
    location: "Wilkinson Public Library, Telluride Room, Telluride",
    copy: "San Miguel County Democrats voter-registration training. Bring a personal laptop or iPad. RSVP to Cindy at mtnmama70@gmail.com.",
    href: "https://smcdemocrats.org/"
  },
  {
    title: "Voter Registration Group Training",
    source: "San Miguel County Democrats",
    date: "July 24, 2026",
    time: "1:00 PM - 2:30 PM",
    location: "Lone Cone Library Conference Room, Norwood",
    copy: "San Miguel County Democrats voter-registration training. Bring a personal laptop or iPad. RSVP to Cindy at mtnmama70@gmail.com.",
    href: "https://smcdemocrats.org/"
  },
  {
    title: "Postcard Writing Party",
    source: "San Miguel County Democrats",
    date: "August 13, 2026",
    time: "6:00 PM - 7:30 PM",
    location: "Oliver House, 1555 Summit Street, Norwood",
    copy: "San Miguel County Democrats postcard-writing party. Bring a snack to share. RSVP to Cindy at mtnmama70@gmail.com.",
    href: "https://smcdemocrats.org/"
  },
  {
    title: "Ridgway Friday Protests",
    source: "San Miguel County Democrats",
    date: "July 10, 2026",
    endDate: "December 25, 2026",
    time: "3:00 PM - 5:00 PM",
    location: "Hartwell Park, CO-62, Ridgway",
    copy: "Weekly community protest gathering every Friday afternoon at Hartwell Park in Ridgway - come when you can, leave when you have to. Ongoing; confirm the current schedule at smcdemocrats.org.",
    href: "https://smcdemocrats.org/ridgway-protests-every-friday/"
  },
  {
    title: "2nd Annual Telluride Rotary Hikeathon",
    source: "Telluride Rotary Club",
    date: "May 31, 2026",
    endDate: "June 28, 2026",
    location: "",
    eventTimes: "11:00 AM kickoff",
    img: "https://clubrunner.blob.core.windows.net/00000003291/Images/Hikathon-simplified-logo-SMALL.png",
    copy: "Registration opens April 20 for the 2nd Annual Telluride Rotary Hikeathon. Four weeks of hiking from May 31 through June 28, with a kickoff at 11am on May 31 at the Oak Street gondola plaza. Hike from anywhere and raise funds for the Telluride Rotary Foundation — supporting scholarships, Youth Exchange, international projects, and community grants. 60% of nonprofit team funds go directly back to their nonprofit. Sponsored by Alpine Bank and Jagged Edge Mountain Gear.",
    href: "https://www.facebook.com/telluriderotary/",
    notable: true,
    beneficiary: "Telluride Rotary Foundation — scholarships, Youth Exchange & community grants",
    sponsors: "Alpine Bank, Jagged Edge Mountain Gear",
    clubInfo: { name: "Telluride Rotary Club", meetings: "1st & 3rd Wednesdays, 6:00 PM (social at 5:30)", location1: "1st Wed — Mountain Lodge, 457 Mountain Village Blvd", location2: "3rd Wed — Announced Telluride location", president: "Kate Wadley", email: "telluriderotary@gmail.com", website: "https://portal.clubrunner.ca/3291", note: "No meetings in April. In-person & online options available." }
  },
  {
    title: "Elks Lodge Comedy Night with Cindy Pierce",
    source: "Telluride Elks Lodge 692",
    date: "March 16, 2026",
    location: "472 W Pacific Ave, Telluride",
    copy: "The Telluride Elks Lodge hosted comedian Cindy Pierce for a night of laughs benefiting Tri-County Health Network and the community services they provide across the region. Located at 472 W Pacific Ave, the Lodge regularly hosts social and fundraising events for the Telluride community.",
    href: "https://www.facebook.com/pages/Telluride-Elks-Lodge-692/232150316875640",
    notable: true,
    beneficiary: "Tri-County Health Network"
  }
];

// ── Music on the Green — Mountain Village summer concert series ──
// Free-form curated series (Beyond the Groove / sunsetconcertseries.com).
// Every Friday 5–7 PM at Reflection Plaza (next to Hotel Madeline) in
// Mountain Village. events.html reads this via its pushEvent loop, so each
// concert renders as its own card on the Events tab within the rolling
// 60-day look-ahead window. Per-band photos live in /img/music-on-the-green/.
// Update this list each season from https://sunsetconcertseries.com/music-on-the-green
const MUSIC_ON_THE_GREEN = (function () {
  const SERIES_LINK = 'https://sunsetconcertseries.com/music-on-the-green';
  const LOCATION = 'Reflection Plaza (next to Hotel Madeline), Mountain Village';
  const TIME = '5:00 – 7:00 PM';
  const lineup = [
    { date: '2026-05-29', band: 'Dori Freeman',                   slug: 'dori-freeman' },
    { date: '2026-06-05', band: 'Madeline Hawthorne',             slug: 'madeline-hawthorne' },
    { date: '2026-06-12', band: 'J Plank & the Bernese Rescue Band', slug: 'j-plank' },
    { date: '2026-06-19', band: 'The Lowest Pair',                slug: 'the-lowest-pair' },
    { date: '2026-06-26', band: 'LVDY',                           slug: 'lvdy' },
    { date: '2026-07-10', band: 'Alex Maryol',                    slug: 'alex-maryol' },
    { date: '2026-07-17', band: 'Sway Wild',                      slug: 'sway-wild' },
    { date: '2026-07-24', band: 'Jon Stickley Trio',              slug: 'jon-stickley-trio' },
    { date: '2026-07-31', band: 'South Austin Moonlighters',      slug: 'south-austin-moonlighters' },
    { date: '2026-08-07', band: 'Logan Metz',                     slug: 'logan-metz' },
    { date: '2026-08-14', band: 'Ben Musser & Walker Young',      slug: 'ben-musser-walker-young' },
    { date: '2026-08-21', band: 'Ray Wylie Hubbard',             slug: 'ray-wylie-hubbard' },
    { date: '2026-08-28', band: 'Cristina Vane',                  slug: 'cristina-vane' },
    { date: '2026-09-04', band: 'Daniel Rodriguez',               slug: 'daniel-rodriguez' },
    { date: '2026-09-11', band: 'Danno Simpson',                  slug: 'danno-simpson' },
    { date: '2026-09-18', band: 'Leon Timbo',                     slug: 'leon-timbo' },
  ];
  return lineup.map(c => ({
    title: c.band + ' — Music on the Green',
    date: c.date,
    time: TIME,
    location: LOCATION,
    description: 'Outdoor summer concert in Mountain Village\'s Music on the Green series, presented by Beyond the Groove. Live music at Reflection Plaza (next to Hotel Madeline), Fridays 5–7 PM. This week: ' + c.band + '.',
    href: SERIES_LINK,
    imageUrl: '/img/music-on-the-green/' + c.slug + '.jpg',
    sourceLabel: 'Music on the Green',
  }));
})();

// Telluride Farmers Market — AUTO-RECURRING weekly series (no hand-refresh
// needed each year), same render pattern as MUSIC_ON_THE_GREEN. The market
// runs every Friday from the Friday after Memorial Day (the last Monday of
// May) through the last Friday of September, on South Oak Street, 10:30 AM–
// 3:30 PM. The Fridays are COMPUTED below for the current and next year, so
// the series rolls over automatically — the events.html 60-day rolling window
// only renders upcoming Fridays. (Computed client-side in the browser; the bot
// never extracts this IIFE, only plain `const NAME = [` arrays.) Re-grab the
// hero photo if the market ever changes its branding; the dates take care of
// themselves.
const TELLURIDE_FARMERS_MARKET = (function () {
  const LINK = 'https://www.thetelluridefarmersmarket.com/';
  const LOCATION = 'South Oak Street, downtown Telluride';
  const TIME = '10:30 AM – 3:30 PM';
  const IMAGE = '/img/telluride-farmers-market.webp';
  // All UTC date math so the YYYY-MM-DD strings never drift by timezone.
  const lastMondayOfMay = (y) => {
    const d = new Date(Date.UTC(y, 4, 31));            // May 31
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() - 1);
    return d;
  };
  const lastFridayOfSep = (y) => {
    const d = new Date(Date.UTC(y, 8, 30));            // Sep 30
    while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
    return d;
  };
  const seasonFridays = (y) => {
    const start = lastMondayOfMay(y);                  // step to the first Friday after it
    do { start.setUTCDate(start.getUTCDate() + 1); } while (start.getUTCDay() !== 5);
    const end = lastFridayOfSep(y);
    const out = [];
    for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 7)) {
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  };
  const thisYear = new Date().getUTCFullYear();
  const fridays = seasonFridays(thisYear).concat(seasonFridays(thisYear + 1));
  return fridays.map(date => ({
    title: 'Telluride Farmers Market',
    date: date,
    time: TIME,
    location: LOCATION,
    description: 'The Telluride Farmers Market is open every Friday through the season on South Oak Street in downtown Telluride, 10:30 AM–3:30 PM. Locally produced organic produce, animal products, prepared food, and artisan goods — everything sourced within 100 miles of Telluride.',
    href: LINK,
    imageUrl: IMAGE,
    sourceLabel: 'Telluride Farmers Market',
  }));
})();

// Telluride Science — summer "Town Talk" public-lecture series + workshops at
// the Telluride Innovation Center (300 S. Townsend). AUTO-SYNCED every refresh
// by content-refresh.js Task 22 from the Tribe Events API at
// https://telluridescience.org/wp-json/tribe/events/v1/events/ (same WordPress
// + The Events Calendar stack as KOTO/Sherbino). The entries below are a
// seed/fallback — the bot overwrites them on its first successful run, and if
// the API ever errors the existing array carries forward instead of being
// wiped. The events.html collector applies a rolling 60-day window, so
// out-of-season entries simply don't render until they approach.
const TELLURIDE_SCIENCE_EVENTS = [
  {
    title: "Wreaths for Rescues",
    date: "2026-12-03",
    time: "5:30 PM – 7:30 PM",
    location: "Telluride Innovation Center, 300 S. Townsend, Telluride",
    description: "Celebrate your beloved pets, past & present, by making a festive pet-themed holiday wreath. Adela Floral will lead this hands-on wreath-making workshop to benefit Second Chance Humane Society. Bring mementos such as small pet photos to place in frames, a beloved small toy, collar, or keepsake that reminds you of your pet. You will leave this event with a beautiful, one-of-a-kind keepsake wreath.\nDirt Dawg will host a Stocking Stuffer Station where you can pick up fun gifts for your furry family members! Browse a selection of curated holiday favorites that you can purchase to spoil your pets. We will also have stockings for Second Chance shelter pets available for you to stuff with goodies or donations to make their holiday special.\nTickets are available  for $150 per person and include entry to the workshop, the wreath you make, a festive beverage, and light bites. Purchase tickets HERE.",
    link: "https://telluridescience.org/event/wreaths-for-rescues/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/11/wreaths.png",
    sourceLabel: "Telluride Science"
  }
];

// Telluride Rotary Club meetings — hand-curated recurring series (bots don't
// touch this). 1st & 3rd Wednesdays, 6:00 PM (social 5:30); 1st Wed at
// Mountain Lodge in Mountain Village, 3rd Wed at an announced Telluride
// location. No meetings in April. Dates are GENERATED from the viewer's
// current date at page load (rolling), so the list never goes stale. Schedule
// + logo from portal.clubrunner.ca/3291.
const TELLURIDE_ROTARY_MEETINGS = (function () {
  function nthWeekday(year, month, weekday, n) { // month 0-indexed, weekday 0=Sun..6=Sat
    const first = new Date(year, month, 1);
    const day = 1 + ((weekday - first.getDay() + 7) % 7) + (n - 1) * 7;
    return new Date(year, month, day);
  }
  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const out = [];
  const now = new Date();
  for (let i = 0; i < 4; i++) {                 // current month + next 3
    const base = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const y = base.getFullYear(), m = base.getMonth();
    if (m === 3) continue;                       // April — no meetings
    [1, 3].forEach(n => {
      const d = nthWeekday(y, m, 3, n);          // Wednesday = 3
      const first = (n === 1);
      out.push({
        title: 'Telluride Rotary Club Meeting',
        date: iso(d),
        time: '6:00 PM (social at 5:30)',
        location: first
          ? 'Mountain Lodge, 457 Mountain Village Blvd, Mountain Village'
          : 'Announced Telluride location',
        description: 'Telluride Rotary Club meets the 1st & 3rd Wednesdays at 6:00 PM (gathering at 5:30) — 1st Wednesday at Mountain Lodge in Mountain Village, 3rd Wednesday at an announced Telluride location. A service club supporting scholarships, Youth Exchange, international projects, and community grants. Guests welcome; in-person & online options available.',
        href: 'https://portal.clubrunner.ca/3291',
        imageUrl: '/logo/Telluride%20Rotary.png',
        sourceLabel: 'Telluride Rotary',
      });
    });
  }
  return out;
})();

const KOTO_COMMUNITY_EVENTS = [
  {
    title: "Girl Winter Film Tour",
    link: "https://koto.org/event/girl-winter-film-tour/",
    description: "The Girl Winter Film Tour comes to the Sheridan Opera House for an evening of short films celebrating women in snow sports and winter storytelling. The program features five films and runs approximately two hours.",
    pubDate: "2026-11-20T18:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Sheridan Opera House, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/10/GWFT-Cowgirl-16x9-Story-Post-Graphic-Only-2-scaled.jpg"
  },
  {
    title: "Yoga with Lauren",
    link: "https://koto.org/event/yoga-with-lauren/2026-11-21/",
    description: "Move, breathe, and energize in this dynamic bilingual class, led by Lauren Norton, designed to uplift your body and mind! Blending the strength and flow of Pilates, the rhythm and energy of dance, and the grounding presence of yoga and breathwork, this session will leave you feeling strong, balanced, and revitalized. Open to all levels, this fun and fast-paced class welcomes everyone looking to build strength, flexibility, and mindfulness in a supportive community space. This class is free, but donations for the instructor are welcome. Muévase, respire y llénese de energía en esta dinámica clase bilingüe, dirigido por Lauren Norton, diseñada para fortalecer su cuerpo y mente. Combinando la fuerza y fluidez del pilates, el ritmo y la energía de la danza, y la presencia equilibrante del yoga y la respiración, esta sesión le dejará sintiéndose fuerte, en armonía y revitalizado/a. …",
    pubDate: "2026-11-21T10:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/10/wellness-lineup-21.png"
  },
  {
    title: "People's March",
    link: "https://koto.org/event/peoples-march-4/",
    description: "The next People's March is this Saturday, November 21st, at 12 p.m. at the San Miguel County Courthouse. Speakers are Michael Saftler and Mick Varner. Sing-a-long following the march. Bring instruments and bring your signs!",
    pubDate: "2026-11-21T12:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/11/IMG_6244.jpg"
  },
  {
    title: "Alpine Chapel's Annual FREE Community Friendsgiving",
    link: "https://koto.org/event/alpine-chapels-annual-free-community-friendsgiving/",
    description: "All are welcome for a FREE Community Friendsgiving meal around the table on Saturday, November 21st, from 5-7 p.m. at Telluride High School. Dine in only; while supplies last. No reservations required. All are welcome!",
    pubDate: "2026-11-21T17:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Middle/High School, TELLURIDE",
    imageUrl: "https://koto.org/wp-content/uploads/2026/10/image0-7-1-scaled.jpeg"
  },
  {
    title: "Tea and Tarot",
    link: "https://koto.org/event/tea-and-tarot/2026-11-22/",
    description: "Tea and Tarot Sessions with Jade Rose and others from Sanctuary Collective in the Telluride Room. Seating is limited; please sign up at telluridelibrary.org in advance.",
    pubDate: "2026-11-22T14:30:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/tea-1.jpg"
  },
  {
    title: "Around The World: America’s Pumpkin Beer & Chocolate Pretzels",
    link: "https://koto.org/event/around-the-world-americas-pumpkin-beer-chocolate-pretzels/",
    description: "Owner and Brewmaster, TJ is taking us on a journey to early America to discover how a humble native gourd became our continent’s most iconic seasonal tradition. Long before pumpkin spice became a modern phenomenon, early American colonists relied on native pumpkins to survive winter and celebrate the harvest holidays. Join us for a curated tasting event exploring the rich history of American pumpkin brewing paired with traditional European-style chocolate pretzels. Grab your tasting passport, explore the global trade routes that brought us holiday spices, and toast to the historic flavors of the American harvest season! (Ages 21+ only).",
    pubDate: "2026-11-23T17:30:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wine Mine, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/11/November-around-the-world.png"
  },
  {
    title: "Dance Fit Fusion",
    link: "https://koto.org/event/dance-fit-fusion-2/",
    description: "Join Marlen for a high-energy dance fitness class fused with barre, pilates and stretching that mixes low-intensity and high-intensity moves for an interval-style, calorie-burning workout that will tone your body and boost your endurance without even realizing how hard you are working. It is exercise in disguise! No dance experience is required—just bring your energy, a water bottle, and a smile. This class is free and open to the public, but donations for the instructor are always welcome. Únete a Marlen para una clase de fitness de baile llena de energía combinada con barre, pilates y estiramientos que combina movimientos de baja y alta intensidad para un entrenamiento de intervalos que quema calorías, tonificando tu cuerpo y aumentando tu resistencia sin darte cuenta de lo duro que estás trabajando. ¡Es ejercicio disfrazado! No se requiere experiencia en baile—solo lleva tu energía, una botella de agua y una sonrisa. …",
    pubDate: "2026-11-24T17:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Cardio Dance w/Kelsey",
    link: "https://koto.org/event/cardio-dance-w-kelsey-2/",
    description: "Join us for a fun evening of dancing and getting your heart rate up! You will be having so much fun, you won't even know you are exercising! Led by Kelsey Trottier from the Telluride Dance Collective. 2nd and 4th Monday of the month. ¡Únete a nosotros para una divertida noche de baile y ejercicio! Te divertirás tanto que ni te darás cuenta de que estás haciendo ejercicio. Dirigido por Kelsey Trottier del Telluride Dance Collective.",
    pubDate: "2026-11-25T18:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Turkey Trot 2026",
    link: "https://koto.org/event/turkey-trot-2026/",
    description: "Dust off those tennis shoes and tail feathers – the Turkey Trot is back! This 5K walk/run is free and fun for the whole family (even Fido!). Sign up online in advance to be entered into a raffle, with additional prizes for the fastest male, fastest female, fastest kid under 12 and best costume. The event will take place at the intersection of Sunshine Mesa Rd. and Ilium Rd. at 9:00 a.m. on Thanksgiving morning, Thursday, November 26th, at 9:00 a.m. Sign up online at bit.ly/smcturkeytrot2026.",
    pubDate: "2026-11-26T09:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/11/Turkey-Trot-English-Digital.png"
  },
  {
    title: "An Outlaw Thanksgiving at Alloy Kitchen",
    link: "https://koto.org/event/an-outlaw-thanksgiving-at-alloy-kitchen/",
    description: "An Outlaw Thanksgiving at Alloy Kitchen in Mountain Lodge Telluride, Mountain Village. A fire-lit Thanksgiving buffet with live music on Thursday, November 26, from 2 to 6 PM. Reservations through OpenTable.",
    pubDate: "2026-11-26T14:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Mountain Lodge Telluride, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Live Music in the Après Lounge at Mountain Lodge Telluride",
    link: "https://koto.org/event/live-music-in-the-apres-lounge-at-mountain-lodge-telluride/2026-11-26/",
    description: "Local live music in the Après Lounge at Mountain Lodge Telluride in Mountain Village, 4 to 7 PM on most Thursdays, Fridays and Saturdays all winter.",
    pubDate: "2026-11-26T16:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Mountain Lodge Telluride, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Up-Off Gymnastics, Dance, and Spanish",
    link: "https://koto.org/event/up-off-gymnastics-dance-and-spanish/2026-11-27/",
    description: "We are a MOBILE family business offering non-competitive Gymnastics, Preschool Spanish, & Dance classes to the San Miguel County area. Tia Uphoff was a competitive gymnast and an instructor for 20+ years, helping children develop balance, flexibility, strength and proper tumbling techniques while using positive reinforcement and encouragement for success. Infant to Age 5 — Padres & Pequenos Class – $10.00 per class This class invites adults & kids to participate in Educational songs, in English & Spanish, with intro to gymnastics. Sign up at any time and get started weekly. Fridays — 11:15-11:40 am @ Lone Cone Library Norwood K to 3rd Grade week Session 8 Week Winter Session $150 for the 8 sessions. Thursdays – 430-530 pm @ Lone Cone Library Norwood For more information and to register: Contact Tia @ liv2danz247@gmail.com or find us on Facebook!",
    pubDate: "2026-11-27T10:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Lone Cone Library Norwood",
    imageUrl: "https://koto.org/wp-content/uploads/2025/06/Messenger_creation_3FA37E27-C0AC-4E9D-ABF5-592710E68D81.jpeg"
  },
  {
    title: "Live Music in the Après Lounge at Mountain Lodge Telluride",
    link: "https://koto.org/event/live-music-in-the-apres-lounge-at-mountain-lodge-telluride/2026-11-27/",
    description: "Local live music in the Après Lounge at Mountain Lodge Telluride in Mountain Village, 4 to 7 PM on most Thursdays, Fridays and Saturdays all winter.",
    pubDate: "2026-11-27T16:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Mountain Lodge Telluride, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Mind Blown Telluride",
    link: "https://koto.org/event/mind-blown-telluride/2026-11-27/",
    description: "Mind Blown Telluride is the Number 1 show in Telluride, Colorado. It is a \"Must See!\" One of the hottest tickets in town, selling out frequently. This show has VERY LIMITED tickets available, so everyone will experience the astonishing magic of Ty Gallenbeck up close. You will laugh, question reality, and be part of creating an experience you will not soon forget. This show is recommended for ages 12 and up.",
    pubDate: "2026-11-27T19:30:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Mountain Lodge Telluride, Mountain Village",
    imageUrl: "https://koto.org/wp-content/uploads/2026/10/Visit-Telluride-Graphic.jpg"
  },
  {
    title: "Yoga with Lauren",
    link: "https://koto.org/event/yoga-with-lauren/2026-11-28/",
    description: "Move, breathe, and energize in this dynamic bilingual class, led by Lauren Norton, designed to uplift your body and mind! Blending the strength and flow of Pilates, the rhythm and energy of dance, and the grounding presence of yoga and breathwork, this session will leave you feeling strong, balanced, and revitalized. Open to all levels, this fun and fast-paced class welcomes everyone looking to build strength, flexibility, and mindfulness in a supportive community space. This class is free, but donations for the instructor are welcome. Muévase, respire y llénese de energía en esta dinámica clase bilingüe, dirigido por Lauren Norton, diseñada para fortalecer su cuerpo y mente. Combinando la fuerza y fluidez del pilates, el ritmo y la energía de la danza, y la presencia equilibrante del yoga y la respiración, esta sesión le dejará sintiéndose fuerte, en armonía y revitalizado/a. …",
    pubDate: "2026-11-28T10:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/10/wellness-lineup-21.png"
  },
  {
    title: "Live Music in the Après Lounge at Mountain Lodge Telluride",
    link: "https://koto.org/event/live-music-in-the-apres-lounge-at-mountain-lodge-telluride/2026-11-28/",
    description: "Local live music in the Après Lounge at Mountain Lodge Telluride in Mountain Village, 4 to 7 PM on most Thursdays, Fridays and Saturdays all winter.",
    pubDate: "2026-11-28T16:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Mountain Lodge Telluride, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Tea and Tarot",
    link: "https://koto.org/event/tea-and-tarot/2026-11-29/",
    description: "Tea and Tarot Sessions with Jade Rose and others from Sanctuary Collective in the Telluride Room. Seating is limited; please sign up at telluridelibrary.org in advance.",
    pubDate: "2026-11-29T14:30:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/tea-1.jpg"
  },
  {
    title: "The Real Book Club-Jazz Standards",
    link: "https://koto.org/event/the-real-book-club-jazz-standards/",
    description: "Join us for The Real Book Club, a monthly jazz jam session for musicians of all levels who want to dive into classic jazz standards together! Whether you're a seasoned improviser or just starting out, this is a welcoming space to play, practice, and connect with fellow jazz enthusiasts. Each month, we’ll focus on three jazz standards selected from The Real Book. You’ll receive PDFs of the tunes in advance so you can shed at home and come ready to jam. Lead sheets will also be available on the day of the event. The songs we will play at this jam are: Once I Loved by Antonio Carlos Jobim. Here is a version I quite like with Astrud Gilberto singing. Guantanamera by Jose Fernandez Diaz. Here is a version I quite like by Joseito Fernandez. …",
    pubDate: "2026-11-29T17:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Sunday Live Music in the Lounge at Mountain Lodge Telluride",
    link: "https://koto.org/event/sunday-live-music-in-the-lounge-at-mountain-lodge-telluride/2026-11-29/",
    description: "Live music in the lounge at Mountain Lodge Telluride in Mountain Village, Sundays from 6 to 9 PM all winter.",
    pubDate: "2026-11-29T18:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Mountain Lodge Telluride, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Strings and Keys",
    link: "https://koto.org/event/strings-and-keys/",
    description: "Annie Foxen and pianist, Oliver Henry (both WPL staff members). Perfect for reading, relaxing, or simply listening. Free and open to the public. All ages are welcome.",
    pubDate: "2026-11-30T12:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Desserts and Docs-The Colorado Experience",
    link: "https://koto.org/event/desserts-and-docs-the-colorado-experience-2/",
    description: "Join us for this 4 part series as we watch episodes from RMPBS Flagship history series, explores the people, places. and events that has shaped Colorado's rich heritage. August: \"The Original Coloradans\" An incredible look at the Ute Nation, their history before colonization, and their interactions with early trappers. September: \" October: November: \"The Games That Never Happened\". The fascinating modern-history story of how Denver became the only city in the world to win the Winter Olympics and then vote to give them back!",
    pubDate: "2026-11-30T13:30:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Trivia Night at The Stronghouse Brew Pub",
    link: "https://koto.org/event/trivia-night-at-the-stronghouse-brew-pub/",
    description: "Gather together your smartest friends and come on down to the Stronghouse Brew Pub for a thrilling night of Library Trivia! Top three teams will get a gift card to the Stronghouse ($75, $50, $25) and we'll do additional raffles for people who have a library card and/or a Friends of the Library membership. There will be staff members on hand to help you get a library card and/or a FOL membership if you don't have one already. Please keep your teams to a max of 6 and get ready for a night of brain-teasing fun! Get there early to grab your seat and a bite to eat!",
    pubDate: "2026-12-01T17:30:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Stronghouse Brewpub, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/10/dec-Trivia-2.png"
  },
  {
    title: "Bardic Trails Online Poetry Night",
    link: "https://koto.org/event/bardic-trails-online-poetry-night-3/2026-12-01/",
    description: "The Telluride Institute's Bardic Trails poetry night features an award-winning guest poet sharing their new and exciting work. The reading will be followed with a Q & A about the poet’s work and inspirations, with time afterwards for poetry sharing from attendees – a Gourd Circle of sharing whatever poetry attendees wish, or just listening in. The list of 2026 poets is below. The free Bardic Trails virtual Zoom series is on the first Tuesday of each month. Visit to get the zoom link each month, Thanks to the Wilkinson Public Library, Cantor Family, the Guttman Family Foundation, CCAASE and our Fischer and Cantor contest participants for supporting our program and projects. Jan. 6 / Euro-American poet Dane Cervine of California Feb. …",
    pubDate: "2026-12-01T19:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/03/Bardic-Trails-2026.jpg"
  },
  {
    title: "Art Walk Telluride",
    link: "https://koto.org/event/art-walk-telluride/2026-12-03/",
    description: "Join us the first Thursday of every month for Telluride's Art Walk. It will be an evening filled with inspiring exhibits, engaging receptions, and the chance to meet local and visiting artists. From 5–7 pm, participating venues will open their doors, showcasing new collections and inviting art lovers to explore the vibrant gallery scene. Find what's new on www.telluridearts.org Note: Special Edition Art Walk May 21st.",
    pubDate: "2026-12-03T17:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2025/12/Screenshot-2025-11-10-at-2.54.42-PM.png"
  },
  {
    title: "Up-Off Gymnastics, Dance, and Spanish",
    link: "https://koto.org/event/up-off-gymnastics-dance-and-spanish/2026-12-04/",
    description: "We are a MOBILE family business offering non-competitive Gymnastics, Preschool Spanish, & Dance classes to the San Miguel County area. Tia Uphoff was a competitive gymnast and an instructor for 20+ years, helping children develop balance, flexibility, strength and proper tumbling techniques while using positive reinforcement and encouragement for success. Infant to Age 5 — Padres & Pequenos Class – $10.00 per class This class invites adults & kids to participate in Educational songs, in English & Spanish, with intro to gymnastics. Sign up at any time and get started weekly. Fridays — 11:15-11:40 am @ Lone Cone Library Norwood K to 3rd Grade week Session 8 Week Winter Session $150 for the 8 sessions. Thursdays – 430-530 pm @ Lone Cone Library Norwood For more information and to register: Contact Tia @ liv2danz247@gmail.com or find us on Facebook!",
    pubDate: "2026-12-04T10:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Lone Cone Library Norwood",
    imageUrl: "https://koto.org/wp-content/uploads/2025/06/Messenger_creation_3FA37E27-C0AC-4E9D-ABF5-592710E68D81.jpeg"
  },
  {
    title: "Mamas & Caregivers Connect – Prenatal, Postpartum, and Beyond",
    link: "https://koto.org/event/mamas-caregivers-connect-prenatal-postpartum-and-beyond/2026-12-04/",
    description: "A supportive skill-building community for new and expecting moms to connect, share, and grow in breastfeeding confidence, physical recovery, and emotional wellbeing throughout the perinatal and postpartum journey.",
    pubDate: "2026-12-04T11:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/11/Mamas-Caregivers-Connect-.png"
  },
  {
    title: "Holiday Arts Bazaar",
    link: "https://koto.org/event/holiday-arts-bazaar/",
    description: "A LOCAL TRADITION SINCE 1983 FEATURING HANDMADE GOODS FROM ARTISTS AND ARTISANS FROM THE REGION The Telluride Arts Holiday Bazaar is a lively tradition hosted by Telluride Arts in collaboration with Ah Haa School for the Arts that features a wide variety of fine crafts, including artisan jewelry, organic body products, gourmet food, ceramics, clothing, and more – all made by hand.",
    pubDate: "2026-12-04T16:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Ah Haa School for the Arts, Telluride",
    imageUrl: ""
  },
  {
    title: "Live Music in the Après Lounge at Mountain Lodge Telluride",
    link: "https://koto.org/event/live-music-in-the-apres-lounge-at-mountain-lodge-telluride/2026-12-04/",
    description: "Local live music in the Après Lounge at Mountain Lodge Telluride in Mountain Village, 4 to 7 PM on most Thursdays, Fridays and Saturdays all winter.",
    pubDate: "2026-12-04T16:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Mountain Lodge Telluride, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Young People's Theater Presents The SpongeBob Musical",
    link: "https://koto.org/event/young-peoples-theater-presents-the-spongebob-musical/2026-12-04/",
    description: "The Sheridan Arts Foundation’s Young People’s Theater (YPT) invites audiences to dive into the SpongeBob’s colorful underwater world of Bikini Bottom with its upcoming production of The SpongeBob Musical , December 4–6, 2026 at the historic Sheridan Opera House. Featuring a talented cast of local 6th–8th grade performers, this high-energy musical brings everyone's favorite sea sponge and his friends to the stage for an unforgettable adventure filled with music, laughter, friendship and plenty of undersea surprises. For tickets and additional information, visit sheridanoperahouse.com or call the Sheridan Opera House at 970-728-6363 .",
    pubDate: "2026-12-04T18:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/11/SpongeBob-Dec.-4-6-2026.jpg"
  },
  {
    title: "Dolores Ski Swap",
    link: "https://koto.org/event/dolores-ski-swap/",
    description: "Find your ski and winter outdoor gear at the Dolores Ski Swap on Saturday, December 5th, 9 a.m. – 2 p.m. at the Dolores School Cafeteria. In addition to a robust inventory of gently used skis, snowboards and gear, community members are invited to drop off their donations or consignment items on Friday, December 4th, from 3 – 7 p.m., and shop the Saturday sale to support Dolores Ski Club and Operation Graduation. For more info, email OGDoloresSeniors@gmail.com.",
    pubDate: "2026-12-05T09:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Dolores School",
    imageUrl: ""
  },
  {
    title: "Live Music in the Après Lounge at Mountain Lodge Telluride",
    link: "https://koto.org/event/live-music-in-the-apres-lounge-at-mountain-lodge-telluride/2026-12-05/",
    description: "Local live music in the Après Lounge at Mountain Lodge Telluride in Mountain Village, 4 to 7 PM on most Thursdays, Fridays and Saturdays all winter.",
    pubDate: "2026-12-05T16:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Mountain Lodge Telluride, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Young People's Theater Presents The SpongeBob Musical",
    link: "https://koto.org/event/young-peoples-theater-presents-the-spongebob-musical/2026-12-05/",
    description: "The Sheridan Arts Foundation’s Young People’s Theater (YPT) invites audiences to dive into the SpongeBob’s colorful underwater world of Bikini Bottom with its upcoming production of The SpongeBob Musical , December 4–6, 2026 at the historic Sheridan Opera House. Featuring a talented cast of local 6th–8th grade performers, this high-energy musical brings everyone's favorite sea sponge and his friends to the stage for an unforgettable adventure filled with music, laughter, friendship and plenty of undersea surprises. For tickets and additional information, visit sheridanoperahouse.com or call the Sheridan Opera House at 970-728-6363 .",
    pubDate: "2026-12-05T18:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/11/SpongeBob-Dec.-4-6-2026.jpg"
  },
  {
    title: "Tea and Tarot",
    link: "https://koto.org/event/tea-and-tarot/2026-12-06/",
    description: "Tea and Tarot Sessions with Jade Rose and others from Sanctuary Collective in the Telluride Room. Seating is limited; please sign up at telluridelibrary.org in advance.",
    pubDate: "2026-12-06T14:30:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/tea-1.jpg"
  },
  {
    title: "Young People's Theater Presents The SpongeBob Musical",
    link: "https://koto.org/event/young-peoples-theater-presents-the-spongebob-musical/2026-12-06/",
    description: "The Sheridan Arts Foundation’s Young People’s Theater (YPT) invites audiences to dive into the SpongeBob’s colorful underwater world of Bikini Bottom with its upcoming production of The SpongeBob Musical , December 4–6, 2026 at the historic Sheridan Opera House. Featuring a talented cast of local 6th–8th grade performers, this high-energy musical brings everyone's favorite sea sponge and his friends to the stage for an unforgettable adventure filled with music, laughter, friendship and plenty of undersea surprises. For tickets and additional information, visit sheridanoperahouse.com or call the Sheridan Opera House at 970-728-6363 .",
    pubDate: "2026-12-06T16:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/11/SpongeBob-Dec.-4-6-2026.jpg"
  },
  {
    title: "Sunday Live Music in the Lounge at Mountain Lodge Telluride",
    link: "https://koto.org/event/sunday-live-music-in-the-lounge-at-mountain-lodge-telluride/2026-12-06/",
    description: "Live music in the lounge at Mountain Lodge Telluride in Mountain Village, Sundays from 6 to 9 PM all winter.",
    pubDate: "2026-12-06T18:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Mountain Lodge Telluride, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Free Legal Clinic – Clínica Jurídica Gratuita",
    link: "https://koto.org/event/free-legal-clinic-clinica-juridica-gratuita/2026-12-08/",
    description: "A FREE legal clinic for parties who have no attorney. Sign up today because spots are limited. Volunteer attorneys will answer questions, help fill out forms, and explain the process and procedure for legalissues. The volunteer attorneys do not represent you and this clinic is information only. BY APPOINTMENT ONLY. Call 970-728-4519 for more information and to sign up. Una clínica de asesoramiento jurídico GRATUITO para las personas que notienen abogado. Abogados voluntarios responderán a preguntas, ayudarán a llenar formularios y explicarán el proceso y el procedimiento de cuestiones jurídicas. Los abogados voluntarios no te representan y esta clínica es sólo informativa. CON CITA PREVIA. Llame a 970-728-4519 para más información y para registrarse.",
    pubDate: "2026-12-08T16:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Mountainfilm Noel Night Local Pass Sale",
    link: "https://koto.org/event/mountainfilm-noel-night-local-pass-sale/",
    description: "Mountainfilm is holding a pass sale on Noel Night, Wednesday, December 9, from 11 AM to 8 PM at the Mountainfilm office, 122 S. Oak St. in Telluride. Palmyra Passes to the 2027 festival will be buy one, get one free, in person only . The festival is May 27-31, 2027.",
    pubDate: "2026-12-09T11:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Mountainfilm Offices, Telluride",
    imageUrl: ""
  },
  {
    title: "Sewing 101 with Melissa",
    link: "https://koto.org/event/sewing-101-with-melissa/2026-12-09/",
    description: "Don't throw away your old clothes just because they have a tiny (or even a large) hole in them! Learn the basics of sewing and mending your clothing with our very own talented seamstress, Melissa Sumpter! Bring your own garment, we'll provide the sewing materials.",
    pubDate: "2026-12-09T17:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/02/sewing.jpg"
  },
  {
    title: "Matchstick Productions ~ The Way Out ~ Presented by The Sherbino",
    link: "https://koto.org/event/matchstick-productions-the-way-out-presented-by-the-sherbino/",
    description: "Wednesday, December 9th Doors: 6:00pm || Film: 6:30pm || $10 students and seniors (18-/ 65+) / $15 General Admission || Matchstick Productions returns with their 34th annual ski film, The Way Out, an action-packed tribute to the culture and lifestyle of skiing. What makes skiing special goes far beyond the fleeting thrill of dropping into a line. It’s the deep, elemental relationship with nature that sets mountain culture apart from any traditional activity. For skiers, this isn’t just a sport; we live to ski, and ski to live. The Way Out drops you right into the action across the globe, from heavy Alaskan spine lines to local backyard laps in Whistler. The Way Out represents a path toward total freedom. …",
    pubDate: "2026-12-09T18:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "The Sherbino, Ridgway",
    imageUrl: "https://koto.org/wp-content/uploads/2026/11/Way-out-Matchstick-Dec-9.png"
  },
  {
    title: "Telluride Mountain School Open House",
    link: "https://koto.org/event/telluride-mountain-school-open-house-4/",
    description: "Telluride Mountain School is hosting an open house where prospective families and community members can step directly into the learning environment rather than sit through a formal presentation. Visitors are welcome to explore classrooms, meet teachers and students, and experience firsthand the school's approach to curiosity, connection, and real-world learning.",
    pubDate: "2026-12-10T09:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Mountain School",
    imageUrl: "https://koto.org/wp-content/uploads/2026/09/Screenshot-2026-09-18-at-2.05.52-PM.png"
  },
  {
    title: "The Creative Exchange at Telluride Arts HQ",
    link: "https://koto.org/event/the-creative-exchange-at-telluride-arts-hq-2/2026-12-10/",
    description: "The Creative Exchange is a brand-new monthly series by Telluride Arts designed for the artists and creatives who call Telluride home. It’s a space where emerging and established artists gather to share the knowledge, skills, and stories that fuel their work. Think of it as an open source model for creativity—where we learn from each other, swap ideas, and help strengthen one another’s practice. Each session is hosted by local artists and creative leaders who bring their own perspectives, techniques, and creative journeys into the room. Topics may span everything from the business of art and professional development, to creative process, storytelling, collaboration, and the philosophical underpinnings of making art. Whether you’re a full-time working artist, an educator, a student, a maker, or simply someone curious about creative expression, the Creative Exchange is open to you. …",
    pubDate: "2026-12-10T17:30:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Arts HQ, TELLURIDE",
    imageUrl: "https://koto.org/wp-content/uploads/2025/12/Screenshot-2025-12-17-at-4.42.32-PM.png"
  },
  {
    title: "PI Avy Fund Backcountry Chat",
    link: "https://koto.org/event/pi-avy-fund-backcountry-chat/",
    description: "Join the Telluride Mountain Club and PI Avy Fund for our first Backcountry Chat of the season! We will cover several important topics to help backcountry users get dialed before heading into the mountains this season. Colorado Avalanche Information Center (CAIC) forecaster, Chris Dickson, will provide an update on current snowpack conditions and share tips for the season ahead. Telluride Helitrax Program Director, Matt Steen, will walk attendees through the local backcountry radio system, while Search and Rescue Specialist, Fischer Hazen, will share best practices for communicating with Search and Rescue via satellite inReach. The event is free, and pizza will be provided!",
    pubDate: "2026-12-10T18:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/11/DSC02424-scaled.jpg"
  },
  {
    title: "Ski Film: Warren Miller's Day Off",
    link: "https://koto.org/event/ski-film-warren-millers-day-off/",
    description: "Warren Miller's *Days Off*, the legendary ski film franchise's 77th installment, comes to the Sheridan Opera House in Telluride. The film follows host Katie Burrell and the world's top snow sports athletes across global destinations, capturing unscripted, competition-free riding from Alaska heli-drops to high-alpine terrain.",
    pubDate: "2026-12-11T00:00:00-07:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Sheridan Opera House, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/11/Warren-Miller-Web.jpg"
  }
];

const WILKINSON_EVENTS = [
  {
    title: "Coffee, Croissants and Cribbage",
    link: "https://telluridelibrary.libcal.com/event/17849320?hs=a",
    description: "10:00 AM – 11:30 AM · Coffee, croissants and cribbage is back! Come by the library Magazine Room 10-11:30am for friendly competition, free coffee and pastries, and community connection. May the nibs be with you.",
    pubDate: "2026-11-20T17:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Magazine Room",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_10_19_11_58_12.jpg"
  },
  {
    title: "You & Me / Tu Y Yo",
    link: "https://telluridelibrary.libcal.com/event/17874699?hs=a",
    description: "10:30 AM – 11:00 AM · Join us every Friday for a fun and engaging parent-child program designed for preschoolers! Each week, we explore a new theme through hands-on activities that spark creativity.    &iexcl;Acomp&aacute;&ntilde;enos todos los viernes en un programa divertido y din&aacute;mico para padres e hijos, dise&ntilde;ado para ni&ntilde;os en edad preescolar! Cada semana exploramos un tema nuevo a trav&eacute;s de actividades pr&aacute;cticas que estimulan la creatividad.",
    pubDate: "2026-11-20T17:30:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Kids Area",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_09_30_13_07_23.png"
  },
  {
    title: "Learn DND",
    link: "https://telluridelibrary.libcal.com/event/17876899?hs=a",
    description: "4:00 PM – 6:00 PM · Have you ever been curious about learning how to play Dungeons and Dragons? This is your opportunity! Join local Dungeon Master Kase in a one day campaign that is open to both experienced DND players, and folks who have never played once. This is a chance for folks to learn how DND works and jump right into a fun campaign. This is open to teens and adults.",
    pubDate: "2026-11-20T23:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Telluride Room",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_10_28_17_47_56.png"
  }
];

// Bot-managed by scripts/content-refresh.js Task 7 (syncHumaneSocietyAnimals).
// Currently empty: every animal the THS Shelterluv feed lists right now is
// either pending adoption ("ADOPTION PENDING! …") or pre-weaning/photoless,
// none of which are advertised as adoptable. The sync filters those out, so
// this repopulates automatically when THS posts genuinely-available pets.
const HUMANE_SOCIETY_ANIMALS = [
  {
    id: "TEL-A-208",
    name: "Yuki",
    species: "Dog",
    breed: "Shepherd, Australian",
    ageGroup: "Young Dog",
    sex: "Male",
    photo: "https://new-s3.shelterluv.com/profile-pictures/e0d1343dc5b39bd0a477488d65ea92c9/df48cf112b92fbdf076f579fc9a41830.JPG",
    profileUrl: "https://www.shelterluv.com/embed/animal/214942131",
    summary: "Young Dog • Shepherd, Australian • Male",
    firstSeen: "2026-10-31",
    revealDate: "2026-11-02",
    lastSeen: "2026-11-21"
  },
  {
    id: "TEL-A-209",
    name: "Callie",
    species: "Dog",
    breed: "Collie, Border / Cattle Dog, Australian (Red Heeler)",
    ageGroup: "Young Dog",
    sex: "Female",
    photo: "https://new-s3.shelterluv.com/profile-pictures/52102616602c1e1ebef6744ff66b174c/40e31418045aad01388f15003b2c23fd.JPG",
    profileUrl: "https://www.shelterluv.com/embed/animal/214942170",
    summary: "Young Dog • Collie, Border / Cattle Dog, Australian (Red Heeler) • Female",
    firstSeen: "2026-10-31",
    revealDate: "2026-11-04",
    lastSeen: "2026-11-21"
  },
  {
    id: "TEL-A-214",
    name: "Lumber Jack",
    species: "Dog",
    breed: "Collie, Border / American Blue Heeler",
    ageGroup: "Young Puppy",
    sex: "Male",
    photo: "https://new-s3.shelterluv.com/profile-pictures/4baf1e0b4226774ef3278f9a481cedce/0c9dd956ae6a0e662049a105167bcb15.jpg",
    profileUrl: "https://www.shelterluv.com/embed/animal/215053447",
    summary: "Young Puppy • Collie, Border / American Blue Heeler • Male",
    firstSeen: "2026-11-15",
    revealDate: "2026-11-15",
    lastSeen: "2026-11-21"
  }
];

/* The Alibi events — refreshed by syncAlibiEvents() every 6 hours.
 * Source: Event Calendar App (api.eventcalendarapp.com, calendar 14036).
 * Same schema as WILKINSON_EVENTS / SHERIDAN_EVENTS.
 * Link uses #eca-event=<friendlyUrl> fragment so users land on the
 * Alibi's own /calendar page with the event modal pre-opened.
 * Seeded 2026-05-29 with 3 events so the Events tab shows content
 * on Day 1; bot overwrites on first run. */
const ALIBI_EVENTS = [
  {
    title: "DJ Phoenix",
    link: "https://www.alibitelluride.com/calendar#eca-event=dj-phoenix-1",
    description: "DJ Phoenix, a 30-year veteran of the Colorado house music scene, takes the decks at The Alibi for a late-night set. Expect an experienced hand behind the turntables bringing energy to one of Telluride's favorite local venues.",
    pubDate: "2026-11-27",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://1v09t9hszk.ucarecd.net/ca6338a4-f816-4b2d-9519-f999c902da9f/-/crop/1877x750/0,2065/-/preview/"
  },
  {
    title: "Private Event",
    link: "https://www.alibitelluride.com/calendar#eca-event=closed-private-event",
    description: "A private live music event is taking place at The Alibi in Telluride. The venue is not open to the general public for this occasion; those with questions or interest in attending can reach out directly to the venue for more information.",
    pubDate: "2026-12-03",
    time: "5:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://1v09t9hszk.ucarecd.net/ab087872-1df0-4d51-8ebb-db3437d32780/"
  },
  {
    title: "Private Event",
    link: "https://www.alibitelluride.com/calendar#eca-event=private-event-2",
    description: "A private live music event is taking place at The Alibi in Telluride. The venue is not open to the general public for this occasion; those with questions or inquiries can reach out directly to the venue for more information.",
    pubDate: "2026-12-08",
    time: "5:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://1v09t9hszk.ucarecd.net/fc1ad9d1-f11b-4aca-9636-5b95b6e3c307/"
  },
  {
    title: "The Regular",
    link: "https://www.alibitelluride.com/calendar#eca-event=the-regular",
    description: "The Regular is a folk rock band based in Denver, Colorado, performing live at The Alibi. The band brings their folk rock sound to Telluride for a late-night show.",
    pubDate: "2026-12-10",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://1v09t9hszk.ucarecd.net/4a5f4c4e-4a85-416f-bf68-4a874717300c/-/crop/1380x1380/233,0/-/preview/"
  },
  {
    title: "Easy Jim Residency Night 1",
    link: "https://www.alibitelluride.com/calendar#eca-event=easy-jim-residency",
    description: "Easy Jim takes the stage at The Alibi for the first night of a residency engagement, bringing live music to this Telluride bar venue. The residency format promises multiple nights of performances in an intimate setting.",
    pubDate: "2026-12-11",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://1v09t9hszk.ucarecd.net/5a0e2028-07e8-4974-b039-d62e8ab44ab4/"
  },
  {
    title: "Easy Jim Residency Night 2",
    link: "https://www.alibitelluride.com/calendar#eca-event=easy-jim-residency-1",
    description: "Easy Jim continues their residency at The Alibi with a late-night performance on the second of what appears to be a multi-night run at the beloved Telluride bar. The residency format promises an intimate, unhurried evening of live music in one of the town's most familiar local venues.",
    pubDate: "2026-12-12",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://1v09t9hszk.ucarecd.net/5a0e2028-07e8-4974-b039-d62e8ab44ab4/"
  },
  {
    title: "Wild Love Tigress",
    link: "https://www.alibitelluride.com/calendar#eca-event=wild-love-tigress",
    description: "Wild Love Tigress is a funk band performing live at The Alibi, bringing an expansive sound that includes horns and backing singers. The show starts at 9:00 PM.",
    pubDate: "2026-12-17",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://1v09t9hszk.ucarecd.net/abac4fc9-1234-481d-af73-ae5227ee3cfb/-/crop/660x330/0,96/-/preview/"
  },
  {
    title: "Joint Point",
    link: "https://www.alibitelluride.com/calendar#eca-event=joint-point",
    description: "Joint Point is an original jam band from Colorado known for blending adventurous rock with improvisational, genre-spanning musicianship. The group performs at The Alibi in Telluride, bringing their signature live sound to an intimate late-night setting.",
    pubDate: "2026-12-19",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://1v09t9hszk.ucarecd.net/5caa6e55-bef5-4af0-b673-ba480ad8ced1/-/crop/2048x820/0,163/-/preview/"
  },
  {
    title: "Mascolo - NYE DJ Set",
    link: "https://www.alibitelluride.com/calendar#eca-event=mascolo-nye-dj-set",
    description: "Mascolo, a French-American vocalist, multi-instrumentalist, and producer, takes the decks at The Alibi for a New Year's Eve DJ set. The night offers a live music sendoff to 2026 at one of Telluride's beloved local venues.",
    pubDate: "2026-12-31",
    time: "8:30 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://1v09t9hszk.ucarecd.net/c5b3912c-a04e-4a42-b283-66695bb266a4/-/crop/2922x1168/0,1910/-/preview/"
  },
  {
    title: "Easy Jim Residency Night 1",
    link: "https://www.alibitelluride.com/calendar#eca-event=easy-jim-residency-2",
    description: "Easy Jim takes the stage at The Alibi for the first night of a residency engagement, bringing live music to the bar in downtown Telluride. The residency format promises multiple nights of performances from the act in the weeks ahead.",
    pubDate: "2027-01-16",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://1v09t9hszk.ucarecd.net/5a0e2028-07e8-4974-b039-d62e8ab44ab4/"
  },
  {
    title: "Easy Jim Residency Night 2",
    link: "https://www.alibitelluride.com/calendar#eca-event=easy-jim-residency-3",
    description: "Easy Jim continues their residency at The Alibi with a second night of live music. The late-night show is part of an ongoing series at the beloved Telluride bar.",
    pubDate: "2027-01-17",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://1v09t9hszk.ucarecd.net/5a0e2028-07e8-4974-b039-d62e8ab44ab4/"
  }
];

/* Sheridan Opera House events — refreshed by syncSheridanEvents() every 6 hours.
 * Schema mirrors WILKINSON_EVENTS: { title, link, description, pubDate,
 * endDate?, source, sourceLabel, category, location, imageUrl }.
 * pubDate is the start date (ISO YYYY-MM-DD). endDate is present only on
 * multi-day shows. events.html renders multi-day events as ONE card on
 * the start date with "Jun 1 — Jun 5" subtitle.
 *
 * Seeded 2026-05-29 with the 3 events that were live on Sheridan's
 * /events/ page at the time of wiring (so the Events tab shows
 * something on Day 1 instead of waiting for the next 6-hour refresh).
 * Bot overwrites this on first run. */
const SHERIDAN_EVENTS = [

];

// Telluride Venture Network — entrepreneurial-ecosystem bootcamps from
// tellurideventurenetwork.com/tvn-events/ (hand-curated; bots don't touch).
// Multi-day programs: pubDate is the start date; run dates noted in the
// description. events.html's 60-day window hides past/concluded cohorts
// (e.g. the Feb–Mar 2026 Strategy & Growth Bootcamp).
const TELLURIDE_VENTURE_EVENTS = [];

// West End / regional venue event feeds (Tribe Events API), bot-managed by
// content-refresh.js Tasks 11-13 + Sherbino. Declared empty here so the bot's
// splice has a target; they populate on the next content-refresh run and are
// consumed by events.html + the weekly email.
const NUCLA_NATURITA_EVENTS = [];
const CLUB_RED_SHOWS = [];
const FRESH_FOOD_HUB_EVENTS = [];
const SHERBINO_EVENTS = [
  {
    title: "The Sherbino & Citizens State Bank Present: Winter Wildlands Alliance BACKCOUNTRY FILM FEST",
    href: "https://sherbino.org/event/the-sherbino-presents-winter-wildlands-alliance-backcountry-film-fest/",
    date: "2026-11-18 18:30:00",
    endDate: "2026-11-18 20:30:00",
    location: "The Sherbino, Ridgway",
    copy: "Winter Wildlands presents the Backcountry Film Festival at the Sherbino—an inspiring night of human-powered adventure and winter storytelling. ❄️🎬 📅 November 18, 2026 | Doors 6 PM • Films 6:30 PM @ TICKETS The Sherbino and CSB Present: Winter Wildlands Alliance Backcountry Film Festival Doors: 6:00pm || Films: 6:30pm || $10 students and seniors (18-/ 65+) || $15 General Admission The Backcountry Film Festival, presented by Winter Wildlands Alliance, celebrates the power and spirit of humans in winter. Since its inception, the festival has toured across states, countries—even Antarctica—screening hundreds of inspiring films that celebrate adventure, conservation, and the magic of winter. Over the years, the festival has raised millions of dollars to support local projects that strengthen winter communities and protect our wild snowscapes. The 2026-27 winter season is the 22nd Anniversary of the Backcountry Film Festival! …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/10/Backcountry-Film-Fest-Banner-Nov-18.png"
  },
  {
    title: "Cosmic Luau with PSYLO",
    href: "https://sherbino.org/event/cosmic-luau-with-psylo/",
    date: "2026-11-20 19:30:00",
    endDate: "2026-11-20 21:30:00",
    location: "The Sherbino, Ridgway",
    copy: "Cosmic Luau with PSYLO is a dancehall-style show at The Sherbino Theater in Ridgway, featuring a light show by Lumagic. The event combines tropical and psychedelic themes in a limited-seating venue setting.",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/10/PSYLO-SHERB-26-A1C-scaled.jpg",
    description: "Cosmic Luau with PSYLO is a dancehall-style show at The Sherbino Theater in Ridgway, featuring a light show by Lumagic. The event combines tropical and psychedelic themes in a limited-seating venue setting."
  },
  {
    title: "Noel Night Gift to the Community! THE HIP SNACKS",
    href: "https://sherbino.org/event/noel-night-free-show-the-hip-snacks/",
    date: "2026-12-04 20:30:00",
    endDate: "2026-12-04 22:00:00",
    location: "The Sherbino, Ridgway",
    copy: "The Hip Snacks perform live at The Sherbino in Ridgway as part of Noel Night, an annual free community celebration presented by the Ouray County Performing Arts Guild and The Sherbino. Entry is by donation, with doors opening at 8:00 p.m. and the show beginning at 8:30 p.m. in a standing-room setting.",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/07/NOEL-NIGHT.png",
    description: "The Hip Snacks perform live at The Sherbino in Ridgway as part of Noel Night, an annual free community celebration presented by the Ouray County Performing Arts Guild and The Sherbino. Entry is by donation, with doors opening at 8:00 p.m. and the show beginning at 8:30 p.m. in a standing-room setting."
  },
  {
    title: "Family Gingerbread House Decorating",
    href: "https://sherbino.org/event/family-gingerbread-house-decorating-ridgway/",
    date: "2026-12-05 10:00:00",
    endDate: "2026-12-05 12:00:00",
    location: "The Sherbino, Ridgway",
    copy: "A beloved Ouray County holiday tradition held at The Sherbino in Ridgway, this family-friendly event invites all ages to decorate gingerbread houses with candy and icing on a Saturday morning from 10:00am to noon. Gingerbread houses are available for $20 each.",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/11/864479175_1594584442706599_7214255078047042247_n-1.jpg",
    description: "A beloved Ouray County holiday tradition held at The Sherbino in Ridgway, this family-friendly event invites all ages to decorate gingerbread houses with candy and icing on a Saturday morning from 10:00am to noon. Gingerbread houses are available for $20 each."
  },
  {
    title: "Colorado Gives Day 2026",
    href: "https://sherbino.org/event/colorado-gives-day-2026-sherbino/",
    date: "2026-12-08 00:00:00",
    endDate: "2026-12-08 23:30:00",
    location: "Ridgway, CO",
    copy: "Support The Sherbino this Colorado Gives Day! Early giving is open now, and Colorado Gives Day is December 8, 2026. Help sustain live music, film, arts, cultural programming, and community gatherings in Ridgway. @ The Sherbino Joins Colorado Gives Day to Keep Arts, Culture, and Community Thriving in Ridgway Early giving is underway for the December 8 statewide celebration of generosity, supporting year-round cultural programming and the spaces that bring people together. The Sherbino (Ridgway Chautauqua) is joining thousands of Colorado nonprofits for Colorado Gives Day on Tuesday, December 8, 2026. The statewide giving movement encourages Coloradans to support the organizations that strengthen their communities. While Colorado Gives Day officially takes place December 8, early giving is open now, allowing supporters to make donations throughout November and early December. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/11/Support-The-Sherbino_-Colorado-Gives-Day-1.png"
  },
  {
    title: "Monthly Welcome Home Alliance Veteran's Coffee at the Sherbino",
    href: "https://sherbino.org/event/monthly-welcome-home-alliance-veterans-coffee-at-the-sherbino/2026-12-08/",
    date: "2026-12-08 10:00:00",
    endDate: "2026-12-08 12:00:00",
    location: "Ridgway, CO",
    copy: "The Welcome Home Alliance hosts its monthly veterans' coffee gathering at the Sherbino in Ridgway, offering a relaxed space for veterans to connect with one another and with community support. It's a recurring informal meetup centered on camaraderie and peer connection for those who have served.",
    imageUrl: "https://sherbino.org/wp-content/uploads/2023/01/Vet-Coffee.png",
    description: "The Welcome Home Alliance hosts its monthly veterans' coffee gathering at the Sherbino in Ridgway, offering a relaxed space for veterans to connect with one another and with community support. It's a recurring informal meetup centered on camaraderie and peer connection for those who have served."
  },
  {
    title: "Matchstick Productions ~ The Way Out ~ Presented by The Sherbino",
    href: "https://sherbino.org/event/matchstick-productions-the-way-out-presented-by-the-sherbino/",
    date: "2026-12-09 18:30:00",
    endDate: "2026-12-09 20:00:00",
    location: "The Sherbino, Ridgway",
    copy: "Matchstick Productions' 34th annual ski film, *The Way Out*, screens at The Sherbino in Ridgway, celebrating the culture and lifestyle of skiing. Doors open at 6:00pm with the film beginning at 6:30pm, with discounted admission available for students and seniors.",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/10/The-Way-out-Matchstick-banner-1.png",
    description: "Matchstick Productions' 34th annual ski film, *The Way Out*, screens at The Sherbino in Ridgway, celebrating the culture and lifestyle of skiing. Doors open at 6:00pm with the film beginning at 6:30pm, with discounted admission available for students and seniors."
  },
  {
    title: "The Sherbino Presents: Before Words There Were Birds: An Old Caw Medicine Show with Poetry, Storytelling, Music & More",
    href: "https://sherbino.org/event/before-words-there-were-birds-december-12/",
    date: "2026-12-12 18:00:00",
    endDate: "2026-12-12 19:30:00",
    location: "The Sherbino, Ridgway",
    copy: "A multi-disciplinary live performance at The Sherbino in Ridgway, \"Before Words There Were Birds: An Old Caw Medicine Show\" brings together poetry, storytelling, music, and more in a seated evening show. The event features an ensemble of performers and poets in what promises to be an eclectic, genre-blending night of spoken and musical art.",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/10/words-birds.png",
    description: "A multi-disciplinary live performance at The Sherbino in Ridgway, \"Before Words There Were Birds: An Old Caw Medicine Show\" brings together poetry, storytelling, music, and more in a seated evening show. The event features an ensemble of performers and poets in what promises to be an eclectic, genre-blending night of spoken and musical art."
  },
  {
    title: "Mountainfilm on Tour – Ridgway",
    href: "https://sherbino.org/event/mountainfilm-on-tour-ridgway-2026/",
    date: "2026-12-15 18:30:00",
    endDate: "2026-12-15 20:30:00",
    location: "The Sherbino, Ridgway",
    copy: "Mountainfilm on Tour brings a curated selection of short films from the acclaimed Telluride-based Mountainfilm festival to The Sherbino in Ridgway. The touring program typically features documentary and adventure films celebrating outdoor culture, environmental issues, and human achievement.",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/10/sherb-and-wca-EVENT-BANNERS-1920-x-1080-2.png",
    description: "Mountainfilm on Tour brings a curated selection of short films from the acclaimed Telluride-based Mountainfilm festival to The Sherbino in Ridgway. The touring program typically features documentary and adventure films celebrating outdoor culture, environmental issues, and human achievement."
  }
];

// Beacon — outreach to seasonal / young-adult workers (beacontelluride.com).
// Maintained by the `beacon-events-refresh` scheduled task, which re-reads
// https://www.beacontelluride.com/upcoming-events weekly and re-derives this
// array. The page lists events in PROSE (specific dates + recurring weekly),
// so the task uses AI extraction + computes upcoming occurrences. Paused/
// seasonal items (Ski Days, Adopt-a-Liftie) are intentionally omitted until
// they resume. Safe to hand-edit between runs.
const BEACON_EVENTS = [
  {
    title: "Weekly Young Adult Gathering",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "A weekly gathering downstairs at The Well for food, conversation, and bible study.",
    date: "2026-11-17",
    time: "6:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "The Well, 122 S Aspen",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Ski and Board Days",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "Once a week, young adults gather over lunch to ski and board together.",
    date: "2026-11-20",
    time: "11:00 AM-1:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "Beacon, Telluride",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Weekly Young Adult Gathering",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "A weekly gathering downstairs at The Well for food, conversation, and bible study.",
    date: "2026-11-24",
    time: "6:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "The Well, 122 S Aspen",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Ski and Board Days",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "Once a week, young adults gather over lunch to ski and board together.",
    date: "2026-11-27",
    time: "11:00 AM-1:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "Beacon, Telluride",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Weekly Young Adult Gathering",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "A weekly gathering downstairs at The Well for food, conversation, and bible study.",
    date: "2026-12-01",
    time: "6:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "The Well, 122 S Aspen",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Friday Feast",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "A twice-a-month free home cooked dinner for lifties and all other seasonal workers, provided by The Alpine Chapel. April 2nd is a Luau at Lift Ops, 11-1 pm.",
    date: "2026-12-04",
    time: "5:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "The Well Coffee Shop",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Ski and Board Days",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "Once a week, young adults gather over lunch to ski and board together.",
    date: "2026-12-04",
    time: "11:00 AM-1:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "Beacon, Telluride",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Weekly Young Adult Gathering",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "A weekly gathering downstairs at The Well for food, conversation, and bible study.",
    date: "2026-12-08",
    time: "6:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "The Well, 122 S Aspen",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Clothing Swap",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "A clothing swap event held at Billies Restaurant.",
    date: "2026-12-10",
    time: "7:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "Billies Restaurant",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Ski and Board Days",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "Once a week, young adults gather over lunch to ski and board together.",
    date: "2026-12-11",
    time: "11:00 AM-1:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "Beacon, Telluride",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Coffee House Nights",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "An evening of good coffee, games, and local community. Hosted at The Coffee Cowboy (Dec 12) and The Well (Jan 15 and Jan 29).",
    date: "2026-12-12",
    time: "7:00-9:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "Beacon, Telluride",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Weekly Young Adult Gathering",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "A weekly gathering downstairs at The Well for food, conversation, and bible study.",
    date: "2026-12-15",
    time: "6:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "The Well, 122 S Aspen",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Friday Feast",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "A twice-a-month free home cooked dinner for lifties and all other seasonal workers, provided by The Alpine Chapel. April 2nd is a Luau at Lift Ops, 11-1 pm.",
    date: "2026-12-18",
    time: "5:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "The Well Coffee Shop",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Ski and Board Days",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "Once a week, young adults gather over lunch to ski and board together.",
    date: "2026-12-18",
    time: "11:00 AM-1:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "Beacon, Telluride",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Weekly Young Adult Gathering",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "A weekly gathering downstairs at The Well for food, conversation, and bible study.",
    date: "2026-12-22",
    time: "6:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "The Well, 122 S Aspen",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Moonlight Skin and Ski",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "An uphill skin to the top of lift 10; no experience necessary. $10 equipment rentals available.",
    date: "2026-12-25",
    time: "",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "Beacon, Telluride",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Ski and Board Days",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "Once a week, young adults gather over lunch to ski and board together.",
    date: "2026-12-25",
    time: "11:00 AM-1:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "Beacon, Telluride",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Meal Prep/Cooking Classes at AH HAA School for the Arts",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "Meal prep and cooking classes held at AH HAA School for the Arts.",
    date: "2027-01-06",
    time: "6:00-8:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "AH HAA School for the Arts",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Friday Feast",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "A twice-a-month free home cooked dinner for lifties and all other seasonal workers, provided by The Alpine Chapel. April 2nd is a Luau at Lift Ops, 11-1 pm.",
    date: "2027-01-08",
    time: "5:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "The Well Coffee Shop",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Coffee House Nights",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "An evening of good coffee, games, and local community. Hosted at The Coffee Cowboy (Dec 12) and The Well (Jan 15 and Jan 29).",
    date: "2027-01-15",
    time: "7:00-9:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "Beacon, Telluride",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Moonlight Skin and Ski",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "An uphill skin to the top of lift 10; no experience necessary. $10 equipment rentals available.",
    date: "2027-01-20",
    time: "",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "Beacon, Telluride",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Friday Feast",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "A twice-a-month free home cooked dinner for lifties and all other seasonal workers, provided by The Alpine Chapel. April 2nd is a Luau at Lift Ops, 11-1 pm.",
    date: "2027-01-22",
    time: "5:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "The Well Coffee Shop",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Coffee House Nights",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "An evening of good coffee, games, and local community. Hosted at The Coffee Cowboy (Dec 12) and The Well (Jan 15 and Jan 29).",
    date: "2027-01-29",
    time: "7:00-9:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "Beacon, Telluride",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Friday Feast",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "A twice-a-month free home cooked dinner for lifties and all other seasonal workers, provided by The Alpine Chapel. April 2nd is a Luau at Lift Ops, 11-1 pm.",
    date: "2027-02-05",
    time: "5:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "The Well Coffee Shop",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Dodgeball Tournament",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "A dodgeball tournament open to seasonal workers and the community.",
    date: "2027-02-07",
    time: "7:00-9:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "Beacon, Telluride",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Moonlight Skin and Ski",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "An uphill skin to the top of lift 10; no experience necessary. $10 equipment rentals available.",
    date: "2027-02-17",
    time: "",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "Beacon, Telluride",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Friday Feast",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "A twice-a-month free home cooked dinner for lifties and all other seasonal workers, provided by The Alpine Chapel. April 2nd is a Luau at Lift Ops, 11-1 pm.",
    date: "2027-02-19",
    time: "5:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "The Well Coffee Shop",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Friday Feast",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "A twice-a-month free home cooked dinner for lifties and all other seasonal workers, provided by The Alpine Chapel. April 2nd is a Luau at Lift Ops, 11-1 pm.",
    date: "2027-03-05",
    time: "5:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "The Well Coffee Shop",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  }
];


// Telluride Chamber Music concerts (telluridechambermusic.org/events).
// Bot-refreshed by the chamber-music-events-refresh scheduled task.
const CHAMBER_MUSIC_EVENTS = [
  {
    title: "Telluride Community Concert - January",
    link: "https://telluridechambermusic.org/concert/telluride-community-concert--september",
    description: "An hour of free chamber music for community.",
    date: "2027-01-21",
    time: "5:30 PM",
    source: "chamber-music",
    sourceLabel: "Telluride Chamber Music",
    category: "Concert",
    location: "Telluride Science and Innovation Center",
    imageUrl: "https://telluridechambermusic.org/concerts/telluride-community-concert--september.webp"
  },
  {
    title: "Chill with Chamber Music! — Norwood",
    link: "https://telluridechambermusic.org/concert/norwood-aug",
    description: "An hour of gorgeous music in the West End.",
    date: "2027-01-28",
    time: "6:00 PM",
    source: "chamber-music",
    sourceLabel: "Telluride Chamber Music",
    category: "Concert",
    location: "The Livery, Norwood, CO",
    imageUrl: "https://telluridechambermusic.org/concerts/norwood-aug.webp"
  },
  {
    title: "Stewart Goodyear",
    link: "https://telluridechambermusic.org/concert/stewart-goodyear",
    description: "One of the great pianists of this generation performing Beethoven, Ravel and Gershwin.",
    date: "2027-02-03",
    time: "7:00 PM",
    source: "chamber-music",
    sourceLabel: "Telluride Chamber Music",
    category: "Concert",
    location: "Michael D. Palm Theatre",
    imageUrl: "https://telluridechambermusic.org/concerts/stewart-goodyear.webp"
  },
  {
    title: "Tom Stone, Gary Hoffman & Chloe Mun",
    link: "https://telluridechambermusic.org/concert/tom-stone-gary-hoffman-chloe-mun",
    description: "An exceptional piano trio.",
    date: "2027-03-09",
    time: "7:00 PM",
    source: "chamber-music",
    sourceLabel: "Telluride Chamber Music",
    category: "Concert",
    location: "Michael D. Palm Theatre",
    imageUrl: "https://telluridechambermusic.org/concerts/tom-stone-gary-hoffman-chloe-mun.webp"
  }
];


const TELLURIDE_FOUNDATION_EVENTS = [
  {
    title: "Creating with AI: The Tools Worth Using & How to Actually Use Them",
    link: "https://telluridefoundation.org/tf-events/",
    description: "If you've been overwhelmed by the surge of AI tools and aren't sure what's actually useful, this workshop cuts through the noise. Hands-on workshop covering text, images and logos, video creation, and website building. No coding, design, or AI experience required. Free; space limited to 50; RSVP required.",
    pubDate: "2026-06-12T13:00:00",
    source: "tf",
    sourceLabel: "Telluride Foundation",
    category: "Community Event",
    location: "Telluride Innovation Center, Telluride, CO",
    imageUrl: "https://telluridefoundation.org/wp-content/uploads/2026/05/Creating-with-AI-1-scaled.png"
  },
  {
    title: "16th Annual Rundola",
    link: "https://telluridefoundation.org/tf-events/",
    description: "Independence Day uphill foot race from the Gondola base in Telluride to the top of San Sophia Ridge, supporting the Good Neighbor Fund (emergency financial assistance for locals in crisis). Family-friendly; medals + prizes; custom Rundola swag for every participant. Race start 7:30 a.m. Registration opens May 11, 2026.",
    pubDate: "2026-07-04T07:30:00",
    source: "tf",
    sourceLabel: "Telluride Foundation",
    category: "Community Event",
    location: "Telluride Gondola Plaza, Telluride, CO",
    imageUrl: "https://telluridefoundation.org/wp-content/uploads/2026/06/rundola26_680x440.jpg"
  },
  {
    title: "The Dual Challenge: Climate and Energy",
    link: "https://telluridefoundation.org/tf-events/",
    description: "A Town Talk panel discussion on what meeting humanity's energy needs while keeping a healthy planet actually requires, featuring climate and energy experts. Free; presented in partnership with Telluride Science.",
    pubDate: "2026-07-28T18:30:00",
    source: "tf",
    sourceLabel: "Telluride Foundation",
    category: "Community Event",
    location: "Telluride Innovation Center, Telluride, CO",
    imageUrl: "https://telluridefoundation.org/wp-content/uploads/2026/06/0728-TT_320-x-212-TF.jpg"
  }
];

const OURAY_COUNTY_EVENTS = [

];

const OURAY_RIDGWAY_EVENTS = [
  {
    title: "Gaper Contest 2026 - Voyager FUNdraiser",
    link: "https://events.ourayridgwayevents.com/event/gaper-contest-2026",
    description: "A community photo contest and fundraiser for Voyager inviting locals of all ages from the northern San Juan region to submit their best \"gaper\" photos for a chance to be named Gaper of the Year. Voting takes place during Gaper Week, November 21–29, 2026, coinciding with the opening week of Telluride Ski Resort.",
    pubDate: "2026-11-20T15:00:00.000Z",
    endDate: "2026-11-29",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/54366527548837/huge/4c3995fa47f3b861d61e318e7dafd3cbfa9b02e9.jpg"
  },
  {
    title: "Guided Tour: Historic Beaumont Hotel & Spa",
    link: "https://events.ourayridgwayevents.com/event/guided-tour-historic-beaumont-hotel-spa",
    description: "Explore Our Story: Historic Tours at the Beaumont Hotel Step into a world of elegance and intrigue with our guided historic tours. Built in 1886, the Beaumont Hotel has stood witness to the colorful history of Ouray, Colorado. Our tours offer a behind-the-scenes look at the hotel’s original architecture, fascinating stories, and notable guests. Perfect for history lovers and curious travelers alike. The Beaumont Hotel has been a cherished landmark in Ouray, hosting dignitaries, celebrities, and visitors from around the world, making it a prime sight for any vacation. Its Victorian architecture and luxurious details have made it an iconic destination for those looking to explore Colorado’s past. Tickets must be purchased before 12:00 pm the day of selected tour.",
    pubDate: "2026-11-20T20:30:00.000Z",
    endDate: "2027-01-19",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Beaumont Hotel & Spa",
    imageUrl: "https://localist-images.azureedge.net/photos/54028675143904/huge/ebfc00389a64e579a48a893200a2e27823511c3a.jpg"
  },
  {
    title: "STEAM Art Explorers for Ages 5–8 in Montrose",
    link: "https://events.ourayridgwayevents.com/event/steam-art-explorers-for-ages-58-in-montrose",
    description: "MONTROSE AFTER SCHOOL ART SESSION 1 (5 WEEKS • OCTOBER 23 – NOVEMBER 20) Join us for a 5-week course that explores the intersection of art, science, technology, engineering, and math! In this hands-on art class, students will experiment with creative processes that turn scientific concepts into exciting works of art. Through a variety of fun projects, students will investigate chemical reactions, motion, light, color, and patterns. Projects include creating fizzy paintings using bubbling chemical reactions, experimenting with movement and gravity through pendulum painting, designing kaleidoscopes to explore symmetry and reflection, and making colorful lava lamps to investigate density and liquid interactions. Students will also take on collaborative challenges, activities, and movement games to build creativity, experimentation, problem-solving, and teamwork. With encouragement and plenty of opportunities to experiment, students will grow their artistic skills and confidence while embracing their creativity. …",
    pubDate: "2026-11-20T22:45:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Montrose",
    imageUrl: "https://localist-images.azureedge.net/photos/54055496965288/huge/4ac547d8a4681a49d4e49d0024729211c03874a6.jpg"
  },
  {
    title: "Jean Sandoval & the Town Kids",
    link: "https://events.ourayridgwayevents.com/event/jean-sandoval-the-town-kids",
    description: "Jean Sandoval & the Town Kids are performing live music at a venue on North Cora Street in Ridgway. The event is listed through the Ouray Ridgway community calendar.",
    pubDate: "2026-11-20T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Familiar Grounds - Marcie Reed Whiton and Wellington Martins",
    link: "https://events.ourayridgwayevents.com/event/familiar-grounds-marcie-reed-whiton-and-wellington-martins",
    description: "Join us for Familiar Ground, an exhibition bringing together two friends and their creative lives. A celebration of the people we meet, the places we remember, and the materials that inspire us. Featuring portraits and paintings by Marcie Reed Whiton and photography and woodworking by Wellington Martins, the exhibition is meant to feel a little like walking into someone's living room: a collection of familiar faces, places, memories, and personal discoveries, all sharing the same space. It's an invitation to put your feet up, look around, and get inspired by the familiar. On view throughout November 30.",
    pubDate: "2026-11-21T00:00:00.000Z",
    endDate: "2026-12-01",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Space to Create Art Gallery",
    imageUrl: "https://localist-images.azureedge.net/photos/54472722974882/huge/75812f0dd549dfd8b3d96bcdbbbdbf4949f9ff80.jpg"
  },
  {
    title: "Free Community Thanksgiving Dinner",
    link: "https://events.ourayridgwayevents.com/event/free-community-thanksgiving-dinner",
    description: "We are offering a free thanksgiving dinner to our Community. Cocktails at 5:00pm and free dinner at 6:00pm. Donations are welcome!",
    pubDate: "2026-11-21T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Elks Lodge #492",
    imageUrl: "https://localist-images.azureedge.net/photos/54499361055853/huge/0cf92b9806986d9583c378d0494670d2b5658cfb.jpg"
  },
  {
    title: "PSYLO at The Sherbino",
    link: "https://events.ourayridgwayevents.com/event/psylo-at-the-sherbino",
    description: "PSYLO brings a Cosmic Luau to The Sherbino in Telluride, promising an evening that blends psychedelic vibes with tropical flair. The event is hosted at The Sherbino, one of the area's well-known community and performance venues.",
    pubDate: "2026-11-21T02:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/54284857340278/huge/1ca7afcc7bf4922a6b8dfc622234079f2bc22c0d.jpg"
  },
  {
    title: "Every Sat. Floating Sound Bath",
    link: "https://events.ourayridgwayevents.com/event/floating-sound-bath-4324",
    description: "A weekly group experience at Orvis Hot Springs combining floating in warm water with live sound therapy, including vocals and singing bowls. Participants receive gentle aquatic massage during the session; advance reservations are required and pricing is on a sliding scale.",
    pubDate: "2026-11-21T22:00:00.000Z",
    endDate: "2027-01-16",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Orvis Hot Springs",
    imageUrl: "https://localist-images.azureedge.net/photos/54329446861527/huge/5ff492866a14a5e49ce0e515c6d714c1010eeea6.jpg"
  },
  {
    title: "Turkey Bingo",
    link: "https://events.ourayridgwayevents.com/event/turkey-bingo-at-greenwoods",
    description: "A fundraiser hosted by RACC at Greenwood's, Turkey Bingo offers community members a chance to win a free turkey by playing bingo, with a suggested donation supporting Ridgway area businesses. Thanksgiving pies made at Greenwood's will also be available for pickup at the event.",
    pubDate: "2026-11-22T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Greenwood's",
    imageUrl: "https://localist-images.azureedge.net/photos/54506676236668/huge/8d0f2807c6d13cff029995c2dc89a1a23b1cf2d8.jpg"
  },
  {
    title: "LIVE JAZZ IN THE GARDEN! Zan Waller & Stefan Davenport",
    link: "https://events.ourayridgwayevents.com/event/live-music-in-the-garden-zan-waller-stefan-davenport-1540",
    description: "Zan Waller on trumpet and Stefan Davenport on guitar perform as Standard Alchemy, playing swing, cocktail jazz, and Great American Songbook standards in Chloe's Secret Garden. The outdoor music series runs Sundays from 4:00–7:00 p.m. at Chloe's Charcuterie & Wine, with occasional special guest vocalists joining the duo.",
    pubDate: "2026-11-22T23:00:00.000Z",
    endDate: "2027-01-17",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Chloe's Charcuterie & Wine",
    imageUrl: "https://localist-images.azureedge.net/photos/53950055817938/huge/4924d3606a12c233af2b47a380c304869dfaf267.jpg"
  },
  {
    title: "Healing Hearts Circle: Women Transcending Cancer/Chronic Illness",
    link: "https://events.ourayridgwayevents.com/event/healing-hearts-circle-women-transcending-cancerchronic-illness",
    description: "A recurring support circle at Bee True You Wellness & Creative Studio for women navigating cancer or chronic illness, offering a safe and welcoming space that honors the whole person — body, mind, and spirit. The group provides connection and mutual support for women at any stage of their journey, meeting most Sundays.",
    pubDate: "2026-11-23T00:00:00.000Z",
    endDate: "2026-12-07",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Bee True You Wellness & Creative Studio",
    imageUrl: "https://localist-images.azureedge.net/photos/54241462626167/huge/7c0778035e072ff933b617f21809b1459dc84aca.jpg"
  },
  {
    title: "Thanksgiving Break - Ridgway Schools",
    link: "https://events.ourayridgwayevents.com/event/thanksgiving-break-ridgway-schools",
    description: "Ridgway Schools will be closed for Thanksgiving break during this period. Students, staff, and families can expect the district to be on holiday recess in observance of the Thanksgiving holiday.",
    pubDate: "2026-11-23T07:00:00.000Z",
    endDate: "2026-11-27",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52196842516113/huge/34c03f502c2e6b24c2bdceae7a155d7b6d463e8f.jpg"
  },
  {
    title: "Stuff a Cruiser",
    link: "https://events.ourayridgwayevents.com/event/stuff-a-cruiser",
    description: "Please join us for our Ouray County \"Stuff a Cruiser\" Thanksgiving Food Drive! We will be “stuffing” a sheriff's office patrol car on Monday, November 23 from 8:30 AM -10:30 AM at City Hall and then 11AM to 2pm in front of the 4H Event Center in Ridgway. Help us make Thanksgiving special for families in Ouray County!We are accepting food donations to assemble traditional Thanksgiving dinners such as frozen turkeys, stuffing, potatoes, green beans, cranberry sauce, etc. - to be delivered in time for Thanksgiving Day. (Monetary donations are accepted as well - this helps us to continue our community outreach programs)Please contact Jennifer Peterson @ jpeterson@ourayco.gov if you have a family you’d like to add to the list.",
    pubDate: "2026-11-23T15:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray County Fairgrounds and 4H Events Center",
    imageUrl: "https://localist-images.azureedge.net/photos/54373648758769/huge/dc83b365d1d7f782ea6539886204bc8c86a39282.jpg"
  },
  {
    title: "Film Stills from the Ridgway Independent Film Fest",
    link: "https://events.ourayridgwayevents.com/event/copy-of-art-opening-film-stills-ridgway-independent-film-fest",
    description: "The art of the short film is the focus of this exhibition, which extracts the most captivating film stills from this year's selected films, and gives viewers a chance to slow down and really enjoy these images as works of art. In coordination with the annual Independent Film Festival (November 13-15) this show is both a preview and a celebration of the art of short filmmaking.",
    pubDate: "2026-11-23T17:00:00.000Z",
    endDate: "2026-11-30",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53048306784001/huge/b4907ccb0dd0b51c0bd862f76e556e669e3684c2.jpg"
  },
  {
    title: "Senior Lunch by Neighbor to Neighbor",
    link: "https://events.ourayridgwayevents.com/event/senior-lunch-by-neighbor-to-neighbor",
    description: "Senior Lunch Every Monday Seniors meet to share a wonderful lunch, have a chance to socialize and enjoy an entertaining program. Transportation is provided. Neighbor to Neighbor, 970-325-4586.",
    pubDate: "2026-11-23T19:00:00.000Z",
    endDate: "2027-01-18",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/51631061496012/huge/ef9e5facb2d933bc015ffe261fc1ecd0508088c8.jpg"
  },
  {
    title: "Functional Fitness - Strength & Mobility Training For Women",
    link: "https://events.ourayridgwayevents.com/event/functional-fitness-strength-mobility-training-for-women-8391",
    description: "Welcome to Ridgway's functional strength and mobility training for women. Functional means we focus on movements that mimic everyday activities and improve overall mobility, strength and fitness. Exercises often work multiple muscle groups simultaneously, improving coordination and stability. I love the female group setting because we get a chance to really connect and not only get stronger physically but build real community. Come for a drop in and get a taste or commit long term to transformation, vitality and longevity. All levels are welcome. Let's do hard things together! Every Tuesday & Thursday 8:15-9:15 am / Please check the website for dates and sign up! Location: 1075 Sherman St, Suite 201 / Weehawken Dance Studio (RIGS Building on the corner of Sherman and Amelia) Parking and entrance to the building are on N. Amelia St. …",
    pubDate: "2026-11-24T15:15:00.000Z",
    endDate: "2026-12-31",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Ridgway (Old Schoolhouse)",
    imageUrl: "https://localist-images.azureedge.net/photos/54236057466628/huge/10f1882bcc97fe1b7ad4209e2431edd0781a413f.jpg"
  },
  {
    title: "Cimarron Gathering Place",
    link: "https://events.ourayridgwayevents.com/event/cimarron-gathering-place",
    description: "A recurring community gathering for adults at the Ouray County Fairgrounds and 4H Events Center, offering opportunities to socialize, play games, exercise, meet new people, and participate in learning activities. Full schedule details are available at roccnet.org.",
    pubDate: "2026-11-24T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray County Fairgrounds and 4H Events Center",
    imageUrl: "https://localist-images.azureedge.net/photos/54392775177578/huge/a38bc7fc2fd791cdb9dc33b9ee386b3ef236c85e.jpg"
  },
  {
    title: "Friendsgiving Potluck Luncheon at Cimarron Gathering Place",
    link: "https://events.ourayridgwayevents.com/event/cimarron-gathering-place-1041",
    description: "Friendsgiving Potluck Luncheon. Doors Open at 9:30. Lunch served at Noon, Come early to visit and play games. Bring a dish to share. Turkey Provided. All are welcome.",
    pubDate: "2026-11-24T16:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray 4 H Event Center",
    imageUrl: "https://localist-images.azureedge.net/photos/54472221581238/huge/fa6e95b8212ce5651f6273a51fa7ed9684fae611.jpg"
  },
  {
    title: "Ethan Perry",
    link: "https://events.ourayridgwayevents.com/event/ethan-perry-1540",
    description: "Ethan Perry is performing live music at a venue on N Cora Street in Ridgway. The event is listed through the Colorado Boy Depot calendar as part of the local community lineup.",
    pubDate: "2026-11-24T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Tourism Advisory Committee",
    link: "https://events.ourayridgwayevents.com/event/tourism-advisory-committee",
    description: "The Ouray Tourism Advisory Committee (TAC) represents a cross-section of the small businesses, nonprofits, and residents of Ouray. We educate ourselves about best practices in the tourism industry, tourism marketing, and the visitor experience. We gather input, plan, prioritize, measure, and advise the City of Ouray on the best actions to take related to the tourism industry in our community.",
    pubDate: "2026-11-25T00:30:00.000Z",
    endDate: "2026-12-23",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52092171660517/huge/0e628304026c92db25e8df01849c962ac902a3b4.jpg"
  },
  {
    title: "Vinyasa Yoga",
    link: "https://events.ourayridgwayevents.com/event/vinyasa-yoga",
    description: "Vinyasa Yoga: Wednesdays 8:15-9:15 am This is a dynamic practice that will challenge, strengthen, and uplift you both physically and mentally. This practice moves through seven doorways or stages, starting by creating sacred space and connecting with your breath. Then we light the fire through a series of warmups and vinyasa flow including Surya Namaskar (sun salutations) A, B & C. The warm up prepares the body for strong holding postures and finishes with yin and conscious surrender in savasana. A sweat towel, water, mat and a sense of adventure are strongly suggested. Men are also welcome to join this class! Jenn Turner is a yoga teacher, functional fitness instructor, and retreat facilitator with more than 500 hours of yoga training and 12+ years of experience. Her work weaves together functional movement, breath, strength, mindfulness, and play to help people reconnect with their bodies and inner wisdom. …",
    pubDate: "2026-11-25T15:15:00.000Z",
    endDate: "2026-12-30",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Ridgway (Old Schoolhouse)",
    imageUrl: "https://localist-images.azureedge.net/photos/54236148198717/huge/7d1ebafc567aad82f67c7ba07e1225354b86622c.jpg"
  },
  {
    title: "Water Aerobics",
    link: "https://events.ourayridgwayevents.com/event/water-aerobics",
    description: "Join a self-led water aerobics group every Wednesday (and occasionally Tuesdays and Thursdays!) from 10–11 a.m. at the Ouray Hot Springs Pool. Get a workout, build community, and enjoy a fun, positive atmosphere! Please note: Water aerobics takes place during member-only hours and is open to Ouray Hot Springs members only.",
    pubDate: "2026-11-25T17:00:00.000Z",
    endDate: "2027-01-13",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Hot Springs",
    imageUrl: "https://localist-images.azureedge.net/photos/53887699628224/huge/262efc04b203189edcde410b9973aac1ca778195.jpg"
  },
  {
    title: "Weds Floating Sound Bath",
    link: "https://events.ourayridgwayevents.com/event/floating-sound-bath",
    description: "Group Float in warm healing waters every Wednesday @ 1:30pm. Receive gentle aquatic massage while listening to live sound therapy, vocals, bowls and more. Contact Christian 303-807-1039 to reserve your spot in advance. Please pay in advance. Sliding scale: $35-$85/person.Pay Cash at indoor pool or Venmo to @GOLDENTHREADSTHERAPY. *Orvis entry fee pay seperately.",
    pubDate: "2026-11-25T20:30:00.000Z",
    endDate: "2027-01-13",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Orvis Hot Springs",
    imageUrl: "https://localist-images.azureedge.net/photos/54329351687325/huge/1e81b72abc42fb73374205a2bd7143bee62a33ef.jpg"
  },
  {
    title: "NEW With Weehawken: Beat & Step: West African Dance, Drum & Body Percussion ~ with Performances in The Nutcracker Remixed!",
    link: "https://events.ourayridgwayevents.com/event/new-with-weehawken-beat-step-west-african-dance-drum-body-percussion-with-performances-in-the-nutcracker-remixed",
    description: "Beat & Step: West African Dance, Drum & Body Percussion is an energetic and interactive class that combines traditional West African dance, drumming, and body percussion into one exciting experience. Students will learn dance combinations, explore traditional drumming rhythms that tell stories, and create music using their hands, feet, body, drums, and voice. Along the way, they'll develop coordination, rhythm, musicality, focus, memory, confidence, and teamwork while experiencing the rich cultural traditions of West Africa. No previous dance or music experience is required—just curiosity, energy, and a willingness to learn. Students enrolled in this performance class will showcase what they've learned in our winter production. Dress Code: Students should wear comfortable clothing that allows for plenty of movement. Athletic clothing such as T-shirts, leggings, athletic pants, or shorts is recommended. Please avoid jeans or restrictive clothing. Wear comfortable athletic shoes or sneakers that are clean and reserved for class. …",
    pubDate: "2026-11-25T23:00:00.000Z",
    endDate: "2026-12-02",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Montrose",
    imageUrl: "https://localist-images.azureedge.net/photos/53483890616270/huge/dd89f2f9028ca228db911b8e16c50dc39897358f.jpg"
  },
  {
    title: "Floating Lotus Music Bingo – November & December 2026",
    link: "https://events.ourayridgwayevents.com/event/floating-lotus-music-bingo-november-december-2026",
    description: "Music Bingo at Floating Lotus Brewery! Join us Thursday, November 26 and Thursday, December 10 from 7–9 PM for a high-energy night of music, drinks and bingo-style fun. Listen, mark your card and sing along. Learn more at floatinglotusbrewery.com.",
    pubDate: "2026-11-27T02:00:00.000Z",
    endDate: "2026-12-11",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/51579855188578/huge/de5019ffbfacf4a9f5e85d8a14961584c70e7873.jpg"
  },
  {
    title: "Monsters & Myths by Challenge Island",
    link: "https://events.ourayridgwayevents.com/event/monsters-myths-by-challenge-island",
    description: "A Challenge Island program for kids centered on monsters and myths, featuring themed building and engineering activities inspired by legendary creatures and mythological beasts. The event takes place at the Voyager Youth Program's Ridgway site.",
    pubDate: "2026-11-30T22:00:00.000Z",
    endDate: "2026-12-14",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Voyager Youth Program - Ridgway Site",
    imageUrl: "https://localist-images.azureedge.net/photos/54543483397623/huge/4f3401f8c9cf844d59fb883a46f09a6ba3e5011a.jpg"
  },
  {
    title: "Mamas & Caregivers Connect - Prenatal, Postpartum, and Beyond",
    link: "https://events.ourayridgwayevents.com/event/mamas-caregivers-connect-prenatal-postpartum-and-beyond",
    description: "A community gathering at the Ridgway Public Library for new and expecting mothers to connect and support one another through the prenatal and postpartum journey. The group meets in person and virtually, focusing on breastfeeding confidence, physical recovery, and emotional wellbeing.",
    pubDate: "2026-12-01T18:00:00.000Z",
    endDate: "2027-01-05",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway Public Libary",
    imageUrl: "https://localist-images.azureedge.net/photos/54532606385088/huge/459531119ef8c0df8c5ec458451a30206ae6736e.jpg"
  },
  {
    title: "JUST ADDED: After School Art Now Also on Tuesdays for Ages 5-8",
    link: "https://events.ourayridgwayevents.com/event/just-added-after-school-art-now-also-on-tuesdays-for-ages-5-8",
    description: "SESSION 3 (3 WEEKS • DECEMBER 1 – DECEMBER 15) Please note: Tuesday is an additional day of our After School Art class, offering the same projects and activities as the Thursday class. Families should choose either Tuesday or Thursday, as the two days do not follow separate project plans. Each session, students explore exciting themes and projects while experimenting with a wide variety of art materials—from watercolor and acrylic paints to pastels, clay, collage, printmaking, and more. At this age, the focus is on the creative process, with open-ended projects that encourage exploration, imaginative thinking, and personal expression, allowing children to share big ideas and emotions through their artwork. As students make artistic choices and take creative risks, they begin to discover their unique voice while building confidence, fine motor skills, and social connections in a fun, supportive group environment. …",
    pubDate: "2026-12-01T22:15:00.000Z",
    endDate: "2026-12-15",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/54408756809744/huge/2040a00a1c30c15a8ac05388326ccbb70c5c8bbc.jpg"
  },
  {
    title: "Brooke White",
    link: "https://events.ourayridgwayevents.com/event/brooke-white-3226",
    description: "Brooke White is performing live at a venue on N Cora Street in Ridgway. The event is listed through the Colorado Boy Depot calendar as a live music performance.",
    pubDate: "2026-12-01T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Parks and Recreation Committee (PARC)",
    link: "https://events.ourayridgwayevents.com/event/parks-and-recreation-committee-parc",
    description: "The Parks and Recreation Committee (PARC) is made up of community members who volunteer their time to support and enhance recreational opportunities in Ouray. PARC organizes safe, family-friendly events that bring the community together. Events include Broomball, Cabin Fever Days, Dodgeball, Softball, and Game Night, among others. The committee works closely with local organizations, businesses, and other City committees to carry out its mission. Community partners include the Ouray Hot Springs Pool & Fitness Center, the Beautification Committee, and the Ouray School District. PARC also plays an important role in developing and implementing master plans for the City’s park system, helping ensure that Ouray’s parks and recreational spaces serve residents and visitors for years to come. Members of the public are welcome to attend these meetings. Meetings: PARC meets monthly on the first Tuesday at 6:00 p.m. …",
    pubDate: "2026-12-02T01:00:00.000Z",
    endDate: "2027-01-06",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/51579968896083/huge/3675d004ddb2baf273430453088287837487e0f2.jpg"
  },
  {
    title: "Beautification Committee (OBC)",
    link: "https://events.ourayridgwayevents.com/event/beautification-committee",
    description: "The Beautification Committee (OBC) works on projects to help beautify the community. The committee oversees the installation of all the flower gardens in the City as well as all the hanging baskets and plantings on Main Street. They have also worked hard over the years to acquire many historic mining pieces and equipment that are displayed throughout the community to recognize Ouray's mining heritage. The committee has also provided direction on signage, light poles, and benches on the public rights of way. The Beautification Committee also plays an important role in developing and implementing master plans for the City’s park system. The committee makes recommendations to the City Council on these many beautification projects as well as the use of dollars from the Beautification Fund. This fund is supported by a portion of the Lodging Occupation Tax and is used exclusively for projects that help beautify the community. …",
    pubDate: "2026-12-02T15:00:00.000Z",
    endDate: "2027-01-06",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center, San Juan Room",
    imageUrl: "https://localist-images.azureedge.net/photos/50382168464273/huge/9567987a01fc4f1da8e171fabd1eb5b7bdbdccfa.jpg"
  },
  {
    title: "Toddler Storytime Art for Ages 2.5-5",
    link: "https://events.ourayridgwayevents.com/event/toddler-storytimeartfor-ages-25-5",
    description: "TODDLER STORYTIME ART FOR AGES 2.5-5 Wednesdays, 10:00am–11:00am Cora Annex, 145N Cora St, Ridgway Registration: www.weehawkenarts.org Session 1 (4 weeks • $70): September 16 – October 7Session 2 (4 weeks • $70): October 21 – November 11Session 3 (3 weeks • $55): December 2 – December 16Come join us for Storytime + Art! Each week, your child will enjoy story time with songs and finger rhymes, a process‑art project, and a variety of creative sensory play. We end with a quick cleanup, circle time, and movement songs. This class gently supports preschool prep and helps your child develop important school‑readiness skills—such as fine‑motor coordination, independence, and the ability to listen and follow directions—in a warm, supportive setting. Children will grow in: Social, language, and communication skillsFine‑ and gross‑motor coordinationListening and direction‑following abilitiesConfidence, creativity, and imaginationParents and caregivers stay to support their child—but we handle the mess! …",
    pubDate: "2026-12-02T17:00:00.000Z",
    endDate: "2026-12-16",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/53780434962919/huge/3aff831f26d7f9d4824893f89d8fd88416047a44.jpg"
  },
  {
    title: "After School Art for Ages 8-12",
    link: "https://events.ourayridgwayevents.com/event/afterschool-artfor-ages-8-12-7427",
    description: "AFTER SCHOOL ART FOR AGES 8-12 Wednesdays, 3:15–4:45 pm Cora Annex, 145N Cora St, Ridgway Registration: www.weehawkenarts.org Session 1 (4 weeks • $85): September 16 – October 7Session 2 (4 weeks • $85): October 21 – November 11Session 3 (3 weeks • $70): December 2 – December 16Each week, students will explore an exciting theme while experimenting with a wide range of materials and techniques. Drawing inspiration from well-known artists and design styles, young artists will be supported in discovering their own unique creative voice in a fun, nurturing, studio-like setting. These classes are designed to foster a love of the arts through hands-on exploration, age-appropriate projects, and a focus on the joy of the creative process. A student art reception will be held in December. Students will take home their collected works in the days following the event. …",
    pubDate: "2026-12-02T22:15:00.000Z",
    endDate: "2026-12-16",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/53780624349826/huge/2ad5a3657f19d47b14c7833f838ac040c0836f38.jpg"
  },
  {
    title: "Craft & Sip with Emily: \"Pine Needle Ornaments\" (Ages 15+)",
    link: "https://events.ourayridgwayevents.com/event/craft-sip-with-emily-pine-needle-ornaments-ages-15",
    description: "Craft & Sip: \"Pine Needle Ornaments\" Wednesday, December 2nd 6:00pm-8:00pm Cora Annex, Ridgway $49: www.weehawkenarts.org Unwind, get creative, and get into the holiday spirit with a nature-inspired craft & sip! Using natural pine needles, you'll learn basic weaving techniques to create a beautiful border around your chosen wood center, then add your own personal touch with painted designs. Enjoy the calming scent of pine, the meditative rhythm of weaving, and your favorite beverage as you create a one-of-a-kind holiday ornament. No experience necessary—just bring your creativity and enjoy an evening of crafting and relaxation with Emily Knickerbocker! Includes all materials and a beverage. About Emily Knickerbocker: Emily Knickerbocker is an artist and educator based on Colorado’s Western Slope, where the surrounding mountains, valleys, and deserts inspire connection, reflection, and creativity. Her artistic practice centers on natural and repurposed materials, capturing the raw, interconnected qualities of the natural world. …",
    pubDate: "2026-12-03T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/54435016951492/huge/4aedf9cff9cb59b9d7d929dc702bf6ea8b437111.jpg"
  },
  {
    title: "Floating Lotus Trivia Night – December 2026",
    link: "https://events.ourayridgwayevents.com/event/floating-lotus-trivia-night-december-2026",
    description: "Trivia Night at Floating Lotus Brewery! Join us Thursday, December 3 and Thursday, December 17 from 7–9 PM for a lively night of questions, drinks and friendly competition. Grab a table, bring your team, and learn more at floatinglotusbrewery.com.",
    pubDate: "2026-12-04T02:00:00.000Z",
    endDate: "2026-12-18",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/51579855188578/huge/de5019ffbfacf4a9f5e85d8a14961584c70e7873.jpg"
  },
  {
    title: "Steps Tavern Presents Karaoke Night",
    link: "https://events.ourayridgwayevents.com/event/steps-tavern-presents-karaoke-night-6356",
    description: "Steps Tavern Presents Karaoke Night. Doors Open at 8:00 PM every Thursday Night.",
    pubDate: "2026-12-04T03:00:00.000Z",
    endDate: "2027-01-15",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Steps Tavern",
    imageUrl: "https://localist-images.azureedge.net/photos/54528016985213/huge/d5c76d660410708a93445cf6fa31edf1a9f61bf2.jpg"
  },
  {
    title: "23rd Annual Holiday Art & Gift Sale",
    link: "https://events.ourayridgwayevents.com/event/23rd-annual-holiday-art-gift-sale",
    description: "The 23rd Annual Holiday Art & Gift Sale returns to the Decker Community Room, offering handmade work from local artisans and craftspeople. This long-running community tradition provides an opportunity to find one-of-a-kind, locally made gifts during the holiday season.",
    pubDate: "2026-12-05T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/54139018107075/huge/dc77ec311ce3e3367f9e9d6c47ed459172ad9558.jpg"
  },
  {
    title: "First Friday Art Walk",
    link: "https://events.ourayridgwayevents.com/event/first-friday-art-walk",
    description: "A monthly community art walk through downtown Ridgway, where galleries, studios, shops, and gathering spaces open their doors for new exhibitions, artist receptions, live music, and pop-up programming. Each edition offers a fresh lineup of creative experiences spread across the walkable downtown area.",
    pubDate: "2026-12-05T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Downtown Ridgway, CO",
    imageUrl: "https://localist-images.azureedge.net/photos/52941247100302/huge/24aa8ce412f9817ce04becd51e5d1cc5b8db2cad.jpg"
  },
  {
    title: "First Friday at Rootwings Art",
    link: "https://events.ourayridgwayevents.com/event/first-friday-at-rootwings-art-1540",
    description: "Rootwings Art will be open for Ridgway's First Friday Art Walk, featuring local ceramic sculptures and large vessels by artist Andy Nasisse, original oils by Emma Kalff, Bruce Backer's Ravens & Crows, Taos artist Fred Burns fantasy nudes and one of a kind jewelry and ceramics by Vanessa Backer.",
    pubDate: "2026-12-05T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Herran House",
    imageUrl: "https://localist-images.azureedge.net/photos/53312391289791/huge/00a6a9e1834a357256b5925d35f6a6525ff06493.jpg"
  },
  {
    title: "Ridgway Noel Night",
    link: "https://events.ourayridgwayevents.com/event/ridgway-noel-night",
    description: "The holiday spirit is coming to Ridgway! Mark your calendars for Friday, December 4th, as the community comes together for Ridgway's annual Noel Night celebration. This beloved holiday tradition promises an evening filled with festive fun, local shopping, music, food, and plenty of holiday cheer. Enjoy a festive parade, capture special memories with photos with Santa, explore holiday shopping specials at local businesses, and take in live music throughout the celebration. There will also be delicious food and beverages, along with plenty of other surprises to make the evening memorable. Noel Night is a wonderful opportunity to gather with friends and family, support our local businesses, and celebrate everything that makes the Ridgway community so special during the holiday season.",
    pubDate: "2026-12-05T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Hartwell Park - Downtown Ridgway",
    imageUrl: "https://localist-images.azureedge.net/photos/54570029190798/huge/0d9bc2cff135f1c27cef165714ae832277c90167.jpg"
  },
  {
    title: "Weehawken Youth Art Show",
    link: "https://events.ourayridgwayevents.com/event/weehawken-youth-art-show",
    description: "Weehawken Youth Art Show We’re excited to celebrate our after school artists with a public art show featuring all of their beautiful work from this fall semester. Friends, grandparents, siblings, and all community members are warmly welcome to come and enjoy the exhibition and support our young artists. Date: Friday, Noel Night, December 4th Time: 5:00–6:30PM Location: Cora Annex, 145N Cora Street Stick around after the art show to explore Ridgway's open galleries from 5–7pm, then enjoy free live music at the Sherbino at 8pm! And don't miss our annual Family Gingerbread House Decorating event on Saturday, December 5, from 10am–noon at the Ridgway Sherbino Theater! The student art show will include: Student artwork from ages 5-12 on display, some are for sale!Secret Art Agents — kids sneak decorated clothespins onto guests without getting caught!People’s Choice Ribbon — guests place a sticker next to their favorite piece. …",
    pubDate: "2026-12-05T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/54409313649026/huge/33876b40a213c17d393c0bd1992e25d68ea47372.jpg"
  },
  {
    title: "Holiday Radio Show - Snow White & The Seven Dwarfs",
    link: "https://events.ourayridgwayevents.com/event/holiday-radio-show-snow-white-the-seven-dwarfs",
    description: "WHEN? Friday December 4 and Saturday December 5 7:00–8:30 PM WHERE? Wright Opera House 472 Main St., Ouray, Colorado ABOUT THE EVENT Every holiday season, The Wright turns back the clock to the golden age of radio. This year, local actors will perform The Lux Radio Theatre’s “Snow White and the Seven Dwarfs” live on our stage, just as it first aired on December 26, 1938. Hosted and produced by Cecil B. DeMille and sponsored by Lux, this radio adaptation of the Grimm brothers’ fairy tale is reported to be the first Lux broadcast from Hollywood with no studio audience. Every bit of applause listeners heard at home that night was recorded. This time, the applause will be all yours. …",
    pubDate: "2026-12-05T01:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/54348526632482/huge/604e87eee8c39dbb2b988891bb7ae88055edadc5.jpg"
  },
  {
    title: "Noel Night Gift to the Community! THE HIP SNACKS",
    link: "https://events.ourayridgwayevents.com/event/noel-night-gift-to-the-community-the-hip-snacks",
    description: "Doors open at 8:00 PM; music begins at 8:30 PM. The Sherbino’s annual Noel Night gift to the community features Denver rock-n-soul band The Hip Snacks for a free, high-energy evening of live music. Admission is free, with donations gratefully accepted to support Sherbino programming.",
    pubDate: "2026-12-05T03:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/54066526309790/huge/ff0b5de590db048d92f439a0e7d952640d0c3de9.jpg"
  },
  {
    title: "Yule Day",
    link: "https://events.ourayridgwayevents.com/event/yule-day",
    description: "Celebrate Yule Day in Ouray and Ridgway with a magical winter festival for the whole family. Stroll a twinkling village of artisan booths, savor hot cocoa and seasonal treats, enjoy live carolers, and meet Santa in a snowy alpine setting. Kids’ crafts, a community tree-lighting, and cozy fireside storytelling make this a heartwarming holiday tradition—join neighbors and visitors for a sparkling evening of cheer and small-town charm. Schedule of Events: 10:00 AM – 4:00 PM: Elf on the Shelf (Cards located at VC, Library)Adult Black Out Card (Cards located at Marmot's Açai)Library Holiday Market 11:00 AM – 1:00 PM: Cindy Lou Who & Grinch appearances (Visitor Center & Main Street) 12:00 PM – 4:00 PM: At The Wright Opera House Letters to Santa, Cookie Decorating, Hot Cocoa Bar 1:00 PM – 3:00 PM: At The Wright Opera House Photos with Cindy Lou WhoMrs. …",
    pubDate: "2026-12-05T07:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Main Street Ouray",
    imageUrl: "https://localist-images.azureedge.net/photos/52384238613262/huge/9e160cecd96f5b9cd4eba427774e315371414373.jpg"
  },
  {
    title: "Family Gingerbread House Decorating (All Ages!)",
    link: "https://events.ourayridgwayevents.com/event/familygingerbreadhouse-decorating-all-ages",
    description: "Family Gingerbread House Decorating Saturday, 10:00am-Noon (all ages!) Sherbino Ridgway $20 per gingerbread house Get cozy and join us for our annual gingerbread house decorating event! Picture buckets of candy, oodles of frosting, sticky fingers, heaps of smiles, and a kajillion sugar-coated photo ops. Bring your favorite grown-up(s) to decorate your very own sweet gingerbread house. After check-in, you'll find fully assembled houses ready for the magic of your imagination and decoration. Browse tables filled with candy and goodies to embellish your creations with plenty of frosting, then take your house home to enjoy during the holiday season. Please sign up in advance to secure your gingerbread house! Walk-ins are welcome until we reach capacity. Doors open at 10 AM.",
    pubDate: "2026-12-05T17:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/54347358815353/huge/ca3ac0366fd031d94b748e4f9a0fd736807f51ac.jpg"
  },
  {
    title: "6th Annual Festival of Trees",
    link: "https://events.ourayridgwayevents.com/event/6th-annual-festival-of-trees",
    description: "Join us at the Beaumont Hotel Ballroom in Ouray, Colorado, during Ouray’s Annual Yule Celebration for the 6th Annual Festival of Trees! Get into the holiday spirit, admire beautifully decorated trees, and place a bid on your favorite while supporting Peer Kindness and its mission to help end bullying in schools and communities. Bidding opens Wednesday, December 2, and continues throughout the week. The auction closes at 8 PM on Saturday, December 5, following the Ouray Holiday Parade. We’re also looking for sponsors, tree and other donations, and volunteers to help make this year’s festival a success. Interested in getting involved or learning more? Please contact: Beckie Pendergrass: 970-275-1256 Deanna Jakino: 970-749-2891 Amanda Andrews: 970-596-0870 Come celebrate the season, support a meaningful cause, and help make this year’s Festival of Trees a wonderful part of the holidays in Ouray!",
    pubDate: "2026-12-05T18:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Beaumont Hotel & Spa",
    imageUrl: "https://localist-images.azureedge.net/photos/54426336992107/huge/479c4f5831dc9da4cb4faa828ee0b67c07643535.jpg"
  },
  {
    title: "The Beaumont Hotel Christmas Tea",
    link: "https://events.ourayridgwayevents.com/event/the-beaumont-hotel-christmas-tea",
    description: "Celebrate the magic of the holiday season with an elegant Christmas Tea at the historic Beaumont Hotel in beautiful Ouray, Colorado! Join us on Saturday, December 5, for a festive afternoon filled with delicious tea sandwiches, freshly baked scones, and an assortment of sweet treats. Gather your friends, bring the family, and enjoy a charming holiday tradition surrounded by the timeless elegance and historic beauty of the Beaumont Hotel. Whether you're starting a new holiday tradition or continuing a favorite one, Christmas Tea at the Beaumont is the perfect way to slow down, savor the season, and make special memories. EVENT DETAILS 📅 Saturday, December 5, 2026 🕰️ Two Tea Times Available: 1:00 PM 2:45 PM 📍 The Beaumont Hotel Ouray, Colorado 💲 Pricing: Adults: $65 per person Children (10 & under): $35 per person Enjoy an assortment of tea sandwiches, scones, and sweet treats! …",
    pubDate: "2026-12-05T20:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Beaumont Hotel & Spa",
    imageUrl: "https://localist-images.azureedge.net/photos/54480765793368/huge/27d2745cd7b779e3c0ec4325e87b6bd4babd828d.jpg"
  },
  {
    title: "Ouray Yule! Jeep Raffle • Tree Lighting • Holiday Parade",
    link: "https://events.ourayridgwayevents.com/event/ouray-yule-jeep-raffle-tree-lighting-holiday-parade",
    description: "Shopping starts at 10:30 am! Visit our website for a detailed schedule • CLICK HERE Some highlights: 5:00 PM • Jeep Raffle Dusk • Tree Lighting 6:00 PM • Holiday Parade Photos with Santa & storytime with Mrs. Claus Plus much more! See you there! Join us annually on the first Saturday of December to shop for wonderful gifts, light the community tree with us, enjoy a holiday parade down Main Street, spot some favorite Christmas characters, hear a story by Mrs. Claus, get a photo with Santa, and maybe even win a prize. Powered by Ouray Main Street Email mainstreet@cityofouray.com with any questions.",
    pubDate: "2026-12-05T23:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray, CO, USA",
    imageUrl: "https://localist-images.azureedge.net/photos/49789687984733/huge/a57c0755a8845e64cab68694d66e5c6576f4ca9e.jpg"
  },
  {
    title: "Paint & Sip with Nicole: “Snow Topped Treeline\"",
    link: "https://events.ourayridgwayevents.com/event/paint-sip-with-nicole-snow-topped-treeline",
    description: "Paint & Sip with Nicole 6:00pm-8:00pm Weehawken Montrose $49 incl. all supplies and an adult beverage Unwind, sip, and create! Join us for a relaxed painting session designed for all skill levels—no experience needed. Nicole will guide you through the featured painting while you enjoy a beverage of your choice! All art supplies and one adult beverage are included; just bring your creativity! About Nicole Greenfield: Nicole Greenfield is a painter based in Ridgway, Colorado. Working primarily in acrylic and oil, she creates expressive portraits and atmospheric landscapes that explore the quiet intimacy found in observing people and the natural world. Nicole is a self-taught artist who has developed her skills through years of dedicated practice and online learning. …",
    pubDate: "2026-12-06T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Montrose",
    imageUrl: "https://localist-images.azureedge.net/photos/54227072853717/huge/a0d50fe2ccd6f4a1fbad398eed543b67b571aef1.jpg"
  },
  {
    title: "Ridgway Film Club - Film Screening and Discussion",
    link: "https://events.ourayridgwayevents.com/event/ridgway-film-club-8555",
    description: "The Ridgway Film Club hosts a free film screening at the Decker Community Room, followed by a group discussion. The specific film is announced to registered participants via email the week before the event; visit ridgwayfilmclub.wordpress.com to sign up. Sponsored by Ridgway Public Library.",
    pubDate: "2026-12-07T02:00:00.000Z",
    endDate: "2027-01-10",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53056380145290/huge/4bc303dba2f5121125f911d9a1be0c80caa07512.jpg"
  },
  {
    title: "Monthly Karate in Ouray County",
    link: "https://events.ourayridgwayevents.com/event/monthly-karate-in-ouray-county",
    description: "Join Weehawken Creative Arts for Karate with Sensei Kay Briggs. We offer unlimited monthly classes in Ouray County (meaning you can attend each week in Ouray and/or Ridgway — or both). Tuition/registration is DUE the 1st week of the month. Karate class is a great way to learn skills to keep you safe, stay in shape and strong core movements. Karate believes in using it only to protect self and is taught accordingly. Whether you are new to Karate or a seasoned student, the Sensei will work with your level. Taught in the kyokushin kai-kan style, similar shotokan style of karate, we welcome new students to try this exceptional experience for your mind and body! Mixed ages --- Ages 7 through Adult (extended time for more experience) Mondays in Ouray: St. …",
    pubDate: "2026-12-08T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/52253033564264/huge/ef12b5792bac47932752278d68230c7704389412.jpg"
  },
  {
    title: "Monthly Welcome Home Alliance Veteran's Coffee @ The Sherbino",
    link: "https://events.ourayridgwayevents.com/event/monthly-welcome-home-alliance-veterans-coffee-the-sherbino",
    description: "A monthly veterans' gathering hosted by the Welcome Home Alliance at The Sherbino, offering coffee, donuts, and camaraderie for veterans of every branch, era, and ability. Representatives will be on hand to share information on topics including navigating the VA, housing, jobs, and volunteer opportunities.",
    pubDate: "2026-12-08T17:00:00.000Z",
    endDate: "2027-01-12",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/52236172073282/huge/134613035140f6c008febe657f2e7e23acc365e9.jpg"
  },
  {
    title: "Britley & Matt",
    link: "https://events.ourayridgwayevents.com/event/britley-matt-8937",
    description: "Britley & Matt are performing live music at a venue on North Cora Street in Ridgway. The event is listed through the Ouray Ridgway community calendar.",
    pubDate: "2026-12-08T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "After School Art for Ages 5-8",
    link: "https://events.ourayridgwayevents.com/event/afterschool-artfor-ages-5-8-861",
    description: "AFTER SCHOOL ART FOR AGES 5-8 Thursdays, 3:15–4:30 pm Cora Annex, 145N Cora St, Ridgway Registration: www.weehawkenarts.org Session 1 (4 weeks • $85): September 17 – October 8Session 2 (4 weeks • $85): October 22 – November 12Session 3 (3 weeks • $70): December 3 – December 17Each week, students will explore exciting themes and projects while experimenting with a wide variety of art materials—such as watercolor and acrylic paints, oil and chalk pastels, clay, collage, printmaking, and more. Through open-ended projects, students are encouraged to explore their creativity, make artistic choices, take creative risks, and discover their unique artistic voice. Our classes nurture imaginative thinking and storytelling, helping children express big ideas and emotions through visual narratives and personal creations. In addition to sparking imagination, our signature art projects support the development of fine motor skills, confidence, and social-emotional development in a fun group environment. …",
    pubDate: "2026-12-09T22:15:00.000Z",
    endDate: "2026-12-23",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/53780725919104/huge/846566299e8e325221de54dd5a54a0fd6427fbf5.jpg"
  },
  {
    title: "Ouray Public Library Art Opening Reception for Sunny Wick",
    link: "https://events.ourayridgwayevents.com/event/ouray-public-library-art-opening-reception-for-sunny-wick",
    description: "The Ouray Public Library will be hosting an exhibition and sale for the artist, Sunny Wick. An opening reception will take place on Wednesday, December 9 at 5:30 in the library.",
    pubDate: "2026-12-10T00:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Public Library",
    imageUrl: "https://localist-images.azureedge.net/photos/54569031917994/huge/5733e1f1ba7d0b53fe6c6e6aaa534abc50c58db3.jpg"
  },
  {
    title: "Zumba Fitness with Tamra",
    link: "https://events.ourayridgwayevents.com/event/zumba-fitness-with-tamra",
    description: "Zumba is a high-energy, Latin-inspired dance fitness program designed as a fun, accessible workout for all skill levels. It combines fast and slow rhythms with aerobic, interval-training moves to improve cardiovascular health, burn calories, and tone muscles. Classes are often described as a \"fitness party\" that reduces stress. All levels of fitness and dance experience are welcome. Classes are $12 to drop in. Class packs are available for purchase (5 classes for $50, 10 classes for $95). For more information, check out the instructor's website: https://zumba.com/p/zumbafitnesswithTamra or email Tamra at tamra.nichols@icloud.com . For updated class information, including last-minute changes or cancellations, follow the instructor's Zumba Facebook page at https://www.facebook.com/ZumbaFitnesswithTamra .",
    pubDate: "2026-12-10T00:30:00.000Z",
    endDate: "2026-12-17",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52277881680293/huge/b13f129a21efb471bc913e0a6f0a0aa42fa702f4.jpg"
  },
  {
    title: "Weehawken Dance Presents The Nutcracker – Remixed",
    link: "https://events.ourayridgwayevents.com/event/weehawken-dance-presents-the-nutcracker-remixed",
    description: "Weehawken Dance and America’s Mattress present The Nutcracker ~ Remixed, a large-scale community dance production blending classical ballet with contemporary movement, jazz, hip hop, aerial arts and other styles. More than 400 local dancers participate across six split-cast performances at the Montrose Pavilion. Live-stream tickets are expected to become available shortly before each performance.",
    pubDate: "2026-12-10T01:00:00.000Z",
    endDate: "2026-12-13",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Montrose Pavilion",
    imageUrl: "https://localist-images.azureedge.net/photos/54066523355312/huge/65de6aff77e10f2912e9ccfab16467e7d13e6025.jpg"
  },
  {
    title: "Ouray Economic Development Committee",
    link: "https://events.ourayridgwayevents.com/event/ouray-economic-development-committee",
    description: "The Ouray Economic Development Committee (OEDC) works as the liaison between the City and the local business community. This includes creating and implementing an Economic Development Plan and economic development incentives to best serve the business community and to align with programs that induce private investment enterprises and commerce. The committee also explores regional economic development efforts with the Town of Ridgway and Ouray County as well as is tasked with developing a Business Expansion and Retention (BEAR) program, participating in policy discussions and revisions to community planning documents, and making recommendations to the City Council about economic incentive requests.",
    pubDate: "2026-12-10T15:30:00.000Z",
    endDate: "2027-01-14",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52092297170097/huge/a4669339e18604293e5cc63dffd58e4d928eee49.jpg"
  },
  {
    title: "Community Meditation",
    link: "https://events.ourayridgwayevents.com/event/community-meditation-1981",
    description: "Join us for a peer-led meditation series at the Decker Community Room. Free and open to the public!",
    pubDate: "2026-12-11T01:30:00.000Z",
    endDate: "2027-01-15",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/54568874680153/huge/de66bb88b09c1bfd9b24a43eeaaa48672ea59807.jpg"
  },
  {
    title: "Ridgway Wrecking Crew",
    link: "https://events.ourayridgwayevents.com/event/ridgway-wrecking-crew-6009",
    description: "The Ridgway Wrecking Crew is a live music event taking place at a venue on North Cora Street in Ridgway. It is listed on the Ouray Ridgway community calendar as a local music gathering in the area.",
    pubDate: "2026-12-11T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Happy Little Trees: Classes @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/happy-little-trees-classes-the-wright-6743",
    description: "\"ARIZONA SPLENDOR\" Join Emma Kalff for a morning of coffee and painting at the Wright Opera House Community Room. Participants will follow along with a classic Bob Ross episode and create their own Bob Ross–style landscape painting. All supplies are included, and no prior painting experience is necessary. Just bring your curiosity and enjoy a relaxed, creative morning inspired by the joy of painting. FULL SCHEDULE April 11 — Horizons West May 9 — Barn at Sunset June 13 — LIttle House by the Road July 11 — Mountain Splendor August 8 — Quiet Woods September 12 — Arizona Splendor October 3 — Meadow Stream November 7 — Lonely Retreat December 12 — Snow Trail Part of Classes @ the Wright, bringing creativity, learning, and community together in downtown Ouray since Letitia Wright first dreamed it up.",
    pubDate: "2026-12-12T17:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/53644731506912/huge/89ae9ae8e058db83a936dd643f6af477841cd019.jpg"
  },
  {
    title: "Britley & Matt",
    link: "https://events.ourayridgwayevents.com/event/britley-matt-14",
    description: "Britley & Matt are performing live music at a venue on North Cora Street in Ridgway. This community event is listed through the Ouray Ridgway Calendar and takes place in mid-December.",
    pubDate: "2026-12-15T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Decker Room New Volunteer Orientation",
    link: "https://events.ourayridgwayevents.com/event/decker-room-new-volunteer-orientation",
    description: "Join our wonderful volunteer team at the Decker! If you would like to help with Gallery Sitting during open hours, events, and more, please attend a New Volunteer Orientation to get started! You'll learn about the Decker Room and the events and programs that take place here. Volunteers should be able to commit to consistent volunteer hours each month! Email decker@ridgwayfuse.org for info and to RSVP.",
    pubDate: "2026-12-15T23:30:00.000Z",
    endDate: "2027-01-19",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/52568082541214/huge/49b7c4c5e83ca4147b872fdb5be7fe87b78551c5.jpg"
  },
  {
    title: "Canceled: Dec 15, 2026: Ridgway FUSE Creative Main Street - Committee Meeting",
    link: "https://events.ourayridgwayevents.com/event/ridgway-fuse-creative-main-street-committee-meeting",
    description: "Ridgway FUSE, a Creative District & Main Street Program, nurtures the cultural and economic vitality of Ridgway, Colorado All Ridgway FUSE Committee Meetings are open to the public. Click here for agendas and notes. Interested residents may apply to serve on the FUSE committee here. Email Tera Wick at twick@town.ridgway.co.us or call 970-626-5308 x 215 with questions.",
    pubDate: "2026-12-16T00:30:00.000Z",
    endDate: "2027-01-20",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/52305506266326/huge/6e40de5340fac46ca9bf9f33e9c31ed9ab5985ce.jpg"
  },
  {
    title: "Ridgway HS Boys Basketball vs. Caprock Academy",
    link: "https://events.ourayridgwayevents.com/event/ridgway-hs-boys-basketball-vs-caprock-academy",
    description: "The Ridgway High School Boys Basketball team hosts Caprock Academy at the Ridgway Secondary School gym. Admission supports the athletic program, and concessions will be available.",
    pubDate: "2026-12-18T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway Secondary School",
    imageUrl: "https://localist-images.azureedge.net/photos/54471009862513/huge/f3b17047226a66cb00188aee2e68e967d398ed1c.jpg"
  },
  {
    title: "Ridgway Wrecking Crew",
    link: "https://events.ourayridgwayevents.com/event/ridgway-wrecking-crew-1374",
    description: "The Ridgway Wrecking Crew takes the stage for a live music event at a venue on North Cora Street in Ridgway. The show is listed on the Ouray Ridgway community calendar as an evening performance.",
    pubDate: "2026-12-18T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Gin & Gingerbread House Decorating (Ages 21+)",
    link: "https://events.ourayridgwayevents.com/event/gin-gingerbreadhouse-decorating-ages-21",
    description: "Gin & Gingerbread House Decorating Friday, December 18th, 6:00pm-8:00pm (ages 21+ only), Sherbino Ridgway $45 for one gingerbread house for one person decorating$65 for one gingerbread house for two people decorating$90 for one gingerbread house for four people decoratingWeehawken’s beloved adult gingerbread house decorating event is back for another year! Join us for a fun evening of festive creativity, sweet treats, and a little holiday cheer. Register on your own, as a couple, or with a group of up to four. You’ll arrive to find an assembled gingerbread house ready for a little holiday magic! Frosting, decorating materials, and an adult beverage are included. Feel free to bring extra treats and decorations from home to make your creation uniquely yours. Please bring a sheet pan or large box lid to safely transport your gingerbread house home. Ages 21+ only. …",
    pubDate: "2026-12-19T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/54347322700001/huge/bea31d08c13f2b64cf129913f16be0253c37e409.jpg"
  },
  {
    title: "Swimming with Santa",
    link: "https://events.ourayridgwayevents.com/event/swimming-with-santa",
    description: "Get into the holiday spirit with some friendly competition, hot cocoa, and a visit from Santa at the Ouray Hot Springs! Plus, get a Santa Hat when you arrive! On Dec. 19 from 4-6 PM, we'll have pool races followed by visits with Santa. The top racer will go head-to-head with Santa in a final showdown for a 10-punch pass! Everyone who participates in the races will also receive a free glowstick! After the races, Santa will head into the warm pool from 5:30–6:00 PM to visit with kids and take photos. Schedule 4:00 PM: Doors open, get some hot cocoa! 4:30 PM: Race Registration 5:00 PM: Pool races begin 5:30–6:00 PM: Santa visits with kids in the hot pool Come race, cheer on the competitors, or simply enjoy a little holiday fun with Santa at the hot springs!",
    pubDate: "2026-12-19T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Hot Springs",
    imageUrl: "https://localist-images.azureedge.net/photos/54497185467537/huge/e05ed6611f6588659af50658006fd678c5de06b0.jpg"
  },
  {
    title: "Winter Break - Ridgway Schools",
    link: "https://events.ourayridgwayevents.com/event/winter-break-ridgway-schools",
    description: "Winter break for Ridgway Schools begins on this date, giving students and families time off during the holiday season. The break is a scheduled pause in the academic calendar for the Ridgway school district.",
    pubDate: "2026-12-21T07:00:00.000Z",
    endDate: "2027-01-01",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52196842516113/huge/34c03f502c2e6b24c2bdceae7a155d7b6d463e8f.jpg"
  },
  {
    title: "Brooke White",
    link: "https://events.ourayridgwayevents.com/event/brooke-white-6996",
    description: "Brooke White performs live at a venue on N Cora Street in Ridgway, with the event listed through the Ouray Ridgway community calendar. It is a live music performance hosted at the Colorado Boy location in Ridgway.",
    pubDate: "2026-12-22T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "San Juan Skijoring",
    link: "https://events.ourayridgwayevents.com/event/san-juan-skijoring",
    description: "San Juan Skijoring began in 2017 as a non-profit organization and hosts our Skijoring event annually on the second full weekend in January. We strive to have the best event possible and continue giving back to our local youth through scholarships.",
    pubDate: "2027-01-08T07:00:00.000Z",
    endDate: "2027-01-10",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray County Fairgrounds and 4H Events Center",
    imageUrl: "https://localist-images.azureedge.net/photos/53322123681803/huge/097624e051a0d64ba11e239d678e52d038396e92.jpg"
  },
  {
    title: "Ridgway HS Boys Basketball vs. Telluride",
    link: "https://events.ourayridgwayevents.com/event/ridgway-hs-boys-basketball-vs-telluride",
    description: "The Ridgway High School boys basketball team hosts Telluride at Ridgway Secondary School in a league matchup. Admission fees support the athletic program, with concessions available at the gym.",
    pubDate: "2027-01-12T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway Secondary School",
    imageUrl: "https://localist-images.azureedge.net/photos/54471036324426/huge/fc6cf810c04892eebfbf5221c1cc88f3a93b0d8b.jpg"
  }
];

const NORWOOD_EVENTS = [
  {
    title: "Planning And Zoning Commission Meeting",
    link: "https://www.norwoodtown.com/2026-11-16-planning-and-zoning-commission-meeting",
    description: "A regular meeting of the Norwood Planning and Zoning Commission, held under the Town of Norwood. The commission reviews land use applications, development proposals, and zoning matters affecting the Norwood community.",
    pubDate: "2026-11-16T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Board Of Trustees Meeting",
    link: "https://www.norwoodtown.com/2026-11-18-board-of-trustees-meeting",
    description: "The Town of Norwood Board of Trustees will hold a regular meeting on November 18. This is an official government meeting open to the public, providing an opportunity for community members to observe local municipal business and decision-making.",
    pubDate: "2026-11-18T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Senior Meals",
    link: "https://www.norwoodtown.com/2026-11-19-senior-meals",
    description: "A midday community meal program for seniors hosted by the Town of Norwood. It offers older residents a regular opportunity to gather, share a meal, and connect with neighbors.",
    pubDate: "2026-11-19T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "No Senior Meals",
    link: "https://www.norwoodtown.com/2026-11-26-no-senior-meals",
    description: "The Town of Norwood's regular senior meals program will not be held on this date. This notice serves as a reminder for community members who rely on or participate in the senior meals service.",
    pubDate: "2026-11-26T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Closed For Thanksgiving",
    link: "https://www.norwoodtown.com/2026-11-26-closed-for-thanksgiving",
    description: "The Town of Norwood will be closed in observance of Thanksgiving Day. Municipal offices and services will be unavailable, with normal operations expected to resume following the holiday.",
    pubDate: "2026-11-26T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Town Closure",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Senior Meals",
    link: "https://www.norwoodtown.com/2026-12-03-senior-meals",
    description: "A community meal program for seniors hosted by the Town of Norwood. This midday gathering offers older residents an opportunity to share a meal and connect with neighbors.",
    pubDate: "2026-12-03T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Noel Night",
    link: "https://www.norwoodtown.com/2026-12-04-noel-night",
    description: "Noel Night is a community holiday event hosted by the Town of Norwood, bringing residents together to celebrate the season. Held in early December, it offers a festive evening for families and neighbors in the Norwood area.",
    pubDate: "2026-12-04T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Closed For Christmas Day",
    link: "https://www.norwoodtown.com/2026-12-25-closed-for-christmas-day",
    description: "The Town of Norwood will be closed on Christmas Day in observance of the holiday. Municipal offices and services will be unavailable, so residents should plan accordingly for any town business needs.",
    pubDate: "2026-12-25T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Town Closure",
    location: "Norwood, CO",
    imageUrl: ""
  }
];

const MOUNTAIN_VILLAGE_EVENTS = [
  {
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars is a recurring outdoor film series held on Saturday evenings at dusk at the Conference Center Plaza in Mountain Village, running from June 13 through August 15. The community event brings free outdoor cinema to the plaza through the summer season.",
    pubDate: "2026-11-21T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/35410/mus_social_1200x628_2026.png"
  },
  {
    title: "Mind Blown Telluride",
    link: "https://townofmountainvillage.com/explore/events/all-events/mind-blown-telluride-7/",
    description: "Magician Ty Gallenbeck presents Mind Blown Telluride. Since 2016 this highly acclaimed show has become a favorite of locals, tourist and celebrities.",
    pubDate: "2026-11-21T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
  },
  {
    title: "Bike & Brewery Tour",
    link: "https://townofmountainvillage.com/explore/events/all-events/bike-brewery-tour/",
    description: "A guided bicycle tour departing from the Mountain Lodge in Mountain Village, following the Jurassic Trail and Meadows Trail down to Telluride Brewing Co., where riders receive a complimentary beer. The route offers a scenic way to connect Mountain Village to town while visiting local breweries along the way.",
    pubDate: "2026-11-23T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49136/bike-and-brewery-tour-1800x900.jpg"
  },
  {
    title: "Eco- Grief Workshop: Between Grief & Gratitude, Where Love & Loss Meet in a Changing World",
    link: "https://townofmountainvillage.com/explore/events/all-events/eco-grief-workshop-between-grief-gratitude-where-love-loss-meet-in-a-changing-world/",
    description: "A community workshop held in Mountain Village exploring eco-grief — the emotional weight of loss tied to environmental change — alongside gratitude and love as responses to a shifting world. Led by Lauren Norton of Through the Woods Doula and Mollie Theis of EcoAction Partners, in partnership with the Wilkinson Public Library, the program offers space for reflection and connection.",
    pubDate: "2026-11-24T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49601/between_grief_gratitude_web_16_x_9_in.png"
  },
  {
    title: "An Outlaw Thanksgiving at Alloy Kitchen",
    link: "https://townofmountainvillage.com/explore/events/all-events/an-outlaw-thanksgiving-at-alloy-kitchen/",
    description: "A Thanksgiving buffet at Alloy Kitchen in Mountain Lodge Telluride, set around a fire with live music. It's a festive holiday gathering in Mountain Village with an outlaw spirit for those celebrating Thanksgiving in the mountains.",
    pubDate: "2026-11-26T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/50177/lodge-winter-2200x1100-3.jpg"
  },
  {
    title: "Live Music at Mountain Lodge",
    link: "https://townofmountainvillage.com/explore/events/all-events/live-music-at-mountain-lodge/",
    description: "Live music returns to the Après Lounge at Mountain Lodge Telluride in Mountain Village, with local acts performing most Thursdays from 4 to 7 p.m. throughout the winter season. It's a relaxed après-ski setting for enjoying live performances from the local music community.",
    pubDate: "2026-11-26T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/50249/alloy-live-music-1800x900.jpg"
  },
  {
    title: "Mind Blown Telluride",
    link: "https://townofmountainvillage.com/explore/events/all-events/mind-blown-telluride-8/",
    description: "A close-up magic show featuring magician Ty Gallenbeck, held at Mountain Lodge Telluride in Mountain Village. Performances take place most Friday and Saturday nights.",
    pubDate: "2026-11-27T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/50156/mind-blown-listing-2200x1100.jpg"
  },
  {
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars is a recurring outdoor film series hosted at the Conference Center Plaza in Mountain Village, screening on Saturday evenings at dusk. The series runs from June 13 through August 15, bringing community members together for movies in an open-air setting.",
    pubDate: "2026-11-28T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/35410/mus_social_1200x628_2026.png"
  },
  {
    title: "Bike & Brewery Tour",
    link: "https://townofmountainvillage.com/explore/events/all-events/bike-brewery-tour/",
    description: "A guided bicycle tour departing from the Mountain Lodge in Mountain Village, following the Jurassic Trail and Meadows Trail down to Telluride Brewing Co., where riders receive a complimentary beer. The route offers a scenic descent connecting Mountain Village to town, combining outdoor recreation with a stop at a local brewery.",
    pubDate: "2026-11-30T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49136/bike-and-brewery-tour-1800x900.jpg"
  },
  {
    title: "Eco- Grief Workshop: Between Grief & Gratitude, Where Love & Loss Meet in a Changing World",
    link: "https://townofmountainvillage.com/explore/events/all-events/eco-grief-workshop-between-grief-gratitude-where-love-loss-meet-in-a-changing-world/",
    description: "This eco-grief workshop, hosted in Mountain Village, brings together Lauren Norton of Through the Woods Doula, Mollie Theis of EcoAction Partners, and the Wilkinson Public Library to explore the intersection of grief and gratitude in the face of environmental change. The program offers participants a space to process loss and find meaning in their relationship with the natural world.",
    pubDate: "2026-12-01T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49601/between_grief_gratitude_web_16_x_9_in.png"
  },
  {
    title: "Design Review Board Meeting December 2026",
    link: "https://townofmountainvillage.com/explore/events/all-events/december-design-review-board-meeting/",
    description: "The Mountain Village Design Review Board meets for its monthly meeting. Meeting material is typically posted on the Friday before a scheduled meeting.",
    pubDate: "2026-12-03T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/30530/drb-event-new.png"
  },
  {
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars is a recurring outdoor film series hosted at the Conference Center Plaza in Mountain Village, screening on Saturday evenings at dusk. The series runs weekly throughout the summer months, offering a seasonal community gathering under the open sky.",
    pubDate: "2026-12-05T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/35410/mus_social_1200x628_2026.png"
  },
  {
    title: "Mind Blown Telluride",
    link: "https://townofmountainvillage.com/explore/events/all-events/mind-blown-telluride-7/",
    description: "Magician Ty Gallenbeck presents Mind Blown Telluride. Since 2016 this highly acclaimed show has become a favorite of locals, tourist and celebrities.",
    pubDate: "2026-12-05T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
  },
  {
    title: "Mountain Village Community Dinner",
    link: "https://townofmountainvillage.com/explore/events/all-events/mountain-village-community-dinner/",
    description: "A community dinner hosted by Mountain Village, now in its fourth year, bringing together residents and workers of the Mountain Village area for an evening of food and neighborly connection.",
    pubDate: "2026-12-07T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/42542/copy_of_2024_community_dinner_-_blog_header_2.png"
  },
  {
    title: "Bike & Brewery Tour",
    link: "https://townofmountainvillage.com/explore/events/all-events/bike-brewery-tour/",
    description: "A guided bicycle tour originating at the Mountain Lodge in Mountain Village, following the Jurassic Trail and Meadows Trail down to Telluride Brewing Co., where riders receive a complimentary beer. The route offers a scenic descent through Mountain Village and into town.",
    pubDate: "2026-12-07T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49136/bike-and-brewery-tour-1800x900.jpg"
  },
  {
    title: "Mountain Village Merchant Meeting",
    link: "https://townofmountainvillage.com/explore/events/all-events/merchant-meeting/",
    description: "A monthly gathering for Mountain Village merchants, held on the second Tuesday of each month from 10 to 11 a.m. The meeting is offered in a hybrid format, allowing participants to attend either in person or remotely.",
    pubDate: "2026-12-08T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/27556/merchant_event-1.png"
  },
  {
    title: "Eco- Grief Workshop: Between Grief & Gratitude, Where Love & Loss Meet in a Changing World",
    link: "https://townofmountainvillage.com/explore/events/all-events/eco-grief-workshop-between-grief-gratitude-where-love-loss-meet-in-a-changing-world/",
    description: "This workshop, hosted in Mountain Village, brings together facilitators from Through the Woods Doula, EcoAction Partners, and the Wilkinson Public Library to explore the emotional terrain of living through environmental change. It offers a guided space to process feelings of ecological grief and loss alongside moments of gratitude and connection to the natural world.",
    pubDate: "2026-12-08T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49601/between_grief_gratitude_web_16_x_9_in.png"
  },
  {
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars is an outdoor film series hosted at the Conference Center Plaza in Mountain Village, screening movies on Saturday evenings at dusk. The series runs weekly from June 13 through August 15, 2026.",
    pubDate: "2026-12-12T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/35410/mus_social_1200x628_2026.png"
  },
  {
    title: "Mind Blown Telluride",
    link: "https://townofmountainvillage.com/explore/events/all-events/mind-blown-telluride-7/",
    description: "Magician Ty Gallenbeck presents Mind Blown Telluride. Since 2016 this highly acclaimed show has become a favorite of locals, tourist and celebrities.",
    pubDate: "2026-12-12T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
  },
  {
    title: "Bike & Brewery Tour",
    link: "https://townofmountainvillage.com/explore/events/all-events/bike-brewery-tour/",
    description: "A guided bicycle ride departing from the Mountain Lodge in Mountain Village, following the Jurassic Trail and Meadows Trail down to Telluride Brewing Co., where riders receive a complimentary beer. The route takes participants through scenic mountain terrain between Mountain Village and town.",
    pubDate: "2026-12-14T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49136/bike-and-brewery-tour-1800x900.jpg"
  },
  {
    title: "Eco- Grief Workshop: Between Grief & Gratitude, Where Love & Loss Meet in a Changing World",
    link: "https://townofmountainvillage.com/explore/events/all-events/eco-grief-workshop-between-grief-gratitude-where-love-loss-meet-in-a-changing-world/",
    description: "This eco-grief workshop, hosted in Mountain Village, brings together Lauren Norton of Through the Woods Doula, Mollie Theis of EcoAction Partners, and the Wilkinson Public Library to explore the emotional experience of living through environmental change. The program offers participants a space to process feelings of grief and gratitude connected to the natural world.",
    pubDate: "2026-12-15T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49601/between_grief_gratitude_web_16_x_9_in.png"
  },
  {
    title: "Telluride Backcountry Film Festival",
    link: "https://townofmountainvillage.com/explore/events/all-events/telluride-backcountry-film-festival-1/",
    description: "Join Sheep Mountain Alliance for an evening celebrating human-powered adventure, winter storytelling, and public lands advocacy!",
    pubDate: "2026-12-15T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/50264/1920_x_1005_px_cover_centered.jpg"
  },
  {
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars is an outdoor film series hosted at the Conference Center Plaza in Mountain Village, screening movies on Saturday evenings at dusk. The series runs weekly on Saturdays from June 13 through August 15.",
    pubDate: "2026-12-19T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/35410/mus_social_1200x628_2026.png"
  },
  {
    title: "Mind Blown Telluride",
    link: "https://townofmountainvillage.com/explore/events/all-events/mind-blown-telluride-7/",
    description: "Magician Ty Gallenbeck presents Mind Blown Telluride. Since 2016 this highly acclaimed show has become a favorite of locals, tourist and celebrities.",
    pubDate: "2026-12-19T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
  },
  {
    title: "Mind Blown Telluride: Magic with Ty Gallenbeck",
    link: "https://townofmountainvillage.com/explore/events/all-events/mind-blown-telluride-magic-with-ty-gallenbeck/",
    description: "A close-up magic show featuring magician Ty Gallenbeck, held at Mountain Lodge Telluride in Mountain Village. The show runs most Friday and Saturday nights as an ongoing series.",
    pubDate: "2026-12-19T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/50161/mind-blown-listing-2200x1100.jpg"
  }
];

const TELLURIDE_COM_EVENTS = [
  {
    title: "Gondola Closed for Maintenance",
    link: "https://www.telluride.com/event/gondola-closes-for-maintenance/",
    description: "The gondola will be closed for maintenance starting October 26 and will re-open for winter at 6:30 a.m. on November 20, …",
    pubDate: "2026-10-26",
    endDate: "2027-05-20",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/45301/i-5fmsgs6-5k-2100x1400-d6f22d2a-6109-408c-9f35-051a33841613.800x533.webp"
  },
  {
    title: "Gondola Re-Opens for Winter",
    link: "https://www.telluride.com/event/gondola-reopens-for-the-season/",
    description: "The gondola, which closes temporarily for maintenance during the off-season, re-opens on Friday, November 20 for the …",
    pubDate: "2026-11-20",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/42687/winter_gondola_telluride.800x533.webp"
  },
  {
    title: "Girl Winter Film Tour",
    link: "https://www.telluride.com/event/girl-winter-film-tour/",
    description: "You’ve heard of “Girl Dinner” – the perfectly chaotic spread of favorite snacks, little treats, and whatever …",
    pubDate: "2026-11-20",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63705/gwft-banner-16x9-horizontal-2048x1152.800x533.webp"
  },
  {
    title: "Turkey Bingo",
    link: "https://www.telluride.com/event/turkey-bingo/",
    description: "This local favorite event returns again for another year! Bring your white t-shirts and be ready for a good time …",
    pubDate: "2026-11-21",
    endDate: "2026-11-23",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/45445/screenshot_2023-11-02_at_1_14_16_pm.800x533.webp"
  },
  {
    title: "An Outlaw Thanksgiving",
    link: "https://www.telluride.com/event/an-outlaw-thanksgiving-at-alloy-kitchen/",
    description: "An Outlaw Thanksgiving at Alloy Kitchen in Mountain Lodge Telluride, Mountain Village. A fire-lit Thanksgiving buffet …",
    pubDate: "2026-11-26",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/64180/lodge-winter-2200x1237.800x533.webp"
  },
  {
    title: "Turkey Trot",
    link: "https://www.telluride.com/event/san-miguel-county-turkey-trot/",
    description: "Join San Miguel County for the annual family holiday tradition, the  Turkey Trot 5K- Fun Run/Walk. Admission is free. …",
    pubDate: "2026-11-26",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/43699/screenshot_2026-11-12_at_1_22_13_pm.800x533.webp"
  },
  {
    title: "Live Music at Mountain Lodge",
    link: "https://www.telluride.com/event/live-music-at-alloy-kitchen/",
    description: "Live music all winter at Mountain Lodge Telluride in Mountain Village. Local acts play the Après Lounge from 4 to 7 …",
    pubDate: "2026-11-26",
    endDate: "2027-04-05",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62862/lodge-winter-2200x1237-6.800x533.webp"
  },
  {
    title: "Mind Blown",
    link: "https://www.telluride.com/event/mind-blown/",
    description: "Magician Ty Gallenbeck presents Mind Blown Telluride. Since 2016 this highly acclaimed show has become a favorite of …",
    pubDate: "2026-11-27",
    endDate: "2027-03-27",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/36321/couch_1600x900.800x533.webp"
  },
  {
    title: "DJ Phoenix",
    link: "https://www.telluride.com/event/dj-phoenix/",
    description: "DJ Phoenix is a 30 year veteran of the Colorado house music scene and no stranger to Telluride party culture. Long time …",
    pubDate: "2026-11-27",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/64408/screenshot_2026-11-19_at_2_36_47_pm.800x533.webp"
  },
  {
    title: "Will Ski 4 Food",
    link: "https://www.telluride.com/event/will-ski-4-food/",
    description: "After an unforgettable world premiere at Snowbasin Resort, Will Ski 4 Food is headed to Telluride. Come spend an …",
    pubDate: "2026-11-28",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/64295/will-ski-4-food.800x533.webp"
  },
  {
    title: "Wreaths for Rescues",
    link: "https://www.telluride.com/event/wreaths-for-rescues/",
    description: "Celebrate your beloved pets, past & present, by making a festive pet-themed holiday wreath. Adela Floral will lead …",
    pubDate: "2026-12-03",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/64277/wreaths_for_rescues_square.800x533.webp"
  },
  {
    title: "Holiday Arts Bazaar",
    link: "https://www.telluride.com/event/holiday-arts-bazaar/",
    description: "A LOCAL HOLIDAY TRADITION SINCE 1983 Shop local. Find something one-of-a-kind. Give handmade this holiday season. The …",
    pubDate: "2026-12-04",
    endDate: "2026-12-07",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/36627/hab-2026-2200x1237-w-sponsor.800x533.webp"
  },
  {
    title: "Spongebob the Musical",
    link: "https://www.telluride.com/event/spongebob-the-musical/",
    description: "Local 6th–8th graders dive into a singing, dancing adventure under the sea! When the citizens of Bikini Bottom …",
    pubDate: "2026-12-04",
    endDate: "2026-12-07",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63715/telluride_event_images_2200_x_1237_px.800x533.webp"
  },
  {
    title: "Telluride Ski Resort Opening Day 2026",
    link: "https://www.telluride.com/event/telluride-ski-resort-opening-day/",
    description: "Telluride Ski Resort has pushed its opening to Saturday, December 5. Join us for opening weekend with plenty to do on …",
    pubDate: "2026-12-05",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/42692/telluride_skier.800x533.webp"
  },
  {
    title: "Chanukah in Telluride/Mountain Village",
    link: "https://www.telluride.com/event/chanukah-in-telluride/",
    description: "Celebrate the Festival of Lights in Telluride at Chabad’s 5th Annual Menorah Lighting and Chanukah Celebration! Join …",
    pubDate: "2026-12-08",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/56409/screenshot_2026-11-20_at_1_31_23_pm.800x533.webp"
  },
  {
    title: "Noel Night",
    link: "https://www.telluride.com/event/noel-night/",
    description: "Noel Night marks the beginning of the holiday season with the lighting of the ceremonial Ski Tree, and shopping at …",
    pubDate: "2026-12-09",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/28866/noelnight-9-2100x1400-68fad2f3-c123-4d8b-bca6-f74e15695306.800x533.webp"
  },
  {
    title: "Telluride Art Walk",
    link: "https://www.telluride.com/event/telluride-art-walk/",
    description: "The Telluride Art Walk is a lively monthly celebration of art, community, and creativity in downtown Telluride and …",
    pubDate: "2026-12-09",
    endDate: "2027-05-28",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/36708/download_2.800x533.webp"
  },
  {
    title: "The Regular",
    link: "https://www.telluride.com/event/the-regular/",
    description: "The Regular is a folk rock band based in Denver, CO. Originally formed in Chicago, IL, in 2014, the band's frontman, …",
    pubDate: "2026-12-10",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/64412/screenshot_2026-11-19_at_2_38_27_pm.800x533.webp"
  },
  {
    title: "PI Avy Fund Backcountry Chat",
    link: "https://www.telluride.com/event/pi-avy-fund-backcountry-chat/",
    description: "Join the Telluride Mountain Club and PI Avy Fund for their first Backcountry Chat of the season! We will cover several …",
    pubDate: "2026-12-10",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/64280/dsc02424.800x533.webp"
  },
  {
    title: "WinterSing!",
    link: "https://www.telluride.com/event/telluride-choral-society-wintersing/",
    description: "Telluride Choral Society's annual celebration of Holiday music featuring the Telluride adult Chorale and Youth Choir. A …",
    pubDate: "2026-12-11",
    endDate: "2026-12-13",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/45744/download_7.800x533.webp"
  },
  {
    title: "Easy Jim",
    link: "https://www.telluride.com/event/easy-jim/",
    description: "“Settle back, easy Jim…” The iconic lyric from Robert Hunter’s Althea captured the spirit of the band when it …",
    pubDate: "2026-12-11",
    endDate: "2027-03-13",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/52961/easy_jim_gotoheaven_eventbrite-ezgif_com-webp-to-jpg-converter.800x533.webp"
  },
  {
    title: "Mountain Village Holiday Prelude",
    link: "https://www.telluride.com/event/mountain-village-holiday-prelude/",
    description: "Mountain Village will once again be transformed into the North Pole for this year’s Holiday Prelude celebration on …",
    pubDate: "2026-12-12",
    endDate: "2026-12-14",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/35913/holidayprelude-103.800x533.webp"
  },
  {
    title: "Après at 9,545",
    link: "https://www.telluride.com/event/apres-at-9-545-subshift/",
    description: "Après at 9,545 kicks off the winter on the pool deck at Mountain Lodge Telluride, 9,545 feet up in Mountain Village. …",
    pubDate: "2026-12-12",
    endDate: "2027-04-03",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/64198/lodge-winter-2200x1237.800x533.webp"
  },
  {
    title: "Palm Art Dance Presents: Neverland",
    link: "https://www.telluride.com/event/palm-art-dance-presents-neverland/",
    description: "Palm Arts Dance presents Neverland at the Michael D. Palm Theatre. From age three to eighteen, this performance will …",
    pubDate: "2026-12-12",
    endDate: "2026-12-14",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/64374/neverland_2026_pr_image_4_93_x_3_87_in.800x533.webp"
  },
  {
    title: "Warren Miller&#039;s \"Days Off\"",
    link: "https://www.telluride.com/event/warren-millers-days-off/",
    description: "Celebrate the season with Warren Miller’s 77th annual ski and snowboard film, Days Off, coming to the Sheridan Opera …",
    pubDate: "2026-12-12",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63712/1789488966-daysoff.800x533.webp"
  },
  {
    title: "Telluride Backcountry Film Festival",
    link: "https://www.telluride.com/event/telluride-backcountry-film-festival/",
    description: "Join Sheep Mountain Alliance for an evening celebrating human-powered adventure, winter storytelling, and public lands …",
    pubDate: "2026-12-15",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/61598/1920_x_1005_px_cover_centered.800x533.webp"
  },
  {
    title: "Wild Love Tigress",
    link: "https://www.telluride.com/event/wild-love-tigress/",
    description: "An explosive funk band complete with horns, backing singers and the full spectrum of hairstyles, Wild Love Tigress …",
    pubDate: "2026-12-17",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/64416/screenshot_2026-11-19_at_2_55_27_pm.800x533.webp"
  },
  {
    title: "Elf the Musical",
    link: "https://www.telluride.com/event/elf-the-musical/",
    description: "Buddy, an orphan, mistakenly crawls into Santa’s bag and is transported to the North Pole. To find his father, Buddy …",
    pubDate: "2026-12-17",
    endDate: "2026-12-25",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63709/elf_instagram.800x533.webp"
  },
  {
    title: "The Very Merry Market",
    link: "https://www.telluride.com/event/the-very-merry-market/",
    description: "Celebrate the season at The Very Merry Market - a cozy, one-day holiday makers’ market inside the Telluride …",
    pubDate: "2026-12-22",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/60167/website_event_header_image_2000x1000.800x533.webp"
  },
  {
    title: "Christmas Eve Torchlight Parade",
    link: "https://www.telluride.com/event/christmas-eve-torchlight-parade/",
    description: "The Christmas Eve Torchlight Parade will start at the top of the Gondola and head down into the Town of Telluride. …",
    pubDate: "2026-12-24",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/43838/img_0715_rb-2100x1335-500d5271-0938-4018-a4ed-fd9c1cfeb5de.800x533.webp"
  },
  {
    title: "Christmas Day Buffet",
    link: "https://www.telluride.com/event/christmas-day-buffet-at-alloy-kitchen/",
    description: "Christmas Day buffet at Alloy Kitchen in Mountain Lodge Telluride, Mountain Village, on Friday, December 25, from 3 to …",
    pubDate: "2026-12-25",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/64201/maddyb-2026-alloy-women-toast-wide-6ab42305e0333.800x533.webp"
  },
  {
    title: "Sheridan Arts Foundation Holiday Rewind: A Tribute Concert Series",
    link: "https://www.telluride.com/event/sheridan-arts-foundation-holiday-concert-series/",
    description: "Join the Sheridan Arts Foundation for five nights of world-class entertainment at the historic Sheridan Opera House. …",
    pubDate: "2026-12-26",
    endDate: "2027-01-03",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/49719/sheridan-opera-house.800x533.webp"
  },
  {
    title: "Tease the Season: A Holiday Burlesque",
    link: "https://www.telluride.com/event/tease-the-season-a-holiday-burlesque/",
    description: "Join the Telluride Theatre at the Sheridan Opera House for Tease the Season, a Holiday Burlesque. It's a special night …",
    pubDate: "2026-12-26",
    endDate: "2026-12-28",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/55819/holidayburlesque2025_hero_1920x1080-min.800x533.webp"
  },
  {
    title: "Roy Rivers: A John Denver Tribute",
    link: "https://www.telluride.com/event/roy-rivers-a-john-denver-tribute/",
    description: "Roy Rivers has spent a lifetime following the thread that first drew him to music: songs with heart, melody, and a …",
    pubDate: "2026-12-28",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63690/screenshot_2026-10-01_at_12_48_31_pm.800x533.webp"
  },
  {
    title: "Karl Denson&#039;s Afro Sonic",
    link: "https://www.telluride.com/event/karl-densons-afro-sonic/",
    description: "For almost four decades, Karl Denson has been one of American music’s most in-demand horn players and bandleaders — …",
    pubDate: "2026-12-29",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63693/karl-denson-pic-2026.800x533.webp"
  },
  {
    title: "Sabotage: A Beastie Boys Tribute",
    link: "https://www.telluride.com/event/sabotage-a-beastie-boys-tribute/",
    description: "Get ready to fight for your right to party. Sabotage brings the legendary sound, attitude, and high-energy chaos of …",
    pubDate: "2026-12-30",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63696/sabotage_-_sheridan_opera_house_2.800x533.webp"
  },
  {
    title: "New Year&#039;s Eve Torchlight Parade & Fireworks",
    link: "https://www.telluride.com/event/new-years-eve-torchlight-parade-fireworks/",
    description: "Watch as Telluride Ski and Snowboard School instructors meander down the mountain with torches to light up the …",
    pubDate: "2026-12-31",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/43841/torch2-2100x1400-0321debd-b521-4a85-89e7-ae7e6aba206f.800x533.webp"
  },
  {
    title: "Mascolo",
    link: "https://www.telluride.com/event/mascolo/",
    description: "Mascolo is a French-American vocalist, multi-instrumentalist, and producer.\n\nHis signature sound is crafted from a mix …",
    pubDate: "2026-12-31",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/64422/screenshot_2026-11-19_at_2_59_01_pm.800x533.webp"
  },
  {
    title: "Sixtiesmania",
    link: "https://www.telluride.com/event/sixtiesmania/",
    description: "Rewind to the ’60s! Break out the mod dresses, go-go boots, velvet sport coats and big hair.\n\nRing in 2027 at a …",
    pubDate: "2026-12-31",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63699/soh_photo_1.800x533.webp"
  },
  {
    title: "Falco & Book Play Jerry Garcia",
    link: "https://www.telluride.com/event/falco-book-play-jerry-garcia/",
    description: "Rewind to the ’60s! Break out the mod dresses, go-go boots, velvet sport coats and big hair.\n\nRing in 2027 at a …",
    pubDate: "2027-01-02",
    endDate: "2027-01-04",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63702/falcobookportwashington-19.800x533.webp"
  },
  {
    title: "Augment Music at the SHOW Bar",
    link: "https://www.telluride.com/event/augment-music-at-the-show-bar/",
    description: "The Sheridan Arts Foundation is teaming up with Augment Music to present four free evenings of live music at SHOW Bar …",
    pubDate: "2027-01-05",
    endDate: "2027-03-30",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/64385/augment-at-show-bar-1.800x533.webp"
  },
  {
    title: "Teton Gravity Research&#039;s \"Actually, It Is Rocket Science\"",
    link: "https://www.telluride.com/event/teton-gravity-researchs-actually-it-is-rocket-science/",
    description: "Actually, It Is Rocket Science is a tongue-in-cheek look at the seemingly reckless abandon that many of the world’s …",
    pubDate: "2027-01-08",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63796/screenshot-2026-10-12-at-10_30_44-am.800x533.webp"
  },
  {
    title: "The Lone Bellow",
    link: "https://www.telluride.com/event/the-lone-bellow/",
    description: "With their upcoming sixth studio album, “What A Time To Be Alive” , The Lone Bellow embarks on a bold new chapter …",
    pubDate: "2027-01-19",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63802/the-lone-bellow-ezgif_com-webp-to-jpg-converter.800x533.webp"
  }
];

const PAPER_LOGOS = {
  ttimes: {
    name: 'The Telluride Times',
    img: 'https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg',
    url: 'https://www.telluridenews.com/news/legals/article_098f3ce9-59f7-4232-9cfb-c60ee8c3cac0.html'
  },
  ttimes_mar12: {
    name: 'The Telluride Times',
    img: 'https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg',
    url: 'https://www.telluridenews.com/news/legals/article_f5335947-f1c5-4d4e-8ab7-3b50a58ab55f.html'
  },
  ttimes_mar5: {
    name: 'The Telluride Times',
    img: 'https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg',
    url: 'https://www.telluridenews.com/news/legals/article_d3d895fe-19d3-4c6f-89f2-0f6ac32f19b5.html'
  },
  npost: {
    name: 'The Norwood Post',
    img: '',
    svg: '<svg viewBox="0 0 90 14" style="height:13px;width:auto;"><text x="0" y="12" font-family="Georgia,serif" font-weight="bold" font-size="12" fill="#222">The Norwood Post</text></svg>',
    url: 'https://www.telluridenews.com/norwood_post/legals/article_c23ef3df-a055-4ff6-ba7a-f277ef70197b.html'
  },
  ttimes_mar26: {
    name: 'The Telluride Times',
    img: 'https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg',
    url: 'https://www.telluridenews.com/news/legals/article_aa40e482-7008-4eda-9975-91e506726631.html'
  },
  ttimes_apr2: {
    name: 'The Telluride Times',
    img: 'https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg',
    url: 'https://www.telluridenews.com/news/legals/article_aec96dee-01bf-4370-b831-16a17257d9ff.html'
  },
  county_web: {
    name: 'San Miguel County',
    img: 'https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=12524',
    url: 'https://www.sanmiguelcountyco.gov/CivicAlerts.aspx'
  }
};

const LEGAL_ENTITY_LOGOS = {
  county: '<img src="/logo/San%20Miguel%20County.png" alt="San Miguel County">',
  mv: '<img src="/logo/Mountain%20village%20Town.jpg" alt="Mountain Village">',
  telluride: '<img src="/logo/Telluride%20Town.png" alt="Town of Telluride">',
  housing: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 21V10l9-7 9 7v11H3z" fill="#6b3fa0" opacity="0.15"/><path d="M3 21V10l9-7 9 7v11" stroke="#6b3fa0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><rect x="9" y="14" width="6" height="7" rx="0.5" fill="#6b3fa0" opacity="0.3"/><path d="M9 14h6v7H9z" stroke="#6b3fa0" stroke-width="1.2"/><circle cx="12" cy="6" r="0" fill="none"/><path d="M7 21h10" stroke="#6b3fa0" stroke-width="1.8" stroke-linecap="round"/></svg>',
  ridgway: '<img src="/logo/Ridgway%20Town.png" alt="Town of Ridgway">',
  norwood: '<img src="/logo/Norwood%20Town.jpeg" alt="Town of Norwood">',
  assessor: '<img src="/logo/San%20Miguel%20County.png" alt="San Miguel County Assessor">',
  state: '<img src="/logo/Colorado%20Logo.jpg" alt="State of Colorado">',
  water_court: '<img src="logo/water Court.png" alt="Water Court">',
  ophir: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 18l4-6 4 3 4-5 4 8H4z" fill="#5a7a3a" opacity="0.2"/><path d="M4 18l4-6 4 3 4-5 4 8" stroke="#5a7a3a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="18" cy="6" r="2" fill="#d4a017"/></svg>',
  shavano: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#3a8a3a" stroke-width="1.5" fill="#3a8a3a" opacity="0.1"/><path d="M8 15c0-3 2-5 4-7 2 2 4 4 4 7" stroke="#3a8a3a" stroke-width="1.5" stroke-linecap="round" fill="#3a8a3a" opacity="0.2"/><path d="M12 8v8M9 13h6" stroke="#3a8a3a" stroke-width="1.2" stroke-linecap="round"/></svg>'
};

const LEGAL_NOTICES = [
  {
    title: "Ridgway Bids & Requests for Proposals",
    entity: "Town of Ridgway",
    entityClass: "ent-ridgway",
    entityLogo: "ridgway",
    icon: "📋",
    iconClass: "type-rfp",
    type: "Bids / RFP",
    filterTag: "public-entity",
    summary: "The Town of Ridgway posts active bids and requests for proposals on their website. Check the link for currently open solicitations. Town Hall: 201 N. Railroad St., Ridgway, CO 81432 · (970) 626-5308.",
    expires: "2026-12-31",
    url: "https://townofridgway.colorado.gov/resources/requests-for-proposals/bids"
  },
  {
    title: "Request for Proposal -- Painting of the San Miguel County Jail",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking qualified respondents for: Painting of the San Miguel County Jail.",
    deadline: "Open until contracted",
    expires: "2026-11-25",
    dates: "8/27",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=209",
    address: "",
    smcBidID: "209"
  },
  {
    title: "Request for Proposal -- 2028 Multi-Jurisdictional All-Hazard Mitigation Plan Update",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking qualified respondents for: 2028 Multi-Jurisdictional All-Hazard Mitigation Plan Update.",
    deadline: "Closes 0/12/2026",
    expires: "2026-12-06",
    dates: "9/7",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=210",
    address: "",
    smcBidID: "210"
  },
  {
    title: "Request for Proposal -- Consulting Services for a Comprehensive Review of the Telluride Employee Rental Housing Policies",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "Town of Telluride is seeking qualified respondents for: Consulting Services for a Comprehensive Review of the Telluride Employee Rental Housing Policies.",
    deadline: "Closes 0/14/2026",
    expires: "2026-12-20",
    dates: "9/21",
    url: "https://www.telluride.gov/bids.aspx?bidID=132",
    address: "",
    totBidID: "132"
  },
  {
    title: "Request for Proposal -- San Miguel County Housing Action Plan",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking qualified respondents for: San Miguel County Housing Action Plan.",
    deadline: "Open until contracted",
    expires: "2027-01-14",
    dates: "10/16",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=211",
    address: "",
    smcBidID: "211"
  },
  {
    title: "Sheriff's Foreclosure Sale -- HOA Lien, Unit 156A Tomboy Lodge (Sale No. 26-128)",
    entity: "The Tomboy Lodge Association, Inc. / San Miguel County Sheriff",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "The San Miguel County Sheriff is conducting a foreclosure sale of Unit 156A at The Tomboy Lodge (619 West Colorado Avenue, Telluride) to satisfy an HOA lien of $15,449.81 held by The Tomboy Lodge Association, Inc., arising from Civil Action No. 2026 CV 30034. The property will be sold at public auction on December 16, 2026 at 10:00 a.m. on the steps of the San Miguel County District Courthouse. Parties with an interest in the property may have rights to redeem or cure the default under Colorado statutes.",
    deadline: "2026-12-16",
    expires: "2026-12-16",
    dates: "10/22",
    papers: ["ttimes_1022"],
    url: "https://www.telluridenews.com/news/legals/article_1f99287a-8ec7-49ee-b0ca-9d501ba00b5f.html",
    address: "619 West Columbia Avenue, Unit 156A, Telluride, Colorado 81435",
    noticeKey: "foreclosure-26-128-tomboy-unit156a",
    caseNumber: "2026 CV 30034"
  },
  {
    title: "Condominium Declaration Amendment Notice -- Good Gargoyle Condominiums First Amendment",
    entity: "Good Gargoyle Condominiums / Aaron J. Goodlock, Attorney",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "Holders of first mortgages on units in The Good Gargoyle Condominiums are being notified of a proposed First Amendment to the Condominium Declaration originally recorded January 26, 1988 (Reception No. 252464) in San Miguel County. This notice was sent by certified mail along with a consent form and a copy of the proposed amendment. Interested parties may obtain a copy of the amendment and consent form by contacting attorney Aaron J. Goodlock in Denver.",
    deadline: "",
    expires: "2026-11-22",
    dates: "10/22",
    papers: ["ttimes_1022"],
    url: "https://www.telluridenews.com/news/legals/article_1f99287a-8ec7-49ee-b0ca-9d501ba00b5f.html",
    address: "The Good Gargoyle Condominiums, San Miguel County, Colorado",
    noticeKey: "condo-decl-amendment-good-gargoyle"
  },
  {
    title: "Public Trustee Foreclosure Sale -- 65 Spruce Drive, Norwood (Sale No. 2026-09)",
    entity: "Alpine Bank / San Miguel County Public Trustee",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "San Miguel County Public Trustee Brandi R. Hatfield is conducting a foreclosure sale of property at 65 Spruce Drive, Norwood, Colorado (Lot 26, Hillside Development Unit Three) to satisfy a deed of trust held by Alpine Bank with an outstanding principal balance of $30,161.93, due to the borrowers' failure to make timely payments. The property will be sold at public auction on December 17, 2026 at 10:00 a.m. at 305 W. Colorado Avenue, East entry, Telluride. The notice was first published October 22, 2026 and runs through November 19, 2026.",
    deadline: "2026-12-17",
    expires: "2026-12-17",
    dates: "10/22",
    papers: ["ttimes_1022"],
    url: "https://www.telluridenews.com/news/legals/article_1f99287a-8ec7-49ee-b0ca-9d501ba00b5f.html",
    address: "65 Spruce Drive, Norwood, Colorado 81423 (Lot 26, Hillside Development Unit Three)",
    noticeKey: "foreclosure-2026-09-65-spruce-norwood",
    caseNumber: "2026-09"
  },
  {
    title: "Public Trustee Foreclosure Sale -- 53 East Homestead Road, Norwood (Sale No. 2026-10)",
    entity: "Rocket Mortgage, LLC / San Miguel County Public Trustee",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "San Miguel County Public Trustee Brandi R. Hatfield is conducting a foreclosure sale of property at 53 East Homestead Road, Norwood, Colorado (Lot 24, Pioneer Village) to satisfy a deed of trust now held by Rocket Mortgage, LLC, with an outstanding principal balance of $172,375.22, due to the borrower's failure to make timely payments. The property will be sold at public auction on December 17, 2026 at 10:00 a.m. at 305 W. Colorado Avenue, East entry, Telluride. The notice runs from October 22, 2026 through November 19, 2026.",
    deadline: "2026-12-17",
    expires: "2026-12-17",
    dates: "10/22",
    papers: ["ttimes_1022"],
    url: "https://www.telluridenews.com/news/legals/article_1f99287a-8ec7-49ee-b0ca-9d501ba00b5f.html",
    address: "53 East Homestead Road, Norwood, Colorado 81423 (Lot 24, Pioneer Village)",
    noticeKey: "foreclosure-2026-10-53-e-homestead-norwood",
    caseNumber: "2026-10"
  },
  {
    title: "Budget Notice -- Proposed 2027 Budget, Southwestern Water Conservation District",
    entity: "Southwestern Water Conservation District",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "The Southwestern Water Conservation District (SWCD) has submitted its proposed 2027 budget for public inspection at its office at 841 E 2nd Avenue, Durango, Colorado, and online at swwcd.org. The budget will be considered at a regular board meeting on Monday, December 14, 2026 at 9:00 a.m., which may be attended in person or via Zoom. Any interested elector of SWCD may inspect the budget and file objections prior to final adoption.",
    deadline: "2026-12-14",
    expires: "2026-12-14",
    dates: "10/29",
    papers: ["ttimes_1029"],
    url: "https://www.telluridenews.com/news/legals/article_3815f6d8-2031-4cb7-b480-2859616b3237.html",
    address: "841 E 2nd Avenue, Durango, Colorado",
    noticeKey: "swcd-budget-2027"
  },
  {
    title: "Request for Quote -- Request for Quote: Material Hauling",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Quote",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking qualified respondents for: Request for Quote: Material Hauling.",
    deadline: "Open until contracted",
    expires: "2027-02-03",
    dates: "11/5",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=159",
    address: "",
    smcBidID: "159"
  },
  {
    title: "RFP -- Telluride Conference Center Management and Operation Agreement",
    entity: "Town of Mountain Village",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "The Town of Mountain Village is seeking proposals from qualified firms to manage and operate the Town-owned Telluride Conference Center under a Management and Operation Agreement. An optional virtual information session is scheduled for November 17, 2026 at 10:00 AM, with details available in the RFP packet. All proposals must be submitted electronically by 5:00 PM on Wednesday, December 16, 2026; RFP packets are available at TMV Town Hall, 455 Mountain Village Blvd., Suite A, or at www.townofmountainvillage.com/rfp.",
    deadline: "2026-12-16",
    expires: "2026-12-16",
    dates: "11/5",
    papers: ["ttimes_1105"],
    url: "https://www.telluridenews.com/news/legals/article_4fe133a6-ca5f-42a1-810d-63306c1b854d.html",
    address: "455 Mountain Village Blvd., Suite A, Mountain Village, CO",
    noticeKey: "rfp-tmv-conference-center-2026"
  },
  {
    title: "ITB -- Telluride Regional Airport New ARFF Truck Acquisition",
    entity: "Telluride Regional Airport",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "The Telluride Regional Airport is soliciting bids for the procurement of one newly manufactured Index B – Class IV Aircraft Rescue and Fire Fighting (ARFF) Truck and auxiliary equipment. A non-mandatory pre-bid conference call is scheduled for November 10, 2026 at 1:00 PM MT via Microsoft Teams. Bids must be submitted electronically to coloradoairportdev@dibblecorp.com by Thursday, December 3, 2026 at 1:00 PM MT.",
    deadline: "2026-12-03",
    expires: "2026-12-03",
    dates: "11/5",
    papers: ["ttimes_1105"],
    url: "https://www.telluridenews.com/news/legals/article_4fe133a6-ca5f-42a1-810d-63306c1b854d.html",
    address: "Telluride Regional Airport, Telluride, CO",
    noticeKey: "itb-telluride-airport-arff-truck-2026"
  },
  {
    title: "Request for Proposal -- Lawson Hill Connector Trail Project",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking qualified respondents for: Lawson Hill Connector Trail Project.",
    deadline: "Open until contracted",
    expires: "2027-02-10",
    dates: "11/12",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=207",
    address: "",
    smcBidID: "207"
  },
  {
    title: "Request for Proposal -- Fuel Island Canopy Construction",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking qualified respondents for: Fuel Island Canopy Construction.",
    deadline: "Open until contracted",
    expires: "2027-02-10",
    dates: "11/12",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=208",
    address: "",
    smcBidID: "208"
  },
  {
    title: "Notice of Final Settlement -- PRV Stations Early Procurement, Ferguson Enterprises (Town of Telluride)",
    entity: "Town of Telluride Public Works Department",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "The Town of Telluride Public Works Department intends to begin processing final payment to Ferguson Enterprises, LLC for the 2024/2025 Early Procurement of Package-Type Pressure Reducing Valve (PRV) Stations project. Any person or firm with claims or debts against the contractor must file written notice with Civil Engineer Justin Blair at P.O. Box 397, Telluride, CO 81435 on or before November 23, 2026. No payment will be processed if valid claims are received before that date.",
    deadline: "2026-11-23",
    expires: "2026-11-23",
    dates: "11/19",
    papers: ["ttimes_1119"],
    url: "https://www.telluridenews.com/news/legals/article_a0b9535a-57a0-48ea-91a5-bf3583aa9d95.html",
    address: "Town of Telluride, CO (Public Works Department, P.O. Box 397, Telluride, CO 81435)",
    noticeKey: "final-settlement-telluride-prv-ferguson-2026"
  }
];

const HOUSING_LISTINGS = [
  {
    title: "🏠 Spruce House H",
    type: "deed-sale",
    address: "226 East Pacific Avenue, Unit H, Telluride, CO 81435",
    lat: 37.9375,
    lng: -107.8123,
    org: "telluride",
    beds: "3 Bedroom, 2 Bath, ~1087 sq ft",
    price: "$453,000 (deed-restricted)",
    source: "SMRHA",
    contact: { phone: "(970) 728-3034", email: "admin@smrha.org" },
    url: "https://smrha.org/spruce-house-h/",
    smrhaSlug: "spruce-house-h",
    note: "Tier 2 Town Constructed Unit. HOA $650.36/mo. Contact SMRHA for eligibility and application details."
  },
  {
    title: "🏠 Element 52 SW-102",
    type: "deed-sale",
    address: "398 South Davis Street, Unit SW-102, Telluride, CO 81435",
    lat: 37.93676,
    lng: -107.81787,
    org: "telluride",
    beds: "2 Bedroom, 1 Bath, ~988 sq ft",
    price: "$352,529 (deed-restricted)",
    source: "SMRHA",
    contact: { phone: "(970) 728-3034", email: "admin@smrha.org" },
    url: "https://smrha.org/element-52-sw-102/",
    smrhaSlug: "element-52-sw-102",
    note: "Tier 2 Mitigation Unit. HOA $420.28/mo. Contact SMRHA for eligibility and application details."
  },
  {
    title: "🏠 Silver Jack 202",
    type: "deed-sale",
    address: "155 West Pacific Avenue, Unit 202, Telluride, CO 81435",
    lat: 37.93658,
    lng: -107.81173,
    org: "telluride",
    beds: "3 Bedroom, 2 Bath, ~1330 sq ft",
    price: "$405,507 (deed-restricted)",
    source: "SMRHA",
    contact: { phone: "(970) 728-3034", email: "admin@smrha.org" },
    url: "https://smrha.org/silver-jack-202/",
    smrhaSlug: "silver-jack-202",
    note: "Tier 1 Town Constructed Unit. HOA $307.64/mo. Contact SMRHA for eligibility and application details."
  },
  {
    title: "🏠 Silver Jack 205",
    type: "deed-sale",
    address: "155 West Pacific Avenue, Unit 205, Telluride, CO 81435",
    lat: 37.93658,
    lng: -107.81173,
    org: "telluride",
    beds: "2 Bedroom, 1 Bath, ~935 sq ft",
    price: "$368,620 (deed-restricted)",
    source: "SMRHA",
    contact: { phone: "(970) 728-3034", email: "admin@smrha.org" },
    url: "https://smrha.org/silver-jack-205/",
    smrhaSlug: "silver-jack-205",
    note: "Tier 1 Town Constructed Unit. HOA $218.42/mo. Contact SMRHA for eligibility and application details."
  },
  {
    title: "Room for Rent — In-Town 2BR Condo",
    type: "deed-rental",
    address: "Telluride, CO 81435 (in-town)",
    lat: 37.9375,
    lng: -107.8123,
    beds: "1 Room in 2BR",
    price: "$1,883/mo (deed-restricted)",
    source: "SMRHA",
    contact: { phone: "(970) 728-3034", email: "admin@smrha.org" },
    url: "https://smrha.org/property/in-town-room-for-rent-telluride-co-81435/",
    note: "Deed-restricted room rental in shared 2BR condo. Contact SMRHA for eligibility.",
    org: "telluride"
  },
  {
    title: "Village Court Apartments — Waitlist",
    type: "deed-rental",
    address: "455 Mountain Village Blvd, Mountain Village, CO 81435",
    lat: 37.93253,
    lng: -107.85398,
    beds: "Studio–3 Bedroom",
    price: "Income-based (deed-restricted)",
    source: "Town of Mountain Village",
    contact: { phone: "(970) 729-3419", email: "" },
    url: "https://townofmountainvillage.com/community/housing/village-court-apartments/",
    note: "Waitlist is currently capped — not accepting new applications. Check back periodically.",
    org: "mv"
  },
  {
    title: "Shandoka Townhomes — Waitlist",
    type: "deed-rental",
    address: "820 Black Bear Rd, Telluride, CO 81435",
    lat: 37.93766,
    lng: -107.82303,
    beds: "1–3 Bedroom",
    price: "Income-based (deed-restricted)",
    source: "Town of Telluride",
    contact: { phone: "(970) 728-4025", email: "housing@telluride.gov" },
    url: "https://www.telluride.gov/745/Town-Owned-Rental-Properties",
    note: "Waitlist-based. Town employee priority. Apply through the Town of Telluride.",
    org: "telluride"
  },
  {
    title: "Virginia Placer Apartments — Waitlist",
    type: "deed-rental",
    address: "Virginia Placer, Telluride, CO 81435",
    lat: 37.93983,
    lng: -107.8284,
    beds: "Studio–2 Bedroom",
    price: "Income-based (deed-restricted)",
    source: "Town of Telluride",
    contact: { phone: "(970) 728-4025", email: "housing@telluride.gov" },
    url: "https://www.telluride.gov/745/Town-Owned-Rental-Properties",
    note: "Waitlist-based. Apply through the Town of Telluride Rental Housing division.",
    org: "telluride"
  }
];

const RIDGWAY_AGENDA_MAP = {
  "November 19, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town-Council-Regular-Meeting-Packet---November-19%2C-2026_0.pdf",

  "October 31, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Budget-Retreat-Packet---October-31%2C-2026_0.pdf",

  "October 14, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Updated-Town-Council-Regular-Meeting-Packet---October-14%2C-2026.pdf",

  "September 9, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town-Council-Regular-Meeting-Packet---September-9%2C-2026_0.pdf",

  "August 12, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town-Council-Regular-Meeting-Packet-August-12-2026_0.pdf",

  "July 8, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town-Council-Regular-Meeting-Packet---July-8%2C-2026.pdf",

  "June 16, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town-Council-Special-Meeting-Packet---June-16%2C-2026.pdf",

  "June 10, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town-Council-Regular-Meeting-Packet---June-10%2C-2026.pdf",

  "May 13, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town-Council-Regular-Meeting-Packet---May-13%2C-2026.pdf",

  "April 8, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20April%208%2C%202026%20%28updated%29.pdf",

  "March 25, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/March%2025%20special%20meeting%20agenda.pdf",

  "March 11, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20March%2011%2C%202026.pdf",

  "February 11, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20February%2011%2C%202026.pdf",

  "January 26, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Special%20Meeting%20Packet%20-%20January%2026%2C%202026%20UPDATED.pdf",

  "January 14, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20January%2014%2C%202026_0.pdf",

  "December 10, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20December%2010%2C%202025.pdf",

  "December 3, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Budget%20Workshop%20Packet%20-%20December%203%2C%202025.pdf",

  "November 12, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20November%2012%2C%202025.pdf",

  "October 4, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Budget%20Retreat-Special%20Meeting%20Packet%20-%20October%204%2C%202025.pdf",

  "October 1, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20October%201%2C%202025.pdf",

  "September 10, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20September%2010%2C%202025.pdf",

  "August 13, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20August%2013%2C%202025.pdf",

  "July 24, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Special%20Meeting%20Packet%20-%20July%2024%2C%202025.pdf",

  "July 9, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20July%209%2C%202025%20UPDATED_0.pdf",

  "June 11, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20June%2011%2C%202025.pdf",

  "June 2, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Special%20Meeting%20Packet%20-%20June%202%2C%202025.pdf",

  "May 14, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/UPDATED%20Town%20Council%20Regular%20Meeting%20Packet%20-%20May%2014%2C%202025.pdf",

  "April 29, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Special%20Meeting%20Packet%20-%20April%2029%2C%202025_0.pdf",

  "April 9, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20April%209%2C%202025.pdf",

  "March 12, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20March%2012%2C%202025.pdf",

  "February 12, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20February%2012%2C%202025%20UPDATED.pdf",

  "January 8, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Workforce%20%26%20Affordable%20Housing%20Committee%20Meeting%20Packet%20-%20January%208%2C%202025.pdf",

  "December 11, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20December%2011%2C%202024%20UPDATED.pdf",

  "November 13, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20November%2013%2C%202024.pdf",

  "October 12, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Budget%20Retreat%20Packet%20-%20October%2012%2C%202024.pdf",

  "October 9, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20October%209%2C%202024.pdf",

  "September 11, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20September%2011%2C%202024_0.pdf",

  "August 14, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20August%2014%2C%202024%20UPDATED.pdf",

  "July 10, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20July%2010%2C%202024_0.pdf",

  "June 12, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20June%2012%2C%202024.pdf",

  "May 8, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20May%208%2C%202024_0.pdf",

  "April 10, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20April%2010%2C%202024.pdf",

  "March 13, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20-%20March%2013%2C%202024%20updated_0.pdf",

  "February 14, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Regular%20Meeting%20Packet%20UPDATED%20-%20February%2014%2C%202024.pdf",

  "December 13, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20December%2013%2C%202023.pdf",

  "November 8, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20November%208%2C%202023.pdf",

  "October 21, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Budget%20Retreat%20Packet%20-%20October%2021%2C%202023.pdf",

  "October 11, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20October%2011%2C%202023.pdf",

  "September 13, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20September%2013%2C%202023.pdf",

  "August 28, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Workforce%20%26%20Affordable%20Housing%20Committee%20Meeting%20Packet%20-%20August%2028%2C%202023.pdf",

  "August 9, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20August%209%2C%202023.pdf",

  "July 12, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-July%2012%2C%202023.pdf",

  "June 15, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/June%2015%20workforce%20%26%20affordable%20housing%20committee%20agenda.pdf",

  "June 14, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20June%2014%2C%202023.pdf",

  "June 6, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Workforce%20%26%20Affordable%20Housing%20Committee%20Meeting%20Packet%20-%20June%206%2C%202023.pdf",

  "May 10, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20May%2010%2C%202023.pdf",

  "April 17, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Special%20Meeting%20Packet%20-%20April%2017%2C%202023.pdf",

  "April 12, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20April%2012%2C%202023.pdf",

  "March 8, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20March%208%2C%202023.pdf",

  "February 8, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20February%208%2C%202023_0.pdf",

  "January 11, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Meeting%20Packet%20-%20January%2011%2C%202023.pdf",

  "November 16, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Budget%20Workshop%20Packet%20-%20November%2016%2C%202023.pdf",

  "February 15, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Workshop%20Packet%20-%20February%2015%2C%202023.pdf",

  "December 14, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town%20Council%20Packet%20-%20December%2014%2C%202022.pdf",

  "November 9, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Updated%20Town%20Council%20Packet%20-%20November%209%2C%202022_0.pdf",

  "October 29, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Budget%20Retreat%20Packet%20-%20October%2029%2C%202022.pdf",

  "October 12, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Council%20Meeting%20Packet%20-%20October%2012%2C%202022.pdf",

  "September 14, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Council%20Meeting%20Packet%20-%20September%2014%2C%202022_0.pdf",

  "September 7, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Sept%207%20special%20meeting%20agenda.pdf",

  "August 10, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Council%20Packet%20-%20August%2010%2C%202022.pdf",

  "August 3, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/UPDATED%20Special%20Meeting%20Packet%20-%20August%203%2C%202022.pdf",

  "July 13, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Council%20Packet%20-%20July%2013%2C%202022.pdf",

  "June 8, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Council%20Packet%20-%20June%208%2C%202022.pdf",

  "May 11, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Council%20Packet%20-%20May%2011%2C%202022.pdf",

  "April 13, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Council%20Packet%20-%20April%2013%2C%202022_0.pdf",

  "March 9, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Council%20Packet%20-%20March%209%2C%202022.pdf",

  "February 28, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Special%20Meeting%20Packet%20-%20February%2028%2C%202022.pdf",

  "February 9, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Council%20Packet%20-%20February%209%2C%202022%20UPDATED.pdf",

  "January 12, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Council%20Packet%20-%20January%2012%2C%202022.pdf",

  "November 17, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Budget%20Workshop%20Packet%20-%20November%2017%2C%202022.pdf",

  "January 27, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Workshop%20Packet.pdf",

  "December 8, 2021":
    "http://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Council%20Packet%20-%20December%208%2C%202021.pdf",

  "November 10, 2021":
    "http://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20November%2010%2C%202021.pdf",

  "October 23, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/00%20October%2023%20budget%20retreat%20agenda.pdf",

  "October 13, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20October%2013%2C%202021_0.pdf",

  "September 8, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20September%208%2C%202021.pdf",

  "August 11, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20August%2011%2C%202021.pdf",

  "July 14, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20July%2014%2C%202021_1.pdf",

  "June 9, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20June%209%2C%202021_0.pdf",

  "May 12, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20May%2012%2C%202021.pdf",

  "April 14, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20April%2014%2C%202021.pdf",

  "March 10, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20March%2010%2C%202021.pdf",

  "February 10, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20February%2010%2C%202021.pdf",

  "January 13, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Packet%20-%20January%2013%2C%202021.pdf",

  "November 18, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Budget%20Workshop%20Packet%20-%20November%2018%2C%202021.pdf",

  "October 21, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Workshop%20Packet%20-%20October%2021%2C%202021.pdf",

  "December 9, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Agenda%20Packet%20-%20December%209%2C%202020_1.pdf",

  "November 19, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Agenda%20Packet%20-%20November%2019%2C%202020_0.pdf",

  "November 11, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Agenda%20Packet%20-%20November%2011%2C%202020.pdf",

  "October 17, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/October%2017%20budget%20retreat%20agenda.pdf",

  "October 14, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/00%20Oct%2014%20tc%20agenda.pdf",

  "September 9, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Agenda%20Packet%20-%20September%209%2C%202020_0.pdf",

  "August 12, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Agenda%20Packet%20-%20August%2012%2C%202020.pdf",

  "July 8, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Agenda%20Packet%20-%20July%208%2C%202020.pdf",

  "June 23, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/June%2023rd%20Special%20Meeting%20Packet.pdf",

  "June 10, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/UPDATED%20Full%20Agenda%20Packet%20-%20June%2010%2C%202020_0.pdf",

  "May 27, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.05.27%20Updated%20-%20May%2027th%20Special%20Meeting%20Packet.pdf",

  "May 13, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.05.13%20TC%20Agenda%20Packet%20%20May.pdf",

  "April 24, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.04.24%20Special%20Meeting%20Packet.pdf",

  "April 8, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.04.08%20TC%20Agenda%20Packet.pdf",

  "March 20, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.03.20%20TC%20Special%20Meeting%20Packet.pdf",

  "March 11, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.03.11%20TC%20Agenda%20Packet.pdf",

  "November 18, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway-Planning-Commission-Meeting-Packet---November-18%2C-2026-acc.pdf",

  "October 21, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway-Planning-Commission-Meeting-Packet---October-21%2C-2026-acc.pdf",

  "September 16, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway-Planning-Commission-Meeting-Packet---September-16%2C-2026--REVISION-1.pdf",

  "August 19, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway-Planning-Commission-Meeting-Packet---August-19%2C-2026.pdf",

  "July 15, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway-Planning-Commission-Meeting-Packet---July-15%2C-2026.pdf",

  "June 17, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway-Planning-Commission-Meeting-Packet---June-17%2C-2026.pdf",

  "May 20, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway-Planning-Commission-Meeting-Packet---May-20%2C-2026.pdf",

  "April 15, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2026.04.15%20%28PC%20Meeting%20Pkt%29.pdf",

  "March 18, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2026.03.18%20%28PC%20Meeting%20Pkt%29.pdf",

  "February 18, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2026.02.18%20PC%20Meeting.pdf",

  "November 19, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20November%2019%2C%202025.pdf",

  "October 15, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20October%2015%2C%202025.pdf",

  "September 17, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20September%2017%2C%202025.pdf",

  "August 20, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20August%2020%2C%202025.pdf",

  "June 18, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20June%2018%202025.pdf",

  "May 21, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20May%2021%2C%202025.pdf",

  "April 16, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20April%2016%2C%202025.pdf",

  "March 19, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20March%2019%2C%202025.pdf",

  "February 19, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20February%2019%2C%202025.pdf",

  "January 28, 2025":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20January%2028%2C%202025.pdf",

  "November 26, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20November%2026%2C%202024_0.pdf",

  "October 29, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20October%2029%2C%202024.pdf",

  "September 24, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20September%2024%2C%202024.pdf",

  "August 27, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20August%2027%2C%202024.pdf",

  "July 30, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20July%2030%2C%202024.pdf",

  "June 25, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20June%2025%2C%202024.pdf",

  "May 28, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20May%2028%2C%202024.pdf",

  "April 30, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20April%2030%2C%202024.pdf",

  "March 26, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20March%2026%2C%202024.pdf",

  "February 27, 2024":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20February%2027%2C%202024.pdf",

  "October 31, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20October%2031%2C%202023.pdf",

  "September 26, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20September%2026%2C%202023.pdf",

  "August 29, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20August%2029%2C%202023.pdf",

  "June 27, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20June%2027%2C%202023.pdf",

  "April 25, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20April%2025%2C%202023.pdf",

  "April 4, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Special%20Meeting%20Packet%20-%20April%204%2C%202023.pdf",

  "March 28, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20March%2028%2C%202023.pdf",

  "February 28, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20February%2028%2C%202023.pdf",

  "January 31, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20%28updated%29%20-%20January%2031%2C%202023.pdf",

  "January 10, 2023":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway%20Planning%20Commission%20Meeting%20Packet%20-%20January%2010%2C%202023.pdf",

  "November 29, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20PC%20Meeting%20Packet%20-%20November%2029%2C%202022.pdf",

  "October 25, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20PC%20Packet%20-%20October%2025%2C%202022.pdf",

  "September 27, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Planning%20Commission%20Meeting%20Packet%20-%20September%2027%2C%202022.pdf",

  "September 22, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Special%20Planning%20Commission%20Meeting%20Packet%20-%20September%2022%2C%202022.pdf",

  "August 30, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20August%2030%2C%202022.pdf",

  "July 26, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20July%2026%2C%202022.pdf",

  "June 28, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20June%2028%2C%202022.pdf",

  "May 31, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20May%2031%2C%202022%20compressed.pdf",

  "April 26, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20April%2026%2C%202022.pdf",

  "March 29, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20March%2029%2C%202022.pdf",

  "February 22, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20February%2022%2C%202022.pdf",

  "January 25, 2022":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20January%2025%2C%202022.pdf",

  "November 30, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20November%2030%2C%202021.pdf",

  "October 26, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20October%2026%2C%202021%203.pdf",

  "September 28, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20September%2028%2C%202021.pdf",

  "August 31, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20August%2031%2C%202021.pdf",

  "July 27, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20July%2027%2C%202021%20%28updated%29.pdf",

  "July 13, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20July%2013%2C%202021.pdf",

  "May 25, 2021":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Full%20Planning%20Commission%20Packet%20-%20May%2025%2C%202021.pdf",

  "July 28, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.07.28%20%28PC%20Agenda%20Pkt%29.pdf",

  "June 30, 2020":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2020.06.30%20%28PC%20Agenda%20Pkt%29_0.pdf"
};

// ── Town of Rico Board of Trustees agenda/packet/minutes URLs ──
// Keyed by the meeting label shown on the Board of Trustees page
// (regular meetings = "<Month> <Year>"; specials/work sessions carry
// their qualifier). getRicoMeetings() looks up the "<Month> <Year>" key
// for each generated 3rd-Wednesday meeting. The bot (syncRicoAgendas in
// content-refresh.js) regenerates this map from the page every 6h, so
// new agendas/packets/minutes appear automatically as Rico posts them.
const RICO_AGENDA_MAP = {
  "October 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board-of-Trustees-October-2026-Agenda.pdf"},

  "October 2026 Meeting":
    {"packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board-of-Trustees-October-2026-Packet.pdf"},

  "September 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board-of-Trustees-September-2026-Agenda.pdf"},

  "September 2026 Meeting":
    {"packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board-of-Trustees-September-2026-Packet.pdf"},

  "September 2026 Special Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board-of-Trustees-September-2-2026-Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board-of-Trustees-September-2-2026-Packet.pdf"},

  "August 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board-of-Trustees-August-2026-Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board-of-Trustees-August-2026-Packet.pdf"},

  "July 2026 Work Session":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20July%202026%20Agenda%20Work%20Session.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20July%202026%20Pakcet%20Work%20Session_0.pdf"},

  "July 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20July%202026%20Agenda.pdf"},

  "July 2026 Meeting":
    {"packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20July%202026%20Packet.pdf"},

  "June 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20June%202026%20Agenda.pdf"},

  "June 2026 Meeting":
    {"packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20June%202026%20Packet.pdf"},

  "June 2026 Special Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20June%202026%20Agenda%20Special%20Meeting_0.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20June%202026%20Packet%20Special%20Meeting.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/June%20Spec.%202026%20minutes.pdf"},

  "May 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20May%202026%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20May%202026%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/May%202026%20minutes.pdf"},

  "April 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20April%202026%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20April%202026%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/April%202026%20minutes.pdf"},

  "March 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20March%202026%20Agenda_0.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20March%202026%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/March%202026%20minutes.pdf"},

  "February 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20February%202026%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20February%202026%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Feb%202026%20minutes.pdf"},

  "February 2026 Work Session":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20February%202026%20Work%20Session%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20February%202026%20Work%20Session%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/feb%202026%20special%20minutes.pdf"},

  "January 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20January%202026%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20January%202026%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/January%202026%20minutes.pdf"},

  "December 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20December%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20December%202025%20Packet_0.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/December%202025%20minutes.pdf"},

  "December 2025 Special Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20December%203%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20December%203%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/December%203%202025%20minutes%20special%20meeting.pdf"},

  "November 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20November%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20November%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/nov%2019_%202025%20minutes.pdf"},

  "October 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20October%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20October%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/october%202025%20minutes.pdf"},

  "September 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20September%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20September%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/September%2017%20minutes.pdf"},

  "August 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20August%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20August%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/August%2020%20minutes.pdf"},

  "August 2025 Planning Commission and Board of Trustee Joint Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Planning%20Commission%20and%20Board%20of%20Trustees%20Joint%20Meeting%20Agenda%20August%2013%202025.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Planning%20Commission%20and%20Board%20of%20Trustees%20Joint%20Meeting%20Packet%20August%2013%202025.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/august%2013_%202025%20minutes.pdf"},

  "July 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20July%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20July%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/July%2016%20minutes.pdf"},

  "July 2025 Special Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20July%20Special%20Meeting%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20July%20Special%20Meeting%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/July%209%20minutes.pdf"},

  "June 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20June%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20June%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/June%2018%20minutes.pdf"},

  "June 2025 Planning Commission and Board of Trustee Joint Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Planning%20Commission%20and%20Board%20of%20Trustees%20Joint%20Meeting%20Agenda%20June%2011%202025.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/June%2011%20minutes.pdf"},

  "May 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20May%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20May%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/minutes%20may%2021%202025.pdf"},

  "May 2025 Planning Commission and Board of Trustee Joint Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Planning%20Commission%20and%20Board%20of%20Trustees%20Joint%20Meeting%20Agenda%20May%2014%202025.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Planning%20Commission%20and%20Board%20of%20Trustees%20Joint%20Meeting%20Packet%20May%2014%202025.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/minutes%20may%2014%202025.pdf"},

  "April 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20April%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20April%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/minutes%20april%2016%202025.pdf"},

  "March 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20March%202025%20Agenda_0.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20March%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/minutes%20mar%2019%202025.pdf"},

  "March 2025 Special Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20March%203rd%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20March%203rd%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/minutes%20mar%203%202025.pdf"},

  "February 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20February%202025%20Agenda_0.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20February%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/minutes%20feb%2019%202025.pdf"},

  "January 2025 Special Session":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20January%202025%20Agenda%20Special%20Meeting.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20January%202025%20Packet%20Special%20Meeting.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/minutes%20jan%2030%202025.pdf"},

  "January 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20January%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20January%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/minutes%20jan%2015%202025.pdf"},

  "December 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20December%20%202024%20Agenda%20.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20December%20%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/minutes%20December%202024.pdf"},

  "November 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20November%20%202024%20Agenda%20.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20November%20%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/minutes%20November%202024.pdf"},

  "October 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20October%202024%20Agenda%20_0.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20October%202024%20Packet_0.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/October%2016_%202024%20minutes.pdf"},

  "September 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20September%202024%20Agenda%20_0.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20September%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/September_%202024%20minutes.pdf"},

  "September 2024 Planning Commission and Board of Trustee Joint Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Planning%20Commission%20and%20Board%20of%20Trustees%20Joint%20Meeting%20Agenda%20September%2011%202024.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Planning%20Commission%20and%20Board%20of%20Trustees%20Joint%20Meeting%20Packet%20September%2011%202024_0.pdf"},

  "August 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20August%2021%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20August%2021%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/August%2021_%202024%20minutes.pdf"},

  "July 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20July%2017%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20July%2017%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/July%2017_%202024%20minutes.pdf"},

  "June 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20June%2019%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20June%2019%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/June%2019_%202024%20minutes.pdf"},

  "May 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20May%2015%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20May%2015%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/May%2015_%202024%20minutes.pdf"},

  "April 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20April%2017%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20April%2017%202024%20Packet.pdf"},

  "March 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20March%2020%202024%20Agenda_1.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20March%2020%202024%20Packet_1.pdf"},

  "March 2024 VCUP Public Forum":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20March%207%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/March%207%20VCUP%20Public%20Forum%20Handouts_without%20CT.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/3.7.24.pdf"},

  "March 2024 VCUP Special Session":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20March%206%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20March%206%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/3.6.24.pdf"},

  "February 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20February%2028%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20February%2028%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/2.28.24.pdf"},

  "February 2024 Sewer Work Session":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20Feb%2015%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Rico%20Wastewater%20Collection%20and%20Treatment%20System%20%281%29.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/2.15.24.pdf"},

  "January 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20January%2017%202024%20Agenda_0.pdf","packet":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/Board%20of%20Trustees%20January%2017%202024%20Packet_0.pdf","minutes":"https://townofrico.colorado.gov/sites/g/files/lrnvjt3111/files/documents/1.17.24.pdf"}
};

function getCountyCachedMeetings() {
  const out = COUNTY_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    // Explicit agendaUrl override (used for entities not on CivicClerk, e.g.
    // the SSR Housing Code Update meetings whose packets are in DocumentCenter).
    const link = m.agendaUrl
      ? m.agendaUrl
      : (m.civicClerkId
          ? COUNTY_CIVICCLERK_BASE + m.civicClerkId + '/files'
          : COUNTY_CIVICCLERK_FALLBACK);
    const categoryLabel = m.type === 'planning'  ? 'Planning Commission'
                        : m.type === 'ssr'       ? 'SSR Roundtable'
                        : /board/i.test(m.title || '') ? 'Board Meeting'
                        : 'Meeting';

    return {
      title: m.title,
      link,
      description: m.note || '',
      eventDate,
      eventDates: '',
      eventTimes: m.time || '',
      location: m.location || '',
      source: 'county',
      sourceLabel: 'San Miguel County',
      category: categoryLabel,
      canceled: false,
      hasAgenda: !!(m.agendaUrl || m.civicClerkId),
      agendaLink: m.agendaUrl
        ? m.agendaUrl
        : (m.civicClerkId ? COUNTY_CIVICCLERK_BASE + m.civicClerkId + '/files' : null),
      packetUrl: m.packetUrl || null
    };
  });

  // The static COUNTY_CACHED_DATA list can fall behind the bot's agenda scraper
  // (which keeps MANUAL_SUMMARIES current). Surface any FUTURE San Miguel County
  // meeting that already has a generated summary but isn't in the cached list —
  // so freshly-scraped BOCC / Planning / commission meetings appear even before
  // the cache is regenerated. Dedup against the cache by date + board type.
  if (typeof MANUAL_SUMMARIES !== 'undefined' && MANUAL_SUMMARIES) {
    const todayMT = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
    const ctok = (t) => /planning/i.test(t) ? 'pc'
      : /board of county commissioners|commissioners|bocc/i.test(t) ? 'bocc'
      : /open space/i.test(t) ? 'openspace'
      : /historic/i.test(t) ? 'historical'
      : (meetingBoardToken(t) || 'gen');
    const seen = {};
    // Key on the eventDate's LOCAL calendar day (localDateKey), NOT a Denver
    // toLocaleDateString round-trip. localDate() builds each eventDate from the
    // intended calendar date via `new Date(y, m, d)` (local midnight), so its
    // local Y-M-D always equals that date. Re-formatting through
    // timeZone:'America/Denver' on a UTC runner (CI) instead shifts local-
    // midnight back a day (Jul 9 00:00 UTC -> Jul 8 18:00 MT -> "2026-07-08"),
    // so the key stopped matching the raw "YYYY-MM-DD" date used on the summary
    // side below — and a renamed meeting's stale shadow slipped through. See the
    // Jul 8/9 joint-work-session dedup test.
    out.forEach(m => { if (m.eventDate) seen[localDateKey(m.eventDate) + '|' + ctok(m.title)] = 1; });
    // The county sometimes RENAMES a meeting (e.g. "Board of County
    // Commissioners Work Session" -> "...Special - In Norwood at Sheriff Annex",
    // "Planning Commission Meeting" -> "...Joint Work Session"), which leaves the
    // older placeholder-keyed entry behind. Both share the same date+board, so we
    // must surface exactly ONE — and it has to be the CURRENT one (which carries
    // the real agenda summary), not whichever key happened to be inserted first.
    // So group future summary keys by date+board and keep the RICHEST: a real
    // summary beats an "agenda not posted yet" placeholder; among equals, the
    // longer (more detailed) text wins.
    const isPlaceholder = (s) => !s || /hasn['’]?t been posted|not (yet )?(been )?posted|no agenda (items|detail)|nothing to summarize|not available yet|isn['’]?t available/i.test(s);
    // The bot stores each meeting's real agenda deep link (the CivicClerk
    // /event/<id>/files/agenda/<fileId> URL) in MEETING_AGENDA_META, keyed by
    // the SAME source|date|title as the summary. Without it this fallback used
    // to link the bare portal home — so a card that HAD a full agenda summary
    // still sent readers to a directory listing instead of the agenda (caught
    // on the Jul 15 2026 BOCC digest card).
    const agendaMeta = (typeof MEETING_AGENDA_META !== 'undefined' && MEETING_AGENDA_META) ? MEETING_AGENDA_META : {};
    const best = {};   // dk -> { rawTitle, eventDate, summary, agendaUrl }
    for (const key of Object.keys(MANUAL_SUMMARIES)) {
      if (key.slice(0, 7).toLowerCase() !== 'county|') continue;
      const parts = key.split('|');
      const date = parts[1];
      if (!date || date < todayMT) continue;                 // future meetings only
      const eventDate = localDate(date);
      if (!eventDate || isNaN(eventDate.getTime())) continue;
      const rawTitle = (parts.slice(2).join('|') || 'County Meeting')
        .replace(/\s*-\s*[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}\s*$/, '').trim() || 'County Meeting';
      const dk = date + '|' + ctok(rawTitle);
      if (seen[dk]) continue;                                // already covered by the static cache
      const summary = String(MANUAL_SUMMARIES[key] || '');
      const metaEntry = agendaMeta[key];
      const agendaUrl = (metaEntry && typeof metaEntry === 'object' && metaEntry.agendaUrl) || '';
      const cur = best[dk];
      const better = !cur
        || (isPlaceholder(cur.summary) && !isPlaceholder(summary))              // real beats placeholder
        || (isPlaceholder(cur.summary) === isPlaceholder(summary) && summary.length > cur.summary.length);
      if (better) best[dk] = { rawTitle, eventDate, summary, agendaUrl };
    }
    for (const dk of Object.keys(best)) {
      const b = best[dk];
      const agendaLink = b.agendaUrl || COUNTY_CIVICCLERK_FALLBACK;
      out.push({
        title: b.rawTitle,
        link: agendaLink,
        description: b.summary,
        eventDate: b.eventDate,
        eventDates: '',
        eventTimes: '',
        location: '',
        source: 'county',
        sourceLabel: 'San Miguel County',
        category: /planning/i.test(b.rawTitle) ? 'Planning Commission' : /board/i.test(b.rawTitle) ? 'Board Meeting' : 'Meeting',
        canceled: false,
        hasAgenda: !!b.agendaUrl,
        agendaLink
      });
    }
  }

  return out;
}

function getMVMeetings() {
  return MV_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    const hasAgenda = !!m.agendaUrl;
    const link = m.agendaUrl || (m.board === 'drb' ? MV_DRB_URL : MV_TC_URL);

    let description = '';
    if (m.note) {
      description = m.note;
    }
    // No generic "Agenda available" fallback — the "Agenda Posted →" button already signals this

    return {
      title: m.special ? m.title + ' -- Special Meeting' : m.title,
      link,
      description,
      eventDate,
      eventDates: '',
      eventTimes: m.time || '',
      location: m.location || '',
      source: 'mv',
      sourceLabel: 'Mountain Village',
      category: m.board === 'drb' ? 'DRB Meeting' : 'Meeting',
      canceled: false,
      hasAgenda,
      agendaLink: m.agendaUrl || null,
      packetUrl: m.packetUrl || null
    };
  });
}

function getSchoolMeetings() {
  // Map each entry to a card object first
  const cards = SCHOOL_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    // ParentSquare hrefs are protocol-relative ("//files.smartsites…") — a bare
    // "//" link breaks in email clients and the .ics, so force https.
    const agendaUrl = m.agendaUrl ? String(m.agendaUrl).replace(/^\/\//, 'https://') : null;
    const hasAgenda = !!agendaUrl;
    const link = agendaUrl || SCHOOL_BOARD_URL;

    let description = '';
    if (m.note) {
      description = m.note;
    } else if (hasAgenda) {
      description = 'Agenda/packet available (PDF).';
    }

    return {
      title: m.special ? m.title + ' -- Special Meeting' : m.title,
      link,
      description,
      eventDate,
      eventDates: '',
      eventTimes: m.time || '',
      location: m.location || '',
      source: 'school',
      sourceLabel: 'School District R-1',
      category: m.special ? 'Special Meeting' : 'Board Meeting',
      canceled: false,
      hasAgenda,
      // The district's posted file IS the full packet (…_mm_packet.pdf).
      packetUrl: m.packetUrl || (/packet/i.test(agendaUrl || '') ? agendaUrl : null),
      _rawTime: m.time || ''
    };
  });

  // Merge same-day pairs (e.g. Work Session 3:30 PM + Monthly Meeting 5:15 PM
  // on the same date) into a single combined card so they don't look like
  // duplicates.  The earlier meeting's time is shown first; the later meeting's
  // title becomes the suffix.  Agenda link from whichever entry has one.
  const merged = [];
  const seen = new Set();
  for (let i = 0; i < cards.length; i++) {
    if (seen.has(i)) continue;
    const a = cards[i];
    const dateKey = a.eventDate ? a.eventDate.toISOString().slice(0, 10) : null;
    let combined = false;
    for (let j = i + 1; j < cards.length; j++) {
      if (seen.has(j)) continue;
      const b = cards[j];
      const bKey = b.eventDate ? b.eventDate.toISOString().slice(0, 10) : null;
      if (dateKey && bKey === dateKey) {
        // Same day — merge: keep earlier time, combine title, keep any agenda
        const aTime = a._rawTime;
        const bTime = b._rawTime;
        const earlier = (!aTime || (bTime && aTime <= bTime)) ? a : b;
        const later   = earlier === a ? b : a;
        const hasAgendaCombined = earlier.hasAgenda || later.hasAgenda;
        const combinedLink = (earlier.hasAgenda ? earlier.link : null) || (later.hasAgenda ? later.link : null) || earlier.link;
        // Build a short title: strip common "Telluride Board of Education " prefix, join with " & "
        const shorten = t => t.replace(/^(Telluride\s+)?Board of Education\s+/i, '').replace(/\s*--\s*Special Meeting$/i, '');
        const combinedTitle = 'Telluride Board of Education ' + shorten(earlier.title) + ' & ' + shorten(later.title);
        const combinedTime = aTime && bTime ? aTime + ' & ' + bTime : (aTime || bTime);
        merged.push(Object.assign({}, earlier, {
          title: combinedTitle,
          link: combinedLink,
          eventTimes: combinedTime,
          hasAgenda: hasAgendaCombined,
          packetUrl: earlier.packetUrl || later.packetUrl || null
        }));
        seen.add(i);
        seen.add(j);
        combined = true;
        break;
      }
    }
    if (!combined) {
      seen.add(i);
      merged.push(a);
    }
  }

  // Strip internal helper field
  return merged.map(({ _rawTime, ...rest }) => rest);
}

function getFireMeetings() {
  return FIRE_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    const hasAgenda = !!m.agendaUrl;
    const link = m.agendaUrl || FIRE_BOARD_URL;

    let description = '';
    if (m.note) {
      description = m.note;
    } else if (hasAgenda) {
      description = 'Board agenda available (PDF).';
    }

    return {
      title: m.special ? m.title + ' -- Special Meeting' : m.title,
      link,
      description,
      eventDate,
      eventDates: '',
      eventTimes: m.time || '',
      location: m.location || '',
      source: 'fire',
      sourceLabel: 'Fire District',
      category: m.special ? 'Special Meeting' : 'Board Meeting',
      canceled: false,
      hasAgenda,
      packetUrl: m.packetUrl || null
    };
  });
}

function getMedMeetings() {
  return MED_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    const hasAgenda = !!m.agendaUrl;
    const link = m.agendaUrl || MED_BOARD_URL;

    let description = '';
    if (m.note) {
      description = m.note;
    } else if (hasAgenda) {
      description = 'Board agenda available (PDF).';
    }

    return {
      title: m.special ? m.title + ' -- Special Meeting' : m.title,
      link,
      description,
      eventDate,
      eventDates: '',
      eventTimes: m.time || '',
      location: m.location || '',
      source: 'med',
      sourceLabel: 'Medical Center',
      category: m.special ? 'Special Meeting' : 'Board Meeting',
      canceled: false,
      hasAgenda,
      packetUrl: m.packetUrl || null
    };
  });
}

function getNorwoodMeetings() {
  const boardUrls = { bot: NORWOOD_BOT_URL, pz: NORWOOD_PZ_URL, nwc: NORWOOD_NWC_URL, san: NORWOOD_SAN_URL };
  return NORWOOD_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    const hasAgenda = !!m.agendaUrl;
    const link = m.agendaUrl || boardUrls[m.board] || NORWOOD_BOT_URL;

    let description = '';
    if (m.note) {
      description = m.note;
    }

    return {
      title: m.title,
      link,
      description,
      eventDate,
      eventDates: '',
      eventTimes: '',
      location: '1670 Naturita St, Norwood CO 81423',
      source: 'norwood',
      sourceLabel: 'Norwood',
      category: 'Meeting',
      canceled: false,
      hasAgenda,
      packetUrl: m.packetUrl || null
    };
  });
}

function getOphirMeetings() {
  const boardUrls = { ga: OPHIR_GA_URL, pz: OPHIR_PZ_URL };
  return OPHIR_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    const hasAgenda = !!m.agendaUrl;
    const link = m.agendaUrl || boardUrls[m.board] || OPHIR_GA_URL;

    let description = '';
    if (m.note) {
      description = m.note;
    }

    return {
      title: m.title,
      link,
      description,
      eventDate,
      eventDates: '',
      eventTimes: '',
      location: 'Town of Ophir, CO 81426',
      source: 'ophir',
      sourceLabel: 'Ophir',
      category: 'Meeting',
      canceled: false,
      hasAgenda,
      // Ophir posts one combined 'GA Meeting Packet'; show it as the packet too.
      packetUrl: m.packetUrl || (/packet/i.test(m.agendaUrl || '') ? m.agendaUrl : null)
    };
  });
}

function getAirportMeetings() {
  return AIRPORT_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    return {
      title: m.title,
      link: m.packetUrl || AIRPORT_BOARD_URL,
      description: m.note || 'Regular board meeting of the Telluride Regional Airport Authority.',
      eventDate,
      eventDates: '',
      eventTimes: m.time || '12:00 PM',
      location: m.location || 'Terminal Observation Lounge, Telluride Regional Airport',
      source: 'airport',
      sourceLabel: 'TEX',
      category: 'Meeting',
      canceled: false,
      // TRAA posts one packet PDF (agenda included) per meeting.
      hasAgenda: !!m.packetUrl,
      packetUrl: m.packetUrl || null
    };
  });
}

function getSmartMeetings() {
  return SMART_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    const hasAgenda = !!m.agendaUrl;
    const link = m.agendaUrl || SMART_BOARD_URL;

    let description = '';
    if (m.note) {
      description = m.note;
    } else if (hasAgenda) {
      description = m.packetUrl
        ? 'Board agenda and full meeting packet available (PDF).'
        : 'Board agenda available (PDF).';
    }

    return {
      title: m.special ? m.title + ' -- Special Meeting' : m.title,
      link,
      description,
      eventDate,
      eventDates: '',
      eventTimes: m.time || '',
      location: m.location || '',
      source: 'smart',
      sourceLabel: 'SMART Transit',
      category: m.special ? 'Special Meeting' : 'Board Meeting',
      canceled: false,
      hasAgenda,
      packetUrl: m.packetUrl || null
    };
  });
}

// TMVOA (Telluride Mountain Village Owners Association) — a private HOA, not
// a government body, so it's clearly labeled as such in sourceLabel. Covers
// the Gondola Leadership Committee, Gondola Subcommittee, Board of Directors,
// Investment Committee, Annual Members Meeting, and the joint Town-of-
// Mountain-Village Merchant Meetings — everything on TMVOA's own
// meeting-materials listing page. Rebuilt every run by syncTMVOAAgendas().
function getTMVOAMeetings() {
  if (typeof TMVOA_CACHED_DATA === 'undefined') return [];
  return TMVOA_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    const hasAgenda = !!m.agendaUrl;
    const link = m.agendaUrl || TMVOA_URL;

    let description = '';
    if (hasAgenda) {
      description = m.packetUrl
        ? 'Agenda and meeting materials available (PDF).'
        : 'Agenda available (PDF).';
    }

    return {
      title: m.title,
      link,
      description,
      eventDate,
      eventDates: '',
      eventTimes: '',
      location: m.location || '',
      source: 'tmvoa',
      sourceLabel: 'TMVOA',
      category: 'Board Meeting',
      canceled: false,
      hasAgenda,
      packetUrl: m.packetUrl || null
    };
  });
}

// Ridgway Town Council + Planning Commission. Surfaces RIDGWAY_CACHED_DATA
// stubs (each tagged board:'council'|'pc') and pulls the agenda/packet PDF
// from RIDGWAY_AGENDA_MAP by date (the bot refreshes that map from the two
// colorado.gov board pages every 6h). Same single "Town of Ridgway" entity.
// City of Ouray (the city government; Ouray County is getOurayMeetings()).
// Real rows come from BoardBook (OURAY_CITY_CACHED_DATA, rebuilt every refresh)
// with the actual start time, address and agenda/packet PDF. BoardBook lists a
// meeting only once its agenda posts (~a week out), so the City's published
// regular schedule fills the weeks beyond: City Council 1st & 3rd Monday at
// 6:00 PM (a Monday holiday moves it to Tuesday — Labor Day 2026 → Tue Sep 8,
// which BoardBook confirms) and Planning Commission 2nd Tuesday at 4:00 PM.
// A projected meeting is dropped as soon as BoardBook has that body within
// two days of it.
function getOurayCityMeetings() {
  const rows = (typeof OURAY_CITY_CACHED_DATA !== 'undefined') ? OURAY_CITY_CACHED_DATA : [];
  const listUrl = (typeof OURAY_CITY_URL !== 'undefined') ? OURAY_CITY_URL : 'https://meetings.boardbook.org/Public/Organization/2503';
  const LOC = 'Ouray Community Center, 320 6th Ave, Ouray, CO 81427';
  const base = (m) => ({
    eventDates: '', source: 'ouraycity', sourceLabel: 'City of Ouray', canceled: false,
    category: m.board === 'pc' ? 'Planning Commission' : (/work session/i.test(m.title || '') ? 'Work Session' : 'City Council'),
  });
  const out = rows.map(m => Object.assign(base(m), {
    title: m.title,
    link: m.agendaUrl || listUrl,
    description: m.note || '',
    eventDate: localDate(m.date),
    eventTimes: m.time || '',
    location: m.location || LOC,
    hasAgenda: !!m.agendaUrl,
    agendaLink: m.agendaUrl || null,
    packetUrl: m.packetUrl || null,
  }));

  const pad = (n) => String(n).padStart(2, '0');
  const key = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const nth = (y, mo, dow, n) => { const f = new Date(y, mo, 1).getDay(); return new Date(y, mo, 1 + ((dow - f + 7) % 7) + 7 * (n - 1)); };
  const lastMon = (y, mo) => { const d = new Date(y, mo + 1, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
  const holidays = (y) => new Set([nth(y, 0, 1, 3), nth(y, 1, 1, 3), lastMon(y, 4), nth(y, 8, 1, 1),
    new Date(y, 0, 1), new Date(y, 6, 4), new Date(y, 10, 11), new Date(y, 11, 25)].map(key));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + 60 * 86400000);
  // Only a REGULAR meeting stands in for a projected one — a work session or
  // special at 4 PM must not hide the 6 PM regular meeting the same day.
  const posted = (board, d) => rows.some(m => (m.board || 'council') === board && !/work session|special|joint/i.test(m.title || '') && Math.abs(localDate(m.date) - d) <= 2 * 86400000);
  const project = (board, d, time, title) => {
    if (d < today || d > horizon || posted(board, d)) return;
    out.push(Object.assign(base({ board, title }), {
      title, link: listUrl,
      description: "Regular meeting on the City of Ouray's published schedule. The agenda is usually posted on BoardBook about a week ahead.",
      eventDate: d, eventTimes: time, location: LOC,
      hasAgenda: false, agendaLink: null, packetUrl: null,
    }));
  };
  for (let i = 0; i <= 2; i++) {
    const b = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const y = b.getFullYear(), mo = b.getMonth(), hol = holidays(y);
    for (const n of [1, 3]) {
      let d = nth(y, mo, 1, n);
      if (hol.has(key(d))) d = new Date(y, mo, d.getDate() + 1);
      project('council', d, '6:00 PM', 'Ouray City Council Regular Meeting');
    }
    project('pc', nth(y, mo, 2, 2), '4:00 PM', 'Ouray Planning Commission Regular Meeting');
  }
  // Standing Zoom (OURAY_CITY_ZOOM, from the City's own pages). Council's room
  // is published for REGULAR meetings only; the Planning Commission's for all.
  const zoomCfg = (typeof OURAY_CITY_ZOOM !== 'undefined') ? OURAY_CITY_ZOOM : {};
  for (const m of out) {
    const z = m.category === 'Planning Commission' ? zoomCfg.pc
      : (/regular/i.test(m.title || '') ? zoomCfg.council : null);
    if (!z) continue;
    m.zoomUrl = z.zoomUrl; m.zoomMeetingId = z.meetingId; m.zoomPasscode = z.passcode; m.zoomPhone = z.phone;
  }
  return out.sort((a, b) => a.eventDate - b.eventDate);
}

function getRidgwayMeetings() {
  if (typeof RIDGWAY_CACHED_DATA === 'undefined') return [];
  const amap = (typeof RIDGWAY_AGENDA_MAP !== 'undefined') ? RIDGWAY_AGENDA_MAP : {};
  const PC_URL = 'https://townofridgway.colorado.gov/i-want-to/ridgway-planning-commission';
  return RIDGWAY_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    const agendaUrl = m.agendaUrl || amap[m.date] || null;
    const hasAgenda = !!agendaUrl;
    const isPC = m.board === 'pc';
    const baseUrl = isPC ? PC_URL : (typeof RIDGWAY_COUNCIL_URL !== 'undefined' ? RIDGWAY_COUNCIL_URL : PC_URL);
    return {
      title: m.title,
      link: agendaUrl || baseUrl,
      description: m.note || (hasAgenda ? 'Agenda and full meeting packet available (PDF).' : ''),
      eventDate,
      eventDates: '',
      eventTimes: m.time || '',
      location: m.location || '',
      source: 'ridgway',
      sourceLabel: 'Town of Ridgway',
      category: /special/i.test(m.title) ? 'Special Meeting' : (isPC ? 'Planning Commission' : 'Town Council'),
      canceled: false,
      hasAgenda,
      // Ridgway posts ONE combined 'Agenda & Packet' PDF — it is the packet.
      packetUrl: agendaUrl || null
    };
  });
}

// Town of Rico Board of Trustees. Rico meets the 3rd Wednesday of every month
// at 7:00 PM (Rico Town Hall, 2 Commercial St). Rather than hand-seed stubs,
// we GENERATE the upcoming regular meetings deterministically from that
// schedule (so future meetings always appear, even before the bot runs), then
// enrich each with its Agenda/Packet/Minutes PDFs from RICO_AGENDA_MAP, keyed
// by "<Month> <Year>" and refreshed from the Board of Trustees page every 6h.
function getRicoMeetings() {
  const MONTHS = ['January','February','March','April','May','June','July',
                  'August','September','October','November','December'];
  const boardUrl = (typeof RICO_BOARD_URL !== 'undefined')
    ? RICO_BOARD_URL
    : 'https://townofrico.colorado.gov/government/board-of-trustees';
  const amap = (typeof RICO_AGENDA_MAP !== 'undefined') ? RICO_AGENDA_MAP : {};

  // 3rd Wednesday (weekday 3) of a given year/month (month is 0-based).
  function thirdWednesday(year, month) {
    const firstDow = new Date(year, month, 1).getDay();      // 0=Sun..6=Sat
    const firstWed = 1 + ((3 - firstDow + 7) % 7);
    return firstWed + 14;
  }

  const out = [];
  const now = new Date();
  // Generate the current month + next 3 months of regular meetings. gov-hub.html
  // filters to today→+30d, so this always yields the next 1–2 upcoming meetings
  // while staying correct as the window rolls forward month to month.
  for (let i = 0; i <= 3; i++) {
    const base = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const year = base.getFullYear();
    const month = base.getMonth();
    const day = thirdWednesday(year, month);
    const dateStr = MONTHS[month] + ' ' + day + ', ' + year;
    const eventDate = localDate(dateStr);
    const monthKey = MONTHS[month] + ' ' + year;
    const docs = amap[monthKey] || {};
    const agendaUrl = docs.agenda || null;
    const hasAgenda = !!agendaUrl;
    out.push({
      title: 'Rico Board of Trustees Regular Meeting',
      link: agendaUrl || boardUrl,
      description: hasAgenda
        ? 'Board agenda and full meeting packet available (PDF).'
        : 'Regular monthly meeting of the Rico Board of Trustees. The agenda and packet are typically posted the Wednesday before the meeting.',
      eventDate,
      eventDates: '',
      eventTimes: '7:00 PM',
      location: 'Rico Town Hall, 2 Commercial St, Rico',
      source: 'rico',
      sourceLabel: 'Town of Rico',
      category: 'Board Meeting',
      canceled: false,
      hasAgenda,
      agendaLink: agendaUrl,
      packetUrl: docs.packet || null,
      minutesUrl: docs.minutes || null
    });
  }
  return out;
}

// Ouray County meetings (Board of County Commissioners + Planning Commission).
// content-refresh.js scrapes Ouray County's CivicPlus AgendaCenter RSS into
// MANUAL_SUMMARIES under the 'ouray|<date>|<agenda text>' source, but there's
// no OURAY_CACHED_DATA array or getter — so Ouray meetings never surfaced on
// the site or in the weekly digest. We surface upcoming meetings straight from
// those summary keys (the bot keeps them fresh): the board is inferred from the
// agenda text and the generated summary rides along as the description.
function getOurayMeetings() {
  const out = [];
  const seen = {};
  // BOCC: real CivicClerk rows (OURAY_COUNTY_CACHED_DATA — time, location,
  // agenda + packet). Added 2026-09-29; before that Ouray County only showed
  // meetings that had a summary, and the summaries' source feed had gone dry.
  const rows = (typeof OURAY_COUNTY_CACHED_DATA !== 'undefined') ? OURAY_COUNTY_CACHED_DATA : [];
  for (const m of rows) {
    const eventDate = localDate(m.date);
    if (!eventDate || isNaN(eventDate.getTime())) continue;
    seen[localDateKey(eventDate) + '|' + (m.board === 'pc' ? 'pc' : 'bocc')] = 1;
    out.push({
      title: m.title,
      link: m.agendaUrl || (m.civicClerkId ? 'https://ouraycoco.portal.civicclerk.com/event/' + m.civicClerkId + '/files' : 'https://ouraycoco.portal.civicclerk.com/'),
      description: m.note || '',
      eventDate,
      eventDates: '',
      eventTimes: m.time || '',
      location: m.location || 'Ouray County, CO',
      source: 'ouray',
      sourceLabel: 'Ouray County',
      category: m.board === 'pc' ? 'Planning Commission' : (/work session/i.test(m.title) ? 'Work Session' : 'Board of County Commissioners'),
      canceled: false,
      hasAgenda: !!m.agendaUrl,
      agendaLink: m.agendaUrl || null,
      packetUrl: m.packetUrl || null
    });
  }
  // Planning Commission (still on AgendaCenter): summary-derived, as before.
  if (typeof MANUAL_SUMMARIES === 'undefined' || !MANUAL_SUMMARIES) return out;
  for (const key of Object.keys(MANUAL_SUMMARIES)) {
    if (key.slice(0, 6).toLowerCase() !== 'ouray|') continue;
    const parts = key.split('|');
    const date = parts[1];
    const raw = (parts.slice(2).join('|') || '').toLowerCase();
    const eventDate = localDate(date);
    if (!eventDate || isNaN(eventDate.getTime())) continue;
    const isPC = /planning commission/.test(raw);
    const isBOCC = /board of county commissioners|\bcommissioners\b|\bbocc\b/.test(raw);
    // Board-only title; the "Ouray County" entity rides on sourceLabel (consumers
    // that build a heading prefix it with the source — e.g. weekly-email.js).
    const title = isPC ? 'Planning Commission' : isBOCC ? 'Board of County Commissioners' : 'Meeting';
    // BOCC now comes from CivicClerk above; only fall back for PC / other.
    if (!isPC && rows.length) continue;
    const dk = date + '|' + title;
    if (seen[dk] || seen[date + '|' + (isPC ? 'pc' : 'bocc')]) continue; seen[dk] = 1;
    out.push({
      title,
      link: 'https://ouraycountyco.gov/AgendaCenter',
      description: MANUAL_SUMMARIES[key] || '',
      eventDate,
      eventDates: '',
      eventTimes: '',
      location: 'Ouray County, CO',
      source: 'ouray',
      sourceLabel: 'Ouray County',
      category: isPC ? 'Planning Commission' : 'Board of County Commissioners',
      canceled: false,
      hasAgenda: false,
      packetUrl: null
    });
  }
  return out;
}

function getTownAgendaLink(title, eventDate) {
  if (!eventDate) return TOWN_CIVICWEB_FALLBACK;
  const dateKey = localDateKey(eventDate);
  // Try exact title match first
  const exactKey = title + '|' + dateKey;
  let meetingId = TOWN_CIVICWEB_IDS[exactKey];
  // Try partial match on date only
  if (!meetingId) {
    for (const key of Object.keys(TOWN_CIVICWEB_IDS)) {
      if (key.endsWith('|' + dateKey)) {
        meetingId = TOWN_CIVICWEB_IDS[key];
        break;
      }
    }
  }
  if (!meetingId) return null;
  return TOWN_CIVICWEB_BASE + meetingId;
}

// Bot-synced upcoming Telluride board/commission meetings — Town Council,
// Planning & Zoning Commission, Telluride Housing Authority Subcommittee, Ethics
// Commission, and the joint P&Z/HARC subcommittee. Populated by
// content-refresh.js syncTellurideBoardMeetings() from the CivicWeb
// MeetingsService (HARC stays in TELLURIDE_CACHED_DATA above). Empty until the
// next content-refresh run. Each entry: {date,title,agendaUrl,hasAgenda,location,time}.
const TELLURIDE_BOARD_MEETINGS = [
  {
    date: "December 2, 2026",
    title: "Telluride Housing Authority Subcommittee",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8166",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "9:00 AM",
    civicwebId: 8166
  },
  {
    date: "December 3, 2026",
    title: "Planning & Zoning Commission - Special Meeting",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8362",
    hasAgenda: false,
    location: "Telluride Science & Innovation Center - 300 S Townsend St",
    time: "5:30 PM",
    civicwebId: 8362
  },
  {
    date: "December 3, 2026",
    title: "Town Council Retreat",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8051",
    hasAgenda: true,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "9:00 AM",
    civicwebId: 8051,
    packetUrl: "https://telluride-co.civicweb.net/document/448279/"
  },
  {
    date: "December 4, 2026",
    title: "Special Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8324",
    hasAgenda: true,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "10:00 AM",
    civicwebId: 8324,
    packetUrl: "https://telluride-co.civicweb.net/document/448285/"
  },
  {
    date: "December 7, 2026",
    title: "Open Space Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8134",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "4:00 PM",
    civicwebId: 8134
  },
  {
    date: "December 8, 2026",
    title: "Telluride Housing Authority Subcommittee Special Meeting",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8364",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "9:00 AM",
    civicwebId: 8364
  },
  {
    date: "December 11, 2026",
    title: "Telluride Housing Authority Subcommittee Special Meeting",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8365",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "10:00 AM",
    civicwebId: 8365
  },
  {
    date: "December 15, 2026",
    title: "Special Joint Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8366",
    hasAgenda: false,
    location: "Ah Haa School For the Arts - Launch Pad",
    time: "5:00 PM",
    civicwebId: 8366
  },
  {
    date: "December 15, 2026",
    title: "Special Joint Historic & Architectural Review Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8367",
    hasAgenda: false,
    location: "Ah Haa School For the Arts - Launch Pad",
    time: "5:00 PM",
    civicwebId: 8367
  },
  {
    date: "December 15, 2026",
    title: "Special Joint Planning & Zoning Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8368",
    hasAgenda: false,
    location: "Ah Haa School For the Arts - Launch Pad",
    time: "5:00 PM",
    civicwebId: 8368
  },
  {
    date: "December 15, 2026",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8047",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "10:00 AM",
    civicwebId: 8047
  },
  {
    date: "December 16, 2026",
    title: "Parks & Recreation Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8085",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "12:00 PM",
    civicwebId: 8085
  },
  {
    date: "December 17, 2026",
    title: "Planning & Zoning Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8110",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "5:30 PM",
    civicwebId: 8110
  },
  {
    date: "January 12, 2027",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8330",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "10:00 AM",
    civicwebId: 8330
  },
  {
    date: "February 2, 2027",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8331",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "10:00 AM",
    civicwebId: 8331
  },
  {
    date: "February 8, 2027",
    title: "Intergovernmental Meeting",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8340",
    hasAgenda: false,
    location: "TBD",
    time: "1:30 PM",
    civicwebId: 8340
  }
];

function getTellurideMeetings() {
  // HARC (hand-curated recurring schedule + bot-patched agenda links).
  const harc = TELLURIDE_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    // Explicit agendaUrl overrides everything (legacy/direct PDF links)
    // civicWebId uses the Town's CivicWeb portal (same system as County)
    // getTownAgendaLink also checks TOWN_CIVICWEB_IDS by title+date
    const civicWebLink = m.civicWebId
      ? TOWN_CIVICWEB_BASE + m.civicWebId
      : getTownAgendaLink(m.title, eventDate);
    const agendaLink = m.agendaUrl || civicWebLink;
    // A CivicWeb meeting PAGE existing does not mean the agenda is POSTED —
    // only an explicit hand/bot-set agendaUrl counts (2026-07-23 fix; the
    // bot-scraped MEETING_AGENDA_META rescues posted agendas downstream in
    // build-week-meetings, so real agendas still go green).
    const hasAgenda = !!m.agendaUrl;
    const link = agendaLink || TELLURIDE_HARC_URL;

    let description = '';
    if (m.note) {
      description = m.note;
    }

    return {
      title: m.special ? m.title + ' -- Special Meeting' : m.title,
      link,
      description,
      eventDate,
      eventDates: '',
      // Real CivicWeb time only. The old '5:00 PM' default showed the wrong
      // hour for specials (Sep 30 2026 HARC was 5:30 PM) — blank beats wrong.
      eventTimes: m.time || '',
      location: m.location || 'Rebekah Hall, 201 N. Pine Street, Telluride',
      source: 'telluride',
      sourceLabel: 'Town of Telluride',
      category: 'HARC Meeting',
      canceled: false,
      hasAgenda,
      agendaLink,
      packetUrl: m.packetUrl || null
    };
  });

  // Other Telluride bodies the bot surfaces from CivicWeb. Rendered generically
  // (no HARC-specific time/location defaults); summary + board-token matching is
  // handled by getMeetingSummary via meetingBoardToken.
  const list = (typeof TELLURIDE_BOARD_MEETINGS !== 'undefined' && Array.isArray(TELLURIDE_BOARD_MEETINGS)) ? TELLURIDE_BOARD_MEETINGS : [];
  const board = list.map(m => {
    const agendaLink = m.agendaUrl || '';
    return {
      packetUrl: m.packetUrl || null,
      title: m.title,
      link: agendaLink || (typeof TOWN_CIVICWEB_FALLBACK !== 'undefined' ? TOWN_CIVICWEB_FALLBACK : agendaLink),
      description: '',
      eventDate: localDate(m.date),
      eventDates: '',
      eventTimes: m.time || '',
      location: m.location || '',
      source: 'telluride',
      sourceLabel: 'Town of Telluride',
      category: m.title,
      canceled: false,
      hasAgenda: !!m.hasAgenda && !!agendaLink,
      agendaLink: agendaLink || null
    };
  });

  return harc.concat(board);
}

// Canonical "board token" for a meeting title, so the website's short card
// titles ("HARC Meeting", "Town Council Meeting") reconcile with the bot's
// CivicWeb-sourced summary keys ("Historic & Architectural Review Commission -
// Jun 17 2026", etc.). Returns '' when no known board matches.
function meetingBoardToken(title) {
  const s = String(title || '').toLowerCase();
  const hasPZ = /planning\s*(?:&|and)\s*zoning|planning commission|\bp&z\b/.test(s);
  const hasHARC = /\bharc\b|historic\s*(?:&|and)\s*architectural/.test(s);
  if (hasPZ && hasHARC) return 'joint';        // joint P&Z + HARC subcommittee
  if (hasHARC) return 'harc';
  if (/town council/.test(s)) return 'council';
  if (hasPZ) return 'pz';
  if (/housing authority/.test(s)) return 'housing';
  if (/ethics/.test(s)) return 'ethics';
  if (/parks?\s*(?:&|and)?\s*rec/.test(s)) return 'parks';
  if (/open space/.test(s)) return 'openspace';
  if (/gondola/.test(s)) return 'gondola';
  return '';
}

function getMeetingSummary(item) {
  if (!item.eventDate) return '';
  // AI_SUMMARIES is defined inline ONLY in gov-hub.html; referencing it bare on
  // any other surface (digest, content-review, source-health) threw a
  // ReferenceError here, silently swallowed by callers' try/catch — so this
  // resolver never ran there. Alias through a typeof guard: never throws;
  // degrades to {} off-page, uses the real store on gov-hub.
  const _AI = (typeof AI_SUMMARIES !== 'undefined' && AI_SUMMARIES) ? AI_SUMMARIES : {};
  const dateKey = localDateKey(item.eventDate);
  const cleanTitle = item.title.replace(/ -- CANCELED$/, '');
  const exactKey = item.source + '|' + dateKey + '|' + cleanTitle;

  // 1. Check AI summaries (from Firestore via Cloud Function)
  if (_AI[exactKey] && _AI[exactKey].shortSummary) {
    const s = _AI[exactKey].shortSummary;
    if (isBadSummary(s)) return '';
    return s;
  }

  // 2. Check manual/fallback summaries
  if (MANUAL_SUMMARIES[exactKey]) return MANUAL_SUMMARIES[exactKey];

  // 2.5 Board-token match. The website card title (e.g. "HARC Meeting") often
  // differs from the bot's CivicWeb-sourced summary key (e.g. "Historic &
  // Architectural Review Commission - Jun 17 2026"). Map both to a canonical
  // board token and match on it — this resolves multi-meeting days where the
  // single-meeting partial match (step 3) gives up. Prefer the full commission
  // agenda over a "Chair" variant, then the longest substantive summary; a
  // 40-char floor + isBadSummary() keep stubs from surfacing.
  const itemTok = meetingBoardToken(cleanTitle);
  if (itemTok) {
    const prefix = item.source + '|' + dateKey + '|';
    const pickBest = (store, getText) => {
      const hits = Object.keys(store)
        .filter(k => k.indexOf(prefix) === 0 && meetingBoardToken(k.slice(prefix.length)) === itemTok)
        .sort((a, b) => (/chair/i.test(a) - /chair/i.test(b)) || (getText(b).length - getText(a).length));
      for (const k of hits) { const s = getText(k); if (s && s.length >= 40 && !isBadSummary(s)) return s; }
      return '';
    };
    const mm = pickBest(MANUAL_SUMMARIES, k => MANUAL_SUMMARIES[k] || '');
    if (mm) return mm;
    const am = pickBest(_AI, k => (_AI[k] && _AI[k].shortSummary) || '');
    if (am) return am;
  }

  // 3. Partial match in manual summaries (source + date, single meeting)
  for (const key of Object.keys(MANUAL_SUMMARIES)) {
    if (key.startsWith(item.source + '|' + dateKey + '|')) {
      const matchCount = Object.keys(MANUAL_SUMMARIES).filter(k => k.startsWith(item.source + '|' + dateKey + '|')).length;
      if (matchCount === 1) return MANUAL_SUMMARIES[key];
    }
  }

  // 4. Partial match in AI summaries
  const aiKeys = Object.keys(_AI).filter(k => k.startsWith(item.source + '|' + dateKey + '|'));
  if (aiKeys.length === 1 && _AI[aiKeys[0]].shortSummary) {
    const s = _AI[aiKeys[0]].shortSummary;
    if (isBadSummary(s)) return '';
    return s;
  }

  return '';
}

function getMeetingZoomLink(item) {
  if (!item.eventDate) return '';
  // School district always uses the same link
  if (item.source === 'school') return SCHOOL_ZOOM_LINK;
  const dateKey = localDateKey(item.eventDate);
  const exactKey = item.source + '|' + dateKey + '|' + item.title.replace(/ -- CANCELED$/, '').replace(/ -- Special Meeting$/, '');
  if (MEETING_ZOOM_LINKS[exactKey]) return MEETING_ZOOM_LINKS[exactKey];
  // Try partial match
  for (const key of Object.keys(MEETING_ZOOM_LINKS)) {
    if (key.startsWith(item.source + '|' + dateKey + '|')) {
      const matchCount = Object.keys(MEETING_ZOOM_LINKS).filter(k => k.startsWith(item.source + '|' + dateKey + '|')).length;
      if (matchCount === 1) return MEETING_ZOOM_LINKS[key];
    }
  }
  return '';
}

function getMeetingPasscode(item) {
  if (!item || !item.eventDate) return null;

  // School district -- extract passcode from URL parameter
  if (item.source === 'school') {
    const url = SCHOOL_ZOOM_LINK;
    const pwdMatch = url.match(/[?&]pwd=([^&]+)/);
    return pwdMatch ? { id: '865 8512 4120', passcode: pwdMatch[1], phone: '' } : null;
  }

  const dateKey = localDateKey(item.eventDate);
  const cleanTitle = item.title.replace(/ -- CANCELED$/, '').replace(/ -- Special Meeting$/, '');
  const exactKey = item.source + '|' + dateKey + '|' + cleanTitle;

  // Try exact match
  if (MEETING_PASSCODES[exactKey]) return MEETING_PASSCODES[exactKey];

  // Try partial match on source + date (if only one meeting that date)
  const datePrefix = item.source + '|' + dateKey + '|';
  const dateMatches = Object.keys(MEETING_PASSCODES).filter(k => k.startsWith(datePrefix));
  if (dateMatches.length === 1) return MEETING_PASSCODES[dateMatches[0]];

  return null;
}

// Steering committee roster for steering.html — names only (see the privacy
// note in scripts/steering-refresh.js: member emails are never committed).
// Synced weekly from the steering@livabletelluride.org Google Group by
// steering-refresh.js; empty until that workflow's Google Workspace
// credentials are configured (see docs/operations.md).
const STEERING_MEMBERS = [];

const STEERING_LAST_SYNCED = '';
