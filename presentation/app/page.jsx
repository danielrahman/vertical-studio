import Link from 'next/link';
import apiClient from '../lib/api-client';
import { SummaryCard } from '../components/summary-card';
import { StatusBadge } from '../components/status-badge';

const { apiRequest } = apiClient;

async function loadDashboardData() {
  const [analytics, previews, companies] = await Promise.all([
    apiRequest('/api/v1/analytics', { cache: 'no-store' }).catch(() => null),
    apiRequest('/api/v1/previews', { cache: 'no-store' }).catch(() => []),
    apiRequest('/api/v1/companies', { cache: 'no-store' }).catch(() => [])
  ]);

  return {
    analytics,
    previews: Array.isArray(previews) ? previews : [],
    companies: Array.isArray(companies) ? companies : []
  };
}

export default async function DashboardPage() {
  const { analytics, previews, companies } = await loadDashboardData();
  const totals = analytics
    ? analytics.totals
    : {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0
      };

  const recent = previews.slice(0, 8);

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Pending" value={totals.pending} subtitle="Waiting in queue" accent="from-amber-500 to-orange-500" />
        <SummaryCard title="Processing" value={totals.processing} subtitle="Handled by worker" accent="from-cyan-500 to-blue-600" />
        <SummaryCard title="Completed" value={totals.completed} subtitle="Generated successfully" accent="from-emerald-600 to-teal-600" />
        <SummaryCard title="Failed" value={totals.failed} subtitle="Needs retry / fix" accent="from-rose-500 to-red-600" />
      </section>

      <section className="grid gap-4 rounded-3xl border border-white/70 bg-white/80 p-6 shadow-card lg:grid-cols-3">
        <article>
          <p className="text-xs uppercase tracking-[0.12em] text-ink/60">Throughput (24h)</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{analytics ? analytics.throughput.last24h : 0}</p>
        </article>
        <article>
          <p className="text-xs uppercase tracking-[0.12em] text-ink/60">Average Duration</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{analytics ? analytics.durations.avgMs : 0} ms</p>
        </article>
        <article>
          <p className="text-xs uppercase tracking-[0.12em] text-ink/60">Companies</p>
          <p className="mt-2 text-3xl font-semibold text-ink">{companies.length}</p>
        </article>
      </section>

      <section className="rounded-3xl border border-white/70 bg-white/80 p-6 shadow-card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-2xl text-ink" style={{ fontFamily: 'var(--font-heading)' }}>
            Recent Generated Jobs
          </h2>
          <Link href="/generate" className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-white hover:bg-moss/90">
            New Job
          </Link>
        </div>

        {recent.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-xs uppercase tracking-[0.1em] text-ink/60">
                  <th className="px-2 py-3">Job</th>
                  <th className="px-2 py-3">Company</th>
                  <th className="px-2 py-3">Generated</th>
                  <th className="px-2 py-3">Preview</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((item) => (
                  <tr key={item.jobId} className="border-b border-ink/5">
                    <td className="px-2 py-3">
                      <Link href={`/jobs/${item.jobId}`} className="font-semibold text-moss underline-offset-2 hover:underline">
                        {item.jobId.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-2 py-3">{item.companyName || item.brandSlug || 'N/A'}</td>
                    <td className="px-2 py-3">{item.generatedAt ? new Date(item.generatedAt).toLocaleString() : 'N/A'}</td>
                    <td className="px-2 py-3">
                      {item.preview && item.preview.status === 'available' ? (
                        <Link href={`/preview/${item.jobId}`} className="inline-flex items-center gap-2 text-moss underline-offset-2 hover:underline">
                          <StatusBadge status="completed" />
                          <span>Open</span>
                        </Link>
                      ) : (
                        <StatusBadge status="not_configured" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink/70">No completed jobs yet. Start from Generate page.</p>
        )}
      </section>
    </div>
  );
}
