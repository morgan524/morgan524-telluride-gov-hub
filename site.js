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
  var LOGIN_HREF = ROOT + 'hub-bub.html';   // Firebase auth entry (re-shelled Hub-Bub)

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
      '<a class="lt-pill-donate" href="' + (activeItem === 'donate.html' ? '#' : esc(ROOT + 'donate.html')) + '">Donate</a>' +
      '<button class="lt-pill-lang" type="button" data-lang-toggle>Espa&ntilde;ol</button>' +
      '<a class="lt-pill-login" href="' + esc(LOGIN_HREF) + '">Log In</a></div>';

    return '<nav class="lt-nav" aria-label="Main">' +
      '<div class="lt-nav-row">' +
      '<a class="lt-nav-logo" href="' + esc(ROOT + 'index.html') + '" aria-label="Livable Telluride home">' +
      '<img src="' + esc(ROOT + 'uploads/lt-logo.png') + '" alt="Livable Telluride"></a>' +
      '<div class="lt-nav-links">' + links + '</div>' +
      '<div class="lt-nav-cta">' +
      '<a class="lt-pill-donate" href="' + esc(ROOT + 'donate.html') + '">Donate</a>' +
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

  /* ---- "Add to Home Screen" install prompt --------------------------------
     Nudges visitors to save Livable Telluride as an installable web app (a
     standalone icon on the phone home screen — the manifest is already wired
     up). Two paths, because the platforms differ:
       • Chromium (Android / desktop) fires `beforeinstallprompt`; we defer it
         and show a one-tap Install button. These installs honor the manifest
         start_url ('/'), so the button may appear on ANY page.
       • iOS Safari never fires that event, so we show the manual
         Share ▸ "Add to Home Screen" instruction instead. iOS bookmarks the
         CURRENT page (not start_url), so we only show it on the homepage —
         the whole point is saving the homepage.
     Suppressed when already installed, on file://, or after a recent dismissal
     (30-day cooldown in localStorage). Lives here so every page inherits it
     from one source, same as the header/footer. */
  (function () {
    if (!/^https?:$/.test(location.protocol)) return;                    // dev/file:// → skip
    var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
    if (standalone) return;                                              // already installed

    var KEY = 'lt-a2hs-dismissed-until';
    function suppressed() {
      try { return Date.now() < (parseInt(localStorage.getItem(KEY), 10) || 0); } catch (e) { return false; }
    }
    function suppress(days) {
      try { localStorage.setItem(KEY, String(Date.now() + days * 86400000)); } catch (e) {}
    }
    if (suppressed()) return;

    var ua = navigator.userAgent || '';
    var isIOS = /iP(hone|ad|od)/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);   // iPadOS 13+ reports as Mac
    var isSafari = /safari/i.test(ua) && !/(crios|fxios|edgios|chrome|android)/i.test(ua);
    var onHome = (page === '' || page === 'index.html');
    var deferred = null;

    function remove() {
      var el = document.getElementById('lt-a2hs');
      if (el) el.parentNode.removeChild(el);
    }

    // iOS share glyph (box + up-arrow) so the instruction points at the real button.
    var SHARE_SVG = '<svg class="lt-a2hs-share" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" ' +
      'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/></svg>';

    function show(mode) {
      if (document.getElementById('lt-a2hs')) return;
      var msg = mode === 'ios'
        ? 'Tap ' + SHARE_SVG + ' below, then <b>Add to Home&nbsp;Screen</b>.'
        : 'Save it to your home screen for one-tap access.';
      var action = mode === 'native'
        ? '<button class="lt-a2hs-go" type="button" data-a2hs-install>Install</button>'
        : '';
      var el = document.createElement('div');
      el.id = 'lt-a2hs';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-label', 'Add Livable Telluride to your home screen');
      el.innerHTML =
        '<img class="lt-a2hs-icon" src="' + esc(ROOT + 'logo/icon-192.png') + '" alt="">' +
        '<div class="lt-a2hs-body"><strong>Add Livable Telluride</strong><span>' + msg + '</span></div>' +
        action +
        '<button class="lt-a2hs-x" type="button" data-a2hs-close aria-label="Dismiss">&times;</button>';
      document.body.appendChild(el);

      var close = el.querySelector('[data-a2hs-close]');
      if (close) close.addEventListener('click', function () { remove(); suppress(30); });
      var go = el.querySelector('[data-a2hs-install]');
      if (go) go.addEventListener('click', function () {
        if (!deferred) { remove(); return; }
        deferred.prompt();
        deferred.userChoice.then(function (choice) {
          suppress(choice && choice.outcome === 'accepted' ? 3650 : 30);   // installed → don't nag again
          deferred = null; remove();
        });
      });
    }

    // Chromium (Android / desktop): capture the native mini-infobar, offer our own.
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferred = e;
      show('native');
    });
    window.addEventListener('appinstalled', function () { remove(); suppress(3650); });

    // iOS Safari never fires beforeinstallprompt → manual instructions, homepage
    // only, delayed a few seconds so it doesn't compete with first paint.
    if (isIOS && isSafari && onHome) setTimeout(function () { show('ios'); }, 3500);

    // Styles (light-only, matching lt.css — the site has no dark scheme).
    var css = document.createElement('style');
    css.textContent =
      '#lt-a2hs{position:fixed;left:12px;right:12px;bottom:12px;z-index:9000;max-width:440px;margin:0 auto;' +
      'display:flex;align-items:center;gap:12px;padding:11px 12px;background:#fff;color:var(--forest,#24483f);' +
      'border:1.5px solid var(--forest,#24483f);border-radius:14px;box-shadow:0 12px 34px rgba(0,0,0,.20);' +
      "font:400 14px/1.4 var(--sans,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif);" +
      'animation:lt-a2hs-in .28s ease both}' +
      '@keyframes lt-a2hs-in{from{transform:translateY(18px);opacity:0}to{transform:none;opacity:1}}' +
      '.lt-a2hs-icon{width:42px;height:42px;border-radius:9px;flex:none}' +
      '.lt-a2hs-body{flex:1 1 auto;min-width:0}' +
      '.lt-a2hs-body strong{display:block;font-weight:700}' +
      '.lt-a2hs-body span{display:block;color:var(--body2,#3d4b47);font-size:13px;margin-top:1px}' +
      '.lt-a2hs-body b{font-weight:700;color:var(--forest,#24483f)}' +
      '.lt-a2hs-share{vertical-align:-3px;color:var(--rust,#a04f24)}' +
      '.lt-a2hs-go{flex:none;border:0;cursor:pointer;background:var(--forest,#24483f);color:#fff;' +
      'font:700 13px/1 inherit;padding:10px 15px;border-radius:9px}' +
      '.lt-a2hs-x{flex:none;border:0;background:transparent;cursor:pointer;color:#9aa8a1;' +
      'font-size:22px;line-height:1;padding:0 2px}';
    document.head.appendChild(css);
  })();
})();
