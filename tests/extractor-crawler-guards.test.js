const test = require('node:test');
const assert = require('node:assert/strict');

const { parseRobotsText, isAllowedByRobots } = require('../extraction/extractor/robots');
const { fetchSitemapSeeds } = require('../extraction/extractor/sitemap');
const {
  canonicalKey,
  normalizeDiscoveredUrl,
  looksLikeNonHtmlAsset,
  isSameOrigin
} = require('../extraction/extractor/url-utils');
const { HostRateLimiter } = require('../extraction/extractor/rate-limit');
const { FetchClient, MAX_HTML_BYTES } = require('../extraction/extractor/fetch');
const { crawlSite } = require('../extraction/extractor/crawl');

function makeResponse({
  ok = true,
  status = 200,
  url,
  finalUrl,
  redirected = false,
  contentType = 'text/html; charset=utf-8',
  text = '',
  errorCode,
  errorMessage,
  warnings
}) {
  return {
    ok,
    status,
    url,
    finalUrl: finalUrl || url,
    redirected,
    contentType,
    bytes: Buffer.byteLength(text || '', 'utf8'),
    durationMs: 5,
    retries: 0,
    text,
    errorCode,
    errorMessage,
    warnings: warnings || []
  };
}

function createFetchClient(routes) {
  return {
    timeoutMs: 1000,
    async fetchUrl(url) {
      const handler = routes[url];
      if (!handler) {
        return makeResponse({
          ok: false,
          status: 404,
          url,
          contentType: 'text/plain',
          errorCode: 'fetch_error',
          errorMessage: 'HTTP 404'
        });
      }

      if (typeof handler === 'function') {
        return handler(url);
      }

      return handler;
    }
  };
}

test('robots parser supports longest-match and allow tie-break', () => {
  const rules = parseRobotsText(
    [
      'User-agent: *',
      'Disallow: /private',
      'Allow: /private/docs',
      'Disallow: /tmp$',
      'Allow: /tmp/public$',
      'Allow: /same',
      'Disallow: /same',
      'Crawl-delay: 2',
      'Sitemap: /sitemap.xml'
    ].join('\n'),
    'https://example.com'
  );

  assert.equal(isAllowedByRobots(rules, '/private/docs/guide'), true);
  assert.equal(isAllowedByRobots(rules, '/private/area'), false);
  assert.equal(isAllowedByRobots(rules, '/tmp'), false);
  assert.equal(isAllowedByRobots(rules, '/tmp/public'), true);
  assert.equal(isAllowedByRobots(rules, '/same'), true);
  assert.equal(rules.crawlDelaySec, 2);
  assert.equal(rules.sitemaps[0], 'https://example.com/sitemap.xml');
});

test('crawl ignores robots allow/disallow when ignoreRobots=true', async () => {
  const routes = {
    'https://example.com/robots.txt': makeResponse({
      url: 'https://example.com/robots.txt',
      contentType: 'text/plain',
      text: 'User-agent: *\nDisallow: /\nSitemap: https://example.com/sitemap.xml'
    }),
    'https://example.com/sitemap.xml': makeResponse({
      url: 'https://example.com/sitemap.xml',
      contentType: 'application/xml',
      text: '<urlset><url><loc>https://example.com/blocked</loc></url></urlset>'
    }),
    'https://example.com/': makeResponse({
      url: 'https://example.com/',
      text: '<html><body><main><h1>Root</h1><p>Sample content text long enough to parse and keep.</p></main></body></html>'
    }),
    'https://example.com/blocked': makeResponse({
      url: 'https://example.com/blocked',
      text: '<html><body><main><h1>Blocked</h1><p>Still crawled in internal mode.</p></main></body></html>'
    })
  };

  const result = await crawlSite({
    url: 'https://example.com',
    maxPages: 4,
    maxDepth: 2,
    timeoutMs: 2000,
    fetchClient: createFetchClient(routes),
    plugin: { adjustLinkPriority: (_link, score) => score },
    ignoreRobots: true
  });

  assert.equal(result.pages.some((page) => page.url === 'https://example.com/blocked'), true);
});

