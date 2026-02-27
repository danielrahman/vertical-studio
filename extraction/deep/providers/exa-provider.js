const { fetchJson, registerEvidence, appendFieldLink } = require('./provider-utils');

const EXA_SEARCH_URL = 'https://api.exa.ai/search';
const EXA_CONTENTS_URL = 'https://api.exa.ai/contents';
const EXA_BUDGET_SHARE = 0.4;
const SEARCH_COST_ESTIMATE_USD = 0.005;
const CONTENTS_COST_PER_URL_ESTIMATE_USD = 0.001;
const CONTENTS_FETCH_LIMIT = 3;

function safeString(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function toHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch (_error) {
    return '';
  }
}

function isOwnDomain(host, domain) {
  if (!host || !domain) return false;
  return host === domain || host.endsWith(`.${domain}`);
}

function detectSentiment(text) {
  const low = safeString(text).toLowerCase();
  if (/scandal|fraud|lawsuit|complaint|problem|negative|penalty|delay|delay(ed)?/.test(low)) {
    return 'negative';
  }
  if (/award|growth|innovation|success|expansion|positive|top|win|winning/.test(low)) {
    return 'positive';
  }
  return 'neutral';
}

function normalizeConfidence(value, fallback = 0.65) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  if (value >= 0 && value <= 1) {
    return Number(value.toFixed(3));
  }
  if (value > 1 && value <= 100) {
    return Number(Math.min(1, value / 100).toFixed(3));
  }
  return fallback;
}

function pickLocalePhrase(localeHints = []) {
  const normalized = (Array.isArray(localeHints) ? localeHints : []).map((item) => String(item || '').toLowerCase());
  if (normalized.some((item) => item.startsWith('cs'))) {
    return 'Czech Republic';
  }
  if (normalized.some((item) => item.startsWith('sk'))) {
    return 'Slovakia';
  }
  return '';
}

function buildPeopleQueries(brandName, domain, localePhrase) {
  const locale = localePhrase ? ` ${localePhrase}` : '';
  return [
    `${brandName} architect founder director studio ${domain}${locale}`.trim(),
    `${brandName} team leadership architects ${domain}${locale}`.trim()
  ];
}

function buildPrQueries(brandName, localePhrase) {
  const locale = localePhrase ? ` ${localePhrase}` : '';
  return [`${brandName} interview award project news${locale}`.trim(), `${brandName} architecture studio news${locale}`.trim()];
}

function buildCompetitorQueries(brandName, localePhrase) {
  const locale = localePhrase ? ` ${localePhrase}` : '';
  return [
    `${brandName} competitors architecture studio${locale}`.trim(),
    `companies similar to ${brandName} architecture firm${locale}`.trim()
  ];
}

function dedupeMentions(mentions) {
  const map = new Map();
  for (const mention of mentions || []) {
    const key = `${safeString(mention.url)}::${safeString(mention.title)}`;
    if (!map.has(key)) {
      map.set(key, mention);
    }
  }
  return [...map.values()];
}

function dedupePeople(people) {
  const map = new Map();
  for (const person of people || []) {
    const key = safeString(person.profileUrl) || `${safeString(person.name)}::${safeString(person.organization)}`;
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, person);
    }
  }
  return [...map.values()];
}

function dedupeCompetitors(competitors) {
  const map = new Map();
  for (const competitor of competitors || []) {
    if (!competitor || !competitor.domain) continue;
    if (!map.has(competitor.domain)) {
      map.set(competitor.domain, competitor);
    }
  }
  return [...map.values()];
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((item) => safeString(item)).filter(Boolean))];
}

function isSocialHost(host) {
  return (
    host === 'linkedin.com' ||
    host.endsWith('.linkedin.com') ||
    host === 'x.com' ||
    host.endsWith('.x.com') ||
    host === 'twitter.com' ||
    host.endsWith('.twitter.com') ||
    host === 'instagram.com' ||
    host.endsWith('.instagram.com') ||
    host === 'facebook.com' ||
    host.endsWith('.facebook.com') ||
    host === 'tiktok.com' ||
    host.endsWith('.tiktok.com') ||
    host === 'youtube.com' ||
    host.endsWith('.youtube.com')
  );
}

