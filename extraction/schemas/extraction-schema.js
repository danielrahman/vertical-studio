const { z } = require('zod');

const warningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  url: z.string().url().optional()
});

const headingGroupSchema = z.object({
  h1: z.array(z.string()),
  h2: z.array(z.string()),
  h3: z.array(z.string())
});

const pageReportSchema = z.object({
  url: z.string().url(),
  status: z.number().int().nonnegative(),
  contentType: z.string().nullable(),
  bytes: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  retries: z.number().int().nonnegative(),
  notes: z.array(z.string()).default([]),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional()
});

const sectionCandidateSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  bullets: z.array(z.string()).optional(),
  ctas: z.array(z.object({ label: z.string(), url: z.string().url() })).default([]),
  sourceTag: z.string().optional(),
  sourcePageUrl: z.string().url()
});

const normalizedSectionSchema = z.object({
  type: z.enum([
    'HERO',
    'FEATURES',
    'SERVICES',
    'PROJECTS',
    'TESTIMONIALS',
    'TEAM',
    'FAQ',
    'CONTACT',
    'FOOTER'
  ]),
  title: z.string().default(''),
  summary: z.string().default(''),
  bullets: z.array(z.string()).optional(),
  ctas: z.array(z.object({ label: z.string(), url: z.string().url() })).default([]),
  evidence: z.object({
    sourcePageUrl: z.string().url(),
    headingSnippet: z.string().default('')
  }),
  confidence: z.number().min(0).max(1)
});

const styleColorEvidenceSchema = z.object({
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  hsl: z.object({ h: z.number(), s: z.number(), l: z.number() }),
  count: z.number().int().nonnegative(),
  weightedScore: z.number().nonnegative(),
  sources: z.array(z.string())
});

const extractionResultSchema = z.object({
  apiVersion: z.string().default('3.0'),
  inputUrl: z.string().url(),
  finalUrl: z.string().url(),
  crawledAt: z.string().min(1),
  crawl: z.object({
    pagesRequested: z.number().int().positive(),
    pagesCrawled: z.number().int().nonnegative(),
    maxDepth: z.number().int().nonnegative(),
    durationsMs: z.object({
      total: z.number().int().nonnegative(),
      crawl: z.number().int().nonnegative(),
      style: z.number().int().nonnegative()
    })
  }),
  brand: z.object({
    canonicalName: z.string().optional(),
    aliases: z.array(z.string()).default([]),
    nameCandidates: z
      .array(
        z.object({
          value: z.string(),
          score: z.number(),
          count: z.number().int().nonnegative().optional(),
          reason: z.string().optional(),
          sources: z.array(z.string()).optional(),
          pageUrls: z.array(z.string().url()).optional()
        })
      )
      .default([]),
    name: z.string().optional(),
    tagline: z.string().optional(),
    logos: z.array(
      z.object({
        url: z.string().url(),
        type: z.enum(['img', 'svg', 'og-image', 'plugin']),
        confidence: z.number().min(0).max(1)
      })
    ),
    primaryLogo: z.string().url().optional(),
    favicons: z.array(z.string().url()),
    images: z.object({
      ogImage: z.string().url().optional(),
      twitterImage: z.string().url().optional()
    }),
    social: z.object({
      instagram: z.string().url().optional(),
      linkedin: z.string().url().optional(),
      facebook: z.string().url().optional(),
      youtube: z.string().url().optional(),
      x: z.string().url().optional(),
      tiktok: z.string().url().optional()
    }),
    contact: z.object({
      emails: z.array(z.string()),
      phones: z.array(z.string()),
      addressCandidates: z.array(z.string())
    }),
    trustSignals: z.object({
      partners: z.boolean(),
      testimonials: z.boolean(),
      awards: z.boolean(),
      press: z.boolean(),
      evidence: z.array(z.string())
    })
  }),
  style: z.object({
    colors: z.object({
      primary: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      background: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      text: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      evidence: z.array(styleColorEvidenceSchema)
    }),
    typography: z.object({
      primaryFonts: z.array(z.string()),
      secondaryFonts: z.array(z.string()),
      evidence: z.array(
        z.object({
          font: z.string(),
          count: z.number().int().nonnegative(),
          sources: z.array(z.string())
        })
      )
    })
  }),
  website: z
    .object({
      mode: z.string().default('template_samples'),
      discoveredUrlCount: z.number().int().nonnegative().default(0),
      pageTypes: z.array(
        z.object({
          type: z.string(),
          count: z.number().int().nonnegative(),
          sampleUrls: z.array(z.string().url()).default([])
        })
      ),
      sampleUrls: z.array(z.string().url()).default([]),
      keyPages: z.object({
        home: z.string().url().nullable(),
        about: z.string().url().nullable(),
        contact: z.string().url().nullable(),
        legal: z.array(z.string().url()).default([]),
        blog: z.array(z.string().url()).default([]),
        categories: z.array(z.string().url()).default([]),
        products: z.array(z.string().url()).default([]),
        account: z.array(z.string().url()).default([]),
        checkout: z.array(z.string().url()).default([])
      })
    })
    .optional(),
  content: z.object({
    pages: z.array(
      z.object({
        url: z.string().url(),
        pageType: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        headings: headingGroupSchema,
        textSamples: z.array(z.string()),
        sectionCandidates: z.array(sectionCandidateSchema)
      })
    ),
    sections: z.array(normalizedSectionSchema),
    markdownCorpus: z
      .object({
        generatedAt: z.string().optional(),
        documents: z.array(
          z.object({
            url: z.string().url(),
            pageType: z.string().optional(),
            title: z.string().optional(),
            artifactId: z.string(),
            source: z.enum(['local', 'remote']),
            tokens: z.number().int().nonnegative().optional(),
            qualityScore: z.number().min(0).max(1),
            snippet: z.string().optional()
          })
        )
      })
      .optional()
  }),
  pageReports: z.array(pageReportSchema),
  warnings: z.array(warningSchema),
  confidence: z.object({
    overall: z.number().min(0).max(1),
    fields: z.record(z.string(), z.number().min(0).max(1)),
    explain: z.record(z.string(), z.string()).optional(),
    extractionConfidence: z.number().min(0).max(1).optional()
  })
});

module.exports = {
  extractionResultSchema,
  normalizedSectionSchema,
  warningSchema
};
