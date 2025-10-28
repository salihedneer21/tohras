import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  BookOpen,
  Plus,
  Loader2,
  Image as ImageIcon,
  Pencil,
  Trash2,
  Layers,
  ArrowUp,
  ArrowDown,
  Ban,
  CheckCircle2,
} from 'lucide-react';
import { bookAPI } from '@/services/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import ImageViewer from '@/components/ImageViewer';
import { formatFileSize } from '@/utils/file';

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'both', label: 'Both' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const defaultCoverConfig = () => ({
  headline: '',
  footer: '',
  bodyOverride: '',
  uppercaseName: true,
});

const createEmptyPage = () => ({
  id: null,
  pageType: 'story',
  text: '',
  prompt: '',
  file: null,
  preview: null,
  previewIsObject: false,
  existingImage: null,
  removeImage: false,
  cover: defaultCoverConfig(),
  qr: {
    existing: null,
    file: null,
    preview: null,
    previewIsObject: false,
    remove: false,
  },
});

const createEmptyBookForm = () => ({
  name: '',
  description: '',
  gender: 'both',
  status: 'active',
  cover: {
    existing: null,
    file: null,
    preview: null,
    previewIsObject: false,
    action: 'remove',
  },
  pages: [createEmptyPage()],
  coverPage: {
    backgroundImage: {
      existing: null,
      file: null,
      preview: null,
      previewIsObject: false,
      remove: false,
    },
    characterImage: {
      existing: null,
      file: null,
      preview: null,
      previewIsObject: false,
      remove: false,
    },
    leftSide: {
      title: '',
      content: '',
      bottomText: '',
    },
    qrCode: {
      existing: null,
      file: null,
      preview: null,
      previewIsObject: false,
      remove: false,
    },
    rightSide: {
      mainTitle: '',
      subtitle: '',
    },
  },
});

const revokeIfNeeded = (preview, isObjectUrl) => {
  if (isObjectUrl && preview) {
    URL.revokeObjectURL(preview);
  }
};

