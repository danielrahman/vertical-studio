const { normalizeDiscoveredUrl } = require('./url-utils');

function extractLocValues(xml, tagName) {
  const values = [];
  const pattern = new RegExp(`<${tagName}[^>]*>[\\s\\S]*?<loc[^>]*>([\\s\\S]*?)<\\/loc>[\\s\\S]*?<\\/${tagName}>`, 'gi');

  let match = pattern.exec(xml);
  while (match) {
    const value = String(match[1] || '').trim();
    if (value) {
      values.push(value);
    }
    match = pattern.exec(xml);
  }

  return values;
}

function parseSitemapXml(xml) {
  const source = String(xml || '');
  const lower = source.toLowerCase();

  if (lower.includes('<sitemapindex')) {
    return {
      type: 'index',
      urls: extractLocValues(source, 'sitemap')
    };
  }

  if (lower.includes('<urlset')) {
    return {
      type: 'urlset',
      urls: extractLocValues(source, 'url')
    };
  }

  return {
    type: 'unknown',
    urls: []
  };
}

async function fetchSitemapSeeds({
  rootUrl,
  sitemapUrls,
  fetchClient,
  timeoutMs = 4000,
  maxUrls = 120,
  maxFiles = 8,
  maxDepth = 2
}) {
  const seeds = [];
  const warnings = [];
  const queue = [];
  const visited = new Set();

  const defaults = [];
  try {
    defaults.push(new URL('/sitemap.xml', rootUrl).toString());
  } catch (_error) {
    // No-op: invalid root URL will be handled by the caller.
  }

  for (const url of [...(sitemapUrls || []), ...defaults]) {
    const normalized = normalizeDiscoveredUrl(url, rootUrl);
    if (!normalized) {
      continue;
    }
    queue.push({ url: normalized, depth: 0 });
  }

  while (queue.length && visited.size < maxFiles && seeds.length < maxUrls) {
    const next = queue.shift();
    if (!next) {
      continue;
    }

    if (visited.has(next.url)) {
      continue;
    }

    visited.add(next.url);

    const response = await fetchClient.fetchUrl(next.url, {
      acceptHtmlOnly: false,
      maxRetries: 1,
      timeoutMs
    });

    if (!response.ok || !response.text) {
      warnings.push({
        code: 'sitemap_fetch_failed',
        message: response.errorMessage || `Unable to fetch sitemap (${response.status})`,
        url: next.url
      });
      continue;
    }

    const parsed = parseSitemapXml(response.text);
    if (parsed.type === 'unknown') {
      warnings.push({
        code: 'sitemap_parse_failed',
        message: 'Sitemap XML did not match urlset/sitemapindex',
        url: next.url
      });
      continue;
    }

    if (parsed.type === 'index') {
      if (next.depth >= maxDepth) {
        continue;
      }

      for (const childUrl of parsed.urls) {
        if (queue.length + visited.size >= maxFiles * 3) {
          break;
        }

        const normalized = normalizeDiscoveredUrl(childUrl, next.url);
        if (!normalized || visited.has(normalized)) {
          continue;
        }

        queue.push({ url: normalized, depth: next.depth + 1 });
      }
      continue;
    }

    for (const pageUrl of parsed.urls) {
      const normalized = normalizeDiscoveredUrl(pageUrl, next.url);
      if (!normalized) {
        continue;
      }
      if (seeds.includes(normalized)) {
        continue;
      }

      seeds.push(normalized);
      if (seeds.length >= maxUrls) {
        break;
      }
    }
  }

  return {
    urls: seeds.slice(0, maxUrls),
    warnings
  };
}

module.exports = {
  fetchSitemapSeeds,
  parseSitemapXml
};
