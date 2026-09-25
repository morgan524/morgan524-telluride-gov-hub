// Defensive normalization for the bot's scraped data, extracted from
// content-refresh.js so it can be unit-tested. Two pure functions:
//   sanitizeRecords(arr)            — per-array cleanup at the write funnel
//   filterMvConflicts(mv, trusted)  — cross-source Mountain Village reconcile
// See docs/content-review.md for the rationale behind each rule.

// Applied to EVERY array right before it's written to the data file (via
// replaceJsValue → serializeArray). Fixes recurring upstream-source quirks at
// the single write funnel so they self-heal on each refresh instead of needing
// manual edits the next scrape would revert. All rules are field-gated, so
// non-event/meeting arrays pass through untouched.
function sanitizeRecords(arr) {
  if (!Array.isArray(arr)) return arr;
  const tokenKey = (t) => String(t).toLowerCase()
    .replace(/&[a-z]+;|&#\d+;/g, ' ').replace(/[^a-z0-9]+/g, ' ')
    .trim().split(' ').filter(Boolean).sort().join(' ');
  const norm = (t) => String(t).toLowerCase().replace(/\s+/g, ' ').trim();
  const dateIso = (o) => {
    const d = o.date || o.pubDate || o.startDate;
    if (!d) return '';
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const p = Date.parse(String(d));
    return isNaN(p) ? '' : new Date(p).toISOString().slice(0, 10);
  };
  const firstTitleByKey = new Map();
  const exactSeen = new Set();
  const out = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { out.push(item); continue; }
    const o = { ...item };

    // (1) Collapse an immediately-repeated noise word in titles, e.g. the
    //     Norwood feed's "…District Meeting Meeting" → "…District Meeting".
    //     Scoped to a known word set so legit doublings (Walla Walla) survive.
    if (typeof o.title === 'string') {
      o.title = o.title
        .replace(/\b(Meeting|Event|Concert|Workshop|Festival|Show|Session|Class|Gathering|Service|Market|Forum)\s+\1\b/gi, '$1')
        // (1a) Collapse a repeated trailing venue phrase. The Ouray/Ridgway
        //      Localist feed appends the venue to a title that already ends
        //      with it: "First Friday at Rootwings Art at Rootwings Art".
        //      Anchored on a leading preposition and required to run to the end
        //      of the string, so a legitimately doubled name is untouched --
        //      "New York, New York" and "Bye Bye Birdie" have no " at "/" in "
        //      to match, and "Jazz at Lincoln Center" has nothing repeated.
        .replace(/(\s+(?:at|@|in)\s+\S[^]*?)\1+$/i, '$1')
        .replace(/\s{2,}/g, ' ').trim();
    }

    // (1b) Repair scheme-less links — some scrapers store "www.x.org" or
    //      "ocrhm.org", which render as broken relative links on our domain.
    //      Prepend https:// when the value looks like a bare domain.
    for (const f of ['link', 'href', 'url']) {
      if (typeof o[f] === 'string' && o[f] &&
          !/^https?:\/\//i.test(o[f]) && !/^(mailto|tel):/i.test(o[f]) &&
          /^([a-z0-9-]+\.)+[a-z]{2,}([/?#]|$)/i.test(o[f].trim())) {
        o[f] = 'https://' + o[f].trim();
      }
    }

    // (2) Drop an endDate that's clearly a wrong-year scrape (same month+day,
    //     later year — e.g. start 2026-07-04, end "2027-07-04") or that lands
    //     before the start. serializeArray omits undefined, so deleting is safe.
    if (o.endDate) {
      const s = dateIso(o);
      const eM = String(o.endDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (s && eM) {
        const eIso = `${eM[1]}-${eM[2]}-${eM[3]}`;
        if ((eIso.slice(5) === s.slice(5) && eIso.slice(0, 4) > s.slice(0, 4)) || eIso < s) {
          delete o.endDate;
        }
      }
    }

    if (o.title) {
      const dk = dateIso(o);
      const link = String(o.link || o.href || o.url || '');

      // (3a) Exact duplicate — identical date + title + link → drop the
      //      redundant copy. Requiring the link to match keeps legitimately
      //      distinct same-title items (two letters-to-editor with different
      //      URLs; KOTO "…/1/" vs "…/2/" sessions) intact.
      const exactK = dk + '|' + norm(o.title) + '|' + link;
      if (exactSeen.has(exactK)) continue;
      exactSeen.add(exactK);

      // (3b) Same-date title REORDERING — CivicWeb lists a joint meeting once
      //      per body ("HARC and P&Z" vs "P&Z and HARC") with different agenda
      //      URLs. Same date + same word-set but a DIFFERENT original title →
      //      drop the later one. Identical titles are left to (3a). See memory:
      //      weekly-email-dedup-joint-meetings.
      const rk = dk + '|' + tokenKey(o.title);
      const first = firstTitleByKey.get(rk);
      if (first === undefined) firstTitleByKey.set(rk, norm(o.title));
      else if (first !== norm(o.title)) continue;
    }

    out.push(o);
  }
  return out;
}

// Tier-2 cross-source reconciliation: Mountain Village's calendar is a known
// source of WRONG dates (it mirrors events a day off). When a TRUSTED source
// (KOTO, Sheridan, Telluride.com, Telluride Science) lists the same event
// within a few days on a DIFFERENT date, drop the Mountain Village copy — the
// event still shows (from the trusted source on its correct date); only the
// wrong-date duplicate is suppressed. Same-date overlaps are left for the
// render-time dedup. See memory: mv-calendar-wrong-dates / docs/content-review.md.
function filterMvConflicts(mvArr, trustedArrs) {
  const tokenKey = (t) => String(t).toLowerCase()
    .replace(/&[a-z]+;|&#\d+;/g, ' ').replace(/[^a-z0-9]+/g, ' ')
    .trim().split(' ').filter(Boolean).sort().join(' ');
  const iso = (o) => {
    const d = o && (o.date || o.pubDate || o.startDate);
    if (!d) return null;
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const p = Date.parse(String(d));
    return isNaN(p) ? null : new Date(p).toISOString().slice(0, 10);
  };
  const trusted = new Map();   // tokenKey → Set(isoDate)
  for (const arr of trustedArrs) for (const o of (arr || [])) {
    const i = iso(o);
    if (!o || !o.title || !i) continue;
    const k = tokenKey(o.title);
    if (k.length < 6) continue;
    if (!trusted.has(k)) trusted.set(k, new Set());
    trusted.get(k).add(i);
  }
  const dropped = [];
  const kept = (mvArr || []).filter(o => {
    const i = iso(o);
    if (!o || !o.title || !i) return true;
    const k = tokenKey(o.title);
    if (k.length < 6) return true;
    const dates = trusted.get(k);
    if (!dates || dates.has(i)) return true;   // unknown to trusted, or same date → keep
    for (const td of dates) {
      const diff = Math.abs((Date.parse(td) - Date.parse(i)) / 86400000);
      if (diff >= 1 && diff <= 3) { dropped.push({ title: o.title, mvDate: i, trustedDate: td }); return false; }
    }
    return true;
  });
  return { kept, dropped };
}

module.exports = { sanitizeRecords, filterMvConflicts };
