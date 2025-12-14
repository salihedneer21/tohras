import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  UserCircle2,
  UploadCloud,
  Maximize2,
  Trash2,
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
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import ImageViewer from '@/components/ImageViewer';
import { formatFileSize } from '@/utils/file';

function ShareUser() {
  const { shopifyOrderId } = useParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewerAsset, setViewerAsset] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingIds, setDeletingIds] = useState([]);

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);
      const response = await userAPI.getByShopifyOrderId(shopifyOrderId);
      const data = response?.data || response;
      setUser(data);
    } catch (error) {
      toast.error(`Failed to load booking: ${error.message}`);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [shopifyOrderId]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const handleUploadImages = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length || !user?._id) return;

    let successCount = 0;
    let failCount = 0;

    setIsUploading(true);

    try {
      for (const file of files) {
        try {
          await userAPI.uploadImage(user._id, file);
          successCount += 1;
        } catch (error) {
          console.warn(`Failed to upload image ${file?.name}:`, error);
          failCount += 1;
        }
      }

      if (successCount > 0) {
        toast.success(
          `Uploaded ${successCount} image${successCount > 1 ? 's' : ''}`
        );
      }
      if (failCount > 0) {
        toast.error(`Failed to upload ${failCount} image${failCount > 1 ? 's' : ''}`);
      }

      await fetchUser();
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteImage = async (assetId) => {
    if (!user?._id) return;
    if (!window.confirm('Remove this image?')) return;
    try {
      setDeletingIds((prev) => (prev.includes(assetId) ? prev : [...prev, assetId]));
      await userAPI.deleteImage(user._id, assetId);
      toast.success('Image removed');
      setUser((prev) =>
        prev
          ? {
              ...prev,
              imageAssets: (prev.imageAssets || []).filter(
                (asset) => asset._id !== assetId
              ),
            }
          : prev
      );
    } catch (error) {
      toast.error(`Failed to remove image: ${error.message}`);
    } finally {
      setDeletingIds((prev) => prev.filter((id) => id !== assetId));
    }
  };

  const handleViewerClose = useCallback(() => {
    if (viewerAsset?.shouldRevoke && viewerAsset?.src?.startsWith('blob:')) {
      URL.revokeObjectURL(viewerAsset.src);
    }
    setViewerAsset(null);
  }, [viewerAsset]);

  if (loading) {
    return (
      <div className="space-y-6 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <Card className="border-border/60 bg-card/95">
            <CardHeader>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="mt-2 h-4 w-64" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <div className="max-w-xl mx-auto">
          <Card className="border-dashed border-border/60 bg-card/95 text-center">
            <CardContent className="space-y-3 py-10">
              <UserCircle2 className="mx-auto h-10 w-10 text-foreground/30" />
              <CardTitle className="text-lg font-semibold text-foreground">
                Booking not found
              </CardTitle>
              <CardDescription className="text-sm text-foreground/60">
                This share link is invalid or the booking has been removed.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const displayGender = user.gender || '—';
  const displayAge = typeof user.age === 'number' ? user.age : '—';
  const displayEmail = user.email || '—';
  const displayOrder = user.shopifyOrderName || user.shopifyOrderId || null;
  const displayBookName = user.shopifyBookName || null;

  return (
    <div className="space-y-6 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <Card className="border-border/60 bg-card/95">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <UserCircle2 className="h-5 w-5 text-primary" />
              Booking details
            </CardTitle>
            <CardDescription className="text-sm text-foreground/60">
              Review the child&apos;s details and update photos if needed. Text fields are read-only.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/40 p-4">
              <p className="text-sm font-semibold text-foreground">
                {user.name}
              </p>
              {user.secondTitle && (
                <p className="whitespace-pre-wrap text-sm text-foreground/70">
                  {user.secondTitle}
                </p>
              )}
              {(displayOrder || displayBookName) && (
                <p className="text-xs text-foreground/60">
                  {displayOrder && <span className="font-mono mr-1">{displayOrder}</span>}
                  {displayBookName && (
                    <span>{displayOrder ? '· ' : ''}{displayBookName}</span>
                  )}
                </p>
              )}
              <div className="mt-2 grid gap-1 text-sm text-foreground/70">
                <span>
                  <span className="font-medium">Age:</span> {displayAge}
                </span>
                <span>
                  <span className="font-medium">Gender:</span> {displayGender}
                </span>
                <span>
                  <span className="font-medium">Email:</span> {displayEmail}
                </span>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground/80">
                    Reference photos
                  </p>
                  <p className="text-xs text-foreground/50">
                    You can add or remove photos. Text details above cannot be edited.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{user.imageAssets?.length || 0} images</Badge>
                  <label
                    htmlFor="share-upload-images"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-card px-3 py-2 text-xs font-semibold text-foreground/70 hover:bg-card/80 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <UploadCloud className="h-4 w-4" />
                    {isUploading ? 'Uploading...' : 'Upload'}
                  </label>
                  <input
                    id="share-upload-images"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    disabled={isUploading}
                    onChange={(event) => {
                      handleUploadImages(event.target.files);
                      event.target.value = '';
                    }}
                  />
                </div>
              </div>

              {user.imageAssets?.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {user.imageAssets.map((asset) => (
                    <div
                      key={asset._id || asset.key}
                      className="group relative overflow-hidden rounded-md border border-border/40 bg-card"
                    >
                      <button
                        type="button"
                        className="group relative block h-24 w-full overflow-hidden"
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
                      </button>
                      <div className="pointer-events-none absolute inset-0 flex items-end justify-end gap-2 p-2 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="pointer-events-auto h-8 w-8 rounded-full bg-black/60 text-white shadow-sm hover:bg-black/80"
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
                          variant="destructive"
                          className="pointer-events-auto h-8 w-8 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600"
                          disabled={deletingIds.includes(asset._id)}
                          onClick={() => handleDeleteImage(asset._id)}
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
          </CardContent>
        </Card>
      </div>

      <ImageViewer open={Boolean(viewerAsset)} image={viewerAsset} onClose={handleViewerClose} />
    </div>
  );
}

export default ShareUser;
