'use strict';
const fs = require('fs');
const path = require('path');
const { inspectPage, countIssues } = require('./checks');

/** Scrolls through the page so lazy-loaded blocks and animations render before checks run. */
async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = innerHeight * 0.8;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 80));
    }
    scrollTo(0, 0);
  });
}

const slug = (url) => url.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 80) || 'page';

/**
 * Audits every URL with a mobile viewport.
 * @returns {Promise<Array<{url:string, issues:number}>>}
 */
async function runAudit(urls, opts = {}) {
  const {
    width = 375, height = 812, concurrency = 3, outDir = 'report', screenshots = true, channel,
    minFontPx = 12, minTapPx = 24, timeout = 60000, onResult = () => {},
  } = opts;
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, ...(channel && { channel }) });
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 mobile-layout-audit',
  });
  if (screenshots) fs.mkdirSync(path.join(outDir, 'screenshots'), { recursive: true });

  const results = new Array(urls.length);
  let next = 0;
  async function worker() {
    const page = await context.newPage();
    while (next < urls.length) {
      const i = next++;
      const url = urls[i];
      let result;
      try {
        await page.goto(url, { waitUntil: 'load', timeout });
        await scrollThrough(page);
        await page.waitForTimeout(300);
        result = { url, ...(await page.evaluate(inspectPage, { minFontPx, minTapPx })) };
        result.issues = countIssues(result);
        if (screenshots && result.issues) {
          const file = path.join('screenshots', slug(url) + '.png');
          await page.screenshot({ path: path.join(outDir, file), fullPage: true });
          result.screenshot = file;
        }
      } catch (e) {
        result = { url, error: e.message.split('\n')[0], issues: 1 };
      }
      results[i] = result;
      onResult(result, i);
    }
    await page.close();
  }
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  } finally {
    await browser.close();
  }
  return results;
}

/** Builds a readable Markdown report. */
function toMarkdown(results, { width = 375 } = {}) {
  const bad = results.filter((r) => r.issues);
  const lines = [
    `# Mobile layout audit`,
    '',
    `Viewport: **${width}px** · Pages checked: **${results.length}** · Pages with issues: **${bad.length}**`,
    '',
  ];
  if (!bad.length) return lines.concat('✅ No layout issues found.').join('\n') + '\n';
  lines.push('| Page | H-scroll | Off-screen | Small text | Small tap targets | Distorted images |', '|---|---|---|---|---|---|');
  for (const r of bad) {
    if (r.error) { lines.push(`| ${r.url} | error: ${r.error} | | | | |`); continue; }
    lines.push(`| ${r.url} | ${r.horizontalScroll ? `+${r.horizontalScroll}px` : '—'} | ${r.offscreen.length || '—'} | ${r.smallText.length ? r.smallText.map((f) => f.fontSize + 'px').join(', ') : '—'} | ${r.smallTapTargets.length || '—'} | ${r.distortedImages.length || '—'} |`);
  }
  for (const r of bad.filter((x) => !x.error)) {
    lines.push('', `## ${r.url}`, '');
    if (r.horizontalScroll) lines.push(`- **Horizontal scroll:** page is ${r.horizontalScroll}px wider than the screen`);
    for (const o of r.offscreen) lines.push(`- **Off-screen:** \`${o.el}\` (left ${o.left}, right ${o.right})`);
    for (const f of r.smallText) lines.push(`- **Small text ${f.fontSize}px** ×${f.count}: ${f.samples.map((s) => '`' + s + '`').join(', ')}`);
    for (const t of r.smallTapTargets) lines.push(`- **Small tap target** ${t.width}×${t.height}: \`${t.el}\``);
    for (const d of r.distortedImages) lines.push(`- **Distorted image** ${d.distortion}: \`${d.src}\``);
    if (r.screenshot) lines.push('', `![screenshot](${r.screenshot.replace(/\\/g, '/')})`);
  }
  return lines.join('\n') + '\n';
}

module.exports = { runAudit, toMarkdown, slug };
