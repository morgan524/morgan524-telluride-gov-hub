/* ══════════════════════════════════════════════════════════════
      HUB-BUB FORUM ENGINE v2
   Guided Civic Discussion Forum for Telluride Gov Hub
   ══════════════════════════════════════════════════════════════ */
(function() {
  'use strict';
  // ─── Firebase Configuration ───
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCyAjB0RA_LtoETyRqxVJor0lRB4NRyXF0",
    authDomain: "telluride-gov-hub.firebaseapp.com",
    projectId: "telluride-gov-hub",
    storageBucket: "telluride-gov-hub.firebasestorage.app",
    messagingSenderId: "14117089764",
    appId: "1:14117089764:web:4287985258f0bc929cd7f1",
    measurementId: "G-PWNCF2PZQP"
  };
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
    'housing': { label: 'Housing', icon: '🏠' },
    'land-use': { label: 'Land Use', icon: '🏗️' },
    'gondola': { label: 'Gondola 3A', icon: '🚡' },
    'public-safety': { label: 'Public Safety', icon: '🔥' },
    'budget-finance': { label: 'Budget & Finance', icon: '💰' },
    'infrastructure': { label: 'Infrastructure', icon: '🚰' },
    'environment': { label: 'Environment', icon: '🌿' },
    'health-education': { label: 'Health & Education', icon: '🏥' },
    'legal-governance': { label: 'Legal & Governance', icon: '⚖️' },
    'transit': { label: 'Transit', icon: '🚌' },
    'community': { label: 'Community', icon: '🤝' },
    'other': { label: 'Other', icon: '💡' }
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
  window.hbShowAuth = function(mode) {
    var modal = document.getElementById('hbAuthModal');
    modal.classList.add('open');
    document.getElementById('hbSignupForm').style.display = mode === 'signup' ? '' : 'none';
    document.getElementById('hbLoginForm').style.display = mode === 'login' ? '' : 'none';
    document.getElementById('hbVerifyForm').style.display = mode === 'verify' ? '' : 'none';
    // Clear errors and info messages
    ['hbSignupError','hbLoginError'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) { el.style.display = 'none'; el.textContent = ''; }
    });
    var infoEl = document.getElementById('hbLoginInfo');
    if (infoEl) { infoEl.style.display = 'none'; infoEl.innerHTML = ''; }
    // Reset login button state
    var lb = document.getElementById('hbLoginBtn');
    if (lb) { lb.textContent = 'Log In'; lb.disabled = false; }
  };
  window.hbCloseAuth = function() {
    document.getElementById('hbAuthModal').classList.remove('open');
  };
  window.hbDoSignup = function() {
    if (!hbFirebaseReady) { hbShowConfigNeeded(); return; }
    var name = document.getElementById('hbSignupName').value.trim();
    var email = document.getElementById('hbSignupEmail').value.trim();
    var pass = document.getElementById('hbSignupPassword').value;
    var errEl = document.getElementById('hbSignupError');
    if (!name) { errEl.textContent = 'Please enter a display name.'; errEl.style.display = 'block'; return; }
    if (!email) { errEl.textContent = 'Please enter your email.'; errEl.style.display = 'block'; return; }
    if (pass.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; errEl.style.display = 'block'; return; }
    auth.createUserWithEmailAndPassword(email, pass)
      .then(function(cred) {
        return cred.user.updateProfile({ displayName: name }).then(function() {
          return cred.user.sendEmailVerification();
        }).then(function() {
          // Save user profile to Firestore
          return db.collection('users').doc(cred.user.uid).set({
            displayName: name,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            postCount: 0
          });
        });
      })
      .then(function() {
        document.getElementById('hbVerifyEmail').textContent = email;
        hbShowAuth('verify');
      })
      .catch(function(err) {
        errEl.textContent = err.message; errEl.style.display = 'block';
      });
  };
  // hbDoLogin is now handled by addEventListener on #hbLoginBtn below
  window.hbForgotPassword = function() {
    if (!hbFirebaseReady) { hbShowConfigNeeded(); return; }
    var email = document.getElementById('hbLoginEmail').value.trim();
    var errEl = document.getElementById('hbLoginError');
    var infoEl = document.getElementById('hbLoginInfo');
    if (!email) {
      errEl.textContent = 'Please enter your email address above, then click "Forgot your password?" again.';
      errEl.style.display = 'block';
      if (infoEl) infoEl.style.display = 'none';
      return;
    }
    auth.sendPasswordResetEmail(email)
      .then(function() {
        errEl.style.display = 'none';
        if (infoEl) {
          infoEl.innerHTML = 'Password reset email sent to <strong>' + hbEsc(email) + '</strong>.<br><span style="color:#795548;">Important: The email may land in your junk or spam folder — check there if you don\'t see it in your inbox.</span>';
          infoEl.style.display = 'block';
        }
      })
      .catch(function(err) {
        if (infoEl) infoEl.style.display = 'none';
        var msg = err.message;
        if (err.code === 'auth/user-not-found') msg = 'No account found with this email address.';
        else if (err.code === 'auth/invalid-email') msg = 'Please enter a valid email address.';
        else if (err.code === 'auth/too-many-requests') msg = 'Too many attempts. Please try again in a few minutes.';
        errEl.textContent = msg;
        errEl.style.display = 'block';
      });
  };
  window.hbLogout = function() {
    if (auth) auth.signOut();
  };
  function hbUpdateAuthUI(user) {
    hbUser = user;
    var statusEl = document.getElementById('hbAuthStatus');
    var userEl = document.getElementById('hbAuthUser');
    var logoutBtn = document.getElementById('hbLogoutBtn');
    var avatarEl = document.getElementById('hbComposeAvatar');
    var isAdmin = user && user.email === 'info@livabletelluride.org';
    if (user && (user.emailVerified || isAdmin)) {
      var name = user.displayName || (isAdmin ? 'Admin' : 'User');
      statusEl.style.display = 'none';
      userEl.style.display = '';
      userEl.textContent = name;
      logoutBtn.style.display = '';
      avatarEl.textContent = name.charAt(0).toUpperCase();
      avatarEl.style.background = isAdmin ? '#e53935' : 'var(--forest)';
    } else {
      statusEl.style.display = '';
      userEl.style.display = 'none';
      logoutBtn.style.display = 'none';
      avatarEl.textContent = '?';
      avatarEl.style.background = '#999';
    }
  }
  // Listen for auth state changes
  if (hbFirebaseReady) {
    auth.onAuthStateChanged(function(user) {
      hbUpdateAuthUI(user);
      var isAdmin = user && user.email === 'info@livabletelluride.org';
      if (user && (user.emailVerified || isAdmin)) {
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
    if (!hbUser || (!hbUser.emailVerified && !isAdmin)) {
      hbShowAuth('signup');
      compose.classList.remove('expanded');
    }
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
  // Topic filter chips
  document.querySelectorAll('.hb-topic-chip').forEach(function(chip) {
    chip.addEventListener('click', function() {
      document.querySelectorAll('.hb-topic-chip').forEach(function(c) { c.classList.remove('active'); });
      chip.classList.add('active');
      hbCurrentTopic = chip.dataset.hbTopic;
      hbRenderPosts();
    });
  });
  // Enable/disable post button
  function hbUpdatePostBtn() {
    var title = document.getElementById('hbComposeTitle').value.trim();
    var body = document.getElementById('hbComposeBody').value.trim();
    var tags = document.querySelectorAll('.hb-compose-tag.selected');
    document.getElementById('hbPostBtn').disabled = !(title && body && tags.length > 0);
  }
  document.getElementById('hbComposeTitle').addEventListener('input', hbUpdatePostBtn);
  document.getElementById('hbComposeBody').addEventListener('input', hbUpdatePostBtn);
  // File attachments
  window.hbTriggerAttach = function() {
    document.getElementById('hbFileInput').click();
  };
  window.hbHandleFiles = function(input) {
    var files = Array.from(input.files);
    files.forEach(function(file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('File "' + file.name + '" is too large (max 10MB).');
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
  // Personal attack detection patterns
  var ATTACK_PATTERNS = [
    // Direct "you are" insults
    /\byou(?:'re| are)\s+(?:an?\s+)?(?:idiot|moron|fool|liar|fraud|crook|corrupt|scum|trash|joke|disgrace|pathetic|worthless|incompetent|stupid|dumb|ignorant|clueless)/i,
    // Name-calling with "is/are"
    /\b(?:he|she|they|mayor|council\s*(?:man|woman|member|person)?|commissioner|manager|director|board\s*member)\s+(?:is|are)\s+(?:an?\s+)?(?:idiot|moron|fool|liar|fraud|crook|corrupt|scum|trash|joke|disgrace|pathetic|worthless|incompetent|stupid|dumb|ignorant|clueless)/i,
    // "[Name] is a/an [insult]"
    /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s+is\s+(?:an?\s+)?(?:idiot|moron|fool|liar|fraud|crook|corrupt|scum|trash|joke|disgrace|pathetic|worthless|incompetent|stupid|dumb|ignorant|clueless)/i,
    // Imperative attacks
    /\b(?:shut\s+up|go\s+away|get\s+lost|drop\s+dead|go\s+to\s+hell|f[\*u]ck\s+(?:you|off|yourself))\b/i,
    // Dehumanizing language
    /\b(?:piece\s+of\s+(?:shit|crap|garbage)|human\s+garbage|waste\s+of\s+(?:space|oxygen|skin))\b/i,
    // Threats
    /\b(?:i'?ll|we'?ll|gonna|going\s+to)\s+(?:destroy|ruin|end|hurt|get)\s+(?:you|him|her|them)\b/i,
    // General profanity used at someone
    /\b(?:f[\*u]ck(?:ing)?|shit(?:ty)?|ass(?:hole)?|bitch|bastard|damn(?:ed)?)\s+(?:you|him|her|them|[A-Z][a-z]+)\b/i,
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
      if (ATTACK_PATTERNS[i].test(text)) {
        var category = 'general';
        if (i <= 0) category = 'competence';
        else if (i <= 2) category = 'character';
        else if (i <= 3) category = 'dismissive';
        else if (i <= 4) category = 'profanity';
        else if (i === 5) category = 'threat';
        else category = 'profanity';
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
    if (!hbUser || (!hbUser.emailVerified && !isAdmin)) { hbShowAuth('login'); return; }
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
        authorId: hbUser.uid,
        authorName: hbUser.displayName || 'Anonymous',
        title: title,
        body: body,
        tags: selectedTags,
        postType: hbSelectedPostType || 'question',
        attachments: attachments,
        imageUrl: imageUrl || null,
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
    }).then(function() {
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
      alert('Could not publish your post. Please try again.');
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
    // Filter by topic
    var filtered = hbPosts;
    if (hbCurrentTopic !== 'all') {
      filtered = hbPosts.filter(function(p) {
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
    // Sort
    if (hbCurrentSort === 'most-discussed') {
      filtered.sort(function(a, b) { return (b.replyCount || 0) - (a.replyCount || 0); });
    } else if (hbCurrentSort === 'most-useful') {
      filtered.sort(function(a, b) {
        var aTotalReactions = Object.values(a.reactions || {}).reduce(function(sum, val) { return sum + val; }, 0);
        var bTotalReactions = Object.values(b.reactions || {}).reduce(function(sum, val) { return sum + val; }, 0);
        return bTotalReactions - aTotalReactions;
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
    var isLong = post.body && post.body.length > 400;
    var bodyText = isLong ? post.body.substring(0, 400) + '...' : (post.body || '');
    var myUid = hbUser ? hbUser.uid : '';
    var votedUp = post.upvoters && post.upvoters.indexOf(myUid) !== -1;
    var votedDown = post.downvoters && post.downvoters.indexOf(myUid) !== -1;

    // Get total reactions
    var totalReactions = Object.values(post.reactions || {}).reduce(function(sum, val) { return sum + val; }, 0);
    var userReaction = (post.reactors && post.reactors[myUid]) || null;

    var tagsHtml = '';
    if (post.tags && post.tags.length) {
      tagsHtml = '<div class="hb-post-tags">' + post.tags.map(function(t) {
        var info = HB_TOPICS[t] || { icon: '💡', label: t };
        return '<span class="hb-post-tag">' + info.icon + ' ' + hbEsc(info.label) + '</span>';
      }).join('') + '</div>';
    }

    // Post type badge
    var badgeHtml = '';
    if (post.postType) {
      var typeInfo = HB_POST_TYPES[post.postType] || { label: post.postType, icon: '💡' };
      badgeHtml = '<span class="hb-badge hb-badge-' + post.postType + '">' + typeInfo.icon + ' ' + typeInfo.label + '</span>';
    }

    var attachHtml = '';
    if (post.attachments && post.attachments.length) {
      attachHtml = '<div class="hb-post-attachments">' + post.attachments.map(function(a) {
        var icon = a.type && a.type.startsWith('image/') ? '🖼️' : '📄';
        return '<a class="hb-post-attach" href="' + hbEsc(a.url) + '" target="_blank">' + icon + ' ' + hbEsc(a.name) + '</a>';
      }).join('') + '</div>';
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

    // Constructive reactions
    var reactionsHtml = '<div class="hb-reactions">';
    var reactionTypes = [
      { key: 'useful', label: 'Useful', emoji: '👍' },
      { key: 'helpful_source', label: 'Helpful source', emoji: '📚' },
      { key: 'good_question', label: 'Good question', emoji: '❓' },
      { key: 'learned', label: 'I learned', emoji: '💡' }
    ];
    reactionTypes.forEach(function(r) {
      var count = (post.reactions && post.reactions[r.key]) || 0;
      var isSelected = userReaction === r.key ? ' selected' : '';
      reactionsHtml += '<button class="hb-react-btn' + isSelected + '" onclick="hbReact(\'' + post.id + '\',\'' + r.key + '\')" title="' + r.label + '">' + r.emoji + ' <span>' + count + '</span></button>';
    });
    reactionsHtml += '</div>';

    // Build featured image HTML (left side of card)
    var hasImage = post.imageUrl && post.imageUrl.length > 0;
    var imageHtml = hasImage
      ? '<div class="hb-post-image"><a href="' + hbEsc(post.imageUrl) + '" target="_blank"><img src="' + hbEsc(post.imageUrl) + '" alt="Post photo" loading="lazy"></a></div>'
      : '';

    // Wrap title+body+extras in a flex row when an image is present
    var contentStart = hasImage ? '<div class="hb-post-content-wrap">' + imageHtml + '<div class="hb-post-content-text">' : '';
    var contentEnd = hasImage ? '</div></div>' : '';

    card.innerHTML =
      '<div class="hb-post-head">' +
        '<div class="hb-post-avatar">' + initial + '</div>' +
        '<div><span class="hb-post-author">' + hbEsc(post.authorName || 'Anonymous') + '</span>' +
        '<div class="hb-post-meta">' + timeStr + '</div></div>' +
        badgeHtml +
      '</div>' +
      contentStart +
      '<div class="hb-post-title">' + hbEsc(post.title || '') + '</div>' +
      tagsHtml +
      '<div class="hb-post-body' + (isLong ? ' truncated' : '') + '">' + hbEsc(bodyText) + '</div>' +
      (isLong ? '<button class="hb-read-more" onclick="hbExpandPost(this)">Read more</button>' : '') +
      debriefHtml +
      sourceHtml +
      contentEnd +
      attachHtml +
      nextStepHtml +
      reactionsHtml +
      '<div class="hb-post-foot">' +
        '<button class="hb-reply-toggle" onclick="hbToggleReplies(\'' + post.id + '\')">💬 <span>' + (post.replyCount || 0) + '</span> replies</button>' +
        (hbUser && hbUser.email === 'info@livabletelluride.org' ? '<button class="hb-admin-delete-btn" onclick="hbAdminDelete(\'' + post.id + '\')" title="Delete post (admin)">🗑️ Delete</button>' : '') +
      '</div>' +
      '<div class="hb-replies" id="hb-replies-' + post.id + '" style="display:none;"></div>';
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
    if (!hbUser || !hbUser.emailVerified) { hbShowAuth('login'); return; }
    if (!hbFirebaseReady) return;
    var ref = db.collection('posts').doc(postId);
    var uid = hbUser.uid;
    db.runTransaction(function(tx) {
      return tx.get(ref).then(function(doc) {
        var data = doc.data();
        var reactions = data.reactions || { useful: 0, helpful_source: 0, good_question: 0, learned: 0 };
        var reactors = data.reactors || {};
        var currentReaction = reactors[uid];

        // If user already has this reaction, remove it
        if (currentReaction === reactionType) {
          reactions[reactionType] = Math.max(0, (reactions[reactionType] || 0) - 1);
          delete reactors[uid];
        } else {
          // Remove old reaction if exists
          if (currentReaction && reactions[currentReaction]) {
            reactions[currentReaction] = Math.max(0, (reactions[currentReaction] || 0) - 1);
          }
          // Add new reaction
          reactions[reactionType] = (reactions[reactionType] || 0) + 1;
          reactors[uid] = reactionType;
        }

        tx.update(ref, {
          reactions: reactions,
          reactors: reactors
        });
      });
    }).then(function() {
      hbLoadPosts();
    }).catch(function(err) {
      console.error('Reaction error:', err);
    });
  };
  // ═══════════════════════════════
  // VOTING (KEPT FOR BACKWARD COMPATIBILITY)
  // ═══════════════════════════════
  window.hbVote = function(postId, dir) {
    if (!hbUser || !hbUser.emailVerified) { hbShowAuth('login'); return; }
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
  window.hbAdminDelete = function(postId) {
    if (!hbUser || hbUser.email !== 'info@livabletelluride.org') return;
    if (!confirm('Are you sure you want to delete this post? This cannot be undone.')) return;
    db.collection('posts').doc(postId).delete().then(function() {
      // Also delete all replies for this post
      db.collection('replies').where('postId', '==', postId).get().then(function(snapshot) {
        var batch = db.batch();
        snapshot.forEach(function(doc) { batch.delete(doc.ref); });
        return batch.commit();
      });
      hbLoadPosts();
    }).catch(function(err) {
      alert('Error deleting post: ' + err.message);
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
          div.innerHTML =
            '<div class="hb-reply-head">' +
              '<div class="hb-reply-avatar">' + initial + '</div>' +
              '<span class="hb-reply-author">' + hbEsc(r.authorName || 'Anonymous') + '</span>' +
              '<span class="hb-reply-time">' + time + '</span>' +
            '</div>' +
            '<div class="hb-reply-body">' + hbEsc(r.body || '') + '</div>';
          container.appendChild(div);
        });
        hbAddReplyCompose(postId, container);
      })
      .catch(function(err) {
        container.innerHTML = '<div style="color:#c0392b;font-size:0.82rem;padding:8px;">Could not load replies.</div>';
        console.error('Load replies error:', err);
      });
  }
  function hbAddReplyCompose(postId, container) {
    var div = document.createElement('div');
    div.className = 'hb-reply-compose';
    div.innerHTML =
      '<textarea placeholder="Write a reply..." id="hb-reply-text-' + postId + '"></textarea>' +
      '<button onclick="hbPostReply(\'' + postId + '\')">Reply</button>';
    container.appendChild(div);
  }
  window.hbPostReply = function(postId) {
    if (!hbUser || !hbUser.emailVerified) { hbShowAuth('login'); return; }
    if (!hbFirebaseReady) return;
    var textarea = document.getElementById('hb-reply-text-' + postId);
    var body = textarea.value.trim();
    if (!body) return;
    // Tone check on reply too
    var tone = hbAnalyzeTone(body);
    if (tone && tone.flagged) {
      if (!confirm('This reply may come across as a personal attack. Suggested alternative:\n\n"' + (TONE_SUGGESTIONS[tone.category] || TONE_SUGGESTIONS['general']) + '"\n\nPost as written anyway?')) {
        return;
      }
    }
    var btn = textarea.nextElementSibling;
    btn.disabled = true;
    btn.textContent = '...';
    db.collection('posts').doc(postId).collection('replies').add({
      authorId: hbUser.uid,
      authorName: hbUser.displayName || 'Anonymous',
      body: body,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(function() {
      // Increment reply count on parent post
      return db.collection('posts').doc(postId).update({
        replyCount: firebase.firestore.FieldValue.increment(1)
      });
    }).then(function() {
      textarea.value = '';
      btn.disabled = false;
      btn.textContent = 'Reply';
      hbLoadReplies(postId, document.getElementById('hb-replies-' + postId));
      // Update local cache
      var post = hbPosts.find(function(p) { return p.id === postId; });
      if (post) post.replyCount = (post.replyCount || 0) + 1;
      hbRenderTrending();
    }).catch(function(err) {
      console.error('Reply error:', err);
      btn.disabled = false;
      btn.textContent = 'Reply';
    });
  };
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
  function hbTimeAgo(date) {
    var secs = Math.floor((new Date() - date) / 1000);
    if (secs < 60) return 'just now';
    if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
    if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
    if (secs < 604800) return Math.floor(secs / 86400) + 'd ago';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  // ─── Bind login button via addEventListener (more reliable than inline onclick) ───
  var loginBtn = document.getElementById('hbLoginBtn');
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
            var isAdmin = cred.user.email === 'info@livabletelluride.org';
            if (!isAdmin && !cred.user.emailVerified) {
              errEl.textContent = 'Please verify your email first. Check your inbox for the verification link.';
              errEl.style.display = 'block';
              auth.signOut();
              loginBtn.textContent = 'Log In';
              loginBtn.disabled = false;
              return;
            }
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
