import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Users as UsersIcon,
  UserPlus,
  UserCircle2,
  Trash2,
  Pencil,
  UploadCloud,
  Loader2,
  Maximize2,
  RefreshCw,
} from 'lucide-react';
import { userAPI } from '@/services/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
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
import { Skeleton } from '@/components/ui/skeleton';
import ImageViewer from '@/components/ImageViewer';
import { formatFileSize } from '@/utils/file';
import EvaluationImageCard from '@/components/evaluation/EvaluationImageCard';
import EvaluationSummary from '@/components/evaluation/EvaluationSummary';
import { evaluateImageFile } from '@/utils/evaluation';

const createEmptyForm = () => ({
  name: '',
  age: '',
  gender: 'male',
  email: '',
  countryCode: '+1',
  phoneNumber: '',
  images: [],
});

const summariseEvaluationItems = (items) => {
  const evaluated = items.filter((item) => item.status === 'evaluated');
  if (!evaluated.length) {
    return null;
  }

  const acceptedCount = evaluated.filter((item) => item.evaluation?.acceptable).length;
  const rejectedCount = evaluated.length - acceptedCount;
  const totalConfidence = evaluated.reduce(
    (sum, item) => sum + (item.evaluation?.confidencePercent || 0),
    0
  );
  const averageConfidence = Math.round(totalConfidence / evaluated.length || 0);

  let verdict = 'needs_more';
  let summary =
    'Some photos need review. Approve or override the ones you want to keep before continuing.';
  if (acceptedCount === evaluated.length) {
    verdict = 'accept';
    summary = 'All evaluated photos meet the training guidelines.';
  } else if (acceptedCount === 0) {
    verdict = 'reject';
    summary =
      'None of the evaluated photos met the quality guidelines. Capture new reference images.';
  }

  return {
    verdict,
    acceptedCount,
    rejectedCount,
    confidencePercent: averageConfidence,
    summary,
  };
};

