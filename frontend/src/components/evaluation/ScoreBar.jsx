function clampPercent(value) {
  if (typeof value !== 'number') return 0;
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function EvaluationScoreBar({ value }) {
  const percent = clampPercent(value);

  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/60">
        <div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${percent}%` }} />
      </div>
      <span className="w-10 text-right text-xs text-foreground/60">{percent}%</span>
    </div>
  );
}

export default EvaluationScoreBar;
