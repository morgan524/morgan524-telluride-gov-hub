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
  // Category label map
  var catLabels = {
    "all": "All Legal Notices",
    "public-entity": "Public Entity",
    "water-court": "Water Court",
    "housing": "Housing",
    "ordinance": "Ordinance",
    "estate": "Estate / Creditors",
    "tax-finance": "Tax \& Finance",
    "utilities": "Utilities"
  };
  // Wait for DOM
  document.addEventListener("DOMContentLoaded", function() {
    // Hide everything: header, subscribe bar, deep dive bar, container, footer
    var hideSelectors = [
      ".subscribe-bar", ".deep-dive-submenu",
      ".container",
      ".scroll-top-btn", ".live-banner",
      ".what-to-follow-bar", "#sidebarUpcomingEvents",
      ".left-sidebar"
    ];
    hideSelectors.forEach(function(sel) {
      document.querySelectorAll(sel).forEach(function(el) { el.style.display = "none"; });
    });
    // Create standalone page container
    var page = document.createElement("div");
    page.className = "legal-standalone-page";
    // Header with back button and title
    var catLabel = catLabels[legalParam] || "Legal Notices";
    var headerHtml = "<div class=\"legal-standalone-header\">" +
      "<a class=\"legal-standalone-back\" href=\"" + window.location.pathname + "\" onclick=\"window.close(); return false;\">← Back</a>" +
      "<div>" +
        "<div class=\"legal-standalone-title\">⚖️ " + catLabel + "</div>" +
        "<div class=\"legal-standalone-subtitle\">Published legal notices from local newspapers</div>" +
      "</div>" +
    "</div>";
    page.innerHTML = headerHtml;
    // Filter notices
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var active = LEGAL_NOTICES.filter(function(n) {
      if (!n.expires) return true;
      var exp = localDate(n.expires);
      return !exp || exp >= today;
    });
    if (legalParam !== "all") {
      active = active.filter(function(n) { return n.filterTag === legalParam; });
    }
    // Render cards
    var cardsDiv = document.createElement("div");
    cardsDiv.id = "legal-standalone-cards";
    if (active.length === 0) {
      cardsDiv.innerHTML = "<div style=\"text-align:center;padding:40px 20px;color:var(--text-muted);font-size:1rem;\">No active legal notices in this category.</div>";
    } else {
      active.forEach(function(notice) {
        var primaryPaper = PAPER_LOGOS[notice.papers[0]];
        var linkUrl = primaryPaper ? primaryPaper.url : "#";
        var eLogo = LEGAL_ENTITY_LOGOS[notice.entityLogo] || "";
        var eLogoHtml = eLogo ? "<div class=\"legal-entity-logo\">" + eLogo + "</div>" : "";
        var paperBadgesHtml = "<div class=\"legal-paper-badges\"><span class=\"paper-label\">Published in:</span>";
        var seenPapers = new Set();
        notice.papers.forEach(function(pKey) {
          var p = PAPER_LOGOS[pKey];
          if (!p) return;
          if (seenPapers.has(p.name)) return;
          seenPapers.add(p.name);
          var logoEl = p.img ? "<img src=\"" + p.img + "\" alt=\"" + p.name + "\" />" : (p.svg || "");
          paperBadgesHtml += "<span class=\"paper-badge\">" + logoEl + " " + p.name + "</span>";
        });
        paperBadgesHtml += "</div>";
        var calBtns = legalCalendarButtons(notice);
        var mapHtml = "";
        if (notice.address) {
          var mapQ = encodeURIComponent(notice.address);
          mapHtml = "<div class=\"legal-card-map\" style=\"width:100%;height:180px;margin-top:12px;\" onclick=\"event.stopPropagation();event.preventDefault();\">" +
            "<iframe src=\"https://maps.google.com/maps?q=" + mapQ + "\&t=\&z=15\&ie=UTF8\&iwloc=\&output=embed\" " +
            "width=\"100%\" height=\"100%\" style=\"border:0;border-radius:10px;\" loading=\"lazy\" referrerpolicy=\"no-referrer-when-downgrade\"></iframe>" +
            "<div style=\"font-size:0.65rem;color:var(--text-muted);margin-top:4px;text-align:center;\">📍 " + notice.address + "</div>" +
          "</div>";
        }
        var cardHtml = "<a href=\"" + linkUrl + "\" target=\"_blank\" rel=\"noopener\" class=\"legal-card\" style=\"text-decoration:none;color:inherit;display:block;margin-bottom:16px;\">" +
          "<div class=\"legal-card-grid\" style=\"flex-wrap:wrap;\">" +
            "<div class=\"legal-card-body\">" +
              "<div class=\"legal-card-header\">" + eLogoHtml +
                "<div>" +
                  "<div class=\"legal-card-title\">" + notice.title + "</div>" +
                  "<div class=\"legal-card-entity " + notice.entityClass + "\">" + notice.entity + "</div>" +
                "</div>" +
              "</div>" +
              "<div class=\"legal-card-summary\">" + highlightLegalNamesAndAddresses(linkGlossaryTerms(notice.summary)) + "</div>" +
              "<div class=\"legal-card-meta\">" +
                "<span class=\"legal-meta-tag tag-type\">" + notice.type + "</span>" +
                "<span class=\"legal-meta-tag tag-deadline\">" + notice.deadline + "</span>" +
                "<span class=\"legal-meta-tag tag-date\">Published: " + notice.dates + "</span>" +
                "<span class=\"legal-read-more\">Read Full Notice →</span>" +
              "</div>" +
              calBtns +
              paperBadgesHtml +
            "</div>" +
            mapHtml +
          "</div>" +
        "</a>";
        cardsDiv.innerHTML += cardHtml;
      });
    }
    page.appendChild(cardsDiv);
    // Insert before footer so footer stays at the bottom
    var footerEl = document.querySelector("footer");
    if (footerEl) {
      document.body.insertBefore(page, footerEl);
    } else {
      document.body.appendChild(page);
    }
    // Show footer and mobile nav at bottom
    if (footerEl) footerEl.style.display = "";
    document.querySelectorAll(".mobile-bottom-nav").forEach(function(el) { el.style.display = ""; });
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
