# Security Best Practices Report

## Executive Summary

This repository has several high-impact security gaps in the API layer. The most serious issues are: (1) unauthenticated access to sensitive operational endpoints and (2) server-side request forgery (SSRF) through user-supplied URLs in extraction workflows. Together, these allow untrusted callers to trigger expensive workloads and potentially reach internal network targets. Additional high/medium risks include unsafe filesystem path handling for generation inputs/outputs, weak secret encryption defaults, missing abuse protections, and verbose error disclosures.

Assumption note: `README.md` describes the system as local-first. If this service is ever reachable beyond a trusted localhost boundary, all Critical/High findings become directly exploitable.

## Critical Findings

### SBP-001: Unauthenticated and unauthorized access to operational API endpoints

- Severity: Critical
- Impact: Any network caller can create jobs, read job results/artifacts, list/update company data, and trigger deploy actions without proving identity.
- Evidence:
  - `[api/routes/v1.js:29](/Users/danielrahman/Desktop/vertical-studio/api/routes/v1.js:29)` through `[api/routes/v1.js:45](/Users/danielrahman/Desktop/vertical-studio/api/routes/v1.js:45)` define all sensitive routes with no auth middleware.
  - `[api/server.js:69](/Users/danielrahman/Desktop/vertical-studio/api/server.js:69)` and `[api/server.js:70](/Users/danielrahman/Desktop/vertical-studio/api/server.js:70)` mount extract alias and v1 router without auth gates.
- Why this violates best practices:
  - Violates server-side auth/authz requirements (aligned with `NEXT-AUTH-001` and general Express secure baseline expectations).
- Recommendation:
  - Introduce authentication (API key, mTLS, or OAuth/JWT depending on deployment model).
  - Enforce authorization per route/action (read vs write vs admin operations).
  - Deny by default and explicitly allow required roles/scopes.

### SBP-002: SSRF via user-controlled URL extraction and browser rendering

- Severity: Critical
- Impact: An attacker can coerce the server to fetch/render arbitrary URLs, including internal services (e.g., cloud metadata/IP-restricted hosts), enabling internal network probing and data access attempts.
- Evidence:
  - URL accepted from request body with only `format: uri`: `[api/validation/extract-request.schema.json:7](/Users/danielrahman/Desktop/vertical-studio/api/validation/extract-request.schema.json:7)` and `[api/validation/extract-request.schema.json:9](/Users/danielrahman/Desktop/vertical-studio/api/validation/extract-request.schema.json:9)`.
  - Extraction job created directly from request URL: `[services/job-service.js:83](/Users/danielrahman/Desktop/vertical-studio/services/job-service.js:83)`.
  - Fetch client performs outbound request directly to supplied URL: `[extraction/extractor/fetch.js:28](/Users/danielrahman/Desktop/vertical-studio/extraction/extractor/fetch.js:28)`.
  - Crawl repeatedly requests discovered URLs on same origin without IP/network guardrails: `[extraction/extractor/crawl.js:120](/Users/danielrahman/Desktop/vertical-studio/extraction/extractor/crawl.js:120)`.
  - Browser renderer navigates to extracted URLs: `[extraction/deep/render.js:205](/Users/danielrahman/Desktop/vertical-studio/extraction/deep/render.js:205)`.
  - Company flows also trigger extraction from user-provided `websiteUrl`: `[services/company-service.js:17](/Users/danielrahman/Desktop/vertical-studio/services/company-service.js:17)`, `[services/extraction-service.js:33](/Users/danielrahman/Desktop/vertical-studio/services/extraction-service.js:33)`.
- Why this violates best practices:
  - Violates `EXPRESS-SSRF-001` / `NEXT-SSRF-001` style requirements for outbound URL restrictions.
- Recommendation:
  - Enforce strict URL allow/deny policy before any outbound request:
    - allow only `http/https`
    - resolve DNS and block loopback, link-local, RFC1918/private, multicast, and cloud metadata ranges
    - re-check resolved IP after redirects (redirect budget + scheme/host policy)
  - Consider egress proxy/network ACLs to enforce SSRF controls at infrastructure level.

## High Findings

### SBP-003: Unconstrained filesystem paths from API input (`input.path`, `output.rootDir`)

- Severity: High
- Impact: Remote callers can cause the service to read arbitrary local JSON files and write job output trees outside intended directories.
- Evidence:
  - Schema permits free-form `input.path` and `output.rootDir`: `[api/validation/generate-request.schema.json:14](/Users/danielrahman/Desktop/vertical-studio/api/validation/generate-request.schema.json:14)`, `[api/validation/generate-request.schema.json:27](/Users/danielrahman/Desktop/vertical-studio/api/validation/generate-request.schema.json:27)`.
  - Resolver accepts absolute paths and reads them: `[worker/input-resolver.js:107](/Users/danielrahman/Desktop/vertical-studio/worker/input-resolver.js:107)` through `[worker/input-resolver.js:116](/Users/danielrahman/Desktop/vertical-studio/worker/input-resolver.js:116)`.
  - Job service resolves caller-supplied output root and writes artifacts there: `[services/job-service.js:38](/Users/danielrahman/Desktop/vertical-studio/services/job-service.js:38)` through `[services/job-service.js:40](/Users/danielrahman/Desktop/vertical-studio/services/job-service.js:40)`, `[services/job-service.js:70](/Users/danielrahman/Desktop/vertical-studio/services/job-service.js:70)`.
