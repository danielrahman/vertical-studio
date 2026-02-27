const SECTION_TYPES = ['HERO', 'FEATURES', 'SERVICES', 'PROJECTS', 'TESTIMONIALS', 'TEAM', 'FAQ', 'CONTACT', 'FOOTER'];

function baseScores() {
  return {
    HERO: 0,
    FEATURES: 0,
    SERVICES: 0,
    PROJECTS: 0,
    TESTIMONIALS: 0,
    TEAM: 0,
    FAQ: 0,
    CONTACT: 0,
    FOOTER: 0
  };
}

function textFromCandidate(candidate) {
  return `${candidate.title || ''} ${candidate.summary || ''} ${(candidate.bullets || []).join(' ')}`.toLowerCase();
}

function normalizeSections({ pages, plugin }) {
  const normalized = [];

  for (const page of pages) {
    const candidates = Array.isArray(page.sectionCandidates) ? page.sectionCandidates : [];

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      const text = textFromCandidate(candidate);
      const scores = baseScores();
      const features = candidate._features || {};

      if ((index <= 1 && page.depth === 0) || page.headings.h1.includes(candidate.title || '')) {
        scores.HERO += 1.8;
      }

      if (/hero|welcome|discover|premium|trusted/.test(text)) {
        scores.HERO += 1.2;
      }

      if (/feature|benefit|why us|why choose|advantages/.test(text)) {
        scores.FEATURES += 2.0;
      }
      if ((candidate.bullets || []).length >= 3) {
        scores.FEATURES += 1.0;
      }

      if (/services|solutions|what we do|expertise|offer/.test(text)) {
        scores.SERVICES += 2.2;
      }

      if (/projects|portfolio|references|case study|developments/.test(text)) {
        scores.PROJECTS += 2.4;
      }

      if (/testimonial|what clients say|reviews/.test(text) || features.hasQuote || features.hasStars) {
        scores.TESTIMONIALS += 2.1;
      }

      if (/team|our people|leadership|founder/.test(text) || features.hasPeople) {
        scores.TEAM += 2.0;
      }

      if (/faq|frequently asked|questions/.test(text) || features.questionCount >= 2) {
        scores.FAQ += 2.0;
      }

      if (
        /contact|get in touch|reach us|location|address|phone|email/.test(text) ||
        features.hasForm ||
        features.hasMap
      ) {
        scores.CONTACT += 2.4;
      }

      if (candidate.sourceTag === 'footer' || features.legalLinkCount >= 1 || /privacy|terms|cookies/.test(text)) {
        scores.FOOTER += 2.6;
      }

      const adjustedScores =
        plugin && typeof plugin.adjustSectionScores === 'function'
          ? plugin.adjustSectionScores(candidate, { ...scores }) || scores
          : scores;

      const ordered = SECTION_TYPES.map((type) => ({ type, score: adjustedScores[type] || 0 })).sort(
        (a, b) => b.score - a.score
      );

      const winner = ordered[0];
      if (!winner || winner.score < 1.2) {
        continue;
      }

      const confidence = Math.max(0, Math.min(1, winner.score / 4.2));

      normalized.push({
        type: winner.type,
        title: candidate.title || winner.type,
        summary: candidate.summary || '',
        ...(Array.isArray(candidate.bullets) && candidate.bullets.length ? { bullets: candidate.bullets } : {}),
        ctas: Array.isArray(candidate.ctas) ? candidate.ctas : [],
        evidence: {
          sourcePageUrl: candidate.sourcePageUrl,
          headingSnippet: (candidate.title || candidate.summary || '').slice(0, 120)
        },
        confidence: Number(confidence.toFixed(3))
      });
    }
  }

  const byType = new Map();
  for (const section of normalized) {
    const current = byType.get(section.type);
    if (!current || section.confidence > current.confidence) {
      byType.set(section.type, section);
    }
  }

  return [...byType.values()].sort((a, b) => SECTION_TYPES.indexOf(a.type) - SECTION_TYPES.indexOf(b.type));
}

module.exports = {
  SECTION_TYPES,
  normalizeSections
};
