const { z } = require('zod');
const { extractionResultSchema } = require('./extraction-schema');

const evidenceSourceSchema = z.object({
  id: z.string().min(1),
  step: z.string().min(1),
  type: z.string().min(1),
  url: z.string().url().optional(),
  artifactId: z.string().optional(),
  title: z.string().optional(),
  timestamp: z.string().optional(),
  excerpt: z.string().optional()
});

const deepResearchSchema = extractionResultSchema.extend({
  research: z.object({
    executiveSummary: z.object({
      cz: z.string(),
      en: z.string()
    }),
    brandNarrative: z.string(),
    positioning: z.string(),
    targetSegments: z.array(z.string()),
    proofPoints: z.array(z.string()),
    differentiators: z.array(z.string())
  }),
  outside: z.object({
    company: z.object({
      legalNameCandidates: z.array(z.string()),
      ownershipSignals: z.array(z.string()),
      registryFindings: z.array(z.string()),
      evidence: z.array(z.string().url())
    }),
    presence: z.object({
      people: z.array(
        z.object({
          name: z.string(),
          title: z.string().optional(),
          organization: z.string().optional(),
          profileUrl: z.string().url(),
          sourceDomain: z.string().optional(),
          confidence: z.number().min(0).max(1)
        })
      ),
      socialProfiles: z.array(z.string().url()),
      directories: z.array(z.string().url()),
      listingSignals: z.array(z.string())
    }),
    pr: z.object({
      mentions: z.array(
        z.object({
          title: z.string(),
          url: z.string().url(),
          sentiment: z.enum(['positive', 'neutral', 'negative']),
          snippet: z.string().optional(),
          publishedAt: z.string().optional()
        })
      ),
      keyTopics: z.array(z.string()),
      timeline: z.array(z.string()),
      risks: z.array(z.string()),
      opportunities: z.array(z.string())
    }),
    tech: z.object({
      cms: z.array(z.string()),
      trackers: z.array(z.string()),
      cdn: z.array(z.string()),
      hosting: z.array(z.string()),
      evidence: z.array(z.string().url())
    }),
    competitive: z.object({
      competitors: z.array(
        z.object({
          name: z.string(),
          domain: z.string(),
          reason: z.string(),
          source: z.string().url().optional()
        })
      ),
      shareOfVoiceHints: z.array(z.string())
    })
  }),
  provenance: z.object({
    sources: z.array(evidenceSourceSchema),
    fields: z.record(z.string(), z.array(z.string())),
    fieldEvidence: z
      .array(
        z.object({
          field: z.string(),
          sourceId: z.string(),
          confidence: z.number().min(0).max(1).optional()
        })
      )
      .default([])
  }),
  artifacts: z.object({
    root: z.string(),
    items: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        path: z.string(),
        metadata: z.record(z.string(), z.any()).optional()
      })
    )
  }),
  cost: z.object({
    budgetUsd: z.number(),
    totalUsd: z.number(),
    providers: z.record(z.string(), z.number()),
    withinBudget: z.boolean()
  }),
  coverage: z.object({
    completedSteps: z.array(z.string()),
    skippedSteps: z.array(z.string()),
    gaps: z.array(z.string())
  }),
  confidence: z.object({
    overall: z.number().min(0).max(1),
    fields: z.record(z.string(), z.number().min(0).max(1)),
    explain: z.record(z.string(), z.string()).optional(),
    extractionConfidence: z.number().min(0).max(1),
    inferenceConfidence: z.number().min(0).max(1)
  })
});

module.exports = {
  deepResearchSchema,
  evidenceSourceSchema
};