test('crawl applies robots rules when ignoreRobots=false', async () => {
  const routes = {
    'https://example.com/robots.txt': makeResponse({
      url: 'https://example.com/robots.txt',
      contentType: 'text/plain',
      text: 'User-agent: *\nAllow: /public\nDisallow: /'
    }),
    'https://example.com/sitemap.xml': makeResponse({
      url: 'https://example.com/sitemap.xml',
      contentType: 'application/xml',
      text: '<urlset><url><loc>https://example.com/public</loc></url><url><loc>https://example.com/private</loc></url></urlset>'
    }),
    'https://example.com/': makeResponse({
      url: 'https://example.com/',
      text: '<html><body><main><h1>Root</h1><a href="/private">Private</a><a href="/public">Public</a></main></body></html>'
    }),
    'https://example.com/public': makeResponse({
      url: 'https://example.com/public',
      text: '<html><body><main><h1>Public</h1><p>Allowed.</p></main></body></html>'
    }),
    'https://example.com/private': makeResponse({
      url: 'https://example.com/private',
      text: '<html><body><main><h1>Private</h1><p>Should be blocked.</p></main></body></html>'
    })
  };

  const result = await crawlSite({
    url: 'https://example.com',
    maxPages: 4,
    maxDepth: 2,
    timeoutMs: 2000,
    fetchClient: createFetchClient(routes),
    plugin: { adjustLinkPriority: (_link, score) => score },
    ignoreRobots: false
  });

  assert.equal(result.pages.some((page) => page.url === 'https://example.com/private'), false);
  assert.equal(result.pages.some((page) => page.url === 'https://example.com/public'), true);
});

test('sitemap urlset seeding deduplicates canonical duplicates', async () => {
  const fetchClient = createFetchClient({
    'https://example.com/sitemap.xml': makeResponse({
      url: 'https://example.com/sitemap.xml',
      contentType: 'application/xml',
      text: [
        '<urlset>',
        '<url><loc>https://example.com/projects/?utm_source=test</loc></url>',
        '<url><loc>https://example.com/projects</loc></url>',
        '<url><loc>https://example.com/projects?fbclid=abc</loc></url>',
        '</urlset>'
      ].join('')
    })
  });

  const result = await fetchSitemapSeeds({
    rootUrl: 'https://example.com',
    sitemapUrls: ['https://example.com/sitemap.xml'],
    fetchClient,
    timeoutMs: 1500,
    maxUrls: 120,
    maxFiles: 8,
    maxDepth: 2
  });

  assert.equal(result.urls.length, 1);
  assert.equal(result.urls[0], 'https://example.com/projects');
});

test('sitemap index respects depth and file limits and avoids cycles', async () => {
  const calls = [];
  const fetchClient = {
    timeoutMs: 1000,
    async fetchUrl(url) {
      calls.push(url);
      if (url === 'https://example.com/sitemap.xml') {
        return makeResponse({
          url,
          contentType: 'application/xml',
          text: '<sitemapindex><sitemap><loc>https://example.com/sm-a.xml</loc></sitemap><sitemap><loc>https://example.com/sm-b.xml</loc></sitemap></sitemapindex>'
        });
      }
      if (url === 'https://example.com/sm-a.xml') {
        return makeResponse({
          url,
          contentType: 'application/xml',
          text: '<sitemapindex><sitemap><loc>https://example.com/sitemap.xml</loc></sitemap><sitemap><loc>https://example.com/sm-c.xml</loc></sitemap></sitemapindex>'
        });
      }
      if (url === 'https://example.com/sm-b.xml') {
        return makeResponse({
          url,
          contentType: 'application/xml',
          text: '<urlset><url><loc>https://example.com/a</loc></url></urlset>'
        });
      }
      if (url === 'https://example.com/sm-c.xml') {
        return makeResponse({
          url,
          contentType: 'application/xml',
          text: '<urlset><url><loc>https://example.com/c</loc></url></urlset>'
        });
      }

      return makeResponse({ ok: false, status: 404, url, errorCode: 'fetch_error', errorMessage: 'HTTP 404' });
    }
  };

  const result = await fetchSitemapSeeds({
    rootUrl: 'https://example.com',
    sitemapUrls: ['https://example.com/sitemap.xml'],
    fetchClient,
    timeoutMs: 1500,
    maxUrls: 120,
    maxFiles: 3,
    maxDepth: 2
  });

  assert.equal(result.urls.includes('https://example.com/a'), true);
  assert.equal(calls.length <= 3, true);
});

test('url canonicalization removes tracking params and normalizes slash/hash', () => {
  assert.equal(
    canonicalKey('https://Example.com/projects/?utm_source=x&b=2&a=1#frag'),
    'https://example.com/projects?a=1&b=2'
  );

  assert.equal(
    normalizeDiscoveredUrl('/about?fbclid=123#hero', 'https://example.com'),
    'https://example.com/about'
  );

  assert.equal(looksLikeNonHtmlAsset('https://example.com/file.pdf'), true);
  assert.equal(looksLikeNonHtmlAsset('https://example.com/about'), false);
  assert.equal(isSameOrigin('https://example.com/a', 'https://example.com/b'), true);
});

