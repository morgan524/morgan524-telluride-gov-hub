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
  "county|2026-06-18|Lodging Tax Board 06/18/26":
    {"meetingId":"860 8356 9395","passcode":"993341","phone":"970-728-3844","sv":2},

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

  "telluride|2026-06-25|Planning & Zoning Commission - Jun 25 2026":
    {"sv":2,"zoomUrl":"https://us06web.zoom.us/meeting/register/pvzPtHtIRZmah22XUU2xLg","meetingId":"846 6324 0731","passcode":"769982","phone":"301-715-8592"},

  "telluride|2026-06-25|Planning & Zoning Commission Chair - Jun 25 2026":
    {"sv":2,"zoomUrl":"https://us06web.zoom.us/meeting/register/m65fl_EfRuC-m1IoGX6uiQ","meetingId":"815 3599 7736","passcode":"769982","phone":"301-715-8592"},

  "county|2026-06-22|Open Space Commission Meeting":
    {"sv":2,"zoomUrl":"https://www.google.com/url?q=https://us06web.zoom.us/j/82416565788&sa=D&source=calendar&ust=1782161034577544&usg=AOvVaw1VhSAXMLvCsaoHEGucwKxm","meetingId":"824 1656 5788","passcode":"269895","phone":"970-369-5469"},

  "county|2026-06-24|Board of County Commissioners Work Session":
    {"sv":2},

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

  "med|2026-06-25|Regular Board Meeting":
    {"zoomUrl":"https://us02web.zoom.us/j/89509331558","meetingId":"895 0933 1558","sv":2},

  "telluride|2026-06-23|Special Meeting - HARC and P&Z - Jun 23 2026":
    {"zoomUrl":"https://us06web.zoom.us/j/83056176189?pwd=wUqZ62DdTaXbfx8NAiQ1yp595tbwuI.1","meetingId":"830 5617 6189","passcode":"042711.","phone":"301-715-8592","sv":2},

  "telluride|2026-06-23|Special Meeting - P&Z and HARC - Jun 23 2026":
    {"zoomUrl":"https://us06web.zoom.us/j/83056176189?pwd=wUqZ62DdTaXbfx8NAiQ1yp595tbwuI.1","meetingId":"830 5617 6189","passcode":"042711.","phone":"301-715-8592","sv":2},

  "airport|2026-07-16|TRAA Board of Commissioners Meeting":
    {"sv":2},

  "telluride|2026-07-16|Liquor Licensing Authority - Jul 16 2026":
    {"sv":4,"zoomUrl":"https://us06web.zoom.us/j/86169871704?pwd=oK56hZLiXIbBia4HLKYI9XqWcVl8Uz.1","meetingId":"861 6987 1704","passcode":"281002.","phone":"346-248-7799","agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8143"},

  "fire|2026-07-21|Board of Directors Meeting":
    {"sv":2},

  "telluride|2026-07-21|Town Council - Jul 21 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8040","zoomUrl":"https://us06web.zoom.us/meeting/register/hL-sJDF8Q8ej2lG69VjXKg","meetingId":"834 6167 7173","passcode":"555594.","phone":"719) 359-4580"},

  "county|2026-07-22|Board of County Commissioners Special Meeting":
    {"sv":4,"agendaUrl":"https://sanmiguelcoco.portal.civicclerk.com/event/868/files/agenda/1919","zoomUrl":"https://us02web.zoom.us/meeting/register/o_8OplehSy6kph_vj5KITw","meetingId":"836 0680 9358","passcode":"535472","phone":"719-359-4580"},

  "telluride|2026-07-23|Planning & Zoning Commission - Jul 23 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8100","zoomUrl":"https://us06web.zoom.us/meeting/register/pvzPtHtIRZmah22XUU2xLg","meetingId":"846 6324 0731","passcode":"464545","phone":"301-715-8592"},

  "telluride|2026-07-23|Planning & Zoning Commission Chair - Jul 23 2026":
    {"sv":4},

  "telluride|2026-06-25|Planning & Zoning Commission Chair - Jun 25 2026 - Cancelled":
    {"sv":2},

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
    {"sv":4},

  "telluride|2026-07-29|(RESCHEDULED) Parks & Recreation Commission - Jul 29 2026":
    {"sv":4,"agendaUrl":"https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8288"},

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
    {"sv":4}
};

const MANUAL_SUMMARIES = {
  "county|2026-06-22|Open Space Commission Meeting":
    "The Open Space Commission meets June 22 to work through several active trail and open space projects. On the table: a NEPA process update for the Perimeter Trail, new signage for the Keystone Gorge Loop Trail, and a conversation about future goals for the San Juan Skyway Scenic Byway Corridor. Conceptual plans for Mill Creek Park and an update on the Down Valley Connector Trail through Sawpit are also on the agenda. The commission will also address two vacancies — one regular seat and one alternate — plus a Northwest Mountain seasonal slot.",

  "county|2026-06-24|Board of County Commissioners Work Session":
    "MEETING CANCELED — the Board of County Commissioners' June 24 work session has been canceled. The next BOCC meeting is the regular meeting on July 1.",

  "telluride|2026-06-23|Special Meeting - HARC and P&Z - Jun 23 2026":
    "A joint subset of HARC and P&Z meets for one hour to work through proposed amendments to the Town's Land Use Code and Design Guidelines — changes needed to bring Telluride into alignment with the Colorado Wildfire Resiliency Code. Whatever language they recommend goes to Town Council for the final call. Wildfire code compliance has been working its way through mountain communities across the state; this is Telluride's turn to reconcile state requirements with local historic and architectural standards — two frameworks that don't always sit comfortably together.",

  "telluride|2026-06-23|Special Meeting - P&Z and HARC - Jun 23 2026":
    "A joint special session of P&Z and HARC — one hour, one item. The two commissions will review proposed amendments to the Town's Land Use Code and Design Guidelines needed to bring Telluride into consistency with the Colorado Wildfire Resiliency Code. Whatever they recommend moves to Town Council for final consideration. Wildfire code alignment has been on the horizon for mountain communities across the state; this is Telluride working through what that means for local rules on materials, design, and land use.",

  "med|2026-06-25|Regular Board Meeting":
    "The Telluride Hospital District board meets June 25 with a full slate of internal matters. The heaviest item on the agenda is a 45-minute discussion of mill levy considerations — the taxing mechanism that funds the district, and a recurring pressure point as the hospital works toward a new facility. Board members will also spend time on new facility updates and partnership updates, plus a communications strategy discussion. The finance committee and CFO will walk through May 2026 draft financials. Consent items include ratification of an updated investment policy.",

  "telluride|2026-06-25|Planning & Zoning Commission - Jun 25 2026":
    "The commission holds a work session on the Shandoka Lot Redevelopment Project— the major Town-owned redevelopment proposal brought forward by Design Workshop. The commission gives feedback to staff and the applicant before formal Land Use Code review begins. You can read more about this project [here](https://livabletelluride.org/deep-dive-carhenge.html).",

  "telluride|2026-06-25|Planning & Zoning Commission Chair - Jun 25 2026":
    "The Chair was scheduled to take up the 238 N Pine Street minor subdivision (a request to split a 7,500 sq ft Historic Residential lot into two), but the applicant has asked for it to be continued again — to the July 23 P&Z meeting. No substantive action is expected at this meeting. 4:00 PM at Rebekah Hall.",

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

  "county|2026-06-18|Lodging Tax Board 06/18/26":
    "The Lodging Tax Board meets to review tax reports and hear updates from the Norwood Chamber and Telluride Tourism Board. Standard quarterly check-in on how lodging tax dollars are being distributed and used across the county.",

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

  "telluride|2026-06-25|Planning & Zoning Commission Chair - Jun 25 2026 - Cancelled":
    "The June 25, 2026 Planning & Zoning Commission Chair meeting has been cancelled.",

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
    "The agenda for this July 29 joint work session between the San Miguel County Planning Commission and the Board of County Commissioners hasn't been posted yet.",

  "telluride|2026-07-29|(RESCHEDULED) Parks & Recreation Commission - Jul 29 2026":
    "The July 29, 2026 (Rescheduled) Parks & Recreation Commission agenda hasn't been posted yet.",

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
    "The August 13 San Miguel County Planning Commission agenda hasn't been posted yet.",

  "telluride|2026-07-27|Special Town Council - Jul 27 2026":
    "A single item: the Council, sitting as the Liquor Licensing Authority, will hold a public hearing on a special event permit request from San Miguel Educational Fund (KOTO Radio) for its Live at the Drive event at 207 N Pine Street on July 30, 2026, from 2:00 pm to 9:30 pm.",

  "telluride|2026-07-20|Gondola Subcommittee - Jul 20 2026":
    "The Gondola Advisory Committee meets virtually to receive the project team's economic and fiscal impact analysis of the gondola — the central item on this agenda. The analysis ties gondola operations to visitation patterns, retail spending, and sales tax across Telluride and Mountain Village, finding that 30% of Telluride visitors and 45% of Mountain Village visitors ride it at least once per trip, and that restaurant sales in particular track closely with ridership. Growth projections are being revised downward over the next 20 years, driven by rising costs of living, accelerating home values, infrastructure limits, and demographic shifts. The committee will also review materials for the July 28 Leadership Committee meeting, which will cover the FTA Capital Investment Grants program and local funding strategy — a consequential topic given that the hypothetical funding scenario puts the project at $140M total, with $20M each expected from the Town of Telluride and the Mountain Village Entity. August's Gsub meeting is set to examine traffic, parking, and bus-replacement scenarios in the event of a prolonged gondola outage.",

  "county|2026-07-27|Housing Code Update SSR":
    "The agenda for this Housing Code Update SSR meeting lists only the title — no line items, staff reports, or supporting materials have been posted. There's enough history with housing code work in the county to know these sessions can carry real weight, but there's nothing specific to report yet."
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
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-07-16",
    title: "Strategic Stakeholders Roundtable — Jul 16, 2026",
    recap: "San Miguel County's Strategic Stakeholders Roundtable held its sixth session focused on proposed land use code changes tied to workforce housing. The group reached informal consensus on two density questions: by-right density in both the low-density and medium-density zone districts will remain at one dwelling unit per 35 acres, with any additional density available only through affordable-housing bonuses. A side setback reduction from 12.5 to 10 feet in medium and high-density zones was approved by a show of hands with one dissent. Discussion on high-density zones and the structure of density-bonus tiers was left unresolved; staff will develop bonus scenarios for a follow-up session scheduled for the morning of Monday, July 28. A joint planning commission and Board of County Commissioners work session is set for July 29.",
    videoUrl: "https://www.youtube.com/watch?v=T8SXtsAOB70"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-06-30",
    title: "Town Council — Jun 30, 2026",
    recap: "Council held two executive sessions (deputy municipal court judge personnel matter; town manager check-in). On action items, the Black Hills Energy gas franchise was renewed for 10 years (unanimous, second reading). A 50% tap-fee waiver and payment plan for the Telluride School District's employee housing project passed 5-1, with one dissent favoring a full waiver. Ordinances authorizing sale of two town-employee housing units (907 East Colorado and Longwill 16-B3) passed unanimously. An emergency Stage 2 fire-restrictions ordinance was adopted unanimously. Ronald Carlson was appointed deputy municipal court judge unanimously. A land use code amendment to implement Colorado Wildfire Resiliency Code passed unanimously on first reading. The town authorized purchase of Spruce House Unit H unanimously. Stephanie Hatcher was reappointed to CCASE unanimously. The Telluride Housing Authority appointed seven resident advisory committee members unanimously. Work sessions covered updates to the Telluride Energy Mitigation Program (TEMP) and presentation of the 2026 community survey, which showed declining confidence in local government and economic health alongside improving marks for public safety and mobility. Substantial public comment opposed converting the Town Park Oval green space to a hard-surface sports court.",
    videoUrl: "https://www.youtube.com/watch?v=I4t6u53slF8"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-06-25",
    title: "Planning & Zoning — Jun 25, 2026",
    recap: "The commission continued the 238 North Pine Street minor subdivision application to its July 23 meeting without discussion. The bulk of the meeting was a work session on the Shandoka Lot redevelopment project — a town-owned 4-acre parcel at 860 Black Bear Road proposed for a large-scale PUD that would include roughly 50–60 housing units (mostly affordable, with a limited free-market share), approximately 300 net new public parking spaces within a structured garage, neighborhood-serving commercial uses (daycare, food bank, restaurant, retail, fitness), and a transit center. No votes were taken on the project; commissioners raised extensive questions about parking demand calculations, water-table and flood-zone risks for below-grade construction, traffic impacts, green space adequacy, building massing and solar access along the river trail, and EV charging. The commission also voted to recommend that Town Council adopt land use code amendments to Section 3-505 (tree removal/maintenance) to align with the Colorado Wildfire Resiliency Code, with several wording revisions directed by the commission; the ordinance is scheduled for council consideration June 30.",
    videoUrl: "https://www.youtube.com/watch?v=m0qjXC2TCfo"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-06-17",
    title: "HARC — Jun 17, 2026",
    recap: "HARC voted to continue the flood-elevation raise request for 239 North Aspen (5-1) to the July 15 meeting, directing staff to provide a detailed written explanation of which flood-plain code interpretation changed to require the structure to be lifted. For 566 West Columbia, HARC approved a certificate-of-appropriateness amendment allowing the contributing primary structure to be raised an additional 3¼ inches to meet the flood-protection elevation (4-1). For 208 South Fir, a large commercial new-construction project in the warehouse district, HARC granted preliminary approval (4-1) with conditions addressing roof material, building height and depth, wall-plane articulation along the alley, an arborist report, parking payment-in-lieu, and building materials. Two individual-property items were continued to the August 19 meeting.",
    videoUrl: "https://www.youtube.com/watch?v=3naByhxnyjE"
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-06-09",
    title: "Town Council — Jun 9, 2026",
    videoUrl: "https://www.youtube.com/watch?v=vxrKceCqXaM",
    recap: "A housing-heavy June meeting. Council gave first-reading approval to selling two more deed-restricted units (907 East Colorado and Longwell 16), accepted the 2025 audit, and approved a first reading of the Black Hills gas franchise. The fire-restriction ordinance passed on second reading. Three residents were reappointed to commissions and the airport board. The one split vote was a partial waiver of school-district tap fees for teacher housing, which passed 4-2 with Stark and Enright opposed."
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-06-03",
    title: "Board of County Commissioners — Jun 3, 2026",
    videoUrl: "https://www.youtube.com/watch?v=3nSAqRc0Cpk",
    recap: "A land-and-housing day for the BOCC. They approved an additional $100,000 to the Telluride Foundation's Housing Opportunity Fund and renamed their new fast-track development rule from 'Accelerated' to 'Prioritized' Housing Review. A bouldering gym in Illium received a PUD amendment, accessory-dwelling-unit sizing was clarified, and new on-site wastewater regulations were adopted. All votes passed 3-0."
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-05-28",
    title: "Planning & Zoning Commission — May 28, 2026",
    recap: "The commission took action on two public hearing items and one work session. On the minor subdivision application for 238 North Pine Street — which would split a 7,500-square-foot corner lot into two 25-foot lots — the commission voted unanimously to continue the hearing to June 25, directing staff to analyze grounds for a potential denial motion and to examine setback and height implications. On the Carhenge lot conceptual PUD (700 West Pacific Avenue, proposing roughly 220–230 affordable units with height and site-coverage variations), the commission voted unanimously to continue to July 23, directing the applicant to consider reductions in height, maximum floor area, and site coverage, and to provide preliminary flood-plain and traffic studies. The Shandoka lot work session was continued without discussion to June 25.",
    videoUrl: "https://www.youtube.com/watch?v=ies_4xRTogs"
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-05-27",
    title: "Board of County Commissioners — May 27, 2026",
    videoUrl: "https://www.youtube.com/watch?v=CkFxc1DpoNM",
    recap: "The commissioners approved two Ophir septic setback variances, released a 2024 deed-restriction settlement on a Lawson Hill lot, and accepted a state (DOLA) housing-planning grant. All votes were unanimous. An earlier Placerville session that day was a work session with no votes."
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-05-20",
    title: "Board of County Commissioners — May 20, 2026",
    videoUrl: "https://www.youtube.com/watch?v=xDE7B7x2C5U",
    recap: "The commissioners approved the consent agenda and appointed two residents to community boards — Jackie Kenik to the Lone Tree Cemetery board and Marcus Kirkwood to the San Miguel Basin Fairboard. They updated the County's drug-and-alcohol policy and approved a conduit-and-fiber exchange with Clear Networks. Two land-use hearings followed: a lot-line vacation near Sawpit and a multi-year logging and wildfire-mitigation permit on Wilson Mesa. They also adopted the state's septic Regulation 43 Appendix A, keeping variance authority at the county level. All votes were 3-0."
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-05-19",
    title: "Town Council — May 19, 2026",
    videoUrl: "https://www.youtube.com/watch?v=U3QyzfSWDlE",
    recap: "Council adopted the federal Safe Streets and Roads for All regional transportation safety plan and a Vision Zero resolution targeting no traffic deaths by 2040. They authorized acquisition of a town employee unit at Mandota, approved a first reading of new fire-restriction rules, and reappointed Carly Shaw to the Election Commission. They also granted a seasonal rooftop shade structure for the National building on Colorado Avenue, with conditions. All votes were 6-0."
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-05-14",
    title: "Planning Commission — May 14, 2026",
    videoUrl: "https://www.youtube.com/watch?v=R9nnXLvOGCY",
    recap: "The two contested public hearings — the Garlock and Crockett applications on the Mesas — were tabled and withdrawn. The Commission recommended approval of a PUD amendment for a climbing gym in the former Illium tire shop and a code amendment defining 'footprint' and clarifying ADU maximum size. It also recommended adopting an accelerated review process for affordable housing to keep San Miguel eligible for Prop 123 funding. All recommendations go to the BOCC."
  },
  {
    sourceKey: "county",
    sourceLabel: "San Miguel County",
    date: "2026-05-13",
    title: "Board of County Commissioners — May 13, 2026",
    videoUrl: "https://www.youtube.com/watch?v=Q6xLvyjwDgs",
    recap: "A special session focused on presentations and public comment. The board heard from a Rights Mesa resident about an HOA and code-enforcement dispute, reviewed the parks and open space work plan, and discussed housing funding with the Telluride Association of Realtors, including a proposed state vacancy tax that failed at the Legislature. The formal votes were unanimous: green grants, a letter of support for a street-safety grant, and gift cards for spring-cleanup volunteers."
  },
  {
    sourceKey: "telluride",
    sourceLabel: "Town of Telluride",
    date: "2026-04-28",
    title: "Town Council — Apr 28, 2026",
    videoUrl: "https://www.youtube.com/watch?v=vWaP0Ba4GYY",
    recap: "A housing-focused meeting. The Stender HARC appeal was continued at the appellant's request. Council reappointed Peter Sante to the Planning & Zoning Commission and adopted second readings authorizing the sale of two deed-restricted units — the Element 52 unit on South Davis and the Silverjack unit on West Pacific — to lottery winners. Sitting as the Housing Authority, they adopted a policy temporarily suspending certain waitlist rules, with a set sunset date, to reduce vacancies."
  }
];

