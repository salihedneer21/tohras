import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Workflow,
  Rocket,
  Users as UsersIcon,
  Sparkles,
  Loader2,
  AlertTriangle,
  CircleCheck,
  BookOpen,
  UploadCloud,
  Image as ImageIcon,
  RefreshCw,
} from 'lucide-react';
import { automationAPI, bookAPI } from '@/services/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import EvaluationImageCard from '@/components/evaluation/EvaluationImageCard';
import EvaluationSummary from '@/components/evaluation/EvaluationSummary';
import { evaluateImageFile } from '@/utils/evaluation';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const createEmptyForm = () => ({
  name: '',
  age: '',
  gender: 'male',
  email: '',
  countryCode: '+1',
  phoneNumber: '',
});

const summariseEvaluationItems = (items) => {
  const evaluated = items.filter((item) => item.status === 'evaluated');
  if (!evaluated.length) return null;

  const accepted = evaluated.filter((item) => item.evaluation?.acceptable).length;
  const rejected = evaluated.length - accepted;
  const totalConfidence = evaluated.reduce(
    (sum, item) => sum + (item.evaluation?.confidencePercent || 0),
    0
  );
  const averageConfidence = Math.round(totalConfidence / evaluated.length || 0);

  let verdict = 'needs_more';
  let summary =
    'Some photos need review. Approve or override the ones you want to keep before continuing.';

  if (accepted === evaluated.length) {
    verdict = 'accept';
    summary = 'All evaluated photos meet the training guidelines.';
  } else if (accepted === 0) {
    verdict = 'reject';
    summary =
      'None of the evaluated photos met the quality guidelines. Capture new reference images.';
  }

  return {
    verdict,
    acceptedCount: accepted,
    rejectedCount: rejected,
    confidencePercent: averageConfidence,
    summary,
  };
};

const RUN_STATUS_META = {
  creating_user: { label: 'Creating user', icon: UsersIcon, badge: 'outline' },
  uploading_images: { label: 'Uploading photos', icon: UploadCloud, badge: 'warning' },
  training: { label: 'Training model', icon: Workflow, badge: 'default' },
  storybook_pending: { label: 'Preparing storybook', icon: BookOpen, badge: 'outline' },
  storybook: { label: 'Generating storybook', icon: Sparkles, badge: 'default' },
  completed: { label: 'Automation complete', icon: CircleCheck, badge: 'success' },
  failed: { label: 'Automation failed', icon: AlertTriangle, badge: 'destructive' },
};

const TRAINING_STATUS_META = {
  queued: { label: 'Queued', badge: 'warning' },
  starting: { label: 'Starting', badge: 'warning' },
  processing: { label: 'Running', badge: 'default' },
  succeeded: { label: 'Succeeded', badge: 'success' },
  failed: { label: 'Failed', badge: 'destructive' },
  canceled: { label: 'Canceled', badge: 'outline' },
};

const STORYBOOK_STATUS_META = {
  queued: { label: 'Queued', badge: 'outline' },
  generating: { label: 'Generating', badge: 'default' },
  assembling: { label: 'Assembling', badge: 'warning' },
  succeeded: { label: 'Completed', badge: 'success' },
  failed: { label: 'Failed', badge: 'destructive' },
};

const sortByCreatedAtDesc = (a, b) =>
  new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0);

const mergeRunPayload = (current = {}, incoming = {}) => {
  const merged = {
    ...current,
    ...incoming,
  };

  merged.events = Array.isArray(incoming.events)
    ? incoming.events
    : Array.isArray(current.events)
    ? current.events
    : [];

  merged.trainingSnapshot =
    incoming.trainingSnapshot !== undefined ? incoming.trainingSnapshot : current.trainingSnapshot;

  merged.storybookSnapshot =
    incoming.storybookSnapshot !== undefined
      ? incoming.storybookSnapshot
      : current.storybookSnapshot;

  if (incoming.userId || current.userId) {
    merged.userId = incoming.userId || current.userId;
  }
  if (incoming.bookId || current.bookId) {
    merged.bookId = incoming.bookId || current.bookId;
  }

  return merged;
};

const upsertRunList = (list, incoming) => {
  if (!incoming?._id) return list;
  const index = list.findIndex((item) => item._id === incoming._id);
  if (index === -1) {
    return [incoming, ...list].sort(sortByCreatedAtDesc);
  }
  const next = [...list];
  next[index] = mergeRunPayload(list[index], incoming);
  return next.sort(sortByCreatedAtDesc);
};

