import Link from 'next/link';
import apiClient from '../../../lib/api-client';
import { PreviewRenderer } from '../../../components/preview-renderer';

const { apiRequest } = apiClient;

async function loadConfig(jobId) {
  return apiRequest(`/api/v1/previews/${jobId}/config`, { cache: 'no-store' });
}

export default async function PreviewPage({ params }) {
  const config = await loadConfig(params.jobId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.12em] text-ink/60">Preview Runtime</p>
          <h2 className="text-3xl text-ink" style={{ fontFamily: 'var(--font-heading)' }}>
            {config.siteConfig.meta.companyName}
          </h2>
        </div>
        <Link href={`/jobs/${params.jobId}`} className="rounded-full border border-moss/40 px-4 py-2 text-sm font-semibold text-moss hover:bg-mist">
          Back to Job
        </Link>
      </div>

      <PreviewRenderer siteConfig={config.siteConfig} themeConfig={config.themeConfig} />
    </div>
  );
}
