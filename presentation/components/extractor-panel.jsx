'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import apiClient from '../lib/api-client';

const { apiRequest } = apiClient;

const defaultForm = {
  url: '',
  mode: 'forensic',
  qualityProfile: 'max_quality',
  siteMapMode: 'template_samples',
  ignoreRobots: true,
  budgetUsd: 5,
  maxDurationMs: 1800000,
  markdownMode: 'hybrid',
  markdownMethod: 'auto',
  markdownMaxDocs: 20,
  providers: ['exa', 'serp', 'company_data', 'social_enrichment', 'maps_reviews', 'tech_intel', 'pr_reputation'],
  captchaEnabled: false,
  captchaProvider: '2captcha',
  captchaApiKeyRef: '',
  serpapiRef: '',
  companyDataRef: '',
  socialRef: ''
};

const tabs = ['Overview', 'Brand', 'Website', 'Off-site', 'PR', 'Evidence', 'Cost'];

export function ExtractorPanel() {
  const [form, setForm] = useState(defaultForm);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [job, setJob] = useState(null);
  const [status, setStatus] = useState(null);
  const [result, setResult] = useState(null);
  const [artifacts, setArtifacts] = useState(null);
  const [tab, setTab] = useState('Overview');
  const [polling, setPolling] = useState(false);
  const pollTimerRef = useRef(null);

  const canCancel = status && !['completed', 'failed', 'cancelled'].includes(status.status);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, []);

  async function fetchArtifacts(jobId) {
    try {
      const payload = await apiRequest(`/api/v1/extract/jobs/${jobId}/artifacts`);
      setArtifacts(payload);
    } catch (_error) {
      // Keep optional artifacts fetch silent.
    }
  }

  async function fetchResult(jobId) {
    try {
      const payload = await apiRequest(`/api/v1/extract/jobs/${jobId}/result`);
      setResult(payload);
      await fetchArtifacts(jobId);
    } catch (resultError) {
      setError(resultError.message || 'Failed to fetch extraction result');
    }
  }

  async function pollStatus(jobId) {
    setPolling(true);
    try {
      const payload = await apiRequest(`/api/v1/extract/jobs/${jobId}`);
      setStatus(payload);

      if (payload.status === 'completed') {
        setPolling(false);
        await fetchResult(jobId);
        return;
      }

      if (payload.status === 'failed' || payload.status === 'cancelled') {
        setPolling(false);
        return;
      }

      pollTimerRef.current = setTimeout(() => {
        pollStatus(jobId);
      }, 2000);
    } catch (statusError) {
      setPolling(false);
      setError(statusError.message || 'Failed to poll extraction status');
    }
  }

  async function runExtract(event) {
    event.preventDefault();
    setCreating(true);
    setError('');
    setStatus(null);
    setResult(null);
    setArtifacts(null);

    try {
      const payload = {
        url: form.url,
        mode: form.mode,
        qualityProfile: form.qualityProfile,
        siteMapMode: form.siteMapMode,
        ignoreRobots: Boolean(form.ignoreRobots),
        budgetUsd: Number(form.budgetUsd),
        maxDurationMs: Number(form.maxDurationMs),
        localeHints: ['cs-CZ', 'en-US'],
        auth: {
          mode: 'none'
        },
        captcha: {
          enabled: Boolean(form.captchaEnabled),
          ...(form.captchaEnabled && form.captchaProvider ? { provider: form.captchaProvider } : {}),
          ...(form.captchaEnabled && form.captchaApiKeyRef ? { apiKeyRef: form.captchaApiKeyRef } : {})
        },
        offsite: {
          enabled: true,
          providers: form.providers,
          providerKeyRefs: {
            ...(form.serpapiRef ? { serpapiRef: form.serpapiRef } : {}),
            ...(form.companyDataRef ? { companyDataRef: form.companyDataRef } : {}),
            ...(form.socialRef ? { socialRef: form.socialRef } : {})
          }
        },
        markdown: {
          enabled: true,
          mode: form.markdownMode,
          remoteProvider: 'markdown_new',
          method: form.markdownMethod,
          retainImages: false,
          maxDocs: Number(form.markdownMaxDocs)
        }
      };

      const created = await apiRequest('/api/v1/extract', {
        method: 'POST',
        body: payload
      });

      setJob(created);
      await pollStatus(created.jobId);
    } catch (requestError) {
      setError(requestError.message || 'Extractor request failed.');
    } finally {
      setCreating(false);
    }
  }

  async function cancelJob() {
    if (!job || !job.jobId) {
      return;
    }

    try {
      await apiRequest(`/api/v1/extract/jobs/${job.jobId}/cancel`, { method: 'POST' });
      await pollStatus(job.jobId);
    } catch (cancelError) {
      setError(cancelError.message || 'Unable to cancel extraction job');
    }
  }

  const overview = useMemo(() => {
    if (!result) {
      return null;
    }

    return {
      pages: result.crawl && result.crawl.pagesCrawled ? result.crawl.pagesCrawled : 0,
      pageTypes: result.website && Array.isArray(result.website.pageTypes) ? result.website.pageTypes.length : 0,
      markdownDocs:
        result.content && result.content.markdownCorpus && Array.isArray(result.content.markdownCorpus.documents)
          ? result.content.markdownCorpus.documents.length
          : 0,
      warnings: Array.isArray(result.warnings) ? result.warnings.length : 0,
      confidence: result.confidence && typeof result.confidence.overall === 'number' ? result.confidence.overall : 0,
      budget: result.cost ? `${result.cost.totalUsd}/${result.cost.budgetUsd}` : '-'
    };
  }, [result]);

  return (
    <div className="space-y-6">
      <form onSubmit={runExtract} className="space-y-4 rounded-3xl border border-white/70 bg-white/85 p-6 shadow-card">
        <h3 className="text-xl text-ink" style={{ fontFamily: 'var(--font-heading)' }}>
          Deep Research Extractor (Async)
        </h3>

        <input
          required
          type="url"
          value={form.url}
          onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
          placeholder="https://example.com"
          className="w-full rounded-xl border border-ink/20 bg-white px-3 py-2"
        />

        <div className="grid gap-3 sm:grid-cols-4">
          <select
            value={form.qualityProfile}
            onChange={(event) => setForm((prev) => ({ ...prev, qualityProfile: event.target.value }))}
            className="rounded-xl border border-ink/20 bg-white px-3 py-2"
          >
            <option value="max_quality">max_quality</option>
            <option value="hybrid">hybrid</option>
            <option value="local_only">local_only</option>
          </select>
          <select
            value={form.siteMapMode}
            onChange={(event) => setForm((prev) => ({ ...prev, siteMapMode: event.target.value }))}
            className="rounded-xl border border-ink/20 bg-white px-3 py-2"
          >
            <option value="template_samples">template_samples</option>
            <option value="marketing_only">marketing_only</option>
            <option value="all_urls">all_urls</option>
          </select>
          <select
            value={form.mode}
            onChange={(event) => setForm((prev) => ({ ...prev, mode: event.target.value }))}
            className="rounded-xl border border-ink/20 bg-white px-3 py-2"
          >
            <option value="forensic">forensic</option>
            <option value="balanced">balanced</option>
            <option value="fast">fast</option>
          </select>
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={form.budgetUsd}
            onChange={(event) => setForm((prev) => ({ ...prev, budgetUsd: event.target.value }))}
            className="rounded-xl border border-ink/20 bg-white px-3 py-2"
            placeholder="budgetUsd"
          />
          <input
            type="number"
            min="10000"
            max="1800000"
            step="10000"
            value={form.maxDurationMs}
            onChange={(event) => setForm((prev) => ({ ...prev, maxDurationMs: event.target.value }))}
            className="rounded-xl border border-ink/20 bg-white px-3 py-2"
            placeholder="maxDurationMs"
          />
          <label className="flex items-center gap-2 rounded-xl border border-ink/20 bg-white px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={form.ignoreRobots}
              onChange={(event) => setForm((prev) => ({ ...prev, ignoreRobots: event.target.checked }))}
            />
            Ignore robots
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <select
            value={form.markdownMode}
            onChange={(event) => setForm((prev) => ({ ...prev, markdownMode: event.target.value }))}
            className="rounded-xl border border-ink/20 bg-white px-3 py-2"
          >
            <option value="hybrid">md: hybrid</option>
            <option value="local">md: local</option>
            <option value="remote">md: remote</option>
          </select>
          <select
            value={form.markdownMethod}
            onChange={(event) => setForm((prev) => ({ ...prev, markdownMethod: event.target.value }))}
            className="rounded-xl border border-ink/20 bg-white px-3 py-2"
          >
            <option value="auto">md method: auto</option>
            <option value="ai">md method: ai</option>
            <option value="browser">md method: browser</option>
          </select>
          <input
            type="number"
            min="1"
            max="100"
            value={form.markdownMaxDocs}
            onChange={(event) => setForm((prev) => ({ ...prev, markdownMaxDocs: event.target.value }))}
            className="rounded-xl border border-ink/20 bg-white px-3 py-2"
            placeholder="markdown max docs"
          />
        </div>

        <div className="rounded-2xl border border-ink/10 bg-white/70 p-3">
          <p className="text-sm font-semibold text-ink">Captcha solver (optional)</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-4">
            <label className="flex items-center gap-2 rounded-xl border border-ink/20 bg-white px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={form.captchaEnabled}
                onChange={(event) => setForm((prev) => ({ ...prev, captchaEnabled: event.target.checked }))}
              />
              Enable captcha
            </label>
            <select
              value={form.captchaProvider}
              onChange={(event) => setForm((prev) => ({ ...prev, captchaProvider: event.target.value }))}
              className="rounded-xl border border-ink/20 bg-white px-3 py-2"
              disabled={!form.captchaEnabled}
            >
              <option value="2captcha">2captcha</option>
              <option value="anticaptcha">anticaptcha</option>
              <option value="capsolver">capsolver</option>
            </select>
            <input
              value={form.captchaApiKeyRef}
              onChange={(event) => setForm((prev) => ({ ...prev, captchaApiKeyRef: event.target.value }))}
              className="rounded-xl border border-ink/20 bg-white px-3 py-2 sm:col-span-2"
              placeholder="captcha apiKeyRef (secret ref)"
              disabled={!form.captchaEnabled}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-white/70 p-3">
          <p className="text-sm font-semibold text-ink">Paid provider keys (optional refs)</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <input
              value={form.serpapiRef}
              onChange={(event) => setForm((prev) => ({ ...prev, serpapiRef: event.target.value }))}
              className="rounded-xl border border-ink/20 bg-white px-3 py-2"
              placeholder="serpapiRef"
            />
            <input
              value={form.companyDataRef}
              onChange={(event) => setForm((prev) => ({ ...prev, companyDataRef: event.target.value }))}
              className="rounded-xl border border-ink/20 bg-white px-3 py-2"
              placeholder="companyDataRef"
            />
            <input
              value={form.socialRef}
              onChange={(event) => setForm((prev) => ({ ...prev, socialRef: event.target.value }))}
              className="rounded-xl border border-ink/20 bg-white px-3 py-2"
              placeholder="socialRef"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={creating || polling}
            className="rounded-full bg-moss px-5 py-2 text-sm font-semibold text-white hover:bg-moss/90 disabled:opacity-60"
          >
            {creating ? 'Creating job...' : polling ? 'Running...' : 'Run Deep Extract'}
          </button>

          {canCancel ? (
            <button
              type="button"
              onClick={cancelJob}
              className="rounded-full border border-rose-300 px-5 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"
            >
              Cancel job
            </button>
          ) : null}
        </div>
      </form>

      {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p> : null}

      {job ? (
        <section className="rounded-3xl border border-white/70 bg-white/85 p-6 shadow-card">
          <h3 className="text-xl text-ink" style={{ fontFamily: 'var(--font-heading)' }}>
            Job Status
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-4 text-sm">
            <div className="rounded-2xl bg-mist px-3 py-2">
              <p className="text-ink/60">Job ID</p>
              <p className="break-all text-ink">{job.jobId}</p>
            </div>
            <div className="rounded-2xl bg-mist px-3 py-2">
              <p className="text-ink/60">Status</p>
              <p className="text-ink">{status ? status.status : 'pending'}</p>
            </div>
            <div className="rounded-2xl bg-mist px-3 py-2">
              <p className="text-ink/60">Phase</p>
              <p className="text-ink">{status && status.progress ? status.progress.phase : 'pending'}</p>
            </div>
            <div className="rounded-2xl bg-mist px-3 py-2">
              <p className="text-ink/60">Budget</p>
              <p className="text-ink">{status && status.cost ? `${status.cost.totalUsd}/${status.cost.budgetUsd}` : '-'}</p>
            </div>
          </div>
        </section>
      ) : null}

      {result ? (
        <div className="space-y-4">
          <section className="rounded-3xl border border-white/70 bg-white/85 p-4 shadow-card">
            <div className="flex flex-wrap gap-2">
              {tabs.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTab(item)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    tab === item ? 'bg-moss text-white' : 'bg-mist text-ink hover:bg-ink/10'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </section>

          {tab === 'Overview' ? (
            <section className="rounded-3xl border border-white/70 bg-white/85 p-6 shadow-card">
              <h3 className="text-xl text-ink" style={{ fontFamily: 'var(--font-heading)' }}>
                Overview
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <div className="rounded-2xl bg-mist px-3 py-2 text-sm">
                  <p className="text-ink/60">Pages</p>
                  <p className="text-xl font-semibold text-ink">{overview.pages}</p>
                </div>
                <div className="rounded-2xl bg-mist px-3 py-2 text-sm">
                  <p className="text-ink/60">Page Types</p>
                  <p className="text-xl font-semibold text-ink">{overview.pageTypes}</p>
                </div>
                <div className="rounded-2xl bg-mist px-3 py-2 text-sm">
                  <p className="text-ink/60">Markdown Docs</p>
                  <p className="text-xl font-semibold text-ink">{overview.markdownDocs}</p>
                </div>
                <div className="rounded-2xl bg-mist px-3 py-2 text-sm">
                  <p className="text-ink/60">Warnings</p>
                  <p className="text-xl font-semibold text-ink">{overview.warnings}</p>
                </div>
                <div className="rounded-2xl bg-mist px-3 py-2 text-sm">
                  <p className="text-ink/60">Confidence</p>
                  <p className="text-xl font-semibold text-ink">{overview.confidence}</p>
                </div>
                <div className="rounded-2xl bg-mist px-3 py-2 text-sm">
                  <p className="text-ink/60">Cost</p>
                  <p className="text-xl font-semibold text-ink">{overview.budget}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
                <div className="rounded-2xl border border-ink/10 p-3">
                  <p className="font-semibold text-ink">Executive Summary (CZ)</p>
                  <p className="mt-1 text-ink/80">{result.research && result.research.executiveSummary ? result.research.executiveSummary.cz : '-'}</p>
                </div>
                <div className="rounded-2xl border border-ink/10 p-3">
                  <p className="font-semibold text-ink">Executive Summary (EN)</p>
                  <p className="mt-1 text-ink/80">{result.research && result.research.executiveSummary ? result.research.executiveSummary.en : '-'}</p>
                </div>
              </div>
            </section>
          ) : null}

          {tab === 'Brand' ? (
            <section className="rounded-3xl border border-white/70 bg-white/85 p-6 shadow-card text-sm">
              <h3 className="text-xl text-ink" style={{ fontFamily: 'var(--font-heading)' }}>Brand</h3>
              <pre className="mt-3 max-h-[520px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                {JSON.stringify(result.brand, null, 2)}
              </pre>
            </section>
          ) : null}

          {tab === 'Website' ? (
            <section className="rounded-3xl border border-white/70 bg-white/85 p-6 shadow-card text-sm">
              <h3 className="text-xl text-ink" style={{ fontFamily: 'var(--font-heading)' }}>Website</h3>
              <pre className="mt-3 max-h-[520px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                {JSON.stringify({ website: result.website, crawl: result.crawl, style: result.style, content: result.content }, null, 2)}
              </pre>
            </section>
          ) : null}

          {tab === 'Off-site' ? (
            <section className="rounded-3xl border border-white/70 bg-white/85 p-6 shadow-card text-sm">
              <h3 className="text-xl text-ink" style={{ fontFamily: 'var(--font-heading)' }}>Off-site</h3>
              <pre className="mt-3 max-h-[520px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                {JSON.stringify(result.outside, null, 2)}
              </pre>
            </section>
          ) : null}

          {tab === 'PR' ? (
            <section className="rounded-3xl border border-white/70 bg-white/85 p-6 shadow-card text-sm">
              <h3 className="text-xl text-ink" style={{ fontFamily: 'var(--font-heading)' }}>PR & Reputation</h3>
              <pre className="mt-3 max-h-[520px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                {JSON.stringify(result.outside && result.outside.pr ? result.outside.pr : {}, null, 2)}
              </pre>
            </section>
          ) : null}

          {tab === 'Evidence' ? (
            <section className="rounded-3xl border border-white/70 bg-white/85 p-6 shadow-card text-sm">
              <h3 className="text-xl text-ink" style={{ fontFamily: 'var(--font-heading)' }}>Evidence</h3>
              <pre className="mt-3 max-h-[520px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                {JSON.stringify({ provenance: result.provenance, artifacts }, null, 2)}
              </pre>
            </section>
          ) : null}

          {tab === 'Cost' ? (
            <section className="rounded-3xl border border-white/70 bg-white/85 p-6 shadow-card text-sm">
              <h3 className="text-xl text-ink" style={{ fontFamily: 'var(--font-heading)' }}>Cost & Coverage</h3>
              <pre className="mt-3 max-h-[520px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                {JSON.stringify({ cost: result.cost, coverage: result.coverage, warnings: result.warnings }, null, 2)}
              </pre>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
