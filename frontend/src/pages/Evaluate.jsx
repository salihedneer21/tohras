import { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { UploadCloud, Trash2, Loader2, Target, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { evalAPI } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import EvaluationSummary from '@/components/evaluation/EvaluationSummary';
import EvaluationImageCard from '@/components/evaluation/EvaluationImageCard';
import { EVALUATION_TIPS } from '@/components/evaluation/constants';
import { cn } from '@/lib/utils';

function Evaluate() {
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const processFile = (file) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const resultString = reader.result;
      const base64 = resultString.split(',')[1];
      setImage({
        name: file.name,
        size: file.size,
        mimeType: file.type,
        preview: resultString,
        base64,
      });
    };
    reader.onerror = () => {
      console.error(reader.error);
      toast.error('Failed to process the selected image');
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processFile(file);
    event.target.value = '';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleRemoveImage = () => {
    setImage(null);
    setResult(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!image) {
      toast.error('Upload an image to evaluate');
      return;
    }

    try {
      setLoading(true);
      setResult(null);

      const payload = {
        image: {
          name: image.name,
          base64: image.base64,
          mimeType: image.mimeType,
        },
      };

      const response = await evalAPI.evaluate(payload);
      setResult(response.data);
      toast.success('Evaluation complete');
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Failed to evaluate images');
    } finally {
      setLoading(false);
    }
  };

  const resetEvaluation = () => {
    setImage(null);
    setResult(null);
  };

  const overall = result?.overallAcceptance;
  const evaluation = result?.images?.[0];

  return (
    <div className="page-wrapper">
      {/* Header */}
      <div className="section-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Quality Control
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
              Dataset Evaluation
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Upload a training photo and instantly verify if it meets fine-tuning standards.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5">
              {image ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {image ? '1 Image' : 'No Image'}
            </Badge>
            <Button variant="outline" onClick={resetEvaluation} disabled={!image && !result}>
              Reset
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Left Column - Upload & Preview */}
        <div className="space-y-6">
          {/* Drag & Drop Upload Area */}
          {!image ? (
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "relative flex min-h-[400px] cursor-pointer flex-col items-center justify-center border-2 border-dashed p-12 transition-all duration-200",
                    isDragging
                      ? "border-foreground bg-secondary/50 scale-[0.98]"
                      : "border-border hover:border-foreground/50 hover:bg-secondary/30"
                  )}
                >
                  <div className="flex flex-col items-center gap-4 text-center">
                    <div className={cn(
                      "rounded-full p-4 transition-all duration-200",
                      isDragging ? "bg-foreground/10 scale-110" : "bg-secondary"
                    )}>
                      <UploadCloud className={cn(
                        "h-10 w-10 transition-colors duration-200",
                        isDragging ? "text-foreground" : "text-foreground/70"
                      )} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">
                        {isDragging ? "Drop image here" : "Upload Training Image"}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Drag and drop your image here, or click to browse
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Supports: JPG, PNG, WEBP</span>
                      <span>•</span>
                      <span>Max 10MB</span>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              </CardContent>
            </Card>
          ) : (
            /* Image Preview Card */
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Selected Image</CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRemoveImage}
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Image Preview */}
                  <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-border">
                    <img
                      src={image.preview}
                      alt={image.name}
                      className="h-full w-full object-cover"
                    />
                  </div>

                  {/* Image Info */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Filename</span>
                      <span className="font-medium text-foreground truncate ml-2">{image.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Size</span>
                      <span className="font-medium text-foreground">{(image.size / 1024).toFixed(2)} KB</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Type</span>
                      <span className="font-medium text-foreground uppercase">{image.mimeType.split('/')[1]}</span>
                    </div>
                  </div>

                  {/* Evaluate Button */}
                  <Button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="w-full gap-2 bg-foreground hover:bg-foreground/90 text-background"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Evaluating...
                      </>
                    ) : (
                      <>
                        <Target className="h-4 w-4" />
                        Run Evaluation
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Tips */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Evaluation Tips</CardTitle>
            <CardDescription className="text-xs">
              Best practices for training images
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {EVALUATION_TIPS.map((tip, index) => (
                <li key={index} className="flex items-start gap-3 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-foreground/70" />
                  <span className="text-muted-foreground leading-relaxed">{tip}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-lg border border-border bg-secondary/50 p-3">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">Note:</strong> Images are processed securely and not stored.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results Section */}
      {result && (
        <div className="space-y-6">
          {overall && <EvaluationSummary overall={overall} />}
          {evaluation && (
            <EvaluationImageCard evaluation={evaluation} summary={overall?.summary} />
          )}
        </div>
      )}
    </div>
  );
}

export default Evaluate;
