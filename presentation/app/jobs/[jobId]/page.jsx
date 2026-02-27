import { JobStatusView } from '../../../components/job-status-view';

export default function JobDetailPage({ params }) {
  return (
    <div className="space-y-4">
      <p className="text-xs uppercase tracking-[0.12em] text-ink/60">Job Detail</p>
      <JobStatusView jobId={params.jobId} />
    </div>
  );
}
