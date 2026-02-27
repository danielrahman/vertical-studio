const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { convertHtmlToMarkdown } = require('../extraction/deep/markdown/local-converter');
const { selectCanonicalMarkdown } = require('../extraction/deep/markdown/selector');
const { convertViaMarkdownNew } = require('../extraction/deep/markdown/markdown-new-client');
const { buildMarkdownCorpus } = require('../extraction/deep/markdown');
const { ArtifactManager } = require('../extraction/deep/artifact-manager');

test('local HTML converter keeps headings/paragraphs/lists', () => {
  const html = `
    <html>
      <head><title>Sample</title></head>
      <body>
        <main>
          <h1>Hello World</h1>
          <p>Paragraph text</p>
          <ul><li>First item</li><li>Second item</li></ul>
        </main>
      </body>
    </html>
  `;
  const md = convertHtmlToMarkdown({ html, pageUrl: 'https://example.com' });
  assert.equal(md.content.includes('# Sample'), true);
  assert.equal(md.content.includes('## Hello World') || md.content.includes('# Hello World'), true);
  assert.equal(md.content.includes('- First item'), true);
});

test('markdown selector prefers richer structured candidate', () => {
  const { winner } = selectCanonicalMarkdown([
    {
      source: 'local',
      title: 'A',
      content: 'Short line'
    },
    {
      source: 'remote',
      title: 'B',
      content: '# Heading\n\nParagraph\n\n- Item\n\n[Link](https://example.com)'
    }
  ]);

  assert.equal(Boolean(winner), true);
  assert.equal(winner.source, 'remote');
});

test('markdown.new client parses successful JSON response', async () => {
  const previousFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        title: 'Example',
        content: '# Example',
        method: 'Cloudflare Workers AI',
        duration_ms: 20,
        tokens: 12
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  try {
    const result = await convertViaMarkdownNew({
      url: 'https://example.com',
      method: 'auto'
    });
    assert.equal(result.ok, true);
    assert.equal(result.content, '# Example');
  } finally {
    global.fetch = previousFetch;
  }
});

test('markdown corpus builder creates canonical markdown artifacts', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-md-test-'));
  const artifactManager = new ArtifactManager({
    jobId: 'test-job',
    root
  });

  const baseResult = {
    _crawlPages: [
      {
        url: 'https://example.com/',
        html: '<html><head><title>Example</title></head><body><main><h1>Welcome</h1><p>Body copy</p></main></body></html>'
      }
    ],
    content: {
      pages: [{ url: 'https://example.com/', pageType: 'home', title: 'Example' }]
    }
  };

  const previousFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        title: 'Example',
        content: '# Example\n\nMarkdown version',
        method: 'Cloudflare Workers AI',
        duration_ms: 22,
        tokens: 20
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  try {
    const corpus = await buildMarkdownCorpus({
      baseResult,
      renderResult: { renderedPages: [] },
      artifactManager,
      warnings: [],
      options: {
        enabled: true,
        mode: 'hybrid',
        remoteProvider: 'markdown_new',
        method: 'auto',
        maxDocs: 5
      }
    });

    assert.equal(Array.isArray(corpus.documents), true);
    assert.equal(corpus.documents.length, 1);
    assert.equal(Boolean(corpus.documents[0].artifactId), true);
  } finally {
    global.fetch = previousFetch;
  }
});
