const { load } = require('cheerio');

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_REGEX = /(\+?\d[\d\s().-]{7,}\d)/g;
const TITLE_SPLIT_REGEX = /\||-|–|—|•|·|:|\//;

function clampText(value, max = 320) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
}

function normalizeEmail(value) {
  const raw = cleanText(safeDecode(value || '')).toLowerCase();
  if (!raw || raw.includes('?') || raw.includes('&') || raw.includes('=') || /\s/.test(raw)) {
    return null;
  }

  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(raw)) {
    return null;
  }

  if (/^(subject|body|mailto):/.test(raw)) {
    return null;
  }

  return raw;
}

function normalizePhoneCandidate(value) {
  const raw = cleanText(String(value || ''));
  if (!raw) {
    return null;
  }

  if (/[a-zA-Z]/.test(raw)) {
    return null;
  }

  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    return null;
  }

  if ((raw.match(/\./g) || []).length >= 3 && (raw.match(/\s/g) || []).length >= 2) {
    // Product-size like "7.875 8.0 8.125 ..."
    return null;
  }

  if (/^0{6,}$/.test(digits) || /^1{6,}$/.test(digits)) {
    return null;
  }

  return raw;
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function normalizeUrl(input, baseUrl) {
  const url = baseUrl ? new URL(input, baseUrl) : new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http and https URLs are supported');
  }
  url.hash = '';
  return url.toString();
}

function toAbsoluteUrl(href, pageUrl) {
  try {
    return normalizeUrl(href, pageUrl);
  } catch (_error) {
    return null;
  }
}

function pickHeadings($) {
  return {
    h1: unique(
      $('h1')
        .toArray()
        .map((el) => cleanText($(el).text()))
        .filter(Boolean)
    ).slice(0, 8),
    h2: unique(
      $('h2')
        .toArray()
        .map((el) => cleanText($(el).text()))
        .filter(Boolean)
    ).slice(0, 20),
    h3: unique(
      $('h3')
        .toArray()
        .map((el) => cleanText($(el).text()))
        .filter(Boolean)
    ).slice(0, 24)
  };
}

function getMetaContent($, selector) {
  return cleanText($(selector).attr('content') || '');
}

function flattenJsonLdNode(node, out) {
  if (!node || typeof node !== 'object') {
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      flattenJsonLdNode(item, out);
    }
    return;
  }

  const typeRaw = node['@type'];
  const typeList = Array.isArray(typeRaw) ? typeRaw.map((item) => String(item || '').toLowerCase()) : [String(typeRaw || '').toLowerCase()];
  const type = typeList.join(' ');

  const name = cleanText(node.name || '');
  const legalName = cleanText(node.legalName || node.legal_name || '');
  const alternateName = cleanText(node.alternateName || node.alternate_name || '');
  const url = cleanText(node.url || '');

  if (/organization|corporation|localbusiness|store|brand|website/.test(type)) {
    if (name) out.names.push(name);
    if (legalName) out.legalNames.push(legalName);
    if (alternateName) out.names.push(alternateName);
    if (url) out.urls.push(url);
  }

  if (node.logo) {
    const logo = node.logo;
    if (typeof logo === 'string') {
      out.logos.push(logo);
    } else if (logo && typeof logo === 'object') {
      if (logo.url) out.logos.push(String(logo.url));
      if (logo.contentUrl) out.logos.push(String(logo.contentUrl));
    }
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') {
      flattenJsonLdNode(value, out);
    }
  }
}

function collectStructuredData($, pageUrl) {
  const out = {
    names: [],
    legalNames: [],
    urls: [],
    logos: []
  };

  $('script[type="application/ld+json"]').each((_idx, el) => {
    const raw = String($(el).html() || '').trim();
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      flattenJsonLdNode(parsed, out);
    } catch (_error) {
      // Ignore malformed JSON-LD blocks.
    }
  });

  return {
    names: unique(out.names).slice(0, 12),
    legalNames: unique(out.legalNames).slice(0, 12),
    urls: unique(out.urls)
      .map((url) => toAbsoluteUrl(url, pageUrl))
      .filter(Boolean)
      .slice(0, 12),
    logos: unique(out.logos)
      .map((logo) => toAbsoluteUrl(logo, pageUrl))
      .filter(Boolean)
      .slice(0, 12)
  };
}

