# Project Context Template (v3)

Use this file to define release-specific context for quality checks.

## Identity
- `project_name`: `Vertical Studio v3`
- `project_code`: `vertical-studio-v3`
- `environment`: `preview`

## Domain
- `domain_primary`: `<set-before-release>`
- `preferred_canonical_domain`: `<set-before-release>`

## URL Sets
- `public_indexable_urls`:
  - `/`
  - `/privacy`
  - `/cookies`
  - `/terms`
- `private_nonindex_urls`:
  - `/app`
  - `/ops`
  - `/api`

## Locale
- `required_locales`:
  - `cs-CZ`
  - `en-US`

## Composition and Publish Guardrails
- `compose_variants_required`: `3`
- `recomposition_after_publish`: `disabled`
- `publish_gate_quality`: `block_on_p0`
- `publish_gate_security`: `block_on_critical_high`

## Copy and Slot Context
- `high_impact_slots`:
  - `hero.h1`
  - `hero.subhead`
  - `hero.primary_cta_label`
  - `value_props.intro`
  - `about.intro`
  - `contact.primary_cta_label`

- `slot_char_limits`:
  - `hero.h1`: `80`
  - `hero.subhead`: `220`
  - `hero.primary_cta_label`: `28`
  - `value_props.intro`: `180`
  - `about.intro`: `260`
  - `contact.primary_cta_label`: `28`

## Manual Override Defaults
- `manual_override_defaults`:
  - `tone`: `[]`
  - `keywords`: `[]`
  - `required_sections`: `[]`
  - `excluded_sections`: `[]`
  - `pinned_sections`: `[]`
  - `required_components`: `[]`
  - `excluded_competitor_patterns`: `[]`

## Competitor Pattern Policy
- `competitor_pattern_exclusions`:
  - `direct_copy_phrase`
  - `single_competitor_layout_clone`
  - `aggressive_discount_banner`

## Evidence and Confidence
- `low_confidence_threshold`: `0.50`
- `review_required_when_any_todo`: `true`
- `evidence_required_for_technical_claims`: `true`
