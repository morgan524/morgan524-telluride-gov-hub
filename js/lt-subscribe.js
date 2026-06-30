/* lt-subscribe.js — in-page newsletter signup modal.
 *
 * Before this existed, the Subscribe buttons on index.html / about.html /
 * gov-hub.html all navigated to /hub-bub.html#signup, which would then open
 * the Hub-Bub signup modal. Users found the redirect jarring: they wanted
 * to subscribe to the newsletter, not visit the forum.
 *
 * This module exposes lvShowSubscribe(emailHint?) on window. Calling it
 * opens an in-page overlay with First name / Last name / Email and submits
 * directly to the same Mailchimp audience the Hub-Bub signup uses
 * (us15 dc, audience f83dc56387, account 5d9192289b9af78822f2f69bf — see
 * CLAUDE.md "Subscription + Blog Architecture").
 *
 * Default behavior (post-2026-05-29 unification): every submission auto-
 * sets MMERGE9=weekly (subscriber receives the Weekly look-ahead digest)
 * AND group[7912]=1 (subscriber receives newsletter / blog posts). The
 * previous daily/weekly dropdown was removed — daily was retired
 * 2026-05-25 — and the newsletter-vs-digest choice was hidden because
 * the lightweight Subscribe modal shouldn't surface either decision.
 * Users who want to opt out of one or the other can do so from any
 * Mailchimp email's footer.
 *
 * Forum account creation (Firebase auth) is intentionally NOT done here.
 * Newsletter subscribers don't need a Hub-Bub account; if they do, they can
 * create one via the explicit "Log In / Create account" flow on Hub-Bub.
 */
