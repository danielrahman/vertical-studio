# Vertical Studio v3 - API Contract

## 1. Scope and Compatibility
1. Existing v2 endpoints remain available and are mapped to v3 intake flow:
   1. `POST /api/v1/generate`
   2. `POST /api/v1/extract`
   3. `POST /api/v1/deploy`
   4. `POST/GET/PUT /api/v1/companies`
2. New endpoints are additive and must be implemented under `api/v1/*`.
3. All new contracts are TypeScript-first and aligned with `packages/schema`.

## 2. Cross-Cutting API Rules
1. Auth is required for all non-public endpoints.
2. Authorization is tenant-scoped RBAC: `internal_admin`, `owner`, `editor`, `viewer`.
3. Mutating orchestration endpoints are `internal_admin` only unless explicitly stated.
4. All mutating endpoints must emit audit events.
5. Error envelope is mandatory:

```json
{
  "code": "string_code",
  "message": "human readable",
  "requestId": "uuid",
  "details": {}
}
```

## 3. Boundary Types (API-Level)

### 3.1 `ExtractedField<T>`
```ts
type ExtractedField<T> = {
  value: T | null;
  sourceUrl: string | null;
  method: "dom" | "ocr" | "inference" | "manual";
  confidence: number;
  extractedAt: string;
  todo: boolean;
};
```

### 3.2 `ComponentContract`
```ts
type ComponentContract = {
  componentId: string;
  version: string;
  propsSchema: object;
  requiredFields: string[];
  maxLengths: Record<string, number>;
  fallbackPolicy: Record<string, string>;
  allowedVariants: string[];
  seoA11yRequirements: string[];
};
```

### 3.3 `CopySlotDefinition` and `CopyCandidate`
```ts
type CopySlotDefinition = {
  slotId: string;
  sectionType: string;
  highImpact: boolean;
  maxChars: number;
  maxLines: number;
  localeRequired: ("cs-CZ" | "en-US")[];
};

type CopyCandidate = {
  slotId: string;
  locale: "cs-CZ" | "en-US";
  variantKey: "A" | "B" | "C" | "SINGLE";
  text: string;
  withinLimits: boolean;
  recommended: boolean;
};
```

### 3.4 `VerticalStandard` and `CompetitorPattern`
```ts
type VerticalStandard = {
  id: string;
  verticalKey: string;
  version: string;
  competitorCount: number;
  sourcePolicy: "public_web_legal_selected_listings";
  iaPatterns: string[];
  ctaPatterns: string[];
  trustPatterns: string[];
  toneLexicon: string[];
  doRules: string[];
  dontRules: string[];
  createdAt: string;
};

type CompetitorPattern = {
  id: string;
  verticalStandardId: string;
  sourceDomain: string;
  patternType: "ia" | "cta" | "trust" | "tone";
  patternJson: object;
};
```

### 3.5 `ReviewState` Transition Contract
```ts
type ReviewState =
  | "draft"
  | "proposal_generated"
  | "review_in_progress"
  | "proposal_selected"
  | "quality_checking"
  | "security_checking"
  | "publish_blocked"
  | "published"
  | "rollback_pending"
  | "rolled_back";

type ReviewTransitionRequest = {
  draftId: string;
  fromState: ReviewState;
  toState: ReviewState;
  event:
    | "PROPOSALS_READY"
    | "REVIEW_STARTED"
    | "PROPOSAL_SELECTED"
    | "QUALITY_STARTED"
    | "QUALITY_FAILED"
    | "QUALITY_PASSED"
    | "SECURITY_FAILED"
    | "SECURITY_PASSED"
    | "ROLLBACK_REQUESTED"
    | "ROLLBACK_COMPLETED";
  reason?: string;
};
```

## 4. Endpoint Families

### 4.1 Tenant and Site Lifecycle

#### `POST /api/v1/tenants`
Create tenant.

Auth:
1. `internal_admin`

Validation:
1. Unknown top-level payload fields are rejected with `400 validation_error`.

#### `GET /api/v1/tenants/:tenantId`
Read tenant detail.

Auth:
1. tenant member
2. `internal_admin`

#### `POST /api/v1/sites/:siteId/bootstrap-from-extraction`
Bootstrap site draft from extraction output.

Auth:
1. `internal_admin`

Contract:
1. Store extracted fields as `ExtractedField<T>`.
2. If confidence below threshold, set `todo=true` and keep `value` empty.
3. Set `site_drafts.low_confidence=true` when any required field is TODO.
4. Unknown top-level payload fields are rejected with `400 validation_error`.

### 4.2 Vertical Intelligence Lifecycle

#### `POST /api/v1/verticals/:verticalKey/research/build`
Build or refresh a vertical standard.

Auth:
1. `internal_admin`

Request:
```json
{
  "targetCompetitorCount": 15,
  "sources": ["public_web", "legal_pages", "selected_listings"],
  "sourceDomains": ["example-1.com", "example-2.com"]
}
```