function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(createEmptyForm);
  const [editingId, setEditingId] = useState(null);
  const [viewerAsset, setViewerAsset] = useState(null);
  const [formImages, setFormImages] = useState([]);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [pendingEvaluations, setPendingEvaluations] = useState({});

  const handleViewerClose = useCallback(() => {
    if (viewerAsset?.shouldRevoke && viewerAsset?.src?.startsWith('blob:')) {
      URL.revokeObjectURL(viewerAsset.src);
    }
    setViewerAsset(null);
  }, [viewerAsset]);

  useEffect(() => {
    fetchUsers();
  }, []);

  const totalImages = useMemo(
    () => users.reduce((sum, user) => sum + (user.imageAssets?.length || 0), 0),
    [users]
  );

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await userAPI.getAll();
      const fetchedUsers = response.data;
      setUsers(fetchedUsers);
      setPendingEvaluations((prev) => {
        if (!prev || Object.keys(prev).length === 0) return prev;
        const validIds = new Set(fetchedUsers.map((item) => item._id));
        const next = {};
        Object.entries(prev).forEach(([userId, bucket]) => {
          if (!bucket) return;
          if (validIds.has(userId)) {
            next[userId] = bucket;
          } else {
            bucket.items?.forEach((item) => {
              if (item.preview?.startsWith('blob:')) {
                URL.revokeObjectURL(item.preview);
              }
            });
          }
        });
        return next;
      });
    } catch (error) {
      toast.error(`Failed to fetch users: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

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
          override: false,
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

  const mutatePendingImage = useCallback((userId, imageId, updater) => {
    setPendingEvaluations((prev) => {
      const bucket = prev[userId];
      if (!bucket) return prev;
      const items = bucket.items.map((item) =>
        item.id === imageId
          ? {
              ...item,
              ...(typeof updater === 'function' ? updater(item) : updater),
            }
          : item
      );
      return {
        ...prev,
        [userId]: {
          ...bucket,
          items,
        },
      };
    });
  }, []);

  const evaluatePendingImage = useCallback(
    async (userId, imageEntry) => {
      mutatePendingImage(userId, imageEntry.id, { status: 'evaluating', error: null });
      try {
        const evaluation = await evaluateImageFile(imageEntry.file);
        const imageResult = Array.isArray(evaluation?.images) ? evaluation.images[0] : null;
        if (!imageResult) {
          throw new Error('Evaluator returned no image analysis');
        }
        const overall = evaluation.overallAcceptance || null;
        const acceptable = Boolean(imageResult.acceptable);
        mutatePendingImage(userId, imageEntry.id, {
          status: 'evaluated',
          evaluation: imageResult,
          overall,
          include: acceptable,
          override: false,
        });
      } catch (error) {
        const message = error?.message || 'Evaluation failed';
        mutatePendingImage(userId, imageEntry.id, {
          status: 'evaluation_failed',
          error: message,
          include: false,
        });
        toast.error(`Evaluation failed for ${imageEntry.file?.name || 'image'}: ${message}`);
      }
    },
    [mutatePendingImage]
  );

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const formEvaluationOverall = useMemo(
    () => summariseEvaluationItems(formImages),
    [formImages]
  );

  const handleToggleFormInclude = useCallback(
    (id, include) => {
      mutateFormImage(id, (current) => ({
        include,
        override: include && !current.evaluation?.acceptable,
      }));
    },
    [mutateFormImage]
  );

  const handleRetryFormImage = useCallback(
    (id) => {
      const entry = formImages.find((item) => item.id === id);
      if (entry) {
        evaluateFormImage(entry);
      }
    },
    [formImages, evaluateFormImage]
  );

  const addPendingEvaluationBatch = useCallback(
    (userId, files) => {
      if (!files.length) return;
      const timestamp = Date.now();
      const mapped = files.map((file, index) => ({
        id: `${userId}-${timestamp}-${index}-${file.name}`,
        file,
        preview: URL.createObjectURL(file),
        status: 'pending',
        evaluation: null,
        overall: null,
        include: false,
        override: false,
        error: null,
      }));

      setPendingEvaluations((prev) => {
        const existing = prev[userId]?.items || [];
        return {
          ...prev,
          [userId]: {
            items: [...existing, ...mapped],
            uploading: false,
          },
        };
      });

      mapped.forEach((entry) => evaluatePendingImage(userId, entry));
    },
    [evaluatePendingImage]
  );

  const handleTogglePendingInclude = useCallback(
    (userId, imageId, include) => {
      mutatePendingImage(userId, imageId, (current) => ({
        include,
        override: include && !current.evaluation?.acceptable,
      }));
    },
    [mutatePendingImage]
  );

  const handleRetryPendingImage = useCallback(
    (userId, imageId) => {
      const bucket = pendingEvaluations[userId];
      const entry = bucket?.items.find((item) => item.id === imageId);
      if (entry) {
        evaluatePendingImage(userId, entry);
      }
    },
    [pendingEvaluations, evaluatePendingImage]
  );

  const handleRemovePendingImage = useCallback((userId, imageId) => {
    setPendingEvaluations((prev) => {
      const bucket = prev[userId];
      if (!bucket) return prev;
      const target = bucket.items.find((item) => item.id === imageId);
      if (target?.preview?.startsWith('blob:')) {
        URL.revokeObjectURL(target.preview);
      }
      const items = bucket.items.filter((item) => item.id !== imageId);
      const next = { ...prev };
      if (items.length) {
        next[userId] = { ...bucket, items };
      } else {
        delete next[userId];
      }
      return next;
    });
  }, []);

  const handleClearPendingBatch = useCallback((userId) => {
    setPendingEvaluations((prev) => {
      const bucket = prev[userId];
      if (!bucket) return prev;
      bucket.items.forEach((item) => {
        if (item.preview?.startsWith('blob:')) {
          URL.revokeObjectURL(item.preview);
        }
      });
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  }, []);

  const handleResetPendingUploadFailure = useCallback(
    (userId, imageId) => {
      mutatePendingImage(userId, imageId, {
        status: 'evaluated',
        error: null,
      });
    },
    [mutatePendingImage]
  );

  const commitPendingUploads = useCallback(
    async (userId) => {
      const bucket = pendingEvaluations[userId];
      if (!bucket || bucket.items.length === 0) {
        toast.error('No evaluated images ready to upload.');
        return;
      }

      const hasPending =
        bucket.items.some((item) => item.status === 'evaluating' || item.status === 'pending');
      if (hasPending) {
        toast.error('Wait for evaluations to finish before uploading.');
        return;
      }

      const selected = bucket.items.filter((item) => item.include);
      if (!selected.length) {
        toast.error('Select at least one image to upload.');
        return;
      }

      setPendingEvaluations((prev) => ({
        ...prev,
        [userId]: {
          ...(prev[userId] || {}),
          uploading: true,
        },
      }));

      const results = await Promise.all(
        selected.map(async (item) => {
          mutatePendingImage(userId, item.id, { status: 'uploading', error: null });
          try {
            await userAPI.uploadImage(userId, item.file, {
              override: item.override,
              evaluation: item.evaluation,
            });
            mutatePendingImage(userId, item.id, { status: 'uploaded' });
            return { id: item.id, success: true };
          } catch (error) {
            const message = error?.message || 'Upload failed';
            mutatePendingImage(userId, item.id, {
              status: 'upload_failed',
              error: message,
            });
            return { id: item.id, success: false, error: message };
          }
        })
      );

      const failed = results.filter((result) => !result.success);
      if (failed.length) {
        toast.error(`Failed to upload ${failed.length} image${failed.length > 1 ? 's' : ''}.`);
        setPendingEvaluations((prev) => ({
          ...prev,
          [userId]: {
            ...(prev[userId] || {}),
            uploading: false,
          },
        }));
        return;
      }

      toast.success(`Uploaded ${selected.length} image${selected.length > 1 ? 's' : ''}`);
      setPendingEvaluations((prev) => {
        const bucketLatest = prev[userId];
        if (!bucketLatest) return prev;
        bucketLatest.items.forEach((item) => {
          if (item.status === 'uploaded' && item.preview?.startsWith('blob:')) {
            URL.revokeObjectURL(item.preview);
          }
        });
        const remaining = bucketLatest.items.filter((item) => item.status !== 'uploaded');
        const next = { ...prev };
        if (remaining.length) {
          next[userId] = { items: remaining, uploading: false };
        } else {
          delete next[userId];
        }
        return next;
      });
      fetchUsers();
    },
    [pendingEvaluations, mutatePendingImage]
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSavingUser) return;

    const hasPendingEvaluation = formImages.some(
      (item) => item.status === 'evaluating' || item.status === 'pending'
    );
    if (hasPendingEvaluation) {
      toast.error('Wait for image evaluations to finish before saving.');
      return;
    }

    setIsSavingUser(true);
    try {
      if (editingId) {
        await userAPI.update(editingId, formData);
        toast.success('User updated successfully');
        resetForm();
        fetchUsers();
        return;
      }

      const response = await userAPI.create(formData);
      const newUserId = response.data._id;

      const imagesToUpload = formImages.filter((item) => item.include && item.file);

      if (imagesToUpload.length > 0) {
        const uploadResults = await Promise.all(
          imagesToUpload.map(async (item) => {
            mutateFormImage(item.id, { status: 'uploading', error: null });
            try {
              await userAPI.uploadImage(newUserId, item.file, {
                override: item.override,
                evaluation: item.evaluation,
              });
              mutateFormImage(item.id, { status: 'uploaded' });
              return { id: item.id, success: true };
            } catch (error) {
              const message = error?.message || 'Upload failed';
              mutateFormImage(item.id, {
                status: 'upload_failed',
                error: message,
              });
              return { id: item.id, success: false, error: message };
            }
          })
        );

        const failed = uploadResults.filter((result) => !result.success);
        if (failed.length) {
          toast.error(`Uploaded with ${failed.length} failure${failed.length > 1 ? 's' : ''}.`);
        } else {
          toast.success(
            `User created with ${imagesToUpload.length} approved image${
              imagesToUpload.length > 1 ? 's' : ''
            }`
          );
        }
      } else {
        toast.success('User created successfully');
      }

      resetForm();
      fetchUsers();
    } catch (error) {
      toast.error(`Failed to save user: ${error.message}`);
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleEdit = (user) => {
    setFormData({
      name: user.name,
      age: user.age,
      gender: user.gender,
      email: user.email,
      countryCode: user.countryCode,
      phoneNumber: user.phoneNumber,
    });
    setEditingId(user._id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;

    try {
      await userAPI.delete(id);
      toast.success('User deleted');
      setPendingEvaluations((prev) => {
        if (!prev[id]) return prev;
        prev[id].items?.forEach((item) => {
          if (item.preview?.startsWith('blob:')) {
            URL.revokeObjectURL(item.preview);
          }
        });
        const next = { ...prev };
        delete next[id];
        return next;
      });
      fetchUsers();
    } catch (error) {
      toast.error(`Failed to delete user: ${error.message}`);
    }
  };

  const resetForm = () => {
    setFormData(createEmptyForm());
    setEditingId(null);
    setShowForm(false);
    formImages.forEach((img) => URL.revokeObjectURL(img.preview));
    setFormImages([]);
    if (viewerAsset?.shouldRevoke && viewerAsset?.src?.startsWith('blob:')) {
      URL.revokeObjectURL(viewerAsset.src);
    }
    setViewerAsset(null);
    setIsSavingUser(false);
  };

  const handleUploadImages = (userId, fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    addPendingEvaluationBatch(userId, files);
  };

  const handleDeleteImage = async (userId, assetId) => {
    if (!window.confirm('Remove this image?')) return;
    try {
      await userAPI.deleteImage(userId, assetId);
      toast.success('Image removed');
      fetchUsers();
    } catch (error) {
      toast.error(`Failed to remove image: ${error.message}`);
    }
  };

  const handleFormImageUpload = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const timestamp = Date.now();
    const mapped = files.map((file, index) => ({
      id: `${timestamp}-${index}-${file.name}`,
      file,
      preview: URL.createObjectURL(file),
      status: 'pending',
      evaluation: null,
      overall: null,
      include: false,
      override: false,
      error: null,
    }));

    setFormImages((prev) => [...prev, ...mapped]);
    event.target.value = '';

    mapped.forEach((entry) => {
      evaluateFormImage(entry);
    });
  };

  const handleRemoveFormImage = (id) => {
    setFormImages((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.status === 'uploading') {
        return prev;
      }
      if (target) {
        URL.revokeObjectURL(target.preview);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex items-end justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        {/* Users grid skeleton */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-9 w-9 rounded-full" />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-full" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Skeleton className="aspect-square w-full" />
                  <Skeleton className="aspect-square w-full" />
                  <Skeleton className="aspect-square w-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            User Management
          </h2>
          <p className="mt-1 text-sm text-foreground/60">
            Maintain the personas that fuel your fine-tuned models.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="hidden sm:inline-flex bg-foreground/10 text-foreground/70">
            {users.length} users
          </Badge>
          <Badge className="hidden sm:inline-flex bg-foreground/10 text-foreground/70">
            {totalImages} training images
          </Badge>
          <Button onClick={() => setShowForm((prev) => !prev)} className="gap-2">
            <UserPlus className="h-4 w-4" />
            {showForm ? 'Close form' : 'Add user'}
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit user' : 'Create new user'}</CardTitle>
            <CardDescription>
              Keep user details and reference photos organised before kicking off a training run.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid-responsive">
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
                    placeholder="28"
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
                    placeholder="jane@example.com"
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

              {!editingId && (
                <div className="space-y-4 rounded-xl border border-border/60 bg-muted p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <Label>Upload images (optional)</Label>
                      <p className="text-xs text-foreground/45">
                        Uploaded photos are automatically evaluated before they can be saved.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{formImages.length} images</Badge>
                      <label
                        htmlFor="formImages"
                        className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-card px-3 py-2 text-xs font-semibold text-foreground/70 hover:bg-card/80"
                      >
                        <UploadCloud className="h-4 w-4" />
                        Upload
                      </label>
                      <input
                        id="formImages"
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleFormImageUpload}
                      />
                    </div>
                  </div>

                  {formImages.length > 0 ? (
                    <div className="space-y-4">
                      {formEvaluationOverall ? (
                        <EvaluationSummary overall={formEvaluationOverall} />
                      ) : (
                        <p className="text-xs text-foreground/50">
                          Evaluations are running. Wait for the verdict before saving the user.
                        </p>
                      )}
                      <p className="text-xs text-foreground/50">
                        Selected for upload:{' '}
                        {formImages.filter((item) => item.include).length} of {formImages.length}
                      </p>

                      <div className="space-y-4">
                        {formImages.map((item) => (
                          <div
                            key={item.id}
                            className="space-y-3 rounded-xl border border-border/50 bg-card p-4"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                              <button
                                type="button"
                                className="group relative h-36 w-full overflow-hidden rounded-lg border border-border/40 bg-background sm:h-32 sm:w-40"
                                onClick={() =>
                                  setViewerAsset({
                                    src: item.preview,
                                    title: item.file.name,
                                    sizeLabel: formatFileSize(item.file.size),
                                    shouldRevoke: true,
                                  })
                                }
                              >
                                <img
                                  src={item.preview}
                                  alt={item.file.name}
                                  className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                                />
                                <span className="absolute inset-0 bg-black/25 opacity-0 transition group-hover:opacity-100" />
                                <Maximize2 className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 transition group-hover:opacity-100" />
                              </button>
                              <div className="flex-1 space-y-3">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <p className="text-sm font-semibold text-foreground">{item.file.name}</p>
                                    <p className="text-xs text-foreground/50">{formatFileSize(item.file.size)}</p>
                                  </div>
                                  <div className="flex gap-2">
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
                                  </div>
                                </div>

                                {item.status === 'evaluating' || item.status === 'pending' ? (
                                  <div className="flex items-center gap-2 text-xs text-foreground/60">
                                    <Loader2 className="h-4 w-4 animate-spin text-accent" />
                                    Evaluating photo quality…
                                  </div>
                                ) : null}

                                {item.status === 'evaluation_failed' ? (
                                  <div className="flex flex-col gap-2 rounded-lg border border-dashed border-amber-400/60 bg-amber-400/10 p-3 text-xs text-amber-200">
                                    <p>Evaluation failed: {item.error}</p>
                                    <div className="flex gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        className="gap-2"
                                        onClick={() => handleRetryFormImage(item.id)}
                                      >
                                        <RefreshCw className="h-4 w-4" />
                                        Retry evaluation
                                      </Button>
                                    </div>
                                  </div>
                                ) : null}

                                {item.status === 'evaluated' ? (
                                  <EvaluationImageCard
                                    evaluation={item.evaluation}
                                    summary={item.overall?.summary}
                                  >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                      <label className="flex items-center gap-2 text-xs text-foreground/70">
                                        <input
                                          type="checkbox"
                                          className="h-3.5 w-3.5 rounded border-border/60 accent-accent"
                                          checked={item.include}
                                          onChange={(event) =>
                                            handleToggleFormInclude(item.id, event.target.checked)
                                          }
                                        />
                                        Include in upload
                                      </label>
                                      <div className="flex items-center gap-2">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="text-xs text-foreground/60 hover:text-foreground"
                                          onClick={() => handleRetryFormImage(item.id)}
                                        >
                                          Re-run evaluation
                                        </Button>
                                      </div>
                                    </div>
                                    {item.include && !item.evaluation?.acceptable ? (
                                      <p className="text-xs text-amber-300">
                                        Override enabled: this image will be included despite the rejection verdict.
                                      </p>
                                    ) : null}
                                  </EvaluationImageCard>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-foreground/50">No images uploaded yet.</p>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  className="sm:w-auto"
                  onClick={resetForm}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="sm:w-auto gap-2"
                  disabled={isSavingUser}
                >
                  {isSavingUser && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingId
                    ? isSavingUser
                      ? 'Updating...'
                      : 'Update user'
                    : isSavingUser
                    ? 'Creating...'
                    : 'Create user'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {users.map((user) => {
          const pendingBucket = pendingEvaluations[user._id];
          const pendingItems = pendingBucket?.items || [];
          const pendingSummary = summariseEvaluationItems(pendingItems);
          const pendingSelected = pendingItems.filter((item) => item.include).length;
          const pendingHasActiveEvaluation = pendingItems.some(
            (item) => item.status === 'evaluating' || item.status === 'pending'
          );
          const disableUploadActions = Boolean(pendingBucket?.uploading);

          return (
            <Card key={user._id} className="flex flex-col justify-between">
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <div className="space-y-1">
                  <CardTitle className="text-lg">{user.name}</CardTitle>
                  <CardDescription className="flex items-center gap-2 text-xs uppercase text-foreground/40">
                    <UsersIcon className="h-3.5 w-3.5" />
                    Member
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                  {user.imageAssets?.length || 0} images
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 text-sm text-foreground/70">
                  <p className="flex items-center gap-2">
                    <UserCircle2 className="h-4 w-4 text-foreground/50" />
                    <span>
                      {user.gender} · {user.age}
                    </span>
                  </p>
                  <p className="truncate text-foreground/60">{user.email}</p>
                  <p className="text-foreground/60">
                    {user.countryCode} {user.phoneNumber}
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-semibold text-foreground/80">Reference photos</p>
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor={`upload-${user._id}`}
                          className={`inline-flex cursor-pointer items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-xs font-semibold transition ${
                            disableUploadActions ? 'bg-muted/70 text-foreground/40' : 'bg-card text-foreground/70 hover:bg-card/80'
                          }`}
                        >
                          <UploadCloud className="h-4 w-4" />
                          Upload
                        </label>
                        <input
                          id={`upload-${user._id}`}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(event) => {
                            handleUploadImages(user._id, event.target.files);
                            event.target.value = '';
                          }}
                          disabled={disableUploadActions}
                        />
                      </div>
                    </div>

                    {user.imageAssets?.length ? (
                      <div className="grid grid-cols-3 gap-2">
                        {user.imageAssets.map((asset) => (
                          <div
                            key={asset._id || asset.key}
                            className="group relative overflow-hidden rounded-md border border-border/40 bg-card"
                          >
                            <button
                              type="button"
                              className="group relative block h-20 w-full overflow-hidden"
                              onClick={() =>
                                setViewerAsset({
                                  src: asset.url,
                                  title: asset.originalName || asset.key || 'Reference photo',
                                  downloadUrl: asset.url,
                                  sizeLabel:
                                    typeof asset.size === 'number'
                                      ? formatFileSize(asset.size)
                                      : undefined,
                                })
                              }
                            >
                              <img
                                src={asset.url}
                                alt={asset.originalName || asset.key}
                                className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                              />
                              <span className="absolute inset-0 bg-black/25 opacity-0 transition group-hover:opacity-100" />
                              <Maximize2 className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 transition group-hover:opacity-100" />
                            </button>
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="pointer-events-auto h-7 w-7 text-foreground hover:text-accent"
                                onClick={() =>
                                  setViewerAsset({
                                    src: asset.url,
                                    title: asset.originalName || asset.key || 'Reference photo',
                                    downloadUrl: asset.url,
                                    sizeLabel:
                                      typeof asset.size === 'number'
                                        ? formatFileSize(asset.size)
                                        : undefined,
                                  })
                                }
                              >
                                <Maximize2 className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="pointer-events-auto h-7 w-7 text-red-300 hover:text-red-200"
                                onClick={() => handleDeleteImage(user._id, asset._id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-foreground/50">No images uploaded yet.</p>
                    )}
                  </div>

                  {pendingItems.length ? (
                    <div className="space-y-4 rounded-xl border border-border/60 bg-card/60 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-foreground/80">Pending evaluations</p>
                          <p className="text-xs text-foreground/50">
                            Approve the photos you want to add to this user.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="gap-2"
                            disabled={
                              disableUploadActions || pendingSelected === 0 || pendingHasActiveEvaluation
                            }
                            onClick={() => commitPendingUploads(user._id)}
                          >
                            {disableUploadActions ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : null}
                            Upload selected
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-xs text-foreground/60 hover:text-foreground"
                            disabled={disableUploadActions}
                            onClick={() => handleClearPendingBatch(user._id)}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>

                      {pendingBucket?.uploading ? (
                        <div className="flex items-center gap-2 text-xs text-foreground/60">
                          <Loader2 className="h-4 w-4 animate-spin text-accent" />
                          Uploading approved images…
                        </div>
                      ) : null}

                      {pendingSummary ? (
                        <EvaluationSummary overall={pendingSummary} />
                      ) : (
                        <p className="text-xs text-foreground/50">
                          Evaluations are running. Photos must be reviewed before they can be added.
                        </p>
                      )}

                      <p className="text-xs text-foreground/50">
                        Selected for upload: {pendingSelected} of {pendingItems.length}
                      </p>

                      <div className="space-y-4">
                        {pendingItems.map((item) => (
                          <div
                            key={item.id}
                            className="space-y-3 rounded-xl border border-border/50 bg-background/80 p-4"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                              <button
                                type="button"
                                className="group relative h-32 w-full overflow-hidden rounded-lg border border-border/40 bg-card sm:w-36"
                                onClick={() =>
                                  setViewerAsset({
                                    src: item.preview,
                                    title: item.file.name,
                                    sizeLabel: formatFileSize(item.file.size),
                                    shouldRevoke: true,
                                  })
                                }
                              >
                                <img
                                  src={item.preview}
                                  alt={item.file.name}
                                  className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                                />
                                <span className="absolute inset-0 bg-black/20 opacity-0 transition group-hover:opacity-100" />
                                <Maximize2 className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 transition group-hover:opacity-100" />
                              </button>
                              <div className="flex-1 space-y-3">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <p className="text-sm font-semibold text-foreground">{item.file.name}</p>
                                    <p className="text-xs text-foreground/50">{formatFileSize(item.file.size)}</p>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="text-xs text-red-300 hover:text-red-200"
                                      onClick={() => handleRemovePendingImage(user._id, item.id)}
                                      disabled={disableUploadActions || item.status === 'uploading'}
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                </div>

                                {item.status === 'pending' || item.status === 'evaluating' ? (
                                  <div className="flex items-center gap-2 text-xs text-foreground/60">
                                    <Loader2 className="h-4 w-4 animate-spin text-accent" />
                                    Evaluating photo quality…
                                  </div>
                                ) : null}

                                {item.status === 'evaluation_failed' ? (
                                  <div className="flex flex-col gap-2 rounded-lg border border-dashed border-amber-400/60 bg-amber-400/10 p-3 text-xs text-amber-200">
                                    <p>Evaluation failed: {item.error}</p>
                                    <div className="flex gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        className="gap-2"
                                        onClick={() => handleRetryPendingImage(user._id, item.id)}
                                      >
                                        <RefreshCw className="h-4 w-4" />
                                        Retry evaluation
                                      </Button>
                                    </div>
                                  </div>
                                ) : null}

                                {item.status === 'upload_failed' ? (
                                  <div className="flex flex-col gap-2 rounded-lg border border-dashed border-red-400/60 bg-red-500/10 p-3 text-xs text-red-200">
                                    <p>Upload failed: {item.error || 'Unable to store image.'}</p>
                                    <div className="flex gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        className="gap-2"
                                        onClick={() => handleResetPendingUploadFailure(user._id, item.id)}
                                      >
                                        Try again
                                      </Button>
                                    </div>
                                  </div>
                                ) : null}

                                {item.status === 'uploading' ? (
                                  <div className="flex items-center gap-2 text-xs text-foreground/60">
                                    <Loader2 className="h-4 w-4 animate-spin text-accent" />
                                    Uploading…
                                  </div>
                                ) : null}

                                {item.status === 'evaluated' ? (
                                  <EvaluationImageCard
                                    evaluation={item.evaluation}
                                    summary={item.overall?.summary}
                                  >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                      <label className="flex items-center gap-2 text-xs text-foreground/70">
                                        <input
                                          type="checkbox"
                                          className="h-3.5 w-3.5 rounded border-border/60 accent-accent"
                                          checked={item.include}
                                          onChange={(event) =>
                                            handleTogglePendingInclude(
                                              user._id,
                                              item.id,
                                              event.target.checked
                                            )
                                          }
                                        />
                                        Include in upload
                                      </label>
                                      <div className="flex items-center gap-2">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="sm"
                                          className="text-xs text-foreground/60 hover:text-foreground"
                                          onClick={() => handleRetryPendingImage(user._id, item.id)}
                                          disabled={disableUploadActions}
                                        >
                                          Re-run evaluation
                                        </Button>
                                      </div>
                                    </div>
                                    {item.include && !item.evaluation?.acceptable ? (
                                      <p className="text-xs text-amber-300">
                                        Override enabled: this image will be uploaded despite the rejection verdict.
                                      </p>
                                    ) : null}
                                  </EvaluationImageCard>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => handleEdit(user)}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="gap-1"
                    onClick={() => handleDelete(user._id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {users.length === 0 && (
        <Card className="border-dashed border-border/50 bg-card text-center">
          <CardContent className="space-y-3 py-14">
            <UserCircle2 className="mx-auto h-10 w-10 text-foreground/30" />
            <h3 className="text-lg font-medium text-foreground">
              No users yet
            </h3>
            <p className="text-sm text-foreground/55">
              Add your first persona to start fine-tuning your models.
            </p>
            <Button onClick={() => setShowForm(true)} className="mt-3">
              <UserPlus className="mr-2 h-4 w-4" />
              Add user
            </Button>
          </CardContent>
        </Card>
      )}
      <ImageViewer open={Boolean(viewerAsset)} image={viewerAsset} onClose={handleViewerClose} />
    </div>
  );
}

export default Users;
