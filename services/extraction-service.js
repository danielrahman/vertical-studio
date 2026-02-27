const {
  OpenAIEnrichmentProvider,
  TemplateFallbackEnrichmentProvider
} = require('../extraction/ai-enrichment-provider');
const { CompanyInputNormalizer } = require('../extraction/normalizer');
const { UnifiedExtractor, toLegacyExtractedData } = require('../extraction/extractor');

class ExtractionService {
  constructor(options = {}) {
    this.logger = options.logger;
    this.extractor = options.extractor || new UnifiedExtractor(options);
    this.normalizer = options.normalizer || new CompanyInputNormalizer(options);
    this.primaryEnrichment = options.primaryEnrichment || new OpenAIEnrichmentProvider(options);
    this.fallbackEnrichment = options.fallbackEnrichment || new TemplateFallbackEnrichmentProvider(options);
  }

  async extractSite(payload) {
    const extractorResult = await this.extractor.extract(payload);

    if (this.logger) {
      this.logger.info('Extractor completed', {
        inputUrl: payload.url,
        pages: extractorResult.crawl.pagesCrawled,
        warnings: extractorResult.warnings.length
      });
    }

    return extractorResult;
  }

  async extractAndNormalize({ websiteUrl, context = {} }) {
    const extractorResult = await this.extractSite({
      url: websiteUrl,
      maxPages: context.maxPages,
      maxDepth: context.maxDepth,
      timeoutMs: context.timeoutMs
    });

    const extractedData = toLegacyExtractedData(extractorResult);

    let enrichment = await this.primaryEnrichment.enrich(extractedData, {
      ...context,
      websiteUrl
    });

    const warnings = Array.isArray(extractorResult.warnings) ? [...extractorResult.warnings] : [];
    const enrichmentWarnings = Array.isArray(enrichment.warnings) ? [...enrichment.warnings] : [];

    if (!enrichment || !enrichment.tagline) {
      const fallback = await this.fallbackEnrichment.enrich(extractedData, {
        ...context,
        websiteUrl
      });
      enrichment = fallback;
      if (Array.isArray(fallback.warnings)) {
        enrichmentWarnings.push(...fallback.warnings);
      }
    }

    for (const warning of enrichmentWarnings) {
      warnings.push({
        code: 'enrichment_warning',
        message: String(warning)
      });
    }

    const normalizedInput = this.normalizer.normalize({
      extractedData,
      enrichment,
      context: {
        ...context,
        websiteUrl
      }
    });

    if (this.logger) {
      this.logger.info('Extraction completed', {
        websiteUrl,
        enrichmentProvider: enrichment.provider,
        warnings: warnings.length
      });
    }

    return {
      extractorResult,
      extractedData,
      enrichment,
      normalizedInput,
      warnings
    };
  }
}

module.exports = {
  ExtractionService
};
