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
  "telluride|2026-07-06|Open Space Commission - Jul 06 2026":
    {"sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/ePrh_CzmTLKqp0syEbUesw","meetingId":"894 7506 0147","passcode":"314276.","phone":"719) 359-4580"},

  "telluride|2026-07-01|Ecology Commission - Jul 01 2026":
    {"sv":4},

  "telluride|2026-07-01|Commission for Community Assistance, Arts & Special Events - Jul 01 2026":
    {"sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/tZ0pc-ChqDwsGNFpPigfqqLQptmoMmpJdiOx"},

  "telluride|2026-07-01|Telluride Housing Authority Subcommittee - Jul 01 2026":
    {"sv":4,"zoomUrl":"https://us06web.zoom.us/j/83022451705?pwd=Lj8jkLF9GQny7CWBqvP8IYkQhviQBb.1","meetingId":"830 2245 1705","passcode":"229528.","phone":"719) 359-4580"},

  "telluride|2026-07-01|Liquor Licensing Authority - Jul 01 2026":
    {"sv":4,"zoomUrl":"https://us06web.zoom.us/j/86169871704?pwd=oK56hZLiXIbBia4HLKYI9XqWcVl8Uz.1","meetingId":"861 6987 1704","passcode":"281002.","phone":"346-248-7799"},

  "telluride|2026-06-30|Town Council - Jun 30 2026":
    {"sv":4,"zoomUrl":"https://us06web.zoom.us/meeting/register/oQIoNRzgRC-zUdrPFaFzpQ","meetingId":"843 9146 6771","passcode":"793419.","phone":"719) 359-4580"},

  "county|2026-07-01|Board of County Commissioners Meeting":
    {"sv":4,"zoomUrl":"https://us02web.zoom.us/meeting/register/Mie5Wdx5RWmbBb3Nr07LBg","meetingId":"828 4833 4181","passcode":"562164","phone":"719-359-4580"},

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

  "telluride|2026-06-30|Telluride Housing Authority - Jun 30 2026":
    {"sv":4},

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

  "county|2026-06-29|San Miguel Basin Fair Board":
    {"sv":4},

  "county|2026-07-08|Board of County Commissioners Special - In Norwood at Sheriff Annex":
    {"sv":4,"zoomUrl":"https://us02web.zoom.us/meeting/register/tThmDYw9REKbs5_LM8bpog","meetingId":"832 9649 4938","passcode":"425135","phone":"719-359-4580"},

  "ouray|2026-07-01|PM - The Planning Commission will conduct a work session to review and discuss possible changes to the Ouray County Land Use Code, Section 2 – Definitions. (Packet materials are attached to this agenda)":
    {"sv":4},

  "telluride|2026-07-08|Ecology Commission - Jul 08 2026":
    {"sv":4,"zoomUrl":"https://us06web.zoom.us/j/84372531870?pwd=Dzpb3SzCKOLJejMu5DGalEWqJghGlM.1","phone":"970-728-2496"},

  "telluride|2026-06-29|Open Space Commission Site Walk - Jun 29 2026":
    {"sv":4},

  "county|2026-07-27|Open Space Commission Meeting":
    {"sv":4},

  "county|2026-07-29|Planning Commission and Board of County Commissioners Joint Work Session":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1043/files/agenda/1931","zoomUrl":"https://us02web.zoom.us/j/89046113764","meetingId":"890 4611 3764","passcode":"475547","phone":"719-359-4580"},

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
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8130"},

  "telluride|2026-08-05|Ecology Commission - Aug 05 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8117"},

  "telluride|2026-08-05|Commission for Community Assistance, Arts & Special Events - Aug 05 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8065"},

  "telluride|2026-08-05|Telluride Housing Authority Subcommittee - Aug 05 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8162"},

  "county|2026-08-05|Board of County Commissioners Meeting":
    {"sv":4},

  "telluride|2026-07-21|Block 23 Housing Corporation - Jul 21 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8290"},

  "county|2026-07-16|Housing Code Update SSR":
    {"zoomUrl":"https://us06web.zoom.us/j/84502946677?pwd=cKG6VanJpoiIt8Kl8GR5bYs2hXb3ce.1","meetingId":"845 0294 6677","passcode":"519464","sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1051/files/agenda/1898"},

  "telluride|2026-08-06|Town Council Retreat - Aug 06 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8050"},

  "telluride|2026-07-23|Planning & Zoning Commission Chair - Jul 23 2026 - CANCELLED":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8099"},

  "telluride|2026-08-10|Intergovernmental Worksession - Aug 10 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8057"},

  "telluride|2026-07-26|Open Space Commission - Jul 26 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8292"},

  "telluride|2026-07-13|Open Space Commission Site Walk - Jul 13 2026":
    {"sv":4},

  "telluride|2026-08-11|Town Council - Aug 11 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8041"},

  "ridgway|2026-07-15|Ridgway Planning Commission Meeting":
    {"zoomUrl":"https://us02web.zoom.us/j/83926517027?pwd=V8wFqdDzZdJ3aYPmILDxIyVt8aQWpA.1","meetingId":"839 2651 7027","passcode":"519777","phone":"970.626.5308","sv":4,"agendaUrl":"https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway-Planning-Commission-Meeting-Packet---July-15%2C-2026.pdf"},

  "rico|2026-07-15|Rico Board of Trustees Regular Meeting":
    {"sv":4,"agendaUrl":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20July%202026%20Agenda.pdf"},

  "county|2026-08-12|Board of County Commissioners Work Session":
    {"sv":4},

  "smart|2026-08-13|SMART Board of Directors":
    {"agendaUrl":"null","sv":4},

  "county|2026-08-13|Planning Commission Meeting":
    {"sv":4},

  "telluride|2026-07-27|Special Town Council - Jul 27 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8294","sv":4,"zoomUrl":"https://us06web.zoom.us/j/83026171795?pwd=4cWG6X1zHUnG7rNIbuMYaAeGXgIESW.1","meetingId":"830 2617 1795","passcode":"256663.","phone":"719) 359-4580"},

  "telluride|2026-07-20|Gondola Subcommittee - Jul 20 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8295","zoomUrl":"https://gbsm.zoom.us/j/82559576086","phone":"719-359-4580","sv":4},

  "county|2026-07-27|Housing Code Update SSR":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1052/files/agenda/1930","zoomUrl":"https://us06web.zoom.us/j/84045287708?pwd=2u4vMzFjoI7ZFitrp3Zp9yUa0YQh0b.1","meetingId":"840 4528 7708","passcode":"230003"},

  "rico|2026-08-19|Rico Board of Trustees Regular Meeting":
    {"sv":4},

  "telluride|2026-08-19|Historic & Architectural Review Commission Chair - Aug 19 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8021","sv":4},

  "telluride|2026-08-19|Historic & Architectural Review Commission - Aug 19 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8020","sv":4},

  "telluride|2026-08-19|Parks & Recreation Commission - Aug 19 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8081","sv":4},

  "county|2026-07-21|SMC Historical Commission Meeting":
    {"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/1053/files/agenda/1926","sv":4,"zoomUrl":"https://us02web.zoom.us/j/85010485711","meetingId":"850 1048 5711","passcode":"333002","phone":"970-728-3844"},

  "county|2026-08-19|Board of County Commissioners Meeting":
    {"sv":4},

  "telluride|2026-08-20|Liquor Licensing Authority - Aug 20 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8144","sv":4},

  "mv|2026-08-20|Town Council Meeting":
    {"sv":4},

  "telluride|2026-07-23|San Miguel Authority for Regional Transportation - Jul 23 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8296","zoomUrl":"https://us02web.zoom.us/j/89367662245?pwd=2HUCttMjcQln5Ic8lxRyUKGWLMD0q1.1","sv":4},

  "norwood|2026-08-12|Board of Trustees Meeting":
    {"sv":4},

  "norwood|2026-08-17|Planning and Zoning Commission Meeting":
    {"sv":4},

  "mv|2026-08-06|Design Review Board":
    {"sv":4},

  "med|2026-07-23|Regular Board Meeting":
    {"sv":4},

  "ophir|2026-08-18|General Assembly Meeting":
    {"sv":4},

  "ridgway|2026-08-12|Ridgway Town Council Regular Meeting":
    {"sv":4},

  "norwood|2026-08-11|Norwood Water Commission Meeting":
    {"sv":4},

  "telluride|2026-07-28|Gondola Leadership Committee - Jul 28 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8297","zoomUrl":"https://us06web.zoom.us/j/85350165336?pwd=P0eS14nFbqd5jLXEO2gckIoA9kPAro.1","sv":4},

  "telluride|2026-08-20|Planning & Zoning Commission - Aug 20 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8102","sv":4},

  "telluride|2026-08-20|Planning & Zoning Commission Chair - Aug 20 2026":
    {"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8101","sv":4},

  "tmvoa|2026-07-28|Gondola Leadership Committee Meeting":
    {"agendaUrl":"https://tmvoa.org/site/assets/files/4825/07_28_26_leadership_gondola_agenda_docx.pdf","zoomUrl":"https://us06web.zoom.us/j/85350165336?pwd=P0eS14nFbqd5jLXEO2gckIoA9kPAro.1","sv":4},

  "tmvoa|2026-08-11|Mountain Village Merchant Meeting":
    {"sv":4},

  "tmvoa|2026-08-20|TMVOA Investment Committee Meeting":
    {"sv":4}
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

  "telluride|2026-08-06|Town Council Retreat - Aug 06 2026":
    "Council is expected to gather for a retreat session on August 6, 2026. Related legal notices indicate ongoing San Miguel County discussions around natural medicine businesses, wildfire area regulations, qualified owner definitions, and a water share certificate replacement, though the retreat's specific agenda items were not fully disclosed.",

  "telluride|2026-08-05|Ecology Commission - Aug 05 2026":
    "The Telluride Ecology Commission is expected to meet on August 5, 2026, to address human-wildlife interactions and related public safety concerns, consistent with its mandate under the Telluride Municipal Code. Specific agenda items have not been detailed, but discussions typically focus on reducing threats to both wildlife and residents.",

  "telluride|2026-08-05|Commission for Community Assistance, Arts & Special Events - Aug 05 2026":
    "The Commission for Community Assistance, Arts & Special Events is expected to discuss funding allocations for community support and arts organizations, review special events applications, and consider street closure and banner requests as part of its regular monthly agenda.",

  "telluride|2026-08-05|Telluride Housing Authority Subcommittee - Aug 05 2026":
    "The Telluride Housing Authority Subcommittee is expected to convene its regular monthly meeting on August 5, 2026. No specific agenda items have been publicly detailed, but the subcommittee typically addresses local affordable housing matters, consistent with its ongoing oversight responsibilities for the Telluride Housing Authority.",

  "telluride|2026-08-03|Open Space Commission - Aug 03 2026":
    "The Open Space Commission is expected to discuss priorities and criteria related to open space acquisition, management, and maintenance within the Town of Telluride. The meeting may also include review of open space elements from relevant planning documents and potential recommendations to Town Council regarding open-space-related matters.",

  "telluride|2026-07-29|(RESCHEDULED) Parks & Recreation Commission - Jul 29 2026":
    "The Town of Telluride Parks & Recreation Commission is expected to meet in a rescheduled session to address community parks and recreation needs. A related proposal for Telluride Town Park Oval improvements and Warner Field fencing and safety netting improvements may also be discussed.",

  "county|2026-07-29|Planning Commission and Board of County Commissioners Joint Work Session":
    "The Planning Commission and Board of County Commissioners will hold a joint work session covering land use and planning matters. Related county business includes infrastructure projects, foreclosure proceedings, property tax exemptions, and the Board of Equalization's ongoing review of taxpayer appeals of property valuations.",

  "county|2026-08-05|Board of County Commissioners Meeting":
    "Board will consider procurement matters including material hauling, soil preparation at Mill Creek Park, foundation repairs at the Placerville Schoolhouse, and roofing at the Trout Lake Water Tank. Commissioners will also sit as the Board of Equalization to hear taxpayer appeals of Assessor property valuations through August 5.",

  "county|2026-08-12|Board of County Commissioners Work Session":
    "Board will consider proposals for foundation repairs at the Placerville Schoolhouse and roofing work on the Trout Lake Water Tank. Related legal notices also cover property tax exemption programs for seniors, disabled veterans, and gold star spouses, as well as upcoming foreclosure sales on two Mountain Village properties.",

  "county|2026-08-13|Planning Commission Meeting":
    "The Planning Commission is expected to meet on August 13, 2026. Related notices include requests for proposals for foundation repairs at the Placerville Schoolhouse and Trout Lake Water Tank roofing, property tax exemption notices for seniors and veterans, and two foreclosure sale auctions in Telluride Mountain Village.",

  "county|2026-08-19|Board of County Commissioners Meeting":
    "Board will consider proposals for foundation repairs at the Placerville Schoolhouse and roofing work on the Trout Lake Water Tank. Related legal notices include property tax exemption information for seniors, disabled veterans, and gold star spouses, along with foreclosure and probate matters in the county.",

  "telluride|2026-07-28|Gondola Leadership Committee - Jul 28 2026":
    "The Gondola Leadership Committee is expected to review background history, hear updates on the CIG Program funding commitments and current project progress, and examine a fiscal and economic impact analysis. Local jurisdiction updates and an opportunity for public comment are also on the agenda.",

  "telluride|2026-08-20|Planning & Zoning Commission - Aug 20 2026":
    "The Telluride Planning & Zoning Commission is expected to consider a site-specific development plan vesting notice for a local project. Commissioners may also review related land use matters. The meeting will be live streamed on YouTube.",

  "telluride|2026-08-20|Planning & Zoning Commission Chair - Aug 20 2026":
    "The Planning & Zoning Commission Chair meeting on August 20, 2026 may address a proposed Land Use Code amendment establishing regulations for Natural Medicine Businesses, as well as a site-specific development plan vesting notice. Detailed agenda items were not fully available in the provided materials.",

  "tmvoa|2026-07-28|Gondola Leadership Committee Meeting":
    "The Gondola Leadership Committee is expected to review background on the gondola project, hear updates on CIG program funding commitments and project progress, and discuss fiscal and economic impact analysis. Local jurisdiction updates and public comment are also on the agenda.",

  "county|2026-07-27|Housing Code Update SSR":
    "Board will consider proposed changes to the Land Use Code aimed at making affordable and workforce housing easier to build. Discussion will focus on refining zoning and density bonuses for low-, medium-, and high-density zones, along with additional workforce housing types."
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
    title: "St Pats Telluride Parish Bulletin for July 26th",
    source: "St. Patrick's Catholic Church",
    sourceKey: "stpatricks",
    date: "July 25, 2026",
    newsTopic: "community",
    copy: "Attached as PDF is the St Pats Telluride Parish Bulletin for July 26th. Please see the Parish Calendar for updates.Coffee and donuts every Sunday during summer after 9:00 AM Holy Mass. We need more volunteers to help.Next Sunday - Second Collectio...",
    href: "https://stpatrickstelluride.com/2026/parish-news/st-pats-telluride-parish-bulletin-for-july-26th/",
    img: ""
  },
  {
    title: "Long-term road closure for the Corbett Creek Bridge Project",
    source: "Ouray County",
    sourceKey: "ouray-county",
    date: "July 24, 2026",
    newsTopic: "infrastructure",
    copy: "Long-term road closure for the Corbett Creek Bridge Project, July 24 through October 8, 2026.",
    href: "https://ouraycountyco.gov/CivicAlerts.aspx?aid=955",
    img: "https://ouraycountyco.gov/ImageRepository/Document?documentID=22829"
  },
  {
    title: "‘Big box’ tightens on Gold Mountain Fire",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "July 23, 2026",
    newsTopic: "housing",
    copy: "Surveying a sprawling map of the northern San Juans last week, Mike Smith was deep in a geometry of fire. Fingers tracing fire lines and ridges, Smith – the current incident commander over Gold Mountain Fire operations – said firefighters were working to draw a “big box” around the blaze in its thir",
    href: "https://www.ouraynews.com/2026/07/22/big-box-tightens-gold-mountain-fire/",
    img: ""
  },
  {
    title: "County eyes recovery funds",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "July 23, 2026",
    newsTopic: "public-safety",
    copy: "Federal program could offer nearly $3 million — if cash-poor leaders can find matching dollars Ouray County could receive nearly $3 million in federal funding to protect homes, roads and other infrastructure from flooding and debris flows in the wake of the Gold Mountain Fire. In order to unlock tho",
    href: "https://www.ouraynews.com/2026/07/22/county-eyes-recovery-funds/",
    img: ""
  },
  {
    title: "Spring targeted for tree-thinning effort",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "July 23, 2026",
    newsTopic: "public-safety",
    copy: "A joint wildfire mitigation effort to remove dead or diseased trees from the city of Ouray’s perimeter is expected to move forward next spring, though with a potentially more limited scope. Officials told the Plaindealer that the Ouray Forest Resilience Project, which was first floated several years",
    href: "https://www.ouraynews.com/2026/07/22/spring-targeted-tree-thinning-effort/?ta_paidstory",
    img: ""
  },
  {
    title: "City reorganizes planning department",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "July 23, 2026",
    newsTopic: "land-use",
    copy: "Ouray City Administrator Michelle Metteer is overhauling the city’s community development department, dividing responsibilities among a third-party consultant and two city employees rather than consolidating them under a single department director. At Metteer’s recommendation, the Ouray City Council",
    href: "https://www.ouraynews.com/2026/07/22/city-reorganizes-planning-department/",
    img: ""
  },
  {
    title: "Ridgway to market itself as destination, not crossroads",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "July 23, 2026",
    newsTopic: "infrastructure",
    copy: "A consultant has recommended that Ridgway reimagine its marketing campaign to bring outdoor enthusiasts, history buffs and regional explorers to town. The idea is to shift tourists’ perception away from Ridgway’s reputation as a pass-through town and move it toward a multi-day base camp with a town ",
    href: "https://www.ouraynews.com/2026/07/22/ridgway-market-destination-not-crossroads/?ta_paidstory",
    img: ""
  },
  {
    title: "Ouray County Fair still scheduled for Aug. 13-15",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "July 23, 2026",
    newsTopic: "public-safety",
    copy: "The 109th annual Ouray County Fair is scheduled to proceed as planned, even if the fairgrounds remain the headquarters for the Gold Mountain Fire operations. The fair is scheduled from Aug. 13-15 at the Ouray County 4-H Center and the fairgrounds, which has been home to more than 900 fire personnel ",
    href: "https://www.ouraynews.com/2026/07/22/local-briefs-20260723-0133-386468/?ta_paidstory",
    img: ""
  },
  {
    title: "Ride-along reveals value of alpine ranger program",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "July 23, 2026",
    newsTopic: "government",
    copy: "I m not a Jeep enthusiast or an off-highway vehicle user, but I am a hiker and photographer who cares deeply about our high-country environment. After recent discussions at county commissioners meetings about closing the upper part of Yankee Boy Basin to motorized travel, I wanted to see the area th",
    href: "https://www.ouraynews.com/2026/07/22/ride-along-reveals-value-alpine-ranger-program/?ta_paidstory",
    img: ""
  },
  {
    title: "Toth seeks to grow Wright Opera House’s appeal",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "July 23, 2026",
    newsTopic: "arts-culture",
    copy: "When Heather Toth moved to Ouray County in 2013, her first question was, “Where’s the theater; where’s the art space?” The arts are a necessity, not a luxury, according to Toth. She values third spaces, especially those with a connection to the arts. “I think they’re vital,” she said. “I think they’",
    href: "https://www.ouraynews.com/2026/07/22/toth-seeks-grow-wright-opera-houses-appeal/?ta_paidstory",
    img: ""
  },
  {
    title: "Good For You!",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "July 23, 2026",
    newsTopic: "housing",
    copy: "Proud parents Katie and Willem Geyer of Ouray welcomed their son Willem “Liam” Pieter Geyer to the world at 5:52 p.m. on July 14, weighing 6 lbs. 8 oz. Liam, also known by his nickname Pork Chop, was welcomed home by his furry siblings Opie, Max and Indie. Liam is the grandson of Willem and Isabella",
    href: "https://www.ouraynews.com/2026/07/22/send-us-celebrations-20260723-0134-493241/?ta_paidstory",
    img: ""
  },
  {
    title: "Charles ‘CJ’ John Turner",
    source: "Ouray County Plaindealer",
    sourceKey: "ouray-plaindealer",
    date: "July 23, 2026",
    newsTopic: "community",
    copy: "August 27, 1960 – July 7, 2026 Born Charles John Turner on August 27, 1960, in Nashua, NH, CJ “Turbo” Turner comes full circle to rest beside his beloved Mother, Joanne Turner. CJ was one of a kind, reflected in his visionary designs and award-winning home and landscape projects. A passionate abando",
    href: "https://www.ouraynews.com/2026/07/22/charles-cj-john-turner/",
    img: ""
  },
  {
    title: "Invitation to Prayer/Fellowship Wednesday Morning",
    source: "St. Patrick's Catholic Church",
    sourceKey: "stpatricks",
    date: "July 21, 2026",
    newsTopic: "community",
    copy: "This is an open invitation to all women in Telluride. Please come and join us on Wednesday, July 22nd...7:30 am Rosary8:00 am Holy MassImmediately after we will go to Butcher and Baker for fellowship. Join as able....",
    href: "https://stpatrickstelluride.com/2026/parish-news/invitation-to-prayer-fellowship-wednesday-morning-2/",
    img: ""
  },
  {
    title: "July 20th Women’s Retreat Reminder",
    source: "St. Patrick's Catholic Church",
    sourceKey: "stpatricks",
    date: "July 19, 2026",
    newsTopic: "community",
    copy: "It is not too late to join us for a Spirit-filled evening with fellowship, scripture and personal reflection tomorrow (MONDAY, JULY 20th) The theme of the evening is \"Come to Me...\"Potluck begins at 5:30pm at Carroll Mueller's home (address provided up...",
    href: "https://stpatrickstelluride.com/2026/parish-news/july-20th-womens-retreat-reminder/",
    img: ""
  },
  {
    title: "Monday Women’s Retreat Location Changed",
    source: "St. Patrick's Catholic Church",
    sourceKey: "stpatricks",
    date: "July 19, 2026",
    newsTopic: "community",
    copy: "The 'COME TO ME' Women's Retreat Evening, July 20th has been moved to Carroll Mueller's home in Telluride!Bring your Bible and a potluck dish to share. It begins at 5:30.Text Katrina for the address or if you have questions (970) 417-9096.",
    href: "https://stpatrickstelluride.com/2026/parish-news/monday-womens-retreat-location-changed/",
    img: ""
  },
  {
    title: "St Pats Telluride Parish Bulletin for July 19th",
    source: "St. Patrick's Catholic Church",
    sourceKey: "stpatricks",
    date: "July 18, 2026",
    newsTopic: "arts-culture",
    copy: "Attached as PDF is the St Pats Telluride Parish Bulletin for July 19th. Please see the Parish Calendar on the website for any updates to the schedule.Please join us for praying the Holy Rosary on Sundays before 9:00 AM Holy Mass. It starts at 8:30...",
    href: "https://stpatrickstelluride.com/2026/parish-news/st-pats-telluride-parish-bulletin-for-july-19th/",
    img: ""
  },
  {
    title: "Changes in evacuation zones 25 and 300",
    source: "Ouray County",
    sourceKey: "ouray-county",
    date: "July 17, 2026",
    newsTopic: "public-safety",
    copy: "Changes in evacuation zones 25 and 300 on July 17, 2026",
    href: "https://ouraycountyco.gov/CivicAlerts.aspx?aid=954",
    img: "https://ouraycountyco.gov/ImageRepository/Document?documentID=22817"
  },
  {
    title: "Stage 2 Fire Restrictions",
    source: "Ouray County",
    sourceKey: "ouray-county",
    date: "July 16, 2026",
    newsTopic: "public-safety",
    copy: "Ouray County Remains in Stage 2 Fire Restrictions",
    href: "https://ouraycountyco.gov/CivicAlerts.aspx?aid=953",
    img: "https://ouraycountyco.gov/ImageRepository/Document?documentID=22782"
  },
  {
    title: "Invitation to prayer/fellowship-Wednesday morning",
    source: "St. Patrick's Catholic Church",
    sourceKey: "stpatricks",
    date: "July 14, 2026",
    newsTopic: "community",
    copy: "This is an open invitation to all women in Telluride. Please come and join us on Wednesday, July 15...7:30 am Rosary8:00 am Holy MassImmediately after we will go to Butcher and Baker for fellowship. (If you are only available for fellowship and i...",
    href: "https://stpatrickstelluride.com/2026/parish-news/invitation-to-prayer-fellowship-wednesday-morning/",
    img: ""
  }
];  // 7 regional feeds (West End, Ouray, …)
const SMC_ALERTS = [
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
    title: "Tomboy Road reopens Weds 7/22 8AM",
    source: "San Miguel County",
    sourceLabel: "San Miguel County",
    category: "Alert",
    date: "2026-07-21",
    pubDate: "2026-07-21T23:10:29.000Z",
    copy: "Due to hazardous conditions, Tomboy Road is closed to all pedestrian and vehicle traffic.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=535",
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
    projectName: "Town Park Oval Warner Field Improvements",
    projectUrl: "https://engagetelluride.org/town-park-oval-warner-field-improvements",
    title: "P&R Commission Phase II Design Review",
    date: "2026-07-29",
    board: "other",
    dateUrl: "https://engagetelluride.org/town-park-oval-warner-field-improvements/widgets/106633/key_dates#41038"
  }
];         // Engage Telluride project key dates
const MANUAL_SUMMARIES_CACHE_DATE = '2026-07-27';
const LEGAL_NOTICES_CACHE_DATE = '2026-07-23';

