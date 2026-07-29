/* lt-profile.js — "Update your profile" pop-up.
 *
 * A branded modal that lets an existing subscriber fill in missing info
 * (first/last name, region, "events near you" location) and manage their
 * subscriptions, writing back to Customer.io via the Cloudflare Worker
 * endpoint POST /update-profile (worker.js holds the API keys server-side).
 *
 * Built for the many legacy subscribers imported without names/location.
 *
 * Entry points:
 *   - window.lvShowProfile(prefill?)  — open it programmatically.
 *   - URL ?profile=1 (or #update-profile) auto-opens it. The weekly email's
 *     "Update your info" button links here with the person's own details, e.g.
 *       /?profile=1&email=…&fname=…&lname=…&region=…&addr=…&radius=…
 *     so they land with their record pre-filled and the blanks obvious.
 *
 * SAFETY: merge fields are only sent when non-empty (never blanks existing
 * data), and a subscription switch is only sent when the person actually
 * moves it — see the data-touched rule below. The Worker upserts the contact
 * by email in Customer.io.
 *
 * SCOPE: this popup covers the two headline subscriptions only. The four
 * Event Topics live on the full page (/profile.html), which can sign you in
 * and read your real state — a topic only makes sense alongside the Weekly
 * Update that carries it, and this popup can't know whether you have one.
 */
