import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  BookOpen,
  Download,
  Image as ImageIcon,
  ImageOff,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { bookAPI } from '@/services/api';
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

const CHARACTER_POSITION_OPTIONS = [
  { value: 'auto', label: 'Auto alternate' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

function Storybooks() {
  const [books, setBooks] = useState([]);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [selectedBook, setSelectedBook] = useState(null);
  const [pages, setPages] = useState([]);
  const [storyTitle, setStoryTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingBook, setLoadingBook] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        setLoading(true);
        const response = await bookAPI.getAll();
        setBooks(response.data);
      } catch (error) {
        toast.error(`Failed to load books: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchBooks();
  }, []);

  useEffect(() => {
    if (!selectedBookId) {
      setSelectedBook(null);
      setPages([]);
      setStoryTitle('');
      return;
    }

    const fetchBook = async () => {
      try {
        setLoadingBook(true);
        const response = await bookAPI.getById(selectedBookId);
        const book = response.data;
        setSelectedBook(book);
        setStoryTitle((prev) => prev || `${book.name} Storybook`);
        setPages(
          (book.pages || []).map((page) => ({
            id: page._id,
            order: page.order,
            text: page.text || '',
            useCharacter: true,
            characterPosition: 'auto',
            backgroundImageUrl: page.backgroundImage?.url || page.characterImage?.url || '',
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
    };

    fetchBook();
  }, [selectedBookId]);

  const totalPages = useMemo(() => pages.length, [pages]);
  const totalStorybooks = selectedBook?.pdfAssets?.length || 0;

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

  const handleGenerate = async () => {
    if (!selectedBookId) {
      toast.error('Select a book before generating a storybook');
      return;
    }

    if (!pages.length) {
      toast.error('Add at least one page to generate');
      return;
    }

    try {
      setIsGenerating(true);
      const formData = new FormData();
      if (storyTitle) {
      formData.append('title', storyTitle);
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

  const refreshStorybooks = async () => {
    if (!selectedBookId) return;
    try {
      const response = await bookAPI.getStorybooks(selectedBookId);
      setSelectedBook((prev) => {
        if (!prev) return prev;
        return { ...prev, pdfAssets: response.data };
      });
      toast.success('Storybooks refreshed');
    } catch (error) {
      toast.error(`Failed to refresh storybooks: ${error.message}`);
    }
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-2"
            disabled={!selectedBookId || loadingBook}
            onClick={refreshStorybooks}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select a book</CardTitle>
          <CardDescription>
            Choose a book to pull in its characters and page content.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
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
        </CardContent>
      </Card>

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
                    <RefreshCw className="h-4 w-4 animate-spin" />
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
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={refreshStorybooks}
                disabled={!selectedBookId}
              >
                <RefreshCw className="h-4 w-4" />
                Refresh list
              </Button>
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
  );
}

export default Storybooks;