test('host limiter enforces minimum delay on same host', async () => {
  const limiter = new HostRateLimiter({ minDelayMs: 30, jitterMs: 0, cooldownCapMs: 2000 });

  await limiter.wait('https://example.com/a');
  const start = Date.now();
  await limiter.wait('https://example.com/b');
  const elapsed = Date.now() - start;

  assert.equal(elapsed >= 25, true);
});

test('fetch guard rejects oversized body by content-length header', async () => {
  const previousFetch = global.fetch;
  const client = new FetchClient({ timeoutMs: 1000, maxRetries: 1 });

  global.fetch = async () => {
    return new Response('', {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-length': String(MAX_HTML_BYTES + 32)
      }
    });
  };

  try {
    const result = await client.fetchUrl('https://example.com');
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'body_too_large_header');
  } finally {
    global.fetch = previousFetch;
  }
});

test('fetch guard truncates streamed body and emits body_truncated warning', async () => {
  const previousFetch = global.fetch;
  const client = new FetchClient({ timeoutMs: 1000, maxRetries: 1 });

  global.fetch = async () => {
    return new Response('x'.repeat(MAX_HTML_BYTES + 300), {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8'
      }
    });
  };

  try {
    const result = await client.fetchUrl('https://example.com');
    assert.equal(result.ok, true);
    assert.equal(result.bytes, MAX_HTML_BYTES);
    assert.equal(result.warnings.some((warning) => warning.code === 'body_truncated'), true);
  } finally {
    global.fetch = previousFetch;
  }
});

test('fetch retries only on 429/5xx and records retryable_status', async () => {
  const previousFetch = global.fetch;
  const client = new FetchClient({ timeoutMs: 1000, maxRetries: 3 });

  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response('temporary', {
        status: 503,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    return new Response('<html><body>ok</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' }
    });
  };

  try {
    const result = await client.fetchUrl('https://example.com');
    assert.equal(calls, 2);
    assert.equal(result.ok, true);
    assert.equal(result.warnings.some((warning) => warning.code === 'retryable_status'), true);
  } finally {
    global.fetch = previousFetch;
  }

  calls = 0;
  global.fetch = async () => {
    calls += 1;
    return new Response('not found', {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' }
    });
  };

  try {
    const result = await client.fetchUrl('https://example.com/missing');
    assert.equal(calls, 1);
    assert.equal(result.ok, false);
    assert.equal(result.warnings.some((warning) => warning.code === 'retryable_status'), false);
  } finally {
    global.fetch = previousFetch;
  }
});

test('crawl gains coverage from sitemap seeds when no links exist on root page', async () => {
  const baseRoutes = {
    'https://example.com/': makeResponse({
      url: 'https://example.com/',
      text: '<html><body><main><h1>Root</h1><p>No links here.</p></main></body></html>'
    })
  };

  const noSitemapClient = createFetchClient({
    ...baseRoutes,
    'https://example.com/robots.txt': makeResponse({
      url: 'https://example.com/robots.txt',
      contentType: 'text/plain',
      text: 'User-agent: *'
    }),
    'https://example.com/sitemap.xml': makeResponse({
      ok: false,
      status: 404,
      url: 'https://example.com/sitemap.xml',
      errorCode: 'fetch_error',
      errorMessage: 'HTTP 404'
    })
  });

  const withSitemapClient = createFetchClient({
    ...baseRoutes,
    'https://example.com/robots.txt': makeResponse({
      url: 'https://example.com/robots.txt',
      contentType: 'text/plain',
      text: 'User-agent: *\nSitemap: https://example.com/sitemap.xml'
    }),
    'https://example.com/sitemap.xml': makeResponse({
      url: 'https://example.com/sitemap.xml',
      contentType: 'application/xml',
      text: '<urlset><url><loc>https://example.com/page-two</loc></url></urlset>'
    }),
    'https://example.com/page-two': makeResponse({
      url: 'https://example.com/page-two',
      text: '<html><body><main><h1>Page Two</h1><p>Discovered by sitemap.</p></main></body></html>'
    })
  });

  const baseline = await crawlSite({
    url: 'https://example.com',
    maxPages: 4,
    maxDepth: 2,
    timeoutMs: 2000,
    fetchClient: noSitemapClient,
    plugin: { adjustLinkPriority: (_link, score) => score },
    ignoreRobots: true
  });

  const improved = await crawlSite({
    url: 'https://example.com',
    maxPages: 4,
    maxDepth: 2,
    timeoutMs: 2000,
    fetchClient: withSitemapClient,
    plugin: { adjustLinkPriority: (_link, score) => score },
    ignoreRobots: true
  });

  assert.equal(improved.crawl.pagesCrawled >= baseline.crawl.pagesCrawled, true);
  assert.equal(improved.crawl.pagesCrawled > 1, true);
});