async function exaPost({ apiKey, url, body }) {
  return fetchJson(url, {
    method: 'POST',
    timeoutMs: 15000,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify(body)
  });
}

function resolveContentSnippet(searchItem, contentItem) {
  if (contentItem && typeof contentItem.text === 'string' && contentItem.text.trim()) {
    return safeString(contentItem.text).slice(0, 260);
  }
  if (Array.isArray(contentItem && contentItem.highlights) && contentItem.highlights.length) {
    return safeString(contentItem.highlights[0]).slice(0, 260);
  }
  if (typeof searchItem.text === 'string' && searchItem.text.trim()) {
    return safeString(searchItem.text).slice(0, 260);
  }
  return '';
}

function canSpend({ budget, spent, capUsd, amount }) {
  return spent + amount <= capUsd && budget.canSpend(amount);
}

async function runSearchGroup({ apiKey, budget, spentState, capUsd, warnings, query, category, domain, numResults = 8 }) {
  if (!canSpend({ budget, spent: spentState.value, capUsd, amount: SEARCH_COST_ESTIMATE_USD })) {
    warnings.push(`Exa provider budget cap reached before query: ${query}`);
    return [];
  }

  const body = {
    query,
    type: 'auto',
    category,
    numResults
  };

  if (category !== 'people' && category !== 'company') {
    body.excludeDomains = [domain, `www.${domain}`];
  }

  const response = await exaPost({
    apiKey,
    url: EXA_SEARCH_URL,
    body
  });

  if (!response.ok || !response.payload || typeof response.payload !== 'object') {
    warnings.push(`Exa search failed for query: ${query}`);
    return [];
  }

  budget.spend(SEARCH_COST_ESTIMATE_USD);
  spentState.value += SEARCH_COST_ESTIMATE_USD;

  return Array.isArray(response.payload.results) ? response.payload.results : [];
}

async function fetchTopContents({ apiKey, budget, spentState, capUsd, warnings, results }) {
  const urls = uniqueStrings((results || []).map((item) => item && item.url).filter(Boolean)).slice(0, CONTENTS_FETCH_LIMIT);
  if (!urls.length) {
    return new Map();
  }

  const estimatedCost = Number((urls.length * CONTENTS_COST_PER_URL_ESTIMATE_USD).toFixed(3));
  if (!canSpend({ budget, spent: spentState.value, capUsd, amount: estimatedCost })) {
    warnings.push('Exa provider budget cap reached before contents enrichment');
    return new Map();
  }

  const response = await exaPost({
    apiKey,
    url: EXA_CONTENTS_URL,
    body: {
      urls,
      text: true
    }
  });

  if (!response.ok || !response.payload || typeof response.payload !== 'object') {
    warnings.push('Exa contents enrichment failed');
    return new Map();
  }

  budget.spend(estimatedCost);
  spentState.value += estimatedCost;

  const map = new Map();
  const items = Array.isArray(response.payload.results) ? response.payload.results : [];
  for (const item of items) {
    if (!item || !item.url) continue;
    map.set(item.url, item);
  }
  return map;
}

function pickNameFromResult(item) {
  const author = safeString(item && item.author);
  if (author) return author;

  const title = safeString(item && item.title);
  if (!title) return '';
  return safeString(title.split(' - ')[0].split('|')[0].split(',')[0]);
}

function pickRoleFromTitle(item) {
  const title = safeString(item && item.title);
  if (!title) return undefined;

  const lowered = title.toLowerCase();
  const roles = ['architect', 'founder', 'director', 'principal', 'partner', 'owner', 'lead'];
  const role = roles.find((candidate) => lowered.includes(candidate));
  if (!role) return undefined;
  return role.charAt(0).toUpperCase() + role.slice(1);
}