Response `202`:
```json
{
  "verticalKey": "boutique-developers",
  "jobId": "uuid",
  "status": "queued"
}
```

Validation:
1. `targetCompetitorCount` must be a numeric integer `>= 15` (string-coerced values are rejected).
2. `sources` must be an array and non-empty, contain only `public_web`, `legal_pages`, and `selected_listings`, and must not include duplicates.
3. If `sourceDomains` is provided, it must be an array; every entry must be a valid domain hostname and duplicate values are rejected after trim/lowercase normalization.
4. Pattern extraction scope is limited to `IA + CTA + trust + tone`.
5. Unknown top-level payload fields are rejected with `400 validation_error`.

#### `GET /api/v1/verticals/:verticalKey/research/latest`
Return latest research run summary and references.

Auth:
1. tenant member
2. `internal_admin`

#### `GET /api/v1/verticals/:verticalKey/standards/:version`
Return a concrete `VerticalStandard` and linked `CompetitorPattern[]`.

Auth:
1. tenant member
2. `internal_admin`

### 4.3 Component Contract Lifecycle

#### `GET /api/v1/component-contracts`
List available component contracts.

Auth:
1. tenant member
2. `internal_admin`

Query:
1. `catalogVersion` (optional)
2. `componentIds` (optional)

Behavior:
1. If `catalogVersion` is provided, return only contracts in that catalog version.

#### `GET /api/v1/component-contracts/:componentId/:version`
Read component contract definition.

Auth:
1. tenant member
2. `internal_admin`

### 4.4 Composition Lifecycle

#### `POST /api/v1/sites/:siteId/compose/propose`
Generate deterministic curated proposals.

Auth:
1. `internal_admin`

Request:
```json
{
  "draftId": "uuid",
  "rulesVersion": "1.0.0",
  "catalogVersion": "1.0.0",
  "verticalStandardVersion": "2026.02"
}
```

Response:
```json
{
  "draftId": "uuid",
  "variants": [
    { "proposalId": "uuid", "variantKey": "A" },
    { "proposalId": "uuid", "variantKey": "B" },
    { "proposalId": "uuid", "variantKey": "C" }
  ]
}
```

Hard rules:
1. Exactly three variants must always be returned.
2. Deterministic output for identical input payload and versions.
3. Requested `catalogVersion` must resolve to at least one loaded component contract (`404 component_contract_not_found` otherwise).
4. Unknown top-level payload fields are rejected with `400 validation_error`.

#### `POST /api/v1/sites/:siteId/compose/select`
Select one proposal as final composition.

Auth:
1. `internal_admin`

Request:
```json
{
  "draftId": "uuid",
  "proposalId": "uuid"
}
```

Rules:
1. Unknown top-level payload fields are rejected with `400 validation_error`.

### 4.5 Copy Lifecycle

#### `POST /api/v1/sites/:siteId/copy/generate`
Generate copy candidates for draft slots.

Auth:
1. `internal_admin`

Request:
```json
{
  "draftId": "uuid",
  "verticalStandardVersion": "2026.02",
  "locales": ["cs-CZ", "en-US"],
  "highImpactOnlyThreeVariants": true
}
```

Response:
```json
{
  "draftId": "uuid",
  "slotsGenerated": 28,
  "highImpactSlots": 6,
  "candidateCounts": {
    "A": 6,
    "B": 6,
    "C": 6,
    "SINGLE": 22
  }
}
```

Rules:
1. High-impact slots must generate `A/B/C` candidates.
2. Non-high-impact slots must generate one `SINGLE` candidate.
3. Every candidate must satisfy slot hard limits before response finalization.
4. If `highImpactOnlyThreeVariants` is present, it must be `true` (other values return `400 validation_error`).
5. `locales` may contain only `cs-CZ` and `en-US`; unsupported locales return `400 validation_error`.
6. `verticalStandardVersion` is required for versioned prompt/audit reproducibility.
7. Unknown top-level payload fields are rejected with `400 validation_error`.

#### `GET /api/v1/sites/:siteId/copy/slots?draftId=:id`
Read bounded slot definitions and generation status.

Auth:
1. tenant member
2. `internal_admin`

#### `POST /api/v1/sites/:siteId/copy/select`
Select recommended or manual copy candidate per slot and locale.

Auth:
1. `internal_admin`
2. `owner` (only if site policy allows post-selection copy edits in draft)

Request:
```json
{
  "draftId": "uuid",
  "selections": [
    {
      "slotId": "hero.h1",
      "locale": "cs-CZ",
      "candidateId": "uuid",
      "selectedBy": "internal_admin"
    }
  ]
}
```

Rules:
1. Every selection item must include `slotId`, `locale`, and `candidateId`.
2. `candidateId` must resolve to a generated candidate for the draft.
3. Selected candidate `slotId` and `locale` must match the request tuple.
4. A request must not contain duplicate `slotId`+`locale` tuples.
5. `selections` must contain at least one item.
6. If `selectedBy` is provided, it must match the authenticated actor role; server-side actor identity remains source of truth.
7. Unknown top-level payload fields and unknown per-selection object fields are rejected with `400 validation_error`.