const TELLURIDE_TIMES_ARTICLES = [
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
    imgHiRes: true
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
    imgHiRes: true
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
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
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
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
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
    imgHiRes: true
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
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    letterAuthor: "Mary Sama-Brown",
    imgHiRes: true
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
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    letterAuthor: "San Miguel County Democrats",
    imgHiRes: true
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
    title: "Crash of an aircraft helping to fight a Colorado wildfire leaves the pilot dead",
    source: "Telluride Times",
    date: "July 13, 2026",
    firstSeen: "2026-07-13",
    newsTopic: "public-safety",
    copy: "A firefighting aircraft went down in Silver Jack Reservoir in Gunnison County on Sunday, killing the pilot, who was the only person on board. The pilot was supporting efforts against the Gold Mountain Fire, now at roughly 57 square miles and 13% contained. It's been a hard stretch for firefighters across the West.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_48ec6963-f0c7-5515-ab29-347e72870180.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/6e/c6e2ca09-8995-540a-b3b6-308b9538ed79/6a54d4692463d.image.jpg",
    imgHiRes: true
  },
  {
    title: "Treatment of local owners and renters must change",
    source: "Telluride Times",
    date: "July 13, 2026",
    firstSeen: "2026-07-13",
    newsTopic: "housing",
    copy: "Deed-restricted homeowners in Telluride are raising serious concerns about the town attorney's office — including claims it gave a Wilkin Court owner false information about a sale, forced subsequent buyers to sign new deed restrictions, and applied updated housing guidelines retroactively to existing owners. The author argues these practices violate property rights, contract law, and the Colorado Constitution. It's a long-running dispute that's apparently affected multiple owners quietly over the years.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/article_6310f37d-7581-438e-b29b-a5bc02d37cb7.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/f8/df8b9a4c-e85d-4703-97a7-a10050e7ea0a/6a4e91a47b78d.image.png",
    imgHiRes: true
  },
  {
    title: "Heroes with a half shell",
    source: "Telluride Times",
    date: "July 13, 2026",
    firstSeen: "2026-07-13",
    newsTopic: "community",
    copy: "Telluride Shucks — the wandering oyster outfit run by chef Bud Thomas and head shucker Richie Stothard — is now booking weddings, fundraisers, and events across the region. Stothard roams with a tool belt stocked with oysters and condiments; Thomas supplies garnishes, some grown on his Ridgway farm. They're eyeing 100+ bookings this year.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/business/article_a2f102a2-0596-4f64-b71b-57dd1095ae65.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/20/220edbd8-241a-450e-a16d-44be7c8de7fb/6a5412aea7315.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride Torpedoes gear up for state championships",
    source: "Telluride Times",
    date: "July 12, 2026",
    firstSeen: "2026-07-12",
    newsTopic: "community",
    copy: "The Telluride Torpedoes swim team, ages 7–17, is heading into the final stretch of its season with eight swimmers already qualified for the Colorado State Championships in Alamosa July 31–Aug. 2. Head coach Kelsea Wright, now in her fourth season, emphasizes personal improvement and team support over standings. The program has previously placed as high as third in state.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_4df1dca4-26a7-46ea-8553-18dbf7eda4a7.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/f2/2f28a551-87e9-4af4-8ccb-d39bd38b0f5b/6a52eb100ffd6.image.jpg",
    imgHiRes: true
  },
  {
    title: "Disaster planning for pets",
    source: "Telluride Times",
    date: "July 12, 2026",
    firstSeen: "2026-07-12",
    newsTopic: "land-use",
    copy: "With wildfire season active in the region, it's worth having a plan for pets before evacuation becomes urgent. That means identifying pet-friendly hotels or boarding options ahead of time, assembling a go-kit, and making sure animals are microchipped and collared with current ID.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_93a9a5dd-e1b8-489f-8f7a-1bf67a617fd5.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/07/d07ad9cd-73ee-403b-981d-2f854d307c3c/6a4e90f1a93ef.image.jpg",
    imgHiRes: true
  },
  {
    title: "'Toggery University'",
    source: "Telluride Times",
    date: "July 12, 2026",
    firstSeen: "2026-07-12",
    newsTopic: "community",
    copy: "Wendy Basham and Todd Tice have co-owned the Telluride Toggery since 2004, carrying on a store that's been part of town since 1972. In January 2025, they bought the building and committed its six upper-floor units to full-time locals — two tenants are Toggery employees whose rent the store helps subsidize. The next generation is already working the floor.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_d7ed4299-05dc-4093-8c48-e86956858f18.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/75/47518859-6ad8-4624-9a18-74b31fb5809b/6a52e927353dd.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘This film could save lives’",
    source: "Telluride Times",
    date: "July 11, 2026",
    firstSeen: "2026-07-11",
    newsTopic: "arts-culture",
    copy: "Filmmaker David Holbrooke is wrapping up \"Peace Officer,\" a feature-length documentary on retiring San Miguel County Sheriff Bill Masters and his 50 years of service — from 1970s Telluride through today. Masters built his career around peacekeeping over enforcement, and the film covers his drug policy writing and immigration stance alongside quieter, human moments. Holbrooke says the project is near the finish line but facing significant funding hurdles.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_4d2919fc-1e7b-4b77-add1-0534af029b70.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Tiny libraries",
    source: "Telluride Times",
    date: "July 11, 2026",
    firstSeen: "2026-07-11",
    newsTopic: "community",
    copy: "Telluride has its own Little Free Library — a handbuilt, community-maintained book exchange where anyone can take or leave a book. The writer stopped by recently and found a group of kids gathered around it. Small thing, but worth knowing it's there.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/article_d8e5537a-4415-4593-a7c6-9f45c4536fa6.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/79/b79c3730-41f1-4811-bc9a-1340561db544/6a4e901bf17fb.image.jpg",
    imgHiRes: true
  },
  {
    title: "County discusses forestry amendments",
    source: "Telluride Times",
    date: "July 11, 2026",
    firstSeen: "2026-07-11",
    newsTopic: "land-use",
    copy: "San Miguel County held a joint work session July 9 to discuss Land Use Code amendments covering forestry practices — the next step after solar and mining updates. New rules would require applicants to submit impact reports and mitigation plans, with an eye toward supporting forest health and wildfire mitigation without creating rigid seasonal cutoff dates that don't match unpredictable conditions.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_61bcf79d-d755-42ef-88db-af961dd0fe7b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/a3/7a3df327-18a2-47a9-b13d-896bdc790910/6a51a6bd8d731.image.jpg",
    imgHiRes: true
  },
  {
    title: "Art for chuckleheads",
    source: "Telluride Times",
    date: "July 10, 2026",
    firstSeen: "2026-07-10",
    newsTopic: "land-use",
    copy: "Ah Haa School for the Arts hosts its fifth annual HAHA event July 17–19, transforming the three-floor Silver Jack Building into immersive art installations by 17 artists selected from a record 60 applicants. Evening events run July 17–18, with a kids' program July 19. Preview events include a photo booth and free slideshow earlier in the week.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_3416ae2c-5801-435d-a86c-7ed6669fcccd.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/1/07/1078ce6a-2d44-4101-b581-c431daad4691/6a51382cde3c7.image.jpg",
    imgHiRes: true
  },
  {
    title: "Breakthroughs in RNA science",
    source: "Telluride Times",
    date: "July 10, 2026",
    firstSeen: "2026-07-10",
    newsTopic: "health",
    copy: "Penn State professor Philip Bevilacqua speaks Tuesday, July 14 at 6:30 p.m. at the Telluride Conference Center on RNA science — from its primordial origins to mRNA vaccines and CRISPR. His research contributed to the 2023 Nobel Prize work. Free and open to the public.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_a76e350e-6ffc-4820-9965-eef63a085ccc.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/e7/4e759722-ca02-45a3-b590-efa6d27d138f/6a4e8f630d2a9.image.jpg",
    imgHiRes: true
  },
  {
    title: "Victor Marx wins the Republican primary for Colorado governor",
    source: "Telluride Times",
    date: "July 10, 2026",
    firstSeen: "2026-07-10",
    newsTopic: "government",
    copy: "Victor Marx, founder of All Things Possible Ministries, won the Republican primary for Colorado governor and will face Democrat Phil Weiser in November. Colorado hasn't elected a Republican governor in over two decades and backed Harris by 10+ points in 2024.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_9603d08c-d7f3-5bbe-bd27-2fce8105c1ee.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/4b/04bd73d7-87b7-57ab-a836-e26fb963a7da/6a502a29f32ed.image.jpg",
    imgHiRes: true
  },
  {
    title: "The GOAT: Hooved friend provides moral support to firefighters in Colorado",
    source: "Telluride Times",
    date: "July 10, 2026",
    firstSeen: "2026-07-10",
    newsTopic: "public-safety",
    copy: "A 4-year-old Nigerian dwarf goat named Goldie showed up at a Colorado wildfire scene and spent the day following firefighters around, trying to sneak bites of lunch and tagging along as crews packed up. The fire was 50% contained, with crews also responding to the Aspen Acres Fire near Denver. Dry conditions, record low snowpack, and erratic winds have kept crews stretched thin across the West.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_db23b40b-2723-5ce9-9089-f912271e5aaa.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/06/d06f37a5-c3e0-5385-922f-5990388f1dd7/6a50570f8af49.image.jpg",
    imgHiRes: true
  },
  {
    title: "Victor Marx wins Republican nomination for governor in Colorado",
    source: "Telluride Times",
    date: "July 10, 2026",
    firstSeen: "2026-07-10",
    newsTopic: "community",
    copy: "The Town of Telluride wrapped up its third annual community survey, which feeds into planning and budget decisions for local projects and services. Dry thunderstorms are in the forecast this week, raising wildfire concerns from lightning and strong outflow winds across the region.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_d7e9087e-dbd4-5aa1-9198-1e837b601d5d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Stark, Dalton win town council seats after final tally",
    source: "Telluride Times",
    date: "July 9, 2026",
    firstSeen: "2026-07-09",
    newsTopic: "government",
    copy: "Stark and Dalton won the two Telluride Town Council special election seats, with Dalton's final margin over Mihlein settling at 24 votes after the July 9 count. Both will be sworn in July 21 and serve through November 2029. The seats came open after Fee resigned in January amid an investigation into the Telluride Ski and Golf purchase offer.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_a4d7e059-764a-4ec0-8f25-0d610940f403.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/71/271f4bfe-a1dc-4660-b1b8-51db12d95fa4/6a501d7de1d9b.image.png",
    imgHiRes: true
  },
  {
    title: "Weed of the Month is the oxeye daisy",
    source: "Telluride Times",
    date: "July 9, 2026",
    firstSeen: "2026-07-09",
    newsTopic: "community",
    copy: "Oxeye daisy — pretty as it looks — is an invasive from Europe and Asia that's taken hold around Telluride, Mountain Village, and Ophir. It crowds out native plants, erodes soil, and one flower can drop 200+ seeds that stay viable for 40 years. San Miguel County is asking residents to remove it where they find it.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_6e06e253-035b-4983-9eb3-5959c2de90a7.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/f3/6f32d9cd-bf80-4278-b273-d6fea58237de/6a4e808998162.image.png",
    imgHiRes: true
  },
  {
    title: "CHALKBOARD Week of July 9-15",
    source: "Telluride Times",
    date: "July 9, 2026",
    firstSeen: "2026-07-09",
    newsTopic: "government",
    copy: "Local birthdays, meeting schedules, and recurring community events for the week of July 9–15 in the Norwood and Nucla-Naturita area. Highlights include the Thursday Farmers Market (2–6 p.m. at Pocket Park), weekly Senior Meals, Sunday Food Pantry distribution, and regular pickleball, AA, and civic board meetings.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_fd76a51e-b077-4f84-a744-d79eb7b787c2.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/b3/ab354c44-1d8b-4ff9-9d46-9dc0b9930db8/6a4e832b19d9b.image.jpg",
    imgHiRes: true
  },
  {
    title: "Just desserts",
    source: "Telluride Times",
    date: "July 9, 2026",
    firstSeen: "2026-07-09",
    newsTopic: "community",
    copy: "An annual homemade dessert contest returns to Norwood School on July 11, with drop-off from 2–5 p.m., judging 5–6 p.m., and public tasting at 6 p.m. Categories run from youth to professional, resident to non-resident. Call (970) 327-4650 for entry details.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_0502877a-72b0-4b56-a009-6d65705d6b69.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/e7/5e7a684c-ec95-4a7a-bda7-3956b5ca1f09/6a4e8a4dd8b85.image.png",
    imgHiRes: true
  },
  {
    title: "Coffee talk",
    source: "Telluride Times",
    date: "July 9, 2026",
    firstSeen: "2026-07-09",
    newsTopic: "public-safety",
    copy: "Coffee has been part of human culture for over a thousand years, from Ethiopian energy balls to Yemeni monastery rituals to today's sprawling menu of roasts, add-ins, and preparations. Recent research increasingly links regular consumption to reduced risk of heart disease, liver disease, and type 2 diabetes, largely due to polyphenols. Downsides — sleep disruption, caffeine dependence, sugar-loaded drinks — are real too.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/article_1c001e43-9a15-4c53-aa99-71a15dfaa0bb.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/62/9625db20-cb96-4e42-98a4-2e709c28de62/6a4e8ef37beb7.image.jpg",
    imgHiRes: true
  },
  {
    title: "Here comes the judge",
    source: "Telluride Times",
    date: "July 9, 2026",
    firstSeen: "2026-07-09",
    newsTopic: "government",
    copy: "Telluride Town Council approved Ronald Carlson as deputy municipal court judge, backing up Judge Daniel Zemke. Carlson brings 30 years on the Frisco bench plus service in several other mountain towns. The part-time role pays $2,000 annually — a figure at least one councilmember thinks may be worth revisiting.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_d27e3f57-76ae-4581-804d-f706b0c0a0e8.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/b0/4b0dd2b6-df33-4b21-9baa-8640361a22ab/6a4efb7392a71.image.jpg",
    imgHiRes: true
  },
  {
    title: "James M Bedford",
    source: "Telluride Times",
    date: "July 9, 2026",
    firstSeen: "2026-07-09",
    newsTopic: "community",
    copy: "James \"BF Deal\" Bedford arrived in Telluride in 1972 and spent decades helping shape it — co-founding KOTO, directing the Film Festival for 36 years, serving on Town Council and as county commissioner, and championing the Lawson Hill affordable housing project. He died recently, survived by his wife Luci Reeve. One of the early builders of this town.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/obituaries/article_25ca1190-2e44-431e-b3e7-f8f571632acd.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/4a/c4a67251-fb36-492c-b7d3-198169e2ca73/6a50021de2b74.image.jpg",
    imgHiRes: true
  },
  {
    title: "Legals and Public Notices for July 9-15, 2026",
    source: "Telluride Times",
    date: "July 9, 2026",
    firstSeen: "2026-07-09",
    newsTopic: "infrastructure",
    copy: "Telluride School District is seeking bids for custodial services at its three school buildings; proposals are due by July 21. Mountain Village is holding a second reading July 16 on proposed lighting regulation changes. The Farmers' Water Development Company is processing a replacement share certificate for a lost certificate #887.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/legals/article_c7bd6279-4a8b-494b-ac96-ee9c16f0bcd1.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Curtis L. Moe",
    source: "Telluride Times",
    date: "July 9, 2026",
    firstSeen: "2026-07-09",
    newsTopic: "community",
    copy: "Curtis Moe spent winters in Telluride, singing with the Chamber Singers and volunteering at KOTO community radio. He came to skiing late in life, working his way from bunny hills to black diamonds. He's remembered for his generosity, his music, and his deep connections to the people around him.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/obituaries/article_7ef6f384-ed3b-4440-b345-d7e53f859792.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/85/3850f2fd-6abd-49cf-a9be-4fd64a50da75/6a4e5ebd82160.image.png",
    imgHiRes: true
  },
  {
    title: "Telluride Science completes $13.5 million capital campaign",
    source: "Telluride Times",
    date: "July 9, 2026",
    firstSeen: "2026-07-09",
    newsTopic: "land-use",
    copy: "Telluride Science wrapped up a $13.5M campaign to restore the historic Rio Grande Southern Depot into the Telluride Innovation Center — finished on time and on budget. The landmark now hosts nearly 200 events since opening in July 2024, serving local nonprofits, community groups, and Telluride Science's expanded programming.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_6bd9c7f2-255c-4dc8-ae1a-79e4a6cef66e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/32/33291a11-bf4a-4492-9090-c3ef0d94c364/6a4ef00f52156.image.jpg",
    imgHiRes: true
  },
  {
    title: "Get down with SoDown",
    source: "Telluride Times",
    date: "July 9, 2026",
    firstSeen: "2026-07-09",
    newsTopic: "arts-culture",
    copy: "Denver producer and live performer SoDown plays the Sheridan Opera House on Thursday, July 9. His set blends live saxophone with bass-heavy electronic production — dubstep, future bass, reggae, hip-hop. Doors at 7:30 p.m., show at 8:30 p.m. Tickets at sheridanoperahouse.com.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_21aa5137-902c-45c9-9e54-00eaec9e9e4c.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/cd/5cdddc1a-22bf-47f0-bb2b-6f840aefc393/6a4eeec43c326.image.jpg",
    imgHiRes: true
  },
  {
    title: "Mountain Village, TMVOA expand wildfire mitigation partnership",
    source: "Telluride Times",
    date: "July 9, 2026",
    firstSeen: "2026-07-09",
    newsTopic: "public-safety",
    copy: "Mountain Village and TMVOA have expanded their wildfire mitigation effort with a new Dead Wood Vacant Lot Incentive Program, matching 50% of dead tree removal costs up to $10,000 per lot. Applications are open through July 24. Two existing programs — defensible space rebates up to $20,000 and cedar shake re-roofing permit fee waivers — remain available.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_2b9a3446-bd58-4622-9621-92304aa4942b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/50/650c9d14-0a78-479a-8f5a-3fbe3946581a/6a4eed144b433.image.jpg",
    imgHiRes: true
  },
  {
    title: "Region 10 awarded AmericCorps Seniors RSVP grant",
    source: "Telluride Times",
    date: "July 9, 2026",
    firstSeen: "2026-07-09",
    newsTopic: "community",
    copy: "Region 10 landed an AmeriCorps Seniors RSVP grant to support around 50 volunteers, age 55+, serving San Miguel and Ouray counties with transportation, nutrition, Medicare counseling, and caregiver respite. The program has run here since 2020 and the new funding also frees up resources for Delta, Montrose, Gunnison, and Hinsdale counties.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_2aa9810c-a0af-4c55-a3c4-d17aee4014d2.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/d9/ed95727d-7012-4b19-ae78-4f103520159f/6a4eedb80331f.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride Arts awards social justice grants to regional artists",
    source: "Telluride Times",
    date: "July 9, 2026",
    firstSeen: "2026-07-09",
    newsTopic: "arts-culture",
    copy: "Telluride Arts has named five regional artists as 2026 Social Justice Artist Grant recipients, funding new visual work exploring identity, history, and community. Recipients include artists from Telluride, Durango, and Ouray. Completed works will tour the Western Slope in a traveling exhibition opening in Telluride this fall.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_1a899ab7-020b-4e6a-95ca-cb571f6989b2.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/5f/55fa4206-d0d2-483b-a3b7-a8ba6c9059c7/6a4eec041114f.image.jpg",
    imgHiRes: true
  },
  {
    title: "Palm presents premiere of 'The Wolff and Other Works'",
    source: "Telluride Times",
    date: "July 9, 2026",
    firstSeen: "2026-07-09",
    newsTopic: "community",
    copy: "AVID Dance performs \"The Wolff and Other Works\" at the Michael D. Palm Theatre on Saturday, July 11 at 7 p.m. The program includes three pieces, two performed with live music. Tickets are general admission at telluridepalm.com or at the door.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_b5125305-5a98-448c-803b-7aa0b63949af.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/07/2071b1bb-4c45-4400-a639-f2480f815dc0/6a4eeb0fbb915.image.png",
    imgHiRes: true
  },
  {
    title: "Aldasoro Ranch turns 100",
    source: "Telluride Times",
    date: "July 8, 2026",
    firstSeen: "2026-07-08",
    newsTopic: "community",
    copy: "The Aldasoro Ranch, founded in 1926 when Joaquin Aldasoro bought 1,400 acres on Deep Creek Mesa, turns 100 this year. The family is marking the milestone with a public celebration Sunday, July 12, 11 a.m.–3 p.m. at 5605 Last Dollar Rd. Free shuttles run every 30 minutes from the county courthouse.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_92132a6f-84c7-4cf5-8194-30f9c965f8ed.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/93/493cf380-3382-4640-9817-6a2042523f39/6a4ea04ecc377.image.png",
    imgHiRes: true
  },
  {
    title: "A 100% rating for Max Silverman",
    source: "Telluride Times",
    date: "July 8, 2026",
    firstSeen: "2026-07-08",
    newsTopic: "community",
    copy: "A letter to the editor from Mike Ritchey of Gunnison praises Max Silverman's film \"Rebuilding,\" calling it a well-crafted, low-key cinematic work with perfectly chosen actors. Ritchey also acknowledges Max's father Rick, noting the film's dedication to his parents.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/article_9ac98b6e-9fed-4cd0-ba76-8809c36437b7.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    letterAuthor: "Mike Ritchey Gunnison",
    imgHiRes: true
  },
  {
    title: "On paving the oval",
    source: "Telluride Times",
    date: "July 8, 2026",
    firstSeen: "2026-07-08",
    newsTopic: "community",
    copy: "Telluride's beloved grass oval may be eyed for pickleball courts, and not everyone's on board. Tom Sokolowski put it plainly with a nod to Joni Mitchell. Some places, once changed, don't come back.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/article_311da385-6055-41dd-8db0-16b525fb375a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    letterAuthor: "Tom “Socko” Sokolowski",
    imgHiRes: true
  },
  {
    title: "Playing with fire",
    source: "Telluride Times",
    date: "July 8, 2026",
    firstSeen: "2026-07-08",
    newsTopic: "public-safety",
    copy: "A Telluride resident is asking town officials to clarify the evacuation plan when festivals bring thousands of visitors into town. It's a fair question — the canyon geography doesn't change when the crowds show up.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/article_89a63ad4-966c-4c30-8191-1ed55c722fb8.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    letterAuthor: "Eliot Brown",
    imgHiRes: true
  },
  {
    title: "Support Allen Highfield for TMVOA board",
    source: "Telluride Times",
    date: "July 8, 2026",
    firstSeen: "2026-07-08",
    newsTopic: "government",
    copy: "Allen Highfield is running for the Class B seat on the TMVOA board, backed by a colleague who cites his 30+ years in luxury hospitality with Ritz-Carlton, Montage, and Auberge. Voting is electronic via ElectionBuddy and closes July 22 at 11:59 p.m. MT.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/article_c3efb107-36da-478b-8799-ab46a9dfa4bd.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Coffee Camp dispute sparks petition",
    source: "Telluride Times",
    date: "July 8, 2026",
    firstSeen: "2026-07-08",
    newsTopic: "housing",
    copy: "Neighbors near Coffee Camp in Norwood's mixed-use business district raised concerns at the June 10 Town Board meeting over noise, wildlife, and highway parking tied to the food truck operation. Town staff noted no evidence linking the business to a broader skunk problem in town, and supporters pushed back, comparing Coffee Camp's cooking to a nearby market. Norwood's land use code doesn't currently address food trucks specifically.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_edbdf11b-8bad-4aac-ab0d-bb6b8de98f1d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/39/53975440-28ca-4f51-ad6d-34c7b1faf5be/6a4e7fc74523f.image.jpg",
    imgHiRes: true
  },
  {
    title: "Town council discusses TEMP updates",
    source: "Telluride Times",
    date: "July 7, 2026",
    firstSeen: "2026-07-07",
    newsTopic: "land-use",
    copy: "Telluride's Town Council held a work session on updates to the TEMP program, which requires buildings with high-energy exterior features like snowmelt and heated garages to offset emissions via renewables or mitigation fees. Building energy use accounts for 58% of Telluride's greenhouse gas emissions. No final decisions were made, but council discussed expanding the program's scope and potential safety exemptions.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_968f5fc7-c53e-4287-bb67-08c676477458.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/d0/cd0125f3-c591-4242-8636-f9d0809bfe4b/6a4d7765a2c84.image.jpg",
    imgHiRes: true
  },
  {
    title: "Wildfires significantly less common in roadless areas",
    source: "Telluride Times",
    date: "July 7, 2026",
    firstSeen: "2026-07-07",
    newsTopic: "public-safety",
    copy: "Roadless areas see fire ignition rates four times lower than lands near Forest Service roads, with 90% of fires on FS land linked to human causes. Only 1% of significant wildfires since 2010 occurred in roadless areas. The data comes from a 32-year, 200,000-fire study across all contiguous U.S. Forest Service regions.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_6b1401c9-73a1-4186-b1ed-a172c2733235.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/70/e70d41b2-f117-416f-b2c4-e68d35130f78/6a4c80454e418.image.jpg",
    imgHiRes: true
  },
  {
    title: "Disaster planning for pets",
    source: "Telluride Times",
    date: "July 7, 2026",
    firstSeen: "2026-07-07",
    newsTopic: "land-use",
    copy: "If you're away when evacuation hits, have a neighbor with a key ready to move your pets. Keep emergency kits packed with food, water, meds, and ID gear — one for sheltering, one lightweight for go-time. Make sure every pet is microchipped and tagged, with current contact info.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_9ffbcd52-0209-48cc-9b86-eadeb74b7324.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/db/4dbad19a-28ec-49b3-ba8e-23195194a7c4/6a4c8232f3f42.image.jpg",
    imgHiRes: true
  },
  {
    title: "Dry thunderstorms could complicate firefighting efforts",
    source: "Telluride Times",
    date: "July 6, 2026",
    firstSeen: "2026-07-06",
    newsTopic: "public-safety",
    copy: "The Gold Mountain Fire near Ouray has grown to nearly 30,000 acres with just 3% containment, while the Ferris Fire near Dolores has reached 50,000 acres at 21% contained. San Miguel County is under an air quality health advisory through at least Tuesday due to smoke. No active fires are currently burning in San Miguel County, which is under Stage 2 fire restrictions.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_8e9913c5-3691-468d-a3ae-eaa7ca037c48.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/47/a47d7dfb-9699-46ee-8b6e-87a921969428/6a4c0938939c5.image.jpg",
    imgHiRes: true
  },
  {
    title: "Memorial service to honor firefighters killed on Colorado-Utah border",
    source: "Telluride Times",
    date: "July 5, 2026",
    firstSeen: "2026-07-05",
    newsTopic: "public-safety",
    copy: "Three wildland firefighters — Emily Barker, Nick Hutcherson, and Sydney Watson — were killed June 27 when fast-moving flames overtook their Helitack crew in Mesa County, near the Colorado-Utah border. Two others were injured. A memorial service is set for Sunday at 11 a.m. at Las Colonias Park Amphitheater in Grand Junction.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_55ad13b6-d887-5039-b115-7b1f56da9f36.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/3a/03aac3ca-135f-5082-a952-3b562ebab08f/6a4a56a49fc94.image.jpg",
    imgHiRes: true
  },
  {
    title: "‘It feels so good’ to gather",
    source: "Telluride Times",
    date: "July 5, 2026",
    firstSeen: "2026-07-05",
    newsTopic: "land-use",
    copy: "Telluride's People's March gathers monthly at the San Miguel County Courthouse — two speakers, a walk to the park and back, then an open mic. Drew from as far as Montrose, it's been running about a year and a half. Next up: Saturday, July 11 at noon, with Bryan Miller speaking.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_bb8b75f7-4df3-48e4-a86d-35dee7aa8ac6.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/94/994ab3e1-47cf-416c-baf1-4ff75ed5358b/6a48ca441116d.image.jpg",
    imgHiRes: true
  },
  {
    title: "Glimmers of hope",
    source: "Telluride Times",
    date: "July 5, 2026",
    firstSeen: "2026-07-05",
    newsTopic: "health",
    copy: "Terry Tempest Williams visits Wilkinson Public Library as part of the One Book, One Canyon program to discuss her new book *The Glorians*, about finding the sacred in everyday nature. Copies are available at Between the Covers at 10% off; books for signing must be dropped off by 6 p.m. July 14.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_7fad6b4b-31c5-4102-9c44-46f4d46e71e7.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/bf/ebf96caa-4583-46cc-9478-0dc97ac82bae/6a48c7c991b33.image.jpg",
    imgHiRes: true
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
    title: "San Miguel County is in Stage 2 fire restrictions for privately-owned, unincorporated land",
    source: "San Miguel County",
    date: "July 16, 2026",
    newsTopic: "housing",
    copy: "Currently, there are varying levels of restrictions across the region, so please check the appropriate websites for the areas you plan to travel to and recreate in.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=533",
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
    title: "Provide Input on Draft Marketing Plan by 4pm on Monday, July 20",
    source: "Town of Ridgway",
    date: "July 13, 2026",
    firstSeen: "2026-07-13",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/R2-Marketing-Plan-and-Memo-for-feedback-July-2026.pdf",
    img: ""
  },
  {
    title: "Town Manager's Report",
    source: "Town of Ridgway",
    date: "July 7, 2026",
    firstSeen: "2026-07-07",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Town-Manager%27s-Report---July-7%2C-2026.pdf",
    img: ""
  },
  {
    title: "Ridgway Planning Commission Meeting Agenda",
    source: "Town of Ridgway",
    date: "July 15, 2026",
    firstSeen: "2026-07-10",
    newsTopic: "land-use",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/Ridgway-Planning-Commission-Meeting-Packet---July-15%2C-2026.pdf",
    img: ""
  },
  {
    title: "Notice of Public Hearing - Application for Resubdivision - Hyde Subdivision Lots 1, 2, 3, 4 of Block 14 (847 and 845 Hyde Street)",
    source: "Town of Ridgway",
    date: "July 15, 2026",
    firstSeen: "2026-07-07",
    newsTopic: "community",
    copy: "Press release from the Town of Ridgway. Click to view the full PDF.",
    claudeSummary: false,
    href: "https://townofridgway.colorado.gov/sites/g/files/lrnvjt1246/files/documents/2026.07.15_public-hearing-notice-PC.pdf",
    img: ""
  }
];

