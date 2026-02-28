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

test('renderSiteFromRuntime trims resolve storageKey before immutable snapshot fetch', async () => {
  const calls = [];
  const fetchImpl = createMockFetch(
    [
      jsonResponse(200, {
        host: 'runtime-trim.example.test',
        siteId: 'site-trim',
        versionId: 'version-9',
        storageKey: '  site-versions/site-trim/version-9.json  '
      }),
      jsonResponse(200, {
        siteId: 'site-trim',
        versionId: 'version-9',
        storageKey: 'site-versions/site-trim/version-9.json',
        immutable: true,
        snapshot: {
          sections: []
        }
      })
    ],
    calls
  );

  const result = await renderSiteFromRuntime({
    apiBaseUrl: 'http://localhost:3000',
    host: 'runtime-trim.example.test',
    fetchImpl
  });

  assert.equal(calls.length, 2);
  assert.equal(
    calls[1],
    'http://localhost:3000/api/v1/public/runtime/snapshot/by-storage-key?storageKey=site-versions%2Fsite-trim%2Fversion-9.json'
  );
  assert.equal(result.snapshot.immutable, true);
});

test('renderSiteFromRuntime storageKey path surfaces API error metadata', async () => {
  const calls = [];
  const fetchImpl = createMockFetch(
    [
      jsonResponse(200, {
        host: 'runtime-missing-storage-key.example.test',
        storageKey: 'site-versions/site-storage-key-missing/version-404.json'
      }),
      jsonResponse(404, {
        code: 'runtime_snapshot_not_found',
        message: 'Runtime snapshot not found',
        details: {
          storageKey: 'site-versions/site-storage-key-missing/version-404.json'
        }
      })
    ],
    calls
  );

  await assert.rejects(
    renderSiteFromRuntime({
      apiBaseUrl: 'http://localhost:3000',
      host: 'runtime-missing-storage-key.example.test',
      fetchImpl
    }),
    (error) => {
      assert.equal(error.code, 'runtime_snapshot_not_found');
      assert.equal(error.statusCode, 404);
      assert.deepEqual(error.details, {
        storageKey: 'site-versions/site-storage-key-missing/version-404.json'
      });
      return true;
    }
  );

  assert.equal(calls.length, 2);
  assert.equal(
    calls[1],
    'http://localhost:3000/api/v1/public/runtime/snapshot/by-storage-key?storageKey=site-versions%2Fsite-storage-key-missing%2Fversion-404.json'
  );
});

test('renderSiteFromRuntime does not trigger compatibility fallback for non-not-found storageKey errors', async () => {
  const calls = [];
  const fetchImpl = createMockFetch(
    [
      jsonResponse(200, {
        host: 'runtime-storage-error.example.test',
        siteId: 'site-storage-error',
        versionId: 'version-storage-error',
        storageKey: 'site-versions/site-storage-error/version-storage-error.json'
      }),
      jsonResponse(503, {
        code: 'runtime_storage_unavailable',
        message: 'Runtime storage unavailable',
        details: {
          storageKey: 'site-versions/site-storage-error/version-storage-error.json'
        }
      })
    ],
    calls
  );

  await assert.rejects(
    renderSiteFromRuntime({
      apiBaseUrl: 'http://localhost:3000',
      host: 'runtime-storage-error.example.test',
      fetchImpl
    }),
    (error) => {
      assert.equal(error.code, 'runtime_storage_unavailable');
      assert.equal(error.statusCode, 503);
      assert.deepEqual(error.details, {
        storageKey: 'site-versions/site-storage-error/version-storage-error.json'
      });
      return true;
    }
  );

  assert.equal(calls.length, 2);
  assert.equal(
    calls[1],
    'http://localhost:3000/api/v1/public/runtime/snapshot/by-storage-key?storageKey=site-versions%2Fsite-storage-error%2Fversion-storage-error.json'
  );
});

