const { estimateTokens } = require('./local-converter');

function clean(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function scoreMarkdownCandidate(candidate) {
  const content = clean(candidate && candidate.content);
  if (!content) {
    return 0.05;
  }

  const headingCount = countMatches(content, /^#{1,6}\s+/gm);
  const linkCount = countMatches(content, /\[[^\]]+\]\([^)]+\)/g);
  const listCount = countMatches(content, /^\s*[-*]\s+/gm);
  const tokenEstimate = Number(candidate.tokens || 0) || estimateTokens(content);
  const lengthScore = clamp(tokenEstimate / 500, 0.1, 1);
  const structureScore = clamp((headingCount * 0.22 + listCount * 0.1 + linkCount * 0.06), 0, 1);
  const sourceBonus = candidate.source === 'remote' ? 0.06 : 0;
  const titleBonus = clean(candidate.title).length >= 3 ? 0.05 : 0;
  const penalty = /^(home|index)\s*$/i.test(clean(candidate.title)) ? 0.04 : 0;

  return Number(clamp(lengthScore * 0.55 + structureScore * 0.35 + sourceBonus + titleBonus - penalty, 0.05, 1).toFixed(3));
}

function selectCanonicalMarkdown(candidates) {
  const scored = (candidates || [])
    .filter((candidate) => candidate && clean(candidate.content))
    .map((candidate) => ({
      ...candidate,
      qualityScore: scoreMarkdownCandidate(candidate)
    }))
    .sort((a, b) => b.qualityScore - a.qualityScore);

  return {
    winner: scored[0] || null,
    ranked: scored
  };
}

module.exports = {
  scoreMarkdownCandidate,
  selectCanonicalMarkdown
};
