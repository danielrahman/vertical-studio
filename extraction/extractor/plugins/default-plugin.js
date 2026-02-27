class DefaultExtractorPlugin {
  match() {
    return true;
  }

  adjustLinkPriority(_link, baseScore) {
    return baseScore;
  }

  adjustSectionScores(_candidate, scores) {
    return scores;
  }

  extractExtraAssets() {
    return {
      logos: [],
      trustEvidence: []
    };
  }
}

module.exports = {
  DefaultExtractorPlugin
};
