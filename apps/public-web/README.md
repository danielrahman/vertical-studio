# @vertical-studio/public-web

Public runtime skeleton for v3 immutable snapshot rendering.

## Runtime Flow

1. Resolve active version by host via `GET /api/v1/public/runtime/resolve?host=<host>`.
2. Fetch immutable snapshot by `storageKey` via `GET /api/v1/public/runtime/snapshot/by-storage-key`.
3. If resolve response has no `storageKey`, fallback to compatibility fetch by `siteId+versionId` via `GET /api/v1/public/runtime/snapshot`.
4. If resolve response has neither `storageKey` nor complete `siteId+versionId`, fail with `runtime_resolve_incomplete`.
5. Render snapshot payload into runtime HTML.

## Local Module

`runtime-snapshot-client.js` exports:

1. `resolveRuntimeVersion`
2. `fetchRuntimeSnapshot`
3. `renderRuntimeHtml`
4. `renderSiteFromRuntime`
