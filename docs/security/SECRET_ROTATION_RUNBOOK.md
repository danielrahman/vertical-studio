# Secret Rotation Runbook (v3)

## Purpose
Define a deterministic, auditable process for rotating tenant integration secrets without exposing plaintext values in application storage.

## Scope
Applies to all secret references following:
`tenant.<slug>.<provider>.<key>`

Example:
`tenant.acme.supabase.service_role`

## Preconditions
1. Rotation requester is `internal_admin`.
2. Secret reference exists in app metadata store.
3. New plaintext value is provisioned directly in provider secret manager (never in app DB).
4. A maintenance window or rollout note is recorded for production rotations.

## Rotation Procedure
1. Identify target ref and impacted site(s).
2. Create new secret value directly in provider manager.
3. Update provider-managed alias/version pointer for the same ref.
4. Verify application can resolve the ref and dependent integration health checks pass.
5. Record rotation result artifact under `docs/security/rotations/<rotation-id>.md`.
6. Confirm privileged audit events are visible via `GET /api/v1/audit/events`.

## Required Audit Trail
Each rotation must produce privileged audit events with at least:
1. `action`
2. `actorRole`
3. `siteId` or tenant context
4. `createdAt`
5. metadata containing rotated secret reference

Audit review path:
`GET /api/v1/audit/events?action=secret_ref_upserted&limit=100`

## Rollback Procedure
1. Repoint provider alias/version to previous known-good secret value.
2. Re-run integration health checks.
3. Record rollback event in the same rotation artifact.
4. Confirm rollback audit event visibility in `GET /api/v1/audit/events`.

## Security Constraints
1. Never store plaintext secret values in app tables.
2. Never return plaintext secret values in API payloads.
3. Keep naming policy enforcement strict (`tenant.<slug>.<provider>.<key>`).
4. Restrict secret mutation and rotation operations to `internal_admin`.

## Rotation Artifact Template
```md
# Rotation <rotation-id>
- Date: <YYYY-MM-DD>
- Operator: <internal_admin user>
- Secret Ref: tenant.<slug>.<provider>.<key>
- Provider: <provider>
- Result: <success|rolled_back|failed>
- Verification: <checks summary>
- Audit Evidence: <event ids or query links>
```