function Books() {
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState('create');
  const [formState, setFormState] = useState(createEmptyBookForm);
  const [editingBook, setEditingBook] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [viewerImage, setViewerImage] = useState(null);
  const [activeTab, setActiveTab] = useState('story-pages');
  const [coverPreview, setCoverPreview] = useState(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);

  useEffect(() => {
    fetchBooks();
  }, []);

  const totalPages = useMemo(
    () => books.reduce((sum, book) => sum + (book.pages?.length || 0), 0),
    [books]
  );

  const fetchBooks = async (withSpinner = true) => {
    try {
      if (withSpinner) setLoading(true);
      const response = await bookAPI.getAll();
      setBooks(response.data);
    } catch (error) {
      toast.error(`Failed to fetch books: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = useCallback(() => {
    revokeIfNeeded(formState.cover.preview, formState.cover.previewIsObject);
    formState.pages.forEach((page) => {
      revokeIfNeeded(page.preview, page.previewIsObject);
      if (page.qr) {
        revokeIfNeeded(page.qr.preview, page.qr.previewIsObject);
      }
    });
    // Revoke cover page image URLs
    if (formState.coverPage) {
      revokeIfNeeded(formState.coverPage.backgroundImage?.preview, formState.coverPage.backgroundImage?.previewIsObject);
      revokeIfNeeded(formState.coverPage.characterImage?.preview, formState.coverPage.characterImage?.previewIsObject);
      revokeIfNeeded(formState.coverPage.qrCode?.preview, formState.coverPage.qrCode?.previewIsObject);
    }
    setFormState(createEmptyBookForm());
    setEditingBook(null);
    setFormMode('create');
    setShowForm(false);
    setIsSaving(false);
    setActiveTab('story-pages');
  }, [formState.cover, formState.pages, formState.coverPage]);

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (book) => {
    revokeIfNeeded(formState.cover.preview, formState.cover.previewIsObject);
    formState.pages.forEach((page) => {
      revokeIfNeeded(page.preview, page.previewIsObject);
      if (page.qr) {
        revokeIfNeeded(page.qr.preview, page.qr.previewIsObject);
      }
    });

    const sortedPages = [...(book.pages || [])].sort(
      (a, b) => (a.order || 0) - (b.order || 0)
    );

    setFormState({
      name: book.name || '',
      description: book.description || '',
      gender: book.gender || 'both',
      status: book.status || 'active',
      cover: {
        existing: book.coverImage || null,
        file: null,
        preview: book.coverImage?.url || null,
        previewIsObject: false,
        action: 'keep',
      },
      pages:
        sortedPages.length > 0
          ? sortedPages.map((page) => {
              const pageType = page.pageType === 'cover' ? 'cover' : 'story';
              const coverConfig = page.cover || null;
              const qrAsset = coverConfig?.qrCodeImage || null;
              const resolveAssetUrl = (asset) =>
                asset?.url || asset?.downloadUrl || asset?.signedUrl || null;
              return {
                id: page._id || null,
                pageType,
                text: page.text || '',
                prompt: page.characterPrompt || page.prompt || '',
                file: null,
                preview: page.backgroundImage?.url || page.characterImage?.url || null,
                previewIsObject: false,
                existingImage: page.backgroundImage || page.characterImage || null,
                removeImage: false,
                cover: {
                  headline: coverConfig?.headline || '',
                  footer: coverConfig?.footer || '',
                  bodyOverride: coverConfig?.bodyOverride || '',
                  uppercaseName:
                    typeof coverConfig?.uppercaseName === 'boolean'
                      ? coverConfig.uppercaseName
                      : true,
                },
                qr: {
                  existing: qrAsset,
                  file: null,
                  preview: resolveAssetUrl(qrAsset),
                  previewIsObject: false,
                  remove: false,
                },
              };
            })
          : [createEmptyPage()],
      coverPage: {
        backgroundImage: {
          existing: book.coverPage?.backgroundImage || null,
          file: null,
          preview: book.coverPage?.backgroundImage?.url || null,
          previewIsObject: false,
          remove: false,
        },
        characterImage: {
          existing: book.coverPage?.characterImage || null,
          file: null,
          preview: book.coverPage?.characterImage?.url || null,
          previewIsObject: false,
          remove: false,
        },
        leftSide: {
          title: book.coverPage?.leftSide?.title || '',
          content: book.coverPage?.leftSide?.content || '',
          bottomText: book.coverPage?.leftSide?.bottomText || '',
        },
        qrCode: {
          existing: book.coverPage?.qrCode || null,
          file: null,
          preview: book.coverPage?.qrCode?.url || null,
          previewIsObject: false,
          remove: false,
        },
        rightSide: {
          mainTitle: book.coverPage?.rightSide?.mainTitle || '',
          subtitle: book.coverPage?.rightSide?.subtitle || '',
        },
      },
    });

    setEditingBook(book);
    setFormMode('edit');
    setShowForm(true);
  };

  const handleCoverChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    revokeIfNeeded(formState.cover.preview, formState.cover.previewIsObject);

    const preview = URL.createObjectURL(file);
    setFormState((prev) => ({
      ...prev,
      cover: {
        existing: prev.cover.existing,
        file,
        preview,
        previewIsObject: true,
        action: 'replace',
      },
    }));
  };

  const handleCoverRemove = () => {
    revokeIfNeeded(formState.cover.preview, formState.cover.previewIsObject);
    setFormState((prev) => ({
      ...prev,
      cover: {
        existing: prev.cover.existing,
        file: null,
        preview: null,
        previewIsObject: false,
        action: prev.cover.existing ? 'remove' : 'remove',
      },
    }));
  };

  const handleAddPage = () => {
    setFormState((prev) => ({
      ...prev,
      pages: [...prev.pages, createEmptyPage()],
    }));
  };

  const handleRemovePage = (index) => {
    setFormState((prev) => {
      const nextPages = [...prev.pages];
      const [removed] = nextPages.splice(index, 1);
      if (!nextPages.length) {
        nextPages.push(createEmptyPage());
      }
      revokeIfNeeded(removed.preview, removed.previewIsObject);
      if (removed.qr) {
        revokeIfNeeded(removed.qr.preview, removed.qr.previewIsObject);
      }
      return {
        ...prev,
        pages: nextPages,
      };
    });
  };

  const handleMovePage = (index, direction) => {
    setFormState((prev) => {
      const nextPages = [...prev.pages];
      const swapIndex = direction === 'up' ? index - 1 : index + 1;
      if (swapIndex < 0 || swapIndex >= nextPages.length) return prev;
      [nextPages[index], nextPages[swapIndex]] = [
        nextPages[swapIndex],
        nextPages[index],
      ];
      return { ...prev, pages: nextPages };
    });
  };

  const handlePageTextChange = (index, value) => {
    setFormState((prev) => {
      const nextPages = [...prev.pages];
      nextPages[index] = { ...nextPages[index], text: value };
      return { ...prev, pages: nextPages };
    });
  };

const handlePagePromptChange = (index, value) => {
  setFormState((prev) => {
    const nextPages = [...prev.pages];
    nextPages[index] = { ...nextPages[index], prompt: value };
    return { ...prev, pages: nextPages };
  });
};

const updatePageCover = (index, updates) => {
  setFormState((prev) => {
    const nextPages = [...prev.pages];
    const current = nextPages[index];
    if (!current) return prev;
    const nextCover = {
      ...defaultCoverConfig(),
      ...(current.cover || {}),
      ...updates,
    };
    nextPages[index] = {
      ...current,
      cover: nextCover,
    };
    return { ...prev, pages: nextPages };
  });
};

const handlePageTypeChange = (index, value) => {
  setFormState((prev) => {
    const nextPages = [...prev.pages];
    const current = nextPages[index];
    if (!current) return prev;
    const nextType = value === 'cover' ? 'cover' : 'story';
    if (nextType === 'story') {
      if (current.qr) {
        revokeIfNeeded(current.qr.preview, current.qr.previewIsObject);
      }
      nextPages[index] = {
        ...current,
        pageType: nextType,
        cover: defaultCoverConfig(),
        qr: {
          existing: null,
          file: null,
          preview: null,
          previewIsObject: false,
          remove: false,
        },
      };
    } else {
      nextPages[index] = {
        ...current,
        pageType: nextType,
        cover: current.cover || defaultCoverConfig(),
        qr: current.qr || {
          existing: null,
          file: null,
          preview: null,
          previewIsObject: false,
          remove: false,
        },
      };
    }
    return { ...prev, pages: nextPages };
  });
};

const handleCoverHeadlineChange = (index, value) => {
  updatePageCover(index, { headline: value });
};

const handleCoverFooterChange = (index, value) => {
  updatePageCover(index, { footer: value });
};

const handleCoverBodyOverrideChange = (index, value) => {
  updatePageCover(index, { bodyOverride: value });
};

const handleCoverUppercaseChange = (index, value) => {
  updatePageCover(index, { uppercaseName: value });
};

const handleCoverQrChange = (index, event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  setFormState((prev) => {
    const nextPages = [...prev.pages];
    const current = nextPages[index];
    if (!current) return prev;
    const nextQr = { ...(current.qr || {}) };
    revokeIfNeeded(nextQr.preview, nextQr.previewIsObject);
    nextQr.file = file;
    nextQr.preview = URL.createObjectURL(file);
    nextQr.previewIsObject = true;
    nextQr.remove = false;
    nextPages[index] = {
      ...current,
      qr: nextQr,
    };
    return { ...prev, pages: nextPages };
  });
};

const handleRemoveCoverQr = (index) => {
  setFormState((prev) => {
    const nextPages = [...prev.pages];
    const current = nextPages[index];
    if (!current) return prev;
    const nextQr = { ...(current.qr || {}) };
    revokeIfNeeded(nextQr.preview, nextQr.previewIsObject);
    nextQr.file = null;
    nextQr.preview = null;
    nextQr.previewIsObject = false;
    nextQr.remove = Boolean(nextQr.existing);
    nextPages[index] = {
      ...current,
      qr: nextQr,
    };
    return { ...prev, pages: nextPages };
  });
};

const handlePageImageChange = (index, event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  setFormState((prev) => {
    const nextPages = [...prev.pages];
    const current = nextPages[index];
    revokeIfNeeded(current.preview, current.previewIsObject);
    const preview = URL.createObjectURL(file);
    nextPages[index] = {
      ...current,
      file,
      preview,
      previewIsObject: true,
      removeImage: false,
    };
    return { ...prev, pages: nextPages };
  });
};

const handleRemovePageImage = (index) => {
  setFormState((prev) => {
    const nextPages = [...prev.pages];
    const current = nextPages[index];
    revokeIfNeeded(current.preview, current.previewIsObject);
    nextPages[index] = {
      ...current,
      file: null,
      preview: null,
      previewIsObject: false,
      removeImage: Boolean(current.existingImage),
    };
    return { ...prev, pages: nextPages };
  });
};

  // Cover Page handlers
  const handleCoverPageBgChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFormState((prev) => {
      const nextCoverPage = { ...prev.coverPage };
      revokeIfNeeded(nextCoverPage.backgroundImage.preview, nextCoverPage.backgroundImage.previewIsObject);

      nextCoverPage.backgroundImage = {
        ...nextCoverPage.backgroundImage,
        file,
        preview: URL.createObjectURL(file),
        previewIsObject: true,
        remove: false,
      };

      return { ...prev, coverPage: nextCoverPage };
    });
  };

  const handleRemoveCoverPageBg = () => {
    setFormState((prev) => {
      const nextCoverPage = { ...prev.coverPage };
      revokeIfNeeded(nextCoverPage.backgroundImage.preview, nextCoverPage.backgroundImage.previewIsObject);

      nextCoverPage.backgroundImage = {
        existing: nextCoverPage.backgroundImage.existing,
        file: null,
        preview: null,
        previewIsObject: false,
        remove: Boolean(nextCoverPage.backgroundImage.existing),
      };

      return { ...prev, coverPage: nextCoverPage };
    });
  };

  const handleCoverPageCharacterChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFormState((prev) => {
      const nextCoverPage = { ...prev.coverPage };
      revokeIfNeeded(nextCoverPage.characterImage.preview, nextCoverPage.characterImage.previewIsObject);

      nextCoverPage.characterImage = {
        ...nextCoverPage.characterImage,
        file,
        preview: URL.createObjectURL(file),
        previewIsObject: true,
        remove: false,
      };

      return { ...prev, coverPage: nextCoverPage };
    });
  };

  const handleRemoveCoverPageCharacter = () => {
    setFormState((prev) => {
      const nextCoverPage = { ...prev.coverPage };
      revokeIfNeeded(nextCoverPage.characterImage.preview, nextCoverPage.characterImage.previewIsObject);

      nextCoverPage.characterImage = {
        existing: nextCoverPage.characterImage.existing,
        file: null,
        preview: null,
        previewIsObject: false,
        remove: Boolean(nextCoverPage.characterImage.existing),
      };

      return { ...prev, coverPage: nextCoverPage };
    });
  };

  const handleCoverPageQrChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFormState((prev) => {
      const nextCoverPage = { ...prev.coverPage };
      revokeIfNeeded(nextCoverPage.qrCode.preview, nextCoverPage.qrCode.previewIsObject);

      nextCoverPage.qrCode = {
        ...nextCoverPage.qrCode,
        file,
        preview: URL.createObjectURL(file),
        previewIsObject: true,
        remove: false,
      };

      return { ...prev, coverPage: nextCoverPage };
    });
  };

  const handleRemoveCoverPageQr = () => {
    setFormState((prev) => {
      const nextCoverPage = { ...prev.coverPage };
      revokeIfNeeded(nextCoverPage.qrCode.preview, nextCoverPage.qrCode.previewIsObject);

      nextCoverPage.qrCode = {
        existing: nextCoverPage.qrCode.existing,
        file: null,
        preview: null,
        previewIsObject: false,
        remove: Boolean(nextCoverPage.qrCode.existing),
      };

      return { ...prev, coverPage: nextCoverPage };
    });
  };

  const handleCoverPageFieldChange = (section, field, value) => {
    setFormState((prev) => ({
      ...prev,
      coverPage: {
        ...prev.coverPage,
        [section]: {
          ...prev.coverPage[section],
          [field]: value,
        },
      },
    }));
  };

  const handleGeneratePreview = async () => {
    // Validate required fields
    if (!formState.coverPage.backgroundImage.preview) {
      toast.error('Please upload a background image first');
      return;
    }

    const hasLeftContent =
      formState.coverPage.leftSide.title ||
      formState.coverPage.leftSide.content;
    const hasRightContent = formState.coverPage.rightSide.mainTitle;

    if (!hasLeftContent && !hasRightContent) {
      toast.error('Please fill in at least some text fields');
      return;
    }

    setIsGeneratingPreview(true);

    try {
      const formData = new FormData();

      // Add cover page data
      formData.append('leftSide', JSON.stringify({
        title: formState.coverPage.leftSide.title || '',
        content: formState.coverPage.leftSide.content || '',
        bottomText: formState.coverPage.leftSide.bottomText || '',
      }));
      formData.append('rightSide', JSON.stringify({
        mainTitle: formState.coverPage.rightSide.mainTitle || '',
        subtitle: formState.coverPage.rightSide.subtitle || '',
      }));

      // Add background image
      if (formState.coverPage.backgroundImage.file) {
        formData.append('backgroundImage', formState.coverPage.backgroundImage.file);
      } else if (formState.coverPage.backgroundImage.existing?.url) {
        formData.append('backgroundImageUrl', formState.coverPage.backgroundImage.existing.url);
      }

      // Add character image
      if (formState.coverPage.characterImage.file) {
        formData.append('characterImage', formState.coverPage.characterImage.file);
      } else if (formState.coverPage.characterImage.existing?.url) {
        formData.append('characterImageUrl', formState.coverPage.characterImage.existing.url);
      }

      // Add QR code if present
      if (formState.coverPage.qrCode.file) {
        formData.append('qrCode', formState.coverPage.qrCode.file);
      } else if (formState.coverPage.qrCode.existing?.url) {
        formData.append('qrCodeUrl', formState.coverPage.qrCode.existing.url);
      }

      // Call API to generate preview
      const response = await bookAPI.generateCoverPreview(formData);

      if (response.data?.previewUrl) {
        setCoverPreview(response.data.previewUrl);
        toast.success('Preview generated successfully!');
      }
    } catch (error) {
      toast.error(`Failed to generate preview: ${error.message}`);
      console.error('Preview generation error:', error);
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSaving) return;

    if (!formState.name.trim()) {
      toast.error('Book name is required');
      return;
    }

    const shouldIncludePage = (page) => {
      const hasText = page.text?.trim?.();
      const hasPrompt = page.prompt?.trim?.();
      const hasBackground = page.file || page.existingImage;
      const hasCoverInputs =
        page.pageType === 'cover' &&
        (page.cover?.headline?.trim?.() ||
          page.cover?.bodyOverride?.trim?.() ||
          page.cover?.footer?.trim?.());
      const hasQr =
        page.pageType === 'cover' && (page.qr?.file || page.qr?.existing);
      return (
        hasText ||
        hasPrompt ||
        hasBackground ||
        hasCoverInputs ||
        hasQr ||
        page.pageType === 'cover'
      );
    };

    const pagesPayload = [];
    const pageImageFiles = [];
    const pageQrFiles = [];

    for (let idx = 0; idx < formState.pages.length; idx += 1) {
      const page = formState.pages[idx];
      if (!shouldIncludePage(page)) {
        continue;
      }

      const coverConfig =
        page.pageType === 'cover'
          ? {
              headline: page.cover?.headline?.trim?.() || '',
              footer: page.cover?.footer?.trim?.() || '',
              bodyOverride: page.cover?.bodyOverride?.trim?.() || '',
              uppercaseName:
                typeof page.cover?.uppercaseName === 'boolean'
                  ? page.cover.uppercaseName
                  : true,
            }
          : null;

      pagesPayload.push({
        id: page.id,
        order: pagesPayload.length + 1,
        text: page.text,
        prompt: page.prompt?.trim?.() || '',
        hasNewImage: Boolean(page.file),
        removeImage: Boolean(page.removeImage) && !page.file,
        pageType: page.pageType,
        cover: coverConfig,
        hasNewQrImage: page.pageType === 'cover' && Boolean(page.qr?.file),
        removeQrImage:
          page.pageType === 'cover' && Boolean(page.qr?.remove) && !page.qr?.file,
      });

      if (page.file) {
        pageImageFiles.push(page.file);
      }
      if (page.pageType === 'cover' && page.qr?.file) {
        pageQrFiles.push(page.qr.file);
      }
    }

    if (!pagesPayload.length) {
      toast.error('Add at least one page with content before saving');
      return;
    }

    const formData = new FormData();
    formData.append('name', formState.name.trim());
    if (formState.description?.trim()) {
      formData.append('description', formState.description.trim());
    } else {
      formData.append('description', '');
    }
    formData.append('gender', formState.gender);
    formData.append('status', formState.status);

    const coverAction =
      formMode === 'edit'
        ? formState.cover.action
        : formState.cover.file
        ? 'replace'
        : 'remove';
    formData.append('coverAction', coverAction);
    if (formState.cover.file) {
      formData.append('coverImage', formState.cover.file);
    }

    formData.append('pages', JSON.stringify(pagesPayload));
    pageImageFiles.forEach((file) => {
      formData.append('pageImages', file);
    });
    pageQrFiles.forEach((file) => {
      formData.append('pageQrImages', file);
    });

    // Add cover page data
    const coverPageData = {
      leftSide: {
        title: formState.coverPage.leftSide.title || '',
        content: formState.coverPage.leftSide.content || '',
        bottomText: formState.coverPage.leftSide.bottomText || '',
      },
      rightSide: {
        mainTitle: formState.coverPage.rightSide.mainTitle || '',
        subtitle: formState.coverPage.rightSide.subtitle || '',
      },
      hasNewBackgroundImage: Boolean(formState.coverPage.backgroundImage.file),
      removeBackgroundImage: Boolean(formState.coverPage.backgroundImage.remove) && !formState.coverPage.backgroundImage.file,
      hasNewCharacterImage: Boolean(formState.coverPage.characterImage.file),
      removeCharacterImage: Boolean(formState.coverPage.characterImage.remove) && !formState.coverPage.characterImage.file,
      hasNewQrCode: Boolean(formState.coverPage.qrCode.file),
      removeQrCode: Boolean(formState.coverPage.qrCode.remove) && !formState.coverPage.qrCode.file,
    };
    formData.append('coverPage', JSON.stringify(coverPageData));

    if (formState.coverPage.backgroundImage.file) {
      formData.append('coverPageBackgroundImage', formState.coverPage.backgroundImage.file);
    }
    if (formState.coverPage.characterImage.file) {
      formData.append('coverPageCharacterImage', formState.coverPage.characterImage.file);
    }
    if (formState.coverPage.qrCode.file) {
      formData.append('coverPageQrCode', formState.coverPage.qrCode.file);
    }

    setIsSaving(true);

    try {
      if (formMode === 'edit' && editingBook?._id) {
        await bookAPI.update(editingBook._id, formData);
        toast.success('Book updated');
      } else {
        await bookAPI.create(formData);
        toast.success('Book created');
      }
      await fetchBooks(false);
      resetForm();
    } catch (error) {
      toast.error(`Failed to save book: ${error.message}`);
      setIsSaving(false);
    }
  };

  const handleDeleteBook = async (bookId) => {
    if (!window.confirm('Delete this book permanently?')) return;
    try {
      await bookAPI.delete(bookId);
      toast.success('Book deleted');
      fetchBooks(false);
    } catch (error) {
      toast.error(`Failed to delete book: ${error.message}`);
    }
  };

  const handleToggleStatus = async (book) => {
    const nextStatus = book.status === 'active' ? 'inactive' : 'active';
    try {
      await bookAPI.updateStatus(book._id, nextStatus);
      toast.success(
        `Book ${nextStatus === 'active' ? 'activated' : 'deactivated'}`
      );
      fetchBooks(false);
    } catch (error) {
      toast.error(`Failed to update status: ${error.message}`);
    }
  };

  const openImageViewer = (image, fallbackTitle) => {
    if (!image?.url && !image?.preview) return;
    setViewerImage({
      src: image.url || image.preview,
      title: image.originalName || fallbackTitle,
      downloadUrl: image.url,
      sizeLabel:
        typeof image.size === 'number' ? formatFileSize(image.size) : undefined,
    });
  };

  const handleViewerClose = useCallback(() => {
    setViewerImage(null);
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex items-end justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        {/* Books grid skeleton */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-20 w-full" />
                </div>
              </CardContent>
              <CardFooter className="gap-2">
                <Skeleton className="h-10 flex-1" />
                <Skeleton className="h-10 w-10" />
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Story Books
          </h2>
          <p className="mt-1 text-sm text-foreground/60">
            Curate interactive storybooks with rich background art for personalised adventures.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="hidden sm:inline-flex bg-foreground/10 text-foreground/70">
            {books.length} books
          </Badge>
          <Badge className="hidden sm:inline-flex bg-foreground/10 text-foreground/70">
            {totalPages} pages
          </Badge>
          <Button className="gap-2" onClick={openCreateForm}>
            <Plus className="h-4 w-4" />
            Add book
          </Button>
        </div>
      </div>

  {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{formMode === 'edit' ? 'Edit book' : 'Create new book'}</CardTitle>
            <CardDescription>
              Define the story metadata, cover, and per-page content for this personalised book.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="bookName">Book name *</Label>
                  <Input
                    id="bookName"
                    value={formState.name}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        name: event.target.value,
                      }))
                    }
                    placeholder="The Galactic Explorer"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Gender focus</Label>
                  <Select
                    value={formState.gender}
                    onValueChange={(value) =>
                      setFormState((prev) => ({ ...prev, gender: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="bookDescription">Description</Label>
                  <Textarea
                    id="bookDescription"
                    minRows={4}
                    placeholder="A thrilling journey through space tailored to your child's imagination."
                    value={formState.description}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        description: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select
                    value={formState.status}
                    onValueChange={(value) =>
                      setFormState((prev) => ({ ...prev, status: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-border/60 bg-muted p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Label>Cover image</Label>
                    <p className="text-xs text-foreground/50">
                      Upload artwork that represents the story. Landscape orientation works best.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('coverImageInput')?.click()}
                    >
                      <ImageIcon className="mr-2 h-4 w-4" />
                      Choose cover
                    </Button>
                    {formState.cover.preview && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-red-300 hover:text-red-200"
                        onClick={handleCoverRemove}
                      >
                        Remove
                      </Button>
                    )}
                    <input
                      id="coverImageInput"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleCoverChange}
                    />
                  </div>
                </div>
                {formState.cover.preview ? (
                  <div className="relative overflow-hidden rounded-xl border border-border/60 bg-card">
                    <img
                      src={formState.cover.preview}
                      alt="Book cover preview"
                      className="w-full object-cover"
                      onClick={() =>
                        openImageViewer(
                          formState.cover.file
                            ? { url: formState.cover.preview, size: formState.cover.file.size }
                            : formState.cover.existing,
                          'Book cover'
                        )
                      }
                    />
                  </div>
                ) : (
                  <p className="text-xs text-foreground/50">
                    No cover selected yet.
                  </p>
                )}
              </div>

              <div className="space-y-4 rounded-xl border border-border/60 bg-muted p-4">
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="story-pages">Story Pages</TabsTrigger>
                    <TabsTrigger value="cover-page">Cover Page</TabsTrigger>
                  </TabsList>

                  <TabsContent value="story-pages" className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <Label>Story Pages</Label>
                        <p className="text-xs text-foreground/50">
                          Add story beats with accompanying background visuals for each page.
                        </p>
                      </div>
                      <Button type="button" variant="outline" className="gap-2" onClick={handleAddPage}>
                        <Plus className="h-4 w-4" />
                        Add page
                      </Button>
                    </div>

                <div className="space-y-4">
                  {formState.pages.map((page, index) => (
                    <div
                      key={page.id || index}
                      className="space-y-3 rounded-lg border border-border/60 bg-card p-4"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
                          <Layers className="h-4 w-4 text-foreground/50" />
                          <span>Page {index + 1}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={index === 0}
                            onClick={() => handleMovePage(index, 'up')}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={index === formState.pages.length - 1}
                            onClick={() => handleMovePage(index, 'down')}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-red-300 hover:text-red-200"
                            onClick={() => handleRemovePage(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`page-text-${index}`}>Narration</Label>
                        <Textarea
                          id={`page-text-${index}`}
                          minRows={3}
                          placeholder="Describe the scene and action for this page."
                          value={page.text}
                          onChange={(event) =>
                            handlePageTextChange(index, event.target.value)
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Background image</Label>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              document
                                .getElementById(`page-image-${index}`)
                                ?.click()
                            }
                          >
                            <ImageIcon className="mr-2 h-4 w-4" />
                            {page.preview ? 'Change image' : 'Upload image'}
                          </Button>
                          {page.preview && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-red-300 hover:text-red-200"
                              onClick={() => handleRemovePageImage(index)}
                            >
                              Remove
                            </Button>
                          )}
                          <input
                            id={`page-image-${index}`}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) => handlePageImageChange(index, event)}
                          />
                        </div>
                        {page.preview ? (
                          <div className="group relative overflow-hidden rounded-lg border border-border/60 bg-muted/40">
                            <img
                              src={page.preview}
                              alt={`Page ${index + 1} background`}
                              className="h-48 w-full object-cover transition group-hover:scale-[1.02]"
                              onClick={() =>
                                openImageViewer(
                                  page.file
                                    ? {
                                        url: page.preview,
                                        size: page.file.size,
                                        originalName: page.file.name,
                                      }
                                    : page.existingImage,
                                  `Page ${index + 1} background`
                                )
                              }
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-foreground/50">
                            No background image attached.
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`page-prompt-${index}`}>Character prompt</Label>
                        <Textarea
                          id={`page-prompt-${index}`}
                          minRows={2}
                          placeholder="Describe the character you want to generate for this scene."
                          value={page.prompt}
                          onChange={(event) =>
                            handlePagePromptChange(index, event.target.value)
                          }
                        />
                        <p className="text-xs text-foreground/50">
                          Saved for future character image generation.
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                  </TabsContent>

                  <TabsContent value="cover-page" className="space-y-4">
                    <div className="space-y-3">
                      <div>
                        <Label className="text-base">Cover Page Editor</Label>
                        <p className="text-xs text-foreground/50 mt-1">
                          Design the backcover of your book with customizable text and images. Use {'{name}'} as a dynamic placeholder.
                        </p>
                      </div>

                      {/* Background Image */}
                      <div className="space-y-3 rounded-lg border border-border/60 bg-card p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <Label>Background Image</Label>
                            <p className="text-xs text-foreground/50">
                              Upload the background image for the cover page.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => document.getElementById('coverPageBgInput')?.click()}
                            >
                              <ImageIcon className="mr-2 h-4 w-4" />
                              {formState.coverPage.backgroundImage.preview ? 'Change image' : 'Upload image'}
                            </Button>
                            {formState.coverPage.backgroundImage.preview && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-red-300 hover:text-red-200"
                                onClick={handleRemoveCoverPageBg}
                              >
                                Remove
                              </Button>
                            )}
                            <input
                              id="coverPageBgInput"
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleCoverPageBgChange}
                            />
                          </div>
                        </div>
                        {formState.coverPage.backgroundImage.preview ? (
                          <div className="relative overflow-hidden rounded-lg border border-border/60 bg-muted/40">
                            <img
                              src={formState.coverPage.backgroundImage.preview}
                              alt="Cover page background"
                              className="h-48 w-full object-cover"
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-foreground/50">No background image selected.</p>
                        )}
                      </div>

                      {/* Character Image */}
                      <div className="space-y-3 rounded-lg border border-border/60 bg-card p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <Label>Character Image</Label>
                            <p className="text-xs text-foreground/50">
                              Upload the character image to be displayed on the cover.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => document.getElementById('coverPageCharacterInput')?.click()}
                            >
                              <ImageIcon className="mr-2 h-4 w-4" />
                              {formState.coverPage.characterImage.preview ? 'Change image' : 'Upload image'}
                            </Button>
                            {formState.coverPage.characterImage.preview && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-red-300 hover:text-red-200"
                                onClick={handleRemoveCoverPageCharacter}
                              >
                                Remove
                              </Button>
                            )}
                            <input
                              id="coverPageCharacterInput"
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleCoverPageCharacterChange}
                            />
                          </div>
                        </div>
                        {formState.coverPage.characterImage.preview ? (
                          <div className="relative overflow-hidden rounded-lg border border-border/60 bg-muted/40">
                            <img
                              src={formState.coverPage.characterImage.preview}
                              alt="Cover page character"
                              className="h-48 w-full object-contain"
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-foreground/50">No character image selected.</p>
                        )}
                      </div>

                      {/* Left Side Section */}
                      <div className="space-y-3 rounded-lg border border-border/60 bg-card p-4">
                        <Label className="text-base">Left Side Content</Label>

                        <div className="space-y-2">
                          <Label htmlFor="coverPageLeftTitle">Title</Label>
                          <Textarea
                            id="coverPageLeftTitle"
                            minRows={2}
                            placeholder="Join {name} on an Unforgettable Adventure Across Israel!"
                            value={formState.coverPage.leftSide.title}
                            onChange={(event) =>
                              handleCoverPageFieldChange('leftSide', 'title', event.target.value)
                            }
                          />
                          <p className="text-xs text-foreground/50">
                            Use {'{name}'} as a placeholder for the child's name.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="coverPageLeftContent">Content</Label>
                          <Textarea
                            id="coverPageLeftContent"
                            minRows={6}
                            placeholder="From the sparkling shores of the Kinneret to the ancient stones of the Kotel, {name} is on a journey like no other..."
                            value={formState.coverPage.leftSide.content}
                            onChange={(event) =>
                              handleCoverPageFieldChange('leftSide', 'content', event.target.value)
                            }
                          />
                          <p className="text-xs text-foreground/50">
                            Main description text. Use {'{name}'} for dynamic name insertion.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="coverPageLeftBottomText">Bottom Text</Label>
                          <Input
                            id="coverPageLeftBottomText"
                            placeholder="Shop more books at Mytorahtales.com"
                            value={formState.coverPage.leftSide.bottomText}
                            onChange={(event) =>
                              handleCoverPageFieldChange('leftSide', 'bottomText', event.target.value)
                            }
                          />
                        </div>
                      </div>

                      {/* QR Code Section */}
                      <div className="space-y-3 rounded-lg border border-border/60 bg-card p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <Label>QR Code Image</Label>
                            <p className="text-xs text-foreground/50">
                              Upload a QR code to be displayed on the cover.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => document.getElementById('coverPageQrInput')?.click()}
                            >
                              <ImageIcon className="mr-2 h-4 w-4" />
                              {formState.coverPage.qrCode.preview ? 'Change QR code' : 'Upload QR code'}
                            </Button>
                            {formState.coverPage.qrCode.preview && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-red-300 hover:text-red-200"
                                onClick={handleRemoveCoverPageQr}
                              >
                                Remove
                              </Button>
                            )}
                            <input
                              id="coverPageQrInput"
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleCoverPageQrChange}
                            />
                          </div>
                        </div>
                        {formState.coverPage.qrCode.preview ? (
                          <div className="relative w-40 overflow-hidden rounded-lg border border-border/60 bg-muted/40">
                            <img
                              src={formState.coverPage.qrCode.preview}
                              alt="Cover page QR code"
                              className="h-40 w-full object-contain"
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-foreground/50">No QR code uploaded.</p>
                        )}
                      </div>

                      {/* Right Side Section */}
                      <div className="space-y-3 rounded-lg border border-border/60 bg-card p-4">
                        <Label className="text-base">Right Side Content</Label>

                        <div className="space-y-2">
                          <Label htmlFor="coverPageRightTitle">Main Title</Label>
                          <Textarea
                            id="coverPageRightTitle"
                            minRows={2}
                            placeholder="{name}'s TRIP TO ISRAEL"
                            value={formState.coverPage.rightSide.mainTitle}
                            onChange={(event) =>
                              handleCoverPageFieldChange('rightSide', 'mainTitle', event.target.value)
                            }
                          />
                          <p className="text-xs text-foreground/50">
                            Main title displayed prominently on the right. Use {'{name}'} for dynamic name insertion.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="coverPageRightSubtitle">Subtitle</Label>
                          <Input
                            id="coverPageRightSubtitle"
                            placeholder="An amazing adventure"
                            value={formState.coverPage.rightSide.subtitle}
                            onChange={(event) =>
                              handleCoverPageFieldChange('rightSide', 'subtitle', event.target.value)
                            }
                          />
                          <p className="text-xs text-foreground/50">
                            Small text displayed below the main title.
                          </p>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              {/* Cover Preview Section */}
              {activeTab === 'cover-page' && coverPreview && (
                <div className="space-y-3 rounded-xl border border-border/60 bg-muted p-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-base">Preview</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCoverPreview(null)}
                    >
                      Close Preview
                    </Button>
                  </div>
                  <div className="relative overflow-hidden rounded-lg border border-border/60 bg-card">
                    <img
                      src={coverPreview}
                      alt="Cover page preview"
                      className="w-full object-contain"
                      onClick={() =>
                        openImageViewer(
                          { url: coverPreview },
                          'Cover page preview'
                        )
                      }
                    />
                  </div>
                </div>
              )}

              <CardFooter className="flex flex-col-reverse gap-3 border-none p-0 sm:flex-row sm:justify-between">
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={resetForm} disabled={isSaving || isGeneratingPreview}>
                    Cancel
                  </Button>
                  {activeTab === 'cover-page' && (
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      onClick={handleGeneratePreview}
                      disabled={isSaving || isGeneratingPreview}
                    >
                      {isGeneratingPreview ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Generating…
                        </>
                      ) : (
                        <>
                          <ImageIcon className="h-4 w-4" />
                          Generate Preview
                        </>
                      )}
                    </Button>
                  )}
                </div>
                <Button type="submit" className="gap-2" disabled={isSaving || isGeneratingPreview}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <BookOpen className="h-4 w-4" />
                      {formMode === 'edit' ? 'Update book' : 'Create book'}
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {books.map((book) => (
          <Card key={book._id} className="flex flex-col justify-between">
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-lg">{book.name}</CardTitle>
                  <CardDescription className="text-xs text-foreground/55">
                    {book.description || 'No description provided.'}
                  </CardDescription>
                </div>
                <Badge variant={book.status === 'active' ? 'success' : 'secondary'}>
                  {book.status}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/50">
                <BookOpen className="h-3.5 w-3.5" />
                <span>{book.pages?.length || 0} pages</span>
                <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-foreground/55">
                  {book.gender}
                </span>
              </div>
            </CardHeader>

            {book.coverImage?.url ? (
              <div className="mx-4 overflow-hidden rounded-lg border border-border/60 bg-muted/20">
                <img
                  src={book.coverImage.url}
                  alt={`${book.name} cover`}
                  className="h-44 w-full object-cover"
                  onClick={() => openImageViewer(book.coverImage, `${book.name} cover`)}
                />
              </div>
            ) : (
              <div className="mx-4 flex h-44 items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/20 text-xs text-foreground/50">
                No cover image
              </div>
            )}

            <CardContent className="space-y-3 text-sm text-foreground/70">
              <div className="flex items-center gap-2">
                {book.status === 'active' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Ban className="h-4 w-4 text-amber-400" />
                )}
                <span>
                  {book.status === 'active'
                    ? 'Visible in generation workflows'
                    : 'Hidden from generation workflows'}
                </span>
              </div>
              {book.pages?.length ? (
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.2em] text-foreground/45">
                    Highlights
                  </p>
                  <p className="text-xs text-foreground/60">
                    Includes{' '}
                    {book.pages.filter(
                      (page) => page.backgroundImage?.url || page.characterImage?.url
                    ).length}{' '}
                    pages with background art.
                  </p>
                </div>
              ) : null}
            </CardContent>

            <CardFooter className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 bg-card py-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => openEditForm(book)}
              >
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => handleToggleStatus(book)}
              >
                {book.status === 'active' ? (
                  <>
                    <Ban className="h-4 w-4" />
                    Deactivate
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Activate
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="gap-1"
                onClick={() => handleDeleteBook(book._id)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {books.length === 0 && (
        <Card className="border-dashed border-border/50 bg-card text-center">
          <CardContent className="space-y-3 py-14">
            <BookOpen className="mx-auto h-10 w-10 text-foreground/30" />
            <h3 className="text-lg font-medium text-foreground">
              No books yet
            </h3>
            <p className="text-sm text-foreground/55">
              Create your first personalised storybook to get started.
            </p>
            <Button onClick={openCreateForm} className="mt-3">
              <Plus className="mr-2 h-4 w-4" />
              Add book
            </Button>
          </CardContent>
        </Card>
      )}

      <ImageViewer open={Boolean(viewerImage)} image={viewerImage} onClose={handleViewerClose} />
    </div>
  );
}

export default Books;