test('renderSiteFromRuntime does not trigger compatibility fallback for not-found storageKey errors when fallback identifiers are incomplete', async () => {
  const cases = [
    {
      name: 'missing siteId',
      resolvedPayload: {
        host: 'runtime-incomplete-fallback-site.example.test',
        versionId: 'version-incomplete-fallback',
        storageKey: 'site-versions/site-incomplete-fallback/version-incomplete-fallback.json'
      }
    },
    {
      name: 'blank versionId',
      resolvedPayload: {
        host: 'runtime-incomplete-fallback-version.example.test',
        siteId: 'site-incomplete-fallback',
        versionId: '   ',
        storageKey: 'site-versions/site-incomplete-fallback/version-incomplete-fallback.json'
      }
    }
  ];

  for (const scenario of cases) {
    const calls = [];
    const fetchImpl = createMockFetch(
      [
        jsonResponse(200, scenario.resolvedPayload),
        jsonResponse(404, {
          code: 'runtime_snapshot_not_found',
          message: 'Runtime snapshot not found',
          details: {
            storageKey: 'site-versions/site-incomplete-fallback/version-incomplete-fallback.json'
          }
        })
      ],
      calls
    );

    await assert.rejects(
      renderSiteFromRuntime({
        apiBaseUrl: 'http://localhost:3000',
        host: scenario.resolvedPayload.host,
        fetchImpl
      }),
      (error) => {
        assert.equal(error.code, 'runtime_snapshot_not_found');
        assert.equal(error.statusCode, 404);
        assert.deepEqual(error.details, {
          storageKey: 'site-versions/site-incomplete-fallback/version-incomplete-fallback.json'
        });
        return true;
      },
      scenario.name
    );

    assert.equal(calls.length, 2, scenario.name);
    assert.equal(
      calls[1],
      'http://localhost:3000/api/v1/public/runtime/snapshot/by-storage-key?storageKey=site-versions%2Fsite-incomplete-fallback%2Fversion-incomplete-fallback.json',
      scenario.name
    );
  }
});

test('renderSiteFromRuntime does not trigger compatibility fallback for not-found storageKey errors when fallback identifiers are non-string', async () => {
  const cases = [
    {
      name: 'non-string siteId',
      resolvedPayload: {
        host: 'runtime-non-string-fallback-site.example.test',
        siteId: 123,
        versionId: 'version-non-string-fallback',
        storageKey: 'site-versions/site-non-string-fallback/version-non-string-fallback.json'
      }
    },
    {
      name: 'non-string versionId',
      resolvedPayload: {
        host: 'runtime-non-string-fallback-version.example.test',
        siteId: 'site-non-string-fallback',
        versionId: { value: 'version-non-string-fallback' },
        storageKey: 'site-versions/site-non-string-fallback/version-non-string-fallback.json'
      }
    }
  ];

  for (const scenario of cases) {
    const calls = [];
    const fetchImpl = createMockFetch(
      [
        jsonResponse(200, scenario.resolvedPayload),
        jsonResponse(404, {
          code: 'runtime_snapshot_not_found',
          message: 'Runtime snapshot not found',
          details: {
            storageKey: 'site-versions/site-non-string-fallback/version-non-string-fallback.json'
          }
        })
      ],
      calls
    );

    await assert.rejects(
      renderSiteFromRuntime({
        apiBaseUrl: 'http://localhost:3000',
        host: scenario.resolvedPayload.host,
        fetchImpl
      }),
      (error) => {
        assert.equal(error.code, 'runtime_snapshot_not_found');
        assert.equal(error.statusCode, 404);
        assert.deepEqual(error.details, {
          storageKey: 'site-versions/site-non-string-fallback/version-non-string-fallback.json'
        });
        return true;
      },
      scenario.name
    );

    assert.equal(calls.length, 2, scenario.name);
    assert.equal(
      calls[1],
      'http://localhost:3000/api/v1/public/runtime/snapshot/by-storage-key?storageKey=site-versions%2Fsite-non-string-fallback%2Fversion-non-string-fallback.json',
      scenario.name
    );
  }
});

