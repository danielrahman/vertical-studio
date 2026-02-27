const test = require('node:test');
const assert = require('node:assert/strict');
const { runExaProvider } = require('../extraction/deep/providers/exa-provider');
const { runOffsiteProviders, BudgetController } = require('../extraction/deep/providers');

const EXA_SEARCH_URL = 'https://api.exa.ai/search';
const EXA_CONTENTS_URL = 'https://api.exa.ai/contents';

function mockExaFetch() {
  return async (url, options = {}) => {
    if (url === EXA_SEARCH_URL) {
      const body = JSON.parse(options.body || '{}');
      let results = [];

      if (body.category === 'people') {
        results = [
          {
            url: 'https://www.linkedin.com/in/jane-architect',
            title: 'Jane Architect - Founder at Nordic Build',
            author: 'Jane Architect',
            score: 0.92
          },
          {
            url: 'https://www.linkedin.com/in/jane-architect',
            title: 'Jane Architect | Studio profile',
            author: 'Jane Architect',
            score: 0.85
          },
          {
            url: 'https://www.linkedin.com/in/john-director',
            title: 'John Director - Director',
            score: 0.81
          }
        ];
      } else if (body.category === 'news') {
        results = [
          {
            url: 'https://archdaily.example.com/nordic-build-award',
            title: 'Nordic Build wins design award',
            publishedDate: '2026-01-10'
          },
          {
            url: 'https://localpress.example.com/nordic-build-complaint',
            title: 'Delay complaint around Nordic Build project',
            publishedDate: '2025-12-22'
          }
        ];
      } else if (body.category === 'company') {
        results = [
          { url: 'https://nordicbuild.example.com', title: 'Nordic Build' },
          { url: 'https://competitor-one.example.com', title: 'Competitor One Studio' },
          { url: 'https://competitor-two.example.com', title: 'Competitor Two Architects' }
        ];
      }

      return new Response(JSON.stringify({ results }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    if (url === EXA_CONTENTS_URL) {
      const body = JSON.parse(options.body || '{}');
      const urls = Array.isArray(body.urls) ? body.urls : [];
      const results = urls.map((item) => ({
        url: item,
        text: `Detailed context for ${item}. Interview, award, architecture project details.`
      }));
      return new Response(JSON.stringify({ results }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }

    return new Response('', { status: 404 });
  };
}

test('runExaProvider skips with warning when EXA_API_KEY is missing', async () => {
  const previousKey = process.env.EXA_API_KEY;
  delete process.env.EXA_API_KEY;

  try {
    const result = await runExaProvider({
      domain: 'nordicbuild.example.com',
      brandName: 'Nordic Build',
      localeHints: ['cs-CZ', 'en-US'],
      budgetUsd: 5,
      budget: new BudgetController(5)
    });

    assert.equal(result.skipped, true);
    assert.equal(result.cost, 0);
    assert.equal(result.warnings.some((message) => message.includes('EXA_API_KEY')), true);
  } finally {
    if (previousKey === undefined) {
      delete process.env.EXA_API_KEY;
    } else {
      process.env.EXA_API_KEY = previousKey;
    }
  }
});

test('runExaProvider returns people, PR mentions and competitors in high precision mode', async () => {
  const previousKey = process.env.EXA_API_KEY;
  const originalFetch = global.fetch;
  process.env.EXA_API_KEY = 'test-exa-key';
  global.fetch = mockExaFetch();

  try {
    const result = await runExaProvider({
      domain: 'nordicbuild.example.com',
      brandName: 'Nordic Build',
      localeHints: ['cs-CZ', 'en-US'],
      budgetUsd: 5,
      budget: new BudgetController(5)
    });

    assert.equal(result.skipped, undefined);
    assert.equal(result.findings.people.length, 2);
    assert.equal(result.findings.socialProfiles.includes('https://www.linkedin.com/in/jane-architect'), true);
    assert.equal(result.findings.mentions.length, 2);
    assert.equal(result.findings.competitors.length, 2);
    assert.equal(result.findings.competitors.some((item) => item.domain === 'nordicbuild.example.com'), false);
    assert.equal(result.fieldLinks['outside.presence.people'].length > 0, true);
    assert.equal(result.fieldLinks['outside.pr.mentions'].length > 0, true);
    assert.equal(result.fieldLinks['outside.competitive.competitors'].length > 0, true);
    assert.equal(result.cost > 0, true);
    assert.equal(result.cost <= 2, true);
  } finally {
    global.fetch = originalFetch;
    if (previousKey === undefined) {
      delete process.env.EXA_API_KEY;
    } else {
      process.env.EXA_API_KEY = previousKey;
    }
  }
});

test('runExaProvider respects 40% budget cap and avoids calls when cap is too low', async () => {
  const previousKey = process.env.EXA_API_KEY;
  const originalFetch = global.fetch;
  process.env.EXA_API_KEY = 'test-exa-key';
  let fetchCalls = 0;

  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const result = await runExaProvider({
      domain: 'nordicbuild.example.com',
      brandName: 'Nordic Build',
      localeHints: ['cs-CZ'],
      budgetUsd: 0.01,
      budget: new BudgetController(0.01)
    });

    assert.equal(fetchCalls, 0);
    assert.equal(result.cost, 0);
    assert.equal(result.warnings.some((message) => message.includes('budget cap reached')), true);
  } finally {
    global.fetch = originalFetch;
    if (previousKey === undefined) {
      delete process.env.EXA_API_KEY;
    } else {
      process.env.EXA_API_KEY = previousKey;
    }
  }
});

test('runOffsiteProviders deduplicates exa people when provider is run multiple times', async () => {
  const previousKey = process.env.EXA_API_KEY;
  const originalFetch = global.fetch;
  process.env.EXA_API_KEY = 'test-exa-key';
  global.fetch = mockExaFetch();

  try {
    const result = await runOffsiteProviders({
      providers: ['exa', 'exa'],
      budgetUsd: 5,
      domain: 'nordicbuild.example.com',
      brandName: 'Nordic Build',
      localeHints: ['cs-CZ', 'en-US'],
      baseResult: {
        content: { pages: [] },
        artifacts: { items: [], root: '' }
      }
    });

    assert.equal(result.outside.presence.people.length, 2);
    assert.equal(result.outside.presence.socialProfiles.length > 0, true);
    assert.equal(result.outside.pr.mentions.length > 0, true);
    assert.equal(result.outside.competitive.competitors.length > 0, true);
  } finally {
    global.fetch = originalFetch;
    if (previousKey === undefined) {
      delete process.env.EXA_API_KEY;
    } else {
      process.env.EXA_API_KEY = previousKey;
    }
  }
});
