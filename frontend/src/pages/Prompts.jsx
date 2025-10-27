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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Prompt Studio
          </h1>
          <p className="mt-1 text-sm text-foreground/60">
            Upload character references and craft regeneration-ready prompts optimised for fine-tuning.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-foreground/5 text-foreground/70">
            {uploads.length} {uploads.length === 1 ? 'Image' : 'Images'}
          </Badge>
          <Badge variant="outline" className="bg-foreground/5 text-foreground/70">
            {formatFileSize(totalSize)}
          </Badge>
          <Button variant="outline" onClick={clearAll} disabled={!uploads.length}>
            Reset
          </Button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        {/* Left Column - Upload & Images */}
        <div className="space-y-6">
          {/* Configuration Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configuration</CardTitle>
              <CardDescription>
                Add optional context to guide prompt generation for consistency.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Additional Context (Optional)</Label>
                <Textarea
                  rows={3}
                  placeholder="e.g., 'soft studio lighting, professional headshot, neutral background'"
                  value={additionalContext}
                  onChange={(event) => setAdditionalContext(event.target.value)}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Applied to all prompts for consistency.
                </p>
              </div>

              <div className="flex flex-col gap-2.5 sm:flex-row">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => document.getElementById('prompt-studio-input')?.click()}
                >
                  <UploadCloud className="h-4 w-4" />
                  Add Images
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
                  className="gap-2 bg-foreground hover:bg-foreground/90 text-background"
                  onClick={generatePrompts}
                  disabled={!uploads.length || isGenerating}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate Prompts
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Images Grid */}
          {uploads.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2">
              {uploads.map((item, index) => (
                <Card key={item.id} className="overflow-hidden">
                  <CardContent className="p-0">
                    {/* Image Preview */}
                    <div className="relative">
                      <button
                        type="button"
                        className="group relative w-full aspect-square overflow-hidden bg-secondary"
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
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200" />
                        <span className="absolute left-3 top-3 rounded-md bg-black/70 px-2 py-1 text-xs font-semibold text-white">
                          #{index + 1}
                        </span>
                        <Maximize2 className="absolute right-3 top-3 h-5 w-5 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                      </button>
                    </div>

                    {/* Image Info & Controls */}
                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.file.name}</p>
                          <p className="text-xs text-muted-foreground">{formatFileSize(item.file.size)}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
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
                            className="capitalize"
                          >
                            {item.status}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeUpload(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Error Message */}
                      {item.error && (
                        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2">
                          <p className="text-xs text-destructive">{item.error}</p>
                        </div>
                      )}

                      {/* Prompt Section */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">Generated Prompt</Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 h-8"
                            disabled={!item.prompt}
                            onClick={() => copyToClipboard(item.id)}
                          >
                            {item.copied ? (
                              <>
                                <Check className="h-3.5 w-3.5" />
                                Copied
                              </>
                            ) : (
                              <>
                                <ClipboardCopy className="h-3.5 w-3.5" />
                                Copy
                              </>
                            )}
                          </Button>
                        </div>
                        <Textarea
                          value={item.prompt || ''}
                          readOnly
                          placeholder="Generated prompt will appear here..."
                          className="min-h-[100px] resize-y text-sm"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="rounded-full bg-muted p-4">
                    <UploadCloud className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">No Images Yet</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Upload character reference images to generate optimized prompts.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="gap-2 mt-2"
                    onClick={() => document.getElementById('prompt-studio-input')?.click()}
                  >
                    <UploadCloud className="h-4 w-4" />
                    Upload Images
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Best Practices */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Best Practices</CardTitle>
            <CardDescription>
              Tips for optimal prompt generation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-3">
              <li className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-foreground" />
                <span className="text-muted-foreground">
                  Keep framing and composition consistent across images
                </span>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-foreground" />
                <span className="text-muted-foreground">
                  Use clear, well-lit reference photos
                </span>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-foreground" />
                <span className="text-muted-foreground">
                  AI extracts pose and expression without inventing traits
                </span>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-foreground" />
                <span className="text-muted-foreground">
                  Add context to guide lighting and framing preferences
                </span>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-foreground" />
                <span className="text-muted-foreground">
                  Upload multiple angles for comprehensive training data
                </span>
              </li>
            </ul>
            <div className="rounded-lg border border-border bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">
                <strong className="font-medium text-foreground">Note:</strong> Generated prompts are optimized for consistency across your fine-tuning dataset.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <ImageViewer open={Boolean(viewerImage)} image={viewerImage} onClose={handleViewerClose} />
    </div>
  );
}

export default Prompts;
