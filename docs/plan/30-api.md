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
1. Unknown top-level payload fields are rejected with `400 validation_error`, deterministic `invalidField: payload`, and lexicographically sorted `unknownFields` details.

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
4. If `extractedFields` is provided, it must be an array.
5. `extractedFields` may contain only object items.
6. `extractedFields` items may contain only `fieldPath`, `value`, `sourceUrl`, `method`, `confidence`, `extractedAt`, and `required`; unknown item fields are rejected with `400 validation_error` and lexicographically sorted per-item `unknownFields` details.
7. If `fieldPath` is provided in an `extractedFields` item, it must be a non-empty string.
8. If `sourceUrl` is provided in an `extractedFields` item, it must be a non-empty string or `null`.
9. If `method` is provided in an `extractedFields` item, it must be one of `dom`, `ocr`, `inference`, or `manual`.
10. If `required` is provided in an `extractedFields` item, it must be a boolean.
11. If `confidence` is provided in an `extractedFields` item, it must be a number in range `[0,1]`.
12. If `extractedAt` is provided in an `extractedFields` item, it must be a non-empty ISO-8601 datetime string.
13. If `lowConfidence` is provided, it must be a boolean.
14. If `sitePolicy` is provided, it must be an object.
15. `sitePolicy` may contain only `allowOwnerDraftCopyEdits`; unknown nested fields are rejected with `400 validation_error` and lexicographically sorted `unknownFields` details.
16. If `sitePolicy.allowOwnerDraftCopyEdits` is provided, it must be a boolean; violations return `400 validation_error` with deterministic `invalidField: sitePolicy.allowOwnerDraftCopyEdits`.
17. Unknown top-level payload fields are rejected with `400 validation_error`, deterministic `invalidField: payload`, and lexicographically sorted `unknownFields` details.

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
1. `targetCompetitorCount` must be a numeric integer `>= 15` (string-coerced values are rejected) and violations return `insufficient_competitor_sample` with `minimumTargetCompetitorCount` and `receivedTargetCompetitorCount` details.
2. `sources` must be an array and non-empty, contain only `public_web`, `legal_pages`, and `selected_listings`, and must not include duplicates; unsupported-source validation failures return lexicographically sorted `invalidSources` details and duplicate-source failures return lexicographically sorted `duplicateSources` details.
3. If `sourceDomains` is provided, it must be an array; every entry must be a valid domain hostname and invalid-domain validation failures return deterministically sorted `invalidSourceDomains` details, while duplicate values are rejected after trim/lowercase normalization with lexicographically sorted `duplicateSourceDomains` details.
4. Pattern extraction scope is limited to `IA + CTA + trust + tone`.
5. Unknown top-level payload fields are rejected with `400 validation_error`, deterministic `invalidField: payload`, and lexicographically sorted `unknownFields` details.

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
4. Required request fields `draftId`, `rulesVersion`, `catalogVersion`, and `verticalStandardVersion` must be non-empty strings; missing or non-string values return `400 validation_error` with deterministic metadata (`invalidField`, `expectedType`, `receivedType`).
5. Unknown top-level payload fields are rejected with `400 validation_error`, deterministic `invalidField: payload`, and lexicographically sorted `unknownFields` details.

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
1. Required request fields `draftId` and `proposalId` must be non-empty strings; missing or non-string values return `400 validation_error` with deterministic metadata (`invalidField`, `expectedType`, `receivedType`).
2. Unknown top-level payload fields are rejected with `400 validation_error`, deterministic `invalidField: payload`, and lexicographically sorted `unknownFields` details.

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
4. If `highImpactOnlyThreeVariants` is present, it must be `true` (other values return `400 validation_error` with deterministic `invalidField` details and deterministic type metadata (`expectedType`, `receivedType`)).
5. If `locales` is provided, it must be an array; non-array values return `400 validation_error` with deterministic `invalidField` details and deterministic type metadata (`expectedType`, `receivedType`).
6. If `locales` is provided, every item must be a string; non-string items return `400 validation_error` with deterministic `invalidField` details, deterministic index details (`invalidItemIndexes`), and deterministic item type metadata (`expectedItemType`, `receivedItemTypes`).
7. Duplicate `locales` values are rejected with `400 validation_error` and lexicographically sorted `duplicateLocales` details.
8. `locales` may contain only `cs-CZ` and `en-US`; unsupported locales return `400 validation_error` with deterministic `invalidField` details plus lexicographically sorted `unsupportedLocales` and lexicographically sorted `allowedLocales`.
9. `locales` must include both required locales (`cs-CZ`, `en-US`); missing values return `400 validation_error` with deterministic `missingLocales` details.
10. `verticalStandardVersion` is required for versioned prompt/audit reproducibility; missing or non-string values return `400 validation_error` with deterministic `invalidField` details and deterministic type metadata (`expectedType`, `receivedType`).
11. Unknown top-level payload fields are rejected with `400 validation_error` and deterministic metadata: `invalidField` (`payload`) plus lexicographically sorted `unknownFields` and lexicographically sorted `allowedTopLevelFields`.

