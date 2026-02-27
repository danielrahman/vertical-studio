const { fetchJson, registerEvidence, appendFieldLink } = require('./provider-utils');

async function runCompanyDataProvider(context) {
  const { domain, brandName, budget } = context;
  const findings = {
    legalNameCandidates: [],
    ownershipSignals: [],
    registryFindings: [],
    evidence: []
  };
  const evidence = [];
  const fieldLinks = {};
  const warnings = [];
  let spent = 0;

  if (!budget.canSpend(0.05)) {
    return { findings, evidence, fieldLinks, cost: spent, warnings: ['Company-data budget reached'], skipped: true };
  }

  const rdapUrl = `https://rdap.org/domain/${encodeURIComponent(domain)}`;
  const response = await fetchJson(rdapUrl, { timeoutMs: 12000 });

  if (response.ok && response.payload && typeof response.payload === 'object') {
    budget.spend(0.05);
    spent += 0.05;

    const payload = response.payload;
    const names = [];

    if (Array.isArray(payload.entities)) {
      for (const entity of payload.entities) {
        if (Array.isArray(entity.vcardArray) && Array.isArray(entity.vcardArray[1])) {
          for (const item of entity.vcardArray[1]) {
            if (Array.isArray(item) && item[0] === 'fn' && typeof item[3] === 'string') {
              names.push(item[3]);
            }
          }
        }

        if (Array.isArray(entity.roles) && entity.roles.length) {
          findings.ownershipSignals.push(`RDAP role: ${entity.roles.join(', ')}`);
        }
      }
    }

    findings.legalNameCandidates = [...new Set([brandName, ...names].filter(Boolean))].slice(0, 12);

    if (payload.ldhName) {
      findings.registryFindings.push(`LDH domain: ${payload.ldhName}`);
    }
    if (payload.status && Array.isArray(payload.status)) {
      findings.registryFindings.push(`Domain status: ${payload.status.join(', ')}`);
    }

    const sourceId = `rdap:${domain}`;
    registerEvidence(evidence, {
      id: sourceId,
      step: 'offsite.company_data',
      type: 'rdap',
      url: rdapUrl,
      title: `RDAP lookup for ${domain}`,
      timestamp: new Date().toISOString()
    });

    findings.evidence.push(rdapUrl);
    appendFieldLink(fieldLinks, 'outside.company.registryFindings', sourceId);
    appendFieldLink(fieldLinks, 'outside.company.ownershipSignals', sourceId);
    appendFieldLink(fieldLinks, 'outside.company.legalNameCandidates', sourceId);
  } else {
    warnings.push(`RDAP lookup failed for ${domain}`);
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
  runCompanyDataProvider
};