const MANUAL_SUMMARIES = {
  "telluride|2026-06-30|Town Council - Jun 30 2026":
    "A full agenda for the last day of June. The most consequential item: first reading of Land Use Code amendments tied to Colorado's wildfire resilience requirements — changes to the rules that govern how buildings are built here, with fire country context that anyone in the box canyon understands. Council will also hold a second work session on the Telluride Energy Mitigation Program (TEMP), debating which outdoor energy uses — snowmelt, heat tape, outdoor fireplaces, spas, pools — trigger mitigation requirements and at what offset levels. On second reading: a new Black Hills Energy gas franchise, a school district tap-fee IGA, and the authorized sale of two deed-restricted properties (907 E. Colorado and Longwill 16 Unit B3). An emergency fire ban ordinance — covering open fires, fireworks, and smoking restrictions — is also up for consideration. Council will also vote on acquiring Spruce House Unit H as deed-restricted housing.",

  "telluride|2026-07-01|Ecology Commission - Jul 01 2026":
    "The July 1, 2026 Ecology Commission agenda hasn't been posted yet.",

  "telluride|2026-07-01|Commission for Community Assistance, Arts & Special Events - Jul 01 2026":
    "A routine CCAASE meeting with two items worth noting. RASR Productions LLC is asking to extend the Telluride Autumn Classic street closure on September 25, 2026 — adding the westbound lane of Colorado Ave. between Willow and Alder to an already-approved closure from Aspen to Willow. No objections came back from emergency services or affected residents. The commission will also take up a 2027 calendar date request from TMVOA for Red, White & Blues on July 3–4, which overlaps with MusicFest, Plein Air, and the 4th of July Celebration already on the books. A work session reviews draft 2027 grant materials.",

  "telluride|2026-07-01|Telluride Housing Authority Subcommittee - Jul 01 2026":
    "Two worksession items — no formal votes today. First, the subcommittee takes up nonconventional lending under Guideline §110.2, which currently restricts borrowers to conventional or government-guaranteed fixed-rate mortgages. The discussion centers on whether that framework fits mixed-use structures, where Fannie Mae and Freddie Mac's \"warrantable condominium\" standards can block financing entirely. Second, a thornier policy question: how to count children of split-custody households toward minimum bedroom requirements. Current language defines primary residence as a \"sole and exclusive place of residence,\" which leaves staff using tax-dependent status and custody percentages to determine eligibility — a framework that, applied consistently, means a child may qualify for a bedroom in only one parent's unit. Staff has laid out the scenarios and is asking the subcommittee whether existing appeal and exception pathways are sufficient, or whether the Guidelines and Policies need revision.",

  "telluride|2026-07-01|Liquor Licensing Authority - Jul 01 2026":
    "The Liquor Licensing Authority takes up 14 special event permit requests at its July 1 meeting — a busy slate that tracks the canyon's summer season in full swing. Applicants include Palm Arts Inc. (AVID Dance Performance, Camp Alderwild), Telluride Mountain Club (Mountain Run, Telluride Reserve), Telluride Medical Center Foundation (Telluride Table across multiple venues), San Miguel Mentoring (Top Chef & Taste of Telluride), Tri-County Health Network (Noche de Luz), Telluride Chamber Music Association (New York Philharmonic Brass Quintet), Telluride Society for Jazz (Jazz Festival), Telluride Film Festival, and Telluride Bluegrass Beer Booth Inc. (Camp Alderwild). Events span July through early September 2026. The board will also approve minutes from the May 21 meeting.",

  "county|2026-07-01|Board of County Commissioners Meeting":
    "A relatively routine July BOCC meeting, though a few items are worth tracking. The board will interview an applicant for an alternate seat on the Planning Commission — a slot that matters whenever land-use decisions get close. There's a 40-minute presentation on the Road and Bridge High Country Road opening policy, with the Forest Service at the table, which touches on access to the county's backcountry roads every season. The board will also take up an ADA policy update, a tax abatement denial, and board appointments to the Behavioral Health Solutions Panel. The attorney's agenda includes an executive session on a code enforcement matter — no details given, as is typical.",

  "telluride|2026-07-06|Open Space Commission - Jul 06 2026":
    "Three substantive items on the Valley Floor dominate this meeting. First, the Commission reviews alternative trail alignments for Reach 1 of the Valley Floor Open Space — three route options are mapped, each threading around wetland delineations. Second, the Telluride Mountain Club requests permission to route approximately 0.25 miles of the long-planned Mountain Village to Valley Floor Connector Trail across Town-owned open space; after nine years of public engagement and a completed NEPA process, the Forest Service has issued a FONSI and Draft Decision Notice — the missing piece is this short segment on Town land. The Club also asks the Commission to recommend allowing dogs on that segment, for consistency with the surrounding Forest Service trail. Third, a forwarded letter from resident Ramona Gaylord challenges the goat grazing program, citing drought conditions, documented thistle re-emergence in the 2025 grazing footprint, elk calving conflicts, and an absence of measurable pilot data — and asking the Commission to reconsider before committing roughly $10,000 to another season.",

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

  "telluride|2026-06-30|Telluride Housing Authority - Jun 30 2026":
    "The Telluride Housing Authority is standing up its newly created Resident Advisory Committee — a structure approved unanimously in May — by appointing members from across the Town's rental properties. Fifteen eligible applications came in from tenants at the Boarding House, Shandoka, Sunnyside, Virginia Placer, and Voodoo. The THA will also hold a random drawing to assign staggered terms. It's a small procedural meeting, but the RAC itself is new ground: a formal channel for renters in Town-owned housing to have a structured voice in how those policies are shaped.",

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

  "county|2026-06-29|San Miguel Basin Fair Board":
    "The San Miguel Basin Fair Board meets in Norwood on June 29th. The posted agenda is a shell — minutes approval and generic \"new/old business\" placeholders, with no specific items listed. There's no detail on what the board actually plans to discuss.",

  "county|2026-07-08|Board of County Commissioners Special - In Norwood at Sheriff Annex":
    "A rare West End meeting — the commissioners convene Wednesday evening at the Norwood Sheriff Annex. Two items of substance: the board considers appointing an alternate member to the Planning Commission (a seat that matters whenever land-use decisions get close), and Deputy County Manager Jarrod Biggs presents the results of the Placerville Fire Survey. At 6:00 the board holds an open listening session with San Miguel County residents. Consent covers routine approval of minutes. Earlier in the afternoon, commissioners tour the Wright's Mesa Historical Society and Log Cabin Museum.",

  "ouray|2026-07-01|PM - The Planning Commission will conduct a work session to review and discuss possible changes to the Ouray County Land Use Code, Section 2 – Definitions. (Packet materials are attached to this agenda)":
    "Ouray County's Planning Commission meets July 1 at 2:00 PM for a work session on possible changes to Section 2 – Definitions in the Land Use Code. Definitions work might sound like housekeeping, but how a county defines its terms shapes everything that follows — what counts as a dwelling unit, what qualifies as a use, what triggers review. The packet materials are attached to the posted agenda.",

  "telluride|2026-07-08|Ecology Commission - Jul 08 2026":
    "The Ecology Commission meets Wednesday to work through two substantive items. The main session is a work session reviewing the 2022 Climate Action Plan, with discussion focused on two specific focus areas: Transportation & Land Use and Materials & Consumption — both of which connect directly to how people move around the box canyon and what gets consumed and discarded here. The commission will also take action on appointing members to the Green Grants Selection Subcommittee, which directs local environmental funding. Rounding out the agenda is a report on the outcome of the Trash Bash event. The June meeting was canceled, so there are no prior minutes to approve.",

  "telluride|2026-06-29|Open Space Commission Site Walk - Jun 29 2026":
    "The Open Space Commission heads out on foot Monday at 4:00 PM — meeting at the northwest corner of the Shandoka parking lot on Mahoney Drive. The site walk covers potential river trail alignments in Reach 1 of the Valley Floor Open Space. No agenda room, no projector: just commissioners walking the ground to see what the land actually has to say about where a trail might go.",

  "county|2026-07-27|Open Space Commission Meeting":
    "The July 27 San Miguel County Open Space Commission agenda hasn't been posted yet.",

  "county|2026-07-29|Planning Commission and Board of County Commissioners Joint Work Session":
    "The July 29 joint work session between the San Miguel County Planning Commission and Board of County Commissioners hasn't posted a substantive agenda yet — just the meeting header. No items are listed to summarize.",

  "telluride|2026-07-29|(RESCHEDULED) Parks & Recreation Commission - Jul 29 2026":
    "A rescheduled midday meeting with a short agenda. The one action item is a request from the Telluride Humane Society to use Elks Park and the River Trail — Maple St. to Gold Run — for a dog-friendly 5K fun run on October 10, 2026. The event, called Tails on the Trail, expects around 100 attendees, runs 8:30 a.m. to noon, and would generate a maximum of $72.25 in admissions fees to the Town. Street use on Colorado Ave. is still pending staff review. The commission will also hold a work session on the Town Park Oval Improvements Project — no vote expected there, just review and discussion.",

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
    "The August 3, 2026 Open Space Commission agenda hasn't been posted yet.",

  "telluride|2026-08-05|Ecology Commission - Aug 05 2026":
    "The August 5, 2026 Ecology Commission agenda hasn't been posted yet.",

  "telluride|2026-08-05|Commission for Community Assistance, Arts & Special Events - Aug 05 2026":
    "The August 5, 2026 Commission for Community Assistance, Arts & Special Events agenda hasn't been posted yet.",

  "telluride|2026-08-05|Telluride Housing Authority Subcommittee - Aug 05 2026":
    "The August 5, 2026 Telluride Housing Authority Subcommittee agenda hasn't been posted yet.",

  "county|2026-08-05|Board of County Commissioners Meeting":
    "The August 5 Board of County Commissioners agenda hasn't been posted yet.",

  "telluride|2026-07-21|Block 23 Housing Corporation - Jul 21 2026":
    "The Block 23 Housing Corporation holds what amounts to a housekeeping session — approving minutes from November 2025 and certifying its officer elections, CEO retention, and authorized signers via consent resolution. Nothing substantive is on the agenda beyond keeping the corporation's paperwork in order.",

  "county|2026-07-16|Housing Code Update SSR":
    "San Miguel County's sixth working session in its ongoing Land Use Code rewrite aimed at making affordable and workforce housing easier to build. The three-hour session will work through zoning and density adjustments, additional workforce housing types, and regulatory incentives for affordable housing — then synthesize feedback into final redline recommendations for the code. This is the kind of upstream work that determines what actually gets built in the valley for years to come.",

  "telluride|2026-08-06|Town Council Retreat - Aug 06 2026":
    "The August 6, 2026 Town Council Retreat agenda hasn't been posted yet.",

  "telluride|2026-07-23|Planning & Zoning Commission Chair - Jul 23 2026 - CANCELLED":
    "The July 23, 2026 Planning & Zoning Commission Chair meeting has been cancelled.",

  "telluride|2026-08-10|Intergovernmental Worksession - Aug 10 2026":
    "The August 10, 2026 Intergovernmental Worksession agenda hasn't been posted yet.",

  "telluride|2026-07-26|Open Space Commission - Jul 26 2026":
    "The July 26, 2026 Open Space Commission agenda hasn't been posted yet.",

  "telluride|2026-07-13|Open Space Commission Site Walk - Jul 13 2026":
    "The Open Space Commission heads out to the Valley Floor for a hands-on weed pull — meeting at the Eider Creek Trailhead, south of the intersection of Eider Creek Lane and W. Hwy 145 Spur, at 4:00 PM. No deliberations, no votes. Public comment is on the agenda, so anyone who shows up can speak.",

  "telluride|2026-08-11|Town Council - Aug 11 2026":
    "The August 11, 2026 Town Council agenda hasn't been posted yet.",

  "ridgway|2026-07-15|Ridgway Planning Commission Meeting":
    "The July 15th Ridgway Planning Commission meeting has one substantive item: a public hearing on a proposed resubdivision at 845 & 847 Hyde Street. The applicant, Zack Young, is asking to split an existing lot — currently holding a duplex, a greenhouse, storage outbuildings, and a vacant parcel — into two separate lots. Lot 2 (8,059 sq. ft.) would retain the existing duplex; Lot 1 (6,104 sq. ft.) would be vacant and available for future development. No new construction is proposed now. The property is zoned Historic Residential, and both lots meet minimum dimensional standards, though a staircase encroaching on a side setback must be removed before the plat is recorded. Outdoor storage on Lot 1 also needs to come into compliance. The Planning Commission's role here is to make a recommendation — final approval goes to Town Council. Routine minutes and staff updates round out the agenda.",

  "rico|2026-07-15|Rico Board of Trustees Regular Meeting":
    "A busy night in Rico. The Board takes up its Q2 financials, a lease with the Rico Historical Society for space at 15 S. Glasgow Avenue, and a construction contract with Lewis Excavation to replace the water service line beneath the Dolores River between Piedmont and North River Streets — that last one being the kind of infrastructure work small mountain towns have to keep doing quietly just to stay functional. Then comes a round of housekeeping on the books: six ordinances on first reading, all repeals. Out go an old misdemeanor penalty ordinance (no. 131), rules on municipal equipment loans to private individuals (no. 271), a standalone mayoral qualifications ordinance (no. 278), the Town Manager duties ordinance (no. 1999-2), dog licensing fees (no. 2001-5), and authorization for the North Rico non-profit corporation (no. 2006-1). Discussion rounds out the evening: a voluntary cleanup update, the November 2026 election, and — notably — whether to change how often the Board meets and when it starts.",

  "county|2026-08-12|Board of County Commissioners Work Session":
    "The August 12 Board of County Commissioners Work Session agenda hasn't been posted yet.",

  "smart|2026-08-13|SMART Board of Directors":
    "The August 13, 2026 SMART Board of Directors agenda hasn't been posted yet.",

  "county|2026-08-13|Planning Commission Meeting":
    "The August 13, 2026 Planning Commission agenda hasn't been posted yet.",

  "telluride|2026-07-27|Special Town Council - Jul 27 2026":
    "A single item: the Council, sitting as the Liquor Licensing Authority, will hold a public hearing on a special event permit request from San Miguel Educational Fund (KOTO Radio) for its Live at the Drive event at 207 N Pine Street on July 30, 2026, from 2:00 pm to 9:30 pm.",

  "telluride|2026-07-20|Gondola Subcommittee - Jul 20 2026":
    "The Gondola Advisory Committee meets virtually to receive the project team's economic and fiscal impact analysis of the gondola — the central item on this agenda. The analysis ties gondola operations to visitation patterns, retail spending, and sales tax across Telluride and Mountain Village, finding that 30% of Telluride visitors and 45% of Mountain Village visitors ride it at least once per trip, and that restaurant sales in particular track closely with ridership. Growth projections are being revised downward over the next 20 years, driven by rising costs of living, accelerating home values, infrastructure limits, and demographic shifts. The committee will also review materials for the July 28 Leadership Committee meeting, which will cover the FTA Capital Investment Grants program and local funding strategy — a consequential topic given that the hypothetical funding scenario puts the project at $140M total, with $20M each expected from the Town of Telluride and the Mountain Village Entity. August's Gsub meeting is set to examine traffic, parking, and bus-replacement scenarios in the event of a prolonged gondola outage.",

  "county|2026-07-27|Housing Code Update SSR":
    "The agenda for this Housing Code Update SSR meeting lists only the title — no line items, staff reports, or supporting materials have been posted. There's enough history with housing code work in the county to know these sessions can carry real weight, but there's nothing specific to report yet.",

  "rico|2026-08-19|Rico Board of Trustees Regular Meeting":
    "The August 19, 2026 Rico Board of Trustees Regular Meeting agenda hasn't been posted yet.",

  "telluride|2026-08-19|Historic & Architectural Review Commission Chair - Aug 19 2026":
    "The August 19, 2026 HARC Chair agenda hasn't been posted yet.",

  "telluride|2026-08-19|Historic & Architectural Review Commission - Aug 19 2026":
    "The August 19, 2026 HARC agenda hasn't been posted yet.",

  "telluride|2026-08-19|Parks & Recreation Commission - Aug 19 2026":
    "The August 19, 2026 Parks & Recreation Commission agenda hasn't been posted yet.",

  "county|2026-07-21|SMC Historical Commission Meeting":
    "The July 21 San Miguel County Historical Commission agenda is essentially a placeholder — minutes approval and a vague \"Items\" and \"New/Old Business\" line are all that's posted. No substantive items are described.",

  "county|2026-08-19|Board of County Commissioners Meeting":
    "The August 19 Board of County Commissioners agenda hasn't been posted yet.",

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
    "The August 6, 2026 Mountain Village Design Review Board agenda hasn't been posted yet.",

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
    "The August 20, 2026 Planning & Zoning Commission agenda hasn't been posted yet.",

  "telluride|2026-08-20|Planning & Zoning Commission Chair - Aug 20 2026":
    "The August 20, 2026 Planning & Zoning Commission Chair agenda hasn't been posted yet.",

  "tmvoa|2026-07-28|Gondola Leadership Committee Meeting":
    "The Gondola Leadership Committee convenes July 28 for a substantive session covering the full arc of the gondola project. Miles Graham opens with background and history — the longest-running and most contested civic question in the region right now. Ed Parks and Amber Blake then brief the committee on the CIG (Capital Investment Grant) program and current funding commitments, followed by a project status update. The weightiest item is a 30-minute fiscal and economic impact analysis presented by Parks and Chris Brewer. Graham closes the formal agenda with local jurisdiction updates before the floor opens for public comment.",

  "tmvoa|2026-08-11|Mountain Village Merchant Meeting":
    "The August 11, 2026 Mountain Village Merchant Meeting agenda hasn't been posted yet.",

  "tmvoa|2026-08-20|TMVOA Investment Committee Meeting":
    "The August 20, 2026 TMVOA Investment Committee Meeting agenda hasn't been posted yet."
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
    title: "A priceless chance to sip and learn",
    source: "Telluride Times",
    date: "July 26, 2026",
    firstSeen: "2026-07-26",
    newsTopic: "arts-culture",
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
    title: "4th firefighter dies from burn injuries in western Colorado blaze",
    source: "Telluride Times",
    date: "July 25, 2026",
    firstSeen: "2026-07-25",
    newsTopic: "public-safety",
    copy: "A fourth firefighter has died from the June 27 burnover in Mesa County — Nathan Matthews, 43, of Lincoln, Nebraska, passed away Friday. Three others — Emily Barker, Nick Hutcherson, and Sydney Watson — died at the scene. Dry conditions and erratic winds continue driving large fires across the western U.S. this summer.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_e3234d99-d9c8-5d8c-85d4-3dd0012f14bb.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/b1/ab1e27ca-24b8-5614-98ef-a898ff168dd8/6a64bc87501ff.image.jpg",
    imgHiRes: true
  },
  {
    title: "Bike park closure leaves riders scrambling",
    source: "Telluride Times",
    date: "July 25, 2026",
    firstSeen: "2026-07-25",
    newsTopic: "recreation",
    copy: "Telluride's bike park is closed all of 2026 while Telski finishes work tied to a Lift 4 upgrade — downhill and freeride trails stay shut even after the lift modernization wrapped up. Cross-country trails remain open via the gondola. Local riders, shops, and at least one World Cup racer say the closure stings, with some wanting more transparency on the timeline.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_3dbe9271-c799-4b20-8c6d-bedbfcb12d89.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/e2/6e225fcd-2a29-4d1d-9045-aeb962f570e8/6a6078f71f346.image.jpg",
    imgHiRes: true
  },
  {
    title: "Heat dome expands across the central United States, creating dangerous conditions for millions",
    source: "Telluride Times",
    date: "July 25, 2026",
    firstSeen: "2026-07-25",
    newsTopic: "community",
    copy: "A heat dome is pushing temperatures 10–15°F above normal across the central U.S. this weekend into next week, with roughly 70 million people under heat advisories from Dallas to North Dakota. Overnight lows won't drop enough to offer real relief, letting heat stress build. Some Denver-area records may fall; the Southwest and Gulf Coast face the worst of it by midweek.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_4a56758f-271f-517a-80af-57f4f42aaa78.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/02/9022f7ad-cc64-542e-96ad-30f48201b996/6a64d37bd2276.image.jpg",
    imgHiRes: true
  },
  {
    title: "Water hauling is the new chore no rancher asked for",
    source: "Telluride Times",
    date: "July 25, 2026",
    firstSeen: "2026-07-25",
    newsTopic: "land-use",
    copy: "Ranchers near Montrose are hauling water daily after the Upper Colorado River Basin recorded its worst snowpack in history. Some operations made eight or nine truck runs in a single day just to keep 800 head watered. USDA cost reimbursements help, but nobody's getting the hours back.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_096e200b-6d66-5f24-b4ef-4ec4050ae9a4.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/15/115b0f07-30fe-541a-954e-994b8f3eabf8/6a64b7692135f.image.jpg",
    imgHiRes: true
  },
  {
    title: "Lost stories, brought to light",
    source: "Telluride Times",
    date: "July 25, 2026",
    firstSeen: "2026-07-25",
    newsTopic: "arts-culture",
    copy: "A Wilkinson Public Library staffer found a box of more than 200 lost oral history interviews — missing for nearly 15 years — recorded in the early 2000s with Telluride residents who lived here during the 1970s transition from mining to skiing. The DVDs are now available for checkout, with digital archiving underway. Housing pressures and the fight to keep small-town character intact come up repeatedly — same as today.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_1ff33a89-d9d4-4512-94cf-6a2720e686a6.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/df/adf2b93c-7728-47ce-b4f9-58da26e944c3/6a624fa8b0fc3.image.jpg",
    imgHiRes: true
  },
  {
    title: "Work underway at Society Turn brings new medical facility closer",
    source: "Telluride Times",
    date: "July 24, 2026",
    firstSeen: "2026-07-24",
    newsTopic: "land-use",
    copy: "Site prep is underway at Society Turn for Telluride's long-planned new medical center — roads, retaining walls, and utilities are being laid by Genesee Properties, which donated the land. The med center expects to take possession late 2027 or early 2028, then begin construction on an expanded facility with a helipad, urgent care, and telehealth infrastructure. This project has been attempted several times over the years; this is the first time it's actually moving dirt.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_8de6f81a-6034-47af-83d9-289f209deb44.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/38/c383af44-054b-4ab1-8933-248a914a3deb/6a61599609c33.image.jpg",
    imgHiRes: true
  },
  {
    title: "Brass from some of the best",
    source: "Telluride Times",
    date: "July 24, 2026",
    firstSeen: "2026-07-24",
    newsTopic: "arts-culture",
    copy: "The New York Philharmonic Principal Brass Quintet returns to the Sheridan Opera House on July 31 at 8 p.m. after a well-received 2023 appearance during Telluride Chamber Music's 50th anniversary. The evening program spans Renaissance to Gershwin. Earlier that day, the quintet plays a free kids' concert at the Oak Street Gondola Plaza.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_2e5259f9-4c04-468f-848e-439dffc03d8d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/c7/dc7c9079-923d-41ff-ab58-97c50b81b233/6a59c157b008b.image.jpg",
    imgHiRes: true
  },
  {
    title: "A crowded shelter looks toward expansion",
    source: "Telluride Times",
    date: "July 23, 2026",
    firstSeen: "2026-07-23",
    newsTopic: "arts-culture",
    copy: "Hoof and Paw in Naturita has grown from helping 60–70 animals a year to over 300, and space is tight. The shelter is fundraising $34,000 for a converted shipping container — dubbed \"Caturita\" — to house cats, with $5,000 raised so far. Details and donations at hoofandpawcolorado.org.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_9c94c8cb-6ff1-4a0a-b3d7-253b3a8680a0.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/17/b171ccfe-3c61-47f6-a874-98d3fca4afb9/6a62419b1c29a.image.jpg",
    imgHiRes: true
  },
  {
    title: "Errico: ‘The State of the Town is strong and engaging’",
    source: "Telluride Times",
    date: "July 23, 2026",
    firstSeen: "2026-07-23",
    newsTopic: "community",
    copy: "Mayor Errico's mid-year State of the Town address shifted from January's \"ongoing disruption\" framing to \"strong and engaging,\" crediting residents, staff, and visitors rather than government. He highlighted completed infrastructure work — repaved bike paths, park improvements, housing programs — while calling for earlier civic involvement instead of last-minute pushback on decisions. The mudslides and wildfires still weigh on the region.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_ea5e5200-39e4-49fb-af23-33fe1f7dbfb3.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/b2/fb2dc9e0-020a-4ec4-9e31-330b8c8d14c1/6a6248857dc0c.image.jpg",
    imgHiRes: true
  },
  {
    title: "Summer sounds at The Yard",
    source: "Telluride Times",
    date: "July 23, 2026",
    firstSeen: "2026-07-23",
    newsTopic: "education",
    copy: "Telluride Chamber Music returns to The Yard at NPRD's Norwood campus for two free outdoor concerts — July 23 featuring a San Juan Symphony string quartet playing Mozart and Dvořák, and Aug. 27 with a jazzier set from keyboardist Kenny Goldman and saxophonist Yaz Ishikawa. Gates open 5:30 p.m., music runs 6–7 p.m. Bring a picnic and a blanket; rain moves things inside The Livery.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_fe7a2edf-4f4c-4e85-865f-8ab4d184b496.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/65/c655494b-791c-4ec8-a023-5fecb122c984/6a6240f29e76a.image.png",
    imgHiRes: true
  },
  {
    title: "CHALKBOARD Week of July 23-29",
    source: "Telluride Times",
    date: "July 23, 2026",
    firstSeen: "2026-07-23",
    newsTopic: "government",
    copy: "Community birthdays run July 23–29, and regular weekly events continue — Norwood Farmers Market Thursdays 2–6 p.m., Senior Meals Mondays and Thursdays at noon, Food Pantry Sundays 3–6 p.m. Free chamber music at The Livery on July 23, 6–7 p.m.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_90dc97b8-f5f6-4ef1-bbe1-f053707152d2.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/d8/8d85fcc6-d6d8-4992-8da7-93889651880e/6a622ba032bbf.image.png",
    imgHiRes: true
  },
  {
    title: "Chef showdown",
    source: "Telluride Times",
    date: "July 23, 2026",
    firstSeen: "2026-07-23",
    newsTopic: "community",
    copy: "Top Chef & Taste of Telluride returns August 1st at the Telluride Innovation Center, 5:30–9:30 p.m., benefiting One to One Mentoring. Two-time defending champ Graeme Charles faces challenger Jen Williams of Van Atta, a 22-year culinary veteran with James Beard–connected credits. Around 20 local chefs also participate in the tasting portion, with a silent auction alongside.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_4c8665b3-858d-4ef0-a484-adf343c93e92.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/47/147805a2-1f96-4d3e-a5ae-996fa67f66dd/6a607cb5acd38.image.jpg",
    imgHiRes: true
  },
  {
    title: "Legals and Public Notices for July 23-29, 2026",
    source: "Telluride Times",
    date: "July 23, 2026",
    firstSeen: "2026-07-23",
    newsTopic: "education",
    copy: "This week's legals include a creditor notice for the estate of Lawrence de Bivort (claims due Nov. 16), the Town of Telluride seeking proposals for Town Park and Warner Field improvements (due July 31), and San Miguel County seeking bids to repaint the Placerville Schoolhouse (due Aug. 6). A foreclosure proceeding has been filed in San Miguel County on a 2022 deed of trust.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/legals/article_fde85bc0-ac38-4ba1-9534-66f7d114f129.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride Preschool to change hands",
    source: "Telluride Times",
    date: "July 22, 2026",
    firstSeen: "2026-07-22",
    newsTopic: "education",
    copy: "Stephanie Baye is stepping down after 30 years directing Telluride Preschool, with Cale Cramer — a local who graduated from Telluride Middle/High School and has been running BeeHive daycare since 2023 — taking over in September. Cramer holds a child psychology degree and is currently in graduate school studying early childhood mental health.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/business/article_e2e19d5e-7c29-4c24-9db8-3c57f4302dda.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/af/4af9f358-778c-4840-87fc-5fea5ce2c2ba/6a607449a1b61.image.jpg",
    imgHiRes: true
  },
  {
    title: "New council members sworn in",
    source: "Telluride Times",
    date: "July 22, 2026",
    firstSeen: "2026-07-23",
    newsTopic: "government",
    copy: "Marya Stark and Charles Dalton were sworn in July 21 after winning the June 30 special election, bringing the full Telluride Town Council together outside Rebekah Hall on Columbia Avenue.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/gallery/article_8814ba5b-60a0-4973-80e7-322c72cf84be.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/f2/7f2c2ba8-ffe3-4f24-96f9-a0ed90af3769/6a6157bd889d9.image.jpg",
    imgHiRes: true
  },
  {
    title: "Fast and furious fun",
    source: "Telluride Times",
    date: "July 22, 2026",
    firstSeen: "2026-07-22",
    newsTopic: "arts-culture",
    copy: "The Sheridan Arts Foundation's Young People's Theater is staging *The Music Man* as part of its Summer Spectacular program — a five-day sprint from first rehearsal to full production, with 25 kids aged 8–14. Shows are free to the public on July 24 at 2pm and 4pm at the Sheridan.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_67f14313-ffd6-40ac-9e0a-0bf21a107cff.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/5e/95e82843-a06e-4203-a2be-1bd051e32c48/6a601b9a2aed5.image.jpg",
    imgHiRes: true
  },
  {
    title: "Grateful for Green Grant program",
    source: "Telluride Times",
    date: "July 21, 2026",
    firstSeen: "2026-07-21",
    newsTopic: "community",
    copy: "EcoAction Partners and San Miguel County's Green Grant program helped a Lawson Hill household replace two aging west-facing windows, with the homeowners reporting noticeable gains in comfort and energy efficiency. The 40-year-old windows had long needed updating.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_1bb9d39e-4569-435c-8b80-c03b8c3f74e3.html",
    img: "",
    letterAuthor: "Jeremy and Dawn Katz",
    imgHiRes: true,
    isLetter: true,
    authorChecked: true
  },
  {
    title: "Palm, school clean-up continues apace after last Friday’s flood",
    source: "Telluride Times",
    date: "July 21, 2026",
    firstSeen: "2026-07-21",
    newsTopic: "education",
    copy: "Mudslides from the Jud Wiebe area on July 17 sent water, mud, and debris through the Palm Theatre and adjacent schools, buckling the stage, flooding the orchestra pit, and depositing an estimated 10,000–15,000 lbs of mud. The goal is to have school spaces and Palm support areas ready by the Aug. 18 school opening. The main theater will take longer, though seating replacement is the top priority to allow Film Festival to proceed Sept. 4–7.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_24fa27f5-c902-452e-9879-6dd2717e1a17.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/17/917acda0-cd83-4d5f-be02-3fe89b58cfc7/6a5fb73da93a1.image.jpg",
    imgHiRes: true
  },
  {
    title: "The art of being",
    source: "Telluride Times",
    date: "July 21, 2026",
    firstSeen: "2026-07-21",
    newsTopic: "arts-culture",
    copy: "A local finds a quiet moment of stillness on a mesa walk — elk grazing, a hidden pond, a tended forest clearing with a picnic table and campfire ring. Simple surroundings, no agenda. The kind of morning this place still offers if you take a different turn.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_4024128f-535d-4c2b-a336-c0bd6c3daabc.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/fb/0fbd29c7-33f3-4edd-bc35-ba1fa07333a7/6a5fdca1bdc9f.image.jpg",
    imgHiRes: true,
    isLetter: true
  },
  {
    title: "How to fix our broken housing programs",
    source: "Telluride Times",
    date: "July 21, 2026",
    firstSeen: "2026-07-21",
    newsTopic: "housing",
    copy: "San Miguel County recently fixed a legal issue requiring deed-restricted buyers to sign new covenants at closing — a process involving outside counsel and public meetings. A local homeowner argues Telluride's program has similar and deeper problems: asset limits tied to original purchase price push out long-term residents, while ever-changing guidelines spanning 70 pages leave even town attorneys confused.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/editorials/article_8bcac1cf-be30-4f0f-9cd5-9bf05882a7d4.html",
    img: "",
    imgHiRes: true,
    isLetter: true
  },
  {
    title: "Beautiful windows, beautiful efficiency",
    source: "Telluride Times",
    date: "July 21, 2026",
    firstSeen: "2026-07-21",
    newsTopic: "community",
    copy: "A Norwood homeowner used a Regional Green Grant from EcoAction Partners to replace half the aging single-pane windows in a late-1950s house. The upgrade should cut heating and electricity costs, with plans to finish the remaining windows next year.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_f9cb36d9-a8f6-47a5-aae2-fb6bb5bc6f2a.html",
    img: "",
    letterAuthor: "Kerry Welch",
    imgHiRes: true,
    isLetter: true
  },
  {
    title: "Desensitizing bathtime",
    source: "Telluride Times",
    date: "July 21, 2026",
    firstSeen: "2026-07-21",
    newsTopic: "community",
    copy: "Anxious about bath time with your dog? Second Chance Humane Society recommends gradual desensitization — start with treats in the bathroom, work up to the tub, then water slowly over multiple short sessions. Most dogs do fine bathing every four to six weeks; when in doubt, check with your vet.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_07aceefb-041d-4513-97a4-46c6010427f4.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/ea/7ea33f08-ecb7-4bfd-ac51-07a31f2e5b11/6a5fdbd1ebbc1.image.jpg",
    imgHiRes: true
  },
  {
    title: "When the land that heals us turns toxic",
    source: "Telluride Times",
    date: "July 21, 2026",
    firstSeen: "2026-07-21",
    newsTopic: "community",
    copy: "Wildfire smoke has made outdoor activity — long the primary stress relief for many Telluride residents — a health calculation rather than a given this summer. A local therapist notes that losing access to trails, lakes, and clean air hits harder here than most places, since nature is central to how people cope. Research backs up what many are already feeling: smoke exposure is linked to increased anxiety, depression, and reactivated trauma.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/editorials/article_e29f4037-700b-485a-be15-716cdee2f545.html",
    img: "",
    imgHiRes: true,
    isLetter: true
  },
  {
    title: "Happy accidents",
    source: "Telluride Times",
    date: "July 21, 2026",
    firstSeen: "2026-07-21",
    newsTopic: "public-safety",
    copy: "A Telluride local shares a few of those hard-to-explain moments — running into a wedding couple 2,000 miles from town, a message bottle found in Bermuda by a family with the same dog's name, a daughter born on her great-great-grandmother's 100th birthday. The kind of stories that make you pause.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_300e6f97-c37e-4e31-9066-8930608f4e28.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/47/047217d6-3892-4274-811c-5d511543d118/6a5fdb420a985.image.jpg",
    imgHiRes: true,
    isLetter: true
  },
  {
    title: "Where is the next Valley Floor?",
    source: "Telluride Times",
    date: "July 21, 2026",
    firstSeen: "2026-07-21",
    newsTopic: "community",
    copy: "Federal cuts to the Forest Service and BLM are opening public San Juan lands to private development pressures — something the Valley Floor fight only partially addressed. The column argues that defending individual parcels isn't enough; the whole mountain ecosystem needs coordinated stewardship. A regional rethink, from Gunnison to Cortez, may be overdue.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_6a7660a4-a11c-4f33-900d-ff6aa110751b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/b3/1b30faef-00f2-4390-8531-111c5feec239/6a5fda0653aab.image.jpg",
    imgHiRes: true,
    isLetter: true
  },
  {
    title: "Documentary honoring sustainability leader Adam Palmer comes to Telluride",
    source: "Telluride Times",
    date: "July 21, 2026",
    firstSeen: "2026-07-21",
    newsTopic: "community",
    copy: "A documentary on the life and legacy of Eagle County sustainability leader Adam Palmer screens at the Sheridan Opera House on Saturday, Aug. 1, doors at 6:30 p.m., film at 7. A community discussion follows. Tickets at apsfund.org.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_dd45309e-10d6-4390-abf4-0e3c97dea8e8.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/88/588dbfcb-cf65-4908-b5ef-7c45b42d2175/6a5fd919cee74.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride Tourism Board announces new board",
    source: "Telluride Times",
    date: "July 21, 2026",
    firstSeen: "2026-07-21",
    newsTopic: "government",
    copy: "The Telluride Tourism Board has added three new members — Buck Smith, Andrés Vargas-Johnson, and Ashley Von Spreecken — bringing the full board to seven. Huascar Gomez was elected chair, with Danny Craft as vice chair. The board draws from lodging, brewing, retail, local government, and hospitality.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_7453a8a7-7fb1-440e-9b5c-51625d398514.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/d8/3d80f09d-f809-4fd5-b036-4708c4b6cd52/6a5fd7a73e6a0.image.jpg",
    imgHiRes: true
  },
  {
    title: "Where's Waldo?",
    source: "Telluride Times",
    date: "July 21, 2026",
    firstSeen: "2026-07-21",
    newsTopic: "community",
    copy: "The annual Where's Waldo town hunt returns to Telluride this July, with Waldo hidden in 25+ locations across town. Grab a playing card at Between the Covers or Bruno Coffee to get started. Prizes, free posters, and a grand prize drawing wrap up at month's end.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/gallery/featured/article_42ab2b1c-c142-402a-85b8-22eab7fd3b72.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/5d/95d78762-93a8-419e-bb4d-02ac62eeb04c/6a5fd6c0c8078.image.jpg",
    imgHiRes: true
  },
  {
    title: "The dual challenge: climate and energy",
    source: "Telluride Times",
    date: "July 21, 2026",
    firstSeen: "2026-07-21",
    newsTopic: "community",
    copy: "Climate scientists, oil executives, utility leaders, and investors gather in Telluride July 27–31 for a Telluride Science workshop aimed at finding common ground between energy demand and climate stability. A free public Town Talk follows July 28 at 6:30 p.m. at the Sheridan Opera House.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/editorials/article_ebdd9221-7fc0-4ace-b501-3a9c4b0c1279.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/6a/c6a9f0c4-5d2e-410e-8e8f-c9933badf732/6a5fd51da4a9e.image.png",
    imgHiRes: true,
    isLetter: true
  },
  {
    title: "Telski amends lawsuit against Prohaska, Wisor and Fee",
    source: "Telluride Times",
    date: "July 21, 2026",
    firstSeen: "2026-07-21",
    newsTopic: "arts-culture",
    copy: "Telski's lawsuit against former Mountain Village Mayor Prohaska, Town Manager Wisor, and former Mayor Pro Tem Fee is still active, now with an amended complaint adding transcripts from a disputed recording. The recording dispute centers on whether a meeting with owner Chuck Horning was illegally captured without consent. Defendants continue pushing for dismissal.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_fdd6316f-fb0f-4629-87d0-6ae9800e4251.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/4c/14c7ea5c-8180-433b-94c2-dbcc9f266fab/6a5e8c59ed331.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘A beautiful, full circle’",
    source: "Telluride Times",
    date: "July 20, 2026",
    firstSeen: "2026-07-20",
    newsTopic: "education",
    copy: "Rockies After School Program and Summer Camp has been part of this community for nearly 40 years, growing out of Rainbow Preschool into a nonprofit serving kids from toddlers through grade school. What stands out now is that former Rockies kids are coming back as staff — recent THS grad Caitlyn McKillop among them. Full circle, literally.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_0ef6ae31-f786-44d3-8cfc-15634273b28f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/93/793df834-8f72-4eaa-ad3f-cbfce8568b20/6a5ad34faa925.image.jpg",
    imgHiRes: true
  },
  {
    title: "Bridging the gap",
    source: "Telluride Times",
    date: "July 20, 2026",
    firstSeen: "2026-07-20",
    newsTopic: "community",
    copy: "Scientists, industry leaders, and policy experts gather at Telluride Science July 27–31 to work on aligning energy access with climate goals. A public Town Talk happens July 28 at the Sheridan Opera House at 6:30 p.m. with three featured speakers. Small-group format is intentional — it's how Telluride Science says it gets things done.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_cee728ec-1810-4365-a8d6-afb8517da935.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/7b/b7b5f9c5-ef54-4814-b50c-8bdab43b67bc/6a5dab2ba8a9c.image.jpg",
    imgHiRes: true
  },
  {
    title: "Stakeholders discuss housing density",
    source: "Telluride Times",
    date: "July 19, 2026",
    firstSeen: "2026-07-19",
    newsTopic: "housing",
    copy: "San Miguel County's Stakeholder Strategic Roundtable held its sixth meeting July 16, focusing on workforce housing types, zoning density definitions, and density bonus incentives as part of an ongoing land code audit. The county estimates it needs roughly 1,100 housing units by 2030, with nearly half its workers already commuting over 25 miles. No specific density recommendations have been finalized yet.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_3fa56ff6-1d64-4c3b-b271-0802fcb74db2.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/94/1948eea0-c2e0-49bc-afdc-e5c61414fd91/6a5ac8e016a5b.image.jpg",
    imgHiRes: true
  },
  {
    title: "An Indiana Jones training camp",
    source: "Telluride Times",
    date: "July 19, 2026",
    firstSeen: "2026-07-19",
    newsTopic: "community",
    copy: "Two blind NYC athletes packed six days in Telluride with hiking, kayaking, horseback riding, and rock climbing — all through the Telluride Adaptive Sports Program. TASP has been connecting disabled athletes with guides and gear since well before most current visitors arrived. The program runs on trust, scholarships, and is actively looking to bring in more athletes.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_5cf2f313-b303-4253-ac23-b8d52d494b56.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/51/651e632a-406c-473a-9647-c1dfa30ec26a/6a5ac184588e3.image.jpg",
    imgHiRes: true
  },
  {
    title: "Saturday update: It’s still messy",
    source: "Telluride Times",
    date: "July 19, 2026",
    firstSeen: "2026-07-19",
    newsTopic: "community",
    copy: "Saturday brought another round of slides — up to a dozen at once — closing Hwy 145 between Keystone and Sawpit for about six hours. Imogene Pass and Tomboy Road remain closed, West Galena saw flooding, and the Palm/TIS cleanup continues with a SERVPRO crew expanding to 30–40 workers by Monday.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_28b83b17-44bd-4ac6-8c11-200dfc9236bc.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/01/e01ed97f-f51c-45e0-82bb-7b3c394d7893/6a5c42d188d9d.image.jpg",
    imgHiRes: true
  },
  {
    title: "Hickenlooper’s office updates county commissioners on relevant initiatives",
    source: "Telluride Times",
    date: "July 18, 2026",
    firstSeen: "2026-07-18",
    newsTopic: "government",
    copy: "Sen. Hickenlooper's Southwest Regional Director briefed San Miguel County commissioners on several active issues, including voting rights legislation, immigration enforcement oversight, and public lands bills covering hundreds of thousands of Colorado acres. Wildfire resources, IRA water projects, and a major 2024 gas spill on Southern Ute land were also on the agenda.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_ad1056b1-54f0-4ac3-ad15-7f43c2fd6f07.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/da/9daf1ab2-558d-4e28-9814-44db631d9128/6a5abd5662386.image.webp",
    imgHiRes: true
  },
  {
    title: "Region expected to see record low streamflows",
    source: "Telluride Times",
    date: "July 18, 2026",
    firstSeen: "2026-07-18",
    newsTopic: "land-use",
    copy: "Warm, dry winter conditions have pushed streamflows across the region to historic lows — the Uncompahgre at Ridgway hit an all-time record, while the San Miguel, Animas, and Dolores all logged fourth-lowest levels. Up to 20 miles of the San Miguel may drop below 10 cfs, stressing native fish and raising metal concentrations. Monsoon rains are unlikely to meaningfully shift the numbers this late in the season.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_dbdd8f79-5b19-431b-a325-7f028ec16a45.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/76/c76a2cd6-fb63-457e-b6c6-29005be04252/6a5aba1513e44.image.jpg",
    imgHiRes: true
  },
  {
    title: "Updated: Palm, parts of TIS and TM/HS flooded",
    source: "Telluride Times",
    date: "July 18, 2026",
    firstSeen: "2026-07-18",
    newsTopic: "education",
    copy: "Friday afternoon's heavy rain triggered mudslides from the Jud Wiebe Trail area, flooding the Palm Theatre with 3–4 feet of water and mud after a loading dock door gave way. Parts of TIS and TM/HS were also affected. No injuries reported; remediation crews were already on scene.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_32546b30-de8d-4012-8929-88d83de86934.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/d6/0d6a74ff-58d1-4a51-b5ae-38b9f261deac/6a5af1330fabf.image.jpg",
    imgHiRes: true
  },
  {
    title: "Off-duty employee arrested in shooting near ICE detention center in Colorado that injured a woman",
    source: "Telluride Times",
    date: "July 18, 2026",
    firstSeen: "2026-07-18",
    newsTopic: "public-safety",
    copy: "An off-duty GEO Group employee at Aurora's ICE detention center was arrested after allegedly firing his personal handgun at two women who had photographed employees' vehicles during a protest, striking one in the foot. He faces attempted second-degree murder and first-degree assault charges. GEO Group placed him on unpaid leave.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_1d300f4d-c6e5-5354-9a1b-5fa283c52025.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Men sue hospital after DNA tests showed they were switched at birth 38 years ago",
    source: "Telluride Times",
    date: "July 18, 2026",
    firstSeen: "2026-07-18",
    newsTopic: "health",
    copy: "Two men born on the same day in 1988 at a North Dakota hospital discovered through at-home DNA tests that they were switched at birth. The hospital acknowledges the switch happened but says records are gone and no staff from that era remain. Both men have sued.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_ede3518b-803d-50b3-adac-038ef418a20e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/6c/16c1336b-33d2-5a9b-92e5-ea1ac759c262/6a5ab1a7616dc.image.jpg",
    imgHiRes: true
  },
  {
    title: "A multifaceted organization now has a simple name",
    source: "Telluride Times",
    date: "July 17, 2026",
    firstSeen: "2026-07-17",
    newsTopic: "health",
    copy: "Tri-County Health Network is rebranding to Thrive Community Health Network on August 1, with a new logo and website refresh expected this fall. The organization has grown from serving three counties to six and wanted a name that reflects that expanded reach and its broad range of health and social services. They're also hosting their first-ever fundraiser, Noche de Luz, on August 21 in Telluride.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_1e26f36a-c914-4b60-952c-6266967becf3.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/54/e5438fcb-fc3c-41aa-9ed1-e209adbf96da/6a59c674d3b6c.image.jpg",
    imgHiRes: true
  },
  {
    title: "BOCC discusses public lands",
    source: "Telluride Times",
    date: "July 17, 2026",
    firstSeen: "2026-07-17",
    newsTopic: "housing",
    copy: "San Miguel County commissioners signed letters of support for two federal public lands bills — one barring land sales through budget reconciliation, another halting layoffs at Interior and the Forest Service through 2030. Colorado has seen a 26% cut in public land agency staff since January. They also backed a $200,000 grant application for a floating solar project near Norwood.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_65e1b685-2138-4a3b-bcfc-cd30b2c7fe99.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/47/c47437c9-5b07-4b76-b927-9099f02f7100/6a59c3a8929bd.image.jpg",
    imgHiRes: true
  },
  {
    title: "Nugget documentary premieres July 25",
    source: "Telluride Times",
    date: "July 16, 2026",
    firstSeen: "2026-07-16",
    newsTopic: "community",
    copy: "A 30-minute documentary about the Nugget Building's 23-year restoration premieres July 25 at the Sheridan Opera House — 6:30–9 p.m., tickets $25, proceeds to the Telluride Historical Museum. The film draws on footage Katrine Formby shot throughout the process and will also air on Rocky Mountain PBS August 27.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_2f7e38c8-ff08-4b9f-ae12-2f5aa1569469.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/e7/fe77c416-28f8-42ce-b739-59554210f863/6a588d9c070a0.image.jpg",
    imgHiRes: true
  },
  {
    title: "Conversing with horses is for everyone",
    source: "Telluride Times",
    date: "July 16, 2026",
    firstSeen: "2026-07-16",
    newsTopic: "community",
    copy: "Three authors behind *Horse Brain Science* — neuroscientist Steven Peters, Crissi McDonald, and Mark Rashid — visit Norwood's Lone Cone Library on July 23 for a community dinner and public conversation, brought in by San Miguel Basin CSU Extension and the local 4-H horse program. Tickets are $10, seating is limited to 144.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_4da54dde-2df0-445c-8a30-287d81ebefa0.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/d1/3d1c362c-4c1a-4c2f-bed6-9770fcca18e0/6a578902e8264.image.jpg",
    imgHiRes: true
  },
  {
    title: "David and Goliath in the wild",
    source: "Telluride Times",
    date: "July 16, 2026",
    firstSeen: "2026-07-16",
    newsTopic: "community",
    copy: "Small birds mobbing a hawk, ants taking down large prey, a kangaroo rat dodging a rattlesnake — the region's wildlife offers daily reminders that size and force aren't the only things that matter out here. The piece draws a line from those moments straight through to Gandhi and beyond.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_c7f478a3-7de2-4d22-8220-d133d8e78bc8.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/db/1db08448-f03b-4dc0-8418-e238ebce6dcc/6a578a49ce53b.image.jpg",
    imgHiRes: true
  },
  {
    title: "CHALKBOARD Week of July 16-22",
    source: "Telluride Times",
    date: "July 16, 2026",
    firstSeen: "2026-07-16",
    newsTopic: "government",
    copy: "The Telluride Times Chalkboard for July 16–22 lists birthdays for a dozen local residents and runs through the regular community calendar — town board, school board, farmers market, senior meals, food pantry, pickleball, and more. Most recurring meetings and services in Norwood and the Nucla-Naturita area follow their usual schedules.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_4c261cdf-35eb-46b1-93cf-da23a9eba1d4.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/f2/bf21fdc4-695b-40e7-9eeb-5cfe0e537f13/6a578b2e20d14.image.jpg",
    imgHiRes: true
  },
  {
    title: "Paradox Valley ranch permanently protected",
    source: "Telluride Times",
    date: "July 16, 2026",
    firstSeen: "2026-07-16",
    newsTopic: "community",
    copy: "A 266-acre ranch in Paradox Valley near Bedrock has been permanently protected through a conservation easement with Colorado West Land Trust, conserving over a mile of Dolores River frontage alongside a neighboring 114-acre easement completed last year. Landowner Jim Johnston bought the parcels between 2008 and 2016 specifically to keep them from being developed. More than 1,400 acres within 10 miles are now permanently protected.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_8dc56b93-f9b3-43d4-bba2-eb46a7a8d82f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/8a/c8afbd54-900c-4622-ba84-7e00b6f1b01e/6a5785713dd15.image.png",
    imgHiRes: true
  },
  {
    title: "Meet the winners of Norwood’s annual dessert contest",
    source: "Telluride Times",
    date: "July 16, 2026",
    firstSeen: "2026-07-16",
    newsTopic: "community",
    copy: "The San Miguel Basin Fair dessert contest wrapped up its 42nd year in Norwood on July 11 with a record 87 entries across categories from pie to ice cream, drawing over 300 attendees. Winners took home hand-crafted wooden spoons and aprons across youth, amateur, and professional divisions.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_0df299c3-ee21-4cb6-8cd8-ec4e12c773b1.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/31/231edc8b-2dc1-4603-8af0-c0d5aa52b66a/6a57873cd5a89.image.png",
    imgHiRes: true
  },
  {
    title: "‘Once more unto the breach, dear friends’",
    source: "Telluride Times",
    date: "July 16, 2026",
    firstSeen: "2026-07-16",
    newsTopic: "community",
    copy: "Telluride Theatre opens \"Henry V\" in Town Park on July 17, directed by Jim Cairl — a New York actor who first came out in 2024 on short notice and has been back every summer since. Julia Caulfield plays the king, with a cast that includes several longtime local performers.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_cca895f7-7e7c-451a-b8ee-fd5a3e0891b7.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/dc/6dc4fa40-eaac-4e2f-9aa0-56e45146e4fc/6a574d9ec8af2.image.jpg",
    imgHiRes: true
  },
  {
    title: "Legals and Public Notices for July 16-22, 2026",
    source: "Telluride Times",
    date: "July 16, 2026",
    firstSeen: "2026-07-16",
    newsTopic: "education",
    copy: "San Miguel County commissioners hold a public hearing August 5 on two Land Use Code changes — one redefining \"Qualified Owner\" in affordable housing rules, another updating wildfire area regulations. The Town of Telluride is also taking proposals through July 31 for Town Park oval and Warner Field improvements.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/legals/article_6d5eb2e7-d860-4528-8e72-754a66dad591.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "‘We are going to find a way’",
    source: "Telluride Times",
    date: "July 15, 2026",
    firstSeen: "2026-07-15",
    newsTopic: "community",
    copy: "SMRC's July 21 fundraiser comes as the nonprofit faces steep funding cuts — over $150K lost annually from federal VOCA and state domestic violence grants, plus $290K gone from its youth prevention program. Demand for services is up even as resources shrink. The event is a chance for the community to hear directly from staff and survivors.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_e632b0f9-196e-48ad-8420-45fa7b15ad33.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/71/071eae54-0016-4adb-9037-06a7c09719de/6a5749528470f.image.jpg",
    imgHiRes: true
  },
  {
    title: "Horror and romance",
    source: "Telluride Times",
    date: "July 15, 2026",
    firstSeen: "2026-07-15",
    newsTopic: "community",
    copy: "A personal piece reflecting on a trip from Denver to Michigan — visiting family, taking in a minor league baseball game in Lansing, and attending a high school reunion in Ann Arbor. Along the way, there are observations about friendship, history, and human nature, with a stop at the Tattered Cover in DIA.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_8e22fbcf-5504-466d-a27a-d86bdcd81bb8.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/de/ede435f0-ee44-47a3-a78f-93606816902f/6a56ae47c7c91.image.jpg",
    imgHiRes: true,
    isLetter: true
  },
  {
    title: "BF Deal",
    source: "Telluride Times",
    date: "July 15, 2026",
    firstSeen: "2026-07-15",
    newsTopic: "arts-culture",
    copy: "Jim Bedford, known as \"BF Deal,\" passed away at 81 after more than 50 years shaping Telluride. He co-founded KOTO radio, helped build the Telluride Film Festival over 36 years, and led Mountainfilm in its early days. He moved here in 1972 and never really stopped working.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_9657a583-1b26-466a-96a5-12dce3a67f9c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/a2/9a21030a-af6f-4777-bec4-6254e892d0b6/6a569d831f3fd.image.jpg",
    imgHiRes: true
  },
  {
    title: "Free Oak Street Park SummerSHOW Series continues",
    source: "Telluride Times",
    date: "July 14, 2026",
    firstSeen: "2026-07-14",
    newsTopic: "recreation",
    copy: "The Sheridan Arts Foundation's free Oak Street Park SummerSHOW Series has three concerts left this summer — Selasee (July 23), Deltaphonic (Aug. 20), and Mariachi San José (Sept. 24). Shows are on the Opera House patio at 110 S. Oak St., with bar service and food on site. Bring a chair or blanket.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_15291567-c87c-41b3-a999-d18e401ed6b1.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/eb/3ebe7471-92ca-4564-9ce7-be3766f5bcc6/6a56b1680e010.image.jpg",
    imgHiRes: true
  },
  {
    title: "National Forest Foundation leaders convene in Telluride",
    source: "Telluride Times",
    date: "July 14, 2026",
    firstSeen: "2026-07-14",
    newsTopic: "community",
    copy: "The National Forest Foundation's board and executive leadership are meeting in Telluride July 21–24 to focus on wildfire preparedness and forest stewardship across the West. Field tours will visit Blue Lakes, Alta Lakes, and Lizard Head Pass to review active and potential projects on the GMU National Forests. The foundation cited the region's collaborative stewardship work as a reason for choosing Telluride.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_1c1dd375-ddcc-4895-b7fd-e0bf46364854.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/93/59354ae2-1072-4770-839a-08dfb371291f/6a56ad4f5520a.image.jpg",
    imgHiRes: true
  },
  {
    title: "Talking Gourds features Esther Belin, Diné poet and artist",
    source: "Telluride Times",
    date: "July 14, 2026",
    firstSeen: "2026-07-14",
    newsTopic: "arts-culture",
    copy: "Diné poet and artist Esther Belin, Durango's Poet Laureate, will read at Talking Gourds in the Wilkinson Public Library on July 21 at 5:15 p.m. The free event welcomes all ages; attendees are encouraged to bring a poem or story to share. This month's prompt is \"Water.\"",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_21a5512e-d334-4631-9607-3b5039fa2c18.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/82/682efc5f-d5fc-4198-9f35-33f18e5edfa7/6a56ac73c917f.image.jpg",
    imgHiRes: true
  },
  {
    title: "Western Colorado University publishing students launch new anthology",
    source: "Telluride Times",
    date: "July 14, 2026",
    firstSeen: "2026-07-14",
    newsTopic: "education",
    copy: "Western Colorado University's MFA publishing students are launching their seventh anthology, \"Into the Deep, Dark Woods\" — 28 stories and poems spanning fantasy, horror, and fairy tale — on July 22 at 6 p.m. in Gunnison. Students handled every stage of production. Free and open to the public.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_e683da6f-ed51-4cba-a061-e0de05143b01.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/32/43277e79-0c17-4ce8-b8a5-06f2cb50ebc9/6a56aa6340648.image.jpg",
    imgHiRes: true
  },
  {
    title: "When the cure is a virus",
    source: "Telluride Times",
    date: "July 14, 2026",
    firstSeen: "2026-07-14",
    newsTopic: "community",
    copy: "Salk Institute researcher Dr. Clodagh O'Shea presents a free Town Talk July 21 at 6:30 p.m. at the Telluride Conference Center in Mountain Village. She'll explain how her lab engineers viruses to target and destroy cancer cells while leaving healthy tissue alone — work now in clinical trials. The series runs Tuesdays through Aug. 11.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/article_6628b1e5-34db-4c20-bfc5-751e692a85eb.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/a0/8a02af43-dff7-4bc9-b5f2-30872ac66c2f/6a56ab4170bd2.image.jpg",
    imgHiRes: true,
    isLetter: true
  },
  {
    title: "Friends don't leave friends in hot cars",
    source: "Telluride Times",
    date: "July 14, 2026",
    firstSeen: "2026-07-14",
    newsTopic: "community",
    copy: "Parked cars heat up fast ' a 78°F day can push interior temps past 160°F in the sun within 30 minutes, which can kill a dog quickly. Colorado law outlines specific steps before breaking a window: call 911 first, document the vehicle, and use only necessary force. If you see a dog in distress, don't improvise — follow the statute.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_353d28c9-dfea-4ade-ad90-8db000b2e533.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/b8/fb871491-6ed0-4c10-99fa-03eb13bb7e16/6a56a9b0bbeaa.image.jpg",
    imgHiRes: true
  },
  {
    title: "The Town of Mountain Village launches national search for manager",
    source: "Telluride Times",
    date: "July 14, 2026",
    firstSeen: "2026-07-14",
    newsTopic: "recreation",
    copy: "Mountain Village is conducting a national search for a new town manager, partnering with recruitment firm KRW Associates. The position oversees 160 staff and a $50M+ budget, with big regional projects on the table — workforce housing, a wastewater plant, and gondola replacement. Applications close August 7th.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_cc5e0637-37bb-4d32-9b24-997459f1eb3c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/e3/de3c2535-1551-4e46-9ea3-2dd51e8bfd5a/6a56a8a5c1c4f.image.jpg",
    imgHiRes: true
  },
  {
    title: "Keep the Oval green",
    source: "Telluride Times",
    date: "July 14, 2026",
    firstSeen: "2026-07-14",
    newsTopic: "recreation",
    copy: "Two of the original builders of Telluride Town Park — who laid the sod and shaped those six acres starting in 1980 — are weighing in against paving the Oval for courts. They watched kids fill that grass during Bluegrass and say hardscape isn't the right trade-off. They're suggesting the indoor hockey arena and high school gym get a second look first.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/editorials/article_5de44ae8-c964-4dd9-af23-ec624d5e7782.html",
    img: "",
    imgHiRes: true,
    isLetter: true
  },
  {
    title: "A community, not just a destination",
    source: "Telluride Times",
    date: "July 14, 2026",
    firstSeen: "2026-07-14",
    newsTopic: "community",
    copy: "A Democratic candidate for San Miguel County Commissioner is making workforce housing, economic diversification, and transparent government the center of his campaign. He argues that when workers can't afford to live where they work, schools thin out, businesses struggle to keep staff, and longtime residents quietly leave. The election is November 3.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_eff6f5ee-f9a1-4021-bbbd-927e0c953039.html",
    img: "",
    imgHiRes: true,
    isLetter: true
  },
  {
    title: "Death, rebirth and morels",
    source: "Telluride Times",
    date: "July 14, 2026",
    firstSeen: "2026-07-14",
    newsTopic: "community",
    copy: "Last summer's Stoner Mesa Fire burned 10,000 acres above Rico in the San Juans. A recent visit to the burn scar turned up unexpected morels — mushrooms that respond to fire's heat and ash-rich soil as a cue to fruit, helping stabilize soils and kick off forest recovery. Heavy loss, but the cycles still turn up here.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_558a094b-2688-4cb2-92bf-a322bdfd5b43.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/06/a066739c-ff2a-462b-a5b9-67b0793e6e62/6a56a442a7441.image.jpg",
    imgHiRes: true,
    isLetter: true
  },
  {
    title: "Looking for a ‘unicorn buyer’",
    source: "Telluride Times",
    date: "July 14, 2026",
    firstSeen: "2026-07-14",
    newsTopic: "land-use",
    copy: "Five of 24 homes at Pinion Park, an affordable housing development in Norwood, are listed for sale but finding no takers. The AMI income caps create a narrow buyer pool, and without the low-interest, no-down-payment loans original buyers received, the ~$370K asking prices are out of reach for income-qualified buyers. Rural Homes and the county are exploring options, but grant covenants leave limited room to maneuver.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_0f4d036f-b01e-4091-ae66-3a1849e04921.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/cc/0cced57b-f9dc-4119-ba73-3c2b0d53b758/6a55d8e525046.image.jpg",
    imgHiRes: true
  },
  {
    title: "Pickleball players need their own space",
    source: "Telluride Times",
    date: "July 14, 2026",
    firstSeen: "2026-07-14",
    newsTopic: "community",
    copy: "A resident letter to the editor raises concerns about pickleball sharing space with tennis at Town Park, citing noise carrying into the East End neighborhoods, nets left on courts, and players gathering early during reserved tennis time. The writer suggests the Hanley Rink could serve as a dedicated pickleball venue. Strong turnout at the June 30 Town Council meeting apparently opposed cementing the park oval for pickleball and basketball.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_09674367-044f-4f2f-90a0-72d04793246d.html",
    img: "",
    letterAuthor: "Mary Sama-Brown",
    imgHiRes: true,
    isLetter: true
  },
  {
    title: "Democracy depends on participation",
    source: "Telluride Times",
    date: "July 14, 2026",
    firstSeen: "2026-07-14",
    newsTopic: "arts-culture",
    copy: "San Miguel County Democrats held a community picnic July 5th, introducing local candidates including Lane Masters for sheriff, Paul Reich for commissioner, and incumbents Emil Sante, Michael Wyszynski, Brandi Hatfield, and Dave Foley. State House District 58 candidate Alec Lindeman also attended.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_b2b08b03-551a-4eb2-b42f-bf9522e89821.html",
    img: "",
    letterAuthor: "San Miguel County Democrats",
    imgHiRes: true,
    isLetter: true
  },
  {
    title: "What to know about Trump's order shrinking the size of 2 national monuments in Utah",
    source: "Telluride Times",
    date: "July 14, 2026",
    firstSeen: "2026-07-14",
    newsTopic: "community",
    copy: "Trump has signed an order shrinking Bears Ears and Grand Staircase-Escalante national monuments in Utah from over 3.2 million acres to under 303,000 acres combined — a bigger cut than his first term. Utah officials support the move; tribal nations and conservationists say it opens sacred lands to mining.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_124dcf61-0626-5f12-ba0b-7e25ab746916.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/91/69129540-2171-588c-8ea6-b38558c446b6/6a558bcc1da3c.image.jpg",
    imgHiRes: true
  },
  {
    title: "Trump reduces size of 2 national monuments in Utah as Republicans reshape land management",
    source: "Telluride Times",
    date: "July 14, 2026",
    firstSeen: "2026-07-14",
    newsTopic: "community",
    copy: "Trump has reduced Bears Ears and Grand Staircase-Escalante national monuments in Utah by roughly 90% each — from over 3.2 million acres combined down to under 303,000 — opening much of the land to potential mining and drilling. He took similar action in his first term; Biden reversed it. Tribal nations consider Bears Ears a living cultural site and say they weren't properly consulted.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_e6bb1b22-8f36-5cdf-b863-3b7ab23f7677.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/2b/42b866df-fd6b-549a-a651-fc401894ebc5/6a558bd227dd3.image.jpg",
    imgHiRes: true
  },
  {
    title: "Busy wildfire season tests US fire bosses as they juggle resources to stay ahead",
    source: "Telluride Times",
    date: "July 14, 2026",
    firstSeen: "2026-07-14",
    newsTopic: "public-safety",
    copy: "Wildfire season is running hot across the West — over 5,600 square miles burned so far, outpacing the decade average. Three firefighters have died in Colorado, resources are stretched to preparedness level 4, and conditions from the Four Corners north aren't expected to ease until September.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_80b44c87-dd50-5e16-843e-a6bb73bd2f53.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/50/350f0ba2-b8fe-5bab-866d-6e3ace65c12f/6a55b864849b6.image.jpg",
    imgHiRes: true
  },
  {
    title: "San Miguel County Search and Rescue mission goes viral",
    source: "Telluride Times",
    date: "July 14, 2026",
    firstSeen: "2026-07-14",
    newsTopic: "public-safety",
    copy: "A BASE jumper activated a Garmin SOS in Columbine Basin on July 6, triggering a nine-hour, 20-person SAR response — then declined helicopter transport and hiked out. The sheriff's office publicly criticized the man, citing a prior Alps rescue, and the post drew 1,800+ comments. The subject later posted their own account disputing the sheriff's characterization.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_510cc405-a85a-4df5-8f1a-0787ddeed37e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/83/283f5bf8-c554-438a-97c6-49a9401037f6/6a55d58c6a824.image.jpg",
    imgHiRes: true
  },
  {
    title: "Town of Telluride Welcomes Patrick Rondinelli as Deputy Town Manager",
    source: "Town of Telluride",
    date: "June 30, 2026",
    newsTopic: "recreation",
    copy: "(June 30, 2026) – The Town has hired Patrick Rondinelli as its new Deputy Town Manager. He joins the Town with more than two decades of local government leadership experience & a deep understanding of the opportunities & challenges facing mountain towns.",
    href: "https://www.telluride.gov/CivicAlerts.aspx?aid=399",
    img: "https://www.telluride.gov/ImageRepository/Document?documentID=15606"
  },
  {
    title: "Home Rebate Programs",
    source: "San Miguel County",
    date: "July 8, 2026",
    newsTopic: "community",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1403",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14355"
  },
  {
    title: "Numerous Highway Closures",
    source: "San Miguel County",
    date: "July 22, 2026",
    newsTopic: "community",
    copy: "Due to heavy rains, highways 145 and 62 are experiencing mudslides in various locations. Several sections are impassable, with no expected reopening time yet. CDOT is en route. More information will be shared as it becomes available.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=537",
    img: ""
  },
  {
    title: "Tomboy Road",
    source: "San Miguel County",
    date: "July 21, 2026",
    newsTopic: "housing",
    copy: "Due to hazardous conditions, lower Tomboy Road is currently closed to all pedestrian and vehicle traffic. The road is closed below Smuggler Mine, above Telluride and below Tomboy. The road is scheduled to be reopened Wednesday 7/22 at 8:00 a.m.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=536",
    img: ""
  },
  {
    title: "Tomboy Road reopens Weds 7/22 8AM",
    source: "San Miguel County",
    date: "July 21, 2026",
    newsTopic: "infrastructure",
    copy: "Due to hazardous conditions, Tomboy Road is closed to all pedestrian and vehicle traffic.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=535",
    img: ""
  },
  {
    title: "Black Bear Pass is now open. Please check with San Juan County for the current status of the pass on their side.",
    source: "San Miguel County",
    date: "July 14, 2026",
    newsTopic: "housing",
    copy: "Black Bear Pass is now open. Please check with San Juan County for the current status of the pass on their side.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=534",
    img: ""
  },
  {
    title: "Imogene Pass & Tomboy Road Closure",
    source: "Town of Telluride",
    date: "July 18, 2026",
    newsTopic: "infrastructure",
    copy: "Imogene Pass and Tomboy Road are closed to all vehicle and pedestrian traffic following mudslides and flooding on Friday, July 17. The duration of the closure is unknown.",
    href: "https://www.telluride.gov/AlertCenter.aspx?AID=70",
    img: ""
  },
  {
    title: "Town of Telluride Election Today",
    source: "Town of Telluride",
    date: "June 30, 2026",
    newsTopic: "government",
    copy: "Results for today's Town of Telluride special election are being reported live by San Miguel County. Updated totals will be posted as ballots are counted. View the live election results: https://bit.ly/totelection26",
    href: "https://www.telluride.gov/AlertCenter.aspx?AID=69",
    img: ""
  },
  {
    title: "Aug 13 Open House for Housing Action Plan &amp; Master Plan Water Supply Element",
    source: "Town of Ridgway",
    date: "July 24, 2026",
    firstSeen: "2026-07-24",
    newsTopic: "housing",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Aug-Ridgway-HAP-Open-House.pdf",
    img: ""
  },
  {
    title: "Notice of Vacancy on Sustainability Advisory Board",
    source: "Town of Ridgway",
    date: "July 23, 2026",
    firstSeen: "2026-07-23",
    newsTopic: "government",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/07-2926-Vacancy-on-SAB-Notice.pdf",
    img: ""
  },
  {
    title: "Mayor John Clark Receives Prestigious Award",
    source: "Town of Ridgway",
    date: "July 14, 2026",
    firstSeen: "2026-07-14",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2-Mayor-John-Clark-Receives-Prestigious-Award-2026-07-14.pdf",
    img: ""
  },
  {
    title: "Ridgway Sustainability Advisory Board Meeting Agenda",
    source: "Town of Ridgway",
    date: "August 4, 2026",
    firstSeen: "2026-07-24",
    newsTopic: "government",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/SAB-Meeting-Packet---August-4%2C-2026.pdf",
    img: ""
  }
];

