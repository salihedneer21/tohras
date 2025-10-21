import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  RefreshCcw,
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
        setSelectedBook(book);
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
        const nextAssets = job.pdfAsset && !alreadyPresent ? [job.pdfAsset, ...existingAssets] : existingAssets;
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

  const totalPages = useMemo(() => pages.length, [pages]);
  const totalStorybooks = selectedBook?.pdfAssets?.length || 0;
  const activeJob = useMemo(
    () =>
      storybookJobs.find((job) =>
        ['queued', 'generating', 'assembling'].includes(job.status)
      ) || null,
    [storybookJobs]
  );

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
        const updatedAssets = [...(prev.pdfAssets || []), response.data];
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
    const signed = typeof asset.signedUrl === 'string' ? asset.signedUrl.trim() : '';
    if (signed) return signed;
    const direct = typeof asset.url === 'string' ? asset.url.trim() : '';
    return direct;
  };

  const handleOpenAssetViewer = (asset) => {
    if (!asset) return;
    const assetSnapshot = JSON.parse(JSON.stringify(asset));
    const assetPages =
      Array.isArray(assetSnapshot.pages) && assetSnapshot.pages.length
        ? assetSnapshot.pages
        : null;

    const fallbackPages =
      assetPages && assetPages.length
        ? assetPages
        : (selectedBook?.pages || []).map((page) => ({
            order: page.order,
            text: page.text || '',
            quote: page.quote || '',
            background: page.backgroundImage
              ? JSON.parse(JSON.stringify(page.backgroundImage))
              : null,
            character: page.characterImage
              ? JSON.parse(JSON.stringify(page.characterImage))
              : null,
            rankingSummary: page.rankingSummary || '',
            rankingNotes: Array.isArray(page.rankingNotes) ? page.rankingNotes : [],
            updatedAt: page.updatedAt || new Date().toISOString(),
          }));

    setActiveAsset(assetSnapshot);
    setActiveAssetPages(fallbackPages);
    setActivePageIndex(0);
  };

  const handleCloseAssetViewer = () => {
    setActiveAsset(null);
    setActiveAssetPages([]);
    setActivePageIndex(0);
    setRegeneratingOrder(null);
  };

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
          if (!Array.isArray(prev) || !prev.length) {
            return [pdfAssetPage];
          }
          const existingIndex = prev.findIndex((entry) => entry.order === pdfAssetPage.order);
          if (existingIndex === -1) {
            return [...prev, pdfAssetPage];
          }
          const next = [...prev];
          next[existingIndex] = { ...next[existingIndex], ...pdfAssetPage };
          return next;
        });

        setActiveAsset((prev) => {
          if (!prev) return prev;
          const nextPages = Array.isArray(prev.pages)
            ? prev.pages.map((entry) =>
                entry.order === pdfAssetPage.order ? { ...entry, ...pdfAssetPage } : entry
              )
            : prev.pages;
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
                updatedAsset.pages = assetPages;
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
      toast.success('Page regenerated. Regenerate the PDF to export the latest changes.');
    } catch (error) {
      toast.error(`Failed to regenerate page: ${error.message}`);
    } finally {
      setRegeneratingOrder(null);
    }
  };

  const renderAssetViewer = () => {
    if (!activeAsset) return null;

    const hasPages = Array.isArray(activeAssetPages) && activeAssetPages.length > 0;
    const safeIndex = hasPages
      ? activePageIndex >= activeAssetPages.length
        ? activeAssetPages.length - 1
        : Math.max(0, activePageIndex)
      : 0;
    const currentPage = hasPages ? activeAssetPages[safeIndex] || null : null;
    const isCharacterOnRight = safeIndex % 2 === 0;
    const backgroundUrl = resolveAssetUrl(currentPage?.background);
    const characterUrl = resolveAssetUrl(currentPage?.character);
    const rankingNotes = Array.isArray(currentPage?.rankingNotes)
      ? currentPage.rankingNotes
      : [];
    const canNavigatePrev = hasPages && safeIndex > 0;
    const canNavigateNext = hasPages && safeIndex < activeAssetPages.length - 1;
    const isCurrentPageRegenerating =
      currentPage?.order !== undefined && regeneratingOrder === currentPage.order;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
        <div className="relative flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-background shadow-2xl">
          <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-foreground/45">Storybook preview</p>
              <h3 className="text-lg font-semibold text-foreground">
                {activeAsset.title || selectedBook?.name || 'Storybook'}
                {hasPages
                  ? ` · Page ${currentPage?.order || safeIndex + 1}`
                  : ' · No page snapshots yet'}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() => setActivePageIndex((prev) => Math.max(0, prev - 1))}
                disabled={!canNavigatePrev}
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </Button>
              <span className="text-sm font-medium text-foreground/60">
                {hasPages ? `${safeIndex + 1} / ${activeAssetPages.length}` : '0 / 0'}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1"
                onClick={() =>
                  setActivePageIndex((prev) =>
                    prev + 1 >= activeAssetPages.length ? prev : prev + 1
                  )
                }
                disabled={!canNavigateNext}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
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

          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-6 lg:flex-row">
            <div className="relative flex-1 overflow-hidden rounded-2xl bg-muted">
              {hasPages ? (
                backgroundUrl ? (
                  <img
                    src={backgroundUrl}
                    alt={`Background for page ${currentPage?.order || safeIndex + 1}`}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-foreground/50">
                    No background image for this page
                  </div>
                )
              ) : (
                <div className="flex h-full w-full items-center justify-center text-sm text-foreground/50">
                  Generate this storybook to preview page layouts.
                </div>
              )}
              {hasPages && characterUrl ? (
                <img
                  src={characterUrl}
                  alt={`Character for page ${currentPage?.order || safeIndex + 1}`}
                  className={`absolute bottom-0 ${
                    isCharacterOnRight ? 'right-6' : 'left-6'
                  } w-[34%] max-w-sm object-contain drop-shadow-xl`}
                />
              ) : null}
              {hasPages ? (
                <div
                  className={`absolute top-10 ${
                    isCharacterOnRight ? 'left-10' : 'right-10'
                  } max-w-sm rounded-3xl bg-white/80 p-5 text-sm text-foreground shadow-lg backdrop-blur`}
                >
                  <p className="whitespace-pre-line leading-relaxed">
                    {currentPage?.text || 'No story text on this page yet.'}
                  </p>
                </div>
              ) : null}
              {hasPages && currentPage?.quote ? (
                <div
                  className={`absolute bottom-10 ${
                    isCharacterOnRight ? 'left-10' : 'right-10'
                  } max-w-xs rounded-2xl bg-white/70 px-4 py-3 text-sm font-medium italic text-foreground/80`}
                >
                  “{currentPage.quote}”
                </div>
              ) : null}
            </div>
            <div className="flex w-full max-w-md flex-col gap-4">
              <div className="rounded-xl border border-border/60 bg-card/70 p-4">
                <h4 className="text-sm font-semibold text-foreground">Ranking summary</h4>
                <p className="mt-2 text-sm text-foreground/70">
                  {hasPages
                    ? currentPage?.rankingSummary || 'No ranking summary available.'
                    : 'Generate this storybook to view ranking insights once pages are available.'}
                </p>
                {hasPages && rankingNotes.length ? (
                  <ul className="mt-3 space-y-2 text-sm text-foreground/70">
                    {rankingNotes.map((note, index) => (
                      <li
                        key={`ranking-note-${note?.imageIndex || index}`}
                        className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2"
                      >
                        <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-foreground/45">
                          <span>Image {note?.imageIndex || index + 1}</span>
                          {note?.score !== undefined && note?.score !== null ? (
                            <span>{note.score}</span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm text-foreground/70">
                          {note?.notes || 'No reviewer notes recorded.'}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="rounded-xl border border-border/60 bg-card/70 p-4 text-sm text-foreground/70">
                <p>
                  {hasPages
                    ? 'Regenerate to produce a fresh ranked batch for this page. The book updates with the new winning image—remember to generate a new PDF when you\'re ready to export.'
                    : 'Run the automated generator to create ranked imagery before previewing pages here.'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border/60 bg-card/70 px-6 py-4">
            <div className="text-sm text-foreground/60">
              Reader: {activeAsset.readerName || 'Unknown'} · Training:{' '}
              {activeAsset.trainingName || activeAsset.trainingId || 'Unknown'}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                className="gap-2"
                onClick={() => currentPage && handleRegeneratePage(currentPage.order)}
                disabled={
                  !currentPage || !activeAsset.trainingId || isCurrentPageRegenerating
                }
              >
                {isCurrentPageRegenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Regenerating…
                  </>
                ) : (
                  <>
                    <RefreshCcw className="h-4 w-4" />
                    Regenerate best image
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

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
