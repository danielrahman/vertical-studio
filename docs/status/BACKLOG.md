# Backlog

## Rules

1. Status must be one of: `todo`, `in_progress`, `blocked`, `done`.
2. Keep highest-priority items at top.
3. Update this file at the end of each implementation session.

## Items


| id          | title                                                                 | status      | owner | notes                                                                                   |
| ----------- | --------------------------------------------------------------------- | ----------- | ----- | --------------------------------------------------------------------------------------- |
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
