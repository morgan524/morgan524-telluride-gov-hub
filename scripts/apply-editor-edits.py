#!/usr/bin/env python3
"""
apply-editor-edits.py — apply an editor's (John/Emily) tracked-change edits from
a Word doc back onto the sendable digest HTML (digest/week.html or
digest/past.html), preserving all styling, images and hidden regional copies.

The Word doc is produced by scripts/editor-docx.py from the SAME content the
email renders, so an edit maps cleanly: this reads each paragraph's tracked
revisions (original = reject all, final = accept all) and replaces the original
text with the final text everywhere it appears in the email — entity-encoding
exactly as weekly-email.js does so the match lands.

Whole-paragraph pairs whose text is interrupted in the email by inline tags
(<strong> in the lede, bold $ amounts, links) won't match; those are reported
as UNMATCHED and handled with an --extra JSON file of {orig,final} fragments
(same shape) that is applied after the automatic pass.

Usage:
  python3 scripts/apply-editor-edits.py --docx EDITED.docx --base digest/week.html \\
          --out /tmp/week.edited.html [--extra extra-pairs.json]

Exit 0 and prints a report; non-zero only on a hard error (bad args/files).
UNMATCHED pairs are reported but do not fail the run — review the report.
"""
import argparse
import json
import re
import zipfile
import xml.etree.ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def docx_pairs(path):
    """Return [{orig, final}] for each paragraph that carries tracked changes."""
    z = zipfile.ZipFile(path)
    doc = ET.fromstring(z.read('word/document.xml'))
    body = doc.find(W + 'body')
    pairs = []

    def walk(el, in_ins, in_del, orig, final):
        for ch in el:
            tag = ch.tag
            if tag == W + 'ins':
                walk(ch, True, in_del, orig, final)
            elif tag == W + 'del':
                walk(ch, in_ins, True, orig, final)
            elif tag == W + 't':
                t = ch.text or ''
                if not in_del:
                    final.append(t)
                if not in_ins:
                    orig.append(t)
            elif tag == W + 'delText':
                t = ch.text or ''
                if not in_ins:
                    orig.append(t)
            else:
                walk(ch, in_ins, in_del, orig, final)

    for p in body.findall(W + 'p'):
        o, f = [], []
        walk(p, False, False, o, f)
        os_, fs_ = ''.join(o).strip(), ''.join(f).strip()
        if os_ != fs_ and (os_ or fs_):
            pairs.append({'orig': os_, 'final': fs_})
    return pairs


def esc(s):
    """Mirror weekly-email.js esc(): &#039;→' then <>"→entities then &→&amp;."""
    s = s.replace('&#039;', "'").replace('&#39;', "'")
    s = s.replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')
    # &→&amp; but not an existing entity (&amp; &lt; &gt; &quot;)
    return re.sub(r'&(?!amp;|lt;|gt;|quot;)', '&amp;', s)


def enc(s):
    """esc() then encode every codepoint >127 as a numeric entity (ASCII-only)."""
    s = esc(s)
    return ''.join('&#%d;' % ord(c) if ord(c) > 127 else c for c in s)


def apply_pairs(html, pairs, label, report):
    for i, p in enumerate(pairs, 1):
        o, f = enc(p['orig']), enc(p['final'])
        n = html.count(o)
        if n > 0:
            html = html.replace(o, f)
            report.append((label, i, n, 'applied', p['final'][:55]))
        else:
            report.append((label, i, 0, 'UNMATCHED', p['orig'][:70]))
    return html


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--docx', required=True)
    ap.add_argument('--base', required=True, help='digest/week.html or digest/past.html')
    ap.add_argument('--out', required=True)
    ap.add_argument('--extra', help='optional JSON file of [{orig,final}] fragment pairs')
    args = ap.parse_args()

    with open(args.base, encoding='utf-8') as fh:
        html = fh.read()

    report = []
    auto = docx_pairs(args.docx)
    html = apply_pairs(html, auto, 'auto', report)

    extra = []
    if args.extra:
        with open(args.extra, encoding='utf-8') as fh:
            extra = json.load(fh)
        html = apply_pairs(html, extra, 'extra', report)

    with open(args.out, 'w', encoding='utf-8') as fh:
        fh.write(html)

    applied = [r for r in report if r[3] == 'applied']
    unmatched = [r for r in report if r[3] == 'UNMATCHED']
    print('APPLIED %d/%d pairs (%d auto, %d extra); %d occurrences replaced'
          % (len(applied), len(auto) + len(extra), len(auto), len(extra),
             sum(r[2] for r in applied)))
    for r in applied:
        print('  ok  [%s #%d x%d]  %s...' % (r[0], r[1], r[2], r[4]))
    if unmatched:
        print('\nUNMATCHED %d (handle via --extra fragments):' % len(unmatched))
        for r in unmatched:
            print('  --  [%s #%d]  %s...' % (r[0], r[1], r[4]))
    print('\nwrote', args.out)


if __name__ == '__main__':
    main()
