# ADR-006: Component Contracts and Bounded Copy

- Status: Accepted
- Date: 2026-02-27
- Owners: Architecture + Content Systems
- Supersedes: none
- Related: ADR-002, ADR-003

## Context
Generated websites must be implementation-ready and stable across variants. Unbounded components and unbounded copy generation create layout regressions, inconsistent UX, and poor publish reliability.

## Decision
1. Every reusable component must have a full `ComponentContract`.
2. Contract fields are mandatory:
   1. `propsSchema`
   2. `requiredFields`
   3. `maxLengths`
   4. `fallbackPolicy`
   5. `allowedVariants`
   6. `seoA11yRequirements`
3. Copy generation uses bounded slot contracts (`CopySlotDefinition`).
4. Three-variant copy generation applies only to high-impact slots.
5. Non-high-impact slots use single-pass constrained generation.
6. Slot `maxChars` and `maxLines` are hard limits and quality-relevant.
7. Publish is blocked if required slots violate hard limits or are missing in required locales.

## High-Impact Copy Policy
High-impact slots include, at minimum:
1. `hero.h1`
2. `hero.subhead`
3. `hero.primaryCta`
4. `value_props.intro`
5. `about.intro`
6. `contact.primaryCta`

Generation rule:
1. produce `A/B/C` candidates for high-impact slots.
2. mark one candidate as `recommended`.
3. persist alternatives for draft review.

## Consequences
Positive:
1. Build outputs stay within predictable layout boundaries.
2. Content review effort focuses on high-impact messaging.
3. Implementation quality improves due to explicit component contracts.

Trade-offs:
1. Contract authoring overhead per component.
2. Stricter validation can increase publish-blocked drafts until content is corrected.

## Rejected Alternatives
1. Generate three variants for every slot.
2. Allow free-form copy lengths and rely on manual fixes.
3. Define only informal component props without machine-readable schema.

## Implementation Notes
1. Component contract version must be attached to proposals and snapshots.
2. Quality runner must enforce COPY/LAYOUT/MEDIA/LEGAL rule families.
3. CMS editing UI must validate slot limits in real time.
