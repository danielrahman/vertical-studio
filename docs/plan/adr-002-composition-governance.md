# ADR-002: Composition and Editing Governance

Status: accepted

## Context
The product must combine extraction-assisted generation with human-controlled final composition and ongoing owner edits.

## Decision
1. Composition engine is deterministic.
2. Engine emits exactly 3 curated variants (`A/B/C`).
3. Internal admin is the only role that can select final variant and publish.
4. Owner/editor can edit structured content in guardrails.
5. Section reorder is constrained.
6. No automatic recomposition after publish.

## Consequences
Positive:
1. Predictable generation and reproducibility.
2. Strong editorial control before go-live.
3. Lower risk of layout drift post publish.

Negative:
1. Internal team remains in critical path for final selection.
2. Less flexibility than free-form page builder.