function collectFavicons($, pageUrl) {
  return unique(
    $('link[rel]')
      .toArray()
      .map((el) => {
        const rel = String($(el).attr('rel') || '').toLowerCase();
        if (!/(^|\s)(icon|shortcut icon|apple-touch-icon)(\s|$)/.test(rel)) {
          return null;
        }

        return toAbsoluteUrl($(el).attr('href'), pageUrl);
      })
      .filter(Boolean)
  );
}

function collectLogoCandidates($, pageUrl) {
  const candidates = [];

  $('header img, nav img, img').each((_idx, el) => {
    const node = $(el);
    const alt = cleanText(node.attr('alt') || '');
    const klass = String(node.attr('class') || '').toLowerCase();
    const id = String(node.attr('id') || '').toLowerCase();
    const hay = `${alt} ${klass} ${id}`;
    if (!/logo|brand/.test(hay)) {
      return;
    }

    const src = toAbsoluteUrl(node.attr('src'), pageUrl);
    if (!src) {
      return;
    }

    candidates.push({
      url: src,
      type: 'img',
      confidence: alt.toLowerCase().includes('logo') ? 0.95 : 0.75
    });
  });

  $('header svg, nav svg, svg').each((_idx, el) => {
    const node = $(el);
    const klass = String(node.attr('class') || '').toLowerCase();
    const id = String(node.attr('id') || '').toLowerCase();
    const ariaLabel = cleanText(node.attr('aria-label') || '');
    const hay = `${klass} ${id} ${ariaLabel}`;
    if (!/logo|brand/.test(hay)) {
      return;
    }

    candidates.push({
      url: `${pageUrl}#${id || `logo-svg-${candidates.length + 1}`}`,
      type: 'svg',
      confidence: 0.7
    });
  });

  return unique(candidates.map((item) => JSON.stringify(item))).map((json) => JSON.parse(json));
}

function collectSocialLinks($, pageUrl) {
  const social = {
    instagram: null,
    linkedin: null,
    facebook: null,
    youtube: null,
    x: null,
    tiktok: null
  };

  $('a[href]').each((_idx, el) => {
    const href = toAbsoluteUrl($(el).attr('href'), pageUrl);
    if (!href) {
      return;
    }

    const hay = href.toLowerCase();
    if (!social.instagram && hay.includes('instagram.com')) social.instagram = href;
    if (!social.linkedin && hay.includes('linkedin.com')) social.linkedin = href;
    if (!social.facebook && hay.includes('facebook.com')) social.facebook = href;
    if (!social.youtube && (hay.includes('youtube.com') || hay.includes('youtu.be'))) social.youtube = href;
    if (!social.x && (hay.includes('twitter.com') || hay.includes('x.com'))) social.x = href;
    if (!social.tiktok && hay.includes('tiktok.com')) social.tiktok = href;
  });

  return social;
}

function collectContactCandidates($) {
  const bodyText = cleanText($('body').text());
  const emails = [];
  const phones = [];

  for (const value of bodyText.match(EMAIL_REGEX) || []) {
    const normalized = normalizeEmail(value);
    if (normalized) {
      emails.push(normalized);
    }
  }

  for (const value of bodyText.match(PHONE_REGEX) || []) {
    const normalized = normalizePhoneCandidate(value);
    if (normalized) {
      phones.push(normalized);
    }
  }

  $('a[href^="mailto:"]').each((_idx, el) => {
    const hrefRaw = String($(el).attr('href') || '').replace(/^mailto:/i, '').trim();
    const local = safeDecode(hrefRaw).split('?')[0];
    for (const candidate of local.split(',')) {
      const normalized = normalizeEmail(candidate);
      if (normalized) {
        emails.push(normalized);
      }
    }
  });

  $('a[href^="tel:"]').each((_idx, el) => {
    const href = String($(el).attr('href') || '').replace(/^tel:/i, '').trim();
    const normalized = normalizePhoneCandidate(href);
    if (normalized) {
      phones.push(normalized);
    }
  });

  const addressCandidates = unique(
    $('address, [class*="address"], [id*="address"], [itemprop="address"]')
      .toArray()
      .map((el) => cleanText($(el).text()))
      .filter((value) => value.length > 18)
  ).slice(0, 8);

  return {
    emails: unique(emails).slice(0, 15),
    phones: unique(phones).slice(0, 20),
    addressCandidates
  };
}

