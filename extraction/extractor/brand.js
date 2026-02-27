const { parsePhoneNumberFromString } = require('libphonenumber-js');
const { cleanText, unique, pickSiteNameCandidate, splitTitleChunks } = require('./parse');

const BRAND_NOISE_REGEX = /\b(official|eshop|e-shop|shop|store|online|webshop|skateshop|boutique)\b/gi;
const PRICE_NOISE_REGEX = /\b(za|od|from)\s*\d+[,.]?\d*\s*(k[čc]|czk|eur|usd)?\b/gi;
const BY_SUFFIX_REGEX = /\s+by\s+[^|–—-]+$/i;
const PRODUCT_TITLE_HINT_REGEX = /\b(kc|k[čc]|usd|eur|buy|add to cart|skate deska|trucky|kole[čc]ka|ložiska)\b/i;

function countBy(values) {
  const map = new Map();
  for (const value of values || []) {
    if (!value) continue;
    map.set(value, (map.get(value) || 0) + 1);
  }
  return map;
}

function bestCandidate(values) {
  const counts = countBy(values);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted[0] ? sorted[0][0] : undefined;
}

function normalizePhone(value) {
  const cleaned = cleanText(value);
  if (!cleaned) return null;

  try {
    const parsed = parsePhoneNumberFromString(cleaned);
    if (parsed && parsed.isValid()) {
      return parsed.number;
    }
  } catch (_error) {
    // Ignore parse failures and fallback to raw format.
  }

  return cleaned.length >= 8 ? cleaned : null;
}

function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function cleanBrandCandidate(value) {
  let out = cleanText(value);
  if (!out) return '';

  const chunks = out
    .split(/\||–|—|-/)
    .map((item) => cleanText(item))
    .filter(Boolean);
  if (chunks.length > 1) {
    out = chunks[0];
  }

  out = out.replace(PRICE_NOISE_REGEX, ' ');
  out = out.replace(BRAND_NOISE_REGEX, ' ');
  out = out.replace(BY_SUFFIX_REGEX, ' ');
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

function domainToken(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    const first = host.split('.')[0] || '';
    return cleanBrandCandidate(first);
  } catch (_error) {
    return '';
  }
}

function collectBrandCandidates(pages) {
  const items = [];
  const rootPage = (pages || []).find((page) => {
    try {
      return new URL(page.url).pathname === '/';
    } catch (_error) {
      return false;
    }
  });

  const domainHint = domainToken((rootPage && rootPage.url) || (pages[0] && pages[0].url) || '');
  if (domainHint) {
    items.push({
      value: domainHint,
      score: 1.4,
      source: 'domain',
      reason: 'domain token'
    });
  }

  for (const page of pages || []) {
    const pageIsHome = rootPage ? rootPage.url === page.url : false;

    const push = (value, score, source, reason) => {
      const cleaned = cleanBrandCandidate(value);
      if (!cleaned || cleaned.length < 2 || cleaned.length > 90) {
        return;
      }

      let finalScore = Number(score || 0);
      if (PRODUCT_TITLE_HINT_REGEX.test(cleaned)) {
        finalScore -= 0.6;
      }
      if (/\d/.test(cleaned) && cleaned.length > 18) {
        finalScore -= 0.3;
      }
      if (domainHint && normalizeKey(cleaned).includes(normalizeKey(domainHint))) {
        finalScore += 0.4;
      }
      if (pageIsHome) {
        finalScore += 0.2;
      }

      if (finalScore <= 0.2) {
        return;
      }

      items.push({
        value: cleaned,
        score: Number(finalScore.toFixed(3)),
        source,
        reason,
        pageUrl: page.url
      });
    };

    const siteName = pickSiteNameCandidate(page);
    if (siteName) {
      push(siteName, pageIsHome ? 1.3 : 1.0, 'site_name_candidate', 'pickSiteNameCandidate');
    }

    for (const titleChunk of splitTitleChunks(page.title || '')) {
      push(titleChunk, pageIsHome ? 1.1 : 0.75, 'title_chunk', 'title chunk');
    }

    if (page.headerText) {
      push(page.headerText, pageIsHome ? 0.95 : 0.65, 'header_text', 'header text');
    }

    if (page.meta && page.meta.ogSiteName) {
      push(page.meta.ogSiteName, pageIsHome ? 1.35 : 1.15, 'meta_og_site_name', 'og:site_name');
    }

    if (page.structuredData && Array.isArray(page.structuredData.names)) {
      for (const name of page.structuredData.names) {
        push(name, pageIsHome ? 1.45 : 1.2, 'structured_data_name', 'json-ld name');
      }
    }

    if (page.structuredData && Array.isArray(page.structuredData.legalNames)) {
      for (const name of page.structuredData.legalNames) {
        push(name, pageIsHome ? 1.5 : 1.25, 'structured_data_legal_name', 'json-ld legalName');
      }
    }
  }

  return items;
}

