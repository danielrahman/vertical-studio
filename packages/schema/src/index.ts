import { z } from 'zod';

export const SUPPORTED_LOCALES = ['cs-CZ', 'en-US'] as const;
export const LocaleSchema = z.enum(SUPPORTED_LOCALES);
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const EXTRACTION_METHODS = ['dom', 'ocr', 'inference', 'manual'] as const;
export const ExtractionMethodSchema = z.enum(EXTRACTION_METHODS);
export type ExtractionMethod = (typeof EXTRACTION_METHODS)[number];

export type ExtractedField<T> = {
  value: T | null;
  sourceUrl: string | null;
  method: ExtractionMethod;
  confidence: number;
  extractedAt: string;
  todo: boolean;
};

export const createExtractedFieldSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    value: valueSchema.nullable(),
    sourceUrl: z.string().nullable(),
    method: ExtractionMethodSchema,
    confidence: z.number().min(0).max(1),
    extractedAt: z.string().datetime(),
    todo: z.boolean()
  });

export const ExtractedUnknownFieldSchema = createExtractedFieldSchema(z.unknown());

export const VERTICAL_SOURCE_POLICY = 'public_web_legal_selected_listings' as const;

export const VerticalStandardSchema = z.object({
  id: z.string().min(1),
  verticalKey: z.string().min(1),
  competitorCount: z.number().int().min(15),
  sourcePolicy: z.literal(VERTICAL_SOURCE_POLICY),
  iaPatterns: z.array(z.string()),
  ctaPatterns: z.array(z.string()),
  trustPatterns: z.array(z.string()),
  toneLexicon: z.array(z.string()),
  doRules: z.array(z.string()),
  dontRules: z.array(z.string()),
  createdAt: z.string().datetime(),
  version: z.string().min(1)
});
export type VerticalStandard = z.infer<typeof VerticalStandardSchema>;

export const CompetitorPatternTypes = ['ia', 'cta', 'trust', 'tone'] as const;
export const CompetitorPatternTypeSchema = z.enum(CompetitorPatternTypes);

export const CompetitorPatternSchema = z.object({
  id: z.string().min(1),
  verticalStandardId: z.string().min(1),
  sourceDomain: z.string().min(1),
  patternType: CompetitorPatternTypeSchema,
  patternJson: z.record(z.string(), z.unknown())
});
export type CompetitorPattern = z.infer<typeof CompetitorPatternSchema>;

export const ComponentContractSchema = z.object({
  componentId: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1).optional(),
  propsSchema: z.record(z.string(), z.unknown()),
  requiredFields: z.array(z.string().min(1)),
  maxLengths: z.record(z.string(), z.number().int().positive()),
  fallbackPolicy: z.record(z.string(), z.string()),
  allowedVariants: z.array(z.string().min(1)),
  seoA11yRequirements: z.array(z.string().min(1))
});
export type ComponentContract = z.infer<typeof ComponentContractSchema>;

export const CopyVariantKeys = ['A', 'B', 'C', 'SINGLE'] as const;
export const CopyVariantKeySchema = z.enum(CopyVariantKeys);

export const CopySlotDefinitionSchema = z.object({
  slotId: z.string().min(1),
  sectionType: z.string().min(1),
  highImpact: z.boolean(),
  maxChars: z.number().int().positive(),
  maxLines: z.number().int().positive(),
  localeRequired: z.array(LocaleSchema).min(1),
  required: z.boolean().default(true)
});
export type CopySlotDefinition = z.infer<typeof CopySlotDefinitionSchema>;

export const CopyCandidateSchema = z.object({
  slotId: z.string().min(1),
  locale: LocaleSchema,
  variantKey: CopyVariantKeySchema,
  text: z.string(),
  withinLimits: z.boolean(),
  recommended: z.boolean(),
  generatedAt: z.string().datetime().optional()
});
export type CopyCandidate = z.infer<typeof CopyCandidateSchema>;

