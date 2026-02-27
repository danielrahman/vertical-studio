function isHttpUrl(value) {
  if (!value || typeof value !== 'string') {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_error) {
    return false;
  }
}

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function normalizeImageAsset(asset, fallbackLabel, warnings, fieldPath) {
  if (!asset || !isHttpUrl(asset.url)) {
    warnings.push(`${fieldPath}: missing or invalid URL, placeholder assigned`);
    const seed = encodeURIComponent(String(fallbackLabel || 'image'));
    return {
      url: `https://placehold.co/1200x800?text=${seed}`,
      alt: fallbackLabel || 'Placeholder image'
    };
  }

  return {
    ...asset,
    url: asset.url.trim(),
    alt: asset.alt || fallbackLabel || 'Image'
  };
}

function normalizeAssets(siteConfig) {
  const warnings = [];
  const output = clone(siteConfig);

  if (Array.isArray(output.projects)) {
    output.projects = output.projects.map((project, index) => ({
      ...project,
      thumbnail: normalizeImageAsset(
        project.thumbnail,
        project.name || `Project ${index + 1}`,
        warnings,
        `projects[${index}].thumbnail`
      )
    }));
  }

  if (Array.isArray(output.team)) {
    output.team = output.team.map((member, index) => ({
      ...member,
      photo: normalizeImageAsset(
        member.photo,
        member.name || `Team member ${index + 1}`,
        warnings,
        `team[${index}].photo`
      )
    }));
  }

  return {
    siteConfig: output,
    warnings
  };
}

module.exports = {
  normalizeAssets,
  isHttpUrl
};