function collectStyleSignals($, pageUrl) {
  const inlineStyles = $('style')
    .toArray()
    .map((el) => String($(el).html() || ''))
    .filter(Boolean);

  const stylesheetLinks = unique(
    $('link[rel="stylesheet"], link[as="style"]').toArray()
      .map((el) => toAbsoluteUrl($(el).attr('href'), pageUrl))
      .filter(Boolean)
  );

  const inlineStyleAttributes = unique(
    $('[style]')
      .toArray()
      .map((el) => cleanText($(el).attr('style') || ''))
      .filter(Boolean)
  ).slice(0, 200);

  return {
    inlineStyles,
    stylesheetLinks,
    inlineStyleAttributes
  };
}

function collectCandidateLinks($, pageUrl) {
  const links = [];

  const selectors = [
    { selector: 'header a[href], nav a[href]', context: 'nav' },
    { selector: 'footer a[href]', context: 'footer' },
    {
      selector:
        'a[href][class*="btn"], a[href][class*="cta"], a[href][role="button"], .btn a[href], .cta a[href], main a[href]',
      context: 'cta'
    }
  ];

  for (const config of selectors) {
    $(config.selector).each((_idx, el) => {
      const url = toAbsoluteUrl($(el).attr('href'), pageUrl);
      if (!url) {
        return;
      }

      const label = cleanText($(el).text()) || cleanText($(el).attr('aria-label') || '');
      links.push({
        url,
        label: label || null,
        context: config.context
      });
    });
  }

  return unique(links.map((item) => `${item.url}|||${item.label || ''}|||${item.context}`)).map((entry) => {
    const [url, label, context] = entry.split('|||');
    return {
      url,
      label: label || null,
      context
    };
  });
}

function inferSectionFeatures(node, $, pageUrl, sourceTag) {
  const heading = cleanText(node.find('h1,h2,h3').first().text());
  const summary = clampText(cleanText(node.find('p').first().text()) || cleanText(node.text()), 260);

  const bullets = unique(
    node
      .find('li')
      .toArray()
      .map((el) => clampText(cleanText($(el).text()), 120))
      .filter(Boolean)
  ).slice(0, 6);

  const ctas = unique(
    node
      .find('a[href]')
      .toArray()
      .map((el) => {
        const url = toAbsoluteUrl($(el).attr('href'), pageUrl);
        if (!url) {
          return null;
        }

        const label = cleanText($(el).text()) || cleanText($(el).attr('aria-label') || '') || 'Learn more';
        return JSON.stringify({ label: clampText(label, 64), url });
      })
      .filter(Boolean)
  )
    .map((item) => JSON.parse(item))
    .slice(0, 4);

  const text = cleanText(node.text()).toLowerCase();
  const hasForm = node.find('form').length > 0;
  const hasMap =
    node.find('iframe[src*="maps"], iframe[src*="mapbox"], [class*="map"]').length > 0 || /\bmap\b/.test(text);
  const hasQuote = node.find('blockquote').length > 0 || /“|”|"/.test(node.text());
  const hasStars = /★|\bstar\b|\b5\/5\b/.test(text);
  const hasPeople = /team|founder|architect|engineer|director|our people|member/.test(text);
  const legalLinkCount = node.find('a[href*="privacy"], a[href*="terms"], a[href*="cookie"]').length;
  const questionCount = (node.text().match(/\?/g) || []).length;

  return {
    title: heading || undefined,
    summary: summary || undefined,
    bullets: bullets.length ? bullets : undefined,
    ctas,
    sourceTag,
    sourcePageUrl: pageUrl,
    _features: {
      hasForm,
      hasMap,
      hasQuote,
      hasStars,
      hasPeople,
      legalLinkCount,
      questionCount,
      text
    }
  };
}