#### `GET /api/v1/sites/:siteId/copy/slots?draftId=:id`
Read bounded slot definitions and generation status.

Auth:
1. tenant member
2. `internal_admin`

Validation:
1. `draftId` query param is required and must be a non-empty string; missing or non-string values return `400 validation_error` with deterministic metadata (`invalidField`, `expectedType`, `receivedType`).

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
1. `draftId` is required and must be a string; missing or non-string values return `400 validation_error` with deterministic `invalidField` details and deterministic type metadata (`expectedType`, `receivedType`).
2. Every selection item must include `slotId`, `locale`, and `candidateId`.
3. `candidateId` must resolve to a generated candidate for the draft.
4. Missing candidate lookups return `404 copy_candidate_not_found` with deterministic selection tuple details (`selectionIndex`, `candidateId`, `requestedSlotId`, `requestedLocale`, `slotId`, `locale`).
5. Selected candidate `slotId` and `locale` must match the request tuple.
6. A request must not contain duplicate `slotId`+`locale` tuples.
7. `selections` is required and must be an array; missing or non-array values return `400 validation_error` with deterministic `invalidField` details and deterministic type metadata (`expectedType`, `receivedType`).
8. `selections` must contain at least one item.
9. If `selectedBy` is provided, it must match the authenticated actor role; server-side actor identity remains source of truth.
10. Unknown top-level payload fields and unknown per-selection object fields are rejected with `400 validation_error`; unknown-field detail arrays are lexicographically sorted for deterministic output, top-level unknown-field errors include deterministic `invalidField: payload` and `allowedTopLevelFields` details, and `allowedTopLevelFields` values are sorted lexicographically.
11. Selection-level validation failures for `selections` (empty array, tuple mismatch, duplicate tuple, selectedBy actor mismatch) return deterministic `invalidField` details. Empty-array validation failures include deterministic cardinality metadata (`minimumSelections`, `receivedSelections`). Index metadata is required where a concrete failing tuple exists: missing-candidate errors include `selectionIndex` (Rule 4), tuple-mismatch errors include `selectionIndex` with candidate-vs-request comparison details (`candidateSlotId`, `candidateLocale`, `requestedSlotId`, `requestedLocale`), duplicate-tuple errors include `firstSelectionIndex` and `duplicateSelectionIndex`, and selectedBy actor-mismatch errors include `selectionIndex` with deterministic role-mismatch metadata (`expectedSelectedBy`, `receivedSelectedBy`).
12. Per-item `selections` validation failures (item type, unknown fields, missing/invalid `slotId|locale|candidateId`, invalid `selectedBy`) return deterministic `invalidField` details using index-aware paths (for example `selections[0].locale`) and deterministic `selectionIndex` for the failing item. Item-type, `slotId`, `locale`, `candidateId`, and `selectedBy` validation failures include deterministic type metadata (`expectedType`, `receivedType`); unknown per-item fields include deterministic `allowedSelectionFields` details with lexicographically sorted values, invalid locale values include deterministic `allowedLocales` details with lexicographically sorted values, and invalid `selectedBy` values include deterministic `allowedSelectedByRoles` details with lexicographically sorted values.

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
1. Required request field `draftId` must be a non-empty string; missing or non-string values return `400 validation_error` with deterministic metadata (`invalidField`, `expectedType`, `receivedType`).
2. Override fields in this payload are arrays of non-empty strings when provided (values are trimmed before validation/storage); non-array values return `400 invalid_override_payload` with deterministic type metadata (`invalidField`, `expectedType`, `receivedType`), non-string item values return deterministic item-type metadata (`invalidField`, `invalidItemIndexes`, `expectedItemType`, `receivedItemTypes`), and blank-value validation failures include deterministic `invalidField` and `invalidIndexes` details.
3. `requiredSections`, `excludedSections`, and `pinnedSections` must use allowed section keys (`hero`, `value_props`, `about`, `process`, `timeline`, `portfolio`, `team`, `testimonials`, `stats`, `faq`, `cta`, `contact`, `legal`); unknown values return `400 invalid_override_payload` with deterministic `invalidField`, lexicographically sorted `unknownSections` details, and lexicographically sorted `allowedSectionKeys` metadata.
4. Override arrays must not contain duplicate values; duplicate-value validation failures return deterministic `invalidField`, lexicographically sorted `duplicateValues` details, and deterministic `duplicateIndexes` metadata.
5. At least one override array must be present with at least one value (no-op override payloads are rejected with `400 invalid_override_payload` and lexicographically sorted `fields` details, plus deterministic cardinality metadata `minimumNonEmptyOverrideArrays` and `receivedNonEmptyOverrideArrays`).
6. `requiredSections` must not overlap with `excludedSections`; overlap validation failures return deterministic `invalidField: requiredSections` plus lexicographically sorted `conflictingSections` details.
7. `pinnedSections` must not overlap with `excludedSections`; overlap validation failures return deterministic `invalidField: pinnedSections` plus lexicographically sorted `conflictingSections` details.
8. `requiredComponents` must reference loaded component contract IDs; unknown IDs return `400 invalid_override_payload` with deterministic `invalidField: requiredComponents`, lexicographically sorted `unknownComponentIds` details, and lexicographically sorted `allowedComponentIds` metadata.
9. Unknown top-level payload fields (outside `draftId` and override arrays) are rejected with `400 invalid_override_payload`, deterministic `invalidField: payload`, lexicographically sorted `unknownFields` details, and lexicographically sorted `allowedTopLevelFields` metadata.

