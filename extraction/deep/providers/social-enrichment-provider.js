const { fetchJson, registerEvidence, appendFieldLink } = require('./provider-utils');

function buildCandidates(baseResult) {
  const social = baseResult.brand && baseResult.brand.social ? baseResult.brand.social : {};
  return Object.values(social).filter(Boolean);
}

async function runSocialEnrichmentProvider(context) {
  const { baseResult, budget } = context;
  const findings = {
    socialProfiles: [],
    directories: [],
    listingSignals: []
  };
  const evidence = [];
  const fieldLinks = {};
  const warnings = [];
  let spent = 0;

  const profiles = buildCandidates(baseResult);
  for (const profileUrl of profiles.slice(0, 10)) {
    findings.socialProfiles.push(profileUrl);

    if (!budget.canSpend(0.02)) {
      warnings.push('Social enrichment budget limit reached');
      break;
    }

    const response = await fetchJson(profileUrl, { timeoutMs: 12000 });
    budget.spend(0.02);
    spent += 0.02;

    if (!response.ok) {
      warnings.push(`Unable to fetch social profile: ${profileUrl}`);
      continue;
    }

    const html = typeof response.payload === 'string' ? response.payload : '';
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? String(titleMatch[1]).trim() : profileUrl;
    const sourceId = `social:${profileUrl}`;

    registerEvidence(evidence, {
      id: sourceId,
      step: 'offsite.social_enrichment',
      type: 'social_profile',
      url: profileUrl,
      title,
      timestamp: new Date().toISOString()
    });

    appendFieldLink(fieldLinks, 'outside.presence.socialProfiles', sourceId);
    findings.listingSignals.push(`Profile discovered: ${title}`);
  }

  return {
    findings,
    evidence,
    fieldLinks,
    cost: Number(spent.toFixed(3)),
    warnings
  };
}

module.exports = {
  runSocialEnrichmentProvider
};
