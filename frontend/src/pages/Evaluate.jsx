import { useState } from 'react';
import toast from 'react-hot-toast';
import { UploadCloud, Trash2, CheckCircle2, XCircle, AlertTriangle, Loader2, Target } from 'lucide-react';
import { evalAPI } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const TIPS = [
  'Upload 10-15 high-resolution images; the more variety the better.',
  'Ensure the child’s face is clearly visible with no sunglasses, hats, or obstructions.',
  'Use torso-up, front-facing photos that capture head and shoulders.',
  'Only the child should be in the frame.',
  'Include multiple expressions (smile, neutral, etc.) and varied lighting/backgrounds.',
];

const CRITERIA_LABELS = {
  clarity: 'Clarity & Resolution',
  framing: 'Framing & Composition',
  expression: 'Expression Diversity',
  lighting: 'Lighting & Background',
  safety: 'Safety & Compliance',
};

const VERDICT_BADGES = {
  accept: { label: 'Accept', variant: 'success', icon: CheckCircle2 },
  needs_more: { label: 'Needs More', variant: 'warning', icon: AlertTriangle },
  reject: { label: 'Reject', variant: 'destructive', icon: XCircle },
};

function clampPercent(value) {
  if (typeof value !== 'number') return 0;
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function ScoreBar({ value }) {
  const percent = clampPercent(value);
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/60">
        <div
          className="h-2 rounded-full bg-accent transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="w-10 text-right text-xs text-foreground/60">{percent}%</span>
    </div>
  );
}

function Evaluate() {
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const resultString = reader.result;
      const base64 = resultString.split(',')[1];
      setImage({
        name: file.name,
        size: file.size,
        mimeType: file.type,
        preview: resultString,
        base64,
      });
    };
    reader.onerror = () => {
      console.error(reader.error);
      toast.error('Failed to process the selected image');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleRemoveImage = () => {
    setImage(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!image) {
      toast.error('Upload an image to evaluate');
      return;
    }

    try {
      setLoading(true);
      setResult(null);

      const payload = {
        image: {
          name: image.name,
          base64: image.base64,
          mimeType: image.mimeType,
        },
      };

      const response = await evalAPI.evaluate(payload);
      setResult(response.data);
      toast.success('Evaluation complete');
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Failed to evaluate images');
    } finally {
      setLoading(false);
    }
  };

  const resetEvaluation = () => {
    setImage(null);
    setResult(null);
  };

  const overall = result?.overallAcceptance;
  const evaluation = result?.images?.[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Dataset Evaluation</h2>
          <p className="mt-1 text-sm text-foreground/65">
            Upload a potential training photo and instantly see whether it meets our fine-tuning standards.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">Image queued: {image ? 1 : 0}</Badge>
          <Button variant="secondary" onClick={resetEvaluation} disabled={!image && !result}>
            Reset
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload image</CardTitle>
          <CardDescription>
            Add a clear, identity-consistent portrait. We check framing, lighting, expression variety, and safety.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-end">
              <div className="grid gap-3 rounded-xl border border-border/60 bg-muted p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
                  <UploadCloud className="h-4 w-4 text-accent" />
                  File uploader
                </p>
                <Input type="file" accept="image/*" onChange={handleFileChange} className="cursor-pointer" />
                <p className="text-xs text-foreground/45">
                  We do not store these images. They are sent securely to the evaluator and discarded afterwards.
                </p>
              </div>

              <div className="rounded-xl border border-border/60 bg-muted p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-foreground/40">Tips</p>
                <ul className="mt-2 space-y-2 text-xs text-foreground/65">
                  {TIPS.map((tip) => (
                    <li key={tip} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-accent" />
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {image && (
              <div className="grid gap-3 rounded-xl border border-border/60 bg-muted p-4">
                <p className="text-xs uppercase tracking-[0.25em] text-foreground/40">Selected image</p>
                <div className="flex flex-col gap-3 rounded-lg border border-border/40 bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <img src={image.preview} alt={image.name} className="h-16 w-16 rounded-md object-cover" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{image.name}</p>
                      <p className="text-xs text-foreground/50">{(image.size / 1024).toFixed(0)} KB</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="justify-start gap-2 text-xs text-red-300 hover:text-red-200 sm:w-auto"
                    onClick={handleRemoveImage}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                type="submit"
                className="gap-2 sm:w-auto"
                disabled={loading || !image}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Evaluating
                  </>
                ) : (
                  <>
                    <Target className="h-4 w-4" />
                    Run evaluation
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {result && (
        <div className="grid gap-6">
          {overall && (
            <Card>
              <CardHeader>
                <CardTitle>Overall verdict</CardTitle>
                <CardDescription>{overall.summary}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-4">
                <div className="flex gap-2">
                  <Badge variant="outline">Acceptable: {overall.acceptedCount || 0}</Badge>
                  <Badge variant="outline">Rejected: {overall.rejectedCount || 0}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const meta = VERDICT_BADGES[overall.verdict] || VERDICT_BADGES.needs_more;
                    const Icon = meta.icon;
                    return (
                      <Badge variant={meta.variant}>
                        <Icon className="mr-1 h-3.5 w-3.5" />
                        {meta.label}
                      </Badge>
                    );
                  })()}
                  <span className="text-sm text-foreground/60">
                    Confidence {clampPercent(overall.confidencePercent)}%
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {evaluation && (
            <Card className="flex flex-col gap-4">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">{evaluation.name}</CardTitle>
                  {(() => {
                    const meta = VERDICT_BADGES[evaluation.verdict] || VERDICT_BADGES.needs_more;
                    const Icon = meta.icon;
                    return (
                      <Badge variant={meta.variant} className="gap-1">
                        <Icon className="h-3.5 w-3.5" />
                        {meta.label}
                      </Badge>
                    );
                  })()}
                </div>
                <div className="text-xs text-foreground/60">
                  Overall score {clampPercent(evaluation.overallScorePercent)}% · Confidence{' '}
                  {clampPercent(evaluation.confidencePercent)}%
                </div>
                <ScoreBar value={evaluation.overallScorePercent} />
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-foreground/70">
                <div className="space-y-3">
                  {Object.entries(CRITERIA_LABELS).map(([key, label]) => {
                    const detail = evaluation.criteria?.[key] || {};
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-foreground/50">
                          <span>{label}</span>
                          <span className="uppercase text-[10px] tracking-wide">
                            {(detail.verdict || 'no').toUpperCase()}
                          </span>
                        </div>
                        <ScoreBar value={detail.scorePercent} />
                        {detail.notes && <p className="text-xs text-foreground/50">{detail.notes}</p>}
                      </div>
                    );
                  })}
                </div>
                {Array.isArray(evaluation.recommendations) && evaluation.recommendations.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-foreground/45">Recommendations</p>
                    <ul className="space-y-1 text-xs text-foreground/60">
                      {evaluation.recommendations.map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="mt-1 h-1 w-1 rounded-full bg-accent/70" />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export default Evaluate;
