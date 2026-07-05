/* ══════════════════════════════════════════════════════════════
      HUB-BUB FORUM ENGINE v2
   Guided Civic Discussion Forum for Telluride Gov Hub
   ══════════════════════════════════════════════════════════════ */
(function() {
  'use strict';
  // ─── Firebase Configuration ───
  const FIREBASE_CONFIG = SITE_CONFIG.FIREBASE;
  // ─── Initialize Firebase ───
  let app, auth, db, storage;
  let hbUser = null;           // Current authenticated user
  let hbCurrentTopic = 'all';  // Active topic filter
  let hbCurrentSort = 'newest';
  let hbCurrentMode = 'all';   // Mode filter: all, question, what-happened, ideas
  let hbSelectedPostType = null; // Currently selected post type for compose
  let hbPosts = [];            // Cached posts
  let hbPendingAttachments = []; // Files queued for upload
  let hbToneOriginalText = '';
  let hbFirebaseReady = false;
    try {
    if (FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY') {
      // Use existing Firebase app if already initialized (by modular SDK), otherwise create new
      app = firebase.apps.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG);
      auth = firebase.auth();
      db = firebase.firestore();
      storage = firebase.storage();
      hbFirebaseReady = true;
    }
  } catch(e) {
    console.warn('Hub-Bub: Firebase not configured yet.', e);
  }
  // ─── Topic Definitions (matches Hub's existing taxonomy) ───
  const HB_TOPICS = {
    'government': { label: 'Government', icon: '🏛️' },
    'events':     { label: 'Events',     icon: '🎉' },
    'housing':    { label: 'Housing',    icon: '🏠' },
    'land-use':   { label: 'Land Use',   icon: '🏗️' },
    'transit':    { label: 'Transit',    icon: '🚌' },
    'gondola':    { label: 'Gondola',    icon: '🚡' },
    'budgets':    { label: 'Budgets',    icon: '💰' },
    'environment':{ label: 'Environment',icon: '🌿' },
    'schools':    { label: 'Schools',    icon: '🎓' },
    'good-news':  { label: 'Good News',  icon: '🌟' },
    'other':      { label: 'Other',      icon: '💡' }
  };
  // ─── Post Type Definitions ───
  const HB_POST_TYPES = {
    'question': {
      label: 'Question',
      icon: '❓',
      titlePlaceholder: 'What do you want to know?',
      bodyPlaceholder: 'Ask your question. What specific information would help?'
    },
    'source': {
      label: 'Source',
      icon: '📄',
      titlePlaceholder: 'What is this document about?',
      bodyPlaceholder: 'Summarize the key points or findings from this source.'
    },
    'debrief': {
      label: 'Meeting Debrief',
      icon: '📋',
      titlePlaceholder: 'What meeting did you attend?',
      bodyPlaceholder: 'Summarize the key discussion points and outcomes.'
    },
    'solution': {
      label: 'Solution',
      icon: '💡',
      titlePlaceholder: 'What is your practical idea?',
      bodyPlaceholder: 'Describe your solution and how it would help the community.'
    },
    'need': {
      label: 'Community Need',
      icon: '🙋',
      titlePlaceholder: 'What does our community need?',
      bodyPlaceholder: 'Describe the need and why it matters.'
    },
    'volunteer': {
      label: 'Volunteer',
      icon: '🤝',
      titlePlaceholder: 'What help are you offering?',
      bodyPlaceholder: 'Describe how you can help and what skills you bring.'
    }
  };
  // ─── Conversation Starters ───
  const HB_CONVERSATION_STARTERS = [
    "What is one question you want answered before the next council meeting?",
    "What is one fact more people should know about this issue?",
    "What changed your mind, even a little, on a local issue?",
    "What is one practical idea that would reduce conflict on this topic?",
    "What did you hear at a recent meeting that deserves more attention?"
  ];
  // ═══════════════════════════════
  // AUTH FUNCTIONS
  // ═══════════════════════════════
  // hub-bub.html (post-2026-05-25 modal redesign) defines its OWN
  // window.hbShowAuth wired to the new modal IDs (#hbModalOverlay /
  // #hbLoginPanel / #hbSignupPanel). hub-bub.js is loaded async and
  // used to clobber that working definition with the version below —
  // which references the OLD modal IDs (#hbAuthModal / #hbLoginForm
  // etc.) that no longer exist in the DOM, so clicks on the topnav
  // "Log In" threw `Cannot read properties of null` on the
  // modal.classList.add('open') line. Guard the assignment so the
  // legacy version only takes effect if no one else has wired it.
  if (!window.hbShowAuth) {
    window.hbShowAuth = function(mode) {
      var modal = document.getElementById('hbAuthModal');
      if (!modal) return; // No legacy modal in DOM — caller should provide its own hbShowAuth.
      modal.classList.add('open');
      var sf = document.getElementById('hbSignupForm');
      var lf = document.getElementById('hbLoginForm');
      var vf = document.getElementById('hbVerifyForm');
      if (sf) sf.style.display = mode === 'signup' ? '' : 'none';
      if (lf) lf.style.display = mode === 'login' ? '' : 'none';
      if (vf) vf.style.display = mode === 'verify' ? '' : 'none';
      // Clear errors and info messages
      ['hbSignupError','hbLoginError'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) { el.style.display = 'none'; el.textContent = ''; }
      });
      var infoEl = document.getElementById('hbLoginInfo');
      if (infoEl) { infoEl.style.display = 'none'; infoEl.innerHTML = ''; }
      // Reset login button state. Same id-typo guard as the bind site below
      // — id in HTML is `hbLoginSubmit`, an earlier version looked up
      // `hbLoginBtn` and silently no-op'd.
      var lb = document.getElementById('hbLoginSubmit')
            || document.getElementById('hbLoginBtn');
      if (lb) { lb.textContent = 'Log in'; lb.disabled = false; }
    };
  }
  window.hbCloseAuth = function() {
    document.getElementById('hbAuthModal').classList.remove('open');
  };
  // NOTE: the old window.hbDoSignup() lived here and was removed 2026-06-01.
  // It was dead code — never called anywhere, read a `hbSignupName` field
  // that no longer exists, only required a single name, used a 6-char
  // password minimum, and re-introduced the email verification step that
  // was dropped 2026-05-28. The live signup is the inline handler bound to
  // #hbSignupSubmit in hub-bub.html (separate First/Last name fields, both
  // required; 8-char password; no verification).
  // hbDoLogin is now handled by addEventListener on #hbLoginBtn below
  window.hbForgotPassword = function() {
    var email  = document.getElementById('hbLoginEmail').value.trim();
    var errEl  = document.getElementById('hbLoginError');
    var infoEl = document.getElementById('hbLoginInfo');
    var msgEl  = document.getElementById('hbLoginMsg');
    // Clear ALL previous login messages so nothing from a prior attempt lingers
    if (msgEl)  { msgEl.textContent = ''; msgEl.style.display = 'none'; msgEl.className = 'hb-modal-msg'; }
    if (errEl)  { errEl.textContent = '';  errEl.style.display  = 'none'; }
    if (infoEl) { infoEl.textContent = ''; infoEl.style.display = 'none'; }
    if (!email) {
      if (errEl) { errEl.textContent = 'Please enter your email address above, then click "Forgot password?" again.'; errEl.style.display = 'block'; }
      return;
    }
    // Use window.firebase.auth() directly — same path as the working login button
    var firebaseAuth = (window.firebase && window.firebase.auth) ? window.firebase.auth() : auth;
    if (!firebaseAuth) {
      if (errEl) { errEl.textContent = 'Hub-Bub is not ready yet — please try again in a moment.'; errEl.style.display = 'block'; }
      return;
    }
    firebaseAuth.sendPasswordResetEmail(email)
      .then(function() {
        if (errEl)  errEl.style.display  = 'none';
        if (infoEl) {
          infoEl.innerHTML = 'Password reset email sent to <strong>' + hbEsc(email) + '</strong>.<br>'
            + '<span style="color:#795548;">Check your spam or junk folder if you don\'t see it in your inbox within a few minutes.</span>';
          infoEl.style.display = 'block';
        }
        // The success message lives inside #hbLoginResetView, which has
        // display:none by default. Without swapping the two sub-panels
        // the user sees nothing happen and assumes the button is broken.
        // Hide the email/password fields and show the reset confirmation.
        var fields = document.getElementById('hbLoginFields');
        var reset  = document.getElementById('hbLoginResetView');
        if (fields) fields.style.display = 'none';
        if (reset)  reset.style.display  = 'block';
      })
      .catch(function(err) {
        if (infoEl) infoEl.style.display = 'none';
        var msg = err.message;
        if (err.code === 'auth/user-not-found')    msg = 'No account found with this email address.';
        else if (err.code === 'auth/invalid-email') msg = 'Please enter a valid email address.';
        else if (err.code === 'auth/too-many-requests') msg = 'Too many attempts. Please try again in a few minutes.';
        if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
      });
  };
  // The "← Back to log in" link inside #hbLoginResetView calls this — was
  // referenced in HTML but never defined, so the user got stuck on the
  // reset confirmation screen.
  window.hbShowLoginFields = function() {
    var fields = document.getElementById('hbLoginFields');
    var reset  = document.getElementById('hbLoginResetView');
    var errEl  = document.getElementById('hbLoginError');
    var infoEl = document.getElementById('hbLoginInfo');
    if (reset)  reset.style.display  = 'none';
    if (fields) fields.style.display = 'block';
    if (errEl)  { errEl.textContent  = ''; errEl.style.display  = 'none'; }
    if (infoEl) { infoEl.innerHTML   = ''; infoEl.style.display = 'none'; }
  };
  window.hbLogout = function() {
    if (auth) auth.signOut();
  };
  // ── Avatars ── photo > chosen icon > first-letter circle. The five icon
  // choices (Telluride nature). The user's choice lives on their users/{uid}
  // doc (photoURL / avatarIcon) and is snapshotted onto each post/reply at
  // creation so the feed renders without a per-author lookup.
  var HB_AVATAR_ICONS = [
    { id: 'mountain', emoji: '🏔️', bg: '#21443c' },
    { id: 'pine',     emoji: '🌲', bg: '#2f7a5f' },
    { id: 'gondola',  emoji: '🚡', bg: '#b58a2c' },
    { id: 'deer',     emoji: '🦌', bg: '#8a5a2b' },
    { id: 'sunrise',  emoji: '🌄', bg: '#c2683f' },
  ];
  var hbUserAvatar = { photo: null, icon: null };
  function hbIconById(id) { for (var i = 0; i < HB_AVATAR_ICONS.length; i++) if (HB_AVATAR_ICONS[i].id === id) return HB_AVATAR_ICONS[i]; return null; }
  // info@ posts under the name "Info" (its email prefix) and older posts have no
  // stored photo. Show the Livable Telluride emblem for the admin at RENDER time
  // so it appears on ALL of info@'s posts/replies, not just newly created ones.
  var HB_ADMIN_EMBLEM = 'https://livabletelluride.org/logo/lt-avatar.png';
  function hbIsAdminName(n) { n = String(n || '').trim().toLowerCase(); return n === 'info' || n === 'admin' || n === 'livable telluride'; }
  function hbAvatarHtml(name, photo, icon, cls) {
    if (!photo && !icon && hbIsAdminName(name)) photo = HB_ADMIN_EMBLEM;
    if (photo) return '<div class="' + cls + ' hb-av-photo" style="background-image:url(\'' + String(photo).replace(/'/g, '%27') + '\')"></div>';
    var ic = icon ? hbIconById(icon) : null;
    if (ic) return '<div class="' + cls + '" style="background:' + ic.bg + '">' + ic.emoji + '</div>';
    return '<div class="' + cls + '">' + (String(name || '?').charAt(0).toUpperCase()) + '</div>';
  }
  function hbSetComposeAvatar(name, isAdmin) {
    var el = document.getElementById('hbComposeAvatar'); if (!el) return;
    el.classList.remove('hb-av-photo'); el.style.backgroundImage = ''; el.textContent = '';
    if (hbUserAvatar.photo) { el.classList.add('hb-av-photo'); el.style.backgroundImage = "url('" + String(hbUserAvatar.photo).replace(/'/g, '%27') + "')"; }
    else {
      var ic = hbUserAvatar.icon ? hbIconById(hbUserAvatar.icon) : null;
      if (ic) { el.textContent = ic.emoji; el.style.background = ic.bg; }
      else { el.textContent = String(name || 'U').charAt(0).toUpperCase(); el.style.background = isAdmin ? '#e53935' : 'var(--forest)'; }
    }
  }

  function hbUpdateAuthUI(user) {
    hbUser = user;
    var statusEl = document.getElementById('hbAuthStatus');
    var userEl = document.getElementById('hbAuthUser');
    var logoutBtn = document.getElementById('hbLogoutBtn');
    var avatarEl = document.getElementById('hbComposeAvatar');
    var isAdmin = user && user.email === 'info@livabletelluride.org';
    // Email verification no longer required (dropped 2026-05-28) — any
    // signed-in user is treated as logged in and may post.
    if (user) {
      var name = user.displayName || (isAdmin ? 'Admin' : 'User');
      statusEl.style.display = 'none';
      userEl.style.display = '';
      userEl.textContent = name;
      logoutBtn.style.display = '';
      if (avatarEl) { avatarEl.style.cursor = 'pointer'; avatarEl.title = 'Click to change your avatar'; avatarEl.onclick = function () { hbOpenAvatarPicker(); }; }
      hbSetComposeAvatar(name, isAdmin);
      // Load the saved avatar choice, then refresh the compose circle.
      if (db) db.collection('users').doc(user.uid).get().then(function (d) {
        var data = d.exists ? (d.data() || {}) : {};
        hbUserAvatar = { photo: data.photoURL || null, icon: data.avatarIcon || null };
        // info@ defaults to the Livable Telluride mountain emblem (the same direct
        // link used on the profile page) when no custom photo/icon is set, so the
        // logo shows on the admin's posts. A custom photoURL/avatarIcon still wins.
        if (!hbUserAvatar.photo && !hbUserAvatar.icon && isAdmin) {
          hbUserAvatar.photo = 'https://livabletelluride.org/logo/lt-avatar.png';
        }
        hbSetComposeAvatar(name, isAdmin);
      }).catch(function () {});
    } else {
      hbUserAvatar = { photo: null, icon: null };
      statusEl.style.display = '';
      userEl.style.display = 'none';
      logoutBtn.style.display = 'none';
      if (avatarEl) { avatarEl.classList.remove('hb-av-photo'); avatarEl.style.backgroundImage = ''; avatarEl.textContent = '?'; avatarEl.style.background = '#999'; avatarEl.onclick = null; avatarEl.style.cursor = ''; }
    }
  }

  // ── Avatar picker modal ──
  window.hbOpenAvatarPicker = function () {
    if (!hbUser) return;
    var ov = document.getElementById('hbAvatarOverlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'hbAvatarOverlay';
      ov.innerHTML =
        '<div id="hbAvatarModal">' +
          '<button type="button" class="hb-av-close" onclick="hbCloseAvatarPicker()" aria-label="Close">×</button>' +
          '<h3>Your avatar</h3>' +
          '<p class="hb-av-dek">Upload a photo, pick an icon, or keep your initial.</p>' +
          '<div class="hb-av-current" id="hbAvatarPreview"></div>' +
          '<label class="hb-av-upload">Upload a photo<input type="file" accept="image/*" id="hbAvatarFile" style="display:none"></label>' +
          '<div class="hb-av-or">or pick an icon</div>' +
          '<div class="hb-av-icons" id="hbAvatarIcons"></div>' +
          '<div class="hb-av-actions">' +
            '<button type="button" class="hb-av-letter" onclick="hbAvatarChoose(\'letter\')">Use my initial</button>' +
            '<span class="hb-av-msg" id="hbAvatarMsg"></span>' +
          '</div>' +
        '</div>';
      document.body.appendChild(ov);
      ov.addEventListener('click', function (e) { if (e.target === ov) hbCloseAvatarPicker(); });
      var iconsWrap = ov.querySelector('#hbAvatarIcons');
      iconsWrap.innerHTML = HB_AVATAR_ICONS.map(function (ic) {
        return '<button type="button" class="hb-av-icon" style="background:' + ic.bg + '" onclick="hbAvatarChoose(\'icon\',\'' + ic.id + '\')" title="' + ic.id + '">' + ic.emoji + '</button>';
      }).join('');
      ov.querySelector('#hbAvatarFile').addEventListener('change', function (e) { hbAvatarUpload(e.target.files && e.target.files[0]); });
    }
    hbRenderAvatarPreview();
    ov.classList.add('open');
  };
  window.hbCloseAvatarPicker = function () { var ov = document.getElementById('hbAvatarOverlay'); if (ov) ov.classList.remove('open'); };
  function hbRenderAvatarPreview() {
    var p = document.getElementById('hbAvatarPreview'); if (!p) return;
    var name = hbUser ? hbResolveName(hbUser) : 'U';
    p.outerHTML = hbAvatarHtml(name, hbUserAvatar.photo, hbUserAvatar.icon, 'hb-av-current').replace('class="hb-av-current', 'id="hbAvatarPreview" class="hb-av-current');
  }
  function hbAvatarSave(fields, okMsg) {
    // Include displayName so the write satisfies the users/{uid} create+update
    // rules even if the person has no profile doc yet.
    fields.displayName = hbResolveName(hbUser);
    var msg = document.getElementById('hbAvatarMsg'); if (msg) { msg.className = 'hb-av-msg'; msg.textContent = 'Saving…'; }
    db.collection('users').doc(hbUser.uid).set(fields, { merge: true }).then(function () {
      hbUserAvatar = { photo: fields.photoURL || null, icon: fields.avatarIcon || null };
      var isAdmin = hbUser.email === 'info@livabletelluride.org';
      hbSetComposeAvatar(hbResolveName(hbUser), isAdmin);
      hbRenderAvatarPreview();
      if (msg) { msg.className = 'hb-av-msg ok'; msg.textContent = okMsg || 'Saved!'; }
      setTimeout(hbCloseAvatarPicker, 1100);
    }).catch(function () { if (msg) { msg.className = 'hb-av-msg err'; msg.textContent = 'Could not save — try again.'; } });
  }
  window.hbAvatarChoose = function (kind, id) {
    if (kind === 'icon') hbAvatarSave({ avatarIcon: id, photoURL: firebase.firestore.FieldValue.delete() }, 'Icon set!');
    else hbAvatarSave({ avatarIcon: firebase.firestore.FieldValue.delete(), photoURL: firebase.firestore.FieldValue.delete() }, 'Using your initial.');
  };
  function hbAvatarUpload(file) {
    if (!file || !hbUser) return;
    var msg = document.getElementById('hbAvatarMsg');
    if (file.size > 5 * 1024 * 1024) { if (msg) { msg.className = 'hb-av-msg err'; msg.textContent = 'Image must be under 5 MB.'; } return; }
    if (msg) { msg.className = 'hb-av-msg'; msg.textContent = 'Uploading…'; }
    var ref = storage.ref('hub-bub/' + hbUser.uid + '/avatar_' + Date.now() + '_' + file.name);
    ref.put(file).then(function (snap) { return snap.ref.getDownloadURL(); })
      .then(function (url) { hbAvatarSave({ photoURL: url, avatarIcon: firebase.firestore.FieldValue.delete() }, 'Photo set!'); })
      .catch(function () { if (msg) { msg.className = 'hb-av-msg err'; msg.textContent = 'Upload failed — try again.'; } });
  }
  // Listen for auth state changes
  if (hbFirebaseReady) {
    auth.onAuthStateChanged(function(user) {
      hbUpdateAuthUI(user);
      if (user) {
        hbLoadPosts();
      }
    });
  }
  function hbShowConfigNeeded() {
    alert('Hub-Bub is almost ready! The site administrator needs to configure Firebase. See the setup instructions in the source code.');
  }
  // ═══════════════════════════════
  // COMPOSE / POST FUNCTIONS
  // ═══════════════════════════════
  window.hbExpandCompose = function() {
    var compose = document.getElementById('hbCompose');
    compose.classList.add('expanded');
    var isAdmin = hbUser && hbUser.email === 'info@livabletelluride.org';
    // Not logged in → open the signup/login modal. Any signed-in user can
    // post — email verification was dropped 2026-05-28.
    if (!hbUser) {
      hbShowAuth('signup');
      compose.classList.remove('expanded');
      return;
    }
    // Logged in: composer stays open.
  };
  // ─── Conversation Starter ───
  window.hbRespondToStarter = function() {
    hbExpandCompose();
    // Pick a random conversation starter
    var starter = HB_CONVERSATION_STARTERS[Math.floor(Math.random() * HB_CONVERSATION_STARTERS.length)];
    document.getElementById('hbComposeTitle').value = starter;
    hbUpdatePostBtn();

  };
  // ─── Mode Switching ───
  window.hbSetMode = function(mode) {
    hbCurrentMode = mode;
    document.querySelectorAll('[data-hb-mode]').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.hbMode === mode);
    });
    hbRenderPosts();
  };
  // ─── Post Type Selection ───
  window.hbSelectPostType = function(ptype) {
    hbSelectedPostType = ptype;
    document.querySelectorAll('[data-hb-ptype]').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.hbPtype === ptype);
    });

    // Update placeholders
    var typeInfo = HB_POST_TYPES[ptype] || {};
    var titleInput = document.getElementById('hbComposeTitle');
    var bodyInput = document.getElementById('hbComposeBody');
    if (titleInput) titleInput.placeholder = typeInfo.titlePlaceholder || 'Enter title...';
    if (bodyInput) bodyInput.placeholder = typeInfo.bodyPlaceholder || 'Enter content...';

    // Show/hide extra fields
    var sourceFields = document.querySelector('.hb-source-fields');
    var debriefFields = document.querySelector('.hb-debrief-fields');
    if (sourceFields) sourceFields.style.display = (ptype === 'source') ? '' : 'none';
    if (debriefFields) debriefFields.style.display = (ptype === 'debrief') ? '' : 'none';

    // Auto-expand
    hbExpandCompose();
  };
  // ─── Next Step Cue Selection ───
  window.hbToggleNextStep = function(step, btn) {
    if (btn.classList.contains('selected')) {
      btn.classList.remove('selected');
      hbSelectedNextStep = null;
    } else {
      document.querySelectorAll('[data-hb-step]').forEach(function(b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      hbSelectedNextStep = step;
    }
  };
  var hbSelectedNextStep = null;
  // Post type button click handlers
  document.querySelectorAll('[data-hb-ptype]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      hbSelectPostType(btn.dataset.hbPtype);
    });
  });
  // Tag selection in compose
  document.querySelectorAll('.hb-compose-tag').forEach(function(tag) {
    tag.addEventListener('click', function() {
      tag.classList.toggle('selected');
      hbUpdatePostBtn();
    });
  });
  // Mode tab buttons (All Posts, Questions, What Happened, Ideas & Solutions)
  document.querySelectorAll('.hb-mode-btn[data-hb-mode]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      hbSetMode(btn.dataset.hbMode);
    });
  });
  // Topic filter chips — use event delegation so dynamic chips work too
  var _hbTopicBar = document.getElementById('hbTopicBar');
  if (_hbTopicBar) {
    _hbTopicBar.addEventListener('click', function(e) {
      var chip = e.target.closest('.hb-topic-chip');
      if (!chip) return;
      _hbTopicBar.querySelectorAll('.hb-topic-chip').forEach(function(c) { c.classList.remove('active'); });
      chip.classList.add('active');
      hbCurrentTopic = chip.dataset.hbTopic;
      hbRenderPosts();
    });
  }
  // Enable/disable post button
  function hbUpdatePostBtn() {
    var title = document.getElementById('hbComposeTitle').value.trim();
    var body = document.getElementById('hbComposeBody').value.trim();
    var linkUrl = (document.getElementById('hbComposeLinkUrl') || {value:''}).value.trim();
    var tags = document.querySelectorAll('.hb-compose-tag.selected');
    document.getElementById('hbPostBtn').disabled = !(title && body && tags.length > 0);
  }
  document.getElementById('hbComposeTitle').addEventListener('input', hbUpdatePostBtn);
  document.getElementById('hbComposeBody').addEventListener('input', hbUpdatePostBtn);

  // ── Link preview: live composer preview + paste-to-unfurl ──────────────
  // (a) typing/pasting in the URL field shows a live thumbnail so the author
  //     sees the photo before posting; (b) pasting a URL straight into the
  //     body auto-detects it and fills the URL field, so they don't have to
  //     click "Add Link" first. hbFetchOgPreview / hbEsc are hoisted decls.
  (function wireComposerLinkPreview() {
    var bodyEl = document.getElementById('hbComposeBody');
    var urlEl  = document.getElementById('hbComposeLinkUrl');
    var rowEl  = document.getElementById('hbComposeLinkRow');
    var prevEl = document.getElementById('hbComposeLinkPreview');
    if (!urlEl || !prevEl) return;
    var debTimer = null, lastPreviewed = '', autoLink = '';

    function clearPreview() { lastPreviewed = ''; prevEl.innerHTML = ''; }

    function showPreview(url) {
      url = (url || '').trim();
      if (url === lastPreviewed) return;
      lastPreviewed = url;
      if (!/^https?:\/\//i.test(url)) { prevEl.innerHTML = ''; return; }
      prevEl.innerHTML = '<div class="hb-clp-loading">Loading preview…</div>';
      hbFetchOgPreview(url, function(data) {
        // Drop stale responses if the field changed while fetching.
        if ((urlEl.value || '').trim() !== url) return;
        var host = ''; try { host = new URL(url).hostname; } catch(e) { host = url; }
        var hasImg = !!(data && data.imageUrl);
        var note = hasImg
          ? '<div class="hb-clp-note ok">✓ This image will appear on your post.</div>'
          : '<div class="hb-clp-note warn">No preview image for this link — your post will show a text link card. (Facebook, Instagram &amp; other social links can’t show a photo.)</div>';
        prevEl.innerHTML =
          '<div class="hb-clp-card">' +
            (hasImg ? '<img src="' + hbEsc(data.imageUrl) + '" alt="" onerror="this.remove()">' : '') +
            '<div class="hb-clp-text">' +
              '<div class="hb-clp-title">' + hbEsc((data && data.title) || host) + '</div>' +
              '<div class="hb-clp-domain">' + hbEsc(host) + '</div>' +
              note +
            '</div>' +
            '<button type="button" class="hb-clp-remove" title="Remove link" aria-label="Remove link">×</button>' +
          '</div>';
        prevEl.querySelector('.hb-clp-remove').addEventListener('click', function() {
          urlEl.value = ''; autoLink = ''; clearPreview();
        });
      });
    }

    urlEl.addEventListener('input', function() {
      // Hand-editing the field detaches it from body auto-detection.
      if (urlEl.value.trim() !== autoLink) autoLink = '';
      clearTimeout(debTimer);
      debTimer = setTimeout(function() { showPreview(urlEl.value); }, 500);
    });

    // Auto-detect the first URL typed/pasted into the body.
    function scanBody() {
      var m = (bodyEl.value || '').match(/https?:\/\/[^\s<>"')]+/i);
      var found = m ? m[0] : '';
      var current = urlEl.value.trim();
      if (found) {
        // Fill only if the field is empty or still holds a prior auto value,
        // so we never clobber a URL the author typed by hand.
        if ((!current || current === autoLink) && found !== current) {
          urlEl.value = found;
          autoLink = found;
          if (rowEl && rowEl.style.display === 'none') rowEl.style.display = '';
          showPreview(found);
        }
      } else if (current && current === autoLink) {
        // The auto-detected URL was removed from the body → clear it.
        urlEl.value = ''; autoLink = ''; clearPreview();
      }
    }
    if (bodyEl) {
      bodyEl.addEventListener('input', scanBody);
      bodyEl.addEventListener('paste', function() { setTimeout(scanBody, 0); });
    }

    // Exposed so hbSubmitPost's reset can fully clear the preview state
    // (programmatic value changes don't fire 'input', so lastPreviewed
    // would otherwise go stale and suppress the next identical URL).
    window.hbResetLinkPreview = function() { urlEl.value = ''; autoLink = ''; clearPreview(); };
  })();
  // File attachments
  window.hbTriggerAttach = function() {
    document.getElementById('hbFileInput').click();
  };
  var HB_DOC_MAX_MB = 20; // per-file limit for documents
  // Allow-list for attachments: images + common document types. Blocks
  // executables/scripts/archives/etc. Checked by MIME first; falls back to
  // file extension when the browser reports an empty type. Enforced again
  // server-side in storage.rules (this is just the friendly client guard).
  var HB_ALLOWED_EXT = /\.(jpe?g|png|gif|webp|heic|heif|pdf|docx?|txt|rtf)$/i;
  function hbIsAllowedUpload(file) {
    var t = (file.type || '').toLowerCase();
    if (t.indexOf('image/') === 0) return true;
    if (t === 'application/pdf') return true;
    if (/msword|wordprocessingml|officedocument|rtf|text\/plain/.test(t)) return true;
    if (!t && HB_ALLOWED_EXT.test(file.name || '')) return true; // empty MIME → trust extension
    return false;
  }
  window.hbHandleFiles = function(input) {
    var files = Array.from(input.files);
    files.forEach(function(file) {
      if (!hbIsAllowedUpload(file)) {
        alert('"' + file.name + '" can\'t be attached. Allowed file types: images (JPG/PNG/GIF/WebP), PDF, Word, and text documents.');
        return;
      }
      if (file.size > HB_DOC_MAX_MB * 1024 * 1024) {
        alert('File "' + file.name + '" is too large (max ' + HB_DOC_MAX_MB + ' MB). For large PDFs, consider compressing first.');
        return;
      }
      hbPendingAttachments.push(file);
    });
    hbRenderAttachPreview();
    input.value = '';
  };
  function hbRenderAttachPreview() {
    var container = document.getElementById('hbAttachPreview');
    container.innerHTML = '';
    hbPendingAttachments.forEach(function(file, i) {
      var item = document.createElement('div');
      item.className = 'hb-attach-item';
      var icon = file.type.startsWith('image/') ? '🖼️' : '📄';
      item.innerHTML = icon + ' ' + hbEsc(file.name) + ' <span class="hb-remove-attach" onclick="hbRemoveAttach(' + i + ')">✕</span>';
      container.appendChild(item);
    });
  }
  window.hbRemoveAttach = function(idx) {
    hbPendingAttachments.splice(idx, 1);
    hbRenderAttachPreview();
  };
  // ═══════════════════════════════
  // FEATURED PHOTO (one optional image per post)
  // ═══════════════════════════════
  var hbPendingPhoto = null; // File object for the featured image
  window.hbTriggerPhoto = function() {
    document.getElementById('hbPhotoInput').click();
  };
  window.hbHandlePhoto = function(input) {
    var file = input.files && input.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, GIF, or WebP).');
      input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image is too large (max 5 MB). Please choose a smaller photo.');
      input.value = '';
      return;
    }
    hbPendingPhoto = file;
    var reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('hbPhotoPreviewImg').src = e.target.result;
      document.getElementById('hbPhotoPreview').classList.add('has-photo');
    };
    reader.readAsDataURL(file);
    input.value = '';
  };
  window.hbReplacePhoto = function() {
    document.getElementById('hbPhotoInput').click();
  };
  window.hbRemovePhoto = function() {
    hbPendingPhoto = null;
    document.getElementById('hbPhotoPreviewImg').src = '';
    document.getElementById('hbPhotoPreview').classList.remove('has-photo');
  };
  // ═══════════════════════════════
  // AI TONE REVIEW
  // ═══════════════════════════════
  // Personal attack detection patterns. Each carries an explicit category
  // (drives the suggested rephrase) so adding/reordering patterns can't
  // accidentally mis-map the suggestion.
  var ATTACK_PATTERNS = [
    // Direct "you are" insults
    { category: 'competence', re: /\byou(?:'re| are)\s+(?:an?\s+)?(?:idiot|moron|fool|liar|fraud|crook|corrupt|scum|trash|joke|disgrace|pathetic|worthless|incompetent|stupid|dumb|ignorant|clueless)/i },
    // Name-calling with "is/are"
    { category: 'character', re: /\b(?:he|she|they|mayor|council\s*(?:man|woman|member|person)?|commissioner|manager|director|board\s*member)\s+(?:is|are)\s+(?:an?\s+)?(?:idiot|moron|fool|liar|fraud|crook|corrupt|scum|trash|joke|disgrace|pathetic|worthless|incompetent|stupid|dumb|ignorant|clueless)/i },
    // "[Name] is a/an [insult]"
    { category: 'character', re: /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s+is\s+(?:an?\s+)?(?:idiot|moron|fool|liar|fraud|crook|corrupt|scum|trash|joke|disgrace|pathetic|worthless|incompetent|stupid|dumb|ignorant|clueless)/i },
    // Imperative attacks
    { category: 'dismissive', re: /\b(?:shut\s+up|go\s+away|get\s+lost|drop\s+dead|go\s+to\s+hell|f[\*u]ck\s+(?:you|off|yourself))\b/i },
    // Dehumanizing language
    { category: 'profanity', re: /\b(?:piece\s+of\s+(?:shit|crap|garbage)|human\s+garbage|waste\s+of\s+(?:space|oxygen|skin))\b/i },
    // Threats
    { category: 'threat', re: /\b(?:i'?ll|we'?ll|gonna|going\s+to)\s+(?:destroy|ruin|end|hurt|get)\s+(?:you|him|her|them)\b/i },
    // General profanity used at someone
    { category: 'profanity', re: /\b(?:f[\*u]ck(?:ing)?|shit(?:ty)?|ass(?:hole)?|bitch|bastard|damn(?:ed)?)\s+(?:you|him|her|them|[A-Z][a-z]+)\b/i },
    // Personal fitness attacks — "[someone] is (wholly) unsuited/unqualified/unfit/incompetent"
    { category: 'competence', re: /\b(?:is|are|seems?|sounds?|looks?)\s+(?:wholly|totally|completely|utterly|entirely|clearly|obviously|simply|just|so|quite|rather|absolutely)?\s*(?:unsuited|unqualified|unfit|incompetent|ill-?suited|not\s+(?:at\s+all\s+)?qualified|not\s+fit\b)/i },
    // Calls to fire / remove / resign a person
    { category: 'competence', re: /\b(?:should|ought\s+to|needs?\s+to|must|deserves?\s+to|has\s+to)\s+(?:be\s+)?(?:fired|sacked|booted|ousted|let\s+go|forced\s+out|kicked\s+out)\b/i },
    { category: 'competence', re: /\b(?:should|ought\s+to|needs?\s+to|must|has\s+to)\s+(?:resign|step\s+down|quit)\b/i },
    // Disparaging someone's credentials — "without any background/credibility"
    { category: 'character', re: /\bwithout\s+(?:any\s+)?(?:background|credibility|qualifications?|integrity|competence|business)\b/i },
    // "[person] has no business/credibility/qualifications..."
    { category: 'character', re: /\b(?:he|she|they|you|[A-Z][a-z]+)\s+(?:has|have|had)\s+no\s+(?:business|credibility|qualifications?|integrity|competence)\b/i },
  ];
  // Suggestion templates — keyed by the type of attack detected
  var TONE_SUGGESTIONS = {
    'competence': 'I have serious concerns about the decision-making in this area. The outcomes suggest a need for different leadership or expertise.',
    'character': 'I question the motivations behind this decision. The community deserves more transparency about why this path was chosen.',
    'general': 'I feel strongly that this approach is wrong. Here is why I think the community would be better served by a different direction:',
    'profanity': 'I am deeply frustrated by what I am seeing here. This situation demands accountability and real answers from our leaders.',
    'threat': 'I believe there need to be consequences for these decisions. The community should hold leadership accountable through proper channels.',
    'dismissive': 'I fundamentally disagree with this perspective. Here is why I think the evidence points in a different direction:'
  };
  function hbAnalyzeTone(text) {
    if (!text || text.length < 10) return null;
    for (var i = 0; i < ATTACK_PATTERNS.length; i++) {
      if (ATTACK_PATTERNS[i].re.test(text)) {
        var category = ATTACK_PATTERNS[i].category || 'general';
        return {
          flagged: true,
          category: category,
          suggestion: TONE_SUGGESTIONS[category] || TONE_SUGGESTIONS['general']
        };
      }
    }
    return { flagged: false };
  }
  window.hbUseSuggested = function() {
    var suggested = document.getElementById('hbToneSuggested').textContent;
    document.getElementById('hbComposeBody').value = suggested;
    document.getElementById('hbToneNudge').classList.remove('visible');
    hbUpdatePostBtn();
  };
  window.hbKeepOriginal = function() {
    document.getElementById('hbComposeBody').value = hbToneOriginalText;
    document.getElementById('hbToneNudge').classList.remove('visible');
    hbDoActualPost();
  };
  window.hbEditMore = function() {
    document.getElementById('hbToneNudge').classList.remove('visible');
    document.getElementById('hbComposeBody').focus();
  };
  // ═══════════════════════════════
  // POST SUBMISSION
  // ═══════════════════════════════
  window.hbSubmitPost = function() {
    var isAdmin = hbUser && hbUser.email === 'info@livabletelluride.org';
    if (!hbUser) { hbShowAuth('login'); return; }
    if (!hbFirebaseReady) { hbShowConfigNeeded(); return; }
    var body = document.getElementById('hbComposeBody').value.trim();
    // Run tone check first
    var toneResult = hbAnalyzeTone(body);
    if (toneResult && toneResult.flagged) {
      hbToneOriginalText = body;
      document.getElementById('hbToneOriginal').textContent = '"' + body.substring(0, 200) + (body.length > 200 ? '...' : '') + '"';
      document.getElementById('hbToneSuggested').textContent = toneResult.suggestion;
      document.getElementById('hbToneNudge').classList.add('visible');
      return; // Don't post yet — let user choose
    }
    hbDoActualPost();
  };
  function hbDoActualPost() {
    var title = document.getElementById('hbComposeTitle').value.trim();
    var body = document.getElementById('hbComposeBody').value.trim();
    // Optional link URL — read here in the post path's own scope. (It's also
    // read independently in hbUpdatePostBtn; that local doesn't reach here, so
    // omitting this line threw "linkUrl is not defined" and blocked posting.)
    var linkUrl = (document.getElementById('hbComposeLinkUrl') || {value:''}).value.trim();
    var selectedTags = [];
    document.querySelectorAll('.hb-compose-tag.selected').forEach(function(t) {
      selectedTags.push(t.dataset.hbTag);
    });
    if (!title || !body || selectedTags.length === 0) {
      var missing = [];
      if (!title) missing.push('a title');
      if (!body) missing.push('a message');
      if (selectedTags.length === 0) missing.push('at least one tag');
      alert('Please add ' + missing.join(', ') + ' before posting.');
      return;
    }
    var postBtn = document.getElementById('hbPostBtn');
    postBtn.disabled = true;
    postBtn.textContent = 'Posting...';
    // Upload featured photo (if any), then attachments, then create post
    var photoPromise = hbPendingPhoto
      ? (function() {
          var pPath = 'hub-bub/' + hbUser.uid + '/photo_' + Date.now() + '_' + hbPendingPhoto.name;
          var pRef = storage.ref(pPath);
          return pRef.put(hbPendingPhoto).then(function(snap) {
            return snap.ref.getDownloadURL();
          });
        })()
      : Promise.resolve(null);
    var uploadPromises = hbPendingAttachments.map(function(file) {
      var path = 'hub-bub/' + hbUser.uid + '/' + Date.now() + '_' + file.name;
      var ref = storage.ref(path);
      return ref.put(file).then(function(snap) {
        return snap.ref.getDownloadURL().then(function(url) {
          return { name: file.name, url: url, type: file.type };
        });
      });
    });
    Promise.all([photoPromise, Promise.all(uploadPromises)]).then(function(results) {
      var imageUrl = results[0];
      var attachments = results[1];
      var postData = {
        // authorUid is required by firestore.rules' ownsField('authorUid')
        // check; authorId is kept for backward compat with older readers
        // (hbRenderTrending et al. that look up p.authorId for the user map).
        authorUid: hbUser.uid,
        authorId: hbUser.uid,
        authorName: hbResolveName(hbUser),
        authorPhoto: hbUserAvatar.photo || null,
        authorIcon: hbUserAvatar.icon || null,
        title: title,
        body: body,
        tags: selectedTags,
        postType: hbSelectedPostType || 'question',
        attachments: attachments,
        imageUrl: imageUrl || null,
        linkUrl: linkUrl || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        replyCount: 0,
        upvotes: 0,
        downvotes: 0,
        upvoters: [],
        downvoters: [],
        reactions: { useful: 0, helpful_source: 0, good_question: 0, learned: 0 },
        reactors: {},
        nextStep: hbSelectedNextStep || null
      };
      // Add debrief-specific fields
      if (hbSelectedPostType === 'debrief') {
        postData.debriefMeeting = document.getElementById('hbDebriefMeeting') ? document.getElementById('hbDebriefMeeting').value.trim() : '';
        postData.debriefDate = document.getElementById('hbDebriefDate') ? document.getElementById('hbDebriefDate').value : '';
        postData.debriefTakeaways = document.getElementById('hbDebriefTakeaways') ? document.getElementById('hbDebriefTakeaways').value.trim() : '';
        postData.debriefChanged = document.getElementById('hbDebriefChanged') ? document.getElementById('hbDebriefChanged').value.trim() : '';
        postData.debriefUnresolved = document.getElementById('hbDebriefUnresolved') ? document.getElementById('hbDebriefUnresolved').value.trim() : '';
        postData.debriefLink = document.getElementById('hbDebriefLink') ? document.getElementById('hbDebriefLink').value.trim() : '';
        postData.debriefQuestion = document.getElementById('hbDebriefQuestion') ? document.getElementById('hbDebriefQuestion').value.trim() : '';
      }
      // Add source-specific fields
      if (hbSelectedPostType === 'source') {
        postData.sourceUrl = document.getElementById('hbSourceUrl') ? document.getElementById('hbSourceUrl').value.trim() : '';
        postData.sourceWhy = document.getElementById('hbSourceWhy') ? document.getElementById('hbSourceWhy').value.trim() : '';
        postData.sourceQuestion = document.getElementById('hbSourceQuestion') ? document.getElementById('hbSourceQuestion').value.trim() : '';
      }
      return db.collection('posts').add(postData);
    }).then(function(docRef) {
      // AI moderation — fire-and-forget. The Worker asks Claude whether the post
      // is a personal attack / harassment / threat; if so it emails info@ with
      // one-click Accept/Deny links. Never blocks posting; failure is silent.
      try {
        if (docRef && docRef.id) {
          fetch(SITE_CONFIG.RSS_PROXY_BASE + '/moderate', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postId: docRef.id, title: title, body: body, authorName: hbResolveName(hbUser) })
          }).catch(function() {});
        }
      } catch (e) {}
      // Update user post count
      db.collection('users').doc(hbUser.uid).update({
        postCount: firebase.firestore.FieldValue.increment(1)
      }).catch(function() {});
      // Reset compose
      document.getElementById('hbComposeTitle').value = '';
      document.getElementById('hbComposeBody').value = '';
      document.querySelectorAll('.hb-compose-tag.selected').forEach(function(t) { t.classList.remove('selected'); });
      document.querySelectorAll('[data-hb-ptype]').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('[data-hb-step]').forEach(function(b) { b.classList.remove('selected'); });
      var _lr=document.getElementById('hbComposeLinkRow'),_li=document.getElementById('hbComposeLinkUrl'),_lb=document.getElementById('hbComposeLinkBtn');
      if(_lr)_lr.style.display='none'; if(_li)_li.value=''; if(_lb)_lb.style.background='';
      if(window.hbResetLinkPreview)window.hbResetLinkPreview();
      hbPendingAttachments = [];
      hbRenderAttachPreview();
      hbRemovePhoto();
      hbSelectedPostType = null;
      hbSelectedNextStep = null;
      document.getElementById('hbCompose').classList.remove('expanded');
      document.getElementById('hbToneNudge').classList.remove('visible');
      postBtn.textContent = 'Post to Hub-Bub';
      postBtn.disabled = true;
      // Brief delay to let serverTimestamp settle before reloading
      setTimeout(hbLoadPosts, 1500);
    }).catch(function(err) {
      console.error('Hub-Bub post error:', err);
      // Surface the real reason (Firebase Storage rules denial, CORS, quota,
      // network, etc.) so the user can act on it instead of just retrying.
      // Common code mappings:
      //   storage/unauthorized       → Firebase Storage rules deny this path
      //   storage/quota-exceeded     → bucket is full
      //   storage/retry-limit-exceeded → CORS / network / slow upload
      //   permission-denied (Firestore) → Firestore rules don't allow this write
      var msg = 'Could not publish your post.';
      if (err && err.code) {
        if (/unauthorized/i.test(err.code)) {
          msg += '\n\nThe photo upload was rejected by storage permissions. '
              +  'If you can post WITHOUT a photo, this is the issue.';
        } else if (/quota|exceeded/i.test(err.code)) {
          msg += '\n\nStorage quota exceeded. Try a smaller photo, or notify the admin.';
        } else if (/retry-limit|network|timeout/i.test(err.code)) {
          msg += '\n\nUpload failed — could be a network issue or the photo is very large. '
              +  'Try again, or try a smaller photo.';
        } else if (/permission-denied/i.test(err.code)) {
          msg += '\n\nYour account isn\'t allowed to post. Verify your email is confirmed, then retry.';
        } else {
          msg += '\n\n(' + err.code + ') ' + (err.message || '');
        }
      } else if (err && err.message) {
        msg += '\n\n' + err.message;
      } else {
        msg += ' Please try again.';
      }
      alert(msg);
      postBtn.textContent = 'Post to Hub-Bub';
      postBtn.disabled = false;
    });
  }
  // ═══════════════════════════════
  // LOAD & RENDER POSTS
  // ═══════════════════════════════
  function hbLoadPosts() {
    if (!hbFirebaseReady) {
      hbRenderDemoPosts();
      return;
    }
    var loadEl = document.getElementById('hbLoading');
    if (loadEl) loadEl.style.display = '';
    db.collection('posts').orderBy('createdAt', 'desc').limit(100).get()
      .then(function(snap) {
        hbPosts = [];
        snap.forEach(function(doc) {
          var d = doc.data();
          d.id = doc.id;
          hbPosts.push(d);
        });
        hbRenderPosts();
        hbRefreshFilterChips();
        hbRenderTrending();
        hbRenderStats();
        hbRenderMostUseful();
        hbRenderUnanswered();
      })
      .catch(function(err) {
        console.error('Hub-Bub load error:', err);
        if (loadEl) loadEl.style.display = 'none';
        // Only show demo posts if we have no real posts loaded yet
        if (hbPosts.length === 0) hbRenderDemoPosts();
      });
  }
  function hbRenderPosts() {
    var feed = document.getElementById('hbPostsFeed');
    var loadEl = document.getElementById('hbLoading');
    var emptyEl = document.getElementById('hbEmpty');
    if (loadEl) loadEl.style.display = 'none';
    // Filter by topic. NOTE: start from a COPY of hbPosts — the sort step
    // below must never mutate the source array, or switching back to
    // "Newest" after "Most Discussed"/"Most Useful" wouldn't restore date
    // order (the .sort() would have reordered hbPosts itself).
    var filtered = hbPosts.slice();
    if (hbCurrentTopic !== 'all') {
      filtered = filtered.filter(function(p) {
        return p.tags && p.tags.indexOf(hbCurrentTopic) !== -1;
      });
    }
    // Filter by mode
    if (hbCurrentMode === 'question') {
      filtered = filtered.filter(function(p) { return p.postType === 'question'; });
    } else if (hbCurrentMode === 'what-happened') {
      filtered = filtered.filter(function(p) { return p.postType === 'debrief' || p.postType === 'source'; });
    } else if (hbCurrentMode === 'ideas') {
      filtered = filtered.filter(function(p) { return p.postType === 'solution' || p.postType === 'need' || p.postType === 'volunteer'; });
    }
    // Sort (operates on the `filtered` copy only — see note above).
    if (hbCurrentSort === 'most-discussed') {
      filtered.sort(function(a, b) { return (b.replyCount || 0) - (a.replyCount || 0); });
    } else if (hbCurrentSort === 'most-useful') {
      filtered.sort(function(a, b) {
        var aTotalReactions = Object.values(a.reactions || {}).reduce(function(sum, val) { return sum + val; }, 0);
        var bTotalReactions = Object.values(b.reactions || {}).reduce(function(sum, val) { return sum + val; }, 0);
        return bTotalReactions - aTotalReactions;
      });
    } else {
      // 'newest' (default) — explicit createdAt-desc so chronological order
      // is always restored, even after a prior most-discussed/useful sort.
      filtered.sort(function(a, b) {
        var ad = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt)) : new Date(0);
        var bd = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt)) : new Date(0);
        return bd - ad;
      });
    }
    // Clear existing posts (keep loading/empty divs)
    var existingPosts = feed.querySelectorAll('.hb-post');
    existingPosts.forEach(function(p) { p.remove(); });
    if (filtered.length === 0) {
      if (emptyEl) emptyEl.style.display = '';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    filtered.forEach(function(post) {
      feed.appendChild(hbCreatePostCard(post));
    });
  }
  function hbCreatePostCard(post) {
    var card = document.createElement('div');
    card.className = 'hb-post';
    card.dataset.postId = post.id;

    // Add class based on post type
    var postTypeClass = '';
    if (post.postType === 'debrief') {
      card.classList.add('debrief-card');
      postTypeClass = 'debrief';
    } else if (post.postType === 'source') {
      card.classList.add('source-card');
      postTypeClass = 'source';
    }

    var initial = (post.authorName || '?').charAt(0).toUpperCase();
    var timeStr = post.createdAt ? hbTimeAgo(post.createdAt.toDate ? post.createdAt.toDate() : new Date(post.createdAt)) : 'just now';
    var isLong = post.body && post.body.length > 900;
    var bodyText = isLong ? post.body.substring(0, 900) + '...' : (post.body || '');
    var myUid = hbUser ? hbUser.uid : '';
    var votedUp = post.upvoters && post.upvoters.indexOf(myUid) !== -1;
    var votedDown = post.downvoters && post.downvoters.indexOf(myUid) !== -1;

    // Get total reactions
    var totalReactions = Object.values(post.reactions || {}).reduce(function(sum, val) { return sum + val; }, 0);
    // The user's own reaction is tracked client-side (localStorage) rather than
    // in a `reactors` map on the post — the Firestore rules only let a non-author
    // change reactions/replyCount/lastReplyAt, not an arbitrary `reactors` field,
    // so writing reactors made every non-author reaction silently fail.
    var userReaction = null;
    try { userReaction = localStorage.getItem('hb_react_' + post.id) || null; } catch (e) {}

    var tagsHtml = '';
    if (post.tags && post.tags.length) {
      tagsHtml = '<div class="hb-post-tags">' + post.tags.map(function(t) {
        var info = HB_TOPICS[t] || { icon: '💡', label: t };
        return '<span class="hb-post-tag">' + info.icon + ' ' + hbEsc(info.label) + '</span>';
      }).join('') + '</div>';
    }

    // Post-type badge (Question / Discussion / Debrief / Source) — hidden
    // from rendered cards per user request 2026-05-27. The category tags
    // (Housing / Land Use / etc.) carry the topical signal; the post-type
    // badge was redundant noise. postType is still STORED on the doc so a
    // future feature can filter/sort by it; we just don't display it.
    var badgeHtml = '';

    // Split attachments into images (top of left column) and docs (below).
    var attachImagesHtml = '';
    var attachDocsHtml = '';
    if (post.attachments && post.attachments.length) {
      var imgParts = [];
      var docParts = [];
      post.attachments.forEach(function(a) {
        var isImage = a.type && a.type.startsWith('image/');
        var isPdf   = a.type === 'application/pdf' || (a.name && a.name.toLowerCase().endsWith('.pdf'));
        if (isImage) {
          // Large preview thumbnail — clicking opens full-size in a new tab
          imgParts.push(
            '<a class="hb-post-attach-image" href="' + hbEsc(a.url) + '" target="_blank" rel="noopener" title="' + hbEsc(a.name) + '">' +
              '<img src="' + hbEsc(a.url) + '" alt="' + hbEsc(a.name) + '" loading="lazy">' +
            '</a>'
          );
        } else if (isPdf) {
          // PDF tile card — opens in a new tab (browser's built-in PDF viewer
          // handles rendering reliably). Avoids the Google Docs Viewer iframe
          // which silently fails when Firebase Storage URLs include auth tokens.
          docParts.push(
            '<a class="hb-post-attach-doc" href="' + hbEsc(a.url) + '" target="_blank" rel="noopener" title="' + hbEsc(a.name) + '">' +
              '<span class="hb-attach-icon">📄</span>' +
              '<span class="hb-attach-name">' + hbEsc(a.name) + '</span>' +
              '<span class="hb-attach-cta">Open PDF →</span>' +
            '</a>'
          );
        } else {
          // Other documents (Word, txt, etc.) — route through the Docs Viewer modal
          docParts.push(
            '<a class="hb-post-attach-doc" href="#" ' +
              'onclick="hbOpenDocModal(' + JSON.stringify(a.url) + ',' + JSON.stringify(a.name) + ');return false;" ' +
              'title="' + hbEsc(a.name) + '">' +
              '<span class="hb-attach-icon">📄</span>' +
              '<span class="hb-attach-name">' + hbEsc(a.name) + '</span>' +
              '<span class="hb-attach-cta">Open →</span>' +
            '</a>'
          );
        }
      });
      if (imgParts.length) attachImagesHtml = imgParts.join('');
      if (docParts.length) attachDocsHtml = '<div class="hb-post-attach-docs">' + docParts.join('') + '</div>';
    }

    // Next step cue
    var nextStepHtml = '';
    if (post.nextStep) {
      nextStepHtml = '<div class="hb-nextstep-cue">Next step: ' + hbEsc(post.nextStep) + '</div>';
    }

    // Debrief-specific rendering
    var debriefHtml = '';
    if (postTypeClass === 'debrief') {
      debriefHtml = '<div class="hb-debrief-details">';
      if (post.debriefMeeting) debriefHtml += '<div><strong>Meeting:</strong> ' + hbEsc(post.debriefMeeting) + '</div>';
      if (post.debriefDate) debriefHtml += '<div><strong>Date:</strong> ' + hbEsc(post.debriefDate) + '</div>';
      if (post.debriefTakeaways) debriefHtml += '<div><strong>Key Takeaways:</strong> ' + hbEsc(post.debriefTakeaways) + '</div>';
      debriefHtml += '</div>';
    }

    // Source-specific rendering
    var sourceHtml = '';
    if (postTypeClass === 'source' && post.sourceUrl) {
      sourceHtml = '<div class="hb-source-link"><a href="' + hbEsc(post.sourceUrl) + '" target="_blank">View Source Document</a></div>';
    }
    var linkPreviewHtml = post.linkUrl
      ? '<div class="hb-post-link-preview" data-link-url="' + hbEsc(post.linkUrl) + '"></div>'
      : '';

    // Constructive reactions
    var reactionsHtml = '<div class="hb-reactions">';
    // Keys stay stable (existing reaction counts carry over); only the emoji +
    // label change. firestore.rules allows any key under `reactions`, so no
    // rules/data migration is needed.
    var reactionTypes = [
      { key: 'useful', label: 'Support', emoji: '👍' },
      { key: 'helpful_source', label: 'Helpful', emoji: '✅' },
      { key: 'good_question', label: 'Worth Watching', emoji: '👀' },
      { key: 'learned', label: 'Important', emoji: '📌' }
    ];
    reactionTypes.forEach(function(r) {
      var count = (post.reactions && post.reactions[r.key]) || 0;
      var isSelected = userReaction === r.key ? ' selected' : '';
      reactionsHtml += '<button class="hb-react-btn' + isSelected + '" onclick="hbReact(\'' + post.id + '\',\'' + r.key + '\')" title="' + r.label + '"><span class="hb-react-emoji">' + r.emoji + '</span> <span>' + count + '</span></button>';
    });
    reactionsHtml += '</div>';

    // Featured image (post.imageUrl) sits at the very top of the left
    // column. Attached image previews stack below it; doc tiles below those.
    var hasFeatured = post.imageUrl && post.imageUrl.length > 0;
    var featuredHtml = hasFeatured
      ? '<a class="hb-post-attach-image hb-post-attach-featured" href="' + hbEsc(post.imageUrl) + '" target="_blank" rel="noopener"><img src="' + hbEsc(post.imageUrl) + '" alt="Post photo" loading="lazy"></a>'
      : '';
    var leftColHtml = featuredHtml + attachImagesHtml + attachDocsHtml;
    var hasLeftCol = leftColHtml.length > 0;

    // Title moved out of the right column to the card head (top-left).
    // Right column now leads with the category tag, then body / extras.
    var rightColHtml =
      tagsHtml +
      '<div class="hb-post-body' + (isLong ? ' truncated' : '') + '">' + hbEsc(bodyText) + '</div>' +
      (isLong ? '<button class="hb-read-more" onclick="hbExpandPost(this)">Read more</button>' : '') +
      debriefHtml +
      sourceHtml +
      linkPreviewHtml;

    var wrappedBody = hasLeftCol
      ? '<div class="hb-post-content-wrap">' +
          '<div class="hb-post-left-col">' + leftColHtml + '</div>' +
          '<div class="hb-post-content-text">' + rightColHtml + '</div>' +
        '</div>'
      : rightColHtml;

    // Edit + Delete actions — shown to the post's author OR the admin.
    // firestore.rules enforces the same (author/admin) server-side, so this
    // is a UI convenience, not the security boundary.
    var canManagePost = hbUser && (
      hbUser.email === 'info@livabletelluride.org' ||
      post.authorUid === hbUser.uid || post.authorId === hbUser.uid
    );
    var ownerActionsHtml = canManagePost
      ? '<div class="hb-post-actions">' +
          '<button class="hb-post-action-btn" onclick="hbEditPost(\'' + post.id + '\')" title="Edit post">✎</button>' +
          '<button class="hb-post-action-btn hb-admin-delete-btn" onclick="hbDeletePost(\'' + post.id + '\')" title="Delete post">🗑</button>' +
        '</div>'
      : '';

    // Last-resort name fallback at render time: if a legacy post stored
    // 'Anonymous' AND the current viewer is the author, show the viewer's
    // resolved name instead of the stale 'Anonymous' string. Other viewers
    // still see whatever was stored.
    var displayAuthor = post.authorName && post.authorName !== 'Anonymous'
      ? post.authorName
      : (hbUser && (post.authorUid === hbUser.uid || post.authorId === hbUser.uid)
          ? hbResolveName(hbUser)
          : (post.authorName || 'Anonymous'));

    // Head now stacks: title on top, author + time below. Avatar still on
    // the far left; badge (post type) + admin delete button on the far right.
    card.innerHTML =
      '<div class="hb-post-head">' +
        hbAvatarHtml(displayAuthor, post.authorPhoto, post.authorIcon, 'hb-post-avatar') +
        '<div class="hb-post-headline">' +
          '<div class="hb-post-title">' + hbEsc(post.title || '') + '</div>' +
          '<div class="hb-post-byline">' +
            '<span class="hb-post-author">' + hbEsc(displayAuthor) + '</span>' +
            '<span class="hb-post-sep">·</span>' +
            '<span class="hb-post-meta">' + timeStr + '</span>' +
            (post.editedAt ? '<span class="hb-post-sep">·</span><span class="hb-post-meta">edited</span>' : '') +
          '</div>' +
        '</div>' +
        badgeHtml +
        ownerActionsHtml +
      '</div>' +
      wrappedBody +
      nextStepHtml +
      reactionsHtml +
      '<div class="hb-post-foot">' +
        '<button class="hb-reply-here" onclick="hbReplyHere(\'' + post.id + '\')">↩ Reply Here</button>' +
        '<button class="hb-reply-toggle" onclick="hbToggleReplies(\'' + post.id + '\')">💬 <span>' + (post.replyCount || 0) + '</span> replies</button>' +
      '</div>' +
      '<div class="hb-replies" id="hb-replies-' + post.id + '" style="display:none;"></div>';
    if (post.linkUrl) {
      var _ph=card.querySelector('.hb-post-link-preview');
      if(_ph) hbFetchOgPreview(post.linkUrl,function(data){hbRenderLinkPreview(data,post.linkUrl,_ph);});
    }
    return card;
  }
  window.hbExpandPost = function(btn) {
    var bodyEl = btn.previousElementSibling;
    bodyEl.classList.remove('truncated');
    // Find the full text from cached posts
    var card = btn.closest('.hb-post');
    var pid = card.dataset.postId;
    var post = hbPosts.find(function(p) { return p.id === pid; });
    if (post) bodyEl.textContent = post.body;
    btn.remove();
  };
  // ═══════════════════════════════
  // REACTIONS
  // ═══════════════════════════════
  window.hbReact = function(postId, reactionType) {
    if (!hbUser) { hbShowAuth('login'); return; }
    if (!hbFirebaseReady) return;
    var ref = db.collection('posts').doc(postId);
    var lsKey = 'hb_react_' + postId;
    var prev = null;
    try { prev = localStorage.getItem(lsKey) || null; } catch (e) {}
    var toggleOff = (prev === reactionType);

    db.runTransaction(function(tx) {
      return tx.get(ref).then(function(doc) {
        var data = doc.data() || {};
        var reactions = data.reactions || { useful: 0, helpful_source: 0, good_question: 0, learned: 0 };
        if (toggleOff) {
          // Clicking your current reaction removes it.
          reactions[reactionType] = Math.max(0, (reactions[reactionType] || 0) - 1);
        } else {
          // Switch from a previous reaction (if any) to the new one.
          if (prev && reactions[prev]) reactions[prev] = Math.max(0, (reactions[prev] || 0) - 1);
          reactions[reactionType] = (reactions[reactionType] || 0) + 1;
        }
        // Write ONLY `reactions` — the per-post update rule lets any signed-in
        // user change reactions/replyCount/lastReplyAt, so this succeeds for
        // everyone (not just the author). The user's own choice is remembered
        // client-side below so the highlight + toggle work.
        tx.update(ref, { reactions: reactions });
      });
    }).then(function() {
      try {
        if (toggleOff) localStorage.removeItem(lsKey);
        else localStorage.setItem(lsKey, reactionType);
      } catch (e) {}
      hbLoadPosts();
    }).catch(function(err) {
      console.error('Reaction error:', err);
    });
  };
  // ═══════════════════════════════
  // VOTING (KEPT FOR BACKWARD COMPATIBILITY)
  // ═══════════════════════════════
  window.hbVote = function(postId, dir) {
    if (!hbUser) { hbShowAuth('login'); return; }
    if (!hbFirebaseReady) return;
    var ref = db.collection('posts').doc(postId);
    var uid = hbUser.uid;
    db.runTransaction(function(tx) {
      return tx.get(ref).then(function(doc) {
        var data = doc.data();
        var upvoters = data.upvoters || [];
        var downvoters = data.downvoters || [];
        if (dir === 'up') {
          if (upvoters.indexOf(uid) !== -1) {
            // Already upvoted — remove
            upvoters = upvoters.filter(function(u) { return u !== uid; });
          } else {
            upvoters.push(uid);
            downvoters = downvoters.filter(function(u) { return u !== uid; });
          }
        } else {
          if (downvoters.indexOf(uid) !== -1) {
            downvoters = downvoters.filter(function(u) { return u !== uid; });
          } else {
            downvoters.push(uid);
            upvoters = upvoters.filter(function(u) { return u !== uid; });
          }
        }
        tx.update(ref, {
          upvoters: upvoters,
          downvoters: downvoters,
          upvotes: upvoters.length,
          downvotes: downvoters.length
        });
      });
    }).then(function() {
      hbLoadPosts();
    }).catch(function(err) {
      console.error('Vote error:', err);
    });
  };
  // ═══════════════════════════════
  // ADMIN DELETE
  // ═══════════════════════════════
  window.hbDeletePost = function(postId) {
    if (!hbUser) return;
    if (!confirm('Are you sure you want to delete this post? This cannot be undone.')) return;
    // First read the post to collect its Storage file URLs (featured photo +
    // attachments), so we can delete those objects too and not leave orphans
    // in the bucket. Then delete the doc, its replies, and the files.
    db.collection('posts').doc(postId).get().then(function(snap) {
      var data = snap.exists ? (snap.data() || {}) : {};
      // Author OR admin only (mirrors firestore.rules; server enforces too).
      var isAdmin = hbUser.email === 'info@livabletelluride.org';
      var isAuthor = data.authorUid === hbUser.uid || data.authorId === hbUser.uid;
      if (!isAdmin && !isAuthor) { alert('You can only delete your own posts.'); throw new Error('__abort__'); }
      var fileUrls = [];
      if (data.imageUrl) fileUrls.push(data.imageUrl);
      if (Array.isArray(data.attachments)) {
        data.attachments.forEach(function(a) { if (a && a.url) fileUrls.push(a.url); });
      }
      return db.collection('posts').doc(postId).delete().then(function() { return fileUrls; });
    }).then(function(fileUrls) {
      // Delete reply docs (legacy top-level collection keyed by postId).
      db.collection('replies').where('postId', '==', postId).get().then(function(snapshot) {
        var batch = db.batch();
        snapshot.forEach(function(doc) { batch.delete(doc.ref); });
        return batch.commit();
      }).catch(function() {});
      // Delete the post's Storage files — best effort; a failure here must
      // not block or error the post deletion (the doc is already gone).
      if (storage && fileUrls.length) {
        fileUrls.forEach(function(url) {
          try {
            storage.refFromURL(url).delete().catch(function(e) {
              console.warn('Storage cleanup: could not delete ' + url + ' — ' + ((e && e.code) || e));
            });
          } catch (e) {
            console.warn('Storage cleanup: unrecognized URL, skipped: ' + url);
          }
        });
      }
      hbLoadPosts();
    }).catch(function(err) {
      if (err && err.message === '__abort__') return;  // permission gate, already messaged
      alert('Error deleting post: ' + err.message);
    });
  };
  // Backward-compat alias: older cached markup may still reference hbAdminDelete.
  window.hbAdminDelete = window.hbDeletePost;

  // Author/admin in-place editor — edits title + body of a post. Loads the
  // current values fresh from Firestore (the card shows a truncated body),
  // shows an inline form, and on save writes {title, body, editedAt} then
  // reloads the feed. firestore.rules' Case-A update allows author/admin to
  // change these fields; other users are limited to counter writes.
  window.hbEditPost = function(postId) {
    if (!hbUser) return;
    var card = document.querySelector('.hb-post[data-post-id="' + (window.CSS && CSS.escape ? CSS.escape(postId) : postId) + '"]');
    if (!card || card.querySelector('.hb-edit-form')) return;  // already editing
    db.collection('posts').doc(postId).get().then(function(snap) {
      if (!snap.exists) { alert('This post no longer exists.'); return; }
      var d = snap.data() || {};
      var isAdmin = hbUser.email === 'info@livabletelluride.org';
      var isAuthor = d.authorUid === hbUser.uid || d.authorId === hbUser.uid;
      if (!isAdmin && !isAuthor) { alert('You can only edit your own posts.'); return; }

      var form = document.createElement('div');
      form.className = 'hb-edit-form';
      form.innerHTML =
        '<label class="hb-edit-label">Title</label>' +
        '<input type="text" class="hb-edit-title" maxlength="200">' +
        '<label class="hb-edit-label">Post</label>' +
        '<textarea class="hb-edit-body" maxlength="10000" rows="6"></textarea>' +
        '<div class="hb-edit-actions">' +
          '<button type="button" class="hb-edit-save">Save changes</button>' +
          '<button type="button" class="hb-edit-cancel">Cancel</button>' +
          '<span class="hb-edit-msg"></span>' +
        '</div>';
      form.querySelector('.hb-edit-title').value = d.title || '';
      form.querySelector('.hb-edit-body').value = d.body || '';

      // Hide the read-only title/body while editing, insert the form below head.
      card.classList.add('editing');
      var head = card.querySelector('.hb-post-head');
      if (head) head.insertAdjacentElement('afterend', form); else card.insertBefore(form, card.firstChild);
      form.querySelector('.hb-edit-body').focus();
      form.scrollIntoView({ block: 'center', behavior: 'smooth' });

      form.querySelector('.hb-edit-cancel').addEventListener('click', function() {
        card.classList.remove('editing');
        form.remove();
      });
      form.querySelector('.hb-edit-save').addEventListener('click', function() {
        var t = form.querySelector('.hb-edit-title').value.trim();
        var b = form.querySelector('.hb-edit-body').value.trim();
        var msg = form.querySelector('.hb-edit-msg');
        if (!t) { msg.textContent = 'A title is required.'; return; }
        if (t.length > 200) { msg.textContent = 'Title must be 200 characters or fewer.'; return; }
        if (b.length > 10000) { msg.textContent = 'Post is too long (10,000 character max).'; return; }
        var saveBtn = this;
        saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
        db.collection('posts').doc(postId).update({
          title: t,
          body: b,
          editedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(function() {
          hbLoadPosts();   // re-render with updated content + "edited" marker
        }).catch(function(err) {
          saveBtn.disabled = false; saveBtn.textContent = 'Save changes';
          msg.textContent = 'Error saving: ' + err.message;
        });
      });
    }).catch(function(err) {
      alert('Could not load this post for editing: ' + err.message);
    });
  };
  // ═══════════════════════════════
  // REPLIES
  // ═══════════════════════════════
  window.hbToggleReplies = function(postId) {
    var container = document.getElementById('hb-replies-' + postId);
    if (!container) return;
    if (container.style.display === 'none') {
      container.style.display = '';
      hbLoadReplies(postId, container);
    } else {
      container.style.display = 'none';
    }
  };
  // "Reply Here" CTA — always OPENS the replies area (never toggles it shut),
  // then focuses the reply box. Replies load async, so poll briefly for the
  // textarea before focusing/scrolling to it.
  window.hbReplyHere = function(postId) {
    var container = document.getElementById('hb-replies-' + postId);
    if (!container) return;
    if (container.style.display === 'none') {
      container.style.display = '';
      hbLoadReplies(postId, container);
    }
    var tries = 0;
    var t = setInterval(function() {
      var ta = document.getElementById('hb-reply-text-' + postId);
      if (ta) {
        clearInterval(t);
        ta.scrollIntoView({ block: 'center', behavior: 'smooth' });
        ta.focus();
      } else if (++tries > 40) {
        clearInterval(t);
      }
    }, 50);
  };
  function hbLoadReplies(postId, container) {
    if (!hbFirebaseReady) {
      container.innerHTML = '<div style="font-size:0.82rem;color:#aaa;padding:8px;">Replies will appear here once Firebase is configured.</div>';
      hbAddReplyCompose(postId, container);
      return;
    }
    container.innerHTML = '<div class="hb-loading"><div class="hb-spinner"></div></div>';
    db.collection('posts').doc(postId).collection('replies').orderBy('createdAt', 'asc').limit(50).get()
      .then(function(snap) {
        container.innerHTML = '';
        snap.forEach(function(doc) {
          var r = doc.data();
          var initial = (r.authorName || '?').charAt(0).toUpperCase();
          var time = r.createdAt ? hbTimeAgo(r.createdAt.toDate ? r.createdAt.toDate() : new Date(r.createdAt)) : 'just now';
          var div = document.createElement('div');
          div.className = 'hb-reply';
          var _rLinkHtml=r.linkUrl?'<div class="hb-reply-link-preview" data-link-url="'+hbEsc(r.linkUrl)+'"></div>':'';
          var _rImgHtml=r.imageUrl?'<a class="hb-reply-image" href="'+hbEsc(r.imageUrl)+'" target="_blank" rel="noopener"><img src="'+hbEsc(r.imageUrl)+'" alt="Reply photo" loading="lazy"></a>':'';
          var _rDocsHtml=(r.attachments&&r.attachments.length)?'<div class="hb-reply-attachments">'+r.attachments.map(function(a){var ic=(a.type||'').indexOf('image/')===0?'🖼️':'📄';return '<a class="hb-post-attach" href="'+hbEsc(a.url)+'" target="_blank" rel="noopener">'+ic+' '+hbEsc(a.name||'attachment')+'</a>';}).join('')+'</div>':'';
          div.innerHTML=
            '<div class="hb-reply-head">'+
              hbAvatarHtml(r.authorName, r.authorPhoto, r.authorIcon, 'hb-reply-avatar')+
              '<span class="hb-reply-author">'+hbEsc(r.authorName||'Anonymous')+'</span>'+
              '<span class="hb-reply-time">'+time+'</span>'+
            '</div>'+
            '<div class="hb-reply-body">'+hbEsc(r.body||'')+'</div>'+
            _rImgHtml+_rDocsHtml+_rLinkHtml;
          container.appendChild(div);
          if(r.linkUrl){
            (function(url,el){
              hbFetchOgPreview(url,function(data){hbRenderLinkPreview(data,url,el);});
            })(r.linkUrl,div.querySelector('.hb-reply-link-preview'));
          }
        });
        hbAddReplyCompose(postId, container);
      })
      .catch(function(err) {
        container.innerHTML = '<div style="color:#c0392b;font-size:0.82rem;padding:8px;">Could not load replies.</div>';
        console.error('Load replies error:', err);
      });
  }
  // Per-reply pending uploads, keyed by postId (multiple reply composers can be
  // open at once, so this can't be a single global like the main composer's).
  var hbReplyPending = {};
  function hbReplyState(postId) {
    if (!hbReplyPending[postId]) hbReplyPending[postId] = { photo: null, attachments: [] };
    return hbReplyPending[postId];
  }
  function hbAddReplyCompose(postId, container) {
    hbReplyPending[postId] = { photo: null, attachments: [] };
    var div = document.createElement('div');
    div.className = 'hb-reply-compose-wrap';
    div.innerHTML =
      '<div class="hb-reply-compose">' +
        '<textarea placeholder="Write a reply..." id="hb-reply-text-' + postId + '"></textarea>' +
        '<div class="hb-reply-actions">' +
          '<button type="button" class="hb-reply-attach" onclick="hbReplyTriggerPhoto(\'' + postId + '\')" title="Add a photo (JPG, PNG, GIF, WebP · max 5 MB)">📷 Add Photo</button>' +
          '<button type="button" class="hb-reply-attach" onclick="hbReplyTriggerDoc(\'' + postId + '\')" title="Attach a document (PDF, Word, image · max ' + HB_DOC_MAX_MB + ' MB)">📄 Attach Document</button>' +
          '<button type="button" class="hb-reply-attach" id="hb-reply-link-btn-' + postId + '" onclick="hbToggleReplyUrl(\'' + postId + '\')" title="Add a link">🔗 Add Link</button>' +
          '<button type="button" class="hb-reply-send" id="hb-reply-send-' + postId + '" onclick="hbPostReply(\'' + postId + '\')">Reply</button>' +
        '</div>' +
      '</div>' +
      '<input type="file" id="hb-reply-photo-input-' + postId + '" accept="image/png,image/jpeg,image/gif,image/webp" style="display:none;" onchange="hbReplyHandlePhoto(\'' + postId + '\', this)">' +
      '<input type="file" id="hb-reply-doc-input-' + postId + '" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.webp" multiple style="display:none;" onchange="hbReplyHandleDoc(\'' + postId + '\', this)">' +
      '<div class="hb-reply-attach-preview" id="hb-reply-attach-preview-' + postId + '"></div>' +
      '<div class="hb-reply-url-row" id="hb-reply-url-row-' + postId + '" style="display:none;">' +
        '<input type="url" class="hb-reply-url-input" id="hb-reply-url-' + postId + '"' +
        ' placeholder="https://… — the page image will appear with your reply">' +
        '<div class="hb-link-warning">⚠️ Social media links won’t show any image from the post, but you can add the link if you like.</div>' +
      '</div>';
    container.appendChild(div);
  }
  // ── Reply attachments (photo + document), mirroring the main composer ──
  window.hbReplyTriggerPhoto = function(postId) { var i = document.getElementById('hb-reply-photo-input-' + postId); if (i) i.click(); };
  window.hbReplyHandlePhoto = function(postId, input) {
    var file = input.files && input.files[0]; if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please select an image file (PNG, JPG, GIF, or WebP).'); input.value = ''; return; }
    if (file.size > 5 * 1024 * 1024) { alert('Image is too large (max 5 MB). Please choose a smaller photo.'); input.value = ''; return; }
    hbReplyState(postId).photo = file; input.value = ''; hbRenderReplyAttach(postId);
  };
  window.hbReplyRemovePhoto = function(postId) { hbReplyState(postId).photo = null; hbRenderReplyAttach(postId); };
  window.hbReplyTriggerDoc = function(postId) { var i = document.getElementById('hb-reply-doc-input-' + postId); if (i) i.click(); };
  window.hbReplyHandleDoc = function(postId, input) {
    var st = hbReplyState(postId);
    Array.from(input.files).forEach(function(file) {
      if (!hbIsAllowedUpload(file)) { alert('"' + file.name + '" can\'t be attached. Allowed: images (JPG/PNG/GIF/WebP), PDF, Word, and text documents.'); return; }
      if (file.size > HB_DOC_MAX_MB * 1024 * 1024) { alert('File "' + file.name + '" is too large (max ' + HB_DOC_MAX_MB + ' MB).'); return; }
      st.attachments.push(file);
    });
    input.value = ''; hbRenderReplyAttach(postId);
  };
  window.hbReplyRemoveAttach = function(postId, idx) { hbReplyState(postId).attachments.splice(idx, 1); hbRenderReplyAttach(postId); };
  function hbRenderReplyAttach(postId) {
    var c = document.getElementById('hb-reply-attach-preview-' + postId); if (!c) return;
    var st = hbReplyState(postId); var html = '';
    if (st.photo) html += '<div class="hb-attach-item">🖼️ ' + hbEsc(st.photo.name) + ' <span class="hb-remove-attach" onclick="hbReplyRemovePhoto(\'' + postId + '\')">✕</span></div>';
    st.attachments.forEach(function(f, i) {
      var icon = (f.type || '').startsWith('image/') ? '🖼️' : '📄';
      html += '<div class="hb-attach-item">' + icon + ' ' + hbEsc(f.name) + ' <span class="hb-remove-attach" onclick="hbReplyRemoveAttach(\'' + postId + '\',' + i + ')">✕</span></div>';
    });
    c.innerHTML = html;
  }
  window.hbToggleReplyUrl = function(postId) {
    var row=document.getElementById('hb-reply-url-row-'+postId);
    var btn=document.getElementById('hb-reply-link-btn-'+postId);
    if(!row)return;
    var open=row.style.display==='none';
    row.style.display=open?'':'none';
    if(btn)btn.style.background=open?'#d0e8d0':'';
    if(open){var inp=document.getElementById('hb-reply-url-'+postId);if(inp)inp.focus();}
  };
  window.hbPostReply = function(postId) {
    if (!hbUser) { hbShowAuth('login'); return; }
    if (!hbFirebaseReady) return;
    var textarea=document.getElementById('hb-reply-text-'+postId);
    var _rli=document.getElementById('hb-reply-url-'+postId);
    var replyLinkUrl=_rli?_rli.value.trim():'';
    var body=textarea.value.trim();
    if(!body)return;

    // Tone check — if flagged, prompt with a real modal (custom buttons,
    // not native confirm() which can't be re-labeled). Resolves to:
    //   'accept'    → use the suggested rephrase
    //   'original'  → post the user's exact text
    //   'cancel'    → abort, return to the textarea
    var tone = hbAnalyzeTone(body);
    var bodyPromise;
    if (tone && tone.flagged) {
      var suggestion = TONE_SUGGESTIONS[tone.category] || TONE_SUGGESTIONS['general'];
      bodyPromise = hbShowReplyToneModal(suggestion).then(function(choice) {
        if (choice === 'cancel') return null;       // user dismissed
        if (choice === 'accept') {
          textarea.value = suggestion;
          return suggestion;
        }
        return body;                                 // 'original'
      });
    } else {
      bodyPromise = Promise.resolve(body);
    }

    bodyPromise.then(function(finalBody) {
      if (!finalBody) return;
      var btn = document.getElementById('hb-reply-send-' + postId);
      if (btn) { btn.disabled = true; btn.textContent = '...'; }
      // Upload the reply's photo + document attachments first (same Storage
      // path + pattern as the main composer), then create the reply doc.
      var st = hbReplyState(postId);
      var photoPromise = st.photo
        ? storage.ref('hub-bub/' + hbUser.uid + '/reply_photo_' + Date.now() + '_' + st.photo.name)
            .put(st.photo).then(function(snap) { return snap.ref.getDownloadURL(); })
        : Promise.resolve(null);
      var uploadPromises = st.attachments.map(function(file) {
        return storage.ref('hub-bub/' + hbUser.uid + '/reply_' + Date.now() + '_' + file.name)
          .put(file).then(function(snap) {
            return snap.ref.getDownloadURL().then(function(url) { return { name: file.name, url: url, type: file.type }; });
          });
      });
      Promise.all([photoPromise, Promise.all(uploadPromises)]).then(function(results) {
        return db.collection('posts').doc(postId).collection('replies').add({
          // See note in createPost — rules require authorUid; authorId kept for
          // any reader that still looks for it.
          authorUid: hbUser.uid,
          authorId: hbUser.uid,
          authorName: hbResolveName(hbUser),
          authorPhoto: hbUserAvatar.photo || null,
          authorIcon: hbUserAvatar.icon || null,
          body: finalBody,
          linkUrl: replyLinkUrl || null,
          imageUrl: results[0] || null,
          attachments: results[1] || [],
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }).then(function() {
        // Increment reply count on parent post. Allowed by firestore.rules
        // Case B (counter allow-list) for any verified user.
        return db.collection('posts').doc(postId).update({
          replyCount: firebase.firestore.FieldValue.increment(1)
        });
      }).then(function() {
        textarea.value='';
        if(_rli)_rli.value='';
        var _rrr=document.getElementById('hb-reply-url-row-'+postId),_rlb=document.getElementById('hb-reply-link-btn-'+postId);
        if(_rrr)_rrr.style.display='none'; if(_rlb)_rlb.style.background='';
        hbReplyPending[postId] = { photo: null, attachments: [] };
        if(btn){ btn.disabled=false; btn.textContent='Reply'; }
        hbLoadReplies(postId,document.getElementById('hb-replies-'+postId));
        // Update local cache
        var post = hbPosts.find(function(p) { return p.id === postId; });
        if (post) post.replyCount = (post.replyCount || 0) + 1;
        // Refresh the counter span in the rendered card. Without this, the
        // toggle button keeps showing the stale count until a full page reload.
        var card = document.querySelector('.hb-post[data-post-id="' + postId + '"]');
        var counterSpan = card && card.querySelector('.hb-reply-toggle span');
        if (counterSpan) {
          counterSpan.textContent = post
            ? post.replyCount
            : ((parseInt(counterSpan.textContent, 10) || 0) + 1);
        }
        hbRenderTrending();
      }).catch(function(err) {
        console.error('Reply error:', err);
        // Surface real reason so the user knows what to fix (e.g.
        // permission-denied when their account isn't verified).
        var msg = 'Could not post your reply.';
        if (err && err.code) msg += ' (' + err.code + ')';
        if (err && err.message) msg += '\n\n' + err.message;
        alert(msg);
        if (btn) { btn.disabled = false; btn.textContent = 'Reply'; }
      });
    });
  };

  /* Tone-nudge modal for replies. Promise-based so the caller can
     act on the user's choice without callback gymnastics. Buttons:
       [Post Original]    → resolve('original')
       [Accept Revision]  → resolve('accept')
       [Backdrop click / Escape] → resolve('cancel')  */
  function hbShowReplyToneModal(suggestion) {
    return new Promise(function(resolve) {
      var modal = document.getElementById('hbReplyToneModal');
      if (!modal) {
        // Defensive: modal HTML missing from page → fall back to native
        // confirm so we never silently swallow the suggestion.
        var ok = confirm('This reply may come across as a personal attack.\n\nSuggested alternative:\n"' + suggestion + '"\n\nClick OK to Accept Revision, Cancel to Post Original.');
        resolve(ok ? 'accept' : 'original');
        return;
      }
      document.getElementById('hbReplyToneSuggested').textContent = suggestion;
      modal.style.display = 'flex';

      function settle(choice) {
        modal.style.display = 'none';
        acceptBtn.onclick = null;
        origBtn.onclick = null;
        modal.removeEventListener('click', backdrop);
        document.removeEventListener('keydown', escHandler);
        resolve(choice);
      }
      function backdrop(e) { if (e.target === modal) settle('cancel'); }
      function escHandler(e) { if (e.key === 'Escape') settle('cancel'); }

      var acceptBtn = document.getElementById('hbReplyToneAccept');
      var origBtn   = document.getElementById('hbReplyToneOriginal');
      acceptBtn.onclick = function() { settle('accept'); };
      origBtn.onclick   = function() { settle('original'); };
      modal.addEventListener('click', backdrop);
      document.addEventListener('keydown', escHandler);
    });
  }
  window.hbShowReplyToneModal = hbShowReplyToneModal;
  // ═══════════════════════════════
  // SORT
  // ═══════════════════════════════
  window.hbSortPosts = function(sortBy) {
    hbCurrentSort = sortBy;
    document.querySelectorAll('.hb-sort-opt').forEach(function(o) {
      o.classList.toggle('active', o.dataset.hbSort === sortBy);
    });
    hbRenderPosts();
  };
  // ═══════════════════════════════
  // AUTO-TAG SUGGESTION
  // Auto-selects the most likely tag(s) based on what the user types.
  // Runs on every keystroke; only suggests if no tag is manually selected.
  // ═══════════════════════════════
  var HB_TAG_KEYWORDS = {
    'government': ['town council','board of trustees','bocc','commissioner','ordinance','resolution','vote','motion','governance','charter','mayor','manager','hearing','agenda','minutes','election','cora','public records','open meeting','sunshine','transparency','attorney','ethics','conflict','hb24','house bill','colorado law'],
    'events': ['festival','concert','market','parade','celebration','exhibit','show','performance','event','mountainfilm','bluegrass','gallery','film','race','tournament','wilkinson','library event','arts','culture'],
    'housing': ['housing','rent','deed','affordable','waitlist','evict','landlord','tenant','smrha','telluride housing','workforce','unit','element 52','camel',' lot ','vacancy','apartment','condo','workforce housing'],
    'land-use': ['land use','zoning','pud','development','parcel','variance','height','setback','easement','subdivision','annexation','carhenge','diamond','society turn','sunnyside','chair 7','voodoo','lot l','lot r','planning commission','harc'],
    'transit': ['transit','bus','parking','traffic','road','highway 145','route','shuttle','rideshare','car-free','parking structure','infrastructure','water','sewer','utilities','broadband','stormwater','sidewalk'],
    'gondola': ['gondola','3a','cable','tramway','aerial','transit corridor','mountain village connector','mvt','gondola station'],
    'budgets': ['budget','finance','tax','revenue','bond','debt','million','taxpayer','appropriation','fund','fee','cost','spending','fiscal','audit','levy','mil'],
    'environment': ['environment','climate','wildlife','habitat','wetland','valley floor','open space','bear creek','eagle','dark sky','carbon','air quality','watershed','riparian','species','wildfire','fire','evacuation','smoke','defensible'],
    'schools': ['school','education','student','teacher','hospital','health','medical','clinic','mental health','library','kids','family','youth','r-1','telluride school','norwood school'],
    'good-news': ['great news','exciting','celebrate','congratulate','milestone','achievement','award','grant','success','improvement','open','launch','completed','new park','ribbon','donation','thank'],
    'other': []
  };

  function hbSuggestTags() {
    // Only run if user hasn't manually selected a tag yet
    var alreadySelected = document.querySelectorAll('.hb-compose-tag.selected');
    if (alreadySelected.length > 0) return;

    var title = (document.getElementById('hbComposeTitle').value || '').toLowerCase();
    var body  = (document.getElementById('hbComposeBody').value  || '').toLowerCase();
    var combined = title + ' ' + body;

    // Score each tag
    var scores = {};
    Object.keys(HB_TAG_KEYWORDS).forEach(function(tag) {
      if (tag === 'other') return;
      var kws = HB_TAG_KEYWORDS[tag];
      var score = 0;
      kws.forEach(function(kw) {
        if (combined.includes(kw)) score += (title.includes(kw) ? 3 : 1);
      });
      if (score > 0) scores[tag] = score;
    });

    // Pick top tag
    var best = Object.keys(scores).sort(function(a, b) { return scores[b] - scores[a]; })[0];
    if (!best) return;

    // Auto-select it and show a subtle hint
    var tagBtn = document.querySelector('.hb-compose-tag[data-hb-tag="' + best + '"]');
    if (tagBtn) {
      tagBtn.classList.add('selected', 'auto-suggested');
      tagBtn.title = 'Auto-suggested based on your text — click another tag to change';
      hbUpdatePostBtn();
      // Show hint label
      var hint = document.getElementById('hbTagSuggestHint');
      if (!hint) {
        hint = document.createElement('div');
        hint.id = 'hbTagSuggestHint';
        hint.style.cssText = 'font-size:0.72rem;color:#888;margin-top:3px;';
        var tagsContainer = document.getElementById('hbComposeTags');
        if (tagsContainer && tagsContainer.parentNode) {
          tagsContainer.parentNode.insertBefore(hint, tagsContainer.nextSibling);
        }
      }
      var info = HB_TOPICS[best] || { label: best };
      hint.textContent = '↑ Auto-tagged as "' + info.label + '" — click a different tag to override';
    }
  }

  // Wire auto-tag to title and body inputs (debounced 600ms)
  var _hbTagDebounce;
  function hbQueueSuggest() {
    // Clear the auto-suggestion if user clicks a tag manually
    clearTimeout(_hbTagDebounce);
    _hbTagDebounce = setTimeout(hbSuggestTags, 600);
  }
  var _titleEl = document.getElementById('hbComposeTitle');
  var _bodyEl  = document.getElementById('hbComposeBody');
  if (_titleEl) _titleEl.addEventListener('input', hbQueueSuggest);
  if (_bodyEl)  _bodyEl.addEventListener('input', hbQueueSuggest);

  // When user manually clicks a tag, clear the auto-suggestion state
  document.querySelectorAll('.hb-compose-tag').forEach(function(tag) {
    tag.addEventListener('click', function() {
      // Remove auto-suggested class from all, clear hint
      document.querySelectorAll('.hb-compose-tag.auto-suggested').forEach(function(t) {
        t.classList.remove('auto-suggested');
        t.title = '';
      });
      var hint = document.getElementById('hbTagSuggestHint');
      if (hint) hint.textContent = '';
    });
  });

  // ═══════════════════════════════
  // DYNAMIC TOPIC FILTER CHIPS
  // Recomputes the visible filter chips to show the top 10 tags
  // used in posts from the last 7 days (most active → least active).
  // Falls back to showing all topics if there's no data yet.
  // ═══════════════════════════════
  function hbRefreshFilterChips() {
    var bar = document.getElementById('hbTopicBar');
    if (!bar) return;

    var now = new Date();
    var weekAgo = new Date(now.getTime() - 7 * 86400000);

    // Count tag usage in the last 7 days
    var tagCounts = {};
    hbPosts.forEach(function(p) {
      var d = p.createdAt ? (p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt)) : null;
      if (!d || d < weekAgo) return;
      (p.tags || []).forEach(function(t) {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    });

    var topTags = Object.keys(tagCounts)
      .sort(function(a, b) { return tagCounts[b] - tagCounts[a]; })
      .slice(0, 10);

    // If there's no data for the week, show all known topics
    if (topTags.length === 0) {
      topTags = Object.keys(HB_TOPICS).filter(function(t) { return t !== 'other'; });
    }

    // Re-render the chip bar (always keep "All" first)
    bar.innerHTML = '';
    var allChip = document.createElement('button');
    allChip.className = 'hb-topic-chip' + (hbCurrentTopic === 'all' ? ' active' : '');
    allChip.dataset.hbTopic = 'all';
    allChip.textContent = 'All';
    bar.appendChild(allChip);

    topTags.forEach(function(tag) {
      var info = HB_TOPICS[tag] || { icon: '💡', label: tag };
      var chip = document.createElement('button');
      chip.className = 'hb-topic-chip' + (hbCurrentTopic === tag ? ' active' : '');
      chip.dataset.hbTopic = tag;
      // Show post count badge if >0
      var count = tagCounts[tag] ? ' (' + tagCounts[tag] + ')' : '';
      chip.textContent = info.icon + ' ' + info.label + count;
      chip.title = tagCounts[tag] ? tagCounts[tag] + ' post' + (tagCounts[tag] !== 1 ? 's' : '') + ' this week' : '';
      bar.appendChild(chip);
    });

    // Re-bind click listeners using event delegation on the bar
    bar.onclick = function(e) {
      var chip = e.target.closest('.hb-topic-chip');
      if (!chip) return;
      bar.querySelectorAll('.hb-topic-chip').forEach(function(c) { c.classList.remove('active'); });
      chip.classList.add('active');
      hbCurrentTopic = chip.dataset.hbTopic;
      hbRenderPosts();
    };
  }

  // ═══════════════════════════════
  // TRENDING SIDEBAR
  // ═══════════════════════════════
  function hbRenderTrending() {
    var container = document.getElementById('hbTrending');
    if (!container) return;
    // Aggregate by tag
    var tagCounts = {};
    hbPosts.forEach(function(p) {
      (p.tags || []).forEach(function(t) {
        if (!tagCounts[t]) tagCounts[t] = { posts: 0, replies: 0, latest: '' };
        tagCounts[t].posts++;
        tagCounts[t].replies += (p.replyCount || 0);
        if (!tagCounts[t].latest || (p.title && p.title.length > 0)) tagCounts[t].latest = p.title;
      });
    });
    var sorted = Object.keys(tagCounts).sort(function(a, b) {
      return (tagCounts[b].posts + tagCounts[b].replies) - (tagCounts[a].posts + tagCounts[a].replies);
    });
    if (sorted.length === 0) {
      container.innerHTML = '<div style="font-size:0.8rem;color:#aaa;padding:8px 0;">No discussions yet.</div>';
      return;
    }
    container.innerHTML = '';
    sorted.slice(0, 8).forEach(function(tag) {
      var info = HB_TOPICS[tag] || { icon: '💡', label: tag };
      var item = document.createElement('div');
      item.className = 'hb-trending-item';
      item.onclick = function() {
        // Filter to this topic
        document.querySelectorAll('.hb-topic-chip').forEach(function(c) { c.classList.remove('active'); });
        var chip = document.querySelector('.hb-topic-chip[data-hb-topic="' + tag + '"]');
        if (chip) chip.classList.add('active');
        hbCurrentTopic = tag;
        hbRenderPosts();
      };
      item.innerHTML =
        '<div class="hb-trending-topic">' + info.icon + ' ' + hbEsc(info.label) + '</div>' +
        '<div class="hb-trending-count">' + tagCounts[tag].posts + ' posts · ' + tagCounts[tag].replies + ' replies</div>';
      container.appendChild(item);
    });
  }
  // ═══════════════════════════════
  // MOST USEFUL THIS WEEK SIDEBAR
  // ═══════════════════════════════
  function hbRenderMostUseful() {
    var container = document.getElementById('hbMostUseful');
    if (!container) return;

    var now = new Date();
    var weekAgo = new Date(now.getTime() - 7 * 86400000);

    // Get posts from this week, sorted by total reactions
    var thisWeek = hbPosts.filter(function(p) {
      var d = p.createdAt ? (p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt)) : null;
      return d && d >= weekAgo;
    }).sort(function(a, b) {
      var aTotalReactions = Object.values(a.reactions || {}).reduce(function(sum, val) { return sum + val; }, 0);
      var bTotalReactions = Object.values(b.reactions || {}).reduce(function(sum, val) { return sum + val; }, 0);
      return bTotalReactions - aTotalReactions;
    });

    if (thisWeek.length === 0) {
      container.innerHTML = '<div style="font-size:0.8rem;color:#aaa;padding:8px 0;">No posts this week yet.</div>';
      return;
    }

    container.innerHTML = '';
    thisWeek.slice(0, 5).forEach(function(post) {
      var totalReactions = Object.values(post.reactions || {}).reduce(function(sum, val) { return sum + val; }, 0);
      var item = document.createElement('div');
      item.className = 'hb-useful-item';
      item.innerHTML =
        '<div class="hb-useful-title">' + hbEsc(post.title) + '</div>' +
        '<div class="hb-useful-count">👍 ' + totalReactions + ' reactions</div>';
      container.appendChild(item);
    });
  }
  // ═══════════════════════════════
  // UNANSWERED QUESTIONS SIDEBAR
  // ═══════════════════════════════
  function hbRenderUnanswered() {
    var container = document.getElementById('hbUnanswered');
    if (!container) return;

    // Get question-type posts with 0 replies, sorted by newest first
    var unanswered = hbPosts.filter(function(p) {
      return p.postType === 'question' && (p.replyCount || 0) === 0;
    }).sort(function(a, b) {
      var aDate = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt)) : new Date(0);
      var bDate = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt)) : new Date(0);
      return bDate - aDate;
    });

    if (unanswered.length === 0) {
      container.innerHTML = '<div style="font-size:0.8rem;color:#aaa;padding:8px 0;">All questions have answers!</div>';
      return;
    }

    container.innerHTML = '';
    unanswered.slice(0, 5).forEach(function(post) {
      var item = document.createElement('div');
      item.className = 'hb-unanswered-item';
      item.innerHTML =
        '<div class="hb-unanswered-title">' + hbEsc(post.title) + '</div>' +
        '<div class="hb-unanswered-author">by ' + hbEsc(post.authorName || 'Anonymous') + '</div>';
      container.appendChild(item);
    });
  }
  // ═══════════════════════════════
  // STATS
  // ═══════════════════════════════
  function hbRenderStats() {
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var weekAgo = new Date(today.getTime() - 7 * 86400000);
    var todayCount = 0, weekCount = 0, users = {};
    hbPosts.forEach(function(p) {
      var d = p.createdAt ? (p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt)) : null;
      if (d && d >= today) todayCount++;
      if (d && d >= weekAgo) weekCount++;
      if (p.authorId) users[p.authorId] = true;
    });
    var el = function(id) { return document.getElementById(id); };
    if (el('hbStatToday')) el('hbStatToday').textContent = todayCount;
    if (el('hbStatWeek')) el('hbStatWeek').textContent = weekCount;
    if (el('hbStatTotal')) el('hbStatTotal').textContent = hbPosts.length;
    if (el('hbStatUsers')) el('hbStatUsers').textContent = Object.keys(users).length;
  }
  // ═══════════════════════════════
  // DEMO POSTS (shown before Firebase is configured)
  // ═══════════════════════════════
  function hbRenderDemoPosts() {
    var now = new Date();
    hbPosts = [
      {
        id: 'demo-1',
        authorName: 'Example User',
        title: 'What happened at the Town Council meeting on the Wildfire Resiliency Code?',
        body: 'I missed Tuesday\'s meeting but heard there was a big debate about the Colorado Wildfire Resiliency Code adoption. Can anyone who was there share what the key concerns were? Specifically interested in how the defensible space requirements will affect older homes on the north side of town.',
        tags: ['public-safety', 'legal-governance'],
        postType: 'question',
        attachments: [],
        createdAt: { toDate: function() { return new Date(now - 3600000); } },
        replyCount: 4,
        upvotes: 12,
        downvotes: 1,
        upvoters: [], downvoters: [],
        reactions: { useful: 8, helpful_source: 0, good_question: 12, learned: 3 },
        reactors: {},
        nextStep: null
      },
      {
        id: 'demo-2',
        authorName: 'Mountain Resident',
        title: 'Gondola 3A alternatives analysis — has anyone read the full report?',
        body: 'The alternatives analysis document is 186 pages and I\'ve been working through it. Some key findings that jumped out: the traffic modeling assumes a 15% mode shift that seems optimistic given current transit ridership data. Also, the visual impact assessment methodology didn\'t include viewshed analysis from the Valley Floor. Would love to discuss with others who\'ve read it.',
        tags: ['gondola', 'environment', 'transit'],
        postType: 'source',
        attachments: [{ name: 'gondola-3a-alternatives-summary.pdf', url: '#', type: 'application/pdf' }],
        createdAt: { toDate: function() { return new Date(now - 7200000); } },
        replyCount: 8,
        upvotes: 23,
        downvotes: 3,
        upvoters: [], downvoters: [],
        reactions: { useful: 15, helpful_source: 23, good_question: 2, learned: 8 },
        reactors: {},
        sourceUrl: '#',
        sourceWhy: 'Official analysis document',
        sourceQuestion: 'What are the main findings?',
        nextStep: null
      },
      {
        id: 'demo-3',
        authorName: 'Housing Advocate',
        title: 'Deed-restricted housing waitlist transparency',
        body: 'Has anyone else noticed that the deed-restricted housing waitlist process is basically a black box? I\'ve been trying to get clarity on how units like Silver Jack 205 and Element 52 SW-102 are allocated. The current system lacks the transparency our community needs. I think we should push for quarterly public reports on waitlist status and allocation criteria.',
        tags: ['housing', 'legal-governance'],
        postType: 'solution',
        attachments: [],
        createdAt: { toDate: function() { return new Date(now - 18000000); } },
        replyCount: 15,
        upvotes: 31,
        downvotes: 2,
        upvoters: [], downvoters: [],
        reactions: { useful: 22, helpful_source: 1, good_question: 5, learned: 4 },
        reactors: {},
        nextStep: 'Request CORA records'
      }
    ];
    hbRenderPosts();
    hbRefreshFilterChips();
    hbRenderTrending();
    hbRenderStats();
    hbRenderMostUseful();
    hbRenderUnanswered();
  }
  // ═══════════════════════════════
  // UTILITIES
  // ═══════════════════════════════
  function hbEsc(s) {
    if (!s) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(s));
    return div.innerHTML;
  }

  // ── Open-Graph link-preview helpers ────────────────────────────────────────
  var HB_OG_CACHE = {};
  var HB_OG_WORKER = SITE_CONFIG.RSS_PROXY_BASE + '/og';

  function hbFetchOgPreview(url, cb) {
    if (!url) return;
    if (HB_OG_CACHE[url] !== undefined) { cb(HB_OG_CACHE[url]); return; }
    fetch(HB_OG_WORKER + '?url=' + encodeURIComponent(url))
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(data) { HB_OG_CACHE[url] = data || null; cb(HB_OG_CACHE[url]); })
      .catch(function() { HB_OG_CACHE[url] = null; });
  }

  function hbRenderLinkPreview(data, url, containerEl) {
    if (!containerEl || containerEl.querySelector('.hb-og-preview')) return;
    var hostname = '';
    try { hostname = new URL(url).hostname; } catch(e) { hostname = url; }
    var card = document.createElement('a');
    card.className = 'hb-og-preview';
    card.href = url; card.target = '_blank'; card.rel = 'noopener';
    // Graceful fallback — the site blocked the preview (e.g. Facebook /
    // Instagram) or set no Open Graph tags. Still show a clean, clickable
    // text-only link card so the reference doesn't silently vanish.
    if (!data || (!data.imageUrl && !data.title)) {
      card.className += ' hb-og-textonly';
      card.innerHTML =
        '<div class="hb-og-text">' +
          '<div class="hb-og-title">' + hbEsc(hostname) + '</div>' +
          '<div class="hb-og-domain">' + hbEsc(url) + '</div>' +
        '</div>';
      containerEl.appendChild(card);
      return;
    }
    var imgHtml = data.imageUrl
      ? '<img class="hb-og-img" src="' + hbEsc(data.imageUrl) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
      : '';
    if (!data.imageUrl) card.className += ' hb-og-textonly';
    card.innerHTML = imgHtml +
      '<div class="hb-og-text">' +
        (data.title ? '<div class="hb-og-title">' + hbEsc(data.title) + '</div>' : '') +
        (data.description ? '<div class="hb-og-desc">' + hbEsc(data.description.substring(0, 160)) + '</div>' : '') +
        '<div class="hb-og-domain">' + hbEsc(url) + '</div>' +
      '</div>';
    containerEl.appendChild(card);
  }


  /* Resolve a display name from a Firebase Auth user object.
     Priority: displayName → email prefix titlecased → 'Anonymous'.
     Why: not every user has set displayName (older accounts, admin
     account predates the signup flow), and showing "Anonymous" by
     default looks like a bug to readers. */
  function hbResolveName(user) {
    if (!user) return 'Anonymous';
    if (user.displayName && user.displayName.trim()) return user.displayName.trim();
    if (user.email) {
      var prefix = user.email.split('@')[0];
      if (prefix) {
        return prefix.split(/[._-]+/).map(function(s) {
          return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
        }).filter(Boolean).join(' ');
      }
    }
    return 'Anonymous';
  }
  function hbTimeAgo(date) {
    var secs = Math.floor((new Date() - date) / 1000);
    if (secs < 60) return 'just now';
    if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
    if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
    if (secs < 604800) return Math.floor(secs / 86400) + 'd ago';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  // ─── Login button — DISABLED here, handled by the inline IIFE in
  //     hub-bub.html (search for "LOGIN submit"). That handler uses
  //     waitForFirebase() and the compat SDK initialized at the top of
  //     this file. Wiring two listeners to the same button (this one
  //     plus the inline one) caused both to fire on each click — the
  //     duplicate didn't directly break login, but it was noise and
  //     made the failure mode harder to diagnose. Keeping the bind
  //     guard `if (false)` so a future grep for hbLoginBtn / hbLoginSubmit
  //     still finds context, without actually attaching the listener.
  var loginBtn = false ? document.getElementById('hbLoginSubmit') : null;
  if (loginBtn) {
    loginBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      loginBtn.textContent = 'Logging in...';
      loginBtn.disabled = true;
      try {
        var email = document.getElementById('hbLoginEmail').value.trim();
        var pass = document.getElementById('hbLoginPassword').value;
        var errEl = document.getElementById('hbLoginError');
        if (!email || !pass) {
          errEl.textContent = 'Please enter email and password.';
          errEl.style.display = 'block';
          loginBtn.textContent = 'Log In';
          loginBtn.disabled = false;
          return;
        }
        if (!hbFirebaseReady) {
          errEl.textContent = 'Forum system is loading. Please wait a moment and try again.';
          errEl.style.display = 'block';
          loginBtn.textContent = 'Log In';
          loginBtn.disabled = false;
          return;
        }
        auth.signInWithEmailAndPassword(email, pass)
          .then(function(cred) {
            // Email verification no longer required (dropped 2026-05-28).
            hbCloseAuth();
            loginBtn.textContent = 'Log In';
            loginBtn.disabled = false;
          })
          .catch(function(err) {
            var msg = err.message;
            if (err.code === 'auth/invalid-credential') msg = 'Incorrect email or password. Please try again. (If you just reset your password, make sure you clicked the link in the email and set a new one on the Firebase page.)';
            else if (err.code === 'auth/user-not-found') msg = 'No account found with this email. Click "Sign up" to create one.';
            else if (err.code === 'auth/too-many-requests') msg = 'Too many failed attempts. Please wait 5 minutes, then try again.';
            errEl.textContent = msg; errEl.style.display = 'block';
            loginBtn.textContent = 'Log In';
            loginBtn.disabled = false;
          });
      } catch(ex) {
        document.getElementById('hbLoginError').textContent = 'Error: ' + ex.message;
        document.getElementById('hbLoginError').style.display = 'block';
        loginBtn.textContent = 'Log In';
        loginBtn.disabled = false;
      }
    });
    // Also allow Enter key to submit login
    ['hbLoginEmail','hbLoginPassword'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') loginBtn.click();
      });
    });
  }

  // ─── Initialize on page load ───
  if (!hbFirebaseReady) {
    // Show demo content when Firebase isn't configured yet
    setTimeout(hbRenderDemoPosts, 300);
  } else {
    hbLoadPosts();
  }
})();
