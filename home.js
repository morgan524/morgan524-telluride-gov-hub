/* Homepage (2026-10 redesign; was home-v16.js). Fills the v16 template from
   the same live sources as home-draft.html:
   - The Week Ahead + featured events: the Week Ahead newsletter SENT for the
     current week (digest/archive/<Monday>-weekly.html), so the page uses the
     approved language subscribers got (the green bar links to it). Falls back to
     digest/week.html (only if it covers this week), then data/week-meetings.json.
   - Featured meeting in The Week Ahead: data/featured-action.json picks it.
   - Blog rail: data/blog-posts.json
   - Seven-day events strip: data/events-index.json
   - Deep dives: data/land-use-issues.json
   - Past-meeting cards: data/meeting-recaps.json
   Opened from disk, data comes from production (same rule as LTData). */
(function () {
  'use strict';
  var E = LTData.esc;
  var $ = function (id) { return document.getElementById(id); };
  var safe = function (u) { return LTData.safeUrl ? LTData.safeUrl(u, '#') : (u || '#'); };
  var ORIGIN = /^https?:$/.test(location.protocol) ? '' : 'https://livabletelluride.org';
  var clip = function (s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s; };
  var strip = function (h) { var d = document.createElement('div'); d.innerHTML = String(h || ''); return d.textContent || ''; };
  var MON = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  var MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  var DOWLONG = { MON: 'MONDAY', TUE: 'TUESDAY', WED: 'WEDNESDAY', THU: 'THURSDAY', FRI: 'FRIDAY', SAT: 'SATURDAY', SUN: 'SUNDAY' };
  // Key bodies get top billing (same list as home-draft / Past Meetings).
  var KEY = /telluride.*(town council|planning|zoning|harc)|county commissioners|bocc|planning commission|mountain village.*(town council|design review)/i;
  var err = function (el, e) { if (el) el.innerHTML = '<div class="lt-err"><strong>This section failed to load.</strong> Please refresh in a minute.</div>'; console.error('[home-v16]', e); };

  // Week dates (calendar math in UTC so no timezone skew).
  function weekDays(startKey) {
    var p = startKey.split('-').map(Number), out = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + i));
      out.push({ key: d.toISOString().slice(0, 10), dow: DOW[d.getUTCDay()], day: d.getUTCDate(), mon: d.getUTCMonth(), year: d.getUTCFullYear() });
    }
    return out;
  }
  function mondayKey() {
    var t = LTData.todayMT ? LTData.todayMT() : new Date().toISOString().slice(0, 10);
    var p = String(t).slice(0, 10).split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }

  // ── Digest parsing (same approach as home-draft.html) ──────────────────
  function sectionRows(doc, label) {
    var hdr = Array.prototype.find.call(doc.querySelectorAll('div'), function (d) {
      return d.children.length === 0 && d.textContent.replace(/\s+/g, ' ').trim() === '→ ' + label;
    });
    if (!hdr || !hdr.nextElementSibling) return [];
    return Array.prototype.filter.call(hdr.nextElementSibling.querySelectorAll(':scope > tbody > tr, :scope > tr'), function (tr) {
      return tr.querySelector('div[style*="Georgia"]');
    });
  }
  function cardParts(tr) {
    var spans = tr.querySelectorAll('span');
    var title = tr.querySelector('div[style*="Georgia"]');
    var a = title && title.querySelector('a');
    var sum = title && title.nextElementSibling;
    var why = Array.prototype.find.call(tr.querySelectorAll('div'), function (d) { return /Why This Matters/i.test(d.textContent) && d.children.length === 0; });
    var img = tr.querySelector('img');
    var links = Array.prototype.map.call(tr.querySelectorAll('a'), function (x) { return { t: x.textContent.trim(), h: x.getAttribute('href') }; });
    var badge = spans[0] ? spans[0].textContent.trim() : '';
    var m = badge.match(/^([A-Z]{3}),?\s+([A-Z]{3})\s+(\d{1,2})/i);
    return {
      badge: badge,
      dow: m ? m[1].toUpperCase() : '',
      dayNum: m ? Number(m[3]) : null,
      time: (badge.split('·')[1] || '').trim(),
      src: spans[1] ? spans[1].textContent.replace('📍', '').trim() : '',
      title: title ? title.textContent.trim() : '',
      href: a ? a.getAttribute('href') : '',
      summary: sum ? strip(sum.innerHTML) : '',
      why: why && why.nextElementSibling ? why.nextElementSibling.textContent.replace(/Read the full Deep Dive.*$/, '').trim() : '',
      img: img && /^https?:/.test(img.getAttribute('src') || '') ? img.getAttribute('src') : '',
      agenda: (links.find(function (l) { return /agenda/i.test(l.t); }) || {}).h || '',
    };
  }

  // ── Week header ────────────────────────────────────────────────────────
  function renderWeekHeader(days) {
    var a = days[0], b = days[6];
    var range = MON3[a.mon] + ' ' + a.day + '–' + (a.mon === b.mon ? '' : MON3[b.mon] + ' ') + b.day;
    if ($('wk-range')) $('wk-range').textContent = range;
    $('wk-label').textContent = 'CIVIC BRIEFING  /  WEEK OF ' + MON3[a.mon].toUpperCase() + ' ' + a.day;
    $('wk-days').textContent = a.day + '—' + b.day;
    $('wk-month').textContent = (a.mon === b.mon ? MON[a.mon] : MON[a.mon].slice(0, 3) + '–' + MON[b.mon].slice(0, 3)) + ' ' + a.year;
  }

  // ── Week Ahead meetings ────────────────────────────────────────────────
  // Six meeting spots: Town of Telluride and San Miguel County first, then key
  // bodies (Council, P&Z, HARC, BOCC), then ones with a write-up; meetings that
  // already happened this week rank after upcoming ones. Shown in date order.
  var HOME = /town of telluride|^telluride|san miguel county/i;
  var MEETING_SLOTS = 6;
  var normTitle = function (m) {
    return String(m.title || '').toLowerCase().replace(String(m.src || '').toLowerCase(), '')
      .replace(/town of telluride|san miguel county|\bmeeting\b/g, '').replace(/[^a-z]+/g, ' ').trim();
  };
  function pickMeetings(meets, count) {
    var today = LTData.todayMT ? LTData.todayMT() : '';
    var isKey = function (m) { return KEY.test(m.title + ' ' + m.src); };
    var rank = function (m) { return (m.key && m.key < today ? 8 : 0) + (HOME.test(m.src) ? 0 : 4) + (isKey(m) ? 0 : 2) + (m.why || m.summary ? 0 : 1); };
    return meets.map(function (m, i) { return { m: m, r: rank(m), i: i }; })
      .sort(function (x, y) { return x.r - y.r || x.i - y.i; })
      .slice(0, count).map(function (x) { return x.m; });
  }
  function commentLink(m) {
    if (!m.commentEmail) return '';
    var subj = 'Public comment: ' + m.title + (m.key ? ' (' + m.key + ')' : '');
    return '<a class="wk-comment" href="mailto:' + E(m.commentEmail) + '?subject=' + encodeURIComponent(subj) + '">Email a comment</a>';
  }
  // Every meeting gets an agenda button: the agenda when posted, else the
  // meeting page, else a greyed "not posted yet" marker.
  function agendaBtn(m) {
    if (m.agenda) return '<a class="wk-agenda" href="' + E(safe(m.agenda)) + '" rel="noopener" target="_blank">Agenda →</a>';
    if (m.href) return '<a class="wk-agenda ghost" href="' + E(safe(m.href)) + '" rel="noopener" target="_blank">Meeting info →</a>';
    return '<span aria-disabled="true" class="wk-agenda off">Agenda not posted yet</span>';
  }
  function meetingActs(m) { return '<div class="wk-acts">' + agendaBtn(m) + commentLink(m) + '</div>'; }
  // The featured meeting: this week's Featured Action meeting when it falls in
  // the week and hasn't happened yet (Shandoka P&Z, Oct 22), else the top pick.
  function isFeatured(m, fa) {
    var fm = fa && fa.meeting;
    return !!(fm && m.key === fm.date && normTitle(m) === normTitle({ title: fm.title, src: fm.sourceLabel }));
  }
  function renderMeetings(meets, days, fa) {
    var byDate = function (x, y) { return String(x.key).localeCompare(String(y.key)) || meets.indexOf(x) - meets.indexOf(y); };
    if (!meets.length) {
      $('wk-feature').innerHTML = '<div class="lt-empty">No public meetings are listed for this week yet.</div>';
      $('wk-daygrid').innerHTML = '';
      return;
    }
    var big = meets.filter(function (m) { return isFeatured(m, fa); })[0] || pickMeetings(meets, 1)[0];
    var tag = isFeatured(big, fa) ? 'FEATURED THIS WEEK' : 'THE BIG ONE';
    $('wk-feature').innerHTML = '<span class="tag">' + tag + ' · ' + E(DOWLONG[big.dow] || big.dow) + (big.time ? ', ' + E(big.time) : '') + '</span>' +
      '<h4>' + E(big.title) + '</h4><p>' + E(clip(big.summary || big.why, 420)) + '</p>' +
      meetingActs(big) +
      (isFeatured(big, fa) && fa.deepDive && fa.deepDive.href ? '<a class="wk-dive" href="' + E(safe(new URL(fa.deepDive.href, (ORIGIN || location.origin) + '/').href)) + '">Read the ' + E(fa.deepDive.label) + ' deep dive →</a>' : '');
    var chosen = pickMeetings(meets.filter(function (m) { return m !== big; }), MEETING_SLOTS).sort(byDate);
    $('wk-daygrid').innerHTML = chosen.map(function (m) {
      var href = m.agenda || m.href || 'gov-hub.html';
      return '<article><span>' + E(m.dow) + ' <b>' + E(m.dayNum) + '</b>' + (m.time ? '<i>' + E(m.time) + '</i>' : '') + '</span>' +
        '<em class="wk-src">' + E(m.src) + '</em>' +
        '<h4><a href="' + E(safe(href)) + '">' + E(clip(m.title, 80)) + '</a></h4><p>' + E(clip(m.summary || m.why, 300)) + '</p>' + meetingActs(m) + '</article>';
    }).join('') + new Array(Math.max(0, MEETING_SLOTS - chosen.length) + 1).join('<article class="wk-empty" aria-hidden="true"></article>');
  }
  function meetingsFromJson(rows, days) {
    var keys = days.map(function (d) { return d.key; });
    return rows.filter(function (r) { return keys.indexOf(r.date) >= 0; }).map(function (r) {
      var d = days[keys.indexOf(r.date)];
      return { key: r.date, dow: d.dow, dayNum: d.day, time: r.time || '', src: r.sourceLabel || '', title: r.title || '', summary: r.summary || '', why: '', agenda: r.hasAgenda ? (r.agendaUrl || '') : '', href: r.link || '', commentEmail: r.commentEmail || '' };
    });
  }

  // ── Events ─────────────────────────────────────────────────────────────
  var ART = ['film', 'music', 'outdoor'];
  function eventCard(e, i) {
    var art = e.img ? '<div class="event-art photo" style="background-image:url(\'' + String(e.img).replace(/'/g, '%27') + '\')"><span>' + E(e.kind || '') + '</span></div>'
      : '<div class="event-art ' + ART[i % 3] + '"><span>' + E(e.kind || 'This week') + '</span></div>';
    return '<article class="event">' + art + '<div class="event-info"><div class="category">' + E(e.when) + '</div><h3>' + E(clip(e.title, 70)) + '</h3><p>' + E(clip(e.desc, 120)) + '</p>' +
      '<a class="story-link" href="' + E(safe(e.href || 'events.html')) + '">Event details →</a></div></article>';
  }
  var PRI = ['Festivals', 'Music', 'Arts & Film', 'Outdoors & Sports', 'Food & Drink', 'Family & Kids', 'Talks & Classes', 'Wellness', 'Community'];
  var rank = function (e) { var i = PRI.indexOf(e.type); return (i < 0 ? 9 : i) - (e.img ? 0.5 : 0); };
  // Every day box names the town; when the feed has none, read it off the venue.
  var PLACES = /\b(Mountain Village|Telluride|Ridgway|Ouray|Norwood|Ophir|Rico|Placerville|Redvale|Sawpit|Naturita|Nucla|Montrose|Silverton)\b/i;
  function eventTown(e) {
    if (e.town) return e.town;
    var m = String((e.location || '') + ' ' + (e.title || '')).match(PLACES);
    return m ? m[1].replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : 'Town TBA';
  }
  function renderWeekStrip(index, days) {
    $('ev-week').innerHTML = days.map(function (d) {
      var list = index.filter(function (e) { return e.date === d.key; }).sort(function (a, b) { return rank(a) - rank(b); });
      var e = list[0];
      var pic = e && e.img ? '<span class="day-art"><img alt="" loading="lazy" src="' + E(safe(e.img)) + '" onerror="this.parentNode.style.display=\'none\'"/></span>' : '';
      return '<a class="day-cell" href="events.html">' + pic + '<strong>' + d.dow + ' ' + d.day + '</strong>' +
        (e ? '<span class="day-town">' + E(eventTown(e)) + '</span><span>' + E(clip(e.title, 48)) + '</span>' + (list.length > 1 ? '<em>+' + (list.length - 1) + ' more</em>' : '') : '<span>—</span>') + '</a>';
    }).join('');
  }

  // ── Load everything ───────────────────────────────────────────────────
  // The newsletter actually sent for this week (archived as <Monday>-weekly.html);
  // if it isn't archived yet, the current digest — but only when it covers this
  // week (it rolls forward to next week early, which would drop this week's
  // meetings off the homepage).
  var thisMonday = mondayKey();
  var fetchText = function (u) { return fetch(ORIGIN + u + '?t=' + Date.now()).then(function (r) { if (!r.ok) throw new Error(u + ' ' + r.status); return r.text(); }); };
  var digestP = fetchText('/digest/archive/' + thisMonday + '-weekly.html')
    .then(function (html) { return { html: html, href: 'digest/archive/' + thisMonday + '-weekly.html', weekStart: thisMonday }; })
    .catch(function () {
      return Promise.all([fetch(ORIGIN + '/digest/manifest.json?t=' + Date.now()).then(function (r) { return r.json(); }), fetchText('/digest/week.html')])
        .then(function (r) {
          var w = r[0] && r[0].digests && r[0].digests.weekly || {};
          return w.weekStart === thisMonday ? { html: r[1], href: 'digest/week.html', weekStart: thisMonday } : null;
        });
    })
    .catch(function (e) { console.error('[home-v16] newsletter unavailable', e); return null; });

  Promise.all([digestP, LTData.load(['week-meetings', 'events-index', 'featured-action']).catch(function (e) { console.error(e); return {}; })]).then(function (res) {
    var dg = res[0], data = res[1] || {};
    var days = weekDays(thisMonday);
    renderWeekHeader(days);
    var doc = dg ? new DOMParser().parseFromString(dg.html, 'text/html') : null;

    // "Read the full Week Ahead" button in the green bar → the issue as sent.
    if (dg && dg.href) {
      var rd = $('wk-read');
      rd.href = new URL(dg.href, (ORIGIN || location.origin) + '/').href;
      rd.hidden = false;
    }

    // Meetings: digest first, JSON mirror as fallback.
    var meets = doc ? sectionRows(doc, 'Public Meetings This Week').map(cardParts).filter(function (m) { return m.title; }) : [];
    meets.forEach(function (m) { var d = days.filter(function (x) { return x.dow === m.dow && x.day === m.dayNum; })[0]; m.key = d ? d.key : ''; });
    if (Array.isArray(data['week-meetings'])) {
      var have = {}; meets.forEach(function (m) { have[m.dayNum + '|' + normTitle(m)] = m; });
      meetingsFromJson(data['week-meetings'], days).forEach(function (m) {
        var dup = have[m.dayNum + '|' + normTitle(m)];
        if (!dup) meets.push(m);
        // Keep the fuller write-up when the site data has more than the digest card.
        else {
          if ((m.summary || '').length > (dup.summary || '').length) dup.summary = m.summary;
          if (!dup.commentEmail) dup.commentEmail = m.commentEmail;
          if (!dup.agenda) dup.agenda = m.agenda;
          if (!dup.href) dup.href = m.href;
        }
      });
    }
    // Meetings come off 3 hours after their scheduled start (LTData.meetingOver).
    meets = meets.filter(function (m) { return !LTData.meetingOver(m.key, m.time); });
    renderMeetings(meets, days, data['featured-action']);

    // Featured events: the digest's picks, else the best of the week's index.
    var index = Array.isArray(data['events-index']) ? data['events-index'] : [];
    var picks = doc ? sectionRows(doc, 'What to Attend').map(cardParts).filter(function (e) { return e.title; }).map(function (e) {
      return { title: e.title, href: e.href, img: e.img, desc: e.summary, when: [e.badge.split('·')[0].trim(), e.src].filter(Boolean).join(' · '), kind: '' };
    }) : [];
    if (picks.length < 3) {
      var keys = days.map(function (d) { return d.key; });
      var more = index.filter(function (e) { return keys.indexOf(e.date) >= 0 && e.type !== 'Community'; }).sort(function (a, b) { return rank(a) - rank(b); });
      var seen = {}; picks.forEach(function (p) { seen[p.title.toLowerCase()] = 1; });
      more.forEach(function (e) {
        if (picks.length >= 3 || seen[e.title.toLowerCase()]) return; seen[e.title.toLowerCase()] = 1;
        var d = days[keys.indexOf(e.date)];
        picks.push({ title: e.title, href: e.href, img: e.img, desc: [e.location, e.desc && e.desc.replace(/·\s*$/, '')].filter(Boolean).join(' · '), when: d.dow + ' ' + MON3[d.mon].toUpperCase() + ' ' + d.day + (e.town ? ' · ' + e.town.toUpperCase() : ''), kind: e.type });
      });
    }
    $('ev-feat').innerHTML = picks.length ? picks.slice(0, 3).map(eventCard).join('') : '<div class="lt-empty">No featured events this week yet.</div>';
    renderWeekStrip(index, days);
  }).catch(function (e) { err($('wk-feature'), e); });

  // Blog rail
  LTData.load(['blog-posts']).then(function (d) {
    var a = (Array.isArray(d['blog-posts']) ? d['blog-posts'] : []).slice(0, 6);
    $('blog-list').innerHTML = a.map(function (p) {
      return '<a class="blog-rail-item" href="' + E(safe(p.href)) + '">' + (p.image ? '<img alt="" loading="lazy" src="' + E(safe(p.image)) + '"/>' : '<span></span>') +
        '<span class="blog-rail-text"><span class="blog-rail-date">' + E(String(p.date || '').toUpperCase()) + ' · NEWSLETTER</span><strong>' + E(p.title) + '</strong></span></a>';
    }).join('') || '<div class="lt-empty">No posts yet.</div>';
  }).catch(function (e) { err($('blog-list'), e); });

  // Deep dives
  LTData.load(['land-use-issues']).then(function (d) {
    var o = d['land-use-issues'] || {};
    var keys = Object.keys(o).sort(function (a, b) { return String(o[b].lastUpdated || '').localeCompare(String(o[a].lastUpdated || '')); }).slice(0, 3);
    $('dd-list').innerHTML = keys.map(function (k, i) {
      var x = o[k];
      var src = x.heroImage ? new URL(x.heroImage, ORIGIN || location.href).href : '';
      var art = src ? '<a class="feature-art" href="deep-dive-' + E(k) + '.html" tabindex="-1" aria-hidden="true"><img alt="" loading="lazy" src="' + E(safe(src)) + '"/></a>' : '';
      return '<article class="feature">' + art + '<div class="number">DEEP DIVE / 0' + (i + 1) + '</div><h3>' + E(x.label) + '</h3><p>' + E(clip(x.statusTitle || x.intro, 150)) + '</p>' +
        '<a class="story-link" href="deep-dive-' + E(k) + '.html">Follow the issue →</a></article>';
    }).join('') || '<div class="lt-empty">No deep dives yet.</div>';
  }).catch(function (e) { err($('dd-list'), e); });

  // Past-meeting cards: newest recap in each group, with a 50–100 word summary
  // (whole sentences until at least 50 words; hard stop at 100).
  function recapSummary(text) {
    // Split only where a sentence ends and the next begins ("$4.5 million" stays whole).
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    var sentences = t ? t.split(/(?<=[.!?]["”’)]?)\s+(?=["“(]?[A-Z0-9])/) : [];
    var out = [], n = 0;
    for (var i = 0; i < sentences.length && n < 50; i++) {
      var w = sentences[i].trim().split(' ');
      if (n + w.length > 100) { out.push(w.slice(0, 100 - n).join(' ').replace(/[,;:]$/, '') + '…'); n = 100; break; }
      out.push(sentences[i].trim()); n += w.length;
    }
    return out.join(' ');
  }
  var GROUP = { town: ['telluride', 'mv', 'ridgway', 'rico', 'ophir', 'norwood', 'ouraycity'], county: ['county', 'ouray'], svc: ['smart', 'school', 'fire', 'med', 'airport'] };
  LTData.load(['meeting-recaps']).then(function (d) {
    var r = (d['meeting-recaps'] || []).filter(function (x) { return x.recap; }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    [['town', 'rc-town'], ['county', 'rc-county'], ['svc', 'rc-svc']].forEach(function (g) {
      var inGroup = r.filter(function (m) { return GROUP[g[0]].indexOf(m.sourceKey) >= 0; });
      var x = inGroup[0];
      if (g[0] === 'town') {
        var cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
        var tell = inGroup.filter(function (m) { return m.sourceKey === 'telluride' && String(m.date) >= cutoff; })[0];
        if (tell) x = tell;   // Telluride's latest recap leads when it's recent
      }
      $(g[1]).innerHTML = x ? '<b>LATEST RECAP</b><strong class="recap-title">' + E(x.title) + '</strong><span class="recap-summary">' + E(recapSummary(x.recap)) + '</span>' : '';
      if (!x) $(g[1]).style.display = 'none';
    });
  }).catch(function (e) { console.error('[home-v16] recaps', e); ['rc-town', 'rc-county', 'rc-svc'].forEach(function (id) { $(id).style.display = 'none'; }); });
})();
