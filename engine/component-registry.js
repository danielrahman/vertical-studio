const SECTION_COMPONENTS = {
  hero: 'HeroSection',
  'value-props': 'ValuePropsSection',
  'portfolio-preview': 'PortfolioPreviewSection',
  'portfolio-grid': 'PortfolioGridSection',
  process: 'ProcessSection',
  team: 'TeamSection',
  testimonials: 'TestimonialsSection',
  stats: 'StatsSection',
  'cta-form': 'CtaFormSection',
  contact: 'ContactSection',
  about: 'AboutSection',
  faq: 'FaqSection'
};

function getComponentForSection(sectionType) {
  return SECTION_COMPONENTS[sectionType] || 'GenericSection';
}

module.exports = {
  SECTION_COMPONENTS,
  getComponentForSection
};
