# Release Security Gate Policy

## Scope
Applied during publish flow for every release candidate.

## Inputs
1. latest security audit report for candidate version
2. finding severities and unresolved statuses

## Blocking Logic
Block publish if any unresolved finding has severity:
1. `critical`
2. `high`

Allow publish (with required action plan) when unresolved findings are only:
1. `medium`
2. `low`

## Required Outputs
1. machine-readable gate result in app state
2. human-readable report under `docs/security/*`
3. remediation actions for all unresolved findings

## Owner and Override
1. gate ownership: internal admin
2. override policy: no override for critical/high in v1

