const path = require('path');
const { UnifiedExtractor } = require('../extractor');
const { deepResearchSchema } = require('../schemas/deep-research-schema');
const { ArtifactManager } = require('./artifact-manager');
const { renderWithBrowser } = require('./render');
const { runOffsiteProviders } = require('./providers');
const { synthesizeResearch } = require('./synthesize');
const { buildMarkdownCorpus } = require('./markdown');

function dedupe(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function makeSource({ id, step, type, url, artifactId, title, excerpt }) {
  return {
    id,
    step,
    type,
    ...(url ? { url } : {}),
    ...(artifactId ? { artifactId } : {}),
    ...(title ? { title } : {}),
    ...(excerpt ? { excerpt } : {}),
    timestamp: new Date().toISOString()
  };
}

function computeDeepConfidence(baseConfidence, outside, warnings) {
  const mentionCount = (outside.pr && outside.pr.mentions && outside.pr.mentions.length) || 0;
  const competitorCount = (outside.competitive && outside.competitive.competitors && outside.competitive.competitors.length) || 0;
  const registryCount = (outside.company && outside.company.registryFindings && outside.company.registryFindings.length) || 0;

  const extractionConfidence = Math.max(
    0,
    Math.min(
      1,
      Number(baseConfidence.overall || 0) * 0.7 +
        Math.min(0.2, mentionCount * 0.01) +
        Math.min(0.12, registryCount * 0.02) -
        Math.min(0.18, (warnings || []).length * 0.01)
    )
  );

  const inferenceConfidence = Math.max(
    0,
    Math.min(
      1,
      extractionConfidence * 0.6 +
        Math.min(0.25, competitorCount * 0.02) +
        Math.min(0.15, mentionCount * 0.01)
    )
  );

  const overall = Number(((extractionConfidence + inferenceConfidence) / 2).toFixed(3));

  return {
    overall,
    fields: {
      ...baseConfidence.fields,
      'outside.pr': Number(Math.min(1, mentionCount * 0.08 + 0.2).toFixed(3)),
      'outside.competitive': Number(Math.min(1, competitorCount * 0.1 + 0.2).toFixed(3)),
      'outside.company': Number(Math.min(1, registryCount * 0.1 + 0.2).toFixed(3))
    },
    explain: {
      ...(baseConfidence.explain || {}),
      'outside.pr': `mentions: ${mentionCount}`,
      'outside.competitive': `competitors: ${competitorCount}`,
      'outside.company': `registry findings: ${registryCount}`
    },
    extractionConfidence: Number(extractionConfidence.toFixed(3)),
    inferenceConfidence: Number(inferenceConfidence.toFixed(3))
  };
}

class DeepResearchExtractor {
  constructor(options = {}) {
    this.baseExtractor = options.baseExtractor || new UnifiedExtractor(options);
    this.secretStore = options.secretStore;
    this.paths = options.paths;
    this.artifactsRepo = options.artifactsRepo || null;
    this.logger = options.logger;
    this.openAiApiKey = options.openAiApiKey || process.env.OPENAI_API_KEY || null;
    this.openAiModel = options.openAiModel || process.env.VERTICAL_OPENAI_MODEL || 'gpt-4.1-mini';
  }

  getProviderKeys(request) {
    const offsiteKeys =
      (request.offsite && request.offsite.providerKeyRefs) ||
      ((request.options || {}).providerKeys || {});

    const read = (ref, envName) => {
      if (ref && this.secretStore) {
        const value = this.secretStore.get(ref);
        if (value) {
          return typeof value === 'string' ? value : value.apiKey || null;
        }
      }
      return process.env[envName] || null;
    };

    return {
      serpapi: read(offsiteKeys.serpapiRef, 'SERPAPI_API_KEY'),
      companyData: read(offsiteKeys.companyDataRef, 'COMPANY_DATA_API_KEY'),
      social: read(offsiteKeys.socialRef, 'SOCIAL_ENRICH_API_KEY')
    };
  }

  async run(request, progress = () => undefined) {
    const startedAt = Date.now();
    const warnings = [];
    const coverage = {
      completedSteps: [],
      skippedSteps: [],
      gaps: []
    };
    const maxDurationMs = Math.max(10000, Number(request.maxDurationMs || 1800000));
    const deadline = startedAt + maxDurationMs;
    const timeLeftMs = () => deadline - Date.now();

    const mode = request.mode || 'forensic';
    const qualityProfile = request.qualityProfile || 'max_quality';
    const siteMapMode = request.siteMapMode || 'template_samples';
    const markdownOptions = request.markdown || { enabled: true, mode: 'hybrid', remoteProvider: 'markdown_new' };

    const maxPages =
      qualityProfile === 'local_only'
        ? mode === 'fast'
          ? 6
          : mode === 'balanced'
          ? 9
          : 10
        : mode === 'fast'
        ? 8
        : mode === 'balanced'
        ? 12
        : 14;
    const maxDepth = mode === 'fast' ? 2 : 3;

    progress({
      phase: 'discovering',
      ratio: 0.05,
      message: 'Preparing deep extraction run'
    });

    coverage.completedSteps.push('discovering');

    const domain = new URL(request.url).hostname.replace(/^www\./, '');
    const artifactRoot = path.join(this.paths.extractionDir, String(request.jobId || 'adhoc'));
    const artifactManager = new ArtifactManager({
      jobId: request.jobId || 'adhoc',
      root: artifactRoot,
      repo: this.artifactsRepo
    });

    progress({ phase: 'crawling', ratio: 0.2, message: 'Running baseline crawl and extraction' });
    const baseResult = await this.baseExtractor.extract({
      url: request.url,
      maxPages,
      maxDepth,
      timeoutMs: 12000,
      ignoreRobots: request.ignoreRobots !== false,
      siteMapMode
    });
    warnings.push(...(baseResult.warnings || []));
    coverage.completedSteps.push('crawling');

    for (const page of baseResult.content.pages || []) {
      const fullPage = (baseResult._crawlPages || []).find((item) => item.url === page.url);
      const html = fullPage && fullPage.html ? fullPage.html : '';
      artifactManager.writeText({
        type: 'raw_html',
        directory: 'raw-html',
        fileName: `${page.url.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9._-]+/g, '-')}.html`,
        content: html,
        metadata: {
          url: page.url
        }
      });
    }

    progress({ phase: 'rendering', ratio: 0.45, message: 'Rendering JS pages and collecting screenshots' });
    let renderResult = { renderedPages: [], networkSummary: [] };
    if (qualityProfile === 'local_only') {
      coverage.skippedSteps.push('rendering');
      coverage.gaps.push('Rendering skipped due to qualityProfile=local_only');
    } else if (timeLeftMs() > 20000) {
      renderResult = await renderWithBrowser({
        pages: baseResult.content.pages,
        finalUrl: baseResult.finalUrl,
        auth: request.auth,
        captcha: request.captcha,
        artifactManager,
        secretStore: this.secretStore,
        warnings,
        maxDurationMs: Math.max(20000, Math.min(300000, timeLeftMs() - 5000))
      });
    } else {
      coverage.gaps.push('Rendering skipped due to maxDuration budget');
      warnings.push({
        code: 'duration_budget',
        message: 'Rendering phase skipped because maxDurationMs budget is nearly exhausted'
      });
    }

    if (renderResult.renderedPages.length) {
      coverage.completedSteps.push('rendering');
    } else if (!coverage.skippedSteps.includes('rendering')) {
      coverage.skippedSteps.push('rendering');
      coverage.gaps.push('Rendered DOM/screenshot coverage is partial or unavailable');
    }

    progress({ phase: 'markdown', ratio: 0.56, message: 'Converting HTML artifacts into Markdown corpus' });
    let markdownCorpus = {
      generatedAt: new Date().toISOString(),
      documents: []
    };
    if (timeLeftMs() > 5000) {
      markdownCorpus = await buildMarkdownCorpus({
        baseResult,
        renderResult,
        artifactManager,
        warnings,
        options: markdownOptions
      });
      coverage.completedSteps.push('markdown');
    } else {
      coverage.skippedSteps.push('markdown');
      coverage.gaps.push('Markdown conversion skipped due to maxDuration budget');
      warnings.push({
        code: 'duration_budget',
        message: 'Markdown conversion skipped because maxDurationMs budget is nearly exhausted'
      });
    }

    if (!baseResult.content.markdownCorpus) {
      baseResult.content.markdownCorpus = markdownCorpus;
    }

    progress({ phase: 'offsite', ratio: 0.65, message: 'Collecting off-site intelligence' });
    let outside = {
      company: { legalNameCandidates: [], ownershipSignals: [], registryFindings: [], evidence: [] },
      presence: { people: [], socialProfiles: [], directories: [], listingSignals: [] },
      pr: { mentions: [], keyTopics: [], timeline: [], risks: [], opportunities: [] },
      tech: { cms: [], trackers: [], cdn: [], hosting: [], evidence: [] },
      competitive: { competitors: [], shareOfVoiceHints: [] }
    };
    let providerSources = [];
    let providerFieldLinks = {};
    let providerCosts = {};
    let totalUsd = 0;
    let withinBudget = true;

    if (request.offsite && request.offsite.enabled !== false) {
      if (timeLeftMs() <= 30000) {
        coverage.skippedSteps.push('offsite');
        coverage.gaps.push('Off-site intelligence skipped due to maxDuration budget');
        warnings.push({
          code: 'duration_budget',
          message: 'Off-site phase skipped because maxDurationMs budget is nearly exhausted'
        });
      } else {
        const providerKeys = this.getProviderKeys(request);
        const offsite = await runOffsiteProviders({
          providers: request.offsite.providers,
          budgetUsd: Number(request.budgetUsd || 5),
          domain,
          brandName: baseResult.brand.canonicalName || baseResult.brand.name || baseResult.brand.tagline || domain,
          localeHints: request.localeHints,
          baseResult: {
            ...baseResult,
            artifacts: {
              root: artifactRoot,
              items: artifactManager.list()
            }
          },
          keys: providerKeys
        });

        outside = offsite.outside;
        providerSources = offsite.sources;
        providerFieldLinks = offsite.fieldLinks;
        providerCosts = offsite.providerCosts;
        totalUsd = offsite.totalUsd;
        withinBudget = offsite.withinBudget;
        warnings.push(...(offsite.warnings || []).map((message) => ({ code: 'offsite_warning', message })));

        coverage.completedSteps.push('offsite');
        if (!withinBudget) {
          coverage.gaps.push('Budget cap reached before all off-site probes completed');
        }
      }
    } else {
      coverage.skippedSteps.push('offsite');
      coverage.gaps.push('Off-site intelligence disabled');
    }

    progress({ phase: 'synthesizing', ratio: 0.85, message: 'Generating bilingual CZ+EN strategic synthesis' });
    const skipLlm = timeLeftMs() <= 15000;
    if (skipLlm) {
      warnings.push({
        code: 'duration_budget',
        message: 'LLM synthesis skipped due to remaining maxDurationMs budget'
      });
      coverage.gaps.push('LLM synthesis degraded to fallback output due to maxDuration budget');
    }
    const research = await synthesizeResearch({
      url: request.url,
      baseResult,
      markdownCorpus,
      outside,
      apiKey: skipLlm ? null : this.openAiApiKey,
      model: this.openAiModel,
      warnings: warnings
    });
    coverage.completedSteps.push('synthesizing');

    const provenanceSources = [];
    const provenanceFields = {
      ...providerFieldLinks
    };

    for (const page of baseResult.content.pages || []) {
      const sourceId = `page:${page.url}`;
      provenanceSources.push(
        makeSource({
          id: sourceId,
          step: 'crawling',
          type: 'html_page',
          url: page.url,
          title: page.title || page.url,
          excerpt: (page.textSamples && page.textSamples[0]) || ''
        })
      );

      for (const field of ['brand.name', 'brand.canonicalName', 'brand.tagline', 'content.sections', 'website.structure']) {
        if (!provenanceFields[field]) {
          provenanceFields[field] = [];
        }
        if (!provenanceFields[field].includes(sourceId)) {
          provenanceFields[field].push(sourceId);
        }
      }
    }

    for (const doc of markdownCorpus.documents || []) {
      const sourceId = `md:${doc.url}`;
      provenanceSources.push(
        makeSource({
          id: sourceId,
          step: 'markdown',
          type: 'markdown_document',
          url: doc.url,
          artifactId: doc.artifactId,
          title: doc.title || doc.url
        })
      );

      if (!provenanceFields['content.markdown']) {
        provenanceFields['content.markdown'] = [];
      }
      if (!provenanceFields['content.markdown'].includes(sourceId)) {
        provenanceFields['content.markdown'].push(sourceId);
      }
    }

    for (const source of providerSources) {
      provenanceSources.push(source);
    }

    const cost = {
      budgetUsd: Number(request.budgetUsd || 5),
      totalUsd: Number(totalUsd.toFixed(3)),
      providers: providerCosts,
      withinBudget
    };

    if (cost.totalUsd > cost.budgetUsd) {
      coverage.gaps.push('Total provider cost exceeded configured budget cap');
    }
    if (Date.now() > deadline) {
      warnings.push({
        code: 'duration_budget_exceeded',
        message: `Extraction exceeded maxDurationMs (${maxDurationMs}) but returned partial result`
      });
      coverage.gaps.push('Hard duration target was exceeded');
    }

    const deepConfidence = computeDeepConfidence(baseResult.confidence, outside, warnings);

    const result = {
      ...baseResult,
      apiVersion: '3.0',
      research,
      outside,
      provenance: {
        sources: provenanceSources,
        fields: provenanceFields,
        fieldEvidence: Object.entries(provenanceFields).flatMap(([field, sourceIds]) =>
          (sourceIds || []).map((sourceId) => ({
            field,
            sourceId,
            confidence: field.startsWith('content.markdown') ? 0.82 : 0.75
          }))
        )
      },
      artifacts: {
        root: artifactRoot,
        items: artifactManager.list()
      },
      cost,
      coverage,
      warnings: dedupe(
        warnings
          .map((item) => (typeof item === 'string' ? { code: 'warning', message: item } : item))
          .map((warning) => JSON.stringify(warning))
      ).map((item) => JSON.parse(item)),
      confidence: deepConfidence
    };

    artifactManager.writeJson({
      type: 'result_snapshot',
      directory: 'evidence',
      fileName: 'result.json',
      data: result,
      metadata: {
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt
      }
    });

    progress({
      phase: 'completed',
      ratio: 1,
      message: 'Extraction completed',
      elapsedMs: Date.now() - startedAt,
      cost
    });

    return deepResearchSchema.parse(result);
  }
}

module.exports = {
  DeepResearchExtractor
};