### 4.7 Review State Lifecycle

#### `POST /api/v1/sites/:siteId/review/transition`
Apply explicit review state transition.

Auth:
1. `internal_admin`

Validation:
1. Required request fields `draftId`, `fromState`, `toState`, and `event` must be non-empty strings; missing or non-string values return `400 validation_error` with deterministic metadata (`invalidField`, `expectedType`, `receivedType`).
2. Only allowed transitions from architecture state machine are accepted.
3. Invalid transitions return `409 invalid_transition`.
4. Unknown top-level payload fields are rejected with `400 validation_error`, deterministic `invalidField: payload`, and lexicographically sorted `unknownFields` details.

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
1. Required request fields `draftId` and `proposalId` must be non-empty strings; missing or non-string values return `400 validation_error` with deterministic metadata (`invalidField`, `expectedType`, `receivedType`).
2. Unknown top-level payload fields are rejected with `400 validation_error`, deterministic `invalidField: payload`, and lexicographically sorted `unknownFields` details.

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
1. Unknown top-level payload fields are rejected with `400 validation_error`, deterministic `invalidField: payload`, and lexicographically sorted `unknownFields` details.

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
3. Unknown top-level payload fields are rejected with `400 validation_error`, deterministic `invalidField: payload`, lexicographically sorted `unknownFields` details, deterministic `unknownTopLevelFieldCount`, deterministic sorted `unknownTopLevelFieldIndexes` metadata (indexes into sorted `receivedTopLevelFields`), deterministic `receivedTopLevelFieldCount`, deterministic sorted `receivedTopLevelFields` metadata, deterministic sorted `allowedTopLevelFieldIndexes` metadata (indexes into sorted `receivedTopLevelFields`), deterministic sorted `receivedAllowedTopLevelFields` metadata, deterministic sorted `receivedAllowedTopLevelFieldIndexes` metadata (indexes into sorted `allowedTopLevelFields`), deterministic `receivedAllowedTopLevelFieldCount`, deterministic `allowedTopLevelFieldCount`, and lexicographically sorted `allowedTopLevelFields` metadata.

#### `POST /api/v1/secrets/refs`
Create/update secret metadata reference.

Auth:
1. `internal_admin`

