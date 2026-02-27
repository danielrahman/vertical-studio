# Backlog

## Rules

1. Status must be one of: `todo`, `in_progress`, `blocked`, `done`.
2. Keep highest-priority items at top.
3. Update this file at the end of each implementation session.

## Items


| id          | title                                                                 | status      | owner | notes                                                                                   |
| ----------- | --------------------------------------------------------------------- | ----------- | ----- | --------------------------------------------------------------------------------------- |
| VS3-DOC-001 | Revise plan/quality/security docs to vertical-intelligence-first spec | done        | codex | Includes ADR-005..007 and plan files 50/60/70                                           |
| VS3-DOC-002 | Cross-file naming consistency check (`00/10/20/30`)                   | done        | codex | Types and endpoint families aligned in docs                                             |
| VS3-IMP-001 | Create monorepo workspace structure (`apps/*`, `packages/*`)          | done        | codex | Scaffolded with workspace bridges; legacy runtime preserved                             |
| VS3-IMP-002 | Add TS toolchain (tsconfig, eslint, prettier, vitest baseline)        | done        | codex | Added root TS/ESLint/Prettier/Vitest baseline with legacy runtime compatibility         |
| VS3-IMP-003 | Implement `packages/schema` canonical contracts from docs             | done        | codex | Added TS+Zod contracts for extraction, vertical, component, copy, review, and overrides |
| VS3-IMP-004 | Add additive v3 API routes from updated `docs/plan/30-api.md`         | done        | codex | Added route skeletons for v3 lifecycle families while preserving existing endpoints     |
| VS3-IMP-005 | Implement review state transition guard service                       | done        | codex | Added dedicated guard service with reason codes (`state_mismatch`, `event_mismatch`, `reason_required`) |
| VS3-IMP-006 | Implement compose/copy skeleton with bounded slot validation          | done        | codex | Added deterministic compose IDs, slot model, and bounded candidate generation (`A/B/C` vs `SINGLE`) |
| VS3-IMP-007 | Implement publish gate skeleton (quality/security blockers)           | done        | codex | Added publish gate evaluator for quality `P0` and unresolved security `critical/high` |
| VS3-IMP-008 | Implement secret-ref metadata model and ACL (`internal_admin`)        | todo        | codex | Ref naming `tenant.<slug>.<provider>.<key>`                                             |
| VS3-IMP-009 | Implement ops review flow for variant selection and overrides         | todo        | codex | Internal admin only transitions                                                         |
| VS3-IMP-010 | Implement public runtime snapshot rendering skeleton                  | todo        | codex | Dynamic immutable version fetch                                                         |

