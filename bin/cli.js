#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { collectUrls } = require('../src/sitemap');
const { runAudit, toMarkdown } = require('../src/audit');

const HELP = `
mobile-layout-audit <target> [options]

  <target>            sitemap URL (…/sitemap.xml or sitemap index), a single page URL,
                      or a text file with one URL per line

Options:
  --width <px>        viewport width (default 375)
  --limit <n>         max pages to check (default 200)
  --concurrency <n>   pages in parallel (default 3)
  --min-font <px>     smallest acceptable font size (default 12)
  --min-tap <px>      smallest acceptable tap target (default 24, WCAG 2.2 AA)
  --out <dir>         report folder (default ./report)
  --channel <name>    use an installed browser, e.g. "chrome" or "msedge"
  --no-screenshots    do not save screenshots of pages with issues
  --fail              exit with code 1 when issues are found (for CI)
  -h, --help          show this help
`;

function parseArgs(argv) {
  const o = { width: 375, limit: 200, concurrency: 3, minFont: 12, minTap: 24, out: 'report', screenshots: true, fail: false };
  const num = (v, name) => { const n = Number(v); if (!Number.isFinite(n) || n <= 0) throw new Error(`--${name} expects a positive number`); return n; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '-h': case '--help': o.help = true; break;
      case '--width': o.width = num(argv[++i], 'width'); break;
      case '--limit': o.limit = num(argv[++i], 'limit'); break;
      case '--concurrency': o.concurrency = num(argv[++i], 'concurrency'); break;
      case '--min-font': o.minFont = num(argv[++i], 'min-font'); break;
      case '--min-tap': o.minTap = num(argv[++i], 'min-tap'); break;
      case '--out': o.out = argv[++i]; break;
      case '--channel': o.channel = argv[++i]; break;
      case '--no-screenshots': o.screenshots = false; break;
      case '--fail': o.fail = true; break;
      default:
        if (a.startsWith('-')) throw new Error(`Unknown option ${a}`);
        o.target = a;
    }
  }
  return o;
}

async function resolveTargets(target, limit) {
  if (/^https?:\/\//.test(target)) {
    return /\.xml(\?|$)/i.test(target) ? collectUrls(target, { limit }) : [target];
  }
  const lines = fs.readFileSync(target, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s));
  return [...new Set(lines)].slice(0, limit);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || !o.target) { console.log(HELP); process.exit(o.help ? 0 : 2); }
  const urls = await resolveTargets(o.target, o.limit);
  if (!urls.length) throw new Error('No URLs to check');
  console.log(`Checking ${urls.length} page(s) at ${o.width}px…\n`);
  let done = 0;
  const results = await runAudit(urls, {
    width: o.width, concurrency: o.concurrency, outDir: o.out, screenshots: o.screenshots,
    channel: o.channel, minFontPx: o.minFont, minTapPx: o.minTap,
    onResult: (r) => console.log(`[${String(++done).padStart(String(urls.length).length)}/${urls.length}] ${r.issues ? '✖' : '✔'} ${r.url}${r.error ? '  ' + r.error : r.issues ? `  (${r.issues} issue${r.issues > 1 ? 's' : ''})` : ''}`),
  });
  fs.mkdirSync(o.out, { recursive: true });
  fs.writeFileSync(path.join(o.out, 'report.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(o.out, 'report.md'), toMarkdown(results, { width: o.width }));
  const bad = results.filter((r) => r.issues).length;
  console.log(`\n${bad ? `✖ ${bad} of ${results.length} page(s) have issues` : '✔ All pages look good'} → ${path.join(o.out, 'report.md')}`);
  if (o.fail && bad) process.exit(1);
}

if (require.main === module) main().catch((e) => { console.error('Error:', e.message); process.exit(2); });

module.exports = { parseArgs };
