# @vertical-studio/public-web

Public runtime skeleton for v3 immutable snapshot rendering.

## Runtime Flow

1. Resolve active version by host via `GET /api/v1/public/runtime/resolve?host=<host>`.
2. Fetch immutable snapshot by `{siteId, versionId}` via `GET /api/v1/public/runtime/snapshot`.
3. Render snapshot payload into runtime HTML.

## Local Module

`runtime-snapshot-client.js` exports:

1. `resolveRuntimeVersion`
2. `fetchRuntimeSnapshot`
3. `renderRuntimeHtml`
4. `renderSiteFromRuntime`