- Why this violates best practices:
  - Violates `EXPRESS-FILES-001` / `NEXT-PATH-001` guidance to constrain file access.
- Recommendation:
  - Remove `input.path` from remote API, or constrain it to an allowlisted base directory with canonical path checks.
  - Remove or strictly constrain `output.rootDir` to approved runtime roots.
  - Reject absolute paths and `..` traversal; enforce path containment after `realpath`.

### SBP-004: Secret encryption falls back to a deterministic hardcoded master key

- Severity: High
- Impact: If `secrets.enc.json` is obtained, decryption is trivial when `VERTICAL_SECRET_MASTER_KEY` is unset because fallback key is predictable.
- Evidence:
  - Deterministic fallback key derivation from constant string: `[runtime/secret-store.js:23](/Users/danielrahman/Desktop/vertical-studio/runtime/secret-store.js:23)`.
  - Store initializes with this derived key by default: `[runtime/secret-store.js:53](/Users/danielrahman/Desktop/vertical-studio/runtime/secret-store.js:53)`.
- Why this violates best practices:
  - Conflicts with secret-management expectations (`NEXT-SECRETS-001` style principle: secrets must be strongly protected at rest and in transit).
- Recommendation:
  - Fail fast on startup if no strong key is configured in non-test environments.
  - Use a KMS-managed key or mandatory env-injected 32-byte key.
  - Add key-rotation support and explicit migration path for existing encrypted blobs.

## Medium Findings

### SBP-005: Missing API abuse controls (rate limiting/resource throttling)

- Severity: Medium
- Impact: Attackers can flood costly endpoints (`/extract`, `/generate`) causing DoS, runaway costs, and queue starvation.
- Evidence:
  - Route wiring has no rate-limit middleware or per-route quotas: `[api/server.js:56](/Users/danielrahman/Desktop/vertical-studio/api/server.js:56)`, `[api/routes/v1.js:29](/Users/danielrahman/Desktop/vertical-studio/api/routes/v1.js:29)`, `[api/routes/v1.js:36](/Users/danielrahman/Desktop/vertical-studio/api/routes/v1.js:36)`.
- Why this violates best practices:
  - Violates `EXPRESS-DOS-001` / `NEXT-DOS-001` controls for abuse-prone endpoints.
- Recommendation:
  - Apply per-IP and per-identity rate limits, burst controls, and concurrent job caps.
  - Add queue admission controls and budget-aware circuit breakers for extraction workloads.

### SBP-006: Error responses disclose internal details

- Severity: Medium
- Impact: Attackers can enumerate internals (DB constraint behavior, stack-derived messages, validation details), improving exploitability.
- Evidence:
  - Raw `err.message` and optional `err.details` always returned to clients: `[api/middleware/error-handler.js:18](/Users/danielrahman/Desktop/vertical-studio/api/middleware/error-handler.js:18)`, `[api/middleware/error-handler.js:22](/Users/danielrahman/Desktop/vertical-studio/api/middleware/error-handler.js:22)`.
  - Validation middleware forwards full Ajv errors into response payload: `[api/validation/validate-body.js:19](/Users/danielrahman/Desktop/vertical-studio/api/validation/validate-body.js:19)`.
- Why this violates best practices:
  - Violates `EXPRESS-ERROR-001` / `NEXT-ERROR-001` guidance for production-safe error handling.
- Recommendation:
  - Return generic public error messages in production and log detailed diagnostics server-side only.
  - Gate verbose validation details behind non-production environment checks.

## Additional Observations (Low)

### SBP-007: Overly permissive CORS and missing hardened response headers

- Severity: Low
- Impact: Broadens browser-based abuse surface and weakens defense-in-depth.
- Evidence:
  - CORS `Access-Control-Allow-Origin: *` globally: `[api/server.js:58](/Users/danielrahman/Desktop/vertical-studio/api/server.js:58)`.
  - No `helmet` usage / no explicit header hardening in server bootstrap.
- Why this violates best practices:
  - Misaligned with `EXPRESS-CORS-001`, `EXPRESS-HEADERS-001`, and `EXPRESS-FINGERPRINT-001` recommendations.
- Recommendation:
  - Restrict CORS to explicit trusted origins and methods.
  - Add `helmet` with an explicit policy profile; disable `x-powered-by`.

## Suggested Remediation Order

1. Implement authentication + authorization on all API routes (SBP-001).
2. Add robust SSRF protections for all user-influenced outbound requests (SBP-002).
3. Constrain/remediate filesystem path inputs (`input.path`, `output.rootDir`) (SBP-003).
4. Enforce mandatory strong secret master key and rotation strategy (SBP-004).
5. Add rate limits and workload abuse controls (SBP-005).
6. Reduce public error detail, then harden CORS/headers (SBP-006, SBP-007).

