import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (open) {
      // Small delay to trigger animation
      requestAnimationFrame(() => {
        setIsVisible(true);
      });

      const handleKeyDown = (event) => {
        if (event.key === 'Escape') {
          onClose?.();
        }
      };

      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'unset';
      };
    } else {
      setIsVisible(false);
    }
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

  const modalContent = (
    <div
      className={cn(
        "fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-opacity duration-150 backdrop-blur-md",
        "bg-black/85 dark:bg-black/95",
        isVisible ? "opacity-100" : "opacity-0"
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          'relative w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden rounded-xl shadow-2xl transition-all duration-150',
          isVisible ? "scale-100 opacity-100" : "scale-95 opacity-0",
          className
        )}
        style={{
          backgroundColor: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 shrink-0"
          style={{
            backgroundColor: 'hsl(var(--card))',
            borderBottom: '1px solid hsl(var(--border))',
          }}
        >
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-foreground sm:text-base">{title}</h3>
            {meta ? (
              <p className="truncate text-xs text-muted-foreground mt-0.5">{meta}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {image.downloadUrl || image.url ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 text-xs sm:h-9 sm:text-sm"
                asChild
              >
                <a
                  href={image.downloadUrl || image.url}
                  download={title}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Download</span>
                </a>
              </Button>
            ) : null}
            {secondaryAction ?? null}
            {primaryAction ?? null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 sm:h-9 sm:w-9 text-muted-foreground hover:text-foreground hover:bg-secondary"
              onClick={onClose}
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </div>
        </div>

        {/* Image Container */}
        <div
          className="flex-1 flex items-center justify-center p-4 sm:p-6 overflow-auto"
          style={{
            backgroundColor: 'hsl(var(--secondary) / 0.1)',
          }}
        >
          <img
            src={src}
            alt={title}
            className="max-h-full max-w-full object-contain rounded-lg"
            loading="eager"
          />
        </div>

        {/* Footer */}
        {footer ? (
          <div
            className="px-4 py-3 sm:px-6 sm:py-4 shrink-0"
            style={{
              backgroundColor: 'hsl(var(--card))',
              borderTop: '1px solid hsl(var(--border))',
            }}
          >
            <div className="text-xs sm:text-sm text-muted-foreground">
              {footer}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default ImageViewer;
