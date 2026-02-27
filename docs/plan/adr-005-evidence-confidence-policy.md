# ADR-005: Evidence and Confidence Policy

- Status: Accepted
- Date: 2026-02-27
- Owners: Architecture + Quality
- Supersedes: none
- Related: ADR-002, ADR-003

## Context
Extraction quality is variable due to heterogeneous source websites (rendering, missing structure, scanned content). The platform must avoid invented facts while still enabling draft bootstrap.

## Decision
1. All extraction fields use `ExtractedField<T>` with mandatory evidence metadata.
2. Low-confidence extraction must not be treated as fact.
3. Low-confidence behavior is standardized as:
   1. `value = null` or empty value
   2. `todo = true`
   3. source metadata retained for reviewer traceability
4. Compose/copy pipeline may proceed with TODO fields, but publish requires review workflow completion.
5. No-invention is enforced operationally through evidence model + review workflow (not by sentence-level hard gate in v1).

## Confidence Bands
1. `high`: `>= 0.80`
2. `medium`: `>= 0.50 && < 0.80`
3. `low`: `< 0.50`

Policy:
1. `low` required field => TODO mandatory.
2. `medium` may be accepted only with retained evidence and explicit review.
3. `high` can auto-fill draft fields.

## Source Model
Allowed source classes for extraction:
1. company public website pages
2. company legal pages
3. selected directory/listing pages (if configured)

Each extracted field must keep:
1. `sourceUrl`
2. `method`
3. `confidence`
4. `extractedAt`

## Consequences
Positive:
1. Reduces factual hallucination risk.
2. Improves review traceability.
3. Preserves deterministic handling of uncertain data.

Trade-offs:
1. More manual review for incomplete extraction.
2. Lower first-pass completeness for noisy websites.

## Rejected Alternatives
1. Auto-infer missing facts with no evidence trail.
2. Store uncertain values as final publish content.
3. Block compose stage on any low-confidence field.

## Implementation Notes
1. `site_drafts.low_confidence` indicates review-required drafts.
2. Quality rules must include TODO completeness checks for required slots.
3. API must expose evidence metadata for internal review UI.