const KOTO_NEWSCASTS = [
  {
    title: "Newscast 7-24-26",
    source: "KOTO Community Radio",
    date: "July 25, 2026",
    newsTopic: "land-use",
    copy: "On this week's Regional Roundup, we'll hear about the recent awards given by Aspen nonprofit Climate Curve for innovative climate solutions. Then we'll hear how President Trump has reduced the size of Bears Ears and Grand Staircase Escalante National Monuments, reducing protections for the iconic landscapes. Then we find out how an animal shelter i",
    href: "https://koto.org/news/newscast-7-24-26/"
  },
  {
    title: "Newscast 7-23-26",
    source: "KOTO Community Radio",
    date: "July 24, 2026",
    newsTopic: "recreation",
    copy: "West End Roundup with the San Miguel Basin Forum; Recreation on the Uncompahgre River; Cat Movie Fisher with Risho Unda",
    href: "https://koto.org/news/newscast-7-23-26/"
  },
  {
    title: "Newscast 7-22-26",
    source: "KOTO Community Radio",
    date: "July 23, 2026",
    newsTopic: "housing",
    copy: "Preparing for Mudslides; Telluride Extends Housing Waitlist Suspension; A State of the Town Address",
    href: "https://koto.org/news/newscast-7-22-26/"
  },
  {
    title: "Newscast 7-20-26",
    source: "KOTO Community Radio",
    date: "July 21, 2026",
    newsTopic: "health",
    copy: "Palm Theatre Floods in Major Rainstorm; Coming Up Next, Telluride; Forest Health with Jason Sibold",
    href: "https://koto.org/news/newscast-7-20-26/"
  },
  {
    title: "Newscast 7-17-26",
    source: "KOTO Community Radio",
    date: "July 18, 2026",
    newsTopic: "public-safety",
    copy: "On this week's Regional Roundup, we'll hear about some of the fires burning in the region, we'll hear from evacuees from the Aspen Acres fire, we pay a visit to the incident command post for the Gold Mountain Fire in Western Colorado to hear what it takes to support the hundreds of firefighters battling the blaze, and we'll hear about the ecologica",
    href: "https://koto.org/news/newscast-7-17-26/"
  },
  {
    title: "Newscast 7-16-26",
    source: "KOTO Community Radio",
    date: "July 17, 2026",
    newsTopic: "community",
    copy: "West End Roundup with the San Miguel Basin Forum; Cat Movie Fisher with Risho Unda; Women in Fierce Country",
    href: "https://koto.org/news/newscast-7-16-26/"
  },
  {
    title: "Newscast 7-15-26",
    source: "KOTO Community Radio",
    date: "July 16, 2026",
    newsTopic: "public-safety",
    copy: "Firefighters Begin Repair Work on Ferris Fire Land; Finding the Glorians with Terry Tempest Williams; Goats Return to the Valley Floor",
    href: "https://koto.org/news/newscast-7-15-26/"
  },
  {
    title: "Newscast 7-13-26",
    source: "KOTO Community Radio",
    date: "July 14, 2026",
    newsTopic: "public-safety",
    copy: "ICE Arrests Man Outside San Miguel County Jail; Firefighter Dies Battling Gold Mountain; Charles Dalton Elected to Telluride Town Council",
    href: "https://koto.org/news/newscast-7-13-26/"
  }
];

