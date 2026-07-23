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

  // Accessible inline-SVG line chart for a deep-dive "chart" spec:
  //   { title, caption, yLabel, cap?, capLabel?, xs:[..], series:[{label,color,values:[..]}],
  //     markers?:[{x, label, color?}] }
  // Colors default to the site palette (forest/rust/gold). Pure function of the
  // data; no libraries. viewBox-scaled so it's responsive; role=img + <title>.
  function lineChartCard(c) {
    if (!c || !c.series || !c.series.length || !c.xs || !c.xs.length) return '';
    var W = 760, H = 420, ML = 58, MR = 24, MT = 24, MB = 78;
    var xs = c.xs, n = xs.length;
    var allV = c.series.reduce(function (a, s) { return a.concat(s.values); }, []);
    if (c.cap != null) allV.push(c.cap);
    var vMax = Math.max.apply(null, allV), vMin = Math.min.apply(null, allV);
    // Round the axis out a little for headroom.
    var yHi = Math.ceil(vMax / 50) * 50, yLo = Math.floor(vMin / 50) * 50;
    var PAL = ['#a0531f', '#21443c', '#b58a2c', '#2d64a8'];
    var px = function (i) { return ML + (W - ML - MR) * (n === 1 ? 0.5 : i / (n - 1)); };
    var py = function (v) { return MT + (H - MT - MB) * (1 - (v - yLo) / (yHi - yLo)); };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(c.title || 'Chart') + '" style="width:100%;height:auto;display:block">';
    svg += '<title>' + esc(c.title || 'Chart') + '</title>';
    // Y gridlines + labels
    var steps = 4;
    for (var g = 0; g <= steps; g++) {
      var yv = yLo + (yHi - yLo) * g / steps, y = py(yv);
      svg += '<line x1="' + ML + '" y1="' + y.toFixed(1) + '" x2="' + (W - MR) + '" y2="' + y.toFixed(1) + '" stroke="#e4ddcd" stroke-width="1"/>';
      svg += '<text x="' + (ML - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" font-size="12" fill="#7a8a85" font-family="sans-serif">' + Math.round(yv) + '</text>';
    }
    // X labels
    for (var i = 0; i < n; i++) {
      svg += '<text x="' + px(i).toFixed(1) + '" y="' + (H - MB + 20) + '" text-anchor="middle" font-size="12" fill="#7a8a85" font-family="sans-serif">' + esc(String(xs[i])) + '</text>';
    }
    // Cap reference line (dashed) — the key "ceiling"
    if (c.cap != null) {
      var yc = py(c.cap);
      svg += '<line x1="' + ML + '" y1="' + yc.toFixed(1) + '" x2="' + (W - MR) + '" y2="' + yc.toFixed(1) + '" stroke="#a0531f" stroke-width="2" stroke-dasharray="6 5"/>';
      svg += '<text x="' + (W - MR) + '" y="' + (yc - 7).toFixed(1) + '" text-anchor="end" font-size="12.5" font-weight="700" fill="#a0531f" font-family="sans-serif">' + esc(c.capLabel || (c.cap + ' cap')) + '</text>';
    }
    // Series lines + end labels
    c.series.forEach(function (s, si) {
      var col = s.color || PAL[si % PAL.length];
      var d = s.values.map(function (v, i) { return (i ? 'L' : 'M') + px(i).toFixed(1) + ' ' + py(v).toFixed(1); }).join(' ');
      svg += '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
      s.values.forEach(function (v, i) { svg += '<circle cx="' + px(i).toFixed(1) + '" cy="' + py(v).toFixed(1) + '" r="3.5" fill="' + col + '"/>'; });
      var lastI = n - 1;
      svg += '<text x="' + (px(lastI) - 6).toFixed(1) + '" y="' + (py(s.values[lastI]) - 8).toFixed(1) + '" text-anchor="end" font-size="12.5" font-weight="700" fill="' + col + '" font-family="sans-serif">' + esc(s.label) + '</text>';
    });
    // Crossing markers (where a line hits the cap)
    (c.markers || []).forEach(function (mk) {
      var mi = xs.indexOf(mk.x);
      if (mi < 0 || c.cap == null) return;
      var x = px(mi), y = py(c.cap);
      svg += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="6" fill="#fff" stroke="' + (mk.color || '#a0531f') + '" stroke-width="2.5"/>';
      svg += '<text x="' + x.toFixed(1) + '" y="' + (H - MB + 44) + '" text-anchor="middle" font-size="11.5" font-weight="700" fill="' + (mk.color || '#a0531f') + '" font-family="sans-serif">' + esc(mk.label) + '</text>';
    });
    if (c.yLabel) svg += '<text x="16" y="' + (MT + (H - MT - MB) / 2) + '" transform="rotate(-90 16 ' + (MT + (H - MT - MB) / 2) + ')" text-anchor="middle" font-size="12" fill="#7a8a85" font-family="sans-serif">' + esc(c.yLabel) + '</text>';
    svg += '</svg>';
    return '<div class="dd-chart card" style="padding:22px 24px;margin:0 0 26px">' +
      (c.title ? '<h3 style="font:600 20px/1.3 var(--serif);color:var(--forest);margin:0 0 4px">' + esc(c.title) + '</h3>' : '') +
      svg +
      (c.caption ? '<p style="font:400 13px/1.55 var(--sans);color:var(--muted);margin:12px 0 0">' + esc(c.caption) + '</p>' : '') + '</div>';
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
    var hero = '<header class="dd-hero' + (tall ? ' tall' : '') + (heroSrc ? '' : ' no-img') + '">' +
      (heroSrc ? '<img class="dd-hero-img" src="' + esc(heroSrc) + '" alt="' + esc(issue.heroAlt || '') + '">' : '') +
      (tall ? '' : '<div class="dd-hero-grad"></div>') + '<div class="dd-hero-text">' +
      '<div class="crumb" style="color:rgba(255,255,255,.8)"><a href="deep-dives.html" style="color:rgba(255,255,255,.8)">Deep Dives</a> <span class="sep">&rsaquo;</span> ' + esc(issue.label || key) + '</div>' +
      '<div style="margin:10px 0"><span class="tag" style="background:var(--gold);color:var(--forest)">Deep Dive</span> ' +
      '<span class="tag" style="background:rgba(255,255,255,.18);color:#fff">' + esc(issue.category || 'Land Use') + '</span></div>' +
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
    // Optional data chart right under the status card (e.g. Norwood Water's
    // supply-vs-demand projection).
    if (issue.chart) body += lineChartCard(issue.chart);
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
    // Topics can override the sidebar CTA (courts-not-hearings topics need
    // different framing than land-use ones); defaults preserve the old copy.
    var side = '<div class="dd-cta card-forest"><div class="k">' + esc(issue.ctaTitle || 'Act before it’s final') + '</div>' +
      '<p>' + esc(issue.ctaCopy || 'Public comment shapes these decisions most before the votes happen.') + '</p>' +
      '<a class="btn btn-gold" href="' + (issue.ctaHref ? esc(safe(issue.ctaHref)) : 'mailto:info@livabletelluride.org?subject=' + encodeURIComponent('Comment: ' + (issue.label || key))) + '">' + esc(issue.ctaLabel || 'How to comment') + ' &rarr;</a></div>';
    // Optional link box right below the CTA (e.g. Carhenge → the cost tracker).
    if (issue.sideBox && issue.sideBox.href) {
      var sb = issue.sideBox;
      side += '<div class="dd-card card"><h4>' + esc(sb.title || 'Related tool') + '</h4>' +
        (sb.copy ? '<p style="font:400 14.5px/1.6 var(--sans);color:var(--body2);margin:0 0 12px">' + esc(sb.copy) + '</p>' : '') +
        '<a class="btn btn-forest" href="' + esc(safe(sb.href)) + '">' + esc(sb.label || 'Open') + ' &rarr;</a></div>';
    }
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
