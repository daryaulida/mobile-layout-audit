'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { runAudit, toMarkdown } = require('../src/audit');

const fixture = (name) => pathToFileURL(path.join(__dirname, 'fixtures', name)).href;
// Set AUDIT_CHANNEL=chrome to use an installed Chrome instead of the Playwright browser.
const channel = process.env.AUDIT_CHANNEL || undefined;

test('finds layout problems on a broken page and none on a clean one', { timeout: 120000 }, async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mla-'));
  const [broken, clean] = await runAudit([fixture('broken.html'), fixture('clean.html')], { outDir, channel, concurrency: 1 });

  assert.ok(broken.horizontalScroll > 200, 'horizontal scroll detected');
  assert.ok(broken.offscreen.some((o) => o.el.startsWith('div#wide')), 'wide block reported');
  assert.ok(!broken.offscreen.some((o) => o.el.includes('track')), 'clipped slider ignored');
  assert.deepStrictEqual(broken.smallText.map((f) => f.fontSize), [9]);
  assert.ok(broken.smallTapTargets.some((t) => t.el.includes('icon-btn')), 'tiny icon button reported');
  assert.ok(!broken.smallTapTargets.some((t) => t.el.includes('links in text')), 'inline link exempt');
  assert.strictEqual(broken.distortedImages.length, 1);
  assert.ok(fs.existsSync(path.join(outDir, broken.screenshot)), 'screenshot saved');

  assert.strictEqual(clean.issues, 0, JSON.stringify(clean, null, 1));

  const md = toMarkdown([broken, clean]);
  assert.match(md, /Pages with issues: \*\*1\*\*/);
  assert.match(md, /Small text 9px/);
});
