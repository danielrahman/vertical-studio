const { load } = require('cheerio');

function clean(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function estimateTokens(text) {
  const words = clean(text).split(/\s+/).filter(Boolean).length;
  return Math.max(0, Math.round(words * 1.35));
}

function toMarkdownLink($node, pageUrl) {
  const text = clean($node.text());
  const href = String($node.attr('href') || '').trim();
  if (!text && !href) {
    return '';
  }

  if (!href) {
    return text;
  }

  try {
    const absolute = new URL(href, pageUrl).toString();
    return `[${text || absolute}](${absolute})`;
  } catch (_error) {
    return text || href;
  }
}

function joinLines(lines) {
  return lines
    .map((line) => String(line || '').trimEnd())
    .filter((line, index, arr) => {
      if (line) {
        return true;
      }
      return arr[index - 1] !== '';
    })
    .join('\n')
    .trim();
}

function convertHtmlToMarkdown({ html, pageUrl }) {
  const $ = load(html || '');
  $('script, style, noscript, iframe, svg').remove();

  const title = clean($('title').first().text()) || clean($('h1').first().text()) || pageUrl;
  const lines = [`# ${title}`, ''];

  const sections = $('main').length ? $('main').first() : $('body');

  sections.find('h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, code, a').each((_idx, el) => {
    const tag = String(el.tagName || '').toLowerCase();
    if (!tag) return;

    if (/^h[1-6]$/.test(tag)) {
      const text = clean($(el).text());
      if (!text) return;
      const level = Number(tag.slice(1));
      lines.push(`${'#'.repeat(Math.min(6, Math.max(1, level)))} ${text}`);
      lines.push('');
      return;
    }

    if (tag === 'p') {
      const text = clean($(el).text());
      if (!text) return;
      lines.push(text);
      lines.push('');
      return;
    }

    if (tag === 'li') {
      const text = clean($(el).text());
      if (!text) return;
      lines.push(`- ${text}`);
      return;
    }

    if (tag === 'blockquote') {
      const text = clean($(el).text());
      if (!text) return;
      lines.push(`> ${text}`);
      lines.push('');
      return;
    }

    if (tag === 'pre' || tag === 'code') {
      const text = clean($(el).text());
      if (!text) return;
      lines.push('```');
      lines.push(text);
      lines.push('```');
      lines.push('');
      return;
    }

    if (tag === 'a') {
      const link = toMarkdownLink($(el), pageUrl);
      if (!link) return;
      lines.push(link);
    }
  });

  const markdown = joinLines(lines);
  return {
    title,
    content: markdown,
    tokens: estimateTokens(markdown)
  };
}

module.exports = {
  convertHtmlToMarkdown,
  estimateTokens
};