const KOTO_FEATURED_STORIES = [
  {
    title: "Palm Theatre Floods in Major Rainstorm",
    source: "KOTO Community Radio",
    date: "July 21, 2026",
    newsTopic: "land-use",
    copy: "The Palm Theatre and portions of the Telluride Intermediate and Middle Schools flooded after a mudslide pushed through a loading door. With feet of water and mud in the building, cleanup begins.",
    href: "https://koto.org/news/palm-theatre-floods-in-major-rainstorm/"
  },
  {
    title: "Finding the Glorians with Terry Tempest Williams",
    source: "KOTO Community Radio",
    date: "July 16, 2026",
    newsTopic: "community",
    copy: "In her new book, The Glorians: Visitations from the Holy Ordinary, author Terry Tempest Williams asks us to find moments of grace in a complicated world. Tempest Williams spoke with KOTO's Julia Caulfield.",
    href: "https://koto.org/news/finding-the-glorians-with-terry-tempest-williams/"
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
  },
  {
    title: "Ouray locals reflect on impacts of fire",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "July 8, 2026",
    firstSeen: "2026-07-08",
    dateSource: "article",
    newsTopic: "public-safety",
    copy: "The Gold Mountain Fire started June 27 near Ouray and has burned over 31,400 acres in steep, hard-to-reach terrain on the Cimarron Range — tough enough that it's now a top national priority with 800+ firefighters deployed. Evacuations along U.S. 550 hit during what's normally Ouray's busiest week, and local businesses are reporting cancellations up 30–50%, with one KOA owner estimating $75,000–$100,000 in losses.",
    claudeSummary: true,
    href: "https://www.sanmiguelbasinforum.com/stories/ouray-locals-reflect-on-impacts-of-fire,121620",
    img: ""
  },
  {
    title: "It’s time to bake; annual dessert contest is July 11",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    dateSource: "article",
    newsTopic: "education",
    copy: "The San Miguel Basin Fair's annual dessert contest returns July 11 at Norwood School, with drop-off starting at 2 p.m. and judging at 5 p.m. Open to pros, non-pros, youth, and non-residents, the contest spans 18+ categories. The public is welcome to taste afterward.",
    claudeSummary: true,
    href: "https://www.sanmiguelbasinforum.com/stories/its-time-to-bake-annual-dessert-contest-is-july-11,120634",
    img: ""
  },
  {
    title: "West End producers sell at Ridgway markets",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "July 1, 2026",
    firstSeen: "2026-07-01",
    dateSource: "article",
    newsTopic: "arts-culture",
    copy: "Three West End producers ��� Cypress Roots (Nucla), L Bar Bell Ranch (Norwood), and Hank's Hens (Norwood) — are among the vendors at Ridgway's Hartwell Park Farmers Market, now in its 26th year. The market runs Fridays through October 16. This summer's heat and drought are putting pressure on livestock and pasture across the area.",
    claudeSummary: true,
    href: "https://www.sanmiguelbasinforum.com/stories/west-end-producers-sell-at-ridgway-markets,120637",
    img: ""
  }
];

