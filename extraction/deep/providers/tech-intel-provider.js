const fs = require('fs');
const path = require('path');
const { registerEvidence, appendFieldLink } = require('./provider-utils');

function detectCms(html) {
  const low = String(html || '').toLowerCase();
  const cms = [];
  if (low.includes('wp-content') || low.includes('wordpress')) cms.push('WordPress');
  if (low.includes('shopify')) cms.push('Shopify');
  if (low.includes('wix.com') || low.includes('wix-code')) cms.push('Wix');
  if (low.includes('webflow')) cms.push('Webflow');
  if (low.includes('drupal-settings-json') || low.includes('drupal')) cms.push('Drupal');
  if (low.includes('joomla')) cms.push('Joomla');
  return [...new Set(cms)];
}

function detectTrackers(html) {
  const low = String(html || '').toLowerCase();
  const trackers = [];
  if (low.includes('googletagmanager.com')) trackers.push('Google Tag Manager');
  if (low.includes('google-analytics.com') || low.includes('gtag(')) trackers.push('Google Analytics');
  if (low.includes('facebook.net') || low.includes('fbq(')) trackers.push('Meta Pixel');
  if (low.includes('hotjar')) trackers.push('Hotjar');
  if (low.includes('clarity.ms')) trackers.push('Microsoft Clarity');
  if (low.includes('segment.com') || low.includes('analytics.track(')) trackers.push('Segment');
  return [...new Set(trackers)];
}

function detectCdn(html) {
  const low = String(html || '').toLowerCase();
  const cdn = [];
  if (low.includes('cloudflare')) cdn.push('Cloudflare');
  if (low.includes('cdn.jsdelivr.net')) cdn.push('jsDelivr');
  if (low.includes('unpkg.com')) cdn.push('unpkg');
  if (low.includes('fastly')) cdn.push('Fastly');
  if (low.includes('akamai')) cdn.push('Akamai');
  return [...new Set(cdn)];
}

function detectHosting(pageUrl) {
  const host = new URL(pageUrl).hostname;
  const findings = [];
  if (host.endsWith('vercel.app')) findings.push('Vercel');
  if (host.endsWith('netlify.app')) findings.push('Netlify');
  return findings;
}

async function runTechIntelProvider(context) {
  const { baseResult } = context;
  const findings = {
    cms: [],
    trackers: [],
    cdn: [],
    hosting: [],
    evidence: []
  };
  const evidence = [];
  const fieldLinks = {};

  for (const page of (baseResult.content && baseResult.content.pages) || []) {
    const source = ((baseResult.artifacts && baseResult.artifacts.items) || []).find(
      (item) => item.type === 'raw_html' && item.metadata && item.metadata.url === page.url
    );

    if (!source) {
      continue;
    }

    const sourceId = `tech:${page.url}`;
    registerEvidence(evidence, {
      id: sourceId,
      step: 'offsite.tech_intel',
      type: 'tech_fingerprint',
      url: page.url,
      title: `Tech fingerprint ${page.url}`,
      artifactId: source.id,
      timestamp: new Date().toISOString()
    });

    findings.evidence.push(page.url);
    appendFieldLink(fieldLinks, 'outside.tech.cms', sourceId);
    appendFieldLink(fieldLinks, 'outside.tech.trackers', sourceId);
    appendFieldLink(fieldLinks, 'outside.tech.cdn', sourceId);
  }

  const artifactRoot = baseResult.artifacts && baseResult.artifacts.root ? baseResult.artifacts.root : null;
  const rawHtml = ((baseResult.artifacts && baseResult.artifacts.items) || [])
    .filter((item) => item.type === 'raw_html' && item.path)
    .map((item) => {
      if (!artifactRoot) {
        return '';
      }

      const absPath = path.join(artifactRoot, item.path);
      try {
        return fs.readFileSync(absPath, 'utf8');
      } catch (_error) {
        return '';
      }
    })
    .join('\n');

  findings.cms = detectCms(rawHtml);
  findings.trackers = detectTrackers(rawHtml);
  findings.cdn = detectCdn(rawHtml);
  findings.hosting = detectHosting(baseResult.finalUrl);

  return {
    findings,
    evidence,
    fieldLinks,
    cost: 0,
    warnings: []
  };
}

module.exports = {
  runTechIntelProvider
};
