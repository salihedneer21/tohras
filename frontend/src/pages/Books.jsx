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
import { Badge } from '@/components/ui/badge';
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

const createEmptyPage = () => ({
  id: null,
  text: '',
  file: null,
  preview: null,
  previewIsObject: false,
  existingImage: null,
  removeImage: false,
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
    formState.pages.forEach((page) =>
      revokeIfNeeded(page.preview, page.previewIsObject)
    );
    setFormState(createEmptyBookForm());
    setEditingBook(null);
    setFormMode('create');
    setShowForm(false);
    setIsSaving(false);
  }, [formState.cover, formState.pages]);

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (book) => {
    revokeIfNeeded(formState.cover.preview, formState.cover.previewIsObject);
    formState.pages.forEach((page) =>
      revokeIfNeeded(page.preview, page.previewIsObject)
    );

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
          ? sortedPages.map((page) => ({
              id: page._id || null,
              text: page.text || '',
              file: null,
              preview: page.backgroundImage?.url || page.characterImage?.url || null,
              previewIsObject: false,
              existingImage: page.backgroundImage || page.characterImage || null,
              removeImage: false,
            }))
          : [createEmptyPage()],
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSaving) return;

    if (!formState.name.trim()) {
      toast.error('Book name is required');
      return;
    }

    const filteredPages = formState.pages.filter(
      (page) => page.text.trim() || page.file || page.existingImage
    );

    if (!filteredPages.length) {
      toast.error('Add at least one page with text or an image');
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

    const pagesPayload = filteredPages.map((page, index) => ({
      id: page.id,
      order: index + 1,
      text: page.text,
      hasNewImage: Boolean(page.file),
      removeImage: Boolean(page.removeImage) && !page.file,
    }));
    formData.append('pages', JSON.stringify(pagesPayload));

    filteredPages.forEach((page) => {
      if (page.file) {
        formData.append('pageImages', page.file);
      }
    });

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
      <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 text-foreground/60">
        <BookOpen className="h-9 w-9 animate-spin text-foreground/40" />
        <p className="text-sm uppercase tracking-[0.2em] text-foreground/40">
          Loading books
        </p>
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
            Curate interactive storybooks with character imagery for personalised adventures.
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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Label>Pages</Label>
                    <p className="text-xs text-foreground/50">
                      Add story beats with accompanying character visuals for each page.
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
                        <Label>Character image</Label>
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
                              alt={`Page ${index + 1} character`}
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
                                  `Page ${index + 1} image`
                                )
                              }
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-foreground/50">
                            No character image attached.
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <CardFooter className="flex flex-col-reverse gap-3 border-none p-0 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={resetForm} disabled={isSaving}>
                  Cancel
                </Button>
                <Button type="submit" className="gap-2" disabled={isSaving}>
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
                    Includes {book.pages.filter((page) => page.characterImage?.url).length} illustrated pages.
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
