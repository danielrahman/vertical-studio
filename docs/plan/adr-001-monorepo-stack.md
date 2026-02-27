# ADR-001: Monorepo and Core Stack

Status: accepted

## Context
v3 requires coordinated evolution across API, worker, CMS, ops UI, public runtime, and shared contracts.
Single-repo ownership and shared package versioning are required.

## Decision
1. Use npm workspaces monorepo in this repository.
2. Use TypeScript across new v3 surfaces.
3. Keep Express 5 as API framework.
4. Use Drizzle for typed Postgres/Supabase access.
5. Use Zod-first schema with JSON schema export.

## Consequences
Positive:
1. Shared contracts reduce drift.
2. Incremental migration path from existing code.
3. Easier package-level versioning for composition rules/catalog.

Negative:
1. Initial workspace migration complexity.
2. Transitional period with mixed legacy/new modules.

