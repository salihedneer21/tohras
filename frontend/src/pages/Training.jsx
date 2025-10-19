import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Boxes,
  CloudUpload,
  Rocket,
  Ban,
  DownloadCloud,
  ExternalLink,
  Maximize2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { userAPI, trainingAPI } from '@/services/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
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
import ImageViewer from '@/components/ImageViewer';
import { formatFileSize } from '@/utils/file';

const createInitialForm = () => ({
  userId: '',
  modelName: '',
  trainingConfig: {},
});

const STATUS_VARIANTS = {
  queued: { variant: 'warning', label: 'Queued' },
  starting: { variant: 'warning', label: 'Starting' },
  processing: { variant: 'default', label: 'Processing' },
  succeeded: { variant: 'success', label: 'Succeeded' },
  failed: { variant: 'destructive', label: 'Failed' },
  canceled: { variant: 'outline', label: 'Canceled' },
};

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
const MAX_TRAINING_ATTEMPTS = Number(import.meta.env.VITE_TRAINING_MAX_ATTEMPTS || 1);

const sortByCreatedAtDesc = (a, b) =>
  new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0);

const mergeTrainingPayload = (current = {}, incoming = {}) => {
  const merged = {
    ...current,
    ...incoming,
  };

  if (incoming.userId || current.userId) {
    merged.userId = incoming.userId || current.userId;
  }

  merged.imageAssets = Array.isArray(incoming.imageAssets)
    ? incoming.imageAssets
    : Array.isArray(current.imageAssets)
    ? current.imageAssets
    : [];

  merged.imageUrls = Array.isArray(incoming.imageUrls)
    ? incoming.imageUrls
    : Array.isArray(current.imageUrls)
    ? current.imageUrls
    : [];

  merged.events = Array.isArray(incoming.events)
    ? incoming.events
    : Array.isArray(current.events)
    ? current.events
    : [];

  merged.logs = Array.isArray(incoming.logs)
    ? incoming.logs
    : Array.isArray(current.logs)
    ? current.logs
    : [];

  return merged;
};

const upsertTrainingList = (list, incoming) => {
  if (!incoming?._id) return list;

  const index = list.findIndex((item) => item._id === incoming._id);
  if (index === -1) {
    const next = [incoming, ...list];
    return next.sort(sortByCreatedAtDesc);
  }

  const next = [...list];
  next[index] = mergeTrainingPayload(list[index], incoming);
  return next.sort(sortByCreatedAtDesc);
};

const formatTimestamp = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDuration = (milliseconds) => {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null;
  const totalSeconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 1) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
};

