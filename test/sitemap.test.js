'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseSitemap, collectUrls } = require('../src/sitemap');
const { parseArgs } = require('../bin/cli');

test('parses urlset and sitemap index', () => {
  const set = parseSitemap('<urlset><url><loc>https://a.com/</loc></url><url><loc><![CDATA[https://a.com/b?x=1&amp;y=2]]></loc></url></urlset>');
  assert.deepStrictEqual(set, { isIndex: false, locs: ['https://a.com/', 'https://a.com/b?x=1&y=2'] });
  const idx = parseSitemap('<sitemapindex><sitemap><loc>https://a.com/page-sitemap.xml</loc></sitemap></sitemapindex>');
  assert.strictEqual(idx.isIndex, true);
});

test('collects pages through a sitemap index, skipping media and duplicates', async () => {
  const xml = {
    'https://a.com/sitemap.xml': '<sitemapindex><sitemap><loc>https://a.com/p.xml</loc></sitemap><sitemap><loc>https://a.com/q.xml</loc></sitemap></sitemapindex>',
    'https://a.com/p.xml': '<urlset><url><loc>https://a.com/</loc></url><url><loc>https://a.com/about/</loc></url></urlset>',
    'https://a.com/q.xml': '<urlset><url><loc>https://a.com/about/</loc></url><url><loc>https://a.com/logo.png</loc></url></urlset>',
  };
  const fetchImpl = async (u) => ({ ok: !!xml[u], status: xml[u] ? 200 : 404, text: async () => xml[u] });
  assert.deepStrictEqual(await collectUrls('https://a.com/sitemap.xml', { fetchImpl }), ['https://a.com/', 'https://a.com/about/']);
  assert.deepStrictEqual(await collectUrls('https://a.com/sitemap.xml', { fetchImpl, limit: 1 }), ['https://a.com/']);
});

test('CLI arguments', () => {
  const o = parseArgs(['https://a.com/sitemap.xml', '--width', '390', '--no-screenshots', '--fail']);
  assert.strictEqual(o.target, 'https://a.com/sitemap.xml');
  assert.strictEqual(o.width, 390);
  assert.strictEqual(o.screenshots, false);
  assert.strictEqual(o.fail, true);
  assert.throws(() => parseArgs(['--width', 'abc']), /positive number/);
  assert.throws(() => parseArgs(['--nope']), /Unknown option/);
});
