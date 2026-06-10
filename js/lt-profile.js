/* lt-profile.js — "Update your profile" pop-up.
 *
 * A branded modal that lets an existing subscriber fill in missing info
 * (first/last name, town, "events near you" location) and manage their
 * subscriptions, writing back to Mailchimp via the Cloudflare Worker
 * endpoint POST /update-profile (worker.js holds the API key server-side).
 *
 * Built for the many legacy subscribers imported without names/location.
 *
 * Entry points:
 *   - window.lvShowProfile(prefill?)  — open it programmatically.
 *   - URL ?profile=1 (or #update-profile) auto-opens it. The weekly email's
 *     "Update your info" button links here with Mailchimp merge tags, e.g.
 *       /?profile=1&email=*|EMAIL|*&fname=*|FNAME|*&lname=*|LNAME|*
 *        &town=*|MMERGE6|*&addr=*|MMERGE10|*&radius=*|MMERGE11|*
 *     so the person lands with their record pre-filled and the blanks obvious.
 *
 * SAFETY: merge fields are only sent when non-empty (never blanks existing
 * data), and each subscription is "No change" by default — we only ever
 * change a group the person explicitly chooses to change. The Worker PATCHes
 * an EXISTING member only (a non-member is told to subscribe first).
 */
(function () {
  var WORKER_ENDPOINT =
    'https://livabletelluride-rss-proxy.morgan-8f0.workers.dev/update-profile';

  // Mailchimp interest groups under category 7915 ("Email Subscriptions").
  // Add future "Event Topics" groups here as { id, label, desc } and they
  // render automatically — no other change needed.
  var SUBSCRIPTIONS = [
    { id: '24642', label: 'Weekly Update', desc: 'The Friday look-ahead — upcoming meetings & events.' },
    { id: '24641', label: 'Newsletter',    desc: 'Long-form posts when we publish them.' },
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
      '#ltProfModal .lt-prof-sub{display:grid;grid-template-columns:1fr 150px;gap:10px;align-items:center;margin-bottom:10px;}',
      '#ltProfModal .lt-prof-sub .t{font-size:0.92rem;font-weight:700;color:#21302b;}',
      '#ltProfModal .lt-prof-sub .d{font-size:0.78rem;color:#6b7a74;}',
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

  function subRowsHtml() {
    return SUBSCRIPTIONS.map(function (g) {
      return '<div class="lt-prof-sub">' +
        '<div><div class="t">' + g.label + '</div><div class="d">' + g.desc + '</div></div>' +
        '<select data-interest="' + g.id + '">' +
          '<option value="">No change</option>' +
          '<option value="on">Subscribe</option>' +
          '<option value="off">Unsubscribe</option>' +
        '</select>' +
      '</div>';
    }).join('');
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
          '<div class="row"><label for="ltProfTown">Town</label><input id="ltProfTown" type="text" placeholder="e.g. Telluride, Norwood, Ridgway"></div>' +
          '<div class="lt-prof-section">Events near you (optional)</div>' +
          '<div class="row"><label for="ltProfAddr">Your address or town</label><input id="ltProfAddr" type="text" placeholder="So we can flag events close to you"></div>' +
          '<div class="row"><label for="ltProfRadius">How far you’ll travel (miles)</label><input id="ltProfRadius" type="number" min="1" max="200" placeholder="e.g. 25"></div>' +
          '<div class="lt-prof-section">Your subscriptions</div>' +
          subRowsHtml() +
          '<p class="lt-prof-msg" id="ltProfMsg" role="status" aria-live="polite"></p>' +
          '<div class="lt-prof-actions">' +
            '<button type="submit" id="ltProfSubmit">Save my info</button>' +
            '<span class="d" style="font-size:0.8rem;color:#7a8a85;">We only update what you change.</span>' +
          '</div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(overlay);
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
    setVal('ltProfTown',   prefill.town   || qp('town'));
    setVal('ltProfAddr',   prefill.addr   || qp('addr'));
    setVal('ltProfRadius', prefill.radius || qp('radius'));
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
    var tv = val('ltProfTown');   if (tv) fields.MMERGE6 = tv;
    var av = val('ltProfAddr');   if (av) fields.MMERGE10 = av;
    var rv = val('ltProfRadius'); if (rv) fields.MMERGE11 = rv;
    // Only send subscription changes the person explicitly picked.
    var interests = {};
    document.querySelectorAll('#ltProfModal select[data-interest]').forEach(function (sel) {
      if (sel.value === 'on') interests[sel.getAttribute('data-interest')] = true;
      else if (sel.value === 'off') interests[sel.getAttribute('data-interest')] = false;
    });

    msg.className = 'lt-prof-msg';
    msg.textContent = 'Saving…';
    btn.disabled = true;

    fetch(WORKER_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, fields: fields, interests: interests }),
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
