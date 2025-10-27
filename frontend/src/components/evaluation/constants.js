export const EVALUATION_TIPS = [
  'Choose a sharp, high-resolution photo of the child.',
  'Ensure the child’s face is fully visible without hats, sunglasses, or motion blur.',
  'Use a front-facing or slightly angled torso-up shot that captures head and shoulders.',
  'Keep other people and distracting objects out of the frame.',
  'Aim for natural lighting and minimal filters to maintain accurate skin tones.',
];

export const CRITERIA_LABELS = {
  clarity: 'Clarity & Resolution',
  framing: 'Framing & Composition',
  expression: 'Expression Diversity',
  lighting: 'Lighting & Background',
  safety: 'Safety & Compliance',
};

export const VERDICT_BADGES = {
  accept: { label: 'Accept', variant: 'success' },
  needs_more: { label: 'Needs More', variant: 'warning' },
  reject: { label: 'Reject', variant: 'destructive' },
};
