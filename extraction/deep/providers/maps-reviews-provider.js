const { fetchJson, registerEvidence, appendFieldLink } = require('./provider-utils');

async function runMapsReviewsProvider(context) {
  const { domain, brandName, keys, budget } = context;
  const findings = {
    mentions: [],
    keyTopics: [],
    timeline: [],
    risks: [],
    opportunities: []
  };
  const evidence = [];
  const fieldLinks = {};
  const warnings = [];
  let spent = 0;

  const apiKey = keys.serpapi;
  if (!apiKey) {
    warnings.push('Maps/reviews provider skipped: SERPAPI key not configured');
    return { findings, evidence, fieldLinks, cost: spent, warnings, skipped: true };
  }

  if (!budget.canSpend(0.25)) {
    warnings.push('Maps/reviews provider budget reached');
    return { findings, evidence, fieldLinks, cost: spent, warnings, skipped: true };
  }

  const query = `${brandName || domain} reviews`;
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', query);
  url.searchParams.set('num', '10');
  url.searchParams.set('api_key', apiKey);

  const response = await fetchJson(url.toString(), { timeoutMs: 15000 });
  if (!response.ok || !response.payload || typeof response.payload !== 'object') {
    warnings.push('Maps/reviews query failed');
    return { findings, evidence, fieldLinks, cost: spent, warnings };
  }

  spent += 0.25;
  budget.spend(0.25);

  const organic = Array.isArray(response.payload.organic_results) ? response.payload.organic_results : [];
  for (const item of organic.slice(0, 10)) {
    const link = String(item.link || item.redirect_link || '').trim();
    if (!link) continue;

    const title = item.title || link;
    const snippet = String(item.snippet || '');
    const low = `${title} ${snippet}`.toLowerCase();

    const sentiment = /scam|problem|lawsuit|fraud|negative|complaint/.test(low)
      ? 'negative'
      : /award|best|top|excellent|positive|success/.test(low)
      ? 'positive'
      : 'neutral';

    findings.mentions.push({
      title,
      url: link,
      sentiment,
      snippet,
      publishedAt: item.date || undefined
    });

    if (/complaint|scam|fraud|problem/.test(low)) {
      findings.risks.push(`Risk mention: ${title}`);
    }
    if (/award|growth|partnership|expansion|success/.test(low)) {
      findings.opportunities.push(`Positive mention: ${title}`);
    }

    const sourceId = `review:${link}`;
    registerEvidence(evidence, {
      id: sourceId,
      step: 'offsite.maps_reviews',
      type: 'review_or_mention',
      url: link,
      title,
      excerpt: snippet,
      timestamp: new Date().toISOString()
    });
    appendFieldLink(fieldLinks, 'outside.pr.mentions', sourceId);
  }

  findings.keyTopics = [...new Set(findings.mentions.map((item) => item.title.split('|')[0].trim()).filter(Boolean))].slice(
    0,
    12
  );
  findings.timeline = [...new Set(findings.mentions.map((item) => item.publishedAt).filter(Boolean))].slice(0, 12);

  return {
    findings,
    evidence,
    fieldLinks,
    cost: Number(spent.toFixed(3)),
    warnings
  };
}

module.exports = {
  runMapsReviewsProvider
};
