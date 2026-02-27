# Vertical Studio v2

Layered, fully functional local-first application for asynchronous website generation:

- Presentation layer: Next.js 14 ops dashboard (`presentation/`)
- Generation layer: existing generator engine + registries + asset normalization
- Data layer: SQLite repositories (`jobs`, `companies`, `deployments`, `events`)
- Extraction layer: web scraper (`fetch` + `cheerio`) + AI enrichment fallback
- Infrastructure layer: FS queue, local deploy adapter, Vercel adapter, S3/Cloudflare stub

## Run

Install dependencies:

```bash
npm install
```

Create local configuration:

```bash
cp .env.example .env.local
cp config/secrets.example.json config/secrets.json
```

Run complete stack (API + worker + UI):

```bash
npm run dev:full
```

Individual processes:

```bash
npm run api
npm run worker
npm run ui
```

## API Endpoints (v1)

Implemented:

- `POST /api/v1/generate`
- `GET /api/v1/generate/:jobId/status`
- `GET /api/v1/previews`
- `GET /api/v1/previews/:jobId/config`
- `GET /api/v1/analytics`
- `GET /api/v1/health`
- `POST /api/v1/deploy`
- `POST /api/v1/companies`
- `GET /api/v1/companies`
- `PUT /api/v1/companies/:id`
- `POST /api/v1/extract` (async forensic extraction job)
- `POST /api/extract` (alias)
- `GET /api/v1/extract/jobs/:jobId`
- `GET /api/v1/extract/jobs/:jobId/result`
- `GET /api/v1/extract/jobs/:jobId/artifacts`
- `GET /api/v1/extract/jobs/:jobId/artifacts/:artifactId`
- `POST /api/v1/extract/jobs/:jobId/cancel`

## Runtime + Persistence

- Queue backend: filesystem (`.runtime/queue`)
- Source of truth: SQLite (`.runtime/vertical-studio.sqlite`)
- Output artifacts: `build-output/jobs/<jobId>/...`
- Local deployments: `.runtime/deployments/local/<deploymentId>/...`

## Environment Variables

- `PORT=3000`
- `VERTICAL_RUNTIME_DIR=.runtime`
- `VERTICAL_OUTPUT_ROOT=build-output/jobs`
- `VERTICAL_WORKER_POLL_MS=500`
- `VERTICAL_PREVIEW_BASE_URL` (optional)
- `VERTICAL_SQLITE_PATH` (optional, overrides DB file)
- `VERTICAL_UI_BASE_URL` (optional, used by local deploy preview URL)
- `VERTICAL_REQUIRE_AUTH` (optional; `true` enforces API key auth, defaults to `true` in production)
- `VERTICAL_API_KEYS` (optional comma-separated API keys accepted via `x-api-key` or `Authorization: Bearer ...`)
- `VERTICAL_API_KEY` (optional single-key shortcut when `VERTICAL_API_KEYS` is not set)
- `OPENAI_API_KEY` (optional, enrichment without this uses fallback)
- `EXA_API_KEY` (optional off-site Exa people/PR/competitive intelligence)
- `SERPAPI_API_KEY` (optional off-site SERP/PR/maps modules)
- `COMPANY_DATA_API_KEY` (optional reserved provider connector)
- `SOCIAL_ENRICH_API_KEY` (optional reserved provider connector)
- `CAPTCHA_API_KEY` (optional fallback for captcha provider; supports reCAPTCHA/hCaptcha/Turnstile)
- `VERTICAL_SECRET_MASTER_KEY` (recommended for encrypted secret store)
- `VERTICAL_SECRET_MAP_JSON` (optional ref->secret map override)
- `VERTICAL_SECRET_MAP_FILE` (optional path to JSON map, e.g. `config/secrets.json`)
- `VERTICAL_SECRET_REF_<REF_NAME>` (optional per-ref fallback, e.g. `VERTICAL_SECRET_REF_CAPTCHA_2CAPTCHA`)
- `VERCEL_TOKEN` + `VERCEL_PROJECT_ID` (enables Vercel deploy adapter)
- `NODE_ENV`

API and worker scripts automatically load `.env`, `.env.local`, `.env.<NODE_ENV>`, `.env.<NODE_ENV>.local` from repository root.

