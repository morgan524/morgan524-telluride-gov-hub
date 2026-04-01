/* Google Translate Init + Legal Standalone Page Mode */

function googleTranslateElementInit() {
  new google.translate.TranslateElement({
    pageLanguage: 'en',
    includedLanguages: 'en,es,fr,de,zh-CN,ja,ko,pt,ru,ar,hi,it,vi,tl,ne',
    layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
    autoDisplay: false
  }, 'google_translate_element');
}

// ═══════════════════════════════════════
// ── Standalone Legal Notices Page Mode ─
// ═══════════════════════════════════════
(function() {
  var params = new URLSearchParams(window.location.search);
  var legalParam = params.get("legal");
  if (!legalParam) return; // Not in standalone mode

  // Category config: label + count ID
  var categories = [
    { key: "all",           label: "All Notices" },
    { key: "public-entity", label: "Public Entity" },
    { key: "water-court",   label: "Water Court" },
    { key: "housing",       label: "Housing" },
    { key: "ordinance",     label: "Ordinance" },
    { key: "estate",        label: "Estate / Creditors" },
    { key: "tax-finance",   label: "Tax & Finance" },
    { key: "utilities",     label: "Utilities" }
  ];

  // Wait for DOM
  document.addEventListener("DOMContentLoaded", function() {
    // Hide everything except site header and footer
    var hideSelectors = [
      ".govhub-hero", ".subscribe-bar", ".deep-dive-submenu",
      ".container",
      ".scroll-top-btn", ".live-banner",
      ".what-to-follow-bar", "#sidebarUpcomingEvents",
      ".left-sidebar", ".site-header-divider"
    ];
    hideSelectors.forEach(function(sel) {
      document.querySelectorAll(sel).forEach(function(el) { el.style.display = "none"; });
    });

    // Get active notices
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var allActive = LEGAL_NOTICES.filter(function(n) {
      if (!n.expires) return true;
      var exp = localDate(n.expires);
      return !exp || exp >= today;
    });

    // Count per category
    var counts = { "all": allActive.length };
    categories.forEach(function(cat) {
      if (cat.key !== "all") {
        counts[cat.key] = allActive.filter(function(n) { return n.filterTag === cat.key; }).length;
      }
    });

    // Create standalone page container
    var page = document.createElement("div");
    page.className = "legal-standalone-page";

    // ── Header ──
    var catLabel = "All Legal Notices";
    categories.forEach(function(c) { if (c.key === legalParam) catLabel = c.label; });

    var headerHtml = '<div class="legal-standalone-header">' +
      '<a class="legal-standalone-back" href="' + window.location.pathname + '" onclick="window.close(); return false;">\u2190 Back</a>' +
      '<div>' +
        '<div class="legal-standalone-title">\u2696\uFE0F ' + catLabel + '</div>' +
        '<div class="legal-standalone-subtitle">Published legal notices from local newspapers</div>' +
      '</div>' +
    '</div>';

    // ── Filter pills ──
    var filtersHtml = '<div class="legal-sa-filters">';
    categories.forEach(function(cat) {
      var count = counts[cat.key] || 0;
      if (count === 0 && cat.key !== "all") return; // hide empty categories
      var active = (cat.key === legalParam) ? ' legal-sa-pill-active' : '';
      var href = window.location.pathname + '?legal=' + cat.key;
      filtersHtml += '<a href="' + href + '" class="legal-sa-pill' + active + '">' +
        '<span class="legal-sa-pill-label">' + cat.label + '</span>' +
        '<span class="legal-sa-pill-count' + (active ? ' legal-sa-count-active' : '') + '">' + count + '</span>' +
      '</a>';
    });
    filtersHtml += '</div>';

    page.innerHTML = headerHtml + filtersHtml;

    // ── Filter and render cards ──
    var filtered = legalParam === "all"
      ? allActive
      : allActive.filter(function(n) { return n.filterTag === legalParam; });

    var cardsDiv = document.createElement("div");
    cardsDiv.id = "legal-standalone-cards";

    if (filtered.length === 0) {
      cardsDiv.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:1rem;">No active legal notices in this category.</div>';
    } else {
      filtered.forEach(function(notice) {
        var primaryPaper = PAPER_LOGOS[notice.papers[0]];
        var linkUrl = primaryPaper ? primaryPaper.url : "#";

        // Entity logo
        var eLogo = LEGAL_ENTITY_LOGOS[notice.entityLogo] || "";
        var eLogoHtml = eLogo ? '<div class="legal-entity-logo">' + eLogo + '</div>' : '';

        // Summary with highlights
        var summaryText = '';
        try { summaryText = highlightLegalNamesAndAddresses(linkGlossaryTerms(notice.summary)); }
        catch(e) { summaryText = notice.summary; }

        // Paper badges
        var paperBadgesHtml = '<div class="legal-paper-badges"><span class="paper-label">Published in:</span>';
        var seenPapers = new Set();
        notice.papers.forEach(function(pKey) {
          var p = PAPER_LOGOS[pKey];
          if (!p) return;
          if (seenPapers.has(p.name)) return;
          seenPapers.add(p.name);
          var logoEl = p.img ? '<img src="' + p.img + '" alt="' + p.name + '" />' : (p.svg || '');
          paperBadgesHtml += '<span class="paper-badge">' + logoEl + ' ' + p.name + '</span>';
        });
        paperBadgesHtml += '</div>';

        // Calendar buttons (only if notice has an event)
        var calBtns = '';
        try { calBtns = legalCalendarButtons(notice); } catch(e) {}

        // Map embed
        var mapHtml = '';
        if (notice.address) {
          var mapQ = encodeURIComponent(notice.address);
          mapHtml = '<div class="legal-card-map" style="width:100%;height:180px;margin-top:12px;">' +
            '<iframe src="https://maps.google.com/maps?q=' + mapQ + '&t=&z=15&ie=UTF8&iwloc=&output=embed" ' +
            'width="100%" height="100%" style="border:0;border-radius:10px;" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>' +
            '<div style="font-size:0.65rem;color:var(--text-muted);margin-top:4px;text-align:center;">\uD83D\uDCCD ' + notice.address + '</div>' +
          '</div>';
        }

        // Build card as a DIV (not <a>) to avoid nested-link issues
        var cardHtml = '<div class="legal-card legal-sa-card">' +
          '<div class="legal-card-body">' +
            '<div class="legal-card-header">' + eLogoHtml +
              '<div>' +
                '<div class="legal-card-title">' + notice.title + '</div>' +
                '<div class="legal-card-entity ' + notice.entityClass + '">' + notice.entity + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="legal-card-summary">' + summaryText + '</div>' +
            '<div class="legal-card-meta">' +
              '<span class="legal-meta-tag tag-type">' + notice.type + '</span>' +
              '<span class="legal-meta-tag tag-deadline">' + notice.deadline + '</span>' +
              '<span class="legal-meta-tag tag-date">Published: ' + notice.dates + '</span>' +
              '<a href="' + linkUrl + '" target="_blank" rel="noopener" class="legal-read-more" onclick="event.stopPropagation();">Read Full Notice \u2192</a>' +
            '</div>' +
            calBtns +
            paperBadgesHtml +
          '</div>' +
          mapHtml +
        '</div>';
        cardsDiv.innerHTML += cardHtml;
      });
    }

    page.appendChild(cardsDiv);

    // Insert before footer so footer stays at the bottom
    var footerEl = document.querySelector(".footer");
    if (footerEl) {
      document.body.insertBefore(page, footerEl);
    } else {
      document.body.appendChild(page);
    }
  });
})();