Contract:
1. Store reference and metadata only.
2. Never store or return plaintext secret values.
3. Unknown top-level payload fields are rejected with `400 validation_error`, deterministic `invalidField: payload`, lexicographically sorted `unknownFields` details, deterministic sorted `receivedUnknownTopLevelFields`, deterministic `receivedUnknownTopLevelFieldCount`, deterministic `unknownTopLevelFieldCount`, deterministic sorted `unknownTopLevelFieldIndexes` metadata (indexes into sorted `receivedTopLevelFields`), deterministic `receivedTopLevelFieldCount`, lexicographically sorted `receivedTopLevelFields` metadata, deterministic sorted `allowedTopLevelFieldIndexes` metadata (indexes into sorted `receivedTopLevelFields`), deterministic sorted `receivedAllowedTopLevelFields`, deterministic sorted `receivedAllowedTopLevelFieldIndexes` metadata (indexes into sorted `allowedTopLevelFields`), deterministic sorted `missingAllowedTopLevelFields`, deterministic sorted `missingAllowedTopLevelFieldIndexes` metadata (indexes into sorted `allowedTopLevelFields`), deterministic `missingAllowedTopLevelFieldCount`, deterministic `receivedAllowedTopLevelFieldCount`, deterministic `allowedTopLevelFieldCount`, and lexicographically sorted `allowedTopLevelFields` metadata.
4. Secret-ref required-field `validation_error` responses (`ref`, `tenantId`) include deterministic metadata (`invalidField`, `expectedType`, `receivedType`); invalid `ref` format validation includes deterministic `expectedFormat` and `receivedRef` metadata; segment checks (`provider`, `key`, and `tenantSlug` when provided) include deterministic `invalidField` and deterministic type metadata (`expectedType`, `receivedType`), and invalid string-shape segment values include deterministic `expectedPattern` and `receivedValue` metadata.
5. Secret-ref segment mismatch responses (`provider`, `key`, `tenantSlug`) include deterministic mismatch metadata (`expectedSegment`, `receivedSegment`) alongside `invalidField`.
6. Reassigning an existing secret ref to a different `tenantId` is rejected with `409 secret_ref_conflict` and deterministic conflict metadata (`invalidField: tenantId`, `expectedTenantId`, `receivedTenantId`).
7. Plaintext secret payload-key rejection (`value`, `secret`, `secretValue`, `plaintext`, `token`, `apiKey`, `privateKey`) uses deterministic `invalidField` metadata for the offending key, deterministic `receivedType` metadata for the offending value, and lexicographically sorted `forbiddenKeys` metadata.

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
4. `GET /api/v1/public/runtime/resolve` requires a non-empty `host` (query or host header fallback); missing or non-string values return `400 validation_error` with deterministic metadata (`invalidField`, `expectedType`, `receivedType`).
5. `GET /api/v1/public/runtime/snapshot/by-storage-key` requires a non-empty `storageKey` query; missing or non-string values return `400 validation_error` with deterministic metadata (`invalidField`, `expectedType`, `receivedType`).
6. Compatibility path `GET /api/v1/public/runtime/snapshot` requires non-empty `siteId` and `versionId` queries; missing or non-string values return `400 validation_error` with deterministic metadata (`invalidField`, `expectedType`, `receivedType`).
7. Publish-time immutable snapshot generation must prefer selected copy-candidate text for mapped runtime slots (`hero.h1` -> `hero.slots.h1`, `hero.subhead` -> `hero.slots.subhead`, `hero.primary_cta_label` -> `hero.slots.primaryCtaLabel`, `value_props.intro` -> `value_props.slots.intro`, `about.intro` -> `about.slots.intro`, `process.step_1_title` -> `process.slots.step1Title`, `faq.q1` -> `faq.slots.question1`, `contact.primary_cta_label` -> `contact.slots.primaryCtaLabel`) when draft selections exist; otherwise fallback placeholder copy remains unchanged.

## 7. LLM Prompt Contract Surfaces (Documented API Inputs)
1. Compose and copy jobs must pass structured prompt payloads, not free text blobs.
2. Prompt payload must include:
   1. `verticalStandardVersion`
   2. `componentContractVersions`
   3. `slotDefinitions`
   4. `manualOverrides`
   5. `disallowedPatterns`
3. Prompt payload must be persisted for reproducibility in audit logs.
