class AIEnrichmentProvider {
  async enrich(_extractedData, _context) {
    throw new Error('Not implemented');
  }
}

class TemplateFallbackEnrichmentProvider extends AIEnrichmentProvider {
  async enrich(extractedData, context = {}) {
    const companyName =
      context.companyName ||
      extractedData.title ||
      (context.websiteUrl ? new URL(context.websiteUrl).hostname.replace(/^www\./, '') : 'Company');

    const baseDescription =
      extractedData.description ||
      extractedData.paragraphs.find((text) => text.length > 60) ||
      'Premium projects delivered with precision, speed and long-term value.';

    const tagline = extractedData.headings.h1[0] || extractedData.title || `${companyName} - premium partner`;
    const valueProps = [
      {
        id: 'vp-1',
        icon: 'quality',
        title: 'Quality First',
        description: 'Execution focused on durable materials and long-term value.',
        order: 1
      },
      {
        id: 'vp-2',
        icon: 'experience',
        title: 'Experienced Team',
        description: 'Seasoned specialists across design, delivery and client care.',
        order: 2
      },
      {
        id: 'vp-3',
        icon: 'location',
        title: 'Strategic Locations',
        description: 'Projects selected and designed for lasting market relevance.',
        order: 3
      }
    ];

    return {
      provider: 'fallback-template',
      companyName,
      tagline,
      description: baseDescription,
      valueProps,
      warnings: ['OPENAI_API_KEY is missing, using deterministic fallback enrichment.']
    };
  }
}

class OpenAIEnrichmentProvider extends AIEnrichmentProvider {
  constructor(options = {}) {
    super();
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    this.model = options.model || process.env.VERTICAL_OPENAI_MODEL || 'gpt-4.1-mini';
  }

  async enrich(extractedData, context = {}) {
    if (!this.apiKey) {
      const fallback = new TemplateFallbackEnrichmentProvider();
      return fallback.enrich(extractedData, context);
    }

    const prompt = {
      companyName: context.companyName || null,
      industry: context.industry || 'boutique_developer',
      locale: context.locale || 'en-US',
      extracted: {
        title: extractedData.title,
        description: extractedData.description,
        headings: extractedData.headings,
        contacts: extractedData.contacts,
        paragraphs: extractedData.paragraphs.slice(0, 6),
        projectBlocks: extractedData.projectBlocks.slice(0, 4)
      }
    };

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            role: 'system',
            content:
              'Return strict JSON object with keys: companyName, tagline, description, valueProps (3-4 items with id,title,description,icon,order), tone.'
          },
          {
            role: 'user',
            content: `Build marketing copy for this company context: ${JSON.stringify(prompt)}`
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
      const fallback = new TemplateFallbackEnrichmentProvider();
      const fallbackResult = await fallback.enrich(extractedData, context);
      fallbackResult.warnings.push(`OpenAI enrichment failed with HTTP ${response.status}, fallback applied.`);
      return fallbackResult;
    }

    const payload = await response.json();
    const text = payload.output_text || '{}';

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (_error) {
      const fallback = new TemplateFallbackEnrichmentProvider();
      const fallbackResult = await fallback.enrich(extractedData, context);
      fallbackResult.warnings.push('OpenAI returned malformed JSON, fallback applied.');
      return fallbackResult;
    }

    const valueProps = Array.isArray(parsed.valueProps) ? parsed.valueProps : [];

    return {
      provider: 'openai',
      companyName: parsed.companyName || context.companyName || extractedData.title || 'Company',
      tagline: parsed.tagline || extractedData.title || 'Premium real estate partner',
      description:
        parsed.description ||
        extractedData.description ||
        'Premium projects delivered with precision and long-term value.',
      tone: parsed.tone || 'professional',
      valueProps: valueProps.slice(0, 4).map((item, index) => ({
        id: item.id || `vp-${index + 1}`,
        icon: item.icon || 'quality',
        title: item.title || `Value ${index + 1}`,
        description: item.description || 'Reliable execution and measurable outcomes.',
        order: typeof item.order === 'number' ? item.order : index + 1
      })),
      warnings: []
    };
  }
}

module.exports = {
  AIEnrichmentProvider,
  OpenAIEnrichmentProvider,
  TemplateFallbackEnrichmentProvider
};
