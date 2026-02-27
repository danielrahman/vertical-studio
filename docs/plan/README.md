# Vertical Studio v3 Plan Pack

This folder is the decision-complete technical specification for v3.

## Read Order (Mandatory)
1. `00-summary.md`
2. `10-architecture.md`
3. `20-data-model.md`
4. `30-api.md`
5. `40-rollout.md`
6. `50-component-contracts.md`
7. `60-copy-system.md`
8. `70-vertical-research-standard.md`

## ADR Set
1. `adr-001-monorepo-stack.md`
2. `adr-002-composition-governance.md`
3. `adr-003-quality-security-gates.md`
4. `adr-004-secrets-and-access.md`
5. `adr-005-evidence-confidence-policy.md`
6. `adr-006-component-contracts-and-bounded-copy.md`
7. `adr-007-vertical-intelligence-pattern-policy.md`

## Usage Rules
1. Treat ADRs as locked unless superseded by a newer ADR.
2. Keep `00/10/20/30` naming and contracts consistent.
3. Keep quality/security gate rules synchronized with plan contracts.
4. Update `docs/status/*` whenever documentation decisions change.
