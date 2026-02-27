# Vertical Studio v3 - Program Summary

## Mission
Vertical Studio v3 must operate as a repeatable vertical orchestrator:
1. understand a chosen market vertical from public signals,
2. derive reusable vertical standards from that understanding,
3. map a concrete company into those standards,
4. compose a buildable website specification from prebuilt components,
5. ship publish-safe outputs through strict quality and security gates.

The system must not clone competitor websites. It must extract reusable patterns only.

## Product Objective
For each target company, produce an implementation-ready web spec:
1. deterministic structure and component composition,
2. bounded content slots,
3. controlled style variants,
4. explicit conversion logic,
5. immutable publish artifact.

## Core Outcome Contract
1. Extraction bootstraps a draft.
2. Composition engine outputs exactly 3 curated variants.
3. Internal admin performs final variant selection.
4. Owner/editor keep post-selection content control inside guardrails.
5. Public site renders from immutable published snapshots.
6. Publish blocks on quality `P0` and security `critical/high`.

## Scope In (v1)
1. Monorepo migration using npm workspaces.
2. TypeScript-first architecture for apps and shared packages.
3. Multi-tenant platform model with role-based access.
4. Vertical research and vertical standard documentation contract.
5. Full component contract schema model.
6. High-impact copy 3-variant system with bounded slot limits.
7. Strict manual override model for internal admin control.
8. Quality and security release gates with artifact outputs.

## Scope Out (v1)
1. A/B experimentation framework.
2. Automatic recomposition after publish.
3. Custom domains (subdomain-first only).
4. Forced migration of legacy v2 records.
5. Corpus-heavy module in critical path (corpus is optional and minimal in v1).

## Locked Product Decisions
1. Composition is deterministic and always emits 3 variants.
2. Competitor analysis is pattern-only (`IA + CTA + trust + tone`).
3. Vertical research baseline is 15+ competitors.
4. Vertical sources: public web + legal pages + selected listings.
5. Components use full contract schema (props, constraints, fallbacks, SEO/a11y).
6. Copy 3-variant generation is high-impact slots only.
7. Low-confidence extraction behavior is empty field + TODO marker.
8. Manual overrides include full control set (tone, keywords, required/excluded sections, pinning, required components, excluded patterns).
9. Approval flow is state-driven and explicit.
10. Slot limits are hard constraints with quality impact.
11. LLM prompt contracts are documented.
12. Security outputs are required as JSON + markdown.
13. Security gate blocks on `critical/high`.
14. Corpus remains optional and non-blocking in v1.

## User Roles
1. `internal_admin`
2. `owner`
3. `editor`
4. `viewer`

## Publish Gate Contract
1. Block publish if any quality `P0` check fails.
2. Block publish if any unresolved security finding is `critical` or `high`.
3. Non-blocking findings still require action-plan entries.

## KPI Targets (v1 Operating Baseline)
1. Proposal generation success rate: >= 95%.
2. Publish gate pass rate after internal review: >= 80%.
3. Average internal revision rounds before publish: <= 2.
4. Required slot completeness (CZ+EN) at publish: 100%.
5. Blocked release without unresolved P0/critical/high: 100%.

## Definition of Done
1. `docs/plan`, `docs/quality`, `docs/security` are decision-complete and mutually consistent.
2. Every locked decision is represented by concrete contracts (data/API/rules/checklists).
3. Implementation can be delegated without architectural or policy ambiguity.