const KOTO_NEWSCASTS = [
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
  },
  {
    title: "Newscast 7-10-26",
    source: "KOTO Community Radio",
    date: "July 11, 2026",
    newsTopic: "land-use",
    copy: "On this week's Regional Roundup, we'll hear about the extreme fire danger facing communities across the Rocky Mountain West. Then, we go to Aspen, where an all-American form of dance called Bandaloop turned the side of a building into a stage during the Fourth of July weekend. After that, we'll visit Boulder where a gun safety initiative is giving ",
    href: "https://koto.org/news/newscast-7-10-26/"
  },
  {
    title: "Newscast 7-9-26",
    source: "KOTO Community Radio",
    date: "July 10, 2026",
    newsTopic: "public-safety",
    copy: "A Ferris Fire Update; West End Roundup with the San Miguel Basin Forum; Cat Movie Fisher with Risho Unda",
    href: "https://koto.org/news/newscast-7-9-26/"
  },
  {
    title: "Newscast 7-8-26",
    source: "KOTO Community Radio",
    date: "July 9, 2026",
    newsTopic: "public-safety",
    copy: "Gold Mountain Fire Evacuees Return Home; Mountain Village Looks for New Town Manager; AVID Dance Brings a Universal Language",
    href: "https://koto.org/news/newscast-7-8-26/"
  },
  {
    title: "Newscast 7-6-26",
    source: "KOTO Community Radio",
    date: "July 7, 2026",
    newsTopic: "public-safety",
    copy: "A Gold Mountain Fire Update; Smoke Fills the San Juans",
    href: "https://koto.org/news/newscast-7-6-26/"
  }
];

