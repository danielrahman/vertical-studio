# Vertical Studio v3 - Data Model

## 1. Principles
1. Immutable publish versions.
2. Tenant-scoped RBAC.
3. Evidence-first extraction model.
4. No plaintext secret persistence.
5. Deterministic proposal reproducibility.

## 2. Canonical Contracts
## 2.1 ExtractedField Contract
```ts
type ExtractedField<T> = {
  value: T | null;
  sourceUrl: string | null;
  method: "dom" | "ocr" | "inference" | "manual";
  confidence: number;
  extractedAt: string;
  todo: boolean;
};
```

Rule:
1. `todo=true` must be used when confidence is below threshold.
2. Low confidence never becomes forced factual output.

## 2.2 VerticalStandard Contract
```ts
type VerticalStandard = {
  id: string;
  verticalKey: string;
  competitorCount: number; // minimum 15
  sourcePolicy: "public_web_legal_selected_listings";
  iaPatterns: string[];
  ctaPatterns: string[];
  trustPatterns: string[];
  toneLexicon: string[];
  doRules: string[];
  dontRules: string[];
  createdAt: string;
  version: string;
};
```

## 2.3 ComponentContract Contract
```ts
type ComponentContract = {
  componentId: string;
  version: string;
  propsSchema: object;
  requiredFields: string[];
  maxLengths: Record<string, number>;
  fallbackPolicy: Record<string, string>;
  allowedVariants: string[];
  seoA11yRequirements: string[];
};
```

## 2.4 Copy Slot Contracts
```ts
type CopySlotDefinition = {
  slotId: string;
  sectionType: string;
  highImpact: boolean;
  maxChars: number;
  maxLines: number;
  localeRequired: ("cs-CZ" | "en-US")[];
};

type CopyCandidate = {
  slotId: string;
  locale: "cs-CZ" | "en-US";
  variantKey: "A" | "B" | "C" | "SINGLE";
  text: string;
  withinLimits: boolean;
  recommended: boolean;
};
```

## 3. Core Entities
## 3.1 Platform and Site Entities
1. `tenants`
2. `sites`
3. `memberships`
4. `site_drafts`
5. `composition_proposals`
6. `site_versions`
7. `quality_reports`
8. `security_reports`
9. `secret_refs`
10. `audit_events`

## 3.2 Vertical Intelligence Entities
1. `vertical_profiles`
   1. selected vertical metadata
2. `vertical_standards`
   1. reusable standard output
3. `competitor_patterns`
   1. normalized IA/CTA/trust/tone pattern records
4. `field_evidence`
   1. source-level evidence records for extracted fields

## 3.3 Component and Copy Entities
1. `component_contracts`
   1. versioned component schemas and constraints
2. `copy_slots`
   1. bounded slot definitions
3. `copy_candidates`
   1. generated candidate text variants
4. `copy_recommendations`
   1. selected candidate per slot and locale

## 4. Required Fields by Entity (Delta)
## 4.1 vertical_profiles
1. `id`
2. `vertical_key`
3. `status`
4. `target_competitor_count`
5. `created_at`

## 4.2 vertical_standards
1. `id`
2. `vertical_profile_id`
3. `version`
4. `summary_json`
5. `standard_json`
6. `created_at`

## 4.3 competitor_patterns
1. `id`
2. `vertical_standard_id`
3. `source_domain`
4. `pattern_type` (`ia|cta|trust|tone`)
5. `pattern_json`
6. `created_at`

## 4.4 field_evidence
1. `id`
2. `site_draft_id`
3. `field_path`
4. `source_url`
5. `method`
6. `confidence`
7. `extracted_at`
8. `raw_excerpt`

## 4.5 component_contracts
1. `id`
2. `component_id`
3. `version`
4. `schema_json`
5. `constraints_json`
6. `fallback_json`
7. `seo_a11y_json`

## 4.6 copy_slots
1. `id`
2. `site_draft_id`
3. `slot_id`
4. `section_type`
5. `high_impact`
6. `max_chars`
7. `max_lines`

## 4.7 copy_candidates
1. `id`
2. `copy_slot_id`
3. `locale`
4. `variant_key`
5. `text`
6. `within_limits`

## 4.8 copy_recommendations
1. `id`
2. `copy_slot_id`
3. `locale`
4. `selected_candidate_id`
5. `selected_by`
6. `selected_at`

## 5. Review and Approval Fields
`site_drafts` must include:
1. `review_state`
2. `manual_overrides_json`
3. `guardrail_violations_json`
4. `low_confidence`

## 6. Localization Contract
Required locales:
1. `cs-CZ`
2. `en-US`

Publish requirement:
1. all required slots for both locales must be populated and valid.

## 7. Optional Corpus Module (v1 non-critical)
1. Optional entity `extraction_corpus_index`.
2. Not required for publish path.
3. Must not block proposal/publish when unavailable.

## 8. Indexing Requirements (Extended)
1. `vertical_standards(vertical_profile_id, version)`
2. `competitor_patterns(vertical_standard_id, pattern_type)`
3. `field_evidence(site_draft_id, field_path)`
4. `component_contracts(component_id, version)`
5. `copy_slots(site_draft_id, section_type, slot_id)`
6. `copy_candidates(copy_slot_id, locale, variant_key)`
7. `copy_recommendations(copy_slot_id, locale)`
