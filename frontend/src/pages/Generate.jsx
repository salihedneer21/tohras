import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Sparkles,
  Images,
  Download,
  RefreshCw,
  Workflow,
  AlertTriangle,
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
  const [formData, setFormData] = useState(() => ({
    userId: '',
    trainingId: '',
    prompt: '',
    config: { ...DEFAULT_CONFIG },
  }));

  useEffect(() => {
    fetchData();
  }, []);

  const totalGenerations = generations.length;
  const successfulGenerations = useMemo(
    () => generations.filter((item) => item.status === 'succeeded').length,
    [generations]
  );

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersResponse, generationsResponse] = await Promise.all([
        userAPI.getAll(),
        generationAPI.getAll(),
      ]);
      setUsers(usersResponse.data);
      setGenerations(generationsResponse.data);
    } catch (error) {
      toast.error(`Failed to fetch data: ${error.message}`);
    } finally {
      setLoading(false);
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
      const response = await trainingAPI.getUserSuccessful(userId);
      setTrainings(response.data);
    } catch (error) {
      toast.error(`Failed to fetch trainings: ${error.message}`);
      setTrainings([]);
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
      await generationAPI.create(formData);
      toast.success('Generation started! Check the feed below.');
      resetForm();
      setTimeout(() => fetchData(), 2500);
    } catch (error) {
      toast.error(`Failed to generate image: ${error.message}`);
    }
  };

  const handleRefresh = async (id) => {
    try {
      const response = await generationAPI.getById(id);
      toast.success(`Status: ${response.data.status}`);
      fetchData();
    } catch (error) {
      toast.error(`Failed to refresh: ${error.message}`);
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
          <Button className="gap-2" onClick={() => setShowForm((prev) => !prev)}>
            <Sparkles className="h-4 w-4" />
            {showForm ? 'Close form' : 'Generate images'}
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

              <div className="space-y-4 rounded-xl border border-border/60 bg-foreground/[0.04] p-4">
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

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Generation feed</h3>
          <Button variant="outline" className="gap-2" onClick={() => fetchData()}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4">
          {generations.map((generation) => {
            const statusMeta = STATUS_LABEL[generation.status] ?? STATUS_LABEL.processing;
            return (
              <Card key={generation._id} className="flex flex-col">
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-xl">
                        {generation.userId?.name}
                      </CardTitle>
                      <CardDescription className="text-xs text-foreground/45">
                        {generation.trainingId?.modelName ?? 'Unknown model'}
                      </CardDescription>
                    </div>
                    <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                  </div>
                  <div className="rounded-lg bg-foreground/[0.04] p-3 text-xs text-foreground/65 break-words">
                    <span className="font-semibold text-foreground/70">Prompt: </span>
                    {generation.prompt}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-foreground/45">
                    <span>
                      Created {new Date(generation.createdAt).toLocaleString()}
                    </span>
                    {generation.completedAt && (
                      <span>
                        Completed {new Date(generation.completedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {generation.imageUrls && generation.imageUrls.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {generation.imageUrls.map((url, index) => (
                        <div
                          key={`${generation._id}-${index}`}
                          className="overflow-hidden rounded-xl border border-border/70 bg-background/70"
                        >
                          <img
                            src={url}
                            alt={`Generation ${index + 1}`}
                            className="h-48 w-full object-cover"
                            loading="lazy"
                          />
                          <div className="flex items-center justify-between px-3 py-2 text-xs text-foreground/60">
                            <span>
                              Output {index + 1}
                            </span>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-accent hover:text-accent/80"
                            >
                              <Images className="h-3.5 w-3.5" />
                              View
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : generation.status === 'failed' ? (
                    <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200">
                      <div className="flex items-center gap-2 font-medium">
                        <AlertTriangle className="h-4 w-4" />
                        Generation failed
                      </div>
                      {generation.error && (
                        <p className="mt-1 text-xs text-red-100">{generation.error}</p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border/60 bg-background/60 p-3 text-sm text-foreground/50">
                      Rendering in progress...
                    </div>
                  )}
                </CardContent>

                <CardFooter className="flex items-center justify-end gap-2 border-t border-border/60 bg-background/40 py-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => handleRefresh(generation._id)}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </Button>
                  {generation.status === 'succeeded' && (
                    <Button
                      variant="success"
                      size="sm"
                      className="gap-1"
                      onClick={() => handleDownload(generation._id)}
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>

        {generations.length === 0 && (
          <Card className="border-dashed border-border/50 bg-background/60 text-center">
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