const KOTO_FEATURED_STORIES = [
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
    title: "Wright, Dexter share wisdom on birds, fire",
    source: "San Miguel Basin Forum",
    sourceKey: "smb",
    date: "July 15, 2026",
    firstSeen: "2026-07-15",
    dateSource: "article",
    newsTopic: "public-safety",
    copy: "Many know or remember Brenda Wright and Coen Dexter, former Nucla residents, who for years maintained an impressive food-producing garden off 5th Avenue. The couple first came to the West End …",
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
    newsTopic: "community",
    copy: "The San Miguel Basin Fair’s annual dessert contest runs on procedure. There are judges, who remain secret until the event is over, who are given specific categories to judge. Those categories …",
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
    copy: "On June 27, Elle Borsari was close to completing her shift at Action Horseback Adventures. It had been a regular day, busy like most at the property, but after five years of working there she was …",
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
    newsTopic: "community",
    copy: "Katie Alexander, superintendent of the decades-old dessert contest, is getting ready for the big day July 11, a Saturday, kicking off the San Miguel Basin Fair. What used to be a pie contest for the …",
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
    copy: "Every Friday morning, from May 22 to Oct. 16, Ridgway’s Hartwell Park is filled with vendors and buyers attending the local farmers market. As the market celebrates its 26th anniversary, it …",
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
    title: "Aldasoro Ranch turns 100",
    source: "Telluride Times",
    sourceKey: "ttimes",
    date: "July 8, 2026",
    summary: "The Aldasoro Ranch, founded in 1926 when Joaquin Aldasoro bought 1,400 acres on Deep Creek Mesa, turns 100 this year. The family is marking the milestone with a public celebration Sunday, July 12, 11 a.m.–3 p.m. at 5605 Last Dollar Rd. Free shuttles run every 30 minutes from the county courthouse.",
    href: "https://www.telluridenews.com/news/article_92132a6f-84c7-4cf5-8194-30f9c965f8ed.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/93/493cf380-3382-4640-9817-6a2042523f39/6a4ea04ecc377.image.png",
    category: "Community",
    newsTopic: "community",
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
    title: "When the Town Judges Its Own Projects",
    date: "Jun 30, 2026",
    href: "https://mailchi.mp/42e61aa77a19/when-the-town-judges-its-own-projects",
    image: "https://mcusercontent.com/5d9192289b9af78822f2f69bf/images/234a1ccb-fc9c-7aab-8d5f-dab36d775b79.png",
    excerpt: "96 When the Town Judges Its Own Projects Apparently, our little newsletter has made a ripple. Possibly even a wave! ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ",
    category: "Newsletter",
    source: "mailchimp"
  },
  {
    title: "The Colorado Supreme Court's \"Butcher Creek\" Decision",
    date: "Jun 17, 2026",
    href: "https://mailchi.mp/99279f8aa0a7/participate-in-the-bocc-meeting-on-december-20251559",
    image: "https://firebasestorage.googleapis.com/v0/b/telluride-gov-hub.firebasestorage.app/o/newsletter-images%2Fbutcher-creek-pud-lot-a.jpg?alt=media&token=48edbaf5-841d-42c8-abea-6beafedc3381",
    excerpt: "The Colorado Supreme Court's ruling in Kavanaugh v. Telluride Locals Coalition holds that a PUD agreement functions like a contract -- it can't be amended without following its own terms and the owner consent they require. We break down what the \"Butcher Creek\" decision means and how it could shape the pending fights over Backman Village/Carhenge and Diamond Ridge/Aldasoro.",
    category: "Newsletter",
    readTime: "4 min",
    source: "mailchimp"
  },
  {
    title: "Come to the Livable Telluride Kickoff Event",
    date: "Jun 9, 2026",
    href: "https://mailchi.mp/862595911df1/come-to-the-livable-telluride-kickoff-event",
    image: "",
    excerpt: "Livable Telluride Kickoff Event Join Us for the Livable Telluride Kickoff Event Please join us tomorrow (Wednesday, June 10) from 5&ndash;7 PM at the Elks Club for the launch of Livable Telluride , a new community resource designed to make local information easier to find, understand, and use, and to bring people together. We'll have appetizers and a cash bar available. Livable Telluride is built ",
    category: "Newsletter",
    source: "mailchimp"
  },
  {
    title: "Welcome to the New Livable Telluride",
    date: "Jun 2, 2026",
    href: "https://mailchi.mp/4f766c920f0e/participate-in-the-bocc-meeting-on-december-20251398",
    image: "https://mcusercontent.com/5d9192289b9af78822f2f69bf/images/234a1ccb-fc9c-7aab-8d5f-dab36d775b79.png",
    excerpt: "96 Welcome to the New Livable Telluride Measure 300 process revealed that even in a small, highly engaged community, it is remarkably difficult for residents to keep track of issues ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ‌ ͏ ",
    category: "Newsletter",
    source: "mailchimp"
  },
  {
    title: "From \"Let the People Decide\" to \"Livable Telluride\"",
    url: "https://livabletelluride.org/Blog%20Posts/from-let-the-people-decide-to-livable-telluride",
    date: "Feb 23, 2026",
    readTime: "3 min",
    image: "/images/blog/let-the-people-decide.jpg",
    summary: "The story behind our rebrand — why the mission evolved from a single ballot question to a broader effort to keep Telluride livable for the people who actually live here.",
    category: "Town of Telluride"
  },
  {
    title: "As the Society Turns (the Survey Episode)",
    url: "https://livabletelluride.org/Blog%20Posts/societyturnpud",
    date: "Oct 14, 2025",
    readTime: "2 min",
    image: "/images/blog/society-turn-survey.png",
    summary: "106 residents weighed in on Society Turn — 83% knew about the hospital, but nearly 80% had no idea how much else is planned for that site.",
    category: "County Issues"
  },
  {
    title: "As the Society Turns (the PUD Episode)",
    url: "https://livabletelluride.org/Blog%20Posts/as-the-society-turns-the-pud-episode",
    date: "Oct 11, 2025",
    readTime: "5 min",
    image: "/images/blog/society-turn-pud.png",
    summary: "A deep dive into the Society Turn PUD that even its loudest critics admit is bigger than anyone realized — and why that matters for the valley's future.",
    category: "County Issues"
  },
  {
    title: "Saturday Shot of Finance: If VooDoo Were a Private Development, Would It Already Be Bankrupt?",
    url: "https://livabletelluride.org/Blog%20Posts/saturday-shot-of-finance-if-voodoo-were-a-private-development-would-it-already-be-bankrupt",
    date: "Oct 11, 2025",
    readTime: "4 min",
    image: "/images/blog/voodoo-finance.png",
    summary: "A family stuck in \"affordable housing\" with soaring rent asks the question no one at Town Hall wants to answer — do these numbers actually work?",
    category: "Town of Telluride"
  },
  {
    title: "Why is Rent So Damn High In Telluride!",
    url: "https://livabletelluride.org/Blog%20Posts/why-is-rent-so-damn-high-in-telluride",
    date: "Sep 15, 2025",
    readTime: "5 min",
    image: "/images/blog/rent-so-damn-high.png",
    summary: "Sweet Rants lit up with locals doing the math on new housing projects — and the per-unit costs will make your jaw drop.",
    category: "Town of Telluride"
  },
  {
    title: "From $36 Million to $103 Million: How Telluride Became Richer Than a Lottery Winner",
    url: "https://livabletelluride.org/Blog%20Posts/from-36-million-to-103-million-how-telluride-became-richer-than-a-lottery-winner",
    date: "Sep 13, 2025",
    readTime: "3 min",
    image: "/images/blog/36-to-103-million.png",
    summary: "A 930% budget increase in ten years — this breakdown of where all that money went (and keeps going) is essential reading for any Telluride taxpayer.",
    category: "Town of Telluride"
  },
  {
    title: "Canyonlands Development: A Closer Look at Telluride's Financing",
    url: "https://livabletelluride.org/Blog%20Posts/canyonlands-development-a-closer-look-at-telluride-s-financing",
    date: "Jul 28, 2025",
    readTime: "4 min",
    image: "/images/blog/canyonlands.png",
    summary: "The $26.5M Canyonlands project by Clark's uses a creative 30-year lease structure that every resident should understand before the bonds come due.",
    category: "Town of Telluride"
  },
  {
    title: "Empowering Telluride: The Future of Lot L Development",
    url: "https://livabletelluride.org/Blog%20Posts/empowering-telluride-the-future-of-lot-l-development",
    date: "Jul 27, 2025",
    readTime: "2 min",
    image: "/images/blog/lot-l.png",
    summary: "A massive parking garage on Lot L could permanently change downtown Telluride's character — here's why community input matters now, not later.",
    category: "Town of Telluride"
  },
  {
    title: "The Sunnyside Project",
    url: "https://livabletelluride.org/Blog%20Posts/the-sunnyside-project",
    date: "Jul 27, 2025",
    readTime: "2 min",
    image: "/images/blog/sunnyside.png",
    summary: "Completed before costs spiraled, Sunnyside shows how pre-pandemic housing financing worked — and why today's projects can't replicate it.",
    category: "Town of Telluride"
  },
  {
    title: "The VooDoo Project",
    url: "https://livabletelluride.org/Blog%20Posts/the-voodoo-project",
    date: "Jul 27, 2025",
    readTime: "2 min",
    image: "/images/blog/voodoo-project.png",
    summary: "The VooDoo's $27.4M price tag for 27 units launched at exactly the wrong time — a cautionary tale of what happens when interest rates hit 7%.",
    category: "Town of Telluride"
  },
  {
    title: "The Chair 7 Development Controversy",
    url: "https://livabletelluride.org/Blog%20Posts/the-chair-7-development-controversy",
    date: "Jul 25, 2025",
    readTime: "3 min",
    image: "/images/blog/chair-7.png",
    summary: "A hotel and commercial development on open space near the ski area is the most contentious proposal in years — here's what the PUD amendment actually allows.",
    category: "Town of Telluride"
  },
  {
    title: "The Gondola Station",
    url: "https://livabletelluride.org/Blog%20Posts/the-gondola-station",
    date: "Jul 2, 2025",
    readTime: "1 min",
    image: "/images/blog/gondola-station.png",
    summary: "Three design concepts for a new gondola station could reshape downtown — but without a charter amendment, voters won't get a say.",
    category: "Town of Telluride"
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
    title: "When the Cure is a Virus: Reprogramming a Killer to Fight Cancer",
    date: "2026-07-21",
    time: "6:30 PM – 7:30 PM",
    location: "Telluride Conference Center, Telluride",
    description: "Can a virus be turned into a cure? Clodagh O'Shea, of the Salk Institute will present \"When the Cure Is a Virus: Reprogramming a Killer to Fight Cancer.\" O'Shea, who holds the Wicklow Chair at Salk and has been named an HHMI Faculty Scholar and an Allen Distinguished Investigator, will share how her lab reengineers viruses to seek out and destroy cancer cells while leaving healthy tissue unharmed—research she is now advancing toward patients as scientific founder of the biotech company IconOVir Bio. A conversation with Emmy- and Peabody Award-winning journalists Judy Muller and George Lewis and an audience Q&A will follow. Town Talks will be held on Tuesdays at the Telluride Conference Center in Mountain Village June 9 to August 11 (please note the July 28 talk will be at the Sheridan Opera House). Doors open at 6 pm and the program starts at 6:30 pm. …",
    link: "https://telluridescience.org/event/clodagh-oshea/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/05/Screenshot-2026-07-14-at-3.25.14-PM-scaled.png",
    sourceLabel: "Telluride Science"
  },
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
    title: "The Tiny Machines That Keep Us Alive: Watching Life at Work, One Molecule at a Time",
    date: "2026-08-04",
    time: "6:30 PM – 7:30 PM",
    location: "Telluride Conference Center, Telluride",
    description: "This town talk will be presented by Taekjip (TJ) Ha, Harvard Medical School, Boston Children's Hospital, Howard Hughes Medical School. \r\nDid you know that proteins are nano-scale machines that help us think, dance and keep the threat of cancer at bay? Did you know that biology is a new research frontier for physical scientists? In this talk, Professor Ha of Harvard University will discuss how biophysicists are using light-based tools to poke and examine Nature’s nano-machines, one molecule at a time, uncovering the amazing acrobatic abilities that are essential for all forms of life.\r\nTown Talks will be held on Tuesdays at the Telluride Conference Center in Mountain Village June 9 to August 11. Doors open at 6 pm and the program starts at 6:30 pm. Free and open to the public.\r\nThanks to our title sponsor Alpine Bank and Telluride Mountain Village Owner’s Association.",
    link: "https://telluridescience.org/event/single-molecule-views-of-natures-nanomachines/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/04/TT_logo_1048x802_A.png",
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
    time: "5:30 PM – 6:30 PM",
    location: "Telluride Innovation Center, Telluride",
    description: "Join Telluride Science and Telluride Chamber Music for a free community concert on the scenic patio at the Innovation Center.  All are welcome—come soak in the beauty of live chamber music in an inspiring setting.",
    link: "https://telluridescience.org/event/community-concert-august/",
    imageUrl: "https://telluridescience.org/wp-content/uploads/2026/05/ChatGPT-Image-May-27-2026-03_58_05-PM.png",
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
    time: "5:30 PM – 6:30 PM",
    location: "Telluride Innovation Center, Telluride",
    description: "Join Telluride Science and Telluride Chamber Music for a free community concert on the scenic patio at the Innovation Center.  All are welcome—come soak in the beauty of live chamber music in an inspiring setting.",
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
    title: "Zumba with Gisela",
    link: "https://koto.org/event/zumba-with-gisela/2026-07-18/",
    description: "Ditch the workout and join the party! Zumba® is a high-energy dance fitness class that mixes low-intensity and high-intensity moves for an interval-style, calorie-burning workout. Driven by Latin and international rhythms like salsa, merengue, reggaeton, and cumbia, you will tone your body and boost your endurance without even realizing how hard you are working. It is exercise in disguise! No dance experience is required—just bring your energy, a water bottle, and a smile. This class is free and open to the public, but donations for the instructor are always welcome. ¡Olvida el entrenamiento y únete a la fiesta! Zumba® es una clase de fitness de baile de alta energía que mezcla movimientos de baja y alta intensidad para un entrenamiento de estilo de intervalos que quema calorías. …",
    pubDate: "2026-07-18T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Movies Under the Stars",
    link: "https://koto.org/event/movies-under-the-stars/2026-07-18/",
    description: "Telluride Mountain Village Owner's Association (TMVOA) presents Movies Under the Stars – FREE family-friendly outdoor movies screenings – every Saturday this summer at Conference Center Plaza! New this summer: Family Happy Hour from 6:30-8:30 p.m.! Enjoy lawn games, sidewalk chalk, a bounce house, face painting and more. Film schedule below: June 13 – Alice in Wonderland (1951) June 20 – Zootopia 2 July 4 – The Sandlot July 11 – Elio July 18 – How to Train Your Dragon (2025) July 25 – GOAT August 1 – Wicked for Good August 8 – Hoppers August 15 – Superman (2025)",
    pubDate: "2026-07-19T00:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Conference Center Plaza Mountain Village",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/MuS_Pstr11x17_2026-1-pdf-1.jpg"
  },
  {
    title: "HAHA",
    link: "https://koto.org/event/haha/2026-07-18/",
    description: "HAHA is a community art event unlike you’ve ever experienced! HAHA is the immersive art installation event of the summer! Local, national and international artists take over the Ah Haa School for the Arts creating experiential realms and creative chaos! Adults can join in on Friday and Saturday nights, and Sunday’s Little Giggles is for kids and families. Get your tickets to create, play and explore! Participation supports Ah Haa’s ability to provide high-quality, affordable art experiences and tuition assistance for people of all ages, year-round. HAHA attendees can look forward to an out-of-this-world experience with completely hand drawn Trompe-l'œil masterpiece, kinetic sound sculptures, giant folded friends, a secret desert, pinata playplace, whimsical alien worlds, a hideaway for all, playful puzzles revealing color and sound, a Human Intelligence Powered FAUXTO Booth, a curated gift shop, creative bars, generative art making everywhere and so much more to discover!",
    pubDate: "2026-07-19T01:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Ah Haa School for the Arts, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/07/haha-banner-small-26.webp"
  },
  {
    title: "Shakespeare in the Park: \"Henry V\"",
    link: "https://koto.org/event/shakespeare-in-the-park-henry-v/2026-07-18/",
    description: "Join us ON the Town Park Stage for one of our town’s most beloved traditions: Telluride Theatre's 36th Annual SHAKESPEARE IN THE PARK! Action, humor & romance abound in Shakespeare's iconic war drama. HENRY V, the young and newly crowned king, is impatient to assert control over the people of England. Having received a humiliating gift from overseas, his bruised ego leads him to double down on a military invasion abroad in a bid to expand his green and pleasant land. But at what devastating cost? Witness Henry’s bombastic pursuit of power&#8230; \"The game's afoot!\" Youth & \"Pay-What-You-Can\" discounts available!",
    pubDate: "2026-07-19T02:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Town Park",
    imageUrl: "https://koto.org/wp-content/uploads/2026/07/shakes-henry-v.webp"
  },
  {
    title: "Pickleball Open Play",
    link: "https://koto.org/event/pickleball-open-play/2026-07-19/",
    description: "Weekly Round Robins Eligibility: Must be rated 2.5+. Requirements: Players should know the rules, scoring, and basic strategy of tennis. Format: Fun, competitive matches with rotating partners each session. Minimum Players: A minimum of 4 players is required for the class to run.",
    pubDate: "2026-07-19T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "HAHA Little Giggles",
    link: "https://koto.org/event/haha-little-giggles/",
    description: "Sunday morning provides access to the entire HAHA Experience for families, children and teens ages 3-17, who must be accompanied by a Little Giggles ticketed adult. You must purchase Little Giggles tickets for all children (ages 3-17, if under 3 kids do not need tickers) AND adults attending on Sunday. This event is sponsored by Alpine Bank. HAHA is the immersive art installation event of the summer! Local, national and international artists take over the Ah Haa School for the Arts creating experiential realms and creative chaos! Adults can join in on Friday and Saturday nights, and Sunday’s Little Giggles is for kids and families. Get your tickets to create, play and explore! Participation supports Ah Haa’s ability to provide high-quality, affordable art experiences and tuition assistance for people of all ages, year-round. …",
    pubDate: "2026-07-19T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Ah Haa School for the Arts, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/07/HAHA-July-2023_Tellluride-CO_Credit_Alex-Ferrari-0001673.jpg"
  },
  {
    title: "Gentle Yoga with Kristen Milord",
    link: "https://koto.org/event/gentle-yoga-with-kristen-milord-2/2026-07-19/",
    description: "Breathe, stretch, and reset with gentle yoga taught by Kristen Milord, Sundays from 11:00 am to 12:00 pm. This free, accessible class is open to all levels—no prior experience needed. Feel free to bring your own mat, or the library also has mats, bolsters, blocks and blankets available to use. This class if free, but donations to support the instructor are welcome.",
    pubDate: "2026-07-19T17:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/gentle-yoga-kristen.png"
  },
  {
    title: "Drop In Tech Time with Oliver",
    link: "https://koto.org/event/drop-in-tech-time-with-oliver-2/2026-07-19/",
    description: "Drop by the 2nd floor desk for Tech Time with Oliver every Sunday from 1-3pm. Bring your questions about technology (phones, tablets, laptops, email, etc.) or learn about special collections the library offers, such as the Kindles, iPads, and laptops our patrons can check out as well as the library apps you can download to your devices to access free ebooks, audiobooks, movies, music, magazines and more!",
    pubDate: "2026-07-19T19:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Tea and Tarot",
    link: "https://koto.org/event/tea-and-tarot/2026-07-19/",
    description: "Tea and Tarot Sessions with Jade Rose and others from Sanctuary Collective in the Telluride Room. Seating is limited; please sign up at telluridelibrary.org in advance.",
    pubDate: "2026-07-19T20:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/tea-1.jpg"
  },
  {
    title: "Shakespeare in the Park: \"Henry V\"",
    link: "https://koto.org/event/shakespeare-in-the-park-henry-v/2026-07-19/",
    description: "Join us ON the Town Park Stage for one of our town’s most beloved traditions: Telluride Theatre's 36th Annual SHAKESPEARE IN THE PARK! Action, humor & romance abound in Shakespeare's iconic war drama. HENRY V, the young and newly crowned king, is impatient to assert control over the people of England. Having received a humiliating gift from overseas, his bruised ego leads him to double down on a military invasion abroad in a bid to expand his green and pleasant land. But at what devastating cost? Witness Henry’s bombastic pursuit of power&#8230; \"The game's afoot!\" Youth & \"Pay-What-You-Can\" discounts available!",
    pubDate: "2026-07-20T02:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Town Park",
    imageUrl: "https://koto.org/wp-content/uploads/2026/07/shakes-henry-v.webp"
  },
  {
    title: "Book Buzz w/The Pour Over Pedaler",
    link: "https://koto.org/event/book-buzz-w-the-pour-over-pedaler-2/",
    description: "Get the scoop on the hottest new titles at the library during Book Buzz! Discover upcoming releases, hidden gems, and staff favorites while enjoying a complimentary handcrafted coffee from Luke of The Pour Over Pedaler. Come sip, socialize, and leave with your next great read!",
    pubDate: "2026-07-20T15:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-07-20/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-07-20T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Authors Uncovered: Fierce Country by Heather Hansman",
    link: "https://koto.org/event/authors-uncovered-fierce-country-by-heather-hansman/",
    description: "Join us for an evening of conversation with Heather Hansman about her new book, FIERCE COUNTRY: The Untold Story of Three Women Who Ignited America’s Love for the Wild. The inspiring, untold story of three incredible women who spearheaded recreation, conservation and resilience in America’s most beloved landscapes, for readers of Pam Houston and David Grann In the spring of 1945, when just a handful of people had been through the Grand Canyon in boats, Georgie White jumped into the river in just a lifejacket and swam through the rapids. She spent the rest of her life bringing people through the canyon, kickstarting river running and the recreation industry.",
    pubDate: "2026-07-20T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Shakespeare in the Park: \"Henry V\"",
    link: "https://koto.org/event/shakespeare-in-the-park-henry-v/2026-07-20/",
    description: "Join us ON the Town Park Stage for one of our town’s most beloved traditions: Telluride Theatre's 36th Annual SHAKESPEARE IN THE PARK! Action, humor & romance abound in Shakespeare's iconic war drama. HENRY V, the young and newly crowned king, is impatient to assert control over the people of England. Having received a humiliating gift from overseas, his bruised ego leads him to double down on a military invasion abroad in a bid to expand his green and pleasant land. But at what devastating cost? Witness Henry’s bombastic pursuit of power&#8230; \"The game's afoot!\" Youth & \"Pay-What-You-Can\" discounts available!",
    pubDate: "2026-07-21T02:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Town Park",
    imageUrl: "https://koto.org/wp-content/uploads/2026/07/shakes-henry-v.webp"
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-07-21/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-07-21T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Kombucha and Kefir w/ Kayla",
    link: "https://koto.org/event/kombucha-and-kefir-w-kayla/",
    description: "Kombucha & Kefir: Fermentation Made Simple Curious about making your own probiotic drinks at home? Join fermentation educator and founder of Taste Your Roots, Kayla Wexelberg, for a hands-on introduction to the art and science of kombucha and kefir. In this interactive workshop, you'll learn how these traditional fermented beverages are made, explore their unique flavors and potential health benefits, and gain the confidence to start brewing your own at home. Kayla will guide participants through the fermentation process, share tips for successful brewing, and answer questions along the way. Whether you're a longtime fermentation enthusiast or completely new to the world of cultured foods, you'll leave with practical knowledge, inspiration, and a deeper appreciation for the tiny microbes that help transform simple ingredients into delicious, living foods. Space is limited. Registration is required.",
    pubDate: "2026-07-21T18:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Stories & Poems Telluride",
    link: "https://koto.org/event/stories-poems-telluride/",
    description: "Durango Poet Laureate Esther Belin will be the featured presenter at the Talking Gourds’ Stories & Poems series at the Wilkinson Public Library on Tuesday July 21 at 5:15 pm. “Esther just directed the successful Four Corners Poetry Festival at the Durango Public Library,” explained Talking Gourds Director Art Goodtimes. “We are delighted she’s willing to make the drive up into the mountains to share her Indigenous poetry with us.”",
    pubDate: "2026-07-21T23:15:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Forest Health Talk w/Jason Sibold",
    link: "https://koto.org/event/forest-health-talk-w-jason-sibold/",
    description: "Dr. Jason Sibold of CSU will give a talk about the current health of the forests in the Telluride region and share data from his multi-year study of the trees in Bear Creek. More info about Dr. Sibold and his study here: https://www.libarts.colostate.edu/people/sibold/ https://www.instagram.com/p/DIUD7GZSrVL/ And join us the next day for a walk and talk in Bear Creek! Sign up is required. Please go to the listing here: https://telluridelibrary.libcal.com/event/17105410 Dr. Sibold will talk about his multi-year study of Bear Creek trees and you may get to do a little citizen science along the way! Meet at the library and wear sturdy shoes.",
    pubDate: "2026-07-21T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Shakespeare in the Park: \"Henry V\"",
    link: "https://koto.org/event/shakespeare-in-the-park-henry-v/2026-07-21/",
    description: "Join us ON the Town Park Stage for one of our town’s most beloved traditions: Telluride Theatre's 36th Annual SHAKESPEARE IN THE PARK! Action, humor & romance abound in Shakespeare's iconic war drama. HENRY V, the young and newly crowned king, is impatient to assert control over the people of England. Having received a humiliating gift from overseas, his bruised ego leads him to double down on a military invasion abroad in a bid to expand his green and pleasant land. But at what devastating cost? Witness Henry’s bombastic pursuit of power&#8230; \"The game's afoot!\" Youth & \"Pay-What-You-Can\" discounts available!",
    pubDate: "2026-07-22T02:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Town Park",
    imageUrl: "https://koto.org/wp-content/uploads/2026/07/shakes-henry-v.webp"
  },
  {
    title: "CPR World Wilderness First Aid course",
    link: "https://koto.org/event/cpr-world-wilderness-first-aid-course/",
    description: "CPR World is offering a 2-day Wilderness First Aid course July 22 & 23 in Telluride. For information and registration, visit cprworld.com or call (970) 729-2779.",
    pubDate: "2026-07-22T06:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-07-22/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-07-22T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Market on the Plaza",
    link: "https://koto.org/event/market-on-the-plaza/2026-07-22/",
    description: "Market on the Plaza is held each Wednesday, June 10 – September 9, 2026, from 11 a.m. to 4 p.m. in Heritage Plaza, the center of Mountain Village. Heritage Plaza is steps from the free gondola. Come enjoy local produce, original artisan creations, kid-friendly goods and more.",
    pubDate: "2026-07-22T17:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Heritage Plaza, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Mahjongg for Independent Players",
    link: "https://koto.org/event/mahjongg-for-independent-players-4/2026-07-22/",
    description: "Looking to enjoy an afternoon of friendly games of mah-jongg for independent players? Join us at the Library every Wednesday from 1-3pm. Bring your 2026 card if you have one, although we have plenty of loaners if you don’t! We’ll have tables, cloths, chairs, and sets. NOTE: This is not a mah-jongg lesson. A general knowledge of the game is necessary to join. Please register in advance at telluridelibrary.org if you'd like to join so we can make sure we have enough tables set up for everyone!",
    pubDate: "2026-07-22T19:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/mahj.jpg"
  },
  {
    title: "Tennis Clinic | 105 | 3.0+ | Golden Hour",
    link: "https://koto.org/event/tennis-clinic-105-3-0-golden-hour/2026-07-22/",
    description: "Join us for a 105 club takeover on all four courts! 105 scoring preview 1 Point for just winning the point. 5 points for winning the point off a groundstroke winner. 10 points for winning a point off a volley winner. 20 points for winning the point off of an overhead winner. Suitable for levels 3.0+, this game is not only a workout and a ton of fun, but it will improve your tennis game by: Teaching you when to play near the net player. Improve your overall net game. Encourage you to practice being aggressive at the net. Finding a backhand volley. Execute deep lobs.",
    pubDate: "2026-07-22T23:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Plant Party -You Buggin Me",
    link: "https://koto.org/event/plant-party-you-buggin-me/",
    description: "Who's Buggin you and what can you do about it? We will discuss common plant ailments and make our own pest spray to keep the bugs away.",
    pubDate: "2026-07-22T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Shakespeare in the Park: \"Henry V\"",
    link: "https://koto.org/event/shakespeare-in-the-park-henry-v/2026-07-22/",
    description: "Join us ON the Town Park Stage for one of our town’s most beloved traditions: Telluride Theatre's 36th Annual SHAKESPEARE IN THE PARK! Action, humor & romance abound in Shakespeare's iconic war drama. HENRY V, the young and newly crowned king, is impatient to assert control over the people of England. Having received a humiliating gift from overseas, his bruised ego leads him to double down on a military invasion abroad in a bid to expand his green and pleasant land. But at what devastating cost? Witness Henry’s bombastic pursuit of power&#8230; \"The game's afoot!\" Youth & \"Pay-What-You-Can\" discounts available!",
    pubDate: "2026-07-23T02:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Town Park",
    imageUrl: "https://koto.org/wp-content/uploads/2026/07/shakes-henry-v.webp"
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-07-23/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-07-23T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "DIY Condiments with Kayla",
    link: "https://koto.org/event/diy-condiments-with-kayla/",
    description: "Skip the store-bought bottles and discover how easy—and delicious—it is to make your own flavorful condiments from scratch. Join fermentation educator and local food advocate Kayla Wexelberg of Taste Your Roots for a hands-on workshop focused on creating homemade condiments and barbecue sauce using fresh, wholesome ingredients. Learn the fundamentals of balancing sweet, salty, tangy, and savory flavors while crafting customizable recipes that fit your taste and dietary preferences. Participants will explore ingredient combinations, discover simple techniques for elevating everyday meals, and leave with recipes and inspiration to continue experimenting at home. Whether you're a backyard grill master, a home cook looking to expand your kitchen skills, or simply curious about making more foods from scratch, this class will help you add a personal touch to every meal.",
    pubDate: "2026-07-23T18:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Pilates for All Bodies with Laura",
    link: "https://koto.org/event/pilates-for-all-bodies-with-laura-2/2026-07-23/",
    description: "Join Laura Colbert for Pilates for All Bodies every Thursday from 12:30-1:15pm. This program is free and open to the public. All bodies and experience levels are welcome. The library has a few mats, but bring your own if you can.",
    pubDate: "2026-07-23T18:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Party in the Park",
    link: "https://koto.org/event/party-in-the-park-2/",
    description: "We hope you will join the Telluride Mountain Club for our annual party and membership drive in Telluride Town Park! This event supports our annual trail maintenance and new trail planning and implementation projects. Thank you to our sponsors: Alpine Club, Telluride Consulting, Jagged Edge, Latitude Insurance, Alpine Bank, Arc'teryx, Stellar Tours. We can't thank you enough! Ticket Price: Adult (Ages 14+): $40 Child (Under 14): $25 Ticket Includes: Food – BBQ by Black Salt Hospitality Reusable Telluride Mountain Club cup Beer (Stronghouse) & Wine – You must be 21 or over to drink alcohol. We'll be checking IDs. Music – DJ Bash Raffle Would you like to become a donor, sponsor, or provide product to our raffle? Please email hope@telluridemountainclub.org.",
    pubDate: "2026-07-23T23:15:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Town Park",
    imageUrl: ""
  },
  {
    title: "Emotional Regualtion Workshop w/Betsy Lamberson",
    link: "https://koto.org/event/emotional-regualtion-workshop-w-betsy-lamberson/",
    description: "In this two-hour workshop, participants will learn to work with their nervous system to navigate challenging times and build self-regulation skills unique to their situation. Participants will create their own self-care compass that helps them to navigate stress and identify what measures could be restorative to their nervous systems. There will be a mix of presentation, writing prompts, and group discussion. Betsy Lamberson is a parenting educator and nervous system coach who helps caregivers and professionals better understand behavior through the lens of stress and connection. Through her work at New Roots Parenting, she offers practical, neuroscience-informed tools rooted in co-regulation, self-awareness, and relationship repair. www.newrootsparenting.com",
    pubDate: "2026-07-23T23:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Yoga For All with Jay and Jane",
    link: "https://koto.org/event/yoga-for-all-with-jay-and-jane/2026-07-24/",
    description: "Join local instructors Jane del Piero and Jay Holt for a weekly class centered on deep breath work, gentle flow, and energizing chakral movement. Jane and Jay are the owners of local acupuncture, massage, and sound healing practice Luv Light. Donations are accepted. All bodies welcome.",
    pubDate: "2026-07-24T14:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/wellness-lineup-18.png"
  },
  {
    title: "Youth Tennis & Pickleball Camp",
    link: "https://koto.org/event/youth-tennis-pickleball-camp/2026-07-24/",
    description: "Ages: 6 – 14 Flexible Sign-Up Options: Choose weekly or daily sessions. Weekly Discount: Sign up for a full week and receive 20% off! Daily Schedule (Price includes all activities below) 9:00 AM – 9:30 AM | Check-In 9:30 AM – 11:30 AM | Pickleball 11:30 AM – 12:30 PM | Supervised BYO Lunch & Games 12:30 PM – 2:30 PM | Tennis Join us for a fun-filled program designed to build skills, confidence, and a love for the game!",
    pubDate: "2026-07-24T15:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Up-off Gymnastics, Dance, and Spanish",
    link: "https://koto.org/event/up-off-gymnastics-dance-and-spanish/2026-07-24/",
    description: "We are a MOBILE family business offering non-competitive Gymnastics, Preschool Spanish, & Dance classes to the San Miguel County area. Tia Uphoff was a competitive gymnast and an instructor for 20+ years, helping children develop balance, flexibility, strength and proper tumbling techniques while using positive reinforcement and encouragement for success. Infant to Age 5 — Padres & Pequenos Class – $10.00 per class This class invites adults & kids to participate in Educational songs, in English & Spanish, with intro to gymnastics. Sign up at any time and get started weekly. Fridays — 11:15-11:40 am @ Lone Cone Library Norwood K to 3rd Grade week Session 8 Week Winter Session $150 for the 8 sessions. Thursdays – 430-530 pm @ Lone Cone Library Norwood For more information and to register: Contact Tia @ liv2danz247@gmail.com or find us on Facebook!",
    pubDate: "2026-07-24T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Lone Cone Library Norwood",
    imageUrl: "https://koto.org/wp-content/uploads/2025/06/Messenger_creation_3FA37E27-C0AC-4E9D-ABF5-592710E68D81.jpeg"
  },
  {
    title: "Ridgway Farmer's Market",
    link: "https://koto.org/event/ridgway-farmers-market/2026-07-24/",
    description: "The Ridgway Farmer's Market takes place every Friday from May 22nd through October 16th! * The August 7th Market will be held onthe 6th* 10 a.m. to 2 p.m. at Hartwell Park in Downtown Ridgway Local Produce | Artisans | Live Music every Last Friday",
    pubDate: "2026-07-24T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Hartwell Park Ridgway",
    imageUrl: ""
  },
  {
    title: "Telluride Farmer's Market",
    link: "https://koto.org/event/telluride-farmers-market/2026-07-24/",
    description: "We are an organic market in the heart of beautiful downtown Telluride, CO. Our 2026 Market is every Friday from May 29 – October 9th! We provide the highest quality produce, animal products, prepared food, and artisans. All of our goods are produced within 100 miles of Telluride, so you can feel good about shopping local. From late May through early October, you can find us on South Oak Street in downtown Telluride selling the best of Southwest Colorado from 10:30am to 3:30pm.",
    pubDate: "2026-07-24T16:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Oak Street Plaza, Telluride",
    imageUrl: ""
  },
  {
    title: "Free Youth Tennis & Pickleball Program",
    link: "https://koto.org/event/free-youth-tennis-pickleball-program-2/2026-07-24/",
    description: "Community Tennis & Pickleball Program This program is available for children ages 8 – 16 to receive free tennis instruction from trained and certified coaches at the Telluride Racquet Club. Goal: This program is designed to reach those who may not be able to participate due to financial constraints. Inclusivity: No one will be turned away based on their ability to pay. No Membership Required. Demo equipment is available at no charge for use during this clinic.",
    pubDate: "2026-07-24T21:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Racquet Club, Mountain Village",
    imageUrl: ""
  },
  {
    title: "Shakespeare in the Park: \"Henry V\"",
    link: "https://koto.org/event/shakespeare-in-the-park-henry-v/2026-07-24/",
    description: "Join us ON the Town Park Stage for one of our town’s most beloved traditions: Telluride Theatre's 36th Annual SHAKESPEARE IN THE PARK! Action, humor & romance abound in Shakespeare's iconic war drama. HENRY V, the young and newly crowned king, is impatient to assert control over the people of England. Having received a humiliating gift from overseas, his bruised ego leads him to double down on a military invasion abroad in a bid to expand his green and pleasant land. But at what devastating cost? Witness Henry’s bombastic pursuit of power&#8230; \"The game's afoot!\" Youth & \"Pay-What-You-Can\" discounts available!",
    pubDate: "2026-07-25T02:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Town Park",
    imageUrl: "https://koto.org/wp-content/uploads/2026/07/shakes-henry-v.webp"
  },
  {
    title: "Zumba with Gisela",
    link: "https://koto.org/event/zumba-with-gisela/2026-07-25/",
    description: "Ditch the workout and join the party! Zumba® is a high-energy dance fitness class that mixes low-intensity and high-intensity moves for an interval-style, calorie-burning workout. Driven by Latin and international rhythms like salsa, merengue, reggaeton, and cumbia, you will tone your body and boost your endurance without even realizing how hard you are working. It is exercise in disguise! No dance experience is required—just bring your energy, a water bottle, and a smile. This class is free and open to the public, but donations for the instructor are always welcome. ¡Olvida el entrenamiento y únete a la fiesta! Zumba® es una clase de fitness de baile de alta energía que mezcla movimientos de baja y alta intensidad para un entrenamiento de estilo de intervalos que quema calorías. …",
    pubDate: "2026-07-25T16:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Movies Under the Stars",
    link: "https://koto.org/event/movies-under-the-stars/2026-07-25/",
    description: "Telluride Mountain Village Owner's Association (TMVOA) presents Movies Under the Stars – FREE family-friendly outdoor movies screenings – every Saturday this summer at Conference Center Plaza! New this summer: Family Happy Hour from 6:30-8:30 p.m.! Enjoy lawn games, sidewalk chalk, a bounce house, face painting and more. Film schedule below: June 13 – Alice in Wonderland (1951) June 20 – Zootopia 2 July 4 – The Sandlot July 11 – Elio July 18 – How to Train Your Dragon (2025) July 25 – GOAT August 1 – Wicked for Good August 8 – Hoppers August 15 – Superman (2025)",
    pubDate: "2026-07-26T00:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Conference Center Plaza Mountain Village",
    imageUrl: "https://koto.org/wp-content/uploads/2026/06/MuS_Pstr11x17_2026-1-pdf-1.jpg"
  }
];

