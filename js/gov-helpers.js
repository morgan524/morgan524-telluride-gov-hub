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
  // ISO format "YYYY-MM-DD..." — split on dash to avoid UTC interpretation
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
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
  "county|2026-07-14|Historical Commission":
    {"sv":4},

  "telluride|2026-07-15|Historic & Architectural Review Commission Chair - Jul 15 2026":
    {"sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/dRjdHtmeTB6DmemBLALAFw","meetingId":"876 4109 1694","passcode":"695618.","phone":"301-715-8592","agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8019"},

  "telluride|2026-07-15|Historic & Architectural Review Commission - Jul 15 2026":
    {"sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/KKzcuKFdTuyXzpw65k2aAA","meetingId":"812 9136 3866","passcode":"440860.","phone":"301-715-8592","agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8018"},

  "telluride|2026-07-15|Parks & Recreation Commission - Jul 15 2026":
    {"sv":4},

  "county|2026-07-15|Board of County Commissioners Meeting":
    {"sv":4,"zoomUrl":"https://us02web.zoom.us/meeting/register/87LtYrfrQi6gpaig1FKSzA","meetingId":"891 9923 0367","passcode":"036814","phone":"719-359-4580","agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/898/files/agenda/1917"},

  "airport|2026-07-16|TRAA Board of Commissioners Meeting":
    {"sv":2},

  "telluride|2026-07-16|Liquor Licensing Authority - Jul 16 2026":
    {"sv":4,"zoomUrl":"https://us06web.zoom.us/j/86169871704?pwd=oK56hZLiXIbBia4HLKYI9XqWcVl8Uz.1","meetingId":"861 6987 1704","passcode":"281002.","phone":"346-248-7799","agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8143"},

  "fire|2026-07-21|Board of Directors Meeting":
    {"sv":2},

  "telluride|2026-07-21|Town Council - Jul 21 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8040","zoomUrl":"https://us06web.zoom.us/meeting/register/hL-sJDF8Q8ej2lG69VjXKg","meetingId":"834 6167 7173","passcode":"555594.","phone":"719) 359-4580"},

  "county|2026-07-22|Board of County Commissioners Special Meeting":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/868/files/agenda/1924","zoomUrl":"https://us02web.zoom.us/meeting/register/o_8OplehSy6kph_vj5KITw","meetingId":"836 0680 9358","passcode":"535472","phone":"719-359-4580"},

  "telluride|2026-07-23|Planning & Zoning Commission - Jul 23 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8100","zoomUrl":"https://us06web.zoom.us/meeting/register/pvzPtHtIRZmah22XUU2xLg","meetingId":"846 6324 0731","passcode":"464545","phone":"301-715-8592"},

  "telluride|2026-07-23|Planning & Zoning Commission Chair - Jul 23 2026":
    {"sv":4},

  "county|2026-07-09|Planning Commission and Board of County Commissioners Joint Work Session":
    {"zoomUrl":"https://us06web.zoom.us/j/86169399856?pwd=UPH9VHFb655TsZwXPmXCQ4BKMCZ9n5.1","meetingId":"861 6939 9856","passcode":"690306","phone":"970-728-3844","sv":4},

  "county|2026-07-27|Open Space Commission Meeting":
    {"sv":4},

  "county|2026-07-29|Planning Commission and Board of County Commissioners Joint Work Session":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1043/files/agenda/1934","zoomUrl":"https://us02web.zoom.us/j/89046113764","meetingId":"890 4611 3764","passcode":"475547","phone":"719-359-4580"},

  "telluride|2026-07-29|(RESCHEDULED) Parks & Recreation Commission - Jul 29 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8288","zoomUrl":"https://us06web.zoom.us/j/84856441443?pwd=rmlX3jEAgnuYU0lkGGCJWN2aaQ5lyr.1"},

  "telluride|2026-07-15|(RESCHEDULED) Parks & Recreation Commission - Jul 15 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8080"},

  "telluride|2026-07-21|Telluride Housing Authority - Jul 21 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8289"},

  "county|2026-07-12|San Miguel Basin Fair Board":
    {"sv":4},

  "county|2026-07-14|San Miguel Basin Fair Board":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1049/files/agenda/1892"},

  "county|2026-07-15|San Miguel Basin Fair Board":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1050/files/agenda/1893"},

  "county|2026-07-16|San Miguel Basin Fair Board":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1046/files/agenda/1894"},

  "county|2026-07-17|San Miguel Basin Fair Board":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1047/files/agenda/1895"},

  "county|2026-07-18|San Miguel Basin Fair Board":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1045/files/agenda/1896"},

  "telluride|2026-08-03|Open Space Commission - Aug 03 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8130","zoomUrl":"https://us06web.zoom.us/meeting/register/ePrh_CzmTLKqp0syEbUesw","meetingId":"894 7506 0147","passcode":"314276.","phone":"719) 359-4580"},

  "telluride|2026-08-05|Ecology Commission - Aug 05 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8117","zoomUrl":"https://us06web.zoom.us/j/84372531870?pwd=Dzpb3SzCKOLJejMu5DGalEWqJghGlM.1","phone":"970-728-3071"},

  "telluride|2026-08-05|Commission for Community Assistance, Arts & Special Events - Aug 05 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8065","zoomUrl":"https://us06web.zoom.us/meeting/register/tZ0pc-ChqDwsGNFpPigfqqLQptmoMmpJdiOx"},

  "telluride|2026-08-05|Telluride Housing Authority Subcommittee - Aug 05 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8162","zoomUrl":"https://us06web.zoom.us/j/83022451705?pwd=Lj8jkLF9GQny7CWBqvP8IYkQhviQBb.1","meetingId":"830 2245 1705","passcode":"229528.","phone":"719) 359-4580"},

  "county|2026-08-05|Board of County Commissioners Meeting":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/886/files/agenda/1944","zoomUrl":"https://us02web.zoom.us/meeting/register/Usig5v0QSkGHbjSBf4K6oA","meetingId":"838 9184 9311","passcode":"530688","phone":"719-359-4580"},

  "telluride|2026-07-21|Block 23 Housing Corporation - Jul 21 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8290"},

  "county|2026-07-16|Housing Code Update SSR":
    {"zoomUrl":"https://us06web.zoom.us/j/84502946677?pwd=cKG6VanJpoiIt8Kl8GR5bYs2hXb3ce.1","meetingId":"845 0294 6677","passcode":"519464","sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1051/files/agenda/1898"},

  "telluride|2026-08-06|Town Council Retreat - Aug 06 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8050","zoomUrl":"https://us06web.zoom.us/meeting/register/8596sfn-QZC7tbYJiXF4YA","meetingId":"845 3020 1574","passcode":"082987.","phone":"719) 359-4580"},

  "telluride|2026-07-23|Planning & Zoning Commission Chair - Jul 23 2026 - CANCELLED":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8099"},

  "telluride|2026-08-10|Intergovernmental Worksession - Aug 10 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8057","zoomUrl":"https://us06web.zoom.us/meeting/register/ZOZQ7J9UTmKHp7XXMuliiw","meetingId":"886 1441 5107","passcode":"070631.","phone":"719) 359-4580"},

  "telluride|2026-07-26|Open Space Commission - Jul 26 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8292"},

  "telluride|2026-07-13|Open Space Commission Site Walk - Jul 13 2026":
    {"sv":4},

  "telluride|2026-08-11|Town Council - Aug 11 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8041","zoomUrl":"https://us06web.zoom.us/meeting/register/HhPERZh2Rey09qBDf2d5ug","meetingId":"830 1182 2138","passcode":"888369.","phone":"719) 359-4580"},

  "ridgway|2026-07-15|Ridgway Planning Commission Meeting":
    {"zoomUrl":"https://us02web.zoom.us/j/83926517027?pwd=V8wFqdDzZdJ3aYPmILDxIyVt8aQWpA.1","meetingId":"839 2651 7027","passcode":"519777","phone":"970.626.5308","sv":4,"agendaUrl":"https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway-Planning-Commission-Meeting-Packet---July-15%2C-2026.pdf"},

  "rico|2026-07-15|Rico Board of Trustees Regular Meeting":
    {"sv":4,"agendaUrl":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20July%202026%20Agenda.pdf"},

  "county|2026-08-12|Board of County Commissioners Work Session":
    {"sv":4},

  "smart|2026-08-13|SMART Board of Directors":
    {"agendaUrl":"null","sv":4,"ph":"b858cb282617fb09"},

  "county|2026-08-13|Planning Commission Meeting":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/922/files/agenda/1949"},

  "telluride|2026-07-27|Special Town Council - Jul 27 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8294","sv":4,"zoomUrl":"https://us06web.zoom.us/j/83026171795?pwd=4cWG6X1zHUnG7rNIbuMYaAeGXgIESW.1","meetingId":"830 2617 1795","passcode":"256663.","phone":"719) 359-4580"},

  "telluride|2026-07-20|Gondola Subcommittee - Jul 20 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8295","zoomUrl":"https://gbsm.zoom.us/j/82559576086","phone":"719-359-4580","sv":4},

  "county|2026-07-27|Housing Code Update SSR":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1052/files/agenda/1930","zoomUrl":"https://us06web.zoom.us/j/84045287708?pwd=2u4vMzFjoI7ZFitrp3Zp9yUa0YQh0b.1","meetingId":"840 4528 7708","passcode":"230003"},

  "rico|2026-08-19|Rico Board of Trustees Regular Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-08-19|Historic & Architectural Review Commission Chair - Aug 19 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8021","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/dRjdHtmeTB6DmemBLALAFw","meetingId":"854 0207 9752","passcode":"775535","phone":"301-715-8592"},

  "telluride|2026-08-19|Historic & Architectural Review Commission - Aug 19 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8020","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/KKzcuKFdTuyXzpw65k2aAA","meetingId":"812 9136 3866","passcode":"440860.","phone":"301-715-8592"},

  "telluride|2026-08-19|Parks & Recreation Commission - Aug 19 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8081","sv":4,"ph":"e232fffd40cd7ad2"},

  "county|2026-07-21|SMC Historical Commission Meeting":
    {"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1053/files/agenda/1926","sv":4,"zoomUrl":"https://us02web.zoom.us/j/85010485711","meetingId":"850 1048 5711","passcode":"333002","phone":"970-728-3844"},

  "county|2026-08-19|Board of County Commissioners Meeting":
    {"sv":4,"ph":"a12dfd2ce826475e"},

  "telluride|2026-08-20|Liquor Licensing Authority - Aug 20 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8291","sv":4,"ph":"278bc1c1c8c6db27"},

  "mv|2026-08-20|Town Council Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-07-23|San Miguel Authority for Regional Transportation - Jul 23 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8296","zoomUrl":"https://us02web.zoom.us/j/89367662245?pwd=2HUCttMjcQln5Ic8lxRyUKGWLMD0q1.1","sv":4},

  "norwood|2026-08-12|Board of Trustees Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "norwood|2026-08-17|Planning and Zoning Commission Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "mv|2026-08-06|Design Review Board":
    {"sv":4,"agendaUrl":"https://townofmountainvillage.com/site/assets/files/49516/august_6-_2026_design_review_board_meeting_agenda.pdf","zoomUrl":"https://us06web.zoom.us/j/84661174346?pwd=pGG47aNtAK3sjfccaVrai3o6jbV3bZ.1","meetingId":"846 6117 4346"},

  "med|2026-07-23|Regular Board Meeting":
    {"sv":4},

  "ophir|2026-08-18|General Assembly Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "ridgway|2026-08-12|Ridgway Town Council Regular Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "norwood|2026-08-11|Norwood Water Commission Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-07-28|Gondola Leadership Committee - Jul 28 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8297","zoomUrl":"https://us06web.zoom.us/j/85350165336?pwd=P0eS14nFbqd5jLXEO2gckIoA9kPAro.1","sv":4},

  "telluride|2026-08-20|Planning & Zoning Commission - Aug 20 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8102","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/tZ0qd-GsrDwuGtGVXN_cveUy9V0AT2ZawXEW","meetingId":"897 0842 7405","passcode":"430134","phone":"301-715-8592"},

  "telluride|2026-08-20|Planning & Zoning Commission Chair - Aug 20 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8101","sv":4},

  "tmvoa|2026-07-28|Gondola Leadership Committee Meeting":
    {"agendaUrl":"https://tmvoa.org/site/assets/files/4825/07_28_26_leadership_gondola_agenda_updated.pdf","zoomUrl":"https://us06web.zoom.us/j/85350165336?pwd=P0eS14nFbqd5jLXEO2gckIoA9kPAro.1","sv":4},

  "tmvoa|2026-08-11|Mountain Village Merchant Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "tmvoa|2026-08-20|TMVOA Investment Committee Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "county|2026-08-26|Board of County Commissioners Work Session":
    {"sv":4,"ph":"5bee59f208152c68"},

  "norwood|2026-07-29|Board of Trustees Work Session":
    {"agendaUrl":"https://www.norwoodtown.com/files/62b999f7f/07.29.2026+Work+Session+Board+of+Trustee+Agenda+ADA.pdf","zoomUrl":"https://us02web.zoom.us/j/84191917434","meetingId":"841 9191 7434","passcode":"905972","phone":"970-327-4288","sv":4},

  "med|2026-08-27|Regular Board Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "norwood|2026-07-29|NWC Possible Quorum":
    {"agendaUrl":"https://www.norwoodtown.com/files/1c026ffd5/07+2026+QUORUM+NOTICE.pdf","sv":4},

  "norwood|2026-08-05|Board of Trustees Work Session":
    {"agendaUrl":"https://www.norwoodtown.com/files/6bce913bf/08.05.2026+Work+Session+Board+of+Trustee+Agenda+ADA.pdf","zoomUrl":"https://us02web.zoom.us/j/87433907008","meetingId":"874 3390 7008","passcode":"126738","phone":"970-327-4288","sv":4},

  "tmvoa|2026-07-31|TMVOA Board of Directors Meeting":
    {"agendaUrl":"https://tmvoa.org/site/assets/files/4830/tmvoa_board_meeting_agenda_7_31_26-1.pdf","zoomUrl":"https://us02web.zoom.us/meeting/register/0AWXShBnSs6SxMTp_gdNUg","meetingId":"8 7 3 8703 5414","passcode":"213545","sv":4},

  "ouray|2026-08-05|, 2-4:00 PM - Virtual Meeting Only - No in-person attendance.  Work session to review and discuss possible changes to the Ouray County Land Use Code, Section 2 – Definitions. (Packet materials are attached to the agenda)":
    {"agendaUrl":"https://ouraycountyco.gov/AgendaCenter/PreviousVersions/1014","sv":4},

  "telluride|2026-09-01|Town Council - Sep 01 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8042","sv":4,"ph":"afbb6fcf58f46cfd"},

  "telluride|2026-09-02|Ecology Commission - Sep 02 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8118","sv":4,"ph":"2b8857be6e12267c"},

  "telluride|2026-09-02|Commission for Community Assistance, Arts & Special Events - Sep 02 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8066","sv":4,"ph":"3bcbff87c865ec6d"},

  "telluride|2026-09-02|Telluride Housing Authority Subcommittee - Sep 02 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8163","sv":4,"ph":"558b2c991b258cd1"},

  "county|2026-09-02|Board of County Commissioners Meeting":
    {"sv":4,"ph":"a12dfd2ce826475e"},

  "mv|2026-09-03|Design Review Board":
    {"sv":4,"ph":"b858cb282617fb09"},

  "county|2026-08-27|CWAB":
    {"sv":4,"ph":"23152d2f933fa82e"},

  "telluride|2026-08-20|Planning & Zoning Commission Chair - Aug 20 2026 - Cancelled":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8101","sv":4}
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
    date: "2026-08-07",
    title: "Who counts as a 'Qualified Owner' anyway?",
    body: "The Board of County Commissioners held a public hearing August 5 on a proposed change to the Land Use Code's definition of 'Qualified Owner' — Section 5-1305B, with ripple amendments to two related sections. That definition shapes who can own and do what with certain properties in the county. Tighten it and you may keep speculation out; loosen it and you may open doors for legitimate buyers who don't currently qualify. Nothing is final — these are hearings, not adopted resolutions. So: does the current definition need fixing, and if so, in which direction?",
    choices: ["Definition's too restrictive", "Current rules protect us", "Depends who benefits", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-06",
    title: "When a roof costs more than the rules allow",
    body: "Lela and Jon Martin need a new roof on their deed-restricted Gold Run unit. The bid came in at $47,743.86 — roughly 17% of their original purchase price. Their 2010-era deed restriction only lets staff approve capital improvements up to 5% without a finding that the work adds occupancy capacity. A failing roof clearly doesn't do that. Staff recommends approval anyway, but admits the legal standard may not be met.\n\nOne view: the rules exist to keep deed-restricted units affordable, not to trap owners with deteriorating roofs. The other: if exceptions get made case by case, the caps lose their meaning.\n\nWhen the rules and the reality collide like this, what should the subcommittee do?",
    choices: ["Approve it — a roof is a roof", "Hold the line on the cap", "Update the deed restriction first", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-05",
    title: "Dogs on the Valley Floor — a little, or not at all?",
    body: "The Open Space Commission is weighing a recommendation to Town Council to allow dogs on a limited portion of the River Trail on the Valley Floor. Three trail alignments for that same Reach 1 segment are also on the table, each routed around mapped wetlands near the Public Works facility. Nothing is decided yet — this is a commission recommendation, not a final vote. Some residents see a reasonable middle ground; others think any access sets a precedent for a space that was set aside for a reason. Where do you stand?",
    choices: ["Dogs belong on the trail", "Keep the floor dog-free", "Depends on the alignment", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-04",
    title: "Bears, people, and who adjusts for whom",
    body: "The Ecology Commission meets August 5 to take up human-wildlife interactions and public safety. Up here that's not an abstract topic — it's your trash can, your dog, your trail. The tension is real: some residents want stronger rules on human behavior to protect wildlife, others think safety measures should focus first on keeping people safe and that wildlife has plenty of advocates already. Both views come from people who care about this place.\n\nWhere do you think the balance should land?",
    choices: ["Protect wildlife first", "Prioritize human safety", "Both, if rules are fair", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-03",
    title: "Foreclosure in Mountain Village — who's watching?",
    body: "Two properties in Mountain Village are headed to foreclosure sale. That's not nothing up here. Some residents will see it as routine legal process — debts come due, the system works as designed. Others will wonder what it signals about the broader market, or whether there are downstream effects on the community. Neither read is wrong. The sales are upcoming; nothing has been decided beyond the legal notices.\n\nWhat do foreclosure sales in Mountain Village mean to you?",
    choices: ["Part of how markets work", "Worth paying attention to", "Depends on who's affected", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-02",
    title: "What's open space actually for?",
    body: "The Open Space Commission is meeting to talk about priorities and criteria for acquiring, managing, and maintaining open space in town. That sounds straightforward — until you realize \"open space\" means different things to different people. Some want land preserved as-is, untouched. Others see managed open space as a place for trails, recreation, or even future infrastructure. How the commission sets its criteria now shapes what council hears next. Nothing is decided yet — this is a priorities conversation.\n\nSo: what should come first when the town decides what open space is worth protecting — and how?",
    choices: ["Keep it wild, limit the uses", "Build it out for recreation", "Acquisition first, debate use later", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-01",
    title: "Wildfire rules: how tight is tight enough?",
    body: "The intergovernmental worksession on August 10 has Council sitting down with San Miguel County to talk through proposed updates to Wildfire Area standards — no final vote, just a work session. Some residents will want stricter rules: the fire risk up here is real and the stakes are high. Others will push back on what tighter regulations mean for property owners, builders, and costs. Both sides have a point. So where do you land — do current wildfire standards need to get tougher, or is the county overreaching?",
    choices: ["Tighten the standards", "Current rules are enough", "Depends on the details", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-07-31",
    title: "Natural medicine businesses — where do they fit up here?",
    body: "Town and county reps are set to sit down together on August 10 to talk about proposed Land Use Code amendments — one of which would create new regulations for Natural Medicine Businesses. Nothing is decided yet; this is a worksession.\n\nSome residents will see a framework for natural medicine businesses as a reasonable step toward clarity and oversight. Others will question whether the valley needs to invite that particular industry at all, or worry about what regulations might — or might not — actually control.\n\nWhere do you come down?",
    choices: ["Regulate and allow them", "Keep them out entirely", "Depends on the rules", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-07-30",
    title: "Should your tax bill get a second opinion?",
    body: "Through August 5, the San Miguel County Board of Commissioners is sitting as the Board of Equalization — meaning property owners can appeal the Assessor's valuation of their land. It's a quiet process most people don't know exists. Those who do show up argue the numbers are off and they're paying more than their fair share. Assessors counter that their valuations reflect the market and that appeals from high-value owners can quietly shift the burden onto everyone else. So: is the appeals process a necessary check, or a tool that mostly benefits those who already know how to use it?",
    choices: ["Necessary check on the Assessor", "Shifts burden onto everyone else", "Depends who's appealing", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-07-29",
    title: "Town leases, two names, one work session",
    body: "The Board of Trustees is looking at two lease renewals — one for Motion Sense Therapy and Performance, LLC at 1110 Lucerne St, another for Austin Overholt at 1475 Pine St. Nothing can be decided at a work session; this is the conversation before the vote.\n\nUp here, who gets space in town-owned buildings is never just a paperwork question. Some residents think scarce local square footage should go to services that fill a gap the market won't. Others figure a fair renewal process is a fair renewal process, and second-guessing tenants opens a different can of worms.\n\nWhen the town controls the lease, how should it weigh community need against straightforward renewal?",
    choices: ["Prioritize community need each time", "Honor renewals — keep it consistent", "Depends on what's in the lease", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-07-28",
    title: "Four new units and a continued project walk into Design Review",
    body: "Two multifamily projects are headed to the Design Review Board on August 6 — four new units at 100 Pennington Place, and a multifamily building on Lost Creek Lane that's already been through once and is back for a second look. No votes have happened yet; this is still review.\n\nPeople who want more housing see projects like these as exactly what the town needs. People who watch the character of their neighborhood closely tend to have opinions about density and design that don't always line up with that. Both concerns are real up here.\n\nWhere do you land when new multifamily housing comes up for review?",
    choices: ["More units, keep it moving", "Design and scale matter first", "Depends on the project", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-07-27",
    title: "Town Park gets a makeover — but which one?",
    body: "The Parks & Recreation Commission has a rescheduled meeting on the books, and on the table are two potential improvements: upgrades to the Telluride Town Park Oval and fencing and safety netting at Warner Field. Both cost money and change spaces people already use every day. Some residents will say the Oval and Warner Field are overdue for attention — safety netting especially is hard to argue with. Others will wonder whether the priority and the price are right when housing and basic services are still stretched. Nothing is decided yet.\n\nSo — which of these feels more pressing to you, or do you think neither should jump the line right now?",
    choices: ["Town Park Oval first", "Warner Field safety first", "Neither is the priority", "Not sure yet"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-07-26",
    title: "The gondola's books are open — sort of",
    body: "The Gondola Leadership Committee is taking up a fiscal and economic impact analysis at its next meeting, alongside updates on CIG Program funding commitments and where the project actually stands. That's the kind of agenda that tends to split a room. Supporters will say the numbers prove the gondola pays for itself and then some. Skeptics will want to know who's on the hook if the projections don't hold. Neither side is wrong to ask.\n\nSo — does an economic impact analysis change how you're thinking about this project, or is the funding picture still too murky to say?",
    choices: ["The analysis moves me toward yes", "Still too many unknowns", "Depends what the numbers actually show", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-07-25",
    title: "Three town projects, one designer, one question",
    body: "The Planning & Zoning Commission is looking at three Town-owned development projects — Carhenge at 700 W Pacific Ave, the Shandoka Lot at 860 Black Bear Rd (a 4.07-acre parcel), and a minor subdivision at 238 N Pine Street — all in the same zone, all designed by the same firm. None of these are final votes; these are conceptual and preliminary hearings.\n\nThe tension is straightforward. Some folks will see the town developing its own land as smart use of public assets — housing and amenities this place badly needs. Others will look at open-space-adjacent parcels and wonder whether building on them is a trade we can undo. Both views are reasonable.\n\nWhen the town develops land it owns, what matters most to you?",
    choices: ["Getting housing built on it", "Keeping it open or low-impact", "Depends on the specific site", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-07-24",
    title: "Town land, town call",
    body: "Three projects on town-owned parcels are heading to Planning & Zoning — two at Carhenge (700 W Pacific Ave) and one at the Shandoka Lot (860 Black Bear Rd, 4.07 acres). All three sit next to open space. All three are designed by the same firm, on land the town itself owns. That's the tension: some neighbors will see town-owned, open-space-adjacent land as the last place to put new construction; others will argue that if the town controls the land, this is exactly where it should direct development it can shape. Neither position is crazy.\n\nSo — when the town owns the land, does that make development there more acceptable, or less?",
    choices: ["More acceptable — town can control it", "Less acceptable — protect that edge", "Depends on what gets built", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-07-23",
    title: "Who counts as a resident when a kid has two homes?",
    body: "The Telluride Housing Authority is taking up a genuinely knotty question: what happens to deed-restricted housing rules when a household doesn't fit the standard definition — specifically, dependents of multiple custodial parents. The board has set aside 40 minutes for a proposed policy statement on primary residency in those cases, which signals it's not a clean fix.\n\nSome will say the rules need to flex for real family situations. Others will say any loosening of residency definitions creates openings that undermine deed restrictions for everyone. The waitlist pressure isn't getting lighter.\n\nHow strictly should primary residency be defined in deed-restricted housing?",
    choices: ["Strict definitions protect the system", "Real families don't fit neat rules", "Depends on the case", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-07-22",
    title: "Healing centers, meet the Land Use Code",
    body: "Town Council takes up a Land Use Code amendment August 11 that would add new regulations for natural medicine businesses — a fresh Section 5-31 — with an intergovernmental worksession alongside the county the day before.\n\nSome will read this as sensible groundwork: write the rules before anyone opens a door. Others will ask why a town this size needs a new chapter of code before there's a business to regulate. Nothing's decided yet — the amendment still has to get through Council.\n\nGood groundwork, or code creep?",
    choices: ["Write the rules first", "Wait for a real applicant", "It's complicated"],
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
  "telluride|2026-08-20|Liquor Licensing Authority - Aug 20 2026":
    "The Telluride Liquor Licensing Authority is expected to review liquor license applications or changes requiring local approval. As the local licensing authority, the hearing officer will consider matters brought before the board, with new licenses and appeals handled separately by Town Council.",

  "telluride|2026-08-19|Historic & Architectural Review Commission Chair - Aug 19 2026":
    "The Historic & Architectural Review Commission is expected to convene for its regular August 2026 session. No specific agenda items are detailed in the available materials, but as a standing body, the Commission typically reviews proposed construction, renovation, or development projects for compliance with Telluride's historic preservation and architectural standards.",

  "telluride|2026-08-19|Historic & Architectural Review Commission - Aug 19 2026":
    "The Historic and Architectural Review Commission is expected to review applications for Certificates of Appropriateness related to proposed changes to structures or signs within Telluride. The commission may also address matters concerning historic designations, preservation standards, or updates to inventories of architecturally and historically significant properties.",

  "telluride|2026-08-19|Parks & Recreation Commission - Aug 19 2026":
    "The Parks & Recreation Commission is expected to meet to discuss community parks and recreation needs and services for the Town of Telluride. Specific agenda items have not been published, but the commission regularly interprets community desires to guide parks and recreation programming and planning.",

  "telluride|2026-08-11|Town Council - Aug 11 2026":
    "Council is expected to consider a Land Use Code amendment adding new regulations for Natural Medicine Businesses (Section 5-31). The meeting may also address a request to replace a lost share certificate for the Farmers' Water Development Company.",

  "telluride|2026-08-10|Intergovernmental Worksession - Aug 10 2026":
    "Council is expected to meet in an intergovernmental worksession with San Miguel County representatives to discuss proposed Land Use Code amendments, including new regulations for Natural Medicine Businesses, changes to the \"Qualified Owner\" definition, and updates to Wildfire Area standards. A lost water share certificate replacement may also be addressed.",

  "county|2026-08-12|Board of County Commissioners Work Session":
    "Board will consider proposals for foundation repairs at the Placerville Schoolhouse and roofing work on the Trout Lake Water Tank. Related legal notices also cover property tax exemption programs for seniors, disabled veterans, and gold star spouses, as well as upcoming foreclosure sales on two Mountain Village properties.",

  "county|2026-08-13|Planning Commission Meeting":
    "The Planning Commission is expected to meet on August 13, 2026. Related notices include requests for proposals for foundation repairs at the Placerville Schoolhouse and Trout Lake Water Tank roofing, property tax exemption notices for seniors and veterans, and two foreclosure sale auctions in Telluride Mountain Village.",

  "county|2026-08-19|Board of County Commissioners Meeting":
    "Board will consider proposals for foundation repairs at the Placerville Schoolhouse and roofing work on the Trout Lake Water Tank. Related legal notices include property tax exemption information for seniors, disabled veterans, and gold star spouses, along with foreclosure and probate matters in the county.",

  "telluride|2026-08-20|Planning & Zoning Commission - Aug 20 2026":
    "The Telluride Planning & Zoning Commission is expected to consider a site-specific development plan vesting notice for a local project. Commissioners may also review related land use matters. The meeting will be live streamed on YouTube.",

  "telluride|2026-08-20|Planning & Zoning Commission Chair - Aug 20 2026":
    "The Planning & Zoning Commission Chair meeting on August 20, 2026 may address a proposed Land Use Code amendment establishing regulations for Natural Medicine Businesses, as well as a site-specific development plan vesting notice. Detailed agenda items were not fully available in the provided materials.",

  "county|2026-08-26|Board of County Commissioners Work Session":
    "Commissioners are expected to address county administrative matters. Related legal notices include probate and creditor claims for multiple estates and two foreclosure sales involving properties in Telluride and Telluride Mountain Village, managed by the San Miguel County Public Trustee.",

  "telluride|2026-09-01|Town Council - Sep 01 2026":
    "Council is expected to address a utilities matter involving a request to replace a lost or destroyed share certificate (#887) for the Farmers' Water Development Company, originally issued to A.F. Newans M.D. Additional agenda items have not been specified in available materials.",

  "telluride|2026-09-02|Ecology Commission - Sep 02 2026":
    "The Ecology Commission is expected to meet to address human-wildlife interactions in Telluride, consistent with its ongoing mandate to reduce threats to wildlife and public safety. Specific agenda items for the September 2, 2026 meeting have not been publicly detailed in available materials.",

  "telluride|2026-09-02|Commission for Community Assistance, Arts & Special Events - Sep 02 2026":
    "The Commission for Community Assistance, Arts & Special Events is expected to consider matters related to annual funding allocations for community support and arts organizations, special events scheduling, and applications for street closures and banners in Telluride.",

  "telluride|2026-09-02|Telluride Housing Authority Subcommittee - Sep 02 2026":
    "The Telluride Housing Authority Subcommittee is expected to meet on September 2, 2026, as part of its regular monthly schedule. No specific agenda items are publicly detailed, but the subcommittee typically addresses local affordable housing matters, program updates, and related administrative business.",

  "county|2026-09-02|Board of County Commissioners Meeting":
    "Board will consider matters related to several legal and financial notices, including two foreclosure sales involving properties in Telluride and Mountain Village, and probate proceedings for multiple estates in San Miguel County.",

  "county|2026-08-27|CWAB":
    "The San Miguel County CWAB meeting is expected to involve legal and financial matters, including probate proceedings for multiple estates and foreclosure sales on properties in Telluride and Mountain Village, such as a vacant lot on Stonegate Drive and a Double Diamond condominium unit.",

  "telluride|2026-08-20|Planning & Zoning Commission Chair - Aug 20 2026 - Cancelled":
    "The August 20, 2026 Planning & Zoning Commission Chair meeting in Telluride has been cancelled. No agenda items will be heard. Residents with matters before the commission should watch for rescheduling information."
};        // pre-meeting agenda previews (Claude)
const REGIONAL_NEWS_ARTICLES = [
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
    title: "Pioneer Day",
    source: "Norwood Colorado",
    sourceKey: "norwood",
    date: "September 26, 2026",
    newsTopic: "community",
    copy: "Celebration of local history and pioneers.",
    href: "https://norwoodcolorado.com/event/pioneer-day-2/",
    img: ""
  },
  {
    title: "2026 Chamber Meeting, September",
    source: "Norwood Colorado",
    sourceKey: "norwood",
    date: "September 8, 2026",
    newsTopic: "community",
    copy: "Monthly Chamber of Commerce meeting open to all.",
    href: "https://norwoodcolorado.com/event/2026-chamber-meeting-september/",
    img: ""
  },
  {
    title: "Fourth Friday Films, August",
    source: "Norwood Colorado",
    sourceKey: "norwood",
    date: "August 21, 2026",
    newsTopic: "arts-culture",
    copy: "Outdoor movie screening with popcorn and drinks available.",
    href: "https://norwoodcolorado.com/event/fourth-friday-films-august-2/",
    img: ""
  },
  {
    title: "2026 Chamber Meeting, August",
    source: "Norwood Colorado",
    sourceKey: "norwood",
    date: "August 11, 2026",
    newsTopic: "community",
    copy: "Monthly Chamber of Commerce meeting open to all.",
    href: "https://norwoodcolorado.com/event/2026-chamber-meeting-august/",
    img: ""
  },
  {
    title: "2026 Chamber Meeting, August",
    source: "Norwood Colorado",
    sourceKey: "norwood",
    date: "August 11, 2026",
    newsTopic: "community",
    copy: "Monthly Chamber of Commerce meeting open to all.",
    href: "https://norwoodcolorado.com/event/2026-chamber-meeting-august-2/",
    img: ""
  },
  {
    title: "Music on the Mesa",
    source: "Norwood Colorado",
    sourceKey: "norwood",
    date: "August 8, 2026",
    newsTopic: "arts-culture",
    copy: "Live music event on the mesa.",
    href: "https://norwoodcolorado.com/event/music-on-the-mesa-4/",
    img: ""
  },
  {
    title: "Community Meeting: Regarding flooding, economic impacts and community resilience",
    source: "Ouray County",
    sourceKey: "ouray-county",
    date: "August 6, 2026",
    newsTopic: "public-safety",
    copy: "Community Meeting - Regarding flooding, economic impacts, and community resilience following the Gold Mountain Fire and subsequent flash flood/debris flows.",
    href: "https://ouraycountyco.gov/CivicAlerts.aspx?aid=958",
    img: "https://ouraycountyco.gov/ImageRepository/Document?documentID=22878"
  },
  {
    title: "Invitation to Prayer/Fellowship Wednesday Morning",
    source: "St. Patrick's Catholic Church",
    sourceKey: "stpatricks",
    date: "August 4, 2026",
    newsTopic: "community",
    copy: "This is an open invitation to all women in Telluride. Please come and join us on Wednesday, August 5th...7:30 am Rosary8:00 am Holy MassImmediately after we will go to Butcher and Baker for fellowship. Join as able....Contact Katrina with question...",
    href: "https://stpatrickstelluride.com/2026/parish-news/invitation-to-prayer-fellowship-wednesday-morning-4/",
    img: ""
  },
  {
    title: "Parish Bulletin for August 2",
    source: "St. Patrick's Catholic Church",
    sourceKey: "stpatricks",
    date: "August 1, 2026",
    newsTopic: "community",
    copy: "Attached is this week's bulletin. Please check the Parish Calendar for the most updated information. With this being the first weekend of the month, there will be Holy Adoration for 30 minutes before the Vigil and Sunday morning Holy M...",
    href: "https://stpatrickstelluride.com/2026/parish-news/parish-bulletin-for-august-2/",
    img: ""
  },
  {
    title: "CANCELLED: Hike and Holy Mass on August 1",
    source: "St. Patrick's Catholic Church",
    sourceKey: "stpatricks",
    date: "July 31, 2026",
    newsTopic: "recreation",
    copy: "Regrettably the Hike and Holy Mass for Saturday, August 1 to Hope Lake has been cancelled.",
    href: "https://stpatrickstelluride.com/2026/parish-news/cancelled-hike-and-holy-mass-on-august-1/",
    img: ""
  },
  {
    title: "Parish Picnic-Town Park July 30 at 5:30 pm",
    source: "St. Patrick's Catholic Church",
    sourceKey: "stpatricks",
    date: "July 30, 2026",
    newsTopic: "recreation",
    copy: "Please join our Annual Parish Picnic on Thursday, July 30 at 5:30 PM at Town Park. We ask families with last names from A - M to bring a side dish or salad and from N - Z to bring dessert. We'll see you at Town Park tomorrow.",
    href: "https://stpatrickstelluride.com/2026/parish-news/parish-picnic-town-park-july-30-at-530-pm/",
    img: ""
  },
  {
    title: "Invitation to Prayer/Fellowship Wednesday Morning",
    source: "St. Patrick's Catholic Church",
    sourceKey: "stpatricks",
    date: "July 28, 2026",
    newsTopic: "community",
    copy: "This is an open invitation to all women in Telluride. Please come and join us on Wednesday, July 29th...7:30 am Rosary8:00 am Holy MassImmediately after we will go to Butcher and Baker for fellowship. Join as able....Contact Katrina with questions...",
    href: "https://stpatrickstelluride.com/2026/parish-news/invitation-to-prayer-fellowship-wednesday-morning-3/",
    img: ""
  },
  {
    title: "St Pats Telluride Parish Bulletin for July 26th",
    source: "St. Patrick's Catholic Church",
    sourceKey: "stpatricks",
    date: "July 25, 2026",
    newsTopic: "community",
    copy: "Attached as PDF is the St Pats Telluride Parish Bulletin for July 26th. Please see the Parish Calendar for updates.Coffee and donuts every Sunday during summer after 9:00 AM Holy Mass. We need more volunteers to help.Next Sunday - Second Collectio...",
    href: "https://stpatrickstelluride.com/2026/parish-news/st-pats-telluride-parish-bulletin-for-july-26th/",
    img: ""
  }
];  // 7 regional feeds (West End, Ouray, …)
const SMC_ALERTS = [
  {
    title: "Black Bear Pass Now Open",
    source: "San Miguel County",
    sourceLabel: "San Miguel County",
    category: "Alert",
    date: "2026-08-03",
    pubDate: "2026-08-03T23:34:03.000Z",
    copy: "County crews finished work this afternoon, Black Bear Pass is now open from Red Mountain Pass to Telluride.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=539",
    img: ""
  },
  {
    title: "Numerous Highway Closures",
    source: "San Miguel County",
    sourceLabel: "San Miguel County",
    category: "Alert",
    date: "2026-07-22",
    pubDate: "2026-07-22T00:17:58.000Z",
    copy: "Due to heavy rains, highways 145 and 62 are experiencing mudslides in various locations. Several sections are impassable, with no expected reopening time yet. CDOT is en route. More information will be shared as it becomes available.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=537",
    img: ""
  },
  {
    title: "Tomboy Road",
    source: "San Miguel County",
    sourceLabel: "San Miguel County",
    category: "Alert",
    date: "2026-07-21",
    pubDate: "2026-07-21T23:12:00.000Z",
    copy: "Due to hazardous conditions, lower Tomboy Road is currently closed to all pedestrian and vehicle traffic. The road is closed below Smuggler Mine, above Telluride and below Tomboy. The road is scheduled to be reopened Wednesday 7/22 at 8:00 a.m.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=536",
    img: ""
  },
  {
    title: "Black Bear Pass is now open. Please check with San Juan County for the current status of the pass on their side.",
    source: "San Miguel County",
    sourceLabel: "San Miguel County",
    category: "Alert",
    date: "2026-07-14",
    pubDate: "2026-07-14T15:17:10.000Z",
    copy: "Black Bear Pass is now open. Please check with San Juan County for the current status of the pass on their side.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=534",
    img: ""
  }
];              // SMC AlertCenter items
const ENGAGE_MEETINGS = [
  {
    projectName: "Shandoka Lot Redevelopment Project",
    projectUrl: "https://engagetelluride.org/shandoka-lot-redevelopment-project",
    title: "HARC Site Walk & Meeting",
    date: "2026-08-19",
    board: "harc",
    dateUrl: "https://engagetelluride.org/shandoka-lot-redevelopment-project/widgets/113081/key_dates#41231"
  }
];         // Engage Telluride project key dates
const MANUAL_SUMMARIES_CACHE_DATE = '2026-08-08';
const LEGAL_NOTICES_CACHE_DATE = '2026-08-07';

const MANUAL_SUMMARIES = {
  "smart|2026-07-09|SMART Board of Directors":
    "The July 9 SMART Board of Directors agenda hasn't been posted yet.",

  "county|2026-07-14|Historical Commission":
    "The July 14 San Miguel County Historical Commission agenda hasn't been posted yet.",

  "telluride|2026-07-15|Historic & Architectural Review Commission Chair - Jul 15 2026":
    "Two Town-owned civic buildings come before HARC on July 15. First is Town Hall at 135 W Columbia Ave — a minor-scale alteration for accessibility improvements and renovations to the designated local landmark, with no floor area increase. Second is the Parks & Recreation office and garage at 500 E Colorado Ave — a minor-scale addition that will increase floor area by more than 25%, resulting in a building still under 1,000 square feet. Both projects are designed by Hellmuth, Obata & Kassabaum and reviewed under the 2024 Design Guidelines and Standards.",

  "telluride|2026-07-15|Historic & Architectural Review Commission - Jul 15 2026":
    "The July 15 HARC meeting is dominated by the Carhenge redevelopment project at 700 W Pacific Ave — three separate Preliminary Large-Scale public hearings covering Buildings A, B, C, D1, D2, E1, E2, and E3 on Lots 34 and 34B of Backman Village, all new construction outside the Telluride Historic Landmark District in an Accommodations 2 zone, with Design Workshop as applicant and the Town itself as owner. A work session on the Shandoka Lot redevelopment at 860 Black Bear Rd — another Town-owned Accommodations 2 parcel — follows. Also on the hearing docket is a continued amendment to a prior Certificate of Appropriateness for 239 N Aspen, inside the THLD, elevated by the HARC Chair back in May.",

  "telluride|2026-07-15|Parks & Recreation Commission - Jul 15 2026":
    "The July 15, 2026 Parks & Recreation Commission agenda hasn't been posted yet.",

  "county|2026-07-15|Board of County Commissioners Meeting":
    "Two Land Use Code amendments headline the July 15 BOCC meeting. The first updates Section 5-31 governing Natural Medicine Businesses — a category that's been working its way through county code since Colorado's 2022 legalization of psychedelic-assisted therapy. The second addresses Nonconforming Lots, the kind of code language that quietly shapes what can and can't be built on the valley's more complicated parcels. There's also a lot-line vacation at Lawson Hill PUD — specifically the county jail property, Lots 425-1 and 425-2. On the administrative side: the County Assessor presents the Board of Equalization value report, the board takes up a new Records Retention Schedule, and Natural Resources Director Starr Jamison brings three federal public lands items — letters on the Mountain Pact, the Public Lands Workforce Stability Act, and the Public Lands Integrity Act. The consent agenda includes a retaining wall agreement for County Road 58P and a liquor license public hearing covers a Rotary Foundation event at the Telluride Airport in September.",

  "airport|2026-07-16|TRAA Board of Commissioners Meeting":
    "The July 16, 2026 TRAA Board of Commissioners Meeting agenda hasn't been posted yet.",

  "telluride|2026-07-16|Liquor Licensing Authority - Jul 16 2026":
    "A routine liquor licensing session. On the consent calendar: draft minutes from the July 1 meeting and ratification of a state-issued license transfer for The Catorce Group Ltd., doing business as Cuatro Cinco Seis at 219 W. Pacific Ave. The one public hearing covers a request by Telluride Science for a single special event permit for Town Talk at 300 S. Townsend St. on August 25, 2026, from 5:00 to 9:00 pm. The July 1 draft minutes reflect fourteen special event permits approved at that session — covering summer and fall events including Bluegrass, Jazz Festival, Film Festival, Telluride Mountain Run, Noche de Luz, and several Telluride Table fundraisers — all granted without public comment.",

  "fire|2026-07-21|Board of Directors Meeting":
    "The July 21, 2026 Fire Board of Directors Meeting agenda hasn't been posted yet.",

  "telluride|2026-07-21|Town Council - Jul 21 2026":
    "A newly seated Council opens with a swearing-in and executive session on San Miguel Valley Corp. negotiations before moving into a full day. The headline item is second reading of the Colorado Wildfire Resiliency Code (CWRC) — amendments to the Land Use Code covering historic/architectural review and landscaping/tree standards that bring the town in line with state wildfire resiliency requirements. A public hearing follows on a temporary patio tent structure at 221 S. Oak Street (R/C zone, Gondola Corridor Overlay). The long-running Stender Residence HARC appeal — continued repeatedly since December 2025 — is continued again. Afternoon work sessions cover the Telluride Tourism Board contract, updates to the Telluride Energy Mitigation Program (TEMP) offset calculations and fees, and a Colorado Ave East End speed study. Manager's reports include updates on Carhenge, The Oval, Canyonlands/Tower House, and parking. The Housing Authority and Block 23 Housing Corporation hold sequential meetings at the back end of the day.",

  "county|2026-07-22|Board of County Commissioners Special Meeting":
    "The July 22 San Miguel County Board of County Commissioners Special Meeting has been posted, but no agenda detail has been released beyond the meeting type itself. Special meetings are called for specific business outside the regular cycle — what that business is here isn't yet public.",

  "telluride|2026-07-23|Planning & Zoning Commission - Jul 23 2026":
    "Three Town-owned development projects dominate this agenda — all in the Accommodations 2 zone, all designed by Design Workshop, all on land the Town itself owns. The Carhenge Redevelopment Project gets two bites of the apple: a Preliminary Large Scale Subdivision to consolidate Lots 34 and 34B at 700 W Pacific Ave into a single parcel over 15,000 sq ft, and a Conceptual PUD for new construction on that consolidated lot (carried over from May). Separately, the Shandoka Lot at 860 Black Bear Rd gets its own Conceptual PUD hearing for proposed new construction on the Town's 4.07-acre parcel. Both sites sit at the center of the ongoing question about what Telluride does with its open-space-adjacent Town properties. Also on: a Minor Subdivision at 238 N Pine Street in the Historic Residential zone — a 7,500 sq ft or smaller parcel proposed to be split into two lots, a request that has been continued multiple times since February.",

  "telluride|2026-07-23|Planning & Zoning Commission Chair - Jul 23 2026":
    "The July 23, 2026 Planning & Zoning Commission Chair agenda hasn't been posted yet.",

  "county|2026-07-09|Planning Commission and Board of County Commissioners Joint Work Session":
    "The Planning Commission and BOCC are sitting down together for a joint work session — no final votes, but the discussion is substantive. They'll be working through proposed Land Use Code amendments across five sections: forestry practices (§6-4), oil and gas operations (§6-5), and deep geothermal operations (§6-6) in the morning, followed by condominium plats (§12-15) and PUD and subdivision rules (§5-14). Work sessions like this are where the actual shape of code changes gets negotiated before anything goes to public hearing — worth paying attention to early.",

  "county|2026-07-27|Open Space Commission Meeting":
    "The July 27 San Miguel County Open Space Commission agenda hasn't been posted yet.",

  "county|2026-07-29|Planning Commission and Board of County Commissioners Joint Work Session":
    "The July 29 joint work session between the San Miguel County Planning Commission and Board of County Commissioners hasn't posted a substantive agenda yet — just the meeting header. No items are listed to summarize.",

  "telluride|2026-07-29|(RESCHEDULED) Parks & Recreation Commission - Jul 29 2026":
    "On Wednesday, July 29, at noon, Parks & Rec will take up the already-approved, but very controversial, paving of the Town Park grass oval for installing basketball/pickleball courts. Local citizens have collected over 400 signatures and letters in opposition to this project.",

  "telluride|2026-07-15|(RESCHEDULED) Parks & Recreation Commission - Jul 15 2026":
    "The July 15, 2026 (Rescheduled) Parks & Recreation Commission agenda hasn't been posted yet.",

  "telluride|2026-07-21|Telluride Housing Authority - Jul 21 2026":
    "The Telluride Housing Authority meets Tuesday at Rebekah Hall for a short but substantive session. First up is routine officer certification for the Authority and its subcommittee. The real work is a proposed policy statement on primary residency for dependents of multiple custodial parents — a question that comes up whenever a household doesn't fit the standard definitions written into deed-restricted housing rules, and the 40 minutes allotted suggests it's not a simple fix. The board will also take up waitlist policies more broadly, a perennial pressure point as demand for deed-restricted units continues to outpace supply.",

  "county|2026-07-12|San Miguel Basin Fair Board":
    "The Fair Board convenes for a special meeting to divide up pre-fair responsibilities among board members and sort out lamb bedding setup. Housekeeping before the fair season — the kind of meeting that keeps things from falling through the cracks.",

  "county|2026-07-14|San Miguel Basin Fair Board":
    "The San Miguel Basin Fair Board holds a special midday meeting to debrief on the day's events, discuss any matters that came up, and set market classes. Routine fair-board business.",

  "county|2026-07-15|San Miguel Basin Fair Board":
    "The San Miguel Basin Fair Board holds a special meeting at 10pm on July 15 — a late-night debrief session following what appears to be fair day itself. The agenda is a short two items: a debrief of the day and discussion of whatever matters came to the board from it. Routine wrap-up, nothing of broad public consequence on the face of it.",

  "county|2026-07-16|San Miguel Basin Fair Board":
    "The San Miguel Basin Fair Board convenes a special meeting at 10pm — an end-of-day debrief and discussion of whatever came up during the fair. The agenda is deliberately open-ended, which is how these post-event sessions tend to go.",

  "county|2026-07-17|San Miguel Basin Fair Board":
    "The San Miguel Basin Fair Board holds a special meeting at 10pm — late by design, after a full day at the fair. The agenda is a debrief: how the day went and whatever issues made their way up to the board during it. Routine end-of-day business, but these conversations are often where the real operational picture emerges.",

  "county|2026-07-18|San Miguel Basin Fair Board":
    "A late-night special meeting — 10 p.m. — to debrief the day's fair activities and work through whatever issues surfaced during the event. The agenda is intentionally open-ended, which is typical for fair boards wrapping up a long day.",

  "telluride|2026-08-03|Open Space Commission - Aug 03 2026":
    "The Open Space Commission meets August 3 to work through two consequential items for the Valley Floor. First, commissioners will review and confirm a preferred trail alignment for Reach 1 of the River Trail — three alternative alignments are on the table, each threading around mapped wetlands near the Public Works facility. Second, the commission will consider a formal recommendation to Town Council to amend the Valley Floor Open Space Management Plan to allow dogs on a limited portion of that same River Trail segment. A review of upcoming site walks rounds out the agenda.",

  "telluride|2026-08-05|Ecology Commission - Aug 05 2026":
    "The Ecology Commission meets August 5 for a work session heavy on planning. Two items will advance the 2027 Climate Action Plan update — one broad discussion of the working document, and a focused session on the Materials & Consumption focus area. The commission will also plan Black Bear Safety Week. Minutes from the July 8 meeting are up for approval; that session covered Transportation & Land Use and Materials & Consumption focus areas, and the commission appointed Ruthie Boyd as primary and Kristen Rosenbaum as alternate to the Green Grants selection subcommittee.",

  "telluride|2026-08-05|Commission for Community Assistance, Arts & Special Events - Aug 05 2026":
    "CCAASE's August meeting is grant-season housekeeping more than anything else. The board will interview four organizations — Second Chance Humane Society, Telluride Soccer Club, Telluride Mountain Club, and Sheep Mountain Alliance — as part of the 2026 grant cycle review. On the action side: a calendar date request from Telluride Humane Society for a Tails on the Trail 5K fun run on October 10, 2026 (using Elks Park, the River Trail, and Colorado Ave.); final approval of 2027 CCAASE grant materials including guidelines and application; and a recommendation to Town Council on the 2027 CCAASE budget allocation. The grant materials were workshopped at the July meeting — this is the approval step.",

  "telluride|2026-08-05|Telluride Housing Authority Subcommittee - Aug 05 2026":
    "The Telluride Housing Authority Subcommittee meets August 5 with two items on the deed-restricted housing front. The action item is a request from Lela and Jon Martin to exceed the 5% Permitted Capital Improvement (PCI) limit on their Gold Run unit — they need a new roof, bid at $47,743.86 (roughly 17% of their original purchase price), but their 2010-era deed restriction only allows staff to approve up to 5% without a finding that the work increases the unit's capacity to house additional occupants. Staff recommends approval on the merits of the failing roof, but flags that the legal standard may not be met — leaving the Subcommittee in a bind that could resolve by encouraging the Martins to update to the current deed restriction language, which allows up to 10% without that constraint. The worksession takes up a request from Alpine Planning to deed-restrict Unit H at Pacifica House Condominiums as an employee dwelling unit under Guidelines §211, as mitigation for new free-market construction.",

  "county|2026-08-05|Board of County Commissioners Meeting":
    "Three Land Use Code amendments are the main event on August 5. The BOCC will hold public hearings on all three: a change to the definition of 'Qualified Owner' in Section 5-1305B (with related amendments to 5-1305C and 5-1350F), a wildfire areas update to Section 5-406 and Article 7 definitions, and a continued hearing on nonconforming lots — all heading toward formal resolutions. On the administrative side, the board takes up a tax abatement petition from Robert N. and Claudina E. Posey (recommended for denial) and approval of the 2026 Board of Equalization officer recommendations. The consent agenda covers meeting minutes and two Chevrolet Silverado pickups for Road and Bridge at up to $89,400. The BLM Tres Rios Field Office also gets time for an update.",

  "telluride|2026-07-21|Block 23 Housing Corporation - Jul 21 2026":
    "The Block 23 Housing Corporation holds what amounts to a housekeeping session — approving minutes from November 2025 and certifying its officer elections, CEO retention, and authorized signers via consent resolution. Nothing substantive is on the agenda beyond keeping the corporation's paperwork in order.",

  "county|2026-07-16|Housing Code Update SSR":
    "San Miguel County's sixth working session in its ongoing Land Use Code rewrite aimed at making affordable and workforce housing easier to build. The three-hour session will work through zoning and density adjustments, additional workforce housing types, and regulatory incentives for affordable housing — then synthesize feedback into final redline recommendations for the code. This is the kind of upstream work that determines what actually gets built in the valley for years to come.",

  "telluride|2026-08-06|Town Council Retreat - Aug 06 2026":
    "The August 6 retreat is a single three-hour work session in which Council will set the Town's goals and objectives for 2027. No votes, no land-use items — just the annual exercise of deciding what this Council wants to prioritize in the year ahead. Those priorities, once set, tend to shape budget decisions and staff direction for the whole cycle, so the conversation matters even if nothing is formally adopted.",

  "telluride|2026-07-23|Planning & Zoning Commission Chair - Jul 23 2026 - CANCELLED":
    "The July 23, 2026 Planning & Zoning Commission Chair meeting has been cancelled.",

  "telluride|2026-08-10|Intergovernmental Worksession - Aug 10 2026":
    "This intergovernmental worksession brings together representatives from Telluride, Mountain Village, Ophir, San Miguel County, and Norwood for a regional check-in. The session opens with a large-projects update spanning all five jurisdictions — a regular pulse-check on what's moving across the region. From there: a presentation on allyship with the Ute people from Ernest House Jr.; a status update on the Telluride Regional Medical Center's new facility from Tom Crabtree and Heidi Lauterbach; an update on regional infant care and the Munchkins program from Chambers Squier and Michelle Bulson; and a U.S. Forest Service update from Megan Eno. No votes or land-use decisions are on the agenda — this is a listening and coordination session.",

  "telluride|2026-07-26|Open Space Commission - Jul 26 2026":
    "The July 26, 2026 Open Space Commission agenda hasn't been posted yet.",

  "telluride|2026-07-13|Open Space Commission Site Walk - Jul 13 2026":
    "The Open Space Commission heads out to the Valley Floor for a hands-on weed pull — meeting at the Eider Creek Trailhead, south of the intersection of Eider Creek Lane and W. Hwy 145 Spur, at 4:00 PM. No deliberations, no votes. Public comment is on the agenda, so anyone who shows up can speak.",

  "telluride|2026-08-11|Town Council - Aug 11 2026":
    "The most consequential item on this agenda is third reading of the Colorado Wildfire Resiliency Code — if approved, it amends the Land Use Code's historic and architectural review standards and landscaping/tree maintenance rules to align with state wildfire mitigation requirements. That's the kind of code change that quietly reshapes what property owners can and can't do with vegetation and building materials for years to come. The morning work sessions cover a parking program update, next steps for the Fino Units and Spruce House affordable housing properties, a potential floodplain remapping project, and a Comprehensive Plan update — four topics that touch the town's long-running tensions around housing, infrastructure, and growth management. The afternoon brings a 2027 goals-and-objectives discussion and a look at potential updates to the Telluride Energy Mitigation Program's fee calculations. A budget reappropriation ordinance gets its first reading. The manager's report includes occupancy updates on the Virginia Placer 2A housing project, mudslide cleanup and stormwater infrastructure, and a status check on the Oval Project.",

  "ridgway|2026-07-15|Ridgway Planning Commission Meeting":
    "The July 15th Ridgway Planning Commission meeting has one substantive item: a public hearing on a proposed resubdivision at 845 & 847 Hyde Street. The applicant, Zack Young, is asking to split an existing lot — currently holding a duplex, a greenhouse, storage outbuildings, and a vacant parcel — into two separate lots. Lot 2 (8,059 sq. ft.) would retain the existing duplex; Lot 1 (6,104 sq. ft.) would be vacant and available for future development. No new construction is proposed now. The property is zoned Historic Residential, and both lots meet minimum dimensional standards, though a staircase encroaching on a side setback must be removed before the plat is recorded. Outdoor storage on Lot 1 also needs to come into compliance. The Planning Commission's role here is to make a recommendation — final approval goes to Town Council. Routine minutes and staff updates round out the agenda.",

  "rico|2026-07-15|Rico Board of Trustees Regular Meeting":
    "A busy night in Rico. The Board takes up its Q2 financials, a lease with the Rico Historical Society for space at 15 S. Glasgow Avenue, and a construction contract with Lewis Excavation to replace the water service line beneath the Dolores River between Piedmont and North River Streets — that last one being the kind of infrastructure work small mountain towns have to keep doing quietly just to stay functional. Then comes a round of housekeeping on the books: six ordinances on first reading, all repeals. Out go an old misdemeanor penalty ordinance (no. 131), rules on municipal equipment loans to private individuals (no. 271), a standalone mayoral qualifications ordinance (no. 278), the Town Manager duties ordinance (no. 1999-2), dog licensing fees (no. 2001-5), and authorization for the North Rico non-profit corporation (no. 2006-1). Discussion rounds out the evening: a voluntary cleanup update, the November 2026 election, and — notably — whether to change how often the Board meets and when it starts.",

  "county|2026-08-12|Board of County Commissioners Work Session":
    "The August 12 Board of County Commissioners Work Session agenda hasn't been posted yet.",

  "smart|2026-08-13|SMART Board of Directors":
    "The August 13, 2026 SMART Board of Directors agenda hasn't been posted yet.",

  "county|2026-08-13|Planning Commission Meeting":
    "Two substantive items on the August 13 agenda. The commission takes up a work session on minor and major subdivisions — the kind of foundational land-use mechanics that quietly shape how parcels get divided across the county. Then, on referral and recommendation, an energy code update, which would revise the building standards that apply to new construction and major renovations. Code updates like this tend to move without much fanfare but set the baseline rules for years.",

  "telluride|2026-07-27|Special Town Council - Jul 27 2026":
    "A single item: the Council, sitting as the Liquor Licensing Authority, will hold a public hearing on a special event permit request from San Miguel Educational Fund (KOTO Radio) for its Live at the Drive event at 207 N Pine Street on July 30, 2026, from 2:00 pm to 9:30 pm.",

  "telluride|2026-07-20|Gondola Subcommittee - Jul 20 2026":
    "The Gondola Advisory Committee meets virtually to receive the project team's economic and fiscal impact analysis of the gondola — the central item on this agenda. The analysis ties gondola operations to visitation patterns, retail spending, and sales tax across Telluride and Mountain Village, finding that 30% of Telluride visitors and 45% of Mountain Village visitors ride it at least once per trip, and that restaurant sales in particular track closely with ridership. Growth projections are being revised downward over the next 20 years, driven by rising costs of living, accelerating home values, infrastructure limits, and demographic shifts. The committee will also review materials for the July 28 Leadership Committee meeting, which will cover the FTA Capital Investment Grants program and local funding strategy — a consequential topic given that the hypothetical funding scenario puts the project at $140M total, with $20M each expected from the Town of Telluride and the Mountain Village Entity. August's Gsub meeting is set to examine traffic, parking, and bus-replacement scenarios in the event of a prolonged gondola outage.",

  "county|2026-07-27|Housing Code Update SSR":
    "The agenda for this Housing Code Update SSR meeting lists only the title — no line items, staff reports, or supporting materials have been posted. There's enough history with housing code work in the county to know these sessions can carry real weight, but there's nothing specific to report yet.",

  "rico|2026-08-19|Rico Board of Trustees Regular Meeting":
    "The August 19, 2026 Rico Board of Trustees Regular Meeting agenda hasn't been posted yet.",

  "telluride|2026-08-19|Historic & Architectural Review Commission Chair - Aug 19 2026":
    "The August 19 HARC agenda has one item: a pergola at 472 W Pacific Ave, the Elks Lodge property. The structure was built without a permit and is currently in violation — HARC will consider whether to approve it after the fact as a minor-scale alteration within the Telluride Historic Landmark District.",

  "telluride|2026-08-19|Historic & Architectural Review Commission - Aug 19 2026":
    "A full slate at HARC on August 19, dominated by two projects that have been in the room before and will be again. The Shandoka Lot Redevelopment at 860 Black Bear Rd comes in for preliminary large-scale review — Buildings 1 and 2 as one hearing, Buildings 3 and 4 as another — with a 3:00 PM site walk preceding the evening session. Both applications involve new construction of more than 5,000 sq ft in the Accommodations 2 zone district, with the Town of Telluride as owner and Design Workshop as applicant. The three Carhenge building clusters (A/B/C, D1/D2, and E1/E2/E3 at 700 W Pacific Ave) are continued to a September date TBD. A work session covers proposed new construction and shed work at 335 W Colorado — the County/Town Facilities project, now in its second HARC work session. Also on the public hearing list: a final large-scale application for 208 S Fir Street (5,000+ sq ft, Commercial zone), and smaller-scale items at 461 Dakota Ave and 734 Primrose Lane involving steep-slope construction.",

  "telluride|2026-08-19|Parks & Recreation Commission - Aug 19 2026":
    "The August 19, 2026 Parks & Recreation Commission agenda hasn't been posted yet.",

  "county|2026-07-21|SMC Historical Commission Meeting":
    "The July 21 San Miguel County Historical Commission agenda is essentially a placeholder — minutes approval and a vague \"Items\" and \"New/Old Business\" line are all that's posted. No substantive items are described.",

  "county|2026-08-19|Board of County Commissioners Meeting":
    "The August 19, 2026 Board of County Commissioners Meeting agenda hasn't been posted yet.",

  "telluride|2026-08-20|Liquor Licensing Authority - Aug 20 2026":
    "The August 20, 2026 Liquor Licensing Authority agenda hasn't been posted yet.",

  "mv|2026-08-20|Town Council Meeting":
    "The August 20, 2026 Mountain Village Town Council Meeting agenda hasn't been posted yet.",

  "telluride|2026-07-23|San Miguel Authority for Regional Transportation - Jul 23 2026":
    "SMART's board meets virtually on July 23rd with the gondola project front and center. Two vendor selections are up for action: Resolution 2026-12 would award SCJ Alliance the contract for gondola structural analysis, and Resolution 2026-13 would award the Gondola Shop the cabin structural analysis work — separate contracts, same bridge-or-bust question. The board will also discuss the composition of the Gondola Advisory Committee, get a broader project update, and hear introduction of a FY26 budget amendment. Rounding out the agenda: second-quarter performance and July operations reports, the executive director's verbal update, and an executive session on personnel matters.",

  "norwood|2026-08-12|Board of Trustees Meeting":
    "The August 12, 2026 Norwood Board of Trustees Meeting agenda hasn't been posted yet.",

  "norwood|2026-08-17|Planning and Zoning Commission Meeting":
    "The August 17, 2026 Norwood Planning and Zoning Commission Meeting agenda hasn't been posted yet.",

  "mv|2026-08-06|Design Review Board":
    "Three multifamily projects are on the board's plate Thursday morning. First up is an initial architecture and site review for four new multifamily units at 100 Pennington Place (Lot 726-R1). Then the board returns to a multifamily building at TBD Lost Creek Lane (Lot 27A) — continued from June — for another initial architecture review. A conditional-use permit for office space at 620 Mountain Village Blvd, Unit 1A goes to the DRB for a recommendation to Town Council. Finally, the final architecture review for a 15-unit employee apartment building at 306 Adams Ranch Road (Lot 640A) is expected to be continued to the September 3 meeting.",

  "med|2026-07-23|Regular Board Meeting":
    "The July 23, 2026 Mountain Village Metropolitan District Regular Board Meeting agenda hasn't been posted yet.",

  "ophir|2026-08-18|General Assembly Meeting":
    "The August 18, 2026 Ophir General Assembly Meeting agenda hasn't been posted yet.",

  "ridgway|2026-08-12|Ridgway Town Council Regular Meeting":
    "The August 12, 2026 Ridgway Town Council Regular Meeting agenda hasn't been posted yet.",

  "norwood|2026-08-11|Norwood Water Commission Meeting":
    "The August 11, 2026 Norwood Water Commission Meeting agenda hasn't been posted yet.",

  "telluride|2026-07-28|Gondola Leadership Committee - Jul 28 2026":
    "The Gondola Leadership Committee meets July 28 for what looks like a substantive session. Miles Graham opens with background and history — marked as an action item, which suggests something more than a recap. Ed Parks and Amber Blake then walk through the CIG (Capital Investment Grant) program and its funding commitments, followed by a project update. The heaviest time slot goes to a fiscal and economic impact analysis presented by Parks and Chris Brewer. Miles Graham rounds out the agenda with local jurisdiction updates before public comment. The gondola project — and the $5.2 million annual tax behind it — has been one of the most contested questions in the valley in recent years, so the funding and economic impact presentations will draw scrutiny.",

  "telluride|2026-08-20|Planning & Zoning Commission - Aug 20 2026":
    "The August 20 P&Z meeting has two work sessions and one public hearing worth following. The school district's employee housing proposal gets its first formal look — a work session on new construction at the northwest corner of the Telluride Middle-High School site at 725 W Colorado, governed by an intergovernmental agreement between the Town and Telluride School District R1. The 238 N Pine Street minor subdivision — a proposal to split a 7,500-square-foot Historic Residential parcel into two lots — comes back for a public hearing after a long string of continuances dating to February. Two additional work sessions cover a Comprehensive Plan status update and a Land Use Code revision to Section 3-505 governing tree maintenance, removal, and relocation.",

  "telluride|2026-08-20|Planning & Zoning Commission Chair - Aug 20 2026":
    "The August 20, 2026 Planning & Zoning Commission Chair agenda hasn't been posted yet.",

  "tmvoa|2026-07-28|Gondola Leadership Committee Meeting":
    "The Gondola Leadership Committee convenes July 28 for a substantive session covering the full arc of the gondola project. Miles Graham opens with background and history — the longest-running and most contested civic question in the region right now. Ed Parks and Amber Blake then brief the committee on the CIG (Capital Investment Grant) program and current funding commitments, followed by a project status update. The weightiest item is a 30-minute fiscal and economic impact analysis presented by Parks and Chris Brewer. Graham closes the formal agenda with local jurisdiction updates before the floor opens for public comment.",

  "tmvoa|2026-08-11|Mountain Village Merchant Meeting":
    "The August 11, 2026 Mountain Village Merchant Meeting agenda hasn't been posted yet.",

  "tmvoa|2026-08-20|TMVOA Investment Committee Meeting":
    "The August 20, 2026 TMVOA Investment Committee Meeting agenda hasn't been posted yet.",

  "county|2026-08-26|Board of County Commissioners Work Session":
    "The August 26 Board of County Commissioners Work Session agenda hasn't been posted yet.",

  "norwood|2026-07-29|Board of Trustees Work Session":
    "A single item is on the table for this Norwood work session: where to place a Happenings Kiosk in town. Work sessions don't produce formal action — this is the conversation before any decision.",

  "med|2026-08-27|Regular Board Meeting":
    "The August 27, 2026 Mountain Village Metropolitan District Regular Board Meeting agenda hasn't been posted yet.",

  "norwood|2026-07-29|NWC Possible Quorum":
    "The Norwood Water Commission may have a quorum present at a July 29 meeting with engineering firm SGM to discuss the redundant waterline design. The gathering is set for 11:00 a.m. at the Norwood Community Center. The quorum notice suggests this could function as an official commission meeting rather than a simple staff-level consultation.",

  "norwood|2026-08-05|Board of Trustees Work Session":
    "A short work session for the Norwood Board of Trustees, with two lease renewals on the table — Motion Sense Therapy and Performance at 1110 Lucerne St and Austin Overholt at 1475 Pine St. No executive session, no code changes, no land-use items. Formal action can't be taken at a work session, so any decisions will follow at a regular meeting.",

  "tmvoa|2026-07-31|TMVOA Board of Directors Meeting":
    "The TMVOA Board meets July 31 with three substantive items on the docket: fall and winter programming decisions, election of board officers, and — the weightiest item — proposed amendments to the organization's fiscal policies and procedures. That last one gets 30 minutes, more than anything else on the agenda, which tells you where the real work is. Board officer elections mark the kind of organizational housekeeping that shapes who steers the association going into the next season.",

  "ouray|2026-08-05|, 2-4:00 PM - Virtual Meeting Only - No in-person attendance.  Work session to review and discuss possible changes to the Ouray County Land Use Code, Section 2 – Definitions. (Packet materials are attached to the agenda)":
    "Ouray County Planning Commission meets virtually August 5th, 2–4 PM, for a work session on possible changes to the Land Use Code's Section 2 — the definitions section. No in-person attendance. Work sessions like this are where the real shaping happens: definitions determine what the rules actually mean in practice, and a tweak to how a term is defined can quietly shift what gets permitted, what gets denied, and how future applications get read. The packet is attached to the posted agenda, but the agenda itself doesn't spell out which definitions are under review.",

  "telluride|2026-09-01|Town Council - Sep 01 2026":
    "The September 1, 2026 Town Council agenda hasn't been posted yet.",

  "telluride|2026-09-02|Ecology Commission - Sep 02 2026":
    "The September 2, 2026 Ecology Commission agenda hasn't been posted yet.",

  "telluride|2026-09-02|Commission for Community Assistance, Arts & Special Events - Sep 02 2026":
    "The September 2, 2026 Commission for Community Assistance, Arts & Special Events agenda hasn't been posted yet.",

  "telluride|2026-09-02|Telluride Housing Authority Subcommittee - Sep 02 2026":
    "The September 2, 2026 Telluride Housing Authority Subcommittee agenda hasn't been posted yet.",

  "county|2026-09-02|Board of County Commissioners Meeting":
    "The September 2, 2026 Board of County Commissioners Meeting agenda hasn't been posted yet.",

  "mv|2026-09-03|Design Review Board":
    "The September 3, 2026 Mountain Village Design Review Board agenda hasn't been posted yet.",

  "county|2026-08-27|CWAB":
    "The August 27 CWAB meeting agenda hasn't been posted yet.",

  "telluride|2026-08-20|Planning & Zoning Commission Chair - Aug 20 2026 - Cancelled":
    "The August 20, 2026 Planning & Zoning Commission meeting has been cancelled."
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
    votes: [{"item":"Appoint Scott Pearson as mayor","outcome":"Passed","tally":""}, {"item":"Appoint Tucker Maggot as mayor pro tem","outcome":"Passed","tally":""}, {"item":"Move into executive session (CORA matters)","outcome":"Passed","tally":""}],
    videoUrl: "https://media.avcaptureall.cloud/meeting/66650890-1548-4443-97e0-9ec4f350fd9d"
  }
];

const TELLURIDE_TIMES_ARTICLES = [
  {
    title: "August at The Alibi",
    source: "Telluride Times",
    date: "August 8, 2026",
    firstSeen: "2026-08-08",
    newsTopic: "arts-culture",
    copy: "The Alibi has 29 nights of programming lined up for August, starting with four nights of Mushroom Festival after-parties Aug. 12–15, including Banshee Tree, Copper Children, and DJ sets. The month continues with acts ranging from classic rock to Americana to bluegrass-adjacent, with Aug. 27–29 already sold out for Camp Alderwild after-parties.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_26713cbc-a035-4151-be69-3ef3f427977b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/a3/9a3af767-c0f5-4abe-8123-431795651f3c/6a769447ea970.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘Leadership is an inside job’",
    source: "Telluride Times",
    date: "August 7, 2026",
    firstSeen: "2026-08-07",
    newsTopic: "community",
    copy: "A new executive conference called the Telluride Leadership Summit is coming to town October 4–6, organized by local resident and executive coach Hal Adler. It'll bring in CEOs and top leaders from around the country to share strategies on leading through change, with sessions indoors and out on the mountain. Coffee Cowboy's Scott Keating and Hailey Arnold are among the local faces on the program.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_c508642a-14c7-4271-b49b-bbd67f37b48d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/b1/db19a333-bab6-443f-883e-edbca07a8789/6a74d456f3fd4.image.jpg",
    imgHiRes: true
  },
  {
    title: "Officials will not release cool water from a Colorado River reservoir to protect threatened fish",
    source: "Telluride Times",
    date: "August 7, 2026",
    firstSeen: "2026-08-07",
    newsTopic: "infrastructure",
    copy: "The Bureau of Reclamation won't release cool water from Lake Powell this year to protect the humpback chub, citing strained hydropower conditions — Lake Powell sits at just 23% capacity after record-low snowpack. Cool releases worked in 2024 and 2025 to curb smallmouth bass spawning, but this year power costs won out.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_673a3eed-0eac-574c-96c0-ae44dc4bd325.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "The Burroughs sweat it out in Norwood",
    source: "Telluride Times",
    date: "August 7, 2026",
    firstSeen: "2026-08-07",
    newsTopic: "arts-culture",
    copy: "Nine-piece Colorado funk-soul band The Burroughs plays Norwood's Music on the Mesa at the San Miguel County Fairgrounds Pig Palace on Saturday, Aug. 8. The free outdoor show includes food vendors, a bar, and a kid zone with a squirt gun battle area. It's the sixth Music on the Mesa concert and the band's first appearance at the event.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_df45f2cf-adfc-4be6-9efe-936ace3239f1.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/4c/e4c0c5c2-9b87-4d6d-b90e-bf4bb2107a10/6a74a24e2c68f.image.jpg",
    imgHiRes: true
  },
  {
    title: "County housing code discussions continue",
    source: "Telluride Times",
    date: "August 7, 2026",
    firstSeen: "2026-08-07",
    newsTopic: "land-use",
    copy: "San Miguel County commissioners and the planning commission held a joint session on the ongoing housing code audit, which aims to remove regulatory barriers to housing development in unincorporated areas. Proposed updates include density bonuses and height allowances for projects with 50–80%+ deed-restricted units. The county estimates it needs roughly 1,100 units by 2030, with nearly half of local workers already commuting 25-plus miles.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_5dd10aad-25f1-48ff-a86a-195ca900007d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/1d/b1d2a1a5-1419-4843-bfcb-28b632c7d352/6a74d2f120e85.image.png",
    imgHiRes: true
  },
  {
    title: "Jalapeños linked to a US salmonella outbreak are tracked to a Mexican farm and a distributor",
    source: "Telluride Times",
    date: "August 6, 2026",
    firstSeen: "2026-08-07",
    newsTopic: "community",
    copy: "Jalapeño peppers tied to a multistate salmonella outbreak have been traced to a Sinaloa, Mexico grower and distributed into the U.S. by Coast Citrus Distributors, which has issued a recall. At least 345 people across 27 states have gotten sick — Colorado among the hardest hit — with 36 hospitalized. Chipotle and Qdoba have pulled jalapeños from their menus.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_efee1111-e541-58a3-85ce-16308445d142.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/f8/3f8145d4-7669-582b-a1bb-8944c19d19bf/6a750f722a716.image.jpg",
    imgHiRes: true
  },
  {
    title: "Logan Metz and the fork in the road",
    source: "Telluride Times",
    date: "August 6, 2026",
    firstSeen: "2026-08-07",
    newsTopic: "infrastructure",
    copy: "Logan Metz — Wisconsin-born singer-songwriter and multi-instrumentalist — plays Music on the Green at Reflection Plaza in Mountain Village on Friday, Aug. 7, 5–7 p.m. He's toured with Lukas Nelson, Willie Nelson, Neil Young, and others. His first solo album in a decade is due early next year; an EP preview, *The Chimney Rock*, is out now on Bandcamp.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_e7b4505a-8fe0-4327-ba03-cd289b681020.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/4b/24b0fa32-e963-425b-857c-d97a5a10dd42/6a72781e976e6.image.jpg",
    imgHiRes: true
  },
  {
    title: "Iran war renews concerns about the lasting toll of traumatic brain injuries to US troops",
    source: "Telluride Times",
    date: "August 6, 2026",
    firstSeen: "2026-08-06",
    newsTopic: "community",
    copy: "Nearly 700 U.S. troops have been wounded in the Iran conflict, most with traumatic brain injuries. Doctors still can't predict who'll have lasting effects, and drone blasts close to the head create different brain damage than ground-level explosions. Some lawmakers are pressing the military on whether injured troops received timely screening and care.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_bd3a30b3-a750-5d21-95ae-29f598169ae9.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/0a/b0aaf848-7645-5ed7-9614-27295e508ec3/6a74671a699d4.image.jpg",
    imgHiRes: true
  },
  {
    title: "Upcoming workshop will help producers navigate drought conditions",
    source: "Telluride Times",
    date: "August 6, 2026",
    firstSeen: "2026-08-07",
    newsTopic: "community",
    copy: "San Miguel and Montrose counties, with the Shavano Conservation District, are hosting a free drought workshop for West End agricultural producers on Aug. 13, 11 a.m.–3 p.m. at The Livery in Norwood. Topics include water scarcity, prairie dog management, invasive weeds, soil health, and available funding. Lunch provided; bring a dessert and RSVP at droughtonthewestend.eventbrite.com.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/the_norwood_post/article_19a431bf-2782-4870-aa77-d3d7c5aec14a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/aa/aaa0710c-8143-4755-8375-c91e90a1affe/6a74a047229d7.image.png",
    imgHiRes: true
  },
  {
    title: "New cookies are selling like hot cakes",
    source: "Telluride Times",
    date: "August 6, 2026",
    firstSeen: "2026-08-07",
    newsTopic: "community",
    copy: "Telluride Truffle has a new signature cookie collection gift box — six cookies, a brownie, and a blondie — designed for shipping. New additions include a tahini-coconut and oatmeal-brown butter cookie. The shop is at 135 E. Colorado Ave., with locations also in Denver and Lakewood.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/business/article_6c309497-d124-4d41-8903-d2d3260254b1.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/01/8013316d-fdda-4063-bade-1d56e2df4335/6a74c8c11deef.image.jpg",
    imgHiRes: true
  },
  {
    title: "Before we build",
    source: "Telluride Times",
    date: "August 6, 2026",
    firstSeen: "2026-08-07",
    newsTopic: "community",
    copy: "San Miguel County's housing needs analysis projects 1,070 additional units needed by 2034, but roughly 520 of those units stem from a single modeling assumption — that in-commuters would relocate here if housing were available. Meanwhile, the Town of Telluride recently reported about a 22% vacancy rate across its employee housing portfolio. Worth watching how the projected need and the on-the-ground numbers line up before major commitments are made.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_3f869615-1ddf-4680-8040-5e60c16fe0e6.html",
    img: "",
    letterAuthor: "Michael Saftler",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Then and now",
    source: "Telluride Times",
    date: "August 6, 2026",
    firstSeen: "2026-08-07",
    newsTopic: "community",
    copy: "A local writer reflects on growing up in 1950s small-town America — less fearful childhoods, WWII-generation pragmatism, and a politics centered on national interest over party loyalty. He contrasts that era's broad civic unity with today's ideological polarization and concern over executive overreach. Worth a read if you've been watching these shifts for a while.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_ad9bdb14-1309-45b3-bb0a-169d5c3d2cbc.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/8e/08ee1e1e-0ae1-42a6-8a07-cf4986923207/6a74c9b358aa8.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Fire management moonshot",
    source: "Telluride Times",
    date: "August 6, 2026",
    firstSeen: "2026-08-07",
    newsTopic: "public-safety",
    copy: "Decades of fire-suppression policy left Western forests dangerously overgrown, and Fire Season '26 produced more pollution than fossil fuels combined. A growing number of voices are calling for a national-scale shift — thinning forests and converting waste wood to biomass energy through public-private partnerships. Early programs like WHIMS showed it works; the question is whether the will is there to do it at scale.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_9dfd0bb2-f5ff-4966-b164-e5c1f56659ab.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/26/c2637ce2-fbea-42f3-a851-7260c80cd91e/6a74a11dc40c5.image.jpg",
    imgHiRes: true
  },
  {
    title: "Penalizing success",
    source: "Telluride Times",
    date: "August 6, 2026",
    firstSeen: "2026-08-07",
    newsTopic: "community",
    copy: "Parks and Rec required a women's softball team to disband after winning the league championship multiple times in a row. The team's captain argues the decision punishes success rather than encouraging other teams to improve, and suggests alternatives like an A/B league split or a draft system.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_b422bdbf-f5b6-45ee-9e5f-b34e135d2ede.html",
    img: "",
    letterAuthor: "Robin Jones Mountain Limo Softball Team",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Thank you to Green Grants and partners",
    source: "Telluride Times",
    date: "August 6, 2026",
    firstSeen: "2026-08-07",
    newsTopic: "arts-culture",
    copy: "A Telluride couple used Green Grants funding — through Telluride Foundation, San Miguel County, and EcoAction Partners — to install a mini split heat pump via Stellar Air. The switch is expected to cut propane use and greenhouse gas emissions, with added electricity offset by years of green power through SMPA.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_70617cf9-0845-4fb2-a485-ae31a9dc1229.html",
    img: "",
    letterAuthor: "Leigh Sullivan and Phil Hayden",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Skinny dipping",
    source: "Telluride Times",
    date: "August 6, 2026",
    firstSeen: "2026-08-07",
    newsTopic: "recreation",
    copy: "A Telluride local writes about returning to her Maine hometown — the mill town she once couldn't wait to leave — and finding herself newly fond of its rough, familiar edges. She and her husband traveled without kids for the first time, mixing family obligations with coastal inn stays and time at a rustic lakeside camp.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_8a45d6f0-7fe4-4f7f-87fc-17b6c0322779.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/76/f769215a-15d5-4610-9ecf-a5742e46bc9d/6a74c3ad6d272.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Chemistry with no beakers in sight",
    source: "Telluride Times",
    date: "August 6, 2026",
    firstSeen: "2026-08-07",
    newsTopic: "community",
    copy: "Harvard chemistry professor Joonho Lee speaks Tuesday, Aug. 11 at 6:30 p.m. at the Telluride Conference Center in Mountain Village on what quantum computers can actually do for chemistry — drug discovery, better materials, energy applications. Free and open to all, no science background needed. Final Mountain Village Town Talk of the 2026 season.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_1c667c9c-af24-4e8c-92f4-2d5d556ab8d1.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/0d/30dfc4ac-b3cb-4d35-9038-4a2ad73a4ff6/6a74c486581de.image.jpg",
    letterAuthor: "Townsend St",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "The air we breathe",
    source: "Telluride Times",
    date: "August 6, 2026",
    firstSeen: "2026-08-07",
    newsTopic: "community",
    copy: "Smoke from the Gold Mountain Fire pushed Ridgway's AQI to 281 this summer — \"very unhealthy\" territory — while temperatures hit an unofficial 95–96°F. The writer notes wildfire smoke carries PM2.5 particles and VOCs that damage lungs fast. Telluride had its own air quality reckoning in the 1980s, when wood-burning stoves earned it worse ratings than Denver.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_bf00b207-4214-49a0-81b6-8dbf0a6ec13e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/88/d88a20a6-e4bc-4349-bbb4-4710587bd52a/6a74c27ac3155.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Dog jumping",
    source: "Telluride Times",
    date: "August 6, 2026",
    firstSeen: "2026-08-07",
    newsTopic: "community",
    copy: "Dogs jump mostly to say hello or get attention — punishing it usually backfires since even negative reactions are still attention. Turning away calmly and rewarding a sit works better, but everyone around the dog has to respond the same way. Second Chance Humane Society in Ridgway is open daily 11–5:30.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_d5d6c56e-15ba-414e-9e6c-a064bb518ada.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/7d/47d53cf6-30d9-41ec-90a2-de6e06726a44/6a74c3178ec55.image.jpg",
    imgHiRes: true
  },
  {
    title: "Town of Mountain Village to host Village Pond Plaza development engagement events",
    source: "Telluride Times",
    date: "August 6, 2026",
    firstSeen: "2026-08-07",
    newsTopic: "land-use",
    copy: "Mountain Village is gathering public input on three conceptual redesigns for Village Pond Plaza, tied to the Four Seasons development agreement. Drop-in events are scheduled Aug. 12 at Heritage Plaza (11am–4pm) and Aug. 13 at Town Hall (5–7pm), with an online survey launching the week of Aug. 10. Construction is targeted for summer 2027.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_bf815df6-bca3-4d50-88d0-b38540054c06.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/f9/5f9b3527-23af-43fc-a312-1687e4098147/6a74c17165209.image.jpg",
    imgHiRes: true
  },
  {
    title: "CHALKBOARD Week of Aug. 6-12",
    source: "Telluride Times",
    date: "August 6, 2026",
    firstSeen: "2026-08-07",
    newsTopic: "government",
    copy: "Norwood-area birthdays run Aug. 6–12, and the week kicks off fall youth sports — volleyball, cross country, and football all start Aug. 10, with a back-to-school barbecue Aug. 14. The Farmers Market runs Thursdays through mid-October, and a free chamber music concert hits The Livery Aug. 27.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_69428c0a-c9dc-4ef4-b85d-486d1ae30bce.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/ae/eaed7ea4-1f71-44b3-9a79-b17bd188c26c/6a74a60e70eec.image.png",
    imgHiRes: true
  },
  {
    title: "Parent PLUS loan limits leave families scrambling before fall semester",
    source: "Telluride Times",
    date: "August 6, 2026",
    firstSeen: "2026-08-06",
    newsTopic: "housing",
    copy: "Federal changes to Parent PLUS loans — now capped at $20,000/year and $65,000 lifetime — blindsided families just weeks before fall semester. Students who took dual enrollment credits in high school may exhaust eligibility before graduating. Norwood's True North Youth Program stepped in with a $5,000 scholarship for one local student caught in the gap.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_35b523aa-436d-4f69-ae7e-7977f1a10e28.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/46/b46708e7-5a80-481e-819b-026cd66cf162/6a73d588074e7.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘Detroiticizing’ the Dead: Don Was reinterprets ‘Blues for Allah’",
    source: "Telluride Times",
    date: "August 6, 2026",
    firstSeen: "2026-08-06",
    newsTopic: "community",
    copy: "Don Was — six-time Grammy winner and longtime producer — brings his nine-piece Pan-Detroit Ensemble to Telluride to perform the Grateful Dead's *Blues for Allah* in full, reimagined through a Detroit lens. Was played upright bass with Bobby Weir and the Wolf Bros for eight years until Weir's death earlier this year. The project debuted last fall and marks the album's 50th anniversary.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_2ce30e73-1b9f-47a2-a7d5-123d6f5d2bdd.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/95/f95f5439-ba3f-407d-a390-967cac98e66e/6a71594e36e1e.image.jpg",
    imgHiRes: true
  },
  {
    title: "Legals and Public Notices for August 6-12, 2026",
    source: "Telluride Times",
    date: "August 6, 2026",
    firstSeen: "2026-08-06",
    newsTopic: "community",
    copy: "The GMUG National Forests' Norwood and Ouray Ranger Districts have released a Final Environmental Assessment for the South Uncompahgre Hazardous Fuels and Ecological Resiliency Project — a 20-year forest management plan covering 267,300 acres on the Uncompahgre Plateau. The plan includes up to 50,000 acres of timber harvest, 71,100 acres of fuels reduction, and wildlife habitat work. Mountain Village is also seeking bids for a waterline replacement project on Mountain Village Boulevard, due August 20.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/legals/article_509a3235-e766-47bd-b880-643207e48e0f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Fore for a cause",
    source: "Telluride Times",
    date: "August 5, 2026",
    firstSeen: "2026-08-05",
    newsTopic: "community",
    copy: "The Bob Miller Memorial Golf Tournament — now in its 28th year — raises money for the Telluride Adaptive Sports Program, with this year's event set for Sept. 17 at Telluride Golf Club. Bob Miller helped found TASP in 1996 and passed away two years later; his wife and family will attend this year for the first time in many years. Register at tellurideadaptivesports.org.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_4b36b0e7-0dd6-48a9-bc75-c774c184e0a1.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/1d/91dcdd42-9d1f-4294-bb28-a08ce66b8073/6a727d8fcd3dc.image.jpg",
    imgHiRes: true
  },
  {
    title: "Patrick Rondinelli: Telluride’s seasoned new deputy town manager",
    source: "Telluride Times",
    date: "August 5, 2026",
    firstSeen: "2026-08-05",
    newsTopic: "community",
    copy: "Telluride hired Patrick Rondinelli as deputy town manager this summer. He brings 13 years as Ouray's city administrator and nine years with the Colorado Dept. of Local Affairs, supporting southwest Colorado communities. He's based in Ouray and knows the region well.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_8d6c8f96-d0b4-4aa9-a0d0-ab18b912ba98.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/a3/ca310ef2-5edb-4142-8419-2326101a6801/6a739ceb85cb5.image.jpg",
    imgHiRes: true
  },
  {
    title: "New Alloy Kitchen",
    source: "Telluride Times",
    date: "August 4, 2026",
    firstSeen: "2026-08-05",
    newsTopic: "community",
    copy: "The View restaurant inside Mountain Lodge Telluride has rebranded as Alloy Kitchen, with a refreshed menu, remodeled lobby and great room, and new outdoor event space called Alloy Ranch. Chef Lonnie Shepard's menu features Colorado ingredients and dishes like elk bolognese and rancher's rib eye. Room renovations are still to come.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/business/article_c247024f-30e5-40d3-a8b0-d5af6b6a9779.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/89/f895c799-7c9c-44b2-9a58-0591bdfa11e9/6a727382674c7.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘This isn’t your traditional jazz festival’",
    source: "Telluride Times",
    date: "August 4, 2026",
    firstSeen: "2026-08-04",
    newsTopic: "arts-culture",
    copy: "The 49th Telluride Jazz Festival runs Aug. 6–8 under SBG Productions, which has led the event since 2017. Headliners include Disco Biscuits, Don Was, Lettuce, and Robert Randolph alongside traditional jazz acts. New this year is the Society Club VIP tier with chef meals and a mainstage viewing platform.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_c0c1a9a8-acdf-43fb-a206-1910a208eb46.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/3c/a3c829c7-8ede-4593-a26a-644656b6a2e1/6a71b2f546ca7.image.jpg",
    imgHiRes: true
  },
  {
    title: "Where the mountains meet the dance floor",
    source: "Telluride Times",
    date: "August 3, 2026",
    firstSeen: "2026-08-03",
    newsTopic: "arts-culture",
    copy: "The Telluride AIDS Benefit hosts Studio TAB: Summer Fever on Aug. 15, a disco-themed outdoor fashion show and fundraiser at an Aldasoro estate, 6–9 p.m. Just 100 tickets available. Proceeds support local HIV prevention, education, and wellness programs running since 1993.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_53c75a0c-f465-43dc-848a-f693cd6dafc4.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/69/d69fd711-2840-4159-b86c-7409ab41d8ea/6a701e7402f53.image.jpg",
    imgHiRes: true
  },
  {
    title: "Judge clarifies NCAA eligibility order, which could blunt its impact on new '5 for 5' rule",
    source: "Telluride Times",
    date: "August 3, 2026",
    firstSeen: "2026-08-03",
    newsTopic: "education",
    copy: "A federal judge clarified her ruling granting a fifth eligibility year to certain 2022 high school graduates, confirming it doesn't override NCAA rules on pro contracts or transfer portals. Football players who signed NFL or CFL deals this summer cannot use the ruling to return to college. The NCAA is appealing, leaving teams to weigh roster decisions carefully.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_b448d062-4328-5edd-ac68-930017d214ac.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/71/f71da2da-9017-5ceb-a135-cf15a58f6f9f/6a6ff383cb28f.image.jpg",
    imgHiRes: true
  },
  {
    title: "Nurturing the jazz artists of tomorrow",
    source: "Telluride Times",
    date: "August 3, 2026",
    firstSeen: "2026-08-03",
    newsTopic: "arts-culture",
    copy: "The Telluride Jazz Festival's All-Stars program has been developing elite young jazz musicians — ages 15–21 — since 1995, putting them on the Town Park main stage each August. The 2026 group performs at the New Sheridan Bar on Aug. 4–5 and hits the main stage Aug. 8 at 1:30 p.m. Details at telluridejazz.org/allstars.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_8dfd63e3-3d7c-4d4f-86bf-9984f565884c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/c3/fc367985-3342-4be9-bc05-7208b7611580/6a6f93dded403.image.jpg",
    imgHiRes: true
  },
  {
    title: "For divorced parents, Telluride lowers threshold for town-owned or deed-restricted units",
    source: "Telluride Times",
    date: "August 2, 2026",
    firstSeen: "2026-08-02",
    newsTopic: "housing",
    copy: "Telluride's Housing Authority voted July 21 to lower the shared-custody threshold for town-owned and deed-restricted units from 50% to 20%, allowing a parent with at least 20% custody to qualify for a bedroom for their child. The change applies to both rentals and for-purchase units.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_0c847016-c186-40f7-ac1a-fa807ebdef23.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/aa/8aa472db-aa78-4f24-a4c1-327b35f88eec/6a6d2ba52e3c8.image.jpg",
    imgHiRes: true
  },
  {
    title: "A perfect time for the Perseids",
    source: "Telluride Times",
    date: "August 2, 2026",
    firstSeen: "2026-08-02",
    newsTopic: "community",
    copy: "The Perseids meteor shower peaks the nights of Aug. 11–12 and 12–13, with no moonlight interference this year making for ideal dark skies. No equipment needed — just find a dark spot; locally, Top of the Pines near Ridgway, Lizard Head Pass, or Hastings Mesa all work. After midnight you may see up to 100 meteors per hour.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_cdaa6533-92f7-42ca-bc46-8a6258c06670.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/77/b77102fd-a6c1-49ed-8002-357712082116/6a6ba339ca365.image.jpg",
    imgHiRes: true
  },
  {
    title: "From the Western Slope to Washington",
    source: "Telluride Times",
    date: "August 1, 2026",
    firstSeen: "2026-08-01",
    newsTopic: "education",
    copy: "Three Western Slope high school seniors — from Olathe, Ridgway, and Nucla — traveled to Washington, D.C., in July as Pinhead Institute interns to participate in the Smithsonian National Youth Summit on American history. It marked the first time Pinhead expanded its internships beyond STEM subjects, through its Smithsonian Rural Initiative affiliation. The students worked with museum staff, curators, and educators to develop classroom materials on civic engagement and U.S. history.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_87498e26-e4ee-40bb-ba79-604becc0d886.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/0f/a0f80091-d57c-44b7-9b24-02d9b3eac975/6a6d2c6cbafbc.image.jpg",
    imgHiRes: true
  },
  {
    title: "Fishing closures are becoming routine as record heat warms rivers in the US West",
    source: "Telluride Times",
    date: "August 1, 2026",
    firstSeen: "2026-08-01",
    newsTopic: "infrastructure",
    copy: "Hot, dry conditions this summer have pushed river temperatures across the West to levels dangerous for trout, prompting fishing closures on over 1,200 miles of Montana rivers and 635 miles in Colorado. Yellowstone has now restricted afternoon fishing parkwide. Guides and biologists note these closures have grown routine over the past decade.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_d23962d1-8e6f-5e4d-9cdf-a6ddafb0b8f0.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/15/51547524-cd0c-5f3e-aa81-27a688667c34/6a6de1a38bda1.image.jpg",
    imgHiRes: true
  },
  {
    title: "Parks and rec commission members vote 4-3 to keep oval green",
    source: "Telluride Times",
    date: "August 1, 2026",
    firstSeen: "2026-08-01",
    newsTopic: "government",
    copy: "The Telluride Parks and Recreation Commission voted 4-3 to recommend keeping the oval green, favoring a plan that improves drainage and irrigation while enlarging the existing basketball court. Over 450 petition signatures and strong public turnout pushed back against a paving proposal from the 2020 Town Parks Master Plan. Town Council will have the final say.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_915fe3a9-de90-417a-8fd0-a647f1533622.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/a5/6a51461b-5359-4480-958f-e4b3ba7efb32/6a6d2a1851ce2.image.jpg",
    imgHiRes: true
  },
  {
    title: "Arizona, California and Nevada would share cuts under federal proposal to manage the Colorado River",
    source: "Telluride Times",
    date: "July 31, 2026",
    firstSeen: "2026-07-31",
    newsTopic: "infrastructure",
    copy: "The federal government is proposing mandatory water cuts for Arizona, California, and Nevada — up to 3 million acre-feet through 2036 — while Upper Basin states like Colorado get a reprieve for now. It's a 10-year framework with decisions revisited every two years. The long-term fight over the Colorado River is far from settled.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_37334c6a-ad41-5fcd-9900-2de63d49cd5d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/ea/4ea576e4-b46b-5fb0-b738-13a76c043e90/6a6cba4c81216.image.jpg",
    imgHiRes: true
  },
  {
    title: "SMART Executive Director David Averill resigns effective Nov. 30",
    source: "Telluride Times",
    date: "July 31, 2026",
    firstSeen: "2026-07-31",
    newsTopic: "government",
    copy: "SMART Executive Director David Averill has resigned after nearly nine years, with his last day set for November 30. He built the authority from scratch — no buses, no routes, no assets — into a regional transit operation serving San Miguel, Montrose, and Dolores counties. The board is now looking for his replacement.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_8e94f1f3-3c67-48ed-a227-19d028e05a59.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/52/7528c53a-bb46-42c0-b9c1-4e07bd148b75/6a6ba5a920f1f.image.jpg",
    imgHiRes: true
  },
  {
    title: "Lone Cone Legacy Trust 2026 community grants cycle now open",
    source: "Telluride Times",
    date: "July 31, 2026",
    firstSeen: "2026-07-31",
    newsTopic: "community",
    copy: "Lone Cone Legacy Trust is accepting applications for its 2026 Community Grants through Sept. 14, with a record $26,000 set to be distributed across the Wright's Mesa area, including Norwood and Redvale. Local nonprofits, taxing districts, and sponsored community organizations are eligible, with extra weight given to groups serving local youth. Grant recipients will be announced at the Harvest Celebration Dinner on Oct. 10 in Norwood.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_d640934b-95b6-4acf-bdd9-37128787cf7e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/1d/81d6b368-c810-415c-b978-696826974b31/6a6a251b73644.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride Town Council extends waitlist suspension",
    source: "Telluride Times",
    date: "July 31, 2026",
    firstSeen: "2026-07-31",
    newsTopic: "housing",
    copy: "Town Council extended the suspension of Telluride's housing waitlist through end of September, giving staff more time to place applicants in town-owned rentals. Vacancy sits at 14% — above the 8% target. About 195 people remain on the waitlist, and 26 more units are expected through the Canyonlands project within six to eight months.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_3478f558-f4bf-4dcf-8293-5a5b89679c10.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/c5/7c5624f2-d1ff-4cb7-b33a-0ae63571e576/6a6b9f9dd7986.image.jpg",
    imgHiRes: true
  },
  {
    title: "Burglary charge could send man linked to Navajo elder's disappearance back to federal prison",
    source: "Telluride Times",
    date: "July 31, 2026",
    firstSeen: "2026-07-31",
    newsTopic: "community",
    copy: "Preston Tolth — the only person convicted in connection with the 2021 disappearance of Navajo elder Ella Mae Begay — was arrested in Phoenix this week on a burglary charge. Released from federal prison in June, two years early, he was already under a U.S. Marshals warrant when Phoenix police picked him up. His family says there's still no justice or closure.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_76882ffe-8459-557e-9a42-b53975d1779f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/47/1479d6df-aa7f-5de2-a827-daded8bd670a/6a6be991898c1.image.jpg",
    imgHiRes: true
  },
  {
    title: "Art of being rad, and a good human",
    source: "Telluride Times",
    date: "July 30, 2026",
    firstSeen: "2026-07-30",
    newsTopic: "arts-culture",
    copy: "Craig Wasserman has been running the Telluride Summer Skateboard Camp since 2017 out of his Drop Boardshop, growing from a handful of kids to 20–30 campers a day. The program runs June through August, focusing on fundamentals alongside life skills like patience and perseverance. Many former campers, including coach Walter Kvale, now come back to teach.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_cf6f960f-6659-499d-9b93-88f977e7bd6d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/70/f70d58b5-0a39-4f7e-98d2-fdc26fbb4c05/6a693ff67d713.image.jpg",
    imgHiRes: true
  },
  {
    title: "Mushrooms are the focus at West End Stories & Poems",
    source: "Telluride Times",
    date: "July 30, 2026",
    firstSeen: "2026-07-30",
    newsTopic: "arts-culture",
    copy: "Art Goodtimes and Leslie Ament will lead a mushroom-focused evening at the Naturita Community Library on Aug. 6 at 6 p.m. as part of the West End Stories and Poems series. Goodtimes, long connected to the Telluride Mushroom Festival, is hoping locals bring their own fungi stories to share. Free, all ages, refreshments provided.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_d1ae679f-bdcb-4adc-8f64-5e8d232a71cc.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/a8/8a8e6da0-a73b-4d0a-9e3d-08fda1712669/6a6a274b69a5a.image.jpg",
    imgHiRes: true
  },
  {
    title: "Eavesdropping on molecular conversations",
    source: "Telluride Times",
    date: "July 30, 2026",
    firstSeen: "2026-07-30",
    newsTopic: "community",
    copy: "Harvard physicist-turned-biologist Dr. Taekjip Ha presents a free Telluride Science Town Talk Aug. 4 at 6:30 p.m. in Mountain Village, covering how single-molecule imaging tools are revealing how proteins move — and how mutations drive cancer. His lab's work includes studying BRCA2 and improving the accuracy of CRISPR gene editing. The series runs through Aug. 11, supported by Alpine Bank and TMVOA.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/editorials/article_b39b35b9-763d-4f00-a540-31ff4614f92e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/e8/1e842ded-bf40-4551-9274-f872d9f9ba63/6a6b7decac89d.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Shakespeare comes to Norwood",
    source: "Telluride Times",
    date: "July 30, 2026",
    firstSeen: "2026-07-30",
    newsTopic: "arts-culture",
    copy: "UpstART Theater's No Holds Bard troupe brings \"Love's Labor's Lost\" to The Livery in Norwood on Aug. 4, part of a six-night Western Slope run. The Ouray-based company performs Shakespeare unrehearsed, with actors playing rotating roles each night — closer to how the plays were originally staged.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_29fe4ca6-fcf8-4070-ad80-6977ed183b2c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/3d/63d45e2c-8a1d-4a16-989f-a660df96f24b/6a6a2425548fe.image.png",
    imgHiRes: true
  },
  {
    title: "CHALKBOARD Week of July 30-Aug. 5",
    source: "Telluride Times",
    date: "July 30, 2026",
    firstSeen: "2026-07-30",
    newsTopic: "government",
    copy: "High school football practice kicks off August 3, with middle and high school volleyball, cross country, and middle school football all starting August 10. The Norwood Farmers Market runs Thursdays through mid-October, 2–6 p.m. at Pocket Park, and a free Chamber Music concert is set for August 27 at The Livery.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_4f4b8a88-e098-41fe-a40b-2b9c043c65c1.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/1c/c1c06145-5961-4638-99e9-1a088f047c47/6a6a26bbcf067.image.jpg",
    imgHiRes: true
  },
  {
    title: "Let there be light limitations",
    source: "Telluride Times",
    date: "July 30, 2026",
    firstSeen: "2026-07-30",
    newsTopic: "government",
    copy: "Mountain Village unanimously passed updated architectural lighting regulations July 16 after 10 public meetings and unusually heavy outreach. The final rules grandfather existing recessed soffit and underdeck lighting attached to buildings, sparing owners costly retrofits, while new construction must meet the full standard. The stated goal is balancing homeowner preferences with the community's interest in darker skies.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_6392bdbe-6d24-4572-9bb1-76ad22d33d1b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/8c/b8c6039d-ce96-4aa3-acaa-3c2891c7ac48/6a68434710330.image.jpg",
    imgHiRes: true
  },
  {
    title: "Legals and Public Notices for July 30-August 5, 2026",
    source: "Telluride Times",
    date: "July 30, 2026",
    firstSeen: "2026-07-30",
    newsTopic: "community",
    copy: "A Phoenix-based applicant is seeking a Hotel and Restaurant liquor license at 138 Colorado Ave. in Telluride, with a hearing set for August 11. San Miguel County is also holding a public hearing August 13 on adopting updated building and energy codes, with the 2027 town budget process now open for public input through August 21.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/legals/article_75aea7bc-6c31-4ed5-9d5b-9e77b399632d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Alex Garay",
    source: "Telluride Times",
    date: "July 30, 2026",
    firstSeen: "2026-07-30",
    newsTopic: "community",
    copy: "Alex Garay, a young man who called both Telluride and Barcelona home, passed away July 18 at age 31. He is survived by his brothers Daniel, Oscar, and Lucas, and his mother Christina Casas. He will be remembered for his love of family, friends, technology, and Spanish football.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/obituaries/article_a6df4706-50bb-46cc-b779-249d2445a9f8.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/dc/5dc99194-e41d-4c11-9861-0f69bb37d2f6/6a6a379ecd129.image.jpg",
    imgHiRes: true
  },
  {
    title: "Hardly ‘dog days’ for local pets",
    source: "Telluride Times",
    date: "July 29, 2026",
    firstSeen: "2026-07-29",
    newsTopic: "community",
    copy: "Dr. Steven Smolen has opened the Dog House, a dog boarding and daycare facility at 780 Vance Drive in Ilium — the third piece of an animal care operation that also includes the Animal Hospital of Telluride and Pet Telluride. HOA and county approvals delayed the opening by at least a year, and staffing and grooming remain works in progress. Cat accommodations are planned as a next phase.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_0ea056ae-2268-4a3d-be73-8ca8d2ae5209.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/a7/ea7e9dbf-92ba-484f-994f-4272d3137025/6a651fa261458.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘This is Colorado’ winds down",
    source: "Telluride Times",
    date: "July 29, 2026",
    firstSeen: "2026-08-03",
    newsTopic: "arts-culture",
    copy: "Telluride Arts and the Telluride Historical Museum wrapped up their \"This Is Colorado (In One Square Foot)\" community art show July 31. Local residents filled 12x12 canvases responding to what it means to be a Coloradan, displayed at Telluride Arts HQ and Mountain Village. In-person donations were accepted in exchange for taking a piece home.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_a7235154-2251-408a-a5a9-8bb658d97e73.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/4d/24d4d04f-a4db-4280-a9b5-8374e797b303/6a704e4998457.image.jpg",
    imgHiRes: true
  },
  {
    title: "A rip-roaring good time",
    source: "Telluride Times",
    date: "July 29, 2026",
    firstSeen: "2026-07-29",
    newsTopic: "arts-culture",
    copy: "The San Miguel Basin Rodeo returns to the San Miguel County Fairgrounds in Norwood on July 31–August 1, more than 120 years running. The junior rodeo kicks off Friday morning, drawing competitors ages 4–18 from across the region. An afterparty with live music follows Saturday night.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_7074d3dc-aeed-47e8-8b17-34bed1fcb918.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/4a/64a4d984-86c9-47de-9463-748e2224edfe/6a6a228430271.image.png",
    imgHiRes: true
  },
  {
    title: "It’s a jungle out there",
    source: "Telluride Times",
    date: "July 29, 2026",
    firstSeen: "2026-07-29",
    newsTopic: "arts-culture",
    copy: "Sheridan Arts Foundation's Young People's Theater is staging \"The Jungle Book\" this week, with 26 kids rehearsing and performing the full Disney musical in just five days. Director Leah Heidenreich has led these Summer Spectacular productions for years — including a Zoom version during COVID in 2020. It's a tight turnaround, but by all accounts the kids take it in stride.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_88baaf9f-114c-423f-8b8d-458d83b210cb.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/d3/7d328b9c-da2d-4f8e-b19f-75ac888b2067/6a693bc0431dc.image.jpg",
    imgHiRes: true
  },
  {
    title: "High notes",
    source: "Telluride Times",
    date: "July 29, 2026",
    firstSeen: "2026-07-29",
    newsTopic: "education",
    copy: "Telluride Reserve runs July 31–Aug. 1, bringing chefs and boutique winery producers together for tastings, dinners, and seminars across venues including Telluride Town Park. The festival also runs a mentorship program pairing hospitality students with featured chefs, supported by its nonprofit arm, Taste for Impact.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_1a6b7dca-7e57-43ff-9b4f-5fe2a80fc77b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/be/4bec4213-0708-4d0e-bf56-8c80e70dc72c/6a664051bab9a.image.jpg",
    imgHiRes: true
  },
  {
    title: "Trump officials launch probe of 2 school districts over alleged testosterone vials, kissing exercise",
    source: "Telluride Times",
    date: "July 29, 2026",
    firstSeen: "2026-07-28",
    newsTopic: "education",
    copy: "The U.S. Department of Education has opened investigations into Denver Public Schools and Washington's Bethel School District over alleged violations of federal parental rights laws. Denver already fired the teacher involved; Bethel says the unauthorized display was immediately removed and handed to law enforcement. Both probes are part of a broader federal push on parental rights in schools.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_b491e416-48f7-5139-ac24-127f03ec2497.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/d4/5d4064a2-5635-5796-ae8c-5131d403aad5/6a69089279fef.image.jpg",
    imgHiRes: true
  },
  {
    title: "Conched out",
    source: "Telluride Times",
    date: "July 29, 2026",
    firstSeen: "2026-07-29",
    newsTopic: "community",
    copy: "A Telluride local reflects on their handmade conch shell horn — collected in the Bahamas, fashioned with a hacksaw — and its role as a celebratory trumpet for U.S. soccer goals and big powder days. The horn saw heavy use this World Cup, echoing through the valley on big moments. It's back on the shelf now until next time.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/editorials/article_cb2f1381-afc4-4dff-aaba-c044e0bdd62f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/c0/4c07ed9a-9810-4f4b-b780-bacdcd12116f/6a694489ec1cc.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Local, everyday care in both towns — one emergency hub for the region",
    source: "Telluride Times",
    date: "July 29, 2026",
    firstSeen: "2026-07-29",
    newsTopic: "public-safety",
    copy: "A local orthopedic surgeon is proposing a three-site care model: upgraded urgent care clinics in both Telluride and Mountain Village for routine needs, with a compact emergency stabilization center at Society Turn for serious cases only. The argument is that consolidating everything at one distant hub adds travel risk, cost, and access barriers that a distributed system avoids.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/editorials/article_c88ab366-4666-4a4f-971a-2c3c8008954d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/87/387084ec-87d5-4cb9-aa8b-1a08170259cf/6a6943ada847c.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Kirbie Bennett of Durango featured at next Bardic Trails",
    source: "Telluride Times",
    date: "July 28, 2026",
    firstSeen: "2026-07-29",
    newsTopic: "recreation",
    copy: "Kirbie Bennett — Indigenous poet, essayist, and audio producer from Durango and a member of the Navajo Nation — is the featured guest at Bardic Trails on Aug. 4 at 7 p.m. via Zoom. The monthly series is hosted by the Telluride Institute's Talking Gourds program; attendees can find the link at tellurideinstitute.org or email art@tellurideinstitute.org.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_3b691f21-c7a6-418c-b6d5-f7254b723795.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/e6/ae6e1a11-5d37-4365-86ec-373175debef0/6a694287a0143.image.jpg",
    imgHiRes: true
  },
  {
    title: "'This is Colorado' winds down",
    source: "Telluride Times",
    date: "July 28, 2026",
    firstSeen: "2026-07-29",
    newsTopic: "arts-culture",
    copy: "Telluride Arts and the Telluride Historical Museum's community art show \"This Is Colorado (In One Square Foot)\" closes July 31. Residents created works on 12x12 canvases marking Colorado's 150th statehood and the US 250th anniversary. Stop by 135 W. Pacific Ave. before end of day Friday to donate and take home a piece.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/gallery/article_adb794bd-3120-46c9-bba9-e583d22d5ac5.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/2c/62c29ee5-cc6d-4071-bd14-ca429bf6787c/6a693cea9121c.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride cowboy gives visitors a taste of the American West",
    source: "Telluride Times",
    date: "July 28, 2026",
    firstSeen: "2026-07-29",
    newsTopic: "community",
    copy: "Thomas \"Roudebush has been a fixture on Colorado Avenue since 1970 — flag in hand at Fourth of July, leading skijoring events in winter, and running Telluride Horseback Adventures out of Norwood. He appeared in a 2004 Disney documentary and has worked with an estimated 400–500 horses over his lifetime.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/local/article_d2e1a797-2a47-4afa-b303-7ee00ecf9add.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/0b/d0bc0d23-4ca7-42d3-bff4-c9469085e732/6a693e5312709.image.jpg",
    imgHiRes: true
  },
  {
    title: "An improved print edition",
    source: "Telluride Times",
    date: "July 28, 2026",
    firstSeen: "2026-07-29",
    newsTopic: "community",
    copy: "The Telluride Times has switched to a new printing facility in Gypsum — the same one used by several other mountain town papers. Print quality is expected to improve significantly, and the paper's physical size will change slightly.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/editorials/article_6fed4e8a-590a-4115-a302-0903f5c80a81.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/1c/61cfa0c0-70c2-402f-b75f-475a5d791e20/6a693b5924735.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "When it rains...it floods",
    source: "Telluride Times",
    date: "July 28, 2026",
    firstSeen: "2026-07-29",
    newsTopic: "public-safety",
    copy: "Monsoon rains brought relief from wildfire smoke, but quickly swapped one emergency for another — the Palm Theatre took on 4 feet of mud, homes flooded, and Highway 145 closed twice from slides. The County is working on culvert clearing, earth barriers, CDOT partnerships, and employee housing at Deep Creek to keep maintenance crews closer. Bigger road improvements on Norwood Hill and Keystone Hill are in the pipeline for 2029.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/editorials/article_3ac15ce1-f1b3-4a5d-a4fd-2b91df4f1064.html",
    img: "",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Robinson Waters and Odorisio announces transition in Telluride",
    source: "Telluride Times",
    date: "July 28, 2026",
    firstSeen: "2026-07-29",
    newsTopic: "community",
    copy: "After 38 years practicing real estate law in Telluride, Michael Lynch has retired. Denver firm Robinson Waters & Odorisio, which Lynch helped anchor here since 2009, is continuing its local presence through Herb McHarg, who has practiced real estate law in the area since 2005.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_62a30293-b665-4a7b-9618-eeb101fb6d25.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/5d/95de4731-af07-47b3-9990-b730581d3001/6a6939828ddba.image.jpg",
    imgHiRes: true
  },
  {
    title: "Bringing home barn cats",
    source: "Telluride Times",
    date: "July 28, 2026",
    firstSeen: "2026-07-29",
    newsTopic: "community",
    copy: "Second Chance Humane Society in Ridgway has barn cats available for adoption — unsocialized cats suited for outbuildings rather than indoor homes. They ask adopters to follow a 4–6 week acclimation process using a crate to help the cat establish territory before roaming free. Daily food and water are required; rodents alone won't cut it.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_7021bc89-1c97-436b-bd28-30172cce8db8.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/c4/bc422a31-caee-4763-a0b2-f39672e1e848/6a6938ab85294.image.jpg",
    imgHiRes: true
  },
  {
    title: "Mountain Village celebrates safe communities with National Night Out",
    source: "Telluride Times",
    date: "July 28, 2026",
    firstSeen: "2026-07-29",
    newsTopic: "public-safety",
    copy: "Mountain Village is hosting its 14th annual National Night Out on Tuesday, Aug. 4, 5–8 p.m. at the fire station on Mountain Village Boulevard. Free BBQ, ice cream, a bouncy castle, and equipment tours are on tap. A good chance to meet your local first responders in a low-key setting.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_cbfb064f-510d-43fa-9665-7c62eb69b4ec.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/56/556c2474-c6e3-48a3-8099-0008b8a50903/6a693696e7f19.image.jpg",
    imgHiRes: true
  },
  {
    title: "San Miguel County commissioners set legislative priorities",
    source: "Telluride Times",
    date: "July 28, 2026",
    firstSeen: "2026-07-28",
    newsTopic: "government",
    copy: "San Miguel County commissioners reviewed legislative priorities for their advocacy group CCAT, flagging revenue diversification — especially a short-term rental services tax — as a top concern. They pushed back on housing policies they see as too metro-focused and hurting rural counties. They also agreed not to back a TABOR legal challenge, calling it an unwinnable fight.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_9cf083dd-28ae-4c3b-aede-618971d2a128.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/26/9265cd80-a44a-4fe2-be7f-b5e7da4c7f26/6a65215d93a87.image.jpg",
    imgHiRes: true
  },
  {
    title: "Live at the Drive — and dueling ducks",
    source: "Telluride Times",
    date: "July 28, 2026",
    firstSeen: "2026-07-28",
    newsTopic: "arts-culture",
    copy: "KOTO-FM's \"Live at the Drive\" returns this summer with two free concerts at the Purple House on Pine — Big Something on July 30 and the Gold Kings on August 27. The station's annual Duck Race follows on August 7, floating 850 rubber ducks down the San Miguel and raising around $8,000 for KOTO each year.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_c3d3b700-3c9b-4b99-a81c-94803ed9e88f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Unresolved affordability issues",
    source: "Telluride Times",
    date: "July 27, 2026",
    firstSeen: "2026-07-27",
    newsTopic: "housing",
    copy: "Telluride's 244 town-owned rental units saw rent spikes after new THA policies tied rent to income percentages, prompting pushback from residents and at least one council member. The Town has made some adjustments, but no major policy changes are expected until 2027. The tension between local housing realities and HUD's standard AMI metrics — $91,800 for one person here — remains unresolved.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_68db3e0a-3cfc-4199-ac0f-d76eadf94c91.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/ea/deaeb07b-8a73-45c6-b94d-70f45d2bf483/6a651ba506980.image.jpg",
    imgHiRes: true
  },
  {
    title: "Region 10 Enterprise Zone expands to include all of San Miguel County",
    source: "Telluride Times",
    date: "July 27, 2026",
    firstSeen: "2026-07-27",
    newsTopic: "government",
    copy: "All of San Miguel County — including Telluride and Mountain Village — now falls within the Region 10 Enterprise Zone after a state-approved boundary amendment, making local businesses and nonprofits eligible for Colorado income tax credits through 2035. The county qualified due to population decline between 2020 and 2024, not low income or high unemployment. Informational sessions are scheduled for August 17.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_8e17fdf6-e2b4-40b4-8b6a-026044b8970a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/d2/ad2a4eae-cc62-4ed3-a012-ce4cdef87e67/6a651c98276f9.image.jpg",
    imgHiRes: true
  },
  {
    title: "A priceless chance to sip and learn",
    source: "Telluride Times",
    date: "July 26, 2026",
    firstSeen: "2026-07-26",
    newsTopic: "community",
    copy: "Free wine and spirits tastings happen regularly at several Telluride and Mountain Village shops — Mountain Village Wine Merchant on Wednesdays, Telluride Wine Merchant on Thursdays, and periodically at Telluride Bottleworks and the Wine Mine. The Wilkinson Public Library has also been running a free Around the World tasting series that's drawn full crowds every session, covering sakes, tequilas, Italian wines, and rosé. More library sessions and possibly an Oktoberfest event are being discussed.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_7d94dcba-a1c7-4668-bed6-b516e0e9d320.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/cc/acc894e9-e3c8-4391-add2-52d23fd84064/6a64638fe2396.image.jpg",
    imgHiRes: true
  },
  {
    title: "BOCC offers regional environmental updates",
    source: "Telluride Times",
    date: "July 26, 2026",
    firstSeen: "2026-07-26",
    newsTopic: "government",
    copy: "San Miguel County's Natural Resources Director briefed the BOCC on two main topics July 22. The county signed a letter opposing new BLM rules that cut public comment periods from 90 days to 10 and reduce oil and gas lease bonds by 90%. The board also discussed composting options and green waste from local arborists.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_20b981b9-8461-40af-9108-28f777ced05f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/6b/56b90bb0-5340-44f6-a32c-9e2fdc1446df/6a64613178225.image.jpg",
    imgHiRes: true
  },
  {
    title: "Black Bear Pass Now Open",
    source: "San Miguel County",
    date: "August 3, 2026",
    newsTopic: "recreation",
    copy: "County crews finished work this afternoon, Black Bear Pass is now open from Red Mountain Pass to Telluride.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=539",
    img: ""
  },
  {
    title: "Numerous Highway Closures",
    source: "San Miguel County",
    date: "July 22, 2026",
    newsTopic: "infrastructure",
    copy: "Due to heavy rains, highways 145 and 62 are experiencing mudslides in various locations. Several sections are impassable, with no expected reopening time yet. CDOT is en route. More information will be shared as it becomes available.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=537",
    img: ""
  },
  {
    title: "Tomboy Road",
    source: "San Miguel County",
    date: "July 21, 2026",
    newsTopic: "infrastructure",
    copy: "Due to hazardous conditions, lower Tomboy Road is currently closed to all pedestrian and vehicle traffic. The road is closed below Smuggler Mine, above Telluride and below Tomboy. The road is scheduled to be reopened Wednesday 7/22 at 8:00 a.m.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=536",
    img: ""
  },
  {
    title: "Black Bear Pass is now open. Please check with San Juan County for the current status of the pass on their side.",
    source: "San Miguel County",
    date: "July 14, 2026",
    newsTopic: "recreation",
    copy: "Black Bear Pass is now open. Please check with San Juan County for the current status of the pass on their side.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=534",
    img: ""
  },
  {
    title: "Ridgway Town Council Regular Meeting Agenda",
    source: "Town of Ridgway",
    date: "August 12, 2026",
    firstSeen: "2026-08-07",
    newsTopic: "government",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/00-August-12-tc-agenda.pdf",
    img: ""
  },
  {
    title: "Notice of Public Hearings Aug 12, 2026 at 5:30pm 1) Proposal: organization of Alpenglow Vista Metro Districts 1-4, 2) Application: Hyde Subdivision, Resubdivision of lots",
    source: "Town of Ridgway",
    date: "July 31, 2026",
    firstSeen: "2026-07-31",
    newsTopic: "land-use",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/TC-Public-Hearing-Notice-Combined-Aug-2026.pdf",
    img: ""
  },
  {
    title: "Notice &amp; Call of Joint Work Session of Ridgway Town Council and Planning Commission on Aug. 12, 2026 at 5:30pm: Review Draft Housing Action Plan",
    source: "Town of Ridgway",
    date: "July 31, 2026",
    firstSeen: "2026-07-31",
    newsTopic: "government",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/TC-PC-Joint-Work-Session-Notice-2026-08-12.pdf",
    img: ""
  },
  {
    title: "Notice of Public Hearing Aug. 19, 2026 at 5:30pm: Deviation from Design Standards for new construction at 211 Mary Street - Aug. 7, 2026",
    source: "Town of Ridgway",
    date: "August 8, 2026",
    firstSeen: "2026-08-07",
    newsTopic: "land-use",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2026.08.19_public-hearing-notice.pdf",
    img: ""
  }
];

const KOTO_NEWSCASTS = [
  {
    title: "Newscast 8-6-26",
    source: "KOTO Community Radio",
    date: "August 7, 2026",
    newsTopic: "arts-culture",
    copy: "Ranching in Drought; West End Roundup with the San Miguel Basin Forum; Music on the Mesa Brings the Burroughs",
    href: "https://koto.org/news/newscast-8-6-26/"
  },
  {
    title: "Newscast 8-5-26",
    source: "KOTO Community Radio",
    date: "August 6, 2026",
    newsTopic: "government",
    copy: "Dylan Brooks Vies for Seat on San Miguel Board of County Commissioners; Tri-County Shifts to Thrive Community Health Network; Feathered Athletes Flock to Telluride",
    href: "https://koto.org/news/newscast-8-5-26/"
  },
  {
    title: "Newscast 8-3-26",
    source: "KOTO Community Radio",
    date: "August 4, 2026",
    newsTopic: "arts-culture",
    copy: "Telluride Film Festival Full Steam Ahead with Nugget Rebuild; Eco-Grief Finds the Space Between Grief and Gratitude",
    href: "https://koto.org/news/newscast-8-3-26/"
  },
  {
    title: "Newscast 7-31-26",
    source: "KOTO Community Radio",
    date: "August 1, 2026",
    newsTopic: "arts-culture",
    copy: "On this week's Regional Roundup, hear about literary endeavors around the region. We hear about a new book inspired by the author's own journey from being a former east coast attorney to moving to Colorado to work on a horse ranch. Then we visit a bookstore in Nederland to hear how it is working to create a community space. After that, best selling",
    href: "https://koto.org/news/newscast-7-31-26/"
  },
  {
    title: "Newscast 7-30-26",
    source: "KOTO Community Radio",
    date: "July 31, 2026",
    newsTopic: "community",
    copy: "West End Roundup with the San Miguel Basin Forum; No Holds Bard with Love’s Labor’s Lost; Cat Movie Fisher with Risho Unda",
    href: "https://koto.org/news/newscast-7-30-26/"
  },
  {
    title: "Newscast 7-29-26",
    source: "KOTO Community Radio",
    date: "July 30, 2026",
    newsTopic: "arts-culture",
    copy: "Parks &amp; Rec Keeps the Oval Green; Telluride Invests in Tourism; Chamber Music Celebrates American Brass",
    href: "https://koto.org/news/newscast-7-29-26/"
  },
  {
    title: "Newscast 7-27-26",
    source: "KOTO Community Radio",
    date: "July 28, 2026",
    newsTopic: "community",
    copy: "Remembering Anna Brown; Telluride Looks to Calm Speed on East End",
    href: "https://koto.org/news/newscast-7-27-26/"
  }
];

const KOTO_FEATURED_STORIES = [
  {
    title: "Dylan Brooks Vies for Seat on San Miguel Board of County Commissioners",
    source: "KOTO Community Radio",
    date: "August 6, 2026",
    newsTopic: "government",
    copy: "Dylan Brooks is running for San Miguel County Commissioner in District 2. He spoke with KOTO News about why he's running and his vision for the county.",
    href: "https://koto.org/news/dylan-brooks-san-miguel-county-commissioner-candidate-election/"
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
    title: "A day in the life at the ICP during the Gold Mountain Fire",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "July 22, 2026",
    firstSeen: "2026-07-22",
    dateSource: "article",
    newsTopic: "public-safety",
    copy: "At the Gold Mountain Fire's Incident Command Post in Ridgway, nearly 1,000 personnel from 37 states were operating out of the 4-H fairgrounds — 16-hour days, tent camps, and a rotating crew every 14 days. The fire stood at 37,809 acres and 13% contained as of Sunday. The morning briefing also paused to note that crews would begin recovering the helicopter lost July 12, when pilot Nicholas Dale died at Silver Jack Reservoir.",
    claudeSummary: true,
    href: "https://www.sanmiguelbasinforum.com/stories/untitled,123273",
    img: ""
  },
  {
    title: "Sawyer Wareham is the 2026 San Miguel Basin Rodeo Queen",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "July 22, 2026",
    firstSeen: "2026-07-22",
    dateSource: "article",
    newsTopic: "education",
    copy: "Sawyer Wareham, a Norwood High School freshman, has been named the 2026 San Miguel Basin Rodeo queen. She's been riding since age 5 and will represent the community on a 3-year-old Palomino mare named Prim. The rodeo runs July 31–Aug. 1 at the San Miguel Basin Fairgrounds in Norwood.",
    claudeSummary: true,
    href: "https://www.sanmiguelbasinforum.com/stories/sawyer-wareham-is-the-2026-san-miguel-basin-rodeo-queen,123269",
    img: "https://zeta.creativecirclecdn.com/smb/original/20260721-140645-a35-A81D3D4F-FE35-4EB3-8A12-7ED59DAC0559.JPG",
    imgPos: "center 22%"
  },
  {
    title: "Wright, Dexter share wisdom on birds, fire",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "July 15, 2026",
    firstSeen: "2026-07-15",
    dateSource: "article",
    newsTopic: "public-safety",
    copy: "Brenda Wright and Coen Dexter, former Nucla residents and published bird experts, recently spoke about how hotter, drier conditions are driving Ips beetle damage through pinion forests — directly threatening the Pinion Jay, which depends on pinion seeds to survive. They also explained how crown fires, unlike low brush fires, can wipe out entire bird habitats. CPW advises keeping feeders down April 15–Nov. 15 and leaving displaced wildlife alone.",
    claudeSummary: true,
    href: "https://www.sanmiguelbasinforum.com/stories/wright-dexter-share-wisdom-on-birds-fire,122305",
    img: ""
  },
  {
    title: "Dessert contest had 87 entries, 310 guests",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "July 15, 2026",
    firstSeen: "2026-07-15",
    dateSource: "article",
    newsTopic: "education",
    copy: "The San Miguel Basin Fair dessert contest drew 87 entries and 310 guests to Norwood School on July 11, with secret judges scoring numbered — not named — entries across ice cream, cookie, cake, and pie categories in youth, amateur, and professional divisions. Grand champion honors went to entries including Melissa Richardson's lemon pie, Amanda Pierce's hot fudge chocolate cake, Dawna Morris's sugar cookie, and Aimee Snyder's coffee toffee ice cream, among others.",
    claudeSummary: true,
    href: "https://www.sanmiguelbasinforum.com/stories/dessert-contest-had-87-entries-310-guests,122303",
    img: "https://zeta.creativecirclecdn.com/smb/original/20260713-235341-51b-F3%20-%20front%20page%20pic.jpg"
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
    title: "Fire management moonshot",
    source: "Telluride Times",
    sourceKey: "ttimes",
    date: "August 6, 2026",
    summary: "In a guest column, Norwood's John Metzger argues that a half-century of suppress-everything forest policy has left Western timberlands overgrown and primed to burn, and that the fix is industrial-scale thinning paired with utility-grade biomass plants that turn the excess fuel into energy. He points to the 1990s WHIMS defensible-space program -- which stalled on political resistance and thin rural fire budgets -- as the model to revive, and calls for a CCC-style national service corps to do the work.",
    href: "https://www.telluridenews.com/article_c6fb9425-1ec8-5321-969c-ad7808f56cf5.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/84/e849a731-98e2-5067-a168-3729aa39f798/6a745ca4b69ef.image.jpg?crop=766%2C403%2C0%2C11",
    category: "Opinion",
    newsTopic: "public-safety",
    featured: true,
    expires: "2026-08-08"   // Morgan directed a longer run: through Aug 7, off at the Aug 8 review
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
    title: "The Weekend Ahead Outlook - August 7 - August 9, 2026",
    date: "Aug 7, 2026",
    href: "https://livabletelluride.org/digest/archive/2026-08-07-weekend.html",
    image: "https://livabletelluride.org/logo/Livable%20Telluride%20Logo.png",
    excerpt: "@media only screen and (max-width:480px){ /* Event cards: stack image on top, text below, for easier mobile reading. */ .ev-img-cell{display:block !important;width:100% !important;padding:0 0 10px 0 !important;} .ev-img-cell img{width:160px !important;height:160px !important;} .ev-text-cell{display:block !important;width:100% !important;} /* Festival hero: stack the logo above the text on phones. ",
    category: "Newsletter",
    source: "customerio"
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
    image: "https://mcusercontent.com/5d9192289b9af78822f2f69bf/images/70e4c678-537d-d838-1a32-38095e444284.png",
    excerpt: "96 When the Town Judges Its Own Projects Apparently, our little newsletter has made a ripple. Possibly even a wave! ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ",
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
    image: "",
    excerpt: "Livable Telluride Kickoff Event Join Us for the Livable Telluride Kickoff Event Please join us tomorrow (Wednesday, June 10) from 5&ndash;7 PM at the Elks Club for the launch of Livable Telluride , a new community resource designed to make local information easier to find, understand, and use, and to bring people together. We'll have appetizers and a cash bar available. Livable Telluride is built ",
    category: "Newsletter",
    source: "mailchimp"
  },
  {
    title: "Welcome to the New Livable Telluride",
    date: "Jun 2, 2026",
    href: "https://livabletelluride.org/digest/archive/2026-06-02-welcome-to-the-new-livable-telluride.html",
    image: "https://mcusercontent.com/5d9192289b9af78822f2f69bf/images/234a1ccb-fc9c-7aab-8d5f-dab36d775b79.png",
    excerpt: "96 Welcome to the New Livable Telluride Measure 300 process revealed that even in a small, highly engaged community, it is remarkably difficult for residents to keep track of issues ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ",
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
    title: "Seeking Elusive Quantum Advantages in Computational Chemistry",
    date: "2026-08-11",
    time: "6:30 PM – 7:30 PM",
    location: "Telluride Conference Center, Telluride",
    description: "This Town Talk will be presented by Joonhoo Lee from Harvard University.\r\nLee will explore the subtleties of realizing quantum advantages in computational chemistry. Drawing on several projects from his research group, he will offer fresh perspectives on how to think about what quantum computing can—and cannot—deliver for chemistry. He will also make the case for why chemists must learn theoretical computer science to prepare for the coming wave of fault-tolerant quantum computing.\r\nThis is the last Town Talk of the summer that  will be held oat the Telluride Conference Center in Mountain Village. The final Town Talk on August 25 will be held at the Telluride Innovation Center in Telluride.  Doors open at 6 pm and the program starts at 6:30 pm. Free and open to the public.\r\nThanks to our title sponsor Alpine Bank and Telluride Mountain Village Owner’s Association.",
    link: "https://telluridescience.org/event/quantum-computing-chemistry/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/07/Screenshot-2026-08-06-at-4.46.13-PM.png",
    sourceLabel: "Telluride Science"
  },
  {
    title: "Telluride Chamber Music and Telluride Science Community Concert",
    date: "2026-08-13",
    time: "6:00 PM – 7:00 PM",
    location: "Telluride Innovation Center, Telluride",
    description: "Join Telluride Science and Telluride Chamber Music for a free community concert with San Juan Symphony String Quartet on the scenic patio at the Innovation Center.  All are welcome—come soak in the beauty of live chamber music in an inspiring setting.",
    link: "https://telluridescience.org/event/community-concert-august/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/05/August-26_concert_1080x1080.jpg",
    sourceLabel: "Telluride Science"
  },
  {
    title: "Noche de Luz (Night of Light)",
    date: "2026-08-21",
    time: "6:30 PM – 10:00 PM",
    location: "Telluride Innovation Center, Telluride",
    description: "NOCHE DE LUZ: Comunidad en Flor A Vibrant Celebration of Connection, Culture and a Community in Bloom, presented by Community Banks of Colorado A fundraiser for the Multicultural Advocacy Programs at Thrive Community Health Network, in partnership with Raices sin Fronteras. Join us Friday, August 21st at 6:30pm to celebrate our \"Community in Bloom!\" The event will feature tastings from diverse local restaurants and caterers, cocktails and mocktails, artist demonstrations and live music from Denver-based \"Chicano funk\" band Los Mocochetes! Your Ticket Includes: – Enjoy appetizers, dinner and desert with tastings from local, immigrant-owned restaurants and catering businesses – 1 drink ticket for the bar serving signature cocktails and mocktails, beer and wine (additional drinks available for purchase) – Live Artist Demonstrations and Traditional Artisan Displays – Live Music! …",
    link: "https://telluridescience.org/event/noche-de-luz-night-of-light/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/07/Poster-without-Sponsor-block.jpg",
    sourceLabel: "Telluride Science"
  },
  {
    title: "Earth's Most Resilient Life, Our Greatest Hope: Exploring Unusual Microbes to Solve Humanity’s Biggest Challenges",
    date: "2026-08-25",
    time: "6:30 PM – 7:30 PM",
    location: "Telluride Innovation Center, Telluride",
    description: "  This special town talk, presented by Braden Tierney, cofounder and executive director of the Two Frontiers Project extends the season and will be held in town at the Telluride Innovation Center. From hydrothermal vents and volcanic seeps to alpine soils and mine drainage right here in Telluride, Earth’s most unusual ecosystems are home to microscopic life with extraordinary abilities. In this talk, Tierney will share stories from the field and the lab through their team at the Two Frontiers Project. They explore the planet’s microbial diversity in search of “microbial superpowers” that could help tackle pollution, support agriculture, protect ecosystems, and improve human health. With an emphasis on projects ongoing in Colorado, we’ll explore how these invisible ecosystems work, why they matter for everyday life, and how citizen scientists and students can help map this hidden world. …",
    link: "https://telluridescience.org/event/talk-unusual-microbes/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/06/TT0825_320-x-212.jpg",
    sourceLabel: "Telluride Science"
  },
  {
    title: "Mountain Towns 2030: Leveraging a Network of Community Leaders to Accelerate Climate Action",
    date: "2026-09-02",
    time: "6:00 PM – 7:00 PM",
    location: "Telluride Innovation Center, Telluride",
    description: "In collaboration with Telluride Science, Telluride Foundation, Mountain Towns 2030, and Eco Action Partners As climate challenges grow, no community can solve them alone. The most effective solutions often emerge when leaders come together, learn from one another, and take action collectively. And with the window to help solve climate change tightening, speed is essential. Join a conversation with Mountain Towns 20203, alongside community leaders exploring how networks, partnerships, and peer learning are accelerating climate action and resilience efforts in communities of every size – including Telluride and across the surrounding region. Panelists include Jessica Burley, Sustainability Manager for the Town of Breckenridge; John Clark, Mayor of Ridgway, and MT2030 Executive Director Chris Steinkamp. About Mountain Towns 2030: 96% of local leaders cite limited staffing and bandwidth as the number one barrier to climate action. …",
    link: "https://telluridescience.org/event/mountain-towns2030/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/08/MT2030_320x212.jpg",
    sourceLabel: "Telluride Science"
  },
  {
    title: "Telluride Chamber Music and Telluride Science Community Concert",
    date: "2026-09-10",
    time: "6:00 PM – 7:00 PM",
    location: "Telluride Innovation Center, Telluride",
    description: "Join Telluride Science and Telluride Chamber Music for a free community concert on the scenic patio at the Innovation Center. \r\nFeatured musicians:Danny DeSantis (viola), Anne Foxen (violin), Steve White (cell) and Travis Fisher (piano) \r\nAll are welcome—come soak in the beauty of live chamber music in an inspiring setting.",
    link: "https://telluridescience.org/event/community-concert-september/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/07/com_concert-0910_1080x1080.png",
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
    title: "Bilingual Balance in Motion",
    link: "https://koto.org/event/bilingual-balance-in-motion/2026-08-08/",
    description: "Move, breathe, and energize in this dynamic bilingual class, led by Lauren Norton, designed to uplift your body and mind! Blending the strength and flow of Pilates, the rhythm and energy of dance, and the grounding presence of yoga and breathwork, this session will leave you feeling strong, balanced, and revitalized. Open to all levels, this fun and fast-paced class welcomes everyone looking to build strength, flexibility, and mindfulness in a supportive community space. This class is free, but donations for the instructor are welcome.",
    pubDate: "2026-08-08T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/BALANCE.jpg"
  },
  {
    title: "Zumba with Gisela",
    link: "https://koto.org/event/zumba-with-gisela/2026-08-08/",
    description: "Ditch the workout and join the party! Zumba® is a high-energy dance fitness class that mixes low-intensity and high-intensity moves for an interval-style, calorie-burning workout. Driven by Latin and international rhythms like salsa, merengue, reggaeton, and cumbia, you will tone your body and boost your endurance without even realizing how hard you are working. It is exercise in disguise! No dance experience is required—just bring your energy, a water bottle, and a smile. This class is free and open to the public, but donations for the instructor are always welcome. ¡Olvida el entrenamiento y únete a la fiesta! Zumba® es una clase de fitness de baile de alta energía que mezcla movimientos de baja y alta intensidad para un entrenamiento de estilo de intervalos que quema calorías. …",
    pubDate: "2026-08-08T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Movies Under the Stars",
    link: "https://koto.org/event/movies-under-the-stars/2026-08-08/",
    description: "Telluride Mountain Village Owner's Association (TMVOA) presents Movies Under the Stars – FREE family-friendly outdoor movies screenings – every Saturday this summer at Conference Center Plaza! New this summer: Family Happy Hour from 6:30-8:30 p.m.! Enjoy lawn games, sidewalk chalk, a bounce house, face painting and more. Film schedule below: June 13 – Alice in Wonderland (1951) June 20 – Zootopia 2 July 4 – The Sandlot July 11 – Elio July 18 – How to Train Your Dragon (2025) July 25 – GOAT August 1 – Wicked for Good August 8 – Hoppers August 15 – Superman (2025)",
    pubDate: "2026-08-09T00:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Conference Center Plaza Mountain Village",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/MuS_Pstr11x17_2026-1-pdf-1.jpg"
  },
  {
    title: "Pickleball Open Play",
    link: "https://koto.org/event/pickleball-open-play/2026-08-09/",
    description: "Weekly Round Robins Eligibility: Must be rated 2.5+. Requirements: Players should know the rules, scoring, and basic strategy of tennis. Format: Fun, competitive matches with rotating partners each session. Minimum Players: A minimum of 4 players is required for the class to run.",
    pubDate: "2026-08-09T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Drop In Tech Time with Oliver",
    link: "https://koto.org/event/drop-in-tech-time-with-oliver-2/2026-08-09/",
    description: "Drop by the 2nd floor desk for Tech Time with Oliver every Sunday from 1-3pm. Bring your questions about technology (phones, tablets, laptops, email, etc.) or learn about special collections the library offers, such as the Kindles, iPads, and laptops our patrons can check out as well as the library apps you can download to your devices to access free ebooks, audiobooks, movies, music, magazines and more!",
    pubDate: "2026-08-09T19:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Tea and Tarot",
    link: "https://koto.org/event/tea-and-tarot/2026-08-09/",
    description: "Tea and Tarot Sessions with Jade Rose and others from Sanctuary Collective in the Telluride Room. Seating is limited; please sign up at telluridelibrary.org in advance.",
    pubDate: "2026-08-09T20:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/tea-1.jpg"
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-08-10/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-08-10T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Tribal Allyship in Colorado with Ernest House",
    link: "https://koto.org/event/tribal-allyship-in-colorado-with-ernest-house/",
    description: "Join Ernest House, Jr.Senior Policy Director at the Center of Tribal & Indigenous Engagement at the Keystone Policy Center for a conversation on August 10th at 5:30 pm. He will talk about projects like the Colorado Outdoor Strategy Tribal Framework, buffalo restoration in the San Luis Valley, and the building the nation's first tribal embassy in Denver. Ernest House Jr. is an enrolled member of the Ute Mountain Ute Tribe in Towaoc, Colorado, and a leader in Native American affairs. He served as Executive Director of the Colorado Commission of Indian Affairs (CCIA) for 12 years, fostering communication between Colorado’s tribal nations and state agencies, while maintaining government-to-government relations under Governors Owens, Ritter, and Hickenlooper. Currently, as Senior Policy Director and Director for the Center for Tribal and Indigenous Engagement at the Keystone Policy Center, he focuses on tribal consultation, energy, conservation, healthcare, natural resources, and cultural resource management. …",
    pubDate: "2026-08-10T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "DMV2GO",
    link: "https://koto.org/event/dmv2go/2026-08-11/",
    description: "Walk-ins are welcome, but if you'd like to make an appointment, click here: https://www.signupgenius.com/go/10C0B44ACAD29A0FCC25-64804816-dmv2go#/ Please Note, DMV2GO does not offer ANY testing services. RENEW – An existing Colorado Driver License, ID or Permit REPLACE – A lost or stolen Colorado Driver License, ID or Permit FIRST TIME – Colorado Driver License, ID or Permit* OUT OF STATE TRANSFER – Trade in your existing Driver License, ID or Permit for a Colorado one! * *Please visit the DMV website for more information and a list of required documents Bienvenidos sin cita, pero si quieres hacer una cita haga clic aquí. Tenga en cuenta, DMV2GO no ofrece NINGÚN servicio de prueba. …",
    pubDate: "2026-08-11T15:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Telluride Mountain School Open House",
    link: "https://koto.org/event/telluride-mountain-school-open-house-3/",
    description: "Come Curious. Leave Inspired. Meet our new Head of School, connect with our passionate teachers and leadership team, explore our campus, and see firsthand how Telluride’s only independent school is redefining education through meaningful relationships, hands-on learning, and a love of the outdoors.",
    pubDate: "2026-08-11T15:15:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Mountain School",
    imageUrl: ""
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-08-11/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-08-11T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Free Legal Clinic – Clínica Jurídica Gratuita",
    link: "https://koto.org/event/free-legal-clinic-clinica-juridica-gratuita/2026-08-11/",
    description: "A FREE legal clinic for parties who have no attorney. Sign up today because spots are limited. Volunteer attorneys will answer questions, help fill out forms, and explain the process and procedure for legalissues. The volunteer attorneys do not represent you and this clinic is information only. BY APPOINTMENT ONLY. Call 970-728-4519 for more information and to sign up. Una clínica de asesoramiento jurídico GRATUITO para las personas que notienen abogado. Abogados voluntarios responderán a preguntas, ayudarán a llenar formularios y explicarán el proceso y el procedimiento de cuestiones jurídicas. Los abogados voluntarios no te representan y esta clínica es sólo informativa. CON CITA PREVIA. Llame a 970-728-4519 para más información y para registrarse.",
    pubDate: "2026-08-11T22:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Eco-Grief Workshops: Between Grief & Gratitude, love and loss in a changing world",
    link: "https://koto.org/event/eco-grief-workshops-between-grief-gratitude-love-and-loss-in-a-changing-world/2026-08-11/",
    description: "Join Lauren Norton of Through the Woods Doula, Mollie Theis of EcoAction Partners and the Wilkinson Public Library for a four-part series on navigating climate anxiety and eco-grief. The first two sessions will consist of a facilitated community conversation connecting our love of these landscapes with the challenge of the climate crisis at our doorsteps. After exploring our shared relationship with the current reality, the second two sessions will provide opportunities to express pain, grief, love and hope through various mediums including local poetry and group art projects. August 4 8:30 a.m.- 10:00 a.m. Telluride Room August 11 5:30 p.m. – 7 p.m. Telluride Room August 18 8:30 a.m.- 10:00 a.m. Program Room August 25 5:30 p.m. – 7 p.m. Program Room",
    pubDate: "2026-08-11T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/Between-Grief-Gratitude-Updated.webp"
  },
  {
    title: "Telluride Mushroom Festival",
    link: "https://koto.org/event/telluride-mushroom-festival/",
    description: "Telluride Mushroom Festival brings together leading mycologists, artists, foragers and enthusiasts to explore all things fungi. We focus on science, culture, and community, covering topics like psychedelic research, cultivation, decriminalization, and identification. More than just a festival, it is an annual reunion for fungi folks to gather and celebrate fungi and their impact on our world. This year’s theme is “Rewild” and will feature a raft of myco-luminaries including Mark Plotkin, world-renowned ethnobotanist best known for his work with Indigenous peoples of the Amazon and for popularizing the idea that rainforest conservation must center Indigenous knowledge. His book Tales of a Shaman’s Apprentice is still one of the most influential works in the field. …",
    pubDate: "2026-08-12T06:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/02/Untitled-design-scaled.jpg"
  },
  {
    title: "DMV2GO",
    link: "https://koto.org/event/dmv2go/2026-08-12/",
    description: "Walk-ins are welcome, but if you'd like to make an appointment, click here: https://www.signupgenius.com/go/10C0B44ACAD29A0FCC25-64804816-dmv2go#/ Please Note, DMV2GO does not offer ANY testing services. RENEW – An existing Colorado Driver License, ID or Permit REPLACE – A lost or stolen Colorado Driver License, ID or Permit FIRST TIME – Colorado Driver License, ID or Permit* OUT OF STATE TRANSFER – Trade in your existing Driver License, ID or Permit for a Colorado one! * *Please visit the DMV website for more information and a list of required documents Bienvenidos sin cita, pero si quieres hacer una cita haga clic aquí. Tenga en cuenta, DMV2GO no ofrece NINGÚN servicio de prueba. …",
    pubDate: "2026-08-12T15:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-08-12/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-08-12T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Market on the Plaza",
    link: "https://koto.org/event/market-on-the-plaza/2026-08-12/",
    description: "Market on the Plaza is held each Wednesday, June 10 – September 9, 2026, from 11 a.m. to 4 p.m. in Heritage Plaza, the center of Mountain Village. Heritage Plaza is steps from the free gondola. Come enjoy local produce, original artisan creations, kid-friendly goods and more.",
    pubDate: "2026-08-12T17:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Heritage Plaza, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Mahjongg for Independent Players",
    link: "https://koto.org/event/mahjongg-for-independent-players-4/2026-08-12/",
    description: "Looking to enjoy an afternoon of friendly games of mah-jongg for independent players? Join us at the Library every Wednesday from 1-3pm. Bring your 2026 card if you have one, although we have plenty of loaners if you don’t! We’ll have tables, cloths, chairs, and sets. NOTE: This is not a mah-jongg lesson. A general knowledge of the game is necessary to join. Please register in advance at telluridelibrary.org if you'd like to join so we can make sure we have enough tables set up for everyone!",
    pubDate: "2026-08-12T19:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/mahj.jpg"
  },
  {
    title: "Sewing 101 with Melissa",
    link: "https://koto.org/event/sewing-101-with-melissa/2026-08-12/",
    description: "Don't throw away your old clothes just because they have a tiny (or even a large) hole in them! Learn the basics of sewing and mending your clothing with our very own talented seamstress, Melissa Sumpter! Bring your own garment, we'll provide the sewing materials.",
    pubDate: "2026-08-12T23:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/02/sewing.jpg"
  },
  {
    title: "Tennis Clinic | 105 | 3.0+ | Golden Hour",
    link: "https://koto.org/event/tennis-clinic-105-3-0-golden-hour/2026-08-12/",
    description: "Join us for a 105 club takeover on all four courts! 105 scoring preview 1 Point for just winning the point. 5 points for winning the point off a groundstroke winner. 10 points for winning a point off a volley winner. 20 points for winning the point off of an overhead winner. Suitable for levels 3.0+, this game is not only a workout and a ton of fun, but it will improve your tennis game by: Teaching you when to play near the net player. Improve your overall net game. Encourage you to practice being aggressive at the net. Finding a backhand volley. Execute deep lobs.",
    pubDate: "2026-08-12T23:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Sound Bath with Danielle and Ian",
    link: "https://koto.org/event/sound-bath-with-danielle-and-ian/",
    description: "Join us for an hour of traveling through sound and the inner self! In this once a month community event, we are healing the body and auric field with a multitude of sound frequencies. Chimes, 432hz quartz singing bowls, crystal tuning pyramids, rain drums, GALORE! We will also be holding space for group conversation, weaving through topics of spirituality. Bring a blanket, yoga mat, water bottle, journal, and your psycho-spiritual discussion hat! After each sound bath, we will be sticking around for group discussion for a duration of 30 – 40 minutes. Each month will have a different psycho-spiritual topic, and will offer tools to integrate these themes into our daily lives. Join us for this beautiful summer offering! Please sign up in advance! …",
    pubDate: "2026-08-12T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "DMV2GO",
    link: "https://koto.org/event/dmv2go/2026-08-13/",
    description: "Walk-ins are welcome, but if you'd like to make an appointment, click here: https://www.signupgenius.com/go/10C0B44ACAD29A0FCC25-64804816-dmv2go#/ Please Note, DMV2GO does not offer ANY testing services. RENEW – An existing Colorado Driver License, ID or Permit REPLACE – A lost or stolen Colorado Driver License, ID or Permit FIRST TIME – Colorado Driver License, ID or Permit* OUT OF STATE TRANSFER – Trade in your existing Driver License, ID or Permit for a Colorado one! * *Please visit the DMV website for more information and a list of required documents Bienvenidos sin cita, pero si quieres hacer una cita haga clic aquí. Tenga en cuenta, DMV2GO no ofrece NINGÚN servicio de prueba. …",
    pubDate: "2026-08-13T15:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-08-13/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-08-13T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "The Creative Exchange at Telluride Arts HQ",
    link: "https://koto.org/event/the-creative-exchange-at-telluride-arts-hq-2/2026-08-13/",
    description: "The Creative Exchange is a brand-new monthly series by Telluride Arts designed for the artists and creatives who call Telluride home. It’s a space where emerging and established artists gather to share the knowledge, skills, and stories that fuel their work. Think of it as an open source model for creativity—where we learn from each other, swap ideas, and help strengthen one another’s practice. Each session is hosted by local artists and creative leaders who bring their own perspectives, techniques, and creative journeys into the room. Topics may span everything from the business of art and professional development, to creative process, storytelling, collaboration, and the philosophical underpinnings of making art. Whether you’re a full-time working artist, an educator, a student, a maker, or simply someone curious about creative expression, the Creative Exchange is open to you. …",
    pubDate: "2026-08-13T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Arts HQ, TELLURIDE",
    imageUrl: "https://koto.org/wp-content/uploads/2025/12/Screenshot-2025-12-17-at-4.42.32-PM.png"
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-08-14/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-08-14T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Up-off Gymnastics, Dance, and Spanish",
    link: "https://koto.org/event/up-off-gymnastics-dance-and-spanish/2026-08-14/",
    description: "We are a MOBILE family business offering non-competitive Gymnastics, Preschool Spanish, & Dance classes to the San Miguel County area. Tia Uphoff was a competitive gymnast and an instructor for 20+ years, helping children develop balance, flexibility, strength and proper tumbling techniques while using positive reinforcement and encouragement for success. Infant to Age 5 — Padres & Pequenos Class – $10.00 per class This class invites adults & kids to participate in Educational songs, in English & Spanish, with intro to gymnastics. Sign up at any time and get started weekly. Fridays — 11:15-11:40 am @ Lone Cone Library Norwood K to 3rd Grade week Session 8 Week Winter Session $150 for the 8 sessions. Thursdays – 430-530 pm @ Lone Cone Library Norwood For more information and to register: Contact Tia @ liv2danz247@gmail.com or find us on Facebook!",
    pubDate: "2026-08-14T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Lone Cone Library Norwood",
    imageUrl: "https://koto.org/wp-content/uploads/2025/06/Messenger_creation_3FA37E27-C0AC-4E9D-ABF5-592710E68D81.jpeg"
  },
  {
    title: "Ridgway Farmer's Market",
    link: "https://koto.org/event/ridgway-farmers-market/2026-08-14/",
    description: "The Ridgway Farmer's Market takes place every Friday from May 22nd through October 16th! * The August 7th Market will be held onthe 6th* 10 a.m. to 2 p.m. at Hartwell Park in Downtown Ridgway Local Produce | Artisans | Live Music every Last Friday",
    pubDate: "2026-08-14T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Hartwell Park Ridgway",
    imageUrl: ""
  },
  {
    title: "Telluride Farmer's Market",
    link: "https://koto.org/event/telluride-farmers-market/2026-08-14/",
    description: "We are an organic market in the heart of beautiful downtown Telluride, CO. Our 2026 Market is every Friday from May 29 – October 9th! We provide the highest quality produce, animal products, prepared food, and artisans. All of our goods are produced within 100 miles of Telluride, so you can feel good about shopping local. From late May through early October, you can find us on South Oak Street in downtown Telluride selling the best of Southwest Colorado from 10:30am to 3:30pm.",
    pubDate: "2026-08-14T16:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Oak Street Plaza, Telluride",
    imageUrl: ""
  },
  {
    title: "Free Youth Tennis & Pickleball Program",
    link: "https://koto.org/event/free-youth-tennis-pickleball-program-2/2026-08-14/",
    description: "Community Tennis & Pickleball Program This program is available for children ages 8 – 16 to receive free tennis instruction from trained and certified coaches at the Telluride Racquet Club. Goal: This program is designed to reach those who may not be able to participate due to financial constraints. Inclusivity: No one will be turned away based on their ability to pay. No Membership Required. Demo equipment is available at no charge for use during this clinic.",
    pubDate: "2026-08-14T21:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Bilingual Balance in Motion",
    link: "https://koto.org/event/bilingual-balance-in-motion/2026-08-15/",
    description: "Move, breathe, and energize in this dynamic bilingual class, led by Lauren Norton, designed to uplift your body and mind! Blending the strength and flow of Pilates, the rhythm and energy of dance, and the grounding presence of yoga and breathwork, this session will leave you feeling strong, balanced, and revitalized. Open to all levels, this fun and fast-paced class welcomes everyone looking to build strength, flexibility, and mindfulness in a supportive community space. This class is free, but donations for the instructor are welcome.",
    pubDate: "2026-08-15T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/BALANCE.jpg"
  },
  {
    title: "Zumba with Gisela",
    link: "https://koto.org/event/zumba-with-gisela/2026-08-15/",
    description: "Ditch the workout and join the party! Zumba® is a high-energy dance fitness class that mixes low-intensity and high-intensity moves for an interval-style, calorie-burning workout. Driven by Latin and international rhythms like salsa, merengue, reggaeton, and cumbia, you will tone your body and boost your endurance without even realizing how hard you are working. It is exercise in disguise! No dance experience is required—just bring your energy, a water bottle, and a smile. This class is free and open to the public, but donations for the instructor are always welcome. ¡Olvida el entrenamiento y únete a la fiesta! Zumba® es una clase de fitness de baile de alta energía que mezcla movimientos de baja y alta intensidad para un entrenamiento de estilo de intervalos que quema calorías. …",
    pubDate: "2026-08-15T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Studio TAB: Summer Fever",
    link: "https://koto.org/event/studio-tab-summer-fever/",
    description: "Step into the glamour of Studio TAB: Summer Fever and dance the night away in your best Studio 54-inspired sequins, sparkle, and disco flair! Join Telluride AIDS Benefit on Saturday, August 15th, from 6-9 p.m. for an unforgettable evening at a private estate in Aldasoro Ranch overlooking Wilson Peak. Enjoy a curated mini fashion show, delicious heavy hors d'oeuvres, signature cocktails, and an evening of music, celebration, and community—all in support of the Telluride AIDS Benefit. One Night Only Fundraiser Benefitting TAB Mini Fashion Show | Heavy Apps | Cocktails | DJ Only 100 Tickets Available!",
    pubDate: "2026-08-16T00:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Movies Under the Stars",
    link: "https://koto.org/event/movies-under-the-stars/2026-08-15/",
    description: "Telluride Mountain Village Owner's Association (TMVOA) presents Movies Under the Stars – FREE family-friendly outdoor movies screenings – every Saturday this summer at Conference Center Plaza! New this summer: Family Happy Hour from 6:30-8:30 p.m.! Enjoy lawn games, sidewalk chalk, a bounce house, face painting and more. Film schedule below: June 13 – Alice in Wonderland (1951) June 20 – Zootopia 2 July 4 – The Sandlot July 11 – Elio July 18 – How to Train Your Dragon (2025) July 25 – GOAT August 1 – Wicked for Good August 8 – Hoppers August 15 – Superman (2025)",
    pubDate: "2026-08-16T00:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Conference Center Plaza Mountain Village",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/MuS_Pstr11x17_2026-1-pdf-1.jpg"
  },
  {
    title: "Drop In Tech Time with Oliver",
    link: "https://koto.org/event/drop-in-tech-time-with-oliver-2/2026-08-16/",
    description: "Drop by the 2nd floor desk for Tech Time with Oliver every Sunday from 1-3pm. Bring your questions about technology (phones, tablets, laptops, email, etc.) or learn about special collections the library offers, such as the Kindles, iPads, and laptops our patrons can check out as well as the library apps you can download to your devices to access free ebooks, audiobooks, movies, music, magazines and more!",
    pubDate: "2026-08-16T19:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Tea and Tarot",
    link: "https://koto.org/event/tea-and-tarot/2026-08-16/",
    description: "Tea and Tarot Sessions with Jade Rose and others from Sanctuary Collective in the Telluride Room. Seating is limited; please sign up at telluridelibrary.org in advance.",
    pubDate: "2026-08-16T20:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/tea-1.jpg"
  },
  {
    title: "Book Buzz – Free Coffee!",
    link: "https://koto.org/event/book-buzz-free-coffee/",
    description: "Get the scoop on the hottest new titles at the library during Book Buzz! Discover upcoming releases, hidden gems, and staff favorites while enjoying a complimentary handcrafted coffee from Luke of The Pour Over Pedaler. Come sip, socialize, and leave with your next great read!",
    pubDate: "2026-08-17T15:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Birding with Katie Triest at Patagonia Telluride , August 17 and 18",
    link: "https://koto.org/event/birding-with-katie-triest-at-patagonia-telluride-august-17-and-18/2026-08-17/",
    description: "Join us at the Telluride Patagonia store for a bird talk with Local Master Birder, Katie Triest on August 17th at 5 pm. The event is free and open to all ages. Katie will discuss local birds of Telluride and give participants tips on identification for her bird walk the following morning. The bird walk will take place at 8:30 am on August 18th. Meet outside the Telluride Patagonia store. Bring binoculars if you have them. If you don't, they will be provided. The walk is limited to 12 participants. Sign up at Telluride Patagonia or with a QR code provided on local flyers.",
    pubDate: "2026-08-17T23:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Patagonia Telluride, Telluride Retail",
    imageUrl: ""
  },
  {
    title: "Birding with Katie Triest at Patagonia Telluride , August 17 and 18",
    link: "https://koto.org/event/birding-with-katie-triest-at-patagonia-telluride-august-17-and-18/2026-08-18/",
    description: "Join us at the Telluride Patagonia store for a bird talk with Local Master Birder, Katie Triest on August 17th at 5 pm. The event is free and open to all ages. Katie will discuss local birds of Telluride and give participants tips on identification for her bird walk the following morning. The bird walk will take place at 8:30 am on August 18th. Meet outside the Telluride Patagonia store. Bring binoculars if you have them. If you don't, they will be provided. The walk is limited to 12 participants. Sign up at Telluride Patagonia or with a QR code provided on local flyers.",
    pubDate: "2026-08-18T14:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Patagonia Telluride, Telluride Retail",
    imageUrl: ""
  },
  {
    title: "Eco-Grief Workshops: Between Grief & Gratitude, love and loss in a changing world",
    link: "https://koto.org/event/eco-grief-workshops-between-grief-gratitude-love-and-loss-in-a-changing-world/2026-08-18/",
    description: "Join Lauren Norton of Through the Woods Doula, Mollie Theis of EcoAction Partners and the Wilkinson Public Library for a four-part series on navigating climate anxiety and eco-grief. The first two sessions will consist of a facilitated community conversation connecting our love of these landscapes with the challenge of the climate crisis at our doorsteps. After exploring our shared relationship with the current reality, the second two sessions will provide opportunities to express pain, grief, love and hope through various mediums including local poetry and group art projects. August 4 8:30 a.m.- 10:00 a.m. Telluride Room August 11 5:30 p.m. – 7 p.m. Telluride Room August 18 8:30 a.m.- 10:00 a.m. Program Room August 25 5:30 p.m. – 7 p.m. Program Room",
    pubDate: "2026-08-18T14:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/Between-Grief-Gratitude-Updated.webp"
  },
  {
    title: "\"Best Day Ever\" Free Movie Screening",
    link: "https://koto.org/event/best-day-ever-free-movie-screening/",
    description: "Best Day Ever: A Free Community Film Screening Tuesday, August 18, 2026 6:30 PM Telluride Conference Center Free and Open to the Public Join Telluride Adaptive Sports Program (TASP) for a free community screening of Best Day Ever, the Audience Choice Award winner at the 2026 Mountainfilm Festival. Directed by Telluride local Ben Knight, the film is a powerful story about what can happen when a community comes together to build outdoor spaces that welcome everyone. Set in the Green Mountains of Vermont, Best Day Ever follows Greg Durso and Allie Bianchi as they work alongside friends, trail builders, and advocates to create the world’s first fully adaptive mountain bike trail network. Along the way, the film explores how thoughtful trail design, collaboration, and a shared vision can transform not only access to the outdoors, but the experience for every rider. …",
    pubDate: "2026-08-19T00:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Conference Center, Mountain Village",
    imageUrl: "https://koto.org/wp-content/uploads/2026/07/BEST-DAY-EVER.webp"
  },
  {
    title: "Market on the Plaza",
    link: "https://koto.org/event/market-on-the-plaza/2026-08-19/",
    description: "Market on the Plaza is held each Wednesday, June 10 – September 9, 2026, from 11 a.m. to 4 p.m. in Heritage Plaza, the center of Mountain Village. Heritage Plaza is steps from the free gondola. Come enjoy local produce, original artisan creations, kid-friendly goods and more.",
    pubDate: "2026-08-19T17:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Heritage Plaza, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Mahjongg for Independent Players",
    link: "https://koto.org/event/mahjongg-for-independent-players-4/2026-08-19/",
    description: "Looking to enjoy an afternoon of friendly games of mah-jongg for independent players? Join us at the Library every Wednesday from 1-3pm. Bring your 2026 card if you have one, although we have plenty of loaners if you don’t! We’ll have tables, cloths, chairs, and sets. NOTE: This is not a mah-jongg lesson. A general knowledge of the game is necessary to join. Please register in advance at telluridelibrary.org if you'd like to join so we can make sure we have enough tables set up for everyone!",
    pubDate: "2026-08-19T19:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/mahj.jpg"
  },
  {
    title: "Telluride Rotary Club Meeting",
    link: "https://koto.org/event/telluride-rotary-club-meeting-10/",
    description: "Telluride Rotary Club meets Wednesday, August 19, at 6:00 p.m. at the MountainFilm location, 122 S Oak Street, Telluride. Meetings feature guest speakers and discussion of club projects. Anyone with an interest in networking and service is welcome to drop in as a guest. Email telluriderotary@gmail.com for info or to rsvp.",
    pubDate: "2026-08-20T00:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Pilates for All Bodies with Laura",
    link: "https://koto.org/event/pilates-for-all-bodies-with-laura-2/2026-08-20/",
    description: "Join Laura Colbert for Pilates for All Bodies every Thursday from 12:30-1:15pm. This program is free and open to the public. All bodies and experience levels are welcome. The library has a few mats, but bring your own if you can.",
    pubDate: "2026-08-20T18:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Salon Night at Telluride Arts HQ",
    link: "https://koto.org/event/salon-night-at-telluride-arts-hq/2026-08-20/",
    description: "Salon Nights are inspired by the legendary Parisian salons—those lively gatherings where artists, thinkers, and dreamers came together to meet up, debate, collaborate, and inspire. We’re bringing that spirit into the present and rooting it here in Telluride. These are evenings for conversation and connection, not lectures or formal programming. They are casual, open, and intentionally unstructured, designed to create the atmosphere where ideas can collide, new friendships form, and creativity sparks. Imagine an evening where musicians talk with writers, painters meet photographers, filmmakers share stories with ceramicists—and the unexpected happens!",
    pubDate: "2026-08-20T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Arts HQ, TELLURIDE",
    imageUrl: "https://koto.org/wp-content/uploads/2025/12/Screenshot-2025-12-17-at-4.37.19-PM.png"
  }
];

const WILKINSON_EVENTS = [
  {
    title: "Yoga for ALL with Jane & Jay",
    link: "https://telluridelibrary.libcal.com/event/15803452?hs=a",
    description: "8:30 AM – 9:45 AM · Join local instructors Jane del Piero and Jay Holt for a weekly class centered on deep breath work, gentle flow, and energizing chakral movement. Jane and Jay are the owners of local acupuncture, massage, and sound healing practice Luv Light. Donations are accepted. All bodies welcome.",
    pubDate: "2026-08-07T14:30:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Program Room",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/data/feat_img/6460/19928/1715278303.jpg"
  },
  {
    title: "Stuffed Animal Storytime / Pijamada de Peluches",
    link: "https://telluridelibrary.libcal.com/event/17285907?hs=a",
    description: "10:30 AM – 11:30 AM · Wear PJs & bring your stuffy for storytime. *sleepover for stuffed animals only* Ponte la pijama y trae tu peluche para la Hora del Cuento. * Pijamada solo para peluches*",
    pubDate: "2026-08-07T16:30:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Lower Terrace - outdoors",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_07_29_11_07_55.png"
  },
  {
    title: "Manga and Ramen Club",
    link: "https://telluridelibrary.libcal.com/event/17286024?hs=a",
    description: "1:00 PM – 3:00 PM · Join the WPL for Manga and Ramen club. We will eat ramen and do some fun activities about manga/ramen.",
    pubDate: "2026-08-07T19:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Teen Area",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_07_29_11_17_56.png"
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
    title: "Theo Croker - Telluride Jazz Fest After Dark",
    link: "https://www.alibitelluride.com/calendar#eca-event=theo-croker-telluride-jazz-fest-after-dark",
    description: "With trumpeter, vocalist, composer and record producer, Theo Croker, we will beh...",
    pubDate: "2026-08-07",
    time: "10:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/0cb46769-06f4-4294-84d6-a2e85873e599/-/crop/1295x1296/152,0/-/preview/"
  },
  {
    title: "Endea Owens & The Cookout",
    link: "https://www.alibitelluride.com/calendar#eca-event=endea-owens-and-the-cookout",
    description: "Endea Owens is all about jazz. This phenomenal bassist, composer and performer h...",
    pubDate: "2026-08-08",
    time: "10:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/2340e518-38e2-471f-802f-0183b7f67cbb/-/crop/1069x1068/235,0/-/preview/"
  },
  {
    title: "Max & Heather Stalling",
    link: "https://www.alibitelluride.com/calendar#eca-event=max-and-heather-stalling",
    description: "Meet Max & Heather Stalling, a dynamic duo of singer-songwriters from Dallas, Te...",
    pubDate: "2026-08-11",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/2f8a6c97-33f7-43f4-a134-b385a801631a/-/crop/5464x2727/0,1365/-/preview/"
  },
  {
    title: "Banshee Tree w/ Quattlebaum - Telluride Mushroom Festival",
    link: "https://www.alibitelluride.com/calendar#eca-event=banshee-tree-w-quattlebaum-telluride-mushroom-festival",
    description: "Set against the electric backdrop of the Telluride Mushroom Festival—a legendary...",
    pubDate: "2026-08-12",
    time: "7:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/3a7022df-2a89-4430-9639-65f67a9584ce/-/crop/500x500/0,63/-/preview/"
  },
  {
    title: "The Copper Children & Thom LaFond- Telluride Mushroom Fest",
    link: "https://www.alibitelluride.com/calendar#eca-event=the-copper-children-telluride-mushroom-fest",
    description: "The Copper Children are a diverse blend of styles and influences that span from ...",
    pubDate: "2026-08-13",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/dc85c3b0-3a00-458b-946e-3f08cb24a8bc/-/crop/500x500/0,63/-/preview/"
  },
  {
    title: "DJ Jonko X Codestar - Telluride Mushroom Fest",
    link: "https://www.alibitelluride.com/calendar#eca-event=codestar-x-jasper-telluride-mushroom-fest",
    description: "Telluride Mushroom Fest After Party",
    pubDate: "2026-08-14",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/6ad6b1b4-5f1a-4af3-8640-17838213967a/-/crop/500x500/0,52/-/preview/"
  },
  {
    title: "Thom LaFond + DROS",
    link: "https://www.alibitelluride.com/calendar#eca-event=thom-la-fonde-dros-alexander-karvelas",
    description: "Telluride Mushroom Fest Puff Ball After Party",
    pubDate: "2026-08-15",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/7bf79fb4-a715-4cee-b43a-bf4637aec172/-/crop/500x500/0,66/-/preview/"
  },
  {
    title: "Velvet Daydream",
    link: "https://www.alibitelluride.com/calendar#eca-event=velvet-daydream",
    description: "Velvet Daydream, hailing from Denver, is striving to weave the rock n' roll they...",
    pubDate: "2026-08-20",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/4b241e38-d848-429c-b682-edd9e0f0eb6c/-/crop/996x498/0,299/-/preview/"
  },
  {
    title: "Wax Monkey",
    link: "https://www.alibitelluride.com/calendar#eca-event=wax-monkey",
    description: "Wax Monkey is a 5-piece jam band composed of childhood friends hailing from Birm...",
    pubDate: "2026-08-22",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/16f8ae40-6bce-4ecb-8d32-adaabafa3398/-/crop/2304x1153/0,383/-/preview/"
  },
  {
    title: "Ethan Perry",
    link: "https://www.alibitelluride.com/calendar#eca-event=ethan-perry",
    description: "Ethan began his music career in Seattle in 2007, shortly thereafter forming his ...",
    pubDate: "2026-08-23",
    time: "8:30 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/524956fc-c05b-47c9-8c0d-321e86406287/"
  },
  {
    title: "The Last Wild Buffalo w/ Hunter Archer",
    link: "https://www.alibitelluride.com/calendar#eca-event=the-last-wild-buffalo-w-hunter-archer",
    description: "The Last Wild Buffalo is a soulful Americana band from Utah, blending the raw ho...",
    pubDate: "2026-08-25",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/80e2e21e-674b-4121-b683-5081a143cca8/-/crop/1308x1310/67,0/-/preview/"
  },
  {
    title: "RSUN \\\\ MINDSET",
    link: "https://www.alibitelluride.com/calendar#eca-event=rsun-mindset",
    description: "Camp Alderwild After Party. These Shows are sold out, tickets are available on Fan Exchange",
    pubDate: "2026-08-27",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/0793e80b-a99a-4924-a9a8-d6e5b31fed89/-/crop/399x399/0,15/-/preview/"
  },
  {
    title: "MIKEY THUNDER \\\\ BAD SNACKS",
    link: "https://www.alibitelluride.com/calendar#eca-event=rsun-mindset-1",
    description: "Camp Alderwild After Party. These Shows are sold out, tickets are available on Fan Exchange",
    pubDate: "2026-08-28",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/0793e80b-a99a-4924-a9a8-d6e5b31fed89/-/crop/399x399/0,15/-/preview/"
  },
  {
    title: "ESSEKS \\\\ TIEDYE KY",
    link: "https://www.alibitelluride.com/calendar#eca-event=rsun-mindset-2",
    description: "Camp Alderwild After Party. These Shows are sold out, tickets are available on Fan Exchange",
    pubDate: "2026-08-28",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/0793e80b-a99a-4924-a9a8-d6e5b31fed89/-/crop/399x399/0,15/-/preview/"
  },
  {
    title: "Big Blitz",
    link: "https://www.alibitelluride.com/calendar#eca-event=big-blitz",
    description: "Hailing from Pittsburgh, PA, Big Blitz combines dance, jazz, rock, and electroni...",
    pubDate: "2026-08-30",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/d2998c5f-69ce-4db7-bee5-9c0a3e1ded0c/-/crop/2048x1024/0,158/-/preview/"
  },
  {
    title: "Vana Liya w/ Lola Rising",
    link: "https://www.alibitelluride.com/calendar#eca-event=vana-liya-w-lola-rising",
    description: "Genre-busting vocalist and songwriter Vana Liya made a serendipitous arrival o...",
    pubDate: "2026-09-10",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/1550b57f-249f-4e1f-9096-b818dd357f2b/-/crop/1080x540/0,487/-/preview/"
  },
  {
    title: "Photon",
    link: "https://www.alibitelluride.com/calendar#eca-event=photon",
    description: "What started as a passion project dedicated to the late and great Stephen Hawkin...",
    pubDate: "2026-09-24",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/05381074-07b4-41a7-a955-cd6eb787e77e/-/crop/7952x3975/0,0/-/preview/"
  },
  {
    title: "YOPE",
    link: "https://www.alibitelluride.com/calendar#eca-event=yope-1",
    description: "Yope is a Durango, CO based rock/funk/jam/fusion band that has been making waves...",
    pubDate: "2026-09-26",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/edc6f077-88d6-4e3a-abc9-b6b9c482cfcf/-/crop/4032x2017/0,0/-/preview/"
  },
  {
    title: "Ken Gentry & the Companions",
    link: "https://www.alibitelluride.com/calendar#eca-event=ken-gentry-and-the-companions",
    description: "Rooted in the soulful grit of a St. Louis upbringing and refined by the clarity ...",
    pubDate: "2026-10-01",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/5503e0b2-6da7-415a-b118-18a9e65ed3e4/-/crop/816x408/0,37/-/preview/"
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
    title: "Big Love Car Wash: Free Music, SHOW Bar Patio",
    link: "https://sheridanoperahouse.com/events/free-music-at-show-bar-big-love-car-wash/",
    description: "",
    pubDate: "2026-08-05",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2026/06/BigLoveCarWash-2LB24.jpg"
  },
  {
    title: "Telluride Jazz Festival",
    link: "https://sheridanoperahouse.com/events/telluride-jazz-festival/",
    description: "",
    pubDate: "2026-08-07",
    endDate: "2026-08-08",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2026/03/TJF_Vertical__Black.webp"
  },
  {
    title: "Telluride Mushroom Festival",
    link: "https://sheridanoperahouse.com/events/telluride-mushroom-festival/",
    description: "",
    pubDate: "2026-08-13",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2021/07/Mushroom-Fest-Logo.png"
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
    title: "Ridgway Rendezvous 2026 ~ Saturday Live Music Schedule",
    href: "https://sherbino.org/event/saturday-music-lineup-ridgway-rendezvous-arts-festival-august-8-2026/",
    date: "2026-08-08 09:30:00",
    endDate: "2026-08-08 17:00:00",
    location: "Ridgway, CO",
    copy: "@ Ridgway Rendezvous Saturday Live Music Lineup Saturday, August 8, 20269:30 a.m.–5:00 p.m. Location: Hartwell ParkRidgway, Colorado Admission: Free The Sherbino is pleased to help spread the word about a full day of live music presented by our sister organization, Weehawken Creative Arts, during the 41st Annual Ridgway Rendezvous Arts & Crafts Festival. Four incredible bands. One beautiful Saturday. Join us Saturday, August 8, at Hartwell Park for a full day of FREE live music during the Ridgway Rendezvous Arts Festival. 🎶 Heather & Douglas • 9:30–11:00 a.m.🎶 Hard Pressed • 11:30 a.m.–1:00 p.m.🎶 Tom Ward's Downfall • 1:15–2:45 p.m.🎶 Donny Morales • 3:15–5:00 p.m. Pack a chair if you'd like, bring your friends, and spend the day enjoying great music, local artists, food vendors, and everything that makes Ridgway Rendezvous such a special weekend. 🌐 ridgwayrendezvous.com The music is just one part of this beloved annual celebration. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/07/Saturday-RR-Banner-live-music.png"
  },
  {
    title: "Ridgway Rendezvous 2026 ~ Sunday Live Music Schedule",
    href: "https://sherbino.org/event/ridgway-rendezvous-sunday-live-music/",
    date: "2026-08-09 10:00:00",
    endDate: "2026-08-09 16:00:00",
    location: "Ridgway, CO",
    copy: "@ Ridgway Rendezvous Sunday Live Music Lineup Sunday, August 9, 202610:00 a.m.–4:00 p.m. Location: Hartwell ParkRidgway, Colorado Admission: Free The Sherbino is pleased to help spread the word about a full day of live music presented by our sister organization, Weehawken Creative Arts, during the 41st Annual Ridgway Rendezvous Arts & Crafts Festival. Join us in Hartwell Park on Sunday, August 9, for four performances spanning jazz, blues, roots music, Americana, and more. Sunday Music Schedule 10:00–11:30 a.m. — The Ordinary TwoStart the morning with the warm harmonies and acoustic sound of The Ordinary Two. 11:45 a.m.–1:15 p.m. — Mixed Bag JazzEnjoy an energetic midday set from Mixed Bag Jazz, featuring a lively blend of jazz performed by some of the region’s outstanding musicians. 1:30–2:45 p.m. — Donny MoralesDonny takes the stage for an afternoon performance filled with blues, roots music, rock, and plenty of personality. 3:00–4:00 p.m. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/07/Sunday-RR-Banner-live-music.png"
  },
  {
    title: "Monthly Welcome Home Alliance Veteran's Coffee at the Sherbino",
    href: "https://sherbino.org/event/monthly-welcome-home-alliance-veterans-coffee-at-the-sherbino/2026-08-11/",
    date: "2026-08-11 10:00:00",
    endDate: "2026-08-11 12:00:00",
    location: "Ridgway, CO",
    copy: "",
    imageUrl: "https://sherbino.org/wp-content/uploads/2023/01/Vet-Coffee.png",
    description: "The Welcome Home Alliance hosts its monthly veterans coffee gathering at the Sherbino in Ridgway, offering a regular space for local veterans to connect and find community support. It is a recurring meetup held on a monthly basis."
  },
  {
    title: "Celebration of Life for David Leigh Houtz",
    href: "https://sherbino.org/event/celebration-of-life-for-david-leigh-houtz/",
    date: "2026-08-17 15:00:00",
    endDate: "2026-08-17 18:00:00",
    location: "The Sherbino, Ridgway",
    copy: "Celebration of Life for David Leigh Houtz. Friends, family, and the Ridgway community are invited to gather on Monday, August 17, from 3–6 p.m. at The Sherbino to share memories and celebrate David's life. @ 3-6 pm || Sherbino Celebration of Life for David Leigh Houtz David Leigh Houtz was a familiar presence in Ridgway for decades. Many knew him through his jewelry shop and workshop at 147 N. Cora, where he crafted, repaired, and sold jewelry since the 1990s. Others knew him through his years of service as a firefighter, his artistic talents, his independent spirit, and his unmistakable personality. David's daughter and family invite friends, neighbors, former customers, and all who knew him to join them in celebrating his life. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/07/2026-sherb-event-banners-52.png"
  },
  {
    title: "The Courtyard at 610 Presents: Flagship Romance + The Rough & Tumble",
    href: "https://sherbino.org/event/flagship-romance-rough-and-tumble-courtyard-610-august-21/",
    date: "2026-08-21 19:00:00",
    endDate: "2026-08-21 21:15:00",
    location: "The Courtyard at 610, Ridgway",
    copy: "@ Gates: 6:30 || Show: 7:00 || $25 advance / $30 – day of show General Admission Seating || Limited Bar || The Courtyard at 610 is a unique little venue behind our gallery space, the 610 Arts Collective, on Clinton St. The entrance is through the alleyway between N Cora St. and N Laura St behind the gallery and The Sherbino Theater. **Due to the local Gold Mountain Fire – Poor air quality or rain location will be inside on The Sherbino main stage for Courtyard shows** TWO DUOS ON TOUR TOGETHER Rough Romance U.S. Tour 2026 unites Flagship Romance and The Rough & Tumble for a six-month cross-country run of high-energy, harmony-soaked, heart-forward shows. Expect laughter, lump-in-your-throat moments, and a dynamic co-headlining format that turns every venue into a listening room you’ll never forget. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/04/2026-sherb-event-banners-9.jpg"
  },
  {
    title: "Auditions: Rocky Horror Picture Show Live Shadow Cast Edition (Show in Oct.)",
    href: "https://sherbino.org/event/auditions-rocky-horror-picture-show-live-shadow-cast-edition-show-in-oct/",
    date: "2026-08-23 13:00:00",
    endDate: "2026-08-23 15:00:00",
    location: "The Sherbino, Ridgway",
    copy: "@ Rocky Horror Picture Show — Live Shadowcast Edition Auditions · Sunday, August 23 · 1:00 – 3:00 p.m. · The Sherbino (604 Clinton St.) The Sherbino is casting for its live shadowcast production of The Rocky Horror Picture Show! This is your chance to step into the spotlight, don a wild costume, and bring this cult classic to life on stage. What’s a Shadowcast? A shadow cast is a troupe of live performers who act, lip-sync, and dance in front of the movie screen while the film plays. The audience joins the fun with call-backs, props, and dance numbers—creating a mash-up of film, live theater, and interactive party. Since the 1970s, shadowcasts have been the heartbeat of Rocky Horror’s midnight movie legacy, turning every performance into a raucous celebration of freedom, fun, and camp. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/06/RHPS-Shadow-Cast-Auditions.png"
  },
  {
    title: "THE ONLIES",
    href: "https://sherbino.org/event/the-onlies-sherbino-ridgway-august-26/",
    date: "2026-08-26 19:00:00",
    endDate: "2026-08-26 21:00:00",
    location: "The Sherbino, Ridgway",
    copy: "@ August 26 || 6:30 pm doors & Bar || 7:00 pm showtime || seated show || General Admission Tickets:  $28 advance / $32 day of show (some reserved section seats are also available via map above GA tickets as-available). Presented in partnership by The Sherbino with Pickin' Productions The Onlies are a longstanding collective of young friends defining a powerful new generation of stringband music. Described as “the best old-time stringband out there” (Songlines), their music moves with a pulsating drive, sharp arrangements, and rich vibration — it resounds with the present. Multi-instrumentalists and vocalists Sami Braman, Riley Calcagno, and Leo Shannon formed The Onlies in Seattle as young kids, bringing in celebrated guitarist/singer Vivian Leva 10 years later. “ Their fourth album, You Climb The Mountain, marks 20 years as a band. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/04/2026-sherb-event-banners-10.jpg"
  },
  {
    title: "DARRELL SCOTT",
    href: "https://sherbino.org/event/darrell-scott-sherbino-ridgway-august-29/",
    date: "2026-08-29 19:30:00",
    endDate: "2026-08-29 21:00:00",
    location: "The Sherbino, Ridgway",
    copy: "@ SATURDAY || Doors: 7:00 PM || Show: 7:30 PM || Tickets: $30 in advance / $35 Day of Show || Solo Show || Some Reserved Section Seats Available Presented in partnership by The Sherbino with Pickin' Productions About Darrell Scott Darrell Scott is an acclaimed singer, songwriter, and multi-instrumentalist widely regarded as one of the most respected voices in contemporary American roots music. A masterful storyteller with deep roots in country, bluegrass, folk, and Americana, Scott delivers powerful performances where his expressive voice, heartfelt songwriting, and exceptional musicianship takes center stage. Scott’s debut album, Aloha from Nashville, introduced enduring songs that became modern standards, including “You’ll Never Leave Harlan Alive” and “It’s A Great Day To Be Alive.” Across albums including Family Tree, The Invisible Man, Modern Hymns, A Crooked Road, and Long Ride Home, Scott’s songwriting and instrumental artistry have continued to resonate with audiences and fellow musicians alike. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/04/2026-sherb-event-banners-7-e1777594191779.jpg"
  },
  {
    title: "The M Factor, Shredding the Silence on Menopause. Film followed by a panel discussion",
    href: "https://sherbino.org/event/the-m-factor-shredding-the-silence-on-menopause-film-followed-by-a-panel-discussion/",
    date: "2026-09-01 18:30:00",
    endDate: "2026-09-01 20:00:00",
    location: "The Sherbino, Ridgway",
    copy: "The Sherbino presents The M Factor: Shredding the Silence on Menopause on September 1 at 6:30 PM, followed by a panel discussion. @ Doors at 6:00 PM, Film at 6:30 PM followed by a panel discussion led by local specialists in women's health issues Dr. Abigail Seaver, ND; Meg Benasutti, ANP-BC, Jennifer McGeorge, ARNP, CNM, MSCP and Kim Walker, DNP, WHNP. Note: this is a different film from the one we showed back in May, which was about Perimenopause About The M Factor Film Menopause is a silent epidemic that affects the health and well‑being of millions of American women. In addition to experiencing traumatic physical symptoms, women are struggling with the related stresses of billions of dollars in lost wages, upended careers, family disruptions, and emotional chaos. This film confront this neglected crisis, challenges societal and medical shortcomings and advocates for a revolutionary approach to women's health all over the world. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/06/ChatGPT-Image-Jun-23-2026-07_58_16-PM.png"
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
  { title:"Friday Feast", link:"https://www.beacontelluride.com/upcoming-events", description:"Beacon's twice-a-month free home-cooked dinner for lifties and all other seasonal workers.", date:"2026-06-12", time:"6:00 PM", source:"beacon", sourceLabel:"Beacon", category:"Community Event", location:"The Well Coffee Shop, Telluride", imageUrl:"https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp" },
  { title:"Friday Feast", link:"https://www.beacontelluride.com/upcoming-events", description:"Beacon's twice-a-month free home-cooked dinner for lifties and all other seasonal workers.", date:"2026-07-10", time:"6:00 PM", source:"beacon", sourceLabel:"Beacon", category:"Community Event", location:"The Well Coffee Shop, Telluride", imageUrl:"https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp" },
  { title:"Young Adult Gathering", link:"https://www.beacontelluride.com/upcoming-events", description:"Beacon's weekly gathering for seasonal and young-adult workers — food, conversation, and Bible study.", date:"2026-06-16", time:"6:00 PM", source:"beacon", sourceLabel:"Beacon", category:"Community Event", location:"The Well, 122 S Aspen St, Telluride", imageUrl:"https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp" },
  { title:"Young Adult Gathering", link:"https://www.beacontelluride.com/upcoming-events", description:"Beacon's weekly gathering for seasonal and young-adult workers — food, conversation, and Bible study.", date:"2026-06-23", time:"6:00 PM", source:"beacon", sourceLabel:"Beacon", category:"Community Event", location:"The Well, 122 S Aspen St, Telluride", imageUrl:"https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp" },
  { title:"Young Adult Gathering", link:"https://www.beacontelluride.com/upcoming-events", description:"Beacon's weekly gathering for seasonal and young-adult workers — food, conversation, and Bible study.", date:"2026-06-30", time:"6:00 PM", source:"beacon", sourceLabel:"Beacon", category:"Community Event", location:"The Well, 122 S Aspen St, Telluride", imageUrl:"https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp" },
  { title:"Pickleball Night", link:"https://www.beacontelluride.com/upcoming-events", description:"Beacon's weekly pickleball night — no experience necessary, all supplies provided.", date:"2026-06-11", time:"7:00 – 9:00 PM", source:"beacon", sourceLabel:"Beacon", category:"Community Event", location:"Telluride Racket Club", imageUrl:"https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp" },
  { title:"Pickleball Night", link:"https://www.beacontelluride.com/upcoming-events", description:"Beacon's weekly pickleball night — no experience necessary, all supplies provided.", date:"2026-06-18", time:"7:00 – 9:00 PM", source:"beacon", sourceLabel:"Beacon", category:"Community Event", location:"Telluride Racket Club", imageUrl:"https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp" },
  { title:"Pickleball Night", link:"https://www.beacontelluride.com/upcoming-events", description:"Beacon's weekly pickleball night — no experience necessary, all supplies provided.", date:"2026-06-25", time:"7:00 – 9:00 PM", source:"beacon", sourceLabel:"Beacon", category:"Community Event", location:"Telluride Racket Club", imageUrl:"https://livabletelluride.org/logo/Telluride%20-%20Beacon.webp" },
];


// Telluride Chamber Music concerts (telluridechambermusic.org/events).
// Bot-refreshed by the chamber-music-events-refresh scheduled task.
const CHAMBER_MUSIC_EVENTS = [
  { title:"Resonance & Romance", link:"https://telluridechambermusic.org/concert/romance", description:"A summer chamber music concert presented by Telluride Chamber Music.", date:"2026-06-28", time:"6:00 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Telluride", imageUrl:"https://telluridechambermusic.org/concerts/romance.webp" },
  { title:"Frame Drum Workshop", link:"https://telluridechambermusic.org/concert/frame-drum", description:"A frame drum workshop presented by Telluride Chamber Music.", date:"2026-06-29", time:"5:30 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Telluride", imageUrl:"https://telluridechambermusic.org/concerts/frame-drum.webp" },
  { title:"Local Artists Night", link:"https://telluridechambermusic.org/concert/local-artists-night", description:"An evening showcasing local artists, presented by Telluride Chamber Music.", date:"2026-06-30", time:"6:00 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Telluride", imageUrl:"https://telluridechambermusic.org/concerts/local-artists-night.webp" },
  { title:"From the Music Room — A Trip Down Memory Lane", link:"https://telluridechambermusic.org/concert/music-room", description:"A chamber music concert presented by Telluride Chamber Music.", date:"2026-07-02", time:"6:00 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Telluride", imageUrl:"https://telluridechambermusic.org/concerts/music-room.webp" },
  { title:"Braided Traditions — A Festival of Cultural Roots", link:"https://telluridechambermusic.org/concert/braided", description:"A festival concert celebrating cultural roots, presented by Telluride Chamber Music.", date:"2026-07-05", time:"3:00 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Telluride", imageUrl:"https://telluridechambermusic.org/concerts/braided.webp" },
  { title:"Chill with Chamber Music! — Norwood", link:"https://telluridechambermusic.org/concert/norwood-jul", description:"A relaxed chamber music concert in Norwood, presented by Telluride Chamber Music.", date:"2026-07-23", time:"6:00 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Norwood", imageUrl:"https://telluridechambermusic.org/concerts/norwood-jul.webp" },
  { title:"The Brass Family — Kids' Concert", link:"https://telluridechambermusic.org/concert/brass-family", description:"A family-friendly kids' concert presented by Telluride Chamber Music.", date:"2026-07-31", time:"11:00 AM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Telluride", imageUrl:"https://telluridechambermusic.org/concerts/brass-family.webp" },
  { title:"New York Philharmonic Principal Brass Quintet", link:"https://telluridechambermusic.org/concert/ny-phil", description:"A concert by the New York Philharmonic Principal Brass Quintet, presented by Telluride Chamber Music.", date:"2026-07-31", time:"7:00 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Telluride", imageUrl:"https://telluridechambermusic.org/concerts/ny-phil.webp" },
  { title:"Telluride Community Concert — August", link:"https://telluridechambermusic.org/concert/community-aug", description:"A community concert presented by Telluride Chamber Music.", date:"2026-08-13", time:"6:00 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Telluride", imageUrl:"https://telluridechambermusic.org/concerts/community-aug.webp" },
  { title:"Chill with Chamber Music! — Norwood", link:"https://telluridechambermusic.org/concert/norwood-aug", description:"A relaxed chamber music concert in Norwood, presented by Telluride Chamber Music.", date:"2026-08-27", time:"6:00 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Norwood", imageUrl:"https://telluridechambermusic.org/concerts/norwood-aug.webp" },
  { title:"Telluride Community Concert — September", link:"https://telluridechambermusic.org/concert/community-sep", description:"A community concert presented by Telluride Chamber Music.", date:"2026-09-10", time:"6:00 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Telluride", imageUrl:"https://telluridechambermusic.org/concerts/community-sep.webp" },
  { title:"Balourdet Quartet", link:"https://telluridechambermusic.org/concert/balourdet", description:"A concert by the Balourdet Quartet, presented by Telluride Chamber Music.", date:"2026-09-13", time:"7:00 PM", source:"chamber-music", sourceLabel:"Telluride Chamber Music", category:"Concert", location:"Telluride", imageUrl:"https://telluridechambermusic.org/concerts/balourdet.webp" },
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
    title: "Community Meeting - Flooding, Economic Impacts, and Community Resilience",
    link: "https://ouraycountyco.gov/Calendar.aspx?EID=3775",
    description: "Two or more Ouray County Commissioners may attend and participate in this event. https://ouraycountyco.gov/calendar.aspx?EID=3775",
    pubDate: "2026-08-11T18:00:00.000Z",
    source: "ouraycounty",
    sourceLabel: "Ouray County",
    category: "Community Event",
    location: "Ouray Community Center - 320 6th Avenue Ouray CO 81427",
    imageUrl: ""
  }
];

const OURAY_RIDGWAY_EVENTS = [
  {
    title: "Fall Registration is NOW OPEN",
    link: "https://events.ourayridgwayevents.com/event/fall-registration-is-now-open-at-weehawken-creative-arts",
    description: "Whether your child dreams of dancing across the stage, flying through the air on silks, mastering hip hop, ballet, jazz, tap, acro, or finding a place where they truly belong—we have a class for them. **Celebrating 19 Years of Weehawken Dance!** Join hundreds of students from across the region in a program that builds confidence, friendships, creativity, community and lifelong memories. Weehawken offers Dance (ballet, tap, jazz, lyrical, west african & more!) Aerial (silks & lyra) Acro Performance Opportunities -- all youth students will perform in THE NUTCRACKER in December in Montrose! Ages 3 through Adult Montrose • Ridgway • Ouray Don't wait—many classes fill quickly! **Registration is now open! **dance.weehawkenarts.org** View on site | Email this event",
    pubDate: "2026-08-07T06:00:00.000Z",
    endDate: "2026-08-23",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Dance & Aerial!",
    imageUrl: "https://localist-images.azureedge.net/photos/53483716128682/huge/d746bb45a4863fae593b7f212e308bf06efa29c5.jpg"
  },
  {
    title: "On Display: PAWS for Art Gallery Asian-themed show",
    link: "https://events.ourayridgwayevents.com/event/paws-for-art-gallery-asian-themed-show",
    description: "Our gallery across the parking lot from the Second Chance Thriftshop is featuring an Asian-themed art show through August. Stop by to see the variety and quality of our offerings! View on site | Email this event",
    pubDate: "2026-08-07T16:00:00.000Z",
    endDate: "2026-08-31",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Second Chance PAWS for Art Gallery",
    imageUrl: "https://localist-images.azureedge.net/photos/53621678601741/huge/19c8fd1126bf67093819de3139e06e71a7d0cf8d.jpg"
  },
  {
    title: "On Display: The 610 Arts Annual Photography Invitational ~ featuring works by Gary Slane & Eric Phillips",
    link: "https://events.ourayridgwayevents.com/event/Ongoing-610-arts-annual-photography-invitational-featuring-works-by-gary-slane-eric-phillips",
    description: "Photography Invitational featuring Gary Slane and Eric Phillips On display July 1 – August 28, 2026 Artist Reception: Friday, July 10 | 5:00–7:00 PM | Free! The 610 Arts Collective is pleased to present the Photography Invitational, featuring the work of Gary Slane of Montrose and Eric Phillips of Colorado’s Gunnison Valley. This special exhibition showcases two accomplished photographers whose distinct artistic perspectives celebrate the beauty, power, and wonder of the natural world. Join us for an Artist Reception on Friday, July 10, from 5:00–7:00 PM, where guests will have the opportunity to meet the artists, learn about their creative processes, and enjoy an evening surrounded by extraordinary imagery from across the American West and beyond. Gary Slane Montrose photographer Gary Slane has devoted years to capturing breathtaking landscapes, wildlife, and night skies throughout North America. …",
    pubDate: "2026-08-07T16:00:00.000Z",
    endDate: "2026-08-28",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The 610 Arts Collective",
    imageUrl: "https://localist-images.azureedge.net/photos/53311891403836/huge/5ed79c16e243d3edcc6923539da943575df4cc1b.jpg"
  },
  {
    title: "Paw Prints Book Club",
    link: "https://events.ourayridgwayevents.com/event/paw-prints-book-club",
    description: "Join us in Ouray Library from 1:00 pm to 2:00 pm for the new Paw Prints Book Club! This is an animal themed graphic novel book club ran by a kid, for kids. There will be four book club meetings over 4 weeks, where there will be discussion on a different graphic novel each week. This book club is open to all ages, but the reading level is from 8 to 12 years old. To sign up and reserve a book, please email programsouraypl@gmail.com View on site | Email this event",
    pubDate: "2026-08-07T19:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Public Library",
    imageUrl: "https://localist-images.azureedge.net/photos/53198530879947/huge/403c155aa2c93ade83d633e106dcb10f0e69f9d8.jpg"
  },
  {
    title: "The Crawdaddy Diaries: Crawfishing 101 - Ridgway State Park Summer Program Series",
    link: "https://events.ourayridgwayevents.com/event/the-crawdaddy-diaries-crawfishing-101-ridgway-state-park-summer-program-series",
    description: "Get ready to splash into the secret world hiding just beneath the surface! Join Park Naturalist Shelby Martinez at the Pa-Co-Chu-Puk Ponds for a hands-on adventure exploring the fascinating lives of crawfish: the hidden creatures at the bottom of the pond. They are the ultimate freshwater survivors, the cleanup crew of our wetlands, and expert underwater architects. In this interactive program, we will lift up the rocks, peer into the shallows, and dive into how these incredible crustaceans eat, build, and keep our pond ecosystems healthy. Best of all, you will get to try your hand at safely catching some local crawfish yourself! View on site | Email this event",
    pubDate: "2026-08-07T19:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway State Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53454939598506/huge/cdf1531947b7f763f759fb4b8cdf5f6619f36bc9.jpg"
  },
  {
    title: "True Grit Historic Walking Tours",
    link: "https://events.ourayridgwayevents.com/event/true-grit-tours",
    description: "Walk in the footsteps of John Wayne and Kim Darby as you explore downtown Ridgway with a trained guide to discover the fascinating behind-the-scenes story of the filming of the original True Grit movie in 1968. Many of the buildings seen in the movie are still in place. John Wayne won his only Oscar for his portrail of Marshal Rooster Cogburn. Offered every Friday at 3 pm in June, July and August. Additional tours are offered at 10am Mondays and 3 pm Wednesdays in July. Meet at the Hartwell Park gazebo 15 minutes before tours begin. FREE. Tours last about an hour. In 2022, this tour was recognized nationally when it was named the reader's choice for best historic town tour by True West magazine. For more information see the website: TrueGritTours.org or on facebook: True Grit Tours. …",
    pubDate: "2026-08-07T21:00:00.000Z",
    endDate: "2026-08-28",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Hartwell Park",
    imageUrl: "https://localist-images.azureedge.net/photos/52285883190282/huge/99283c09e34ca5aeabd7006cca2ba5b2b28899c3.jpg"
  },
  {
    title: "RED MOUNTAIN REVIVAL",
    link: "https://events.ourayridgwayevents.com/event/jack-haight-5810",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-08-07T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "First Friday Art Walk",
    link: "https://events.ourayridgwayevents.com/event/first-friday-art-walk",
    description: "Discover new work, celebrate openings, and connect with artists at the First Friday Art Walk in downtown Ridgway. Each month, galleries, studios and retail spaces throw open their doors for receptions, pop-up exhibits, live music and special programming — perfect for art lovers and casual browsers alike. NEW! 🎨🛍️ Shop local. Win local. Celebrate local. 🎶🍷 New this summer, your First Friday stroll through Ridgway could score you a $100 gift card to your favorite local business. 👀 Follow the link for more details. First Friday Map & Offer Details View on site | Email this event",
    pubDate: "2026-08-07T23:00:00.000Z",
    endDate: "2026-10-02",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Downtown Ridgway, CO",
    imageUrl: "https://localist-images.azureedge.net/photos/52941247100302/huge/24aa8ce412f9817ce04becd51e5d1cc5b8db2cad.jpg"
  },
  {
    title: "First Friday Reception - Roots and Rhythms",
    link: "https://events.ourayridgwayevents.com/event/first-friday-reception-roots-and-rhythms",
    description: "Roots & Rhythms returns for a second reception celebrating this collaborative exhibition. Join us for an exciting evening featuring live music with T-Bone, the artists present, and an interactive art experience. Roots & Rhythms features mixed media paintings by Julia Reid and bentwood sculptures by Ethan Wortis. Through layered textures, organic forms, and expressive movement, the exhibition explores the connection between memory and transformation—rooted in what came before, flowing toward what is possible. The exhibition remains on view until August 31st, with gallery hours Monday–Wednesday and Friday, 9 a.m.–4 p.m.st View on site | Email this event",
    pubDate: "2026-08-07T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Space to Create Gallery",
    imageUrl: "https://localist-images.azureedge.net/photos/53621931741575/huge/c986c6fd0e2d747d8f8d9617a4b544d0dad533ee.jpg"
  },
  {
    title: "First Friday at Rootwings Art at Rootwings Art",
    link: "https://events.ourayridgwayevents.com/event/first-friday-at-rootwings-art-1540",
    description: "Rootwings Art will be open for Ridgway's First Friday Art Walk, featuring local ceramic sculptures and large vessels by artist Andy Nasisse, original oils by Emma Kalff, Bruce Backer's Ravens & Crows, Taos artist Fred Burns fantasy nudes and one of a kind jewelry and ceramics by Vanessa Backer. View on site | Email this event",
    pubDate: "2026-08-07T23:00:00.000Z",
    endDate: "2026-10-02",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Herran House",
    imageUrl: "https://localist-images.azureedge.net/photos/53312391289791/huge/00a6a9e1834a357256b5925d35f6a6525ff06493.jpg"
  },
  {
    title: "First Friday: Silverton, Interpreted",
    link: "https://events.ourayridgwayevents.com/event/copy-of-silverton-interpreted",
    description: "Join us for the closing reception of Silverton Interpreted during Ridgway First Friday! This traveling show features a selection of artists from The 9318 Collective whose work reflects the beauty, energy, and elemental character of the San Juan Mountains and the lands that surround them. Through varied styles and mediums, the exhibition offers multiple perspectives on a shared place, celebrating the artistic dialogue between land and maker. View on site | Email this event",
    pubDate: "2026-08-07T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53047134482853/huge/29f47320cc40fddf16a0212cb4f823f1953adc4e.jpg"
  },
  {
    title: "Old Man Polly & Natalie Heller at Fabula for First Friday!",
    link: "https://events.ourayridgwayevents.com/event/old-man-polly-natalie-heller-at-fabula-for-first-friday",
    description: "Music, mountains, and a little First Friday magic are coming to Fabula! Old Man Polly will bring high-energy vocals and a genre-spanning mix of familiar songs, drawing from both contemporary and traditional music. Led by powerhouse vocalist Polly Kroger—whose style calls to mind Janis Joplin, Amy Winehouse, and Karen O—this is a performance made for singing along. Fabula will also feature local photographer Natalie Heller, whose work celebrates the mountains and Western lifestyle of Southwest Colorado. Natalie is the creator of the award-winning coffee-table book SWC Southwest Colorado, and her photography is shown throughout Ouray County. Visiting artists in town for the Ridgway Arts Rendezvous are especially welcome to stop by, mingle, and kick off the weekend before the big event! Stop by Fabula this First Friday for live music, local art, and plenty of Ridgway energy! View on site | Email this event",
    pubDate: "2026-08-07T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Fabula",
    imageUrl: "https://localist-images.azureedge.net/photos/53427873595934/huge/e8c4d0f511d41ca1fb1cab0e28187e4cfb436345.jpg"
  },
  {
    title: "Steps Tavern Presents Karaoke Night",
    link: "https://events.ourayridgwayevents.com/event/steps-tavern-presents-karaoke-night",
    description: "Step's Tavern Presents Karaoke Night. Doors Open at 8:00 PM Every Friday Night View on site | Email this event",
    pubDate: "2026-08-08T02:00:00.000Z",
    endDate: "2026-09-26",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "STEPS TAVERN",
    imageUrl: "https://localist-images.azureedge.net/photos/53142698527493/huge/db3a6ef58a79b18eea8c70a4d583bbf3d9498404.jpg"
  },
  {
    title: "Happy Little Trees: Painting Class",
    link: "https://events.ourayridgwayevents.com/event/happy-little-trees-painting-class",
    description: "\"QUIET WOODS\" Join Emma Kalff for a morning of coffee and painting at the Wright Opera House Community Room. Participants will follow along with a classic Bob Ross episode and create their own Bob Ross–style landscape painting. All supplies are included, and no prior painting experience is necessary. Just bring your curiosity and enjoy a relaxed, creative morning inspired by the joy of painting. View on site | Email this event",
    pubDate: "2026-08-08T10:30:30.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53629793305718/huge/54c3153d4a8aa3d414529babdd589f3da27b481d.jpg"
  },
  {
    title: "Annual Ridgway Fire Department Pancake Breakfast",
    link: "https://events.ourayridgwayevents.com/event/annual-ridgway-fire-department-pancake-breakfast",
    description: "Saturday, August 8 and Sunday, August 9 from 7:30am to 10:30am, come support your local firefighters at their Annual Pancake Breakfast Fundraiser. Includes pancakes, sausage, eggs, coffee & juice. $10 Adults, $5 Children or $25 for the family. Best Breakfast, Best Prices, Best Cooks in Town (at least for the weekend)! View on site | Email this event",
    pubDate: "2026-08-08T13:30:00.000Z",
    endDate: "2026-08-09",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway Fire House",
    imageUrl: "https://localist-images.azureedge.net/photos/53631321088580/huge/1e3b4e247e16202b8851a99ceb9ede86f5dee60e.jpg"
  },
  {
    title: "Electric Showcase",
    link: "https://events.ourayridgwayevents.com/event/electric-showcase",
    description: "Experience electrification hands on! Visit the Electric Showcase booth at the southeast corner of the Ridgway Rendezvous. Check out electric yard equipmentLearn about financial incentivevsDiscover how you can win an E-Bike with SMPA! Presented by : The Town of Ridgway and the Ridgway Sustainability Advisory BoardEcoAction PartnersClean Energy Economy for the Region (CLEER) San Miguel Power Association (SMPA) View on site | Email this event",
    pubDate: "2026-08-08T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Hartwell Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53443481081189/huge/1c29ff615fd2208e8a6eab9017bb24268cd815b5.jpg"
  },
  {
    title: "Saturday Yoga",
    link: "https://events.ourayridgwayevents.com/event/saturday-yoga",
    description: "Zen Mountain Yoga is a carefully designed yoga class created to move your mind, body, and spirit through a series of seated and standing yoga poses. Yoga props are used to facilitate deeper movement for a richer stretch environment, designed to increase flexibility, balance, and range of movement. Restorative breathing exercises, neurogenic brain training, and guided relaxation will promote stress reduction and mental clarity. Zen out in as we explore the eight limbs of yoga through your dosha awareness, and bring the mountain home to your heart. Appropriate for beginner to advanced. ***Please visit studioouray.com in case of inclement weather or class cancellation.***Please bring a yoga mat, sun protection, and water.*** $10.00 outside until Labor Day. Drop-indoors after labor day $20.00. View on site | Email this event",
    pubDate: "2026-08-08T15:00:00.000Z",
    endDate: "2026-08-29",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Fellin Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53233830352657/huge/0d1cbbdf672690b660591a1d6fa1c311b49b04ef.jpg"
  },
  {
    title: "The 41st Annual Ridgway Rendezvous Arts Festival",
    link: "https://events.ourayridgwayevents.com/event/the-42nd-annual-ridgway-rendezvous-arts-festival",
    description: "Ridgway Rendezvous Arts Festival (41st Annual) Saturday: 9 AM – 5 PM | Sunday: 10 AM – 4 PM | Ridgway Town Park Free Admission Celebrating its 41st year, the Ridgway Rendezvous Arts Festival is a beloved summer tradition in southwest Colorado. Hosted by Weehawken Creative Arts, this highly regarded juried festival is known for exceptional craftsmanship, original design, and high-quality handmade work not easily found elsewhere in the region. Artists consistently call it “one of the best shows of the year,” citing strong sales and a welcoming, well-organized atmosphere. Set in the heart of Ridgway along the scenic Million Dollar Highway, the festival attracts an engaged audience of collectors, second homeowners, and visitors from across the country—and coincides with the nearby Telluride Jazz Festival, expanding its reach and energy. Enjoy live music throughout the day both days, featuring a diverse lineup of talented regional and touring musicians. …",
    pubDate: "2026-08-08T15:00:00.000Z",
    endDate: "2026-08-09",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Hartwell Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53604939799289/huge/9d342ef941735ff72dd4a24d0df58e12a8e49027.jpg"
  },
  {
    title: "The Hummingbird’s Secret Mission - Ridgway State Park Summer Program Series",
    link: "https://events.ourayridgwayevents.com/event/the-hummingbirds-secret-mission-ridgway-state-park-summer-program-series",
    description: "Come explore the astonishing world of nature's smallest high-performance pilots. Led by experts from the Black Canyon Audubon Society, this program reveals the \"superpowers\" behind the hummingbird’s impossible flight patterns and epic seasonal migrations. You will learn to identify local species during their peak summer activity and discover the native plants that fuel their high-speed survival. Whether you are a dedicated birdwatcher or a family looking for a magical morning in the park, this event offers a front-row seat to the aerial acrobatics of these shimmering \"flying gems\". View on site | Email this event",
    pubDate: "2026-08-08T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway State Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53454953293581/huge/2ed5e2f2553f1fe9c9d5f804b87b8743269c7c9d.jpg"
  },
  {
    title: "SATURDAY Live Music at the Ridgway Rendezvous Arts Fest",
    link: "https://events.ourayridgwayevents.com/event/saturday-live-music-at-the-ridgway-rendezvous-arts-fest",
    description: "Ridgway Rendezvous Saturday Live Music Lineup Saturday, August 8, 2026 9:30 a.m.–5:00 p.m. Location: Hartwell Park Ridgway, Colorado Admission: Free The Sherbino is pleased to help spread the word about a full day of live music presented by our sister organization, Weehawken Creative Arts, during the 41st Annual Ridgway Rendezvous Arts & Crafts Festival. Four incredible bands. One beautiful Saturday. Join us Saturday, August 8, at Hartwell Park for a full day of FREE live music during the Ridgway Rendezvous Arts Festival. Heather & Douglas • 9:30–11:00 a.m. Hard Pressed • 11:30 a.m.–1:00 p.m. Tom Ward’s Downfall • 1:15–2:45 p.m. Donny Morales • 3:15–5:00 p.m. Pack a chair if you’d like, bring your friends, and spend the day enjoying great music, local artists, food vendors, and everything that makes Ridgway Rendezvous such a special weekend. ridgwayrendezvous.com The music is just one part of this beloved annual celebration. …",
    pubDate: "2026-08-08T15:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Hartwell Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53551169184729/huge/d363a60ec963787455148228afd09f3fa3ffcb7f.jpg"
  },
  {
    title: "Dallas Park Cemetery Tour",
    link: "https://events.ourayridgwayevents.com/event/dallas-park-cemetery-tour",
    description: "Tour of Dallas Park Cemetery Tour, led by Coleen McElroy. $20.00 Per Person. $15.00 OCHS Members. Call 970-325-4576 to RSVP/Pre Pay View on site | Email this event",
    pubDate: "2026-08-08T16:00:00.000Z",
    endDate: "2026-09-12",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Dallas Park Cemetery",
    imageUrl: "https://localist-images.azureedge.net/photos/52462667793124/huge/857907efd93056a1ba298d906bd6d5231a5f9d13.jpg"
  },
  {
    title: "Used Book Sale",
    link: "https://events.ourayridgwayevents.com/event/used-book-sale",
    description: "Used Book Sale hosted by Friends of the Ridgway Library on Saturday August 8th, 10am-2pm. Tote bags and t-shirts will be available for purchase. Want to volunteer? Sign up at the Ridgway Library front desk. Have books to donate? Call: 970-626-5252 View on site | Email this event",
    pubDate: "2026-08-08T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway Public Library",
    imageUrl: "https://localist-images.azureedge.net/photos/53444356689862/huge/ac92e28117fe69a241a729e8065ab23d70be8daf.jpg"
  },
  {
    title: "Electric Vehicle (EV) Ride and Drive",
    link: "https://events.ourayridgwayevents.com/event/electric-vehicle-ev-ride-and-drive",
    description: "Electric Vehicle (EV) Ride and Drive: Test drive an electric vehicleTest ride the latest e-bike technologyEat a grilled cheese powered by an EVFree train rides!And make sure to head over to the Electric Showcase booth in the southeast corner of Hartwell Park from 9am to 5pm. You can check out and try electric yard equipment and learn about financial incentives. Also learn how you can win an E-bike from San Miguel Power Association. View on site | Email this event",
    pubDate: "2026-08-08T17:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway Railroad Museum",
    imageUrl: "https://localist-images.azureedge.net/photos/53444478649232/huge/46383f7cbeab4425648f3e6bf6e4e504e8371d0c.jpg"
  },
  {
    title: "Flash Tattoo Pop-Up Fundraiser",
    link: "https://events.ourayridgwayevents.com/event/flash-tattoo-pop-up-fundraiser",
    description: "Hello, Library Lovers! We are so excited to announce our second annual Tattoo Pop-up Fundraiser on Saturday, August 8 starting at 12:00 p.m. and on Sunday, August 9 starting at 10:00 a.m. Come early to get added to the list! Mark your calendars for this weekend event! We hope to see you there! View on site | Email this event",
    pubDate: "2026-08-08T18:00:00.000Z",
    endDate: "2026-08-09",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Public Library",
    imageUrl: "https://localist-images.azureedge.net/photos/53506206584416/huge/5c0910190bcc815b3556542e2cfda2027272d8bf.jpg"
  },
  {
    title: "Ouray: Echoes in the Canyon",
    link: "https://events.ourayridgwayevents.com/event/ouray-echoes-in-the-canyon-8419",
    description: "Ouray: Echoes in the Canyon returns to the Wright Opera House for some additional screenings. Presented by Photonic Media and produced in cooperation with the City of Ouray 150th Committee, the documentary explores the people, history, landscapes, and enduring spirit that helped shape what many still call \"The Gem of the Rockies.\" Through storytelling, archival perspective, aerial cinematography, and local voices, the film traces the layered history of Ouray and the individuals who built a mountain community that continues to evolve while remaining deeply connected to its frontier roots. The film features aerial photography by Ouray By Flight, cinematography by Levi Kramer, and is produced and directed by Hank Braxtan. We are offering a \"pay what you can\" for your ticket - $5, $10 and $15. Pick the amount that fees \"Wright\" to you. Thank you for your support! …",
    pubDate: "2026-08-08T19:00:43.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53629792783415/huge/87e789cb56363301409b7496f25a25cdfd62ef58.jpg"
  },
  {
    title: "Floating Lotus Brewery 2 Year Anniversary Celebration",
    link: "https://events.ourayridgwayevents.com/event/floating-lotus-brewery-2-year-anniversary-celebration",
    description: "Free celebration · All ages · Live music 6–10 p.m. Floating Lotus Brewery · Outdoor and indoor stages Here’s to two years in business! Join us on Saturday, August 8, 2026, for an all-day celebration featuring food and drink specials, live music, cornhole, giveaways, and plenty more. One-Day Food Special We’ve partnered with Taqueria Alonzo to offer a pint and an entrée for just $16. Choose any pint and pair it with an order of the taqueria’s new fish tacos. This anniversary special will be available all day, for one day only, while supplies last. Live Music Our good friend TBP Joe returns from Fruita to perform on the outdoor stage from 6–8 p.m. Afterward, Sean Universe and DJ Photon will take over the indoor stage with an EDM set that continues late into the night. …",
    pubDate: "2026-08-08T20:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/53603888943583/huge/4dd2b97b517c8a564d3e0267ae9c3926e7e803ac.jpg"
  },
  {
    title: "Vibrant Music + Dance",
    link: "https://events.ourayridgwayevents.com/event/vibrant-music-dance",
    description: "Vibrant returns to Ouray! Live music (rock, blues, and more!), dance beats, flow dance artists, food, beer from the Ouray Mountain Air Music Series nonprofit, live painters, arts and crafts, bounce houses, and more! Kid friendly, and kids 12 and under free. Get tickets at View on site | Email this event",
    pubDate: "2026-08-08T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Fellin Park Ouray",
    imageUrl: "https://localist-images.azureedge.net/photos/53630704110490/huge/606da76369d52578672122d9226699422d70664e.jpg"
  },
  {
    title: "Ouray Open Air Market",
    link: "https://events.ourayridgwayevents.com/event/ouray-open-air-market-7809",
    description: "The Ouray Open-Air Market is a brand-new cooperative, organized marketplace designed to provide a dedicated home for small-scale creators & producers. Our core mission is to promote local agriculture and artisan goods while fostering honest, transparent relationships between vendors and the community. This is an entirely fresh platform in town designed to showcase your artisanal goods and services, helping neighbors and visitors know exactly who made the products they love. When and Where? Location: The market will take place in a beautiful open-air setting at Billy Goat Gruff's Patio (located at 4th Ave. + Main Street, Ouray, CO).Schedule: We will operate every Sunday from June 21, 2026, through September 6, 2026.Hours: Market hours are 10:00 AM to 2:00 PM. View on site | Email this event",
    pubDate: "2026-08-09T16:00:00.000Z",
    endDate: "2026-09-06",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Billy Goats Gruff Patio",
    imageUrl: "https://localist-images.azureedge.net/photos/53054893063268/huge/ed5f6f42c1d6a9db337d04171355a33509b6e1d1.jpg"
  },
  {
    title: "Ridgway Rendezvous SUNDAY Live Music",
    link: "https://events.ourayridgwayevents.com/event/ridgway-rendezvous-sunday-live-music",
    description: "Ridgway Rendezvous Sunday Live Music Lineup Sunday, August 9, 2026 10:00 a.m.–4:00 p.m. Location: Hartwell Park Ridgway, Colorado Admission: Free The Sherbino is pleased to help spread the word about a full day of live music presented by our sister organization, Weehawken Creative Arts, during the 41st Annual Ridgway Rendezvous Arts & Crafts Festival. Join us in Hartwell Park on Sunday, August 9, for four performances spanning jazz, blues, roots music, Americana, and more. Sunday Music Schedule 10:00–11:30 a.m. — The Ordinary Two Start the morning with the warm harmonies and acoustic sound of The Ordinary Two. 11:45 a.m.–1:15 p.m. — Mixed Bag Jazz Enjoy an energetic midday set from Mixed Bag Jazz, featuring a lively blend of jazz performed by some of the region’s outstanding musicians. 1:30–2:45 p.m. …",
    pubDate: "2026-08-09T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Hartwell Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53551206723208/huge/d03bf3915661d1d70df6d4a36003d6398c0cb49b.jpg"
  },
  {
    title: "Weehawken Dance Scholarships Deadline (Fall semester 2026)",
    link: "https://events.ourayridgwayevents.com/event/weehawken-dance-scholarships-deadline-fall-semester-2026",
    description: "Weehawken Dance Scholarships Our Weehawken Dance scholarships provide key opportunities for students in Montrose, Ridgway and Ouray County to access youth dance, aerial silks, and other programs. THE DEADLINE FOR FALL SCHOLARSHIP APPLICATIONS IS 5 PM ON MONDAY, AUGUST 10TH, 2026 Weehawken Dance Scholarships Overview Our scholarship fund, generously supported by donations, fluctuates each season, enabling us to offer varying levels of financial assistance. To ensure you don't miss out on these opportunities, please note the strict deadlines for each semester and adhere to them diligently. Weehawken Dance scholarships applicants may apply for scholarships covering 5-100% of tuition fees. For the Fall semester, we have limited Aerial Scholarships available exclusively for Montrose students attending classes at the FlexRec. It's essential for applicants to disclose any enrollment in classes with other programs during the same semester they plan to attend Weehawken classes on scholarship or financial assistance. …",
    pubDate: "2026-08-10T06:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53483841129898/huge/85ec93c450fb49169649ce596562c77210c06150.jpg"
  },
  {
    title: "Pilates Mat All Levels",
    link: "https://events.ourayridgwayevents.com/event/pilates-mat-all-levels",
    description: "This all levels Classical Pilates Mat class will center, strengthen and legnthen your entire body. Specialty mats are provided. Contact us to learn more or purchase a pass from the link below. We are located in the Historic Bank Building at 521 Clinton Street., View on site | Email this event",
    pubDate: "2026-08-10T14:30:00.000Z",
    endDate: "2026-08-31",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway Pilates",
    imageUrl: "https://localist-images.azureedge.net/photos/53461881445043/huge/bea9b1b613e5c4368deec4a9cd935c81f0ae72c8.jpg"
  },
  {
    title: "On Display - Roots and Rhythms",
    link: "https://events.ourayridgwayevents.com/event/ongoing-roots-and-rhythms",
    description: "Roots & Rhythms features mixed media paintings by Julia Reid and bentwood sculptures by Ethan Wortis. Through layered textures, organic forms, and expressive movement, the exhibition explores the connection between memory and transformation—rooted in what came before, flowing toward what is possible. The exhibition remains on view until August 31st, with gallery hours Monday–Wednesday and Friday, 9 a.m.–4 p.m.st View on site | Email this event",
    pubDate: "2026-08-10T15:00:00.000Z",
    endDate: "2026-08-31",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Space to Create Gallery",
    imageUrl: "https://localist-images.azureedge.net/photos/53622400474001/huge/4d4b348dd13c551177bad3f73488afc2565fc57f.jpg"
  },
  {
    title: "Senior Lunch by Neighbor to Neighbor",
    link: "https://events.ourayridgwayevents.com/event/senior-lunch-by-neighbor-to-neighbor",
    description: "Senior Lunch Every Monday Seniors meet to share a wonderful lunch, have a chance to socialize and enjoy an entertaining program. Transportation is provided. Neighbor to Neighbor, 970-325-4586. View on site | Email this event",
    pubDate: "2026-08-10T18:00:00.000Z",
    endDate: "2026-10-05",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/51631061496012/huge/ef9e5facb2d933bc015ffe261fc1ecd0508088c8.jpg"
  },
  {
    title: "Breathe Together",
    link: "https://events.ourayridgwayevents.com/event/breathe-together-9572",
    description: "We explore and practice breath awareness and conscious breathing techniques as doorways to physical and emotional regulation and spiritual growth. Through these practices we also grow our awareness and achieve higher states of consciousness that can help us in our everyday life, relationships, general wellbeing and ultimately reconnect with our higher nature. No previous experience is required. View on site | Email this event",
    pubDate: "2026-08-11T00:15:00.000Z",
    endDate: "2026-09-29",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Bee True You Wellness and Creative Studio",
    imageUrl: "https://localist-images.azureedge.net/photos/53197444379202/huge/26813502ab1ba3ae9f231b0cd774d101f4f32f02.jpg"
  },
  {
    title: "Functional Fitness - Strength & Mobility Training For Women",
    link: "https://events.ourayridgwayevents.com/event/functional-fitness-strength-mobility-training-for-women",
    description: "Welcome to Ridgway's strength and mobility training for women! Functional means we focus on movements that mimic everyday activities and improve overall mobility, strength and fitness. Exercises often work multiple muscle groups simultaneously, improving coordination and stability. I love the female group setting because we get a chance to really connect and not only get stronger physically, but also build support and community. Come for a drop in and get a taste or commit long term to transformation, vitality and longevity. All levels are welcome. Let's do hard things together! Instructor: Jenn Turner “Jenn may be a highly certified instructor, but her greatest strength lies in creating a welcoming space for women to meet, gather, and sweat. The workouts are always fun, and the next-day burn is guaranteed.” — E.C. …",
    pubDate: "2026-08-11T14:15:00.000Z",
    endDate: "2026-10-06",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Ridgway (Old Schoolhouse)",
    imageUrl: "https://localist-images.azureedge.net/photos/53312790468311/huge/860fbc87ce3cc92e25c09e723732d04292df18ba.jpg"
  },
  {
    title: "Ouray Youth Summer Programs: Mountain Bike Skills",
    link: "https://events.ourayridgwayevents.com/event/ouray-youth-summer-programs-mountain-bike-skills",
    description: "Participants will spend the morning in the Fellin Park area learning and practicing mountain biking skills, including balance, riding technique, and basic bike maintenance. Participants should bring their bike, helmet, gloves, and any other protective equipment necessary. Bikes may be shared if necessary. REGISTER HERE Scholarships are available if needed. This activity is part of the Youth Adventure Days, sponsored by Ouray's Parks and Recreation Department. For questions, contact Sean Hart at 970-318-1003 or seanhart@cityofouray.com View on site | Email this event",
    pubDate: "2026-08-11T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Fellin Park",
    imageUrl: "https://localist-images.azureedge.net/photos/52995424083753/huge/88db51cfef3002c24116bc73023e6692962fc971.jpg"
  },
  {
    title: "Monthly Welcome Home Alliance Veteran's Coffee @ The Sherbino",
    link: "https://events.ourayridgwayevents.com/event/monthly-welcome-home-alliance-veterans-coffee-the-sherbino",
    description: "MONTHLY WELCOME HOME ALLIANCE VETERAN’S COFFEE @ THE SHERBINO Every Branch. Every Era. Every Ability. Offering coffee, donuts and camaraderie. Mike Trickey and April Heard will be there bringing information to you on topics such as: Navigating the VA, Housing, Jobs, Volunteer Opportunities, community resources, VA benefits, recreation and mental health. For more information or to offer support (products or monetary), call 970-765-2210 or visit https://www.whafv.org/ Occurs the 2nd Tuesday of Every Month || 10 am - Noon || Free to attend || Vets Only, Please View on site | Email this event",
    pubDate: "2026-08-11T16:00:00.000Z",
    endDate: "2026-09-08",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/52236172073282/huge/134613035140f6c008febe657f2e7e23acc365e9.jpg"
  },
  {
    title: "End of Summer Reading Party",
    link: "https://events.ourayridgwayevents.com/event/end-of-summer-reading-party",
    description: "Come celebrate the end of summer and the reading challenge with the Ouray Library! Enjoy ice cream, games, and the prize pulled winners of the Summer Reading Challenge. All ages! View on site | Email this event",
    pubDate: "2026-08-11T19:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The San Juan Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53569820640600/huge/527f0fec08a3c54f7459f93b5276ae3c6fc35ba8.jpg"
  },
  {
    title: "BOXCAR",
    link: "https://events.ourayridgwayevents.com/event/boxcar-4205",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-08-11T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Community Meeting - Regarding flooding, economic impacts, and community resilience",
    link: "https://events.ourayridgwayevents.com/event/community-meeting-regarding-flooding-economic-impacts-and-community-resilience",
    description: "Hosted by Ouray County: Community Meeting - Regarding flooding, economic impacts, and community resilience following the Gold Mountain Fire and subsequent flash flood/debris flows. Please plan to attend this community meeting and information session with discussion and presentations from local, regional, federal and state partners. This event will begin with a presentation by a panel of experts and then move into breakout booths for direct Q&A with experts. View on site | Email this event",
    pubDate: "2026-08-12T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/53631245622363/huge/e81829d7b12df787e2c9e06bbe1bb4188da3a9ea.jpg"
  },
  {
    title: "Live Music- Will Overman Band",
    link: "https://events.ourayridgwayevents.com/event/live-music-will-overman-band",
    description: "Please note this is our only show of the summer on a Tuesday, not a Wednesday! Don’t let that throw a wrench in your plans — the Will Overman Band is coming and you won’t want to miss it! Will Overman is a Virginia-raised singer-songwriter with a voice rooted in honesty and hard-won experience. His music carries the weight of a life in motion — introspective, road-worn, and deeply human. Equal parts folk and Americana, Overman writes songs that feel like a long drive through open country, the kind that make you think and make you feel in equal measure. Catch him live on the historic St. Elmo Hotel Patio in the heart of Ouray, Colorado — one of the most stunning backdrops in the San Juans. Nestled beneath towering canyon walls, it's the perfect setting for an evening of honest, heartfelt songwriting under an open Colorado sky. …",
    pubDate: "2026-08-12T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "St. Elmo Tavern",
    imageUrl: "https://localist-images.azureedge.net/photos/53126579046378/huge/120d7418d3aa1bc413c65d9a7d9d153b96c66963.jpg"
  },
  {
    title: "Dark Sky Meteor Watch at Top of the Pines",
    link: "https://events.ourayridgwayevents.com/event/dark-sky-meteor-watch-at-top-of-the-pines",
    description: "As a celebration of Dark Skies in Ouray County, a Perseid Meteor Watch, Stargazing with binoculars, and a Laser Guided Constellation Tour will be held at Top of the Pines a DarkSky International designated Dark Sky Park, on Tuesday August 11, 2026, starting at 9:00 p.m. (weather permitting). Please park cars at the North Parking area and meet at the Pavilion for a short orientation of the evening. This year the moon will be at its new moon phase so the sky will be dark all night with the opportunity to see perhaps a 100+ meteors per hour especially after midnight. Visitors are asked to park at the North parking area and walk to the Pavilion. A short orientation will kick off the event at 9:00pm at the Pavilion. Bring a jacket, bug repellent, lounge chair (for Meteor watching) as well as binoculars and a red flashlight. …",
    pubDate: "2026-08-12T03:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Top of the Pines",
    imageUrl: "https://localist-images.azureedge.net/photos/53479059131388/huge/cdee948af3d591689db27804e9cdb54fd09e359f.jpg"
  },
  {
    title: "Teen Garden to Kitchen Adventure Wednesday",
    link: "https://events.ourayridgwayevents.com/event/teen-garden-to-kitchen-adventure-wednesday",
    description: "Come with Voyager Youth Program to pick produce at the Ridgway Community Garden and cook with Chef Joe from Taco Del Gnar at the Decker Room! Sign up at voyageryouth.org and click \"register.\" Have questions? Email Jazzmin at jazzmin@voyageryouth.org . Event details are HERE. This event will take place from 9am to 3pm on Wednesday, August 12th. This event is for Teens in Ouray County. View on site | Email this event",
    pubDate: "2026-08-12T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53596853239611/huge/53fb740555b64be11cf4485b74947de504eb1b66.jpg"
  },
  {
    title: "August Book Club- \"Welcome to the Monkey House\"",
    link: "https://events.ourayridgwayevents.com/event/august-book-club-welcome-to-the-monkey-house",
    description: "Join us on Wednesday, August 12th at 5:00 p.m. to discuss our August Book Club Book, Welcome to the Monkey House, by Kurt Vonnegut. View on site | Email this event",
    pubDate: "2026-08-12T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Public Library",
    imageUrl: "https://localist-images.azureedge.net/photos/53453974758694/huge/c63328ec0cf2437eaccff89802415cf1f2bc5f52.jpg"
  },
  {
    title: "Zumba Fitness with Tamra",
    link: "https://events.ourayridgwayevents.com/event/zumba-fitness-with-tamra",
    description: "Zumba is a high-energy, Latin-inspired dance fitness program designed as a fun, accessible workout for all skill levels. It combines fast and slow rhythms with aerobic, interval-training moves to improve cardiovascular health, burn calories, and tone muscles. Classes are often described as a \"fitness party\" that reduces stress. All levels of fitness and dance experience are welcome. Classes are $12 to drop in. Class packs are available for purchase (5 classes for $50, 10 classes for $95). For more information, check out the instructor's website: https://zumba.com/p/zumbafitnesswithTamra or email Tamra at tamra.nichols@icloud.com . For updated class information, including last-minute changes or cancellations, follow the instructor's Zumba Facebook page at https://www.facebook.com/ZumbaFitnesswithTamra . View on site | Email this event",
    pubDate: "2026-08-12T23:30:00.000Z",
    endDate: "2026-09-30",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52277881680293/huge/e3b37a55dafe3e5ac88f6f7359fdef186311fd9b.jpg"
  },
  {
    title: "OPEN MIC / JAM NIGHT w/ host DJ Strong",
    link: "https://events.ourayridgwayevents.com/event/open-mic-jam-night-w-host-dj-strong",
    description: "Join us every Wednesday at 6 PM for Open Mic Night with DJ Strong at Floating Lotus Brewery. Bring an original song, play a favorite cover, meet other local musicians, or jump into one of our full-band jam sessions. Solo performers, groups, and musicians looking to collaborate are all welcome. Open Mic is also where we discover artists for Floating Lotus Mainstage. Standout performers may be invited back to play a full featured set, creating a path from Open Mic to the Mainstage. Come perform, connect, experiment, or simply enjoy an evening of live local music. Every Wednesday at 6 PM Floating Lotus Brewery View on site | Email this event",
    pubDate: "2026-08-13T00:00:00.000Z",
    endDate: "2026-10-01",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/52523630382868/huge/8fc500326eed5dc630e7e4235909efe3b2751086.jpg"
  },
  {
    title: "Yoga in the Park- Wednesday evenings",
    link: "https://events.ourayridgwayevents.com/event/yoga-in-the-park-wednesday-evenings",
    description: "For noncyclists and cyclists alike. After an optional social bike ride at 5 pm, wind down for a yoga class in the park 6 - 7 pm. A moderate to advanced vinyasa style class targetting the areas of the body affected by time in the bike saddle and other areas of request. Bring your own mat. If you don't have one, please let me know earlier in the day so I can bring one for you. Meet at the Gazebo south of Chipeta Lodge. If the weather is too inclement, we can meet at the studio at 380 Sherman Street, Ridgway. While this is donation based, please pay before online or in person. View on site | Email this event",
    pubDate: "2026-08-13T00:00:00.000Z",
    endDate: "2026-09-17",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Gazebo south of Chipeta Lodge, Ridgway, CO (Or studio if raining)",
    imageUrl: "https://localist-images.azureedge.net/photos/52880886803755/huge/ba2d24fbf09ba1f9a707a06213d60685581d7322.jpg"
  },
  {
    title: "Postponed: Aug 12, 2026: Community Meditation",
    link: "https://events.ourayridgwayevents.com/event/community-meditation",
    description: "Meditation night on July 14 has been postponed. The rescheduled July date will be posted here when it is known. Thank you for your understanding. Join us for a peer-led weekly meditation series at the Decker Community Room. Free and open to the public! We meet every 1st, 2nd, and 4th Tuesday of the month (all but the 3rd Tuesday!) View on site | Email this event",
    pubDate: "2026-08-13T00:30:00.000Z",
    endDate: "2026-09-23",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/52338340283147/huge/582622671001d9ab20f8c25a5d229c9ecbbba165.jpg"
  },
  {
    title: "Ouray Economic Development Committee",
    link: "https://events.ourayridgwayevents.com/event/ouray-economic-development-committee",
    description: "The Ouray Economic Development Committee (OEDC) works as the liaison between the City and the local business community. This includes creating and implementing an Economic Development Plan and economic development incentives to best serve the business community and to align with programs that induce private investment enterprises and commerce. The committee also explores regional economic development efforts with the Town of Ridgway and Ouray County as well as is tasked with developing a Business Expansion and Retention (BEAR) program, participating in policy discussions and revisions to community planning documents, and making recommendations to the City Council about economic incentive requests. View on site | Email this event",
    pubDate: "2026-08-13T14:30:00.000Z",
    endDate: "2026-09-10",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52092297170097/huge/a4669339e18604293e5cc63dffd58e4d928eee49.jpg"
  },
  {
    title: "Ouray County Fair 2026",
    link: "https://events.ourayridgwayevents.com/event/ouray-county-fair-2026",
    description: "Come see local youth's best rabbits, sheep, chickens and other farm animals. Drool over delicious baked goods, wines, needlework, art and photos in the Open General Projects category. If you're looking for some locally-raised beef, pork or lamb for your freezer, attend the livestock sale on Saturday, Aug. 15th at 2pm. NOTES: No alcohol is allowed on the Fairgrounds. There is no smoking within 10 feet of the fair barn. Schedule of Events: find more details HERE. Thanks to all of the sponsors! View on site | Email this event",
    pubDate: "2026-08-13T16:00:00.000Z",
    endDate: "2026-08-15",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray County Fairgrounds and 4H Events Center",
    imageUrl: "https://localist-images.azureedge.net/photos/53621133797704/huge/b82a36b9dabdc1f8735852fb416f6984bfc0fe44.jpg"
  },
  {
    title: "Community Open House For the Town of Ridgway’s Housing Action Plan & Master Plan Water Supply Element",
    link: "https://events.ourayridgwayevents.com/event/community-open-house-for-the-town-of-ridgways-housing-action-plan-master-plan-water-supply-element",
    description: "The Town of Ridgway and our consulting partners are nearing completion of the Ridgway Housing Action Plan (HAP). Join us for a Community Open House to learn more, ask questions, and discuss your perspectives on housing in your community! Points Consulting is also assisting the Town in amending our 2019 Master Plan by adding a Water Supply Element. Come learn more! All are welcome at this in-person event! The Open House is hosted by the Town of Ridgway Staff, accompanied by Points Consulting. Questions or comments can be directed to Angela Kemp, Town of Ridgway Senior Planner: Email: akemp@town.ridgway.co.us Phone: 970-626-5308 Ext. 214 Both the Housing Action Plan and Water Supply Element follow Colorado Department of Local Affairs (DOLA) planning guidelines. The Housing Action Plan also builds on findings from Ridgway’s 2025 Housing Needs Assessment. …",
    pubDate: "2026-08-13T22:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/51579968896083/huge/c4cfc0e9259666342735abc334be44580e4c7198.jpg"
  },
  {
    title: "Spencer Marlyn Band - Live @ Floating Lotus Brewery",
    link: "https://events.ourayridgwayevents.com/event/spencer-marlyn-band-live-floating-lotus-brewery",
    description: "Spencer Marlyn Band is what happens when a looping wizard and a one-man drum circle collide. Formed in Bend, Oregon by two Midwest transplants, this high-energy duo delivers the kind of sound you’d expect from a full band—genre-hopping their way through funk, reggae, bluegrass, jam, folk, and psychedelia. Frontman Spencer Marlyn combines captivating songwriting with a looping setup and effects pedal mastery, while percussionist Scottie brings a globally influenced punch, shaped by his background in West African rhythms and a wildly diverse drum kit. The result? A danceable, feel-good explosion of sound packed with originals and crowd-favorite covers. View on site | Email this event",
    pubDate: "2026-08-14T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/53500612747225/huge/d592d9f9005f6dd7c1d76cbb109c68986d38d503.jpg"
  },
  {
    title: "Ouray County Pride",
    link: "https://events.ourayridgwayevents.com/event/ouray-county-pride",
    description: "Small towns. Big mountains. Bigger pride. 🏳️‍🌈 OURAY COUNTY PRIDE WEEKEND August 14–16, 2026 🏳️‍🌈🏔️ FRIDAY, AUGUST 14 7P One-woman show The Wright Opera House — Ouray Kick off Pride weekend with EDIE: a one-woman theatrical performance celebrating the life, love and legacy of Edie Windsor — the woman whose landmark Supreme Court case helped bring marriage equality nationwide. SATURDAY, AUGUST 15 Pride Ride - Meet at Hartwell Park 8 AM | Free + all ages Let’s RIDE w/ PRIDE! Supporting Queer community diversity and inclusion while adventuring outdoors. 🚲 This 9k/6m bike ride starts at Hartwell Park in Ridgway, travels gravel/paved road for a warm-up on our way to Dennis Weaver Park where we will do a little single track before returning on the Riverway Trail to the park. No bike left behind! We will stay together as a pack! 🌈 Bring water and friends! …",
    pubDate: "2026-08-14T06:00:00.000Z",
    endDate: "2026-08-16",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Clinton Street",
    imageUrl: "https://localist-images.azureedge.net/photos/52188308416890/huge/8355bb396a0268d9b10a4c50319341fdfcdec3c1.jpg"
  },
  {
    title: "Ridgway Farmers Market",
    link: "https://events.ourayridgwayevents.com/event/ridgway-farmers-market",
    description: "Ridgway Farmers Market WHERE LOCAL GROWS... in the soil, in our economy, and in the connections we share as a community Local farmers, ranchers, bakers, and artisans bring the best of Ridgway to town: fresh produce, handcrafted goods, and the shared belief that a strong community begins with supporting the people who live and work here. View on site | Email this event",
    pubDate: "2026-08-14T16:00:00.000Z",
    endDate: "2026-10-02",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Hartwell Park",
    imageUrl: "https://localist-images.azureedge.net/photos/52487561553294/huge/09a2d632a840b6a4d0303261c242753cb58a993a.jpg"
  },
  {
    title: "Drag Queen Storytime",
    link: "https://events.ourayridgwayevents.com/event/drag-queen-storytime",
    description: "Join us for a Drag Queen Storytime! This will be a fun, safe event. Ages; Elementary View on site | Email this event",
    pubDate: "2026-08-14T19:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The San Juan Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53570183207548/huge/17ac045ed8e1b1bde9af799093a829522b615235.jpg"
  },
  {
    title: "Edie",
    link: "https://events.ourayridgwayevents.com/event/edie",
    description: "Edie, presented by UpstART Theatre, is a special one-time-only performance starring the play's author, Jessica Toltzis. Inspired by the remarkable life of Edith Windsor and her loving, passionate, and transformative relationship with Thea Spyer, Edie tells the story of one woman's fight for dignity, equality, and the right to have her marriage recognized under the law. When Edie Windsor sued the United States government following the death of her wife, her case ultimately reached the Supreme Court, helping redefine marriage rights for millions of Americans. Along the way, she navigated decades of love, loss, discrimination, courage, and self-discovery. At once deeply personal and historically significant, Edie is a moving celebration of authenticity, resilience, and the enduring power of love. Never underestimate the power of a lesbian in love. View on site | Email this event",
    pubDate: "2026-08-14T19:30:42.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53629793255536/huge/48ca171fe67cde30db5164cdafeb611f560ad66c.jpg"
  },
  {
    title: "TYLER SIMMONS",
    link: "https://events.ourayridgwayevents.com/event/tyler-simmons-9384",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-08-14T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Ridges & Reservoir: The Ridgway Landscape Art Session - Ridgway State Park Summer Program Series",
    link: "https://events.ourayridgwayevents.com/event/ridges-reservoir-the-ridgway-landscape-art-session-ridgway-state-park-summer-program-series",
    description: "Unleash your inner artist and let the breathtaking peaks of the San Juans and crystal-clear waters of Ridgway Reservoir be your muse! Join us for an evening of creativity where we swap the studio for the great outdoors. This program is all about slowing down and translating the stunning natural surroundings of the park into art. All art supplies and an expert instructor will be provided. View on site | Email this event",
    pubDate: "2026-08-14T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway State Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53471158193175/huge/04059243547212bbd8b1fbcbafe16b2195b8c518.jpg"
  },
  {
    title: "Mt. Sneffels Half Marathon-10K-Kids Fun Run",
    link: "https://events.ourayridgwayevents.com/event/mt-sneffels-half-marathon-10k-kids-fun-run",
    description: "Foot Race-26th Year annual fundraising event for the Mount Sneffels Education Foundation. View on site | Email this event",
    pubDate: "2026-08-15T13:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "1/2 Marathon/Ouray. 10K & Kids Fun Run Ridgway Athletic Field",
    imageUrl: "https://localist-images.azureedge.net/photos/52674560472756/huge/c1188397f0f07c4e5309cfbb599077161cdc7cc6.jpg"
  },
  {
    title: "Bullseye Beginners: Archery at the Park - Ridgway State Park Summer Program Series",
    link: "https://events.ourayridgwayevents.com/event/bullseye-beginners-archery-at-the-park-ridgway-state-park-summer-program-series",
    description: "This program is an engaging, hands-on introduction to a timeless outdoor sport. Led by CPW staff and certified volunteer instructors, this free clinic provides children with the unique opportunity to learn archery skills. The program emphasizes range safety, proper form, and the mental focus required to hit the bullseye, all within the beautiful, natural setting of the park. View on site | Email this event",
    pubDate: "2026-08-15T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway State Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53471176747260/huge/13058b48d3167871df0880c9045d9735fa1b9c13.jpg"
  },
  {
    title: "Ouray Country Pride After Party",
    link: "https://events.ourayridgwayevents.com/event/ouray-country-pride-after-party",
    description: "Keep the celebration going after the Ouray County Pride Block Party with an evening of music, drag, dancing, drinks, and community at the historic Wright Opera House. The Pride After Party brings together locals, visitors, performers, allies, and friends for a joyful night of connection and celebration in one of Colorado's most unique mountain venues. Expect live entertainment, dancing, laughter, and plenty of opportunities to celebrate the people and relationships that make our communities stronger. Whether you spent the afternoon at the Block Party or are just joining the festivities for the evening, all are welcome to come celebrate Pride in the heart of downtown Ouray. 18+ Ticketed Event View on site | Email this event",
    pubDate: "2026-08-15T19:00:56.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53629793196138/huge/7a061eea58c9d308eb4b46baeb37a87414c9b693.jpg"
  },
  {
    title: "AJ FULLERTON",
    link: "https://events.ourayridgwayevents.com/event/aj-fullerton",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-08-15T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Teen Pride Karaoke Night",
    link: "https://events.ourayridgwayevents.com/event/teen-pride-karaoke-night",
    description: "✨Let your whole self sparkle with PRIDE!✨ Join us to connect, celebrate, and build a sense of belonging.🌈 We will have Marilla Mae of Faery & Fae joining us as well as two Drag Performers from Colorado Springs to sing karaoke with. This is an opportunity for rising 8th Graders up to Recent HS Grads from Ouray County and beyond to craft new friendships, strengthen existing ones, and find their voice so that they can fully express themselves. There will be food, games, crafting supplies, and take home bags available. TO RSVP STEP 1: Make or update an account with Voyager so we have access to important information to best serve the Teens that are attending. STEP 2: Email Kayla@voyageryouth.org with questions and to let her know if you/your teen is planning on attending if you want to help us ensure there will be enough food and supplies. …",
    pubDate: "2026-08-16T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53435902153115/huge/f4a7c1ac8c55f57a55ad821679d80f9d354f233f.jpg"
  },
  {
    title: "Celestial Secrets Star Party: A Ridgway Night Under the Stars - Ridgway State Park Summer Program Series",
    link: "https://events.ourayridgwayevents.com/event/celestial-secrets-star-party-a-ridgway-night-under-the-stars-ridgway-state-park-summer-program-series",
    description: "This program offers a unique opportunity to explore the wonders of the night sky through the expert lens of the Black Canyon Astronomical Society. This free program removes the guesswork of stargazing by providing high-powered telescopes and professional guidance for all ages. Whether you're peering at the craters of the moon or tracking distant galaxies, the event transforms the park into an open-air observatory, inviting visitors to connect with the cosmos in a breathtaking, hands-on environment. View on site | Email this event",
    pubDate: "2026-08-16T03:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway State Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53471216560394/huge/574183965a0056eaee8b515c5347a414162855ad.jpg"
  },
  {
    title: "Sold Out: Aug 16, 2026: Ouray County Pride Drag Brunch 2026",
    link: "https://events.ourayridgwayevents.com/event/ouray-county-pride-drag-brunch-2026",
    description: "Be fabulous! Celebrate Ouray County Pride with us on the Rooftop at White Buffalo Restaurant + Bar! Join hostess, Maxine LaQueene, with Aria Pettyone, Hysteria Brooks, MixTrix, and Simone, for Sunday Brunch, cocktails and drag to close out Pride weekend in Ridgway. August 16, 2026, 12:00 - 2:00 pm. Event is currently sold out, call the property to inquire about current availability/wait list; reservations required. 970-626-3737 Must be 21 or older. The Rooftop at White Buffalo is located at Chipeta Lodge Resort + Spa at 304 S. Lena St., Ridgway. View on site | Email this event",
    pubDate: "2026-08-16T18:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "White Buffalo Restaurant + Bar",
    imageUrl: "https://localist-images.azureedge.net/photos/53629220241939/huge/16644e551a7696d45dae23224664787f1fd221ac.jpg"
  },
  {
    title: "TOP Volunteer Work Day – Monday, August 17",
    link: "https://events.ourayridgwayevents.com/event/top-volunteer-work-day-monday-august-17",
    description: "We could use a few helping hands to take care of some basic maintenance around TOP. If you have a few hours to spare, we'd love to have you join us on Monday, August 17, from 9:00 AM until noon. We'll be trimming brush, raking trails, cutting back low-hanging branches, and sprucing up the Disc Golf Course. If you're a disc golfer, this is a great opportunity to help keep the course in great shape for everyone to enjoy. If you have work gloves or yard tools like rakes, loppers, or trimmers, please bring them along. Water is always a good idea, too. Thanks in advance to everyone who comes out to help. We appreciate all of our volunteers and look forward to seeing you on the 17th! View on site | Email this event",
    pubDate: "2026-08-17T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Top of the Pines",
    imageUrl: "https://localist-images.azureedge.net/photos/51579851840244/huge/fa872abaa9c1160932255910671aa503548cbb47.jpg"
  },
  {
    title: "Celebration of Life for David Leigh Houtz",
    link: "https://events.ourayridgwayevents.com/event/celebration-of-life-for-david-leigh-houtz",
    description: "August 17 @ 3:00 pm – 6:00 pm 3-6 pm || Sherbino Celebration of Life for David Leigh Houtz David Leigh Houtz was a familiar presence in Ridgway for decades. Many knew him through his jewelry shop and workshop at 147 N. Cora, where he crafted, repaired, and sold jewelry since the 1990s. Others knew him through his years of service as a firefighter, his artistic talents, his independent spirit, and his unmistakable personality. David’s daughter and family invite friends, neighbors, former customers, and all who knew him to join them in celebrating his life. Monday, August 17, 2026 Drop by anytime between 3:00–6:00 PM The Sherbino 604 Clinton Street, Ridgway The Sherbino is honored to provide the space for this gathering as family and friends come together to share stories, memories, and light refreshments while celebrating a life well lived. Join us in Ridgway’s Living Room. …",
    pubDate: "2026-08-17T21:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/53551486850468/huge/45887e0ddea874f645f524be6869c3115982f7d8.jpg"
  },
  {
    title: "Movie Mondays in Hartwell Park",
    link: "https://events.ourayridgwayevents.com/event/movie-mondays-ferris-buellers-day-off",
    description: "Enjoy free movies under the stars in Ridgway's Hartwell Park. They'll start at 8:30pm. Bring your own chairs, blankets and snacks. Brought to you by the Ridgway Youth Advisory Council. Here's the line-up: June 15th - Ferris Bueller's Day Off (rated PG-13)July 20th - The Peanut Butter Falcon (rated PG-13)August 17th - Top Gun (rated 13+ by Common Sense Media) View on site | Email this event",
    pubDate: "2026-08-18T02:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Hartwell Park",
    imageUrl: "https://localist-images.azureedge.net/photos/52922424426850/huge/1e180755c642fe19893a7caee0beacbf99e967d3.jpg"
  },
  {
    title: "JAMIE & THE DREAMERS",
    link: "https://events.ourayridgwayevents.com/event/jamie-the-dreamers",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-08-18T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Decker Room New Volunteer Orientation",
    link: "https://events.ourayridgwayevents.com/event/decker-room-new-volunteer-orientation",
    description: "Join our wonderful volunteer team at the Decker! If you would like to help with Gallery Sitting during open hours, events, and more, please attend a New Volunteer Orientation to get started! You'll learn about the Decker Room and the events and programs that take place here. Volunteers should be able to commit to consistent volunteer hours each month! Email decker@ridgwayfuse.org for info and to RSVP. View on site | Email this event",
    pubDate: "2026-08-18T22:30:00.000Z",
    endDate: "2026-09-15",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/52568082541214/huge/49b7c4c5e83ca4147b872fdb5be7fe87b78551c5.jpg"
  },
  {
    title: "Ridgway FUSE Creative Main Street - Committee Meeting",
    link: "https://events.ourayridgwayevents.com/event/ridgway-fuse-creative-main-street-committee-meeting",
    description: "Ridgway FUSE, a Creative District & Main Street Program, nurtures the cultural and economic vitality of Ridgway, Colorado All Ridgway FUSE Committee Meetings are open to the public. Click here for agendas and notes. Interested residents may apply to serve on the FUSE committee here. Email Tera Wick at twick@town.ridgway.co.us or call 970-626-5308 x 215 with questions. View on site | Email this event",
    pubDate: "2026-08-18T23:30:00.000Z",
    endDate: "2026-09-15",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/52305506266326/huge/6e40de5340fac46ca9bf9f33e9c31ed9ab5985ce.jpg"
  },
  {
    title: "CO-150: A League of Their Own",
    link: "https://events.ourayridgwayevents.com/event/co-150-a-league-of-their-own",
    description: "A League of Their Own (1992) tells the story of the All-American Girls Professional Baseball League, formed during World War II when many major league players were serving overseas. Led by an unforgettable ensemble cast including Geena Davis, Lori Petty, Rosie O'Donnell, Madonna, and Tom Hanks, the film celebrates the women who stepped onto the field and proved they belonged there. Funny, heartfelt, and endlessly quotable, the film has become a beloved classic about teamwork, perseverance, and challenging expectations. This screening is part of the Colorado 150 Film Festival and includes a special Colorado connection. Marla Hooch's tryout scene was filmed at Colorado State University's Glenn Morris Field House in Fort Collins, and the character herself proudly hails from Fort Collins in the film. Before the screening, join the community for a friendly wiffle ball game at Fellin Park at 3:00 pm. …",
    pubDate: "2026-08-19T19:00:44.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53629793089630/huge/0c6cd87ef64554102af8e9c1429715eaa74f68f8.jpg"
  },
  {
    title: "Live Music- Emilio Gonzalez",
    link: "https://events.ourayridgwayevents.com/event/live-music-emilio-gonzalez",
    description: "Hailing from Nashville, TN, Emilio Gonzalez is gracing the St. Elmo patio to close out our 2026 Summer Sound Series. We can’t wait to share and enjoy his raw talent and authentic presence with you. Emilio is a singer / songwriter / multi-instrumentalist originally from Tampa Florida, with styles akin to Joni Mitchell, Andy Shauf, and Lucy Rose. He performs regularly in Nashville’s most intimate venues, often as ½ of the indie ensemble “Emylo”. Emilio’s rich voice, thoughtful lyrics, and soft acoustics will carry you breezily through the evening. This is a free show for all, so we hope you’ll join us for a special evening that will be one to remember. No Ticket required for this show View on site | Email this event",
    pubDate: "2026-08-20T00:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "St. Elmo Tavern",
    imageUrl: "https://localist-images.azureedge.net/photos/53126599615246/huge/97aedc5531194289457c49a360d9af1390f0938d.jpg"
  },
  {
    title: "Motel Prophets - Live @ Floating Lotus Brewery",
    link: "https://events.ourayridgwayevents.com/event/motel-prophets-live-floating-lotus-brewery",
    description: "Motel Prophets are Ridgway’s new folk-rock band, featuring Corey Hooker on vocals. With country-tinged vocals, rootsy storytelling, and a loose mountain-town energy, the band blends folk grit with rock-and-roll warmth for a sound that feels both familiar and fresh. Expect an easygoing, heartfelt set built for cold beers, good company, and a true local music night. View on site | Email this event",
    pubDate: "2026-08-21T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/53604148125477/huge/f14b8951b91261a2b0d6d1962bc705fb32252ed7.jpg"
  },
  {
    title: "Highgraders Holiday & Mining History",
    link: "https://events.ourayridgwayevents.com/event/highgraders-holiday-mining-history",
    description: "Watch the Hardrock mining competition and learn about the history of mining in Ouray. There will be a full bar, and food vendors. Miner’s Heritage Park is on the southwest corner of Fellin Park. Friday, Aug. 21 | Fellin Park Horseshoe Tournament (open to the public) Registration from 2-3 PM $20/team Saturday, Aug. 22 | Miner’s Heritage Park 9-10 AM - Registration 10 AM - Hand Mucking 11 AM - Spike Driving 12 PM - Single Man Drilling 3 PM - Single Jack Sunday, Aug. 23 | Miner’s Heritage Park 9-10 AM - Registration 10 AM - Team Drilling 12 PM - Machine Mucking 2 PM - Double Jack Awards Ceremony *All times are approximate and subject to change. View on site | Email this event",
    pubDate: "2026-08-21T06:00:00.000Z",
    endDate: "2026-08-23",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Miner's Heritage Park",
    imageUrl: "https://localist-images.azureedge.net/photos/52092594380571/huge/0242f87adfd989494856026cfcdfbb5c60ca7962.jpg"
  },
  {
    title: "RIDGWAY WRECKING CREW",
    link: "https://events.ourayridgwayevents.com/event/ridgway-wrecking-crew-9105",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-08-21T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "The Flight of the Pollinators - Ridgway State Park Summer Program Series",
    link: "https://events.ourayridgwayevents.com/event/the-flight-of-the-pollinators-ridgway-state-park-summer-program-series",
    description: "Bees are the quiet champions of the Uncompahgre Valley, keeping our wild high-desert valleys blooming and our local backyard gardens thriving. In this fun, eye-opening evening presentation, you will discover the incredible diversity of Colorado's native bees—from chubby wild bumblebees to solitary miners—and learn the complex social secrets of the hive. Whether you are a backyard gardener looking to boost your summer blooms or just a nature lover curious about the life of a pollinator, you will walk away with deeper understanding of these vital insects. View on site | Email this event",
    pubDate: "2026-08-22T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway State Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53594904289337/huge/5dcda519655d9c8463440969864239b2fdd45d31.jpg"
  },
  {
    title: "the Fabulous Blues Tones - Live @ Floating Lotus Brewery",
    link: "https://events.ourayridgwayevents.com/event/the-fabulous-blues-tones-live-floating-lotus-brewery",
    description: "If you like blues music with a kick, you will love the Fabulous Blues Tones. With Greg Jacobs and Tony Kovacic out front on vocals and guitars, the band comes to the stage with a whole slew of house-rocking material—some timeless standards and some pulled from deep within the blues vault. On drums and bass, Tim Brennan and Dave Underwood keep the pocket tight and the groove going strong all night long. This is authentic, hard-driving blues played by four musicians who dearly love it. Come out and get your mojo working. View on site | Email this event",
    pubDate: "2026-08-22T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/53604223147724/huge/c985d5189882648846e08f8f047b93c0a26dab4a.jpg"
  },
  {
    title: "The Courtyard at 610 Presents: Flagship Romance + The Rough & Tumble at The Courtyard",
    link: "https://events.ourayridgwayevents.com/event/the-courtyard-at-610-presents-flagship-romance-the-rough-tumble",
    description: "Gates: 6:30 || Show: 7:00 || $25 advance / $30 – day of show General Admission Seating || Limited Bar || The Courtyard at 610 is a unique little venue behind our gallery space, the 610 Arts Collective, on Clinton St. The entrance is through the alleyway between N Cora St. and N Laura St behind the gallery and The Sherbino Theater. TWO DUOS ON TOUR TOGETHER Rough Romance U.S. Tour 2026 unites Flagship Romance and The Rough & Tumble for a six-month cross-country run of high-energy, harmony-soaked, heart-forward shows. Expect laughter, lump-in-your-throat moments, and a dynamic co-headlining format that turns every venue into a listening room you’ll never forget. Flagship Romance: Flagship Romance is an unforgettable alternative folk duo known for breathtaking vocal harmonies, inspired songwriting, and a dynamic live show that leaves audiences feeling like they just made two new best friends. …",
    pubDate: "2026-08-22T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "610",
    imageUrl: "https://localist-images.azureedge.net/photos/52994270870445/huge/daf9e9efd8da0f386a5f5b85b8847791c2588a2f.jpg"
  },
  {
    title: "Bats, Our Friends in the Dark - Ridgway State Park Summer Program Series",
    link: "https://events.ourayridgwayevents.com/event/bats-our-friends-in-the-dark-ridgway-state-park-summer-program-series",
    description: "Prepare to flip your perspective on the most misunderstood residents of the night sky! Join us at the Pa-Co-Chu-Puk Ponds for an eye-opening morning dedicated to the world’s only flying mammals. Far from being spooky, these \"caped crusaders\" are vital to the health of the park and your backyard. Discover the incredible \"sonar\" powers and pest-control skills that make bats one of nature's most important allies. View on site | Email this event",
    pubDate: "2026-08-22T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway State Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53602909844206/huge/86588d56807d9717bb526b283fe016d75d0899eb.jpg"
  },
  {
    title: "Ouray Day",
    link: "https://events.ourayridgwayevents.com/event/ouray-day",
    description: "Celebrate Ouray's heritage with a day of art, food, games, and family-friendly fun! Bring your friends, family, and neighbors to cheer on the hard rock mining competitions during Highgraders Holiday, sample delicious entries in the Women's Club of Ouray County Annual Chili Cookoff, and enjoy activities and entertainment for all ages. Saturday, August 22, 2026 Noon to 4:00 PM Fellin Park, Ouray ACTIVITIES 🏐 Volleyball & Bocce Ball tournaments 🌶️ Chili Cookoff ⛏️ HighGraders Holiday mining competition (9 AM-3 PM) 🏰 Bouncy houses 💦 Dunk tank 🎨 Local artist booths 🎲 Games for all ages 🎁 Door prizes (including a chance to win an Ouray Hot Springs Pool Annual Pass!) Plus, a free afternoon entry at Ouray Hot Springs for Ouray-area residents with completion of a community survey (available at the event) SCHEDULE Noon – Ouray Day begins 1–2 PM – Volleyball Tournament 1–3 PM – Chess Tournament 2-3 PM …",
    pubDate: "2026-08-22T18:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Fellin Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53481231331209/huge/c0cdcb0d2847ee1b3356d6a5770d61693b5eea88.jpg"
  },
  {
    title: "WCOC 3rd Annual Chili Cook-Off",
    link: "https://events.ourayridgwayevents.com/event/wcoc-3rd-annual-chili-cook-off",
    description: "Braggin' rights are on the line for competitors to earn the title of Best Chili in Ouray County for 2026 during the 3rd Annual WCOC Chili Cook-Off! Local businesses will present an assortment of chilis to be tested by professionals and citizens. Participants could take home the prize of Best Chili, People's Choice, Best Decorated and Top Fundraiser (as additional monetary tips help the participants earn this prize). Taste alll of the chilis for $14. If they're extra good, leave them an additional tip! Baked goods made by WCOC members will also be available for purchase. This event is hosted by the Woman's Club of Ouray County, a 501(c)(3) nonprofit organization. All proceeds benefit Ouray County nonprofits with grants. We are grateful for the past, present and future support of our Community! View on site | Email this event",
    pubDate: "2026-08-22T21:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Fellin Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53623729143081/huge/45546bcb32f8d150e1f7b0a0d240e5499f23a374.jpg"
  },
  {
    title: "Lunar-tics Unite! Discovering the Moon - Ridgway State Park Summer Program Series",
    link: "https://events.ourayridgwayevents.com/event/lunar-tics-unite-discovering-the-moon-ridgway-state-park-summer-program-series",
    description: "Ready to unlock the secrets of our favorite cosmic neighbor? Pack your curiosity and join professor Gerald J. Spangrude for a fun, stellar evening as we talk all about the moon—from its wild crater-faced history and lunar myths to how it dances through our Colorado night skies! View on site | Email this event",
    pubDate: "2026-08-23T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway State Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53594962246638/huge/78cf2476b700b1075a450a7ed2dac1b00709c7a3.jpg"
  },
  {
    title: "11th Annual Log Hill Hustle",
    link: "https://events.ourayridgwayevents.com/event/11th-annual-log-hill-hustle",
    description: "The Fortuna Tierra Club is hosting the 11th Annual Log Hill Hustle, Fun Run and fundraiser on Sunday, August 23 at 8 AM starting and finishing at the Divide Ranch and Club Clubhouse at 151 Divide Ranch Circle, Ridgway, CO 81432. The 5k (3.1 miles) and 10k (6.2 miles) races will wind through the Fairway Pines roads offering breathtaking views of the San Juan and Cimarron ranges. Enjoy a free continental breakfast sponsored by Fortuna Tierra Club. Awards will be given to Log Hill Hustle winners. All runners are eligible for door prizes. T-shirts to commemorate the event will be provided. The prices are $40 for adults and $30 for students and teachers. View on site | Email this event",
    pubDate: "2026-08-23T14:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Divide Ranch and Club Clubhouse",
    imageUrl: "https://localist-images.azureedge.net/photos/52250073410263/huge/0c5c647e572d5a4c1c7a05677aec7057f5312338.jpg"
  },
  {
    title: "Auditions: Rocky Horror Picture Show Live Shadow Cast Edition (Show in Oct.)",
    link: "https://events.ourayridgwayevents.com/event/auditions-rocky-horror-picture-show-live-shadow-cast-edition-show-in-oct",
    description: "August 23 @ 1:00 pm – 3:00 pm Rocky Horror Picture Show — Live Shadowcast Edition Directed by Erin Cawley Auditions · Sunday, August 23 · 1:00 – 3:00 p.m. · The Sherbino (604 Clinton St.) The Sherbino is casting for its live shadowcast production of The Rocky Horror Picture Show! This is your chance to step into the spotlight, don a wild costume, and bring this cult classic to life on stage. What’s a Shadowcast? A shadow cast is a troupe of live performers who act, lip-sync, and dance in front of the movie screen while the film plays. The audience joins the fun with call-backs, props, and dance numbers—creating a mash-up of film, live theater, and interactive party. Since the 1970s, shadowcasts have been the heartbeat of Rocky Horror’s midnight movie legacy, turning every performance into a raucous celebration of freedom, fun, and camp. …",
    pubDate: "2026-08-23T19:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/53426340345256/huge/41f8f3856c62b8da4427d53a7b71309c0268ddc5.jpg"
  },
  {
    title: "First Day of School K-12 - Ridgway",
    link: "https://events.ourayridgwayevents.com/event/first-day-of-school-k-12-ridgway",
    description: "Pre-K starts August 26 View on site | Email this event",
    pubDate: "2026-08-24T06:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52196842516113/huge/34c03f502c2e6b24c2bdceae7a155d7b6d463e8f.jpg"
  },
  {
    title: "First day of School - Ouray",
    link: "https://events.ourayridgwayevents.com/event/first-day-of-school-ouray",
    description: "View on site | Email this event",
    pubDate: "2026-08-24T06:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52322176935102/huge/ddc5d3f4273e28e34256e8e641136b3515c2f377.jpg"
  },
  {
    title: "San Juan Chamber MusicFest",
    link: "https://events.ourayridgwayevents.com/event/san-juan-chamber-musicfest",
    description: "August 25 - August 30 at multiple venues in Ridwway and Ouray, Colorado. The annual San Juan Chamber MusicFest, OCPAG’s flagship event, features a group of chamber musicians of international acclaim, under the artistic direction of renowned concert pianist Max Levinson. Together, they produce a number of concerts and events in Ouray and Ridgway over the course of a week each August. This year's MusicFest will feature the world-renowned Ulysses Quartet. Read more about the SJCMF musicians HERE. OCPAG is grateful for the grant support from the Dave and Mary Wood Fund and the Western Colorado Community Foundation so that OCPAG is able to bring these concerts to stages around Ouray County. We are also most grateful to the patrons who attend and support this chamber music programming! View on site | Email this event",
    pubDate: "2026-08-25T06:00:00.000Z",
    endDate: "2026-08-30",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53249632392911/huge/75dcb70d103e562fc3b68267bd405813886a92df.jpg"
  },
  {
    title: "DAVE JORDAN",
    link: "https://events.ourayridgwayevents.com/event/dave-jordan",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-08-25T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Tourism Advisory Committee",
    link: "https://events.ourayridgwayevents.com/event/tourism-advisory-committee",
    description: "The Ouray Tourism Advisory Committee (TAC) represents a cross-section of the small businesses, nonprofits, and residents of Ouray. We educate ourselves about best practices in the tourism industry, tourism marketing, and the visitor experience. We gather input, plan, prioritize, measure, and advise the City of Ouray on the best actions to take related to the tourism industry in our community. View on site | Email this event",
    pubDate: "2026-08-25T23:30:00.000Z",
    endDate: "2026-09-22",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52092171660517/huge/0e628304026c92db25e8df01849c962ac902a3b4.jpg"
  },
  {
    title: "CO-150: Dumb and Dumber",
    link: "https://events.ourayridgwayevents.com/event/co-150-dumb-and-dumber",
    description: "Dumb and Dumber (1994) follows two well-meaning but spectacularly clueless friends, Lloyd Christmas and Harry Dunne, as they embark on a cross-country road trip that quickly spirals into one ridiculous misadventure after another. Starring Jim Carrey and Jeff Daniels at the height of their comedic powers, the film became an instant cult classic thanks to its endlessly quotable lines, outrageous situations, and perfect blend of slapstick and absurdity. This Colorado-connected screening celebrates one of the state's most memorable movie road trips. Several scenes were filmed in Colorado, including locations in Breckenridge, Fort Collins, and Estes Park, showcasing the mountain landscapes and small-town charm that help make the state such a memorable backdrop for adventure. A wildly funny comedy about friendship, bad decisions, and the occasional accidental success. View on site | Email this event",
    pubDate: "2026-08-26T19:00:31.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53629793039448/huge/0fe7e8d5f45588023fbbee28323ea2c0d3cb36fa.jpg"
  },
  {
    title: "NEW With Weehawken: Beat & Step: West African Dance, Drum & Body Percussion ~ with performances in The Nutcracker Remixed!",
    link: "https://events.ourayridgwayevents.com/event/new-with-weehawken-beat-step-west-african-dance-drum-body-percussion-with-performances-in-the-nutcracker-remixed",
    description: "Beat & Step: West African Dance, Drum & Body Percussion is an energetic and interactive class that combines traditional West African dance, drumming, and body percussion into one exciting experience. Students will learn dance combinations, explore traditional drumming rhythms that tell stories, and create music using their hands, feet, body, drums, and voice. Along the way, they'll develop coordination, rhythm, musicality, focus, memory, confidence, and teamwork while experiencing the rich cultural traditions of West Africa. No previous dance or music experience is required—just curiosity, energy, and a willingness to learn. Students enrolled in this performance class will showcase what they've learned in our winter production. Dress Code: Students should wear comfortable clothing that allows for plenty of movement. Athletic clothing such as T-shirts, leggings, athletic pants, or shorts is recommended. Please avoid jeans or restrictive clothing. Wear comfortable athletic shoes or sneakers that are clean and reserved for class. …",
    pubDate: "2026-08-26T22:00:00.000Z",
    endDate: "2026-09-09",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Montrose",
    imageUrl: "https://localist-images.azureedge.net/photos/53483890616270/huge/dd89f2f9028ca228db911b8e16c50dc39897358f.jpg"
  },
  {
    title: "Creative Space: Artist Salon Series",
    link: "https://events.ourayridgwayevents.com/event/creative-space-artist-salon-series",
    description: "Inspired by our vibrant creative community, these monthly events are intended to build creative community across disciplines! With a different focus each time, we will keep things interesting and engaging! Anyone is welcome to attend, and creatives of all kinds are invited. We welcome your ideas for future events! Snacks provided! To learn more, ask questions, submit ideas, reach out to the Decker Room Coordinator, Arielle. decker@ridgwayfuse.org 872-772-9484 View on site | Email this event",
    pubDate: "2026-08-27T00:00:00.000Z",
    endDate: "2026-09-24",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53233124549377/huge/48f5037f05c4138c97f3f592d4b11a0581b38eab.jpg"
  },
  {
    title: "The Fabulous Blues Tones - Live @ Floating Lotus Brewery",
    link: "https://events.ourayridgwayevents.com/event/the-fabulous-blues-tones-live-floating-lotus-brewery-7737",
    description: "If you like blues music with a kick, you will love the Fabulous Blues Tones. With Greg Jacobs and Tony Kovacic out front on vocals and guitars, the band comes to the stage with a whole slew of house-rocking material—some timeless standards and some pulled from deep within the blues vault. On drums and bass, Tim Brennan and Dave Underwood keep the pocket tight and the groove going strong all night long. This is authentic, hard-driving blues played by four musicians who dearly love it. Come out and get your mojo working. View on site | Email this event",
    pubDate: "2026-08-28T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/53604234896494/huge/7d3a3f2cb3d8a141dbf964c56c072834ed01eb67.jpg"
  },
  {
    title: "OLD MAN POLLY",
    link: "https://events.ourayridgwayevents.com/event/old-man-polly-4070",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-08-28T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Final Friday: Clowning Around",
    link: "https://events.ourayridgwayevents.com/event/final-friday-clowning-around",
    description: "CLOWN SCHOOL IS NOW IN SESSION! Join us at the end of the first week back at school to be a little less serious and a little more silly. For Middle & High School Students, Final Friday is reclaiming Voyager as the Teen Center it used to be. 🤘 Come hang out for an evening that mixes chill social time with free food and fun activities. Every month, we have games, art and more available. All we ask is that you clean up after yourself and help us create a welcoming space for everyone. This month, Andrea Sokolowski, founder of the local improv group The Play Does will be joining us. If you've ever been interested in learning about improv or wanted to run away to the circus then this is the Final Friday for you! …",
    pubDate: "2026-08-28T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Voyager Basecamp",
    imageUrl: "https://localist-images.azureedge.net/photos/53428561014390/huge/ddcc842e71104da739a6e5d9ae3d47e5e9c98a98.jpg"
  },
  {
    title: "Alpine Jam - Live @ Floating Lotus Brewerty",
    link: "https://events.ourayridgwayevents.com/event/alpine-jam-live-floating-lotus-brewerty",
    description: "Ridgway-based Alpine Jam plays an eclectic, high-energy mix of real rock and roll, down-home blues, and upbeat country. Their dynamic vocals, wailing saxophone and guitar leads, and instrumental jams are sure to get you up and moving. View on site | Email this event",
    pubDate: "2026-08-29T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/53604246650500/huge/18e210b78b98c467d364bab798eb9b5e4c95c24d.jpg"
  },
  {
    title: "Roots & Wings: The Pollinator Connection - Ridgway State Park Summer Program Series",
    link: "https://events.ourayridgwayevents.com/event/roots-wings-the-pollinator-connection-ridgway-state-park-summer-program-series",
    description: "Discover the secret, bustling world of our local ecosystem! Join passionate plant enthusiast Zoe Debenedette for an eye-opening evening exploring the incredible native flora of the San Juan region and the vital pollinators they support. You will learn how local wildflowers, shrubs, and trees have evolved alongside native bees, butterflies, and hummingbirds—and discover simple, powerful ways you can use these hardy plants to invite colorful wildlife right into your own backyard. It is the perfect summer evening for gardeners, nature lovers, and anyone curious about the living landscape around us. View on site | Email this event",
    pubDate: "2026-08-29T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway State Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53595153401195/huge/21d02df3239c35fcac02e56bef6792ae2e868513.jpg"
  },
  {
    title: "San Juan Chamber MusicFest Festival Concert",
    link: "https://events.ourayridgwayevents.com/event/san-juan-chamber-musicfest-festival-concert",
    description: "The Ouray County Performing Arts Guild proudly presents the 43rd Annual San Juan Chamber MusicFest Festival Concert at the historic Wright Opera House. Acclaimed pianist Max Levinson joins the internationally celebrated Ulysses Quartet for an unforgettable evening of chamber music, showcasing masterworks performed by some of today's most accomplished classical musicians. Following the concert, guests are invited to continue the evening with a reception in the Wright Tavern, offering an opportunity to meet fellow music lovers and celebrate another remarkable season of Chamber MusicFest in the San Juans. Tickets available through the Ouray County Performing Arts Guild. Meet the SJCMF musicians >> View on site | Email this event",
    pubDate: "2026-08-29T19:30:16.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53629793138788/huge/39f020be09948c428ebce6f72c1b5cb7e2a7cb06.jpg"
  },
  {
    title: "A Blue Birdie’s Tale - Ridgway State Park Summer Program Series",
    link: "https://events.ourayridgwayevents.com/event/a-blue-birdies-tale-ridgway-state-park-summer-program-series",
    description: "Get ready to add a splash of sapphire to your weekend! Pack your binoculars and join professor Bruce Ackerman at the Visitor Center for a fun, feather-filled evening discovering Colorado’s most brilliant bluebirds—from their cheerful songs and quirky nesting habits to the best spots for watching them flap around Ridgway! View on site | Email this event",
    pubDate: "2026-08-29T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway State Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53595172751829/huge/9578a24cf2da72cd8b280b6b30487657c8b924e2.jpg"
  },
  {
    title: "DARRELL SCOTT - Live at The Sherbino",
    link: "https://events.ourayridgwayevents.com/event/darrell-scott-live-at-the-sherbino",
    description: "SATURDAY || Doors: 7:00 PM || Show: 7:30 PM || Tickets: $30 in advance / $35 Day of Show || Solo Show || Some Reserved Section Seats Available Presented in partnership by The Sherbino with Pickin’ Productions About Darrell Scott Darrell Scott is an acclaimed singer, songwriter, and multi-instrumentalist widely regarded as one of the most respected voices in contemporary American roots music. A masterful storyteller with deep roots in country, bluegrass, folk, and Americana, Scott delivers powerful performances where his expressive voice, heartfelt songwriting, and exceptional musicianship takes center stage. …",
    pubDate: "2026-08-30T01:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/52994385870281/huge/7231300fd573b444d8ac4e1e1c8f4890c0f0feab.jpg"
  },
  {
    title: "On Display - UNSCRIPTED: Fiber Improvisations by Bonnie Bucknam",
    link: "https://events.ourayridgwayevents.com/event/unscripted-fiber-improvisations-by-bonnie-bucknam",
    description: "Our September Exhibition brings us quilted works from internationally known artist, Bonnie Bucknam of Montrose, CO. Bonnie’s work won Best of Show at Quilt National 2011 and is now part of the Quilt National Permanent Collection at the International Quilt Museum in Lincoln, Nebraska. Bonnie’s work has been shown in numerous exhibits in the United States. In 2015, Bonnie’s work was in a year-long solo exhibition at the Portland Oregon International Airport. She was a solo artist at the Visions Museum of Textile Art, San Diego, in 2019. Internationally, Bonnie’s work has appeared in the Haus der Wirtschaft museum in Stuttgart, Germany, the Museum of Modern Art in Verona, Italy, and other venues in Germany, England, Ireland, France, Japan, Brazil, and the Netherlands. Bonnie’s work Tangle is part of the permanent collection of the Tuch + Technik Textilmuseum, Neumunster, Germany. …",
    pubDate: "2026-09-01T16:00:00.000Z",
    endDate: "2026-09-25",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The 610 Arts Collective",
    imageUrl: "https://localist-images.azureedge.net/photos/53551302433703/huge/07561f7b06b24999f21e6be2347e5102b9b92cc3.jpg"
  },
  {
    title: "CORAL SKYE",
    link: "https://events.ourayridgwayevents.com/event/coral-skye-7556",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-09-01T22:00:00.000Z",
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
    pubDate: "2026-09-02T00:00:00.000Z",
    endDate: "2026-10-07",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/51579968896083/huge/c4cfc0e9259666342735abc334be44580e4c7198.jpg"
  },
  {
    title: "The M Factor, Shredding the Silence on Menopause. Film followed by a panel discussion",
    link: "https://events.ourayridgwayevents.com/event/the-m-factor-shredding-the-silence-on-menopause-film-followed-by-a-panel-discussion-8635",
    description: "September 1 @ 6:30 pm – 8:00 pm Doors at 6:00 PM, Film at 6:30 PM followed by a panel discussion led by local specialists in women’s health issues Dr. Abigail Seaver, ND; Meg Benasutti, ANP-BC, Jennifer McGeorge, ARNP, CNM, MSCP and Kim Walker, DNP, WHNP. Note: this is a different film from the one we showed back in May, which was about Perimenopause About The M Factor Film Menopause is a silent epidemic that affects the health and well‑being of millions of American women. In addition to experiencing traumatic physical symptoms, women are struggling with the related stresses of billions of dollars in lost wages, upended careers, family disruptions, and emotional chaos. This film confront this neglected crisis, challenges societal and medical shortcomings and advocates for a revolutionary approach to women’s health all over the world. …",
    pubDate: "2026-09-02T00:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/53551521567232/huge/386838c9a250aca9388bec73873cf507473ae100.jpg"
  },
  {
    title: "Beautification Committee (OBC)",
    link: "https://events.ourayridgwayevents.com/event/beautification-committee",
    description: "The Beautification Committee (OBC) works on projects to help beautify the community. The committee oversees the installation of all the flower gardens in the City as well as all the hanging baskets and plantings on Main Street. They have also worked hard over the years to acquire many historic mining pieces and equipment that are displayed throughout the community to recognize Ouray's mining heritage. The committee has also provided direction on signage, light poles, and benches on the public rights of way. The Beautification Committee also plays an important role in developing and implementing master plans for the City’s park system. The committee makes recommendations to the City Council on these many beautification projects as well as the use of dollars from the Beautification Fund. This fund is supported by a portion of the Lodging Occupation Tax and is used exclusively for projects that help beautify the community. …",
    pubDate: "2026-09-02T14:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center, San Juan Room",
    imageUrl: "https://localist-images.azureedge.net/photos/50382168464273/huge/9567987a01fc4f1da8e171fabd1eb5b7bdbdccfa.jpg"
  },
  {
    title: "Dinosaur Tracks Hike",
    link: "https://events.ourayridgwayevents.com/event/dinosaur-tracks-hike",
    description: "Hike up the Silvershield Trail to see fossilized dinosaur tracks. This is a strenuous and steep hike of 1600 vertical feet. You should be in good hiking shape to do this tour. We will discuss the geology and natural history of this formation. Be prepared to be outside in variable weather and at altitude. Expect to hike uphill for 1.5-2 hours. REGISTER HERE This activity is sponsored by Ouray's Parks and Recreation Department. For questions, contact Sean Hart at 970-318-1003 or seanhart@cityofouray.com View on site | Email this event",
    pubDate: "2026-09-02T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Silvershield Trailhead",
    imageUrl: "https://localist-images.azureedge.net/photos/53622925400388/huge/78ed1b5451403be8feaebe77cd45b69c1a39e826.jpg"
  },
  {
    title: "City Slickers: CO-150 Film Festival @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/city-slickers-co-150-film-festival-the-wright",
    description: "City Slickers : CO- 150 Movie Night @ the Wright We’re celebrating Colorado’s Sesquicentennial with 150 screenings throughout the Centennial State. WHEN? Wednesday, September 2nd Doors at 6:30 pm • Movie at 7:00 pm RUN TIME: 1h 52min YEAR: 1991 RATING: PG-13 ABOUT THE FILM Every year, three friends take a vacation away from their wives. This year, henpecked Phil (Daniel Stern), newly married Ed (Bruno Kirby), and Mitch (Billy Crystal) -- terrified of his midlife crisis -- decide to reignite their masculinity by taking a supervised cattle drive across the Southwest. Under the supervision of gruff cowboy Curly (Jack Palance), the men set out on a journey that turns unexpectedly dangerous. The three men bond along the way to conquering their fear of aging. Tickets $5 In-person screening at the historic Wright Opera House Concessions available. …",
    pubDate: "2026-09-02T19:00:18.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53629792721969/huge/b36605ccda743f761d9a7e7ab62dfce88160e90c.jpg"
  },
  {
    title: "WOH Art Show: Brittany Stadler",
    link: "https://events.ourayridgwayevents.com/event/woh-art-show-brittany-stadler",
    description: "Come see In Color, a new exhibition by regional artist Brittany Stadler in the Tavern at the Wright. Art on display through September 3. Brittany Stadler: Artist Statement My work often begins with a single form — typically an animal whose presence represents an ecosystem, region, or symbol. From that base shape, I build inward and intuitively. I draw in larger forms first, and work my way toward the smaller details. Research is an essential part of the practice. I study each plant and animal that I consider for a piece — how they move, how they relate to their environment. These rhythms inform the poses and compositions in my work, helping each subject feel alive and true. What results is part collage, part optical illusion — a work that I hope will be a process of discovery for everyone that views it. …",
    pubDate: "2026-09-03T16:00:37.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53629792913484/huge/0f655603601840911844cbf1cce4ddcdecf2dbb1.jpg"
  },
  {
    title: "Trivia Night @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/trivia-night-the-wright-1382",
    description: "Come test the true limits of the human mind at Trivia Night @ the Wright, where obscure facts become temporary personality traits. Questions may include history, movies, science, music, local lore, accidental expertise, and things you absolutely learned once in 8th grade and never expected to need again. Bring a team, bring a friend, or arrive alone like a mysterious wandering scholar of useless information. Competitive spirits, wild guesses, and dramatic confidence are all encouraged. No studying required. In fact, studying may make things worse. View on site | Email this event",
    pubDate: "2026-09-04T19:00:12.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53629793379457/huge/94e90759cff30df21fa21e46e7fcd2e69c247e84.jpg"
  },
  {
    title: "RIDGWAY WRECKING CREW",
    link: "https://events.ourayridgwayevents.com/event/ridgway-wrecking-crew-2643",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-09-04T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "First Friday Opening Reception ~ Bonnie Bucknam's \"UNSCRIPTED ~ Fiber Improvisations\" at 610 Arts",
    link: "https://events.ourayridgwayevents.com/event/first-friday-opening-reception-bonnie-bucknams-unscripted-fiber-improvisations-at-610-arts",
    description: "Our September Exhibition brings us quilted works from internationally known artist, Bonnie Bucknam of Montrose, CO. Bonnie’s work Crater won Best of Show at Quilt National 2011 and is now part of the Quilt National Permanent Collection at the International Quilt Museum in Lincoln, Nebraska. Bonnie’s work has been shown in numerous exhibits in the United States. In 2015, Bonnie’s work was in a year-long solo exhibition at the Portland Oregon International Airport. She was a solo artist at the Visions Museum of Textile Art, San Diego, in 2019. Internationally, Bonnie’s work has appeared in the Haus der Wirtschaft museum in Stuttgart, Germany, the Museum of Modern Art in Verona, Italy, and other venues in Germany, England, Ireland, France, Japan, Brazil, and the Netherlands. Bonnie’s work Tangle is part of the permanent collection of the Tuch + Technik Textilmuseum, Neumunster, Germany. …",
    pubDate: "2026-09-04T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The 610 Arts Collective",
    imageUrl: "https://localist-images.azureedge.net/photos/53551327108460/huge/e4d20fe9a7a9c8a310fdf85111342924891b0c1b.jpg"
  },
  {
    title: "Ongoing: Social Justice Travel Exhibition",
    link: "https://events.ourayridgwayevents.com/event/copy-of-art-opening-social-justice-travel-exhibition",
    description: "Join us for the opening of this special traveling exhibition! Telluride Arts merges creativity and activism through grassroots grants, immersive community exhibitions, and local partnerships that tackle systemic issues and promote wellness. This exhibition features new works by artists who recieved a Social Justice Grant from Telluride Arts to create work for this traveling exhibit. View on site | Email this event",
    pubDate: "2026-09-04T23:00:00.000Z",
    endDate: "2026-09-29",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53048149260541/huge/415b9339ce946074e5105384e5293b0f6acdedee.jpg"
  },
  {
    title: "September - Art Opening: Social Justice Travel Exhibition",
    link: "https://events.ourayridgwayevents.com/event/art-opening-social-justice-travel-exhibition",
    description: "Join us for the opening of this special traveling exhibition! Telluride Arts merges creativity and activism through grassroots grants, immersive community exhibitions, and local partnerships that tackle systemic issues and promote wellness. This exhibition features new works by artists who recieved a Social Justice Grant from Telluride Arts to create work for this traveling exhibit. View on site | Email this event",
    pubDate: "2026-09-04T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53048140307438/huge/ecf8324adca38749b7b4d7aaf5963ab93afc2b0d.jpg"
  },
  {
    title: "The Sherbino Presents: Donny Morales – First Friday Show",
    link: "https://events.ourayridgwayevents.com/event/the-sherbino-presents-donny-morales-first-friday-show",
    description: "Friday, September 4th | 6:00–8:00 pm Sherbino “Living Room” Free Show | Cash Bar | Tips Encouraged Celebrate First Friday with an intimate evening of live music at the Sherbino! Join us in the Sherbino’s cozy “Living Room” near the bar for a special performance by Donny Morales. Donny brings his signature blend of “soul-acousti-funk”, delivering an irresistible mix of soulful vocals, funky rhythms, and masterful acoustic guitar. A longtime favorite on Colorado’s Western Slope, Donny’s performances are equal parts heartfelt storytelling, infectious grooves, and musical spontaneity. Whether he’s reimagining familiar favorites or sharing original songs, his warm stage presence and feel-good energy create an experience that’s impossible not to move to. Come ready to clap, sway, sing along, and enjoy an unforgettable evening of soul, acoustic vibes, and funk. …",
    pubDate: "2026-09-05T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/53358101603318/huge/d6a95490ff2eae257adf6f909e37473c1092b24e.jpg"
  },
  {
    title: "Public Bird Banding Day - Ridgway State Park",
    link: "https://events.ourayridgwayevents.com/event/public-bird-banding-day-ridgway-state-park",
    description: "Join us for a morning of science and discovery at Ridgway State Park. This unique, hands-on event offers a rare \"behind-the-scenes\" look at how researchers track and protect our feathered friends. This program offers a front-row seat to the delicate intersection of wildlife conservation and field science. It is an opportunity for families and nature enthusiasts to move beyond the binoculars and witness the vibrant details of migratory birds up close as they are measured and banded by experts. Set against the serene backdrop of the Dallas Creek Confluence area, this hands-on experience not only demystifies the migratory patterns of our feathered neighbors but also fosters a deep, personal connection to the local ecosystem. Whether you are an aspiring biologist or simply looking for a peaceful morning in the park, this free event provides an unforgettable look at the small wonders that call our region home. …",
    pubDate: "2026-09-05T14:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway State Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53595198326789/huge/b52afc36fd4c4e87537e211690d7093afa8c36a3.jpg"
  },
  {
    title: "Music and Makers Fest",
    link: "https://events.ourayridgwayevents.com/event/music-and-makers-fest",
    description: "Join the highly anticipated Ouray Made's Annual Music and Makers Fest, a celebration of creativity, community, and culture set against the breathtaking San Juan Mountains! This year, immerse yourself in a vibrant atmosphere filled with local music, artisan crafts, and delectable food. Event Highlights - More details to come! Live Music: Enjoy performances from talented local musicians across various genres, providing an energetic festival soundtrack. Artisan Market: Discover and purchase from a diverse selection of local makers offering handmade items, including jewelry, pottery, textiles, and artwork. Food Truck Alley: Indulge in a variety of culinary delights from an array of food trucks serving diverse cuisines. View on site | Email this event",
    pubDate: "2026-09-06T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Fellin Park",
    imageUrl: "https://localist-images.azureedge.net/photos/52324818447922/huge/3f4a7ad14fc7dbe59a7600bfd9c554e32680c1d7.jpg"
  },
  {
    title: "The Courtyard at 610 Presents: Heather & Douglas at The Courtyard",
    link: "https://events.ourayridgwayevents.com/event/the-courtyard-at-610-presents-heather-douglas-4082",
    description: "September 6 @ 7:00 pm – 8:30 pm Gates: 6:30 || Show: 7:00pm || $15 Advance / $20 at gates || Enter via the alleyway behind the Sherbino and 610 Arts Collective || Outdoor Venue || Setting: seated || Limited Bar Available || There will be a few “agility” tickets at the gate — which are tickets for seats that you have to climb over a railing for. We don’t sell those online — but we do sell them onsite IF there is space. **Due to the local Gold Mountain Fire – Poor air quality or rain location will be inside on The Sherbino main stage for Courtyard shows** Join us for an unforgettable evening of music under the stars in one of Ridgway’s most charming hidden venues—The Courtyard at 610, tucked behind the 610 Arts Collective and Sherbino Theater. …",
    pubDate: "2026-09-07T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "610",
    imageUrl: "https://localist-images.azureedge.net/photos/53551561816356/huge/5397f983bd33ef7292511908911ca22097960ab5.jpg"
  },
  {
    title: "Monthly Karate in Ouray County",
    link: "https://events.ourayridgwayevents.com/event/monthly-karate-in-ouray-county",
    description: "Join Weehawken Creative Arts for Karate with Sensei Kay Briggs. We offer unlimited monthly classes in Ouray County (meaning you can attend each week in Ouray and/or Ridgway — or both). Tuition/registration is DUE the 1st week of the month. Karate class is a great way to learn skills to keep you safe, stay in shape and strong core movements. Karate believes in using it only to protect self and is taught accordingly. Whether you are new to Karate or a seasoned student, the Sensei will work with your level. Taught in the kyokushin kai-kan style, similar shotokan style of karate, we welcome new students to try this exceptional experience for your mind and body! Mixed ages --- Ages 7 through Adult (extended time for more experience) Mondays in Ouray: St. …",
    pubDate: "2026-09-07T23:00:00.000Z",
    endDate: "2026-10-05",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Ridgway (Old Schoolhouse)",
    imageUrl: "https://localist-images.azureedge.net/photos/52253033564264/huge/ef12b5792bac47932752278d68230c7704389412.jpg"
  },
  {
    title: "DAVE MENSCH",
    link: "https://events.ourayridgwayevents.com/event/dave-mensch-1938",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-09-08T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Ouray: Echoes in the Canyon",
    link: "https://events.ourayridgwayevents.com/event/ouray-echoes-in-the-canyon-2450",
    description: "Ouray: Echoes in the Canyon returns to the Wright Opera House for some additional screenings. Presented by Photonic Media and produced in cooperation with the City of Ouray 150th Committee, the documentary explores the people, history, landscapes, and enduring spirit that helped shape what many still call \"The Gem of the Rockies.\" Through storytelling, archival perspective, aerial cinematography, and local voices, the film traces the layered history of Ouray and the individuals who built a mountain community that continues to evolve while remaining deeply connected to its frontier roots. The film features aerial photography by Ouray By Flight, cinematography by Levi Kramer, and is produced and directed by Hank Braxtan. We are offering a \"pay what you can\" for your ticket - $5, $10 and $15. Pick the amount that fees \"Wright\" to you. Thank you for your support! …",
    pubDate: "2026-09-09T19:00:43.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53629792783415/huge/87e789cb56363301409b7496f25a25cdfd62ef58.jpg"
  },
  {
    title: "WOH Art Show: Thomas Livingstone Photography",
    link: "https://events.ourayridgwayevents.com/event/woh-art-show-thomas-livingstone-photography",
    description: "Join the Ouray County Arts Association and the Wright Opera House for the opening reception of Historic Treasures of the San Juan Mountains, a photography exhibition by Colorado photographer Thomas Livingstone. Through striking black and white photography, Livingstone documents the historic mines, weathered structures, and forgotten places scattered throughout the San Juan Mountains. The exhibition is drawn from a seven-year photographic project that culminated in his acclaimed book, Historic Treasures of the San Juan Mountains, preserving a remarkable visual record of Colorado's mining heritage. Born in New York and raised in Colorado, Livingstone developed an early appreciation for mountain landscapes before studying at the Brooks Institute of Photography in Santa Barbara. Since opening his Colorado gallery in 2011, his work has been exhibited throughout the state and has earned recognition for its blend of fine art and historic preservation. …",
    pubDate: "2026-09-10T16:00:37.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53629792987218/huge/6f3a915f33285c3e3da2dbe8c54dfcf731474ba0.jpg"
  },
  {
    title: "You Can't Hide: Comedy @ the Wright Featuring Comedian Casey Skinner",
    link: "https://events.ourayridgwayevents.com/event/you-cant-hide-comedy-the-wright-featuring-comedian-casey-skinner",
    description: "Part stand-up comedy. Part true crime story. You Can't Hide is comedian Casey Skinner's hilarious and unbelievable account of the time he accidentally checked into one of America's most infamous hotels: Los Angeles' legendary Cecil Hotel. What begins as an unfortunate booking quickly spirals into an unforgettable adventure filled with bizarre encounters, unsettling discoveries, and laugh-out-loud storytelling. Just when you think the story is over, Casey finds himself returning for one final night, proving that sometimes the funniest stories are also the strangest. Casey Skinner is an Los Angeles-based comedian whose credits include appearances on Netflix, HBO Max, BRAVO, E!, and the Netflix Is A Joke Festival. He has performed at iconic venues including The Comedy Store and The Improv, while also producing television projects for Netflix, Discovery, and Max. …",
    pubDate: "2026-09-11T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53629792641067/huge/bbdacac6fd41328414a646697eef58da7bd6ce25.jpg"
  },
  {
    title: "Jolie Holland - Live at The Sherbino",
    link: "https://events.ourayridgwayevents.com/event/jolie-holland-live-at-the-sherbino",
    description: "THURSDAY || Doors: 6:30 PM || Show: 7:00 PM || Tickets: $30 in advance / $35 Day of Show || Solo Show || Some Reserved Section Seats Available Presented in partnership by The Sherbino with Pickin’ Productions About Jolie Holand Jolie Holland has forged a timeless, captivating musical legacy; as she mines the depths of her, at times harrowing, life experiences, her creative choices are rooted in honesty and presence. They are also fearless. Jolie Holland has been on the road since the early 2000s, releasing seven of her own albums and collaborating on countless others. Her work has been described as a syncretization of American roots, with rock and experimental elements. She’s been in the studio with Booker T, Lucinda Williams, and TV On The Radio; and shared stages with Big Thief, St. Vincent, Elbow, and Mavis Staples. …",
    pubDate: "2026-09-11T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/53306519672947/huge/94dbb34c3a7f806ee827594137fa43bd0c00bfb2.jpg"
  },
  {
    title: "RED MOUNTAIN REVIVAL",
    link: "https://events.ourayridgwayevents.com/event/red-mountain-revival",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-09-11T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Happy Little Trees: Classes @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/happy-little-trees-classes-the-wright-6743",
    description: "Join Emma Kalff for a morning of coffee and painting at the Wright Opera House Community Room. Participants will follow along with a classic Bob Ross episode and create their own Bob Ross–style landscape painting. All supplies are included, and no prior painting experience is necessary. Just bring your curiosity and enjoy a relaxed, creative morning inspired by the joy of painting. FULL SCHEDULE April 11 — Horizons West May 9 — Barn at Sunset June 13 — LIttle House by the Road July 11 — Mountain Splendor August 8 — Quiet Woods September 12 — Arizona Splendor October 3 — Meadow Stream November 14 — Lonely Retreat December 12 — Snow Trail ABOUT THE INSTRUCTOR Emma Kalff was classically trained in oil painting under American realist painter Auseklis Ozols at the New Orleans Academy of Fine Arts. …",
    pubDate: "2026-09-12T10:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53629792520229/huge/beba7240c3a492b2d1d507ede526f4823cfe0996.jpg"
  },
  {
    title: "WCOC Rummage Sale Collection Day",
    link: "https://events.ourayridgwayevents.com/event/wcoc-rummage-sale-collection-day-7834",
    description: "Have a pile of unneeded items you would like to remove from your home before winter? The Woman's Club of Ouray County (WCOC) could probably use them for the 2027 Rummage Sale! The WCOC sells the donated items and turns the cash into grants benefiting Ouray County nonprofits! The WCOC is a 501(c)(3) organization. Please visit the WCOC website to see a list of items that cannot be accepted for donation. We thank our community for their past, present and future support! View on site | Email this event",
    pubDate: "2026-09-12T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "St. John's Episcopal Church",
    imageUrl: "https://localist-images.azureedge.net/photos/53623942514307/huge/7e3390c38586c7689074adcead387d39a23bfaee.jpg"
  },
  {
    title: "Ellar Day at Ouray Books",
    link: "https://events.ourayridgwayevents.com/event/ellar-day-at-ouray-books",
    description: "Join us at Ouray Books for an exclusive author meet & greet and book signing with author Marcy S. Wood, celebrating the launch. All Welcome! FREE EVENT! September 12th marks a somber milestone—the 139th anniversary of the tragic events that defined the lives and deaths of Ellar Day and Joe Dixon. Immerse yourself in the world of a bustling Colorado mining town as we explore the haunting story behind this piece of local history. About the Novel In a time of suffocating societal judgment, nineteen-year-old Ellar Day finds herself caught between the ghosts of her past and a forbidden, passionate love for Joe Dixon, a former Buffalo Soldier. Against a backdrop of deep-seated racial prejudice and small-town volatility, Ellar’s attempts to protect her family and the man she loves lead to a chain of events that would end in a brutal, unforgettable tragedy. Marcy S. …",
    pubDate: "2026-09-12T20:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Books",
    imageUrl: "https://localist-images.azureedge.net/photos/53585920590422/huge/0c3d546070c874ec15fc8d0e89b1c48824f1a12e.jpg"
  },
  {
    title: "Historic Sites Tour and Reception",
    link: "https://events.ourayridgwayevents.com/event/historic-sites-tour-and-reception",
    description: "Join us for an author-led historic tour followed by an intimate gathering, marking the anniversary of the Ellar Day and Joe Dixon tragedy. Commemorating History: The Ellar Day Legacy Join us on September 12th, 2026 as we mark the 139th anniversary of the tragic events that defined the lives and deaths of Ellar Day and Joseph W. Dixon. This special event invites you to step back in time and explore the haunting history behind Marcy S. Wood’s novel, The Notorious Murder of Ellar Day. The Walking Tour: Immerse yourself in the setting of the novel with a guided walking tour of landmark buildings central to the story. We will trace the path of history—from the Beaumont Hotel to the site of Joe Dixon’s final hours—visiting many of the key locations featured in the book. The Reception: The evening concludes at Cassidy’s Cafe & Antiques. …",
    pubDate: "2026-09-12T21:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Cassidy's Cafe and Antiques",
    imageUrl: "https://localist-images.azureedge.net/photos/53585949770506/huge/c98cb43fee3b91d08bc4ebb6a015b0d4a5e3f886.jpg"
  },
  {
    title: "Young & Dead - Live at The Sherbino",
    link: "https://events.ourayridgwayevents.com/event/young-dead-live-at-the-sherbino",
    description: "Doors at 7 pm || Show at 7:30 pm || Dancehall-style show with limited seating || Tickets: $25 advance / $28 day of show || A limited number of reserved tables are available. GA Tickets can be found under the venue diagram. Reserved tables are found by hovering over the diagram. GA seats are available in the bar area. Get ready for a high-energy night of psychedelic exploration when Young & Dead takes over the Sherbino stage on Saturday, September 12. Hailing from Boulder, Colorado, this group of talented musicians in their early 20s bringsa fresh and electrifying approach to the music of the Grateful Dead — not simply recreating the catalog, but diving deep into the spirit of improvisation, experimentation, and musical adventure that made the Dead legendary. …",
    pubDate: "2026-09-13T01:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/53180328283019/huge/ac1aa0240d78b51097ebe512629240264b0a77b2.jpg"
  },
  {
    title: "Woman's Club of Ouray County monthly meeting",
    link: "https://events.ourayridgwayevents.com/event/womans-club-of-ouray-county-monthly-meeting-3004",
    description: "All Ouray County women are invited to attend the monthly meeting for the Woman's Club of Ouray County (WCOC). The WCOC, created in 1897, is a local philanthropic and community focused nonprofit organization. Monthly meetings include local speakers, a social hour and discussion regarding events to volunteer in and around Ouray County. For more information about the monthly meeting and the WCOC, please visit the organization's website. View on site | Email this event",
    pubDate: "2026-09-15T19:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52338847179921/huge/a804a495547d393d16494cf6fdbbd49572b64a68.jpg"
  },
  {
    title: "TYLER SIMMONS",
    link: "https://events.ourayridgwayevents.com/event/tyler-simmons-8192",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-09-15T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Ouray: Echoes in the Canyon",
    link: "https://events.ourayridgwayevents.com/event/ouray-echoes-in-the-canyon-692",
    description: "Ouray: Echoes in the Canyon returns to the Wright Opera House for some additional screenings. Presented by Photonic Media and produced in cooperation with the City of Ouray 150th Committee, the documentary explores the people, history, landscapes, and enduring spirit that helped shape what many still call \"The Gem of the Rockies.\" Through storytelling, archival perspective, aerial cinematography, and local voices, the film traces the layered history of Ouray and the individuals who built a mountain community that continues to evolve while remaining deeply connected to its frontier roots. The film features aerial photography by Ouray By Flight, cinematography by Levi Kramer, and is produced and directed by Hank Braxtan. We are offering a \"pay what you can\" for your ticket - $5, $10 and $15. Pick the amount that fees \"Wright\" to you. Thank you for your support! …",
    pubDate: "2026-09-16T19:00:43.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53629792783415/huge/87e789cb56363301409b7496f25a25cdfd62ef58.jpg"
  },
  {
    title: "The Sherbino Presents: “Out There, a National Park Story” film celebrating the National Park Service’s 110th birthday",
    link: "https://events.ourayridgwayevents.com/event/the-sherbino-presents-out-there-a-national-park-story-film-celebrating-the-national-park-services-110th-birthday-6700",
    description: "September 16 @ 6:30 pm – 8:30 pm Doors: 6:00 PM || Film: 6:30 PM || Tickets: $10 in advance || $12 at the door Setting: Seated at The Sherbino What does real, large-scale ecosystem restoration look like? In the centennial year of the U.S. National Park Service, a young filmmaker and his childhood friend set off on a 10,000-mile journey through America’s national parks, leaving home with little more than a camera and a desire to understand what connects people to these wild places. What begins as a summer road trip becomes a seven-year odyssey, capturing untold stories of those who protect, visit, and find healing in the parks. Through intimate interviews, breathtaking cinematography, and a profound original music score, Out There uncovers a deeply human portrait of the parks – revealing them as places of reflection, resilience, and connection across generations and cultures. …",
    pubDate: "2026-09-17T00:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/53551593926247/huge/02f3a13038681c325dd89c895e1675f9a2442f8f.jpg"
  },
  {
    title: "Stillhouse Junkies: Live Music @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/stillhouse-junkies-live-music-the-wright",
    description: "The Wright Opera House welcomes Stillhouse Junkies, the acclaimed Durango-based trio explore the worlds between roots, bluegrass, Texas swing, blues, and rock. Their free-flowing musical interplay and improvisation make every show unique as the trio weave through high-energy, intricately composed original songs, never taking the same path twice. Formed in 2017, the band consists of Fred Kosak (guitar, mandolin), Alissa Wolf (fiddle), and Jeanette Adams (bass). Part of programming at the Wright Opera House, bringing arts, conversation, and community to downtown Ouray since 1889. View on site | Email this event",
    pubDate: "2026-09-17T19:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53629792427039/huge/1430b7a25dd4d66785cd4b7dae7ceff018f8679d.jpg"
  },
  {
    title: "4th Annual San Juan Slam Pickleball Tournament",
    link: "https://events.ourayridgwayevents.com/event/4th-annual-san-juan-slam-pickleball-tournament",
    description: "The 4th Annual San Juan Slam, a Western Slope regional pickleball tournament hosted by the Ridgway Pickleball Club (RPC) with Presenting/Title Sponsor Citizen's State Bank. The San Juan Slam, a family friendly event and free for spectators, takes place at the Ridgway Athletic Field from September 18-20. Sept. 18 Women's Doubles, Sept. 19 Mixed Doubles, and Sept. 20 Men's Doubles. This year's tournament will follow a Team Round-Robin pool play format with medal rounds at every skill and age level, providing participants and spectators plenty of gameplay. Our 4-legged friends (on leashes of course) are welcome to get their photo taken for inclusion in the World Famous 'Dogs of the San Juan Slam'. View on site | Email this event",
    pubDate: "2026-09-18T15:00:00.000Z",
    endDate: "2026-09-20",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway Athletic Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53613028091683/huge/89356c844c3d4e996774f5c668ba438226be20a1.jpg"
  },
  {
    title: "OLD MAN POLLY",
    link: "https://events.ourayridgwayevents.com/event/old-man-polly-6979",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-09-18T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Music Bingo @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/music-bingo-the-wright-6438",
    description: "Music Bingo @ the Wright WHEN? Friday, September 18 Doors at 6:30 pm • Music Bingo at 7:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE EVENT It's bingo with a soundtrack. Instead of numbers, your bingo card is filled with song titles and artists. Listen for the music, mark your card, sing along if the mood strikes, and compete for prizes as familiar favorites span decades and genres. No trivia knowledge required, just a love of music and a willingness to have fun. Whether you know every lyric or simply enjoy discovering new songs, Music Bingo is an easygoing evening of laughter, friendly competition, and community. Free to attend. In-person event at the historic Wright Opera House. Part of programming at the Wright Opera House, bringing arts, conversation, and community to downtown Ouray since 1889. View on site | Email this event",
    pubDate: "2026-09-19T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/53560045436493/huge/a14a8a4e7c57d0a1bef341efac6f2260bc078cfc.jpg"
  },
  {
    title: "The Courtyard at 610 Presents: Alex Dunn & Mimi Genheimer at The Courtyard",
    link: "https://events.ourayridgwayevents.com/event/the-courtyard-at-610-presents-alex-dunn-mimi-genheimer",
    description: "Gates: 6:00 || Show: 6:30 pm || $20 Advance / $25 day of show || Enter via the alleyway behind the Sherbino and 610 Arts Collective || Outdoor Venue || Setting: seated || Limited bar onsite **Due to the local Gold Mountain Fire – Poor air quality or rain location will be inside on The Sherbino main stage for Courtyard shows** The Courtyard at 610 is a unique little venue behind our gallery space, the 610 Arts Collective, on Clinton St. The entrance is through the alleyway between N Cora St. and N Laura St behind the gallery and The Sherbino Theater. Likely to be our last Courtyard Show of the season! Join us for an intimate evening with Alex Dunn and Mimi Genheimer! …",
    pubDate: "2026-09-21T00:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "610",
    imageUrl: "https://localist-images.azureedge.net/photos/53551756644415/huge/29fa27ed4c25e649a1da5d91ff6dd2fe89cb9a74.jpg"
  },
  {
    title: "ALPINE JAM",
    link: "https://events.ourayridgwayevents.com/event/alpine-jam-8336",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-09-22T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Ouray: Echoes in the Canyon",
    link: "https://events.ourayridgwayevents.com/event/ouray-echoes-in-the-canyon-8790",
    description: "Ouray: Echoes in the Canyon returns to the Wright Opera House for some additional screenings. Presented by Photonic Media and produced in cooperation with the City of Ouray 150th Committee, the documentary explores the people, history, landscapes, and enduring spirit that helped shape what many still call \"The Gem of the Rockies.\" Through storytelling, archival perspective, aerial cinematography, and local voices, the film traces the layered history of Ouray and the individuals who built a mountain community that continues to evolve while remaining deeply connected to its frontier roots. The film features aerial photography by Ouray By Flight, cinematography by Levi Kramer, and is produced and directed by Hank Braxtan. We are offering a \"pay what you can\" for your ticket - $5, $10 and $15. Pick the amount that fees \"Wright\" to you. Thank you for your support! …",
    pubDate: "2026-09-23T19:00:43.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53629792783415/huge/87e789cb56363301409b7496f25a25cdfd62ef58.jpg"
  },
  {
    title: "JEAN SANDOVAL AND THE TOWNKIDS",
    link: "https://events.ourayridgwayevents.com/event/jean-sandoval-and-the-townkids",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-09-25T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Ouray County Railroad Days: 9/26-9/27, 2026",
    link: "https://events.ourayridgwayevents.com/event/ouray-county-railroad-days-926-927-2026",
    description: "This weekend event includes a Museum open house, opportunity to ride Motor No. 1 as well as Goose No. 4 on Saturday and Sunday. There will be a talk on \"TBA\" on Saturday at 7:00 pm View on site | Email this event",
    pubDate: "2026-09-26T06:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway Railroad Museum",
    imageUrl: "https://localist-images.azureedge.net/photos/52594260880730/huge/9b3f82c821e5f84eb57dee6af0b87a07ecd09517.jpg"
  },
  {
    title: "Geology Tour",
    link: "https://events.ourayridgwayevents.com/event/geology-tour-1061",
    description: "Join a local geologist for a guided tour exploring the fascinating geology that shapes our landscape. You’ll gain a deeper understanding of the forces that built this incredible region, while exploring the range of rock formations, from sandstone to quartzite. REGISTER HERE This activity is sponsored by Ouray's Parks and Recreation Department. For questions, contact Sean Hart at 970-318-1003 or seanhart@cityofouray.com View on site | Email this event",
    pubDate: "2026-09-26T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Visitor Center",
    imageUrl: "https://localist-images.azureedge.net/photos/53623018208189/huge/fa73fbfb09ce8f09a2e637984cbe313d209e0bfb.jpg"
  },
  {
    title: "Exceptional Women of Ouray County",
    link: "https://events.ourayridgwayevents.com/event/exceptional-women-of-ouray-county",
    description: "The Fortuna Tierra Club has created the Exceptional Women awards to recognize outstanding women who demonstrate leadership, commitment and service to the nonprofit organizations operating in Ouray County. The immeasurable contributions of these extraordinary women enrich our lives and help make our community a better place to live. The Exceptional Women program celebrates their accomplishments and dedication and the hard work they do on our behalf. The awards now include Exceptional Educators from Ouray and Ridgway school districts and an Exceptional Healthcare Professional. View on site | Email this event",
    pubDate: "2026-09-26T21:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Brad and Donna Funk's Home",
    imageUrl: "https://localist-images.azureedge.net/photos/52870214849883/huge/5e53b01264b1462c471681c9d99491d9c8c589d6.jpg"
  },
  {
    title: "Jeep Jamboree Historical Parade",
    link: "https://events.ourayridgwayevents.com/event/jeep-jamboree-historical-parade",
    description: "Watch historical Jeep Parade come through town as part of Jeep Jamboree. View on site | Email this event",
    pubDate: "2026-09-26T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Downtown Ouray",
    imageUrl: "https://localist-images.azureedge.net/photos/53171933807100/huge/679f562aa1680a2f20f8ffd0a78d921293437057.jpg"
  },
  {
    title: "Ouray Ridgway Young Life Banquet",
    link: "https://events.ourayridgwayevents.com/event/ouray-ridgway-young-life-banquet",
    description: "A fun evening to celebrate with local Young Life staff, leaders, committee and guests that God is on the move in our community, and one vehicle is Young Life. An opportunity to learn about and financially support the clear sharing of the gospel, changed lives, and laughter in our county's youth. Guest speaker is Dr. Tanita Maddox, an expert in Gen Z, that will speak about how to connect with the next generation with compassion, urgency and action. RSVP with ddowdy@vsiok.com View on site | Email this event",
    pubDate: "2026-09-27T23:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway Christian Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52622115299633/huge/61aba8b7fef027ac0730e8b6024be4d074d1d8ad.jpg"
  },
  {
    title: "ETHAN PERRY",
    link: "https://events.ourayridgwayevents.com/event/ethan-perry",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-09-29T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
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
    imageUrl: "https://localist-images.azureedge.net/photos/53629792783415/huge/87e789cb56363301409b7496f25a25cdfd62ef58.jpg"
  },
  {
    title: "October - Art Opening: Space Cowboy by Dundee & Lee - special reading by Poet Laureate Crisosto Apache",
    link: "https://events.ourayridgwayevents.com/event/art-opening-space-cowboy-by-dundee-lee",
    description: "Join us for the opening of Space Cowboy for its stop in Ridgway! Space Cowboy is a large-scale traveling exhibition that creates a high-engagement public experience wherever it lands — drawing community members in through fiber art, live story collection, and programming that connects Colorado's frontier identity to its aerospace future. It doesn't just show up. It listens. Community voices are archived through , and woven into the exhibition itself — creating a living record that grows with every stop. Over four years, Space Cowboy is estimated to reach 37,000 Coloradans across every economic region, scenic corridor, and creative district in the state. The Space Cowboy opening is honored to welcome Colorado's 11th Poet Laureate, Crisosto Apache who will give a reading in honor of the event. …",
    pubDate: "2026-10-02T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53048200847384/huge/574f2906fa13a967da1b53fe33b1ea163558dc3f.jpg"
  },
  {
    title: "Ongiong: Space Cowboy by Dundee & Lee",
    link: "https://events.ourayridgwayevents.com/event/copy-of-art-opening-space-cowboy-by-dundee-lee",
    description: "Come see Space Cowboy durings its stop in Ridgway! Space Cowboy is a large-scale traveling exhibition that creates a high-engagement public experience wherever it lands — drawing community members in through fiber art, live story collection, and programming that connects Colorado's frontier identity to its aerospace future. It doesn't just show up. It listens. Community voices are archived through , and woven into the exhibition itself — creating a living record that grows with every stop. Over four years, Space Cowboy is estimated to reach 37,000 Coloradans across every economic region, scenic corridor, and creative district in the state. Space Cowboy launches at the Annual Summit in Trinidad, June 3, 2026 — at the heart of the Santa Fe Trail corridor in Southeast Colorado, the first stop on a four-year statewide journey. View on site | Email this event",
    pubDate: "2026-10-02T23:00:00.000Z",
    endDate: "2026-10-06",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53048203945878/huge/24f84f08b2f8624cb59d2163b0403c16995d63c2.jpg"
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
    description: "Basic identification of hand samples of minerals from the San Juan Mountian Region with Robert Stoufer View on site | Email this event",
    pubDate: "2026-10-03T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray County Historical Society Research Center & Archive",
    imageUrl: "https://localist-images.azureedge.net/photos/52278219322548/huge/0e7cc3a05f960a6d1c77d69eb8423134dfed7fa4.jpg"
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
    title: "The Ridgway 1k Rally thru the Alley 2026 ~ presented by Citizens State Bank",
    link: "https://events.ourayridgwayevents.com/event/the-ridgway-1k-rally-thru-the-alley-2026-presented-by-citizens-state-bank",
    description: "Ridgway 1K ~ Rally Through The Alley: Colorado’s Most Entertaining Fun Run Event Date: October 4, 2026 In-person Registration Opens: 12:15 PM Race Starts: 12:45 PM Last Call for Runners: 1:15 PM (all runners must be checked-in by 1:15 pm). Downtown Ridgway, Colorado Join the most hilarious costumed fun run in Colorado! The Ridgway 1K Rally Through The Alley is a family-friendly, costume-themed, 1K race in downtown Ridgway. But don’t be fooled—this 6-block, downhill “race” is all about fun, food, and funky vibes, not speed. Why It’s a Must-Do Event: Open to all ages and fitness levelsCostumes are encouraged (and rewarded!)8 unique aid stations featuring outrageous snacks like bacon, donuts, and hot dogsThe race ends with live music in Hartwell ParkAdd-on available: Access to the San Juan Barrel Fest, a regional craft beer, wine, and cider tasting festival Pro Tip: In the Ridgway 1K, if you’re first… you’re last! …",
    pubDate: "2026-10-04T18:15:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Ridgway (Old Schoolhouse)",
    imageUrl: "https://localist-images.azureedge.net/photos/52594955200102/huge/3db67c1200c0d9d2af4a79fb63697fe875912a78.jpg"
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
    title: "CORAL SKYE",
    link: "https://events.ourayridgwayevents.com/event/coral-skye-7671",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-10-06T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  }
];

const NORWOOD_EVENTS = [
  {
    title: "Board Of Trustees Work Session",
    link: "https://www.norwoodtown.com/2026-08-05-board-of-trustees-work-session",
    description: "",
    pubDate: "2026-08-05T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Music On The Mesa The Burroughs",
    link: "https://www.norwoodparkandrec.org/music-on-the-mesa-2026",
    description: "",
    pubDate: "2026-08-08T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Norwood Park & Recreation District",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "NWC Meeting",
    link: "https://www.norwoodtown.com/2026-08-11-nwc-meeting",
    description: "",
    pubDate: "2026-08-11T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Board Of Trustees Meeting",
    link: "https://www.norwoodtown.com/2026-08-12-board-of-trustees-meeting",
    description: "",
    pubDate: "2026-08-12T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Norwood Sanitation District Meeting",
    link: "https://www.norwoodtown.com/2026-08-13-norwood-sanitation-district-meeting-meeting",
    description: "",
    pubDate: "2026-08-13T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Planning And Zoning Commission Meeting",
    link: "https://www.norwoodtown.com/2026-08-17-planning-and-zoning-commission-meeting",
    description: "",
    pubDate: "2026-08-17T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Closed For Labor Day",
    link: "https://www.norwoodtown.com/2026-09-07-closed-for-labor-day",
    description: "",
    pubDate: "2026-09-07T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Town Closure",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Norwood Pioneer Days And Car Show",
    link: "https://www.norwoodtown.com/2026-09-26-norwood-pioneer-days-and-car-show",
    description: "",
    pubDate: "2026-09-26T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Closed For Columbus Day",
    link: "https://www.norwoodtown.com/2026-10-12-closed-for-columbus-day",
    description: "",
    pubDate: "2026-10-12T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Town Closure",
    location: "Norwood, CO",
    imageUrl: ""
  }
];

const MOUNTAIN_VILLAGE_EVENTS = [
  {
    title: "Music on the Green Presents Logan Metz",
    link: "https://townofmountainvillage.com/explore/events/all-events/music-on-the-green-presents-logan-metz/",
    description: "Beyond The Groove and TMVOA (tmvoa.org) present Logan Metz at Reflection Plaza in Mountain Village. The Friday shows are free, all ages and family friendly.",
    pubDate: "2026-08-07T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48859/logan_metz_1800x900px.png"
  },
  {
    title: "Mind Blown Telluride",
    link: "https://townofmountainvillage.com/explore/events/all-events/mind-blown-telluride-7/",
    description: "Magician Ty Gallenbeck presents Mind Blown Telluride. Since 2016 this highly acclaimed show has become a favorite of locals, tourist and celebrities.",
    pubDate: "2026-08-08T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
  },
  {
    title: "Sunday Rehab at Alloy Kitchen",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-at-alloy-kitchen/",
    description: "Sundays are for recovery, Mountain Village style. Sunday Rehab at Mountain Lodge's Alloy Kitchen runs each Sunday through October 11, 2026,",
    pubDate: "2026-08-09T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49380/sundays-at-alloy-1800x900.jpg"
  },
  {
    title: "Jazz Brunch",
    link: "https://townofmountainvillage.com/explore/events/all-events/jazz-brunch/",
    description: "New for 2026, Telluride Jazz Festival and the Madeline Hotel present the Jazz Brunch—a relaxed mountain gathering featuring great food, beautiful views,",
    pubDate: "2026-08-09T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49398/jazz-brunch-9x16.jpeg"
  },
  {
    title: "August Intergovernmental Worksession",
    link: "https://townofmountainvillage.com/explore/events/all-events/august-intergovernmental-worksession/",
    description: "The Town of Telluride hosts an Intergovernmental Worksession on August 10, 2026.",
    pubDate: "2026-08-10T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/32340/ig-worksessions-new_event.jpg"
  },
  {
    title: "Bike & Brewery Tour",
    link: "https://townofmountainvillage.com/explore/events/all-events/bike-brewery-tour/",
    description: "A guided two-brewery ride from the Mountain Lodge down to town. Route: Jurassic Trail to Meadows Trail to Telluride Brewing Co. for a complimentary beer,",
    pubDate: "2026-08-10T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49136/bike-and-brewery-tour-1800x900.jpg"
  },
  {
    title: "Mountain Village Merchant Meeting",
    link: "https://townofmountainvillage.com/explore/events/all-events/merchant-meeting/",
    description: "Join us for the monthly Mountain Village Merchant Meeting to be held on the second Tuesday of each month from 10 to 11 a.m. The meeting will be hybrid with",
    pubDate: "2026-08-11T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/27556/merchant_event-1.png"
  },
  {
    title: "Eco- Grief Workshop: Between Grief & Gratitude, where Love & Loss meet in a Changing World",
    link: "https://townofmountainvillage.com/explore/events/all-events/eco-grief-workshop-between-grief-gratitude-where-love-loss-meet-in-a-changing-world/",
    description: "Join Lauren Norton of Through the Woods Doula, Mollie Theis of EcoAction Partners and the Wilkinson Public Library for a four-",
    pubDate: "2026-08-11T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49601/between_grief_gratitude_web_16_x_9_in.png"
  },
  {
    title: "Market on the Plaza",
    link: "https://townofmountainvillage.com/explore/events/all-events/market-on-the-plaza/",
    description: "Mountain Village’s pedestrian-friendly Heritage Plaza comes alive with tents each Wednesday, June 10-September 9, 2026 with vendors selling farm-",
    pubDate: "2026-08-12T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/30820/motp26_web_market_1800x9006.png"
  },
  {
    title: "Wine and Wickets",
    link: "https://townofmountainvillage.com/explore/events/all-events/wine-and-wickets/",
    description: "Complimentary wine tasting paired with lawn games at Alloy Ranch. Drop in, pour through a few featured wines with our team, try your hand at croquet,",
    pubDate: "2026-08-12T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49138/wine-and-wickets-1800x900.jpg"
  },
  {
    title: "Music on the Green Presents Ben Musser & Walker Young",
    link: "https://townofmountainvillage.com/explore/events/all-events/music-on-the-green-presents-ben-musser-walker-young/",
    description: "Beyond The Groove and TMVOA (tmvoa.org) present Ben Musser & Walker Young at Reflection Plaza in Mountain Village. The Friday shows are free,",
    pubDate: "2026-08-14T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48861/ben_musser_walker_young_1800x900px.png"
  },
  {
    title: "Mind Blown Telluride",
    link: "https://townofmountainvillage.com/explore/events/all-events/mind-blown-telluride-7/",
    description: "Magician Ty Gallenbeck presents Mind Blown Telluride. Since 2016 this highly acclaimed show has become a favorite of locals, tourist and celebrities.",
    pubDate: "2026-08-15T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
  },
  {
    title: "Sunday Rehab at Alloy Kitchen",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-at-alloy-kitchen/",
    description: "Sundays are for recovery, Mountain Village style. Sunday Rehab at Mountain Lodge's Alloy Kitchen runs each Sunday through October 11, 2026,",
    pubDate: "2026-08-16T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49380/sundays-at-alloy-1800x900.jpg"
  },
  {
    title: "Lunch and Learn: Region 10 Enterprise Zone- what does this mean for businesses?",
    link: "https://townofmountainvillage.com/explore/events/all-events/lunch-and-learn-region-10-enterprise-zone-what-does-this-mean-for-businesses/",
    description: "The Town of Mountain Village is pleased to host Region 10 for a Lunch and Learn session about the new Enterprise Zone boundary amendment.",
    pubDate: "2026-08-17T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49517/lunch_learn_-_simple_9.png"
  },
  {
    title: "Bike & Brewery Tour",
    link: "https://townofmountainvillage.com/explore/events/all-events/bike-brewery-tour/",
    description: "A guided two-brewery ride from the Mountain Lodge down to town. Route: Jurassic Trail to Meadows Trail to Telluride Brewing Co. for a complimentary beer,",
    pubDate: "2026-08-17T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49136/bike-and-brewery-tour-1800x900.jpg"
  },
  {
    title: "Eco- Grief Workshop: Between Grief & Gratitude, where Love & Loss meet in a Changing World",
    link: "https://townofmountainvillage.com/explore/events/all-events/eco-grief-workshop-between-grief-gratitude-where-love-loss-meet-in-a-changing-world/",
    description: "Join Lauren Norton of Through the Woods Doula, Mollie Theis of EcoAction Partners and the Wilkinson Public Library for a four-",
    pubDate: "2026-08-18T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49601/between_grief_gratitude_web_16_x_9_in.png"
  },
  {
    title: "Sunset Concert Series",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunset-concert-series/",
    description: "Set against the stunning alpine backdrop of Mountain Village, TMVOA's Sunset Concert Series returns for its 25th year—bringing free,",
    pubDate: "2026-08-19T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/41147/scs_event_thumbnail.png"
  },
  {
    title: "Market on the Plaza",
    link: "https://townofmountainvillage.com/explore/events/all-events/market-on-the-plaza/",
    description: "Mountain Village’s pedestrian-friendly Heritage Plaza comes alive with tents each Wednesday, June 10-September 9, 2026 with vendors selling farm-",
    pubDate: "2026-08-19T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/30820/motp26_web_market_1800x9006.png"
  },
  {
    title: "Wine and Wickets",
    link: "https://townofmountainvillage.com/explore/events/all-events/wine-and-wickets/",
    description: "Complimentary wine tasting paired with lawn games at Alloy Ranch. Drop in, pour through a few featured wines with our team, try your hand at croquet,",
    pubDate: "2026-08-19T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49138/wine-and-wickets-1800x900.jpg"
  },
  {
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars returns to the Conference Center Plaza this summer, running every Saturday at dusk from June 13 through August 15. New this year,",
    pubDate: "2026-08-22T12:00:00.000Z",
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
    pubDate: "2026-08-22T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
  },
  {
    title: "Sunday Rehab at Alloy Kitchen",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-at-alloy-kitchen/",
    description: "Sundays are for recovery, Mountain Village style. Sunday Rehab at Mountain Lodge's Alloy Kitchen runs each Sunday through October 11, 2026,",
    pubDate: "2026-08-23T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49380/sundays-at-alloy-1800x900.jpg"
  },
  {
    title: "Bike & Brewery Tour",
    link: "https://townofmountainvillage.com/explore/events/all-events/bike-brewery-tour/",
    description: "A guided two-brewery ride from the Mountain Lodge down to town. Route: Jurassic Trail to Meadows Trail to Telluride Brewing Co. for a complimentary beer,",
    pubDate: "2026-08-24T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49136/bike-and-brewery-tour-1800x900.jpg"
  },
  {
    title: "Eco- Grief Workshop: Between Grief & Gratitude, where Love & Loss meet in a Changing World",
    link: "https://townofmountainvillage.com/explore/events/all-events/eco-grief-workshop-between-grief-gratitude-where-love-loss-meet-in-a-changing-world/",
    description: "Join Lauren Norton of Through the Woods Doula, Mollie Theis of EcoAction Partners and the Wilkinson Public Library for a four-",
    pubDate: "2026-08-25T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49601/between_grief_gratitude_web_16_x_9_in.png"
  },
  {
    title: "Market on the Plaza",
    link: "https://townofmountainvillage.com/explore/events/all-events/market-on-the-plaza/",
    description: "Mountain Village’s pedestrian-friendly Heritage Plaza comes alive with tents each Wednesday, June 10-September 9, 2026 with vendors selling farm-",
    pubDate: "2026-08-26T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/30820/motp26_web_market_1800x9006.png"
  },
  {
    title: "Wine and Wickets",
    link: "https://townofmountainvillage.com/explore/events/all-events/wine-and-wickets/",
    description: "Complimentary wine tasting paired with lawn games at Alloy Ranch. Drop in, pour through a few featured wines with our team, try your hand at croquet,",
    pubDate: "2026-08-26T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49138/wine-and-wickets-1800x900.jpg"
  },
  {
    title: "Gaiascope Opening Night",
    link: "https://townofmountainvillage.com/explore/events/all-events/gaiascope-opening-night/",
    description: "Celebrate the opening of Gaiascope with artist Brooke Einbender during a special golden hour gathering in the Heritage Plaza, Mountain Village.",
    pubDate: "2026-08-26T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49529/akb_1557-1.jpeg"
  },
  {
    title: "Music on the Green Presents Cristina Vane",
    link: "https://townofmountainvillage.com/explore/events/all-events/music-on-the-green-presents-cristina-vane/",
    description: "Beyond The Groove and TMVOA (tmvoa.org) present Cristina Vane at Reflection Plaza in Mountain Village. The Friday shows are free, all ages and family friendly.",
    pubDate: "2026-08-28T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48865/cristina_vane_1800x900px_1.png"
  },
  {
    title: "Camp Alderwild",
    link: "https://townofmountainvillage.com/explore/events/all-events/camp-alderwild-1/",
    description: "Camp Alderwild returns to Telluride, Colorado August 28th + 29th with Of The Trees & Daily Bread.",
    pubDate: "2026-08-28T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49541/campalderwild_2026_telluride_support_1800x900.png"
  },
  {
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars returns to the Conference Center Plaza this summer, running every Saturday at dusk from June 13 through August 15. New this year,",
    pubDate: "2026-08-29T12:00:00.000Z",
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
    pubDate: "2026-08-29T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
  },
  {
    title: "Sunday Rehab at Alloy Kitchen",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-at-alloy-kitchen/",
    description: "Sundays are for recovery, Mountain Village style. Sunday Rehab at Mountain Lodge's Alloy Kitchen runs each Sunday through October 11, 2026,",
    pubDate: "2026-08-30T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49380/sundays-at-alloy-1800x900.jpg"
  },
  {
    title: "Bike & Brewery Tour",
    link: "https://townofmountainvillage.com/explore/events/all-events/bike-brewery-tour/",
    description: "A guided two-brewery ride from the Mountain Lodge down to town. Route: Jurassic Trail to Meadows Trail to Telluride Brewing Co. for a complimentary beer,",
    pubDate: "2026-08-31T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49136/bike-and-brewery-tour-1800x900.jpg"
  },
  {
    title: "Eco- Grief Workshop: Between Grief & Gratitude, where Love & Loss meet in a Changing World",
    link: "https://townofmountainvillage.com/explore/events/all-events/eco-grief-workshop-between-grief-gratitude-where-love-loss-meet-in-a-changing-world/",
    description: "Join Lauren Norton of Through the Woods Doula, Mollie Theis of EcoAction Partners and the Wilkinson Public Library for a four-",
    pubDate: "2026-09-01T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49601/between_grief_gratitude_web_16_x_9_in.png"
  },
  {
    title: "Market on the Plaza",
    link: "https://townofmountainvillage.com/explore/events/all-events/market-on-the-plaza/",
    description: "Mountain Village’s pedestrian-friendly Heritage Plaza comes alive with tents each Wednesday, June 10-September 9, 2026 with vendors selling farm-",
    pubDate: "2026-09-02T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/30820/motp26_web_market_1800x9006.png"
  },
  {
    title: "Wine and Wickets",
    link: "https://townofmountainvillage.com/explore/events/all-events/wine-and-wickets/",
    description: "Complimentary wine tasting paired with lawn games at Alloy Ranch. Drop in, pour through a few featured wines with our team, try your hand at croquet,",
    pubDate: "2026-09-02T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49138/wine-and-wickets-1800x900.jpg"
  },
  {
    title: "Music on the Green Presents Daniel Rodriguez",
    link: "https://townofmountainvillage.com/explore/events/all-events/music-on-the-green-presents-daniel-rodriguez-4/",
    description: "Beyond The Groove and TMVOA (tmvoa.org) present Daniel Rodriguez at Reflection Plaza in Mountain Village. The Friday shows are free,",
    pubDate: "2026-09-04T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48867/daniel_rodriguez_1800x900px.png"
  },
  {
    title: "Town Talk: Single molecule views of Nature&#039;s nanomachines",
    link: "https://townofmountainvillage.com/explore/events/all-events/town-talk-single-molecule-views-of-natures-nanomachines/",
    description: "This town talk will be presented by Taekjip (TJ) Ha, Harvard Medical School, Boston Children’s Hospital, Howard Hughes Medical School.",
    pubDate: "2026-09-04T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48909/tt_logo_1048x802_a.png"
  },
  {
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars returns to the Conference Center Plaza this summer, running every Saturday at dusk from June 13 through August 15. New this year,",
    pubDate: "2026-09-05T12:00:00.000Z",
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
    pubDate: "2026-09-05T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
  },
  {
    title: "Sunday Rehab at Alloy Kitchen",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-at-alloy-kitchen/",
    description: "Sundays are for recovery, Mountain Village style. Sunday Rehab at Mountain Lodge's Alloy Kitchen runs each Sunday through October 11, 2026,",
    pubDate: "2026-09-06T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49380/sundays-at-alloy-1800x900.jpg"
  }
];

const TELLURIDE_COM_EVENTS = [
  {
    title: "Gondola Closed for Maintenance",
    link: "https://www.telluride.com/event/gondola-closes-for-maintenance/",
    description: "The gondola will be closed for maintenance starting October 26 and will re-open for winter at 6:30 a.m. on November 20, …",
    pubDate: "2026-04-06",
    endDate: "2026-11-20",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/45301/gondola-rainbow-2-high-res-2100x1401-f18dd3a9-0d2b-4ff7-b99c-2c162daf4e94.800x533.webp"
  },
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
    title: "Creative Exchange",
    link: "https://www.telluride.com/event/creative-exchange/",
    description: "The Creative Exchange is a brand-new monthly series by Telluride Arts designed for the artists and creatives who call …",
    pubDate: "2026-05-14",
    endDate: "2026-09-10",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/60815/download_1.800x533.webp"
  },
  {
    title: "Music on the Green Summer Concert Series",
    link: "https://www.telluride.com/event/music-on-the-green-summer-concert-series/",
    description: "The Telluride Mountain Village Owners Association (TMVOA) and Beyond the Groove Productions Present Music on the Green …",
    pubDate: "2026-05-29",
    endDate: "2026-09-18",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44414/16c6ff81-d87c-823e-1bd2-8a66b859eb9d.800x533.webp"
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
    title: "Telluride Farmers&#039; Market Music Series",
    link: "https://www.telluride.com/event/telluride-farmers-market-music-series/",
    description: "Augment Music Project sponsors local music in various ways, including weekly performances at the Telluride Farmers' …",
    pubDate: "2026-05-29",
    endDate: "2026-09-26",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/54793/20240705_111835.800x533.webp"
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
    title: "Rooftop Pop-Up Local Artist Market",
    link: "https://www.telluride.com/event/pop-up-local-artist-market/",
    description: "Shop an incredible rotating selection of Ah Haa’s staff, instructors and open studio memeber’s artwork in the …",
    pubDate: "2026-06-04",
    endDate: "2026-09-03",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58400/screenshot_2026-01-21_at_4_30_00_pm.800x533.webp"
  },
  {
    title: "Free Tasting",
    link: "https://www.telluride.com/event/free-tasting-at-telluride-wine-merchant/",
    description: "Free tasting every Thursday from 4-6pm. The theme of the tasting will vary from different seasonal selections in wine, …",
    pubDate: "2026-06-04",
    endDate: "2026-09-24",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62697/screenshot_2026-06-03_at_1_50_16_pm.800x533.webp"
  },
  {
    title: "Games on the Green",
    link: "https://www.telluride.com/event/games-on-the-green/",
    description: "Head to The Madeline on Saturdays through Thursdays this summer for Games on the Green! They will have classic lawn …",
    pubDate: "2026-06-06",
    endDate: "2026-09-25",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62453/mtv_summer_selects_lowres-62-2100x1401-5ba5db78-3cf7-49e2-a790-62927e14c194.800x533.webp"
  },
  {
    title: "Town Talks",
    link: "https://www.telluride.com/event/town-talks/",
    description: "Each summer, Telluride Science brings together some of the world’s brightest minds to tackle the most pressing …",
    pubDate: "2026-06-09",
    endDate: "2026-08-11",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/54293/town-talks-grid1.800x533.webp"
  },
  {
    title: "Augment Summer Music Series",
    link: "https://www.telluride.com/event/augment-summer-music-series/",
    description: "Telluride's local non-profit organization Augment Music Project is hosting monthly concerts in Elks Park this summer. …",
    pubDate: "2026-06-09",
    endDate: "2026-09-15",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/53672/download_1.800x533.webp"
  },
  {
    title: "Market on the Plaza - Mountain Village",
    link: "https://www.telluride.com/event/market-on-the-plaza-mountain-village/",
    description: "Market on the Plaza is a vibrant local community market providing an avenue to support regional and local businesses …",
    pubDate: "2026-06-10",
    endDate: "2026-09-09",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44431/mplantz-3995.800x533.webp"
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
    title: "Telluride Gold Kings",
    link: "https://www.telluride.com/event/telluride-gold-kings/",
    description: "Dance and sing along with the Telluride Gold Kings every Thursday this summer. Free admission!",
    pubDate: "2026-06-11",
    endDate: "2026-09-24",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58285/download_9.800x533.webp"
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
    title: "Movies Under the Stars",
    link: "https://www.telluride.com/event/movies-under-the-stars/",
    description: "Bundle up and bring the family down to Conference Center Plaza in Mountain Village for Movies Under the Stars! Movies …",
    pubDate: "2026-06-13",
    endDate: "2026-08-15",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44447/screenshot_2026-05-15_at_3_52_12_pm.800x533.webp"
  },
  {
    title: "Music on the Mesa",
    link: "https://www.norwoodparkandrec.org/music-on-the-mesa-2026",
    description: "Music on the Mesa is a FREE outdoor concert series presented two Saturdays a summer by Norwood Park & Rec District, …",
    pubDate: "2026-06-13",
    endDate: "2026-08-08",
    source: "telluride-com",
    sourceLabel: "Norwood Park & Recreation District",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62177/screenshot_2026-04-09_at_2_09_57_pm.800x533.webp"
  },
  {
    title: "Sunday Rehab",
    link: "https://www.telluride.com/event/sunday-rehab/",
    description: "Sunday Rehab brings the Mountain Lodge pool deck to life every Sunday with brunch, a Bloody Mary and juice bar, food …",
    pubDate: "2026-06-14",
    endDate: "2026-10-04",
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
    endDate: "2026-09-02",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62830/the_national_wine.800x533.webp"
  },
  {
    title: "Sunset Concert Series",
    link: "https://www.telluride.com/event/sunset-music-concert-series/",
    description: "The Telluride Mountain Village Owners Association (TMVOA) has announced the return of the Sunset Concert Series for the …",
    pubDate: "2026-06-24",
    endDate: "2026-08-19",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44886/sunsetconcert.800x533.webp"
  },
  {
    title: "Oak Street Park SummerSHOW Series",
    link: "https://www.telluride.com/event/oak-street-park-summershow-series/",
    description: "The Sheridan Opera House’s SHOW Bar has proudly hosted free summer patio shows to keep the arts accessible to all. …",
    pubDate: "2026-06-25",
    endDate: "2026-09-24",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58332/dsc01583lr--1-.800x533.webp"
  },
  {
    title: "Mind Blown",
    link: "https://www.telluride.com/event/mind-blown/",
    description: "Magician Ty Gallenbeck presents Mind Blown Telluride. Since 2016 this highly acclaimed show has become a favorite of …",
    pubDate: "2026-07-03",
    endDate: "2026-09-04",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/36321/couch_1600x900.800x533.webp"
  },
  {
    title: "Village Film Nights",
    link: "https://www.telluride.com/event/village-film-nights/",
    description: "The Telluride Film Festival, in collaboration with the Town of Mountain Village, the Telluride Conference Center, and …",
    pubDate: "2026-07-05",
    endDate: "2026-08-10",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58512/screenshot_2026-08-05_at_11_35_27_am.800x533.webp"
  },
  {
    title: "Alpine Chapel Outdoor Service",
    link: "https://www.telluride.com/event/alpine-chapel-outdoor-service/",
    description: "The Alpine Chapel will host an outdoor worship service at the Sunset Plaza Stage in Mountain Village at 9:30 a.m.",
    pubDate: "2026-07-05",
    endDate: "2026-09-06",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62860/img_4897.800x533.webp"
  },
  {
    title: "Chill With Chamber Music",
    link: "https://www.telluride.com/event/chill-with-chamber-music/",
    description: "Telluride Chamber Music is bringing music to the West End of the county with Community Concerts at the beautiful Livery …",
    pubDate: "2026-07-23",
    endDate: "2026-08-27",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58269/norwood.800x533.webp"
  },
  {
    title: "Wine and Wickets",
    link: "https://www.telluride.com/event/wine-and-wickets/",
    description: "Complimentary wine tasting paired with lawn games at Alloy Ranch. Drop in, pour through a few featured wines with our …",
    pubDate: "2026-07-29",
    endDate: "2026-10-14",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63144/wine-and-wickets-1800x900_870x435.800x533.webp"
  },
  {
    title: "Live at the Drive",
    link: "https://www.telluride.com/event/live-at-the-drive/",
    description: "Join KOTO for a party at the purple house! They will be closing down North Pine Street and using the driveway as a …",
    pubDate: "2026-07-30",
    endDate: "2026-08-27",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/54474/dsc08059lr.800x533.webp"
  },
  {
    title: "Bike and Brewery Tour",
    link: "https://www.telluride.com/event/bike-and-brewery-tour/",
    description: "A guided two-brewery ride from the Mountain Lodge down to town. Route: Jurassic Trail to Meadows Trail to Telluride …",
    pubDate: "2026-08-03",
    endDate: "2026-10-12",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63161/bike-and-brewery-tour-1800x900_870x435.800x533.webp"
  },
  {
    title: "Eco-Grief Workshops: Between Grief & Gratitude",
    link: "https://www.telluride.com/event/eco-grief-workshops-between-grief-gratitude-where-love-and-loss-meet-in-a-changing-world/",
    description: "Join Lauren Norton of Through the Woods Doula, Mollie Theis of EcoAction Partners and the Wilkinson Public Library for …",
    pubDate: "2026-08-04",
    endDate: "2026-08-25",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63241/between_grief_gratitude_web_16_x_9_in.800x533.webp"
  },
  {
    title: "Sandra Frias Trunk Show",
    link: "https://www.telluride.com/event/sandra-frias-trunk-show/",
    description: "Sandra Frias will be joining us in Fringe Gallery for an exclusive Telluride Trunk Show from August 5th-9th! Sandra is …",
    pubDate: "2026-08-05",
    endDate: "2026-08-10",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63137/untitled_-_july_26-_2026_at_17_08_07_3.800x533.webp"
  },
  {
    title: "Telluride Jazz Festival",
    link: "https://www.telluride.com/event/telluride-jazz-festival/",
    description: "Since 1977, Telluride’s majestic perch high in the San Juan Mountains of southwestern Colorado has been the site of …",
    pubDate: "2026-08-07",
    endDate: "2026-08-09",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/28880/14407123460f9210.800x533.webp"
  },
  {
    title: "KOTO Duck Race",
    link: "https://www.telluride.com/event/koto-duck-race/",
    description: "The Ducks are trained and ready to rumble! KOTO’s Duck Race is happening on August 7, and there are a ton of …",
    pubDate: "2026-08-07",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44995/rubber-duck-race-white-no-rotary-logo-or-heading_20200710-224712.800x533.webp"
  },
  {
    title: "Colorado Capsule on Tour",
    link: "https://www.telluride.com/event/colorado-capsule-on-tour/",
    description: "The Colorado Capsule is a statewide community time capsule project created to commemorate America’s 250th anniversary …",
    pubDate: "2026-08-10",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63281/screenshot_2026-08-07_at_3_21_27_pm.800x533.webp"
  },
  {
    title: "Telluride Mushroom Festival",
    link: "https://www.telluride.com/event/telluride-mushroom-festival/",
    description: "Since 1981, the Telluride Mushroom Festival has been celebrating all things mycological, from the newest advancements …",
    pubDate: "2026-08-12",
    endDate: "2026-08-17",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/45066/2-2-26-4to3-full-color-poster.800x533.webp"
  },
  {
    title: "Community Concert",
    link: "https://www.telluride.com/event/community-concert/",
    description: "A fun and free chamber music series featuring talented local musicians. These concerts will appeal to both first time …",
    pubDate: "2026-08-13",
    endDate: "2026-09-10",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/60285/download_8.800x533.webp"
  },
  {
    title: "Studio TAB: Summer Fever",
    link: "https://www.telluride.com/event/studio-tab-summer-fever/",
    description: "Join the Telluride AIDS Benefit for a new Summer event! Located at a private home in Aldasoro, overlooking Wilson Peak, …",
    pubDate: "2026-08-15",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63131/tab_studio_tab_sig_2027.800x533.webp"
  },
  {
    title: "\"Best Day Ever\" Free Movie Screening",
    link: "https://www.telluride.com/event/best-day-ever-free-movie-screening/",
    description: "Join Telluride Adaptive Sports Program (TASP) for a free community screening of Best Day Ever, the Audience Choice …",
    pubDate: "2026-08-19",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63200/best_day_ever.800x533.webp"
  },
  {
    title: "Blizzard Sale",
    link: "https://www.telluride.com/event/blizzard-sale/",
    description: "Save up to 70% at Telluride’s BIGGEST and BEST sale on skis, boots, bindings, bikes, outerwear, footwear, accessories …",
    pubDate: "2026-08-20",
    endDate: "2026-08-24",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63174/blizzard_sale_870x435.800x533.webp"
  },
  {
    title: "Burlesque Buffet",
    link: "https://www.telluride.com/event/burlesque-buffet/",
    description: "Presented by Telluride Theatre's Professional Burlesque Troupe: THE HOUSE OF SHIMMY SHAKE! HOSS returns for a …",
    pubDate: "2026-08-21",
    endDate: "2026-08-23",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62743/buffet_visit_telluride_image.800x533.webp"
  },
  {
    title: "Noche de Luz (Night of Light)",
    link: "https://www.telluride.com/event/noche-de-luz-night-of-light/",
    description: "Join Tri-County Health Network for a Night of Light, Celebrating our Community in Bloom! A Vibrant Celebration of …",
    pubDate: "2026-08-21",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62940/untitled_2200_x_1237_px.800x533.webp"
  },
  {
    title: "Telluride Mountain Run",
    link: "https://www.telluride.com/event/telluride-mountain-run/",
    description: "The Telluride Mountain Run is a challenging and technical mountain race in the San Juan Mountains above the beautiful …",
    pubDate: "2026-08-22",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/55221/screenshot_2024-08-27_at_2_39_13_pm.800x533.webp"
  },
  {
    title: "Wax Monkey",
    link: "https://www.telluride.com/event/wax-monkey/",
    description: "Wax Monkey is a 5-piece jam band composed of childhood friends hailing from Birmingham, Alabama. The members first …",
    pubDate: "2026-08-22",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62312/screenshot_2026-04-29_at_2_59_37_pm.800x533.webp"
  },
  {
    title: "Gaiascope Opening Night",
    link: "https://www.telluride.com/event/gaiascope-opening-night/",
    description: "Celebrate the opening of Gaiascope with artist Brooke Einbender during a special golden hour gathering in the Heritage …",
    pubDate: "2026-08-26",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63278/akb_1557-1_870x435.800x533.webp"
  },
  {
    title: "Coffee & Climate Conversations",
    link: "https://www.telluride.com/event/coffee-climate-conversations/",
    description: "From big adventures to spending time with family and friends, recreation is often at the heart of our experiences on …",
    pubDate: "2026-08-27",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/57231/download_16.800x533.webp"
  },
  {
    title: "Camp Alderwild",
    link: "https://www.telluride.com/event/camp-alderwild/",
    description: "Denver-based producer Of the Trees will be returning to play two nights at Town Park this summer. Of The Trees will be …",
    pubDate: "2026-08-28",
    endDate: "2026-08-30",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/57622/of_the_trees_by_frankie_zarantonello.800x533.webp"
  },
  {
    title: "Full Circle Fashion Fundraiser",
    link: "https://www.telluride.com/event/full-circle-fashion-fundraiser/",
    description: "EcoAction Partners and The Ah Haa School for the Arts are hosting a Full Circle Fashion Fundraiser Saturday August 29th …",
    pubDate: "2026-08-29",
    endDate: "2026-08-31",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63239/fcf_web.800x533.webp"
  },
  {
    title: "Mountain Towns 2030: Leveraging A Network of Community Leaders to Accelerate Climate Action",
    link: "https://www.telluride.com/event/mountain-towns-2030-leveraging-a-network-of-community-leaders-to-accelerate-climate-action/",
    description: "As climate challenges grow, no community can solve them alone. The most effective solutions often emerge when leaders …",
    pubDate: "2026-09-02",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63253/telluride_com.800x533.webp"
  },
  {
    title: "America 250 - Colorado 150 \"Stories in the Sky\" Drone Show",
    link: "https://www.telluride.com/event/america-250-colorado-150-stories-in-the-sky-drone-show/",
    description: "The America 250 - Colorado 150 Commission is taking its milestone celebrations to new heights with Stories in the Sky, …",
    pubDate: "2026-09-03",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62752/colorado_250-150.800x533.webp"
  },
  {
    title: "Telluride Film Festival",
    link: "https://www.telluride.com/event/telluride-film-festival/",
    description: "Each Labor Day weekend, the tiny mountain village of Telluride, Colorado triples in size. Swells of passionate film …",
    pubDate: "2026-09-04",
    endDate: "2026-09-08",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/28877/144071284720c1c00935.800x533.webp"
  },
  {
    title: "The Meditations",
    link: "https://www.telluride.com/event/the-meditations/",
    description: "Founded in Jamaica in the 1970s, The Meditations are legendary roots reggae pioneers whose soulful harmonies and …",
    pubDate: "2026-09-11",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62648/meditations_poster_template_2018.800x533.webp"
  },
  {
    title: "Imogene Pass Run",
    link: "https://www.telluride.com/event/imogene-pass-run/",
    description: "What began as a way to train for the Pike's Peak marathon in 1974 is now a full-fledged race. The race ventures from …",
    pubDate: "2026-09-12",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/28638/149445047981c35a961.800x533.webp"
  },
  {
    title: "A Telluride Theatre FRINGE Project: La Familia Music Group",
    link: "https://www.telluride.com/event/a-telluride-theatre-fringe-project-la-familia-music-group/",
    description: "Created by La Familia Music Group, this day of youth workshops culminates in a community concert, showcasing student …",
    pubDate: "2026-09-12",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62898/screenshot_2026-06-15_at_11_29_51_am.800x533.webp"
  },
  {
    title: "Balourdet Quartet",
    link: "https://www.telluride.com/event/balourdet-quartet/",
    description: "A concert by the multi-award winning Balourdet String Quartet. One of the most inspiring quartets of their generation. …",
    pubDate: "2026-09-13",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62218/balourdet.800x533.webp"
  },
  {
    title: "TASP Bob Miller Memorial Golf Classic",
    link: "https://www.telluride.com/event/tasp-bob-miller-memorial-golf-classic/",
    description: "Tee off for a cause at 9,500 feet! Join the Telluride Adaptive Sports Program for the 28th Annual Bob Miller Memorial …",
    pubDate: "2026-09-17",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/55141/download_13.800x533.webp"
  },
  {
    title: "Telluride Blues & Brews Festival",
    link: "https://www.telluride.com/event/telluride-blues-brews-festival/",
    description: "Renowned as one of the most scenic and intimate music festivals in the country, Telluride Blues & Brews Festival is …",
    pubDate: "2026-09-18",
    endDate: "2026-09-21",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/32823/bluesandbrewsperformer-medium.800x533.webp"
  },
  {
    title: "Crystal Festival - A Rock, Mineral, Gem, & Crystal Show",
    link: "https://www.telluride.com/event/crystal-festival-a-rock-mineral-gem-crystal-show-1/",
    description: "Head to Telluride for the Crystal Festival, an educational and vendor event featuring rocks, minerals, fossils, …",
    pubDate: "2026-09-19",
    endDate: "2026-09-21",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/61644/img_7366.800x533.webp"
  },
  {
    title: "Telluride Autumn Classic",
    link: "https://www.telluride.com/event/telluride-autumn-classic/",
    description: "A Colorful Car Show in the Mountains\n\nWhile still very much a celebration of cars and colors, the Autumn Classic is the …",
    pubDate: "2026-09-24",
    endDate: "2026-09-28",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/37495/0_dvs_4564_small_2mp.800x533.webp"
  },
  {
    title: "Corvettes & Colors",
    link: "https://www.telluride.com/event/corvettes-colors/",
    description: "Corvettes, and their owners, are invited to celebrate the Rocky Mountain Fall colors, the crisp San Juan Mountain air …",
    pubDate: "2026-09-24",
    endDate: "2026-09-28",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48115/2023_corvettes_and_colors.800x533.webp"
  },
  {
    title: "Mountains to the Desert Classic",
    link: "https://www.telluride.com/event/mountains-to-the-desert-classic/",
    description: "The Mountains to the Desert Classic (M2D) is celebrating its 22 Anniversary as the primary fundraising event for the …",
    pubDate: "2026-09-26",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48458/m2dlogonob_g.800x533.webp"
  },
  {
    title: "Original Thinkers",
    link: "https://www.telluride.com/event/original-thinkers/",
    description: "Original Thinkers returns to breathtaking Telluride, Colorado, for the highly anticipated ninth annual festival, taking …",
    pubDate: "2026-10-01",
    endDate: "2026-10-05",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/28484/ot_poster_2025_final.800x533.webp"
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
    title: "Artabout",
    link: "https://www.telluride.com/event/artabout/",
    description: "For visitors and residents alike, you can Telluride the first week of October with Ah Haa as your guide. Artabout …",
    pubDate: "2026-10-03",
    endDate: "2026-10-05",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62618/art-about-draft-768x369.800x533.webp"
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
    title: "Property Tax Exemption -- Senior Citizens and Veterans with Disability",
    entity: "San Miguel County Assessor",
    entityClass: "ent-county",
    entityLogo: "state",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "San Miguel County Assessor announces property tax exemption applications for qualifying senior citizens (65+), veterans with 100% service-connected disability, gold star veteran spouses, and qualified senior primary residential classification. Applications must be submitted by July 15, with late applications accepted until August 15.",
    deadline: "July 15, 2026",
    expires: "2026-08-15",
    dates: "4/30",
    papers: ["ttimes_0430"],
    url: "https://www.telluridenews.com/news/legals/article_3718afea-4523-4a88-a728-754e3336d2f8.html",
    address: "San Miguel County",
    noticeKey: "property-tax-exemption-2026"
  },
  {
    title: "Request for Proposal -- Foundation Repairs at the Placerville Schoolhouse",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking qualified respondents for: Foundation Repairs at the Placerville Schoolhouse.",
    deadline: "Open until contracted",
    expires: "2026-08-14",
    dates: "5/16",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=188",
    address: "",
    smcBidID: "188"
  },
  {
    title: "Request for Proposal -- Trout Lake Water Tank Roofing",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking qualified respondents for: Trout Lake Water Tank Roofing.",
    deadline: "Open until contracted",
    expires: "2026-08-14",
    dates: "5/16",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=187",
    address: "",
    smcBidID: "187"
  },
  {
    title: "Property Tax Exemption -- Senior Citizens, Veterans, and Gold Star Spouses",
    entity: "San Miguel County Assessor",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "San Miguel County Assessor is informing residents about property tax exemptions available for qualifying senior citizens (65+), veterans with disabilities, and gold star veteran spouses. The exemption covers 50% of the first $200,000 in actual value of primary residences, with applications due by July 15 (late applications accepted until August 15).",
    deadline: "July 15, 2026 (late applications until August 15, 2026)",
    expires: "2026-08-15",
    dates: "5/28",
    papers: ["ttimes_0528"],
    url: "https://www.telluridenews.com/news/legals/article_0adc5789-cb68-4509-b7a8-1e8bf62a4c8e.html",
    address: "San Miguel County",
    noticeKey: "tax-exemption-2026"
  },
  {
    title: "Water Court Application -- Trout Lake Reservoir Storage Rights (Case No. 26CW3028)",
    entity: "Colorado District Court, Water Division No. 4",
    entityClass: "ent-county",
    entityLogo: "water_court",
    icon: "💧",
    iconClass: "type-bid",
    type: "Water Court",
    filterTag: "water-court",
    summary: "Telluride Preserve Homeowners Association filed an application to make absolute a 3.0 acre-foot conditional water right from Lake Fork of the San Miguel River for storage in Trout Lake Reservoir. The water right is for replacement of depletions and augmentation purposes, with beneficial use claimed as of June 16, 2025.",
    deadline: "Statutory protest period (typically 4-6 months from publication)",
    expires: "2026-08-31",
    dates: "6/11",
    papers: ["ttimes_0611"],
    url: "https://www.telluridenews.com/news/legals/article_6de56aef-d7ac-4c1e-bb5f-1bc3f669e424.html",
    address: "NE SW Section 8, Township 41 North, Range 9 West, NMPM",
    noticeKey: "26cw3028",
    caseNumber: "26CW3028"
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
    title: "Foreclosure Sale Notice -- Stonegate Drive Mountain Village (Sale No. 202603)",
    entity: "Federal Holding Realty / Public Trustee San Miguel County",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "The San Miguel County Public Trustee, Brandi R. Hatfield, will conduct a public foreclosure auction on August 13, 2026 at 10:00 a.m. at 305 W. Colorado Avenue, Telluride, for a vacant lot at Stonegate Drive, Mountain Village, CO 81435 (Lot 166AR2, Telluride Mountain Village). The original grantor is Two Stonegate LLC; the current debt holder is Federal Holding Realty, with an outstanding principal balance of $500,000.00 on a deed of trust dated February 23, 2026. The foreclosure is due to failure to make payments as provided in the Note and Deed of Trust.",
    deadline: "2026-08-13",
    expires: "2026-08-13",
    dates: "6/18",
    papers: ["ttimes_0618"],
    url: "https://www.telluridenews.com/news/legals/article_5efd4701-ba7f-46ef-a7bd-74a242fdff7a.html",
    address: "TBD (Vacant) Stonegate Drive, Mountain Village, CO 81435 (Lot 166AR2, Telluride Mountain Village, San Miguel County)",
    noticeKey: "foreclosure-sale-202603",
    caseNumber: "202603"
  },
  {
    title: "Public Hearing Notice -- Land Use Code Amendment New Section 5-31 Natural Medicine Businesses",
    entity: "San Miguel County Board of County Commissioners",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "The San Miguel County Board of County Commissioners is being asked to consider a Land Use Code amendment adding a new Section 5-31 governing Natural Medicine Businesses, along with related amendments to Article 7 (Definitions). The amendment requires review and recommendation by the County Planning Commission (CPC) and action by the Board of County Commissioners pursuant to LUC Section 3-601 D. This notice indicates this is the second step of a two-step public hearing process; full hearing details were not fully captured in the published text.",
    deadline: "",
    expires: "2026-08-18",
    dates: "6/18",
    papers: ["ttimes_0618"],
    url: "https://www.telluridenews.com/news/legals/article_5efd4701-ba7f-46ef-a7bd-74a242fdff7a.html",
    address: "San Miguel County, Colorado (countywide land use code)",
    noticeKey: "luc-amendment-5-31-natural-medicine"
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
    title: "Property Tax Exemption -- Senior Citizens, Disabled Veterans & Gold Star Spouses",
    entity: "San Miguel County Assessor's Office",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "San Miguel County is notifying qualifying senior citizens, veterans with a 100% service-connected disability rating (or individual unemployability status starting tax year 2025), and gold star veteran spouses that they may be eligible for a property tax exemption exempting 50% of the first $200,000 in actual value of their primary residence. Qualifying seniors must be at least 65, have owned and occupied the property as their primary residence for at least 10 consecutive years prior to January 1 of the application year. Applications must be submitted to the San Miguel County Assessor's office by July 15, with late applications accepted until August 15; contact the assessor at 970-728-3174.",
    deadline: "2026-07-15",
    expires: "2026-08-15",
    dates: "6/25",
    papers: ["ttimes_0625"],
    url: "https://www.telluridenews.com/news/legals/article_efb0ca71-953d-4278-b75b-d81bd2f09fe9.html",
    address: "San Miguel County, Colorado",
    noticeKey: "property-tax-exemption-senior-veteran-2026"
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
    title: "Lost Share Certificate Replacement -- Farmers' Water Development Company Share Certificate #887 (COL-000188)",
    entity: "Farmers' Water Development Company (FWDC)",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "💧",
    iconClass: "type-hearing",
    type: "Utilities",
    filterTag: "utilities",
    summary: "The Farmers' Water Development Company (FWDC) has received a written request to replace lost, destroyed, or wrongfully taken share certificate #887, currently issued in the name of A.F. Newans M.D., C.P. Any person wishing to object to the issuance of a replacement certificate must file written notice with FWDC at PO Box 10, Norwood, CO 81423 within 30 days of the last publication date in the Norwood Post. If no objection is received, a replacement certificate will be issued and the original will be permanently cancelled.",
    deadline: "2026-08-20",
    expires: "2026-08-20",
    dates: "7/9",
    papers: ["ttimes_0709"],
    url: "https://www.telluridenews.com/news/legals/article_c7bd6279-4a8b-494b-ac96-ee9c16f0bcd1.html",
    address: "PO Box 10, Norwood, CO 81423",
    noticeKey: "fwdc-share-cert-887"
  },
  {
    title: "Property Tax Exemption Notice -- Senior Citizens, Veterans with Disability, Gold Star Veteran Spouses (COL-000182)",
    entity: "San Miguel County Assessor",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "The Colorado Assessor's office is notifying qualifying senior citizens, veterans with a disability, and gold star veteran spouses that they may be eligible for a property tax exemption under the Colorado Constitution, which exempts 50% of the first $200,000 in actual value of a primary residence from property taxes, with the State of Colorado paying the exempted amount. Qualifying seniors must generally be at least 65 years old, have owned and occupied the property as their primary residence for at least 10 consecutive years, and submit an application to the assessor by July 15, with late applications accepted until August 15. Applications and informational brochures are available by contacting the San Miguel County Assessor's office.",
    deadline: "2026-07-15",
    expires: "2026-08-15",
    dates: "7/9",
    papers: ["ttimes_0709"],
    url: "https://www.telluridenews.com/news/legals/article_c7bd6279-4a8b-494b-ac96-ee9c16f0bcd1.html",
    address: "San Miguel County, Colorado",
    noticeKey: "tax-exemption-senior-veteran-2026"
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
    title: "Public Notice -- Montrose Memorial Hospital Board of Directors Applications",
    entity: "Montrose Memorial Hospital, Inc.",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "Montrose Memorial Hospital, Inc., a Colorado community nonprofit corporation, is accepting applications for open positions on its Board of Directors. Application packets are available at www.montrosehealth.com, by email at BODapplications@montrosehealth.com, or in person at the MRH Administration office at 800 South 3rd Street, Montrose, Colorado. Completed applications must be returned by Friday, August 14, 2026 at 5:00 PM; elections will be held at the Board's annual meeting in October.",
    deadline: "2026-08-14",
    expires: "2026-08-14",
    dates: "7/23",
    papers: ["ttimes_0723"],
    url: "https://www.telluridenews.com/news/legals/article_fde85bc0-ac38-4ba1-9534-66f7d114f129.html",
    address: "800 South 3rd Street, Montrose, Colorado",
    noticeKey: "montrose-memorial-hospital-bod-2026"
  },
  {
    title: "Public Notice -- Farmers' Water Development Company Replacement Share Certificate #887",
    entity: "Farmers' Water Development Company",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "💧",
    iconClass: "type-hearing",
    type: "Utilities",
    filterTag: "utilities",
    summary: "The Farmers' Water Development Company (FWDC) has received a written request to replace lost, destroyed, or wrongfully taken share certificate #887, currently issued in the name of A.F. Newans M.D., C.P. Unless a written objection is filed with FWDC at PO Box 10, Norwood, CO 81423 within 30 days of the last publication date in the Norwood Post, a replacement certificate will be issued and the original will be permanently cancelled. Last publication date in this series is July 30, 2026.",
    deadline: "2026-08-29",
    expires: "2026-08-29",
    dates: "7/23",
    papers: ["ttimes_0723"],
    url: "https://www.telluridenews.com/news/legals/article_fde85bc0-ac38-4ba1-9534-66f7d114f129.html",
    address: "PO Box 10, Norwood, Colorado 81423",
    noticeKey: "fwdc-share-cert-887-replacement"
  },
  {
    title: "Foreclosure Sale Notice -- 350 S Mahoney Dr Unit 7, Telluride (Sale No. 202605)",
    entity: "San Miguel County Public Trustee / Wilmington Savings Fund Society FSB",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "Public Trustee Brandi R. Hatfield of San Miguel County is proceeding with a foreclosure sale of Condominium Unit 7, Double Diamond Condominium, located at 350 S. Mahoney Drive, Unit 7, Telluride, CO 81435. The original grantor is Ryan Pfaff; the current debt holder is Wilmington Savings Fund Society, FSB as Trustee for Residential Investment Trust, with an outstanding principal balance of approximately $1,199,032.37. The public auction is scheduled for 10:00 AM on Thursday, September 3, 2026, at 305 W. Colorado Avenue, East entry, Telluride, Colorado.",
    deadline: "2026-09-03",
    expires: "2026-09-03",
    dates: "7/23",
    papers: ["ttimes_0723"],
    url: "https://www.telluridenews.com/news/legals/article_fde85bc0-ac38-4ba1-9534-66f7d114f129.html",
    address: "350 S Mahoney Drive, Unit 7, Telluride, Colorado 81435",
    noticeKey: "foreclosure-202605-350-mahoney-unit7",
    caseNumber: "202605"
  },
  {
    title: "Notice of Vesting -- Site-Specific Development Plan (Project Title: 72 [truncated])",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "The Town of Telluride is giving public notice pursuant to Colorado Revised Statutes Section 24-68-103(1) and Telluride Municipal Code Title 18, Article 5, Division 2, Section 5-208.H that a site-specific development plan and vested property right has been approved for a project identified in the notice (project title beginning with '72'; full details were truncated in the source text). Vesting notices typically establish property rights for a defined period following approval. Community members with questions should contact the Town of Telluride directly for full project details.",
    deadline: "",
    expires: "2026-08-22",
    dates: "7/23",
    papers: ["ttimes_0723"],
    url: "https://www.telluridenews.com/news/legals/article_fde85bc0-ac38-4ba1-9534-66f7d114f129.html",
    address: "Telluride, Colorado (specific parcel address truncated in source text)",
    noticeKey: "vesting-project-72-telluride"
  },
  {
    title: "Public Hearing -- Adoption of 2024 International Building Code & Colorado Low Energy & Carbon Code",
    entity: "San Miguel County Planning Commission",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "San Miguel County Planning Commission will hold a public hearing on August 13, 2026 at 9:00 AM in Telluride to consider recommending adoption of the 2024 International Building Code and the Colorado Low Energy & Carbon Code to the Board of County Commissioners. Written comments must be received by noon on Monday, August 10, 2026. Proposed amendments are available in the meeting agenda packet at www.sanmiguelcountyco.gov.",
    deadline: "2026-08-10 (written comments); 2026-08-13 (hearing)",
    expires: "2026-08-13",
    dates: "7/30",
    papers: ["ttimes_0730"],
    url: "https://www.telluridenews.com/news/legals/article_75aea7bc-6c31-4ed5-9d5b-9e77b399632d.html",
    address: "Telluride, Colorado (San Miguel County)",
    noticeKey: "COL-000206-ibc-2024-hearing"
  },
  {
    title: "Public Notice -- Town of Telluride 2027 Budget Preparation",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "The Town Manager of Telluride is giving public notice of the 2027 budget preparation process, effective July 30, 2026. All town departments, boards, commissions, and citizens must submit funding requests to the Town Manager no later than 5:00 PM on Friday, August 21, 2026. Requests for CCAASE (Commission for Community Assistance, Arts and Special Events) funding are subject to a separate grant process available at www.telluride.gov.",
    deadline: "2026-08-21",
    expires: "2026-08-21",
    dates: "7/30",
    papers: ["ttimes_0730"],
    url: "https://www.telluridenews.com/news/legals/article_75aea7bc-6c31-4ed5-9d5b-9e77b399632d.html",
    address: "Town Hall, 135 W. Columbia Ave, Telluride, CO 81435",
    noticeKey: "COL-000208-telluride-2027-budget"
  },
  {
    title: "Public Notice -- Montrose Memorial Hospital Board of Directors Applications",
    entity: "Montrose Memorial Hospital, Inc.",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "Montrose Memorial Hospital, Inc., a Colorado community nonprofit corporation, is accepting applications for open positions on its Board of Directors. Application packets are available at www.montrosehealth.com, by email, or in person at the MRH Administration office at 800 South 3rd Street, Montrose, Colorado. Completed applications must be returned by 5:00 PM on Friday, August 14, 2026; elections will be held at the Board's annual meeting in October.",
    deadline: "2026-08-14",
    expires: "2026-08-14",
    dates: "7/30",
    papers: ["ttimes_0730"],
    url: "https://www.telluridenews.com/news/legals/article_75aea7bc-6c31-4ed5-9d5b-9e77b399632d.html",
    address: "Montrose Regional Health Administration, 800 South 3rd Street, Montrose, Colorado",
    noticeKey: "COL-000203-mmh-board-applications"
  },
  {
    title: "Public Notice -- Farmers' Water Development Company Replacement Share Certificate #887",
    entity: "Farmers' Water Development Company",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "💧",
    iconClass: "type-hearing",
    type: "Utilities",
    filterTag: "utilities",
    summary: "The Farmers' Water Development Company (FWDC) has received a written request to replace lost, destroyed, or wrongfully taken share certificate #887, currently issued in the name of A.F. Newans M.D., C.P. Any written objection to the issuance of a replacement certificate must be filed with FWDC at PO Box 10, Norwood, CO 81423 within 30 days of the last publication date (July 30, 2026). If no objection is received, a replacement certificate will be issued and the original will be permanently cancelled.",
    deadline: "2026-08-29 (30 days after last publication 7/30/2026)",
    expires: "2026-08-29",
    dates: "7/30",
    papers: ["ttimes_0730"],
    url: "https://www.telluridenews.com/news/legals/article_75aea7bc-6c31-4ed5-9d5b-9e77b399632d.html",
    address: "Farmers' Water Development Company, PO Box 10, Norwood, CO 81423",
    noticeKey: "COL-000181-fwdc-share-887"
  },
  {
    title: "Foreclosure Sale Notice -- 350 S Mahoney Dr Unit 7, Telluride (Sale No. 2026-05)",
    entity: "San Miguel County Public Trustee / Wilmington Savings Fund Society FSB",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "San Miguel County Public Trustee Brandi R. Hatfield has scheduled a foreclosure auction for Condominium Unit 7, Double Diamond Condominium, located at 350 S Mahoney Dr Unit 7, Telluride, CO 81435. The original grantor is Ryan Pfaff, with an outstanding principal balance of approximately $1,199,032.37 on a deed of trust originally held by Deephaven Mortgage LLC (now Wilmington Savings Fund Society, FSB as Trustee for Residential Investment Trust). The public auction will be held at 10:00 AM on Thursday, September 3, 2026, at 305 W. Colorado Avenue, East entry, Telluride.",
    deadline: "2026-09-03 (auction date)",
    expires: "2026-09-03",
    dates: "7/30",
    papers: ["ttimes_0730"],
    url: "https://www.telluridenews.com/news/legals/article_75aea7bc-6c31-4ed5-9d5b-9e77b399632d.html",
    address: "350 S Mahoney Dr Unit 7, Telluride, CO 81435 (Double Diamond Condominium, Unit 7)",
    noticeKey: "COL-000202-foreclosure-2026-05-pfaff",
    caseNumber: "Foreclosure Sale No. 2026-05"
  },
  {
    title: "Foreclosure Sale Notice -- Stonegate Drive (Vacant Lot), Mountain Village (Sale No. 2026-04)",
    entity: "San Miguel County Public Trustee / Federal Holding Realty",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "San Miguel County Public Trustee has scheduled a foreclosure auction for Lot 166AR2, Telluride Mountain Village (a vacant parcel on Stonegate Drive, Mountain Village, CO 81435), originally granted by Two Stonegate LLC. The current debt holder is Federal Holding Realty, with an outstanding principal balance of $500,000.00. The public auction is set for 10:00 AM on Thursday, September 3, 2026, at 305 W. Colorado Avenue, East entry, Telluride.",
    deadline: "2026-09-03 (auction date)",
    expires: "2026-09-03",
    dates: "7/30",
    papers: ["ttimes_0730"],
    url: "https://www.telluridenews.com/news/legals/article_75aea7bc-6c31-4ed5-9d5b-9e77b399632d.html",
    address: "TBD (Vacant) Stonegate Drive, Mountain Village, CO 81435 (Lot 166AR2, Telluride Mountain Village)",
    noticeKey: "COL-000202-foreclosure-2026-04-stonegate",
    caseNumber: "Foreclosure Sale No. 2026-04"
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
    title: "Notice of Opportunity to Object -- South Uncompahgre Hazardous Fuels and Ecological Resiliency Project (SUHFER)",
    entity: "USDA Forest Service, Grand Mesa, Uncompahgre and Gunnison National Forests",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "The USDA Forest Service Grand Mesa, Uncompahgre and Gunnison National Forests (Norwood and Ouray Ranger Districts) has prepared a Final Environmental Assessment and Draft Decision Notice for the 267,300-acre SUHFER Project on the Uncompahgre Plateau. The project establishes a 20-year Condition-Based Management framework for silvicultural treatments, hazardous fuels reduction, and wildlife habitat improvements to increase forest resilience against wildfire, insects, and disease. Eligible parties who previously submitted written comments may file a pre-decisional objection within 45 calendar days of the August 6, 2026 publication date.",
    deadline: "2026-09-20",
    expires: "2026-09-20",
    dates: "8/6",
    papers: ["ttimes_0806"],
    url: "https://www.telluridenews.com/news/legals/article_509a3235-e766-47bd-b880-643207e48e0f.html",
    address: "Uncompahgre Plateau, Norwood and Ouray Ranger Districts, Grand Mesa, Uncompahgre and Gunnison National Forests, Colorado",
    noticeKey: "SUHFER-objection-2026"
  },
  {
    title: "Public Hearing -- San Miguel County Planning Commission Regular Meeting (August 13, 2026)",
    entity: "San Miguel County Planning Commission",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "The San Miguel County Planning Commission will hold its regular meeting on Thursday, August 13, 2026 at 9:00 AM at 333 West Colorado Ave., Second Floor, Telluride. The agenda includes approval of July minutes, a work session on minor and major subdivisions, and a referral and recommendation on an Energy Code Update. The meeting is also accessible via Zoom for remote public participation.",
    deadline: "2026-08-13",
    expires: "2026-08-13",
    dates: "8/6",
    papers: ["ttimes_0806"],
    url: "https://www.telluridenews.com/news/legals/article_509a3235-e766-47bd-b880-643207e48e0f.html",
    address: "333 West Colorado Ave., Second Floor Meeting Room, Telluride, CO 81435",
    noticeKey: "smc-planning-commission-2026-08-13"
  },
  {
    title: "Public Notice -- Montrose Memorial Hospital Board of Directors Application",
    entity: "Montrose Memorial Hospital, Inc.",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "Montrose Memorial Hospital, Inc., a Colorado community nonprofit corporation, is accepting applications to fill open positions on its Board of Directors. Application packets are available online, by email, or in person at the Montrose Regional Health Administration office at 800 South 3rd Street, Montrose, Colorado. Completed applications must be returned by Friday, August 14, 2026 at 5:00 PM, with elections to be held at the Board's annual meeting in October.",
    deadline: "2026-08-14",
    expires: "2026-08-14",
    dates: "8/6",
    papers: ["ttimes_0806"],
    url: "https://www.telluridenews.com/news/legals/article_509a3235-e766-47bd-b880-643207e48e0f.html",
    address: "800 South 3rd Street, Montrose, CO",
    noticeKey: "montrose-memorial-hospital-bod-applications-2026"
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
  "August 12, 2026":
    "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town-Council-Regular-Meeting-Packet---August-12%2C-2026.pdf",

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
        : (m.civicClerkId ? COUNTY_CIVICCLERK_BASE + m.civicClerkId + '/files' : null)
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
    const hasAgenda = !!m.agendaUrl;
    const link = m.agendaUrl || SCHOOL_BOARD_URL;

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
      packetUrl: m.packetUrl || null,
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
      hasAgenda
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
      hasAgenda
    };
  });
}

function getAirportMeetings() {
  return AIRPORT_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    return {
      title: m.title,
      link: AIRPORT_BOARD_URL,
      description: m.note || 'Regular board meeting of the Telluride Regional Airport Authority.',
      eventDate,
      eventDates: '',
      eventTimes: m.time || '12:00 PM',
      location: m.location || 'Terminal Observation Lounge, Telluride Regional Airport',
      source: 'airport',
      sourceLabel: 'TEX',
      category: 'Meeting',
      canceled: false,
      hasAgenda: false
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
      packetUrl: null
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
  if (typeof MANUAL_SUMMARIES === 'undefined' || !MANUAL_SUMMARIES) return [];
  const out = [];
  const seen = {};
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
    const dk = date + '|' + title;
    if (seen[dk]) continue; seen[dk] = 1;
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
    date: "August 11, 2026",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8041",
    hasAgenda: true,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8041,
    packetUrl: "https://telluride-co.civicweb.net/document/442854/"
  },
  {
    date: "August 19, 2026",
    title: "Parks & Recreation Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8081",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8081
  },
  {
    date: "August 20, 2026",
    title: "Planning & Zoning Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8102",
    hasAgenda: true,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8102,
    packetUrl: "https://telluride-co.civicweb.net/document/443060/"
  },
  {
    date: "September 1, 2026",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8042",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8042
  },
  {
    date: "September 2, 2026",
    title: "Telluride Housing Authority Subcommittee",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8163",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8163
  },
  {
    date: "September 10, 2026",
    title: "Town Council Budget",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8052",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8052
  },
  {
    date: "September 16, 2026",
    title: "Parks & Recreation Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8082",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8082
  },
  {
    date: "September 22, 2026",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8043",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8043
  },
  {
    date: "September 24, 2026",
    title: "Planning & Zoning Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8104",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8104
  },
  {
    date: "October 1, 2026",
    title: "Town Council Budget",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8053",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8053
  },
  {
    date: "October 6, 2026",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8044",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8044
  },
  {
    date: "October 7, 2026",
    title: "Telluride Housing Authority Subcommittee",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8164",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8164
  },
  {
    date: "October 21, 2026",
    title: "Parks & Recreation Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8083",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8083
  },
  {
    date: "October 22, 2026",
    title: "Planning & Zoning Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8106",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8106
  },
  {
    date: "October 27, 2026",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8045",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8045
  },
  {
    date: "November 4, 2026",
    title: "Telluride Housing Authority Subcommittee",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8165",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8165
  },
  {
    date: "November 5, 2026",
    title: "Town Council Budget",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8054",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8054
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
      eventTimes: m.time || '5:00 PM',
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
