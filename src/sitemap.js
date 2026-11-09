'use strict';

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

/** Extracts <loc> values from a sitemap or sitemap index XML string. */
function parseSitemap(xml) {
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => decode(m[1]));
  return { isIndex, locs };
}

/**
 * Resolves a sitemap URL (or sitemap index) into a de-duplicated list of page URLs.
 * Image/video URLs and nested sitemaps beyond `maxDepth` are skipped.
 */
async function collectUrls(sitemapUrl, { fetchImpl = globalThis.fetch, maxDepth = 2, limit = Infinity } = {}) {
  const pages = new Set();
  const seen = new Set();
  async function walk(url, depth) {
    if (seen.has(url) || depth > maxDepth || pages.size >= limit) return;
    seen.add(url);
    const res = await fetchImpl(url, { headers: { 'User-Agent': 'mobile-layout-audit' } });
    if (!res.ok) throw new Error(`Sitemap ${url} returned HTTP ${res.status}`);
    const { isIndex, locs } = parseSitemap(await res.text());
    for (const loc of locs) {
      if (pages.size >= limit) break;
      if (isIndex || /\.xml(\.gz)?$/i.test(loc)) await walk(loc, depth + 1);
      else if (!/\.(jpe?g|png|gif|webp|svg|pdf|mp4)$/i.test(loc)) pages.add(loc);
    }
  }
  await walk(sitemapUrl, 0);
  return [...pages];
}

module.exports = { parseSitemap, collectUrls };
