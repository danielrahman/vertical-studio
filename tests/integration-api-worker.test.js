const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { once } = require('events');
const { createApp } = require('../api/server');
const { getRuntimePaths, ensureRuntimeDirs } = require('../runtime/paths');
const { createLogger } = require('../runtime/logger');
const { JobStore } = require('../runtime/job-store');
const { FSQueue } = require('../runtime/fs-queue');
const { JobProcessor } = require('../worker/job-processor');
const { recoverStartupState } = require('../worker/runner');
const fixtureHtml = fs.readFileSync(path.join(__dirname, 'fixtures', 'company-site.html'), 'utf8');

function mkIsolatedRuntime() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vertical-int-'));
  const paths = getRuntimePaths({
    runtimeRoot: path.join(base, '.runtime'),
    outputRoot: path.join(base, 'out')
  });
  ensureRuntimeDirs(paths);

  const logger = createLogger('integration');
  const jobStore = new JobStore(paths, logger);
  const queue = new FSQueue(paths, logger);

  return {
    base,
    paths,
    logger,
    jobStore,
    queue
  };
}

async function startServerWith(runtime) {
  const app = createApp({
    paths: runtime.paths,
    logger: runtime.logger,
    jobStore: runtime.jobStore,
    queue: runtime.queue
  });

  const server = app.listen(0);
  await once(server, 'listening');

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return { app, server, baseUrl };
}

async function stopServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

test('POST /generate returns 202 and job can be processed to completion', async () => {
  const runtime = mkIsolatedRuntime();
  const { app, server, baseUrl } = await startServerWith(runtime);

  try {
    const sampleInput = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'samples', 'all-new-development-input.json'), 'utf8')
    );

    const postRes = await fetch(`${baseUrl}/api/v1/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input: { data: sampleInput }
      })
    });

    assert.equal(postRes.status, 202);
    const postBody = await postRes.json();
    assert.equal(postBody.status, 'pending');
    assert.ok(postBody.jobId);

    const preStatusRes = await fetch(`${baseUrl}/api/v1/generate/${postBody.jobId}/status`);
    const preStatus = await preStatusRes.json();
    assert.equal(preStatus.status, 'pending');

    const processor = new JobProcessor({
      jobStore: app.locals.jobStore,
      queue: app.locals.queue,
      logger: app.locals.logger,
      paths: app.locals.paths
    });

    const processed = await processor.processNext('integration-worker');
    assert.equal(processed, true);

    const doneStatusRes = await fetch(`${baseUrl}/api/v1/generate/${postBody.jobId}/status`);
    const doneStatus = await doneStatusRes.json();
    assert.equal(doneStatus.status, 'completed');
    assert.ok(doneStatus.startedAt);
    assert.ok(doneStatus.finishedAt);
    assert.ok(doneStatus.artifacts);

    const stored = app.locals.jobStore.get(postBody.jobId);
    const statuses = (stored.statusHistory || []).map((entry) => entry.status);
    assert.equal(statuses.includes('processing'), true);
    assert.equal(statuses.includes('completed'), true);
  } finally {
    await stopServer(server);
  }
});

test('invalid generate payload, unknown companyIdentifier, and unknown job return expected errors', async () => {
  const runtime = mkIsolatedRuntime();
  const { server, baseUrl } = await startServerWith(runtime);

  try {
    const badRes = await fetch(`${baseUrl}/api/v1/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        companyIdentifier: 'x',
        input: { path: 'samples/x.json' }
      })
    });

    assert.equal(badRes.status, 400);

    const unknownCompanyRes = await fetch(`${baseUrl}/api/v1/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        companyIdentifier: 'missing-company'
      })
    });
    assert.equal(unknownCompanyRes.status, 400);

    const notFoundRes = await fetch(`${baseUrl}/api/v1/generate/missing/status`);
    assert.equal(notFoundRes.status, 404);
  } finally {
    await stopServer(server);
  }
});

test('previews and analytics endpoints return computed data', async () => {
  const runtime = mkIsolatedRuntime();
  const { app, server, baseUrl } = await startServerWith(runtime);

  try {
    const sampleInput = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'samples', 'castle-rock-input.json'), 'utf8')
    );

    const postRes = await fetch(`${baseUrl}/api/v1/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input: { data: sampleInput }
      })
    });
    const postBody = await postRes.json();

    const processor = new JobProcessor({
      jobStore: app.locals.jobStore,
      queue: app.locals.queue,
      logger: app.locals.logger,
      paths: app.locals.paths
    });
    await processor.processNext('integration-worker');

    const previewsRes = await fetch(`${baseUrl}/api/v1/previews`);
    assert.equal(previewsRes.status, 200);
    const previews = await previewsRes.json();
    assert.equal(Array.isArray(previews), true);
    assert.equal(previews.length >= 1, true);

    const analyticsRes = await fetch(`${baseUrl}/api/v1/analytics`);
    assert.equal(analyticsRes.status, 200);
    const analytics = await analyticsRes.json();
    assert.equal(analytics.totals.completed >= 1, true);
  } finally {
    await stopServer(server);
  }
});

