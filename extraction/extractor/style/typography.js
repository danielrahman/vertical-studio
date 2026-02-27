const GENERIC_FONTS = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'cursive',
  'fantasy'
]);

function cleanFontName(font) {
  return String(font || '')
    .replace(/["']/g, '')
    .trim();
}

function splitFontFamilies(value) {
  return String(value || '')
    .split(',')
    .map((item) => cleanFontName(item))
    .filter((item) => item && !GENERIC_FONTS.has(item.toLowerCase()));
}

function registerFont(map, font, source) {
  const name = cleanFontName(font);
  if (!name || GENERIC_FONTS.has(name.toLowerCase())) {
    return;
  }

  const current = map.get(name) || { font: name, count: 0, sources: new Set() };
  current.count += 1;
  current.sources.add(source);
  map.set(name, current);
}

function parseGoogleFontsFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('fonts.googleapis.com')) {
      return [];
    }

    const family = parsed.searchParams.get('family');
    if (!family) {
      return [];
    }

    return family
      .split('|')
      .map((chunk) => chunk.split(':')[0].replace(/\+/g, ' ').trim())
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function parseFontsFromCss(cssText, source, map) {
  const varRegex = /(--font[\w-]*)\s*:\s*([^;]+);/gi;
  let match = varRegex.exec(cssText);
  while (match) {
    const variable = (match[1] || '').trim();
    const value = match[2] || '';
    for (const family of splitFontFamilies(value)) {
      registerFont(map, family, `${source}:${variable}`);
    }
    match = varRegex.exec(cssText);
  }

  const fontFamilyRegex = /font-family\s*:\s*([^;}{]+);/gi;
  match = fontFamilyRegex.exec(cssText);
  while (match) {
    for (const family of splitFontFamilies(match[1] || '')) {
      registerFont(map, family, source);
    }
    match = fontFamilyRegex.exec(cssText);
  }
}

async function inferTypography({ pages, fetchClient, origin, warnings }) {
  const fontMap = new Map();
  const cssCache = new Map();

  for (const page of pages) {
    for (const cssText of page.inlineStyles || []) {
      parseFontsFromCss(cssText, `inline-style:${page.url}`, fontMap);
    }

    for (const styleAttr of page.inlineStyleAttributes || []) {
      parseFontsFromCss(styleAttr, `inline-attr:${page.url}`, fontMap);
    }

    for (const stylesheetUrl of page.stylesheetLinks || []) {
      const providerFonts = parseGoogleFontsFromUrl(stylesheetUrl);
      for (const family of providerFonts) {
        registerFont(fontMap, family, `provider:${stylesheetUrl}`);
      }

      if (/typekit|adobe\.com/i.test(stylesheetUrl)) {
        registerFont(fontMap, 'Typekit Font', `provider:${stylesheetUrl}`);
      }

      try {
        const parsed = new URL(stylesheetUrl);
        if (parsed.origin !== origin) {
          continue;
        }

        if (!cssCache.has(stylesheetUrl)) {
          const cssResponse = await fetchClient.fetchUrl(stylesheetUrl, {
            acceptHtmlOnly: false,
            maxRetries: 2,
            timeoutMs: 7000
          });

          if (cssResponse.ok) {
            cssCache.set(stylesheetUrl, cssResponse.text || '');
          } else {
            cssCache.set(stylesheetUrl, '');
            warnings.push({
              code: 'css_fetch_failed',
              message: cssResponse.errorMessage || `Unable to fetch stylesheet (${cssResponse.status})`,
              url: stylesheetUrl
            });
          }
        }

        const cssText = cssCache.get(stylesheetUrl);
        if (cssText) {
          parseFontsFromCss(cssText, `stylesheet:${stylesheetUrl}`, fontMap);
        }
      } catch (_error) {
        // Ignore invalid URL values.
      }
    }
  }

  const evidence = [...fontMap.values()]
    .map((entry) => ({
      font: entry.font,
      count: entry.count,
      sources: [...entry.sources].slice(0, 8)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 18);

  const primaryFonts = evidence.slice(0, 2).map((entry) => entry.font);
  const secondaryFonts = evidence
    .slice(2, 6)
    .map((entry) => entry.font)
    .filter((font) => !primaryFonts.includes(font));

  return {
    primaryFonts,
    secondaryFonts,
    evidence
  };
}

module.exports = {
  inferTypography,
  splitFontFamilies,
  parseGoogleFontsFromUrl
};
