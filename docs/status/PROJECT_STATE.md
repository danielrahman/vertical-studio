# Project State

Last updated: 2026-02-28

## Current Goal

Move from decision-complete documentation to incremental v3 implementation, preserving v2 compatibility during transition.

## Done

1. v3 plan documentation revised to vertical-intelligence-first architecture.
2. Plan pack expanded with new ADRs and domain specs:
  1. `docs/plan/adr-005-evidence-confidence-policy.md`
  2. `docs/plan/adr-006-component-contracts-and-bounded-copy.md`
  3. `docs/plan/adr-007-vertical-intelligence-pattern-policy.md`
  4. `docs/plan/50-component-contracts.md`
  5. `docs/plan/60-copy-system.md`
  6. `docs/plan/70-vertical-research-standard.md`
3. Existing plan docs (`00/10/20/30/40`) aligned to locked decisions.
4. Quality docs updated with COPY/LAYOUT/MEDIA/LEGAL P0 families and KPI-ready release report sections.
5. Security docs updated with required JSON findings contract and explicit release gate schema.
6. Persistent cross-session tracking maintained in `docs/status/*`.
7. Monorepo workspace scaffold added (`apps/*`, `packages/*`) with legacy runtime compatibility bridges and root npm workspaces.
8. Workspace TypeScript toolchain baseline added:
  1. shared `tsconfig` (`tsconfig.base.json`, `tsconfig.json`)
  2. ESLint baseline (`.eslintrc.cjs`)
  3. Prettier baseline (`.prettierrc.json`)
  4. Vitest baseline (`vitest.config.ts`, `tests/vitest/*`)
  5. root scripts (`typecheck`, `lint`, `format:check`, `test:vitest`)