export const CopyRecommendationSchema = z.object({
  slotId: z.string().min(1),
  locale: LocaleSchema,
  selectedCandidateId: z.string().min(1),
  selectedBy: z.enum(['system', 'internal_admin', 'owner']),
  selectedAt: z.string().datetime()
});
export type CopyRecommendation = z.infer<typeof CopyRecommendationSchema>;

export const HIGH_IMPACT_SLOT_IDS = [
  'hero.h1',
  'hero.subhead',
  'hero.primary_cta_label',
  'value_props.intro',
  'about.intro',
  'contact.primary_cta_label'
] as const;

export const ReviewStates = [
  'draft',
  'proposal_generated',
  'review_in_progress',
  'proposal_selected',
  'quality_checking',
  'security_checking',
  'publish_blocked',
  'published',
  'rollback_pending',
  'rolled_back'
] as const;
export const ReviewStateSchema = z.enum(ReviewStates);
export type ReviewState = (typeof ReviewStates)[number];

export const ReviewTransitionEvents = [
  'PROPOSALS_READY',
  'REVIEW_STARTED',
  'PROPOSAL_SELECTED',
  'QUALITY_STARTED',
  'QUALITY_FAILED',
  'QUALITY_PASSED',
  'SECURITY_FAILED',
  'SECURITY_PASSED',
  'ROLLBACK_REQUESTED',
  'ROLLBACK_COMPLETED'
] as const;
export const ReviewTransitionEventSchema = z.enum(ReviewTransitionEvents);

export const ReviewTransitionRequestSchema = z.object({
  draftId: z.string().min(1),
  fromState: ReviewStateSchema,
  toState: ReviewStateSchema,
  event: ReviewTransitionEventSchema,
  reason: z.string().optional()
});
export type ReviewTransitionRequest = z.infer<typeof ReviewTransitionRequestSchema>;

export const SECRET_REF_PATTERN = /^tenant\.[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+$/;
export const SECRET_REF_SEGMENT_PATTERN = /^[a-z0-9-]+$/;

function getSecretRefSegments(ref: string) {
  const segments = ref.split('.');
  if (segments.length !== 4 || segments[0] !== 'tenant') {
    return null;
  }

  const [_, tenantSlug, provider, key] = segments;
  return { tenantSlug, provider, key };
}

export const SecretRefMetadataSchema = z
  .object({
    secretRefId: z.string().min(1),
    tenantId: z.string().min(1),
    tenantSlug: z.string().regex(SECRET_REF_SEGMENT_PATTERN),
    ref: z.string().regex(SECRET_REF_PATTERN),
    provider: z.string().regex(SECRET_REF_SEGMENT_PATTERN),
    key: z.string().regex(SECRET_REF_SEGMENT_PATTERN),
    label: z.string().min(1).nullable(),
    description: z.string().min(1).nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime()
  })
  .superRefine((payload, ctx) => {
    const segments = getSecretRefSegments(payload.ref);
    if (!segments) {
      return;
    }

    if (segments.tenantSlug !== payload.tenantSlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tenantSlug'],
        message: 'tenantSlug must match ref segment'
      });
    }

    if (segments.provider !== payload.provider) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['provider'],
        message: 'provider must match ref segment'
      });
    }

    if (segments.key !== payload.key) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['key'],
        message: 'key must match ref segment'
      });
    }
  });
export type SecretRefMetadata = z.infer<typeof SecretRefMetadataSchema>;

export const ManualOverrideSchema = z.object({
  draftId: z.string().min(1),
  tone: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  requiredSections: z.array(z.string()).default([]),
  excludedSections: z.array(z.string()).default([]),
  pinnedSections: z.array(z.string()).default([]),
  requiredComponents: z.array(z.string()).default([]),
  excludedCompetitorPatterns: z.array(z.string()).default([])
});
export type ManualOverride = z.infer<typeof ManualOverrideSchema>;

export const VerticalResearchBuildRequestSchema = z.object({
  targetCompetitorCount: z.number().int().min(15),
  sources: z.array(z.enum(['public_web', 'legal_pages', 'selected_listings'])).min(1),
  sourceDomains: z.array(z.string()).default([])
});
export type VerticalResearchBuildRequest = z.infer<typeof VerticalResearchBuildRequestSchema>;
