#!/usr/bin/env python3
# ══════════════════════════════════════════════════════════════
# ONE-SHOT: redesign cutover — run from repo root on a FRESH branch
# cut from the latest main. Deterministic re-run of the moves that
# were rehearsed on the (now stale) redesign-cutover branch:
#
#   1. every redesign/ page → root, old page → *-legacy.html
#   2. lt.css / site.js / deep-dive.js / uploads/ / fonts/ → root
#   3. staged map + hub-bub copies replace live pages in place
#   4. strip staging noindex; add favicon/manifest/canonical/OG heads
#   5. sw.js → self-destructing worker
#   6. Submit-an-event button → events-legacy.html#submit-event
#      (native modal port is a post-launch task)
#
# Verifies as it goes; any assertion failure = stop and investigate.
# After it passes: run tests + link sweep, merge to main, push.
# ══════════════════════════════════════════════════════════════
import pathlib, re, subprocess, sys

root = pathlib.Path('.')
assert (root / 'redesign').is_dir(), 'run from repo root, redesign/ must exist'

def run(*a):
    subprocess.run(a, check=True)

PAGES = ['index', 'about', 'donate', 'events', 'gov-hub', 'gov-hub-past', 'deep-dives',
         'deep-dive-carhenge', 'deep-dive-code', 'deep-dive-diamond', 'deep-dive-gondola',
         'deep-dive-society', 'deep-dive-wildfire', 'housing', 'hub-bub',
         'legal-notices', 'local-news', 'local-orgs']

# 1+2+3: moves (legacy fallbacks first)
for p in PAGES:
    live = root / (p + '.html')
    if live.exists():
        run('git', 'mv', str(live), p + '-legacy.html')
for p in PAGES:
    src = root / 'redesign' / (p + '.html')
    if src.exists():
        run('git', 'mv', str(src), p + '.html')
for asset in ['lt.css', 'site.js', 'deep-dive.js', 'uploads', 'fonts']:
    run('git', 'mv', 'redesign/' + asset, asset)
for app in ['zoning-map', 'projects-map']:
    run('git', 'mv', f'{app}/index.html', f'{app}/index-legacy.html')
    run('git', 'mv', f'redesign/{app}/index.html', f'{app}/index.html')

# 4: head pass on the flat redesign pages
OG_IMG = 'https://livabletelluride.org/logo/Livable%20Telluride%20Logo.png'
for p in PAGES:
    if p == 'hub-bub':
        continue  # carries its own live head; noindex handled below
    f = pathlib.Path(p + '.html')
    s = f.read_text()
    s = re.sub(r'<!-- STAGING: remove noindex at cutover -->\n<meta name="robots" content="noindex">\n', '', s)
    url = 'https://livabletelluride.org/' if p == 'index' else f'https://livabletelluride.org/{p}.html'
    title = re.search(r'<title>([^<]*)</title>', s).group(1)
    dm = re.search(r'<meta name="description" content="([^"]*)">', s)
    desc = dm.group(1) if dm else ''
    head = (f'<link rel="icon" href="/logo/icon-192.png">\n'
            f'<link rel="apple-touch-icon" href="/logo/apple-touch-icon.png">\n'
            f'<link rel="manifest" href="/manifest.json">\n'
            f'<link rel="canonical" href="{url}">\n'
            f'<meta property="og:type" content="website">\n'
            f'<meta property="og:site_name" content="Livable Telluride">\n'
            f'<meta property="og:url" content="{url}">\n'
            f'<meta property="og:title" content="{title}">\n'
            f'<meta property="og:description" content="{desc}">\n'
            f'<meta property="og:image" content="{OG_IMG}">')
    assert '<link rel="icon" href="uploads/lt-logo.png">' in s, p
    s = s.replace('<link rel="icon" href="uploads/lt-logo.png">', head)
    f.write_text(s)

for p in ['hub-bub.html', 'zoning-map/index.html', 'projects-map/index.html']:
    f = pathlib.Path(p)
    s = f.read_text()
    s = re.sub(r'<meta name="robots" content="noindex"><!-- STAGING: remove at cutover -->\n(  )?', '', s)
    s = re.sub(r'<!-- STAGING: remove noindex at cutover -->\n<meta name="robots" content="noindex">\n', '', s)
    f.write_text(s)

# 5: retire the service worker
pathlib.Path('sw.js').write_text('''// Livable Telluride service worker — RETIRED at the 2026 redesign cutover.
// No page registers a service worker anymore; this file exists only so any
// long-ago registration still controlling a browser self-destructs: it takes
// over immediately, deletes every cache, unregisters itself, and reloads the
// open tabs so they fetch the new site directly from the network.
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((c) => c.navigate(c.url));
  })());
});
''')

# 6: submit-event button → the legacy page that still hosts the form
ev = pathlib.Path('events.html')
s = ev.read_text()
old = 'href="https://livabletelluride.org/events.html#submit-event"'
assert old in s, 'submit button anchor not found'
s = s.replace(old, 'href="/events-legacy.html#submit-event"')
ev.write_text(s)

# final assertions
for p in PAGES:
    s = pathlib.Path(p + '.html').read_text()
    assert 'noindex' not in s or p in (), f'{p}: noindex left behind'
    assert 'id="lt-header"' in s, f'{p}: not a shell page?'
leftover = [str(x) for x in (root / 'redesign').rglob('*') if x.is_file()]
assert not leftover, f'redesign/ leftovers: {leftover}'
print('CUTOVER MOVES COMPLETE — run tests + link sweep, then commit.')
