const fs = require('fs');
const path = require('path');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const { normalizeAssets } = require('./asset-generator');
const { buildTemplateRegistry } = require('./template-registry');

const DEFAULT_SCHEMA_PATH = path.join(__dirname, '..', 'schemas', 'web-generation-v1.json');
const RENDER_VERSION = '2.0.0';
const GENERATOR_VERSION = '2.0.0';

class GeneratorEngine {
  constructor(schemaPath = DEFAULT_SCHEMA_PATH) {
    this.schemaPath = schemaPath;
    this.ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(this.ajv);
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    this.validate = this.ajv.compile(schema);
  }

  generate(inputPath, outputDir, options = {}) {
    try {
      const resolvedInput = path.resolve(inputPath);
      const rawInput = JSON.parse(fs.readFileSync(resolvedInput, 'utf8'));
      return this.generateFromObject(rawInput, outputDir, {
        ...options,
        inputPath: resolvedInput
      });
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  generateFromObject(inputObject, outputDir, options = {}) {
    try {
      const resolvedOutput = path.resolve(outputDir);
      const clonedInput =
        typeof structuredClone === 'function'
          ? structuredClone(inputObject)
          : JSON.parse(JSON.stringify(inputObject));
      const input = this.normalizeInput(clonedInput);

      const valid = this.validate(input);
      if (!valid) {
        return {
          success: false,
          errors: this.validate.errors || []
        };
      }

      const siteConfig = this.processSiteConfig(input);
      const themeConfig = this.processThemeConfig(input);
      const individualized = this.applyIndividualization(input, siteConfig, themeConfig);
      const normalizedAssets = normalizeAssets(individualized.siteConfig);
      const finalSiteConfig = normalizedAssets.siteConfig;
      const metadataWarnings = [...normalizedAssets.warnings];
      const renderHints = {
        templateRegistry: buildTemplateRegistry(finalSiteConfig),
        componentRegistryVersion: '1.0.0'
      };
      const previewUrl = this.buildPreviewUrl(input.meta.brandSlug, options);
      const siteCode = this.generateReactCode(finalSiteConfig, individualized.themeConfig);
      const salesEmail = this.generateSalesEmail(input, previewUrl, finalSiteConfig);
      const specMarkdown = this.generateSpecMarkdown(
        input,
        {
          ...individualized,
          siteConfig: finalSiteConfig
        },
        previewUrl,
        metadataWarnings
      );

      const artifacts = this.saveArtifacts(
        {
          siteConfig: finalSiteConfig,
          themeConfig: individualized.themeConfig,
          siteCode,
          salesEmail,
          specMarkdown,
          previewUrl,
          individualization: individualized.meta,
          metadataWarnings,
          renderHints
        },
        resolvedOutput
      );

      const result = {
        success: true,
        outputDir: resolvedOutput,
        individualization: individualized.meta,
        metadataWarnings,
        renderHints,
        artifacts
      };

      if (options.inputPath) {
        result.inputPath = options.inputPath;
      }

      if (previewUrl) {
        result.previewUrl = previewUrl;
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  processSiteConfig(input) {
    const sortedSections = [...input.sections].sort((a, b) => {
      const aOrder = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
      const bOrder = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder;
    });

    const sections = sortedSections.map((section, index) => {
      const fallbackLayout = this.getDefaultLayout(section.type);
      const providedLayout = section.data && section.data.layout ? section.data.layout : {};

      return {
        id: section.id,
        type: section.type,
        title: section.title,
        subtitle: section.subtitle || '',
        order: typeof section.order === 'number' ? section.order : index + 1,
        layout: {
          ...fallbackLayout,
          ...providedLayout
        },
        data: {
          ...section.data
        }
      };
    });

    return {
      meta: {
        companyName: input.meta.companyName,
        brandSlug: input.meta.brandSlug,
        locale: input.meta.locale,
        industry: input.meta.industry
      },
      brand: {
        tagline: input.brand.tagline,
        description: input.brand.description,
        story: input.brand.story || null,
        personality: input.brand.personality,
        valueProps: input.brand.valueProps
      },
      navigation: input.navigation,
      sections,
      projects: input.projects,
      team: [...input.team].sort((a, b) => a.order - b.order),
      testimonials: input.testimonials,
      contact: input.contact,
      footer: input.footer
    };
  }

  processThemeConfig(input) {
    return {
      colors: {
        primary: input.meta.primaryColor.hex,
        secondary: input.meta.secondaryColor.hex,
        background: '#FAFAFA',
        backgroundAlt: '#F5F5F0',
        text: '#1A1A1A',
        accentDark: '#2D3436'
      },
      fonts: {
        heading: `${input.meta.fontPrimary.family}, serif`,
        body: `${input.meta.fontSecondary.family}, sans-serif`,
        headingRaw: input.meta.fontPrimary,
        bodyRaw: input.meta.fontSecondary
      },
      spacing: {
        sectionDesktop: 120,
        sectionMobile: 80,
        container: 1200,
        gridGap: 32,
        unit: 8
      },
      motion: {
        hero: { type: 'fade-in-slide-up', duration: 1.5, easing: 'ease-out' },
        section: { type: 'fade-in', duration: 0.8, easing: 'ease-out' },
        cardHover: { type: 'scale-shadow', duration: 0.3, easing: 'ease' },
        buttonHover: { type: 'background-shift', duration: 0.2, easing: 'ease' }
      },
      styles: {
        borderRadius: 10,
        borderRadiusLarge: 14,
        buttonTransform: 'none',
        heroTextAlign: 'center'
      }
    };
  }

  applyIndividualization(input, siteConfig, themeConfig) {
    const tone = (input.brand && input.brand.personality && input.brand.personality.tone) || 'professional';

    const rulesByTone = {
      formal: {
        heroAlign: 'center',
        borderRadius: 6,
        borderRadiusLarge: 8,
        headingFont: `${input.meta.fontPrimary.family}, serif`,
        bodyFont: `${input.meta.fontSecondary.family}, sans-serif`,
        buttonTransform: 'uppercase'
      },
      warm: {
        heroAlign: 'left',
        borderRadius: 16,
        borderRadiusLarge: 22,
        headingFont: `${input.meta.fontSecondary.family}, sans-serif`,
        bodyFont: `${input.meta.fontSecondary.family}, sans-serif`,
        buttonTransform: 'none'
      },
      professional: {
        heroAlign: 'center',
        borderRadius: 10,
        borderRadiusLarge: 14,
        headingFont: `${input.meta.fontPrimary.family}, serif`,
        bodyFont: `${input.meta.fontSecondary.family}, sans-serif`,
        buttonTransform: 'none'
      },
      playful: {
        heroAlign: 'left',
        borderRadius: 24,
        borderRadiusLarge: 28,
        headingFont: `${input.meta.fontSecondary.family}, sans-serif`,
        bodyFont: `${input.meta.fontSecondary.family}, sans-serif`,
        buttonTransform: 'capitalize'
      }
    };

    const selected = rulesByTone[tone] || rulesByTone.professional;

    const nextTheme = {
      ...themeConfig,
      fonts: {
        ...themeConfig.fonts,
        heading: selected.headingFont,
        body: selected.bodyFont
      },
      styles: {
        ...themeConfig.styles,
        borderRadius: selected.borderRadius,
        borderRadiusLarge: selected.borderRadiusLarge,
        buttonTransform: selected.buttonTransform,
        heroTextAlign: selected.heroAlign
      }
    };

    const nextSections = siteConfig.sections.map((section) => {
      if (section.type === 'hero') {
        return {
          ...section,
          layout: {
            ...section.layout,
            align: selected.heroAlign
          }
        };
      }

      if (section.type === 'process') {
        const processStyle = tone === 'playful' ? 'cards' : tone === 'warm' ? 'stack' : 'timeline';
        return {
          ...section,
          data: {
            ...section.data,
            style: processStyle
          }
        };
      }

      return section;
    });

    return {
      siteConfig: {
        ...siteConfig,
        sections: nextSections
      },
      themeConfig: nextTheme,
      meta: {
        tone,
        heroAlign: selected.heroAlign,
        borderRadius: selected.borderRadius,
        headingFont: selected.headingFont
      }
    };
  }

  getDefaultLayout(sectionType) {
    const byType = {
      hero: { fullWidth: true, align: 'center' },
      'value-props': { columns: 4, align: 'center' },
      'portfolio-preview': { columns: 3, align: 'left' },
      'portfolio-grid': { columns: 3, align: 'left' },
      process: { columns: 4, align: 'center' },
      team: { columns: 3, align: 'left' },
      testimonials: { columns: 1, align: 'left' },
      stats: { columns: 3, align: 'center' },
      'cta-form': { columns: 1, align: 'center' },
      contact: { columns: 2, align: 'left' },
      about: { columns: 1, align: 'left' },
      faq: { columns: 1, align: 'left' }
    };

    return byType[sectionType] || { columns: 1, align: 'left' };
  }

  buildPreviewUrl(brandSlug, options = {}) {
    const configuredBase = options.previewBaseUrl || process.env.VERTICAL_PREVIEW_BASE_URL;
    if (!configuredBase) {
      return null;
    }

    const base = configuredBase.trim().replace(/\/+$/, '');
    if (base.includes('{slug}')) {
      return base.replace('{slug}', brandSlug);
    }

    return `${base}/${brandSlug}`;
  }

  normalizeInput(input) {
    if (!input || typeof input !== 'object') {
      return input;
    }

    if (input.meta && typeof input.meta === 'object') {
      if (!input.meta.locale && input.meta.Locale) {
        input.meta.locale = input.meta.Locale;
      }
    }

    return input;
  }

  generateReactCode(siteConfig, themeConfig) {
    const siteConfigJson = JSON.stringify(siteConfig, null, 2);
    const themeConfigJson = JSON.stringify(themeConfig, null, 2);

    return `import React from 'react';

const siteConfig = ${siteConfigJson};
const themeConfig = ${themeConfigJson};

function renderSection(section) {
  switch (section.type) {
    case 'hero':
      return (
        <>
          <h1 style={{ fontFamily: themeConfig.fonts.heading, fontSize: 56, marginBottom: 16 }}>{section.title}</h1>
          {section.subtitle ? <p style={{ fontSize: 20, maxWidth: 760, margin: '0 auto' }}>{section.subtitle}</p> : null}
        </>
      );
    case 'value-props':
      return (
        <>
          <h2 style={{ fontFamily: themeConfig.fonts.heading }}>{section.title}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: themeConfig.spacing.gridGap }}>
            {(siteConfig.brand.valueProps || []).map((item) => (
              <article key={item.id} style={{ border: '1px solid #eee', borderRadius: themeConfig.styles.borderRadiusLarge, padding: 24 }}>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </>
      );
    case 'portfolio-preview':
    case 'portfolio-grid':
      return (
        <>
          <h2 style={{ fontFamily: themeConfig.fonts.heading }}>{section.title}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: themeConfig.spacing.gridGap }}>
            {siteConfig.projects.map((project) => (
              <article key={project.id} style={{ border: '1px solid #eee', borderRadius: themeConfig.styles.borderRadiusLarge, overflow: 'hidden' }}>
                <img src={project.thumbnail.url} alt={project.thumbnail.alt || project.name} style={{ width: '100%', aspectRatio: '16 / 9', objectFit: 'cover' }} />
                <div style={{ padding: 16 }}>
                  <h3 style={{ marginTop: 0 }}>{project.name}</h3>
                  <p style={{ marginBottom: 0 }}>{project.location.city}</p>
                </div>
              </article>
            ))}
          </div>
        </>
      );
    case 'team':
      return (
        <>
          <h2 style={{ fontFamily: themeConfig.fonts.heading }}>{section.title}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: themeConfig.spacing.gridGap }}>
            {siteConfig.team.map((person) => (
              <article key={person.id} style={{ border: '1px solid #eee', borderRadius: themeConfig.styles.borderRadiusLarge, padding: 16 }}>
                <img src={person.photo.url} alt={person.name} style={{ width: '100%', aspectRatio: '4 / 5', objectFit: 'cover', borderRadius: 12 }} />
                <h3>{person.name}</h3>
                <p>{person.role}</p>
                <p>{person.bio}</p>
              </article>
            ))}
          </div>
        </>
      );
    case 'testimonials':
      return (
        <>
          <h2 style={{ fontFamily: themeConfig.fonts.heading }}>{section.title}</h2>
          {siteConfig.testimonials.map((item) => (
            <blockquote key={item.id} style={{ borderLeft: '4px solid ' + themeConfig.colors.secondary, margin: 0, padding: '8px 0 8px 16px' }}>
              <p>{item.quote}</p>
              <footer>{item.author}</footer>
            </blockquote>
          ))}
        </>
      );
    case 'stats':
      return (
        <>
          <h2 style={{ fontFamily: themeConfig.fonts.heading }}>{section.title}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: themeConfig.spacing.gridGap }}>
            {(section.data.items || []).map((item, idx) => (
              <article key={idx}>
                <p style={{ fontSize: 42, fontFamily: themeConfig.fonts.heading, margin: 0 }}>{item.value}</p>
                <p>{item.label}</p>
              </article>
            ))}
          </div>
        </>
      );
    case 'cta-form':
      return (
        <>
          <h2 style={{ fontFamily: themeConfig.fonts.heading }}>{section.title}</h2>
          {section.subtitle ? <p>{section.subtitle}</p> : null}
          <form style={{ display: 'grid', gap: 12, maxWidth: 620 }}>
            {siteConfig.contact.form.fields.map((field) => {
              if (field.type === 'textarea') {
                return <textarea key={field.name} placeholder={field.label} rows={5} />;
              }
              if (field.type === 'checkbox') {
                return (
                  <label key={field.name} style={{ display: 'flex', gap: 8 }}>
                    <input type="checkbox" />
                    <span>{field.label}</span>
                  </label>
                );
              }
              return <input key={field.name} type={field.type} placeholder={field.label} />;
            })}
            <button type="submit" style={{ background: themeConfig.colors.secondary, color: '#fff', border: 0, padding: '12px 16px', borderRadius: themeConfig.styles.borderRadius }}>
              {siteConfig.contact.form.submitLabel}
            </button>
          </form>
        </>
      );
    case 'contact':
      return (
        <>
          <h2 style={{ fontFamily: themeConfig.fonts.heading }}>{section.title}</h2>
          <p>{siteConfig.contact.email}</p>
          <p>{siteConfig.contact.phone}</p>
        </>
      );
    default:
      return (
        <>
          <h2 style={{ fontFamily: themeConfig.fonts.heading }}>{section.title}</h2>
          {section.subtitle ? <p>{section.subtitle}</p> : null}
        </>
      );
  }
}

export default function Site() {
  return (
    <main
      style={{
        fontFamily: themeConfig.fonts.body,
        color: themeConfig.colors.text,
        background: themeConfig.colors.background
      }}
    >
      <header
        style={{
          position: siteConfig.navigation.sticky ? 'sticky' : 'static',
          top: 0,
          zIndex: 100,
          background: '#fff',
          borderBottom: '1px solid #eee'
        }}
      >
        <nav style={{ maxWidth: themeConfig.spacing.container, margin: '0 auto', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>{siteConfig.meta.companyName}</strong>
          <div style={{ display: 'flex', gap: 16 }}>
            {siteConfig.navigation.items.map((item) => (
              <a key={item.href} href={item.href}>{item.label}</a>
            ))}
          </div>
          <a href={siteConfig.navigation.cta.href} style={{ background: themeConfig.colors.secondary, color: '#fff', padding: '10px 16px', borderRadius: themeConfig.styles.borderRadius, textTransform: themeConfig.styles.buttonTransform }}>
            {siteConfig.navigation.cta.label}
          </a>
        </nav>
      </header>

      {siteConfig.sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          style={{
            maxWidth: themeConfig.spacing.container,
            margin: '0 auto',
            padding: themeConfig.spacing.sectionDesktop + 'px 24px',
            textAlign: section.layout.align || 'left'
          }}
        >
          {renderSection(section)}
        </section>
      ))}

      <footer style={{ background: themeConfig.colors.accentDark, color: '#fff', padding: '48px 24px' }}>
        <div style={{ maxWidth: themeConfig.spacing.container, margin: '0 auto', display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {siteConfig.footer.columns.map((column, idx) => (
            <div key={idx}>
              <h4>{column.title}</h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {column.links.map((link) => (
                  <li key={link.href}><a href={link.href} style={{ color: '#fff' }}>{link.label}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </footer>
    </main>
  );
}
`;
  }

  generateSalesEmail(input, previewUrl, siteConfig) {
    const features = [
      'Hero section with premium visual treatment',
      'Value proposition block with core differentiators',
      'Portfolio preview with project cards',
      'Team and trust-building content',
      'Lead capture contact form'
    ];

    const sectionsCount = siteConfig.sections.length;
    const projectsCount = siteConfig.projects.length;

    return [
      `Subject: Website preview for ${input.meta.companyName}`,
      '',
      `Hello ${input.meta.companyName} team,`,
      '',
      'Based on your brand profile, we generated a new website preview tailored for your company.',
      '',
      previewUrl ? `Preview URL: ${previewUrl}` : 'Preview URL: generated after deployment',
      '',
      'Included in this draft:',
      ...features.map((feature) => `- ${feature}`),
      '',
      `Sections generated: ${sectionsCount}`,
      `Projects showcased: ${projectsCount}`,
      `Tone profile: ${input.brand.personality.tone}`,
      '',
      'If this direction looks good, we can walk through revisions on a 30-minute call.',
      '',
      'Best regards,',
      'Vertical Studio'
    ].join('\n');
  }

  generateSpecMarkdown(input, individualized, previewUrl, warnings = []) {
    const sectionRows = individualized.siteConfig.sections
      .map((section) => `| ${section.order} | ${section.type} | ${section.title} |`)
      .join('\n');

    return [
      `# SPEC - ${input.meta.companyName}`,
      '',
      '## Generation Summary',
      `- Company: ${input.meta.companyName}`,
      `- Slug: ${input.meta.brandSlug}`,
      `- Industry: ${input.meta.industry}`,
      `- Locale: ${input.meta.locale}`,
      `- Tone: ${individualized.meta.tone}`,
      previewUrl ? `- Preview URL: ${previewUrl}` : '- Preview URL: generated after deployment',
      '',
      '## Theme',
      `- Primary color: ${individualized.themeConfig.colors.primary}`,
      `- Secondary color: ${individualized.themeConfig.colors.secondary}`,
      `- Heading font: ${individualized.themeConfig.fonts.heading}`,
      `- Body font: ${individualized.themeConfig.fonts.body}`,
      `- Border radius: ${individualized.themeConfig.styles.borderRadius}px`,
      '',
      '## Sections',
      '| Order | Type | Title |',
      '| --- | --- | --- |',
      sectionRows,
      '',
      '## Notes',
      '- Generated from JSON schema: web-generation-v1.json',
      '- Output is intended as deployable preview baseline and can be extended for Next.js pages.',
      '',
      '## Warnings',
      ...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ['- none'])
    ].join('\n');
  }

  saveArtifacts(payload, outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });

    const paths = {
      siteConfig: path.join(outputDir, 'site-config.json'),
      themeConfig: path.join(outputDir, 'theme-config.json'),
      reactSite: path.join(outputDir, 'Site.jsx'),
      salesEmail: path.join(outputDir, 'sales-email.txt'),
      spec: path.join(outputDir, 'SPEC.md'),
      manifest: path.join(outputDir, 'manifest.json'),
      templateRegistry: path.join(outputDir, 'template-registry.json')
    };

    fs.writeFileSync(paths.siteConfig, JSON.stringify(payload.siteConfig, null, 2));
    fs.writeFileSync(paths.themeConfig, JSON.stringify(payload.themeConfig, null, 2));
    fs.writeFileSync(paths.reactSite, payload.siteCode);
    fs.writeFileSync(paths.salesEmail, payload.salesEmail);
    fs.writeFileSync(paths.spec, payload.specMarkdown);
    fs.writeFileSync(paths.templateRegistry, JSON.stringify(payload.renderHints.templateRegistry, null, 2));
    const manifest = {
      renderVersion: RENDER_VERSION,
      generatorVersion: GENERATOR_VERSION,
      preview: {
        status: payload.previewUrl ? 'configured' : 'not_configured'
      },
      generatedAt: new Date().toISOString(),
      warnings: payload.metadataWarnings || [],
      renderHints: payload.renderHints || {},
      individualization: payload.individualization,
      files: {
        siteConfig: 'site-config.json',
        themeConfig: 'theme-config.json',
        reactSite: 'Site.jsx',
        salesEmail: 'sales-email.txt',
        spec: 'SPEC.md',
        templateRegistry: 'template-registry.json'
      }
    };

    if (payload.previewUrl) {
      manifest.preview.url = payload.previewUrl;
    }

    fs.writeFileSync(paths.manifest, JSON.stringify(manifest, null, 2));

    return paths;
  }
}

module.exports = {
  GeneratorEngine
};

if (require.main === module) {
  const [, , inputArg, outputArg] = process.argv;

  if (!inputArg) {
    console.error('Usage: node engine/generator.js <input.json> [outputDir]');
    process.exit(1);
  }

  const inputPath = path.resolve(process.cwd(), inputArg);
  const outputDir = outputArg
    ? path.resolve(process.cwd(), outputArg)
    : path.resolve(process.cwd(), 'build-output');

  const engine = new GeneratorEngine();
  const result = engine.generate(inputPath, outputDir);

  if (!result.success) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}
