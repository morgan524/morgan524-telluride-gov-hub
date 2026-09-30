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
  "med|2026-09-11|Board Work Session":
    {"sv":4,"agendaUrl":null,"zoomUrl":"https://us02web.zoom.us/j/83975455041?pwd=JFP4C7xMrNnAn93sWUhROdSuVzQbeq.1","meetingId":"839 7545 5041","passcode":"388003"},

  "telluride|2026-09-01|Town Council - Sep 01 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8042","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/XA2kUuXlTg2aifJ0Qwwc-g","meetingId":"847 6915 1454","passcode":"077111.","phone":"719) 359-4580"},

  "telluride|2026-09-02|Ecology Commission - Sep 02 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8118","sv":4,"zoomUrl":"https://us06web.zoom.us/j/84372531870?pwd=Dzpb3SzCKOLJejMu5DGalEWqJghGlM.1","phone":"970-728-3071"},

  "telluride|2026-09-02|Commission for Community Assistance, Arts & Special Events - Sep 02 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8066","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/tZ0pc-ChqDwsGNFpPigfqqLQptmoMmpJdiOx"},

  "telluride|2026-09-02|Telluride Housing Authority Subcommittee - Sep 02 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8163","sv":4,"zoomUrl":"https://us06web.zoom.us/j/83022451705?pwd=Lj8jkLF9GQny7CWBqvP8IYkQhviQBb.1","meetingId":"830 2245 1705","passcode":"229528.","phone":"719) 359-4580"},

  "county|2026-09-02|Board of County Commissioners Meeting":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/887/files/agenda/1980","zoomUrl":"https://us02web.zoom.us/meeting/register/Yn2gLRVBQmaLhCboss4rJw","meetingId":"874 3946 5050","passcode":"885643","phone":"719-359-4580"},

  "mv|2026-09-03|Design Review Board":
    {"sv":4,"agendaUrl":"https://townofmountainvillage.com/site/assets/files/49787/september_3-_2026_design_review_board_meeting_agenda.pdf","zoomUrl":"https://us06web.zoom.us/j/83949014976?pwd=oze6zDkOSb0a8fjpvluaHR1zcyO0XN.1","meetingId":"839 4901 4976"},

  "norwood|2026-09-08|Norwood Water Commission Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "tmvoa|2026-09-08|Mountain Village Merchant Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "norwood|2026-09-09|Board of Trustees Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "ridgway|2026-09-09|Ridgway Town Council Regular Meeting":
    {"sv":4,"agendaUrl":"https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town-Council-Regular-Meeting-Packet---September-9%2C-2026.pdf","zoomUrl":"https://us02web.zoom.us/j/81840930273?pwd=2OkbQtAHo5WBatJ59jd6UlvLRe6R88.1","meetingId":"818 4093 0273","passcode":"837340","phone":"346 248 7799"},

  "county|2026-09-09|Board of County Commissioners Work Session":
    {"sv":4,"ph":"5bee59f208152c68"},

  "telluride|2026-09-10|Town Council Budget - Sep 10 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8052","sv":4,"ph":"a2d452b639a44962"},

  "county|2026-09-10|Planning Commission Meeting":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/923/files/agenda/1979","zoomUrl":"https://us06web.zoom.us/j/84540142300?pwd=kR3YU9IZBab43RLiNx0ox1gygbOI8C.1","meetingId":"845 4014 2300","passcode":"704358","phone":"970-728-3844"},

  "smart|2026-09-10|SMART Board of Directors":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-09-14|Open Space Commission - Sep 14 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8131","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/ePrh_CzmTLKqp0syEbUesw","meetingId":"894 7506 0147","passcode":"314276.","phone":"719) 359-4580"},

  "fire|2026-09-15|Board of Directors Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "ophir|2026-09-15|General Assembly Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "rico|2026-09-16|Rico Board of Trustees Regular Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-09-16|Historic & Architectural Review Commission Chair - Sep 16 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8023","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/dRjdHtmeTB6DmemBLALAFw","meetingId":"854 0207 9752","passcode":"775535","phone":"301-715-8592"},

  "telluride|2026-09-16|Historic & Architectural Review Commission - Sep 16 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8022","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/KKzcuKFdTuyXzpw65k2aAA","meetingId":"812 9136 3866","passcode":"440860.","phone":"301-715-8592"},

  "telluride|2026-09-16|Parks & Recreation Commission - Sep 16 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8082","sv":4,"ph":"6fb96e40a5040f91"},

  "county|2026-09-16|Board of County Commissioners Meeting":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/900/files/agenda/1999","zoomUrl":"https://us02web.zoom.us/meeting/register/tnLYPloRS7mtngp_HQWFXQ","meetingId":"867 6377 9971","passcode":"898059","phone":"719-359-4580"},

  "mv|2026-09-17|Town Council Meeting":
    {"sv":4,"agendaUrl":"https://townofmountainvillage.com/site/assets/files/49907/september_17-_2026_town_council_meeting_agenda.pdf","zoomUrl":"https://us06web.zoom.us/webinar/register/WN_Kr1kwk46TGyPz8uk-4_ktA","phone":"970-369-6429"},

  "airport|2026-09-17|TRAA Board of Commissioners Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-09-17|Liquor Licensing Authority - Sep 17 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8145","sv":4,"zoomUrl":"https://us06web.zoom.us/j/86169871704?pwd=oK56hZLiXIbBia4HLKYI9XqWcVl8Uz.1","meetingId":"861 6987 1704","passcode":"281002.","phone":"346-248-7799"},

  "norwood|2026-09-21|Planning and Zoning Commission Meeting":
    {"sv":4,"agendaUrl":"https://www.norwoodtown.com/files/d3a7e2221/09.21.2026+P%26Z+BOA+AGENDA.pdf","zoomUrl":"https://us02web.zoom.us/j/85001344971","meetingId":"850 0134 4971","passcode":"8142302","phone":"970-327-4288"},

  "school|2026-09-22|Telluride Board of Education Work Session":
    {"sv":4,"agendaUrl":"https://files.smartsites.parentsquare.com/3403/92226_ws_packet.pdf","zoomUrl":"https://telluridek12.zoom.us/j/86585124120?pwd=TGd6c3A3WFMvRTI2blBnUStwdVI5Zz09","meetingId":"865 8512 4120","passcode":"468668"},

  "school|2026-09-22|Telluride Board of Education Monthly Meeting":
    {"sv":4,"agendaUrl":"https://files.smartsites.parentsquare.com/3403/92226_mm_packet.pdf","zoomUrl":"https://telluridek12.zoom.us/j/86585124120?pwd=TGd6c3A3WFMvRTI2blBnUStwdVI5Zz09","meetingId":"865 8512 4120","passcode":"468668"},

  "telluride|2026-09-22|Telluride Housing Authority - Sep 22 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8303","sv":4},

  "telluride|2026-09-22|Town Council - Sep 22 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8043","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/SHk2kkI1S6SZlmiHuwkPLg","meetingId":"822 3651 5916","passcode":"159154.","phone":"719) 359-4580"},

  "county|2026-09-23|Board of County Commissioners Work Session":
    {"sv":4,"ph":"307e0c7b19e4ff5b"},

  "med|2026-09-24|Regular Board Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-09-24|Planning & Zoning Commission - Sep 24 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8104","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/pvzPtHtIRZmah22XUU2xLg","meetingId":"846 6324 0731","passcode":"464545","phone":"301-715-8592"},

  "telluride|2026-09-24|Planning & Zoning Commission Chair - Sep 24 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8103","sv":4,"ph":"313a820643e5b960"},

  "telluride|2026-09-10|(Rescheduled to Oct 13th) Town Council Budget - Sep 10 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8052","sv":4},

  "telluride|2026-09-23|Vending Subcommittee - Sep 23 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8308","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/l3rAiIuyRgyVFu2-92kJZw","meetingId":"835 9480 9571","passcode":"960386"},

  "county|2026-09-15|Housing Code Update SSR":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1069/files/agenda/1990","zoomUrl":"https://us06web.zoom.us/j/88053660816?pwd=n7qJTXvayoEO5RY4eo8koGmh4nHHai.1","meetingId":"880 5366 0816","passcode":"616389"},

  "ouray|2026-09-02|PM - Note: Virtual/Zoom meeting only!  The Planning Commission will conduct a work session to review and discuss possible changes to the Ouray County Land Use Code, Section 2 – Definitions. (packet materials are attached to the agenda)":
    {"agendaUrl":"https://ouraycountyco.gov/AgendaCenter/PreviousVersions/1016","sv":4},

  "county|2026-09-28|Open Space Commission Meeting":
    {"sv":4,"ph":"1ff606174e68cca5"},

  "telluride|2026-09-30|Special Meeting - Historic & Architectural Review Commission - Sep 30 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8309","sv":4,"meetingId":"822 7800 9621","passcode":"976053.","phone":"301-715-8592"},

  "telluride|2026-09-17|Special Meeting - Planning & Zoning Commission - Sep 17 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8310","sv":4,"zoomUrl":"https://us06web.zoom.us/j/85992668350?pwd=R89oLHvfdFJZrpNb6yzGqqHUrl3phe.1","meetingId":"859 9266 8350","passcode":"503877","phone":"301-715-8592"},

  "telluride|2026-09-30|Special Town Council - Sep 30 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8313","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/ZR3DDUQ0S8mhIKRt4KiuYg","meetingId":"872 6396 2426","passcode":"044233.","phone":"719) 359-4580"},

  "mv|2026-10-01|Design Review Board":
    {"sv":4,"agendaUrl":"https://townofmountainvillage.com/site/assets/files/49956/october_1-_2026_design_review_board_meeting_agenda.pdf","zoomUrl":"https://us06web.zoom.us/j/86570635291?pwd=l2jamcgTZa6TyCpzPj1jMBiQSaSNw4.1","meetingId":"865 7063 5291"},

  "telluride|2026-10-01|Town Council Budget - Oct 01 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8053","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/mMypuT1BQNK27cx_24iMjg","meetingId":"874 2591 5002","passcode":"510794.","phone":"719) 359-4580"},

  "county|2026-10-01|Lodging Tax Panel Meeting":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1070/files/agenda/2014"},

  "county|2026-09-09|Board of County Commissioners Special Meeting":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/857/files/agenda/1988","zoomUrl":"https://us02web.zoom.us/meeting/register/Jxg2WRQ2SEKGwI4gi2zyAg","meetingId":"867 2008 8025","passcode":"755642","phone":"719-359-4580"},

  "ouray|2026-09-16|, 1-4:00 PM (@ OURAY COURTHOUSE!) - The PC will hold 2 public hearings; Curry Regular PUD, and an Exemption application from Clifford Pastor to subdivide his parcel into 2 lots. (Packet materials are under media TV icon)":
    {"agendaUrl":"https://ouraycountyco.gov/AgendaCenter/PreviousVersions/1017","sv":4},

  "norwood|2026-09-08|NWC Rescheduled to 09/22/2026":
    {"agendaUrl":"https://www.norwoodtown.com/files/5f8304a63/09.08.2026+RESCHEDULED+NWC+Agenda.pdf","zoomUrl":"https://us02web.zoom.us/j/88274908233","meetingId":"882 7490 8233","passcode":"997236","phone":"346-248-7799","sv":4},

  "telluride|2026-10-05|Open Space Commission - Oct 05 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8132","sv":4,"ph":"606a000116078bce"},

  "telluride|2026-10-06|Town Council - Oct 06 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8044","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/FzTNzG02TT6y-M9RZcn60w","meetingId":"818 0787 9405","passcode":"424441.","phone":"719) 359-4580"},

  "mv|2026-10-07|Town Council Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-10-07|Ecology Commission - Oct 07 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8119","sv":4,"ph":"82b6deaef9451b0e"},

  "telluride|2026-10-07|Commission for Community Assistance, Arts & Special Events - Oct 07 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8067","sv":4,"ph":"b351f6bb6fbe13ad"},

  "telluride|2026-10-07|Telluride Housing Authority Subcommittee - Oct 07 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8164","sv":4,"ph":"fbf369f84f691ffa"},

  "county|2026-10-07|Board of County Commissioners Meeting":
    {"sv":4,"ph":"a12dfd2ce826475e"},

  "telluride|2026-10-08|Special Meeting - Planning & Zoning Commission - Oct 08 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8311","sv":4,"ph":"4318f9c666b0b315"},

  "county|2026-10-08|Planning Commission Meeting":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/924/files/agenda/2025","zoomUrl":"https://us06web.zoom.us/j/86224076240?pwd=dg8IrMwtLfHLkcZ1Y3JKlGs8IpYz0Q.1","meetingId":"862 2407 6240","passcode":"691404","phone":"970-728-3844"},

  "telluride|2026-09-10|San Miguel Authority for Regional Transportation - Sep 10 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8314","zoomUrl":"https://us02web.zoom.us/j/89045288089?pwd=b1Gfa5STKy8Wstoqdc8oBxCCs1s6pg.1","sv":4},

  "county|2026-09-24|5 x 5 County Meeting - San Miguel County Hosts":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1071/files/agenda/2005","zoomUrl":"https://us02web.zoom.us/meeting/register/MPkylS4iTRCn1ZOARSNRPQ","meetingId":"867 6377 9971","passcode":"898059.","phone":"719-359-4580"},

  "tmvoa|2026-09-29|TMVOA Board of Directors Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-09-24|Resident Advisory Committee - Sep 24 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8315","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/HZo2uN-sQUesPZ2bJze9pQ","meetingId":"864 1732 3408","passcode":"709234","phone":"970-728-3071"},

  "telluride|2026-09-16|CANCELED - Parks & Recreation Commission - Sep 16 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8082","sv":4},

  "telluride|2026-09-14|Telluride Housing Authority Subcommittee Special Meeting - Sep 14 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8316","sv":4,"zoomUrl":"https://us06web.zoom.us/j/88002208411?pwd=ofXFpbWHXtGZcNFnjfWucOBrCmoYqU.1","meetingId":"880 0220 8411","passcode":"541637.","phone":"719) 359-4580"},

  "smart|2026-10-08|SMART Board of Directors":
    {"sv":4,"ph":"b858cb282617fb09"},

  "norwood|2026-10-13|Norwood Water Commission Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "tmvoa|2026-10-13|Mountain Village Merchant Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-10-13|Special Town Council Budget - Oct 13 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8307","sv":4,"ph":"6a080e4b265b9c85"},

  "norwood|2026-10-14|Board of Trustees Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "ridgway|2026-10-14|Ridgway Town Council Regular Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-10-14|Liquor Licensing Authority - Oct 14 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8146","sv":4,"ph":"28ddc62878422962"},

  "county|2026-10-14|Board of County Commissioners Work Session":
    {"sv":4},

  "mv|2026-10-15|Town Council Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "airport|2026-10-15|TRAA Board of Commissioners Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "med|2026-09-17|Regular Board Meeting":
    {"agendaUrl":"https://www.tellmed.org/files/61309e97c/THD+Special+Bd+Mtg+Agenda+9.17.26.pdf","zoomUrl":"https://us02web.zoom.us/j/81133887855?from=addon","meetingId":"811 3388 7855","sv":4},

  "county|2026-09-23|Board of County Commissioners Special Meeting":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/870/files/agenda/2008","zoomUrl":"https://us02web.zoom.us/meeting/register/n4e7ZSbqRwm-OmsZjc_8vg","meetingId":"835 4898 8890","passcode":"669213","phone":"719-359-4580"},

  "county|2026-09-30|Board of County Commissioners Work Session":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1073/files/agenda/2015","zoomUrl":"https://us02web.zoom.us/meeting/register/axK-J57IQayv9QHf2lIksg","meetingId":"875 8192 6670","passcode":"036006","phone":"719-359-4580"},

  "telluride|2026-09-17|Open Space Commission Site Walk - Sep 17 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8317","sv":4},

  "norwood|2026-09-22|Norwood Water Commission Meeting":
    {"agendaUrl":"https://www.norwoodtown.com/files/677a3380f/09.22.2026+NWC+Amended+Agenda.pdf","zoomUrl":"https://us02web.zoom.us/j/88274908233","meetingId":"882 7490 8233","passcode":"997236","phone":"346-248-7799","sv":4},

  "telluride|2026-09-21|Gondola Subcommittee - Sep 21 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8318","zoomUrl":"https://gbsm.zoom.us/j/82559576086","sv":4},

  "norwood|2026-10-19|Planning and Zoning Commission Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-09-21|Open Space Commission Site Walk - Sep 21 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8319","sv":4},

  "fire|2026-10-20|Board of Directors Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "school|2026-10-20|Telluride Board of Education Monthly Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "ophir|2026-10-20|General Assembly Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-10-01|Special Meeting - Planning & Zoning Commission - Oct 01 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8311","sv":4,"zoomUrl":"https://us06web.zoom.us/j/87905773273?pwd=pN5GyaZNwzzkO4OVLDU3Cf94a7hy6s.1","meetingId":"879 0577 3273","passcode":"555229","phone":"301-715-8592"},

  "rico|2026-10-21|Rico Board of Trustees Regular Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-10-21|Historic & Architectural Review Commission Chair - Oct 21 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8025","sv":4,"ph":"c951089001cb45c2"},

  "telluride|2026-10-21|Historic & Architectural Review Commission - Oct 21 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8024","sv":4,"ph":"0edc39a9264b1248"},

  "telluride|2026-10-21|Parks & Recreation Commission - Oct 21 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8083","sv":4,"ph":"bd74d669e41a67a8"},

  "county|2026-10-21|Board of County Commissioners Meeting":
    {"sv":4,"ph":"a12dfd2ce826475e"},

  "med|2026-10-22|Regular Board Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "tmvoa|2026-10-22|TMVOA Board of Directors Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-10-22|Planning & Zoning Commission - Oct 22 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8106","sv":4,"ph":"3ad5aa7f9ebe51be"},

  "telluride|2026-10-22|Planning & Zoning Commission Chair - Oct 22 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8105","sv":4,"ph":"d0e0554de56351fb"},

  "county|2026-10-22|Board of Adjustment Meeting":
    {"sv":4,"ph":"9fed4623122d2e3a"},

  "school|2026-10-19|Telluride Board of Education Work Session":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-09-28|Gondola Leadership Committee - Sep 28 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8321","zoomUrl":"https://gbsm.zoom.us/j/83597933306","sv":4},

  "telluride|2026-10-14|Special Liquor Licensing Authority - Oct 14 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8146","sv":4,"ph":"65b7901f622f722e"},

  "mv|2026-09-25|Town Council Meeting":
    {"agendaUrl":"https://townofmountainvillage.com/site/assets/files/49970/september_25-_2026_special_town_council_meeting_agenda.pdf","sv":4},

  "county|2026-09-28|Open Space Commission":
    {"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1074/files/agenda/2017","zoomUrl":"https://us02web.zoom.us/j/86049358611","meetingId":"860 4935 8611","passcode":"048535","phone":"970-728-3174","sv":4},

  "telluride|2026-09-28|Open Space Commission Site Walk - Sep 28 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8322","sv":4},

  "county|2026-10-26|Open Space Commission Meeting":
    {"sv":4,"ph":"1ff606174e68cca5"},

  "telluride|2026-10-27|Town Council - Oct 27 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8045","sv":4,"ph":"32e2fb93c90d2ccb"},

  "county|2026-10-28|Board of County Commissioners Work Session":
    {"sv":4},

  "ouraycity|2026-09-30|Ouray City Council Work Session":
    {"agendaUrl":"https://meetings.boardbook.org/Public/Agenda/2503?meeting=769742","sv":4},

  "ouray|2026-09-29|Board of County Commissioners Special Work Session":
    {"agendaUrl":"https://ouraycoco.portal.civicclerk.com/event/2149/files/agenda/7544","zoomUrl":"https://us06web.zoom.us/j/87606375697?pwd=F4epE8XNbLwY5HjLUYeETbwoQsL0ps.1","meetingId":"876 0637 5697","passcode":"946299","phone":"346-248-7799","sv":4}
};

// Deep-dive auto-updates written by scripts/deep-dive-refresh.js (Haiku
// triage of Town/County news + agendas). Seeded 2026-07-20 — the writer
// existed for months but this const was missing, so writes never landed.
const DEEP_DIVE_UPDATES = [
{
  "topic": "carhenge",
  "type": "news",
  "source": "Town of Telluride",
  "articleDate": "Aug 8, 2026",
  "title": "Shandoka and Carhenge Lots Closed Aug 11–21",
  "copy": "Both the Shandoka and Carhenge commuter parking lots will close temporarily from August 11 through 21. The reason for the closure was not specified in the notice.",
  "href": "https://www.telluride.gov/AlertCenter.aspx?AID=71",
  "addedDate": "2026-08-08"
}
];

// Hub-Bub Question of the Day, written by content-refresh.js (Task 24) on the
// first run of each Mountain-Time day. Newest first, capped at 30. Each entry:
// { date: 'YYYY-MM-DD' (MT), title, body, choices: [2-4 short strings],
//   sourceUrl, topics: [] }. Rendered by hub-bub.html from the JSON mirror
// (data/daily-questions.json); votes live in Firestore daily_questions/{date}.
const DAILY_QUESTIONS = [
  {
    date: "2026-09-29",
    title: "Arts money and wildfire code — same meeting",
    body: "The Commission for Community Assistance, Arts & Special Events is set to meet October 7 to work through funding for community support and arts organizations, review special events applications, and take up town policy. Wildfire resiliency standards — under Ordinance #1640, passed in August 2026 — may also come up. That's a wide table. Some residents will wonder whether arts and events funding deserves airtime alongside fire code implementation. Others will say community life and fire safety aren't in competition — both belong at the same table.\n\nWhen it comes to commission agendas up here, do you think arts funding and wildfire policy should be handled separately or together?",
    choices: ["Keep them separate", "Same table is fine", "Depends on the topic", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-28",
    title: "County business: helium, hauling, and a jail paint job",
    body: "The Board of County Commissioners has a full plate this week — procurement items covering material hauling, trail construction, a fuel island canopy, and jail painting, plus an energy regulatory hearing on an alleged violation against American Helium Operating LLC. That last one tends to fly under the radar up here, but energy enforcement touches land and revenue questions that affect the whole county.\n\nSome folks will say routine procurement and regulatory hearings are exactly what the board is for. Others will want to know more before any alleged violation gets resolved behind closed doors.\n\nHow closely should the public be watching that energy hearing?",
    choices: ["Very closely — it's a public matter", "Board can handle it", "Need more details first"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-27",
    title: "Wildlife and wildfire — same meeting, same town",
    body: "The Ecology Commission meets October 7th with two things on the table: human-wildlife interactions and the ripple effects of Ordinance #1640, Telluride's new wildfire resiliency code amendment. Those two topics aren't as unrelated as they sound. Wildfire mitigation — clearing vegetation, hardening structures — changes habitat. Some residents see that as a necessary trade for fire safety. Others worry about what gets lost ecologically when you engineer the landscape for human protection. Neither concern is wrong. So which should drive the decisions up here when they pull in opposite directions?",
    choices: ["Fire safety has to come first", "Ecology can't be an afterthought", "They can be balanced", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-26",
    title: "The county wants to haul material and build trails — at the same time",
    body: "The Board of County Commissioners has a work session coming up that lumps together trail construction for the Lawson Hill Connector, material hauling, a fuel island canopy, and jail painting — all in one procurement conversation. Some will see efficient government: bundle the work, move faster. Others will wonder whether pairing a trail project with jail maintenance and fuel infrastructure is the right way to weigh priorities or spend public money. Nothing's been decided yet — this is a work session.\n\nWhen county projects get bundled like this, does that make the process smoother, or does it make it harder to scrutinize what's actually being approved?",
    choices: ["Bundling makes sense — move faster", "Keep projects separate", "Need more info"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-25",
    title: "Federal money or local control — pick one?",
    body: "The Gondola Leadership Committee is weighing two approaches: a federally funded path versus a locally-led one. Those aren't the same thing. Federal dollars usually come with federal strings — timelines, requirements, oversight. A locally-led project keeps more control up here but means finding the money some other way. Reasonable people land in different places on that trade. The committee is also working on a communications plan, which suggests this is still very much in motion, not decided.\n\nSo — when it comes to a project like this, which matters more to you: the funding source or who's running the show?",
    choices: ["Keep local control", "Take the federal money", "Need more info"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-24",
    title: "15 units on Adams Ranch Road — enough, or not enough?",
    body: "The Design Review Board is taking up final architecture review for a 15-unit employee apartment building at 306 Adams Ranch Road. The case was continued from September, so this one's been in the room before.\n\nThe tension is familiar up here: workforce housing is badly needed, and purpose-built employee apartments are one of the few tools that actually house workers. But neighbors and design boards weigh density, scale, and fit against that need every time. Fifteen units is not nothing.\n\nSo — is 15 units at that address the right call, or does the design need more work before it moves forward?",
    choices: ["Approve it, we need the housing", "The design needs more work", "Need more info"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-23",
    title: "Who's watching the lodging tax money?",
    body: "The Lodging Tax Panel meets to oversee how lodging tax revenues get administered and allocated in San Miguel County. That's a job most residents don't think about until they do — and then they have opinions. Some feel that money should flow directly to things that benefit locals year-round. Others argue tourism infrastructure is exactly what keeps the economy working for everyone up here. The panel's standard oversight role shapes both. So: who do you think should have the loudest voice in deciding where that money goes?",
    choices: ["Year-round residents first", "Tourism drives everything here", "Spread it — both matter", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-22",
    title: "Historic district, meet wildfire code — again",
    body: "The Historic and Architectural Review Commission is holding a special meeting to work out how Ordinance #1640 — the wildfire resiliency code Town Council passed on August 11, 2026 — applies to buildings inside Telluride's historic district. That's where it gets interesting. Certificates of Appropriateness exist to protect historic character. Wildfire resiliency standards exist to protect lives and property. Those two goals don't always point the same direction. Which one gives when they conflict?\n\nWhere do you think the line should fall when historic preservation and fire safety don't agree?",
    choices: ["Fire safety has to come first", "Protect the historic character", "Find a middle ground", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-21",
    title: "Historic district meets wildfire code — now what?",
    body: "The Historic and Architectural Review Commission has a special meeting September 30 to work out how Ordinance #1640 — the wildfire resiliency code Town Council passed August 11 — applies when someone needs a Certificate of Appropriateness for a structure in Telluride's historic district. That's where the tension lives. Wildfire resiliency standards can mean different materials, different landscaping, different design choices. Historic preservation rules often push the other direction. Neither goal is wrong. So how does a commission square them when they collide on the same property?",
    choices: ["Safety standards have to come first", "Find a middle ground case by case", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-20",
    title: "Old buildings, new fire rules — something's got to give",
    body: "The Historic and Architectural Review Commission has a special meeting September 30 to work out how Ordinance #1640 — the wildfire resiliency code passed August 11 — applies when issuing Certificates of Appropriateness for structures in Telluride. That's where the rub is. Historic preservation and wildfire resiliency don't always want the same thing from a building. Fire-resistant materials, updated assemblies, vegetation setbacks — they can conflict with what HARC exists to protect. Neither concern is frivolous. So how do you weigh them when they pull in opposite directions on the same structure?",
    choices: ["Fire safety has to come first", "Historic character shouldn't bend", "Find middle ground case by case", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-19",
    title: "The Lawson Hill connector — shortcut or something else?",
    body: "The Open Space Commission is set to discuss the Lawson Hill Connector Trail Project, along with material hauling needs and other land management questions in San Miguel County. A connector trail sounds straightforward — until it isn't. Proponents see better access and a more connected network. Skeptics worry about what more foot traffic does to the land, the neighborhood, and the character of open space that people moved here to protect. Nothing's been decided yet. So: when it comes to new trail connections up here, where do you land?",
    choices: ["More trails, more access", "Protect what's already there", "Depends on the specifics"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-18",
    title: "The wildfire code lands on P&Z's desk",
    body: "Town Council passed Ordinance #1640 back in August 2026, folding the Colorado Wildfire Resiliency Code into Telluride's Land Use Code. Now Planning & Zoning has to figure out what that actually means on the ground.\n\nSome residents will say it's overdue — one dry summer up here and the argument makes itself. Others will push back on what new resiliency standards do to construction costs, design flexibility, or already-strained housing options. Implementation is where the rubber meets the road, and that's still being worked out.\n\nWhat matters most to you as this code gets put into practice?",
    choices: ["Fire safety comes first", "Worried about the costs", "Depends on the details", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-17",
    title: "Beavers, trails, and signs — Open Space has a full plate",
    body: "The Open Space Commission is working through a string of site walks this month — debriefs from August walks on a potential trail alignment from the Bear Creek Trailhead to Firecracker Hill, beaver activity in Zone 3 of the Bear Creek Preserve, and sign sizing on the Valley Floor. They're also prepping for September 21st walks on Zone 1 restoration and a river restoration project at the Mill Creek Confluence.\n\nThe tension is real: restoration and wildlife habitat pull one way, expanded trail access pulls another. More trail connections mean more people out there — which isn't always what the beavers need.\n\nWhere do you draw the line between access and preservation?",
    choices: ["Access comes first", "Habitat comes first", "Both can coexist", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-16",
    title: "Two bucks a month — that's the fight?",
    body: "San Miguel Power Association is adding a $2.00 monthly fee for paper billing, set to kick in October 29, 2026. Small number, real disagreement. Some folks will say it's a nudge toward going paperless that saves everyone money in the long run. Others — especially residents without reliable internet, or those who just want a paper record — will say a utility shouldn't be penalizing customers for how they receive a bill. So: is a $2.00 paper billing fee a reasonable efficiency move, or a quiet burden on the wrong people?",
    choices: ["Fair nudge, go paperless", "Wrong way to push people", "Two bucks isn't the point", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-15",
    title: "A trail, some hauling, and a foreclosure — busy week for the county",
    body: "The Board of County Commissioners has a full plate September 16: procurement on material hauling, a trail connector project, and a fuel island canopy. That's routine enough. But tucked into the same meeting is a federal environmental assessment for hazardous fuels management in the Uncompahgre and Gunnison National Forests — and a foreclosure sale in Telluride Mountain Village.\n\nThe trail connector could be a genuine community win. The federal fuels work is already on the recent radar up here. But a foreclosure in Mountain Village, landing quietly in a procurement agenda — does that deserve more public attention than it's getting?",
    choices: ["Trail project is the priority", "Foreclosure deserves more scrutiny", "Fuels work is what matters", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-14",
    title: "Old walls, new plans — who decides what fits?",
    body: "The Historic and Architectural Review Commission is meeting to consider Certificates of Appropriateness — the green light required before you can build, renovate, alter, or demolish a structure in Telluride. That process protects what makes the town look like itself. But it also means a board can say no to a property owner's plans, or reshape them considerably. Some folks see that as exactly the point. Others see it as a constraint that adds cost and friction — especially when housing pressure is real. Where's the line between preserving character and getting in the way of necessary change?",
    choices: ["Preservation has to come first", "Owners deserve more flexibility", "Depends on the structure", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-13",
    title: "Another liquor license — who gets to decide if that's too many?",
    body: "The Liquor Licensing Authority meets September 17 to review applications or modifications for liquor licenses. Under Colorado law, both the local authority and the state Department of Revenue have to sign off before anything moves.\n\nHere's the rub: some residents think more licensed establishments mean more vitality — jobs, tax revenue, a livelier town. Others figure up here we already tip the balance toward bars and away from the kind of place locals can actually live in. The licensing board weighs the application in front of it, not the big picture.\n\nSo — should the local authority be thinking about the cumulative effect, or is that the wrong question to put to them?",
    choices: ["Count cumulative impact", "Judge each app on its own", "State rules cover it", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-12",
    title: "New building codes are coming. That's the easy part.",
    body: "The county is holding a public hearing on September 16 to consider adopting the 2024 International Building Code and the Colorado Low Energy & Carbon Code. Two codes, one hearing. On one side: updated standards mean safer, more efficient buildings — hard to argue with that up here. On the other: new code requirements can add cost and complexity to construction at a moment when building anything affordable is already a stretch. Neither outcome is final yet.\n\nSo — do tighter building codes help this community, or do they make an already difficult situation harder?",
    choices: ["They raise the floor for everyone", "More costs we can't afford", "Depends on what's in the fine print", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-11",
    title: "Hazardous fuels work in the national forests — your call?",
    body: "The Board of County Commissioners is taking up a federal environmental assessment for a hazardous fuels management project in the Uncompahgre and Gunnison National Forests. That means treatments — thinning, burning, clearing — on public land that surrounds this place. Some folks will say it's overdue and reduces real fire risk to communities up here. Others will push back on the scale, the methods, or whether a federal assessment process gives locals enough of a voice. Nothing's been decided locally yet.\n\nWhere do you stand — does aggressive hazardous fuels work on surrounding forest land make you feel safer, or does it raise more questions than it answers?",
    choices: ["Feels like necessary risk reduction", "Too many unknowns about the methods", "Give locals more say first", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-10",
    title: "One parcel, two lots — simple math or slippery slope?",
    body: "At the Ouray Courthouse on September 16, the Planning Commission holds a public hearing on an exemption application from Clifford Pastor to subdivide his parcel into two lots. Exemptions like this are meant for straightforward splits — but in a region where land is scarce, every subdivision has neighbors watching closely. Some will see a reasonable property-rights call. Others worry each approved split nudges rural character a little further toward something else. The commission hasn't voted yet.\n\nSo: where do you come down on parcel splits like this one?",
    choices: ["Landowner's call to make", "Too much pressure on rural land", "Depends on the specifics", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-09",
    title: "The county's got a fuel island project. Worth asking about.",
    body: "The Board of County Commissioners is set to consider several procurement items — material hauling, a trail connector, and fuel island canopy construction. Tucked alongside those is a federal environmental assessment for a hazardous fuels management project in the Uncompahgre and Gunnison National Forests. Some folks will see federal fuels work on nearby forest lands as overdue and necessary. Others will want to know exactly what that means on the ground — and who has a say. Nothing's final yet; this is still at the consideration stage.\n\nSo where do you stand: is federal hazardous fuels work on our neighboring forests a straightforward win, or do you want more details before you're comfortable?",
    choices: ["Get it done — overdue", "Need more details first", "Depends on the scope", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-08",
    title: "Wildfire code is law — now what?",
    body: "Town Council passed Ordinance #1640 on August 11, 2026, amending the Land Use Code to implement the Colorado Wildfire Resiliency Code. Now a rescheduled budget session may revisit it. Some residents will see the code as overdue — the fire risk up here is real and the old rules didn't account for it. Others will push back on what new resiliency requirements cost property owners, or whether state-level rules translate cleanly to a tight canyon town. Nothing's been undone yet. So where do you stand — was folding a wildfire code into the Land Use Code the right call?",
    choices: ["Right call, long overdue", "Wrong fit for this town", "Depends on the cost", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-07",
    title: "The county's buying a trail connector — who's watching the tab?",
    body: "The Board of County Commissioners is set to take up procurement on several fronts — material hauling, a fuel island canopy, and a trail connector project. The trail piece is the one worth watching. Trail connectors sound easy to love, but procurement decisions at the county level raise real questions about priorities and process. Some residents will see investment in trail infrastructure as exactly what keeps this place livable. Others will ask whether the county's spending is being scrutinized carefully enough, and by whom.\n\nWhere do you land on county-level trail spending right now?",
    choices: ["Trail investment is worth it", "Scrutinize the spending first", "Depends what it connects", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-06",
    title: "What should open space cost us — and why",
    body: "The Open Space Commission meets September 14 to work through priorities and criteria for acquiring, managing, and maintaining open space — and to shape what it recommends to Town Council.\n\nThat's where the tension lives. Some residents see open space acquisition as the clearest thing a mountain town can do to protect what's left. Others wonder whether the criteria and priorities get set in a way that reflects the whole community, not just those who show up. Neither side is wrong.\n\nSo: who should be driving open space priorities up here — and what should the criteria actually be?",
    choices: ["Community input should lead", "Let the experts set priorities", "Depends on the parcel", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-05",
    title: "Blue Lakes wants a fee. Ridgway's about to weigh in.",
    body: "Ridgway Town Council is expected to authorize a mayoral letter supporting a proposed recreation fee structure at Blue Lakes. That's not a final vote — it's the town putting its name behind a position.\n\nSome will say fees are overdue. Popular spots take a beating, and money for upkeep has to come from somewhere. Others will push back: public lands have always been free to access, and fees can quietly price out the people who live closest to them.\n\nWhere do you stand on charging for access to Blue Lakes?",
    choices: ["Fees make sense", "Keep it free", "Depends on the amount", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-04",
    title: "New building code — does it fit up here?",
    body: "The county is holding a public hearing on whether to adopt the 2024 International Building Code and the Colorado Low Energy & Carbon Code. Those who favor adoption say updated codes mean safer buildings and lower carbon footprints — reasonable goals anywhere. Those who push back say modern energy codes can drive up construction costs in a place where building is already expensive, and that standards written for the Front Range don't always translate to a mountain county with a short construction season and a thin contractor pool. Nothing is adopted yet — this is a public hearing. So: do updated building codes make sense for San Miguel County right now, or is the timing wrong?",
    choices: ["Adopt them — overdue", "Too costly for here", "Phase them in slowly", "Not sure yet"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-03",
    title: "Gas-powered leaf blowers — gone by 2028?",
    body: "The Ecology Commission is working toward recommending a full phase-out of combustion-powered lawn and garden equipment in Town. Leaf blowers would go first, banned by January 1, 2028. Everything else covered by the ordinance would follow by January 1, 2030. The case for it: air quality, noise, and emissions. The case against: cost, even with rebates the draft says could offset roughly half of replacement. No vote was taken — this is still a recommendation in progress. So: is this a reasonable step, or an overreach?\n\nWhere do you land?",
    choices: ["Reasonable step", "Overreach", "Fine idea, timeline's too fast", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-02",
    title: "When a roof doesn't fit the rules — but they approve it anyway",
    body: "Lela and Jon Martin need a new roof on their deed-restricted unit at Gold Run. The bid came in at $47,743.86 — roughly 17% of their original purchase price. Their deed restriction caps staff-approvable capital improvements at 5% of that price, or about $13,960, and allows exceptions only when work increases the unit's capacity to house additional occupants. Staff acknowledges the roof doesn't meet that standard. They're recommending approval anyway.\n\nSome will say the restriction exists for a reason and bending it sets a precedent. Others will say a roof is a roof — you can't let a deed-restricted unit fall apart over a technicality. Where do you come down?",
    choices: ["Approve it — a roof is basic upkeep", "Hold the line on deed restrictions", "Fix the policy first, then decide", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-09-01",
    title: "Foreclosures on the agenda — twice",
    body: "The Board of County Commissioners meets September 2 with two foreclosure sales on the docket — one involving a property in Telluride, another in Mountain Village. Foreclosures up here don't happen in a vacuum. Some residents see them as a market correction that could open doors for locals who've been priced out. Others worry they signal deeper financial stress in the community — or that the properties will simply flip to the next highest bidder and nothing changes.\n\nWhat do foreclosures in this market actually mean to you?",
    choices: ["Sign of opportunity for locals", "Sign of deeper trouble", "Just routine legal process", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-31",
    title: "Wildfire rules are now town law — now what?",
    body: "Ordinance #1640 passed on August 11, 2026, writing the Colorado Wildfire Resiliency Code into Telluride's Land Use Code. Now council is circling back to it at a rescheduled budget session. Some residents will see this as overdue — up here, the fire risk is real and defensible space matters. Others may worry that new code requirements mean new costs and new hurdles for property owners already navigating a tough market. The ordinance is passed, but how it gets implemented is still an open conversation.\n\nSo: do you think folding wildfire resiliency rules into the Land Use Code is the right tool for the job?",
    choices: ["Yes — code it in", "Too much burden on owners", "Depends on enforcement", "It's complicated"],
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
  "telluride|2026-10-01|Town Council Budget - Oct 01 2026":
    "Council is expected to focus on budget discussions for the Town of Telluride. Members may also revisit matters related to Ordinance #1640, which amended the Land Use Code to implement the Colorado Wildfire Resiliency Code, following its passage on August 11, 2026.",

  "county|2026-10-01|Lodging Tax Panel Meeting":
    "The Lodging Tax Panel is expected to discuss matters related to the administration and allocation of lodging tax revenues in San Miguel County. No additional agenda details or directly relevant legal notices are available to indicate specific items beyond the panel's standard oversight responsibilities.",

  "telluride|2026-10-05|Open Space Commission - Oct 05 2026":
    "The Open Space Commission is expected to discuss matters related to open space acquisition, management, and planning priorities. The meeting may also address implications of Ordinance #1640, which amended Telluride's Land Use Code to implement the Colorado Wildfire Resiliency Code, passed by Town Council in August 2026.",

  "telluride|2026-10-06|Town Council - Oct 06 2026":
    "Council is expected to discuss matters related to the Colorado Wildfire Resiliency Code amendment to Telluride's Land Use Code (Ordinance #1640), which was previously passed in August 2026 to update Chapter 18 of the Municipal Code with new wildfire resiliency standards.",

  "telluride|2026-10-07|Ecology Commission - Oct 07 2026":
    "The Ecology Commission is expected to discuss human-wildlife interactions and related public safety concerns. The meeting may also address the recently passed Ordinance #1640, which amended Telluride's Land Use Code to implement the Colorado Wildfire Resiliency Code, reflecting the town's broader environmental and ecological priorities.",

  "telluride|2026-10-07|Commission for Community Assistance, Arts & Special Events - Oct 07 2026":
    "The Commission for Community Assistance, Arts & Special Events is expected to address funding allocations for community support and arts organizations, review special events applications, and discuss related town policy matters. The meeting may also touch on the recently adopted Colorado Wildfire Resiliency Code amendment to Telluride's Land Use Code.",

  "telluride|2026-10-07|Telluride Housing Authority Subcommittee - Oct 07 2026":
    "The Telluride Housing Authority Subcommittee is expected to meet on October 7, 2026, though a detailed agenda was not available. Members may address ongoing local housing matters. A related legal notice references Ordinance #1640, adopting the Colorado Wildfire Resiliency Code amendments to the Land Use Code.",

  "county|2026-10-07|Board of County Commissioners Meeting":
    "Board will consider procurement matters including material hauling, trail construction, fuel island canopy work, and jail painting projects. Several probate estate notices are also associated with the meeting, along with an energy regulatory hearing involving an alleged violation against American Helium Operating LLC.",

  "telluride|2026-10-08|Special Meeting - Planning & Zoning Commission - Oct 08 2026":
    "The Planning & Zoning Commission is expected to discuss the Colorado Wildfire Resiliency Code amendment to Telluride's Land Use Code (Ordinance #1640), passed by Town Council on August 11, 2026, which amended Chapter 18 of the Municipal Code to implement wildfire resiliency standards.",

  "county|2026-10-08|Planning Commission Meeting":
    "The Planning Commission is expected to review land use and development matters relevant to San Miguel County. Related notices suggest ongoing county procurement activity, including trail construction, facility improvements, and hazard mitigation planning, which may inform planning discussions.",

  "telluride|2026-10-13|Special Town Council Budget - Oct 13 2026":
    "Council is expected to focus on budget discussions for the Town of Telluride. Related matters include a previously passed wildfire resiliency land use code amendment and an upcoming paper billing fee from San Miguel Power Association, which may factor into financial planning considerations.",

  "telluride|2026-10-14|Liquor Licensing Authority - Oct 14 2026":
    "The Telluride Liquor Licensing Authority is expected to review liquor license applications or modifications requiring local approval. Both the Authority and the Colorado Department of Revenue must consent before any license is issued or amended. New licenses and appeals are handled separately by the Town Council.",

  "county|2026-10-14|Board of County Commissioners Work Session":
    "Board will consider matters including material hauling services, construction of a fuel island canopy, jail painting, a Lawson Hill Connector Trail project, and an update to the county's multi-jurisdictional all-hazard mitigation plan. Procurement opportunities across these areas suggest a focus on infrastructure maintenance and emergency planning.",

  "mv|2026-10-01|Design Review Board":
    "Board will consider final architecture review for a 15-unit employee apartment building at 306 Adams Ranch Road, continued from September. Members will also receive a voting procedure update and approve meeting summaries from August and September sessions.",

  "telluride|2026-10-01|Special Meeting - Planning & Zoning Commission - Oct 01 2026":
    "The Planning & Zoning Commission is expected to discuss the Colorado Wildfire Resiliency Code amendment to Telluride's Land Use Code, following Town Council's passage of Ordinance #1640 on August 11, 2026, which amended Chapter 18 of the Municipal Code to implement wildfire resiliency standards.",

  "telluride|2026-10-21|Historic & Architectural Review Commission Chair - Oct 21 2026":
    "The Historic & Architectural Review Commission is expected to convene its regular October 2026 meeting. Specific agenda items are not detailed in available materials, but the commission typically reviews applications related to historic preservation and architectural standards within the Town of Telluride.",

  "telluride|2026-10-21|Historic & Architectural Review Commission - Oct 21 2026":
    "The Historic and Architectural Review Commission is expected to review applications for Certificates of Appropriateness related to proposed construction, renovation, demolition, or alterations to structures within Telluride. The commission may also address matters related to historic designation and preservation standards under its regular oversight responsibilities.",

  "telluride|2026-10-21|Parks & Recreation Commission - Oct 21 2026":
    "The Telluride Parks & Recreation Commission is expected to meet on October 21, 2026, to address community recreation and parks needs. Specific agenda items have not been publicly detailed, but the Commission typically interprets community desires for parks services and guides related municipal planning decisions.",

  "county|2026-10-21|Board of County Commissioners Meeting":
    "Board will consider procurement matters including material hauling, trail construction, fuel island canopy, jail painting, and a multi-jurisdictional hazard mitigation plan update. Related legal notices include several probate estate creditor notices and a foreclosure sale in Telluride. An ECMC violation order against American Helium Operating LLC is also noted.",

  "telluride|2026-10-22|Planning & Zoning Commission - Oct 22 2026":
    "The Planning & Zoning Commission is expected to discuss matters related to the Colorado Wildfire Resiliency Code amendment recently adopted by Town Council, alongside potential Land Use Code updates. The commission may also address employee rental housing policy reviews and related development or zoning considerations affecting the Town of Telluride.",

  "telluride|2026-10-22|Planning & Zoning Commission Chair - Oct 22 2026":
    "The Planning & Zoning Commission Chair is expected to meet on October 22, 2026. While a detailed agenda was not available, recent related matters include implementation of the Colorado Wildfire Resiliency Code amendment to the Land Use Code, adopted by Town Council in August 2026.",

  "county|2026-10-22|Board of Adjustment Meeting":
    "The Board of Adjustment is expected to hear variance or land use appeals for San Miguel County. Related notices include procurement requests for trail construction, jail painting, a fuel island canopy, material hauling, and a multi-jurisdictional hazard mitigation plan update, suggesting county infrastructure and planning matters may be discussed.",

  "telluride|2026-10-14|Special Liquor Licensing Authority - Oct 14 2026":
    "The Telluride Liquor Licensing Authority will consider liquor license applications or modifications requiring local approval. Both the Authority and the Colorado Department of Revenue must consent before any license is issued or amended. New licenses and appeals are typically referred to the Town Council for final approval or denial.",

  "county|2026-10-26|Open Space Commission Meeting":
    "The Open Space Commission is expected to discuss open space matters for San Miguel County, potentially including the Lawson Hill Connector Trail Project, for which proposals are being sought. Other county procurement activities and unrelated legal notices appear in surrounding public records but are unlikely to fall under this commission's purview.",

  "telluride|2026-10-27|Town Council - Oct 27 2026":
    "Council is expected to meet for a regular session on October 27, 2026. Key related matters include a new $2.00 monthly paper billing fee from San Miguel Power Association and a request for proposals for consulting services to review Telluride's employee rental housing policies.",

  "county|2026-10-28|Board of County Commissioners Work Session":
    "Board is expected to discuss county procurement activity, including requests for proposals on a trail connector project, fuel island canopy construction, jail painting, and a multi-hazard mitigation plan update, as well as a materials hauling quote. Additional related legal and financial notices may be referenced during the session.",

  "county|2026-09-30|Board of County Commissioners Work Session":
    "Board will consider routine county business at a work session in Telluride. Key related matters include a subdivision exemption and lot line adjustment for Lawson Hill PUD, active procurement solicitations for trail construction and other county projects, and ongoing foreclosure and probate proceedings in San Miguel County.",

  "ouraycity|2026-09-30|Ouray City Council Work Session":
    "Council is expected to review capital improvement funding and departmental budgets during a daylong work session. Additional topics include Fourth of July entertainment planning, a free in-town shuttle program, OurWay transit service, and nine nonprofit funding requests totaling roughly $195,000."
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
    title: "2026 Chamber Meeting, November",
    source: "Norwood Colorado",
    sourceKey: "norwood",
    date: "November 10, 2026",
    newsTopic: "community",
    copy: "Monthly Chamber of Commerce meeting open to all.",
    href: "https://norwoodcolorado.com/event/2026-chamber-meeting-november/",
    img: ""
  },
  {
    title: "2026 Chamber Meeting, October",
    source: "Norwood Colorado",
    sourceKey: "norwood",
    date: "October 13, 2026",
    newsTopic: "community",
    copy: "Monthly Chamber of Commerce meeting open to all.",
    href: "https://norwoodcolorado.com/event/2026-chamber-meeting-october/",
    img: ""
  },
  {
    title: "Parish Bulletin for September 27",
    source: "St. Patrick's Catholic Church",
    sourceKey: "stpatricks",
    date: "September 25, 2026",
    newsTopic: "community",
    copy: "Attached is this week's parish bulletin. Please check our Parish Calendar for the updated schedule of events.1. Parish Mission Retreat (for those signed up) begins tonight at 6:15 pm and Saturday at 9:30 am. 2. Mission Appeal at this weekend...",
    href: "https://stpatrickstelluride.com/2026/parish-news/parish-bulletin-for-september-27/",
    img: ""
  },
  {
    title: "Popular trail needs new steward",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "September 24, 2026",
    newsTopic: "recreation",
    copy: "Chip Marlow, the man who spearheaded the construction of the Uncompahgre Riverway Trail from Ridgway to Ridgway State Park, has maintained the multiuse path largely by himself for many years. Now 80 years old, Marlow is ready to retire and hopes a younger group of volunteers can take over. “I’m worn",
    href: "https://www.ouraynews.com/2026/09/23/popular-trail-needs-new-steward/?ta_paidstory",
    img: ""
  },
  {
    title: "‘Super El Niño’ won’t be savior for West Slope",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "September 24, 2026",
    newsTopic: "community",
    copy: "GRAND JUNCTION — Amid a stream of bad news for Western Slope water stakeholders last week, Russ Schumacher had the pleasure of opening the sluice. Nearly on the far side of the state’s worst drought year in a generation, Coloradans have looked with hopeful eyes to the Pacific tropics for some form o",
    href: "https://www.ouraynews.com/2026/09/23/super-el-nino-wont-savior-west-slope/?ta_paidstory",
    img: ""
  },
  {
    title: "Judge to hotel: End workforce housing",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "September 24, 2026",
    newsTopic: "housing",
    copy: "A district court judge has ordered Ridgway s largest hotel to stop housing construction workers who are building a new Four Seasons in Mountain Village. In a preliminary injunction filed Sept. 16, the judge sided with the town of Ridgway, which filed suit against owners of the MTN Lodge in March. Th",
    href: "https://www.ouraynews.com/2026/09/23/judge-hotel-end-workforce-housing/?ta_paidstory",
    img: ""
  },
  {
    title: "Investigators close case on mine shaft death",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "September 24, 2026",
    newsTopic: "public-safety",
    copy: "Eleven months after rescue volunteers found Jennifer Nelson s body in a water- filled mine shaft on Red Mountain Pass, investigators are left wondering what her final moments looked like. Their case, which included an autopsy, DNA tests and a forensic analysis of her cellphone, determined Nelson acc",
    href: "https://www.ouraynews.com/2026/09/23/investigators-close-case-mine-shaft-death/?ta_paidstory",
    img: ""
  },
  {
    title: "City ready to cut losses with building",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "September 24, 2026",
    newsTopic: "public-safety",
    copy: "When the two-story building across the street from Ouray City Hall went up for sale last spring, Ouray city leaders scrambled to buy it, envisioning a top-tobottom renovation culminating in a new, larger police station and the potential added bonus of employee housing. The city moved so fast to secu",
    href: "https://www.ouraynews.com/2026/09/23/city-ready-cut-losses-building/?ta_paidstory",
    img: ""
  },
  {
    title: "Board recommends denial of Pleasant Valley subdivision for teacher housing donation",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "September 24, 2026",
    newsTopic: "government",
    copy: "An attempted act of generosity began to fall apart when the Ouray County Planning Commission recommended Ouray County commissioners deny a request to subdivide a parcel of land in Pleasant Valley that would be donated to the Ridgway School District for employee housing. Ridgway Superintendent Susan ",
    href: "https://www.ouraynews.com/2026/09/23/board-recommends-denial-pleasant-valley-subdivision-teacher-housing-donation/?ta_paidstory",
    img: ""
  },
  {
    title: "Ouray to evaluate cost of fixing bathhouse",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "September 24, 2026",
    newsTopic: "government",
    copy: "The city of Ouray will spend up to $85,000 to evaluate the condition of the Ouray Hot Springs Pool bathhouse and determine what it would cost to remodel the facility. A divided Ouray City Council informally agreed Monday to hire a contractor who will conduct a facility condition assessment. The firm",
    href: "https://www.ouraynews.com/2026/09/23/ouray-evaluate-cost-fixing-bathhouse/?ta_paidstory",
    img: ""
  },
  {
    title: "County widens search for more disaster aid",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "September 24, 2026",
    newsTopic: "public-safety",
    copy: "Ouray County officials must renew their search for additional disaster aid after the federal government dashed their hopes for another significant potential funding source this week. Despite previously approving assistance for the county to rebuild public property damaged by the Gold Mountain Fire, ",
    href: "https://www.ouraynews.com/2026/09/23/county-widens-search-disaster-aid/?ta_paidstory",
    img: ""
  },
  {
    title: "With inflated spending, commissioners break faith of voters, staff",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "September 24, 2026",
    newsTopic: "government",
    copy: "Dear Editor: It is not surprising that Ouray County finds itself in a financial bind because of profligate spending. The pandemic greatly increased visitation to Ouray County and sales tax revenue has doubled since then, along with a doubling of property tax revenue. County commissioners found a boa",
    href: "https://www.ouraynews.com/2026/09/23/inflated-spending-commissioners-break-faith-voters-staff/?ta_paidstory",
    img: ""
  },
  {
    title: "Areas beyond Blue Lakes deserving of protection",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "September 24, 2026",
    newsTopic: "infrastructure",
    copy: "Dear Editor: I would like to thank the previous contributors for sharing their thoughts regarding the use of off-road/off-highway vehicles (ORVs/OHVs) in the backcountry, specifically around Camp Bird Road and the alpine tundra beyond. Ouray County’s unique and beautiful natural resources are clearl",
    href: "https://www.ouraynews.com/2026/09/23/areas-beyond-blue-lakes-deserving-protection/?ta_paidstory",
    img: ""
  },
  {
    title: "Parish Bulletin for September 20",
    source: "St. Patrick's Catholic Church",
    sourceKey: "stpatricks",
    date: "September 20, 2026",
    newsTopic: "community",
    copy: "This week's bulletin is attached, but please check the Parish Calendar for the most updated information of parish events.For those who have signed up, a reminder that the St. Patrick Parish Mission begins this Friday, September 25.Sign up for a Bible S...",
    href: "https://stpatrickstelluride.com/2026/parish-news/parish-bulletin-for-september-20/",
    img: ""
  },
  {
    title: "Sheriff Rescinds Fire Restrictions",
    source: "Ouray County",
    sourceKey: "ouray-county",
    date: "September 16, 2026",
    newsTopic: "public-safety",
    copy: "Ouray County rescinds all fire restrictions for unincorporated areas",
    href: "https://ouraycountyco.gov/CivicAlerts.aspx?aid=963",
    img: "https://ouraycountyco.gov/ImageRepository/Document?documentID=22895"
  }
];  // 7 regional feeds (West End, Ouray, …)
const SMC_ALERTS = [
  {
    title: "Courthouse Office Closures Tuesday 9/29 - Friday 10/2",
    source: "San Miguel County",
    sourceLabel: "San Miguel County",
    category: "Alert",
    date: "2026-09-29",
    pubDate: "2026-09-29T22:41:23.000Z",
    copy: "The Clerk + Recorder closes Weds 9/30 at 1:30 p.m. and reopens Thurs at 7:30 a.m. They will be closed Friday. The Treasurer's Office has closed early and will remain closed Weds 9/30 - Friday 10/2. They reopen at 7:30 a.m. on Monday, 10/5.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=548",
    img: ""
  },
  {
    title: "DMV Services available in Egnar 11/18",
    source: "San Miguel County",
    sourceLabel: "San Miguel County",
    category: "Alert",
    date: "2026-09-29",
    pubDate: "2026-09-29T19:56:25.000Z",
    copy: "Attention, West Enders! The DMV will be coming to visit on Wednesday, November 18th, at the Firehouse in Egnar. No appointment necessary. Mark your calendars and save yourself a drive, we'll see you there! Questions? 970-728-3954.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=547",
    img: ""
  },
  {
    title: "Tomboy Road Now Open",
    source: "San Miguel County",
    sourceLabel: "San Miguel County",
    category: "Alert",
    date: "2026-09-18",
    pubDate: "2026-09-18T17:34:01.000Z",
    copy: "The Town of Telluride has completed their project that necessitated the closure of Lower Tomboy Road. The road is now open again.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=546",
    img: ""
  }
];              // SMC AlertCenter items
const ENGAGE_MEETINGS = [

];         // Engage Telluride project key dates
const MANUAL_SUMMARIES_CACHE_DATE = '2026-09-30';
const LEGAL_NOTICES_CACHE_DATE = '2026-09-27';

const MANUAL_SUMMARIES = {
  "med|2026-09-11|Board Work Session":
    "A single-item work session: a presentation from CommonSpirit Health on a potential partnership with the Telluride Hospital District. No packet or supporting materials are posted ahead of the session, so the scope and terms of what's being discussed aren't yet public -- worth watching given the board's ongoing Letter of Intent talks with CommonSpirit on the new facility project. No board action is scheduled; this is a discussion-only session, held in person and by Zoom.",

  "telluride|2026-09-01|Town Council - Sep 01 2026":
    "Three work sessions open the day: a deep look at Comprehensive Plan goals and objectives with project consultants, a Gondola Subcommittee update, and a review of proposals for a third-party audit of the Town's rental housing policies — that last one worth watching given how central rent policy has become to who can stay in the canyon. A second work session later covers AMI increases and rental rate adjustments for 2027 budgetary planning. On the action side: second reading of the 2026 budget reappropriation ordinance; a resolution permitting dogs on a limited stretch of the River Trail near the Public Works facility; approval of a wildfire mitigation project south of the Shandoka Apartments; and first readings authorizing the sale of three deed-restricted units — Spruce House Unit H and two FINO II units. Council will also consider finalizing a 30-minute free parking program. The long-running appeal of the Stender Residence HARC approval is continued again. Five board and commission seats are up for appointment.",

  "telluride|2026-09-02|Ecology Commission - Sep 02 2026":
    "The Ecology Commission takes up three substantive items at this work session. The headliner is a draft ordinance proposing a full phase-out of combustion-powered lawn and garden equipment within Town limits — leaf blowers banned by January 1, 2028, all other covered equipment by January 1, 2030. The draft ordinance cites air quality, noise, and greenhouse gas goals, and points to existing state and utility rebates that could offset roughly half the replacement cost. The Commission is working toward a formal recommendation to Town Council; no vote is taken tonight. Also on the table: initial discussion of the 2027 workplan and a progress review of the 2027 Climate Action Plan update, which serves as the policy backbone for the equipment ban and other upcoming proposals.",

  "telluride|2026-09-02|Commission for Community Assistance, Arts & Special Events - Sep 02 2026":
    "A working meeting for CCAASE, the Town's grant and events commission. The board continues its 2026 organization interview series — this round brings in Telluride Youth Lacrosse Association, Ah Haa School for the Arts, and the Telluride Council for the Arts and Humanities, each getting five minutes to present before questions. On the action side: a calendar and banner date request from Telluride Chamber Music for the Hanneke Cassel Trio at The Alibi on October 13; banner design approvals for Bear Safety Week and Ah Haa's Artabout; and a letter to Town Council formalizing the commission's 2027 grant budget request. That last item follows the board's August 5 vote — held flat at $696,750 total ($277,415 arts and special events, $419,335 community support) in recognition of the Town's decreased revenue projections.",

  "telluride|2026-09-02|Telluride Housing Authority Subcommittee - Sep 02 2026":
    "Three months of draft minutes — June, July, and August — come up for approval together, which is itself a small sign of how thinly stretched these oversight bodies can run. The substantive work: the Martin exception request returns after being continued from August 5. Lela and Jon Martin own a deed-restricted unit at Gold Run and need a new roof — bid at $47,743.86, or about 17% of their original purchase price. Their deed restriction caps staff-approvable capital improvements at 5% of OPP (~$13,960), and allows more only if the work 'increases the unit's capacity to house additional occupants' — a standard staff acknowledges the roof replacement doesn't meet, even while recommending approval. The subcommittee will work through that tension. A worksession on 'subpar bedroom' occupancy exceptions follows. Most consequentially, the group will set a date for a special meeting on housing waitlist policies and the recent suspension of the waitlist — that last item touches something a lot of people in this valley are watching closely.",

  "county|2026-09-02|Board of County Commissioners Meeting":
    "A short meeting with two substantive items. On the housing side, the BOCC — sitting as the San Miguel County Housing Authority — will ratify a policy change at Pinion Park that adjusts income eligibility to 80% AMI. That kind of threshold shift quietly determines who qualifies for a unit, which matters a great deal in a valley where the gap between market rate and what workers can actually pay keeps widening. On the administrative side, the board will consider appointing Commissioner Anne Brown as the county's voting representative for the Colorado Counties Inc. 2027 Legislative Agenda — a routine designation, but one that shapes how county priorities get carried to the Capitol. There's also a proclamation declaring September Suicide Prevention Month through Thrive Community Health Network.",

  "mv|2026-09-03|Design Review Board":
    "One item worth noting on this September 3rd Design Review Board agenda: a conditional-use permit review for a temporary tent and food truck at 332 Adams Ranch Rd (Lots OSP-35-B & OSP-35-C), which goes to the DRB for a recommendation to Town Council. There's also a general easement encroachment review at 140 Cortina Dr and an informational session on Pond Plaza with staff and Design Workshop. The 15-unit employee apartment building at 306 Adams Ranch Rd — the one item of broader housing consequence — is being continued to the October 1st meeting. The remainder of the agenda is single-family and detached condominium architecture reviews.",

  "norwood|2026-09-08|Norwood Water Commission Meeting":
    "The September 8, 2026 Norwood Water Commission Meeting agenda hasn't been posted yet.",

  "tmvoa|2026-09-08|Mountain Village Merchant Meeting":
    "The September 8, 2026 Mountain Village Merchant Meeting agenda hasn't been posted yet.",

  "norwood|2026-09-09|Board of Trustees Meeting":
    "The September 9, 2026 Norwood Board of Trustees Meeting agenda hasn't been posted yet.",

  "ridgway|2026-09-09|Ridgway Town Council Regular Meeting":
    "A heavy agenda for a small-town council — and some of it carries real weight. The Council will ratify two letters already sent: one backing a federal Major Disaster Declaration for the Gold Mountain Fire, which has burned nearly 40,000 acres northeast of Ouray, severed Highway 550 repeatedly, and left communities like Ridgway isolated and facing years of post-fire debris flows; and one supporting proposed recreation fees at Blue Lakes in the Mount Sneffels Wilderness to address overcrowding. On the policy side: interviews and appointment of Sustainability Advisory Board members; a Notice of Award for pre-approved ADU architectural design plans; authorization of more than $25,000 for sidewalk repairs near the Post Office and Clinton Street; a request from the Athletic Park Coalition to fund professional design services for a bike park; proposed changes to the Marshal's Office overtime policy; acceptance of the completed ductile iron pipe replacement project; direction on Wastewater Treatment Plant siting options; and consideration of scaling back from Stage 2 to Stage 1 fire restrictions and rescinding Stage 2 mandatory water restrictions.",

  "county|2026-09-09|Board of County Commissioners Work Session":
    "The September 9, 2026 Board of County Commissioners Work Session agenda hasn't been posted yet.",

  "telluride|2026-09-10|Town Council Budget - Sep 10 2026":
    "The September 10, 2026 Town Council Budget agenda hasn't been posted yet.",

  "county|2026-09-10|Planning Commission Meeting":
    "Three Land Use Code amendments are on the table for the Planning Commission's recommendation — covering forestry practices, oil and gas, and geothermal energy. All three are code-change items, meaning the Commission is being asked to weigh in before any revisions move forward to the BOCC. The agenda text doesn't detail the specific proposed changes within each amendment, but the pairing of oil & gas with geothermal in the same session signals the county is taking a broad look at how extraction and energy activities are regulated in unincorporated San Miguel County.",

  "smart|2026-09-10|SMART Board of Directors":
    "The September 10, 2026 SMART Board of Directors agenda hasn't been posted yet.",

  "telluride|2026-09-14|Open Space Commission - Sep 14 2026":
    "The Open Space Commission meets Monday to work through a busy stretch of site-walk debriefs and planning. First up: a debrief from the August 10th walk that covered a potential trail alignment connecting the Bear Creek Trailhead to Firecracker Hill, beaver activity in Zone 3 of the Bear Creek Preserve, and restoration planning in Zone 1. Then a debrief from the August 17th walk on sign sizes and placements — non-content — for the Telluride Valley Floor Open Space. The commission will also prepare for two September 21st site walks: Zone 1's restoration plan and the Reach 3/USFS River Restoration Project at the Mill Creek Confluence on the Valley Floor. Rounding it out: scheduling future site walks for the ST-1 Project and wetland connectivity, the Cornet to Jud Wiebe Trail/Mill Placer CE, and High Country areas.",

  "fire|2026-09-15|Board of Directors Meeting":
    "The September 15, 2026 fire Board of Directors Meeting agenda hasn't been posted yet.",

  "ophir|2026-09-15|General Assembly Meeting":
    "The September 15, 2026 Ophir General Assembly Meeting agenda hasn't been posted yet.",

  "rico|2026-09-16|Rico Board of Trustees Regular Meeting":
    "The September 16, 2026 Rico Board of Trustees Regular Meeting agenda hasn't been posted yet.",

  "telluride|2026-09-16|Historic & Architectural Review Commission Chair - Sep 16 2026":
    "The September 16 HARC agenda has one item: a certificate of appropriateness extension for a single-family property at 459 W. Dakota Ave. Nothing of broad public consequence is on it.",

  "telluride|2026-09-16|Historic & Architectural Review Commission - Sep 16 2026":
    "Two items stand out on this HARC agenda. First, a work session on a potential demolition and new construction application for Rebekah Hall itself — 113 W Columbia, the very building where HARC meets — a Town-owned property in the Residential/Commercial zone, with HOK as applicant. That's worth watching. Second, the Phoenix Market at 221 W Colorado Ave comes in for a Certificate of Appropriateness extension along with a vested property rights extension, which goes to Town Council as a recommendation. Beyond those, the board takes up a continued large-scale final development hearing for a new commercial building at 208 S Fir (5,000+ sq ft, Commercial zone), plus three continued single-family hillside matters. The Shandoka Lot Redevelopment — continued from August to October 21 — does not appear on this agenda.",

  "telluride|2026-09-16|Parks & Recreation Commission - Sep 16 2026":
    "The September 16, 2026 Parks & Recreation Commission agenda hasn't been posted yet.",

  "county|2026-09-16|Board of County Commissioners Meeting":
    "A full agenda for the September 16 BOCC. The commissioners continue their discussion of Constitutional Amendments 81 and 86 — touching immigration enforcement communication and congressional redistricting. A notable land-use matter: a Memorandum of Understanding with Telluride Mountain Village and the Ridge HOA regarding view plain restrictions from a 1999 settlement agreement. The board will review the 2025 county audit and take up a discussion about seed funding for a new Telluride Chamber of Commerce. Sitting as the Housing Authority, the board considers an exception request to the 'Employee' definition under the Land Use Code — the kind of eligibility question that keeps coming back as housing costs squeeze who qualifies. The Building Department holds a public hearing on continued adoption of the 2024 International Building Code and Colorado Low Energy and Carbon Code. The board also takes up a resolution update letting the Assessor settle smaller abatements, an intergovernmental agreement with Ouray County for veterans transportation, and a new driver position for that same program. Personnel matters — including an extended leave for the Juvenile Services Director and parental leave for the County Attorney — may go to executive session.",

  "mv|2026-09-17|Town Council Meeting":
    "A full agenda for Mountain Village this September, with several items worth tracking. The most consequential: first reading of an ordinance that would shift Mountain Village Housing Authority fees out of the municipal code and into an annually updated MVHA fee schedule — a structural change to how affordable housing costs get set and adjusted. Also on the legislative side, second reading and a public hearing on changes to the Public Art Commission's municipal code chapter, followed by a resolution adopting that commission's bylaws. The quasi-judicial portion involves a conditional use permit for a temporary food truck, seating, and tent at Lot OSP-35-C — modest in scope but going through the full CUP process. Council will also get a presentation on the draft 2027 budget and a pond improvements plan update covering conceptual designs and the entitlement path forward. Routine consent items include winter parking policies and rates, a Cortina Land condo association maintenance agreement, and the Telluride Foundation agency fund agreement.",

  "airport|2026-09-17|TRAA Board of Commissioners Meeting":
    "The September 17, 2026 TRAA Board of Commissioners Meeting agenda hasn't been posted yet.",

  "telluride|2026-09-17|Liquor Licensing Authority - Sep 17 2026":
    "A routine session for the Liquor Licensing Authority. The main action item is a permanent modification of premises for FA Whining Pig Bars (138 E. Colorado Ave., Unit 105) — the applicant is looking to retract its licensed footprint to match current operational needs, a housekeeping change under Colorado Liquor Code 44-3-301. Staff finds the application complete and recommends approval. On the public hearing side, the Elks Lodge (BPOE #692) is requesting five special event permits: three for Horror Fest at 472 W. Pacific Ave. across October 16–18, and two for Turkey Bingo 2026 on November 21–22. The authority will also approve minutes from the August 20 meeting, at which special event permits were granted for Blues & Brews, a Ken Burns evening at the Palm, and a KOTO street concert.",

  "norwood|2026-09-21|Planning and Zoning Commission Meeting":
    "The main event at this September 21st meeting is the first phase of Norwood's Land Use Code update. The commission will review draft code amendments under Phase I and take up a Series 2026 ordinance that would formally adopt those changes — the ordinance number itself hasn't been assigned yet in the posted agenda. Land Use Code rewrites don't happen often — when they do, they set the rules that govern development, density, and use for years to come. Consent agenda covers minutes from July. This is an active legislative moment for Norwood's planning framework.",

  "school|2026-09-22|Telluride Board of Education Work Session":
    "A work session, so no votes — just board conversation. The September 22 agenda covers CASB planning, a housing update for district staff, Telluride Education Foundation magnet grants, and the timeline for appointing a 2026 student Board of Education representative. The board will also walk through the schedule for staff and student lunches at each school and the KOTO access rotation for the coming year. Routine coordination, but the housing update is worth noting — staff housing has been a persistent pressure point for the district.",

  "school|2026-09-22|Telluride Board of Education Monthly Meeting":
    "The September 22 monthly meeting is where the board moves from discussion to decision on two items that were still open last month: resolutions supporting Proposition NN and Amendment 87 (Initiative 195), and second-reading approval of board policies EL-11 and JKA. EL-11 was updated after the senior prank incident at the end of last school year; JKA went through CASB legal review following the legislative session. The board will also hear the 2026 state assessment results from the DAC, get an MLO campaign update, and work through the routine consent agenda — personnel, August cash summary, and contract awards. A board self-assessment (GP-4E) is on at the end.",

  "telluride|2026-09-22|Telluride Housing Authority - Sep 22 2026":
    "Three substantive items at Rebekah Hall. First: a resolution to amend deed restrictions on two town-constructed units at 215 East Colorado Avenue — FINO 1A and 2A — converting them from affordable ownership units to Employee Dwelling Units and removing the maximum sale price, a structural change that rewrites how those units function in the housing stock. Second: a policy statement on §1002.3 AMI updates, with the board weighing whether to hold 2027 rental rates flat or allow only a partial increase — a direct response to the affordability squeeze that has defined local housing politics for years. Third: a review of waitlist policies under §105 of the Employee Rental Housing Policies, which governs who gets access and in what order. Consent calendar includes July meeting minutes and ratification of Resident Advisory Committee members.",

  "telluride|2026-09-22|Town Council - Sep 22 2026":
    "The most consequential action is a deed-restriction amendment for two units at 215 East Colorado Avenue (FINO II Units 1A and 2A) that would convert them from designated affordable units with a maximum sale price to employee dwelling units — effectively removing the price cap. That conversion question sets the table for three public hearings on second reading: the sale of Spruce House Unit H at 226 East Pacific Avenue, and both FINO II units 1A and 2A. All three sales move toward final approval if Council votes yes. On the code side, first reading of an ordinance amending the Ethics Guidelines (Municipal Code Chapter 2, Article 4, Section 2-4-30) is on the afternoon agenda. The Telluride Housing Authority holds its own session concurrently. Council will also introduce four new staff members across Finance and Human Resources.",

  "county|2026-09-23|Board of County Commissioners Work Session":
    "The September 23, 2026 Board of County Commissioners Work Session agenda hasn't been posted yet.",

  "med|2026-09-24|Regular Board Meeting":
    "The September 24, 2026 MED Regular Board Meeting agenda hasn't been posted yet.",

  "telluride|2026-09-24|Planning & Zoning Commission - Sep 24 2026":
    "Two work sessions anchor the September 24 P&Z meeting. First up: a proposed employee housing project at the northwest corner of Telluride Middle-High School (725 W Colorado), brought by the Telluride School District R1 under an Intergovernmental Agreement with the Town — this is still early-stage, a work session rather than a formal application. Second: continued discussion of potential amendments to Land Use Code sections covering landscaping requirements (LUC 3-502) and tree maintenance, removal, and relocation (LUC 3-505). The Shandoka Lot Redevelopment preliminary PUD — a proposal to increase dimensional limits and provide public benefits on Town-owned land at 860 Black Bear Rd — was scheduled for a public hearing but has been continued without discussion to the October 22 meeting due to staff capacity.",

  "telluride|2026-09-24|Planning & Zoning Commission Chair - Sep 24 2026":
    "The September 24, 2026 Planning & Zoning Commission Chair agenda hasn't been posted yet.",

  "telluride|2026-09-10|(Rescheduled to Oct 13th) Town Council Budget - Sep 10 2026":
    "This September 10 budget session has been rescheduled to October 13th. No agenda has been posted yet.",

  "telluride|2026-09-23|Vending Subcommittee - Sep 23 2026":
    "The Vending Subcommittee meets September 23 to handle two items: appointing a new chairperson and selecting vendors for the 2026-2027 winter season at Gondola Plaza. One application is on the table — PhilAm, LLC dba Mini Deli, a returning vendor with eleven consecutive seasons at Gondola Plaza East, applying again for breakfast and lunch service. Staff recommends granting the permit. Gondola Plaza West has no applicant on record. The subcommittee will also approve draft minutes from April 2.",

  "county|2026-09-15|Housing Code Update SSR":
    "The Stakeholder Strategic Roundtable (SSR) working group convenes for its eighth session on the San Miguel County Housing Code Update — a Proposition 123-funded effort to strip out Land Use Code provisions that slow workforce and affordable housing production in unincorporated areas of the county. The two-hour working session zeroes in on the proposed Community Housing Zone, refining draft code recommendations that will eventually go to the BOCC and Planning Commission as formal redlines. Earlier sessions produced a handful of majority-consensus positions: allowing multiple ADUs on larger lots when the bonus unit is deed-restricted for workforce housing; reducing side setbacks to 10 feet in Medium and High Density zones; and preserving by-right density at 1 DU/35 acres while routing additional density exclusively through a workforce housing bonus track — with free-market development required to go through PUD. A range of other ideas, including RV/camper housing, parking reductions, and a TDR program, were set aside for now.",

  "ouray|2026-09-02|PM - Note: Virtual/Zoom meeting only!  The Planning Commission will conduct a work session to review and discuss possible changes to the Ouray County Land Use Code, Section 2 – Definitions. (packet materials are attached to the agenda)":
    "Ouray County's Planning Commission meets virtually on September 2 for a work session on possible changes to the Land Use Code, Section 2 — Definitions. Work sessions like this one are where the real shaping happens, before anything goes to a public hearing. The specific definition changes under discussion aren't detailed in the posted notice, but packet materials are attached to the agenda for anyone who wants to dig in ahead of the meeting.",

  "county|2026-09-28|Open Space Commission Meeting":
    "The September 28, 2026 Open Space Commission Meeting agenda hasn't been posted yet.",

  "telluride|2026-09-30|Special Meeting - Historic & Architectural Review Commission - Sep 30 2026":
    "HARC holds a special meeting dedicated entirely to the Carhenge Redevelopment Project — the proposed new construction at 700 W Pacific Ave that has been working its way through review since at least July. Three separate Preliminary Large-Scale applications are on the table, each covering a different building cluster: Buildings A, B, and C; Buildings D1 and D2; and Buildings E1, E2, and E3. All are new construction outside the Telluride Historic Landmark District but exceed 5,000 square feet of floor area, triggering large-scale review under LUC 7-203.B.2.a.1. The property is Town-owned, zoned Accommodations 2, and Design Workshop is the applicant. Both the July and August HARC meetings passed without substantive discussion on these items — this special session signals that the review is finally moving forward in earnest.",

  "telluride|2026-09-17|Special Meeting - Planning & Zoning Commission - Sep 17 2026":
    "A special P&Z work session covering two tracks. First, the ongoing Comprehensive Plan update — consultants and staff will walk through the Existing Conditions StoryMap, review where Phase 2 community engagement stands, and present Survey #2. The Comp Plan process sets the long-range framework for land use, density, and character across town, so these check-ins matter. Second, the commission continues its discussion of potential Land Use Code amendments to LUC 3-502 (landscaping requirements) and LUC 3-505 (maintenance, removal, or relocation of trees) — code language that quietly shapes how development projects are reviewed and conditioned. No votes are expected; this is a working session.",

  "telluride|2026-09-30|Special Town Council - Sep 30 2026":
    "This special session is entirely devoted to one thing: a Town Council appeal hearing on the Carhenge lot subdivision. On July 23, 2026, P&Z unanimously approved consolidating Lots 34 and 34B at 700 W. Pacific Avenue into a single parcel — a preliminary step the Town needs before any redevelopment can move forward on that open-space site. Within two weeks, Sphere Law Firm filed an appeal on behalf of two neighboring property owners and the Chair 7 Community Coalition, which represents nearly 200 Backman Village area residents. The appellants raise several distinct legal challenges: that P&Z adopted staff findings wholesale without addressing contested issues (including recorded Backman Village covenants and owner-consent questions); that the approval's conditions contradict the very findings that supported it; and that P&Z waived seventeen of twenty-three subdivision design criteria by labeling them 'inapplicable' — a move the appellants argue the Land Use Code only permits through a PUD variation, which no longer exists here because the conceptual PUD application was withdrawn before the July 23 hearing. Town Council now sits as the appellate body, confined to the record compiled below.",

  "mv|2026-10-01|Design Review Board":
    "Two multi-family projects are the main event at this October 1 DRB meeting. First up is a continued final architecture review for 15 employee apartments at 306 Adams Ranch Rd (Lot 640A) — workforce housing that's been working its way through the process since at least September. Next is a fresh final architecture review for four new multifamily units at 100 Pennington Pl. The board also takes up a conditional use permit renewal for the Wok of Joy food trailer at Conference Center Plaza, and considers a general easement encroachment at 113 Palmyra Dr. Two single-family homes are on the agenda but headed for continuance — one to December, one to February. Administrative items include a voting procedure update, approval of meeting minutes from August and September, a lighting update, and adoption of the 2027 DRB meeting schedule.",

  "telluride|2026-10-01|Town Council Budget - Oct 01 2026":
    "A three-hour work session dedicated entirely to the 2027 budget — specifically the General Fund, revenue projections, fee structures, and Capital Fund. No votes are scheduled; this is the kind of session where the contours of next year's spending get sketched out before the formal adoption process begins. Anyone watching the town's fiscal trajectory — a budget that has grown dramatically over the past decade — will want to pay attention to where the numbers are heading.",

  "county|2026-10-01|Lodging Tax Panel Meeting":
    "A routine administrative session for the San Miguel County Lodging Tax Board — minutes from June 18 up for approval, and a review of lodging tax reports if they're available. No substantive funding decisions or grant awards are on the agenda.",

  "county|2026-09-09|Board of County Commissioners Special Meeting":
    "A short special meeting with two items worth watching. On the housing side, the BOCC — sitting as the San Miguel County Housing Authority — will consider Resolution 2026-34, which would authorize a change in Area Median Income limitations for certain deed-restricted properties in Pinion Park. That's a technical adjustment, but AMI thresholds are the fulcrum on which affordability restrictions actually turn. There's also an initial discussion on Covenant Amendment Provisions — early-stage, but covenant language is where deed restrictions either hold or erode over time. Separately, the Board will discuss Colorado State Ballot Measures and take up a procedural question about CCI Legislative Committee representation. Consent agenda covers the July Road Report and a subrecipient certification.",

  "ouray|2026-09-16|, 1-4:00 PM (@ OURAY COURTHOUSE!) - The PC will hold 2 public hearings; Curry Regular PUD, and an Exemption application from Clifford Pastor to subdivide his parcel into 2 lots. (Packet materials are under media TV icon)":
    "Ouray County's Planning Commission meets at the Ouray Courthouse for two public hearings. First up is the Curry Regular PUD — a formal planned unit development application that will get a full public hearing. Second is an exemption application from Clifford Pastor to subdivide his parcel into two lots. Both items require public hearings before the PC can make a recommendation, and packet materials are available through the county's agenda portal.",

  "norwood|2026-09-08|NWC Rescheduled to 09/22/2026":
    "The September 8th Norwood Water Commission meeting has been rescheduled to Tuesday, September 22, 2026, at 6:30 p.m. at Norwood Town Hall.",

  "telluride|2026-10-05|Open Space Commission - Oct 05 2026":
    "The October 5, 2026 Open Space Commission agenda hasn't been posted yet.",

  "telluride|2026-10-06|Town Council - Oct 06 2026":
    "The morning work session takes up automated license plate reader cameras — the Flock Safety system — with Chief Marshal Josh Comte presenting. That's a conversation worth watching; ALPR technology tends to generate real debate about privacy and public safety wherever it lands. On the formal agenda, Council holds a public hearing on extending the vesting period for property rights at 221 W Colorado, a project whose Certificate of Appropriateness expires October 18. Second reading of an ethics code amendment (Municipal Code Chapter 2, Article 4) is also up for a vote. Board appointments fill seats on both the Planning and Zoning Commission and HARC. The afternoon closes with the Town Attorney evaluation in executive session.",

  "mv|2026-10-07|Town Council Meeting":
    "The October 7, 2026 Mountain Village Town Council Meeting agenda hasn't been posted yet.",

  "telluride|2026-10-07|Ecology Commission - Oct 07 2026":
    "The October 7, 2026 Ecology Commission agenda hasn't been posted yet.",

  "telluride|2026-10-07|Commission for Community Assistance, Arts & Special Events - Oct 07 2026":
    "The October 7, 2026 Commission for Community Assistance, Arts & Special Events agenda hasn't been posted yet.",

  "telluride|2026-10-07|Telluride Housing Authority Subcommittee - Oct 07 2026":
    "The October 7, 2026 Telluride Housing Authority Subcommittee agenda hasn't been posted yet.",

  "county|2026-10-07|Board of County Commissioners Meeting":
    "The October 7, 2026 Board of County Commissioners meeting agenda hasn't been posted yet.",

  "telluride|2026-10-08|Special Meeting - Planning & Zoning Commission - Oct 08 2026":
    "The October 8, 2026 Special Meeting - Planning & Zoning Commission agenda hasn't been posted yet.",

  "county|2026-10-08|Planning Commission Meeting":
    "The San Miguel County Planning Commission meets October 8 for a session that spans most of the day. The morning opens with a joint work session with the BOCC on an Affordable Housing Code Update — a signal that the county is still actively trying to write policy fast enough to keep pace with a housing situation that hasn't gotten easier. After lunch, the commission takes up a Land Use Code amendment covering Subdivisions and Condominium Plats, which would change the rules governing how land gets divided and how ownership gets structured across unincorporated county. Both items sit at the code-change tier — the kind of amendments that quietly shape what gets built, where, and for whom, long after the meeting is over.",

  "telluride|2026-09-10|San Miguel Authority for Regional Transportation - Sep 10 2026":
    "SMART's board meets virtually on September 10th with a full slate of financial and operational business. The board will act on the FY25 audit report and accept those financials — a routine but consequential step in closing out a fiscal year. More forward-looking: the board votes on hiring PFM Asset Management as SMART's investment advisor and entering the CSIP investment pool, which determines how the authority manages what is now a significant revenue stream. FY27 budget development goes to discussion, an early but important moment given the scale of spending the gondola program has put in motion. The gondola project itself gets a verbal update — the one item everyone in the valley is watching. September operations round out the agenda, along with an executive session on personnel matters.",

  "county|2026-09-24|5 x 5 County Meeting - San Miguel County Hosts":
    "This is an informal gathering — no votes, no decisions. San Miguel County is hosting commissioners from Archuleta, Montezuma, Dolores, and La Plata counties for a 5x5 regional discussion at the Wilkinson Public Library. The substantive item is a conversation with the Southern Ute Indian Council about a gas enterprise pipeline spill — the kind of cross-jurisdictional environmental matter that rarely surfaces in a single county's regular agenda. Each county will also share updates, and federal and state representatives are expected to weigh in.",

  "tmvoa|2026-09-29|TMVOA Board of Directors Meeting":
    "The September 29, 2026 TMVOA Board of Directors Meeting agenda hasn't been posted yet.",

  "telluride|2026-09-24|Resident Advisory Committee - Sep 24 2026":
    "The Resident Advisory Committee meets Thursday, September 24 at noon in the Green Room. The working session covers three items worth watching: a tenant survey discussion, a look at unit vacancies, and a policies informational session — all squarely in the territory of how the Town manages its deed-restricted and municipal housing stock. The committee will also review RAC action items and responsibilities. Rounding out the agenda: updates from Town staff and committee members, public comment, and setting the next meeting date.",

  "telluride|2026-09-16|CANCELED - Parks & Recreation Commission - Sep 16 2026":
    "The September 16, 2026 Parks & Recreation Commission meeting is canceled.",

  "telluride|2026-09-14|Telluride Housing Authority Subcommittee Special Meeting - Sep 14 2026":
    "The Telluride Housing Authority Subcommittee meets in worksession on two policy questions that get at a recurring tension: the gap between rules written for ideal conditions and the messier reality on the ground. First up is how to handle 'subpar bedrooms' in mitigation units — rooms that don't meet current Guidelines or building code standards, including several Element 52 units with no windows at all. Owners of these units are seeking exceptions to occupancy requirements, and the Subcommittee will consider whether the existing administrative exception process is sufficient or whether a blanket preemptive exception makes more sense. Second, the Subcommittee will revisit the housing waitlist suspension that's been in place since April 2026. The original Placement Waitlist had over 280 people, but response rates to apartment offers ran as low as 1–15%, vacant units were piling up, and the list has since been purged to 164 households. The question is whether the suspension should continue, and what a functional waitlist policy actually looks like — ahead of a full policy review planned for early 2027. No formal votes can be taken; both items are worksessions.",

  "smart|2026-10-08|SMART Board of Directors":
    "The October 8, 2026 SMART Board of Directors agenda hasn't been posted yet.",

  "norwood|2026-10-13|Norwood Water Commission Meeting":
    "The October 13 Norwood Water Commission Meeting agenda hasn't been posted yet.",

  "tmvoa|2026-10-13|Mountain Village Merchant Meeting":
    "The October 13 Mountain Village Merchant Meeting agenda hasn't been posted yet.",

  "telluride|2026-10-13|Special Town Council Budget - Oct 13 2026":
    "The October 13, 2026 Special Town Council Budget agenda hasn't been posted yet.",

  "norwood|2026-10-14|Board of Trustees Meeting":
    "The October 14, 2026 Norwood Board of Trustees Meeting agenda hasn't been posted yet.",

  "ridgway|2026-10-14|Ridgway Town Council Regular Meeting":
    "The October 14, 2026 Ridgway Town Council Regular Meeting agenda hasn't been posted yet.",

  "telluride|2026-10-14|Liquor Licensing Authority - Oct 14 2026":
    "The October 14, 2026 Liquor Licensing Authority agenda hasn't been posted yet.",

  "county|2026-10-14|Board of County Commissioners Work Session":
    "The Board of County Commissioners is holding a work session in Egnar — the far western end of San Miguel County, a long way from the box canyon in every sense. The posted agenda doesn't list specific items beyond the location itself, so there's no detail yet on what's being discussed. Worth watching for an agenda update if you track county business from the western slope side of things.",

  "mv|2026-10-15|Town Council Meeting":
    "The October 15, 2026 Mountain Village Town Council Meeting agenda hasn't been posted yet.",

  "airport|2026-10-15|TRAA Board of Commissioners Meeting":
    "The October 15, 2026 TRAA Board of Commissioners Meeting agenda hasn't been posted yet.",

  "med|2026-09-17|Regular Board Meeting":
    "A short special meeting — just an hour — with one real item on the table: the interim leadership of Telluride Regional Medical Center. The board will go into executive session under the personnel exemption, then come back out to take public action on who's running the hospital in the near term. That's the whole meeting. Public comment is open at the top, via Zoom.",

  "county|2026-09-23|Board of County Commissioners Special Meeting":
    "A full day of business for the BOCC. The most consequential item is the continued public hearing on adopting the 2024 International Codes (I-Codes) and Colorado's Model Low Energy and Carbon Code — building standards that will shape what gets built here and how. The commissioners will also take up 2027 nonprofit funding allocations, with a final proposal coming October 7. A shared-funding discussion for an intercept/bike path connector trail with Lawson Hill Property Owners is on the table, with a motion expected. The county's housing specialist delivers an update on community housing projects. The afternoon includes a follow-up on a personnel policy conflict mitigation plan for the Treasurer's Office — a thread carried over from September 19. CDOT's annual review of county roads opens the morning.",

  "county|2026-09-30|Board of County Commissioners Work Session":
    "This work session—where commissioners can discuss but not take formal action—centers on one consequential item: a proposed Employee Housing Impact Fee for San Miguel County. That's worth watching closely. The afternoon fills out with a Recreation Ranger District update from the Forest Service, a review of 13 legislative proposals Colorado Counties, Inc. is weighing for the 2027 state session, and a continued discussion on Community Support Funding for four local organizations: the Telluride Historical Museum, the Telluride Environmental Science and Engineering Laboratory (TESEL), the Telluride Institute, and the Telluride Junior Nordic Ski Program.",

  "telluride|2026-09-17|Open Space Commission Site Walk - Sep 17 2026":
    "The Open Space Commission heads out on foot Thursday at 4:00 PM, meeting at the Town Park vehicle bridge on East Colorado Avenue. The sole work item is a site walk through Zone 1 of Bear Creek Preserve to review the Blues & Brews Festival camping area. No votes are scheduled — this is a ground-level look before any formal action.",

  "norwood|2026-09-22|Norwood Water Commission Meeting":
    "The Norwood Water Commission meets September 22 with a full plate of water-related business. Six leak forgiveness requests are on the table — a recurring item for any small-system water utility, where a neighbor's faulty line can mean a bill that doesn't reflect actual use. The Commission will also take up a possible leak check fee, which would formalize how the system handles these situations going forward. The evening's weightiest technical item is the Final Draft of the Raw Water Delivery and Storage Alternatives Analysis Report from SGM — a planning document that shapes how Norwood thinks about its long-term water supply. The Commission will also go into executive session on the Cossey Code of Conduct Complaint for legal advice. Consent items include August financials, meeting minutes, and a budget-to-actuals review.",

  "telluride|2026-09-21|Gondola Subcommittee - Sep 21 2026":
    "The Gondola Advisory Committee meets virtually on September 21 at 3:00 PM. The bulk of the session — 45 minutes — goes to a comparison of the CIG (Capital Investment Grant) approach versus a locally-led project evaluation, presented by Ed Parks and Pete Williams. That's the live question underneath this whole effort: who drives the gondola project and how it gets funded. Amber Blake will give a SMART updates briefing, and Miles Graham will preview what's coming to the September Leadership Committee. The August 17 meeting summary is up for approval. Public comment is open.",

  "norwood|2026-10-19|Planning and Zoning Commission Meeting":
    "The October 19, 2026 Norwood Planning and Zoning Commission Meeting agenda hasn't been posted yet.",

  "telluride|2026-09-21|Open Space Commission Site Walk - Sep 21 2026":
    "The Open Space Commission heads into the field for this one — no chambers, no screen-share. The group meets at the Bear Creek Preserve Zone 1 entrance (south of Imagination Station Playground, Town Park) at 4:00 PM to work through restoration planning for that zone with consultants Matt Tobler of Blue Mountain Environmental Consulting and David Blauch of Ecological Resource Consultants. At 4:15 PM the walk shifts to the Eider Creek Trailhead on West Highway 145 Spur for a review of the Reach 3 River Restoration Project at the Mill Creek Confluence on the Valley Floor Open Space — again with Blauch. Both items are worksession-level; no votes are expected.",

  "fire|2026-10-20|Board of Directors Meeting":
    "The October 20, 2026 fire Board of Directors Meeting agenda hasn't been posted yet.",

  "school|2026-10-20|Telluride Board of Education Monthly Meeting":
    "The October 20, 2026 Telluride Board of Education Monthly Meeting agenda hasn't been posted yet.",

  "ophir|2026-10-20|General Assembly Meeting":
    "The October 20, 2026 Ophir General Assembly Meeting agenda hasn't been posted yet.",

  "telluride|2026-10-01|Special Meeting - Planning & Zoning Commission - Oct 01 2026":
    "A single work session fills this special meeting: the consulting team behind Telluride's Comprehensive Plan update will sit down with P&Z to gather commissioner input and share where things stand — capping off a week of community engagement sessions. No land-use applications or votes are on the table. This is the deliberative middle stage of a process that will eventually reshape how the town guides growth, density, and land use for years ahead.",

  "rico|2026-10-21|Rico Board of Trustees Regular Meeting":
    "The October 21, 2026 Rico Board of Trustees Regular Meeting agenda hasn't been posted yet.",

  "telluride|2026-10-21|Historic & Architectural Review Commission Chair - Oct 21 2026":
    "The October 21, 2026 HARC Chair agenda hasn't been posted yet.",

  "telluride|2026-10-21|Historic & Architectural Review Commission - Oct 21 2026":
    "The October 21, 2026 HARC agenda hasn't been posted yet.",

  "telluride|2026-10-21|Parks & Recreation Commission - Oct 21 2026":
    "The October 21, 2026 Parks & Recreation Commission agenda hasn't been posted yet.",

  "county|2026-10-21|Board of County Commissioners Meeting":
    "The October 21, 2026 Board of County Commissioners meeting agenda hasn't been posted yet.",

  "med|2026-10-22|Regular Board Meeting":
    "The October 22, 2026 Mountain Village Metropolitan District Regular Board Meeting agenda hasn't been posted yet.",

  "tmvoa|2026-10-22|TMVOA Board of Directors Meeting":
    "The October 22, 2026 TMVOA Board of Directors Meeting agenda hasn't been posted yet.",

  "telluride|2026-10-22|Planning & Zoning Commission - Oct 22 2026":
    "The October 22, 2026 Planning & Zoning Commission agenda hasn't been posted yet.",

  "telluride|2026-10-22|Planning & Zoning Commission Chair - Oct 22 2026":
    "The October 22, 2026 Planning & Zoning Commission Chair agenda hasn't been posted yet.",

  "county|2026-10-22|Board of Adjustment Meeting":
    "The agenda for the October 22 Board of Adjustment meeting hasn't been posted yet.",

  "school|2026-10-19|Telluride Board of Education Work Session":
    "The October 19, 2026 Telluride Board of Education Work Session agenda hasn't been posted yet.",

  "telluride|2026-09-28|Gondola Leadership Committee - Sep 28 2026":
    "The Gondola Leadership Committee meets September 28 at 3:00 PM — hybrid, with in-person at Ah Haa School's Launchpad Room. The centerpiece is a 60-minute action item: a comparative evaluation of federally funded versus locally-led project delivery. That choice — federal dollars with federal strings versus local control with local financing — is one of the more consequential forks the gondola effort has faced. The committee will also hear SMART program updates and a recap of the July Leadership Committee meeting, then take up a communications plan before closing with partner jurisdiction updates and public comment.",

  "telluride|2026-10-14|Special Liquor Licensing Authority - Oct 14 2026":
    "The October 14, 2026 Special Liquor Licensing Authority agenda hasn't been posted yet.",

  "mv|2026-09-25|Town Council Meeting":
    "A special Friday session — just one item: an executive session to discuss selecting and setting employment terms for a new Town Manager. The personnel discussion is closed to the public under Colorado's open meetings law, which permits closed sessions for this kind of hiring negotiation. Council convenes at 8:00 AM and adjourns at 3:00 PM, suggesting a lengthy deliberation behind closed doors.",

  "county|2026-09-28|Open Space Commission":
    "A working session for the San Miguel County Open Space Commission. The main business: an org chart presentation from County Administrator Mike Bordogna, a budget update, follow-up on joint focus areas, and a hard conversation about what to cut from the 2026 work plan ahead of the November 9 budget deadline. The commission will also pick a date for a meet-and-greet with the BOCC, commission members, staff, and the incoming Parks & Open Space Manager and Parks Supervisor.",

  "telluride|2026-09-28|Open Space Commission Site Walk - Sep 28 2026":
    "The Open Space Commission is trading the meeting room for the mountain on September 28th — a site walk up Tomboy Road, meeting first at Rebekah Hall on West Columbia before heading out. No formal votes or approvals are on the agenda; this is a worksession in the field, giving commissioners a ground-level look at the high country terrain along that corridor.",

  "county|2026-10-26|Open Space Commission Meeting":
    "The October 26 Open Space Commission agenda hasn't been posted yet.",

  "telluride|2026-10-27|Town Council - Oct 27 2026":
    "The October 27, 2026 Town Council agenda hasn't been posted yet.",

  "county|2026-10-28|Board of County Commissioners Work Session":
    "The October 28 BOCC Work Session in Placerville has been posted, but no agenda detail beyond the meeting name and location has been provided. There's no way to know what's on the table until the full agenda drops.",

  "ouraycity|2026-09-30|Ouray City Council Work Session":
    "A full-day budget work session for the Ouray City Council — the kind of meeting where the year's priorities actually get set, even if the formal votes come later. The morning runs through the Capital Improvement Fund and a fund-by-fund budget review. The afternoon shifts to operations and community: Fourth of July entertainment funding, the free in-town shuttle, and OurWay/All-Points Transit. Then comes the non-profit funding round, with nine organizations on the list — Home Trust leading at $45,000, Ouray Library at $100,000, Mountain Air Music and Voyager each at $10,000, OCSAP at $5,000, Mountain Rescue at $10,000, and smaller asks from EcoAction Partners, ROCC, and UWP.",

  "ouray|2026-09-29|Board of County Commissioners Special Work Session":
    "The Ouray County BOCC spends the full day on 2027 budget work sessions — no formal votes, but this is where the shape of next year's spending gets sketched out. Morning departments include the Assessor, Land Use, Clerk and Recorder, Treasurer, and IT/GIS. After lunch, the focus shifts to EMS, Road and Bridge, Public Health, and Human Services, closing with a recap discussion between the commissioners, the County Manager, and the Finance Director on preliminary budget preparation and next steps. Work sessions like this are where direction gets given before the numbers harden into formal proposals."
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
    sourceKey: "mv",
    sourceLabel: "Mountain Village",
    date: "2026-09-25",
    title: "Mountain Village Town Council — Sep 25, 2026",
    recap: "A brief special meeting convened solely to move into executive session for two purposes: discussing town manager finalists (a personnel matter not involving current employees) and instructing negotiators on a potential town manager contract. The public meeting immediately adjourned after that vote.",
    votes: [],
    videoUrl: "https://media.avcaptureall.cloud/meeting/f0518ee8-8370-4a16-9138-d66835eaf7cd"
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
    date: "2026-09-23",
    title: "San Miguel County BOCC — Sep 23, 2026",
    recap: "Commissioners voted to direct staff to budget $700,000 as the county's share of the Lawson Hill intercept lot bike-path connector trail, contingent on the Lawson Hill POA board matching roughly $700,000. The project's low bid came in near $2 million — about double the original estimate — but the CDOT grant funding ($740,000) requires ADA-compliant design, making a cheaper rustic alternative essentially cost the same without the grant.\n\nThe board adopted the 2024 International Codes and Colorado Model Low Energy and Carbon Code (LEC) by resolution, with planning-commission amendments but setting the \"large home\" threshold at 4,000 square feet rather than the planning commission's 3,600 or the state's 5,000.\n\nA letter of support for Rural Homes in assisting Mountain Village with a CDOLA Local Land Planning Capacity Grant was approved unanimously.\n\nThe board reviewed 2027 nonprofit funding requests totaling roughly $296,000 and provisionally allocated approximately $241,000, with three organizations (Telluride Historical Museum, Telluride Institute science lab, Telluride Junior Nordic) held for further discussion. A $15,000 contingency reserve replaced the prior $20,000 buffer.",
    votes: [{"item":"Budget $700K for Lawson Hill bike-path connector","outcome":"Passed","tally":"3-0"}, {"item":"Adopt 2024 I-Codes and LEC (large home = 4,000 sq ft)","outcome":"Passed","tally":"3-0"}, {"item":"Letter of support for Rural Homes/Mountain Village CDOLA grant","outcome":"Passed","tally":"3-0"}],
    videoUrl: "https://www.youtube.com/watch?v=ewp7KVhoj-s"
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
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-09-19",
    title: "HARC — Sep 19, 2026",
    recap: "HARC held a work session on a proposed new municipal building at 113 West Columbia (Rebecca Hall), where the town is seeking to demolish the existing structure and replace it with a new Marshals Department facility. Commissioners offered extensive feedback: concerns included the three-story south facade at pedestrian scale, the building projecting beyond the adjacent historic Miners Union Hospital, excessive brick competing with that landmark, shallow shed-roof slopes, dormer size, garage-door visibility, and insufficient setback from the Miners Union. No vote was taken; the work session is a preliminary step before a formal application.\n\nHARC approved a three-year extension of Certificate of Appropriateness #10263 for the Phoenix Market project at 221 West Colorado, and the HARC chair recommended that Town Council grant a matching extension of the associated vested property rights, citing high construction costs, interest rates, and contractor availability.\n\nHARC approved a small-scale CA amendment for a residence at 845 Primrose Lane, with conditions including more stone on the east elevation at the garage level and reduced transom glazing on the east facade at the second level.\n\nHARC approved a final large-scale new-construction application at 208 South Fur with eight conditions, including reverting to the original arborist-report language for a mature spruce on the neighboring property, adjusting facade references in two conditions, and reducing third-level sliding-door glazing panels from four to six three-foot panels.\n\nHARC approved a small-scale new-construction application at 461 Dakota Avenue with four conditions, including further contouring the site to reduce retaining walls and restore natural topography, a revised lighting plan, voiding the prior CA, and reducing concentrated glazing on the south and north elevations.\n\nHARC approved a small-scale new-construction application at 734 Primrose Lane with three conditions, replacing a staff condition on deck massing with a requirement to eliminate or replace corrugated metal cladding on the south and west facades with a code-compliant material.",
    votes: [{"item":"Phoenix Market COA #10263 — 3-yr extension","outcome":"Passed","tally":""}, {"item":"Phoenix Market vested rights — recommend to Council","outcome":"Passed","tally":""}, {"item":"845 Primrose Ln — small-scale CA amendment","outcome":"Passed","tally":"4-1"}, {"item":"208 South Fur �� final large-scale new construction","outcome":"Passed","tally":""}, {"item":"208 South Fur — amend 2021 development agreement","outcome":"Passed","tally":""}, {"item":"461 Dakota Ave — small-scale new construction","outcome":"Passed","tally":""}, {"item":"734 Primrose Ln — small-scale new construction","outcome":"Passed","tally":""}],
    videoUrl: "https://www.youtube.com/watch?v=cuSYCwY9lMA"
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
    sourceKey: "rico",
    sourceLabel: "Rico",
    date: "2026-09-17",
    title: "Rico Board of Trustees — Sep 17, 2026",
    recap: "The board approved a revocable license and operating plan agreement with the Rico Trails Alliance for the Rio Grande Southern River Trail North, covering trail construction, bridge maintenance, insurance, and periodic inspection reimbursements. The vote was 5-1, with one trustee voting no.\n\nA liquor license renewal for Boulder City Mixology LLC (Enterprise Bar and Grill) was approved unanimously. The mayor recused himself due to a planned future event with the licensee.\n\nThe board passed first readings of three ordinances repealing outdated local laws: Ordinance 2026-10 (town warrants), Ordinance 2026-11 (old firehouse lease), and Ordinance 2026-12 (temporary sidewalk service area permits). All passed 6-0. The sidewalk ordinance repeal drew discussion about liquor license boundaries and state highway jurisdiction; staff will research further before the second reading.\n\nA road erosion control access agreement was approved 6-0, allowing a contractor to begin mitigation work on town roads. Staff also briefed the board on plans to open investment accounts for the parks and sewer funds to capture higher interest returns. A special budget hearing was scheduled for Monday, September 28 at 6:30 p.m. The board voted to enter executive session to discuss a potential property transfer for road access to the north Argentine neighborhood.",
    votes: [{"item":"RGS River Trail North license & operating plan","outcome":"Passed","tally":"5-1"}, {"item":"Liquor license renewal — Enterprise Bar and Grill","outcome":"Passed","tally":""}, {"item":"First reading — Ordinance 2026-10 (town warrants)","outcome":"Passed","tally":"6-0"}, {"item":"First reading — Ordinance 2026-11 (firehouse lease)","outcome":"Passed","tally":"6-0"}, {"item":"First reading — Ordinance 2026-12 (sidewalk permits)","outcome":"Passed","tally":"6-0"}, {"item":"Road erosion control access agreement","outcome":"Passed","tally":"6-0"}],
    videoUrl: "https://www.youtube.com/watch?v=8RfRG5-CKhs"
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
    date: "2026-09-09",
    title: "Ouray County BOCC — Sep 9, 2026",
    recap: "The board held a work session with Rural Homes nonprofit developer Paul Nager on the status of Waterview Homes Phase 2 in Ouray. Phase 1's 21 homes are fully occupied, including two units operating as licensed home-based childcare centers — both reported successful. Phase 2 is platted for roughly 42 units but faces several hurdles: a $1.9 million state loan due July 2027, a pending $1.4 million congressional-directed HUD grant whose terms are not yet finalized, and the need for new city water and sewer capacity. Next steps include a community/city work session to assess rental vs. ownership mix and market absorption.\n\nThe board then received a detailed budget overview from Finance Director Jason, projecting a roughly $1.5 million general fund structural deficit for 2027 — about 15% of general fund spending. Personnel represents approximately 70% of general fund expenditures. Department heads' combined proposed cuts reached only about $80,000, or 3% of operating costs. Options discussed included reducing hours from 40 to 36 for applicable employees (~$275,000 savings), furlough days tied to the 13 county holidays (~$260,000), a 1% merit bonus elimination (~$43,000), retirement contribution reductions (~$45,000–50,000 per percentage point), and benefit plan analysis. Staff and commissioners acknowledged that reduction in force remains a likely outcome.\n\nCommissioners agreed on a budget process: department-by-department work sessions on September 23rd and a special session September 29th to set top-line department allocations, a preliminary budget presentation October 13th, and budget adoption targeted for December 8th.\n\nIn admin reports, County Manager Mendez announced the hire of Henry Mitchell as the county's new Recovery Manager, beginning September 28th. A TABOR notice for the November disaster sales tax ballot measure is active; pro/con statements are due to the county manager by noon September 18th.",
    votes: [],
    videoUrl: "https://vimeo.com/1225421786"
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
    recap: "Council received work-session updates on the comprehensive plan (phase 2 outreach planned for late September) and the gondola replacement project, including a proposed 2027 IGA budget of $6.53 million with a 30% contingency as required for FTA project-development entry. An economic analysis presented by AECOM estimated that losing the gondola could put 10–15% of visitor spending at risk.\n\nOn the 2027 affordable-housing rental rates, council directed staff to hold rents flat (scenario 2 — no AMI increase applied) rather than pass through the 9.7% HUD AMI increase, citing the difficult 2025–26 economic year for residents. One member preferred scenario 1 (full increase) on budget grounds.\n\nThe 2026 mid-year budget amendment passed on second reading. First readings authorizing sale of three town-owned units — Spruce House H and two Feno 2 units — were approved, with public hearings set for September 22. Council approved a resolution formalizing the 30-minute free parking program, unanimously approved a wildfire mitigation project at Shandoka ($63,245 from the affordable-housing fund), and approved a valley-floor management-plan amendment permitting dogs on a relocated river-trail segment near the public-works facility.\n\nAppointments: Thomas Thatcher reappointed to Parks & Recreation Commission; Jill Alon appointed to CASE (alternate); Lache Betton appointed to Planning & Zoning Commission (regular seat); Bob Mather reappointed to HARC; Public Art Commission appointment tabled pending records review. The Telluride Historical Museum received a special-event liquor permit for September 10.",
    votes: [{"item":"2026 mid-year budget amendment (2nd reading)","outcome":"Passed","tally":"7-0"}, {"item":"Wildfire mitigation at Shandoka ($63,245)","outcome":"Passed","tally":"7-0"}, {"item":"Valley floor mgmt plan amendment — dogs on river trail","outcome":"Passed","tally":"7-0"}, {"item":"30-minute free parking program resolution","outcome":"Passed","tally":"7-0"}, {"item":"1st reading — sale of Spruce House Unit H","outcome":"Passed","tally":"7-0"}, {"item":"1st reading — sale of Feno 2 Unit 1A","outcome":"Passed","tally":"7-0"}, {"item":"1st reading — sale of Feno 2 Unit 2A","outcome":"Passed","tally":"7-0"}, {"item":"Appoint Thomas Thatcher, Parks & Rec Commission","outcome":"Passed","tally":"7-0"}],
    videoUrl: "https://www.youtube.com/watch?v=I1B3OGB1XzE"
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
    title: "Mountain Village Town Council — Jul 16, 2025",
    recap: "Council approved a rezone and density transfer at 306 Adams Ranch Road (Lot 640A), allowing Telluride Ski & Golf to add 15 deed-restricted employee apartments to an existing 30-unit complex. The vote was 4-3, with the dissenting members preferring to continue the application until a formal use-and-maintenance agreement for the adjacent open-space lawn was secured as a condition. The majority chose to approve without that condition, expressing trust that a park agreement would follow.\n\nCouncil also approved a variance allowing the existing 1,716-square-foot accessory dwelling unit at 500 Benchmark Drive to exceed the CDC's 1,500-square-foot ADU limit, resolving a pre-purchase discrepancy.\n\nA lighting-code amendment (CDC Section 17.5.12) passed on second reading, with a last-minute addition exempting wall-mounted sconces and soffit fixtures on existing structures from mandatory replacement — provided bulbs meet a 2,700 Kelvin-or-below color temperature. Staff was directed to develop an incentive program proposal for the 2027 budget.\n\nCouncil also approved Q2 2026 financials, appointed three members to the VCA Residents Committee for two-year terms, adopted a resolution correcting application types in the Prop 123 expedited-review policy, and extended the Stage 2 fire restrictions.",
    votes: [{"item":"Rezone & density transfer — 306 Adams Ranch Rd","outcome":"Passed","tally":"4-3"}, {"item":"ADU floor-area variance — 500 Benchmark Dr","outcome":"Passed","tally":""}, {"item":"Lighting code amendment — 2nd reading","outcome":"Passed","tally":""}, {"item":"Q2 2026 financials approval","outcome":"Passed","tally":""}, {"item":"VCA Residents Committee — 3 appointments","outcome":"Passed","tally":""}, {"item":"Prop 123 resolution correction","outcome":"Passed","tally":""}, {"item":"Extend Stage 2 fire restrictions","outcome":"Passed","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/400b4a0e-0d7e-40d9-b64d-71fca2f808aa"
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
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-07-21",
    title: "Town Council — Jul 21, 2026",
    recap: "Council swore in two new members, Maria Stark and Charles Dalton, bringing the body to full seven-member strength.\n\nA work session covered an East Colorado Avenue speed study by KLJ Engineering, focusing on the Gold Run corridor between North Alder Street and Liberty Bell Lane. Staff found that segment two has the worst speeding problem, with 20–30% of vehicles exceeding the 15 mph limit. No votes were taken; council discussion centered on raised crosswalks, edge-line striping, a possible speed limit reduction, and a mini-roundabout near the Galloping Goose turnaround. Recommendations will feed into 2027 budget discussions.\n\nOn the Colorado Wildfire Resiliency Code, council approved second reading of the land use code amendments 6-1 (Charles Dalton dissenting), with an amendment stripping mitigation requirements for trees removed pursuant to the CWRC. A third reading is set for August 11.\n\nCouncil approved a temporary-structure permit for three patio tents at 221 South Oak Street (restaurant use), 180 days per year for three consecutive years, unanimously. A contested appeal involving a North Aspen Street property was continued to September 1 at 10 a.m., unanimously.\n\nLily Acres was appointed to a regular seat on the Ecology Commission for a two-year term, unanimously. Council reassigned board and commission liaisons to incorporate the two new members, approved unanimously.\n\nSitting as the Telluride Housing Authority, council reappointed Ellen Leven as chair, Dan Enright as co-chair, and Kristen Permacoff as secretary (unanimously), and adopted a policy statement on primary residency for dependents of multiple custodial parents — setting a 20% custody threshold and covering children through age 18 — on a 4-3 vote. The wait-list suspension was extended through September 30, unanimously.\n\nSitting as Block 23 Housing Corporation, officers were retained and authorized signers updated, unanimously.",
    votes: [{"item":"CWRC land use code amendments — 2nd reading","outcome":"Passed","tally":"6-1"}, {"item":"Temp structure — 221 South Oak patio tents","outcome":"Passed","tally":"7-0"}, {"item":"Stender Residence appeal — continued to Sep 1","outcome":"Continued","tally":"7-0"}, {"item":"Appoint Lily Acres — Ecology Commission","outcome":"Passed","tally":"7-0"}, {"item":"Council board/commission appointments","outcome":"Passed","tally":"7-0"}, {"item":"THA officer certifications","outcome":"Passed","tally":"7-0"}, {"item":"THA custody/primary residency policy statement","outcome":"Passed","tally":"4-3"}],
    videoUrl: "https://www.youtube.com/watch?v=UTOwo9BuR88"
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
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-07-16",
    title: "Strategic Stakeholders Roundtable — Jul 16, 2026",
    recap: "San Miguel County's Strategic Stakeholders Roundtable held its sixth session focused on proposed land use code changes tied to workforce housing. The group reached informal consensus on two density questions: by-right density in both the low-density and medium-density zone districts will remain at one dwelling unit per 35 acres, with any additional density available only through affordable-housing bonuses.\n\nA side setback reduction from 12.5 to 10 feet in medium and high-density zones was approved by a show of hands with one dissent.\n\nDiscussion on high-density zones and the structure of density-bonus tiers was left unresolved; staff will develop bonus scenarios for a follow-up session scheduled for the morning of Monday, July 28. A joint planning commission and Board of County Commissioners work session is set for July 29.",
    videoUrl: "https://www.youtube.com/watch?v=T8SXtsAOB70",
    votes: []
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
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-06-17",
    title: "HARC — Jun 17, 2026",
    recap: "For 208 South Fir, a large commercial new-construction project in the warehouse district, HARC granted preliminary approval (4-1) with conditions addressing roof material, building height and depth, wall-plane articulation along the alley, an arborist report, parking payment-in-lieu, and building materials.",
    videoUrl: "https://www.youtube.com/watch?v=3naByhxnyjE",
    votes: [{"item":"208 S Fir commercial — preliminary approval","outcome":"Passed","tally":"4-1"}]
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
    title: "Silver",
    source: "Telluride Times",
    date: "September 29, 2026",
    firstSeen: "2026-09-30",
    newsTopic: "education",
    copy: "A couple at Natural Grocers in Montrose recognized the columnist's husband Travis — a fixture in her writing — prompting her to reflect on their 36-year relationship, which began when she spotted him on a playground in Winslow, Maine, in fourth grade. She traces their on-again-off-again childhood connection through to a nervous high school overture in 1990 that finally stuck.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_1a5ffac7-15d0-409a-aa6f-a13142a17381.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/ea/fea219ba-b46c-43f0-afea-cbf0ea9c9f34/6abc4da1e7a84.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "That'll do, Donkey",
    source: "Telluride Times",
    date: "September 29, 2026",
    firstSeen: "2026-09-30",
    newsTopic: "education",
    copy: "Not-So-Young People's Theatre brings Shrek The Musical to the Sheridan Opera House Oct. 8–11 for their sixth annual production. Locals' night is Thursday the 8th with tickets at $15 for students and $25 for adults; Friday through Sunday runs $20/$30 plus fees.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_860c6c87-9eb0-4c87-b8ae-bab0433c35aa.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/78/9782a2d8-940f-4b0b-878f-2bb4c469178b/6abc4cfad7810.image.jpg",
    imgHiRes: true
  },
  {
    title: "A class of her own",
    source: "Telluride Times",
    date: "September 29, 2026",
    firstSeen: "2026-09-30",
    newsTopic: "education",
    copy: "Telluride Elementary PE teacher Erin Murray has been named SHAPE Colorado's 2026 Young Professional Physical Education Teacher. A Telluride native and THS grad, Murray is known for playful, skill-building classes and popular Parent Play Days. She'll be recognized at the SHAPE Colorado Convention on Oct. 16.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/gallery/news/article_032bdae8-f1ff-4933-af97-5dae6bcba696.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/25/52523dd3-4a7d-4ec1-86f3-f61fec80cecf/6abc4b8d52a64.image.png",
    imgHiRes: true
  },
  {
    title: "A guide to measures on the November state ballot",
    source: "Telluride Times",
    date: "September 29, 2026",
    firstSeen: "2026-09-30",
    newsTopic: "government",
    copy: "Colorado voters will see 14 statewide measures this November — seven constitutional amendments and seven statutory propositions. The amendments cover topics ranging from immigration reporting and natural gas rights to hunting, fishing, and mail ballot ID requirements. San Miguel County commissioners have weighed in with positions on several of them.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_e9486d75-07a6-41b0-9929-42885e96774c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/46/a46a5646-5b5e-4df7-8029-9d528386492e/6abc4c643dac5.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Keen on cars (and The Times)",
    source: "Telluride Times",
    date: "September 29, 2026",
    firstSeen: "2026-09-30",
    newsTopic: "community",
    copy: "Four-year-old Wyatt Yarnall made the most of last week — catching the Telluride Times one day and the Autumn Classic car show the next. His mom says he's got a serious thing for Corvettes and Porsches, which tracks — engineers and car people run in the family.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/gallery/featured/article_25898589-13e7-46c8-9c84-49401444e5d2.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/38/b38418f0-cb5d-4237-9b8a-d66bf6ebe521/6abc4adb4b898.image.jpg",
    imgHiRes: true
  },
  {
    title: "A little buzz",
    source: "Telluride Times",
    date: "September 29, 2026",
    firstSeen: "2026-09-30",
    newsTopic: "community",
    copy: "A local writer shares her longtime interest in sound and vibration therapy, crediting a gong bath session with possibly dislodging a salivary stone her doctor said didn't exist. She's now using a 128 Hz tuning fork for nervous system calming. Anecdotal, but worth knowing these tools are out there.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_ae5fb453-1c72-445d-b9f5-2158c12e5b08.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/b2/8b2b8d3c-d28d-4bba-8059-73abec4eecc7/6abc492648e24.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "The 13-year investment behind every graduate",
    source: "Telluride Times",
    date: "September 29, 2026",
    firstSeen: "2026-09-30",
    newsTopic: "education",
    copy: "Colorado's new school funding formula would cut Telluride School District's per-pupil revenue by 17%. Measure 5A asks voters to raise the local mill levy override to partially offset that loss — even if it passes, the district would still have about 4% less per student than today. The district has already cut 13 positions over three years and families are paying more in fees.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_cfc9d5da-e2e3-424e-96f7-d3df77ceda5d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/a4/fa4c6e89-2d9b-46ae-93e5-75958321df1d/6abc49fd75314.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Black cats aren't scary",
    source: "Telluride Times",
    date: "September 29, 2026",
    firstSeen: "2026-09-30",
    newsTopic: "community",
    copy: "",
    claudeSummary: false,
    href: "https://www.telluridenews.com/news_release/article_c00656e3-474f-439c-a5f7-6b919dcb0653.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/02/9029e65d-ab7d-40b8-826e-b634ce05c129/6abc487807a3f.image.jpg",
    imgHiRes: true
  },
  {
    title: "The Strategic Stakeholders Roundtable: a community effort",
    source: "Telluride Times",
    date: "September 29, 2026",
    firstSeen: "2026-09-30",
    newsTopic: "housing",
    copy: "San Miguel County's Stakeholder Strategic Roundtable — a 22-member advisory group of local builders, brokers, planners, and agency reps — has completed a review of the Land Use Code aimed at easing housing development without eroding community character. Their recommendations are posted at bit.ly/smcssr. A public work session is scheduled Oct. 8, 9 a.m., at the Miramonte building in Telluride, also available via Zoom.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_778d0a27-3bf6-4399-b7a6-f16bb87aed4f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    letterAuthor: "Colorado Ave",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Mountain Village Housing Authority to hold tiered lottery for two Meadowlark units",
    source: "Telluride Times",
    date: "September 29, 2026",
    firstSeen: "2026-09-30",
    newsTopic: "housing",
    copy: "Two deed-restricted units at Meadowlark in Mountain Village are up for lottery — a 3BD/2.5BA at $839,728 and a 3BD/3BA at $1.1M, both with a 4% appreciation cap. Applications are due Oct. 12; drawing is Oct. 22. Essential workers and Mountain Village employers get first priority.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_99a7922f-ae49-4651-b206-20c24ad1e89f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/e8/0e803acf-6ec9-402b-81fa-75231869a2df/6abc47415ecf0.image.jpg",
    imgHiRes: true
  },
  {
    title: "Military academies won't give tenure to civilian faculty, Hegseth says",
    source: "Telluride Times",
    date: "September 29, 2026",
    firstSeen: "2026-09-30",
    newsTopic: "community",
    copy: "The Defense Department has decided to stop appointing civilians as tenured faculty at U.S. military academies. Secretary Pete Hegseth signed a memo Tuesday outlining the change, saying he wanted to refocus these institutions on warfighting. Hegseth argues that “civilian academic…",
    claudeSummary: false,
    href: "https://www.telluridenews.com/news/state/article_3af82977-09a9-57f6-8e08-00e635bf2cfb.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/5f/05fc27db-b757-5f93-9bfd-3ab2f9184bf3/6abc2507ee7c3.image.jpg",
    imgHiRes: true
  },
  {
    title: "See ‘the hidden Telluride’ during Artabout",
    source: "Telluride Times",
    date: "September 29, 2026",
    firstSeen: "2026-09-30",
    newsTopic: "arts-culture",
    copy: "Telluride offers an abundance of options for viewing art.",
    claudeSummary: false,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_e9ca6422-b719-416e-a248-574d8ab9dba5.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/4c/84c111ad-e4b3-4fce-b279-5aa3f568b568/6abb3cce67b31.image.jpg",
    imgHiRes: true
  },
  {
    title: "Big Billie’s food truck approved despite council, public objections",
    source: "Telluride Times",
    date: "September 29, 2026",
    firstSeen: "2026-09-29",
    newsTopic: "government",
    copy: "Mountain Village Town Council approved a conditional use permit for a Telski food truck, tent, and outdoor seating in front of Big Billie's, replacing what had been indoor public dining. Council members, the Design Review Board, and residents raised concerns about aesthetics, accessibility, lost seating capacity, and the absence of any long-term plan.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_dde388ee-d4f3-44aa-a20c-713a8381135a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/0b/f0b20d7d-7436-489b-bca7-d91db06c5634/6abac9173c5f8.image.png",
    imgHiRes: true
  },
  {
    title: "Library gives parents more control over kids’ screen time",
    source: "Telluride Times",
    date: "September 28, 2026",
    firstSeen: "2026-09-28",
    newsTopic: "arts-culture",
    copy: "Wilkinson Public Library now lets parents opt their kids out of iPad and laptop access in the Youth Services area by completing a form on the library's website. Staff will hold devices behind the circulation desk and check each child's status before handing them out. The library still offers plenty for kids to do, including a newly remodeled children's space, tween area, and programming like story time and art classes.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_dd2cb151-2594-4730-bd3f-4469bde3f332.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/80/280c3cfe-f8bb-4a6d-a868-7bb7ecb9e02f/6abad1828f35d.image.jpg",
    imgHiRes: true
  },
  {
    title: "Town council receives updates on housing projects",
    source: "Telluride Times",
    date: "September 28, 2026",
    firstSeen: "2026-09-28",
    newsTopic: "government",
    copy: "Four town housing projects got a status update at the Sept. 22 council meeting. Canyonlands/Tower House (36 deed-restricted units) is under construction with completion expected in 2027; Virginia Placer is 75% done. Carhenge and the Shandoka Lot — larger mixed-use redevelopments — are moving through early review stages.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_cbff3669-7ab9-4178-9998-88950b70e1e7.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/00/a00f68cf-48f5-4612-bba6-efd1a9d6f733/6ab5b0f5a9859.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘A place to mourn, grieve and reflect’",
    source: "Telluride Times",
    date: "September 27, 2026",
    firstSeen: "2026-09-27",
    newsTopic: "community",
    copy: "Telluride Historical Museum docent-led tours of Lone Tree Cemetery run through Oct. 30, with daytime walks Fridays 1–2 p.m. and lamplight tours the final two Fridays at 6:30 p.m. More than 2,000 people are buried there since 1885, though 100+ graves have vanished. Call (970) 728-3344 or visit telluridemuseum.org for tickets.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_79195f13-ba5f-479d-8970-d5d187657d6c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/f9/5f926ce3-ba46-4789-8a5f-0f7b8f9cf067/6ab5b44a1bbdf.image.jpg",
    imgHiRes: true
  },
  {
    title: "Angels among us",
    source: "Telluride Times",
    date: "September 27, 2026",
    firstSeen: "2026-09-27",
    newsTopic: "community",
    copy: "Telluride Angel Baskets is heading into its 45th year serving 200-plus families across San Miguel and western Montrose counties — and program director Peter Kenworthy expects a 20% jump in applicants this year, tied to rising costs, reduced federal funding, and a low snow season. The deadline to apply is September 30, and donations and volunteers are welcome at tellurideangelbaskets.org.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_b960593f-3db8-46df-9d62-a5d8dfcd833f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/f6/6f6775e1-80df-4569-b891-ac9f301a4133/6ab4b7b49ab7e.image.jpg",
    imgHiRes: true
  },
  {
    title: "The Patio is open",
    source: "Telluride Times",
    date: "September 26, 2026",
    firstSeen: "2026-09-26",
    newsTopic: "housing",
    copy: "A new restaurant called The Patio has opened in the outdoor space above O'Bannon's on Spruce Street, where The Bistro used to be. It's aiming for affordable, approachable food — think smash burgers and draft beer for around $20 — with kitchen hours running 11 a.m. to 11 p.m. The ownership group also plans to take over the O'Bannon's space after January 1st and eventually open a New York-style deli in the adjacent Kamruz gallery storefront.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/business/article_bd4b50e9-3f70-42ff-a0e9-bd9259f061ee.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/82/1829827b-0a30-4901-ba35-44decc9ecd84/6ab44cb105703.image.jpg",
    imgHiRes: true
  },
  {
    title: "Sheridan Opera House announces holiday acts",
    source: "Telluride Times",
    date: "September 26, 2026",
    firstSeen: "2026-09-26",
    newsTopic: "arts-culture",
    copy: "The Sheridan Opera House's Holiday Concert Series runs Dec. 28–Jan. 3, built around tribute acts spanning the '60s through '90s — John Denver, Beastie Boys, and a '60s revue on NYE among them. Andy Falco and Travis Book close things out Jan. 2–3 with a Jerry Garcia celebration.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_93ad97e9-5ec6-442a-b477-d54f29304abf.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/57/9574877a-ca2b-4786-918c-c7a99195af78/6ab23fb7bc780.image.jpg",
    imgHiRes: true
  },
  {
    title: "House committee investigates environmental groups",
    source: "Telluride Times",
    date: "September 25, 2026",
    firstSeen: "2026-09-25",
    newsTopic: "community",
    copy: "The House Committee on Natural Resources launched an investigation into 19 environmental nonprofits, claiming they profit from taxpayer-funded legal fee reimbursements. Several groups with ties to the San Juans are on the list, including San Juans Citizens Alliance and The Wilderness Society. Responses are currently voluntary, but subpoenas are possible.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_dede5e34-6180-4331-8bc9-ef5fbe565ffa.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/6d/46dd0e1b-3c9a-4c8b-94c5-74ebab72d786/6ab2eee5c1c60.image.jpg",
    imgHiRes: true
  },
  {
    title: "Meeting the community’s needs",
    source: "Telluride Times",
    date: "September 25, 2026",
    firstSeen: "2026-09-25",
    newsTopic: "community",
    copy: "Lone Cone Library in Norwood landed a $10,000 ALA grant — one of 836 awarded nationwide — to expand services for the deaf community, including ASL books, videos, and online resources. They've also added Hoopla for e-books and a new youth services coordinator. Community input continues at monthly meetings, next one Sept. 24 at 6 p.m.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_c5dcb27d-e944-47b0-bb05-691f64e94d53.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/75/d7564083-56c3-4dda-8b2d-31ec3c75244a/6ab546ae3ff77.image.jpg",
    imgHiRes: true
  },
  {
    title: "Upside in Mountain Village: Record summer revenue stirs optimism",
    source: "Telluride Times",
    date: "September 25, 2026",
    firstSeen: "2026-09-25",
    newsTopic: "government",
    copy: "Mountain Village is heading into 2027 budget talks with some good news — revenues are projected up 8.6% year-over-year (excluding one-time contributions), driven by stronger property and sales taxes, while operating expenses rose just 2.4%. May through July marked a record summer, continuing a trend of growth since 2022. A full budget work session is set for Oct. 7.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_6ce4ab42-099e-4380-ac77-5a566cf1b4e5.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/3c/53cf51bd-4ba6-4642-b33b-e35bad85cc2b/6ab55821ed4dd.image.jpg",
    imgHiRes: true
  },
  {
    title: "Trump administration moves to limit fixes for systemic racism in schools",
    source: "Telluride Times",
    date: "September 25, 2026",
    firstSeen: "2026-09-25",
    newsTopic: "education",
    copy: "The Trump administration has rolled back federal tools used to address systemic racism in schools, including rescinding a rule that let schools compare outcomes across racial groups and pulling back from dozens of school desegregation cases. The Justice Department says it has closed more than 50 such cases since January. Critics say the changes remove accountability for racial disparities in discipline and school resources.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_acb2a7b2-b8af-566a-997e-4bc32694ef79.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/bd/fbd622a4-3853-5651-8dae-e4129b0db302/6ab5f3a82bf86.image.jpg",
    imgHiRes: true
  },
  {
    title: "Young voices ring out",
    source: "Telluride Times",
    date: "September 25, 2026",
    firstSeen: "2026-09-25",
    newsTopic: "community",
    copy: "The Telluride Choral Society's youth choir, the Choristers, is pushing rehearsal start to Oct. 23 this year — deliberately waiting for soccer season to wrap up so kids don't have to choose. Enrollment has grown steadily under director Tagen Kaestner, from as few as six singers to a expected dozen or more for WinterSing 2026. Grades 2–12 can register at telluridechoralsociety.org.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_875f0297-d2ac-46b4-ac8d-458cebb007cc.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/19/51924723-f468-4f33-bb7d-edd8d6028af4/6ab1303435b06.image.jpg",
    imgHiRes: true
  },
  {
    title: "Energy Department will spend $2 billion to squeeze more electricity from the aging power grid",
    source: "Telluride Times",
    date: "September 24, 2026",
    firstSeen: "2026-09-24",
    newsTopic: "infrastructure",
    copy: "The Energy Department is putting nearly $2 billion toward 31 grid upgrade projects across 26 states, using sensor technology and fiber optics to safely push more electricity through existing transmission lines. The goal is to add over 23 gigawatts of capacity and improve reliability for roughly 100 million Americans as AI data centers drive up demand fast. Funding comes from the bipartisan infrastructure law, matched by over $3 billion from project recipients.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_55a83654-a2e6-5abd-8c5c-43a14a65dd54.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/de/ddedd793-ebec-5560-b0e9-0e8ba991e0b1/6ab56ab025303.image.jpg",
    imgHiRes: true
  },
  {
    title: "THS volleyball riding unlucky slide",
    source: "Telluride Times",
    date: "September 24, 2026",
    firstSeen: "2026-09-24",
    newsTopic: "community",
    copy: "Telluride volleyball dropped its fourth straight match, falling to No. 8-ranked Dolores 27-25, 25-13, 25-13 on Sept. 17. The Lady Miners sit at 4-7 overall, 1-1 in league play. Up next: Ignacio on Sept. 26 and Norwood on Sept. 29.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_a7e679a2-0834-4e75-9f4f-b57edcd0d345.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/9d/79d0bec4-b8ce-407b-8c1b-10990ca9a956/6ab552be11cc1.image.jpg",
    imgHiRes: true
  },
  {
    title: "San Miguel County sheriff talks license plate readers",
    source: "Telluride Times",
    date: "September 24, 2026",
    firstSeen: "2026-09-24",
    newsTopic: "public-safety",
    copy: "Sheriff Dan Covault held a public meeting to explain how the county's Motorola license plate readers work — one is active in Norwood, three are on hold pending more community input. Data is stored 90 days, access is limited to two administrators, and there's no live feed or video.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_042cb003-b85f-484e-bb6c-a2a321f63f4f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/0f/30f270d0-337a-486d-9605-5f0a4a6fbf3b/6ab5462a2302e.image.jpg",
    imgHiRes: true
  },
  {
    title: "Scottsdale's water recycling program hits election-year backlash",
    source: "Telluride Times",
    date: "September 24, 2026",
    firstSeen: "2026-09-24",
    newsTopic: "government",
    copy: "Scottsdale shelved a plan to add highly treated recycled wastewater directly to drinking supplies by 2027, after election-season opponents called it \"poop water\" — claims city water officials say misrepresent the science. The city has run its recycling program since 1998 and gets 70% of its water from the Colorado River. The council swapped dedicated program funding for a vague $100M \"new sources\" allocation.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_39f582ef-b92c-5835-8bb3-e4d7b9ef565a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/5a/95a1e298-d2f4-5df9-9974-78448b94a610/6ab4f3002e442.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘It’s a celebration of anything that rolls’",
    source: "Telluride Times",
    date: "September 24, 2026",
    firstSeen: "2026-09-24",
    newsTopic: "arts-culture",
    copy: "The Telluride Autumn Classic runs Sept. 24–27 across Telluride, Mountain Village, and the Regional Airport, with free public car displays on Colorado Ave., a Silverton Poker Run, Concours show, fine arts festival, and casino night. Organizers describe it as a festival, not just a car show.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_37d8c5cb-aa16-4a41-b810-c532c1528446.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/8a/88ae1670-c975-4bef-a035-020fdb1cfc44/6ab4009043090.image.jpg",
    imgHiRes: true
  },
  {
    title: "Val Kin Maltese",
    source: "Telluride Times",
    date: "September 24, 2026",
    firstSeen: "2026-09-24",
    newsTopic: "community",
    copy: "Val Kin Maltese, a Telluride community member, passed away August 28, 2026, at his home in Las Cruces, NM. He is survived by his wife Anne, son Cory, three stepchildren, and his cat Nugget. A celebration of life is planned in Telluride in late October.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/obituaries/article_efbdd619-cd80-46ef-84da-1637874601dc.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/f7/cf76a5fd-9946-44df-8b21-66e5805c82bf/6ab3da4483284.image.jpg",
    imgHiRes: true
  },
  {
    title: "Legals and Public Notices for Sept. 24-30, 2026",
    source: "Telluride Times",
    date: "September 24, 2026",
    firstSeen: "2026-09-24",
    newsTopic: "infrastructure",
    copy: "Mountain Village is accepting bids for a gondola cabin auction, with submissions due by 5 p.m. Sept. 30 via email. Separately, a unit at Tomboy Lodge (619 W. Columbia Ave.) is headed to foreclosure auction Nov. 12 after missed mortgage payments on a 2004 loan.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/legals/article_87c1dedd-06e4-4678-a68d-6a0116434245.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Miners elevated",
    source: "Telluride Times",
    date: "September 24, 2026",
    firstSeen: "2026-09-24",
    newsTopic: "infrastructure",
    copy: "Telluride's boys soccer team picked up a 3-0 win over Vail Mountain on Sept. 19 in Grand Junction, two days after a 1-0 road win at Crested Butte. Goals came from Grady Blount, bi Clarke, and sophomore Waylon Wassermann, whose 25-yard strike sealed it. Goalie Maddox Slosberg was steady throughout.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_a23d9eb7-6dc4-4576-8c86-b9a06c52a102.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/8d/28d59319-da13-4169-93b0-6aa63219e6a7/6ab4042562f1f.image.jpg",
    imgHiRes: true
  },
  {
    title: "Supporting Dan Covault for sheriff",
    source: "Telluride Times",
    date: "September 23, 2026",
    firstSeen: "2026-09-24",
    newsTopic: "government",
    copy: "A Western Slope prosecutor writes in support of Sheriff Dan Covault, citing 26 years of local law enforcement experience and firsthand collaboration on serious cases. Covault was appointed by county commissioners in 2025 to succeed Bill Masters and has helped develop a rural behavioral-health transport program in Norwood.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_a280a12c-27c8-4c87-a107-1441f5826d5c.html",
    img: "",
    letterAuthor: "Rob T. Zentner",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "School sports, a game-changer in life",
    source: "Telluride Times",
    date: "September 23, 2026",
    firstSeen: "2026-09-24",
    newsTopic: "education",
    copy: "A local coach and educator writes in to make the case for keeping school sports funded, drawing on his own story of being a struggling student who turned things around through athletics. He also shares an example of a quiet, disconnected student who blossomed after one basketball season. The letter is a straightforward personal account, not a budget proposal.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_dd4abced-ec52-4be2-8007-ada51ea7b8bf.html",
    img: "",
    letterAuthor: "Daniel Keith Davenport TM",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Grateful that the Sanctioning Russia Act passed",
    source: "Telluride Times",
    date: "September 23, 2026",
    firstSeen: "2026-09-24",
    newsTopic: "community",
    copy: "The Lindsey O. Graham Sanctioning Russia Act passed the Senate 86–11 and the House 262–159, then was signed into law Sept. 18. The bill imposes tough new sanctions on Russia's defense and financial sectors, officials, and oligarchs, plus tariffs up to 100% on major buyers of Russian energy. CD-3 Rep. Jeff Hurd voted yes.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_58c54c4d-98d0-48bd-b1d4-992e0ae3adcb.html",
    img: "",
    letterAuthor: "Neonila Martyniuk Montrose",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Why I've dedicated three decades to our schools",
    source: "Telluride Times",
    date: "September 23, 2026",
    firstSeen: "2026-09-24",
    newsTopic: "education",
    copy: "Telluride School District has earned Accreditation with Distinction — top 10% in Colorado — every year since the program began. A state funding formula change now threatens to cut spending by up to 30%, beyond adjustments for enrollment decline, potentially eliminating teachers and programs. Voters are being asked to approve Measure 5A as the only available local remedy.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_63ddf08b-7f52-494c-93c3-5d1fbcb3b726.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/46/d469bdfc-73ff-4055-a8b0-c3efb2c9e4b2/6ab45c78deec8.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Parent and taxpayer supports TSD ballot measure",
    source: "Telluride Times",
    date: "September 23, 2026",
    firstSeen: "2026-09-24",
    newsTopic: "education",
    copy: "Telluride School District's Measure 5A would raise roughly $2.6M annually to offset a projected $3M+ revenue loss driven by state funding formula changes — not local property values. A district teacher and parent notes that enrollment is declining 11% through 2032, but funding is dropping 17%, with fixed costs like transportation and facilities unchanged. The district has already cut classroom budgets and left teacher vacancies unfilled.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_d96b5959-75ce-4d67-af00-d6e914c83c48.html",
    img: "",
    letterAuthor: "Caitlin",
    isLetter: true,
    imgHiRes: true,
    authorChecked: true
  },
  {
    title: "Rolling with it",
    source: "Telluride Times",
    date: "September 23, 2026",
    firstSeen: "2026-09-24",
    newsTopic: "community",
    copy: "A personal essay from the Telluride Times reflects on life with a wheelchair-using friend — the daily navigation of ramps, doors, and public spaces, and how attitudes from strangers ranged from pity to genuine kindness. The writer notes that over time, frustration gave way to gratitude and stoicism. A quiet, human look at accessibility and resilience.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_156b3c62-1adc-4103-a497-f24cb20d1de5.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/e5/8e5310a1-c9b5-4693-9950-ca8589667ed8/6ab45be3940e4.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Proven out there. Rooted right here",
    source: "Telluride Times",
    date: "September 23, 2026",
    firstSeen: "2026-09-24",
    newsTopic: "public-safety",
    copy: "Telluride native Lane Masters — son of the county's longtime outgoing sheriff — is running for San Miguel County Sheriff. He brings nearly two decades of law enforcement experience including Marine service, detective and sergeant roles, and emergency management studies. He's back home raising a family and focusing his platform on privacy, treatment over incarceration, and mental health resources.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_96b5d2d0-fdcb-48dd-85a9-78518bbf4976.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/6d/e6dd01b5-7214-4356-81e8-5d6124bdf69c/6ab45b30ce82d.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Don't let your pet stay lost",
    source: "Telluride Times",
    date: "September 23, 2026",
    firstSeen: "2026-09-24",
    newsTopic: "community",
    copy: "Lost pets are a real and ongoing issue across the region, especially in Delta, where Second Chance Humane Society has reunited only about half of the 40 stray dogs taken in since May. The big obstacle is simple: most strays arrive with no collar, no tag, and no microchip. A microchip costs little, lasts your pet's lifetime, and a collar with a tag can get a lost dog home even faster.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_56a36870-d7e7-4d8d-86d8-6e7ab4efc164.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/89/5894a7f0-d8d5-4527-84f2-4b102e9ade79/6ab456b1b87f4.image.jpg",
    imgHiRes: true
  },
  {
    title: "Betsy Gaines Quammen to speak about her new book",
    source: "Telluride Times",
    date: "September 23, 2026",
    firstSeen: "2026-09-24",
    newsTopic: "arts-culture",
    copy: "Award-winning author Betsy Gaines Quammen brings her new book \"This Haunted Land\" to the Wilkinson Public Library terrace on Oct. 2 at 4:30 p.m. — free, with books for sale from Between the Covers and a signing after. The book explores American ghost stories as windows into forgotten history.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_ff555454-3e1f-40a0-b893-1353f61671c4.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/c1/6c118516-9e04-48c2-aa45-aa043838032e/6ab458ce9b880.image.jpg",
    imgHiRes: true
  },
  {
    title: "First Book Cliffs Poetry Festival set for Sept. 26 in Grand Junction",
    source: "Telluride Times",
    date: "September 23, 2026",
    firstSeen: "2026-09-24",
    newsTopic: "arts-culture",
    copy: "The first Book Cliffs Poetry Festival comes to Grand Junction on Sept. 26, brought together by the Art Center of Western Colorado and Telluride Institute's Talking Gourds program. The day includes workshops, open mic, regional poet spotlights, and an evening awards ceremony — including a laureate handoff and prize announcements. Tickets are $50 full-day or $20 per session, with half-price for students and seniors 75+.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_fe1227aa-5eee-4935-8133-3c46e16dadf6.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/fe/7fe76be8-cb18-4e78-b156-5a9fe1422ec2/6ab459f23624a.image.jpg",
    imgHiRes: true
  },
  {
    title: "Pumpkin spice nothin': the real fragrances of fall",
    source: "Telluride Times",
    date: "September 23, 2026",
    firstSeen: "2026-09-24",
    newsTopic: "community",
    copy: "Fall has arrived in the mountains — elk bugling, aspens turning, and the air full of petrichor, leaf litter, and warm ponderosa resin. These aren't random smells; each has a chemical source, and our brains are wired to feel them deeply. Good reminder to slow down and actually breathe it in.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_dc73b55c-2c67-4c19-bfed-3739ce3b067c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/2e/f2e73898-06fc-4b81-87b0-15a0bf267fc3/6ab45817595af.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "To the good people of HD 58",
    source: "Telluride Times",
    date: "September 23, 2026",
    firstSeen: "2026-09-24",
    newsTopic: "community",
    copy: "A candidate for Colorado House District 58 has dropped out of the 2026 race after word from the Secretary of State's office over Labor Day weekend. The candidate thanked supporters across Gunnison County and cited a cross-partisan, community-first approach. He says he plans to run again in 2028.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_787d5f1c-4e7b-4ca2-a06e-3ab12c6c353e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/13/c13e7fef-4803-44a3-bd44-ebc80ba197f2/6ab4575d886fc.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Blues & Brews bids farewell to summer",
    source: "Telluride Times",
    date: "September 23, 2026",
    firstSeen: "2026-09-23",
    newsTopic: "arts-culture",
    copy: "32nd annual Blues & Brews ran Sept. 18–20 in Town Park, wrapping up Telluride's summer festival season. Crowds pointed to G. Love, TajMo, and Jon Batiste as standouts, with one attendee calling Batiste the best they'd ever seen. Weather cooperated, mostly.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_fa51f889-d06a-4fe1-883d-7b59af715fd2.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/32/932dffa2-be9c-4e57-985d-a1602399bff3/6ab40902b17b8.image.jpg",
    imgHiRes: true
  },
  {
    title: "Heavy September rainfall brings much-needed relief",
    source: "Telluride Times",
    date: "September 23, 2026",
    firstSeen: "2026-09-23",
    newsTopic: "community",
    copy: "September brought roughly twice the normal monthly rainfall to the San Juan region, offering some relief after a brutal year — last winter's low snowpack left Placerville river flows at just 47% of median. The moisture helps soil conditions heading into winter, which matters for spring runoff efficiency. It's a welcome development, but one good rainy stretch won't resolve the deeper water stress across the West.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_cfe212b3-4718-4765-8681-43b8e21d6a52.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/84/b84451b7-c447-4fbe-83fe-e47a3202d22b/6aae97311a353.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘A reflection of place’",
    source: "Telluride Times",
    date: "September 22, 2026",
    firstSeen: "2026-09-22",
    newsTopic: "arts-culture",
    copy: "Telluride artist Brooke Einbender's interactive installation *Gaiascope* — three mirrored, kaleidoscopic sculptures filled with locally inspired video art — is up at Heritage Plaza through around Oct. 23. Viewers can adjust colors and patterns from a pad outside each chamber; best seen lit up at night. The piece previously showed at the San Jose World Cup before landing here in the San Juans.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_1e344649-7938-4755-ba52-0c0e859a9553.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/f2/5f2b2227-5a1a-43d9-a863-93c4e98a1f5c/6ab247a3a9fe4.image.jpg",
    imgHiRes: true
  },
  {
    title: "County commissioners make November ballot measure recommendations",
    source: "Telluride Times",
    date: "September 22, 2026",
    firstSeen: "2026-09-22",
    newsTopic: "government",
    copy: "San Miguel County commissioners reviewed 15 November ballot measures at their September meetings and issued formal recommendations on each. They supported Amendment 87 (graduated income tax) and opposed several Advance Colorado-backed initiatives, including measures on natural gas rights, immigration enforcement, mail ballot ID requirements, and congressional redistricting. The R-1 school district question is also on the ballot.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_abf6f7ea-c0d4-42d5-9f95-07606fc94bef.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/9f/79f9455e-8fa9-4356-bc76-d49a0106e719/6ab02a46c4d5a.image.jpg",
    imgHiRes: true
  },
  {
    title: "Heidi Hoff brings personalized healthcare into the home",
    source: "Telluride Times",
    date: "September 21, 2026",
    firstSeen: "2026-09-21",
    newsTopic: "health",
    copy: "Heidi Hoff launched Telluride Concierge Nursing in 2025, bringing licensed RN care directly into homes for post-op recovery, senior support, and medication infusions — services that otherwise often require a drive to Montrose. She spent 11 years at Telluride Regional Medical Center before starting the business. The county has no hospice service, and she's looking at palliative care as a next step.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/business/article_0a389e52-237a-4ed7-bcb3-d10c0e1b36fa.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/49/04952f13-a30a-4004-a9ed-4a07e516efa2/6aae9505826df.image.jpg",
    imgHiRes: true
  },
  {
    title: "Council vote allows dogs on section of new River Trail",
    source: "Telluride Times",
    date: "September 21, 2026",
    firstSeen: "2026-09-21",
    newsTopic: "government",
    copy: "Town Council voted to allow dogs on a small section of the River Trail being relocated onto the Valley Floor open space near the Public Works Facility. The trail move — about 1,000 linear feet — follows the old river channel and is meant to improve safety and winter grooming. Dogs were already allowed on the current trail, so most users won't notice a change.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_05fec48f-5e1e-482e-bd1f-8b1e2673ce60.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/6e/26e8b916-530b-4b76-b271-92afa9dc4c2c/6aacf1c7298fa.image.jpg",
    imgHiRes: true
  },
  {
    title: "High fashion and higher ideals",
    source: "Telluride Times",
    date: "September 20, 2026",
    firstSeen: "2026-09-20",
    newsTopic: "government",
    copy: "Two Skirts on Main Street has been around since 2001, and owner Kristin Holbrook has quietly built something beyond a boutique — hiring up to 12 young women each summer and running a THS mentorship program focused on life skills, confidence, and professionalism. She's also logged years on local boards and earned the Telluride Foundation's Outstanding Citizen award in 2014.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/business/article_3c8053da-d008-4adf-a5e3-48a8c554270a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/fd/8fd5b822-283d-4b0a-b5bf-6e29d98b3748/6aab7f699d8e2.image.jpg",
    imgHiRes: true
  },
  {
    title: "Colorado State apologizes to BYU for derogatory chants as 11th-ranked Cougars beat Rams 41-23",
    source: "Telluride Times",
    date: "September 20, 2026",
    firstSeen: "2026-09-20",
    newsTopic: "education",
    copy: "BYU beat Colorado State 41-23 Saturday, but the bigger story was CSU issuing a formal apology for anti-Mormon chants from its student section. It's the second straight season CSU has faced this issue with BYU — Colorado was fined $50,000 last year for similar incidents.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_d20c50fb-f0ea-5bea-8b4c-6ca662740676.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/aa/2aaaf492-aa72-588a-90ab-789e8f3e0580/6aaffd3669b82.image.jpg",
    imgHiRes: true
  },
  {
    title: "THS volleyball unlucky in tight losses",
    source: "Telluride Times",
    date: "September 20, 2026",
    firstSeen: "2026-09-20",
    newsTopic: "education",
    copy: "Telluride High School volleyball dropped two close matches in non-league play, falling to North Fork 0-3 and Pagosa Springs 0-3, with four of the six sets decided by two points or fewer. The Lady Miners rallied from 17-12 down in Set 3 against North Fork before narrowly losing 24-26. Now 4-6 overall, they face ranked Dolores and Ignacio over the next two weeks.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_b71b52bc-98b9-47da-878d-8bbd47b91139.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/e5/7e5e5bc5-834a-445d-83f6-648803cdf591/6aab7a505d9a2.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride Town Council to hold work session on Flock cameras",
    source: "Telluride Times",
    date: "September 19, 2026",
    firstSeen: "2026-09-19",
    newsTopic: "government",
    copy: "Two Flock ALPR cameras have been operating in Telluride since 2024, recording license plates and basic vehicle details — no facial recognition, no individual identification. Town Council will hold a formal work session Oct. 6 to weigh the technology's benefits against concerns about third-party data access and potential misuse beyond local law enforcement.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_7ba356ab-7312-41be-9b1d-108220d2f7c4.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/9f/89f9e69a-70b8-481a-8e25-c00185d17852/6aac0965627f0.image.jpg",
    imgHiRes: true
  },
  {
    title: "Paint My Mailbox Blues & Brews",
    source: "Telluride Times",
    date: "September 19, 2026",
    firstSeen: "2026-09-19",
    newsTopic: "arts-culture",
    copy: "TajMo — the Grammy-winning duo of Taj Mahal and Keb' Mo' — headlines Blues & Brews Saturday night, touring behind their second album together, \"Room on the Porch.\" The two play a wide range of instruments and may strip it down to just the two of them at points during the set.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/gallery/article_881bdba9-49c1-41dc-8373-907e9e7a5962.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/27/62721eee-e618-43d3-9838-d8ee38bcd4a3/6aaeb69dc331b.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘A festival can do more than entertain a community’",
    source: "Telluride Times",
    date: "September 19, 2026",
    firstSeen: "2026-09-19",
    newsTopic: "arts-culture",
    copy: "At Blues & Brews this weekend, a group called JABOR — live event professionals who've been doing disaster relief for 20 years — will assemble 200 emergency go-kits at the festival grounds. The kits, valued around $115 each, go free to low-income and vulnerable households in Ouray, San Miguel, and Montrose counties. Festivalgoers can help pack them on-site.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_d0c68d7d-8248-4a0b-b3c0-b8fd7c358896.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/e8/4e8d00b4-ee8e-4338-9671-4c240f5350af/6aab776376769.image.jpg",
    imgHiRes: true
  },
  {
    title: "3 killed in Navajo Nation flood include 7-year-old preparing for her birthday",
    source: "Telluride Times",
    date: "September 19, 2026",
    firstSeen: "2026-09-19",
    newsTopic: "public-safety",
    copy: "Three people died Tuesday near Newcomb on the Navajo Nation after floodwaters swept them away during monsoon storms — a grandmother, her 7-year-old granddaughter, and a friend who came to help. Roads across the region remain closed, families are stranded, and the Navajo Nation President has declared a state of emergency.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_62cb8205-ca33-5541-a01a-9abe1724cb7e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/ea/bea76aa0-ed02-5d11-a6f7-813fb81d7d72/6aaddfad8cd47.image.jpg",
    imgHiRes: true
  },
  {
    title: "County to amend forestry and geothermal guidelines",
    source: "Telluride Times",
    date: "September 18, 2026",
    firstSeen: "2026-09-18",
    newsTopic: "land-use",
    copy: "San Miguel County's Planning Commission is updating its Land Use Code to add clearer rules for forestry, deep geothermal, and oil and gas operations. Logging here is mostly wildfire mitigation work now, and the new forestry rules will require impact studies and mitigation plans. Deep geothermal gets its own regulations for the first time, including 1,000-foot setbacks from homes.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_1b88d130-afc4-4d6a-8e61-b2cd08f17dde.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/9f/79f7f561-8405-42c3-a401-743ee2563b25/6aa9ec6c74d7b.image.jpg",
    imgHiRes: true
  },
  {
    title: "Many hands made Wright’s work",
    source: "Telluride Times",
    date: "September 18, 2026",
    firstSeen: "2026-09-18",
    newsTopic: "arts-culture",
    copy: "Norwood's Pioneer Day falls on Sept. 26, with Jeanne and Gary Yamnitz serving as queen and king. Jeanne's family, the Jacobs, are among the original homesteaders on Wright's Mesa, and the day's theme honors the generations who built the area. Events run from the morning parade and coronation through a chuckwagon dinner, car show, and evening dance at The Livery.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_bf1f0b44-8c66-4cf4-b367-cf0922201fcd.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/8d/48dcb000-7d10-476a-afa2-f96d79e31a52/6aa95900a826f.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘BluesKites’ take flight",
    source: "Telluride Times",
    date: "September 18, 2026",
    firstSeen: "2026-09-18",
    newsTopic: "arts-culture",
    copy: "Kite artist Terry Zee Lee and the Music Maker Foundation have partnered again to bring \"BluesKites\" to Telluride's Brews & Blues Festival — 13 rokkaku-style kites, each honoring a blues musician, moving from the Wilkinson Library to the festival's main stage and Hanley Rink. MMF has attended Blues & Brews for over a decade, this year bringing Albert White, Terry \"Harmonica\" Bean, and Little Willie Farmer to perform.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_44067934-4416-4e1c-8f55-74561270b8d3.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/aa/0aa5e7c0-79b8-46f7-8557-ac57a208d70f/6aa907518c55d.image.jpg",
    imgHiRes: true
  },
  {
    title: "Miners pinch Panthers, break Bulldogs",
    source: "Telluride Times",
    date: "September 17, 2026",
    firstSeen: "2026-09-17",
    newsTopic: "community",
    copy: "Telluride boys soccer beat Delta 4-3 on a late first-half header by Miles Silbergeld, then rolled past Moffat County 7-1 two days later — their fourth straight win. Abi Clarke scored a hat trick and Henry Raible added three assists in the Moffat game. The Miners (5-1-0) open league play Thursday at Crested Butte.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_94b68265-db9d-4d05-82d1-9d493a4b1ec5.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/ee/1eec3443-4cc2-487c-aad4-3cf9b0688ddb/6aab7493af712.image.jpg",
    imgHiRes: true
  },
  {
    title: "Mountain Village Town Council selects finalists for town manager",
    source: "Telluride Times",
    date: "September 17, 2026",
    firstSeen: "2026-09-17",
    newsTopic: "government",
    copy: "Four finalists are in the running for Mountain Village town manager: William Bell (Montrose), Michael Bouchard (Denver), Candace Bryans (Buena Vista), and Mark Sohaney (Boca Raton). Interviews are Sept. 24–25, with a public Meet & Greet Thursday evening, 6–7:30 p.m., at Town Hall Council Chambers.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_4769a005-65fd-4c02-930d-b7e6c900c7ed.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/a1/aa1a2513-c768-4604-b40b-7b12ed1d906b/6aac355bf32b5.image.jpg",
    imgHiRes: true
  },
  {
    title: "Heather King is Norwood Fire’s interim chief",
    source: "Telluride Times",
    date: "September 17, 2026",
    firstSeen: "2026-09-17",
    newsTopic: "public-safety",
    copy: "Heather King, formerly NFPD's deputy chief of EMS and a Norwood local since her military days, was appointed interim fire chief in a 3-1 board vote on Sept. 1 — the first woman to hold that role in San Miguel County. She steps in following John Bockrath's resignation and is expected to serve six to nine months while the board searches for a permanent chief.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_a9784aa0-4dec-4e29-97b7-ae1562fd3025.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/62/96225222-0ba8-4eb3-a7d9-ba18606d3422/6aa955498d9ed.image.jpg",
    imgHiRes: true
  },
  {
    title: "CHALKBOARD Week of Sept. 17-23",
    source: "Telluride Times",
    date: "September 17, 2026",
    firstSeen: "2026-09-17",
    newsTopic: "community",
    copy: "Birthdays, meetings, and recurring events for the week of Sept. 17–23 in the Norwood/San Miguel area. Regulars include the Farmers Market (Thursdays through mid-October), Senior Meals, Food Pantry, Pickleball, AA, Free Legal Aid, and more. Contact details and schedules are listed for each.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_873e6b09-0bfd-4def-a30e-cda0a405cb76.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/fd/afd1159e-855a-4ebb-833f-4b60e7d4681e/6aa95a5d42e94.image.jpg",
    imgHiRes: true
  },
  {
    title: "Unknown Legend: Daniel Donato's Cosmic Country",
    source: "Telluride Times",
    date: "September 17, 2026",
    firstSeen: "2026-09-17",
    newsTopic: "arts-culture",
    copy: "Nashville guitarist Daniel Donato makes his Telluride debut Thursday at the Sheridan Opera House as part of the Bal De Maison kickoff for the 32nd Blues & Brews Festival. Donato's band Cosmic Country blends psychedelic, country, and jam styles, rooted in years playing honky-tonk at Robert's Western World. He recently released a live double-venue album, \"Ryman to Robert's.\"",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_6b9c33cc-4984-451b-8a5f-9330d85ade94.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/09/a09bff13-ad6c-423a-8d36-2b9933773923/6aa8f22024187.image.jpg",
    imgHiRes: true
  },
  {
    title: "Commissioner Brown endorses Covault",
    source: "Telluride Times",
    date: "September 17, 2026",
    firstSeen: "2026-09-17",
    newsTopic: "government",
    copy: "San Miguel County Commissioner Anne Brown has publicly endorsed Sheriff Dan Covault for the November election, saying she now wants to be fully transparent after holding back some of her reasoning when commissioners appointed him in April 2025. She favors Covault over challenger Lane Masters, citing his decades of local law enforcement experience and collaborative leadership style.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_4dbaa9ca-00a2-4b40-87d4-3e7100abdbf8.html",
    img: "",
    letterAuthor: "Anne Brown San Miguel County Commissioner, District 1",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Legals and Public Notices for Sept. 17-23, 2026",
    source: "Telluride Times",
    date: "September 17, 2026",
    firstSeen: "2026-09-17",
    newsTopic: "public-safety",
    copy: "Mountain Village is auctioning off gondola cabins, with bids due September 30. Separately, the Telluride Hospital District holds a public budget hearing September 24 for its 2027 proposed budget. TMV is also seeking wildfire mitigation bids for Village Court Apartments, with work starting October 2026.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/legals/article_6e1025d7-5ad7-45a9-8530-2bda61ea94b8.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Town of Telluride to Lift All Fire Restrictions",
    source: "Town of Telluride",
    date: "September 17, 2026",
    newsTopic: "public-safety",
    copy: "(September 16, 2026) – Following improved fire conditions across the region and in alignment with San Miguel County, the Town of Telluride will lift all fire restrictions effective at 12:01 a.m. MT on Friday, September 18, 2026.",
    href: "https://www.telluride.gov/CivicAlerts.aspx?aid=405",
    img: ""
  },
  {
    title: "Town Council Proclaims September 7-11 Black Bear Safety Week",
    source: "Town of Telluride",
    date: "September 3, 2026",
    newsTopic: "government",
    copy: "(September 3, 2026) — Town Council on Tuesday proclaimed September 7-11 Black Bear Safety Week, arriving in a year when a dry spring and summer have left black bears across Colorado with far less to eat in the wild.",
    href: "https://www.telluride.gov/CivicAlerts.aspx?aid=404",
    img: "https://www.telluride.gov/ImageRepository/Document?documentID=15663"
  },
  {
    title: "Chief Deputy Clerk Receives Excellence in Election Service Award",
    source: "San Miguel County",
    date: "September 25, 2026",
    newsTopic: "government",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1413",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14817"
  },
  {
    title: "Planning Director Kaye Simonson Retires After Nearly Eight Years with the County",
    source: "San Miguel County",
    date: "September 25, 2026",
    newsTopic: "community",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1418",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14827"
  },
  {
    title: "Another San Miguel Basin Fair in the Books",
    source: "San Miguel County",
    date: "September 25, 2026",
    newsTopic: "community",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1416",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14822"
  },
  {
    title: "New Faces and a Fond Farewell for Parks + Open Space",
    source: "San Miguel County",
    date: "September 25, 2026",
    newsTopic: "recreation",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1417",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14826"
  },
  {
    title: "County Housing Efforts Continue on Multiple Fronts",
    source: "San Miguel County",
    date: "September 24, 2026",
    newsTopic: "housing",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1415",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14821"
  },
  {
    title: "San Miguel County Adds Genasys Protect to Emergency Alerting Ecosystem",
    source: "San Miguel County",
    date: "September 24, 2026",
    newsTopic: "public-safety",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1414",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14820"
  },
  {
    title: "Safe Festivals - A Public Health Approach to Harm Reduction",
    source: "San Miguel County",
    date: "September 23, 2026",
    newsTopic: "health",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1411",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14818"
  },
  {
    title: "SMC Expands Crisis Intervention Services with Paragon Behavioral Health Connections",
    source: "San Miguel County",
    date: "September 22, 2026",
    newsTopic: "health",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1412",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14816"
  },
  {
    title: "Commissioners Finalize Deed Restriction Reversion Process",
    source: "San Miguel County",
    date: "September 22, 2026",
    newsTopic: "housing",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1410",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14812"
  },
  {
    title: "San Miguel County Public Health Introduces “Free Care Boxes” at Local Libraries",
    source: "San Miguel County",
    date: "September 10, 2026",
    newsTopic: "health",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1409",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14790"
  },
  {
    title: "Two Domestic Pets in San Miguel County Test Positive for the Plague",
    source: "San Miguel County",
    date: "September 3, 2026",
    newsTopic: "community",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1407",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14762"
  },
  {
    title: "Courthouse Office Closures Tuesday 9/29 - Friday 10/2",
    source: "San Miguel County",
    date: "September 29, 2026",
    newsTopic: "community",
    copy: "The Clerk + Recorder closes Weds 9/30 at 1:30 p.m. and reopens Thurs at 7:30 a.m. They will be closed Friday. The Treasurer's Office has closed early and will remain closed Weds 9/30 - Friday 10/2. They reopen at 7:30 a.m. on Monday, 10/5.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=548",
    img: ""
  },
  {
    title: "DMV Services available in Egnar 11/18",
    source: "San Miguel County",
    date: "September 29, 2026",
    newsTopic: "community",
    copy: "Attention, West Enders! The DMV will be coming to visit on Wednesday, November 18th, at the Firehouse in Egnar. No appointment necessary. Mark your calendars and save yourself a drive, we'll see you there! Questions? 970-728-3954.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=547",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14832"
  },
  {
    title: "Tomboy Road Now Open",
    source: "San Miguel County",
    date: "September 18, 2026",
    newsTopic: "infrastructure",
    copy: "The Town of Telluride has completed their project that necessitated the closure of Lower Tomboy Road. The road is now open again.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=546",
    img: ""
  },
  {
    title: "Water Restrictions in Place",
    source: "Town of Telluride",
    date: "September 11, 2026",
    newsTopic: "community",
    copy: "The Town of Telluride implemented outdoor water restrictions effective Tuesday, March 31, 2026, in response to anticipated dry spring and summer conditions and below-average snowpack. The Town will continue to monitor conditions closely.",
    href: "https://www.telluride.gov/AlertCenter.aspx?AID=45",
    img: ""
  },
  {
    title: "Ridgway Urges Motorists to Slow Down and Stay Alert",
    source: "Town of Ridgway",
    date: "September 28, 2026",
    firstSeen: "2026-09-29",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Slow-Down-Press-Release-2026-09-28.pdf",
    img: ""
  },
  {
    title: "Ridgway Seeking Volunteers for Ad Hoc Review Committee",
    source: "Town of Ridgway",
    date: "September 24, 2026",
    firstSeen: "2026-09-29",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/CGP-Review-Committee-Press-Release-2026-09-24.pdf",
    img: ""
  },
  {
    title: "Repair Work on Clinton Street to Take Place This Week and Next",
    source: "Town of Ridgway",
    date: "September 23, 2026",
    firstSeen: "2026-09-29",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Clinton-road-work-9-23-2026.pdf",
    img: ""
  },
  {
    title: "Ridgway Reminds Property Owners about Backflow Prevention and Cross Connection Control",
    source: "Town of Ridgway",
    date: "September 22, 2026",
    firstSeen: "2026-09-29",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Backflow-Testing-Reminder-Press-Release-2026-09-22.pdf",
    img: ""
  },
  {
    title: "Town of Ridgway Water Supply Element Draft Now Available for Review and Comment",
    source: "Town of Ridgway",
    date: "September 21, 2026",
    firstSeen: "2026-09-29",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/CO-Ridgway-Water-Supply-Element-Draft-091826.pdf",
    img: ""
  },
  {
    title: "New Compost Collection Service Offered",
    source: "Town of Ridgway",
    date: "September 18, 2026",
    firstSeen: "2026-09-29",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Compost-Service-Press-Release-2026-09-18.pdf",
    img: ""
  },
  {
    title: "Sidewalk Repair Work Planned Near Ridgway Post Office",
    source: "Town of Ridgway",
    date: "September 17, 2026",
    firstSeen: "2026-09-29",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Sidewalk-Repair-Work-Press-Release-2026-09-17.pdf",
    img: ""
  },
  {
    title: "Notice and Call of 2027 Fiscal Year Budget Meetings of the Ridgway Town Council - Notice dated September 10, 2026",
    source: "Town of Ridgway",
    date: "September 30, 2026",
    firstSeen: "2026-09-29",
    newsTopic: "government",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Budget-meetings-notice-2026.pdf",
    img: ""
  },
  {
    title: "Notice of Change of November Meeting Date for the Ridgway Town Council - Notice dated September 10, 2026",
    source: "Town of Ridgway",
    date: "September 30, 2026",
    firstSeen: "2026-09-29",
    newsTopic: "government",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Change-of-meeting-date-Council-notice.pdf",
    img: ""
  },
  {
    title: "Fire Restrictions Lifted in Ridgway",
    source: "Town of Ridgway",
    date: "September 17, 2026",
    firstSeen: "2026-09-29",
    newsTopic: "public-safety",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Fire-Restrictions-Lifted-in-Ridgway-2026-09-17.pdf",
    img: ""
  }
];

const KOTO_NEWSCASTS = [
  {
    title: "Newscast 9-16-26",
    source: "KOTO Community Radio",
    date: "September 17, 2026",
    newsTopic: "arts-culture",
    copy: "Mountain Village Announces Finalists for New Town Manager; Telluride Opens Flock Camera Discussion; Cowboy Heritage and Poetry Shine in the West End",
    href: "https://koto.org/news/newscast-9-16-26/"
  }
];

const KOTO_FEATURED_STORIES = [
  {
    title: "Cowboy Heritage and Poetry Shine in the West End",
    source: "KOTO Community Radio",
    date: "September 17, 2026",
    newsTopic: "arts-culture",
    copy: "Cowboy poets and songwriters took the stage at the 10th Annual West End Cowboy Gathering. Performers from across the southwest flocked to Nucla to share their work with the community.",
    href: "https://koto.org/news/cowboy-heritage-and-poetry-shine-in-the-west-end/"
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
    title: "Nucla volleyball girls make memories on, off court",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "September 23, 2026",
    firstSeen: "2026-09-23",
    dateSource: "article",
    newsTopic: "education",
    copy: "Nucla's girls volleyball team is 4-6 on the season with 23 players and six seniors leading the roster under coach Debbie Wytulka, now in her 28th year. The team has shown improvement in tournaments and recently launched a Big Sister–Little Sister mentorship program connecting high school and middle school players. Games continue through October, with a league tournament on Halloween weekend and Regionals set for Nov. 8.",
    claudeSummary: true,
    href: "https://www.sanmiguelbasinforum.com/stories/nucla-volleyball-girls-make-memories-on-off-court,130194",
    img: "https://zeta.creativecirclecdn.com/smb/original/20260921-165714-8ef-youth%20vball.jpeg"
  },
  {
    title: "Hughes climbs Lizard Head",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "September 16, 2026",
    firstSeen: "2026-09-16",
    dateSource: "article",
    newsTopic: "recreation",
    copy: "Norwood native Wyatt Hughes — who summited Everest earlier this year — climbed Lizard Head, Colorado's hardest 13er, on Labor Day weekend with Eric Ahlstedt of Durango. The volcanic spire south of Telluride is considered unstable and very advanced; the pair took the Mark of Zorro summit pitch and were back down in six or seven hours. Hughes has now completed Colorado's Centennial list and has K2 in his sights for 2028.",
    claudeSummary: true,
    href: "https://www.sanmiguelbasinforum.com/stories/hughes-climbs-lizard-head,129262",
    img: "https://zeta.creativecirclecdn.com/smb/original/20260914-145938-24a-F1%20-%20lizard%20head.jpg"
  },
  {
    title: "OJT calls for Idea Factory applications from West End",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "September 14, 2026",
    firstSeen: "2026-09-14",
    dateSource: "article",
    newsTopic: "community",
    copy: "Colorado's Office of Just Transition is recruiting West End residents for its Idea Factory program — a free, four-week business training that runs Sept. 30–Oct. 21. Former coal workers can also access up to $11,250 in dedicated funding. Applications are open past the Sept. 18 priority deadline.",
    claudeSummary: true,
    href: "https://www.sanmiguelbasinforum.com/stories/ojt-calls-for-idea-factory-applications-from-west-end,129253",
    img: ""
  },
  {
    title: "Norwood beats PV 46-14; coach said it’s a talented roster",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "September 9, 2026",
    firstSeen: "2026-09-09",
    dateSource: "article",
    newsTopic: "community",
    copy: "The Norwood Mavericks, a combined team drawing from Norwood, Nucla, and two Telluride players, are 1-1 after beating Plateau Valley 46-14 and dropping their opener to Hayden 30-38. Coach says this is the most talented roster he's had, crediting a five-year stable coaching staff and a community-run weight program. The team has 15 seniors and plays Monticello next.",
    claudeSummary: true,
    href: "https://www.sanmiguelbasinforum.com/stories/norwood-beats-pv-46-14-coach-said-its-a-talented-roster,128647",
    img: "https://zeta.creativecirclecdn.com/smb/original/20260908-144745-cd8-IMG_0003.jpeg"
  },
  {
    title: "Coach celebrates baseball awards, optimistic about 2027",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "September 2, 2026",
    firstSeen: "2026-09-02",
    dateSource: "article",
    newsTopic: "community",
    copy: "Norwood's Mustang baseball program picked up five conference honors and four All-State awards this season, with Cole Bray, Jackson McCabe, Jace Bonacquista, Daniel Zunich, Jacob Davis, and Brycen Rummel all recognized. Coach Randy Gabriel was named San Juan Basin League Coach of the Year. He's looking ahead to 2027 with a big senior class returning and tougher competition on the schedule.",
    claudeSummary: true,
    href: "https://www.sanmiguelbasinforum.com/stories/coach-celebrates-baseball-awards-optimistic-about-2027,128026",
    img: ""
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
    title: "The Town Wrote the Rules, and Apparently, They’re for Everyone Else",
    date: "Sep 27, 2026",
    href: "https://livabletelluride.org/digest/one-off/carhenge-rules-2026-09-27.html",
    image: "https://livabletelluride.org/assets/Carhenge/carhenge-site-plan-buildings.jpg?v=20260927",
    excerpt: "On September 30, the Town’s design proposal for Carhenge goes before HARC, and the Town of Telluride remains the applicant, asking the Town of Telluride to approve its development. The Town’s plan now calls for 220 units. The 1979 subdivision agreements that created Backman Village, which the Town signed, allow a maximum of 157. For three months, Backman Village owners have asked the Town one question, and all we hear is crickets.",
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
    title: "Yin Yang Yoga with Miriah",
    link: "https://koto.org/event/yin-yang-yoga-with-miriah-2/2026-09-17/",
    description: "Yin Yang yoga is a combination of Vinyasa Flow (yang) incorporating Hatha and Kundalini with Yin Restorative poses. We'll be warming up with some movement and Vinyasa flow and settle into longer yin restorative poses. Best of both worlds. Bring your own mat if you can; the library has a limited supply. This class is free and open to the public of all skill levels. Donations to the instructor are welcome. Miriah has been local to Telluride area for over ten years and have been teaching yoga for six years. She owns her own herbal business, makes herbal products and co-hosts a weekly podcast. She also is an avid snowboarder, photographer, sticker artist and comedian.",
    pubDate: "2026-09-17T09:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/MIRIAH-2.png"
  },
  {
    title: "Tennis Clinic 3.0-4.0",
    link: "https://koto.org/event/tennis-clinic-3-0-4-0/2026-09-17/",
    description: "This is the TRC flagship Tennis Clinic. Courts will be divided based on level and experience. For players rated below 3.0, please sign up for a private lesson or join the 2.0 – 3.0 clinic. For more advanced players, we offer an advanced 4.0+ clinic. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-17T09:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Tennis Clinic 4.0+",
    link: "https://koto.org/event/tennis-clinic-4-0/2026-09-17/",
    description: "Players must have a USTA rating above 4.0 (intermediate/advanced) Strong shot anticipation and ball control are essential. Consistent second serves are required. Must have a solid and established strategy. Comfortable competing under high-stress conditions. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-17T11:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Pilates for All Bodies with Laura",
    link: "https://koto.org/event/pilates-for-all-bodies-with-laura-2/2026-09-17/",
    description: "Join Laura Colbert for Pilates for All Bodies every Thursday from 12:30-1:15pm. This program is free and open to the public. All bodies and experience levels are welcome. The library has a few mats, but bring your own if you can.",
    pubDate: "2026-09-17T12:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "TRC Men's Tennis Singles",
    link: "https://koto.org/event/trc-mens-tennis-singles/2026-09-17/",
    description: "The 1st TRC Men's Singles League! Sign up on a week-to-week basis. No long-term commitment.",
    pubDate: "2026-09-17T16:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Local Legends Blues & Brews Kick Off",
    link: "https://koto.org/event/local-legends-blues-brews-kick-off/",
    description: "Join Ah Haa School for the Arts in partnership with Telluride Blues & Brews Festival for Local Legends, a beer tasting and food pairing on Ah Haa's Sky Deck! Telluride's own local legends, Telluride Brewing Co will host iconic breweries for a special tasting paired with delicious bites! Sample seasonal styles while hearing from the makers and learning about craft beer straight from the source! Guests will enjoy live music from Nigel Wearne, the 2025 Telluride Blues Challenge Winner! Get your tickets at ahhaa.org – all proceeds benefit Ah Haa!",
    pubDate: "2026-09-17T17:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Ah Haa School for the Arts, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/09/Local-legends-poster-26sm.png"
  },
  {
    title: "West End Trail Running",
    link: "https://koto.org/event/west-end-trail-running-2/2026-09-17/",
    description: "Learn the fundamentals of trail running while exploring trails in the West End. The course is offered Sept. 8 through October 30th. The practice schedule is 8:15 to 9 a.m. on Tuesdays and 5 to 6 p.m. on Thursdays. Ages 10-14 and teens & adults 15 and older are welcome to participate. Contact director Alicia O'Connel at montrosewestrec@gmail.com or text her at 302-690-0160 for more information, including a nominal registration fee.",
    pubDate: "2026-09-17T17:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Volunteer Trail Work Day: Deep Creek Trail",
    link: "https://koto.org/event/volunteer-trail-work-day-deep-creek-trail/",
    description: "Join Telluride Mountain Club for a day of maintaining trails! Spend time with friends, get your hands dirty, and help care for the trails we all love. Projects may include clearing debris, improving drainage, and general maintenance to keep our trails safe and sustainable. Please bring water, a snack, closed-toed shoes, sunglasses, a long-sleeved shirt, and pants.",
    pubDate: "2026-09-17T17:15:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/09/Vol-Trail-Work-499x624-1.png"
  },
  {
    title: "Salon Night at Telluride Arts HQ",
    link: "https://koto.org/event/salon-night-at-telluride-arts-hq/2026-09-17/",
    description: "Salon Nights are inspired by the legendary Parisian salons—those lively gatherings where artists, thinkers, and dreamers came together to meet up, debate, collaborate, and inspire. We’re bringing that spirit into the present and rooting it here in Telluride. These are evenings for conversation and connection, not lectures or formal programming. They are casual, open, and intentionally unstructured, designed to create the atmosphere where ideas can collide, new friendships form, and creativity sparks. Imagine an evening where musicians talk with writers, painters meet photographers, filmmakers share stories with ceramicists—and the unexpected happens!",
    pubDate: "2026-09-17T17:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Arts HQ, TELLURIDE",
    imageUrl: "https://koto.org/wp-content/uploads/2025/12/Screenshot-2025-12-17-at-4.37.19-PM.png"
  },
  {
    title: "Authors Uncovered: K.B. Brodsky",
    link: "https://koto.org/event/authors-uncovered-k-b-brodsky/",
    description: "Join Karen and Bill Brodsky part-time locals and husband & wife author duo (K.B. Brodsky) as they discuss their newest novel, Beyond Honor at the library on Thursday, September 17th at 5:30pm. A paramilitary operative confronting his grief on a path of retribution. A CIA analyst hunting a conspiracy that leads to the Oval Office. A Russian agent hiding in plain sight. Jason Matthews’s Red Sparrow meets Jack Carr’s The Terminal List in Beyond Honor, a debut political thriller that plunges readers into a world of international espionage, where loyalty and duty are tested.",
    pubDate: "2026-09-17T17:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/Brodsky-Beyond-Honor.png"
  },
  {
    title: "Facing the Mourning",
    link: "https://koto.org/event/facing-the-mourning/2026-09-17/",
    description: "Facing the Mourning is a free, four-week grief support series taking place every Thursday throughout September. When: Thursdays in September at 6:00 PM Where: Redvale Community Center Cost: Free The series is open to anyone who may benefit from additional support while navigating grief and loss. Please feel free to share this information with others who may be interested.",
    pubDate: "2026-09-17T18:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Redvale Community Center",
    imageUrl: ""
  },
  {
    title: "Blues & Brews Beer Pairing Dinner",
    link: "https://koto.org/event/blues-brews-beer-pairing-dinner/",
    description: "As Telluride settles into Blues & Brews weekend, gather around the table for an evening devoted to the art of craft brewing. On Thursday, September 17, 2026, enjoy a five-course dinner paired with exceptional beers from featured breweries, beginning with a festival-exclusive welcome pour. Between courses, brewers share the inspiration and process behind each selection, offering a rare opportunity to experience the festival through the people who shape it. Accompanied by the soulful sounds of Myron Elkins, whose honest songwriting draws from the traditions of country, blues, and American roots music, the evening unfolds at an unhurried pace—one meant for lingering conversations, shared discoveries, and raising a glass to the weekend ahead.",
    pubDate: "2026-09-17T18:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "The Madeline Hotel, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/09/blues-dinner-1.png"
  },
  {
    title: "Tennis Clinic 3.0-4.0",
    link: "https://koto.org/event/tennis-clinic-3-0-4-0/2026-09-18/",
    description: "This is the TRC flagship Tennis Clinic. Courts will be divided based on level and experience. For players rated below 3.0, please sign up for a private lesson or join the 2.0 – 3.0 clinic. For more advanced players, we offer an advanced 4.0+ clinic. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-18T09:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Up-off Gymnastics, Dance, and Spanish",
    link: "https://koto.org/event/up-off-gymnastics-dance-and-spanish/2026-09-18/",
    description: "We are a MOBILE family business offering non-competitive Gymnastics, Preschool Spanish, & Dance classes to the San Miguel County area. Tia Uphoff was a competitive gymnast and an instructor for 20+ years, helping children develop balance, flexibility, strength and proper tumbling techniques while using positive reinforcement and encouragement for success. Infant to Age 5 — Padres & Pequenos Class – $10.00 per class This class invites adults & kids to participate in Educational songs, in English & Spanish, with intro to gymnastics. Sign up at any time and get started weekly. Fridays — 11:15-11:40 am @ Lone Cone Library Norwood K to 3rd Grade week Session 8 Week Winter Session $150 for the 8 sessions. Thursdays – 430-530 pm @ Lone Cone Library Norwood For more information and to register: Contact Tia @ liv2danz247@gmail.com or find us on Facebook!",
    pubDate: "2026-09-18T10:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Lone Cone Library Norwood",
    imageUrl: "https://koto.org/wp-content/uploads/2025/06/Messenger_creation_3FA37E27-C0AC-4E9D-ABF5-592710E68D81.jpeg"
  },
  {
    title: "Ridgway Farmer's Market",
    link: "https://koto.org/event/ridgway-farmers-market/2026-09-18/",
    description: "A weekly outdoor market held Fridays from May through mid-October at Hartwell Park in downtown Ridgway, featuring local produce, artisan vendors, and live music on the last Friday of each month. The September 19th market runs from 10 a.m. to 2 p.m.\n\n---\n**Note:** The date in the event data (September 18, 2026) is a Friday, so I used the series details as provided — but double-check the specific date, as the existing description's pattern and the listed date should be confirmed to align.",
    pubDate: "2026-09-18T10:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Hartwell Park Ridgway",
    imageUrl: ""
  },
  {
    title: "Telluride Farmer's Market",
    link: "https://koto.org/event/telluride-farmers-market/2026-09-18/",
    description: "We are an organic market in the heart of beautiful downtown Telluride, CO. Our 2026 Market is every Friday from May 29 – October 9th! We provide the highest quality produce, animal products, prepared food, and artisans. All of our goods are produced within 100 miles of Telluride, so you can feel good about shopping local. From late May through early October, you can find us on South Oak Street in downtown Telluride selling the best of Southwest Colorado from 10:30am to 3:30pm.",
    pubDate: "2026-09-18T10:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Oak Street Plaza, Telluride",
    imageUrl: ""
  },
  {
    title: "Tennis Clinic 4.0+",
    link: "https://koto.org/event/tennis-clinic-4-0/2026-09-18/",
    description: "Players must have a USTA rating above 4.0 (intermediate/advanced) Strong shot anticipation and ball control are essential. Consistent second serves are required. Must have a solid and established strategy. Comfortable competing under high-stress conditions. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-18T11:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Crystal Festival – A Rock, Mineral, Gem, & Crystal Show",
    link: "https://koto.org/event/crystal-festival-a-rock-mineral-gem-crystal-show/",
    description: "Join us for two incredible days celebrating rocks, minerals, fossils, gems, crystals, jewelry, and more at the Crystal Festival! 📅 September 19th and 20th, 2026 🕰️10am to 8pm both days 📍 Telluride Conference Center – Mountain Village, Colorado Whether you’re a seasoned collector, a crystal enthusiast, a geology lover, or simply looking for a fun family outing, there’s something for everyone! ✨ Shop from amazing vendors featuring: • Crystals & Minerals • Fossils & Dinosaur Fossils • Gemstones & Jewelry • Meteorites • Handmade Art & Gifts • Metaphysical Items • Home Décor • Much More! 🔨 Enjoy hands-on activities, educational displays, and discover the fascinating stories behind Earth’s natural treasures. Meet knowledgeable vendors, learn about geology, and find unique pieces to add to your collection. 👨‍👩‍👧‍👦 Family-friendly fun for all ages! …",
    pubDate: "2026-09-19T00:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Conference Center, Mountain Village",
    imageUrl: "https://koto.org/wp-content/uploads/2026/09/bozeman-Crystal-Festival-.jpg"
  },
  {
    title: "Wild Roots Revival",
    link: "https://koto.org/event/wild-roots-revival/",
    description: "The Wild Roots Revival is a gathering highlighting the interconnection between mind, body, spirit, and nature. A mini-retreat on the west end centered around setting intentions for the Fall Equinox. Join us Saturday at the Livery in Norwood for a full day of deep community and inner exploration. On Sunday we will ground down our experience by hiking together and exploring poetry in the surrounding wilderness of Busted Arm Draw, a 20 min drive outside of Norwood. Presenters include Marie Green, Annika Kristianson, Julie Maynard, Wolf Nentwich, Ellen Metrick, Ian Wilson, Kristi Allred, and Erin Dann.",
    pubDate: "2026-09-19T08:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "The Livery Norwood",
    imageUrl: "https://koto.org/wp-content/uploads/2026/09/Wild-Roots-Revival-Meadowlark.jpg"
  },
  {
    title: "Zumba with Gise",
    link: "https://koto.org/event/zumba-with-gise/2026-09-19/",
    description: "Ditch the workout and join the party! Zumba® is a high-energy dance fitness class that mixes low-intensity and high-intensity moves for an interval-style, calorie-burning workout. Driven by Latin and international rhythms like salsa, merengue, reggaeton, and cumbia, you will tone your body and boost your endurance without even realizing how hard you are working. It is exercise in disguise! No dance experience is required—just bring your energy, a water bottle, and a smile. This class is free and open to the public, but donations for the instructor are always welcome. ¡Olvida el entrenamiento y únete a la fiesta! Zumba® es una clase de fitness de baile de alta energía que mezcla movimientos de baja y alta intensidad para un entrenamiento de estilo de intervalos que quema calorías. …",
    pubDate: "2026-09-19T10:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/zumba-gise.png"
  },
  {
    title: "Gaiascope Saturday Sessions",
    link: "https://koto.org/event/gaiascope-saturday-sessions/2026-09-19/",
    description: "Experience artist Brooke Einbender's Gaiascope installation in Mountain Village's Heritage Plaza every Saturday evening in September, with live DJ sets from 7-10 p.m. presented by Telluride Arts, TMVOA and Mindbender Studio.",
    pubDate: "2026-09-19T19:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Heritage Plaza, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Blues Brunch",
    link: "https://koto.org/event/blues-brunch/",
    description: "Gather at Black Iron Kitchen + Bar for a Sunday brunch where mountain mornings and live music set the tone. From 7:00AM to 3:00PM, enjoy a specialty à la carte brunch menu, accompanied by a live performance by Ken Valdez from 10:00AM to 12:00PM. Originally from Santa Fe, Valdez brings a soulful voice and expressive guitar style shaped by blues, rock, funk, and Latin influences. It's an easygoing morning of seasonal flavors, meaningful conversation, and music that carries the spirit of Blues & Brews beyond the festival stage.",
    pubDate: "2026-09-20T10:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Black Iron Kitchen + Bar, TELLURIDE",
    imageUrl: "https://koto.org/wp-content/uploads/2026/09/blues-brunch.png"
  },
  {
    title: "Gentle Yoga with Kristen Milord",
    link: "https://koto.org/event/gentle-yoga-with-kristen-milord/2026-09-20/",
    description: "Breathe, stretch, and reset with gentle yoga taught by Kristen Milord, Sundays from 11:00 am to 12:00 pm. This free, accessible class is open to all levels—no prior experience needed. Feel free to bring your own mat, or the library also has mats, bolsters, blocks and blankets available to use. This class if free, but donations to support the instructor are welcome.",
    pubDate: "2026-09-20T11:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/gentle-yoga-kristen.png"
  },
  {
    title: "Drop In Tech Time with Oliver",
    link: "https://koto.org/event/drop-in-tech-time-with-oliver-2/2026-09-20/",
    description: "Drop by the 2nd floor desk for Tech Time with Oliver every Sunday from 1-3pm. Bring your questions about technology (phones, tablets, laptops, email, etc.) or learn about special collections the library offers, such as the Kindles, iPads, and laptops our patrons can check out as well as the library apps you can download to your devices to access free ebooks, audiobooks, movies, music, magazines and more!",
    pubDate: "2026-09-20T13:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Glow with the Flow",
    link: "https://koto.org/event/glow-with-the-flow/",
    description: "Skin Care through Life's Stages: Britt Bradford is a botanical skin care formulator,That will show and share how to make a botanical skin care solution that works with wherever we are right now. Do you have a baby, do you have a teen, are you experiencing peri-menopause symptoms, there is something for everyone so you can glow with the flow.",
    pubDate: "2026-09-20T13:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/glow.jpg"
  },
  {
    title: "Tea and Tarot",
    link: "https://koto.org/event/tea-and-tarot/2026-09-20/",
    description: "Tea and Tarot Sessions with Jade Rose and others from Sanctuary Collective in the Telluride Room. Seating is limited; please sign up at telluridelibrary.org in advance.",
    pubDate: "2026-09-20T14:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/tea-1.jpg"
  },
  {
    title: "Book Buzz w/The Pour Over Pedaler",
    link: "https://koto.org/event/book-buzz-w-the-pour-over-pedaler/",
    description: "Get the scoop on the hottest new titles at the library during Book Buzz! Discover upcoming releases, hidden gems, and staff favorites while enjoying a complimentary handcrafted coffee from Luke of The Pour Over Pedaler. Come sip, socialize, and leave with your next great read!",
    pubDate: "2026-09-21T09:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/book-buzz-13-1.png"
  },
  {
    title: "Tennis Clinic 3.0-4.0",
    link: "https://koto.org/event/tennis-clinic-3-0-4-0/2026-09-21/",
    description: "This is the TRC flagship Tennis Clinic. Courts will be divided based on level and experience. For players rated below 3.0, please sign up for a private lesson or join the 2.0 – 3.0 clinic. For more advanced players, we offer an advanced 4.0+ clinic. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-21T09:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Tennis Clinic 4.0+",
    link: "https://koto.org/event/tennis-clinic-4-0/2026-09-21/",
    description: "Players must have a USTA rating above 4.0 (intermediate/advanced) Strong shot anticipation and ball control are essential. Consistent second serves are required. Must have a solid and established strategy. Comfortable competing under high-stress conditions. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-21T11:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Book Talk: Clotilda",
    link: "https://koto.org/event/book-talk-clotilda/",
    description: "Join the Telluride Historical Museum and Wilkinson Public Library for a deep dive into some of the threads that make up the tapestry of Colorado's and the United States of America's history as we celebrate Colorado's 150th year as state and USA's 250th year as an independent country. This month the book discussion will be lead by Kiernan Lannon, Telluride Historical Museum Director on Monday, September 21st at 5:30 pm! The featured book is The Survivors of the Clotilda: The Lost Stories of the Last Captives of the American Slave Trade by Hannah Durkin. You can check out the book from the library or purchase to book from Between the Covers Bookstore for 10% off!",
    pubDate: "2026-09-21T17:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "West End Trail Running",
    link: "https://koto.org/event/west-end-trail-running/2026-09-22/",
    description: "Learn the fundamentals of trail running while exploring trails in the West End. The course is offered Sept. 8 through October 30th. The practice schedule is 8:15 to 9 a.m. on Tuesdays and 5 to 6 p.m. on Thursdays. Ages 10-14 and teens & adults 15 and older are welcome to participate. Contact director Alicia O'Connel at montrosewestrec@gmail.com or text her at 302-690-0160 for more information, including a nominal registration fee.",
    pubDate: "2026-09-22T08:15:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Tennis Clinic 3.0-4.0",
    link: "https://koto.org/event/tennis-clinic-3-0-4-0/2026-09-22/",
    description: "This is the TRC flagship Tennis Clinic. Courts will be divided based on level and experience. For players rated below 3.0, please sign up for a private lesson or join the 2.0 – 3.0 clinic. For more advanced players, we offer an advanced 4.0+ clinic. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-22T09:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Tennis Clinic 4.0+",
    link: "https://koto.org/event/tennis-clinic-4-0/2026-09-22/",
    description: "Players must have a USTA rating above 4.0 (intermediate/advanced) Strong shot anticipation and ball control are essential. Consistent second serves are required. Must have a solid and established strategy. Comfortable competing under high-stress conditions. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-22T11:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Lunch and Learn: Colorado Historic Newspapers",
    link: "https://koto.org/event/lunch-and-learn-colorado-historic-newspapers/",
    description: "A midday program at Wilkinson Public Library in which librarian Alison Farnham will guide attendees through the Colorado Historic Newspaper Collection and share her digitization project focused on local newspapers from the mid-1900s, including the San Miguel Journal and Deep Creek Review. Lunch will be provided, and advance registration is available at telluridelibrary.org.",
    pubDate: "2026-09-22T12:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/lunch-10.png"
  },
  {
    title: "Telluride R-1 School District Board Work Session",
    link: "https://koto.org/event/telluride-r-1-school-district-board-work-session/",
    description: "The Telluride R-1 School District Board of Education holds a work session on Tuesday, September 22nd, at 3:30 p.m. in the Bridal Veil conference room at TMHS and via Zoom. Meeting agenda & Zoom link can be found at koto.org.",
    pubDate: "2026-09-22T15:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Middle/High School, TELLURIDE",
    imageUrl: ""
  },
  {
    title: "Telluride R-1 School District Board Regular Meeting",
    link: "https://koto.org/event/telluride-r-1-school-district-board-regular-meeting/",
    description: "The Telluride R-1 School District Board of Education holds a regular meeting on Tuesday, September 22nd, at 5:15 p.m. in the Bridal Veil Conference Room at TMHS and via Zoom. The meeting agenda & Zoom link can be found at tellurideschool.org.",
    pubDate: "2026-09-22T17:15:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Middle/High School, TELLURIDE",
    imageUrl: ""
  },
  {
    title: "Tennis Clinic 3.0-4.0",
    link: "https://koto.org/event/tennis-clinic-3-0-4-0/2026-09-23/",
    description: "This is the TRC flagship Tennis Clinic. Courts will be divided based on level and experience. For players rated below 3.0, please sign up for a private lesson or join the 2.0 – 3.0 clinic. For more advanced players, we offer an advanced 4.0+ clinic. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-23T09:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Tennis Clinic 4.0+",
    link: "https://koto.org/event/tennis-clinic-4-0/2026-09-23/",
    description: "Players must have a USTA rating above 4.0 (intermediate/advanced) Strong shot anticipation and ball control are essential. Consistent second serves are required. Must have a solid and established strategy. Comfortable competing under high-stress conditions. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-23T11:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Mahjongg for Independent Players",
    link: "https://koto.org/event/mahjongg-for-independent-players-4/2026-09-23/",
    description: "Looking to enjoy an afternoon of friendly games of mah-jongg for independent players? Join us at the Library every Wednesday from 1-3pm. Bring your 2026 card if you have one, although we have plenty of loaners if you don’t! We’ll have tables, cloths, chairs, and sets. NOTE: This is not a mah-jongg lesson. A general knowledge of the game is necessary to join. Please register in advance at telluridelibrary.org if you'd like to join so we can make sure we have enough tables set up for everyone!",
    pubDate: "2026-09-23T13:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/mahj.jpg"
  },
  {
    title: "Plant Party: Ornery Orchids w/Brandon Griep",
    link: "https://koto.org/event/plant-party-ornery-orchids-w-brandon-griep/",
    description: "Brandon is back! How are your orchids doing? Bring your orchid and chat with Brandon to get the latest and greatest information on all the Ornery Orchids. We will also have some pots and soil available for your orchids.",
    pubDate: "2026-09-23T17:15:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/ornery-orchids-2.png"
  },
  {
    title: "Optimize Your Brain Health with Lifestyle Medicine",
    link: "https://koto.org/event/optimize-your-brain-health-with-lifestyle-medicine/",
    description: "A lecture at the Telluride Science & Innovation Center featuring Dr. Melissa Sundermann, a double board-certified Lifestyle Medicine physician, exploring the evidence-based connection between everyday lifestyle choices and brain health. The presentation addresses emerging research suggesting that a significant proportion of dementia cases may be preventable through lifestyle interventions.",
    pubDate: "2026-09-23T18:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Science &#038; Innovation Center, TELLURIDE",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/Brain-Health_tdotcom-2200x1237-1-scaled.jpg"
  },
  {
    title: "Coffee and Climate Conversations",
    link: "https://koto.org/event/coffee-and-climate-conversations-3/",
    description: "Coffee & Climate Conversations: Where Recreation Meets Resilience From big adventures to spending time with family and friends, recreation is often at the heart of our experiences on public lands. Join Sheep Mountain Alliance and EcoAction Partners for a discussion about recreation on our public lands alongside Telluride Mountain Club and Rico Trails Alliance. Learn more about what's next for trails in our region, and join us as we ask the questions: How do recreation and conservation intersect, and where do they diverge? How does recreation shape our community and values? And most importantly, how can you be a strong steward and advocate for public lands and climate across our region? Coffee, tea and pastries kindly provided.",
    pubDate: "2026-09-24T08:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/coffee-and-climate-7.png"
  },
  {
    title: "Yin Yang Yoga with Miriah",
    link: "https://koto.org/event/yin-yang-yoga-with-miriah-2/2026-09-24/",
    description: "Yin Yang yoga is a combination of Vinyasa Flow (yang) incorporating Hatha and Kundalini with Yin Restorative poses. We'll be warming up with some movement and Vinyasa flow and settle into longer yin restorative poses. Best of both worlds. Bring your own mat if you can; the library has a limited supply. This class is free and open to the public of all skill levels. Donations to the instructor are welcome. Miriah has been local to Telluride area for over ten years and have been teaching yoga for six years. She owns her own herbal business, makes herbal products and co-hosts a weekly podcast. She also is an avid snowboarder, photographer, sticker artist and comedian.",
    pubDate: "2026-09-24T09:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/MIRIAH-2.png"
  },
  {
    title: "Tennis Clinic 3.0-4.0",
    link: "https://koto.org/event/tennis-clinic-3-0-4-0/2026-09-24/",
    description: "This is the TRC flagship Tennis Clinic. Courts will be divided based on level and experience. For players rated below 3.0, please sign up for a private lesson or join the 2.0 – 3.0 clinic. For more advanced players, we offer an advanced 4.0+ clinic. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-24T09:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  }
];

const WILKINSON_EVENTS = [
  {
    title: "Storytime / Hora de Cuentos",
    link: "https://telluridelibrary.libcal.com/event/17514632?hs=a",
    description: "10:30 AM – 11:30 AM · English stories, songs, rhymes and fun for children of all ages and their parents or caregivers. Cuentos, canciones, rimas y diversi&oacute;n en ingl&eacute;s para ni&ntilde;os de todas las edades y sus padres o cuidadores.",
    pubDate: "2026-09-29T16:30:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Kids Area",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/data/feat_img/6460/19928/1755887187.png"
  },
  {
    title: "Teen Cook",
    link: "https://telluridelibrary.libcal.com/event/17486117?hs=a",
    description: "2:00 PM – 3:00 PM · Join the WPL Every Tuesday after school for Teen Cook. We will cook a different recipe from scratch, and have enough to share with those around!",
    pubDate: "2026-09-29T20:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Teen Area",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_08_21_15_27_00.png"
  },
  {
    title: "I Heart Art",
    link: "https://telluridelibrary.libcal.com/event/17292103?hs=a",
    description: "2:30 PM – 4:00 PM · Looking for a fun and enriching way to spend your afternoons? Join us Tuesdays for I Heart Art, designed especially for kids aged 5-12!  &iquest;Buscas una manera divertida de pasar tus tardes? &iexcl;Unete a nuestro programa extracurricular, dise&ntilde;ado especialmente para ni&ntilde;os de 5 a 12 a&ntilde;os!",
    pubDate: "2026-09-29T20:30:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Kids Area",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_07_29_17_39_32.png"
  }
];

// Bot-managed by scripts/content-refresh.js Task 7 (syncHumaneSocietyAnimals).
// Currently empty: every animal the THS Shelterluv feed lists right now is
// either pending adoption ("ADOPTION PENDING! …") or pre-weaning/photoless,
// none of which are advertised as adoptable. The sync filters those out, so
// this repopulates automatically when THS posts genuinely-available pets.
const HUMANE_SOCIETY_ANIMALS = [

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
    title: "Ken Gentry & the Companions",
    link: "https://www.alibitelluride.com/calendar#eca-event=ken-gentry-and-the-companions",
    description: "Ken Gentry & the Companions perform live at The Alibi in Telluride. The evening features a night of live music from this ensemble at one of Telluride's familiar local venues.",
    pubDate: "2026-10-01",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/5503e0b2-6da7-415a-b118-18a9e65ed3e4/-/crop/816x408/0,37/-/preview/"
  },
  {
    title: "Hanneke Cassel Trio - Telluride Chamber Music",
    link: "https://www.alibitelluride.com/calendar#eca-event=hanneke-cassel-trio-telluride-chamber-music",
    description: "The Hanneke Cassel Trio brings an evening of chamber music to The Alibi as part of Telluride Chamber Music's programming. The performance is described as a distinctive take on the chamber music tradition.",
    pubDate: "2026-10-13",
    time: "7:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/621f88b8-3a58-4663-89e9-6138fd350587/-/crop/792x317/0,907/-/preview/"
  },
  {
    title: "Seven Teller",
    link: "https://www.alibitelluride.com/calendar#eca-event=seven-teller",
    description: "Seven Teller is an art-rock project from Baltimore musician and songwriter Sam, performing a late-night show at The Alibi. This live music set begins at 9:00 PM.",
    pubDate: "2026-10-15",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/d112b5c7-3ca5-4823-8475-b543672fa388/-/crop/3078x3075/0,455/-/preview/"
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
  {
    title: "Pink Talking Fish | A Fusion of Pink Floyd, Talking Heads and Phish",
    link: "https://sheridanoperahouse.com/events/pink-talking-fish-a-fusion-of-pink-floyd-talking-heads-and-phish/",
    description: "Pink Talking Fish is a live band that performs a fusion of music from Pink Floyd, Talking Heads, and Phish, blending the catalogs of all three iconic acts into a single, seamless show. The group performs at the historic Sheridan Opera House in Telluride.",
    pubDate: "2026-10-02",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2026/05/unnamed-file-2.png"
  },
  {
    title: "Not-So-Young People's Theater: Shrek The Musical",
    link: "https://sheridanoperahouse.com/events/not-so-young-peoples-theater/",
    description: "A production of Shrek The Musical performed at the Sheridan Opera House, bringing the beloved fairy-tale story to life on a Telluride stage. The show features the classic characters and songs from the hit musical based on the DreamWorks animated film.",
    pubDate: "2026-10-08",
    endDate: "2026-10-11",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2025/10/16-5H0A3038.jpg"
  }
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
    title: "The Sherbino Presents: \"Thinking Like Water\", a DIY look at watershed restoration",
    href: "https://sherbino.org/event/the-sherbino-presents-thinking-like-water-a-diy-look-at-watershed-restoration/",
    date: "2026-09-29 18:30:00",
    endDate: "2026-09-29 20:00:00",
    location: "The Sherbino, Ridgway",
    copy: "Join us at the Sherbino Theatre on Tuesday, September 29, 2026, for Episode 1 of this award-wining docuseries on our watersheds. Doors open at 6:00 p.m., the film begins at 6:30 p.m., a panel discussion follows. Tickets are $10. @ Doors: 6:00 PM || Film: 6:30 PM || Tickets: $10 in advance Setting: Seated at The Sherbino Doors: 6:00 Film: 6:30 followed by a panel discussion with Amanda Clements, Uncompahgre Watershed Partnership – Board Chair; Ecology background and 20 years with BLM || Tanner Banks, Trout Unlimited – Restoration Program Manager || Fred Phillips, Fred Phillips Consulting – Landscape Architect, Plans-Designs-Implements wetland, habitat and stream restoration projects || & Renea Roberts, Filmmaker/ModeratorPart biography, part how-to, “Water Wizard” Bill Zeedyk and his allies illustrate a proven toolbox of simple low-tech, low-cost methods to restore degraded lands. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/08/Thinking-like-water-banner.png"
  },
  {
    title: "First Friday Opening Reception: Michelle Montague",
    href: "https://sherbino.org/event/containment-michelle-montague-610-arts-collective-meta-description/",
    date: "2026-10-02 17:00:00",
    endDate: "2026-10-02 19:00:00",
    location: "The Sherbino, Ridgway",
    copy: "The 610 Arts Collective at The Sherbino in Ridgway hosts an opening reception for *Containment*, a new exhibition by Ridgway artist Michelle Montague, on the first Friday of October. The free reception runs from 5:00 to 7:00 PM, with the show remaining on view through October 30, 2026.",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/08/montague.png",
    description: "The 610 Arts Collective at The Sherbino in Ridgway hosts an opening reception for *Containment*, a new exhibition by Ridgway artist Michelle Montague, on the first Friday of October. The free reception runs from 5:00 to 7:00 PM, with the show remaining on view through October 30, 2026."
  },
  {
    title: "First Friday at The Sherbino: Donny Morales & Cody Russell",
    href: "https://sherbino.org/event/first-friday-at-the-sherbino-donny-morales-cody-russell/",
    date: "2026-10-02 17:30:00",
    endDate: "2026-10-02 20:00:00",
    location: "The Sherbino, Ridgway",
    copy: "First Friday at The Sherbino brings a free live music performance by Donny Morales and Cody Russell to the Ridgway venue, with a cash bar and tips encouraged for the musicians. During the set break, attendees are invited to step into the Decker Room for the Space Cowboy exhibition, an artist talk, and words from Colorado Poet Laureate Crisosto Apache.",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/09/Donny-morales-banner-Oct-2.png",
    description: "First Friday at The Sherbino brings a free live music performance by Donny Morales and Cody Russell to the Ridgway venue, with a cash bar and tips encouraged for the musicians. During the set break, attendees are invited to step into the Decker Room for the Space Cowboy exhibition, an artist talk, and words from Colorado Poet Laureate Crisosto Apache."
  },
  {
    title: "Ridgway 1k 2026",
    href: "https://sherbino.org/event/ridgway-1k-2026/",
    date: "2026-10-04 12:15:00",
    endDate: "2026-10-04 13:30:00",
    location: "Ridgway, CO",
    copy: "The Ridgway 1K is a short, fun run billed as Colorado's most entertaining race, winding through downtown Ridgway. In-person registration opens at 12:15 PM, with the race starting at 12:45 PM and a final check-in deadline of 1:15 PM.",
    imageUrl: "https://sherbino.org/wp-content/uploads/2025/11/sherb-2025-EVENT-BANNERS-1920-x-1080-px-45.png",
    description: "The Ridgway 1K is a short, fun run billed as Colorado's most entertaining race, winding through downtown Ridgway. In-person registration opens at 12:15 PM, with the race starting at 12:45 PM and a final check-in deadline of 1:15 PM."
  },
  {
    title: "San Juan Oktoberfest",
    href: "https://sherbino.org/event/san-juan-oktoberfest-ridgway-colorado-2026/",
    date: "2026-10-04 14:00:00",
    endDate: "2026-10-04 17:00:00",
    location: "Ridgway, CO",
    copy: "San Juan Oktoberfest is an annual fall celebration held at Hartwell Park in Ridgway, taking place amid the area's peak autumn colors. The event features classic Oktoberfest fare including bratwursts, set against a backdrop of golden aspens and the surrounding San Juan Mountains.",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/04/sherb-and-wca-EVENT-BANNERS-2-e1788900662419.png",
    description: "San Juan Oktoberfest is an annual fall celebration held at Hartwell Park in Ridgway, taking place amid the area's peak autumn colors. The event features classic Oktoberfest fare including bratwursts, set against a backdrop of golden aspens and the surrounding San Juan Mountains."
  },
  {
    title: "Alysha Brilla",
    href: "https://sherbino.org/event/alysha-brilla/",
    date: "2026-10-10 19:00:00",
    endDate: "2026-10-10 20:30:00",
    location: "The Sherbino, Ridgway",
    copy: "Alysha Brilla performs live at The Sherbino in Ridgway, presented in partnership with Pickin' Productions. The show is primarily a dancehall-style setup with limited open seating, and some reserved section seats are available in advance.",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/07/alysha-1-e1783453241649.png",
    description: "Alysha Brilla performs live at The Sherbino in Ridgway, presented in partnership with Pickin' Productions. The show is primarily a dancehall-style setup with limited open seating, and some reserved section seats are available in advance."
  },
  {
    title: "Monthly Welcome Home Alliance Veteran's Coffee at the Sherbino",
    href: "https://sherbino.org/event/monthly-welcome-home-alliance-veterans-coffee-at-the-sherbino/2026-10-13/",
    date: "2026-10-13 10:00:00",
    endDate: "2026-10-13 12:00:00",
    location: "Ridgway, CO",
    copy: "A recurring monthly gathering hosted by the Welcome Home Alliance brings veterans together for coffee at the Sherbino in Ridgway. The event offers a casual space for veterans to connect with one another and with community support.",
    imageUrl: "https://sherbino.org/wp-content/uploads/2023/01/Vet-Coffee.png",
    description: "A recurring monthly gathering hosted by the Welcome Home Alliance brings veterans together for coffee at the Sherbino in Ridgway. The event offers a casual space for veterans to connect with one another and with community support."
  },
  {
    title: "Talk: The Sherbino Presents: India Wood's HIKING THE COLORADO X",
    href: "https://sherbino.org/event/talk-the-sherbino-presents-india-woods-hiking-the-colorado-x/",
    date: "2026-10-15 18:30:00",
    endDate: "2026-10-15 20:00:00",
    location: "The Sherbino, Ridgway",
    copy: "🏔️ Join us at the Sherbino on Thursday, October 15th for an inspiring talk with India Wood on her 1,500 mile journey. Doors at 6 pm | Talk at 6:30 pm | $10 @ Doors open at 6:00 PM | Talk begins at 6:30 PM | $10 Join India Wood for wild stories about backpacking her own route along a 1,500-mile X across Colorado. Be inspired by one woman’s solo adventure and hear her observations of this state as a square sample of our planet. ********************************************* Join India for a showing of the short “Diagonal” documentary, slide show, and stories about backpacking the Colorado X, a walk no one else had ever done. She was a 50-something empty nester, unfit, her career and marriage falling apart when she decided to learn to stand on her own two feet again. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/09/India-Wood-Talk-Banner-Oct-15.png"
  },
  {
    title: "Mountainfilm on Tour – Montrose",
    href: "https://sherbino.org/event/mountainfilm-on-tour-montrose-adventure-shorts/",
    date: "2026-10-18 15:00:00",
    endDate: "2026-10-18 17:00:00",
    location: "The Sherbino, Ridgway",
    copy: "Mountainfilm on Tour brings a curated selection of short films from the acclaimed Telluride-based Mountainfilm festival to The Sherbino in Ridgway. The traveling program features the documentary and adventure storytelling the festival is known for, presented in a seated screening format with a limited bar available.",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/09/sherb-and-wca-EVENT-BANNERS-3.png",
    description: "Mountainfilm on Tour brings a curated selection of short films from the acclaimed Telluride-based Mountainfilm festival to The Sherbino in Ridgway. The traveling program features the documentary and adventure storytelling the festival is known for, presented in a seated screening format with a limited bar available."
  },
  {
    title: "Rocky Horror Picture Show Live Shadow Cast Edition",
    href: "https://sherbino.org/event/rocky-horror-picture-show-live-shadow-cast-edition-9/",
    date: "2026-10-22 20:00:00",
    endDate: "2026-10-25 15:00:00",
    location: "The Sherbino, Ridgway",
    copy: "The Rocky Horror Picture Show Live Shadow Cast at the Sherbino – October 22–25, 2026 @ TICKETS The Rocky Horror Picture Show — Shadow Cast Edition Thursday, Friday, & Saturday Performances:  Doors: 7:30pm || Show:  8:00pm (Oct. 22-24) Sunday Matinee: Doors: 2:30pm || Show: 3:00pm (Oct. 25)Directed by Erin Cawley Ages 18+ (under 18 with parental permission or parent is accompanying minor) Tickets: $15 + $15 required prop/supply fee Don’t dream it… be it. Get ready to do the Time Warp again as The Rocky Horror Picture Show returns to the Sherbino in full shadow-cast style! Part movie screening, part live theater, and completely outrageous, this cult-classic experience features a live local cast performing along with the film on stage—lip-syncing, dancing, and bringing your favorite characters and scenes to life right in front of the screen. And at Rocky Horror, the audience isn’t just watching. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2025/11/RHPS-event-banner-1.png"
  },
  {
    title: "Sherb Literary Living Room featuring Pam Houston with her new book: \"Animals Taught Me Everything\"",
    href: "https://sherbino.org/event/sherb-literary-living-room-featuring-pam-houston-with-her-new-book-animals-taught-me-everything/",
    date: "2026-10-27 18:30:00",
    endDate: "2026-10-27 19:30:00",
    location: "The Sherbino, Ridgway",
    copy: "Pam Houston visits The Sherbino in Ridgway for a Literary Living Room evening centered on her newly published book *Animals Taught Me Everything*, exploring what animals — from horses to wolfhounds — can reveal about living well. The seated event begins at 6:30 PM with doors opening at 6:00 PM, and admission is $15.",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/08/Pam-Houston-Banner-Oct-27.png",
    description: "Pam Houston visits The Sherbino in Ridgway for a Literary Living Room evening centered on her newly published book *Animals Taught Me Everything*, exploring what animals — from horses to wolfhounds — can reveal about living well. The seated event begins at 6:30 PM with doors opening at 6:00 PM, and admission is $15."
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
    description: "Every Tuesday night downstairs at The Well, gathering for food, conversation, and bible study.",
    date: "2026-09-29",
    time: "6:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "The Well, 122 S Aspen",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Pickleball Nights",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "Thursday night pickleball, no experience necessary. All supplies provided.",
    date: "2026-10-01",
    time: "7:00-9:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "Telluride Racket Club",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Weekly Young Adult Gathering",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "Every Tuesday night downstairs at The Well, gathering for food, conversation, and bible study.",
    date: "2026-10-06",
    time: "6:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "The Well, 122 S Aspen",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Pickleball Nights",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "Thursday night pickleball, no experience necessary. All supplies provided.",
    date: "2026-10-08",
    time: "7:00-9:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "Telluride Racket Club",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Weekly Young Adult Gathering",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "Every Tuesday night downstairs at The Well, gathering for food, conversation, and bible study.",
    date: "2026-10-13",
    time: "6:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "The Well, 122 S Aspen",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Pickleball Nights",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "Thursday night pickleball, no experience necessary. All supplies provided.",
    date: "2026-10-15",
    time: "7:00-9:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "Telluride Racket Club",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Weekly Young Adult Gathering",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "Every Tuesday night downstairs at The Well, gathering for food, conversation, and bible study.",
    date: "2026-10-20",
    time: "6:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "The Well, 122 S Aspen",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Pickleball Nights",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "Thursday night pickleball, no experience necessary. All supplies provided.",
    date: "2026-10-22",
    time: "7:00-9:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "Telluride Racket Club",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Weekly Young Adult Gathering",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "Every Tuesday night downstairs at The Well, gathering for food, conversation, and bible study.",
    date: "2026-10-27",
    time: "6:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "The Well, 122 S Aspen",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Pickleball Nights",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "Thursday night pickleball, no experience necessary. All supplies provided.",
    date: "2026-10-29",
    time: "7:00-9:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "Telluride Racket Club",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Weekly Young Adult Gathering",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "Every Tuesday night downstairs at The Well, gathering for food, conversation, and bible study.",
    date: "2026-11-03",
    time: "6:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "The Well, 122 S Aspen",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  },
  {
    title: "Pickleball Nights",
    link: "https://www.beacontelluride.com/upcoming-events",
    description: "Thursday night pickleball, no experience necessary. All supplies provided.",
    date: "2026-11-05",
    time: "7:00-9:00 PM",
    source: "beacon",
    sourceLabel: "Beacon",
    category: "Community Event",
    location: "Telluride Racket Club",
    imageUrl: "https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp"
  }
];


// Telluride Chamber Music concerts (telluridechambermusic.org/events).
// Bot-refreshed by the chamber-music-events-refresh scheduled task.
const CHAMBER_MUSIC_EVENTS = [
  {
    title: "Hanneke Cassel Trio",
    link: "https://telluridechambermusic.org/concert/hanneke-cassel-trio",
    description: "Our \"Not Your Average Classical\" series is back!",
    date: "2026-10-13",
    time: "7:00 PM",
    source: "chamber-music",
    sourceLabel: "Telluride Chamber Music",
    category: "Concert",
    location: "The Alibi",
    imageUrl: "https://telluridechambermusic.org/concerts/hanneke-cassel-trio.webp"
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
  {
    title: "Love Your Gorge",
    link: "https://ouraycountyco.gov/Calendar.aspx?EID=3786",
    description: "A community event hosted at the Ouray Ice Park, with potential attendance and participation from Ouray County Commissioners. The event celebrates the iconic river gorge and surrounding natural area in and around Ouray.",
    pubDate: "2026-10-17T09:00:00.000Z",
    source: "ouraycounty",
    sourceLabel: "Ouray County",
    category: "Community Event",
    location: "Ouray Ice Park - Ouray CO 81427",
    imageUrl: ""
  },
  {
    title: "Ouray County MAC Group Meeting",
    link: "https://ouraycountyco.gov/Calendar.aspx?EID=2379",
    description: "A meeting of the Ouray County MAC (Montrose-area Advisory Committee or similar advisory group), held at the 4-H Event Center in Ridgway. Two or more Ouray County Commissioners may be in attendance and participating.",
    pubDate: "2026-10-08T14:00:00.000Z",
    source: "ouraycounty",
    sourceLabel: "Ouray County",
    category: "Community Event",
    location: "4-H Event Center - 22739 Highway 550 Ridgway CO 81432",
    imageUrl: ""
  },
  {
    title: "Ballot Issue Briefing (hosted by ROCC and LWV-UV)",
    link: "https://ouraycountyco.gov/Calendar.aspx?EID=3784",
    description: "A joint briefing hosted by ROCC and the League of Women Voters of the Upper Valley covering statewide measures on the November 2026 ballot. The event takes place in the Decker Room at 675 Clinton Street in Ridgway, with notice that two or more county commissioners may attend and participate.",
    pubDate: "2026-10-05T17:30:00.000Z",
    source: "ouraycounty",
    sourceLabel: "Ouray County",
    category: "Community Event",
    location: "***Two or more county commissioners may attend and participate at this event*** Presentation of statewide measures on the November 2026 ballot.&nbsp; 675 Clinton Street, Ridgway, CO (Decker Room) https://www.lwv-uv.org/ - Ouray CO 81427",
    imageUrl: ""
  }
];

const OURAY_RIDGWAY_EVENTS = [
  {
    title: "Functional Fitness - Strength & Mobility Training For Women",
    link: "https://events.ourayridgwayevents.com/event/functional-fitness-strength-mobility-training-for-women",
    description: "Welcome to Ridgway's strength and mobility training + YOGA! Functional Strength & Mobility Training (for women): Tuesday & Thursday 8:15-9 am Vinyasa Yoga: Wednesday 8:15-9:15 am Functional means we focus on movements that mimic everyday activities and improve overall mobility, strength and fitness. Exercises often work multiple muscle groups simultaneously, improving coordination and stability. I love the female group setting because we get a chance to really connect and not only get stronger physically, but also build support and community. Come for a drop in and get a taste or commit long term to transformation, vitality and longevity. All levels are welcome. Let's do hard things together! Class Structure: 5 minute warm up / 30 minute circuit workout / 10 minute cooldown stretch & mobility Vinyasa Yoga: This is a dynamic practice that will challenge, strengthen, and uplift you both physically and mentally. …",
    pubDate: "2026-09-29T14:15:00.000Z",
    endDate: "2026-11-26",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Ridgway (Old Schoolhouse)",
    imageUrl: "https://localist-images.azureedge.net/photos/53312790468311/huge/d76b2fb7534e91f8369b0dace133058cd22fa783.jpg"
  },
  {
    title: "Ongoing: Social Justice Travel Exhibition",
    link: "https://events.ourayridgwayevents.com/event/copy-of-art-opening-social-justice-travel-exhibition",
    description: "Join us for the opening of this special traveling exhibition! Telluride Arts merges creativity and activism through grassroots grants, immersive community exhibitions, and local partnerships that tackle systemic issues and promote wellness. This exhibition features new works by artists who recieved a Social Justice Grant from Telluride Arts to create work for this traveling exhibit.",
    pubDate: "2026-09-29T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53764349683288/huge/471bb8c36dc067ddd9b229c9e31032260184eb5e.jpg"
  },
  {
    title: "Colorado Poet Laureate: Crisosto Apache Reading",
    link: "https://events.ourayridgwayevents.com/event/colorado-poet-laureate-crisosto-apache-reading",
    description: "Crisosto Apache, Colorado's Poet Laureate, will give a poetry reading at Ouray School's APAC. The event is free and open to the public.",
    pubDate: "2026-09-29T19:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray School",
    imageUrl: "https://localist-images.azureedge.net/photos/53816408650430/huge/03e52865d13accd44bfe2d41810a8a214024c424.jpg"
  },
  {
    title: "Guided Tour: Historic Beaumont Hotel & Spa",
    link: "https://events.ourayridgwayevents.com/event/guided-tour-historic-beaumont-hotel-spa",
    description: "Explore Our Story: Historic Tours at the Beaumont Hotel Step into a world of elegance and intrigue with our guided historic tours. Built in 1886, the Beaumont Hotel has stood witness to the colorful history of Ouray, Colorado. Our tours offer a behind-the-scenes look at the hotel’s original architecture, fascinating stories, and notable guests. Perfect for history lovers and curious travelers alike. The Beaumont Hotel has been a cherished landmark in Ouray, hosting dignitaries, celebrities, and visitors from around the world, making it a prime sight for any vacation. Its Victorian architecture and luxurious details have made it an iconic destination for those looking to explore Colorado’s past. Tickets must be purchased before 12:00 pm the day of selected tour.",
    pubDate: "2026-09-29T19:30:00.000Z",
    endDate: "2026-11-28",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Beaumont Hotel & Spa",
    imageUrl: "https://localist-images.azureedge.net/photos/54028675143904/huge/ebfc00389a64e579a48a893200a2e27823511c3a.jpg"
  },
  {
    title: "ETHAN PERRY",
    link: "https://events.ourayridgwayevents.com/event/ethan-perry",
    description: "Ethan Perry performs a live music show at a venue on North Cora Street in Ridgway. The event is listed through the Ouray Ridgway community calendar.",
    pubDate: "2026-09-29T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Taco Tuesday w/ Corey Hooker and Friends",
    link: "https://events.ourayridgwayevents.com/event/taco-tuesday-w-corey-hooker-and-friends",
    description: "Taco Tuesday returns to The Adobe Inn with live music from Corey Hooker and Friends. A casual evening combining food and local live entertainment in a community gathering atmosphere.",
    pubDate: "2026-09-29T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Adobe Inn",
    imageUrl: "https://localist-images.azureedge.net/photos/51579855188578/huge/de5019ffbfacf4a9f5e85d8a14961584c70e7873.jpg"
  },
  {
    title: "Thinking Like Water film screening – a DIY look at watershed restoration",
    link: "https://events.ourayridgwayevents.com/event/thinking-like-water-film-screening",
    description: "Doors: 6:00pm Film: 6:30pm followed by a discussion with the filmmaker Renea Roberts; Amanda Clements, Uncompaghre Watershed Partnership - Board Chair/Friends of the River Uncompahgre- Vice Chair; Tanner Banks, Trout Unlimited - Restoration Program Manager; and Fred Phillips, Fred Phillips Consulting and Uncompahgre Multibenefit Project. Tickets $10. Part biography, part how-to, “Water Wizard” Bill Zeedyk and his allies illustrate a proven toolbox of simple low-tech, low-cost methods to restore degraded lands. They work with Nature, rather than against her, to gird against the extremes of drought and flood while fostering climate resiliency. We’ll be screening: Episode 1: “Willing to Try Things” Today, “Water Wizard” Bill Zeedyk is a legend in the ecological restoration community. But when he began this work over 25 years ago, after retiring from the U.S. Forest Service, his ideas were considered almost heretical. …",
    pubDate: "2026-09-30T00:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/53974512668640/huge/967df9dc1194b18c21883098a7e7e490a2507260.jpg"
  },
  {
    title: "TODDLER STORYTIME ART FOR AGES 2.5-5",
    link: "https://events.ourayridgwayevents.com/event/toddler-storytime-art-for-ages-25-5",
    description: "TODDLER STORYTIME ART FOR AGES 2.5-5 Wednesdays, 10:00am–11:00am Cora Annex, 145N Cora St, Ridgway Registration: www.weehawkenarts.org Session 1 (4 weeks • $70): September 16 – October 7 Session 2 (4 weeks • $70): October 21 – November 11 Session 3 (3 weeks • $55): December 2 – December 16 * Multi-session discount: Sign up for multiple fall semester sessions at once and receive $10 off each session! Come join us for Storytime + Art! Each week, your child will enjoy story time with songs and finger rhymes, a process‑art project, and a variety of creative sensory play. We end with a quick cleanup, circle time, and movement songs. This class gently supports preschool prep and helps your child develop important school‑readiness skills—such as fine‑motor coordination, independence, and the ability to listen and follow directions—in a warm, supportive setting. …",
    pubDate: "2026-09-30T16:00:00.000Z",
    endDate: "2026-10-07",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/53780434962919/huge/3aff831f26d7f9d4824893f89d8fd88416047a44.jpg"
  },
  {
    title: "Water Aerobics",
    link: "https://events.ourayridgwayevents.com/event/water-aerobics",
    description: "Join water aerobics weekly Wednesdays (Sometimes Tuesdays and Thursdays too!) from 10–11 a.m. at the Ouray Hot Springs Pool. Get a workout, build community, and enjoy the positive atmosphere! Water aerobics is free for pool members, and non-members can join for just $5 per class.",
    pubDate: "2026-09-30T16:00:00.000Z",
    endDate: "2026-11-25",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Hot Springs",
    imageUrl: "https://localist-images.azureedge.net/photos/53887699628224/huge/262efc04b203189edcde410b9973aac1ca778195.jpg"
  },
  {
    title: "Ouray: Echoes in the Canyon",
    link: "https://events.ourayridgwayevents.com/event/ouray-echoes-in-the-canyon",
    description: "Ouray: Echoes in the Canyon returns to the Wright Opera House for some additional screenings. Presented by Photonic Media and produced in cooperation with the City of Ouray 150th Committee, the documentary explores the people, history, landscapes, and enduring spirit that helped shape what many still call \"The Gem of the Rockies.\" Through storytelling, archival perspective, aerial cinematography, and local voices, the film traces the layered history of Ouray and the individuals who built a mountain community that continues to evolve while remaining deeply connected to its frontier roots. The film features aerial photography by Ouray By Flight, cinematography by Levi Kramer, and is produced and directed by Hank Braxtan. We are offering a \"pay what you can\" for your ticket - $5, $10 and $15. Pick the amount that fees \"Wright\" to you. Thank you for your support! …",
    pubDate: "2026-09-30T19:00:43.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53629792783415/huge/7ffe1cd27be1a5cd638b2680c89d4a608bd062a4.jpg"
  },
  {
    title: "AFTER SCHOOL ART FOR AGES 8-12",
    link: "https://events.ourayridgwayevents.com/event/afterschool-artfor-ages-8-12",
    description: "AFTER SCHOOL ART FOR AGES 8-12 Wednesdays, 3:15–4:45 pm Cora Annex, 145N Cora St, Ridgway Registration: www.weehawkenarts.org Session 1 (4 weeks • $85): September 16 – October 7Session 2 (4 weeks • $85): October 21 – November 11Session 3 (3 weeks • $70): December 2 – December 16Each week, students will explore an exciting theme while experimenting with a wide range of materials and techniques. Drawing inspiration from well-known artists and design styles, young artists will be supported in discovering their own unique creative voice in a fun, nurturing, studio-like setting. These classes are designed to foster a love of the arts through hands-on exploration, age-appropriate projects, and a focus on the joy of the creative process. A student art reception will be held in December. Students will take home their collected works in the days following the event. …",
    pubDate: "2026-09-30T21:15:00.000Z",
    endDate: "2026-10-07",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/53780624349826/huge/2ad5a3657f19d47b14c7833f838ac040c0836f38.jpg"
  },
  {
    title: "Zumba Fitness with Tamra",
    link: "https://events.ourayridgwayevents.com/event/zumba-fitness-with-tamra",
    description: "Zumba is a high-energy, Latin-inspired dance fitness program designed as a fun, accessible workout for all skill levels. It combines fast and slow rhythms with aerobic, interval-training moves to improve cardiovascular health, burn calories, and tone muscles. Classes are often described as a \"fitness party\" that reduces stress. All levels of fitness and dance experience are welcome. Classes are $12 to drop in. Class packs are available for purchase (5 classes for $50, 10 classes for $95). For more information, check out the instructor's website: https://zumba.com/p/zumbafitnesswithTamra or email Tamra at tamra.nichols@icloud.com . For updated class information, including last-minute changes or cancellations, follow the instructor's Zumba Facebook page at https://www.facebook.com/ZumbaFitnesswithTamra .",
    pubDate: "2026-09-30T23:30:00.000Z",
    endDate: "2026-11-19",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52277881680293/huge/aa29110a3c05049d073e03408632a25f10e17ba5.jpg"
  },
  {
    title: "OPEN MIC / JAM NIGHT w/ host DJ Strong",
    link: "https://events.ourayridgwayevents.com/event/open-mic-jam-night-w-host-dj-strong",
    description: "Floating Lotus Brewery hosts a weekly open mic and jam night led by DJ Strong, welcoming solo performers, groups, and musicians looking to collaborate. Attendees can share original songs, play covers, or join in on full-band jam sessions in a casual, community-focused setting.",
    pubDate: "2026-10-01T00:00:00.000Z",
    endDate: "2026-11-26",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/52523630382868/huge/8fc500326eed5dc630e7e4235909efe3b2751086.jpg"
  },
  {
    title: "AFTER SCHOOL ART FOR AGES 5-8",
    link: "https://events.ourayridgwayevents.com/event/afterschool-artfor-ages-5-8",
    description: "AFTER SCHOOL ART FOR AGES 5-8 Thursdays, 3:15–4:30 pm Cora Annex, 145N Cora St, Ridgway Registration: www.weehawkenarts.org Session 1 (4 weeks • $85): September 17 – October 8Session 2 (4 weeks • $85): October 22 – November 12Session 3 (3 weeks • $70): December 3 – December 17Each week, students will explore exciting themes and projects while experimenting with a wide variety of art materials—such as watercolor and acrylic paints, oil and chalk pastels, clay, collage, printmaking, and more. Through open-ended projects, students are encouraged to explore their creativity, make artistic choices, take creative risks, and discover their unique artistic voice. Our classes nurture imaginative thinking and storytelling, helping children express big ideas and emotions through visual narratives and personal creations. In addition to sparking imagination, our signature art projects support the development of fine motor skills, confidence, and social-emotional development in a fun group environment. …",
    pubDate: "2026-10-01T21:15:00.000Z",
    endDate: "2026-10-08",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/53780725919104/huge/846566299e8e325221de54dd5a54a0fd6427fbf5.jpg"
  },
  {
    title: "Trivia Night",
    link: "https://events.ourayridgwayevents.com/event/floating-lotus-trivia-night",
    description: "Trivia Night at Floating Lotus Brewery! Join us on the 1st & 3rd Thursdays from 7–9 PM for a lively night of questions, drinks, and friendly competition. Grab a table, bring your team, and learn more at floatinglotusbrewery.com.",
    pubDate: "2026-10-02T01:00:00.000Z",
    endDate: "2026-11-20",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/53790516346797/huge/599d1a7013ddde307592e7dfc9b892fe265527e0.jpg"
  },
  {
    title: "Ridgway Farmers Market",
    link: "https://events.ourayridgwayevents.com/event/ridgway-farmers-market",
    description: "Ridgway Farmers Market WHERE LOCAL GROWS... in the soil, in our economy, and in the connections we share as a community Local farmers, ranchers, bakers, and artisans bring the best of Ridgway to town: fresh produce, handcrafted goods, and the shared belief that a strong community begins with supporting the people who live and work here.",
    pubDate: "2026-10-02T16:00:00.000Z",
    endDate: "2026-10-16",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Hartwell Park",
    imageUrl: "https://localist-images.azureedge.net/photos/52487561553294/huge/09a2d632a840b6a4d0303261c242753cb58a993a.jpg"
  },
  {
    title: "COUSIN CURTISS",
    link: "https://events.ourayridgwayevents.com/event/cousin-curtis",
    description: "Cousin Curtiss performs a live music show at a venue on North Cora Street in Ridgway. The event is listed through the Ouray Ridgway community calendar.",
    pubDate: "2026-10-02T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Containment",
    link: "https://events.ourayridgwayevents.com/event/containment",
    description: "Containment is a mixed-media exhibition of clay sculptures and assemblage by Ridgway-based artist Michelle Montague, on display at The 610 Arts Collective. The work explores themes of vulnerability, perspective, angst, and hope through tactile forms, layered materials, and carefully constructed scenes.",
    pubDate: "2026-10-02T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The 610 Arts Collective",
    imageUrl: "https://localist-images.azureedge.net/photos/53693053505919/huge/8a780ff6c8312fd2ff43dfb21dd65bcccea56d49.jpg"
  },
  {
    title: "First Friday Art Walk",
    link: "https://events.ourayridgwayevents.com/event/first-friday-art-walk",
    description: "First Friday Art Walk is a monthly community event in downtown Ridgway where galleries, studios, and local businesses open their doors to showcase art and connect visitors with artists. It's a welcoming occasion for both dedicated art enthusiasts and casual browsers to explore the local creative scene.",
    pubDate: "2026-10-02T23:00:00.000Z",
    endDate: "2026-11-07",
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
    pubDate: "2026-10-02T23:00:00.000Z",
    endDate: "2026-11-07",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Herran House",
    imageUrl: "https://localist-images.azureedge.net/photos/53312391289791/huge/00a6a9e1834a357256b5925d35f6a6525ff06493.jpg"
  },
  {
    title: "October - Art Opening: Space Cowboy by Dundee & Lee - special reading by Poet Laureate Crisosto Apache",
    link: "https://events.ourayridgwayevents.com/event/art-opening-space-cowboy-by-dundee-lee",
    description: "Opening Reception Schedule - Part of Ridgway's First Friday Art Walk Gallery Open 5-8PM Artist Talk and Poetry Reading 630-7:30 Free refreshments provided by Chloe's Charcuterie and Wine Space Cowboy Lands in Ridgway This October Space Cowboy is landing in Ridgway for a month of art, poetry, storytelling, and community programming as part of its four-year journey through Colorado’s Creative Districts. Created by Colorado artists Emilie Odeile and Ken Chapin of Dundee & Lee, the exhibition centers on a 10-foot-tall fiber rocket topped with a cowboy hat and Mission Control consoles that gather images, voices, stories, and discoveries as Space Cowboy travels from community to community. Throughout October, the exhibition comes alive with special events and programming, including appearances by Colorado Poet Laureate Crisosto Apache, community conversations, and opportunities for Ridgway residents to become part of the continuing Space Cowboy story. …",
    pubDate: "2026-10-02T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53975454573398/huge/fed6f5172fe765abe1cd1b3f3447b64e3cd83d27.jpg"
  },
  {
    title: "First Friday at The Sherbino: Donny Morales + Cody Russell",
    link: "https://events.ourayridgwayevents.com/event/first-friday-at-the-sherbino-donny-morales-cody-russell",
    description: "Make The Sherbino one of your stops during Ridgway’s First Friday Art Walk on Friday, October 2! We’re opening the doors for a FREE evening of live music featuring Donny Morales, joined by special guest Cody Russell. Come downtown, wander the galleries, grab dinner or a drink, and settle in for some great live music at The Sherbino. LIVE MUSIC SCHEDULE 5:30–6:30 PM — Set 1 Break — Perfect timing to catch the talk + reading happening at the Decker Room as part of First Friday 7:15–8:15 PM — Set 2 The Sherbino Ridgway, Colorado FREE EVENT, thanks to support from Ridgway FUSE Come for one set, stay for both, or make an evening of it and explore everything happening around Ridgway for First Friday Art Walk. No ticket needed — just show up, bring some friends, and enjoy a great night of live music in downtown Ridgway. …",
    pubDate: "2026-10-02T23:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/54093107883137/huge/2e66d4460f0e5494a62c56da6fdce5859934120a.jpg"
  },
  {
    title: "Roma Ransom – Live at Floating Lotus Brewery",
    link: "https://events.ourayridgwayevents.com/event/roma-ransom-live-at-floating-lotus-brewery",
    description: "Great music should do three things: connect us to the past, inspire us to envision the future, and root us fully in the present. Roma Ransom does all three. The duo blends old-time traditional ballads with European influences—particularly Romanian music—while creating a sound distinctly their own. Grace Easley’s sultry, sweet vocals and the duo’s wide instrumental palette move naturally from intimate listening-room moments to lively festival energy. Over the past decade, Roma Ransom has toured throughout North America, performing more than 200 shows a year and appearing at festivals alongside acts including Larry & His Flask and Leftover Salmon.",
    pubDate: "2026-10-03T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/52352007922073/huge/6e1d6344c68fc21891f3b86ca94c989690337619.jpg"
  },
  {
    title: "Ouray 150th Gala",
    link: "https://events.ourayridgwayevents.com/event/ouray-150th-gala",
    description: "Join us for an unforgettable evening as we celebrate 150 years of Ouray's rich history, vibrant community, and enduring spirit. Held in the elegant ballroom of the historic Beaumont Hotel, the Ouray 150th Gala will bring together residents, visitors, and history enthusiasts for a night of music, food, dancing, and celebration. Guests are invited to honor the era that shaped Ouray by dressing in black-tie attire or historical period clothing reminiscent of the late 1800s. Step back in time and experience the charm, elegance, and excitement of a bygone era while commemorating this once-in-a-generation milestone. Raise a glass to 150 years of adventure, resilience, and community as we celebrate Ouray's past, present, and future. …",
    pubDate: "2026-10-03T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Beaumont Hotel & Spa",
    imageUrl: "https://localist-images.azureedge.net/photos/53056912759532/huge/aa016e5f576b545feeba24a39e7ee32221da7c4a.jpg"
  },
  {
    title: "Mineral Identification Workshop For Kids",
    link: "https://events.ourayridgwayevents.com/event/mineral-identification-workshop-for-kids",
    description: "A hands-on workshop for kids focused on identifying mineral hand samples from the San Juan Mountain region, led by Robert Stoufer. The program takes place at the Ouray County Historical Society Research Center & Archive.",
    pubDate: "2026-10-03T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray County Historical Society Research Center & Archive",
    imageUrl: "https://localist-images.azureedge.net/photos/52278219322548/huge/0e7cc3a05f960a6d1c77d69eb8423134dfed7fa4.jpg"
  },
  {
    title: "Happy Little Trees: Classes @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/happy-little-trees-classes-the-wright-6743",
    description: "\"ARIZONA SPLENDOR\" Join Emma Kalff for a morning of coffee and painting at the Wright Opera House Community Room. Participants will follow along with a classic Bob Ross episode and create their own Bob Ross–style landscape painting. All supplies are included, and no prior painting experience is necessary. Just bring your curiosity and enjoy a relaxed, creative morning inspired by the joy of painting. FULL SCHEDULE April 11 — Horizons West May 9 — Barn at Sunset June 13 — LIttle House by the Road July 11 — Mountain Splendor August 8 — Quiet Woods September 12 — Arizona Splendor October 3 — Meadow Stream November 14 — Lonely Retreat December 12 — Snow Trail Part of Classes @ the Wright, bringing creativity, learning, and community together in downtown Ouray since Letitia Wright first dreamed it up.",
    pubDate: "2026-10-03T16:30:00.000Z",
    endDate: "2026-11-14",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/53644731506912/huge/89ae9ae8e058db83a936dd643f6af477841cd019.jpg"
  },
  {
    title: "150th Concert: Big Head Todd & the Monsters w/ Hazel Miller & The Collective",
    link: "https://events.ourayridgwayevents.com/event/150th-concert-big-head-todd",
    description: "🎶 Ouray 150th Anniversary Concert 🎶 Join us for an unforgettable evening of live music as we celebrate 150 years of Ouray with a FREE community concert in the park! 📅 October 3, 2026 ⏰ 4–8 PM 📍 Fellin Park Headlining the celebration are Colorado rock legends Big Head Todd and the Monsters, known for their blues-infused sound and iconic hits like “Bittersweet,” “Broken Hearted Savior,” and “Circle.” Opening the evening is the powerhouse Hazel Miller & The Collective, bringing their signature mix of soul, jazz, and blues led by legendary vocalist Hazel Miller. Set against the dramatic peaks of the San Juan Mountains, this special concert is the centerpiece of Ouray’s sesquicentennial celebration, honoring the people, stories, and history that shaped our mountain town. …",
    pubDate: "2026-10-03T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Fellin Park",
    imageUrl: "https://localist-images.azureedge.net/photos/52364674023264/huge/f98fd45e49189eebaa22894d39eb7c241c2e49a9.jpg"
  },
  {
    title: "Ridgway 1K ~ Rally thru the Alley",
    link: "https://events.ourayridgwayevents.com/event/ridgway-1k",
    description: "Ridgway 1K ~ Rally Through The Alley: Colorado’s Most Entertaining Fun Run Presented by Citizens State Bank In-person Registration Opens: 12:15 PM Race Starts: 12:45 PM Last Call for Runners: 1:15 PM (all runners must be checked in by 1:15 pm). Join the most hilarious costumed fun run in Colorado! The Ridgway 1K Rally Through The Alley is a family-friendly, costume-themed, 1K race in downtown Ridgway. But don’t be fooled—this 6-block, downhill “race” is all about fun, food, and funky vibes, not speed. Why It’s a Must-Do Event: Open to all ages and fitness levelsCostumes are encouraged (and rewarded!)8 unique aid stations featuring outrageous snacks like bacon, donuts, and hot dogsThe race ends with live music in Hartwell Park for San Juan OktoberfestSan Juan Oktoberfest features Oktoberfest fare, games, and live music from Polka band Blue Camoose Pro Tip: In the Ridgway 1K, if you’re first… you’re last! …",
    pubDate: "2026-10-04T18:45:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Ridgway (Old Schoolhouse)",
    imageUrl: "https://localist-images.azureedge.net/photos/53552021295591/huge/f421ae960369bfd1aa6d541e0eaa130654abfd6b.jpg"
  },
  {
    title: "Pumpkin Palooza at Ridgway 1k Finish Line",
    link: "https://events.ourayridgwayevents.com/event/pumpkin-palooza-at-ridgway-1k-finish-line",
    description: "Voyager Youth Program presents a free, family-friendly afternoon of fall fun with pumpkin painting, face painting, games, prize opportunities and more. Pumpkin Palooza takes place in Hartwell Park alongside the Ridgway 1K and San Juan Oktoberfest. No registration is required; donations are welcome.",
    pubDate: "2026-10-04T20:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Hartwell Park",
    imageUrl: "https://localist-images.azureedge.net/photos/54066523071640/huge/1f1e3f6787481a187fccaa2be86460032f20773f.jpg"
  },
  {
    title: "San Juan Oktoberfest 2026",
    link: "https://events.ourayridgwayevents.com/event/san-juan-oktoberfest-2026",
    description: "San Juan Oktoberfest with Live Music by Ridgway Band (opening) and BLUE CAMOOSE polka! Sunday, October 4, 2026 | Hartwell Park | Ridgway, Colorado There’s nothing quite like Ridgway in early October — bright blue skies, golden aspens and cottonwoods glowing on the hillsides, and the irresistible scent of bratwursts sizzling in Hartwell Park. That can only mean one thing: Oktoberfest has arrived! This year marks the inaugural San Juan Oktoberfest, happening Sunday, October 4, immediately following the wildly fun Ridgway 1K Rally Through the Alley. After the costumes, laughter, and downhill dash through town, the celebration continues in the park with a festival that blends Austrian tradition with Rocky Mountain charm. Picture lederhosen and dirndls, frothy steins clinking together, live music filling the autumn air, and kids laughing just as much as the adults. …",
    pubDate: "2026-10-04T20:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Hartwell Park",
    imageUrl: "https://localist-images.azureedge.net/photos/52595045386518/huge/f5138926bb27495f4ce42292fa805810d8db023d.jpg"
  },
  {
    title: "LIVE MUSIC IN THE GARDEN! Zan Waller & Stefan Davenport",
    link: "https://events.ourayridgwayevents.com/event/live-music-in-the-garden-zan-waller-stefan-davenport-1540",
    description: "Zan Waller and Stefan Davenport perform live at Chloe's Charcuterie & Wine, set against the backdrop of the venue's garden. It's an opportunity to enjoy an afternoon of music paired with wine and charcuterie in a relaxed outdoor setting.",
    pubDate: "2026-10-04T22:00:00.000Z",
    endDate: "2026-11-08",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Chloe's Charcuterie & Wine",
    imageUrl: "https://localist-images.azureedge.net/photos/53950055817938/huge/4924d3606a12c233af2b47a380c304869dfaf267.jpg"
  },
  {
    title: "Ridgway Revival Music Festival",
    link: "https://events.ourayridgwayevents.com/event/ridgway-revival-music-festival",
    description: "RIDGWAY REVIVAL — OCTOBER 4, 2026 A full day of ORIGINAL local and regional music, food, vendors and community at one of Ridgway’s coolest little spots — Tiny Town.THIS ONE IS ABOUT THE ARTISTS Ridgway Revival was created to showcase the incredible original music being made right here in our region — and to make sure the people creating it are actually supported.Every artist on the lineup is guaranteed pay, with the opportunity to earn more through sponsorships and donations. Because if we want a thriving local music scene, we have to invest in the people making the music. Joint Point The Black Canyon Boys Britley Red & Matt Palamar Straylight M2 Opening ceremony with Clarke & Rebecca Poos Hosted by Corey Hooker — Deputy Mayor Sheriff of Tiny Town! …",
    pubDate: "2026-10-04T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Tiny Town Ridgway, CO (Between Floating Lotus Brewery and the river***",
    imageUrl: "https://localist-images.azureedge.net/photos/53950008750168/huge/5b9d7038734815954c00863023567480d024e0d0.jpg"
  },
  {
    title: "Ongoing: Space Cowboy by Dundee & Lee",
    link: "https://events.ourayridgwayevents.com/event/copy-of-art-opening-space-cowboy-by-dundee-lee",
    description: "Space Cowboy Lands in Ridgway This October Space Cowboy is landing in Ridgway for a month of art, poetry, storytelling, and community programming as part of its four-year journey through Colorado’s Creative Districts. Created by Colorado artists Emilie Odeile and Ken Chapin of Dundee & Lee, the exhibition centers on a 10-foot-tall fiber rocket topped with a cowboy hat and Mission Control consoles that gather images, voices, stories, and discoveries as Space Cowboy travels from community to community. Throughout October, the exhibition comes alive with special events and programming, including appearances by Colorado Poet Laureate Crisosto Apache, community conversations, and opportunities for Ridgway residents to become part of the continuing Space Cowboy story. Space Cowboy travels with a simple idea: Colorado is the teacher and Space Cowboy is the learner. Every community adds something new to the mission. …",
    pubDate: "2026-10-05T16:00:00.000Z",
    endDate: "2026-10-29",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53975670057489/huge/75be37bbb2b6bd7ba17f7754e11da5a0eaf5930c.jpg"
  },
  {
    title: "Senior Lunch by Neighbor to Neighbor",
    link: "https://events.ourayridgwayevents.com/event/senior-lunch-by-neighbor-to-neighbor",
    description: "Senior Lunch Every Monday Seniors meet to share a wonderful lunch, have a chance to socialize and enjoy an entertaining program. Transportation is provided. Neighbor to Neighbor, 970-325-4586.",
    pubDate: "2026-10-05T18:00:00.000Z",
    endDate: "2026-11-23",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/51631061496012/huge/ef9e5facb2d933bc015ffe261fc1ecd0508088c8.jpg"
  },
  {
    title: "Monthly Karate in Ouray County",
    link: "https://events.ourayridgwayevents.com/event/monthly-karate-in-ouray-county",
    description: "Join Weehawken Creative Arts for Karate with Sensei Kay Briggs. We offer unlimited monthly classes in Ouray County (meaning you can attend each week in Ouray and/or Ridgway — or both). Tuition/registration is DUE the 1st week of the month. Karate class is a great way to learn skills to keep you safe, stay in shape and strong core movements. Karate believes in using it only to protect self and is taught accordingly. Whether you are new to Karate or a seasoned student, the Sensei will work with your level. Taught in the kyokushin kai-kan style, similar shotokan style of karate, we welcome new students to try this exceptional experience for your mind and body! Mixed ages --- Ages 7 through Adult (extended time for more experience) Mondays in Ouray: St. …",
    pubDate: "2026-10-05T23:00:00.000Z",
    endDate: "2026-11-03",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Ridgway (Old Schoolhouse)",
    imageUrl: "https://localist-images.azureedge.net/photos/52253033564264/huge/ef12b5792bac47932752278d68230c7704389412.jpg"
  },
  {
    title: "Ballot Issue Briefing with the League of Women Voters",
    link: "https://events.ourayridgwayevents.com/event/ballot-issue-briefing-with-the-league-of-women-voters",
    description: "The League of Women Voters of the Uncompahgre Valley is hosting a briefing at the Decker Community Room to help voters understand the statewide measures appearing on the November ballot. The presentation is nonpartisan and focused on providing clear, accessible information about complex ballot issues affecting Colorado.",
    pubDate: "2026-10-05T23:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53983238349831/huge/7d761122bc0d275db26bc59a1c4db709cbac5e7a.jpg"
  },
  {
    title: "CORAL SKYE",
    link: "https://events.ourayridgwayevents.com/event/coral-skye-7671",
    description: "Coral Skye performs a live music show at a venue on N Cora Street in Ridgway. The event takes place in the evening and is listed through the Ouray Ridgway community calendar.",
    pubDate: "2026-10-06T22:00:00.000Z",
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
    pubDate: "2026-10-07T00:00:00.000Z",
    endDate: "2026-11-04",
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
    pubDate: "2026-10-07T14:00:00.000Z",
    endDate: "2026-11-04",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center, San Juan Room",
    imageUrl: "https://localist-images.azureedge.net/photos/50382168464273/huge/9567987a01fc4f1da8e171fabd1eb5b7bdbdccfa.jpg"
  },
  {
    title: "Ice Park Advisory Team",
    link: "https://events.ourayridgwayevents.com/event/ice-park-advisory-team",
    description: "The Ice Park Advisory Team (IPAT) meets at the Ouray Community Center to provide an open forum for discussion about the future and ongoing management of the Ouray Ice Park. Community members are welcome to join the conversation alongside participating parties to talk through topics related to the park's operations and direction.",
    pubDate: "2026-10-07T23:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/51579968896083/huge/3675d004ddb2baf273430453088287837487e0f2.jpg"
  },
  {
    title: "A Monster Calls: Movie Night @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/a-monster-calls-movie-night-the-wright",
    description: "A Monster Calls: Movie Night @ the Wright WHEN? Wednesday, October 7 Doors at 6:30 PM | Movie at 7:00 PM WHERE? Wright Opera House472 Main St., Ouray, Colorado RUN TIME: 1 hour, 48 minutes RATING: PG-13 ROTTEN TOMATOES SCORE: 86% ABOUT THE FILM A Monster Calls (2016) follows Conor, a young boy whose life is upended by his mother’s illness. Then, at 12:07 each night, a towering monster begins to visit—bringing three stories, and asking Conor to tell the one truth he is most afraid to face. A beautiful, dark, and deeply human film about grief, imagination, and finding the courage to say what hurts. Because sometimes the monster is not there to scare us. Sometimes it arrives to help us survive the truth. …",
    pubDate: "2026-10-08T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/54035168674889/huge/e9ceccb298885365bd331332c49a520baa2a17ca.jpg"
  },
  {
    title: "Ouray Economic Development Committee",
    link: "https://events.ourayridgwayevents.com/event/ouray-economic-development-committee",
    description: "The Ouray Economic Development Committee (OEDC) works as the liaison between the City and the local business community. This includes creating and implementing an Economic Development Plan and economic development incentives to best serve the business community and to align with programs that induce private investment enterprises and commerce. The committee also explores regional economic development efforts with the Town of Ridgway and Ouray County as well as is tasked with developing a Business Expansion and Retention (BEAR) program, participating in policy discussions and revisions to community planning documents, and making recommendations to the City Council about economic incentive requests.",
    pubDate: "2026-10-08T14:30:00.000Z",
    endDate: "2026-11-12",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52092297170097/huge/a4669339e18604293e5cc63dffd58e4d928eee49.jpg"
  },
  {
    title: "Music Bingo",
    link: "https://events.ourayridgwayevents.com/event/music-bingo",
    description: "Music Bingo at Floating Lotus Brewery! Join us on the 2nd & 4th Thursdays from 7–9 PM for a high-energy night of music, drinks, and bingo-style fun. Listen, mark your card, and sing along. Learn more at floatinglotusbrewery.com.",
    pubDate: "2026-10-09T01:00:00.000Z",
    endDate: "2026-11-13",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/53790449536989/huge/a7181e9d298980d4c2377db45d06d26bb81e0b12.jpg"
  },
  {
    title: "FLANNEL FEEDBACK",
    link: "https://events.ourayridgwayevents.com/event/flannel-feedback-5281",
    description: "Flannel Feedback is a live music event taking place at a venue on North Cora Street in Ridgway. The evening promises a night of music in a community setting just outside Telluride.",
    pubDate: "2026-10-09T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "WOWZERS",
    link: "https://events.ourayridgwayevents.com/event/wowzers",
    description: "WOWZERS is a live music event taking place at 687 N Cora Street in Ridgway. The event is listed through the Ouray Ridgway community calendar, offering an evening of live music for attendees in the area.",
    pubDate: "2026-10-09T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Crystal Creek Band – Live at Floating Lotus Brewery",
    link: "https://events.ourayridgwayevents.com/event/crystal-creek-band-live-at-floating-lotus-brewery",
    description: "Crystal Creek Band brings its electric/acoustic fusion to Floating Lotus for a Friday night of live music. The North Fork Valley quartet blends folk, rock, bluegrass, jazz, funk, and alternative, pairing original songs with tasteful covers. The lineup features Trevor Storm on mandolin, electric guitar, fiddle, and vocals; Logan Wise on electric/acoustic guitar and vocals; Doug Gallob on electric bass and vocals; and Bron Hodges on drums and percussion. Friday, October 9, 6–9 PM at Floating Lotus Brewery. $10 cover at the door; no advance ticket sales.",
    pubDate: "2026-10-10T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/54056449502750/huge/f7619bf718d9b9b1e1f609d4d7979a4c6bb38e54.jpg"
  },
  {
    title: "Music Bingo @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/music-bingo-the-wright-4807",
    description: "Music Bingo @ the Wright WHEN? Doors at 6:30 pm • Event at 7:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE EVENT It’s bingo. But louder. And somehow emotionally complicated. Battle for glory using songs, questionable music knowledge, accidental dancing, and the sudden realization that one hit from 2007 still lives in your head rent-free. Expect singalongs, dramatic betrayals, nostalgic bangers, deep cuts, and at least one person absolutely convinced they should have won three rounds ago. Whether you’re a human jukebox or someone who confidently calls every song “that one TikTok song,” Music Bingo welcomes all skill levels and levels of chaos. Free to attend In-person event at the historic Wright Opera House Part of programming at the Wright Opera House, bringing arts, conversation, and community to downtown Ouray since 1889.",
    pubDate: "2026-10-10T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/54035210282619/huge/8e50fda6bb1e6a9598c14bbf7e7f3e0f7ecbd56b.jpg"
  },
  {
    title: "Lupita's Parking Lot Sale",
    link: "https://events.ourayridgwayevents.com/event/lupitas-parking-lot-sale",
    description: "A revival of Lupita's Parking Lot Sale A REVIVAL OF LUPITA'S PARKING LOT SALE! OCT. 10, 2026 • 8 AM–3 PM Ridgway Public Library, Ridgway $20 PER 10'×10'",
    pubDate: "2026-10-10T14:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway Public Library",
    imageUrl: "https://localist-images.azureedge.net/photos/53994378997204/huge/989a12812632d48454c8f52334ff01e5dc03a008.jpg"
  },
  {
    title: "Nature in Four Seasons: Growing Dormant",
    link: "https://events.ourayridgwayevents.com/event/nature-in-four-seasons-growing-dormant",
    description: "Are you interested in connecting with the landscapes of Ouray? Do you wish for a fun and engaging exploration that you can share with your family? Join SJMA in Ouray for the fourth exploration hike of the Nature in Four-Season series. For our fall exploration, we will investigate how, as days grow shorter, mountain species are in full gear to prepare for winter. Come witness these changes and find fun and creative ways to capture the color of the season using Naturalist Journal activities.",
    pubDate: "2026-10-10T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Visitor Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52948888142369/huge/a751aa96f77dfb66351272d701cd748a3cc4bdbc.jpg"
  },
  {
    title: "Ouray Library Fall Book Fair",
    link: "https://events.ourayridgwayevents.com/event/ouray-library-fall-book-fair",
    description: "The Ouray Library Foundation's fall fundraiser brings together a book sale, technology sale, and merchandise at the Ouray Community Center. Proceeds benefit the local library, with additional details available through the Ouray Library Foundation website.",
    pubDate: "2026-10-10T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/54057868506709/huge/5618357bf886b1d3db285a12ce1573af71e3170e.jpg"
  },
  {
    title: "Dallas Park Cemetery Tour",
    link: "https://events.ourayridgwayevents.com/event/dallas-park-cemetery-tour",
    description: "A guided tour of Dallas Park Cemetery led by Coleen McElroy, offered through the Ouray County Historical Society. Admission is $20 per person, with a discounted rate of $15 for OCHS members; reservations and prepayment are required by calling 970-325-4576.",
    pubDate: "2026-10-10T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Dallas Park Cemetery",
    imageUrl: "https://localist-images.azureedge.net/photos/52462667793124/huge/857907efd93056a1ba298d906bd6d5231a5f9d13.jpg"
  },
  {
    title: "Mineral Identification Workshop for Adults",
    link: "https://events.ourayridgwayevents.com/event/mineral-identification-workshop-for-adults",
    description: "A hands-on workshop for adults at the Ouray County Historical Society Research Center and Archive, focused on the basic identification of minerals found in the San Juan Mountains. The session is led by Robert Stoufer.",
    pubDate: "2026-10-10T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray County Historical Society Research Center and Archive",
    imageUrl: "https://localist-images.azureedge.net/photos/52278239272831/huge/3ace3fbbfa379d963003cda93eba859d285b4dcd.jpg"
  },
  {
    title: "“A WALK IN THE WOODS”: ACRYLIC PAINTING WORKSHOP WITH MARY PAT ETTINGER",
    link: "https://events.ourayridgwayevents.com/event/a-walk-in-the-woods-acrylic-painting-workshop-with-mary-pat-ettinger",
    description: "“A Walk in the Woods” Acrylic Painting Workshop with Mary Pat Ettinger October 10, 11:00 AM–3:00 PM Cora Annex, Ridgway Tuition: $75 incl. all supplies Registration: www.weehawkenarts.org Painting workshop focusing on fall colors in the forests and mountains. Mary Pat will provide students with images of both paintings and photographs of aspens, cottonwoods and the glorious San Juans mountains clothed in golden autumn splendor. Working with acrylics in a watercolor style, Mary Pat will assist both experienced and novice painters, helping them grow their painting skills. Colors mixing to achieve those lovely fall colors as well as composition options will be discussed and applied to the students painting choices. Laughter and learning combine to make Mary Pat's workshops a delightful experience. All supplies included! About Mary Pat Ettinger – Artist & Instructor Mary Pat Ettinger’s work is often described as peaceful and uplifting. …",
    pubDate: "2026-10-10T17:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/53967883969496/huge/d2428dc5e6782e6f1e062e79f5d622145108e918.jpg"
  },
  {
    title: "PAINT AND SIP WITH NICOLE GREENFIELD: “GOLDEN ASPENS“",
    link: "https://events.ourayridgwayevents.com/event/paint-and-sip-with-nicole-greenfield-golden-aspens",
    description: "Montrose Paint & Sip with Nicole 6:00pm-8:00pm $49 incl. all supplies and an adult beverage Sat, Oct 10th: Golden Aspens Sat, Nov 14th: Morning Peaks Sat, Dec 5th: Snow Topped Treeline Unwind, sip, and create! Join us for a relaxed painting session designed for all skill levels—no experience needed. Nicole will guide you through the featured painting while you enjoy a beverage of your choice! All art supplies and one adult beverage are included; just bring your creativity! About Nicole Greenfield: Nicole Greenfield is a painter based in Ridgway, Colorado. Working primarily in acrylic and oil, she creates expressive portraits and atmospheric landscapes that explore the quiet intimacy found in observing people and the natural world. Nicole is a self-taught artist who has developed her skills through years of dedicated practice and online learning. …",
    pubDate: "2026-10-11T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Montrose",
    imageUrl: "https://localist-images.azureedge.net/photos/53967916717098/huge/ca0a75a89f0b2971d55317823daf190b4a7fb259.jpg"
  },
  {
    title: "Alysha Brilla - Live",
    link: "https://events.ourayridgwayevents.com/event/alysha-brilla-live",
    description: "SATURDAY|| Doors: 6:30 PM || Show: 7:00 PM || Tickets: $28 in advance / $32 Day of Show || Mostly dancehall style show with limited open seats around the room || Some Reserved Section Seats Available in advance Presented in partnership by The Sherbino with Pickin’ Productions ABOUT ALYSHA BRILLA Alysha Brilla is a 3× JUNO Award nominated songwriter, producer and electrifying live performer, as well as the 2025 Women in Music International Leadership Honouree and a 2024 Canadian Screen Award nominee. Sounds of earth, songs of stars. Rooted in her Indo-Tanzanian heritage and shaped by the Great Lakes in Canada, Brilla’s sound is distinctly unique. Driven by global percussion, percussive guitar and soaring vocals, Brilla’s sound is a transcendent call and response – creating a live show that is more than a performance; it is an interactive, embodied experience. …",
    pubDate: "2026-10-11T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/53426461193935/huge/60b2d5b995c4ae4774c5f6a3f12d2d813ef7162b.jpg"
  },
  {
    title: "Try Pickleball for Teens!",
    link: "https://events.ourayridgwayevents.com/event/try-pickleball-for-teens",
    description: "A beginner-friendly pickleball session for teens at the Ridgway Pickleball Courts, led by coaches from the Ridgway Pickleball Club. Participants receive one-on-one instruction that builds toward group gameplay, following the coaches' \"I do, you do, we do\" teaching approach — registration is required to attend.",
    pubDate: "2026-10-11T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway Pickleball Courts",
    imageUrl: "https://localist-images.azureedge.net/photos/54055901310640/huge/f2f678de5fd28531ae3232aa7992196215b95d6d.jpg"
  },
  {
    title: "Fall Break - Ridgway Schools",
    link: "https://events.ourayridgwayevents.com/event/fall-break-ridgway-schools",
    description: "Fall Break for Ridgway Schools begins on this date, giving students in the Ridgway district a scheduled pause from the academic calendar. The break is a planned recess coordinated through the Ouray-Ridgway area school calendar.",
    pubDate: "2026-10-12T06:00:00.000Z",
    endDate: "2026-10-16",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52196842516113/huge/34c03f502c2e6b24c2bdceae7a155d7b6d463e8f.jpg"
  },
  {
    title: "Monthly Welcome Home Alliance Veteran's Coffee @ The Sherbino",
    link: "https://events.ourayridgwayevents.com/event/monthly-welcome-home-alliance-veterans-coffee-the-sherbino",
    description: "A monthly veterans' gathering hosted by the Welcome Home Alliance at The Sherbino, offering coffee, donuts, and camaraderie for veterans of every branch, era, and ability. Mike Trickey and April Heard will be on hand to share information on topics including navigating the VA, housing, jobs, volunteer opportunities, and community resources.",
    pubDate: "2026-10-13T16:00:00.000Z",
    endDate: "2026-11-10",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/52236172073282/huge/134613035140f6c008febe657f2e7e23acc365e9.jpg"
  },
  {
    title: "TYLER SIMMONS",
    link: "https://events.ourayridgwayevents.com/event/tyler-simmons-4776",
    description: "Tyler Simmons performs live at a venue on North Cora Street in Ridgway. The event is listed on the Ouray Ridgway community calendar as a live music performance.",
    pubDate: "2026-10-13T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Teen Top Rope Climbing",
    link: "https://events.ourayridgwayevents.com/event/teen-top-rope-climbing",
    description: "A guided top rope climbing program for teens, led by Basecamp Ouray Mountain Guides at a local outdoor site. Participants will meet at the gazebo across from the library, with details, a schedule, and a packing list sent to registrants by email in advance.",
    pubDate: "2026-10-14T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/54082874930523/huge/077cb77cd39e2cbb06ed46053a13ccc07c5611ce.jpg"
  },
  {
    title: "Obsession: Movie Night @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/obsession-movie-night-the-wright",
    description: "Obsession: Movie Night @ the Wright WHEN?Wednesday, October 14 Doors at 6:30 PM | Movie at 7:00 PM WHERE?Wright Opera House 472 Main St., Ouray, Colorado RUN TIME: 1 hour, 49 minutes RATING: R ABOUT THE FILM Obsession (2025) is a supernatural horror film about Bear, a music-store employee whose wish for his childhood friend Nikki to fall in love with him becomes something far darker—and far more dangerous—than he imagined. A twisted, bloody, and sharply funny nightmare about desire, control, and the terrible things that happen when getting exactly what you want turns out to be the worst possible outcome. WHY SEE IT?Because a love story with a monkey’s-paw problem is never just a love story. HOW?Tickets: $5 In-person screening at the historic Wright Opera House Concessions available Part of Movie Night @ the historic Wright Opera House — bringing film, community, and conversation to downtown Ouray since 1909.",
    pubDate: "2026-10-15T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/54035246928726/huge/df8435a1f9605f9b27f285c37e3bb1d44a375465.jpg"
  },
  {
    title: "Talk: The Sherbino Presents: India Wood’s HIKING THE COLORADO X",
    link: "https://events.ourayridgwayevents.com/event/talk-the-sherbino-presents-india-woods-hiking-the-colorado-x",
    description: "Doors open at 6:00 PM; the talk begins at 6:30 PM. India Wood shares a short documentary, slide show and stories from her self-designed 1,500-mile hiking route across Colorado, including observations on the San Juan Mountains, ranching communities, public and private lands, and the challenges of a solo journey.",
    pubDate: "2026-10-16T00:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/54066524162274/huge/48a226597b3ea784c96c139544da72ad35653f54.jpg"
  },
  {
    title: "ALPINE JAM",
    link: "https://events.ourayridgwayevents.com/event/alpine-jam-3576",
    description: "Alpine Jam is a live music event taking place in Ridgway, Colorado. The evening gathering brings together music fans for a night of live performances in the mountain community.",
    pubDate: "2026-10-16T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Love Your Gorge",
    link: "https://events.ourayridgwayevents.com/event/love-your-gorge-2026",
    description: "The Uncompahgre Watershed Partnership and Ouray Ice Park invite volunteers to Love Your Gorge – a fun day of hard work to cleanup and maintain infrastructure and the environment around the Uncompahgre Gorge in Ouray. Our 2026 work plan in the park includes repairing and reinforcing stairs at the Kid's Wall, picking up litter above and inside the gorge. Inside the gorge, often log moving and large metal removal is also necessary. We may pull plants from rock walls, requiring work on ropes, if advanced climbers are available. Plus, seeding the slope between Camp Bird Road and Box Canon Road is also planned, as part of an erosion control project funded by a non-point source grant from the Colorado Department of Public Health and Environment. Enjoy lunch donated by Ouray Grocery, giveaways donated by the organizers and sponsors, and an optional tour of the park! …",
    pubDate: "2026-10-17T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Ice Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53950572424037/huge/aa74aed14780ee99117533d3ad6303db0ccf191b.jpg"
  },
  {
    title: "No Kings Afterparty in the Garden",
    link: "https://events.ourayridgwayevents.com/event/no-kings-afterparty-in-the-garden",
    description: "A late-night afterparty held in the garden at Chloe's Charcuterie & Wine, following the No Kings event on October 17th. The gathering offers a festive outdoor setting at one of the area's well-known wine and charcuterie spots.",
    pubDate: "2026-10-17T21:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Chloe's Charcuterie & Wine",
    imageUrl: "https://localist-images.azureedge.net/photos/53853125631578/huge/4d4b1a2e3ca65db2f52fab5279671e0107a58dc9.jpg"
  },
  {
    title: "Posture: The Joy of Alignment",
    link: "https://events.ourayridgwayevents.com/event/posture-the-joy-of-alignment",
    description: "POSTURE: The Joy of Alignment Stop Shrinking. Start Rising. Imagine standing taller, breathing deeper, moving freer, and feeling effortlessly at home in your body. Through asana, breath, and embodied awareness, you’ll discover how to lengthen what’s tight, strengthen what’s weak, and restore your body’s natural architecture, so you leave feeling lighter, clearer, more energized, and beautifully aligned from the inside out. YOUR ARCHITECTURE OF ALIGNMENT Explore your posture from the ground up and discover how small shifts in alignment can change the way you stand, move, breathe, and feel. ROOT — Find Your Foundation Awaken and align your feet, ankles, and knees to create a strong, responsive foundation that supports your joints and brings greater buoyancy and stability to everything above. PELVIS — Stand in Your Power Balance strength and mobility around your pelvis and lumbar spine to support your center, reduce strain, and restore vitality. …",
    pubDate: "2026-10-18T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Bee True You Wellness & Creative Studio",
    imageUrl: "https://localist-images.azureedge.net/photos/53940133685119/huge/12d87bcb7ab37fac8b109f8ddf888685a78d34d4.jpg"
  },
  {
    title: "Mountainfilm on Tour – Montrose",
    link: "https://events.ourayridgwayevents.com/event/mountainfilm-on-tour-montrose",
    description: "Doors open at 2:30 PM; films begin at 3:00 PM. Mountainfilm on Tour brings an afternoon of documentary shorts about adventure, exploration, resilience and people who push the boundaries of what is possible. The Adventure Shorts program includes climbing, skiing, biking, paddling, running and other outdoor stories. Family-friendly.",
    pubDate: "2026-10-18T21:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Montrose Pavilion",
    imageUrl: "https://localist-images.azureedge.net/photos/54066524437755/huge/a340c3c7b6d6a9c5b6783370893f454ec37fd082.jpg"
  },
  {
    title: "THE YOUNG FABLES",
    link: "https://events.ourayridgwayevents.com/event/the-young-fables",
    description: "The Young Fables will perform a live music show at a venue on North Cora Street in Ridgway. The event is listed through the Ouray Ridgway community calendar.",
    pubDate: "2026-10-18T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "BRITLEY & MATT",
    link: "https://events.ourayridgwayevents.com/event/britley-matt-7185",
    description: "Britley & Matt are performing live at a venue on North Cora Street in Ridgway. The event is an evening music performance hosted in the Ouray-Ridgway area.",
    pubDate: "2026-10-20T22:00:00.000Z",
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
    pubDate: "2026-10-20T22:30:00.000Z",
    endDate: "2026-11-17",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/52568082541214/huge/49b7c4c5e83ca4147b872fdb5be7fe87b78551c5.jpg"
  },
  {
    title: "Ridgway FUSE Creative Main Street - Committee Meeting",
    link: "https://events.ourayridgwayevents.com/event/ridgway-fuse-creative-main-street-committee-meeting",
    description: "Ridgway FUSE, a Creative District & Main Street Program, nurtures the cultural and economic vitality of Ridgway, Colorado All Ridgway FUSE Committee Meetings are open to the public. Click here for agendas and notes. Interested residents may apply to serve on the FUSE committee here. Email Tera Wick at twick@town.ridgway.co.us or call 970-626-5308 x 215 with questions.",
    pubDate: "2026-10-20T23:30:00.000Z",
    endDate: "2026-11-18",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/52305506266326/huge/6e40de5340fac46ca9bf9f33e9c31ed9ab5985ce.jpg"
  },
  {
    title: "TODDLER STORYTIME ART FOR AGES 2.5-5",
    link: "https://events.ourayridgwayevents.com/event/toddler-storytimeartfor-ages-2-5",
    description: "TODDLER STORYTIME ART FOR AGES 2.5-5 Wednesdays, 10:00am–11:00am Cora Annex, 145N Cora St, Ridgway Registration: www.weehawkenarts.org Session 1 (4 weeks • $70): September 16 – October 7Session 2 (4 weeks • $70): October 21 – November 11Session 3 (3 weeks • $55): December 2 – December 16Come join us for Storytime + Art! Each week, your child will enjoy story time with songs and finger rhymes, a process‑art project, and a variety of creative sensory play. We end with a quick cleanup, circle time, and movement songs. This class gently supports preschool prep and helps your child develop important school‑readiness skills—such as fine‑motor coordination, independence, and the ability to listen and follow directions—in a warm, supportive setting. Children will grow in: Social, language, and communication skillsFine‑ and gross‑motor coordinationListening and direction‑following abilitiesConfidence, creativity, and imaginationParents and caregivers stay to support their child—but we handle the mess! …",
    pubDate: "2026-10-21T16:00:00.000Z",
    endDate: "2026-11-11",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/53780434962919/huge/3aff831f26d7f9d4824893f89d8fd88416047a44.jpg"
  },
  {
    title: "AFTER SCHOOL ART FOR AGES 8-12",
    link: "https://events.ourayridgwayevents.com/event/afterschool-artfor-ages-8-12-7963",
    description: "AFTER SCHOOL ART FOR AGES 8-12 Wednesdays, 3:15–4:45 pm Cora Annex, 145N Cora St, Ridgway Registration: www.weehawkenarts.org Session 1 (4 weeks • $85): September 16 – October 7Session 2 (4 weeks • $85): October 21 – November 11Session 3 (3 weeks • $70): December 2 – December 16Each week, students will explore an exciting theme while experimenting with a wide range of materials and techniques. Drawing inspiration from well-known artists and design styles, young artists will be supported in discovering their own unique creative voice in a fun, nurturing, studio-like setting. These classes are designed to foster a love of the arts through hands-on exploration, age-appropriate projects, and a focus on the joy of the creative process.. A student art reception will be held in December. Students will take home their collected works in the days following the event. …",
    pubDate: "2026-10-21T21:15:00.000Z",
    endDate: "2026-11-11",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/53780624349826/huge/2ad5a3657f19d47b14c7833f838ac040c0836f38.jpg"
  },
  {
    title: "Hoppers: Movie Night @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/hoppers-movie-night-the-wright",
    description: "Hoppers: Movie Night @ the Wright WHEN? Wednesday, October 21 Doors at 6:30 PM | Movie at 7:00 PM WHERE? Wright Opera House 472 Main St., Ouray, Colorado RUN TIME: 1 hour, 44 minutes RATING: PG ROTTEN TOMATOES SCORE: 94% ABOUT THE FILM Disney and Pixar’s Hoppers follows Mabel, an animal-loving young woman who uses new technology to transfer her consciousness into a lifelike robotic beaver. Her mission: communicate with the animals and help protect their habitat from human development. What begins as a strange little experiment becomes a big, funny, warm-hearted adventure about nature, friendship, and finding out what the world looks like from somebody else’s point of view. WHY SEE IT? Because Pixar has finally answered the question no one knew they were asking: what if you could become a beaver for a good cause? HOW? …",
    pubDate: "2026-10-22T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/54035264266437/huge/4f123a55b3d2309817e574335281ca0e9129f0c9.jpg"
  },
  {
    title: "AFTER SCHOOL ART FOR AGES 5-8",
    link: "https://events.ourayridgwayevents.com/event/afterschool-artfor-ages-5-8-6970",
    description: "AFTER SCHOOL ART FOR AGES 5-8 Thursdays, 3:15–4:30 pm Cora Annex, 145N Cora St, Ridgway Registration: www.weehawkenarts.org Session 1 (4 weeks • $85): September 17 – October 8Session 2 (4 weeks • $85): October 22 – November 12Session 3 (3 weeks • $70): December 3 – December 17Each week, students will explore exciting themes and projects while experimenting with a wide variety of art materials—such as watercolor and acrylic paints, oil and chalk pastels, clay, collage, printmaking, and more. Through open-ended projects, students are encouraged to explore their creativity, make artistic choices, take creative risks, and discover their unique artistic voice. Our classes nurture imaginative thinking and storytelling, helping children express big ideas and emotions through visual narratives and personal creations. In addition to sparking imagination, our signature art projects support the development of fine motor skills, confidence, and social-emotional development in a fun group environment. …",
    pubDate: "2026-10-22T21:15:00.000Z",
    endDate: "2026-11-12",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/53780725919104/huge/846566299e8e325221de54dd5a54a0fd6427fbf5.jpg"
  },
  {
    title: "Pumpkins & Flowers at The Adobe Inn with San Juan Blooms!",
    link: "https://events.ourayridgwayevents.com/event/pumpkins-flowers-at-the-adobe-inn-with-san-juan-blooms",
    description: "An evening of Pumpkins & Flowers at The Adobe Inn! Kick off fall with a little hands-on flower arranging. Join San Juan Blooms for our Pumpkins + Flowers Workshop, where you’ll sip a cocktail, enjoy delicious appetizers, and build your own seasonal centerpiece using fresh autumn blooms and local pumpkins. Event Details When: Thursday, October 22, 2026 | 6:00 PM – 9:00 PM Where: The Adobe Inn - Ridgway, CO Tickets: $85 per person What’s Included: All supplies, fresh flowers, and prepped pumpkins Bites and appetizers throughout the evening One drink (cocktails, mocktails, beer, or wine)",
    pubDate: "2026-10-23T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Adobe Inn",
    imageUrl: "https://localist-images.azureedge.net/photos/53853672137353/huge/8b0ef433dfa6ed38ee66e112e97c6806157e5e49.jpg"
  },
  {
    title: "Rocky Horror Picture Show Live Shadow Cast Edition",
    link: "https://events.ourayridgwayevents.com/event/rocky-horror-picture-show-live-shadow-cast-edition",
    description: "Doors open at 7:30 PM; shows begin at 8:00 PM. The Rocky Horror Picture Show returns with a live local shadow cast performing alongside the film, plus audience callbacks, singing, dancing and an included venue-approved participation prop kit. Ages 18+; minors require parental permission or an accompanying parent.",
    pubDate: "2026-10-23T02:00:00.000Z",
    endDate: "2026-10-25",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/54066524682512/huge/e95bf2e6509f8e2bf351e2781dcc132332bdb7c2.jpg"
  },
  {
    title: "STEAM Art Explorers for Ages 5–8 in Montrose",
    link: "https://events.ourayridgwayevents.com/event/steam-art-explorers-for-ages-58-in-montrose",
    description: "MONTROSE AFTER SCHOOL ART SESSION 1 (5 WEEKS • OCTOBER 23 – NOVEMBER 20) Join us for a 5-week course that explores the intersection of art, science, technology, engineering, and math! In this hands-on art class, students will experiment with creative processes that turn scientific concepts into exciting works of art. Through a variety of fun projects, students will investigate chemical reactions, motion, light, color, and patterns. Projects include creating fizzy paintings using bubbling chemical reactions, experimenting with movement and gravity through pendulum painting, designing kaleidoscopes to explore symmetry and reflection, and making colorful lava lamps to investigate density and liquid interactions. Students will also take on collaborative challenges, activities, and movement games to build creativity, experimentation, problem-solving, and teamwork. With encouragement and plenty of opportunities to experiment, students will grow their artistic skills and confidence while embracing their creativity. …",
    pubDate: "2026-10-23T21:45:00.000Z",
    endDate: "2026-11-20",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Montrose",
    imageUrl: "https://localist-images.azureedge.net/photos/54055496965288/huge/4ac547d8a4681a49d4e49d0024729211c03874a6.jpg"
  },
  {
    title: "AIDAN SWEENEY",
    link: "https://events.ourayridgwayevents.com/event/aidan-sweeney",
    description: "Aidan Sweeney performs live music at a venue on North Cora Street in Ridgway. The event is listed on the Ouray Ridgway community calendar.",
    pubDate: "2026-10-23T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "PINE NEEDLE WEAVING: JEWELRY, BASKETS AND MORE! WITH EMILY KNICKERBOCKER",
    link: "https://events.ourayridgwayevents.com/event/pine-needle-weaving-jewelry-baskets-and-more-with-emily-knickerbocker",
    description: "Pine Needle Weaving: Jewelry, Baskets and More! with Emily Knickerbocker October 24th, 2026 | 10:00 am - 2:00 pm Cora Annex, Ridgway $75 includes all supplies Registration: www.weehawkenarts.org Discover the beauty and versatility of pine needles as you create your own wearable art and decorative pieces! In this class, students will explore the traditional craft of pine needle weaving and learn how to transform this natural material into unique, handcrafted items such as coiled jewelry, small baskets, hair accessories, and other creative forms. Students will work with naturally shed ponderosa pine needles and complementary materials like thread, found objects, and a wild clay or wood basket base. Through hands-on practice, you will learn essential techniques including preparing and softening needles, coiling, stitching, shaping, and finishing your designs. This beginner-friendly class is perfect for nature lovers and anyone interested in slowing down and connecting to the land through creative expression. …",
    pubDate: "2026-10-24T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/53967939605631/huge/56b61991a8d062e4e1f71cbdf51fdd4fa7b4daea.jpg"
  },
  {
    title: "4th Annual Boo-Mont Halloween Ball",
    link: "https://events.ourayridgwayevents.com/event/4th-annual-boo-mont-halloween-ball",
    description: "Get ready for the 4th Annual Boo-Mont Halloween Ball at the historic Beaumont Hotel in Ouray, Colorado! Come dressed to impress, scare, or simply make a statement! The evening will feature a costume contest with prizes, a DJ, spooky drink specials, a cash bar, and delicious hors d'oeuvres. 🎭 Costume Contest 🎶 DJ 🍸 Cash Bar + Spooky Drink Specials 🥂 Hors d'oeuvres 👻 Halloween Fun All Night 🎟️ Tickets are on sale now! Tickets are limited, so don't wait to get yours. 18 and up only. Must show valid ID at the door. Get ready for a night of costumes, cocktails, music, and Halloween magic at the Beaumont.",
    pubDate: "2026-10-25T02:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Beaumont Hotel & Spa",
    imageUrl: "https://localist-images.azureedge.net/photos/53860846025163/huge/937b6538c82ba8eff32aac54b7325895b4cde3f4.jpg"
  },
  {
    title: "Solkattu Workshop",
    link: "https://events.ourayridgwayevents.com/event/solkattu-workshop",
    description: "Learn an ancient rhythmic vocalization system with experts David and Arlyn Alderdice. Step, clap, and vocalize together using this fun and accessible method to deepen your relationship with music and life.",
    pubDate: "2026-10-25T20:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "United Church Of The San Juans",
    imageUrl: "https://localist-images.azureedge.net/photos/52492056342544/huge/bfe9154ac1ba36fc2f3a845ca66d6a96dd9905ba.jpg"
  },
  {
    title: "Teen Takeover at Ouray Hot Springs Pool",
    link: "https://events.ourayridgwayevents.com/event/teen-takeover-at-ouray-hot-springs-pool",
    description: "Teen Takeover at Ouray Hot Springs Pool is an evening event giving middle and high school students dedicated time to enjoy the pool facility with swimming, basketball, races on the Wibit, games, music, and food. The event runs in two separate sessions — one for middle schoolers and one for high schoolers — and is free for Ouray Hot Springs members.",
    pubDate: "2026-10-25T23:00:00.000Z",
    endDate: "2026-11-16",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Hot Springs",
    imageUrl: "https://localist-images.azureedge.net/photos/53924398882536/huge/a5451161d264c1870d73a22c5d5625c3a29a8c63.jpg"
  },
  {
    title: "BRITLEY & MATT",
    link: "https://events.ourayridgwayevents.com/event/britley-matt-7748",
    description: "Britley & Matt perform live at a venue on North Cora Street in Ridgway. The event is an evening of live music hosted at what appears to be the Colorado Boy Depot.",
    pubDate: "2026-10-27T22:00:00.000Z",
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
    pubDate: "2026-10-27T23:30:00.000Z",
    endDate: "2026-11-25",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52092171660517/huge/0e628304026c92db25e8df01849c962ac902a3b4.jpg"
  },
  {
    title: "Sherb Literary Living Room featuring Pam Houston with her new book: “Animals Taught Me Everything”",
    link: "https://events.ourayridgwayevents.com/event/sherb-literary-living-room-featuring-pam-houston-with-her-new-book-animals-taught-me-everything-7659",
    description: "Doors: 6:00 PM || Talk starts: 6:30 PM || $15 entry Setting: Seated Join us for our Literary Living Room as Pam Houston features her just-published book, Animals Taught Me Everything. What can a wagging tail and soaring wings teach us about a life well lived? From Icelandic mares and Irish wolfhounds to elephants, leopards, hyenas, and a desert-adapted lioness named Charlie, Pam Houston has learned life’s most important lessons from animals. How to play. How to rest. How to love. How to die. How to be present with the dying. How to be present with the living and with the Earth. How to find joy in the least likely places. How to find joy, literally, everywhere. With playful sincerity, Houston finds power and promise in the teachings of our fellow creatures and reminds us that animals are here for us, every day and everywhere. …",
    pubDate: "2026-10-28T00:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/54093161228645/huge/7e89b3abffd49ff677ff84078f716777d776bb9b.jpg"
  },
  {
    title: "Weapons: Movie Night @ the Wright.",
    link: "https://events.ourayridgwayevents.com/event/weapons-movie-night-the-wright",
    description: "Weapons: Movie Night @ the Wright. WHEN? Wednesday, October 28 Doors at 6:30 PM | Movie at 7:00 PM WHERE? Wright Opera House 472 Main St., Ouray, Colorado RUN TIME: 2 hours, 8 minutes RATING: R ROTTEN TOMATOES SCORE: 95% ABOUT THE FILM When every child in the same elementary-school class disappears from their homes at exactly 2:17 a.m., a small town is left searching for answers—and somebody to blame. From Zach Cregger, the writer-director of Barbarian, Weapons is a strange, frightening, darkly funny horror mystery that follows the people caught in the fallout as the truth slowly comes into focus. WHY SEE IT? Because the fewer details you know going in, the better. Just know that bedtime in Maybrook is not going well. HOW? Tickets: $5 In-person screening at the historic Wright Opera House. …",
    pubDate: "2026-10-29T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/54035284357305/huge/c0b13b236a6cb245075f76963685929bd6a42793.jpg"
  },
  {
    title: "\"Hello to Golden Autumn\" Acrylic Painting Workshop",
    link: "https://events.ourayridgwayevents.com/event/hello-to-golden-autumn-acrylic-painting-workshop",
    description: "“Hello to Golden Autumn” Acrylic Painting Workshop with Mary Pat Ettinger October 30, 9:30 AM–1:30 PM Studio 4, Montrose Tuition: $75 inc. all supplies Registration: www.weehawkenarts.org Painting with acrylics in a watercolor style, students will enjoy exploring either landscape fall scenes or flowers and pumpkins scenes. Mary Pat will provide images for students to work from, or students may bring their own reference photos. Mary Pat will work with students to achieve a good composition and will help understand how various colors work well to create a vibrant painting. Students may expect to enjoy a delightful painting time filled with learning and laughter. All supplies included! About Mary Pat Ettinger – Artist & Instructor Mary Pat Ettinger’s work is often described as peaceful and uplifting. Having lived much of her life in rural settings, she draws daily inspiration from solitude, natural beauty, and the simple joys around her. …",
    pubDate: "2026-10-30T15:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Creative Arts in Montrose",
    imageUrl: "https://localist-images.azureedge.net/photos/53967861373929/huge/1167e663cc84a9c4be3eccaa396cf973741529f4.jpg"
  },
  {
    title: "JELLY BOWL BAND",
    link: "https://events.ourayridgwayevents.com/event/jelly-bowl-band",
    description: "The Jelly Bowl Band performs a live music show at a venue on N Cora Street in Ridgway. The event takes place in the evening on October 30th, offering a night of live music the day before Halloween.",
    pubDate: "2026-10-30T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Minions and Monsters: Movie Night @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/minions-and-monsters-movie-night-the-wright",
    description: "WHEN? Friday, October 30 Doors at 6:30 PM | Movie at 7:00 PM WHERE? Wright Opera House 472 Main St., Ouray, Colorado RUN TIME: 1 hour, 30 minutes RATING: PG ABOUT THE FILM The Minions are back—and this time they are headed to 1920s Hollywood with dreams of becoming movie stars. After discovering that the arrival of sound means Minionese is not exactly the language of leading men, the Minions decide to make a monster movie of their own. What could possibly go wrong? Quite a lot, naturally. A big-screen comedy full of old-Hollywood chaos, monster-movie mayhem, and the tiny yellow beings who have never once been trusted with a plan. WHY SEE IT? Because it is almost Halloween, and a Minion-made monster movie is exactly the kind of nonsense the season deserves. HOW? …",
    pubDate: "2026-10-31T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/54035307723339/huge/023d6c0350f30b116080d9dd9507ac6801c8703a.jpg"
  },
  {
    title: "Easy Jim ~ 2 Night Halloween Run at The Sherbino",
    link: "https://events.ourayridgwayevents.com/event/easy-jim-2-night-halloween-run-at-the-sherbino",
    description: "Easy Jim Halloween Run Brings Two Nights of Grateful Dead Celebrations to the Sherbino! October 30 & 31, 2026 • 8:00 p.m. nightly Sherbino Theatre | Ridgway, Colorado Some concerts are just concerts. This is a Run! The Sherbino and Pickin’ Productions invite Deadheads, music lovers, Halloween enthusiasts, and anyone looking for an unforgettable weekend to join us for the Easy Jim Halloween Run—a special two-night celebration of the music, community, and spirit of the Grateful Dead on Friday, October 30 and Saturday, October 31. Both performances begin at 8:00 p.m. Within Grateful Dead and jam-band culture, Halloween shows have become legendary. Alongside New Year’s Eve, they’re among the most anticipated performances of the year—filled with costumes, surprises, dancing, and the kind of musical spontaneity that has kept fans traveling from show to show for generations. That’s exactly what makes a Run so special. …",
    pubDate: "2026-10-31T02:00:00.000Z",
    endDate: "2026-11-01",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/53551962688679/huge/530cd950230f451d84a4795936d5b7a904b733f2.jpg"
  },
  {
    title: "Happy Halloween",
    link: "https://events.ourayridgwayevents.com/event/happy-halloween",
    description: "Ouray's Halloween celebration includes a pumpkin float and fall photo opportunity at the Ouray Hot Springs, pumpkin decorating in Fellin Park, and a costume contest with gift card prizes awarded across multiple age categories. The festivities run throughout the afternoon on October 31st.",
    pubDate: "2026-10-31T18:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray, Colorado",
    imageUrl: "https://localist-images.azureedge.net/photos/54109990596297/huge/ff02999ed014c36a19d03a5e04130f621d1212a6.jpg"
  },
  {
    title: "Trick or Treat: Witches @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/trick-or-treat-witches-the-wright",
    description: "WHEN? Saturday, October 31 4:00–7:00 PM WHERE? Wright Opera House 472 Main St., Ouray, Colorado ABOUT THE EVENT The Spooky Witches and Warlocks are taking over the Wright Opera House for Halloween. Bring the family downtown for Trick or Treat: Witches at the Wright. Stop by for candy, a little friendly fright, and Halloween fun inside one of Ouray’s most historic buildings. HOW? Free and open to the public Family-friendly trick-or-treating Candy while supplies last Halloween fun at the historic Wright Opera House in downtown Ouray.",
    pubDate: "2026-10-31T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/54035396754488/huge/0ff17d6c525d45e896d55bfebccad3217d6391db.jpg"
  },
  {
    title: "Casper: Movie Night @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/casper-movie-night-the-wright",
    description: "A Halloween screening of the 1995 PG film *Casper* at the Wright Opera House in Ouray, with doors opening at 6:30 PM and the movie beginning at 7:00 PM. The film runs approximately one hour and forty minutes and follows a young girl and her paranormal-therapist father as they encounter the friendly ghost Casper.",
    pubDate: "2026-11-01T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/54035420061248/huge/d9483f91f6cbf291d9c98abc718e1ec3869ac8ae.jpg"
  },
  {
    title: "November - Art Opening: Film Stills-Ridgway Independent Film Fest",
    link: "https://events.ourayridgwayevents.com/event/art-opening-film-stills-ridgway-independent-film-fest",
    description: "Get a truly unique sneak preview of the upcoming film festival at this opening reception! The art of the short film is the focus of this exhibition, which extracts the most captivating film stills from this year's selected films, and gives viewers a chance to slow down and really enjoy these images as works of art. In coordination with the annual Independent Film Festival (November 13-15) this show is both a preview and a celebration of the art of short filmmaking.",
    pubDate: "2026-11-07T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53048304229484/huge/448e2d96ea605dd9b840c088158ffcfb1b9eebeb.jpg"
  },
  {
    title: "Ongoing: Film Stills from the Ridgway Independent Film Fest",
    link: "https://events.ourayridgwayevents.com/event/copy-of-art-opening-film-stills-ridgway-independent-film-fest",
    description: "The art of the short film is the focus of this exhibition, which extracts the most captivating film stills from this year's selected films, and gives viewers a chance to slow down and really enjoy these images as works of art. In coordination with the annual Independent Film Festival (November 13-15) this show is both a preview and a celebration of the art of short filmmaking.",
    pubDate: "2026-11-07T00:00:00.000Z",
    endDate: "2026-11-26",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53048306784001/huge/b4907ccb0dd0b51c0bd862f76e556e669e3684c2.jpg"
  },
  {
    title: "Introduction to Copper Jewelry with Emily Knickerbocker",
    link: "https://events.ourayridgwayevents.com/event/introduction-to-copper-jewelry-with-emily-knickerbocker-2661",
    description: "Learn the basics of handcrafted copper jewelry with Emily Knickerbocker. Students will work with copper wire and sheet metal while practicing sawing, filing, shaping, texturing and stamping, finishing with patinas, and introductory copper enameling. No prior experience is necessary; tools and materials are provided.",
    pubDate: "2026-11-07T17:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Montrose",
    imageUrl: "https://localist-images.azureedge.net/photos/54066522411096/huge/885e72b708524a41760d36b4ecda6d7b31bbbc06.jpg"
  },
  {
    title: "Watercolor with Anita Winter: “Still Waters”",
    link: "https://events.ourayridgwayevents.com/event/watercolor-with-anita-winter-still-waters",
    description: "Learn to create reflections and still-water effects in watercolor with Anita Winter through demonstrations, guided exercises and individualized instruction. Participants will practice several techniques and apply them to a finished painting. A reference image is provided; participants should bring their own watercolor supplies.",
    pubDate: "2026-11-07T17:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/54066522649708/huge/a35808b29295063770a1a017fa3e070e4b7d2146.jpg"
  },
  {
    title: "OuROCK! 2026 Climbing Festival",
    link: "https://events.ourayridgwayevents.com/event/ourock-2026-climbing-festival",
    description: "The Annual Ouray Climbers Alliance Fundraiser & Membership Drive is back! Come join our local climbing community for a free, all-ages festival! Climb, compete, eat, drink and hang out while supporting the work that keeps Ouray’s climbing areas accessible, maintained, and thriving. This year we’ll feature: 🧗 Walk-up guided climbing wall for adults & kids, with gear provided 🎶 Live DJ music with DJ Straylight 🏆 Climbing competition open to all ages 🍕 Fresh-baked, hand-tossed pizza* 🍺 Beer & other beverages* 🎟️ Silent auction & raffle *Members receive free beer and pizza, plus one raffle ticket. Beer is 21+. Food and beverages are available while supplies last. The event is free and open to everyone, and you’re invited to join OCA as a member at the event. …",
    pubDate: "2026-11-08T19:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Rotary Park",
    imageUrl: "https://localist-images.azureedge.net/photos/54012851240466/huge/36d4a8cb84eeb694d62a49aae6146ab5257a6e9f.jpg"
  },
  {
    title: "Teeth to the Wind: fundraiser for George & Michael Gardner Fund",
    link: "https://events.ourayridgwayevents.com/event/teeth-to-the-wind",
    description: "A fundraiser at the Ouray County 4-H Center featuring a screening of *Teeth to the Wind*, a film by alpinist Michael Gardner and his partner Sam Hennessey documenting their seasons in the Tetons — described by Gardner himself as something other than a traditional climbing film. Proceeds benefit the George and Michael Gardner Fund.",
    pubDate: "2026-11-10T13:00:00.000Z",
    endDate: "2026-11-11",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray County 4-H Center",
    imageUrl: "https://localist-images.azureedge.net/photos/53897046880484/huge/13cfa3523d07ba3e5c34401b1895f185c1c548d9.jpg"
  },
  {
    title: "Watercolor & Wine with Katey Fetch: Moonlight & Mountains",
    link: "https://events.ourayridgwayevents.com/event/watercolor-wine-with-katey-fetch-moonlight-mountains",
    description: "Create a moonlit mountain watercolor with Katey Fetch in a relaxed paint-and-sip class. Designed for beginners and welcoming to all experience levels, the class includes step-by-step guidance, one beverage and all art supplies.",
    pubDate: "2026-11-13T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/54066522860674/huge/ec6044316283ccc798d207fc858154d0421bc0ff.jpg"
  },
  {
    title: "Ridgway Independent Film Fest 2026",
    link: "https://events.ourayridgwayevents.com/event/ridgway-independent-film-fest-2026",
    description: "November 13 – November 15 12 Years of Fierce, Fearless, Independent Film The Ridgway Independent Film Festival (RIFF) returns in 2026 with its 12th year of celebrating bold storytelling, emerging filmmakers, and the power of community through the lens of independent film. Rooted in a volunteer-driven, grassroots effort born shortly after Ridgway became one of Colorado’s first Certified Creative Districts, RIFF continues to evolve while honoring its origins. This year, RIFF returns to its longtime home in November, taking place November 13–15, 2026, with a refreshed structure designed to create deeper connection and conversation. RIFF 2026 will open with a Friday night kickoff event, followed by two full days of film screenings on Saturday and Sunday at the historic Sherbino Theater in downtown Ridgway. …",
    pubDate: "2026-11-13T23:00:00.000Z",
    endDate: "2026-11-15",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/52598272968905/huge/c44b2640e412b36de53d91eef3c5e204dac6a8b4.jpg"
  },
  {
    title: "Ridgway Independent Film Fest: Begin Where You Are ~ Opening Night Shorts",
    link: "https://events.ourayridgwayevents.com/event/ridgway-independent-film-fest-begin-where-you-are-opening-night-shorts",
    description: "Doors open at 4:30 PM; films begin at 5:00 PM. Opening night gathers animated and live-action short films that are local and far-flung, strange and familiar—a preview of the stories and perspectives that unfold across the festival weekend.",
    pubDate: "2026-11-14T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/54066525035817/huge/fc713b45b42bb680b2b3330e3f10c55c6faed8bf.jpg"
  },
  {
    title: "Ridgway Independent Film Fest ~ Something Was Calling Us",
    link: "https://events.ourayridgwayevents.com/event/ridgway-independent-film-fest-something-was-calling-us",
    description: "Doors open at 9:45 AM; films begin at 10:00 AM. A short-film block about the quiet pull of love, loss, identity and change, and the unexpected paths people take toward what is missing.",
    pubDate: "2026-11-14T17:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/54066525250878/huge/c444a33b9b713c7618425dcb61e02494cc6de407.jpg"
  },
  {
    title: "Ridgway Independent Film Fest ~ The Mountains Knew Our Names",
    link: "https://events.ourayridgwayevents.com/event/ridgway-independent-film-fest-the-mountains-knew-our-names",
    description: "Doors open at 12:45 PM; films begin at 1:00 PM. A documentary block rooted across Colorado, exploring ties between people and place, inherited histories, traditions, communities and the paths people choose.",
    pubDate: "2026-11-14T20:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/54066525467985/huge/aeb14558baf2ca7e09ccf2907f91417a1c740cce.jpg"
  },
  {
    title: "Ridgway Independent Film Fest ~ We Gathered Around the Fire",
    link: "https://events.ourayridgwayevents.com/event/ridgway-independent-film-fest-we-gathered-around-the-fire",
    description: "Doors open at 6:15 PM; films begin at 6:30 PM. A short-film block about community and connection in ordinary places, shared spaces, small gestures and the things people build together.",
    pubDate: "2026-11-15T01:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/54066525679973/huge/f8057aa570bb204f74619d3965a1591f3a36c571.jpg"
  },
  {
    title: "Ridgway Independent Film Fest ~ We Invited the Monsters In",
    link: "https://events.ourayridgwayevents.com/event/ridgway-independent-film-fest-we-invited-the-monsters-in",
    description: "Doors open at 9:45 AM; films begin at 10:00 AM. A short-film block mixing gothic, gruesome, funny and occasionally sweet stories, pairing tenderness with terror and vengeance with very dark humor.",
    pubDate: "2026-11-15T17:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/54066525898104/huge/ab6fc9df31e535f3ce3ce4e1afaa3862ce728901.jpg"
  },
  {
    title: "Ridgway Independent Film Fest ~ We Wandered Beyond the Firelight",
    link: "https://events.ourayridgwayevents.com/event/ridgway-independent-film-fest-we-wandered-beyond-the-firelight",
    description: "Doors open at 1:45 PM; films begin at 2:00 PM. A short-film block exploring truth and memory, expectation and identity, and the lives people are given versus the lives they make.",
    pubDate: "2026-11-15T21:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/54066526099851/huge/343172cafea91a01a42c75bb4bf61e850480fd58.jpg"
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
    title: "NEW With Weehawken: Beat & Step: West African Dance, Drum & Body Percussion ~ with performances in The Nutcracker Remixed!",
    link: "https://events.ourayridgwayevents.com/event/new-with-weehawken-beat-step-west-african-dance-drum-body-percussion-with-performances-in-the-nutcracker-remixed",
    description: "Beat & Step: West African Dance, Drum & Body Percussion is an energetic and interactive class that combines traditional West African dance, drumming, and body percussion into one exciting experience. Students will learn dance combinations, explore traditional drumming rhythms that tell stories, and create music using their hands, feet, body, drums, and voice. Along the way, they'll develop coordination, rhythm, musicality, focus, memory, confidence, and teamwork while experiencing the rich cultural traditions of West Africa. No previous dance or music experience is required—just curiosity, energy, and a willingness to learn. Students enrolled in this performance class will showcase what they've learned in our winter production. Dress Code: Students should wear comfortable clothing that allows for plenty of movement. Athletic clothing such as T-shirts, leggings, athletic pants, or shorts is recommended. Please avoid jeans or restrictive clothing. Wear comfortable athletic shoes or sneakers that are clean and reserved for class. …",
    pubDate: "2026-11-25T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Montrose",
    imageUrl: "https://localist-images.azureedge.net/photos/53483890616270/huge/dd89f2f9028ca228db911b8e16c50dc39897358f.jpg"
  },
  {
    title: "Floating Lotus Music Bingo – November & December 2026",
    link: "https://events.ourayridgwayevents.com/event/floating-lotus-music-bingo-november-december-2026",
    description: "Music Bingo at Floating Lotus Brewery! Join us Thursday, November 26 and Thursday, December 10 from 6–9 PM for a high-energy night of music, drinks and bingo-style fun. Listen, mark your card and sing along. Learn more at floatinglotusbrewery.com.",
    pubDate: "2026-11-27T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/51579855188578/huge/de5019ffbfacf4a9f5e85d8a14961584c70e7873.jpg"
  }
];

const NORWOOD_EVENTS = [
  {
    title: "Senior Lunch",
    link: "https://www.norwoodtown.com/2026-09-24-senior-lunch",
    description: "A midday meal gathering hosted by the Town of Norwood for senior community members. It takes place at noon and offers older residents an opportunity to come together for food and fellowship.",
    pubDate: "2026-09-24T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Norwood Pioneer Days And Car Show",
    link: "https://www.norwoodtown.com/2026-09-26-norwood-pioneer-days-and-car-show",
    description: "Norwood Pioneer Days and Car Show is an annual community celebration hosted by the Town of Norwood, honoring the area's heritage with a car show and festive activities. The event brings together locals and visitors in Norwood, Colorado, for a day of community gathering and regional pride.",
    pubDate: "2026-09-26T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Senior Meals",
    link: "https://www.norwoodtown.com/2026-10-01-senior-meals",
    description: "A midday community meal program for seniors hosted by the Town of Norwood. It offers older residents a regular opportunity to share a meal and connect with neighbors in a welcoming, local setting.",
    pubDate: "2026-10-01T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Senior Meals",
    link: "https://www.norwoodtown.com/2026-10-08-senior-meals",
    description: "A midday community meal program for seniors hosted by the Town of Norwood. It offers older residents a regular opportunity to share a meal and connect with neighbors in a welcoming, local setting.",
    pubDate: "2026-10-08T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Closed For Columbus Day",
    link: "https://www.norwoodtown.com/2026-10-12-closed-for-columbus-day",
    description: "The Town of Norwood will be closed in observance of Columbus Day. Residents should plan accordingly for any town services or business they may need to conduct.",
    pubDate: "2026-10-12T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Town Closure",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Senior Meals",
    link: "https://www.norwoodtown.com/2026-10-15-senior-meals",
    description: "A midday meal program for seniors hosted by the Town of Norwood, offering older community members a chance to gather, share a meal, and connect with neighbors. This recurring community event takes place in Norwood and is organized through local town services.",
    pubDate: "2026-10-15T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Senior Meals",
    link: "https://www.norwoodtown.com/2026-10-22-senior-meals",
    description: "A midday community meal program for seniors, hosted by the Town of Norwood. It offers older residents a chance to gather, share a meal, and connect with neighbors in a welcoming setting.",
    pubDate: "2026-10-22T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Senior Meals",
    link: "https://www.norwoodtown.com/2026-10-29-senior-meals",
    description: "A midday meal program for seniors hosted by the Town of Norwood, offering older community members a chance to gather and share a meal together. This recurring community event provides both nourishment and social connection for Norwood's senior residents.",
    pubDate: "2026-10-29T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Closed For Veterans Day",
    link: "https://www.norwoodtown.com/2026-11-11-closed-for-veterans-day",
    description: "The Town of Norwood will be closed in observance of Veterans Day. Municipal offices and services will be unavailable on this federal holiday honoring those who have served in the United States armed forces.",
    pubDate: "2026-11-11T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Town Closure",
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
    title: "Closed For Christmas Eve",
    link: "https://www.norwoodtown.com/2026-12-24-closed-for-christmas-eve",
    description: "The Town of Norwood will be closed on Christmas Eve in observance of the holiday. Municipal offices and services will be unavailable that day.",
    pubDate: "2026-12-24T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Town Closure",
    location: "Norwood, CO",
    imageUrl: ""
  }
];

const MOUNTAIN_VILLAGE_EVENTS = [
  {
    title: "Eco- Grief Workshop: Between Grief & Gratitude, where Love & Loss meet in a Changing World",
    link: "https://townofmountainvillage.com/explore/events/all-events/eco-grief-workshop-between-grief-gratitude-where-love-loss-meet-in-a-changing-world/",
    description: "A community workshop hosted by Lauren Norton of Through the Woods Doula, Mollie Theis of EcoAction Partners, and the Wilkinson Public Library, exploring the emotional and psychological weight of environmental loss and change. The event takes place in Mountain Village and offers participants a space to process eco-grief alongside feelings of gratitude and love for the natural world.",
    pubDate: "2026-09-29T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49601/between_grief_gratitude_web_16_x_9_in.png"
  },
  {
    title: "Public Art Commission Meeting",
    link: "https://townofmountainvillage.com/explore/events/all-events/public-art-commission-meeting/",
    description: "The Public Art Commission meets on an as-needed basis. Please join the meeting from your computer, tablet or smartphone using the below instructions.",
    pubDate: "2026-09-30T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49288/2.jpg"
  },
  {
    title: "Market on the Plaza",
    link: "https://townofmountainvillage.com/explore/events/all-events/market-on-the-plaza/",
    description: "Mountain Village's Heritage Plaza hosts its weekly outdoor market, bringing together vendors with fresh produce, local goods, and handmade wares in the heart of the pedestrian-friendly town center. The Wednesday market runs throughout the summer and early fall season.",
    pubDate: "2026-09-30T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/30820/motp26_web_market_1800x9006.png"
  },
  {
    title: "Telluride Art Walk",
    link: "https://townofmountainvillage.com/explore/events/all-events/telluride-art-walk-2/",
    description: "The Telluride Art Walk is a lively monthly celebration of art, community, and creativity in downtown Telluride and Mountain Village.",
    pubDate: "2026-10-01T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48372/artwalk-1800x900.jpg"
  },
  {
    title: "Pink Talking Fish Live in Concert",
    link: "https://townofmountainvillage.com/explore/events/all-events/pink-talking-fish-live-in-concert/",
    description: "Pink Talking Fish is a hybrid tribute fusion act combining the music of Pink Floyd, Talking Heads, and Phish into a single live performance experience. The band comes to Mountain Village for a concert celebrating the catalogs of three iconic and beloved bands.",
    pubDate: "2026-10-02T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49993/pink_talking_fish_mv.jpg"
  },
  {
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars is an outdoor film series held at the Conference Center Plaza in Mountain Village, screening movies on Saturday evenings at dusk. The series runs on a recurring seasonal schedule, offering a community gathering around film in an open-air mountain setting.",
    pubDate: "2026-10-03T12:00:00.000Z",
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
    pubDate: "2026-10-03T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
  },
  {
    title: "Sunday Rehab at Alloy Kitchen",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-at-alloy-kitchen/",
    description: "Sunday Rehab is a recurring Sunday event at Alloy Kitchen in Mountain Village, running through October 11, 2026. It offers a laid-back way to spend Sunday afternoons in Mountain Village style.",
    pubDate: "2026-10-04T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49380/sundays-at-alloy-1800x900.jpg"
  },
  {
    title: "Bike & Brewery Tour",
    link: "https://townofmountainvillage.com/explore/events/all-events/bike-brewery-tour/",
    description: "A guided bicycle ride departing from the Mountain Lodge in Mountain Village, following the Jurassic Trail and Meadows Trail down to Telluride Brewing Co., where participants receive a complimentary beer. The route offers a scenic two-brewery experience connecting Mountain Village to town.",
    pubDate: "2026-10-05T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49136/bike-and-brewery-tour-1800x900.jpg"
  },
  {
    title: "Eco- Grief Workshop: Between Grief & Gratitude, where Love & Loss meet in a Changing World",
    link: "https://townofmountainvillage.com/explore/events/all-events/eco-grief-workshop-between-grief-gratitude-where-love-loss-meet-in-a-changing-world/",
    description: "A community workshop held in Mountain Village that brings together participants to explore eco-grief — the emotional weight of loss tied to environmental change — alongside gratitude and love as complementary responses. Led by Lauren Norton of Through the Woods Doula, Mollie Theis of EcoAction Partners, and the Wilkinson Public Library, the event offers a space for reflection and shared experience.",
    pubDate: "2026-10-06T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49601/between_grief_gratitude_web_16_x_9_in.png"
  },
  {
    title: "Market on the Plaza",
    link: "https://townofmountainvillage.com/explore/events/all-events/market-on-the-plaza/",
    description: "Mountain Village's Heritage Plaza hosts an outdoor market featuring local vendors. The weekly gathering brings together a variety of goods in the pedestrian-friendly plaza setting.",
    pubDate: "2026-10-07T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/30820/motp26_web_market_1800x9006.png"
  },
  {
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars is a recurring outdoor film series held at the Conference Center Plaza in Mountain Village, screening movies at dusk on Saturday evenings. The series runs throughout the summer months, offering a communal gathering for residents and visitors to enjoy films under the open sky.",
    pubDate: "2026-10-10T12:00:00.000Z",
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
    pubDate: "2026-10-10T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
  },
  {
    title: "Sunday Rehab at Alloy Kitchen",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-at-alloy-kitchen/",
    description: "Sunday Rehab is a recurring Sunday gathering at Alloy Kitchen in Mountain Village, running through October 11, 2026. It's a laid-back way to spend a Sunday in Mountain Village, hosted at the Alloy Kitchen venue.",
    pubDate: "2026-10-11T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49380/sundays-at-alloy-1800x900.jpg"
  },
  {
    title: "Bike & Brewery Tour",
    link: "https://townofmountainvillage.com/explore/events/all-events/bike-brewery-tour/",
    description: "A guided bicycle ride departing from the Mountain Lodge in Mountain Village, following the Jurassic Trail and Meadows Trail down to Telluride Brewing Co., where participants receive a complimentary beer. The route offers a scenic way to connect the mountain village to town while taking in local craft brewing culture.",
    pubDate: "2026-10-12T12:00:00.000Z",
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
    pubDate: "2026-10-13T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/27556/merchant_event-1.png"
  },
  {
    title: "Eco- Grief Workshop: Between Grief & Gratitude, where Love & Loss meet in a Changing World",
    link: "https://townofmountainvillage.com/explore/events/all-events/eco-grief-workshop-between-grief-gratitude-where-love-loss-meet-in-a-changing-world/",
    description: "A community workshop bringing together local guides from Through the Woods Doula, EcoAction Partners, and the Wilkinson Public Library to explore the emotional dimensions of living through environmental change. The gathering offers space to process feelings of loss and grief alongside gratitude, held in Mountain Village.",
    pubDate: "2026-10-13T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49601/between_grief_gratitude_web_16_x_9_in.png"
  },
  {
    title: "Hanneke Cassel Trio",
    link: "https://townofmountainvillage.com/explore/events/all-events/hanneke-cassel-trio/",
    description: "The Hanneke Cassel Trio will perform as part of Telluride Chamber Music's yearly series, brought to Mountain Village. This chamber music event promises a distinctive and engaging listening experience for the community.",
    pubDate: "2026-10-13T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49672/hanneke_cassel.jpg"
  },
  {
    title: "Plaza Vending Committee Meeting",
    link: "https://townofmountainvillage.com/explore/events/all-events/plaza-vending-committee-meeting/",
    description: "The Mountain Village Plaza Vending Committee will meet to review winter 2026/27 plaza vending applications. The meeting will be held in Mountain Village and is also accessible remotely via Zoom.",
    pubDate: "2026-10-14T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/34834/mplantz-19-a7v07134.jpg"
  },
  {
    title: "Market on the Plaza",
    link: "https://townofmountainvillage.com/explore/events/all-events/market-on-the-plaza/",
    description: "Mountain Village's Heritage Plaza hosts a community market featuring local vendors. The pedestrian-friendly plaza welcomes shoppers browsing goods from area farmers, artisans, and small businesses.",
    pubDate: "2026-10-14T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/30820/motp26_web_market_1800x9006.png"
  },
  {
    title: "Live Music at Alloy Kitchen",
    link: "https://townofmountainvillage.com/explore/events/all-events/live-music-at-alloy-kitchen-1/",
    description: "Free live music at Alloy Kitchen in Mountain Lodge Telluride, featuring a rotating lineup of local artists including Apres Nova and others throughout the season. Performances are offered four nights a week at no charge, making it a recurring community gathering spot in Mountain Village.",
    pubDate: "2026-10-16T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49132/alloy-live-music-1800x900.jpg"
  },
  {
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars is an outdoor film screening series hosted by Mountain Village at the Conference Center Plaza. The series runs on Saturdays at dusk during the summer months, offering a communal cinema experience under the open sky.",
    pubDate: "2026-10-17T12:00:00.000Z",
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
    pubDate: "2026-10-17T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
  },
  {
    title: "Sunday Rehab at Alloy Kitchen",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-at-alloy-kitchen/",
    description: "Sunday Rehab is a recurring weekly event at Alloy Kitchen in Mountain Village, offering a laid-back Sunday gathering. The series runs through October 2026, providing a local spot to wind down and recharge at the end of the weekend.",
    pubDate: "2026-10-18T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49380/sundays-at-alloy-1800x900.jpg"
  },
  {
    title: "Bike & Brewery Tour",
    link: "https://townofmountainvillage.com/explore/events/all-events/bike-brewery-tour/",
    description: "A guided bicycle tour departing from the Mountain Lodge in Mountain Village, following the Jurassic Trail and Meadows Trail down to Telluride Brewing Co., where riders receive a complimentary beer. The route offers a scenic descent connecting Mountain Village to town.",
    pubDate: "2026-10-19T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49136/bike-and-brewery-tour-1800x900.jpg"
  },
  {
    title: "Eco- Grief Workshop: Between Grief & Gratitude, where Love & Loss meet in a Changing World",
    link: "https://townofmountainvillage.com/explore/events/all-events/eco-grief-workshop-between-grief-gratitude-where-love-loss-meet-in-a-changing-world/",
    description: "A workshop hosted by Lauren Norton of Through the Woods Doula, Mollie Theis of EcoAction Partners, and the Wilkinson Public Library exploring the emotional intersection of grief and gratitude in response to environmental change. The event takes place in Mountain Village and invites participants to process feelings of loss alongside a sense of connection to the natural world.",
    pubDate: "2026-10-20T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49601/between_grief_gratitude_web_16_x_9_in.png"
  },
  {
    title: "Market on the Plaza",
    link: "https://townofmountainvillage.com/explore/events/all-events/market-on-the-plaza/",
    description: "Mountain Village's Heritage Plaza hosts a community market featuring local vendors. The pedestrian-friendly plaza welcomes shoppers browsing a variety of goods from area sellers.",
    pubDate: "2026-10-21T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/30820/motp26_web_market_1800x9006.png"
  },
  {
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars is a recurring outdoor film series hosted at the Conference Center Plaza in Mountain Village, screening movies at dusk on select evenings. The October 24 event brings the community together for an open-air cinema experience in the mountain setting.",
    pubDate: "2026-10-24T12:00:00.000Z",
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
    pubDate: "2026-10-24T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
  },
  {
    title: "Gaiascope",
    link: "https://townofmountainvillage.com/explore/events/all-events/gaiascope/",
    description: "Brooke Einbender's nighttime immersive public artwork, Gaiascope, comes to Mountain Village following its presentation during the 2026 World Cup in downtown San José, California. The community is invited to experience this large-scale installation in an outdoor setting.",
    pubDate: "2026-10-24T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49531/akb_1557.jpeg"
  },
  {
    title: "Sunday Rehab at Alloy Kitchen",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-at-alloy-kitchen/",
    description: "Sunday Rehab is a recurring Sunday gathering at Alloy Kitchen in Mountain Village, offering a laid-back way to ease into the week. The event runs through late October 2026, giving locals and visitors a consistent weekend hangout spot at the Mountain Lodge venue.",
    pubDate: "2026-10-25T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49380/sundays-at-alloy-1800x900.jpg"
  },
  {
    title: "Bike & Brewery Tour",
    link: "https://townofmountainvillage.com/explore/events/all-events/bike-brewery-tour/",
    description: "A guided bicycle tour departing from the Mountain Lodge in Mountain Village, following the Jurassic Trail and Meadows Trail down to Telluride Brewing Co. Riders receive a complimentary beer upon arrival at the brewery.",
    pubDate: "2026-10-26T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49136/bike-and-brewery-tour-1800x900.jpg"
  },
  {
    title: "Eco- Grief Workshop: Between Grief & Gratitude, where Love & Loss meet in a Changing World",
    link: "https://townofmountainvillage.com/explore/events/all-events/eco-grief-workshop-between-grief-gratitude-where-love-loss-meet-in-a-changing-world/",
    description: "A community workshop held in Mountain Village bringing together participants to explore eco-grief — the emotional weight of loss tied to environmental change — alongside gratitude and love as responses to a shifting world. The program is a collaboration between Through the Woods Doula, EcoAction Partners, and the Wilkinson Public Library.",
    pubDate: "2026-10-27T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49601/between_grief_gratitude_web_16_x_9_in.png"
  },
  {
    title: "Market on the Plaza",
    link: "https://townofmountainvillage.com/explore/events/all-events/market-on-the-plaza/",
    description: "Mountain Village's Heritage Plaza hosts a weekly outdoor market featuring vendors and tents in the heart of the pedestrian-friendly town center. The Market on the Plaza brings together local sellers for a community gathering in the scenic Mountain Village setting.",
    pubDate: "2026-10-28T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/30820/motp26_web_market_1800x9006.png"
  }
];

const TELLURIDE_COM_EVENTS = [
  {
    title: "Telluride Arts Salon Night",
    link: "https://www.telluride.com/event/telluride-arts-salon-night/",
    description: "Salon Nights are inspired by the legendary Parisian salons - those lively gatherings where artists, thinkers, and …",
    pubDate: "2026-04-09",
    endDate: "2026-10-15",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/60890/download.800x533.webp"
  },
  {
    title: "Patagonia Telluride Coffee Club",
    link: "https://www.telluride.com/event/patagonia-telluride-coffee-club/",
    description: "Starting in April, Patagonia Telluride is teaming up with The Pour Over Pedaler once a month through October to bring …",
    pubDate: "2026-04-18",
    endDate: "2026-10-10",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62111/screenshot_2026-04-01_at_2_21_59_pm.800x533.webp"
  },
  {
    title: "Telluride Farmers&#039; Market",
    link: "https://www.telluride.com/event/telluride-farmers-market/",
    description: "The Telluride Farmers' Market provides the highest quality produce, animal products, prepared food and more to …",
    pubDate: "2026-05-29",
    endDate: "2026-10-09",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44554/img_0071.800x533.webp"
  },
  {
    title: "Historic Walking Tour",
    link: "https://www.telluride.com/event/historic-walking-tour/",
    description: "Take a historic tour of Telluride on foot! These historic walking tours are led by historian Ashley Boling, and leave …",
    pubDate: "2026-06-02",
    endDate: "2026-10-01",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48069/walkingtour_tabloidsize_2021.800x533.webp"
  },
  {
    title: "Telluride Art Walk",
    link: "https://www.telluride.com/event/telluride-art-walk/",
    description: "The Telluride Art Walk is a lively monthly celebration of art, community, and creativity in downtown Telluride and …",
    pubDate: "2026-06-04",
    endDate: "2026-10-01",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/36708/artwalk-2200x1237.800x533.webp"
  },
  {
    title: "Free Wine Tasting",
    link: "https://www.telluride.com/event/free-wine-tasting/",
    description: "Join the Mountain Village Wine Merchant every Wednesday for a free wine tasting of three different wines.",
    pubDate: "2026-06-10",
    endDate: "2026-09-30",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/46449/mvwmplanetpic2.800x533.webp"
  },
  {
    title: "Live Music at Alloy Kitchen",
    link: "https://www.telluride.com/event/live-music-at-alloy-kitchen/",
    description: "Free live music, four nights a week, all season long. Alloy Kitchen at Mountain Lodge Telluride hosts a rotating lineup …",
    pubDate: "2026-06-11",
    endDate: "2026-10-17",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62862/alloy-live-music-pool-deck.800x533.webp"
  },
  {
    title: "Sunday Rehab",
    link: "https://www.telluride.com/event/sunday-rehab/",
    description: "Sunday Rehab brings the Mountain Lodge pool deck to life every Sunday with brunch, a Bloody Mary and juice bar, food …",
    pubDate: "2026-06-14",
    endDate: "2026-10-11",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62769/sunday-rehab-event-image-2200x1237.800x533.webp"
  },
  {
    title: "Weird Wine Wednesdays at The National",
    link: "https://www.telluride.com/event/weird-wine-wednesdays-at-the-national/",
    description: "Elevate your evening on the rooftop at The National with Weird Wine Wednesdays, a laid-back, weekly tasting experience …",
    pubDate: "2026-06-17",
    endDate: "2026-09-30",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62830/the_national_wine.800x533.webp"
  },
  {
    title: "Lone Tree Cemetery Tours",
    link: "https://www.telluride.com/event/lone-tree-cemetery-tours/",
    description: "Join the Telluride Historical Museum for Lone Tree Cemetery Tours this fall! This Telluride Historical Museum tour …",
    pubDate: "2026-09-11",
    endDate: "2026-10-16",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/49105/scott-rodgerson-zlhbjxbccec-unsplash.800x533.webp"
  },
  {
    title: "Gaiascope Saturday Sessions",
    link: "https://www.telluride.com/event/gaiascope-saturday-sessions/",
    description: "Gaiascope Saturday Sessions is a recurring weekly event featuring live music and kaleidoscope art. Taking place each Saturday, the event brings together sound and visual art in a community gathering format in Telluride.",
    pubDate: "2026-09-12",
    endDate: "2026-10-03",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63515/screenshot_2026-09-05_at_11_00_00_am.800x533.webp"
  },
  {
    title: "Volunteer Trail Work Day",
    link: "https://www.telluride.com/event/volunteer-trail-work-day/",
    description: "Join the Telluride Mountain Club for their volunteer trail work day! Spend time with friends, get your hands dirty, and …",
    pubDate: "2026-09-17",
    endDate: "2026-10-11",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63536/vol-trail-work--499x624.800x533.webp"
  },
  {
    title: "Fireside Chats",
    link: "https://www.telluride.com/event/fireside-chats/",
    description: "A series of free weekly lectures on Wednesdays this fall by scholars, writers, storytellers, and experts of Telluride's …",
    pubDate: "2026-09-23",
    endDate: "2026-10-07",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/49419/fireside_chat.800x533.webp"
  },
  {
    title: "Hike Into History",
    link: "https://www.telluride.com/event/hike-into-history/",
    description: "Join the Telluride Historical Museum for their summer monthly Hike Into History series! \n\nSchedule:\n\n\n\tSeptember 26 - …",
    pubDate: "2026-09-26",
    endDate: "2026-10-03",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/53479/screenshot_2025-07-02_at_11_06_15_am.800x533.webp"
  },
  {
    title: "Original Thinkers",
    link: "https://www.telluride.com/event/original-thinkers/",
    description: "Original Thinkers is a boutique festival of film, ideas, art, performance, and conversation held annually in Telluride, …",
    pubDate: "2026-10-01",
    endDate: "2026-10-05",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/28484/download_1.800x533.webp"
  },
  {
    title: "Ken Gentry & the Companions",
    link: "https://www.telluride.com/event/ken-gentry-the-companions/",
    description: "Rooted in the soulful grit of a St. Louis upbringing and refined by the clarity of Colorado's Western Slope, Ken Gentry …",
    pubDate: "2026-10-01",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63484/screenshot_2026-09-02_at_12_42_42_pm.800x533.webp"
  },
  {
    title: "Pink Talking Fish",
    link: "https://www.telluride.com/event/pink-talking-fish/",
    description: "Pink Talking Fish is a Hybrid Tribute Fusion Act that takes the music from three of the world's most beloved bands and …",
    pubDate: "2026-10-02",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62634/2025_ptf_fall_r4_gen_600x400.800x533.webp"
  },
  {
    title: "Annual San Miguel River Cleanup",
    link: "https://www.telluride.com/event/annual-san-miguel-river-cleanup/",
    description: "Join the San Miguel Watershed Coalition, BLM, Telluride Outside and RIGS for the 5th annual San Miguel River cleanup …",
    pubDate: "2026-10-03",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/59547/0345d607-8ad3-d3f3-b8b6-2c39b6657a12.800x533.webp"
  },
  {
    title: "ArtAbout",
    link: "https://www.telluride.com/event/artabout/",
    description: "Artabout provides the rare glimpse into local artist studios! Organized by Ah Haa School for the Arts, this is a free, …",
    pubDate: "2026-10-03",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62618/artabout.800x533.webp"
  },
  {
    title: "Telluride Leadership Summit",
    link: "https://www.telluride.com/event/telluride-leadership-summit/",
    description: "Where limits end, leadership begins. Welcome to the Telluride Leadership Summit - A mountain destination experience …",
    pubDate: "2026-10-04",
    endDate: "2026-10-07",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63023/summit_one_pager.800x533.webp"
  },
  {
    title: "Stoke the Vote",
    link: "https://www.telluride.com/event/stoke-the-vote/",
    description: "Join Patagonia Telluride and POW (Protect Our Winters), Telluride Mountain Club, Sheep Mountain Alliance, and EcoAction …",
    pubDate: "2026-10-07",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63659/stoke_the_vote_-_final_flyer.800x533.webp"
  },
  {
    title: "Shrek the Musical",
    link: "https://www.telluride.com/event/shrek-the-musical/",
    description: "The Sheridan Arts Foundation’s 6th annual Not- So Young People’s Theater production! NYSPT presents Shrek The …",
    pubDate: "2026-10-08",
    endDate: "2026-10-12",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63356/screenshot_2026-08-12_at_1_37_16_pm.800x533.webp"
  },
  {
    title: "Oktoberfest",
    link: "https://www.telluride.com/event/oktoberfest/",
    description: "Grab your lederhosen and dirndls and join the Town of Mountain Village for the return of Oktoberfest, expanding this …",
    pubDate: "2026-10-09",
    endDate: "2026-10-12",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/49157/mv_oktoberfest26_std_2200x1237.800x533.webp"
  },
  {
    title: "Hanneke Cassel Trio",
    link: "https://www.telluride.com/event/hanneke-cassel-trio/",
    description: "Chamber music that hits a little differently! Join Telluride Chamber Music for their yearly \"Not Your Average …",
    pubDate: "2026-10-13",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63340/hanneke_cassel.800x533.webp"
  },
  {
    title: "Lamplight Cemetery Tour",
    link: "https://www.telluride.com/event/lamplight-cemetery-tour/",
    description: "Explore the historic Lone Tree Cemetery by the eeriness of lamplight. This tour takes place in the evening and recounts …",
    pubDate: "2026-10-23",
    endDate: "2026-10-30",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/49427/2019-lamplight-cemetery-tours-website-header.800x533.webp"
  },
  {
    title: "Pumpkins & Peaks",
    link: "https://www.telluride.com/event/pumpkins-peaks/",
    description: "Celebrate fall in the mountains at Pumpkins & Peaks! Join TMVOA in Mountain Village for a day of free, …",
    pubDate: "2026-10-24",
    endDate: "2026-10-26",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63613/p_pttbbanner.800x533.webp"
  },
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
    imageUrl: "https://www.telluride.com/site/assets/files/45301/gondola-rainbow-2-high-res-2100x1401-f18dd3a9-0d2b-4ff7-b99c-2c162daf4e94.800x533.webp"
  },
  {
    title: "KOTO Ski Swap",
    link: "https://www.telluride.com/event/koto-ski-swap/",
    description: "Get prepped for the winter season ahead at the annual KOTO Ski Swap at the Wilkinson Public Library. Donate your used …",
    pubDate: "2026-11-13",
    endDate: "2026-11-16",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/28871/464865559_570687275405719_3117454875494611862_n.800x533.webp"
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
    title: "Probate Notice -- Claims Against Estate (Case No. 26PR30006)",
    entity: "Estate of (unnamed), Patricia L. Bode Personal Representative",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "Patricia L. Bode, as Personal Representative of an estate in San Miguel County, is notifying all persons with claims against the estate that they must present those claims to her or to the District Court of San Miguel County on or before October 18, 2026, or claims may be forever barred. The notice is published through attorney Zachary T. Reams of Reams & Reams in Grand Junction, CO.",
    deadline: "2026-10-18",
    expires: "2026-10-18",
    dates: "6/18",
    papers: ["ttimes_0618"],
    url: "https://www.telluridenews.com/news/legals/article_5efd4701-ba7f-46ef-a7bd-74a242fdff7a.html",
    address: "District Court of San Miguel County, Colorado",
    noticeKey: "26PR30006",
    caseNumber: "26PR30006"
  },
  {
    title: "Notice to Creditors -- Estate of Michael Kiball (COL-000175)",
    entity: "Estate of Michael Kiball",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "This is a notice to creditors of the estate of Michael Kiball, handled by Bo James Nerlin of Devor & Pluhoff, LLC in Montrose, Colorado. All persons with claims against the estate must present them to the personal representative or the District Court of San Miguel County. The notice was published June 25, July 2, and July 9.",
    deadline: "2026-10-18",
    expires: "2026-10-18",
    dates: "6/25",
    papers: ["ttimes_0625"],
    url: "https://www.telluridenews.com/news/legals/article_efb0ca71-953d-4278-b75b-d81bd2f09fe9.html",
    address: "District Court of San Miguel County, Colorado",
    noticeKey: "creditors-kiball-COL-000175"
  },
  {
    title: "Public Notice to Creditors -- Estate of Gerald D. Wilson (26PR30005)",
    entity: "Estate of Gerald D. Wilson",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "Notice is given that the estate of Gerald D. Wilson, also known as Gerald Dean Nelson, is being administered in San Miguel County District Court under Case No. 26PR30005. All persons with claims against the estate must present them to Personal Representative Michael Kimball or to the District Court on or before October 25, 2026, or claims may be forever barred.",
    deadline: "2026-10-25",
    expires: "2026-10-25",
    dates: "7/2",
    papers: ["ttimes_0702"],
    url: "https://www.telluridenews.com/news/legals/article_d2ca136e-7993-4d52-abfc-0e8f243974dd.html",
    address: "District Court of San Miguel County, Colorado",
    noticeKey: "COL-000183-estate-wilson-26PR30005",
    caseNumber: "26PR30005"
  },
  {
    title: "Foreclosure Sale Notice -- Lot 166AR2, Telluride Mountain Village (Sale No. 202604)",
    entity: "Federal Holding Realty / Two Stonegate LLC",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "The San Miguel County Public Trustee has recorded a Notice of Election and Demand for foreclosure on a Deed of Trust dated April 22, 2022, involving original grantor Two Stonegate LLC and beneficiary Federal Holding Realty, with an outstanding principal balance of $500,000. The property subject to foreclosure is Lot 166AR2, Telluride Mountain Village, located on Stonegate Drive, Mountain Village, CO 81435. The foreclosure is proceeding under CRS §38-38-103, and the lien foreclosed may not be a first lien.",
    deadline: "",
    expires: "2026-10-01",
    dates: "7/2",
    papers: ["ttimes_0702"],
    url: "https://www.telluridenews.com/news/legals/article_d2ca136e-7993-4d52-abfc-0e8f243974dd.html",
    address: "TBD (Vacant) Stonegate Drive, Mountain Village, CO 81435 (Lot 166AR2, Telluride Mountain Village)",
    noticeKey: "foreclosure-sale-202604-lot166ar2-mountain-village",
    caseNumber: "202604"
  },
  {
    title: "Notice to Creditors -- Estate of Lawrence de Bivort (Case No. 2026PR30008)",
    entity: "Estate of Lawrence de Bivort",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "The estate of Lawrence de Bivort (also known as Lawrence Harwood de Bivort, Lawrence H. de Bivort, and Lawrence H. Debivort) is being probated in San Miguel County, Colorado. Benjamin L. de Bivort is serving as Personal Representative. All persons with claims against the estate must present them to the Personal Representative or the San Miguel County District Court by November 16, 2026, or their claims may be permanently barred.",
    deadline: "2026-11-16",
    expires: "2026-11-16",
    dates: "7/16",
    papers: ["ttimes_0716"],
    url: "https://www.telluridenews.com/news/legals/article_6d5eb2e7-d860-4528-8e72-754a66dad591.html",
    address: "District Court of San Miguel County, Colorado",
    noticeKey: "probate-2026PR30008",
    caseNumber: "2026PR30008"
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
    expires: "2026-11-04",
    dates: "8/6",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=159",
    address: "",
    smcBidID: "159"
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
    expires: "2026-11-11",
    dates: "8/13",
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
    expires: "2026-11-11",
    dates: "8/13",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=208",
    address: "",
    smcBidID: "208"
  },
  {
    title: "Ordinance -- Colorado Wildfire Resiliency Code Amendment to Land Use Code (Ordinance #1640)",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "The Telluride Town Council passed Ordinance #1640 on August 11, 2026, amending Chapter 18 of the Telluride Municipal Code (Land Use Code) to implement the Colorado Wildfire Resiliency Code (CWRC). The amendments affect Historic and Architectural Review standards and Landscaping/Outdoor Illumination/Tree standards in the Zone District Regulations. The ordinance is effective upon publication of this notice; copies are available at Town Hall or online.",
    deadline: "2026-08-20",
    expires: "2026-10-20",
    dates: "8/20",
    papers: ["ttimes_0820"],
    url: "https://www.telluridenews.com/news/legals/article_7e6a7420-27c6-4f95-b0b8-101dfc5b4763.html",
    address: "Town of Telluride, Colorado",
    noticeKey: "ord-1640"
  },
  {
    title: "ECMC Hearing Notice -- Order Finding Violation Against American Helium Operating LLC (Docket No. 260700207)",
    entity: "Colorado Energy and Carbon Management Commission / American Helium Operating LLC",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "The Colorado Energy and Carbon Management Commission (ECMC) Staff has applied for an Order Finding Violation against American Helium Operating LLC (Operator No. 10841) related to Notice of Alleged Violation No. 404024729. A hearing before an ECMC Hearing Officer is scheduled for October 29, 2026 at 9:00 a.m. in Denver, with virtual access also available. Affected persons must petition to participate by September 29, 2026.",
    deadline: "2026-09-29",
    expires: "2026-10-29",
    dates: "8/20",
    papers: ["ttimes_0820"],
    url: "https://www.telluridenews.com/news/legals/article_7e6a7420-27c6-4f95-b0b8-101dfc5b4763.html",
    address: "Colorado Energy and Carbon Management Commission, 1120 Lincoln Street, Suite 801, Denver, CO 80203",
    noticeKey: "ecmc-docket-260700207-american-helium",
    caseNumber: "260700207"
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
    title: "Utility Notice -- Paper Billing Fee Effective October 29, 2026 (COL-000225)",
    entity: "San Miguel Power Association (SMPA)",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "💧",
    iconClass: "type-hearing",
    type: "Utilities",
    filterTag: "utilities",
    summary: "The Board of Directors of San Miguel Power Association (SMPA) has approved a $2.00 monthly Paper Billing Fee for members who choose to receive printed billing statements, effective for all paper bills generated on or after October 29, 2026. Members enrolled in paperless billing through SmartHub will not be charged the fee. Members can avoid the fee at any time by switching to paperless billing via the SmartHub online portal or mobile app.",
    deadline: "2026-10-29",
    expires: "2026-10-29",
    dates: "9/3",
    papers: ["ttimes_0903"],
    url: "https://www.telluridenews.com/news/legals/article_eb4be316-8baa-421e-80ee-1e619000f5c0.html",
    address: "San Miguel County, CO (SMPA service area)",
    noticeKey: "smpa-paper-billing-fee-2026"
  },
  {
    title: "Water Court Application -- Finding of Reasonable Diligence, Telluride Pines Alder Creek Pump and Pipeline (26CW3043)",
    entity: "Colorado District Court, Water Division No. 4",
    entityClass: "ent-county",
    entityLogo: "water_court",
    icon: "💧",
    iconClass: "type-bid",
    type: "Water Court",
    filterTag: "water-court",
    summary: "Telluride Pines Homeowners Association has filed an application in Water Division No. 4 seeking a finding of reasonable diligence for a conditional water right of 0.016 c.f.s. (7 gpm) from Alder Creek, tributary to Leopard Creek and the San Miguel River. The water right, originally decreed in 2014, is intended for domestic use on 38 lots and fire protection in San Miguel County. During the 2020–2026 diligence period, the applicant spent approximately $300,000 on water system maintenance, well drilling, water-quality testing, and engineering evaluations. Any person wishing to object must file a Verified Statement of Opposition with the Water Clerk by the last day of October 2026.",
    deadline: "2026-10-31",
    expires: "2026-10-31",
    dates: "9/10",
    papers: ["ttimes_0910"],
    url: "https://www.telluridenews.com/news/legals/article_d69b406f-c2c0-4bcd-a711-174867b9de48.html",
    address: "SE1/4 SE1/4 NW1/4 of Section 19, Township 44 North, Range 10 West, N.M.P.M., San Miguel County, Colorado",
    noticeKey: "26CW3043",
    caseNumber: "26CW3043"
  },
  {
    title: "Water Court Application -- Make Conditional Water Right Absolute and Finding of Reasonable Diligence, Leopard Creek Ditch / San Juan Vista Wells (26CW3039)",
    entity: "Colorado District Court, Water Division No. 4",
    entityClass: "ent-county",
    entityLogo: "water_court",
    icon: "💧",
    iconClass: "type-bid",
    type: "Water Court",
    filterTag: "water-court",
    summary: "San Juan Vista Landowners Association has filed an application in Water Division No. 4 seeking to make four additional in-house wells (Well Nos. 51, 60, 61, and 62) absolute under the Leopard Creek Ditch conditional water right, and to obtain a continued finding of diligence on the remaining 21 conditional wells within the San Juan Vista Subdivision in San Miguel County. The original water right of 0.279 c.f.s. was decreed in 1974 for up to 82 domestic wells, of which 57 have previously been made absolute. Any person wishing to object must file a Verified Statement of Opposition with the Water Clerk by the last day of October 2026.",
    deadline: "2026-10-31",
    expires: "2026-10-31",
    dates: "9/10",
    papers: ["ttimes_0910"],
    url: "https://www.telluridenews.com/news/legals/article_d69b406f-c2c0-4bcd-a711-174867b9de48.html",
    address: "San Juan Vista Subdivision, Filing No. 1, SE1/4SE1/4 Section 12, S1/2, S1/2N1/2 and N1/2NE1/4 Section 13, Township 44 North, Range 10 West, N.M.P.M., San Miguel County, Colorado",
    noticeKey: "26CW3039",
    caseNumber: "26CW3039"
  },
  {
    title: "ITB -- Snow Removal / Public Works Services, Town of Mountain Village",
    entity: "Town of Mountain Village",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "The Town of Mountain Village is soliciting bids for public works services (referenced at the top of the text). Bid documents are available at www.townofmountainvillage.com or at the TMV Public Works Dept. office at 411 Mountain Village Blvd, 2nd Floor. All bids must be emailed to kbatchelder@mtnvillage.org by 5:00 p.m. on September 30, 2026.",
    deadline: "2026-09-30",
    expires: "2026-09-30",
    dates: "9/17",
    papers: ["ttimes_0917"],
    url: "https://www.telluridenews.com/news/legals/article_6e1025d7-5ad7-45a9-8530-2bda61ea94b8.html",
    address: "411 Mountain Village Blvd, 2nd Floor, Mountain Village, CO 81435",
    noticeKey: "itb-tmv-pubworks-COL000241"
  },
  {
    title: "RFP -- Defensive Space Forestry / Wildfire Mitigation, Village Court Apartments (COL-000229)",
    entity: "Town of Mountain Village",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "The Town of Mountain Village is seeking proposals for defensive space forestry work at Village Court Apartments for wildfire mitigation, with work expected to begin October 2026. A mandatory site walk must be completed between September 28–30, 2026 as a condition of proposal eligibility. Proposals are due by October 4, 2026 at 11:59 p.m.; RFP packets are available from Town Forester Rodney Walters.",
    deadline: "2026-10-04",
    expires: "2026-10-04",
    dates: "9/17",
    papers: ["ttimes_0917"],
    url: "https://www.telluridenews.com/news/legals/article_6e1025d7-5ad7-45a9-8530-2bda61ea94b8.html",
    address: "Village Court Apartments, 455 Mountain Village Blvd, Suite A, Mountain Village, CO 81435",
    noticeKey: "rfp-village-court-forestry-COL000229"
  },
  {
    title: "Foreclosure Sale Notice -- 619 W Columbia Ave D303, Telluride (Sale No. 202606)",
    entity: "Brandi R. Hatfield, Public Trustee, San Miguel County / Deutsche Bank National Trust Company",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "The San Miguel County Public Trustee has scheduled a foreclosure auction for Unit 303, Building D1, The Tomboy Lodge (619 W Columbia Ave D303, Telluride, CO 81435) following a default on a deed of trust originally granted by J. Ascenzo DiGiacomo to Long Beach Mortgage Company, now held by Deutsche Bank National Trust Company. The outstanding principal balance is $187,007.81 on an original loan of $209,000. The public auction will be held at 10:00 a.m. on November 12, 2026, at 305 W. Colorado Avenue, East entry, Telluride, CO; notice of intent to cure must be filed at least 15 calendar days before the sale date.",
    deadline: "2026-11-12",
    expires: "2026-11-12",
    dates: "9/17",
    papers: ["ttimes_0917"],
    url: "https://www.telluridenews.com/news/legals/article_6e1025d7-5ad7-45a9-8530-2bda61ea94b8.html",
    address: "619 W Columbia Ave, Unit D303 (Tomboy Lodge), Telluride, CO 81435",
    noticeKey: "foreclosure-sale-202606-COL000242",
    caseNumber: "202606"
  },
  {
    title: "Public Hearing -- Subdivision Exemption / Lot Line Adjustment, Lawson Hill PUD Lots 320A & 320B (COL-000239)",
    entity: "San Miguel County Board of Commissioners / James Pierce (applicant) on behalf of John and Dianna Reams",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "San Miguel County is considering an application by James Pierce on behalf of property owners John and Dianna Reams to adjust the lot line between Parcels #456532416079 and #456532416080 at Lots 320A and 320B, Lawson Hill PUD, to correct an error in the placement of a duplex foundation. A public hearing before the Board of County Commissioners is scheduled for October 7, 2026 at 9:30 a.m. at 333 West Colorado Avenue, Telluride, CO, both in person and online. Written comments should be submitted to the San Miguel County Planning Department by September 28, 2026.",
    deadline: "2026-10-07",
    expires: "2026-10-07",
    dates: "9/17",
    papers: ["ttimes_0917"],
    url: "https://www.telluridenews.com/news/legals/article_6e1025d7-5ad7-45a9-8530-2bda61ea94b8.html",
    address: "Lots 320A & 320B, Lawson Hill PUD, San Miguel County, CO (Parcels #456532416079 & #456532416080)",
    noticeKey: "lot-line-adj-lawson-hill-320A-320B-COL000239"
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
    title: "ITB -- Construction/Services Bid Solicitation (L-000241)",
    entity: "Town of Mountain Village",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "The Town of Mountain Village is soliciting bids for a project, with all submissions required to be emailed to kbatchelder@mtnvillage.org by 5:00 p.m. on September 30, 2026. The notice references work overseen by Scott Pittenger and Kris Batchelder on behalf of Mountain Village. Prospective bidders may contact either representative for additional project details.",
    deadline: "2026-09-30",
    expires: "2026-09-30",
    dates: "9/24",
    papers: ["ttimes_0924"],
    url: "https://www.telluridenews.com/news/legals/article_87c1dedd-06e4-4678-a68d-6a0116434245.html",
    address: "2nd Floor, Mountain Village Town Hall, Mountain Village, CO",
    noticeKey: "itb-mtnvillage-L000241"
  },
  {
    title: "Foreclosure Sale -- 619 W Columbia Ave D-303, Telluride (2026-06)",
    entity: "Deutsche Bank National Trust Company / San Miguel County Public Trustee",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "The San Miguel County Public Trustee has scheduled a public auction foreclosure sale for Unit 303, Building D-1, The Tomboy Lodge at 619 W Columbia Ave D-303, Telluride, CO 81435, following a default on a 2004 deed of trust originally granted by J. Ascenzo DiGiacomo to Long Beach Mortgage Company (now held by Deutsche Bank National Trust Company). The outstanding principal balance is $187,007.81 on an original loan of $209,000. The auction will be held at 10:00 a.m. on Thursday, November 12, 2026, at 305 W. Colorado Avenue, East entry, Telluride, CO.",
    deadline: "2026-11-12",
    expires: "2026-11-12",
    dates: "9/24",
    papers: ["ttimes_0924"],
    url: "https://www.telluridenews.com/news/legals/article_87c1dedd-06e4-4678-a68d-6a0116434245.html",
    address: "619 W Columbia Ave D-303, Telluride, CO 81435",
    noticeKey: "foreclosure-2026-06-tomboy-lodge-d303",
    caseNumber: "2026-06"
  },
  {
    title: "Tax Notice -- Delinquent Oil & Gas Personal Property Taxes (2025)",
    entity: "San Miguel County Treasurer / American Helium Colorado LLC",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "San Miguel County Treasurer Brandi R. Hatfield has published a list dated September 14, 2026, of delinquent 2025 personal property (oil and gas) taxes owed by American Helium Colorado LLC across numerous API-numbered well parcels in San Miguel County, with total amounts due ranging from approximately $950 to over $41,000 per parcel. All delinquent taxes, interest, and penalties must be paid in full on or before September 30, 2026, or the county will take collection action as provided under Colorado Revised Statutes. The list covers dozens of individual well API numbers associated with American Helium Colorado LLC.",
    deadline: "2026-09-30",
    expires: "2026-09-30",
    dates: "9/24",
    papers: ["ttimes_0924"],
    url: "https://www.telluridenews.com/news/legals/article_87c1dedd-06e4-4678-a68d-6a0116434245.html",
    address: "San Miguel County, Colorado (various oil and gas well locations)",
    noticeKey: "delinquent-oilgas-taxes-2025-american-helium"
  }
];

const HOUSING_LISTINGS = [
  {
    title: "🏠 Element 52 SW-102",
    type: "deed-sale",
    address: "398 South Davis Street, Unit SW-102, Telluride, CO 81435",
    lat: 37.93676,
    lng: -107.81787,
    beds: "2 Bedroom, 1 Bath, ~988 sq ft",
    price: "$352,529 (deed-restricted)",
    source: "SMRHA",
    contact: { phone: "(970) 728-3034", email: "admin@smrha.org" },
    url: "https://smrha.org/element-52-sw-102/",
    smrhaSlug: "element-52-sw-102",
    note: "Tier 2 Mitigation Unit. HOA $420.28/mo. Contact SMRHA for eligibility and application details.",
    org: "telluride"
  },
  {
    title: "🏠 Silver Jack 202",
    type: "deed-sale",
    address: "155 West Pacific Avenue, Unit 202, Telluride, CO 81435",
    lat: 37.93658,
    lng: -107.81173,
    beds: "3 Bedroom, 2 Bath, ~1330 sq ft",
    price: "$405,507 (deed-restricted)",
    source: "SMRHA",
    contact: { phone: "(970) 728-3034", email: "admin@smrha.org" },
    url: "https://smrha.org/silver-jack-202/",
    smrhaSlug: "silver-jack-202",
    note: "Tier 1 Town Constructed Unit. HOA $307.64/mo. Contact SMRHA for eligibility and application details.",
    org: "telluride"
  },
  {
    title: "🏠 Silver Jack 205",
    type: "deed-sale",
    address: "155 West Pacific Avenue, Unit 205, Telluride, CO 81435",
    lat: 37.93658,
    lng: -107.81173,
    beds: "2 Bedroom, 1 Bath, ~935 sq ft",
    price: "$368,620 (deed-restricted)",
    source: "SMRHA",
    contact: { phone: "(970) 728-3034", email: "admin@smrha.org" },
    url: "https://smrha.org/silver-jack-205/",
    smrhaSlug: "silver-jack-205",
    note: "Tier 1 Town Constructed Unit. HOA $218.42/mo. Contact SMRHA for eligibility and application details.",
    org: "telluride"
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
    date: "September 30, 2026",
    title: "Special Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8313",
    hasAgenda: true,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "10:00 AM",
    civicwebId: 8313,
    packetUrl: "https://telluride-co.civicweb.net/document/445210/"
  },
  {
    date: "October 1, 2026",
    title: "Special Meeting - Planning & Zoning Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8311",
    hasAgenda: true,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "5:30 PM",
    civicwebId: 8311,
    packetUrl: "https://telluride-co.civicweb.net/document/445599/"
  },
  {
    date: "October 1, 2026",
    title: "Town Council Budget",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8053",
    hasAgenda: true,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "9:00 AM",
    civicwebId: 8053,
    packetUrl: "https://telluride-co.civicweb.net/document/445473/"
  },
  {
    date: "October 5, 2026",
    title: "Open Space Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8132",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "4:00 PM",
    civicwebId: 8132
  },
  {
    date: "October 6, 2026",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8044",
    hasAgenda: true,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "10:00 AM",
    civicwebId: 8044,
    packetUrl: "https://telluride-co.civicweb.net/document/445576/"
  },
  {
    date: "October 7, 2026",
    title: "Ecology Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8119",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "4:00 PM",
    civicwebId: 8119
  },
  {
    date: "October 7, 2026",
    title: "Telluride Housing Authority Subcommittee",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8164",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "9:00 AM",
    civicwebId: 8164
  },
  {
    date: "October 13, 2026",
    title: "Special Town Council Budget",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8307",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "9:00 AM",
    civicwebId: 8307
  },
  {
    date: "October 21, 2026",
    title: "Parks & Recreation Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8083",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "12:00 PM",
    civicwebId: 8083
  },
  {
    date: "October 22, 2026",
    title: "Planning & Zoning Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8106",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "5:30 PM",
    civicwebId: 8106
  },
  {
    date: "October 27, 2026",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8045",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "10:00 AM",
    civicwebId: 8045
  },
  {
    date: "November 4, 2026",
    title: "Ecology Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8120",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "4:00 PM",
    civicwebId: 8120
  },
  {
    date: "November 4, 2026",
    title: "Telluride Housing Authority Subcommittee",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8165",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "9:00 AM",
    civicwebId: 8165
  },
  {
    date: "November 5, 2026",
    title: "Special Meeting - Planning & Zoning Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8312",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "5:30 PM",
    civicwebId: 8312
  },
  {
    date: "November 5, 2026",
    title: "Town Council Budget",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8054",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "9:00 AM",
    civicwebId: 8054
  },
  {
    date: "November 9, 2026",
    title: "Open Space Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8133",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "4:00 PM",
    civicwebId: 8133
  },
  {
    date: "November 17, 2026",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8046",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "10:00 AM",
    civicwebId: 8046
  },
  {
    date: "November 18, 2026",
    title: "Parks & Recreation Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8084",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "12:00 PM",
    civicwebId: 8084
  },
  {
    date: "November 19, 2026",
    title: "Resident Advisory Committee",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8320",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "4:00 PM",
    civicwebId: 8320
  },
  {
    date: "November 19, 2026",
    title: "Planning & Zoning Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8108",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "5:30 PM",
    civicwebId: 8108
  },
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
    title: "Town Council Retreat",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8051",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "9:00 AM",
    civicwebId: 8051
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
