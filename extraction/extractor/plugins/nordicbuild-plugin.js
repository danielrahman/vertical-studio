class NordicBuildPlugin {
  match(hostname) {
    return hostname === 'nordicbuild.example.com' || hostname.endsWith('.nordicbuild.example.com');
  }

  adjustLinkPriority(link, baseScore) {
    const hay = `${link.url} ${link.label || ''}`.toLowerCase();
    if (/(project|portfolio|reference|case-study|case study)/.test(hay)) {
      return baseScore + 2;
    }

    return baseScore;
  }

  adjustSectionScores(candidate, scores) {
    const hay = `${candidate.title || ''} ${candidate.summary || ''} ${(candidate.bullets || []).join(' ')}`.toLowerCase();
    if (/(project|portfolio|reference|case study)/.test(hay)) {
      scores.PROJECTS += 1.5;
    }

    return scores;
  }

  extractExtraAssets(pages) {
    const trustEvidence = [];

    for (const page of pages) {
      const hay = `${page.title || ''} ${page.description || ''}`.toLowerCase();
      if (/nordic/i.test(hay)) {
        trustEvidence.push(`NordicBuild plugin recognized branding on ${page.url}`);
      }
    }

    return {
      logos: [],
      trustEvidence
    };
  }
}

module.exports = {
  NordicBuildPlugin
};
