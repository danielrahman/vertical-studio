const { buildWarning } = require('../crawl');

const COLOR_TOKEN_REGEX = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|rgba?\([^\)]+\)|hsla?\([^\)]+\)/g;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeHex(hex) {
  const clean = String(hex || '').trim().replace('#', '');
  if (clean.length === 3) {
    return `#${clean
      .split('')
      .map((char) => `${char}${char}`)
      .join('')
      .toLowerCase()}`;
  }

  if (clean.length === 8) {
    return `#${clean.slice(0, 6).toLowerCase()}`;
  }

  if (clean.length === 6) {
    return `#${clean.toLowerCase()}`;
  }

  return null;
}

function hslToRgb(h, s, l) {
  const sat = s / 100;
  const light = l / 100;

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h >= 0 && h < 60) [r, g, b] = [c, x, 0];
  else if (h >= 60 && h < 120) [r, g, b] = [x, c, 0];
  else if (h >= 120 && h < 180) [r, g, b] = [0, c, x];
  else if (h >= 180 && h < 240) [r, g, b] = [0, x, c];
  else if (h >= 240 && h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
  }

  h = Math.round(h * 60);
  if (h < 0) h += 360;

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return {
    h,
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

function parseRgbToken(token) {
  const match = token.match(/rgba?\(([^\)]+)\)/i);
  if (!match) return null;
  const parts = match[1]
    .split(',')
    .map((part) => part.trim())
    .slice(0, 3)
    .map((value) => Number.parseFloat(value));

  if (parts.length < 3 || parts.some((value) => !Number.isFinite(value))) {
    return null;
  }

  return {
    r: clamp(Math.round(parts[0]), 0, 255),
    g: clamp(Math.round(parts[1]), 0, 255),
    b: clamp(Math.round(parts[2]), 0, 255)
  };
}

