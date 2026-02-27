# Backlog

## Rules
1. Status must be one of: `todo`, `in_progress`, `blocked`, `done`.
2. Keep highest-priority items at top.

## Items
| id | title | status | owner | notes |
|---|---|---|---|---|
| VS3-012 | Add mandatory commit+push completion step and bootstrap GitHub remote | in_progress | codex | Require commit and push after successful task completion |
| VS3-011 | Add Codex completion self-review gate and PRD/plan/spec/quality read flow | done | codex | Update AGENTS workflow for automatic reflective continuation |
| VS3-001 | Create monorepo workspace structure (`apps/*`, `packages/*`) | todo | codex | Preserve current runtime while scaffolding |
| VS3-002 | Add TS toolchain (tsconfig, eslint, prettier, vitest baseline) | todo | codex | Workspace-wide config |
| VS3-003 | Implement `packages/schema` canonical Zod contracts | todo | codex | Include JSON schema export path |
| VS3-004 | Add additive v3 API routes from `docs/plan/30-api.md` | todo | codex | Keep existing `/api/v1` compatibility |
| VS3-005 | Add tenant/site/version database model migration plan | todo | codex | Postgres/Supabase-first, dev fallback defined |
| VS3-006 | Implement deterministic 3-variant composition prototype | todo | codex | Internal ranking hidden from UI |
| VS3-007 | Implement publish gate skeleton (quality/security blockers) | todo | codex | Block on P0 and critical/high |
| VS3-008 | Implement secret-ref metadata model and ACL (`internal_admin`) | todo | codex | Ref naming `tenant.<slug>.<provider>.<key>` |
| VS3-009 | Implement ops review flow for variant selection | todo | codex | Internal admin only |
| VS3-010 | Implement public runtime snapshot rendering skeleton | todo | codex | Dynamic immutable version fetch |
