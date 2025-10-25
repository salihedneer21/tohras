import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  BookOpen,
  Download,
  Image as ImageIcon,
  ImageOff,
  Upload,
  Sparkles,
  PlugZap,
  Clock,
  AlertTriangle,
  Loader2,
  Eye,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { bookAPI, trainingAPI, userAPI } from '@/services/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
const JOB_HISTORY_LIMIT = 10;

const JOB_STATUS_META = {
  queued: { label: 'Queued', variant: 'outline' },
  generating: { label: 'Generating', variant: 'default' },
  assembling: { label: 'Assembling', variant: 'warning' },
  succeeded: { label: 'Completed', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
};

const PAGE_STATUS_META = {
  queued: { label: 'Queued', tone: 'text-foreground/60' },
  generating: { label: 'Generating', tone: 'text-foreground' },
  ranking: { label: 'Ranking', tone: 'text-foreground' },
  completed: { label: 'Completed', tone: 'text-emerald-400' },
  failed: { label: 'Failed', tone: 'text-red-400' },
};

const sortByCreatedAtDesc = (a, b) =>
  new Date(b?.createdAt || 0) - new Date(a?.createdAt || 0);

const mergeJobPayload = (current = {}, incoming = {}) => {
  const merged = {
    ...current,
    ...incoming,
  };

  merged.events = Array.isArray(incoming.events)
    ? incoming.events
    : Array.isArray(current.events)
    ? current.events
    : [];

  merged.pages = Array.isArray(incoming.pages)
    ? incoming.pages
    : Array.isArray(current.pages)
    ? current.pages
    : [];

  return merged;
};

const upsertJobList = (list, incoming) => {
  if (!incoming?._id) {
    return list;
  }

  const existingIndex = list.findIndex((item) => item._id === incoming._id);
  if (existingIndex === -1) {
    const next = [incoming, ...list];
    return next.sort(sortByCreatedAtDesc).slice(0, JOB_HISTORY_LIMIT);
  }

  const next = [...list];
  next[existingIndex] = mergeJobPayload(list[existingIndex], incoming);
  return next.sort(sortByCreatedAtDesc).slice(0, JOB_HISTORY_LIMIT);
};

const getJobStatusMeta = (status) => JOB_STATUS_META[status] || JOB_STATUS_META.queued;
const getPageStatusMeta = (status) => PAGE_STATUS_META[status] || PAGE_STATUS_META.queued;

const formatTimestamp = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatEta = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) {
    return `${Math.max(1, Math.round(seconds))}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);

  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return `${hours}h${remMinutes ? ` ${remMinutes}m` : ''}`;
  }

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m${remainingSeconds ? ` ${remainingSeconds}s` : ''}`;
};

