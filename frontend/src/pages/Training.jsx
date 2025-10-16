import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Boxes,
  CloudUpload,
  FileInput,
  RefreshCw,
  Rocket,
  Ban,
  DownloadCloud,
  ExternalLink,
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

const createInitialForm = () => ({
  userId: '',
  imageUrls: [],
  modelName: '',
});

const STATUS_VARIANTS = {
  starting: { variant: 'warning', label: 'Starting' },
  processing: { variant: 'default', label: 'Processing' },
  succeeded: { variant: 'success', label: 'Succeeded' },
  failed: { variant: 'destructive', label: 'Failed' },
  canceled: { variant: 'outline', label: 'Canceled' },
};

function Training() {
  const [users, setUsers] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [zipFile, setZipFile] = useState(null);
  const [formData, setFormData] = useState(createInitialForm);
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(false), 10000);
    return () => clearInterval(interval);
  }, []);

  const modelCount = trainings.length;
  const completedCount = useMemo(
    () => trainings.filter((t) => t.status === 'succeeded').length,
    [trainings]
  );

  const fetchData = async (withSpinner = true) => {
    try {
      if (withSpinner) setLoading(true);
      const [usersResponse, trainingsResponse] = await Promise.all([
        userAPI.getAll(),
        trainingAPI.getAll(),
      ]);
      setUsers(usersResponse.data);
      setTrainings(trainingsResponse.data);
    } catch (error) {
      toast.error(`Failed to fetch data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddImageUrl = () => {
    const trimmed = imageUrl.trim();
    if (!trimmed) return;
    setFormData((prev) => ({
      ...prev,
      imageUrls: [...prev.imageUrls, trimmed],
    }));
    setImageUrl('');
  };

  const handleRemoveImageUrl = (index) => {
    setFormData((prev) => ({
      ...prev,
      imageUrls: prev.imageUrls.filter((_, idx) => idx !== index),
    }));
  };

  const handleLoadUserImages = () => {
    const selectedUser = users.find((user) => user._id === formData.userId);
    if (!selectedUser || !(selectedUser.imageUrls?.length > 0)) {
      toast.error('No stored images found for this user');
      return;
    }

    setFormData((prev) => ({
      ...prev,
      imageUrls: Array.from(new Set([...prev.imageUrls, ...selectedUser.imageUrls])),
    }));
    toast.success('User gallery imported');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.userId) {
      toast.error('Select a user before starting training');
      return;
    }

    if (formData.imageUrls.length === 0 && !zipFile) {
      toast.error('Add image URLs or upload a ZIP of training images');
      return;
    }

    try {
      let payload = formData;
      if (zipFile) {
        payload = new FormData();
        payload.append('userId', formData.userId);
        payload.append('modelName', formData.modelName);
        payload.append('imageUrls', JSON.stringify(formData.imageUrls));
        payload.append('trainingZip', zipFile);
      }

      await trainingAPI.create(payload);
      toast.success('Training kicked off');
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(`Failed to start training: ${error.message}`);
    }
  };

  const handleRefreshTraining = async (id) => {
    try {
      const response = await trainingAPI.checkStatus(id);
      toast.success(`Status updated: ${response.data.status}`);
      fetchData(false);
    } catch (error) {
      toast.error(`Failed to refresh status: ${error.message}`);
    }
  };

  const handleCancelTraining = async (id) => {
    if (!window.confirm('Cancel this training job?')) return;

    try {
      await trainingAPI.cancel(id);
      toast.success('Training canceled');
      fetchData(false);
    } catch (error) {
      toast.error(`Failed to cancel: ${error.message}`);
    }
  };

  const resetForm = () => {
    setFormData(createInitialForm());
    setImageUrl('');
    setZipFile(null);
    setShowForm(false);
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
            Upload curated datasets or a ready-made ZIP to fine-tune your characters.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="hidden sm:inline-flex bg-foreground/10 text-foreground/70">
            {modelCount} jobs
          </Badge>
          <Badge className="hidden sm:inline-flex bg-foreground/10 text-foreground/70">
            {completedCount} completed
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
              Combine stored gallery links or upload a zipped dataset. ZIP uploads take precedence.
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

              <div className="space-y-4 rounded-xl border border-border/60 bg-foreground/[0.04] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <Label>Training image URLs</Label>
                    <p className="text-xs text-foreground/45">
                      Replicate recommends at least 10 diverse portraits for best results.
                    </p>
                  </div>
                  <Badge variant="outline">
                    {formData.imageUrls.length} URLs attached
                  </Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                  <Input
                    name="imageUrl"
                    placeholder="https://cdn.domain.com/dataset/image-01.jpg"
                    value={imageUrl}
                    onChange={(event) => setImageUrl(event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="gap-2"
                    onClick={handleAddImageUrl}
                  >
                    <FileInput className="h-4 w-4" />
                    Add URL
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    disabled={!formData.userId}
                    onClick={handleLoadUserImages}
                  >
                    <DownloadCloud className="h-4 w-4" />
                    Load user images
                  </Button>
                </div>

                {formData.imageUrls.length > 0 && (
                  <div className="grid gap-2">
                    {formData.imageUrls.map((url, index) => (
                      <div
                        key={`${url}-${index}`}
                        className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-xs text-foreground/70"
                      >
                        <span className="flex-1 truncate">{url}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 px-2 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                          onClick={() => handleRemoveImageUrl(index)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-xl border border-border/60 bg-foreground/[0.04] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="trainingZip">Upload training ZIP</Label>
                    <p className="text-xs text-foreground/45">
                      Overrides image URLs when provided. Max 200MB.
                    </p>
                  </div>
                  {zipFile && (
                    <Badge
                      variant="outline"
                      className="max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap text-xs"
                    >
                      {zipFile.name}
                    </Badge>
                  )}
                </div>

                <Input
                  id="trainingZip"
                  type="file"
                  accept=".zip"
                  className="cursor-pointer"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    const allowed = [
                      'application/zip',
                      'application/x-zip-compressed',
                      'multipart/x-zip',
                      'application/octet-stream',
                    ];
                    if (file && !allowed.includes(file.type) && !file.name.toLowerCase().endsWith('.zip')) {
                      toast.error('Please choose a valid .zip archive');
                      event.target.value = '';
                      return;
                    }
                    setZipFile(file || null);
                  }}
                />
                {zipFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 w-fit px-3 text-xs text-foreground/60 hover:text-foreground"
                    onClick={() => setZipFile(null)}
                  >
                    Remove ZIP
                  </Button>
                )}
              </div>

              <CardFooter className="flex flex-col-reverse gap-3 border-none p-0 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit" className="gap-2">
                  <Rocket className="h-4 w-4" />
                  Launch training
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
                    <span>{training.imageUrls?.length || 0} URLs</span>
                    {training.trainingConfig?.source === 'upload' && (
                      <span className="rounded-full bg-foreground/10 px-2 py-1 text-[11px] uppercase tracking-wide text-foreground/55">
                        ZIP upload
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-foreground/70">
                  <p>
                    User · {training.userId?.name} ({training.userId?.email})
                  </p>
                  {training.trainingConfig?.originalZipName && (
                    <p className="break-words text-foreground/60">
                      Uploaded archive: {training.trainingConfig.originalZipName}
                    </p>
                  )}
                  {training.completedAt && (
                    <p>Completed {new Date(training.completedAt).toLocaleString()}</p>
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
                      className="flex w-fit items-center gap-2 text-xs text-sky-300 hover:text-sky-200"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View training logs
                    </a>
                  )}
                </CardContent>
                <CardFooter className="flex items-center justify-end gap-2 border-t border-border/60 bg-background/40 py-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => handleRefreshTraining(training._id)}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </Button>
                  {(training.status === 'starting' || training.status === 'processing') && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-1"
                      onClick={() => handleCancelTraining(training._id)}
                    >
                      <Ban className="h-4 w-4" />
                      Cancel
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>

        {trainings.length === 0 && (
          <Card className="border-dashed border-border/50 bg-background/60 text-center">
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
    </div>
  );
}

export default Training;
