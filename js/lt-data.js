/* ============================================================
   LTData — shared data layer for rebuilt (JSON-first) pages.
   Redesign prep, 2026-07-20. See docs/redesign/page-inventory.md.

   Rules this module enforces (the "standing rules" of the rebuild):
   - Pages fetch data/*.json mirrors — never the gov-data/gov-helpers
     JS globals, and NO silent fallbacks: any failure is console.error'd
     and surfaced via a visible error state (showError).
   - All calendar-date handling is America/Denver-anchored. Never use
     Date.toISOString().slice(0,10) for a calendar date (UTC skew bug).

   Usage:
     LTData.load(['community-events', 'koto-community-events'])
       .then(({ 'community-events': ce, 'koto-community-events': ke }) => render(...))
       .catch((err) => LTData.showError(grid, err));

   Node-testable: pure helpers are exported via module.exports.
   ============================================================ */
(function (root) {
  'use strict';

  // Same 10-minute cache bucket every existing page uses for ?v= busters,
  // so JSON freshness matches the site's established cadence.
  function bucket() { return Math.floor(Date.now() / 600000); }

  // Where mirrors live. Same-origin by default; local previews opened from
  // disk get production data (file:// has no /data/), matching the existing
  // preview-data-from-production convention.
  function dataOrigin() {
    if (root.LT_DATA_ORIGIN) return root.LT_DATA_ORIGIN;              // explicit override
    if (root.location && /^https?:$/.test(root.location.protocol)) return '';
    return 'https://livabletelluride.org';
  }

  // Fetch one mirror: data/<name>.json → parsed JSON. Rejects loudly.
  function loadOne(name) {
    const url = dataOrigin() + '/data/' + name + '.json?v=' + bucket();
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
      return r.json();
    });
  }

  // Fetch many mirrors in parallel → { name: data }. If ANY fail, the whole
  // load rejects with an error naming every failed file (after logging each).
  // No partial-silent renders: the page decides what to do, visibly.
  function load(names) {
    return Promise.all(names.map(function (n) {
      return loadOne(n).then(
        function (d) { return { n: n, ok: true, d: d }; },
        function (e) { console.error('[LTData] failed to load ' + n + ':', e); return { n: n, ok: false, e: e }; }
      );
    })).then(function (results) {
      const failed = results.filter(function (r) { return !r.ok; });
      if (failed.length) {
        throw new Error('Failed to load: ' + failed.map(function (r) { return r.n; }).join(', '));
      }
      const out = {};
      results.forEach(function (r) { out[r.n] = r.d; });
      return out;
    });
  }

  // Visible error state — the anti-silent-failure render. Pages call this in
  // their .catch() so a data outage looks broken (and gets reported) instead
  // of looking like "no events this week".
  function showError(el, err) {
    if (!el) return;
    el.innerHTML = '<div style="padding:28px 22px;border:1px solid #e3c9c2;background:#fdf6f4;' +
      'border-radius:10px;color:#7a3b2e;font-size:15px;line-height:1.6;">' +
      '<strong>This section failed to load.</strong> Please refresh in a minute &#8212; ' +
      'if it keeps happening, email <a href="mailto:info@livabletelluride.org" ' +
      'style="color:#a0531f;text-decoration:underline;">info@livabletelluride.org</a> ' +
      'so we can fix it.</div>';
    if (err) console.error('[LTData]', err);
  }

  // ---- MT-anchored date helpers ------------------------------------------
  // Calendar-date key ('YYYY-MM-DD') for a Date, in America/Denver.
  function mtDateKey(d) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(d);
  }
  function todayMT() { return mtDateKey(new Date()); }

  // Parse a 'YYYY-MM-DD' key to a Date safely for display math: anchored at
  // noon so no timezone can shift the calendar day.
  function parseDateKey(key) { return new Date(key + 'T12:00:00'); }

  // Display formatter for a date key, MT-anchored.
  // fmtDate('2026-07-20', { weekday:'short', month:'short', day:'numeric' }) → 'Mon, Jul 20'
  function fmtDate(key, opts) {
    return parseDateKey(key).toLocaleDateString('en-US',
      Object.assign({ timeZone: 'America/Denver' }, opts || {}));
  }

  // ---- public-entity logos -----------------------------------------------
  // Keyed by week-meetings.json `source`. Single source of truth for every
  // page that shows a meeting's jurisdiction mark (gov-hub, homepage).
  var LOGO_BASE = 'https://livabletelluride.org/logo/';
  var ENTITY_LOGOS = {
    telluride: LOGO_BASE + 'Telluride%20Town.png',
    county:    LOGO_BASE + 'San%20Miguel%20County.png',
    mv:        LOGO_BASE + 'Mountain%20village%20Town.jpg',
    school:    LOGO_BASE + 'School%20District%20Telluride.png',
    smart:     LOGO_BASE + 'SMART.png',
    fire:      LOGO_BASE + 'Telluride%20Fire.png',
    med:       LOGO_BASE + 'Telluride%20Hospital%20Dist.jpeg',
    norwood:   LOGO_BASE + 'Norwood%20Town.jpeg',
    ophir:     LOGO_BASE + 'Ophir.jpeg',
    rico:      LOGO_BASE + 'Rico%20Town.png',
    ridgway:   LOGO_BASE + 'Ridgway%20Town.png',
    ouray:     LOGO_BASE + 'Ouray%20Town.png',
    airport:   LOGO_BASE + 'Airport.png',
    ttimes:    LOGO_BASE + 'TT%20Logo.png',
    smb:       LOGO_BASE + 'San%20Miguel%20Basin.png',
    tmvoa:     LOGO_BASE + 'TMVOA%20Logo.png'
  };
  function entityLogo(source) { return ENTITY_LOGOS[source] || ''; }

  // ---- misc shared helpers ------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Allow only http(s) hrefs (blocks javascript: smuggling from data).
  function safeUrl(u, fallback) {
    return /^https?:\/\//i.test(u || '') ? u : (fallback || '#');
  }

  // ---- calendar (.ics) --------------------------------------------------
  // Build a downloadable single-event iCalendar file as a data: URI, shared by
  // Gov-Hub, Events, and the town hubs (Morgan 2026-07-23). Times are FLOATING
  // local (no TZID/Z) — everyone here is Mountain Time, and a floating time
  // shows at that wall-clock hour in any calendar without tz math. No time →
  // an all-day event. `ev`: { title, date:'YYYY-MM-DD', endDate?, time?,
  // location?, description?, url? }. An endDate LATER than date (a festival
  // run) always renders as a multi-day all-day block — a start/end clock time
  // would otherwise imply the event runs continuously overnight.
  function icsFmtDate(iso) { return iso.replace(/-/g, ''); }
  function icsAddDay(iso) {
    var p = iso.split('-'); var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + 1));
    return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, '0') + String(d.getUTCDate()).padStart(2, '0');
  }
  // "6:00 PM" / "6 PM" → {h,m}; null if unparseable.
  function parseClock(s) {
    var m = String(s || '').match(/(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)/i);
    if (!m) return null;
    var h = parseInt(m[1], 10) % 12; if (/p/i.test(m[3])) h += 12;
    return { h: h, m: m[2] ? parseInt(m[2], 10) : 0 };
  }
  function icsEsc(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/[,;]/g, '\\$&').replace(/\r?\n/g, '\\n'); }
  function icsDataUri(ev) {
    if (!ev || !ev.date || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) return '';
    var multiDay = /^\d{4}-\d{2}-\d{2}$/.test(ev.endDate || '') && ev.endDate > ev.date;
    var times = String(ev.time || '').split(/[-–—]|to\b/i);
    var start = multiDay ? null : parseClock(times[0]), end = times.length > 1 ? parseClock(times[1]) : null;
    var dtStart, dtEnd;
    var pad = function (n) { return String(n).padStart(2, '0'); };
    if (start) {
      var base = icsFmtDate(ev.date) + 'T';
      dtStart = 'DTSTART:' + base + pad(start.h) + pad(start.m) + '00';
      var eh = end ? end.h : (start.h + 1) % 24, em = end ? end.m : start.m;
      var endDate = (!end && start.h === 23) ? icsAddDay(ev.date) : icsFmtDate(ev.date);
      dtEnd = 'DTEND:' + endDate + 'T' + pad(eh) + pad(em) + '00';
    } else {
      dtStart = 'DTSTART;VALUE=DATE:' + icsFmtDate(ev.date);
      dtEnd = 'DTEND;VALUE=DATE:' + icsAddDay(multiDay ? ev.endDate : ev.date);   // DTEND is exclusive
    }
    var uid = 'lt-' + icsFmtDate(ev.date) + '-' + Math.abs(String(ev.title || '').split('').reduce(function (a, c) { return (a * 31 + c.charCodeAt(0)) | 0; }, 7)) + '@livabletelluride.org';
    var desc = ev.description || '';
    if (ev.url) desc = (desc ? desc + '\n\n' : '') + ev.url;
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Livable Telluride//EN', 'BEGIN:VEVENT',
      'UID:' + uid, dtStart, dtEnd, 'SUMMARY:' + icsEsc(ev.title || 'Event')];
    if (ev.location) lines.push('LOCATION:' + icsEsc(ev.location));
    if (desc) lines.push('DESCRIPTION:' + icsEsc(desc));
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(lines.join('\r\n'));
  }
  // A slug for the download filename.
  function icsFilename(title, date) {
    return (String(title || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'event') + '-' + (date || '') + '.ics';
  }

  // Bold proper-noun runs + standalone street addresses in meeting summaries —
  // THE shared copy of the emphasizeNames heuristic (same rules as the
  // gov-hub.html cards and weekly-email.js digest; keep the three in sync).
  // Escapes internally: input is raw text, output is safe HTML.
  var NAME_STOP = {}; ('The A An On In At As It This That These Those Its Their And But Or If After Before During While Also Both Two Three Four Five Several Additional Other Following New Council Board Commission Committee Ordinance Ordinances Resolution Resolutions Meeting Session Sessions Town County City District State Chair Mayor Public Staff Members Member Consent Agenda Work Executive Regular Special Substantial Councilors January February March April May June July August September October November December Monday Tuesday Wednesday Thursday Friday Saturday Sunday Section Stage Phase Article Item Step Unit No Yes Accommodations Building Buildings Preliminary Large Scale').split(' ').forEach(function (w) { NAME_STOP[w] = 1; });
  var EMPH_ADDR = '\\d+\\s+(?:(?:N|S|E|W|NE|NW|SE|SW|North|South|East|West)\\.?\\s+[A-Z][A-Za-z’\']*(?:\\s+[A-Z][A-Za-z’\']*)*(?:\\s+(?:Ave|Avenue|St|Street|Rd|Road|Dr|Drive|Blvd|Boulevard|Ln|Lane|Way|Ct|Court|Pl|Place|Cir|Circle|Trail|Trl|Pkwy|Parkway|Hwy|Highway))?|[A-Z][A-Za-z’\']*(?:\\s+[A-Z][A-Za-z’\']*)*\\s+(?:Ave|Avenue|St|Street|Rd|Road|Dr|Drive|Blvd|Boulevard|Ln|Lane|Way|Ct|Court|Pl|Place|Cir|Circle|Trail|Trl|Pkwy|Parkway|Hwy|Highway))';
  var EMPH_RUN = "[A-Z][a-z]+(?:['’][A-Za-z]+)?(?:\\s+(?:of|the|[A-Z][a-z]+(?:['’][A-Za-z]+)?))*";
  function emphasizeNames(raw) {
    raw = String(raw || '');
    var re = new RegExp('(' + EMPH_ADDR + ')|(' + EMPH_RUN + ')', 'g');
    var html = '', last = 0, m;
    while ((m = re.exec(raw)) !== null) {
      html += esc(raw.slice(last, m.index));
      if (m[1]) {
        var locates = /\b(?:at|on)\s+$/i.test(raw.slice(0, m.index));
        html += locates ? esc(m[1]) : '<strong>' + esc(m[1]) + '</strong>';
        last = m.index + m[1].length; continue;
      }
      var run = m[2], trimmed = run.replace(/(?:\s+(?:of|the))+$/, '');
      var tail = run.slice(trimmed.length), leadThe = '';
      if (/\s/.test(trimmed)) { var t = trimmed.match(/^(The\s+)(?=[A-Z])/); if (t) { leadThe = t[1]; trimmed = trimmed.slice(leadThe.length); } }
      var multi = /\s/.test(trimmed);
      var before = raw.slice(0, m.index).replace(/\s+$/, '');
      var sentenceStart = before === '' || /[.!?]$/.test(before);
      var sig = trimmed.split(/\s+/).filter(function (w) { return !/^(?:of|the)$/i.test(w); });
      var allStop = sig.length > 0 && sig.every(function (w) { return NAME_STOP[w]; });
      var bold = !allStop && (multi || (!sentenceStart && !NAME_STOP[trimmed]));
      html += esc(leadThe) + (bold ? '<strong>' + esc(trimmed) + '</strong>' : esc(trimmed)) + esc(tail);
      last = m.index + run.length;
    }
    return html + esc(raw.slice(last));
  }

  // ---- Featured Action card --------------------------------------------
  // Shared by index.html and gov-hub.html. It lived inline on BOTH pages under
  // a "keep in sync" comment, and of course they drifted: the homepage gained
  // an image gallery and Gov-Hub silently kept rendering the older card. One
  // implementation is the only version of "in sync" that holds.
  //
  // `card` is the .fa-card element; it stays hidden unless the data is usable.
  // Expects children #fa-headline #fa-meta #fa-gallery #fa-blurb #fa-acts —
  // a page may omit #fa-gallery and simply gets no images.
  function renderFeaturedAction(card, fa) {
    if (!card || !fa) return false;
    const m = fa.meeting;
    if (!fa.headline || !m || !m.date || m.date < todayMT()) return false;   // stale or empty
    const byId = (id) => card.querySelector('#' + id) || document.getElementById(id);
    byId('fa-headline').textContent = fa.headline;
    byId('fa-meta').textContent = [m.sourceLabel, m.humanDate, m.time, m.location]
      .filter(Boolean).join(' · ');
    byId('fa-blurb').innerHTML = emphasizeNames(fa.blurb || '');

    const wrap = byId('fa-gallery');
    if (wrap) {
      // Accepts the images[] shape and the older single `image`.
      let imgs = Array.isArray(fa.images) ? fa.images.slice() : [];
      if (!imgs.length && fa.image) imgs = [{ src: fa.image, alt: fa.imageAlt || '', caption: fa.imageCredit || '' }];
      // NOT safeUrl here — that is for outbound links and rejects anything not
      // http(s)://, which would turn our own /assets/... paths into '#'.
      const okSrc = (u) => /^\/[^/]/.test(u || '') || /^https:\/\//i.test(u || '');
      const html = imgs.filter(im => im && okSrc(im.src)).map(im =>
        '<figure class="fa-figure"><img src="' + esc(im.src) + '" alt="' + esc(im.alt || '') + '" loading="lazy">'
        + (im.caption ? '<figcaption>' + esc(im.caption) + '</figcaption>' : '')
        + '</figure>').join('');
      wrap.innerHTML = html;
      wrap.className = 'fa-gallery' + (imgs.length > 1 ? ' fa-gallery-multi' : '');
      wrap.hidden = !html;
    }

    let acts = '';
    if (fa.deepDive && fa.deepDive.href) acts += '<a class="fa-dive" href="' + esc(fa.deepDive.href) + '">Read the ' + esc(fa.deepDive.label) + ' deep dive &rarr;</a>';
    if (m.agendaUrl) acts += '<a class="fa-plain" href="' + esc(safeUrl(m.agendaUrl)) + '" target="_blank" rel="noopener">View Agenda</a>';
    if (m.packetUrl) acts += '<a class="fa-plain" href="' + esc(safeUrl(m.packetUrl)) + '" target="_blank" rel="noopener">Agenda Packet</a>';
    // Both remote ways in ride along whenever the meeting carries them: Zoom to
    // take part, the livestream to watch (Morgan, 2026-08-19 — "we always need
    // to include the Zoom link and the YouTube link to join in"). A pin with no
    // week-meetings row still gets them: build-featured-action.js honours
    // pin.zoomLink / pin.livestream and falls back to the entity's channel.
    if (m.zoomLink) acts += '<a class="fa-plain" href="' + esc(safeUrl(m.zoomLink)) + '" target="_blank" rel="noopener">Join Zoom</a>';
    if (m.livestream) {
      const liveLabel = m.livestreamLabel
        || (/youtube\.com|youtu\.be/i.test(m.livestream) ? 'Watch on YouTube' : 'Watch the Livestream');
      acts += '<a class="fa-plain" href="' + esc(safeUrl(m.livestream)) + '" target="_blank" rel="noopener">' + esc(liveLabel) + '</a>';
    }
    byId('fa-acts').innerHTML = acts;
    card.style.display = 'block';
    return true;
  }

  const api = { load: load, loadOne: loadOne, showError: showError,
    todayMT: todayMT, mtDateKey: mtDateKey, parseDateKey: parseDateKey,
    fmtDate: fmtDate, esc: esc, safeUrl: safeUrl, emphasizeNames: emphasizeNames,
    icsDataUri: icsDataUri, icsFilename: icsFilename,
    renderFeaturedAction: renderFeaturedAction,
    ENTITY_LOGOS: ENTITY_LOGOS, entityLogo: entityLogo, _bucket: bucket };

  root.LTData = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
