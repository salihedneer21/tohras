import { Badge } from '@/components/ui/badge';
import { VERDICT_BADGES } from './constants';

function EvaluationSummary({ overall }) {
  if (!overall) return null;

  const { verdict, summary, acceptedCount, rejectedCount, confidencePercent } = overall;
  const verdictMeta = VERDICT_BADGES[verdict] || { label: 'Pending', variant: 'secondary' };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant={verdictMeta.variant}>{verdictMeta.label}</Badge>
          <span className="text-xs text-foreground/60">
            Confidence: {typeof confidencePercent === 'number' ? `${confidencePercent}%` : '—'}
          </span>
        </div>
        {summary ? <p className="text-sm text-foreground/70">{summary}</p> : null}
      </div>
      <div className="flex items-center gap-3 text-xs text-foreground/60">
        <span className="rounded-full bg-emerald-400/10 px-3 py-1 font-semibold text-emerald-300">
          {acceptedCount ?? 0} accepted
        </span>
        <span className="rounded-full bg-red-400/10 px-3 py-1 font-semibold text-red-300">
          {rejectedCount ?? 0} rejected
        </span>
      </div>
    </div>
  );
}

export default EvaluationSummary;
