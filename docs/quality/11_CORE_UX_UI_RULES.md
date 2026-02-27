# Core UX/UI Rules (v3)

## Contract
Each rule must include:
1. `id`
2. `priority` (`P0|P1|P2`)
3. `mode` (`auto|manual`)
4. `pass_criteria`
5. `fail_criteria`
6. `evidence_output`
7. `owner_default`

## Rule Family: UX

### UX-P0-01
- `id`: `UX-P0-01`
- `priority`: `P0`
- `mode`: `auto`
- `pass_criteria`: hero-first and constrained contact tail rules are respected.
- `fail_criteria`: section-order guardrail violated.
- `evidence_output`: `artifacts/ux/guardrail-order-check.json`
- `owner_default`: `dev`

### UX-P0-02
- `id`: `UX-P0-02`
- `priority`: `P0`
- `mode`: `auto`
- `pass_criteria`: required form fields enforce validation and prevent invalid submit.
- `fail_criteria`: invalid submit path remains possible.
- `evidence_output`: `artifacts/ux/form-validation-tests.xml`
- `owner_default`: `dev`

### UX-P0-03
- `id`: `UX-P0-03`
- `priority`: `P0`
- `mode`: `auto`
- `pass_criteria`: publish candidate has mandatory locale content for required sections.
- `fail_criteria`: missing mandatory locale content.
- `evidence_output`: `artifacts/ux/locale-completeness.json`
- `owner_default`: `content`

### UX-P0-04
- `id`: `UX-P0-04`
- `priority`: `P0`
- `mode`: `auto`
- `pass_criteria`: owner editable fields remain within component schema constraints.
- `fail_criteria`: invalid structure escapes CMS guardrails.
- `evidence_output`: `artifacts/ux/cms-guardrail-validation.json`
- `owner_default`: `dev`

### UX-P1-01
- `id`: `UX-P1-01`
- `priority`: `P1`
- `mode`: `auto`
- `pass_criteria`: keyboard navigation works on key templates.
- `fail_criteria`: keyboard trap or unreachable controls.
- `evidence_output`: `artifacts/ux/keyboard-smoke.txt`
- `owner_default`: `dev`

### UX-P1-02
- `id`: `UX-P1-02`
- `priority`: `P1`
- `mode`: `auto`
- `pass_criteria`: contrast meets AA baseline on primary components.
- `fail_criteria`: contrast regression below baseline.
- `evidence_output`: `artifacts/ux/contrast-audit.json`
- `owner_default`: `dev`

## Rule Family: COPY

### COPY-P0-01
- `id`: `COPY-P0-01`
- `priority`: `P0`
- `mode`: `auto`
- `pass_criteria`: all required copy slots are filled for required locales.
- `fail_criteria`: any required slot missing in `cs-CZ` or `en-US`.
- `evidence_output`: `artifacts/ux/copy-required-slot-completeness.json`
- `owner_default`: `content`

### COPY-P0-02
- `id`: `COPY-P0-02`
- `priority`: `P0`
- `mode`: `auto`
- `pass_criteria`: high-impact slots contain exactly 3 candidates (`A/B/C`) before selection.
- `fail_criteria`: missing or extra candidate variants for high-impact slots.
- `evidence_output`: `artifacts/ux/copy-high-impact-candidate-counts.json`
- `owner_default`: `content`

### COPY-P0-03
- `id`: `COPY-P0-03`
- `priority`: `P0`
- `mode`: `auto`
- `pass_criteria`: selected copy candidates satisfy hard slot limits.
- `fail_criteria`: selected slot exceeds `maxChars` or `maxLines`.
- `evidence_output`: `artifacts/ux/copy-slot-limit-validation.csv`
- `owner_default`: `content`

## Rule Family: LAYOUT

### LAYOUT-P0-01
- `id`: `LAYOUT-P0-01`
- `priority`: `P0`
- `mode`: `auto`
- `pass_criteria`: selected copy does not cause constrained component overflow on supported breakpoints.
- `fail_criteria`: text overflow or clipping in constrained components.
- `evidence_output`: `artifacts/ux/layout-overflow-check.json`
- `owner_default`: `dev`

### LAYOUT-P0-02
- `id`: `LAYOUT-P0-02`
- `priority`: `P0`
- `mode`: `auto`
- `pass_criteria`: required/pinned sections and required components are present after composition.
- `fail_criteria`: missing pinned section, missing required component, or excluded section present.
- `evidence_output`: `artifacts/ux/layout-override-compliance.json`
- `owner_default`: `dev`

## Rule Family: MEDIA

### MEDIA-P0-01
- `id`: `MEDIA-P0-01`
- `priority`: `P0`
- `mode`: `auto`
- `pass_criteria`: all required informative media include non-empty alt text.
- `fail_criteria`: missing alt text on required informative media.
- `evidence_output`: `artifacts/ux/media-alt-audit.csv`
- `owner_default`: `content`

### MEDIA-P0-02
- `id`: `MEDIA-P0-02`
- `priority`: `P0`
- `mode`: `auto`
- `pass_criteria`: media URLs for required assets resolve and are renderable.
- `fail_criteria`: broken required media references.
- `evidence_output`: `artifacts/ux/media-link-check.txt`
- `owner_default`: `dev`

## Rule Family: LEGAL

### LEGAL-P0-01
- `id`: `LEGAL-P0-01`
- `priority`: `P0`
- `mode`: `auto`
- `pass_criteria`: required legal pages exist (`privacy`, `cookies`, `terms`).
- `fail_criteria`: any required legal page missing.
- `evidence_output`: `artifacts/ux/legal-page-presence.json`
- `owner_default`: `content`

### LEGAL-P0-02
- `id`: `LEGAL-P0-02`
- `priority`: `P0`
- `mode`: `auto`
- `pass_criteria`: required legal template blocks are present and non-empty.
- `fail_criteria`: missing mandatory legal block content.
- `evidence_output`: `artifacts/ux/legal-template-validation.json`
- `owner_default`: `content`

### UX-P2-01
- `id`: `UX-P2-01`
- `priority`: `P2`
- `mode`: `manual`
- `pass_criteria`: monthly terminology consistency review completed.
- `fail_criteria`: no terminology review output.
- `evidence_output`: `artifacts/ux/terminology-review.md`
- `owner_default`: `content`

## Blocking Behavior
1. Any failed `*-P0-*` rule in this document blocks publish.
2. `P1` and `P2` failures require follow-up actions in `docs/quality/40_ACTION_PLAN.md`.
