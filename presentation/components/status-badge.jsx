const statusStyles = {
  pending: 'bg-amber-100 text-amber-800',
  processing: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-rose-100 text-rose-700',
  submitted: 'bg-violet-100 text-violet-700',
  not_configured: 'bg-zinc-100 text-zinc-700'
};

export function StatusBadge({ status }) {
  const tone = statusStyles[status] || 'bg-zinc-100 text-zinc-700';

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${tone}`}>
      {status}
    </span>
  );
}