function parseHslToken(token) {
  const match = token.match(/hsla?\(([^\)]+)\)/i);
  if (!match) return null;
  const parts = match[1].split(',').map((part) => part.trim());
  if (parts.length < 3) return null;

  const h = Number.parseFloat(parts[0]);
  const s = Number.parseFloat(parts[1].replace('%', ''));
  const l = Number.parseFloat(parts[2].replace('%', ''));

  if (![h, s, l].every((value) => Number.isFinite(value))) {
    return null;
  }

  return hslToRgb(((h % 360) + 360) % 360, clamp(s, 0, 100), clamp(l, 0, 100));
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((value) => clamp(value, 0, 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

function parseColorToken(token) {
  if (!token) return null;
  const value = token.trim();

  if (value.startsWith('#')) {
    const hex = normalizeHex(value);
    if (!hex) return null;
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    return { hex, hsl: rgbToHsl(r, g, b) };
  }

  if (/^rgba?\(/i.test(value)) {
    const rgb = parseRgbToken(value);
    if (!rgb) return null;
    return { hex: rgbToHex(rgb), hsl: rgbToHsl(rgb.r, rgb.g, rgb.b) };
  }

  if (/^hsla?\(/i.test(value)) {
    const rgb = parseHslToken(value);
    if (!rgb) return null;
    return { hex: rgbToHex(rgb), hsl: rgbToHsl(rgb.r, rgb.g, rgb.b) };
  }

  return null;
}

function extractColorTokens(text) {
  if (!text) return [];
  const matches = String(text).match(COLOR_TOKEN_REGEX) || [];
  return matches.map((item) => item.trim()).filter(Boolean);
}

function addEvidence(map, token, weight, source) {
  const parsed = parseColorToken(token);
  if (!parsed || !parsed.hex) {
    return;
  }

  const current =
    map.get(parsed.hex) ||
    ({
      colorHex: parsed.hex,
      hsl: parsed.hsl,
      count: 0,
      weightedScore: 0,
      sources: new Set()
    });

  current.count += 1;
  current.weightedScore += weight;
  current.sources.add(source);
  map.set(parsed.hex, current);
}

function isLight({ h, s, l }) {
  return l >= 85 || (l >= 78 && s <= 10);
}

function isDark({ h, s, l }) {
  return l <= 30;
}

function isColorful({ h, s, l }) {
  return s >= 20 && l >= 12 && l <= 88;
}

function choosePalette(evidence) {
  if (!evidence.length) {
    return {
      primary: undefined,
      secondary: undefined,
      accent: undefined,
      background: undefined,
      text: undefined
    };
  }

  const primary = evidence.find((entry) => isColorful(entry.hsl)) || evidence[0];
  const secondary = evidence.find((entry) => entry.colorHex !== primary.colorHex && isColorful(entry.hsl));
  const accent =
    evidence
      .filter((entry) => entry.colorHex !== primary.colorHex)
      .sort((a, b) => b.hsl.s - a.hsl.s)[0] || secondary;
  const background = evidence.find((entry) => isLight(entry.hsl)) || evidence[evidence.length - 1];
  const text = evidence.find((entry) => isDark(entry.hsl)) || primary;

  return {
    primary: primary && primary.colorHex,
    secondary: secondary && secondary.colorHex,
    accent: accent && accent.colorHex,
    background: background && background.colorHex,
    text: text && text.colorHex
  };
}

async function inferColors({ pages, fetchClient, warnings, origin }) {
  const evidenceMap = new Map();
  const cssCache = new Map();

  const registerCssText = (cssText, source, defaultWeight = 2) => {
    for (const token of extractColorTokens(cssText)) {
      addEvidence(evidenceMap, token, defaultWeight, source);
    }

    const varRegex = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let match = varRegex.exec(cssText);
    while (match) {
      const varName = (match[1] || '').toLowerCase();
      const value = match[2] || '';
      const brandWeight = /primary|brand|accent|secondary|text|background|bg/.test(varName) ? 6 : 3;

      for (const token of extractColorTokens(value)) {
        addEvidence(evidenceMap, token, brandWeight, `var:${varName}`);
      }

      match = varRegex.exec(cssText);
    }
  };

  for (const page of pages) {
    if (page.meta.themeColor) {
      addEvidence(evidenceMap, page.meta.themeColor, 9, `theme-color:${page.url}`);
    }

    for (const cssText of page.inlineStyles || []) {
      registerCssText(cssText, `inline-style:${page.url}`, 2);
    }

    for (const styleAttr of page.inlineStyleAttributes || []) {
      registerCssText(styleAttr, `inline-attr:${page.url}`, 2);
    }

    for (const stylesheetUrl of page.stylesheetLinks || []) {
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

          if (!cssResponse.ok) {
            warnings.push(
              buildWarning(
                'css_fetch_failed',
                cssResponse.errorMessage || `Unable to fetch stylesheet (${cssResponse.status})`,
                stylesheetUrl
              )
            );
            cssCache.set(stylesheetUrl, '');
          } else {
            cssCache.set(stylesheetUrl, cssResponse.text || '');
          }
        }

        const cssText = cssCache.get(stylesheetUrl);
        if (cssText) {
          registerCssText(cssText, `stylesheet:${stylesheetUrl}`, 2);
        }
      } catch (_error) {
        // Ignore invalid stylesheet URLs.
      }
    }
  }

  const evidence = [...evidenceMap.values()]
    .map((entry) => ({
      colorHex: entry.colorHex,
      hsl: entry.hsl,
      count: entry.count,
      weightedScore: Number(entry.weightedScore.toFixed(3)),
      sources: [...entry.sources].slice(0, 8)
    }))
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .slice(0, 18);

  const palette = choosePalette(evidence);

  return {
    ...palette,
    evidence
  };
}

module.exports = {
  inferColors,
  extractColorTokens,
  parseColorToken,
  rgbToHsl
};
