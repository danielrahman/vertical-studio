# Vertical Studio v3 - Vertical Research Standard

## 1. Objective
Define a repeatable method to build a reusable `VerticalStandard` from market analysis without copying competitor websites.

## 2. Required Input Baseline
1. Vertical key (example: `boutique-developers`).
2. Minimum competitor sample: `15` domains.
3. Source classes:
   1. public website pages,
   2. legal pages,
   3. selected listings/directories.

Research run is invalid if competitor count is below 15.

## 3. Allowed and Disallowed Data Use
Allowed:
1. IA patterns.
2. CTA patterns.
3. Trust signal patterns.
4. Tone and messaging pattern classes.

Disallowed:
1. direct copy or phrase cloning.
2. visual imitation of a specific competitor.
3. one-to-one section replication from any single source.

## 4. Research Pipeline
1. Collect candidate competitors for selected vertical.
2. Validate source list and remove non-relevant domains.
3. Extract pattern observations from approved source classes.
4. Normalize observations into `CompetitorPattern` records.
5. Build consolidated `VerticalStandard` with do/don't rules.
6. Publish versioned standard and evidence artifacts.

## 5. Pattern Taxonomy

### 5.1 IA Patterns
Examples:
1. common section order,
2. common navigation labels,
3. common landing vs detail page split.

### 5.2 CTA Patterns
Examples:
1. CTA placement density,
2. CTA language style,
3. lead form triggers.

### 5.3 Trust Patterns
Examples:
1. social proof placement,
2. case study structure,
3. legal and compliance blocks.

### 5.4 Tone Patterns
Examples:
1. tone descriptors,
2. lexical style classes,
3. claim specificity level.

## 6. Output Contracts

### 6.1 `VerticalStandard`
Must contain:
1. `verticalKey`
2. `version`
3. `competitorCount`
4. `sourcePolicy`
5. pattern groups (`iaPatterns`, `ctaPatterns`, `trustPatterns`, `toneLexicon`)
6. `doRules`
7. `dontRules`
8. `createdAt`

### 6.2 `CompetitorPattern`
Must contain:
1. `verticalStandardId`
2. `sourceDomain`
3. `patternType`
4. normalized `patternJson`

### 6.3 Artifact Outputs
Per research run:
1. `artifacts/vertical/<verticalKey>/<version>/patterns.json`
2. `artifacts/vertical/<verticalKey>/<version>/summary.md`
3. `artifacts/vertical/<verticalKey>/<version>/sources.csv`

## 7. Quality Checklist (Research Output)
- [ ] Competitor count is at least 15.
- [ ] Sources are from allowed classes only.
- [ ] Pattern extraction scope is IA/CTA/trust/tone only.
- [ ] No direct copy snippets are stored as reusable output.
- [ ] Do/don't rules are explicit and actionable.
- [ ] Standard version is recorded and immutable.

## 8. Do and Don't Rules
Do:
1. abstract patterns into reusable guidance.
2. preserve source traceability at pattern level.
3. prioritize brand-fidelity compatibility with selected vertical.

Don't:
1. copy competitor text into final website copy.
2. force composition from one competitor template.
3. bypass internal admin review for standard publication.

## 9. Reuse Policy
1. A vertical standard version can be reused across multiple companies in same vertical.
2. Company-specific mapping must still come from each company extraction and manual overrides.
3. Reuse does not permit cross-company copy reuse.

## 10. Optional Corpus Module (v1)
1. Full corpus indexing is optional in v1.
2. Research pipeline must run without corpus dependency.
3. Corpus data, when present, is assistive and non-blocking.

## 11. KPI Metrics
1. Standard reuse rate within a vertical.
2. Internal admin acceptance rate of proposed standards.
3. Review corrections required per standard version.
4. Publish readiness improvement between first and subsequent company mappings.