const CHARACTER_POSITION_OPTIONS = [
  { value: 'auto', label: 'Auto alternate' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

const NAME_PLACEHOLDER_DETECTION = /\{name\}/i;

const containsNamePlaceholder = (value) =>
  typeof value === 'string' ? NAME_PLACEHOLDER_DETECTION.test(value) : false;

const replaceNamePlaceholders = (value, replacement) => {
  if (!value || typeof value !== 'string') {
    return value || '';
  }
  if (!replacement) return value;
  return value.replace(/\{name\}/gi, replacement);
};

const PDF_PAGE_WIDTH = 842;
const PDF_PAGE_HEIGHT = 421;
const PDF_CHARACTER_MAX_WIDTH_RATIO = 0.4;
const PDF_CHARACTER_MAX_HEIGHT_RATIO = 0.8;
const PDF_TEXT_BLOCK_WIDTH = 300;
const PDF_TEXT_BLOCK_WIDTH_RATIO = 0.35;
const PDF_TEXT_MARGIN = 40;
const PDF_FONT_SIZE = 16;
const PDF_LINE_HEIGHT = PDF_FONT_SIZE * 1.4;

const wrapTextToLines = (text, maxWidth, fontSize) => {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';
  const avgCharWidth = fontSize * 0.45;

  words.forEach((word) => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const lineWidth = testLine.length * avgCharWidth;
    if (lineWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  });

  if (currentLine) lines.push(currentLine);
  return lines;
};

const toPercent = (value, total) => {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total === 0) {
    return '0%';
  }
  return `${(value / total) * 100}%`;
};

const withCacheBust = (url, token) => {
  if (!url) return '';
  if (!token) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}cb=${encodeURIComponent(token)}`;
};

const normaliseAssetPages = (pages) => {
  if (!Array.isArray(pages)) return [];
  return pages
    .map((entry) => ({
      ...entry,
      background: entry?.background ? { ...entry.background } : null,
      character: entry?.character ? { ...entry.character } : null,
      characterOriginal: entry?.characterOriginal ? { ...entry.characterOriginal } : null,
      candidateAssets: Array.isArray(entry?.candidateAssets)
        ? entry.candidateAssets.map((asset) => ({ ...asset }))
        : [],
      selectedCandidateIndex: Number.isFinite(entry?.selectedCandidateIndex)
        ? entry.selectedCandidateIndex
        : null,
      generationId: entry?.generationId || null,
    }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
};

// Page Thumbnail Component - matches main preview exactly
const PageThumbnail = React.memo(({ page, index, isActive, onClick, assetUpdatedAt }) => {
  const thumbLabel = page.order || index + 1;
  const isCharacterOnRight = index % 2 === 0;
  const backgroundUrl = page?.background?.url || page?.background?.downloadUrl || page?.background?.signedUrl || '';
  const characterUrl = page?.character?.url || page?.character?.downloadUrl || page?.character?.signedUrl || '';
  const thumbCacheToken = page.updatedAt || assetUpdatedAt || `thumb-${thumbLabel}`;

  // Use same positioning logic as main preview
  const textBlockWidth = Math.min(
    Math.max(PDF_PAGE_WIDTH * PDF_TEXT_BLOCK_WIDTH_RATIO, PDF_TEXT_BLOCK_WIDTH),
    PDF_PAGE_WIDTH - PDF_TEXT_MARGIN * 2
  );
  const textY = PDF_PAGE_HEIGHT * 0.7;
  const bubbleTopPercent = toPercent(PDF_PAGE_HEIGHT - (textY + 20), PDF_PAGE_HEIGHT);
  const bubbleSidePercent = toPercent(Math.max(PDF_TEXT_MARGIN - 20, 0), PDF_PAGE_WIDTH);
  const bubbleWidthPercent = toPercent(textBlockWidth + 40, PDF_PAGE_WIDTH);

  return (
    <button
      onClick={onClick}
      className={`w-full overflow-hidden transition-colors ${
        isActive
          ? 'ring-2 ring-accent shadow-md'
          : 'ring-1 ring-border/40 hover:ring-accent/60'
      }`}
    >
      <div
        className="relative w-full bg-gradient-to-br from-slate-950/95 via-slate-900/80 to-slate-800/70"
        style={{ aspectRatio: `${PDF_PAGE_WIDTH}/${PDF_PAGE_HEIGHT}` }}
      >
        {backgroundUrl && (
          <img
            src={withCacheBust(backgroundUrl, `${thumbCacheToken}-thumb-bg`)}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        )}
        {characterUrl && (
          <img
            src={withCacheBust(characterUrl, `${thumbCacheToken}-thumb-char`)}
            alt=""
            className="absolute bottom-0 object-contain"
            style={{
              maxWidth: `${PDF_CHARACTER_MAX_WIDTH_RATIO * 100}%`,
              maxHeight: `${PDF_CHARACTER_MAX_HEIGHT_RATIO * 100}%`,
              [isCharacterOnRight ? 'right' : 'left']: '0%',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
            }}
            loading="lazy"
          />
        )}
        {page.text && (
          <div
            className="absolute overflow-hidden"
            style={{
              top: bubbleTopPercent,
              width: bubbleWidthPercent,
              padding: '2%',
              [isCharacterOnRight ? 'left' : 'right']: bubbleSidePercent,
              backgroundColor: 'rgb(255, 255, 255)',
              opacity: 0.5,
              borderRadius: '3px',
              fontSize: '3px',
              lineHeight: '1.4',
              color: 'rgb(0, 0, 0)',
              fontFamily: 'Helvetica, Arial, sans-serif',
            }}
          >
            <div className="line-clamp-3">{page.text}</div>
          </div>
        )}
        <div
          className="absolute"
          style={{
            left: '4.75%',
            top: '8.3%',
            fontSize: '4px',
            fontFamily: 'Helvetica, Arial, sans-serif',
            fontWeight: 'bold',
            color: 'rgb(255, 255, 255)',
            opacity: 0.65,
          }}
        >
          Page {thumbLabel}
        </div>
      </div>
    </button>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to prevent unnecessary re-renders - return true if props are equal
  return (
    prevProps.isActive === nextProps.isActive &&
    prevProps.page.order === nextProps.page.order &&
    prevProps.page.updatedAt === nextProps.page.updatedAt &&
    prevProps.assetUpdatedAt === nextProps.assetUpdatedAt &&
    prevProps.index === nextProps.index
  );
});

function Storybooks() {
  const [books, setBooks] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [selectedBook, setSelectedBook] = useState(null);
  const [pages, setPages] = useState([]);
  const [storyTitle, setStoryTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingBook, setLoadingBook] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [trainings, setTrainings] = useState([]);
  const [selectedTrainingId, setSelectedTrainingId] = useState('');
  const [storybookJobs, setStorybookJobs] = useState([]);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const eventSourceRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const handledJobCompletionsRef = useRef(new Set());
  const [isStreamConnected, setIsStreamConnected] = useState(false);
  const [activeAsset, setActiveAsset] = useState(null);
  const [activeAssetPages, setActiveAssetPages] = useState([]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [regeneratingOrder, setRegeneratingOrder] = useState(null);
  const [isRegeneratingPdf, setIsRegeneratingPdf] = useState(false);
  const [applyingCandidateKey, setApplyingCandidateKey] = useState('');
  const preloadRefs = useRef([]);

  const selectedReader = useMemo(
    () => users.find((user) => user._id === selectedUserId) || null,
    [selectedUserId, users]
  );

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const [booksResponse, usersResponse] = await Promise.all([
          bookAPI.getAll(),
          userAPI.getAll(),
        ]);
        setBooks(booksResponse.data);
        setUsers(usersResponse.data);
      } catch (error) {
        toast.error(`Failed to load storybook data: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, []);

  const fetchBookDetails = useCallback(
    async (bookId, { preserveTitle = false } = {}) => {
      if (!bookId) return;
      try {
        setLoadingBook(true);
        const response = await bookAPI.getById(bookId);
        const book = response.data;
        const normalisedPdfAssets = Array.isArray(book.pdfAssets)
          ? book.pdfAssets.map((asset) => ({
              ...asset,
              pages: normaliseAssetPages(asset.pages),
            }))
          : [];
        setSelectedBook({
          ...book,
          pdfAssets: normalisedPdfAssets,
        });
        setStoryTitle((prev) => {
          if (preserveTitle && prev) return prev;
          if (prev) return prev;
          return `${book.name} Storybook`;
        });
        setPages(
          (book.pages || []).map((page) => ({
            id: page._id,
            order: page.order,
            text: page.text || '',
            prompt: page.characterPrompt || page.prompt || '',
            useCharacter: true,
            characterPosition: 'auto',
            backgroundImageUrl:
              page.backgroundImage?.url || page.characterImage?.url || '',
            characterFile: null,
            characterPreview: '',
            characterUrl: page.characterImage?.url || '',
            quote: page.quote || page.hebrewQuote || '',
          }))
        );
      } catch (error) {
        toast.error(`Failed to load book details: ${error.message}`);
        setSelectedBook(null);
        setPages([]);
      } finally {
        setLoadingBook(false);
      }
    },
    []
  );

  const disconnectJobStream = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsStreamConnected(false);
  }, []);

  const handleJobCompletion = useCallback(
    (job) => {
      if (!job || job.status !== 'succeeded') return;
      if (job.bookId && selectedBookId && job.bookId !== selectedBookId) return;

      if (handledJobCompletionsRef.current.has(job._id)) {
        return;
      }
      handledJobCompletionsRef.current.add(job._id);

      setSelectedBook((prev) => {
        if (!prev) return prev;
        const existingAssets = Array.isArray(prev.pdfAssets) ? prev.pdfAssets : [];
        const alreadyPresent = existingAssets.some((asset) => asset.key === job.pdfAsset?.key);
        const nextAssets =
          job.pdfAsset && !alreadyPresent
            ? [
                {
                  ...job.pdfAsset,
                  pages: normaliseAssetPages(job.pdfAsset.pages),
                },
                ...existingAssets,
              ]
            : existingAssets;
        return {
          ...prev,
          pdfAssets: nextAssets,
        };
      });

      if (selectedBookId) {
        fetchBookDetails(selectedBookId, { preserveTitle: true });
      }

      toast.success('Storybook automation completed');
    },
    [fetchBookDetails, selectedBookId]
  );

  const applyJobUpdate = useCallback(
    (payload) => {
      if (!payload?._id) return;
      setStorybookJobs((previous) => upsertJobList(previous, payload));
      if (payload.status === 'succeeded') {
        handleJobCompletion(payload);
      }
    },
    [handleJobCompletion]
  );

  const fetchStorybookJobs = useCallback(
    async (bookId) => {
      if (!bookId) {
        setStorybookJobs([]);
        handledJobCompletionsRef.current = new Set();
        return;
      }
      try {
        const response = await bookAPI.getStorybookJobs(bookId, { limit: JOB_HISTORY_LIMIT });
        const jobs = Array.isArray(response.data) ? response.data : [];
        setStorybookJobs(jobs.sort(sortByCreatedAtDesc));
        handledJobCompletionsRef.current = new Set(
          jobs.filter((job) => job.status === 'succeeded').map((job) => job._id)
        );
      } catch (error) {
        toast.error(`Failed to load storybook runs: ${error.message}`);
      }
    },
    []
  );

  const connectJobStream = useCallback(
    (bookId) => {
      disconnectJobStream();
      if (!bookId) return;

      const streamUrl = `${API_BASE_URL}/books/storybooks/stream/live?bookId=${bookId}`;
      const source = new EventSource(streamUrl);
      eventSourceRef.current = source;

      source.onopen = () => {
        setIsStreamConnected(true);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      source.onmessage = (event) => {
        if (!event?.data) return;
        try {
          const payload = JSON.parse(event.data);
          applyJobUpdate(payload);
        } catch (parseError) {
          console.error('Failed to parse storybook stream payload', parseError);
        }
      };

      source.onerror = () => {
        setIsStreamConnected(false);
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connectJobStream(bookId);
          }, 4000);
        }
      };
    },
    [applyJobUpdate, disconnectJobStream]
  );

  useEffect(() => {
    if (!selectedUserId) return;
    const stillExists = users.some((user) => user._id === selectedUserId);
    if (!stillExists) {
      setSelectedUserId('');
    }
  }, [selectedUserId, users]);

  useEffect(() => {
    if (!selectedUserId) {
      setTrainings([]);
      setSelectedTrainingId('');
      return;
    }

    let cancelled = false;

    const fetchTrainings = async () => {
      try {
        const response = await trainingAPI.getAll({
          userId: selectedUserId,
          status: 'succeeded',
        });
        if (cancelled) return;
        const items = Array.isArray(response.data)
          ? response.data.filter((training) => training.status === 'succeeded')
          : [];
        setTrainings(items);
        if (
          items.length &&
          !items.some((training) => training._id === selectedTrainingId)
        ) {
          setSelectedTrainingId(items[0]._id);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(`Failed to load trainings: ${error.message}`);
        }
      }
    };

    fetchTrainings();

    return () => {
      cancelled = true;
    };
  }, [selectedUserId, selectedTrainingId]);

  useEffect(() => {
    if (!selectedBookId) {
      disconnectJobStream();
      setSelectedBook(null);
      setPages([]);
      setStoryTitle('');
      setStorybookJobs([]);
      handledJobCompletionsRef.current = new Set();
      return;
    }

    fetchBookDetails(selectedBookId);
    fetchStorybookJobs(selectedBookId);
    connectJobStream(selectedBookId);

    return () => {
      disconnectJobStream();
    };
  }, [
    selectedBookId,
    fetchBookDetails,
    fetchStorybookJobs,
    connectJobStream,
    disconnectJobStream,
  ]);

  useEffect(() => {
    if (!activeAsset) {
      document.body.style.overflow = '';
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeAsset]);

  useEffect(() => {
    setActiveAsset(null);
    setActiveAssetPages([]);
    setActivePageIndex(0);
    setRegeneratingOrder(null);
  }, [selectedBookId]);

  useEffect(() => {
    if (!activeAsset || !selectedBook?.pdfAssets?.length) return;
    const updatedAsset =
      selectedBook.pdfAssets.find(
        (asset) =>
          (activeAsset._id && asset._id === activeAsset._id) ||
          asset.key === activeAsset.key
      ) || null;
    if (!updatedAsset) return;

    const updatedTimestamp = updatedAsset.updatedAt
      ? new Date(updatedAsset.updatedAt).toISOString()
      : updatedAsset.createdAt
      ? new Date(updatedAsset.createdAt).toISOString()
      : null;
    const currentTimestamp = activeAsset.updatedAt
      ? new Date(activeAsset.updatedAt).toISOString()
      : activeAsset.createdAt
      ? new Date(activeAsset.createdAt).toISOString()
      : null;

    if (updatedTimestamp && currentTimestamp && updatedTimestamp === currentTimestamp) {
      return;
    }

    const snapshot = JSON.parse(JSON.stringify(updatedAsset));
    setActiveAsset(snapshot);
    if (Array.isArray(snapshot.pages) && snapshot.pages.length) {
      setActiveAssetPages(snapshot.pages);
    }
  }, [activeAsset, selectedBook?.pdfAssets]);

  const totalPages = useMemo(() => pages.length, [pages.length]);
  const totalStorybooks = useMemo(() => selectedBook?.pdfAssets?.length || 0, [selectedBook?.pdfAssets?.length]);
  const activeJob = useMemo(
    () =>
      storybookJobs.find((job) =>
        ['queued', 'generating', 'assembling'].includes(job.status)
      ) || null,
    [storybookJobs]
  );

  // Memoize page index setter to prevent re-renders
  const handlePageIndexChange = useCallback((newIndex) => {
    setActivePageIndex(newIndex);
  }, []);

  const updatePage = (index, patch) => {
    setPages((prev) =>
      prev.map((page, pageIndex) => {
        if (pageIndex !== index) return page;

        if (patch.characterFile && page.characterPreview) {
          URL.revokeObjectURL(page.characterPreview);
        }

        return {
          ...page,
          ...patch,
        };
      })
    );
  };

  const handleCharacterFileChange = (index, event) => {
    const file = event.target.files?.[0];
    if (!file) {
      updatePage(index, {
        characterFile: null,
        characterPreview: '',
      });
      return;
    }

    updatePage(index, {
      characterFile: file,
      characterPreview: URL.createObjectURL(file),
      characterUrl: '',
      useCharacter: true,
    });
  };

  const handleCharacterUrlChange = (index, value) => {
    updatePage(index, {
      characterUrl: value,
      characterFile: null,
      characterPreview: '',
      useCharacter: Boolean((value || '').trim().length),
    });
  };

  const clearCharacterSelection = (index) => {
    const current = pages[index];
    if (current?.characterPreview) {
      URL.revokeObjectURL(current.characterPreview);
    }
    updatePage(index, {
      characterFile: null,
      characterPreview: '',
      characterUrl: selectedBook?.pages?.[index]?.characterImage?.url || '',
      useCharacter: Boolean(selectedBook?.pages?.[index]?.characterImage?.url),
    });
  };

  const handleStartAutomation = async () => {
    if (!selectedBookId) {
      toast.error('Select a book before starting automation');
      return;
    }
    if (!selectedUserId) {
      toast.error('Select a reader before starting automation');
      return;
    }
    if (!selectedTrainingId) {
      toast.error('Select a training model for automation');
      return;
    }

    try {
      setIsAutoGenerating(true);
      const response = await bookAPI.startAutoStorybook(selectedBookId, {
        trainingId: selectedTrainingId,
        userId: selectedUserId,
        readerId: selectedReader?._id || selectedUserId,
        readerName: selectedReader?.name || '',
        title: storyTitle || `${selectedBook?.name || 'Storybook'}`,
      });
      if (response.data?._id) {
        setStorybookJobs((previous) => upsertJobList(previous, response.data));
      }
      toast.success('Automated storybook generation started');
    } catch (error) {
      toast.error(`Failed to start automation: ${error.message}`);
    } finally {
      setIsAutoGenerating(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedBookId) {
      toast.error('Select a book before generating a storybook');
      return;
    }

    if (!pages.length) {
      toast.error('Add at least one page to generate');
      return;
    }

    const hasNamePlaceholder = pages.some((page) => {
      if (containsNamePlaceholder(page.text)) return true;
      if (!selectedBook) return false;
      const sourcePage =
        selectedBook.pages?.find((bookPage) => {
          if (page.id && bookPage._id) {
            return bookPage._id === page.id;
          }
          return bookPage.order === page.order;
        }) || null;
      return containsNamePlaceholder(sourcePage?.text);
    });

    if (hasNamePlaceholder && !selectedReader?.name) {
      toast.error('Select a reader to replace {name} placeholders before generating.');
      return;
    }

    try {
      setIsGenerating(true);
      const formData = new FormData();
      if (storyTitle) {
        formData.append('title', storyTitle);
      }
      if (selectedReader?._id) {
        formData.append('readerId', selectedReader._id);
      }
      if (selectedReader?.name) {
        formData.append('readerName', selectedReader.name);
      }

      const pagesPayload = pages.map((page) => ({
        bookPageId: page.id,
        order: page.order,
        text: page.text,
        useCharacter: page.useCharacter,
        characterPosition: page.characterPosition,
        hasCharacterUpload: Boolean(page.characterFile),
        characterUrl: page.useCharacter && !page.characterFile ? page.characterUrl : undefined,
        hebrewQuote: page.quote || '',
      }));

      formData.append('pages', JSON.stringify(pagesPayload));

      pages.forEach((page) => {
        if (page.useCharacter && page.characterFile) {
          formData.append('characterImages', page.characterFile);
        }
      });

      const response = await bookAPI.generateStorybook(selectedBookId, formData);
      toast.success('Storybook generated!');

      setSelectedBook((prev) => {
        if (!prev) return prev;
        const newAsset = {
          ...response.data,
          pages: normaliseAssetPages(response.data?.pages),
        };
        const updatedAssets = [...(prev.pdfAssets || []), newAsset];
        return { ...prev, pdfAssets: updatedAssets };
      });
    } catch (error) {
      toast.error(`Failed to generate storybook: ${error.message}`);
  } finally {
    setIsGenerating(false);
  }
};

  const resolveAssetUrl = (asset) => {
    if (!asset) return '';
    const direct = typeof asset.url === 'string' ? asset.url.trim() : '';
    if (direct) return direct;
    const download = typeof asset.downloadUrl === 'string' ? asset.downloadUrl.trim() : '';
    if (download) return download;
    const signed = typeof asset.signedUrl === 'string' ? asset.signedUrl.trim() : '';
    if (signed) return signed;
    return '';
  };

  const handleOpenAssetViewer = async (asset) => {
    if (!asset) return;
    const assetSnapshot = JSON.parse(JSON.stringify(asset));
    const orderedPages = normaliseAssetPages(assetSnapshot.pages);

    setActiveAsset(assetSnapshot);
    setActiveAssetPages(orderedPages);
    setActivePageIndex(0);

    if (!selectedBookId) return;

    const assetIdentifier = assetSnapshot._id || assetSnapshot.key;
    if (!assetIdentifier) return;

    try {
      const response = await bookAPI.getStorybookAssetPages(selectedBookId, assetIdentifier);
      const remotePages = normaliseAssetPages(response.data?.pages || []);
      if (remotePages.length) {
        setActiveAssetPages(remotePages);
        setActivePageIndex((prev) =>
          prev >= remotePages.length ? remotePages.length - 1 : prev
        );
        setActiveAsset((prev) => (prev ? { ...prev, pages: remotePages } : prev));
        setSelectedBook((prev) => {
          if (!prev) return prev;
          const nextAssets = Array.isArray(prev.pdfAssets)
            ? prev.pdfAssets.map((existing) => {
                const matches =
                  (assetSnapshot._id && existing._id === assetSnapshot._id) ||
                  existing.key === assetSnapshot.key;
                if (!matches) return existing;
                return {
                  ...existing,
                  pages: remotePages,
                  updatedAt: new Date().toISOString(),
                };
              })
            : prev.pdfAssets;
          return {
            ...prev,
            pdfAssets: nextAssets,
          };
        });
      }
    } catch (error) {
      console.warn('Failed to fetch storybook pages', error);
    }
  };

  const handleCloseAssetViewer = () => {
    setActiveAsset(null);
    setActiveAssetPages([]);
    setActivePageIndex(0);
    setRegeneratingOrder(null);
    setIsRegeneratingPdf(false);
    setApplyingCandidateKey('');
    if (Array.isArray(preloadRefs.current)) {
      preloadRefs.current.forEach((image) => {
        if (typeof Image !== 'undefined' && image && image instanceof Image) {
          image.src = '';
        }
      });
    }
    preloadRefs.current = [];
  };

  // Simplified preloading - only preload adjacent pages for better performance
  useEffect(() => {
    if (!activeAsset || !activeAssetPages.length || typeof window === 'undefined') {
      return;
    }

    const assetIdentifier = activeAsset._id || activeAsset.key || 'asset';
    const images = [];

    // Only preload current page and adjacent pages (prev and next)
    const pagesToPreload = [
      activePageIndex - 1,
      activePageIndex,
      activePageIndex + 1,
    ].filter((idx) => idx >= 0 && idx < activeAssetPages.length);

    pagesToPreload.forEach((index) => {
      const page = activeAssetPages[index];
      if (!page) return;

      const pageLabel = page.order || index + 1;
      const cacheToken = page.updatedAt || activeAsset.updatedAt || `${assetIdentifier}-${pageLabel}`;

      const backgroundUrl = resolveAssetUrl(page.background);
      const characterUrl = resolveAssetUrl(page.character);

      if (backgroundUrl) {
        const img = new Image();
        img.src = withCacheBust(backgroundUrl, `${cacheToken}-preload-bg`);
        images.push(img);
      }

      if (characterUrl) {
        const img = new Image();
        img.src = withCacheBust(characterUrl, `${cacheToken}-preload-char`);
        images.push(img);
      }
    });

    return () => {
      images.forEach((img) => {
        img.src = '';
      });
    };
  }, [activeAsset, activeAssetPages, activePageIndex]);

  const handleRegeneratePage = async (order) => {
    if (!activeAsset || !selectedBookId || !order) return;
    const assetIdentifier = activeAsset._id || activeAsset.key;
    if (!assetIdentifier) {
      toast.error('Missing storybook identifier for regeneration');
      return;
    }
    if (!activeAsset.trainingId) {
      toast.error('This storybook is missing training metadata. Regeneration is unavailable.');
      return;
    }

    setRegeneratingOrder(order);
    try {
      const response = await bookAPI.regenerateStorybookPage(
        selectedBookId,
        assetIdentifier,
        order
      );
      const payload = response.data || {};
      const { page: updatedBookPage, pdfAssetPage } = payload;

      if (pdfAssetPage) {
        setActiveAssetPages((prev) => {
          const next = Array.isArray(prev) ? [...prev] : [];
          const existingIndex = next.findIndex((entry) => entry.order === pdfAssetPage.order);
          if (existingIndex === -1) {
            next.push(pdfAssetPage);
          } else {
            next[existingIndex] = { ...next[existingIndex], ...pdfAssetPage };
          }
          return normaliseAssetPages(next);
        });

        setActiveAsset((prev) => {
          if (!prev) return prev;
          const nextPages = normaliseAssetPages(
            Array.isArray(prev.pages)
              ? prev.pages.map((entry) =>
                  entry.order === pdfAssetPage.order ? { ...entry, ...pdfAssetPage } : entry
                )
              : [pdfAssetPage]
          );
          return {
            ...prev,
            pages: nextPages,
            updatedAt: new Date().toISOString(),
          };
        });
      }

      if (updatedBookPage?.characterImage) {
        setPages((prev) =>
          prev.map((page) =>
            page.order === updatedBookPage.order
              ? {
                  ...page,
                  characterUrl: updatedBookPage.characterImage?.url || '',
                  characterPreview: '',
                  characterFile: null,
                  useCharacter: true,
                }
              : page
          )
        );
      }

      setSelectedBook((prev) => {
        if (!prev) return prev;
        const nextPages = Array.isArray(prev.pages)
          ? prev.pages.map((page) =>
              updatedBookPage && page.order === updatedBookPage.order
                ? { ...page, characterImage: updatedBookPage.characterImage }
                : page
            )
          : prev.pages;

        const nextAssets = Array.isArray(prev.pdfAssets)
          ? prev.pdfAssets.map((asset) => {
              const matches =
                (activeAsset?._id && asset._id === activeAsset._id) ||
                asset.key === activeAsset?.key;
              if (!matches) return asset;

              const updatedAsset = {
                ...asset,
                updatedAt: new Date().toISOString(),
              };
              if (pdfAssetPage) {
                const assetPages = Array.isArray(asset.pages) ? [...asset.pages] : [];
                const pageIndex = assetPages.findIndex(
                  (entry) => entry.order === pdfAssetPage.order
                );
                if (pageIndex === -1) {
                  assetPages.push(pdfAssetPage);
                } else {
                  assetPages[pageIndex] = { ...assetPages[pageIndex], ...pdfAssetPage };
                }
                updatedAsset.pages = normaliseAssetPages(assetPages);
              }
              return updatedAsset;
            })
          : prev.pdfAssets;

        return {
          ...prev,
          pages: nextPages,
          pdfAssets: nextAssets,
        };
      });

      await fetchBookDetails(selectedBookId, { preserveTitle: true });
      try {
        const refreshedPagesResponse = await bookAPI.getStorybookAssetPages(
          selectedBookId,
          assetIdentifier
        );
        const refreshedPages = normaliseAssetPages(refreshedPagesResponse.data?.pages || []);
        if (refreshedPages.length) {
          setActiveAssetPages(refreshedPages);
          setActivePageIndex((prev) =>
            prev >= refreshedPages.length ? refreshedPages.length - 1 : prev
          );
          setActiveAsset((prev) => (prev ? { ...prev, pages: refreshedPages } : prev));
        }
      } catch (fetchError) {
        console.warn('Failed to refresh storybook pages after regeneration', fetchError);
      }
      toast.success('Page regenerated. Regenerate the PDF to export the latest changes.');
    } catch (error) {
      toast.error(`Failed to regenerate page: ${error.message}`);
    } finally {
      setRegeneratingOrder(null);
    }
  };

  const handleRegeneratePdf = async () => {
    if (!activeAsset || !selectedBookId) {
      toast.error('Open a storybook to regenerate the PDF');
      return;
    }

    const assetIdentifier = activeAsset._id || activeAsset.key;
    if (!assetIdentifier) {
      toast.error('Missing storybook identifier for PDF regeneration');
      return;
    }

    setIsRegeneratingPdf(true);
    try {
      const response = await bookAPI.regenerateStorybookPdf(selectedBookId, assetIdentifier, {
        title: activeAsset.title,
      });
      const payload = response.data || {};
      const normalisedPages = normaliseAssetPages(payload.pages || []);

      setActiveAsset((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ...payload,
          pages: normalisedPages,
          updatedAt: payload.updatedAt || new Date().toISOString(),
        };
      });
      setActiveAssetPages(normalisedPages);

      setSelectedBook((prev) => {
        if (!prev) return prev;
        const updatedAssets = Array.isArray(prev.pdfAssets)
          ? prev.pdfAssets.map((asset) => {
              const matches =
                (activeAsset?._id && asset._id === activeAsset._id) ||
                asset.key === activeAsset?.key;
              if (!matches) return asset;
              return {
                ...asset,
                ...payload,
                pages: normalisedPages,
              };
            })
          : prev.pdfAssets;
        return {
          ...prev,
          pdfAssets: updatedAssets,
        };
      });

      toast.success('Regenerated PDF with the latest imagery');
    } catch (error) {
      toast.error(`Failed to regenerate PDF: ${error.message}`);
    } finally {
      setIsRegeneratingPdf(false);
    }
  };

  const handleApplyCandidate = async (order, candidateIndex) => {
    if (!activeAsset || !selectedBookId || !order) return;
    const assetIdentifier = activeAsset._id || activeAsset.key;
    if (!assetIdentifier) {
      toast.error('Missing storybook identifier for candidate selection');
      return;
    }

    const selectionKey = `${order}-${candidateIndex}`;
    setApplyingCandidateKey(selectionKey);

    try {
      const response = await bookAPI.selectStorybookPageCandidate(
        selectedBookId,
        assetIdentifier,
        order,
        { candidateIndex }
      );
      const payload = response.data || {};
      if (payload.pdfAssetPage) {
        const [normalisedPage] = normaliseAssetPages([payload.pdfAssetPage]);

        setActiveAssetPages((prev) => {
          const next = Array.isArray(prev)
            ? prev.map((page) =>
                page.order === normalisedPage.order ? { ...page, ...normalisedPage } : page
              )
            : [normalisedPage];
          return normaliseAssetPages(next);
        });

        setActiveAsset((prev) => {
          if (!prev) return prev;
          const nextPages = normaliseAssetPages(
            Array.isArray(prev.pages)
              ? prev.pages.map((page) =>
                  page.order === normalisedPage.order ? { ...page, ...normalisedPage } : page
                )
              : [normalisedPage]
          );
          return {
            ...prev,
            pages: nextPages,
            updatedAt: payload.pdfAssetPage.updatedAt || new Date().toISOString(),
          };
        });

        setSelectedBook((prev) => {
          if (!prev) return prev;
          const updatedBookPages = Array.isArray(prev.pages)
            ? prev.pages.map((page) =>
                page.order === (payload.page?.order || order)
                  ? {
                      ...page,
                      characterImage: payload.page?.characterImage || page.characterImage,
                      characterImageOriginal:
                        payload.page?.characterImageOriginal || page.characterImageOriginal,
                    }
                  : page
              )
            : prev.pages;
          const updatedAssets = Array.isArray(prev.pdfAssets)
            ? prev.pdfAssets.map((asset) => {
                const matches =
                  (activeAsset?._id && asset._id === activeAsset._id) ||
                  asset.key === activeAsset?.key;
                if (!matches) return asset;
                const nextPages = normaliseAssetPages(
                  Array.isArray(asset.pages)
                    ? asset.pages.map((page) =>
                        page.order === normalisedPage.order ? { ...page, ...normalisedPage } : page
                      )
                    : [normalisedPage]
                );
                return {
                  ...asset,
                  pages: nextPages,
                  updatedAt:
                    payload.pdfAssetPage.updatedAt || asset.updatedAt || new Date().toISOString(),
                };
              })
            : prev.pdfAssets;
          return {
            ...prev,
            pdfAssets: updatedAssets,
            pages: updatedBookPages,
          };
        });

        if (payload.page?.characterImage) {
          setPages((prev) =>
            prev.map((page) =>
              page.order === (payload.page.order || order)
                ? {
                    ...page,
                    characterUrl: payload.page.characterImage?.url || page.characterUrl,
                    characterPreview: '',
                    characterFile: null,
                    useCharacter: true,
                  }
                : page
            )
          );
        }

        toast.success('Applied the selected candidate image');
      }
    } catch (error) {
      toast.error(`Failed to apply candidate: ${error.message}`);
    } finally {
      setApplyingCandidateKey('');
    }
  };

  const renderAssetViewer = useCallback(() => {
    if (!activeAsset) return null;

    const hasPages = Array.isArray(activeAssetPages) && activeAssetPages.length > 0;
    const safeIndex = hasPages
      ? activePageIndex >= activeAssetPages.length
        ? activeAssetPages.length - 1
        : Math.max(0, activePageIndex)
      : 0;
    const currentPage = hasPages ? activeAssetPages[safeIndex] || null : null;
    const isCharacterOnRight = safeIndex % 2 === 0;
    const assetIdentifier = activeAsset?._id || activeAsset?.key || 'storybook';
    const backgroundUrl = resolveAssetUrl(currentPage?.background);
    const characterUrl = resolveAssetUrl(currentPage?.character);
    const canNavigatePrev = hasPages && safeIndex > 0;
    const canNavigateNext = hasPages && safeIndex < activeAssetPages.length - 1;
    const isCurrentPageRegenerating =
      currentPage?.order !== undefined && regeneratingOrder === currentPage.order;
    const pageLabel = currentPage?.order || safeIndex + 1;

    const textBlockWidth = Math.min(
      Math.max(PDF_PAGE_WIDTH * PDF_TEXT_BLOCK_WIDTH_RATIO, PDF_TEXT_BLOCK_WIDTH),
      PDF_PAGE_WIDTH - PDF_TEXT_MARGIN * 2
    );
    const textLines = wrapTextToLines(currentPage?.text || '', textBlockWidth, PDF_FONT_SIZE);
    const textY = PDF_PAGE_HEIGHT * 0.7;
    const bubbleTopPercent = toPercent(PDF_PAGE_HEIGHT - (textY + 20), PDF_PAGE_HEIGHT);
    const bubbleSidePercent = toPercent(Math.max(PDF_TEXT_MARGIN - 20, 0), PDF_PAGE_WIDTH);
    const bubbleWidthPercent = toPercent(textBlockWidth + 40, PDF_PAGE_WIDTH);

    const quoteLines = wrapTextToLines(
      currentPage?.quote || '',
      PDF_PAGE_WIDTH * 0.3,
      PDF_FONT_SIZE
    );
    const quoteWidthPercent = toPercent(PDF_PAGE_WIDTH * 0.3, PDF_PAGE_WIDTH);
    const quoteTopPercent = toPercent(Math.max(80 - PDF_FONT_SIZE, 0), PDF_PAGE_HEIGHT);
    const quoteRightPercent = toPercent(260, PDF_PAGE_WIDTH);
    const quoteLeftPercent = toPercent(PDF_TEXT_MARGIN, PDF_PAGE_WIDTH);
    const cacheToken =
      currentPage?.updatedAt ||
      activeAsset?.updatedAt ||
      `${assetIdentifier}-${pageLabel}`;
    const backgroundSrc = withCacheBust(
      backgroundUrl,
      `${cacheToken}-background-${pageLabel}`
    );
    const characterSrc = withCacheBust(
      characterUrl,
      `${cacheToken}-character-${pageLabel}`
    );
    const hasCharacterImage = Boolean(characterSrc);
    const hasCharacterAsset = Boolean(currentPage?.character);
    const characterBackgroundRemoved = Boolean(currentPage?.character?.backgroundRemoved);
    const hasCandidateAssets =
      Array.isArray(currentPage?.candidateAssets) && currentPage.candidateAssets.length > 0;
    const hasRankingNotes = Array.isArray(currentPage?.rankingNotes) && currentPage.rankingNotes.length > 0;
    const shouldShowCandidateSection =
      hasCandidateAssets || hasRankingNotes || Boolean(activeAsset?.trainingId);
    const rankingSummary = (currentPage?.rankingSummary || '').trim();

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="relative flex h-full w-full max-w-[95vw] flex-col overflow-hidden rounded-2xl bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b border-border/50 px-4 sm:px-6 py-4 bg-background/95 backdrop-blur-sm">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wide text-foreground/45">Storybook preview</p>
              <h3 className="text-base sm:text-lg font-semibold text-foreground truncate">
                {activeAsset.title || selectedBook?.name || 'Storybook'}
                {hasPages ? ` · Page ${pageLabel}` : ' · No page snapshots yet'}
              </h3>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 px-2 sm:px-3"
                onClick={() => setActivePageIndex((prev) => Math.max(0, prev - 1))}
                disabled={!canNavigatePrev}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Prev</span>
              </Button>
              <span className="text-xs sm:text-sm font-medium text-foreground/60 px-1">
                {hasPages ? `${safeIndex + 1} / ${activeAssetPages.length}` : '0 / 0'}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 px-2 sm:px-3"
                onClick={() =>
                  setActivePageIndex((prev) =>
                    prev + 1 >= activeAssetPages.length ? prev : prev + 1
                  )
                }
                disabled={!canNavigateNext}
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
              {hasPages ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1 hidden md:flex"
                  onClick={() => currentPage && handleRegeneratePage(currentPage.order)}
                  disabled={isCurrentPageRegenerating}
                >
                  {isCurrentPageRegenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="hidden lg:inline">Regenerating…</span>
                    </>
                  ) : (
                    <span className="hidden lg:inline">Regenerate page</span>
                  )}
                </Button>
              ) : null}
              {hasPages ? (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="gap-1 hidden md:flex"
                  onClick={handleRegeneratePdf}
                  disabled={isRegeneratingPdf}
                >
                  {isRegeneratingPdf ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="hidden lg:inline">Rebuilding…</span>
                    </>
                  ) : (
                    <>
                      <BookOpen className="h-4 w-4" />
                      <span className="hidden lg:inline">Regenerate PDF</span>
                    </>
                  )}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleCloseAssetViewer}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {hasPages ? (
              <div className="flex w-full h-full">
                {/* Left Sidebar - Page Thumbnails */}
                <div className="hidden md:flex w-44 lg:w-52 flex-col border-r border-border/50 bg-background/50 overflow-y-auto scroll-container">
                  <div className="p-2 border-b border-border/50 bg-background/95 sticky top-0 z-10">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/60">Pages</p>
                  </div>
                  <div className="p-2 space-y-2" style={{ contain: 'layout style' }}>
                    {activeAssetPages.map((page, idx) => (
                      <PageThumbnail
                        key={`thumb-${page.order || idx}`}
                        page={page}
                        index={idx}
                        isActive={idx === safeIndex}
                        onClick={() => handlePageIndexChange(idx)}
                        assetUpdatedAt={activeAsset.updatedAt}
                      />
                    ))}
                  </div>
                </div>

                {/* Center - Main Preview */}
                <div className="flex-1 flex flex-col overflow-y-auto scroll-container bg-muted/10">
                  <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
                    {/* Main Preview Image */}
                    <div
                      className="relative w-full bg-gradient-to-br from-slate-950/95 via-slate-900/80 to-slate-800/70 shadow-xl preview-container"
                      style={{
                        aspectRatio: `${PDF_PAGE_WIDTH}/${PDF_PAGE_HEIGHT}`,
                      }}
                    >
                  {backgroundSrc ? (
                    <img
                      key={`${currentPage?.background?.key || pageLabel}-background`}
                      src={backgroundSrc}
                      alt={`Background for page ${pageLabel}`}
                      className="absolute inset-0 h-full w-full object-cover"
                      decoding="async"
                      loading="eager"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-foreground/50">
                      No background stored for this page.
                    </div>
                  )}
                  {hasCharacterImage ? (
                    <img
                      key={`${currentPage?.character?.key || pageLabel}-character`}
                      src={characterSrc}
                      alt={`Character for page ${pageLabel}`}
                      className="absolute bottom-0 object-contain"
                      style={{
                        maxWidth: `${PDF_CHARACTER_MAX_WIDTH_RATIO * 100}%`,
                        maxHeight: `${PDF_CHARACTER_MAX_HEIGHT_RATIO * 100}%`,
                        [isCharacterOnRight ? 'right' : 'left']: '0%',
                        filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.3))',
                      }}
                      decoding="async"
                      loading="eager"
                    />
                  ) : null}
                  {textLines.length ? (
                    <div
                      className="absolute"
                      style={{
                        top: bubbleTopPercent,
                        width: bubbleWidthPercent,
                        [isCharacterOnRight ? 'left' : 'right']: bubbleSidePercent,
                        backgroundColor: 'rgb(255, 255, 255)',
                        opacity: 0.5,
                        borderRadius: '24px',
                        padding: '20px',
                        fontFamily: 'Helvetica, Arial, sans-serif',
                        fontSize: '16px',
                        lineHeight: '22.4px',
                        color: 'rgb(0, 0, 0)',
                      }}
                    >
                      {textLines.map((line, lineIndex) => (
                        <p
                          key={`page-${pageLabel}-line-${lineIndex}`}
                          style={{
                            margin: 0,
                            padding: 0,
                          }}
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {quoteLines.length ? (
                    <div
                      className="absolute"
                      style={{
                        top: quoteTopPercent,
                        width: quoteWidthPercent,
                        fontSize: '16px',
                        lineHeight: '22.4px',
                        fontFamily: 'Helvetica, Arial, sans-serif',
                        fontWeight: 'bold',
                        color: 'rgb(0, 0, 0)',
                        ...(isCharacterOnRight
                          ? { right: quoteRightPercent }
                          : { left: quoteLeftPercent }),
                      }}
                    >
                      {quoteLines.map((line, lineIndex) => (
                        <p
                          key={`quote-${pageLabel}-${lineIndex}`}
                          style={{
                            margin: 0,
                            padding: 0,
                          }}
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  <div
                    className="absolute"
                    style={{
                      left: `${(PDF_TEXT_MARGIN / PDF_PAGE_WIDTH) * 100}%`,
                      top: '8.3%',
                      fontSize: '14px',
                      fontFamily: 'Helvetica, Arial, sans-serif',
                      fontWeight: 'bold',
                      color: 'rgb(255, 255, 255)',
                      opacity: 0.65,
                    }}
                  >
                    Page {pageLabel}
                  </div>
                </div>

                    {/* Mobile Page Info */}
                    <div className="md:hidden px-4 py-3 border border-border/50 bg-background/80 rounded-lg">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-foreground/60">
                          Page {safeIndex + 1} of {activeAssetPages.length}
                        </span>
                        <span className="text-foreground/50">
                          {currentPage?.character?.backgroundRemoved
                            ? 'Background removed'
                            : currentPage?.character
                            ? 'Original background'
                            : 'No character'}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex md:hidden gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1"
                        onClick={() => currentPage && handleRegeneratePage(currentPage.order)}
                        disabled={isCurrentPageRegenerating}
                      >
                        {isCurrentPageRegenerating ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Regenerating…
                          </>
                        ) : (
                          'Regenerate page'
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        className="flex-1 gap-1"
                        onClick={handleRegeneratePdf}
                        disabled={isRegeneratingPdf}
                      >
                        {isRegeneratingPdf ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Rebuilding…
                          </>
                        ) : (
                          <>
                            <BookOpen className="h-4 w-4" />
                            Regenerate PDF
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Art Director Notes */}
                    {rankingSummary ? (
                      <div className="rounded-lg border border-border/60 bg-background p-4 text-sm text-foreground/80">
                        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/55 mb-2">
                          Art Director Notes
                        </p>
                        <p className="leading-relaxed">{rankingSummary}</p>
                      </div>
                    ) : null}
                {shouldShowCandidateSection ? (
                  hasCandidateAssets ? (
                    <div className="space-y-3 border border-border/50 bg-background/50 p-3 sm:p-4">
                      <div className="flex items-center justify-between text-[10px] sm:text-xs uppercase tracking-wide text-foreground/60">
                        <span className="font-semibold">Candidate images</span>
                        <span className="text-foreground/50">
                          {Number.isFinite(currentPage?.selectedCandidateIndex)
                            ? `Selected: ${currentPage.selectedCandidateIndex}`
                            : 'Choose alternate'}
                        </span>
                      </div>
                      <div className="grid gap-3 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
                        {currentPage.candidateAssets.map((candidate, candidateIdx) => {
                          const optionNumber = candidateIdx + 1;
                          const candidateUrl = resolveAssetUrl(candidate);
                          const cacheKey = `${cacheToken}-candidate-${optionNumber}`;
                          const candidateKey = `${currentPage?.order || pageLabel}-${optionNumber}`;
                          const isSelected =
                            currentPage.selectedCandidateIndex === optionNumber;
                          const isApplying = applyingCandidateKey === candidateKey;
                          const rankingEntry = Array.isArray(currentPage?.rankingNotes)
                            ? currentPage.rankingNotes.find(
                                (entry) => entry.imageIndex === optionNumber
                              )
                            : null;
                          const rawScore = rankingEntry?.score;
                          const normalisedScore =
                            rawScore === null || rawScore === undefined
                              ? null
                              : Number(rawScore);
                          const scoreLabel = Number.isFinite(normalisedScore)
                            ? `${Math.round(normalisedScore)}/100`
                            : null;
                          const verdictLabel = rankingEntry?.verdict
                            ? rankingEntry.verdict.replace(/\b\w/g, (char) => char.toUpperCase())
                            : null;
                          const noteText = rankingEntry?.notes?.trim();
                          return (
                            <div
                              key={candidate.key || candidate.url || candidateKey}
                              className={`candidate-card flex flex-col gap-2 border ${
                                isSelected ? 'border-accent bg-accent/10' : 'border-border/40 bg-background'
                              } p-2 transition-colors hover:border-accent/70`}
                            >
                              <div className="relative aspect-[3/4] overflow-hidden bg-muted/30">
                                {candidateUrl ? (
                                  <img
                                    src={withCacheBust(candidateUrl, cacheKey)}
                                    alt={`Candidate ${optionNumber} for page ${pageLabel}`}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    decoding="async"
                                  />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-xs text-foreground/50">
                                    No preview
                                  </div>
                                )}
                                {isSelected ? (
                                  <div className="absolute inset-0 flex items-center justify-center bg-accent/25">
                                    <div className="bg-accent px-2 py-1 text-[10px] font-bold text-accent-foreground">
                                      SELECTED
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-foreground/70">
                                <span className="font-medium">#{optionNumber}</span>
                                {scoreLabel && <span>{scoreLabel}</span>}
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant={isSelected ? 'outline' : 'default'}
                                className="gap-1 h-8 text-xs"
                                onClick={() =>
                                  handleApplyCandidate(currentPage.order || pageLabel, optionNumber)
                                }
                                disabled={isSelected || isApplying}
                              >
                                {isApplying ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Applying…
                                  </>
                                ) : isSelected ? (
                                  'Current'
                                ) : (
                                  'Use this'
                                )}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-4 text-center text-sm text-foreground/60">
                      No alternate candidates stored for this page yet. Regenerate the page to
                      refresh options.
                    </div>
                  )
                ) : null}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex w-full max-w-md flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 bg-background/70 p-8 text-center text-sm text-foreground/60">
                <ImageOff className="h-8 w-8 text-foreground/40" />
                <p>Generate a storybook to preview its pages here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }, [
    activeAsset,
    activeAssetPages,
    activePageIndex,
    regeneratingOrder,
    isRegeneratingPdf,
    applyingCandidateKey,
    selectedBook?.name,
    handleRegeneratePage,
    handleRegeneratePdf,
    handleApplyCandidate,
  ]);

  if (loading) {
    return (
      <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 text-foreground/60">
        <BookOpen className="h-8 w-8 animate-spin text-foreground/40" />
        <p className="text-sm uppercase tracking-[0.2em] text-foreground/40">
          Loading books
        </p>
      </div>
    );
  }

  return (
    <>
      {renderAssetViewer()}
      <div className="space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Storybook Generator
            </h2>
            <p className="mt-1 text-sm text-foreground/60">
              Compose final PDFs using curated backgrounds, character art, and story text.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border/60 px-3 py-1 text-xs uppercase tracking-wide text-foreground/60">
            <PlugZap
              className={`h-4 w-4 ${
                isStreamConnected ? 'text-emerald-400' : 'text-amber-400'
              }`}
            />
            <span>
              {selectedBookId
                ? isStreamConnected
                  ? 'Live updates connected'
                  : 'Connecting to live updates…'
                : 'Select a book to start live updates'}
            </span>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select a book</CardTitle>
            <CardDescription>
              Choose a book to pull in its characters and page content.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="book">Book</Label>
              <Select
                value={selectedBookId}
                onValueChange={setSelectedBookId}
                disabled={!books.length}
              >
                <SelectTrigger id="book">
                  <SelectValue placeholder="Select a book" />
                </SelectTrigger>
                <SelectContent>
                  {books.map((book) => (
                    <SelectItem key={book._id} value={book._id}>
                      {book.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Storybook title</Label>
              <Input
                id="title"
                placeholder="My awesome story"
                value={storyTitle}
                onChange={(event) => setStoryTitle(event.target.value)}
                disabled={!selectedBook}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reader">Reader</Label>
              <Select
                value={selectedUserId || '__none'}
                onValueChange={(value) => setSelectedUserId(value === '__none' ? '' : value)}
                disabled={!users.length}
              >
                <SelectTrigger id="reader">
                  <SelectValue placeholder="Select a reader" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No reader</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user._id} value={user._id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-foreground/50">
                Replaces any {'{name}'} placeholders in the story text.
              </p>
            </div>
          </CardContent>
        </Card>
  
        {selectedBook && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Automate character generation</CardTitle>
                <CardDescription>
                  Generate four variations per page, rank them automatically, and update the book
                  with the best characters before building the PDF.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="training">Training model</Label>
                  <Select
                    value={selectedTrainingId || '__none'}
                    onValueChange={(value) =>
                      setSelectedTrainingId(value === '__none' ? '' : value)
                    }
                    disabled={!selectedUserId || !trainings.length}
                  >
                    <SelectTrigger id="training">
                      <SelectValue placeholder="Select a training" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Select training</SelectItem>
                      {trainings.map((training) => (
                        <SelectItem key={training._id} value={training._id}>
                          {training.modelName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!selectedUserId && (
                    <p className="text-xs text-foreground/50">
                      Pick a reader to load their successful trainings.
                    </p>
                  )}
                  {selectedUserId && !trainings.length && (
                    <p className="text-xs text-foreground/50">
                      No successful trainings found for this reader yet.
                    </p>
                  )}
                </div>
              <div className="space-y-2">
                <Label>Active run</Label>
                {activeJob ? (
                  (() => {
                    const statusMeta = getJobStatusMeta(activeJob.status);
                    return (
                      <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">
                            {activeJob.title || 'Storybook run'}
                          </span>
                          <span className="text-xs text-foreground/55">
                            Started {formatTimestamp(activeJob.createdAt)}
                          </span>
                        </div>
                        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                      </div>
                    );
                  })()
                ) : (
                  <div className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-sm text-foreground/55">
                    No automation in progress
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Estimated time remaining</Label>
                {activeJob ? (
                  <div className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm text-foreground/70">
                    <Clock className="h-4 w-4 text-foreground/40" />
                    <span>
                      {activeJob.estimatedSecondsRemaining
                        ? formatEta(activeJob.estimatedSecondsRemaining)
                        : 'Calculating…'}
                    </span>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border/60 px-3 py-2 text-sm text-foreground/55">
                    —
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-foreground/50 sm:max-w-md">
                Automation uses ranked image generation and Replicate webhooks to stream progress for
                each page. You&apos;ll see updates here as soon as images are ready.
              </div>
              <Button
                className="gap-2"
                onClick={handleStartAutomation}
                disabled={
                  !selectedBookId || !selectedUserId || !selectedTrainingId || isAutoGenerating
                }
              >
                {isAutoGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {isAutoGenerating ? 'Starting…' : 'Start automated run'}
              </Button>
            </CardFooter>
          </Card>
        </div>
        )}

        {selectedBook && storybookJobs.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  Recent automation runs
                </h3>
                <p className="text-sm text-foreground/55">
                  Live updates stream in as Replicate webhooks progress through each page.
                </p>
              </div>
              <p className="text-xs text-foreground/45">
                Showing up to {JOB_HISTORY_LIMIT} runs
              </p>
            </div>
            <div className="grid gap-4">
              {storybookJobs.map((job) => {
                const statusMeta = getJobStatusMeta(job.status);
                const progressValue = Math.max(0, Math.min(100, job.progress || 0));
                const recentEvents = Array.isArray(job.events) ? job.events.slice(-4).reverse() : [];
                return (
                  <Card key={job._id}>
                    <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-base text-foreground">
                          {job.title || 'Storybook run'}
                        </CardTitle>
                        <CardDescription>
                          Started {formatTimestamp(job.createdAt)} &middot; {job.pages.length} pages
                        </CardDescription>
                      </div>
                      <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-foreground/55">
                          <span>Progress</span>
                          <span>
                            {Math.round(progressValue)}%
                            {job.estimatedSecondsRemaining
                              ? ` • ETA ${formatEta(job.estimatedSecondsRemaining)}`
                              : ''}
                          </span>
                        </div>
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${
                              job.status === 'failed'
                                ? 'bg-red-400'
                                : job.status === 'succeeded'
                                ? 'bg-emerald-400'
                                : 'bg-primary'
                            } transition-all`}
                            style={{ width: `${progressValue}%` }}
                          />
                        </div>
                      </div>
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">Pages</h4>
                          <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-2">
                            {Array.isArray(job.pages) && job.pages.length ? (
                              job.pages.map((page) => {
                                const meta = getPageStatusMeta(page.status);
                                return (
                                  <div
                                    key={`${job._id}-${page.pageId || page.order}`}
                                    className="flex items-center justify-between rounded border border-border/50 bg-card/40 px-3 py-2"
                                  >
                                    <div>
                                      <p className="text-sm font-medium text-foreground">
                                        Page {page.order}
                                      </p>
                                      <p className="text-xs text-foreground/55">
                                        {page.prompt?.slice(0, 80) || 'No prompt'}
                                      </p>
                                    </div>
                                    <div className="text-right">
                                      <p className={`text-xs font-semibold ${meta.tone}`}>
                                        {meta.label}
                                      </p>
                                      <p className="text-xs text-foreground/50">
                                        {Math.round(page.progress || 0)}%
                                      </p>
                                    </div>
                                  </div>
                                );
                              })
                            ) : (
                              <div className="rounded border border-dashed border-border/60 px-3 py-2 text-sm text-foreground/55">
                                No page activity yet
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">Recent activity</h4>
                          <div className="mt-2 space-y-2">
                            {recentEvents.length ? (
                              recentEvents.map((event, idx) => (
                                <div
                                  key={`${job._id}-event-${idx}`}
                                  className="rounded border border-border/50 bg-card/40 px-3 py-2 text-sm text-foreground/70"
                                >
                                  <p className="font-medium text-foreground">
                                    {event.message || event.type}
                                  </p>
                                  <p className="text-xs text-foreground/55">
                                    {formatTimestamp(event.timestamp)}
                                  </p>
                                </div>
                              ))
                            ) : (
                              <div className="rounded border border-dashed border-border/60 px-3 py-2 text-sm text-foreground/55">
                                Waiting for webhook updates
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {job.status === 'failed' && job.error && (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{job.error}</span>
                        </div>
                      )}
                      {job.status === 'succeeded' && job.pdfAsset && (
                        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                          Completed • {job.pdfAsset.pageCount} pages • Added to storybook library
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
  
        {loadingBook && (
          <div className="flex min-h-[30vh] items-center justify-center text-foreground/55">
            Loading book details...
          </div>
        )}
  
        {!loadingBook && selectedBook && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-xl text-foreground">
                    {selectedBook.name}
                  </CardTitle>
                  <CardDescription>
                    {selectedBook.description || 'No description provided.'}
                  </CardDescription>
                </div>
                <div className="flex gap-2 text-xs text-foreground/55">
                  <span>{totalPages} pages</span>
                  <span>{totalStorybooks} storybooks</span>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {selectedBook.coverImage?.url ? (
                  <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
                    <img
                      src={selectedBook.coverImage.url}
                      alt="Cover"
                      className="h-56 w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/30 text-foreground/40">
                    <ImageOff className="h-8 w-8" />
                  </div>
                )}
                <div className="space-y-3 text-sm text-foreground/60">
                  <p>
                    Fine-tune the narration, set background art, and export a polished PDF ready for sharing.
                  </p>
                  <p>
                    Page backgrounds come from the book setup, so you only need to supply the character art for each reader.
                  </p>
                </div>
              </CardContent>
            </Card>
  
            <Card>
              <CardHeader>
                <CardTitle>Configure pages</CardTitle>
                <CardDescription>
                  Update narration and provide character art overlays for each page.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {pages.map((page, index) => (
                  <div
                    key={page.id || index}
                    className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-subtle"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground/80">
                          Page {page.order}
                        </p>
                        <p className="text-xs text-foreground/50">
                          Character {page.useCharacter ? 'enabled' : 'disabled'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="inline-flex items-center gap-2 text-xs text-foreground/60">
                          <input
                            type="checkbox"
                            checked={page.useCharacter}
                            onChange={(event) =>
                              updatePage(index, { useCharacter: event.target.checked })
                            }
                            className="h-4 w-4 rounded border-border bg-background text-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                          />
                          Show character art
                        </label>
                        <Select
                          value={page.characterPosition}
                          onValueChange={(value) => updatePage(index, { characterPosition: value })}
                        >
                          <SelectTrigger className="h-9 w-[160px] text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CHARACTER_POSITION_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
  
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div className="space-y-3">
                        <Label className="text-xs uppercase tracking-wide text-foreground/60">
                          Page text
                        </Label>
                        <Textarea
                          value={page.text}
                          onChange={(event) => updatePage(index, { text: event.target.value })}
                          rows={6}
                          className="resize-none"
                        />
                        {selectedReader?.name && containsNamePlaceholder(page.text) ? (
                          <p className="text-xs text-foreground/50">
                            Preview with {selectedReader.name}:{' '}
                            {replaceNamePlaceholders(page.text, selectedReader.name)}
                          </p>
                        ) : null}
                      </div>
  
                      <div className="space-y-4">
                        <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-xs text-foreground/60">
                          <p className="font-medium uppercase tracking-wide text-foreground/55">
                            Background (from book)
                          </p>
                          {page.backgroundImageUrl ? (
                            <img
                              src={page.backgroundImageUrl}
                              alt={`Background for page ${page.order}`}
                              className="mt-3 h-40 w-full rounded-lg object-cover"
                            />
                          ) : (
                            <div className="mt-3 flex h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-card/60 text-foreground/45">
                              <ImageOff className="h-6 w-6" />
                              <span className="text-xs">No background stored for this page.</span>
                            </div>
                          )}
                          <p className="mt-3 text-[11px] text-foreground/50">
                            Backgrounds are fixed per book. Update them in the Books section if needed.
                          </p>
                        </div>
  
                        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
                          <div className="mb-3 flex items-center justify-between text-xs text-foreground/60">
                            <span className="font-medium uppercase tracking-wide">
                              Character overlay
                            </span>
                            <div className="flex items-center gap-2">
                              {page.characterPreview || page.characterUrl ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-xs text-foreground/60"
                                  onClick={() => clearCharacterSelection(index)}
                                >
                                  Clear
                                </Button>
                              ) : null}
                              <label className="flex cursor-pointer items-center gap-2 text-xs text-accent">
                                <Upload className="h-3.5 w-3.5" />
                                Upload
                                <Input
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp"
                                  className="hidden"
                                  onChange={(event) => handleCharacterFileChange(index, event)}
                                />
                              </label>
                            </div>
                          </div>
                          {page.prompt ? (
                            <div className="mb-3 rounded-lg border border-border/50 bg-background/60 p-3 text-left">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
                                Saved prompt
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/65">
                                {page.prompt}
                              </p>
                            </div>
                          ) : null}
                          {page.characterPreview || page.characterUrl ? (
                            <img
                              src={page.characterPreview || page.characterUrl}
                              alt={`Character overlay for page ${page.order}`}
                              className="h-32 w-full rounded-lg object-cover"
                            />
                          ) : (
                            <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-card/60 text-foreground/45">
                              <ImageIcon className="h-6 w-6" />
                              <span className="text-xs">No character image selected</span>
                            </div>
                          )}
                          <div className="mt-3 space-y-2">
                            <Label className="text-xs uppercase tracking-wide text-foreground/55">
                              Or use image URL
                            </Label>
                            <Input
                              placeholder="https://..."
                              value={page.characterUrl}
                              onChange={(event) => handleCharacterUrlChange(index, event.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
              <CardFooter className="flex items-center justify-end border-t border-border/60 bg-card/60 py-4">
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !pages.length}
                  className="gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <BookOpen className="h-4 w-4" />
                      Generate storybook
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
  
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Generated storybooks</CardTitle>
                  <CardDescription>
                    Download finished PDFs or re-run the generator after updating imagery.
                  </CardDescription>
                </div>
                <Badge variant="outline">{totalStorybooks} ready</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedBook?.pdfAssets?.length ? (
                  selectedBook.pdfAssets
                    .slice()
                    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                    .map((asset) => (
                      <div
                        key={asset._id || asset.key}
                        className="rounded-xl border border-border/70 bg-card/70 p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-semibold text-foreground/85">
                              {asset.title || 'Storybook'}
                            </p>
                            <p className="text-xs text-foreground/50">
                              {asset.pageCount || pages.length} pages ·{' '}
                              {asset.size ? `${(asset.size / 1024 / 1024).toFixed(2)} MB` : 'Size unknown'}
                            </p>
                            <p className="text-xs text-foreground/45">
                              Generated {asset.createdAt ? new Date(asset.createdAt).toLocaleString() : 'recently'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => handleOpenAssetViewer(asset)}
                            >
                              <Eye className="h-4 w-4" />
                              View pages
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="gap-1"
                              onClick={() => window.open(asset.url, '_blank')}
                            >
                              <Download className="h-4 w-4" />
                              Download PDF
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 p-6 text-center text-sm text-foreground/55">
                    No storybooks yet. Configure your pages above and generate a PDF to see it here.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

export default Storybooks;
