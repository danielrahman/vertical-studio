# Backlog

## Rules

1. Status must be one of: `todo`, `in_progress`, `blocked`, `done`.
2. Keep highest-priority items at top.
3. Update this file at the end of each implementation session.

## Items


| id          | title                                                                 | status      | owner | notes                                                                                   |
| ----------- | --------------------------------------------------------------------- | ----------- | ----- | --------------------------------------------------------------------------------------- |
| VS3-IMP-032 | Persist structured compose/copy prompt payloads in audit trail        | done        | codex | Compose/copy audit events now persist structured prompt payload contract fields with API/acceptance assertions |
| VS3-IMP-031 | Enforce auth for non-public v3 read endpoints                         | done        | codex | Added tenant-member/internal-admin role guard to non-public GET surfaces with API/WS-B coverage |
| VS3-IMP-030 | Enforce signed webhook verification and audit for CMS publish ingress | done        | codex | Added HMAC signature guard + `cms_publish_webhook_queued` audit trail with API/acceptance coverage |
| VS3-OPS-001 | Curate `.env` baseline from docs/plan and current runtime usage       | done        | codex | Trimmed `.env.example`, aligned README env docs, and prefilled local `.env` baseline   |
| VS3-DOC-001 | Revise plan/quality/security docs to vertical-intelligence-first spec | done        | codex | Includes ADR-005..007 and plan files 50/60/70                                           |
| VS3-DOC-002 | Cross-file naming consistency check (`00/10/20/30`)                   | done        | codex | Types and endpoint families aligned in docs                                             |
| VS3-IMP-001 | Create monorepo workspace structure (`apps/*`, `packages/*`)          | done        | codex | Scaffolded with workspace bridges; legacy runtime preserved                             |
| VS3-IMP-002 | Add TS toolchain (tsconfig, eslint, prettier, vitest baseline)        | done        | codex | Added root TS/ESLint/Prettier/Vitest baseline with legacy runtime compatibility         |
| VS3-IMP-003 | Implement `packages/schema` canonical contracts from docs             | done        | codex | Added TS+Zod contracts for extraction, vertical, component, copy, review, and overrides |
| VS3-IMP-004 | Add additive v3 API routes from updated `docs/plan/30-api.md`         | done        | codex | Added route skeletons for v3 lifecycle families while preserving existing endpoints     |
| VS3-IMP-005 | Implement review state transition guard service                       | done        | codex | Added dedicated guard service with reason codes (`state_mismatch`, `event_mismatch`, `reason_required`) |
| VS3-IMP-006 | Implement compose/copy skeleton with bounded slot validation          | done        | codex | Added deterministic compose IDs, slot model, and bounded candidate generation (`A/B/C` vs `SINGLE`) |
| VS3-IMP-007 | Implement publish gate skeleton (quality/security blockers)           | done        | codex | Added publish gate evaluator for quality `P0` and unresolved security `critical/high` |
| VS3-IMP-008 | Implement secret-ref metadata model and ACL (`internal_admin`)        | done        | codex | Added strict secret metadata validation, `internal_admin` ACL, and no-plaintext payload guard |
| VS3-IMP-009 | Implement ops review flow for variant selection and overrides         | done        | codex | Added proposal tracking, state-gated selection/overrides, and `internal_admin` transition ACL |
| VS3-IMP-010 | Implement public runtime snapshot rendering skeleton                  | done        | codex | Added host->active version resolution, immutable snapshot fetch endpoints, and public-web runtime client skeleton |
| VS3-IMP-011 | Add documentation acceptance test harness                             | done        | codex | Added executable docs+API acceptance harness covering rollout tests 1-8 and scenarios 4.1-4.4 |
| VS3-IMP-012 | Implement rollback active-version repoint for public runtime          | done        | codex | Rollback endpoint now reactivates exact prior immutable version and runtime resolve follows active pointer |
| VS3-IMP-013 | Enforce `internal_admin` ACL for publish and rollback                 | done        | codex | Publish/rollback now require `internal_admin`; regression tests cover forbidden and allowed paths |
| VS3-IMP-014 | Add runtime invariant test: post-publish draft edits don't change live snapshot | done        | codex | Added API + acceptance harness regression coverage proving live pointer stays on published immutable version |
| VS3-IMP-015 | Add storage-key-only runtime snapshot fetch path                      | done        | codex | Added `/public/runtime/snapshot/by-storage-key` endpoint and switched runtime client flow to resolve->storageKey fetch |
| VS3-IMP-016 | Add runtime latency baseline harness check                            | done        | codex | Added executable local resolve+snapshot latency threshold check in WS-E acceptance harness |
| VS3-IMP-017 | Add internal-admin audit event read endpoint                          | done        | codex | Added `/api/v1/audit/events` with internal-admin ACL and filter/limit support for privileged action trail inspection |
| VS3-IMP-018 | Add deterministic security gate reason-code output                    | done        | codex | Added `securityReasonCodes` (`security_blocked_critical|security_blocked_high|security_pass_non_blocking_only`) to publish gate results while preserving existing fields |
| VS3-IMP-019 | Add quality report gate-family output contract                        | done        | codex | Quality latest endpoint now returns deterministic COPY/LAYOUT/MEDIA/LEGAL gate outcomes and acceptance coverage |
| VS3-IMP-020 | Add security report artifact+gate output contract                     | done        | codex | Security latest endpoint now includes deterministic gate decision fields plus JSON/markdown/gate artifact paths with API+acceptance coverage |
| VS3-IMP-021 | Add WS-G secret rotation runbook artifact contract check              | done        | codex | Added `docs/security/SECRET_ROTATION_RUNBOOK.md`, indexed it in security docs, and enforced WS-G runbook/audit contract via acceptance test |
| VS3-IMP-022 | Add required security findings JSON contract fields to latest endpoint | done        | codex | Security latest endpoint now includes required top-level `findings` array plus explicit release/site/version metadata contract assertions in API+acceptance tests |
| VS3-IMP-023 | Persist and expose latest security gate report per publish attempt    | done        | codex | Publish attempts now persist normalized security findings + deterministic gate decision so `/security/latest` returns real blocked/non-blocking outcomes |
| VS3-IMP-024 | Emit audit events for publish blocked/succeeded attempts              | done        | codex | Publish now emits `ops_publish_blocked` and `ops_publish_succeeded` audit events with gate context, plus API/acceptance verification |
| VS3-IMP-025 | Emit audit events for copy selection mutations                        | done        | codex | `POST /copy/select` now emits `ops_copy_selected` events and API/acceptance tests verify provenance audit visibility |
| VS3-IMP-026 | Persist and expose latest quality gate report per publish attempt     | done        | codex | Publish attempts now persist normalized quality findings and gate-family outcomes so `/quality/latest` reflects real blocked/non-blocking states |
| VS3-IMP-027 | Enforce internal-admin ACL for tenant/bootstrap/vertical-build writes | done        | codex | Tenant create, extraction bootstrap, and vertical research build now require `internal_admin` and emit audit trail events with API/acceptance coverage |
| VS3-IMP-028 | Emit audit events for copy generation mutations                       | done        | codex | `POST /copy/generate` now emits `ops_copy_generated` entries and API/acceptance tests verify generation provenance audit visibility |
| VS3-IMP-029 | Enforce ACL for compose/copy mutating endpoints                       | done        | codex | Compose/copy mutating routes now require `internal_admin`; API and acceptance tests updated with explicit forbidden-role coverage |