const WILKINSON_EVENTS = [
  {
    title: "Zumba with Gisela",
    link: "https://telluridelibrary.libcal.com/event/17117358?hs=a",
    description: "10:00 AM – 11:00 AM · Ditch the workout and join the party! Zumba&reg; is a high-energy dance fitness class that mixes low-intensity and high-intensity moves for an interval-style, calorie-burning workout. Driven by Latin and international rhythms like salsa, merengue, reggaeton, and cumbia, you will tone your body and boost your endurance without even realizing how hard you are working. It is exercise in disguise! No dance experience is required—just bring your energy, a water bottle, and a smile. This class is free and open to the public, but donations for the instructor are always welcome. &iexcl;Olvida el entrenamiento y &uacute;nete a la fiesta! Zumba&reg; es una clase de fitness de baile de alta energ&iacute;a que mezcla movimientos de baja y alta intensidad para un entrenamiento de estilo de intervalos que quema calor&iacute;as. …",
    pubDate: "2026-07-18T16:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Program Room",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_06_26_14_10_49.jpg"
  },
  {
    title: "90s Movie Matinee: The Sandlot",
    link: "https://telluridelibrary.libcal.com/event/15536169?hs=a",
    description: "2:00 PM – 4:00 PM",
    pubDate: "2026-07-18T20:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Program Room",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_03_13_17_32_12.png"
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
    lastSeen: "2026-07-18"
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
    title: "The Saint Cecilia - Night Two w/ Harvey Street",
    link: "https://www.alibitelluride.com/calendar#eca-event=the-saint-cecilia-night-one-1",
    description: "From the outside, The Saint Cecilia is a collection of emotional images, love, a...",
    pubDate: "2026-07-18",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/a5f0d482-c0f2-4049-a875-64a39a0b5888/-/crop/1080x540/0,245/-/preview/"
  },
  {
    title: "Young and Dead",
    link: "https://www.alibitelluride.com/calendar#eca-event=young-and-dead",
    description: "Young and Dead is an exciting culmination of musicians in their early 20's from ...",
    pubDate: "2026-07-19",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/6b4daa87-473a-4ea8-ab82-22647ed252f4/-/crop/3000x1501/0,132/-/preview/"
  },
  {
    title: "Big Violet",
    link: "https://www.alibitelluride.com/calendar#eca-event=big-violet",
    description: "Big Violet is an alternative rock band from Taos, New Mexico known for emotional...",
    pubDate: "2026-07-24",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/f3b34692-955d-43ed-b4f0-86e03c1a7e53/-/crop/4064x2033/0,252/-/preview/"
  },
  {
    title: "High Country Hustle",
    link: "https://www.alibitelluride.com/calendar#eca-event=high-country-hustle",
    description: "High Country Hustle is a bluegrass band from Durango, Colorado, formed in 2017 a...",
    pubDate: "2026-07-25",
    time: "9:00 PM",
    source: "alibi",
    sourceLabel: "The Alibi",
    category: "Live Music",
    location: "The Alibi • Telluride, CO",
    imageUrl: "https://ucarecdn.com/656ff21a-f248-4773-bd89-1ce49203874c/-/crop/3674x1471/0,691/-/preview/"
  },
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
    title: "Randy Houser Live in Concert Presented by The Alpine Club, A benefit for the Telluride Foundation’s Good Neighbor Fund",
    link: "https://sheridanoperahouse.com/events/randy-houser-live-in-concert-presented-by-the-alpine-club-and-a-benefit-for-the-telluride-foundations-good-neighbor-fund/",
    description: "Randy Houser performs live in concert at the historic Sheridan Opera House in Telluride, presented by The Alpine Club. The event benefits the Telluride Foundation's Good Neighbor Fund, a local initiative supporting community members in need.",
    pubDate: "2026-07-17",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2026/05/unnamed-file-1.png"
  },
  {
    title: "An Evening with Josh Abbott",
    link: "https://sheridanoperahouse.com/events/an-evening-with-josh-abbott/",
    description: "Josh Abbott performs at the historic Sheridan Opera House in Telluride. The Texas country singer-songwriter is known for his blend of traditional country sounds and heartfelt storytelling, delivering an intimate evening of live music in one of the region's most beloved and storied venues.",
    pubDate: "2026-07-22",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2026/06/Josh-Abbot-Website.jpg"
  },
  {
    title: "FREE Oak Street Park SummerSHOW Series: Selasee (Reggae)",
    link: "https://sheridanoperahouse.com/events/oak-street-park-summershow-series-2/",
    description: "A free outdoor reggae concert featuring Selasee, part of the Oak Street Park SummerSHOW Series. The event takes place at the Sheridan Opera House in Telluride, offering a no-cost live music experience in a beloved community venue.",
    pubDate: "2026-07-23",
    source: "sheridan",
    sourceLabel: "Sheridan Opera House",
    category: "Concert / Performance",
    location: "Sheridan Opera House • Telluride, CO",
    imageUrl: "https://sheridanoperahouse.com/wp-content/uploads/2026/03/dsc01583lr-1-.733x412.webp"
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
    title: "Monthly Welcome Home Alliance Veteran's Coffee at the Sherbino",
    href: "https://sherbino.org/event/monthly-welcome-home-alliance-veterans-coffee-at-the-sherbino/2026-07-14/",
    date: "2026-07-14 10:00:00",
    endDate: "2026-07-14 12:00:00",
    location: "Ridgway, CO",
    copy: "",
    imageUrl: "https://sherbino.org/wp-content/uploads/2023/01/Vet-Coffee.png",
    description: "A monthly gathering at the Sherbino in Ridgway for veterans through the Welcome Home Alliance, offering a casual coffee meetup and a chance to connect with fellow veterans and community members. The event is part of a recurring series supporting veteran community and fellowship in the region."
  },
  {
    title: "The Sherbino presents: From Intention to Impact; Planned Giving Essentials",
    href: "https://sherbino.org/event/from-intention-to-impact-planned-giving-essentials-ridgway/",
    date: "2026-07-14 18:30:00",
    endDate: "2026-07-14 20:00:00",
    location: "Ridgway, CO",
    copy: "Join The Sherbino on Tuesday, July 14, from 6:30–8 p.m. for “From Intention to Impact: Planned Giving Essentials,” an evening conversation about legacy giving, community impact, and supporting the future of arts and culture in Ridgway.\n\n\n\n\n\n\t\n\t\t\n\t\t\t\t\t\n\n\t\t\t\t\t\n\t\t\t\t @ \t\t\t\n\t\t\t\n\t\t\t\t\t\t\t\n\t\t\n\t\t\t\n\n\n\n\nDoors at 6:00 PM ||  Presentation at 6:30 ||  Entry by donation\n\n\n\nSetting: seated || Registration is free but required \n\n\n\n\nJoin Attorney Lincoln Anderson and Investment Advisor Michael Murphy as they explain ways to manage your retirement accounts for the benefit of causes you care about. In this session they will provide information about Qualified Charitable Distributions (QCD's) and appreciated stock donations, and will cover other estate planning tips.  Learn in one evening how to give now and reduce your taxes!\n\n\n\n\n\n\n\n\n\n\n\n\t\n\t\t\n\t\n\n\n\t\n\t\t\n\t\t\t\n\t\t\t\t\n\t\t\t\t\t\n\t\t\t\t\t\t\n\t\n\t\n\n\t\t\t\t\t\t\n\t\t\t\t\t\t\tAdd to calendar\t\t\t\t\t\t\n\t\t\t\t\t\t\n\t\n\n\t\t\t\t\t\n\t\t\t\t\t\n\t\t\t\t\t\t\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\n\t\t\t\t\t\t\t\t\t\n\t\t\t\t\t\t\t\t\t\tGoogle Calendar\t\t\t\t\t\t\t\t\t\n\t\t\t\t\t\t\t\t\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\n\t\t\t\t\t\t\t\t\t\n\t\t\t\t\t\t\t\t\t\tiCalendar\t\t\t\t\t\t\t\t\t\n\t\t\t\t\t\t\t\t\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\n\t\t\t\t\t\t\t\t\t\n\t\t\t\t\t\t\t\t\t\tOutlook 365\t\t\t\t\t\t\t\t\t\n\t\t\t\t\t\t\t\t\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\n\t\t\t\t\t\t\t\t\t\n\t\t\t\t\t\t\t\t\t\tOutlook Live",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/05/ChatGPT-Image-May-15-2026-03_07_26-PM.png"
  },
  {
    title: "The Courtyard at 610 Presents: Heather & Douglas",
    href: "https://sherbino.org/event/the-courtyard-at-610-presents-heather-douglas/",
    date: "2026-07-19 19:30:00",
    endDate: "2026-07-19 21:00:00",
    location: "The Courtyard at 610, Ridgway",
    copy: "@ Gates: 7:00 || Show: 7:30pm || $15 Advance / $20 at gates  Enter via the alleyway behind the Sherbino and 610 Arts Collective || Outdoor Venue || Setting: seated || Limited Bar Available **Due to the local Gold Mountain Fire – Poor air quality or rain location will be inside on The Sherbino main stage for Courtyard shows** Join us for an unforgettable evening of music under the stars in one of Ridgway’s most charming hidden venues—The Courtyard at 610, tucked behind the 610 Arts Collective and Sherbino Theater. Enter through the alleyway behind the Sherbino and 610 Gallery for a magical summer night. Beloved regional duo Heather & Douglas return to The Courtyard for a relaxed, intimate concert filled with heartfelt ballads, spontaneous fun, and harmonies that hit just right. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/05/Heather-Douglas-banner-july-19.png"
  },
  {
    title: "The Courtyard at 610 Presents: Hiroya Tsukamoto",
    href: "https://sherbino.org/event/hiroya-tsukamoto-courtyard-610-july-25-2026/",
    date: "2026-07-25 19:30:00",
    endDate: "2026-07-25 21:00:00",
    location: "The Courtyard at 610, Ridgway",
    copy: "@ Gates: 7 (behind the 610 Gallery and Sherbino) || Show: 7:30 || $20 – Online / $25 – At Door General Admission Seating || Limited BarThe Courtyard at 610 is a unique little venue behind our gallery space, the 610 Arts Collective, on Clinton St. The entrance is through the alleyway between N Cora St. and N Laura St behind the gallery and The Sherbino Theater. **Due to the local Gold Mountain Fire – Poor air quality or rain location will be inside on The Sherbino main stage for Courtyard shows** Hiroya Tsukamoto is a one-of-a-kind composer, guitarist, and storyteller from Kyoto, Japan. He began playing the five-string banjo when he was thirteen, and took up the guitar shortly after. …",
    imageUrl: "https://sherbino.org/wp-content/uploads/2026/04/ChatGPT-Image-Apr-30-2026-02_34_08-PM.png"
  },
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
    imageUrl: "https://sherbino.org/wp-content/uploads/2023/01/Vet-Coffee.png",
    description: "The Welcome Home Alliance hosts its monthly veterans coffee gathering at the Sherbino in Ridgway, offering a regular space for local veterans to connect and find community support. It is a recurring meetup held on a monthly basis."
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

];

