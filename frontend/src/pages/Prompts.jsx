import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Sparkles,
  UploadCloud,
  Loader2,
  Trash2,
  Maximize2,
  ClipboardCopy,
  Check,
} from 'lucide-react';
import { promptAPI } from '@/services/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import ImageViewer from '@/components/ImageViewer';
import { formatFileSize } from '@/utils/file';

const createUploadItem = (file) => ({
  id: `${file.name}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
  file,
  preview: URL.createObjectURL(file),
  status: 'ready',
  prompt: '',
  error: null,
  copied: false,
});

function Prompts() {
  const [uploads, setUploads] = useState([]);
  const [viewerImage, setViewerImage] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [additionalContext, setAdditionalContext] = useState('');

  useEffect(() => {
    return () => {
      uploads.forEach((item) => {
        if (item.preview?.startsWith('blob:')) {
          URL.revokeObjectURL(item.preview);
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalSize = useMemo(
    () => uploads.reduce((sum, item) => sum + (item.file?.size || 0), 0),
    [uploads]
  );

  const handleFileInput = (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const mapped = files.map(createUploadItem);
    setUploads((prev) => [...prev, ...mapped]);
    event.target.value = '';
  };

  const removeUpload = (id) => {
    setUploads((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.preview?.startsWith('blob:')) {
        URL.revokeObjectURL(target.preview);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const clearAll = () => {
    uploads.forEach((item) => {
      if (item.preview?.startsWith('blob:')) {
        URL.revokeObjectURL(item.preview);
      }
    });
    setUploads([]);
    setAdditionalContext('');
    setViewerImage(null);
  };

  const copyToClipboard = async (id) => {
    const target = uploads.find((item) => item.id === id);
    if (!target || !target.prompt) return;
    try {
      await navigator.clipboard.writeText(target.prompt);
      setUploads((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, copied: true } : item
        )
      );
      setTimeout(() => {
        setUploads((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, copied: false } : item
          )
        );
      }, 2000);
    } catch (error) {
      toast.error('Unable to copy to clipboard');
    }
  };

  const generatePrompts = async () => {
    if (!uploads.length) {
      toast.error('Upload one or more images first');
      return;
    }

    const pending = uploads.filter((item) => item.status !== 'complete');
    if (!pending.length) {
      toast('All prompts already generated');
      return;
    }

    const formData = new FormData();
    uploads.forEach((item) => {
      formData.append('images', item.file);
    });
    if (additionalContext.trim()) {
      formData.append('additionalContext', additionalContext.trim());
    }

    setIsGenerating(true);
    setUploads((prev) =>
      prev.map((item) => ({
        ...item,
        status: item.status === 'complete' ? 'complete' : 'processing',
        error: null,
      }))
    );

    try {
      const response = await promptAPI.generate(formData);
      const results = Array.isArray(response?.data) ? response.data : response?.data ?? [];

      setUploads((prev) =>
        prev.map((item, idx) => {
          const result = results.find((entry) => entry.position === idx);
          if (!result) {
            return {
              ...item,
              status: 'error',
              error: 'No prompt returned for this image',
            };
          }
          return {
            ...item,
            status: 'complete',
            prompt: result.prompt,
            error: null,
            copied: false,
          };
        })
      );
      toast.success('Prompts generated');
    } catch (error) {
      console.error('Prompt generation failed:', error);
      toast.error(error.message || 'Failed to generate prompts');
      setUploads((prev) =>
        prev.map((item) =>
          item.status === 'processing'
            ? { ...item, status: 'error', error: error.message || 'Failed to generate prompt' }
            : item
        )
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleViewerClose = useCallback(() => {
    setViewerImage(null);
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Prompt Studio
          </h2>
          <p className="mt-1 text-sm text-foreground/60">
            Upload character references and craft regeneration-ready prompts optimised for fine-tuning.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="hidden sm:inline-flex bg-foreground/10 text-foreground/70">
            {uploads.length} uploads
          </Badge>
          <Badge className="hidden sm:inline-flex bg-foreground/10 text-foreground/70">
            {formatFileSize(totalSize)} total
          </Badge>
          <Button type="button" variant="outline" onClick={clearAll} disabled={!uploads.length}>
            Reset
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload character references</CardTitle>
          <CardDescription>
            Keep the framing consistent. The LLM extracts pose, expression, and composition cues without inventing traits like hair or skin colour.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <Label>Additional context</Label>
              <Textarea
                minRows={3}
                placeholder="Optional: add production notes such as lighting preferences or framing instructions."
                value={additionalContext}
                onChange={(event) => setAdditionalContext(event.target.value)}
              />
              <p className="text-xs text-foreground/45">
                This context is appended to the request so every prompt shares consistent guidelines.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 sm:items-end">
              <Button
                type="button"
                className="gap-2"
                onClick={() => document.getElementById('prompt-studio-input')?.click()}
              >
                <UploadCloud className="h-4 w-4" />
                Add images
              </Button>
              <input
                id="prompt-studio-input"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileInput}
              />
              <Button
                type="button"
                className="gap-2"
                onClick={generatePrompts}
                disabled={!uploads.length || isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate prompts
                  </>
                )}
              </Button>
            </div>
          </div>

          {uploads.length ? (
            <div className="overflow-hidden rounded-xl border border-border/60">
              <ul>
                {uploads.map((item, index) => (
                  <li
                    key={item.id}
                    className="space-y-4 border-b border-border/60 px-4 py-6 last:border-b-0 sm:flex sm:items-start sm:gap-6 sm:space-y-0"
                  >
                    <button
                      type="button"
                      className="group relative h-48 w-full overflow-hidden rounded-xl border border-border/40 bg-card sm:h-32 sm:w-40"
                      onClick={() =>
                        setViewerImage({
                          src: item.preview,
                          title: item.file.name,
                          sizeLabel: formatFileSize(item.file.size),
                          downloadUrl: item.preview,
                        })
                      }
                    >
                      <img
                        src={item.preview}
                        alt={item.file.name}
                        className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                      />
                      <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white/80">
                        #{index + 1}
                      </span>
                      <Maximize2 className="absolute right-2 top-2 h-4 w-4 text-white/85 opacity-0 transition group-hover:opacity-100" />
                    </button>

                    <div className="flex-1 space-y-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.file.name}</p>
                          <p className="text-xs text-foreground/45">{formatFileSize(item.file.size)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant={
                              item.status === 'complete'
                                ? 'success'
                                : item.status === 'error'
                                ? 'destructive'
                                : item.status === 'processing'
                                ? 'secondary'
                                : 'outline'
                            }
                          >
                            {item.status}
                          </Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-300 hover:text-red-200"
                            onClick={() => removeUpload(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {item.error ? (
                        <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                          {item.error}
                        </p>
                      ) : null}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-foreground/85">
                            Prompt
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-xs"
                            disabled={!item.prompt}
                            onClick={() => copyToClipboard(item.id)}
                          >
                            {item.copied ? (
                              <>
                                <Check className="h-4 w-4" /> Copied
                              </>
                            ) : (
                              <>
                                <ClipboardCopy className="h-4 w-4" /> Copy
                              </>
                            )}
                          </Button>
                        </div>
                        <Textarea
                          value={item.prompt || ''}
                          readOnly
                          placeholder="Prompt will appear here after generation."
                          className="min-h-[160px] resize-y text-sm"
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-foreground/55">
              No images uploaded yet. Add reference portraits to generate prompts tailored for fine-tuning.
            </p>
          )}
        </CardContent>
      </Card>

      <ImageViewer open={Boolean(viewerImage)} image={viewerImage} onClose={handleViewerClose} />
    </div>
  );
}

export default Prompts;