function rankBrandCandidates(candidates) {
  const grouped = new Map();
  for (const candidate of candidates || []) {
    const key = normalizeKey(candidate.value);
    if (!key) continue;
    const current = grouped.get(key) || {
      value: candidate.value,
      score: 0,
      count: 0,
      bestValueScore: -1,
      reasons: new Set(),
      sources: new Set(),
      pageUrls: new Set()
    };

    current.score += Number(candidate.score || 0);
    current.count += 1;
    current.reasons.add(candidate.reason || 'signal');
    current.sources.add(candidate.source || 'unknown');
    if (candidate.pageUrl) {
      current.pageUrls.add(candidate.pageUrl);
    }

    if (candidate.score > current.bestValueScore) {
      current.value = candidate.value;
      current.bestValueScore = candidate.score;
    } else if (
      candidate.score === current.bestValueScore &&
      /^[a-z0-9\s]+$/.test(current.value) &&
      /[A-Z]/.test(candidate.value)
    ) {
      current.value = candidate.value;
    }
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .map((item) => ({
      value: item.value,
      score: Number(item.score.toFixed(3)),
      count: item.count,
      reason: [...item.reasons].join(', '),
      sources: [...item.sources],
      pageUrls: [...item.pageUrls].slice(0, 8)
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.count !== a.count) return b.count - a.count;
      return a.value.length - b.value.length;
    });
}

function pickTagline(pages) {
  const taglineCandidates = [];
  for (const page of pages || []) {
    if (page.headings && page.headings.h1 && page.headings.h1[0]) {
      const candidate = cleanText(page.headings.h1[0]);
      if (candidate.length >= 5 && candidate.length <= 120 && !PRODUCT_TITLE_HINT_REGEX.test(candidate)) {
        taglineCandidates.push(candidate);
      }
    }
    if (page.description) {
      const candidate = cleanText(page.description);
      if (candidate.length >= 8 && candidate.length <= 160) {
        taglineCandidates.push(candidate);
      }
    }
  }

  return bestCandidate(taglineCandidates);
}

function pickPrimaryLogo(logos) {
  const sorted = (logos || [])
    .filter((item) => item && item.url)
    .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0));
  return sorted[0] ? sorted[0].url : undefined;
}

