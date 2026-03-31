/* Local Groups Filter */

(function() {
  function lgUpdateCounts() {
    var cards = document.querySelectorAll('.local-group-card[data-category]');
    var counts = {};
    cards.forEach(function(c) {
      var cat = c.getAttribute('data-category');
      counts[cat] = (counts[cat] || 0) + 1;
    });
    var total = cards.length;
    var allEl = document.getElementById('lgCountAll');
    if (allEl) allEl.textContent = total;
    document.querySelectorAll('.lg-filter-btn[data-filter]').forEach(function(btn) {
      var f = btn.getAttribute('data-filter');
      if (f !== 'all') {
        var countEl = btn.querySelector('.lg-filter-count');
        if (countEl) countEl.textContent = counts[f] || 0;
      }
    });
  }
  window.lgFilter = function(cat) {
    var cards = document.querySelectorAll('.local-group-card[data-category]');
    cards.forEach(function(c) {
      if (cat === 'all' || c.getAttribute('data-category') === cat) {
        c.style.display = '';
      } else {
        c.style.display = 'none';
      }
    });
    document.querySelectorAll('.lg-filter-btn').forEach(function(b) {
      b.classList.toggle('active', b.getAttribute('data-filter') === cat);
    });
  };
  // Initialize counts on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', lgUpdateCounts);
  } else {
    lgUpdateCounts();
  }
})();
