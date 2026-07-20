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
    ttimes:    LOGO_BASE + 'TT%20Logo.png'
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

  const api = { load: load, loadOne: loadOne, showError: showError,
    todayMT: todayMT, mtDateKey: mtDateKey, parseDateKey: parseDateKey,
    fmtDate: fmtDate, esc: esc, safeUrl: safeUrl,
    ENTITY_LOGOS: ENTITY_LOGOS, entityLogo: entityLogo, _bucket: bucket };

  root.LTData = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
