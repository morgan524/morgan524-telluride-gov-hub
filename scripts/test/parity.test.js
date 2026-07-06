// CI guard for the parity harness (scripts/parity/capture.js). Doesn't assert
// exact output (that rots as the bot rewrites the data daily) — it runs the whole
// capture end-to-end so a BROKEN pipeline (weekly-email crash, data-file that
// won't evaluate, a getter that throws) fails the build instead of silently
// producing an empty snapshot.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');

test('parity capture runs end-to-end and produces non-trivial snapshots', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-'));
  try {
    cp.execFileSync('node', [path.join(__dirname, '..', 'parity', 'capture.js'), out], { stdio: 'ignore' });

    const digest = path.join(out, 'digest-weekly.html');
    assert.ok(fs.existsSync(digest), 'digest-weekly.html should be rendered');
    assert.ok(fs.statSync(digest).size > 2000, 'the rendered digest should be non-trivial');

    const county = JSON.parse(fs.readFileSync(path.join(out, 'getCountyCachedMeetings.json'), 'utf8'));
    assert.ok(Array.isArray(county), 'getCountyCachedMeetings snapshot should be an array');

    // A getter that started throwing would show up as {error:…} instead of an array.
    for (const f of ['getTellurideMeetings.json', 'getMeetingSummary.json', 'resolveEventImage.json']) {
      const parsed = JSON.parse(fs.readFileSync(path.join(out, f), 'utf8'));
      assert.ok(!parsed.error, `${f} captured without error (got: ${parsed.error || 'ok'})`);
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
