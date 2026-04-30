/* Community Correction / Fact-Check System */

// ══════════════════════════════════════════════════════
// ── Community Correction / Fact-Check System ──
// ══════════════════════════════════════════════════════
(function() {
  const overlay = document.getElementById('correctionOverlay');
  const fab = document.getElementById('correctionFab');
  const closeBtn = document.getElementById('correctionClose');
  const contextBox = document.getElementById('correctionContext');
  const contextTitle = document.getElementById('correctionContextTitle');
  const categoryEl = document.getElementById('correctionCategory');
  const currentEl = document.getElementById('correctionCurrent');
  const shouldEl = document.getElementById('correctionShould');
  const sourceEl = document.getElementById('correctionSource');
  const notesEl = document.getElementById('correctionNotes');
  const emailEl = document.getElementById('correctionEmail');
  const submitBtn = document.getElementById('correctionSubmit');
  const statusMsg = document.getElementById('correctionStatusMsg');
  const verifyStatus = document.getElementById('correctionVerifyStatus');
  if (!overlay || !fab) return;
  // ── Trusted domains for automatic verification ──
  const TRUSTED_DOMAINS = [
    // Government
    'telluride.gov', 'sanmiguelcountyco.gov', 'townofmountainvillage.com',
    'colorado.gov', 'state.co.us',
    // News
    'telluridenews.com', 'norwoodnews.com', 'telluridedaily.com',
    'durangoherald.com', 'gjsentinel.com',
    // Festivals (from TELLURIDE_FESTIVALS)
    'mountainfilm.org', 'tellurideballoonfest.com', 'telluridefoodandvine.com',
    'bluegrass.com', 'tellurideyogafestival.com', 'telluridechambermusic.org',
    'tellurideamericana.com', 'telluridejazz.org', 'tellurideinstitute.org',
    'telluridefilmfestival.org', 'tellurideblues.com', 'telluridehorrorshow.com', 'originalthinkers.com', 'tellurideautumnclassic.com',
    // Regional / tourism
    'visittelluride.com', 'telluridefoundation.org', 'smrha.org',
    'tellurideschool.org', 'kfrn.org', 'telluridelibrary.org',
    // Housing
    'smrha.org'
  ];
  function isDomainTrusted(url) {
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, '');
      return TRUSTED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
    } catch(e) {
      return false;
    }
  }
  function isValidUrl(str) {
    try { new URL(str); return true; } catch(e) { return false; }
  }
  // Track what item the correction is about
  let correctionItemTitle = '';
  let correctionItemTab = '';
  // ── Open / Close ──
  function openModal(itemTitle, tab) {
    correctionItemTitle = itemTitle || '';
    correctionItemTab = tab || '';
    if (itemTitle) {
      contextBox.style.display = 'block';
      contextTitle.textContent = itemTitle;
    } else {
      contextBox.style.display = 'none';
    }
    // Reset form
    categoryEl.value = '';
    currentEl.value = '';
    shouldEl.value = '';
    sourceEl.value = '';
    notesEl.value = '';
    emailEl.value = '';
    statusMsg.textContent = '';
    statusMsg.className = 'correction-status';
    verifyStatus.innerHTML = '';
    submitBtn.disabled = true;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }
  fab.addEventListener('click', () => openModal('', ''));
  // Sidebar correction button
  const sidebarCorrBtn = document.getElementById('sidebarCorrectionBtn');
  if (sidebarCorrBtn) sidebarCorrBtn.addEventListener('click', () => openModal('', ''));
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  // ── Form validation ──
  function checkForm() {
    const hasCategory = categoryEl.value !== '';
    const hasShould = shouldEl.value.trim() !== '';
    submitBtn.disabled = !(hasCategory && hasShould);
  }
  categoryEl.addEventListener('change', checkForm);
  shouldEl.addEventListener('input', checkForm);
  // ── Source URL verification feedback ──
  sourceEl.addEventListener('input', () => {
    const url = sourceEl.value.trim();
    if (!url) {
      verifyStatus.innerHTML = '';
      return;
    }
    if (!isValidUrl(url)) {
      verifyStatus.innerHTML = '<div class="correction-unverified-note">⚠️ Enter a full URL starting with https://</div>';
      return;
    }
    if (isDomainTrusted(url)) {
      verifyStatus.innerHTML = '<div class="correction-verified-badge">✅ Verified source — correction will be applied automatically</div>';
    } else {
      verifyStatus.innerHTML = '<div class="correction-unverified-note">⏳ Unrecognized source — correction will be sent for review</div>';
    }
  });
  // ── Submit handler ──
  submitBtn.addEventListener('click', () => {
    const category = categoryEl.value;
    const currentText = currentEl.value.trim();
    const shouldText = shouldEl.value.trim();
    const sourceUrl = sourceEl.value.trim();
    const notes = notesEl.value.trim();
    const submitterEmail = emailEl.value.trim();
    const isVerified = sourceUrl && isValidUrl(sourceUrl) && isDomainTrusted(sourceUrl);
    if (!category || !shouldText) return;
    // Build the email
    const subjectPrefix = isVerified ? '[AUTO-APPROVED]' : '[NEEDS REVIEW]';
    const subject = subjectPrefix + ' Tell-Hub Correction: ' + (correctionItemTitle || category);
    let body = '';
    body += '═══════════════════════════════════════\n';
    body += isVerified
      ? '✅ VERIFIED SOURCE — AUTO-APPROVED CORRECTION\n'
      : '⏳ UNVERIFIED — REQUIRES ADMIN APPROVAL\n';
    body += '═══════════════════════════════════════\n\n';
    if (correctionItemTitle) {
      body += 'ITEM: ' + correctionItemTitle + '\n';
    }
    if (correctionItemTab) {
      body += 'TAB: ' + correctionItemTab + '\n';
    }
    body += 'CATEGORY: ' + category + '\n\n';
    if (currentText) {
      body += 'CURRENTLY SAYS:\n' + currentText + '\n\n';
    }
    body += 'SHOULD SAY:\n' + shouldText + '\n\n';
    if (sourceUrl) {
      body += 'SOURCE: ' + sourceUrl + '\n';
      body += 'VERIFIED: ' + (isVerified ? 'YES — Trusted domain' : 'NO — Unknown domain, requires manual review') + '\n\n';
    }
    if (notes) {
      body += 'ADDITIONAL NOTES:\n' + notes + '\n\n';
    }
    if (submitterEmail) {
      body += 'SUBMITTED BY: ' + submitterEmail + '\n\n';
    }
    body += '───────────────────────────────────────\n';
    body += 'Submitted: ' + new Date().toLocaleString() + '\n';
    body += 'Page: Telluride Tell-Hub\n';
    if (!isVerified) {
      body += '\n═══════════════════════════════════════\n';
      body += 'ADMIN ACTION REQUIRED:\n';
      body += 'Reply APPROVED to apply this correction,\n';
      body += 'or reply DENIED with a reason.\n';
      body += '═══════════════════════════════════════\n';
    } else {
      body += '\n═══════════════════════════════════════\n';
      body += 'This correction was auto-approved because\n';
      body += 'the source URL is from a verified domain.\n';
      body += 'The update should be applied to the site.\n';
      body += '═══════════════════════════════════════\n';
    }
    // Send via mailto (most reliable for static sites)
    const mailto = 'mailto:info@livabletelluride.org'
      + '?subject=' + encodeURIComponent(subject)
      + '&body=' + encodeURIComponent(body);
    // Also try sending silently via Formspree-style fetch if available
    // (Future enhancement: replace with actual form endpoint)
    // For now, open the mailto link
    window.open(mailto, '_blank');
    // Show success message
    statusMsg.className = 'correction-status success';
    if (isVerified) {
      statusMsg.innerHTML = '✅ Your correction has been submitted with a verified source. It will be applied automatically. Thank you!';
    } else {
      statusMsg.innerHTML = '📬 Your correction has been sent to info@livabletelluride.org for review. You\'ll hear back once it\'s been reviewed.';
    }
    // Disable submit to prevent double-sends
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitted ✓';
    setTimeout(() => {
      submitBtn.textContent = 'Submit Correction';
    }, 5000);
  });
  // ── Global function so cards can trigger corrections ──
  window.openCorrectionModal = function(itemTitle, tab) {
    openModal(itemTitle, tab);
  };
  // ── Add correction triggers to event/meeting cards after render ──
  // We use a MutationObserver to add triggers whenever new cards appear
  function addCorrectionTriggers(container) {
    if (!container) return;
    container.querySelectorAll('.card, .legal-card').forEach(card => {
      if (card.dataset.correctionAdded) return;
      card.dataset.correctionAdded = 'true';
      // Skip meetings tab — correction link is now inline in the comment box
      const tab = card.closest('.tab-content');
      const tabName = tab ? tab.id.replace('tab-', '') : '';
      if (tabName === 'meetings') return;
      // Skip "Suggest Correction" for Telluride Times and KOTO articles on Local News page
      if (tabName === 'local-news') {
        const srcKey = card.dataset.sourceKey;
        if (srcKey === 'ttimes' || srcKey === 'koto') return;
      }
      // Find the title
      const titleEl = card.querySelector('h3 a, .legal-card-title');
      if (!titleEl) return;
      const title = titleEl.textContent.trim();
      // Create trigger button
      const trigger = document.createElement('button');
      trigger.className = 'correction-trigger';
      trigger.innerHTML = '✏️ Suggest Correction';
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openModal(title, tabName);
      });
      // Insert at end of card body or summary
      const body = card.querySelector('.card-body, .legal-card-summary');
      if (body) body.appendChild(trigger);
    });
  }
  // Observe content containers for new cards
  const containers = ['meetings-content', 'news-content', 'local-news-content', 'legals-content'];
  containers.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const observer = new MutationObserver(() => addCorrectionTriggers(el));
    observer.observe(el, { childList: true, subtree: true });
    // Also run once for any already-rendered cards
    addCorrectionTriggers(el);
  });
})();
