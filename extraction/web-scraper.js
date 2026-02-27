const { load } = require('cheerio');
const { ExtractionError } = require('./errors');

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_REGEX = /(\+?\d[\d\s().-]{7,}\d)/g;

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function textContent($node) {
  return String($node.text() || '')
    .replace(/\s+/g, ' ')
    .trim();
}

class WebScraper {
  constructor(options = {}) {
    this.timeoutMs = Number(options.timeoutMs || process.env.VERTICAL_SCRAPER_TIMEOUT_MS || 8000);
  }

  async extract(websiteUrl) {
    let parsedUrl;
    try {
      parsedUrl = new URL(websiteUrl);
    } catch (_error) {
      throw new ExtractionError('Invalid websiteUrl format', 400, 'invalid_website_url');
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new ExtractionError('websiteUrl must use http or https protocol', 400, 'invalid_website_url');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response;
    try {
      response = await fetch(parsedUrl.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'user-agent': 'VerticalStudioBot/2.0 (+https://verticalstudio.local)'
        }
      });
    } catch (error) {
      clearTimeout(timeout);
      const message = error && error.name === 'AbortError' ? 'Website request timed out' : 'Unable to fetch website';
      throw new ExtractionError(message, 400, 'website_unreachable');
    }

    clearTimeout(timeout);

    if (!response.ok) {
      throw new ExtractionError(`Website returned HTTP ${response.status}`, 400, 'website_unreachable');
    }

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('text/html')) {
      throw new ExtractionError('Website content is not HTML', 422, 'invalid_html');
    }

    const html = await response.text();
    if (!html || !html.includes('<')) {
      throw new ExtractionError('Website returned invalid HTML body', 422, 'invalid_html');
    }

    return this.parseHtml({ html, websiteUrl: parsedUrl.toString() });
  }

  parseHtml({ html, websiteUrl }) {
    const $ = load(html);
    const title = textContent($('title').first());
    const description =
      String($('meta[name="description"]').attr('content') || '')
        .replace(/\s+/g, ' ')
        .trim() || null;

    const headings = {
      h1: unique(
        $('h1')
          .toArray()
          .map((el) => textContent($(el)))
      ).slice(0, 8),
      h2: unique(
        $('h2')
          .toArray()
          .map((el) => textContent($(el)))
      ).slice(0, 12),
      h3: unique(
        $('h3')
          .toArray()
          .map((el) => textContent($(el)))
      ).slice(0, 12)
    };

    const bodyText = textContent($('body'));
    const emails = unique((bodyText.match(EMAIL_REGEX) || []).map((v) => v.toLowerCase())).slice(0, 5);
    const phones = unique((bodyText.match(PHONE_REGEX) || []).map((v) => v.trim())).slice(0, 5);

    const links = unique(
      $('a[href]')
        .toArray()
        .map((el) => {
          const href = String($(el).attr('href') || '').trim();
          const label = textContent($(el));
          if (!href) {
            return null;
          }

          let absoluteHref = href;
          try {
            absoluteHref = new URL(href, websiteUrl).toString();
          } catch (_error) {
            absoluteHref = href;
          }

          return {
            href: absoluteHref,
            label: label || null
          };
        })
        .filter(Boolean)
        .map((item) => `${item.href}|||${item.label || ''}`)
    )
      .map((entry) => {
        const [href, label] = entry.split('|||');
        return { href, label: label || null };
      })
      .slice(0, 60);

    const paragraphs = $('p')
      .toArray()
      .map((el) => textContent($(el)))
      .filter((txt) => txt.length > 40)
      .slice(0, 20);

    const projectBlocks = $('article, .project, [class*="project"], [id*="project"]')
      .toArray()
      .map((el, index) => {
        const node = $(el);
        const heading = textContent(node.find('h1,h2,h3,h4').first()) || `Project ${index + 1}`;
        const summary = textContent(node.find('p').first()) || null;
        return {
          title: heading,
          summary
        };
      })
      .filter((item) => item.title)
      .slice(0, 8);

    return {
      source: {
        websiteUrl
      },
      title: title || null,
      description,
      headings,
      contacts: {
        emails,
        phones
      },
      links,
      paragraphs,
      projectBlocks,
      scrapedAt: new Date().toISOString()
    };
  }
}

module.exports = {
  WebScraper
};
