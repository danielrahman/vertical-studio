'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '../lib/api-client';

const { apiRequest } = apiClient;

const inlineExample = `{
  "meta": {
    "companyName": "Inline Demo",
    "brandSlug": "inline-demo",
    "locale": "en-US",
    "industry": "boutique_developer"
  }
}`;

export function GenerateForm() {
  const router = useRouter();
  const [mode, setMode] = useState('companyIdentifier');
  const [companyIdentifier, setCompanyIdentifier] = useState('and-development');
  const [inputPath, setInputPath] = useState('');
  const [inlineData, setInlineData] = useState(inlineExample);
  const [previewBaseUrl, setPreviewBaseUrl] = useState('');
  const [customizationLevel, setCustomizationLevel] = useState('standard');
  const [locale, setLocale] = useState('');
  const [industry, setIndustry] = useState('boutique_developer');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const payload = useMemo(() => {
    const body = {
      options: {
        customizationLevel,
        locale: locale || undefined,
        industry: industry || undefined,
        previewBaseUrl: previewBaseUrl || undefined
      }
    };

    if (mode === 'companyIdentifier') {
      body.companyIdentifier = companyIdentifier;
    }

    if (mode === 'inputPath') {
      body.input = {
        path: inputPath
      };
    }

    if (mode === 'inputData') {
      try {
        body.input = {
          data: JSON.parse(inlineData)
        };
      } catch (_error) {
        return null;
      }
    }

    return body;
  }, [mode, companyIdentifier, inputPath, inlineData, previewBaseUrl, customizationLevel, locale, industry]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!payload) {
      setError('Inline JSON is invalid.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await apiRequest('/api/v1/generate', {
        method: 'POST',
        body: payload
      });

      router.push(`/jobs/${result.jobId}`);
    } catch (submitError) {
      setError(submitError.message || 'Failed to create generation job.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-3xl border border-white/70 bg-white/85 p-6 shadow-card">
      <div>
        <p className="text-xs uppercase tracking-[0.12em] text-ink/60">Input mode</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[
            { id: 'companyIdentifier', label: 'Company Identifier' },
            { id: 'inputPath', label: 'Input Path' },
            { id: 'inputData', label: 'Input Data JSON' }
          ].map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => setMode(item.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                mode === item.id ? 'bg-moss text-white' : 'bg-mist text-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'companyIdentifier' ? (
        <label className="block space-y-2">
          <span className="text-sm font-medium">companyIdentifier</span>
          <input
            value={companyIdentifier}
            onChange={(event) => setCompanyIdentifier(event.target.value)}
            className="w-full rounded-xl border border-ink/20 bg-white px-3 py-2"
            placeholder="and-development"
            required
          />
        </label>
      ) : null}

      {mode === 'inputPath' ? (
        <label className="block space-y-2">
          <span className="text-sm font-medium">input.path</span>
          <input
            value={inputPath}
            onChange={(event) => setInputPath(event.target.value)}
            className="w-full rounded-xl border border-ink/20 bg-white px-3 py-2"
            placeholder="samples/all-new-development-input.json"
            required
          />
        </label>
      ) : null}

      {mode === 'inputData' ? (
        <label className="block space-y-2">
          <span className="text-sm font-medium">input.data (JSON)</span>
          <textarea
            value={inlineData}
            onChange={(event) => setInlineData(event.target.value)}
            rows={10}
            className="w-full rounded-xl border border-ink/20 bg-white px-3 py-2 font-mono text-sm"
          />
        </label>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-medium">previewBaseUrl (optional)</span>
          <input
            value={previewBaseUrl}
            onChange={(event) => setPreviewBaseUrl(event.target.value)}
            className="w-full rounded-xl border border-ink/20 bg-white px-3 py-2"
            placeholder="https://preview.example.com"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium">customizationLevel</span>
          <select
            value={customizationLevel}
            onChange={(event) => setCustomizationLevel(event.target.value)}
            className="w-full rounded-xl border border-ink/20 bg-white px-3 py-2"
          >
            <option value="minimal">minimal</option>
            <option value="standard">standard</option>
            <option value="full">full</option>
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium">locale (optional)</span>
          <input
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
            className="w-full rounded-xl border border-ink/20 bg-white px-3 py-2"
            placeholder="cs-CZ"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium">industry</span>
          <select
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
            className="w-full rounded-xl border border-ink/20 bg-white px-3 py-2"
          >
            <option value="boutique_developer">boutique_developer</option>
            <option value="real_estate">real_estate</option>
            <option value="architecture">architecture</option>
          </select>
        </label>
      </div>

      {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-full bg-moss px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-moss/90 disabled:opacity-60"
      >
        {isSubmitting ? 'Submitting...' : 'Create Generation Job'}
      </button>
    </form>
  );
}
