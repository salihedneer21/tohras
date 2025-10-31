import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  UploadCloud,
  Trash2,
  Loader2,
  Target,
  X,
  CheckCircle2,
  ClipboardCopy,
  Check,
  Tag,
  ArrowLeft,
  ArrowRight,
  Shield,
  Sparkles,
} from 'lucide-react';
import { evalAPI } from '@/services/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import EvaluationSummary from '@/components/evaluation/EvaluationSummary';
import EvaluationImageCard from '@/components/evaluation/EvaluationImageCard';
import { EVALUATION_TIPS, VERDICT_BADGES } from '@/components/evaluation/constants';
import { cn } from '@/lib/utils';
import ImageViewer from '@/components/ImageViewer';
import { Skeleton } from '@/components/ui/skeleton';
import { formatFileSize } from '@/utils/file';

const HISTORY_PAGE_SIZE_OPTIONS = [10, 20, 50];
const VERDICT_FILTER_OPTIONS = [
  { value: 'all', label: 'All verdicts' },
  { value: 'accept', label: 'Accepted' },
  { value: 'needs_more', label: 'Needs more' },
  { value: 'reject', label: 'Rejected' },
];

const DECISION_FILTER_OPTIONS = [
  { value: 'all', label: 'All decisions' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Dismissed' },
];

const SORT_OPTIONS = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'fileName:asc', label: 'File name A–Z' },
  { value: 'fileName:desc', label: 'File name Z–A' },
  { value: 'score:desc', label: 'Highest score' },
  { value: 'score:asc', label: 'Lowest score' },
];

const DECISION_BADGES = {
  pending: { label: 'Pending', variant: 'secondary' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Dismissed', variant: 'destructive' },
};

const DEFAULT_VERDICT = { label: 'Unknown', variant: 'secondary' };

const formatTimestamp = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
};

const mapToEvaluationCard = (record) => ({
  verdict: record.verdict,
  acceptable: record.acceptable,
  overallScorePercent: record.score,
  confidencePercent: record.confidence,
  criteria: record.criteria || {},
  recommendations: record.recommendations || [],
});