(function () {
  var WORKER_ENDPOINT =
    SITE_CONFIG.RSS_PROXY_BASE + '/update-profile';

  // Keyed by NAME, matching CIO_SUBS_TO_ATTR in worker.js, which maps them onto
  // the Customer.io sub_*/topic_* attributes. These used to be Mailchimp
  // interest IDs ('24642'/'24641') sent as an `interests` object — but the
  // Worker only reads `subs`, so every subscription change made here was
  // silently thrown away while the name/region still saved (making the request
  // look successful). Never reintroduce numeric ids here.
  var SUBSCRIPTIONS = [
    { key: 'weekly',     label: 'Weekly Update', desc: 'The Friday look-ahead — upcoming meetings & events.' },
    { key: 'newsletter', label: 'Newsletter',    desc: 'Long-form posts when we publish them.' },
  ];

  function qp(name) {
    try { return new URLSearchParams(window.location.search).get(name) || ''; }
    catch (_) { return ''; }
  }

  function injectStyles() {
    if (document.getElementById('ltProfStyles')) return;
    var s = document.createElement('style');
    s.id = 'ltProfStyles';
    s.textContent = [
      '#ltProfOverlay{position:fixed;inset:0;background:rgba(20,40,34,0.66);z-index:10000;display:none;align-items:center;justify-content:center;padding:20px;}',
      '#ltProfOverlay.open{display:flex;}',
      '#ltProfModal{background:#fff;border-radius:16px;max-width:520px;width:100%;padding:30px 28px 24px;box-shadow:0 25px 60px rgba(0,0,0,0.35);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;position:relative;box-sizing:border-box;max-height:92vh;overflow-y:auto;}',
      '#ltProfModal h2{font-family:Georgia,"Times New Roman",serif;color:#21443c;font-size:1.5rem;margin:0 0 6px;line-height:1.2;}',
      '#ltProfModal .lt-prof-dek{font-size:0.92rem;color:#4a5e57;margin:0 0 18px;line-height:1.55;}',
      '#ltProfModal .row{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;}',
      '#ltProfModal .row-2col{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px;}',
      '#ltProfModal .row-2col .row{margin-bottom:0;}',
      '#ltProfModal label{font-size:0.74rem;font-weight:700;color:#21443c;letter-spacing:0.04em;text-transform:uppercase;}',
      '#ltProfModal input,#ltProfModal select{padding:10px 12px;border:1px solid rgba(33,68,60,0.20);border-radius:8px;font-size:0.95rem;font-family:inherit;background:#fff;color:#1a2e29;box-sizing:border-box;width:100%;}',
      '#ltProfModal input:focus,#ltProfModal select:focus{outline:2px solid #2f7a5f;outline-offset:-1px;border-color:transparent;}',
      '#ltProfModal input.lt-prof-missing{border-color:#d99a3c;background:#fff9ef;}',
      '#ltProfModal .lt-prof-hint{font-size:0.72rem;color:#b07a1e;font-weight:600;}',
      '#ltProfModal .lt-prof-section{margin:18px 0 6px;font-size:0.72rem;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#7a8a85;border-top:1px solid #eef1ee;padding-top:16px;}',
      '#ltProfModal .lt-prof-sub{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;margin-bottom:10px;}',
      '#ltProfModal .lt-prof-sub .t{font-size:0.92rem;font-weight:700;color:#21302b;}',
      '#ltProfModal .lt-prof-sub .d{font-size:0.78rem;color:#6b7a74;}',
      // On/off switch — dark green = subscribed. Mirrors profile.html's .tog.
      '#ltProfModal .lt-tog{display:inline-flex;align-items:center;gap:10px;}',
      '#ltProfModal .lt-tog-sw{position:relative;flex:0 0 auto;width:54px;height:31px;padding:0;border:1px solid #e2e6e3;border-radius:999px;background:#cfd4d0;cursor:pointer;transition:background .15s,border-color .15s;font-family:inherit;-webkit-appearance:none;appearance:none;}',
      '#ltProfModal .lt-tog-sw::after{content:"";position:absolute;top:3px;left:3px;width:23px;height:23px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.28);transition:transform .15s;}',
      '#ltProfModal .lt-tog-sw[aria-checked="true"]{background:#21443c;border-color:#21443c;}',
      '#ltProfModal .lt-tog-sw[aria-checked="true"]::after{transform:translateX(23px);}',
      '#ltProfModal .lt-tog-sw:focus-visible{outline:2px solid #2f7a5f;outline-offset:2px;}',
      '#ltProfModal .lt-tog-lbl{font-size:15.5px;font-weight:700;color:#6b7a74;min-width:118px;}',
      '#ltProfModal .lt-tog-sw[aria-checked="true"]+.lt-tog-lbl{color:#21443c;}',
      '#ltProfModal .lt-prof-note{font-size:0.8rem;line-height:1.45;color:#3a443e;background:#eef3ef;border-radius:8px;padding:9px 11px;margin:2px 0 12px;}',
      '#ltProfModal .lt-prof-note a{color:#21443c;font-weight:600;}',
      '#ltProfModal .lt-prof-actions{display:flex;gap:12px;align-items:center;margin-top:18px;flex-wrap:wrap;}',
      '#ltProfModal button[type="submit"]{background:#21443c;color:#fff;border:none;border-radius:999px;padding:11px 24px;font-weight:700;font-size:0.95rem;cursor:pointer;font-family:inherit;}',
      '#ltProfModal button[type="submit"]:hover{background:#2a5347;}',
      '#ltProfModal button[type="submit"]:disabled{background:#7a8a85;cursor:not-allowed;}',
      '#ltProfModal .lt-prof-close{position:absolute;top:10px;right:12px;background:none;border:none;font-size:1.6rem;color:#7a8a85;cursor:pointer;line-height:1;padding:6px 10px;border-radius:6px;}',
      '#ltProfModal .lt-prof-close:hover{background:rgba(0,0,0,0.04);color:#1a2e29;}',
      '#ltProfModal .lt-prof-msg{font-size:0.88rem;margin:10px 0 0;min-height:1em;line-height:1.45;}',
      '#ltProfModal .lt-prof-msg.error{color:#b44b3c;}',
      '#ltProfModal .lt-prof-msg.success{color:#2f7a5f;font-weight:600;}',
      '@media (max-width:520px){#ltProfModal{padding:26px 20px 20px;}#ltProfModal .row-2col{grid-template-columns:1fr;}#ltProfModal .lt-prof-sub{grid-template-columns:1fr;}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // Each switch carries data-init = the state we RENDERED (always "" here — this
  // popup is unauthenticated and cannot read anyone's real state) and gets
  // data-touched when moved. Only touched switches are sent, so leaving one
  // alone never changes that list, and moving one is the only way to change it
  // in either direction.
  function subRowsHtml() {
    return SUBSCRIPTIONS.map(function (g) {
      var id = 'ltProfSubT-' + g.key;
      return '<div class="lt-prof-sub">' +
        '<div><div class="t" id="' + id + '">' + g.label + '</div><div class="d">' + g.desc + '</div></div>' +
        '<div class="lt-tog" data-sub="' + g.key + '" data-init="">' +
          '<button type="button" class="lt-tog-sw" role="switch" aria-checked="false" aria-labelledby="' + id + '"></button>' +
          '<span class="lt-tog-lbl">Not subscribed</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function togGet(tog) { return tog.querySelector('.lt-tog-sw').getAttribute('aria-checked') === 'true'; }
  function togSet(tog, on) {
    tog.querySelector('.lt-tog-sw').setAttribute('aria-checked', on ? 'true' : 'false');
    tog.querySelector('.lt-tog-lbl').textContent = on ? 'Subscribed' : 'Not subscribed';
  }
  function wireToggles() {
    document.querySelectorAll('#ltProfModal .lt-tog').forEach(function (tog) {
      tog.querySelector('.lt-tog-sw').addEventListener('click', function () {
        togSet(tog, !togGet(tog));
        tog.setAttribute('data-touched', '1');
      });
    });
  }

  // Infer a region from a legacy free-text town, matching profile.html's
  // setRegion(). MMERGE6 holds one of three regions now, not a town name.
  function setRegion(v) {
    var sel = document.getElementById('ltProfRegion');
    if (!sel || !v) return;
    var low = String(v).trim().toLowerCase(), r = '';
    if (/east end|telluride|mountain village|\bophir\b|sawpit/.test(low)) r = 'East End';
    else if (/west end|norwood|nucla|naturita|paradox|redvale|egnar/.test(low)) r = 'West End';
    else if (/ridgway|ouray/.test(low)) r = 'Ridgway/Ouray';
    if (r) sel.value = r;
  }

  function ensureModal() {
    if (document.getElementById('ltProfOverlay')) return;
    injectStyles();
    var overlay = document.createElement('div');
    overlay.id = 'ltProfOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<div id="ltProfModal">' +
        '<button type="button" class="lt-prof-close" aria-label="Close" onclick="lvHideProfile()">×</button>' +
        '<h2>Update your info</h2>' +
        '<p class="lt-prof-dek">Keep your Livable Telluride profile current. Fill in anything that’s missing — we’ll only change what you enter.</p>' +
        '<form id="ltProfForm" onsubmit="return lvSubmitProfile(event);" novalidate>' +
          '<div class="row-2col">' +
            '<div class="row"><label for="ltProfFirst">First name</label><input id="ltProfFirst" type="text" autocomplete="given-name"></div>' +
            '<div class="row"><label for="ltProfLast">Last name</label><input id="ltProfLast" type="text" autocomplete="family-name"></div>' +
          '</div>' +
          '<div class="row"><label for="ltProfEmail">Email <span class="lt-prof-hint">(the address you subscribed with)</span></label><input id="ltProfEmail" type="email" autocomplete="email" required></div>' +
          '<div class="row"><label for="ltProfRegion">Region</label>' +
            '<select id="ltProfRegion">' +
              '<option value="">— Select your region —</option>' +
              '<option value="East End">East End</option>' +
              '<option value="West End">West End</option>' +
              '<option value="Ridgway/Ouray">Ridgway/Ouray</option>' +
            '</select></div>' +
          '<div class="lt-prof-section">Events near you (optional)</div>' +
          '<div class="row"><label for="ltProfAddr">Your address or town</label><input id="ltProfAddr" type="text" placeholder="So we can flag events close to you"></div>' +
          '<div class="row"><label for="ltProfRadius">How far you’ll travel (miles)</label><input id="ltProfRadius" type="number" min="1" max="200" placeholder="e.g. 25"></div>' +
          '<div class="lt-prof-section">Your subscriptions</div>' +
          '<div class="lt-prof-note">These switches start off because we can’t tell which lists you’re on from here. <strong>Anything you don’t touch stays exactly as it is</strong> — only switches you actually move get saved. For event topics and your current settings, use the <a href="/profile.html">full profile page</a>.</div>' +
          subRowsHtml() +
          '<p class="lt-prof-msg" id="ltProfMsg" role="status" aria-live="polite"></p>' +
          '<div class="lt-prof-actions">' +
            '<button type="submit" id="ltProfSubmit">Save my info</button>' +
            '<span class="d" style="font-size:0.8rem;color:#7a8a85;">We only update what you change.</span>' +
          '</div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(overlay);
    wireToggles();
    overlay.addEventListener('click', function (e) { if (e.target === overlay) window.lvHideProfile(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var ov = document.getElementById('ltProfOverlay');
        if (ov && ov.classList.contains('open')) window.lvHideProfile();
      }
    });
  }

  function val(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function setVal(id, v) { var el = document.getElementById(id); if (el && v) el.value = v; }

  window.lvShowProfile = function (prefill) {
    ensureModal();
    prefill = prefill || {};
    // Pre-fill from explicit arg first, then URL params (the email link).
    setVal('ltProfFirst',  prefill.fname  || qp('fname'));
    setVal('ltProfLast',   prefill.lname  || qp('lname'));
    setVal('ltProfEmail',  prefill.email  || qp('email'));
    setRegion(prefill.region || prefill.town || qp('region') || qp('town'));
    setVal('ltProfAddr',   prefill.addr   || qp('addr'));
    setVal('ltProfRadius', prefill.radius || qp('radius'));
    // Reopening starts clean — no switch is "touched" until moved this time.
    document.querySelectorAll('#ltProfModal .lt-tog').forEach(function (tog) {
      tog.removeAttribute('data-touched');
      togSet(tog, tog.getAttribute('data-init') === 'true');
    });
    // Gently flag the blanks we most want filled (name).
    ['ltProfFirst', 'ltProfLast'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.toggle('lt-prof-missing', !el.value.trim());
    });
    var msg = document.getElementById('ltProfMsg');
    msg.className = 'lt-prof-msg'; msg.textContent = '';
    document.getElementById('ltProfOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(function () {
      var first = document.getElementById('ltProfFirst');
      var email = document.getElementById('ltProfEmail');
      (first && !first.value ? first : (email && !email.value ? email : first)).focus();
    }, 60);
  };

  window.lvHideProfile = function () {
    var ov = document.getElementById('ltProfOverlay');
    if (ov) ov.classList.remove('open');
    document.body.style.overflow = '';
  };

  window.lvSubmitProfile = function (event) {
    if (event && event.preventDefault) event.preventDefault();
    var msg = document.getElementById('ltProfMsg');
    var btn = document.getElementById('ltProfSubmit');
    var email = val('ltProfEmail');
    if (!email || email.indexOf('@') < 0) {
      msg.className = 'lt-prof-msg error';
      msg.textContent = 'Please enter the email address you subscribed with.';
      return false;
    }
    // Only send non-empty merge fields (never blank existing data).
    var fields = {};
    var fv = val('ltProfFirst');  if (fv) fields.FNAME = fv;
    var lv = val('ltProfLast');   if (lv) fields.LNAME = lv;
    var tv = val('ltProfRegion'); if (tv) fields.MMERGE6 = tv;
    var av = val('ltProfAddr');   if (av) fields.MMERGE10 = av;
    var rv = val('ltProfRadius'); if (rv) fields.MMERGE11 = rv;
    // Only switches the person actually moved. Sent as `subs` keyed by NAME —
    // the Worker reads `subs`, never `interests`.
    var subs = {};
    document.querySelectorAll('#ltProfModal .lt-tog[data-sub]').forEach(function (tog) {
      if (tog.getAttribute('data-touched') === '1') subs[tog.getAttribute('data-sub')] = togGet(tog);
    });

    if (!Object.keys(fields).length && !Object.keys(subs).length) {
      msg.className = 'lt-prof-msg error';
      msg.textContent = 'Nothing to update yet — fill in a field or change a subscription.';
      return false;
    }

    msg.className = 'lt-prof-msg';
    msg.textContent = 'Saving…';
    btn.disabled = true;

    fetch(WORKER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, fields: fields, subs: subs }),
    })
      .then(function (r) { return r.json().catch(function () { return { ok: false, msg: 'Unexpected response.' }; }); })
      .then(function (resp) {
        btn.disabled = false;
        if (resp && resp.ok) {
          msg.className = 'lt-prof-msg success';
          msg.textContent = resp.msg || 'Saved — thank you!';
          setTimeout(window.lvHideProfile, 2600);
        } else {
          msg.className = 'lt-prof-msg error';
          msg.textContent = (resp && resp.msg) || 'Something went wrong. Please try again.';
        }
      })
      .catch(function () {
        btn.disabled = false;
        msg.className = 'lt-prof-msg error';
        msg.textContent = 'Network error. Please try again in a moment.';
      });
    return false;
  };

  // Auto-open from the email link (?profile=1 or #update-profile).
  function maybeAutoOpen() {
    if (qp('profile') === '1' || window.location.hash === '#update-profile') {
      window.lvShowProfile();
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', maybeAutoOpen);
  } else {
    maybeAutoOpen();
  }
})();
