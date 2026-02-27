# Backlog

## Rules
1. Status must be one of: `todo`, `in_progress`, `blocked`, `done`.
2. Keep highest-priority items at top.
3. Update this file at the end of each implementation session.

## Items
| id | title | status | owner | notes |
|---|---|---|---|---|
| VS3-DOC-001 | Revise plan/quality/security docs to vertical-intelligence-first spec | done | codex | Includes ADR-005..007 and plan files 50/60/70 |
| VS3-DOC-002 | Cross-file naming consistency check (`00/10/20/30`) | done | codex | Types and endpoint families aligned in docs |
| VS3-IMP-001 | Create monorepo workspace structure (`apps/*`, `packages/*`) | todo | codex | Preserve current runtime while scaffolding |
| VS3-IMP-002 | Add TS toolchain (tsconfig, eslint, prettier, vitest baseline) | todo | codex | Workspace-wide config |
| VS3-IMP-003 | Implement `packages/schema` canonical contracts from docs | todo | codex | `ExtractedField`, `ComponentContract`, copy/vertical types |
| VS3-IMP-004 | Add additive v3 API routes from updated `docs/plan/30-api.md` | todo | codex | Keep existing `/api/v1` compatibility |
| VS3-IMP-005 | Implement review state transition guard service | todo | codex | Enforce allowed transitions and reason codes |
| VS3-IMP-006 | Implement compose/copy skeleton with bounded slot validation | todo | codex | High-impact `A/B/C`, others `SINGLE` |
| VS3-IMP-007 | Implement publish gate skeleton (quality/security blockers) | todo | codex | Block on P0 and critical/high |
| VS3-IMP-008 | Implement secret-ref metadata model and ACL (`internal_admin`) | todo | codex | Ref naming `tenant.<slug>.<provider>.<key>` |
| VS3-IMP-009 | Implement ops review flow for variant selection and overrides | todo | codex | Internal admin only transitions |
| VS3-IMP-010 | Implement public runtime snapshot rendering skeleton | todo | codex | Dynamic immutable version fetch |
