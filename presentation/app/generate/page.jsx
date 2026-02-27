import { GenerateForm } from '../../components/generate-form';

export default function GeneratePage() {
  return (
    <div className="space-y-6">
      <section>
        <p className="text-xs uppercase tracking-[0.12em] text-ink/60">Generation</p>
        <h2 className="text-4xl text-ink" style={{ fontFamily: 'var(--font-heading)' }}>
          Create Async Generation Job
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-ink/70">
          Submit one of the three supported input modes and monitor processing in real time.
        </p>
      </section>

      <GenerateForm />
    </div>
  );
}
