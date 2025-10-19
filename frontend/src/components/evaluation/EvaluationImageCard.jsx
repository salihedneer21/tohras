import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import EvaluationScoreBar from './ScoreBar';
import { CRITERIA_LABELS, VERDICT_BADGES } from './constants';

const VERDICT_ICONS = {
  accept: CheckCircle2,
  needs_more: AlertTriangle,
  reject: XCircle,
};

const DEFAULT_VERDICT = { label: 'Unknown', variant: 'secondary' };

function EvaluationImageCard({ evaluation, summary, children }) {
  if (!evaluation) return null;

  const { verdict, acceptable, overallScorePercent, confidencePercent, criteria, recommendations } = evaluation;
  const verdictMeta = VERDICT_BADGES[verdict] || DEFAULT_VERDICT;
  const VerdictIcon = VERDICT_ICONS[verdict] || CheckCircle2;

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant={verdictMeta.variant}>{verdictMeta.label}</Badge>
            {typeof overallScorePercent === 'number' ? (
              <span className="text-xs text-foreground/60">Score: {overallScorePercent}%</span>
            ) : null}
            {typeof confidencePercent === 'number' ? (
              <span className="text-xs text-foreground/60">Confidence: {confidencePercent}%</span>
            ) : null}
          </div>
          {summary ? <p className="text-sm text-foreground/70">{summary}</p> : null}
        </div>
        <div className="flex items-center gap-2 text-xs text-foreground/60">
          <VerdictIcon className="h-4 w-4" />
          <span>{acceptable ? 'Recommended for training' : 'Requires review'}</span>
        </div>
      </div>

      <EvaluationScoreBar value={overallScorePercent} />

      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(criteria || {}).map(([key, detail]) => {
          const label = CRITERIA_LABELS[key] || key;
          if (!detail) return null;
          const ok = detail.verdict === 'yes';
          return (
            <div key={key} className="rounded-lg border border-border/40 bg-card/80 p-3">
              <p className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-foreground/50">
                <span>{label}</span>
                <span className={ok ? 'text-emerald-400' : 'text-red-300'}>
                  {ok ? 'Pass' : 'Fail'}
                </span>
              </p>
              <div className="mt-2 flex items-center justify-between text-xs text-foreground/60">
                <span>Score</span>
                <span>{typeof detail.scorePercent === 'number' ? `${detail.scorePercent}%` : '—'}</span>
              </div>
              {detail.notes ? (
                <p className="mt-1 text-xs text-foreground/55">{detail.notes}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      {Array.isArray(recommendations) && recommendations.length > 0 ? (
        <div className="rounded-lg border border-dashed border-border/50 bg-background/40 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-foreground/45">Recommendations</p>
          <ul className="mt-2 space-y-1 text-xs text-foreground/65">
            {recommendations.map((note, index) => (
              <li key={`${note}-${index}`} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-accent" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {children ? <div className="pt-2">{children}</div> : null}
    </div>
  );
}

export default EvaluationImageCard;
