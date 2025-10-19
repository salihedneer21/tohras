import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Sparkles,
  Images,
  Download,
  Workflow,
  AlertTriangle,
  Crown,
  Star,
  Loader2,
} from 'lucide-react';
import { userAPI, trainingAPI, generationAPI } from '@/services/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

const DEFAULT_CONFIG = Object.freeze({
  numOutputs: 1,
  aspectRatio: '1:1',
  outputFormat: 'webp',
  guidanceScale: 3,
  outputQuality: 80,
});

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
const MAX_GENERATION_ATTEMPTS = Number(import.meta.env.VITE_GENERATION_MAX_ATTEMPTS || 3);

const sortByCreatedAtDesc = (a, b) =>
  new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0);

const mergeGenerationPayload = (current = {}, incoming = {}) => {
  const merged = {
    ...current,
    ...incoming,
  };

  if (incoming.userId || current.userId) {
    merged.userId = incoming.userId || current.userId;
  }

  if (incoming.trainingId || current.trainingId) {
    merged.trainingId = incoming.trainingId || current.trainingId;
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

const upsertGenerationList = (list, incoming) => {
  if (!incoming?._id) {
    return list;
  }

  const existingIndex = list.findIndex((item) => item._id === incoming._id);
  if (existingIndex === -1) {
    const next = [incoming, ...list];
    return next.sort(sortByCreatedAtDesc);
  }

  const next = [...list];
  next[existingIndex] = mergeGenerationPayload(list[existingIndex], incoming);
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

const STATUS_LABEL = {
  queued: { label: 'Queued', variant: 'warning' },
  processing: { label: 'Processing', variant: 'default' },
  succeeded: { label: 'Succeeded', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
};

function Generate() {
  const [users, setUsers] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [generations, setGenerations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showRankForm, setShowRankForm] = useState(false);
  const [formData, setFormData] = useState(() => ({
    userId: '',
    trainingId: '',
    prompt: '',
    config: { ...DEFAULT_CONFIG },
  }));
  const [rankForm, setRankForm] = useState(() => ({
    userId: '',
    trainingId: '',
    prompt: '',
  }));
  const [rankTrainings, setRankTrainings] = useState([]);
  const [isRankGenerating, setIsRankGenerating] = useState(false);

  const eventSourceRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const [isStreamConnected, setIsStreamConnected] = useState(false);

  const applyGenerationUpdate = useCallback((payload) => {
    setGenerations((previous) => upsertGenerationList(previous, payload));
  }, []);

  const connectEventStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const streamUrl = `${API_BASE_URL}/generations/stream/live`;
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
        applyGenerationUpdate(payload);
      } catch (parseError) {
        console.error('Failed to parse generation stream payload', parseError);
      }
    };

    source.onerror = (error) => {
      console.warn('Generation stream error, retrying in 4s…', error);
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
  }, [applyGenerationUpdate]);

  useEffect(() => {
    fetchData();
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
      setIsStreamConnected(false);
    };
  }, [connectEventStream]);

  const totalGenerations = generations.length;
  const successfulGenerations = useMemo(
    () => generations.filter((item) => item.status === 'succeeded').length,
    [generations]
  );

  const fetchData = async (withSpinner = true) => {
    try {
      if (withSpinner) setLoading(true);
      const [usersResponse, generationsResponse] = await Promise.all([
        userAPI.getAll(),
        generationAPI.getAll(),
      ]);
      setUsers(usersResponse.data);
      const initialGenerations = Array.isArray(generationsResponse.data)
        ? generationsResponse.data.slice().sort(sortByCreatedAtDesc)
        : [];
      setGenerations(initialGenerations);
    } catch (error) {
      toast.error(`Failed to fetch data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchTrainingsForUser = async (userId, setter) => {
    if (!userId) {
      setter([]);
      return;
    }
    try {
      const response = await trainingAPI.getUserSuccessful(userId);
      setter(response.data);
    } catch (error) {
      setter([]);
      throw error;
    }
  };

  const handleUserChange = async (userId) => {
    setFormData((prev) => ({
      ...prev,
      userId,
      trainingId: '',
    }));

    if (!userId) {
      setTrainings([]);
      return;
    }

    try {
      await fetchTrainingsForUser(userId, setTrainings);
    } catch (error) {
      toast.error(`Failed to fetch trainings: ${error.message}`);
    }
  };

  const handleRankUserChange = async (userId) => {
    setRankForm((prev) => ({
      ...prev,
      userId,
      trainingId: '',
    }));

    if (!userId) {
      setRankTrainings([]);
      return;
    }

    try {
      await fetchTrainingsForUser(userId, setRankTrainings);
    } catch (error) {
      toast.error(`Failed to fetch trainings: ${error.message}`);
    }
  };

  const handleConfigUpdate = (key, value) => {
    setFormData((prev) => ({
      ...prev,
      config: {
        ...prev.config,
        [key]: value,
      },
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const response = await generationAPI.create(formData);
      const newGeneration = response.data || response;
      const selectedUser = users.find((user) => user._id === formData.userId);
      const selectedTraining = trainings.find(
        (training) => training._id === formData.trainingId
      );

      applyGenerationUpdate({
        ...newGeneration,
        userId: newGeneration.userId || selectedUser,
        trainingId: newGeneration.trainingId || selectedTraining,
      });
      toast.success('Generation started! Check the feed below.');
      resetForm();
    } catch (error) {
      toast.error(`Failed to generate image: ${error.message}`);
    }
  };

  const handleRankSubmit = async (event) => {
    event.preventDefault();

    if (!rankForm.userId || !rankForm.trainingId || !rankForm.prompt.trim()) {
      toast.error('Select a user, model, and enter a prompt');
      return;
    }

    setIsRankGenerating(true);
    try {
      const payload = {
        userId: rankForm.userId,
        trainingId: rankForm.trainingId,
        prompt: rankForm.prompt.trim(),
      };

      const response = await generationAPI.createRanked(payload);
      const newGeneration = response.data || response;
      const selectedUser = users.find((user) => user._id === rankForm.userId);
      const selectedTraining = rankTrainings.find(
        (training) => training._id === rankForm.trainingId
      );

      applyGenerationUpdate({
        ...newGeneration,
        userId: newGeneration.userId || selectedUser,
        trainingId: newGeneration.trainingId || selectedTraining,
      });
      toast.success('Generated and ranked images successfully');
      resetRankForm();
    } catch (error) {
      toast.error(`Failed to generate ranked images: ${error.message}`);
    } finally {
      setIsRankGenerating(false);
    }
  };

  const handleDownload = async (id) => {
    try {
      await generationAPI.download(id);
      toast.success('Download triggered');
    } catch (error) {
      toast.error(`Failed to download: ${error.message}`);
    }
  };

  const resetForm = () => {
    setFormData({
      userId: '',
      trainingId: '',
      prompt: '',
      config: { ...DEFAULT_CONFIG },
    });
    setTrainings([]);
    setShowForm(false);
  };

  const resetRankForm = () => {
    setRankForm({
      userId: '',
      trainingId: '',
      prompt: '',
    });
    setRankTrainings([]);
    setShowRankForm(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 text-foreground/60">
        <Sparkles className="h-8 w-8 animate-spin text-foreground/40" />
        <p className="text-sm uppercase tracking-[0.2em] text-foreground/40">
          Loading generations
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Image Generation
          </h2>
          <p className="mt-1 text-sm text-foreground/60">
            Turn your fine-tuned checkpoints into story-worthy visuals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="hidden sm:inline-flex bg-foreground/10 text-foreground/70">
            {totalGenerations} prompts
          </Badge>
          <Badge className="hidden sm:inline-flex bg-foreground/10 text-foreground/70">
            {successfulGenerations} completed
          </Badge>
          <Badge
            variant={isStreamConnected ? 'success' : 'outline'}
            className="hidden sm:inline-flex"
          >
            {isStreamConnected ? 'Live updates' : 'Reconnecting…'}
          </Badge>
          <Button className="gap-2" onClick={() => setShowForm((prev) => !prev)}>
            <Sparkles className="h-4 w-4" />
            {showForm ? 'Close form' : 'Generate images'}
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setShowRankForm((prev) => !prev)}
          >
            <Crown className="h-4 w-4" />
            {showRankForm ? 'Close ranking' : 'Ranked generation'}
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create new generation</CardTitle>
            <CardDescription>
              Choose a trained model and describe the scene. Adjust settings to control the output quality.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>User *</Label>
                  <Select
                    value={formData.userId}
                    onValueChange={handleUserChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select user" />
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
                  <Label>Trained model *</Label>
                  <Select
                    value={formData.trainingId}
                    onValueChange={(value) => setFormData((prev) => ({ ...prev, trainingId: value }))}
                    disabled={!formData.userId || trainings.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={formData.userId ? 'Select model' : 'Pick a user first'} />
                    </SelectTrigger>
                    <SelectContent>
                      {trainings.map((training) => (
                        <SelectItem key={training._id} value={training._id}>
                          {training.modelName} · {new Date(training.completedAt).toLocaleDateString()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.userId && trainings.length === 0 && (
                    <p className="text-xs text-amber-300">
                      No successful trainings found for this user yet.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="prompt">Prompt *</Label>
                <Textarea
                  id="prompt"
                  value={formData.prompt}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, prompt: event.target.value }))
                  }
                  rows={4}
                  placeholder="Describe the scene, mood, style or camera details..."
                  required
                />
              </div>

              <div className="space-y-4 rounded-xl border border-border/60 bg-muted p-4">
                <h4 className="text-sm font-semibold text-foreground/70">
                  Generation settings
                </h4>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <Label>Outputs</Label>
                    <Select
                      value={String(formData.config.numOutputs)}
                      onValueChange={(value) => handleConfigUpdate('numOutputs', Number(value))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4].map((count) => (
                          <SelectItem key={count} value={String(count)}>
                            {count}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Aspect ratio</Label>
                    <Select
                      value={formData.config.aspectRatio}
                      onValueChange={(value) => handleConfigUpdate('aspectRatio', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1:1">1:1 Square</SelectItem>
                        <SelectItem value="16:9">16:9 Landscape</SelectItem>
                        <SelectItem value="9:16">9:16 Portrait</SelectItem>
                        <SelectItem value="4:3">4:3</SelectItem>
                        <SelectItem value="3:4">3:4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Format</Label>
                    <Select
                      value={formData.config.outputFormat}
                      onValueChange={(value) => handleConfigUpdate('outputFormat', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="webp">WebP</SelectItem>
                        <SelectItem value="jpg">JPG</SelectItem>
                        <SelectItem value="png">PNG</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-foreground/50">
                      <Label>Guidance scale</Label>
                      <span>{formData.config.guidanceScale.toFixed(1)}</span>
                    </div>
                    <Slider
                      value={[formData.config.guidanceScale]}
                      min={0}
                      max={10}
                      step={0.5}
                      onValueChange={(value) => handleConfigUpdate('guidanceScale', value[0])}
                    />
                    <p className="text-xs text-foreground/45">
                      Higher values enforce the prompt more strictly.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-foreground/50">
                      <Label>Output quality</Label>
                      <span>{formData.config.outputQuality}%</span>
                    </div>
                    <Slider
                      value={[formData.config.outputQuality]}
                      min={0}
                      max={100}
                      step={5}
                      onValueChange={(value) => handleConfigUpdate('outputQuality', value[0])}
                    />
                    <p className="text-xs text-foreground/45">
                      Balance fidelity against generation speed.
                    </p>
                  </div>
                </div>
              </div>

              <CardFooter className="flex flex-col-reverse gap-3 border-none bg-transparent p-0 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit" className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  Generate
                </Button>
              </CardFooter>
            </form>
          </CardContent>
        </Card>
      )}

      {showRankForm && (
        <Card>
          <CardHeader>
            <CardTitle>Generate & rank images</CardTitle>
            <CardDescription>
              Produce four high-quality PNG renders, then let the LLM score and rank them automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRankSubmit} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>User *</Label>
                  <Select
                    value={rankForm.userId}
                    onValueChange={handleRankUserChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select user" />
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
                  <Label>Trained model *</Label>
                  <Select
                    value={rankForm.trainingId}
                    onValueChange={(value) => setRankForm((prev) => ({ ...prev, trainingId: value }))}
                    disabled={!rankForm.userId || rankTrainings.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={rankForm.userId ? 'Select model' : 'Pick a user first'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {rankTrainings.map((training) => (
                        <SelectItem key={training._id} value={training._id}>
                          {training.modelName} ·{' '}
                          {training.completedAt
                            ? new Date(training.completedAt).toLocaleDateString()
                            : 'recent'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {rankForm.userId && rankTrainings.length === 0 && (
                    <p className="text-xs text-amber-300">
                      No successful trainings found for this user yet.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="rankPrompt">Prompt *</Label>
                <Textarea
                  id="rankPrompt"
                  value={rankForm.prompt}
                  onChange={(event) =>
                    setRankForm((prev) => ({ ...prev, prompt: event.target.value }))
                  }
                  rows={4}
                  placeholder="Describe the scene you’d like to compare..."
                  required
                />
                <p className="text-xs text-foreground/50">
                  The system will render four PNGs with guidance scale 2 and quality 100, then rank them for you.
                </p>
              </div>

              <CardFooter className="flex flex-col gap-3 border-none bg-transparent p-0 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={resetRankForm} disabled={isRankGenerating}>
                  Cancel
                </Button>
                <Button type="submit" className="gap-2" disabled={isRankGenerating}>
                  {isRankGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Ranking...
                    </>
                  ) : (
                    <>
                      <Crown className="h-4 w-4" />
                      Generate & rank
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
          <h3 className="text-lg font-semibold text-foreground">Generation feed</h3>
          <span className="hidden text-xs uppercase tracking-[0.25em] text-foreground/45 sm:inline">
            Webhook powered
          </span>
        </div>

        <div className="grid gap-4">
          {generations.map((generation) => {
            const statusMeta = STATUS_LABEL[generation.status] ?? STATUS_LABEL.processing;
            const rawAssets = generation.imageAssets?.length
              ? generation.imageAssets
              : generation.imageUrls?.map((url) => ({ url })) || [];
            const assetMap = new Map();
            rawAssets.forEach((asset, idx) => {
              assetMap.set(idx + 1, asset);
            });

            const rankedAssets = generation.ranking?.ranked?.length
              ? generation.ranking.ranked
                  .slice()
                  .sort((a, b) => a.rank - b.rank)
                  .map((entry) => ({
                    entry,
                    asset: assetMap.get(entry.imageIndex) || rawAssets[entry.imageIndex - 1] || null,
                  }))
                  .filter((item) => item.asset)
              : null;

            const imageItems = rankedAssets
              ? rankedAssets.map((item) => ({ ...item.asset, rankingMeta: item.entry }))
              : rawAssets;

            const hasProgress =
              typeof generation.progress === 'number' && Number.isFinite(generation.progress);
            const progressValue = hasProgress
              ? Math.min(100, Math.max(0, generation.progress))
              : null;
            const progressLabel =
              progressValue !== null
                ? progressValue % 1 === 0
                  ? progressValue.toString()
                  : progressValue.toFixed(1)
                : null;
            const attemptCount = generation.attempts ?? 0;
            const attemptLabel = `${attemptCount}/${MAX_GENERATION_ATTEMPTS}`;
            const recentEvents = Array.isArray(generation.events)
              ? [...generation.events].slice(-5).reverse()
              : [];
            const recentLogs = Array.isArray(generation.logs)
              ? [...generation.logs].slice(-8)
              : [];
            const awaitingOutputs =
              generation.status === 'queued' || generation.status === 'processing';

            return (
              <Card key={generation._id} className="flex flex-col">
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-xl">{generation.userId?.name}</CardTitle>
                      <CardDescription className="text-xs text-foreground/45">
                        {generation.trainingId?.modelName ?? 'Unknown model'}
                      </CardDescription>
                    </div>
                    <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-xs text-foreground/65 break-words">
                    <span className="font-semibold text-foreground/70">Prompt: </span>
                    {generation.prompt}
                  </div>
                  {generation.ranking?.summary ? (
                    <div className="rounded-lg border border-border/60 bg-card/70 p-3 text-xs text-foreground/65">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="font-semibold text-foreground/75">Ranking summary</span>
                          <p className="mt-1 text-foreground/60">{generation.ranking.summary}</p>
                          {generation.ranking.promptReflection ? (
                            <p className="mt-2 text-[11px] text-foreground/45">
                              {generation.ranking.promptReflection}
                            </p>
                          ) : null}
                        </div>
                        {generation.ranking.winners?.length ? (
                          <Badge variant="success" className="gap-1">
                            <Star className="h-3 w-3" /> Top
                            {generation.ranking.winners.map((idx) => ` #${idx}`).join(', ')}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-3 text-xs text-foreground/45">
                    <span>Created {new Date(generation.createdAt).toLocaleString()}</span>
                    {generation.completedAt && (
                      <span>Completed {new Date(generation.completedAt).toLocaleString()}</span>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="grid gap-3 text-xs text-foreground/60">
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                      <div className="flex items-center justify-between">
                        <span className="uppercase tracking-[0.25em] text-foreground/45">
                          Attempts
                        </span>
                        <span className="font-mono text-foreground">{attemptLabel}</span>
                      </div>
                      {progressValue !== null ? (
                        <>
                          <div className="mt-2 h-2 w-full rounded-full bg-foreground/10">
                            <div
                              className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
                              style={{ width: `${progressValue}%` }}
                            />
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[11px] text-foreground/55">
                            <span>{progressLabel}% complete</span>
                            <span>
                              {generation.status === 'queued'
                                ? 'Queued'
                                : generation.status === 'processing'
                                ? 'Processing'
                                : statusMeta.label}
                            </span>
                          </div>
                        </>
                      ) : (
                        <p className="mt-2 text-foreground/55">
                          {awaitingOutputs
                            ? 'Awaiting progress metrics from Replicate…'
                            : 'Progress metrics unavailable.'}
                        </p>
                      )}
                    </div>

                    {recentEvents.length > 0 && (
                      <div className="rounded-lg border border-border/60 bg-card/70 p-3">
                        <p className="text-xs uppercase tracking-[0.25em] text-foreground/45">
                          Activity
                        </p>
                        <ul className="mt-2 space-y-1">
                          {recentEvents.map((event) => (
                            <li
                              key={`${event.timestamp || event.type}-${event.message}`}
                              className="flex items-start gap-2 text-xs text-foreground/65"
                            >
                              <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-accent" />
                              <span>
                                <span className="font-medium text-foreground/75">
                                  {formatTimestamp(event.timestamp)}
                                  {event.type ? ` · ${event.type}` : ''}
                                </span>
                                {event.message ? (
                                  <span className="block text-foreground/60">{event.message}</span>
                                ) : null}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {recentLogs.length > 0 && (
                      <div className="rounded-lg border border-border/60 bg-card/60 p-3">
                        <p className="text-xs uppercase tracking-[0.25em] text-foreground/45">
                          Logs
                        </p>
                        <div className="mt-2 max-h-32 space-y-1 overflow-y-auto pr-1 font-mono text-[11px] text-foreground/65">
                          {recentLogs.map((log, index) => (
                            <div key={`${log.timestamp || index}-${log.message}`}>
                              <span className="text-foreground/40">
                                {formatTimestamp(log.timestamp)} ·
                              </span>{' '}
                              {log.message}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {generation.status === 'failed' && (
                    <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200">
                      <div className="flex items-center gap-2 font-medium">
                        <AlertTriangle className="h-4 w-4" />
                        Generation failed
                      </div>
                      {generation.error && (
                        <p className="mt-1 text-xs text-red-100">{generation.error}</p>
                      )}
                    </div>
                  )}

                  {imageItems.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {imageItems.map((image, index) => (
                        <div
                          key={`${generation._id}-${index}`}
                          className="overflow-hidden rounded-xl border border-border/70 bg-card"
                        >
                          <img
                            src={image.url}
                            alt={`Generation ${index + 1}`}
                            className="h-48 w-full object-cover"
                            loading="lazy"
                          />
                          <div className="flex items-center justify-between px-3 py-2 text-xs text-foreground/60">
                            <span className="flex items-center gap-1 font-medium text-foreground/75">
                              {image.rankingMeta ? (
                                <span>
                                  Rank {image.rankingMeta.rank} · Image {image.rankingMeta.imageIndex}
                                </span>
                              ) : (
                                <span>Output {index + 1}</span>
                              )}
                            </span>
                            {image.rankingMeta ? (
                              <Badge
                                variant={
                                  image.rankingMeta.verdict === 'excellent'
                                    ? 'success'
                                    : image.rankingMeta.verdict === 'good'
                                    ? 'default'
                                    : image.rankingMeta.verdict === 'fair'
                                    ? 'warning'
                                    : 'destructive'
                                }
                              >
                                {image.rankingMeta.score}%
                              </Badge>
                            ) : null}
                            <a
                              href={image.downloadUrl || image.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-accent hover:text-accent/80"
                            >
                              <Images className="h-3.5 w-3.5" />
                              View
                            </a>
                          </div>
                          {image.rankingMeta?.notes ? (
                            <div className="border-t border-border/60 bg-card/80 px-3 py-2 text-[11px] text-foreground/55">
                              {image.rankingMeta.notes}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}

                  {!imageItems.length && generation.status !== 'failed' && (
                    <div className="rounded-lg border border-border/60 bg-card p-3 text-sm text-foreground/50">
                      {generation.status === 'queued'
                        ? 'Queued on Replicate—waiting for worker to pick up the job.'
                        : 'Generating images...'}
                    </div>
                  )}
                </CardContent>

                <CardFooter className="flex items-center justify-end gap-2 border-t border-border/60 bg-card py-4">
                  {generation.status === 'succeeded' ? (
                    <Button
                      variant="success"
                      size="sm"
                      className="gap-1"
                      onClick={() => handleDownload(generation._id)}
                    >
                      <Download className="h-4 w-4" />
                      Download
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

        {generations.length === 0 && (
          <Card className="border-dashed border-border/50 bg-card text-center">
            <CardContent className="space-y-3 py-14">
              <Workflow className="mx-auto h-10 w-10 text-foreground/30" />
              <h3 className="text-lg font-medium text-foreground">
                No generations yet
              </h3>
              <p className="text-sm text-foreground/55">
                Kick off a generation above to see outputs appear here.
              </p>
              <Button onClick={() => setShowForm(true)} className="mt-3">
                <Sparkles className="mr-2 h-4 w-4" />
                Generate images
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default Generate;
