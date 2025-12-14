import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Images, Loader2, X } from 'lucide-react';
import { userAPI } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import ImageViewer from '@/components/ImageViewer';

function UserImagesPreview({ userId, userName }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  const hasImages = useMemo(
    () => Array.isArray(user?.imageAssets) && user.imageAssets.length > 0,
    [user]
  );

  const toggleOpen = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const handleCloseViewer = useCallback(() => {
    setSelectedImage(null);
  }, []);

  useEffect(() => {
    if (!open || !userId || user) {
      return;
    }

    let cancelled = false;

    const fetchUser = async () => {
      try {
        setLoading(true);
        const response = await userAPI.getById(userId);
        if (cancelled) return;
        if (response?.success === false || !response?.data) {
          throw new Error(response?.message || 'Failed to load user');
        }
        setUser(response.data);
      } catch (error) {
        console.error('Failed to load user images:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchUser();

    return () => {
      cancelled = true;
    };
  }, [open, userId, user]);

  if (!userId) {
    return null;
  }

  const popover =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed top-20 right-4 z-[9990] w-64 sm:w-80">
            <Card className="border-border/80 bg-background/95 backdrop-blur-sm shadow-xl">
              <CardHeader className="px-3 py-2 sm:px-4 sm:py-3 border-b border-border/60">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-xs sm:text-sm font-semibold truncate">
                      {userName || 'User images'}
                    </CardTitle>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-foreground/60 hover:text-foreground hover:bg-muted"
                    onClick={() => setOpen(false)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="px-3 py-3 sm:px-4 sm:py-3">
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <div className="grid grid-cols-3 gap-2">
                      {[1, 2, 3].map((key) => (
                        <Skeleton key={key} className="h-16 w-full" />
                      ))}
                    </div>
                  </div>
                ) : hasImages ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2 max-h-[65vh] overflow-y-auto pr-1">
                      {user.imageAssets.map((asset) => {
                        const src = asset.url;
                        if (!src) return null;
                        const image = {
                          ...asset,
                          src,
                          downloadUrl: asset.url,
                        };
                        return (
                          <button
                            key={asset._id || asset.key}
                            type="button"
                            className="group relative overflow-hidden rounded-md border border-border/60 bg-muted/10"
                            onClick={() => setSelectedImage(image)}
                          >
                            <img
                              src={src}
                              alt={asset.originalName || 'User image'}
                              className="w-full max-h-32 object-contain transition-transform duration-150 group-hover:scale-105 bg-black/5"
                            />
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-foreground/55">
                      Showing {user.imageAssets.length} image
                      {user.imageAssets.length === 1 ? '' : 's'} for this reader.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-foreground/55">
                    {loading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    <span>No images found for this reader.</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1"
        onClick={toggleOpen}
      >
        <Images className="h-4 w-4" />
        <span className="hidden md:inline">User images</span>
      </Button>

      {popover}

      <ImageViewer
        open={Boolean(selectedImage)}
        image={selectedImage}
        onClose={handleCloseViewer}
      />
    </>
  );
}

export default UserImagesPreview;
