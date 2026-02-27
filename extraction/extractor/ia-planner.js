const PAGE_TYPES = [
  'home',
  'category',
  'product',
  'about',
  'contact',
  'legal',
  'blog',
  'account',
  'checkout',
  'other'
];

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function safeUrl(url) {
  try {
    return new URL(url);
  } catch (_error) {
    return null;
  }
}

function pathSegments(urlObj) {
  return (urlObj.pathname || '/')
    .split('/')
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
}

function classifyByPath(urlObj) {
  const pathname = (urlObj.pathname || '/').toLowerCase();
  const host = (urlObj.hostname || '').toLowerCase();
  const segments = pathSegments(urlObj);
  const joined = segments.join('/');

  if (pathname === '/' || pathname === '') {
    return 'home';
  }

  if (/(cart|checkout|pokladna|kosik|ko[sš]i?k)/.test(joined) || /checkout/.test(host)) {
    return 'checkout';
  }

  if (/(account|login|signin|register|profile|my-account|customer)/.test(joined)) {
    return 'account';
  }

  if (/(privacy|gdpr|terms|conditions|cookies|refund|shipping|returns|imprint|legal)/.test(joined)) {
    return 'legal';
  }

  if (/(about|o-nas|o_nas|team|company|who-we-are|about-us|kontakt|contact)/.test(joined)) {
    if (/(contact|kontakt)/.test(joined)) {
      return 'contact';
    }
    return 'about';
  }

  if (/(blog|news|article|journal|insights)/.test(joined)) {
    return 'blog';
  }

  if (/(product|products|p\/|item|shop\/|shop|goods|zbozi|produkt|kolekce|collections|collections\/all)/.test(joined)) {
    if (/(collections|category|catalog|shop\/c|sortiment|kategorie)/.test(joined)) {
      return 'category';
    }
    return 'product';
  }

  if (segments.length === 1 && !/\d/.test(segments[0])) {
    return 'category';
  }

  if (
    segments.length >= 2 &&
    !/(about|contact|legal|account|checkout|blog)/.test(joined) &&
    /[a-z]/.test(joined)
  ) {
    return 'product';
  }

  return 'other';
}

function classifyByContent(page) {
  const title = String(page && page.title ? page.title : '').toLowerCase();
  const h1 = String(page && page.headings && page.headings.h1 && page.headings.h1[0] ? page.headings.h1[0] : '').toLowerCase();
  const summary = String(page && page.description ? page.description : '').toLowerCase();
  const hay = `${title} ${h1} ${summary}`.trim();

  if (!hay) {
    return null;
  }

  if (/checkout|cart|ko[sš]ik|pokladna/.test(hay)) return 'checkout';
  if (/login|sign in|register|account/.test(hay)) return 'account';
  if (/privacy|terms|cookies|gdpr|legal/.test(hay)) return 'legal';
  if (/contact|kontakt|get in touch/.test(hay)) return 'contact';
  if (/about|o-nas|o nás|our story|who we are|team/.test(hay)) return 'about';
  if (/blog|news|journal/.test(hay)) return 'blog';
  if (/category|collection|shop|catalog/.test(hay)) return 'category';
  if (/\b(za|from|price|k[čc]|usd|eur)\b/.test(hay)) return 'product';

  return null;
}

function inferPageType(page) {
  const parsed = safeUrl(page && page.url);
  if (!parsed) {
    return 'other';
  }

  const byPath = classifyByPath(parsed);
  const byContent = classifyByContent(page);

  if (byContent && ['product', 'category'].includes(byPath) && ['about', 'contact', 'blog'].includes(byContent)) {
    return byPath;
  }

  if (byContent && byPath === 'other') {
    return byContent;
  }

  // Promote contact/legal/account/checkout when content confirms it.
  if (byContent && ['contact', 'legal', 'account', 'checkout'].includes(byContent)) {
    return byContent;
  }

  return byPath;
}

function buildTypeBuckets(values) {
  const buckets = new Map();
  for (const item of values || []) {
    if (!item || !item.url) continue;
    const type = item.pageType || 'other';
    if (!buckets.has(type)) {
      buckets.set(type, []);
    }
    buckets.get(type).push(item.url);
  }
  return buckets;
}

function toPageTypeSummary(type, urls, sampleSize = 6) {
  const uniqueUrls = unique(urls || []);
  return {
    type,
    count: uniqueUrls.length,
    sampleUrls: uniqueUrls.slice(0, sampleSize)
  };
}

function pickOne(urls) {
  return (urls || [])[0] || null;
}

function buildWebsiteStructure({ rootUrl, pages, discoveredUrls = [], siteMapMode = 'template_samples' }) {
  const typedPages = (pages || []).map((page) => ({
    url: page.url,
    pageType: page.pageType || inferPageType(page)
  }));

  const discoveredTyped = (discoveredUrls || []).map((url) => {
    const parsed = safeUrl(url);
    return {
      url,
      pageType: parsed ? classifyByPath(parsed) : 'other'
    };
  });

  const allTyped = [...typedPages, ...discoveredTyped];
  const buckets = buildTypeBuckets(allTyped);
  const pageTypes = PAGE_TYPES.map((type) => toPageTypeSummary(type, buckets.get(type) || []))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);

  const keyPages = {
    home: pickOne((buckets.get('home') || []).concat(rootUrl ? [rootUrl] : [])),
    about: pickOne(buckets.get('about') || []),
    contact: pickOne(buckets.get('contact') || []),
    legal: unique(buckets.get('legal') || []).slice(0, 5),
    blog: unique(buckets.get('blog') || []).slice(0, 5),
    categories: unique(buckets.get('category') || []).slice(0, 8),
    products: unique(buckets.get('product') || []).slice(0, 8),
    account: unique(buckets.get('account') || []).slice(0, 5),
    checkout: unique(buckets.get('checkout') || []).slice(0, 5)
  };

  const sampleUrls = unique(
    pageTypes.flatMap((item) => item.sampleUrls.slice(0, siteMapMode === 'marketing_only' ? 2 : 4))
  );

  return {
    mode: siteMapMode,
    discoveredUrlCount: unique(discoveredUrls).length,
    pageTypes,
    sampleUrls,
    keyPages
  };
}

module.exports = {
  PAGE_TYPES,
  classifyByPath,
  inferPageType,
  buildWebsiteStructure
};
