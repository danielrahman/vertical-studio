const { runSerpProvider } = require('./serp-provider');
const { runExaProvider } = require('./exa-provider');
const { runCompanyDataProvider } = require('./company-data-provider');
const { runSocialEnrichmentProvider } = require('./social-enrichment-provider');
const { runMapsReviewsProvider } = require('./maps-reviews-provider');
const { runTechIntelProvider } = require('./tech-intel-provider');
const { runPrReputationProvider } = require('./pr-reputation-provider');

const PROVIDERS = {
  exa: runExaProvider,
  serp: runSerpProvider,
  company_data: runCompanyDataProvider,
  social_enrichment: runSocialEnrichmentProvider,
  maps_reviews: runMapsReviewsProvider,
  tech_intel: runTechIntelProvider,
  pr_reputation: runPrReputationProvider
};

class BudgetController {
  constructor(totalBudgetUsd) {
    this.totalBudgetUsd = Number(totalBudgetUsd || 0);
    this.spentUsd = 0;
  }

  canSpend(amountUsd) {
    return this.spentUsd + Number(amountUsd || 0) <= this.totalBudgetUsd;
  }

  spend(amountUsd) {
    this.spentUsd += Number(amountUsd || 0);
  }
}

function mergeFieldLinks(target, incoming) {
  for (const [field, sourceIds] of Object.entries(incoming || {})) {
    if (!target[field]) {
      target[field] = [];
    }

    for (const id of sourceIds || []) {
      if (!target[field].includes(id)) {
        target[field].push(id);
      }
    }
  }
}

