import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Users as UsersIcon, UserPlus, UserCircle2, Trash2, Pencil, UploadCloud, Loader2, Maximize2 } from 'lucide-react';
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
import ImageViewer from '@/components/ImageViewer';
import { formatFileSize } from '@/utils/file';

const createEmptyForm = () => ({
  name: '',
  age: '',
  gender: 'male',
  email: '',
  countryCode: '+1',
  phoneNumber: '',
  images: [],
});

function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(createEmptyForm);
  const [editingId, setEditingId] = useState(null);
  const [viewerAsset, setViewerAsset] = useState(null);
  const [uploadingUserId, setUploadingUserId] = useState(null);
  const [formImages, setFormImages] = useState([]);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [userUploadStatus, setUserUploadStatus] = useState({});

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
      setUsers(response.data);
    } catch (error) {
      toast.error(`Failed to fetch users: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
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

      if (formImages.length > 0) {
        for (const imageItem of formImages) {
          try {
            setFormImages((prev) =>
              prev.map((img) =>
                img.id === imageItem.id
                  ? { ...img, status: 'uploading', progress: 0 }
                  : img
              )
            );

            await userAPI.uploadImage(newUserId, imageItem.file, (progressEvent) => {
              const total = progressEvent.total ?? imageItem.file.size ?? 1;
              const fraction = total ? progressEvent.loaded / total : 0;
              const percent = Math.round(Math.min(fraction * 100, 100));

              setFormImages((prev) =>
                prev.map((img) =>
                  img.id === imageItem.id ? { ...img, progress: percent } : img
                )
              );
            });

            setFormImages((prev) =>
              prev.map((img) =>
                img.id === imageItem.id
                  ? { ...img, status: 'done', progress: 100 }
                  : img
              )
            );
          } catch (error) {
            setFormImages((prev) =>
              prev.map((img) =>
                img.id === imageItem.id
                  ? { ...img, status: 'error' }
                  : img
              )
            );
            throw error;
          }
        }

        toast.success(
          `User created with ${formImages.length} image${
            formImages.length > 1 ? 's' : ''
          }`
        );
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

  const handleUploadImages = async (userId, fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    setUploadingUserId(userId);
    const total = files.length;
    setUserUploadStatus((prev) => ({
      ...prev,
      [userId]: {
        status: 'preparing',
        total,
        completed: 0,
        progress: 0,
        currentFile: files[0]?.name || null,
        currentPercent: 0,
      },
    }));

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];

        setUserUploadStatus((prev) => ({
          ...prev,
          [userId]: {
            ...(prev[userId] || {}),
            status: 'uploading',
            total,
            completed: index,
            currentFile: file.name,
            currentPercent: 0,
            progress: Math.round((index / total) * 100),
          },
        }));

        await userAPI.uploadImage(userId, file, (progressEvent) => {
          const totalBytes = progressEvent.total ?? file.size ?? 1;
          const fraction = totalBytes ? progressEvent.loaded / totalBytes : 0;
          const percent = Math.round(Math.min(fraction * 100, 100));
          const overallPercent = Math.round(
            Math.min(((index + fraction) / total) * 100, 100)
          );

          setUserUploadStatus((prev) => ({
            ...prev,
            [userId]: {
              ...(prev[userId] || {}),
              status: 'uploading',
              total,
              completed: index,
              currentFile: file.name,
              currentPercent: percent,
              progress: overallPercent,
            },
          }));
        });
      }

      setUserUploadStatus((prev) => ({
        ...prev,
        [userId]: {
          ...(prev[userId] || {}),
          status: 'done',
          total,
          completed: total,
          currentFile: null,
          currentPercent: 100,
          progress: 100,
        },
      }));

      toast.success(`Uploaded ${files.length} image${files.length > 1 ? 's' : ''}`);
      fetchUsers();
    } catch (error) {
      setUserUploadStatus((prev) => ({
        ...prev,
        [userId]: {
          ...(prev[userId] || {}),
          status: 'error',
        },
      }));
      toast.error(`Failed to upload images: ${error.message}`);
    } finally {
      setUploadingUserId(null);
      setTimeout(() => {
        setUserUploadStatus((prev) => {
          const copy = { ...prev };
          delete copy[userId];
          return copy;
        });
      }, 2000);
    }
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

    const mapped = files.map((file, index) => ({
      id: `${file.name}-${Date.now()}-${index}`,
      file,
      preview: URL.createObjectURL(file),
      status: 'pending',
      progress: 0,
    }));

    setFormImages((prev) => [...prev, ...mapped]);
    event.target.value = '';
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
      <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 text-foreground/60">
        <UsersIcon className="h-8 w-8 animate-spin text-foreground/40" />
        <p className="text-sm uppercase tracking-[0.2em] text-foreground/40">
          Loading users
        </p>
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
                <div className="space-y-3 rounded-xl border border-border/60 bg-muted p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <Label>Upload images (optional)</Label>
                      <p className="text-xs text-foreground/45">
                        Add reference photos now, or upload them later
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

                  {formImages.length > 0 && (
                    <div className="overflow-hidden rounded-xl border border-border/60">
                      <div className="hidden bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground/45 sm:grid sm:grid-cols-[auto,1fr,auto]">
                        <span className="pl-2">Preview</span>
                        <span>File</span>
                        <span className="text-right">Status</span>
                      </div>
                      <ul className="divide-y divide-border/60">
                        {formImages.map((item) => {
                          const statusLabel =
                            item.status === 'uploading'
                              ? 'Uploading'
                              : item.status === 'done'
                              ? 'Uploaded'
                              : item.status === 'error'
                              ? 'Failed'
                              : 'Ready';
                          const progressColor =
                            item.status === 'error'
                              ? 'bg-red-400'
                              : item.status === 'done'
                              ? 'bg-emerald-400'
                              : 'bg-accent';

                          return (
                            <li
                              key={item.id}
                              className="flex flex-col gap-3 px-4 py-3 sm:grid sm:grid-cols-[auto,1fr,auto] sm:items-center sm:gap-4"
                            >
                              <button
                                type="button"
                                className="group relative h-24 w-full overflow-hidden rounded-lg border border-border/40 bg-card sm:h-16 sm:w-24"
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
                              <div className="min-w-0 space-y-2">
                                <div>
                                  <p className="truncate text-sm font-medium text-foreground">
                                    {item.file.name}
                                  </p>
                                  <p className="text-xs text-foreground/50">
                                    {formatFileSize(item.file.size)}
                                  </p>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.25em] text-foreground/45">
                                    <span>{statusLabel}</span>
                                    <span>{item.progress}%</span>
                                  </div>
                                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                                    <div
                                      className={`h-full ${progressColor} transition-all`}
                                      style={{ width: `${item.progress}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 sm:justify-end">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-foreground hover:text-accent"
                                  onClick={() =>
                                    setViewerAsset({
                                      src: item.preview,
                                      title: item.file.name,
                                      sizeLabel: formatFileSize(item.file.size),
                                      shouldRevoke: true,
                                    })
                                  }
                                >
                                  <Maximize2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  disabled={item.status === 'uploading'}
                                  className="h-8 w-8 text-red-300 transition hover:text-red-200 disabled:text-foreground/30 disabled:hover:text-foreground/30"
                                  onClick={() => handleRemoveFormImage(item.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
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
          const uploadState = userUploadStatus[user._id];
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
                  <span>{user.gender} · {user.age}</span>
                </p>
                <p className="truncate text-foreground/60">{user.email}</p>
                <p className="text-foreground/60">
                  {user.countryCode} {user.phoneNumber}
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground/80">Reference photos</p>
                  <div className="flex items-center gap-2">
                    {uploadingUserId === user._id && <Loader2 className="h-4 w-4 animate-spin text-accent" />}
                    <label
                      htmlFor={`upload-${user._id}`}
                      className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-muted px-3 py-2 text-xs font-semibold text-foreground/70 hover:bg-muted/80"
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
                      disabled={uploadingUserId === user._id}
                    />
                  </div>
                </div>
                {uploadState && (
                  <div className="rounded-lg border border-border/60 bg-muted/60 px-3 py-2 text-xs text-foreground/60">
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate">
                        {uploadState.status === 'uploading'
                          ? uploadState.currentFile || 'Uploading...'
                          : uploadState.status === 'done'
                          ? 'Upload complete'
                          : uploadState.status === 'error'
                          ? 'Upload failed'
                          : 'Preparing upload'}
                      </span>
                      <span>{uploadState.progress}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/40">
                      <div
                        className={`h-full ${
                          uploadState.status === 'error' ? 'bg-red-400' : 'bg-accent'
                        } transition-all`}
                        style={{ width: `${uploadState.progress}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-foreground/45">
                      {Math.min(uploadState.completed, uploadState.total)} of {uploadState.total} uploaded
                    </p>
                  </div>
                )}
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
