# ADR-003: Publish Gates for Quality and Security

Status: accepted

## Context

v3 needs enforceable release quality, not only post-hoc reporting.

## Decision

1. Quality gate blocks publish on any `P0` failure.
2. Security gate blocks publish on any `critical` or `high` finding.
3. Non-blocking findings (`P1/P2`, `medium/low`) generate action-plan tasks.
4. Security audits run per release.
5. Quality artifacts and security artifacts are persisted in docs and app-native records.

## Consequences

Positive:

1. High-confidence publish safety baseline.
2. Clear release outcomes and remediation ownership.

Negative:

1. More failed publish attempts during early adoption.
2. Additional operational discipline required.

