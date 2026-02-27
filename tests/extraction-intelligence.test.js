const test = require('node:test');
const assert = require('node:assert/strict');
const { extractBrand } = require('../extraction/extractor/brand');
const { buildWebsiteStructure, classifyByPath } = require('../extraction/extractor/ia-planner');

test('brand canonicalization strips title noise and keeps primary brand token', () => {
  const brand = extractBrand({
    plugin: {},
    pages: [
      {
        url: 'https://craness.cz/',
        title: 'Skateshop Craness | Skateboard Shop Maxim Habanec',
        description: 'Skateshop with curated products.',
        headings: { h1: ['CRANE SKATE SUPPLY'], h2: [], h3: [] },
        headerText: 'Craness | skateshop by Maxim Habanec',
        meta: {
          ogSiteName: 'Craness | skateshop by Maxim Habanec'
        },
        structuredData: {
          names: ['Craness | skateshop by Maxim Habanec'],
          legalNames: [],
          logos: []
        },
        logoCandidates: [],
        favicons: [],
        socialLinks: {},
        contacts: {
          emails: [],
          phones: [],
          addressCandidates: []
        },
        trustTokens: {
          partners: false,
          testimonials: false,
          awards: false,
          press: false
        }
      }
    ]
  });

  assert.equal(brand.canonicalName, 'Craness');
  assert.equal(Array.isArray(brand.nameCandidates), true);
  assert.equal(brand.nameCandidates.length >= 1, true);
});

test('website structure planner builds template coverage with samples', () => {
  const structure = buildWebsiteStructure({
    rootUrl: 'https://example.com',
    siteMapMode: 'template_samples',
    pages: [
      { url: 'https://example.com/', pageType: 'home' },
      { url: 'https://example.com/collections/shoes', pageType: 'category' },
      { url: 'https://example.com/products/super-shoe', pageType: 'product' }
    ],
    discoveredUrls: [
      'https://example.com/',
      'https://example.com/about',
      'https://example.com/contact',
      'https://example.com/legal/privacy',
      'https://example.com/blog/new-drop'
    ]
  });

  assert.equal(structure.mode, 'template_samples');
  assert.equal(Array.isArray(structure.pageTypes), true);
  assert.equal(structure.pageTypes.some((item) => item.type === 'product'), true);
  assert.equal(Array.isArray(structure.sampleUrls), true);
});

test('url classifier identifies core page templates', () => {
  assert.equal(classifyByPath(new URL('https://example.com/')), 'home');
  assert.equal(classifyByPath(new URL('https://example.com/products/item-1')), 'product');
  assert.equal(classifyByPath(new URL('https://example.com/collections/all')), 'category');
  assert.equal(classifyByPath(new URL('https://example.com/blog/post-1')), 'blog');
});
