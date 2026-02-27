# Core SEO Rules (v3)

## Contract
Each rule must include:
1. `id`
2. `priority` (`P0|P1|P2`)
3. `mode` (`auto|manual`)
4. `pass_criteria`
5. `fail_criteria`
6. `evidence_output`
7. `owner_default`

## Rules

### SEO-P0-01
- `id`: `SEO-P0-01`
- `priority`: `P0`
- `mode`: `auto`
- `pass_criteria`: public pages have valid canonical and no canonical conflicts.
- `fail_criteria`: missing canonical, multiple canonical, cross-domain canonical conflict.
- `evidence_output`: `artifacts/seo/canonical-check.txt`
- `owner_default`: `dev`

### SEO-P0-02
- `id`: `SEO-P0-02`
- `priority`: `P0`
- `mode`: `auto`
- `pass_criteria`: robots policy and sitemap endpoint are valid for platform domain.
- `fail_criteria`: invalid robots/sitemap contract.
- `evidence_output`: `artifacts/seo/robots-sitemap-audit.txt`
- `owner_default`: `dev`

### SEO-P0-03
- `id`: `SEO-P0-03`
- `priority`: `P0`
- `mode`: `auto`
- `pass_criteria`: required locale pages (CZ+EN) have title + meta description.
- `fail_criteria`: missing metadata in either locale for required routes.
- `evidence_output`: `artifacts/seo/metadata-locale-audit.csv`
- `owner_default`: `content`

### SEO-P0-04
- `id`: `SEO-P0-04`
- `priority`: `P0`
- `mode`: `auto`
- `pass_criteria`: technical SEO state passes publish validator after owner edits.
- `fail_criteria`: owner-edited SEO creates invalid technical state.
- `evidence_output`: `artifacts/seo/publish-validator-seo.json`
- `owner_default`: `dev`

### SEO-P0-05
- `id`: `SEO-P0-05`
- `priority`: `P0`
- `mode`: `auto`
- `pass_criteria`: technical claims on indexable pages are evidence-backed by approved source references.
- `fail_criteria`: technical claim exists without linked evidence record (`field_evidence` or legal source reference).
- `evidence_output`: `artifacts/seo/technical-claim-evidence-map.json`
- `owner_default`: `content`

### SEO-P1-01
- `id`: `SEO-P1-01`
- `priority`: `P1`
- `mode`: `auto`
- `pass_criteria`: structured data is syntactically valid on key pages.
- `fail_criteria`: invalid json-ld payload or missing required schema blocks.
- `evidence_output`: `artifacts/seo/structured-data-validation.md`
- `owner_default`: `dev`

### SEO-P1-02
- `id`: `SEO-P1-02`
- `priority`: `P1`
- `mode`: `auto`
- `pass_criteria`: no redirect chain over 1 hop on key nav links.
- `fail_criteria`: redirect chain > 1 or loop.
- `evidence_output`: `artifacts/seo/redirect-chains.txt`
- `owner_default`: `dev`

### SEO-P1-03
- `id`: `SEO-P1-03`
- `priority`: `P1`
- `mode`: `auto`
- `pass_criteria`: evidence-backed technical claims include source freshness metadata.
- `fail_criteria`: technical claim evidence exists but source timestamp missing or stale under configured policy.
- `evidence_output`: `artifacts/seo/technical-claim-freshness.csv`
- `owner_default`: `content`

### SEO-P2-01
- `id`: `SEO-P2-01`
- `priority`: `P2`
- `mode`: `manual`
- `pass_criteria`: monthly query review and prioritized follow-up.
- `fail_criteria`: missing monthly review output.
- `evidence_output`: `artifacts/seo/monthly-query-review.md`
- `owner_default`: `ops`

## Blocking Behavior
1. Any failed `SEO-P0-*` rule blocks publish.
2. `SEO-P1-*` and `SEO-P2-*` failures require an action plan but do not block publish by default.