// Hand-curated featured items for the Local News page. The bot never rewrites
// this array (it only manages TELLURIDE_TIMES_ARTICLES / KOTO_* / SMB_*), so a
// pinned letter or feature here is stable. local-news.html prepends these and
// honors `featured: true`. Set `isLetter: true` to get the Letter-to-the-Editor
// treatment (byline + logo) while still using a custom `img` as the hero.
const LOCAL_NEWS_FEATURED = [
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
    featured: true
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
    title: "The Dual Challenge: Climate and Energy",
    date: "2026-07-28",
    time: "6:30 PM – 7:30 PM",
    location: "Sheridan Opera House, Telluride",
    description: " \r\n\r\nThe world needs both more energy AND a stable climate. Delivering both is one of the defining challenges of our time.\r\nThree leading voices sit down to examine what this challenge actually looks like — the data, the tradeoffs, and the paths forward. Panelists include Dr. Guy Brasseur, Climate Scientist, NCAR and Max Planck Institute for Meteorology, Georgina Campbell Flatter, CEO of Greentown Labs, and Jeff Guldner, Retired CEO of Arizona Public Service Company and Pinnacle West. \r\nThis event, cosponsored by Telluride Science, Telluride Foundation, and Open Minds, is free and open to the public. \r\nThis special Town Talk will be held at the Sheridan Opera House. Doors open at 6 pm and the program starts at 6:30 pm. Free and open to the public, but RSVP is required.\r\nThanks to our title sponsor Alpine Bank and Telluride Mountain Village Owner’s Association.",
    link: "https://telluridescience.org/event/the-dual-challenge-climate-and-energy/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/05/image.webp",
    sourceLabel: "Telluride Science"
  },
  {
    title: "Top Chef & Taste of Telluride",
    date: "2026-08-01",
    time: "5:30 PM – 10:00 PM",
    location: "Telluride Innovation Center, Telluride",
    description: "Top Chef & Taste of Telluride serves up delicious food, creative cocktails, a chef competition, and more—all to support One to One Mentoring and its mission to empower local youth through trusted, caring relationships.\nIndulge in delectable dishes prepared by local chefs while enjoying the stunning views of Telluride. This event is designed to celebrate the rich local food culture of Telluride and to showcase three amazing chefs in a \"Top Chef\" style competition. Don't miss out on this unique opportunity to savor the flavors of Telluride!\nBuy tickets HERE.\n ",
    link: "https://telluridescience.org/event/top-chef-taste-of-telluride-2026/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/07/August-1-top-chef.png",
    sourceLabel: "Telluride Science"
  },
  {
    title: "The Tiny Machines That Keep Us Alive: Watching Life at Work, One Molecule at a Time",
    date: "2026-08-04",
    time: "6:30 PM – 7:30 PM",
    location: "Telluride Conference Center, Telluride",
    description: "This town talk will be presented by Taekjip (TJ) Ha, Harvard Medical School, Boston Children's Hospital, Howard Hughes Medical School. \r\nDid you know that proteins are nano-scale machines that help us think, dance and keep the threat of cancer at bay? Did you know that biology is a new research frontier for physical scientists? In this talk, Professor Ha of Harvard University will discuss how biophysicists are using light-based tools to poke and examine Nature’s nano-machines, one molecule at a time, uncovering the amazing acrobatic abilities that are essential for all forms of life.\r\nTown Talks will be held on Tuesdays at the Telluride Conference Center in Mountain Village June 9 to August 11. Doors open at 6 pm and the program starts at 6:30 pm. Free and open to the public.\r\nThanks to our title sponsor Alpine Bank and Telluride Mountain Village Owner’s Association.",
    link: "https://telluridescience.org/event/single-molecule-views-of-natures-nanomachines/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/05/Screenshot-2026-07-23-at-8.00.10-PM.png",
    sourceLabel: "Telluride Science"
  },
  {
    title: "Seeking Elusive Quantum Advantages in Computational Chemistry",
    date: "2026-08-11",
    time: "6:30 PM – 7:30 PM",
    location: "Telluride Conference Center, Telluride",
    description: "This Town Talk will be presented by Joonhoo Lee from Harvard University.\r\nLee will explore the subtleties of realizing quantum advantages in computational chemistry. Drawing on several projects from his research group, he will offer fresh perspectives on how to think about what quantum computing can—and cannot—deliver for chemistry. He will also make the case for why chemists must learn theoretical computer science to prepare for the coming wave of fault-tolerant quantum computing.\r\nThis is the last Town Talk of the summer that  will be held oat the Telluride Conference Center in Mountain Village. The final Town Talk on August 25 will be held at the Telluride Innovation Center in Telluride.  Doors open at 6 pm and the program starts at 6:30 pm. Free and open to the public.\r\nThanks to our title sponsor Alpine Bank and Telluride Mountain Village Owner’s Association.",
    link: "https://telluridescience.org/event/quantum-computing-chemistry/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/04/TT_logo_1048x802_A.png",
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
    description: " \r\n\r\n\r\nThis special town talk, presented by Braden Tierney, cofounder and executive director of the Two Frontiers Project extends the season and will be held in town at the Telluride Innovation Center.  \r\nFrom hydrothermal vents and volcanic seeps to alpine soils and mine drainage right here in Telluride, Earth’s most unusual ecosystems are home to microscopic life with extraordinary abilities. In this talk, Tierney will  share stories from the field and the lab through their team at the Two Frontiers Project. They explore the planet’s microbial diversity in search of “microbial superpowers” that could help tackle pollution, support agriculture, protect ecosystems, and improve human health. With an emphasis on projects ongoing in Colorado, we’ll explore how these invisible ecosystems work, why they matter for everyday life, and how citizen scientists and students can help map this hidden world.\r\nThanks to our title sponsor Alpine Bank.",
    link: "https://telluridescience.org/event/talk-unusual-microbes/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/04/TT_logo_1048x802_A.png",
    sourceLabel: "Telluride Science"
  },
  {
    title: "Telluride Chamber Music and Telluride Science Community Concert",
    date: "2026-09-10",
    time: "6:00 PM – 7:00 PM",
    location: "Telluride Innovation Center, Telluride",
    description: "Join Telluride Science and Telluride Chamber Music for a free community concert on the scenic patio at the Innovation Center. \r\nFeatured musicians:Danny DeSantis (viola), Anne Foxen (violin), Steve White (cell) and Travis Fisher (piano) \r\nAll are welcome—come soak in the beauty of live chamber music in an inspiring setting.",
    link: "https://telluridescience.org/event/community-concert-september/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/05/ChatGPT-Image-May-27-2026-03_58_05-PM.png",
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
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-07-27/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-07-27T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Mountain Village Electronics Recycling event",
    link: "https://koto.org/event/mountain-village-electronics-recycling-event/2026-07-27/",
    description: "The Town of Mountain Village is offering a free electronics recycling event on Monday, July 27, and Tuesday, July 28, from 12 p.m. to 6 p.m. in the Meadows Parking Lot. The event is designed to give the community a convenient way to keep electronic waste out of landfills while ensuring devices and batteries are handled properly. Residents are encouraged to clear out old or unused electronics and drop them off during the two-day collection window. A wide range of electronic items will be accepted, including old computers, televisions and household appliances. Residents are also invited to bring in batteries for recycling, though only certain types and sizes will be accepted. …",
    pubDate: "2026-07-27T18:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Desserts and Documentary-Bathtubs Over Broadway",
    link: "https://koto.org/event/desserts-and-documentary-bathtubs-over-broadway/",
    description: "Enjoy a dessert while watching Bathtubs Over Broadway. When he started as a comedy writer for the LATE SHOW WITH DAVID LETTERMAN, Steve Young had few interests outside of his day job. But while gathering material for a segment on the show, Steve stumbled onto a few vintage record albums that would change his life forever. Bizarre cast recordings – marked “internal use only” – revealed full-throated Broadway-style musical shows about some of the most recognizable corporations in America: General Electric, McDonald’s, Ford, DuPont, Xerox. Steve didn’t know much about musical theater, but these recordings delighted him in a way that nothing ever had. Directed by Dava Whisenant, BATHTUBS OVER BROADWAY follows Steve on his quest to find all he can about this hidden world. …",
    pubDate: "2026-07-27T19:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Womens Empowerment Group",
    link: "https://koto.org/event/womens-empowerment-group-3/",
    description: "Join Kaity Swick and Sally Harris Porter with Collaborative Trauma Solutions in a women’s empowerment group focused on fostering connections with like-minded women and developing deeper connections with yourselves and each other. We will incorporate somatic practices, mindfulness exercises and practical tools rooted in mind-body awareness. This will be held in a group setting and will be a trauma-informed and non-judgmental space created to strengthen community and provide a safe space to express yourself. Kaity and Sally will guide the group with relevant topics and supportive tools, so all you have to do is show up with an open mind. Please sign up here if you are interested: https://forms.gle/RLxaexLJar4Vpnhp7 Kaity Swick, LPCC – Kaity works with children and adults as a Mental Health Counselor and supports the community as an Early Childhood Mental Health Consultant. …",
    pubDate: "2026-07-28T14:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-07-28/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-07-28T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Mountain Village Electronics Recycling event",
    link: "https://koto.org/event/mountain-village-electronics-recycling-event/2026-07-28/",
    description: "The Town of Mountain Village is offering a free electronics recycling event on Monday, July 27, and Tuesday, July 28, from 12 p.m. to 6 p.m. in the Meadows Parking Lot. The event is designed to give the community a convenient way to keep electronic waste out of landfills while ensuring devices and batteries are handled properly. Residents are encouraged to clear out old or unused electronics and drop them off during the two-day collection window. A wide range of electronic items will be accepted, including old computers, televisions and household appliances. Residents are also invited to bring in batteries for recycling, though only certain types and sizes will be accepted. …",
    pubDate: "2026-07-28T18:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Summer SketchBook Club w/Annie",
    link: "https://koto.org/event/summer-sketchbook-club-w-annie/",
    description: "Join us for our summer sketchbook club! Unwind, connect with other artists, and find inspiration in nature as you fill up your sketchbook. We will meet in the library lobby and together we will walk to find a drawing spot by the river or in the park. All experience levels and drawing styles are welcome. Bring your own sketchbook and drawing materials; some materials may be available to borrow. You may also wish to bring sun protection, a towel or folding chair to sit on, and an extra layer as we will be sketching outside.",
    pubDate: "2026-07-28T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Town Talk: The Dual Challenge – Climate and Energy",
    link: "https://koto.org/event/town-talk-the-dual-challenge-climate-and-energy/",
    description: "The world needs both more energy AND a stable climate. Delivering both is one of the defining challenges of our time. Three leading voices sit down to examine what this challenge actually looks like — the data, the tradeoffs, and the paths forward. Panelists include Dr. Guy Brasseur, Climate Scientist, NCAR and Max Planck Institute for Meteorology, Georgina Campbell Flatter, CEO of Greentown Labs, and Jeff Guldner, Retired CEO of Arizona Public Service Company and Pinnacle West. This event, cosponsored by Telluride Science, Telluride Foundation, and Open Minds, is free and open to the public. This special Town Talk will be held at the Sheridan Opera House. Doors open at 6 pm and the program starts at 6:30 pm. Free and open to the public, but RSVP is required.",
    pubDate: "2026-07-29T00:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Sheridan Opera House, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/0728-TT_320-x-212-TF.jpg"
  },
  {
    title: "Native Plant Walk & Talk",
    link: "https://koto.org/event/native-plant-walk-talk/",
    description: "Join the recently retired Horticulturist for Colorado State University extension office for San Miguel County, Yvette Henson, for a plant and flower ID walk and talk. Yvette will share years of expertise as we identify native plants. Space will fill up fast. Sign up today for this informative experience! Meet at the the country park and ride lot in Lawson Hill near the bus stop; we will walk on the valley floor. Adults and teens only please!",
    pubDate: "2026-07-29T15:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-07-29/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-07-29T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Market on the Plaza",
    link: "https://koto.org/event/market-on-the-plaza/2026-07-29/",
    description: "Market on the Plaza is held each Wednesday, June 10 – September 9, 2026, from 11 a.m. to 4 p.m. in Heritage Plaza, the center of Mountain Village. Heritage Plaza is steps from the free gondola. Come enjoy local produce, original artisan creations, kid-friendly goods and more.",
    pubDate: "2026-07-29T17:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Heritage Plaza, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Mahjongg for Independent Players",
    link: "https://koto.org/event/mahjongg-for-independent-players-4/2026-07-29/",
    description: "Looking to enjoy an afternoon of friendly games of mah-jongg for independent players? Join us at the Library every Wednesday from 1-3pm. Bring your 2026 card if you have one, although we have plenty of loaners if you don’t! We’ll have tables, cloths, chairs, and sets. NOTE: This is not a mah-jongg lesson. A general knowledge of the game is necessary to join. Please register in advance at telluridelibrary.org if you'd like to join so we can make sure we have enough tables set up for everyone!",
    pubDate: "2026-07-29T19:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/mahj.jpg"
  },
  {
    title: "Tennis Clinic | 105 | 3.0+ | Golden Hour",
    link: "https://koto.org/event/tennis-clinic-105-3-0-golden-hour/2026-07-29/",
    description: "Join us for a 105 club takeover on all four courts! 105 scoring preview 1 Point for just winning the point. 5 points for winning the point off a groundstroke winner. 10 points for winning a point off a volley winner. 20 points for winning the point off of an overhead winner. Suitable for levels 3.0+, this game is not only a workout and a ton of fun, but it will improve your tennis game by: Teaching you when to play near the net player. Improve your overall net game. Encourage you to practice being aggressive at the net. Finding a backhand volley. Execute deep lobs.",
    pubDate: "2026-07-29T23:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "America 250/Colorado 150 Book Club",
    link: "https://koto.org/event/america-250-colorado-150-book-club/",
    description: "Join the Telluride Historical Museum and Wilkinson Public Library for a deep dive into some of the threads that make up the tapestry of Colorado's and the United States of America's history as we celebrate Colorado's 150th year as state and USA's 250th year as an independent country. We will will start will a discussion of Jill Lepore's 2026 Pulitzer Prize winning history of the constitution, We The People: A History of the U.S. Constitution. Check out this interview to learn more about Jill Lepore and her book: https://www.pbs.org/newshour/show/historian-jill-lepore-explores-the-constitution-and-its-interpretations-in-we-the-people The discussion will be lead by by attorney and current San Miguel County Court Judge, Melanie Morgan. You can check out of copy of the book (physical or ebook) from the library or purchase your own copy for 10% off at Between the Covers Bookstore! …",
    pubDate: "2026-07-29T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Coffee and Climate Conversations",
    link: "https://koto.org/event/coffee-and-climate-conversations-2/",
    description: "Coffee & Climate Conversations: Diversifying Local Energy Sources Where does our local energy come from? What opportunities does our region have for local energy sources? Join EcoAction Partners, Sheep Mountain Alliance, and the Wilkinson Public Library for a community conversation exploring what it means to diversify our local energy sources from renewable options to grid resilience, and what that path forward could look like for our community. We're excited to have representatives from San Miguel Power Association on hand, alongside local energy experts, to share insights, answer questions, and hear your ideas for our local energy future. We hope you’ll leave with fresh perspectives on local resilience, deeper community connection, and new ways of imagining climate action in our region. As always, coffee, tea and pastries kindly provided.",
    pubDate: "2026-07-30T14:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-07-30/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-07-30T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Pilates for All Bodies with Laura",
    link: "https://koto.org/event/pilates-for-all-bodies-with-laura-2/2026-07-30/",
    description: "Join Laura Colbert for Pilates for All Bodies every Thursday from 12:30-1:15pm. This program is free and open to the public. All bodies and experience levels are welcome. The library has a few mats, but bring your own if you can.",
    pubDate: "2026-07-30T18:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Adult Craft Night: Flower Pounding",
    link: "https://koto.org/event/adult-craft-night-flower-pounding/",
    description: "Create beautiful botanical prints using fresh flowers and leaves! Learn the art of flower pounding, a simple technique that transfers natural colors and shapes onto fabric or paper. We'll provide materials such as tea towels, bandanas, and greeting cards, or you are welcome to bring your own fabric or paper item to decorate. No experience is necessary—all supplies and instruction will be provided. Space is limited. Registration is required. ¡Cree hermosos estampados botánicos utilizando flores y hojas frescas! Aprenda la técnica de martillar flores, una forma sencilla de transferir los colores y las formas naturales de las plantas a tela o papel. Proporcionaremos materiales como paños de cocina, pañuelos tipo bandana y tarjetas, o puede traer su propia tela o artículo de papel para decorar. No se requiere experiencia previa; todos los materiales e instrucciones estarán incluidos. Es necesario registrarse. El cupo es limitado.",
    pubDate: "2026-07-30T23:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-07-31/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-07-31T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Up-off Gymnastics, Dance, and Spanish",
    link: "https://koto.org/event/up-off-gymnastics-dance-and-spanish/2026-07-31/",
    description: "We are a MOBILE family business offering non-competitive Gymnastics, Preschool Spanish, & Dance classes to the San Miguel County area. Tia Uphoff was a competitive gymnast and an instructor for 20+ years, helping children develop balance, flexibility, strength and proper tumbling techniques while using positive reinforcement and encouragement for success. Infant to Age 5 — Padres & Pequenos Class – $10.00 per class This class invites adults & kids to participate in Educational songs, in English & Spanish, with intro to gymnastics. Sign up at any time and get started weekly. Fridays — 11:15-11:40 am @ Lone Cone Library Norwood K to 3rd Grade week Session 8 Week Winter Session $150 for the 8 sessions. Thursdays – 430-530 pm @ Lone Cone Library Norwood For more information and to register: Contact Tia @ liv2danz247@gmail.com or find us on Facebook!",
    pubDate: "2026-07-31T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Lone Cone Library Norwood",
    imageUrl: "https://koto.org/wp-content/uploads/2025/06/Messenger_creation_3FA37E27-C0AC-4E9D-ABF5-592710E68D81.jpeg"
  },
  {
    title: "Ridgway Farmer's Market",
    link: "https://koto.org/event/ridgway-farmers-market/2026-07-31/",
    description: "The Ridgway Farmer's Market takes place every Friday from May 22nd through October 16th! * The August 7th Market will be held onthe 6th* 10 a.m. to 2 p.m. at Hartwell Park in Downtown Ridgway Local Produce | Artisans | Live Music every Last Friday",
    pubDate: "2026-07-31T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Hartwell Park Ridgway",
    imageUrl: ""
  },
  {
    title: "Telluride Farmer's Market",
    link: "https://koto.org/event/telluride-farmers-market/2026-07-31/",
    description: "We are an organic market in the heart of beautiful downtown Telluride, CO. Our 2026 Market is every Friday from May 29 – October 9th! We provide the highest quality produce, animal products, prepared food, and artisans. All of our goods are produced within 100 miles of Telluride, so you can feel good about shopping local. From late May through early October, you can find us on South Oak Street in downtown Telluride selling the best of Southwest Colorado from 10:30am to 3:30pm.",
    pubDate: "2026-07-31T16:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Oak Street Plaza, Telluride",
    imageUrl: ""
  },
  {
    title: "Free Youth Tennis & Pickleball Program",
    link: "https://koto.org/event/free-youth-tennis-pickleball-program-2/2026-07-31/",
    description: "Community Tennis & Pickleball Program This program is available for children ages 8 – 16 to receive free tennis instruction from trained and certified coaches at the Telluride Racquet Club. Goal: This program is designed to reach those who may not be able to participate due to financial constraints. Inclusivity: No one will be turned away based on their ability to pay. No Membership Required. Demo equipment is available at no charge for use during this clinic.",
    pubDate: "2026-07-31T21:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Bilingual Balance in Motion",
    link: "https://koto.org/event/bilingual-balance-in-motion/2026-08-01/",
    description: "Move, breathe, and energize in this dynamic bilingual class, led by Lauren Norton, designed to uplift your body and mind! Blending the strength and flow of Pilates, the rhythm and energy of dance, and the grounding presence of yoga and breathwork, this session will leave you feeling strong, balanced, and revitalized. Open to all levels, this fun and fast-paced class welcomes everyone looking to build strength, flexibility, and mindfulness in a supportive community space. This class is free, but donations for the instructor are welcome.",
    pubDate: "2026-08-01T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/BALANCE.jpg"
  },
  {
    title: "Zumba with Gisela",
    link: "https://koto.org/event/zumba-with-gisela/2026-08-01/",
    description: "Ditch the workout and join the party! Zumba® is a high-energy dance fitness class that mixes low-intensity and high-intensity moves for an interval-style, calorie-burning workout. Driven by Latin and international rhythms like salsa, merengue, reggaeton, and cumbia, you will tone your body and boost your endurance without even realizing how hard you are working. It is exercise in disguise! No dance experience is required—just bring your energy, a water bottle, and a smile. This class is free and open to the public, but donations for the instructor are always welcome. ¡Olvida el entrenamiento y únete a la fiesta! Zumba® es una clase de fitness de baile de alta energía que mezcla movimientos de baja y alta intensidad para un entrenamiento de estilo de intervalos que quema calorías. …",
    pubDate: "2026-08-01T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Celebration of Life for Mark Silversher",
    link: "https://koto.org/event/celebration-of-life-for-mark-silversher/",
    description: "Celebration of Life for Mark Silversher. Finger foods and beverages will be provided. Bring a chair or blanket and some memories of Mark.",
    pubDate: "2026-08-01T21:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Town Park",
    imageUrl: ""
  },
  {
    title: "Top Chef and Taste of Telluride",
    link: "https://koto.org/event/top-chef-and-taste-of-telluride/",
    description: "Top Chef & Taste of Telluride is One to One Mentoring's premier annual fundraiser, bringing together locals, visitors, and second homeowners for an unforgettable evening of food, fun, and philanthropy. The event features a live Top Chef competition, where talented local chefs compete for culinary bragging rights, a Taste of Telluride showcasing signature bites from some of the area's favorite restaurants, and an exciting Silent Auction filled with unique experiences and items. Proceeds from the event support One to One Mentoring's mission of empowering local youth through positive mentoring relationships and life-enriching opportunities.",
    pubDate: "2026-08-01T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Movies Under the Stars",
    link: "https://koto.org/event/movies-under-the-stars/2026-08-01/",
    description: "Telluride Mountain Village Owner's Association (TMVOA) presents Movies Under the Stars – FREE family-friendly outdoor movies screenings – every Saturday this summer at Conference Center Plaza! New this summer: Family Happy Hour from 6:30-8:30 p.m.! Enjoy lawn games, sidewalk chalk, a bounce house, face painting and more. Film schedule below: June 13 – Alice in Wonderland (1951) June 20 – Zootopia 2 July 4 – The Sandlot July 11 – Elio July 18 – How to Train Your Dragon (2025) July 25 – GOAT August 1 – Wicked for Good August 8 – Hoppers August 15 – Superman (2025)",
    pubDate: "2026-08-02T00:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Conference Center Plaza Mountain Village",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/MuS_Pstr11x17_2026-1-pdf-1.jpg"
  },
  {
    title: "The Casual Enormity of Adam Palmer Documentary Film Screening",
    link: "https://koto.org/event/the-casual-enormity-of-adam-palmer-documentary-film-screening/",
    description: "A new Colorado-made documentary celebrating the life, values, and enduring influence of community leader Adam Palmer will arrive in Telluride on Saturday, August 1, with a screening at the Sheridan Opera House at 7:00pm. This special screening includes a post-film conversation with local leaders focused on building resilient and sustainable mountain communities. The Casual Enormity of Adam Palmer explores the remarkable legacy of Palmer — an outdoor enthusiast, musician, family man, Eagle Town Council member, Holy Cross Energy board member, and former Eagle County Director of Sustainability. Through stories from friends, colleagues, and fellow community leaders, the film examines how one person’s everyday actions can inspire lasting change. Produced by the Adam Palmer Sustainability Fund with Risan Media, the documentary highlights Palmer’s belief that community, innovation, and deliberate action can create meaningful solutions to challenges ranging from clean energy and housing to transportation and environmental stewardship. …",
    pubDate: "2026-08-02T00:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Sheridan Opera House, Telluride",
    imageUrl: ""
  },
  {
    title: "Pickleball Open Play",
    link: "https://koto.org/event/pickleball-open-play/2026-08-02/",
    description: "Weekly Round Robins Eligibility: Must be rated 2.5+. Requirements: Players should know the rules, scoring, and basic strategy of tennis. Format: Fun, competitive matches with rotating partners each session. Minimum Players: A minimum of 4 players is required for the class to run.",
    pubDate: "2026-08-02T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Drop In Tech Time with Oliver",
    link: "https://koto.org/event/drop-in-tech-time-with-oliver-2/2026-08-02/",
    description: "Drop by the 2nd floor desk for Tech Time with Oliver every Sunday from 1-3pm. Bring your questions about technology (phones, tablets, laptops, email, etc.) or learn about special collections the library offers, such as the Kindles, iPads, and laptops our patrons can check out as well as the library apps you can download to your devices to access free ebooks, audiobooks, movies, music, magazines and more!",
    pubDate: "2026-08-02T19:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Tea and Tarot",
    link: "https://koto.org/event/tea-and-tarot/2026-08-02/",
    description: "Tea and Tarot Sessions with Jade Rose and others from Sanctuary Collective in the Telluride Room. Seating is limited; please sign up at telluridelibrary.org in advance.",
    pubDate: "2026-08-02T20:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/tea-1.jpg"
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-08-03/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-08-03T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-08-04/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-08-04T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Town Talk: Single molecule views of Nature's nanomachines",
    link: "https://koto.org/event/town-talk-single-molecule-views-of-natures-nanomachines/",
    description: "This town talk will be presented by Taekjip (TJ) Ha, Harvard Medical School, Boston Children’s Hospital, Howard Hughes Medical School. Did you know that proteins are nano-scale machines that help us think, dance and keep the threat of cancer at bay? Did you know that biology is a new research frontier for physical scientists? In this talk, Professor Ha of Harvard University will discuss how biophysicists are using light-based tools to poke and examine Nature’s nano-machines, one molecule at a time, uncovering the amazing acrobatic abilities that are essential for all forms of life.",
    pubDate: "2026-08-05T00:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Innovation Center",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/TT_logo_1048x802_A-4.png"
  },
  {
    title: "Bardic Trails Online Poetry Night",
    link: "https://koto.org/event/bardic-trails-online-poetry-night-3/2026-08-04/",
    description: "The Telluride Institute's Bardic Trails poetry night features an award-winning guest poet sharing their new and exciting work. The reading will be followed with a Q & A about the poet’s work and inspirations, with time afterwards for poetry sharing from attendees – a Gourd Circle of sharing whatever poetry attendees wish, or just listening in. The list of 2026 poets is below. The free Bardic Trails virtual Zoom series is on the first Tuesday of each month. Visit to get the zoom link each month, Thanks to the Wilkinson Public Library, Cantor Family, the Guttman Family Foundation, CCAASE and our Fischer and Cantor contest participants for supporting our program and projects. Jan. 6 / Euro-American poet Dane Cervine of California Feb. …",
    pubDate: "2026-08-05T01:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/03/Bardic-Trails-2026.jpg"
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-08-05/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-08-05T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Market on the Plaza",
    link: "https://koto.org/event/market-on-the-plaza/2026-08-05/",
    description: "Market on the Plaza is held each Wednesday, June 10 – September 9, 2026, from 11 a.m. to 4 p.m. in Heritage Plaza, the center of Mountain Village. Heritage Plaza is steps from the free gondola. Come enjoy local produce, original artisan creations, kid-friendly goods and more.",
    pubDate: "2026-08-05T17:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Heritage Plaza, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Mahjongg for Independent Players",
    link: "https://koto.org/event/mahjongg-for-independent-players-4/2026-08-05/",
    description: "Looking to enjoy an afternoon of friendly games of mah-jongg for independent players? Join us at the Library every Wednesday from 1-3pm. Bring your 2026 card if you have one, although we have plenty of loaners if you don’t! We’ll have tables, cloths, chairs, and sets. NOTE: This is not a mah-jongg lesson. A general knowledge of the game is necessary to join. Please register in advance at telluridelibrary.org if you'd like to join so we can make sure we have enough tables set up for everyone!",
    pubDate: "2026-08-05T19:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/mahj.jpg"
  },
  {
    title: "Tennis Clinic | 105 | 3.0+ | Golden Hour",
    link: "https://koto.org/event/tennis-clinic-105-3-0-golden-hour/2026-08-05/",
    description: "Join us for a 105 club takeover on all four courts! 105 scoring preview 1 Point for just winning the point. 5 points for winning the point off a groundstroke winner. 10 points for winning a point off a volley winner. 20 points for winning the point off of an overhead winner. Suitable for levels 3.0+, this game is not only a workout and a ton of fun, but it will improve your tennis game by: Teaching you when to play near the net player. Improve your overall net game. Encourage you to practice being aggressive at the net. Finding a backhand volley. Execute deep lobs.",
    pubDate: "2026-08-05T23:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-08-06/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-08-06T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Pilates for All Bodies with Laura",
    link: "https://koto.org/event/pilates-for-all-bodies-with-laura-2/2026-08-06/",
    description: "Join Laura Colbert for Pilates for All Bodies every Thursday from 12:30-1:15pm. This program is free and open to the public. All bodies and experience levels are welcome. The library has a few mats, but bring your own if you can.",
    pubDate: "2026-08-06T18:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Art Walk Telluride",
    link: "https://koto.org/event/art-walk-telluride/2026-08-06/",
    description: "Join us the first Thursday of every month for Telluride's Art Walk. It will be an evening filled with inspiring exhibits, engaging receptions, and the chance to meet local and visiting artists. From 5–7 pm, participating venues will open their doors, showcasing new collections and inviting art lovers to explore the vibrant gallery scene. Find what's new on www.telluridearts.org Note: Special Edition Art Walk May 21st.",
    pubDate: "2026-08-06T23:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2025/12/Screenshot-2025-11-10-at-2.54.42-PM.png"
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-08-07/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-08-07T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Up-off Gymnastics, Dance, and Spanish",
    link: "https://koto.org/event/up-off-gymnastics-dance-and-spanish/2026-08-07/",
    description: "We are a MOBILE family business offering non-competitive Gymnastics, Preschool Spanish, & Dance classes to the San Miguel County area. Tia Uphoff was a competitive gymnast and an instructor for 20+ years, helping children develop balance, flexibility, strength and proper tumbling techniques while using positive reinforcement and encouragement for success. Infant to Age 5 — Padres & Pequenos Class – $10.00 per class This class invites adults & kids to participate in Educational songs, in English & Spanish, with intro to gymnastics. Sign up at any time and get started weekly. Fridays — 11:15-11:40 am @ Lone Cone Library Norwood K to 3rd Grade week Session 8 Week Winter Session $150 for the 8 sessions. Thursdays – 430-530 pm @ Lone Cone Library Norwood For more information and to register: Contact Tia @ liv2danz247@gmail.com or find us on Facebook!",
    pubDate: "2026-08-07T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Lone Cone Library Norwood",
    imageUrl: "https://koto.org/wp-content/uploads/2025/06/Messenger_creation_3FA37E27-C0AC-4E9D-ABF5-592710E68D81.jpeg"
  },
  {
    title: "Telluride Farmer's Market",
    link: "https://koto.org/event/telluride-farmers-market/2026-08-07/",
    description: "We are an organic market in the heart of beautiful downtown Telluride, CO. Our 2026 Market is every Friday from May 29 – October 9th! We provide the highest quality produce, animal products, prepared food, and artisans. All of our goods are produced within 100 miles of Telluride, so you can feel good about shopping local. From late May through early October, you can find us on South Oak Street in downtown Telluride selling the best of Southwest Colorado from 10:30am to 3:30pm.",
    pubDate: "2026-08-07T16:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Oak Street Plaza, Telluride",
    imageUrl: ""
  }
];

const WILKINSON_EVENTS = [
  {
    title: "Gentle Yoga with Kristen Milord",
    link: "https://telluridelibrary.libcal.com/event/16536441?hs=a",
    description: "11:00 AM – 12:30 PM · Breathe, stretch, and reset with gentle yoga taught by Kristen Milord, Sundays from 11:00 am to 12:00 pm. This free, accessible class is open to all levels—no prior experience needed. Feel free to bring your own mat, or the library also has mats, bolsters, blocks and blankets available to use. This class if free, but donations to support the instructor are welcome.",
    pubDate: "2026-07-26T17:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Wilkinson Public Library",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_03_03_14_50_39.jpg"
  },
  {
    title: "Drop In Ping Pong",
    link: "https://telluridelibrary.libcal.com/event/17203884?hs=a",
    description: "1:00 PM – 3:00 PM · Drop by the library for casual table tennis matches. Our ping pong table will be set up and ready for players of all ages and skill levels. Whether you&#39;re a first-timer or a seasoned player, come enjoy this classic game with family and friends. No registration needed - just drop in! First come, first served (pun intended!) Pase por la biblioteca para partidos casuales de tenis de mesa. Nuestra mesa de ping pong estar&aacute; instalada y lista para jugadores de todas las edades y niveles de habilidad. Ya sea que juegue por primera vez o sea un jugador experimentado, venga a disfrutar de este juego cl&aacute;sico con familia y amigos. No necesita registrarse - &iexcl;simplemente venga!",
    pubDate: "2026-07-26T19:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Lower Terrace - outdoors",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_05_30_12_13_38.png"
  },
  {
    title: "Drop-In Tech Time with Oliver",
    link: "https://telluridelibrary.libcal.com/event/15970384?hs=a",
    description: "1:00 PM – 3:00 PM · Drop by the 2nd floor desk for Tech Time with Oliver every Sunday from 1-3pm. Bring your questions about technology (phones, tablets, laptops, email, etc.) or learn about special collections the library offers, such as the Kindles, iPads, and laptops our patrons can check out as well as the library apps you can download to your devices to access free ebooks, audiobooks, movies, music, magazines and more! P&aacute;sate por el 2&ordm; piso para Tech Time con Oliver (habla espa&ntilde;ol) todos los domingos de 1 a 3pm. Traiga sus preguntas sobre tecnolog&iacute;a (tel&eacute;fonos, tabletas, computadoras port&aacute;tiles, correo electr&oacute;nico, etc.) o conozca las colecciones especiales que ofrece la biblioteca, como los Kindles, iPads y computadoras port&aacute;tiles que nuestros usuarios pueden rentar, as&iacute; como las aplicaciones de la biblioteca que puede descargar en sus dispositivos para acceder a libros electr&oacute;nicos, audiolibros, pel&iacute;culas, m&uacute;sica, revistas y m&aacute;s.",
    pubDate: "2026-07-26T19:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "2nd Floor Desk",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/data/feat_img/6460/19928/1714410099.jpg"
  },
  {
    title: "Tea and Tarot",
    link: "https://telluridelibrary.libcal.com/event/17029765?hs=a",
    description: "2:30 PM – 4:30 PM · Tea and Tarot Sessions with Jade Rose and others from Sanctuary Collective Seating is limited; please sign up here in advance.   Tea Ceremony is a perfect elemental art. Silently, we drink tea from ancient trees grown in reverence. In this special space we give the water, fire and tea leaves a chance to communicate with us in their subtle and silent tongue. Old growth trees have been taking in sunlight, rainwater and starlight for hundreds of years. Drinking tea from their leaves in a ceremonial space allows us access parts of our heart which we usually cannot reach.",
    pubDate: "2026-07-26T20:30:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Telluride Room",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/data/feat_img/6460/19928/1746566095.png"
  },
  {
    title: "Around The World With Your Library-The Regions of Rosé",
    link: "https://telluridelibrary.libcal.com/event/17033784?hs=a",
    description: "5:30 PM – 7:00 PM · Think all ros&eacute; tastes the same? Think again! Join us and our friends from the Wine Mine for a journey through the world&#39;s ros&eacute;-producing regions. Discover how different grapes, growing conditions, and winemaking traditions create a surprising variety of colors, aromas, and flavors. Pair your evening with a visit to Kiki&#39;s Farmers Market and enjoy a taste of summer while learning about the wines that have become a warm-weather favorite around the world.",
    pubDate: "2026-07-26T23:30:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Wine Mine",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_06_11_14_27_46.png"
  }
];

// Bot-managed by scripts/content-refresh.js Task 7 (syncHumaneSocietyAnimals).
// Currently empty: every animal the THS Shelterluv feed lists right now is
// either pending adoption ("ADOPTION PENDING! …") or pre-weaning/photoless,
// none of which are advertised as adoptable. The sync filters those out, so
// this repopulates automatically when THS posts genuinely-available pets.
const HUMANE_SOCIETY_ANIMALS = [
  {
    id: "TEL-A-186",
    name: "Roman",
    species: "Dog",
    breed: "Bulldog, French",
    ageGroup: "Young Dog",
    sex: "Male",
    photo: "https://new-s3.shelterluv.com/profile-pictures/d41da3a87655b31d6984c022c69835b0/22b7f37d16d281de87282d9cfb67b365.jpeg",
    profileUrl: "https://www.shelterluv.com/embed/animal/213885538",
    summary: "Young Dog • Bulldog, French • Male",
    firstSeen: "2026-07-11",
    revealDate: "2026-07-11",
    lastSeen: "2026-07-27"
  },
  {
    id: "TEL-A-192",
    name: "Goldie",
    species: "Dog",
    breed: "Retriever, Golden / Poodle",
    ageGroup: "Young Puppy",
    sex: "Female",
    photo: "https://new-s3.shelterluv.com/profile-pictures/9783882bd0b992d3c2e9bc4a03436b40/90a0bc5b6fcfcaf0d8dca8e896117977.jpg",
    profileUrl: "https://www.shelterluv.com/embed/animal/214172679",
    summary: "Young Puppy • Retriever, Golden / Poodle • Female",
    firstSeen: "2026-07-27",
    revealDate: "2026-07-27",
    lastSeen: "2026-07-27"
  },
  {
    id: "TEL-A-193",
    name: "Fig",
    species: "Dog",
    breed: "Collie, Border / Shepherd, Australian",
    ageGroup: "Young Puppy",
    sex: "Female",
    photo: "https://new-s3.shelterluv.com/profile-pictures/ace144b817dac5d1be12098890b393bc/bd9ea402626cad1b5bd7d0f7de39d544.JPG",
    profileUrl: "https://www.shelterluv.com/embed/animal/214172689",
    summary: "Young Puppy • Collie, Border / Shepherd, Australian • Female",
    firstSeen: "2026-07-27",
    revealDate: "2026-07-29",
    lastSeen: "2026-07-27"
  },
  {
    id: "TEL-A-196",
    name: "Apricot",
    species: "Dog",
    breed: "Shepherd, Australian / Mixed Breed (Medium)",
    ageGroup: "Young Puppy",
    sex: "Female",
    photo: "https://new-s3.shelterluv.com/profile-pictures/81c24864baaf62ae9e749a040434bdd6/c2a309a474ba71b5ce9b34e1c5d3c234.JPG",
    profileUrl: "https://www.shelterluv.com/embed/animal/214172701",
    summary: "Young Puppy • Shepherd, Australian / Mixed Breed (Medium) • Female",
    firstSeen: "2026-07-27",
    revealDate: "2026-07-31",
    lastSeen: "2026-07-27"
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
    title: "The Mammoths",
    link: "https://www.alibitelluride.com/calendar#eca-event=the-mammoths",
    description: "Hailing from Austin, TX, fuzz rockers The Mammoths fuse ‘70s inspired psychedeli...",
    pubDate: "2026-07-29",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/e85f9702-e225-45cd-9c77-3b9d939c883b/-/crop/4096x2049/0,547/-/preview/"
  },
  {
    title: "Nik Parr & the Selfless Lovers",
    link: "https://www.alibitelluride.com/calendar#eca-event=nik-parr-and-the-selfless-lovers",
    description: "Nik Parr & The Selfless Lovers are a high-energy, piano-driven roots rock band h...",
    pubDate: "2026-07-30",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/5e2a35ce-6185-49b8-9c47-4f5ecdbf4b5b/-/crop/1080x541/0,225/-/preview/"
  },
  {
    title: "Natalie Brooke",
    link: "https://www.alibitelluride.com/calendar#eca-event=natalie-brooke",
    description: "Natalie Brooke is a rock star. A virtuoso funk / rock keys player leading her po...",
    pubDate: "2026-08-01",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/b150a182-60cb-4116-bccf-81a27439a381/-/crop/1080x432/0,36/-/preview/"
  },
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
    title: "The Nugget: A Telluride Restoration Story, and a Benefit for the Telluride Historical Museum",
    link: "https://sheridanoperahouse.com/events/film-the-nugget-a-telluride-restoration-story-and-a-benefit-for-the-telluride-historical-museum/",
    description: "A documentary screening and benefit event at the Sheridan Opera House, telling the restoration story of the Nugget as a fundraiser for the Telluride Historical Museum. The program brings together local history and community support in one of Telluride's most storied performing arts venues.",
    pubDate: "2026-07-25",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2026/05/film-the-nugget-a-telluride-restoration-story-and-a-benefit-for-the-telluride-historical-museum.png"
  },
  {
    title: "FREE SHOW! Summer Spectacular: The Jungle Book",
    link: "https://sheridanoperahouse.com/events/free-show-summer-spectacular-the-jungle-book/",
    description: "A free performance of The Jungle Book at the Sheridan Opera House, part of the venue's Summer Spectacular series. The show brings the beloved story to the historic Telluride stage for an evening of live theatrical entertainment.",
    pubDate: "2026-07-31",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2026/05/YPT-Sumemr-Jungle-Book.png"
  },
  {
    title: "Film: The Casual Enormity of Adam Palmer",
    link: "https://sheridanoperahouse.com/events/film-the-casual-enormity-of-adam-palmer/",
    description: "A film screening of *The Casual Enormity of Adam Palmer* at the historic Sheridan Opera House in Telluride. The event is presented by the Sheridan Opera House as part of its ongoing programming at this landmark downtown venue.",
    pubDate: "2026-08-01",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2026/07/Screenshot-2026-07-08-at-10.15.22-AM.png"
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
    title: "Paul McDonald and the Mourning Doves",
    href: "https://sherbino.org/event/paul-mcdonald-sherbino-ridgway-august-2026/",
    date: "2026-08-01 19:30:00",
    endDate: "2026-08-01 21:30:00",
    location: "The Sherbino, Ridgway",
    copy: "@ Doors: 7:00 pm | Show: 7:30 pm*$25 advance | $30 day of show – to buy GA tickets, select from the ticket option BELOW the seating chart*Limited reserved tables available – to purchase a reserved table, hover over the tables on the seating chart. ABOUT PAUL MCDONALD:Born in Alabama and baptized in the dive bars of the southeast, Paul McDonald first made noise with the Grand Magnolias, a roots-rock outfit, before catching fire in the public eye during American Idol’s 2011 run. When the bright lights blurred and the cameras turned, the man behind the voice slipped into the shadows where he did what real artists do: he lived, he lost, and he wrote. Retreating to Nashville, that holy city of reinvention, Paul stitched himself back together with worn boots, hard songs, and a new band called the Mourning Doves. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/04/2026-sherb-event-banners-22.png"
  },
  {
    title: "Monthly Welcome Home Alliance Veteran's Coffee at the Sherbino",
    href: "https://sherbino.org/event/monthly-welcome-home-alliance-veterans-coffee-at-the-sherbino/2026-08-11/",
    date: "2026-08-11 10:00:00",
    endDate: "2026-08-11 12:00:00",
    location: "Ridgway, CO",
    copy: "",
    imageUrl: "https://sherbino.org/wp-content/uploads/2023/01/Vet-Coffee.png"
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
    title: "Home Trust of Ouray County - Home Tour & House Show",
    link: "https://ouraycountyco.gov/Calendar.aspx?EID=3769",
    description: "Two or more Ouray County Commissioners may attend and participate in this event. https://ouraycountyco.gov/calendar.aspx?EID=3769",
    pubDate: "2026-08-02T17:00:00.000Z",
    source: "ouraycounty",
    sourceLabel: "Ouray County",
    category: "Community Event",
    location: "Dallas Meadows Neighborhood - Ridgway CO 81427",
    imageUrl: ""
  }
];

