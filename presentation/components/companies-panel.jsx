'use client';

import { useEffect, useState } from 'react';
import apiClient from '../lib/api-client';
import { StatusBadge } from './status-badge';

const { apiRequest } = apiClient;

const defaultForm = {
  name: '',
  brandSlug: '',
  locale: 'en-US',
  industry: 'boutique_developer',
  websiteUrl: '',
  extractionQuality: 'max_quality'
};

export function CompaniesPanel() {
  const [companies, setCompanies] = useState([]);
  const [createForm, setCreateForm] = useState(defaultForm);
  const [selectedId, setSelectedId] = useState('');
  const [updateForm, setUpdateForm] = useState({ name: '', websiteUrl: '', retriggerExtraction: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function loadCompanies() {
    setLoading(true);
    try {
      const list = await apiRequest('/api/v1/companies');
      setCompanies(Array.isArray(list) ? list : []);
      setError('');
    } catch (listError) {
      setError(listError.message || 'Failed to load companies.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCompanies();
  }, []);

  async function createCompany(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const body = {
        ...createForm
      };

      if (!body.websiteUrl) {
        delete body.websiteUrl;
      } else {
        body.extraction = {
          enabled: true,
          qualityProfile: createForm.extractionQuality,
          siteMapMode: 'template_samples',
          mode: 'forensic',
          markdown: {
            enabled: true,
            mode: 'hybrid',
            remoteProvider: 'markdown_new',
            method: 'auto',
            retainImages: false,
            maxDocs: 20
          }
        };
      }

      delete body.extractionQuality;

      await apiRequest('/api/v1/companies', {
        method: 'POST',
        body
      });

      setCreateForm(defaultForm);
      await loadCompanies();
    } catch (createError) {
      setError(createError.message || 'Failed to create company.');
    } finally {
      setSaving(false);
    }
  }

  async function updateCompany(event) {
    event.preventDefault();
    if (!selectedId) {
      setError('Select company to update.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const body = {
        ...updateForm
      };

      if (!body.name) {
        delete body.name;
      }

      if (!body.websiteUrl) {
        delete body.websiteUrl;
      }

      if (!body.retriggerExtraction) {
        delete body.retriggerExtraction;
      } else {
        body.extraction = {
          enabled: true,
          qualityProfile: 'max_quality',
          siteMapMode: 'template_samples',
          mode: 'forensic',
          markdown: {
            enabled: true,
            mode: 'hybrid',
            remoteProvider: 'markdown_new',
            method: 'auto',
            retainImages: false,
            maxDocs: 20
          }
        };
      }

      await apiRequest(`/api/v1/companies/${selectedId}`, {
        method: 'PUT',
        body
      });

      setUpdateForm({ name: '', websiteUrl: '', retriggerExtraction: false });
      await loadCompanies();
    } catch (updateError) {
      setError(updateError.message || 'Failed to update company.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={createCompany} className="space-y-4 rounded-3xl border border-white/70 bg-white/85 p-6 shadow-card">
          <h3 className="text-xl text-ink" style={{ fontFamily: 'var(--font-heading)' }}>
            Create Company
          </h3>

          <input
            value={createForm.name}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Name"
            className="w-full rounded-xl border border-ink/20 bg-white px-3 py-2"
            required
          />
          <input
            value={createForm.brandSlug}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, brandSlug: event.target.value }))}
            placeholder="brandSlug"
            className="w-full rounded-xl border border-ink/20 bg-white px-3 py-2"
          />
          <input
            value={createForm.websiteUrl}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, websiteUrl: event.target.value }))}
            placeholder="https://example.com (optional, triggers extraction)"
            className="w-full rounded-xl border border-ink/20 bg-white px-3 py-2"
          />

          <select
            value={createForm.extractionQuality}
            onChange={(event) => setCreateForm((prev) => ({ ...prev, extractionQuality: event.target.value }))}
            className="w-full rounded-xl border border-ink/20 bg-white px-3 py-2"
          >
            <option value="max_quality">extraction: max_quality</option>
            <option value="hybrid">extraction: hybrid</option>
            <option value="local_only">extraction: local_only</option>
          </select>

          <div className="grid grid-cols-2 gap-3">
            <input
              value={createForm.locale}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, locale: event.target.value }))}
              placeholder="locale"
              className="rounded-xl border border-ink/20 bg-white px-3 py-2"
            />
            <select
              value={createForm.industry}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, industry: event.target.value }))}
              className="rounded-xl border border-ink/20 bg-white px-3 py-2"
            >
              <option value="boutique_developer">boutique_developer</option>
              <option value="real_estate">real_estate</option>
              <option value="architecture">architecture</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-moss px-5 py-2 text-sm font-semibold text-white hover:bg-moss/90 disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Create'}
          </button>
        </form>

        <form onSubmit={updateCompany} className="space-y-4 rounded-3xl border border-white/70 bg-white/85 p-6 shadow-card">
          <h3 className="text-xl text-ink" style={{ fontFamily: 'var(--font-heading)' }}>
            Update Company
          </h3>

          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="w-full rounded-xl border border-ink/20 bg-white px-3 py-2"
          >
            <option value="">Select company</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name || company.brandSlug || company.id}
              </option>
            ))}
          </select>

          <input
            value={updateForm.name}
            onChange={(event) => setUpdateForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="New name (optional)"
            className="w-full rounded-xl border border-ink/20 bg-white px-3 py-2"
          />

          <input
            value={updateForm.websiteUrl}
            onChange={(event) => setUpdateForm((prev) => ({ ...prev, websiteUrl: event.target.value }))}
            placeholder="websiteUrl override (optional)"
            className="w-full rounded-xl border border-ink/20 bg-white px-3 py-2"
          />

          <label className="flex items-center gap-2 text-sm text-ink/80">
            <input
              type="checkbox"
              checked={updateForm.retriggerExtraction}
              onChange={(event) =>
                setUpdateForm((prev) => ({
                  ...prev,
                  retriggerExtraction: event.target.checked
                }))
              }
            />
            Retrigger extraction now
          </label>

          <button
            type="submit"
            disabled={saving}
            className="rounded-full border border-moss/40 px-5 py-2 text-sm font-semibold text-moss hover:bg-mist disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Update'}
          </button>
        </form>
      </div>

      {error ? <p className="text-sm font-medium text-rose-700">{error}</p> : null}

      <section className="rounded-3xl border border-white/70 bg-white/85 p-6 shadow-card">
        <h3 className="mb-4 text-xl text-ink" style={{ fontFamily: 'var(--font-heading)' }}>
          Company Registry
        </h3>

        {loading ? <p className="text-sm text-ink/70">Loading companies...</p> : null}

        {!loading && !companies.length ? <p className="text-sm text-ink/70">No companies created yet.</p> : null}

        {companies.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-xs uppercase tracking-[0.1em] text-ink/60">
                  <th className="px-2 py-3">Company</th>
                  <th className="px-2 py-3">Slug</th>
                  <th className="px-2 py-3">Website</th>
                  <th className="px-2 py-3">Extraction</th>
                  <th className="px-2 py-3">Extraction Job</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr key={company.id} className="border-b border-ink/5">
                    <td className="px-2 py-3">{company.name || '-'}</td>
                    <td className="px-2 py-3">{company.brandSlug || '-'}</td>
                    <td className="px-2 py-3 break-all">{company.websiteUrl || '-'}</td>
                    <td className="px-2 py-3">
                      <StatusBadge status={company.extractionStatus || 'none'} />
                    </td>
                    <td className="px-2 py-3 break-all text-xs">{company.extractionJobId || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
