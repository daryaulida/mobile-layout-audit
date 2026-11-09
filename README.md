# mobile-layout-audit

[![Tests](https://github.com/daryaulida/mobile-layout-audit/actions/workflows/test.yml/badge.svg)](https://github.com/daryaulida/mobile-layout-audit/actions/workflows/test.yml)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?logo=playwright&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

A CLI that opens **every page of your sitemap in a real mobile browser** and reports the layout bugs clients notice first:

| Check | What it catches |
|---|---|
| **Horizontal scroll** | The page is wider than the phone screen |
| **Off-screen elements** | Buttons, blocks and headings sticking out of the viewport (the outermost offender, not every child) |
| **Small text** | Text below 12px, grouped by size with examples |
| **Small tap targets** | Buttons and links smaller than 24×24px (WCAG 2.2 AA). Inline links inside text are exempt |
| **Distorted images** | Images squashed or stretched compared to the file's aspect ratio |

It saves a full-page screenshot for every page with issues, plus a Markdown and JSON report.

Built from the QA tooling I use before handing over client websites (WordPress/Elementor, Bitrix, custom). It ignores common false positives: sliders clipped by `overflow: hidden`, off-canvas menus parked outside the screen, and screen-reader-only links.

## Usage

```bash
git clone https://github.com/daryaulida/mobile-layout-audit.git
cd mobile-layout-audit
npm install
npx playwright install chromium      # or use your installed Chrome: --channel chrome

node bin/cli.js https://example.com/sitemap.xml
```

```
Checking 36 page(s) at 375px…

[ 1/36] ✔ https://example.com/
[ 2/36] ✖ https://example.com/portfolio/case/  (3 issues)
…
✖ 1 of 36 page(s) have issues → report/report.md
```

The report lists every problem with the element that causes it:

```md
## https://example.com/portfolio/case/

- **Small tap target** 74×20: `a "110+ articles"`
- **Small tap target** 20×20: `a.elementor-icon`
- **Off-screen:** `div.hero-cta "Get a quote"` (left 12, right 418)

![screenshot](screenshots/example-com-portfolio-case.png)
```

### Targets

- a sitemap or a sitemap index (`/sitemap.xml`, `/sitemap_index.xml`). Nested sitemaps are followed and media URLs are skipped;
- a single page URL;
- a text file with one URL per line.

### Options

| Option | Default | |
|---|---|---|
| `--width <px>` | `375` | Viewport width (try `320` for small Androids) |
| `--limit <n>` | `200` | Max pages |
| `--concurrency <n>` | `3` | Pages checked in parallel |
| `--min-font <px>` | `12` | Smallest acceptable font size |
| `--min-tap <px>` | `24` | Smallest acceptable tap target |
| `--out <dir>` | `report` | Where `report.md`, `report.json` and screenshots go |
| `--channel <name>` | — | Use an installed browser: `chrome`, `msedge` |
| `--no-screenshots` | — | Skip screenshots |
| `--fail` | — | Exit with code `1` when issues are found, for CI |

### In CI

```yaml
- run: npx playwright install --with-deps chromium
- run: node bin/cli.js https://staging.example.com/sitemap.xml --fail
```

## How it works

1. Collects URLs from the sitemap (`src/sitemap.js`).
2. Opens each page in Chromium with a mobile viewport, touch and device pixel ratio 2. It scrolls to the bottom so lazy-loaded blocks render (`src/audit.js`).
3. Runs one self-contained check function inside the page (`src/checks.js`), which reads `getBoundingClientRect` and computed styles.
4. Writes the reports.

## Development

```bash
npm test                         # unit tests + browser tests on HTML fixtures
AUDIT_CHANNEL=chrome npm test    # run browser tests with installed Chrome
```

## License

MIT © [Daria Ulida](https://github.com/daryaulida) · [Otido](https://otido.dev)