const OURAY_RIDGWAY_EVENTS = [
  {
    title: "Fall Registration is NOW OPEN",
    link: "https://events.ourayridgwayevents.com/event/fall-registration-is-now-open-at-weehawken-creative-arts",
    description: "It's time to make this your most creative season yet! From painting, pottery, photography, theater, dance, karate, creative writing, and so much more, Weehawken offers inspiring classes and workshops for children, teens, and adults across Ouray, Ridgway, and Montrose. Whether you're discovering a new passion, building your skills, or returning to a favorite creative outlet, there's something for every age and experience level. ✨ Don't wait—many classes fill quickly! 👉 Register today and explore the full lineup: https://weehawkenarts.org/ Let's make this fall a season of creativity, connection, and community. We can't wait to create with you! 🎭🎶🖌️ View on site | Email this event",
    pubDate: "2026-07-18T06:00:00.000Z",
    endDate: "2026-07-24",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Creative Arts!",
    imageUrl: "https://localist-images.azureedge.net/photos/52325008688506/huge/e4cb878588d368b44b33697854b4f04e5aa2df35.jpg"
  },
  {
    title: "Archery at the Park - Ridgway State Park Summer Program Series",
    link: "https://events.ourayridgwayevents.com/event/archery-at-the-park-ridgway-state-park-summer-program-series",
    description: "This program is an engaging, hands-on introduction to a timeless outdoor sport. Led by CPW staff and certified volunteer instructors, this free clinic provides attendees with the unique opportunity to learn archery skills. We will emphasize range safety, proper form, and the mental focus required to hit the bullseye, all within the natural setting of the park. View on site | Email this event",
    pubDate: "2026-07-18T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway State Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53410738987655/huge/c5d289672d54d0fae8645320f97d31581a0875b6.jpg"
  },
  {
    title: "Saturday Yoga",
    link: "https://events.ourayridgwayevents.com/event/saturday-yoga",
    description: "Zen Mountain Yoga is a carefully designed yoga class created to move your mind, body, and spirit through a series of seated and standing yoga poses. Yoga props are used to facilitate deeper movement for a richer stretch environment, designed to increase flexibility, balance, and range of movement. Restorative breathing exercises, neurogenic brain training, and guided relaxation will promote stress reduction and mental clarity. Zen out in as we explore the eight limbs of yoga through your dosha awareness, and bring the mountain home to your heart. Appropriate for beginner to advanced. ***Please visit studioouray.com in case of inclement weather or class cancellation.***Please bring a yoga mat, sun protection, and water.*** $10.00 outside until Labor Day. Drop-indoors after labor day $20.00. View on site | Email this event",
    pubDate: "2026-07-18T15:00:00.000Z",
    endDate: "2026-09-12",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Fellin Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53233830352657/huge/0d1cbbdf672690b660591a1d6fa1c311b49b04ef.jpg"
  },
  {
    title: "On Display: The 610 Arts Annual Photography Invitational ~ featuring works by Gary Slane & Eric Phillips",
    link: "https://events.ourayridgwayevents.com/event/Ongoing-610-arts-annual-photography-invitational-featuring-works-by-gary-slane-eric-phillips",
    description: "Photography Invitational featuring Gary Slane and Eric Phillips On display July 1 – August 28, 2026 Artist Reception: Friday, July 10 | 5:00–7:00 PM | Free! The 610 Arts Collective is pleased to present the Photography Invitational, featuring the work of Gary Slane of Montrose and Eric Phillips of Colorado’s Gunnison Valley. This special exhibition showcases two accomplished photographers whose distinct artistic perspectives celebrate the beauty, power, and wonder of the natural world. Join us for an Artist Reception on Friday, July 10, from 5:00–7:00 PM, where guests will have the opportunity to meet the artists, learn about their creative processes, and enjoy an evening surrounded by extraordinary imagery from across the American West and beyond. Gary Slane Montrose photographer Gary Slane has devoted years to capturing breathtaking landscapes, wildlife, and night skies throughout North America. …",
    pubDate: "2026-07-18T18:00:00.000Z",
    endDate: "2026-08-28",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The 610 Arts Collective",
    imageUrl: "https://localist-images.azureedge.net/photos/53311891403836/huge/5ed79c16e243d3edcc6923539da943575df4cc1b.jpg"
  },
  {
    title: "Postponed: Jul 18, 2026: How the West Was Worn Or… Black Hat Optional: Theatre @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/how-the-west-was-worn-or-black-hat-optional-theatre-the-wright",
    description: "Dear Friends, Like so many of you, our hearts have been with our community these past days as the wildfire has touched so many lives, including some of our own cast and crew. Because of this, we've made the difficult decision to postpone our 2026 melodrama, How the West Was Worn, originally scheduled for July 17-20. We know how much you look forward to this show, and we're so grateful for your support. We're working to bring the show back to you within the year. Things are still uncertain right now, but we promise to keep you posted as soon as we have real dates to share. Your ticket will simply carry over to the new dates. …",
    pubDate: "2026-07-19T01:00:00.000Z",
    endDate: "2026-07-21",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/52932502125812/huge/c4a0083e2a38c8bce646c53ac7943f10714eb802.jpg"
  },
  {
    title: "Ouray: Echoes in the Canyon — Screening @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/ouray-echoes-in-the-canyon-screening-the-wright",
    description: "Ouray: Echoes in the Canyon — Special Community Screening @ the Wright Like so many of you, our hearts have been with our community these past several days as the Gold Mountain Fire has touched so many lives, including some of our own cast and crew. In place of this weekend's performances, we invite you to join us for a special hometown screening of Ouray: Echoes in the Canyon. Ouray: Echoes in the Canyon — Screening @ the Wright WHEN? Saturday, July 18 Doors at 6:30 pm • Film at 7:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado RATING: G ABOUT THE FILM Ouray: Echoes in the Canyon returns to the Wright Opera House following its sold-out premiere. …",
    pubDate: "2026-07-19T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/53375404981466/huge/b6ac805d7cab9956501ae2d370b3c2d63385e823.jpg"
  },
  {
    title: "When Hollywood Invaded the Southwest - Ridgway state park summer program series",
    link: "https://events.ourayridgwayevents.com/event/when-hollywood-invaded-the-southwest-ridgway-state-park-summer-program-series",
    description: "Join guest speaker Ed Bovy for a captivating journey through the history of filmmaking in Southwest Colorado. From the rugged landscapes that served as the perfect backdrop for classic Westerns to the modern productions that have graced local peaks, learn why Hollywood fell in love with this corner of the world. View on site | Email this event",
    pubDate: "2026-07-19T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway State Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53417007693969/huge/23ad5ec7cd309b689217faa3eb6c7937760a6a64.jpg"
  },
  {
    title: "Ouray Open Air Market",
    link: "https://events.ourayridgwayevents.com/event/ouray-open-air-market-7809",
    description: "The Ouray Open-Air Market is a brand-new cooperative, organized marketplace designed to provide a dedicated home for small-scale creators & producers. Our core mission is to promote local agriculture and artisan goods while fostering honest, transparent relationships between vendors and the community. This is an entirely fresh platform in town designed to showcase your artisanal goods and services, helping neighbors and visitors know exactly who made the products they love. When and Where? Location: The market will take place in a beautiful open-air setting at Billy Goat Gruff's Patio (located at 4th Ave. + Main Street, Ouray, CO).Schedule: We will operate every Sunday from June 21, 2026, through September 6, 2026.Hours: Market hours are 10:00 AM to 2:00 PM. View on site | Email this event",
    pubDate: "2026-07-19T16:00:00.000Z",
    endDate: "2026-09-06",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Billy Goats Gruff Patio",
    imageUrl: "https://localist-images.azureedge.net/photos/53054893063268/huge/ed5f6f42c1d6a9db337d04171355a33509b6e1d1.jpg"
  },
  {
    title: "Funky Ouray: Reggae music in Fellin Park",
    link: "https://events.ourayridgwayevents.com/event/funky-ouray-reggae-music-in-fellin-park",
    description: "Join us in Fellin Park every Sunday in July for Funky Ouray, a free, all-ages reggae DJ set hosted by Night Nurse Sound System. Bring a blanket, gather your friends, and kick back to reggae rhythms. View on site | Email this event",
    pubDate: "2026-07-19T22:00:00.000Z",
    endDate: "2026-07-26",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Fellin Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53251675055630/huge/fc4164d9a73f0015ccaf172c2b42758b02fab547.jpg"
  },
  {
    title: "The Courtyard at 610 Presents: Heather & Douglas at The Courtyard",
    link: "https://events.ourayridgwayevents.com/event/the-courtyard-at-610-presents-heather-douglas",
    description: "Gates: 7:00 || Show: 7:30pm || $15 Advance / $20 at gates Enter via the alleyway behind the Sherbino and 610 Arts Collective || Outdoor Venue || Setting: seated || Limited Bar Available Join us for an unforgettable evening of music under the stars in one of Ridgway’s most charming hidden venues—The Courtyard at 610, tucked behind the 610 Arts Collective and Sherbino Theater. Enter through the alleyway behind the Sherbino and 610 Gallery for a magical summer night. Beloved regional duo Heather & Douglas return to The Courtyard for a relaxed, intimate concert filled with heartfelt ballads, spontaneous fun, and harmonies that hit just right. With voices, guitars, and upright bass in hand, they serve the song above all else—inviting the audience into stories both tender and playful. Their genre-defying sound weaves together folk, roots, Americana, and soul in a way that only they can. …",
    pubDate: "2026-07-20T01:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "610",
    imageUrl: "https://localist-images.azureedge.net/photos/52994106519349/huge/87782813e7d78045f5e07e9336681a43bc3b278f.jpg"
  },
  {
    title: "On Display: Roots & Rhythms",
    link: "https://events.ourayridgwayevents.com/event/roots-and-rhythms-opening-night-with-live-music-and-demo",
    description: "Roots & Rhythms is a collaborative exhibition featuring mixed media paintings by Julia Reid and bentwood sculptures by Ethan Wortis. Through layered textures, organic forms, and expressive movement, the exhibition explores the connection between memory and transformation—rooted in what came before, flowing toward what is possible. Where memory surfaces, movement unfolds, and forms emerge. The exhibition will remain on view July 3–August 4, with gallery hours Monday–Wednesday and Friday, 9 a.m.–4 p.m. View on site | Email this event",
    pubDate: "2026-07-20T15:00:00.000Z",
    endDate: "2026-08-03",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Space to Create",
    imageUrl: "https://localist-images.azureedge.net/photos/53268350844000/huge/445ca1a6868c4a44ce4c2ec9f324477640148d3b.jpg"
  },
  {
    title: "On Display: Silverton, Interpreted",
    link: "https://events.ourayridgwayevents.com/event/copy-of-show-opening-silverton-interpreted-ridgway-first-friday",
    description: "This show will run through mid-August Silverton, Interpreted is a traveling show features a selection of artists from The 9318 Collective whose work reflects the beauty, energy, and elemental character of the San Juan Mountains and the lands that surround them. Through varied styles and mediums, the exhibition offers multiple perspectives on a shared place, celebrating the artistic dialogue between land and maker. View on site | Email this event",
    pubDate: "2026-07-20T16:00:00.000Z",
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
    pubDate: "2026-07-20T16:00:00.000Z",
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
    pubDate: "2026-07-20T18:00:00.000Z",
    endDate: "2026-09-14",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/51631061496012/huge/ef9e5facb2d933bc015ffe261fc1ecd0508088c8.jpg"
  },
  {
    title: "Canceled: Jul 20, 2026: Seussical The Musical - Summer Youth Theatre Program",
    link: "https://events.ourayridgwayevents.com/event/soussical-the-musical-summer-youth-theatre-program",
    description: "Seussical is a fantastical musical based on the works of Dr. Seuss, primarily blending Horton Hears a Who!, Horton Hatches the Egg, and Gertrude McFuzz. Written by Lynn Ahrens and Stephen Flaherty, it follows Horton the Elephant and the Cat in the Hat as they explore themes of imagination, loyalty, and community through toe-tapping, whimsical musical numbers. Performances on July 25th & 26th at Ridgway Secondary School. For financial assistance contact Kathy O'Mara at 413-441-6120 or Email komara@minervawest.org . View on site | Email this event",
    pubDate: "2026-07-20T19:00:00.000Z",
    endDate: "2026-07-24",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway Secondary School",
    imageUrl: "https://localist-images.azureedge.net/photos/52711641780960/huge/4a195394e3f1702e5fcf72925dae09f386f6a1cc.jpg"
  },
  {
    title: "Breathe Together",
    link: "https://events.ourayridgwayevents.com/event/breathe-together-9572",
    description: "We explore and practice breath awareness and conscious breathing techniques as doorways to physical and emotional regulation and spiritual growth. Through these practices we also grow our awareness and achieve higher states of consciousness that can help us in our everyday life, relationships, general wellbeing and ultimately reconnect with our higher nature. No previous experience is required. View on site | Email this event",
    pubDate: "2026-07-21T00:15:00.000Z",
    endDate: "2026-09-15",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Bee True You Wellness and Creative Studio",
    imageUrl: "https://localist-images.azureedge.net/photos/53197444379202/huge/26813502ab1ba3ae9f231b0cd774d101f4f32f02.jpg"
  },
  {
    title: "Movie Mondays in Hartwell Park",
    link: "https://events.ourayridgwayevents.com/event/movie-mondays-ferris-buellers-day-off",
    description: "Enjoy free movies under the stars in Ridgway's Hartwell Park. They'll start at 8:30pm. Bring your own chairs, blankets and snacks. Brought to you by the Ridgway Youth Advisory Council. Here's the line-up: June 15th - Ferris Bueller's Day Off (rated PG-13)July 20th - The Peanut Butter Falcon (rated PG-13)August 17th - Top Gun (rated 13+ by Common Sense Media) View on site | Email this event",
    pubDate: "2026-07-21T02:30:00.000Z",
    endDate: "2026-08-18",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Hartwell Park",
    imageUrl: "https://localist-images.azureedge.net/photos/52922424426850/huge/1e180755c642fe19893a7caee0beacbf99e967d3.jpg"
  },
  {
    title: "Ouray Youth Summer Programs: Canyoning",
    link: "https://events.ourayridgwayevents.com/event/ouray-youth-summer-programs-canyoning",
    description: "Participants will take part in a guided canyoning trip through Portland Creek. Professional canyoning guides will provide instruction and all technical equipment, including wetsuits, harnesses, helmets, and belay devices. Along the route, participants will rappel down several smaller waterfalls while safely secured on belay by a guide. Participants should bring bathing suits, water, and snacks for the day. REGISTER HERE Scholarships are available if needed. This activity is part of the Youth Adventure Days, sponsored by Ouray's Parks and Recreation Department. For questions, contact Sean Hart at 970-318-1003 or seanhart@cityofouray.com View on site | Email this event",
    pubDate: "2026-07-21T14:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Adventure Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52995362986557/huge/25e52220c3805dcb26431782a3eab968f37ccbf7.jpg"
  },
  {
    title: "Functional Fitness - Strength & Mobility Training For Women",
    link: "https://events.ourayridgwayevents.com/event/functional-fitness-strength-mobility-training-for-women",
    description: "Welcome to Ridgway's strength and mobility training for women! Functional means we focus on movements that mimic everyday activities and improve overall mobility, strength and fitness. Exercises often work multiple muscle groups simultaneously, improving coordination and stability. I love the female group setting because we get a chance to really connect and not only get stronger physically, but also build support and community. Come for a drop in and get a taste or commit long term to transformation, vitality and longevity. All levels are welcome. Let's do hard things together! Instructor: Jenn Turner “Jenn may be a highly certified instructor, but her greatest strength lies in creating a welcoming space for women to meet, gather, and sweat. The workouts are always fun, and the next-day burn is guaranteed.” — E.C. …",
    pubDate: "2026-07-21T14:15:00.000Z",
    endDate: "2026-09-15",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Weehawken Ridgway (Old Schoolhouse)",
    imageUrl: "https://localist-images.azureedge.net/photos/53312790468311/huge/860fbc87ce3cc92e25c09e723732d04292df18ba.jpg"
  },
  {
    title: "TYLER SIMMONS",
    link: "https://events.ourayridgwayevents.com/event/tyler-simmons-4049",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-07-21T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Ridgway FUSE Creative Main Street - Committee Meeting",
    link: "https://events.ourayridgwayevents.com/event/ridgway-fuse-creative-main-street-committee-meeting",
    description: "Ridgway FUSE, a Creative District & Main Street Program, nurtures the cultural and economic vitality of Ridgway, Colorado All Ridgway FUSE Committee Meetings are open to the public. Click here for agendas and notes. Interested residents may apply to serve on the FUSE committee here. Email Tera Wick at twick@town.ridgway.co.us or call 970-626-5308 x 215 with questions. View on site | Email this event",
    pubDate: "2026-07-21T23:30:00.000Z",
    endDate: "2026-09-15",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Decker Community Room",
    imageUrl: "https://localist-images.azureedge.net/photos/52305506266326/huge/6f7fb94915fd0e9d2c59d779c91e1ffdf9538f60.jpg"
  },
  {
    title: "Evenings of History 2026 @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/evenings-of-history-2026-the-wright",
    description: "Evenings of History 2026 @ the Wright WHEN? Weekly Tuesdays • 7:00 pm – 9:00 pm Doors at 6:30 pm • Presentations at 7:00 pm June 16 June 23 June 30 July 7 July 14 July 21 July 28 August 4 WHERE? Wright Opera House 472 Main St. Ouray, Colorado SERIES: Presented by the Ouray County Historical Society ABOUT THE SERIES Join the Ouray County Historical Society for another season of Evenings of History, a community lecture series exploring the people, places, and stories that shaped Ouray County and the greater San Juan region. From mining legends and frontier photography to fashion, recreation, and Ute history, this year’s lineup offers a fascinating look into the characters and events that helped define the American West. Through local historians, researchers, storytellers, and community experts, Evenings of History continues a longstanding tradition of preserving and sharing the rich heritage of Ouray County. …",
    pubDate: "2026-07-22T01:00:00.000Z",
    endDate: "2026-08-05",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/52887120617394/huge/59851e9ca29d75054645a0e488e33edbbcf73d69.jpg"
  },
  {
    title: "Wildflower Walks & Talks with Mary Menz & Jaime Pisarowicz \"Red Mountain Pass\"",
    link: "https://events.ourayridgwayevents.com/event/wildflower-walks-talks-with-mary-menz-jaime-pisarowicz-red-mountain-pass",
    description: "Wildflower Walks & Talks with Mary Menz & Jaime Pisarowicz \"Red Mountain Pass\" July 22nd Wednesday 7:30am - 11:30am $49-$69 Registration: www.weehawkenarts.org Different elevations and habitats provide opportunities to view a wide variety of Colorado’s native plants and wildflowers. Ridgway writer and Colorado Native Plant Master Mary Menz and Jaime Pisarowicz will share their extensive plant knowledge and excitement for the area with you. Special guest and fellow NPM Sandra Dick will also join the group as a guide! Registration includes a copy of their book Common Wildflowers of the San Juan Mountains ($49) or Wildflowers of Colorado’s Western Slope ($69). All groups are limited to 12 participants. Participants will meet and carpooling is recommended (we help facilitate this effort at the meet up location)—specific directions and more information will be provided via email prior to the event. A waiver needs to be signed before the event. …",
    pubDate: "2026-07-22T13:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/52806799570561/huge/ec3cb91778c8921ae65c74f916960dc0cfbd0584.jpg"
  },
  {
    title: "Camp Wildflower - A Women's Wellness Retreat",
    link: "https://events.ourayridgwayevents.com/event/camp-wildflower-a-womens-wellness-retreat",
    description: "Camp Wildflower is four-day women's wellness retreat in the heart of the San Juan Mountains July 22-26, 2026. This retreat is designed as a space to slow down, breathe deeper, and be fully supported - physically, mentally, and emotionally. Rooted in the spirit of summer camp, your days will be spent outside, moving your body, exploring, creating, and settling into a rhythm that feels both playful and restorative. Through intentional movement, time in nature, and supportive wellness and nutrition practices, you’ll reconnect with what your body has been asking for in a way that feels simple, steady, and aligned. Along the way, sisterhood is built through shared experiences, open conversations, and time spent together, the kind that stays with you long after you leave. Come reset, refill your cup, and return to your nature! …",
    pubDate: "2026-07-22T21:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray, CO",
    imageUrl: "https://localist-images.azureedge.net/photos/52799317043664/huge/1714c75173a9eaf2aedc61c49a369db10de46721.jpg"
  },
  {
    title: "White Buffalo, Voyager & Tyler Simmons - Live Music Fundraiser!",
    link: "https://events.ourayridgwayevents.com/event/white-buffalo-voyager-tyler-simmons-live-music-fundraiser",
    description: "Help us GIVE BACK! Join us for LIVE MUSIC with Tyler Simmons on Wednesday, 7/22, on the Rooftop at White Buffalo Restaurant + Bar at Chipeta Lodge. 10% of all non-alcoholic proceeds go to the Voyager Youth Program. Stay for SUNSET on the best rooftop deck in Ridgway! Reserve a Relaxation Access Pass to enjoy our pool and hot tubs before and after the music. Voyager works with Ouray County schools and the community to provide after-school and summer programs for Pre-K, K-5, and Teens 12+. Support these local programs and help build healthy and productive young adults. Learn more about Voyager Youth Program at https://www.voyageryouth.org/ @voyageryouth @chipetalodge @ridgwaycolorado #ridgwaycolorado #ouraycolorado View on site | Email this event",
    pubDate: "2026-07-22T23:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "White Buffalo Rooftop",
    imageUrl: "https://localist-images.azureedge.net/photos/53427639472690/huge/531b33824d528fc929d7ff8e1895f9d8f5cdac5d.jpg"
  },
  {
    title: "OPEN MIC / JAM NIGHT w/ host DJ Strong",
    link: "https://events.ourayridgwayevents.com/event/open-mic-jam-night-w-host-dj-strong",
    description: "Join us at the Lotus for a midweek tradition that brings together musicians, music lovers, and the incredible local talent that makes our community shine. From intimate solo sets to full-band jam sessions with rotating players, Open Mic Night is always full of surprises. Want to play? We’d love to have you — signups begin at 5:30pm. Just bring your instrument and your creativity, and we’ll take care of the rest. Our stage is fully equipped with PA, mics, drums, bass, and everything you need to plug in and play. 🎟️ Free admission 🍻 Grab a beer, settle in, and enjoy the show Come be part of the music — on stage or in the crowd! View on site | Email this event",
    pubDate: "2026-07-23T00:00:00.000Z",
    endDate: "2026-09-10",
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
    pubDate: "2026-07-23T00:00:00.000Z",
    endDate: "2026-09-10",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Gazebo south of Chipeta Lodge, Ridgway, CO (Or studio if raining)",
    imageUrl: "https://localist-images.azureedge.net/photos/52880886803755/huge/ba2d24fbf09ba1f9a707a06213d60685581d7322.jpg"
  },
  {
    title: "Live Music- The Mammoths",
    link: "https://events.ourayridgwayevents.com/event/live-music-the-mammoths",
    description: "Join us for a summer of live music, craft cocktails, mountain views, and unforgettable nights on the St. Elmo Tavern patio. Every Wednesday, we host live music for you to enjoy all season long. Join us on Wednesday, July 22nd as we welcome The Mammoths. This Austin, Texas-based band delivers fuzz-soaked rock n’ roll, blending ’70s psychedelia with heavy guitar work and howling blues energy. Expect distorted riffs, overdriven vocals, and a raw live intensity that hits you in the chest. Loud, dialed in, and unapologetically bold, The Mammoths earn every fan one sweaty show at a time. View on site | Email this event",
    pubDate: "2026-07-23T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "St. Elmo Tavern",
    imageUrl: "https://localist-images.azureedge.net/photos/53126480827602/huge/ad9c458a18ae1762a30aad207d0196671b64e012.jpg"
  },
  {
    title: "The Shining: CO-150 Film Festival Screening — Movie Night @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/the-shining-co-150-film-festival-screening-movie-night-the-wright",
    description: "The Shining: CO-150 Film Festival Screening — Movie Night @ the Wright ABOUT THE FILM The Shining (1980) follows Jack Torrance and his family as they become winter caretakers of the isolated Overlook Hotel, a place where unsettling forces slowly begin to blur the line between reality and madness. Directed by Stanley Kubrick and based on Stephen King's novel, the film transformed psychological horror forever through haunting imagery, unforgettable performances, and a sense of dread that lingers long after the credits roll. This Colorado-themed screening carries its own mountain connection. While the fictional Overlook Hotel sits high in the Rockies, the film's atmosphere of isolation and snowbound unease feels right at home among Colorado's peaks and mountain towns. A chilling psychological thriller that proves some places remember more than they should. …",
    pubDate: "2026-07-23T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/52932610792631/huge/bdcda0258ebbcde0120b61212637e686361ed88a.jpg"
  },
  {
    title: "Pilates Mat",
    link: "https://events.ourayridgwayevents.com/event/pilates-mat",
    description: "All Levels Pilates Mat class. Classical sequence Int to challenge, strengthen and stretch you wehole body. Every Thursday at 9:30am. Pricing Four lessons for $120 Eight lessons for $200 Become a member and pay $100/month to attend weekly. Purchase a pass here: https://ridgwaypilates.punchpass.com/catalogs/300 Class is limited to six people. Mats are included. Please wear socks, put your hair up and choose clothing free of metal. View on site | Email this event",
    pubDate: "2026-07-23T15:30:00.000Z",
    endDate: "2026-08-27",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway Pilates",
    imageUrl: "https://localist-images.azureedge.net/photos/52576058290647/huge/ab41effebba96d758d6c4061ee6bdc28e09bd4e0.jpg"
  },
  {
    title: "Ridgway Concert Series",
    link: "https://events.ourayridgwayevents.com/event/ridgway-concert-series-9303",
    description: "The Town of Ridgway & Pickin’ Productions Present THE 19TH ANNUAL 2026 RIDGWAY CONCERT SERIES FOOD - VENDORS - BEER - WINE & MARGARITAS JULY 2 LEVI PLATERO Shelby Means JULY 9 BLACK UHURU Psylo JULY 16 SAM GRISMAN PROJECT Tanasi JULY 23 DOGS IN A PILE Felix Y Los Gatos JULY 30 THE RUMBLE Ft. Chief Joseph Boudreaux Jr. Handmade Moments No Dogs or Outside Alcohol Permitted SPONSORS Ridgway Real Estate – Alpine Bank – Chipeta Lodge Resort & Space- Orvis Hot Springs – Julie & Dave Duff – Bennett Forgeworks- OAK – Billings Artwork – Todd W. Hoffman Foundation- The Market at Ridgway – Fiddlers Green – KVNF Public Radio – Alpine Edge Engineering - Alt Space Coworking- Vacation Rental Collective For More Information, Please Visit: www.pickinproductions.com View on site | Email this event",
    pubDate: "2026-07-24T00:00:00.000Z",
    endDate: "2026-07-31",
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
    pubDate: "2026-07-24T01:00:00.000Z",
    endDate: "2026-09-11",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/52523770567385/huge/aa7bcfeb333ca9d6b01c43aa6294ed32c0d384e4.jpg"
  },
  {
    title: "Historic Corkscrew Railroad Bed & Turntable Hike",
    link: "https://events.ourayridgwayevents.com/event/historic-corkscrew-railroad-bed-turntable-hike",
    description: "Hiking tour of the Corkscrew Railroad Bed & Turntable in the Red Mountain Mining District led by Bobbie & Mark Johnson $20.00 per person. $15.00 OCHS Members. Call 970-325-4576 to RSVP/Pre Pay View on site | Email this event",
    pubDate: "2026-07-24T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Red Mountain Mining District",
    imageUrl: "https://localist-images.azureedge.net/photos/52278124487184/huge/345c89f1bce55647f7f354d7df2841d9b503e493.jpg"
  },
  {
    title: "Ridgway Farmers Market",
    link: "https://events.ourayridgwayevents.com/event/ridgway-farmers-market",
    description: "Ridgway Farmers Market WHERE LOCAL GROWS... in the soil, in our economy, and in the connections we share as a community Local farmers, ranchers, bakers, and artisans bring the best of Ridgway to town: fresh produce, handcrafted goods, and the shared belief that a strong community begins with supporting the people who live and work here. View on site | Email this event",
    pubDate: "2026-07-24T16:00:00.000Z",
    endDate: "2026-09-11",
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
    pubDate: "2026-07-24T19:00:00.000Z",
    endDate: "2026-08-07",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Public Library",
    imageUrl: "https://localist-images.azureedge.net/photos/53198530879947/huge/403c155aa2c93ade83d633e106dcb10f0e69f9d8.jpg"
  },
  {
    title: "FLANNEL FEEDBACK",
    link: "https://events.ourayridgwayevents.com/event/flannel-feedback-2835",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-07-24T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "FLANNEL FEEDBACK",
    link: "https://events.ourayridgwayevents.com/event/flannel-feedback-9717",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/ View on site | Email this event",
    pubDate: "2026-07-24T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Historic Walking Tour at Meet",
    link: "https://events.ourayridgwayevents.com/event/historic-walking-tour-153",
    description: "Ouray's Fellin Park Tour Led by Jenny Hart View on site | Email this event",
    pubDate: "2026-07-24T22:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Museum 420 6th Avenue",
    imageUrl: "https://localist-images.azureedge.net/photos/52462532106186/huge/0536f4893a793517b7a283c0b091239ca0a84dcf.jpg"
  },
  {
    title: "Literary Trivia Night Fundraiser",
    link: "https://events.ourayridgwayevents.com/event/literary-trivia-night",
    description: "Do you have what it takes? The Ouray Public Library is hosting their 3rd Annual Literary Trivia Night on Friday, July 24th, starting at 6 p.m. at the Ouray Community Center. Create your teams of max 6 or go solo to have a fun night with the community. There will be food and merch for sale. Donations are appreciated. All ages. View on site | Email this event",
    pubDate: "2026-07-25T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/53392493014538/huge/52ba9ab9f56db44dbc53b4f28d88d9300d5bc082.jpg"
  },
  {
    title: "Music Bingo @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/music-bingo-the-wright-1780",
    description: "Music Bingo @ the Wright WHEN? Friday, July 24 Doors at 6:30 pm • Event at 7:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE EVENT Part trivia, part sing-along, part musical chaos, Music Bingo turns your favorite songs into a game night experience where every track could bring you one square closer to victory. Listen for familiar hits, unexpected throwbacks, guilty pleasures, and crowd favorites as players mark their cards and compete for bragging rights. No obscure trivia knowledge required. If you know the song, you're in the game. Bring friends, bring family, bring your suspiciously encyclopedic knowledge of one-hit wonders and movie soundtracks. Free to attend In-person event at the historic Wright Opera House Part of programming at the Wright Opera House, bringing arts, conversation, and community to downtown Ouray since 1889. View on site | Email this event",
    pubDate: "2026-07-25T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/52932681761806/huge/503cf299242bead1eaad98eb39ce7773c58c581f.jpg"
  },
  {
    title: "The Secret Lives of Colorado’s Native Fishes - Ridgway State Park Summer Program Series",
    link: "https://events.ourayridgwayevents.com/event/the-secret-lives-of-colorados-native-fishes-ridgway-state-park-summer-program-series",
    description: "Think you know what’s swimming in our waters? Go beneath the surface for an evening of discovery with professor Derek Houston. From the high-altitude streams to our deep-water reservoirs, Colorado is home to a fascinating array of native fish species that have thrived in the Rockies for centuries. Learn about their unique survival tactics, the challenges they face in a changing environment, and the conservation efforts working to keep our local ecosystems healthy. View on site | Email this event",
    pubDate: "2026-07-25T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway State Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53454822317775/huge/a828c03aa36625634901dfc870f5570c653e2644.jpg"
  },
  {
    title: "Steps Tavern Presents Karaoke Night",
    link: "https://events.ourayridgwayevents.com/event/steps-tavern-presents-karaoke-night",
    description: "Step's Tavern Presents Karaoke Night. Doors Open at 8:00 PM Every Friday Night View on site | Email this event",
    pubDate: "2026-07-25T02:00:00.000Z",
    endDate: "2026-09-12",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "STEPS TAVERN",
    imageUrl: "https://localist-images.azureedge.net/photos/53142698527493/huge/db3a6ef58a79b18eea8c70a4d583bbf3d9498404.jpg"
  },
  {
    title: "All Day Geology Tour",
    link: "https://events.ourayridgwayevents.com/event/all-day-geology-tour",
    description: "Dive deeper into the incredible geology of the Ouray area! 🏔️ Spend the day exploring the landscapes surrounding Ouray alongside local geologists. This extended tour includes additional stops and a closer look at the rich geologic history that shaped the San Juan Mountains, from volcanic activity to the varied rock formations throughout the region. 🕘 July 25 | 9 AM-3 PM 📍 Meet at the Ouray Visitor Center 💲 Free (Donations accepted) REGISTER: https://anc.apm.activecommunities.com/cityofouray/activity/search/detail/347?onlineSiteId=0&from_original_cui=true View on site | Email this event",
    pubDate: "2026-07-25T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Visitor Center",
    imageUrl: "https://localist-images.azureedge.net/photos/53082440669906/huge/f9b15107b816e9da5bfff982f98a0735e575b8c4.jpg"
  },
  {
    title: "Lake Appreciation Day! at Ridgway State Park",
    link: "https://events.ourayridgwayevents.com/event/lake-appreciation-day-at-ridgway-state-park",
    description: "Join us to celebrate our most vital resource, blending outdoor recreation with community stewardship. Visitors can explore the reservoir via free 30 minute boat tours or test their balance with complimentary paddleboarding. It’s a day designed for more than just fun in the sun; it connects guests with local agencies, offers the chance to change a life through pet adoptions with Second Chance Humane Society, and even provides a 10% discount on park merchandise at the Blue Heron Marina Store. Whether you’re cooling off with some ice cream or learning about the ecosystem that sustains our region, this event is a perfect opportunity to enjoy the water while supporting the community that protects it. View on site | Email this event",
    pubDate: "2026-07-25T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway State Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53454849302438/huge/80c5277278dca1232cf1ee9667ded6407614ae5f.jpg"
  },
  {
    title: "“MAKING FRIENDS WITH YOUR PENCIL” WITH MARY PAT ETTINGER",
    link: "https://events.ourayridgwayevents.com/event/making-friends-with-your-pencil-with-mary-pat-ettinger",
    description: "Think you can't draw? Think again! In this thoughtful 4 hour workshop, Mary Pat will lead you through different proven exercises to open the doors to drawing what you see! Mary Pat has taught this class to hundreds of students who have been excited to learn that \"Yes! Anyone can draw.\" It just takes a brain 'reset' and guidance from the instructor. Come prepared to learn and to enjoy your newfound skill. All supplies included in the class fee. View on site | Email this event",
    pubDate: "2026-07-25T17:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Annex on Cora",
    imageUrl: "https://localist-images.azureedge.net/photos/53071990246481/huge/194d3a988c5385dedd7558e69f0f52df8571e58b.jpg"
  },
  {
    title: "Community Open House",
    link: "https://events.ourayridgwayevents.com/event/community-open-house",
    description: "RACC, Citizens State Bank and the West Region Wildfire Council are hosting an open house on July 25 from 3-5pm. The purpose is to support Ridgway businesses, share knowledge of wildfire preparedness and how to fund it, learn how our donations of help flow to the firefighting effort, and to simply have a good time. Area residents can speak with experts in these areas as well as our own Mayor John Clark. We will be giving away gift cards to local retailers, Jazzfest passes, Blues and Brews Festival Passes and complimentary food and beverages. It will be a fun day in Ridgway beginning with the San Juan Gravel Classic, then the Community Open House and finishing up strong with Ridgway Rocks! View on site | Email this event",
    pubDate: "2026-07-25T21:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/53427267435930/huge/c7ba3e8f42ac3ee121e752e3d8deb8ef4b84ead2.jpg"
  },
  {
    title: "Pinyons, Petals, and Prickles: High-Desert Botany - Ridgway State Park Summer Program Series",
    link: "https://events.ourayridgwayevents.com/event/pinyons-petals-and-prickles-high-desert-botany-ridgway-state-park-summer-program-series",
    description: "Join us to explore the fascinating world of our local flora, tracing the incredible journey from majestic pinyon pines to resilient blooming cacti. Whether you're an avid hiker wanting to identify trail plants or simply a curious nature lover, Zoe Debenedette's expert insights will give you a whole new appreciation for our rugged landscape. Come discover the amazing plants that call Ridgway home! View on site | Email this event",
    pubDate: "2026-07-26T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ridgway State Park",
    imageUrl: "https://localist-images.azureedge.net/photos/53454865677544/huge/fbccc2afb1a322aaeaad2f318da97530087f41a5.jpg"
  },
  {
    title: "Ridgway Rocks",
    link: "https://events.ourayridgwayevents.com/event/ridgway-rocks-1818",
    description: "Live music in Town Park. Old Man Polly, Organtic, and PSYLO. View on site | Email this event",
    pubDate: "2026-07-26T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Hartwell Park",
    imageUrl: "https://localist-images.azureedge.net/photos/52745952398222/huge/28560e07fb06ec4aa6d7c068a8219aa5945f2d93.jpg"
  },
  {
    title: "The Courtyard at 610 Presents: Hiroya Tsukamoto at The Courtyard",
    link: "https://events.ourayridgwayevents.com/event/the-courtyard-at-610-presents-hiroya-tsukamoto",
    description: "Gates: 7 (behind the 610 Gallery and Sherbino) || Show: 7:30 || $20 – Online / $25 – At Door General Admission Seating || Limited Bar The Courtyard at 610 is a unique little venue behind our gallery space, the 610 Arts Collective, on Clinton St. The entrance is through the alleyway between N Cora St. and N Laura St behind the gallery and The Sherbino Theater. Hiroya Tsukamoto is a one-of-a-kind composer, guitarist, and storyteller from Kyoto, Japan. He began playing the five-string banjo when he was thirteen, and took up the guitar shortly after. Eclectic, immersive, and mesmerizing, internationally acclaimed guitarist and songwriter Hiroya Tsukamoto takes us on an innovative, impressionistic journey filled with earthy, organic soundscapes that impart a mood of peace and tranquility. Hiroya is a two-time 2nd-place winner of the International Fingerstyle Guitar Championship in 2018 and 2022. “…chops, passion, and warmth. …",
    pubDate: "2026-07-26T01:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "610",
    imageUrl: "https://localist-images.azureedge.net/photos/52994152710848/huge/60f4db1fcb885114d605529698b88efd2744461c.jpg"
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
    endDate: "2026-08-25",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Community Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52092171660517/huge/0e628304026c92db25e8df01849c962ac902a3b4.jpg"
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
    title: "Love’s Labors Lost: Theatre @ the Wright",
    link: "https://events.ourayridgwayevents.com/event/loves-labours-lost-theatre-the-wright",
    description: "Love’s Labors Lost: Theatre @ the Wright Presented by UpstART Theatre WHEN? Thursday, July 30 Doors at 7:00 pm • Show at 7:30 pm Friday, July 31 Doors at 7:00 pm • Show at 7:30 pm Saturday, August 1 Doors at 7:00 pm • Show at 7:30 pm Sunday, August 2 — Matinee Doors at 3:30 pm • Show at 4:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE SHOW Love, language, mistaken identities, and youthful ambition collide in William Shakespeare’s Love’s Labors Lost, one of the Bard’s most playful and fast-moving comedies. When a king and his companions swear off romance in pursuit of scholarship and discipline, their noble intentions are quickly tested by the arrival of a group of equally clever and charismatic visitors. What follows is a whirlwind of wit, flirtation, misunderstandings, and delightfully complicated attempts at self-control. …",
    pubDate: "2026-07-31T01:30:00.000Z",
    endDate: "2026-08-02",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "The Wright Opera House",
    imageUrl: "https://localist-images.azureedge.net/photos/52932868603734/huge/c25eaff592f203a10ece3ae8a5f406fca147da0f.jpg"
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
    title: "The 42nd Annual Ridgway Rendezvous Arts Festival",
    link: "https://events.ourayridgwayevents.com/event/the-42nd-annual-ridgway-rendezvous-arts-festival",
    description: "Ridgway Rendezvous Arts Festival (42nd Annual) Saturday: 9 AM – 5 PM | Sunday: 10 AM – 4 PM | Ridgway Town Park Free Admission Celebrating its 42nd year, the Ridgway Rendezvous Arts Festival is a beloved summer tradition in southwest Colorado. Hosted by Weehawken Creative Arts, this highly regarded juried festival is known for exceptional craftsmanship, original design, and high-quality handmade work not easily found elsewhere in the region. Artists consistently call it “one of the best shows of the year,” citing strong sales and a welcoming, well-organized atmosphere. Set in the heart of Ridgway along the scenic Million Dollar Highway, the festival attracts an engaged audience of collectors, second homeowners, and visitors from across the country—and coincides with the nearby Telluride Jazz Festival, expanding its reach and energy. Enjoy live music throughout the day both days, featuring a diverse lineup of talented regional and touring musicians. …",
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
    title: "Zumba Fitness with Tamra",
    link: "https://events.ourayridgwayevents.com/event/zumba-fitness-with-tamra",
    description: "Zumba is a high-energy, Latin-inspired dance fitness program designed as a fun, accessible workout for all skill levels. It combines fast and slow rhythms with aerobic, interval-training moves to improve cardiovascular health, burn calories, and tone muscles. Classes are often described as a \"fitness party\" that reduces stress. All levels of fitness and dance experience are welcome. Classes are $12 to drop in. Class packs are available for purchase (5 classes for $50, 10 classes for $95). For more information, check out the instructor's website: https://zumba.com/p/zumbafitnesswithTamra or email Tamra at tamra.nichols@icloud.com . For updated class information, including last-minute changes or cancellations, follow the instructor's Zumba Facebook page at https://www.facebook.com/ZumbaFitnesswithTamra . View on site | Email this event",
    pubDate: "2026-08-12T23:30:00.000Z",
    endDate: "2026-09-09",
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
    description: "Watch the Hardrock mining competition and learn the history of mining in Ouray. View on site | Email this event",
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
    title: "Creative Space: Artist Salon Series",
    link: "https://events.ourayridgwayevents.com/event/creative-space-artist-salon-series",
    description: "Join us for the second CREATIVE SPACE artist salon on WEDNESDAY JUNE 24! We will enjoy an artist talk by local painter, Karen Keene Day, during the run of her exhibition in the Decker Room. Stay and socialize with creatives afterward! Please bring some food/drinks to share! All are welcome! Inspired by our vibrant creative community, these monthly events are intended to build creative community across disciplines! With a different focus each time, we will keep things interesting and engaging! Anyone is welcome to attend, and creatives of all kinds are invited. We welcome your ideas for future events! Bring something to eat or drink to share! To learn more, ask questions, submit ideas, reach out to the Decker Room Coordinator, Arielle. decker@ridgwayfuse.org 872-772-9484 View on site | Email this event",
    pubDate: "2026-08-27T00:00:00.000Z",
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
    endDate: "2026-09-15",
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
  }
];

