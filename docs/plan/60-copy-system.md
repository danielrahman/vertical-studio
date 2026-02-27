# Vertical Studio v3 - Copy System

## 1. Objective
Define a deterministic, bounded copy pipeline that produces implementation-safe content and supports human selection without unbounded generation.

## 2. Core Policies
1. Copy generation is slot-based, not page-level free-form.
2. Three variants are generated only for high-impact slots.
3. Non-high-impact slots use single-pass bounded generation.
4. All slots enforce hard `maxChars` and `maxLines` constraints.
5. Publish candidate must be complete for `cs-CZ` and `en-US` required slots.

## 3. Slot Taxonomy
Slot groups:
1. `hero`
2. `value_props`
3. `about`
4. `process`
5. `testimonials`
6. `faq`
7. `cta`
8. `contact`
9. `legal`

## 4. High-Impact Slot List (3x Policy)

| slot_id | section | max_chars | max_lines | locales |
|---|---|---:|---:|---|
| `hero.h1` | hero | 80 | 2 | cs-CZ,en-US |
| `hero.subhead` | hero | 220 | 4 | cs-CZ,en-US |
| `hero.primary_cta_label` | hero | 28 | 1 | cs-CZ,en-US |
| `value_props.intro` | value_props | 180 | 3 | cs-CZ,en-US |
| `about.intro` | about | 260 | 4 | cs-CZ,en-US |
| `contact.primary_cta_label` | contact | 28 | 1 | cs-CZ,en-US |

Policy:
1. Exactly three candidates (`A/B/C`) per high-impact slot and locale.
2. One candidate marked `recommended=true`.
3. Remaining candidates preserved in draft for manual switch.

## 5. Non-High-Impact Slot Policy
1. Exactly one candidate with `variantKey=SINGLE`.
2. Same hard limits and locale requirements apply.
3. If required slot cannot be generated within limits, mark as TODO and fail completeness check.

## 6. Data Contracts

### 6.1 `CopySlotDefinition`
```ts
type CopySlotDefinition = {
  slotId: string;
  sectionType: string;
  highImpact: boolean;
  maxChars: number;
  maxLines: number;
  localeRequired: ("cs-CZ" | "en-US")[];
  required: boolean;
};
```

### 6.2 `CopyCandidate`
```ts
type CopyCandidate = {
  slotId: string;
  locale: "cs-CZ" | "en-US";
  variantKey: "A" | "B" | "C" | "SINGLE";
  text: string;
  withinLimits: boolean;
  recommended: boolean;
  generatedAt: string;
};
```

### 6.3 `CopyRecommendation`
```ts
type CopyRecommendation = {
  slotId: string;
  locale: "cs-CZ" | "en-US";
  selectedCandidateId: string;
  selectedBy: "system" | "internal_admin" | "owner";
  selectedAt: string;
};
```

## 7. Generation and Selection Flow
1. Build slot set from selected proposal and component contracts.
2. Generate candidates under slot limits.
3. Run hard limit validator.
4. Mark recommended candidate for high-impact slots.
5. Internal admin reviews and may override recommendations.
6. Store final `CopyRecommendation` per required slot and locale.
7. Quality gate verifies completeness and constraints.

## 8. LLM Prompt Contracts

### 8.1 Copy Generation Prompt Input
```json
{
  "siteId": "uuid",
  "draftId": "uuid",
  "verticalStandardVersion": "2026.02",
  "tonePolicy": ["credible", "calm", "specific"],
  "disallowedPatterns": ["competitor_phrase_exact_match"],
  "slots": [
    {
      "slotId": "hero.h1",
      "highImpact": true,
      "maxChars": 80,
      "maxLines": 2,
      "required": true,
      "locale": "cs-CZ"
    }
  ],
  "sourceEvidence": {
    "company": [
      {
        "field": "service_summary",
        "value": "...",
        "sourceUrl": "https://example.com/about",
        "confidence": 0.92
      }
    ]
  }
}
```

### 8.2 Copy Generation Prompt Output
```json
{
  "slotId": "hero.h1",
  "locale": "cs-CZ",
  "candidates": [
    { "variantKey": "A", "text": "...", "withinLimits": true },
    { "variantKey": "B", "text": "...", "withinLimits": true },
    { "variantKey": "C", "text": "...", "withinLimits": true }
  ],
  "recommendedVariantKey": "B"
}
```

Validation rules:
1. Output must match required candidate count for slot type.
2. `withinLimits` must be computed by platform validator, not model claim.
3. Any over-limit output is rejected and regenerated.

## 9. Manual Override Integration
Overrides affecting copy behavior:
1. `tone`
2. `keywords`
3. `requiredSections`
4. `excludedSections`
5. `pinnedSections`
6. `requiredComponents`
7. `excludedCompetitorPatterns`

All overrides must be:
1. versioned per draft,
2. traceable in audit log,
3. included in prompt payload.

## 10. Quality Gate Mapping
Blocking rules:
1. `COPY-P0`: required slot missing for any required locale.
2. `COPY-P0`: selected candidate exceeds hard slot limits.
3. `LAYOUT-P0`: slot copy causes configured overflow conditions.

Non-blocking but required action plan:
1. style consistency drift,
2. tone inconsistency warnings.

## 11. KPI Metrics
1. High-impact slot acceptance rate on first review.
2. Regeneration retries due to limit overflow.
3. Locale completeness at publish attempt.
4. Manual override frequency by slot family.