function Evaluate() {
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [initialHistoryLoad, setInitialHistoryLoad] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE_SIZE_OPTIONS[0]);
  const [historyPagination, setHistoryPagination] = useState({
    page: 1,
    totalPages: 0,
    total: 0,
    limit: HISTORY_PAGE_SIZE_OPTIONS[0],
    hasNextPage: false,
    hasPrevPage: false,
  });
  const [historyStats, setHistoryStats] = useState({
    total: 0,
    totalApproved: 0,
    totalPending: 0,
    totalRejectedDecision: 0,
    totalVerdictAccept: 0,
    totalVerdictNeedsMore: 0,
    totalVerdictReject: 0,
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('all');
  const [decisionFilter, setDecisionFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState([]);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');

  const [tagEditor, setTagEditor] = useState({ id: null, value: '', saving: false });
  const [isDeletingId, setIsDeletingId] = useState(null);
  const [decisionUpdatingId, setDecisionUpdatingId] = useState(null);
  const [copiedSummaryId, setCopiedSummaryId] = useState(null);
  const historyCopyTimerRef = useRef(null);
  const [viewerImage, setViewerImage] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    return () => {
      if (historyCopyTimerRef.current) {
        clearTimeout(historyCopyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const tagFilterKey = useMemo(() => {
    if (!Array.isArray(tagFilter) || tagFilter.length === 0) return '';
    return [...tagFilter].sort().join('|');
  }, [tagFilter]);

  useEffect(() => {
    setHistoryPage(1);
  }, [debouncedSearch, verdictFilter, decisionFilter, tagFilterKey, historyLimit, sortBy, sortOrder]);

  const fetchEvaluationHistory = useCallback(
    async ({ withSpinner = true, page: pageOverride, limit: limitOverride } = {}) => {
      const pageToUse = pageOverride ?? historyPage;
      const limitToUse = limitOverride ?? historyLimit;

      try {
        if (withSpinner) {
          setHistoryLoading(true);
        }

        const params = {
          page: pageToUse,
          limit: limitToUse,
        };

        if (debouncedSearch) {
          params.search = debouncedSearch;
        }
        if (verdictFilter !== 'all') {
          params.verdict = verdictFilter;
        }
        if (decisionFilter !== 'all') {
          params.decision = decisionFilter;
        }
        if (tagFilter.length > 0) {
          params.tags = tagFilter.join(',');
        }
        if (sortBy) {
          params.sortBy = sortBy;
        }
        if (sortOrder) {
          params.sortOrder = sortOrder;
        }

        const response = await evalAPI.list(params);
        const items = Array.isArray(response?.data) ? response.data : [];
        setHistoryItems(items);

        const responsePagination = response?.pagination || {};
        const nextPage = responsePagination.page ?? pageToUse;
        const nextLimit = responsePagination.limit ?? limitToUse;
        const nextTotal = responsePagination.total ?? items.length;
        const nextTotalPages = responsePagination.totalPages ?? (nextLimit > 0 ? Math.ceil(nextTotal / nextLimit) : 0);

        setHistoryPagination({
          page: nextTotalPages === 0 ? 1 : nextPage,
          totalPages: nextTotalPages,
          total: nextTotal,
          limit: nextLimit,
          hasNextPage: responsePagination.hasNextPage ?? nextPage < nextTotalPages,
          hasPrevPage: responsePagination.hasPrevPage ?? nextPage > 1,
        });

        if (historyPage !== nextPage) {
          setHistoryPage(nextPage);
        }
        if (historyLimit !== nextLimit) {
          setHistoryLimit(nextLimit);
        }

        const stats = response?.stats || {};
        setHistoryStats({
          total: stats.total || 0,
          totalApproved: stats.totalApproved || 0,
          totalPending: stats.totalPending || 0,
          totalRejectedDecision: stats.totalRejectedDecision || 0,
          totalVerdictAccept: stats.totalVerdictAccept || 0,
          totalVerdictNeedsMore: stats.totalVerdictNeedsMore || 0,
          totalVerdictReject: stats.totalVerdictReject || 0,
        });

        if (initialHistoryLoad) {
          setInitialHistoryLoad(false);
        }
      } catch (error) {
        toast.error(error.message || 'Failed to load evaluation history');
      } finally {
        setHistoryLoading(false);
      }
    },
    [
      historyPage,
      historyLimit,
      debouncedSearch,
      verdictFilter,
      decisionFilter,
      tagFilter,
      sortBy,
      sortOrder,
      initialHistoryLoad,
    ]
  );

  useEffect(() => {
    fetchEvaluationHistory();
  }, [fetchEvaluationHistory]);

  const processFile = useCallback((file) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const resultString = reader.result;
      const base64 = resultString.split(',')[1];

      const img = new Image();
      img.onload = () => {
        const width = img.width;
        const height = img.height;

        if (width < 1024 || height < 1024) {
          toast.error(`Image too small for preprocessing. Minimum size: 1024x1024. Current: ${width}x${height}`, {
            duration: 5000,
          });
          return;
        }

        setImage({
          name: file.name,
          size: file.size,
          mimeType: file.type,
          preview: resultString,
          base64,
          width,
          height,
        });
        setResult(null);
      };
      img.src = resultString;
    };
    reader.onerror = () => {
      console.error(reader.error);
      toast.error('Failed to process the selected image');
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    processFile(file);
    event.target.value = '';
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
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
          width: image.width,
          height: image.height,
          size: image.size,
        },
      };

      const response = await evalAPI.evaluate(payload);
      const evaluationPayload = response?.data?.evaluation;
      if (evaluationPayload) {
        setResult(evaluationPayload);
      }
      toast.success('Evaluation complete');
      await fetchEvaluationHistory({ withSpinner: false, page: 1 });
      setHistoryPage(1);
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'Failed to evaluate image');
    } finally {
      setLoading(false);
    }
  };

  const resetEvaluation = () => {
    setImage(null);
    setResult(null);
  };

  const availableTags = useMemo(() => {
    const values = new Set();
    historyItems.forEach((item) => {
      if (Array.isArray(item.tags)) {
        item.tags.forEach((tag) => {
          if (tag) values.add(tag);
        });
      }
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [historyItems]);

  const hasHistory = historyItems.length > 0;
  const totalRangeStart = historyPagination.total === 0 ? 0 : (historyPagination.page - 1) * historyPagination.limit + 1;
  const totalRangeEnd = historyPagination.total === 0
    ? 0
    : Math.min(historyPagination.page * historyPagination.limit, historyPagination.total);

  const totalEvaluations = historyStats.total || 0;
  const totalApproved = historyStats.totalApproved || 0;
  const totalPending = historyStats.totalPending || 0;

  const verdictMeta = (verdict) => VERDICT_BADGES[verdict] || DEFAULT_VERDICT;
  const decisionMeta = (decision) => DECISION_BADGES[decision] || DECISION_BADGES.pending;

  const handleHistoryPageSizeChange = (value) => {
    const numericValue = Number.parseInt(value, 10);
    const fallback = HISTORY_PAGE_SIZE_OPTIONS[0];
    setHistoryLimit(Number.isNaN(numericValue) ? fallback : numericValue);
  };

  const goToPrevHistoryPage = () => {
    if (!historyPagination.hasPrevPage || historyLoading) return;
    setHistoryPage((prev) => Math.max(prev - 1, 1));
  };

  const goToNextHistoryPage = () => {
    if (!historyPagination.hasNextPage || historyLoading) return;
    setHistoryPage((prev) => prev + 1);
  };

  const handleTagFilterToggle = (tag) => {
    setTagFilter((prev) => (prev.includes(tag) ? prev.filter((entry) => entry !== tag) : [...prev, tag]));
  };

  const clearTagFilters = () => {
    setTagFilter([]);
  };

  const startTagEdit = (item) => {
    setTagEditor({
      id: item.id,
      value: Array.isArray(item.tags) && item.tags.length > 0 ? item.tags.join(', ') : '',
      saving: false,
    });
  };

  const cancelTagEdit = () => {
    setTagEditor({ id: null, value: '', saving: false });
  };

  const handleTagInputChange = (event) => {
    setTagEditor((prev) => ({
      ...prev,
      value: event?.target?.value ?? '',
    }));
  };

  const saveTags = async () => {
    if (!tagEditor.id) return;
    const raw = tagEditor.value
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag, index, arr) => tag && arr.indexOf(tag) === index)
      .slice(0, 12);

    setTagEditor((prev) => ({ ...prev, saving: true }));
    try {
      await evalAPI.updateTags(tagEditor.id, raw);
      setHistoryItems((prev) =>
        prev.map((entry) =>
          entry.id === tagEditor.id
            ? {
                ...entry,
                tags: raw,
              }
            : entry
        )
      );
      await fetchEvaluationHistory({ withSpinner: false });
      cancelTagEdit();
      toast.success('Tags updated');
    } catch (error) {
      toast.error(error.message || 'Unable to update tags');
      setTagEditor((prev) => ({ ...prev, saving: false }));
    }
  };

  const handleDecisionChange = async (item, decision) => {
    if (!item?.id || item.decision === decision) return;
    setDecisionUpdatingId(item.id);
    try {
      await evalAPI.updateDecision(item.id, decision);
      setHistoryItems((prev) =>
        prev.map((entry) => (entry.id === item.id ? { ...entry, decision } : entry))
      );
      await fetchEvaluationHistory({ withSpinner: false });
      toast.success('Decision updated');
    } catch (error) {
      toast.error(error.message || 'Unable to update decision');
    } finally {
      setDecisionUpdatingId(null);
    }
  };

  const handleDeleteEvaluation = async (item) => {
    if (!item?.id) return;
    const confirmed = window.confirm('Delete this evaluation record? This action cannot be undone.');
    if (!confirmed) return;
    setIsDeletingId(item.id);
    try {
      await evalAPI.delete(item.id);
      setHistoryItems((prev) => prev.filter((entry) => entry.id !== item.id));
      if (tagEditor.id === item.id) {
        cancelTagEdit();
      }
      await fetchEvaluationHistory({ withSpinner: false });
      toast.success('Evaluation deleted');
    } catch (error) {
      toast.error(error.message || 'Unable to delete evaluation');
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleCopySummary = async (item) => {
    const text = item.summary || 'No summary available.';
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSummaryId(item.id);
      if (historyCopyTimerRef.current) {
        clearTimeout(historyCopyTimerRef.current);
      }
      historyCopyTimerRef.current = setTimeout(() => {
        setCopiedSummaryId(null);
        historyCopyTimerRef.current = null;
      }, 2000);
    } catch (error) {
      toast.error('Unable to copy summary');
    }
  };

  const handleViewerClose = () => {
    setViewerImage(null);
  };

  const overall = result?.overallAcceptance;
  const evaluationDetail = result?.images?.[0];

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <Shield className="h-3.5 w-3.5" />
            Dataset Evaluator
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Audit and curate training candidates with confidence
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
              Run every upload through the evaluator, flag issues instantly, and maintain a reviewable history with tags, decisions, and filters.
            </p>
          </div>
        </div>
        <div className="grid w-full gap-3 sm:grid-cols-3 lg:max-w-xl">
          <div className="rounded-lg border border-border/70 bg-background p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stored evaluations</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{totalEvaluations}</p>
            <p className="text-xs text-muted-foreground">Recorded in the library</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Approved</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{totalApproved}</p>
            <p className="text-xs text-muted-foreground">Ready for training sets</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Needs attention</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{totalPending}</p>
            <p className="text-xs text-muted-foreground">Awaiting curator decision</p>
          </div>
        </div>
      </section>

      <Card className="shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg font-semibold">Evaluate a reference image</CardTitle>
          <CardDescription>
            Drop in a candidate photo to run automated checks and store the verdict for future audit trails.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {!image ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'relative flex min-h-[320px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200',
                  isDragging
                    ? 'border-foreground bg-secondary/50'
                    : 'border-border hover:border-foreground/50 hover:bg-muted/30'
                )}
              >
                <div
                  className={cn(
                    'rounded-full p-4 transition-transform duration-200',
                    isDragging ? 'scale-110 bg-foreground/10' : 'bg-secondary'
                  )}
                >
                  <UploadCloud
                    className={cn(
                      'h-12 w-12 transition-colors duration-200',
                      isDragging ? 'text-foreground' : 'text-foreground/70'
                    )}
                  />
                </div>
                <div className="mt-6 space-y-2 text-center">
                  <h3 className="text-lg font-semibold text-foreground">
                    {isDragging ? 'Drop image here' : 'Upload training image'}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Drag & drop or click to browse. Minimum size 1024×1024 PNG/JPG/WebP.
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="grid gap-4 rounded-xl border border-border/70 bg-muted/20 p-4 sm:grid-cols-[220px_1fr]">
                <div className="relative aspect-square overflow-hidden rounded-lg border border-border">
                  <img src={image.preview} alt={image.name} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow hover:text-destructive"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleRemoveImage();
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="bg-background px-2 py-1">
                        {image.name}
                      </Badge>
                      <span>{formatFileSize(image.size)}</span>
                      <span>•</span>
                      <span>
                        {image.width}×{image.height}px
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Review the details then run the evaluator. You can upload a different shot at any time.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                      <UploadCloud className="h-4 w-4" />
                      Replace image
                    </Button>
                    <Button type="submit" disabled={loading} className="gap-2">
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Evaluating…
                        </>
                      ) : (
                        <>
                          <Target className="h-4 w-4" />
                          Run evaluation
                        </>
                      )}
                    </Button>
                    <Button type="button" variant="ghost" className="gap-2 text-muted-foreground hover:text-destructive" onClick={resetEvaluation}>
                      <Trash2 className="h-4 w-4" />
                      Reset
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </form>

          {result ? (
            <div className="space-y-4">
              <EvaluationSummary overall={overall} />
              <EvaluationImageCard evaluation={evaluationDetail} summary={overall?.summary} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border border-muted/60 bg-muted/20">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Quick capture checklist</CardTitle>
          <CardDescription>
            Follow these tips before retaking headshots so the evaluator approves them on the first pass.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            {EVALUATION_TIPS.map((tip) => (
              <li key={tip} className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-4 w-4 text-foreground/60" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg font-semibold">Evaluation history</CardTitle>
              <CardDescription>
                Filter by verdict, apply curator decisions, and keep a tagged backlog of every reviewed image.
              </CardDescription>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <Input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search file names or summaries…"
                className="w-full sm:w-64"
              />
              <div className="flex items-center gap-2">
                <Select
                  value={`${sortBy}:${sortOrder}`}
                  onValueChange={(value) => {
                    const [nextSortBy, nextSortOrder] = value.split(':');
                    setSortBy(nextSortBy || 'createdAt');
                    setSortOrder(nextSortOrder || 'desc');
                  }}
                >
                  <SelectTrigger className="w-[170px]">
                    <SelectValue placeholder="Sort evaluations" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(historyLimit)} onValueChange={handleHistoryPageSizeChange}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Items per page" />
                  </SelectTrigger>
                  <SelectContent>
                    {HISTORY_PAGE_SIZE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option} / page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              Verdicts
            </span>
            {VERDICT_FILTER_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant="outline"
                className={cn(
                  'h-8 rounded-full border border-border/60 px-3 text-xs font-medium transition-colors',
                  verdictFilter === option.value
                    ? 'bg-foreground text-background hover:bg-foreground/90'
                    : 'bg-background text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setVerdictFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <Tag className="h-3.5 w-3.5" />
              Decisions
            </span>
            {DECISION_FILTER_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant="outline"
                className={cn(
                  'h-8 rounded-full border border-border/60 px-3 text-xs font-medium transition-colors',
                  decisionFilter === option.value
                    ? 'bg-foreground text-background hover:bg-foreground/90'
                    : 'bg-background text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setDecisionFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
            {availableTags.length > 0 ? (
              <>
                <span className="mx-1 inline-flex items-center gap-2 text-xs text-muted-foreground">
                  Tags:
                </span>
                {availableTags.map((tag) => {
                  const active = tagFilter.includes(tag);
                  return (
                    <Button
                      key={tag}
                      type="button"
                      variant="outline"
                      className={cn(
                        'h-8 rounded-full border px-3 text-xs font-medium transition-colors',
                        active
                          ? 'border-foreground bg-foreground text-background hover:bg-foreground/90'
                          : 'border-border/60 bg-background text-muted-foreground hover:text-foreground'
                      )}
                      onClick={() => handleTagFilterToggle(tag)}
                    >
                      {tag}
                    </Button>
                  );
                })}
                {tagFilter.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground"
                    onClick={clearTagFilters}
                  >
                    Clear tags
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="px-0">
          <div className="px-4 sm:px-6">
            {initialHistoryLoad ? (
              <div className="space-y-4 py-8">
                {[0, 1, 2].map((index) => (
                  <Card key={index} className="border border-border/60">
                    <CardContent className="grid gap-4 p-4 sm:grid-cols-[auto_1fr]">
                      <Skeleton className="h-20 w-20 rounded-md" />
                      <div className="space-y-3">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-3 w-full" />
                        <div className="flex gap-2">
                          <Skeleton className="h-6 w-16" />
                          <Skeleton className="h-6 w-24" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : historyLoading && !hasHistory ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading evaluation history...
              </div>
            ) : !hasHistory ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
                <div className="rounded-full bg-muted p-4">
                  <UploadCloud className="h-8 w-8" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">No evaluations to display</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Adjust your filters or run a new evaluation to see results here.
                  </p>
                </div>
              </div>
            ) : (
              <div className="relative space-y-4">
                {historyLoading && hasHistory ? (
                  <div className="absolute inset-x-0 -top-6 z-10 flex items-center justify-center py-2 text-xs text-muted-foreground">
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Updating…
                  </div>
                ) : null}

                {historyItems.map((item) => {
                  const verdictBadge = verdictMeta(item.verdict);
                  const decisionBadge = decisionMeta(item.decision);
                  const evaluationCardData = mapToEvaluationCard(item);
                  const isExpanded = expandedId === item.id;

                  return (
                    <Card key={item.id} className="border border-border/60">
                      <CardContent className="grid gap-4 p-4 sm:grid-cols-[auto_1fr]">
                        <button
                          type="button"
                          className="group relative h-20 w-20 overflow-hidden rounded-md border border-border bg-muted disabled:cursor-not-allowed"
                          onClick={() =>
                            setViewerImage({
                              src: item.s3Url,
                              title: item.fileName,
                              downloadUrl: item.s3Url,
                              sizeLabel: formatFileSize(item.size),
                            })
                          }
                          disabled={!item.s3Url}
                        >
                          {item.s3Url ? (
                            <img
                              src={item.s3Url}
                              alt={item.fileName}
                              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-muted">
                              <UploadCloud className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                          <span className="absolute inset-0 bg-black/0 transition-colors duration-200 group-hover:bg-black/15" />
                        </button>

                        <div className="space-y-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">{item.fileName}</span>
                                <span>•</span>
                                <span>{formatFileSize(item.size)}</span>
                                <span>•</span>
                                <span>{formatTimestamp(item.createdAt)}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={verdictBadge.variant}>{verdictBadge.label}</Badge>
                                <Badge variant={decisionBadge.variant}>{decisionBadge.label}</Badge>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => handleCopySummary(item)}
                              >
                                {copiedSummaryId === item.id ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                                Copy summary
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                              >
                                {isExpanded ? 'Hide details' : 'View details'}
                              </Button>
                            </div>
                          </div>

                          {item.summary ? (
                            <p className="text-sm text-muted-foreground">{item.summary}</p>
                          ) : null}

                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground/70">
                              Decision
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className={cn(
                                'h-7 gap-1.5 text-xs',
                                item.decision === 'approved' ? 'border-foreground text-foreground' : 'text-muted-foreground hover:text-foreground'
                              )}
                              disabled={decisionUpdatingId === item.id}
                              onClick={() => handleDecisionChange(item, 'approved')}
                            >
                              {decisionUpdatingId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className={cn(
                                'h-7 gap-1.5 text-xs',
                                item.decision === 'pending' ? 'border-foreground text-foreground' : 'text-muted-foreground hover:text-foreground'
                              )}
                              disabled={decisionUpdatingId === item.id}
                              onClick={() => handleDecisionChange(item, 'pending')}
                            >
                              Reset
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className={cn(
                                'h-7 gap-1.5 text-xs',
                                item.decision === 'rejected' ? 'border-destructive text-destructive' : 'text-muted-foreground hover:text-destructive'
                              )}
                              disabled={decisionUpdatingId === item.id}
                              onClick={() => handleDecisionChange(item, 'rejected')}
                            >
                              <X className="h-3 w-3" />
                              Dismiss
                            </Button>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {Array.isArray(item.tags) && item.tags.length > 0 ? (
                              item.tags.map((tag) => (
                                <Badge key={`${item.id}-${tag}`} variant="outline" className="bg-background px-2 py-0.5 text-[11px]">
                                  {tag}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground/70">No tags</span>
                            )}
                          </div>

                          {tagEditor.id === item.id ? (
                            <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/30 p-3">
                              <Input
                                value={tagEditor.value}
                                onChange={handleTagInputChange}
                                placeholder="Comma separated tags (e.g. hero, profile)"
                                className="h-9 text-sm"
                              />
                              <div className="flex items-center gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="gap-1.5"
                                  onClick={saveTags}
                                  disabled={tagEditor.saving}
                                >
                                  {tagEditor.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                  Save
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={cancelTagEdit}
                                  disabled={tagEditor.saving}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => startTagEdit(item)}
                              >
                                <Tag className="h-3.5 w-3.5" />
                                Edit tags
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
                                onClick={() => handleDeleteEvaluation(item)}
                                disabled={isDeletingId === item.id}
                              >
                                {isDeletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                Delete
                              </Button>
                            </div>
                          )}

                          {isExpanded ? (
                            <EvaluationImageCard
                              evaluation={evaluationCardData}
                              summary={item.summary}
                            />
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {historyPagination.total === 0
              ? 'No evaluations stored yet'
              : `Showing ${totalRangeStart}-${totalRangeEnd} of ${historyPagination.total} evaluations`}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={goToPrevHistoryPage}
              disabled={!historyPagination.hasPrevPage || historyLoading}
            >
              <ArrowLeft className="h-4 w-4" />
              Prev
            </Button>
            <div className="text-sm font-medium text-foreground">
              Page {historyPagination.totalPages === 0 ? 1 : historyPagination.page} of{' '}
              {historyPagination.totalPages === 0 ? 1 : historyPagination.totalPages}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={goToNextHistoryPage}
              disabled={!historyPagination.hasNextPage || historyLoading}
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardFooter>
      </Card>

      <ImageViewer open={Boolean(viewerImage)} image={viewerImage} onClose={handleViewerClose} />
    </div>
  );
}

export default Evaluate;