const NORWOOD_EVENTS = [
  {
    title: "NWC Meeting",
    link: "https://www.norwoodtown.com/2026-07-14-nwc-meeting",
    description: "",
    pubDate: "2026-07-14T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Board Of Trustees Special Meeting",
    link: "https://www.norwoodtown.com/2026-07-15-board-of-trustees-special-meeting",
    description: "",
    pubDate: "2026-07-15T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
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
    link: "https://www.norwoodtown.com/2026-08-08-music-on-the-mesa-the-burroughs",
    description: "",
    pubDate: "2026-08-08T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
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
    title: "Mind Blown Telluride",
    link: "https://townofmountainvillage.com/explore/events/all-events/mind-blown-telluride-7/",
    description: "Magician Ty Gallenbeck presents Mind Blown Telluride. Since 2016 this highly acclaimed show has become a favorite of locals, tourist and celebrities.",
    pubDate: "2026-07-18T12:00:00.000Z",
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
    pubDate: "2026-07-19T12:00:00.000Z",
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
    pubDate: "2026-07-19T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48025/untitled_11_x_17_in_2200_x_1237_px_1800_x_900_px.jpg"
  },
  {
    title: "HAHA Little Giggles",
    link: "https://townofmountainvillage.com/explore/events/all-events/haha-little-giggles/",
    description: "Sunday morning provides access to the entire HAHA Experience for families, children and teens ages 3-17, who must be accompanied by a Little Giggles ticketed",
    pubDate: "2026-07-19T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49341/haha_sunday_photo_76.jpeg"
  },
  {
    title: "Sunday Rehab at Alloy Kitchen",
    link: "https://townofmountainvillage.com/explore/events/all-events/sunday-rehab-at-alloy-kitchen/",
    description: "Sundays are for recovery, Mountain Village style. Sunday Rehab at Mountain Lodge's Alloy Kitchen runs each Sunday through October 11, 2026,",
    pubDate: "2026-07-19T12:00:00.000Z",
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
    pubDate: "2026-07-20T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49136/bike-and-brewery-tour-1800x900.jpg"
  },
  {
    title: "Market on the Plaza",
    link: "https://townofmountainvillage.com/explore/events/all-events/market-on-the-plaza/",
    description: "Mountain Village’s pedestrian-friendly Heritage Plaza comes alive with tents each Wednesday, June 10-September 9, 2026 with vendors selling farm-",
    pubDate: "2026-07-22T12:00:00.000Z",
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
    pubDate: "2026-07-22T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49138/wine-and-wickets-1800x900.jpg"
  },
  {
    title: "Party in the Park",
    link: "https://townofmountainvillage.com/explore/events/all-events/party-in-the-park/",
    description: "The Telluride Mountain Club invites the community to join its Annual Party in the Park at Telluride Town Park. The event supports the club's annual trail",
    pubDate: "2026-07-23T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49382/tmtc_park_party_insta_6_22.jpg"
  },
  {
    title: "Music on the Green Presents Jon Stickley Trio",
    link: "https://townofmountainvillage.com/explore/events/all-events/music-on-the-green-presents-jon-stickley-trio-1/",
    description: "Beyond the Groove Productions and the Telluride Mountain Village Owners Association (TMVOA) present Music on the Green with Jon Stickley Trio on Friday,",
    pubDate: "2026-07-24T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/48855/jon_stickley_trio_1800x900px.png"
  },
  {
    title: "Mind Blown Telluride",
    link: "https://townofmountainvillage.com/explore/events/all-events/mind-blown-telluride-7/",
    description: "Magician Ty Gallenbeck presents Mind Blown Telluride. Since 2016 this highly acclaimed show has become a favorite of locals, tourist and celebrities.",
    pubDate: "2026-07-25T12:00:00.000Z",
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
    title: "Movies Under the Stars",
    link: "https://townofmountainvillage.com/explore/events/all-events/movies-under-the-stars/",
    description: "Movies Under the Stars returns to the Conference Center Plaza this summer, running every Saturday at dusk from June 13 through August 15. New this year,",
    pubDate: "2026-08-01T12:00:00.000Z",
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
    title: "Town Talk: single molecule views of Nature’s nanomachines",
    link: "https://townofmountainvillage.com/explore/events/all-events/single-molecule-views-of-natures-nanomachines/",
    description: "This Town Talk will be presented by Taekjip (TJ) Ha, Harvard Medical School, Boston Children’s Hospital, Howard Hughes Medical School.",
    pubDate: "2026-08-04T12:00:00.000Z",
    source: "mv",
    sourceLabel: "Mountain Village",
    category: "Community Event",
    location: "Mountain Village, CO",
    imageUrl: "https://townofmountainvillage.com/site/assets/files/49100/tt_logo_1048x802_a.png"
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
    link: "https://www.telluride.com/event/music-on-the-mesa/",
    description: "Music on the Mesa is a FREE outdoor concert series presented two Saturdays a summer by Norwood Park & Rec District, …",
    pubDate: "2026-06-13",
    endDate: "2026-08-08",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
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
    title: "Village Film Nights",
    link: "https://www.telluride.com/event/village-film-nights/",
    description: "The Telluride Film Festival, in collaboration with the Town of Mountain Village, the Telluride Conference Center, and …",
    pubDate: "2026-07-05",
    endDate: "2026-07-20",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/58512/vfn-theinvite-_banner1800x900_870x435.800x533.webp"
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
    title: "History at the Movies",
    link: "https://www.telluride.com/event/history-at-the-movies/",
    description: "Join the Telluride Historical Museum for History at the Movies! In celebration of our state and National …",
    pubDate: "2026-07-07",
    endDate: "2026-07-21",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62987/screenshot_2026-07-01_at_12_43_41_pm.800x533.webp"
  },
  {
    title: "Tom Gullikson Tennis Clinic",
    link: "https://www.telluride.com/event/tom-gullikson-tennis-clinic/",
    description: "Join the Gully Tennis Clinic @ TRC! Tom is a decorated Tennis coach and playing professional. Come out and enjoy some …",
    pubDate: "2026-07-11",
    endDate: "2026-07-20",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62315/img_5733.800x533.webp"
  },
  {
    title: "Ah Haa HAHA",
    link: "https://www.telluride.com/event/ah-haa-haha/",
    description: "The HAHA is a community art event unlike you’ve ever experienced! \n\nHAHA is the immersive art installation event of …",
    pubDate: "2026-07-17",
    endDate: "2026-07-20",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/44841/screenshot_2023-03-23_at_4_39_19_pm.800x533.webp"
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
    title: "The Saint Cecilia",
    link: "https://www.telluride.com/event/the-saint-cecilia/",
    description: "From the outside, The Saint Cecilia is a collection of emotional images, love, art, power, passion, lust and verve. …",
    pubDate: "2026-07-17",
    endDate: "2026-07-19",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/60544/the_saint_cecelia.800x533.webp"
  },
  {
    title: "Randy Houser Benefit Concert With Special Guest Jamey Johnson",
    link: "https://www.telluride.com/event/randy-houser-benefit-concert/",
    description: "Great music, for a great cause. The Telluride Foundation, in partnership with The Alpine Club, is proud to announce the …",
    pubDate: "2026-07-17",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62393/randy_houser_calendar_2200x1237_1.800x533.webp"
  },
  {
    title: "Young and Dead",
    link: "https://www.telluride.com/event/young-and-dead/",
    description: "Young and Dead is an exciting culmination of musicians in their early 20's from Boulder, Colorado. With a unique …",
    pubDate: "2026-07-19",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62657/screenshot_2026-06-01_at_3_22_58_pm.800x533.webp"
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
    title: "Josh Abbott",
    link: "https://www.telluride.com/event/josh-abbott/",
    description: "Spend an unforgettable evening with Josh Abbott, the acclaimed Texas singer-songwriter and frontman of the Josh Abbott …",
    pubDate: "2026-07-22",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62967/jab_bbt_022826-103.800x533.webp"
  },
  {
    title: "Telluride Mountain Club’s Party in the Park",
    link: "https://www.telluride.com/event/telluride-mountain-clubs-party-in-the-park/",
    description: "TMtC's annual Party in the Park is happening July 23 at Telluride Town Park! This community celebration supports our …",
    pubDate: "2026-07-23",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48498/poster_board_img_0806.800x533.webp"
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
    title: "Hike Into History: Keystone Gorge",
    link: "https://www.telluride.com/event/hike-into-history-keystone-gorge/",
    description: "Join the Telluride Museum for Power of Place: Hike into History! Ted Wilson, President of the San Miguel County …",
    pubDate: "2026-07-23",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/63085/screenshot_2026-07-16_at_11_56_27_am.800x533.webp"
  },
  {
    title: "Summer Spectacular: The Music Man",
    link: "https://www.telluride.com/event/summer-spectacular-the-music-man/",
    description: "SAF’s YPT Summer Spectacular program starts on a Monday, and by Friday, these summer campers have learned an entire …",
    pubDate: "2026-07-24",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62637/ypt-summer-music-man.800x533.webp"
  },
  {
    title: "Box Canyon Races",
    link: "https://www.telluride.com/event/box-canyon-races/",
    description: "Come run in the high alpine! Sign up for the Bridal Veil 30k or the Bear Creek 10mi races for an exhilarating and …",
    pubDate: "2026-07-25",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/48231/boxcanyon-246_1.800x533.webp"
  },
  {
    title: "High Country Hustle",
    link: "https://www.telluride.com/event/high-country-hustle/",
    description: "High Country Hustle is a bluegrass band from Durango, Colorado, formed in 2017 and known for their high-energy …",
    pubDate: "2026-07-25",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62174/screenshot_2026-04-09_at_2_05_25_pm.800x533.webp"
  },
  {
    title: "The Nugget: A Telluride Restoration Story",
    link: "https://www.telluride.com/event/the-nugget-a-telluride-restoration-story/",
    description: "The Nugget: A Telluride Restoration Story, a documentary short film presented by former Nugget Building owners Katrine …",
    pubDate: "2026-07-25",
    source: "telluride-com",
    sourceLabel: "Telluride.com",
    category: "Community Event",
    location: "Telluride, CO",
    imageUrl: "https://www.telluride.com/site/assets/files/62645/film-the-nugget-a-telluride-restoration-story-and-a-benefit-for-the-telluride-historical-museum.800x533.webp"
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
    title: "Name Change Petition -- Kendal Dawn Oakleaf Smith (Case 26C11)",
    entity: "San Miguel County Court",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "San Miguel County Court published notice of a petition filed April 28, 2026 to change the name of Kendal Dawn Oakleaf Smith to Kendal Dawn Oakleaf Smith. The petition was filed with the San Miguel County Court.",
    deadline: "",
    expires: "2026-07-20",
    dates: "5/21",
    papers: ["ttimes_0521"],
    url: "https://www.telluridenews.com/news/legals/article_d3659378-b06b-4e27-9b53-ec57d83a4b86.html",
    address: "San Miguel County",
    noticeKey: "name-change-26c11",
    caseNumber: "26C11"
  },
  {
    title: "Semi-Annual Treasurer Report -- July-December 2025",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "assessor",
    icon: "💰",
    iconClass: "type-tax",
    type: "Tax & Finance",
    filterTag: "tax-finance",
    summary: "San Miguel County Treasurer's Semi-Annual Report for July-December 2025 is prepared and available for viewing at www.sanmiguelcountyco.gov/661/Agendas-and-Minutes under the Wednesday, May 6, 2026/Notice.",
    deadline: "",
    expires: "2026-07-20",
    dates: "5/21",
    papers: ["ttimes_0521"],
    url: "https://www.telluridenews.com/news/legals/article_d3659378-b06b-4e27-9b53-ec57d83a4b86.html",
    address: "San Miguel County",
    noticeKey: "treasurer-report-2025-jul-dec"
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
    title: "RFP -- Custodial Services for Telluride School District R-1",
    entity: "Telluride School District R-1",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "Telluride School District R-1 is requesting proposals from vendors to provide year-round custodial services at Telluride Elementary School, Telluride Intermediate School, and Telluride Middle/High School. Services include trash removal, vacuuming, floor scrubbing, disinfecting, and window cleaning; vendors may bid on all or part of the contract. Requests for full specifications must be received by 4:00 PM on July 14, 2026, and complete proposals are due by 4:00 PM on July 21, 2026.",
    deadline: "2026-07-21",
    expires: "2026-07-21",
    dates: "7/2",
    papers: ["ttimes_0702"],
    url: "https://www.telluridenews.com/news/legals/article_d2ca136e-7993-4d52-abfc-0e8f243974dd.html",
    address: "Telluride Elementary School, Telluride Intermediate School, and Telluride Middle/High School, Telluride, Colorado",
    noticeKey: "COL-000180-tsd-custodial-rfp"
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
    title: "RFP -- Custodial Services for School Facilities (COL-000178)",
    entity: "Telluride School District R-1",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "Telluride School District R-1 is soliciting proposals for custodial services at Telluride Elementary School, Telluride Intermediate School, and Telluride Middle/High School. The contract is year-round and covers trash removal, vacuuming, floor scrubbing, disinfecting, and window cleaning; bidders may bid on all or portions of the work. Vendors must request full specifications by email by 4:00 PM on July 14, 2026, and submit completed proposals by 4:00 PM on July 21, 2026.",
    deadline: "2026-07-21T16:00:00",
    expires: "2026-07-21",
    dates: "7/9",
    papers: ["ttimes_0709"],
    url: "https://www.telluridenews.com/news/legals/article_c7bd6279-4a8b-494b-ac96-ee9c16f0bcd1.html",
    address: "Telluride Elementary School, Telluride Intermediate School, and Telluride Middle/High School, Telluride, CO",
    noticeKey: "rfp-tsd-custodial-2026"
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
  }
];