### API authentication

When auth is enabled (`VERTICAL_REQUIRE_AUTH=true`, or any API key is configured), all `/api/*` endpoints require a key:

```bash
curl -H "x-api-key: YOUR_KEY" http://localhost:3000/api/v1/health
curl -H "Authorization: Bearer YOUR_KEY" http://localhost:3000/api/v1/health
```

### Recommended secret workflow

You can use either of these clean patterns:

1. `.env.local` only:
`VERTICAL_SECRET_REF_CAPTCHA_2CAPTCHA=...`
`VERTICAL_SECRET_REF_OFFSITE_SERPAPI=...`
`VERTICAL_SECRET_REF_AUTH_CLIENT={"username":"...","password":"..."}`
2. File map:
keep keys in `config/secrets.json` (gitignored) and set `VERTICAL_SECRET_MAP_FILE=config/secrets.json`.

In both cases, send only references (`apiKeyRef`, `serpapiRef`, `credentialRef`) in API payloads.

Secret lookup order is:
1. `VERTICAL_SECRET_MAP_JSON`
2. `VERTICAL_SECRET_MAP_FILE`
3. `VERTICAL_SECRET_REF_<REF_NAME>` fallback
4. encrypted runtime store (`.runtime/secrets/secrets.enc.json`)

### Secret refs for extraction/auth (runtime store alternative)

Store keys/credentials under reference names:

```bash
npm run secret:set -- captcha.2captcha "YOUR_2CAPTCHA_KEY"
npm run secret:set -- offsite.serpapi "YOUR_SERPAPI_KEY"
npm run secret:set -- auth.client "{\"username\":\"user\",\"password\":\"pass\"}"
```

Then use refs in extraction request:

```json
{
  "url": "https://example.com",
  "mode": "forensic",
  "captcha": {
    "enabled": true,
    "provider": "2captcha",
    "apiKeyRef": "captcha.2captcha"
  },
  "offsite": {
    "enabled": true,
    "providers": ["exa", "serp", "pr_reputation", "tech_intel"],
    "providerKeyRefs": {
      "serpapiRef": "offsite.serpapi"
    }
  }
}
```

### Captcha providers and Turnstile

- Extraction render flow supports `recaptcha`, `hcaptcha`, and `turnstile`.
- Turnstile challenge metadata (`action`, `cData`, `chlPageData`) is auto-captured from page runtime when available.
- Recommended default provider for this project: `2captcha`.
- For your target volume (2k-10k solves/month, upper bound of one solve per request), 2Captcha Turnstile cost is roughly `$2.9-$14.5/month` at `$1.45/1k`.
- Recommended key setup in `.env.local`:
  - `VERTICAL_SECRET_REF_CAPTCHA_2CAPTCHA=<your_key>`
  - keep payloads using only `apiKeyRef: "captcha.2captcha"`.

Crawler behavior notes:

- Extraction uses sitemap seeding (`robots.txt` `Sitemap:` + `/sitemap.xml` fallback), canonical URL dedupe, host-level throttling, and fetch body guards.
- `ignoreRobots` defaults to `true` for internal-mode extraction: `Allow`/`Disallow`/`Crawl-delay` are ignored, but sitemap URLs are still used for discovery.
- Set `ignoreRobots` to `false` to enable robots compliance mode (`Allow`/`Disallow` path checks and `Crawl-delay`).

## Smoke Flow

1. `npm run dev:full`
2. `POST /api/v1/generate`
3. Poll `GET /api/v1/generate/:jobId/status`
4. Open UI job detail: `http://localhost:3001/jobs/<jobId>`
5. Open UI preview: `http://localhost:3001/preview/<jobId>`
6. Trigger deploy via `POST /api/v1/deploy`

## Tests

Run all unit + integration tests:

```bash
npm test
```

Current suite covers:

- request schema validation
- job transition guards + recovery
- input resolver modes
- preview URL precedence
- extraction parser + normalizer + AI fallback
- deploy adapter contracts
- API integration (`generate`, `status`, `companies`, `deploy`, `preview config`, `analytics`)

## Main Project Structure

```text
api/
engine/
extraction/
infrastructure/
presentation/
runtime/
services/
worker/
tests/
```
