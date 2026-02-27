const { fetchJson, registerEvidence, appendFieldLink } = require('./provider-utils');

async function runSerpProvider(context) {
  const { domain, brandName, keys, budget } = context;
  const findings = {
    competitors: [],
    shareOfVoiceHints: []
  };
  const evidence = [];
  const fieldLinks = {};
  const warnings = [];
  let spent = 0;

  const apiKey = keys.serpapi;
  if (!apiKey) {
    warnings.push('SERP provider skipped: SERPAPI key not configured');
    return { findings, evidence, fieldLinks, cost: spent, warnings, skipped: true };
  }

  const queries = [domain, `${brandName || domain} competitors`, `${brandName || domain} reviews`];

  for (const query of queries) {
    if (!budget.canSpend(0.25)) {
      warnings.push('SERP provider budget limit reached');
      break;
    }

    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google');
    url.searchParams.set('q', query);
    url.searchParams.set('num', '10');
    url.searchParams.set('api_key', apiKey);

    const response = await fetchJson(url.toString(), { timeoutMs: 15000 });
    if (!response.ok || !response.payload || typeof response.payload !== 'object') {
      warnings.push(`SERP query failed: ${query}`);
      continue;
    }

    spent += 0.25;
    budget.spend(0.25);

    const organic = Array.isArray(response.payload.organic_results) ? response.payload.organic_results : [];
    for (const item of organic.slice(0, 8)) {
      const link = String(item.link || item.redirect_link || '');
      if (!link) continue;

      let host = '';
      try {
        host = new URL(link).hostname.replace(/^www\./, '');
      } catch (_error) {
        continue;
      }

      if (!host || host === domain || host.endsWith(`.${domain}`)) {
        continue;
      }

      const sourceId = `serp:${query}:${host}`;
      registerEvidence(evidence, {
        id: sourceId,
        step: 'offsite.serp',
        type: 'serp_result',
        url: link,
        title: item.title || host,
        excerpt: item.snippet || undefined,
        timestamp: new Date().toISOString()
      });

      appendFieldLink(fieldLinks, 'outside.competitive.competitors', sourceId);
      findings.competitors.push({
        name: item.title || host,
        domain: host,
        reason: `SERP overlap for query: ${query}`,
        source: link
      });
    }

    findings.shareOfVoiceHints.push(`Query "${query}" produced ${organic.length} organic hits`);
  }

  const uniqueCompetitors = [];
  const seen = new Set();
  for (const competitor of findings.competitors) {
    if (seen.has(competitor.domain)) continue;
    seen.add(competitor.domain);
    uniqueCompetitors.push(competitor);
  }
  findings.competitors = uniqueCompetitors.slice(0, 25);

  return {
    findings,
    evidence,
    fieldLinks,
    cost: Number(spent.toFixed(3)),
    warnings
  };
}

module.exports = {
  runSerpProvider
};
