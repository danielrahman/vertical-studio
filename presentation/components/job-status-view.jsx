'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import apiClient from '../lib/api-client';
import { StatusBadge } from './status-badge';

const { apiRequest } = apiClient;

const terminalStates = new Set(['completed', 'failed']);

export function JobStatusView({ jobId, initialStatus = null }) {
  const [job, setJob] = useState(initialStatus);
  const [loading, setLoading] = useState(!initialStatus);
  const [error, setError] = useState('');
  const [deployResult, setDeployResult] = useState(null);
  const [deployTarget, setDeployTarget] = useState('local');
  const [deploying, setDeploying] = useState(false);

  useEffect(() => {
    let canceled = false;

    async function fetchStatus() {
      try {
        const payload = await apiRequest(`/api/v1/generate/${jobId}/status`);
        if (!canceled) {
          setJob(payload);
          setError('');
        }
      } catch (statusError) {
        if (!canceled) {
          setError(statusError.message || 'Unable to load job status.');
        }
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    }

    fetchStatus();

    const timer = setInterval(() => {
      const currentStatus = job ? job.status : null;
      if (currentStatus && terminalStates.has(currentStatus)) {
        return;
      }

      fetchStatus();
    }, 1200);

    return () => {
      canceled = true;
      clearInterval(timer);
    };
  }, [jobId, job && job.status]);

  const canDeploy = useMemo(() => job && job.status === 'completed', [job]);

  async function deploy() {
    if (!canDeploy) {
      return;
    }

    setDeploying(true);
    setError('');
    try {
      const response = await apiRequest('/api/v1/deploy', {
        method: 'POST',
        body: {
          jobId,
          target: deployTarget
        }
      });
      setDeployResult(response);
    } catch (deployError) {
      setError(deployError.message || 'Deployment request failed.');
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/70 bg-white/85 p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-ink/60">Job ID</p>
            <h2 className="text-2xl text-ink" style={{ fontFamily: 'var(--font-heading)' }}>
              {jobId}
            </h2>
          </div>
          <StatusBadge status={job ? job.status : 'pending'} />
        </div>

        {loading ? <p className="mt-4 text-sm text-ink/70">Loading status...</p> : null}
        {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}

        {job ? (
          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-[0.1em] text-ink/60">Created</dt>
              <dd className="mt-1">{job.createdAt ? new Date(job.createdAt).toLocaleString() : '-'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.1em] text-ink/60">Started</dt>
              <dd className="mt-1">{job.startedAt ? new Date(job.startedAt).toLocaleString() : '-'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.1em] text-ink/60">Finished</dt>
              <dd className="mt-1">{job.finishedAt ? new Date(job.finishedAt).toLocaleString() : '-'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.1em] text-ink/60">Duration</dt>
              <dd className="mt-1">{typeof job.durationMs === 'number' ? `${job.durationMs} ms` : '-'}</dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="text-xs uppercase tracking-[0.1em] text-ink/60">Output Directory</dt>
              <dd className="mt-1 break-all">{job.outputDir}</dd>
            </div>
          </dl>
        ) : null}

        {job && job.error ? (
          <pre className="mt-5 overflow-auto rounded-2xl bg-rose-50 p-4 text-xs text-rose-800">
            {JSON.stringify(job.error, null, 2)}
          </pre>
        ) : null}

        {job && Array.isArray(job.warnings) && job.warnings.length ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">Warnings</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {job.warnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {canDeploy ? (
        <section className="rounded-3xl border border-white/70 bg-white/85 p-6 shadow-card">
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.1em] text-ink/60">Deploy target</span>
              <select
                value={deployTarget}
                onChange={(event) => setDeployTarget(event.target.value)}
                className="rounded-xl border border-ink/20 bg-white px-3 py-2"
              >
                <option value="local">local</option>
                <option value="vercel">vercel</option>
                <option value="s3-cloudflare">s3-cloudflare</option>
              </select>
            </label>

            <button
              type="button"
              onClick={deploy}
              disabled={deploying}
              className="rounded-full bg-moss px-5 py-2 text-sm font-semibold text-white hover:bg-moss/90 disabled:opacity-70"
            >
              {deploying ? 'Deploying...' : 'Deploy'}
            </button>

            <Link
              href={`/preview/${jobId}`}
              className="rounded-full border border-moss/40 px-5 py-2 text-sm font-semibold text-moss hover:bg-mist"
            >
              Open Preview
            </Link>
          </div>

          {deployResult ? (
            <pre className="mt-4 overflow-auto rounded-2xl bg-emerald-50 p-4 text-xs text-emerald-900">
              {JSON.stringify(deployResult, null, 2)}
            </pre>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
