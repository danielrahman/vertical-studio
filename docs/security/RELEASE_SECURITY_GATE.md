# Release Security Gate Policy

## Scope
Applied during publish flow for every release candidate.

## Required Inputs
1. Security findings JSON object (schema below).
2. Latest security markdown report for the same release candidate.
3. Current unresolved status per finding.

## Security Findings JSON Schema (Required Input)

```json
{
  "type": "object",
  "required": ["releaseId", "siteId", "versionId", "generatedAt", "findings"],
  "properties": {
    "releaseId": { "type": "string" },
    "siteId": { "type": "string" },
    "versionId": { "type": "string" },
    "generatedAt": { "type": "string", "format": "date-time" },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "findingId",
          "severity",
          "title",
          "description",
          "impact",
          "status",
          "evidence",
          "remediation"
        ],
        "properties": {
          "findingId": { "type": "string" },
          "severity": { "enum": ["critical", "high", "medium", "low"] },
          "title": { "type": "string" },
          "description": { "type": "string" },
          "impact": { "type": "string" },
          "status": { "enum": ["open", "accepted", "resolved"] },
          "evidence": { "type": "array", "items": { "type": "string" } },
          "remediation": { "type": "string" }
        }
      }
    }
  }
}
```

## Blocking Logic
Block publish if any unresolved finding has severity:
1. `critical`
2. `high`

Allow publish (with required action plan) when unresolved findings are only:
1. `medium`
2. `low`

## Required Outputs
1. machine-readable gate result in app state
2. machine-readable gate result artifact in `docs/security/gates/<release-id>.json`
3. human-readable report under `docs/security/*`
4. remediation actions for all unresolved findings

## Owner and Override
1. gate ownership: `internal_admin` + security owner
2. override policy: no override for unresolved `critical/high` in v1

## Validation Rules
1. JSON findings must pass schema validation before gate evaluation.
2. Markdown and JSON findings must reference the same release/version IDs.
3. Gate decision must include deterministic reason codes:
   1. `security_blocked_critical`
   2. `security_blocked_high`
   3. `security_pass_non_blocking_only`