function Training() {
  const [users, setUsers] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(createInitialForm);
  const [viewerImage, setViewerImage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const eventSourceRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const statusMapRef = useRef(new Map());
  const [isStreamConnected, setIsStreamConnected] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  const modelCount = trainings.length;
  const completedCount = useMemo(
    () => trainings.filter((t) => t.status === 'succeeded').length,
    [trainings]
  );

  const selectedUser = useMemo(
    () => users.find((candidate) => candidate._id === formData.userId),
    [users, formData.userId]
  );

  const selectedUserAssets = selectedUser?.imageAssets ?? [];
  const selectedUserAssetCount = selectedUserAssets.length;

  const totalDatasetSize = useMemo(
    () =>
      selectedUserAssets.reduce(
        (sum, asset) => sum + (typeof asset.size === 'number' ? asset.size : 0),
        0
      ),
    [selectedUserAssets]
  );

  const fetchData = async (withSpinner = true) => {
    try {
      if (withSpinner) setLoading(true);
      const [usersResponse, trainingsResponse] = await Promise.all([
        userAPI.getAll(),
        trainingAPI.getAll(),
      ]);
      const resolvedUsers = Array.isArray(usersResponse?.data)
        ? usersResponse.data
        : Array.isArray(usersResponse)
        ? usersResponse
        : [];
      const resolvedTrainings = Array.isArray(trainingsResponse?.data)
        ? trainingsResponse.data
        : Array.isArray(trainingsResponse)
        ? trainingsResponse
        : [];
      setUsers(resolvedUsers);
      const initialTrainings = resolvedTrainings.slice().sort(sortByCreatedAtDesc);
      setTrainings(initialTrainings);
      const nextStatuses = new Map(statusMapRef.current);
      initialTrainings.forEach((training) => {
        if (training?._id) {
          nextStatuses.set(training._id, training.status);
        }
      });
      statusMapRef.current = nextStatuses;
    } catch (error) {
      toast.error(`Failed to fetch data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const applyTrainingUpdate = useCallback((payload) => {
    if (Array.isArray(payload)) {
      setTrainings(payload.slice().sort(sortByCreatedAtDesc));
      return;
    }
    if (!payload?._id) return;
    setTrainings((previous) => upsertTrainingList(previous, payload));
  }, []);

  const connectEventStream = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
      console.warn('EventSource is not supported in this environment.');
      return;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const streamUrl = `${API_BASE_URL}/trainings/stream/live`;
    const source = new EventSource(streamUrl, { withCredentials: true });
    eventSourceRef.current = source;

    source.onopen = () => {
      setIsStreamConnected(true);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    source.onmessage = (event) => {
      if (!event?.data) return;
      try {
        const payload = JSON.parse(event.data);
        applyTrainingUpdate(payload);
      } catch (parseError) {
        console.error('Failed to parse training stream payload', parseError);
      }
    };

    source.onerror = (error) => {
      console.warn('Training stream error, retrying in 4s…', error);
      setIsStreamConnected(false);
      source.close();
      eventSourceRef.current = null;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        connectEventStream();
      }, 4000);
    };
  }, [applyTrainingUpdate]);

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
      setIsStreamConnected(false);
    };
  }, [connectEventStream]);

  useEffect(() => {
    trainings.forEach((training) => {
      if (!training?._id) return;
      const previousStatus = statusMapRef.current.get(training._id);
      if (previousStatus && previousStatus !== training.status) {
        if (training.status === 'succeeded') {
          toast.success(`Training "${training.modelName}" completed`);
        } else if (training.status === 'failed') {
          toast.error(
            training.error
              ? `Training "${training.modelName}" failed: ${training.error}`
              : `Training "${training.modelName}" failed`
          );
        } else if (training.status === 'canceled') {
          toast(`Training "${training.modelName}" canceled`, {
            icon: '⚠️',
          });
        }
      }
      statusMapRef.current.set(training._id, training.status);
    });
  }, [trainings]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmitting) return;
    if (!formData.userId) {
      toast.error('Select a user before starting training');
      return;
    }

    if (!selectedUser) {
      toast.error('Unable to locate the selected user. Refresh and try again.');
      return;
    }

    if (selectedUserAssetCount === 0) {
      toast.error('This user has no reference photos yet. Upload images on the Users page first.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        userId: formData.userId,
      };

      if (formData.modelName) {
        payload.modelName = formData.modelName;
      }
      if (Object.keys(formData.trainingConfig || {}).length > 0) {
        payload.trainingConfig = formData.trainingConfig;
      }

      const response = await trainingAPI.create(payload);
      const createdTraining = response?.data || response;
      applyTrainingUpdate(createdTraining);
      toast.success('Training kicked off');
      resetForm();
    } catch (error) {
      toast.error(`Failed to start training: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openTrainingAsset = (asset) => {
    if (!asset?.url) return;
    setViewerImage({
      src: asset.url,
      title: asset.originalName || asset.key || 'Training image',
      downloadUrl: asset.url,
      sizeLabel:
        typeof asset.size === 'number'
          ? formatFileSize(asset.size)
          : undefined,
    });
  };

  const handleViewerClose = useCallback(() => {
    if (viewerImage?.shouldRevoke && viewerImage?.src?.startsWith('blob:')) {
      URL.revokeObjectURL(viewerImage.src);
    }
    setViewerImage(null);
  }, [viewerImage]);

  const handleCancelTraining = async (id) => {
    if (!window.confirm('Cancel this training job?')) return;

    try {
      const response = await trainingAPI.cancel(id);
      const canceledTraining = response?.data || response;
      applyTrainingUpdate(canceledTraining);
      toast.success('Training canceled');
    } catch (error) {
      toast.error(`Failed to cancel: ${error.message}`);
    }
  };

  const resetForm = () => {
    if (viewerImage?.shouldRevoke && viewerImage?.src?.startsWith('blob:')) {
      URL.revokeObjectURL(viewerImage.src);
    }
    setFormData(createInitialForm());
    setViewerImage(null);
    setShowForm(false);
    setIsSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 text-foreground/60">
        <Rocket className="h-9 w-9 animate-spin text-foreground/40" />
        <p className="text-sm uppercase tracking-[0.2em] text-foreground/40">
          Loading trainings
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Model Training
          </h2>
          <p className="mt-1 text-sm text-foreground/60">
            Upload curated portrait datasets to fine-tune your characters.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="hidden sm:inline-flex bg-foreground/10 text-foreground/70">
            {modelCount} jobs
          </Badge>
          <Badge className="hidden sm:inline-flex bg-foreground/10 text-foreground/70">
            {completedCount} completed
          </Badge>
          <Badge
            variant={isStreamConnected ? 'success' : 'outline'}
            className="hidden sm:inline-flex"
          >
            {isStreamConnected ? 'Live updates' : 'Reconnecting…'}
          </Badge>
          <Button className="gap-2" onClick={() => setShowForm((prev) => !prev)}>
            <Rocket className="h-4 w-4" />
            {showForm ? 'Close form' : 'Start training'}
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Start a new fine-tune</CardTitle>
            <CardDescription>
              Pick a user and we’ll bundle their uploaded reference photos into a ZIP for Replicate automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="userId">Select user *</Label>
                  <Select
                    value={formData.userId}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, userId: value }))}
                  >
                    <SelectTrigger id="userId">
                      <SelectValue placeholder="Pick a user" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user) => (
                        <SelectItem key={user._id} value={user._id}>
                          {user.name} · {user.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="modelName">Model name (optional)</Label>
                  <Input
                    id="modelName"
                    name="modelName"
                    placeholder="orbiting-salih"
                    value={formData.modelName}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              <div className="space-y-4 rounded-xl border border-border/60 bg-muted p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-2">
                    <Label>Training dataset</Label>
                    <p className="text-xs text-foreground/45">
                      We’ll compress the selected user’s reference photos into a training-ready ZIP automatically.
                    </p>
                    {selectedUser ? (
                      <>
                        {selectedUserAssetCount < 10 && (
                          <p className="text-xs text-amber-300">
                            Fewer than 10 images uploaded. Add more variety for better results.
                          </p>
                        )}
                        <p className="text-xs text-foreground/45">
                          Selected: {selectedUserAssetCount} · Total size {formatFileSize(totalDatasetSize)}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-foreground/45">
                        Choose a user to review the dataset that will be sent for training.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{selectedUserAssetCount} images</Badge>
                  </div>
                </div>

                {selectedUser ? (
                  selectedUserAssetCount > 0 ? (
                    <div className="overflow-hidden rounded-xl border border-border/60">
                      <div className="hidden bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground/45 sm:grid sm:grid-cols-[auto,1fr,auto]">
                        <span className="pl-2">Preview</span>
                        <span>File</span>
                        <span className="text-right">Size</span>
                      </div>
                      <ul className="divide-y divide-border/60">
                        {selectedUserAssets.map((asset, index) => {
                          if (!asset?.url) {
                            return null;
                          }
                          const displayName =
                            asset?.originalName ||
                            asset?.key?.split('/').pop() ||
                            `image-${index + 1}.jpg`;
                          const sizeLabel =
                            typeof asset?.size === 'number'
                              ? formatFileSize(asset.size)
                              : '—';
                          const uploadedAt =
                            asset?.uploadedAt && !Number.isNaN(new Date(asset.uploadedAt)?.getTime())
                              ? new Date(asset.uploadedAt)
                              : null;
                          const uploadedLabel = uploadedAt ? uploadedAt.toLocaleDateString() : null;
                          return (
                            <li
                              key={asset?._id || asset?.key || index}
                              className="flex flex-col gap-3 px-4 py-3 sm:grid sm:grid-cols-[auto,1fr,auto] sm:items-center sm:gap-4"
                            >
                              <button
                                type="button"
                                className="group relative h-28 w-full overflow-hidden rounded-lg border border-border/40 bg-card sm:h-16 sm:w-28"
                                onClick={() =>
                                  openTrainingAsset({
                                    ...asset,
                                    originalName: displayName,
                                  })
                                }
                              >
                                <img
                                  src={asset?.url}
                                  alt={displayName}
                                  className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                                />
                                <span className="absolute inset-0 bg-black/30 opacity-0 transition group-hover:opacity-100" />
                                <Maximize2 className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 transition group-hover:opacity-100" />
                              </button>
                              <div className="min-w-0 space-y-1">
                                <p className="truncate text-sm font-medium text-foreground">
                                  {displayName}
                                </p>
                                {uploadedLabel ? (
                                  <p className="text-xs uppercase tracking-[0.2em] text-foreground/45">
                                    Uploaded {uploadedLabel}
                                  </p>
                                ) : (
                                  <p className="text-xs uppercase tracking-[0.2em] text-foreground/45">
                                    Source: user library
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 sm:justify-end">
                                <span className="text-xs font-medium text-foreground/60">
                                  {sizeLabel}
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-foreground hover:text-accent"
                                  onClick={() =>
                                    openTrainingAsset({
                                      ...asset,
                                      originalName: displayName,
                                    })
                                  }
                                >
                                  <Maximize2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-xs text-foreground/50">
                      This user has no uploaded images yet. Add reference photos from the Users page before training.
                    </p>
                  )
                ) : (
                  <p className="text-xs text-foreground/50">
                    Select a user to preview the images that will be packaged.
                  </p>
                )}
              </div>

              <CardFooter className="flex flex-col-reverse gap-3 border-none p-0 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={resetForm} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" className="gap-2" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Launching…
                    </>
                  ) : (
                    <>
                      <Rocket className="h-4 w-4" />
                      Launch training
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Training history</h3>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => fetchData()}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh all
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {trainings.map((training) => {
            const statusMeta = STATUS_VARIANTS[training.status] ?? STATUS_VARIANTS.processing;
            const hasNumericProgress =
              typeof training.progress === 'number' && Number.isFinite(training.progress);
            const clampedProgress = hasNumericProgress
              ? Math.min(100, Math.max(0, training.progress))
              : null;
            const progressLabel =
              clampedProgress !== null
                ? Number.isInteger(clampedProgress)
                  ? clampedProgress.toString()
                  : clampedProgress.toFixed(1)
                : null;
            const startedAt = training.startedAt ? new Date(training.startedAt) : null;
            const completedAt = training.completedAt ? new Date(training.completedAt) : null;
            let etaLabel = null;
            if (
              startedAt &&
              clampedProgress !== null &&
              clampedProgress > 0 &&
              clampedProgress < 100
            ) {
              const referenceTime = training.completedAt ? completedAt.getTime() : now;
              const elapsedMs = Math.max(0, referenceTime - startedAt.getTime());
              if (elapsedMs > 0) {
                const remainingMs = (elapsedMs * (100 - clampedProgress)) / clampedProgress;
                etaLabel = formatDuration(remainingMs);
              }
            }
            const attemptsLabel = `${training.attempts ?? 0}/${MAX_TRAINING_ATTEMPTS}`;
            const recentLogs = Array.isArray(training.logs)
              ? training.logs.slice(-6).reverse()
              : [];
            const datasetCount = training.imageAssets?.length || training.imageUrls?.length || 0;
            const showCancel = ['queued', 'starting', 'processing'].includes(training.status);

            return (
              <Card key={training._id} className="flex flex-col justify-between">
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-xl">{training.modelName}</CardTitle>
                      <CardDescription className="text-xs text-foreground/45">
                        Started {new Date(training.createdAt).toLocaleString()}
                      </CardDescription>
                    </div>
                    <Badge variant={statusMeta.variant}>
                      {statusMeta.label}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/50">
                    <Boxes className="h-3.5 w-3.5" />
                    <span>{datasetCount} images</span>
                    {training.trainingConfig?.source === 'upload' && (
                      <span className="rounded-full bg-foreground/10 px-2 py-1 text-[11px] uppercase tracking-wide text-foreground/55">
                        ZIP upload
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-foreground/70">
                  <p>
                    User · {training.userId?.name} ({training.userId?.email})
                  </p>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-3">
                      <div className="flex items-center justify-between text-xs text-foreground/55">
                        <span className="uppercase tracking-[0.25em] text-foreground/45">Progress</span>
                        <span className="font-mono text-foreground">
                          {progressLabel !== null ? `${progressLabel}%` : '—'}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-foreground/10">
                        <div
                          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
                          style={{ width: `${clampedProgress ?? 0}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-foreground/55">
                        <span>Status: {statusMeta.label}</span>
                        {etaLabel ? <span>ETA ~ {etaLabel}</span> : null}
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-foreground/55">
                        <span>Attempts</span>
                        <span className="font-mono text-foreground">{attemptsLabel}</span>
                      </div>
                      {!hasNumericProgress && (
                        <p className="text-[11px] text-foreground/55">
                          Awaiting progress metrics from Replicate…
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 text-[11px] text-foreground/55">
                        {startedAt ? <span>Started {startedAt.toLocaleString()}</span> : null}
                        {completedAt ? <span>Completed {completedAt.toLocaleString()}</span> : null}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-card/70 p-3">
                      <p className="text-xs uppercase tracking-[0.25em] text-foreground/45">Logs</p>
                      {recentLogs.length > 0 ? (
                        <div className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1 font-mono text-[11px] text-foreground/65">
                          {recentLogs.map((log, index) => (
                            <div key={`${log.timestamp || index}-${log.message}`}>
                              <span className="text-foreground/40">
                                {formatTimestamp(log.timestamp)} ·
                              </span>{' '}
                              {log.message}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-foreground/50">Waiting for training logs…</p>
                      )}
                    </div>
                  </div>

                  {training.trainingConfig?.zipUrl && (
                    <a
                      href={training.trainingConfig.zipUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-fit items-center gap-2 text-xs text-accent hover:text-accent/80"
                    >
                      <DownloadCloud className="h-3.5 w-3.5" />
                      Download dataset ZIP
                    </a>
                  )}
                  {training.modelVersion && (
                    <p className="break-all font-mono text-xs text-emerald-300">
                      Model version: {training.modelVersion}
                    </p>
                  )}
                  {training.error && (
                    <p className="text-sm text-red-300">
                      {training.error}
                    </p>
                  )}
                  {training.logsUrl && (
                    <a
                      href={training.logsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-fit items-center gap-2 text-xs text-accent hover:text-accent/80"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View training logs
                    </a>
                  )}
                  {training.imageAssets?.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-foreground/50">
                        <p className="uppercase tracking-[0.25em] text-foreground/45">Dataset preview</p>
                        <span className="font-medium">{training.imageAssets.length} files</span>
                      </div>
                      <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1">
                        {training.imageAssets.map((asset, index) => {
                          if (!asset?.url) return null;
                          return (
                            <button
                              type="button"
                              key={asset._id || asset.key || index}
                              className="group relative h-20 overflow-hidden rounded-md border border-border/40"
                              onClick={() => openTrainingAsset(asset)}
                            >
                              <img
                                src={asset.url}
                                alt={asset.originalName || asset.key || `training-${index + 1}`}
                                className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                              />
                              <span className="absolute inset-0 bg-black/35 opacity-0 transition group-hover:opacity-100" />
                              <Maximize2 className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 transition group-hover:opacity-100" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : training.imageUrls?.length > 0 ? (
                    <div className="space-y-1 text-xs text-foreground/50">
                      <p className="uppercase tracking-[0.25em]">Dataset links</p>
                      <ul className="space-y-1">
                        {training.imageUrls.slice(0, 6).map((url) => (
                          <li key={url} className="truncate">
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent/80">
                              {url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </CardContent>
                <CardFooter className="flex items-center justify-end gap-2 border-t border-border/60 bg-card py-4">
                  {showCancel ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-1"
                      onClick={() => handleCancelTraining(training._id)}
                    >
                      <Ban className="h-4 w-4" />
                      Cancel
                    </Button>
                  ) : (
                    <span className="text-[11px] uppercase tracking-[0.2em] text-foreground/45">
                      Listening for webhook events…
                    </span>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>

        {trainings.length === 0 && (
          <Card className="border-dashed border-border/50 bg-card text-center">
            <CardContent className="space-y-3 py-14">
              <CloudUpload className="mx-auto h-10 w-10 text-foreground/30" />
              <h3 className="text-lg font-medium text-foreground">
                No training jobs yet
              </h3>
              <p className="text-sm text-foreground/55">
                Start a training job to generate your first custom checkpoints.
              </p>
              <Button onClick={() => setShowForm(true)} className="mt-3">
                <Rocket className="mr-2 h-4 w-4" />
                Start training
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <ImageViewer open={Boolean(viewerImage)} image={viewerImage} onClose={handleViewerClose} />
    </div>
  );
}

export default Training;