function detectSectionCandidates($, pageUrl) {
  const nodes = [];
  $('section, article, main > section, main > article, main > div, footer').each((_idx, el) => {
    nodes.push(el);
  });

  const candidates = nodes
    .slice(0, 30)
    .map((el) => {
      const node = $(el);
      const tag = String((el && el.tagName) || '').toLowerCase() || 'div';
      return inferSectionFeatures(node, $, pageUrl, tag);
    })
    .filter((candidate) => {
      const hasText = (candidate.summary || '').length > 24;
      const hasHeading = Boolean(candidate.title);
      const hasBullets = Array.isArray(candidate.bullets) && candidate.bullets.length > 0;
      return hasText || hasHeading || hasBullets;
    });

  return candidates;
}

function splitTitleChunks(title) {
  return unique(
    String(title || '')
      .split(TITLE_SPLIT_REGEX)
      .map((value) => cleanText(value))
      .filter((value) => value.length >= 2 && value.length <= 90)
  ).slice(0, 8);
}

function parseHtmlPage({ html, pageUrl }) {
  const $ = load(html);
  const headings = pickHeadings($);
  const title = cleanText($('title').first().text()) || undefined;
  const description = getMetaContent($, 'meta[name="description"]') || undefined;
  const textSamples = unique(
    $('p')
      .toArray()
      .map((el) => clampText(cleanText($(el).text()), 280))
      .filter((text) => text.length > 50)
  ).slice(0, 12);

  const rawText = cleanText($('body').text());
  const structuredData = collectStructuredData($, pageUrl);
  const meta = {
    ogSiteName: getMetaContent($, 'meta[property="og:site_name"]') || undefined,
    ogImage: toAbsoluteUrl(getMetaContent($, 'meta[property="og:image"]'), pageUrl) || undefined,
    twitterImage: toAbsoluteUrl(getMetaContent($, 'meta[name="twitter:image"]'), pageUrl) || undefined,
    themeColor: getMetaContent($, 'meta[name="theme-color"]') || undefined
  };

  const styleSignals = collectStyleSignals($, pageUrl);

  return {
    url: pageUrl,
    html,
    htmlSize: Buffer.byteLength(html, 'utf8'),
    title,
    description,
    headings,
    textSamples,
    links: collectCandidateLinks($, pageUrl),
    sectionCandidates: detectSectionCandidates($, pageUrl),
    meta,
    structuredData,
    favicons: collectFavicons($, pageUrl),
    logoCandidates: collectLogoCandidates($, pageUrl),
    socialLinks: collectSocialLinks($, pageUrl),
    contacts: collectContactCandidates($),
    inlineStyles: styleSignals.inlineStyles,
    stylesheetLinks: styleSignals.stylesheetLinks,
    inlineStyleAttributes: styleSignals.inlineStyleAttributes,
    headerText: clampText(cleanText($('header').first().text()), 140) || undefined,
    rawText,
    trustTokens: {
      partners: /partner|clients|trusted by/.test(rawText.toLowerCase()),
      testimonials: /testimonial|what clients say|reviews/.test(rawText.toLowerCase()),
      awards: /award|winner|certified/.test(rawText.toLowerCase()),
      press: /press|featured in|media/.test(rawText.toLowerCase())
    }
  };
}

function pickSiteNameCandidate(page) {
  if (page.structuredData && Array.isArray(page.structuredData.names) && page.structuredData.names.length) {
    return page.structuredData.names[0];
  }

  if (page.meta.ogSiteName) {
    return page.meta.ogSiteName;
  }

  if (page.title) {
    const chunks = splitTitleChunks(page.title);
    return chunks[0] || page.title;
  }

  return undefined;
}

module.exports = {
  cleanText,
  unique,
  normalizeUrl,
  toAbsoluteUrl,
  pickHeadings,
  parseHtmlPage,
  pickSiteNameCandidate,
  detectSectionCandidates,
  splitTitleChunks,
  normalizeEmail,
  normalizePhoneCandidate
};