async function runExaProvider(context) {
  const { domain, brandName, budget, budgetUsd, localeHints } = context;
  const findings = {
    people: [],
    socialProfiles: [],
    mentions: [],
    keyTopics: [],
    timeline: [],
    risks: [],
    opportunities: [],
    competitors: [],
    shareOfVoiceHints: []
  };
  const evidence = [];
  const fieldLinks = {};
  const warnings = [];
  const apiKey = process.env.EXA_API_KEY || null;

  if (!apiKey) {
    warnings.push('Exa provider skipped: EXA_API_KEY not configured');
    return { findings, evidence, fieldLinks, cost: 0, warnings, skipped: true };
  }

  const remainingBudget = Math.max(0, Number(budget.totalBudgetUsd || 0) - Number(budget.spentUsd || 0));
  const configuredBudget = Number(budgetUsd || budget.totalBudgetUsd || 0);
  const exaBudgetCap = Math.max(0, Math.min(configuredBudget * EXA_BUDGET_SHARE, remainingBudget));
  if (exaBudgetCap <= 0) {
    warnings.push('Exa provider budget cap reached');
    return { findings, evidence, fieldLinks, cost: 0, warnings, skipped: true };
  }

  const spentState = { value: 0 };
  const normalizedBrand = safeString(brandName || domain || '').replace(/\.+$/, '') || domain;
  const localePhrase = pickLocalePhrase(localeHints);

  const peopleSearchResults = [];
  for (const query of buildPeopleQueries(normalizedBrand, domain, localePhrase)) {
    const result = await runSearchGroup({
      apiKey,
      budget,
      spentState,
      capUsd: exaBudgetCap,
      warnings,
      query,
      category: 'people',
      domain,
      numResults: 8
    });
    peopleSearchResults.push(...result);
  }

  const peopleContentMap = await fetchTopContents({
    apiKey,
    budget,
    spentState,
    capUsd: exaBudgetCap,
    warnings,
    results: peopleSearchResults
  });

  for (const item of peopleSearchResults) {
    const profileUrl = safeString(item && item.url);
    if (!profileUrl) continue;

    const host = toHost(profileUrl);
    if (!host) continue;

    const name = pickNameFromResult(item);
    if (!name) continue;

    const contentItem = peopleContentMap.get(profileUrl);
    const sourceId = `exa:people:${encodeURIComponent(profileUrl)}`;
    const snippet = resolveContentSnippet(item, contentItem);
    const confidence = normalizeConfidence(item && item.score, 0.68);

    findings.people.push({
      name,
      ...(pickRoleFromTitle(item) ? { title: pickRoleFromTitle(item) } : {}),
      organization: normalizedBrand,
      profileUrl,
      sourceDomain: host,
      confidence
    });

    if (isSocialHost(host)) {
      findings.socialProfiles.push(profileUrl);
      appendFieldLink(fieldLinks, 'outside.presence.socialProfiles', sourceId);
    }

    registerEvidence(evidence, {
      id: sourceId,
      step: 'offsite.exa.people',
      type: 'exa_people',
      url: profileUrl,
      title: safeString(item && item.title) || name,
      excerpt: snippet || undefined,
      timestamp: new Date().toISOString()
    });
    appendFieldLink(fieldLinks, 'outside.presence.people', sourceId);
  }

  const prSearchResults = [];
  for (const query of buildPrQueries(normalizedBrand, localePhrase)) {
    const result = await runSearchGroup({
      apiKey,
      budget,
      spentState,
      capUsd: exaBudgetCap,
      warnings,
      query,
      category: 'news',
      domain,
      numResults: 10
    });
    prSearchResults.push(...result);
  }

  const prContentMap = await fetchTopContents({
    apiKey,
    budget,
    spentState,
    capUsd: exaBudgetCap,
    warnings,
    results: prSearchResults
  });

  for (const item of prSearchResults) {
    const url = safeString(item && item.url);
    if (!url) continue;

    const host = toHost(url);
    if (!host || isOwnDomain(host, domain)) continue;

    const title = safeString(item && item.title) || host;
    const contentItem = prContentMap.get(url);
    const snippet = resolveContentSnippet(item, contentItem);
    const sentiment = detectSentiment(`${title} ${snippet}`);
    const publishedAt = safeString(item && (item.publishedDate || item.published_date || item.date));
    const sourceId = `exa:pr:${encodeURIComponent(url)}`;

    findings.mentions.push({
      title,
      url,
      sentiment,
      ...(snippet ? { snippet } : {}),
      ...(publishedAt ? { publishedAt } : {})
    });

    findings.keyTopics.push(safeString(title.split('-')[0].split('|')[0]));
    if (publishedAt) {
      findings.timeline.push(publishedAt);
    }
    if (sentiment === 'negative') {
      findings.risks.push(`Negative mention: ${title}`);
    } else if (sentiment === 'positive') {
      findings.opportunities.push(`Positive mention: ${title}`);
    }

    registerEvidence(evidence, {
      id: sourceId,
      step: 'offsite.exa.pr',
      type: 'exa_pr_mention',
      url,
      title,
      excerpt: snippet || undefined,
      timestamp: new Date().toISOString()
    });
    appendFieldLink(fieldLinks, 'outside.pr.mentions', sourceId);
  }

  const competitorSearchResults = [];
  for (const query of buildCompetitorQueries(normalizedBrand, localePhrase)) {
    const result = await runSearchGroup({
      apiKey,
      budget,
      spentState,
      capUsd: exaBudgetCap,
      warnings,
      query,
      category: 'company',
      domain,
      numResults: 8
    });
    competitorSearchResults.push(...result);
  }

  const competitorContentMap = await fetchTopContents({
    apiKey,
    budget,
    spentState,
    capUsd: exaBudgetCap,
    warnings,
    results: competitorSearchResults
  });

  for (const item of competitorSearchResults) {
    const sourceUrl = safeString(item && item.url);
    if (!sourceUrl) continue;

    const host = toHost(sourceUrl);
    if (!host || isOwnDomain(host, domain)) continue;

    const name = safeString(item && item.title).split(' - ')[0].split('|')[0] || host;
    const sourceId = `exa:competitor:${host}`;
    const contentItem = competitorContentMap.get(sourceUrl);
    const snippet = resolveContentSnippet(item, contentItem);

    findings.competitors.push({
      name: safeString(name),
      domain: host,
      reason: `Exa semantic competitor discovery for ${normalizedBrand}`,
      source: sourceUrl
    });

    registerEvidence(evidence, {
      id: sourceId,
      step: 'offsite.exa.competitive',
      type: 'exa_competitor',
      url: sourceUrl,
      title: safeString(item && item.title) || host,
      excerpt: snippet || undefined,
      timestamp: new Date().toISOString()
    });
    appendFieldLink(fieldLinks, 'outside.competitive.competitors', sourceId);
  }

  findings.people = dedupePeople(findings.people).slice(0, 30);
  findings.socialProfiles = uniqueStrings(findings.socialProfiles).slice(0, 40);
  findings.mentions = dedupeMentions(findings.mentions).slice(0, 30);
  findings.keyTopics = uniqueStrings(findings.keyTopics).slice(0, 20);
  findings.timeline = uniqueStrings(findings.timeline).slice(0, 20);
  findings.risks = uniqueStrings(findings.risks).slice(0, 20);
  findings.opportunities = uniqueStrings(findings.opportunities).slice(0, 20);
  findings.competitors = dedupeCompetitors(findings.competitors).slice(0, 30);
  findings.shareOfVoiceHints = [
    `Exa people queries: ${buildPeopleQueries(normalizedBrand, domain, localePhrase).length}`,
    `Exa PR queries: ${buildPrQueries(normalizedBrand, localePhrase).length}`,
    `Exa competitor queries: ${buildCompetitorQueries(normalizedBrand, localePhrase).length}`
  ];

  return {
    findings,
    evidence,
    fieldLinks,
    cost: Number(spentState.value.toFixed(3)),
    warnings
  };
}

module.exports = {
  runExaProvider
};