### 4.6 Manual Override Lifecycle

#### `POST /api/v1/sites/:siteId/overrides`
Submit internal manual override directives used by compose/copy pipeline.

Auth:
1. `internal_admin`

Request:
```json
{
  "draftId": "uuid",
  "tone": ["credible", "calm", "precise"],
  "keywords": ["development", "delivery", "trust"],
  "requiredSections": ["hero", "portfolio", "contact"],
  "excludedSections": ["timeline"],
  "pinnedSections": ["hero", "contact"],
  "requiredComponents": ["cards-3up", "cta-form"],
  "excludedCompetitorPatterns": ["aggressive-discount-banner"]
}
```

Rules:
1. Override fields in this payload are arrays of non-empty strings when provided (values are trimmed before validation/storage).
2. `requiredSections`, `excludedSections`, and `pinnedSections` must use allowed section keys (`hero`, `value_props`, `about`, `process`, `timeline`, `portfolio`, `team`, `testimonials`, `stats`, `faq`, `cta`, `contact`, `legal`); unknown values return `400 invalid_override_payload`.
3. Override arrays must not contain duplicate values.
4. At least one override array must be present with at least one value (no-op override payloads are rejected with `400 invalid_override_payload`).
5. `requiredSections` must not overlap with `excludedSections`.
6. `pinnedSections` must not overlap with `excludedSections`.
7. `requiredComponents` must reference loaded component contract IDs; unknown IDs return `400 invalid_override_payload`.
8. Unknown top-level payload fields (outside `draftId` and override arrays) are rejected with `400 invalid_override_payload`.

### 4.7 Review State Lifecycle

#### `POST /api/v1/sites/:siteId/review/transition`
Apply explicit review state transition.

Auth:
1. `internal_admin`

Validation:
1. Only allowed transitions from architecture state machine are accepted.
2. Invalid transitions return `409 invalid_transition`.
3. Unknown top-level payload fields are rejected with `400 validation_error`.

### 4.8 Publish Lifecycle

#### `POST /api/v1/sites/:siteId/publish`
Publish immutable version.

Auth:
1. `internal_admin`

Request:
```json
{
  "draftId": "uuid",
  "proposalId": "uuid",
  "runQuality": true,
  "runSecurityAudit": true
}
```

Blocking rules:
1. Block on any quality `P0` fail.
2. Block on any unresolved security `critical/high` finding.

Validation:
1. Unknown top-level payload fields are rejected with `400 validation_error`.

Response `200`:
```json
{
  "siteId": "uuid",
  "versionId": "uuid",
  "status": "published",
  "blocked": false
}
```

Response `409`:
```json
{
  "siteId": "uuid",
  "status": "blocked",
  "reasons": ["quality_p0_failed", "security_high_found"]
}
```

#### `POST /api/v1/sites/:siteId/rollback/:versionId`
Rollback to prior immutable version.

Auth:
1. `internal_admin`

Validation:
1. Unknown top-level payload fields are rejected with `400 validation_error`.

#### `GET /api/v1/sites/:siteId/versions`
List version history and active version pointer.

Auth:
1. tenant member
2. `internal_admin`

#### `GET /api/v1/sites/:siteId/quality/latest`
Read latest quality report.

#### `GET /api/v1/sites/:siteId/security/latest`
Read latest security report.

### 4.9 CMS and Secrets Lifecycle

#### `POST /api/v1/cms/webhooks/publish`
Payload publish webhook ingress.

Auth:
1. Signed webhook verification required.

Behavior:
1. Queue asynchronous publish-preparation job.
2. Never perform direct synchronous publish.
3. Unknown top-level payload fields are rejected with `400 validation_error`.

#### `POST /api/v1/secrets/refs`
Create/update secret metadata reference.

Auth:
1. `internal_admin`

Contract:
1. Store reference and metadata only.
2. Never store or return plaintext secret values.
3. Unknown top-level payload fields are rejected with `400 validation_error`.

## 5. Error Codes
Required additional codes:
1. `invalid_transition`
2. `insufficient_competitor_sample`
3. `invalid_override_payload`
4. `slot_limit_violation`
5. `low_confidence_review_required`
6. `component_contract_not_found`
7. `copy_candidate_not_found`
8. `publish_blocked_quality`
9. `publish_blocked_security`

## 6. Public Runtime Resolution Contract
1. Public renderer resolves host/subdomain to active `site_version`.
2. Renderer fetches immutable snapshot by storage key only.
3. Renderer must never read mutable draft data.

## 7. LLM Prompt Contract Surfaces (Documented API Inputs)
1. Compose and copy jobs must pass structured prompt payloads, not free text blobs.
2. Prompt payload must include:
   1. `verticalStandardVersion`
   2. `componentContractVersions`
   3. `slotDefinitions`
   4. `manualOverrides`
   5. `disallowedPatterns`
3. Prompt payload must be persisted for reproducibility in audit logs.
