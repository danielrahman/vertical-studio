const fs = require('fs');
const path = require('path');

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

class CompanyInputNormalizer {
  constructor(options = {}) {
    this.baseTemplatePath =
      options.baseTemplatePath || path.resolve(process.cwd(), 'samples', 'all-new-development-input.json');
  }

  normalize({ extractedData, enrichment, context = {} }) {
    const template = JSON.parse(fs.readFileSync(this.baseTemplatePath, 'utf8'));
    const normalized = clone(template);

    const companyName =
      context.companyName ||
      enrichment.companyName ||
      extractedData.title ||
      (context.websiteUrl ? new URL(context.websiteUrl).hostname.replace(/^www\./, '') : 'Company');

    const brandSlug = context.brandSlug || slugify(companyName) || 'generated-company';
    const locale = context.locale || 'en-US';
    const industry = context.industry || 'boutique_developer';

    normalized.meta.companyName = companyName;
    normalized.meta.brandSlug = brandSlug;
    normalized.meta.locale = locale;
    normalized.meta.industry = industry;

    normalized.brand.tagline = enrichment.tagline || extractedData.title || normalized.brand.tagline;
    normalized.brand.description = enrichment.description || extractedData.description || normalized.brand.description;
    normalized.brand.valueProps =
      Array.isArray(enrichment.valueProps) && enrichment.valueProps.length
        ? enrichment.valueProps
        : normalized.brand.valueProps;

    if (normalized.brand.personality && enrichment.tone) {
      normalized.brand.personality.tone = enrichment.tone;
    }

    const heroSection = normalized.sections.find((section) => section.id === 'hero');
    if (heroSection) {
      heroSection.title = extractedData.headings.h1[0] || enrichment.tagline || heroSection.title;
      heroSection.subtitle = extractedData.description || enrichment.description || heroSection.subtitle;
    }

    const projectSource = extractedData.projectBlocks.length
      ? extractedData.projectBlocks
      : extractedData.headings.h2.map((heading) => ({ title: heading, summary: null }));

    if (projectSource.length) {
      const projects = projectSource.slice(0, normalized.projects.length || 3);
      normalized.projects = projects.map((item, index) => {
        const fallback = normalized.projects[index] || normalized.projects[0];
        const slug = slugify(item.title || fallback.name || `project-${index + 1}`) || `project-${index + 1}`;
        return {
          ...fallback,
          id: slug,
          slug,
          name: item.title || fallback.name,
          tagline: item.summary || fallback.tagline,
          location: {
            ...fallback.location,
            city: fallback.location && fallback.location.city ? fallback.location.city : companyName
          }
        };
      });
    }

    if (normalized.contact) {
      if (Array.isArray(extractedData.contacts.emails) && extractedData.contacts.emails[0]) {
        normalized.contact.email = extractedData.contacts.emails[0];
      }

      if (Array.isArray(extractedData.contacts.phones) && extractedData.contacts.phones[0]) {
        normalized.contact.phone = extractedData.contacts.phones[0];
      }
    }

    normalized._source = {
      websiteUrl: context.websiteUrl || null,
      scrapedAt: extractedData.scrapedAt,
      enrichmentProvider: enrichment.provider || 'unknown'
    };

    return normalized;
  }
}

module.exports = {
  CompanyInputNormalizer,
  slugify
};
