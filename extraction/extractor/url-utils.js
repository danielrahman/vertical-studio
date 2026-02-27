const TRACKING_PARAM_PREFIXES = ['utm_'];
const TRACKING_PARAMS = new Set(['gclid', 'fbclid']);
const DROP_PARAMS = new Set(['ref', 'source']);

const NON_HTML_EXTENSIONS = [
  '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico',
  '.css', '.js', '.mjs', '.cjs', '.json', '.xml', '.txt',
  '.mp4', '.mov', '.webm', '.mp3', '.wav',
  '.zip', '.rar', '.7z', '.tar', '.gz',
  '.woff', '.woff2', '.ttf', '.otf', '.map'
];

function cleanQueryParams(urlObject) {
  const keys = [];
  for (const [key] of urlObject.searchParams.entries()) {
    const lower = key.toLowerCase();
    if (TRACKING_PARAMS.has(lower)) {
      keys.push(key);
      continue;
    }
    if (DROP_PARAMS.has(lower)) {
      keys.push(key);
      continue;
    }
    if (TRACKING_PARAM_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
      keys.push(key);
    }
  }

  for (const key of keys) {
    urlObject.searchParams.delete(key);
  }
}

function stripTrailingSlashExceptRoot(urlObject) {
  if (urlObject.pathname !== '/' && urlObject.pathname.endsWith('/')) {
    urlObject.pathname = urlObject.pathname.slice(0, -1);
  }
}

function normalizeUrlObject(urlObject) {
  if (!['http:', 'https:'].includes(urlObject.protocol)) {
    throw new Error('Only http and https URLs are supported');
  }

  urlObject.hash = '';

  if (
    (urlObject.protocol === 'https:' && urlObject.port === '443') ||
    (urlObject.protocol === 'http:' && urlObject.port === '80')
  ) {
    urlObject.port = '';
  }

  if (!urlObject.pathname) {
    urlObject.pathname = '/';
  }

  urlObject.hostname = urlObject.hostname.toLowerCase();
  cleanQueryParams(urlObject);
  stripTrailingSlashExceptRoot(urlObject);

  return urlObject;
}

function canonicalKey(urlStr) {
  const urlObject = normalizeUrlObject(new URL(urlStr));

  const queryEntries = [...urlObject.searchParams.entries()].sort((a, b) => {
    if (a[0] !== b[0]) return a[0].localeCompare(b[0]);
    return a[1].localeCompare(b[1]);
  });

  urlObject.search = '';
  for (const [key, value] of queryEntries) {
    urlObject.searchParams.append(key, value);
  }

  return urlObject.toString();
}

function normalizeDiscoveredUrl(href, baseUrl) {
  const raw = String(href || '').trim();
  if (!raw || raw.startsWith('#')) {
    return null;
  }

  const lower = raw.toLowerCase();
  if (lower.startsWith('mailto:') || lower.startsWith('tel:') || lower.startsWith('javascript:')) {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(raw, baseUrl);
  } catch (_error) {
    return null;
  }

  try {
    return normalizeUrlObject(parsed).toString();
  } catch (_error) {
    return null;
  }
}

function isSameOrigin(a, b) {
  try {
    const aa = new URL(a);
    const bb = new URL(b);
    return aa.protocol === bb.protocol && aa.host === bb.host;
  } catch (_error) {
    return false;
  }
}

function looksLikeNonHtmlAsset(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const pathname = parsed.pathname.toLowerCase();
    return NON_HTML_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch (_error) {
    return true;
  }
}

function keywordScore(urlStr) {
  const keywords = [
    ['contact', 100],
    ['about', 90],
    ['company', 80],
    ['team', 75],
    ['services', 70],
    ['solutions', 65],
    ['projects', 60],
    ['portfolio', 60],
    ['references', 55],
    ['pricing', 50],
    ['faq', 45],
    ['kontakt', 100],
    ['o-nas', 80],
    ['sluzby', 70],
    ['projekty', 60],
    ['reference', 55]
  ];

  try {
    const parsed = new URL(urlStr);
    const pathname = parsed.pathname.toLowerCase();
    let score = 0;

    for (const [keyword, weight] of keywords) {
      if (pathname.includes(keyword)) {
        score += weight;
      }
    }

    score += Math.max(0, 10 - pathname.split('/').filter(Boolean).length);
    return score;
  } catch (_error) {
    return 0;
  }
}

module.exports = {
  canonicalKey,
  normalizeDiscoveredUrl,
  isSameOrigin,
  looksLikeNonHtmlAsset,
  keywordScore,
  cleanQueryParams
};
