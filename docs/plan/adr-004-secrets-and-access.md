# ADR-004: Secret References and Access Model

Status: accepted

## Context
The system handles project-level and tenant-level integrations. Secret leakage risk is high if values are stored directly in app tables.

## Decision
1. Production secret values live in provider secret managers.
2. App stores only secret references and metadata.
3. Secret naming convention: `tenant.<slug>.<provider>.<key>`.
4. Secret operations are restricted to `internal_admin`.
5. Secret rotation policy in v1 is on-demand.
6. Secret access and mutation must be audit logged.

## Consequences
Positive:
1. Reduced blast radius in DB compromise scenarios.
2. Cleaner tenant isolation and secret governance.

Negative:
1. Higher setup complexity in environment provisioning.
2. Requires robust provider-integration testing.

