function boolScore(value, yes = 0.9, no = 0.2) {
  return value ? yes : no;
}

function cappedRatio(length, good = 1) {
  if (!Number.isFinite(length) || length <= 0) {
    return 0.1;
  }
  return Math.min(1, (length / Math.max(1, good)) * 0.7 + 0.3);
}

function avg(values) {
  const list = (values || []).filter((value) => Number.isFinite(value));
  if (!list.length) {
    return 0;
  }
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

function explainForField(key, score, context = {}) {
  const reasons = [];
  if (score >= 0.85) reasons.push('high signal quality');
  else if (score >= 0.65) reasons.push('moderate evidence');
  else reasons.push('limited evidence');

  if (key === 'brand.name') {
    reasons.push(`name candidates: ${context.candidateCount || 0}`);
  }

  if (key === 'website.structure') {
    reasons.push(`page types detected: ${context.pageTypeCount || 0}`);
  }

  if (key === 'diagnostics.cleanliness') {
    reasons.push(`warnings: ${context.warningCount || 0}`);
  }

  return reasons.join('; ');
}

function calculateConfidence({ brand, style, content, crawl, warnings, website }) {
  const nameCandidates = Array.isArray(brand.nameCandidates) ? brand.nameCandidates : [];
  const pageTypes = Array.isArray(website && website.pageTypes) ? website.pageTypes : [];
  const markdownDocs =
    content && content.markdownCorpus && Array.isArray(content.markdownCorpus.documents)
      ? content.markdownCorpus.documents
      : [];

  const fields = {
    'brand.name': boolScore(Boolean(brand.canonicalName || brand.name), 0.92, 0.2),
    'brand.tagline': boolScore(Boolean(brand.tagline), 0.85, 0.25),
    'brand.logos': cappedRatio((brand.logos || []).length, 2),
    'brand.social': cappedRatio(
      Object.values(brand.social || {}).filter(Boolean).length,
      Math.max(1, Math.floor((Object.keys(brand.social || {}).length || 6) / 2))
    ),
    'contact.emails': cappedRatio((brand.contact && brand.contact.emails && brand.contact.emails.length) || 0, 1),
    'contact.phones': cappedRatio((brand.contact && brand.contact.phones && brand.contact.phones.length) || 1, 1),
    'style.colors': boolScore((style.colors && style.colors.evidence && style.colors.evidence.length > 0) || false, 0.9, 0.25),
    'style.typography': boolScore(
      (style.typography && style.typography.evidence && style.typography.evidence.length > 0) || false,
      0.85,
      0.2
    ),
    'content.pages': cappedRatio((content.pages || []).length, Math.max(1, Math.min(4, crawl.pagesRequested || 1))),
    'content.sections': cappedRatio((content.sections || []).length, 4),
    'website.structure': boolScore(pageTypes.length > 0, 0.9, 0.25),
    'content.markdown': boolScore(markdownDocs.length > 0, 0.88, 0.3),
    'diagnostics.cleanliness': Math.max(0.15, 1 - Math.min(0.85, (warnings || []).length * 0.06))
  };

  // Penalize unstable name consensus.
  if (nameCandidates.length >= 2) {
    const top = Number(nameCandidates[0].score || 0);
    const second = Number(nameCandidates[1].score || 0);
    const spread = Math.max(0, top - second);
    const consensusBoost = Math.min(0.12, spread / 10);
    fields['brand.name'] = Math.max(0.2, Math.min(1, fields['brand.name'] + consensusBoost));
  }

  const weights = {
    'brand.name': 1.35,
    'brand.tagline': 0.85,
    'brand.logos': 0.8,
    'brand.social': 0.7,
    'contact.emails': 0.85,
    'contact.phones': 0.75,
    'style.colors': 0.9,
    'style.typography': 0.9,
    'content.pages': 1.0,
    'content.sections': 1.35,
    'website.structure': 1.25,
    'content.markdown': 1.15,
    'diagnostics.cleanliness': 1.0
  };

  let weightedTotal = 0;
  let weightTotal = 0;
  const explain = {};

  for (const [key, value] of Object.entries(fields)) {
    const rounded = Number(Math.max(0, Math.min(1, value)).toFixed(3));
    const weight = weights[key] || 1;
    weightedTotal += rounded * weight;
    weightTotal += weight;
    fields[key] = rounded;
    explain[key] = explainForField(key, rounded, {
      candidateCount: nameCandidates.length,
      pageTypeCount: pageTypes.length,
      warningCount: (warnings || []).length
    });
  }

  const overall = weightTotal > 0 ? weightedTotal / weightTotal : 0.2;

  return {
    overall: Number(Math.max(0, Math.min(1, overall)).toFixed(3)),
    fields,
    explain,
    extractionConfidence: Number(avg([fields['brand.name'], fields['website.structure'], fields['content.sections']]).toFixed(3))
  };
}

module.exports = {
  calculateConfidence
};
