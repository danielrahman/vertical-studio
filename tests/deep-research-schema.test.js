const test = require('node:test');
const assert = require('node:assert/strict');
const { deepResearchSchema } = require('../extraction/schemas/deep-research-schema');

test('deepResearchSchema accepts outside.presence.people records', () => {
  const parsed = deepResearchSchema.safeParse({
    inputUrl: 'https://nordicbuild.example.com',
    finalUrl: 'https://nordicbuild.example.com',
    crawledAt: new Date().toISOString(),
    crawl: {
      pagesRequested: 1,
      pagesCrawled: 1,
      maxDepth: 1,
      durationsMs: {
        total: 100,
        crawl: 80,
        style: 20
      }
    },
    brand: {
      name: 'Nordic Build',
      tagline: 'Architecture and design studio',
      logos: [],
      favicons: [],
      images: {},
      social: {},
      contact: {
        emails: [],
        phones: [],
        addressCandidates: []
      },
      trustSignals: {
        partners: false,
        testimonials: false,
        awards: false,
        press: false,
        evidence: []
      }
    },
    style: {
      colors: {
        evidence: []
      },
      typography: {
        primaryFonts: [],
        secondaryFonts: [],
        evidence: []
      }
    },
    content: {
      pages: [
        {
          url: 'https://nordicbuild.example.com',
          title: 'Nordic Build',
          description: 'Studio homepage',
          headings: {
            h1: [],
            h2: [],
            h3: []
          },
          textSamples: [],
          sectionCandidates: []
        }
      ],
      sections: []
    },
    pageReports: [],
    warnings: [],
    research: {
      executiveSummary: {
        cz: 'Shrnutí',
        en: 'Summary'
      },
      brandNarrative: 'Narrative',
      positioning: 'Positioning',
      targetSegments: [],
      proofPoints: [],
      differentiators: []
    },
    outside: {
      company: {
        legalNameCandidates: [],
        ownershipSignals: [],
        registryFindings: [],
        evidence: []
      },
      presence: {
        people: [
          {
            name: 'Jane Architect',
            title: 'Founder',
            organization: 'Nordic Build',
            profileUrl: 'https://www.linkedin.com/in/jane-architect',
            sourceDomain: 'linkedin.com',
            confidence: 0.9
          }
        ],
        socialProfiles: [],
        directories: [],
        listingSignals: []
      },
      pr: {
        mentions: [],
        keyTopics: [],
        timeline: [],
        risks: [],
        opportunities: []
      },
      tech: {
        cms: [],
        trackers: [],
        cdn: [],
        hosting: [],
        evidence: []
      },
      competitive: {
        competitors: [],
        shareOfVoiceHints: []
      }
    },
    provenance: {
      sources: [],
      fields: {}
    },
    artifacts: {
      root: '.runtime/extraction/test',
      items: []
    },
    cost: {
      budgetUsd: 5,
      totalUsd: 0.2,
      providers: {
        exa: 0.2
      },
      withinBudget: true
    },
    coverage: {
      completedSteps: ['discovering', 'crawling', 'offsite', 'synthesizing'],
      skippedSteps: [],
      gaps: []
    },
    confidence: {
      overall: 0.7,
      fields: {},
      extractionConfidence: 0.7,
      inferenceConfidence: 0.7
    }
  });

  assert.equal(parsed.success, true);
});
