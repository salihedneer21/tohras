const normaliseProgress = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const percentage = value <= 1 ? value * 100 : value;
  if (percentage <= 0) return 0;
  if (percentage >= 100) return 100;

  // round to single decimal place for smoother UI updates
  return Math.round(percentage * 10) / 10;
};

const extractProgressFromReplicate = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidates = [];

  if (typeof payload.progress === 'number') {
    candidates.push(payload.progress);
  }

  const metrics = payload.metrics;
  if (metrics && typeof metrics === 'object') {
    const directKeys = [
      'progress',
      'pct_complete',
      'percent_complete',
      'percentage',
      'completion',
      'percent',
    ];

    directKeys.forEach((key) => {
      if (typeof metrics[key] === 'number') {
        candidates.push(metrics[key]);
      }
    });

    const {
      current_step,
      current_steps,
      completed_steps,
      step,
      steps,
      total_steps,
      max_steps,
    } = metrics;

    const totalCandidates = [
      [current_step, total_steps],
      [current_steps, total_steps],
      [completed_steps, total_steps],
      [step, steps],
      [step, max_steps],
    ];

    totalCandidates.forEach(([current, total]) => {
      if (typeof current === 'number' && typeof total === 'number' && total > 0) {
        candidates.push(current / total);
      }
    });
  }

  for (const candidate of candidates) {
    const normalised = normaliseProgress(candidate);
    if (normalised !== null) {
      return normalised;
    }
  }

  return null;
};

module.exports = {
  normaliseProgress,
  extractProgressFromReplicate,
};
