const { createHash } = require('crypto');

const HIGH_IMPACT_SLOTS = [
  { slotId: 'hero.h1', sectionType: 'hero', maxChars: 80, maxLines: 2 },
  { slotId: 'hero.subhead', sectionType: 'hero', maxChars: 220, maxLines: 4 },
  { slotId: 'hero.primary_cta_label', sectionType: 'hero', maxChars: 28, maxLines: 1 },
  { slotId: 'value_props.intro', sectionType: 'value_props', maxChars: 180, maxLines: 3 },
  { slotId: 'about.intro', sectionType: 'about', maxChars: 260, maxLines: 4 },
  { slotId: 'contact.primary_cta_label', sectionType: 'contact', maxChars: 28, maxLines: 1 }
];

const SINGLE_PASS_SLOTS = [
  { slotId: 'process.step_1_title', sectionType: 'process', maxChars: 80, maxLines: 2 },
  { slotId: 'faq.q1', sectionType: 'faq', maxChars: 120, maxLines: 2 },
  { slotId: 'faq.a1', sectionType: 'faq', maxChars: 400, maxLines: 6 }
];

function stableId(seed) {
  const digest = createHash('sha256').update(seed).digest('hex').slice(0, 32);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
}

function lineCount(text) {
  return String(text).split(/\r?\n/).length;
}

function createCandidateText({ slotId, locale, variantKey }) {
  const localeCode = locale === 'cs-CZ' ? 'cs' : 'en';
  const compactSlot = slotId.replaceAll('.', '_');
  return `${compactSlot}_${localeCode}_${variantKey}`;
}

class ComposeCopyService {
  getSlotDefinitions() {
    const localeRequired = ['cs-CZ', 'en-US'];
    return [
      ...HIGH_IMPACT_SLOTS.map((slot) => ({
        ...slot,
        highImpact: true,
        localeRequired,
        required: true
      })),
      ...SINGLE_PASS_SLOTS.map((slot) => ({
        ...slot,
        highImpact: false,
        localeRequired,
        required: true
      }))
    ];
  }

  proposeVariants({ siteId, draftId, rulesVersion, catalogVersion, verticalStandardVersion }) {
    const proposalSeed = [siteId, draftId, rulesVersion, catalogVersion, verticalStandardVersion].join('|');
    return {
      draftId,
      variants: ['A', 'B', 'C'].map((variantKey) => ({
        proposalId: stableId(`${proposalSeed}|${variantKey}`),
        variantKey
      }))
    };
  }

  generateCopy({ draftId, locales }) {
    const slots = this.getSlotDefinitions();
    const candidates = [];
    const candidateCounts = { A: 0, B: 0, C: 0, SINGLE: 0 };

    for (const slot of slots) {
      const variantKeys = slot.highImpact ? ['A', 'B', 'C'] : ['SINGLE'];
      for (const locale of locales) {
        for (const variantKey of variantKeys) {
          const rawText = createCandidateText({
            slotId: slot.slotId,
            locale,
            variantKey
          });
          const text = rawText.length > slot.maxChars ? rawText.slice(0, slot.maxChars) : rawText;
          const withinLimits = text.length <= slot.maxChars && lineCount(text) <= slot.maxLines;
          const candidate = {
            candidateId: stableId(`${draftId}|${slot.slotId}|${locale}|${variantKey}`),
            slotId: slot.slotId,
            locale,
            variantKey,
            text,
            withinLimits,
            recommended: slot.highImpact ? variantKey === 'B' : true,
            generatedAt: new Date().toISOString()
          };
          candidates.push(candidate);
          candidateCounts[variantKey] += 1;
        }
      }
    }

    const slotLimitViolation = candidates.find((candidate) => !candidate.withinLimits);
    if (slotLimitViolation) {
      const error = new Error('Copy candidate exceeded slot limits');
      error.statusCode = 409;
      error.code = 'slot_limit_violation';
      error.details = {
        slotId: slotLimitViolation.slotId,
        locale: slotLimitViolation.locale,
        variantKey: slotLimitViolation.variantKey
      };
      throw error;
    }

    return {
      slots,
      candidates,
      summary: {
        draftId,
        slotsGenerated: slots.length,
        highImpactSlots: HIGH_IMPACT_SLOTS.length,
        candidateCounts
      }
    };
  }
}

module.exports = {
  ComposeCopyService,
  HIGH_IMPACT_SLOTS,
  SINGLE_PASS_SLOTS
};