function extractBrand({ pages, plugin }) {
  const logos = [];
  const favicons = [];
  const ogImages = [];
  const twitterImages = [];
  const emails = [];
  const phones = [];
  const addressCandidates = [];
  const candidateSignals = collectBrandCandidates(pages || []);

  const social = {
    instagram: undefined,
    linkedin: undefined,
    facebook: undefined,
    youtube: undefined,
    x: undefined,
    tiktok: undefined
  };

  const trust = {
    partners: false,
    testimonials: false,
    awards: false,
    press: false,
    evidence: []
  };

  for (const page of pages || []) {
    for (const logo of page.logoCandidates || []) {
      logos.push(logo);
    }

    if (page.structuredData && Array.isArray(page.structuredData.logos)) {
      for (const logo of page.structuredData.logos) {
        logos.push({
          url: logo,
          type: 'img',
          confidence: 0.9
        });
      }
    }

    for (const favicon of page.favicons || []) {
      favicons.push(favicon);
    }

    if (page.meta && page.meta.ogImage) {
      ogImages.push(page.meta.ogImage);
      logos.push({ url: page.meta.ogImage, type: 'og-image', confidence: 0.5 });
    }

    if (page.meta && page.meta.twitterImage) {
      twitterImages.push(page.meta.twitterImage);
    }

    for (const email of (page.contacts && page.contacts.emails) || []) {
      emails.push(String(email || '').toLowerCase());
    }

    for (const phone of (page.contacts && page.contacts.phones) || []) {
      const normalized = normalizePhone(phone);
      if (normalized) {
        phones.push(normalized);
      }
    }

    for (const address of (page.contacts && page.contacts.addressCandidates) || []) {
      addressCandidates.push(address);
    }

    for (const key of Object.keys(social)) {
      if (!social[key] && page.socialLinks && page.socialLinks[key]) {
        social[key] = page.socialLinks[key];
      }
    }

    if (page.trustTokens && page.trustTokens.partners) {
      trust.partners = true;
      trust.evidence.push(`partners token on ${page.url}`);
    }
    if (page.trustTokens && page.trustTokens.testimonials) {
      trust.testimonials = true;
      trust.evidence.push(`testimonials token on ${page.url}`);
    }
    if (page.trustTokens && page.trustTokens.awards) {
      trust.awards = true;
      trust.evidence.push(`awards token on ${page.url}`);
    }
    if (page.trustTokens && page.trustTokens.press) {
      trust.press = true;
      trust.evidence.push(`press token on ${page.url}`);
    }
  }

  const pluginExtra =
    plugin && typeof plugin.extractExtraAssets === 'function' ? plugin.extractExtraAssets(pages) || {} : {};

  if (Array.isArray(pluginExtra.logos)) {
    for (const logo of pluginExtra.logos) {
      if (logo && logo.url) {
        logos.push({
          url: logo.url,
          type: logo.type || 'plugin',
          confidence: typeof logo.confidence === 'number' ? logo.confidence : 0.5
        });
      }
    }
  }

  if (Array.isArray(pluginExtra.trustEvidence)) {
    trust.evidence.push(...pluginExtra.trustEvidence.filter(Boolean));
  }

  const rankedNames = rankBrandCandidates(candidateSignals);
  const canonicalName = rankedNames[0] ? rankedNames[0].value : undefined;
  const aliases = rankedNames.slice(1, 6).map((item) => item.value);
  const dedupedLogos = unique(logos.map((item) => JSON.stringify(item))).map((item) => JSON.parse(item)).slice(0, 18);

  return {
    canonicalName,
    aliases,
    nameCandidates: rankedNames.slice(0, 12),
    name: canonicalName,
    tagline: pickTagline(pages || []),
    logos: dedupedLogos.slice(0, 12),
    primaryLogo: pickPrimaryLogo(dedupedLogos),
    favicons: unique(favicons).slice(0, 8),
    images: {
      ogImage: bestCandidate(ogImages),
      twitterImage: bestCandidate(twitterImages)
    },
    social,
    contact: {
      emails: unique(emails).slice(0, 12),
      phones: unique(phones).slice(0, 12),
      addressCandidates: unique(addressCandidates).slice(0, 8)
    },
    trustSignals: {
      partners: trust.partners,
      testimonials: trust.testimonials,
      awards: trust.awards,
      press: trust.press,
      evidence: unique(trust.evidence).slice(0, 18)
    }
  };
}

module.exports = {
  extractBrand
};
