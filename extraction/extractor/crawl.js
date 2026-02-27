const { parseHtmlPage, normalizeUrl } = require('./parse');
const { canonicalKey, normalizeDiscoveredUrl, isSameOrigin, looksLikeNonHtmlAsset, keywordScore } = require('./url-utils');
const { fetchRobots, isAllowedByRobots } = require('./robots');
const { fetchSitemapSeeds } = require('./sitemap');
const { HostRateLimiter } = require('./rate-limit');
const { inferPageType, buildWebsiteStructure, classifyByPath } = require('./ia-planner');

const INTENT_SCORES = [
  { regex: /(about|company|team|who-we-are)/, score: 4 },
  { regex: /(services|solutions|what-we-do)/, score: 4 },
  { regex: /(projects|portfolio|references|case-studies|case-study)/, score: 5 },
  { regex: /(contact|get-in-touch)/, score: 4 },
  { regex: /pricing/, score: 2 }
];

function clampLimits(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function scoreLink(link, plugin) {
  let score = 0;
  if (link.context === 'nav') score += 2;
  if (link.context === 'cta') score += 1.5;
  if (link.context === 'footer') score += 1;

  const hay = `${link.url} ${link.label || ''}`.toLowerCase();
  for (const rule of INTENT_SCORES) {
    if (rule.regex.test(hay)) {
      score += rule.score;
    }
  }

  if (typeof plugin.adjustLinkPriority === 'function') {
    score = plugin.adjustLinkPriority(link, score);
  }

  return score;
}

function compareQueue(a, b) {
  if (a.depth !== b.depth) {
    return a.depth - b.depth;
  }
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  return a.insertOrder - b.insertOrder;
}

function buildWarning(code, message, url) {
  return {
    code,
    message,
    ...(url ? { url } : {})
  };
}

async function crawlSite({ url, maxPages, maxDepth, timeoutMs, fetchClient, plugin, ignoreRobots = true, siteMapMode }) {
  const start = Date.now();
  const warnings = [];
  const pageReports = [];
  const mode = siteMapMode || 'template_samples';

  const modeMaxPages = mode === 'all_urls' ? 40 : mode === 'marketing_only' ? 10 : 16;
  const pagesLimit = clampLimits(maxPages, mode === 'all_urls' ? 14 : 8, 1, modeMaxPages);
  const depthLimit = clampLimits(maxDepth, 2, 0, 3);
  const requestTimeoutMs = clampLimits(timeoutMs, fetchClient.timeoutMs || 8000, 1000, 25000);

  const rootUrl = normalizeUrl(url);
  const limiter = new HostRateLimiter({
    minDelayMs: 150,
    jitterMs: 40,
    cooldownCapMs: 2000
  });

  const robots = await fetchRobots(rootUrl, fetchClient, 3000);
  if (robots.warning) {
    warnings.push(buildWarning('robots_fetch_failed', robots.warning.replace(/^robots_fetch_failed:\s*/, ''), robots.robotsUrl));
  }

  const robotsRules = robots.rules || { allow: [], disallow: [], sitemaps: [] };
  const applyRobots = ignoreRobots !== true;

  const sitemap = await fetchSitemapSeeds({
    rootUrl,
    sitemapUrls: robotsRules.sitemaps,
    fetchClient,
    timeoutMs: 4000,
    maxUrls: 120,
    maxFiles: 8,
    maxDepth: 2
  });

  warnings.push(...(sitemap.warnings || []));

  let insertOrder = 0;
  const queue = [{ url: rootUrl, depth: 0, score: 100000, insertOrder: insertOrder++ }];
  const visited = new Set();
  const enqueued = new Set([canonicalKey(rootUrl)]);
  const discoveredUrls = new Set([rootUrl]);

  let finalUrl = rootUrl;
  let sameOriginFiltered = 0;

  for (const sitemapUrl of sitemap.urls || []) {
    if (queue.length >= pagesLimit * 3) {
      break;
    }

    if (!isSameOrigin(rootUrl, sitemapUrl)) {
      sameOriginFiltered += 1;
      continue;
    }

    if (looksLikeNonHtmlAsset(sitemapUrl)) {
      continue;
    }

    if (mode === 'marketing_only') {
      try {
        const sitemapType = classifyByPath(new URL(sitemapUrl));
        if (['product', 'checkout', 'account'].includes(sitemapType)) {
          continue;
        }
      } catch (_error) {
        // noop
      }
    }

    if (applyRobots) {
      try {
        const parsedSitemapUrl = new URL(sitemapUrl);
        if (!isAllowedByRobots(robotsRules, parsedSitemapUrl.pathname)) {
          warnings.push(buildWarning('robots_blocked_path', 'Blocked by robots.txt rules', sitemapUrl));
          continue;
        }
      } catch (_error) {
        continue;
      }
    }

    const key = canonicalKey(sitemapUrl);
    if (enqueued.has(key)) {
      continue;
    }

    enqueued.add(key);
    discoveredUrls.add(sitemapUrl);
    queue.push({
      url: sitemapUrl,
      depth: 1,
      score: keywordScore(sitemapUrl) + 10,
      insertOrder: insertOrder++
    });
  }

  const pages = [];

  while (queue.length && pages.length < pagesLimit) {
    queue.sort(compareQueue);
    const next = queue.shift();

    if (!next) {
      continue;
    }

    const nextKey = canonicalKey(next.url);
    if (visited.has(nextKey)) {
      continue;
    }

    if (applyRobots) {
      try {
        const parsedNext = new URL(next.url);
        if (!isAllowedByRobots(robotsRules, parsedNext.pathname)) {
          warnings.push(buildWarning('robots_blocked_path', 'Blocked by robots.txt rules', next.url));
          continue;
        }
      } catch (_error) {
        continue;
      }
    }

    visited.add(nextKey);

    const crawlDelayMs = applyRobots && robotsRules.crawlDelaySec
      ? Math.round(Number(robotsRules.crawlDelaySec) * 1000)
      : 0;

    await limiter.wait(next.url, crawlDelayMs);

    const response = await fetchClient.fetchUrl(next.url, {
      timeoutMs: requestTimeoutMs,
      maxRetries: 3,
      acceptHtmlOnly: true
    });

    limiter.registerStatus(next.url, response.status);

    const report = {
      url: next.url,
      status: Number(response.status || 0),
      contentType: response.contentType || null,
      bytes: Number(response.bytes || 0),
      durationMs: Number(response.durationMs || 0),
      retries: Number(response.retries || 0),
      notes: []
    };

    if (Array.isArray(response.warnings)) {
      for (const warning of response.warnings) {
        warnings.push(buildWarning(warning.code || 'warning', warning.message || 'Fetch warning', next.url));
      }
    }

    if (response.redirected && response.finalUrl) {
      report.notes.push(`redirected to ${response.finalUrl}`);
      finalUrl = response.finalUrl;
      try {
        visited.add(canonicalKey(response.finalUrl));
      } catch (_error) {
        // Ignore canonicalization issues for final URL.
      }
    }

    if (!response.ok) {
      report.errorCode = response.errorCode || 'fetch_error';
      report.errorMessage = response.errorMessage || 'Unable to fetch page';
      pageReports.push(report);
      warnings.push(buildWarning(report.errorCode, report.errorMessage, next.url));
      continue;
    }

    if (!response.text || !response.text.includes('<')) {
      report.errorCode = response.errorCode || 'non_html';
      report.errorMessage = response.errorMessage || 'Response body is not valid HTML';
      pageReports.push(report);
      warnings.push(buildWarning(report.errorCode, report.errorMessage, next.url));
      continue;
    }

    const parsed = parseHtmlPage({ html: response.text, pageUrl: response.finalUrl || next.url });

    if (parsed.rawText.length < 220) {
      warnings.push(buildWarning('low_content', 'Page has very little textual content', parsed.url));
      report.notes.push('low content page');
    }

    pages.push({
      ...parsed,
      pageType: inferPageType(parsed),
      depth: next.depth,
      fetch: {
        status: response.status,
        durationMs: response.durationMs,
        contentType: response.contentType,
        bytes: response.bytes,
        retries: response.retries
      }
    });

    pageReports.push(report);

    if (next.depth >= depthLimit) {
      continue;
    }

    for (const link of parsed.links) {
      const absolute = normalizeDiscoveredUrl(link.url, parsed.url || next.url);
      if (!absolute) {
        continue;
      }

      if (!isSameOrigin(rootUrl, absolute)) {
        sameOriginFiltered += 1;
        continue;
      }

      discoveredUrls.add(absolute);

      if (looksLikeNonHtmlAsset(absolute)) {
        continue;
      }

      if (mode === 'marketing_only') {
        try {
          const pageType = classifyByPath(new URL(absolute));
          if (['product', 'checkout', 'account'].includes(pageType)) {
            continue;
          }
        } catch (_error) {
          continue;
        }
      }

      if (applyRobots) {
        try {
          const target = new URL(absolute);
          if (!isAllowedByRobots(robotsRules, target.pathname)) {
            warnings.push(buildWarning('robots_blocked_path', 'Blocked by robots.txt rules', absolute));
            continue;
          }
        } catch (_error) {
          continue;
        }
      }

      const key = canonicalKey(absolute);
      if (visited.has(key) || enqueued.has(key)) {
        continue;
      }

      enqueued.add(key);
      queue.push({
        url: absolute,
        depth: next.depth + 1,
        score: scoreLink(link, plugin),
        insertOrder: insertOrder++
      });
    }
  }

  if (sameOriginFiltered > 0) {
    warnings.push(
      buildWarning(
        'same_origin_filtered',
        `Filtered ${sameOriginFiltered} cross-origin links during crawl`,
        new URL(rootUrl).origin
      )
    );
  }

  const crawlMs = Date.now() - start;
  const websiteStructure = buildWebsiteStructure({
    rootUrl,
    pages,
    discoveredUrls: [...discoveredUrls],
    siteMapMode: mode
  });

  return {
    rootUrl,
    finalUrl,
    websiteStructure,
    pages,
    pageReports,
    warnings,
    crawl: {
      pagesRequested: pagesLimit,
      pagesCrawled: pages.length,
      maxDepth: depthLimit,
      durationMs: crawlMs
    }
  };
}

module.exports = {
  crawlSite,
  clampLimits,
  buildWarning,
  scoreLink
};