test('renderSiteFromRuntime falls back to compatibility snapshot when storage-key fetch returns runtime_snapshot_not_found', async () => {
  const calls = [];
  const fetchImpl = createMockFetch(
    [
      jsonResponse(200, {
        host: 'runtime-stale-storage-key.example.test',
        siteId: 'site-stale-storage-key',
        versionId: 'version-legacy',
        storageKey: 'site-versions/site-stale-storage-key/stale-key.json'
      }),
      jsonResponse(404, {
        code: 'runtime_snapshot_not_found',
        message: 'Runtime snapshot not found',
        details: {
          storageKey: 'site-versions/site-stale-storage-key/stale-key.json'
        }
      }),
      jsonResponse(200, {
        siteId: 'site-stale-storage-key',
        versionId: 'version-legacy',
        storageKey: 'site-versions/site-stale-storage-key/version-legacy.json',
        immutable: true,
        snapshot: {
          sections: [
            {
              sectionId: 'hero',
              slots: {
                h1: 'Stale storage key fallback'
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
    host: 'runtime-stale-storage-key.example.test',
    fetchImpl
  });

  assert.equal(calls.length, 3);
  assert.equal(
    calls[1],
    'http://localhost:3000/api/v1/public/runtime/snapshot/by-storage-key?storageKey=site-versions%2Fsite-stale-storage-key%2Fstale-key.json'
  );
  assert.equal(
    calls[2],
    'http://localhost:3000/api/v1/public/runtime/snapshot?siteId=site-stale-storage-key&versionId=version-legacy'
  );
  assert.equal(result.snapshot.immutable, true);
  assert.equal(result.snapshot.versionId, 'version-legacy');
  assert.equal(result.html.includes('Stale storage key fallback'), true);
});

test('renderSiteFromRuntime uses compatibility response selected by lexicographic storageKey tie-break when no valid generatedAt candidates exist', async () => {
  const calls = [];
  const fetchImpl = createMockFetch(
    [
      jsonResponse(200, {
        host: 'runtime-no-valid-generatedat.example.test',
        siteId: 'site-no-valid-generatedat',
        versionId: 'version-no-valid-generatedat',
        storageKey: 'site-versions/site-no-valid-generatedat/stale-active-pointer.json'
      }),
      jsonResponse(404, {
        code: 'runtime_snapshot_not_found',
        message: 'Runtime snapshot not found',
        details: {
          storageKey: 'site-versions/site-no-valid-generatedat/stale-active-pointer.json'
        }
      }),
      jsonResponse(200, {
        siteId: 'site-no-valid-generatedat',
        versionId: 'version-no-valid-generatedat',
        storageKey: 'site-versions/site-no-valid-generatedat/historical-a.json',
        immutable: true,
        snapshot: {
          sections: [
            {
              sectionId: 'hero',
              slots: {
                h1: 'No valid generatedAt tie-break winner'
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
    host: 'runtime-no-valid-generatedat.example.test',
    fetchImpl
  });

  assert.equal(calls.length, 3);
  assert.equal(
    calls[1],
    'http://localhost:3000/api/v1/public/runtime/snapshot/by-storage-key?storageKey=site-versions%2Fsite-no-valid-generatedat%2Fstale-active-pointer.json'
  );
  assert.equal(
    calls[2],
    'http://localhost:3000/api/v1/public/runtime/snapshot?siteId=site-no-valid-generatedat&versionId=version-no-valid-generatedat'
  );
  assert.equal(result.snapshot.storageKey, 'site-versions/site-no-valid-generatedat/historical-a.json');
  assert.equal(result.snapshot.immutable, true);
  assert.equal(result.html.includes('No valid generatedAt tie-break winner'), true);
});

test('renderSiteFromRuntime trims fallback siteId/versionId in storage-key not-found retry path', async () => {
  const calls = [];
  const fetchImpl = createMockFetch(
    [
      jsonResponse(200, {
        host: 'runtime-retry-trim.example.test',
        siteId: '  site-retry-trim  ',
        versionId: '  version-retry-trim  ',
        storageKey: 'site-versions/site-retry-trim/stale-pointer.json'
      }),
      jsonResponse(404, {
        code: 'runtime_snapshot_not_found',
        message: 'Runtime snapshot not found',
        details: {
          storageKey: 'site-versions/site-retry-trim/stale-pointer.json'
        }
      }),
      jsonResponse(200, {
        siteId: 'site-retry-trim',
        versionId: 'version-retry-trim',
        storageKey: 'site-versions/site-retry-trim/version-retry-trim.json',
        immutable: true,
        snapshot: {
          sections: []
        }
      })
    ],
    calls
  );

  const result = await renderSiteFromRuntime({
    apiBaseUrl: 'http://localhost:3000',
    host: 'runtime-retry-trim.example.test',
    fetchImpl
  });

  assert.equal(calls.length, 3);
  assert.equal(
    calls[1],
    'http://localhost:3000/api/v1/public/runtime/snapshot/by-storage-key?storageKey=site-versions%2Fsite-retry-trim%2Fstale-pointer.json'
  );
  assert.equal(
    calls[2],
    'http://localhost:3000/api/v1/public/runtime/snapshot?siteId=site-retry-trim&versionId=version-retry-trim'
  );
  assert.equal(result.snapshot.storageKey, 'site-versions/site-retry-trim/version-retry-trim.json');
  assert.equal(result.snapshot.immutable, true);
});

test('renderSiteFromRuntime falls back to site/version snapshot endpoint when storageKey is missing', async () => {
  const calls = [];
  const fetchImpl = createMockFetch(
    [
      jsonResponse(200, {
        host: 'legacy-runtime.example.test',
        siteId: 'site-legacy',
        versionId: 'version-7'
      }),
      jsonResponse(200, {
        siteId: 'site-legacy',
        versionId: 'version-7',
        storageKey: 'site-versions/site-legacy/version-7.json',
        immutable: true,
        snapshot: {
          sections: [
            {
              sectionId: 'hero',
              slots: {
                h1: 'Compatibility fetch path'
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
    host: 'legacy-runtime.example.test',
    fetchImpl
  });

  assert.equal(calls.length, 2);
  assert.equal(
    calls[1],
    'http://localhost:3000/api/v1/public/runtime/snapshot?siteId=site-legacy&versionId=version-7'
  );
  assert.equal(result.resolved.versionId, 'version-7');
  assert.equal(result.snapshot.immutable, true);
  assert.equal(result.html.includes('Compatibility fetch path'), true);
});

test('renderSiteFromRuntime trims fallback siteId/versionId before compatibility snapshot fetch', async () => {
  const calls = [];
  const fetchImpl = createMockFetch(
    [
      jsonResponse(200, {
        host: 'legacy-trim.example.test',
        siteId: '  site-legacy-trim  ',
        versionId: '  version-9  '
      }),
      jsonResponse(200, {
        siteId: 'site-legacy-trim',
        versionId: 'version-9',
        storageKey: 'site-versions/site-legacy-trim/version-9.json',
        immutable: true,
        snapshot: {
          sections: []
        }
      })
    ],
    calls
  );

  const result = await renderSiteFromRuntime({
    apiBaseUrl: 'http://localhost:3000',
    host: 'legacy-trim.example.test',
    fetchImpl
  });

  assert.equal(calls.length, 2);
  assert.equal(
    calls[1],
    'http://localhost:3000/api/v1/public/runtime/snapshot?siteId=site-legacy-trim&versionId=version-9'
  );
  assert.equal(result.snapshot.immutable, true);
});

test('renderSiteFromRuntime fallback path surfaces API error metadata', async () => {
  const calls = [];
  const fetchImpl = createMockFetch(
    [
      jsonResponse(200, {
        host: 'legacy-missing.example.test',
        siteId: 'site-legacy-missing',
        versionId: 'version-missing'
      }),
      jsonResponse(404, {
        code: 'runtime_version_not_found',
        message: 'Runtime version not found',
        details: {
          siteId: 'site-legacy-missing',
          versionId: 'version-missing'
        }
      })
    ],
    calls
  );

  await assert.rejects(
    renderSiteFromRuntime({
      apiBaseUrl: 'http://localhost:3000',
      host: 'legacy-missing.example.test',
      fetchImpl
    }),
    (error) => {
      assert.equal(error.code, 'runtime_version_not_found');
      assert.equal(error.statusCode, 404);
      assert.deepEqual(error.details, {
        siteId: 'site-legacy-missing',
        versionId: 'version-missing'
      });
      return true;
    }
  );

  assert.equal(calls.length, 2);
  assert.equal(
    calls[1],
    'http://localhost:3000/api/v1/public/runtime/snapshot?siteId=site-legacy-missing&versionId=version-missing'
  );
});

test('renderSiteFromRuntime throws deterministic error when resolve payload lacks storageKey and site/version pair', async () => {
  const calls = [];
  const fetchImpl = createMockFetch(
    [
      jsonResponse(200, {
        host: 'broken-runtime.example.test',
        siteId: 'site-broken'
      })
    ],
    calls
  );

  await assert.rejects(
    renderSiteFromRuntime({
      apiBaseUrl: 'http://localhost:3000',
      host: 'broken-runtime.example.test',
      fetchImpl
    }),
    (error) => {
      assert.equal(error.code, 'runtime_resolve_incomplete');
      assert.equal(error.message, 'Runtime resolve payload must include storageKey or siteId+versionId');
      assert.deepEqual(error.details, {
        hasStorageKey: false,
        hasSiteId: true,
        hasVersionId: false
      });
      return true;
    }
  );
  assert.equal(calls.length, 1);
});

test('renderSiteFromRuntime treats non-string fallback siteId/versionId as missing identifiers', async () => {
  const calls = [];
  const fetchImpl = createMockFetch(
    [
      jsonResponse(200, {
        host: 'broken-runtime-types.example.test',
        siteId: 42,
        versionId: true
      })
    ],
    calls
  );

  await assert.rejects(
    renderSiteFromRuntime({
      apiBaseUrl: 'http://localhost:3000',
      host: 'broken-runtime-types.example.test',
      fetchImpl
    }),
    (error) => {
      assert.equal(error.code, 'runtime_resolve_incomplete');
      assert.equal(error.message, 'Runtime resolve payload must include storageKey or siteId+versionId');
      assert.deepEqual(error.details, {
        hasStorageKey: false,
        hasSiteId: false,
        hasVersionId: false
      });
      return true;
    }
  );
  assert.equal(calls.length, 1);
});

test('renderSiteFromRuntime treats whitespace storageKey as missing before fallback identifier validation', async () => {
  const calls = [];
  const fetchImpl = createMockFetch(
    [
      jsonResponse(200, {
        host: 'blank-storage-key.example.test',
        storageKey: '   ',
        siteId: 'site-blank-storage',
        versionId: 0
      })
    ],
    calls
  );

  await assert.rejects(
    renderSiteFromRuntime({
      apiBaseUrl: 'http://localhost:3000',
      host: 'blank-storage-key.example.test',
      fetchImpl
    }),
    (error) => {
      assert.equal(error.code, 'runtime_resolve_incomplete');
      assert.equal(error.message, 'Runtime resolve payload must include storageKey or siteId+versionId');
      assert.deepEqual(error.details, {
        hasStorageKey: false,
        hasSiteId: true,
        hasVersionId: false
      });
      return true;
    }
  );
  assert.equal(calls.length, 1);
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
