import { CompaniesPanel } from '../../components/companies-panel';

export default function CompaniesPage() {
  return (
    <div className="space-y-4">
      <p className="text-xs uppercase tracking-[0.12em] text-ink/60">Companies</p>
      <h2 className="text-4xl text-ink" style={{ fontFamily: 'var(--font-heading)' }}>
        Company Registry + Extraction
      </h2>
      <p className="max-w-3xl text-sm text-ink/70">
        Manage source companies, trigger website extraction and keep normalized generator inputs in SQLite.
      </p>
      <CompaniesPanel />
    </div>
  );
}