const HOUSING_LISTINGS = [
  {
    title: "🏠 Element 52 SW-102",
    type: "deed-sale",
    address: "398 South Davis Street, Unit SW-102, Telluride, CO 81435",
    lat: 37.9281,
    lng: -107.8145,
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
    lat: 37.9352,
    lng: -107.8138,
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
    lat: 37.9352,
    lng: -107.8138,
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
    note: "Deed-restricted room rental in shared 2BR condo. Contact SMRHA for eligibility."
  },
  {
    title: "Village Court Apartments — Waitlist",
    type: "deed-rental",
    address: "455 Mountain Village Blvd, Mountain Village, CO 81435",
    lat: 37.9325,
    lng: -107.8497,
    beds: "Studio–3 Bedroom",
    price: "Income-based (deed-restricted)",
    source: "Town of Mountain Village",
    contact: { phone: "(970) 729-3419", email: "" },
    url: "https://townofmountainvillage.com/community/housing/village-court-apartments/",
    note: "Waitlist is currently capped — not accepting new applications. Check back periodically."
  },
  {
    title: "Shandoka Townhomes — Waitlist",
    type: "deed-rental",
    address: "820 Black Bear Rd, Telluride, CO 81435",
    lat: 37.9363,
    lng: -107.8198,
    beds: "1–3 Bedroom",
    price: "Income-based (deed-restricted)",
    source: "Town of Telluride",
    contact: { phone: "(970) 728-4025", email: "housing@telluride.gov" },
    url: "https://www.telluride.gov/745/Town-Owned-Rental-Properties",
    note: "Waitlist-based. Town employee priority. Apply through the Town of Telluride."
  },
  {
    title: "Virginia Placer Apartments — Waitlist",
    type: "deed-rental",
    address: "Virginia Placer, Telluride, CO 81435",
    lat: 37.938,
    lng: -107.826,
    beds: "Studio–2 Bedroom",
    price: "Income-based (deed-restricted)",
    source: "Town of Telluride",
    contact: { phone: "(970) 728-4025", email: "housing@telluride.gov" },
    url: "https://www.telluride.gov/745/Town-Owned-Rental-Properties",
    note: "Waitlist-based. Apply through the Town of Telluride Rental Housing division."
  },
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
    date: "July 21, 2026",
    title: "Telluride Housing Authority",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8289",
    hasAgenda: true,
    location: "Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "July 21, 2026",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8040",
    hasAgenda: true,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "July 23, 2026",
    title: "Planning & Zoning Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8100",
    hasAgenda: true,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "July 27, 2026",
    title: "Special Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8294",
    hasAgenda: true,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "August 5, 2026",
    title: "Telluride Housing Authority Subcommittee",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8162",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "August 6, 2026",
    title: "Town Council Retreat",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8050",
    hasAgenda: false,
    location: "Hybrid/Public Works Conference Room 1370 W Black Bear Rd. Telluride, CO 81435",
    time: ""
  },
  {
    date: "August 11, 2026",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8041",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "August 27, 2026",
    title: "Planning & Zoning Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8102",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "September 1, 2026",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8042",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "September 2, 2026",
    title: "Telluride Housing Authority Subcommittee",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8163",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "September 10, 2026",
    title: "Town Council Budget",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8052",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "September 22, 2026",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8043",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "September 24, 2026",
    title: "Planning & Zoning Commission",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8104",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "October 1, 2026",
    title: "Town Council Budget",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8053",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "October 6, 2026",
    title: "Town Council",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8044",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
  },
  {
    date: "October 7, 2026",
    title: "Telluride Housing Authority Subcommittee",
    agendaUrl: "https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=8164",
    hasAgenda: false,
    location: "Hybrid/Rebekah Hall, 113 W Columbia Ave",
    time: ""
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
    const hasAgenda = !!agendaLink;
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
      agendaLink
    };
  });

  // Other Telluride bodies the bot surfaces from CivicWeb. Rendered generically
  // (no HARC-specific time/location defaults); summary + board-token matching is
  // handled by getMeetingSummary via meetingBoardToken.
  const list = (typeof TELLURIDE_BOARD_MEETINGS !== 'undefined' && Array.isArray(TELLURIDE_BOARD_MEETINGS)) ? TELLURIDE_BOARD_MEETINGS : [];
  const board = list.map(m => {
    const agendaLink = m.agendaUrl || '';
    return {
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
