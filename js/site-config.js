/**
 * site-config.js — single source of truth for shared config literals that were
 * previously copy-pasted across many pages. Load it SYNCHRONOUSLY in <head>
 * (before any inline script that reads it):  <script src="js/site-config.js"></script>
 *
 * These are all PUBLIC values (client-side endpoints + the public Firebase web
 * config), so it's fine to ship them to the browser — the point is one place to
 * change a URL or rotate the public Firebase key instead of hunting 6-8 files.
 *
 * Currently adopted: the Cloudflare Worker bases + the Apps Script submit URL
 * (used in fetch(), so load order is safe). FIREBASE is defined here as the
 * eventual single source; pages still init from their own inline copy until they
 * migrate to SITE_CONFIG.FIREBASE (a change that must be auth-tested per page).
 */
window.SITE_CONFIG = {
  // Cloudflare Worker: the RSS proxy + profile/moderation/OG endpoints.
  RSS_PROXY_BASE: 'https://livabletelluride-rss-proxy.morgan-8f0.workers.dev',
  // Cloudflare Worker: the Digest Review Desk backend (/chat, /send, /save).
  DIGEST_BASE: 'https://livabletelluride-digest.morgan-8f0.workers.dev',
  // Google Apps Script Web App that queues event/org submissions and emails info@.
  APPS_SCRIPT_EXEC: 'https://script.google.com/macros/s/AKfycbwGuobdZ-uhIcb6Idq6WC_JJNgai1yLnaVec0eRzZyiPJ2ehf-Vs1MwRYORTTF67fps/exec',
  // Stripe hosted donate checkout.
  STRIPE_DONATE: 'https://buy.stripe.com/7sY7sD2TZ2MV5Vudf40Ba00',
  SUPPORT_EMAIL: 'info@livabletelluride.org',
  // Public Firebase web config (single source; pages migrate here incrementally).
  FIREBASE: {
    apiKey: 'AIzaSyCyAjB0RA_LtoETyRqxVJor0lRB4NRyXF0',
    authDomain: 'telluride-gov-hub.firebaseapp.com',
    projectId: 'telluride-gov-hub',
    storageBucket: 'telluride-gov-hub.firebasestorage.app',
    messagingSenderId: '14117089764',
    appId: '1:14117089764:web:4287985258f0bc929cd7f1',
  },
};
