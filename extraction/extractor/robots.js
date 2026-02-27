function parseDirective(line) {
  const idx = line.indexOf(':');
  if (idx < 0) {
    return null;
  }

  const key = line.slice(0, idx).trim().toLowerCase();
  const value = line.slice(idx + 1).trim();
  if (!key) {
    return null;
  }

  return { key, value };
}

function normalizeRule(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function parseRobotsText(text, originUrl) {
  const rules = {
    allow: [],
    disallow: [],
    crawlDelaySec: undefined,
    sitemaps: []
  };

  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.split('#')[0].trim())
    .filter(Boolean);

  let activeForStar = false;
  let sawUserAgent = false;
  let sawDirective = false;

  for (const line of lines) {
    const parsed = parseDirective(line);
    if (!parsed) {
      continue;
    }

    if (parsed.key === 'user-agent') {
      if (sawUserAgent && sawDirective) {
        activeForStar = false;
        sawDirective = false;
      }

      sawUserAgent = true;
      if (parsed.value.trim() === '*') {
        activeForStar = true;
      }
      continue;
    }

    if (parsed.key === 'sitemap') {
      try {
        const absolute = new URL(parsed.value, originUrl).toString();
        rules.sitemaps.push(absolute);
      } catch (_error) {
        // Ignore invalid sitemap URL.
      }
      continue;
    }

    if (!sawUserAgent) {
      continue;
    }

    sawDirective = true;
    if (!activeForStar) {
      continue;
    }

    if (parsed.key === 'allow') {
      const normalized = normalizeRule(parsed.value);
      if (normalized) {
        rules.allow.push(normalized);
      }
      continue;
    }

    if (parsed.key === 'disallow') {
      const normalized = normalizeRule(parsed.value);
      if (normalized) {
        rules.disallow.push(normalized);
      }
      continue;
    }

    if (parsed.key === 'crawl-delay') {
      const delay = Number.parseFloat(parsed.value);
      if (Number.isFinite(delay) && delay >= 0) {
        rules.crawlDelaySec = delay;
      }
    }
  }

  rules.allow = [...new Set(rules.allow)];
  rules.disallow = [...new Set(rules.disallow)];
  rules.sitemaps = [...new Set(rules.sitemaps)];

  return rules;
}

async function fetchRobots(originUrl, fetchClient, timeoutMs = 3000) {
  let robotsUrl;
  try {
    const parsed = new URL(originUrl);
    robotsUrl = `${parsed.origin}/robots.txt`;
  } catch (_error) {
    return {
      robotsUrl: originUrl,
      rules: { allow: [], disallow: [], sitemaps: [] },
      warning: 'robots_fetch_failed: invalid URL'
    };
  }

  const response = await fetchClient.fetchUrl(robotsUrl, {
    acceptHtmlOnly: false,
    maxRetries: 1,
    timeoutMs
  });

  if (!response.ok) {
    return {
      robotsUrl,
      rules: { allow: [], disallow: [], sitemaps: [] },
      warning: `robots_fetch_failed: ${response.errorMessage || `HTTP ${response.status}`}`
    };
  }

  if (!response.text) {
    return {
      robotsUrl,
      rules: { allow: [], disallow: [], sitemaps: [] },
      warning: 'robots_fetch_failed: empty response body'
    };
  }

  return {
    robotsUrl,
    rules: parseRobotsText(response.text, originUrl)
  };
}

function ruleToRegex(rule) {
  const anchored = rule.endsWith('$');
  const raw = anchored ? rule.slice(0, -1) : rule;
  const escaped = raw
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\*/g, '.*');

  const pattern = `^${escaped}${anchored ? '$' : ''}`;
  return new RegExp(pattern);
}

function matchLength(rule) {
  return String(rule || '').replace(/\*/g, '').replace(/\$/g, '').length;
}

function isAllowedByRobots(rules, urlPath) {
  const path = String(urlPath || '').startsWith('/') ? String(urlPath) : `/${String(urlPath || '')}`;

  const allowMatches = (rules.allow || []).filter((rule) => ruleToRegex(rule).test(path));
  const disallowMatches = (rules.disallow || []).filter((rule) => ruleToRegex(rule).test(path));

  if (!allowMatches.length && !disallowMatches.length) {
    return true;
  }

  const bestAllow = allowMatches.sort((a, b) => matchLength(b) - matchLength(a))[0];
  const bestDisallow = disallowMatches.sort((a, b) => matchLength(b) - matchLength(a))[0];

  const allowLen = bestAllow ? matchLength(bestAllow) : -1;
  const disallowLen = bestDisallow ? matchLength(bestDisallow) : -1;

  if (allowLen === disallowLen) {
    return true;
  }

  return allowLen > disallowLen;
}

module.exports = {
  parseRobotsText,
  fetchRobots,
  isAllowedByRobots
};
