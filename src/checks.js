'use strict';

/**
 * Runs inside the page (serialized by Playwright). Must be self-contained: no closures over Node scope.
 * Returns plain JSON describing layout problems at the current viewport.
 */
function inspectPage({ minFontPx = 12, minTapPx = 24, tolerance = 2, maxItems = 15 }) {
  const vw = document.documentElement.clientWidth;
  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) { let id = el.id; try { id = decodeURIComponent(id); } catch (e) { /* keep raw id */ } s += '#' + id.slice(0, 30); }
    const cls = [...el.classList].slice(0, 2).join('.');
    if (cls) s += '.' + cls;
    const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('alt') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return text ? `${s} "${text}"` : s;
  };
  const isVisible = (el, r) => {
    if (r.width < 1 || r.height < 1 || (r.width <= 2 && r.height <= 2)) return false; // sr-only / visually hidden
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  // An element hanging out of the viewport is fine when an ancestor clips it (sliders, marquees).
  const clippedByAncestor = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(hidden|clip|auto|scroll)/.test(cs.overflowX) || /(hidden|clip)/.test(cs.overflow)) {
        const pr = p.getBoundingClientRect();
        if (pr.left >= -tolerance && pr.right <= vw + tolerance) return true;
      }
      if (cs.position === 'fixed' && cs.transform !== 'none') return true; // off-canvas menus
    }
    return false;
  };

  const all = [...document.body.querySelectorAll('*')].filter((el) => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'BR', 'svg', 'path'].includes(el.tagName));

  // 1. Elements sticking out of the screen (report the outermost offender only)
  const offscreen = [];
  const offSet = new Set();
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (!isVisible(el, r)) continue;
    if (r.right <= vw + tolerance && r.left >= -tolerance) continue;
    if (r.right <= tolerance) continue; // parked fully to the left (off-canvas menu): invisible and never scrolls
    if (clippedByAncestor(el)) continue;
    let p = el.parentElement, nested = false;
    while (p) { if (offSet.has(p)) { nested = true; break; } p = p.parentElement; }
    offSet.add(el);
    if (!nested) offscreen.push({ el: describe(el), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) });
  }

  // 2. Text that is too small to read on a phone
  const fonts = new Map();
  for (const el of all) {
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!hasText) continue;
    const r = el.getBoundingClientRect();
    if (!isVisible(el, r)) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size >= minFontPx) continue;
    const key = Math.round(size * 10) / 10;
    const entry = fonts.get(key) || { fontSize: key, count: 0, samples: [] };
    entry.count += 1;
    if (entry.samples.length < 3) entry.samples.push(describe(el));
    fonts.set(key, entry);
  }

  // 3. Tap targets smaller than minTapPx (inline links inside text are exempt, as in WCAG 2.5.8)
  const taps = [];
  for (const el of document.querySelectorAll('a[href], button, [role="button"], input:not([type="hidden"]), select, textarea, summary')) {
    if (el.tagName === 'A' && el.closest('p, li > p, td, figcaption, blockquote')) continue;
    const r = el.getBoundingClientRect();
    if (!isVisible(el, r)) continue;
    if (r.width < minTapPx || r.height < minTapPx) taps.push({ el: describe(el), width: Math.round(r.width), height: Math.round(r.height) });
  }

  // 4. Images rendered with a different aspect ratio than the file (squashed / stretched)
  const distorted = [];
  for (const img of document.images) {
    const r = img.getBoundingClientRect();
    if (!isVisible(img, r) || !img.naturalWidth || !img.naturalHeight) continue;
    const fit = getComputedStyle(img).objectFit;
    if (fit === 'cover' || fit === 'contain' || fit === 'scale-down') continue;
    const ratio = (r.width / r.height) / (img.naturalWidth / img.naturalHeight);
    if (ratio > 1.08 || ratio < 0.92) distorted.push({ el: describe(img), src: img.currentSrc.split('/').pop().slice(0, 60), distortion: Math.round((ratio - 1) * 100) + '%' });
  }

  return {
    viewport: vw,
    horizontalScroll: document.documentElement.scrollWidth > vw + 1 ? document.documentElement.scrollWidth - vw : 0,
    offscreen: offscreen.slice(0, maxItems),
    smallText: [...fonts.values()].sort((a, b) => a.fontSize - b.fontSize),
    smallTapTargets: taps.slice(0, maxItems),
    distortedImages: distorted.slice(0, maxItems),
  };
}

/** Counts problems in a page result (used for the summary and the exit code). */
function countIssues(r) {
  if (r.error) return 1;
  return (r.horizontalScroll ? 1 : 0) + r.offscreen.length + r.smallText.length + r.smallTapTargets.length + r.distortedImages.length;
}

module.exports = { inspectPage, countIssues };
