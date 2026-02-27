# Quality Start Here (v3)

## Purpose
This folder defines release quality checks and evidence outputs.
It is used by both:
1. app-native quality state (DB/UI)
2. markdown artifact trail for auditability

## Release Gate Rules
1. Publish is blocked on any `P0` quality failure.
2. `P1/P2` findings are non-blocking but must enter action plan.

## Required Files
1. `10_CORE_SEO_RULES.md`
2. `11_CORE_UX_UI_RULES.md`
3. `20_PROJECT_CONTEXT.md`
4. `30_RELEASE_REPORT.md`
5. `40_ACTION_PLAN.md`

## Evidence Paths
1. `artifacts/seo/*`
2. `artifacts/ux/*`

## Rule IDs
1. SEO: `SEO-P0-*`, `SEO-P1-*`, `SEO-P2-*`
2. UX/UI: `UX-P0-*`, `UX-P1-*`, `UX-P2-*`

## Operational Discipline
1. Every blocking fail must have a matching action item.
2. Every action item has owner + status + ETA + evidence link.

