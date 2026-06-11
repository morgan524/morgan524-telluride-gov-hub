/* site-footer.js — shared site footer injector.
 *
 * Injects the standard Livable Telluride footer (brand + Quick Links +
 * Helpful Links + Follow Us), including the "Your Profile" link, into any
 * page that loads this script. No-ops if the page already hand-rolls its own
 * <footer class="site-foot"> (index.html, donate.html), so it's safe to add
 * everywhere. Single source of truth for the footer + profile link on the
 * many app pages (events, housing, gov-hub, …) that previously had no footer.
 *
 * Usage: add  <script defer src="/js/site-footer.js?v=YYYYMMDD"></script>
 * before </body>.
 */
(function () {
  if (document.querySelector('.site-foot')) return; // page already has a footer

  var css = [
    '.site-foot{background:#21443c;color:#ecf2ee;padding:48px 0 24px;margin-top:40px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}',
    '.site-foot-inner{max-width:1100px;margin:0 auto;padding:0 32px;display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px}',
    '.site-foot .foot-brand-logo{display:flex;align-items:center;gap:8px;font-family:Georgia,"Times New Roman",serif;font-weight:700;font-size:1.2rem;margin-bottom:6px;color:#fff}',
    '.site-foot .foot-brand-tag{font-size:.85rem;color:rgba(255,255,255,.75)}',
    '.site-foot .foot-col h4{font-size:.85rem;text-transform:uppercase;letter-spacing:.06em;margin:0 0 12px;color:rgba(255,255,255,.85)}',
    '.site-foot .foot-col a{display:block;color:rgba(255,255,255,.75);text-decoration:none;font-size:.9rem;padding:2px 0}',
    '.site-foot .foot-col a:hover{color:#fff}',
    '.site-foot .foot-social{display:flex;gap:8px}',
    '.site-foot .foot-social img{width:32px;height:32px;object-fit:contain;opacity:.85}',
    '.site-foot .foot-social a:hover img{opacity:1}',
    '.site-foot .foot-mission{grid-column:1 / -1;padding-top:20px;border-top:1px solid rgba(255,255,255,.15);margin-top:10px}',
    '.site-foot .foot-mission p{margin:0;font-size:.85rem;color:rgba(255,255,255,.7);text-align:center}',
    '.site-foot .foot-bottom{max-width:1100px;margin:24px auto 0;padding:16px 32px 0;border-top:1px solid rgba(255,255,255,.15);text-align:center;font-size:.82rem;color:rgba(255,255,255,.6)}',
    '@media(max-width:760px){.site-foot-inner{grid-template-columns:1fr 1fr}}',
    '@media(max-width:480px){.site-foot-inner{grid-template-columns:1fr}}'
  ].join('');

  var html =
    '<footer class="site-foot">' +
      '<div class="site-foot-inner">' +
        '<div class="foot-brand">' +
          '<div class="foot-brand-logo"><img src="https://livabletelluride.org/img/icons/community_powered_mountains.png" alt="" style="width:28px;height:28px;object-fit:contain;"> Livable Telluride</div>' +
          '<div class="foot-brand-tag">Inform. Connect. Engage. Together.</div>' +
        '</div>' +
        '<div class="foot-col">' +
          '<h4>Quick Links</h4>' +
          '<a href="https://livabletelluride.org/">Home</a>' +
          '<a href="https://livabletelluride.org/#about">About Us</a>' +
          '<a href="https://livabletelluride.org/donate.html">Donate</a>' +
          '<a href="https://livabletelluride.org/profile.html">Your Profile</a>' +
        '</div>' +
        '<div class="foot-col">' +
          '<h4>Explore</h4>' +
          '<a href="https://livabletelluride.org/gov-hub.html">Gov-Hub</a>' +
          '<a href="https://livabletelluride.org/events.html">Events</a>' +
          '<a href="https://livabletelluride.org/housing.html">Housing</a>' +
        '</div>' +
        '<div class="foot-col">' +
          '<h4>Helpful Links</h4>' +
          '<a href="https://livabletelluride.org/privacy-policy.html">Privacy Policy</a>' +
          '<a href="mailto:info@livabletelluride.org">Contact</a>' +
          '<div class="foot-social" style="margin-top:10px"><a href="mailto:info@livabletelluride.org" aria-label="Email"><img src="https://livabletelluride.org/img/icons/email_social.png" alt=""></a></div>' +
        '</div>' +
        '<div class="foot-mission"><p>Livable Telluride is a community-powered initiative.</p></div>' +
      '</div>' +
      '<div class="foot-bottom">© 2026 Livable Telluride. All rights reserved.</div>' +
    '</footer>';

  function inject() {
    if (document.querySelector('.site-foot')) return;
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap.firstChild);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