const OURAY_RIDGWAY_EVENTS = [
  {
    title: "Fall Registration is NOW OPEN",
    link: "https://events.ourayridgwayevents.com/event/fall-registration-is-now-open-at-weehawken-creative-arts",
    description: "Whether your child dreams of dancing across the stage, flying through the air on silks, mastering hip hop, ballet, jazz, tap, acro, or finding a place where they truly belong—we have a class for them. **Celebrating 19 Years of Weehawken Dance!** Join hundreds of students from across the region in a program that builds confidence, friendships, creativity, community and lifelong memories. Weehawken offers Dance (ballet, tap, jazz, lyrical, west african & more!) Aerial (silks & lyra) Acro Performance Opportunities -- all youth students will perform in THE NUTCRACKER in December in Montrose! Ages 3 through Adult Montrose • Ridgway • Ouray Don't wait—many classes fill quickly! **Registration is now open! **dance.weehawkenarts.org** View on site | Email this event",
    pubDate: "2026-07-26T06:00:00.000Z",
    endDate: "2026-08-23",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Dance & Aerial!",
    imageUrl: "https://localist-images.azureedge.net/photos/53483716128682/huge/d746bb45a4863fae593b7f212e308bf06efa29c5.jpg"
  },
  {
    title: "Free Show | Adah Hannelore & Corey Hooker | Floating Lotus Mainstage",
    link: "https://events.ourayridgwayevents.com/event/free-show-adah-hannelore-corey-hooker-floating-lotus-mainstage",
    description: "🎶 Introducing: Floating Lotus Mainstage 🎶 We're excited to launch a new chapter in Ridgway's local music scene. Floating Lotus Mainstage is our new live music series dedicated to showcasing the incredible musicians who have grown through our Open Mic community. Our goal is simple: provide free live music for the community, support local artists, and create a path for performers to take the next step—from solo open mic sets to full featured performances and bands. We believe local musicians deserve a place to develop their craft, build an audience, and promote their original work. Floating Lotus is committed to being that place. Whether you're an experienced performer or someone who's been thinking about stepping onto the Open Mic stage for the first time, this is your invitation. Every great band starts somewhere. …",
    pubDate: "2026-07-26T06:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/53479911973011/huge/3579e167dfcf97cf098fbe7ee5a676f0ced3deaa.jpg"
  },
  {
    title: "Ouray Open Air Market",
    link: "https://events.ourayridgwayevents.com/event/ouray-open-air-market-7809",
    description: "The Ouray Open-Air Market is a brand-new cooperative, organized marketplace designed to provide a dedicated home for small-scale creators & producers. Our core mission is to promote local agriculture and artisan goods while fostering honest, transparent relationships between vendors and the community. This is an entirely fresh platform in town designed to showcase your artisanal goods and services, helping neighbors and visitors know exactly who made the products they love. When and Where? Location: The market will take place in a beautiful open-air setting at Billy Goat Gruff's Patio (located at 4th Ave. + Main Street, Ouray, CO).Schedule: We will operate every Sunday from June 21, 2026, through September 6, 2026.Hours: Market hours are 10:00 AM to 2:00 PM. View on site | Email this event",
    pubDate: "2026-07-26T16:00:00.000Z",
    endDate: "2026-09-06",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Billy Goats Gruff Patio",
    imageUrl: "https://localist-images.azureedge.net/photos/53054893063268/huge/ed5f6f42c1d6a9db337d04171355a33509b6e1d1.jpg"
  },
  {
    title: "On Display: The 610 Arts Annual Photography Invitational ~ featuring works by Gary Slane & Eric Phillips",
    link: "https://events.ourayridgwayevents.com/event/Ongoing-610-arts-annual-photography-invitational-featuring-works-by-gary-slane-eric-phillips",
    description: "Photography Invitational featuring Gary Slane and Eric Phillips On display July 1 – August 28, 2026 Artist Reception: Friday, July 10 | 5:00–7:00 PM | Free! The 610 Arts Collective is pleased to present the Photography Invitational, featuring the work of Gary Slane of Montrose and Eric Phillips of Colorado’s Gunnison Valley. This special exhibition showcases two accomplished photographers whose distinct artistic perspectives celebrate the beauty, power, and wonder of the natural world. Join us for an Artist Reception on Friday, July 10, from 5:00–7:00 PM, where guests will have the opportunity to meet the artists, learn about their creative processes, and enjoy an evening surrounded by extraordinary imagery from across the American West and beyond. Gary Slane Montrose photographer Gary Slane has devoted years to capturing breathtaking landscapes, wildlife, and night skies throughout North America. …",
    pubDate: "2026-07-26T18:00:00.000Z",
    endDate: "2026-08-28",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The 610 Arts Collective",
    imageUrl: "https://localist-images.azureedge.net/photos/53311891403836/huge/5ed79c16e243d3edcc6923539da943575df4cc1b.jpg"
  },
  {
    title: "Chloe's Secret Garden Grand Opening",
    link: "https://events.ourayridgwayevents.com/event/chloes-secret-garden-grand-opening",
    description: "Welcome to Chloe’s Secret Garden 🌿🍷 We’ve been working behind the scenes to create a beautiful new outdoor space, and we can’t wait to share it with you. This is just a glimpse of what’s to come! 🌸 Grand Opening: Sunday, July 26, 2 PM - 6 PM Join us as we officially open Chloe’s Secret Garden with an afternoon and evening of great food, wine, and live music on our brand-new outdoor stage. 🎶 Music by 2:00 PM Old Man Polly 3:30 PM Donny Morales & Coral Skye This is just the beginning! We have so many exciting events planned for this space, and we can’t wait to celebrate with our amazing community. View on site | Email this event",
    pubDate: "2026-07-26T20:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Chloe's Charcuterie & Wine",
    imageUrl: "https://localist-images.azureedge.net/photos/53491865115071/huge/bff2f232eb493287091d70d7c435baac2f6d6e45.jpg"
  },
  {
    title: "Funky Ouray: Reggae music in Fellin Park",
    link: "https://events.ourayridgwayevents.com/event/funky-ouray-reggae-music-in-fellin-park",
    description: "Join us in Fellin Park every Sunday in July for Funky Ouray, a free, all-ages reggae DJ set hosted by Night Nurse Sound System. Bring a blanket, gather your friends, and kick back to reggae rhythms. View on site | Email this event",
    pubDate: "2026-07-26T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Fellin Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53251675055630/huge/fc4164d9a73f0015ccaf172c2b42758b02fab547.jpg"
  },
  {
    title: "Pilates Mat All Levels",
    link: "https://events.ourayridgwayevents.com/event/pilates-mat-all-levels",
    description: "This all levels Classical Pilates Mat class will center, strengthen and legnthen your entire body. Specialty mats are provided. Contact us to learn more or purchase a pass from the link below. We are located in the Historic Bank Building at 521 Clinton Street., View on site | Email this event",
    pubDate: "2026-07-27T14:30:00.000Z",
    endDate: "2026-08-31",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway Pilates",
    imageUrl: "https://localist-images.azureedge.net/photos/53461881445043/huge/bea9b1b613e5c4368deec4a9cd935c81f0ae72c8.jpg"
  },
  {
    title: "On Display: Roots & Rhythms",
    link: "https://events.ourayridgwayevents.com/event/roots-and-rhythms-opening-night-with-live-music-and-demo",
    description: "Roots & Rhythms is a collaborative exhibition featuring mixed media paintings by Julia Reid and bentwood sculptures by Ethan Wortis. Through layered textures, organic forms, and expressive movement, the exhibition explores the connection between memory and transformation—rooted in what came before, flowing toward what is possible. Where memory surfaces, movement unfolds, and forms emerge. The exhibition will remain on view July 3–August 4, with gallery hours Monday–Wednesday and Friday, 9 a.m.–4 p.m. View on site | Email this event",
    pubDate: "2026-07-27T15:00:00.000Z",
    endDate: "2026-08-03",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Space to Create",
    imageUrl: "https://localist-images.azureedge.net/photos/53268350844000/huge/445ca1a6868c4a44ce4c2ec9f324477640148d3b.jpg"
  },
  {
    title: "Swimming Classes for Kids",
    link: "https://events.ourayridgwayevents.com/event/swimming-classes-for-kids",
    description: "The Ouray Hot Springs summer swim lesson program is a fun and supportive way for kids to build confidence in the water. Two-week sessions run through the summer from June 1 through Aug. 6. Details: ✔️ Classes meet Monday–Thursday for 30 minutes each day ✔️ 8 classes per session ✔️ $45 per session (that’s less than $6 per class!) ✔️ Pool entry during class period included Class Options: Parent Tots: (Under 3 with an adult) Level 1: Beginner Skills (Ages 3+) Level 2: Intermediate Skills (All Ages) Level 3: Advanced Skills (All Ages) 📅 You can register at tinyurl.com/ourayactivities! Registration for each session closes the Friday before the session begins. Questions? Contact our Swim Safety Coordinator at 970-325-3009 or JWyatt@CityofOuray.com . View on site | Email this event",
    pubDate: "2026-07-27T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Hot Springs",
    imageUrl: "https://localist-images.azureedge.net/photos/52806871795839/huge/2b4a1f1e03bf8526d92866007630f4a159e579d5.jpg"
  },
  {
    title: "On Display: Silverton, Interpreted",
    link: "https://events.ourayridgwayevents.com/event/copy-of-show-opening-silverton-interpreted-ridgway-first-friday",
    description: "This show will run through mid-August Silverton, Interpreted is a traveling show features a selection of artists from The 9318 Collective whose work reflects the beauty, energy, and elemental character of the San Juan Mountains and the lands that surround them. Through varied styles and mediums, the exhibition offers multiple perspectives on a shared place, celebrating the artistic dialogue between land and maker. View on site | Email this event",
    pubDate: "2026-07-27T16:00:00.000Z",
    endDate: "2026-08-06",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53047351194602/huge/ca565426cdce176dbabc27b75052233f99cf4818.jpg"
  },
  {
    title: "True Grit Historic Walking Tours",
    link: "https://events.ourayridgwayevents.com/event/true-grit-tours",
    description: "Walk in the footsteps of John Wayne and Kim Darby as you explore downtown Ridgway with a trained guide to discover the fascinating behind-the-scenes story of the filming of the original True Grit movie in 1968. Many of the buildings seen in the movie are still in place. John Wayne won his only Oscar for his portrail of Marshal Rooster Cogburn. Offered every Friday at 3 pm in June, July and August. Additional tours are offered at 10am Mondays and 3 pm Wednesdays in July. Meet at the Hartwell Park gazebo 15 minutes before tours begin. FREE. Tours last about an hour. In 2022, this tour was recognized nationally when it was named the reader's choice for best historic town tour by True West magazine. For more information see the website: TrueGritTours.org or on facebook: True Grit Tours. …",
    pubDate: "2026-07-27T16:00:00.000Z",
    endDate: "2026-08-28",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Hartwell Park",
    imageUrl: "https://localist-images.azureedge.net/photos/52285883190282/huge/99283c09e34ca5aeabd7006cca2ba5b2b28899c3.jpg"
  },
  {
    title: "Senior Lunch by Neighbor to Neighbor",
    link: "https://events.ourayridgwayevents.com/event/senior-lunch-by-neighbor-to-neighbor",
    description: "Senior Lunch Every Monday Seniors meet to share a wonderful lunch, have a chance to socialize and enjoy an entertaining program. Transportation is provided. Neighbor to Neighbor, 970-325-4586. View on site | Email this event",
    pubDate: "2026-07-27T18:00:00.000Z",
    endDate: "2026-09-21",
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
    pubDate: "2026-07-28T00:15:00.000Z",
    endDate: "2026-09-22",
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
    pubDate: "2026-07-28T14:15:00.000Z",
    endDate: "2026-09-24",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Ridgway (Old Schoolhouse)",
    imageUrl: "https://localist-images.azureedge.net/photos/53312790468311/huge/860fbc87ce3cc92e25c09e723732d04292df18ba.jpg"
  },
  {
    title: "Vitalant Blood Drive",
    link: "https://events.ourayridgwayevents.com/event/vitalant-blood-drive",
    description: "Come help save lives by donating blood at this year's blood drive! View on site | Email this event",
    pubDate: "2026-07-28T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/53118762580384/huge/4437c796577c7be0ca11f4cc87ac95d07477f6d6.jpg"
  },
  {
    title: "CORAL SKYE",
    link: "https://events.ourayridgwayevents.com/event/coral-skye-2560",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-07-28T22:00:00.000Z",
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
    pubDate: "2026-07-28T23:30:00.000Z",
    endDate: "2026-09-22",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52092171660517/huge/0e628304026c92db25e8df01849c962ac902a3b4.jpg"
  },
  {
    title: "Evenings of History 2026 @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/evenings-of-history-2026-the-wright",
    description: "Evenings of History 2026 @ the Wright WHEN? Weekly Tuesdays • 7:00 pm – 9:00 pm Doors at 6:30 pm • Presentations at 7:00 pm June 16 June 23 June 30 July 7 July 14 July 21 July 28 August 4 WHERE? Wright Opera House 472 Main St. Ouray, Colorado SERIES: Presented by the Ouray County Historical Society ABOUT THE SERIES Join the Ouray County Historical Society for another season of Evenings of History, a community lecture series exploring the people, places, and stories that shaped Ouray County and the greater San Juan region. From mining legends and frontier photography to fashion, recreation, and Ute history, this year’s lineup offers a fascinating look into the characters and events that helped define the American West. Through local historians, researchers, storytellers, and community experts, Evenings of History continues a longstanding tradition of preserving and sharing the rich heritage of Ouray County. …",
    pubDate: "2026-07-29T01:00:00.000Z",
    endDate: "2026-08-05",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/52887120617394/huge/59851e9ca29d75054645a0e488e33edbbcf73d69.jpg"
  },
  {
    title: "Wildflower Walks & Talks with Mary Menz & Jaime Pisarowicz \"U.S. Basin\" - Back by Popular Demand!",
    link: "https://events.ourayridgwayevents.com/event/wildflower-walks-talks-with-mary-menz-jaime-pisarowicz-us-basin-back-by-popular-demand",
    description: "Wildflower Walks & Talks with Mary Menz & Jaime Pisarowicz \"U.S. Basin\" - Back by Popular Demand! July 29th Wednesday 7:00am - 11:00am $49-$69 Registration: www.weehawkenarts.org Different elevations and habitats provide opportunities to view a wide variety of Colorado’s native plants and wildflowers. Ridgway writer and Colorado Native Plant Master Mary Menz and Jaime Pisarowicz will share their extensive plant knowledge and excitement for the area with you. Special guest and fellow NPM Sandra Dick will also join the group as a guide! Registration includes a copy of their book Common Wildflowers of the San Juan Mountains ($49) or Wildflowers of Colorado’s Western Slope ($69). All groups are limited to 12 participants. Participants will meet and carpooling is recommended (we help facilitate this effort at the meet up location)—specific directions and more information will be provided via email prior to the event. …",
    pubDate: "2026-07-29T13:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/52806828827371/huge/ae218c9c6c9de549ec730577c3289f68e83e9fd1.jpg"
  },
  {
    title: "OPEN MIC / JAM NIGHT w/ host DJ Strong",
    link: "https://events.ourayridgwayevents.com/event/open-mic-jam-night-w-host-dj-strong",
    description: "Join us at the Lotus for a midweek tradition that brings together musicians, music lovers, and the incredible local talent that makes our community shine. From intimate solo sets to full-band jam sessions with rotating players, Open Mic Night is always full of surprises. Want to play? We’d love to have you — signups begin at 5:30pm. Just bring your instrument and your creativity, and we’ll take care of the rest. Our stage is fully equipped with PA, mics, drums, bass, and everything you need to plug in and play. 🎟️ Free admission 🍻 Grab a beer, settle in, and enjoy the show Come be part of the music — on stage or in the crowd! View on site | Email this event",
    pubDate: "2026-07-30T00:00:00.000Z",
    endDate: "2026-09-24",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/52523630382868/huge/ed08b494666358349bc84e969db6e8b262ef71aa.jpg"
  },
  {
    title: "Yoga in the Park- Wednesday evenings",
    link: "https://events.ourayridgwayevents.com/event/yoga-in-the-park-wednesday-evenings",
    description: "For noncyclists and cyclists alike. After an optional social bike ride at 5 pm, wind down for a yoga class in the park 6 - 7 pm. A moderate to advanced vinyasa style class targetting the areas of the body affected by time in the bike saddle and other areas of request. Bring your own mat. If you don't have one, please let me know earlier in the day so I can bring one for you. Meet at the Gazebo south of Chipeta Lodge. If the weather is too inclement, we can meet at the studio at 380 Sherman Street, Ridgway. While this is donation based, please pay before online or in person. View on site | Email this event",
    pubDate: "2026-07-30T00:00:00.000Z",
    endDate: "2026-09-17",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Gazebo south of Chipeta Lodge, Ridgway, CO (Or studio if raining)",
    imageUrl: "https://localist-images.azureedge.net/photos/52880886803755/huge/ba2d24fbf09ba1f9a707a06213d60685581d7322.jpg"
  },
  {
    title: "Live Music- The Bramblers",
    link: "https://events.ourayridgwayevents.com/event/live-music-the-bramblers",
    description: "Join us on Wednesday, July 29th as we savor the sounds of the Bramblers! The Bramblers are a five-piece Americana and jam-grass band based out of Fort Collins, Colorado. Known for a genre-blurring sound blending folk, psych-rock, funk, and reggae, this rootsy, high-spirited string band brings Americana, folk, and bluegrass to life with infectious energy and tight musicianship. With rollicking rhythms, rich harmonies, and an undeniable warmth, they deliver the kind of music that gets your foot stomping and your spirit lifted. Whether you know every word or are hearing them for the first time, a Bramblers show feels like a celebration. View on site | Email this event",
    pubDate: "2026-07-30T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "St. Elmo Tavern",
    imageUrl: "https://localist-images.azureedge.net/photos/53126545358753/huge/d388db0353cbf06b2a73e8eded661e2e68cf7809.jpg"
  },
  {
    title: "Ridgway Concert Series",
    link: "https://events.ourayridgwayevents.com/event/ridgway-concert-series-9303",
    description: "The Town of Ridgway & Pickin’ Productions Present THE 19TH ANNUAL 2026 RIDGWAY CONCERT SERIES FOOD - VENDORS - BEER - WINE & MARGARITAS JULY 2 LEVI PLATERO Shelby Means JULY 9 BLACK UHURU Psylo JULY 16 SAM GRISMAN PROJECT Tanasi JULY 23 DOGS IN A PILE Felix Y Los Gatos JULY 30 THE RUMBLE Ft. Chief Joseph Boudreaux Jr. Handmade Moments No Dogs or Outside Alcohol Permitted SPONSORS Ridgway Real Estate – Alpine Bank – Chipeta Lodge Resort & Space- Orvis Hot Springs – Julie & Dave Duff – Bennett Forgeworks- OAK – Billings Artwork – Todd W. Hoffman Foundation- The Market at Ridgway – Fiddlers Green – KVNF Public Radio – Alpine Edge Engineering - Alt Space Coworking- Vacation Rental Collective For More Information, Please Visit: www.pickinproductions.com View on site | Email this event",
    pubDate: "2026-07-31T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Hartwell Park",
    imageUrl: "https://localist-images.azureedge.net/photos/52696447609647/huge/b28c8601f5e3e0db939bf8de5f0e8929fe11dc2b.jpg"
  },
  {
    title: "THIRSTY THURSDAY - Game Night at Floating Lotus",
    link: "https://events.ourayridgwayevents.com/event/thirsty-thursday-game-night-at-floating-lotus",
    description: "Thirsty Thursday is where the week turns into the weekend. Every Thursday at Floating Lotus Brewery, we’re bringing the energy with Trivia Night (1st & 3rd) and Music Bingo (2nd & 4th). Cold beer, loud music, and a room full of people who came to have a good time. Happening 7-9pm every week View on site | Email this event",
    pubDate: "2026-07-31T01:00:00.000Z",
    endDate: "2026-09-25",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/52523770567385/huge/aa7bcfeb333ca9d6b01c43aa6294ed32c0d384e4.jpg"
  },
  {
    title: "Love’s Labors Lost: Theatre @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/loves-labours-lost-theatre-the-wright",
    description: "Presented by UpstART Theatre ABOUT THE SHOW Love, language, mistaken identities, and youthful ambition collide in William Shakespeare’s Love’s Labors Lost, one of the Bard’s most playful and fast-moving comedies. When a king and his companions swear off romance in pursuit of scholarship and discipline, their noble intentions are quickly tested by the arrival of a group of equally clever and charismatic visitors. What follows is a whirlwind of wit, flirtation, misunderstandings, and delightfully complicated attempts at self-control. Presented by UpstART Theatre, this fresh staging brings Shakespeare’s comedy to life with humor, heart, and a reminder that even the best plans have a habit of unraveling. In-person performance at the historic Wright Opera House This show is part of our ongoing mission to partner with diverse organizations to bring arts, conversation, and community to downtown Ouray, since 1889. View on site | Email this event",
    pubDate: "2026-07-31T01:30:00.000Z",
    endDate: "2026-08-02",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/52932868603734/huge/c25eaff592f203a10ece3ae8a5f406fca147da0f.jpg"
  },
  {
    title: "Ridgway Farmers Market",
    link: "https://events.ourayridgwayevents.com/event/ridgway-farmers-market",
    description: "Ridgway Farmers Market WHERE LOCAL GROWS... in the soil, in our economy, and in the connections we share as a community Local farmers, ranchers, bakers, and artisans bring the best of Ridgway to town: fresh produce, handcrafted goods, and the shared belief that a strong community begins with supporting the people who live and work here. View on site | Email this event",
    pubDate: "2026-07-31T16:00:00.000Z",
    endDate: "2026-09-18",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Hartwell Park",
    imageUrl: "https://localist-images.azureedge.net/photos/52487561553294/huge/09a2d632a840b6a4d0303261c242753cb58a993a.jpg"
  },
  {
    title: "Paw Prints Book Club",
    link: "https://events.ourayridgwayevents.com/event/paw-prints-book-club",
    description: "Join us in Ouray Library from 1:00 pm to 2:00 pm for the new Paw Prints Book Club! This is an animal themed graphic novel book club ran by a kid, for kids. There will be four book club meetings over 4 weeks, where there will be discussion on a different graphic novel each week. This book club is open to all ages, but the reading level is from 8 to 12 years old. To sign up and reserve a book, please email programsouraypl@gmail.com View on site | Email this event",
    pubDate: "2026-07-31T19:00:00.000Z",
    endDate: "2026-08-07",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Public Library",
    imageUrl: "https://localist-images.azureedge.net/photos/53198530879947/huge/403c155aa2c93ade83d633e106dcb10f0e69f9d8.jpg"
  },
  {
    title: "OLD MAN POLLY",
    link: "https://events.ourayridgwayevents.com/event/old-man-polly-5391",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-07-31T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Historic Walking Tour at Meet",
    link: "https://events.ourayridgwayevents.com/event/historic-walking-tour-9402",
    description: "Historic Walking Tour of Ouray's Government buildings including the Courthouse, City Hall. Ouray School, OCHS Museum. Led by Jenny Hart View on site | Email this event",
    pubDate: "2026-07-31T22:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Museum 420 6th Avenue, Ouray",
    imageUrl: "https://localist-images.azureedge.net/photos/52462553145158/huge/147bc715c72ab517c614f260fa4d426fda89f316.jpg"
  },
  {
    title: "Final Friday: Crafts for Critters",
    link: "https://events.ourayridgwayevents.com/event/final-friday-crafts-for-critters",
    description: "🐾CALLING ALL ANIMAL LOVERS!🐾 Join us at the end of July to make some crafts for critters (dogs and cats), learn from a local behaviorist, and practice some agility with Maple. 🐶 For Middle & High School Students, Final Friday is reclaiming Voyager as the Teen Center it used to be. 🤘 Come hang out for an evening that mixes chill social time with free food and fun activities. Every month, we have games, art and more available. All we ask is that you clean up after yourself and help us create a welcoming space for everyone. This month, Donna Maurer, a former art teacher and local behaviorist will be joining us. If you've ever been interested in learning more about dog behavior, training, and how to best support your pup when they are nervous then this is the Final Friday for you! …",
    pubDate: "2026-07-31T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Voyager Basecamp",
    imageUrl: "https://localist-images.azureedge.net/photos/53428193270953/huge/6a3c9c5a31bf4a7b3359a5c95b660171d698a5e8.jpg"
  },
  {
    title: "Chant to Calm the Fires",
    link: "https://events.ourayridgwayevents.com/event/chant-to-calm-the-fires",
    description: "Join Flora Zenit and Elisabeth \"Lava\" for an evening of chanting to calm our hearts, our minds, and the fires. Flora is an experienced kirtan leader from Venezuela, with an opening act for Sam Garrett under her belt. As an international speaker and performer, Flora has shared stages at Envision Festival, women’s circles, medicinal music events, and conscious festivals. No chanting experience necessary. Just bring the warmth of your heart and prayerful presence. We will be pleading with Divine Mother to calm the fires. We will be sending healing vibrations into the minds of all the first responders and others who are affected . . . and into the forest to all sentient beings affected. Elisabeth and her partner Dave have seen and met some of the firefighters in the field while they were allowed to re-enter briefly for medications while evacuated from their home between Ouray and Ridgway. …",
    pubDate: "2026-07-31T23:15:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Bee True You Wellness & Creative Studio",
    imageUrl: "https://localist-images.azureedge.net/photos/53402739211819/huge/2ab8aa4a78efc06e0ce0ce5f4e0fe11912525a89.jpg"
  },
  {
    title: "The Mysteries of the Shavano Valley Petroglyphs - Ridgway State Park Summer Program Series",
    link: "https://events.ourayridgwayevents.com/event/the-mysteries-of-the-shavano-valley-petroglyphs-ridgway-state-park-summer-program-series",
    description: "Uncover the ancient stories etched into the red rock of the Uncompahgre Valley. Kellie Carroll will take you on an illuminating journey through one of Western Colorado’s most significant archaeological treasures. These sacred carvings offer a rare, firsthand glimpse into the beliefs and daily lives of the ancestral peoples and Ute cultures who moved through these landscapes centuries ago. Whether you are a history enthusiast or a curious explorer, this program will forever change the way you \"read\" the rugged beauty of the San Juan region. View on site | Email this event",
    pubDate: "2026-08-01T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway State Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53454885809272/huge/52a587a8eeea848445a01561517e6366c998ef07.jpg"
  },
  {
    title: "Steps Tavern Presents Karaoke Night",
    link: "https://events.ourayridgwayevents.com/event/steps-tavern-presents-karaoke-night",
    description: "Step's Tavern Presents Karaoke Night. Doors Open at 8:00 PM Every Friday Night View on site | Email this event",
    pubDate: "2026-08-01T02:00:00.000Z",
    endDate: "2026-09-19",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "STEPS TAVERN",
    imageUrl: "https://localist-images.azureedge.net/photos/53142698527493/huge/db3a6ef58a79b18eea8c70a4d583bbf3d9498404.jpg"
  },
  {
    title: "Canceled: Aug 1, 2026: 2-Day Trail Stewardship Trip: West Cimarron & Wetterhorn",
    link: "https://events.ourayridgwayevents.com/event/2-day-trail-stewardship-trip-west-cimarron-wetterhorn",
    description: "Join Ouray Trail Group Crew Leader Jenny for a two-day stewardship trip from West Cimarron to Wetterhorn. Volunteers will perform trail maintenance while enjoying the spectacular scenery of Colorado’s backcountry. This is a rewarding opportunity to help maintain local trails alongside fellow volunteers. There's no cost, but please register. View on site | Email this event",
    pubDate: "2026-08-01T14:00:00.000Z",
    endDate: "2026-08-02",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "West Cimarron Trailhead",
    imageUrl: "https://localist-images.azureedge.net/photos/52932522981610/huge/9bf35e2dc10a9ca173f67ff7eb877828fe036ce2.jpg"
  },
  {
    title: "Nature in Four Seasons: Summer Blooms",
    link: "https://events.ourayridgwayevents.com/event/nature-in-four-seasons-summer-blooms",
    description: "Are you interested in connecting with the landscapes of Ouray? Do you wish for a fun and engaging exploration that you can share with your family? Join SJMA in Ouray for our third exploration hike of the Nature in Four-Season series. During our summer exploration, we will venture into the realm of the subalpine forest where mammals, birds, and insects are busy making the most of the long sunny days of summer. Join us in an exploratory hike to hear life histories and stories of resilience kept by these alpine residents. View on site | Email this event",
    pubDate: "2026-08-01T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Visitor Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52948850400901/huge/0e4358f37156f3815966be295143aa2d6dda3bc0.jpg"
  },
  {
    title: "Reel Success: Kids Fishing Clinic!",
    link: "https://events.ourayridgwayevents.com/event/reel-success-kids-fishing-clinic",
    description: "Calling all young explorers and future fishing pros! Are you ready to trade your screen time for some \"pond time\" and land your very first catch? Whether you've never touched a fishing pole before or you just want to become a pro this is the place to be! We provide all the gear and bait you need, so just bring your energy and get ready for a morning of splashes, big catches, and high-fives at the water’s edge! View on site | Email this event",
    pubDate: "2026-08-01T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway State Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53454902247603/huge/7bce538dbae7921813e646ebdd0f1f93fa7dd5bb.jpg"
  },
  {
    title: "Saturday Yoga",
    link: "https://events.ourayridgwayevents.com/event/saturday-yoga",
    description: "Zen Mountain Yoga is a carefully designed yoga class created to move your mind, body, and spirit through a series of seated and standing yoga poses. Yoga props are used to facilitate deeper movement for a richer stretch environment, designed to increase flexibility, balance, and range of movement. Restorative breathing exercises, neurogenic brain training, and guided relaxation will promote stress reduction and mental clarity. Zen out in as we explore the eight limbs of yoga through your dosha awareness, and bring the mountain home to your heart. Appropriate for beginner to advanced. ***Please visit studioouray.com in case of inclement weather or class cancellation.***Please bring a yoga mat, sun protection, and water.*** $10.00 outside until Labor Day. Drop-indoors after labor day $20.00. View on site | Email this event",
    pubDate: "2026-08-01T15:00:00.000Z",
    endDate: "2026-09-05",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Fellin Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53233830352657/huge/0d1cbbdf672690b660591a1d6fa1c311b49b04ef.jpg"
  },
  {
    title: "TBP Joe @ Floating Lotus",
    link: "https://events.ourayridgwayevents.com/event/tbp-joe-floating-lotus",
    description: "TBP Joe brings a one-man musical experience that's anything but ordinary. Armed with nothing more than a bass guitar, drum machine, and his unmistakable vocals, Joe creates a surprisingly full, groove-driven sound that blurs the line between jam session, comedy, and musical experimentation. His original songs mix funky bass lines, oddball humor, and unexpected twists into a performance that's equal parts concert and performance art. If you're looking for polished pop covers, this isn't it. If you're ready for something unique, quirky, and undeniably entertaining, grab a pint and settle in for an evening with one of western Colorado's most distinctive local musicians. FREE SHOW ALL AGES OUTDOOR STAGE View on site | Email this event",
    pubDate: "2026-08-02T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/53499783772863/huge/b83dcbc6a030e076c8648f54d72eba5cd4b1a100.jpg"
  },
  {
    title: "Paul McDonald and the Mourning Doves - Live",
    link: "https://events.ourayridgwayevents.com/event/paul-mcdonald-and-the-mourning-doves-live",
    description: "Doors: 7:00 pm | Show: 7:30 pm *$25 advance | $30 day of show – to buy GA tickets, select from the ticket option BELOW the seating chart *Limited reserved tables available – to purchase a reserved table, hover over the tables on the seating chart. ABOUT PAUL MCDONALD: Born in Alabama and baptized in the dive bars of the southeast, Paul McDonald first made noise with the Grand Magnolias, a roots-rock outfit, before catching fire in the public eye during American Idol’s 2011 run. When the bright lights blurred and the cameras turned, the man behind the voice slipped into the shadows where he did what real artists do: he lived, he lost, and he wrote. Retreating to Nashville, that holy city of reinvention, Paul stitched himself back together with worn boots, hard songs, and a new band called the Mourning Doves. …",
    pubDate: "2026-08-02T01:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/52994214092717/huge/5ca35ae90d85f2fb14751906e32874146836548f.jpg"
  },
  {
    title: "Home Tour & House Show with Emily Scott Robinson",
    link: "https://events.ourayridgwayevents.com/event/home-tour-house-show-with-emily-scott-robinson",
    description: "Join the Home Trust of Ouray County for an unforgettable summer evening at the Home Tour & House Show on Sunday, August 2, from 5:00–8:30 PM. Explore a curated collection of beautiful homes in Ridgway's Dallas Meadows neighborhood while enjoying delicious food, refreshing beverages, and an intimate live music finale. The evening culminates with a special house show featuring acclaimed singer-songwriter Emily Scott Robinson and local favorite You Knew Me When. Emily Scott Robinson is an internationally touring singer-songwriter signed to John Prine's Oh Boy Records. Praised by NPR, Rolling Stone, Billboard, Colorado Public Radio, and The Washington Post, Robinson recently released her fifth album, Appalachia, which spent six consecutive weeks at #1 on the Folk Radio charts. …",
    pubDate: "2026-08-02T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Registration & Map Pickup",
    imageUrl: "https://localist-images.azureedge.net/photos/53314328176075/huge/f297998422c8d9c4e8e57b3f8553c07441bc20bd.jpg"
  },
  {
    title: "Monthly Karate in Ouray County",
    link: "https://events.ourayridgwayevents.com/event/monthly-karate-in-ouray-county",
    description: "Join Weehawken Creative Arts for Karate with Sensei Kay Briggs. We offer unlimited monthly classes in Ouray County (meaning you can attend each week in Ouray and/or Ridgway — or both). Tuition/registration is DUE the 1st week of the month. Karate class is a great way to learn skills to keep you safe, stay in shape and strong core movements. Karate believes in using it only to protect self and is taught accordingly. Whether you are new to Karate or a seasoned student, the Sensei will work with your level. Taught in the kyokushin kai-kan style, similar shotokan style of karate, we welcome new students to try this exceptional experience for your mind and body! Mixed ages --- Ages 7 through Adult (extended time for more experience) Mondays in Ouray: St. …",
    pubDate: "2026-08-03T23:00:00.000Z",
    endDate: "2026-09-07",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Ridgway (Old Schoolhouse)",
    imageUrl: "https://localist-images.azureedge.net/photos/52253033564264/huge/ef12b5792bac47932752278d68230c7704389412.jpg"
  },
  {
    title: "DAVE MENSCH",
    link: "https://events.ourayridgwayevents.com/event/dave-mensch-7766",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-08-04T22:00:00.000Z",
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
    pubDate: "2026-08-05T00:00:00.000Z",
    endDate: "2026-09-02",
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
    pubDate: "2026-08-05T14:00:00.000Z",
    endDate: "2026-09-02",
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
    pubDate: "2026-08-05T23:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/51579968896083/huge/c4cfc0e9259666342735abc334be44580e4c7198.jpg"
  },
  {
    title: "Live Music- Jack Haight Red Mountain Revival",
    link: "https://events.ourayridgwayevents.com/event/jack-haight-red-mountain-revival",
    description: "Join us for our Grand Opening on June 10 with Jack Haight’s Red Mountain Revival! Kicking off a summer of live music, craft cocktails, mountain views, and unforgettable nights at the St. Elmo Tavern patio EVERY WEDNESDAY! Western Slope favorite Jack Haight is first up for our Patio Summer Sound Series on Wednesday, June 10th at 5pm. No ticket required for this show. From there, enjoy live music every Wednesday all summer long. Featuring a passionate local songwriter + full band, Jack Haight's Red Mountain Revival. Come kick back and enjoy the mountain air! No ticket required for this show. View on site | Email this event",
    pubDate: "2026-08-06T00:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "St. Elmo Tavern",
    imageUrl: "https://localist-images.azureedge.net/photos/53119160417727/huge/ec41c6d94b323d25f94fef4ac166f82aefc428a4.jpg"
  },
  {
    title: "Ouray Youth Summer Programs: Water Sports at Ridgway State Park",
    link: "https://events.ourayridgwayevents.com/event/ouray-youth-summer-programs-water-sports-at-ridgway-state-park",
    description: "Participants will learn the basics of paddle boarding and water safety with instruction and equipment provided by Ridgway State Park staff. Please meet at the Dutch Charlie Marina office at Ridgway State Park and ring snacks, water, sunscreen, a towel and appropriate clothes for the day. REGISTER HERE Scholarships are available if needed. This activity is part of the Youth Adventure Days, sponsored by Ouray's Parks and Recreation Department. For questions, contact Sean Hart at 970-318-1003 or seanhart@cityofouray.com View on site | Email this event",
    pubDate: "2026-08-06T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway State Park",
    imageUrl: "https://localist-images.azureedge.net/photos/52994829548404/huge/1b35bf736db2ace8de36b37a504f763702f48af8.jpg"
  },
  {
    title: "Ridgway Farmers Market",
    link: "https://events.ourayridgwayevents.com/event/copy-of-ridgway-farmers-market",
    description: "Ridgway Farmers Market NOTE: This week, the Market is on a Thursday, since folks will be setting up on Friday for the Ridgway Rendezvous. WHERE LOCAL GROWS... in the soil, in our economy, and in the connections we share as a community Local farmers, ranchers, bakers, and artisans bring the best of Ridgway to town: fresh produce, handcrafted goods, and the shared belief that a strong community begins with supporting the people who live and work here. View on site | Email this event",
    pubDate: "2026-08-06T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Hartwell Park",
    imageUrl: "https://localist-images.azureedge.net/photos/52487582547065/huge/563a405a9c9cafe377d9fb833f1a4084535fcf25.jpg"
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
    description: "Discover new work, celebrate openings and connect with artists at the First Friday Art Walk in downtown Ridgway. Each month galleries, studios and retail spaces throw open their doors for receptions, pop-up exhibits and special programming — perfect for art lovers and casual browsers alike. NEW! 🎨🛍️ Shop local. Win local. Celebrate local. 🎶🍷 Starting this June, your First Friday stroll through Ridgway could score you a $100 gift card to your favorite local business. 👀 Here’s how it works: ✨ Shop during First Friday ✨ Text your receipts from participating businesses ✨ Submit up to 3 receipts each month ✨ Two winners drawn monthly! Every receipt = another chance to win while supporting the galleries, shops, restaurants, artists, makers, and small businesses that make Ridgway feel like Ridgway. 📸 Text receipts to: (970) 316-3197 —or drop them off at Town Hall within 48 hours. …",
    pubDate: "2026-08-07T23:00:00.000Z",
    endDate: "2026-09-04",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Downtown Ridgway, CO",
    imageUrl: "https://localist-images.azureedge.net/photos/52941247100302/huge/24aa8ce412f9817ce04becd51e5d1cc5b8db2cad.jpg"
  },
  {
    title: "First Friday at Rootwings Art at Rootwings Art",
    link: "https://events.ourayridgwayevents.com/event/first-friday-at-rootwings-art-1540",
    description: "Rootwings Art will be open for Ridgway's First Friday Art Walk, featuring local ceramic sculptures and large vessels by artist Andy Nasisse, original oils by Emma Kalff, Bruce Backer's Ravens & Crows, Taos artist Fred Burns fantasy nudes and one of a kind jewelry and ceramics by Vanessa Backer. View on site | Email this event",
    pubDate: "2026-08-07T23:00:00.000Z",
    endDate: "2026-09-04",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Herran House",
    imageUrl: "https://localist-images.azureedge.net/photos/53312391289791/huge/00a6a9e1834a357256b5925d35f6a6525ff06493.jpg"
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
    title: "The 41st Annual Ridgway Rendezvous Arts Festival",
    link: "https://events.ourayridgwayevents.com/event/the-42nd-annual-ridgway-rendezvous-arts-festival",
    description: "Ridgway Rendezvous Arts Festival (41st Annual) Saturday: 9 AM – 5 PM | Sunday: 10 AM – 4 PM | Ridgway Town Park Free Admission Celebrating its 41st year, the Ridgway Rendezvous Arts Festival is a beloved summer tradition in southwest Colorado. Hosted by Weehawken Creative Arts, this highly regarded juried festival is known for exceptional craftsmanship, original design, and high-quality handmade work not easily found elsewhere in the region. Artists consistently call it “one of the best shows of the year,” citing strong sales and a welcoming, well-organized atmosphere. Set in the heart of Ridgway along the scenic Million Dollar Highway, the festival attracts an engaged audience of collectors, second homeowners, and visitors from across the country—and coincides with the nearby Telluride Jazz Festival, expanding its reach and energy. Enjoy live music throughout the day both days, featuring a diverse lineup of talented regional and touring musicians. …",
    pubDate: "2026-08-08T15:00:00.000Z",
    endDate: "2026-08-09",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Hartwell Park",
    imageUrl: "https://localist-images.azureedge.net/photos/52597541791172/huge/0dc02f916413850382610dca39e894ab3e0c73f8.jpg"
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
    title: "Happy Little Trees: Classes @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/happy-little-trees-classes-the-wright",
    description: "Happy Little Trees: Classes @ the Wright WHEN? Classes at 10:30 am WHERE? Wright Community Room Wright Opera House 472 Main St. Ouray, Colorado TICKETS: $55 Per Class (All supplies are included + coffee!) ABOUT THE CLASS Join Emma Kalff for a morning of coffee and painting at the Wright Opera House Community Room. Participants will follow along with a classic Bob Ross episode and create their own Bob Ross–style landscape painting. All supplies are included, and no prior painting experience is necessary. Just bring your curiosity and enjoy a relaxed, creative morning inspired by the joy of painting. …",
    pubDate: "2026-08-08T16:30:00.000Z",
    endDate: "2026-09-12",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/52373044220947/huge/1d3e4ebb5835fbe0ed89bf2b3588d8e41db8f444.jpg"
  },
  {
    title: "Electric Vehicle (EV) Ride and Drive",
    link: "https://events.ourayridgwayevents.com/event/electric-vehicle-ev-ride-and-drive",
    description: "Electric Vehicle (EV) Ride and Drive: Test drive an electric vehicleTest ride the latest e-bike technologyEat a grilled cheese powered by an EVFree train rides! View on site | Email this event",
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
    title: "Ouray: Echoes in the Canyon — Screening @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/ouray-echoes-in-the-canyon-screening-the-wright",
    description: "Ouray: Echoes in the Canyon — Screening @ the Wright WHEN? Saturday, July 18 Doors at 6:30 pm • Film at 7:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado RATING: G ABOUT THE FILM Ouray: Echoes in the Canyon returns to the Wright Opera House following its sold-out premiere. Presented by Photonic Media and produced in cooperation with the City of Ouray 150th Committee, the documentary explores the people, history, landscapes, and enduring spirit that helped shape what many still call \"The Gem of the Rockies.\" Through storytelling, archival perspective, aerial cinematography, and local voices, the film traces the layered history of Ouray and the individuals who built a mountain community that continues to evolve while remaining deeply connected to its frontier roots. The film features aerial photography by Ouray By Flight, cinematography by Levi Kramer, and is produced and directed by Hank Braxtan. …",
    pubDate: "2026-08-09T01:00:00.000Z",
    endDate: "2026-09-24",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/53375404981466/huge/b6ac805d7cab9956501ae2d370b3c2d63385e823.jpg"
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
    endDate: "2026-09-23",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52277881680293/huge/e3b37a55dafe3e5ac88f6f7359fdef186311fd9b.jpg"
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
    title: "EDIE: Theatre @ the Wright Presented by UpstART Theatre",
    link: "https://events.ourayridgwayevents.com/event/edie-theatre-the-wright-presented-by-upstart-theatre",
    description: "EDIE: Theatre @ the Wright Presented by UpstART Theatre WHEN? Friday, August 14 Doors at 7:00 pm • Show at 7:30 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE SHOW Edie, presented by UpstART Theatre, is a special one-time-only performance starring the play's author, Jessica Toltzis. Inspired by the remarkable life of Edith Windsor and her loving, passionate, and transformative relationship with Thea Spyer, Edie tells the story of one woman's fight for dignity, equality, and the right to have her marriage recognized under the law. When Edie Windsor sued the United States government following the death of her wife, her case ultimately reached the Supreme Court, helping redefine marriage rights for millions of Americans. Along the way, she navigated decades of love, loss, discrimination, courage, and self-discovery. …",
    pubDate: "2026-08-15T01:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/53366893046907/huge/7d1ae27186d2776e5040699812057cb6188e9a6a.jpg"
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
    title: "Ouray County Pride",
    link: "https://events.ourayridgwayevents.com/event/ouray-county-pride",
    description: "Small towns. Big mountains. Bigger pride. Ouray County PRIDE returns Saturday, August 15th, 2026. View on site | Email this event",
    pubDate: "2026-08-15T18:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Clinton Street",
    imageUrl: "https://localist-images.azureedge.net/photos/52188308416890/huge/8355bb396a0268d9b10a4c50319341fdfcdec3c1.jpg"
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
    title: "Ouray County Pride After Party @ the Wright presented by SMAC",
    link: "https://events.ourayridgwayevents.com/event/ouray-county-pride-after-party-the-wright-presented-by-smac",
    description: "Ouray County Pride After Party @ the Wright WHEN? Saturday, August 15 Doors at 7:00 pm • Party until late WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE EVENT Keep the celebration going after the Ouray County Pride Block Party with an evening of music, drag, dancing, drinks, and community at the historic Wright Opera House. The Pride After Party brings together locals, visitors, performers, allies, and friends for a joyful night of connection and celebration in one of Colorado's most unique mountain venues. Expect live entertainment, dancing, laughter, and plenty of opportunities to celebrate the people and relationships that make our communities stronger. Whether you spent the afternoon at the Block Party or are just joining the festivities for the evening, all are welcome to come celebrate Pride in the heart of downtown Ouray. …",
    pubDate: "2026-08-16T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/53251445737216/huge/4f015d7791637ae1f1a70b8b9d1b65f12312407b.jpg"
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
    title: "A League of Their Own: CO-150 Film Festival @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/a-league-of-their-own-co-150-film-festival-the-wright",
    description: "A League of Their Own: CO-150 Film Festival @ the Wright WHEN? Wednesday, August 19 Special Community Wiffle Ball Game 3:00 pm Fellin Park, Ouray Movie Screening Doors at 6:30 pm • Movie at 7:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado RUN TIME: 2h 8min RATING: PG ROTTEN TOMATOES SCORE: 82% ABOUT THE FILM A League of Their Own (1992) tells the story of the All-American Girls Professional Baseball League, formed during World War II when many major league players were serving overseas. Led by an unforgettable ensemble cast including Geena Davis, Lori Petty, Rosie O'Donnell, Madonna, and Tom Hanks, the film celebrates the women who stepped onto the field and proved they belonged there. Marla Hooch's tryout scene was filmed at Colorado State University's Glenn Morris Field House in Fort Collins, and the character herself proudly hails from Fort Collins in the film. …",
    pubDate: "2026-08-20T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/53259464395794/huge/7fdca250f8fbc225136fb161d79ef1df818a7b74.jpg"
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
    imageUrl: "https://localist-images.azureedge.net/photos/52092594380571/huge/dd4fc50c3832545339cb376e1b3c66326236ee56.jpg"
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
    title: "Ouray Day",
    link: "https://events.ourayridgwayevents.com/event/ouray-day",
    description: "Celebrate our community at Ouray Day, an afternoon of fun hosted by the City of Ouray Parks and Recreation Department. Bring your friends, family, and neighbors for activities for all ages. This year's celebration will be held alongside the HighGraders Holiday and the Ouray Women's Club Annual Chili Cookoff! Saturday, August 22, 2026 Noon to 4:00 PM Fellin Park, Ouray Activities Include 🏐 Volleyball & Bocce Ball tournaments 🌶️ Chili Cookoff ⛏️ HighGraders Holiday mining competition 🏰 Bouncy houses 💦 Dunk tank 🎨 Local artist booths 🎲 Games for all ages 🎁 Door prizes (including a chance to win an Ouray Hot Springs Pool Annual Pass!) Plus, a free afternoon entry at Ouray Hot Springs for Ouray-area residents with completion of a community survey (available at the event) Schedule Noon – Ouray Day begins 1–2 PM – Volleyball Tournament 1–3 PM – Chess Tournament 2-3 PM – Bocce Ball Tournament …",
    pubDate: "2026-08-22T18:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Fellin Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53481231331209/huge/0f98224078eed909fdc030676f38cbd8272aff8d.jpg"
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
    title: "San Juan Chamber MusicFest",
    link: "https://events.ourayridgwayevents.com/event/san-juan-chamber-musicfest",
    description: "The annual San Juan Chamber MusicFest, OCPAG’s flagship event, features a group of chamber musicians of international acclaim, under the artistic direction of renowned concert pianist Max Levinson. Together, they produce a number of concerts and events in Ouray and Ridgway over the course of a week each August. This year's MusicFest will feature the world-renowned Ulysses Quartet. Read more about the SJCMF musicians HERE. OCPAG is grateful for the grant support from the Dave and Mary Wood Fund and the Western Colorado Community Foundation so that OCPAG is able to bring these concerts to stages around Ouray County. We are also most grateful to the patrons who attend and support this chamber music programming! View on site | Email this event",
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
    description: "Join us for the second CREATIVE SPACE artist salon on WEDNESDAY JUNE 24! We will enjoy an artist talk by local painter, Karen Keene Day, during the run of her exhibition in the Decker Room. Stay and socialize with creatives afterward! Please bring some food/drinks to share! All are welcome! Inspired by our vibrant creative community, these monthly events are intended to build creative community across disciplines! With a different focus each time, we will keep things interesting and engaging! Anyone is welcome to attend, and creatives of all kinds are invited. We welcome your ideas for future events! Bring something to eat or drink to share! To learn more, ask questions, submit ideas, reach out to the Decker Room Coordinator, Arielle. decker@ridgwayfuse.org 872-772-9484 View on site | Email this event",
    pubDate: "2026-08-27T00:00:00.000Z",
    endDate: "2026-09-24",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/53233124549377/huge/48f5037f05c4138c97f3f592d4b11a0581b38eab.jpg"
  },
  {
    title: "Dumb and Dumber: CO-150 Film Festival @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/dumb-and-dumber-co-150-film-festival-the-wright",
    description: "Dumb and Dumber: CO-150 Film Festival @ the Wright WHEN? Wednesday, August 26 Doors at 6:30 pm • Movie at 7:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado RUN TIME: 1h 47min RATING: PG-13 ROTTEN TOMATOES SCORE: 67% ABOUT THE FILM This Colorado-connected screening celebrates one of the state's most memorable movie road trips. Several scenes were filmed in Colorado, including locations in Breckenridge, Fort Collins, and Estes Park, showcasing the mountain landscapes and small-town charm that help make the state such a memorable backdrop for adventure. A wildly funny comedy about friendship, bad decisions, and the occasional accidental success. Tickets $5 In-person screening at the historic Wright Opera House Concessions available. Part of CO 150 Film Fest Screenings @ the Wright, celebrating 150 years of film, community, and conversation in Colorado. View on site | Email this event",
    pubDate: "2026-08-27T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/53259548444843/huge/23e7eee7a5733b674e4f9932b58f78da3e273dc9.jpg"
  },
  {
    title: "THE ONLIES - Live at The Sherbino",
    link: "https://events.ourayridgwayevents.com/event/the-onlies-live-at-the-sherbino",
    description: "August 26 || 6:30 pm doors & Bar || 7:00 pm showtime || seated show || General Admission Tickets: $28 advance / $32 day of show (some reserved section seats are also available via map above GA tickets as-available). Presented in partnership by The Sherbino with Pickin’ Productions The Onlies are a longstanding collective of young friends defining a powerful new generation of stringband music. Described as “the best old-time stringband out there” (Songlines), their music moves with a pulsating drive, sharp arrangements, and rich vibration — it resounds with the present. Multi-instrumentalists and vocalists Sami Braman, Riley Calcagno, and Leo Shannon formed The Onlies in Seattle as young kids, bringing in celebrated guitarist/singer Vivian Leva 10 years later. “ Their fourth album, You Climb The Mountain, marks 20 years as a band. …",
    pubDate: "2026-08-27T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/52994337466169/huge/c00e4314e46ffb42f048810ccb67e832be842847.jpg"
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
    title: "The M Factor, Shredding the Silence on Menopause. Film followed by a panel discussion",
    link: "https://events.ourayridgwayevents.com/event/the-m-factor-shredding-the-silence-on-menopause-film-followed-by-a-panel-discussion",
    description: "September 1 @ 6:30 pm – 8:00 pm Doors at 6:00 PM, Film at 6:30 PM followed by a panel discussion led by local specialists in women’s health issues Dr. Abigail Seaver, ND; Meg Benasutti, ANP-BC, Jennifer McGeorge, ARNP, CNM, MSCP and Kim Walker, DNP, WHNP. Note: this is a different film from the one we showed back in May, which was about Perimenopause About The M Factor Film Menopause is a silent epidemic that affects the health and well‑being of millions of American women. In addition to experiencing traumatic physical symptoms, women are struggling with the related stresses of billions of dollars in lost wages, upended careers, family disruptions, and emotional chaos. This film confront this neglected crisis, challenges societal and medical shortcomings and advocates for a revolutionary approach to women’s health all over the world. …",
    pubDate: "2026-09-02T00:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/53426262588908/huge/71a55615f11bffa976395d1cf0776b9aea0970bd.jpg"
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
    title: "Ongoing: Social Justice Travel Exhibition",
    link: "https://events.ourayridgwayevents.com/event/copy-of-art-opening-social-justice-travel-exhibition",
    description: "Join us for the opening of this special traveling exhibition! Telluride Arts merges creativity and activism through grassroots grants, immersive community exhibitions, and local partnerships that tackle systemic issues and promote wellness. This exhibition features new works by artists who recieved a Social Justice Grant from Telluride Arts to create work for this traveling exhibit. View on site | Email this event",
    pubDate: "2026-09-04T23:00:00.000Z",
    endDate: "2026-09-24",
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
    title: "The Sherbino Presents: “Out There, a National Park Story” film celebrating the National Park Service’s 110th birthday",
    link: "https://events.ourayridgwayevents.com/event/the-sherbino-presents-out-there-a-national-park-story-film-celebrating-the-national-park-services-110th-birthday",
    description: "September 16 @ 6:30 pm – 8:30 pm Doors: 6:00 PM || Film: 6:30 PM || Tickets: $10 in advance || $12 at the door Setting: Seated at The Sherbino What does real, large-scale ecosystem restoration look like? In the centennial year of the U.S. National Park Service, a young filmmaker and his childhood friend set off on a 10,000-mile journey through America’s national parks, leaving home with little more than a camera and a desire to understand what connects people to these wild places. What begins as a summer road trip becomes a seven-year odyssey, capturing untold stories of those who protect, visit, and find healing in the parks. Through intimate interviews, breathtaking cinematography, and a profound original music score, Out There uncovers a deeply human portrait of the parks – revealing them as places of reflection, resilience, and connection across generations and cultures. …",
    pubDate: "2026-09-17T00:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Sherbino",
    imageUrl: "https://localist-images.azureedge.net/photos/53426396696874/huge/27241d9ecc4f078cbc6939a2d11aa90a4705a5f0.jpg"
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
    title: "ALPINE JAM",
    link: "https://events.ourayridgwayevents.com/event/alpine-jam-8336",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-09-22T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  }
];