(function () {
  var MC_ENDPOINT =
    'https://letpeopledecide.us15.list-manage.com/subscribe/post-json' +
    '?u=5d9192289b9af78822f2f69bf&id=f83dc56387';

  function injectStyles() {
    if (document.getElementById('ltSubStyles')) return;
    var style = document.createElement('style');
    style.id = 'ltSubStyles';
    style.textContent = [
      '#ltSubOverlay { position: fixed; inset: 0; background: rgba(20,40,34,0.66); z-index: 9999; display: none; align-items: center; justify-content: center; padding: 20px; }',
      '#ltSubOverlay.open { display: flex; }',
      '#ltSubModal { background: #fff; border-radius: 16px; max-width: 480px; width: 100%; padding: 32px 28px 26px; box-shadow: 0 25px 60px rgba(0,0,0,0.35); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; position: relative; box-sizing: border-box; max-height: 90vh; overflow-y: auto; }',
      '#ltSubModal h2 { font-family: Georgia, "Times New Roman", serif; color: #21443c; font-size: 1.5rem; margin: 0 0 6px; line-height: 1.2; }',
      '#ltSubModal .lt-sub-dek { font-size: 0.92rem; color: #4a5e57; margin: 0 0 18px; line-height: 1.55; }',
      '#ltSubModal .row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }',
      '#ltSubModal .row-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }',
      '#ltSubModal .row-2col .row { margin-bottom: 0; }',
      '#ltSubModal label { font-size: 0.74rem; font-weight: 700; color: #21443c; letter-spacing: 0.04em; text-transform: uppercase; }',
      '#ltSubModal input, #ltSubModal select { padding: 10px 12px; border: 1px solid rgba(33,68,60,0.20); border-radius: 8px; font-size: 0.95rem; font-family: inherit; background: #fff; color: #1a2e29; box-sizing: border-box; width: 100%; }',
      '#ltSubModal input:focus, #ltSubModal select:focus { outline: 2px solid #2f7a5f; outline-offset: -1px; border-color: transparent; }',
      '#ltSubModal .lt-sub-actions { display: flex; gap: 12px; align-items: center; margin-top: 14px; flex-wrap: wrap; }',
      '#ltSubModal button[type="submit"] { background: #21443c; color: #fff; border: none; border-radius: 999px; padding: 11px 24px; font-weight: 700; font-size: 0.95rem; cursor: pointer; font-family: inherit; }',
      '#ltSubModal button[type="submit"]:hover { background: #2a5347; }',
      '#ltSubModal button[type="submit"]:disabled { background: #7a8a85; cursor: not-allowed; }',
      '#ltSubModal .lt-sub-fine { font-size: 0.8rem; color: #7a8a85; }',
      '#ltSubModal .lt-sub-close { position: absolute; top: 10px; right: 12px; background: none; border: none; font-size: 1.6rem; color: #7a8a85; cursor: pointer; line-height: 1; padding: 6px 10px; border-radius: 6px; }',
      '#ltSubModal .lt-sub-close:hover { background: rgba(0,0,0,0.04); color: #1a2e29; }',
      '#ltSubModal .lt-sub-msg { font-size: 0.88rem; margin: 4px 0 0; min-height: 1em; line-height: 1.45; }',
      '#ltSubModal .lt-sub-msg.error   { color: #b44b3c; }',
      '#ltSubModal .lt-sub-msg.success { color: #2f7a5f; font-weight: 600; }',
      '#ltSubModal .lt-sub-foot-link { font-size: 0.8rem; color: #7a8a85; margin-top: 14px; text-align: center; }',
      '#ltSubModal .lt-sub-foot-link a { color: #21443c; font-weight: 600; text-decoration: underline; }',
      '@media (max-width: 480px) { #ltSubModal { padding: 26px 20px 22px; } #ltSubModal .row-2col { grid-template-columns: 1fr; } }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (document.getElementById('ltSubOverlay')) return;
    injectStyles();
    var overlay = document.createElement('div');
    overlay.id = 'ltSubOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'ltSubTitle');
    overlay.innerHTML =
      '<div id="ltSubModal">' +
        '<button type="button" class="lt-sub-close" aria-label="Close" onclick="lvHideSubscribe()">×</button>' +
        '<h2 id="ltSubTitle">Subscribe to Livable Telluride</h2>' +
        '<p class="lt-sub-dek">You\'ll receive our weekly look-ahead of upcoming meetings, news, and events — plus our newsletter when new posts are published.</p>' +
        '<form id="ltSubForm" onsubmit="return lvSubmitSubscribe(event);" novalidate>' +
          '<div class="row-2col">' +
            '<div class="row">' +
              '<label for="ltSubFname">First name</label>' +
              '<input id="ltSubFname" name="FNAME" type="text" required autocomplete="given-name">' +
            '</div>' +
            '<div class="row">' +
              '<label for="ltSubLname">Last name</label>' +
              '<input id="ltSubLname" name="LNAME" type="text" required autocomplete="family-name">' +
            '</div>' +
          '</div>' +
          '<div class="row">' +
            '<label for="ltSubEmail">Email</label>' +
            '<input id="ltSubEmail" name="EMAIL" type="email" required autocomplete="email">' +
          '</div>' +
          '<p class="lt-sub-msg" id="ltSubMsg" role="status" aria-live="polite"></p>' +
          '<div class="lt-sub-actions">' +
            '<button type="submit" id="ltSubSubmit">📬 Subscribe</button>' +
            '<span class="lt-sub-fine">Free. Unsubscribe anytime.</span>' +
          '</div>' +
        '</form>' +
        '<p class="lt-sub-foot-link">Want a forum account too? <a href="/hub-bub.html#signup">Create a Hub-Bub account →</a></p>' +
      '</div>';
    document.body.appendChild(overlay);

    // Click outside the modal box to close
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) window.lvHideSubscribe();
    });
    // ESC closes
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var ov = document.getElementById('ltSubOverlay');
        if (ov && ov.classList.contains('open')) window.lvHideSubscribe();
      }
    });
  }

  window.lvShowSubscribe = function (emailHint) {
    ensureModal();
    var overlay = document.getElementById('ltSubOverlay');
    var emailEl = document.getElementById('ltSubEmail');
    var fnameEl = document.getElementById('ltSubFname');
    var msg = document.getElementById('ltSubMsg');
    if (emailHint && typeof emailHint === 'string') emailEl.value = emailHint.trim();
    msg.className = 'lt-sub-msg';
    msg.textContent = '';
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { (fnameEl.value ? emailEl : fnameEl).focus(); }, 60);
  };

  window.lvHideSubscribe = function () {
    var overlay = document.getElementById('ltSubOverlay');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
  };

  window.lvSubmitSubscribe = function (event) {
    if (event && event.preventDefault) event.preventDefault();
    var fname = document.getElementById('ltSubFname').value.trim();
    var lname = document.getElementById('ltSubLname').value.trim();
    var email = document.getElementById('ltSubEmail').value.trim();
    var msg   = document.getElementById('ltSubMsg');
    var btn   = document.getElementById('ltSubSubmit');

    if (!email || !fname || !lname) {
      msg.className = 'lt-sub-msg error';
      msg.textContent = 'Please fill in first name, last name, and email.';
      return false;
    }

    msg.className = 'lt-sub-msg';
    msg.textContent = 'Submitting…';
    btn.disabled = true;

    // Mailchimp JSONP — same shape Hub-Bub uses. Returns
    // {result:'success'|'error', msg:'...'} via callback.
    //
    // Unified signup defaults (2026-05-29):
    //   MMERGE9 = 'weekly'  → subscriber receives Weekly look-ahead digest
    //   group[7912] = '1'   → subscriber receives newsletter / blog posts
    // No UI for these — keeps the modal lightweight. Users can opt out
    // of either via the standard Mailchimp footer in any campaign email.
    var cb = '_ltSubCb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    var script = document.createElement('script');
    var params = [
      'EMAIL='  + encodeURIComponent(email),
      'FNAME='  + encodeURIComponent(fname),
      'LNAME='  + encodeURIComponent(lname),
      'MMERGE9=weekly',
      // "Email Subscriptions" category 7915: Newsletter=24641, Weekly Update=24642
      // (replaced deleted "Topics of Interest" category 7912 on 2026-05-31).
      'group%5B7915%5D%5B24641%5D=24641',
      'group%5B7915%5D%5B24642%5D=24642',
      'c=' + encodeURIComponent(cb)
    ].join('&');

    var done = false;
    function finish() {
      if (done) return;
      done = true;
      btn.disabled = false;
      try { delete window[cb]; } catch (_) { window[cb] = undefined; }
      if (script && script.parentNode) script.parentNode.removeChild(script);
    }

    window[cb] = function (resp) {
      finish();
      if (resp && resp.result === 'success') {
        msg.className = 'lt-sub-msg success';
        msg.textContent = '✓ Subscribed! Check your inbox for a confirmation email from Mailchimp.';
        document.getElementById('ltSubForm').reset();
        setTimeout(window.lvHideSubscribe, 3000);
      } else {
        var text = (resp && resp.msg) ? String(resp.msg).replace(/<[^>]+>/g, '').trim() : '';
        msg.className = 'lt-sub-msg error';
        msg.textContent = text || 'Something went wrong. Please try again.';
      }
    };

    script.onerror = function () {
      msg.className = 'lt-sub-msg error';
      msg.textContent = 'Network error. Please try again in a moment.';
      finish();
    };
    script.src = MC_ENDPOINT + '&' + params;
    document.head.appendChild(script);
    return false;
  };
})();
