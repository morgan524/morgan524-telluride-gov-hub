/* ============================================================
   Deep Dive detail renderer (shared by every deep-dive-*.html stub).
   Each stub sets window.TOPIC_KEY then loads this. Data comes from
   data/land-use-issues.json (mirrored from gov-data.js LAND_USE_ISSUES —
   same content model as the live site; see the handoff README §State/Data).
   ============================================================ */
(function () {
  'use strict';
  var key = window.TOPIC_KEY;
  var root = document.getElementById('dive-root');
  if (!root) { console.error('[deep-dive] #dive-root missing'); return; }
  if (!window.LTData) { root.innerHTML = '<div class="lt-data-error" style="margin:40px 30px">This page failed to load. Please refresh in a minute.</div>'; return; }
  var esc = LTData.esc;
  // Docs/news/meetings link to hosted PDFs via root-relative paths — allow
  // those alongside http(s) (LTData.safeUrl is absolute-only).
  function safe(u) { return /^(https?:\/\/|\/(?!\/)|mailto:)/i.test(u || '') ? u : '#'; }

  function section(label, inner) {
    return '<section class="dd-sect"><div class="eyebrow" style="margin-bottom:10px">' + esc(label) + '</div>' + inner + '</section>';
  }

  function fmtDate(iso) { // 'YYYY-MM-DD' → 'Thu, Jul 23' (noon guard avoids TZ backslide)
    var d = new Date(iso + 'T12:00:00');
    return isNaN(d) ? iso : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  Promise.all([
    LTData.load(['land-use-issues', 'gondola-data']),
    // Live gov-hub cross-reference (built by content-refresh). Optional by
    // design: if it ever fails to build, the dive still renders (hand-curated
    // issue.meetings becomes the fallback below).
    LTData.load(['deep-dive-watch']).catch(function () { return { 'deep-dive-watch': null }; })
  ]).then(function (results) {
    var data = results[0];
    var watch = ((results[1]['deep-dive-watch'] || {}).topics || {})[key] || null;
    var issues = data['land-use-issues'] || {};
    if (data['gondola-data'] && data['gondola-data'].label) issues.gondola = data['gondola-data'];
    var issue = issues[key];
    if (!issue) { root.innerHTML = '<div class="lt-data-error" style="margin:40px 30px">Topic not found.</div>'; return; }
    document.title = (issue.label || key) + ' — Livable Telluride Deep Dive';

    // ---- hero ----
    var tall = issue.heroAspect === 'tall';
    // heroImage paths in the data can be site-root-relative ('assets/…');
    // resolve them absolutely so they work from any mount point.
    var heroSrc = issue.heroImage || '';
    if (heroSrc && !/^https?:\/\//.test(heroSrc) && heroSrc.charAt(0) !== '/') heroSrc = '/' + heroSrc;
    var hero = '<header class="dd-hero' + (tall ? ' tall' : '') + '">' +
      (heroSrc ? '<img class="dd-hero-img" src="' + esc(heroSrc) + '" alt="' + esc(issue.heroAlt || '') + '">' : '') +
      (tall ? '' : '<div class="dd-hero-grad"></div>') + '<div class="dd-hero-text">' +
      '<div class="crumb" style="color:rgba(255,255,255,.8)"><a href="deep-dives.html" style="color:rgba(255,255,255,.8)">Deep Dives</a> <span class="sep">&rsaquo;</span> ' + esc(issue.label || key) + '</div>' +
      '<div style="margin:10px 0"><span class="tag" style="background:var(--gold);color:var(--forest)">Deep Dive</span> ' +
      '<span class="tag" style="background:rgba(255,255,255,.18);color:#fff">Land Use</span></div>' +
      '<h1>' + esc(issue.label || key) + '</h1>' +
      (issue.heroCredit ? '<div class="dd-credit">' + esc(issue.heroCredit) + '</div>' : '') +
      '</div></header>';

    // ---- body ----
    var body = '';
    if (issue.intro) body += '<p class="dd-lead">' + esc(issue.intro) + '</p>';
    if (issue.statusTitle || issue.statusCopy || issue.nextStep) {
      body += '<div class="dd-status card"><h3>' + esc(issue.statusTitle || 'Where it stands now') + '</h3>' +
        (issue.statusCopy ? '<p>' + esc(issue.statusCopy) + '</p>' : '') +
        (issue.nextStep ? '<div class="dd-watch"><strong>Watch for:</strong> ' + esc(issue.nextStep) + '</div>' : '') + '</div>';
    }
    if (issue.legalSummary) {
      body += section('Legal issues summary', '<div class="dd-legal">' + esc(issue.legalSummary) + '</div>');
    }
    if (issue.legalIssues && issue.legalIssues.length) {
      body += section(issue.legalIssuesTitle || 'Key legal issues', issue.legalIssues.map(function (li) {
        return '<div class="dd-player"><span class="p-ico">' + (li.icon || '\u2696') + '</span><div><strong>' + esc(li.title || '') + '</strong>' +
          (li.copy ? '<p>' + esc(li.copy) + '</p>' : '') + '</div></div>';
      }).join(''));
    }
    if (issue.timeline && issue.timeline.length) {
      // Newest events first (data is stored oldest→newest; live site reverses too).
      body += section('How we got here', '<div class="tl">' + issue.timeline.slice().reverse().map(function (t) {
        return '<div class="tl-item' + (t.future ? ' future' : '') + '"><div class="tl-dot"></div>' +
          '<div class="tl-date">' + esc(t.date || '') + (t.future ? ' · Upcoming' : '') + '</div>' +
          '<h4>' + esc(t.title || '') + '</h4>' + (t.copy ? '<p>' + esc(t.copy) + '</p>' : '') + '</div>';
      }).join('') + '</div>');
    }
    if (issue.news && issue.news.length) {
      body += section('Recent coverage', issue.news.map(function (n) {
        return '<div class="dd-news"><div class="meta">' + esc(n.source || '') + (n.date ? ' · ' + esc(n.date) : '') + '</div>' +
          '<a href="' + esc(safe(n.href)) + '" target="_blank" rel="noopener">' + esc(n.title || '') + '</a>' +
          (n.copy ? '<p>' + esc(n.copy) + '</p>' : '') + '</div>';
      }).join(''));
    }

    // ---- sidebar ----
    var side = '<div class="dd-cta card-forest"><div class="k">Act before it’s final</div>' +
      '<p>Public comment shapes these decisions most before the votes happen.</p>' +
      '<a class="btn btn-gold" href="mailto:info@livabletelluride.org?subject=' + encodeURIComponent('Comment: ' + (issue.label || key)) + '">How to comment &rarr;</a></div>';
    var facts = issue.snapshot || issue.metrics;
    if (facts && facts.length) {
      side += '<div class="dd-card card"><h4>Key facts</h4>' + facts.map(function (m) {
        return '<div class="dd-metric"><div class="m-label">' + esc(m.label || '') + '</div><div class="m-value">' + esc(m.value || '') + '</div>' +
          (m.sub ? '<div class="m-sub">' + esc(m.sub) + '</div>' : '') + '</div>';
      }).join('') + '</div>';
    }
    if (issue.players && issue.players.length) {
      side += '<div class="dd-card card"><h4>Key players</h4>' + issue.players.map(function (p) {
        return '<div class="dd-player"><span class="p-ico">' + (p.icon || '\u{1F464}') + '</span><div><strong>' + esc(p.title || '') + '</strong>' +
          (p.copy ? '<p>' + esc(p.copy) + '</p>' : '') + '</div></div>';
      }).join('') + '</div>';
    }
    if (issue.docs && issue.docs.length) {
      side += '<div class="dd-card card"><h4>Key documents</h4>' + issue.docs.map(function (d) {
        return '<div class="dd-doc">' + (d.tag ? '<span class="tag">' + esc(d.tag) + '</span> ' : '') +
          '<a class="doc-link" href="' + esc(safe(d.href)) + '" target="_blank" rel="noopener">' + esc(d.title || '') + '</a>' +
          (d.copy ? '<p>' + esc(d.copy) + '</p>' : '') + '</div>';
      }).join('') + '</div>';
    }
    // Upcoming meetings: live gov-hub matches when available (auto-refreshed
    // every 6h), otherwise the topic's hand-curated list.
    if (watch && watch.upcoming && watch.upcoming.length) {
      side += '<div class="dd-card card"><h4>On upcoming agendas</h4>' + watch.upcoming.map(function (m) {
        var links = [];
        if (m.agendaUrl) links.push('<a href="' + esc(safe(m.agendaUrl)) + '" target="_blank" rel="noopener">Agenda</a>');
        if (m.zoomLink) links.push('<a href="' + esc(safe(m.zoomLink)) + '" target="_blank" rel="noopener">Join Zoom</a>');
        if (m.livestream) links.push('<a href="' + esc(safe(m.livestream)) + '" target="_blank" rel="noopener">Livestream</a>');
        if (!links.length && m.link) links.push('<a href="' + esc(safe(m.link)) + '" target="_blank" rel="noopener">Details</a>');
        return '<div class="dd-doc"><span class="tag rust-tint">' + esc(fmtDate(m.date)) + (m.time ? ' · ' + esc(m.time) : '') + '</span>' +
          '<strong style="display:block;margin:4px 0 2px">' + esc(m.sourceLabel || '') + '</strong>' +
          '<span>' + esc(m.title || '') + '</span>' +
          (links.length ? '<span class="dd-links">' + links.join('<span>&middot;</span>') + '</span>' : '') + '</div>';
      }).join('') + '<p class="meta" style="margin-top:6px">Auto-matched from this week’s Gov-Hub agendas.</p></div>';
    } else if (issue.meetings && issue.meetings.length) {
      side += '<div class="dd-card card"><h4>Upcoming meetings</h4>' + issue.meetings.map(function (m) {
        return '<div class="dd-doc"><span class="tag rust-tint">' + esc(m.date || '') + (m.time ? ' · ' + esc(m.time) : '') + '</span>' +
          '<a href="' + esc(safe(m.href)) + '" target="_blank" rel="noopener">' + esc(m.title || '') + '</a>' +
          (m.location ? '<p>' + esc(m.location) + '</p>' : '') + '</div>';
      }).join('') + '</div>';
    }
    // Recently in meetings: past-14-day gov-hub summaries that mention the topic.
    if (watch && watch.recent && watch.recent.length) {
      side += '<div class="dd-card card"><h4>Recently in meetings</h4>' + watch.recent.slice(0, 4).map(function (r) {
        return '<div class="dd-doc"><span class="tag">' + esc(fmtDate(r.date)) + '</span>' +
          '<strong style="display:block;margin:4px 0 2px">' + esc(r.title || '') + '</strong>' +
          (r.snippet ? '<p>' + esc(r.snippet) + '</p>' : '') + '</div>';
      }).join('') + '</div>';
    }
    // Latest developments: Haiku-triaged town/county news items for this topic.
    if (watch && watch.developments && watch.developments.length) {
      var news = watch.developments.filter(function (u) { return u.type === 'news' && u.title; });
      if (news.length) {
        side += '<div class="dd-card card"><h4>Latest developments</h4>' + news.slice(0, 4).map(function (u) {
          return '<div class="dd-news"><div class="meta">' + esc(u.source || '') + (u.articleDate ? ' · ' + esc(u.articleDate) : '') + '</div>' +
            (u.href ? '<a href="' + esc(safe(u.href)) + '" target="_blank" rel="noopener">' + esc(u.title) + '</a>' : '<strong>' + esc(u.title) + '</strong>') +
            (u.copy ? '<p>' + esc(u.copy) + '</p>' : '') + '</div>';
        }).join('') + '</div>';
      }
    }

    root.innerHTML = hero +
      '<div class="dd-wrap"><main class="dd-main">' + body +
      '<div class="dd-correct card"><strong>See anything wrong with this report?</strong> We correct fast.' +
      '<div style="margin-top:10px"><a class="btn btn-forest" href="mailto:info@livabletelluride.org?subject=' + encodeURIComponent('Correction: ' + (issue.label || key)) + '">Let us know &rarr;</a></div></div>' +
      '</main><aside class="dd-side">' + side + '</aside></div>';
  }).catch(function (err) { LTData.showError(root, err); });
})();
