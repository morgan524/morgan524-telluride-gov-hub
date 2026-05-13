/* ══════════════════════════════════════════════════════
   GOV HUB — Main Application Logic
   Meetings, News, Events, Entities, Data, Rendering
   ══════════════════════════════════════════════════════ */

// ── Configuration ──
const CODETABS_PROXY = 'https://api.codetabs.com/v1/proxy/?quest=';
const ALLORIGINS_PROXY = 'https://api.allorigins.win/raw?url=';
const RSS2JSON_PROXY = 'https://api.rss2json.com/v1/api.json?rss_url=';

// ── Telluride CivicWeb API (JSON -- returns all scheduled meetings) ──
const TELLURIDE_MEETINGS_API = 'https://telluride-co.civicweb.net/Services/MeetingsService.svc/meetings';
const TELLURIDE_MEETING_DETAIL = 'https://telluride-co.civicweb.net/Portal/MeetingInformation.aspx?Id=';

// ── County meeting calendar feed (RSS with custom XML fields) ──
const COUNTY_CALENDAR_URL = 'https://sanmiguelcountyco.gov/RSSFeed.aspx?ModID=58';

// ── News feeds ──
const NEWS_FEEDS = [
  {
    url: 'https://telluride.gov/RSSFeed.aspx?ModID=1&CID=Town-News-1',
    source: 'telluride',
    sourceLabel: 'Town of Telluride',
    category: 'Town News'
  },
  {
    url: 'https://telluride.gov/RSSFeed.aspx?ModID=1&CID=Marshals-Department-12',
    source: 'telluride',
    sourceLabel: 'Town of Telluride',
    category: "Marshal's Dept"
  },
  {
    url: 'https://sanmiguelcountyco.gov/RSSFeed.aspx?ModID=1&CID=All-newsflash.xml',
    source: 'county',
    sourceLabel: 'San Miguel County',
    category: 'News'
  },
  {
    url: 'https://sanmiguelcountyco.gov/RSSFeed.aspx?ModID=63&CID=All-0',
    source: 'county',
    sourceLabel: 'San Miguel County',
    category: 'Alert'
  },
  {
    url: 'https://telluride.gov/RSSFeed.aspx?ModID=63&CID=All-0',
    source: 'telluride',
    sourceLabel: 'Town of Telluride',
    category: 'Alert'
  }
];

// ── Utility Functions ──

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return div.textContent.trim();
}

function truncate(text, maxLen = 200) {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
}

// Parse a date string into a LOCAL-midnight Date (avoids UTC-to-Mountain off-by-one).
// Accepts "March 31, 2026", "2026-03-31", "2026-03-31T10:00:00", etc.
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

function friendlyDate(d) {
  if (!d || !(d instanceof Date) || isNaN(d)) {
    if (typeof d === 'string') d = new Date(d);
    if (!d || isNaN(d)) return '';
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((target - today) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';

  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

function fullDate(d) {
  if (!d || isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}


// Smart truncation for event card descriptions — caps text at maxWords words,
// preferring a sentence boundary, then a word boundary. Always appends " …"
// when truncated. Mirrors the helper in scripts/content-refresh.js — keep
// them in sync. Word-based (not char-based) per Morgan's spec — "150 words
// or less" applies uniformly across every event source.
function smartTruncate(text, maxWords) {
  if (!text) return text;
  const t = String(text).trim();
  const words = t.split(/\s+/);
  if (words.length <= maxWords) return t;
  const truncated = words.slice(0, maxWords).join(' ');
  // Prefer cutting at the last sentence boundary that lands ≥60% through
  // the word budget — keeps cards from ending mid-thought.
  const sentEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? ')
  );
  const minBoundary = Math.floor(truncated.length * 0.6);
  if (sentEnd > minBoundary) return truncated.slice(0, sentEnd + 1).trim() + ' …';
  return truncated.trim() + ' …';
}
const EVENT_DESC_MAX = 150;

function dateGroupKey(d) {
  if (typeof d === 'string') d = new Date(d);
  if (!d || isNaN(d)) return '9999-99-99';
  const pad = n => String(n).padStart(2, '0');
  // Belt-and-suspenders: if a raw UTC-midnight Date slips through, use UTC
  // components so we don't display the prior day in mountain time.
  const isUtcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 &&
                        d.getUTCSeconds() === 0 && d.getTime() % 86400000 === 0;
  const yr  = isUtcMidnight ? d.getUTCFullYear()  : d.getFullYear();
  const mo  = isUtcMidnight ? d.getUTCMonth()     : d.getMonth();
  const day = isUtcMidnight ? d.getUTCDate()      : d.getDate();
  return yr + '-' + pad(mo + 1) + '-' + pad(day);
}

// ══════════════════════════════════════════════════════
// ── Fetch Telluride meetings from CivicWeb JSON API ──
// ══════════════════════════════════════════════════════

async function fetchTellurideMeetings() {
  try {
    // Build date range: today through 1 year out
    const today = new Date();
    const fromDate = today.toISOString().slice(0, 10);
    const toDate = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()).toISOString().slice(0, 10);

    const apiUrl = `${TELLURIDE_MEETINGS_API}?from=${fromDate}&to=${toDate}`;

    // Try primary proxy (codetabs), then fallback to allorigins
    let data;
    try {
      const resp = await fetch(CODETABS_PROXY + encodeURIComponent(apiUrl));
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      data = await resp.json();
    } catch (primaryErr) {
      console.warn('Primary proxy failed, trying fallback:', primaryErr.message);
      const resp2 = await fetch(ALLORIGINS_PROXY + encodeURIComponent(apiUrl));
      if (!resp2.ok) throw new Error(`Fallback HTTP ${resp2.status}`);
      data = await resp2.json();
    }

    if (!Array.isArray(data)) return [];

    return data.map(m => {
      // Clean up meeting name -- remove the date suffix for cleaner display
      // e.g. "Town Council - Mar 31 2026" → "Town Council"
      const cleanName = m.Name.replace(/\s*-\s*\w{3}\s+\d{1,2}\s+\d{4}.*$/, '').trim();
      const isCanceled = /cancel/i.test(m.Name);

      return {
        title: isCanceled ? cleanName + ' -- CANCELED' : cleanName,
        link: TELLURIDE_MEETING_DETAIL + m.Id,
        description: '',
        eventDate: localDate(m.MeetingDate),
        eventDates: '',
        eventTimes: m.MeetingTime || '',
        location: m.MeetingLocation || '',
        source: 'telluride',
        sourceLabel: 'Town of Telluride',
        category: 'Meeting',
        canceled: isCanceled,
        hasAgenda: m.Published
      };
    });
  } catch (err) {
    console.warn('Telluride CivicWeb API error:', err.message);
    return [];
  }
}

// ══════════════════════════════════════════════════════════
// ── Fetch County meetings via rss2json (fast, ~0.3s) ──
// ══════════════════════════════════════════════════════════
//
// County agenda links point to CivicClerk portal pages where the actual
// agenda documents can be viewed and downloaded.
//
// TO UPDATE: Visit https://sanmiguelcoco.portal.civicclerk.com, find the
// meeting in the calendar, click it, and note the event ID from the URL
// (e.g. /event/864/files → event ID 864). Add it to COUNTY_CIVICCLERK_IDS below.

// Map: "meeting title fragment|YYYY-MM-DD" → CivicClerk event ID
// Map: event ID → specific agenda file ID (for direct agenda PDF links)
// When known, links go to /event/{eventId}/files/agenda/{agendaId} instead of /event/{eventId}/files
function getCountyAgendaLink(title, eventDate) {
  if (!eventDate) return COUNTY_CIVICCLERK_FALLBACK;
  const dateKey = eventDate.toISOString().slice(0, 10);
  // Try exact title match
  const exactKey = title + '|' + dateKey;
  let eventId = COUNTY_CIVICCLERK_IDS[exactKey];
  // Try partial match on date
  if (!eventId) {
    for (const key of Object.keys(COUNTY_CIVICCLERK_IDS)) {
      if (key.endsWith('|' + dateKey)) {
        eventId = COUNTY_CIVICCLERK_IDS[key];
        break;
      }
    }
  }
  if (!eventId) return COUNTY_CIVICCLERK_FALLBACK;
  // If we have a specific agenda file ID, link directly to it
  if (COUNTY_CIVICCLERK_AGENDA_FILES[eventId]) {
    return COUNTY_CIVICCLERK_BASE + eventId + '/files/agenda/' + COUNTY_CIVICCLERK_AGENDA_FILES[eventId];
  }
  return COUNTY_CIVICCLERK_BASE + eventId + '/files';
}

async function fetchCountyMeetings() {
  try {
    const resp = await fetch(RSS2JSON_PROXY + encodeURIComponent(COUNTY_CALENDAR_URL));
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.status !== 'ok' || !data.items) return [];

    return data.items.map(item => {
      const descText = stripHtml(item.description).replace(/\s*-?\s*Please view the agenda for the Zoom Link\.?/gi, '').trim();

      // Parse event date from description text (e.g. "March 25, 2026")
      const dateMatch = descText.match(/(\w+ \d{1,2}, \d{4})/);
      // Parse time range (e.g. "9:30 AM - 3:00 PM")
      const timeMatch = descText.match(/(\d{1,2}:\d{2}\s*[APap][Mm]\s*-\s*\d{1,2}:\d{2}\s*[APap][Mm])/);
      // Parse single time
      const singleTimeMatch = !timeMatch ? descText.match(/(\d{1,2}:\d{2}\s*[APap][Mm])/) : null;

      let eventDate = dateMatch ? localDate(dateMatch[1]) : localDate(item.pubDate);

      // County government meetings (BOCC, Planning Commission, etc.) have agendas
      // on the CivicClerk portal
      const isGovMeeting = /commissioner|planning commission|work session|board of county/i.test(item.title);
      const agendaLink = isGovMeeting ? getCountyAgendaLink(item.title, eventDate) : null;
      const isCanceled = /cancel/i.test(item.title) || /cancel/i.test(descText);
      const displayTitle = isCanceled ? (item.title || 'Untitled').replace(/\s*-?\s*cancel(l?ed)?/gi, '').trim() + ' -- CANCELED' : (item.title || 'Untitled');
      // Only show green "Agenda Posted" when we have a specific agenda link (not the fallback)
      const hasRealAgenda = isGovMeeting && !isCanceled && agendaLink && agendaLink !== COUNTY_CIVICCLERK_FALLBACK;

      return {
        title: displayTitle,
        link: item.link || '#',
        description: truncate(descText),
        eventDate,
        eventDates: dateMatch ? dateMatch[1] : '',
        eventTimes: timeMatch ? timeMatch[1] : (singleTimeMatch ? singleTimeMatch[1] : ''),
        location: '',
        source: 'county',
        sourceLabel: 'San Miguel County',
        category: /board/i.test(displayTitle || '') ? 'Board Meeting' : 'Meeting',
        canceled: isCanceled,
        hasAgenda: hasRealAgenda,
        agendaLink: isCanceled ? null : agendaLink
      };
    });
  } catch (err) {
    console.warn('County calendar fetch error:', err.message);
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════════
// ── San Miguel County cached meetings (supplement the RSS feed) ──
// ══════════════════════════════════════════════════════════════════════
//
// The County RSS feed (RSSFeed.aspx?ModID=58) only returns ~2 weeks of items
// and mixes in community events. This cache provides the known recurring
// government meeting schedule so future meetings always appear.
//
// BOCC meets most Wednesdays 9:30 AM - 3:00 PM (Telluride or Norwood).
// Planning Commission meets monthly (varies). Joint work sessions periodic.
//
// TO UPDATE: Visit https://sanmiguelcoco.portal.civicclerk.com or
// https://sanmiguelcountyco.gov/calendar.aspx and update dates below.
// Update COUNTY_CACHE_DATE so you know when it was last refreshed.

function getCountyCachedMeetings() {
  return COUNTY_CACHED_DATA.map(m => {
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
}

// Merge RSS feed results with cached data, preferring RSS (live) over cache
// when both have the same meeting on the same date.
function mergeCountyMeetings(rssMeetings, cachedMeetings) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Only keep future cached meetings
  const futureCached = cachedMeetings.filter(m => m.eventDate >= now);

  // Build a set of dates that have cached government meetings (our curated data)
  const cachedDateKeys = new Set();
  futureCached.forEach(m => {
    cachedDateKeys.add(m.eventDate.toISOString().slice(0, 10));
  });

  // For government-type RSS meetings, remove any that fall on a date we have
  // cached data for -- cached data is manually curated and more up-to-date
  const filteredRss = rssMeetings.filter(m => {
    const dateKey = m.eventDate.toISOString().slice(0, 10);
    const isGov = /commissioner|planning commission|work session|board of county|joint.*session|housing code update|\bssr\b/i.test(m.title || '');
    // Keep non-gov RSS items always; for gov items, only keep if no cached entry for that date
    return !isGov || !cachedDateKeys.has(dateKey);
  });

  // Combine: filtered RSS (non-duplicate) + all future cached
  return [...filteredRss, ...futureCached];
}

// ══════════════════════════════════════════════════════════
// ── SMART Transit meetings (cached data, instant load) ──
// ══════════════════════════════════════════════════════════
//
// SMART meetings are cached directly in this file for instant loading.
// Their board meets ~monthly and the website has no API, so real-time
// scraping is too slow and unreliable.
//
// TO UPDATE: Visit https://smarttelluride.colorado.gov/board-meetings,
// note any new/changed meetings, and edit the SMART_CACHED_DATA array below.
// Update SMART_CACHE_DATE so you know when it was last refreshed.

// ══════════════════════════════════════════════════════════════════
// ── Mountain Village cached meetings (same pattern as SMART) ──
// ══════════════════════════════════════════════════════════════════
//
// Mountain Village website is behind Cloudflare and has no API.
// Town Council meets the 3rd Thursday of most months; DRB meets
// the 1st Thursday of most months.
//
// TO UPDATE: Visit https://townofmountainvillage.com/government/town-council/town-council/
// and https://townofmountainvillage.com/business/planning/design-review-board/
// Note any new/changed meetings and edit MV_CACHED_DATA below.

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
      agendaLink: m.agendaUrl || null
    };
  });
}

// ══════════════════════════════════════════════════════════════════════
// ── Telluride School District R-1 cached meetings (same pattern) ──
// ══════════════════════════════════════════════════════════════════════
//
// School Board meets monthly: Work Session (Monday 3:30 PM) and
// Monthly Meeting (Tuesday 5:15 PM), typically the 3rd week.
//
// TO UPDATE: Visit https://www.tellurideschool.org/agendasandminutes
// Note any new/changed meetings and edit SCHOOL_CACHED_DATA below.

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
        // Build a short title: strip common "Board of Education " prefix, join with " & "
        const shorten = t => t.replace(/^Board of Education\s+/i, '').replace(/\s*--\s*Special Meeting$/i, '');
        const combinedTitle = 'Board of Education ' + shorten(earlier.title) + ' & ' + shorten(later.title);
        const combinedTime = aTime && bTime ? aTime + ' & ' + bTime : (aTime || bTime);
        merged.push(Object.assign({}, earlier, {
          title: combinedTitle,
          link: combinedLink,
          eventTimes: combinedTime,
          hasAgenda: hasAgendaCombined
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

// ══════════════════════════════════════════════════════════════════
// ── Telluride Fire Protection District cached meetings ──
// ══════════════════════════════════════════════════════════════════
//
// Fire District Board of Directors meets monthly, typically the
// 3rd Tuesday at 5:30 PM, 131 W Columbia Ave.
//
// TO UPDATE: Visit https://www.telluridefire.com/board-meetings
// Note any new/changed meetings and edit FIRE_CACHED_DATA below.

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
      hasAgenda
    };
  });
}

// ══════════════════════════════════════════════════════════════════════
// ── Telluride Hospital District / Medical Center cached meetings ──
// ══════════════════════════════════════════════════════════════════════
//
// Regular Board meetings: 4th Thursday, 8:30 AM at 333 W Colorado Ave
// (2nd Floor) and Zoom. Special meetings scheduled as needed.
//
// TO UPDATE: Visit https://www.tellmed.org/board-meetings
// Note any new/changed meetings and edit MED_CACHED_DATA below.

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
      hasAgenda
    };
  });
}

// ══════════════════════════════════════════════════════════════════
// ── Town of Norwood cached meetings (same pattern as SMART/MV) ──
// ══════════════════════════════════════════════════════════════════
//
// Norwood's website (Streamline CMS) has no API or RSS feed, so meetings
// are cached directly. They have 4 boards:
//   - Board of Trustees: 2nd Tuesday of each month
//   - Planning & Zoning Commission: meets as needed
//   - Water Commission: 2nd Tuesday + occasional work sessions
//   - Sanitation District: monthly, around the 12th
//
// TO UPDATE: Visit https://www.norwoodtown.com/governance and check each
// board's meeting page. Edit NORWOOD_CACHED_DATA below and update NORWOOD_CACHE_DATE.

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

// ══════════════════════════════════════════════════════════════
// ── Town of Ophir (cached) ──
// ══════════════════════════════════════════════════════════════
//
// Ophir uses a Drupal CMS -- no API/RSS available.
// Data is manually cached from:
//   - General Assembly: 3rd Tuesday of each month
//   - Planning & Zoning: 1st Thursday of each month (actual dates vary)
//
// TO UPDATE: Visit https://townofophir.colorado.gov/general-assembly-2
// and https://townofophir.colorado.gov/planning-and-zoning
// Edit OPHIR_CACHED_DATA below and update OPHIR_CACHE_DATE.

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

// ══════════════════════════════════════════════════════════════
// ── Telluride Regional Airport Authority (TRAA) ──
// ══════════════════════════════════════════════════════════════
// Source: https://tellurideairport.com/board-meeting-schedule-2026/
// 6 regular meetings per year, 3rd Thursday @ 12:00 PM
// Terminal Observation Lounge, Telluride Regional Airport
// Edit AIRPORT_CACHED_DATA below and update AIRPORT_CACHE_DATE.

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

// ══════════════════════════════════════════════════════════════════
// ── Ridgway cached meetings (instant load fallback) ──
// ══════════════════════════════════════════════════════════════════
//
// Ridgway Town Council meetings are primarily sourced from the Localist
// API (ourayridgwayevents.com) via fetchOurayRidgwayEvents(), which runs
// through the news pipeline and arrives ~1-2s after page load.
//
// RIDGWAY_CACHED_DATA provides an instant-load baseline so Ridgway cards
// are visible immediately. When the Localist data resolves, the oray→ridgway
// re-tag logic in newsPromise.then() replaces these cached entries (it
// filters source='ridgway' before reinserting, so no duplicates).
//
// TO UPDATE: Visit https://townofridgway.colorado.gov/i-want-to/ridgway-town-council
// note upcoming meetings, and edit RIDGWAY_CACHED_DATA in gov-data.js.
// Update RIDGWAY_CACHE_DATE when you do.

function getRidgwayMeetings() {
  if (typeof RIDGWAY_CACHED_DATA === 'undefined') return [];
  return RIDGWAY_CACHED_DATA.map(m => {
    const eventDate = localDate(m.date);
    const hasAgenda = !!m.agendaUrl;
    return {
      title: m.title,
      link: m.agendaUrl || RIDGWAY_COUNCIL_URL,
      description: m.note || '',
      eventDate,
      eventDates: '',
      eventTimes: m.time || '6:00 PM',
      location: m.location || 'Ridgway Town Hall, 201 N Railroad St, Ridgway, CO',
      source: 'ridgway',
      sourceLabel: 'Ridgway',
      category: 'Meeting',
      canceled: false,
      hasAgenda,
      agendaLink: m.agendaUrl || null
    };
  });
}

// ══════════════════════════════════════════════════════════════
// ── Meeting Topic Summaries — Hybrid: Claude AI + Manual Fallback ──
// ══════════════════════════════════════════════════════════════
//
// ARCHITECTURE:
//   1. On page load, fetch all cached AI summaries from the Cloud Function
//      endpoint (backed by Firestore). These are generated by Claude and
//      stored server-side so no API key is ever in the browser.
//   2. If the Cloud Function is unreachable or a specific meeting has no
//      AI summary yet, fall back to the MANUAL_SUMMARIES object below.
//   3. AI summaries include shortSummary (card text), topics (bullets),
//      and optional whyItMatters (context paragraph).
//
// The manual fallback ensures the site never shows blank cards even if
// the backend is down or a new meeting hasn't been processed yet.
//
// ── Cloud Function endpoint (set after deployment) ──
// Replace with your actual Cloud Functions URL after deploying:
// ── AI summary cache (populated from Firestore via Cloud Function) ──
let AI_SUMMARIES = {};       // { "source|date|title": { shortSummary, topics, whyItMatters } }
let AI_SUMMARIES_LOADED = false;
let AI_SUMMARIES_LOADING = false;

// ── Load AI summaries from Cloud Function on page init ──
async function loadAISummaries() {
  if (AI_SUMMARIES_LOADING || AI_SUMMARIES_LOADED) return;
  AI_SUMMARIES_LOADING = true;
  try {
    const resp = await fetch(GOVHUB_FUNCTIONS_BASE + '/getSummaries?days=60');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    AI_SUMMARIES = data.summaries || {};
    AI_SUMMARIES_LOADED = true;
    // AI summaries loaded
    // Re-render meetings to show AI summaries
    if (typeof renderMeetingsWithTopic === 'function') renderMeetingsWithTopic();
  } catch (err) {
    console.warn('AI summary fetch failed (using manual fallback):', err.message);
    AI_SUMMARIES_LOADED = true; // mark loaded so we don't retry endlessly
  } finally {
    AI_SUMMARIES_LOADING = false;
  }
}

// ── Manual/fallback summaries (preserved from original) ──
// Last updated: 2026-04-03T12:00 (automated scan — Town Council confirmed Apr 28 (was ~Apr 21); new THA meetings Apr 23/24/28 discovered; Election Commission Apr 29 new; Parks & Rec rescheduled to Apr 29; Liquor Licensing Apr 23 new; School District Special Meeting Apr 20 added to cache; HARC Apr 15 Published=true, summary current; SMRHA Apr 13 1pm Zoom confirmed; no new agendas posted for BOCC Apr 22/29, SMART Apr 9, MV Council Apr 23, School Apr 20/27/28, Fire ~Apr 21, Med Apr 23; BOCC Apr 8 work session event 986 — JS portal, no agenda visible yet)
const MANUAL_SUMMARIES = {
  "telluride|2026-04-15|Historic & Architectural Review Commission":
    "PUBLIC HEARING: 238 N Pine St (Lot 18B) — small-scale demolition of non-rated THAS structure + new construction (950–2,500 sq ft) + repositioning of THAS secondary structure (continued from Feb 18) · 238 N Pine St (Lot 18A) — small-scale demolition + new construction (continued from Feb 18) · WORK SESSION: 208 S Fir St — large-scale mixed-use replacement structure (5,000+ sq ft, Commercial Zone, NIBA LLC) · Colorado Wildfire Resiliency Code work session · Community Engagement — Historic Preservation discussion"
};

// ── Unified summary lookup: AI first, then manual fallback ──
// Reject AI summaries that are error/placeholder text rather than real agenda content
function isBadSummary(text) {
  if (!text) return false;
  if (SUMMARY_REJECT_PATTERNS.some(pat => pat.test(text))) return true;
  // Long single-sentence text about the agenda itself (not topic list)
  if (text.length > 120 && !text.includes(' · ') && /\b(agenda|page|text|content|appears|navigation)\b/i.test(text)) return true;
  return false;
}

function getMeetingSummary(item) {
  if (!item.eventDate) return '';
  const dateKey = item.eventDate.toISOString().slice(0, 10);
  const cleanTitle = item.title.replace(/ -- CANCELED$/, '');
  const exactKey = item.source + '|' + dateKey + '|' + cleanTitle;

  // 1. Check AI summaries (from Firestore via Cloud Function)
  if (AI_SUMMARIES[exactKey] && AI_SUMMARIES[exactKey].shortSummary) {
    const s = AI_SUMMARIES[exactKey].shortSummary;
    if (isBadSummary(s)) return '';
    return s;
  }

  // 2. Check manual/fallback summaries
  if (MANUAL_SUMMARIES[exactKey]) return MANUAL_SUMMARIES[exactKey];

  // 3. Partial match in manual summaries (source + date, single meeting)
  for (const key of Object.keys(MANUAL_SUMMARIES)) {
    if (key.startsWith(item.source + '|' + dateKey + '|')) {
      const matchCount = Object.keys(MANUAL_SUMMARIES).filter(k => k.startsWith(item.source + '|' + dateKey + '|')).length;
      if (matchCount === 1) return MANUAL_SUMMARIES[key];
    }
  }

  // 4. Partial match in AI summaries
  const aiKeys = Object.keys(AI_SUMMARIES).filter(k => k.startsWith(item.source + '|' + dateKey + '|'));
  if (aiKeys.length === 1 && AI_SUMMARIES[aiKeys[0]].shortSummary) {
    const s = AI_SUMMARIES[aiKeys[0]].shortSummary;
    if (isBadSummary(s)) return '';
    return s;
  }

  return '';
}

// ── Get AI-generated topic bullets for a meeting (if available) ──
function getMeetingTopics(item) {
  if (!item.eventDate) return [];
  const dateKey = item.eventDate.toISOString().slice(0, 10);
  const cleanTitle = item.title.replace(/ -- CANCELED$/, '');
  const exactKey = item.source + '|' + dateKey + '|' + cleanTitle;
  if (AI_SUMMARIES[exactKey] && AI_SUMMARIES[exactKey].topics) {
    // If the shortSummary is bad, the whole AI entry is suspect — skip topics too
    if (AI_SUMMARIES[exactKey].shortSummary && isBadSummary(AI_SUMMARIES[exactKey].shortSummary)) return [];
    // Also filter out individual topic bullets that contain placeholder text
    return AI_SUMMARIES[exactKey].topics.filter(function(t) { return !isBadSummary(t); });
  }
  return [];
}

// ── Get AI "why it matters" for a meeting (supplements WHY_THIS_MATTERS) ──
function getAIWhyItMatters(item) {
  if (!item.eventDate) return '';
  const dateKey = item.eventDate.toISOString().slice(0, 10);
  const cleanTitle = item.title.replace(/ -- CANCELED$/, '');
  const exactKey = item.source + '|' + dateKey + '|' + cleanTitle;
  if (AI_SUMMARIES[exactKey] && AI_SUMMARIES[exactKey].whyItMatters) {
    // If the shortSummary is bad, the whole AI entry is suspect — skip whyItMatters too
    if (AI_SUMMARIES[exactKey].shortSummary && isBadSummary(AI_SUMMARIES[exactKey].shortSummary)) return '';
    if (isBadSummary(AI_SUMMARIES[exactKey].whyItMatters)) return '';
    return AI_SUMMARIES[exactKey].whyItMatters;
  }
  return '';
}

// ══════════════════════════════════════════════════════════════════
// ── "Why This Matters" -- contextual summaries for agenda items ──
// ══════════════════════════════════════════════════════════════════
//
// Each entry maps a keyword/phrase found in summary text (AI or manual)
// to a structured context object. The lookup scans the topics string
// for matching keywords and returns the first (most specific) hit.
//
// Fields:
//   decision   - What decision is actually being made
//   who        - Who is affected
//   stage      - First reading, final vote, work session, presentation, etc.
//   impact     - Likely practical impact
//   context    - (optional) Broader background tying to key regional issues
//
// When adding new meetings, add a MANUAL_SUMMARIES entry (topics)
// AND a WHY_THIS_MATTERS entry for any agenda item touching key issues.

// Look up the most specific "Why This Matters" entry for a meeting
function getWhyThisMatters(item) {
  const summary = getMeetingSummary(item) || '';
  const title = item.title || '';
  const desc = item.description || '';
  const searchText = title + ' | ' + summary + ' | ' + desc;

  for (const entry of WHY_THIS_MATTERS) {
    if (entry.match.test(searchText)) return entry;
  }
  return null;
}

// ══════════════════════════════════════════════════════════════
// ── Glossary -- plain-language definitions for government jargon ──
// ══════════════════════════════════════════════════════════════
// Sort terms by length (longest first) so multi-word terms match before shorter ones
// Build one regex that matches any glossary term (case-insensitive, word-boundary)
const GLOSSARY_REGEX = new RegExp(
  '\\b(' + GLOSSARY_TERMS_SORTED.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b',
  'gi'
);

function linkGlossaryTerms(text) {
  if (!text) return text;
  // Track which terms have already been linked to only link first occurrence
  const linked = new Set();
  return text.replace(GLOSSARY_REGEX, (match) => {
    // Find the glossary key (case-insensitive match)
    const key = GLOSSARY_TERMS_SORTED.find(t => t.toLowerCase() === match.toLowerCase());
    if (!key || linked.has(key.toLowerCase())) return match;
    linked.add(key.toLowerCase());
    const def = GOV_GLOSSARY[key].replace(/'/g, '&#39;').replace(/"/g, '&quot;');
    return '<span class="glossary-term" tabindex="0" aria-label="' + def + '" data-def="' + def + '">' + match + '</span>';
  });
}

// ── Highlight addresses, property names, and applicants in summary text ──
// Bolds street addresses (e.g., "700 W Pacific Ave") and known property/project
// names so they stand out in the Topics line on meeting cards.
function highlightAddresses(text) {
  if (!text) return text;
  // Street address pattern: number + optional direction + street name + suffix
  // Matches: 700 W Pacific Ave, 155 W Pacific Ave, 398 S Davis St, 333 W Colorado Ave
  const addressRe = /\b(\d{1,5}\s+(?:[NSEW]\.?\s+)?(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:Ave|St|Rd|Dr|Ln|Way|Blvd|Ct|Pl|Cir|Road|Drive|Lane|Street|Avenue))\b/g;
  text = text.replace(addressRe, '<strong class="address-highlight">$1</strong>');

  // Property / project names with unit/lot numbers
  // Matches: Silver Jack Unit 205, Element 52 G-17, Overlook Lots 17 & 2, Wilkin Court Unit H
  const propertyRe = /\b((?:Silver Jack|Element 52|Overlook|Wilkin Court|Lawson Hill|Shandoka|Carhenge)(?:\s+(?:Unit|Lot|Lots|Suite|Phase)\s+[\w&\s-]+)?)\b/gi;
  text = text.replace(propertyRe, (match) => {
    // Don't double-wrap if already inside a <strong>
    return '<strong class="address-highlight">' + match + '</strong>';
  });

  // Applicant / residence names (Person + Residence pattern)
  const applicantRe = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+Residence)\b/g;
  text = text.replace(applicantRe, '<strong class="address-highlight">$1</strong>');

  return text;
}

// Bold addresses AND person/entity names in legal notice summaries
function highlightLegalNamesAndAddresses(text) {
  if (!text) return text;

  // 1. Street addresses: 333 W Colorado Ave, 155 W Pacific Ave, 1370 Black Bear Rd, etc.
  const addressRe = /\b(\d{1,5}\s+(?:[NSEW]\.?\s+)?(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:Ave|St|Rd|Dr|Ln|Way|Blvd|Ct|Pl|Cir|Road|Drive|Lane|Street|Avenue|Boulevard))\b/g;
  text = text.replace(addressRe, '<strong class="address-highlight">$1</strong>');

  // 2. Known person names from legal notices
  const personNames = [
    'Joyce Ann Allred', 'Michael D. Allred', 'Slator Aplin',
    'Greg Pollio', 'Matt Gonzales', 'Rodney Walters',
    'Scott Pittenger', 'Jenny Bates', 'Kristine Perpar',
    'Drift Mine LLC', 'AZ LL', 'Shift Architects'
  ];
  personNames.forEach(name => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRe = new RegExp('(?<!<strong[^>]*>)\\b(' + escaped + ')\\b(?![^<]*</strong>)', 'g');
    text = text.replace(nameRe, '<strong class="address-highlight">$1</strong>');
  });

  // 3. Property / project names
  const propertyRe = /\b((?:Silver Jack|Element 52|Longwill|Entrada|White House|Meribel|Overlook|Wilkin Court|Lawson Hill|Shandoka|Carhenge|Stillwell)(?:\s+(?:Unit|Lot|Lots|Suite|Phase)\s+[\w&\s-]+)?)\b/gi;
  text = text.replace(propertyRe, (match, p1, offset) => {
    // Don't double-wrap
    const before = text.substring(Math.max(0, offset - 30), offset);
    if (before.includes('<strong')) return match;
    return '<strong class="address-highlight">' + match + '</strong>';
  });

  // 4. Addresses with specific road names not caught by pattern 1 (e.g. Chipeta Rd, Porphyry St, Tomboy Rd)
  const extraAddresses = [
    '17253 Chipeta Rd', '36 Porphyry St', '116 E Columbia Ave',
    '411 Mountain Village Blvd'
  ];
  extraAddresses.forEach(addr => {
    if (text.indexOf(addr) !== -1 && text.indexOf('<strong class="address-highlight">' + addr) === -1) {
      text = text.split(addr).join('<strong class="address-highlight">' + addr + '</strong>');
    }
  });

  return text;
}

// Render the "Why This Matters" button — opens a popup modal
function renderWhyThisMatters(item, showFaded) {
  const wtm = getWhyThisMatters(item);
  if (!wtm) return '';  // Only show button when content exists

  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  const popupText = (wtm.popup || wtm.decision || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const meetingTitle = (item.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

  return '<button class="wtm-btn" onclick="openWTMModal(\'' + meetingTitle + '\',\'' + popupText + '\')">' + icon + ' Why This Matters</button>';
}

// Inject the WTM modal once, lazily
function ensureWTMModal() {
  if (document.getElementById('wtm-modal')) return;
  const el = document.createElement('div');
  el.id = 'wtm-modal';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'wtm-modal-title');
  el.innerHTML =
    '<div class="wtm-modal-overlay" onclick="closeWTMModal()"></div>' +
    '<div class="wtm-modal-box">' +
      '<div class="wtm-modal-header">' +
        '<svg class="wtm-modal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>' +
        '<span class="wtm-modal-label">Why This Matters</span>' +
        '<button class="wtm-modal-close" onclick="closeWTMModal()" aria-label="Close">\u2715</button>' +
      '</div>' +
      '<div id="wtm-modal-title" class="wtm-modal-meeting"></div>' +
      '<p class="wtm-modal-body" id="wtm-modal-body"></p>' +
    '</div>';
  document.body.appendChild(el);
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeWTMModal();
  });
}

function openWTMModal(meetingTitle, popupText) {
  ensureWTMModal();
  document.getElementById('wtm-modal-title').textContent = meetingTitle;
  document.getElementById('wtm-modal-body').textContent = popupText;
  const modal = document.getElementById('wtm-modal');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeWTMModal() {
  const modal = document.getElementById('wtm-modal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}
window.openWTMModal = openWTMModal;
window.closeWTMModal = closeWTMModal;

// ══════════════════════════════════════════════════════════════
// ── Meeting Zoom Links (cached -- update when new agendas post) ──
// ══════════════════════════════════════════════════════════════
//
// Only include a Zoom link when the actual agenda contains one.
// Key format: "source|YYYY-MM-DD|meeting title" (same as MANUAL_SUMMARIES).
// School District uses one consistent Zoom room for all meetings -- handled separately.
//
// TO UPDATE: When a new agenda is posted, open the PDF/page and look for
// the Zoom registration or join URL. Add it here.

// School District uses one consistent Zoom link for all meetings
function getMeetingZoomLink(item) {
  if (!item.eventDate) return '';
  // School district always uses the same link
  if (item.source === 'school') return SCHOOL_ZOOM_LINK;
  const dateKey = item.eventDate.toISOString().slice(0, 10);
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

// ══════════════════════════════════════════════════════════════
// ── Meeting Passcodes (cached -- update when new agendas post) ──
// ══════════════════════════════════════════════════════════════
//
// Passcodes are published inside agenda PDFs. When a new agenda is posted,
// open the PDF and look for "Passcode", "Password", or "Meeting ID".
// Key format: "source|YYYY-MM-DD|meeting title" (same as MEETING_ZOOM_LINKS).
//
// Each entry contains: { id: 'Meeting ID', passcode: 'Passcode', phone: 'dial-in' }
// Any field can be omitted if not available.

function getMeetingPacketLink(item) {
  if (!item || !item.eventDate || item.source !== 'county') return null;
  const dateKey = item.eventDate.toISOString().slice(0, 10);
  const cleanT = (item.title || '').replace(/ -- CANCELED$/, '').replace(/ -- Special Meeting$/, '');
  const exactKey = cleanT + '|' + dateKey;
  const eventId = COUNTY_CIVICCLERK_IDS[exactKey];
  if (!eventId) return null;
  // Prefer hosted PDF (direct download) over CivicClerk viewer
  if (typeof COUNTY_HOSTED_PACKETS !== 'undefined' && COUNTY_HOSTED_PACKETS[eventId]) {
    return COUNTY_HOSTED_PACKETS[eventId];
  }
  const fileId = COUNTY_CIVICCLERK_AGENDA_FILES[eventId];
  if (!fileId) return null;
  return COUNTY_CIVICCLERK_BASE + eventId + '/files/agenda/' + fileId;
}

function getMeetingPasscode(item) {
  if (!item || !item.eventDate) return null;

  // School district -- extract passcode from URL parameter
  if (item.source === 'school') {
    const url = SCHOOL_ZOOM_LINK;
    const pwdMatch = url.match(/[?&]pwd=([^&]+)/);
    return pwdMatch ? { id: '865 8512 4120', passcode: pwdMatch[1], phone: '' } : null;
  }

  const dateKey = item.eventDate.toISOString().slice(0, 10);
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

function renderPasscodeInfo(item) {
  const info = getMeetingPasscode(item);
  const zoomUrl = getMeetingZoomLink(item);
  const remote = ENTITY_REMOTE[item.source] || {};

  // Only show livestream button on the day of the meeting
  const today = new Date();
  const isToday = item.eventDate &&
    item.eventDate.getFullYear() === today.getFullYear() &&
    item.eventDate.getMonth() === today.getMonth() &&
    item.eventDate.getDate() === today.getDate();
  const showLivestream = isToday && remote.livestream;

  // Only render if we have passcode info, a zoom link, or a livestream today
  if ((!info || !info.passcode) && !zoomUrl && !showLivestream) return '';

  const zoomIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';
  const ytIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.13C5.12 19.56 12 19.56 12 19.56s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg>';

  let html = '<div class="passcode-info">';
  html += '<span class="passcode-label">Zoom Access:</span> ';
  if (info && info.id) html += 'Meeting ID: <strong>' + info.id + '</strong> · ';
  if (info && info.passcode) html += 'Passcode: <strong>' + info.passcode + '</strong>';
  if (info && info.phone) html += '<br><span class="passcode-phone">Phone: ' + info.phone + '</span>';
  // Join Zoom + Livestream buttons
  const hasButtons = zoomUrl || showLivestream;
  if (hasButtons) {
    html += '<div class="passcode-join">';
    if (zoomUrl) {
      html += '<a href="' + zoomUrl + '" target="_blank" rel="noopener" class="zoom-link">' + zoomIcon + ' Join Zoom</a>';
    }
    if (showLivestream) {
      html += '<a href="' + remote.livestream + '" target="_blank" rel="noopener" class="livestream-link" title="' + (remote.livestreamLabel || 'Watch') + '">' + ytIcon + ' ' + (remote.livestreamLabel || 'Watch Live') + '</a>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function getTownAgendaLink(title, eventDate) {
  if (!eventDate) return TOWN_CIVICWEB_FALLBACK;
  const dateKey = eventDate.toISOString().slice(0, 10);
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

function getTellurideMeetings() {
  return TELLURIDE_CACHED_DATA.map(m => {
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
      hasAgenda
    };
  });
}

// ══════════════════════════════════════
// ── Fetch news/alerts via rss2json ──
// ══════════════════════════════════════

async function fetchNewsFeed(feedConfig) {
  try {
    const resp = await fetch(RSS2JSON_PROXY + encodeURIComponent(feedConfig.url));
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.status !== 'ok' || !data.items) return [];

    return data.items.map(item => ({
      title: item.title || 'Untitled',
      link: item.link || '#',
      description: truncate(stripHtml(item.description)),
      pubDate: new Date(item.pubDate),
      source: feedConfig.source,
      sourceLabel: feedConfig.sourceLabel,
      category: feedConfig.category
    }));
  } catch (err) {
    console.warn(`News feed error (${feedConfig.sourceLabel}): ${err.message}`);
    return [];
  }
}


// ══════════════════════════════════════════════════════════════
// ── Land Use issue guide data ──
// ══════════════════════════════════════════════════════════════
// Merge Gondola 3A into LAND_USE_ISSUES as a regular topic
GONDOLA_DATA.label = 'Gondola 3A';
GONDOLA_DATA.meetings = GONDOLA_DATA.meetings || [];
LAND_USE_ISSUES.gondola = GONDOLA_DATA;

let currentLandUseIssue = 'carhenge';

// Populate Deep Dive topic buttons on Gov-Hub page
// Standalone deep-dive pages (open in new tab, not inline)
function populateDeepDiveSubmenu() {
  const container = document.getElementById('deepDiveTopicButtons');
  if (!container) return;
  // Inline topic buttons
  var html = Object.entries(LAND_USE_ISSUES).map(([key, issue]) =>
    '<button class="deep-dive-topic-btn" data-dd-topic="' + key + '">' + issue.label + ' <span class="dd-arrow">→</span></button>'
  ).join('');
  // Standalone page buttons
  html += DEEP_DIVE_PAGES.map(function(page) {
    return '<a class="deep-dive-topic-btn" href="' + page.href + '" target="_blank" rel="noopener" style="text-decoration:none;">' + page.label + ' <span class="dd-arrow">→</span></a>';
  }).join('');
  container.innerHTML = html;
  container.querySelectorAll('.deep-dive-topic-btn[data-dd-topic]').forEach(btn => {
    btn.addEventListener('click', function() {
      const topic = btn.dataset.ddTopic;
      currentLandUseIssue = topic;
      if (typeof window.switchTab === 'function') {
        window.switchTab('land-use');
      }
      if (typeof renderLandUseTab === 'function') {
        renderLandUseTab();
      }
    });
  });
}
// Run on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
  populateDeepDiveSubmenu();
  // Show Deep Dive bar and What to Follow since meetings (Gov-Hub) is the default tab
  var ddBar = document.getElementById('deepDiveSubmenu');
  if (ddBar) ddBar.style.display = 'block';
  var wtfBar = document.getElementById('whatToFollowBar');
  if (wtfBar) wtfBar.style.display = 'block';
  // Set meetings-active on initial load (Gov-Hub is default tab)
  var layout = document.querySelector('.main-layout');
  if (layout) layout.classList.add('meetings-active');

  // Deep-link support: #landuse-{key} from deep-dives.html cards
  // e.g. /gov-hub.html#landuse-carhenge → switches to land-use tab and selects that topic
  var hash = window.location.hash;
  if (hash && hash.startsWith('#landuse-')) {
    var topicKey = hash.slice('#landuse-'.length);
    if (typeof LAND_USE_ISSUES !== 'undefined' && LAND_USE_ISSUES[topicKey]) {
      currentLandUseIssue = topicKey;
      if (typeof window.switchTab === 'function') {
        window.switchTab('land-use');
      }
      if (typeof renderLandUseTab === 'function') {
        renderLandUseTab();
      }
    }
  }
});
function renderLandUseTab() {
  const topicRow = document.getElementById('landUseTopicRow');
  const statusEl = document.getElementById('landUseStatus');
  const timelineEl = document.getElementById('landUseTimeline');
  const docsEl = document.getElementById('landUseDocs');
  const meetingsEl = document.getElementById('landUseMeetings');
  const newsEl = document.getElementById('landUseNews');
  const playersEl = document.getElementById('landUsePlayers');
  const introEl = document.getElementById('landUsePanelIntro');
  if (!topicRow || !statusEl || !timelineEl || !docsEl || !meetingsEl || !newsEl || !playersEl || !introEl) return;

  topicRow.innerHTML = Object.entries(LAND_USE_ISSUES).map(([key, issue]) => `
    <button class="landuse-topic-pill ${key === currentLandUseIssue ? 'active' : ''}" data-landuse-issue="${key}">${issue.label}</button>
  `).join('');
  const issue = LAND_USE_ISSUES[currentLandUseIssue];
  introEl.textContent = issue.intro;

  const heroImageEl = document.getElementById('landUseHeroImage');
  if (heroImageEl) {
    if (issue.heroImage) {
      heroImageEl.style.display = '';
      // heroAspect: 'tall' lets full-detail infographics render without
      // being cropped to the default 200px banner height (e.g., the SMC
      // SSR phase-timeline infographic on the Code Changes module).
      const aspectClass = issue.heroAspect === 'tall' ? ' landuse-hero-image--tall' : '';
      heroImageEl.className = 'landuse-hero-image' + aspectClass;
      heroImageEl.innerHTML = `<img src="${issue.heroImage}" alt="${issue.heroAlt || ''}" loading="lazy">${issue.heroCredit ? '<div class="landuse-image-credit">' + issue.heroCredit + '</div>' : ''}`;
    } else {
      heroImageEl.style.display = 'none';
      heroImageEl.innerHTML = '';
    }
  }

  const legalSummaryEl = document.getElementById('landUseLegalSummary');
  if (legalSummaryEl) {
    if (issue.legalSummary) {
      legalSummaryEl.style.display = '';
      legalSummaryEl.innerHTML = '<div class="landuse-legal-summary-label">Legal Issues Summary</div><div class="landuse-legal-summary-text">' + issue.legalSummary + '</div>';
    } else {
      legalSummaryEl.style.display = 'none';
      legalSummaryEl.innerHTML = '';
    }
  }

  statusEl.innerHTML = `
    <div class="landuse-status-card">
      <div class="landuse-status-label">Current status</div>
      <div class="landuse-status-title">${issue.statusTitle}</div>
      <div class="landuse-status-copy">${issue.statusCopy}</div>
      <div class="landuse-nextstep">➜ ${issue.nextStep}</div>
    </div>
    <div class="landuse-snapshot">
      ${issue.metrics.map(metric => `
        <div class="landuse-metric">
          <div class="landuse-metric-label">${metric.label}</div>
          <div class="landuse-metric-value">${metric.value}</div>
          <div class="landuse-metric-sub">${metric.sub}</div>
        </div>`).join('')}
    </div>`;
  timelineEl.innerHTML = [...issue.timeline].reverse().map(event => `
    <div class="landuse-event ${event.future ? 'future' : ''}">
      <div class="landuse-event-date">${event.date}</div>
      <div class="landuse-event-title">${event.title}</div>
      <div class="landuse-event-copy">${event.copy}</div>
    </div>`).join('');
  docsEl.innerHTML = issue.docs.map(doc => `
    <a class="landuse-doc-item" href="${doc.href}" target="_blank" rel="noopener">
      <div><strong>${doc.title}</strong><span>${doc.copy}</span></div>
      <div class="landuse-doc-tag">${doc.tag}</div>
    </a>`).join('');

  const meetingsPanel = meetingsEl.closest('.landuse-panel');
  if (issue.hideMeetings) {
    if (meetingsPanel) meetingsPanel.style.display = 'none';
  } else {
    if (meetingsPanel) meetingsPanel.style.display = '';
    if (issue.meetings && issue.meetings.length) {
      meetingsEl.innerHTML = issue.meetings.map(item => `
        <div class="landuse-compact-item">
          <div class="landuse-compact-meta">${item.date}${item.time ? ' · ' + item.time : ''}</div>
          <a class="landuse-compact-title" href="${item.href}" target="_blank" rel="noopener">${item.title}</a>
          <div class="landuse-compact-copy">${item.source}${item.location ? '<br>' + item.location : ''}${item.zoom ? '<br>' + item.zoom : ''}</div>
        </div>`).join('');
    } else {
      const allMeetings = window.__allMeetingsCache || [];
      const meetings = allMeetings.filter(item => {
        if (item.source !== 'telluride' && item.source !== 'county') return false;
        const text = `${item.title || ''} ${getMeetingSummary(item) || ''}`.toLowerCase();
        if (currentLandUseIssue === 'society') return text.includes('society') || text.includes('hospital') || text.includes('county');
        if (currentLandUseIssue === 'code') return text.includes('code') || text.includes('housing') || text.includes('wildfire') || text.includes('planning');
        if (currentLandUseIssue === 'wildfire') return text.includes('wildfire') || text.includes('fire') || text.includes('wui') || text.includes('resiliency') || text.includes('defensible space');
        return text.includes('planning') || text.includes('housing') || text.includes('land use') || text.includes('development') || text.includes('county');
      }).slice(0, 4);
      meetingsEl.innerHTML = meetings.length ? meetings.map(item => `
        <div class="landuse-compact-item">
          <div class="landuse-compact-meta">${friendlyDate(item.eventDate)}${item.eventTimes ? ' · ' + item.eventTimes : ''}</div>
          <a class="landuse-compact-title" href="${item.link}" target="_blank" rel="noopener">${item.title}</a>
          <div class="landuse-compact-copy">${item.sourceLabel}${item.location ? '<br>' + item.location : ''}</div>
        </div>`).join('') : '<div class="landuse-empty">No upcoming land-use meetings found right now. Check the agenda portals above.</div>';
    }
  }

  const legalPanel = document.getElementById('landUseLegalPanel');
  const legalEl = document.getElementById('landUseLegalIssues');
  if (legalPanel && legalEl) {
    if (issue.legalIssues && issue.legalIssues.length) {
      legalPanel.style.display = '';
      // Optional per-issue panel-header overrides (legalIssuesTitle / legalIssuesSub)
      const legalH3 = legalPanel.querySelector('.landuse-panel-header h3');
      const legalP  = legalPanel.querySelector('.landuse-panel-header p');
      if (legalH3) legalH3.textContent = issue.legalIssuesTitle || 'Legal issues';
      if (legalP)  legalP.textContent  = issue.legalIssuesSub   || 'Key legal and transparency questions surrounding this topic.';
      legalEl.innerHTML = issue.legalIssues.map(item => `
        <div class="landuse-player">
          <div class="landuse-player-icon">${item.icon}</div>
          <div><div class="landuse-player-title">${item.title}</div>
          <div class="landuse-player-copy">${item.copy}</div></div>
        </div>`).join('');
    } else {
      legalPanel.style.display = 'none';
      legalEl.innerHTML = '';
    }
  }

  if (issue.news && issue.news.length) {
    newsEl.innerHTML = issue.news.map(item => `
      <div class="landuse-compact-item">
        <div class="landuse-compact-meta">${item.source} · ${item.date}</div>
        <a class="landuse-compact-title" href="${item.href}" target="_blank" rel="noopener">${item.title}</a>
        <div class="landuse-compact-copy">${item.copy}</div>
      </div>`).join('');
  } else {
    const allNews = window.__allNewsCache || [];
    const news = allNews.filter(item => {
      const text = `${item.title || ''} ${item.description || ''}`.toLowerCase();
      if (currentLandUseIssue === 'society') return text.includes('development') || text.includes('hospital') || text.includes('county');
      if (currentLandUseIssue === 'code') return text.includes('code') || text.includes('housing') || text.includes('wildfire') || text.includes('planning');
      if (currentLandUseIssue === 'wildfire') return text.includes('wildfire') || text.includes('fire') || text.includes('wui') || text.includes('resiliency');
      return text.includes('housing') || text.includes('planning') || text.includes('development') || text.includes('council') || text.includes('county');
    }).slice(0, 4);
    newsEl.innerHTML = news.length ? news.map(item => `
      <div class="landuse-compact-item">
        <div class="landuse-compact-meta">${item.sourceLabel} · ${fullDate(item.pubDate)}</div>
        <a class="landuse-compact-title" href="${item.link}" target="_blank" rel="noopener">${item.title}</a>
        <div class="landuse-compact-copy">${item.description || 'Open the full item for details.'}</div>
      </div>`).join('') : '<div class="landuse-empty">No recent land-use-related coverage surfaced from the current feeds.</div>';
  }

  playersEl.innerHTML = issue.players.map(player => `
    <div class="landuse-player">
      <div class="landuse-player-badge">${player.icon}</div>
      <div><strong>${player.title}</strong><span>${player.copy}</span></div>
    </div>`).join('');

  // Optional roster panel (e.g. SSR for Code Changes & Accelerated Review).
  // Only rendered when the issue object provides a roster object.
  const rosterPanel = document.getElementById('landUseRosterPanel');
  const rosterEl = document.getElementById('landUseRoster');
  if (rosterPanel && rosterEl) {
    if (issue.roster && issue.roster.groups && issue.roster.groups.length) {
      rosterPanel.style.display = '';
      const r = issue.roster;
      rosterEl.innerHTML = `
        ${r.title ? `<div class="landuse-roster-title">${r.title}</div>` : ''}
        ${r.subtitle ? `<div class="landuse-roster-sub">${r.subtitle}</div>` : ''}
        ${r.groups.map(g => `
          <div class="landuse-roster-group">
            <div class="landuse-roster-label">${g.label}</div>
            <ul class="landuse-roster-members">
              ${g.members.map(m => `
                <li class="landuse-roster-member">
                  <strong>${m.name}</strong>${m.role ? `<span> &mdash; ${m.role}</span>` : ''}
                </li>`).join('')}
            </ul>
          </div>`).join('')}
      `;
    } else {
      rosterPanel.style.display = 'none';
      rosterEl.innerHTML = '';
    }
  }

  topicRow.querySelectorAll('[data-landuse-issue]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentLandUseIssue = btn.dataset.landuseIssue;
      renderLandUseTab();
    });
  });
}


// ── Fetch Telluride Times Community Calendar via CORS proxy ──
async function fetchTellurideTimesEvents() {
  const calendarUrl = 'https://www.telluridenews.com/calendar/';
  try {
    let html;
    try {
      const resp = await fetch(CODETABS_PROXY + encodeURIComponent(calendarUrl));
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      html = await resp.text();
    } catch (primaryErr) {
      console.warn('TT Times primary proxy failed, trying fallback:', primaryErr.message);
      const resp2 = await fetch(ALLORIGINS_PROXY + encodeURIComponent(calendarUrl));
      if (!resp2.ok) throw new Error(`Fallback HTTP ${resp2.status}`);
      html = await resp2.text();
    }

    // Parse event-list-items from the HTML
    const pattern = /event-month">(\w+)[\s\S]*?event-day">(\d+)[\s\S]*?href="(\/calendar\/event_[^"]+)"[^>]*>([^<]+)/g;
    const events = [];
    let match;
    const currentYear = new Date().getFullYear();

    while ((match = pattern.exec(html)) !== null) {
      const monthStr = match[1];
      const day = match[2];
      const path = match[3];
      const title = match[4].trim();
      const href = 'https://www.telluridenews.com' + path;

      // Parse date
      const dateStr = `${monthStr} ${day}, ${currentYear}`;
      const eventDate = localDate(dateStr);
      if (!eventDate || isNaN(eventDate.getTime())) continue;

      // Extract time from the title (e.g., "Event Name, 7 p.m." or "Event, 12-1 p.m.")
      const timeMatch = title.match(/,\s*(\d{1,2}(?::\d{2})?\s*(?:a\.m\.|p\.m\.|AM|PM)(?:\s*[--]\s*\d{1,2}(?::\d{2})?\s*(?:a\.m\.|p\.m\.|AM|PM))?)/i);
      const timeStr = timeMatch ? timeMatch[1] : '';

      // Extract location from title (pattern: "Event Name: Location, time")
      // or "Event Name, Location, time"
      let eventTitle = title;
      let location = '';

      // Try "Name: Location, time" pattern
      const colonMatch = title.match(/^([^:]+):\s*(.+?)(?:,\s*\d{1,2}(?::\d{2})?\s*(?:a\.m\.|p\.m\.))/i);
      if (colonMatch) {
        eventTitle = colonMatch[1].trim();
        location = colonMatch[2].trim();
      }

      // Override location for events at known out-of-town venues. The
      // TT calendar scrape often produces "Telluride, CO" as a default;
      // for events whose title mentions a Ridgway venue, set the city
      // explicitly so the town chip + town-badge image both classify correctly.
      let finalLocation = location || 'Telluride, CO';
      const titleVenueText = ((eventTitle || '') + ' ' + (location || '')).toLowerCase();
      if (/\bsherbino\b/.test(titleVenueText)) {
        finalLocation = 'Sherbino Theater, Ridgway, CO';
      } else if (/\bcolorado boy depot\b/.test(titleVenueText)) {
        finalLocation = 'Colorado Boy Depot, Ridgway, CO';
      }
      events.push({
        title: eventTitle,
        link: href,
        description: timeStr || '',
        location: finalLocation,
        pubDate: eventDate,
        source: 'ttimes',
        sourceLabel: 'Telluride Times',
        category: 'Community Event'
      });
    }

    // Filter to today onward
    const todayStr = new Date().toISOString().slice(0, 10);
    return events.filter(e => e.pubDate.toISOString().slice(0, 10) >= todayStr);
  } catch (err) {
    console.warn('Telluride Times calendar error:', err.message);
    return [];
  }
}

// ── Enrich a KOTO event by fetching its detail page for image, description, location ──
async function enrichKOTOEvent(item) {
  try {
    let html;
    try {
      const resp = await fetch(CODETABS_PROXY + encodeURIComponent(item.link));
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      html = await resp.text();
    } catch (e1) {
      const resp2 = await fetch(ALLORIGINS_PROXY + encodeURIComponent(item.link));
      if (!resp2.ok) throw new Error(`Fallback HTTP ${resp2.status}`);
      html = await resp2.text();
    }
    // Extract featured image from schema/og:image
    const imgMatch = html.match(/"primaryImageOfPage"[^}]*"contentUrl"\s*:\s*"([^"]+)"/) ||
                     html.match(/"image"\s*:\s*\{[^}]*"url"\s*:\s*"([^"]+)"/) ||
                     html.match(/"image"\s*:\s*"(https:\/\/koto\.org\/wp-content\/uploads\/[^"]+)"/) ||
                     html.match(/og:image[^>]+content="([^"]+)"/i) ||
                     html.match(/property="og:image"\s+content="([^"]+)"/i);
    if (imgMatch && imgMatch[1] && !/koto-fm-logo/.test(imgMatch[1])) {
      item.imageUrl = imgMatch[1];
    }
    // Extract description from schema
    const descMatch = html.match(/"description"\s*:\s*"([^"]{20,300})"/);
    if (descMatch) {
      const desc = descMatch[1].replace(/\\u[\dA-Fa-f]{4}/g, '').replace(/\\n/g, ' ').trim();
      if (desc.length > 20 && !/koto\.org|KOTO FM/.test(desc)) {
        // Prepend time if we have it
        const timeMatch = html.match(/"startDate"\s*:\s*"[^T]+T(\d{2}:\d{2})/);
        let timeStr = '';
        if (timeMatch) {
          const h = parseInt(timeMatch[1].split(':')[0]);
          const min = timeMatch[1].split(':')[1];
          timeStr = (h > 12 ? (h - 12) + ':' + min + ' PM' : h + ':' + min + ' AM') + ' · ';
        }
        item.description = timeStr + smartTruncate(desc, EVENT_DESC_MAX - timeStr.length);
      }
    }
    // Extract location from schema
    const locMatch = html.match(/"location"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
    if (locMatch) {
      item.location = locMatch[1];
      // Also try to get address
      const addrMatch = html.match(/"streetAddress"\s*:\s*"([^"]+)"/);
      if (addrMatch) item.location += ', ' + addrMatch[1];
    }
    // Extract date from schema
    const dateMatch = html.match(/"startDate"\s*:\s*"(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      item.pubDate = new Date(dateMatch[1]);
    }
  } catch (err) {
    console.warn('Could not enrich KOTO event:', item.title, err.message);
  }
  return item;
}

// ── Fetch KOTO Community Calendar Events (upcoming only) ──
async function fetchKOTONews() {
  // Reads from KOTO_COMMUNITY_EVENTS, populated server-side every 6h
  if (typeof KOTO_COMMUNITY_EVENTS !== 'undefined' && Array.isArray(KOTO_COMMUNITY_EVENTS) && KOTO_COMMUNITY_EVENTS.length > 0) {
    return KOTO_COMMUNITY_EVENTS;
  }
  const KOTO_CAL_URL = 'https://koto.org/calendars/category/community-calendar/';
  // Try to scrape KOTO community calendar via CORS proxy
  try {
    let html;
    try {
      const resp = await fetch(CODETABS_PROXY + encodeURIComponent(KOTO_CAL_URL));
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      html = await resp.text();
    } catch (e1) {
      const resp2 = await fetch(ALLORIGINS_PROXY + encodeURIComponent(KOTO_CAL_URL));
      if (!resp2.ok) throw new Error(`Fallback HTTP ${resp2.status}`);
      html = await resp2.text();
    }
    // Parse event titles and links from calendar HTML
    const pattern = /<a[^>]+href="(https:\/\/koto\.org\/event\/[^"]+)"[^>]*>\s*([^<]+)/gi;
    const items = [];
    const seen = new Set();
    let m;
    while ((m = pattern.exec(html)) !== null) {
      const href = m[1];
      const title = m[2].trim();
      if (!title || /page|next|prev|older|newer/i.test(title)) continue;
      if (seen.has(title)) continue;
      seen.add(title);
      items.push({
        title: title,
        link: href,
        description: 'KOTO Community Calendar event',
        pubDate: new Date(),
        source: 'koto',
        sourceLabel: 'KOTO',
        category: 'Community Event'
      });
    }
    // Enrich up to 15 events with detail page data (images, descriptions, locations)
    const toEnrich = items.slice(0, 15);
    const enriched = await Promise.all(toEnrich.map(item => enrichKOTOEvent(item)));
    // Filter to upcoming only and skip Wilkinson library events (those come from fetchWilkinsonEvents)
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const upcoming = enriched.filter(i => i.pubDate >= now);
    if (upcoming.length > 0) return upcoming.slice(0, 20);
    if (enriched.length > 0) return enriched.slice(0, 20);
  } catch (err) {
    console.warn('KOTO calendar live fetch failed, using cached events:', err.message);
  }

  // Fallback: hardcoded upcoming KOTO Community Calendar events (non-library only)
  const calLink = KOTO_CAL_URL;
  return [
    { title: 'CPR World First Aid & CPR Certification', link: 'https://koto.org/event/cpr-world-first-aid-and-cpr-certification-in-mountain-village/', description: '12:00 PM – 4:30 PM · CPR World offers First Aid and CPR certification. Register at cprworld.com or call (970) 729-2779.', pubDate: new Date('2026-03-29T12:00:00'), source: 'koto', sourceLabel: 'KOTO', category: 'Community Event', location: 'Mountain Village Fire Station, 411 Mountain Village Blvd' },
    { title: 'Telluride Mountain School Open House', link: 'https://koto.org/event/telluride-mountain-school-open-house/', description: '5:00 PM – 6:00 PM · Join an evening of conversation about the next chapter for TMS\u2014new leadership, updated programming, and a refreshed mission. Wine, appetizers, and childcare provided.', pubDate: new Date('2026-03-31T12:00:00'), source: 'koto', sourceLabel: 'KOTO', category: 'Community Event', location: 'Telluride Mountain School, 200 San Miguel River Dr', imageUrl: 'https://koto.org/wp-content/uploads/2026/03/Open-House.png' },
    { title: 'Healthy Kids Colorado Survey Data Sharing', link: 'https://koto.org/event/healthy-kids-colorado-survey-2025-data-sharing-event/', description: '5:15 PM – 7:00 PM · Explore key insights from the 2025 HKCS, celebrate positive trends, and discuss how to support local youth. Free and open to all.', pubDate: new Date('2026-03-31T12:00:00'), source: 'koto', sourceLabel: 'KOTO', category: 'Community Event', location: 'Telluride Science & Innovation Center', imageUrl: 'https://koto.org/wp-content/uploads/2026/03/HKCS-Workshop-Flyer.png' },
    { title: 'Art Walk Telluride', link: 'https://koto.org/event/art-walk-telluride/2026-04-02/', description: '5:00 PM – 7:00 PM · First-Thursday gallery walk featuring inspiring exhibits, receptions, and a chance to meet local and visiting artists. Details at telluridearts.org.', pubDate: new Date('2026-04-02T12:00:00'), source: 'koto', sourceLabel: 'KOTO', category: 'Community Event', location: 'Downtown Telluride galleries', imageUrl: 'https://koto.org/wp-content/uploads/2025/12/Screenshot-2025-11-10-at-2.54.42-PM.png' },
    { title: 'Community Storytelling Night: Tales from the Season', link: 'https://koto.org/event/telluride-arts-citizens-state-bank-present-community-storytelling-night-oh-what-a-season-its-been/', description: '5:30 PM – 7:00 PM · Mocktails and bites at 5:30; storytelling at 6:00. Friends and neighbors share funny, heartfelt 3\u20135 minute stories from the winter season. Free.', pubDate: new Date('2026-04-02T12:00:00'), source: 'koto', sourceLabel: 'KOTO', category: 'Community Event', location: 'Telluride Arts HQ, 135 W Pacific Ave', imageUrl: 'https://koto.org/wp-content/uploads/2026/03/image001.png' },
    { title: 'French Happy Hour', link: 'https://koto.org/event/french-happy-hour/', description: '5:30 PM – 7:00 PM · Practice French conversation in a relaxed setting. Light snacks provided; beverages at the bar. Space limited\u2014sign up at telluridelibrary.org.', pubDate: new Date('2026-04-02T12:00:00'), source: 'koto', sourceLabel: 'KOTO', category: 'Community Event', location: 'The Alibi, 121 S Fir St, Telluride', imageUrl: 'https://koto.org/wp-content/uploads/2026/03/French-Happy-Hour-6.png' },
    { title: 'KOTO Spring Street Dance', link: 'https://koto.org/event/koto-spring-street-dance/', description: '4:00 PM – 8:00 PM · Free live music from The Other Brothers, cash bar, and a Pink Flamingo Costume Contest! Raffle for a Fiji resort stay drawn at 6 PM.', pubDate: new Date('2026-04-03T12:00:00'), source: 'koto', sourceLabel: 'KOTO', category: 'Community Event', location: 'West Main Street, Telluride' },
    { title: 'Bardic Trails Poetry Night', link: 'https://koto.org/event/bardic-trails-online-poetry-night-3/2026-04-07/', description: '7:00 PM – 8:00 PM · Award-winning guest poet Nancy Takacs shares new work, followed by Q&A and an open poetry circle. Free via Zoom.', pubDate: new Date('2026-04-07T12:00:00'), source: 'koto', sourceLabel: 'KOTO', category: 'Community Event', location: 'Online via Zoom', imageUrl: 'https://koto.org/wp-content/uploads/2026/03/Bardic-Trails-2026.jpg' },
    { title: 'The Creative Exchange', link: 'https://koto.org/event/the-creative-exchange-at-telluride-arts-hq-2/2026-04-09/', description: '5:30 PM – 6:30 PM · Monthly series where emerging and established artists share knowledge, skills, and stories. Open to makers, educators, students, and creatives. Free.', pubDate: new Date('2026-04-09T12:00:00'), source: 'koto', sourceLabel: 'KOTO', category: 'Community Event', location: 'Telluride Arts HQ, 135 W Pacific Ave', imageUrl: 'https://koto.org/wp-content/uploads/2025/12/Screenshot-2025-12-17-at-4.42.32-PM.png' },
    { title: 'Mountain Village Farmers Market', link: calLink, description: '10:00 AM – 2:00 PM · Fresh local produce, artisan goods, and live music in the Village core.', pubDate: new Date('2026-04-05T12:00:00'), source: 'koto', sourceLabel: 'KOTO', category: 'Community Event', location: 'Mountain Village Town Plaza' },
    { title: 'MV Music in the Plaza', link: calLink, description: '3:00 PM – 6:00 PM · Live music in the heart of Mountain Village. Free and family-friendly.', pubDate: new Date('2026-04-06T12:00:00'), source: 'koto', sourceLabel: 'KOTO', category: 'Community Event', location: 'Mountain Village Heritage Plaza' },
    { title: 'Norwood Community Potluck', link: calLink, description: '5:30 PM · Bring a dish to share and connect with neighbors at the monthly community potluck.', pubDate: new Date('2026-04-04T12:00:00'), source: 'koto', sourceLabel: 'KOTO', category: 'Community Event', location: 'Norwood Town Hall' },
    { title: 'Norwood Spring Craft Fair', link: calLink, description: '9:00 AM – 4:00 PM · Local artisans and crafters showcase handmade goods. Free admission.', pubDate: new Date('2026-04-12T12:00:00'), source: 'koto', sourceLabel: 'KOTO', category: 'Community Event', location: 'Norwood Community Center' },
    { title: 'Ridgway Old West Fest', link: calLink, description: '10:00 AM – 5:00 PM · Celebrate Western heritage with live music, food vendors, and family activities.', pubDate: new Date('2026-04-11T12:00:00'), source: 'koto', sourceLabel: 'KOTO', category: 'Community Event', location: 'Ridgway Town Park' },
    { title: 'Ridgway Farmers Market Opening Day', link: calLink, description: '10:00 AM – 2:00 PM · Season opener for the Ridgway Farmers Market with local produce and artisan vendors.', pubDate: new Date('2026-04-05T12:00:00'), source: 'koto', sourceLabel: 'KOTO', category: 'Community Event', location: 'Ridgway Town Hall' },
    { title: 'Ophir Community Dinner', link: calLink, description: '6:00 PM · Monthly community gathering. Bring a dish to share with neighbors.', pubDate: new Date('2026-04-04T12:00:00'), source: 'koto', sourceLabel: 'KOTO', category: 'Community Event', location: 'Ophir Town Hall' },
    { title: 'Ophir Spring Trail Day', link: calLink, description: '9:00 AM – 1:00 PM · Volunteer trail maintenance and cleanup to prepare trails for summer season.', pubDate: new Date('2026-04-13T12:00:00'), source: 'koto', sourceLabel: 'KOTO', category: 'Community Event', location: 'Ophir, CO' },
    { title: 'Placerville Community Cleanup', link: calLink, description: '9:00 AM – 12:00 PM · Spring cleanup and beautification. Gloves and bags provided.', pubDate: new Date('2026-04-06T12:00:00'), source: 'koto', sourceLabel: 'KOTO', category: 'Community Event', location: 'Placerville, CO' },
    { title: 'Placerville History Walk', link: calLink, description: '10:00 AM · Guided walk through historic Placerville sites and mining-era landmarks.', pubDate: new Date('2026-04-10T12:00:00'), source: 'koto', sourceLabel: 'KOTO', category: 'Community Event', location: 'Placerville General Store' }
  ];
}

// ── Fetch Wilkinson Public Library Events ──
function fetchWilkinsonEvents() {
  // Reads from WILKINSON_EVENTS, populated server-side every 6h
  if (typeof WILKINSON_EVENTS !== 'undefined' && Array.isArray(WILKINSON_EVENTS) && WILKINSON_EVENTS.length > 0) {
    return WILKINSON_EVENTS;
  }
  const libBase = 'https://telluridelibrary.libcal.com/event/';
  const libHome = 'https://telluridelibrary.org/events/';
  return [
    { title: 'Gentle Yoga with Kristen Milord', link: libBase + '16001885', description: '11:00 AM · Breathe, stretch, and reset with gentle yoga. Free, accessible class open to all levels—no prior experience needed.', pubDate: new Date('2026-03-29T12:00:00'), source: 'wilkinson', sourceLabel: 'Wilkinson Library', category: 'Community Event', location: 'Wilkinson Public Library, Magazine Room', imageUrl: 'https://d68g328n4ug0e.cloudfront.net/data/feat_img/6460/19928/1760648738.png' },
    { title: 'Drop-In Tech Time with Oliver', link: libBase + '15970367', description: '1:00 PM · Bring your questions about technology—phones, tablets, laptops, email and more.', pubDate: new Date('2026-03-29T12:00:00'), source: 'wilkinson', sourceLabel: 'Wilkinson Library', category: 'Community Event', location: 'Wilkinson Public Library, 2nd Floor Desk', imageUrl: 'https://d68g328n4ug0e.cloudfront.net/data/feat_img/6460/19928/1714410099.jpg' },
    { title: 'Tea and Tarot', link: libBase + '15891410', description: '2:30 PM · Tea and Tarot Sessions with Jade Rose and Sanctuary Collective. Seating is limited; sign up in advance.', pubDate: new Date('2026-03-29T12:00:00'), source: 'wilkinson', sourceLabel: 'Wilkinson Library', category: 'Community Event', location: 'Wilkinson Public Library, Telluride Room', imageUrl: 'https://d68g328n4ug0e.cloudfront.net/data/feat_img/6460/19928/1746566095.png' },
    { title: 'Desserts and Doc: Sergio Dondoli\u2019s Happy Life & Gelato', link: 'https://koto.org/event/desserts-and-doc-sergio-dondolis-happy-life-gelato/', description: '1:30 PM \u00B7 Documentary about master gelato-maker Sergio Dondoli\u2019s rise from humble origins to renowned Tuscan gelateria. Gelato served after the screening.', pubDate: new Date('2026-03-30T12:00:00'), source: 'wilkinson', sourceLabel: 'Wilkinson Library', category: 'Community Event', location: 'Wilkinson Public Library, 100 W Pacific Ave', imageUrl: 'https://koto.org/wp-content/uploads/2026/03/desserts-doc-3-1.png' },
    { title: 'Meet & Greet with Boulder DA Michael Dougherty', link: 'https://koto.org/event/meet-greet-with-boulder-da-michael-dougherty-candidate-for-colorado-attorney-general/', description: '3:30 PM \u00B7 Meet Boulder DA and candidate for Colorado Attorney General Michael Dougherty.', pubDate: new Date('2026-03-30T12:00:00'), source: 'wilkinson', sourceLabel: 'Wilkinson Library', category: 'Community Event', location: 'Wilkinson Public Library, 100 W Pacific Ave', imageUrl: 'https://koto.org/wp-content/uploads/2026/03/Telluride-Meet-and-Greet-4-3.png' },
    { title: 'Yin Yang Yoga with Miriah', link: libBase + '15968291', description: '10:00 AM · A combination of Vinyasa Flow incorporating Hatha and Kundalini with Yin Restorative poses. Free and open to all skill levels.', pubDate: new Date('2026-04-01T12:00:00'), source: 'wilkinson', sourceLabel: 'Wilkinson Library', category: 'Community Event', location: 'Wilkinson Public Library, Program Room', imageUrl: 'https://d68g328n4ug0e.cloudfront.net/data/feat_img/6460/19928/1765919021.jpg' },
    { title: 'Mah-Jongg for Independent Players', link: libBase + '16226876', description: '3:00 PM · Friendly afternoon games of mah-jongg. Bring your own cards or use loaner sets provided by the library.', pubDate: new Date('2026-04-01T12:00:00'), source: 'wilkinson', sourceLabel: 'Wilkinson Library', category: 'Community Event', location: 'Wilkinson Public Library, Magazine Room', imageUrl: 'https://d68g328n4ug0e.cloudfront.net/data/feat_img/6460/19928/1768508640.jpg' },
    { title: 'Adults Learn D&D', link: 'https://koto.org/event/adults-learn-dd/', description: '4:00 PM \u00B7 Learn to play Dungeons & Dragons in a 2-hour class with local DM Kase. Get a character, learn the basics, and play a short campaign. Registration required; bring a laptop if possible.', pubDate: new Date('2026-04-01T12:00:00'), source: 'wilkinson', sourceLabel: 'Wilkinson Library', category: 'Community Event', location: 'Wilkinson Public Library, 100 W Pacific Ave' },
    { title: 'Songs of the Season: Spring!', link: libBase + '16258323', description: '5:30 PM · Seasonal Sing Along with Oliver & Jackson. Bring an instrument, just your voice, or dancing shoes.', pubDate: new Date('2026-04-01T12:00:00'), source: 'wilkinson', sourceLabel: 'Wilkinson Library', category: 'Community Event', location: 'Wilkinson Public Library, Magazine Room', imageUrl: 'https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_03_04_16_11_47.jpg' },
    { title: 'Pilates for All Bodies', link: libBase + '16006633', description: '12:30 PM · Join Laura Colbert for Pilates. Free and open to the public, all bodies and experience levels welcome.', pubDate: new Date('2026-04-02T12:00:00'), source: 'wilkinson', sourceLabel: 'Wilkinson Library', category: 'Community Event', location: 'Wilkinson Public Library, Program Room', imageUrl: 'https://d68g328n4ug0e.cloudfront.net/data/feat_img/6460/19928/1732228821.jpg' },
    { title: 'Gentle Yoga with Kristen Milord', link: libBase + '16001885', description: '11:00 AM · Breathe, stretch, and reset with gentle yoga. Free, accessible class open to all levels.', pubDate: new Date('2026-04-05T12:00:00'), source: 'wilkinson', sourceLabel: 'Wilkinson Library', category: 'Community Event', location: 'Wilkinson Public Library, Magazine Room', imageUrl: 'https://d68g328n4ug0e.cloudfront.net/data/feat_img/6460/19928/1760648738.png' },
    { title: 'Drop-In Tech Time with Oliver', link: libBase + '15970367', description: '1:00 PM · Bring your tech questions—phones, tablets, laptops, email and more.', pubDate: new Date('2026-04-05T12:00:00'), source: 'wilkinson', sourceLabel: 'Wilkinson Library', category: 'Community Event', location: 'Wilkinson Public Library, 2nd Floor Desk', imageUrl: 'https://d68g328n4ug0e.cloudfront.net/data/feat_img/6460/19928/1714410099.jpg' },
    { title: 'Tea and Tarot', link: libBase + '15891410', description: '2:30 PM · Tea ceremony and tarot sessions with Jade Rose and Sanctuary Collective. Seating limited.', pubDate: new Date('2026-04-05T12:00:00'), source: 'wilkinson', sourceLabel: 'Wilkinson Library', category: 'Community Event', location: 'Wilkinson Public Library, Telluride Room', imageUrl: 'https://d68g328n4ug0e.cloudfront.net/data/feat_img/6460/19928/1746566095.png' },
    { title: 'Strings in the Stacks', link: libBase + '16549815', description: '12:00 PM · Live violin music from violinist Annie Foxen. Classical, Celtic, and folk tunes. Free, all ages.', pubDate: new Date('2026-04-06T12:00:00'), source: 'wilkinson', sourceLabel: 'Wilkinson Library', category: 'Community Event', location: 'Wilkinson Public Library, Magazine Room', imageUrl: 'https://d68g328n4ug0e.cloudfront.net/data/feat_img/6460/19928/1769020935.jpg' },
    { title: 'Drop in Ping Pong', link: 'https://koto.org/event/drop-in-ping-pong/', description: '10:00 AM \u00B7 Drop by for casual table tennis. Our ping pong table will be set up for players of all ages and skill levels. No sign-up needed\u2014just show up and play.', pubDate: new Date('2026-04-10T12:00:00'), source: 'wilkinson', sourceLabel: 'Wilkinson Library', category: 'Community Event', location: 'Wilkinson Public Library, Program Room', imageUrl: 'https://koto.org/wp-content/uploads/2026/03/april-ping.png' },
    { title: 'Bilingual Balance in Motion', link: libBase + '16535245', description: '10:00 AM · Dynamic bilingual class led by Lauren Norton. Pilates, dance, yoga, and breathwork. All levels welcome.', pubDate: new Date('2026-04-11T12:00:00'), source: 'wilkinson', sourceLabel: 'Wilkinson Library', category: 'Community Event', location: 'Wilkinson Public Library, Program Room', imageUrl: 'https://d68g328n4ug0e.cloudfront.net/data/feat_img/6460/19928/1740003527.jpg' }
  ];
}

// ── Fetch approved community events from community-events.json ──
// ── Fetch approved community events from GitHub Issues ──
// Issues with label "approved-event" are parsed for event data from the issue body.
// Issue body format uses YAML-style key: value pairs between --- markers.
async function fetchCommunityEvents() {
  try {
    const resp = await fetch('https://api.github.com/repos/morgan524/morgan524-telluride-gov-hub/issues?labels=approved-event&state=open&per_page=50', { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) { console.warn('[GovHub] GitHub Issues API returned', resp.status); return []; }
    const issues = await resp.json();
    if (!Array.isArray(issues)) return [];
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const events = [];
    issues.forEach(issue => {
      try {
        const body = issue.body || '';
        // Parse key: value pairs from issue body
        const get = (key) => { const m = body.match(new RegExp('^' + key + ':\\s*(.+)$', 'mi')); return m ? m[1].trim() : ''; };
        const name = get('Event') || issue.title.replace(/^\[Event\]\s*/i, '');
        const dateStr = get('Date');
        if (!dateStr) return; // skip issues without a date
        const pubDate = new Date(dateStr);
        if (isNaN(pubDate)) return;
        if (pubDate < now) return; // skip past events
        events.push({
          title: name,
          link: get('URL') || get('Website') || '',
          description: smartTruncate(get('Description') || '', EVENT_DESC_MAX),
          pubDate: pubDate,
          source: 'community',
          sourceLabel: 'Community',
          category: 'Community Event',
          location: get('Location') || '',
          imageUrl: get('Image') || '',
          eventTimes: get('Time') || '',
          ticketUrl: get('Tickets') || get('TicketURL') || '',
          endDate: get('EndDate') ? new Date(get('EndDate')) : null,
          githubIssue: issue.html_url
        });
      } catch(e) { /* skip malformed issues */ }
    });
    return events;
  } catch(e) {
    console.warn('[GovHub] Community events fetch failed:', e.message);
    return [];
  }
}

// ── Fetch Telluride Jewish Community Events ──
// Squarespace site at telluridejewishcommunity.com publishes a JSON event
// feed at /events?format=json. Reads from TJC_EVENTS const first (future
// bot-populated path); otherwise live-fetches via the existing CORS proxies.
async function fetchTellurideJewishEvents() {
  if (typeof TJC_EVENTS !== 'undefined' && Array.isArray(TJC_EVENTS) && TJC_EVENTS.length > 0) {
    return TJC_EVENTS;
  }
  const TJC_URL = 'https://www.telluridejewishcommunity.com/events?format=json';
  try {
    let json;
    try {
      const resp = await fetch(CODETABS_PROXY + encodeURIComponent(TJC_URL));
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      json = await resp.json();
    } catch (e1) {
      const resp2 = await fetch(ALLORIGINS_PROXY + encodeURIComponent(TJC_URL));
      if (!resp2.ok) throw new Error('Fallback HTTP ' + resp2.status);
      json = await resp2.json();
    }
    const upcoming = Array.isArray(json && json.upcoming) ? json.upcoming : [];
    return upcoming.map(ev => {
      const loc = ev.location || {};
      const locParts = [loc.addressTitle, loc.addressLine1, loc.addressLine2].filter(Boolean);
      const locStr = locParts.length ? locParts.join(', ') : 'Telluride, CO';
      return {
        title: (ev.title || '').trim(),
        link: ev.fullUrl ? 'https://www.telluridejewishcommunity.com' + ev.fullUrl : 'https://www.telluridejewishcommunity.com/events',
        description: smartTruncate((ev.excerpt || '').trim(), EVENT_DESC_MAX),
        summary: (ev.excerpt || '').trim().slice(0, 280),
        pubDate: ev.startDate ? new Date(ev.startDate) : null,
        source: 'tjc',
        sourceLabel: 'Telluride Jewish Community',
        category: 'Community Event',
        location: locStr,
        imageUrl: ev.assetUrl || ''
      };
    }).filter(it => it.title && it.pubDate);
  } catch (err) {
    console.warn('[GovHub] TJC events fetch failed:', err.message);
    return [];
  }
}

// ── Fetch Telluride Foundation Events ──
// Reads from the hardcoded TELLURIDE_FOUNDATION_EVENTS const above —
// telluridefoundation.org/tf-events/ has no public events API, so the
// list is maintained manually. See the const for refresh instructions.
function fetchTellurideFoundationEvents() {
  if (typeof TELLURIDE_FOUNDATION_EVENTS !== 'undefined' && Array.isArray(TELLURIDE_FOUNDATION_EVENTS)) {
    return TELLURIDE_FOUNDATION_EVENTS;
  }
  return [];
}

// ── Fetch EcoAction Partners Events ──
// ecoactionpartners.org is a Squarespace site exposing /events?format=json
// (same pattern as Telluride Jewish Community).
async function fetchEcoActionEvents() {
  const ECO_URL = 'https://ecoactionpartners.org/events?format=json';
  try {
    let json;
    try {
      const resp = await fetch(CODETABS_PROXY + encodeURIComponent(ECO_URL));
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      json = await resp.json();
    } catch (e1) {
      const resp2 = await fetch(ALLORIGINS_PROXY + encodeURIComponent(ECO_URL));
      if (!resp2.ok) throw new Error('Fallback HTTP ' + resp2.status);
      json = await resp2.json();
    }
    const upcoming = Array.isArray(json && json.upcoming) ? json.upcoming : [];
    return upcoming.map(ev => {
      const loc = ev.location || {};
      const locParts = [loc.addressTitle, loc.addressLine1, loc.addressLine2].filter(Boolean);
      const locStr = locParts.length ? locParts.join(', ') : 'Telluride, CO';
      return {
        title: (ev.title || '').trim(),
        link: ev.fullUrl ? 'https://ecoactionpartners.org' + ev.fullUrl : 'https://ecoactionpartners.org/events',
        description: smartTruncate((ev.excerpt || '').trim(), EVENT_DESC_MAX),
        summary: (ev.excerpt || '').trim().slice(0, 280),
        pubDate: ev.startDate ? new Date(ev.startDate) : null,
        source: 'eco',
        sourceLabel: 'EcoAction Partners',
        category: 'Community Event',
        location: locStr,
        imageUrl: ev.assetUrl || ''
      };
    }).filter(it => it.title && it.pubDate);
  } catch (err) {
    console.warn('[GovHub] EcoAction events fetch failed:', err.message);
    return [];
  }
}


// ── Fetch Alibi Telluride events ──
// alibitelluride.com is a Squarespace site with the standard
// /calendar?format=json endpoint (same pattern as TJC and EcoAction).
async function fetchAlibiEvents() {
  const ALIBI_URL = 'https://www.alibitelluride.com/calendar?format=json';
  try {
    let json;
    try {
      const resp = await fetch(CODETABS_PROXY + encodeURIComponent(ALIBI_URL));
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      json = await resp.json();
    } catch (e1) {
      const resp2 = await fetch(ALLORIGINS_PROXY + encodeURIComponent(ALIBI_URL));
      if (!resp2.ok) throw new Error('Fallback HTTP ' + resp2.status);
      json = await resp2.json();
    }
    const upcoming = Array.isArray(json && json.upcoming) ? json.upcoming : [];
    return upcoming.map(ev => {
      const loc = ev.location || {};
      const locParts = [loc.addressTitle, loc.addressLine1, loc.addressLine2].filter(Boolean);
      const locStr = locParts.length ? locParts.join(', ') : 'Alibi, Telluride, CO';
      return {
        title: (ev.title || '').trim(),
        link: ev.fullUrl ? 'https://www.alibitelluride.com' + ev.fullUrl : 'https://www.alibitelluride.com/calendar',
        description: smartTruncate((ev.excerpt || '').trim(), EVENT_DESC_MAX),
        summary: (ev.excerpt || '').trim().slice(0, 280),
        pubDate: ev.startDate ? new Date(ev.startDate) : null,
        source: 'alibi',
        sourceLabel: 'Alibi Telluride',
        category: 'Community Event',
        location: locStr,
        imageUrl: ev.assetUrl || ''
      };
    }).filter(it => it.title && it.pubDate);
  } catch (err) {
    console.warn('[GovHub] Alibi events fetch failed:', err.message);
    return [];
  }
}

// ── Fetch Sheridan Opera House Events ──
// sheridanoperahouse.com uses Modern Events Calendar (MEC) WordPress plugin,
// which doesn't expose dates via WP REST cleanly. Easier path: scrape the
// /events/ HTML page directly — MEC renders each event with stable structural
// classes (mec-event-article, mec-event-title, mec-start-date-label).
//
// Excludes events whose title contains "private" (per Morgan's request).
async function fetchSheridanOperaHouseEvents() {
  const SOH_URL = 'https://sheridanoperahouse.com/events/';
  try {
    let html;
    try {
      const resp = await fetch(CODETABS_PROXY + encodeURIComponent(SOH_URL));
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      html = await resp.text();
    } catch (e1) {
      const resp2 = await fetch(ALLORIGINS_PROXY + encodeURIComponent(SOH_URL));
      if (!resp2.ok) throw new Error('Fallback HTTP ' + resp2.status);
      html = await resp2.text();
    }
    // Each event is an <article class="mec-event-article ...">.
    // Split the page on the article opening tag, then take everything between
    // splits — captures all articles regardless of terminator, including the last.
    const articles = html.split(/(?=<article[^>]*class="[^"]*mec-event-article[^"]*")/)
      .filter(s => /^<article[^>]*class="[^"]*mec-event-article[^"]*"/.test(s));
    const out = [];
    for (const block of articles) {
      // Title + link
      const tm = block.match(/<h4[^>]*class="[^"]*mec-event-title[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/);
      if (!tm) continue;
      const link = tm[1];
      const title = tm[2].replace(/&#?\w+;/g, m => ({'&amp;':'&','&#8211;':'–','&#8212;':'—','&quot;':'"','&#039;':"'"}[m] || m)).trim();
      // Skip private events
      if (/\bprivate\b/i.test(title)) continue;
      // Date — "May 21 - 25 2026" or "May 21 2026"
      const dm = block.match(/<span[^>]*class="[^"]*mec-start-date-label[^"]*"[^>]*>([^<]+)<\/span>/);
      const dateStr = dm ? dm[1].trim() : '';
      // Parse: extract month, day, year (use first day if a range like "May 21 - 25 2026")
      const dpm = dateStr.match(/([A-Za-z]+)\s+(\d{1,2})(?:\s*-\s*\d{1,2})?\s+(\d{4})/);
      let pubDate = null;
      if (dpm) {
        pubDate = new Date(`${dpm[1]} ${dpm[2]}, ${dpm[3]} 19:00:00`); // 7 PM default
        if (isNaN(pubDate.getTime())) pubDate = null;
      }
      // Image
      const im = block.match(/<img[^>]+src="([^"]+)"[^>]*class="attachment-thumbnail/);
      out.push({
        title: title,
        link: link,
        description: '',
        summary: '',
        pubDate: pubDate,
        source: 'soh',
        sourceLabel: 'Sheridan Opera House',
        category: 'Community Event',
        location: 'Sheridan Opera House, Telluride, CO',
        imageUrl: im ? im[1] : ''
      });
    }
    return out.filter(it => it.title && it.pubDate);
  } catch (err) {
    console.warn('[GovHub] Sheridan Opera House events fetch failed:', err.message);
    return [];
  }
}

// ── Fetch Ouray-Ridgway Events Calendar ──
// events.ourayridgwayevents.com runs on Localist (calendar SaaS). Public
// JSON API at /api/2/events. The ?school=ridgwayouray filter scopes to
// the Ridgway-Ouray area, but the calendar still includes events at
// out-of-area venues (Montrose Pavilion, etc.) — those get filtered by
// the existing isWithinServiceArea() check downstream in renderNews.

// ── Ouray County government calendar (non-governmental events only) ──
// Bot writes here every 6 hours via scripts/content-refresh.js's
// syncOurayCountyEvents(). The CivicEngage iCal feed at
// ouraycountyco.gov includes BOCC + City Council + community events; we drop
// gov meetings at bake time so this array contains only community events
// (e.g., Wildfire Aware Fair, water summits).
const OURAY_COUNTY_EVENTS = [
  {
    title: "CC4CA 2026 Annual Meeting",
    link: "https://ouraycountyco.gov/Calendar.aspx?EID=3473",
    description: "Two or more Ouray County Commissioners may attend and participate in this event. https://ouraycountyco.gov/calendar.aspx?EID=3473",
    pubDate: "2026-06-10T12:00:00.000Z",
    source: "ouraycounty",
    sourceLabel: "Ouray County",
    category: "Community Event",
    location: "- Vail CO 81657",
    imageUrl: ""
  },
  {
    title: "Love Your Trail Day",
    link: "https://ouraycountyco.gov/Calendar.aspx?EID=3642",
    description: "Two or more Ouray County Commissioners may attend and participate in this event. https://ouraycountyco.gov/calendar.aspx?EID=3642",
    pubDate: "2026-06-06T08:00:00.000Z",
    source: "ouraycounty",
    sourceLabel: "Ouray County",
    category: "Community Event",
    location: "Uncompahgre River Walk - Ouray CO 81427",
    imageUrl: ""
  },
  {
    title: "Ouray County EMS Dinner - Community Needs Assessment Follow-Up",
    link: "https://ouraycountyco.gov/Calendar.aspx?EID=3645",
    description: "Two or more Ouray County Commissioners may attend and participate in this event. https://ouraycountyco.gov/calendar.aspx?EID=3645",
    pubDate: "2026-05-25T17:00:00.000Z",
    source: "ouraycounty",
    sourceLabel: "Ouray County",
    category: "Community Event",
    location: "- Ouray CO 81427",
    imageUrl: ""
  },
  {
    title: "West Slope Water Summit",
    link: "https://ouraycountyco.gov/Calendar.aspx?EID=3637",
    description: "Two or more Ouray County Commissioners may attend and participate in this event. https://ouraycountyco.gov/calendar.aspx?EID=3637",
    pubDate: "2026-05-19T07:30:00.000Z",
    source: "ouraycounty",
    sourceLabel: "Ouray County",
    category: "Community Event",
    location: "Montrose County Event Center - 1036 N 7th St Montrose CO 81401",
    imageUrl: ""
  }
];

function fetchOurayCountyEvents() {
  if (typeof OURAY_COUNTY_EVENTS !== 'undefined' && Array.isArray(OURAY_COUNTY_EVENTS)) {
    return OURAY_COUNTY_EVENTS.map(ev => Object.assign({}, ev, {
      pubDate: ev.pubDate ? new Date(ev.pubDate) : null
    })).filter(ev => ev.pubDate && !isNaN(ev.pubDate.getTime()));
  }
  return [];
}

// Bot writes here every 6 hours via scripts/content-refresh.js's
// syncOurayRidgwayEvents(). Uses the Localist JSON API at
// events.ourayridgwayevents.com/api/2/events?school=ridgwayouray — government
// meetings are filtered out at bake time so this array contains only
// community events (concerts, workshops, sports, fairs, etc.).
// fetchOurayRidgwayEvents() prefers this const when non-empty and falls
// back to a live Localist API call for the initial zero-data state.
const OURAY_RIDGWAY_EVENTS = [
  {
    title: "OPEN MIC / JAM NIGHT w/ host DJ Strong",
    link: "www.FloatingLotusBrewery.com",
    description: "Join us at the Lotus for a midweek tradition that brings together musicians, music lovers, and the incredible local talent that makes our community shine. From intimate solo sets to full-band jam sessions with rotating players, Open Mic Night is always full of surprises. Want to play? We’d love to have you — signups begin at 5:30pm. Just bring your instrument and your creativity, and we’ll take care of the rest. Our stage is fully equipped with PA, mics, drums, bass, and everything you need to plug in and play. 🎟️ Free admission 🍻 Grab a beer, settle in, and enjoy the show Come be part of the music — on stage or in the crowd!",
    pubDate: "2026-05-14T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52523630382868/huge/ed08b494666358349bc84e969db6e8b262ef71aa.jpg"
  },
  {
    title: "Paint & Sip with Nicole: \"Morning Peaks\"",
    link: "https://anc.apm.activecommunities.com/weehawkenarts/activity/search/detail/5875?onlineSiteId=0&from_original_cui=true",
    description: "Paint & Sip with Nicole: \"Morning Peaks\" Cora Annex, Ridgway 6:30pm-8:30pm $49 incl. all supplies and an adult beverage Registration: www.weehawkenarts.org Unwind, sip, and create! Join us for a relaxed painting session designed for all skill levels—no experience needed. Nicole will guide you through the featured painting while you enjoy a beverage of your choice! All art supplies and one adult beverage are included; just bring your creativity! About Nicole Greenfield: Nicole Greenfield is a painter based in Ridgway, Colorado. Working primarily in acrylic and oil, she creates expressive portraits and atmospheric landscapes that explore the quiet intimacy found in observing people and the natural world. Nicole is a self-taught artist who has developed her skills through years of dedicated practice and online learning. …",
    pubDate: "2026-05-14T00:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52648457990305/huge/7eef9fbe8e9e42d17143c05cd7a3e8515b667f56.jpg"
  },
  {
    title: "CHLOE KIMES ~ Live at the Sherbino with Heather & Douglas Opening!",
    link: "https://sherbino.org/events/category/music/",
    description: "CHLOE KIMES || Doors at 6:30 pm || Heather & Douglas at 6:45 pm || Chloe Kimes at 7:30 pm $25 advance / $28 at the door || Limited reserved seating available Chloe Kimes is described as a “storyteller-in-the-making” with a timeless sound rooted in Americana traditions. Fronting a spirited alt-country band, she is quickly emerging as one of the most compelling new voices in contemporary folk and alt-country. A live performance of her song “Coors Light” at WDVX’s Blue Plate Special in Knoxville went viral, amassing more than 4 million views across social media in just one week. In response to overwhelming demand, Kimes recorded a studio version at RCA Studio A with producer Phillip Smith and released the single within weeks of its online debut. Chloe is a Michigan-born singer, songwriter, and bandleader currently based in Nashville, TN. …",
    pubDate: "2026-05-14T00:45:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52403015268588/huge/ccccef9e7c2dcfc1f1f688551bd0ff7ef17953ec.jpg"
  },
  {
    title: "A Minecraft Movie: Movie Night @ the Wright",
    link: "https://thewrightoperahouse.org/",
    description: "A Minecraft Movie: Movie Night @ the Wright WHEN? Wednesday, May 13 Doors at 6:30 pm • Movie at 7:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado RUN TIME: 1h 45min RATING: PG ABOUT THE FILM A Minecraft Movie (2025) transports audiences into the imaginative, block-built world of Minecraft, where creativity is the key to survival. When an unexpected threat emerges, a group of unlikely heroes must learn to craft, build, and work together to protect their world from destruction. A colorful adventure about teamwork, creativity, and the power of imagination. Tickets $5 In-person screening at the historic Wright Opera House Concessions available. Part of Movie Night @ the Wright, bringing film, community, and conversation to downtown Ouray since 1909.",
    pubDate: "2026-05-14T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52391676764493/huge/375fc7e31f07d1029c24c49de31c3547af1a53ee.jpg"
  },
  {
    title: "Ouray Economic Development Committee",
    link: "https://events.ourayridgwayevents.com/event/ouray-economic-development-committee",
    description: "The Ouray Economic Development Committee (OEDC) works as the liaison between the City and the local business community. This includes creating and implementing an Economic Development Plan and economic development incentives to best serve the business community and to align with programs that induce private investment enterprises and commerce. The committee also explores regional economic development efforts with the Town of Ridgway and Ouray County as well as is tasked with developing a Business Expansion and Retention (BEAR) program, participating in policy discussions and revisions to community planning documents, and making recommendations to the City Council about economic incentive requests.",
    pubDate: "2026-05-14T14:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52092297170097/huge/a4669339e18604293e5cc63dffd58e4d928eee49.jpg"
  },
  {
    title: "Pilates Mat",
    link: "https://ridgwaypilates.punchpass.com/catalogs/300",
    description: "All Levels Pilates Mat class. Classical sequence Int to challenge, strengthen and stretch you wehole body. Every Thursday at 9:30am. Pricing Four lessons for $120 Eight lessons for $200 Become a member and pay $100/month to attend weekly. Purchase a pass here: https://ridgwaypilates.punchpass.com/catalogs/300 Class is limited to six people. Mats are included. Please wear socks, put your hair up and choose clothing free of metal.",
    pubDate: "2026-05-14T15:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52576058290647/huge/ab41effebba96d758d6c4061ee6bdc28e09bd4e0.jpg"
  },
  {
    title: "On Display: Layers of Faces and Life-Paintings by Ruth Higdon and Julie Ahern",
    link: "https://events.ourayridgwayevents.com/event/layers-of-faces-and-life-paintings-by-ruth-higdon-and-julie-ahern",
    description: "A duo exhibition of new works by local painters Julie Ahern and Ruth Higdon. More info decker@ridgwayfuse.org",
    pubDate: "2026-05-14T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52709680184864/huge/bf651b7d434184420bcaf9702ff358cbd88d3b9e.jpg"
  },
  {
    title: "COMEDY NIGHT",
    link: "www.FloatingLotusBrewery.com",
    description: "Bohemian Boys Comedy Club Returns to the Lotus The laughs are back—uncensored and unapologetic. Bohemian Boys Comedy Club is returning to Floating Lotus Brewery for a night of sharp, high-energy stand-up. Expect bold material, quick wit, and plenty of moments that push the line—in the best way. This is edgy, mature comedy intended for adults—not your average open mic, and definitely not for the easily offended. Grab a pint, find your seat, and settle in for a night that hits a little harder than your typical Thursday. Thursday, May 14th Show starts at 7PM $17 Advance / $20 at the Door Seats are limited, and these shows tend to fill up—advance tickets are strongly recommended. Come early, get comfortable, and get ready to laugh.",
    pubDate: "2026-05-15T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52648717659533/huge/649cc93da4bd5a03f9adfd8f7fe04a76ab80cda9.jpg"
  },
  {
    title: "THIRSTY THURSDAY - Game Night at Floating Lotus",
    link: "www.FloatingLotusBrewery.com",
    description: "Thirsty Thursday is where the week turns into the weekend. Every Thursday at Floating Lotus Brewery, we’re bringing the energy with Trivia Night (1st & 3rd) and Music Bingo (2nd & 4th). Cold beer, loud music, and a room full of people who came to have a good time. Happening 7-9pm every week",
    pubDate: "2026-05-15T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/52523770567385/huge/aa7bcfeb333ca9d6b01c43aa6294ed32c0d384e4.jpg"
  },
  {
    title: "Steps Tavern Presents Karaoke Night",
    link: "https://events.ourayridgwayevents.com/event/steps-tavern-presents-karaoke-night",
    description: "Steps Tavern Presents Karaoke Night. Doors Open at 7:00 PM. Karaoke Begins at 8:00 PM",
    pubDate: "2026-05-15T02:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "STEPS TAVERN",
    imageUrl: "https://localist-images.azureedge.net/photos/52633505531238/huge/33b9b47c734793a754893ee4e67227b39326b67b.jpg"
  },
  {
    title: "Full-Scale Evacuation Exercise",
    link: "https://events.ourayridgwayevents.com/event/full-scale-evacuation-exercise",
    description: "On May 15 from 9am -4pm, Ouray County will conduct a full-scale evacuation exercise utilizing resources from around the County, such as the City of Ouray, Town of Ridgway and County personnel. Residents can expect to see significant first responder activity in and around the Town of Ridgway during this time. This is only an exercise. There is no real emergency. Ouray County residents are encouraged to participate. Participation doesn not require that the scenario take place in your neighborhood. Citizens may volunteer to serve as: EvacueesInjured evacueesIndivisuals with access or functional needsFamily members searching for loved onesGeneral volunteers (roles will be assigned as needed)Residents interested in participating can sign up using the County's Google Form. For more details about this evacuation exercise, click here.",
    pubDate: "2026-05-15T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray County",
    imageUrl: "https://localist-images.azureedge.net/photos/52383007527888/huge/5b43c56ea03c7d9c8e3654fb03720c180817cbe3.jpg"
  },
  {
    title: "Faces, Flowers, Rock n Roll:  An Art Show",
    link: "FloatingLotusBrewery.com",
    description: "Join us for a weekend of color, character, and creative energy as we feature the work of Daniel Braddix—a true gentleman of the road whose journey from corporate life to wild places has shaped a deeply expressive style. From Big Sur to Maui and now Western Colorado, Daniel paints what he lives: faces full of soul, flowers bursting with life, and moments pulled straight from the edge of adventure. These pieces aren’t just paintings—they’re snapshots of a life lived outside, created in the mountains, deserts, and forests with canvas in one hand and the world in front of him. Come grab a pint, meet the artist, and experience a collection that’s equal parts beauty, grit, and rock n’ roll spirit.",
    pubDate: "2026-05-15T20:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52694643294251/huge/8faa7c02217ad28c65635d406cf8d44296cfa174.jpg"
  },
  {
    title: "Ridgway Bird Walks & Talks: Birds of Ridgway State Park",
    link: "https://weehawkenarts.org/education/adult-art-classes/",
    description: "Join Mike Campbell, a Colorado native, lifelong birder, retired educator, wildlife artist, bird banding educator, and Friends of Ridgway State Park board member, as he shares his experiences and knowledge of our local feathered friends and the environment we share during a guided Bird Walk & Talk in Ouray County. Small group sizes will allow the experience to be tailored to participants’ knowledge levels and interests. Times, meeting location, and any weather-related updates will be provided via email prior to the event. A waiver needs to be signed before the event. Please do so here. If you're having issues with registration, please email lexi@weehawkenarts.org.",
    pubDate: "2026-05-16T13:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52384803918022/huge/ed8181025b7e5e255684a399ff4439c3ac9982c8.jpg"
  },
  {
    title: "Free Community Shred Day",
    link: "https://events.ourayridgwayevents.com/event/shred-day",
    description: "Alpine Bank invites you to a free on-site document shredding day to securely dispose of unwanted documents with personal information. Staples and paperclips do not need to be removed. Limit 4 boxes per household and business. Donations accepted to benefit Girl Scouts of Colorado Troop #17986.",
    pubDate: "2026-05-16T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Alpine Bank Ridgway",
    imageUrl: "https://localist-images.azureedge.net/photos/52818545130383/huge/bf4754150c301fdc61316e2f73266ef866f46f02.jpg"
  },
  {
    title: "Trails Training for Crew Leaders",
    link: "volunteervoc.org",
    description: "Get hands-on with stewardship and leadership at Trails Training for Crew Leaders, hosted in partnership with Volunteer for Outdoor Colorado. This training is designed to prepare participants for the upcoming trail work project taking place May 30–31. Learn the fundamentals of trail building, crew leadership, and outdoor project coordination from experienced instructors while gaining practical skills you can apply directly in the field. Whether you’re new to trail work or looking to step into a leadership role, this is a great opportunity to build confidence and capability in a hands-on environment. Join us in supporting our public lands, connecting with like-minded volunteers, and getting ready to make a real impact on Ouray-area trails. Learn more or sign up at volunteervoc.org.",
    pubDate: "2026-05-16T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52701299047770/huge/1ff0d8d6513ba9eeb96ab4f991e91b8bfc689e77.jpg"
  },
  {
    title: "Cedar Hill Cemetery Spring Clean Up Day (Volunteer)",
    link: "https://events.ourayridgwayevents.com/event/cedar-hill-cemetery-spring-clean-up-day-volunteer",
    description: "Every year, the Friends of Cedar Hill Cemetery Non-Profit hosts a Spring Clean-up day to support the cemetery, honor those buried there, and clean up after the rams! (Yes, they really do knock over headstones to scratch an itch.) All are welcome to join us! Please bring gloves, gardening tools, and a smile :)",
    pubDate: "2026-05-16T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Cedar Hill Cemetery 18510 Highway 550, Ridgway, CO, United States, 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52772277266907/huge/d5a9dc9b64c78e0f660049ca5ab2d28cd0340139.jpg"
  },
  {
    title: "Ridgway Railroad Museum FREE Train Rides",
    link: "https://www.ridgwayrailroadmuseum.org/",
    description: "We will be operating our equipment on Fridays (starting May 29th) and Saturdays (starting May 9th) this spring, summer and fall in 2026. Come join us and enjoy a part of Ridgway history while riding on RGS Motor No. 1, RGS Goose No. 4, gasoline locomotive CW, and RGS Inspection Car No. 1.",
    pubDate: "2026-05-16T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52773804648328/huge/27ee9f278b677eb9bf13a8ee9463855e6db07a7c.jpg"
  },
  {
    title: "Faces, Flowers, Rock n Roll:  An Art Show",
    link: "FloatingLotusBrewery.com",
    description: "Join us for a weekend of color, character, and creative energy as we feature the work of Daniel Braddix—a true gentleman of the road whose journey from corporate life to wild places has shaped a deeply expressive style. From Big Sur to Maui and now Western Colorado, Daniel paints what he lives: faces full of soul, flowers bursting with life, and moments pulled straight from the edge of adventure. These pieces aren’t just paintings—they’re snapshots of a life lived outside, created in the mountains, deserts, and forests with canvas in one hand and the world in front of him. Come grab a pint, meet the artist, and experience a collection that’s equal parts beauty, grit, and rock n’ roll spirit.",
    pubDate: "2026-05-16T20:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52694643294251/huge/8faa7c02217ad28c65635d406cf8d44296cfa174.jpg"
  },
  {
    title: "Pint Night benefitting Minerva West",
    link: "www.FloatingLotusBrewery.com",
    description: "Hello Minerva Family and Friends! Join us next Saturday May 16th for a Minerva Mingle, 5th Season Celebration and Fundraiser!! Family Friendly Activities and Dance Party! 5 to 9 PM at Floating Lotus Brewery located at 144 Campbell Lane Ridgway, CO 81432 10% of sales for pints of Brews, two flavors of kombucha, and house-made sparkling lemonade will go to Minerva West as a donation. Thank you Kenny and Floating Lotus Brewery! Pizza slices, snacks and baked goods will be available for purchase. Bingo Rounds! $5 donation for a card and the winner takes half the pot. Round #1 @ 6PM. Round #2 @ 7PM 50/50 Donation Raffle: Drawing at 8:30 PM All evening Open Games: Cornhole, ping pong and table games. Dance Party @ 7:30PM Song requests encouraged! Thank You All for your support these last 4 seasons! …",
    pubDate: "2026-05-16T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/52878500753745/huge/657fb6ba45ea0009309e3927a2325634669c31b5.jpg"
  },
  {
    title: "Trails Training for Crew Leaders",
    link: "volunteervoc.org",
    description: "Get hands-on with stewardship and leadership at Trails Training for Crew Leaders, hosted in partnership with Volunteer for Outdoor Colorado. This training is designed to prepare participants for the upcoming trail work project taking place May 30–31. Learn the fundamentals of trail building, crew leadership, and outdoor project coordination from experienced instructors while gaining practical skills you can apply directly in the field. Whether you’re new to trail work or looking to step into a leadership role, this is a great opportunity to build confidence and capability in a hands-on environment. Join us in supporting our public lands, connecting with like-minded volunteers, and getting ready to make a real impact on Ouray-area trails. Learn more or sign up at volunteervoc.org.",
    pubDate: "2026-05-17T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52701299047770/huge/1ff0d8d6513ba9eeb96ab4f991e91b8bfc689e77.jpg"
  },
  {
    title: "Wildfire Workshop",
    link: "https://events.ourayridgwayevents.com/event/wildfire-workshop",
    description: "Join us to learn how to protect your property from wildfire with tips from local experts. Bring kids to explore fire trucks, meet your local responders, and enjoy burgers and hot dogs. There will be two dates you can join us! April 22, 2026 from 4-7 pm and May 17, 2026 from 12:30 - 3:30 pm located at the Ouray Fire Station.",
    pubDate: "2026-05-17T18:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Fire Station",
    imageUrl: "https://localist-images.azureedge.net/photos/52455176717624/huge/dc2edbe63a90246bbcc6cb6b2ca58c2ddfb9e403.jpg"
  },
  {
    title: "PARK - Ultimate Frisbee",
    link: "https://events.ourayridgwayevents.com/event/park-ultimate-frisbee",
    description: "Come play frisbee! Anyone is welcome.",
    pubDate: "2026-05-17T20:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Fellin Park",
    imageUrl: "https://localist-images.azureedge.net/photos/51807883052581/huge/9d7f0c7c4c96318902b1dfef1c3f821c9b3189d1.jpg"
  },
  {
    title: "Inner Yoga:  Breathwork & Meditation Workshop",
    link: "https://www.beetrueyou.com/",
    description: "Interested in breathwork and starting or deepening your meditation practice? Enjoy diving into ways to develop or deepen your home meditation practice. Includes an all levels yet gentle to moderate yoga class designed to support entering into a deep state of meditation. The class will begin with a moment of bhakti (chanting with harmonium) and a discussion and handout of tips on preparing for or deepening meditation. The class will end with 15 minutes of pranayama (breath work), 15 minutes of guided meditation, 5 minutes of silent seated meditation and 10 minutes of savasana with optional essential oils. Guided introspection on your intentions for your life can be included. Step out back into the world with a vibration of the peace of your soul from stillness and going within yourself. Presented by Elizabeth Lava of Bee True You.",
    pubDate: "2026-05-17T22:15:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52836703590513/huge/0b139551bb14658eac619d3a5a58309c54795221.jpg"
  },
  {
    title: "Ouray Softball Spring Training",
    link: "https://events.ourayridgwayevents.com/event/ouray-softball-spring-training",
    description: "Step onto the field for Ouray Softball Spring Training at Fellin Park. This preseason program is designed to shake off the rust, build skills, and get players ready for summer league action. Open to a range of ages and experience levels, spring training focuses on fundamentals, teamwork, and getting back into the rhythm of the game. Whether you're refining your swing, sharpening fielding skills, or just getting back in the game, it’s a great way to kick off the season. Come ready to play, connect with teammates, and enjoy spring evenings on the diamond in Ouray. Want to join a team, but you aren't already involved? Sign up Here!",
    pubDate: "2026-05-17T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52701275725771/huge/58498e59bf3c36b5491225bca2838359fa0701bd.jpg"
  },
  {
    title: "On Display: Layers of Faces and Life-Paintings by Ruth Higdon and Julie Ahern",
    link: "https://events.ourayridgwayevents.com/event/layers-of-faces-and-life-paintings-by-ruth-higdon-and-julie-ahern",
    description: "A duo exhibition of new works by local painters Julie Ahern and Ruth Higdon. More info decker@ridgwayfuse.org",
    pubDate: "2026-05-18T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52709680184864/huge/bf651b7d434184420bcaf9702ff358cbd88d3b9e.jpg"
  },
  {
    title: "Senior Lunch by Neighbor to Neighbor",
    link: "https://www.ourayneighbor.com/services",
    description: "Senior Lunch Every Monday Seniors meet to share a wonderful lunch, have a chance to socialize and enjoy an entertaining program. Transportation is provided. Neighbor to Neighbor, 970-325-4586.",
    pubDate: "2026-05-18T18:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/51631061496012/huge/ef9e5facb2d933bc015ffe261fc1ecd0508088c8.jpg"
  },
  {
    title: "WCOC After 5 Monthly Meeting",
    link: "www.womansclubouraycounty.org/",
    description: "The Woman's Club of Ouray County hosts WCOC After 5 the third Monday of each month. The \"WCOC After 5\" program has been developed in response for women in our community who cannot make the regular daytime meetings, however would like to be a part of the Woman's Club of Ouray County. This group will also be integral in the WCOC's Mission of Community Service and Philanthropy in Ouray County. Please visit the WCOC website for the location, speaker and meeting details. All Ouray County women are invited!",
    pubDate: "2026-05-18T23:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Please visit the WCOC website for location information",
    imageUrl: "https://localist-images.azureedge.net/photos/52338935097442/huge/c9303fa52ac8d19bebfdaf10538caf8eef7e84b4.jpg"
  },
  {
    title: "WCOC After 5 Monthly Meeting",
    link: "www.womansclubouraycounty.org/",
    description: "The Woman's Club of Ouray County hosts WCOC After 5 the third Monday of each month. The \"WCOC After 5\" program has been developed in response for women in our community who cannot make the regular daytime meetings, however would like to be a part of the Woman's Club of Ouray County. This group will also be integral in the WCOC's Mission of Community Service and Philanthropy in Ouray County. Please visit the WCOC website for the location, speaker and meeting details. All Ouray County women are invited!",
    pubDate: "2026-05-18T23:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Please check WCOC website for meeting location",
    imageUrl: "https://localist-images.azureedge.net/photos/52338935097442/huge/c9303fa52ac8d19bebfdaf10538caf8eef7e84b4.jpg"
  },
  {
    title: "Mid-Year Water Summit",
    link: "https://www.montrosecounty.net/891/West-Slope-Water-Summit",
    description: "Don’t miss this opportunity to join community leaders, experts, and stakeholders for important conversations about the future of water in our region. The event is free to the public, but registration is required. We hope to see you there! A complimentary breakfast will be provided. Our speakers include: Commissioner Sue HansenColorado River DistrictUncompahgre Valley Water Users Association (UVWUA)City of Montrose*Speakers are subject to change* Register online at: www.westslopewatersummit.com For questions, please call: 970-252-4508 or pr@montrosecounty.net",
    pubDate: "2026-05-19T13:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Montrose County Event Center",
    imageUrl: "https://localist-images.azureedge.net/photos/52807467209523/huge/c271b09abe97ea34769db4577f3e08c068afd95a.jpg"
  },
  {
    title: "On Display: Layers of Faces and Life-Paintings by Ruth Higdon and Julie Ahern",
    link: "https://events.ourayridgwayevents.com/event/layers-of-faces-and-life-paintings-by-ruth-higdon-and-julie-ahern",
    description: "A duo exhibition of new works by local painters Julie Ahern and Ruth Higdon. More info decker@ridgwayfuse.org",
    pubDate: "2026-05-19T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52709680184864/huge/bf651b7d434184420bcaf9702ff358cbd88d3b9e.jpg"
  },
  {
    title: "Woman's Club of Ouray County monthly meeting",
    link: "www.womansclubouraycounty.org/",
    description: "All Ouray County women are invited to attend the monthly meeting for the Woman's Club of Ouray County (WCOC). The WCOC, created in 1897, is a local philanthropic and community focused nonprofit organization. Monthly meetings include local speakers, a social hour and discussion regarding events to volunteer in and around Ouray County. For more information about the monthly meeting and the WCOC, please visit the organization's website.",
    pubDate: "2026-05-19T19:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52338847179921/huge/a804a495547d393d16494cf6fdbbd49572b64a68.jpg"
  },
  {
    title: "DONNY MORALES",
    link: "https://coloradoboydepot.com/calendar/",
    description: "Live Music\\ https://donnymorales.net/\\ https://coloradoboydepot.com/calendar/",
    pubDate: "2026-05-19T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "DONNY MORALES",
    link: "https://coloradoboydepot.com/calendar/",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/",
    pubDate: "2026-05-19T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Decker Room New Volunteer Orientation",
    link: "www.ridgwayfuse.org",
    description: "Join our wonderful volunteer team at the Decker! If you would like to help with Gallery Sitting during open hours, events, and more, please attend a New Volunteer Orientation to get started! You'll learn about the Decker Room and the events and programs that take place here. Volunteers should be able to commit to consistent volunteer hours each month! Email decker@ridgwayfuse.org for info and to RSVP.",
    pubDate: "2026-05-19T22:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52568082541214/huge/49b7c4c5e83ca4147b872fdb5be7fe87b78551c5.jpg"
  },
  {
    title: "Ridgway FUSE Creative Main Street - Committee Meeting",
    link: "https://www.ridgwayfuse.org/meetings",
    description: "Ridgway FUSE, a Creative District & Main Street Program, nurtures the cultural and economic vitality of Ridgway, Colorado All Ridgway FUSE Committee Meetings are open to the public. Click here for agendas and notes. Interested residents may apply to serve on the FUSE committee here. Email Tera Wick at twick@town.ridgway.co.us or call 970-626-5308 x 215 with questions.",
    pubDate: "2026-05-19T23:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52305506266326/huge/6f7fb94915fd0e9d2c59d779c91e1ffdf9538f60.jpg"
  },
  {
    title: "OPEN MIC / JAM NIGHT w/ host DJ Strong",
    link: "www.FloatingLotusBrewery.com",
    description: "Join us at the Lotus for a midweek tradition that brings together musicians, music lovers, and the incredible local talent that makes our community shine. From intimate solo sets to full-band jam sessions with rotating players, Open Mic Night is always full of surprises. Want to play? We’d love to have you — signups begin at 5:30pm. Just bring your instrument and your creativity, and we’ll take care of the rest. Our stage is fully equipped with PA, mics, drums, bass, and everything you need to plug in and play. 🎟️ Free admission 🍻 Grab a beer, settle in, and enjoy the show Come be part of the music — on stage or in the crowd!",
    pubDate: "2026-05-21T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52523630382868/huge/ed08b494666358349bc84e969db6e8b262ef71aa.jpg"
  },
  {
    title: "Elio: Movie Night @ the Wright",
    link: "https://thewrightoperahouse.org/",
    description: "Elio: Movie Night @ the Wright WHEN? Wednesday, May 20 Doors at 6:30 pm • Movie at 7:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado RUN TIME: 1h 45min RATING: PG ROTTEN TOMATOES SCORE: 83% ABOUT THE FILM Elio (2025) follows an imaginative young boy who unexpectedly finds himself transported across the universe and mistaken for Earth’s ambassador to an intergalactic council. Surrounded by strange worlds, alien civilizations, and cosmic misunderstandings, Elio must summon courage and creativity to represent humanity among the stars. A vibrant animated adventure about belonging, curiosity, and discovering where you fit in a very big universe. Tickets $5 In-person screening at the historic Wright Opera House Concessions available. Part of Movie Night @ the Wright, bringing film, community, and conversation to downtown Ouray since 1909.",
    pubDate: "2026-05-21T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52391721703307/huge/95ad92235ac82078ce4d6bac7b11bc8ed33c56dd.jpg"
  },
  {
    title: "Pilates Mat",
    link: "https://ridgwaypilates.punchpass.com/catalogs/300",
    description: "All Levels Pilates Mat class. Classical sequence Int to challenge, strengthen and stretch you wehole body. Every Thursday at 9:30am. Pricing Four lessons for $120 Eight lessons for $200 Become a member and pay $100/month to attend weekly. Purchase a pass here: https://ridgwaypilates.punchpass.com/catalogs/300 Class is limited to six people. Mats are included. Please wear socks, put your hair up and choose clothing free of metal.",
    pubDate: "2026-05-21T15:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52576058290647/huge/ab41effebba96d758d6c4061ee6bdc28e09bd4e0.jpg"
  },
  {
    title: "On Display: Layers of Faces and Life-Paintings by Ruth Higdon and Julie Ahern",
    link: "https://events.ourayridgwayevents.com/event/layers-of-faces-and-life-paintings-by-ruth-higdon-and-julie-ahern",
    description: "A duo exhibition of new works by local painters Julie Ahern and Ruth Higdon. More info decker@ridgwayfuse.org",
    pubDate: "2026-05-21T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52709680184864/huge/bf651b7d434184420bcaf9702ff358cbd88d3b9e.jpg"
  },
  {
    title: "Story and Craft Time",
    link: "https://events.ourayridgwayevents.com/event/story-and-craft-time",
    description: "Join us in the Ouray Library from 4:00 p.m. to 4:45 p.m. to hear some fantastic stories and then make a craft that relates to the stories! Ages: Elementary No sign up is required.",
    pubDate: "2026-05-21T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52763886924533/huge/0d6297caa05f50bc4a1998088745ab111521bfb3.jpg"
  },
  {
    title: "Creative Space: Artist Salon Series",
    link: "www.ridgwayfuse.org",
    description: "Join us for the inaugural Creative Space at the Decker Room. Inspired by our vibrant creative community, these monthly events are intended to build creative community across disciplines! With a different focus each time, we will keep things interesting and engaging! Anyone is welcome to attend, and creatives of all kinds are invited. We welcome your ideas for future events! Bring something to eat or drink to share! For our first salon, we will enjoy a performance by Ridgway’s youth voice ensemble. Then we will talk about supporting one another as a creative community! There will be time to socialize and brainstorm about future salon events! To learn more, ask questions, submit ideas, reach out to the Decker Room Coordinator, Arielle. decker@ridgwayfuse.org 872-772-9484",
    pubDate: "2026-05-22T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52825557353036/huge/60a36c794f611089746f024c76a091b947724470.jpg"
  },
  {
    title: "THIRSTY THURSDAY - Game Night at Floating Lotus",
    link: "www.FloatingLotusBrewery.com",
    description: "Thirsty Thursday is where the week turns into the weekend. Every Thursday at Floating Lotus Brewery, we’re bringing the energy with Trivia Night (1st & 3rd) and Music Bingo (2nd & 4th). Cold beer, loud music, and a room full of people who came to have a good time. Happening 7-9pm every week",
    pubDate: "2026-05-22T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/52523770567385/huge/aa7bcfeb333ca9d6b01c43aa6294ed32c0d384e4.jpg"
  },
  {
    title: "Steps Tavern Presents Karaoke Night",
    link: "https://events.ourayridgwayevents.com/event/steps-tavern-presents-karaoke-night",
    description: "Steps Tavern Presents Karaoke Night. Doors Open at 7:00 PM. Karaoke Begins at 8:00 PM",
    pubDate: "2026-05-22T02:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "STEPS TAVERN",
    imageUrl: "https://localist-images.azureedge.net/photos/52633505531238/huge/33b9b47c734793a754893ee4e67227b39326b67b.jpg"
  },
  {
    title: "OTG Overnight Trail Maintenance Trip: Cutler Complex",
    link: "https://ouraytrails.org/volunteers",
    description: "Enjoy some of the most scenic trails in Colorado while removing down trees or encroaching brush and repairing trails from erosion problems. You will leave the wild with the camaraderie that comes with meeting new friends and helping keep our public land trails safe and sustainable. Please register in advance to join this trail crew event, and participants must have current CPR and First Aid certifications. Click HERE to signup.",
    pubDate: "2026-05-22T14:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Culter Creek Complex",
    imageUrl: "https://localist-images.azureedge.net/photos/52789272870069/huge/81634184041be3beb87730d36ba522a5de675e5c.jpg"
  },
  {
    title: "Ridgway Farmers Market",
    link: "www.ridgwayfarmersmarket.com",
    description: "Ridgway Farmers Market WHERE LOCAL GROWS... in the soil, in our economy, and in the connections we share as a community Local farmers, ranchers, bakers, and artisans bring the best of Ridgway to town: fresh produce, handcrafted goods, and the shared belief that a strong community begins with supporting the people who live and work here.",
    pubDate: "2026-05-22T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52487561553294/huge/09a2d632a840b6a4d0303261c242753cb58a993a.jpg"
  },
  {
    title: "OLD MAN POLLY",
    link: "https://coloradoboydepot.com/calendar/",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/",
    pubDate: "2026-05-22T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Sherb Sidewalk Celebration ~ Ridgway ’26 Grad Parade",
    link: "https://sherbino.org/event/ridgway-grad-parade-celebration-sherbino/",
    description: "May 22 @ 5:30 pm – 7:30 pm Cheer on the Ridgway High School 2026 Graduates from the Sherbino and 610 Sidewalk May 22 | 5:30 ish –7:00 ish | In front of the Sherbino and 610 Arts Collective | Free | Drink Specials in the Sherb Celebrate the Ridgway High School Class of 2026 with one of the community’s favorite traditions—the graduation parade through town—and join us at the Sherbino for a front-row, high-energy viewing experience. Graduation begins at 5:30 p.m., and once the ceremony wraps, the parade rolls through Ridgway with graduates cruising Clinton Street to cheers from friends, family, and the community. The Sherbino and 610 Arts Collective sidewalk will be fully activated for the occasion, offering a welcoming and festive place to gather as we celebrate this milestone moment. …",
    pubDate: "2026-05-22T23:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52651419584519/huge/a3422816d62dbb83383d56cd64c5605b85439ba5.jpg"
  },
  {
    title: "OTG Overnight Trail Maintenance Trip: Cutler Complex",
    link: "https://ouraytrails.org/volunteers",
    description: "Enjoy some of the most scenic trails in Colorado while removing down trees or encroaching brush and repairing trails from erosion problems. You will leave the wild with the camaraderie that comes with meeting new friends and helping keep our public land trails safe and sustainable. Please register in advance to join this trail crew event, and participants must have current CPR and First Aid certifications. Click HERE to signup.",
    pubDate: "2026-05-23T06:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Culter Creek Complex",
    imageUrl: "https://localist-images.azureedge.net/photos/52789272870069/huge/81634184041be3beb87730d36ba522a5de675e5c.jpg"
  },
  {
    title: "Ridgway Railroad Museum FREE Train Rides",
    link: "https://www.ridgwayrailroadmuseum.org/",
    description: "We will be operating our equipment on Fridays (starting May 29th) and Saturdays (starting May 9th) this spring, summer and fall in 2026. Come join us and enjoy a part of Ridgway history while riding on RGS Motor No. 1, RGS Goose No. 4, gasoline locomotive CW, and RGS Inspection Car No. 1.",
    pubDate: "2026-05-23T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52773804648328/huge/27ee9f278b677eb9bf13a8ee9463855e6db07a7c.jpg"
  },
  {
    title: "Hands On History – Butter",
    link: "https://events.ourayridgwayevents.com/event/hands-on-history-butter",
    description: "Drop by the Ranch History Museum throughout the afternoon to make some butter with us! We’ll explore the history and various methods of churning butter while making (and tasting!) it ourselves. Fun for all ages.",
    pubDate: "2026-05-23T19:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52870247236290/huge/4feea89e13fdaede96752f502b9cb6ff04e7f824.jpg"
  },
  {
    title: "Ouray Art Walk",
    link: "https://www.visitouray.com/150",
    description: "This event invites the public to explore a vibrant outdoor market featuring a variety of art vendors showcasing and selling their work. Guests are welcome to stroll through the vendor tents, discover unique pieces, and connect with local artists in a relaxed, open-air setting. For those looking to elevate their experience, wine and charcuterie will be available with the purchase of a ticket ($32), offering a perfect way to sip, savor, and soak in the atmosphere. In addition, attendees are encouraged to extend their evening by attending the aerial performance at the Wright Opera House, adding a dynamic and artistic element to the overall experience. Whether you’re browsing, shopping, or indulging, this event offers something for everyone to enjoy.",
    pubDate: "2026-05-23T19:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Ouray Main Street",
    imageUrl: "https://localist-images.azureedge.net/photos/52092499507606/huge/c6fe9a874f25452ba50a6a5c74e2bc27f9eba0d4.jpg"
  },
  {
    title: "High Alpine Aerial presents “In Bloom” Student Showcase",
    link: "https://thewrightoperahouse.org/",
    description: "High Alpine Aerial presents “In Bloom” Student Showcase WHEN? Saturday, May 23 Doors at 2:30 pm • Show at 3:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE SHOW In Bloom is High Alpine Aerial’s student showcase featuring performers of all ages sharing their latest and greatest aerial acts. After months of practice and dedication, these emerging artists take the stage to celebrate growth, transformation, and artistic expression. Inspired by the spirit of spring, the showcase reflects renewal, courage, and the excitement of developing new skills. Students will present beautiful performances that highlight their hard work and creativity as they take flight in front of a live audience. …",
    pubDate: "2026-05-23T21:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52382499623067/huge/233cf973030c061bd362a704311e09888fd6c366.jpg"
  },
  {
    title: "Caricature Cartoon Artist; Cahoots Tavern",
    link: "https://www.cahootstavernouray.com/",
    description: "Following the Ouray Art walk, come down to Cahoots Tavern to get your very own caricature of yourself. What is a caricature artist? A visual artist who creates exaggerated, often humorous, or satirical portraits of people by highlighting their distinctive features. They distill a subject's likeness into a memorable, cartoon-like sketch, balancing accurate recognition with playful distortion. Cost is based on number of people included and color drawing vs black and white",
    pubDate: "2026-05-23T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52816363072518/huge/3d630e6fe662e543b92a27b21b52f0093a336d20.jpg"
  },
  {
    title: "High Alpine Aerial presents “In Bloom” Aerial Circ-lesque",
    link: "https://thewrightoperahouse.org/",
    description: "WHEN? Saturday, May 23 Doors at 6:30 pm • Show at 7:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE SHOW: In Bloom: Aerial Circ-lesque (2026) is an adults-only evening of aerial performance, circus artistry, and burlesque-inspired spectacle presented by High Alpine Aerial. Allow yourself to be transported into the lush gardens of In Bloom as a cast of professional performers delivers a dazzling variety of acts combining strength, grace, and theatrical flair. Suspended high above the stage, artists will push the limits of movement and imagination in a celebration of sensuality, creativity, and bold performance. A party in the garden of earthly delights, this immersive aerial experience promises daring feats of strength and beauty designed to excite the senses. …",
    pubDate: "2026-05-24T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52375583987748/huge/e1c49a524214d33f684395ec8292f6087472cdc1.jpg"
  },
  {
    title: "OTG Overnight Trail Maintenance Trip: Cutler Complex",
    link: "https://ouraytrails.org/volunteers",
    description: "Enjoy some of the most scenic trails in Colorado while removing down trees or encroaching brush and repairing trails from erosion problems. You will leave the wild with the camaraderie that comes with meeting new friends and helping keep our public land trails safe and sustainable. Please register in advance to join this trail crew event, and participants must have current CPR and First Aid certifications. Click HERE to signup.",
    pubDate: "2026-05-24T06:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Culter Creek Complex",
    imageUrl: "https://localist-images.azureedge.net/photos/52789272870069/huge/81634184041be3beb87730d36ba522a5de675e5c.jpg"
  },
  {
    title: "PARK - Ultimate Frisbee",
    link: "https://events.ourayridgwayevents.com/event/park-ultimate-frisbee",
    description: "Come play frisbee! Anyone is welcome.",
    pubDate: "2026-05-24T20:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Fellin Park",
    imageUrl: "https://localist-images.azureedge.net/photos/51807883052581/huge/9d7f0c7c4c96318902b1dfef1c3f821c9b3189d1.jpg"
  },
  {
    title: "Ouray Softball Spring Training",
    link: "https://events.ourayridgwayevents.com/event/ouray-softball-spring-training",
    description: "Step onto the field for Ouray Softball Spring Training at Fellin Park. This preseason program is designed to shake off the rust, build skills, and get players ready for summer league action. Open to a range of ages and experience levels, spring training focuses on fundamentals, teamwork, and getting back into the rhythm of the game. Whether you're refining your swing, sharpening fielding skills, or just getting back in the game, it’s a great way to kick off the season. Come ready to play, connect with teammates, and enjoy spring evenings on the diamond in Ouray. Want to join a team, but you aren't already involved? Sign up Here!",
    pubDate: "2026-05-24T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52701275725771/huge/58498e59bf3c36b5491225bca2838359fa0701bd.jpg"
  },
  {
    title: "On Display: Layers of Faces and Life-Paintings by Ruth Higdon and Julie Ahern",
    link: "https://events.ourayridgwayevents.com/event/layers-of-faces-and-life-paintings-by-ruth-higdon-and-julie-ahern",
    description: "A duo exhibition of new works by local painters Julie Ahern and Ruth Higdon. More info decker@ridgwayfuse.org",
    pubDate: "2026-05-25T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52709680184864/huge/bf651b7d434184420bcaf9702ff358cbd88d3b9e.jpg"
  },
  {
    title: "Senior Lunch by Neighbor to Neighbor",
    link: "https://www.ourayneighbor.com/services",
    description: "Senior Lunch Every Monday Seniors meet to share a wonderful lunch, have a chance to socialize and enjoy an entertaining program. Transportation is provided. Neighbor to Neighbor, 970-325-4586.",
    pubDate: "2026-05-25T18:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/51631061496012/huge/ef9e5facb2d933bc015ffe261fc1ecd0508088c8.jpg"
  },
  {
    title: "Basketball and Volleyball Tournament - Hot Springs Style",
    link: "https://events.ourayridgwayevents.com/event/basketball-and-volleyball-tournament-hot-springs-style",
    description: "Get ready for a fun, fast-paced showdown at the Basketball & Volleyball Tournament – Hot Springs Style! This unique community event brings together friendly competition, mountain-town energy, and a relaxed “only in Ouray” vibe. Teams will face off in both basketball and volleyball throughout the day, with plenty of action, laughter, and community spirit in between games. True to the Hot Springs Style theme, players and spectators alike are encouraged to kick back, enjoy the atmosphere, and make a full day of it—on and off the court. Whether you’re competing or cheering from the sidelines, it’s a great way to connect, play, and celebrate summer in Ouray.",
    pubDate: "2026-05-25T19:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52701346021520/huge/68ca03e6c3efec8668eb7ddf38f1d90656573dc2.jpg"
  },
  {
    title: "RIDGWAY WRECKING CREW",
    link: "https://coloradoboydepot.com/calendar/",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/",
    pubDate: "2026-05-25T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "On Display: Layers of Faces and Life-Paintings by Ruth Higdon and Julie Ahern",
    link: "https://events.ourayridgwayevents.com/event/layers-of-faces-and-life-paintings-by-ruth-higdon-and-julie-ahern",
    description: "A duo exhibition of new works by local painters Julie Ahern and Ruth Higdon. More info decker@ridgwayfuse.org",
    pubDate: "2026-05-26T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52709680184864/huge/bf651b7d434184420bcaf9702ff358cbd88d3b9e.jpg"
  },
  {
    title: "CORAL SKYE",
    link: "https://coloradoboydepot.com/calendar/",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/",
    pubDate: "2026-05-26T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Tourism Advisory Committee",
    link: "https://cityofouray.com/city_offices/committees___boards/tourism_advisory_committee.php",
    description: "The Ouray Tourism Advisory Committee (TAC) represents a cross-section of the small businesses, nonprofits, and residents of Ouray. We educate ourselves about best practices in the tourism industry, tourism marketing, and the visitor experience. We gather input, plan, prioritize, measure, and advise the City of Ouray on the best actions to take related to the tourism industry in our community.",
    pubDate: "2026-05-26T23:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52092171660517/huge/0e628304026c92db25e8df01849c962ac902a3b4.jpg"
  },
  {
    title: "Community Meditation",
    link: "www.ridgwayfuse.org",
    description: "Join us for a peer-led weekly meditation series at the Decker Community Room. Free and open to the public! We meet every 1st, 2nd, and 4th Tuesday of the month (all but the 3rd Tuesday!)",
    pubDate: "2026-05-27T00:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52338340283147/huge/582622671001d9ab20f8c25a5d229c9ecbbba165.jpg"
  },
  {
    title: "OPEN MIC / JAM NIGHT w/ host DJ Strong",
    link: "www.FloatingLotusBrewery.com",
    description: "Join us at the Lotus for a midweek tradition that brings together musicians, music lovers, and the incredible local talent that makes our community shine. From intimate solo sets to full-band jam sessions with rotating players, Open Mic Night is always full of surprises. Want to play? We’d love to have you — signups begin at 5:30pm. Just bring your instrument and your creativity, and we’ll take care of the rest. Our stage is fully equipped with PA, mics, drums, bass, and everything you need to plug in and play. 🎟️ Free admission 🍻 Grab a beer, settle in, and enjoy the show Come be part of the music — on stage or in the crowd!",
    pubDate: "2026-05-28T00:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52523630382868/huge/ed08b494666358349bc84e969db6e8b262ef71aa.jpg"
  },
  {
    title: "The Lord of the Rings: The Fellowship of the Ring: Movie Night @ The Wright",
    link: "https://thewrightoperahouse.org/",
    description: "The Lord of the Rings: The Fellowship of the Ring: Movie Night @ the Wright WHEN? Wednesday, May 27 Doors at 6:30 pm • Movie at 7:00 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado RUN TIME: 2h 58min RATING: PG-13 ROTTEN TOMATOES SCORE: 91% ABOUT THE FILM This movie was chosen to be just in time for fans of the Genre and precedes our live theatre event: \"Fly, You Fools!\" The Lord of the Rings: The Fellowship of the Ring (2001) follows a young hobbit, Frodo Baggins, as he sets out on a perilous journey to destroy a powerful ring and prevent it from falling into the hands of darkness. Joined by a fellowship of unlikely allies, Frodo travels across Middle-earth facing danger, temptation, and the growing shadow of evil in an epic tale of courage, friendship, and sacrifice. …",
    pubDate: "2026-05-28T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52568666129757/huge/1fe32b4a28a59494b608daafcb284a172935afe5.jpg"
  },
  {
    title: "Pilates Mat",
    link: "https://ridgwaypilates.punchpass.com/catalogs/300",
    description: "All Levels Pilates Mat class. Classical sequence Int to challenge, strengthen and stretch you wehole body. Every Thursday at 9:30am. Pricing Four lessons for $120 Eight lessons for $200 Become a member and pay $100/month to attend weekly. Purchase a pass here: https://ridgwaypilates.punchpass.com/catalogs/300 Class is limited to six people. Mats are included. Please wear socks, put your hair up and choose clothing free of metal.",
    pubDate: "2026-05-28T15:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52576058290647/huge/ab41effebba96d758d6c4061ee6bdc28e09bd4e0.jpg"
  },
  {
    title: "On Display: Layers of Faces and Life-Paintings by Ruth Higdon and Julie Ahern",
    link: "https://events.ourayridgwayevents.com/event/layers-of-faces-and-life-paintings-by-ruth-higdon-and-julie-ahern",
    description: "A duo exhibition of new works by local painters Julie Ahern and Ruth Higdon. More info decker@ridgwayfuse.org",
    pubDate: "2026-05-28T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52709680184864/huge/bf651b7d434184420bcaf9702ff358cbd88d3b9e.jpg"
  },
  {
    title: "THIRSTY THURSDAY - Game Night at Floating Lotus",
    link: "www.FloatingLotusBrewery.com",
    description: "Thirsty Thursday is where the week turns into the weekend. Every Thursday at Floating Lotus Brewery, we’re bringing the energy with Trivia Night (1st & 3rd) and Music Bingo (2nd & 4th). Cold beer, loud music, and a room full of people who came to have a good time. Happening 7-9pm every week",
    pubDate: "2026-05-29T01:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Floating Lotus Brewery",
    imageUrl: "https://localist-images.azureedge.net/photos/52523770567385/huge/aa7bcfeb333ca9d6b01c43aa6294ed32c0d384e4.jpg"
  },
  {
    title: "Steps Tavern Presents Karaoke Night",
    link: "https://events.ourayridgwayevents.com/event/steps-tavern-presents-karaoke-night",
    description: "Steps Tavern Presents Karaoke Night. Doors Open at 7:00 PM. Karaoke Begins at 8:00 PM",
    pubDate: "2026-05-29T02:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "STEPS TAVERN",
    imageUrl: "https://localist-images.azureedge.net/photos/52633505531238/huge/33b9b47c734793a754893ee4e67227b39326b67b.jpg"
  },
  {
    title: "Ridgway Last Day of School",
    link: "https://www.ridgway.k12.co.us/page/district-calendar/",
    description: "",
    pubDate: "2026-05-29T06:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52196842516113/huge/34c03f502c2e6b24c2bdceae7a155d7b6d463e8f.jpg"
  },
  {
    title: "Ridgway Farmers Market",
    link: "www.ridgwayfarmersmarket.com",
    description: "Ridgway Farmers Market WHERE LOCAL GROWS... in the soil, in our economy, and in the connections we share as a community Local farmers, ranchers, bakers, and artisans bring the best of Ridgway to town: fresh produce, handcrafted goods, and the shared belief that a strong community begins with supporting the people who live and work here.",
    pubDate: "2026-05-29T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52487561553294/huge/09a2d632a840b6a4d0303261c242753cb58a993a.jpg"
  },
  {
    title: "Ridgway Railroad Museum FREE Train Rides",
    link: "https://www.ridgwayrailroadmuseum.org/",
    description: "We will be operating our equipment on Fridays (starting May 29th) and Saturdays (starting May 9th) this spring, summer and fall in 2026. Come join us and enjoy a part of Ridgway history while riding on RGS Motor No. 1, RGS Goose No. 4, gasoline locomotive CW, and RGS Inspection Car No. 1.",
    pubDate: "2026-05-29T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52773804648328/huge/27ee9f278b677eb9bf13a8ee9463855e6db07a7c.jpg"
  },
  {
    title: "FLANNEL FEEDBACK",
    link: "https://coloradoboydepot.com/calendar/",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/",
    pubDate: "2026-05-29T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "Final Friday: School's Out Let's Go!",
    link: "https://www.voyageryouth.org/hubb-teen-events",
    description: "SCHOOL'S OUT LET'S GO! For Middle & High School Students, Final Friday is reclaiming Voyager as the Teen Center it used to be. 🤘 Come hang out for an evening that mixes chill social time with free food and fun activities. Every month, we have games, art and more available. All we ask is that you clean up after yourself and help us create a welcoming space for everyone. This month, meet Jazzmin, Voyager's new Teen Program Assistant who will be leading Adventure Wednesdays and Multi-Day Trips. We will have a new juggling kit to celebrate and share a party trick that she's been developing as well as Summer Survival Mystery Bags to take home with you. TO RSVP STEP 1: Once a year, make or update an account with Voyager so we have access to important information to best serve the Teens that are attending. …",
    pubDate: "2026-05-29T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52860999139790/huge/5cdf44deaab00132052e2601f35f9a2a76fc9960.jpg"
  },
  {
    title: "Fly You Fools Presented by UpstART | Opening Night | Fri 5/29/26",
    link: "https://thewrightoperahouse.org/",
    description: "Fly You Fools Presented by UpstART | Opening Night | Fri 5/29/26 WHEN? Friday, May 29 Doors at 7:00 pm • Show at 7:30 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE SHOW Fly, You Fools! is a critically acclaimed physical comedy from the New York–based troupe Recent Cutbacks, making its UK and international stage debut through touring productions like this one. Presented locally by UpstART Theatre, the show delivers a fast-paced parody of epic fantasy storytelling. Three actors and a Foley artist join forces in fellowship to bring an entire fantasy adventure to life in a hilarious one-shot theatrical journey. Blending rapid-fire comedy, inventive stagecraft, live sound effects, and high-energy physical theatre, the production proves that even the smallest band of performers can create a world of heroic proportions. …",
    pubDate: "2026-05-30T01:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52382837970272/huge/efa20aea189f55b2258da20d2382a48a7bde31a0.jpg"
  },
  {
    title: "Fly, You Fools!: Theatre @ the Wright",
    link: "https://thewrightoperahouse.org/events/theater/fly-you-fools",
    description: "Fly, You Fools!: Theatre @ the Wright WHEN? Friday, May 29, 2026 7:30 PM Saturday, May 30, 2026 7:30 PM Sunday, May 31, 2026 4:00 PM Monday, June 1, 2026 7:30 PM WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE SHOW Fly, You Fools! is a critically acclaimed physical comedy from the New York–based troupe Recent Cutbacks, making its UK and international stage debut through touring productions like this one. Presented locally by UpstART Theatre, the show delivers a fast-paced parody of epic fantasy storytelling. Three actors and a Foley artist join forces in fellowship to bring an entire fantasy adventure to life in a hilarious one-shot theatrical journey. Blending rapid-fire comedy, inventive stagecraft, live sound effects, and high-energy physical theatre, the production proves that even the smallest band of performers can create a world of heroic proportions. …",
    pubDate: "2026-05-30T01:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52453668754083/huge/7843394b93916f13f7fe41b7d9d36f1a7394be85.jpg"
  },
  {
    title: "OTG Overnight Trail Maintenance Trip: Bear Creek NRT",
    link: "https://ouraytrails.org/volunteers",
    description: "Enjoy some of the most scenic trails in Colorado while removing down trees or encroaching brush and repairing trails from erosion problems. You will leave the wild with the camaraderie that comes with meeting new friends and helping keep our public land trails safe and sustainable. Please register in advance to join this trail crew event, and participants must have current CPR and First Aid certifications. Click HERE to signup.",
    pubDate: "2026-05-30T14:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Bear Creek Trail Head south of Ouray",
    imageUrl: "https://localist-images.azureedge.net/photos/52789326237006/huge/bd0e715520daa45a021ccfc75c4938dfef1aed85.jpg"
  },
  {
    title: "Family Fun Fest and Used Book Sale",
    link: "https://events.ourayridgwayevents.com/event/family-fun-fest-and-used-book-sale",
    description: "Celebrate the library with a fun and free event for all! Hosted by the Friends of the Ridgway Library, Summer Fun Fest & Book Sale brings readers of all ages together to celebrate summer, reading, and your library. Enjoy a day filled with activities including chalk art, crafts, face painting, shaved ice, a used book sale, a fly fishing clinic for ages 10+, and a bike maintenance clinic — bring your bike! All activities are free and everyone is welcome. Sign up for the bike clinic and fly casting clinic at the library or call 970-626-5252. Volunteers are needed! Contact jill.hepp@friendsofridgwaylibrary.org if you are interested in volunteering. Hosted by Friends of the Ridgway Library.",
    pubDate: "2026-05-30T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52825416452253/huge/ee71af15803ef954e75a37ca3f3ed58b6210a0c1.jpg"
  },
  {
    title: "Ridgway Railroad Museum FREE Train Rides",
    link: "https://www.ridgwayrailroadmuseum.org/",
    description: "We will be operating our equipment on Fridays (starting May 29th) and Saturdays (starting May 9th) this spring, summer and fall in 2026. Come join us and enjoy a part of Ridgway history while riding on RGS Motor No. 1, RGS Goose No. 4, gasoline locomotive CW, and RGS Inspection Car No. 1.",
    pubDate: "2026-05-30T16:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52773804648328/huge/27ee9f278b677eb9bf13a8ee9463855e6db07a7c.jpg"
  },
  {
    title: "WOWSERS",
    link: "https://coloradoboydepot.com/calendar/",
    description: "Live Music\\ https://coloradoboydepot.com/calendar/",
    pubDate: "2026-05-30T22:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "687 N Cora Street, Ridgway, CO 81432",
    imageUrl: "https://localist-images.azureedge.net/photos/52577810192311/huge/0773d8a866e30d9392f3bfb00a66acb1613d8a4b.jpg"
  },
  {
    title: "The Yawpers! Live at the Sherbino",
    link: "https://sherbino.org/events/category/music/",
    description: "https://sherbino.org/events/category/music/ Doors at 6:45 pm | Opener at 7:15 pm | The Yawpers at 8:00 pm $25 advance / $30 day of show / A limited amount of tables are available for this show Get ready for a high-octane night of raw, unapologetic rock and roll as The Yawpers take over the Sherbino stage! For over 15 years, The Yawpers have built a reputation as one of the most electrifying rock bands on the road—driven by gritty guitar riffs, relentless energy, and a sound that pulls from garage rock, punk, blues, and Americana. Their live shows are loud, fast, and wildly infectious—exactly the kind of experience that reminds you why rock and roll still matters. Now hitting the road with new music on the horizon, The Yawpers are bringing their signature intensity and edge back to Ridgway. …",
    pubDate: "2026-05-31T01:15:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52403083528953/huge/e7eb8757e5dcaf8d14e07216a616734c89871529.jpg"
  },
  {
    title: "Fly You Fools Presented by UpstART | Sat 5/30/26",
    link: "https://thewrightoperahouse.org/",
    description: "Fly You Fools Presented by UpstART | Sat 5/30/26 WHEN? Saturday, May 30 Doors at 7:00 pm • Show at 7:30 pm WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE SHOW Fly, You Fools! is a critically acclaimed physical comedy from the New York–based troupe Recent Cutbacks, making its UK and international stage debut through touring productions like this one. Presented locally by UpstART Theatre, the show delivers a fast-paced parody of epic fantasy storytelling. Three actors and a Foley artist join forces in fellowship to bring an entire fantasy adventure to life in a hilarious one-shot theatrical journey. Blending rapid-fire comedy, inventive stagecraft, live sound effects, and high-energy physical theatre, the production proves that even the smallest band of performers can create a world of heroic proportions. Inspired by beloved fantasy tropes and packed with quick wit, physical humor, and theatrical ingenuity, Fly, You Fools! …",
    pubDate: "2026-05-31T01:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52382802312047/huge/a67b50c8da1618cb52027e9a4b53bfcf4e419f7d.jpg"
  },
  {
    title: "Fly, You Fools!: Theatre @ the Wright",
    link: "https://thewrightoperahouse.org/events/theater/fly-you-fools",
    description: "Fly, You Fools!: Theatre @ the Wright WHEN? Friday, May 29, 2026 7:30 PM Saturday, May 30, 2026 7:30 PM Sunday, May 31, 2026 4:00 PM Monday, June 1, 2026 7:30 PM WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE SHOW Fly, You Fools! is a critically acclaimed physical comedy from the New York–based troupe Recent Cutbacks, making its UK and international stage debut through touring productions like this one. Presented locally by UpstART Theatre, the show delivers a fast-paced parody of epic fantasy storytelling. Three actors and a Foley artist join forces in fellowship to bring an entire fantasy adventure to life in a hilarious one-shot theatrical journey. Blending rapid-fire comedy, inventive stagecraft, live sound effects, and high-energy physical theatre, the production proves that even the smallest band of performers can create a world of heroic proportions. …",
    pubDate: "2026-05-31T01:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52453668754083/huge/7843394b93916f13f7fe41b7d9d36f1a7394be85.jpg"
  },
  {
    title: "OTG Overnight Trail Maintenance Trip: Bear Creek NRT",
    link: "https://ouraytrails.org/volunteers",
    description: "Enjoy some of the most scenic trails in Colorado while removing down trees or encroaching brush and repairing trails from erosion problems. You will leave the wild with the camaraderie that comes with meeting new friends and helping keep our public land trails safe and sustainable. Please register in advance to join this trail crew event, and participants must have current CPR and First Aid certifications. Click HERE to signup.",
    pubDate: "2026-05-31T06:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Bear Creek Trail Head south of Ouray",
    imageUrl: "https://localist-images.azureedge.net/photos/52789326237006/huge/bd0e715520daa45a021ccfc75c4938dfef1aed85.jpg"
  },
  {
    title: "PARK - Ultimate Frisbee",
    link: "https://events.ourayridgwayevents.com/event/park-ultimate-frisbee",
    description: "Come play frisbee! Anyone is welcome.",
    pubDate: "2026-05-31T20:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "Fellin Park",
    imageUrl: "https://localist-images.azureedge.net/photos/51807883052581/huge/9d7f0c7c4c96318902b1dfef1c3f821c9b3189d1.jpg"
  },
  {
    title: "Ouray Softball Spring Training",
    link: "https://events.ourayridgwayevents.com/event/ouray-softball-spring-training",
    description: "Step onto the field for Ouray Softball Spring Training at Fellin Park. This preseason program is designed to shake off the rust, build skills, and get players ready for summer league action. Open to a range of ages and experience levels, spring training focuses on fundamentals, teamwork, and getting back into the rhythm of the game. Whether you're refining your swing, sharpening fielding skills, or just getting back in the game, it’s a great way to kick off the season. Come ready to play, connect with teammates, and enjoy spring evenings on the diamond in Ouray. Want to join a team, but you aren't already involved? Sign up Here!",
    pubDate: "2026-05-31T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52701275725771/huge/58498e59bf3c36b5491225bca2838359fa0701bd.jpg"
  },
  {
    title: "Summer Soulful Sisters Circle- Free Intro Gathering",
    link: "https://www.beetrueyou.com/",
    description: "Accountability Spiritual Community Enless Possibility Bring your Goals, Challenges and Questions. Learn about this unique opportunity for personal growth in community, led by Elizabeth Lava, a highly trained and experienced health, life and spiritual coach. Meet other women who are wanting to grow together in a group and on their own. Handouts and tea will be provided.",
    pubDate: "2026-05-31T23:15:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52836840684511/huge/6e3df308aea99655628d77e2253a5060af169275.jpg"
  },
  {
    title: "GOLDPINE ~ Live at The Courtyard at 610",
    link: "https://sherbino.org/event/goldpine-ridgway-concert-may-31-2026/",
    description: "GOLDPINE at the Courtyard at 610 (enter via the alley behind the Sherbino and 610 Gallery) || Gates & Bar: 6 pm || Showtime: 6:30 pm || All General Admission Seating || $25 advance || $30 day of show || Buy Tickets From Bristol Rhythm & Roots Reunion and the Kansas City Chiefs’ Arrowhead Stadium to listening rooms throughout the United States, husband-wife duo GOLDPINE has been offering their own brand of bold harmony-driven Americana to audiences large and small. WINNER of the 2022 Rocky Mountain Songwriter Contest, their distinctive harmonies are clearly a channel for their sometimes-raucous, sometimes-reminiscent compositions. With an incredible collection of stories about life, love, and purpose, their live performance is a powerful projection of everything Goldpine is about: striking vocals, bold harmony, and introspection into the human experience. …",
    pubDate: "2026-06-01T00:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52252954261031/huge/a6e0971bed5331dc9b04a9d11a417ef4af3c14c3.jpg"
  },
  {
    title: "Restoration Work Week:  June 1 - June 5, 2026",
    link: "http://www.ridgwayrailroadmuseum.org/events.html",
    description: "Come and work on the railroad. We can use your computer skills, woodworking skills, manual labor, painting, etc. Lots of fun work for everyone. Lunch provided.",
    pubDate: "2026-06-01T06:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52594216043415/huge/422bf6ccf915872b17c354d089ec0b4b7eb791d6.jpg"
  },
  {
    title: "Swimming Classes for Kids",
    link: "https://anc.apm.activecommunities.com/cityofouray/activity/search?activity_select_param=2&viewMode=list",
    description: "The Ouray Hot Springs summer swim lesson program is a fun and supportive way for kids to build confidence in the water. Two-week sessions run through the summer from June 1 through Aug. 6. Details: ✔️ Classes meet Monday–Thursday for 30 minutes each day ✔️ 8 classes per session ✔️ $45 per session (that’s less than $6 per class!) ✔️ Pool entry during class period included Class Options: Parent Tots: (Under 3 with an adult) Level 1: Beginner Skills (Ages 3+) Level 2: Intermediate Skills (All Ages) Level 3: Advanced Skills (All Ages) 📅 You can register at tinyurl.com/ourayactivities! Registration for each session closes the Friday before the session begins. Questions? Contact our Swim Safety Coordinator at 970-325-3009 or JWyatt@CityofOuray.com.",
    pubDate: "2026-06-01T15:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52806871795839/huge/2b4a1f1e03bf8526d92866007630f4a159e579d5.jpg"
  },
  {
    title: "Senior Lunch by Neighbor to Neighbor",
    link: "https://www.ourayneighbor.com/services",
    description: "Senior Lunch Every Monday Seniors meet to share a wonderful lunch, have a chance to socialize and enjoy an entertaining program. Transportation is provided. Neighbor to Neighbor, 970-325-4586.",
    pubDate: "2026-06-01T18:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/51631061496012/huge/ef9e5facb2d933bc015ffe261fc1ecd0508088c8.jpg"
  },
  {
    title: "Monthly Karate in Ouray County",
    link: "https://weehawkenarts.org/karate-2/",
    description: "Join Weehawken Creative Arts for Karate with Sensei Kay Briggs. We offer unlimited monthly classes in Ouray County (meaning you can attend each week in Ouray and/or Ridgway — or both). Tuition/registration is DUE the 1st week of the month. Karate class is a great way to learn skills to keep you safe, stay in shape and strong core movements. Karate believes in using it only to protect self and is taught accordingly. Whether you are new to Karate or a seasoned student, the Sensei will work with your level. Taught in the kyokushin kai-kan style, similar shotokan style of karate, we welcome new students to try this exceptional experience for your mind and body! Mixed ages --- Ages 7 through Adult (extended time for more experience) Mondays in Ouray: St. …",
    pubDate: "2026-06-01T23:00:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52253033564264/huge/ef12b5792bac47932752278d68230c7704389412.jpg"
  },
  {
    title: "Fly, You Fools!: Theatre @ the Wright",
    link: "https://thewrightoperahouse.org/events/theater/fly-you-fools",
    description: "Fly, You Fools!: Theatre @ the Wright WHEN? Friday, May 29, 2026 7:30 PM Saturday, May 30, 2026 7:30 PM Sunday, May 31, 2026 4:00 PM Monday, June 1, 2026 7:30 PM WHERE? Wright Opera House 472 Main St. Ouray, Colorado ABOUT THE SHOW Fly, You Fools! is a critically acclaimed physical comedy from the New York–based troupe Recent Cutbacks, making its UK and international stage debut through touring productions like this one. Presented locally by UpstART Theatre, the show delivers a fast-paced parody of epic fantasy storytelling. Three actors and a Foley artist join forces in fellowship to bring an entire fantasy adventure to life in a hilarious one-shot theatrical journey. Blending rapid-fire comedy, inventive stagecraft, live sound effects, and high-energy physical theatre, the production proves that even the smallest band of performers can create a world of heroic proportions. …",
    pubDate: "2026-06-02T01:30:00.000Z",
    source: "oray",
    sourceLabel: "Ouray Ridgway Calendar",
    category: "Community Event",
    location: "",
    imageUrl: "https://localist-images.azureedge.net/photos/52453668754083/huge/7843394b93916f13f7fe41b7d9d36f1a7394be85.jpg"
  }
];

// Ridgway Town Council agenda PDFs — populated by content-refresh.js Task 20.
// Keys are "Month D, YYYY" date strings (e.g. "May 13, 2026").
// Values are direct PDF URLs to the agenda/packet document.
// When a matching entry exists, the Gov-Hub card shows a dark-green
// "Agenda Posted →" button linking straight to the document.
const RIDGWAY_AGENDA_MAP = {};

async function fetchOurayRidgwayEvents() {
  // Prefer server-baked data (populated every 6h by content-refresh.js Task 16).
  if (typeof OURAY_RIDGWAY_EVENTS !== 'undefined' && Array.isArray(OURAY_RIDGWAY_EVENTS) && OURAY_RIDGWAY_EVENTS.length > 0) {
    return OURAY_RIDGWAY_EVENTS.map(ev => Object.assign({}, ev, {
      pubDate: ev.pubDate ? new Date(ev.pubDate) : null,
      eventDate: ev.pubDate ? new Date(ev.pubDate) : null
    })).filter(ev => ev.pubDate && !isNaN(ev.pubDate.getTime()));
  }
  // Fallback: live Localist API call (runs only before the first bot bake).
  const ORE_URL = 'https://events.ourayridgwayevents.com/api/2/events?school=ridgwayouray&days=30&pp=50';
  try {
    let json;
    try {
      const resp = await fetch(CODETABS_PROXY + encodeURIComponent(ORE_URL));
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      json = await resp.json();
    } catch (e1) {
      const resp2 = await fetch(ALLORIGINS_PROXY + encodeURIComponent(ORE_URL));
      if (!resp2.ok) throw new Error('Fallback HTTP ' + resp2.status);
      json = await resp2.json();
    }
    const events = Array.isArray(json && json.events) ? json.events : [];
    return events.map(wrapped => {
      const ev = wrapped && wrapped.event;
      if (!ev || ev.private || ev.status !== 'live') return null;
      const inst = Array.isArray(ev.event_instances) && ev.event_instances[0]
        && ev.event_instances[0].event_instance;
      const startStr = inst && inst.start;
      let pubDate = startStr ? new Date(startStr) : (ev.first_date ? new Date(ev.first_date + 'T19:00:00') : null);
      if (pubDate && isNaN(pubDate.getTime())) pubDate = null;
      // Localist exposes the photo as `photo_url` (CDN URL on
      // localist-images.azureedge.net) — use it directly when present.
      const imageUrl = ev.photo_url || '';
      // Localist's `description_text` sometimes contains literal escape
      // sequences ("\n") and trailing URL-only continuation lines from
      // user-submitted content (e.g., "Live Music\nhttps://example.com").
      // Clean up: literal "\n" → space, real newlines → space, collapse runs;
      // drop the entire description if it's just a bare URL.
      let descClean = (ev.description_text || '')
        .replace(/\n/g, ' ')
        .replace(/\r?\n+/g, ' ')
        .replace(/\\\s+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (/^https?:\/\/\S+$/.test(descClean)) descClean = '';
      // Apply the 150-word cap (was being bypassed previously — Localist
      // events with long class descriptions overflowed the card).
      descClean = smartTruncate(descClean, EVENT_DESC_MAX);
      return {
        title: (ev.title || '').trim(),
        link: ev.url || `https://events.ourayridgwayevents.com/event/${ev.urlname || ev.id}`,
        description: descClean,
        summary: descClean.slice(0, 280),
        pubDate: pubDate,
        // eventDate mirrors pubDate so gov-meeting items routed to allMeetings
        // satisfy renderMeetingsWithTopic()'s shape requirement.
        eventDate: pubDate,
        source: 'oray',
        sourceLabel: 'Ouray Ridgway Calendar',
        category: 'Community Event',
        location: ev.location || '',
        imageUrl: imageUrl
      };
    }).filter(it => it && it.title && it.pubDate);
  } catch (err) {
    console.warn('[GovHub] Ouray-Ridgway events fetch failed:', err.message);
    return [];
  }
}

// ── Norwood Town Events / Notices (server-baked from sitemap) ──
// Bot populates this every 6h via content-refresh.js Task 17.
// Entries cover meetings, notices, community events, and town closures
// extracted from norwoodtown.com/sitemap.xml dated URL slugs.
const NORWOOD_EVENTS = [
  {
    title: "Legacy Documentary Showing The Livery",
    link: "https://www.norwoodtown.com/2026-05-07-legacy-documentary-showing-the-livery",
    description: "",
    pubDate: "2026-05-07T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Calm Conversation With Tri County Network",
    link: "https://www.norwoodtown.com/2026-05-11-calm-conversation-with-tri-county-network",
    description: "",
    pubDate: "2026-05-11T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "NWC Meeting",
    link: "https://www.norwoodtown.com/2026-05-12-nwc-meeting",
    description: "",
    pubDate: "2026-05-12T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Board Of Trustees Meeting",
    link: "https://www.norwoodtown.com/2026-05-13-board-of-trustees-meeting",
    description: "",
    pubDate: "2026-05-13T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Norwood Sanitation District Meeting Meeting",
    link: "https://www.norwoodtown.com/2026-05-14-norwood-sanitation-district-meeting-meeting",
    description: "",
    pubDate: "2026-05-14T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Government Meeting",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Closed For Memorial Day",
    link: "https://www.norwoodtown.com/2026-05-25-closed-for-memorial-day",
    description: "",
    pubDate: "2026-05-25T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Town Closure",
    location: "Norwood, CO",
    imageUrl: ""
  },
  {
    title: "Music On The Mesa Wolf Jett",
    link: "https://www.norwoodtown.com/2026-06-13-music-on-the-mesa-wolf-jett",
    description: "",
    pubDate: "2026-06-13T12:00:00.000Z",
    source: "norwood",
    sourceLabel: "Town of Norwood",
    category: "Community Event",
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
  }
];

function fetchNorwoodEvents() {
  if (typeof NORWOOD_EVENTS !== 'undefined' && Array.isArray(NORWOOD_EVENTS) && NORWOOD_EVENTS.length > 0) {
    return NORWOOD_EVENTS.map(ev => Object.assign({}, ev, {
      pubDate: ev.pubDate ? new Date(ev.pubDate) : null
    })).filter(ev => ev.pubDate && !isNaN(ev.pubDate.getTime()));
  }
  return [];
}

// ── Mountain Village Events (server-baked from sitemap + page scrape) ──
// Bot populates this every 6h via content-refresh.js Task 18.
// Non-governmental community events from townofmountainvillage.com,
// with per-occurrence dates generated from the "When" section text.
const MOUNTAIN_VILLAGE_EVENTS = [];

function fetchMountainVillageEvents() {
  if (typeof MOUNTAIN_VILLAGE_EVENTS !== 'undefined' && Array.isArray(MOUNTAIN_VILLAGE_EVENTS) && MOUNTAIN_VILLAGE_EVENTS.length > 0) {
    return MOUNTAIN_VILLAGE_EVENTS.map(ev => Object.assign({}, ev, {
      pubDate: ev.pubDate ? new Date(ev.pubDate) : null
    })).filter(ev => ev.pubDate && !isNaN(ev.pubDate.getTime()));
  }
  return [];
}

// ── Telluride.com Events (server-baked from sitemap + JSON-LD / date lists) ──
// Bot populates this every 6h via content-refresh.js Task 19.
// Festivals, markets, and recurring events from telluride.com/event/*.
// Multi-day events generate one entry per day; recurring events generate
// one entry per listed date within the 60-day window.
const TELLURIDE_COM_EVENTS = [];

function fetchTelluridComEvents() {
  if (typeof TELLURIDE_COM_EVENTS !== 'undefined' && Array.isArray(TELLURIDE_COM_EVENTS) && TELLURIDE_COM_EVENTS.length > 0) {
    return TELLURIDE_COM_EVENTS.map(ev => Object.assign({}, ev, {
      pubDate: ev.pubDate ? new Date(ev.pubDate) : null
    })).filter(ev => ev.pubDate && !isNaN(ev.pubDate.getTime()));
  }
  return [];
}

// ── Fetch Telluride Elks Lodge Events ──
// tellurideelks.org/Events runs on ClubRunner-style CMS — no public REST.
// Each event is rendered as <div class="EventAndSpeakersItem"> with the
// start date in the calendar URL (?Start=YYYY-MM-DD), event name in
// <a> inside <div class="EAS-Name">, image in <div class="EAS-Image">.
async function fetchElksEvents() {
  const ELKS_URL = 'https://tellurideelks.org/Events';
  try {
    let html;
    try {
      const resp = await fetch(CODETABS_PROXY + encodeURIComponent(ELKS_URL));
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      html = await resp.text();
    } catch (e1) {
      const resp2 = await fetch(ALLORIGINS_PROXY + encodeURIComponent(ELKS_URL));
      if (!resp2.ok) throw new Error('Fallback HTTP ' + resp2.status);
      html = await resp2.text();
    }
    // Walk each EventAndSpeakersItem block.
    const re = /<div class="EventAndSpeakersItem">([\s\S]*?)(?=<div class="EventAndSpeakersItem">|<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*$)/g;
    const items = html.match(re) || [];
    const out = [];
    for (const block of items) {
      const sm = block.match(/Start=(\d{4}-\d{2}-\d{2})/);
      if (!sm) continue;
      const startDate = new Date(`${sm[1]}T19:00:00`); // 7 PM default
      if (isNaN(startDate.getTime())) continue;
      // Title — first <a> inside <div class="EAS-Name">, OR next <a> after the date block
      let title = '';
      const tm = block.match(/<div class="EAS-Name">[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
      if (tm) title = tm[1].trim();
      else {
        // Fallback: title is sometimes the second <a> in the block
        const allLinks = [...block.matchAll(/<a[^>]+href="(CalendarItem\/Details[^"]+)"[^>]*>([^<]+)<\/a>/g)];
        const named = allLinks.find(m => m[2].trim() && !/^\d/.test(m[2].trim()));
        if (named) title = named[2].trim();
      }
      if (!title) continue;
      // Image
      const im = block.match(/<img[^>]+(?:src|data-src)="([^"]+)"/);
      // Detail link
      const detail = block.match(/href="(CalendarItem\/Details\?[^"]+)"/);
      const link = detail ? 'https://tellurideelks.org/' + detail[1].replace(/&amp;/g, '&') : 'https://tellurideelks.org/Events';
      out.push({
        title: title,
        link: link,
        description: '',
        summary: '',
        pubDate: startDate,
        source: 'elks',
        sourceLabel: 'Telluride Elks Lodge',
        category: 'Community Event',
        location: 'Telluride Elks Lodge #692, Telluride, CO',
        imageUrl: im ? im[1] : ''
      });
    }
    return out;
  } catch (err) {
    console.warn('[GovHub] Telluride Elks events fetch failed:', err.message);
    return [];
  }
}

async function fetchAllNews() {
  const feedResults = await Promise.all(NEWS_FEEDS.map(f => fetchNewsFeed(f)));
  const ttimesResults = await fetchTellurideTimesEvents();
  const kotoResults = await fetchKOTONews();
  const wilkinsonResults = fetchWilkinsonEvents();
  const communityResults = await fetchCommunityEvents();
  const tjcResults = await fetchTellurideJewishEvents();
  const tfResults = fetchTellurideFoundationEvents();
  const ecoResults = await fetchEcoActionEvents();
  const alibiResults = await fetchAlibiEvents();
  const sohResults = await fetchSheridanOperaHouseEvents();
  const elksResults = await fetchElksEvents();
  const orayResults = await fetchOurayRidgwayEvents();
  const ouCountyResults = fetchOurayCountyEvents();
  const norwoodEvtResults = fetchNorwoodEvents();
  const mvEvtResults = fetchMountainVillageEvents();
  const telluridComResults = fetchTelluridComEvents();

  // Hardcoded COMMUNITY_EVENTS (from the data array above)
  const hardcodedCommunity = [];
  const ceToday = new Date();
  ceToday.setHours(0, 0, 0, 0);
  if (typeof COMMUNITY_EVENTS !== 'undefined') {
    COMMUNITY_EVENTS.forEach(function(a) {
      if (!a.href && !a.title) return;
      var pubDate = a.date ? localDate(a.date) : null;
      if (pubDate && pubDate < ceToday) return;
      hardcodedCommunity.push({
        title: a.title,
        link: a.href,
        description: a.copy || '',
        summary: a.copy || '',
        pubDate: pubDate,
        source: a.source || 'Community Events',
        sourceLabel: a.source || 'Community',
        category: 'Community Event',
        location: a.location || '',
        imageUrl: a.img || '',
        eventTimes: a.eventTimes || '',
        clubInfo: a.clubInfo || null
      });
    });
  }

  // Combine all sources — Wilkinson library events take priority over KOTO/TT duplicates
  // Source priority for dedup: ORIGINAL sources first (TJC, TF, EcoAction,
  // SOH, Elks, Wilkinson, Ouray-Ridgway, gov RSS, hardcoded community,
  // GitHub-issue community), then AGGREGATORS (Telluride Times, KOTO) last.
  // The dedup below is first-seen-wins, so originals will keep their cards
  // and aggregator versions of the same event drop out.
  const all = [
    ...feedResults.flat(),    // gov RSS — Town of Telluride, San Miguel County
    ...wilkinsonResults,      // Wilkinson Public Library
    ...tjcResults,            // Telluride Jewish Community
    ...tfResults,             // Telluride Foundation
    ...ecoResults,            // EcoAction Partners
    ...alibiResults,          // Alibi Telluride (music venue)
    ...sohResults,            // Sheridan Opera House
    ...elksResults,           // Telluride Elks Lodge
    ...orayResults,           // Ouray Ridgway Calendar (Localist)
    ...ouCountyResults,       // Ouray County (non-gov community events from iCal)
    ...norwoodEvtResults,     // Norwood Town events/notices (sitemap)
    ...mvEvtResults,          // Mountain Village community events (sitemap+pages)
    ...telluridComResults,    // Telluride.com events (festivals, markets, etc.)
    ...communityResults,      // GitHub-issue community submissions
    ...hardcodedCommunity,    // Hardcoded COMMUNITY_EVENTS
    // Aggregators last — their copies drop out if an original has the event:
    ...kotoResults,           // KOTO Community Calendar
    ...ttimesResults          // Telluride Times calendar
  ];

  // Normalize pubDate to a real Date object on every item.
  // Bot-populated arrays (KOTO_COMMUNITY_EVENTS, WILKINSON_EVENTS, etc.) store
  // pubDate as an ISO string like "2026-05-08T10:30:00.000Z"; older hardcoded
  // entries use new Date(...). Downstream filters (renderNews) do
  // `i.pubDate >= todayStart` which silently coerces strings to NaN and drops
  // every string-typed event. Convert once, here, for everyone downstream.
  for (const item of all) {
    if (item && item.pubDate && !(item.pubDate instanceof Date)) {
      const d = new Date(item.pubDate);
      item.pubDate = isNaN(d.getTime()) ? null : d;
    }
  }

  // Deduplicate across sources. The merge order above puts originals first,
  // then aggregators (TT, KOTO) last — so a duplicate from an aggregator
  // gets dropped here in favor of the original.
  //
  // Two-key match per event makes this resilient to title length variation
  // (e.g. KOTO posts "Free Legal Clinic – Clínica Jurídica Gratuita" while
  // Wilkinson posts just "Free Legal Clinic"). For each event we register
  // BOTH a 12-char normalized prefix and the first-3-words bag, paired with
  // the date. If either key is already seen for this date, the event is a
  // duplicate.
  function buildKeys(item) {
    const dateKey = item.pubDate ? item.pubDate.toISOString().slice(0, 10) : '';
    const norm = (item.title || '').toLowerCase()
      .replace(/[–—]/g, ' ')   // en/em dash → space
      .replace(/[^a-z0-9 ]+/g, ' ')      // strip punctuation/diacritics-stripped
      .replace(/\s+/g, ' ').trim();
    const prefixKey = norm.replace(/ /g, '').slice(0, 12) + '|' + dateKey;
    const wordsKey = norm.split(' ').filter(w => w && !/^(the|a|an|of|at|in|on|for|with|to)$/.test(w)).slice(0, 3).join('-') + '|' + dateKey;
    return [prefixKey, wordsKey];
  }
  const seen = new Set();
  return all.filter(item => {
    const keys = buildKeys(item);
    if (keys.some(k => seen.has(k))) return false;
    keys.forEach(k => seen.add(k));
    return true;
  });
}


function getEventTopic(item) {
  const text = `${item.title || ''} ${item.description || ''} ${item.summary || ''}`.toLowerCase();
  if (/(housing|pud|planning|zoning|development|carhenge|society turn|land use|deed restricted)/.test(text)) return 'housing';
  if (/(smart|transit|transportation|gondola|road|street|traffic|parking|trail)/.test(text)) return 'transit';
  if (/(medical|hospital|clinic|health|ambulance)/.test(text)) return 'medical';
  if (/(fire|wildfire|emergency|rescue)/.test(text)) return 'fire';
  if (/(school|education|student|library|youth)/.test(text)) return 'school';
  if (/(water|wastewater|sewer|utility|public works|infrastructure)/.test(text)) return 'infrastructure';
  return 'governance';
}

function renderEventIllustration(topic) {
  const art = {
    housing: `
      <div class="event-illustration topic-housing" aria-hidden="true">
        <svg viewBox="0 0 160 140" fill="none">
          <path d="M0 108C30 96 60 92 90 94C120 96 140 100 160 108V140H0Z" fill="#C8D9D1"/>
          <path d="M0 120C40 112 80 110 120 114C140 116 152 118 160 122V140H0Z" fill="#A8C4B6"/>
          <!-- House with pitched roof -->
          <path d="M56 58L80 38L104 58V92H56Z" fill="#F8FBF9" stroke="#295247" stroke-width="2"/>
          <path d="M52 60L80 36L108 60" stroke="#295247" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <!-- Door -->
          <rect x="73" y="72" width="14" height="20" rx="2" fill="#295247"/>
          <circle cx="84" cy="83" r="1.5" fill="#DDE9E3"/>
          <!-- Windows -->
          <rect x="61" y="64" width="9" height="9" rx="1" fill="#DDE9E3" stroke="#295247" stroke-width="1.2"/>
          <rect x="90" y="64" width="9" height="9" rx="1" fill="#DDE9E3" stroke="#295247" stroke-width="1.2"/>
          <!-- Chimney -->
          <rect x="92" y="42" width="7" height="16" fill="#E8DED1" stroke="#295247" stroke-width="1.5"/>
          <!-- Tree -->
          <circle cx="130" cy="72" r="14" fill="#B5CCBF"/>
          <circle cx="124" cy="68" r="10" fill="#C8D9D1"/>
          <rect x="128" y="82" width="4" height="12" rx="1" fill="#6D8B7F"/>
          <!-- Ground line -->
          <path d="M0 94H160" stroke="#6D8B7F" stroke-width="1.5" stroke-dasharray="4 3"/>
          <!-- Small for-sale sign -->
          <rect x="28" y="74" width="18" height="12" rx="2" fill="#F8FBF9" stroke="#295247" stroke-width="1.2"/>
          <path d="M37 86V96" stroke="#295247" stroke-width="1.5"/>
          <path d="M32 78H44" stroke="#295247" stroke-width="1"/>
          <path d="M33 82H43" stroke="#295247" stroke-width="1"/>
        </svg>
      </div>`,
    transit: `
      <div class="event-illustration topic-transit" aria-hidden="true">
        <svg viewBox="0 0 160 140" fill="none">
          <path d="M0 105C30 95 60 92 90 94C120 96 140 100 160 106V140H0Z" fill="#C8D5E6"/>
          <path d="M0 118C40 112 80 110 120 114C140 116 152 118 160 120V140H0Z" fill="#A8BCD6"/>
          <!-- Gondola cable -->
          <path d="M10 42C50 36 110 36 150 42" stroke="#34516E" stroke-width="2.5"/>
          <!-- Tower -->
          <path d="M80 18V38" stroke="#34516E" stroke-width="3"/>
          <path d="M72 18H88" stroke="#34516E" stroke-width="2.5" stroke-linecap="round"/>
          <!-- Gondola cabin -->
          <path d="M55 44L58 54H78L81 44" stroke="#34516E" stroke-width="1.5"/>
          <rect x="56" y="54" width="24" height="18" rx="4" fill="#F8FBFF" stroke="#34516E" stroke-width="2"/>
          <rect x="60" y="58" width="7" height="8" rx="1" fill="#DCE6F2" stroke="#34516E" stroke-width="1"/>
          <rect x="69" y="58" width="7" height="8" rx="1" fill="#DCE6F2" stroke="#34516E" stroke-width="1"/>
          <!-- Second gondola cabin (distant) -->
          <path d="M117 42L119 48H131L133 42" stroke="#6F88AA" stroke-width="1"/>
          <rect x="118" y="48" width="14" height="11" rx="3" fill="#E8EEF6" stroke="#6F88AA" stroke-width="1.5"/>
          <!-- Mountains -->
          <path d="M0 90L30 60L52 82L70 64L100 90" stroke="#6F88AA" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M90 94L120 70L150 94" stroke="#6F88AA" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
          <!-- Road -->
          <path d="M0 102C40 96 80 94 120 96C140 97 152 99 160 102" stroke="#34516E" stroke-width="2" stroke-dasharray="6 4"/>
        </svg>
      </div>`,
    medical: `
      <div class="event-illustration topic-medical" aria-hidden="true">
        <svg viewBox="0 0 160 140" fill="none">
          <path d="M0 108C30 96 60 92 90 94C120 96 140 100 160 108V140H0Z" fill="#C9E1DF"/>
          <path d="M0 120C40 114 80 112 120 114C140 116 152 118 160 120V140H0Z" fill="#A8CCC9"/>
          <!-- Hospital building -->
          <rect x="44" y="48" width="72" height="52" rx="6" fill="#F9FEFD" stroke="#2B6D69" stroke-width="2"/>
          <!-- Entrance canopy -->
          <path d="M62 100H98V94C98 91 96 88 92 88H68C64 88 62 91 62 94Z" fill="#DCECEB" stroke="#2B6D69" stroke-width="1.5"/>
          <!-- Cross symbol -->
          <rect x="73" y="56" width="14" height="14" rx="3" fill="#2B6D69"/>
          <rect x="77" y="58" width="6" height="10" rx="1" fill="#F9FEFD"/>
          <rect x="75" y="60" width="10" height="6" rx="1" fill="#F9FEFD"/>
          <!-- Windows -->
          <rect x="52" y="76" width="8" height="8" rx="1.5" fill="#DCECEB" stroke="#2B6D69" stroke-width="1"/>
          <rect x="64" y="76" width="8" height="8" rx="1.5" fill="#DCECEB" stroke="#2B6D69" stroke-width="1"/>
          <rect x="88" y="76" width="8" height="8" rx="1.5" fill="#DCECEB" stroke="#2B6D69" stroke-width="1"/>
          <rect x="100" y="76" width="8" height="8" rx="1.5" fill="#DCECEB" stroke="#2B6D69" stroke-width="1"/>
          <!-- Heartbeat line -->
          <path d="M18 86H38L42 78L46 94L50 82L54 86" stroke="#2B6D69" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <!-- Tree -->
          <circle cx="134" cy="80" r="10" fill="#B5D4D1"/>
          <rect x="132" y="88" width="4" height="10" rx="1" fill="#7FA6A3"/>
        </svg>
      </div>`,
    fire: `
      <div class="event-illustration topic-fire" aria-hidden="true">
        <svg viewBox="0 0 160 140" fill="none">
          <path d="M0 108C30 96 60 92 90 94C120 96 140 100 160 108V140H0Z" fill="#E6C8C0"/>
          <path d="M0 120C40 114 80 112 120 114C140 116 152 118 160 120V140H0Z" fill="#D4AFA4"/>
          <!-- Mountains with trees -->
          <path d="M0 94L25 62L45 80L65 52L90 78L110 58L140 82L160 70V94Z" fill="#D4AFA4" opacity="0.4"/>
          <!-- Pine trees -->
          <path d="M24 82L30 66L36 82Z" fill="#8B6E5C"/>
          <path d="M26 78L30 70L34 78Z" fill="#9B7E6C"/>
          <path d="M110 76L118 56L126 76Z" fill="#8B6E5C"/>
          <path d="M113 72L118 60L123 72Z" fill="#9B7E6C"/>
          <!-- Fire flame -->
          <path d="M70 36C70 36 54 56 54 70C54 79 61 86 70 86C79 86 86 79 86 70C86 56 70 36 70 36Z" fill="#A84233"/>
          <path d="M70 86C75 86 78 82 78 77C78 72 70 64 70 64C70 64 62 72 62 77C62 82 65 86 70 86Z" fill="#D68431"/>
          <path d="M70 86C73 86 75 84 75 81C75 78 70 72 70 72C70 72 65 78 65 81C65 84 67 86 70 86Z" fill="#E8A84C"/>
          <!-- Smoke wisps -->
          <path d="M66 34C64 28 66 22 72 20" stroke="#8B5E3C" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.5"/>
          <path d="M74 32C76 26 74 20 68 18" stroke="#8B5E3C" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.4"/>
          <!-- Shield/badge outline -->
          <path d="M130 88C130 82 136 78 142 78C148 78 154 82 154 88C154 96 142 104 142 104C142 104 130 96 130 88Z" fill="none" stroke="#A84233" stroke-width="2"/>
          <path d="M139 88H145M142 85V91" stroke="#A84233" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>`,
    school: `
      <div class="event-illustration topic-school" aria-hidden="true">
        <svg viewBox="0 0 160 140" fill="none">
          <path d="M0 108C30 96 60 92 90 94C120 96 140 100 160 108V140H0Z" fill="#D8CDEB"/>
          <path d="M0 120C40 114 80 112 120 114C140 116 152 118 160 120V140H0Z" fill="#C0B2D6"/>
          <!-- School building -->
          <rect x="34" y="54" width="92" height="46" rx="6" fill="#FCFBFE" stroke="#5F4A67" stroke-width="2"/>
          <!-- Bell tower -->
          <rect x="72" y="36" width="16" height="20" rx="3" fill="#FCFBFE" stroke="#5F4A67" stroke-width="2"/>
          <circle cx="80" cy="46" r="4" fill="#E8E0F5" stroke="#5F4A67" stroke-width="1.5"/>
          <!-- Flag -->
          <path d="M80 26V36" stroke="#5F4A67" stroke-width="1.5"/>
          <path d="M80 26L92 30L80 34" fill="#5F4A67"/>
          <!-- Windows -->
          <rect x="42" y="64" width="10" height="14" rx="2" fill="#E8E0F5" stroke="#5F4A67" stroke-width="1.2"/>
          <rect x="58" y="64" width="10" height="14" rx="2" fill="#E8E0F5" stroke="#5F4A67" stroke-width="1.2"/>
          <rect x="92" y="64" width="10" height="14" rx="2" fill="#E8E0F5" stroke="#5F4A67" stroke-width="1.2"/>
          <rect x="108" y="64" width="10" height="14" rx="2" fill="#E8E0F5" stroke="#5F4A67" stroke-width="1.2"/>
          <!-- Door -->
          <rect x="74" y="82" width="12" height="18" rx="2" fill="#5F4A67"/>
          <!-- Book -->
          <path d="M22 80L18 68L30 64L34 76Z" fill="#E8E0F5" stroke="#5F4A67" stroke-width="1.2"/>
          <path d="M26 72V64" stroke="#5F4A67" stroke-width="1"/>
          <!-- Apple -->
          <circle cx="140" cy="78" r="7" fill="#D88A9A"/>
          <path d="M140 71V68" stroke="#5F4A67" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M140 68C142 67 144 68 144 68" stroke="#5B7A5E" stroke-width="1" stroke-linecap="round"/>
        </svg>
      </div>`,
    infrastructure: `
      <div class="event-illustration topic-infrastructure" aria-hidden="true">
        <svg viewBox="0 0 160 140" fill="none">
          <path d="M0 108C30 96 60 92 90 94C120 96 140 100 160 108V140H0Z" fill="#D8E2CC"/>
          <path d="M0 120C40 114 80 112 120 114C140 116 152 118 160 120V140H0Z" fill="#C0CEAE"/>
          <!-- Water drop -->
          <path d="M36 50C36 50 24 66 24 74C24 80 29 86 36 86C43 86 48 80 48 74C48 66 36 50 36 50Z" fill="#B8D4E8" stroke="#5B7A5E" stroke-width="1.5"/>
          <path d="M32 74C32 70 36 64 36 64" stroke="#F8FBF6" stroke-width="1.5" stroke-linecap="round"/>
          <!-- Pipe/utility line -->
          <rect x="56" y="68" width="60" height="8" rx="4" fill="#E3EAD8" stroke="#5B7A5E" stroke-width="1.5"/>
          <circle cx="66" cy="72" r="2" fill="#5B7A5E"/>
          <circle cx="80" cy="72" r="2" fill="#5B7A5E"/>
          <circle cx="94" cy="72" r="2" fill="#5B7A5E"/>
          <circle cx="106" cy="72" r="2" fill="#5B7A5E"/>
          <!-- Wrench -->
          <path d="M128 54C124 50 124 44 128 40C130 38 133 37 136 37C137 37 138 37 139 38L134 43L134 47L138 47L143 42C144 43 144 44 144 45C144 48 143 51 141 53C137 57 131 57 128 54Z" fill="none" stroke="#5B7A5E" stroke-width="2" stroke-linejoin="round"/>
          <path d="M128 54L118 64" stroke="#5B7A5E" stroke-width="2.5" stroke-linecap="round"/>
          <!-- Manhole cover -->
          <ellipse cx="80" cy="96" rx="16" ry="5" fill="none" stroke="#5B7A5E" stroke-width="2"/>
          <path d="M72 96H88" stroke="#5B7A5E" stroke-width="1.5"/>
          <path d="M80 91V101" stroke="#5B7A5E" stroke-width="1.5"/>
        </svg>
      </div>`,
    governance: `
      <div class="event-illustration topic-governance" aria-hidden="true">
        <svg viewBox="0 0 160 140" fill="none">
          <path d="M0 108C30 96 60 92 90 94C120 96 140 100 160 108V140H0Z" fill="#DDD2C6"/>
          <path d="M0 120C40 114 80 112 120 114C140 116 152 118 160 120V140H0Z" fill="#C8BBAE"/>
          <!-- Town hall building -->
          <path d="M40 56L80 36L120 56" stroke="#6A5948" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <rect x="44" y="56" width="72" height="40" fill="#F4F1EC" stroke="#6A5948" stroke-width="2"/>
          <!-- Columns -->
          <rect x="54" y="60" width="5" height="32" rx="2" fill="#E9E1D8" stroke="#6A5948" stroke-width="1.2"/>
          <rect x="70" y="60" width="5" height="32" rx="2" fill="#E9E1D8" stroke="#6A5948" stroke-width="1.2"/>
          <rect x="86" y="60" width="5" height="32" rx="2" fill="#E9E1D8" stroke="#6A5948" stroke-width="1.2"/>
          <rect x="102" y="60" width="5" height="32" rx="2" fill="#E9E1D8" stroke="#6A5948" stroke-width="1.2"/>
          <!-- Steps -->
          <rect x="40" y="96" width="80" height="4" rx="1" fill="#E9E1D8" stroke="#6A5948" stroke-width="1.2"/>
          <rect x="36" y="100" width="88" height="4" rx="1" fill="#E9E1D8" stroke="#6A5948" stroke-width="1.2"/>
          <!-- Clock -->
          <circle cx="80" cy="48" r="6" fill="#F4F1EC" stroke="#6A5948" stroke-width="1.5"/>
          <path d="M80 44V48L83 50" stroke="#6A5948" stroke-width="1.2" stroke-linecap="round"/>
          <!-- Gavel -->
          <rect x="18" y="72" width="14" height="8" rx="2" fill="#E9E1D8" stroke="#6A5948" stroke-width="1.5"/>
          <path d="M25 80V90" stroke="#6A5948" stroke-width="2" stroke-linecap="round"/>
          <!-- Scale of justice hint -->
          <path d="M132 64V84" stroke="#6A5948" stroke-width="2" stroke-linecap="round"/>
          <path d="M124 68H140" stroke="#6A5948" stroke-width="2" stroke-linecap="round"/>
          <path d="M124 68L122 76H128Z" fill="#E9E1D8" stroke="#6A5948" stroke-width="1.2"/>
          <path d="M140 68L138 76H144Z" fill="#E9E1D8" stroke="#6A5948" stroke-width="1.2"/>
        </svg>
      </div>`
  };
  return art[topic] || art.governance;
}


// ══════════════════
// ── Rendering ──
// ══════════════════

// Entity logos -- uses hosted PNGs where available, inline SVGs as fallback
function renderLogo(source) {
  const logo = ENTITY_LOGOS[source];
  if (!logo) return '';
  return `<div class="card-logo">${logo}</div>`;
}

// ── Town location images for event cards ──
function getTownImage(item) {
  const loc = ((item.location || '') + ' ' + (item.title || '') + ' ' + (item.description || '')).toLowerCase();
  if (/placerville/.test(loc)) return TOWN_IMAGES.placerville;
  if (/ophir/.test(loc)) return TOWN_IMAGES.ophir;
  if (/ridgway|sherbino|colorado boy depot/.test(loc)) return TOWN_IMAGES.ridgway;
  if (/norwood/.test(loc)) return TOWN_IMAGES.norwood;
  // Nucla and Naturita are sister towns 1 mile apart but each has its own
  // illustrated town badge. Match Naturita first since it's more specific.
  if (/naturita/.test(loc)) return TOWN_IMAGES.naturita;
  if (/nucla/.test(loc)) return TOWN_IMAGES.nucla;
  if (/ouray/.test(loc)) return TOWN_IMAGES.ouray;
  if (/mountain village|mtn village|fire station/.test(loc)) return TOWN_IMAGES.mv;
  if (/telluride|wilkinson|library|main street|alibi|arts hq|downtown/.test(loc)) return TOWN_IMAGES.telluride;
  return TOWN_IMAGES.telluride; // default to Telluride
}


function renderBadge(item) {
  const badges = [];
  if (item.type === 'meeting' || item.type === 'news') {
    return '';
  }
  let badgeClass = 'badge-county';
  if (item.source === 'telluride') badgeClass = 'badge-telluride';
  else if (item.source === 'smart') badgeClass = 'badge-smart';
  else if (item.source === 'mv') badgeClass = 'badge-mv';
  else if (item.source === 'school') badgeClass = 'badge-school';
  else if (item.source === 'fire') badgeClass = 'badge-fire';
  else if (item.source === 'med') badgeClass = 'badge-med';
  else if (item.source === 'norwood') badgeClass = 'badge-norwood';
  else if (item.source === 'ophir') badgeClass = 'badge-ophir';
  else if (item.source === 'airport') badgeClass = 'badge-airport';
  else if (item.source === 'localgroup') badgeClass = 'badge-localgroup';
  else if (item.source === 'ttimes') badgeClass = 'badge-ttimes';
  else if (item.source === 'wilkinson') badgeClass = 'badge-wilkinson';
  else if (item.source === 'koto') badgeClass = 'badge-koto';
  else if (item.source === 'telluride-com') badgeClass = 'badge-county';
  badges.push(`<span class="source-badge ${badgeClass}">${item.sourceLabel}</span>`);
  if (item.typeLabel) badges.push(`<span class="category-tag">${item.typeLabel}</span>`);
  return badges.join('');
}

// Strip the word "Meeting" from card titles to reduce clutter
function cleanTitle(title, source) {
  if (!title) return '';
  let cleaned = title
    .replace(/\s+Meeting$/i, '')
    .replace(/\s+Meeting\s*--/i, ' --')
    .replace(/\s+Meeting\s*-/i, ' -');
  if (source && SOURCE_SHORT_NAME[source]) {
    cleaned = SOURCE_SHORT_NAME[source] + ': ' + cleaned;
  }
  return cleaned;
}

// ── Remote Access Links per Entity ──
// ── Default meeting addresses by entity ──
function resolveLocation(item) {
  if (item.location && item.location.trim()) return item.location;
  return ENTITY_ADDRESS[item.source] || 'Telluride, CO';
}

// ── Calendar URL Generators ──

function parseTimeStr(timeStr) {
  // Parse "2:00 PM" or "9:30 AM" etc. into {hours, minutes}
  if (!timeStr) return null;
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hours !== 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return { hours, minutes };
}

function buildCalendarDates(item) {
  // Returns {start, end} as Date objects
  const d = new Date(item.eventDate);
  const timeRange = item.eventTimes || '';
  const times = timeRange.split(/\s*[--]\s*/);
  const startTime = parseTimeStr(times[0]);
  const endTime = times[1] ? parseTimeStr(times[1]) : null;

  let start = new Date(d);
  let end = new Date(d);
  if (startTime) {
    start.setHours(startTime.hours, startTime.minutes, 0, 0);
    if (endTime) {
      end.setHours(endTime.hours, endTime.minutes, 0, 0);
    } else {
      // Default 2-hour duration
      end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    }
  } else {
    // All-day style: 9 AM to 11 AM default
    start.setHours(9, 0, 0, 0);
    end.setHours(11, 0, 0, 0);
  }
  return { start, end };
}

function isMeetingEnded(item) {
  // Returns true if the meeting's end time has passed
  if (!item.eventDate) return false;
  const now = new Date();
  const { end } = buildCalendarDates(item);
  return end < now;
}

function toGoogleCalStr(d) {
  // Google Calendar format: YYYYMMDDTHHMMSS (local)
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

function buildZoomDetails(item, separator) {
  // Build a Zoom info string for calendar event descriptions
  const sep = separator || '\\n';
  const parts = [];
  const zoomUrl = getMeetingZoomLink(item);
  const info = getMeetingPasscode(item);
  const remote = ENTITY_REMOTE[item.source] || {};

  if (zoomUrl) parts.push('Join Zoom: ' + zoomUrl);
  if (info && info.id) parts.push('Meeting ID: ' + info.id);
  if (info && info.passcode) parts.push('Passcode: ' + info.passcode);
  if (info && info.phone) parts.push('Phone: ' + info.phone);
  if (remote.livestream) parts.push('Livestream: ' + remote.livestream);

  return parts.length > 0 ? sep + parts.join(sep) : '';
}

function googleCalUrl(item) {
  const { start, end } = buildCalendarDates(item);
  const loc = resolveLocation(item);
  const zoomInfo = buildZoomDetails(item, '\\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: item.title + ' (' + item.sourceLabel + ')',
    dates: toGoogleCalStr(start) + '/' + toGoogleCalStr(end),
    details: 'Source: ' + item.sourceLabel + (item.link ? '\\nMore info: ' + item.link : '') + '\\nLocation: ' + loc + zoomInfo,
    location: loc,
    ctz: 'America/Denver'
  });
  // Add 1-hour reminder (Google Calendar uses this undocumented but widely-used param)
  return 'https://calendar.google.com/calendar/render?' + params.toString() + '&trp=true&sprop=website:liveabletelluride.org&rem=60m';
}

function outlookCalUrl(item) {
  const { start, end } = buildCalendarDates(item);
  const loc = resolveLocation(item);
  const zoomInfo = buildZoomDetails(item, ' | ');
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: item.title + ' (' + item.sourceLabel + ')',
    startdt: fmt(start),
    enddt: fmt(end),
    location: loc,
    body: 'Source: ' + item.sourceLabel + (item.link ? ' | More info: ' + item.link : '') + ' | Location: ' + loc + zoomInfo
  });
  return 'https://outlook.live.com/calendar/0/action/compose?' + params.toString();
}

function icsDataUri(item) {
  const { start, end } = buildCalendarDates(item);
  const loc = resolveLocation(item);
  const zoomInfo = buildZoomDetails(item, '\\n');
  const pad = n => String(n).padStart(2, '0');
  const icsDate = d => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const now = new Date();
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LiveableTelluride//GovHub//EN',
    'BEGIN:VEVENT',
    'DTSTART;TZID=America/Denver:' + icsDate(start),
    'DTEND;TZID=America/Denver:' + icsDate(end),
    'SUMMARY:' + item.title + ' (' + item.sourceLabel + ')',
    'LOCATION:' + loc,
    'DESCRIPTION:' + item.sourceLabel + (item.link ? ' -- ' + item.link : '') + ' | ' + loc + zoomInfo,
    'UID:' + icsDate(start) + '-' + item.source + '@liveabletelluride.org',
    'DTSTAMP:' + icsDate(now) + 'Z',
    'BEGIN:VALARM',
    'TRIGGER:-PT60M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder: ' + item.title + ' starts in 1 hour',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
}

function renderCardActions(item) {
  const gIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
  const zoomIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';
  const ytIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.13C5.12 19.56 12 19.56 12 19.56s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg>';

  let html = '<div class="card-actions">';

  // Calendar buttons
  html += `<a href="${googleCalUrl(item)}" target="_blank" rel="noopener" class="cal-btn" title="Add to Google Calendar">${gIcon} Google</a>`;
  html += `<a href="${outlookCalUrl(item)}" target="_blank" rel="noopener" class="cal-btn" title="Add to Outlook Calendar">${gIcon} Outlook</a>`;
  html += `<a href="${icsDataUri(item)}" download="${item.title.replace(/[^a-zA-Z0-9]/g, '_')}.ics" class="cal-btn" title="Download .ics file (Apple Calendar, etc.)">${gIcon} iCal</a>`;

  // ── Livestream button (day-of only) ──
  const remote = ENTITY_REMOTE[item.source] || {};
  const today = new Date();
  const isToday = item.eventDate &&
    item.eventDate.getFullYear() === today.getFullYear() &&
    item.eventDate.getMonth() === today.getMonth() &&
    item.eventDate.getDate() === today.getDate();
  if (isToday && remote.livestream) {
    const ytIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.13C5.12 19.56 12 19.56 12 19.56s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg>';
    html += `<a href="${remote.livestream}" target="_blank" rel="noopener" class="livestream-link" title="${remote.livestreamLabel || 'Watch'}">${ytIcon} ${remote.livestreamLabel || 'Watch Live'}</a>`;
  }

  html += '</div>';
  return html;
}

// Only show Board, Council, Commission, and similar governmental meetings
// (excludes recreational events like "Open Roller Skating", "Movie Night", etc.)
// Meeting bodies to hide from the Gov-Hub tab permanently.
// Add a body's full title substring (case-insensitive) to exclude it.
function isGovernmentalMeeting(item) {
  // Check against the permanent hidden-bodies list first
  const titleLow = (item.title || '').toLowerCase();
  if (HIDDEN_MEETING_BODIES.some(b => titleLow.includes(b))) return false;
  // Cached sources (smart, mv, school, fire, med, norwood, ophir, localgroup) are already curated meetings
  if (['smart', 'mv', 'school', 'fire', 'med', 'norwood', 'ophir', 'airport', 'localgroup'].includes(item.source)) return true;
  // For dynamic feeds (telluride, county), filter by title
  return GOV_MEETING_PATTERN.test(item.title);
}


function parseEventTimeRange(eventTimes) {
  if (!eventTimes) return null;
  const text = String(eventTimes).trim().replace(/\s+/g, ' ');
  const match = text.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
  if (!match) return null;
  return { start: match[1], end: match[2] };
}

function combineDateAndTime(dateVal, timeStr) {
  if (!dateVal || !timeStr) return null;
  const d = new Date(dateVal);
  if (isNaN(d)) return null;
  const m = String(timeStr).trim().match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  d.setHours(hour, minute, 0, 0);
  return d;
}

function getCommentDeadline(item) {
  if (!item || !item.eventDate) return null;

  const title = String(item.title || '').toLowerCase();
  const summary = String(getMeetingSummary(item) || '').toLowerCase();
  const description = String(item.description || '').toLowerCase();
  const combined = `${title} ${summary} ${description}`;

  // Heuristic: hearings / public comment items get a same-day 12:00 PM default,
  // otherwise use 5:00 PM on the prior business day.
  const isPublicHearing =
    /hearing|public hearing|ordinance|resolution|first reading|second reading|quasi-judicial|appeal|public comment/.test(combined);

  const eventStart = combineDateAndTime(item.eventDate, parseEventTimeRange(item.eventTimes || '')?.start || null);

  let deadline;
  if (isPublicHearing && eventStart) {
    deadline = new Date(eventStart);
    deadline.setHours(12, 0, 0, 0);
  } else {
    deadline = new Date(item.eventDate);
    deadline.setDate(deadline.getDate() - 1);
    deadline.setHours(17, 0, 0, 0);
  }

  return {
    datetime: deadline,
    label: isPublicHearing
      ? `Comment due: ${friendlyDate(deadline)} by 12:00 PM`
      : `Comment due: ${friendlyDate(deadline)} by 5:00 PM`
  };
}






function isCountyPlanningMeeting(item) {
  const text = `${item.title || ''} ${getMeetingSummary(item) || ''} ${item.description || ''}`.toLowerCase();
  return item.source === 'county' && /planning commission|planning/.test(text);
}
function isMountainVillagePlanningMeeting(item) {
  const text = `${item.title || ''} ${getMeetingSummary(item) || ''} ${item.description || ''}`.toLowerCase();
  return item.source === 'mv' && /planning|design review commission|planning commission/.test(text);
}
function renderOfficialCommentInfo(item) {
  if (!item) return '';

  let quote = '';
  let email = '';
  let label = '';

  // Determine the receiving body from the meeting title
  const titleLower = (item.title || '').toLowerCase();
  function bodyLabel() {
    if (/planning.*zoning|p\s*&\s*z|planning commission/.test(titleLower)) return 'the Planning Commission';
    if (/town council/.test(titleLower)) return 'Town Council';
    if (/board of county commissioners|bocc/.test(titleLower)) return 'the BOCC';
    if (/design review|drc/.test(titleLower)) return 'the Design Review Board';
    if (/housing authority/.test(titleLower)) return 'the Housing Authority';
    if (/school.*board|board of education/.test(titleLower)) return 'the School Board';
    if (/board of trustees/.test(titleLower)) return 'the Board of Trustees';
    if (/board of directors/.test(titleLower)) return 'the Board of Directors';
    if (/town board/.test(titleLower)) return 'the Town Board';
    if (/council/.test(titleLower)) return 'Council';
    if (/commission/.test(titleLower)) return 'the Commission';
    if (/board/.test(titleLower)) return 'the Board';
    return '';
  }
  const body = bodyLabel();
  const submitLabel = body ? 'Submit Comments to ' + body : 'Submit Comments';

  if (item.source === 'county') {
    const isPlanning = isCountyPlanningMeeting(item);
    quote = 'Written comments must be received by Monday at 4:00 pm (prior to the meeting). Later comments will be provided to members as time allows.';
    email = isPlanning ? 'planningcommission@sanmiguelcountyco.gov' : 'bocc@sanmiguelcountyco.gov';
    label = submitLabel;
  } else if (item.source === 'telluride') {
    quote = 'Written comments must be received by Wednesday at noon (prior to the meeting). Later comments will be provided to members as time allows.';
    email = 'townclerk@telluride.gov';
    label = submitLabel;
  } else if (item.source === 'mv') {
    const isPlanning = isMountainVillagePlanningMeeting(item);
    quote = 'Written comments must be received by Thursday (prior to the meeting). Later comments will be provided to members as time allows.';
    email = isPlanning ? 'planning@mtnvillage.org' : 'council@mtnvillage.org';
    label = submitLabel;
  } else if (item.source === 'ophir') {
    quote = 'Written comments should be submitted 48 hours before the meeting.';
    email = 'clerk@ophir.us';
    label = submitLabel || 'Submit Comments to the Town Board';
  } else if (item.source === 'norwood') {
    quote = 'Written comments should be submitted 48 hours before the meeting.';
    email = 'cross@norwoodtown.com';
    label = submitLabel || 'Submit Comments to the Town Board';
  } else if (item.source === 'fire') {
    quote = 'Written comments should be submitted 48 hours before the meeting.';
    email = 'pdasaro@telluridefire.com';
    label = submitLabel || 'Submit Comments to the Fire Board';
  } else if (item.source === 'med') {
    quote = 'Written comments should be submitted 48 hours before the 4th Thursday of each month.';
    email = 'wcrossland@tellmed.org';
    label = submitLabel || 'Submit Comments to the Board';
  } else if (item.source === 'airport') {
    quote = 'Written comments may be submitted to the Airport Authority prior to the meeting.';
    email = 'info@tellurideairport.com';
    label = 'Submit Comments to the Airport Authority';
  } else {
    return '';
  }

  const meetingDate = item.eventDate ? fullDate(item.eventDate) : '';
  const subject = encodeURIComponent(`Please accept these written comments for ${item.title || 'Meeting'} - ${meetingDate}`);
  return `<div class="comment-note">${quote}<div class="comment-actions"><a class="comment-email-btn" href="mailto:${email}?subject=${subject}">✉️ ${label}</a></div></div>`;
}

// ── Quick Reactions: perspective buttons on meeting cards ──

function meetingReactionId(item) {
  const raw = (item.title || '') + '|' + (item.eventDate ? item.eventDate.toISOString().slice(0,10) : '');
  let h = 0;
  for (let i = 0; i < raw.length; i++) { h = ((h << 5) - h + raw.charCodeAt(i)) | 0; }
  return 'mtg_' + Math.abs(h).toString(36);
}

// Simple fingerprint for IP-like dedup (uses localStorage as proxy since true IP requires server)
function getDeviceFingerprint() {
  let fp = localStorage.getItem('_qr_fp');
  if (!fp) {
    fp = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('_qr_fp', fp);
  }
  return fp;
}

async function loadReactionCounts(docId) {
  if (!window._FIREBASE_READY || !window._FIREBASE_DB) return null;
  const db = window._FIREBASE_DB;
  const FB = window._FB;
  try {
    const snap = await FB.getDocs(FB.query(FB.collection(db, 'reactions'), FB.where('__name__', '==', docId)));
    if (!snap.empty) return snap.docs[0].data();
  } catch(e) { console.warn('loadReactionCounts error:', e); }
  return null;
}

async function submitReaction(docId, key) {
  if (!window._FIREBASE_READY || !window._FIREBASE_DB) return;
  const db = window._FIREBASE_DB;
  const FB = window._FB;
  const fp = getDeviceFingerprint();
  const votersField = key + '_voters';
  try {
    const ref = FB.doc(db, 'reactions', docId);
    const snap = await FB.getDocs(FB.query(FB.collection(db, 'reactions'), FB.where('__name__', '==', docId)));
    if (snap.empty) {
      const data = { created: FB.serverTimestamp() };
      QR_OPTIONS.forEach(o => { data[o.key] = 0; data[o.key + '_voters'] = []; });
      data[key] = 1;
      data[votersField] = [fp];
      await FB.setDoc(ref, data);
    } else {
      const existingData = snap.docs[0].data();
      const voters = existingData[votersField] || [];
      if (voters.includes(fp)) return null; // already voted
      const updateData = {};
      updateData[key] = FB.increment(1);
      updateData[votersField] = [...voters, fp];
      await FB.updateDoc(ref, updateData);
    }
    return true;
  } catch(e) { console.warn('submitReaction error:', e); return null; }
}

// ── Extract the single most contentious/important topic for a meeting ──
//
// Strategy: score every topic against weighted keyword tiers, then pick the
// highest-scoring one. This avoids the old "first match wins" problem where
// a procedural "Public hearing: continued" item beat a substantive housing
// amendment deeper in the agenda.
//
// Scoring: each keyword hit adds the tier's weight. Topics that match
// multiple tiers (e.g. "workforce housing deed amendments for Overlook PUD")
// accumulate points from ALL tiers, so they naturally rise to the top.
//
// Procedural / non-contentious topics are penalized or skipped entirely.

// Topics matching these patterns are procedural / non-contentious — skip them
function getKeyIssueTopic(item) {
  const summary = getMeetingSummary(item);
  if (!summary) return '';
  // Extra safety: reject the entire summary if it looks like placeholder/error text
  if (isBadSummary(summary)) return '';

  const rawTopics = summary.split(' · ').map(t => t.trim()).filter(Boolean);
  if (rawTopics.length === 0) return '';

  // Score each topic — only return topics that match known issue keywords
  let best = null;
  let bestScore = 0;

  rawTopics.forEach(topic => {
    const low = topic.toLowerCase();
    // Skip placeholder/error text that leaked into individual topics
    if (isBadSummary(topic)) return;
    // Skip procedural / non-contentious items
    if (SKIP_PATTERNS.some(pat => pat.test(topic))) return;
    // Skip pure work sessions with no substantive keywords
    if (/work session/i.test(topic) && !/housing|deed|pud|code|land use/i.test(topic)) return;

    let score = 0;
    for (const tier of KEY_ISSUE_TIERS) {
      let tierHits = 0;
      for (const kw of tier.keywords) {
        if (low.includes(kw)) tierHits++;
      }
      // Base tier weight + bonus for each additional keyword hit
      if (tierHits > 0) score += tier.weight + (tierHits - 1) * 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = topic;
    }
  });

  if (best) {
    // Strip procedural prefixes from display text
    best = best.replace(/^(⚖️\s*SECOND READING\s*[—–-]\s*|Public hearing:\s*|Consent:\s*|Admin:\s*|Legislation:\s*)/i, '');
    return best;
  }
  // No keyword-matched topic found — return empty rather than a generic fallback
  return '';
}

// Convert a raw topic string into a natural question for Quick Reactions.
// e.g. "Adoption of Colorado Wildfire Resiliency Code" → "What are your thoughts on the Wildfire Resiliency Code?"
function formatReactionQuestion(topic) {
  if (!topic) return '';
  let q = topic
    // Strip "(Ordinance, expected to pass)" or similar parenthetical
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    // Strip "Adoption of" / "Approval of" — the question already implies opinion
    .replace(/^(Adoption of|Approval of|Second Reading of|First Reading of)\s*/i, '')
    // Strip leading "the " / "an " / "a "
    .replace(/^(the|an|a)\s+/i, '')
    .trim();
  // Capitalize first letter
  q = q.charAt(0).toUpperCase() + q.slice(1);
  // Remove trailing period if any
  q = q.replace(/\.\s*$/, '');
  return 'What are your thoughts on the ' + q + '?';
}

// Only these meeting types get Quick Reactions (not DRB — those are individual project reviews)
function renderQuickReactions(item) {
  // Only show when an agenda has been posted
  if (!item.hasAgenda) return '';
  // Restrict to specific governing-body meeting types
  const titleLow = (item.title || '').toLowerCase();
  if (!REACTION_MEETING_TYPES.test(titleLow)) return '';
  const docId = meetingReactionId(item);
  const keyIssue = getKeyIssueTopic(item);
  // If no meaningful key issue was identified, hide the entire quick reactions section
  if (!keyIssue) return '';
  const reactionQ = formatReactionQuestion(keyIssue);
  let html = '<div class="quick-reactions" data-reaction-id="' + docId + '">';
  html += '<div class="quick-reactions-issue"><strong>Quick Reaction:</strong> ' + reactionQ + '</div>';
  html += '<div class="quick-reactions-btns">';
  QR_OPTIONS.forEach(o => {
    html += `<button class="qr-btn" data-key="${o.key}" data-doc="${docId}" onclick="handleQuickReaction(this, '${docId}', '${o.key}')">${o.emoji} ${o.label} <span class="qr-count">0</span></button>`;
  });
  html += '</div></div>';

  // Load counts async after render
  setTimeout(() => {
    loadReactionCounts(docId).then(data => {
      if (!data) return;
      const container = document.querySelector(`.quick-reactions[data-reaction-id="${docId}"]`);
      if (!container) return;
      const fp = getDeviceFingerprint();
      container.querySelectorAll('.qr-btn').forEach(btn => {
        const key = btn.dataset.key;
        const count = data[key] || 0;
        const voters = data[key + '_voters'] || [];
        btn.querySelector('.qr-count').textContent = count > 0 ? count : '';
        if (voters.includes(fp)) btn.classList.add('voted');
      });
    });
  }, 100);

  return html;
}

window.handleQuickReaction = async function(btn, docId, key) {
  if (btn.classList.contains('voted')) return;
  btn.classList.add('voted');
  const countEl = btn.querySelector('.qr-count');
  const cur = parseInt(countEl.textContent) || 0;
  countEl.textContent = cur + 1;

  const result = await submitReaction(docId, key);
  if (result === null) {
    // Already voted — revert
    btn.classList.remove('voted');
    countEl.textContent = cur || '';
  }
};

// renderMeetings() removed — all rendering handled by renderMeetingsWithTopic()

// ── Service-area geographic filter for Events tab ──
// Keeps events in San Miguel County, Ridgway, or Ophir.
// Events with no location pass through (assumed local).
function isWithinServiceArea(item) {
  const locRaw = (item.location || '').trim();
  if (!locRaw) return true; // no location = assume local, keep it

  const loc = locRaw.toLowerCase();

  // Always keep if location mentions a known local area
  const LOCAL_TERMS = [
    'telluride', 'mountain village', 'san miguel', 'ophir', 'ridgway',
    'norwood', 'placerville', 'sawpit', 'rico', 'ilium', 'ames',
    'lawson hill', 'sunnyside', 'society turn', 'ouray'
  ];
  if (LOCAL_TERMS.some(t => loc.includes(t))) return true;

  // Exclude "Colorado" alone (statewide events)
  if (/^colorado[,.]?\s*(usa|co\.?)?$/i.test(locRaw)) return false;

  // Exclude known out-of-area cities/regions
  const OUT_OF_AREA = [
    'crested butte', 'gunnison', 'denver', 'durango', 'colorado springs',
    'grand junction', 'pueblo', 'fort collins', 'boulder', 'aurora',
    'montrose', 'steamboat', 'vail', 'aspen', 'breckenridge', 'snowmass',
    'silverton', 'cortez', 'mancos', 'moab', 'fruita', 'naturita', 'nucla',
    'dolores, co', 'delta, co', 'statewide', 'across colorado',
    'throughout colorado'
  ];
  if (OUT_OF_AREA.some(t => loc.includes(t))) return false;

  // Location exists but isn't recognized — keep (conservative)
  return true;
}

function renderNews(items, filter) {
  const container = document.getElementById('news-content');
  let filtered = items;
  if (filter && filter !== 'all') {
    filtered = items.filter(i => i.source === filter);
  }

  // Sort ASCENDING by date (earliest first) — that way slicing keeps the
  // soonest events. Previous version sorted descending and sliced to 50,
  // which dropped the earliest events when total count exceeded the cap.
  filtered.sort((a, b) => (a.pubDate || 0) - (b.pubDate || 0));

  // Title+date dedup (cross-source dedup happened earlier in fetchAllNews;
  // this one catches same-source repeats).
  const seen = new Set();
  filtered = filtered.filter(i => {
    const key = i.title + '|' + (i.pubDate ? new Date(i.pubDate).toISOString().slice(0,10) : '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Today onward — local midnight
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  filtered = filtered.filter(i => !i.pubDate || i.pubDate >= todayStart);

  // Geographic filter — San Miguel County region only
  filtered = filtered.filter(isWithinServiceArea);

  // Within next 30 days
  const eventCutoff = new Date();
  eventCutoff.setDate(eventCutoff.getDate() + 30);
  filtered = filtered.filter(i => !i.pubDate || i.pubDate <= eventCutoff);

  // Drop government meetings — Town Council, Planning Commission, etc.
  // belong on the Gov-Hub tab, not the general Events tab. Same items are
  // routed to allMeetings via newsPromise.then() so they still surface there.
  filtered = filtered.filter(i => !isGovernmentalMeeting(i));

  // Cap (now safe — list is already sorted earliest-first, so the cap
  // affects far-future events not the soonest ones the user actually wants)
  filtered = filtered.slice(0, 200);

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">No recent news or alerts found.</div>';
    return;
  }

  // Group by date for chronological display
  const groups = {};
  filtered.forEach(item => {
    // Use local-date key (matches friendlyDate's local-midnight comparison).
    // toISOString() would key by UTC date, splitting evening events into a
    // "next UTC day" bucket that friendlyDate still labels "Today" — producing
    // two "Today" headers in Mountain Time.
    const key = item.pubDate ? dateGroupKey(item.pubDate) : 'unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  let html = '';
  Object.keys(groups).sort().forEach(dateKey => {
    const firstItem = groups[dateKey][0];
    html += `<div class="date-group">${friendlyDate(firstItem.pubDate)}</div>`;
    groups[dateKey].forEach(item => {
      const moreInfo = item.source === 'ttimes'
        ? `<a href="${item.link}" target="_blank" rel="noopener" class="agenda-link" style="margin-top:6px; display:inline-block;">More Information →</a>`
        : '';

      let calendarBtnHtml = '';
      const isEventItem = /Community Event|Meeting|Event/i.test(item.category || '');
      if (isEventItem && item.pubDate) {
        const calItem = Object.assign({}, item, {
          eventDate: item.eventDate || item.pubDate,
          eventTimes: item.eventTimes || '',
          location: item.location || ''
        });
        const gIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
        calendarBtnHtml = `<div class="card-actions"><a href="${googleCalUrl(calItem)}" target="_blank" rel="noopener" class="cal-btn" title="Add to Google Calendar">${gIcon} Add to Google Calendar</a></div>`;
      }

      // Check if this news item matches a festival — if so, show ticket button
      let festivalTicketHtml = '';
      const titleLower = (item.title || '').toLowerCase();
      TELLURIDE_FESTIVALS.forEach(fest => {
        const festLower = fest.name.toLowerCase().replace(/\s*\(.*\)\s*/, ''); // strip parenthetical
        if (fest.ticketUrl && titleLower.includes(festLower.split(' ').slice(0, 2).join(' '))) {
          festivalTicketHtml = `<a href="${fest.ticketUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation();" style="display:inline-flex;align-items:center;gap:4px;margin-top:6px;padding:5px 14px;background:var(--accent-green);color:#fff;border-radius:6px;font-size:0.72rem;font-weight:700;text-decoration:none;">${fest.ticketLabel}</a>`;
        }
      });
      // Community events with ticket URLs
      if (item.source === 'community' && item.ticketUrl && !festivalTicketHtml) {
        festivalTicketHtml = `<a href="${item.ticketUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation();" style="display:inline-flex;align-items:center;gap:4px;margin-top:6px;padding:5px 14px;background:var(--accent-green);color:#fff;border-radius:6px;font-size:0.72rem;font-weight:700;text-decoration:none;">Get Tickets</a>`;
      }

      html += `
        <div class="card" data-source="${item.source}">
          <div class="card-body">
            <div class="event-card-main">
              <div class="event-card-content">
                ${renderBadge(item)} ${moreInfo}
                <h3><a href="${item.link}" target="_blank" rel="noopener">${cleanTitle(item.title, item.source)}</a></h3>
                ${item.pubDate ? `<div class="meta">${fullDate(item.pubDate)}</div>` : ''}
                ${item.location ? `<div class="meta"><span class="location">📍 ${item.location}</span></div>` : ''}
                ${item.description ? `<div class="description">${item.description}</div>` : ''}
                ${festivalTicketHtml}
                ${calendarBtnHtml}
              </div>
              ${item.imageUrl
                ? `<div class="event-illustration event-photo" aria-hidden="true"><img src="${item.imageUrl}" alt="${item.title}" loading="lazy"></div>`
                : `<div class="event-illustration event-photo" aria-hidden="true"><img src="${getTownImage(item)}" alt="${item.location || 'Event'}" loading="lazy"></div>`}
            </div>
          </div>
        </div>`;
    });
  });

  container.innerHTML = html;
}

// ══════════════════════════
// ── Tab & Filter Logic ──
// ══════════════════════════

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'land-use') renderLandUseTab();
    if (btn.dataset.tab === 'local-news') renderLocalNews(null, currentLocalNewsFilter);
    // Re-render Legal Notices on tab-switch — the initial page-load render
    // can race with the legals data load, leaving the tab empty if user
    // clicks before init finishes. Re-rendering on click is idempotent
    // and guarantees content.
    if (btn.dataset.tab === 'legals') renderLegalNoticesWithTopic();
    // Toggle left-sidebar cards per tab
    const wtfBar = document.getElementById('whatToFollowBar');
    const submitCard = document.getElementById('sidebarSubmitEvent');
    const upcomingEventsCard = document.getElementById('sidebarUpcomingEvents');
    const legalInterestCard = document.getElementById('sidebarLegalInterest');
    const legalNearbyCard = document.getElementById('sidebarLegalNearby');
    if (wtfBar) wtfBar.style.display = (btn.dataset.tab === 'meetings') ? '' : 'none';
    if (submitCard) submitCard.style.display = (btn.dataset.tab === 'news') ? '' : 'none';
    // Upcoming Events sidebar removed
    // if (upcomingEventsCard) upcomingEventsCard.style.display = (btn.dataset.tab === 'news') ? '' : 'none';
    if (legalInterestCard) legalInterestCard.style.display = (btn.dataset.tab === 'legals') ? '' : 'none';
    if (legalNearbyCard) legalNearbyCard.style.display = (btn.dataset.tab === 'legals') ? '' : 'none';
    // Hide sidebars on Subscribe, Land Use, and Gondola tabs, show on all others
    const layout = document.querySelector('.main-layout');
    layout.classList.toggle('meetings-active', btn.dataset.tab === 'meetings');
    layout.classList.toggle('subscribe-active', btn.dataset.tab === 'subscribe');
    layout.classList.toggle('landuse-active', btn.dataset.tab === 'land-use' || btn.dataset.tab === 'housing-search');
    layout.classList.toggle('localnews-active', btn.dataset.tab === 'local-news');
    layout.classList.toggle('links-active', btn.dataset.tab === 'links');
    layout.classList.toggle('news-active', btn.dataset.tab === 'news');
    layout.classList.toggle('legals-active', btn.dataset.tab === 'legals');
    layout.classList.toggle('aboutus-active', btn.dataset.tab === 'about-us');
    layout.classList.toggle('hubbub-active', btn.dataset.tab === 'hub-bub');
    layout.classList.toggle('communitypulse-active', btn.dataset.tab === 'community-pulse');
    var ddBar = document.getElementById('deepDiveSubmenu');
    if (ddBar) ddBar.style.display = (btn.dataset.tab === 'meetings') ? 'block' : 'none';
    // Hide subscribe bar when on Subscribe, About Us, or Hub-Bub tab
    const subBar = document.querySelector('.subscribe-bar');
    if (subBar) subBar.style.display = (btn.dataset.tab === 'subscribe' || btn.dataset.tab === 'about-us' || btn.dataset.tab === 'hub-bub') ? 'none' : '';
    // Update URL hash for bookmarking/sharing
    var newHash = '#' + btn.dataset.tab;
    if (window.location.hash !== newHash) {
      history.pushState(null, '', newHash);
    }
  });
});

let allMeetings = [];
let allNews = [];

// Meeting filter chips
document.querySelectorAll('.chip[data-tab-target="meetings"]').forEach(chip => {
  chip.addEventListener('click', () => {
    // Delegate to the single source of truth — keeps chip row + right
    // sidebar visual state in sync.
    setMeetingsFilter(chip.dataset.filter);
  });
});

// Events tab filter chips (location-based: by town)
document.querySelectorAll('.chip[data-tab-target="news"]').forEach(chip => {
  chip.addEventListener('click', () => {
    const filter = chip.dataset.filter;
    document.querySelectorAll('.chip[data-tab-target="news"]').forEach(c => {
      c.className = 'chip';
    });
    chip.classList.add(filter === 'all' ? 'active-all' : 'active-town');
    // Store which town filter is active. The value is one of:
    // 'all', 'town-telluride', 'town-mv', 'town-norwood', 'town-ridgway',
    // 'town-ouray', 'town-ophir', 'town-placerville'.
    window._currentNewsFilter = filter;
    renderNewsWithTopic();
  });
});

// Detect which town an event "belongs to" from its location/title text.
// Returns one of the chip data-filter values, or null when nothing matches.
function detectEventTown(item) {
  const text = ((item.location || '') + ' ' + (item.title || '')).toLowerCase();
  if (!text.trim()) return null;
  // Order matters — check more specific markers (Mountain Village) before
  // the parent town name (Telluride) so "Mountain Village" doesn't fall
  // through to a Telluride match via the substring "telluride".
  if (/\b(mountain village|mtn\.? village|mv town|tmvoa)\b/.test(text)) return 'town-mv';
  if (/\bnorwood\b/.test(text)) return 'town-norwood';
  // Sherbino Theater (604 Clinton St) and Colorado Boy Depot (687 N Cora
  // St) are both in Ridgway — venue names alone should classify the card.
  if (/\b(ridgway|sherbino|colorado boy depot)\b/.test(text)) return 'town-ridgway';
  if (/\bouray\b/.test(text)) return 'town-ouray';
  if (/\b(nucla|naturita)\b/.test(text)) return 'town-nucla';
  if (/\b(ophir|ilium|ames)\b/.test(text)) return 'town-ophir';
  if (/\b(placerville|sawpit|down valley)\b/.test(text)) return 'town-placerville';
  if (/\b(telluride|society turn|lawson hill|sunnyside|wilkinson|sheridan opera|palm theatre|transfer warehouse|ah haa|telluride elks|telluride foundation|tssc|pinhead|telluride innovation|telluride mountain school)\b/.test(text)) return 'town-telluride';
  return null;
}

// Local News filter chips (topic-based)
let currentLocalNewsFilter = 'all';
document.querySelectorAll('.chip[data-tab-target="local-news"]').forEach(chip => {
  chip.addEventListener('click', () => {
    const filter = chip.dataset.filter;
    document.querySelectorAll('.chip[data-tab-target="local-news"]').forEach(c => {
      c.className = 'chip';
    });
    if (filter === 'all') chip.classList.add('active-all');
    else if (filter === 'legal-notices') chip.classList.add('active-legal');
    else chip.classList.add('active-topic');
    currentLocalNewsFilter = filter;
    renderLocalNews(null, currentLocalNewsFilter);
    // Toggle legal sidebar cards when legal-notices filter is active
    const legalInterestCard = document.getElementById('sidebarLegalInterest');
    const legalNearbyCard = document.getElementById('sidebarLegalNearby');
    if (legalInterestCard) legalInterestCard.style.display = (filter === 'legal-notices') ? '' : 'none';
    if (legalNearbyCard) legalNearbyCard.style.display = (filter === 'legal-notices') ? '' : 'none';
  });
});

// ══════════ TELLURIDE TIMES — CURRENT HOMEPAGE STORIES ══════════
// Updated: 2026-04-01  — refresh periodically from telluridenews.com
const TELLURIDE_TIMES_ARTICLES = [
  {
    title: "US overdose deaths fell again in 2025, but some worry about policy and drug supply changes",
    source: "Telluride Times",
    date: "May 13, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "community",
    copy: "US overdose deaths dropped again in 2025 across most drug types and states, though Arizona, Colorado and New Mexico saw increases of 10% or more. While researchers are cautiously optimistic, they warn the drug supply keeps evolving with new potent substances like cychlorphine, and recent federal cuts to harm reduction programs could reverse progress.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_66099b39-b1b8-5596-bab2-43d492ff274a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/7e/f7eaaa55-d2df-5520-b082-970ac4c7d39f/6a048678a0970.image.jpg",
    imgHiRes: true
  },
  {
    title: "Move to acquire Wilkin Court unit raises questions",
    source: "Telluride Times",
    date: "May 13, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "housing",
    copy: "The town wants to purchase a Wilkin Court deed-restricted unit to convert it from Tier 3 to Tier 1, saying this simplifies the affordable housing program. But residents are challenging whether the town actually has legal authority to buy the unit against the owner's wishes, with one attorney arguing the deed restriction gives owners the right to choose their buyer.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_a8fa1aa6-0996-404d-b96d-28b33668f431.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/c4/8c400c14-efca-45da-b5f0-72721a6e54fc/6a04964540393.image.jpg",
    imgHiRes: true
  },
  {
    title: "Denver airport security initially missed trespasser who was killed by plane on runway",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-12",
    newsTopic: "community",
    copy: "A man who entered Denver airport intending to take his own life was struck and killed by a Frontier Airlines plane during takeoff Friday night. Security initially missed the trespasser when an alarm triggered, mistakenly attributing it to nearby deer, and couldn't intervene in time once he was spotted crossing the runway. The collision caused an engine fire that forced passenger evacuation, injuring 12 people with 5 hospitalized.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_9fc2cb9e-0705-5c97-84c6-e314be457898.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/b3/bb30350f-f401-55b1-8ef1-47a01fa5d399/69ffaae0caae4.image.jpg",
    imgHiRes: true
  },
  {
    title: "CHALKBOARD for the week of May 14-20",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "government",
    copy: "This week's birthdays run from May 14-20, including local residents like Asher Ferguson, Marie Neisen, and the Priestley family members. The regular community calendar continues with Town Board meetings second Wednesdays, Farmers Market Thursdays 2-6 p.m., and various services like the food pantry Sundays 3-6 p.m.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/the_norwood_post/article_6db5a92b-5491-4bac-b91c-c21f3ee60db1.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/61/e61c1b48-54e4-483a-b1ab-1e99ed6d5d77/6a03b4fae7ac9.image.jpg",
    imgHiRes: true
  },
  {
    title: "Federal judge rules ICE in Colorado violated order limiting warrantless arrests",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "community",
    copy: "A federal judge ruled that ICE agents in Colorado violated a court order limiting warrantless arrests and failed to properly train officers or document such arrests. The ruling stems from an ACLU lawsuit over \"collateral arrests\" of people caught up in immigration enforcement actions. ICE must now provide officer training within 45 days and turn over arrest records.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_6835e55c-d86e-510b-9abd-c6f823a59ecc.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/ac/aac37bc9-0b93-5774-be58-3957819b40cc/6a03a5aa52159.image.jpg",
    imgHiRes: true
  },
  {
    title: "Green Grants thanks",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "community",
    copy: "Shawnna and Dennis Andrejko wrote to thank EcoAction Partners, specifically Siobhan Montoya Lavender and Kendra Held, along with Town of Telluride's Darin Graber for their help with a Telluride Green Grants project. The couple completed efficiency upgrades through the program that helps residents with sustainability improvements.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_02b77004-73f0-4b36-a906-72b8b5861d5d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Countywide Spring Clean-Up events return May 15-16",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "community",
    copy: "The annual Spring Clean-Up events return May 15-16, with electronics and household waste disposal at Carhenge in Telluride both days, plus Mountain Village and Norwood locations. The fourth annual Trash Bash follows May 17 at Elks Park.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_1ca77ddc-c404-48bd-8ccf-251ceda547b0.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/fc/7fcfe0e0-ef57-4065-83b8-194de28aaab7/6a03b367c3759.image.jpg",
    imgHiRes: true
  },
  {
    title: "Lawton Eddy of Salida performs pop-up poetry May 15",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "community",
    copy: "Lawton Eddy from Salida will perform pop-up poetry at the Wilkinson Library Magazine Room on Friday, May 15 at 1 p.m., with the prompt \"chasing grace.\" The free event encourages attendees to bring poems or stories to share, and Eddy has been involved with local poetry festivals and performances since the early 2000s.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_09a57ab6-8638-4062-8bdf-aa60ec487f06.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/3f/d3fbca7e-6388-43f7-adc1-be836916c378/6a03b263064bb.image.jpg",
    imgHiRes: true
  },
  {
    title: "Mental Health Awareness Month: Shining a Light",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "health",
    copy: "Tri-County Health Network is asking local businesses and governments to light their buildings green throughout May for Mental Health Awareness Month. The initiative aims to reduce stigma and encourage conversations about mental health support. Events include wearing green on May 15 and a community discussion May 11 at Norwood Community Center.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_398ee143-ea60-47b8-b5e4-54c6b5213317.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/e6/6e67ae1c-a27c-4cf1-a3a0-6e8e9c4e5360/6a03b16d57978.image.jpg",
    imgHiRes: true
  },
  {
    title: "Money reset: getting your budget back on track",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "government",
    copy: "With housing costs and basic expenses squeezing local budgets harder than usual, Telluride Foundation is offering free financial literacy workshops May 18th at Wilkinson Library - noon-1:30pm in English and 5:30-7pm in Spanish. The Foundation's emergency fund has seen applications jump from 70 to over 500 this year, prompting the partnership with four local banks to help residents build budgeting and savings skills.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_c19ec511-b459-4568-a13d-ec475a100b73.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Create your This is Colorado canvas",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "arts-culture",
    copy: "Telluride Arts is hosting a community canvas project at the Mountain Village distillery May 28 where folks can create 12x12 inch pieces expressing what being a Coloradan means to them. The finished canvases will form mosaics displayed at two locations June 15-July 31 as part of Colorado's 150th anniversary celebration.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_8f08686b-e1e8-4aec-8d3f-07f36dd37aff.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/3c/63c47cc3-338c-4e0c-90ef-9a73e5f4e924/6a03af2c08a42.image.jpg",
    imgHiRes: true
  },
  {
    title: "Why do pets come back?",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "community",
    copy: "The local animal shelter reminds folks that returning adopted pets is sometimes necessary due to family emergencies or housing issues, and they welcome animals back without judgment. They're encouraging potential adopters to consider their living situations beforehand, especially breed restrictions from landlords. Two returned pets currently available are Buddy, an active 80-pound mixed breed, and Albus, a friendly cat who needs to be the only feline.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_c79afdcf-67a2-4a53-af38-836434775c16.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/f5/8f5b69c6-c02a-490b-9be5-b2121e993e1e/6a03ae4e06eb8.image.jpg",
    imgHiRes: true
  },
  {
    title: "Norwood banquet celebrates community standouts",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "community",
    copy: "Norwood held its second annual Night of Elegance banquet at the Lone Cone Library, drawing 49 residents for dinner, music and awards. Mesa Rose Kitchen won Business of the Year for the second straight year, while Tom Meehan received the Norwood Noble award after retiring from 47 years as a volunteer firefighter and EMT.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_476e263a-ef79-45ed-96f1-efff9949fec9.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/ce/5ce29a5d-8bea-4c87-980e-a850058b903e/6a03852cadbff.image.png",
    imgHiRes: true
  },
  {
    title: "The condition PCOS is now called PMOS. What to know about the name change and what it means for care",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-13",
    newsTopic: "community",
    copy: "Medical experts have changed the name of PCOS (polycystic ovary syndrome) to PMOS (polycystic ovary metabolic syndrome) after 14 years of collaboration, saying the old name was confusing since the condition doesn't actually involve ovarian cysts. The hormonal condition affects weight, metabolism, mental health, and reproduction, with treatment focusing mainly on lifestyle changes like diet and exercise.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_9576d122-904f-5d3d-98b5-7b18da541ace.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/60/86041077-105e-5b75-a863-8057788e4508/6a039de6576da.image.jpg",
    imgHiRes: true
  },
  {
    title: "2026 NFL schedule: Broncos and Chiefs play in 1st Monday night game of the season",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-12",
    newsTopic: "arts-culture",
    copy: "The Broncos and Chiefs will face off in the first Monday night game of the 2026 NFL season, though Chiefs QB Patrick Mahomes' availability remains uncertain after tearing his ACL and LCL in December. Broncos quarterback Bo Nix is expected ready for training camp after breaking his ankle during the AFC playoffs.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_1f2793ff-0041-5e96-b185-b3d756e5252d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/be/bbeb5f6d-e5cf-57fd-b2ac-6cdf28676ddf/6a031be69f601.image.jpg",
    imgHiRes: true
  },
  {
    title: "Sweet success",
    source: "Telluride Times",
    date: "May 12, 2026",
    firstSeen: "2026-05-12",
    newsTopic: "community",
    copy: "The Telluride High School lacrosse team beat Holy Family 17-7 in the sweet 16, with the Miners jumping ahead early and never trailing after the first quarter. Beck Sommers led the scoring while goalies Bridger Barrett and Dylan Saunders split time in net for the sixth-seeded Miners, who improved to 13-3 overall.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_89d6205d-3340-4cd9-9e3c-7d05b688bf6e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/67/9672da42-7f48-4249-b019-db5fc45d6ef2/6a034f43b4e8c.image.jpg",
    imgHiRes: true
  },
  {
    title: "Suckla settles in as State House session concludes",
    source: "Telluride Times",
    date: "May 11, 2026",
    firstSeen: "2026-05-12",
    newsTopic: "education",
    copy: "Suckla wrapped up his second legislative session, having moved from an off-site office to the Capitol basement as he settles into the role. Six of his nine sponsored bills passed this year, including extending Rico's microgrid grant program and allowing Dolores County commissioners to cut their own salaries. He's focused on bringing rural perspective to the statehouse and says he measures success more by what bad legislation he helps stop than by his own bill count.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_0e6568c2-8995-4eca-ae19-b52af3986ef2.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/28/52826a48-fcca-484e-9ab9-69d9f8f4209f/6a0211f371496.image.jpg",
    imgHiRes: true
  },
  {
    title: "A new place ‘to do the best thing for animals’",
    source: "Telluride Times",
    date: "May 11, 2026",
    firstSeen: "2026-05-12",
    newsTopic: "community",
    copy: "Second Chance Animal Resource Center has taken over operations of the Delta Animal Shelter under a new contract with the City of Delta, expanding from their usual Ridgway base. They're planning to add adoption services, foster care, and pet food pantry programs - the first time Delta will have its own adoption program run locally.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_094235cf-a1a8-4a79-aab9-994d5aaef6e2.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/88/28830ff9-fa97-48a6-8fbe-9c40740b0658/6a01bd30b3b9a.image.jpg",
    imgHiRes: true
  },
  {
    title: "Register now for Rotary’s Hikeathon",
    source: "Telluride Times",
    date: "May 10, 2026",
    firstSeen: "2026-05-12",
    newsTopic: "arts-culture",
    copy: "Telluride Rotary's annual Hikeathon is accepting registrations, aiming to raise over $30,000 this year. Other nonprofits like Eco-Action Partners, Telluride Ski and Snowboard Club, and Telluride Jewish Community are forming teams to participate and raise funds for their own causes.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_13dee22d-ca0a-4c26-aa6e-dc9b48237c1e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/98/f982f29f-8daa-47c5-b33c-bd221752003d/69fa5a362344c.image.jpg",
    imgHiRes: true
  },
  {
    title: "NTSB gathering details on Frontier Airlines evacuation after plane hit and killed person in Denver",
    source: "Telluride Times",
    date: "May 10, 2026",
    firstSeen: "2026-05-12",
    newsTopic: "public-safety",
    copy: "A Frontier Airlines plane hit and killed someone on the runway at Denver International Airport during takeoff, causing an engine fire and forcing 231 people to evacuate via emergency slides. Twelve passengers suffered minor injuries and five were hospitalized, while the NTSB is reviewing whether the evacuation procedures warrant investigation.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_9b365202-fe0b-598d-ada5-f27d878bbeaf.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/b3/bb30350f-f401-55b1-8ef1-47a01fa5d399/69ffaae0caae4.image.jpg",
    imgHiRes: true
  },
  {
    title: "A Frontier plane hits a pedestrian during takeoff at Denver airport",
    source: "Telluride Times",
    date: "May 9, 2026",
    firstSeen: "2026-05-09",
    newsTopic: "community",
    copy: "A Frontier Airlines plane struck a pedestrian during takeoff at Denver International Airport, forcing an emergency stop and evacuation of 231 people on board. The pilot reported an engine fire and smoke in the cabin, leading to passengers evacuating via emergency slides onto the runway.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_ce4f636a-272a-57ad-8442-17632581041f.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/8c/f8cd2100-44dc-5e46-bfc7-7a1d38c7ad3a/69ff31aa9240c.image.jpg",
    imgHiRes: true
  },
  {
    title: "Building healthier, more resilient communities",
    source: "Telluride Times",
    date: "May 9, 2026",
    firstSeen: "2026-05-12",
    newsTopic: "land-use",
    copy: "A training session is being offered on building community resilience using research-based tools focused on positive childhood and adult experiences to help young people thrive. The program targets parents, educators, healthcare workers, and community members, with registration required in advance.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_76785698-df60-47e0-b643-594f8cbd8949.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/89/489e766b-f9b6-40f6-bb59-83fef25f771e/69ff7da2c5799.image.png",
    imgHiRes: true
  },
  {
    title: "‘Telluride: A Legacy of Legacies’",
    source: "Telluride Times",
    date: "May 8, 2026",
    firstSeen: "2026-05-09",
    newsTopic: "recreation",
    copy: "Ron Allred and Jim Wells bought majority interest in the ski area in 1978 and developed Mountain Village, the airport, and gondola over 25 years, transforming Telluride from a boarded-up mining town into a world-class resort. Allred's daughter Kristi and author David Strauss are writing \"Telluride: A Legacy of Legacies,\" interviewing locals who helped build the community from mid-1970s to 2000.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_c38b03a3-2122-4822-a291-a7b55317bab0.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/c5/0c550539-158f-416e-8854-85112f921ef3/69fe061ba1cd9.image.jpg",
    imgHiRes: true
  },
  {
    title: "Shop students show off",
    source: "Telluride Times",
    date: "May 8, 2026",
    firstSeen: "2026-05-09",
    newsTopic: "education",
    copy: "Middle school shop students recently completed their knick-knack shelves and wooden spoons. They are now starting to build wooden crates.",
    claudeSummary: false,
    href: "https://www.telluridenews.com/norwood_post/article_a544195c-3dec-4f7d-b1af-6ec2608ca417.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/cc/7cc40952-4413-4d9f-b281-4ff3348cf439/69fa5e574d670.image.jpg",
    imgHiRes: true
  },
  {
    title: "California, Nevada and Arizona announce temporary plan to save water from the Colorado River",
    source: "Telluride Times",
    date: "May 8, 2026",
    firstSeen: "2026-05-09",
    newsTopic: "infrastructure",
    copy: "Three lower Colorado River states announced emergency water cuts - Nevada and Arizona reducing use by one-third, California by 13% - as drought and overuse threaten Lake Powell and Lake Mead reservoir levels critical for hydropower and water delivery.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_137054fe-c04a-5681-b79b-c1e2088b3c63.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/f6/6f606ce2-4ca6-5126-92f8-60d57f784962/69fe3bc080d49.image.jpg",
    imgHiRes: true
  },
  {
    title: "The greatest heron",
    source: "Telluride Times",
    date: "May 8, 2026",
    firstSeen: "2026-05-08",
    newsTopic: "infrastructure",
    copy: "Male great blue herons start building nests to attract females, who then help complete construction before laying 2-6 pale blue eggs that hatch after 29 days. The fluffy gray chicks grow quickly into North America's largest herons, standing up to 4.5 feet tall with 6+ foot wingspans.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_1deaa175-5c6a-4156-a2e5-b36e9b739931.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/e6/2e633678-6370-4512-92b5-0b1765a25217/69fa58a638daf.image.jpg",
    imgHiRes: true
  },
  {
    title: "Man charged in Colorado firebomb attack on demonstrators to plead guilty to murder",
    source: "Telluride Times",
    date: "May 7, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "public-safety",
    copy: "A man who threw Molotov cocktails at demonstrators on Boulder's Pearl Street Mall last year, killing an 82-year-old woman and injuring a dozen others, is set to plead guilty to murder in state court. He still faces federal hate crime charges and potential death penalty for what prosecutors say was a planned attack targeting people perceived as connected to Israel.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_b30b6aed-46e8-5a99-9fb6-c77bfd748db0.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/67/d67d68d6-eb78-53a3-bec2-e05a4c063c21/69f906e808dfd.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride Town Council considers amendments to emergency fire restrictions",
    source: "Telluride Times",
    date: "May 7, 2026",
    firstSeen: "2026-05-08",
    newsTopic: "public-safety",
    copy: "Town Council is looking at changing fire ban procedures to let the town manager declare restrictions immediately instead of waiting for a council meeting and vote. The current process can cause delays when coordinating with the county and Mountain Village, who can implement bans faster than Telluride's required council approval.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_74780234-41a7-4a60-84a3-5278e7238f9a.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/1c/c1c690df-53af-497b-8b1b-0fd059c75885/69fc4d657a23b.image.jpg",
    imgHiRes: true
  },
  {
    title: "We’re in this together",
    source: "Telluride Times",
    date: "May 7, 2026",
    firstSeen: "2026-05-08",
    newsTopic: "arts-culture",
    copy: "A new county survey shows concerning mental health trends locally - 38% feel lonely, 55% had poor mental health days recently, and 33% report excessive drinking versus 20% statewide. The county hired Cole Cooper as its first Behavioral Health Projects Lead and is planning a walk-in behavioral health hub at Society Turn, while residents can already access free therapy sessions through a voter-approved fund by calling Tri-County Health Network.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_312e7171-4fbd-48b5-b190-d35e4439e8dc.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/fe/dfeb60ac-288d-4fe5-b2f2-528992d509e8/69fa6216b3098.image.jpg",
    imgHiRes: true
  },
  {
    title: "The man who firebombed Colorado demonstrators in 2025, killing 1, is sentenced to life in prison",
    source: "Telluride Times",
    date: "May 7, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "public-safety",
    copy: "The man who firebombed Colorado demonstrators in 2025, killing 1, is sentenced to life in prison.",
    claudeSummary: false,
    href: "https://www.telluridenews.com/news/state/article_0edbe8ac-df62-5ec8-8825-57c179fc633b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Man accused of firebombing Colorado demonstrators pleads guilty to murder",
    source: "Telluride Times",
    date: "May 7, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "public-safety",
    copy: "Man accused of firebombing Colorado demonstrators pleads guilty to murder.",
    claudeSummary: false,
    href: "https://www.telluridenews.com/news/state/article_67fbbc41-28b9-5ed3-99f1-824332d7dbf7.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Art for all",
    source: "Telluride Times",
    date: "May 7, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "arts-culture",
    copy: "Ah Haa's \"May as You Can\" program is back for its third year, offering art classes throughout May on a pay-what-you-can basis to remove financial barriers. Classes range from ceramics and textile mending to family workshops and cooking, with some students paying extra to cover costs for others who attend free.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_526ca757-3b6a-4ed3-a83a-0727b1d76e55.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/3e/c3e7b346-f9ad-487f-80f8-a7c72a40a371/69fc4a58b71bc.image.jpg",
    imgHiRes: true
  },
  {
    title: "Lawrence de Bivort",
    source: "Telluride Times",
    date: "May 7, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "community",
    copy: "Lawrence de Bivort, who moved to Telluride with his wife Eileen about ten years ago, has passed away. He was an avid outdoorsman who climbed fourteeners and explored the Southwest, and spent years writing a book on human cultural evolution. He's survived by his son Benjamin, sister Carlyle, and two nieces and nephews.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/obituaries/article_0fde58b6-845c-47a4-af53-0733fb89b0bb.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/b/92/b92397ab-fccb-4ed9-9d43-2eb1808a2886/69fb527eae2f8.image.jpg",
    imgHiRes: true
  },
  {
    title: "A late spring snowstorm slams Colorado, closing schools and disrupting commuters",
    source: "Telluride Times",
    date: "May 6, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "education",
    copy: "Late spring storm dumped over 2 feet of snow in mountain areas like Estes Park, while Denver got about 6 inches and closed schools Wednesday. The heavy, wet snow caused some crashes and downed tree branches, but temperatures are expected to climb back into the 70s by weekend.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_20728449-67c6-551b-8b24-b8ff7c5c661d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/4d/a4df46ad-e4d3-546a-8382-f9aba6b82c82/69fb2b5bd52db.image.jpg",
    imgHiRes: true
  },
  {
    title: "THS left out of soccer playoffs",
    source: "Telluride Times",
    date: "May 6, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "community",
    copy: "Telluride High girls soccer finished 4-9-1 and missed the Class 2A state playoffs after falling from 20th to 21st in the rankings. The Lady Miners lost 4-1 to Ridgway at home on Senior Night, then dropped a crucial 2-1 road game to Bayfield that sealed their fate.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_2f31b789-d089-42b7-9b6c-940afdff77e1.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/7d/e7d83b35-cab8-4f44-a707-1078ade52a57/69f9ac3ebf6ec.image.jpg",
    imgHiRes: true
  },
  {
    title: "Hard work and perseverance",
    source: "Telluride Times",
    date: "May 6, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "education",
    copy: "Darcy Bray graduated last weekend from Colorado Mountain College with her associate’s degree, an achievement she’s been working toward throughout the entirety of her time in high school. Her dedication, perseverance and hard work have truly paid off. Congratulations, Darcy!",
    claudeSummary: false,
    href: "https://www.telluridenews.com/norwood_post/article_f36f75c5-78e6-4fbc-9dd5-51535697d60e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/0/46/046406e1-b0ed-45f3-88a5-f87d2570e7d3/69fa5cd6c404f.image.jpg",
    imgHiRes: true
  },
  {
    title: "ADL reports a sharp drop in US antisemitic incidents in 2025, driven by a steep fall on campuses",
    source: "Telluride Times",
    date: "May 6, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "arts-culture",
    copy: "The ADL reported antisemitic incidents dropped 33% nationwide in 2025 to 6,274 cases, largely due to fewer campus incidents. However, physical assaults hit a record high of 203, and three people were killed in antisemitic attacks, including shootings in DC and a firebombing in Boulder.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_fd5eb38f-870a-5931-a281-fd46c98217ff.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/6/15/6151511f-d420-5af3-ba21-a347150d4cf9/69fb2ebbc7405.image.jpg",
    imgHiRes: true
  },
  {
    title: "Legals and Public Notices for May 7-13, 2026",
    source: "Telluride Times",
    date: "May 6, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "community",
    copy: "The Town of Mountain Village passed an ordinance on second reading updating their Community Development Code to comply with Colorado Wildfire Resilience Code requirements. San Miguel County has a planning meeting May 14th covering several land use applications and code amendments, including accelerated housing review and natural medicine regulations.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/legals/article_ed4e10c4-69c5-441c-82eb-a85c1c99999e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Indigenous people honor and raise awareness for relatives who are missing or have been killed",
    source: "Telluride Times",
    date: "May 6, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "community",
    copy: "Indigenous communities observed a day to honor missing and murdered relatives, with many wearing red to show support. Native Americans face violence at twice the rate of the general population, with nearly 1,500 active federal cases of missing Native Americans recorded by the FBI. Recent federal initiatives include expanded FBI operations and a new Interior Department task force, though implementation of earlier legislation has been slow.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_ae44c01b-f686-57b2-ae9f-0e1627a4f326.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/ee/4ee20253-fa90-5e52-b3d6-f0a5aa554c5d/69f96e150e3e0.image.jpg",
    imgHiRes: true
  },
  {
    title: "Keeping traditions alive",
    source: "Telluride Times",
    date: "May 6, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "community",
    copy: "Bill Wilson of Knight Canyon Outfitters in Norwood was named \"Outfitter of the Year\" by the Colorado Outfitters Association for his three generations of family business and dedication to ethical hunting. Wilson and other industry leaders say hunting faces growing threats from urban voters and state policies, warning that restrictions could devastate rural economies that depend on hunting revenue.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_f166c0dc-a754-43a1-9784-9facd4674405.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/43/c43e569f-37f2-4543-9cff-45bfa117cf81/69fa5f7853b7c.image.jpg",
    imgHiRes: true
  },
  {
    title: "Spring plans meet snow in Denver as a late storm could be the season's biggest",
    source: "Telluride Times",
    date: "May 6, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "recreation",
    copy: "Denver's facing what could be its biggest snowstorm of the season with up to 8 inches expected through Wednesday, following the city's driest winter on record. School districts canceled classes, utilities put crews on standby, and the Rockies postponed games as temperatures plunged overnight.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_df4d81e5-c1f0-558f-a1f4-290dae406595.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/8f/58f263e8-16a8-5781-af16-5d8758db5bc8/69fa387863ba5.image.jpg",
    imgHiRes: true
  },
  {
    title: "San Miguel County recognizes National Historic Marker Day",
    source: "Telluride Times",
    date: "May 5, 2026",
    firstSeen: "2026-05-12",
    newsTopic: "land-use",
    copy: "San Miguel County joined the national recognition of Historic Marker Day, highlighting the work of its Historical Commission to preserve local markers and plaques. The commission is developing a webpage to help residents and visitors learn about the county's historical markers and their significance.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_743225a7-9d03-4795-8409-086c3af9758b.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/40/84034eec-95c3-44a4-8fac-630f3a00bf4b/69fa7a16ce67a.image.jpg",
    imgHiRes: true
  },
  {
    title: "CHALKBOARD for the week of May 7-13",
    source: "Telluride Times",
    date: "May 5, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "government",
    copy: "The weekly birthday list includes Ashley LaUond on May 8th, followed by several other community members through May 13th. Regular town meetings continue with the Town Board meeting the second Wednesday at 7 p.m. and School Board on the third Wednesday at 6 p.m. The Farmers Market runs Thursdays 2-6 p.m. through mid-October, and various community services like the food pantry, senior meals, and pickleball continue their regular schedules.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/the_norwood_post/article_2ef5bd86-8794-4816-8ed3-fc76bbd27167.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/f/8b/f8b47ece-f18b-4c64-891d-3517aa2b0690/69fa6fb7bfb2a.image.png",
    imgHiRes: true
  },
  {
    title: "You're invited to the groundbreaking of the new Norwood School",
    source: "Telluride Times",
    date: "May 5, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "education",
    copy: "Norwood's holding a groundbreaking ceremony for their new school, funded by a $50+ million state BEST Grant and local bonds. The new campus will house pre-K through 12th grade on 19 acres where the old disc golf course was, replacing the current aging facilities.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/the_norwood_post/article_c205d989-d94a-4e50-bc98-dd81947a31bd.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/03/c0304c73-0b0c-48e4-a100-80e11b1b2499/69fa6eca08f58.image.jpg",
    imgHiRes: true
  },
  {
    title: "Town of Norwood awarded funding for Norwood Hill improvements",
    source: "Telluride Times",
    date: "May 5, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "community",
    copy: "Norwood secured $1.25 million in state and federal funding to improve safety on Norwood Hill, which has been a longtime concern due to steep grades, sharp curves, and accident history. The town won't have to contribute any local matching funds, and work could start before the 2029 timeline if ready.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/the_norwood_post/article_dad1ad7d-73e3-41de-b2b1-24757153a694.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/7c/57c98200-de4b-4962-86c7-46d1750abfdc/69fa6d93b89e4.image.jpg",
    imgHiRes: true
  },
  {
    title: "Appreciation for teachers, staff",
    source: "Telluride Times",
    date: "May 5, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "education",
    copy: "The Telluride R-1 School District Board of Education officially proclaimed May 4-8, 2026 as Teacher and Staff Appreciation Week. The board resolution encourages students, families and community members to express gratitude to teachers and staff for their commitment to student success.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/letters_to_editor/article_fb79e810-1118-4f69-a3d4-2cb921d8dd13.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Foster homes needed",
    source: "Telluride Times",
    date: "May 5, 2026",
    firstSeen: "2026-05-12",
    newsTopic: "community",
    copy: "Second Chance Humane Society is seeking foster families, especially with kitten season approaching. They need both long-term fosters for animals until adoption and short-term helpers for weekend stays or monthly breaks for shelter dogs.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news_release/article_1c4f5f8f-7308-4fbf-8799-2576d6ba9026.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/40/24040efb-65d5-4496-a2c3-fc2a74ff553d/69fa65f39ffe9.image.jpg",
    imgHiRes: true
  },
  {
    title: "Trump administration sues Denver over its 1989 assault weapons ban",
    source: "Telluride Times",
    date: "May 5, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "public-safety",
    copy: "The Trump administration is suing Denver over its 1989 assault weapons ban, claiming it violates Second Amendment rights. Denver's mayor and police chief rejected federal demands to drop the ban, with Mayor Mike Johnston saying \"hell no\" to rolling back the 37-year-old policy.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_91caa8b8-dec6-5691-807a-44fd78d5be2d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/5/fc/5fc8dcdd-595e-5e93-b187-5a76035d4985/69fa601618eb0.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride community survey open through May 21",
    source: "Telluride Times",
    date: "May 5, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "community",
    copy: "The town's community survey runs through May 21, measuring livability across 10 categories like economy, housing, safety, and recreation. Last year's results showed Telluride scored well on safety, trails, and recreation, but poorly on affordability - only 1% rated cost of living as good and just 9% said affordable housing was available.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_1145f14a-0b4a-43a7-9dea-4a452d941817.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/25/d257b794-9d6b-4123-b3b4-ee0abf3d9682/69fa52fb225f6.image.jpg",
    imgHiRes: true
  },
  {
    title: "Sacred shoes",
    source: "Telluride Times",
    date: "May 5, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "arts-culture",
    copy: "The article reflects on the evolution from minimalist \"barefoot\" running shoes to the current popularity of thick-soled Hoka shoes among trail runners. The author reminisces about various worn-out sneakers and boots, including patched-up running shoes and old basketball sneakers, eventually discarding them during spring cleaning. The piece ends with a memory of arriving in the area wearing cross-country ski boots and later buying Chuck Taylor All-Stars with money earned flipping eggs at a local restaurant.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_781f8bdc-69d7-4ec9-9b5a-90c35c968f18.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/a/bc/abc48601-95b9-4206-9f4b-a65102a0747c/69fa55d5a4936.image.jpg",
    imgHiRes: true
  },
  {
    title: "Boys’ lax blasts into postseason",
    source: "Telluride Times",
    date: "May 5, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "education",
    copy: "The Telluride boys lacrosse team crushed Durango 16-2 on Senior Day to clinch the Mountain League championship and earned the #6 seed in state playoffs. The girls team beat Durango 12-11 in a tight rematch after losing to them earlier in the week, with Parker Shea scoring five goals. Both teams advanced to state tournament play with games scheduled for early May.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/sports/article_10a16ae6-c102-4679-9922-ddab9bdfd4b2.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/fe/cfe83f7a-ec5a-4b87-824b-b7cf86e70644/69f9a893440e8.image.jpg",
    imgHiRes: true
  },
  {
    title: "Man to plead guilty in Colorado firebombing attack on pro-Israel demonstrators",
    source: "Telluride Times",
    date: "May 4, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "public-safety",
    copy: "An Egyptian national who threw Molotov cocktails at pro-Israel demonstrators in Boulder plans to change his plea to guilty on state charges. The attack killed an 82-year-old woman and injured a dozen others, with the suspect saying he planned it for a year. He still faces federal hate crime charges and prosecutors are considering the death penalty.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_931f4da9-96f2-578e-97a4-bdf03c024048.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/d/67/d67d68d6-eb78-53a3-bec2-e05a4c063c21/69f906e808dfd.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride CrossFit opens new Lawson Hill gym",
    source: "Telluride Times",
    date: "May 4, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "community",
    copy: "Telluride CrossFit opened their new Lawson Hill location in March after construction wrapped up ahead of schedule. The gym has 140+ members and offers 8-9 weekday classes plus Saturday sessions, with new additions including kids' classes and yoga starting in May.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/business/article_1d5aab25-10fb-4778-b2c1-3973af8a0d9e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/36/7362e16d-547c-4e31-a280-7e922c23bc57/69f9037527be2.image.jpg",
    imgHiRes: true
  },
  {
    title: "States across the wildfire-prone Western US are using AI for early detection",
    source: "Telluride Times",
    date: "May 4, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "public-safety",
    copy: "Western states are deploying AI-enabled cameras to detect wildfires earlier than 911 calls in remote areas. Arizona Public Service has nearly 40 cameras with plans for 71, while California operates over 1,200 through ALERTCalifornia. The technology costs around $50,000 per camera annually but gives firefighters a 45-minute head start on average.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_3d9717e8-6111-5f8d-b69b-3260bf6758a8.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/3c/c3c369ac-5496-5153-b4fc-3638934dc35a/69f899e7aa3db.image.jpg",
    imgHiRes: true
  },
  {
    title: "Safe actions in work zones can save lives",
    source: "Telluride Times",
    date: "May 4, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "community",
    copy: "The Transportation Commissioner for District 8 reflects on becoming more aware of road work dangers after taking the position. CDOT manages 200 construction projects annually, and work zone safety relies on drivers slowing down, avoiding phone use, and following flaggers' directions.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_0527f33c-d1be-4f91-9d6b-a570a138bf81.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/9/d1/9d1d4b74-6558-4cf1-9ef9-d0848f755a25/69f115f7721a2.image.jpg",
    imgHiRes: true
  },
  {
    title: "The heart of Telluride",
    source: "Telluride Times",
    date: "May 3, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "land-use",
    copy: "Local artist Brandon Bermel started the Heart of Telluride Project at the Transfer Warehouse, creating an outdoor street art installation that launched on Valentine's Day. Six artists contributed heart-themed pieces to wooden panels on the building's exterior, with community support from Ah Haa School and local businesses providing materials and workspace.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_917b2db3-f982-472d-9198-8dc744073d8e.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/c/fe/cfed5db9-e7f7-49f6-8189-3174c244d773/69f64afc5f9a1.image.jpg",
    imgHiRes: true
  },
  {
    title: "Rolling in the oats",
    source: "Telluride Times",
    date: "May 3, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "community",
    copy: "A social media influencer is promoting oats as a superfood ingredient, highlighting the ongoing debate between anti-grain advocates and those favoring Mediterranean-style diets with grains. The author reflects on surviving mostly on oatmeal during a broke summer in D.C. in 1978 and notes that while oats are nutritious, they can spike blood sugar without added protein.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_8c228500-61a7-4cf7-b21d-383052bad877.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/be/ebeb8396-3450-4d67-af94-c17626457ff1/69f13862191f6.image.jpg",
    imgHiRes: true
  },
  {
    title: "Jonathan Fouser is Telluride Mountain School’s new head of school",
    source: "Telluride Times",
    date: "May 3, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "education",
    copy: "Jonathan Fouser has been selected as Telluride Mountain School's new head of school after a competitive search that started with 42 candidates. Fouser currently oversees multiple campuses for Brewster American Schools in Spain and has experience founding international schools, teaching English, and outdoor instruction. The school board chose him for his calm leadership style and background in experiential education that aligns with the mountain school's mission.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_77d21881-a251-4576-a200-d746761986e3.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/8/67/86782a60-11e8-4c7e-8528-ed092884ae87/69f5ab43664e2.image.jpg",
    imgHiRes: true
  },
  {
    title: "Town council suspends waitlist policies",
    source: "Telluride Times",
    date: "May 2, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "housing",
    copy: "Town council temporarily suspended waitlist policies for deed-restricted rentals through July 31 to fill vacancies faster. The town has 39 empty units (18% vacancy rate) despite a 220-person waitlist, well above the 8% target. Staff blame outdated applications and affordability issues with pricier units.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_766aee5a-65e5-4d4e-af87-0d75148b5bba.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/be/4be5885b-5c31-47e0-a343-371f832e5f5f/69f64629dcef0.image.jpg",
    imgHiRes: true
  },
  {
    title: "Sibling stories",
    source: "Telluride Times",
    date: "May 2, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "community",
    copy: "A local bartender at the Vaudeville once worked with his baby strapped to his chest during a comedy show, prompting a customer to warn him that siblings inevitably hate each other. The experience motivated him and his partner to intentionally raise their two kids as best friends through equal treatment, room sharing, and encouraging shared activities. Their approach seems to have worked - the siblings chose to ride together throughout a recent family road trip to California.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/opinion/columnists/article_b13bebfd-ba8d-4e2a-8bbe-e534628b63ec.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/44/244939cc-69e1-4024-ae0f-a26ac2a38c3c/69f134d9097db.image.jpg",
    imgHiRes: true
  },
  {
    title: "Paul Wisor resigns as MV Town Manager",
    source: "Telluride Times",
    date: "May 1, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "arts-culture",
    copy: "Paul Wisor resigned as Mountain Village Town Manager after participating in an investigation related to the mayor's earlier resignation. His involvement came to light when he revealed he had helped former officials Prohaska and Fee with investor contacts for a ski resort purchase offer that sparked controversy and investigations by both Mountain Village and Telluride.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_2c1cc16d-5e4a-4543-86bd-1faadf9f7028.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/86/38610eb6-050c-4a1d-963e-dd31f000024c/69f4eedeb0d89.image.webp",
    imgHiRes: true
  },
  {
    title: "Trump gives go-ahead to major new Canada-US oil pipeline",
    source: "Telluride Times",
    date: "April 30, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "infrastructure",
    copy: "Trump approved a 650-mile oil pipeline from Saskatchewan to Montana that would carry two-thirds as much oil as the canceled Keystone XL project. The company behind it has a history of major spills, including 50,000 gallons into the Yellowstone River in 2015, but says it's developed better leak detection technology.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_93f080bd-3bff-5091-afc4-5a9ddae33488.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/c9/ec9912c8-b253-5755-acce-42c147636686/69f3c91b34529.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telski update to council: bike park’s future uncertain",
    source: "Telluride Times",
    date: "April 30, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "government",
    copy: "Telski's Swenson told council the bike park loses money, with busy days seeing only 350-400 riders compared to 6,000-7,000 skiers on good winter days. While no final decision has been made, he acknowledged \"loose discussions\" about permanently discontinuing the bike park after seven years of trying to make it work.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/article_8e8c2d7e-8aed-42dd-83b6-036f40b6fb54.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/e5/ee56772c-7de4-4126-8ef7-d8bc4dfd4025/69f3c904ec009.image.jpg",
    imgHiRes: true
  },
  {
    title: "Telluride’s ‘I voted/yo voté’ sticker contest winners",
    source: "Telluride Times",
    date: "April 30, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "government",
    copy: "Earlier this year, Telluride and Norwood students participated in a sticker contest, with 18 creative kiddos taking part. The brief, set by the San Miguel County Clerk’s Office, was to devise a design that could be used as the artwork…",
    claudeSummary: false,
    href: "https://www.telluridenews.com/news/article_3022309d-c7c1-4717-85d3-41ac89e3f795.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/7/9d/79d165ca-16ce-40fa-a9ac-77113d7839c8/69f1660ad0191.image.png",
    imgHiRes: true
  },
  {
    title: "Norwood’s ‘I voted/yo voté’ sticker contest winners",
    source: "Telluride Times",
    date: "April 30, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "government",
    copy: "The county clerk thanked everyone who entered Norwood's bilingual voting sticker design contest. All the artwork displayed at the courthouse drew lots of positive comments from visitors.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/norwood_post/article_c9e7d416-2ad4-4332-87ee-6317130f948d.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/2/16/2167c90d-35cd-419c-b2dc-fff803c1b0ba/69f1772f694c3.image.jpg",
    imgHiRes: true
  },
  {
    title: "Lindsey Vonn tells the AP she is not yet in position emotionally to decide if she will race again",
    source: "Telluride Times",
    date: "April 30, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "public-safety",
    copy: "Lindsey Vonn says she's not emotionally ready to decide whether she'll return to competitive skiing after her severe tibia fracture at Cortina in December. The 41-year-old is progressing from wheelchair to crutches and still needs another surgery, meaning any potential return wouldn't happen until the 2027-28 season at earliest.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_8e0ab335-1e12-5377-af15-ff97d158dede.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/3/c6/3c6899e9-4691-5fd5-be26-4d01403e1ebf/69f3542094bae.image.jpg",
    imgHiRes: true
  },
  {
    title: "Here's how to grow your own food with less water, even in a drought",
    source: "Telluride Times",
    date: "April 30, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "infrastructure",
    copy: "Record-low snowfall across the West has prompted the earliest drought restrictions in Denver Water's history, with cities implementing outdoor watering limits. Gardening experts recommend water-wise growing techniques like harvesting rainwater, collecting greywater from showers and dishwashing, choosing drought-tolerant plant varieties, improving soil health with compost, and using shade cloths to reduce evaporation.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/state/article_62ad4304-c441-5377-acde-86dcbdde9312.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/d2/ed2b9a2e-dea0-5f0d-9b8e-8a1e2e924534/69f3541bd0685.image.jpg",
    imgHiRes: true
  },
  {
    title: "Wishing upon a star",
    source: "Telluride Times",
    date: "April 30, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "community",
    copy: "The SAF Young People's Theater is putting on \"My Son Pinocchio Jr.\" with 30 kids in grades 3-5, featuring the Disney classic with new songs by the \"Wicked\" composer. The show focuses on Geppetto's journey as a father learning to love unconditionally, running about an hour at the Sheridan Opera House May 1-3.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/arts_and_entertainment/article_b3673668-79a5-462d-87a1-05b24411b059.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/4/cd/4cda66af-af53-48e3-b1b9-8d3dd0c94f9c/69f319f8c70cf.image.jpg",
    imgHiRes: true
  },
  {
    title: "Michael J. Ward",
    source: "Telluride Times",
    date: "April 30, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "community",
    copy: "Michael J. Ward, who came to Telluride on a ski trip in 1973 and never left, passed away after spending his final years in Hawaii. He worked as a bartender at the Sheridan, tried carpentry, then became a realtor for over 40 years while raising four kids here. A celebration of life will be held at Town Park on June 6, 2026 from 4-6 PM.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/obituaries/article_da9c1d39-f9b9-4485-8624-6ec4a163e609.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/assets/v3/editorial/e/5f/e5fb35c1-ab7f-4d7a-9f66-70713f0980da/69f387ba057ba.image.jpg",
    imgHiRes: true
  },
  {
    title: "Legals and Public Notices for April 30-May 6, 2026",
    source: "Telluride Times",
    date: "April 30, 2026",
    firstSeen: "2026-05-07",
    newsTopic: "infrastructure",
    copy: "The County Board of Health will consider wastewater treatment regulations on May 20th, while the County Commissioners will review a tree removal application for High Meadow Ranch on Wilson Mesa and a lot line vacation request for Fall Creek Subdivision lots.",
    claudeSummary: true,
    href: "https://www.telluridenews.com/news/legals/article_3718afea-4523-4a88-a728-754e3336d2f8.html",
    img: "https://bloximages.chicago2.vip.townnews.com/telluridenews.com/content/tncms/custom/image/2313c0ad-ec4f-49ac-a039-903e08c87a91.jpg",
    imgHiRes: true
  },
  {
    title: "Galloping Goose Refines Shoulder Season Schedule to Improve Reliability",
    source: "Town of Telluride",
    date: "April 24, 2026",
    newsTopic: "infrastructure",
    copy: "(April 5, 2026) – The Town will implement an updated schedule for the Galloping Goose bus loop during shoulder seasons, transitioning to a single-bus service operating on a 30-minute loop.",
    href: "https://www.telluride.gov/CivicAlerts.aspx?aid=389",
    img: "https://www.telluride.gov/ImageRepository/Document?documentID=15514"
  },
  {
    title: "Certified Candidates Announced for Telluride Town Council Election",
    source: "Town of Telluride",
    date: "April 21, 2026",
    newsTopic: "government",
    copy: "(April 21, 2026) – The Town of Telluride will hold a Special Municipal Election on Tuesday, June 30, coordinated with San Miguel County for the Primary Election. The Clerk's Department has certified three candidates eligible to run for elected office.",
    href: "https://www.telluride.gov/CivicAlerts.aspx?aid=390",
    img: "https://www.telluride.gov/ImageRepository/Document?documentID=15528"
  },
  {
    title: "Egnar Enters Stage 1 Fire Restrictions",
    source: "San Miguel County",
    date: "May 12, 2026",
    newsTopic: "public-safety",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1395",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14159"
  },
  {
    title: "Western Slope Wellness Launches Free Regional Mental Health Resource for Western Slope Communities",
    source: "San Miguel County",
    date: "May 12, 2026",
    newsTopic: "health",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1394",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14249"
  },
  {
    title: "County Planning Commission 5/14 Meeting in TELLURIDE",
    source: "San Miguel County",
    date: "May 1, 2026",
    newsTopic: "land-use",
    copy: "",
    href: "https://www.sanmiguelcountyco.gov/CivicAlerts.aspx?aid=1393",
    img: "https://www.sanmiguelcountyco.gov/ImageRepository/Document?documentID=14225"
  },
  {
    title: "Assessor's Physical Office Closed Friday May 15th",
    source: "San Miguel County",
    date: "May 12, 2026",
    newsTopic: "community",
    copy: "The Assessor's physical office will be closed on Friday, May 15, due to limited staffing. Staff will be available by phone or email.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=524",
    img: ""
  },
  {
    title: "Stage 1 Fire Restrictions in effect for Egnar Fire Protection District until further notice",
    source: "San Miguel County",
    date: "May 12, 2026",
    newsTopic: "public-safety",
    copy: "Stage One fire Restrictions will be in place in the Egnar Fire Protection District until further notice.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=525",
    img: ""
  },
  {
    title: "Last Dollar Pass is now open",
    source: "San Miguel County",
    date: "May 11, 2026",
    newsTopic: "community",
    copy: "Last Dollar Pass is now open",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=523",
    img: ""
  },
  {
    title: "New Motor Vehicle Office Availability in Egnar! May 13 at 9 am - 3 pm",
    source: "San Miguel County",
    date: "May 5, 2026",
    newsTopic: "land-use",
    copy: "The new Motor Vehicle office will be available in Egnar on May 13 from 9 am - 3 pm in the same building as the fire department (5634 County Rd H1). We hope to serve many community members in this area, eliminating the drive to Norwood or Telluride.",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=516",
    img: ""
  },
  {
    title: "New Wildfire Information Site Launched",
    source: "San Miguel County",
    date: "May 1, 2026",
    newsTopic: "public-safety",
    copy: "San Miguel County announces the launch of a new wildfire information site, Living with Wildfire. The site is a resource for preparation, mitigation, evacuation and recovery information. More material will be added soon!",
    href: "https://www.sanmiguelcountyco.gov/AlertCenter.aspx?AID=522",
    img: ""
  },
  {
    title: "Spring Off-Season Schedule",
    source: "Town of Telluride",
    date: "April 24, 2026",
    newsTopic: "community",
    copy: "Spring Off-Season Schedule in effect April 6 – May 22, 2026. Service frequency reduced. Check individual route schedules below.",
    href: "https://www.telluride.gov/AlertCenter.aspx?AID=64",
    img: ""
  }
];

// ══════════ KOTO COMMUNITY RADIO — RECENT NEWSCASTS ══════════
// Updated: 2026-04-01  — refresh periodically from koto.org/news-category/newscasts/
const KOTO_NEWSCASTS = [
  {
    title: "Newscast 5-11-26",
    source: "KOTO Community Radio",
    date: "May 12, 2026",
    newsTopic: "community",
    copy: "Valley Floor Day Instills Stewardship in a Changing Climate -General Assembly Enters Final Days",
    href: "https://koto.org/news/newscast-5-11-26/"
  },
  {
    title: "Newscast 5-8-26",
    source: "KOTO Community Radio",
    date: "May 9, 2026",
    newsTopic: "land-use",
    copy: "On this week’s Regional Roundup, we look at how communities across the region are grappling with immigration enforcement. In Durango, Colorado, the District Attorney has filed charges against a federal immigration officer over an alleged assault on a protester outside an U.S. Immigration and Customs Enforcement facility in October 2025. In Glenwood",
    href: "https://koto.org/news/newscast-5-8-26/"
  },
  {
    title: "Newscast 5-7-26",
    source: "KOTO Community Radio",
    date: "May 8, 2026",
    newsTopic: "public-safety",
    copy: "The Bears Are Back in Town; Federal Firefighting in the Region Sees Shift; The Wonder, Intimacy, and Hope of “Appalachia”",
    href: "https://koto.org/news/newscast-5-7-26/"
  },
  {
    title: "Newscast 5-6-26",
    source: "KOTO Community Radio",
    date: "May 7, 2026",
    newsTopic: "public-safety",
    copy: "Mountain Village Addresses Wildfire with Forest Management; Cat Movie Fisher with Risho Unda; Telluride Yoga Festival Brings Longevity and Service",
    href: "https://koto.org/news/newscast-5-6-26/"
  },
  {
    title: "Newscast 5-4-26",
    source: "KOTO Community Radio",
    date: "May 5, 2026",
    newsTopic: "recreation",
    copy: "Paul Wisor Steps Down as Mountain Village Town Manager; General Assembly Enters Its Final Days",
    href: "https://koto.org/news/newscast-5-4-26/"
  },
  {
    title: "Newscast 5-1-26",
    source: "KOTO Community Radio",
    date: "May 2, 2026",
    newsTopic: "land-use",
    copy: "The city of Durango has proclaimed April 19, 2026 as Ross Anderson Day, marking twenty years since the Native American speed skier set a U.S. speed-skiing record of 154.06 miles per hour. We’ll also hear from a researcher working in Bears Ears who is turning to crowdfunding to continue his work after losing a federal grant. Then, we head to Utah, w",
    href: "https://koto.org/news/newscast-5-1-26/"
  },
  {
    title: "Newscast 4-30-26",
    source: "KOTO Community Radio",
    date: "May 1, 2026",
    newsTopic: "community",
    copy: "Local Governments Plan for Disaster; West End Roundup with the San Miguel Basin Forum; Cat Movie Fisher with Risho Unda",
    href: "https://koto.org/news/newscast-4-30-26/"
  },
  {
    title: "Newscast 4-29-26",
    source: "KOTO Community Radio",
    date: "April 30, 2026",
    newsTopic: "land-use",
    copy: "The State of Crime in Telluride; Town Council Pauses Housing Waitlist Policy; Building with Cob",
    href: "https://koto.org/news/newscast-4-29-26/"
  }
];

// ══════════ KOTO COMMUNITY RADIO — FEATURED STORIES ══════════
// Updated: 2026-04-01  — refresh periodically from koto.org/news-category/featured-stories/
const KOTO_FEATURED_STORIES = [
  {
    title: "Valley Floor Day Instills Stewardship in a Changing Climate",
    source: "KOTO Community Radio",
    date: "May 12, 2026",
    newsTopic: "education",
    copy: "More than 100 elementary students explored local flora and fauna during Valley Floor Education Day, learning about beavers, owls and ecosystem health through hands-on science.",
    href: "https://koto.org/news/valley-floor-education-day-telluride-students-wetlands-wildlife-science/"
  }
];

// ══════════════════════════════════════
// ── Community Events Data ─────────────
// ══════════════════════════════════════

// ══════════════════════════════════════
// ── Livable Telluride Blog Posts ─────
// ══════════════════════════════════════
const BLOG_POSTS = [
  {
    title: 'From "Let the People Decide" to "Livable Telluride"',
    url: 'https://livabletelluride.org/from-let-the-people-decide-to-livable-telluride',
    date: 'Feb 23, 2026',
    readTime: '3 min',
    image: '/images/blog/let-the-people-decide.jpg',
    summary: 'The story behind our rebrand — why the mission evolved from a single ballot question to a broader effort to keep Telluride livable for the people who actually live here.',
    category: 'Town of Telluride'
  },
  {
    title: 'As the Society Turns (the Survey Episode)',
    url: 'https://livabletelluride.org/societyturnpud',
    date: 'Oct 14, 2025',
    readTime: '2 min',
    image: '/images/blog/society-turn-survey.png',
    summary: '106 residents weighed in on Society Turn — 83% knew about the hospital, but nearly 80% had no idea how much else is planned for that site.',
    category: 'County Issues'
  },
  {
    title: 'As the Society Turns (the PUD Episode)',
    url: 'https://livabletelluride.org/as-the-society-turns-the-pud-episode',
    date: 'Oct 11, 2025',
    readTime: '5 min',
    image: '/images/blog/society-turn-pud.png',
    summary: 'A deep dive into the Society Turn PUD that even its loudest critics admit is bigger than anyone realized — and why that matters for the valley\'s future.',
    category: 'County Issues'
  },
  {
    title: 'Saturday Shot of Finance: If VooDoo Were a Private Development, Would It Already Be Bankrupt?',
    url: 'https://livabletelluride.org/saturday-shot-of-finance-if-voodoo-were-a-private-development-would-it-already-be-bankrupt',
    date: 'Oct 11, 2025',
    readTime: '4 min',
    image: '/images/blog/voodoo-finance.png',
    summary: 'A family stuck in "affordable housing" with soaring rent asks the question no one at Town Hall wants to answer — do these numbers actually work?',
    category: 'Town of Telluride'
  },
  {
    title: 'Why is Rent So Damn High In Telluride!',
    url: 'https://livabletelluride.org/why-is-rent-so-damn-high-in-telluride',
    date: 'Sep 15, 2025',
    readTime: '5 min',
    image: '/images/blog/rent-so-damn-high.png',
    summary: 'Sweet Rants lit up with locals doing the math on new housing projects — and the per-unit costs will make your jaw drop.',
    category: 'Town of Telluride'
  },
  {
    title: 'From $36 Million to $103 Million: How Telluride Became Richer Than a Lottery Winner',
    url: 'https://livabletelluride.org/from-36-million-to-103-million-how-telluride-became-richer-than-a-lottery-winner',
    date: 'Sep 13, 2025',
    readTime: '3 min',
    image: '/images/blog/36-to-103-million.png',
    summary: 'A 930% budget increase in ten years — this breakdown of where all that money went (and keeps going) is essential reading for any Telluride taxpayer.',
    category: 'Town of Telluride'
  },
  {
    title: "Canyonlands Development: A Closer Look at Telluride's Financing",
    url: 'https://livabletelluride.org/canyonlands-development-a-closer-look-at-telluride-s-financing',
    date: 'Jul 28, 2025',
    readTime: '4 min',
    image: '/images/blog/canyonlands.png',
    summary: 'The $26.5M Canyonlands project by Clark\'s uses a creative 30-year lease structure that every resident should understand before the bonds come due.',
    category: 'Town of Telluride'
  },
  {
    title: 'Empowering Telluride: The Future of Lot L Development',
    url: 'https://livabletelluride.org/empowering-telluride-the-future-of-lot-l-development',
    date: 'Jul 27, 2025',
    readTime: '2 min',
    image: '/images/blog/lot-l.png',
    summary: 'A massive parking garage on Lot L could permanently change downtown Telluride\'s character — here\'s why community input matters now, not later.',
    category: 'Town of Telluride'
  },
  {
    title: 'The Sunnyside Project',
    url: 'https://livabletelluride.org/the-sunnyside-project',
    date: 'Jul 27, 2025',
    readTime: '2 min',
    image: '/images/blog/sunnyside.png',
    summary: 'Completed before costs spiraled, Sunnyside shows how pre-pandemic housing financing worked — and why today\'s projects can\'t replicate it.',
    category: 'Town of Telluride'
  },
  {
    title: 'The VooDoo Project',
    url: 'https://livabletelluride.org/the-voodoo-project',
    date: 'Jul 27, 2025',
    readTime: '2 min',
    image: '/images/blog/voodoo-project.png',
    summary: 'The VooDoo\'s $27.4M price tag for 27 units launched at exactly the wrong time — a cautionary tale of what happens when interest rates hit 7%.',
    category: 'Town of Telluride'
  },
  {
    title: 'The Chair 7 Development Controversy',
    url: 'https://livabletelluride.org/the-chair-7-development-controversy',
    date: 'Jul 25, 2025',
    readTime: '3 min',
    image: '/images/blog/chair-7.png',
    summary: 'A hotel and commercial development on open space near the ski area is the most contentious proposal in years — here\'s what the PUD amendment actually allows.',
    category: 'Town of Telluride'
  },
  {
    title: 'The Gondola Station',
    url: 'https://livabletelluride.org/the-gondola-station',
    date: 'Jul 2, 2025',
    readTime: '1 min',
    image: '/images/blog/gondola-station.png',
    summary: 'Three design concepts for a new gondola station could reshape downtown — but without a charter amendment, voters won\'t get a say.',
    category: 'Town of Telluride'
  }
];

const COMMUNITY_EVENTS = [
  {
    title: "2nd Annual Telluride Rotary Hikeathon",
    source: "Telluride Rotary Club",
    date: "May 31, 2026",
    endDate: "June 28, 2026",
    location: "Oak Street Gondola Plaza, Telluride",
    eventTimes: "11:00 AM kickoff",
    copy: "Registration opens April 20 for the 2nd Annual Telluride Rotary Hikeathon. Four weeks of hiking from May 31 through June 28, with a kickoff at 11am on May 31 at the Oak Street gondola plaza. Hike from anywhere and raise funds for the Telluride Rotary Foundation — supporting scholarships, Youth Exchange, international projects, and community grants. 60% of nonprofit team funds go directly back to their nonprofit. Sponsored by Alpine Bank and Jagged Edge Mountain Gear.",
    href: "https://www.facebook.com/telluriderotary/",
    notable: true,
    beneficiary: "Telluride Rotary Foundation — scholarships, Youth Exchange & community grants",
    sponsors: "Alpine Bank, Jagged Edge Mountain Gear",
    clubInfo: {
      name: "Telluride Rotary Club",
      meetings: "1st & 3rd Wednesdays, 6:00 PM (social at 5:30)",
      location1: "1st Wed — Mountain Lodge, 457 Mountain Village Blvd",
      location2: "3rd Wed — Announced Telluride location",
      president: "Kate Wadley",
      email: "telluriderotary@gmail.com",
      website: "https://portal.clubrunner.ca/3291",
      note: "No meetings in April. In-person & online options available."
    }
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

// ── Bot-managed event arrays (populated every 6h by content-refresh.js) ──
const KOTO_COMMUNITY_EVENTS = [
  {
    title: "Pilates for All Bodies with Laura",
    link: "https://koto.org/event/pilates-for-all-bodies-with-laura-2/2026-05-14/",
    description: "Join Laura Colbert for Pilates for All Bodies every Thursday from 12:30-1:15pm. This program is free and open to the public. All bodies and experience levels are welcome. The library has a few mats, but bring your own if you can.",
    pubDate: "2026-05-14T12:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Mountain Village annual Community Clean Up Days",
    link: "https://koto.org/event/mountain-village-annual-community-clean-up-days/2026-05-14/",
    description: "Mountain Village hosts its annual Community Clean Up Day, this year expanding to two days in two different parts of the community! On Wednesday, May 13, Clean Up Day will take place in Village Court Apartments and on Thursday, May 14, a second Clean Up Day will take place in the Meadows Neighborhood. The entire community is invited to participate in either or both of these events. Schedule for each day: Volunteer Registration: Begins at 2:30 p.m. Clean Up: 3 p.m.-5 p.m. – Clean Up in assigned area Gift Card Raffle: bring your trash back to have your name entered into a raffle for $50 Village Market gift cards at 5:15 p.m.",
    pubDate: "2026-05-14T14:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "The Creative Exchange at Telluride Arts HQ",
    link: "https://koto.org/event/the-creative-exchange-at-telluride-arts-hq-2/2026-05-14/",
    description: "The Creative Exchange is a brand-new monthly series by Telluride Arts designed for the artists and creatives who call Telluride home. It’s a space where emerging and established artists gather to share the knowledge, skills, and stories that fuel their work. Think of it as an open source model for creativity—where we learn from each other, swap ideas, and help strengthen one another’s practice. Each session is hosted by local artists and creative leaders who bring their own perspectives, techniques, and creative journeys into the room. Topics may span everything from the business of art and professional development, to creative process, storytelling, collaboration, and the philosophical underpinnings of making art. Whether you’re a full-time working artist, an educator, a student, a maker, or simply someone curious about creative expression, the Creative Exchange is open to you. …",
    pubDate: "2026-05-14T17:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Arts HQ, TELLURIDE",
    imageUrl: "https://koto.org/wp-content/uploads/2025/12/Screenshot-2025-12-17-at-4.42.32-PM.png"
  },
  {
    title: "Booze & Books at Uno, Dos, Tres Tacos",
    link: "https://koto.org/event/booze-books-at-uno-dos-tres-tacos-2/",
    description: "Sip on a libation while chatting with other bibliophiles about books you have read recently. It's totally open ended and open to everyone! 5:15 the second Thursday of every month. The library will get some apps for the table; you purchase your own beverage. Please sign up in advance. On Thursday, May 14th, we will meet at 123 Tacos at 123 S. Oak St. The rest of our summer season will be at Liz at 200 W. Colorado Ave. in Telluride. (Entrance is on Fir St.)",
    pubDate: "2026-05-14T17:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Uno, Dos, Tres Tacos, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/new-Booze-and-Books-poster-2.png"
  },
  {
    title: "Down Valley Community Potluck",
    link: "https://koto.org/event/down-valley-community-potluck/",
    description: "The Down Valley community Spring Potluck is Thursday, May 14th, from 6-8 p.m. at the historic Placerville Schoolhouse. Bring something tasty to share and bring your own table service and beverages.",
    pubDate: "2026-05-14T18:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: ""
  },
  {
    title: "West End Stories & Poems",
    link: "https://koto.org/event/west-end-stories-poems/",
    description: "Come join the West-Enders and share a story or poem or song about the drought. 6 pm Thursday May 14th at the Naturita Community Library. Free and open to all.",
    pubDate: "2026-05-14T18:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Naturita Community Library",
    imageUrl: ""
  },
  {
    title: "Up-off Gymnastics, Dance, and Spanish",
    link: "https://koto.org/event/up-off-gymnastics-dance-and-spanish/2026-05-15/",
    description: "We are a MOBILE family business offering non-competitive Gymnastics, Preschool Spanish, & Dance classes to the San Miguel County area. Tia Uphoff was a competitive gymnast and an instructor for 20+ years, helping children develop balance, flexibility, strength and proper tumbling techniques while using positive reinforcement and encouragement for success. Infant to Age 5 — Padres & Pequenos Class – $10.00 per class This class invites adults & kids to participate in Educational songs, in English & Spanish, with intro to gymnastics. Sign up at any time and get started weekly. Fridays — 11:15-11:40 am @ Lone Cone Library Norwood K to 3rd Grade week Session 8 Week Winter Session $150 for the 8 sessions. Thursdays – 430-530 pm @ Lone Cone Library Norwood For more information and to register: Contact Tia @ liv2danz247@gmail.com or find us on Facebook!",
    pubDate: "2026-05-15T10:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Lone Cone Library Norwood",
    imageUrl: "https://koto.org/wp-content/uploads/2025/06/Messenger_creation_3FA37E27-C0AC-4E9D-ABF5-592710E68D81.jpeg"
  },
  {
    title: "San Miguel County Spring Clean Up",
    link: "https://koto.org/event/san-miguel-county-spring-clean-up/2026-05-15/",
    description: "It's that time of year again! Join in for San Miguel County's annual Spring Clean Up Events May 15th in Telluride and Mountain Village and May 16th in Telluride and Norwood. Visit ecoactionpartners.org/spring-cleanup-events for more details or call EcoAction at 970-728-1340.",
    pubDate: "2026-05-15T10:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/SMC-Spring-Clean-up-poster-Final.png"
  },
  {
    title: "Outdoor Gear Drive",
    link: "https://koto.org/event/outdoor-gear-drive/2026-05-15/",
    description: "Get that unused gear out of your garage and to someone who will happily use it! Telluride Mountain Club is collecting lightly used outdoor gear, including skis, camping gear, bikes, and clothing at Carhenge Parking lot between 10 AM and 2 PM on Friday & Saturday, May 15th & 16th. Gear will be re-distributed at the Community Fiesta.",
    pubDate: "2026-05-15T10:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Carhenge Parking Lot, TELLURIDE",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/Gear-Drive-poster-2026.jpg"
  },
  {
    title: "Talking Gourds Pop-Up Poetry",
    link: "https://koto.org/event/talking-gourds-pop-up-poetry/",
    description: "Poet/performer and poetry activist Lawton Eddy, who runs the very successful Season of Words series “Poetry Live at A Church” in Salida, will be in Telluride as off-season is ending to share new work and poems from her book Chasing Grace (2021) at a Talking Gourd’s Pop-Up-Poetry series for locals beginning at 1 pm on Friday, May 15 th , at the Wilkinson Public Library magazine room. Free and open to all. Bring a poem or story to share. The prompt is Chasing Grace.",
    pubDate: "2026-05-15T13:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Clown Sex Ed (Telluride Theatre FRINGE Project)",
    link: "https://koto.org/event/clown-sex-ed-telluride-theatre-fringe-project/2026-05-15/",
    description: "Clown Sex Ed is a hilarious romp through the challenges, failures and horror stories of American sex education. Tara Demmy and Zachary Chiero poke fun at your gym teacher, your health class and your parents' awkward talk and examine not only what they said but more importantly what they left out. Produced by Durango-based Oddball Theatre Company, this off-the-walls comedy \"makes the uncomfortable uproariously funny\" (Broad Street Review). A limited number of Pay-What-You-Can tickets are available per performance. — About Telluride Theatre FRINGE Projects: First launched in 1947, the Edinburgh Fringe Festival provided independent artists a platform to share their work, ranging from new musicals, small immersive performances, and everything in-between. In the spirit of the Fringe, Telluride Theatre is launching a new year-round program: The FRINGE Project. Applications are open to local artists with performance proposals for small-to-medium sized productions of ALL styles.",
    pubDate: "2026-05-15T19:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "The BOB at the Palm Theatre, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/clown-sex-ed-hero-image.png"
  },
  {
    title: "Bridal veil Trail Clean-up",
    link: "https://koto.org/event/bridal-veil-trail-clean-up/",
    description: "Patagonia and Sheep Mountain Alliance will host a Bridal Veil Trail Clean-Up in celebration of Colorado Public Lands Day! Trail clean up starts at 8 am, there will be coffee from the Pour Over Pedaler. Please bring water, sturdy hiking shoes, and a hat!",
    pubDate: "2026-05-16T08:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/Bridalveil-Cleanup-Poster-1.png"
  },
  {
    title: "Bilingual Balance in Motion",
    link: "https://koto.org/event/bilingual-balance-in-motion/2026-05-16/",
    description: "Move, breathe, and energize in this dynamic bilingual class, led by Lauren Norton, designed to uplift your body and mind! Blending the strength and flow of Pilates, the rhythm and energy of dance, and the grounding presence of yoga and breathwork, this session will leave you feeling strong, balanced, and revitalized. Open to all levels, this fun and fast-paced class welcomes everyone looking to build strength, flexibility, and mindfulness in a supportive community space. This class is free, but donations for the instructor are welcome.",
    pubDate: "2026-05-16T10:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/BALANCE.jpg"
  },
  {
    title: "San Miguel County Spring Clean Up",
    link: "https://koto.org/event/san-miguel-county-spring-clean-up/2026-05-16/",
    description: "It's that time of year again! Join in for San Miguel County's annual Spring Clean Up Events May 15th in Telluride and Mountain Village and May 16th in Telluride and Norwood. Visit ecoactionpartners.org/spring-cleanup-events for more details or call EcoAction at 970-728-1340.",
    pubDate: "2026-05-16T10:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/SMC-Spring-Clean-up-poster-Final.png"
  },
  {
    title: "Outdoor Gear Drive",
    link: "https://koto.org/event/outdoor-gear-drive/2026-05-16/",
    description: "Get that unused gear out of your garage and to someone who will happily use it! Telluride Mountain Club is collecting lightly used outdoor gear, including skis, camping gear, bikes, and clothing at Carhenge Parking lot between 10 AM and 2 PM on Friday & Saturday, May 15th & 16th. Gear will be re-distributed at the Community Fiesta.",
    pubDate: "2026-05-16T10:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Carhenge Parking Lot, TELLURIDE",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/Gear-Drive-poster-2026.jpg"
  },
  {
    title: "Clown Sex Ed (Telluride Theatre FRINGE Project)",
    link: "https://koto.org/event/clown-sex-ed-telluride-theatre-fringe-project/2026-05-16/",
    description: "Clown Sex Ed is a hilarious romp through the challenges, failures and horror stories of American sex education. Tara Demmy and Zachary Chiero poke fun at your gym teacher, your health class and your parents' awkward talk and examine not only what they said but more importantly what they left out. Produced by Durango-based Oddball Theatre Company, this off-the-walls comedy \"makes the uncomfortable uproariously funny\" (Broad Street Review). A limited number of Pay-What-You-Can tickets are available per performance. — About Telluride Theatre FRINGE Projects: First launched in 1947, the Edinburgh Fringe Festival provided independent artists a platform to share their work, ranging from new musicals, small immersive performances, and everything in-between. In the spirit of the Fringe, Telluride Theatre is launching a new year-round program: The FRINGE Project. Applications are open to local artists with performance proposals for small-to-medium sized productions of ALL styles.",
    pubDate: "2026-05-16T19:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "The BOB at the Palm Theatre, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/clown-sex-ed-hero-image.png"
  },
  {
    title: "Gentle Yoga with Kristin Milord",
    link: "https://koto.org/event/gentle-yoga-with-kristin-milord-2/2026-05-17/",
    description: "Breathe, stretch, and reset with gentle yoga taught by Kristen Milord, Sundays from 11:00 am to 12:00 pm. This free, accessible class is open to all levels—no prior experience needed. Feel free to bring your own mat, or the library also has mats, bolsters, blocks and blankets available to use. This class is free, but donations to support the instructor are welcome.",
    pubDate: "2026-05-17T11:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/gentle-yoga-kristen-1.png"
  },
  {
    title: "Drop In Tech Time with Oliver",
    link: "https://koto.org/event/drop-in-tech-time-with-oliver-2/2026-05-17/",
    description: "Drop by the 2nd floor desk for Tech Time with Oliver every Sunday from 1-3pm. Bring your questions about technology (phones, tablets, laptops, email, etc.) or learn about special collections the library offers, such as the Kindles, iPads, and laptops our patrons can check out as well as the library apps you can download to your devices to access free ebooks, audiobooks, movies, music, magazines and more!",
    pubDate: "2026-05-17T13:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Tea and Tarot",
    link: "https://koto.org/event/tea-and-tarot/2026-05-17/",
    description: "Tea and Tarot Sessions with Jade Rose and others from Sanctuary Collective in the Telluride Room. Seating is limited; please sign up at telluridelibrary.org in advance.",
    pubDate: "2026-05-17T14:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2025/04/tea-1.jpg"
  },
  {
    title: "Savvy Seniors- Open Tech",
    link: "https://koto.org/event/savvy-seniors-open-tech-2/",
    description: "Join us every Monday for \"Savvy Seniors,\" an exciting and interactive class designed for senior citizens who are curious about the world around them! This unique program goes beyond basic tech lessons to explore a wide range of engaging topics, including science, technology, environmental awareness, art, and music.",
    pubDate: "2026-05-18T08:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/May26-2-1.png"
  },
  {
    title: "Book Buzz w/The Pour Over Pedaler",
    link: "https://koto.org/event/book-buzz-w-the-pour-over-pedaler/",
    description: "Come enjoy learning about the hottest new titles in the library and enjoy a free coffee from Luke, The Pour Over Pedaler.",
    pubDate: "2026-05-18T09:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/book-buzz-5.png"
  },
  {
    title: "Money Reset",
    link: "https://koto.org/event/money-reset/",
    description: "Get your budget back on track! Join us for Money Reset, a financial literacy class, with the Telluride Foundation, ANB Bank and Alpine Bank. This class is free and open to the public. Food will be provided. Zoom option will be available. Register in advance if possible.",
    pubDate: "2026-05-18T12:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/Financial-Literacy-Class-11-x-17-in.png"
  },
  {
    title: "Money Reset: Getting Your Budget on Track – A Free Financial Literacy Class",
    link: "https://koto.org/event/money-reset-getting-your-budget-on-track-a-free-financial-literacy-class/2026-05-18/1/",
    description: "The Telluride Foundation is partnering with four local banks, the Wilkinson Library, and Collaborative Action for Immigrants (CAFI) to offer a free financial literacy class, in both English and Spanish, on Monday, May 18. The English workshop will be held from noon to 1:30 p.m. in the Program Room at the Wilkinson Public Library, with lunch provided, and is also available via Zoom. For those attending the afternoon session via Zoom, participants located in the Norwood/Nucla/Naturita area can go to Citizens State Bank, Naturita branch, where they will be live-streaming the event and providing light food and drink. The Spanish workshop runs from 5:30 to 7:00 p.m. in the Library's Program Room, with light food and childcare provided. Classes are free and open to the public, and registration for all classes (Zoom, Citizens State Bank, or in-person) is requested: https://forms.gle/CjepTJxqoCfGwdt17",
    pubDate: "2026-05-18T12:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/Financial-Literacy-Class_EnglichAndSpanish_FINAL-scaled.jpg"
  },
  {
    title: "Savvy Seniors- Open Tech",
    link: "https://koto.org/event/savvy-seniors-open-tech-2/",
    description: "Join us every Monday for \"Savvy Seniors,\" an exciting and interactive class designed for senior citizens who are curious about the world around them! This unique program goes beyond basic tech lessons to explore a wide range of engaging topics, including science, technology, environmental awareness, art, and music.",
    pubDate: "2026-05-18T13:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/May26-2-1.png"
  },
  {
    title: "Money Reset: Getting Your Budget on Track – A Free Financial Literacy Class",
    link: "https://koto.org/event/money-reset-getting-your-budget-on-track-a-free-financial-literacy-class/2026-05-18/2/",
    description: "The Telluride Foundation is partnering with four local banks, the Wilkinson Library, and Collaborative Action for Immigrants (CAFI) to offer a free financial literacy class, in both English and Spanish, on Monday, May 18. The English workshop will be held from noon to 1:30 p.m. in the Program Room at the Wilkinson Public Library, with lunch provided, and is also available via Zoom. For those attending the afternoon session via Zoom, participants located in the Norwood/Nucla/Naturita area can go to Citizens State Bank, Naturita branch, where they will be live-streaming the event and providing light food and drink. The Spanish workshop runs from 5:30 to 7:00 p.m. in the Library's Program Room, with light food and childcare provided. Classes are free and open to the public, and registration for all classes (Zoom, Citizens State Bank, or in-person) is requested: https://forms.gle/CjepTJxqoCfGwdt17",
    pubDate: "2026-05-18T17:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/Financial-Literacy-Class_EnglichAndSpanish_FINAL-scaled.jpg"
  },
  {
    title: "The Listening Club: The Cure's Disintegration w/ Sam Burgess",
    link: "https://koto.org/event/the-listening-club-the-cures-disintegration-w-sam-burgess/",
    description: "Take some time to listen to the month's featured album. Then, join The Listening Club the fourth Monday of each month for a deep discussion of the album lead by your album guide for the evening. Your knowledgeable guide will bring you cultural, historical, and musical context that will surprise and delight you, as well as bring you a greater understanding of the music you are hearing. It's like a book club, but for albums! Come join the fun at Telluride Music Company and get into a raffle for a vinyl copy of the month's featured album and enjoy some FREE pizza with the discussion. Bring your own beverage. (Signing up here in advance helps us know how much pizza to order!)",
    pubDate: "2026-05-18T18:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/The-Listening-Club-2.png"
  },
  {
    title: "Online Author Talk with Nir Eyal",
    link: "https://koto.org/event/online-author-talk-with-nir-eyal/",
    description: "What if the only thing standing between you and the seemingly impossible…was belief? This is the question posed by bestselling author Nir Eyal in his new work, Beyond Belief. Most of your limits aren’t physical. They’re psychological. In Beyond Belief, Nir Eyal reveals how the hidden assumptions you carry shape what you see, how you feel, and what you do—and how to replace them with beliefs that unlock your true potential.",
    pubDate: "2026-05-19T12:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/nir.png"
  },
  {
    title: "Talking Gourds Presents Stories and Poems",
    link: "https://koto.org/event/talking-gourds-presents-stories-and-poems/2026-05-19/",
    description: "The Telluride Institute’s Talking Gourds Poetry Program is hosting a live Stories & Poems series at the Wilkinson Public Library magazine room on the third Tuesday of every month at 5:30 pm. Following the featured poet's or story teller's reading we will hold a Talking Gourds sharing circle going around the room to let everyone speak. Attendees are encouraged to bring their own work or someone else’s that they like to share. For more information, visit the Telluride Institute Talking Gourds website: tellurideinstitute.org/talking-gourds",
    pubDate: "2026-05-19T17:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Spanish Happy Hour",
    link: "https://koto.org/event/spanish-happy-hour-2/",
    description: "Practice your Spanish skills with other Spanish speakers at La Cocina. The Library will provide appetizers, and the bar will be available for you to purchase a beverage of your choice. Registration is not required, but it helps us have an idea of how many people will be in attendance, and therefore how much food to order. All levels welcome!",
    pubDate: "2026-05-19T17:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "La Cocina de Luz, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/abril-2.png"
  },
  {
    title: "\"Rooted\" , A short film showcase and panel on Indigenous land access in Southwest Colorado/Cortometrajes y un panel sobre el acceso a tierra Indigenas en el suroeste de Colorado.",
    link: "https://koto.org/event/rooted-a-short-film-showcase-and-panel-on-indigenous-land-access-in-southwest-colorado-cortometrajes-y-un-panel-sobre-el-acceso-a-tierra-indigenas-en-el-suroeste-de-colorado/2026-05-20/1/",
    description: "Please join us at Patagonia Telluride in collaboration with Trees, Water, and People and the Montezuma Land Conservancy for a film screening of \"Rooted\" and a panel discussion on Indigenous land access, water rights, climate change and current issues affecting Indigenous Peoples of the Southwest.",
    pubDate: "2026-05-20T08:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Patagonia Telluride, TELLURIDE",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/Rooted_PosterTelluride-2-1-1-1-scaled.jpg"
  },
  {
    title: "Beans and Books at Coffee Cowboy",
    link: "https://koto.org/event/beans-and-books-at-coffee-cowboy/",
    description: "What better way to start out your day than by sipping on a hot cup of coffee while chatting with other bibliophiles about books? It's a chance to talk about whatever you have been reading (or listening to) and hear about what other folks have been reading (or listening to). Drop in anytime at the beautiful Coffee Cowboy General Store on the corner of Pacific and Willow the third Wednesday of every month!",
    pubDate: "2026-05-20T08:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Coffee Cowboy General Store, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/beans-books-5.png"
  },
  {
    title: "Mahjongg for Independent Players",
    link: "https://koto.org/event/mahjongg-for-independent-players-2/",
    description: "Looking to enjoy an afternoon of friendly games of mah-jongg for independent players? Join us at the Library every Wednesday from 1-3pm. Bring your 2026 card if you have one, although we have plenty of loaners if you don’t! We’ll have tables, cloths, chairs, and sets. NOTE: This is not a mah-jongg lesson. A general knowledge of the game is necessary to join. Please register in advance if you'd like to join so we can make sure we have enough tables set up for everyone!",
    pubDate: "2026-05-20T13:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/mahjong-6.png"
  },
  {
    title: "Plant Party Kick off!",
    link: "https://koto.org/event/plant-party-kick-off/",
    description: "Kick off our new Plant Party series with inspiration from For The Love of House Plants! This first gathering celebrates all things green-whether you're nurturing your first pathos or managing a full indoor jungle. We'll explore simple care tips, share plant stories, and connect with fellow plant enthusiasts in a relaxed welcoming space. Come ready to learn, swap ideas, and grow your love of houseplants. The first 10 people to sign up will receive a free copy of the book! Don't worry, you do not need the book to participate we will have plenty of information and fun for everyone. We also have a fun, free plant craft for the first meeting!",
    pubDate: "2026-05-20T17:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/plant-party-9.png"
  },
  {
    title: "\"Rooted\" , A short film showcase and panel on Indigenous land access in Southwest Colorado/Cortometrajes y un panel sobre el acceso a tierra Indigenas en el suroeste de Colorado.",
    link: "https://koto.org/event/rooted-a-short-film-showcase-and-panel-on-indigenous-land-access-in-southwest-colorado-cortometrajes-y-un-panel-sobre-el-acceso-a-tierra-indigenas-en-el-suroeste-de-colorado/2026-05-20/2/",
    description: "Please join us at Patagonia Telluride in collaboration with Trees, Water, and People and the Montezuma Land Conservancy for a film screening of \"Rooted\" and a panel discussion on Indigenous land access, water rights, climate change and current issues affecting Indigenous Peoples of the Southwest.",
    pubDate: "2026-05-20T17:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Patagonia Telluride, TELLURIDE",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/Rooted_PosterTelluride-2-1-1-1-scaled.jpg"
  },
  {
    title: "Telluride Rotary Club Meeting",
    link: "https://koto.org/event/telluride-rotary-club-meeting-3/",
    description: "Telluride Rotary Club meets Wednesday, May 20, at 6 p.m. at the Wilkinson Public Library in Telluride. Meetings feature guest speakers and discussion of club projects. Anyone with an interest in networking and service is welcome to drop in as a guest. Email telluriderotary@gmail.com for info or to rsvp.",
    pubDate: "2026-05-20T18:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/Telluride-Rotary-Logo-White-1.png"
  },
  {
    title: "Mountainfilm Festival",
    link: "https://koto.org/event/mountainfilm-festival/",
    description: "Using the power of film, art and ideas, Mountainfilm inspires audiences to create a better world. Held every Memorial Day weekend, the Mountainfilm festival brings together a community of filmmakers and change makers, showcasing documentary films that celebrate adventure, activism, social justice, environment and indomitable spirit.",
    pubDate: "2026-05-21T00:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/Ocean-Symp-Garth-Andy3-2-scaled.jpg"
  },
  {
    title: "Town Read:  The River's Daughter by Bridget Crocker",
    link: "https://koto.org/event/town-read-the-rivers-daughter-by-bridget-crocker/",
    description: "The Town Read, selected by the library, in conjunction with Mountainfilm is The River's Daughter by Bridget Crocker. She will be at the library for a talk and signing. Books available at the event and at the bookstore.",
    pubDate: "2026-05-21T08:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/Screenshot-2026-05-08-111935.png"
  },
  {
    title: "Pilates for All Bodies with Laura",
    link: "https://koto.org/event/pilates-for-all-bodies-with-laura-2/2026-05-21/",
    description: "Join Laura Colbert for Pilates for All Bodies every Thursday from 12:30-1:15pm. This program is free and open to the public. All bodies and experience levels are welcome. The library has a few mats, but bring your own if you can.",
    pubDate: "2026-05-21T12:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: ""
  },
  {
    title: "Cancer Support Group",
    link: "https://koto.org/event/cancer-support-group-2/",
    description: "Join us for a supportive and compassionate space at our Cancer Support Group held every 3rd Thursday of the month from 5:00 PM to 6:00 PM. This group is designed for individuals currently experiencing cancer and for those who are in remission, offering a safe and welcoming environment for sharing personal stories, experiences, and encouragement. Whether you're navigating your cancer journey or reflecting on the road to recovery, this group provides emotional support and the opportunity to connect with others who understand your unique challenges. Come and find strength in the community, share your experiences, and know you're not alone in your journey.",
    pubDate: "2026-05-21T17:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/04/Cancer-Support-Group.png"
  },
  {
    title: "Salon Night at Telluride Arts HQ",
    link: "https://koto.org/event/salon-night-at-telluride-arts-hq/2026-05-21/",
    description: "Salon Nights are inspired by the legendary Parisian salons—those lively gatherings where artists, thinkers, and dreamers came together to meet up, debate, collaborate, and inspire. We’re bringing that spirit into the present and rooting it here in Telluride. These are evenings for conversation and connection, not lectures or formal programming. They are casual, open, and intentionally unstructured, designed to create the atmosphere where ideas can collide, new friendships form, and creativity sparks. Imagine an evening where musicians talk with writers, painters meet photographers, filmmakers share stories with ceramicists—and the unexpected happens!",
    pubDate: "2026-05-21T17:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Telluride Arts HQ, TELLURIDE",
    imageUrl: "https://koto.org/wp-content/uploads/2025/12/Screenshot-2025-12-17-at-4.37.19-PM.png"
  },
  {
    title: "Town Read:  The River's Daughter by Bridget Crocker",
    link: "https://koto.org/event/town-read-the-rivers-daughter-by-bridget-crocker/",
    description: "The Town Read, selected by the library, in conjunction with Mountainfilm is The River's Daughter by Bridget Crocker. She will be at the library for a talk and signing. Books available at the event and at the bookstore.",
    pubDate: "2026-05-21T17:30:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Wilkinson Public Library, Telluride",
    imageUrl: "https://koto.org/wp-content/uploads/2026/05/Screenshot-2026-05-08-111935.png"
  },
  {
    title: "Up-off Gymnastics, Dance, and Spanish",
    link: "https://koto.org/event/up-off-gymnastics-dance-and-spanish/2026-05-22/",
    description: "We are a MOBILE family business offering non-competitive Gymnastics, Preschool Spanish, & Dance classes to the San Miguel County area. Tia Uphoff was a competitive gymnast and an instructor for 20+ years, helping children develop balance, flexibility, strength and proper tumbling techniques while using positive reinforcement and encouragement for success. Infant to Age 5 — Padres & Pequenos Class – $10.00 per class This class invites adults & kids to participate in Educational songs, in English & Spanish, with intro to gymnastics. Sign up at any time and get started weekly. Fridays — 11:15-11:40 am @ Lone Cone Library Norwood K to 3rd Grade week Session 8 Week Winter Session $150 for the 8 sessions. Thursdays – 430-530 pm @ Lone Cone Library Norwood For more information and to register: Contact Tia @ liv2danz247@gmail.com or find us on Facebook!",
    pubDate: "2026-05-22T10:00:00.000Z",
    source: "koto",
    sourceLabel: "KOTO",
    category: "Community Event",
    location: "Lone Cone Library Norwood",
    imageUrl: "https://koto.org/wp-content/uploads/2025/06/Messenger_creation_3FA37E27-C0AC-4E9D-ABF5-592710E68D81.jpeg"
  }
];
const WILKINSON_EVENTS = [
  {
    title: "Lite Lunch- Wait For Me",
    link: "https://telluridelibrary.libcal.com/event/15497297?hs=a",
    description: "12:00 PM – 1:00 PM · Join us for a little Lite Lunch and a discussion of Wait for Me by Amy Jo Burns. Space is limited, sign up in advance. Contact tosborne@telluridelibrary.org for a copy of the book. Young folk singer Elle Harlow reaches the height of her prowess in 1973, with two wildly beloved albums to her name and a hidden history of impossible heartbreak. When she sets foot on the famed Grand Ole Opry stage, a far cry from the mountain that raised her, Elle gives the biggest performance of her life. Then, to the dismay of shocked fans, her producer, and the man who still loves her, she vanishes. Almost two decades later, eighteen-year-old Marijohn Shaw is spending her summer pumping gas, writing songs on her broken mandolin, and longing for a mother. …",
    pubDate: "2026-05-13T12:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Telluride Room",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_04_20_13_23_21.png"
  },
  {
    title: "Radio Biblioteca",
    link: "https://telluridelibrary.libcal.com/event/16824971?hs=a",
    description: "12:00 PM – 1:00 PM · Escucha a KOTO Miercoles por Medio y conoce las noticias y eventos que tendremos en nuestra comunidad &bull; Tune in to Koto 91.7 FM every other Wednesday and learn about the news and events we will have in our community",
    pubDate: "2026-05-13T12:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "KOTO Radio Station",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_05_01_13_13_59.jpeg"
  },
  {
    title: "Movie and A Snack Club",
    link: "https://telluridelibrary.libcal.com/event/16575196?hs=a",
    description: "3:30 PM – 5:30 PM",
    pubDate: "2026-05-13T15:30:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Program Room",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_04_29_11_55_43.png"
  },
  {
    title: "Sewing 101 with Melissa",
    link: "https://telluridelibrary.libcal.com/event/15970617?hs=a",
    description: "5:00 PM – 7:00 PM · Don&#39;t throw away your old clothes just because they have a tiny (or even a large) hole in them! Learn the basics of sewing and mending your clothing with our very own talented seamstress, Melissa Sumpter! Bring your own garment, we&#39;ll provide the sewing materials.",
    pubDate: "2026-05-13T17:00:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Meeting Room #6 - large",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/data/feat_img/6460/19928/1717100108.jpg"
  },
  {
    title: "Wildfire Preparedness/Preparación para Incendios Forestales",
    link: "https://telluridelibrary.libcal.com/event/16625525?hs=a",
    description: "5:30 PM – 7:00 PM · Join San Miguel County and the Western Region Wildfire Council  and Telluride Fire Protection District for a presentation on how to prepare for a wildfire and what to do if one arrives. There will also be information about mitigation resources for property owners.  There will be simultaneous Spanish interpretation available.  Habr&aacute; interpretaci&oacute;n en espa&ntilde;ol. &Uacute;nase al Condado de San Miguel, al Distrito de Protecci&oacute;n contra Incendios de Telluride y al Consejo de Incendios Forestales de la Regi&oacute;n Oeste para una presentaci&oacute;n sobre c&oacute;mo prepararse para un incendio forestal y qu&eacute; hacer si ocurre. Tambi&eacute;n habr&aacute; informaci&oacute;n sobre recursos de mitigaci&oacute;n para propietarios de viviendas. Can&#39;t make this presentation?  We will host the same presentation at 1:30 pm on June 1st. (English only presentation)",
    pubDate: "2026-05-13T17:30:00.000Z",
    source: "wilkinson",
    sourceLabel: "Wilkinson Public Library",
    category: "Library Event",
    location: "Lower Terrace - outdoors",
    imageUrl: "https://d68g328n4ug0e.cloudfront.net/misc/6460/events/19928/2026_03_30_14_39_36.jpg"
  }
];
const HUMANE_SOCIETY_ANIMALS = [
  {
    id: "TEL-A-180",
    name: "Billie",
    species: "Dog",
    breed: "Cattle Dog, Australian (Red Heeler) / Shepherd",
    ageGroup: "Young Puppy",
    sex: "Female",
    photo: "https://new-s3.shelterluv.com/profile-pictures/3d526ad221efcb4f9ce95210e44907f3/97514f84518ad9f760c1921e4e97f094.jpg",
    profileUrl: "https://www.shelterluv.com/embed/animal/213648662",
    summary: "Young Puppy • Cattle Dog, Australian (Red Heeler) / Shepherd • Female"
  },
  {
    id: "TEL-A-181",
    name: "Annie",
    species: "Dog",
    breed: "Collie, Border / Pyrenees, Great",
    ageGroup: "Young Dog",
    sex: "Female",
    photo: "https://new-s3.shelterluv.com/profile-pictures/25b7a402804152231031867f03d44d27/ee52e26ad06de37c29ae074ce78437cc.jpg",
    profileUrl: "https://www.shelterluv.com/embed/animal/213678848",
    summary: "Young Dog • Collie, Border / Pyrenees, Great • Female"
  }
];

// ── Telluride Foundation events ──
// telluridefoundation.org/tf-events/ is a hand-maintained WordPress page (no
// public API, hand-laid WPBakery markup with no stable repeating template).
// Maintained as a hardcoded list. To refresh: visit /tf-events/, copy each
// upcoming event's title/date/time/location/description/Register URL, and
// update the array below. Set source: 'tf' so ENTITY_LOGOS picks up the
// Telluride Foundation logo on the card.
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
    imageUrl: ""
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
    imageUrl: ""
  }
];


// ── Local Group Recurring Meetings ──
// Generates upcoming meeting dates from recurring schedules so they appear on the Meetings tab
function submitClubForm(e) {
  e.preventDefault();
  var form = document.getElementById('addClubForm');
  var data = new FormData(form);
  var subject = encodeURIComponent('New Club Submission: ' + data.get('clubName'));
  var body = 'Club Name: ' + data.get('clubName') +
    '\nWebsite: ' + (data.get('clubUrl') || 'N/A') +
    '\nContact: ' + data.get('contactName') +
    '\nContact Info: ' + data.get('contactInfo') +
    '\nMeeting Schedule: ' + (data.get('meetingSchedule') || 'N/A') +
    '\nDescription: ' + (data.get('clubDescription') || 'N/A');
  window.open('mailto:morgancsmith99@gmail.com?subject=' + subject + '&body=' + encodeURIComponent(body));
  form.style.display = 'none';
  document.getElementById('addClubSuccess').style.display = 'block';
}

function generateLocalGroupMeetings() {
  const meetings = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 60);

  LOCAL_GROUP_SCHEDULES.forEach(function(sched) {
    // Generate for current month and next 2 months
    for (var mo = 0; mo < 3; mo++) {
      var year = today.getFullYear();
      var month = today.getMonth() + mo;
      if (month > 11) { month -= 12; year++; }
      // Skip if this month is in skipMonths
      if (sched.skipMonths && sched.skipMonths.indexOf(month + 1) !== -1) continue;

      sched.rule.forEach(function(nth, idx) {
        var d = nthWeekday(year, month, sched.dayOfWeek, nth);
        if (!d || d < today || d > horizon) return;
        var loc = sched.locations.length > 1 ? sched.locations[idx] || sched.locations[0] : sched.locations[0];
        meetings.push({
          title: sched.title,
          link: sched.href,
          description: sched.note || '',
          eventDate: d,
          eventDates: '',
          eventTimes: sched.time,
          location: loc,
          source: 'localgroup',
          sourceLabel: sched.name,
          category: 'Local Group Meeting',
          canceled: false,
          hasAgenda: false,
          imageUrl: sched.logo || null
        });
      });
    }
  });
  return meetings;
}

// Helper: get the nth occurrence of a weekday in a given month
// nth = 1 for 1st, 2 for 2nd, etc. dayOfWeek: 0=Sun,1=Mon,...6=Sat
function nthWeekday(year, month, dayOfWeek, nth) {
  var first = new Date(year, month, 1);
  var firstDow = first.getDay();
  var offset = (dayOfWeek - firstDow + 7) % 7;
  var day = 1 + offset + (nth - 1) * 7;
  var result = new Date(year, month, day);
  if (result.getMonth() !== month) return null; // overflowed
  return result;
}

// ── Local News tab: filter out state-wide and national stories ──
// The TT and KOTO RSS feeds carry both local and state-level/national
// stories. The Local News tab is meant to be hyperlocal, so this helper
// filters out items that are clearly Colorado-state-wide or national in
// nature.
//
// Decision order:
//   1. URL path tags ("/news/state/", "/news/nation/", etc.) — strong
//      explicit signal from the publisher. Filter immediately.
//   2. Title contains a local geographic marker → KEEP.
//   3. Title contains a non-local marker → FILTER.
//   4. Default → KEEP. Better to show some non-local than hide local.
//
// We deliberately do NOT scan article summaries — they often contain
// incidental mentions of "California", "statewide", etc. as comparison
// data, which produces false positives on genuinely local stories.
function isStatewideOrNationalNews(item) {
  const title = (item.title || '').toLowerCase();
  const href = (item.link || item.href || '').toLowerCase();
  if (!title.trim()) return false;

  // 1. Publisher URL path — strongest signal. TT explicitly tags
  //    syndicated state/national/world content under these paths.
  if (/\/news\/(state|nation|national|world|international)\//.test(href)) return true;

  // 2. Local geographic markers — keep if any match the title.
  const localPatterns = [
    /\btelluride\b/, /\bmountain village\b/, /\bmtn village\b/,
    /\bnorwood\b/, /\bophir\b/, /\bplacerville\b/, /\bridgway\b/,
    /\brico\b/, /\bsan miguel\b/, /\bsheridan opera\b/, /\bwilkinson\b/,
    /\btown park\b/, /\bkoto\b/, /\bmountainfilm\b/,
    /\bbluegrass festival\b/, /\blone cone\b/, /\blawson hill\b/,
    /\baldasoro\b/, /\bgondola\b/, /\bbear creek\b/, /\btrout lake\b/,
    /\blizard head\b/, /\bsunshine peak\b/, /\bhighway 145\b/,
    /\bhwy 145\b/, /\bwright's mesa\b/, /\bpalm theatre\b/,
    /\btransfer warehouse\b/, /\bah haa\b/, /\btellski\b/,
    /\btelluride ski\b/, /\bpinhead\b/, /\begnar\b/,
    /\bsociety turn\b/, /\btri-county\b/, /\btri county\b/,
    /\bdown valley\b/, /\bwest end\b/
  ];
  for (const r of localPatterns) {
    if (r.test(title)) return false;
  }

  // 3. Non-local markers — filter if title matches.
  const nonLocalPatterns = [
    // Other Colorado cities
    /\bdenver\b/, /\bboulder\b/, /\bcolorado springs\b/, /\baurora\b/,
    /\bfort collins\b/, /\bpueblo\b/, /\bgrand junction\b/,
    /\bdurango\b/, /\baspen\b/, /\bvail\b/,
    // Colorado state-level phrasing
    /colorado (state|lawmaker|legislat|supreme|attorney|governor|department|residents|demonstrators|man|woman|boy|girl|teen|firebomb|plan)/,
    /\bin colorado\b/, /\bacross colorado\b/, /\bcolorado-wide\b/,
    /\bstatewide\b/,
    // Federal / national institutions
    /\bcongress(ional)?\b/, /\bu\.s\. senate\b/, /\bu\.s\. house\b/,
    /\bfederal court\b/, /\bsupreme court\b/, /\bscotus\b/,
    /\bwhite house\b/, /\bpresident (biden|trump|harris|obama)\b/,
    /\bpentagon\b/, /\bnasa\b/, /\bfbi\b/, /\bcia\b/,
    /\bdepartment of justice\b/, /\bcapitol hill\b/,
    // National political figures (when they appear in title alone)
    /\btrump\b/, /\bbiden\b/, /\bharris\b/, /\bvance\b/,
    /\blindsey vonn\b/,
    // Other states / national framing
    /\bcalifornia\b/, /\btexas\b/, /\bflorida\b/, /\bnew york\b/,
    /\barizona\b/, /\bnew mexico\b/, /\butah\b/, /\bwyoming\b/,
    /\bnebraska\b/, /\bkansas\b/, /\bphiladelphia\b/, /\bchicago\b/,
    /\bnationwide\b/, /\bacross the country\b/, /\bunited states\b/,
    /\bacross america\b/, /\bnation's\b/, /\btariffs?\b/, /\boverseas\b/,
    /\beach state\b/, /\bacross the (west|western)\b/,
    /\bcanada-us\b/, /\bantisemit/, /\bthe ap\b/,
    // International
    /\bisrael(i|is)?\b/, /\bpalestin/, /\bgaza\b/, /\bukraine\b/,
    /\brussia\b/, /\bchina\b/, /\btaiwan\b/, /\biran\b/, /\bnorth korea\b/
  ];
  for (const r of nonLocalPatterns) {
    if (r.test(title)) return true;
  }

  return false; // default: KEEP
}

function collectLocalNewsArticles() {
  // Gather all news articles from LAND_USE_ISSUES, GONDOLA_DATA, TELLURIDE_TIMES_ARTICLES, KOTO_NEWSCASTS, and KOTO_FEATURED_STORIES
  const articles = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 14);
  cutoffDate.setHours(0, 0, 0, 0);

  // Land Use issues news
  if (typeof LAND_USE_ISSUES !== 'undefined') {
    Object.values(LAND_USE_ISSUES).forEach(issue => {
      if (issue.news && Array.isArray(issue.news)) {
        issue.news.forEach(a => {
          if (!a.href && !a.title) return;
          let sourceKey = 'other';
          if (/telluride news|telluridenews/i.test(a.source || a.href || '')) sourceKey = 'ttimes';
          else if (/koto/i.test(a.source || a.href || '')) sourceKey = 'koto';
          const pubDate = a.date && a.date !== 'Ongoing' ? new Date(a.date) : null;
          if (!pubDate || pubDate < cutoffDate) return;
          articles.push({
            title: a.title,
            link: a.href,
            summary: a.copy || '',
            source: a.source || '',
            sourceKey: sourceKey,
            newsTopic: 'land-use',
            date: a.date,
            pubDate: pubDate,
            topic: issue.label || '',
            imageUrl: a.img || a.imageUrl || issue.heroImage || ''
          });
        });
      }
    });
  }

  // Gondola data news
  if (typeof GONDOLA_DATA !== 'undefined' && GONDOLA_DATA.news) {
    GONDOLA_DATA.news.forEach(a => {
      if (!a.href && !a.title) return;
      let sourceKey = 'other';
      if (/telluride news|telluridenews/i.test(a.source || a.href || '')) sourceKey = 'ttimes';
      else if (/koto/i.test(a.source || a.href || '')) sourceKey = 'koto';
      const pubDate = a.date && a.date !== 'Ongoing' ? new Date(a.date) : null;
      if (!pubDate || pubDate < cutoffDate) return;
      articles.push({
        title: a.title,
        link: a.href,
        summary: a.copy || '',
        source: a.source || '',
        sourceKey: sourceKey,
        newsTopic: 'land-use',
        date: a.date,
        pubDate: pubDate,
        topic: 'Gondola 3A',
        imageUrl: a.img || a.imageUrl || GONDOLA_DATA.heroImage || ''
      });
    });
  }

  // Telluride Times homepage stories
  if (typeof TELLURIDE_TIMES_ARTICLES !== 'undefined') {
    TELLURIDE_TIMES_ARTICLES.forEach(a => {
      if (!a.href && !a.title) return;
      // Skip legal-notice roundup articles ("Legals and Public Notices for ...")
      // — already covered by the dedicated Legal Notices tab.
      if (/^Legals?\b.*Notices?\b/i.test(a.title || '')) return;
      const pubDate = a.date ? new Date(a.date) : null;
      if (!pubDate || pubDate < cutoffDate) return;
      articles.push({
        title: a.title,
        link: a.href,
        summary: a.copy || '',
        source: a.source || 'Telluride Times',
        sourceKey: 'ttimes',
        newsTopic: a.newsTopic || 'community',
        date: a.date,
        pubDate: pubDate,
        topic: '',
        imageUrl: a.img || ''
      });
    });
  }

  // KOTO Community Radio newscasts
  if (typeof KOTO_NEWSCASTS !== 'undefined') {
    KOTO_NEWSCASTS.forEach(a => {
      if (!a.href && !a.title) return;
      const pubDate = a.date ? new Date(a.date) : null;
      if (!pubDate || pubDate < cutoffDate) return;
      articles.push({
        title: a.title,
        link: a.href,
        summary: a.copy || '',
        source: a.source || 'KOTO Community Radio',
        sourceKey: 'koto',
        newsTopic: a.newsTopic || 'community',
        date: a.date,
        pubDate: pubDate,
        topic: '',
        imageUrl: a.img || ''
      });
    });
  }

  // KOTO Community Radio featured stories
  if (typeof KOTO_FEATURED_STORIES !== 'undefined') {
    KOTO_FEATURED_STORIES.forEach(a => {
      if (!a.href && !a.title) return;
      const pubDate = a.date ? new Date(a.date) : null;
      if (!pubDate || pubDate < cutoffDate) return;
      articles.push({
        title: a.title,
        link: a.href,
        summary: a.copy || '',
        source: a.source || 'KOTO Community Radio',
        sourceKey: 'koto',
        newsTopic: a.newsTopic || 'community',
        date: a.date,
        pubDate: pubDate,
        topic: '',
        imageUrl: a.img || ''
      });
    });
  }


  // Filter out state-wide / national stories, then deduplicate by title.
  const seen = new Set();
  return articles.filter(a => {
    if (isStatewideOrNationalNews(a)) return false;
    const key = (a.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderLocalNews(unused, filter) {
  const container = document.getElementById('local-news-content');
  if (!container) return;

  // If "Legal Notices" filter is active, render legal notices into this container
  if (filter === 'legal-notices') {
    renderLegalNoticesIntoContainer(container);
    return;
  }

  let articles = collectLocalNewsArticles();

  // Apply topic-based filter
  if (filter && filter !== 'all') {
    articles = articles.filter(a => a.newsTopic === filter);
  }

  // Sort by date descending (most recent first), undated at end
  articles.sort((a, b) => {
    if (!a.pubDate && !b.pubDate) return 0;
    if (!a.pubDate) return 1;
    if (!b.pubDate) return -1;
    return b.pubDate - a.pubDate;
  });

  if (articles.length === 0) {
    container.innerHTML = '<div class="empty-state">No local news matching this topic from the past two weeks. Check back soon or visit <a href="https://www.telluridenews.com" target="_blank" rel="noopener" style="color:var(--forest);font-weight:600;">Telluride Times</a> and <a href="https://koto.org" target="_blank" rel="noopener" style="color:var(--forest);font-weight:600;">KOTO</a> directly for the latest.</div>';
    return;
  }

  let html = '';
  articles.forEach(item => {
    const isClub = item.sourceKey === 'clubs';
    const logoHtml = isClub
      ? '<div class="card-logo">' + (ENTITY_LOGOS['clubs'] || '') + '</div>'
      : renderLogo(item.sourceKey);
    const topicBadge = item.topic
      ? '<span style="display:inline-block; font-size:0.72rem; padding:2px 8px; background:rgba(33,68,60,0.08); color:var(--forest); border-radius:6px; font-weight:600; margin-left:6px;">' + item.topic + '</span>'
      : '';

    // Article image on right side — same pattern as Wilkinson Library cards (skip for club posts unless they have clubInfo)
    let imageHtml = '';
    if (item.clubInfo) {
      const ci = item.clubInfo;
      imageHtml = '<div class="club-info-box">'
        + '<div class="club-info-header">' + (ci.name || 'Club Info') + '</div>'
        + '<div class="club-info-row"><span class="club-info-label">Meets:</span> ' + (ci.meetings || '') + '</div>'
        + '<div class="club-info-row"><span class="club-info-label"></span> ' + (ci.location1 || '') + '</div>'
        + '<div class="club-info-row"><span class="club-info-label"></span> ' + (ci.location2 || '') + '</div>'
        + '<div class="club-info-row"><span class="club-info-label">President:</span> ' + (ci.president || '') + '</div>'
        + '<div class="club-info-row"><span class="club-info-label">Email:</span> <a href="mailto:' + (ci.email || '') + '" style="color:var(--forest);">' + (ci.email || '') + '</a></div>'
        + (ci.note ? '<div style="font-size:0.72rem; color:var(--text-muted); font-style:italic; margin-top:2px;">' + ci.note + '</div>' : '')
        + '<a href="' + (ci.website || '#') + '" target="_blank" rel="noopener" class="club-info-link">Click for more club info</a>'
        + '</div>';
    } else if (!isClub && item.imageUrl) {
      imageHtml = '<div class="event-illustration event-photo" aria-hidden="true"><img src="' + item.imageUrl + '" alt="' + (item.title || '') + '" loading="lazy"></div>';
    }

    const linkLabel = isClub ? 'Read full post →' : 'Read full article →';

    const clubClass = item.clubInfo ? ' card-has-club' : '';
    // Add news topic badge for filtered display
    const newsTopicLabel = item.newsTopic ? {
      'government': 'Government', 'business': 'Business', 'public-safety': 'Public Safety',
      'community': 'Community', 'arts-culture': 'Arts & Culture', 'sports': 'Sports', 'land-use': 'Land Use'
    }[item.newsTopic] || '' : '';
    const newsTopicBadge = newsTopicLabel
      ? '<span style="display:inline-block; font-size:0.68rem; padding:2px 8px; background:rgba(166,143,87,0.15); color:var(--accent); border-radius:6px; font-weight:600; margin-left:6px;">' + newsTopicLabel + '</span>'
      : '';
    const logoInner = ENTITY_LOGOS[item.sourceKey] || '';
    if (item.clubInfo) {
      // Club card: keep original grid layout with club-info-box on the right
      html += '<div class="card' + clubClass + '" data-source-key="' + (item.sourceKey || '') + '">';
      html += '<div class="card-body">';
      html += '<div class="event-card-main news-card-img-left has-club-info">';
      html += imageHtml;
      html += '<div class="event-card-content">';
      html += '<div class="meta" style="margin-bottom:2px;">' + (item.source || '') + (item.date ? ' · ' + item.date : '') + topicBadge + newsTopicBadge + '</div>';
      html += '<h3>' + (item.link ? '<a href="' + item.link + '" target="_blank" rel="noopener">' + (item.title || 'Untitled') + '</a>' : (item.title || 'Untitled')) + '</h3>';
      if (item.summary) { html += '<div class="description">' + item.summary + '</div>'; }
      if (item.link) { html += '<div style="margin-top:8px;"><a href="' + item.link + '" target="_blank" rel="noopener" style="font-size:0.8rem; color:var(--forest); font-weight:600; text-decoration:none;">' + linkLabel + '</a></div>'; }
      html += '</div>'; // close event-card-content
      html += '</div>'; // close event-card-main
      html += '</div>'; // close card-body
      html += '</div>'; // close card
    } else {
      // News article: logo + image stacked in left col, text in right col
      html += '<div class="card news-article-card" data-source-key="' + (item.sourceKey || '') + '">';
      html += '<div class="news-media-col' + (!item.imageUrl ? ' no-image' : '') + '">';
      if (logoInner) { html += '<div class="news-source-logo">' + logoInner + '</div>'; }
      if (item.imageUrl) { html += imageHtml; }
      html += '</div>'; // close news-media-col
      html += '<div class="card-body">';
      html += '<div class="event-card-content">';
      html += '<div class="meta" style="margin-bottom:2px;">' + (item.source || '') + (item.date ? ' · ' + item.date : '') + topicBadge + newsTopicBadge + '</div>';
      html += '<h3>' + (item.link ? '<a href="' + item.link + '" target="_blank" rel="noopener">' + (item.title || 'Untitled') + '</a>' : (item.title || 'Untitled')) + '</h3>';
      if (item.summary) { html += '<div class="description">' + item.summary + '</div>'; }
      if (item.link) { html += '<div style="margin-top:8px;"><a href="' + item.link + '" target="_blank" rel="noopener" style="font-size:0.8rem; color:var(--forest); font-weight:600; text-decoration:none;">' + linkLabel + '</a></div>'; }
      html += '</div>'; // close event-card-content
      html += '</div>'; // close card-body
      html += '</div>'; // close card
    }
  });

  container.innerHTML = html;
}

// Render legal notices inside the Local News container when "Legal Notices" filter is selected
function renderLegalNoticesIntoContainer(container) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const active = LEGAL_NOTICES.filter(function(n) {
    if (!n.expires) return true;
    var exp = localDate(n.expires);
    return !exp || exp >= today;
  });

  if (active.length === 0) {
    container.innerHTML = '<div class="empty-state">No active legal notices at this time.</div>';
    return;
  }

  // Show the legals sub-filter chips
  let subFilterHtml = '<div class="filter-row" id="legal-sub-filters" style="margin-bottom:16px;">';
  subFilterHtml += '<span class="chip active-all legal-sub-chip" data-legal-filter="all">All</span>';
  subFilterHtml += '<span class="chip legal-sub-chip" data-legal-filter="public-entity">Public Entity</span>';
  subFilterHtml += '<span class="chip legal-sub-chip" data-legal-filter="water-court">Water Court</span>';
  subFilterHtml += '<span class="chip legal-sub-chip" data-legal-filter="housing">Housing</span>';
  subFilterHtml += '<span class="chip legal-sub-chip" data-legal-filter="ordinance">Ordinance</span>';
  subFilterHtml += '<span class="chip legal-sub-chip" data-legal-filter="estate">Estate / Creditors</span>';
  subFilterHtml += '<span class="chip legal-sub-chip" data-legal-filter="tax-finance">Tax & Finance</span>';
  subFilterHtml += '<span class="chip legal-sub-chip" data-legal-filter="utilities">Utilities</span>';
  subFilterHtml += '</div>';

  let html = subFilterHtml;
  active.forEach(function(notice) {
    const papersArr = Array.isArray(notice.papers) ? notice.papers : [];
    const primaryPaper = PAPER_LOGOS[papersArr[0]];
    const linkUrl = primaryPaper ? primaryPaper.url : '#';
    const eLogo = LEGAL_ENTITY_LOGOS[notice.entityLogo] || '';
    const eLogoHtml = eLogo ? '<div class="legal-entity-logo">' + eLogo + '</div>' : '';

    let paperBadgesHtml = '<div class="legal-paper-badges"><span class="paper-label">Published in:</span>';
    const seenPapers = new Set();
    papersArr.forEach(function(pKey) {
      const p = PAPER_LOGOS[pKey];
      if (!p) return;
      if (seenPapers.has(p.name)) return;
      seenPapers.add(p.name);
      const logoEl = p.img ? '<img src="' + p.img + '" alt="' + p.name + '" />' : (p.svg || '');
      paperBadgesHtml += '<span class="paper-badge">' + logoEl + ' ' + p.name + '</span>';
    });
    paperBadgesHtml += '</div>';

    const calBtns = legalCalendarButtons(notice);

    let mapHtml = '';
    // Skip map for legal land descriptions (Section/Township/Range) \u2014 ungeocodeable
    // addresses cause the caption text to ghost over adjacent card content.
    if (notice.address && isStreetAddr(notice.address)) {
      const mapQ = encodeURIComponent(notice.address);
      mapHtml = '<div class="legal-card-map" onclick="event.stopPropagation();event.preventDefault();">' +
        '<iframe src="https://maps.google.com/maps?q=' + mapQ + '&t=&z=15&ie=UTF8&iwloc=&output=embed" ' +
        'width="100%" height="100%" style="border:0;border-radius:10px;" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>' +
      '</div>' +
      '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:6px;text-align:center;">\ud83d\udccd ' + notice.address + '</div>';
    }

    html += '<a href="' + linkUrl + '" target="_blank" rel="noopener" class="legal-card" data-filter-tag="' + notice.filterTag + '">' +
      '<div class="legal-card-grid">' +
        '<div class="legal-card-body">' +
          '<div class="legal-card-header">' +
            eLogoHtml +
            '<div>' +
              '<div class="legal-card-title">' + notice.title + '</div>' +
              '<div class="legal-card-entity ' + notice.entityClass + '">' + notice.entity + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="legal-card-summary">' + highlightLegalNamesAndAddresses(linkGlossaryTerms(notice.summary)) + '</div>' +
          '<div class="legal-card-meta">' +
            '<span class="legal-meta-tag tag-type">' + notice.type + '</span>' +
            '<span class="legal-meta-tag tag-deadline">' + notice.deadline + '</span>' +
            '<span class="legal-meta-tag tag-date">Published: ' + notice.dates + '</span>' +
            '<span class="legal-read-more">Read Full Notice \u2192</span>' +
          '</div>' +
          calBtns +
          paperBadgesHtml +
        '</div>' +
        mapHtml +
      '</div>' +
    '</a>';
  });

  container.innerHTML = html;

  // Attach sub-filter click handlers
  document.querySelectorAll('.legal-sub-chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      const f = chip.dataset.legalFilter;
      document.querySelectorAll('.legal-sub-chip').forEach(function(c) { c.className = 'chip legal-sub-chip'; });
      if (f === 'all') chip.classList.add('active-all');
      else chip.classList.add('active-' + f);
      // Show/hide legal cards based on sub-filter
      document.querySelectorAll('#local-news-content .legal-card').forEach(function(card) {
        if (f === 'all' || card.getAttribute('data-filter-tag') === f) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
}

// Legal Notices filter chips
document.querySelectorAll('.chip[data-tab-target="legals"]').forEach(chip => {
  chip.addEventListener('click', () => {
    const filter = chip.dataset.filter;
    document.querySelectorAll('.chip[data-tab-target="legals"]').forEach(c => {
      c.className = 'chip';
    });
    if (filter === 'all') chip.classList.add('active-all');
    else chip.classList.add('active-' + filter);
    currentLegalFilter = filter;
    renderLegalNoticesWithTopic();
  });
});

// ════════════════════════════════
// ── Legal Notices Data & Render ─
// ════════════════════════════════

const LEGAL_NOTICES_CACHE_DATE = '2026-05-13'; // Updated by legal-notice-update task

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

// Entity logos for legal notice cards -- reuses ENTITY_LOGOS where possible
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
    title: "Property Tax Exemption -- Seniors, Disabled Veterans & Gold Star Spouses",
    entity: "San Miguel County Assessor",
    entityClass: "ent-assessor",
    entityLogo: "state",
    icon: "🏠",
    iconClass: "type-tax",
    type: "Tax Exemption",
    filterTag: "tax-finance",
    summary: "Colorado provides a property tax exemption of 50% of the first $200,000 in actual value for qualifying senior citizens (65+, 10-year ownership), veterans with 100% disability, and gold star veteran spouses. Applications accepted through July 15, 2026. Contact the Assessor at 970-728-3174.",
    deadline: "Applications due by July 15, 2026",
    expires: "2026-07-15",
    dates: "2/5 through 7/9 (biweekly)",
    papers: ["ttimes", "npost"]
  },
  {
    title: "RFP -- Floor Replacement for Courthouse & Miramonte Building",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "RFP",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking proposals for a contractor to replace flooring at 333 & 305 W. Colorado Ave, Telluride. RFP info available at sanmiguelcountyco.gov/Bids.aspx or 333 W. Colorado Ave 2nd flr, Telluride. Contact Greg Pollio at (970) 369-5432 or gregp@sanmiguelcountyco.gov. Deadline extended to May 23.",
    deadline: "Proposals due May 23, 2026 at 5:00 PM",
    expires: "2026-05-23",
    dates: "4/2, 4/7, 4/16, 4/23",
    papers: ["ttimes_apr2", "county_web"],
    url: "https://www.sanmiguelcountyco.gov/Bids.aspx"
  },
  {
    title: "Notice of Vesting -- 116 E Columbia Ave Remodel Addition",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "🏗️",
    iconClass: "type-rfp",
    type: "Land Use",
    filterTag: "ordinance",
    summary: "A site-specific development plan and vested property right has been approved for the 116 E Columbia Remodel Addition (Historic Residential zone, Block 7 Telluride). Owner: Drift Mine LLC and AZ LL. Applicant: Shift Architects, Kristine Perpar. Approved February 18, 2026.",
    deadline: "Subject to referendum and judicial review",
    expires: "2026-05-18",
    dates: "3/5",
    papers: ["ttimes_mar5"],
    address: "116 E Columbia Ave, Telluride, CO"
  },
  {
    title: "Notice of Vesting -- Korn Residence, 566 W Columbia Ave",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "🏗️",
    iconClass: "type-rfp",
    type: "Land Use",
    filterTag: "ordinance",
    summary: "A site-specific development plan and vested property right has been approved for the Korn Residence (Historic Residential zone, Lot 24A Block 9 West Telluride). Small-scale addition increasing floor area by more than 25%, small-scale repositioning of a designated THAS primary structure, minor scale alteration, and insubstantial scale addition. Owner: Korn David & Kristin Family Trust. Applicant: Shift Architects, Kristine Perpar. Approved March 18, 2026.",
    deadline: "Subject to referendum and judicial review",
    expires: "2026-06-18",
    dates: "4/2",
    papers: ["ttimes_apr2"],
    address: "566 W Columbia Ave, Telluride, CO"
  },
  {
    title: "Notice of Vesting -- 108 N Columbine Minor Addition/Remodel",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "🏗️",
    iconClass: "type-rfp",
    type: "Land Use",
    filterTag: "ordinance",
    summary: "A site-specific development plan and vested property right has been approved for 108 N Columbine Minor Addition/Remodel (Residential zone, Lot 1R Block 24 East Telluride). Minor scale addition increasing floor area by more than 25% and resulting in 1,000-2,500 sq ft, outside of the THLD but within the HPOD. Owner: ZKLF LLC. Applicant: McAllister Architects, Michael McAllister. Approved March 18, 2026.",
    deadline: "Subject to referendum and judicial review",
    expires: "2026-06-18",
    dates: "4/2",
    papers: ["ttimes_apr2"],
    address: "108 N Columbine St, Telluride, CO"
  },
  {
    title: "Notice of Vesting -- Fulton Residence (Hillside Transitional)",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "🏗️",
    iconClass: "type-rfp",
    type: "Land Use",
    filterTag: "ordinance",
    summary: "A site-specific development plan and vested property right has been approved for the Fulton Residence (Hillside Transitional zone, Lot 7R Block E North Telluride). Small-scale new construction of a principal structure containing 2,500 sq ft or more of floor area, on a lot with pre-construction grade or slope of building site coverage of 25% or greater. Owner: Tio Rico LLC. Applicant: William Erwin, ASUL. Approved March 18, 2026.",
    deadline: "Subject to referendum and judicial review",
    expires: "2026-06-18",
    dates: "4/2",
    papers: ["ttimes_apr2"]
  },
  {
    title: "Planning Commission Meeting -- Regular Meeting Agenda",
    entity: "San Miguel County Planning Commission",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "San Miguel County Planning Commission will hold a regular meeting on May 14, 2026 at 9:30 AM. The meeting includes public hearings on land use applications, land use code amendments regarding footprint definitions and accelerated housing review, and a work session on natural medicine code amendments.",
    deadline: "May 14, 2026 at 9:30 AM",
    expires: "2026-05-14",
    dates: "5/6",
    papers: ["ttimes_0506"],
    url: "https://www.telluridenews.com/news/legals/article_ed4e10c4-69c5-441c-82eb-a85c1c99999e.html",
    address: "333 West Colorado Ave., Second Floor Meeting Room, Telluride, CO 81435",
    noticeKey: "planning-comm-2026-05-14"
  },
  {
    title: "Ordinance -- Community Development Code Amendment for Wildfire Resilience (Passed Second Reading)",
    entity: "Town of Mountain Village",
    entityClass: "ent-county",
    entityLogo: "mv",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "Town of Mountain Village passed an ordinance on second reading on April 23, 2026 regarding Community Development Code amendments for compliance with Colorado Wildfire Resilience Code. The ordinance is available for review at Town Hall or on the town website.",
    deadline: "",
    expires: "2026-07-06",
    dates: "5/6",
    papers: ["ttimes_0506"],
    url: "https://www.telluridenews.com/news/legals/article_ed4e10c4-69c5-441c-82eb-a85c1c99999e.html",
    address: "Town of Mountain Village",
    noticeKey: "mv-ord-wildfire-2026"
  },
  {
    title: "Condominium Notice -- First Mortgagee Consent for Declaration Amendment (Village Creek)",
    entity: "Village Creek Condominium Association",
    entityClass: "ent-county",
    entityLogo: "mv",
    icon: "🏠",
    iconClass: "type-hearing",
    type: "Housing Notice",
    filterTag: "housing",
    summary: "Village Creek Condominium Association has issued a proposed First Amendment to the Declaration and is notifying all first mortgagees. First mortgagees have 60 days from the mailed notice to deliver a negative response, or they will be deemed to have approved the amendment.",
    deadline: "60 days after mailed notice to mortgagees",
    expires: "2026-07-06",
    dates: "5/6",
    papers: ["ttimes_0506"],
    url: "https://www.telluridenews.com/news/legals/article_ed4e10c4-69c5-441c-82eb-a85c1c99999e.html",
    address: "Village Creek Condominiums, San Miguel County, Colorado",
    noticeKey: "village-creek-condo-amend-2026"
  },
  {
    title: "Ordinance -- Multiple Ordinances First Reading (Public Hearing Scheduled)",
    entity: "Town of Mountain Village",
    entityClass: "ent-county",
    entityLogo: "mv",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "Town of Mountain Village passed three ordinances on first reading on April 23, 2026 including lighting regulations, building regulations, and emergency water usage restrictions. Second reading and public hearing will be held May 21, 2026 at 2:00 PM.",
    deadline: "May 21, 2026 at 2:00 PM",
    expires: "2026-05-21",
    dates: "5/6",
    papers: ["ttimes_0506"],
    url: "https://www.telluridenews.com/news/legals/article_ed4e10c4-69c5-441c-82eb-a85c1c99999e.html",
    address: "Mountain Village Town Hall, Mountain Village",
    noticeKey: "mv-ord-multiple-2026"
  },
  {
    title: "Public Hearing -- Onsite Wastewater Treatment Systems Regulations",
    entity: "San Miguel County Board of Health",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "💧",
    iconClass: "type-hearing",
    type: "Utilities",
    filterTag: "utilities",
    summary: "San Miguel County Board of Health will consider regulatory options related to Colorado Regulation 43 for Onsite Wastewater Treatment Systems on May 20, 2026. The meeting provides opportunity for public comment and participation.",
    deadline: "May 20, 2026",
    expires: "2026-05-20",
    dates: "5/6",
    papers: ["ttimes_0506"],
    url: "https://www.telluridenews.com/news/legals/article_ed4e10c4-69c5-441c-82eb-a85c1c99999e.html",
    address: "333 West Colorado Ave, 2nd floor, Telluride, CO 81423",
    noticeKey: "boh-owts-reg-2026-05-20"
  },
  {
    title: "RFP -- Flooring Replacement at County Buildings",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "San Miguel County requests proposals for a contractor to replace flooring at 333 & 305 W. Colorado Ave, Telluride. RFP information is available on the county website or at the specified address. Deadline for proposals is 5:00 PM on Friday, June 5th.",
    deadline: "June 5, 2026 at 5:00 PM",
    expires: "2026-06-05",
    dates: "5/6",
    papers: ["ttimes_0506"],
    url: "https://www.telluridenews.com/news/legals/article_ed4e10c4-69c5-441c-82eb-a85c1c99999e.html",
    address: "333 & 305 W. Colorado Ave, Telluride, CO",
    noticeKey: "rfp-flooring-2026"
  },
  {
    title: "RFP -- Boiler System Replacement at Down Valley Park",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "San Miguel County requests proposals for a contractor to replace the boiler system at the Down Valley Park in Placerville. RFP information is available on the county website or at Parks & Open Space department. Deadline for proposals is 5:00 PM on June 4th.",
    deadline: "June 4, 2026 at 5:00 PM",
    expires: "2026-06-04",
    dates: "5/6",
    papers: ["ttimes_0506"],
    url: "https://www.telluridenews.com/news/legals/article_ed4e10c4-69c5-441c-82eb-a85c1c99999e.html",
    address: "Down Valley Park, Placerville",
    noticeKey: "rfp-boiler-placerville-2026"
  },
  {
    title: "Public Hearing -- OWTS Variance Application (Sheamus Croke - Ophir)",
    entity: "San Miguel County Board of Health",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "💧",
    iconClass: "type-hearing",
    type: "Utilities",
    filterTag: "utilities",
    summary: "San Miguel County Board of Health will consider an OWTS Variance Application for Sheamus Croke, owner of Lots 5 and 6 Block M Ophir, to reduce setback from Soil Treatment Area to southwest property line from 10 feet to 2 feet. Public hearing scheduled for May 27, 2026 at 2:00 PM.",
    deadline: "May 27, 2026 at 2:00 PM",
    expires: "2026-05-27",
    dates: "5/6",
    papers: ["ttimes_0506"],
    url: "https://www.telluridenews.com/news/legals/article_ed4e10c4-69c5-441c-82eb-a85c1c99999e.html",
    address: "Lots 5 and 6 Block M Ophir",
    noticeKey: "owts-variance-croke-ophir-2026"
  },
  {
    title: "Special Use Permit -- Scenic and Social Application (Parcel #452726103022)",
    entity: "San Miguel County Planning Commission",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "San Miguel County Planning Commission will hold a public hearing on a Scenic and Social Special Use Permit application. The hearing is scheduled for May 14, 2026 at 10:30 a.m. at the Sheriffs Annex Building in Norwood. Written comments must be received by noon on April 30, 2026.",
    deadline: "April 30, 2026 (noon for comments); May 14, 2026 (hearing)",
    expires: "2026-05-14",
    dates: "4/23",
    papers: ["ttimes_0423"],
    url: "https://www.telluridenews.com/news/legals/article_76d3542a-2f1e-4b15-bc4c-59de56d18ccc.html",
    address: "488 S. Avalon Dr., Norwood, CO (Parcel #452726103022)",
    noticeKey: "sup-scenic-social-452726103022"
  },
  {
    title: "Special Use Permit -- Construction/Contractor Office and Staging Area (Parcel #452726103022)",
    entity: "San Miguel County Planning Commission",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "John Miller of Ponderosa Planning & Design, on behalf of Kurt Works Inc. and Kurt Crockett, has applied for a Special Use Permit to establish a Construction/Contractor Office and Staging Area for an excavation and grading business. Public hearing scheduled for May 14, 2026 at 10:45 a.m. Written comments due by noon on April 30, 2026.",
    deadline: "April 30, 2026 (noon for comments); May 14, 2026 (hearing)",
    expires: "2026-05-14",
    dates: "4/23",
    papers: ["ttimes_0423"],
    url: "https://www.telluridenews.com/news/legals/article_76d3542a-2f1e-4b15-bc4c-59de56d18ccc.html",
    address: "488 S. Avalon Dr., Norwood, CO (Parcel #452726103022)",
    noticeKey: "sup-contractor-staging-452726103022"
  },
  {
    title: "RFP -- Flooring Replacement at County Buildings",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "San Miguel County is requesting proposals from contractors to replace flooring at 333 & 305 W. Colorado Ave in Telluride. Contact Greg Pollio for information. Proposals must be submitted by 5:00 PM on Friday, May 24th.",
    deadline: "May 24, 2026 (5:00 PM)",
    expires: "2026-05-24",
    dates: "4/23",
    papers: ["ttimes_0423"],
    url: "https://www.telluridenews.com/news/legals/article_76d3542a-2f1e-4b15-bc4c-59de56d18ccc.html",
    address: "333 & 305 W. Colorado Ave, Telluride, CO",
    noticeKey: "rfp-flooring-colorado-ave"
  },
  {
    title: "RFP -- Landscape Improvements at Galloping Goose Park",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "San Miguel County is requesting proposals for landscape improvements to the Galloping Goose Park in Telluride. Contact Janet Kask at Parks & Open Space department for information. Proposals due by 5:00 PM on Friday, May 22nd.",
    deadline: "May 22, 2026 (5:00 PM)",
    expires: "2026-05-22",
    dates: "4/23",
    papers: ["ttimes_0423"],
    url: "https://www.telluridenews.com/news/legals/article_76d3542a-2f1e-4b15-bc4c-59de56d18ccc.html",
    address: "Galloping Goose Park, Telluride, CO",
    noticeKey: "rfp-galloping-goose-landscape"
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
    expires: "2026-08-05",
    dates: "5/7",
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
    expires: "2026-08-05",
    dates: "5/7",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=187",
    address: "",
    smcBidID: "187"
  },
  {
    title: "Request for Proposal -- Request for Proposal for Boiler Replacement at the Down Valley Park",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking qualified respondents for: Request for Proposal for Boiler Replacement at the Down Valley Park.",
    deadline: "Closes 6/4/2026",
    expires: "2026-06-04",
    dates: "5/7",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=205",
    address: "",
    smcBidID: "205"
  },
  {
    title: "Request for Proposal -- Request for Proposal for Floor Replacement at Courthouse and Miramonte Building",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking qualified respondents for: Request for Proposal for Floor Replacement at Courthouse and Miramonte Building.",
    deadline: "Closes 6/5/2026",
    expires: "2026-06-05",
    dates: "5/7",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=204",
    address: "",
    smcBidID: "204"
  },
  {
    title: "Request for Proposal -- Request for Proposal for San Miguel County Galloping Goose Park",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking qualified respondents for: Request for Proposal for San Miguel County Galloping Goose Park.",
    deadline: "Closes 5/22/2026",
    expires: "2026-05-22",
    dates: "5/7",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=202",
    address: "",
    smcBidID: "202"
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
    title: "Request for Proposal -- Request for Proposal for San Miguel County Road 58P Retaining Wall Construction",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "San Miguel County is seeking qualified respondents for: Request for Proposal for San Miguel County Road 58P Retaining Wall Construction.",
    deadline: "Closes 5/26/2026",
    expires: "2026-05-26",
    dates: "5/7",
    url: "https://www.sanmiguelcountyco.gov/bids.aspx?bidID=203",
    address: "",
    smcBidID: "203"
  },
  {
    title: "Request for Proposal -- Deputy Municipal Court Judge",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "Town of Telluride is seeking qualified respondents for: Deputy Municipal Court Judge.",
    deadline: "Closes 6/4/2026",
    expires: "2026-06-04",
    dates: "5/7",
    url: "https://www.telluride.gov/bids.aspx?bidID=127",
    address: "",
    totBidID: "127"
  },
  {
    title: "Rezoning Application -- 2028 Maverick Way, Norwood",
    entity: "Norwood Public Schools",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "📋",
    iconClass: "type-hearing",
    type: "Ordinance",
    filterTag: "ordinance",
    summary: "Norwood Public Schools has filed a rezoning application for property at 2028 Maverick Way in Norwood. Public hearings are scheduled for Planning and Zoning on April 20, 2026 at 6:30 PM and Norwood Board of Trustees on May 13, 2026 at 7:00 PM.",
    deadline: "May 13, 2026",
    expires: "2026-05-13",
    dates: "4/16",
    papers: ["ttimes_0416"],
    url: "https://www.telluridenews.com/news/legals/article_c5a54e8f-2fa6-42a2-ba94-3a3828e137ff.html",
    address: "2028 Maverick Way, Norwood, CO 81423",
    noticeKey: "rezoning-2028-maverick-norwood"
  },
  {
    title: "RFP -- County Building Flooring Replacement",
    entity: "San Miguel County",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "San Miguel County is requesting proposals from contractors to replace flooring at 333 & 305 W. Colorado Ave in Telluride. RFP information is available on the county website or at the county offices. Proposals are due by 5:00 PM on Friday, May 24th.",
    deadline: "May 24, 2026 at 5:00 PM",
    expires: "2026-05-24",
    dates: "4/16",
    papers: ["ttimes_0416"],
    url: "https://www.telluridenews.com/news/legals/article_c5a54e8f-2fa6-42a2-ba94-3a3828e137ff.html",
    address: "333 & 305 W. Colorado Ave, Telluride, CO",
    noticeKey: "rfp-flooring-333-305-colorado"
  },
  {
    title: "Public Meeting -- Onsite Wastewater Treatment Systems Regulation (Board of Health)",
    entity: "San Miguel County Board of Health",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "The San Miguel County Board of Health will consider regulatory options related to Colorado Regulation 43 for onsite wastewater treatment systems during their May 20, 2026 meeting. The meeting will provide opportunity for public comment and participation. Written comments must be received by May 19, 2026.",
    deadline: "May 19, 2026",
    expires: "2026-05-20",
    dates: "4/30",
    papers: ["ttimes_0430"],
    url: "https://www.telluridenews.com/news/legals/article_3718afea-4523-4a88-a728-754e3336d2f8.html",
    address: "333 West Colorado Ave, 2nd floor, Telluride, CO 81423",
    noticeKey: "boh-wastewater-reg43-052026"
  },
  {
    title: "Public Hearing -- Tree Removal Application (Elm Creek Reserve High Meadow Ranch)",
    entity: "San Miguel County Board of Commissioners",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "Cari Johnson on behalf of VM West LLC has applied for tree removal permits on Elm Creek Reserve's High Meadow Ranch on Wilson Mesa across five parcels. The Board of County Commissioners will hold a public meeting on May 20, 2026 at 9:30 AM. Written comments must be received by May 12, 2026.",
    deadline: "May 12, 2026",
    expires: "2026-05-20",
    dates: "4/30",
    papers: ["ttimes_0430"],
    url: "https://www.telluridenews.com/news/legals/article_3718afea-4523-4a88-a728-754e3336d2f8.html",
    address: "Wilson Mesa parcels #478301200005, #478301300006, #478313007001, #478313200015, #478312200001",
    noticeKey: "tree-removal-elmcreek-478301200005"
  },
  {
    title: "Public Hearing -- Lot Line Vacation (Fall Creek Subdivision No. 2)",
    entity: "San Miguel County Board of Commissioners",
    entityClass: "ent-county",
    entityLogo: "county",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Public Notice",
    filterTag: "public-entity",
    summary: "Ray Bowers on behalf of Cigmire LLC seeks a subdivision exemption for lot line vacation between Lots 51 and 52 in Fall Creek Subdivision No. 2 to increase buildability of lot 52. Public hearing scheduled for May 20, 2026 at 9:30 AM. Written comments must be received by May 11, 2026.",
    deadline: "May 11, 2026",
    expires: "2026-05-20",
    dates: "4/30",
    papers: ["ttimes_0430"],
    url: "https://www.telluridenews.com/news/legals/article_3718afea-4523-4a88-a728-754e3336d2f8.html",
    address: "Fall Creek Subdivision No. 2, Lots 51-52 (parcels #456318203006, #456318203005)",
    noticeKey: "lot-line-vacation-fallcreek-456318203006"
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
    title: "Request for Proposal -- 2026 Public Restroom Cleaning Services",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "Town of Telluride is seeking qualified respondents for: 2026 Public Restroom Cleaning Services.",
    deadline: "Closes 6/5/2026",
    expires: "2026-06-05",
    dates: "5/9",
    url: "https://www.telluride.gov/bids.aspx?bidID=128",
    address: "",
    totBidID: "128"
  },
  {
    title: "Request for Proposal -- 2026 Town Facilities Janitorial Services",
    entity: "Town of Telluride",
    entityClass: "ent-county",
    entityLogo: "telluride",
    icon: "🏛️",
    iconClass: "type-rfp",
    type: "Request for Proposal",
    filterTag: "public-entity",
    summary: "Town of Telluride is seeking qualified respondents for: 2026 Town Facilities Janitorial Services.",
    deadline: "Closes 6/5/2026",
    expires: "2026-06-05",
    dates: "5/9",
    url: "https://www.telluride.gov/bids.aspx?bidID=129",
    address: "",
    totBidID: "129"
  },
  {
    title: "Water Court -- Diligence Application for NWC Conditional Water Rights (Case No. 26CW3016)",
    entity: "Colorado District Court, Water Division No. 4",
    entityClass: "ent-county",
    entityLogo: "water_court",
    icon: "💧",
    iconClass: "type-bid",
    type: "Water Court",
    filterTag: "water-court",
    summary: "Norwood Water Commission filed a diligence application in Water Division 4 for multiple conditional water rights including reservoirs and pumps in the San Miguel River basin. The application seeks to show reasonable diligence in developing water rights originally decreed in 2013, with subsequent diligence found in 2019. The water rights are for irrigation, municipal, power generation, augmentation and piscatorial uses serving up to 20,000 acres in the NWC service area.",
    deadline: "Not specified in notice",
    expires: "2026-05-31",
    dates: "4/9",
    papers: ["ttimes_0409"],
    url: "https://www.telluridenews.com/news/legals/article_53f99203-76eb-4168-b3a4-392ac65857e4.html",
    address: "Multiple locations in San Miguel County including SW1/4 NE1/4 Section 10, T42N R12W; NW1/4 NW1/4 Section 22, T44N R13W; SE1/4 SE1/4 Section 9, T44N R13W; and other locations",
    noticeKey: "26CW3016",
    caseNumber: "26CW3016"
  }
];

// Build calendar buttons for a legal notice event
function legalCalendarButtons(notice) {
  if (!notice.event) return '';
  const evt = notice.event;
  const eventDate = localDate(evt.date);
  if (!eventDate || isNaN(eventDate)) return '';

  // Build a compatible item for the existing calendar URL functions
  const calItem = {
    title: notice.title,
    sourceLabel: notice.entity,
    eventDate: eventDate,
    eventTimes: evt.time + (evt.endTime ? ' - ' + evt.endTime : ''),
    location: evt.location || '',
    link: (Array.isArray(notice.papers) && PAPER_LOGOS[notice.papers[0]]) ? PAPER_LOGOS[notice.papers[0]].url : '',
    source: 'legal'
  };

  const gIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

  return '<div class="card-actions" style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(0,0,0,0.06);">' +
    '<a href="' + googleCalUrl(calItem) + '" target="_blank" rel="noopener" class="cal-btn" title="Add to Google Calendar" onclick="event.stopPropagation();">' + gIcon + ' Google</a>' +
    '<a href="' + outlookCalUrl(calItem) + '" target="_blank" rel="noopener" class="cal-btn" title="Add to Outlook Calendar" onclick="event.stopPropagation();">' + gIcon + ' Outlook</a>' +
    '<a href="' + icsDataUri(calItem) + '" download="' + notice.title.replace(/[^a-zA-Z0-9]/g, '_') + '.ics" class="cal-btn" title="Download .ics file" onclick="event.stopPropagation();">' + gIcon + ' iCal</a>' +
  '</div>';
}

let currentLegalFilter = 'all';

// ══════════════════════════════════════════════════════
// ── Cross-Cutting Topic Sidebar Filter ──
// ── Nearby Legal Notices Search ──
var nearbySelectedMiles = 1;

// Distance button click handlers
document.addEventListener('DOMContentLoaded', function() {
  var distBtns = document.querySelectorAll('.nearby-dist-btn');
  distBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      distBtns.forEach(function(b) {
        b.style.background = '#fff';
        b.style.color = '#21443c';
        b.style.borderColor = 'rgba(33,68,60,0.2)';
        b.classList.remove('active');
      });
      btn.style.background = '#21443c';
      btn.style.color = '#fff';
      btn.style.borderColor = '#21443c';
      btn.classList.add('active');
      nearbySelectedMiles = parseFloat(btn.dataset.miles);
    });
  });
  // Enter key triggers search
  var addrInput = document.getElementById('nearbyLegalAddress');
  if (addrInput) {
    addrInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); searchNearbyLegalNotices(); }
    });
  }
});

// Known locations for entities/addresses in the Telluride area (lat, lng)
var KNOWN_LOCATIONS = {
  'telluride': [37.9375, -107.8123],
  'mountain village': [37.9314, -107.8465],
  'norwood': [38.1294, -108.2879],
  'ophir': [37.8561, -107.8284],
  'rico': [37.6938, -108.0340],
  'sawpit': [37.9762, -107.8870],
  'placerville': [38.0186, -108.0482],
  '155 w pacific ave': [37.9376, -107.8125],
  '411 mountain village blvd': [37.9332, -107.8492],
  '333 w colorado ave': [37.9375, -107.8148],
  '116 e columbia ave': [37.9378, -107.8098],
  '472 w pacific': [37.9372, -107.8160],
  '113 lost creek ln': [37.9322, -107.8508],
  'miramonte building': [37.9375, -107.8148],
  'san miguel county courthouse': [37.9377, -107.8120]
};

// Haversine distance in miles
function haversineMiles(lat1, lon1, lat2, lon2) {
  var R = 3958.8; // Earth radius in miles
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Try to resolve an address to lat/lng from known locations first, then geocode
function geocodeAddress(address) {
  if (!address) return Promise.resolve(null);
  var lower = address.toLowerCase().replace(/,?\s*(co|colorado|81435|81425|81432)\s*/gi, '').trim();
  // Check known locations
  for (var key in KNOWN_LOCATIONS) {
    if (lower.indexOf(key) !== -1) {
      return Promise.resolve(KNOWN_LOCATIONS[key]);
    }
  }
  // Fallback: try to match city name
  if (/telluride/i.test(address)) return Promise.resolve(KNOWN_LOCATIONS['telluride']);
  if (/mountain\s*village/i.test(address)) return Promise.resolve(KNOWN_LOCATIONS['mountain village']);
  if (/norwood/i.test(address)) return Promise.resolve(KNOWN_LOCATIONS['norwood']);
  if (/ophir/i.test(address)) return Promise.resolve(KNOWN_LOCATIONS['ophir']);
  if (/rico/i.test(address)) return Promise.resolve(KNOWN_LOCATIONS['rico']);
  if (/placerville/i.test(address)) return Promise.resolve(KNOWN_LOCATIONS['placerville']);
  if (/sawpit/i.test(address)) return Promise.resolve(KNOWN_LOCATIONS['sawpit']);

  // Geocode via Nominatim
  var query = encodeURIComponent(address + (!/colorado|co\b/i.test(address) ? ', Colorado' : ''));
  return fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + query)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data && data.length > 0) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      return null;
    })
    .catch(function() { return null; });
}

// Infer a location for a legal notice from its address, summary, or entity
function getNoticeLocation(notice) {
  if (notice.address) return geocodeAddress(notice.address);
  // Try to extract an address from the summary
  var addrMatch = (notice.summary || '').match(/\d+\s+[NSEW]?\s*\.?\s*\w[\w\s]+(?:Ave|St|Blvd|Rd|Ln|Dr|Way|Ct|Pl|Circle)\b[^,]*/i);
  if (addrMatch) return geocodeAddress(addrMatch[0]);
  // Try entity location
  if (notice.event && notice.event.location) return geocodeAddress(notice.event.location);
  // Fall back to entity city
  var entityName = (notice.entity || '').toLowerCase();
  if (/mountain village/i.test(entityName)) return Promise.resolve(KNOWN_LOCATIONS['mountain village']);
  if (/telluride/i.test(entityName)) return Promise.resolve(KNOWN_LOCATIONS['telluride']);
  if (/norwood/i.test(entityName)) return Promise.resolve(KNOWN_LOCATIONS['norwood']);
  if (/san miguel county/i.test(entityName)) return Promise.resolve(KNOWN_LOCATIONS['telluride']);
  return Promise.resolve(null);
}

function searchNearbyLegalNotices() {
  var addrInput = document.getElementById('nearbyLegalAddress');
  var resultsDiv = document.getElementById('nearbyLegalResults');
  var searchBtn = document.getElementById('nearbyLegalSearchBtn');
  var address = (addrInput.value || '').trim();
  if (!address) {
    addrInput.style.borderColor = '#c0392b';
    addrInput.focus();
    setTimeout(function() { addrInput.style.borderColor = '#ccc'; }, 2000);
    return;
  }

  searchBtn.disabled = true;
  searchBtn.innerHTML = '<span style="display:inline-block;width:16px;height:16px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.6s linear infinite;"></span> Searching...';
  resultsDiv.style.display = 'block';
  resultsDiv.innerHTML = '<div style="text-align:center;padding:10px;color:var(--text-muted);font-size:0.8rem;">Locating your address...</div>';

  geocodeAddress(address).then(function(userCoords) {
    if (!userCoords) {
      resultsDiv.innerHTML = '<div style="text-align:center;padding:12px;color:#c0392b;font-size:0.82rem;font-weight:600;">Could not find that address. Try adding "Telluride, CO" or a nearby town.</div>';
      searchBtn.disabled = false;
      searchBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Search';
      return;
    }

    var today = new Date();
    today.setHours(0,0,0,0);
    var activeNotices = LEGAL_NOTICES.filter(function(n) {
      return !n.expires || new Date(n.expires + 'T23:59:59') >= today;
    });

    // Resolve locations for all notices
    var promises = activeNotices.map(function(n) {
      return getNoticeLocation(n).then(function(coords) {
        return { notice: n, coords: coords };
      });
    });

    Promise.all(promises).then(function(items) {
      var nearby = [];
      items.forEach(function(item) {
        if (!item.coords) return;
        var dist = haversineMiles(userCoords[0], userCoords[1], item.coords[0], item.coords[1]);
        if (dist <= nearbySelectedMiles) {
          nearby.push({ notice: item.notice, distance: dist });
        }
      });
      nearby.sort(function(a, b) { return a.distance - b.distance; });

      if (nearby.length === 0) {
        resultsDiv.innerHTML = '<div style="text-align:center;padding:14px 8px;">' +
          '<div style="font-size:1.3rem;margin-bottom:6px;">📭</div>' +
          '<div style="font-size:0.85rem;font-weight:700;color:var(--text-primary);margin-bottom:4px;">No notices within ' + nearbySelectedMiles + (nearbySelectedMiles === 0.25 ? ' mile' : ' miles') + '</div>' +
          '<div style="font-size:0.78rem;color:var(--text-muted);">Try increasing the distance or check back later.</div>' +
        '</div>';
      } else {
        var html = '<div style="font-size:0.78rem;font-weight:700;color:#21443c;margin-bottom:8px;padding-top:4px;">' + nearby.length + ' notice' + (nearby.length > 1 ? 's' : '') + ' within ' + nearbySelectedMiles + (nearbySelectedMiles === 0.25 ? ' mile' : ' miles') + '</div>';
        nearby.forEach(function(item) {
          var n = item.notice;
          var distLabel = item.distance < 0.1 ? '< 0.1 mi' : item.distance.toFixed(1) + ' mi';
          html += '<div style="padding:10px;border-radius:10px;border:1.5px solid rgba(33,68,60,0.12);background:rgba(255,255,255,0.7);margin-bottom:8px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">' +
              '<div style="font-size:0.82rem;font-weight:700;color:var(--text-primary);line-height:1.3;">' + (n.icon || '📋') + ' ' + n.title + '</div>' +
              '<span style="flex-shrink:0;font-size:0.68rem;padding:2px 6px;border-radius:5px;background:rgba(166,143,87,0.15);color:#8b7332;font-weight:700;white-space:nowrap;">📍 ' + distLabel + '</span>' +
            '</div>' +
            '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:3px;">' + n.entity + '</div>' +
            (n.address ? '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">📍 ' + n.address + '</div>' : '') +
            '<div style="font-size:0.75rem;color:var(--text-secondary);margin-top:5px;line-height:1.4;">' + (n.summary || '').substring(0, 150) + (n.summary && n.summary.length > 150 ? '...' : '') + '</div>' +
            (n.deadline ? '<div style="font-size:0.72rem;color:#c0392b;font-weight:600;margin-top:4px;">⏰ ' + n.deadline + '</div>' : '') +
          '</div>';
        });
        resultsDiv.innerHTML = html;
      }

      searchBtn.disabled = false;
      searchBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Search';
    }).catch(function(err) {
      console.error('Proximity search error:', err);
      resultsDiv.innerHTML = '<div style="text-align:center;padding:12px;color:#c0392b;font-size:0.82rem;font-weight:600;">Something went wrong searching nearby notices. Please try again.</div>';
      searchBtn.disabled = false;
      searchBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Search';
    });
  }).catch(function(err) {
    console.error('Geocoding error:', err);
    resultsDiv.innerHTML = '<div style="text-align:center;padding:12px;color:#c0392b;font-size:0.82rem;font-weight:600;">Could not locate that address. Please check and try again.</div>';
    searchBtn.disabled = false;
    searchBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Search';
  });
}

// ── Legal Notices of Interest Sidebar ──
function renderLegalInterestSidebar() {
  const container = document.getElementById('legalInterestContent');
  if (!container) return;

  // Priority order: water court first, then estate, then housing (lottery/deed restricted)
  const waterCourt = LEGAL_NOTICES.filter(n => n.filterTag === 'water-court');
  const estate = LEGAL_NOTICES.filter(n => n.filterTag === 'estate');
  const housing = LEGAL_NOTICES.filter(n => n.filterTag === 'housing');
  const interest = [...waterCourt, ...estate, ...housing];

  if (interest.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:0.75rem;">No priority notices this week.</div>';
    return;
  }

  let html = '';
  interest.forEach(n => {
    const typeColor = n.filterTag === 'water-court' ? '#1a6fb5' : n.filterTag === 'housing' ? '#2f7a4d' : '#8b5e3c';
    const typeIcon = n.filterTag === 'water-court' ? '💧' : n.filterTag === 'housing' ? '🏘️' : '📜';
    const primaryPaper = (typeof PAPER_LOGOS !== 'undefined' && Array.isArray(n.papers) && PAPER_LOGOS[n.papers[0]]) ? PAPER_LOGOS[n.papers[0]].url : '#';
    html += '<a href="' + primaryPaper + '" target="_blank" rel="noopener" style="display:block;padding:10px 12px;border-radius:10px;background:rgba(47,86,77,0.04);border:1px solid rgba(47,86,77,0.1);text-decoration:none;transition:background 0.15s ease;"' +
      ' onmouseover="this.style.background=\'rgba(47,86,77,0.09)\'" onmouseout="this.style.background=\'rgba(47,86,77,0.04)\'">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">' +
        '<span style="font-size:0.85rem;">' + typeIcon + '</span>' +
        '<span style="font-size:0.65rem;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:' + typeColor + ';">' + n.type + '</span>' +
      '</div>' +
      '<div style="font-size:0.78rem;font-weight:700;color:var(--text-primary);line-height:1.35;margin-bottom:4px;">' + n.title + '</div>' +
      '<div style="font-size:0.72rem;color:var(--text-secondary);line-height:1.45;">' + n.summary.substring(0, 120) + '...</div>' +
      '<div style="font-size:0.68rem;font-weight:700;color:var(--forest);margin-top:6px;">' + n.deadline + '</div>' +
    '</a>';
  });

  container.innerHTML = html;
}

// ══════════════════════════════════════════════════════


let currentTopic = 'all';

function matchesTopic(text, topicKey) {
  if (topicKey === 'all') return true;
  const topic = TOPIC_DEFINITIONS[topicKey];
  if (!topic) return true;
  return topic.keywords.test(text);
}

function getMeetingFullText(item) {
  // Combine all searchable text for a meeting
  let text = (item.title || '') + ' ' + (item.description || '') + ' ' + (item.sourceLabel || '') + ' ' + (item.category || '');
  // Also check cached summary
  if (item.eventDate && item.source) {
    const dateKey = item.eventDate.toISOString().slice(0, 10);
    for (const key of Object.keys(MANUAL_SUMMARIES)) {
      if (key.startsWith(item.source + '|' + dateKey + '|')) {
        text += ' ' + MANUAL_SUMMARIES[key];
      }
    }
    // Also include AI summaries in search text
    for (const key of Object.keys(AI_SUMMARIES)) {
      if (key.startsWith(item.source + '|' + dateKey + '|') && AI_SUMMARIES[key].shortSummary) {
        text += ' ' + AI_SUMMARIES[key].shortSummary;
      }
    }
  }
  return text;
}

function getLegalFullText(notice) {
  return (notice.title || '') + ' ' + (notice.entity || '') + ' ' + (notice.summary || '') + ' ' + (notice.type || '') + ' ' + (notice.filterTag || '') + ' ' + (notice.deadline || '');
}

function getNewsFullText(item) {
  return (item.title || '') + ' ' + (item.description || '') + ' ' + (item.sourceLabel || '') + ' ' + (item.category || '');
}

// Update sidebar counts based on current data
function updateTopicCounts() {
  for (const topicKey of Object.keys(TOPIC_DEFINITIONS)) {
    let count = 0;

    // Count meetings
    const govMeetings = allMeetings.filter(isGovernmentalMeeting);
    const todayStr = new Date().toISOString().slice(0, 10);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + 60);
    const futureMeetings = govMeetings.filter(i => i.eventDate && dateGroupKey(i.eventDate) >= todayStr && i.eventDate <= cutoff);
    count += futureMeetings.filter(m => matchesTopic(getMeetingFullText(m), topicKey)).length;

    // Count news
    count += allNews.filter(n => matchesTopic(getNewsFullText(n), topicKey)).length;

    // Count legal notices
    count += LEGAL_NOTICES.filter(n => matchesTopic(getLegalFullText(n), topicKey)).length;

    const el = document.getElementById('count-' + topicKey);
    if (el) el.textContent = count;
  }
}

// Apply topic filter to the currently active tab
function applyTopicFilter(topicKey) {
  currentTopic = topicKey;

  // Update sidebar active state
  document.querySelectorAll('.sidebar-tag').forEach(tag => {
    tag.classList.toggle('active', tag.dataset.topic === topicKey);
  });

  // Update banner
  const banner = document.getElementById('topicBanner');
  if (topicKey === 'all') {
    banner.classList.remove('visible');
  } else {
    const def = TOPIC_DEFINITIONS[topicKey];
    document.getElementById('bannerIcon').textContent = def.icon;
    document.getElementById('bannerLabel').textContent = def.label;
    banner.classList.add('visible');
  }

  // Re-render all tabs with topic filter
  renderMeetingsWithTopic();
  renderNewsWithTopic();
  renderLegalNoticesWithTopic();
  filterQuickLinks();

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');
}

// Wrap meeting render to apply topic filter
// ── Gov-Hub right sidebar: filter meetings by public entity ──
// Canonical entity list — order matches the chip row in index.html.
// Each entry: { source: <key matching item.source>, label: <human name> }.
const GOVHUB_ENTITIES = [
  { source: 'all',        label: 'All Entities' },
  { source: 'telluride',  label: 'Town of Telluride' },
  { source: 'county',     label: 'San Miguel County' },
  { source: 'mv',         label: 'Mountain Village' },
  { source: 'school',     label: 'School District' },
  { source: 'fire',       label: 'Fire District' },
  { source: 'med',        label: 'Medical Center' },
  { source: 'norwood',    label: 'Norwood' },
  { source: 'ophir',      label: 'Ophir' },
  { source: 'airport',    label: 'TEX Airport' },
  { source: 'smart',      label: 'SMART Transit' },
  { source: 'ouray',      label: 'Ouray' },
  { source: 'ridgway',    label: 'Ridgway' }
];

// Count upcoming non-canceled, non-ended governmental meetings within 30 days
// for one entity (or all). Mirrors the filter chain in renderMeetingsWithTopic.
function countMeetingsForEntity(source) {
  if (!Array.isArray(allMeetings) || allMeetings.length === 0) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = dateGroupKey(today);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 30);
  let n = 0;
  for (const m of allMeetings) {
    if (source !== 'all' && m.source !== source) continue;
    if (!isGovernmentalMeeting(m)) continue;
    if (!m.eventDate || dateGroupKey(m.eventDate) < todayStr) continue;
    if (isMeetingEnded(m)) continue;
    if (m.eventDate > cutoff) continue;
    n++;
  }
  return n;
}

// Single source of truth for changing the meetings filter — keeps both the
// chip row and the right sidebar visually in sync, then re-renders.
function setMeetingsFilter(filter) {
  currentMeetingFilter = filter || 'all';
  document.querySelectorAll('.chip[data-tab-target="meetings"]').forEach(c => {
    c.className = 'chip';
    if (c.dataset.filter === currentMeetingFilter) {
      const cls = currentMeetingFilter === 'all'
        ? 'active-all'
        : 'active-' + currentMeetingFilter;
      c.classList.add(cls);
    }
  });
  document.querySelectorAll('.govhub-sidebar-item').forEach(it => {
    it.classList.toggle('active', it.dataset.filter === currentMeetingFilter);
  });
  renderMeetingsWithTopic();
}

function renderGovHubEntitySidebar() {
  const list = document.getElementById('govhubEntityList');
  if (!list) return;
  const html = GOVHUB_ENTITIES.map(ent => {
    const count = countMeetingsForEntity(ent.source);
    const activeCls = (ent.source === currentMeetingFilter) ? ' active' : '';
    const emptyCls = (count === 0 && ent.source !== 'all') ? ' empty' : '';
    return '<button type="button" class="govhub-sidebar-item' + activeCls + emptyCls + '"'
      + ' data-filter="' + ent.source + '"'
      + ' onclick="setMeetingsFilter(\'' + ent.source + '\')">'
      + '<span class="govhub-sidebar-label">' + ent.label + '</span>'
      + '<span class="govhub-sidebar-count">' + count + '</span>'
      + '</button>';
  }).join('');
  list.innerHTML = html;
}
window.setMeetingsFilter = setMeetingsFilter;

function renderMeetingsWithTopic() {
  const container = document.getElementById('meetings-content');
  let filtered = [...allMeetings];

  // Apply source filter
  if (currentMeetingFilter && currentMeetingFilter !== 'all') {
    filtered = filtered.filter(i => i.source === currentMeetingFilter);
  }

  // Apply governmental filter
  filtered = filtered.filter(isGovernmentalMeeting);

  // Apply topic filter
  if (currentTopic !== 'all') {
    filtered = filtered.filter(m => matchesTopic(getMeetingFullText(m), currentTopic));
  }

  // Sort by event date ascending
  filtered.sort((a, b) => (a.eventDate || 0) - (b.eventDate || 0));

  // Filter to today onward, removing meetings whose end time has passed
  const todayStr = new Date().toISOString().slice(0, 10);
  filtered = filtered.filter(i => i.eventDate && dateGroupKey(i.eventDate) >= todayStr);
  filtered = filtered.filter(i => !isMeetingEnded(i));

  // Deduplicate
  const seen = new Set();
  filtered = filtered.filter(i => {
    const key = i.title + '|' + dateGroupKey(i.eventDate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Limit to next 30 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 30);
  filtered = filtered.filter(i => i.eventDate <= cutoff);

  if (filtered.length === 0) {
    const msg = currentTopic !== 'all'
      ? 'No upcoming meetings match the topic "' + TOPIC_DEFINITIONS[currentTopic].label + '". Try a different topic or clear the filter.'
      : 'No upcoming meetings found. Visit the Local Groups tab to check the calendars directly.';
    container.innerHTML = '<div class="empty-state">' + msg + '</div>';
    return;
  }

  // Group by date and render (same as original renderMeetings)
  const groups = {};
  filtered.forEach(item => {
    const key = dateGroupKey(item.eventDate);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  let html = '';
  Object.keys(groups).sort().forEach(dateKey => {
    const firstItem = groups[dateKey][0];
    html += '<div class="date-group">' + friendlyDate(firstItem.eventDate) + '</div>';
    groups[dateKey].forEach(item => {
      const timePart = item.eventTimes || '';
      const locationPart = item.location ? '<span class="location">📍 ' + item.location + '</span>' : '';
      const agendaUrl = item.agendaLink || item.link;
      const agendaBadge = (item.hasAgenda && !item.canceled)
        ? '<a href="' + agendaUrl + '" target="_blank" rel="noopener" class="agenda-link agenda-posted">Agenda Posted →</a>'
        : '<span class="agenda-link" style="opacity:0.5;cursor:default;pointer-events:none;">' + (item.canceled ? 'Canceled' : 'Agenda Posted →') + '</span>';
      const packetUrl = !item.canceled ? getMeetingPacketLink(item) : null;
      const packetBtn = packetUrl
        ? (packetUrl.startsWith('/')
            ? '<a href="' + packetUrl + '" download class="meeting-packet-btn">⬇ Download Packet</a>'
            : '<a href="' + packetUrl + '" target="_blank" rel="noopener" class="meeting-packet-btn">⬇ Packet</a>')
        : '';
      const cancelStyle = item.canceled ? ' style="opacity: 0.55; text-decoration: line-through;"' : '';
      const summary = item.canceled ? '' : getMeetingSummary(item);
      // START: AI-enhanced summary rendering
      const aiTopics = item.canceled ? [] : getMeetingTopics(item);
      const aiWhyMatters = item.canceled ? '' : getAIWhyItMatters(item);
      const isAISummary = !!(aiTopics.length || aiWhyMatters);

      let summaryHtml = '';
      if (summary) {
        summaryHtml += '<div class="meeting-summary"><strong>Topics:</strong>';
        if (isAISummary) summaryHtml += '<span class="ai-badge">AI Summary</span>';
        summaryHtml += ' ' + highlightAddresses(linkGlossaryTerms(summary));
      }
      // Show AI topic bullets if available
      if (aiTopics.length > 0) {
        summaryHtml += '<ul class="ai-topics-list">';
        aiTopics.forEach(function(t) { summaryHtml += '<li>' + linkGlossaryTerms(t) + '</li>'; });
        summaryHtml += '</ul>';
      }
      // Show AI "why it matters" if available and no WHY_THIS_MATTERS entry exists
      if (aiWhyMatters && !getWhyThisMatters(item)) {
        summaryHtml += '<div class="ai-why-matters">' + linkGlossaryTerms(aiWhyMatters) + '</div>';
      }
      // Correction link at bottom of summary box
      if (summaryHtml) {
        var safeT = (item.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        summaryHtml += '<a class="correction-inline-link" onclick="openCorrectionModal(\'' + safeT + '\', \'meetings\')">✏️ Suggested change to summary?</a>';
        summaryHtml += '</div>';
      }
      // END: AI-enhanced summary rendering

      html += '<div class="card" data-source="' + item.source + '">' +
        renderLogo(item.source) +
        '<div class="card-body">' +
          '<div class="event-card-main">' +
            '<div class="event-card-content">' +
          (item.canceled ? '' : renderBadge(item) + ' ' + agendaBadge + packetBtn) +
          '<h3' + cancelStyle + '><a href="' + item.link + '" target="_blank" rel="noopener">' + cleanTitle(item.title, item.source) + '</a></h3>' +
          '<div class="meta">' + fullDate(item.eventDate) + (timePart ? ' · ' + timePart : '') + '</div>' +
          (locationPart ? '<div class="meta">' + locationPart + '</div>' : '') +
          (item.canceled ? '' : renderWhyThisMatters(item, true)) +
          (item.canceled ? '' : renderPasscodeInfo(item)) +
          (item.canceled ? '' : summaryHtml) +
          (item.canceled ? '' : (item.description ? '<div class="description">' + item.description + '</div>' : '')) +
          (item.canceled ? '' : renderOfficialCommentInfo(item)) +
          (item.canceled ? '' : renderQuickReactions(item)) +
          (item.canceled ? '' : renderCardActions(item)) +
            '</div>' +
            (item.canceled ? '' : renderEventIllustration(getEventTopic(item))) +
          '</div>' +
        '</div>' +
      '</div>';
    });
  });

  container.innerHTML = html;

  // Enlarge logo on cards whose title wraps to 2+ lines
  container.querySelectorAll('.card').forEach(card => {
    const h3 = card.querySelector('h3');
    if (!h3) return;
    const lineHeight = parseFloat(getComputedStyle(h3).lineHeight) || 28;
    if (h3.scrollHeight > lineHeight * 1.5) {
      card.classList.add('multiline-title');
    }
  });
  // Refresh the right-sidebar counts + active state after each render.
  try { renderGovHubEntitySidebar(); } catch(e) { /* sidebar is optional */ }
}

// Wrap news render to apply topic filter
function renderNewsWithTopic() {
  const container = document.getElementById('news-content');
  let filtered = [...allNews];

  // Apply town/location filter (chip values are 'all' or 'town-<slug>').
  const currentNewsFilter = window._currentNewsFilter || 'all';
  if (currentNewsFilter && currentNewsFilter !== 'all' && currentNewsFilter.indexOf('town-') === 0) {
    filtered = filtered.filter(i => detectEventTown(i) === currentNewsFilter);
  }

  // Apply topic filter
  if (currentTopic !== 'all') {
    filtered = filtered.filter(n => matchesTopic(getNewsFullText(n), currentTopic));
  }

  if (filtered.length === 0) {
    const msg = currentTopic !== 'all'
      ? 'No news items match the topic "' + TOPIC_DEFINITIONS[currentTopic].label + '".'
      : 'No news items available.';
    container.innerHTML = '<div class="empty-state">' + msg + '</div>';
    return;
  }

  // Use original renderNews logic but with pre-filtered items
  renderNews(filtered, 'all');
}

// Wrap legal notices render to apply topic filter
// Returns true only for real street addresses — legal land descriptions
// (Section/Township/Range notation) return false and skip the map embed.
function isStreetAddr(addr) {
  return /\d{1,5}\s+[A-Z]/.test(addr) && !/Section\s+\d|T\d+[NS]\s+R\d+[EW]/i.test(addr);
}

function renderLegalNoticesWithTopic() {
  const container = document.getElementById('legals-content');
  if (!container) return;

  // Remove expired notices first
  const today2 = new Date();
  today2.setHours(0, 0, 0, 0);
  const activeLegal = LEGAL_NOTICES.filter(function(n) {
    if (!n.expires) return true;
    var exp = localDate(n.expires);
    return !exp || exp >= today2;
  });

  let filtered = currentLegalFilter === 'all'
    ? [...activeLegal]
    : activeLegal.filter(n => n.filterTag === currentLegalFilter);

  // Apply topic filter
  if (currentTopic !== 'all') {
    filtered = filtered.filter(n => matchesTopic(getLegalFullText(n), currentTopic));
  }

  if (filtered.length === 0) {
    const msg = currentTopic !== 'all'
      ? 'No legal notices match the topic "' + TOPIC_DEFINITIONS[currentTopic].label + '".'
      : 'No notices in this category.';
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:0.9rem;">' + msg + '</div>';
    return;
  }

  let html = '';
  filtered.forEach(notice => {
    const papersArr = Array.isArray(notice.papers) ? notice.papers : [];
    const primaryPaper = PAPER_LOGOS[papersArr[0]];
    const linkUrl = primaryPaper ? primaryPaper.url : '#';
    const eLogo = LEGAL_ENTITY_LOGOS[notice.entityLogo] || '';
    const eLogoHtml = eLogo ? '<div class="legal-entity-logo">' + eLogo + '</div>' : '';

    let paperBadgesHtml = '<div class="legal-paper-badges"><span class="paper-label">Published in:</span>';
    const seenPapers = new Set();
    papersArr.forEach(pKey => {
      const p = PAPER_LOGOS[pKey];
      if (!p) return;
      if (seenPapers.has(p.name)) return;
      seenPapers.add(p.name);
      const logoEl = p.img
        ? '<img src="' + p.img + '" alt="' + p.name + '" />'
        : (p.svg || '');
      paperBadgesHtml += '<span class="paper-badge">' + logoEl + ' ' + p.name + '</span>';
    });
    paperBadgesHtml += '</div>';

    const calBtns = legalCalendarButtons(notice);

    // Build map embed if address exists
    let mapHtml = '';
    // Skip map for legal land descriptions (Section/Township/Range) — ungeocodeable.
    if (notice.address && isStreetAddr(notice.address)) {
      const mapQ = encodeURIComponent(notice.address);
      mapHtml = '<div class="legal-card-map" onclick="event.stopPropagation();event.preventDefault();">' +
        '<iframe src="https://maps.google.com/maps?q=' + mapQ + '&t=&z=15&ie=UTF8&iwloc=&output=embed" ' +
        'width="100%" height="100%" style="border:0;border-radius:10px;" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>' +
      '</div>' +
      '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:6px;text-align:center;">📍 ' + notice.address + '</div>';
    }

    html += '<a href="' + linkUrl + '" target="_blank" rel="noopener" class="legal-card" data-filter-tag="' + notice.filterTag + '">' +
      '<div class="legal-card-grid">' +
        '<div class="legal-card-body">' +
          '<div class="legal-card-header">' +
            eLogoHtml +
            '<div>' +
              '<div class="legal-card-title">' + notice.title + '</div>' +
              '<div class="legal-card-entity ' + notice.entityClass + '">' + notice.entity + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="legal-card-summary">' + highlightLegalNamesAndAddresses(linkGlossaryTerms(notice.summary)) + '</div>' +
          '<div class="legal-card-meta">' +
            '<span class="legal-meta-tag tag-type">' + notice.type + '</span>' +
            '<span class="legal-meta-tag tag-deadline">' + notice.deadline + '</span>' +
            '<span class="legal-meta-tag tag-date">Published: ' + notice.dates + '</span>' +
            '<span class="legal-read-more">Read Full Notice →</span>' +
          '</div>' +
          calBtns +
          paperBadgesHtml +
        '</div>' +
        mapHtml +
      '</div>' +
    '</a>';
  });

  container.innerHTML = html;
}

// Filter Quick Links tab by topic
function filterQuickLinks() {
  const linksTab = document.getElementById('tab-links');
  if (!linksTab) return;

  // Quick Links keyword map per link card
  const linkCards = linksTab.querySelectorAll('.link-card');
  linkCards.forEach(card => {
    const text = card.textContent || '';
    if (currentTopic === 'all') {
      card.style.display = '';
    } else {
      card.style.display = matchesTopic(text, currentTopic) ? '' : 'none';
    }
  });

  // Also show/hide date-group headers if all their cards are hidden
  const sections = linksTab.querySelectorAll('.date-group');
  sections.forEach(header => {
    const grid = header.nextElementSibling;
    if (!grid || !grid.classList.contains('links-grid')) return;
    const visibleCards = grid.querySelectorAll('.link-card:not([style*="display: none"])');
    header.style.display = visibleCards.length === 0 ? 'none' : '';
    grid.style.display = visibleCards.length === 0 ? 'none' : '';
  });
}

// Sidebar click handlers
document.querySelectorAll('.sidebar-tag').forEach(tag => {
  tag.addEventListener('click', () => {
    applyTopicFilter(tag.dataset.topic);
  });
});

document.getElementById('sidebarReset').addEventListener('click', () => {
  applyTopicFilter('all');
});

document.getElementById('bannerClear').addEventListener('click', () => {
  applyTopicFilter('all');
});

// Mobile sidebar toggle
document.getElementById('sidebarToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('active');
});
document.getElementById('sidebarOverlay').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('active');
});

// ── Desktop sidebar collapse/expand toggle ──
document.getElementById('collapseRight').addEventListener('click', () => {
  document.getElementById('sidebar').classList.add('collapsed');
  document.getElementById('expandRight').classList.add('visible');
});
document.getElementById('expandRight').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('collapsed');
  document.getElementById('expandRight').classList.remove('visible');
});

// ══════════════════════════════
// ── Subscribe Tab Logic ──
// ══════════════════════════════

(function() {
  let selectedFreq = 'weekly';

  // Frequency buttons (daily / weekly / monthly)
  // Scoped by [data-freq] so the proximity button (also styled .freq-option)
  // doesn't get caught up in the selected-state toggling below.
  document.querySelectorAll('.freq-option[data-freq]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.freq-option[data-freq]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedFreq = btn.dataset.freq;
    });
  });

  // Optional "Events Near You" — clicking opens the existing proximity modal.
  // If the user sets an address + radius, MMERGE10 / MMERGE11 get sent at submit
  // time; otherwise the field stays empty and the digest goes out without filtering.
  const proxOpenBtn = document.getElementById('proxOpenBtn');
  if (proxOpenBtn) {
    proxOpenBtn.addEventListener('click', () => {
      const proxOverlay = document.getElementById('proxOverlay');
      if (proxOverlay) proxOverlay.classList.add('open');
    });
  }

  // Form submission -- builds Mailchimp signup URL
  document.getElementById("subscribeForm").addEventListener("submit", function(e) {
    e.preventDefault();
    var email = document.getElementById("subEmail").value.trim();
    var firstName = document.getElementById("subName").value.trim();
    var lastName = document.getElementById("subLastName").value.trim();
    var town = document.getElementById("subTown").value;
    var password = document.getElementById("subPassword").value;

    if (!email) return;

    var btn = document.querySelector("#subscribeForm button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Setting up your account...";

    // ── Step 1: Create Firebase Hub-Bub account (if password provided) ──
    var firebasePromise;
    if (password && password.length >= 6 && typeof firebase !== "undefined" && firebase.auth) {
      var fbAuth = firebase.auth();
      firebasePromise = fbAuth.createUserWithEmailAndPassword(email, password)
        .then(function(cred) {
          var displayName = firstName + (lastName ? " " + lastName : "");
          return cred.user.updateProfile({ displayName: displayName }).then(function() {
            return cred.user.sendEmailVerification();
          }).then(function() {
            // Save user profile to Firestore
            if (typeof firebase.firestore === "function") {
              return firebase.firestore().collection("users").doc(cred.user.uid).set({
                displayName: displayName,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                postCount: 0
              });
            }
          });
        })
        .catch(function(err) {
          // If email already in use, thats OK — continue to Mailchimp
          if (err.code === "auth/email-already-in-use") {
            console.log("Firebase account already exists for " + email + " — subscribing to newsletter only.");
            return;
          }
          console.warn("Firebase signup error:", err.message);
          // Non-blocking: still proceed to Mailchimp
        });
    } else {
      firebasePromise = Promise.resolve();
    }

    // ── Step 2: Subscribe to Mailchimp (after Firebase completes) ──
    firebasePromise.then(function() {
      btn.textContent = "Subscribing...";

      var MAILCHIMP_URL = "https://letpeopledecide.us15.list-manage.com/subscribe/post-json";
      var MAILCHIMP_U = "5d9192289b9af78822f2f69bf";
      var MAILCHIMP_ID = "f83dc56387";

      var params = new URLSearchParams();
      params.set("u", MAILCHIMP_U);
      params.set("id", MAILCHIMP_ID);
      params.set("EMAIL", email);
      if (firstName) params.set("FNAME", firstName);
      if (lastName) params.set("LNAME", lastName);
      if (town) params.set("MMERGE6", town);
      params.set("MMERGE9", selectedFreq);

      var hasProximity = window._proximityFilter && window._proximityFilter.isActive();
      if (hasProximity) {
        params.set("MMERGE10", window._proximityFilter.getAddress());
        params.set("MMERGE11", String(window._proximityFilter.getRadius()));
      }

      params.set("c", "mcCallback");

      // Remove any stale JSONP script from a previous attempt
      var oldScript = document.getElementById("mc-jsonp");
      if (oldScript) oldScript.remove();

      var mcTimeout;
      window.mcCallback = function(resp) {
        clearTimeout(mcTimeout);
        if (resp.result === "success" || resp.msg.indexOf("already subscribed") > -1) {
          document.querySelectorAll(".subscribe-section").forEach(function(s) { s.style.display = "none"; });
          document.querySelector(".subscribe-hero").style.display = "none";
          var success = document.getElementById("subscribeSuccess");
          success.classList.add("visible");
          var verifyNote = password && password.length >= 6
            ? " Your Hub-Bub forum account has been created — you can now log in to join local discussions."
            : "";
          success.querySelector("p").textContent =
            "We\x27ll send you a " + selectedFreq + " digest of meetings, news, and notices for the Telluride region. Keep an eye on " + email + " for your first one!" + verifyNote;
        } else {
          btn.disabled = false;
          btn.textContent = "Subscribe Now";
          alert("Subscription issue: " + resp.msg.replace(/<[^>]+>/g, ""));
        }
        var s = document.getElementById("mc-jsonp");
        if (s) s.remove();
      };

      var script = document.createElement("script");
      script.id = "mc-jsonp";
      script.src = MAILCHIMP_URL + "?" + params.toString();
      script.onerror = function() {
        clearTimeout(mcTimeout);
        btn.disabled = false;
        btn.textContent = "Subscribe Now";
        alert("Network error — please check your connection and try again.");
        var s = document.getElementById("mc-jsonp");
        if (s) s.remove();
      };
      // Timeout fallback if Mailchimp doesn't respond within 15 seconds
      mcTimeout = setTimeout(function() {
        if (btn.textContent === "Subscribing...") {
          btn.disabled = false;
          btn.textContent = "Subscribe Now";
          alert("The subscription request timed out. Please try again.");
          var s = document.getElementById("mc-jsonp");
          if (s) s.remove();
        }
      }, 15000);
      document.body.appendChild(script);
    });
  });
})();

// ══════════
// ══════════════════════════════════════════════════════
// ── Housing Search: curated long-term rental listings ──
// ══════════════════════════════════════════════════════
// Only long-term rentals. No short-term / vacation rentals.
// Each listing includes location coords for OSM map embed and contact info.

const HOUSING_LISTINGS = [
  /* ── Deed-Restricted For Sale — Applications Open ── */
  {
    title: '🏠 Silver Jack Unit 202 — 3BR Condo (Deed-Restricted)',
    type: 'deed-sale',
    lottery: true,
    address: '155 W Pacific Ave, Telluride, CO 81435',
    lat: 37.9378, lng: -107.8155,
    beds: '3 Bedroom, 2 Bath (1,330 sq ft)', price: '$405,507 (Tier 1, deed-restricted)',
    source: 'SMRHA',
    contact: { phone: '(970) 728-3034', email: 'admin@smrha.org' },
    url: 'https://smrha.org/lottery',
    applyUrl: 'https://smrha.org/lottery',
    deadline: 'April 10, 2026 at noon',
    drawingDate: 'April 24, 2026 at 10:00 AM',
    drawingLocation: 'SMRHA Office, 820 Black Bear Rd, Unit G17, Telluride',
    pickupLocation: '820 Black Bear Rd, Unit G17, Telluride (or download at smrha.org/lottery)',
    eligibility: 'Must work 1,400+ hrs/yr in San Miguel, Ouray, San Juan, or Montrose County · Must have lived in 4-county region 12+ months · Household income up to 220% AMI · Asset limits apply',
    note: 'Ownership lottery under Telluride Affordable Housing Guidelines. Applications available at smrha.org/lottery or pick up in person.'
  },
  {
    title: '🏠 Silver Jack Unit 205 — 2BR Condo (Deed-Restricted)',
    type: 'deed-sale',
    lottery: true,
    address: '155 W Pacific Ave, Telluride, CO 81435',
    lat: 37.9378, lng: -107.8155,
    beds: '2 Bedroom, 1 Bath (935 sq ft)', price: '$368,620 (Tier 1, deed-restricted)',
    source: 'SMRHA',
    contact: { phone: '(970) 728-3034', email: 'admin@smrha.org' },
    url: 'https://smrha.org/lottery',
    applyUrl: 'https://smrha.org/lottery',
    deadline: 'April 10, 2026 at noon',
    drawingDate: 'April 24, 2026 at 10:00 AM',
    drawingLocation: 'SMRHA Office, 820 Black Bear Rd, Unit G17, Telluride',
    pickupLocation: '820 Black Bear Rd, Unit G17, Telluride (or download at smrha.org/lottery)',
    eligibility: 'Must work 1,400+ hrs/yr in San Miguel, Ouray, San Juan, or Montrose County · Must have lived in 4-county region 12+ months · Household income up to 220% AMI · Asset limits apply',
    note: 'Ownership lottery under Telluride Affordable Housing Guidelines. Applications available at smrha.org/lottery or pick up in person.'
  },
  {
    title: '🏠 Element 52 SW-102 — 2BR Condo (Deed-Restricted)',
    type: 'deed-sale',
    lottery: true,
    address: '398 S Davis St, Telluride, CO 81435',
    lat: 37.9365, lng: -107.8118,
    beds: '2 Bedroom, 1 Bath (479 sq ft)', price: '$352,529 (Tier 2, deed-restricted)',
    source: 'SMRHA',
    contact: { phone: '(970) 728-3034', email: 'admin@smrha.org' },
    url: 'https://smrha.org/lottery',
    applyUrl: 'https://smrha.org/lottery',
    deadline: 'April 10, 2026 at noon',
    drawingDate: 'April 24, 2026 at 10:00 AM',
    drawingLocation: 'SMRHA Office, 820 Black Bear Rd, Unit G17, Telluride',
    pickupLocation: '820 Black Bear Rd, Unit G17, Telluride (or download at smrha.org/lottery)',
    eligibility: 'Must work 1,400+ hrs/yr in San Miguel, Ouray, San Juan, or Montrose County · Must have lived in 4-county region 12+ months · Household income up to 220% AMI · Asset limits apply',
    note: 'Ownership lottery under Telluride Affordable Housing Guidelines. Applications available at smrha.org/lottery or pick up in person.'
  },
  /* ── Deed-Restricted For Sale — SMRHA Property Listings ── */
  {
    title: '🏠 530 Society Dr Unit B — 3BR Duplex (Deed-Restricted)',
    type: 'deed-sale',
    address: '530 Society Dr Unit B, San Miguel County, CO 81435',
    lat: 37.9252, lng: -107.8335,
    beds: '3 Bedroom, 2 Bath (1,180 sq ft)', price: '$765,000 (deed-restricted)',
    source: 'SMRHA',
    contact: { phone: '(970) 728-3034', email: 'admin@smrha.org' },
    url: 'https://smrha.org/property-listings/',
    note: 'Deed-restricted single family duplex in San Miguel County. Contact SMRHA for eligibility and application details.'
  },
  {
    title: '🏠 1550 Juniper St — 2BR Home, Norwood (Deed-Restricted)',
    type: 'deed-sale',
    address: '1550 Juniper St, Norwood, CO 81423',
    lat: 38.1297, lng: -108.2867,
    beds: '2 Bedroom, 2 Bath (1,025 sq ft)', price: '$262,895 (deed-restricted)',
    source: 'SMRHA',
    contact: { phone: '(970) 728-3034', email: 'admin@smrha.org' },
    url: 'https://smrha.org/property-listings/',
    note: 'Deed-restricted home in Pinion Park, Norwood. Contact SMRHA for eligibility and application details.'
  },
  {
    title: '🏠 1545 Juniper St — 3BR Home, Norwood (Deed-Restricted)',
    type: 'deed-sale',
    address: '1545 Juniper St, Norwood, CO 81423',
    lat: 38.1297, lng: -108.2870,
    beds: '3 Bedroom, 3 Bath (1,216 sq ft)', price: '$381,000 (deed-restricted)',
    source: 'SMRHA',
    contact: { phone: '(970) 728-3034', email: 'admin@smrha.org' },
    url: 'https://smrha.org/property-listings/',
    note: 'Deed-restricted home in Pinion Park, Norwood. Contact SMRHA for eligibility and application details.'
  },
  {
    title: '🏠 1465 Paradox St — 3BR Home, Norwood (Deed-Restricted)',
    type: 'deed-sale',
    address: '1465 Paradox St, Norwood, CO 81423',
    lat: 38.1295, lng: -108.2855,
    beds: '3 Bedroom, 3 Bath (1,216 sq ft)', price: '$383,244 (deed-restricted)',
    source: 'SMRHA',
    contact: { phone: '(970) 728-3034', email: 'admin@smrha.org' },
    url: 'https://smrha.org/property-listings/',
    note: 'Deed-restricted home in Pinion Park, Norwood. Contact SMRHA for eligibility and application details.'
  },
  {
    title: '🏠 1435 Paradox St — 3BR Home, Norwood (Deed-Restricted)',
    type: 'deed-sale',
    address: '1435 Paradox St, Norwood, CO 81423',
    lat: 38.1294, lng: -108.2858,
    beds: '3 Bedroom, 3 Bath (1,216 sq ft)', price: '$380,523 (deed-restricted)',
    source: 'SMRHA',
    contact: { phone: '(970) 728-3034', email: 'admin@smrha.org' },
    url: 'https://smrha.org/property-listings/',
    note: 'Deed-restricted home in Pinion Park, Norwood. Contact SMRHA for eligibility and application details.'
  },
  {
    title: '🏠 1560 Juniper St — 3BR Home, Norwood (Deed-Restricted)',
    type: 'deed-sale',
    address: '1560 Juniper St, Norwood, CO 81423',
    lat: 38.1298, lng: -108.2864,
    beds: '3 Bedroom, 3 Bath (1,216 sq ft)', price: '$395,000 (deed-restricted)',
    source: 'SMRHA',
    contact: { phone: '(970) 728-3034', email: 'admin@smrha.org' },
    url: 'https://smrha.org/property-listings/',
    note: 'Deed-restricted home in Pinion Park, Norwood. Contact SMRHA for eligibility and application details.'
  },
  /* ── Public / Deed-Restricted Rentals ── */
  {
    title: 'Room for Rent — In-Town 2BR Condo',
    type: 'deed-rental',
    address: 'Telluride, CO 81435 (in-town)',
    lat: 37.9375, lng: -107.8123,
    beds: '1 Room in 2BR', price: '$1,883/mo (deed-restricted)',
    source: 'SMRHA',
    contact: { phone: '(970) 728-3034', email: 'admin@smrha.org' },
    url: 'https://smrha.org/property/in-town-room-for-rent-telluride-co-81435/',
    note: 'Deed-restricted room rental in shared 2BR condo. Contact SMRHA for eligibility.'
  },
  {
    title: 'Village Court Apartments — Waitlist',
    type: 'deed-rental',
    address: '455 Mountain Village Blvd, Mountain Village, CO 81435',
    lat: 37.9325, lng: -107.8497,
    beds: 'Studio–3 Bedroom', price: 'Income-based (deed-restricted)',
    source: 'Town of Mountain Village',
    contact: { phone: '(970) 729-3419', email: '' },
    url: 'https://townofmountainvillage.com/community/housing/village-court-apartments/',
    note: 'Waitlist is currently capped — not accepting new applications. Check back periodically.'
  },
  {
    title: 'Shandoka Townhomes — Waitlist',
    type: 'deed-rental',
    address: '820 Black Bear Rd, Telluride, CO 81435',
    lat: 37.9363, lng: -107.8198,
    beds: '1–3 Bedroom', price: 'Income-based (deed-restricted)',
    source: 'Town of Telluride',
    contact: { phone: '(970) 728-4025', email: 'housing@telluride.gov' },
    url: 'https://www.telluride.gov/745/Town-Owned-Rental-Properties',
    note: 'Waitlist-based. Town employee priority. Apply through the Town of Telluride.'
  },
  {
    title: 'Virginia Placer Apartments — Waitlist',
    type: 'deed-rental',
    address: 'Virginia Placer, Telluride, CO 81435',
    lat: 37.9380, lng: -107.8260,
    beds: 'Studio–2 Bedroom', price: 'Income-based (deed-restricted)',
    source: 'Town of Telluride',
    contact: { phone: '(970) 728-4025', email: 'housing@telluride.gov' },
    url: 'https://www.telluride.gov/745/Town-Owned-Rental-Properties',
    note: 'Waitlist-based. Apply through the Town of Telluride Rental Housing division.'
  },
  /* ── Market-Rate Active Listings ── */
  {
    title: 'Luxury Condo — 395 E Colorado Ave',
    type: 'market-rental',
    address: '395 E Colorado Ave, Telluride, CO 81435',
    lat: 37.9375, lng: -107.8095,
    beds: '3 Bedroom', price: '$2,500/mo',
    source: 'Craigslist',
    contact: {},
    url: 'https://westslope.craigslist.org/apa/d/telluride-luxury-condo/7924056218.html',
    note: 'Long-term rental. 3BR condo on E Colorado Ave. Verify availability directly.'
  },
  {
    title: '1BR Apartment — 545 W Pacific Ave',
    type: 'market-rental',
    address: '545 W Pacific Ave, Telluride, CO 81435',
    lat: 37.9378, lng: -107.8155,
    beds: '1 Bedroom', price: '$1,500/mo',
    source: 'Craigslist',
    contact: {},
    url: 'https://westslope.craigslist.org/apa/d/telluride-look-no-further-than-this/7919977718.html',
    note: 'Long-term rental. 1BR on W Pacific Ave. Verify availability directly.'
  },
  {
    title: '3BR House — 280 Mahoney Dr',
    type: 'market-rental',
    address: '280 Mahoney Dr, Telluride, CO 81435',
    lat: 37.9410, lng: -107.8170,
    beds: '3 Bedroom', price: '$3,901/mo',
    source: 'Apartments.com',
    contact: {},
    url: 'https://www.apartments.com/280-mahoney-dr-telluride-co/zq5w36n/',
    note: 'Market-rate long-term rental. Contact listing agent on Apartments.com.'
  },
  {
    title: '1BR — 107 W Columbia Ave',
    type: 'market-rental',
    address: '107 W Columbia Ave, Telluride, CO 81435',
    lat: 37.9373, lng: -107.8128,
    beds: '1 Bedroom', price: '$2,874/mo',
    source: 'Apartments.com',
    contact: {},
    url: 'https://www.apartments.com/107-w-columbia-ave-telluride-co/f1l2ss1/',
    note: 'Market-rate long-term rental in downtown Telluride.'
  }
];

let currentHousingFilter = 'all';

function renderHousingListings() {
  const container = document.getElementById('housing-listings-content');
  if (!container) return;
  let filtered = HOUSING_LISTINGS;
  if (currentHousingFilter !== 'all') {
    filtered = HOUSING_LISTINGS.filter(h => h.type === currentHousingFilter);
  }
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state">No listings match this filter.</div>';
    return;
  }
  let html = '';
  filtered.forEach(h => {
    const typeLabels = { 'deed-rental': 'Deed-Restricted Rental', 'deed-sale': 'Deed-Restricted For Sale', 'market-rental': 'Market Rental' };
    const sourceClass = h.type.startsWith('market') ? 'market' : 'public';
    const sourceLabel = typeLabels[h.type] || h.type;
    // Contact buttons
    let contactHtml = '';
    if (h.contact && h.contact.phone) {
      contactHtml += '<a href="tel:' + h.contact.phone.replace(/[^+\d]/g, '') + '" class="housing-contact-btn primary">📞 ' + h.contact.phone + '</a>';
    }
    if (h.contact && h.contact.email) {
      contactHtml += '<a href="mailto:' + h.contact.email + '" class="housing-contact-btn primary">✉️ Email</a>';
    }
    contactHtml += '<a href="' + h.url + '" target="_blank" rel="noopener" class="housing-contact-btn secondary">🔗 View Listings</a>';
    // OSM map embed
    const mapUrl = 'https://www.openstreetmap.org/export/embed.html?bbox=' +
      (h.lng - 0.008) + ',' + (h.lat - 0.005) + ',' + (h.lng + 0.008) + ',' + (h.lat + 0.005) +
      '&layer=mapnik&marker=' + h.lat + ',' + h.lng;

    // Build lottery info block if applicable
    let lotteryHtml = '';
    if (h.lottery) {
      lotteryHtml = '<div class="housing-lottery-info">' +
        '<div class="lottery-banner">🏠 DEED-RESTRICTED FOR SALE — Applications Open</div>' +
        '<dl class="lottery-details">' +
          '<dt>📅 Application Deadline</dt><dd><strong>' + h.deadline + '</strong></dd>' +
          '<dt>🎲 Lottery Drawing</dt><dd>' + h.drawingDate + '</dd>' +
          '<dt>📍 Drawing Location</dt><dd>' + h.drawingLocation + '</dd>' +
          '<dt>📋 Pick Up Application</dt><dd>' + h.pickupLocation + '</dd>' +
          '<dt>✅ Eligibility</dt><dd>' + h.eligibility + '</dd>' +
        '</dl>' +
        '<a href="' + h.applyUrl + '" target="_blank" rel="noopener" class="lottery-apply-btn">📝 Apply Now — Get Application</a>' +
      '</div>';
    }

    html += '<div class="housing-card' + (h.lottery ? ' lottery' : '') + '" data-type="' + h.type + '">' +
      '<div class="housing-card-header">' +
        '<div class="housing-card-title">' + h.title + '</div>' +
        '<span class="housing-card-source ' + sourceClass + '">' + sourceLabel + '</span>' +
      '</div>' +
      lotteryHtml +
      '<dl class="housing-card-details">' +
        '<dt>Address</dt><dd>' + h.address + '</dd>' +
        '<dt>Bedrooms</dt><dd>' + h.beds + '</dd>' +
        '<dt>Price</dt><dd>' + h.price + '</dd>' +
        '<dt>Source</dt><dd>' + h.source + '</dd>' +
      '</dl>' +
      '<div class="housing-card-map"><iframe src="' + mapUrl + '" loading="lazy" title="Map: ' + h.title + '"></iframe></div>' +
      '<div class="housing-card-contact">' + contactHtml + '</div>' +
      (h.note ? '<div class="housing-card-note">' + h.note + '</div>' : '') +
    '</div>';
  });
  container.innerHTML = html;
}

// Housing filter chips
document.querySelectorAll('[data-housing-filter]').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('[data-housing-filter]').forEach(c => c.className = 'chip');
    const f = chip.dataset.housingFilter;
    if (f === 'all') chip.classList.add('active-all');
    else chip.classList.add('active-topic');
    currentHousingFilter = f;
    renderHousingListings();
  });
});

// Render on first load
renderHousingListings();

// ── Init ──
// ══════════

let currentMeetingFilter = 'all';

async function init() {
  const lastUpdatedEl = document.getElementById('lastUpdated');
  if (lastUpdatedEl) lastUpdatedEl.textContent =
    'Last refreshed: ' + new Date().toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });

  // ── Legal Notices render instantly (static cache) ──
  renderLegalNoticesWithTopic();
  renderLegalInterestSidebar();

  // ── Cached sources load instantly ──
  const smartMeetings = getSmartMeetings();
  const mvMeetings = getMVMeetings();
  const schoolMeetings = getSchoolMeetings();
  const fireMeetings = getFireMeetings();
  const medMeetings = getMedMeetings();
  const norwoodMeetings = getNorwoodMeetings();
  const ophirMeetings = getOphirMeetings();
  const airportMeetings = getAirportMeetings();
  const countyCachedMeetings = getCountyCachedMeetings();
  const localGroupMeetings = generateLocalGroupMeetings();
  // HARC meetings (getTellurideMeetings) show instantly from cache; replaced
  // by the full CivicWeb live set when telluridePromise resolves below.
  const tellurideCachedMeetings = getTellurideMeetings();
  // Ridgway cached meetings show instantly; replaced by Localist live data
  // when newsPromise resolves and re-tags oray→ridgway items.
  const ridgwayCachedMeetings = getRidgwayMeetings();
  allMeetings = [...smartMeetings, ...mvMeetings, ...schoolMeetings, ...fireMeetings, ...medMeetings, ...norwoodMeetings, ...ophirMeetings, ...airportMeetings, ...countyCachedMeetings, ...localGroupMeetings, ...tellurideCachedMeetings, ...ridgwayCachedMeetings];
  window.__allMeetingsCache = allMeetings;
  renderMeetingsWithTopic();
  updateTopicCounts();

  // ── START: Load AI-generated summaries from Cloud Functions/Firestore ──
  // This runs in the background; when loaded, it re-renders meeting cards
  // with Claude-generated summaries (falling back to manual if unavailable).
  loadAISummaries();
  // ── END: Load AI summaries ──

  // ── Then progressively add County RSS (~0.3s) and Telluride (~2.5s) ──
  const countyPromise = fetchCountyMeetings();
  const telluridePromise = fetchTellurideMeetings();
  const newsPromise = fetchAllNews();

  countyPromise.then(rssMeetings => {
    // Remove cached county meetings, replace with merged set
    const nonCounty = allMeetings.filter(m => m.source !== 'county');
    const merged = mergeCountyMeetings(rssMeetings, countyCachedMeetings);
    allMeetings = [...nonCounty, ...merged];
    window.__allMeetingsCache = allMeetings;
    renderMeetingsWithTopic();
    updateTopicCounts();
  }).catch(err => console.error('countyPromise failed:', err));

  telluridePromise.then(tellurideMeetings => {
    // Strip the instant-load cached Telluride entries (HARC only) before
    // replacing with the full CivicWeb set (TC + P&Z + HARC + all others).
    // This mirrors the county merge pattern and prevents HARC duplicates.
    allMeetings = [...allMeetings.filter(m => m.source !== 'telluride'), ...tellurideMeetings];
    window.__allMeetingsCache = allMeetings;
    renderMeetingsWithTopic();
    updateTopicCounts();
  }).catch(err => console.error('telluridePromise failed:', err));

  // Render festival calendar immediately (doesn't depend on fetched data)
  try { renderFestivalCalendar(); } catch(e) { console.error('initial renderFestivalCalendar error:', e); }
  try { renderUpcomingEventsSidebar(); } catch(e) { console.error('initial renderUpcomingEventsSidebar error:', e); }

  newsPromise.then(newsData => {
    allNews = newsData;
    window.__allNewsCache = allNews;
    // Pipe Ouray-Ridgway government meetings (Ridgway Town Council, Ouray
    // Planning Commission, etc.) into the Gov-Hub tab. These come through
    // the news pipeline (Localist API) but belong on /#tab-meetings, not
    // /#tab-news. renderNews() filters them out of the Events tab.
    //
    // Each routed item is re-tagged with source='ouray' or source='ridgway'
    // based on its location so the right-sidebar can filter the two towns
    // separately.
    const orayGovRaw = newsData.filter(n => n.source === 'oray' && isGovernmentalMeeting(n));
    if (orayGovRaw.length) {
      // Month name array for RIDGWAY_AGENDA_MAP key formatting
      const _ridgwayMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const orayGovMeetings = orayGovRaw.map(m => {
        const loc = (m.location || '').toLowerCase();
        // Ridgway-area markers: "Ridgway", "Log Hill" (Log Hill Mesa is part
        // of Ridgway's service area).
        const isRidgway = /\bridgway\b|\blog hill\b/.test(loc);
        const town = isRidgway ? 'ridgway' : 'ouray';
        const label = isRidgway ? 'Ridgway' : 'Ouray';
        let agendaLink = m.agendaLink || null;
        let hasAgenda = m.hasAgenda || false;
        // For Ridgway Town Council meetings, look up the agenda PDF in
        // RIDGWAY_AGENDA_MAP (keyed "Month D, YYYY").
        if (isRidgway && typeof RIDGWAY_AGENDA_MAP !== 'undefined') {
          const d = m.eventDate instanceof Date ? m.eventDate : (m.pubDate instanceof Date ? m.pubDate : null);
          if (d && !isNaN(d.getTime())) {
            const dateKey = `${_ridgwayMonths[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
            const mappedUrl = RIDGWAY_AGENDA_MAP[dateKey];
            if (mappedUrl) { agendaLink = mappedUrl; hasAgenda = true; }
          }
        }
        return Object.assign({}, m, { source: town, sourceLabel: label, agendaLink, hasAgenda });
      });
      // Idempotent on re-render: filter prior re-tags AND any old 'oray'
      // entries before re-adding.
      allMeetings = allMeetings.filter(m => m.source !== 'ouray' && m.source !== 'ridgway' && m.source !== 'oray');
      allMeetings = [...allMeetings, ...orayGovMeetings];
      window.__allMeetingsCache = allMeetings;
      try { renderMeetingsWithTopic(); } catch(e) { console.error('renderMeetingsWithTopic re-render after oray gov inject:', e); }
    }
    try { renderNewsWithTopic(); } catch(e) { console.error('renderNewsWithTopic error:', e); }
    try { updateTopicCounts(); } catch(e) { console.error('updateTopicCounts error:', e); }
    try { updateEventsHeroFestivals(); } catch(e) { console.error('updateEventsHeroFestivals error:', e); }
    try { renderFestivalCalendar(); } catch(e) { console.error('renderFestivalCalendar error:', e); }
    try { renderUpcomingEventsSidebar(); } catch(e) { console.error('renderUpcomingEventsSidebar error:', e); }
  }).catch(err => {
    console.error('newsPromise failed:', err);
    // Still render festival calendar and upcoming events sidebar even if news fetch fails
    try { renderFestivalCalendar(); } catch(e) { console.error('renderFestivalCalendar fallback error:', e); }
    try { renderUpcomingEventsSidebar(); } catch(e) { console.error('renderUpcomingEventsSidebar fallback error:', e); }
  });

  // Local News tab uses hardcoded article data — render immediately
  try { renderLocalNews(null, currentLocalNewsFilter); } catch(e) { console.error("renderLocalNews init error:", e); }

  // Blog sidebar — render from hardcoded BLOG_POSTS data (no external RSS dependency)
  try { renderBlogSidebar([]); } catch(e) { console.error('renderBlogSidebar error:', e); }

  // Populate KOTO intro logo from ENTITY_LOGOS (avoids broken external URL)
  const kotoIntroEl = document.getElementById('kotoIntroLogo');
  if (kotoIntroEl && ENTITY_LOGOS.koto) {
    const tmp = document.createElement('div');
    tmp.innerHTML = ENTITY_LOGOS.koto;
    const img = tmp.querySelector('img');
    if (img) { img.style.height = '22px'; img.style.width = 'auto'; kotoIntroEl.appendChild(img); }
  }
}

// ══════════════════════════════════════════════════════
// ── Left Sidebar: This Week + Deadlines ──
// ══════════════════════════════════════════════════════

// ── Telluride-area Festival Calendar ──
// Major festivals get top billing when they fall in the upcoming window.
// month is 0-indexed (0=Jan). dayStart/dayEnd are inclusive date ranges.
// These are approximate annual dates -- update yearly as schedules are confirmed.
// ticketStatus: 'on-sale' = yellow "Buy Passes Now!", 'sold-out' = rust "Passes", 'default' = green original label
function getUpcomingFestivals(now, daysAhead) {
  const results = [];
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + daysAhead);
  const year = now.getFullYear();

  TELLURIDE_FESTIVALS.forEach(f => {
    // Check this year and possibly next year for wrapping
    [year, year + 1].forEach(y => {
      const start = new Date(y, f.month, f.dayStart);
      // Support festivals spanning two months (e.g. MusicFest June 28 – July 5)
      const eMonth = f.endMonth !== undefined ? f.endMonth : f.month;
      const end = new Date(y, eMonth, f.dayEnd, 23, 59, 59);
      // Festival is upcoming if it starts within our window, or is currently happening
      if ((start >= now && start <= cutoff) || (start <= now && end >= now)) {
        const daysUntil = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
        results.push({
          name: f.name,
          icon: f.icon,
          logo: f.logo || '',
          start,
          end,
          daysUntil: daysUntil < 0 ? 0 : daysUntil,
          happening: start <= now && end >= now,
          url: f.url || '',
          ticketUrl: f.ticketUrl || '',
          ticketLabel: f.ticketLabel || 'Get Tickets',
          promo: f.promo || ''
        });
      }
    });
  });
  return results.sort((a, b) => a.start - b.start);
}

// Get ALL festivals (not just upcoming) for full calendar/promo display
function getAllFestivalsForYear(year) {
  return TELLURIDE_FESTIVALS.map(f => {
    const start = new Date(year, f.month, f.dayStart);
    const eMonth = f.endMonth !== undefined ? f.endMonth : f.month;
    const end = new Date(year, eMonth, f.dayEnd, 23, 59, 59);
    const now = new Date();
    const daysUntil = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
    return {
      name: f.name,
      icon: f.icon,
      logo: f.logo || '',
      start,
      end,
      daysUntil: daysUntil < 0 ? 0 : daysUntil,
      happening: start <= now && end >= now,
      passed: end < now,
      url: f.url || '',
      ticketUrl: f.ticketUrl || '',
      ticketLabel: f.ticketLabel || 'Get Tickets',
      ticketStatus: f.ticketStatus || 'default',
      promo: f.promo || ''
    };
  }).sort((a, b) => a.start - b.start);
}

// ── Populate the Upcoming Community Events sidebar (Events tab, left sidebar) ──
// (Wix RSS feed removed — blog sidebar now uses only hardcoded BLOG_POSTS data)

// ── Render the Livable Telluride News sidebar ──
function renderBlogSidebar(rssPosts) {
  var container = document.getElementById('sidebarBlogPosts');
  if (!container) return;

  // Merge RSS posts with hardcoded posts, newest first
  // Hardcoded posts have curated summaries and take priority
  // Only add RSS posts that don't match any hardcoded post by title
  var allPosts = [...BLOG_POSTS];
  if (rssPosts && rssPosts.length > 0) {
    var existingTitles = new Set(allPosts.map(function(p) {
      return p.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
    }));
    rssPosts.forEach(function(rp) {
      var normTitle = rp.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
      if (!existingTitles.has(normTitle)) {
        allPosts.unshift(rp); // Truly new posts go to top
        existingTitles.add(normTitle);
      }
    });
  }

  // Sort by date descending (newest first)
  allPosts.sort(function(a, b) {
    var da = new Date(a.date);
    var db = new Date(b.date);
    if (isNaN(da)) return 1;
    if (isNaN(db)) return -1;
    return db - da;
  });

  var html = '';
  allPosts.forEach(function(post) {
    var imgHtml = post.image
      ? '<img src="' + post.image + '" alt="' + post.title.replace(/"/g, '&quot;') + '" loading="lazy" onerror="this.style.display=\'none\'">'
      : '<div style="height:80px;background:linear-gradient(135deg,rgba(33,68,60,0.08),rgba(166,143,87,0.12));display:grid;place-items:center;color:var(--text-muted);font-size:1.5rem;">📝</div>';

    html += '<a href="' + post.url + '" target="_blank" rel="noopener" class="blog-sidebar-card">' +
      imgHtml +
      '<div class="blog-card-body">' +
        '<div class="blog-card-title">' + post.title + '</div>' +
        '<div class="blog-card-summary">' + post.summary + '</div>' +
        '<div class="blog-card-meta">' + (post.date || '') + (post.readTime ? ' · ' + post.readTime : '') + '</div>' +
      '</div>' +
    '</a>';
  });

  container.innerHTML = html;
}

function renderUpcomingEventsSidebar() {
  var container = document.getElementById('upcomingEventsContent');
  if (!container) return;

  var today = new Date();
  today.setHours(0, 0, 0, 0);

  // Helper: exclude minor/small-group events (Wilkinson, Ah Haa, classes, workshops, etc.)
  function isMinorEvent(title, source, location, description) {
    var all = ((title || '') + ' ' + (source || '') + ' ' + (location || '') + ' ' + (description || '')).toLowerCase();
    // Exclude Wilkinson Public Library and Ah Haa School events
    if (/wilkinson|wilkenson/.test(all)) return true;
    if (/ah\s*ha[ah]/.test(all)) return true;
    // Exclude small-group / class / workshop style events
    if (/\b(class|classes|workshop|workshops|seminar|lecture series|book club|story\s*time|storytime|craft\s*circle|knitting|quilting|yoga|meditation|tai\s*chi|pilates|open\s*mic|trivia\s*night|game\s*night|potluck|bingo)\b/.test(all)) return true;
    return false;
  }

  // Collect notable community events (future only) — major fundraisers/charity events only
  var events = [];
  if (typeof COMMUNITY_EVENTS !== 'undefined') {
    COMMUNITY_EVENTS.forEach(function(ev) {
      if (!ev.notable) return;
      var d = localDate(ev.date);
      if (!d || d < today) return;
      if (isMinorEvent(ev.title, ev.source, ev.location, ev.copy)) return;
      events.push({
        title: ev.title,
        source: ev.source || '',
        date: d,
        endDate: ev.endDate ? localDate(ev.endDate) : null,
        location: ev.location || '',
        href: ev.href || '',
        beneficiary: ev.beneficiary || '',
        sponsors: ev.sponsors || '',
        copy: ev.copy || '',
        eventTimes: ev.eventTimes || ''
      });
    });
  }

  // Also pull notable items from fetched community events (allNews)
  if (typeof allNews !== 'undefined' && allNews.length > 0) {
    allNews.forEach(function(item) {
      if (!item.category || !/community event/i.test(item.category)) return;
      if (!item.pubDate || item.pubDate < today) return;
      // Exclude minor/small-group events
      if (isMinorEvent(item.title, item.sourceLabel || item.source, item.location, (item.description || '') + ' ' + (item.summary || ''))) return;
      // Check if it's already in COMMUNITY_EVENTS by title
      var titleLow = (item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30);
      var isDupe = events.some(function(e) {
        return e.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30) === titleLow;
      });
      if (isDupe) return;
      // Include community events that are meaningful gatherings (not minor classes/workshops)
      // The isMinorEvent filter above already excludes library classes, yoga, workshops, etc.
      events.push({
        title: item.title,
        source: item.sourceLabel || item.source || '',
        date: item.pubDate,
        endDate: item.endDate || null,
        location: item.location || '',
        href: item.link || '',
        beneficiary: '',
        sponsors: '',
        copy: item.description || item.summary || '',
        eventTimes: item.eventTimes || ''
      });
    });
  }

  // Sort by date ascending, limit to next 5
  events.sort(function(a, b) { return a.date - b.date; });
  events = events.slice(0, 5);

  if (events.length === 0) {
    var parentCard = document.getElementById('sidebarUpcomingEvents');
    if (parentCard) parentCard.style.display = 'none';
    return;
  }

  var html = '';
  events.forEach(function(ev) {
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var monthStr = months[ev.date.getMonth()];
    var dayStr = ev.date.getDate();

    // Days until
    var diff = Math.ceil((ev.date - today) / 86400000);
    var countdown = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff + ' days away';

    // Formatted date range
    var dateDisplay = monthStr + ' ' + dayStr + ', ' + ev.date.getFullYear();
    if (ev.endDate && ev.endDate > ev.date) {
      dateDisplay += ' — ' + months[ev.endDate.getMonth()] + ' ' + ev.endDate.getDate();
    }

    html += '<a href="' + (ev.href || '#') + '" target="_blank" rel="noopener" style="display:block;text-decoration:none;color:inherit;padding:10px;border-radius:12px;border:1.5px solid rgba(33,68,60,0.12);background:rgba(255,255,255,0.7);transition:border-color 0.18s,box-shadow 0.18s;" onmouseover="this.style.borderColor=\'rgba(47,86,77,0.35)\';this.style.boxShadow=\'0 4px 12px rgba(47,86,77,0.1)\'" onmouseout="this.style.borderColor=\'rgba(33,68,60,0.12)\';this.style.boxShadow=\'none\'">' +
      '<div style="display:flex;gap:10px;align-items:flex-start;">' +
        '<div style="flex-shrink:0;width:52px;height:58px;border-radius:10px;background:linear-gradient(180deg,var(--accent-green),#1a3e36);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(33,68,60,0.2);">' +
          '<div style="font-size:0.69rem;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;line-height:1;margin-bottom:1px;">' + monthStr + '</div>' +
          '<div style="font-size:1.375rem;font-weight:900;line-height:1;">' + dayStr + '</div>' +
        '</div>' +
        '<div style="min-width:0;">' +
          '<div style="font-size:0.975rem;font-weight:800;color:var(--text-primary);line-height:1.3;margin-bottom:2px;">' + ev.title + '</div>' +
          '<div style="font-size:0.81rem;color:var(--text-muted);line-height:1.3;">' + ev.source + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:4px;">' +
        '<span style="font-size:0.775rem;padding:3px 8px;border-radius:6px;background:rgba(33,68,60,0.08);color:var(--forest);font-weight:700;">' + countdown + '</span>' +
        (ev.eventTimes ? '<span style="font-size:0.775rem;padding:3px 8px;border-radius:6px;background:rgba(166,143,87,0.12);color:#8b7332;font-weight:600;">⏰ ' + ev.eventTimes + '</span>' : '') +
      '</div>' +
      (ev.beneficiary ? '<div style="margin-top:6px;font-size:0.81rem;color:var(--text-secondary);line-height:1.35;">❤️ <strong>Benefits:</strong> ' + ev.beneficiary + '</div>' : '') +
      (ev.location ? '<div style="font-size:0.775rem;color:var(--text-muted);margin-top:3px;">📍 ' + ev.location + '</div>' : '') +
      (ev.sponsors ? '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:3px;font-style:italic;">Sponsored by ' + ev.sponsors + '</div>' : '') +
    '</a>';
  });

  container.innerHTML = html;
}

// ── Populate the Events tab hero with upcoming festival countdowns ──
function updateEventsHeroFestivals() {
  const container = document.getElementById('eventsHeroFestivals');
  if (!container) return;
  const upcoming = getUpcomingFestivals(new Date(), 120); // look ahead ~4 months
  if (upcoming.length === 0) { container.style.display = 'none'; return; }

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let html = '<div style="font-size:0.8rem;font-weight:700;color:var(--text-primary);margin-bottom:6px;">Coming Up</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">';
  upcoming.slice(0, 4).forEach(f => {
    const dateLabel = monthNames[f.start.getMonth()] + ' ' + f.start.getDate();
    let timing;
    if (f.happening) {
      timing = '<span style="color:#b45309;font-weight:700;">Happening now!</span>';
    } else if (f.daysUntil <= 7) {
      timing = '<span style="color:#b45309;font-weight:600;">This week!</span>';
    } else if (f.daysUntil <= 30) {
      timing = f.daysUntil + ' days away';
    } else {
      timing = dateLabel;
    }
    const logoHtml = f.logo
      ? '<div style="width:100%;height:56px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:6px;margin-bottom:4px;"><img src="' + f.logo + '" alt="' + f.name + '" style="max-width:100%;max-height:56px;object-fit:contain;" onerror="this.parentElement.innerHTML=\'<span style=font-size:1.8rem>' + f.icon + '</span>\'"></div>'
      : '<div style="font-size:1.8rem;margin-bottom:4px;">' + f.icon + '</div>';
    const linkUrl = f.url || f.ticketUrl || '';
    if (linkUrl) {
      html += '<a href="' + linkUrl + '" target="_blank" rel="noopener" style="background:rgba(255,255,255,0.7);border-radius:8px;padding:8px 10px;text-align:center;text-decoration:none;color:inherit;">'
        + logoHtml
        + '<div style="font-size:0.75rem;font-weight:700;color:var(--text-primary);line-height:1.3;margin:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + f.name + '</div>'
        + '<div style="font-size:0.7rem;color:var(--text-muted);">' + timing + '</div>'
        + '</a>';
    } else {
      html += '<div style="background:rgba(255,255,255,0.7);border-radius:8px;padding:8px 10px;text-align:center;">'
        + logoHtml
        + '<div style="font-size:0.75rem;font-weight:700;color:var(--text-primary);line-height:1.3;margin:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + f.name + '</div>'
        + '<div style="font-size:0.7rem;color:var(--text-muted);">' + timing + '</div>'
        + '</div>';
    }
  });
  html += '</div>';
  container.innerHTML = html;
  container.style.display = 'block';
}

// ── Build the full Festival Calendar section below the hero ──
function renderFestivalCalendar() {
  const container = document.getElementById('sidebarFestivalCalendar');
  if (!container) return;
  const year = new Date().getFullYear();
  const festivals = getAllFestivalsForYear(year);
  // Sort by date — soonest event first
  festivals.sort((a, b) => a.start - b.start);
  const monthShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  let html = '';
  festivals.forEach((f, idx) => {
    const startM = monthShort[f.start.getMonth()];
    const endM = monthShort[f.end.getMonth()];
    const dateRange = startM === endM
      ? startM + ' ' + f.start.getDate() + '–' + f.end.getDate()
      : startM + ' ' + f.start.getDate() + ' – ' + endM + ' ' + f.end.getDate();

    // Status badge
    let statusBadge = '';
    if (f.happening) {
      statusBadge = '<div style="display:inline-block;padding:2px 8px;background:#b45309;color:#fff;border-radius:10px;font-size:0.6rem;font-weight:700;margin-top:4px;">HAPPENING NOW</div>';
    } else if (f.passed) {
      statusBadge = '<div style="display:inline-block;padding:2px 8px;background:var(--text-muted);color:#fff;border-radius:10px;font-size:0.6rem;font-weight:600;margin-top:4px;opacity:0.6;">PAST</div>';
    } else if (f.daysUntil <= 14) {
      statusBadge = '<div style="display:inline-block;padding:2px 8px;background:#b45309;color:#fff;border-radius:10px;font-size:0.6rem;font-weight:600;margin-top:4px;">COMING SOON</div>';
    }

    const opacity = f.passed ? 'opacity:0.5;' : '';
    // Featured style for first upcoming (non-passed) festival
    const isFeatured = !f.passed && idx === festivals.findIndex(x => !x.passed);
    const cardBorder = isFeatured ? 'border-color:rgba(198,148,55,0.4);' : '';
    const cardBg = isFeatured ? 'background:linear-gradient(180deg,rgba(255,255,255,0.98),rgba(249,246,240,0.92));' : 'background:rgba(255,255,255,0.92);';

    // Logo box: image or wordmark fallback
    const logoInner = f.logo
      ? '<img src="' + f.logo + '" alt="' + f.name + '" style="width:100%;height:100%;object-fit:contain;display:block;" onerror="this.parentElement.innerHTML=\'<div style=font-weight:900;font-size:0.7rem;line-height:1.1;letter-spacing:-0.02em;text-align:center;color:var(--text-primary)>' + f.name.split(' ').slice(0,2).join('<br>').replace(/'/g,'') + '</div>\'">'
      : '<div style="font-weight:900;font-size:0.72rem;line-height:1.1;letter-spacing:-0.02em;text-align:center;color:var(--text-primary);">' + f.name.split(' ').slice(0,2).join('<br>') + '</div>';

    // Buy button — color depends on ticketStatus
    let buyBtn = '';
    if (f.ticketUrl) {
      let btnBg, btnColor, btnLabel, btnShadow;
      if (f.passed) {
        // Past event — no button
        btnBg = ''; btnLabel = '';
      } else if (f.ticketStatus === 'on-sale') {
        // Yellow pill — tickets/passes available now
        btnBg = 'linear-gradient(135deg,#d4a017,#b8860b)';
        btnColor = '#fff';
        btnLabel = 'Buy Passes Now!';
        btnShadow = '0 8px 16px rgba(180,130,20,0.25)';
      } else if (f.ticketStatus === 'sold-out') {
        // Rust/red pill — sold out, links to site
        btnBg = 'linear-gradient(135deg,#a0522d,#8b3a2a)';
        btnColor = '#fff';
        btnLabel = 'Passes Sold Out';
        btnShadow = '0 8px 16px rgba(139,58,42,0.2)';
      } else {
        // Default green pill — original style
        btnBg = 'linear-gradient(135deg,#2f564d,#22453e)';
        btnColor = '#fff';
        btnLabel = f.icon + ' ' + (f.ticketLabel || 'Buy Tickets');
        btnShadow = '0 8px 16px rgba(34,69,62,0.2)';
      }
      if (!f.passed && btnLabel) {
        buyBtn = '<a href="' + f.ticketUrl + '" target="_blank" rel="noopener" onclick="event.stopPropagation();" style="display:flex;align-items:center;justify-content:center;gap:6px;width:100%;min-height:38px;padding:0 12px;border-radius:10px;text-decoration:none;font-weight:800;font-size:0.78rem;letter-spacing:-0.01em;color:' + btnColor + ';background:' + btnBg + ';box-shadow:' + btnShadow + ';">' + btnLabel + '</a>';
      }
    }

    // Festival site link chip
    let siteChip = '';
    if (f.url && !f.passed) {
      siteChip = '<a href="' + f.url + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:0 10px;border-radius:8px;text-decoration:none;font-size:0.68rem;font-weight:800;color:var(--forest);background:rgba(39,69,63,0.07);border:1px solid rgba(39,69,63,0.12);white-space:nowrap;">Festival Site</a>';
    }

    html += '<div style="border:1px solid rgba(221,210,196,0.85);border-radius:16px;overflow:hidden;box-shadow:0 6px 16px rgba(32,48,45,0.08);' + cardBg + cardBorder + opacity + '">'
      // Top section: logo + meta
      + '<div style="padding:12px 12px 6px;display:grid;grid-template-columns:56px 1fr;gap:10px;align-items:center;' + (isFeatured ? 'background:linear-gradient(180deg,rgba(198,148,55,0.07),rgba(198,148,55,0));' : '') + '">'
        + '<div style="width:56px;height:56px;border-radius:14px;background:linear-gradient(180deg,#ffffff,#f6f3ee);border:1px solid rgba(221,210,196,0.95);display:grid;place-items:center;overflow:hidden;padding:5px;">'
          + logoInner
        + '</div>'
        + '<div>'
          + '<div style="font-size:0.82rem;font-weight:800;line-height:1.1;letter-spacing:-0.02em;color:var(--text-primary);">' + f.name + '</div>'
          + '<div style="font-size:0.72rem;color:var(--text-secondary);font-weight:700;margin-top:2px;">' + dateRange + ', ' + year + '</div>'
          + statusBadge
        + '</div>'
      + '</div>'
      // Actions
      + (buyBtn || siteChip ? '<div style="padding:6px 12px 12px;display:grid;' + (buyBtn && siteChip ? 'grid-template-columns:1fr auto;' : '') + 'gap:8px;align-items:center;">'
        + buyBtn + siteChip
      + '</div>' : '')
    + '</div>';
  });

  container.innerHTML = html;
}

function updateLeftSidebar() {
  const meetings = window.__allMeetingsCache || [];
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  // End of this week (Sunday)
  const endOfWeek = new Date(now);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
  endOfWeek.setHours(23, 59, 59, 999);

  // 10-day lookahead
  const lookAhead = new Date(now);
  lookAhead.setDate(lookAhead.getDate() + 10);

  // Only governmental meetings from today onward
  const upcoming = meetings.filter(m =>
    m.eventDate && dateGroupKey(m.eventDate) >= todayStr && isGovernmentalMeeting(m) && !m.canceled
  );

  const weekMeetings = upcoming.filter(m => m.eventDate <= endOfWeek);
  const tenDayMeetings = upcoming.filter(m => m.eventDate <= lookAhead);

  const snapEl = document.getElementById('weekSnapshot');
  if (!snapEl) return;

  const paragraphs = [];

  // ── 1. Festivals ──
  const festivals = getUpcomingFestivals(now, 21);
  festivals.forEach(f => {
    if (f.happening) {
      paragraphs.push({ priority: 0, text: `${f.icon} <strong>${f.name}</strong> is in full swing! Expect road closures, packed restaurants, and that electric Telluride energy. If you haven't already, grab your wristband, find your spot on the grass, and soak it in. Town won't be this alive again until the next big one.` });
    } else if (f.daysUntil <= 7) {
      paragraphs.push({ priority: 0, text: `${f.icon} <strong>${f.name}</strong> kicks off in just ${f.daysUntil} day${f.daysUntil !== 1 ? 's' : ''}. Town is about to get buzzing -- now's the time to sort out parking, dinner reservations, and your schedule. Whether you're here for the music, the films, or just the atmosphere, it's going to be a great one.` });
    } else if (f.daysUntil <= 14) {
      paragraphs.push({ priority: 1, text: `${f.icon} Mark your calendar: <strong>${f.name}</strong> is coming up ${fullDate(f.start)}. Still a couple weeks out, but a good time to start making plans and locking in accommodations if you haven't already.` });
    }
  });

  // ── 2. Key government issues (WHY_THIS_MATTERS) ──
  const keyItems = [];
  const seenDecisions = new Set();
  tenDayMeetings.forEach(m => {
    const wtm = getWhyThisMatters(m);
    if (wtm && !seenDecisions.has(wtm.decision)) {
      seenDecisions.add(wtm.decision);
      keyItems.push({ meeting: m, wtm, date: m.eventDate });
    }
  });
  keyItems.sort((a, b) => a.date - b.date);

  // Truncate to full sentences only — never cut mid-sentence
  function truncateToFullSentences(text, maxLen) {
    if (!text || text.length <= maxLen) return text;
    // Split on sentence-ending punctuation followed by space or end
    const sentences = text.match(/[^.!?]*[.!?]+(?:\s|$)/g) || [];
    let result = '';
    for (const s of sentences) {
      if ((result + s).length > maxLen && result.length > 0) break;
      result += s;
    }
    return result.trim() || text.split(/[.!?]/)[0] + '.';
  }

  // Write each key item as its own paragraph with context
  keyItems.slice(0, 5).forEach(k => {
    const dayName = dayNames[k.date.getDay()];
    const entity = SOURCE_SHORT_NAME[k.meeting.source] || k.meeting.sourceLabel || '';
    const summary = getMeetingSummary(k.meeting) || '';

    // Decision description -- only full sentences
    let desc = truncateToFullSentences(k.wtm.decision, 250);

    // Impact teaser -- only full sentences
    let impact = truncateToFullSentences(k.wtm.impact || '', 200);

    // Who's affected
    const who = k.wtm.who || '';

    // Build the paragraph
    let para = `<strong>${entity} -- ${dayName}:</strong> ${desc}`;

    // Add who's affected if available
    if (who && who.length < 150) {
      para += ` This affects ${who.charAt(0).toLowerCase() + who.slice(1)}`;
      if (!para.endsWith('.')) para += '.';
    }

    // Add impact
    if (impact) {
      para += ` ${impact}`;
      if (!para.endsWith('.')) para += '.';
    }

    // Add agenda topics if we have them
    if (summary && !/not yet posted/i.test(summary)) {
      const topics = summary.split(' · ').slice(0, 3);
      if (topics.length > 0) {
        para += ` On the agenda: ${topics.join(', ').toLowerCase()}.`;
      }
    }

    paragraphs.push({ priority: 2, text: para });
  });

  // ── 3. Other notable government meetings ──
  const HIGH_PRIORITY = /town\s*council|board\s*of\s*county\s*commissioner|planning\s*commission|joint\s*work\s*session|design\s*review\s*board|general\s*assembly/i;
  const coveredSources = new Set(keyItems.map(k => k.meeting.source + '|' + dateGroupKey(k.date)));
  const otherNotable = [];

  weekMeetings.forEach(m => {
    const key = m.source + '|' + dateGroupKey(m.eventDate);
    if (coveredSources.has(key)) return;
    if (HIGH_PRIORITY.test(m.title)) {
      otherNotable.push(m);
      coveredSources.add(key);
    }
  });

  if (otherNotable.length > 0) {
    let otherText = 'Beyond the headline items, ';
    const details = otherNotable.map(m => {
      const entity = SOURCE_SHORT_NAME[m.source] || '';
      const day = dayNames[m.eventDate.getDay()];
      const summary = getMeetingSummary(m) || '';
      let detail = `<strong>${entity}</strong> meets on ${day}`;
      if (summary && !/not yet posted/i.test(summary)) {
        const topicPreview = summary.split(' · ').slice(0, 2).join(' and ').toLowerCase();
        if (topicPreview.length < 120) detail += ` to discuss ${topicPreview}`;
      }
      return detail;
    });
    otherText += details.join(', and ') + '. These may not make the front page, but they shape how the region operates day to day.';
    paragraphs.push({ priority: 3, text: otherText });
  }

  // ── 4. Smaller boards and commissions ──
  const SECONDARY = /board\s*of\s*education|board\s*of\s*directors|board\s*of\s*trustees|regular\s*board/i;
  const secondaryMeetings = [];
  weekMeetings.forEach(m => {
    const key = m.source + '|' + dateGroupKey(m.eventDate);
    if (coveredSources.has(key)) return;
    if (SECONDARY.test(m.title)) {
      secondaryMeetings.push(m);
      coveredSources.add(key);
    }
  });

  if (secondaryMeetings.length > 0) {
    const boardNames = secondaryMeetings.map(m => {
      const entity = SOURCE_SHORT_NAME[m.source] || '';
      return entity;
    });
    const unique = [...new Set(boardNames)];
    if (unique.length > 0) {
      paragraphs.push({ priority: 4, text: `Rounding out the week, <strong>${unique.join('</strong>, <strong>')}</strong> ${unique.length === 1 ? 'has a board meeting' : 'all have board meetings'} on the schedule. Agendas are usually posted a few days before -- check the Meetings tab for updates as they become available.` });
    }
  }

  // ── 5. Legal notices ──
  const legalThisWeek = [];
  if (typeof LEGAL_NOTICES !== 'undefined') {
    LEGAL_NOTICES.forEach(notice => {
      if (notice.event && notice.event.date) {
        const eventDate = localDate(notice.event.date);
        if (!isNaN(eventDate) && eventDate >= now && eventDate <= lookAhead) {
          legalThisWeek.push(notice);
        }
      }
    });
  }
  if (legalThisWeek.length > 0) {
    let legalText = 'Keep an eye on the <strong>Legal Notices</strong> tab -- ';
    const legalDetails = legalThisWeek.slice(0, 3).map(n => {
      let detail = `a ${n.type.toLowerCase()} from ${n.entity}`;
      if (n.deadline) detail += ` (deadline: ${n.deadline})`;
      return detail;
    });
    legalText += legalDetails.join(', and ') + '. Public notices are easy to miss but often carry real consequences for property owners and residents.';
    paragraphs.push({ priority: 2.5, text: legalText });
  }

  // ── 6. Total meeting count ──
  const totalCount = weekMeetings.length;
  const entityCount = new Set(weekMeetings.map(m => m.source)).size;
  if (totalCount > 0 && paragraphs.filter(p => p.priority >= 2).length > 0) {
    paragraphs.push({ priority: 4.5, text: `All told, there are <strong>${totalCount} government meetings</strong> this week across <strong>${entityCount} entities</strong>. Scroll through the Meetings tab for full details, agenda links, and public comment info for each one.` });
  }

  // ── Fallback for quiet weeks ──
  if (paragraphs.length === 0) {
    if (totalCount > 0) {
      paragraphs.push({ priority: 5, text: `A relatively quiet week around town with <strong>${totalCount} government meetings</strong> on the schedule across ${entityCount} entities. Nothing earth-shaking on the agenda, but government never really sleeps -- check the Meetings tab if you want to stay in the loop. Sometimes the most consequential decisions happen when nobody's watching.` });
    } else {
      paragraphs.push({ priority: 5, text: `No government meetings on the calendar this week -- a rare breather. Enjoy the mountain air, hit the trails, and recharge. The next round of big decisions is never far off in this valley, and you'll want your energy for when it comes.` });
    }
  }

  // Sort and render
  paragraphs.sort((a, b) => a.priority - b.priority);

  snapEl.innerHTML = paragraphs.map(p => {
    if (p.priority === 0) {
      return `<div class="summary-festival"><p>${p.text}</p></div>`;
    }
    return `<p>${p.text}</p>`;
  }).join('');
}

// Call after each data load
const _origRenderMeetingsWithTopic = renderMeetingsWithTopic;
renderMeetingsWithTopic = function() {
  _origRenderMeetingsWithTopic();
  updateLeftSidebar();
};

init();

// ══════════════════════════════════════════════════════
// ── Auto-Refresh: adaptive schedule ──
// ══════════════════════════════════════════════════════
//
// Live API sources (Telluride CivicWeb, County RSS, news feeds) are
// re-fetched on each init() call. Cached sources (SMART, MV, Fire, Med,
// etc.) use static arrays that update only when the HTML file is updated,
// but the re-render still picks up any time-dependent display changes
// (e.g., "TODAY" labels, deadline calculations, sidebar summary).
//
// Refresh schedule:
//   • Mon–Fri 7 AM – 6 PM (work hours): every 1 hour
//   • Evenings, early mornings, weekends: every 6 hours
// A "Last refreshed" timestamp is shown in the footer.

function getRefreshInterval() {
  const now = new Date();
  const day = now.getDay();           // 0 = Sun, 6 = Sat
  const hour = now.getHours();
  const isWeekday = day >= 1 && day <= 5;
  const isWorkHours = hour >= 7 && hour < 18;
  if (isWeekday && isWorkHours) {
    return 60 * 60 * 1000;            // 1 hour
  }
  return 6 * 60 * 60 * 1000;          // 6 hours
}

function scheduleNextRefresh() {
  const interval = getRefreshInterval();
  setTimeout(() => {
    init();
    scheduleNextRefresh();
  }, interval);
}
scheduleNextRefresh();

// ══════════════════════════════════════════════════════
// ── Wix Iframe Compatibility Layer ──
// ══════════════════════════════════════════════════════
//
// This section handles:
// 1. Auto-height communication with the Wix parent page
// 2. Detection of iframe context
// 3. Scroll-to-top button visibility
// 4. Graceful degradation of sticky/fixed positioning
//
// HOW IT WORKS IN WIX:
// - Paste this HTML file into a Wix "Embed HTML" component
// - Set the component width to your desired column width
// - Set height to at least 800px (or use Wix Velo for auto-height)
// - If using fixed height: sticky tab bar and sidebar work normally
// - If using auto-height: the script detects this and adjusts layout

(function wixCompat() {
  const inIframe = window !== window.top;

  // ── Auto-height: communicate content height to Wix parent ──
  let lastHeight = 0;
  function notifyWixHeight() {
    if (!inIframe) return;
    const height = Math.max(
      document.body.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.scrollHeight
    );
    // Only send if height changed meaningfully (avoid message spam)
    if (Math.abs(height - lastHeight) > 5) {
      lastHeight = height;
      try {
        window.parent.postMessage(JSON.stringify({
          type: 'setHeight',
          data: height
        }), '*');
      } catch (e) {}
    }
  }

  // Monitor for height changes (data loads, tab switches, filter changes)
  if (inIframe) {
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(notifyWixHeight);
    });
    resizeObserver.observe(document.body);

    // Also notify on specific events
    setTimeout(notifyWixHeight, 300);
    setTimeout(notifyWixHeight, 1500);
    setTimeout(notifyWixHeight, 4000);

    // Notify after tab switches and filter changes
    document.querySelectorAll('.tab-btn, .chip, .sidebar-tag').forEach(el => {
      el.addEventListener('click', () => {
        setTimeout(notifyWixHeight, 100);
        setTimeout(notifyWixHeight, 500);
      });
    });
  }

  // ── Detect auto-height mode ──
  // If the iframe height matches the content height (±50px), Wix is auto-sizing
  // and the parent page scrolls. In this case, sticky positioning won't work.
  function detectAutoHeight() {
    if (!inIframe) return;
    const iframeHeight = window.innerHeight;
    const contentHeight = document.body.scrollHeight;
    // If iframe is nearly as tall as content, we're in auto-height mode
    if (contentHeight > 0 && Math.abs(iframeHeight - contentHeight) < 80) {
      document.body.classList.add('wix-auto-height');
    } else {
      document.body.classList.remove('wix-auto-height');
    }
  }
  // Check periodically since data loads change content height
  if (inIframe) {
    setTimeout(detectAutoHeight, 1000);
    setTimeout(detectAutoHeight, 3000);
    setTimeout(detectAutoHeight, 6000);
    window.addEventListener('resize', detectAutoHeight);
  }

  // ── Scroll-to-top button ──
  const scrollBtn = document.getElementById('scrollTopBtn');
  if (scrollBtn) {
    // Determine which element is scrolling (iframe body or html)
    function getScrollTop() {
      return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    }

    function checkScrollVisibility() {
      if (getScrollTop() > 400) {
        scrollBtn.classList.add('visible');
      } else {
        scrollBtn.classList.remove('visible');
      }
    }

    window.addEventListener('scroll', checkScrollVisibility, { passive: true });
    document.addEventListener('scroll', checkScrollVisibility, { passive: true });

    scrollBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // Also try scrolling the document element (some iframes use this)
      document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ── Listen for messages from Wix parent (e.g. theme, resize) ──
  window.addEventListener('message', function(e) {
    try {
      const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      // Wix may send viewport info -- we can use this for responsive adjustments
      if (data.type === 'viewport') {
        document.documentElement.style.setProperty('--wix-viewport-width', (data.data.width || 0) + 'px');
      }
    } catch (err) {
      // Not a JSON message -- ignore
    }
  });

  // ── Ensure links open correctly from iframe ──
  // All target="_blank" links already work (open new tab).
  // But add rel="noopener noreferrer" for security on any we missed.
  document.querySelectorAll('a[target="_blank"]').forEach(a => {
    if (!a.getAttribute('rel') || !a.getAttribute('rel').includes('noopener')) {
      a.setAttribute('rel', 'noopener noreferrer');
    }
  });

  // ══════════════════════════════════════════════════════════════
  // ═══════════════ COMMUNITY COMMENT SYSTEM ════════════════════
  // ══════════════════════════════════════════════════════════════

  const CommentSystem = (function() {
    const COOLDOWN_KEY = 'govhub_comment_cooldown';
    const VERIFIED_KEY = 'govhub_verified_emails';
    const STORAGE_KEY = 'govhub_comments';       // localStorage fallback
    const COOLDOWN_MS = 24 * 60 * 60 * 1000;     // 24 hours per topic

    // ── Detect Firebase availability ──
    function useFirestore() { return !!(window._FIREBASE_READY && window._FIREBASE_DB && window._FB); }

    // ── Toxicity filter ──
    const TOXIC_PATTERNS = [
      /\b(fuck|shit|damn|ass|bitch|bastard|crap|dick|piss|hell)\w*\b/i,
      /\b(idiot|moron|stupid|dumb|retard|loser|scum|trash|fraud|crook|corrupt|criminal|liar)\b/i,
      /\b(shut\s*up|go\s*to\s*hell|drop\s*dead)\b/i,
      /\b(you\s+are\s+(a\s+)?(liar|fraud|crook|criminal|corrupt|idiot|moron))\b/i,
      /\b(you\s+should\s+be\s+(fired|jailed|arrested|ashamed))\b/i,
      /[A-Z\s]{20,}/
    ];
    function checkToxicity(text) { return TOXIC_PATTERNS.some(p => p.test(text)); }

    // ── Seed comments (shown when Firestore is empty or unavailable) ──
    const SEED_COMMENTS = {
      landuse: [
        { id:'seed-lu-1', fname:'Sarah', lname:'Mitchell', body:'I attended the last P&Z meeting and was struck by how little time was allocated for public comment on the PUD amendments. Three minutes per speaker for changes that will affect our neighborhood for decades seems inadequate. Has anyone looked into whether other Colorado mountain towns allow longer comment periods for major zoning changes?', type:'question', topic:'landuse', timestamp:new Date('2026-03-20T14:30:00').getTime(), useful:4, held:false, answered:false },
        { id:'seed-lu-2', fname:'David', lname:'Chen', body:'For context on the density discussion — the 2019 Telluride Master Plan (Section 4.2) explicitly states that infill development should maintain existing neighborhood character. The current PUD proposal appears to diverge from those guidelines. The document is available on the town website under Planning Archives.', type:'correction', topic:'landuse', timestamp:new Date('2026-03-19T09:15:00').getTime(), useful:7, held:false, answered:false },
        { id:'seed-lu-3', fname:'Maria', lname:'Gonzalez', body:'As a renter in town for 8 years, I have a different perspective on the housing code changes. The current restrictions make it nearly impossible for working families to find affordable rentals. While I understand concerns about neighborhood character, we also need to acknowledge that the status quo is pushing essential workers out of the community entirely.', type:'experience', topic:'landuse', timestamp:new Date('2026-03-18T16:45:00').getTime(), useful:11, held:false, answered:false },
        { id:'seed-lu-4', fname:'Tom', lname:'Reeves', body:'What is the actual timeline for CORA requests to be fulfilled by the town? I submitted a request for meeting minutes from the January planning session and still haven\'t received them after 6 weeks. The statute says 3 business days for standard requests.', type:'question', topic:'landuse', timestamp:new Date('2026-03-17T11:00:00').getTime(), useful:5, held:false, answered:false }
      ],
      gondola: [
        { id:'seed-g-1', fname:'Jennifer', lname:'Walsh', body:'I\'ve been following the Gondola 3A proposal closely and I\'m concerned about the environmental impact assessment. The proposed corridor crosses a known elk migration route. Has the applicant submitted a wildlife impact study as required by San Miguel County regulations?', type:'concern', topic:'gondola', timestamp:new Date('2026-03-21T10:20:00').getTime(), useful:8, held:false, answered:false },
        { id:'seed-g-2', fname:'Robert', lname:'Harding', body:'I support exploring transit alternatives in the valley, but the 3A alignment specifically raises questions about property rights for landowners along the proposed route. The town should provide a clear map of affected parcels and an explanation of what easement authority they plan to invoke.', type:'observation', topic:'gondola', timestamp:new Date('2026-03-20T08:45:00').getTime(), useful:6, held:false, answered:false },
        { id:'seed-g-3', fname:'Lisa', lname:'Nakamura', body:'As someone who commutes from Mountain Village to Telluride daily, I can say the current traffic situation during peak season is genuinely unsustainable. Whether Gondola 3A is the right solution is debatable, but the problem it aims to solve is very real. Last ski season I spent 45 minutes in traffic for a 5-mile commute at least twice a week.', type:'experience', topic:'gondola', timestamp:new Date('2026-03-19T15:30:00').getTime(), useful:13, held:false, answered:false },
        { id:'seed-g-4', fname:'Mark', lname:'Bergstrom', body:'Can someone clarify the funding structure? The presentation at the February town hall mentioned both public bonds and private investment, but the percentages were inconsistent between the slides and the spoken remarks. Which figure is the official proposal — 60/40 or 70/30 public/private split?', type:'question', topic:'gondola', timestamp:new Date('2026-03-18T13:00:00').getTime(), useful:9, held:false, answered:false }
      ]
    };

    // ── In-memory cache for each topic (populated by Firestore listener or localStorage) ──
    const _cache = { landuse: [], gondola: [] };
    const _currentSort = { landuse: 'newest', gondola: 'newest' };

    // ══════════════════════════════════════════════
    //  FIRESTORE FUNCTIONS
    // ══════════════════════════════════════════════

    // Write seed comments to Firestore if collection is empty
    async function seedFirestore(topic) {
      const FB = window._FB, db = window._FIREBASE_DB;
      const colRef = FB.collection(db, 'govhub_comments');
      const q = FB.query(colRef, FB.where('topic', '==', topic));
      return new Promise(resolve => {
        const unsub = FB.onSnapshot(q, async snap => {
          unsub(); // one-time check
          if (snap.empty) {
            const seeds = SEED_COMMENTS[topic] || [];
            for (const s of seeds) {
              await FB.addDoc(colRef, {
                ...s,
                createdAt: FB.Timestamp.fromMillis(s.timestamp)
              });
            }
          }
          resolve();
        });
      });
    }

    // Start real-time listener for a topic
    function listenFirestore(topic) {
      const FB = window._FB, db = window._FIREBASE_DB;
      const colRef = FB.collection(db, 'govhub_comments');
      const q = FB.query(colRef, FB.where('topic', '==', topic), FB.orderBy('timestamp', 'desc'));
      FB.onSnapshot(q, snap => {
        _cache[topic] = snap.docs.map(d => ({ ...d.data(), _docId: d.id }));
        renderComments(topic, _currentSort[topic]);
      }, err => {
        console.warn('Firestore listener error for ' + topic + ':', err.message);
        // Fall back to localStorage
        _cache[topic] = getLocalComments(topic);
        renderComments(topic, _currentSort[topic]);
      });
    }

    // Save comment to Firestore
    async function saveFirestore(comment) {
      const FB = window._FB, db = window._FIREBASE_DB;
      const colRef = FB.collection(db, 'govhub_comments');
      const docRef = await FB.addDoc(colRef, {
        ...comment,
        approved: false,
        createdAt: FB.serverTimestamp()
      });
      // Send moderation email notification
      if (window._sendCommentNotification) {
        try { window._sendCommentNotification(comment, docRef.id); } catch(e) {}
      }
    }

    // Increment useful count in Firestore
    async function voteFirestore(docId) {
      const FB = window._FB, db = window._FIREBASE_DB;
      const docRef = FB.doc(db, 'govhub_comments', docId);
      await FB.updateDoc(docRef, { useful: FB.increment(1) });
    }

    // ══════════════════════════════════════════════
    //  LOCALSTORAGE FALLBACK FUNCTIONS
    // ══════════════════════════════════════════════

    function getLocalComments(topic) {
      try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        const user = stored[topic] || [];
        const seeds = SEED_COMMENTS[topic] || [];
        const ids = new Set(user.map(c => c.id));
        return [...seeds.filter(s => !ids.has(s.id)), ...user];
      } catch { return SEED_COMMENTS[topic] || []; }
    }

    function saveLocal(topic, comment) {
      try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        if (!stored[topic]) stored[topic] = [];
        stored[topic].push(comment);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
        _cache[topic] = getLocalComments(topic);
      } catch(e) { console.warn('Comment save failed:', e); }
    }

    function voteLocal(commentId, topic) {
      try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        const arr = stored[topic] || [];
        const found = arr.find(c => c.id === commentId);
        if (found) { found.useful = (found.useful || 0) + 1; localStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); }
        const seed = (SEED_COMMENTS[topic] || []).find(s => s.id === commentId);
        if (seed) seed.useful = (seed.useful || 0) + 1;
        _cache[topic] = getLocalComments(topic);
      } catch {}
    }

    // ══════════════════════════════════════════════
    //  SHARED: cooldown, verification, helpers
    // ══════════════════════════════════════════════

    function canPost(topic) {
      try {
        const c = JSON.parse(localStorage.getItem(COOLDOWN_KEY) || '{}');
        return !c[topic] || (Date.now() - c[topic]) > COOLDOWN_MS;
      } catch { return true; }
    }
    function setCooldown(topic) {
      try { const c = JSON.parse(localStorage.getItem(COOLDOWN_KEY) || '{}'); c[topic] = Date.now(); localStorage.setItem(COOLDOWN_KEY, JSON.stringify(c)); } catch {}
    }
    function isVerified(email) {
      try { return (JSON.parse(localStorage.getItem(VERIFIED_KEY) || '[]')).includes(email.toLowerCase()); } catch { return false; }
    }
    function setVerified(email) {
      try { const v = JSON.parse(localStorage.getItem(VERIFIED_KEY) || '[]'); if (!v.includes(email.toLowerCase())) { v.push(email.toLowerCase()); localStorage.setItem(VERIFIED_KEY, JSON.stringify(v)); } } catch {}
    }
    function escapeHtml(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
    function formatTimeAgo(ts) {
      const diff = Date.now() - ts, mins = Math.floor(diff / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return mins + 'm ago';
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return hrs + 'h ago';
      const days = Math.floor(hrs / 24);
      if (days < 30) return days + 'd ago';
      return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // ══════════════════════════════════════════════
    //  RENDER
    // ══════════════════════════════════════════════

    function renderComments(topic, sortBy) {
      _currentSort[topic] = sortBy;
      const list = document.getElementById(topic + '-comment-list');
      const countEl = document.getElementById(topic + '-comment-count');
      if (!list) return;

      let comments = (_cache[topic] || []).filter(c => !c.held);

      switch (sortBy) {
        case 'useful': comments.sort((a, b) => (b.useful||0) - (a.useful||0)); break;
        case 'unanswered':
          comments = comments.filter(c => c.type === 'question' && !c.answered);
          comments.sort((a, b) => b.timestamp - a.timestamp); break;
        default: comments.sort((a, b) => b.timestamp - a.timestamp);
      }

      const total = (_cache[topic] || []).filter(c => !c.held).length;
      if (countEl) countEl.textContent = total + ' comment' + (total !== 1 ? 's' : '');

      const typeLabels = { question:'❓ Question', observation:'👁️ Observation', concern:'⚠️ Concern', support:'👍 Support', opposition:'👎 Opposition', correction:'✏️ Correction', experience:'💬 Experience' };

      list.innerHTML = comments.map(c => `
        <div class="comment-item${c.held ? ' held' : ''}">
          <div class="comment-item-header">
            <span class="comment-item-author">${escapeHtml(c.fname)} ${escapeHtml(c.lname)}</span>
            <span class="comment-item-tag type-${c.type}">${typeLabels[c.type] || c.type}</span>
            <span class="comment-item-time">${formatTimeAgo(c.timestamp)}</span>
          </div>
          <div class="comment-item-body">${escapeHtml(c.body)}</div>
          <div class="comment-item-actions">
            <button class="comment-useful-btn" data-id="${c.id || c._docId}" data-doc="${c._docId || ''}" data-topic="${topic}">
              👍 Useful${c.useful ? ' (' + c.useful + ')' : ''}
            </button>
          </div>
        </div>
      `).join('');

      // Bind vote buttons
      list.querySelectorAll('.comment-useful-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          const voteKey = 'govhub_voted_' + (this.dataset.doc || this.dataset.id);
          if (localStorage.getItem(voteKey)) return;
          localStorage.setItem(voteKey, '1');
          if (useFirestore() && this.dataset.doc) {
            voteFirestore(this.dataset.doc).catch(e => console.warn('Vote failed:', e));
          } else {
            voteLocal(this.dataset.id, this.dataset.topic);
            renderComments(this.dataset.topic, _currentSort[this.dataset.topic]);
          }
        });
      });
    }

    // ══════════════════════════════════════════════
    //  INIT
    // ══════════════════════════════════════════════

    function initCommentSection(topic) {
      const form = document.getElementById(topic + '-comment-form');
      if (!form) return;

      // Toggle button
      const toggleBtn = document.querySelector('.comment-toggle-btn[data-target="' + topic + '-comment-form"]');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
          const isOpen = !form.classList.contains('comment-form-collapsed');
          if (isOpen) {
            form.classList.add('comment-form-collapsed');
            this.classList.remove('active');
            this.textContent = 'Would you like to Comment?';
          } else {
            form.classList.remove('comment-form-collapsed');
            form.style.display = 'grid';
            this.classList.add('active');
            this.textContent = 'Hide Comment Form';
          }
        });
      }

      const fnameInput = form.querySelector('.comment-fname');
      const lnameInput = form.querySelector('.comment-lname');
      const emailInput = form.querySelector('.comment-email');
      const bodyInput = form.querySelector('.comment-body');
      const submitBtn = form.querySelector('.comment-submit-btn');
      const nudge = document.getElementById(topic + '-rewrite-nudge');
      const charCount = form.querySelector('.char-current');
      let selectedType = null, selectedPrompt = '';

      // Prompt chips
      form.querySelectorAll('.prompt-chip').forEach(chip => {
        chip.addEventListener('click', function() {
          form.querySelectorAll('.prompt-chip').forEach(c => c.classList.remove('active'));
          this.classList.add('active');
          selectedPrompt = this.dataset.prompt;
          if (!bodyInput.value.trim()) { bodyInput.value = selectedPrompt + ' '; bodyInput.focus(); updateCharCount(); }
          validateForm();
        });
      });

      // Type chips
      form.querySelectorAll('.type-chip').forEach(chip => {
        chip.addEventListener('click', function() {
          form.querySelectorAll('.type-chip').forEach(c => c.classList.remove('active'));
          this.classList.add('active');
          selectedType = this.dataset.type;
          validateForm();
        });
      });

      function updateCharCount() { if (charCount) charCount.textContent = bodyInput.value.length; }
      bodyInput.addEventListener('input', function() { updateCharCount(); if (nudge) nudge.style.display = 'none'; validateForm(); });

      function validateForm() {
        const valid = fnameInput.value.trim().length >= 2
          && lnameInput.value.trim().length >= 2
          && emailInput.value.trim().includes('@')
          && bodyInput.value.trim().length >= 10
          && selectedType && selectedPrompt;
        submitBtn.disabled = !valid;
      }
      [fnameInput, lnameInput, emailInput].forEach(i => i.addEventListener('input', validateForm));

      // Submit
      submitBtn.addEventListener('click', function() {
        if (submitBtn.disabled) return;
        if (!canPost(topic)) { alert('You can only comment once per topic per day. Please come back tomorrow.'); return; }
        if (checkToxicity(bodyInput.value)) { if (nudge) nudge.style.display = 'flex'; return; }
        const email = emailInput.value.trim().toLowerCase();
        if (!isVerified(email)) { showVerification(email, topic, function() { doSubmit(topic); }); return; }
        doSubmit(topic);
      });

      function doSubmit(topicKey) {
        const comment = {
          id: 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
          fname: fnameInput.value.trim(),
          lname: lnameInput.value.trim(),
          email: 'verified',
          body: bodyInput.value.trim(),
          type: selectedType,
          topic: topicKey,
          timestamp: Date.now(),
          useful: 0,
          held: false,
          answered: false
        };

        if (useFirestore()) {
          saveFirestore(comment).catch(e => { console.warn('Firestore save failed, using localStorage:', e); saveLocal(topicKey, comment); renderComments(topicKey, 'newest'); });
        } else {
          saveLocal(topicKey, comment);
          renderComments(topicKey, 'newest');
        }
        setCooldown(topicKey);

        // Reset form
        fnameInput.value = ''; lnameInput.value = ''; bodyInput.value = '';
        if (charCount) charCount.textContent = '0';
        selectedType = null; selectedPrompt = '';
        form.querySelectorAll('.type-chip, .prompt-chip').forEach(c => c.classList.remove('active'));
        submitBtn.disabled = true;

        const msg = document.createElement('div');
        msg.style.cssText = 'background:#e8f5e9;color:#2e7d32;padding:12px 16px;border-radius:8px;margin-top:8px;font-size:14px;';
        msg.textContent = 'Thank you! Your comment has been submitted and will appear after review.';
        form.appendChild(msg);
        setTimeout(() => msg.remove(), 4000);
      }

      // Sort buttons
      document.querySelectorAll('.sort-btn[data-target="' + topic + '"]').forEach(btn => {
        btn.addEventListener('click', function() {
          document.querySelectorAll('.sort-btn[data-target="' + topic + '"]').forEach(b => b.classList.remove('active'));
          this.classList.add('active');
          renderComments(topic, this.dataset.sort);
        });
      });

      // ── Bootstrap: Firestore or localStorage ──
      if (useFirestore()) {
        seedFirestore(topic).then(() => listenFirestore(topic));
      } else {
        _cache[topic] = getLocalComments(topic);
        renderComments(topic, 'newest');
      }
    }

    // Email verification modal
    function showVerification(email, topic, onSuccess) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const overlay = document.createElement('div');
      overlay.className = 'comment-verify-overlay';
      overlay.innerHTML = `
        <div class="comment-verify-modal">
          <h4>Verify your email</h4>
          <p>In a production environment, a 6-digit code would be sent to <strong>${escapeHtml(email)}</strong>.</p>
          <p style="font-size:13px;color:var(--text-secondary);margin:8px 0;">For this demo, your code is: <strong style="color:var(--accent-amber);font-size:16px;">${code}</strong></p>
          <input type="text" class="comment-input verify-code-input" placeholder="Enter 6-digit code" maxlength="6" style="text-align:center;font-size:18px;letter-spacing:4px;">
          <div class="verify-actions">
            <button class="verify-cancel-btn">Cancel</button>
            <button class="verify-confirm-btn" disabled>Verify</button>
          </div>
          <div class="verify-error" style="display:none;color:#c62828;font-size:13px;margin-top:8px;"></div>
        </div>
      `;
      document.body.appendChild(overlay);
      setTimeout(() => overlay.classList.add('visible'), 10);
      const ci = overlay.querySelector('.verify-code-input'), cb = overlay.querySelector('.verify-confirm-btn'), cx = overlay.querySelector('.verify-cancel-btn'), er = overlay.querySelector('.verify-error');
      ci.focus();
      ci.addEventListener('input', function() { cb.disabled = this.value.length !== 6; });
      cx.addEventListener('click', function() { overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 300); });
      cb.addEventListener('click', function() {
        if (ci.value === code) { setVerified(email); overlay.classList.remove('visible'); setTimeout(() => overlay.remove(), 300); onSuccess(); }
        else { er.textContent = 'Incorrect code. Please try again.'; er.style.display = 'block'; ci.value = ''; ci.focus(); }
      });
      ci.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !cb.disabled) cb.click(); });
    }

    return { init: initCommentSection, render: renderComments };
  })();

  // Initialize both comment sections
  CommentSystem.init('landuse');
  CommentSystem.init('gondola');

  // ══════════════════════════════════════════════
  //  ADMIN MODERATION SYSTEM
  //  Handles ?moderate=COMMENT_ID&action=approve|deny from email links
  // ══════════════════════════════════════════════
  (function initModerationHandler() {
    const params = new URLSearchParams(window.location.search);
    const commentId = params.get('moderate');
    const action = params.get('action'); // 'approve' or 'deny'
    if (!commentId) return;

    // Show moderation overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:32px;max-width:500px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3);font-family:var(--font-main,system-ui);">
        <h3 style="margin:0 0 16px;font-size:1.2rem;">Comment Moderation</h3>
        <div id="mod-status" style="color:#555;font-size:0.95rem;">Signing in...</div>
        <div id="mod-comment" style="display:none;margin:16px 0;padding:14px;background:#f5f5f5;border-radius:10px;font-size:0.9rem;line-height:1.5;"></div>
        <div id="mod-actions" style="display:none;gap:12px;margin-top:16px;"></div>
        <div id="mod-login" style="display:none;margin-top:16px;">
          <input type="password" id="mod-password" placeholder="Enter your admin password" style="width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:8px;font-size:0.95rem;box-sizing:border-box;">
          <button id="mod-login-btn" style="margin-top:10px;padding:10px 24px;background:var(--accent-amber,#f59e0b);color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Sign In</button>
          <div id="mod-login-error" style="color:#c62828;font-size:0.85rem;margin-top:8px;display:none;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const statusEl = overlay.querySelector('#mod-status');
    const commentEl = overlay.querySelector('#mod-comment');
    const actionsEl = overlay.querySelector('#mod-actions');
    const loginEl = overlay.querySelector('#mod-login');

    async function handleModeration(user) {
      statusEl.textContent = 'Loading comment...';
      try {
        const FB = window._FB, db = window._FIREBASE_DB;
        const docRef = FB.doc(db, 'govhub_comments', commentId);

        // Fetch the comment
        const q = FB.query(FB.collection(db, 'govhub_comments'), FB.where('__name__', '==', commentId));
        const snap = await FB.getDocs(q);

        if (snap.empty) {
          statusEl.textContent = 'Comment not found. It may have already been removed.';
          return;
        }

        const data = snap.docs[0].data();
        commentEl.style.display = 'block';
        commentEl.innerHTML = '<strong>' + (data.fname || '') + ' ' + (data.lname || '') + '</strong> on <em>' + (data.topic || 'unknown') + '</em><br><br>' + (data.body || '');

        if (data.approved === true) {
          statusEl.textContent = 'This comment is already approved.';
          statusEl.style.color = '#2e7d32';
          return;
        }

        // If action was in URL, execute immediately
        if (action === 'approve') {
          await FB.updateDoc(docRef, { approved: true });
          statusEl.textContent = 'Comment approved!';
          statusEl.style.color = '#2e7d32';
          return;
        } else if (action === 'deny') {
          await FB.deleteDoc(docRef);
          statusEl.textContent = 'Comment denied and removed.';
          statusEl.style.color = '#c62828';
          commentEl.style.display = 'none';
          return;
        }

        // Show approve/deny buttons
        statusEl.textContent = 'Review this comment:';
        actionsEl.style.display = 'flex';
        actionsEl.innerHTML = `
          <button id="mod-approve" style="flex:1;padding:12px;background:#2e7d32;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.95rem;">Approve</button>
          <button id="mod-deny" style="flex:1;padding:12px;background:#c62828;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.95rem;">Deny</button>
          <button id="mod-close" style="flex:1;padding:12px;background:#666;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.95rem;">Close</button>
        `;
        actionsEl.querySelector('#mod-approve').addEventListener('click', async () => {
          await FB.updateDoc(docRef, { approved: true });
          statusEl.textContent = 'Comment approved!';
          statusEl.style.color = '#2e7d32';
          actionsEl.style.display = 'none';
        });
        actionsEl.querySelector('#mod-deny').addEventListener('click', async () => {
          await FB.deleteDoc(docRef);
          statusEl.textContent = 'Comment denied and removed.';
          statusEl.style.color = '#c62828';
          commentEl.style.display = 'none';
          actionsEl.style.display = 'none';
        });
        actionsEl.querySelector('#mod-close').addEventListener('click', () => {
          overlay.remove();
          window.history.replaceState({}, '', window.location.pathname);
        });
      } catch (err) {
        statusEl.textContent = 'Error: ' + err.message;
        statusEl.style.color = '#c62828';
      }
    }

    // Check auth state
    function waitForAuth() {
      if (!window._FB_AUTH || !window._FIREBASE_AUTH) {
        setTimeout(waitForAuth, 200);
        return;
      }
      window._FB_AUTH.onAuthStateChanged(window._FIREBASE_AUTH, (user) => {
        if (user && user.email === 'info@livabletelluride.org') {
          handleModeration(user);
        } else {
          statusEl.textContent = 'Please sign in to moderate comments.';
          loginEl.style.display = 'block';
          const pwInput = overlay.querySelector('#mod-password');
          const loginBtn = overlay.querySelector('#mod-login-btn');
          const loginErr = overlay.querySelector('#mod-login-error');
          loginBtn.addEventListener('click', async () => {
            loginErr.style.display = 'none';
            try {
              const cred = await window._FB_AUTH.signInWithEmailAndPassword(window._FIREBASE_AUTH, 'info@livabletelluride.org', pwInput.value);
              loginEl.style.display = 'none';
              handleModeration(cred.user);
            } catch (e) {
              loginErr.textContent = 'Invalid password. Please try again.';
              loginErr.style.display = 'block';
            }
          });
          pwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loginBtn.click(); });
        }
      });
    }
    waitForAuth();
  })();

  // ══════════════════════════════════════════════
  //  EMAILJS: Send notification email on new comment
  //  Configure at https://www.emailjs.com
  // ══════════════════════════════════════════════
  window._sendCommentNotification = function(comment, docId) {
    if (typeof emailjs === 'undefined' || !window._EMAILJS_READY) return;
    const siteUrl = window.location.origin + window.location.pathname;
    const approveUrl = siteUrl + '?moderate=' + docId + '&action=approve';
    const denyUrl = siteUrl + '?moderate=' + docId + '&action=deny';
    const reviewUrl = siteUrl + '?moderate=' + docId;

    emailjs.send(window._EMAILJS_SERVICE, window._EMAILJS_TEMPLATE, {
      to_email: 'info@livabletelluride.org',
      from_name: (comment.fname || '') + ' ' + (comment.lname || ''),
      topic: comment.topic || 'unknown',
      comment_body: comment.body || '',
      comment_type: comment.type || '',
      approve_url: approveUrl,
      deny_url: denyUrl,
      review_url: reviewUrl,
      site_name: 'Telluride Tell-Hub'
    }).then(
      () => {},
      (err) => console.warn('[GovHub] Email send failed:', err)
    );
  };

  // EmailJS initialization — REPLACE these values after setting up your EmailJS account
  try {
    if (typeof emailjs !== 'undefined') {
      emailjs.init({ publicKey: 'I_E0eKAfgpTFf3kNK' });
      window._EMAILJS_SERVICE = 'service_ubj8ke7';
      window._EMAILJS_TEMPLATE = 'template_e1o2xcb';
      window._EMAILJS_EVENT_TEMPLATE = 'template_fzf4ul3';
      window._EMAILJS_READY = true;
    }
  } catch(e) { console.warn('EmailJS not loaded:', e.message); }

})();

// ── Scrape event URL for Open Graph / JSON-LD details ──
async function scrapeEventUrl(url) {
  const info = { title: '', description: '', image: '', date: '', endDate: '', time: '', location: '', ticketUrl: '' };
  try {
    const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
    const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return info;
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Open Graph tags
    const og = (prop) => { const el = doc.querySelector('meta[property="og:' + prop + '"]') || doc.querySelector('meta[name="og:' + prop + '"]'); return el ? el.getAttribute('content') || '' : ''; };
    const meta = (name) => { const el = doc.querySelector('meta[name="' + name + '"]') || doc.querySelector('meta[property="' + name + '"]'); return el ? el.getAttribute('content') || '' : ''; };
    info.title = og('title') || meta('title') || doc.querySelector('title')?.textContent || '';
    info.description = og('description') || meta('description') || '';
    info.image = og('image') || '';

    // JSON-LD structured data (Event schema)
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    scripts.forEach(s => {
      try {
        let data = JSON.parse(s.textContent);
        // Handle @graph arrays
        if (data['@graph']) data = data['@graph'];
        const items = Array.isArray(data) ? data : [data];
        items.forEach(item => {
          if (item['@type'] === 'Event' || item['@type'] === 'MusicEvent' || item['@type'] === 'Festival') {
            if (item.startDate) info.date = item.startDate;
            if (item.endDate) info.endDate = item.endDate;
            if (item.location) {
              const loc = typeof item.location === 'string' ? item.location
                : item.location.name || (item.location.address ? (typeof item.location.address === 'string' ? item.location.address : item.location.address.streetAddress || item.location.address.addressLocality || '') : '');
              if (loc) info.location = loc;
            }
            if (item.image) info.image = info.image || (typeof item.image === 'string' ? item.image : item.image.url || '');
            if (item.description) info.description = info.description || item.description;
            if (item.offers) {
              const offers = Array.isArray(item.offers) ? item.offers[0] : item.offers;
              if (offers && offers.url) info.ticketUrl = offers.url;
            }
          }
        });
      } catch(e) { /* ignore parse errors */ }
    });

    // Fallback: look for common date patterns in meta tags
    if (!info.date) {
      const dateEl = doc.querySelector('meta[property="event:start_time"]') || doc.querySelector('time[datetime]');
      if (dateEl) info.date = dateEl.getAttribute('content') || dateEl.getAttribute('datetime') || '';
    }
    if (!info.location) {
      const locEl = doc.querySelector('meta[property="event:location"]') || doc.querySelector('[itemprop="location"]');
      if (locEl) info.location = locEl.getAttribute('content') || locEl.textContent || '';
    }
  } catch(e) {
    console.warn('[GovHub] URL scrape failed (will send without details):', e.message);
  }
  return info;
}

// Format a scraped date string into readable format
function formatScrapedDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch(e) { return dateStr; }
}

// Format date for JSON (YYYY-MM-DD)
function toJsonDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toISOString().slice(0, 10);
  } catch(e) { return dateStr; }
}

// ── Event Link Submission ──
async function submitEventLink() {
  const urlInput = document.getElementById('eventUrlInput');
  const nameInput = document.getElementById('eventNameInput');
  const submitterInput = document.getElementById('eventSubmitterInput');
  const messageInput = document.getElementById('eventMessageInput');
  const btn = document.getElementById('eventSubmitBtn');
  const status = document.getElementById('eventSubmitStatus');
  const url = (urlInput.value || '').trim();
  const eventName = (nameInput.value || '').trim();
  const submitter = (submitterInput.value || '').trim();
  const message = (messageInput ? messageInput.value || '' : '').trim();

  // Reset status
  status.style.display = 'none';

  // ── Required field validation ──
  if (!eventName) {
    showSubmitStatus('Please enter the event name.', 'error');
    return;
  }
  if (!submitter) {
    showSubmitStatus('Please enter your name.', 'error');
    return;
  }
  if (!url) {
    showSubmitStatus('Please enter a URL.', 'error');
    return;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch(e) {
    showSubmitStatus('That doesn\u2019t look like a valid URL. Please include https://', 'error');
    return;
  }

  // Must be http or https
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    showSubmitStatus('Please enter a web URL starting with https://', 'error');
    return;
  }

  // Block localhost, IPs, and suspicious domains
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === 'localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.endsWith('.local')) {
    showSubmitStatus('Please enter a public website URL.', 'error');
    return;
  }

  // Must have a real TLD (at least one dot)
  if (!hostname.includes('.') || hostname.endsWith('.')) {
    showSubmitStatus('Please enter a complete website URL (e.g. https://example.com/event).', 'error');
    return;
  }

  // ── Send via EmailJS ──
  if (typeof emailjs === 'undefined' || !window._EMAILJS_READY) {
    showSubmitStatus('Email service not available. Please email info@livabletelluride.org directly with your event link.', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Scanning event page...';
  btn.style.opacity = '0.6';

  // ── Scrape the submitted URL for event details ──
  const scraped = await scrapeEventUrl(url);
  btn.textContent = 'Submitting...';

  const siteUrl = window.location.origin + window.location.pathname;

  // Build the GitHub Issue body with structured event data
  // The site reads these key: value pairs to render the event card
  let issueBody = 'Event: ' + eventName + '\n';
  issueBody += 'Date: ' + (toJsonDate(scraped.date) || 'YYYY-MM-DD (please fill in)') + '\n';
  if (scraped.endDate) issueBody += 'EndDate: ' + toJsonDate(scraped.endDate) + '\n';
  issueBody += 'URL: ' + url + '\n';
  if (scraped.location) issueBody += 'Location: ' + scraped.location + '\n';
  if (scraped.ticketUrl) issueBody += 'Tickets: ' + scraped.ticketUrl + '\n';
  if (scraped.image) issueBody += 'Image: ' + scraped.image + '\n';
  issueBody += 'Description: ' + (scraped.description ? scraped.description.slice(0, 200) : '(add a short description)') + '\n';
  issueBody += '\n---\n';
  issueBody += 'Submitted by: ' + submitter + '\n';
  if (message) issueBody += 'Note: ' + message + '\n';
  issueBody += 'Source page title: ' + (scraped.title || '(could not read)') + '\n';

  // Build the one-click GitHub Issue creation URL
  const issueTitle = '[Event] ' + eventName;
  const approveUrl = 'https://github.com/morgan524/morgan524-telluride-gov-hub/issues/new'
    + '?title=' + encodeURIComponent(issueTitle)
    + '&body=' + encodeURIComponent(issueBody)
    + '&labels=' + encodeURIComponent('approved-event');

  // Build a readable email summary
  let detailsBlock = '--- EXTRACTED FROM PAGE ---\n';
  detailsBlock += 'Page Title: ' + (scraped.title || '(none found)') + '\n';
  detailsBlock += 'Date: ' + (formatScrapedDate(scraped.date) || '(not found — please check page manually)') + '\n';
  if (scraped.endDate) detailsBlock += 'End Date: ' + formatScrapedDate(scraped.endDate) + '\n';
  if (scraped.location) detailsBlock += 'Location: ' + scraped.location + '\n';
  if (scraped.ticketUrl) detailsBlock += 'Ticket URL: ' + scraped.ticketUrl + '\n';
  if (scraped.image) detailsBlock += 'Image: ' + scraped.image + '\n';
  detailsBlock += 'Description: ' + (scraped.description ? scraped.description.slice(0, 300) : '(none found)') + '\n';
  detailsBlock += '\n--- TO APPROVE ---\n';
  detailsBlock += 'Click the Approve link above to create a GitHub Issue.\n';
  detailsBlock += 'Review the pre-filled details, edit if needed, then click "Submit new issue".\n';
  detailsBlock += 'The event will appear on the Tell-Hub automatically.\n';
  detailsBlock += 'To remove it later, just close the issue on GitHub.';

  emailjs.send(window._EMAILJS_SERVICE, window._EMAILJS_EVENT_TEMPLATE || window._EMAILJS_TEMPLATE, {
    to_email: 'info@livabletelluride.org',
    from_name: submitter,
    event_name: eventName,
    event_url: url,
    message: (message ? 'Submitter note: ' + message + '\n\n' : '') + detailsBlock,
    approve_url: approveUrl,
    deny_url: siteUrl,
    site_name: 'Telluride Tell-Hub',
    topic: 'Event Submission',
    comment_body: 'Event: ' + eventName + '\nURL: ' + url + '\nSubmitted by: ' + submitter + (message ? '\nMessage: ' + message : '') + '\n\n' + detailsBlock,
    comment_type: 'event_submission',
    review_url: siteUrl
  }).then(
    () => {
      showSubmitStatus('Thanks! Your event has been submitted for review.', 'success');
      urlInput.value = '';
      nameInput.value = '';
      submitterInput.value = '';
      if (messageInput) messageInput.value = '';
      btn.disabled = false;
      btn.textContent = 'SUBMIT EVENT';
      btn.style.opacity = '1';
    },
    (err) => {
      console.warn('[GovHub] Event submission email failed:', err);
      showSubmitStatus('Something went wrong. Please try again or email info@livabletelluride.org directly.', 'error');
      btn.disabled = false;
      btn.textContent = 'SUBMIT EVENT';
      btn.style.opacity = '1';
    }
  );
}

function showSubmitStatus(msg, type) {
  const el = document.getElementById('eventSubmitStatus');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  if (type === 'success') {
    el.style.background = 'linear-gradient(180deg,rgba(47,86,77,0.08),rgba(47,86,77,0.04))';
    el.style.borderColor = 'rgba(47,86,77,0.18)';
    el.style.color = 'var(--forest)';
  } else {
    el.style.background = 'linear-gradient(180deg,#f6eee5,#efe5da)';
    el.style.borderColor = 'rgba(201,125,42,0.18)';
    el.style.color = '#b65f12';
  }
}
