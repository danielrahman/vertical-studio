const { crawlSite } = require('./crawl');
const { extractBrand } = require('./brand');
const { inferColors } = require('./style/colors');
const { inferTypography } = require('./style/typography');
const { normalizeSections } = require('./sections/normalize');
const { normalizeUrl, unique } = require('./parse');
const { calculateConfidence } = require('./confidence');
const { FetchClient } = require('./fetch');
const { ExtractorRegistry } = require('./plugins/registry');
const { extractionResultSchema } = require('../schemas/extraction-schema');

function dedupeWarnings(warnings) {
  const map = new Map();
  for (const warning of warnings || []) {
    if (!warning || !warning.code || !warning.message) {
      continue;
    }

    const key = `${warning.code}::${warning.message}::${warning.url || ''}`;
    if (!map.has(key)) {
      map.set(key, {
        code: warning.code,
        message: warning.message,
        ...(warning.url ? { url: warning.url } : {})
      });
    }
  }

  return [...map.values()];
}

class UnifiedExtractor {
  constructor(options = {}) {
    this.fetchClient = options.fetchClient || new FetchClient(options);
    this.registry = options.registry || new ExtractorRegistry(options);
  }

  async extract(input) {
    const started = Date.now();

    const inputUrl = normalizeUrl(input.url);
    const parsedInput = new URL(inputUrl);
    const plugin = this.registry.resolve(parsedInput.hostname);

    const crawlResult = await crawlSite({
      url: inputUrl,
      maxPages: input.maxPages,
      maxDepth: input.maxDepth,
      timeoutMs: input.timeoutMs,
      fetchClient: this.fetchClient,
      plugin,
      ignoreRobots: input.ignoreRobots !== false,
      siteMapMode: input.siteMapMode || 'template_samples'
    });

    const warnings = [...crawlResult.warnings];

    const styleStart = Date.now();
    const colors = await inferColors({
      pages: crawlResult.pages,
      fetchClient: this.fetchClient,
      warnings,
      origin: parsedInput.origin
    });

    const typography = await inferTypography({
      pages: crawlResult.pages,
      fetchClient: this.fetchClient,
      warnings,
      origin: parsedInput.origin
    });

    const styleMs = Date.now() - styleStart;

    const brand = extractBrand({ pages: crawlResult.pages, plugin });
    const sections = normalizeSections({ pages: crawlResult.pages, plugin });

    const contentPages = crawlResult.pages.map((page) => ({
      url: page.url,
      ...(page.pageType ? { pageType: page.pageType } : {}),
      ...(page.title ? { title: page.title } : {}),
      ...(page.description ? { description: page.description } : {}),
      headings: page.headings,
      textSamples: page.textSamples,
      sectionCandidates: page.sectionCandidates.map((candidate) => ({
        ...(candidate.title ? { title: candidate.title } : {}),
        ...(candidate.summary ? { summary: candidate.summary } : {}),
        ...(candidate.bullets ? { bullets: candidate.bullets } : {}),
        ctas: candidate.ctas || [],
        ...(candidate.sourceTag ? { sourceTag: candidate.sourceTag } : {}),
        sourcePageUrl: candidate.sourcePageUrl
      }))
    }));

    const result = {
      apiVersion: '3.0',
      inputUrl,
      finalUrl: crawlResult.finalUrl || inputUrl,
      crawledAt: new Date().toISOString(),
      crawl: {
        pagesRequested: crawlResult.crawl.pagesRequested,
        pagesCrawled: crawlResult.crawl.pagesCrawled,
        maxDepth: crawlResult.crawl.maxDepth,
        durationsMs: {
          total: Date.now() - started,
          crawl: crawlResult.crawl.durationMs,
          style: styleMs
        }
      },
      brand,
      website: crawlResult.websiteStructure || {
        mode: input.siteMapMode || 'template_samples',
        discoveredUrlCount: 0,
        pageTypes: [],
        sampleUrls: [],
        keyPages: {
          home: crawlResult.finalUrl || inputUrl,
          about: null,
          contact: null,
          legal: [],
          blog: [],
          categories: [],
          products: [],
          account: [],
          checkout: []
        }
      },
      style: {
        colors,
        typography
      },
      content: {
        pages: contentPages,
        sections
      },
      pageReports: crawlResult.pageReports,
      warnings: dedupeWarnings(warnings),
      confidence: {
        overall: 0,
        fields: {}
      }
    };

    result.confidence = calculateConfidence({
      brand: result.brand,
      style: result.style,
      content: result.content,
      crawl: result.crawl,
      website: result.website,
      warnings: result.warnings
    });

    const parsed = extractionResultSchema.parse(result);
    parsed._crawlPages = crawlResult.pages;
    return parsed;
  }
}

function toLegacyExtractedData(extractorResult) {
  const pages = extractorResult.content.pages || [];
  const firstPage = pages[0] || null;
  const headingBuckets = { h1: [], h2: [], h3: [] };

  for (const page of pages) {
    headingBuckets.h1.push(...(page.headings.h1 || []));
    headingBuckets.h2.push(...(page.headings.h2 || []));
    headingBuckets.h3.push(...(page.headings.h3 || []));
  }

  const projectSections = (extractorResult.content.sections || []).filter((section) => section.type === 'PROJECTS');
  const projectBlocks = projectSections.map((section) => ({
    title: section.title || 'Project',
    summary: section.summary || null
  }));

  const links = [];
  for (const section of extractorResult.content.sections || []) {
    for (const cta of section.ctas || []) {
      links.push({ href: cta.url, label: cta.label || null });
    }
  }

  const titleCandidate =
    extractorResult.brand.canonicalName ||
    extractorResult.brand.name ||
    (firstPage && firstPage.title) ||
    extractorResult.brand.tagline ||
    extractorResult.finalUrl;

  const descriptionCandidate =
    (firstPage && firstPage.description) || extractorResult.brand.tagline || (firstPage && firstPage.textSamples[0]) || null;

  return {
    source: {
      websiteUrl: extractorResult.finalUrl
    },
    title: titleCandidate,
    description: descriptionCandidate,
    headings: {
      h1: unique(headingBuckets.h1).slice(0, 8),
      h2: unique(headingBuckets.h2).slice(0, 12),
      h3: unique(headingBuckets.h3).slice(0, 12)
    },
    contacts: {
      emails: unique((extractorResult.brand.contact && extractorResult.brand.contact.emails) || []).slice(0, 5),
      phones: unique((extractorResult.brand.contact && extractorResult.brand.contact.phones) || []).slice(0, 5)
    },
    links: unique(links.map((item) => `${item.href}|||${item.label || ''}`))
      .map((entry) => {
        const [href, label] = entry.split('|||');
        return { href, label: label || null };
      })
      .slice(0, 60),
    paragraphs: unique(
      pages
        .flatMap((page) => page.textSamples || [])
        .filter((text) => text.length > 40)
    ).slice(0, 20),
    projectBlocks: projectBlocks.length
      ? projectBlocks.slice(0, 8)
      : unique(
          headingBuckets.h2
            .filter(Boolean)
            .map((heading) => JSON.stringify({ title: heading, summary: null }))
        )
          .map((value) => JSON.parse(value))
          .slice(0, 8),
    scrapedAt: extractorResult.crawledAt
  };
}

module.exports = {
  UnifiedExtractor,
  toLegacyExtractedData
};