const NORWOOD_EVENTS = [
  {
    title: "Planning And Zoning Commission Meeting",
    link: "https://www.norwoodtown.com/2026-07-20-planning-and-zoning-commission-meeting",
    description: "",
    pubDate: "2026-07-20T12:00:00.000Z",
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
    title: "Girl Scout Cookie Booth",
    link: "https://townofmountainvillage.com/explore/events/all-events/girl-scout-cookie-booths/",
    description: "Support our local Girl Scout Troop with their cookie sales. Proceeds fund their activities & camps all year. The Girl Scouts will also donate 20 percent",
    pubDate: "2026-07-26T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/47998/20250202_153054.jpg"
  },
  {
    title: "Sunday Rehab: Apres Edition",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-apres-edition/",
    description: "Sunday Rehab: Après Edition is Mountain Lodge Telluride’s weekly Sunday après-ski gathering, happening every Sunday from February 1 through March 29.",
    pubDate: "2026-07-26T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48025/untitled_11_x_17_in_2200_x_1237_px_1800_x_900_px.jpg"
  },
  {
    title: "Sunday Rehab at Alloy Kitchen",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-at-alloy-kitchen/",
    description: "Sundays are for recovery, Mountain Village style. Sunday Rehab at Mountain Lodge's Alloy Kitchen runs each Sunday through October 11, 2026,",
    pubDate: "2026-07-26T12:00:00.000Z",
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
    pubDate: "2026-07-27T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49136/bike-and-brewery-tour-1800x900.jpg"
  },
  {
    title: "Gondola Leadership Committee Meeting",
    link: "https://townofmountainvillage.com/explore/events/all-events/gondola-leadership-committee-meeting/",
    description: "The Town of Mountain Village, Town of Telluride, San Miguel County, Telluride Mountain Village Owners Association Board,",
    pubDate: "2026-07-28T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/41857/mplantz-1016-a7v02976_870x435.jpg"
  },
  {
    title: "Town Talk: The Dual Challenge - Climate and Energy",
    link: "https://townofmountainvillage.com/explore/events/all-events/town-talk-the-dual-challenge-climate-and-energy/",
    description: "The world needs both more energy AND a stable climate. Delivering both is one of the defining challenges of our time. Three leading voices sit down to examine",
    pubDate: "2026-07-28T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48907/0728-tt_320_x_212-tf.jpg"
  },
  {
    title: "Market on the Plaza",
    link: "https://townofmountainvillage.com/explore/events/all-events/market-on-the-plaza/",
    description: "Mountain Village’s pedestrian-friendly Heritage Plaza comes alive with tents each Wednesday, June 10-September 9, 2026 with vendors selling farm-",
    pubDate: "2026-07-29T12:00:00.000Z",
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
    pubDate: "2026-07-29T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49138/wine-and-wickets-1800x900.jpg"
  },
  {
    title: "New York Philharmonic Brass Quintet",
    link: "https://townofmountainvillage.com/explore/events/all-events/new-york-philharmonic-brass-quintet-1/",
    description: "The incredible New York Philharmonic Principal Brass Quintet perform in Telluride! Don’t miss the best brass players in the country in what promises to be a",
    pubDate: "2026-07-31T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48609/nyp_brass.jpg"
  },
  {
    title: "The Brass Family",
    link: "https://townofmountainvillage.com/explore/events/all-events/the-brass-family/",
    description: "“The Brass Family” – with the New York Philharmonic Principal Brass Quintet Learn all about brass instruments in this fun and interactive show with the",
    pubDate: "2026-07-31T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48614/nyp_education.jpg"
  },
  {
    title: "Music on the Green Presents South Austin Moonlighters",
    link: "https://townofmountainvillage.com/explore/events/all-events/music-on-the-green-presents-south-austin-moonlighters-2/",
    description: "Beyond The Groove and TMVOA (tmvoa.org) present South Austin Moonlighters at Reflection Plaza in Mountain Village. The Friday shows are free,",
    pubDate: "2026-07-31T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48857/south_austin_moonlighters_1800x900_px_1740x870.jpeg"
  },
  {
    title: "Mind Blown Telluride",
    link: "https://townofmountainvillage.com/explore/events/all-events/mind-blown-telluride-7/",
    description: "Magician Ty Gallenbeck presents Mind Blown Telluride. Since 2016 this highly acclaimed show has become a favorite of locals, tourist and celebrities.",
    pubDate: "2026-08-01T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
  },
  {
    title: "Girl Scout Cookie Booth",
    link: "https://townofmountainvillage.com/explore/events/all-events/girl-scout-cookie-booths/",
    description: "Support our local Girl Scout Troop with their cookie sales. Proceeds fund their activities & camps all year. The Girl Scouts will also donate 20 percent",
    pubDate: "2026-08-02T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/47998/20250202_153054.jpg"
  },
  {
    title: "Sunday Rehab: Apres Edition",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-apres-edition/",
    description: "Sunday Rehab: Après Edition is Mountain Lodge Telluride’s weekly Sunday après-ski gathering, happening every Sunday from February 1 through March 29.",
    pubDate: "2026-08-02T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48025/untitled_11_x_17_in_2200_x_1237_px_1800_x_900_px.jpg"
  },
  {
    title: "Sunday Rehab at Alloy Kitchen",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-at-alloy-kitchen/",
    description: "Sundays are for recovery, Mountain Village style. Sunday Rehab at Mountain Lodge's Alloy Kitchen runs each Sunday through October 11, 2026,",
    pubDate: "2026-08-02T12:00:00.000Z",
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
    pubDate: "2026-08-03T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49136/bike-and-brewery-tour-1800x900.jpg"
  },
  {
    title: "National Night Out",
    link: "https://townofmountainvillage.com/explore/events/all-events/national-night-out/",
    description: "The Mountain Village Police Department and Village Court Apartments (VCA) are teaming up once again to host the 14th annual National Night Out Tuesday,",
    pubDate: "2026-08-04T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/35582/2026_national_night_out_blog.jpg"
  },
  {
    title: "Market on the Plaza",
    link: "https://townofmountainvillage.com/explore/events/all-events/market-on-the-plaza/",
    description: "Mountain Village’s pedestrian-friendly Heritage Plaza comes alive with tents each Wednesday, June 10-September 9, 2026 with vendors selling farm-",
    pubDate: "2026-08-05T12:00:00.000Z",
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
    pubDate: "2026-08-05T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49138/wine-and-wickets-1800x900.jpg"
  },
  {
    title: "Opening Show for Telluride Jazz Festival",
    link: "https://townofmountainvillage.com/explore/events/all-events/opening-show-for-telluride-jazz-festival/",
    description: "Join us on Thursday, August 6, from 5:00–7:00 PM for the Telluride Jazz Festival Opening Show at Reflection Plaza in Mountain Village (Music on the Green",
    pubDate: "2026-08-06T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49400/mtn-village-event-image-opening-show.jpg"
  },
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
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars returns to the Conference Center Plaza this summer, running every Saturday at dusk from June 13 through August 15. New this year,",
    pubDate: "2026-08-08T12:00:00.000Z",
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
    pubDate: "2026-08-08T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
  },
  {
    title: "Girl Scout Cookie Booth",
    link: "https://townofmountainvillage.com/explore/events/all-events/girl-scout-cookie-booths/",
    description: "Support our local Girl Scout Troop with their cookie sales. Proceeds fund their activities & camps all year. The Girl Scouts will also donate 20 percent",
    pubDate: "2026-08-09T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/47998/20250202_153054.jpg"
  },
  {
    title: "Sunday Rehab: Apres Edition",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-apres-edition/",
    description: "Sunday Rehab: Après Edition is Mountain Lodge Telluride’s weekly Sunday après-ski gathering, happening every Sunday from February 1 through March 29.",
    pubDate: "2026-08-09T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48025/untitled_11_x_17_in_2200_x_1237_px_1800_x_900_px.jpg"
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
    title: "Pristine Bins Demonstration",
    link: "https://townofmountainvillage.com/explore/events/all-events/meadow-parking-lot-pristine-bins-demonstration/",
    description: "Join Pristine Bins for a live demonstration of our eco-friendly trash bin cleaning system on Monday, August 10 5:30-6:30 p.m.",
    pubDate: "2026-08-10T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49434/pristine_bins_event_1800x900_1.png"
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
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars returns to the Conference Center Plaza this summer, running every Saturday at dusk from June 13 through August 15. New this year,",
    pubDate: "2026-08-15T12:00:00.000Z",
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
    pubDate: "2026-08-15T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49016/mountain_village_website.jpg"
  },
  {
    title: "Girl Scout Cookie Booth",
    link: "https://townofmountainvillage.com/explore/events/all-events/girl-scout-cookie-booths/",
    description: "Support our local Girl Scout Troop with their cookie sales. Proceeds fund their activities & camps all year. The Girl Scouts will also donate 20 percent",
    pubDate: "2026-08-16T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/47998/20250202_153054.jpg"
  },
  {
    title: "Sunday Rehab: Apres Edition",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-apres-edition/",
    description: "Sunday Rehab: Après Edition is Mountain Lodge Telluride’s weekly Sunday après-ski gathering, happening every Sunday from February 1 through March 29.",
    pubDate: "2026-08-16T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48025/untitled_11_x_17_in_2200_x_1237_px_1800_x_900_px.jpg"
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
    title: "Girl Scout Cookie Booth",
    link: "https://townofmountainvillage.com/explore/events/all-events/girl-scout-cookie-booths/",
    description: "Support our local Girl Scout Troop with their cookie sales. Proceeds fund their activities & camps all year. The Girl Scouts will also donate 20 percent",
    pubDate: "2026-08-23T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/47998/20250202_153054.jpg"
  },
  {
    title: "Sunday Rehab: Apres Edition",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-apres-edition/",
    description: "Sunday Rehab: Après Edition is Mountain Lodge Telluride’s weekly Sunday après-ski gathering, happening every Sunday from February 1 through March 29.",
    pubDate: "2026-08-23T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48025/untitled_11_x_17_in_2200_x_1237_px_1800_x_900_px.jpg"
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
    title: "Sweet Sounds",
    link: "https://www.telluride.com/event/sweet-sounds/",
    description: "Head to the Wilkinson Public Library on the first Wednesday of the month this summer for live music and sweet treats! …",
    pubDate: "2026-06-03",
    endDate: "2026-08-05",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62443/sweet_sounds_5.800x533.webp"
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
    title: "\"This Is Colorado (In One Square Foot)\" Community Art Project Exhibition",
    link: "https://www.telluride.com/event/this-is-colorado-in-one-square-foot-community-art-project-exhibition/",
    description: "\"This Is Colorado (In One Square Foot)\" is a Community Art Project on display in Telluride and Mountain Village between …",
    pubDate: "2026-06-24",
    endDate: "2026-08-02",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62946/this_is_co_art_exhibit_2200x1237.800x533.webp"
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
    title: "Telluride Theatre&#039;s Annual Shakespeare in the Park",
    link: "https://www.telluride.com/event/telluride-theatres-annual-shakespeare-in-the-park/",
    description: "2026 Shakespeare in the Park\n\nHenry, the young and newly crowned king, is impatient to assert control over the people …",
    pubDate: "2026-07-17",
    endDate: "2026-07-26",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/51687/thunder_tix_600x375px.800x533.webp"
  },
  {
    title: "Telluride Baseball Festival",
    link: "https://www.telluride.com/event/telluride-baseball-festival/",
    description: "The Telluride Baseball Festival offers the combination of an instructional girls softball camp, boys baseball camp, …",
    pubDate: "2026-07-20",
    endDate: "2026-07-27",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44876/1caea1bf-5cda-4196-93fe-07036f415462.800x533.webp"
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
    title: "The National Summer School: Taste Like a Master",
    link: "https://www.telluride.com/event/the-national-summer-school-taste-like-a-master/",
    description: "Step into the shoes of a Master Sommelier in this highly interactive, educational series session. Featuring a blind …",
    pubDate: "2026-07-26",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63073/the-national_wineeducation-flyer_8_5x11.800x533.webp"
  },
  {
    title: "Town Talk: The Dual Challenge - Climate and Energy",
    link: "https://www.telluride.com/event/town-talk-the-dual-challenge-climate-and-energy/",
    description: "The world needs both more energy AND a stable climate. Delivering both is one of the defining challenges of our time. …",
    pubDate: "2026-07-28",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62558/0728-tt_320_x_212-tf.800x533.webp"
  },
  {
    title: "Book Signing With Micheline Klagsbrun",
    link: "https://www.telluride.com/event/book-signing-with-micheline-klagsbrun/",
    description: "Join Fringe for a book signing with Telluride artist Micheline Klagsbrun on Tuesday, July 28th, from 4:30 p.m. - 6 p.m. …",
    pubDate: "2026-07-28",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63062/journey.800x533.webp"
  },
  {
    title: "The Mammoths",
    link: "https://www.telluride.com/event/the-mammoths/",
    description: "Hailing from Austin, TX, fuzz rockers The Mammoths fuse ‘70s inspired psychedelia with biting, petrified rock n’ …",
    pubDate: "2026-07-29",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62660/screenshot_2026-06-01_at_3_26_04_pm.800x533.webp"
  },
  {
    title: "Telluride Reserve",
    link: "https://www.telluride.com/event/telluride-reserve/",
    description: "Telluride Reserve is more than an event—it is an intimate gathering where stories are shared, flavors are discovered, …",
    pubDate: "2026-07-30",
    endDate: "2026-08-02",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/36164/dsc8590_1.800x533.webp"
  },
  {
    title: "Nik Parr & the Selfless Lovers",
    link: "https://www.telluride.com/event/nik-parr-the-selfless-lovers/",
    description: "Nik Parr & The Selfless Lovers are a high-energy, piano-driven roots rock band hailing from Austin, Texas. Imagine …",
    pubDate: "2026-07-30",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62663/screenshot_2026-06-01_at_3_27_44_pm.800x533.webp"
  },
  {
    title: "San Miguel Basin Fair and Rodeo",
    link: "https://www.telluride.com/event/san-miguel-basin-fair-and-rodeo/",
    description: "The San Miguel Basin Fair takes place every summer at the San Miguel County Fairgrounds in Norwood. Livestock shows …",
    pubDate: "2026-07-31",
    endDate: "2026-08-02",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44941/60e630d2b3fd1_image.800x533.webp"
  },
  {
    title: "New York Philharmonic Brass Quintet",
    link: "https://www.telluride.com/event/new-york-philharmonic-brass-quintet/",
    description: "The incredible New York Philharmonic Principal Brass Quintet perform in Telluride! Don’t miss the best brass players …",
    pubDate: "2026-07-31",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62212/nyp_brass.800x533.webp"
  },
  {
    title: "The Brass Family",
    link: "https://www.telluride.com/event/the-brass-family/",
    description: "“The Brass Family” – with the New York Philharmonic Principal Brass Quintet Learn all about brass instruments in …",
    pubDate: "2026-07-31",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62214/nyp_education.800x533.webp"
  },
  {
    title: "Summer Spectacular: The Jungle Book",
    link: "https://www.telluride.com/event/summer-spectacular-the-jungle-book/",
    description: "SAF’s YPT Summer Spectacular program starts on a Monday, and by Friday, these summer campers have learned an entire …",
    pubDate: "2026-07-31",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62640/ypt-sumemr-jungle-book.800x533.webp"
  },
  {
    title: "Top Chef and Taste of Telluride",
    link: "https://www.telluride.com/event/top-chef-and-taste-of-telluride/",
    description: "Top Chef & Taste of Telluride is One to One Mentoring's premier annual fundraiser, bringing together locals, …",
    pubDate: "2026-08-01",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44989/screenshot_2024-07-09_at_1_28_41_pm.800x533.webp"
  },
  {
    title: "Natalie Brooke",
    link: "https://www.telluride.com/event/natalie-brooke/",
    description: "Natalie Brooke is a rock star. A virtuoso funk / rock keys player leading her powerhouse 4-piece band from the …",
    pubDate: "2026-08-01",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62666/screenshot_2026-06-01_at_3_29_24_pm.800x533.webp"
  },
  {
    title: "The Casual Enormity of Adam Palmer Film Screening and Panel Discusson",
    link: "https://www.telluride.com/event/the-casual-enormity-of-adam-palmer-film-screening-and-panel-discusson/",
    description: "A new Colorado-made documentary celebrating the life, values, and enduring influence of community leader Adam Palmer …",
    pubDate: "2026-08-01",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63037/apsf-film-cover.800x533.webp"
  },
  {
    title: "Big Love Car Wash",
    link: "https://www.telluride.com/event/big-love-car-wash/",
    description: "Like the music they play, Big Love Car Wash is full of dichotomies: whimsical yet serious, fanciful yet pragmatic, …",
    pubDate: "2026-08-05",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62901/biglovecarwash-2lb24-1536x1024.800x533.webp"
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
    title: "Burlesque Buffet",
    link: "https://www.telluride.com/event/burlesque-buffet/",
    description: "Presented by Telluride Theatre's Professional Burlesque Troupe: THE HOUSE OF SHIMMY SHAKE! HOSS returns for a …",
    pubDate: "2026-08-21",
    endDate: "2026-08-23",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62743/1_burlesque_buffet_visit_telluride_placeholder.800x533.webp"
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
    expires: "2026-08-05",
    dates: "5/7",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=159",
    address: "",
    smcBidID: "159"
  },
  {
    title: "Request for Proposal -- Soil Preparation and Regrading of Mill Creek Park Site",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking qualified respondents for: Soil Preparation and Regrading of Mill Creek Park Site.",
    deadline: "Open until contracted",
    expires: "2026-08-05",
    dates: "5/7",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=189",
    address: "",
    smcBidID: "189"
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
    title: "Foreclosure Sale -- Section 27 Property (Sale No. 202602)",
    entity: "San Miguel County Public Trustee",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "Public Trustee will conduct a foreclosure sale for property originally owned by Alexander S. Hartman due to death of all named mortgagors under the deed of trust. The property is located in Section 27, Township 45 North, Range 13 West. Current debt holder is Mortgage Assets Management, LLC with an outstanding balance of $309,162.10.",
    deadline: "TBD",
    expires: "2026-07-31",
    dates: "6/4",
    papers: ["ttimes_0604"],
    url: "https://www.telluridenews.com/news/legals/article_f189086a-bd15-49d6-92a1-f8e7553ebb74.html",
    address: "Section 27, Township 45 North, Range 13 West, San Miguel County",
    noticeKey: "foreclosure-202602",
    caseNumber: "202602"
  },
  {
    title: "Financial Report -- Treasurer's Semi-Annual Report (July-December 2025)",
    entity: "San Miguel County Treasurer",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "San Miguel County Treasurer has prepared the Semi-Annual Report for July-December 2025, which is now available for public viewing on the county website under agendas and minutes from May 6, 2026. This report provides financial information about county operations.",
    deadline: "Not specified",
    expires: "2026-07-28",
    dates: "5/28",
    papers: ["ttimes_0528"],
    url: "https://www.telluridenews.com/news/legals/article_0adc5789-cb68-4509-b7a8-1e8bf62a4c8e.html",
    address: "San Miguel County",
    noticeKey: "treasurer-report-2025-h2"
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
    title: "Foreclosure Sale -- Hartman Property (Sale No. COL-000156)",
    entity: "San Miguel County Public Trustee",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "The San Miguel County Public Trustee is conducting a foreclosure sale for property owned by Alexander S. Hartman due to death of all named mortgagors. The property at 1730 Grand Avenue, Norwood will be auctioned on July 30, 2026 at 10:00 AM at the Telluride courthouse to satisfy a debt of $309,162.10.",
    deadline: "July 30, 2026 at 10:00 AM",
    expires: "2026-07-30",
    dates: "6/11",
    papers: ["ttimes_0611"],
    url: "https://www.telluridenews.com/news/legals/article_6de56aef-d7ac-4c1e-bb5f-1bc3f669e424.html",
    address: "Section 27, Township 45 North, Range 13 West (1730 Grand Avenue, Norwood, CO 81423)",
    noticeKey: "foreclosure-col-000156"
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
    title: "Public Notice -- San Miguel County Board of Equalization (CBOE) Session 2026",
    entity: "San Miguel County Board of Equalization",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "The San Miguel County Board of Commissioners will sit as the Board of Equalization (CBOE) from July 1 through August 5, 2026, to hear taxpayer appeals of Assessor property valuation and classification decisions. Independent hearing officers will conduct hearings and submit recommendations; only taxpayers who previously filed objections with the Assessor may petition. Filing deadlines are July 15, 2026 for real property and July 20, 2026 for personal property.",
    deadline: "2026-07-20",
    expires: "2026-08-05",
    dates: "7/2",
    papers: ["ttimes_0702"],
    url: "https://www.telluridenews.com/news/legals/article_d2ca136e-7993-4d52-abfc-0e8f243974dd.html",
    address: "Miramonte Building, 2nd Floor, Room 201, 333 West Colorado Avenue, Telluride, Colorado",
    noticeKey: "COL-000178-cboe-2026"
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
    title: "Public Notice -- Replacement of Lost Share Certificate #887, Farmers' Water Development Company",
    entity: "Farmers' Water Development Company",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "💧",
    iconClass: "type-hearing",
    type: "Utilities",
    filterTag: "utilities",
    summary: "The Farmers' Water Development Company (FWDC) has received a written request to replace lost, destroyed, or wrongfully taken share certificate #887, currently issued in the name of A.F. Newans M.D., C.P. Unless a written objection is filed with FWDC at PO Box 10, Norwood, CO 81423 within 30 days of the last publication date in the Norwood Post, a replacement certificate will be issued and the original permanently cancelled.",
    deadline: "2026-07-30",
    expires: "2026-07-30",
    dates: "7/2",
    papers: ["ttimes_0702"],
    url: "https://www.telluridenews.com/news/legals/article_d2ca136e-7993-4d52-abfc-0e8f243974dd.html",
    address: "Farmers' Water Development Company, PO Box 10, Norwood, CO 81423",
    noticeKey: "COL-000181-fwdc-share-cert-887"
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
    title: "Request for Proposal -- Telluride Town Park Oval Improvements (Part 1) and Warner Field Fencing and Safety Netting",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "Town of Telluride is seeking qualified respondents for: Telluride Town Park Oval Improvements (Part 1) and Warner Field Fencing and Safety Netting.",
    deadline: "Closes 7/31/2026",
    expires: "2026-07-31",
    dates: "7/10",
    url: "https://www.telluride.gov/bids.aspx?bidID=131",
    address: "",
    totBidID: "131"
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
    title: "RFP -- Town Park Oval Improvements (Part 1) and Warner Field Fencing and Safety Netting Project",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "The Town of Telluride is soliciting proposals for two related projects: Oval Improvements (Part 1) and fencing/safety netting at Warner Field, both located in Telluride's Town Park. The full RFP is available on the Town's website at www.telluride.gov. Proposals must be submitted before 3:00 PM MT on Friday, July 31, 2026.",
    deadline: "2026-07-31",
    expires: "2026-07-31",
    dates: "7/16",
    papers: ["ttimes_0716"],
    url: "https://www.telluridenews.com/news/legals/article_6d5eb2e7-d860-4528-8e72-754a66dad591.html",
    address: "Town Park, Telluride, CO",
    noticeKey: "rfp-telluride-townpark-oval-warner"
  },
  {
    title: "Public Hearing -- San Miguel County LUC Amendment, Section 5-1305B \"Qualified Owner\" Definition",
    entity: "San Miguel County Board of County Commissioners",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "The San Miguel County Board of County Commissioners will hold a public hearing to consider a Land Use Code amendment to Section 5-1305B, which would change the definition of 'Qualified Owner,' along with related amendments to Sections 5-1305C and 5-1350F. This is the second step of a two-step LUC amendment process requiring Community Planning Commission review and Board action. The hearing is scheduled for 10:00 AM or later on Wednesday, August 5, 2026, held both online and in person at 333 W Colorado Ave, 2nd Floor, Telluride; written comments should be received by noon on July 28, 2026.",
    deadline: "2026-08-05",
    expires: "2026-08-05",
    dates: "7/16",
    papers: ["ttimes_0716"],
    url: "https://www.telluridenews.com/news/legals/article_6d5eb2e7-d860-4528-8e72-754a66dad591.html",
    address: "333 W Colorado Ave, 2nd Floor, Telluride, CO 81435",
    noticeKey: "smc-luc-amendment-5-1305B-qualified-owner"
  },
  {
    title: "Public Hearing -- San Miguel County LUC Amendment, Section 5-406 Wildfire Areas",
    entity: "San Miguel County Board of County Commissioners",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "The San Miguel County Board of County Commissioners will hold a public hearing to consider a Land Use Code amendment to Section 5-406 (Wildfire Areas), with related amendments to Article 7 (Definitions). This is the second step of a two-step LUC amendment process. The hearing is set for 10:00 AM or later on Wednesday, August 5, 2026, held both online and in person at 333 W Colorado Ave, 2nd Floor, Telluride; written comments should be received by noon on July 28, 2026.",
    deadline: "2026-08-05",
    expires: "2026-08-05",
    dates: "7/16",
    papers: ["ttimes_0716"],
    url: "https://www.telluridenews.com/news/legals/article_6d5eb2e7-d860-4528-8e72-754a66dad591.html",
    address: "333 W Colorado Ave, 2nd Floor, Telluride, CO 81435",
    noticeKey: "smc-luc-amendment-5-406-wildfire"
  },
  {
    title: "RFP -- Town Park Oval Improvements (Part 1) and Warner Field Fencing and Safety Netting Project",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "The Town of Telluride is soliciting proposals for improvements to the Oval (Part 1) and for fencing and safety netting at Warner Field, both located in Town Park. The full RFP is available on the Town's website at www.telluride.gov. Proposals must be submitted prior to 3:00 PM MT on Friday, July 31, 2026.",
    deadline: "2026-07-31",
    expires: "2026-07-31",
    dates: "7/23",
    papers: ["ttimes_0723"],
    url: "https://www.telluridenews.com/news/legals/article_fde85bc0-ac38-4ba1-9534-66f7d114f129.html",
    address: "Town Park, Telluride, Colorado",
    noticeKey: "rfp-telluride-town-park-oval-warner-field"
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
    title: "RFP -- San Miguel County Historic Placerville Schoolhouse Interior Repainting",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "San Miguel County is requesting proposals from contractors to repaint the interior of the Historic Placerville Schoolhouse located at 400 Front Street, Placerville, Colorado. RFP information is available at www.sanmiguelcountyco.gov/bids.aspx or from the Fleet & Facilities Department at 333 W. Colorado Ave., 2nd Floor, Telluride. Proposals are due by 5:00 PM on Wednesday, August 6, 2026, submitted either by email or dropped off at the Fleet & Facilities office.",
    deadline: "2026-08-06",
    expires: "2026-08-06",
    dates: "7/23",
    papers: ["ttimes_0723"],
    url: "https://www.telluridenews.com/news/legals/article_fde85bc0-ac38-4ba1-9534-66f7d114f129.html",
    address: "400 Front Street, Placerville, Colorado",
    noticeKey: "rfp-placerville-schoolhouse-repainting"
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
    title: "Request for Proposal -- Request for Proposals Interior Painting of the Placerville Schoolhouse",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking qualified respondents for: Request for Proposals Interior Painting of the Placerville Schoolhouse.",
    deadline: "Closes 8/6/2026",
    expires: "2026-08-06",
    dates: "7/23",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=206",
    address: "",
    smcBidID: "206"
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
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20July%202026%20Agenda%20Work%20Session.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20July%202026%20Pakcet%20Work%20Session_0.pdf"},

  "July 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20July%202026%20Agenda.pdf"},

  "July 2026 Meeting":
    {"packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20July%202026%20Packet.pdf"},

  "June 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20June%202026%20Agenda.pdf"},

  "June 2026 Meeting":
    {"packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20June%202026%20Packet.pdf"},

  "June 2026 Special Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20June%202026%20Agenda%20Special%20Meeting_0.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20June%202026%20Packet%20Special%20Meeting.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/June%20Spec.%202026%20minutes.pdf"},

  "May 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20May%202026%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20May%202026%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/May%202026%20minutes.pdf"},

  "April 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20April%202026%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20April%202026%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/April%202026%20minutes.pdf"},

  "March 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%202026%20Agenda_0.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%202026%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/March%202026%20minutes.pdf"},

  "February 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20February%202026%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20February%202026%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Feb%202026%20minutes.pdf"},

  "February 2026 Work Session":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20February%202026%20Work%20Session%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20February%202026%20Work%20Session%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/feb%202026%20special%20minutes.pdf"},

  "January 2026":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20January%202026%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20January%202026%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/January%202026%20minutes.pdf"},

  "December 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20December%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20December%202025%20Packet_0.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/December%202025%20minutes.pdf"},

  "December 2025 Special Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20December%203%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20December%203%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/December%203%202025%20minutes%20special%20meeting.pdf"},

  "November 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20November%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20November%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/nov%2019_%202025%20minutes.pdf"},

  "October 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20October%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20October%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/october%202025%20minutes.pdf"},

  "September 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20September%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20September%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/September%2017%20minutes.pdf"},

  "August 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20August%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20August%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/August%2020%20minutes.pdf"},

  "August 2025 Planning Commission and Board of Trustee Joint Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Planning%20Commission%20and%20Board%20of%20Trustees%20Joint%20Meeting%20Agenda%20August%2013%202025.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Planning%20Commission%20and%20Board%20of%20Trustees%20Joint%20Meeting%20Packet%20August%2013%202025.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/august%2013_%202025%20minutes.pdf"},

  "July 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20July%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20July%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/July%2016%20minutes.pdf"},

  "July 2025 Special Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20July%20Special%20Meeting%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20July%20Special%20Meeting%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/July%209%20minutes.pdf"},

  "June 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20June%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20June%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/June%2018%20minutes.pdf"},

  "June 2025 Planning Commission and Board of Trustee Joint Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Planning%20Commission%20and%20Board%20of%20Trustees%20Joint%20Meeting%20Agenda%20June%2011%202025.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/June%2011%20minutes.pdf"},

  "May 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20May%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20May%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/minutes%20may%2021%202025.pdf"},

  "May 2025 Planning Commission and Board of Trustee Joint Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Planning%20Commission%20and%20Board%20of%20Trustees%20Joint%20Meeting%20Agenda%20May%2014%202025.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Planning%20Commission%20and%20Board%20of%20Trustees%20Joint%20Meeting%20Packet%20May%2014%202025.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/minutes%20may%2014%202025.pdf"},

  "April 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20April%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20April%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/minutes%20april%2016%202025.pdf"},

  "March 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%202025%20Agenda_0.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/minutes%20mar%2019%202025.pdf"},

  "March 2025 Special Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%203rd%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%203rd%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/minutes%20mar%203%202025.pdf"},

  "February 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20February%202025%20Agenda_0.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20February%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/minutes%20feb%2019%202025.pdf"},

  "January 2025 Special Session":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20January%202025%20Agenda%20Special%20Meeting.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20January%202025%20Packet%20Special%20Meeting.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/minutes%20jan%2030%202025.pdf"},

  "January 2025":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20January%202025%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20January%202025%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/minutes%20jan%2015%202025.pdf"},

  "December 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20December%20%202024%20Agenda%20.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20December%20%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/minutes%20December%202024.pdf"},

  "November 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20November%20%202024%20Agenda%20.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20November%20%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/minutes%20November%202024.pdf"},

  "October 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20October%202024%20Agenda%20_0.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20October%202024%20Packet_0.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/October%2016_%202024%20minutes.pdf"},

  "September 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20September%202024%20Agenda%20_0.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20September%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/September_%202024%20minutes.pdf"},

  "September 2024 Planning Commission and Board of Trustee Joint Meeting":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Planning%20Commission%20and%20Board%20of%20Trustees%20Joint%20Meeting%20Agenda%20September%2011%202024.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Planning%20Commission%20and%20Board%20of%20Trustees%20Joint%20Meeting%20Packet%20September%2011%202024_0.pdf"},

  "August 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20August%2021%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20August%2021%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/August%2021_%202024%20minutes.pdf"},

  "July 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20July%2017%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20July%2017%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/July%2017_%202024%20minutes.pdf"},

  "June 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20June%2019%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20June%2019%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/June%2019_%202024%20minutes.pdf"},

  "May 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20May%2015%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20May%2015%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/May%2015_%202024%20minutes.pdf"},

  "April 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20April%2017%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20April%2017%202024%20Packet.pdf"},

  "March 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%2020%202024%20Agenda_1.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%2020%202024%20Packet_1.pdf"},

  "March 2024 VCUP Public Forum":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%207%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/March%207%20VCUP%20Public%20Forum%20Handouts_without%20CT.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/3.7.24.pdf"},

  "March 2024 VCUP Special Session":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%206%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20March%206%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/3.6.24.pdf"},

  "February 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20February%2028%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20February%2028%202024%20Packet.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/2.28.24.pdf"},

  "February 2024 Sewer Work Session":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20Feb%2015%202024%20Agenda.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Rico%20Wastewater%20Collection%20and%20Treatment%20System%20%281%29.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/2.15.24.pdf"},

  "January 2024":
    {"agenda":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20January%2017%202024%20Agenda_0.pdf","packet":"https://townofrico.colorado.gov/sites/townofrico/files/documents/Board%20of%20Trustees%20January%2017%202024%20Packet_0.pdf","minutes":"https://townofrico.colorado.gov/sites/townofrico/files/documents/1.17.24.pdf"}
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
    date: "July 27, 2026",
    title: "Special Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8294",
    hasAgenda: true,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8294,
    packetUrl: "https://telluride-co.civicweb.net/document/442029/"
  },
  {
    date: "July 29, 2026",
    title: "Parks & Recreation Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8288",
    hasAgenda: true,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8288,
    packetUrl: "https://telluride-co.civicweb.net/document/442582/"
  },
  {
    date: "August 5, 2026",
    title: "Telluride Housing Authority Subcommittee",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8162",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8162
  },
  {
    date: "August 6, 2026",
    title: "Town Council Retreat",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8050",
    hasAgenda: false,
    location: "Hybrid/Public Works Conference Room 1370 W Black Bear Rd. Telluride, CO 81435",
    time: "",
    civicwebId: 8050
  },
  {
    date: "August 11, 2026",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8041",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8041
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
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: "",
    civicwebId: 8102
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
