const fs = require('fs');
const path = require('path');
const { convertHtmlToMarkdown, estimateTokens } = require('./local-converter');
const { convertViaMarkdownNew } = require('./markdown-new-client');
const { selectCanonicalMarkdown } = require('./selector');

function safeRead(absPath) {
  try {
    return fs.readFileSync(absPath, 'utf8');
  } catch (_error) {
    return '';
  }
}

function sanitizeFileName(value) {
  return String(value || 'page')
    .replace(/^https?:\/\//, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'page';
}

function getArtifactPathMap(artifactManager) {
  const map = new Map();
  for (const item of artifactManager.list()) {
    if (!item || !item.id || !item.path) continue;
    map.set(item.id, path.join(artifactManager.root, item.path));
  }
  return map;
}

function shouldUseRemote(mode) {
  return mode === 'hybrid' || mode === 'remote';
}

async function buildMarkdownCorpus({
  baseResult,
  renderResult,
  artifactManager,
  warnings,
  options = {}
}) {
  const cfg = {
    enabled: options.enabled !== false,
    mode: options.mode || 'hybrid',
    remoteProvider: options.remoteProvider || 'markdown_new',
    method: options.method || 'auto',
    retainImages: options.retainImages === true,
    maxDocs: Math.max(1, Number(options.maxDocs || 20))
  };

  if (!cfg.enabled) {
    return {
      generatedAt: new Date().toISOString(),
      documents: []
    };
  }

  const crawlPages = Array.isArray(baseResult._crawlPages) ? baseResult._crawlPages : [];
  const crawlMap = new Map(crawlPages.map((page) => [page.url, page]));
  const renderedMap = new Map((renderResult && renderResult.renderedPages ? renderResult.renderedPages : []).map((page) => [page.url, page]));
  const artifactPathMap = getArtifactPathMap(artifactManager);
  const docs = [];
  const qualityReport = [];

  const pages = (baseResult.content && Array.isArray(baseResult.content.pages) ? baseResult.content.pages : []).slice(0, cfg.maxDocs);
  for (const page of pages) {
    const fileBase = sanitizeFileName(page.url);
    const candidates = [];
    const renderEntry = renderedMap.get(page.url);

    let sourceHtml = '';
    if (renderEntry && renderEntry.htmlArtifactId && artifactPathMap.has(renderEntry.htmlArtifactId)) {
      sourceHtml = safeRead(artifactPathMap.get(renderEntry.htmlArtifactId));
    }

    if (!sourceHtml) {
      const crawlEntry = crawlMap.get(page.url);
      sourceHtml = crawlEntry && crawlEntry.html ? crawlEntry.html : '';
    }

    if (sourceHtml) {
      const local = convertHtmlToMarkdown({
        html: sourceHtml,
        pageUrl: page.url
      });

      const localArtifact = artifactManager.writeText({
        type: 'markdown_local',
        directory: 'markdown/local',
        fileName: `${fileBase}.md`,
        content: local.content,
        metadata: {
          url: page.url,
          pageType: page.pageType || null
        }
      });

      candidates.push({
        source: 'local',
        artifactId: localArtifact.id,
        title: local.title || page.title || null,
        content: local.content,
        tokens: local.tokens || estimateTokens(local.content)
      });
    } else {
      warnings.push({
        code: 'markdown_local_missing_html',
        message: `No HTML source available for markdown conversion (${page.url})`
      });
    }

    if (shouldUseRemote(cfg.mode) && cfg.remoteProvider === 'markdown_new') {
      const remote = await convertViaMarkdownNew({
        url: page.url,
        method: cfg.method,
        retainImages: cfg.retainImages
      });

      if (remote.ok && remote.content) {
        const remoteArtifact = artifactManager.writeText({
          type: 'markdown_remote',
          directory: 'markdown/remote',
          fileName: `${fileBase}.md`,
          content: remote.content,
          metadata: {
            url: page.url,
            pageType: page.pageType || null,
            method: remote.method || cfg.method,
            durationMs: remote.durationMs
          }
        });

        candidates.push({
          source: 'remote',
          artifactId: remoteArtifact.id,
          title: remote.title || page.title || null,
          content: remote.content,
          tokens: remote.tokens || estimateTokens(remote.content)
        });
      } else {
        warnings.push({
          code: 'markdown_remote_failed',
          message: `markdown.new conversion failed for ${page.url}: ${remote.error || 'unknown error'}`
        });
      }
    }

    const { winner, ranked } = selectCanonicalMarkdown(candidates);
    if (!winner) {
      continue;
    }

    const canonicalArtifact = artifactManager.writeText({
      type: 'markdown_canonical',
      directory: 'markdown/canonical',
      fileName: `${fileBase}.md`,
      content: winner.content,
      metadata: {
        url: page.url,
        pageType: page.pageType || null,
        selectedSource: winner.source,
        qualityScore: winner.qualityScore
      }
    });

    docs.push({
      url: page.url,
      pageType: page.pageType,
      title: winner.title || page.title || null,
      artifactId: canonicalArtifact.id,
      source: winner.source,
      tokens: winner.tokens || estimateTokens(winner.content),
      qualityScore: winner.qualityScore,
      snippet: String(winner.content || '').slice(0, 420)
    });

    qualityReport.push({
      url: page.url,
      selectedSource: winner.source,
      selectedQualityScore: winner.qualityScore,
      candidates: ranked.map((item) => ({
        source: item.source,
        artifactId: item.artifactId,
        qualityScore: item.qualityScore
      }))
    });
  }

  const reportArtifact = artifactManager.writeJson({
    type: 'markdown_quality_report',
    directory: 'markdown/meta',
    fileName: `quality-${Date.now()}.json`,
    data: qualityReport
  });

  return {
    generatedAt: new Date().toISOString(),
    documents: docs.slice(0, cfg.maxDocs),
    qualityReportArtifactId: reportArtifact.id
  };
}

module.exports = {
  buildMarkdownCorpus
};