async function runOffsiteProviders(context) {
  const providerKeys = Array.isArray(context.providers) ? context.providers : [];
  const budget = new BudgetController(context.budgetUsd);
  const result = {
    outside: {
      company: {
        legalNameCandidates: [],
        ownershipSignals: [],
        registryFindings: [],
        evidence: []
      },
      presence: {
        people: [],
        socialProfiles: [],
        directories: [],
        listingSignals: []
      },
      pr: {
        mentions: [],
        keyTopics: [],
        timeline: [],
        risks: [],
        opportunities: []
      },
      tech: {
        cms: [],
        trackers: [],
        cdn: [],
        hosting: [],
        evidence: []
      },
      competitive: {
        competitors: [],
        shareOfVoiceHints: []
      }
    },
    sources: [],
    fieldLinks: {},
    warnings: [],
    providerCosts: {}
  };

  for (const key of providerKeys) {
    const fn = PROVIDERS[key];
    if (!fn) {
      result.warnings.push(`Unknown provider skipped: ${key}`);
      continue;
    }

    const out = await fn({
      ...context,
      budget
    });

    result.providerCosts[key] = Number((out.cost || 0).toFixed(3));
    result.warnings.push(...(out.warnings || []));
    result.sources.push(...(out.evidence || []));
    mergeFieldLinks(result.fieldLinks, out.fieldLinks || {});

    if (key === 'serp') {
      result.outside.competitive.competitors.push(...((out.findings && out.findings.competitors) || []));
      result.outside.competitive.shareOfVoiceHints.push(...((out.findings && out.findings.shareOfVoiceHints) || []));
    }

    if (key === 'exa') {
      result.outside.presence.people.push(...((out.findings && out.findings.people) || []));
      result.outside.presence.socialProfiles.push(...((out.findings && out.findings.socialProfiles) || []));
      result.outside.pr.mentions.push(...((out.findings && out.findings.mentions) || []));
      result.outside.pr.keyTopics.push(...((out.findings && out.findings.keyTopics) || []));
      result.outside.pr.timeline.push(...((out.findings && out.findings.timeline) || []));
      result.outside.pr.risks.push(...((out.findings && out.findings.risks) || []));
      result.outside.pr.opportunities.push(...((out.findings && out.findings.opportunities) || []));
      result.outside.competitive.competitors.push(...((out.findings && out.findings.competitors) || []));
      result.outside.competitive.shareOfVoiceHints.push(...((out.findings && out.findings.shareOfVoiceHints) || []));
    }

    if (key === 'company_data') {
      result.outside.company.legalNameCandidates.push(...((out.findings && out.findings.legalNameCandidates) || []));
      result.outside.company.ownershipSignals.push(...((out.findings && out.findings.ownershipSignals) || []));
      result.outside.company.registryFindings.push(...((out.findings && out.findings.registryFindings) || []));
      result.outside.company.evidence.push(...((out.findings && out.findings.evidence) || []));
    }

    if (key === 'social_enrichment') {
      result.outside.presence.socialProfiles.push(...((out.findings && out.findings.socialProfiles) || []));
      result.outside.presence.directories.push(...((out.findings && out.findings.directories) || []));
      result.outside.presence.listingSignals.push(...((out.findings && out.findings.listingSignals) || []));
    }

    if (key === 'maps_reviews' || key === 'pr_reputation') {
      result.outside.pr.mentions.push(...((out.findings && out.findings.mentions) || []));
      result.outside.pr.keyTopics.push(...((out.findings && out.findings.keyTopics) || []));
      result.outside.pr.timeline.push(...((out.findings && out.findings.timeline) || []));
      result.outside.pr.risks.push(...((out.findings && out.findings.risks) || []));
      result.outside.pr.opportunities.push(...((out.findings && out.findings.opportunities) || []));
    }

    if (key === 'tech_intel') {
      result.outside.tech.cms.push(...((out.findings && out.findings.cms) || []));
      result.outside.tech.trackers.push(...((out.findings && out.findings.trackers) || []));
      result.outside.tech.cdn.push(...((out.findings && out.findings.cdn) || []));
      result.outside.tech.hosting.push(...((out.findings && out.findings.hosting) || []));
      result.outside.tech.evidence.push(...((out.findings && out.findings.evidence) || []));
    }
  }

  const dedupeArray = (arr) => [...new Set((arr || []).filter(Boolean))];
  result.outside.company.legalNameCandidates = dedupeArray(result.outside.company.legalNameCandidates).slice(0, 20);
  result.outside.company.ownershipSignals = dedupeArray(result.outside.company.ownershipSignals).slice(0, 20);
  result.outside.company.registryFindings = dedupeArray(result.outside.company.registryFindings).slice(0, 40);
  result.outside.company.evidence = dedupeArray(result.outside.company.evidence).slice(0, 20);

  const peopleMap = new Map();
  for (const person of result.outside.presence.people) {
    if (!person) continue;
    const key = person.profileUrl || `${person.name || ''}::${person.organization || ''}`;
    if (!key.trim()) continue;
    if (!peopleMap.has(key)) {
      peopleMap.set(key, person);
    }
  }
  result.outside.presence.people = [...peopleMap.values()].slice(0, 30);
  result.outside.presence.socialProfiles = dedupeArray(result.outside.presence.socialProfiles).slice(0, 40);
  result.outside.presence.directories = dedupeArray(result.outside.presence.directories).slice(0, 30);
  result.outside.presence.listingSignals = dedupeArray(result.outside.presence.listingSignals).slice(0, 40);

  const mentionMap = new Map();
  for (const mention of result.outside.pr.mentions) {
    const key = `${mention.url}::${mention.title}`;
    if (!mentionMap.has(key)) {
      mentionMap.set(key, mention);
    }
  }
  result.outside.pr.mentions = [...mentionMap.values()].slice(0, 40);
  result.outside.pr.keyTopics = dedupeArray(result.outside.pr.keyTopics).slice(0, 20);
  result.outside.pr.timeline = dedupeArray(result.outside.pr.timeline).slice(0, 30);
  result.outside.pr.risks = dedupeArray(result.outside.pr.risks).slice(0, 20);
  result.outside.pr.opportunities = dedupeArray(result.outside.pr.opportunities).slice(0, 20);

  result.outside.tech.cms = dedupeArray(result.outside.tech.cms).slice(0, 12);
  result.outside.tech.trackers = dedupeArray(result.outside.tech.trackers).slice(0, 16);
  result.outside.tech.cdn = dedupeArray(result.outside.tech.cdn).slice(0, 12);
  result.outside.tech.hosting = dedupeArray(result.outside.tech.hosting).slice(0, 12);
  result.outside.tech.evidence = dedupeArray(result.outside.tech.evidence).slice(0, 24);

  const competitorMap = new Map();
  for (const competitor of result.outside.competitive.competitors) {
    if (!competitor || !competitor.domain) continue;
    if (!competitorMap.has(competitor.domain)) {
      competitorMap.set(competitor.domain, competitor);
    }
  }
  result.outside.competitive.competitors = [...competitorMap.values()].slice(0, 30);
  result.outside.competitive.shareOfVoiceHints = dedupeArray(result.outside.competitive.shareOfVoiceHints).slice(0, 20);

  const totalUsd = Object.values(result.providerCosts).reduce((sum, value) => sum + (Number(value) || 0), 0);

  return {
    ...result,
    totalUsd: Number(totalUsd.toFixed(3)),
    withinBudget: totalUsd <= Number(context.budgetUsd || 0)
  };
}

module.exports = {
  runOffsiteProviders,
  BudgetController
};