// ── Legal Sidebar Count Updater ──
document.addEventListener("DOMContentLoaded", function() {
  if (typeof LEGAL_NOTICES === "undefined") return;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var active = LEGAL_NOTICES.filter(function(n) {
    if (!n.expires) return true;
    var exp = localDate(n.expires);
    return !exp || exp >= today;
  });
  var counts = { "all": active.length };
  var tags = ["public-entity", "water-court", "housing", "ordinance", "estate", "tax-finance", "utilities"];
  tags.forEach(function(tag) {
    counts[tag] = active.filter(function(n) { return n.filterTag === tag; }).length;
  });
  var idMap = {
    "all": "legalCountAll",
    "public-entity": "legalCountPublicEntity",
    "water-court": "legalCountWaterCourt",
    "housing": "legalCountHousing",
    "ordinance": "legalCountOrdinance",
    "estate": "legalCountEstate",
    "tax-finance": "legalCountTaxFinance",
    "utilities": "legalCountUtilities"
  };
  Object.keys(idMap).forEach(function(key) {
    var el = document.getElementById(idMap[key]);
    if (el) el.textContent = counts[key] || 0;
  });
});

// ── Clean up broken entity logo images in legal cards ──
document.addEventListener("DOMContentLoaded", function() {
  function fixBrokenLogos() {
    document.querySelectorAll(".legal-entity-logo img").forEach(function(img) {
      img.onerror = function() { this.parentElement.style.display = "none"; };
      if (img.complete && img.naturalWidth === 0) img.parentElement.style.display = "none";
    });
  }
  fixBrokenLogos();
  // Watch for dynamically added legal cards
  new MutationObserver(function() { fixBrokenLogos(); })
    .observe(document.body, { childList: true, subtree: true });
});
