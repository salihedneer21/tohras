import { useEffect } from 'react';
import { X, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const defaultMeta = (image) => {
  if (!image) return null;
  const lines = [];
  if (image.dimensions) {
    lines.push(`${image.dimensions.width}×${image.dimensions.height}px`);
  }
  if (image.sizeLabel) {
    lines.push(image.sizeLabel);
  }
  if (image.caption) {
    lines.push(image.caption);
  }
  return lines.length ? lines.join(' · ') : null;
};

export function ImageViewer({
  open,
  image,
  onClose,
  primaryAction,
  secondaryAction,
  footer,
  className,
}) {
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open || !image) return null;

  const src = image.src || image.preview || image.url;
  if (!src) return null;

  const title =
    image.title ||
    image.originalName ||
    image.name ||
    image.key ||
    'Image preview';
  const meta = image.meta || defaultMeta(image);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={cn(
          'relative w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-[#0f1218]/95 shadow-2xl ring-1 ring-white/10',
          className
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-white/5 px-5 py-4">
          <div className="min-w-0 space-y-1">
            <p className="truncate text-sm font-medium text-white">{title}</p>
            {meta ? (
              <p className="truncate text-xs text-white/60">{meta}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {secondaryAction ?? null}
            {primaryAction ?? null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full bg-white/10 text-white hover:bg-white/20"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="flex max-h-[75vh] items-center justify-center bg-gradient-to-b from-white/10 via-transparent to-transparent px-5 py-6">
          <img
            src={src}
            alt={title}
            className="max-h-[70vh] w-full rounded-xl object-contain"
          />
        </div>

        {image.downloadUrl || image.url ? (
          <div className="absolute left-5 top-[4.25rem]">
            <a
              href={image.downloadUrl || image.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white transition hover:bg-white/20"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
          </div>
        ) : null}

        {footer ? (
          <div className="border-t border-white/10 bg-white/5 px-5 py-3 text-xs text-white/60">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default ImageViewer;
