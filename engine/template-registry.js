const { getComponentForSection } = require('./component-registry');

function buildTemplateRegistry(siteConfig) {
  return (siteConfig.sections || []).map((section) => ({
    sectionId: section.id,
    sectionType: section.type,
    component: getComponentForSection(section.type)
  }));
}

module.exports = {
  buildTemplateRegistry
};