9. `packages/schema` canonical contracts implemented (TypeScript + Zod) for extraction evidence, vertical standards, component contracts, copy lifecycle, review transition requests, manual overrides, and secret-ref metadata.
10. Additive v3 API route families registered under `/api/v1/*` with deterministic skeleton handlers for tenant, vertical research, component contracts, compose/copy, overrides, review transitions, publish/rollback, cms webhook, and secret refs.
11. Review transition guard service implemented with explicit reason-code outcomes for invalid transitions (`transition_not_allowed`, `state_mismatch`, `event_mismatch`, `reason_required`).
12. Compose/copy skeleton implemented with deterministic proposal IDs plus bounded slot definitions and candidate generation policy (high-impact `A/B/C`, non-high-impact `SINGLE`).
13. Publish gate skeleton implemented with deterministic blocking logic for quality `P0` and unresolved security `critical/high`.
14. Secret-ref metadata model and ACL implemented (`VS3-IMP-008`): enforced `internal_admin` access, strict `tenant.<slug>.<provider>.<key>` validation, metadata-only persistence, and plaintext secret payload rejection.
15. Ops review flow implemented (`VS3-IMP-009`) with proposal tracking, `internal_admin`-only review transitions, state-gated variant selection, and state-gated manual overrides with versioned metadata.
16. Public runtime snapshot rendering skeleton implemented (`VS3-IMP-010`) with host-based active-version resolution, immutable storage-key snapshot fetch APIs, and a public-web runtime client/HTML renderer module.
17. Documentation acceptance harness implemented (`VS3-IMP-011`) with executable coverage for rollout documentation tests (1-8) and acceptance scenarios (4.1-4.4).
18. Runtime rollback repointing implemented (`VS3-IMP-012`) so rollback reactivates an exact prior immutable version and public runtime resolution follows the active pointer.
19. Environment baseline curation completed (`VS3-OPS-001`): `.env.example` reduced to stable runtime keys, README env reference aligned, and local `.env` prefilled with future-ready placeholders.
20. Publish/rollback ACL hardening implemented (`VS3-IMP-013`): state-changing publish endpoints now require `internal_admin`, aligned with architecture actor constraints and API mutating-endpoint rules.
21. WS-E immutable-live invariant coverage implemented (`VS3-IMP-014`): post-publish draft edits are regression-tested to ensure active runtime resolution and live snapshot content remain pinned to published versions.
22. Storage-key runtime fetch path implemented (`VS3-IMP-015`): added storage-key-only snapshot endpoint and updated public runtime client/tests to resolve host then fetch immutable snapshot by storage key.
23. WS-E local latency baseline check implemented (`VS3-IMP-016`): acceptance harness now measures resolve+snapshot runtime path under a local threshold to establish a repeatable baseline.
24. Audit trail read API implemented (`VS3-IMP-017`): internal-admin endpoint exposes privileged action events with filters/limits to support release/security verification workflows.
25. Deterministic security gate reason-code output implemented (`VS3-IMP-018`): publish gate now emits explicit security policy codes for `critical/high` blockers and non-blocking pass outcomes.
26. Quality gate-family output contract implemented (`VS3-IMP-019`): quality latest report now includes COPY/LAYOUT/MEDIA/LEGAL family outcomes for WS-F checklist compatibility.
27. Security report artifact+gate output contract implemented (`VS3-IMP-020`): security latest report now includes deterministic gate decision/reason code, severity counts, and required JSON+markdown+gate artifact references.
28. WS-G secret rotation runbook artifact contract check implemented (`VS3-IMP-021`): added a formal rotation runbook and executable acceptance assertion for naming policy, `internal_admin` scope, and audit trail path presence.
29. Security findings JSON top-level contract alignment implemented (`VS3-IMP-022`): security latest endpoint now includes required `findings` field and explicit contract assertions for release/site/version metadata in API and acceptance harness coverage.
30. Latest security gate report persistence implemented (`VS3-IMP-023`): publish attempts now store normalized security findings/severity summaries and deterministic gate decisions so `/security/latest` reflects real blocked or non-blocking outcomes.
31. Publish audit event hardening implemented (`VS3-IMP-024`): privileged publish attempts now emit explicit blocked/success audit events and acceptance coverage validates audit trail presence for WS-F publish scenarios.
32. Copy selection audit provenance implemented (`VS3-IMP-025`): copy selection mutations now emit explicit audit events and acceptance/API coverage confirms privileged trail visibility for review traceability.
33. Latest quality gate report persistence implemented (`VS3-IMP-026`): publish attempts now store normalized quality findings and deterministic gate-family outcomes so `/quality/latest` reflects real blocked or non-blocking gate states.
34. Tenant/bootstrap/vertical-build ACL + audit hardening implemented (`VS3-IMP-027`): these mutating lifecycle endpoints now enforce `internal_admin` contract auth and emit privileged audit events for WS-B/API traceability.
35. Copy generation audit provenance implemented (`VS3-IMP-028`): copy generation mutations now emit explicit audit events and API/acceptance coverage confirms privileged provenance trail visibility.
36. Compose/copy mutation ACL hardening implemented (`VS3-IMP-029`): compose propose and copy generate/select routes now enforce `internal_admin` access, with unauthorized-path and acceptance coverage aligned to API auth contract.
37. CMS webhook signed-ingress hardening implemented (`VS3-IMP-030`): `POST /cms/webhooks/publish` now enforces HMAC signature verification, emits `cms_publish_webhook_queued` audit events, and is covered by API + WS-C acceptance tests.
38. Non-public read endpoint auth hardening implemented (`VS3-IMP-031`): tenant/member scoped GET routes now require `internal_admin|owner|editor|viewer`, with explicit forbidden-path and WS-B contract coverage.
39. Compose/copy prompt audit-contract persistence implemented (`VS3-IMP-032`): compose/copy audit events now store structured prompt payloads (`verticalStandardVersion`, component versions, slot definitions, manual overrides, disallowed patterns) with API + acceptance assertions.
40. Error envelope contract hardening implemented (`VS3-IMP-033`): all API error paths now consistently return `code`, `message`, `requestId`, and `details` (including 404 middleware responses), with API + WS-A regression coverage.
41. Extraction bootstrap evidence normalization implemented (`VS3-IMP-034`): bootstrap now normalizes and stores `ExtractedField` evidence metadata, enforces low-confidence TODO nulling for required fields, and persists audit counters for required TODO review signals.
42. Copy selection policy exception implemented (`VS3-IMP-035`): `owner` role is now permitted on copy selection only when site policy enables draft copy edits; default remains internal-admin-only and audit trail captures selecting role.
43. Low-confidence publish pre-gate implemented (`VS3-IMP-036`): publish now returns deterministic `low_confidence_review_required` blockers for drafts with unresolved required extraction TODOs and emits corresponding blocked audit events with TODO counts.
44. Copy-generate request contract enforcement implemented (`VS3-IMP-037`): copy generation now rejects any provided `highImpactOnlyThreeVariants` value other than `true`, with API and WS-D acceptance coverage enforcing the bounded high-impact mode contract.
45. Copy-select request contract hardening implemented (`VS3-IMP-038`): copy selection now enforces required selection tuple fields (`slotId`, `locale`, `candidateId`) and rejects slot/locale mismatches against generated candidates, with API and acceptance harness coverage.
46. Copy-generate locale contract hardening implemented (`VS3-IMP-039`): copy generation now accepts only `cs-CZ` and `en-US` locales, rejects unsupported locale values with validation details, and de-duplicates locale input before candidate generation.
47. Copy-select tuple uniqueness enforcement implemented (`VS3-IMP-040`): copy selection now rejects duplicate `slotId`+`locale` tuples in a single request to preserve one final recommendation per slot-locale pair.
48. Copy-generate prompt-version requirement implemented (`VS3-IMP-041`): copy generation now requires explicit `verticalStandardVersion`, tightening prompt/audit reproducibility and aligning WS-D copy contract coverage.
49. Copy-select non-empty request enforcement implemented (`VS3-IMP-042`): copy selection now rejects empty selection arrays, preserving deterministic non-noop selection semantics and maintaining unauthorized-first auth response behavior.
50. Copy-select actor provenance enforcement implemented (`VS3-IMP-043`): copy selection now validates optional request `selectedBy` against authenticated actor role and persists server-derived selector identity for deterministic auditability.
51. Catalog-version component contract validation implemented (`VS3-IMP-044`): compose now rejects unknown `catalogVersion` values with typed contract-not-found errors, and component contract listing now supports deterministic catalog-version filtering for WS-D contract alignment.
52. Override required-component validation implemented (`VS3-IMP-045`): manual overrides now validate `requiredComponents` against loaded component contracts and reject unknown IDs with deterministic `invalid_override_payload` details.
53. Override section taxonomy validation implemented (`VS3-IMP-046`): manual override section arrays now enforce an explicit allowed section-key set and reject unknown values with deterministic `invalid_override_payload` details for contract-safe orchestration inputs.
54. Override section conflict validation implemented (`VS3-IMP-047`): manual overrides now reject conflicting section directives across required/excluded and pinned/excluded sets, preventing contradictory orchestration intents before compose/copy execution.
55. Override array uniqueness validation implemented (`VS3-IMP-048`): manual overrides now reject duplicate values within each override array field, tightening deterministic prompt payload inputs and reducing redundant operator directives.
56. Override no-op payload guard implemented (`VS3-IMP-049`): manual overrides now require at least one non-empty directive array, preventing empty mutation versions and preserving meaningful operator intent per override revision.
57. Override string normalization + blank-value rejection implemented (`VS3-IMP-050`): manual overrides now trim string-array directives before validation/storage, reject blank or whitespace-only values with deterministic `invalid_override_payload` errors, and enforce duplicate checks on normalized values.
58. Override unknown-field payload guard implemented (`VS3-IMP-051`): manual overrides now reject unexpected top-level payload keys with deterministic `invalid_override_payload` details, ensuring strict override request-shape compliance and preventing silently ignored operator directives.
59. Copy-select unknown-field payload guard implemented (`VS3-IMP-052`): copy selection now rejects unknown top-level request keys and unknown per-selection object fields with deterministic `validation_error` details, enforcing strict request-shape integrity for selection provenance workflows.
60. Copy-generate unknown-field payload guard implemented (`VS3-IMP-053`): copy generation now rejects unknown top-level request keys with deterministic `validation_error` details, enforcing strict prompt-contract input shape before slot generation.
61. Compose-propose unknown-field payload guard implemented (`VS3-IMP-054`): compose proposal generation now rejects unknown top-level request keys with deterministic `validation_error` details, enforcing strict prompt-contract input shape before deterministic variant composition.
62. Compose-select unknown-field payload guard implemented (`VS3-IMP-055`): compose proposal selection now rejects unknown top-level request keys with deterministic `validation_error` details, enforcing strict request-shape integrity for internal-admin final variant selection.
63. Review-transition unknown-field payload guard implemented (`VS3-IMP-056`): review transition requests now reject unknown top-level keys with deterministic `validation_error` details, enforcing strict state-transition request-shape integrity before transition guard evaluation.
64. Publish unknown-field payload guard implemented (`VS3-IMP-057`): publish requests now reject unknown top-level keys with deterministic `validation_error` details, enforcing strict release-gate request-shape integrity before gate evaluation.
65. CMS publish-webhook unknown-field payload guard implemented (`VS3-IMP-058`): signed CMS webhook ingress now rejects unknown top-level keys with deterministic `validation_error` details, enforcing strict webhook contract request-shape integrity before queueing.
66. Secret-ref unknown-field payload guard implemented (`VS3-IMP-059`): secret metadata writes now reject unknown top-level keys with deterministic `validation_error` details, enforcing strict secret-ref contract request-shape integrity before metadata validation/persistence.
67. Tenant-create unknown-field payload guard implemented (`VS3-IMP-062`): tenant create requests now reject unknown top-level keys with deterministic `validation_error` details, enforcing strict tenant lifecycle request-shape integrity.
68. Bootstrap unknown-field payload guard implemented (`VS3-IMP-061`): extraction bootstrap requests now reject unknown top-level keys with deterministic `validation_error` details, enforcing strict draft bootstrap request-shape integrity.
69. Vertical-research-build unknown-field payload guard implemented (`VS3-IMP-060`): vertical research build requests now reject unknown top-level keys with deterministic `validation_error` details, enforcing strict vertical intelligence request-shape integrity.
70. Rollback unknown-field payload guard implemented (`VS3-IMP-063`): rollback requests now reject unknown top-level keys with deterministic `validation_error` details, enforcing strict immutable runtime repoint request-shape integrity.
71. Vertical research source-class validation details implemented (`VS3-IMP-064`): vertical research build now returns deterministic `validation_error` details (`invalidSources`, `allowedSources`) when `sources` is empty or includes unsupported classes, tightening source-policy contract enforcement.
72. Vertical research `sourceDomains` payload-shape validation implemented (`VS3-IMP-065`): vertical research build now rejects non-string/blank `sourceDomains` entries with deterministic `validation_error` details and persists trim-normalized unique domain values.
73. Vertical research `sourceDomains` domain-format validation implemented (`VS3-IMP-066`): vertical research build now rejects malformed/non-domain `sourceDomains` values with deterministic `validation_error` details and lowercases valid hostnames before de-duplication.
74. Vertical research duplicate-source validation implemented (`VS3-IMP-067`): vertical research build now rejects duplicate `sources` class values with deterministic `validation_error` details (`duplicateSources`), enforcing unambiguous source-policy input shape.
75. Vertical research duplicate-sourceDomain validation implemented (`VS3-IMP-068`): vertical research build now rejects duplicate `sourceDomains` values after trim/lowercase normalization with deterministic `validation_error` details (`duplicateSourceDomains`), enforcing unambiguous competitor-domain sampling inputs.
76. Vertical research numeric-competitor-count contract enforcement implemented (`VS3-IMP-069`): vertical research build now requires `targetCompetitorCount` to be a numeric integer `>= 15` and rejects string-coerced values to preserve strict request-shape semantics.
77. Vertical research `sourceDomains` array-type enforcement implemented (`VS3-IMP-070`): vertical research build now rejects non-array `sourceDomains` payload values with deterministic `validation_error` details (`invalidField`) instead of silently treating them as omitted.
78. Vertical research `sources` array-type enforcement implemented (`VS3-IMP-071`): vertical research build now rejects non-array `sources` payload values with deterministic `validation_error` details (`invalidField`) instead of coercing to empty arrays.
79. Vertical research competitor-minimum validation details implemented (`VS3-IMP-072`): vertical research build now returns deterministic `insufficient_competitor_sample` details (`minimumTargetCompetitorCount`, `receivedTargetCompetitorCount`) when `targetCompetitorCount` violates the `>= 15` contract.
80. Bootstrap `extractedFields` array-type enforcement implemented (`VS3-IMP-073`): bootstrap-from-extraction now rejects non-array `extractedFields` payload values with deterministic `validation_error` details (`invalidField`) instead of coercing to empty arrays.
81. Bootstrap `lowConfidence` boolean-type enforcement implemented (`VS3-IMP-074`): bootstrap-from-extraction now rejects non-boolean `lowConfidence` payload values with deterministic `validation_error` details (`invalidField`) instead of coercing truthy/falsy values.
82. Bootstrap `sitePolicy` object-type enforcement implemented (`VS3-IMP-075`): bootstrap-from-extraction now rejects non-object `sitePolicy` payload values with deterministic `validation_error` details (`invalidField`) when provided.
83. Bootstrap `sitePolicy` nested-shape enforcement implemented (`VS3-IMP-076`): bootstrap-from-extraction now rejects unknown nested `sitePolicy` keys with deterministic `validation_error` details (`invalidField`, `unknownFields`) when provided.
84. Bootstrap `extractedFields` item-type enforcement implemented (`VS3-IMP-077`): bootstrap-from-extraction now rejects non-object `extractedFields` items with deterministic `validation_error` details (`invalidField`, `invalidItemIndexes`) when provided.
85. Bootstrap `extractedFields` nested-shape enforcement implemented (`VS3-IMP-078`): bootstrap-from-extraction now rejects unknown keys inside `extractedFields` items with deterministic `validation_error` details (`invalidField`, `invalidItemFields`) when provided.
86. Bootstrap `extractedFields[].fieldPath` type enforcement implemented (`VS3-IMP-079`): bootstrap-from-extraction now rejects non-string or blank `fieldPath` values when explicitly provided in extracted-field items, returning deterministic `validation_error` details (`invalidField`, `invalidItemIndexes`).
87. Bootstrap `extractedFields[].sourceUrl` type enforcement implemented (`VS3-IMP-080`): bootstrap-from-extraction now rejects invalid provided `sourceUrl` values (must be non-empty string or null) with deterministic `validation_error` details (`invalidField`, `invalidItemIndexes`).
88. Bootstrap `extractedFields[].method` allow-list enforcement implemented (`VS3-IMP-081`): bootstrap-from-extraction now rejects invalid provided `method` values when explicitly present in extracted-field items and returns deterministic `validation_error` details (`invalidField`, `invalidItemIndexes`, `allowedMethods`).
89. Bootstrap `extractedFields[].required` type enforcement implemented (`VS3-IMP-082`): bootstrap-from-extraction now rejects non-boolean provided `required` values in extracted-field items with deterministic `validation_error` details (`invalidField`, `invalidItemIndexes`).
90. Bootstrap `extractedFields[].confidence` numeric-type enforcement implemented (`VS3-IMP-083`): bootstrap-from-extraction now rejects non-numeric provided `confidence` values in extracted-field items with deterministic `validation_error` details (`invalidField`, `invalidItemIndexes`).
91. Bootstrap `extractedFields[].confidence` range enforcement implemented (`VS3-IMP-084`): bootstrap-from-extraction now rejects provided `confidence` values outside `[0,1]` in extracted-field items and returns deterministic `validation_error` details (`invalidField`, `invalidItemIndexes`, `allowedRange`) instead of silently clamping.
92. Bootstrap `extractedFields[].extractedAt` non-empty-string enforcement implemented (`VS3-IMP-085`): bootstrap-from-extraction now rejects non-string or blank provided `extractedAt` values in extracted-field items with deterministic `validation_error` details (`invalidField`, `invalidItemIndexes`).
93. Bootstrap `extractedFields[].extractedAt` ISO-8601 enforcement implemented (`VS3-IMP-086`): bootstrap-from-extraction now rejects non-ISO-8601 provided `extractedAt` datetime strings in extracted-field items with deterministic `validation_error` details (`invalidField`, `invalidItemIndexes`).
94. Copy-generate `locales` array-type enforcement implemented (`VS3-IMP-087`): `POST /sites/:siteId/copy/generate` now rejects non-array provided `locales` payload values with deterministic `validation_error` details (`invalidField`) instead of coercing to empty arrays.
95. Copy-generate `locales` item-type enforcement implemented (`VS3-IMP-088`): `POST /sites/:siteId/copy/generate` now rejects non-string `locales` array entries with deterministic `validation_error` details (`invalidField`, `invalidItemIndexes`).
96. Copy-generate `locales` duplicate-value enforcement implemented (`VS3-IMP-089`): `POST /sites/:siteId/copy/generate` now rejects duplicate `locales` values with deterministic `validation_error` details (`invalidField`, `duplicateLocales`) instead of silently de-duplicating.
97. Copy-generate required-locale details implemented (`VS3-IMP-090`): `POST /sites/:siteId/copy/generate` now returns deterministic `validation_error` details (`invalidField`, `missingLocales`) when required locales (`cs-CZ`,`en-US`) are not fully provided.
98. Copy-generate high-impact mode field-key standardization implemented (`VS3-IMP-091`): `POST /sites/:siteId/copy/generate` now reports deterministic `validation_error` details using `invalidField` (instead of `field`) for `highImpactOnlyThreeVariants` validation failures.
99. Copy-generate unsupported-locale field-key standardization implemented (`VS3-IMP-092`): `POST /sites/:siteId/copy/generate` now reports deterministic `validation_error` details using `invalidField` (instead of `field`) for unsupported locale validation failures.
100. Copy-generate missing-version field-details implemented (`VS3-IMP-093`): `POST /sites/:siteId/copy/generate` now reports deterministic `validation_error` details (`invalidField`) when `verticalStandardVersion` is missing.
101. Copy-select top-level selection field-key standardization implemented (`VS3-IMP-094`): `POST /sites/:siteId/copy/select` now reports deterministic `validation_error` details using `invalidField` (instead of `field`) for empty selections, tuple mismatch, duplicate tuple, and selectedBy actor mismatch errors.
102. Copy-select per-item field-key standardization implemented (`VS3-IMP-095`): `POST /sites/:siteId/copy/select` now reports deterministic `validation_error` details using `invalidField` (instead of `field`) for per-item shape validation failures, including index-aware paths like `selections[0].locale`.
103. Copy-select selections-array required details implemented (`VS3-IMP-096`): `POST /sites/:siteId/copy/select` now reports deterministic `validation_error` details (`invalidField`) when `selections` is missing or not an array.
104. Copy-select draftId required details implemented (`VS3-IMP-097`): `POST /sites/:siteId/copy/select` now reports deterministic `validation_error` details (`invalidField`) when `draftId` is missing or not a string.

## In Progress

1. Runtime implementation is in early scaffold phase; v3 domain features are not implemented yet.

## Next

1. Complete `VS3-IMP-098` by exposing deterministic candidate tuple details on copy-select `copy_candidate_not_found` errors.
2. Define and prioritize the next copy-select operator-triage hardening slice once `VS3-IMP-098` is complete.

## Known Constraints

1. Keep compatibility with existing generation/extraction endpoints.
2. Composition remains deterministic with exactly three curated variants.
3. Competitor data is pattern-level only (`IA + CTA + trust + tone`).
4. Publish must block on quality `P0` and unresolved security `critical/high`.
5. Corpus remains optional and non-blocking in v1.