test('worker startup recovery moves processing jobs back to pending and requeues them', () => {
  const runtime = mkIsolatedRuntime();

  runtime.jobStore.create({
    jobId: 'recover-job',
    status: 'pending',
    inputSource: { mode: 'input.data' },
    request: {
      input: {
        data: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', 'all-new-development-input.json'), 'utf8'))
      }
    },
    outputDir: path.join(runtime.paths.outputRoot, 'recover-job')
  });

  runtime.jobStore.transition('recover-job', 'processing');

  const recovered = recoverStartupState({
    jobStore: runtime.jobStore,
    queue: runtime.queue,
    logger: runtime.logger
  });

  assert.equal(recovered.processingRecovered.includes('recover-job'), true);
  const reloaded = runtime.jobStore.get('recover-job');
  assert.equal(reloaded.status, 'pending');
  assert.equal(runtime.queue.hasJob('recover-job'), true);
});

test('POST /api/v1/extract and alias /api/extract create async extraction jobs and expose result endpoints', async () => {
  const runtime = mkIsolatedRuntime();
  const { app, server, baseUrl } = await startServerWith(runtime);
  const originalFetch = global.fetch;

  global.fetch = async (url, options) => {
    const href = String(url);
    if (href.includes('nordicbuild.example.com')) {
      return new Response(fixtureHtml, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    return originalFetch(url, options);
  };

  try {
    const payload = {
      url: 'https://nordicbuild.example.com',
      mode: 'forensic',
      ignoreRobots: true,
      budgetUsd: 5,
      maxDurationMs: 120000,
      offsite: {
        enabled: false,
        providers: ['serp', 'company_data', 'social_enrichment']
      }
    };

    const response = await fetch(`${baseUrl}/api/v1/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert.equal(response.status, 202);
    const body = await response.json();
    assert.equal(typeof body.jobId, 'string');
    assert.equal(typeof body.statusUrl, 'string');
    assert.equal(typeof body.resultUrl, 'string');

    const processor = new JobProcessor({
      jobStore: app.locals.jobStore,
      queue: app.locals.queue,
      logger: app.locals.logger,
      paths: app.locals.paths,
      repositories: app.locals.repositories,
      secretStore: app.locals.secretStore
    });
    await processor.processNext('integration-worker');

    const statusRes = await fetch(`${baseUrl}${body.statusUrl}`);
    assert.equal(statusRes.status, 200);
    const status = await statusRes.json();
    assert.equal(status.jobType, 'extraction');
    assert.equal(status.status === 'completed' || status.status === 'failed', true);

    const resultRes = await fetch(`${baseUrl}${body.resultUrl}`);
    assert.equal(resultRes.status, 200);
    const result = await resultRes.json();
    assert.equal(result.finalUrl.startsWith('https://nordicbuild.example.com'), true);
    assert.equal(Array.isArray(result.content.pages), true);
    assert.equal(Boolean(result.research && result.research.executiveSummary), true);

    const aliasResponse = await fetch(`${baseUrl}/api/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert.equal(aliasResponse.status, 202);
    const aliasBody = await aliasResponse.json();
    assert.equal(typeof aliasBody.jobId, 'string');
  } finally {
    global.fetch = originalFetch;
    await stopServer(server);
  }
});

test('default off-site providers include exa enrichment when EXA_API_KEY is set', async () => {
  const runtime = mkIsolatedRuntime();
  const { app, server, baseUrl } = await startServerWith(runtime);
  const previousExaKey = process.env.EXA_API_KEY;
  const originalFetch = global.fetch;
  process.env.EXA_API_KEY = 'test-exa-key';

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.startsWith(baseUrl)) {
      return originalFetch(url, options);
    }

    if (href.includes('nordicbuild.example.com')) {
      return new Response(fixtureHtml, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (href === 'https://api.exa.ai/search') {
      const body = JSON.parse(options.body || '{}');
      let results = [];

      if (body.category === 'people') {
        results = [
          {
            url: 'https://www.linkedin.com/in/jane-architect',
            title: 'Jane Architect - Founder at Nordic Build',
            author: 'Jane Architect',
            score: 0.91
          }
        ];
      } else if (body.category === 'news') {
        results = [
          {
            url: 'https://archdaily.example.com/nordic-build-award',
            title: 'Nordic Build wins design award',
            publishedDate: '2026-01-10'
          }
        ];
      } else if (body.category === 'company') {
        results = [{ url: 'https://competitor-one.example.com', title: 'Competitor One Studio' }];
      }

      return new Response(JSON.stringify({ results }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (href === 'https://api.exa.ai/contents') {
      const body = JSON.parse(options.body || '{}');
      const urls = Array.isArray(body.urls) ? body.urls : [];
      return new Response(
        JSON.stringify({
          results: urls.map((item) => ({
            url: item,
            text: `Detailed text for ${item}`
          }))
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (href.startsWith('https://rdap.org/domain/')) {
      return new Response(
        JSON.stringify({
          ldhName: 'nordicbuild.example.com',
          status: ['active']
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    return new Response('', { status: 404, headers: { 'content-type': 'text/plain' } });
  };

  try {
    const response = await fetch(`${baseUrl}/api/v1/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: 'https://nordicbuild.example.com',
        mode: 'forensic',
        ignoreRobots: true,
        budgetUsd: 5,
        maxDurationMs: 120000,
        offsite: {
          enabled: true
        }
      })
    });

    assert.equal(response.status, 202);
    const body = await response.json();

    const processor = new JobProcessor({
      jobStore: app.locals.jobStore,
      queue: app.locals.queue,
      logger: app.locals.logger,
      paths: app.locals.paths,
      repositories: app.locals.repositories,
      secretStore: app.locals.secretStore
    });
    await processor.processNext('integration-worker');

    const statusRes = await fetch(`${baseUrl}/api/v1/extract/jobs/${body.jobId}`);
    assert.equal(statusRes.status, 200);
    const status = await statusRes.json();
    assert.equal(status.status, 'completed');

    const resultRes = await fetch(`${baseUrl}/api/v1/extract/jobs/${body.jobId}/result`);
    assert.equal(resultRes.status, 200);
    const result = await resultRes.json();

    assert.equal(Array.isArray(result.outside.presence.people), true);
    assert.equal(result.outside.presence.people.length > 0, true);
    assert.equal(Array.isArray(result.outside.pr.mentions), true);
    assert.equal(result.outside.pr.mentions.length > 0, true);
    assert.equal(Array.isArray(result.outside.competitive.competitors), true);
    assert.equal(result.outside.competitive.competitors.length > 0, true);
    assert.equal(result.warnings.some((item) => String(item.message || '').includes('Exa provider skipped')), false);
  } finally {
    global.fetch = originalFetch;
    if (previousExaKey === undefined) {
      delete process.env.EXA_API_KEY;
    } else {
      process.env.EXA_API_KEY = previousExaKey;
    }
    await stopServer(server);
  }
});

test('default off-site providers complete with warning when EXA_API_KEY is missing', async () => {
  const runtime = mkIsolatedRuntime();
  const { app, server, baseUrl } = await startServerWith(runtime);
  const previousExaKey = process.env.EXA_API_KEY;
  const originalFetch = global.fetch;
  delete process.env.EXA_API_KEY;

  global.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.startsWith(baseUrl)) {
      return originalFetch(url, options);
    }

    if (href.includes('nordicbuild.example.com')) {
      return new Response(fixtureHtml, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (href.startsWith('https://rdap.org/domain/')) {
      return new Response(
        JSON.stringify({
          ldhName: 'nordicbuild.example.com',
          status: ['active']
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    return new Response('', { status: 404, headers: { 'content-type': 'text/plain' } });
  };

  try {
    const response = await fetch(`${baseUrl}/api/v1/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: 'https://nordicbuild.example.com',
        mode: 'forensic',
        ignoreRobots: true,
        budgetUsd: 5,
        maxDurationMs: 120000,
        offsite: {
          enabled: true
        }
      })
    });

    assert.equal(response.status, 202);
    const body = await response.json();

    const processor = new JobProcessor({
      jobStore: app.locals.jobStore,
      queue: app.locals.queue,
      logger: app.locals.logger,
      paths: app.locals.paths,
      repositories: app.locals.repositories,
      secretStore: app.locals.secretStore
    });
    await processor.processNext('integration-worker');

    const statusRes = await fetch(`${baseUrl}/api/v1/extract/jobs/${body.jobId}`);
    assert.equal(statusRes.status, 200);
    const status = await statusRes.json();
    assert.equal(status.status, 'completed');

    const resultRes = await fetch(`${baseUrl}/api/v1/extract/jobs/${body.jobId}/result`);
    assert.equal(resultRes.status, 200);
    const result = await resultRes.json();
    assert.equal(result.warnings.some((item) => String(item.message || '').includes('Exa provider skipped')), true);
  } finally {
    global.fetch = originalFetch;
    if (previousExaKey === undefined) {
      delete process.env.EXA_API_KEY;
    } else {
      process.env.EXA_API_KEY = previousExaKey;
    }
    await stopServer(server);
  }
});

test('extraction job can be cancelled and status endpoint reflects cancellation', async () => {
  const runtime = mkIsolatedRuntime();
  const { server, baseUrl } = await startServerWith(runtime);

  try {
    const response = await fetch(`${baseUrl}/api/v1/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: 'https://nordicbuild.example.com',
        mode: 'forensic',
        offsite: { enabled: false, providers: ['serp'] }
      })
    });

    assert.equal(response.status, 202);
    const body = await response.json();

    const cancelRes = await fetch(`${baseUrl}/api/v1/extract/jobs/${body.jobId}/cancel`, {
      method: 'POST'
    });
    assert.equal(cancelRes.status, 200);
    const cancel = await cancelRes.json();
    assert.equal(cancel.cancelled, true);

    const statusRes = await fetch(`${baseUrl}/api/v1/extract/jobs/${body.jobId}`);
    assert.equal(statusRes.status, 200);
    const status = await statusRes.json();
    assert.equal(status.status, 'cancelled');
  } finally {
    await stopServer(server);
  }
});

test('POST /companies with websiteUrl queues async extraction and persists normalized input after worker run', async () => {
  const runtime = mkIsolatedRuntime();
  const { app, server, baseUrl } = await startServerWith(runtime);
  const originalFetch = global.fetch;

  global.fetch = async (url, options) => {
    const href = String(url);
    if (href.includes('nordicbuild.example.com')) {
      return new Response(fixtureHtml, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    return originalFetch(url, options);
  };

  try {
    const response = await fetch(`${baseUrl}/api/v1/companies`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Nordic Build',
        brandSlug: 'nordic-build',
        locale: 'en-US',
        industry: 'architecture',
        websiteUrl: 'https://nordicbuild.example.com'
      })
    });

    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.extractionStatus, 'queued');
    assert.equal(typeof body.extractionJobId, 'string');

    const processor = new JobProcessor({
      jobStore: app.locals.jobStore,
      queue: app.locals.queue,
      logger: app.locals.logger,
      paths: app.locals.paths,
      repositories: app.locals.repositories,
      secretStore: app.locals.secretStore
    });
    await processor.processNext('integration-worker');

    const extractionStatusRes = await fetch(`${baseUrl}/api/v1/companies/${body.id}/extraction`);
    assert.equal(extractionStatusRes.status, 200);
    const extractionStatus = await extractionStatusRes.json();
    assert.equal(extractionStatus.extractionJobId, body.extractionJobId);
    assert.equal(
      extractionStatus.extractionStatus === 'done' ||
        extractionStatus.extractionStatus === 'done_with_warnings' ||
        extractionStatus.extractionStatus === 'failed',
      true
    );

    const listRes = await fetch(`${baseUrl}/api/v1/companies`);
    assert.equal(listRes.status, 200);
    const list = await listRes.json();
    assert.equal(list.length >= 1, true);
    const updated = list.find((item) => item.id === body.id);
    assert.equal(Boolean(updated), true);
    assert.equal(Boolean(updated.normalizedInput), true);
  } finally {
    global.fetch = originalFetch;
    await stopServer(server);
  }
});

test('deploy endpoints: local target works, vercel without env returns 422, preview config is available', async () => {
  const runtime = mkIsolatedRuntime();
  const { app, server, baseUrl } = await startServerWith(runtime);
  const prevToken = process.env.VERCEL_TOKEN;
  const prevProject = process.env.VERCEL_PROJECT_ID;

  delete process.env.VERCEL_TOKEN;
  delete process.env.VERCEL_PROJECT_ID;

  try {
    const sampleInput = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'samples', 'all-new-development-input.json'), 'utf8')
    );

    const postRes = await fetch(`${baseUrl}/api/v1/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input: { data: sampleInput }
      })
    });
    const postBody = await postRes.json();

    const processor = new JobProcessor({
      jobStore: app.locals.jobStore,
      queue: app.locals.queue,
      logger: app.locals.logger,
      paths: app.locals.paths,
      repositories: app.locals.repositories
    });
    await processor.processNext('integration-worker');

    const previewConfigRes = await fetch(`${baseUrl}/api/v1/previews/${postBody.jobId}/config`);
    assert.equal(previewConfigRes.status, 200);
    const previewConfig = await previewConfigRes.json();
    assert.equal(Boolean(previewConfig.siteConfig), true);
    assert.equal(Boolean(previewConfig.themeConfig), true);
    assert.equal(Boolean(previewConfig.manifest), true);

    const localDeployRes = await fetch(`${baseUrl}/api/v1/deploy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jobId: postBody.jobId,
        target: 'local'
      })
    });
    assert.equal(localDeployRes.status, 200);
    const localDeploy = await localDeployRes.json();
    assert.equal(localDeploy.status, 'completed');
    assert.equal(typeof localDeploy.previewUrl, 'string');

    const vercelDeployRes = await fetch(`${baseUrl}/api/v1/deploy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jobId: postBody.jobId,
        target: 'vercel'
      })
    });
    assert.equal(vercelDeployRes.status, 422);
  } finally {
    if (prevToken === undefined) {
      delete process.env.VERCEL_TOKEN;
    } else {
      process.env.VERCEL_TOKEN = prevToken;
    }

    if (prevProject === undefined) {
      delete process.env.VERCEL_PROJECT_ID;
    } else {
      process.env.VERCEL_PROJECT_ID = prevProject;
    }

    await stopServer(server);
  }
});
