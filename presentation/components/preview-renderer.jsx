function sectionTitle(section, fallback) {
  return section.title || fallback || section.type;
}

function cardBase(radius) {
  return {
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: radius,
    background: 'rgba(255,255,255,0.88)'
  };
}

function SectionRenderer({ section, siteConfig, themeConfig }) {
  const radius = themeConfig.styles?.borderRadiusLarge || 16;

  switch (section.type) {
    case 'hero':
      return (
        <div className="space-y-4 text-center">
          <h1 className="text-4xl leading-tight sm:text-5xl" style={{ fontFamily: themeConfig.fonts?.heading }}>
            {sectionTitle(section, siteConfig.brand?.tagline)}
          </h1>
          {section.subtitle ? <p className="mx-auto max-w-3xl text-lg text-ink/75">{section.subtitle}</p> : null}
        </div>
      );

    case 'value-props':
      return (
        <div>
          <h2 className="mb-5 text-3xl" style={{ fontFamily: themeConfig.fonts?.heading }}>
            {sectionTitle(section, 'Value Proposition')}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(siteConfig.brand?.valueProps || []).map((item) => (
              <article key={item.id} className="p-4" style={cardBase(radius)}>
                <h3 className="font-semibold text-ink">{item.title}</h3>
                <p className="mt-2 text-sm text-ink/75">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      );

    case 'portfolio-preview':
    case 'portfolio-grid':
      return (
        <div>
          <h2 className="mb-5 text-3xl" style={{ fontFamily: themeConfig.fonts?.heading }}>
            {sectionTitle(section, 'Projects')}
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(siteConfig.projects || []).map((project) => (
              <article key={project.id} className="overflow-hidden" style={cardBase(radius)}>
                <img
                  src={project.thumbnail?.url}
                  alt={project.thumbnail?.alt || project.name}
                  className="h-44 w-full object-cover"
                />
                <div className="space-y-2 p-4">
                  <h3 className="text-lg font-semibold">{project.name}</h3>
                  <p className="text-sm text-ink/70">{project.tagline}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      );

    case 'team':
      return (
        <div>
          <h2 className="mb-5 text-3xl" style={{ fontFamily: themeConfig.fonts?.heading }}>
            {sectionTitle(section, 'Team')}
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(siteConfig.team || []).map((person) => (
              <article key={person.id} className="overflow-hidden" style={cardBase(radius)}>
                <img src={person.photo?.url} alt={person.name} className="h-64 w-full object-cover" />
                <div className="p-4">
                  <h3 className="font-semibold">{person.name}</h3>
                  <p className="text-sm text-ink/70">{person.role}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      );

    case 'testimonials':
      return (
        <div>
          <h2 className="mb-5 text-3xl" style={{ fontFamily: themeConfig.fonts?.heading }}>
            {sectionTitle(section, 'Testimonials')}
          </h2>
          <div className="grid gap-4">
            {(siteConfig.testimonials || []).map((item) => (
              <blockquote key={item.id} className="rounded-2xl border border-ink/10 bg-white/85 p-5">
                <p className="text-lg">“{item.quote}”</p>
                <footer className="mt-2 text-sm text-ink/70">{item.author}</footer>
              </blockquote>
            ))}
          </div>
        </div>
      );

    case 'stats':
      return (
        <div>
          <h2 className="mb-5 text-3xl" style={{ fontFamily: themeConfig.fonts?.heading }}>
            {sectionTitle(section, 'Stats')}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {(section.data?.items || []).map((item, index) => (
              <article key={`${item.label}-${index}`} className="rounded-2xl border border-ink/10 bg-white/90 p-4 text-center">
                <p className="text-4xl font-semibold" style={{ fontFamily: themeConfig.fonts?.heading }}>
                  {item.value}
                </p>
                <p className="text-sm text-ink/75">{item.label}</p>
              </article>
            ))}
          </div>
        </div>
      );

    case 'contact':
    case 'cta-form':
      return (
        <div>
          <h2 className="mb-4 text-3xl" style={{ fontFamily: themeConfig.fonts?.heading }}>
            {sectionTitle(section, 'Contact')}
          </h2>
          <div className="grid gap-2 text-base text-ink/80">
            <p>{siteConfig.contact?.email}</p>
            <p>{siteConfig.contact?.phone}</p>
          </div>
        </div>
      );

    default:
      return (
        <div>
          <h2 className="text-3xl" style={{ fontFamily: themeConfig.fonts?.heading }}>
            {sectionTitle(section, section.type)}
          </h2>
          {section.subtitle ? <p className="mt-2 text-ink/70">{section.subtitle}</p> : null}
        </div>
      );
  }
}

export function PreviewRenderer({ siteConfig, themeConfig }) {
  const primary = themeConfig.colors?.primary || '#11211e';
  const secondary = themeConfig.colors?.secondary || '#d6b88d';
  const background = themeConfig.colors?.background || '#f7f6f2';
  const text = themeConfig.colors?.text || '#11211e';

  return (
    <div
      className="overflow-hidden rounded-3xl border border-white/70 shadow-card"
      style={{
        background,
        color: text
      }}
    >
      <div
        className="px-6 py-10 sm:px-10"
        style={{
          background: `radial-gradient(circle at 10% 0%, ${secondary}2f, transparent 40%), radial-gradient(circle at 90% 0%, ${primary}33, transparent 38%)`
        }}
      >
        {(siteConfig.sections || []).map((section) => (
          <section key={section.id} id={section.id} className="mx-auto max-w-6xl py-8 sm:py-12">
            <SectionRenderer section={section} siteConfig={siteConfig} themeConfig={themeConfig} />
          </section>
        ))}
      </div>
    </div>
  );
}
