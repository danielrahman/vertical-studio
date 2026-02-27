export function SummaryCard({ title, value, subtitle, accent = 'from-moss to-emerald-700' }) {
  return (
    <article className="rounded-2xl border border-white/70 bg-white/80 p-5 shadow-card">
      <div className={`mb-3 h-1.5 w-16 rounded-full bg-gradient-to-r ${accent}`} />
      <p className="text-xs uppercase tracking-[0.12em] text-ink/60">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
      {subtitle ? <p className="mt-1 text-sm text-ink/70">{subtitle}</p> : null}
    </article>
  );
}
