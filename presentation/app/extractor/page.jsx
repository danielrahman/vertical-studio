import { ExtractorPanel } from '../../components/extractor-panel';

export default function ExtractorPage() {
  return (
    <div className="space-y-4">
      <p className="text-xs uppercase tracking-[0.12em] text-ink/60">Extractor</p>
      <h2 className="text-4xl text-ink" style={{ fontFamily: 'var(--font-heading)' }}>
        Deep Research Extractor
      </h2>
      <p className="max-w-3xl text-sm text-ink/70">
        Async forensic pipeline: on-site crawl + off-site intelligence + bilingual synthesis + evidence artifacts.
      </p>
      <ExtractorPanel />
    </div>
  );
}
