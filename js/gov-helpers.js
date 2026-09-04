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
  "telluride|2026-08-05|Ecology Commission - Aug 05 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8117","zoomUrl":"https://us06web.zoom.us/j/84372531870?pwd=Dzpb3SzCKOLJejMu5DGalEWqJghGlM.1","phone":"970-728-3071"},

  "telluride|2026-08-05|Commission for Community Assistance, Arts & Special Events - Aug 05 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8065","zoomUrl":"https://us06web.zoom.us/meeting/register/tZ0pc-ChqDwsGNFpPigfqqLQptmoMmpJdiOx"},

  "telluride|2026-08-05|Telluride Housing Authority Subcommittee - Aug 05 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8162","zoomUrl":"https://us06web.zoom.us/j/83022451705?pwd=Lj8jkLF9GQny7CWBqvP8IYkQhviQBb.1","meetingId":"830 2245 1705","passcode":"229528.","phone":"719) 359-4580"},

  "county|2026-08-05|Board of County Commissioners Meeting":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/886/files/agenda/1944","zoomUrl":"https://us02web.zoom.us/meeting/register/Usig5v0QSkGHbjSBf4K6oA","meetingId":"838 9184 9311","passcode":"530688","phone":"719-359-4580"},

  "telluride|2026-08-06|Town Council Retreat - Aug 06 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8050","zoomUrl":"https://us06web.zoom.us/meeting/register/8596sfn-QZC7tbYJiXF4YA","meetingId":"845 3020 1574","passcode":"082987.","phone":"719) 359-4580"},

  "telluride|2026-08-10|Intergovernmental Worksession - Aug 10 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8057","zoomUrl":"https://us06web.zoom.us/meeting/register/ZOZQ7J9UTmKHp7XXMuliiw","meetingId":"886 1441 5107","passcode":"070631.","phone":"719) 359-4580"},

  "telluride|2026-08-11|Town Council - Aug 11 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8041","zoomUrl":"https://us06web.zoom.us/meeting/register/HhPERZh2Rey09qBDf2d5ug","meetingId":"830 1182 2138","passcode":"888369.","phone":"719) 359-4580"},

  "county|2026-08-12|Board of County Commissioners Work Session":
    {"sv":4},

  "smart|2026-08-13|SMART Board of Directors":
    {"agendaUrl":"null","sv":4,"ph":"b858cb282617fb09"},

  "county|2026-08-13|Planning Commission Meeting":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/922/files/agenda/1949"},

  "rico|2026-08-19|Rico Board of Trustees Regular Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-08-19|Historic & Architectural Review Commission Chair - Aug 19 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8021","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/dRjdHtmeTB6DmemBLALAFw","meetingId":"854 0207 9752","passcode":"775535","phone":"301-715-8592"},

  "telluride|2026-08-19|Historic & Architectural Review Commission - Aug 19 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8020","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/KKzcuKFdTuyXzpw65k2aAA","meetingId":"812 9136 3866","passcode":"440860.","phone":"301-715-8592"},

  "telluride|2026-08-19|Parks & Recreation Commission - Aug 19 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8081","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/tZIufu6srzwsH9X0sfxgA_In-LUt0azBIi8Z"},

  "county|2026-08-19|Board of County Commissioners Meeting":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/899/files/agenda/1960","zoomUrl":"https://us02web.zoom.us/meeting/register/HQG-1W5yTEyLa2v5rWoq-g","passcode":"557341","phone":"719-359-4580"},

  "telluride|2026-08-20|Liquor Licensing Authority - Aug 20 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8291","sv":4,"zoomUrl":"https://us06web.zoom.us/j/86169871704?pwd=oK56hZLiXIbBia4HLKYI9XqWcVl8Uz.1","meetingId":"861 6987 1704","passcode":"281002.","phone":"346-248-7799"},

  "mv|2026-08-20|Town Council Meeting":
    {"sv":4,"agendaUrl":"https://townofmountainvillage.com/site/assets/files/49695/august_20-_2026_town_council_meeting_agenda.pdf","zoomUrl":"https://us06web.zoom.us/webinar/register/WN_ndaN3Xr5TWe9uANpXwY42w","phone":"970-369-6429"},

  "norwood|2026-08-12|Board of Trustees Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "norwood|2026-08-17|Planning and Zoning Commission Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "mv|2026-08-06|Design Review Board":
    {"sv":4,"agendaUrl":"https://townofmountainvillage.com/site/assets/files/49516/august_6-_2026_design_review_board_meeting_agenda.pdf","zoomUrl":"https://us06web.zoom.us/j/84661174346?pwd=pGG47aNtAK3sjfccaVrai3o6jbV3bZ.1","meetingId":"846 6117 4346"},

  "ophir|2026-08-18|General Assembly Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "ridgway|2026-08-12|Ridgway Town Council Regular Meeting":
    {"sv":4,"agendaUrl":"https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town-Council-Regular-Meeting-Packet-August-12-2026_0.pdf","zoomUrl":"https://us02web.zoom.us/j/84715599948?pwd=SykKnn9yD3R1s6uF08awGxXm8s8y6P.1","meetingId":"847 1559 9948","passcode":"194920","phone":"346 248 7799"},

  "norwood|2026-08-11|Norwood Water Commission Meeting":
    {"sv":4,"agendaUrl":"https://www.norwoodtown.com/files/ed8086933/08.11.2026+NWC+Agenda.pdf","zoomUrl":"https://us02web.zoom.us/j/88274908233","meetingId":"882 7490 8233","passcode":"997236","phone":"346-248-7799"},

  "telluride|2026-08-20|Planning & Zoning Commission - Aug 20 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8102","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/tZ0qd-GsrDwuGtGVXN_cveUy9V0AT2ZawXEW","meetingId":"897 0842 7405","passcode":"430134","phone":"301-715-8592"},

  "telluride|2026-08-20|Planning & Zoning Commission Chair - Aug 20 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8101","sv":4},

  "tmvoa|2026-08-11|Mountain Village Merchant Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "tmvoa|2026-08-20|TMVOA Investment Committee Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "county|2026-08-26|Board of County Commissioners Work Session":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/869/files/agenda/1971","zoomUrl":"https://us02web.zoom.us/meeting/register/9OtfsijQQWSJMrVmAUrDCw","meetingId":"858 7914 5422","passcode":"509931","phone":"719-359-4580"},

  "med|2026-08-27|Regular Board Meeting":
    {"sv":4,"agendaUrl":"https://www.tellmed.org/files/2218817c5/THD+Reg+BOD+Mtg+8.27.26+Agenda.pdf","zoomUrl":"https://us02web.zoom.us/j/89509331558","meetingId":"895 0933 1558"},

  "norwood|2026-08-05|Board of Trustees Work Session":
    {"agendaUrl":"https://www.norwoodtown.com/files/6bce913bf/08.05.2026+Work+Session+Board+of+Trustee+Agenda+ADA.pdf","zoomUrl":"https://us02web.zoom.us/j/87433907008","meetingId":"874 3390 7008","passcode":"126738","phone":"970-327-4288","sv":4},

  "ouray|2026-08-05|, 2-4:00 PM - Virtual Meeting Only - No in-person attendance.  Work session to review and discuss possible changes to the Ouray County Land Use Code, Section 2 – Definitions. (Packet materials are attached to the agenda)":
    {"agendaUrl":"https://ouraycountyco.gov/AgendaCenter/PreviousVersions/1014","sv":4},

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

  "county|2026-08-27|CWAB":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1055/files/agenda/1973"},

  "telluride|2026-08-20|Planning & Zoning Commission Chair - Aug 20 2026 - Cancelled":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8101","sv":4},

  "telluride|2026-08-10|Open Space Commission Site Walk - Aug 10 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8298","sv":4},

  "norwood|2026-09-08|Norwood Water Commission Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "tmvoa|2026-09-08|Mountain Village Merchant Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "fire|2026-08-18|Board of Directors Meeting":
    {"sv":4,"agendaUrl":"https://www.telluridefire.com/files/5257dafba/Agenda+-August+18th%2C+2026.pdf"},

  "airport|2026-08-20|TRAA Board of Commissioners Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "norwood|2026-09-09|Board of Trustees Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "ridgway|2026-09-09|Ridgway Town Council Regular Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "county|2026-09-09|Board of County Commissioners Work Session":
    {"sv":4,"ph":"5bee59f208152c68"},

  "telluride|2026-09-10|Town Council Budget - Sep 10 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8052","sv":4,"ph":"a2d452b639a44962"},

  "county|2026-09-10|Planning Commission Meeting":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/923/files/agenda/1979","zoomUrl":"https://us06web.zoom.us/j/84540142300?pwd=kR3YU9IZBab43RLiNx0ox1gygbOI8C.1","meetingId":"845 4014 2300","passcode":"704358","phone":"970-728-3844"},

  "telluride|2026-08-13|San Miguel Authority for Regional Transportation - Aug 13 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8299","zoomUrl":"https://us02web.zoom.us/j/83623251474?pwd=JsZ0QipUWbrsNcS7ASKWqZcbQs4Qud.1","sv":4},

  "telluride|2026-08-26|Public Art Commission - Aug 26 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8300","sv":4,"zoomUrl":"https://us06web.zoom.us/j/84265567776?pwd=P1j50JyBNUh3Yh0s6i573T4slkNZR9.1","meetingId":"842 6556 7776","passcode":"392496.","phone":"301-715-8592"},

  "tmvoa|2026-08-27|TMVOA Board of Directors Meeting":
    {"sv":4,"agendaUrl":"https://tmvoa.org/site/assets/files/4851/tmvoa_board_meeting_agenda_8_27_26_revised.pdf","zoomUrl":"https://us02web.zoom.us/meeting/register/N4y5Yn2FSqCtz42k2HzXYg","meetingId":"822 1299 4362","passcode":"097542","phone":"970) 728-1904"},

  "telluride|2026-08-25|Ethics Commission - Aug 25 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8301","sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/qlFJ6Tx-TZ6zLK8GdTvb4Q","meetingId":"813 8122 0495","passcode":"909304","phone":"719) 359-4580"},

  "telluride|2026-08-19|Ecology Commission - Aug 19 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8117","zoomUrl":"https://us06web.zoom.us/j/84372531870?pwd=Dzpb3SzCKOLJejMu5DGalEWqJghGlM.1","phone":"970-728-3071","sv":4},

  "ouray|2026-08-19|, 1-4:00 PM (@ OURAY COURTHOUSE!) - The PC will hold 3 public hearings; Repeal of Sec.16, Colona Restaurant SUP Amend., and an Exception application for Elk Meadows (Packet materials are attached to the agenda)":
    {"agendaUrl":"https://ouraycountyco.gov/AgendaCenter/PreviousVersions/1015","sv":4},

  "norwood|2026-08-17|Planning and Zoning Commission Cancelled":
    {"agendaUrl":"https://www.norwoodtown.com/files/39acf0aed/08.17.2026+P%26Z+BOA+Agenda+-+Cancel.pdf","zoomUrl":"https://us02web.zoom.us/j/85001344971","meetingId":"850 0134 4971","passcode":"8142302","phone":"970-327-4288","sv":4},

  "smart|2026-09-10|SMART Board of Directors":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-09-14|Open Space Commission - Sep 14 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8131","sv":4,"ph":"23f9d455f0c1977f"},

  "telluride|2026-08-17|Open Space Commission Site Walk - Aug 17 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8302","sv":4},

  "school|2026-08-24|Telluride Board of Education Work Session":
    {"sv":4,"agendaUrl":"https://files.smartsites.parentsquare.com/3403/82426_ws_packet.pdf","zoomUrl":"https://telluridek12.zoom.us/j/86585124120?pwd=TGd6c3A3WFMvRTI2blBnUStwdVI5Zz09","meetingId":"865 8512 4120","passcode":"468668"},

  "school|2026-08-25|Telluride Board of Education Monthly Meeting":
    {"sv":4,"agendaUrl":"https://files.smartsites.parentsquare.com/3403/82526_mm_packet.pdf","zoomUrl":"https://telluridek12.zoom.us/j/86585124120?pwd=TGd6c3A3WFMvRTI2blBnUStwdVI5Zz09","meetingId":"865 8512 4120","passcode":"468668","phone":"970-728-6617"},

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
    {"sv":4,"ph":"a12dfd2ce826475e"},

  "mv|2026-09-17|Town Council Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "airport|2026-09-17|TRAA Board of Commissioners Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-09-17|Liquor Licensing Authority - Sep 17 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8145","sv":4,"ph":"5e169e6aed7b742f"},

  "telluride|2026-08-26|Resident Advisory Committee - Aug 26 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8304","zoomUrl":"https://us06web.zoom.us/j/83515721292?pwd=UWdbpZwQcmiOOtH3Ktbdarl9CZyHjm.1","meetingId":"835 1572 1292","passcode":"983442","phone":"970-728-2496","sv":4},

  "school|2026-08-26|Telluride Board of Education Monthly Meeting":
    {"agendaUrl":"https://files.smartsites.parentsquare.com/3403/82626_board_retreat_packet.pdf","sv":4},

  "norwood|2026-09-21|Planning and Zoning Commission Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "county|2026-08-24|Open Space Commission Meeting":
    {"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1056/files/agenda/1967","sv":4},

  "school|2026-09-22|Telluride Board of Education Work Session":
    {"sv":4,"ph":"b858cb282617fb09"},

  "school|2026-09-22|Telluride Board of Education Monthly Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-09-22|Telluride Housing Authority - Sep 22 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8303","sv":4,"ph":"d6200257aab6f8b7"},

  "telluride|2026-09-22|Town Council - Sep 22 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8043","sv":4,"ph":"c5b14e4bfd86db54"},

  "county|2026-09-23|Board of County Commissioners Work Session":
    {"sv":4,"ph":"307e0c7b19e4ff5b"},

  "med|2026-09-24|Regular Board Meeting":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-09-24|Planning & Zoning Commission - Sep 24 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8104","sv":4,"ph":"d0064703fee6e2cf"},

  "telluride|2026-09-24|Planning & Zoning Commission Chair - Sep 24 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8103","sv":4,"ph":"313a820643e5b960"},

  "telluride|2026-08-27|Open Space Commission Site Walk - Aug 27 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8306","sv":4},

  "telluride|2026-09-10|(Rescheduled to Oct 13th) Town Council Budget - Sep 10 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8052","sv":4},

  "county|2026-08-27|Citizens Weed Advisory Board":
    {"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1055/files/agenda/1977","zoomUrl":"https://us06web.zoom.us/j/84507830944?pwd=dB15RuiMh7QbzfkYiaiomIXqFXJmd7.1","meetingId":"845 0783 0944","passcode":"633618","phone":"970-728-3174","sv":4},

  "telluride|2026-09-23|Vending Subcommittee - Sep 23 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8308","sv":4,"ph":"1ddd1637fea52e35"},

  "county|2026-09-15|Housing Code Update SSR":
    {"sv":4,"ph":"0b96eaea9b0b51f7"},

  "ouray|2026-09-02|PM - Note: Virtual/Zoom meeting only!  The Planning Commission will conduct a work session to review and discuss possible changes to the Ouray County Land Use Code, Section 2 – Definitions. (packet materials are attached to the agenda)":
    {"agendaUrl":"https://ouraycountyco.gov/AgendaCenter/PreviousVersions/1016","sv":4},

  "county|2026-09-28|Open Space Commission Meeting":
    {"sv":4,"ph":"1ff606174e68cca5"},

  "telluride|2026-09-30|Special Meeting - Historic & Architectural Review Commission - Sep 30 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8309","sv":4,"ph":"fc8ba4c0a7de2333"},

  "telluride|2026-09-17|Special Meeting - Planning & Zoning Commission - Sep 17 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8310","sv":4,"ph":"0d28d97b4ee2d60d"},

  "telluride|2026-09-30|Special Town Council - Sep 30 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8313","sv":4,"ph":"6ee2e9f9e57bb867"},

  "mv|2026-10-01|Design Review Board":
    {"sv":4,"ph":"b858cb282617fb09"},

  "telluride|2026-10-01|Town Council Budget - Oct 01 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8053","sv":4,"ph":"ae63a84c96949f40"},

  "county|2026-10-01|Lodging Tax Panel Meeting":
    {"sv":4,"ph":"1f577e951aaf55d2"},

  "county|2026-09-09|Board of County Commissioners Special Meeting":
    {"sv":4,"ph":"7751bc604656aec0"},

  "ouray|2026-09-16|, 1-4:00 PM (@ OURAY COURTHOUSE!) - The PC will hold 2 public hearings; Curry Regular PUD, and an Exemption application from Clifford Pastor to subdivide his parcel into 2 lots. (Packet materials are under media TV icon)":
    {"agendaUrl":"https://ouraycountyco.gov/AgendaCenter/PreviousVersions/1017","sv":4},

  "norwood|2026-09-08|NWC Rescheduled to 09/22/2026":
    {"agendaUrl":"https://www.norwoodtown.com/files/5f8304a63/09.08.2026+RESCHEDULED+NWC+Agenda.pdf","zoomUrl":"https://us02web.zoom.us/j/88274908233","meetingId":"882 7490 8233","passcode":"997236","phone":"346-248-7799","sv":4}
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
  },
  {
    date: "2026-08-30",
    title: "267,000 acres on the edge of the county's to-do list",
    body: "The county commissioners are holding a work session that includes a federal hazardous fuels management project affecting over 267,000 acres in nearby national forests. That's a lot of ground. Fuels work — thinning, prescribed burns, that kind of thing — can mean fewer catastrophic wildfires down the road. It can also mean smoke, road closures, altered terrain, and years of disruption up here. Some folks see it as overdue protection. Others worry about the scale and who really calls the shots when federal projects move through the neighborhood.\n\nWhere do you come down on large-scale fuels management this close to home?",
    choices: ["Do it — wildfire risk is too high", "Depends on the specifics", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-29",
    title: "Street banners and arts cash — who's in line?",
    body: "The Commission for Community Assistance, Arts & Special Events meets September 2 to take up annual funding allocations for community support and arts organizations, plus applications for street closures and banners.\n\nThat's a lot on one plate. Some folks think a single commission juggling arts grants, community assistance, and who gets to hang a banner or shut down a street is a reasonable way to run a small town. Others wonder whether mixing those decisions means any one of them gets the attention it deserves — or whether the same organizations win every year.\n\nHow should a town weigh arts funding against community assistance, and who should be making those calls?",
    choices: ["Keep it all under one commission", "Split arts and assistance funding", "Open the process up more", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-28",
    title: "One hospital, two sites — or just one?",
    body: "The Telluride Hospital District board is taking up a Two Site Model for the new facility — meaning what gets built could be split between locations rather than consolidated in one place. They're also weighing a Letter of Intent with CommonSpirit Health, a large Catholic health system, which could shape the whole partnership framework going forward. Neither item is a final vote yet. Some residents will like the flexibility of two sites; others will worry about cost, coordination, or what a Catholic health system partnership might mean for certain services. So — one site or two, and does the partner matter to you?",
    choices: ["One site, keep it simple", "Two sites makes sense", "The partner matters most", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-27",
    title: "Child care money — how much is the county on the hook for?",
    body: "The Board of County Commissioners has a 40-minute work session item on Colorado Child Care Assistance Program funding and what its budget implications mean for San Miguel County. Child care is already scarce up here, and CCAP helps working families afford what little exists. The tension: county budgets are finite, and a deeper funding commitment means tradeoffs somewhere else. Some residents will say child care access is essential infrastructure for a workforce community. Others will want to know exactly what the county can sustain before making promises. Nothing's been decided yet — this is a discussion, not a vote.\n\nSo where do you come down: should the county lean in on child care funding, or is this a state responsibility the county shouldn't absorb?",
    choices: ["County should lean in", "State's job, not ours", "Depends on the numbers"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-26",
    title: "A tent, a food truck, and 15 apartments walk into Adams Ranch Road",
    body: "Two very different proposals are landing at 306 and 332 Adams Ranch Rd. One is a conditional use permit for a temporary tent and food truck. The other — a 15-unit employee apartment building — is big enough that its architecture review got pushed to October.\n\nPeople who want more workforce housing will say the apartments can't come fast enough. Others will want a hard look at what 15 units does to that stretch of road before anything gets approved. The tent and food truck raise their own questions about what belongs where.\n\nWhat matters most to you as these two proposals move forward?",
    choices: ["Get the apartments built", "Slow down, look closer", "Fine with the tent, not the building", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-25",
    title: "A new committee takes its first breath",
    body: "The Resident Advisory Committee holds its inaugural meeting — introductions, officer elections, and a look at Telluride's Employee Rental Housing Policies. That last item is where it gets interesting. Some folks will see this committee as real teeth: residents finally at the table on housing decisions that affect whether workers can stay in town. Others will wonder whether an advisory body with no binding authority just adds a layer without changing anything. So — does a resident voice in the room matter if it's purely advisory?",
    choices: ["A voice at the table is real power", "Advisory only means ignored", "Depends on who's listening", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-24",
    title: "Who gets the arts money — and who decides?",
    body: "The Commission for Community Assistance, Arts & Special Events meets September 2 to consider annual funding allocations for community support and arts organizations, plus special events scheduling and street closure applications. That's a lot of ground for one body to cover. Some residents think arts and events funding is exactly what keeps this place worth living in. Others figure that money and public space should be weighed against basic community needs first. Both camps tend to feel strongly — and they don't always agree on what \"community support\" even means.\n\nWhen the same body controls arts grants, event permits, and street closures, does that produce good decisions — or too many tradeoffs in one room?",
    choices: ["Arts and events deserve that support", "Basic needs should come first", "The process needs more transparency", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-23",
    title: "Bears, people, and who gives way",
    body: "The Ecology Commission meets September 2 to work on human-wildlife interactions — its standing job is reducing threats to both wildlife and public safety up here. That pairing is where the tension lives. Some residents think the priority should be protecting wildlife from people: stricter rules on trash, attractants, outdoor dining. Others think public safety has to come first, which can mean more aggressive hazing or removal of animals that keep showing up in town. The two goals aren't always the same goal.\n\nWhen the two conflict, which one should drive the decision?",
    choices: ["Wildlife protection comes first", "Public safety comes first", "We can balance both", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-22",
    title: "Mountain Village weighing a workforce housing committee",
    body: "The TMVOA Board is looking at forming a Workforce Housing Committee. Up here, that kind of body can mean real policy momentum — or it can mean a long runway before anything changes on the ground. People who think Mountain Village isn't moving fast enough on housing will see a new committee as a start. People skeptical of process will wonder whether another committee is action or a substitute for it. The board is also taking up a grant request for the TMV Ice Pad and updates on a Pond Improvement Plan — but it's the housing committee question that tends to split a room. So: does a new committee move the needle, or not?",
    choices: ["Committees get things done", "It's just more process", "Depends on who's on it", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-21",
    title: "A new committee for rental housing — what will it actually do?",
    body: "Telluride's new Resident Advisory Committee holds its inaugural meeting this week. The first order of business is organizing itself — officers, procedures, purpose. But the substantive item is a review of the Town's Employee Rental Housing Policies.\n\nSome will see this as a real seat at the table: residents with skin in the game finally helping shape how workforce housing gets managed. Others will wonder whether an advisory body with no binding authority changes much at all.\n\nSo — is a resident advisory committee the right lever for housing policy up here, or is it window dressing?",
    choices: ["Real seat at the table", "Advisory only — too weak", "Depends what power it gets", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-20",
    title: "Is the campground leaving locals behind?",
    body: "Parks staff is recommending 2027 fee increases at the Town Park Campground — nightly rates up roughly 8%, with premium vehicle sites moving from $55 to $60 and walk-in sites from $32 to $35. Shower tokens jump from $4 to $5, a 25% bump, partly to cover a new credit-card payment machine. The campground ran at 97–99% occupancy in June and July, which gives staff some market cover. But near-capacity numbers cut both ways: they signal demand that supports higher rates, and a squeeze that already pushes out anyone watching every dollar. Is this smart cost recovery, or one more ratchet upward?",
    choices: ["Fair — the market supports it", "Too steep for working visitors", "Raise rates, fix the access problem", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-19",
    title: "A cap on how much your home can appreciate",
    body: "Town Council is expected to set a sale price appreciation cap under municipal code. The idea behind a cap like this is straightforward — limit runaway resale prices and keep homes within reach of working residents. But the tension is real. Property owners reasonably ask whether the town should be able to limit what they can earn on an asset they bought and maintain. Others will argue that without some constraint, the market keeps doing what it's been doing up here. Neither side is wrong, exactly.\n\nWhere do you land on the town putting a ceiling on home price appreciation?",
    choices: ["Good tool for affordability", "Government shouldn't cap gains", "Depends on the details", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-18",
    title: "Vesting a plan: locked in, or just getting started?",
    body: "The Planning & Zoning Commission is set to consider a site-specific development plan vesting notice for a local project. A vesting notice, when approved, can lock in the rules that apply to a development — protecting the applicant from code changes down the road. That's the point for developers: predictability. The tension for neighbors is that it can also limit the community's ability to adjust course if circumstances change. Nothing's decided yet — this is a commission review, not a final vote. So: does locking in a development plan protect good projects, or tie the community's hands?",
    choices: ["Protects legitimate projects", "Ties the community's hands", "Depends on the project", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-17",
    title: "Foreclosure on Stonegate — what does it signal?",
    body: "A vacant lot on Stonegate Drive and a Double Diamond condominium unit are both headed to foreclosure sale, according to notices tied to the upcoming CWAB meeting. Up here, distressed properties don't stay quiet — they tend to surface bigger questions. Some neighbors see foreclosures as a market correction that could open doors for locals. Others worry that the buyers who show up at these sales make affordability harder, not easier.\n\nWhen a property in Telluride or Mountain Village goes to foreclosure, who actually benefits?",
    choices: ["Opens doors for locals", "Usually helps outside buyers", "Depends on the property", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-16",
    title: "Natural medicine businesses: should the code make room?",
    body: "Telluride's Planning & Zoning Commission may take up a proposed Land Use Code amendment that would establish regulations for Natural Medicine Businesses. Nothing is final — this is a commission-level discussion, not a done deal.\n\nThe tension is real. Some residents will see regulated natural medicine businesses as a reasonable next step, consistent with how the town has handled other evolving industries. Others will wonder whether the existing code needs a new category at all, or whether this sets a precedent worth thinking hard about before it's written in.\n\nWhere do you land?",
    choices: ["The code should make room for it", "Not the right fit for Telluride", "Let's see the details first", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-15",
    title: "Vested rights: protection or workaround?",
    body: "The Planning & Zoning Commission is set to consider a site-specific development plan vesting notice for a local project. Vesting locks in the rules that apply to a development at the time of approval — meaning future code changes can't touch it. Supporters say that's basic fairness: you plan around the rules in place. Critics worry it can shield projects from improvements the community later decides matter. The tension is real, and neither side is wrong.\n\nWhere do you come down on vesting rights for development up here?",
    choices: ["Vesting protects fair planning", "It blocks needed changes", "Depends on the project", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-14",
    title: "Bears, bins, and the next climate plan",
    body: "The Ecology Commission is set to work on two things at once: planning Black Bear Safety Week and reviewing the Materials & Consumption section of the 2027 Climate Action Plan update. That's a lot on one agenda. Bear safety tends to unite people — nobody wants a conflict. Climate action plans are different. Some residents think Telluride needs stronger consumption targets to mean anything; others worry the town is already asking a lot of people who are just trying to live up here. Which piece of this meeting matters more to you?",
    choices: ["Bear safety is the priority", "The climate plan matters more", "Both deserve equal attention", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-13",
    title: "Energy codes: raising the bar, or raising the cost?",
    body: "The San Miguel County Planning Commission is scheduled to review a referral and recommendation on an energy code update at its August 13 meeting. That's a work session — nothing binding yet. But energy code updates tend to split people pretty cleanly up here. Tighter standards can mean lower long-term energy bills and a smaller footprint. They can also mean higher construction costs at a moment when building anything affordable is already a stretch. Both things are true at once.\n\nSo where do you land — is a stronger energy code worth the added upfront cost, or does it make an already tough housing situation harder?",
    choices: ["Worth the upfront cost", "Makes housing harder to build", "Depends on what's in it", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-12",
    title: "The gondola's advisory committee is getting restructured",
    body: "SMART's board is set to consider restructuring the Gondola Advisory Committee. No details from the candidate text spell out exactly what changes are proposed — but any reorganization of who advises a project this consequential tends to get people's attention up here.\n\nSome residents will want more community voice built into that structure. Others will argue that streamlining oversight is how big projects actually get finished. Neither instinct is wrong.\n\nSo: when a regional transit project is still in motion, how much advisory input is the right amount?",
    choices: ["More community voice, not less", "Streamline it — get it built", "Depends what's changing", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-11",
    title: "The schoolhouse foundation and the water tank roof",
    body: "The county is weighing proposals to repair the foundation at the Placerville Schoolhouse and do roofing work on the Trout Lake Water Tank. Neither project has been voted on yet — this is still at the work session stage. The tension is familiar up here: historic and public infrastructure costs money, and opinions split on whether aging county assets are worth sustained investment or whether the dollars should go elsewhere. Both sides have a point.\n\nWhere do you come down on spending county resources to maintain older public structures like these?",
    choices: ["Worth the investment", "Other priorities first", "Depends on the cost", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-10",
    title: "Lock it in — or leave room to adjust?",
    body: "The Planning & Zoning Commission is set to consider a site-specific development plan vesting notice for a local project. A vested plan is a big deal: once approved, it locks in a developer's right to build under current rules, even if the Land Use Code changes later. That protects investment and gives developers certainty. But it also ties the community's hands — if neighbors or commissioners later have second thoughts, the window to adjust closes. So the question is whose interests the clock should favor.\n\nWhen a development plan gets vested, who should get the benefit of the doubt — the developer or the community?",
    choices: ["Developer — certainty matters", "Community — keep options open", "Depends on the project", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-09",
    title: "Bear Creek's beavers and the trail question",
    body: "The Open Space Commission is heading out to Bear Creek Trailhead to look at a potential new trail alignment connecting to Firecracker Hill — and also to check on beaver activity in the preserve. Those two things pull in different directions. More trail access means more people out there, which is the whole point of public land. But the commission is also doing restoration planning, and active beavers in a protected zone complicate what \"open\" in open space actually means. How much human use belongs alongside active habitat work?\n\nWhere do you land — more trail, or let the beavers have it?",
    choices: ["Build the connection", "Hold off on the trail", "Depends on the habitat impact", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
  {
    date: "2026-08-08",
    title: "Natural medicine businesses — where do they fit in town?",
    body: "Town Council is expected to consider a Land Use Code amendment that would add new regulations for Natural Medicine Businesses. That's a real category now in Colorado, and Telluride has to decide what the rules look like up here.\n\nSome residents will want clear, workable rules that let legitimate businesses operate — delay just creates gray areas. Others will want strict limits on where and how these businesses can set up, worried about fit with the town's existing character and land use patterns.\n\nNo vote has happened yet. So: should Telluride move quickly to regulate and allow, or take its time and draw tighter lines?",
    choices: ["Move quickly, get rules in place", "Take more time, tighten the limits", "Shouldn't be here at all", "It's complicated"],
    sourceUrl: "/gov-hub.html",
    topics: ["meeting"]
  },
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
  }
];

// ── Seeds for bot writers whose targets were lost in the May 2026
// gov-hub.js/data-only.js retirement (2026-07-22 audit P0-3). Each of these
// had a content-refresh.js write path that silently no-opped because the
// const no longer existed anywhere; the writers now THROW on a missing
// target, and these seeds let the data start landing again. No page renders
// them yet — restoring (or retiring) the reader UIs is tracked separately.
const MEETING_PREVIEWS = {
  "county|2026-09-09|Board of County Commissioners Work Session":
    "Board will consider matters related to county operations, including a material hauling contract request for quote. Related legal notices include estate creditor notifications, a foreclosure sale on Telluride Mountain Village property, and a federal hazardous fuels management project affecting over 267,000 acres in nearby national forests.",

  "telluride|2026-09-10|Town Council Budget - Sep 10 2026":
    "Council is expected to review and discuss the Town of Telluride's budget during this dedicated budget session. The meeting will likely address municipal funding priorities, departmental allocations, and financial planning considerations for the upcoming fiscal period.",

  "county|2026-09-10|Planning Commission Meeting":
    "Planning Commission is expected to address land use and development matters in San Miguel County. Related notices suggest ongoing activity around property foreclosure, estate administration, material hauling procurement, and a federal hazardous fuels project affecting nearby national forest lands managed by the USDA Forest Service.",

  "telluride|2026-09-14|Open Space Commission - Sep 14 2026":
    "The Open Space Commission is expected to discuss priorities and criteria related to open space acquisition, management, and maintenance, as well as review open space elements of relevant plans and potentially formulate recommendations to Town Council on open-space-related matters.",

  "telluride|2026-09-16|Historic & Architectural Review Commission Chair - Sep 16 2026":
    "The Historic & Architectural Review Commission is expected to convene its regular monthly session to review applications related to historic preservation and architectural standards within Telluride. Specific agenda items were not detailed in the available text, but the commission typically evaluates proposed changes to structures within the town's historic district.",

  "telluride|2026-09-16|Historic & Architectural Review Commission - Sep 16 2026":
    "The Historic and Architectural Review Commission is expected to review applications for Certificates of Appropriateness related to proposed construction, renovation, alteration, or demolition of structures within Telluride. The commission may also address historic designation recommendations, preservation policies, or updates to inventories of historically and architecturally significant propertie",

  "telluride|2026-09-16|Parks & Recreation Commission - Sep 16 2026":
    "The Parks & Recreation Commission is expected to meet on September 16, 2026, to address community recreation and parks services matters. Specific agenda items were not detailed in the available text, but the commission typically interprets community needs regarding parks and recreation programming and services.",

  "county|2026-09-16|Board of County Commissioners Meeting":
    "Board will consider procurement matters including material hauling, a trail connector project, and fuel island canopy construction. Related legal notices involve estate creditor claims, a foreclosure sale in Telluride Mountain Village, and a federal environmental assessment for a hazardous fuels management project in the Uncompahgre and Gunnison National Forests.",

  "telluride|2026-09-17|Liquor Licensing Authority - Sep 17 2026":
    "The Telluride Liquor Licensing Authority is expected to review and act on liquor license applications or modifications submitted to the town. Both local approval and Colorado Department of Revenue consent are required for any license to be issued or amended.",

  "telluride|2026-09-22|Telluride Housing Authority - Sep 22 2026":
    "The Telluride Housing Authority is expected to meet on September 22, 2026. Related legal notices reference Ordinance #1640, which amended the Land Use Code to implement the Colorado Wildfire Resiliency Code, potentially informing housing-related discussions. Specific agenda items are not fully detailed in available materials.",

  "telluride|2026-09-22|Town Council - Sep 22 2026":
    "Council is expected to revisit matters related to Ordinance #1640, which amended Telluride's Land Use Code to implement the Colorado Wildfire Resiliency Code. The meeting may address follow-up actions or implementation details stemming from the ordinance passed on August 11, 2026.",

  "county|2026-09-23|Board of County Commissioners Work Session":
    "Board will consider matters including a request for quote for material hauling, proposals for a Lawson Hill Connector Trail Project and fuel island canopy construction, and related county procurement items. Additional context includes local probate proceedings, a foreclosure sale, and a federal environmental assessment for a hazardous fuels project in the region.",

  "telluride|2026-09-24|Planning & Zoning Commission - Sep 24 2026":
    "The Planning & Zoning Commission is expected to discuss implementation of the Colorado Wildfire Resiliency Code (CWRC), following Town Council's passage of Ordinance #1640 in August 2026, which amended Chapter 18 of the Telluride Municipal Code to incorporate wildfire resiliency standards into the Land Use Code.",

  "telluride|2026-09-24|Planning & Zoning Commission Chair - Sep 24 2026":
    "The Planning & Zoning Commission Chair is expected to discuss the Colorado Wildfire Resiliency Code amendments to Telluride's Land Use Code, following Town Council's passage of Ordinance #1640 on August 11, 2026, which updated Chapter 18 of the Municipal Code to incorporate wildfire resiliency standards.",

  "telluride|2026-09-10|(Rescheduled to Oct 13th) Town Council Budget - Sep 10 2026":
    "Council is expected to discuss the town's budget during this rescheduled session. Members may also revisit Ordinance #1640, which amended the Land Use Code to implement the Colorado Wildfire Resiliency Code, following its passage on August 11, 2026.",

  "telluride|2026-09-23|Vending Subcommittee - Sep 23 2026":
    "The Telluride Vending Subcommittee is expected to review vending permit applications, as is typical for its seasonal meetings held at Rebekah Hall. No specific agenda items were publicly detailed for this session.",

  "county|2026-09-15|Housing Code Update SSR":
    "Board will consider adopting the 2024 International Building Code and the Colorado Low Energy & Carbon Code during a public hearing scheduled for September 16, 2026, in Telluride.",

  "county|2026-09-28|Open Space Commission Meeting":
    "The Open Space Commission is expected to discuss land and trail-related matters, potentially including the Lawson Hill Connector Trail Project, material hauling needs, and other open space management topics in San Miguel County.",

  "telluride|2026-09-30|Special Meeting - Historic & Architectural Review Commission - Sep 30 2026":
    "The Historic and Architectural Review Commission is expected to discuss the implementation of Ordinance #1640, which amended the Land Use Code to incorporate the Colorado Wildfire Resiliency Code, and how its requirements apply to the review and approval of Certificates of Appropriateness for structures within Telluride.",

  "telluride|2026-09-17|Special Meeting - Planning & Zoning Commission - Sep 17 2026":
    "The Planning & Zoning Commission is expected to review Ordinance #1640, passed by Town Council on August 11, 2026, which amends Telluride's Land Use Code to implement the Colorado Wildfire Resiliency Code (CWRC), addressing wildfire risk mitigation standards within the town's development regulations.",

  "telluride|2026-09-30|Special Town Council - Sep 30 2026":
    "Council is expected to discuss matters related to Ordinance #1640, which amended Telluride's Land Use Code to implement the Colorado Wildfire Resiliency Code. The ordinance was originally passed on August 11, 2026, and this special session may address follow-up actions or implementation details related to wildfire resiliency standards.",

  "telluride|2026-10-01|Town Council Budget - Oct 01 2026":
    "Council is expected to focus on budget discussions for the Town of Telluride. Members may also revisit matters related to Ordinance #1640, which amended the Land Use Code to implement the Colorado Wildfire Resiliency Code, following its passage on August 11, 2026.",

  "county|2026-10-01|Lodging Tax Panel Meeting":
    "The Lodging Tax Panel is expected to discuss matters related to the administration and allocation of lodging tax revenues in San Miguel County. No additional agenda details or directly relevant legal notices are available to indicate specific items beyond the panel's standard oversight responsibilities.",

  "county|2026-09-09|Board of County Commissioners Special Meeting":
    "Board will consider matters including a public hearing on adopting the 2024 International Building Code and Colorado Low Energy & Carbon Code, a request for quotes for material hauling, and proposals for repainting the county jail. Related legal notices include estate probate matters and a foreclosure sale.",

  "ouray|2026-09-16|, 1-4:00 PM (@ OURAY COURTHOUSE!) - The PC will hold 2 public hearings; Curry Regular PUD, and an Exemption application from Clifford Pastor to subdivide his parcel into 2 lots. (Packet materials are under media TV icon)":
    "The Planning Commission is expected to hold two public hearings on September 16 at the Ouray Courthouse. Members will review the Curry Regular PUD proposal and consider an exemption application from Clifford Pastor seeking to subdivide his parcel into two lots.",

  "norwood|2026-09-08|NWC Rescheduled to 09/22/2026":
    "The Norwood Water Commission meeting originally scheduled for September 8, 2026 has been rescheduled to September 22, 2026 at 6:30 p.m. No specific agenda items have been listed at this time."
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
    title: "Hickenlooper hopeful for fire disaster order",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "September 3, 2026",
    newsTopic: "public-safety",
    copy: "U.S. Sen. John Hickenlooper said Friday he was optimistic the Trump administration will declare the Gold Mountain Fire a federal disaster, arguing Congress “wouldn’t settle for” the White House withholding relief funds from Colorado for the second year in a row. Hickenlooper, who surveyed fire damag",
    href: "https://www.ouraynews.com/2026/09/02/hickenlooper-hopeful-fire-disaster-order/?ta_paidstory",
    img: ""
  },
  {
    title: "County employees remain on paid leave",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "September 3, 2026",
    newsTopic: "public-safety",
    copy: "Ouray County has had two emergency- related employees on paid administrative leave since the early days of the Gold Mountain Fire. A third employee, Road and Bridge Superintendent Ty Barger, was placed on paid administrative leave following an arrest on suspicion of driving under the influence in th",
    href: "https://www.ouraynews.com/2026/09/02/county-employees-remain-paid-leave/?ta_paidstory",
    img: ""
  },
  {
    title: "Businesses share struggles with senator",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "September 3, 2026",
    newsTopic: "public-safety",
    copy: "Ouray County business owners bent the ear of U.S. Sen. John Hickenlooper on Friday, sharing stories of declining profits and mass cancellations in the wake of the Gold Mountain Fire in the hopes the Democrat can help secure federal disaster relief funding. About a dozen business owners and the direc",
    href: "https://www.ouraynews.com/2026/09/02/businesses-share-struggles-senator/?ta_paidstory",
    img: ""
  },
  {
    title: "Cleanup project at former mine site to take until 2028, Thorin says",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "September 3, 2026",
    newsTopic: "government",
    copy: "A representative from Thorin Resources, the owner and operator of the Revenue-Virginius Mine, told Ouray County commissioners last week the company expects to complete a federally supervised cleanup project at the site by the fall of 2028. At a Board of County Commissioners work session on Aug. 25, ",
    href: "https://www.ouraynews.com/2026/09/02/cleanup-project-former-mine-site-take-2028-thorin-says/?ta_paidstory",
    img: ""
  },
  {
    title: "Mining proposal faces unanimous scrutiny",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "September 3, 2026",
    newsTopic: "government",
    copy: "Kris Peterson and Alex Klemt said it was an algorithm that led them west from Colorado Springs, up a rough dirt road past the Camp Bird Mine, and into the lofty tundra of Governor Basin. With the help of AI, the two men told Ouray County commissioners last week, they had searched far and wide across",
    href: "https://www.ouraynews.com/2026/09/02/mining-proposal-faces-unanimous-scrutiny/?ta_paidstory",
    img: ""
  },
  {
    title: "Who is the MTN Lodge?",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "September 3, 2026",
    newsTopic: "community",
    copy: "Dear Editor: I opened the letter received last Wednesday and was a bit confused as to the intent, since the photos leading the letter are of the True Grit and several businesses that no longer exist in Ridgway, but I read through the entire letter with interest. I continue to marvel at the amount of",
    href: "https://www.ouraynews.com/2026/09/02/who-is-the-mtn-lodge/?ta_paidstory",
    img: ""
  },
  {
    title: "OHVs have made trail access more difficult",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "September 3, 2026",
    newsTopic: "recreation",
    copy: "Dear Editor: I am writing in response to Jeff Lindberg’s letter in the Aug. 27 edition. My husband and I live in Ouray County primarily because we love to hike. We have lived here for eight years, but we have been visiting for more than 30 years. Jeff L. stated that the trails/roads are for everyone",
    href: "https://www.ouraynews.com/2026/09/02/ohvs-made-trail-access-difficult/?ta_paidstory",
    img: ""
  },
  {
    title: "Tree thinning vital to managing wildfire",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "September 3, 2026",
    newsTopic: "public-safety",
    copy: "Dear Editor: This letter pertains to an article by Chart Riggall in the Aug. 27 edition. I thought it was an excellent article on the history of fire in the San Juans, etc. However, there was, in my opinion, one glaring error of great importance. Deborah Kennard, a Colorado Mesa University environme",
    href: "https://www.ouraynews.com/2026/09/02/tree-thinning-vital-managing-wildfire/?ta_paidstory",
    img: ""
  },
  {
    title: "Looking Back",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "September 3, 2026",
    newsTopic: "government",
    copy: "September 1, 1966 “We definitely intend to continue pushing forward with plans for a college in Ouray,” stated Warren Gibbs, speaking for the board of directors at a meeting last Saturday. Directors present at the meeting were chairman Robert Jindra, Ray Schey and Gibbs. It was further stated that a",
    href: "https://www.ouraynews.com/2026/09/02/looking-back-20260903-0317-106981/?ta_paidstory",
    img: ""
  },
  {
    title: "Wind played major factor in Gold Mountain Fire",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "September 3, 2026",
    newsTopic: "public-safety",
    copy: "Dear Editor: It was the wind. I read with great interest the in-depth article by Chart Riggall in the Aug. 27 edition of the Ouray County Plaindealer. He cited the history of our forests and the reasons they were primed to burn. Yes, we have not had any recent forest fires, and we are in an extreme ",
    href: "https://www.ouraynews.com/2026/09/02/wind-played-major-factor-gold-mountain-fire/?ta_paidstory",
    img: ""
  },
  {
    title: "Sheriff Rescinds Stage 2 Fire Restrictions",
    source: "Ouray County",
    sourceKey: "ouray-county",
    date: "September 1, 2026",
    newsTopic: "public-safety",
    copy: "Ouray County RESCINDS Stage 2 Fire Restrictions, reinstates Stage 1 Fire Restrictions effective 12:01AM Thursday, September 3",
    href: "https://ouraycountyco.gov/CivicAlerts.aspx?aid=960",
    img: "https://ouraycountyco.gov/ImageRepository/Document?documentID=22895"
  },
  {
    title: "No Women’s Group Tomorrow",
    source: "St. Patrick's Catholic Church",
    sourceKey: "stpatricks",
    date: "September 1, 2026",
    newsTopic: "community",
    copy: "With many women out of town this week, there will be no 'official' women's Rosary and fellowship. However, if you are in town, you are still encouraged to lead a Rosary at 7:30 before Holy Mass. Reminder: It is not too late to join our Women's Vir...",
    href: "https://stpatrickstelluride.com/2026/parish-news/no-womens-group-tomorrow/",
    img: ""
  },
  {
    title: "Parish bulletin for August 30",
    source: "St. Patrick's Catholic Church",
    sourceKey: "stpatricks",
    date: "August 29, 2026",
    newsTopic: "community",
    copy: "Attached is this week's Parish Bulletin. Please check our calendar for all updated information. This weekend:Saturday Vigil (Aug. 29) is a bilingual Holy Mass.Sunday (Aug. 30) 8:30 am pray the Rosary, 9 am Holy Mass. Immediately ...",
    href: "https://stpatrickstelluride.com/2026/parish-news/parish-bulletin-for-august-30/",
    img: ""
  },
  {
    title: "Invitation to Prayer/Fellowship Wednesday Morning",
    source: "St. Patrick's Catholic Church",
    sourceKey: "stpatricks",
    date: "August 25, 2026",
    newsTopic: "community",
    copy: "This is an open invitation to all women in Telluride. Please come and join us on Wednesday, August 26th...7:30 am Rosary8:00 am Holy MassImmediately after we will go to Butcher and Baker for fellowship. Join as able....Contact Katrina with questio...",
    href: "https://stpatrickstelluride.com/2026/parish-news/invitation-to-prayer-fellowship-wednesday-morning-7/",
    img: ""
  },
  {
    title: "Long-term road closure for the Corbett Creek Bridge Project",
    source: "Ouray County",
    sourceKey: "ouray-county",
    date: "August 24, 2026",
    newsTopic: "infrastructure",
    copy: "Long-term road closure for the Corbett Creek Bridge Project, July 24 through October 8, 2026.",
    href: "https://ouraycountyco.gov/CivicAlerts.aspx?aid=955",
    img: "https://ouraycountyco.gov/ImageRepository/Document?documentID=22829"
  }
];  // 7 regional feeds (West End, Ouray, …)
const SMC_ALERTS = [
  {
    title: "Imogene and Black Bear Passes Closed 9/12",
    source: "San Miguel County",
    sourceLabel: "San Miguel County",
    category: "Alert",
    date: "2026-09-03",
    pubDate: "2026-09-03T17:50:17.000Z",
    copy: "Imogene Pass/Tomboy Road will be closed 12:01 a.m. - 3:00 p.m. on Saturday, September 12th, to accommodate the Imogene Pass Run. Black Bear Pass/Bridal Veil Road and the Valley View parking area will be closed 7:00 a.m. - 12:00 p.m. on that day, too.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=542",
    img: ""
  }
];              // SMC AlertCenter items
const ENGAGE_MEETINGS = [

];         // Engage Telluride project key dates
const MANUAL_SUMMARIES_CACHE_DATE = '2026-09-03';
const LEGAL_NOTICES_CACHE_DATE = '2026-09-04';

const MANUAL_SUMMARIES = {
  "telluride|2026-08-05|Ecology Commission - Aug 05 2026":
    "The Ecology Commission meets August 5 for a work session heavy on planning. Two items will advance the 2027 Climate Action Plan update — one broad discussion of the working document, and a focused session on the Materials & Consumption focus area. The commission will also plan Black Bear Safety Week. Minutes from the July 8 meeting are up for approval; that session covered Transportation & Land Use and Materials & Consumption focus areas, and the commission appointed Ruthie Boyd as primary and Kristen Rosenbaum as alternate to the Green Grants selection subcommittee.",

  "telluride|2026-08-05|Commission for Community Assistance, Arts & Special Events - Aug 05 2026":
    "CCAASE's August meeting is grant-season housekeeping more than anything else. The board will interview four organizations — Second Chance Humane Society, Telluride Soccer Club, Telluride Mountain Club, and Sheep Mountain Alliance — as part of the 2026 grant cycle review. On the action side: a calendar date request from Telluride Humane Society for a Tails on the Trail 5K fun run on October 10, 2026 (using Elks Park, the River Trail, and Colorado Ave.); final approval of 2027 CCAASE grant materials including guidelines and application; and a recommendation to Town Council on the 2027 CCAASE budget allocation. The grant materials were workshopped at the July meeting — this is the approval step.",

  "telluride|2026-08-05|Telluride Housing Authority Subcommittee - Aug 05 2026":
    "The Telluride Housing Authority Subcommittee meets August 5 with two items on the deed-restricted housing front. The action item is a request from Lela and Jon Martin to exceed the 5% Permitted Capital Improvement (PCI) limit on their Gold Run unit — they need a new roof, bid at $47,743.86 (roughly 17% of their original purchase price), but their 2010-era deed restriction only allows staff to approve up to 5% without a finding that the work increases the unit's capacity to house additional occupants. Staff recommends approval on the merits of the failing roof, but flags that the legal standard may not be met — leaving the Subcommittee in a bind that could resolve by encouraging the Martins to update to the current deed restriction language, which allows up to 10% without that constraint. The worksession takes up a request from Alpine Planning to deed-restrict Unit H at Pacifica House Condominiums as an employee dwelling unit under Guidelines §211, as mitigation for new free-market construction.",

  "county|2026-08-05|Board of County Commissioners Meeting":
    "Three Land Use Code amendments are the main event on August 5. The BOCC will hold public hearings on all three: a change to the definition of 'Qualified Owner' in Section 5-1305B (with related amendments to 5-1305C and 5-1350F), a wildfire areas update to Section 5-406 and Article 7 definitions, and a continued hearing on nonconforming lots — all heading toward formal resolutions. On the administrative side, the board takes up a tax abatement petition from Robert N. and Claudina E. Posey (recommended for denial) and approval of the 2026 Board of Equalization officer recommendations. The consent agenda covers meeting minutes and two Chevrolet Silverado pickups for Road and Bridge at up to $89,400. The BLM Tres Rios Field Office also gets time for an update.",

  "telluride|2026-08-06|Town Council Retreat - Aug 06 2026":
    "The August 6 retreat is a single three-hour work session in which Council will set the Town's goals and objectives for 2027. No votes, no land-use items — just the annual exercise of deciding what this Council wants to prioritize in the year ahead. Those priorities, once set, tend to shape budget decisions and staff direction for the whole cycle, so the conversation matters even if nothing is formally adopted.",

  "telluride|2026-08-10|Intergovernmental Worksession - Aug 10 2026":
    "This intergovernmental worksession brings together representatives from Telluride, Mountain Village, Ophir, San Miguel County, and Norwood for a regional check-in. The session opens with a large-projects update spanning all five jurisdictions — a regular pulse-check on what's moving across the region. From there: a presentation on allyship with the Ute people from Ernest House Jr.; a status update on the Telluride Regional Medical Center's new facility from Tom Crabtree and Heidi Lauterbach; an update on regional infant care and the Munchkins program from Chambers Squier and Michelle Bulson; and a U.S. Forest Service update from Megan Eno. No votes or land-use decisions are on the agenda — this is a listening and coordination session.",

  "telluride|2026-08-11|Town Council - Aug 11 2026":
    "The most consequential item on this agenda is third reading of the Colorado Wildfire Resiliency Code — if approved, it amends the Land Use Code's historic and architectural review standards and landscaping/tree maintenance rules to align with state wildfire mitigation requirements. That's the kind of code change that quietly reshapes what property owners can and can't do with vegetation and building materials for years to come. The morning work sessions cover a parking program update, next steps for the Fino Units and Spruce House affordable housing properties, a potential floodplain remapping project, and a Comprehensive Plan update — four topics that touch the town's long-running tensions around housing, infrastructure, and growth management. The afternoon brings a 2027 goals-and-objectives discussion and a look at potential updates to the Telluride Energy Mitigation Program's fee calculations. A budget reappropriation ordinance gets its first reading. The manager's report includes occupancy updates on the Virginia Placer 2A housing project, mudslide cleanup and stormwater infrastructure, and a status check on the Oval Project.",

  "county|2026-08-12|Board of County Commissioners Work Session":
    "The August 12 Board of County Commissioners Work Session agenda hasn't been posted yet.",

  "smart|2026-08-13|SMART Board of Directors":
    "The August 13, 2026 SMART Board of Directors agenda hasn't been posted yet.",

  "county|2026-08-13|Planning Commission Meeting":
    "Two substantive items on the August 13 agenda. The commission takes up a work session on minor and major subdivisions — the kind of foundational land-use mechanics that quietly shape how parcels get divided across the county. Then, on referral and recommendation, an energy code update, which would revise the building standards that apply to new construction and major renovations. Code updates like this tend to move without much fanfare but set the baseline rules for years.",

  "rico|2026-08-19|Rico Board of Trustees Regular Meeting":
    "The August 19, 2026 Rico Board of Trustees Regular Meeting agenda hasn't been posted yet.",

  "telluride|2026-08-19|Historic & Architectural Review Commission Chair - Aug 19 2026":
    "The August 19 HARC agenda has one item: a pergola at 472 W Pacific Ave, the Elks Lodge property. The structure was built without a permit and is currently in violation — HARC will consider whether to approve it after the fact as a minor-scale alteration within the Telluride Historic Landmark District.",

  "telluride|2026-08-19|Historic & Architectural Review Commission - Aug 19 2026":
    "A full slate at HARC on August 19, dominated by two projects that have been in the room before and will be again. The Shandoka Lot Redevelopment at 860 Black Bear Rd comes in for preliminary large-scale review — Buildings 1 and 2 as one hearing, Buildings 3 and 4 as another — with a 3:00 PM site walk preceding the evening session. Both applications involve new construction of more than 5,000 sq ft in the Accommodations 2 zone district, with the Town of Telluride as owner and Design Workshop as applicant. A work session covers proposed new construction and shed work at 335 W Colorado — the County/Town Facilities project, now in its second HARC work session. Also on the public hearing list: a final large-scale application for 208 S Fir Street (5,000+ sq ft, Commercial zone), and smaller-scale items at 461 Dakota Ave and 734 Primrose Lane involving steep-slope construction.",

  "telluride|2026-08-19|Parks & Recreation Commission - Aug 19 2026":
    "The Commission takes up two substantive items. First, staff is recommending 2027 fee increases for the Town Park Campground and showers — nightly rates would rise roughly 8%, with premium vehicle sites moving from $55 to $60 and walk-in sites from $32 to $35; shower tokens would jump from $4 to $5 for five minutes, a 25% increase, partly to offset a new credit-card payment machine. Senior discount eligibility also creeps up, from age 63 toward the eventual target of 65. The campground is running at near-capacity through the summer — 97–99% occupancy on most site types in June and July — which gives the fee increases some market support. Second, the Commission holds a work session on the 5-year Capital Improvement Fund, setting priorities for 2027–2031 in advance of the August budget submittal. On the table: pool resurfacing, Oval redesign work (directed last meeting toward the alternate concept #2), Warner Field netting, river corridor improvements, and festival site upgrades. Staff flags 10% annual cost escalation as a budgeting reality. There's also a brief staff update on the River Trail re-alignment near the Public Works facility.",

  "county|2026-08-19|Board of County Commissioners Meeting":
    "The BOCC's August 19 meeting has two items worth tracking. First, the Board — sitting as the San Miguel County Housing Authority — will spend 45 minutes on San Miguel Regional Housing Authority compliance procedures, a discussion that lands at a moment when affordable housing finances across the region are under real strain. Second, a public hearing on an insubstantial PUD amendment to the Lawson Hill PUD would update the development plan matrix to allow fences and yards within the setback. On the administrative side, the Board will consider Resolution 2026-33, updating the employee handbook on overtime comp time and the 457b retirement benefit. A housing specialist will also provide a general affordable housing update, and the Natural Resources & Climate Resilience director will check in. Consent agenda covers the June road report, July vendor and payroll payments, and minutes from three July meetings.",

  "telluride|2026-08-20|Liquor Licensing Authority - Aug 20 2026":
    "Four public hearings on special event liquor permits fill this meeting. Palm Arts Inc. is seeking one permit for an Evening with Ken Burns — a fundraiser for the Telluride Historical Museum — at the Palm Theatre on August 30, with an anticipated 500 attendees. KOTO Radio is up next with a permit for its Live @ the Drive block party on N. Pine Street, August 27 from 2:00 to 9:30 pm. The Telluride Blues Society has two separate requests: one permit for Blisters and Brews at Elks Park on the morning of September 19, and three permits covering all three days of the Telluride Blues and Brews Festival at Town Park (September 18–20, running late into the night). Staff recommends approval on all four. The authority will also approve minutes from the July 16 meeting.",

  "mv|2026-08-20|Town Council Meeting":
    "A full agenda for Mountain Village this Thursday. The most consequential action item is a resolution setting a sale price appreciation cap under Municipal Code Section 16.02.070 — the kind of deed-restriction mechanics that determine whether affordable units actually stay affordable over time. Council also takes up a 2026 budget appropriation amendment and a conditional use permit for temporary office space on Lot 68R. On first reading: an ordinance amending the Public Art Commission's chapter in the municipal code, with a public hearing to be set. The SMART gondola gets a progress update — forty minutes of council time, which signals there's real ground to cover. Additional informational items include a pond improvements conceptual design update, a Chamber of Commerce formation work session, a Telluride School District mill levy override preview for November 2026, and a presentation from Thrive Community Health Network and Raices Sin Fronteras on a Workers Protection Ordinance. The meeting closes with an executive session on Town Manager recruitment.",

  "norwood|2026-08-12|Board of Trustees Meeting":
    "The August 12, 2026 Norwood Board of Trustees Meeting agenda hasn't been posted yet.",

  "norwood|2026-08-17|Planning and Zoning Commission Meeting":
    "The August 17, 2026 Norwood Planning and Zoning Commission Meeting agenda hasn't been posted yet.",

  "mv|2026-08-06|Design Review Board":
    "Three multifamily projects are on the board's plate Thursday morning. First up is an initial architecture and site review for four new multifamily units at 100 Pennington Place (Lot 726-R1). Then the board returns to a multifamily building at TBD Lost Creek Lane (Lot 27A) — continued from June — for another initial architecture review. A conditional-use permit for office space at 620 Mountain Village Blvd, Unit 1A goes to the DRB for a recommendation to Town Council. Finally, the final architecture review for a 15-unit employee apartment building at 306 Adams Ranch Road (Lot 640A) is expected to be continued to the September 3 meeting.",

  "ophir|2026-08-18|General Assembly Meeting":
    "The August 18, 2026 Ophir General Assembly Meeting agenda hasn't been posted yet.",

  "ridgway|2026-08-12|Ridgway Town Council Regular Meeting":
    "A full agenda for August 12. The headline item is a joint work session with the Planning Commission on the draft 2026 Housing Action Plan — required under SB 24-174 by 2028, with five goal areas covering policy, future housing, lifecycle housing, workforce housing, and momentum building. On the land-use side, council holds a public hearing on the Hyde Subdivision — a resubdivision of four lots in the Historic Residential zone at the corner of Hyde and S. Charlotte Streets. More consequential still: a public hearing on the proposed Alpenglow Vista Metropolitan District Nos. 1–4, a consolidated service plan for a new metro district along N. Laura, McCall, Roundhouse, and N. Cora Streets in the Light Industrial and Mixed Residential zones. Ouray County representatives will present a proposed county sales tax for disaster mitigation and response. Council also takes up the updated Community-Led Marketing Strategy, a Business Recovery Initiative, and a Chamber of Commerce biannual report. Routine consent items include liquor license renewals for Sherbino Theater, Eatery 66, Colorado Boy, the Liquor Library, and Greenwoods, plus a new restaurant liquor license hearing for Fire Root Kitchen.",

  "norwood|2026-08-11|Norwood Water Commission Meeting":
    "The Norwood Water Commission meets August 11 at 6:30 p.m. at Town Hall with a Zoom option. Routine consent items cover July financials, meeting minutes, and budget-to-actuals. Board business includes recognizing Public Works Director Randy Harris for five years of service, a budget discussion, and — the most substantive item — a review of the Draft Raw Water Delivery and Storage Alternatives Analysis prepared by SGM. That analysis will shape how Norwood thinks about securing its water future, a perennial pressure for a small town on the west end of the county. Ray Cossey also has an item on the agenda, though details aren't specified.",

  "telluride|2026-08-20|Planning & Zoning Commission - Aug 20 2026":
    "The August 20 P&Z meeting has two work sessions and one public hearing worth following. The school district's employee housing proposal gets its first formal look — a work session on new construction at the northwest corner of the Telluride Middle-High School site at 725 W Colorado, governed by an intergovernmental agreement between the Town and Telluride School District R1. The 238 N Pine Street minor subdivision — a proposal to split a 7,500-square-foot Historic Residential parcel into two lots — comes back for a public hearing after a long string of continuances dating to February. Two additional work sessions cover a Comprehensive Plan status update and a Land Use Code revision to Section 3-505 governing tree maintenance, removal, and relocation.",

  "telluride|2026-08-20|Planning & Zoning Commission Chair - Aug 20 2026":
    "The August 20, 2026 Planning & Zoning Commission Chair agenda hasn't been posted yet.",

  "tmvoa|2026-08-11|Mountain Village Merchant Meeting":
    "The August 11, 2026 Mountain Village Merchant Meeting agenda hasn't been posted yet.",

  "tmvoa|2026-08-20|TMVOA Investment Committee Meeting":
    "The August 20, 2026 TMVOA Investment Committee Meeting agenda hasn't been posted yet.",

  "county|2026-08-26|Board of County Commissioners Work Session":
    "A Special Meeting with a mix of routine approvals and one item worth watching closely: a 40-minute discussion on Colorado Child Care Assistance Program (CCAP) funding and what its budget implications mean for the county. Human Services Director Linnea Edwards will also present the Core Services Plan for FY 2026-2027. On the administrative side, the Board takes up a fee adjustment for the Green Grants program — bumped from $10,000 to $15,000, or 10% of total grant funding — plus authorization for the Black Bear Pass in Reverse event on September 12, and interviews two applicants for the Telluride Regional Airport Authority Board. Consent items include a board reappointment and the 2026 Abstract of Assessment.",

  "med|2026-08-27|Regular Board Meeting":
    "The Telluride Hospital District board meets July 23 with a heavy agenda centered on the new facility project. Two items stand out: an update on the RFQ for architect selection, and a discussion and possible action on a Two Site Model — a direction that would shape what gets built, where, and at what scale. The board will also take up a Letter of Intent with CommonSpirit Health, a large Catholic health system, which could define the partnership framework for whatever comes next. Routine finance and administrative updates round out the morning, along with an executive session for CEO review.",

  "norwood|2026-08-05|Board of Trustees Work Session":
    "A short work session for the Norwood Board of Trustees, with two lease renewals on the table — Motion Sense Therapy and Performance at 1110 Lucerne St and Austin Overholt at 1475 Pine St. No executive session, no code changes, no land-use items. Formal action can't be taken at a work session, so any decisions will follow at a regular meeting.",

  "ouray|2026-08-05|, 2-4:00 PM - Virtual Meeting Only - No in-person attendance.  Work session to review and discuss possible changes to the Ouray County Land Use Code, Section 2 – Definitions. (Packet materials are attached to the agenda)":
    "Ouray County Planning Commission meets virtually August 5th, 2–4 PM, for a work session on possible changes to the Land Use Code's Section 2 — the definitions section. No in-person attendance. Work sessions like this are where the real shaping happens: definitions determine what the rules actually mean in practice, and a tweak to how a term is defined can quietly shift what gets permitted, what gets denied, and how future applications get read. The packet is attached to the posted agenda, but the agenda itself doesn't spell out which definitions are under review.",

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

  "county|2026-08-27|CWAB":
    "The Citizens' Weed Advisory Board meets August 27 at 4:30 PM via Zoom for its regular session. Julie Kolb presents on vegetation control and management — treatments applied and areas covered — along with a report on U.S. Forest Service and ATB treatment work from 2025. The board also takes up landowner response to the Noxious Weed Fund Grant and approves May meeting minutes.",

  "telluride|2026-08-20|Planning & Zoning Commission Chair - Aug 20 2026 - Cancelled":
    "The August 20, 2026 Planning & Zoning Commission meeting has been cancelled.",

  "telluride|2026-08-10|Open Space Commission Site Walk - Aug 10 2026":
    "The Open Space Commission trades the conference room for the trail on August 10, meeting at the Bear Creek Trailhead at 4:00 PM for a site walk. Three things are on the ground-level agenda: a potential new trail alignment connecting Bear Creek Trailhead to Firecracker Hill, a look at beaver activity in Zone 3 of the Bear Creek Preserve, and restoration planning in Zone 1. Site walks like this are where the real decisions get shaped — what gets built, what gets left alone, what nature is already rerouting on its own.",

  "norwood|2026-09-08|Norwood Water Commission Meeting":
    "The September 8, 2026 Norwood Water Commission Meeting agenda hasn't been posted yet.",

  "tmvoa|2026-09-08|Mountain Village Merchant Meeting":
    "The September 8, 2026 Mountain Village Merchant Meeting agenda hasn't been posted yet.",

  "fire|2026-08-18|Board of Directors Meeting":
    "The Telluride Fire Protection District board meets August 18th at 5:30 p.m. at 131 W. Columbia Ave. Station 3 gets another update — that project has been moving through the district's planning for a while now. The board will also hear a wildfire assignment update, which matters in a region that has watched fire seasons grow longer and more complicated. PANO usage figures for July come up under old business, giving the board a sense of how the panoramic wildfire-detection system is performing. New business includes an inclusion planning presentation from Bo Nerlin. The full slate of staff reports — Deputy Chief, Battalion Chief, Fire Marshal, EMS Coordinator, HR, and District Chief — rounds out the meeting, followed by bill approvals. No executive session or appeals are scheduled.",

  "airport|2026-08-20|TRAA Board of Commissioners Meeting":
    "The August 20, 2026 TRAA Board of Commissioners Meeting agenda hasn't been posted yet.",

  "norwood|2026-09-09|Board of Trustees Meeting":
    "The September 9, 2026 Norwood Board of Trustees Meeting agenda hasn't been posted yet.",

  "ridgway|2026-09-09|Ridgway Town Council Regular Meeting":
    "The September 9, 2026 Ridgway Town Council Regular Meeting agenda hasn't been posted yet.",

  "county|2026-09-09|Board of County Commissioners Work Session":
    "The September 9, 2026 Board of County Commissioners Work Session agenda hasn't been posted yet.",

  "telluride|2026-09-10|Town Council Budget - Sep 10 2026":
    "The September 10, 2026 Town Council Budget agenda hasn't been posted yet.",

  "county|2026-09-10|Planning Commission Meeting":
    "Three Land Use Code amendments are on the table for the Planning Commission's recommendation — covering forestry practices, oil and gas, and geothermal energy. All three are code-change items, meaning the Commission is being asked to weigh in before any revisions move forward to the BOCC. The agenda text doesn't detail the specific proposed changes within each amendment, but the pairing of oil & gas with geothermal in the same session signals the county is taking a broad look at how extraction and energy activities are regulated in unincorporated San Miguel County.",

  "telluride|2026-08-13|San Miguel Authority for Regional Transportation - Aug 13 2026":
    "SMART's board meets virtually on August 13th with a agenda that touches both the organization's structure and its ongoing gondola work. The board takes up Resolution 2026-15, which restructures the Gondola Advisory Committee — a body that has been central to the $5.2M/year gondola tax project since voters approved 3A. Resolution 2026-16 assigns the existing professional services contract with attorney Paul J. Taddune, P.C. to the law firm JVAM, PLLC — a transition worth noting given the legal complexity surrounding the gondola project. Resolution 2026-17 amends the current FY26 budget and capital spending plan, and the board opens a conversation on FY27 budget development. A gondola project update and standard operations report round out the substantive items. The meeting closes in executive session on personnel matters.",

  "telluride|2026-08-26|Public Art Commission - Aug 26 2026":
    "The Public Art Commission holds what appears to be an early organizational meeting — electing a chairperson, reviewing existing policy and guidelines, and setting a meeting schedule. The substantive work session centers on public art installations, with Town Council Objective I.D.5 directing the commission to explore integrating art into Town infrastructure, starting with a coordinated installation at the Silver Jack Stair.",

  "tmvoa|2026-08-27|TMVOA Board of Directors Meeting":
    "The TMVOA Board meets August 27 with several consequential items on a fairly packed agenda. The headline action is forming a Workforce Housing Committee — a signal that Mountain Village's affordable housing pressures are pushing the association toward a more structured response. The board will also vote to adopt updated policies and act on a grant request for the TMV Ice Pad. On the informational side: the dissolving of the FAB (Finance Advisory Board), a background briefing on 161CR public benefits, and an update on the Pond Improvement Plan. The 161CR item is worth watching — public benefits discussions tied to major development agreements tend to carry long tails in this valley.",

  "telluride|2026-08-25|Ethics Commission - Aug 25 2026":
    "The Ethics Commission meets August 25 to handle two items of real consequence. First, the routine: electing a new chair and vice-chair. Second, and more substantive: developing a recommendation to Town Council on whether — and how — to establish a formal Code of Conduct for Telluride officials. That recommendation traces directly to the Commission's May 18 finding in the Julia Fallman complaint against Councilperson Kristen Permakoff. The Commission found no ethics violation, but only because the current code's 'above reproach' standard lacks the behavioral specificity to support one. Staff has laid out two main paths: integrate explicit conduct language into the existing Ethics Code (Chapter 2, Article 4), where the Ethics Commission already has enforcement authority, or strengthen the Council's own Rules of Conduct, which currently has no formal penalty mechanism. The Commission can also draft its own hybrid approach. Whatever they recommend goes to Town Council for action.",

  "telluride|2026-08-19|Ecology Commission - Aug 19 2026":
    "The Ecology Commission meets August 19 to continue work on the 2027 Climate Action Plan update — two work sessions are on the docket, one covering the update broadly and one focused specifically on the Materials & Consumption focus area. The commission will also plan Black Bear Safety Week. Minutes from the July 8 meeting are up for approval; that session covered transportation, land use, and materials focus areas of the CAP, and appointed Ruthie Boyd and Kristen Rosenbaum to the Green Grants selection subcommittee.",

  "ouray|2026-08-19|, 1-4:00 PM (@ OURAY COURTHOUSE!) - The PC will hold 3 public hearings; Repeal of Sec.16, Colona Restaurant SUP Amend., and an Exception application for Elk Meadows (Packet materials are attached to the agenda)":
    "Ouray County Planning Commission meets August 19 at the Ouray Courthouse for three public hearings. First up: a repeal of Section 16 of the county's land use regulations — a code change worth watching closely, since repealing an entire section rewrites the rules in ways that can ripple across future applications. Second, an amendment to an existing Special Use Permit for a restaurant in Colona. Third, an Exception application for Elk Meadows. Packet materials are attached to the posted agenda for anyone who wants the details before showing up.",

  "norwood|2026-08-17|Planning and Zoning Commission Cancelled":
    "The August 17, 2026 Norwood Planning and Zoning Commission meeting has been cancelled. The next regular meeting is scheduled for September 21, 2026 at 6:30 p.m.",

  "smart|2026-09-10|SMART Board of Directors":
    "The September 10, 2026 SMART Board of Directors agenda hasn't been posted yet.",

  "telluride|2026-09-14|Open Space Commission - Sep 14 2026":
    "The September 14, 2026 Open Space Commission agenda hasn't been posted yet.",

  "telluride|2026-08-17|Open Space Commission Site Walk - Aug 17 2026":
    "The Open Space Commission is stepping away from the conference table for this one — literally. Members will meet at the Boomerang Road Trailhead near the Shell Station on Highway 145 Spur and walk the Valley Floor to look at potential sign sizes and placements. The agenda is careful to note this is non-content signage review, meaning the focus is on physical scale and location, not what the signs say. A site walk like this is how decisions about the Valley Floor tend to get made well — on the ground, not on paper.",

  "school|2026-08-24|Telluride Board of Education Work Session":
    "The Board meets in work session to hear updates on four fronts. First, school opening highlights as the year gets underway. Second — and most substantial — a detailed flood damage and mitigation report: this past summer's flooding hit the TIS 5th grade pod, TMHS's cafeteria and ground-floor spaces, and the Palm Theatre complex hard, stripping flooring, sheetrock, and the stage itself. Air quality tests cleared most spaces by mid-August; the Palm Theatre main house is still pending. Third, the employee housing initiative gets a full review: the adopted program targets 24 homes now (20 at Ilium, 4 at the High School site), with 4 more shovel-ready, at a gross district draw of roughly $9.2M — net ~$6.9M after the San Miguel Basin Hospital District purchases four Ilium duplexes for ~$2.32M. Rico has been dropped from the program due to mobilization costs. Finally, a Rico School update is on the agenda.",

  "school|2026-08-25|Telluride Board of Education Monthly Meeting":
    "The August 25 Board of Education meeting carries real weight. The most consequential item is a flood-related budget appropriation for FY 2026-27 — the board will discuss and then vote on adjusting the district's spending plan to account for flood damage, a reminder that the canyon's geography extracts its own costs. Also on the action list: approving a custodial contract, an IGA for a school housing site (a recurring pressure point for any institution trying to keep staff in this valley), and revised MLO ballot language — the mill levy override question that the district has been building toward. Policy updates get a first reading, including EL-11 and JKA. The board's annual self-assessment is on the 'Other' docket, and a full-day retreat follows the next morning at Wilkinson Public Library.",

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
    "The September 16, 2026 Board of County Commissioners Meeting agenda hasn't been posted yet.",

  "mv|2026-09-17|Town Council Meeting":
    "The September 17, 2026 Mountain Village Town Council Meeting agenda hasn't been posted yet.",

  "airport|2026-09-17|TRAA Board of Commissioners Meeting":
    "The September 17, 2026 TRAA Board of Commissioners Meeting agenda hasn't been posted yet.",

  "telluride|2026-09-17|Liquor Licensing Authority - Sep 17 2026":
    "The September 17, 2026 Liquor Licensing Authority agenda hasn't been posted yet.",

  "telluride|2026-08-26|Resident Advisory Committee - Aug 26 2026":
    "The Resident Advisory Committee holds its inaugural meeting — a body created to give Town of Telluride employee-housing tenants a structured voice on rental policies and conditions. The hour is organized around the fundamentals: introductions, electing a chair and secretary, aligning on the RAC's mission and limitations, and walking through meeting procedures including confidentiality rules and public notice practices. Town Representatives and a Telluride Housing Authority board rep will share updates on a tenant survey, a resident informational session scheduled for September 23 at Wilkinson Library, and an ongoing review of rental housing policies. Members will also take public comment from tenants and set the next meeting date, with a target cadence of at least four meetings per year.",

  "school|2026-08-26|Telluride Board of Education Monthly Meeting":
    "The Board is spending a full day at a retreat — held at the Wilkinson Public Library rather than the usual meeting room — focused almost entirely on how the Board itself governs, rather than on any specific district program or decision. The morning centers on Policy Governance, the structured framework that defines the Board's role as setting ends (outcomes) while leaving means to the Superintendent. The Board will review survey results showing directors want simpler metrics and clearer accountability evidence. A significant part of the day is devoted to reformatting how the Superintendent's monitoring reports are presented — shifting from narrative summaries to explicit compliance determinations tied to measurable standards. The afternoon covers community engagement, inclusive school systems, strategic financial planning, and board continuity and succession. No action items are on the agenda; this is a working session meant to sharpen how the Board does its job.",

  "norwood|2026-09-21|Planning and Zoning Commission Meeting":
    "The September 21, 2026 Norwood Planning and Zoning Commission Meeting agenda hasn't been posted yet.",

  "county|2026-08-24|Open Space Commission Meeting":
    "The Open Space Commission meets August 24 for a broad status check across several ongoing projects. Staff will give updates on Mill Creek Park (recently grass-seeded), the East End Connector Trail at Idarado, Galloping Goose Park, the Placerville Schoolhouse masonry and painting work, and a position posting for a Parks + Open Space Manager. The one item with sharper public interest is new: citizen concerns about water flow diversion and the Bridal Veil conservation easement connected to Black Swift habitat. The commission also notes the 25th anniversary of Down Valley Park — and a retirement party for Rich — on September 12.",

  "school|2026-09-22|Telluride Board of Education Work Session":
    "The September 22, 2026 Telluride Board of Education Work Session agenda hasn't been posted yet.",

  "school|2026-09-22|Telluride Board of Education Monthly Meeting":
    "The September 22, 2026 Telluride Board of Education Monthly Meeting agenda hasn't been posted yet.",

  "telluride|2026-09-22|Telluride Housing Authority - Sep 22 2026":
    "The September 22, 2026 Telluride Housing Authority agenda hasn't been posted yet.",

  "telluride|2026-09-22|Town Council - Sep 22 2026":
    "The September 22, 2026 Town Council agenda hasn't been posted yet.",

  "county|2026-09-23|Board of County Commissioners Work Session":
    "The September 23, 2026 Board of County Commissioners Work Session agenda hasn't been posted yet.",

  "med|2026-09-24|Regular Board Meeting":
    "The September 24, 2026 MED Regular Board Meeting agenda hasn't been posted yet.",

  "telluride|2026-09-24|Planning & Zoning Commission - Sep 24 2026":
    "The September 24, 2026 Planning & Zoning Commission agenda hasn't been posted yet.",

  "telluride|2026-09-24|Planning & Zoning Commission Chair - Sep 24 2026":
    "The September 24, 2026 Planning & Zoning Commission Chair agenda hasn't been posted yet.",

  "telluride|2026-08-27|Open Space Commission Site Walk - Aug 27 2026":
    "The Open Space Commission heads out to Bear Creek Reserve for a site walk — meeting at the Town Park vehicle bridge at 4:00 PM. The one substantive item is a work session review of Camp Alderwild festival camping in Zone 1 of the reserve. No formal votes expected; this is a field look at how that use is playing out on the ground.",

  "telluride|2026-09-10|(Rescheduled to Oct 13th) Town Council Budget - Sep 10 2026":
    "This September 10 budget session has been rescheduled to October 13th. No agenda has been posted yet.",

  "county|2026-08-27|Citizens Weed Advisory Board":
    "San Miguel County's Citizens Weed Advisory Board meets August 27 via Zoom at 4:30 p.m. The main business is a 2025 season update from Vegetation Control and Management Manager Julie Kolb — covering which treatments were applied and where, USFS and ATB coordination, and landowner response to the Noxious Weed Fund Grant. The board will also take up enforcement considerations and approve the May 2026 minutes. Noxious weed management is one of those unglamorous but persistent responsibilities in a county where invasive species pressure on rangeland and open space doesn't let up.",

  "telluride|2026-09-23|Vending Subcommittee - Sep 23 2026":
    "The September 23, 2026 Vending Subcommittee agenda hasn't been posted yet.",

  "county|2026-09-15|Housing Code Update SSR":
    "The agenda for this San Miguel County Housing Code Update SSR meeting hasn't been posted yet beyond the meeting title itself — no item details, staff reports, or supporting materials are available to summarize.",

  "ouray|2026-09-02|PM - Note: Virtual/Zoom meeting only!  The Planning Commission will conduct a work session to review and discuss possible changes to the Ouray County Land Use Code, Section 2 – Definitions. (packet materials are attached to the agenda)":
    "Ouray County's Planning Commission meets virtually on September 2 for a work session on possible changes to the Land Use Code, Section 2 — Definitions. Work sessions like this one are where the real shaping happens, before anything goes to a public hearing. The specific definition changes under discussion aren't detailed in the posted notice, but packet materials are attached to the agenda for anyone who wants to dig in ahead of the meeting.",

  "county|2026-09-28|Open Space Commission Meeting":
    "The September 28, 2026 Open Space Commission Meeting agenda hasn't been posted yet.",

  "telluride|2026-09-30|Special Meeting - Historic & Architectural Review Commission - Sep 30 2026":
    "The September 30, 2026 Special Meeting - Historic & Architectural Review Commission agenda hasn't been posted yet.",

  "telluride|2026-09-17|Special Meeting - Planning & Zoning Commission - Sep 17 2026":
    "The September 17, 2026 Special Meeting - Planning & Zoning Commission agenda hasn't been posted yet.",

  "telluride|2026-09-30|Special Town Council - Sep 30 2026":
    "The September 30, 2026 Special Town Council agenda hasn't been posted yet.",

  "mv|2026-10-01|Design Review Board":
    "The October 1, 2026 Mountain Village Design Review Board agenda hasn't been posted yet.",

  "telluride|2026-10-01|Town Council Budget - Oct 01 2026":
    "The October 1, 2026 Town Council Budget agenda hasn't been posted yet.",

  "county|2026-10-01|Lodging Tax Panel Meeting":
    "The October 1 Lodging Tax Panel agenda hasn't been posted yet.",

  "county|2026-09-09|Board of County Commissioners Special Meeting":
    "The September 9, 2026 Board of County Commissioners Special Meeting agenda hasn't been posted yet.",

  "ouray|2026-09-16|, 1-4:00 PM (@ OURAY COURTHOUSE!) - The PC will hold 2 public hearings; Curry Regular PUD, and an Exemption application from Clifford Pastor to subdivide his parcel into 2 lots. (Packet materials are under media TV icon)":
    "Ouray County's Planning Commission meets at the Ouray Courthouse for two public hearings. First up is the Curry Regular PUD — a formal planned unit development application that will get a full public hearing. Second is an exemption application from Clifford Pastor to subdivide his parcel into two lots. Both items require public hearings before the PC can make a recommendation, and packet materials are available through the county's agenda portal.",

  "norwood|2026-09-08|NWC Rescheduled to 09/22/2026":
    "The September 8th Norwood Water Commission meeting has been rescheduled to Tuesday, September 22, 2026, at 6:30 p.m. at Norwood Town Hall."
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
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-08-11",
    title: "Town Council — Aug 11, 2026",
    recap: "Council approved on third reading an ordinance amending the land use code to implement the Colorado Wildfire Resiliency Code (CWRC). The key revision removes tree-mitigation requirements for trees removed specifically under the CWRC. The vote was 6-1, with one dissenting vote.\n\nCouncil approved on first reading a mid-year budget amendment totaling approximately $5.4 million, covering carry-forward items from 2025 (road improvements, fleet, sewer lining) and new 2026 appropriations including costs tied to the ski patrol strike, sewer line relocates, and a wayfinding project. A public hearing for second reading was set for September 1.\n\nJohn Kirkindall was unanimously appointed to a regular seat on the Telluride Regional Airport Authority for a four-year term. Council also directed staff to pursue a FEMA flood-plane remapping project — the town's map dates to 1992 — with a placeholder to be included in the 2027 budget. Estimated cost is $225,000–$275,000 and the process is expected to take roughly two years.\n\nFor the two Feno deed-restricted units, council reached consensus via straw poll to convert them to EDUs (removing the price and income caps while retaining occupancy qualification requirements) and market them broadly, potentially through an MLS listing. The recently acquired Spruce House unit will go to a general lottery, timing to be determined by staff. A new hotel-and-restaurant liquor license for \"The Patio\" at 138 East Colorado Avenue was approved unanimously by the Liquor Licensing Authority.",
    votes: [{"item":"CWRC land use code amendments — 3rd reading","outcome":"Passed","tally":"6-1"}, {"item":"Mid-year 2026 budget amendment — 1st reading","outcome":"Passed","tally":"7-0"}, {"item":"Kirkindall appointment — Airport Authority","outcome":"Passed","tally":"7-0"}, {"item":"Liquor license — The Patio (FA Wining Pigs Bar 10)","outcome":"Passed","tally":"5-0"}, {"item":"Enter executive session","outcome":"Passed","tally":"7-0"}],
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
    recap: "Council swore in two new members, Maria Stark and Charles Dalton, bringing the body to full seven-member strength.\n\nA work session covered an East Colorado Avenue speed study by KLJ Engineering, focusing on the Gold Run corridor between North Alder Street and Liberty Bell Lane. Staff found that segment two has the worst speeding problem, with 20–30% of vehicles exceeding the 15 mph limit. No votes were taken; council discussion centered on raised crosswalks, edge-line striping, a possible speed limit reduction, and a mini-roundabout near the Galloping Goose turnaround. Recommendations will feed into 2027 budget discussions.\n\nOn the Colorado Wildfire Resiliency Code, council approved second reading of the land use code amendments 6-1 (Charles Dalton dissenting), with an amendment stripping mitigation requirements for trees removed pursuant to the CWRC. A third reading is set for August 11.\n\nCouncil approved a temporary-structure permit for three patio tents at 221 South Oak Street (restaurant use), 180 days per year for three consecutive years, unanimously. A contested appeal involving a North Aspen Street property was continued to September 1 at 10 a.m., unanimously.\n\nLily Acres was appointed to a regular seat on the Ecology Commission for a two-year term, unanimously. Council reassigned board and commission liaisons to incorporate the two new members, approved unanimously.\n\nSitting as the Telluride Housing Authority, council reappointed Ellen Leven as chair, Dan Enright as co-chair, and Kristen Permacoff as secretary (unanimously), and adopted a policy statement on primary residency for dependents of multiple custodial parents — setting a 20% custody threshold and covering children through age 18 — on a 4-3 vote. The wait-list suspension was extended through September 30, unanimously.\n\nSitting as Block 23 Housing Corporation, officers were retained and authorized signers updated, unanimously.",
    votes: [{"item":"Executive session — San Miguel Valley Court","outcome":"Passed","tally":"7-0"}, {"item":"CWRC land use code amendments — 2nd reading","outcome":"Passed","tally":"6-1"}, {"item":"Temp structure — 221 South Oak patio tents","outcome":"Passed","tally":"7-0"}, {"item":"Stender Residence appeal — continued to Sep 1","outcome":"Continued","tally":"7-0"}, {"item":"Appoint Lily Acres — Ecology Commission","outcome":"Passed","tally":"7-0"}, {"item":"Council board/commission appointments","outcome":"Passed","tally":"7-0"}, {"item":"THA officer certifications","outcome":"Passed","tally":"7-0"}, {"item":"THA custody/primary residency policy statement","outcome":"Passed","tally":"4-3"}],
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
    title: "Telluride Town Council discusses rental rates",
    source: "Telluride Times",
    date: "September 4, 2026",
    firstSeen: "2026-09-04",
    newsTopic: "government",
    copy: "San Miguel County's AMI rose 9.7% in 2026, which would have pushed rents higher in Telluride's 244 town-managed units. Council voted to hold rental rates at 2025 AMI levels instead, citing a rough winter season and slow summer. A broader housing policy review is underway, but consultant findings won't arrive until after the 2027 budget is set.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_d06d1db0-2b56-471a-9bd1-b714aa12b1cc.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/5c/25c2813e-8353-48f6-bab0-c5b59f444583/6a9a457ad61ee.image.jpg",
    imgHiRes: true
  },
  {
    title: "Speed limit reduced to 15 mph",
    source: "Telluride Times",
    date: "September 4, 2026",
    firstSeen: "2026-09-04",
    newsTopic: "public-safety",
    copy: "Norwood has dropped its town speed limit to 15 mph, with new signs going up as soon as public works can swap them out. San Miguel Power Association also weighed in — more outages are expected while the grid runs in fire-safe mode, and small rate increases are likely each year for the next three years.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_35fde4ca-ce1c-403a-972d-7b8b3fa62e30.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/d1/bd13af59-c5d3-4c4b-ae12-fcfe6b1b29ea/6a992fce8549b.image.jpg",
    imgHiRes: true
  },
  {
    title: "Updated: Plane with two occupants crashes southwest of Telluride",
    source: "Telluride Times",
    date: "September 4, 2026",
    firstSeen: "2026-09-04",
    newsTopic: "public-safety",
    copy: "A Cessna 206 with two men aboard crashed on the north side of Dolores Peak, about 15 miles southwest of Telluride, on Thursday afternoon. Both occupants were killed. The plane had taken off from Grand Junction and was conducting survey and mapping operations when Denver Air Traffic Control reported it missing at 3:43 p.m. NTSB is investigating.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_55a719fb-7905-4ecf-8097-a67752a102bc.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/cf/1cf2fd93-2a27-4243-a7c3-15f70a700919/6a9a527ab729a.image.jpg",
    imgHiRes: true
  },
  {
    title: "FIFA accuses European body UEFA of 'smear campaign' in filing related to World Cup sell-off plan",
    source: "Telluride Times",
    date: "September 3, 2026",
    firstSeen: "2026-09-03",
    newsTopic: "community",
    copy: "FIFA and UEFA are fighting in U.S. courts over Infantino's shelved plan to sell World Cup stakes to private equity for $4.2 billion. FIFA calls UEFA's discovery filings a \"smear campaign\"; UEFA says it's preparing a Swiss criminal complaint over possible financial mismanagement. The proposal was pulled August 1st after swift backlash.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_42fa1647-c864-548b-9fe7-397f002a3d8d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/21/a21b7362-438a-5a92-8820-9c69801ecdfa/6a99f02e4df34.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride Film Festival: The mountains win again",
    source: "Telluride Times",
    date: "September 3, 2026",
    firstSeen: "2026-09-03",
    newsTopic: "arts-culture",
    copy: "The 53rd Telluride Film Festival leans heavily local, with films tied to Telluride residents, the surrounding mountains, and regional stories. Highlights include a documentary about locals Hilaree Nelson and Jim Morrison's Everest attempt, and Andrew Haigh's Colorado-set film. Yo-Yo Ma performs free in Town Park Sunday.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_efeefa09-00ac-444e-a5a3-f5de8b06f205.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/8a/c8a7e1e5-bca2-430f-af31-09fb901bc44d/6a99efff2c2ef.image.jpg",
    imgHiRes: true
  },
  {
    title: "US Forest Service closing 23 research facilities as part of reorganization under Trump",
    source: "Telluride Times",
    date: "September 3, 2026",
    firstSeen: "2026-09-03",
    newsTopic: "housing",
    copy: "The U.S. Forest Service is closing 23 research stations across more than a dozen states, though officials say the science work will continue at other locations. The moves are part of a broader reorganization that includes relocating agency headquarters from D.C. to Salt Lake City and is expected to save around $16 million. The agency has shed roughly 6,000 employees — about 15% of its workforce — since the start of Trump's second term.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_50cf65b2-703c-5581-bc08-0cb36eb38eee.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/2c/b2c784ed-ddf2-509d-8a18-461187aca55b/6a99c80a6a3b8.image.jpg",
    imgHiRes: true
  },
  {
    title: "CHALKBOARD Week of Sept. 3-9",
    source: "Telluride Times",
    date: "September 3, 2026",
    firstSeen: "2026-09-03",
    newsTopic: "government",
    copy: "Birthdays, meetings, and recurring events fill the Norwood-area calendar for the week of Sept. 3–9. Regulars include the Farmers Market Thursdays in Pocket Park, senior meals Mondays and Thursdays, Sunday food pantry distribution at Norwood School, and pickleball several days a week. Various board meetings and community services continue on their usual schedules.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_1b65b2cc-7349-4828-8583-7db27354551f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/83/58327133-e68f-48b4-9435-57ae76b95e85/6a992ba59f32c.image.jpg",
    imgHiRes: true
  },
  {
    title: "What is an Enterprise Zone?",
    source: "Telluride Times",
    date: "September 3, 2026",
    firstSeen: "2026-09-03",
    newsTopic: "government",
    copy: "San Miguel County joined the Region 10 Enterprise Zone on July 16, a designation tied to last winter's rough season — low snowfall and a holiday ski area closure hurt enough businesses to qualify the east end of the county. Businesses, farms, nonprofits, and local governments may now be eligible for up to 10 different Colorado state income tax credits covering hiring, equipment, training, and more. One catch: you must pre-certify before starting any activity you plan to claim — you can't do it after the fact.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_676078a9-2cf2-486a-aa29-5a4ec17f8504.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/1f/61f75095-5ffd-464a-9c39-3d8c4a5117e0/6a971ab817307.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "‘A piece of cultural history’",
    source: "Telluride Times",
    date: "September 3, 2026",
    firstSeen: "2026-09-03",
    newsTopic: "arts-culture",
    copy: "British fashion designer Bella Freud has created the official poster for the 53rd Telluride Film Festival, set for 2026. Her design centers on bold, shiny lettering — \"Telluride,\" \"Film Festival,\" and \"SH~W\" — against a black-and-white pixelated backdrop of town and peaks. Festival posters here have long been collected as artistic artifacts, with past contributors including Ed Ruscha, Chuck Jones, and Julian Schnabel.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_e5eac4e0-e596-47f8-ba7b-6aee7ecbdd80.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/6d/56d76aaa-339d-4745-9857-665d3df9f31e/6a93201314de2.image.png",
    imgHiRes: true
  },
  {
    title: "SHOW Time: Telluride Film Festival illuminates the box canyon",
    source: "Telluride Times",
    date: "September 3, 2026",
    firstSeen: "2026-09-03",
    newsTopic: "arts-culture",
    copy: "The Telluride Film Festival kicks off its 53rd edition this weekend, marking 20 years for Director Julie Huntsinger. Sixty-four films screen free over the four-day weekend, including outdoor showings in Elks Park and Town Park. Huntsinger's long focus has been keeping the festival accessible beyond industry insiders — and that approach hasn't changed.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_16378c46-0815-4abe-b2ac-9c755b0ca826.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/e2/ce23a4ca-02de-412c-aec1-29fd209bac73/6a99360695517.image.jpg",
    imgHiRes: true
  },
  {
    title: "Mavericks put up a fight; youth calendar",
    source: "Telluride Times",
    date: "September 3, 2026",
    firstSeen: "2026-09-03",
    newsTopic: "community",
    copy: "Local Mavericks teams have a busy stretch ahead — volleyball, football, and cross country all on the schedule through early September, with games both home and away. There's also a District Accountability Committee meeting Sept. 9 at 6 p.m. in Room 120.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_394c8678-8a5f-41ba-bf1b-fcf4118c8229.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/24/124dd52d-98c7-490c-bc67-cb7a195636ba/6a991ffa709ac.image.jpg",
    imgHiRes: true
  },
  {
    title: "Slow the flow",
    source: "Telluride Times",
    date: "September 3, 2026",
    firstSeen: "2026-09-03",
    newsTopic: "community",
    copy: "Hotter, drier summers and more intense flash floods are already the reality here, consistent with forecasts made decades ago. The suggestion: build rock check dams in local drainages to slow runoff, boost soil moisture, and reduce erosion — low-tech, high-value work. The Forest Service has tried similar approaches near Flagstaff with good results.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_96b6ebf9-cef3-4fb3-99ac-adcc59d79758.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/25/f2553362-600e-494e-aeff-c15f5ce6ebff/6a992e00bbfc2.image.jpg",
    imgHiRes: true
  },
  {
    title: "Same Schroomzillah, stronger for the journey ahead",
    source: "Telluride Times",
    date: "September 3, 2026",
    firstSeen: "2026-09-03",
    newsTopic: "education",
    copy: "Schroomzillah, Nucla's youth-created mushroom sculpture built in 2023 by students from four area schools, got a major overhaul after its wooden cap supports began to rot. Local artists Bob Hoehn and Sarah Lewiecki replaced the wood with metal and fiberglass while keeping the original student-built skeleton intact.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_995522b9-57e2-4819-a6cc-ba8a12513a15.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/a3/ea329c53-88dd-4499-a62e-ea8bf690ca7f/6a992261b6641.image.jpg",
    imgHiRes: true
  },
  {
    title: "John Steven Whetsell",
    source: "Telluride Times",
    date: "September 3, 2026",
    firstSeen: "2026-09-03",
    newsTopic: "community",
    copy: "John Steven Whetsell, a Telluride resident who co-founded Potomac Custom Builders with his wife Denise, passed away August 19, 2026, at age 74. He spent decades in banking and home building, and was known locally for his integrity, curiosity, and quiet generosity. He is survived by his wife, son Alexander of Telluride, and daughter Sarah of Austin.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/obituaries/article_6abe7f57-f780-4a3d-8234-3e1118580b56.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Wizard of ahhs",
    source: "Telluride Times",
    date: "September 2, 2026",
    firstSeen: "2026-09-02",
    newsTopic: "community",
    copy: "Deb Pera D'Angelo, a fifth-generation Telluride local, was appointed director of the Spa at the Peaks in January after three years on staff. Her family roots here go back to hardrock mining days, and her parents founded Timberline Hardware in 1969. The spa offers full fitness and wellness facilities, with locals-only discounts available in fall and spring.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/business/article_443da1a7-6b36-4452-8aec-2ae38803c952.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/9b/39b979aa-e5aa-4bfa-96b4-cc26b5bf0217/6a977d4ccd816.image.jpg",
    imgHiRes: true
  },
  {
    title: "What to know about the AP/FRONTLINE investigation into scam victims",
    source: "Telluride Times",
    date: "September 2, 2026",
    firstSeen: "2026-09-02",
    newsTopic: "government",
    copy: "U.S. scam losses hit a record $15.9 billion reported to the FTC last year — with estimated real losses near $200 billion. An AP/FRONTLINE investigation found victims have little recourse: banks rarely reimburse them, tax law can leave them owing the IRS, and U.S. consumer protections trail those in the UK, EU, and Australia.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_3757ef5c-d08d-57f0-9fd8-efb2b8fa2c49.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/a4/da4a0746-8139-55ed-b225-3edb81392787/6a98142ce1efb.image.jpg",
    imgHiRes: true
  },
  {
    title: "Energetic responsibilities",
    source: "Telluride Times",
    date: "September 2, 2026",
    firstSeen: "2026-09-02",
    newsTopic: "education",
    copy: "Karen O'Dell runs Ancient Arts Health and Wellness in Norwood, offering energy healing that draws on her background as a combat medic, EMT, hospice worker, and certified psychotherapist. She uses a device called Bio-Well to show clients visual maps of their energy patterns, alongside hands-on Healing Touch techniques. She also teaches energy awareness locally, including at Norwood School and community events.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_e9289e3f-50ef-4896-95d0-92c07610b6ba.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/da/2da5af3d-6fab-4bd6-8c41-617cada772df/6a9879164037e.image.jpg",
    imgHiRes: true
  },
  {
    title: "Scams in the US are at a record high. Yet most victims get no help and some end up losing even more",
    source: "Telluride Times",
    date: "September 2, 2026",
    firstSeen: "2026-09-02",
    newsTopic: "government",
    copy: "US scam losses hit a record $15.9 billion reported to the FTC last year — likely a fraction of the real total, estimated near $200 billion. Victims often face dismissal from banks, law enforcement, and even additional taxes on lost funds. Recovery is rare, and some lose even more chasing it.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_bf60538d-c978-520d-8adf-5fd4490f3f41.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/91/39174b17-dbe4-50d9-8b75-331a65f90676/6a9811dceac84.image.jpg",
    imgHiRes: true
  },
  {
    title: "PHOTO ESSAY: Inside a detention center where scam workers wait for their return home",
    source: "Telluride Times",
    date: "September 2, 2026",
    firstSeen: "2026-09-02",
    newsTopic: "community",
    copy: "Hundreds of workers caught up in large-scale cyberscam operations in the Philippines are being held at a seized six-story building in Pasay while they wait to be repatriated home — a process that can take months or years. Some were trafficked, others came voluntarily, and many describe beatings and being sold between operations. The facility once held over 900 people; around 70 remain.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_fd288a9b-e8a1-5542-8f62-6f16579cc761.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/db/3dbc6793-b30b-5e5c-9478-016b67c9f70f/6a98143d4c9c4.image.jpg",
    imgHiRes: true
  },
  {
    title: "The one that got away",
    source: "Telluride Times",
    date: "September 2, 2026",
    firstSeen: "2026-09-02",
    newsTopic: "arts-culture",
    copy: "The Telluride Bluegrass Festival's 50th anniversary film was pulled from a planned Film Festival premiere after undisclosed AI-generated animation was discovered in the footage — a problem given the film celebrates the world's top acoustic artists. Director Craig Ferguson hopes to reschedule the premiere at the Sheridan Opera House.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_36a7635f-d51e-438c-a8df-fc1ee5f21baf.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/71/771852d0-1ebe-4728-b85b-beb00e2cdbd5/6a93173fc54bc.image.jpg",
    imgHiRes: true
  },
  {
    title: "Court dismisses ‘deficient’ Telski lawsuit against Fee, Prohaska, Wisor",
    source: "Telluride Times",
    date: "September 2, 2026",
    firstSeen: "2026-09-02",
    newsTopic: "recreation",
    copy: "A Colorado district court dismissed Telski's lawsuit against three former local officials who had approached resort owner Chuck Horning last winter with a $127.5M purchase offer during the ski patrol strike. Judge Harvell found Telski failed to allege any actual improper regulatory action that caused its losses during the strike.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_92d9c402-8e98-4024-a175-c65ad71164a5.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/d3/0d3fe29a-2ad3-42ae-892f-65bb217ad88d/6a977391d4972.image.jpg",
    imgHiRes: true
  },
  {
    title: "Boys’ soccer bags third at two-day event",
    source: "Telluride Times",
    date: "September 1, 2026",
    firstSeen: "2026-09-01",
    newsTopic: "community",
    copy: "Telluride's boys soccer team went 2-1 at the Coal Ridge Invitational, taking a tough 7-1 loss to Roaring Fork before bouncing back with a 5-2 win over host Coal Ridge to finish third. Abi Clarke had a strong Saturday with a goal and three assists.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_491e0114-aefc-4fdc-b3c6-44079f32e3f0.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/a0/7a0ec9eb-c41a-463a-a711-ccebca7e9677/6a973e4e83f22.image.jpg",
    imgHiRes: true
  },
  {
    title: "Commentary from your independent candidate for sheriff, part two",
    source: "Telluride Times",
    date: "September 1, 2026",
    firstSeen: "2026-09-01",
    newsTopic: "public-safety",
    copy: "San Miguel County Sheriff — appointed from undersheriff in 2025 — is running as an independent in 2026 and outlines a year of operational changes: a 52.6% cut in overtime, updated technology, and new programs covering mental health response, festival safety, and wildfire water staging.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/editorials/article_ab498d10-080f-4de3-b2b8-f24762409a7e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/07/407f0759-8be0-4e14-84b3-19aa823ae488/6a9719ec16960.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "In the dark together",
    source: "Telluride Times",
    date: "September 1, 2026",
    firstSeen: "2026-09-01",
    newsTopic: "arts-culture",
    copy: "Watching a movie in a theater does something measurable to us — research shows viewers' brain activity, eye movements, even blinks can sync up during a film. It's called neurocinematics, and it's been studied for less than 20 years. In a time of growing isolation, the darkened theater remains one of the few places you can be alone and connected at the same time.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_ebd5291f-cd6c-4abb-810a-7f5ab004f512.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/56/05649855-aa1f-409e-815c-03bc012f79ee/6a9718c59853f.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Library hosts presentation of new book, 'American Archaeology'",
    source: "Telluride Times",
    date: "September 1, 2026",
    firstSeen: "2026-09-01",
    newsTopic: "community",
    copy: "R.E. Burillo presents his new book on American archaeology — covering the field's history, science, and growing threats from profit-driven practices — Thursday, Sept. 3 at 5:30 p.m. at Wilkinson Public Library. Burillo is a journalist and conservation archaeologist with deep ties to the Colorado Plateau and Bears Ears.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_47be00a2-4028-4b7c-9610-5629eb71c9c7.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/df/1dfded6d-068b-40e4-8c77-49d47573f69a/6a9717e36194f.image.jpg",
    imgHiRes: true
  },
  {
    title: "Before asking for more, examine what we have",
    source: "Telluride Times",
    date: "September 1, 2026",
    firstSeen: "2026-09-01",
    newsTopic: "education",
    copy: "Enrollment in the Telluride School District has been declining, but a local resident is questioning why taxes keep rising anyway. The letter asks the district to show it's adjusted staffing and operations before seeking another mill levy. The writer suggests combining classes and cutting overhead before going back to taxpayers.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_a15b52a7-3374-4030-bb16-04ad513eb0f1.html",
    img: "",
    letterAuthor: "Jolana Vanek",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "EDM good riddance",
    source: "Telluride Times",
    date: "September 1, 2026",
    firstSeen: "2026-09-01",
    newsTopic: "government",
    copy: "East end residents say the recent EDM festival rattled windows hard enough to knock pictures off walls, and complaints routed to the Marshal's office went nowhere. The letter writer argues Town Council prioritizes outside promoters over the people who actually live here year-round.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_78bd185a-00cc-4a58-9b18-83702d518863.html",
    img: "",
    letterAuthor: "Sincerely, Michael Tobin",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Traveling with pets",
    source: "Telluride Times",
    date: "September 1, 2026",
    firstSeen: "2026-09-01",
    newsTopic: "community",
    copy: "Thinking about bringing a pet on your end-of-summer trip takes more planning than most people expect. Pet-friendly lodging costs extra, planes are complicated, and animals don't always handle routine disruption well. Short prep trips, familiar items, and a vet consult can help if you do bring them along.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_ebc186b4-e6f6-4650-8e39-f4bceb40025a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/f5/7f50b2d9-58ae-486c-a260-51a42c705793/6a97035c58129.image.jpg",
    imgHiRes: true
  },
  {
    title: "Stayed for the schools",
    source: "Telluride Times",
    date: "September 1, 2026",
    firstSeen: "2026-09-01",
    newsTopic: "education",
    copy: "A Telluride parent shares how the district's Dual Immersion program paid off when their daughter spent two weeks in Cuzco, Peru, translating between doctors and patients at mobile clinics — and turned out to be one of the strongest Spanish speakers in her group. The family has considered leaving the area but says the schools keep them here.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/editorials/article_b0c872c7-4b6f-4344-a807-1aa66ee4c935.html",
    img: "",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Telluride Times collects 18 awards at annual press convention",
    source: "Telluride Times",
    date: "September 1, 2026",
    firstSeen: "2026-09-01",
    newsTopic: "community",
    copy: "The Telluride Times took home 18 awards at the Colorado Press Association's Better News Contest, double last year's total, spanning advertising, editorial, photography, and design. The advertising department claimed top honors for the third straight year. Seven editorial awards also came in from the Colorado Society of Professional Journalists earlier in 2025.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_72bcc7a0-cfc1-4271-896e-8f86daec9761.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/12/712a7b69-dd93-4818-a07b-d1387b156c0f/6a9687a81f7ea.image.jpg",
    imgHiRes: true
  },
  {
    title: "Colorado drone show comes to Telluride",
    source: "Telluride Times",
    date: "August 31, 2026",
    firstSeen: "2026-09-01",
    newsTopic: "recreation",
    copy: "Hundreds of drones will launch from the Newmont Mining site east of Town Park on Thursday, Sept. 3 around 9 p.m., right after the Planet Bluegrass concert. The roughly 15-minute show traces Colorado and Telluride history — ranching, mining, skiing. With fire bans limiting fireworks after another dry summer, drone shows are filling that role.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_b626e408-18cf-4390-b608-bdb1910562db.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/75/a75eb258-c40b-4f63-b993-ea3cba93ab49/6a964a41a28db.image.jpg",
    imgHiRes: true
  },
  {
    title: "Rich Hamilton says goodbye to San Miguel County after 17 years",
    source: "Telluride Times",
    date: "August 31, 2026",
    firstSeen: "2026-08-31",
    newsTopic: "recreation",
    copy: "Rich Hamilton is retiring from San Miguel County after 17 years as Park Supervisor — 34 years total serving the area if you count his time with the Town of Telluride. He oversaw seven trail builds, the development of Down Valley Park, and restoration of historic sites like Fort Peabody. A farewell gathering is set for Sept. 12 at Down Valley Park, 3–7 p.m.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_235e0e4e-aca1-4b7d-95ca-2401e36cf5d7.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/5f/e5f8576a-53a1-40e7-ab44-b569a49345d8/6a950a74f1cbd.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘Breaking the model because we’ve noticed it’s broken’",
    source: "Telluride Times",
    date: "August 30, 2026",
    firstSeen: "2026-08-30",
    newsTopic: "housing",
    copy: "Five of Pinion Park's 24 affordable homes in Norwood are sitting unsold despite the regional shortage — asking prices around $370,000 are out of reach for buyers at the 80% AMI income ceiling once current ~6% interest rates hit. The BOCC discussed allowing those units to sell to buyers up to 120% AMI, a threshold the state has now approved.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_7f4edf9a-a53f-4685-a5e0-a5ab8fd8e152.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/37/237058a9-59ee-4904-8189-85aa69c9fa71/6a930e035b19c.image.jpg",
    imgHiRes: true
  },
  {
    title: "Uplifting education",
    source: "Telluride Times",
    date: "August 30, 2026",
    firstSeen: "2026-08-30",
    newsTopic: "education",
    copy: "The Telluride Education Foundation, now in its 32nd year, is hiring its first paid executive director — a part-time role focused on fundraising and sustainability, with applications open through Sept. 18. TEF has donated over $1.3M to local schools and recently gave $100K two years running to support key departments amid state and federal budget cuts.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_ff48806a-d703-4bac-b490-8d5ae6f3a7fa.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/34/d34a5acc-f379-43b2-b40a-a09faff7cde0/6a930b6f60a4e.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘Gondola or not; that’s really the choice’",
    source: "Telluride Times",
    date: "August 29, 2026",
    firstSeen: "2026-08-29",
    newsTopic: "infrastructure",
    copy: "The gondola connecting Telluride and Mountain Village is nearing 30 years old, and SMART says replacement is a priority before the current operations agreement expires in 2027. Estimated cost is around $140 million — roughly $15 million secured so far — with federal funding of up to $70 million still uncertain. A six-month window is set to decide whether to pursue federal or local financing.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_a9483db0-5de5-41c6-9448-f6f3f52b2fe0.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/e0/ce03bea9-072f-455c-b0f4-36ace12253b5/6a91aee6634de.image.jpg",
    imgHiRes: true
  },
  {
    title: "Colorado River plan to cut water amid drought brings uncertainty for cities and farmers",
    source: "Telluride Times",
    date: "August 29, 2026",
    firstSeen: "2026-08-29",
    newsTopic: "community",
    copy: "Lake Mead and Lake Powell both hit record lows this month as the federal government moves to cut Colorado River water use by 1.25 million acre-feet annually across California, Nevada, and Arizona. Farmers are holding back on planting, some towns have capped growth, and Nevada has sued the Interior Department over cuts that could reach 70% of its allocation. Seven states, tribal nations, and Mexico are all sitting with real uncertainty about what comes next.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_af7a5bfc-1fea-5f8b-a8e7-1f6cea331407.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/97/e9723896-80c8-5e8b-81d8-b342b5b9ce5d/6a92ceb38172d.image.jpg",
    imgHiRes: true
  },
  {
    title: "Some US cities have begun rewarding careful drivers with fewer red lights",
    source: "Telluride Times",
    date: "August 29, 2026",
    firstSeen: "2026-08-29",
    newsTopic: "public-safety",
    copy: "Albuquerque and Portland have added speed sensors to traffic signals that reward drivers going the speed limit with an earlier green light — and leave speeders sitting at red. Albuquerque credits the system with a notable drop in crashes along two residential corridors. A few other cities have tried versions of the idea, though researchers say it's still early to call it a proven fix.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_d50dd2de-4a44-508f-b9f5-137929b9e68e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/4e/74e141f5-96d5-5c35-af25-eb05e6f3c359/6a92b290aa4ad.image.jpg",
    imgHiRes: true
  },
  {
    title: "BOCC discuss continuing qualification for housing",
    source: "Telluride Times",
    date: "August 29, 2026",
    firstSeen: "2026-08-29",
    newsTopic: "housing",
    copy: "San Miguel County commissioners and the housing authority are working to clarify how deed-restricted residents prove they still qualify — particularly self-employed people who struggle to document income and hours. A CPA affidavit was floated as one possible solution. The county plans to update its deed restriction covenant starting in 2027.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_43b9033c-1a6e-4c12-96f6-9378ea0238c6.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/e6/de6c7789-04cd-4256-b963-97c763e253cc/6a9137394a8fd.image.jpg",
    imgHiRes: true
  },
  {
    title: "New Bridal Veil Lodging is ‘intentionally boutique’",
    source: "Telluride Times",
    date: "August 28, 2026",
    firstSeen: "2026-08-29",
    newsTopic: "community",
    copy: "A new locally owned property management company, Bridal Veil Lodging, launched this year with five luxury properties — condos, homes, and ranches. The four-person team are all long-time Telluride residents who are positioning themselves as a boutique alternative to the regional and national companies that have absorbed several local firms in recent years. They're emphasizing personal relationships with homeowners over high-volume inventory management.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/business/article_8a077615-ebc6-43c5-b0ff-170e645ef11a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/bc/fbc0ec21-d9a5-48f6-81a7-e8a4606e43d4/6a8eb4a9aeb75.image.png",
    imgHiRes: true
  },
  {
    title: "Birding walk beckons; horror book club looms",
    source: "Telluride Times",
    date: "August 28, 2026",
    firstSeen: "2026-08-28",
    newsTopic: "arts-culture",
    copy: "Wilkinson Public Library kicks off September with a free birding walk along the River Trail Sept. 1, led by local bird rehabilitator Katie Triest. The month ahead is packed — Horror Book Club, a new Classics Taproom Society, language happy hours, music, games, workshops, and more. Check the library's website to preregister where required.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_600ab965-c54a-4dca-ae5a-8d2d7c79cbda.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/af/8afa1864-7d41-407a-81d4-ba946adb0eab/6a8ea434ce0a8.image.jpg",
    imgHiRes: true
  },
  {
    title: "A commentary from your independent candidate for sheriff",
    source: "Telluride Times",
    date: "August 26, 2026",
    firstSeen: "2026-08-27",
    newsTopic: "public-safety",
    copy: "San Miguel County's current sheriff is running for reelection this November as an independent, citing impartiality as the reason — keeping politics out of peacekeeping. He has 25-plus years in local law enforcement and has led major investigations across the region.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/editorials/article_e916d5e1-40a2-47f9-9153-8997130e0686.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/56/2560783f-f5bf-4e1a-a3e4-35ddb846dd5d/6a8f5479209d5.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Miner soccer looking super-stocked",
    source: "Telluride Times",
    date: "August 27, 2026",
    firstSeen: "2026-08-28",
    newsTopic: "education",
    copy: "The Telluride High boys soccer team heads into 2026 with nearly its entire roster intact — coach Ramon Rodriguez says the only starter lost to graduation was center-mid Spencer du Toit. Goalkeeper Maddox Slosberg and all four starting fullbacks return, along with senior leaders in the attack. The Miners went 13-4-0 last season before falling to eventual state champ Crested Butte in the Great Eight.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_08775cdb-e5ea-4af2-8a71-dfd7548e5464.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/5c/25c3ca45-e412-4c41-adf6-b6f819d71f00/6a8eaff26b086.image.jpg",
    imgHiRes: true
  },
  {
    title: "Colorado West Land Trust releases new restoration plan",
    source: "Telluride Times",
    date: "August 27, 2026",
    firstSeen: "2026-08-28",
    newsTopic: "health",
    copy: "Colorado West Land Trust has released its first Restoration Plan, a five-year framework covering six western Colorado counties focused on watershed health, wildlife habitat, and agricultural resilience. Alongside it, CWLT is restoring 115-plus acres of wetlands and riparian habitat along the North Fork of the Gunnison River in Delta County.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_d6ed84a7-ffc4-4946-814e-cdf92262d4d4.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/47/14731eb7-9b30-4179-b3ae-bdb29fa2dfdf/6a8f062dc54a5.image.jpg",
    imgHiRes: true
  },
  {
    title: "Local, hot lunch returns to Lone Cone Library",
    source: "Telluride Times",
    date: "August 27, 2026",
    firstSeen: "2026-08-27",
    newsTopic: "community",
    copy: "Fresh Food Hub's First Friday Family Hot Lunch resumes Sept. 3 at 11 a.m. at Lone Cone Library — locally sourced, made-from-scratch meals for kids and caregivers, continuing a four-year partnership. Lunches run first Fridays through December, funding permitting.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_35362685-e8fe-4525-93b5-1a985f0ac3c3.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/e7/4e7e55d0-2294-475e-aa35-b7ae6721a1da/6a8f04dd95dc9.image.jpg",
    imgHiRes: true
  },
  {
    title: "CHALKBOARD Week of Aug. 27 - Sept. 2",
    source: "Telluride Times",
    date: "August 27, 2026",
    firstSeen: "2026-08-27",
    newsTopic: "arts-culture",
    copy: "Norwood-area weekly community roundup for Aug. 27–Sept. 2 includes a free Chamber Music concert at The Livery on Aug. 27, the weekly Farmers Market Thursdays in Pocket Park, and regular meetings for town, school, and county boards. Food pantry runs Sundays 3–6 p.m.; senior meals Mondays and Thursdays at noon.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_f9bcbb79-510c-4a39-9d02-8d2b36c23f2f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/8f/08f554d5-f14a-4938-9b6b-a1f797203c42/6a8f077b9a196.image.jpg",
    imgHiRes: true
  },
  {
    title: "Camp Alderwild cranks up EDM festival for final year",
    source: "Telluride Times",
    date: "August 27, 2026",
    firstSeen: "2026-08-27",
    newsTopic: "arts-culture",
    copy: "Camp Alderwild returns to Telluride Aug. 28–29 for its second and final year, with roughly twice the programming of last summer's inaugural run. Of The Trees headlines alongside Daily Bread, with additional acts and after-hours shows at venues across town and Mountain Village. Planet Bluegrass has confirmed no VIP tier is coming to Telluride Bluegrass.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_80f4db90-1e7d-4019-87af-12508a0b99ac.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/33/4334355b-647e-4a05-9d57-d26310f1d1b3/6a8cca13b2a03.image.jpg",
    imgHiRes: true
  },
  {
    title: "Legals and Public Notices for August 27-September 2, 2026",
    source: "Telluride Times",
    date: "August 27, 2026",
    firstSeen: "2026-08-27",
    newsTopic: "community",
    copy: "San Miguel County is holding a public hearing Sept. 16 to consider adopting the 2024 International Building Code and Colorado Low Energy & Carbon Code — written comments due Sept. 10. The county is also taking contractor proposals for a fuel island canopy in Norwood (due Sept. 3) and jail repainting in Ilium (due Sept. 18).",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/legals/article_8614d722-2a45-49a3-805d-0d517e7701cb.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "A look at major lawsuits against Meta and other social media companies over harms to kids",
    source: "Telluride Times",
    date: "August 26, 2026",
    firstSeen: "2026-08-27",
    newsTopic: "education",
    copy: "Meta settled with dozens of states for up to $18 billion over claims its platforms deliberately hooked kids, cutting short a federal trial in Oakland. Separate cases in New Mexico resulted in over $940 million in penalties, while hundreds of school districts have also sued. TikTok, Snapchat, and YouTube face similar litigation.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_f4ee265f-c3a7-58cd-a793-1d7ef630c91f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/fd/cfd9de3b-54fb-545b-bbce-844d85bdaeaa/6a8f5c9789e48.image.jpg",
    imgHiRes: true
  },
  {
    title: "TAB's summer soiree sparkled",
    source: "Telluride Times",
    date: "August 26, 2026",
    firstSeen: "2026-08-27",
    newsTopic: "community",
    copy: "The Telluride AIDS Benefit held its summer soiree August 15 at a private Aldasoro home, drawing 100 guests and 20 models for a Studio 54-themed evening of fashion, food, and dancing against a Wilson Peak backdrop. Local boutiques Two Skirts, Atelier, and Fox and Stag were featured, with an epidemiologist from Emory University speaking on ongoing AIDS and HIV challenges.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/gallery/featured/article_463441b1-6e3b-4e4b-a9db-7c7d1c5a3be2.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/42/f4206132-4921-4b0f-887e-27ab768b68ca/6a8f5d0adae14.image.jpg",
    imgHiRes: true
  },
  {
    title: "True North kids take to the river",
    source: "Telluride Times",
    date: "August 26, 2026",
    firstSeen: "2026-08-27",
    newsTopic: "education",
    copy: "Nine students from Telluride, Norwood, and Nucla floated the San Juan River from Bluff to Mexican Hat this summer through True North's annual river trip, supported by Deer Hill Expeditions. They learned water-reading, boat control, and wilderness skills while camping along the route each night.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/gallery/featured/article_55653dfe-d23d-4dbf-bddd-5ead39f35fbf.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/d6/7d627f99-6454-46f9-a71a-f2fc451fa3e3/6a8f5af3c984c.image.jpg",
    imgHiRes: true
  },
  {
    title: "Breaking news: Plane crashes southwest of Telluride",
    source: "Telluride Times",
    date: "September 4, 2026",
    firstSeen: "2026-09-04",
    newsTopic: "public-safety",
    copy: "A single-engine plane crashed near Dolores Peak, about 15 miles southwest of Telluride, Thursday afternoon. Smoke was reported around 3:22 p.m., and Denver Air Traffic Control flagged a missing plane shortly after. As of Thursday night, no word yet on who was aboard or any survivors.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_f0d53ee9-c764-4db8-8c16-bb49ef3dac2e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/f2/5f281e8b-deac-492e-a466-888a413732d8/6a9a0ea1414e0.image.jpg",
    imgHiRes: true
  },
  {
    title: "Talon-ted THS golfer lands eagle",
    source: "Telluride Times",
    date: "August 26, 2026",
    firstSeen: "2026-08-27",
    newsTopic: "community",
    copy: "The THS golf team opened strong this season, tying for first at the Bruin Invitational in Cedaredge and placing sixth at Cobble Creek in Montrose. Banks O'Brien took individual first at both events and made an eagle on the par-4 first hole at Cobble Creek. The squad is adjusting after losing several players from last year's State team but has new freshmen and seniors stepping up.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_6d342fec-bcb0-4e80-aa9e-d56c32c53df3.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/2c/42cceb7a-aa93-459e-b816-b28b8bc08028/6a8f58f81e2fb.image.jpg",
    imgHiRes: true
  },
  {
    title: "Thank you, Telluride Foundation",
    source: "Telluride Times",
    date: "August 26, 2026",
    firstSeen: "2026-08-27",
    newsTopic: "education",
    copy: "A CU Boulder finance student wrapped up a summer internship with the Telluride Foundation, thanking the team for the mentorship and hands-on experience with community investment and financial stewardship.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_8073990e-7d60-4202-ab47-5cc848f134fb.html",
    img: "",
    letterAuthor: "Joe Galbo",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Declawing a cat is inhumane",
    source: "Telluride Times",
    date: "August 26, 2026",
    firstSeen: "2026-08-27",
    newsTopic: "community",
    copy: "Declawing removes the last bone joint of a cat's toes — not just the nail — and can cause chronic pain, arthritis, and behavioral changes. Most developed countries ban it; in the U.S., only five states and Denver have done the same. Second Chance Humane Society in Ridgway prohibits it on any animal they adopt out.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_8ffdebd3-5b4e-484d-bdb9-d68701a508bf.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/cc/ccc0cba1-b13e-49e2-84e7-5c0d650c8402/6a8f5695d40ad.image.jpg",
    imgHiRes: true
  },
  {
    title: "Be bear aware",
    source: "Telluride Times",
    date: "August 26, 2026",
    firstSeen: "2026-08-27",
    newsTopic: "community",
    copy: "Drought is pushing bears to work harder for food this year, and a few have been put down after getting into homes. A local resident is reminding neighbors that we moved into bear country — not the other way around. Lock your doors, secure your food, and don't make it easy for them.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_b3877f87-d6ee-4b22-a06c-5dbcdac89b36.html",
    img: "",
    letterAuthor: "Tricia Porter",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Ophir Pass Road closed weekdays for mine cleanup",
    source: "Telluride Times",
    date: "August 26, 2026",
    firstSeen: "2026-08-27",
    newsTopic: "infrastructure",
    copy: "Ophir Pass Road is closed weekdays 8am–5pm through Sept. 11 while crews haul materials and build a retaining wall at the old New Dominion Mine site. The road stays open evenings and all weekend. Cleanup is Forest Service-led.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_7f7308cb-d9a2-4013-b565-4e7ed09e10f7.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/bd/ebd58e5e-39d7-44ec-8aee-2786c56bd82b/6a8f559017a6e.image.jpg",
    imgHiRes: true
  },
  {
    title: "Patrick Latcham is TMVOA’s new president and CEO",
    source: "Telluride Times",
    date: "August 26, 2026",
    firstSeen: "2026-08-27",
    newsTopic: "government",
    copy: "Patrick Latcham, a 15-year area resident who started as a ski instructor and rose to VP at Telski, has been named TMVOA's permanent president and CEO following months as interim leader. The TMVOA board made it official in July after an executive search concluded the right person was already in the building.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/business/article_6af04f7e-cb09-4255-a59d-0333c3b3d7fb.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/38/43861e22-eb3d-40e6-9121-19243d82345f/6a8dedf3511bd.image.jpg",
    imgHiRes: true
  },
  {
    title: "Mountains, moving",
    source: "Telluride Times",
    date: "August 26, 2026",
    firstSeen: "2026-08-27",
    newsTopic: "infrastructure",
    copy: "The San Juans are geologically young — only about 30 million years old — and these steep, active mountains crumble and shift. Recent mudslides have closed canyon roads, affected travel toward Dolores and Norwood, and sent mud and water into the Telluride Middle/High School building. Drought-hardened, hydrophobic soils are making this season's storm runoff especially destructive.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_51076234-a41d-4c54-84f7-ab99385a98bb.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/90/9900745b-0ffc-4995-82f6-79465798e64f/6a8f53c6b9246.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Reverse strategy",
    source: "Telluride Times",
    date: "August 26, 2026",
    firstSeen: "2026-08-27",
    newsTopic: "recreation",
    copy: "A local reflects on flipping the daily routine — riding a favorite 40-year mountain bike route *before* work instead of after, when energy is gone. The climb is steep and honest, the descent a reward. Simple shift, different day.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_77f02f53-2ad5-4077-a8de-1c0f9f7dd737.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/ff/bff67935-2de1-4000-a11c-e06dec4eb56d/6a8f53156d821.image.jpg",
    isLetter: true,
    imgHiRes: true
  },
  {
    title: "Highway 141 open north of Slick Rock after sinkhole",
    source: "Telluride Times",
    date: "August 26, 2026",
    firstSeen: "2026-08-26",
    newsTopic: "infrastructure",
    copy: "Highway 141 between Slick Rock and Naturita reopened Aug. 20 after a sinkhole—about 12 inches across with a larger cavity underneath—was found and excavated. A temporary steel plate remains at Mile Point 24 until paving is finished. Slow down through there.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_2884079b-9979-4083-80df-1e9e89b29729.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/8d/88da3008-2e95-4080-ace7-bc89d85e9770/6a8f06cc9978b.image.jpg",
    imgHiRes: true
  },
  {
    title: "Setting the pace in Colorado Springs",
    source: "Telluride Times",
    date: "August 26, 2026",
    firstSeen: "2026-08-26",
    newsTopic: "community",
    copy: "THS junior Liv Speck ran a 22:04 at the Cheyenne Mountain Stampede pre-state 5K, finishing 19th among 2A/3A competition. The Telluride girls placed 11th as a team; the boys fielded only three runners. The volleyball team opened 1-2 after falling to Hayden and Rangely while beating Dove Creek.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_131ac11f-35f2-4b61-ac7b-495fbb841f92.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/b9/4b92604b-402c-41ae-b5f7-63aa61397b31/6a8e1a91ddc52.image.jpg",
    imgHiRes: true
  },
  {
    title: "Sentencing set for polygamous leader convicted of abuse in Arizona after girls discovered in trailer",
    source: "Telluride Times",
    date: "August 25, 2026",
    firstSeen: "2026-08-25",
    newsTopic: "community",
    copy: "Samuel Bateman, already serving 50 years federally for child sex crimes, faces sentencing Tuesday on three Arizona child abuse counts after three girls aged 11–14 were found in an unventilated trailer during a 2022 Flagstaff traffic stop. Each count carries 4–8 years. Bateman led a splinter group tied to Warren Jeffs' polygamous sect.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_dd2970b9-da44-5d42-af4a-263f98c8783a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/9e/f9eec24e-6e80-5775-a648-310fd59563f9/6a8d85eccdd66.image.jpg",
    imgHiRes: true
  },
  {
    title: "Movie Review: A tender love story with postapocalyptic teeth in Ridley Scott’s 'The Dog Stars'",
    source: "Telluride Times",
    date: "August 26, 2026",
    firstSeen: "2026-08-26",
    newsTopic: "community",
    copy: "Ridley Scott's *The Dog Stars* adapts Peter Heller's novel about a pilot and his Malinois surviving a post-pandemic Colorado, set largely around an abandoned Erie airport. Jacob Elordi and Margaret Qualley anchor a quiet love story amid the survival backdrop. It runs 118 minutes, opens Friday, rated R — two and a half stars out of four.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_e883c85f-8c7d-5181-9ad9-14f5d0460f2b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/c4/ec4cc373-ba88-5b62-a551-c0b590ba0bc2/6a8e37f1b6bff.image.jpg",
    imgHiRes: true
  },
  {
    title: "Polygamous sect leader sentenced to 24 additional years in prison for hauling girls in unventilated trailer in Arizona",
    source: "Telluride Times",
    date: "August 25, 2026",
    firstSeen: "2026-08-26",
    newsTopic: "community",
    copy: "Warren Jeffs, already serving life plus 20 years for child sexual assault, got 24 more years after being convicted of transporting underage girls in an unventilated trailer in Arizona. He leads the FLDS Church.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_a9e3b803-95fd-553c-91a8-79e8cc4fb741.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Instagram chief takes the stand in a trial pitting Meta against states over social media harms",
    source: "Telluride Times",
    date: "August 25, 2026",
    firstSeen: "2026-08-26",
    newsTopic: "health",
    copy: "Four states are suing Meta in federal court in Oakland, claiming Instagram was deliberately designed to addict kids and worsen youth mental health. Instagram's head Adam Mosseri defended the platform's safety efforts, while a former employee testified the well-being team existed mainly to shield the company from lawsuits.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_34daf968-d047-5e06-b2e2-78a1a71cfcc2.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/de/4de6439d-5323-5d56-abc5-8635e6868afc/6a8e1c003514b.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘We all love seasonal workers’",
    source: "Telluride Times",
    date: "August 25, 2026",
    firstSeen: "2026-08-25",
    newsTopic: "community",
    copy: "A faith-based nonprofit called Beacon Telluride launched last fall to support seasonal workers — lift ops, servers, baristas — who face high costs and limited social options after long shifts. Programs include free meals, game nights, and an \"Adopt-a-Liftie\" program placing workers in local homes for dinner. Telski's lift operations manager says he's already telling job candidates about it.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_4f54b626-c38c-45eb-b7ef-105406305eeb.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/c7/2c7d8e61-c635-4c53-bd92-91965f17702e/6a8ccffbc4260.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride Town Council OKs flood hazard remapping",
    source: "Telluride Times",
    date: "August 25, 2026",
    firstSeen: "2026-08-25",
    newsTopic: "government",
    copy: "Telluride's flood hazard map hasn't been updated since 1992, and Town Council unanimously directed staff to move forward on remapping it. The process is expected to take about two years and cost $225,000–$275,000. Some properties currently outside flood zones could end up inside them once the new map is done.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_7f5ed85c-f89d-4605-a632-00bb9593f3aa.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/10/91017025-43d4-455a-9565-9f6b7ee7ff57/6a8cd98e8710e.image.png",
    imgHiRes: true
  },
  {
    title: "Locals concerned as Trump admin fast-tracks public process for Wyoming rare earth mine",
    source: "Telluride Times",
    date: "August 24, 2026",
    firstSeen: "2026-08-25",
    newsTopic: "government",
    copy: "A Colorado company plans an open-pit rare earth mine in Wyoming's Black Hills National Forest, with the Forest Service offering just a 30-day public comment window — the only federal input opportunity. Locals near Sundance say the fast-tracked process caught them off guard. County commissioners support the project but say they have questions too.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_b515d996-e427-51d1-b533-5489e5d2e60a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "‘Fear took over’",
    source: "Telluride Times",
    date: "August 24, 2026",
    firstSeen: "2026-08-24",
    newsTopic: "government",
    copy: "Advocates from the Workers' School presented Mountain Village Town Council with a proposed workers' rights ordinance at the Aug. 20 meeting, backed by a 142-page packet on wage theft, labor trafficking, and worker misclassification. Testimony included a domestic worker's account of a work-related miscarriage and a story of a commuter worker who died from overwork. The ordinance calls for anonymous reporting, retaliation protections, and enforcement tied to business licensing.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_6cc11ae2-c3ba-457f-a8b8-38feb97aae16.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/c9/dc97a2da-4298-41fb-a16a-2d7aeda9f7d7/6a88bf233be2e.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘El miedo se apoderó de nosotros’",
    source: "Telluride Times",
    date: "August 24, 2026",
    firstSeen: "2026-08-24",
    newsTopic: "government",
    copy: "Advocates from the Escuela de Trabajadores — a collaboration between Thrive Community Health Network and Raíces Sin Fronteras — appeared before Mountain Village Town Council on August 20th to request a municipal labor rights protection ordinance. They brought a 142-page packet documenting wage theft, worker exploitation, unsafe conditions, and housing instability, along with personal testimonies including a Colombian attorney's account of a work-related miscarriage and a worker who died after repeated 14–15-hour days commuting from Montrose. The council has not yet acted on the proposal.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_912fb87f-47a2-4b5d-955d-29e93b886b28.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/a7/6a7eb7c6-a329-475f-9fd8-8d59f26124ea/6a8caf0264c0a.image.jpg",
    imgHiRes: true
  },
  {
    title: "Collaborating on climate action",
    source: "Telluride Times",
    date: "August 23, 2026",
    firstSeen: "2026-08-23",
    newsTopic: "community",
    copy: "EcoAction Partners, the Telluride Foundation, and Telluride Science are hosting a free public event on Sept. 2, 6–7 p.m. at the Telluride Innovation Center, featuring Mountain Towns 2030, a nonprofit network focused on practical climate action for mountain communities. The evening includes a panel with leaders from Breckenridge, Ridgway, and MT2030.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_407d6ab9-8150-4eb9-8259-1b2b83bcf1a9.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/0a/10a2c19f-c364-4cbf-b414-6be0f2c4584e/6a89daf284ad8.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride Fire plans station expansion in Placerville",
    source: "Telluride Times",
    date: "August 23, 2026",
    firstSeen: "2026-08-23",
    newsTopic: "government",
    copy: "Telluride Fire Protection District is expanding Station 3 in Placerville with a new apparatus bay, updated crew quarters, and the district's first training tower — funded through the operating budget plus a $575,000 state grant, no new taxes. The three-story live-burn facility must be operational by August 2027. Station remodel is estimated at $7 million and still in permitting.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_37484dae-0d32-43f3-a9c8-8910191c83c1.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/f4/2f44c84d-2a71-4ba5-9820-a208e47ce0ad/6a8b318f45bd1.image.jpg",
    imgHiRes: true
  },
  {
    title: "Fashion with a conscience",
    source: "Telluride Times",
    date: "August 23, 2026",
    firstSeen: "2026-08-23",
    newsTopic: "education",
    copy: "EcoAction Partners is hosting its first \"Full-Circle Fashion Fundraiser\" — a sip-and-shop clothing sale — August 29–30 at the Ah Haa School Sky Deck. Gently used clothing can be donated at several drop-off locations through Aug. 29, or consigned at the EcoAction office Aug. 24–28. Proceeds support the local climate action nonprofit.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_c767cb0d-80b0-4d2e-ad9c-1816456891e3.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Updated: Museum events bring history to life",
    source: "Telluride Times",
    date: "August 22, 2026",
    firstSeen: "2026-08-29",
    newsTopic: "arts-culture",
    copy: "The Telluride Historical Museum has two signature summer events coming up: An Evening with Ken Burns on Aug. 30 at the Palm Theatre, screening episode five of *The Vietnam War*, and the Telluride Dinner Party on Sept. 10 at the museum itself. This year's dinner is notable — people born in the building when it was a hospital will be there mingling with guests. The museum is also marking its 60th anniversary.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_6aaa2989-5168-4f5c-813a-d3eaf0ed3ca0.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/2a/a2a66974-708c-4ae8-93f0-c3129561bfee/6a7b882ed21ef.image.jpg",
    imgHiRes: true
  },
  {
    title: "Inside Trump's remake of the White House Rose Garden. First a stone patio, then statues",
    source: "Telluride Times",
    date: "August 22, 2026",
    firstSeen: "2026-08-22",
    newsTopic: "community",
    copy: "The White House Rose Garden has been reworked — lawn replaced with white stone patio, now featuring bronze statues of Washington, Hamilton, Franklin, Jefferson, and a Revolutionary War piece. The Jefferson sculpture came from Loveland, CO sculptor George Lundeen, gifted ahead of the nation's 250th.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_b939f5aa-5091-5a89-9ce0-179dbddeb3d8.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/f0/ff06f8bc-5244-5f68-8c06-4403371344a2/6a899165603b6.image.jpg",
    imgHiRes: true
  },
  {
    title: "A promise made — and kept",
    source: "Telluride Times",
    date: "August 22, 2026",
    firstSeen: "2026-08-22",
    newsTopic: "education",
    copy: "What started as one scholarship pledge in 2016 has grown into more than 50 SPARKy Latina Scholarships for students across Telluride, Norwood, Nucla, and Naturita. The all-volunteer program also runs a monthly club offering tutoring, college application help, and career workshops. Most recipients are first-generation college students.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_5070c140-1469-4aed-83b9-ef98089bd22f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/36/93639c91-ce6e-42d6-a201-074c175c4417/6a8805e0da70a.image.jpg",
    imgHiRes: true
  },
  {
    title: "Federal officials announce water cuts as Colorado River supplies continue to plunge",
    source: "Telluride Times",
    date: "August 22, 2026",
    firstSeen: "2026-08-22",
    newsTopic: "community",
    copy: "Federal officials announced Colorado River water cuts of 1.25 million acre-feet annually for California, Nevada, and Arizona through 2028, with Arizona absorbing the largest share. Upstream states including Colorado face no cuts for now. Lake Mead and Lake Powell have both hit historic lows, and the current rules governing river use expire in October with no long-term agreement yet in place.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_fe86e7b5-5fb5-52f4-85c1-d8ef2ec9b189.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
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
    title: "Town of Telluride Downgrades to Stage 1 Fire Restrictions",
    source: "Town of Telluride",
    date: "August 26, 2026",
    newsTopic: "public-safety",
    copy: "(August 25, 2026) – Following improved fire conditions across the region, Town Manager Zoe Dohnal has downgraded fire restrictions within the Town of Telluride from Stage 2 to Stage 1, effective 12:01 a.m. MT on Wednesday, August 26, 2026.",
    href: "https://www.telluride.gov/CivicAlerts.aspx?aid=403",
    img: ""
  },
  {
    title: "Marya Stark and Charles Dalton Sworn In to Telluride Town Council",
    source: "Town of Telluride",
    date: "August 12, 2026",
    newsTopic: "government",
    copy: "(July 21, 2026) – The Town welcomed two new members to Town Council this morning as Charles Dalton and Marya Stark were sworn into office at 9:30 a.m. Town Clerk Tiffany Kavanaugh administered the oath of office for both officials.",
    href: "https://www.telluride.gov/CivicAlerts.aspx?aid=402",
    img: ""
  },
  {
    title: "Arrest Made in String of Telluride Mountain Bike Thefts",
    source: "Town of Telluride",
    date: "August 12, 2026",
    newsTopic: "recreation",
    copy: "(August 11, 2026) – The Telluride Marshal's Department has identified and arrested a suspect in a series of mountain bike thefts that account for more than $22,000 in reported losses.",
    href: "https://www.telluride.gov/CivicAlerts.aspx?aid=401",
    img: "https://www.telluride.gov/ImageRepository/Document?documentID=15642"
  },
  {
    title: "State of the Town Address: The State of the Town Is Strong and Engaging",
    source: "Town of Telluride",
    date: "August 8, 2026",
    newsTopic: "government",
    copy: "The Mayor's biannual State of the Town Address was delivered on Tuesday, July 21 during the regular meeting of Telluride Town Council, here's what Mayor Teddy Errico had to say.",
    href: "https://www.telluride.gov/CivicAlerts.aspx?aid=400",
    img: "https://www.telluride.gov/ImageRepository/Document?documentID=15641"
  },
  {
    title: "Please Take the Advanced Web Map Survey",
    source: "San Miguel County",
    date: "September 3, 2026",
    newsTopic: "community",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1408",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14763"
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
    title: "CDOT Performing Ditch Cleaning 8/31 - 9/3",
    source: "San Miguel County",
    date: "August 28, 2026",
    newsTopic: "arts-culture",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1406",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14744"
  },
  {
    title: "Waste Tire Collection Event",
    source: "San Miguel County",
    date: "August 24, 2026",
    newsTopic: "community",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1404",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14705"
  },
  {
    title: "Imogene and Black Bear Passes Closed 9/12",
    source: "San Miguel County",
    date: "September 3, 2026",
    newsTopic: "infrastructure",
    copy: "Imogene Pass/Tomboy Road will be closed 12:01 a.m. - 3:00 p.m. on Saturday, September 12th, to accommodate the Imogene Pass Run. Black Bear Pass/Bridal Veil Road and the Valley View parking area will be closed 7:00 a.m. - 12:00 p.m. on that day, too.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=542",
    img: ""
  },
  {
    title: "Stage 1 Fire Restrictions In Effect",
    source: "Town of Telluride",
    date: "August 26, 2026",
    newsTopic: "public-safety",
    copy: "In response to heightened fire danger across the region, Town Manager Zoe Dohnal has implemented Stage 1 Fire Restrictions within the Town of Telluride, effective 12:01 a.m. MT on Wednesday, August 25, 2026.",
    href: "https://www.telluride.gov/AlertCenter.aspx?AID=65",
    img: ""
  },
  {
    title: "What to do in Colorado this week: Free music and fresh murals on East Colfax in Aurora",
    source: "Colorado Sun",
    date: "September 3, 2026",
    firstSeen: "2026-09-03",
    newsTopic: "arts-culture",
    copy: "Plus: the Telluride Film Festival, a Labor Day weekend car show and last call for the Colorado State Fair",
    claudeSummary: false,
    href: "https://coloradosun.com/2026/09/03/whats-happening-colorado-state-fair-mural-festival/",
    img: "https://i0.wp.com/newspack-coloradosun.s3.amazonaws.com/wp-content/uploads/2024/09/Colfax-Canvas-supplies-credit_-Alek-Seballes-scaled.jpg?fit=1024%2C576&amp;ssl=1"
  },
  {
    title: "Ridgway Rescinds Stage 2 Fire Restrictions, Reinstates Stage 1 Fire Restrictions effective 12:01am on Thursday, Sept. 3rd - Sept. 2, 2026",
    source: "Town of Ridgway",
    date: "September 4, 2026",
    firstSeen: "2026-09-02",
    newsTopic: "public-safety",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Rescind-Stage-2%2C-Reinstate-Stage-1-Fire-Restrictions-Press-Release-2026-09-02.pdf",
    img: ""
  },
  {
    title: "Public Hearing Notice Wed., Sept. 16, 2026 at 5:30pm - 1) Site Plan and Conditional Use Permit for Riverbend Townhomes (TBD Liddell Dr.); 2) Plat Amendment of Lot 4 and Outlot of Riverview Business Park Subdivision (TBD Liddell Dr.); 3) PUD Amendment Lena Street Commons Planned Unit Development (TBD N. Lena Street) - Sept. 2, 2026",
    source: "Town of Ridgway",
    date: "September 4, 2026",
    firstSeen: "2026-09-02",
    newsTopic: "land-use",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2026.09.16_public-hearing-notice.pdf",
    img: ""
  },
  {
    title: "Ridgway Sustainability Advisory Board Meeting Agenda",
    source: "Town of Ridgway",
    date: "September 3, 2026",
    firstSeen: "2026-08-29",
    newsTopic: "government",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/SAB-Meeting-Packet---September-3%2C-2026.pdf",
    img: ""
  }
];

const KOTO_NEWSCASTS = [
  {
    title: "Newscast 9-3-26",
    source: "KOTO Community Radio",
    date: "September 4, 2026",
    newsTopic: "community",
    copy: "Welcome Back, Eliza Dunn; West End Roundup with the San Miguel Basin Forum; Telluride Library Opens New Youth Area",
    href: "https://koto.org/news/newscast-9-3-26/"
  },
  {
    title: "Newscast 9-2-26",
    source: "KOTO Community Radio",
    date: "September 3, 2026",
    newsTopic: "housing",
    copy: "Telluride Looks for Outside Assessment on Rental Housing Policies; Exploring the Living History, Stolen Pasts, and Future of American Archaeology; UnBOCES Supports Students in Educational Journey",
    href: "https://koto.org/news/newscast-9-2-26/"
  },
  {
    title: "Newscast 8-31-26",
    source: "KOTO Community Radio",
    date: "September 1, 2026",
    newsTopic: "community",
    copy: "Coming Up Next, Telluride; Telluride’s Alderwild Swan Song",
    href: "https://koto.org/news/newscast-8-31-26/"
  },
  {
    title: "Newscast 8-28-26",
    source: "KOTO Community Radio",
    date: "August 29, 2026",
    newsTopic: "community",
    copy: "On this week’s Regional Roundup, we look at the latest efforts to open Bears Ears National Monument to mining and we'll hear about a public awareness campaign in Colorado aimed at helping people stay bear aware. We’ll also hear about a Western Colorado nonprofit building community by encouraging women and girls to exercise, and learn how the Ute Mo",
    href: "https://koto.org/news/newscast-8-28-26/"
  },
  {
    title: "Newscast 8-27-26",
    source: "KOTO Community Radio",
    date: "August 28, 2026",
    newsTopic: "community",
    copy: "West End Roundup with the San Miguel Basin Forum; Cat Movie Fisher with Risho Unda; Remembering Dolly Parton",
    href: "https://koto.org/news/newscast-8-27-26/"
  },
  {
    title: "Newscast 8-26-26",
    source: "KOTO Community Radio",
    date: "August 27, 2026",
    newsTopic: "public-safety",
    copy: "San Miguel County Shifts to Stage 1 Fire Restrictions; Community Advocates for Worker Protections; Gaiascope Lights Up Mountain Village",
    href: "https://koto.org/news/newscast-8-26-26/"
  },
  {
    title: "Newscast 8-24-26",
    source: "KOTO Community Radio",
    date: "August 25, 2026",
    newsTopic: "community",
    copy: "Region Considers Chamber of Commerce; Governments Talk Childcare",
    href: "https://koto.org/news/newscast-8-24-26/"
  },
  {
    title: "Newscast 8-21-26",
    source: "KOTO Community Radio",
    date: "August 22, 2026",
    newsTopic: "recreation",
    copy: "On this week’s Regional Roundup, we head to the alpine tundra of Rocky Mountain National Park with naturalists searching for ptarmigan. We also learn about efforts to restore beaver habitat in other parts of the park. Then, we travel to the small Western Colorado town of Lake City, where three newly trained EMTs are stepping up to help provide medi",
    href: "https://koto.org/news/newscast-8-21-26/"
  }
];

const KOTO_FEATURED_STORIES = [

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
  },
  {
    title: "What species are the native fish exactly?",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "August 25, 2026",
    firstSeen: "2026-08-25",
    dateSource: "article",
    newsTopic: "community",
    copy: "Three native fish — Bluehead Sucker, Flannelmouth Sucker, and Roundtail Chub — are the focus of conservation efforts in the San Miguel and Dolores rivers. All three are Colorado Tier 1 species, have lost more than half their historic range, and are covered by a multiagency agreement. Colorado Pikeminnow and Razorback Sucker are also present but extremely rare, with low flows cited as the primary threat.",
    claudeSummary: true,
    href: "https://www.sanmiguelbasinforum.com/stories/untitled,127312",
    img: ""
  },
  {
    title: "Bockrath resigns as chief, confesses errors",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "August 23, 2026",
    firstSeen: "2026-08-23",
    dateSource: "article",
    newsTopic: "public-safety",
    copy: "Norwood Fire and EMS Chief John Bockrath is stepping down Sept. 30 after admitting he repeatedly bent SOPs — administering narcotics and other treatments without required transports or call-ins, citing the disconnect between Denver Metro protocols and rural realities. Authorities ruled the violations procedural, not criminal. The district's future leadership remains unsettled.",
    claudeSummary: true,
    href: "https://www.sanmiguelbasinforum.com/stories/bockrath-resigns-as-chief-confesses-errors,127202",
    img: "https://zeta.creativecirclecdn.com/smb/original/20260824-154413-efb-att.xeahuViXb-eb7tNtZoEzB5n87D_s2drnOQxiyw41AvA.JPG"
  },
  {
    title: "Bray talks drought, hay; calls for better relationships in navigating tough issues",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "August 19, 2026",
    firstSeen: "2026-08-19",
    dateSource: "article",
    newsTopic: "community",
    copy: "Zandon Bray of Bray Ranches says the drought is the worst he's seen — their longtime hayfields of grass and alfalfa are essentially gone, and they may haul hay from 700 miles away this winter. High cattle prices help, but that money goes straight to feed costs. He says working across differences matters more than politics when everyone's facing the same dry reality.",
    claudeSummary: true,
    href: "https://www.sanmiguelbasinforum.com/stories/bray-talks-drought-hay-calls-for-better-relationships-in-navigating-tough-issues,126716",
    img: ""
  },
  {
    title: "Van Winkle talks fire, drought and wolves",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "August 12, 2026",
    firstSeen: "2026-08-12",
    dateSource: "article",
    newsTopic: "public-safety",
    copy: "Janie VanWinkle of VanWinkle Ranch is still piecing things together after last year's Turner Gulch Fire burned 60% of their grazing permit, dropping their Uncompahgre Plateau herd from roughly 600 head to about 25% of that. They're hauling hay for winter and watching a wolf circling near Grand Mesa, with producers worried the current reintroduction pause won't hold.",
    claudeSummary: true,
    href: "https://www.sanmiguelbasinforum.com/stories/van-winkle-talks-fire-drought-and-wolves,125792",
    img: ""
  },
  {
    title: "Spring Creek Basin Herd at 74; PZP keeps numbers steady",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "August 12, 2026",
    firstSeen: "2026-08-12",
    dateSource: "article",
    newsTopic: "community",
    copy: "The Spring Creek Basin wild horse herd sits at 74, comfortably within the 50–80 appropriate management level, and no round-up has been needed in 15 years thanks to PZP contraceptive darting each spring. T.J. Holmes volunteers her time administering the program, with the BLM covering supplies. Water is just OK out there right now, with catchments and natural seeps keeping the horses going.",
    claudeSummary: true,
    href: "https://www.sanmiguelbasinforum.com/stories/spring-creek-basin-herd-at-74-pzp-keeps-numbers-in-check,125797",
    img: "https://zeta.creativecirclecdn.com/smb/original/20260811-120658-599-F3%20-%20horse.jpg"
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
  {
    title: "Telluride Chamber Music and Telluride Science Community Concert",
    date: "2026-09-10",
    time: "6:00 PM – 7:00 PM",
    location: "Telluride Innovation Center, Telluride",
    description: "Join Telluride Science and Telluride Chamber Music for a free community concert on the scenic patio at the Innovation Center. \r\nFeatured musicians:Danny DeSantis (viola), Anne Foxen (violin), Steve White (cell) and Travis Fisher (piano) \r\nAll are welcome—come soak in the beauty of live chamber music in an inspiring setting.",
    link: "https://telluridescience.org/event/community-concert-september/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/07/com_concert-0910_1080x1080.png",
    sourceLabel: "Telluride Science"
  },
  {
    title: "Optimize Your Brain Health with Lifestyle Medicine",
    date: "2026-09-23",
    time: "6:30 PM – 7:30 PM",
    location: "Telluride Innovation Center, Telluride",
    description: "What if nearly half of dementia cases could be prevented? Growing scientific evidence says it's possible—and it starts with the choices we make every day. Join Dr. Melissa Sundermann, a double board-certified Lifestyle Medicine physician known as Doctor Outdoors, for an engaging look at the science behind lifelong brain health. From nutrition and movement to sleep, stress management, social connection, and time outdoors, discover how everyday habits shape cognitive performance and long-term wellbeing. You'll leave with practical, research-backed strategies—and a personalized roadmap for protecting your brain, your most valuable asset.\r\nThis event is co-sposnored by Telluride Science and Telluride Foundation and is free and open the public. RSVP is required.  RSVP HERE",
    link: "https://telluridescience.org/event/brain-health/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/08/Brain-Health_1080x1080-05.jpg",
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
    title: "Birding with Katie, Sept 3rd and 4th",
    link: "https://koto.org/event/birding-with-katie-sept-3rd-and-4th/2026-09-04/",
    description: "Patagonia Telluride will offer a bird talk with local birder Katie Triest at the Telluride Patagonia store on Thursday, Sept. 3 from 5-6 pm. Katie will be offering a bird walk on Friday, Sept 4th from 8-10 am. Please meet at the Patagonia Telluride store for the walk. Limited to 12 participants. You can sign up at the Patagonia store or by using the QR code on flyers around town. Binoculars will be provided.",
    pubDate: "2026-09-04T08:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Patagonia Telluride, Telluride Retail",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/image-1.png"
  },
  {
    title: "Tennis Clinic 3.0-4.0",
    link: "https://koto.org/event/tennis-clinic-3-0-4-0/2026-09-04/",
    description: "This is the TRC flagship Tennis Clinic. Courts will be divided based on level and experience. For players rated below 3.0, please sign up for a private lesson or join the 2.0 – 3.0 clinic. For more advanced players, we offer an advanced 4.0+ clinic. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-04T09:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Up-off Gymnastics, Dance, and Spanish",
    link: "https://koto.org/event/up-off-gymnastics-dance-and-spanish/2026-09-04/",
    description: "We are a MOBILE family business offering non-competitive Gymnastics, Preschool Spanish, & Dance classes to the San Miguel County area. Tia Uphoff was a competitive gymnast and an instructor for 20+ years, helping children develop balance, flexibility, strength and proper tumbling techniques while using positive reinforcement and encouragement for success. Infant to Age 5 — Padres & Pequenos Class – $10.00 per class This class invites adults & kids to participate in Educational songs, in English & Spanish, with intro to gymnastics. Sign up at any time and get started weekly. Fridays — 11:15-11:40 am @ Lone Cone Library Norwood K to 3rd Grade week Session 8 Week Winter Session $150 for the 8 sessions. Thursdays – 430-530 pm @ Lone Cone Library Norwood For more information and to register: Contact Tia @ liv2danz247@gmail.com or find us on Facebook!",
    pubDate: "2026-09-04T10:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Lone Cone Library Norwood",
    imageUrl: "https://koto.org/wp-content/uploads/2025/06/Messenger_creation_3FA37E27-C0AC-4E9D-ABF5-592710E68D81.jpeg"
  },
  {
    title: "Ridgway Farmer's Market",
    link: "https://koto.org/event/ridgway-farmers-market/2026-09-04/",
    description: "The Ridgway Farmer's Market takes place every Friday from May 22nd through October 16th! * The August 7th Market will be held onthe 6th* 10 a.m. to 2 p.m. at Hartwell Park in Downtown Ridgway Local Produce | Artisans | Live Music every Last Friday",
    pubDate: "2026-09-04T10:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Hartwell Park Ridgway",
    imageUrl: ""
  },
  {
    title: "Telluride Farmer's Market",
    link: "https://koto.org/event/telluride-farmers-market/2026-09-04/",
    description: "We are an organic market in the heart of beautiful downtown Telluride, CO. Our 2026 Market is every Friday from May 29 – October 9th! We provide the highest quality produce, animal products, prepared food, and artisans. All of our goods are produced within 100 miles of Telluride, so you can feel good about shopping local. From late May through early October, you can find us on South Oak Street in downtown Telluride selling the best of Southwest Colorado from 10:30am to 3:30pm.",
    pubDate: "2026-09-04T10:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Oak Street Plaza, Telluride",
    imageUrl: ""
  },
  {
    title: "Tennis Clinic 4.0+",
    link: "https://koto.org/event/tennis-clinic-4-0/2026-09-04/",
    description: "Players must have a USTA rating above 4.0 (intermediate/advanced) Strong shot anticipation and ball control are essential. Consistent second serves are required. Must have a solid and established strategy. Comfortable competing under high-stress conditions. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-04T11:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Gentle Yoga with Kristen Milord",
    link: "https://koto.org/event/gentle-yoga-with-kristen-milord/2026-09-06/",
    description: "Breathe, stretch, and reset with gentle yoga taught by Kristen Milord, Sundays from 11:00 am to 12:00 pm. This free, accessible class is open to all levels—no prior experience needed. Feel free to bring your own mat, or the library also has mats, bolsters, blocks and blankets available to use. This class if free, but donations to support the instructor are welcome.",
    pubDate: "2026-09-06T11:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/gentle-yoga-kristen.png"
  },
  {
    title: "Drop In Tech Time with Oliver",
    link: "https://koto.org/event/drop-in-tech-time-with-oliver-2/2026-09-06/",
    description: "Drop by the 2nd floor desk for Tech Time with Oliver every Sunday from 1-3pm. Bring your questions about technology (phones, tablets, laptops, email, etc.) or learn about special collections the library offers, such as the Kindles, iPads, and laptops our patrons can check out as well as the library apps you can download to your devices to access free ebooks, audiobooks, movies, music, magazines and more!",
    pubDate: "2026-09-06T13:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Immersive Sound Journey with Dustin Wells",
    link: "https://koto.org/event/immersive-sound-journey-with-dustin-wells/",
    description: "An immersive sound journey is a live musical experience you take lying down. Musician and sound ceremony artist Dustin Wells surrounds the room with sacred instruments — gongs, shamanic drums, singing bowls, crystal bowls, wind chimes — woven live with synths, guitar, and voice into a single two-hour soundscape. The journey moves through a deliberate arc, from settling in to full sound to a quiet return, designed to guide the nervous system out of fight-or-flight and into the state where the body does its own healing. Come as you are; leave with what you came for. THIS EVENT WILL BE HELD ON THE TERRACE-DRESS ACCORDINGLY · Please arrive 30 minutes early to find your spot and get comfortable. · Suggested: bring what makes the floor feel like home — a yoga mat, pillow, blanket, or eye mask. Guests lie down if there's room, or sit as needed. …",
    pubDate: "2026-09-06T14:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/sound-JOURNEY.png"
  },
  {
    title: "Tea and Tarot",
    link: "https://koto.org/event/tea-and-tarot/2026-09-06/",
    description: "Tea and Tarot Sessions with Jade Rose and others from Sanctuary Collective in the Telluride Room. Seating is limited; please sign up at telluridelibrary.org in advance.",
    pubDate: "2026-09-06T14:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/tea-1.jpg"
  },
  {
    title: "Tennis Clinic 3.0-4.0",
    link: "https://koto.org/event/tennis-clinic-3-0-4-0/2026-09-07/",
    description: "This is the TRC flagship Tennis Clinic. Courts will be divided based on level and experience. For players rated below 3.0, please sign up for a private lesson or join the 2.0 – 3.0 clinic. For more advanced players, we offer an advanced 4.0+ clinic. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-07T09:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Tennis Clinic 4.0+",
    link: "https://koto.org/event/tennis-clinic-4-0/2026-09-07/",
    description: "Players must have a USTA rating above 4.0 (intermediate/advanced) Strong shot anticipation and ball control are essential. Consistent second serves are required. Must have a solid and established strategy. Comfortable competing under high-stress conditions. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-07T11:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "RESCHEDULED: Birding Walk with Katie Triest",
    link: "https://koto.org/event/birding-walk-with-katie-triest/",
    description: "Join ornithological expert Katie Triest for this series of chill walks where you'll learn amazing facts and practice identifying local birds! Meet at the post office and we'll head to the beaver ponds at the edge of Town Park. Bring your own binoculars if you have them and make sure to dress for variant weather. Be on time, and PLEASE cancel your reservation if you are unable to make it. This event is very popular and the waiting list is long.",
    pubDate: "2026-09-08T08:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Post Office",
    imageUrl: ""
  },
  {
    title: "Tennis Clinic 3.0-4.0",
    link: "https://koto.org/event/tennis-clinic-3-0-4-0/2026-09-08/",
    description: "This is the TRC flagship Tennis Clinic. Courts will be divided based on level and experience. For players rated below 3.0, please sign up for a private lesson or join the 2.0 – 3.0 clinic. For more advanced players, we offer an advanced 4.0+ clinic. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-08T09:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Tennis Clinic 4.0+",
    link: "https://koto.org/event/tennis-clinic-4-0/2026-09-08/",
    description: "Players must have a USTA rating above 4.0 (intermediate/advanced) Strong shot anticipation and ball control are essential. Consistent second serves are required. Must have a solid and established strategy. Comfortable competing under high-stress conditions. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-08T11:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Free Legal Clinic – Clínica Jurídica Gratuita",
    link: "https://koto.org/event/free-legal-clinic-clinica-juridica-gratuita/2026-09-08/",
    description: "A FREE legal clinic for parties who have no attorney. Sign up today because spots are limited. Volunteer attorneys will answer questions, help fill out forms, and explain the process and procedure for legalissues. The volunteer attorneys do not represent you and this clinic is information only. BY APPOINTMENT ONLY. Call 970-728-4519 for more information and to sign up. Una clínica de asesoramiento jurídico GRATUITO para las personas que notienen abogado. Abogados voluntarios responderán a preguntas, ayudarán a llenar formularios y explicarán el proceso y el procedimiento de cuestiones jurídicas. Los abogados voluntarios no te representan y esta clínica es sólo informativa. CON CITA PREVIA. Llame a 970-728-4519 para más información y para registrarse.",
    pubDate: "2026-09-08T16:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Online Author Talk with Daniel Kraus",
    link: "https://koto.org/event/online-author-talk-with-daniel-kraus/",
    description: "Prepare to launch into the darkest depths of deep space! Join us online as we sit down with master storyteller Daniel Kraus, winner of the 2026 Pulitzer Prize for Fiction, to celebrate the release of his breathtaking new novel, The Sixth Nik. Deep into space, far past the triworld outposts, beyond range of the lethal trollbot internet, soars The Sickness: a ship woven from biomatter and capable of reacting to every need of its human crew. Sisilla, a nine-year-old cultist with a brain enhanced by arcane tech known as “niks,” has boarded to investigate the enigma of Fém—a plague-riddled planet that has abruptly gone rogue. The mysterious crew includes a faceless assassin, a beautiful engineer jigsawed by plastic surgery, a peyote-addicted medic, and—most lethal of all—a rugged, NonModded captain with a score to settle with Sisilla. Other dangers abound. A hacked robot begins to believe Sisilla is its daughter. …",
    pubDate: "2026-09-08T17:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Zoom",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/daniel.png"
  },
  {
    title: "West African Drum & Dance",
    link: "https://koto.org/event/west-african-drum-dance/",
    description: "This class is geared towards adults and teens. Children 12 and under must be accompanied by an adult. Sign up at the bottom of this page! Participants will learn a specific Guinean rhythm and get the opportunity to learn various foundational techniques and skills for playing the Djembe in harmony and beat with one another. The second half of the class will be learning the dance rhythm associated to the drum rhythm learned. This is accompanied by live drumming where participants get to experience how the drumming and dance play together. The classes are a full body, mind and heart experience that focuses on left and right brain activities as well as connection to comm",
    pubDate: "2026-09-08T17:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Book Buzz at Telluride Brewing Co-Lawson Hill",
    link: "https://koto.org/event/book-buzz-at-telluride-brewing-co-lawson-hill/",
    description: "Join WPL on the 2nd Tuesday 5:30-6:30pm of each month at TBC in Lawson Hill May-September. Our queen of Reader's Advisory, Tiffany Osborne, will be there to talk about our hottest new titles and Miss Melissa will be providing an interactive story time for the kids. We'll have grab-and-go activity kits for the littles as well, and plenty of books to checkout. ADDED BONUS: Enjoy a 10% discount on food as well as $5 TBC Beers when you show your library card to the TBC staff. Don't have a card? No problem! We'll make one for you on the spot!",
    pubDate: "2026-09-08T17:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Brewing Company Lawson Hill Taproom",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/book-buzz-14.png"
  },
  {
    title: "Tennis Clinic 3.0-4.0",
    link: "https://koto.org/event/tennis-clinic-3-0-4-0/2026-09-09/",
    description: "This is the TRC flagship Tennis Clinic. Courts will be divided based on level and experience. For players rated below 3.0, please sign up for a private lesson or join the 2.0 – 3.0 clinic. For more advanced players, we offer an advanced 4.0+ clinic. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-09T09:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Market on the Plaza",
    link: "https://koto.org/event/market-on-the-plaza/2026-09-09/",
    description: "Market on the Plaza is held each Wednesday, June 10 – September 9, 2026, from 11 a.m. to 4 p.m. in Heritage Plaza, the center of Mountain Village. Heritage Plaza is steps from the free gondola. Come enjoy local produce, original artisan creations, kid-friendly goods and more.",
    pubDate: "2026-09-09T11:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Heritage Plaza, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Tennis Clinic 4.0+",
    link: "https://koto.org/event/tennis-clinic-4-0/2026-09-09/",
    description: "Players must have a USTA rating above 4.0 (intermediate/advanced) Strong shot anticipation and ball control are essential. Consistent second serves are required. Must have a solid and established strategy. Comfortable competing under high-stress conditions. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-09T11:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Mahjongg for Independent Players",
    link: "https://koto.org/event/mahjongg-for-independent-players-4/2026-09-09/",
    description: "Looking to enjoy an afternoon of friendly games of mah-jongg for independent players? Join us at the Library every Wednesday from 1-3pm. Bring your 2026 card if you have one, although we have plenty of loaners if you don’t! We’ll have tables, cloths, chairs, and sets. NOTE: This is not a mah-jongg lesson. A general knowledge of the game is necessary to join. Please register in advance at telluridelibrary.org if you'd like to join so we can make sure we have enough tables set up for everyone!",
    pubDate: "2026-09-09T13:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/mahj.jpg"
  },
  {
    title: "Sewing 101 with Melissa",
    link: "https://koto.org/event/sewing-101-with-melissa/2026-09-09/",
    description: "Don't throw away your old clothes just because they have a tiny (or even a large) hole in them! Learn the basics of sewing and mending your clothing with our very own talented seamstress, Melissa Sumpter! Bring your own garment, we'll provide the sewing materials.",
    pubDate: "2026-09-09T17:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/02/sewing.jpg"
  },
  {
    title: "Sound Bath with Danielle & Ian",
    link: "https://koto.org/event/sound-bath-with-danielle-ian-2/",
    description: "Join us for an hour of traveling through sound and the inner self! In this once a month community event, we are healing the body and auric field with a multitude of sound frequencies. Chimes, 432hz quartz singing bowls, crystal tuning pyramids, rain drums, GALORE! We will also be holding space for group conversation, weaving through topics of spirituality. Bring a blanket, yoga mat, water bottle, journal, and your psycho-spiritual discussion hat! After each sound bath, we will be sticking around for group discussion for a duration of 30 – 40 minutes. Each month will have a different psycho-spiritual topic, and will offer tools to integrate these themes into our daily lives. Join us for this beautiful summer offering! Hosted by: Danielle Christmas & Ian Wilson Danielle Christmas: Sound healer/ Reiki 2/ YTT 200hr/ Breathwork coach Ian Wilson: Sound healing practitioner/ Level 3 Reiki practitioner/ Herbalist",
    pubDate: "2026-09-09T17:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/danielle-sound-1.png"
  },
  {
    title: "Tennis Clinic 3.0-4.0",
    link: "https://koto.org/event/tennis-clinic-3-0-4-0/2026-09-10/",
    description: "This is the TRC flagship Tennis Clinic. Courts will be divided based on level and experience. For players rated below 3.0, please sign up for a private lesson or join the 2.0 – 3.0 clinic. For more advanced players, we offer an advanced 4.0+ clinic. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-10T09:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Tennis Clinic 4.0+",
    link: "https://koto.org/event/tennis-clinic-4-0/2026-09-10/",
    description: "Players must have a USTA rating above 4.0 (intermediate/advanced) Strong shot anticipation and ball control are essential. Consistent second serves are required. Must have a solid and established strategy. Comfortable competing under high-stress conditions. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-10T11:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Pilates for All Bodies with Laura",
    link: "https://koto.org/event/pilates-for-all-bodies-with-laura-2/2026-09-10/",
    description: "Join Laura Colbert for Pilates for All Bodies every Thursday from 12:30-1:15pm. This program is free and open to the public. All bodies and experience levels are welcome. The library has a few mats, but bring your own if you can.",
    pubDate: "2026-09-10T12:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "TRC Men's Tennis Singles",
    link: "https://koto.org/event/trc-mens-tennis-singles/2026-09-10/",
    description: "The 1st TRC Men's Singles League! Sign up on a week-to-week basis. No long-term commitment.",
    pubDate: "2026-09-10T16:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Booze and Books at Liz",
    link: "https://koto.org/event/booze-and-books-at-liz-2/",
    description: "Sip on a libation while chatting with other bibliophiles about books you have read recently. It's totally open ended and open to everyone! 5:15 the second Thursday of every month. The library will get some apps for the table; you purchase your own beverage. Please sign up in advance. Meet at Liz at 200 W. Colorado Ave. in Telluride. (Entrance is on Fir St.)",
    pubDate: "2026-09-10T17:15:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Liz, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/BoozeBooks-Liz.png"
  },
  {
    title: "The Creative Exchange at Telluride Arts HQ",
    link: "https://koto.org/event/the-creative-exchange-at-telluride-arts-hq-2/2026-09-10/",
    description: "The Creative Exchange is a brand-new monthly series by Telluride Arts designed for the artists and creatives who call Telluride home. It’s a space where emerging and established artists gather to share the knowledge, skills, and stories that fuel their work. Think of it as an open source model for creativity—where we learn from each other, swap ideas, and help strengthen one another’s practice. Each session is hosted by local artists and creative leaders who bring their own perspectives, techniques, and creative journeys into the room. Topics may span everything from the business of art and professional development, to creative process, storytelling, collaboration, and the philosophical underpinnings of making art. Whether you’re a full-time working artist, an educator, a student, a maker, or simply someone curious about creative expression, the Creative Exchange is open to you. …",
    pubDate: "2026-09-10T17:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Arts HQ, TELLURIDE",
    imageUrl: "https://koto.org/wp-content/uploads/2025/12/Screenshot-2025-12-17-at-4.42.32-PM.png"
  },
  {
    title: "Facing the Mourning",
    link: "https://koto.org/event/facing-the-mourning/2026-09-10/",
    description: "Facing the Mourning is a free, four-week grief support series taking place every Thursday throughout September. When: Thursdays in September at 6:00 PM Where: Redvale Community Center Cost: Free The series is open to anyone who may benefit from additional support while navigating grief and loss. Please feel free to share this information with others who may be interested.",
    pubDate: "2026-09-10T18:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Redvale Community Center",
    imageUrl: ""
  },
  {
    title: "Tennis Clinic 3.0-4.0",
    link: "https://koto.org/event/tennis-clinic-3-0-4-0/2026-09-11/",
    description: "This is the TRC flagship Tennis Clinic. Courts will be divided based on level and experience. For players rated below 3.0, please sign up for a private lesson or join the 2.0 – 3.0 clinic. For more advanced players, we offer an advanced 4.0+ clinic. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-11T09:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Up-off Gymnastics, Dance, and Spanish",
    link: "https://koto.org/event/up-off-gymnastics-dance-and-spanish/2026-09-11/",
    description: "We are a MOBILE family business offering non-competitive Gymnastics, Preschool Spanish, & Dance classes to the San Miguel County area. Tia Uphoff was a competitive gymnast and an instructor for 20+ years, helping children develop balance, flexibility, strength and proper tumbling techniques while using positive reinforcement and encouragement for success. Infant to Age 5 — Padres & Pequenos Class – $10.00 per class This class invites adults & kids to participate in Educational songs, in English & Spanish, with intro to gymnastics. Sign up at any time and get started weekly. Fridays — 11:15-11:40 am @ Lone Cone Library Norwood K to 3rd Grade week Session 8 Week Winter Session $150 for the 8 sessions. Thursdays – 430-530 pm @ Lone Cone Library Norwood For more information and to register: Contact Tia @ liv2danz247@gmail.com or find us on Facebook!",
    pubDate: "2026-09-11T10:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Lone Cone Library Norwood",
    imageUrl: "https://koto.org/wp-content/uploads/2025/06/Messenger_creation_3FA37E27-C0AC-4E9D-ABF5-592710E68D81.jpeg"
  },
  {
    title: "Ridgway Farmer's Market",
    link: "https://koto.org/event/ridgway-farmers-market/2026-09-11/",
    description: "The Ridgway Farmer's Market takes place every Friday from May 22nd through October 16th! * The August 7th Market will be held onthe 6th* 10 a.m. to 2 p.m. at Hartwell Park in Downtown Ridgway Local Produce | Artisans | Live Music every Last Friday",
    pubDate: "2026-09-11T10:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Hartwell Park Ridgway",
    imageUrl: ""
  },
  {
    title: "Telluride Farmer's Market",
    link: "https://koto.org/event/telluride-farmers-market/2026-09-11/",
    description: "We are an organic market in the heart of beautiful downtown Telluride, CO. Our 2026 Market is every Friday from May 29 – October 9th! We provide the highest quality produce, animal products, prepared food, and artisans. All of our goods are produced within 100 miles of Telluride, so you can feel good about shopping local. From late May through early October, you can find us on South Oak Street in downtown Telluride selling the best of Southwest Colorado from 10:30am to 3:30pm.",
    pubDate: "2026-09-11T10:30:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Oak Street Plaza, Telluride",
    imageUrl: ""
  },
  {
    title: "Tennis Clinic 4.0+",
    link: "https://koto.org/event/tennis-clinic-4-0/2026-09-11/",
    description: "Players must have a USTA rating above 4.0 (intermediate/advanced) Strong shot anticipation and ball control are essential. Consistent second serves are required. Must have a solid and established strategy. Comfortable competing under high-stress conditions. A minimum of 2 players is required for this class to run.",
    pubDate: "2026-09-11T11:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Zumba with Gise",
    link: "https://koto.org/event/zumba-with-gise/2026-09-12/",
    description: "Ditch the workout and join the party! Zumba® is a high-energy dance fitness class that mixes low-intensity and high-intensity moves for an interval-style, calorie-burning workout. Driven by Latin and international rhythms like salsa, merengue, reggaeton, and cumbia, you will tone your body and boost your endurance without even realizing how hard you are working. It is exercise in disguise! No dance experience is required—just bring your energy, a water bottle, and a smile. This class is free and open to the public, but donations for the instructor are always welcome. ¡Olvida el entrenamiento y únete a la fiesta! Zumba® es una clase de fitness de baile de alta energía que mezcla movimientos de baja y alta intensidad para un entrenamiento de estilo de intervalos que quema calorías. …",
    pubDate: "2026-09-12T10:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/zumba-gise.png"
  },
  {
    title: "20th Anniversary of Down Valley Park + Rich's Retirement Party!",
    link: "https://koto.org/event/20th-anniversary-of-down-valley-park-richs-retirement-party/",
    description: "Celebrate the down valley park and community, and wish Rich Hamilton a happy retirement, on Saturday, September 12th, from 3-7 p.m. at Down Valley Park. Free food provided by Sawpit Mercantile and SMC Parks + Open Space. Live music with Telluride Gold Kings 4-6 p.m.",
    pubDate: "2026-09-12T15:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Gentle Yoga with Kristen Milord",
    link: "https://koto.org/event/gentle-yoga-with-kristen-milord/2026-09-13/",
    description: "Breathe, stretch, and reset with gentle yoga taught by Kristen Milord, Sundays from 11:00 am to 12:00 pm. This free, accessible class is open to all levels—no prior experience needed. Feel free to bring your own mat, or the library also has mats, bolsters, blocks and blankets available to use. This class if free, but donations to support the instructor are welcome.",
    pubDate: "2026-09-13T11:00:00-06:00",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/08/gentle-yoga-kristen.png"
  }
];

const WILKINSON_EVENTS = [
  {
    title: "Yoga for ALL with Jane & Jay",
    link: "https://telluridelibrary.libcal.com/event/15803456?hs=a",
    description: "8:30 AM – 9:45 AM · Join local instructors Jane del Piero and Jay Holt for a weekly class centered on deep breath work, gentle flow, and energizing chakral movement. Jane and Jay are the owners of local acupuncture, massage, and sound healing practice Luv Light. Donations are accepted. All bodies welcome.",
    pubDate: "2026-09-04T14:30:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Magazine Room",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/data/feat_img/6460/19928/1715278303.jpg"
  },
  {
    title: "Coffee, Croissants and Cribbage",
    link: "https://telluridelibrary.libcal.com/event/17357536?hs=a",
    description: "10:00 AM – 11:30 AM · Coffee, croissants and cribbage is back! Come by the library Magazine Room 10-11:30am for friendly competition, free coffee and pastries, and community connection. May the nibs be with you.",
    pubDate: "2026-09-04T16:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Magazine Room",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_08_27_10_38_03.jpg"
  },
  {
    title: "No School Science with Pinhead",
    link: "https://telluridelibrary.libcal.com/event/17459728?hs=a",
    description: "A hands-on science program hosted by Pinhead Institute, held outdoors on the Lower Terrace at Wilkinson Public Library on a day off from school. The event runs from 1:00 to 3:00 PM and offers kids the chance to explore science through interactive activities.",
    pubDate: "2026-09-04T19:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Lower Terrace - outdoors",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_08_26_10_07_56.png"
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
    title: "Mama Said String Band",
    link: "https://www.alibitelluride.com/calendar#eca-event=mama-said-string-band",
    description: "Mama Said String Band is an instant classic, since 2016 they’ve been bringing th...",
    pubDate: "2026-09-09",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/a853e817-2c27-4803-a085-95d7ee11beaf/-/crop/999x1000/250,0/-/preview/"
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
    title: "Telluride Film Festival",
    link: "https://sheridanoperahouse.com/events/telluride-film-festival/",
    description: "The Telluride Film Festival returns to the Sheridan Opera House, bringing screenings and cinematic programming to one of the mountain town's most storied historic venues. This beloved annual event draws film enthusiasts from around the world for a celebrated weekend of independent and international cinema in the heart of Telluride.",
    pubDate: "2026-09-04",
    endDate: "2026-09-07",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2026/03/4fd403bf-4bc8-9f64-6ab9-26b72e8ee156.jpg"
  },
  {
    title: "The Meditations Live in Concert",
    link: "https://sheridanoperahouse.com/events/the-meditations-live-in-concert/",
    description: "The Meditations, the legendary Jamaican reggae vocal group, perform live at the historic Sheridan Opera House in Telluride. This concert brings their classic roots reggae harmonies to one of the region's most celebrated intimate venues.",
    pubDate: "2026-09-11",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2026/05/unnamed-file.jpg"
  },
  {
    title: "Telluride Theater Fringe Project: La Familia Music Group",
    link: "https://sheridanoperahouse.com/events/telluride-theater-fringe-project-la-familia-music-group/",
    description: "La Familia Music Group takes the stage at the historic Sheridan Opera House as part of the Telluride Theater Fringe Project. This performance brings together theater and live music in an intimate venue setting during the fall season.",
    pubDate: "2026-09-12",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2026/06/Screenshot-2026-09-03-at-11.21.00-AM.png"
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
    title: "The M Factor, Shredding the Silence on Menopause. Film followed by a panel discussion",
    href: "https://sherbino.org/event/the-m-factor-shredding-the-silence-on-menopause-film-followed-by-a-panel-discussion/",
    date: "2026-09-01 18:30:00",
    endDate: "2026-09-01 20:00:00",
    location: "The Sherbino, Ridgway",
    copy: "The Sherbino presents The M Factor: Shredding the Silence on Menopause on September 1 at 6:30 PM, followed by a panel discussion. @ Doors at 6:00 PM, Film at 6:30 PM followed by a panel discussion led by local specialists in women's health issues Dr. Abigail Seaver, ND; Meg Benasutti, ANP-BC, Jennifer McGeorge, ARNP, CNM, MSCP and Kim Walker, DNP, WHNP. Note: this is a different film from the one we showed back in May, which was about Perimenopause About The M Factor Film Menopause is a silent epidemic that affects the health and well‑being of millions of American women. In addition to experiencing traumatic physical symptoms, women are struggling with the related stresses of billions of dollars in lost wages, upended careers, family disruptions, and emotional chaos. This film confront this neglected crisis, challenges societal and medical shortcomings and advocates for a revolutionary approach to women's health all over the world. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/06/ChatGPT-Image-Jun-23-2026-07_58_16-PM.png"
  },
  {
    title: "Auditions, Take 2: Rocky Horror Picture Show Live Shadow Cast Edition (Show in Oct.)",
    href: "https://sherbino.org/event/rocky-horror-shadow-cast-auditions-take-2-sherbino/",
    date: "2026-09-03 17:30:00",
    endDate: "2026-09-03 19:00:00",
    location: "The Sherbino, Ridgway",
    copy: "@ Rocky Horror Picture Show — Live Shadowcast Edition, Directed by Erin Cawley Auditions · Thursday, Sept 3 · 5:30 – 7:00 p.m. · The Sherbino (604 Clinton St.) The Sherbino is casting for its live shadowcast production of The Rocky Horror Picture Show — and we’re opening up a second night of auditions! We know that the Sunday before school starts can be a hectic time with a lot of conflicts, so if you missed the first audition date, this is your second chance to jump in. This is your chance to step into the spotlight, don a wild costume, and bring this cult classic to life on stage. If auditioning for a specific character, we suggest preparing a 1–2 minute section of the film to audition with in shadowcast as that character. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/08/rocky-auditions-round-2.png"
  },
  {
    title: "First Friday Opening Reception: Bonnie Bucknam's \"Unscripted: Fiber Improvisations\"",
    href: "https://sherbino.org/event/unscripted-fiber-improvisations-bonnie-bucknam/",
    date: "2026-09-04 17:00:00",
    endDate: "2026-09-04 19:00:00",
    location: "The Sherbino, Ridgway",
    copy: "@ UNSCRIPTED: Fiber Improvosations ~ An Exhibition by Bonnie Bucknam On display at The Sherbino and Weehwaken's 610 Arts Collective Gallery from September 1 – 23, 2026 Artist Reception Join us during Ridgway’s First Friday on Friday, September 4, from 5–7 pm. Stop by the 610 Arts Collective, explore the exhibition, and meet artist Bonnie Bucknam. In Unscripted: Fiber Improvisations, Bucknam embraces intuition, experimentation, and the unexpected. Rather than beginning with a predetermined design, she places a pieced or solid fabric shape on her pin wall and responds to it—adding another shape, observing the result, and allowing each composition to evolve organically. “These pieces go with the flow,” Bucknam explains. Free from rigid plans, rulers, and straight edges, the work celebrates irregularity and the expressive possibilities of imperfection. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/08/bucknam-at-610.png"
  },
  {
    title: "The Sherbino Presents: Donny Morales – First Friday Show",
    href: "https://sherbino.org/event/the-sherbino-presents-donny-morales-first-friday-show/",
    date: "2026-09-04 18:00:00",
    endDate: "2026-09-04 20:00:00",
    location: "The Sherbino, Ridgway",
    copy: "@ Friday, September 4th | 6:00–8:00 pmSherbino “Living Room” Free Show | Cash Bar | Tips EncouragedCelebrate First Friday with an intimate evening of live music at the Sherbino! Join us in the Sherbino’s cozy “Living Room” near the bar for a special performance by Donny Morales. Donny brings his signature blend of \"soul-acousti-funk\", delivering an irresistible mix of soulful vocals, funky rhythms, and masterful acoustic guitar. A longtime favorite on Colorado's Western Slope, Donny's performances are equal parts heartfelt storytelling, infectious grooves, and musical spontaneity. Whether he's reimagining familiar favorites or sharing original songs, his warm stage presence and feel-good energy create an experience that's impossible not to move to. Come ready to clap, sway, sing along, and enjoy an unforgettable evening of soul, acoustic vibes, and funk. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/07/Donny-Morales-banner-Sept-4th.png"
  },
  {
    title: "The Courtyard at 610 Presents: Heather & Douglas",
    href: "https://sherbino.org/event/the-courtyard-at-610-presents-heather-douglas-2/",
    date: "2026-09-06 19:00:00",
    endDate: "2026-09-06 20:30:00",
    location: "The Courtyard at 610, Ridgway",
    copy: "@ Gates: 6:30 || Show: 7:00pm || $15 Advance / $20 at gates || Enter via the alleyway behind the Sherbino and 610 Arts Collective || Outdoor Venue || Setting: seated || Limited Bar Available || There will be a few \"agility\" tickets at the gate — which are tickets for seats that you have to climb over a railing for. We don't sell those online — but we do sell them onsite IF there is space. **Due to the local Gold Mountain Fire – Poor air quality or rain location will be inside on The Sherbino main stage for Courtyard shows** Join us for an unforgettable evening of music under the stars in one of Ridgway’s most charming hidden venues—The Courtyard at 610, tucked behind the 610 Arts Collective and Sherbino Theater. Enter through the alleyway behind the Sherbino and 610 Gallery for a magical summer night. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/07/Heather-Douglas-September-6-banner.png"
  },
  {
    title: "Monthly Welcome Home Alliance Veteran's Coffee at the Sherbino",
    href: "https://sherbino.org/event/monthly-welcome-home-alliance-veterans-coffee-at-the-sherbino/2026-09-08/",
    date: "2026-09-08 10:00:00",
    endDate: "2026-09-08 12:00:00",
    location: "Ridgway, CO",
    copy: "",
    imageUrl: "https://sherbino.org/wp-content/uploads/2023/01/Vet-Coffee.png",
    description: "A monthly gathering hosted by the Welcome Home Alliance brings veterans together for coffee at the Sherbino in Ridgway. The recurring event offers a casual space for veterans to connect with one another and with community support."
  },
  {
    title: "Jolie Holland",
    href: "https://sherbino.org/event/jolie-holland/",
    date: "2026-09-10 19:30:00",
    endDate: "2026-09-10 21:00:00",
    location: "The Sherbino, Ridgway",
    copy: "@ THURSDAY || Doors: 6:30 PM || Show: 7:00 PM || Tickets: $30 in advance / $35 Day of Show || Solo Show || Some Reserved Section Seats Available Presented in partnership by The Sherbino with Pickin' Productions About Jolie Holand Jolie Holland has forged a timeless, captivating musical legacy; as she mines the depths of her, at times harrowing, life experiences, her creative choices are rooted in honesty and presence. They are also fearless. Jolie Holland has been on the road since the early 2000s, releasing seven of her own albums and collaborating on countless others. Her work has been described as a syncretization of American roots, with rock and experimental elements. She’s been in the studio with Booker T, Lucinda Williams, and TV On The Radio; and shared stages with Big Thief, St. Vincent, Elbow, and Mavis Staples. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/06/2026-sherb-event-banners-45.png"
  },
  {
    title: "Young & Dead",
    href: "https://sherbino.org/event/young-and-dead-sherbino-ridgway-september-12-2026/",
    date: "2026-09-12 19:30:00",
    endDate: "2026-09-12 22:00:00",
    location: "The Sherbino, Ridgway",
    copy: "@ Doors at 7 pm || Show at 7:30 pm || Dancehall-style show with limited seating || Tickets:  $25 advance / $28 day of show || A limited number of reserved tables are available.  GA Tickets can be found under the venue diagram.  Reserved tables are found by hovering over the diagram.  GA seats are available in the bar area. Get ready for a high-energy night of psychedelic exploration when Young & Dead takes over the Sherbino stage on Saturday, September 12. Hailing from Boulder, Colorado, this group of talented musicians in their early 20s bringsa fresh and electrifying approach to the music of the Grateful Dead — not simply recreating the catalog, but diving deep into the spirit of improvisation, experimentation, and musical adventure that made the Dead legendary. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/06/2026-sherb-event-banners-43.png"
  },
  {
    title: "Native Rhythms, Native Jazz: R. Carlos Nakai, AmoChip Dabney, & Will Clipman – at the Montrose Pavilion",
    href: "https://sherbino.org/event/native-rhythms-native-jazz-r-carlos-nakai-at-the-montrose-pavilion/",
    date: "2026-09-15 18:30:00",
    endDate: "2026-09-15 20:30:00",
    location: "montrose pavilion, Montrose",
    copy: "@ BUY TICKETS Doors: 6:00 PM ||  Show: 6:30 PM – This show is at the Montrose Pavilion, brought to you in partnership by The Sherbino and Weehawken Creative Arts Native Rhythms, Native Jazz: The Genre-Bending Journey of R. Carlos Nakai, AmoChip Dabney, and Will Clipman $25 in advance General Admission (GA) Seats || $30 in advance for reserved section seats (no longer available day-of-show) || $32 GA day of show || (you will select the actual seat in the diagram below to purchase reserved section seats. If you want GA seats, just scroll below the map to buy GA seats) Where Tradition Meets Innovation, and Boundaries Dissolve in Sound Amidst the vast tapestry of American music, few collaborations illustrate the spirit of genre-bending innovation as vividly as that of R. Carlos Nakai, AmoChip Dabney, and Will Clipman. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/04/R-Carlos-Native-Rythms-Native-Jazz-banner.png"
  },
  {
    title: "The Sherbino Presents: \"Out There, a National Park Story\" film celebrating the National Park Service's 110th birthday",
    href: "https://sherbino.org/event/the-sherbino-presents-out-there-a-national-park-story-film-celebrating-the-national-park-services-110th-birthday/",
    date: "2026-09-16 18:30:00",
    endDate: "2026-09-16 20:30:00",
    location: "The Sherbino, Ridgway",
    copy: "Celebrate America's public lands with Out There: A National Parks Story. Join us at the Sherbino Theatre on Wednesday, September 16, 2026, for this award-winning documentary. Doors open at 6:00 p.m., the 75-minute film begins at 6:30 p.m. Tickets are $10. @ Doors: 6:00 PM || Film: 6:30 PM || Tickets: $10 in advance || $12 at the doorSetting: Seated at The Sherbino What does real, large-scale ecosystem restoration look like? In the centennial year of the U.S. National Park Service, a young filmmaker and his childhood friend set off on a 10,000-mile journey through America’s national parks, leaving home with little more than a camera and a desire to understand what connects people to these wild places. What begins as a summer road trip becomes a seven-year odyssey, capturing untold stories of those who protect, visit, and find healing in the parks. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/07/2026-sherb-event-banners-46.png"
  },
  {
    title: "The Courtyard at 610 Presents: Alex Dunn & Mimi Genheimer",
    href: "https://sherbino.org/event/the-courtyard-at-610-presents-alex-dunn/",
    date: "2026-09-20 18:30:00",
    endDate: "2026-09-20 20:00:00",
    location: "The Courtyard at 610, Ridgway",
    copy: "@ Gates: 6:00 || Show: 6:30 pm || $20 Advance / $25 day of show || Enter via the alleyway behind the Sherbino and 610 Arts Collective || Outdoor Venue || Setting: seated  || Limited bar onsite Don't miss the last outdoor Courtyard Show of the season! The Courtyard at 610 is a unique little venue behind our gallery space, the 610 Arts Collective, on Clinton St. The entrance is through the alleyway between N Cora St. and N Laura St behind the gallery and The Sherbino Theater.  Join us for an intimate evening with Alex Dunn and Mimi Genheimer!  Dunn uses his own personal blend of Folk/Americana to reflect on the many lives he's led, from his youth along the border of Colorado and Wyoming to the quiet moments aboard commercial fishing vessels in the remote waters of Southeast Alaska, where he spent over a decade toiling on the sea and writing songs during …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/07/alex-dunn-New-banner.png"
  },
  {
    title: "Slap Dragon",
    href: "https://sherbino.org/event/slap-dragon-sherbino-september-27-2026/",
    date: "2026-09-27 19:30:00",
    endDate: "2026-09-27 21:00:00",
    location: "The Sherbino, Ridgway",
    copy: "@ Sunday || Doors at 7 pm || Show at 7:30 pm || Dancehall-style show with limited seating || Tickets:  $28 advance / $32 day of show || A limited number of reserved tables are available.  GA Tickets can be found under the venue diagram.  Reserved tables are found by hovering over the diagram.  GA seats are available in the bar area. The Sherbino and Pickin’ Productions welcome Slap Dragon, a Nashville-based band serving up a joyful, hard-to-define blend of acoustic funk, bluegrass instincts, R&B soul, disco energy, improvisation, and seriously sharp songwriting. Slap Dragon began as something of a half-joke—an acoustic funk band—but once bassist and songwriter Scott Mulvahill and vocalist Laura Berens began making music together, the idea quickly became something real. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/08/2026-sherb-event-banners-12.jpg"
  },
  {
    title: "The Sherbino Presents: \"Thinking Like Water\", a DIY look at watershed restoration",
    href: "https://sherbino.org/event/the-sherbino-presents-thinking-like-water-a-diy-look-at-watershed-restoration/",
    date: "2026-09-29 18:30:00",
    endDate: "2026-09-29 20:00:00",
    location: "The Sherbino, Ridgway",
    copy: "Join us at the Sherbino Theatre on Tuesday, September 29, 2026, for Episode 1 of this award-wining docuseries on our watersheds. Doors open at 6:00 p.m., the film begins at 6:30 p.m., a panel discussion follows. Tickets are $10. @ Doors: 6:00 PM || Film: 6:30 PM || Tickets: $10 in advance Setting: Seated at The Sherbino Doors: 6:00 Film: 6:30 followed by a discussion with the filmmaker Renea Roberts, and Jake Kurzweil, PH.D., Hydrologist with the Mountain Studies Institute & Uncompahgre Watershed Partnership.Part biography, part how-to, “Water Wizard” Bill Zeedyk and his allies illustrate a proven toolbox of simple low-tech, low-cost methods to restore degraded lands. They work with Nature, rather than against her, to gird against the extremes of drought and flood while fostering climate resiliency. We’ll be screening: Episode 1: “Willing to Try Things\"  Today, “water wizard” Bill Zeedyk is a legend in the ecological restoration community. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/08/Thinking-like-water-banner.png"
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
    date: "2026-09-01",
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
    description: "Thursday night Pickleball with no experience necessary; all supplies provided.",
    date: "2026-09-03",
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
    date: "2026-09-08",
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
    description: "Thursday night Pickleball with no experience necessary; all supplies provided.",
    date: "2026-09-10",
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
    date: "2026-09-15",
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
    description: "Thursday night Pickleball with no experience necessary; all supplies provided.",
    date: "2026-09-17",
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
    date: "2026-09-22",
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
    description: "Thursday night Pickleball with no experience necessary; all supplies provided.",
    date: "2026-09-24",
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
    description: "Thursday night Pickleball with no experience necessary; all supplies provided.",
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
    description: "Thursday night Pickleball with no experience necessary; all supplies provided.",
    date: "2026-10-08",
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
    title: "Telluride Community Concert — September",
    link: "https://telluridechambermusic.org/concert/community-sep",
    description: "An hour of chamber music on the deck — the perfect way to unwind. Free event.",
    date: "2026-09-10",
    time: "6:00 PM",
    source: "chamber-music",
    sourceLabel: "Telluride Chamber Music",
    category: "Concert",
    location: "Telluride Science and Innovation Center",
    imageUrl: "https://telluridechambermusic.org/concerts/community-sep.webp"
  },
  {
    title: "Balourdet Quartet",
    link: "https://telluridechambermusic.org/concert/balourdet",
    description: "An evening of Ravel and Brahms in the historic Sheridan Opera House.",
    date: "2026-09-13",
    time: "7:00 PM",
    source: "chamber-music",
    sourceLabel: "Telluride Chamber Music",
    category: "Concert",
    location: "Sheridan Opera House, Telluride, CO",
    imageUrl: "https://telluridechambermusic.org/concerts/balourdet.webp"
  },
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
    title: "Imogene Pass Run",
    link: "https://ouraycountyco.gov/Calendar.aspx?EID=3779",
    description: "The Imogene Pass Run is an annual footrace that takes competitors over the challenging Imogene Pass between Telluride and Ouray, traversing one of the most scenic and demanding mountain routes in the San Juan Mountains. The course climbs to an elevation of over 13,000 feet, making it a notable test of endurance for participants.",
    pubDate: "2026-09-12T07:00:00.000Z",
    source: "ouraycounty",
    sourceLabel: "Ouray County",
    category: "Community Event",
    location: "Imogene Pass - Ouray CO 81427",
    imageUrl: ""
  },
  {
    title: "Woman's Club Thank You Breakfast",
    link: "https://ouraycountyco.gov/Calendar.aspx?EID=3780",
    description: "Two or more Ouray County Commissioners may attend and participate in this event. https://ouraycountyco.gov/calendar.aspx?EID=3780",
    pubDate: "2026-09-10T07:30:00.000Z",
    source: "ouraycounty",
    sourceLabel: "Ouray County",
    category: "Community Event",
    location: "Ouray County 4-H Event Center - 22739 Highway 550 Ridgway CO 81432",
    imageUrl: ""
  }
];

const OURAY_RIDGWAY_EVENTS = [
  {
    title: "Labor Day Weekend - No School- Ridgway",
    link: "https://events.ourayridgwayevents.com/event/labor-day-no-school-ridgway",
    description: "View on site | Email this event",
    pubDate: "2026-09-04T06:00:00.000Z",
    endDate: "2026-09-07",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52196842516113/huge/34c03f502c2e6b24c2bdceae7a155d7b6d463e8f.jpg"
  },
  {
    title: "On Display - UNSCRIPTED: Fiber Improvisations by Bonnie Bucknam",
    link: "https://events.ourayridgwayevents.com/event/unscripted-fiber-improvisations-by-bonnie-bucknam",
    description: "Our September Exhibition brings us quilted works from internationally known artist, Bonnie Bucknam of Montrose, CO. Bonnie’s work won Best of Show at Quilt National 2011 and is now part of the Quilt National Permanent Collection at the International Quilt Museum in Lincoln, Nebraska. Bonnie’s work has been shown in numerous exhibits in the United States. In 2015, Bonnie’s work was in a year-long solo exhibition at the Portland Oregon International Airport. She was a solo artist at the Visions Museum of Textile Art, San Diego, in 2019. Internationally, Bonnie’s work has appeared in the Haus der Wirtschaft museum in Stuttgart, Germany, the Museum of Modern Art in Verona, Italy, and other venues in Germany, England, Ireland, France, Japan, Brazil, and the Netherlands. Bonnie’s work Tangle is part of the permanent collection of the Tuch + Technik Textilmuseum, Neumunster, Germany. …",
    pubDate: "2026-09-04T16:00:00.000Z",
    endDate: "2026-09-25",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The 610 Arts Collective",
    imageUrl: "https://localist-images.azureedge.net/photos/53551302433703/huge/07561f7b06b24999f21e6be2347e5102b9b92cc3.jpg"
  },
  {
    title: "Ongoing Exhibition: BIG BOX-Big New Work By T-Bone",
    link: "https://events.ourayridgwayevents.com/event/ongoing-exhibition-big-box-big-new-work-by-t-bone",
    description: "The Big Box Show! Bigger, better and more. This groundbreaking local art won't last long! Ridgway's own T-Bone and his quintessential colorful cardboard paintings take on new life and meaning in the Decker where they have room to stretch out and really TALK to you! Come and be delighted by the playful T-Bone experience. Stay to cool off, craft, co-work, hang out. or plan your own future exhibition or event in the space! The Decker is a unique community rental-art gallery hybrid, incubated and managed by the Town of Ridgway, in cooperation with our sister ARTSpace gallery next door. View on site | Email this event",
    pubDate: "2026-09-04T16:00:00.000Z",
    endDate: "2026-09-25",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53736310463128/huge/ce8867efeba0934913913ee401aff4479a074ba5.jpg"
  },
  {
    title: "Ridgway Farmers Market",
    link: "https://events.ourayridgwayevents.com/event/ridgway-farmers-market",
    description: "Ridgway Farmers Market WHERE LOCAL GROWS... in the soil, in our economy, and in the connections we share as a community Local farmers, ranchers, bakers, and artisans bring the best of Ridgway to town: fresh produce, handcrafted goods, and the shared belief that a strong community begins with supporting the people who live and work here. View on site | Email this event",
    pubDate: "2026-09-04T16:00:00.000Z",
    endDate: "2026-10-16",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Hartwell Park",
    imageUrl: "https://localist-images.azureedge.net/photos/52487561553294/huge/09a2d632a840b6a4d0303261c242753cb58a993a.jpg"
  },
  {
    title: "Trivia Night @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/trivia-night-the-wright-1382",
    description: "Come test the true limits of the human mind at Trivia Night @ the Wright, where obscure facts become temporary personality traits. Questions may include history, movies, science, music, local lore, accidental expertise, and things you absolutely learned once in 8th grade and never expected to need again. Bring a team, bring a friend, or arrive alone like a mysterious wandering scholar of useless information. Competitive spirits, wild guesses, and dramatic confidence are all encouraged. No studying required. In fact, studying may make things worse. View on site | Email this event",
    pubDate: "2026-09-04T19:00:12.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
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
    title: "Electric Badlands: First Friday Opening Night",
    link: "https://events.ourayridgwayevents.com/event/electric-badlands-first-friday-opening-night",
    description: "Where old country grit meets neon-lit dissent. Space to Create Gallery proudly presents Electric Badlands, a solo exhibition by Spencer Fuller. Stepping away from sepia-toned nostalgia, Fuller reimagines the mythology of the American West through high-voltage neon pigments, dripping brushstrokes, and traditional frontier iconography. Blending a sharp political critique with the raw, rebellious pulse of classic country and rock, these works challenge how we look at history, power, and contemporary identity. Join us for the opening reception during the Ridgway First Friday Art Walk to meet the artist, explore the works, and enjoy refreshments. The exhibition runs through September 28. View on site | Email this event",
    pubDate: "2026-09-04T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Space to Create Gallery",
    imageUrl: "https://localist-images.azureedge.net/photos/53764195995930/huge/26a45ab073a35cce3a87bf6cbea54303787871f9.jpg"
  },
  {
    title: "First Friday Art Walk",
    link: "https://events.ourayridgwayevents.com/event/first-friday-art-walk",
    description: "Discover new work, celebrate openings, and connect with artists at the First Friday Art Walk in downtown Ridgway. Each month, galleries, studios and retail spaces throw open their doors for receptions, pop-up exhibits, live music and special programming — perfect for art lovers and casual browsers alike. NEW! 🎨🛍️ Shop local. Win local. Celebrate local. 🎶🍷 New this summer, your First Friday stroll through Ridgway could score you a $100 gift card to your favorite local business. 👀 Follow the link for more details. First Friday Map & Offer Details View on site | Email this event",
    pubDate: "2026-09-04T23:00:00.000Z",
    endDate: "2026-10-02",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Downtown Ridgway, CO",
    imageUrl: "https://localist-images.azureedge.net/photos/52941247100302/huge/24aa8ce412f9817ce04becd51e5d1cc5b8db2cad.jpg"
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
    title: "First Friday at Rootwings Art at Rootwings Art",
    link: "https://events.ourayridgwayevents.com/event/first-friday-at-rootwings-art-1540",
    description: "Rootwings Art will be open for Ridgway's First Friday Art Walk, featuring local ceramic sculptures and large vessels by artist Andy Nasisse, original oils by Emma Kalff, Bruce Backer's Ravens & Crows, Taos artist Fred Burns fantasy nudes and one of a kind jewelry and ceramics by Vanessa Backer. View on site | Email this event",
    pubDate: "2026-09-04T23:00:00.000Z",
    endDate: "2026-10-02",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Herran House",
    imageUrl: "https://localist-images.azureedge.net/photos/53312391289791/huge/00a6a9e1834a357256b5925d35f6a6525ff06493.jpg"
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
    imageUrl: "https://localist-images.azureedge.net/photos/53764349683288/huge/471bb8c36dc067ddd9b229c9e31032260184eb5e.jpg"
  },
  {
    title: "September - Art Opening: Social Justice Travel Exhibition",
    link: "https://events.ourayridgwayevents.com/event/art-opening-social-justice-travel-exhibition",
    description: "Art as Witness. Art as Action. A traveling exhibition featuring the work of five artists exploring the urgent issues of our time. Supported by the social justice artist grant program and creative districts across Western Colorado. Five artists. Ten communities. One vision for a more just future. Featured Artists & Collections Aela Morgan | In Pieces Together (Telluride)Mixed-media works exploring political division, civic unrest, and the tension between fracture and connection.Christy Ferrato | Obantu (Durango Creative District)Sculptural figures that confront oppression and resist tyranny, honoring truth, dignity, and the fight for human rights.Cie Hoover | Eroded World (Ridgway FUSE Creative Main Street)A large-scale wood relief on environmental degradation and the inheritance we leave future generations.Jed Smith & Amy Cao | Los Migrantes (Mancos Creative District)Historic narratives and new works sparking conversation on immigration, borders, and who gets to call this land home.Olivia Perea | Too Bad (Durango Creative District)A collage …",
    pubDate: "2026-09-04T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53701474198982/huge/f9179e466383e9846f78d7eb788c2ec155dc6a2b.jpg"
  },
  {
    title: "The Sherbino Presents: Donny Morales – First Friday Show",
    link: "https://events.ourayridgwayevents.com/event/the-sherbino-presents-donny-morales-first-friday-show",
    description: "Sherbino “Living Room” Free Show | Cash Bar | Tips Encouraged Celebrate First Friday with an intimate evening of live music at the Sherbino! Join us in the Sherbino’s cozy “Living Room” near the bar for a special performance by Donny Morales. Donny brings his signature blend of “soul-acousti-funk”, delivering an irresistible mix of soulful vocals, funky rhythms, and masterful acoustic guitar. A longtime favorite on Colorado’s Western Slope, Donny’s performances are equal parts heartfelt storytelling, infectious grooves, and musical spontaneity. Whether he’s reimagining familiar favorites or sharing original songs, his warm stage presence and feel-good energy create an experience that’s impossible not to move to. Come ready to clap, sway, sing along, and enjoy an unforgettable evening of soul, acoustic vibes, and funk. If you love discovering new artists on the rise or simply enjoy a cozy, live-music atmosphere, this is the perfect way to start your weekend. …",
    pubDate: "2026-09-05T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/53358101603318/huge/d6a95490ff2eae257adf6f909e37473c1092b24e.jpg"
  },
  {
    title: "Steps Tavern Presents Karaoke Night",
    link: "https://events.ourayridgwayevents.com/event/steps-tavern-presents-karaoke-night",
    description: "Step's Tavern Presents Karaoke Night. Doors Open at 8:00 PM Every Friday Night View on site | Email this event",
    pubDate: "2026-09-05T02:00:00.000Z",
    endDate: "2026-09-26",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "STEPS TAVERN",
    imageUrl: "https://localist-images.azureedge.net/photos/53142698527493/huge/db3a6ef58a79b18eea8c70a4d583bbf3d9498404.jpg"
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
    description: "Ouray Made's Music and Makers Fest 2026 Join us for our annual Music and Makers Fest, a celebration of creativity and music surrounded by the breathtaking mountain views at Fellin Park in Ouray, CO! We have a fantastic live music line up, food vendors, an art market featuring local and regional makers, as well as a beer tent! Event Highlights: Live Music: 10:30 AM - Apes Nova 12:30 PM - Red Mountain Revival 2:30 PM - The Sweet Lillies 4:30 PM - Cousin Curtiss Artisan Market: Featuring handmade from local and regional makers. Food Truck Alley: Explore a variety of delicious foods from local food trucks. Beer Tent: Grab a refreshment from the MAMS beer tent. We'll have a variety of alcohol and non-alcohol beverages available! …",
    pubDate: "2026-09-06T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Fellin Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53793277001824/huge/c116110eff98984ba8ba5012fad204a327fddfc4.jpg"
  },
  {
    title: "Open Air Market",
    link: "https://events.ourayridgwayevents.com/event/open-air-market",
    description: "Fresh Air & Local Flair The Ouray Open-Air Market is launching this 2026 season at Billy Goat Gruff's Patio (located at 408 Main Street, Ouray, CO). The market will run every Sunday from June 21, 2026, through September 6, 2026, operating from 10:00 AM to 2:00 PM. View on site | Email this event",
    pubDate: "2026-09-06T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Billy Goat Gruff's Patio Patio",
    imageUrl: "https://localist-images.azureedge.net/photos/53744791155044/huge/7870fdaa876bce23bf9db7e6664d294f7d856b0b.jpg"
  },
  {
    title: "Fantasy Football Kickoff - DraftSunday",
    link: "https://events.ourayridgwayevents.com/event/fantasy-football-kickoff-draftsunday",
    description: "The Floating Lotus 2026 Fantasy Football League kicks off Sunday, September 6! We’re building a competitive 8- or 10-team redraft league for experienced fantasy players. Expect full-PPR scoring, FAAB waivers, league-median matchups, two FLEX spots, no kickers, and transparent payouts. Official DraftSunday, September 6, 2026 6:00 PM Mountain TimeOnline through SleeperSnake draft · 90 seconds per pick Applications are free. Once enough managers are confirmed, accepted players will receive the final league details, $50 buy-in request, payout structure, and Sleeper invitation. Nobody pays unless the league has enough committed managers to run. This draft is for confirmed league managers. Interested in a roster spot? Apply here: https://fantasy.floatinglotusbrewery.com Find your flow. Win your week. View on site | Email this event",
    pubDate: "2026-09-07T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/53782367546889/huge/f0ba54fc5c969098eaf29e9a75c1c660d97a6bff.jpg"
  },
  {
    title: "Mojo Birds - Live at Floating Lotus Brewery",
    link: "https://events.ourayridgwayevents.com/event/mojo-birds-live-at-floating-lotus-brewery",
    description: "Mojo Birds formed their funky flock in Durango, Colorado, bringing together musicians from across the country and around the world. The result is a tight-knit, groove-first sound built for celebration—rootsy, soulful, feel-good, with a little Afro-Peruvian spice. Their self-titled debut album, Mojo Birds (released January 2026), was produced by Jano Rix (The Wood Brothers) and engineered by Brook Sutton in Nashville, Tennessee. Recorded largely live in studio, it captures the band’s raw, high-energy built for the stage. View on site | Email this event",
    pubDate: "2026-09-07T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/53659627140416/huge/f7834614852e4bda2fb40a7b3a07c324c6e1ff24.jpg"
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
    title: "Labor Day Parade in Ridgway",
    link: "https://events.ourayridgwayevents.com/event/labor-day-parade-in-ridgway",
    description: "Find your spot along Sherman Street in Ridgway to watch the Labor Day Parade. It'll start at 10am. You'll see things like horseback riders, cowboys, classic vehicles, and more. Stay on the sidewalk if you want to get soaked by the Firetrucks; otherwise, stand further back from the street. The parade kicks off the Ouray County Rodeo at the Ouray County Fairgrounds beginning at noon! View on site | Email this event",
    pubDate: "2026-09-07T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Hartwell Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53745054025330/huge/907904d9f77c544312a94c550a4205ddddb5d06a.jpg"
  },
  {
    title: "Ouray County Labor Day Rodeo",
    link: "https://events.ourayridgwayevents.com/event/ouray-county-labor-day-rodeo-4239",
    description: "The Ouray County Labor Day Rodeo has been running continuously since 1917, making it a historic tradition spanning over a century. Feel the adrenaline rush with daring performances, electrifying action, and nonstop rodeo excitement that will keep you on the edge of your seat! Gates open at 11 a.m. The Rodeo begins at noon. Tickets $15 online or at the gate, Kids 5 & Under Free, Military Free with ID Featured events include: Parade in Ridgway at 10am Bareback riding Mutton Bustin - Ages 3-10 Saddle Bronc Riding Wild Cow Milking Bull Riding Rescue Race Barrel Racing Team Roping Stick Horse Races Steer Wresting, and more! No dogs, please. It is hosted annually by the Ouray County Rodeo Association (a 501c3 Non-Profit Organization) at the Ouray County Fairgrounds in Ridgway, Colorado. Presenting sponsors: RRL Ranch and True Grit Ranch. …",
    pubDate: "2026-09-07T18:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray County Fairgrounds",
    imageUrl: "https://localist-images.azureedge.net/photos/53737685960448/huge/7ed716278e1f9bfa37323fc141bb6dffb17d87f8.jpg"
  },
  {
    title: "Senior Lunch by Neighbor to Neighbor",
    link: "https://events.ourayridgwayevents.com/event/senior-lunch-by-neighbor-to-neighbor",
    description: "Senior Lunch Every Monday Seniors meet to share a wonderful lunch, have a chance to socialize and enjoy an entertaining program. Transportation is provided. Neighbor to Neighbor, 970-325-4586. View on site | Email this event",
    pubDate: "2026-09-07T18:00:00.000Z",
    endDate: "2026-11-02",
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
    pubDate: "2026-09-07T23:00:00.000Z",
    endDate: "2026-11-03",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Ridgway (Old Schoolhouse)",
    imageUrl: "https://localist-images.azureedge.net/photos/52253033564264/huge/ef12b5792bac47932752278d68230c7704389412.jpg"
  },
  {
    title: "Breathe Together",
    link: "https://events.ourayridgwayevents.com/event/breathe-together-9572",
    description: "We explore and practice breath awareness and conscious breathing techniques as doorways to physical and emotional regulation and spiritual growth. Through these practices we also grow our awareness and achieve higher states of consciousness that can help us in our everyday life, relationships, general wellbeing and ultimately reconnect with our higher nature. No previous experience is required. View on site | Email this event",
    pubDate: "2026-09-08T00:15:00.000Z",
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
    pubDate: "2026-09-08T14:15:00.000Z",
    endDate: "2026-10-29",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Ridgway (Old Schoolhouse)",
    imageUrl: "https://localist-images.azureedge.net/photos/53312790468311/huge/860fbc87ce3cc92e25c09e723732d04292df18ba.jpg"
  },
  {
    title: "Monthly Welcome Home Alliance Veteran's Coffee @ The Sherbino",
    link: "https://events.ourayridgwayevents.com/event/monthly-welcome-home-alliance-veterans-coffee-the-sherbino",
    description: "MONTHLY WELCOME HOME ALLIANCE VETERAN’S COFFEE @ THE SHERBINO Every Branch. Every Era. Every Ability. Offering coffee, donuts and camaraderie. Mike Trickey and April Heard will be there bringing information to you on topics such as: Navigating the VA, Housing, Jobs, Volunteer Opportunities, community resources, VA benefits, recreation and mental health. For more information or to offer support (products or monetary), call 970-765-2210 or visit https://www.whafv.org/ Occurs the 2nd Tuesday of Every Month || 10 am - Noon || Free to attend || Vets Only, Please View on site | Email this event",
    pubDate: "2026-09-08T16:00:00.000Z",
    endDate: "2026-10-13",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/52236172073282/huge/134613035140f6c008febe657f2e7e23acc365e9.jpg"
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
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/53629792783415/huge/eed3d96873fce7164fe17bde7c351b81b15d8d79.jpg"
  },
  {
    title: "NEW With Weehawken: Beat & Step: West African Dance, Drum & Body Percussion ~ with performances in The Nutcracker Remixed!",
    link: "https://events.ourayridgwayevents.com/event/new-with-weehawken-beat-step-west-african-dance-drum-body-percussion-with-performances-in-the-nutcracker-remixed",
    description: "Beat & Step: West African Dance, Drum & Body Percussion is an energetic and interactive class that combines traditional West African dance, drumming, and body percussion into one exciting experience. Students will learn dance combinations, explore traditional drumming rhythms that tell stories, and create music using their hands, feet, body, drums, and voice. Along the way, they'll develop coordination, rhythm, musicality, focus, memory, confidence, and teamwork while experiencing the rich cultural traditions of West Africa. No previous dance or music experience is required—just curiosity, energy, and a willingness to learn. Students enrolled in this performance class will showcase what they've learned in our winter production. Dress Code: Students should wear comfortable clothing that allows for plenty of movement. Athletic clothing such as T-shirts, leggings, athletic pants, or shorts is recommended. Please avoid jeans or restrictive clothing. Wear comfortable athletic shoes or sneakers that are clean and reserved for class. …",
    pubDate: "2026-09-09T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Montrose",
    imageUrl: "https://localist-images.azureedge.net/photos/53483890616270/huge/dd89f2f9028ca228db911b8e16c50dc39897358f.jpg"
  },
  {
    title: "Zumba Fitness with Tamra",
    link: "https://events.ourayridgwayevents.com/event/zumba-fitness-with-tamra",
    description: "Zumba is a high-energy, Latin-inspired dance fitness program designed as a fun, accessible workout for all skill levels. It combines fast and slow rhythms with aerobic, interval-training moves to improve cardiovascular health, burn calories, and tone muscles. Classes are often described as a \"fitness party\" that reduces stress. All levels of fitness and dance experience are welcome. Classes are $12 to drop in. Class packs are available for purchase (5 classes for $50, 10 classes for $95). For more information, check out the instructor's website: https://zumba.com/p/zumbafitnesswithTamra or email Tamra at tamra.nichols@icloud.com . For updated class information, including last-minute changes or cancellations, follow the instructor's Zumba Facebook page at https://www.facebook.com/ZumbaFitnesswithTamra . View on site | Email this event",
    pubDate: "2026-09-09T23:30:00.000Z",
    endDate: "2026-10-28",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52277881680293/huge/aa29110a3c05049d073e03408632a25f10e17ba5.jpg"
  },
  {
    title: "OPEN MIC / JAM NIGHT w/ host DJ Strong",
    link: "https://events.ourayridgwayevents.com/event/open-mic-jam-night-w-host-dj-strong",
    description: "Join us every Wednesday at 6 PM for Open Mic Night with DJ Strong at Floating Lotus Brewery. Bring an original song, play a favorite cover, meet other local musicians, or jump into one of our full-band jam sessions. Solo performers, groups, and musicians looking to collaborate are all welcome. Open Mic is also where we discover artists for Floating Lotus Mainstage. Standout performers may be invited back to play a full featured set, creating a path from Open Mic to the Mainstage. Come perform, connect, experiment, or simply enjoy an evening of live local music. Every Wednesday at 6 PM Floating Lotus Brewery View on site | Email this event",
    pubDate: "2026-09-10T00:00:00.000Z",
    endDate: "2026-10-29",
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
    pubDate: "2026-09-10T00:00:00.000Z",
    endDate: "2026-09-17",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Gazebo south of Chipeta Lodge, Ridgway, CO (Or studio if raining)",
    imageUrl: "https://localist-images.azureedge.net/photos/52880886803755/huge/ba2d24fbf09ba1f9a707a06213d60685581d7322.jpg"
  },
  {
    title: "Ouray Economic Development Committee",
    link: "https://events.ourayridgwayevents.com/event/ouray-economic-development-committee",
    description: "The Ouray Economic Development Committee (OEDC) works as the liaison between the City and the local business community. This includes creating and implementing an Economic Development Plan and economic development incentives to best serve the business community and to align with programs that induce private investment enterprises and commerce. The committee also explores regional economic development efforts with the Town of Ridgway and Ouray County as well as is tasked with developing a Business Expansion and Retention (BEAR) program, participating in policy discussions and revisions to community planning documents, and making recommendations to the City Council about economic incentive requests. View on site | Email this event",
    pubDate: "2026-09-10T14:30:00.000Z",
    endDate: "2026-10-08",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52092297170097/huge/a4669339e18604293e5cc63dffd58e4d928eee49.jpg"
  },
  {
    title: "OCAA Art Show: Thomas Livingstone Photography",
    link: "https://events.ourayridgwayevents.com/event/ocaa-art-show-thomas-livingstone-photography",
    description: "Join the Ouray County Arts Association and the Wright Opera House for the opening reception of Historic Treasures of the San Juan Mountains, a photography exhibition by Colorado photographer Thomas Livingstone. Through striking black and white photography, Livingstone documents the historic mines, weathered structures, and forgotten places scattered throughout the San Juan Mountains. The exhibition is drawn from a seven-year photographic project that culminated in his acclaimed book, Historic Treasures of the San Juan Mountains, preserving a remarkable visual record of Colorado's mining heritage. Born in New York and raised in Colorado, Livingstone developed an early appreciation for mountain landscapes before studying at the Brooks Institute of Photography in Santa Barbara. Since opening his Colorado gallery in 2011, his work has been exhibited throughout the state and has earned recognition for its blend of fine art and historic preservation. …",
    pubDate: "2026-09-10T16:00:37.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/53629792987218/huge/6f3a915f33285c3e3da2dbe8c54dfcf731474ba0.jpg"
  },
  {
    title: "Middle School Volleyball: Ouray vs Norwood",
    link: "https://events.ourayridgwayevents.com/event/middle-school-volleyball-ouray-vs-norwood",
    description: "Ouray Middle School will be playing Norwood Middle School @ Ouray View on site | Email this event",
    pubDate: "2026-09-10T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray School",
    imageUrl: "https://localist-images.azureedge.net/photos/53861297432644/huge/0881f9c577bef68a34ca3d7295e47b218cb6980e.jpg"
  },
  {
    title: "Music Bingo",
    link: "https://events.ourayridgwayevents.com/event/music-bingo",
    description: "Music Bingo at Floating Lotus Brewery! Join us on the 2nd & 4th Thursdays from 6-9 PM for a high-energy night of music, drinks, and bingo-style fun. Listen, mark your card, and sing along. Learn more at floatinglotusbrewery.com. View on site | Email this event",
    pubDate: "2026-09-11T00:00:00.000Z",
    endDate: "2026-10-23",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/53790449536989/huge/a7181e9d298980d4c2377db45d06d26bb81e0b12.jpg"
  },
  {
    title: "Ouray Comedy Night",
    link: "https://events.ourayridgwayevents.com/event/ouray-comedy-night",
    description: "Stand-up comedy is coming to Ouray! One night only! Get your tickets now before it's too late! Headliners: Casey Skinner (Netflix, Discovery, HBO Max) and David Uhlfelder (Netflix Is A Joke Fest, ESPN3, Comedy Store) Casey Skinner is a Los Angeles–based stand‑up comedian, writer, and producer whose work bridges the stage and behind the camera. Known for weaving true crime stories, absurd humor, and personal quandaries into his performances, he brings a distinct voice shaped by unexpected experiences and often explores the darker, stranger corners of his life with humor. He’s performed in some of comedy's most iconic venues, including The Comedy Store and The Improv. Casey's work has been featured on Netflix, Discovery, HBO Max, Bravo and more! He was also featured in the 2026 Netflix Is A Joke Fest. David Uhlfelder was raised in the Colorado wilderness. …",
    pubDate: "2026-09-11T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53830617900756/huge/9b913f03ccb0050e92a935ee9d2a464f7fe5b853.jpg"
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
    description: "\"ARIZONA SPLENDOR\" Join Emma Kalff for a morning of coffee and painting at the Wright Opera House Community Room. Participants will follow along with a classic Bob Ross episode and create their own Bob Ross–style landscape painting. All supplies are included, and no prior painting experience is necessary. Just bring your curiosity and enjoy a relaxed, creative morning inspired by the joy of painting. FULL SCHEDULE April 11 — Horizons West May 9 — Barn at Sunset June 13 — LIttle House by the Road July 11 — Mountain Splendor August 8 — Quiet Woods September 12 — Arizona Splendor October 3 — Meadow Stream November 14 — Lonely Retreat December 12 — Snow Trail Part of Classes @ the Wright, bringing creativity, learning, and community together in downtown Ouray since Letitia Wright first dreamed it up. View on site | Email this event",
    pubDate: "2026-09-12T10:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/53644731506912/huge/89ae9ae8e058db83a936dd643f6af477841cd019.jpg"
  },
  {
    title: "Dallas Park Cemetery Tour",
    link: "https://events.ourayridgwayevents.com/event/dallas-park-cemetery-tour",
    description: "Tour of Dallas Park Cemetery Tour, led by Coleen McElroy. $20.00 Per Person. $15.00 OCHS Members. Call 970-325-4576 to RSVP/Pre Pay View on site | Email this event",
    pubDate: "2026-09-12T16:00:00.000Z",
    endDate: "2026-10-10",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Dallas Park Cemetery",
    imageUrl: "https://localist-images.azureedge.net/photos/52462667793124/huge/857907efd93056a1ba298d906bd6d5231a5f9d13.jpg"
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
    title: "Zumbathon for Second Chance",
    link: "https://events.ourayridgwayevents.com/event/zumbathon-for-second-chance",
    description: "We are happy to announce our 2nd Annual Zumbathon (Charity Dance Benefit) for Second Chance Humane Society. Date: Sept 12 Time: 10 am-1 pm, doors open at 9:30 am (arrive early)Location: Montrose Rec CenterCost $20 (gets you into the Rec Center and the event. All of the money goes to Second Chance!)Pet themed (costumes encouraged)Instructors: Tamra Evangelista, Eloisa McManaman, Cindy Distel, Rebecca Reichard, Alison Malone, and introducing Libby TenerOther info: There will be a bunch of awesome raffles, donated by local businesses and individuals, to win. Please bring cash to purchase raffle tickets if you can! Venmo will also be available. If you arrive in costume, you will receive a free raffle ticket.If you pre-register with Second Chance, you will also receive a free raffle ticket upon arrival.To pre-register, please go to: https://secondchancehumane.org/events/zumbathon-charity-fun-raiser This is a 3-hour event; however, we will not be dancing for the full three hours. …",
    pubDate: "2026-09-12T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Montrose Recreational District",
    imageUrl: "https://localist-images.azureedge.net/photos/53808943751530/huge/be9cd2397aa33916151e9c89974ac88ff07ec836.jpg"
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
    title: "The Collective | Autumnal Social",
    link: "https://events.ourayridgwayevents.com/event/the-collective-autumnal-social",
    description: "Libations provided. Burgers 6:30 to 8p + potluck side dishes. Live music by Organtic around 7p. All are welcome, family friendly, come as you are. View on site | Email this event",
    pubDate: "2026-09-12T23:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Collective",
    imageUrl: "https://localist-images.azureedge.net/photos/53833846000120/huge/2162ad8b46f2ffddbfcc7c582f8094a884e90675.jpg"
  },
  {
    title: "Happy's Birthday w/ Chromatic Cowboy - Live at Floating Lotus Brewery",
    link: "https://events.ourayridgwayevents.com/event/happys-birthday-w-chromatic-cowboy-live-at-floating-lotus-brewery",
    description: "Happy’s Birthday has carved out a unique space in the Los Angeles music community by providing theatrical performances with whimsical and vidid story telling. Their unique sound combines elements of folk and indie with the bite of post hardcore and experimental rock to create a colorful and zany array of songs. View on site | Email this event",
    pubDate: "2026-09-13T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/53660243978511/huge/0d850e6e74677d6cc9089c2193c88214448d54ea.jpg"
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
    title: "Britley & Matt",
    link: "https://events.ourayridgwayevents.com/event/britley-matt-349",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-09-13T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
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
    title: "Middle School Volleyball: Ouray vs Centennial",
    link: "https://events.ourayridgwayevents.com/event/middle-school-volleyball-ouray-vs-centennial",
    description: "Ouray Middle School plays Centennial Middle School @ Ouray View on site | Email this event",
    pubDate: "2026-09-15T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray School",
    imageUrl: "https://localist-images.azureedge.net/photos/53861527126164/huge/f25eb4c3e140a86cc61c64c128fd96a5d907b670.jpg"
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
    title: "Decker Room New Volunteer Orientation",
    link: "https://events.ourayridgwayevents.com/event/decker-room-new-volunteer-orientation",
    description: "Join our wonderful volunteer team at the Decker! If you would like to help with Gallery Sitting during open hours, events, and more, please attend a New Volunteer Orientation to get started! You'll learn about the Decker Room and the events and programs that take place here. Volunteers should be able to commit to consistent volunteer hours each month! Email decker@ridgwayfuse.org for info and to RSVP. View on site | Email this event",
    pubDate: "2026-09-15T22:30:00.000Z",
    endDate: "2026-10-20",
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
    pubDate: "2026-09-15T23:30:00.000Z",
    endDate: "2026-10-20",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/52305506266326/huge/6e40de5340fac46ca9bf9f33e9c31ed9ab5985ce.jpg"
  },
  {
    title: "Native Rhythms, Native Jazz: R. Carlos Nakai, AmoChip Dabney, & Will Clipman – at the Montrose Pavilion",
    link: "https://events.ourayridgwayevents.com/event/native-rhythms-native-jazz-r-carlos-nakai-amochip-dabney-will-clipman-at-the-montrose-pavilion",
    description: "Doors at 6:00 PM; show at 6:30 PM. The Sherbino and Weehawken Creative Arts present R. Carlos Nakai, AmoChip Dabney and Will Clipman at the Montrose Pavilion. The trio brings Native American flute together with jazz, world percussion and contemporary soundscapes in a genre-crossing performance rooted in tradition and improvisation. Nakai is an acclaimed Native American flutist and 11-time Grammy nominee; Dabney and Clipman add multi-instrumental and percussion artistry. Tickets: $25 advance general admission, $30 advance reserved seating, $32 general admission day of show. View on site | Email this event",
    pubDate: "2026-09-16T00:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Montrose Pavilion",
    imageUrl: "https://localist-images.azureedge.net/photos/53693235946239/huge/0f1ea37ac1cf168d15be34057cbc7d78b1368e42.jpg"
  },
  {
    title: "Ouray HS Volleyball vs De Beque",
    link: "https://events.ourayridgwayevents.com/event/ouray-hs-volleyball-vs-de-beque",
    description: "Ouray High School Volleyball will be playing De Beque @ Ouray HS View on site | Email this event",
    pubDate: "2026-09-16T10:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray School",
    imageUrl: "https://localist-images.azureedge.net/photos/53861825122366/huge/bd563b6fd4c272468a52f44be10f353adfc067ae.jpg"
  },
  {
    title: "TODDLER STORYTIME ART FOR AGES 2.5-5",
    link: "https://events.ourayridgwayevents.com/event/toddler-storytime-art-for-ages-25-5",
    description: "TODDLER STORYTIME ART FOR AGES 2.5-5 Wednesdays, 10:00am–11:00am Cora Annex, 145N Cora St, Ridgway Registration: www.weehawkenarts.org Session 1 (4 weeks • $70): September 16 – October 7 Session 2 (4 weeks • $70): October 21 – November 11 Session 3 (3 weeks • $55): December 2 – December 16 * Multi-session discount: Sign up for multiple fall semester sessions at once and receive $10 off each session! Come join us for Storytime + Art! Each week, your child will enjoy story time with songs and finger rhymes, a process‑art project, and a variety of creative sensory play. We end with a quick cleanup, circle time, and movement songs. This class gently supports preschool prep and helps your child develop important school‑readiness skills—such as fine‑motor coordination, independence, and the ability to listen and follow directions—in a warm, supportive setting. …",
    pubDate: "2026-09-16T16:00:00.000Z",
    endDate: "2026-10-07",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/53780434962919/huge/3aff831f26d7f9d4824893f89d8fd88416047a44.jpg"
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
    imageUrl: "https://localist-images.azureedge.net/photos/53629792783415/huge/eed3d96873fce7164fe17bde7c351b81b15d8d79.jpg"
  },
  {
    title: "AFTER SCHOOL ART FOR AGES 8-12",
    link: "https://events.ourayridgwayevents.com/event/afterschool-artfor-ages-8-12",
    description: "AFTER SCHOOL ART FOR AGES 8-12 Wednesdays, 3:15–4:45 pm Cora Annex, 145N Cora St, Ridgway Registration: www.weehawkenarts.org Session 1 (4 weeks • $85): September 16 – October 7Session 2 (4 weeks • $85): October 21 – November 11Session 3 (3 weeks • $70): December 2 – December 16Each week, students will explore an exciting theme while experimenting with a wide range of materials and techniques. Drawing inspiration from well-known artists and design styles, young artists will be supported in discovering their own unique creative voice in a fun, nurturing, studio-like setting. These classes are designed to foster a love of the arts through hands-on exploration, age-appropriate projects, and a focus on the joy of the creative process. A student art reception will be held in December. Students will take home their collected works in the days following the event. …",
    pubDate: "2026-09-16T21:15:00.000Z",
    endDate: "2026-10-07",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/53780624349826/huge/2ad5a3657f19d47b14c7833f838ac040c0836f38.jpg"
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
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/53759764782802/huge/dc7e273f56ef01d450bc75d4e9c24bb9c5c68230.jpg"
  },
  {
    title: "AFTER SCHOOL ART FOR AGES 5-8",
    link: "https://events.ourayridgwayevents.com/event/afterschool-artfor-ages-5-8",
    description: "AFTER SCHOOL ART FOR AGES 5-8 Thursdays, 3:15–4:30 pm Cora Annex, 145N Cora St, Ridgway Registration: www.weehawkenarts.org Session 1 (4 weeks • $85): September 17 – October 8Session 2 (4 weeks • $85): October 22 – November 12Session 3 (3 weeks • $70): December 3 – December 17Each week, students will explore exciting themes and projects while experimenting with a wide variety of art materials—such as watercolor and acrylic paints, oil and chalk pastels, clay, collage, printmaking, and more. Through open-ended projects, students are encouraged to explore their creativity, make artistic choices, take creative risks, and discover their unique artistic voice. Our classes nurture imaginative thinking and storytelling, helping children express big ideas and emotions through visual narratives and personal creations. In addition to sparking imagination, our signature art projects support the development of fine motor skills, confidence, and social-emotional development in a fun group environment. …",
    pubDate: "2026-09-17T21:15:00.000Z",
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
    description: "Trivia Night at Floating Lotus Brewery! Join us on the 1st & 3rd Thursdays from 6-9 PM for a lively night of questions, drinks, and friendly competition. Grab a table, bring your team, and learn more at floatinglotusbrewery.com. View on site | Email this event",
    pubDate: "2026-09-18T00:00:00.000Z",
    endDate: "2026-10-16",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/53790516346797/huge/599d1a7013ddde307592e7dfc9b892fe265527e0.jpg"
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
    title: "Emergency Go Kit Assembly Project at the Telluride Blues and Brews Festival at Town Park",
    link: "https://events.ourayridgwayevents.com/event/emergency-go-kit-assembly-project-at-the-telluride-blues-and-brews-festival",
    description: "Spend 15 minutes at the Festival helping to assemble Emergency Go Kits to be distributed for free to vunerable families in Ouray, Montrose and San Miguel Counties. Sponsored by Ouray, Montrose and San Miguel County Emergency Management, the Telluride Foundation, and local nonprofits. Share the gift of preparedness! View on site | Email this event",
    pubDate: "2026-09-18T18:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "the Festival",
    imageUrl: "https://localist-images.azureedge.net/photos/53853077811116/huge/8e41947484ff02c59861ff15f9c199d0f9076964.jpg"
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
    title: "Talon Talk: Ridgway State Park Summer Program Series",
    link: "https://events.ourayridgwayevents.com/event/talon-talk-ridgway-state-park-summer-program-series",
    description: "Come experience the raw power and beauty of nature's most skilled hunters! Join us for a captivating evening as Nature's Educators brings their incredible live raptors to Ridgway State Park for an up-close encounter you won't want to miss. This Live Raptor Viewing program offers a rare, exhilarating encounter with the \"kings of the sky\" in a stunning outdoor setting. It’s more than just a viewing; it’s an educational deep-dive into the vital role these predators play in maintaining the health of our local environment. View on site | Email this event",
    pubDate: "2026-09-19T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway State Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53702771968357/huge/e53b021369f111f5d927b10fb43889fa856f6d5f.jpg"
  },
  {
    title: "Ouray Mountain Trail Run",
    link: "https://events.ourayridgwayevents.com/event/ouray-mountain-trail-run",
    description: "13-mile trail run around the perimeter of Ouray. With approx 4000 ft of total elevation gain, runners will run past the dinosaur tracks, across the box canyon, past the ice park & via feratta, up into the amphitheater, and past the Cascade Canyon Falls to finish up in historic Fellin Park. This is a fundraiser for the Ouray School, hosted by the school's parent and teacher organization, PATT, and the high school Outdoor Education Class. We support teachers by providing funding for activities that get students out of the classroom and into the wider world. View on site | Email this event",
    pubDate: "2026-09-19T13:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Fellin Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53845081366165/huge/81169ec498ed88b72ba4159faa91cff1827d17f7.jpg"
  },
  {
    title: "\"llumination! Learning to Use Light, Shadow & Color in Acrylic Landscapes\" with Wayne McKinzie",
    link: "https://events.ourayridgwayevents.com/event/llumination-learning-to-use-light-shadow-color-in-acrylic-landscapeswith-wayne-mckinzie",
    description: "\"llumination! Learning to Use Light, Shadow & Color in Acrylic Landscapes\" with Wayne McKinzie September 19th, 10:00am-2:30pm (incl. a 30min. lunch break) Cora Annex, Ridgway Tuition: $70 Registration: www.weehawkenarts.org Join acclaimed landscape artist Wayne McKinzie for a unique \"Paint with Wayne\" experience. Rather than a traditional painting class, everyone will paint the same landscape alongside Wayne, giving you a front-row seat to his creative process from start to finish. Each participant will receive an 8\" x 10\" primed panel and will work step-by-step with Wayne as he demonstrates how he uses light, shadow, color, brushwork, and composition to bring a landscape to life. Throughout the class, students are encouraged to ask questions, observe his techniques in real time, and gain insight into the artistic decisions that go into creating an original painting. …",
    pubDate: "2026-09-19T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/53780308794900/huge/41691d46e1e475e3b5f20b3e40f3c8218e5b1c84.jpg"
  },
  {
    title: "Ouray HS Volleyball vs Mancos",
    link: "https://events.ourayridgwayevents.com/event/ouray-hs-volleyball-vs-mancos",
    description: "Ouray highschool will be playing Mancos @ Ouray View on site | Email this event",
    pubDate: "2026-09-19T17:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray School",
    imageUrl: "https://localist-images.azureedge.net/photos/53861933199264/huge/a6b3ed3547c7583cd9c727f1be07b81f6be27814.jpg"
  },
  {
    title: "Colona Community Church’s Annual Harvest Dinner",
    link: "https://events.ourayridgwayevents.com/event/colona-community-churchs-annual-harvest-dinner-6308",
    description: "Live Music. Come join us for Fun, Food, & Fellowship. Celebrating 114 years! Free to All. 😀 View on site | Email this event",
    pubDate: "2026-09-19T21:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Colona Stockyard across from the church",
    imageUrl: "https://localist-images.azureedge.net/photos/53722349858154/huge/934ef243440a192b17a6d756428b9bac45537d94.jpg"
  },
  {
    title: "BRITLEY & MATT",
    link: "https://events.ourayridgwayevents.com/event/britley-matt-9126",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-09-20T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
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
    title: "Storytime with a Hero",
    link: "https://events.ourayridgwayevents.com/event/storytime-with-a-hero",
    description: "Join us at the Ouray Library from 4:00 p.m. to 4:45 p.m. to listen to some fantastic stories read by a Mountain Rescue volunteer! Ages: Elementary View on site | Email this event",
    pubDate: "2026-09-22T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Public Library",
    imageUrl: "https://localist-images.azureedge.net/photos/53879311682989/huge/6f8aa554a36ad64daa06ec94d85b3b980a8c0a3f.jpg"
  },
  {
    title: "Tourism Advisory Committee",
    link: "https://events.ourayridgwayevents.com/event/tourism-advisory-committee",
    description: "The Ouray Tourism Advisory Committee (TAC) represents a cross-section of the small businesses, nonprofits, and residents of Ouray. We educate ourselves about best practices in the tourism industry, tourism marketing, and the visitor experience. We gather input, plan, prioritize, measure, and advise the City of Ouray on the best actions to take related to the tourism industry in our community. View on site | Email this event",
    pubDate: "2026-09-22T23:30:00.000Z",
    endDate: "2026-10-27",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52092171660517/huge/0e628304026c92db25e8df01849c962ac902a3b4.jpg"
  },
  {
    title: "Postponed: Sep 22, 2026: Community Meditation",
    link: "https://events.ourayridgwayevents.com/event/community-meditation",
    description: "Meditation night on July 14 has been postponed. The rescheduled July date will be posted here when it is known. Thank you for your understanding. Join us for a peer-led weekly meditation series at the Decker Community Room. Free and open to the public! We meet every 1st, 2nd, and 4th Tuesday of the month (all but the 3rd Tuesday!) View on site | Email this event",
    pubDate: "2026-09-23T00:30:00.000Z",
    endDate: "2026-10-28",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/52338340283147/huge/582622671001d9ab20f8c25a5d229c9ecbbba165.jpg"
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
    imageUrl: "https://localist-images.azureedge.net/photos/53629792783415/huge/eed3d96873fce7164fe17bde7c351b81b15d8d79.jpg"
  },
  {
    title: "September Book Club: \"The Constant Gardener\"",
    link: "https://events.ourayridgwayevents.com/event/september-book-club-the-constant-gardener",
    description: "Join us on Wednesday, September 23rd at 5:00 p.m. to discuss our September Book Club Book, The Constant Gardener, by John le Carré. View on site | Email this event",
    pubDate: "2026-09-23T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Public Library",
    imageUrl: "https://localist-images.azureedge.net/photos/53764141935106/huge/5fea0efc9d4b56f2aa50cae11c356177b92bea0e.jpg"
  },
  {
    title: "Creative Space: Artist Salon Series",
    link: "https://events.ourayridgwayevents.com/event/creative-space-artist-salon-series",
    description: "AUGUST EDITION: MAKING YOUR MARK WITH JULIA REID (re)discover your own creativity with this hands-on artist talk and demonstration. Mark making without expectation or ego frees the latent artist in all of us. Join us in welcoming Julia Reid, local artist and creator of Chicago's celebrated\"Around the Coyote\" art festival. Materials provided. Free. Snacks! Please bring food or drinks to share! Inspired by our vibrant creative community, these monthly events are intended to build creative community across disciplines! With a different focus each time, we will keep things interesting and engaging! Anyone is welcome to attend, and creatives of all kinds are invited to give talks and demonstrations. We welcome your ideas for future events! To learn more or suggest a topic, reach out to the Decker Room Coordinator, Arielle. decker@ridgwayfuse.org 872-772-9484 View on site | Email this event",
    pubDate: "2026-09-24T00:00:00.000Z",
    endDate: "2026-10-29",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53738040069217/huge/449549e29368908fd534c31a53bcd1a1adc7b887.jpg"
  },
  {
    title: "Ouray Chamber Business After Hours",
    link: "https://events.ourayridgwayevents.com/event/ouray-chamber-business-after-hours-9080",
    description: "IT'S BEEN A HECK OF A SUMMER! After taking a break over the summer months, the Ouray Chamber invites you to join us for our September Business After Hours! Isabella Geyer will be hosting in her home, on behalf of her business Ouray Counseling and Chantelle's business High Country Helpers! It will be great to have the community back together to share stories, hang out, and enjoy a bite and a beverage! There will be multiple giveaways, so don't miss out! View on site | Email this event",
    pubDate: "2026-09-24T23:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "636 Main Street",
    imageUrl: "https://localist-images.azureedge.net/photos/53799978983659/huge/ea52c8e358b57e26f19a76695d4ac28e6c8ed0a3.jpg"
  },
  {
    title: "Watercolor & Wine with Katey Fetch: \"Paint the Peaks\"",
    link: "https://events.ourayridgwayevents.com/event/watercolor-wine-with-katey-fetch-paint-the-peaks",
    description: "Watercolor & Wine with Katey Fetch: Paint the Peaks Date: Thursday, September 24 Time: 6:00–8:00 PM Location: Cora Annex, Ridgway Tuition: $49 incl. a beverage and all supplies Registration: www.weehawkenarts.org Whether you’ve never picked up a paintbrush or you’re looking to sharpen your skills, you’ll learn basic watercolor techniques, color flowing, layering, and tips and tricks while enjoying your favorite beverage. There are no mistakes here—just creativity, laughter, and a chance to slow down and make something uniquely your own. A beverage and all supplies are included. About the Instructor: Katey Fetch Katey Fetch hails from a small town in Colorado, where she continues to learn how to be an artist. Though she went to art school, she took a long hiatus from art and is in the midst of rediscovering what art means to her. Her favorite mediums are graphite pencil and watercolor. …",
    pubDate: "2026-09-25T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/53780354578802/huge/20de7f4389a6dc490aa55564b6fb62fa7b8e05b8.jpg"
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
    title: "Exploring Cyanotype with Angela LeClair",
    link: "https://events.ourayridgwayevents.com/event/exploring-cyanotype-with-angela-leclair",
    description: "Exploring Cyanotype with Angela LeClair September 26th, 10am-Noon Cora Annex, Ridgway Tuition: $60 Discover the magic of alternative photography in this beginner-friendly, hands-on workshop! Learn how to create beautiful cyanotype prints using light-sensitive chemicals, sunlight, and altering the classic blue hues using natural botanical toning agents. You’ll learn the basics of coating watercolor paper, arranging flowers, leaves, lace, or negatives, and exposing your designs to UV light to create the classic cyanotype blue. Then, experiment with natural botanical toning techniques using coffee and tea to transform your prints into rich sepia, charcoal, grey, and eggplant tones. Each student will create their own finished project and can choose between an 8×10 glass frame or wood slices for creating botanical ornaments. What to Bring: Optional: 3–5 flat objects such as pressed flowers, leaves, feathers, lace, or other items to incorporate into your prints. A variety of materials will also be provided. …",
    pubDate: "2026-09-26T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/53799659802012/huge/c2927afcf6407147c343bd4295145b709ec447bd.jpg"
  },
  {
    title: "National Public Lands Day Campsite Cleanup - Ironton",
    link: "https://events.ourayridgwayevents.com/event/national-public-lands-day-campsite-cleanup-ironton",
    description: "This National Public Lands Day, join San Juan Moutains Association for our Ironton Valley Campsite Cleanup! We’ll have some friendly competition to see who can collect the most litter, artistically naturalize a fire ring, find the most interesting piece of trash, etc. No experience is necessary and kids are welcome. Help keep America’s Public Lands beautiful and healthy. View on site | Email this event",
    pubDate: "2026-09-26T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ironton Park \"Staging Area\"",
    imageUrl: "https://localist-images.azureedge.net/photos/53737767968998/huge/e72d7dc21b85f92782e5ed31ef6a68173f7066be.jpg"
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
    title: "Mountain Girl Gallery Fall Fiesta",
    link: "https://events.ourayridgwayevents.com/event/mountain-girl-gallery-fall-fiesta",
    description: "Let's celebrate Fall! Join us for live music, good times and fresh local art! Walter St. Clair will be playing tunes on the porch and the vibes will be high. View on site | Email this event",
    pubDate: "2026-09-26T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Mountain Girl Gallery",
    imageUrl: "https://localist-images.azureedge.net/photos/53799469848261/huge/e6d1ccd4114025feaf8eb83d7e37cd545eb81420.jpg"
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
    title: "Slap Dragon ~ Live at the Sherbino",
    link: "https://events.ourayridgwayevents.com/event/slap-dragon-live-at-the-sherbino",
    description: "Doors at 7:00 PM; show at 7:30 PM. The Sherbino and Pickin' Productions welcome Slap Dragon, a Nashville-based band blending acoustic funk, bluegrass, R&B, disco energy, improvisation and sharp songwriting. Expect soulful vocals, acoustic instrumentation, danceable grooves and a joyful, high-energy live show. This is primarily a standing-room dancehall show with limited seating and a limited number of reserved tables. All ages. Tickets: $28 advance / $32 day of show. View on site | Email this event",
    pubDate: "2026-09-28T01:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/53693260359887/huge/4d3201be3b01f5eb6d9920a6793bf0d6b3b4400c.jpg"
  },
  {
    title: "Colorado Poet Laureate: Crisosto Apache Reading",
    link: "https://events.ourayridgwayevents.com/event/colorado-poet-laureate-crisosto-apache-reading",
    description: "Join us in the Ouray School APAC at 1:30 p.m. to listen to a poetry reading by the Colorado Poet Laureate, Crisosto Apache! Open to the Public View on site | Email this event",
    pubDate: "2026-09-29T19:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray School",
    imageUrl: "https://localist-images.azureedge.net/photos/53816408650430/huge/03e52865d13accd44bfe2d41810a8a214024c424.jpg"
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
    imageUrl: "https://localist-images.azureedge.net/photos/53629792783415/huge/eed3d96873fce7164fe17bde7c351b81b15d8d79.jpg"
  },
  {
    title: "COUSIN CURTIS",
    link: "https://events.ourayridgwayevents.com/event/cousin-curtis",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
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
    description: "Containment is an exhibition of mixed-media clay sculptures and assemblage by Michelle Montague of Ridgway, Colorado. Through tactile forms, layered materials, and carefully constructed scenes, Montague explores themes of vulnerability, perspective, angst, and hope. ARTIST RECEPTION: FIRST FRIDAY, OCTOBER 2ND • 5–7 PM On Display: SEPTEMBER 29 – OCTOBER 30, 2026 View on site | Email this event",
    pubDate: "2026-10-02T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The 610 Arts Collective",
    imageUrl: "https://localist-images.azureedge.net/photos/53693053505919/huge/8a780ff6c8312fd2ff43dfb21dd65bcccea56d49.jpg"
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
    endDate: "2026-10-29",
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
  },
  {
    title: "Parks and Recreation Committee (PARC)",
    link: "https://events.ourayridgwayevents.com/event/parks-and-recreation-committee-parc",
    description: "The Parks and Recreation Committee (PARC) is made up of community members who volunteer their time to support and enhance recreational opportunities in Ouray. PARC organizes safe, family-friendly events that bring the community together. Events include Broomball, Cabin Fever Days, Dodgeball, Softball, and Game Night, among others. The committee works closely with local organizations, businesses, and other City committees to carry out its mission. Community partners include the Ouray Hot Springs Pool & Fitness Center, the Beautification Committee, and the Ouray School District. PARC also plays an important role in developing and implementing master plans for the City’s park system, helping ensure that Ouray’s parks and recreational spaces serve residents and visitors for years to come. Members of the public are welcome to attend these meetings. Meetings: PARC meets monthly on the first Tuesday at 6:00 p.m. …",
    pubDate: "2026-10-07T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/51579968896083/huge/c4cfc0e9259666342735abc334be44580e4c7198.jpg"
  },
  {
    title: "Beautification Committee (OBC)",
    link: "https://events.ourayridgwayevents.com/event/beautification-committee",
    description: "The Beautification Committee (OBC) works on projects to help beautify the community. The committee oversees the installation of all the flower gardens in the City as well as all the hanging baskets and plantings on Main Street. They have also worked hard over the years to acquire many historic mining pieces and equipment that are displayed throughout the community to recognize Ouray's mining heritage. The committee has also provided direction on signage, light poles, and benches on the public rights of way. The Beautification Committee also plays an important role in developing and implementing master plans for the City’s park system. The committee makes recommendations to the City Council on these many beautification projects as well as the use of dollars from the Beautification Fund. This fund is supported by a portion of the Lodging Occupation Tax and is used exclusively for projects that help beautify the community. …",
    pubDate: "2026-10-07T14:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center, San Juan Room",
    imageUrl: "https://localist-images.azureedge.net/photos/50382168464273/huge/9567987a01fc4f1da8e171fabd1eb5b7bdbdccfa.jpg"
  },
  {
    title: "Ice Park Advisory Team",
    link: "https://events.ourayridgwayevents.com/event/ice-park-advisory-team",
    description: "The Ice Park Advisory Team (IPAT) Opens in new window was created to provide an informal, good-faith forum for discussion about the future and ongoing management of the Ouray Ice Park. IPAT serves as a space for the Parties and any interested community members to come together and talk through topics that impact the Ice Park, including: Management and operationsPark usage and recreational interestsCommercial interests and guiding considerationsCapital planning and long-term strategic planningSuccession planning and sustainabilityMission, vision, and valuesEconomic impact to the communityUnforeseen issues as they arise View on site | Email this event",
    pubDate: "2026-10-07T23:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/51579968896083/huge/c4cfc0e9259666342735abc334be44580e4c7198.jpg"
  },
  {
    title: "WOWZERS",
    link: "https://events.ourayridgwayevents.com/event/wowzers",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-10-09T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Nature in Four Seasons: Growing Dormant",
    link: "https://events.ourayridgwayevents.com/event/nature-in-four-seasons-growing-dormant",
    description: "Are you interested in connecting with the landscapes of Ouray? Do you wish for a fun and engaging exploration that you can share with your family? Join SJMA in Ouray for the fourth exploration hike of the Nature in Four-Season series. For our fall exploration, we will investigate how, as days grow shorter, mountain species are in full gear to prepare for winter. Come witness these changes and find fun and creative ways to capture the color of the season using Naturalist Journal activities. View on site | Email this event",
    pubDate: "2026-10-10T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Visitor Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52948888142369/huge/a751aa96f77dfb66351272d701cd748a3cc4bdbc.jpg"
  },
  {
    title: "Mineral Identification Workshop for Adults",
    link: "https://events.ourayridgwayevents.com/event/mineral-identification-workshop-for-adults",
    description: "Basic identification of minerals from the San Juan Mountains with Robert Stoufer View on site | Email this event",
    pubDate: "2026-10-10T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray County Historical Society Research Center and Archive",
    imageUrl: "https://localist-images.azureedge.net/photos/52278239272831/huge/3ace3fbbfa379d963003cda93eba859d285b4dcd.jpg"
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
    title: "Fall Break - Ridgway Schools",
    link: "https://events.ourayridgwayevents.com/event/fall-break-ridgway-schools",
    description: "View on site | Email this event",
    pubDate: "2026-10-12T06:00:00.000Z",
    endDate: "2026-10-16",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52196842516113/huge/34c03f502c2e6b24c2bdceae7a155d7b6d463e8f.jpg"
  },
  {
    title: "TYLER SIMMONS",
    link: "https://events.ourayridgwayevents.com/event/tyler-simmons-4776",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-10-13T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "ALPINE JAM",
    link: "https://events.ourayridgwayevents.com/event/alpine-jam-3576",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-10-16T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "TODDLER STORYTIME ART FOR AGES 2.5-5",
    link: "https://events.ourayridgwayevents.com/event/toddler-storytimeartfor-ages-2-5",
    description: "TODDLER STORYTIME ART FOR AGES 2.5-5 Wednesdays, 10:00am–11:00am Cora Annex, 145N Cora St, Ridgway Registration: www.weehawkenarts.org Session 1 (4 weeks • $70): September 16 – October 7Session 2 (4 weeks • $70): October 21 – November 11Session 3 (3 weeks • $55): December 2 – December 16Come join us for Storytime + Art! Each week, your child will enjoy story time with songs and finger rhymes, a process‑art project, and a variety of creative sensory play. We end with a quick cleanup, circle time, and movement songs. This class gently supports preschool prep and helps your child develop important school‑readiness skills—such as fine‑motor coordination, independence, and the ability to listen and follow directions—in a warm, supportive setting. Children will grow in: Social, language, and communication skillsFine‑ and gross‑motor coordinationListening and direction‑following abilitiesConfidence, creativity, and imaginationParents and caregivers stay to support their child—but we handle the mess! …",
    pubDate: "2026-10-21T16:00:00.000Z",
    endDate: "2026-10-28",
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
    endDate: "2026-10-28",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/53780624349826/huge/2ad5a3657f19d47b14c7833f838ac040c0836f38.jpg"
  },
  {
    title: "AFTER SCHOOL ART FOR AGES 5-8",
    link: "https://events.ourayridgwayevents.com/event/afterschool-artfor-ages-5-8-6970",
    description: "AFTER SCHOOL ART FOR AGES 5-8 Thursdays, 3:15–4:30 pm Cora Annex, 145N Cora St, Ridgway Registration: www.weehawkenarts.org Session 1 (4 weeks • $85): September 17 – October 8Session 2 (4 weeks • $85): October 22 – November 12Session 3 (3 weeks • $70): December 3 – December 17Each week, students will explore exciting themes and projects while experimenting with a wide variety of art materials—such as watercolor and acrylic paints, oil and chalk pastels, clay, collage, printmaking, and more. Through open-ended projects, students are encouraged to explore their creativity, make artistic choices, take creative risks, and discover their unique artistic voice. Our classes nurture imaginative thinking and storytelling, helping children express big ideas and emotions through visual narratives and personal creations. In addition to sparking imagination, our signature art projects support the development of fine motor skills, confidence, and social-emotional development in a fun group environment. …",
    pubDate: "2026-10-22T21:15:00.000Z",
    endDate: "2026-10-29",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/53780725919104/huge/846566299e8e325221de54dd5a54a0fd6427fbf5.jpg"
  },
  {
    title: "Pumpkins & Flowers at The Adobe Inn with San Juan Blooms!",
    link: "https://events.ourayridgwayevents.com/event/pumpkins-flowers-at-the-adobe-inn-with-san-juan-blooms",
    description: "An evening of Pumpkins & Flowers at The Adobe Inn! Kick off fall with a little hands-on flower arranging. Join San Juan Blooms for our Pumpkins + Flowers Workshop, where you’ll sip a cocktail, enjoy delicious appetizers, and build your own seasonal centerpiece using fresh autumn blooms and local pumpkins. Event Details When: Thursday, October 22, 2026 | 6:00 PM – 9:00 PM Where: The Adobe Inn - Ridgway, CO Tickets: $85 per person What’s Included: All supplies, fresh flowers, and prepped pumpkins Bites and appetizers throughout the evening One drink (cocktails, mocktails, beer, or wine) View on site | Email this event",
    pubDate: "2026-10-23T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Adobe Inn",
    imageUrl: "https://localist-images.azureedge.net/photos/53853672137353/huge/5d72d8d4bb7838f935a11a5d61d599e6d3719f6b.jpg"
  },
  {
    title: "4th Annual Boo-Mont Halloween Ball",
    link: "https://events.ourayridgwayevents.com/event/4th-annual-boo-mont-halloween-ball",
    description: "Get ready for the 4th Annual Boo-Mont Halloween Ball at the historic Beaumont Hotel in Ouray, Colorado! Come dressed to impress, scare, or simply make a statement! The evening will feature a costume contest with prizes, a DJ, spooky drink specials, a cash bar, and delicious hors d'oeuvres. 🎭 Costume Contest 🎶 DJ 🍸 Cash Bar + Spooky Drink Specials 🥂 Hors d'oeuvres 👻 Halloween Fun All Night 🎟️ Tickets are on sale now! Tickets are limited, so don't wait to get yours. 18 and up only. Must show valid ID at the door. Get ready for a night of costumes, cocktails, music, and Halloween magic at the Beaumont. View on site | Email this event",
    pubDate: "2026-10-25T02:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Beaumont Hotel & Spa",
    imageUrl: "https://localist-images.azureedge.net/photos/53860846025163/huge/937b6538c82ba8eff32aac54b7325895b4cde3f4.jpg"
  },
  {
    title: "Sherb Literary Living Room featuring Pam Houston with her new book: \"Animals Taught Me Everything\"",
    link: "https://events.ourayridgwayevents.com/event/sherb-literary-living-room-featuring-pam-houston-with-her-new-book-animals-taught-me-everything",
    description: "Doors at 6:00 PM; talk at 6:30 PM. Join the Sherbino Literary Living Room for author Pam Houston and her new book, Animals Taught Me Everything. Drawing on encounters with horses, dogs, elephants, big cats and other animals, Houston reflects on what animals can teach us about presence, joy, love, rest, death and our relationship with the living world. Houston is the award-winning author of Deep Creek, Cowboys Are My Weakness and other works. Seated event. Tickets: $15. View on site | Email this event",
    pubDate: "2026-10-28T00:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/53693236517688/huge/5e1d72eeca9295c11775fe98c87711a043b81570.jpg"
  },
  {
    title: "JELLY BOWL BAND",
    link: "https://events.ourayridgwayevents.com/event/jelly-bowl-band",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-10-30T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
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
  }
];

const NORWOOD_EVENTS = [
  {
    title: "Senior Lunch",
    link: "https://www.norwoodtown.com/2026-08-31-senior-lunch",
    description: "A midday lunch gathering for seniors, hosted by the Town of Norwood. It offers older community members a chance to share a meal and connect with neighbors.",
    pubDate: "2026-08-31T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "NWC Work Session",
    link: "https://www.norwoodtown.com/2026-09-01-nwc-work-session",
    description: "A work session hosted by the Norwood Water Commission (or similar NWC body) held in Norwood, CO, providing an opportunity for members to review, discuss, and work through agenda items outside of a formal public meeting. These sessions typically allow for more in-depth examination of ongoing projects, policies, or operational matters.",
    pubDate: "2026-09-01T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Municipal Court",
    link: "https://www.norwoodtown.com/2026-09-02-municipal-court",
    description: "Municipal Court is a regularly scheduled court session held by the Town of Norwood. It is an official local government proceeding open to those with business before the court.",
    pubDate: "2026-09-02T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Closed For Labor Day",
    link: "https://www.norwoodtown.com/2026-09-07-closed-for-labor-day",
    description: "The Town of Norwood will be closed in observance of Labor Day. Municipal offices and services will be unavailable during the holiday closure.",
    pubDate: "2026-09-07T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Town Closure",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "NWC Rescheduled To 09 22 2026",
    link: "https://www.norwoodtown.com/2026-09-08-nwc-rescheduled-to-09-22-2026",
    description: "A previously scheduled Norwood Town government meeting has been rescheduled to September 22, 2026. The rescheduled meeting will take place in Norwood, CO, and is organized by the Town of Norwood.",
    pubDate: "2026-09-08T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Board Of Trustees Meeting",
    link: "https://www.norwoodtown.com/2026-09-09-board-of-trustees-meeting",
    description: "A regularly scheduled meeting of the Town of Norwood Board of Trustees, providing an opportunity for local governance and public business to be conducted. Community members are welcome to attend and observe the proceedings.",
    pubDate: "2026-09-09T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Norwood Sanitation District Meeting",
    link: "https://www.norwoodtown.com/2026-09-10-norwood-sanitation-district-meeting-meeting",
    description: "A regular meeting of the Norwood Sanitation District, hosted by the Town of Norwood. Community members with an interest in local sanitation services and district operations are welcome to attend.",
    pubDate: "2026-09-10T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Senior Lunch",
    link: "https://www.norwoodtown.com/2026-09-10-senior-lunch",
    description: "A midday meal gathering for seniors, hosted by the Town of Norwood. It offers older community members a chance to share a meal and connect with neighbors.",
    pubDate: "2026-09-10T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Senior Lunch",
    link: "https://www.norwoodtown.com/2026-09-17-senior-lunch",
    description: "A midday lunch gathering for seniors, hosted by the Town of Norwood. It offers older community members a chance to share a meal and connect with neighbors.",
    pubDate: "2026-09-17T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Planning And Zoning Commission Meeting",
    link: "https://www.norwoodtown.com/2026-09-21-planning-and-zoning-commission-meeting",
    description: "The Town of Norwood's Planning and Zoning Commission will hold a regular meeting to review and discuss land use, development, and zoning matters within the community. Members of the public are welcome to attend and observe the proceedings.",
    pubDate: "2026-09-21T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
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
  }
];

const MOUNTAIN_VILLAGE_EVENTS = [
  {
    title: "Design Review Board Meeting September 2026",
    link: "https://townofmountainvillage.com/explore/events/all-events/september-design-review-board-meeting/",
    description: "The Mountain Village Design Review Board meets for its monthly meeting. Meeting material is typically posted on the Friday before a scheduled meeting.",
    pubDate: "2026-09-03T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/31725/drb-event-new.png"
  },
  {
    title: "TMVOA Millennial Trivia at Telluride Distilling Company",
    link: "https://townofmountainvillage.com/explore/events/all-events/tmvoa-millennial-trivia-at-telluride-distilling-company/",
    description: "Grab your flip phone, update your Top 8, set your AIM away message, and put your millennial knowledge to the test! Join us at Telluride Distilling Company on",
    pubDate: "2026-09-03T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49790/trivia_tdc_for_tmv.jpg"
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
  },
  {
    title: "Bike & Brewery Tour",
    link: "https://townofmountainvillage.com/explore/events/all-events/bike-brewery-tour/",
    description: "A guided two-brewery ride from the Mountain Lodge down to town. Route: Jurassic Trail to Meadows Trail to Telluride Brewing Co. for a complimentary beer,",
    pubDate: "2026-09-07T12:00:00.000Z",
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
    pubDate: "2026-09-08T12:00:00.000Z",
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
    pubDate: "2026-09-08T12:00:00.000Z",
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
    pubDate: "2026-09-09T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/30820/motp26_web_market_1800x9006.png"
  },
  {
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars returns to the Conference Center Plaza this summer, running every Saturday at dusk from June 13 through August 15. New this year,",
    pubDate: "2026-09-12T12:00:00.000Z",
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
    pubDate: "2026-09-12T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
  },
  {
    title: "Balourdet Quartet",
    link: "https://townofmountainvillage.com/explore/events/all-events/balourdet-quartet/",
    description: "A concert by the multi-award winning Balourdet String Quartet. One of the most inspiring quartets of their generation.",
    pubDate: "2026-09-13T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48621/balourdet.jpg"
  },
  {
    title: "Sunday Rehab at Alloy Kitchen",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-at-alloy-kitchen/",
    description: "Sundays are for recovery, Mountain Village style. Sunday Rehab at Mountain Lodge's Alloy Kitchen runs each Sunday through October 11, 2026,",
    pubDate: "2026-09-13T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49380/sundays-at-alloy-1800x900.jpg"
  },
  {
    title: "Mountain Village Matters radio show",
    link: "https://townofmountainvillage.com/explore/events/all-events/mountain-village-matters-radio-show/",
    description: "The Town of Mountain Village presents Mountain Village Matters on KOTO Community Radio. Tune in to hear Communications Manager Kathrine Warren chatting with",
    pubDate: "2026-09-14T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49725/koto_show.png"
  },
  {
    title: "Bike & Brewery Tour",
    link: "https://townofmountainvillage.com/explore/events/all-events/bike-brewery-tour/",
    description: "A guided two-brewery ride from the Mountain Lodge down to town. Route: Jurassic Trail to Meadows Trail to Telluride Brewing Co. for a complimentary beer,",
    pubDate: "2026-09-14T12:00:00.000Z",
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
    pubDate: "2026-09-15T12:00:00.000Z",
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
    pubDate: "2026-09-16T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/30820/motp26_web_market_1800x9006.png"
  },
  {
    title: "Telluride Adaptive Sports&#039; Bob Miller Memorial Golf Classic",
    link: "https://townofmountainvillage.com/explore/events/all-events/telluride-adaptive-sports-presents-the-27th-annual-bob-miller-memorial-golf-classic-1/",
    description: "Tee off for a cause at 9,500 feet! Join the Telluride Adaptive Sports Program (TASP) for the 28th Annual Bob Miller Memorial Golf Tournament on Thursday,",
    pubDate: "2026-09-17T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49087/screenshot_2026-06-05_132605.png"
  },
  {
    title: "Local Legends Blues & Brews Kick Off",
    link: "https://townofmountainvillage.com/explore/events/all-events/local-legends-blues-brews-kick-off/",
    description: "Join Ah Haa School for the Arts in partnership with Telluride Blues & Brews Festival for Local Legends, a beer tasting and food pairing on the Ah Haa Sky",
    pubDate: "2026-09-17T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49794/website_ll_26_sliders.png"
  },
  {
    title: "Music on the Green Presents Leon Timbo",
    link: "https://townofmountainvillage.com/explore/events/all-events/music-on-the-green-presents-leon-timbo/",
    description: "Beyond The Groove and TMVOA (tmvoa.org) present Leon Timbo at Reflection Plaza in Mountain Village. The Friday shows are free, all ages and family friendly.",
    pubDate: "2026-09-18T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48871/leon_timbo_1800x900px_1.png"
  },
  {
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars returns to the Conference Center Plaza this summer, running every Saturday at dusk from June 13 through August 15. New this year,",
    pubDate: "2026-09-19T12:00:00.000Z",
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
    pubDate: "2026-09-19T12:00:00.000Z",
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
    pubDate: "2026-09-20T12:00:00.000Z",
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
    pubDate: "2026-09-21T12:00:00.000Z",
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
    pubDate: "2026-09-22T12:00:00.000Z",
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
    pubDate: "2026-09-23T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/30820/motp26_web_market_1800x9006.png"
  },
  {
    title: "Optimize Your Brain Health with Lifestyle Medicine",
    link: "https://townofmountainvillage.com/explore/events/all-events/optimize-your-brain-health-with-lifestyle-medicine/",
    description: "Can up to half of dementia cases be prevented? Emerging evidence suggests the answer is yes. In this engaging and evidence-based presentation, Dr.",
    pubDate: "2026-09-23T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49783/tomv.jpg"
  },
  {
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars returns to the Conference Center Plaza this summer, running every Saturday at dusk from June 13 through August 15. New this year,",
    pubDate: "2026-09-26T12:00:00.000Z",
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
    pubDate: "2026-09-26T12:00:00.000Z",
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
    pubDate: "2026-09-27T12:00:00.000Z",
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
    pubDate: "2026-09-28T12:00:00.000Z",
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
    pubDate: "2026-09-29T12:00:00.000Z",
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
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars returns to the Conference Center Plaza this summer, running every Saturday at dusk from June 13 through August 15. New this year,",
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
    endDate: "2026-09-25",
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
    endDate: "2026-09-30",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62830/the_national_wine.800x533.webp"
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
    title: "Mountain Biking Meet-Up",
    link: "https://www.telluride.com/event/mountain-biking-meet-up/",
    description: "As part of TMVOA’s efforts to support and grow mountain biking in Mountain Village, TMVOA is hosting Mountain Biking …",
    pubDate: "2026-08-20",
    endDate: "2026-09-08",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63362/tdp3588.800x533.webp"
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
    title: "Birding With Katie",
    link: "https://www.telluride.com/event/birding-with-katie/",
    description: "Patagonia Telluride will host a bird talk with Katie Triest from 5-6 pm on Sept 3 at the Patagonia store. Katie will …",
    pubDate: "2026-09-03",
    endDate: "2026-09-04",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63443/screenshot_2026-08-21_114434-v1.800x533.webp"
  },
  {
    title: "TMVOA Millennial Trivia",
    link: "https://www.telluride.com/event/tmvoa-millennial-trivia-at-telluride-distilling-company/",
    description: "Grab your flip phone, update your Top 8, set your AIM away message, and put your millennial knowledge to the test! Join …",
    pubDate: "2026-09-03",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63464/trivia_tdc_for_ttb.800x533.webp"
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
    title: "After Telluride Film Festival",
    link: "https://www.telluride.com/event/after-telluride-film-festival/",
    description: "After Telluride Film Festival (ATFF) screens eight popular Festival films for locals on the Tuesday - Friday following …",
    pubDate: "2026-09-08",
    endDate: "2026-09-12",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/55245/screenshot_2026-09-03_at_2_12_52_pm.800x533.webp"
  },
  {
    title: "Mama Said String Band",
    link: "https://www.telluride.com/event/mama-said-string-band/",
    description: "Mama Said String Band is an instant classic, since 2016 they’ve been bringing their own brand of the grassroots music …",
    pubDate: "2026-09-09",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63472/screenshot_2026-09-02_at_12_37_53_pm.800x533.webp"
  },
  {
    title: "Telluride Dinner Party",
    link: "https://www.telluride.com/event/telluride-dinner-party/",
    description: "Join the Telluride Historical Museum for dinner for their premier fundraising event! Enjoy an excellent catered meal, …",
    pubDate: "2026-09-10",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48558/screenshot_2026-08-11_at_4_32_53_pm.800x533.webp"
  },
  {
    title: "Vana Liya",
    link: "https://www.telluride.com/event/vana-liya/",
    description: "Genre-busting vocalist and songwriter Vana Liya made a serendipitous arrival on the music scene after she posted …",
    pubDate: "2026-09-10",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63475/screenshot_2026-09-02_at_12_39_17_pm.800x533.webp"
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
    title: "Wine & Watercolor",
    link: "https://www.telluride.com/event/wine-watercolor/",
    description: "Join La Piazza and TMVOA for Wine and Watercolor on the patio. Beverages & painting supplies provided.",
    pubDate: "2026-09-15",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63374/greg-rosenke-tmxiwznctzu-unsplash.800x533.webp"
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
    title: "Local Legends Blues & Brews Kick-Off",
    link: "https://www.telluride.com/event/local-legends-blues-brews-kick-off/",
    description: "Join Ah Haa School for the Arts in partnership with Telluride Blues & Brews Festival for Local Legends, a beer …",
    pubDate: "2026-09-17",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63467/screenshot_2026-09-01_at_9_12_39_am.800x533.webp"
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
    title: "Emergency Kit Assembly at the Telluride Brews and Blues Festival",
    link: "https://www.telluride.com/event/emergency-kit-assembly-at-the-telluride-brews-and-blues-festival/",
    description: "Just A Bunch of Roadies is the humanitarian arm of the live-events industry. After years responding to disasters, they …",
    pubDate: "2026-09-18",
    endDate: "2026-09-21",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63457/final_b_b_town_poster_work.800x533.webp"
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
    title: "Trout-A-Palooza",
    link: "https://www.telluride.com/event/troutapalooza/",
    description: "Troutapalooza is the premier fundraiser for Gunnison Gorge Anglers and the San Miguel Valley Floor project. The event …",
    pubDate: "2026-09-23",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/53749/download_14.800x533.webp"
  },
  {
    title: "Optimize Your Brain Health With Lifestyle Medicine",
    link: "https://www.telluride.com/event/optimize-your-brain-health-with-lifestyle-medicine/",
    description: "Can up to half of dementia cases be prevented? Emerging evidence suggests the answer is yes. In this engaging and …",
    pubDate: "2026-09-23",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63441/brain-health_tdotcom-2200x1237.800x533.webp"
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
    title: "Photon",
    link: "https://www.telluride.com/event/photon/",
    description: "What started as a passion project dedicated to the late and great Stephen Hawking quickly evolved into a serious deep …",
    pubDate: "2026-09-24",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63478/screenshot_2026-09-02_at_12_40_25_pm.800x533.webp"
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
    title: "Yope",
    link: "https://www.telluride.com/event/yope/",
    description: "Yope is a Durango, CO based rock/funk/jam/fusion band that has been making waves over the past two years in the Four …",
    pubDate: "2026-09-26",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63481/screenshot_2026-09-02_at_12_41_29_pm.800x533.webp"
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
    description: "Save the date: Steins up, Mountain Village! On Saturday, October 10, 2026, we're transforming Mountain Village Center …",
    pubDate: "2026-10-10",
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
    title: "Public Hearing -- Adoption of 2024 International Building Code and Colorado Low Energy & Carbon Code",
    entity: "San Miguel County Board of Commissioners",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "The San Miguel County Board of Commissioners will hold a public hearing on September 16, 2026 at 9:00 AM in Telluride to consider adopting the 2024 International Building Code and the Colorado Low Energy & Carbon Code. Written comments must be received by noon on September 10, 2026, limited to one page. Proposed amendments are available in the meeting agenda packet at the county website.",
    deadline: "2026-09-10T12:00:00 (written comments); hearing 2026-09-16T09:00:00",
    expires: "2026-09-16",
    dates: "8/27",
    papers: ["ttimes_0827"],
    url: "https://www.telluridenews.com/news/legals/article_8614d722-2a45-49a3-805d-0d517e7701cb.html",
    address: "Telluride, Colorado (San Miguel County)",
    noticeKey: "COL-000222-ibc-2024-hearing"
  },
  {
    title: "RFP -- San Miguel County Jail Repainting, Illium (COL-000224)",
    entity: "San Miguel County Fleet & Facilities Department",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "San Miguel County is requesting proposals from contractors to repaint the San Miguel County Jail located at 684 County Road 63L, Telluride (Illium), CO. RFP documents are available on the county website or from the Fleet & Facilities Department at 333 W. Colorado Ave, 2nd Floor, Telluride. Proposals are due by 5:00 PM on Friday, September 18, 2026, submitted via email or delivered in person.",
    deadline: "2026-09-18T17:00:00",
    expires: "2026-09-18",
    dates: "8/27",
    papers: ["ttimes_0827"],
    url: "https://www.telluridenews.com/news/legals/article_8614d722-2a45-49a3-805d-0d517e7701cb.html",
    address: "684 County Road 63L, Telluride, CO 81435",
    noticeKey: "COL-000224-jail-repaint-illium"
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
    title: "Public Hearing -- Adoption of 2024 International Building Code & Colorado Low Energy & Carbon Code",
    entity: "San Miguel County Planning Commission",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "San Miguel County Planning Commission will hold a public hearing on August 13, 2026 at 9:00 AM in Telluride to consider recommending adoption of the 2024 International Building Code and the Colorado Low Energy & Carbon Code to the Board of County Commissioners. Written comments must be received by noon on Monday, August 10, 2026. Proposed amendments are available in the meeting agenda packet at www.sanmiguelcountyco.gov.",
    deadline: "2026-08-10",
    expires: "2026-08-13",
    dates: "7/30",
    papers: ["ttimes_0730"],
    url: "https://www.telluridenews.com/news/legals/article_75aea7bc-6c31-4ed5-9d5b-9e77b399632d.html",
    address: "Telluride, Colorado (San Miguel County)",
    noticeKey: "COL-000206-ibc-clecc-hearing"
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
    summary: "The Town Manager of Telluride is giving public notice that the 2027 budget preparation process has begun as of July 30, 2026. All Town departments, boards, commissions, and citizens must submit funding requests to the Town Finance Director no later than 5:00 PM on Friday, August 21, 2026. Agencies seeking funding through the Commission for Community Assistance, Arts and Special Events (CCAASE) should consult separate grant guidelines at www.telluride.gov.",
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
    summary: "Montrose Memorial Hospital, Inc., a Colorado community nonprofit, is accepting applications for available positions on its Board of Directors. Application packets are available at www.montrosehealth.com or at the MRH Administration office at 800 South 3rd Street, Montrose. Completed applications must be returned by Friday, August 14, 2026 at 5:00 PM, with elections to be held at the annual Board meeting in October.",
    deadline: "2026-08-14",
    expires: "2026-08-14",
    dates: "7/30",
    papers: ["ttimes_0730"],
    url: "https://www.telluridenews.com/news/legals/article_75aea7bc-6c31-4ed5-9d5b-9e77b399632d.html",
    address: "800 South 3rd Street, Montrose, Colorado",
    noticeKey: "COL-000203-montrose-hospital-board"
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
    summary: "The Farmers' Water Development Company (FWDC) has received a request to replace lost, destroyed, or wrongfully taken share certificate #887, currently issued to A.F. Newans M.D., C.P. Any written objection to issuing the replacement must be filed with FWDC at PO Box 10, Norwood, CO 81423 within 30 days of the last publication date. If no objection is received, the replacement certificate will be issued and the original permanently cancelled.",
    deadline: "2026-08-29",
    expires: "2026-08-29",
    dates: "7/30",
    papers: ["ttimes_0730"],
    url: "https://www.telluridenews.com/news/legals/article_75aea7bc-6c31-4ed5-9d5b-9e77b399632d.html",
    address: "Farmers' Water Development Company, PO Box 10, Norwood, CO 81423",
    noticeKey: "COL-000181-fwdc-share-cert-887"
  },
  {
    title: "RFP -- Interior Repainting of Historic Placerville Schoolhouse",
    entity: "San Miguel County Fleet & Facilities",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "San Miguel County is soliciting proposals from contractors to repaint the interior of the Historic Placerville Schoolhouse located at 400 Front St, Placerville. Full RFP information is available at www.sanmiguelcountyco.gov/bids.aspx or through the Fleet & Facilities department at 333 W Colorado Ave, 2nd Floor, Telluride. Proposals must be submitted by 5:00 PM on Wednesday, August 6, 2026 via email or in person at the Fleet & Facilities department.",
    deadline: "2026-08-06",
    expires: "2026-08-06",
    dates: "7/30",
    papers: ["ttimes_0730"],
    url: "https://www.telluridenews.com/news/legals/article_75aea7bc-6c31-4ed5-9d5b-9e77b399632d.html",
    address: "400 Front St, Placerville, CO (Historic Placerville Schoolhouse)",
    noticeKey: "COL-000205-placerville-schoolhouse-rfp"
  },
  {
    title: "Foreclosure Sale Notice -- 350 S Mahoney Dr Unit 7, Telluride (Sale No. 2026-05)",
    entity: "Wilmington Savings Fund Society, FSB / Public Trustee San Miguel County",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "Public Trustee Brandi R. Hatfield of San Miguel County will conduct a foreclosure auction on September 3, 2026 at 10:00 AM at 305 W. Colorado Avenue, Telluride for Condominium Unit 7, Double Diamond Condominium, after grantor Ryan Pfaff failed to make payments on a $1,200,000 deed of trust originally benefiting Deephaven Mortgage LLC (now held by Wilmington Savings Fund Society as trustee). The outstanding principal balance is $1,199,032.37. The lien foreclosed may not be a first lien.",
    deadline: "2026-09-03",
    expires: "2026-09-03",
    dates: "7/30",
    papers: ["ttimes_0730"],
    url: "https://www.telluridenews.com/news/legals/article_75aea7bc-6c31-4ed5-9d5b-9e77b399632d.html",
    address: "350 S Mahoney Dr Unit 7, Telluride, CO 81435 (Condominium Unit 7, Double Diamond Condominium)",
    noticeKey: "foreclosure-2026-05-350-mahoney-unit7",
    caseNumber: "2026-05"
  },
  {
    title: "Foreclosure Sale Notice -- Stonegate Drive (Vacant Lot), Mountain Village (Sale No. 2026-04)",
    entity: "Federal Holding Realty / Public Trustee San Miguel County",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "Public Trustee Brandi R. Hatfield of San Miguel County will conduct a foreclosure auction on September 3, 2026 at 10:00 AM at 305 W. Colorado Avenue, Telluride for Lot 166AR2, Telluride Mountain Village (a vacant parcel on Stonegate Drive), after grantor Two Stonegate LLC failed to make payments on a $500,000 deed of trust held by Federal Holding Realty. The full outstanding principal balance of $500,000 remains due. The lien foreclosed may not be a first lien.",
    deadline: "2026-09-03",
    expires: "2026-09-03",
    dates: "7/30",
    papers: ["ttimes_0730"],
    url: "https://www.telluridenews.com/news/legals/article_75aea7bc-6c31-4ed5-9d5b-9e77b399632d.html",
    address: "TBD (Vacant) Stonegate Drive, Mountain Village, CO 81435 (Lot 166AR2, Telluride Mountain Village)",
    noticeKey: "foreclosure-2026-04-stonegate-mountain-village",
    caseNumber: "2026-04"
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
    date: "September 10, 2026",
    title: "to Oct 13th) Town Council Budget",
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
    date: "September 17, 2026",
    title: "Special Meeting - Planning & Zoning Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8310",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8310
  },
  {
    date: "September 22, 2026",
    title: "Telluride Housing Authority",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8303",
    hasAgenda: false,
    location: "Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8303
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
    date: "September 30, 2026",
    title: "Special Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8313",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8313
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
    date: "October 8, 2026",
    title: "Special Meeting - Planning & Zoning Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8311",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8311
  },
  {
    date: "October 13, 2026",
    title: "Special Town Council Budget",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8307",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8307
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
    title: "Special Meeting - Planning & Zoning Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8312",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8312
  },
  {
    date: "November 5, 2026",
    title: "Town Council Budget",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8054",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8054
  },
  {
    date: "November 17, 2026",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8046",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8046
  },
  {
    date: "November 18, 2026",
    title: "Parks & Recreation Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8084",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8084
  },
  {
    date: "November 19, 2026",
    title: "Planning & Zoning Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8108",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8108
  },
  {
    date: "December 2, 2026",
    title: "Telluride Housing Authority Subcommittee",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8166",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8166
  },
  {
    date: "December 3, 2026",
    title: "Town Council Retreat",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8051",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8051
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
