/* ============================================================
   Livable Telluride — shared header + footer (single source of truth).
   Every page drops <div id="lt-header"></div> after <body> and
   <div id="lt-footer"></div> before </body>, then loads this file with
   a PLAIN <script> tag placed AFTER both placeholders (never injected
   dynamically — DCL-race rule). Nav/footer edits happen HERE only.

   Link rule:
   - Pages that exist in this redesign → page-relative hrefs (work on
     file://, on /redesign/ staging, and at root after cutover).
   - Existing apps not yet rebuilt → root-absolute hrefs (staging users
     land on the live page; still correct after cutover).
   Move a page from PENDING to BUILT by flipping `built: true`.
   ============================================================ */
(function () {
  'use strict';

  // ---- Information architecture (approved 2026-07-20) ----
  var NAV = [
    { key: 'learn', label: 'Learn', items: [
      { href: 'local-news.html',   label: 'Local News',    built: true },
      { href: 'deep-dives.html',   label: 'Deep Dives',    built: true },
      { href: '/zoning-map/',      label: 'Zoning Map',    built: true  },   // existing app (kept)
      { href: '/projects-map/',    label: 'Projects Map',  built: true  }    // existing app (kept)
    ]},
    { key: 'connect', label: 'Connect', items: [
      { href: 'events.html',       label: 'Events',        built: true },
      { href: 'local-orgs.html',   label: 'Local Orgs',    built: true },
      { href: 'hub-bub.html',      label: 'Hub-Bub',       built: false },
      { href: 'housing.html',      label: 'Housing',       built: true }
    ]},
    { key: 'act', label: 'Act', items: [
      { href: 'gov-hub.html',      label: 'Gov-Hub',       built: true },
      { href: '/v2/vote-tracker.html', label: 'Vote Tracker', built: true },   // existing app (kept)
      { href: 'legal-notices.html',label: 'Legal Notices', built: true }
    ]}
  ];
  var ABOUT = { href: 'about.html', label: 'About', built: true };
  var LOGIN_HREF = '/hub-bub.html';   // Firebase auth entry (root-absolute until Hub-Bub rebuilds)

  // Pages not in the nav inherit a parent's active state.
  var PROXY = { 'deep-dive.html': 'deep-dives.html', 'index.html': '' };

  var page = (location.pathname.split('/').pop() || 'index.html');
  var activeItem = PROXY.hasOwnProperty(page) ? PROXY[page] : page;

  function resolveHref(item) {
    if (item.href.charAt(0) === '/') return item.href;               // root-absolute (existing app)
    return item.built ? item.href : '/' + item.href;                 // pending pages → live site
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
    links += '<a class="lt-top' + (ABOUT.href === activeItem ? ' active' : '') + '" href="' +
      esc(resolveHref(ABOUT)) + '">About</a>';

    var drawer = NAV.map(function (g) {
      return '<div class="grp">' + esc(g.label) + '</div>' +
        g.items.map(function (it) { return '<a href="' + esc(resolveHref(it)) + '">' + esc(it.label) + '</a>'; }).join('');
    }).join('') +
      '<div class="grp">More</div><a href="' + esc(resolveHref(ABOUT)) + '">About</a>' +
      '<div class="drawer-cta">' +
      '<a class="lt-pill-donate" href="' + (activeItem === 'donate.html' ? '#' : 'donate.html') + '">Donate</a>' +
      '<button class="lt-pill-lang" type="button" data-lang-toggle>Espa&ntilde;ol</button>' +
      '<a class="lt-pill-login" href="' + esc(LOGIN_HREF) + '">Log In</a></div>';

    return '<nav class="lt-nav" aria-label="Main">' +
      '<div class="lt-nav-row">' +
      '<a class="lt-nav-logo" href="index.html" aria-label="Livable Telluride home">' +
      '<img src="uploads/lt-logo.png" alt="Livable Telluride"></a>' +
      '<div class="lt-nav-links">' + links + '</div>' +
      '<div class="lt-nav-cta">' +
      '<a class="lt-pill-donate" href="donate.html">Donate</a>' +
      '<button class="lt-pill-lang" type="button" data-lang-toggle title="Cambiar idioma / Switch language">Espa&ntilde;ol</button>' +
      '<a class="lt-pill-login" href="' + esc(LOGIN_HREF) + '">Log In</a>' +
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
      '<a href="local-news.html">Learn</a>' +
      '<a href="events.html">Connect</a>' +
      '<a href="gov-hub.html">Act</a>' +
      '<a href="about.html">About</a>' +
      '<a href="donate.html">Donate</a>' +
      '</div></div></footer>';
  }

  // ---- inject (loudly if placeholders are missing — standing rule) ----
  var h = document.getElementById('lt-header');
  if (h) h.outerHTML = headerHTML();
  else console.error('[site.js] #lt-header placeholder missing on ' + page);
  var f = document.getElementById('lt-footer');
  if (f) f.outerHTML = footerHTML();
  else console.error('[site.js] #lt-footer placeholder missing on ' + page);

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
})();