const formatTimestamp = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  });
};

const formatTimeOfDay = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

function Automate() {
  const [books, setBooks] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState(createEmptyForm);
  const [formImages, setFormImages] = useState([]);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const eventSourceRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const formEvaluationOverall = useMemo(
    () => summariseEvaluationItems(formImages),
    [formImages]
  );

  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true);
      const [booksResponse, runsResponse] = await Promise.all([
        bookAPI.getAll(),
        automationAPI.getAll({ limit: 25 }),
      ]);

      const resolvedBooks = Array.isArray(booksResponse?.data)
        ? booksResponse.data
        : Array.isArray(booksResponse)
        ? booksResponse
        : [];
      const resolvedRuns = Array.isArray(runsResponse?.data)
        ? runsResponse.data
        : Array.isArray(runsResponse)
        ? runsResponse
        : [];

      setBooks(resolvedBooks);
      setRuns(resolvedRuns.sort(sortByCreatedAtDesc));
    } catch (error) {
      toast.error(`Failed to load automation data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const connectEventStream = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
      console.warn('EventSource is not supported in this environment.');
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const source = new EventSource(`${API_BASE_URL}/automation/stream/live`);
    eventSourceRef.current = source;

    source.onmessage = (event) => {
      if (!event?.data) return;
      try {
        const payload = JSON.parse(event.data);
        setRuns((previous) => upsertRunList(previous, payload));
      } catch (error) {
        console.error('Failed to parse automation stream payload', error);
      }
    };

    source.onerror = (error) => {
      console.warn('Automation stream error, retrying in 4s…', error);
      source.close();
      eventSourceRef.current = null;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        connectEventStream();
      }, 4000);
    };
  }, []);

  useEffect(() => {
    connectEventStream();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      formImages.forEach((item) => {
        if (item.preview?.startsWith('blob:')) {
          URL.revokeObjectURL(item.preview);
        }
      });
    };
  }, [connectEventStream, formImages]);

  const mutateFormImage = useCallback(
    (id, updater) => {
      setFormImages((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                ...(typeof updater === 'function' ? updater(item) : updater),
              }
            : item
        )
      );
    },
    [setFormImages]
  );

  const evaluateFormImage = useCallback(
    async (imageEntry) => {
      mutateFormImage(imageEntry.id, { status: 'evaluating', error: null });
      try {
        const evaluation = await evaluateImageFile(imageEntry.file);
        const imageResult = Array.isArray(evaluation?.images) ? evaluation.images[0] : null;
        if (!imageResult) {
          throw new Error('Evaluator returned no image analysis');
        }
        const overall = evaluation.overallAcceptance || null;
        const acceptable = Boolean(imageResult.acceptable);
        mutateFormImage(imageEntry.id, {
          status: 'evaluated',
          evaluation: imageResult,
          overall,
          include: acceptable,
          override: acceptable ? false : imageEntry.override || false,
        });
      } catch (error) {
        const message = error?.message || 'Evaluation failed';
        mutateFormImage(imageEntry.id, {
          status: 'evaluation_failed',
          error: message,
          include: false,
        });
        toast.error(`Evaluation failed for ${imageEntry.file?.name || 'image'}: ${message}`);
      }
    },
    [mutateFormImage]
  );

  const handleFormImageUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const nextItems = files.map((file) => {
      const id = `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      return {
        id,
        file,
        preview: URL.createObjectURL(file),
        status: 'pending',
        include: true,
        override: false,
        evaluation: null,
        overall: null,
        error: null,
      };
    });

    setFormImages((prev) => [...prev, ...nextItems]);

    nextItems.forEach((item) => {
      evaluateFormImage(item);
    });
  };

  const handleRemoveFormImage = (id) => {
    setFormImages((prev) => {
      const next = prev.filter((item) => item.id !== id);
      const removed = prev.find((item) => item.id === id);
      if (removed?.preview?.startsWith('blob:')) {
        URL.revokeObjectURL(removed.preview);
      }
      return next;
    });
  };

  const handleRetryFormImage = (id) => {
    const target = formImages.find((item) => item.id === id);
    if (!target) return;
    evaluateFormImage(target);
  };

  const handleToggleFormInclude = (id, include) => {
    mutateFormImage(id, (current) => ({
      include,
      override: include && !current.evaluation?.acceptable,
    }));
  };

  const resetForm = () => {
    formImages.forEach((item) => {
      if (item.preview?.startsWith('blob:')) {
        URL.revokeObjectURL(item.preview);
      }
    });
    setFormImages([]);
    setFormData(createEmptyForm());
    setSelectedBookId('');
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    if (!selectedBookId) {
      toast.error('Select a book for automation.');
      return;
    }

    const hasPendingEvaluation = formImages.some(
      (item) => item.status === 'evaluating' || item.status === 'pending'
    );
    if (hasPendingEvaluation) {
      toast.error('Wait for image evaluations to finish.');
      return;
    }

    const approvedImages = formImages.filter((item) => item.include && item.file);
    if (approvedImages.length === 0) {
      toast.error('Add at least one approved reference photo.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = new FormData();
      payload.append('bookId', selectedBookId);
      payload.append('name', formData.name);
      payload.append('age', formData.age);
      payload.append('gender', formData.gender);
      payload.append('email', formData.email);
      payload.append('countryCode', formData.countryCode);
      payload.append('phoneNumber', formData.phoneNumber);

      const overrides = [];
      approvedImages.forEach((item) => {
        payload.append('images', item.file, item.file.name);
        overrides.push(Boolean(item.override));
      });

      payload.append('overrides', JSON.stringify(overrides));

      const response = await automationAPI.start(payload);
      const run = response?.data || response;

      if (run?._id) {
        setRuns((previous) => upsertRunList(previous, run));
      }

      toast.success('Automation started. You can close this tab and check progress later.');
      resetForm();
    } catch (error) {
      toast.error(`Failed to start automation: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalRuns = runs.length;
  const completedRuns = runs.filter((run) => run.status === 'completed').length;
  const failedRuns = runs.filter((run) => run.status === 'failed').length;

  if (loading) {
    return (
      <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 text-foreground/60">
        <Rocket className="h-9 w-9 animate-spin text-foreground/40" />
        <p className="text-sm uppercase tracking-[0.2em] text-foreground/40">
          Loading automation
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">Automation</h1>
        <p className="text-sm text-foreground/70 sm:text-base">
          Create a reader, evaluate their photos, train a model, and assemble the chosen storybook —
          all from one place. Once launched, the pipeline continues on the server and keeps detailed
          logs you can revisit anytime.
        </p>
        <div className="flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-wide text-foreground/60">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-1">
            <UsersIcon className="h-3.5 w-3.5" />
            {totalRuns} runs
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/60 bg-emerald-500/10 px-3 py-1 text-emerald-200">
            <CircleCheck className="h-3.5 w-3.5" />
            {completedRuns} completed
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-red-500/50 bg-red-500/10 px-3 py-1 text-red-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            {failedRuns} failed
          </span>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Start a new automation run</CardTitle>
          <CardDescription>
            Upload the reader details and reference photos. Automation will continue running on the
            backend — even if you close this tab — and it will surface training and storybook
            progress live.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  placeholder="Jane Doe"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="age">Age *</Label>
                <Input
                  id="age"
                  type="number"
                  name="age"
                  value={formData.age}
                  onChange={handleInputChange}
                  min={1}
                  max={150}
                  required
                  placeholder="7"
                />
              </div>
              <div className="grid gap-2">
                <Label>Gender *</Label>
                <Select
                  value={formData.gender}
                  onValueChange={(value) => handleSelectChange('gender', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  placeholder="reader@example.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="countryCode">Country code *</Label>
                <Input
                  id="countryCode"
                  name="countryCode"
                  value={formData.countryCode}
                  onChange={handleInputChange}
                  required
                  placeholder="+1"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phoneNumber">Phone number *</Label>
                <Input
                  id="phoneNumber"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleInputChange}
                  required
                  placeholder="1234567890"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="automation-book">Book *</Label>
                <Select
                  value={selectedBookId}
                  onValueChange={(value) => setSelectedBookId(value === '__clear' ? '' : value)}
                >
                  <SelectTrigger id="automation-book">
                    <SelectValue placeholder="Select a book" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__clear">Clear selection</SelectItem>
                    {books.map((book) => (
                      <SelectItem key={book._id} value={book._id}>
                        {book.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Reference photos</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="outline">{formImages.length} images</Badge>
                  <label
                    htmlFor="automation-images"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-card px-3 py-2 text-xs font-semibold text-foreground/70 hover:bg-card/80"
                  >
                    <UploadCloud className="h-4 w-4" />
                    Upload
                  </label>
                  <input
                    id="automation-images"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFormImageUpload}
                  />
                </div>
                <p className="text-xs text-foreground/50">
                  Uploaded photos are evaluated locally before sending them to the automation
                  service.
                </p>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
              {formImages.length > 0 ? (
                <>
                  {formEvaluationOverall ? (
                    <EvaluationSummary overall={formEvaluationOverall} />
                  ) : (
                    <p className="text-xs text-foreground/60">
                      Evaluations are running. Wait for the verdict before starting automation.
                    </p>
                  )}
                  <div className="grid gap-4 lg:grid-cols-2">
                    {formImages.map((item) => (
                      <div
                        key={item.id}
                        className="space-y-3 rounded-xl border border-border/60 bg-card/40 p-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className="relative h-20 w-20 overflow-hidden rounded-lg border border-border/50 bg-background/60">
                            {item.preview ? (
                              <img
                                src={item.preview}
                                alt={item.file?.name || 'Preview'}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-foreground/50">
                                <ImageIcon className="h-6 w-6" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 space-y-2">
                            <p className="text-xs font-semibold text-foreground/70">
                              {item.file?.name || 'Uploaded image'}
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-foreground/50">
                              <span>{item.file?.type || 'image/*'}</span>
                              <span aria-hidden="true">•</span>
                              <span>{Math.round((item.file?.size || 0) / 1024)} KB</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-xs text-red-300 hover:text-red-200"
                                onClick={() => handleRemoveFormImage(item.id)}
                                disabled={item.status === 'uploading'}
                              >
                                Remove
                              </Button>
                              {item.status === 'evaluation_failed' ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs text-foreground/60 hover:text-foreground"
                                  onClick={() => handleRetryFormImage(item.id)}
                                >
                                  <RefreshCw className="mr-2 h-3 w-3" />
                                  Retry evaluation
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {item.status === 'evaluating' || item.status === 'pending' ? (
                          <div className="flex items-center gap-2 text-xs text-foreground/60">
                            <Loader2 className="h-4 w-4 animate-spin text-accent" />
                            Evaluating photo quality…
                          </div>
                        ) : null}

                        {item.status === 'evaluation_failed' ? (
                          <div className="rounded-lg border border-dashed border-amber-400/60 bg-amber-400/10 p-3 text-xs text-amber-200">
                            Evaluation failed: {item.error}
                          </div>
                        ) : null}

                        {item.status === 'evaluated' ? (
                          <EvaluationImageCard
                            evaluation={item.evaluation}
                            summary={item.overall?.summary}
                          >
                            <label className="flex items-center justify-between gap-2 text-xs text-foreground/70">
                              <span className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5 rounded border-border/60 accent-accent"
                                  checked={item.include}
                                  onChange={(event) =>
                                    handleToggleFormInclude(item.id, event.target.checked)
                                  }
                                />
                                Include in automation
                              </span>
                              {item.include && !item.evaluation?.acceptable ? (
                                <span className="text-amber-300">Override enabled</span>
                              ) : null}
                            </label>
                          </EvaluationImageCard>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-8 text-sm text-foreground/60">
                  <ImageIcon className="h-6 w-6" />
                  <p>No images uploaded yet.</p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={resetForm} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" className="gap-2" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Launch automation
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground sm:text-xl">Automation runs</h2>
            <p className="text-sm text-foreground/60">
              Track progress, review logs, and confirm when the personalised book is ready. Runs
              continue even if you close this page.
            </p>
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/20 p-10 text-center text-sm text-foreground/60">
            <Sparkles className="h-6 w-6 text-foreground/40" />
            <p>No automation runs yet. Create a reader above to get started.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {runs.map((run) => {
              const statusMeta = RUN_STATUS_META[run.status] || RUN_STATUS_META.training;
              const StatusIcon = statusMeta.icon || Workflow;
              const trainingSnapshot = run.trainingSnapshot || null;
              const storybookSnapshot = run.storybookSnapshot || null;
              const trainingStatusMeta =
                trainingSnapshot && trainingSnapshot.status
                  ? TRAINING_STATUS_META[trainingSnapshot.status] || TRAINING_STATUS_META.processing
                  : TRAINING_STATUS_META.queued;
              const storybookStatusMeta =
                storybookSnapshot && storybookSnapshot.status
                  ? STORYBOOK_STATUS_META[storybookSnapshot.status] || STORYBOOK_STATUS_META.queued
                  : STORYBOOK_STATUS_META.queued;

              return (
                <Card key={run._id} className="border border-border/60">
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg font-semibold text-foreground">
                        {(run.userId && run.userId.name) || 'Reader'} →{' '}
                        {(run.bookId && run.bookId.name) || 'Storybook'}
                      </CardTitle>
                      <CardDescription>
                        Launched {formatTimestamp(run.createdAt)} · Run ID {run._id}
                      </CardDescription>
                    </div>
                    <Badge variant={statusMeta.badge}>
                      <StatusIcon className="mr-2 h-3.5 w-3.5" />
                      {statusMeta.label}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div>
                      <div className="flex items-center justify-between text-xs text-foreground/60">
                        <span>Pipeline progress</span>
                        <span>{run.progress || 0}%</span>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border/40">
                        <div
                          className="h-2 rounded-full bg-accent transition-all duration-700 ease-out"
                          style={{ width: `${run.progress || 0}%` }}
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-2 rounded-xl border border-border/60 bg-card/40 p-4">
                        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-foreground/60">
                          <span>Training</span>
                          <Badge variant={trainingStatusMeta.badge}>
                            {trainingStatusMeta.label}
                          </Badge>
                        </div>
                        <div className="space-y-2 text-sm text-foreground/80">
                          <p>
                            Progress:{' '}
                            {typeof trainingSnapshot?.progress === 'number'
                              ? `${trainingSnapshot.progress}%`
                              : '—'}
                          </p>
                          <p>Attempts: {trainingSnapshot?.attempts ?? 0}</p>
                          <p>
                            Model:{' '}
                            {trainingSnapshot?.modelName ||
                              trainingSnapshot?.modelVersion ||
                              'pending'}
                          </p>
                          {trainingSnapshot?.error ? (
                            <p className="text-xs text-destructive">
                              Error: {trainingSnapshot.error}
                            </p>
                          ) : null}
                          {trainingSnapshot?.logsUrl ? (
                            <a
                              href={trainingSnapshot.logsUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center text-xs font-semibold text-accent hover:underline"
                            >
                              View logs
                            </a>
                          ) : null}
                        </div>
                      </div>

                      <div className="space-y-2 rounded-xl border border-border/60 bg-card/40 p-4">
                        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-foreground/60">
                          <span>Storybook</span>
                          <Badge variant={storybookStatusMeta.badge}>
                            {storybookStatusMeta.label}
                          </Badge>
                        </div>
                        <div className="space-y-2 text-sm text-foreground/80">
                          <p>
                            Progress:{' '}
                            {typeof storybookSnapshot?.progress === 'number'
                              ? `${storybookSnapshot.progress}%`
                              : run.status === 'completed'
                              ? '100%'
                              : '—'}
                          </p>
                          <p>
                            ETA:{' '}
                            {storybookSnapshot?.estimatedSecondsRemaining
                              ? `${storybookSnapshot.estimatedSecondsRemaining}s`
                              : '—'}
                          </p>
                          {storybookSnapshot?.error ? (
                            <p className="text-xs text-destructive">
                              Error: {storybookSnapshot.error}
                            </p>
                          ) : null}
                          {storybookSnapshot?.pdfAsset?.url ? (
                            <a
                              href={storybookSnapshot.pdfAsset.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center text-xs font-semibold text-accent hover:underline"
                            >
                              View generated PDF
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {Array.isArray(run.events) && run.events.length > 0 ? (
                      <div className="space-y-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
                          Recent activity
                        </h3>
                        <ul className="space-y-1 text-xs text-foreground/70">
                          {run.events
                            .slice()
                            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                            .slice(0, 8)
                            .map((event) => (
                              <li key={`${run._id}-${event._id || event.timestamp}-${event.type}`} className="flex items-start gap-2">
                                <span className="min-w-[3.5rem] text-foreground/50">
                                  {formatTimeOfDay(event.timestamp)}
                                </span>
                                <span className="font-semibold text-foreground/80">
                                  {event.type}
                                </span>
                                <span className="text-foreground/70">{event.message}</span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ) : null}

                    {run.error ? (
                      <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                        {run.error}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default Automate;
