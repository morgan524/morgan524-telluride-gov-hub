/* Mobile Navigation & Hash Routing */

(function() {
  const mobileNav = document.getElementById('mobileNav');
  if (!mobileNav) return;
  const moreMenu = document.getElementById('mobileMoreMenu');
  const moreBackdrop = document.getElementById('mobileMoreBackdrop');
  const moreBtn = document.getElementById('mobileMoreBtn');
  const allMobileNavBtns = mobileNav.querySelectorAll('.mobile-nav-btn');
  const allMoreItems = moreMenu.querySelectorAll('.mobile-more-item');
  // Tabs that live in the "More" menu
  const moreTabs = new Set(['local-news', 'legals', 'links', 'land-use', 'gondola', 'subscribe']);
  function closeMoreMenu() {
    moreMenu.classList.remove('open');
    moreBackdrop.classList.remove('open');
  }
  function switchTab(tabName) {
    // Activate the desktop tab-btn too (keeps state in sync)
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const desktopBtn = document.querySelector('.tab-btn[data-tab="' + tabName + '"]');
    if (desktopBtn) desktopBtn.classList.add('active');
    const tabEl = document.getElementById('tab-' + tabName);
    if (tabEl) tabEl.classList.add('active');
    // Trigger any tab-specific rendering
    if (tabName === 'land-use' && typeof renderLandUseTab === 'function') renderLandUseTab();
    // Toggle left-sidebar cards: "What to Follow" on Meetings, Submit on Events, Legal Interest on Legals
    const wtfCard = document.getElementById('sidebarWhatToFollow');
    const submitCard = document.getElementById('sidebarSubmitEvent');
    const upcomingEventsCard = document.getElementById('sidebarUpcomingEvents');
    const legalInterestCard = document.getElementById('sidebarLegalInterest');
    const legalNearbyCard2 = document.getElementById('sidebarLegalNearby');
    if (wtfCard) wtfCard.style.display = (tabName === 'meetings') ? '' : 'none';
    if (submitCard) submitCard.style.display = (tabName === 'news') ? '' : 'none';
    if (upcomingEventsCard) upcomingEventsCard.style.display = (tabName === 'news') ? '' : 'none';
    if (legalInterestCard) legalInterestCard.style.display = (tabName === 'legals') ? '' : 'none';
    if (legalNearbyCard2) legalNearbyCard2.style.display = (tabName === 'legals') ? '' : 'none';
    const layout = document.querySelector('.main-layout');
    if (layout) {
      layout.classList.toggle('subscribe-active', tabName === 'subscribe');
      layout.classList.toggle('landuse-active', tabName === 'land-use' || tabName === 'gondola');
      layout.classList.toggle('links-active', tabName === 'links');
      layout.classList.toggle('news-active', tabName === 'news');
      layout.classList.toggle('legals-active', tabName === 'legals');
      layout.classList.toggle('aboutus-active', tabName === 'about-us');
      layout.classList.toggle('hubbub-active', tabName === 'hub-bub');
      layout.classList.toggle('communitypulse-active', tabName === 'community-pulse');
      var ddBar2 = document.getElementById('deepDiveSubmenu');
      if (ddBar2) ddBar2.style.display = (tabName === 'meetings') ? 'block' : 'none';
    }
    // Hide subscribe bar when on Subscribe, About Us, or Hub-Bub tab
    const subBar = document.querySelector('.subscribe-bar');
    if (subBar) subBar.style.display = (tabName === 'subscribe' || tabName === 'about-us' || tabName === 'hub-bub') ? 'none' : '';
    // Update URL hash (without triggering hashchange loop)
    var newHash = '#' + tabName;
    if (window.location.hash !== newHash) {
      history.pushState(null, '', newHash);
    }
    // Scroll to top of content
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  // Expose switchTab globally so inline onclick handlers (header nav, footer, etc.) can call it
  window.switchTab = switchTab;

  // ─── Hash-based routing ───
  // Map of valid tab names for hash routing
  var validTabs = {'hub-bub':1,'meetings':1,'news':1,'local-news':1,'links':1,
    'housing-search':1,'community-pulse':1,'about-us':1,'subscribe':1,
    'land-use':1,'gondola':1,'legals':1};
  function handleHashRoute() {
    var hash = window.location.hash.replace('#','');
    if (hash && validTabs[hash]) {
      switchTab(hash);
      updateMobileActive(hash);
    }
  }
  // Listen for back/forward browser navigation
  window.addEventListener('hashchange', handleHashRoute);
  window.addEventListener('popstate', function() {
    var hash = window.location.hash.replace('#','');
    if (hash && validTabs[hash]) {
      // Use replaceState to avoid double-pushing
      var currentTab = hash;
      document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
      var desktopBtn = document.querySelector('.tab-btn[data-tab="' + currentTab + '"]');
      if (desktopBtn) desktopBtn.classList.add('active');
      var tabEl = document.getElementById('tab-' + currentTab);
      if (tabEl) tabEl.classList.add('active');
      updateMobileActive(currentTab);
    }
  });
  // On initial page load, check for hash — use window load to ensure all scripts are ready
  if (window.location.hash && window.location.hash.length > 1) {
    window.addEventListener('load', function() {
      setTimeout(handleHashRoute, 200);
    });
  }
  function updateMobileActive(tabName) {
    // Clear all active states
    allMobileNavBtns.forEach(b => b.classList.remove('active'));
    allMoreItems.forEach(b => b.classList.remove('active'));
    if (moreTabs.has(tabName)) {
      // Highlight the "More" button and the specific item in the menu
      moreBtn.classList.add('active');
      allMoreItems.forEach(b => {
        if (b.dataset.tab === tabName) b.classList.add('active');
      });
    } else {
      // Highlight the direct nav button
      allMobileNavBtns.forEach(b => {
        if (b.dataset.tab === tabName) b.classList.add('active');
      });
    }
  }
  // Primary nav buttons
  allMobileNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === 'more') {
        // Toggle more menu
        const isOpen = moreMenu.classList.contains('open');
        if (isOpen) {
          closeMoreMenu();
        } else {
          moreMenu.classList.add('open');
          moreBackdrop.classList.add('open');
        }
        return;
      }
      closeMoreMenu();
      switchTab(btn.dataset.tab);
      updateMobileActive(btn.dataset.tab);
    });
  });
  // More menu items
  allMoreItems.forEach(btn => {
    btn.addEventListener('click', () => {
      closeMoreMenu();
      switchTab(btn.dataset.tab);
      updateMobileActive(btn.dataset.tab);
    });
  });
  // Backdrop closes more menu
  moreBackdrop.addEventListener('click', closeMoreMenu);
  // Keep mobile nav in sync when desktop tab-btns are clicked
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      updateMobileActive(btn.dataset.tab);
    });
  });
})();
