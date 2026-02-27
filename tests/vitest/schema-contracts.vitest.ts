import { describe, expect, it } from 'vitest';

import {
  ComponentContractSchema,
  CopyCandidateSchema,
  ExtractedUnknownFieldSchema,
  ReviewTransitionRequestSchema,
  VerticalResearchBuildRequestSchema,
  VerticalStandardSchema
} from '../../packages/schema/src/index';

describe('schema contracts', () => {
  it('enforces minimum competitor sample in VerticalStandard', () => {
    const result = VerticalStandardSchema.safeParse({
      id: 'vs-1',
      verticalKey: 'boutique-developers',
      competitorCount: 14,
      sourcePolicy: 'public_web_legal_selected_listings',
      iaPatterns: [],
      ctaPatterns: [],
      trustPatterns: [],
      toneLexicon: [],
      doRules: [],
      dontRules: [],
      createdAt: new Date().toISOString(),
      version: '2026.02'
    });

    expect(result.success).toBe(false);
  });

  it('accepts canonical extracted field envelope', () => {
    const result = ExtractedUnknownFieldSchema.safeParse({
      value: null,
      sourceUrl: 'https://example.com/about',
      method: 'dom',
      confidence: 0.49,
      extractedAt: new Date().toISOString(),
      todo: true
    });

    expect(result.success).toBe(true);
  });

  it('accepts component contract payload from plan contract shape', () => {
    const result = ComponentContractSchema.safeParse({
      componentId: 'hero',
      version: '1.0.0',
      propsSchema: {
        type: 'object'
      },
      requiredFields: ['h1', 'subhead'],
      maxLengths: {
        h1: 80
      },
      fallbackPolicy: {
        media: 'render_without_media_if_missing'
      },
      allowedVariants: ['split-media', 'centered-copy'],
      seoA11yRequirements: ['must_render_single_h1']
    });

    expect(result.success).toBe(true);
  });

  it('accepts copy candidate for high-impact variants', () => {
    const result = CopyCandidateSchema.safeParse({
      slotId: 'hero.h1',
      locale: 'cs-CZ',
      variantKey: 'A',
      text: 'Precizni development se zkusenym tymem.',
      withinLimits: true,
      recommended: true,
      generatedAt: new Date().toISOString()
    });

    expect(result.success).toBe(true);
  });

  it('validates review transition request event enum', () => {
    const valid = ReviewTransitionRequestSchema.safeParse({
      draftId: 'draft-1',
      fromState: 'proposal_selected',
      toState: 'quality_checking',
      event: 'QUALITY_STARTED'
    });

    const invalid = ReviewTransitionRequestSchema.safeParse({
      draftId: 'draft-1',
      fromState: 'proposal_selected',
      toState: 'quality_checking',
      event: 'UNKNOWN_EVENT'
    });

    expect(valid.success).toBe(true);
    expect(invalid.success).toBe(false);
  });

  it('enforces vertical research build request minimum competitor count', () => {
    const invalid = VerticalResearchBuildRequestSchema.safeParse({
      targetCompetitorCount: 10,
      sources: ['public_web'],
      sourceDomains: []
    });

    const valid = VerticalResearchBuildRequestSchema.safeParse({
      targetCompetitorCount: 15,
      sources: ['public_web', 'legal_pages', 'selected_listings'],
      sourceDomains: ['example-1.com']
    });

    expect(invalid.success).toBe(false);
    expect(valid.success).toBe(true);
  });
});
