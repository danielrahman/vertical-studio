# Release Quality Report (Template)

## Metadata
- Date: `<YYYY-MM-DD>`
- Release ID: `<id>`
- Site ID: `<site-id>`
- Version ID: `<version-id>`
- Environment: `<preview|live>`

## Executive Summary
- Overall status: `<PASS|PASS_WITH_RISKS|FAIL>`
- Blocking gate result: `<BLOCKED|PASSED>`
- Blocking reasons: `<list>`

## SEO Results
| rule_id | status | priority | evidence | note |
|---|---|---|---|---|
| SEO-P0-01 | N/A | P0 | `artifacts/seo/canonical-check.txt` | pending |
| SEO-P0-05 | N/A | P0 | `artifacts/seo/technical-claim-evidence-map.json` | pending |

## UX Results
| rule_id | status | priority | evidence | note |
|---|---|---|---|---|
| UX-P0-01 | N/A | P0 | `artifacts/ux/guardrail-order-check.json` | pending |
| UX-P0-04 | N/A | P0 | `artifacts/ux/cms-guardrail-validation.json` | pending |

## COPY Gate Outcomes
| rule_id | status | priority | evidence | note |
|---|---|---|---|---|
| COPY-P0-01 | N/A | P0 | `artifacts/ux/copy-required-slot-completeness.json` | pending |
| COPY-P0-02 | N/A | P0 | `artifacts/ux/copy-high-impact-candidate-counts.json` | pending |
| COPY-P0-03 | N/A | P0 | `artifacts/ux/copy-slot-limit-validation.csv` | pending |

## LAYOUT Gate Outcomes
| rule_id | status | priority | evidence | note |
|---|---|---|---|---|
| LAYOUT-P0-01 | N/A | P0 | `artifacts/ux/layout-overflow-check.json` | pending |
| LAYOUT-P0-02 | N/A | P0 | `artifacts/ux/layout-override-compliance.json` | pending |

## MEDIA Gate Outcomes
| rule_id | status | priority | evidence | note |
|---|---|---|---|---|
| MEDIA-P0-01 | N/A | P0 | `artifacts/ux/media-alt-audit.csv` | pending |
| MEDIA-P0-02 | N/A | P0 | `artifacts/ux/media-link-check.txt` | pending |

## LEGAL Gate Outcomes
| rule_id | status | priority | evidence | note |
|---|---|---|---|---|
| LEGAL-P0-01 | N/A | P0 | `artifacts/ux/legal-page-presence.json` | pending |
| LEGAL-P0-02 | N/A | P0 | `artifacts/ux/legal-template-validation.json` | pending |

## KPI Snapshot
| kpi | target | current | status |
|---|---:|---:|---|
| Proposal generation success rate | `>=95%` | `<value>` | `<ok|risk|fail>` |
| Publish gate pass rate after review | `>=80%` | `<value>` | `<ok|risk|fail>` |
| Average revision rounds before publish | `<=2` | `<value>` | `<ok|risk|fail>` |
| Required slot completeness (CZ+EN) | `100%` | `<value>` | `<ok|risk|fail>` |
| Blocked release when unresolved P0/critical/high exists | `100%` | `<value>` | `<ok|risk|fail>` |

## Blocking Decision
1. If any `P0` is `FAIL`, publish must be blocked.
2. Non-blocking findings must map to action plan entries.

## Required Follow-up
List action IDs from `docs/quality/40_ACTION_PLAN.md`:
1. `<ACT-001>`
