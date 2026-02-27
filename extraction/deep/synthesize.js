function trimSentences(lines, limit = 6) {
  return (lines || [])
    .map((line) => String(line || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function fallbackSynthesis(input) {
  const brand = input.baseResult.brand || {};
  const outside = input.outside || {};
  const sections = (input.baseResult.content && input.baseResult.content.sections) || [];
  const markdownDocs = (input.markdownCorpus && input.markdownCorpus.documents) || [];

  const keySignals = trimSentences([
    (brand.canonicalName || brand.name) && `Brand: ${brand.canonicalName || brand.name}`,
    brand.tagline && `Tagline: ${brand.tagline}`,
    sections.length && `Detected website sections: ${sections.map((s) => s.type).join(', ')}`,
    markdownDocs.length && `Markdown corpus: ${markdownDocs.length} docs`,
    markdownDocs[0] && markdownDocs[0].pageType && `Primary page type: ${markdownDocs[0].pageType}`,
    outside.company && outside.company.registryFindings && outside.company.registryFindings[0],
    outside.presence &&
      outside.presence.people &&
      outside.presence.people.length &&
      `People coverage: ${outside.presence.people.length} profiles`,
    outside.pr && outside.pr.mentions && outside.pr.mentions[0] && `Recent mention: ${outside.pr.mentions[0].title}`,
    outside.tech && outside.tech.cms && outside.tech.cms.length && `CMS signals: ${outside.tech.cms.join(', ')}`
  ]);

  return {
    executiveSummary: {
      cz: `Shrnutí: ${brand.canonicalName || brand.name || 'Firma'} má online přítomnost s klíčovými signály: ${keySignals.join('; ') || 'omezená data'}.`,
      en: `Summary: ${brand.canonicalName || brand.name || 'Company'} has an online footprint with key signals: ${keySignals.join('; ') || 'limited data'}.`
    },
    brandNarrative:
      brand.tagline ||
      'Brand narrative indicates practical value delivery, trust-building messaging, and conversion-oriented structure.',
    positioning:
      sections.some((section) => section.type === 'SERVICES') || sections.some((section) => section.type === 'PROJECTS')
        ? 'Service/solution-led positioning with proof-oriented structure.'
        : 'Positioning inferred from limited sections; requires additional pages for stronger confidence.',
    targetSegments: trimSentences([
      sections.some((section) => section.type === 'PROJECTS') && 'Prospects evaluating references/case studies',
      sections.some((section) => section.type === 'CONTACT') && 'High-intent inbound leads',
      'Brand-aware returning visitors'
    ]),
    proofPoints: trimSentences([
      brand.trustSignals && brand.trustSignals.partners && 'Partner/clients trust signal present',
      brand.trustSignals && brand.trustSignals.testimonials && 'Testimonial signal present',
      outside.presence && outside.presence.people && outside.presence.people.length && 'Public people profiles detected',
      outside.pr && outside.pr.mentions && outside.pr.mentions.length && 'External mentions detected',
      outside.tech && outside.tech.trackers && outside.tech.trackers.length && 'Measurement stack detected'
    ]),
    differentiators: trimSentences([
      brand.tagline && `Tagline-led differentiation: ${brand.tagline}`,
      outside.competitive && outside.competitive.competitors && outside.competitive.competitors.length
        ? 'Visible competitor set identified from search overlap'
        : null,
      outside.tech && outside.tech.cms && outside.tech.cms.length ? `Tech baseline: ${outside.tech.cms.join(', ')}` : null
    ])
  };
}

async function openAiSynthesis({ apiKey, model, input }) {
  const markdownHighlights = ((input.markdownCorpus && input.markdownCorpus.documents) || []).slice(0, 8).map((doc) => ({
    url: doc.url,
    pageType: doc.pageType || 'other',
    title: doc.title || null,
    qualityScore: doc.qualityScore || 0,
    snippet: (doc.snippet || '').slice(0, 260)
  }));

  const prompt = {
    url: input.url,
    brand: input.baseResult.brand,
    style: input.baseResult.style,
    website: input.baseResult.website,
    sections: input.baseResult.content.sections,
    markdownHighlights,
    outside: input.outside,
    warnings: input.baseResult.warnings
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content:
            'Return strict JSON: executiveSummary:{cz,en}, brandNarrative, positioning, targetSegments[], proofPoints[], differentiators[]. Keep concise and factual.'
        },
        {
          role: 'user',
          content: `Create bilingual CZ+EN strategic synthesis from extracted data: ${JSON.stringify(prompt)}`
        }
      ],
      text: {
        format: {
          type: 'json_object'
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI synthesis failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  const text = payload.output_text || '{}';
  return JSON.parse(text);
}

async function synthesizeResearch({ url, baseResult, markdownCorpus, outside, apiKey, model, warnings }) {
  if (!apiKey) {
    warnings.push('Synthesis used fallback template: OPENAI_API_KEY missing');
    return fallbackSynthesis({ url, baseResult, markdownCorpus, outside });
  }

  try {
    const enriched = await openAiSynthesis({
      apiKey,
      model,
      input: { url, baseResult, markdownCorpus, outside }
    });

    return {
      executiveSummary: {
        cz: String(enriched.executiveSummary && enriched.executiveSummary.cz ? enriched.executiveSummary.cz : ''),
        en: String(enriched.executiveSummary && enriched.executiveSummary.en ? enriched.executiveSummary.en : '')
      },
      brandNarrative: String(enriched.brandNarrative || ''),
      positioning: String(enriched.positioning || ''),
      targetSegments: Array.isArray(enriched.targetSegments) ? enriched.targetSegments.map(String).slice(0, 12) : [],
      proofPoints: Array.isArray(enriched.proofPoints) ? enriched.proofPoints.map(String).slice(0, 16) : [],
      differentiators: Array.isArray(enriched.differentiators) ? enriched.differentiators.map(String).slice(0, 12) : []
    };
  } catch (error) {
    warnings.push(`Synthesis fallback applied: ${error.message}`);
    return fallbackSynthesis({ url, baseResult, markdownCorpus, outside });
  }
}

module.exports = {
  synthesizeResearch,
  fallbackSynthesis
};
