# Project State

Last updated: 2026-02-27

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
9. `packages/schema` canonical contracts implemented (TypeScript + Zod) for extraction evidence, vertical standards, component contracts, copy lifecycle, review transition requests, and manual overrides.
10. Additive v3 API route families registered under `/api/v1/*` with deterministic skeleton handlers for tenant, vertical research, component contracts, compose/copy, overrides, review transitions, publish/rollback, cms webhook, and secret refs.

## In Progress

1. Runtime implementation is in early scaffold phase; v3 domain features are not implemented yet.
2. Review transition guard service extraction (`VS3-IMP-005`) is the immediate next execution step.

## Next

1. Implement review state transition guard service with documented reason codes.
2. Implement compose/copy skeleton with bounded slot validation.
3. Implement publish gate skeleton with deterministic blocking reason codes.
4. Implement secret-ref metadata model and ACL (`internal_admin`) beyond current skeleton.
5. Add test harness for documentation acceptance criteria.

## Known Constraints

1. Keep compatibility with existing generation/extraction endpoints.
2. Composition remains deterministic with exactly three curated variants.
3. Competitor data is pattern-level only (`IA + CTA + trust + tone`).
4. Publish must block on quality `P0` and unresolved security `critical/high`.
5. Corpus remains optional and non-blocking in v1.
