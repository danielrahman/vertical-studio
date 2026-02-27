# ADR-007: Vertical Intelligence Pattern Policy

- Status: Accepted
- Date: 2026-02-27
- Owners: Architecture + Product
- Supersedes: none
- Related: ADR-002, ADR-005

## Context
Vertical-specific relevance requires market understanding. At the same time, direct copying from competitors introduces legal, ethical, and quality risks.

## Decision
1. Vertical intelligence is mandatory before composition.
2. Minimum competitor sample per vertical research run is `15`.
3. Allowed competitor extraction scope is pattern-only:
   1. Information architecture (IA)
   2. CTA models
   3. Trust signals
   4. Tone patterns
4. Disallowed competitor usage:
   1. direct copy reuse
   2. component-by-component mimicry
   3. visual cloning
5. Vertical standards must be versioned and reusable across companies in the same vertical.
6. Source policy is restricted to:
   1. public web pages
   2. legal pages
   3. selected listings

## Pattern-Level Output Requirement
Research output must include:
1. normalized pattern records (`CompetitorPattern[]`)
2. reusable `VerticalStandard`
3. do/don't rules for composition and copy routing
4. evidence references for each pattern group

## Consequences
Positive:
1. Improves consistency and vertical fit across generated sites.
2. Reduces plagiarism risk.
3. Enables reusable and auditable vertical standards.

Trade-offs:
1. Added upfront research cost per vertical.
2. Requires explicit pattern normalization logic.

## Rejected Alternatives
1. Skip vertical research and rely on generic templates.
2. Scrape competitor copy directly into draft fields.
3. Use fewer than 15 competitors as default baseline.

## Implementation Notes
1. Vertical research must run as a dedicated orchestration step.
2. Compose API requires `verticalStandardVersion` input.
3. Internal admin may exclude specific competitor patterns via manual overrides.
