# Release Security Audit Report (Template)

## Metadata
- Date: `<YYYY-MM-DD>`
- Release ID: `<id>`
- Site ID: `<site-id>`
- Version ID: `<version-id>`
- Auditor: `<name|system>`
- Findings JSON path: `docs/security/findings/<release-id>.json`

## Executive Summary
- Result: `<PASS|FAIL>`
- Blocking gate result: `<BLOCKED|PASSED>`
- Blocking findings count: `<n>`

## Findings JSON Contract (Reference)
Required JSON top-level shape:

```json
{
  "releaseId": "string",
  "siteId": "string",
  "versionId": "string",
  "generatedAt": "ISO-8601",
  "findings": [
    {
      "findingId": "SEC-001",
      "severity": "critical|high|medium|low",
      "title": "string",
      "description": "string",
      "impact": "string",
      "status": "open|accepted|resolved",
      "evidence": ["string"],
      "remediation": "string",
      "owner": "string"
    }
  ]
}
```

## Severity Summary
| severity | count |
|---|---|
| critical | 0 |
| high | 0 |
| medium | 0 |
| low | 0 |

## Findings (Human Readable)
| finding_id | severity | title | impact | evidence | remediation |
|---|---|---|---|---|---|
| SEC-001 | high | Example | Example impact | `<path>` | `<action>` |

## Secret Hygiene Checklist
1. No plaintext secrets in DB snapshots.
2. No plaintext secrets in request/response logs.
3. Secret refs conform to `tenant.<slug>.<provider>.<key>`.
4. Secret mutation operations are internal-admin scoped.

## Gate Decision
1. `critical/high` present and unresolved => publish blocked.
2. `medium/low` only => publish allowed with remediation plan.

## Release Signoff Criteria (Mandatory)
- [ ] Findings JSON file exists and matches contract.
- [ ] Markdown report references the same findings set as JSON.
- [ ] All `critical/high` findings are resolved or release is blocked.
- [ ] Remediation actions are created for non-blocking findings.
- [ ] Security owner and internal admin signoff recorded.

## Remediation Actions
| action_id | finding_id | owner | ETA | status | evidence |
|---|---|---|---|---|---|
| SEC-ACT-001 | SEC-001 | dev | 2026-03-10 | open | `<path>` |
