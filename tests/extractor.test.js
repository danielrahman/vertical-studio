const test = require('node:test');
const assert = require('node:assert/strict');
const { parseColorToken, extractColorTokens } = require('../extraction/extractor/style/colors');
const { normalizeSections } = require('../extraction/extractor/sections/normalize');
const { ExtractorRegistry } = require('../extraction/extractor/plugins/registry');
const { toLegacyExtractedData } = require('../extraction/extractor');

test('color parser normalizes hex/rgb/hsl tokens', () => {
  assert.equal(parseColorToken('#abc').hex, '#aabbcc');
  assert.equal(parseColorToken('rgb(17, 34, 51)').hex, '#112233');
  assert.equal(parseColorToken('hsl(0, 100%, 50%)').hex, '#ff0000');

  const tokens = extractColorTokens('color:#fff; background: rgb(0,0,0); border-color: hsl(210, 40%, 50%);');
  assert.equal(tokens.length >= 3, true);
});

test('section normalizer classifies common section types', () => {
  const sections = normalizeSections({
    plugin: { adjustSectionScores: (_candidate, scores) => scores },
    pages: [
      {
        depth: 0,
        headings: { h1: ['Designing Homes With Long-Term Value'], h2: [], h3: [] },
        sectionCandidates: [
          {
            title: 'Designing Homes With Long-Term Value',
            summary: 'Premium architecture with transparent delivery and clear outcomes.',
            bullets: ['Trusted process', 'Fast permits', 'Better financing'],
            ctas: [{ label: 'Book consultation', url: 'https://example.com/contact' }],
            sourceTag: 'section',
            sourcePageUrl: 'https://example.com'
          },
          {
            title: 'Our Services',
            summary: 'Services and solutions for residential design and delivery.',
            bullets: ['Architecture', 'Construction management'],
            ctas: [],
            sourceTag: 'section',
            sourcePageUrl: 'https://example.com/services'
          },
          {
            title: 'Contact',
            summary: 'Get in touch by phone, email, or contact form.',
            ctas: [{ label: 'Contact us', url: 'https://example.com/contact' }],
            sourceTag: 'section',
            sourcePageUrl: 'https://example.com/contact',
            _features: { hasForm: true, hasMap: false, legalLinkCount: 0, questionCount: 0 }
          }
        ]
      }
    ]
  });

  const types = sections.map((section) => section.type);
  assert.equal(types.includes('HERO'), true);
  assert.equal(types.includes('SERVICES'), true);
  assert.equal(types.includes('CONTACT'), true);
});

test('plugin registry resolves nordicbuild plugin for host', () => {
  const registry = new ExtractorRegistry();
  const plugin = registry.resolve('nordicbuild.example.com');

  assert.equal(typeof plugin.adjustLinkPriority, 'function');
  assert.equal(plugin.match('nordicbuild.example.com'), true);
});

test('legacy mapper builds compatible extractedData shape', () => {
  const legacy = toLegacyExtractedData({
    finalUrl: 'https://example.com',
    crawledAt: new Date().toISOString(),
    brand: {
      name: 'Example Studio',
      tagline: 'A better way to build',
      contact: {
        emails: ['hello@example.com'],
        phones: ['+420777123456']
      }
    },
    content: {
      pages: [
        {
          url: 'https://example.com',
          title: 'Example Studio',
          description: 'Premium projects delivered safely and quickly.',
          headings: {
            h1: ['Designing Homes With Long-Term Value'],
            h2: ['River Park'],
            h3: []
          },
          textSamples: ['Long paragraph sample about the company and its services.'],
          sectionCandidates: []
        }
      ],
      sections: [
        {
          type: 'PROJECTS',
          title: 'River Park',
          summary: 'Urban residential development.',
          ctas: [{ label: 'See project', url: 'https://example.com/projects/river-park' }]
        }
      ]
    }
  });

  assert.equal(legacy.title, 'Example Studio');
  assert.equal(Array.isArray(legacy.projectBlocks), true);
  assert.equal(legacy.projectBlocks[0].title, 'River Park');
  assert.equal(legacy.contacts.emails[0], 'hello@example.com');
});
