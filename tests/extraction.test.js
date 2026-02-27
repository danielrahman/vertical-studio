const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { WebScraper } = require('../extraction/web-scraper');
const {
  OpenAIEnrichmentProvider,
  TemplateFallbackEnrichmentProvider
} = require('../extraction/ai-enrichment-provider');
const { CompanyInputNormalizer } = require('../extraction/normalizer');

test('scraper parser extracts key company fields from HTML fixture', () => {
  const scraper = new WebScraper();
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'company-site.html'), 'utf8');
  const parsed = scraper.parseHtml({
    html,
    websiteUrl: 'https://nordicbuild.example.com'
  });

  assert.equal(parsed.title, 'Nordic Build Studio');
  assert.equal(parsed.headings.h1[0], 'Designing Homes With Long-Term Value');
  assert.equal(parsed.contacts.emails[0], 'sales@nordicbuild.cz');
  assert.equal(parsed.projectBlocks.length >= 2, true);
});

test('OpenAI enrichment provider gracefully falls back without API key', async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const provider = new OpenAIEnrichmentProvider();
    const enriched = await provider.enrich(
      {
        title: 'Nordic Build Studio',
        description: 'Premium architecture and residential developments.',
        headings: { h1: ['Designing Homes With Long-Term Value'], h2: [], h3: [] },
        contacts: { emails: [], phones: [] },
        paragraphs: [],
        projectBlocks: []
      },
      { industry: 'architecture', locale: 'en-US' }
    );

    assert.equal(enriched.provider, 'fallback-template');
    assert.equal(Array.isArray(enriched.warnings), true);
    assert.equal(enriched.warnings.length > 0, true);
  } finally {
    if (previous === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previous;
    }
  }
});

test('normalizer maps extracted+enriched data into valid generation input shape', async () => {
  const fallback = new TemplateFallbackEnrichmentProvider();
  const normalizer = new CompanyInputNormalizer();

  const extractedData = {
    title: 'Nordic Build Studio',
    description: 'Premium architecture and residential developments across Prague and Brno.',
    headings: {
      h1: ['Designing Homes With Long-Term Value'],
      h2: ['Riverside Terrace'],
      h3: []
    },
    contacts: {
      emails: ['sales@nordicbuild.cz'],
      phones: ['+420 777 123 456']
    },
    paragraphs: ['Long paragraph content to use as fallback'],
    projectBlocks: [{ title: 'Riverside Terrace', summary: 'Project summary' }],
    scrapedAt: new Date().toISOString()
  };

  const enrichment = await fallback.enrich(extractedData, {
    companyName: 'Nordic Build',
    websiteUrl: 'https://nordicbuild.example.com'
  });

  const normalized = normalizer.normalize({
    extractedData,
    enrichment,
    context: {
      companyName: 'Nordic Build',
      brandSlug: 'nordic-build',
      locale: 'en-US',
      industry: 'architecture',
      websiteUrl: 'https://nordicbuild.example.com'
    }
  });

  assert.equal(normalized.meta.companyName, 'Nordic Build');
  assert.equal(normalized.meta.brandSlug, 'nordic-build');
  assert.equal(normalized.meta.industry, 'architecture');
  assert.equal(normalized.contact.email, 'sales@nordicbuild.cz');
  assert.equal(Array.isArray(normalized.sections), true);
  assert.equal(Array.isArray(normalized.projects), true);
});
