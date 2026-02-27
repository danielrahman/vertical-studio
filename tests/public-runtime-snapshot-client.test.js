const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveRuntimeVersion,
  fetchRuntimeSnapshot,
  renderSiteFromRuntime
} = require('../apps/public-web/runtime-snapshot-client');

function createMockFetch(responses, calls) {
  let index = 0;
  return async (url) => {
    calls.push(url);
    const response = responses[index];
    index += 1;
    return response;
  };
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

test('resolveRuntimeVersion requests host-based runtime resolution endpoint', async () => {
  const calls = [];
  const fetchImpl = createMockFetch(
    [
      jsonResponse(200, {
        host: 'runtime.example.test',
        siteId: 'site-1',
        versionId: 'version-1',
        storageKey: 'site-versions/site-1/version-1.json'
      })
    ],
    calls
  );

  const payload = await resolveRuntimeVersion({
    apiBaseUrl: 'http://localhost:3000/',
    host: 'runtime.example.test',
    fetchImpl
  });

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0],
    'http://localhost:3000/api/v1/public/runtime/resolve?host=runtime.example.test'
  );
  assert.equal(payload.siteId, 'site-1');
  assert.equal(payload.versionId, 'version-1');
});

test('renderSiteFromRuntime resolves active version, fetches immutable snapshot, and renders html', async () => {
  const calls = [];
  const fetchImpl = createMockFetch(
    [
      jsonResponse(200, {
        host: 'runtime.example.test',
        siteId: 'site-1',
        versionId: 'version-2',
        storageKey: 'site-versions/site-1/version-2.json'
      }),
      jsonResponse(200, {
        siteId: 'site-1',
        versionId: 'version-2',
        storageKey: 'site-versions/site-1/version-2.json',
        immutable: true,
        snapshot: {
          sections: [
            {
              sectionId: 'hero',
              slots: {
                h1: 'Premium projects',
                subhead: 'Rendered from immutable snapshot'
              }
            }
          ]
        }
      })
    ],
    calls
  );

  const result = await renderSiteFromRuntime({
    apiBaseUrl: 'http://localhost:3000',
    host: 'runtime.example.test',
    fetchImpl
  });

  assert.equal(calls.length, 2);
  assert.equal(
    calls[1],
    'http://localhost:3000/api/v1/public/runtime/snapshot/by-storage-key?storageKey=site-versions%2Fsite-1%2Fversion-2.json'
  );
  assert.equal(result.resolved.versionId, 'version-2');
  assert.equal(result.snapshot.immutable, true);
  assert.equal(result.html.includes('Premium projects'), true);
  assert.equal(result.html.includes('Rendered from immutable snapshot'), true);
});

test('fetchRuntimeSnapshot surfaces API error metadata', async () => {
  const calls = [];
  const fetchImpl = createMockFetch(
    [
      jsonResponse(404, {
        code: 'runtime_snapshot_not_found',
        message: 'Runtime snapshot not found'
      })
    ],
    calls
  );

  await assert.rejects(
    fetchRuntimeSnapshot({
      apiBaseUrl: 'http://localhost:3000',
      storageKey: 'site-versions/site-1/missing-version.json',
      fetchImpl
    }),
    (error) => {
      assert.equal(error.code, 'runtime_snapshot_not_found');
      assert.equal(error.statusCode, 404);
      return true;
    }
  );
});
