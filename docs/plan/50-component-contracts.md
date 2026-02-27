# Vertical Studio v3 - Component Contracts

## 1. Purpose
This document defines the canonical contract model for reusable website components. Contracts are machine-readable and required for deterministic composition, bounded copy, and publish validation.

## 2. Canonical Contract Template

```ts
type ComponentContract = {
  componentId: string;
  version: string;
  description: string;
  propsSchema: object;
  requiredFields: string[];
  maxLengths: Record<string, number>;
  fallbackPolicy: Record<string, string>;
  allowedVariants: string[];
  seoA11yRequirements: string[];
};
```

Template requirements:
1. `propsSchema` must be valid JSON schema (Zod-export compatible).
2. `requiredFields` must cover minimum publish-safe content.
3. `maxLengths` must include all text-bearing props.
4. `fallbackPolicy` must define behavior for missing optional fields.
5. `allowedVariants` must be finite and versioned.
6. `seoA11yRequirements` must be testable by quality runner.

## 3. Shared Constraints
1. Locale-ready text props must support `cs-CZ` and `en-US`.
2. Heading semantics must preserve hierarchical order.
3. Media props require alt text when image is meaningful.
4. Invalid props or length overflow block publish (`P0`).

## 4. Component Examples

## 4.1 `hero`
Purpose:
1. Primary above-the-fold proposition with first CTA.

Example contract:
```json
{
  "componentId": "hero",
  "version": "1.0.0",
  "description": "Primary intro section",
  "propsSchema": {
    "type": "object",
    "required": ["h1", "subhead", "primaryCtaLabel", "primaryCtaHref"],
    "properties": {
      "h1": { "type": "string" },
      "subhead": { "type": "string" },
      "primaryCtaLabel": { "type": "string" },
      "primaryCtaHref": { "type": "string" },
      "secondaryCtaLabel": { "type": "string" },
      "secondaryCtaHref": { "type": "string" },
      "media": {
        "type": "object",
        "properties": {
          "imageUrl": { "type": "string" },
          "alt": { "type": "string" }
        }
      }
    }
  },
  "requiredFields": ["h1", "subhead", "primaryCtaLabel", "primaryCtaHref"],
  "maxLengths": {
    "h1": 80,
    "subhead": 220,
    "primaryCtaLabel": 28,
    "secondaryCtaLabel": 28,
    "media.alt": 125
  },
  "fallbackPolicy": {
    "secondaryCtaLabel": "omit_if_missing",
    "secondaryCtaHref": "omit_if_missing",
    "media": "render_without_media_if_missing"
  },
  "allowedVariants": ["split-media", "centered-copy", "minimal"],
  "seoA11yRequirements": [
    "must_render_single_h1",
    "cta_links_must_be_valid_urls",
    "meaningful_media_requires_alt"
  ]
}
```

## 4.2 `faq`
Purpose:
1. Structured question and answer trust section.

Key constraints:
1. minimum 3 items, maximum 12 items.
2. each question <= 120 chars.
3. each answer <= 400 chars.

Allowed variants:
1. `accordion`
2. `two-column`

SEO/a11y requirements:
1. interactive items keyboard accessible.
2. ARIA-expanded states exposed.

## 4.3 `timeline`
Purpose:
1. Process milestones and delivery sequencing.

Key constraints:
1. minimum 3 steps, maximum 8 steps.
2. step title <= 80 chars.
3. step body <= 220 chars.

Allowed variants:
1. `vertical-line`
2. `horizontal-stepper`

Fallback policy:
1. if less than 3 steps, component excluded from composition.

## 4.4 `cards-3up`
Purpose:
1. Three side-by-side value proposition cards.

Key constraints:
1. exactly 3 cards.
2. card title <= 60 chars.
3. card body <= 180 chars.
4. image alt required when card image is present.

Allowed variants:
1. `icon-top`
2. `image-top`
3. `minimal`

## 4.5 `pricing`
Purpose:
1. Pricing/plan communication with disclaimers.

Key constraints:
1. minimum 1 plan, maximum 4 plans.
2. plan name <= 40 chars.
3. plan description <= 160 chars.
4. legal disclaimer <= 280 chars.

SEO/a11y requirements:
1. price values must include currency symbol or code.
2. disclaimer block is mandatory when custom pricing text exists.

## 4.6 `map-branch`
Purpose:
1. Location and branch trust signal.

Key constraints:
1. branch name <= 80 chars.
2. address <= 180 chars.
3. map embed URL must match allowed provider list.

Allowed variants:
1. `single-location`
2. `multi-branch-list`

Fallback policy:
1. if map URL missing, render address-only branch card.

## 4.7 `header`
Purpose:
1. Primary navigation and brand anchor.

Key constraints:
1. 3-8 nav links.
2. nav label <= 28 chars.
3. primary CTA label <= 24 chars.

SEO/a11y requirements:
1. nav landmarks required.
2. mobile menu keyboard and screen-reader support mandatory.

## 4.8 `footer`
Purpose:
1. legal trust and closing navigation.

Key constraints:
1. legal links required: privacy, cookies, terms.
2. contact line <= 140 chars.
3. social labels <= 24 chars.

Fallback policy:
1. if social links missing, render legal-only footer.

## 5. Versioning Policy
1. Contract versioning follows semantic versioning.
2. `major`: breaking prop or constraint changes.
3. `minor`: backward-compatible additions.
4. `patch`: documentation/metadata fixes.

## 6. Validation Lifecycle
1. Compose stage validates component eligibility against required fields.
2. Copy stage validates slot limits against component `maxLengths`.
3. Publish stage re-validates schema + SEO/a11y requirements.
4. Any P0 contract violation blocks publish.

## 7. Implementation Mapping
1. `packages/component-catalog`: reusable component implementations.
2. `packages/schema`: type-safe contract definitions.
3. `packages/quality`: contract compliance checks.
4. `apps/cms`: guardrail-aware component editing UI.
