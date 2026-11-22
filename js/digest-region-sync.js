// Review Desk: carry edits from the visible (ALL) copy of each regional section
// into its hidden East End / West End / Ridgway-Ouray copies (Morgan 2026-10-19).
//
// The Week Ahead ships every regional section as
//   MARK all MARK hidden(East) MARK hidden(West) MARK hidden(Ridgway/Ouray) MARK
// (scripts/lib/recap-regions.js). Customer.io sends each reader their region's
// hidden copy, but the Desk only shows — and so only edits — the ALL copy. On
// 2026-10-19 a removed gondola callout and a rewritten HARC card went out
// unedited to East/West End readers because of this.
//
// syncRegions(html, baseHtml) rebuilds each hidden copy card by card: a card
// whose identity (date badge + source + title) also appears in the ALL copy is
// replaced with the ALL copy's current version; a card that was in the ALL copy
// when the Desk loaded (baseHtml) but has since been removed is dropped. Cards
// only in a regional copy are left alone. Works on DOM-serialized or raw HTML.
(function (root) {
  const MARK = '<!--LT-RGN-->';

  // [start, end) of each top-level row in the section's card table.
  function cardSpans(part) {
    const label = part.indexOf('&rarr;') >= 0 ? part.indexOf('&rarr;') : part.search(/→|&#8594;/);
    const tStart = part.slice(Math.max(0, label)).search(/<table\b/i);
    if (label < 0 || tStart < 0) return [];
    const re = /<(\/?)(table|tr)\b[^>]*>/gi;
    re.lastIndex = Math.max(0, label) + tStart;
    const spans = [];
    let tableDepth = 0, rowStart = -1, rowTableDepth = 0;
    let m;
    while ((m = re.exec(part))) {
      const close = m[1] === '/', tag = m[2].toLowerCase();
      if (tag === 'table') {
        tableDepth += close ? -1 : 1;
        if (tableDepth === 0) break;
      } else if (tableDepth === 1) {
        if (!close && rowStart < 0) { rowStart = m.index; rowTableDepth = tableDepth; }
        else if (close && rowStart >= 0 && tableDepth === rowTableDepth) { spans.push([rowStart, m.index + m[0].length]); rowStart = -1; }
      }
    }
    return spans;
  }

  function decode(s) {
    return s.replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&rsquo;|&#8217;/g, '’');
  }
  // Identity of a card: its first three text runs (date badge, source, title).
  function cardKey(card) {
    const runs = card.split(/<[^>]*>/).map((t) => decode(t).replace(/\s+/g, ' ').trim()).filter(Boolean);
    return runs.slice(0, 3).join(' | ').toLowerCase();
  }
  function cards(part) {
    return cardSpans(part).map(([s, e]) => ({ s, e, html: part.slice(s, e), key: cardKey(part.slice(s, e)) }));
  }

  function syncRegions(html, baseHtml) {
    const parts = String(html || '').split(MARK);
    const baseParts = String(baseHtml || '').split(MARK);
    const stats = { replaced: 0, removed: 0 };
    if (parts.length < 6 || (parts.length - 1) % 5 !== 0) return { html, stats };
    for (let a = 1; a < parts.length; a += 5) {
      const all = new Map(cards(parts[a]).map((c) => [c.key, c.html]));
      const baseAll = new Set(baseParts.length === parts.length ? cards(baseParts[a]).map((c) => c.key) : []);
      for (let r = a + 1; r <= a + 3; r++) {
        let p = parts[r];
        // Right to left, so earlier offsets stay valid.
        for (const c of cards(p).reverse()) {
          if (all.has(c.key)) {
            if (all.get(c.key) !== c.html) { p = p.slice(0, c.s) + all.get(c.key) + p.slice(c.e); stats.replaced++; }
          } else if (baseAll.has(c.key)) {
            p = p.slice(0, c.s) + p.slice(c.e); stats.removed++;
          }
        }
        parts[r] = p;
      }
    }
    return { html: parts.join(MARK), stats };
  }

  const api = { syncRegions, cardKey, cardSpans };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LTRegionSync = api;
})(typeof window !== 'undefined' ? window : this);
