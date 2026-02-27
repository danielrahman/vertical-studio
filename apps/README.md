# Apps Workspace

This directory is the v3 monorepo surface for runtime applications.

Current migration status:
- `api`: workspace bridge to legacy API runtime under `api/`.
- `worker`: workspace bridge to legacy worker runtime under `worker/`.
- `ops-web`: workspace bridge to current UI runtime under `presentation/`.
- `cms`: scaffold placeholder (not implemented yet).
- `public-web`: scaffold placeholder (not implemented yet).

Compatibility note:
Existing root scripts (`npm run api`, `npm run worker`, `npm run ui`, `npm run dev:full`) remain the primary entry points during migration.
