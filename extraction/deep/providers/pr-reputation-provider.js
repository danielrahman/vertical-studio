const { fetchJson, registerEvidence, appendFieldLink } = require('./provider-utils');

function detectSentiment(text) {
  const low = String(text || '').toLowerCase();
  if (/scandal|fraud|lawsuit|complaint|problem|negative|penalty/.test(low)) {
    return 'negative';
  }
  if (/award|growth|innovation|success|expansion|positive|top/.test(low)) {
    return 'positive';
  }
  return 'neutral';
}

async function runPrReputationProvider(context) {
  const { brandName, domain, keys, budget } = context;
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
    warnings.push('PR provider skipped: SERPAPI key not configured');
    return { findings, evidence, fieldLinks, cost: spent, warnings, skipped: true };
  }

  if (!budget.canSpend(0.35)) {
    warnings.push('PR provider budget reached');
    return { findings, evidence, fieldLinks, cost: spent, warnings, skipped: true };
  }

  const query = `${brandName || domain}`;
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('tbm', 'nws');
  url.searchParams.set('q', query);
  url.searchParams.set('api_key', apiKey);

  const response = await fetchJson(url.toString(), { timeoutMs: 15000 });
  if (!response.ok || !response.payload || typeof response.payload !== 'object') {
    warnings.push('PR query failed');
    return { findings, evidence, fieldLinks, cost: spent, warnings };
  }

  budget.spend(0.35);
  spent += 0.35;

  const news = Array.isArray(response.payload.news_results) ? response.payload.news_results : [];
  for (const item of news.slice(0, 12)) {
    const title = String(item.title || 'Untitled mention');
    const snippet = String(item.snippet || '');
    const urlItem = String(item.link || '').trim();
    if (!urlItem) continue;

    const sentiment = detectSentiment(`${title} ${snippet}`);
    const mention = {
      title,
      url: urlItem,
      sentiment,
      snippet: snippet || undefined,
      publishedAt: item.date || undefined
    };
    findings.mentions.push(mention);

    if (sentiment === 'negative') {
      findings.risks.push(`Negative mention: ${title}`);
    }
    if (sentiment === 'positive') {
      findings.opportunities.push(`Positive mention: ${title}`);
    }

    const sourceId = `pr:${urlItem}`;
    registerEvidence(evidence, {
      id: sourceId,
      step: 'offsite.pr_reputation',
      type: 'news_mention',
      url: urlItem,
      title,
      excerpt: snippet || undefined,
      timestamp: new Date().toISOString()
    });
    appendFieldLink(fieldLinks, 'outside.pr.mentions', sourceId);
  }

  findings.keyTopics = [...new Set(findings.mentions.map((item) => item.title.split('-')[0].trim()).filter(Boolean))].slice(
    0,
    12
  );
  findings.timeline = [...new Set(findings.mentions.map((item) => item.publishedAt).filter(Boolean))].slice(0, 24);

  return {
    findings,
    evidence,
    fieldLinks,
    cost: Number(spent.toFixed(3)),
    warnings
  };
}

module.exports = {
  runPrReputationProvider
};
