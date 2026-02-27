# Security Documentation (v3)

This folder contains release security artifacts and templates.

## Files
1. `SECURITY_AUDIT_TEMPLATE.md` - report structure for each release audit.
2. `RELEASE_SECURITY_GATE.md` - gate policy used by publish pipeline.
3. `SECRET_ROTATION_RUNBOOK.md` - required process for tenant secret rotation and audit verification.

## Policy Baseline
1. Audit cadence: per release.
2. Block publish on severity `critical` or `high`.
3. `medium`/`low` findings are non-blocking but require remediation tracking.
4. Secret values are never stored in application tables; only refs and metadata.
