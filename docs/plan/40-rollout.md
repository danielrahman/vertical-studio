# Vertical Studio v3 - Rollout and Delivery

## 1. Rollout Strategy
Mode: phased rollout with hard signoffs per workstream.

Phases:
1. `Phase 1: Internal Platform Readiness`
2. `Phase 2: Pilot Tenants`
3. `Phase 3: Controlled Scale`

No big-bang deployment is allowed.

## 2. Workstream Signoff Checklists (Mandatory)

## WS-A Monorepo and TypeScript Migration
Signoff owners:
1. Tech lead
2. Platform engineer

Checklist:
- [ ] npm workspaces run all apps/packages from root.
- [ ] Shared TypeScript configuration applied.
- [ ] ESLint + Prettier + Vitest baseline works in CI.
- [ ] Legacy compatibility path documented.
- [ ] `docs/status/*` updated.

## WS-B Multi-Tenant Core
Signoff owners:
1. Backend lead
2. Security reviewer

Checklist:
- [ ] tenant/site/membership/version/draft model applied.
- [ ] RBAC matrix implemented for `internal_admin|owner|editor|viewer`.
- [ ] Auth integration tested (Supabase).
- [ ] Audit events emitted for privileged actions.
- [ ] Low-confidence draft behavior documented and tested.

## WS-C Payload CMS Integration
Signoff owners:
1. CMS lead
2. Product owner

Checklist:
- [ ] tenant-scoped collections configured.
- [ ] guardrails enforce constrained editing and reorder.
- [ ] draft -> preview -> publish flow is stable.
- [ ] webhook enqueue behavior tested.
- [ ] legal page template constraints validated.

## WS-D Composition and Copy Engine
Signoff owners:
1. Orchestration lead
2. Internal admin representative

Checklist:
- [ ] compose engine returns exactly 3 deterministic variants.
- [ ] vertical standard input is required and versioned.
- [ ] component contracts are loaded and validated.
- [ ] high-impact copy slots generate exactly 3 candidates.
- [ ] non-high-impact slots run single bounded generation.
- [ ] manual overrides are applied and traceable.

## WS-E Public Runtime
Signoff owners:
1. Frontend lead
2. Reliability reviewer

Checklist:
- [ ] runtime resolves tenant by subdomain.
- [ ] renderer reads immutable snapshot only.
- [ ] rollback points to exact prior version.
- [ ] post-publish owner draft edits do not affect live snapshot.
- [ ] availability and latency baseline measured.

## WS-F Quality and Security Gates
Signoff owners:
1. Quality owner
2. Security owner

Checklist:
- [ ] publish blocks on any quality `P0` fail.
- [ ] publish blocks on unresolved security `critical/high`.
- [ ] quality report includes COPY/LAYOUT/MEDIA/LEGAL gate outcomes.
- [ ] security output includes required JSON + markdown artifacts.
- [ ] release gate reason codes are deterministic.

## WS-G Secrets and Access Hardening
Signoff owners:
1. Security owner
2. Platform engineer

Checklist:
- [ ] only secret references stored in app DB/CMS.
- [ ] plaintext secret values never returned in API payloads.
- [ ] naming standard `tenant.<slug>.<provider>.<key>` enforced.
- [ ] secret operations are `internal_admin` only.
- [ ] rotation runbook and audit trail are present.

## 3. Documentation Completion Tests

## Test 1 - Consistency Test
Pass criteria:
1. Type names and endpoint names match across `00/10/20/30`.
2. State names match architecture and API transition contracts.

## Test 2 - Completeness Test
Pass criteria:
1. Each locked decision from summary is represented in at least one concrete contract.
2. No locked decision is left implicit.

## Test 3 - Gate Test
Pass criteria:
1. Quality docs define blocking rule semantics and reasons.
2. Security docs define blocking rule semantics and reasons.

## Test 4 - Contract Test
Pass criteria:
1. Every core component has a contract template and concrete examples.
2. Slot constraints and fallback behavior are defined.

## Test 5 - Copy Test
Pass criteria:
1. High-impact slot list is explicit.
2. Hard limits and 3-variant policy are explicit.

## Test 6 - Research Test
Pass criteria:
1. Vertical standard method requires 15+ competitors.
2. Pattern extraction scope is explicitly limited.

## Test 7 - Signoff Test
Pass criteria:
1. Every workstream has required signoff checklist with owners.
2. Missing checklist item blocks phase exit.

## Test 8 - Status Test
Pass criteria:
1. `docs/status/PROJECT_STATE.md` reflects active doc workstream status.
2. `docs/status/BACKLOG.md` includes follow-up implementation items.
3. `docs/status/SESSION_LOG.md` includes this documentation revision.

## 4. Acceptance Test Scenarios

### 4.1 Bounded Copy Acceptance
1. Generate copy for draft with mixed slots.
2. Verify high-impact slots have `A/B/C` candidates only.
3. Verify non-high-impact slots have `SINGLE` only.
4. Verify all selected copy respects `maxChars` and `maxLines`.

### 4.2 Manual Override Acceptance
1. Submit overrides (`tone`, `keywords`, required/excluded sections, pinning, required components, excluded patterns).
2. Re-run compose/copy.
3. Confirm output reflects overrides.
4. Confirm override payload is stored and audit-logged.

### 4.3 Vertical Standard Reuse Acceptance
1. Build standard for one vertical.
2. Run compose on two companies in same vertical using same standard version.
3. Validate consistency in IA/CTA/trust/tone routing while preserving company-specific mapping.

### 4.4 Publish Gate Acceptance
1. Trigger publish with synthetic `P0` quality fail and confirm block.
2. Trigger publish with synthetic `high` security finding and confirm block.
3. Trigger publish with only non-blocking findings and confirm publish + action plan requirement.

## 5. Release Signoff Sequence
1. Complete all workstream checklist items.
2. Execute documentation completion tests.
3. Execute acceptance test scenarios.
4. Produce quality and security release artifacts.
5. Record signoff in `docs/status/SESSION_LOG.md`.

## 6. KPI Tracking at Rollout Time
Mandatory KPI snapshot at each phase exit:
1. Proposal generation success rate.
2. Publish gate pass rate after review.
3. Average internal revision rounds before publish.
4. Required slot completeness for CZ+EN.
5. Releases blocked when unresolved P0/critical/high exists.
