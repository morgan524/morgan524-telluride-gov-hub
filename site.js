/* ============================================================
   Livable Telluride — shared header + footer (single source of truth).
   Every page drops <div id="lt-header"></div> after <body> and
   <div id="lt-footer"></div> before </body>, then loads this file with
   a PLAIN <script> tag placed AFTER both placeholders (never injected
   dynamically — DCL-race rule). Nav/footer edits happen HERE only.

   Link rule:
   - Pages that exist in this redesign → ROOT-prefixed hrefs. ROOT is the
     redesign mount point, computed from location.pathname ('/redesign/'
     on staging, '/' after cutover, the file path on file://). This lets
     nested pages (zoning-map/, projects-map/) share this same file.
   - Existing apps not yet rebuilt → root-absolute hrefs (staging users
     land on the live page; still correct after cutover).
   Move a page from PENDING to BUILT by flipping `built: true`.
   Map-style full-viewport pages may omit the footer by putting
   data-no-footer on <body>.
   ============================================================ */
(function () {
  'use strict';

  // Mount point of this site copy ('/redesign/' staged, '/' at root).
  var ROOT = (location.pathname.match(/^(.*\/redesign\/)/) || [null, '/'])[1];

  // ---- Information architecture (approved 2026-07-20) ----
  var NAV = [
    { key: 'learn', label: 'Learn', items: [
      { href: 'local-news.html',   label: 'Local News',    built: true },
      { href: 'deep-dives.html',   label: 'Deep Dives',    built: true },
      { href: 'zoning-map/index.html',   label: 'Zoning Map',   built: true },   // re-shelled app
      { href: 'projects-map/index.html', label: 'Projects Map', built: true }    // re-shelled app
    ]},
    { key: 'connect', label: 'Connect', items: [
      { href: 'events.html',       label: 'Events',        built: true },
      { href: 'local-orgs.html',   label: 'Local Orgs',    built: true },
      { href: 'hub-bub.html',      label: 'Hub-Bub',       built: true },    // re-shelled app
      { href: 'housing.html',      label: 'Housing',       built: true }
    ]},
    { key: 'act', label: 'Act', items: [
      { href: 'gov-hub.html',      label: 'Gov-Hub',       built: true },
      { href: '/v2/vote-tracker.html', label: 'Vote Tracker', built: true },   // existing app (kept)
      { href: 'legal-notices.html',label: 'Legal Notices', built: true }
    ]}
  ];
  // About left the top nav 2026-07-21 (lives on the homepage + footer now).
  // (Log In left the nav 2026-07-23 — Hub-Bub, the only login surface, has its own.)

  // Pages not in the nav inherit a parent's active state.
  var PROXY = {
    'deep-dive.html': 'deep-dives.html', 'index.html': '',
    'zoning-map/': 'zoning-map/index.html', 'projects-map/': 'projects-map/index.html'
  };

  // ROOT-relative path of this page ('gov-hub.html', 'zoning-map/index.html', …).
  var page = location.pathname.indexOf(ROOT) === 0 ? location.pathname.slice(ROOT.length) : (location.pathname.split('/').pop() || '');
  var activeItem = PROXY.hasOwnProperty(page) ? PROXY[page] : page;

  function resolveHref(item) {
    if (item.href.charAt(0) === '/') return item.href;               // root-absolute (existing app)
    return item.built ? ROOT + item.href : '/' + item.href;          // pending pages → live site
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---- header ----
  function headerHTML() {
    var links = NAV.map(function (g) {
      var isActive = g.items.some(function (it) { return it.href === activeItem; });
      var drop = g.items.map(function (it) {
        return '<a href="' + esc(resolveHref(it)) + '">' + esc(it.label) + '</a>';
      }).join('');
      return '<div class="lt-nav-item' + (isActive ? ' active' : '') + '">' +
        '<a href="#" aria-haspopup="true" aria-expanded="false" data-nav-group>' + esc(g.label) + ' &#9662;</a>' +
        '<div class="lt-drop">' + drop + '</div></div>';
    }).join('');

    var drawer = NAV.map(function (g) {
      return '<div class="grp">' + esc(g.label) + '</div>' +
        g.items.map(function (it) { return '<a href="' + esc(resolveHref(it)) + '">' + esc(it.label) + '</a>'; }).join('');
    }).join('') +
      '<div class="drawer-cta">' +
      '<button class="lt-pill-search" type="button" data-search-open aria-label="Search">' +
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="16.5" y1="16.5" x2="21" y2="21"></line></svg>' +
      'Search</button>' +
      '<button class="lt-pill-lang" type="button" data-lang-toggle>Espa&ntilde;ol</button></div>';

    return '<nav class="lt-nav" aria-label="Main">' +
      '<div class="lt-nav-row">' +
      '<a class="lt-nav-logo" href="' + esc(ROOT + 'index.html') + '" aria-label="Livable Telluride home">' +
      '<img src="' + esc(ROOT + 'uploads/lt-logo.png') + '" alt="Livable Telluride"></a>' +
      '<div class="lt-nav-links">' + links + '</div>' +
      '<div class="lt-nav-cta">' +
      // Nav CTA slimmed 2026-07-23 (per Morgan): Donate left the nav for a
      // homepage section (footer link remains); Log In left because the only
      // login surface is Hub-Bub, which has its own. Search takes the
      // prominent slot; Español stays.
      '<button class="lt-pill-search" type="button" data-search-open title="Search the site ( / )" aria-label="Search">' +
      '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="16.5" y1="16.5" x2="21" y2="21"></line></svg>' +
      'Search</button>' +
      '<button class="lt-pill-lang" type="button" data-lang-toggle title="Cambiar idioma / Switch language">Espa&ntilde;ol</button>' +
      '</div>' +
      '<button class="lt-burger" type="button" aria-label="Menu" data-burger>&#9776;</button>' +
      '</div><div class="lt-drawer">' + drawer + '</div></nav>' +
      '<div id="lvLangWidget"></div>';
  }

  // ---- footer ----
  function footerHTML() {
    return '<footer class="lt-footer"><div class="lt-footer-row">' +
      '<div><div class="brand">Livable Telluride</div>' +
      '<div class="tagline">Inform. Connect. Engage. Together.</div></div>' +
      '<div class="lt-footer-links">' +
      '<a href="' + esc(ROOT + 'start-here.html') + '">Start Here</a>' +
      '<a href="' + esc(ROOT + 'local-news.html') + '">Learn</a>' +
      '<a href="' + esc(ROOT + 'events.html') + '">Connect</a>' +
      '<a href="' + esc(ROOT + 'gov-hub.html') + '">Act</a>' +
      '<a href="' + esc(ROOT + 'about.html') + '">About</a>' +
      '<a href="' + esc(ROOT + 'donate.html') + '">Donate</a>' +
      '</div></div></footer>';
  }

  // ---- inject (loudly if placeholders are missing — standing rule) ----
  var h = document.getElementById('lt-header');
  if (h) h.outerHTML = headerHTML();
  else console.error('[site.js] #lt-header placeholder missing on ' + page);
  var f = document.getElementById('lt-footer');
  if (f) f.outerHTML = footerHTML();
  else if (!document.body.hasAttribute('data-no-footer')) console.error('[site.js] #lt-footer placeholder missing on ' + page);

  // Cloudflare Web Analytics (same beacon as the live site; skipped on file://).
  if (/^https?:$/.test(location.protocol)) {
    var cf = document.createElement('script');
    cf.defer = true;
    cf.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    cf.setAttribute('data-cf-beacon', '{"token": "6500d02421bc4da1bebfad6099e6027c"}');
    document.body.appendChild(cf);
  }

  // ---- dropdown a11y: tap/click toggles on touch (hover/focus handled in CSS) ----
  document.querySelectorAll('[data-nav-group]').forEach(function (label) {
    label.addEventListener('click', function (e) {
      e.preventDefault();
      var item = label.parentElement;
      var wasOpen = item.classList.contains('open');
      document.querySelectorAll('.lt-nav-item.open').forEach(function (x) { x.classList.remove('open'); });
      if (!wasOpen) item.classList.add('open');
      label.setAttribute('aria-expanded', String(!wasOpen));
    });
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.lt-nav-item')) {
      document.querySelectorAll('.lt-nav-item.open').forEach(function (x) { x.classList.remove('open'); });
    }
  });

  // ---- mobile drawer ----
  var burger = document.querySelector('[data-burger]');
  if (burger) burger.addEventListener('click', function () {
    document.querySelector('.lt-nav').classList.toggle('drawer-open');
  });

  /* ---- Español toggle ----------------------------------------------------
     Same mechanism as the live site (ported from index.html): Google
     Translate is the engine; we only set/clear the googtrans cookie and
     expose a binary EN/ES pill. All GT chrome is hidden via CSS. */
  function lvCurrentLang() {
    var m = document.cookie.match(/googtrans=\/en\/([a-z]+)/);
    return m ? m[1] : 'en';
  }
  function lvSetTransCookie(value) {
    var expires = '=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    var domains = ['', '.' + location.hostname, location.hostname];
    domains.forEach(function (d) {
      var c = 'googtrans' + (value ? '=/en/' + value : expires) + '; path=/';
      if (d) c += '; domain=' + d;
      document.cookie = c;
    });
  }
  window.googleTranslateElementInit = function () {
    new google.translate.TranslateElement({
      pageLanguage: 'en', includedLanguages: 'es',
      layout: google.translate.TranslateElement.InlineLayout.SIMPLE, autoDisplay: false
    }, 'lvLangWidget');
  };
  var gtCss = document.createElement('style');
  gtCss.textContent = '.goog-te-banner-frame{display:none!important}.goog-te-gadget{display:none!important}' +
    'body{top:0!important}#lvLangWidget{position:absolute;left:-9999px;top:-9999px;opacity:0;height:0;overflow:hidden}' +
    'font[style*="background-color"]{background:transparent!important;box-shadow:none!important}' +
    '.goog-tooltip,.goog-tooltip:hover{display:none!important}.goog-text-highlight{background:none!important;box-shadow:none!important}';
  document.head.appendChild(gtCss);

  function setLangLabels() {
    var es = lvCurrentLang() === 'es';
    document.querySelectorAll('[data-lang-toggle]').forEach(function (b) {
      b.textContent = es ? 'English' : 'Español';
    });
  }
  document.querySelectorAll('[data-lang-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      lvSetTransCookie(lvCurrentLang() === 'es' ? '' : 'es');
      location.reload();
    });
  });
  setLangLabels();
  if (lvCurrentLang() === 'es' && /^https?:$/.test(location.protocol)) {
    var s = document.createElement('script');
    s.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    document.body.appendChild(s);
  }

  /* ---- Site search (header 🔍 + "/" key) --------------------------------
     Overlay with typeahead over data/search-index.json (built by
     scripts/build-search-index.js each content-refresh run; ~115 KB,
     lazy-fetched ONCE on first open). No server, no dependencies. */
  var SEARCH_KINDS = { page: 'Pages', dive: 'Deep Dives', news: 'News', meeting: 'Upcoming Meetings', recap: 'Meeting Recaps', event: 'Events', org: 'Local Orgs', housing: 'Housing', legal: 'Legal Notices', blog: 'Blog' };
  var KIND_ORDER = ['page', 'dive', 'news', 'meeting', 'event', 'recap', 'org', 'housing', 'legal', 'blog'];
  var searchIdx = null, searchLoading = false, searchSel = -1, searchReadyCbs = [];

  var searchCss = document.createElement('style');
  searchCss.textContent =
    // Prominent solid pill — Search took over the nav's primary-CTA slot
    // when Donate/Log In left it (2026-07-23).
    '.lt-pill-search{display:inline-flex;align-items:center;gap:8px;font:700 16px/1 var(--sans,-apple-system,sans-serif);color:#fff;background:var(--forest,#24483f);border:0;border-radius:999px;padding:13px 24px;cursor:pointer;transition:background .12s;}' +
    '.lt-pill-search:hover{background:#1c3a33;}' +
    '.lt-drawer .lt-pill-search{font:700 14px/1 var(--sans,-apple-system,sans-serif);padding:11px 18px;}' +
    '.lt-search-overlay{position:fixed;inset:0;background:rgba(26,46,41,.55);z-index:200;display:none;align-items:flex-start;justify-content:center;padding:9vh 16px 16px;}' +
    '.lt-search-overlay.open{display:flex;}' +
    '.lt-search-box{background:#fdfbf6;border-radius:14px;width:640px;max-width:100%;box-shadow:0 18px 60px rgba(0,0,0,.35);overflow:hidden;display:flex;flex-direction:column;max-height:78vh;}' +
    '.lt-search-box input{border:0;outline:none;background:transparent;font:400 19px/1.4 inherit;padding:18px 20px;width:100%;box-sizing:border-box;border-bottom:1px solid #e4ddcd;}' +
    '.lt-search-results{overflow-y:auto;padding:6px 0 10px;}' +
    '.lt-search-h{font:700 11px/1 inherit;letter-spacing:.1em;text-transform:uppercase;color:#a0531f;padding:12px 20px 5px;}' +
    '.lt-search-r{display:block;padding:8px 20px;text-decoration:none;color:#1a2e29;}' +
    '.lt-search-r .t{font:600 15.5px/1.3 inherit;}' +
    '.lt-search-r .s{font:400 13px/1.45 inherit;color:#7a8a85;margin-top:1px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}' +
    '.lt-search-r:hover,.lt-search-r.sel{background:#eef1ee;}' +
    '.lt-search-empty{padding:22px 20px;font:400 14.5px/1.5 inherit;color:#7a8a85;}' +
    '.lt-search-foot{font:400 11.5px/1 inherit;color:#9aa8a2;padding:9px 20px;border-top:1px solid #eee7d8;display:flex;gap:14px;}';
  document.head.appendChild(searchCss);

  var overlay = document.createElement('div');
  overlay.className = 'lt-search-overlay';
  overlay.innerHTML = '<div class="lt-search-box" role="dialog" aria-label="Site search">' +
    '<input type="search" placeholder="Search meetings, news, events, orgs, deep dives…" aria-label="Search the site" autocomplete="off">' +
    '<div class="lt-search-results" aria-live="polite"></div>' +
    '<div class="lt-search-foot"><span>&#8629; open</span><span>&#8593;&#8595; navigate</span><span>esc close</span></div></div>';
  document.body.appendChild(overlay);
  var sInput = overlay.querySelector('input');
  var sResults = overlay.querySelector('.lt-search-results');

  function searchOrigin() {
    return /^https?:$/.test(location.protocol) ? '' : 'https://livabletelluride.org';
  }
  function loadIndex() {
    if (searchIdx || searchLoading) return;
    searchLoading = true;
    var bucket = Math.floor(Date.now() / 600000);   // same 10-min cadence as every data file
    fetch(searchOrigin() + '/data/search-index.json?v=' + bucket)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        searchIdx = (d && d.items) || [];
        searchRender(sInput.value);
        var cbs = searchReadyCbs; searchReadyCbs = [];
        cbs.forEach(function (fn) { try { fn(); } catch (e) {} });
      })
      .catch(function (e) {
        searchLoading = false;   // allow a retry on the next open
        console.error('[site.js] search index failed:', e);
        sResults.innerHTML = '<div class="lt-search-empty">Search couldn’t load — please refresh and try again.</div>';
        var cbs = searchReadyCbs; searchReadyCbs = [];
        cbs.forEach(function (fn) { try { fn(e); } catch (er) {} });
      });
  }
  function openSearch() {
    overlay.classList.add('open');
    sInput.value = ''; searchSel = -1; searchRender('');
    loadIndex();
    setTimeout(function () { sInput.focus(); }, 30);
  }
  function closeSearch() { overlay.classList.remove('open'); }

  // Scoring: every query token must hit (title or snippet); title hits and
  // prefix hits rank higher; upcoming/dated items get a small recency nudge.
  function searchRank(q) {
    var toks = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    var scored = [];
    for (var i = 0; i < searchIdx.length; i++) {
      var it = searchIdx[i];
      var t = (it.t || '').toLowerCase(), sn = (it.s || '').toLowerCase();
      var score = 0, ok = true;
      for (var j = 0; j < toks.length; j++) {
        var tk = toks[j];
        if (t.indexOf(tk) !== -1) score += (t.indexOf(tk) === 0 ? 30 : (new RegExp('\\b' + tk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(t) ? 20 : 12));
        else if (sn.indexOf(tk) !== -1) score += 6;
        else { ok = false; break; }
      }
      if (!ok) continue;
      if (it.k === 'page' || it.k === 'dive') score += 8;         // destinations beat individual items
      scored.push({ it: it, score: score });
    }
    scored.sort(function (a, b) { return b.score - a.score || String(b.it.d || '').localeCompare(String(a.it.d || '')); });
    return scored.slice(0, 30).map(function (x) { return x.it; });
  }

  function searchRender(q) {
    q = (q || '').trim();
    searchSel = -1;
    if (!searchIdx) { sResults.innerHTML = '<div class="lt-search-empty">Loading the index…</div>'; return; }
    if (q.length < 2) { sResults.innerHTML = '<div class="lt-search-empty">Type to search everything on the site — meetings, news, events, orgs, deep dives, housing, legal notices.</div>'; return; }
    var hits = searchRank(q);
    if (!hits.length) { sResults.innerHTML = '<div class="lt-search-empty">Nothing matched “' + esc(q) + '”. Try fewer or different words.</div>'; return; }
    // Group by kind, in a fixed order, preserving rank inside each group.
    var groups = {};
    hits.forEach(function (it) { (groups[it.k] = groups[it.k] || []).push(it); });
    var html = '';
    KIND_ORDER.forEach(function (k) {
      if (!groups[k]) return;
      html += '<div class="lt-search-h">' + esc(SEARCH_KINDS[k] || k) + '</div>';
      groups[k].forEach(function (it) {
        var ext = /^https?:\/\//.test(it.u) && it.u.indexOf('livabletelluride.org') === -1;
        html += '<a class="lt-search-r" href="' + esc(it.u) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' +
          '<div class="t">' + esc(it.t) + (ext ? ' &#8599;' : '') + '</div>' +
          (it.s ? '<div class="s">' + esc(it.s) + '</div>' : '') + '</a>';
      });
    });
    sResults.innerHTML = html;
  }

  var searchDebounce;
  sInput.addEventListener('input', function () {
    clearTimeout(searchDebounce);
    var v = sInput.value;
    searchDebounce = setTimeout(function () { searchRender(v); }, 80);
  });
  sInput.addEventListener('keydown', function (e) {
    var rows = sResults.querySelectorAll('.lt-search-r');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!rows.length) return;
      searchSel = e.key === 'ArrowDown' ? Math.min(searchSel + 1, rows.length - 1) : Math.max(searchSel - 1, 0);
      rows.forEach(function (r, i) { r.classList.toggle('sel', i === searchSel); });
      rows[searchSel].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      var target = rows[searchSel === -1 ? 0 : searchSel];
      if (target) target.click();
    } else if (e.key === 'Escape') { closeSearch(); }
  });
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeSearch(); });
  document.querySelectorAll('[data-search-open]').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelector('.lt-nav').classList.remove('drawer-open');
      openSearch();
    });
  });
  // "/" opens search anywhere (unless typing in a field); Esc closes.
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      var el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault(); openSearch();
    }
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeSearch();
  });

  /* Public API so pages can build their own inline search box (e.g. the
     homepage "Search here for any topic" field) over the same index/ranking.
     ready(cb) lazy-loads the index once, then fires cb; rank(q) returns the
     top hits; kinds/order mirror the overlay's grouping. */
  window.LTSearch = {
    kinds: SEARCH_KINDS,
    order: KIND_ORDER,
    open: openSearch,
    rank: function (q) { return searchIdx ? searchRank(q) : []; },
    ready: function (cb) {
      if (searchIdx) { cb(); return; }
      searchReadyCbs.push(cb);
      loadIndex();
    }
  };

  /* ---- "Save to your phone" hint (mobile A2HS discoverability) -----------
     The site has a valid manifest + icons but no service worker (retired),
     so neither iOS nor Chrome shows an automatic install prompt. This is a
     dismissible, instructions-only banner (no SW required) that simply tells
     mobile visitors the option exists and how — iOS via the Share sheet,
     Android via the browser menu. Shows once per device until dismissed;
     never shows when already installed (standalone) or on desktop. */
  (function () {
    // Skip: desktop, already-installed (home-screen launch), or dismissed before.
    var isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    var ua = navigator.userAgent || '';
    var isIOS = /iPhone|iPad|iPod/i.test(ua) && !window.MSStream;
    var isAndroid = /Android/i.test(ua);
    if (isStandalone || (!isIOS && !isAndroid)) return;
    try { if (localStorage.getItem('lt_a2hs_dismissed') === '1') return; } catch (e) {}
    // iPadOS 13+ reports as desktop Safari; treat touch Macs conservatively —
    // only show for clearly mobile UAs above, so no false banner on laptops.

    var a2hsCss = document.createElement('style');
    a2hsCss.textContent =
      '.lt-a2hs{position:fixed;left:12px;right:12px;bottom:12px;z-index:180;background:#fdfbf6;border:1px solid var(--forest,#24483f);border-radius:14px;box-shadow:0 10px 34px rgba(26,46,41,.28);padding:14px 16px;display:flex;gap:12px;align-items:flex-start;font-family:var(--sans,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif);animation:ltA2 .3s ease-out;}' +
      '@keyframes ltA2{from{transform:translateY(20px);opacity:0}to{transform:none;opacity:1}}' +
      '.lt-a2hs .ic{flex:0 0 auto;width:40px;height:40px;border-radius:9px;background:#eef1ee;display:flex;align-items:center;justify-content:center;font-size:22px;}' +
      '.lt-a2hs .bd{flex:1 1 auto;min-width:0;}' +
      '.lt-a2hs .t{font:700 15px/1.3 inherit;color:#1a2e29;margin:1px 0 3px;}' +
      '.lt-a2hs .s{font:400 13.5px/1.5 inherit;color:#5a6c61;}' +
      '.lt-a2hs .s b{color:var(--forest,#24483f);}' +
      '.lt-a2hs .shareglyph{display:inline-block;vertical-align:-2px;}' +
      '.lt-a2hs .x{flex:0 0 auto;border:0;background:transparent;color:#9aa8a2;font-size:20px;line-height:1;cursor:pointer;padding:2px 4px;}' +
      '@media (min-width:560px){.lt-a2hs{left:auto;right:16px;max-width:380px;}}';
    document.head.appendChild(a2hsCss);

    var iosShare = '<svg class="shareglyph" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#24483f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M8 8l4-4 4 4"></path><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7"></path></svg>';
    var body = isIOS
      ? 'Tap the Share button <span aria-hidden="true">' + iosShare + '</span> below, then <b>Add to Home Screen</b>.'
      : 'Open your browser menu <b>&#8942;</b>, then tap <b>Add to Home screen</b> (or <b>Install app</b>).';

    var bar = document.createElement('div');
    bar.className = 'lt-a2hs';
    bar.setAttribute('role', 'complementary');
    bar.setAttribute('aria-label', 'Save Livable Telluride to your phone');
    bar.innerHTML =
      '<div class="ic" aria-hidden="true">📲</div>' +
      '<div class="bd"><div class="t">Keep Livable Telluride one tap away</div>' +
      '<div class="s">' + body + '</div></div>' +
      '<button class="x" type="button" aria-label="Dismiss">&times;</button>';

    function dismiss() {
      try { localStorage.setItem('lt_a2hs_dismissed', '1'); } catch (e) {}
      bar.remove();
    }
    bar.querySelector('.x').addEventListener('click', dismiss);

    // Show after a short delay so it doesn't fight the first paint, and only
    // once the visitor has stuck around (scrolled or ~6s) — a returning-intent
    // signal, not an instant nag.
    var shown = false;
    function show() {
      if (shown) return; shown = true;
      document.body.appendChild(bar);
      window.removeEventListener('scroll', onScroll);
    }
    function onScroll() { if (window.scrollY > 400) show(); }
    window.addEventListener('scroll', onScroll, { passive: true });
    setTimeout(show, 6000);
  })();
})();
