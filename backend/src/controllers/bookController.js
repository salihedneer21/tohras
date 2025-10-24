const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const Book = require('../models/Book');
const User = require('../models/User');
const {
  uploadBufferToS3,
  deleteFromS3,
  generateBookCoverKey,
  generateBookPageImageKey,
  generateBookCharacterOverlayKey,
  generateBookPdfKey,
  getSignedUrlForKey,
} = require('../config/s3');
const { generateStorybookPdf, removeBackground } = require('../utils/pdfGenerator');
const {
  regenerateStorybookPage: regenerateStorybookPageService,
  applyStorybookCandidateSelection,
} = require('../services/storybookWorkflow');

const slugify = (value) =>
  (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const parsePagesPayload = (pages) => {
  if (!pages) return [];
  if (Array.isArray(pages)) return pages;
  try {
    const parsed = JSON.parse(pages);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const normalizeBoolean = (value) =>
  typeof value === 'string' ? value === 'true' || value === '1' : Boolean(value);

const normalizeString = (value) =>
  typeof value === 'string' ? value.trim() : '';

const replaceReaderPlaceholders = (value, readerName) => {
  if (!value || typeof value !== 'string') {
    return value || '';
  }
  if (!readerName) return value;
  return value.replace(/\{name\}/gi, readerName);
};

const buildImageResponse = (file, key, url) => ({
  key,
  url,
  size: file.size,
  contentType: file.mimetype,
  uploadedAt: new Date(),
  originalName: file.originalname,
});

const cleanupKeys = async (keys = []) => {
  if (!Array.isArray(keys) || keys.length === 0) return;
  await Promise.all(
    keys.map((key) =>
      deleteFromS3(key).catch((error) =>
        console.warn(`⚠️  Failed to cleanup S3 asset ${key}: ${error.message}`)
      )
    )
  );
};

const buildAssetPayload = async (asset) => {
  if (!asset) return null;
  const signedUrl = await getSignedUrlForKey(asset.key).catch(() => null);
  return {
    key: asset.key,
    url: asset.url,
    signedUrl,
    downloadUrl: asset.url || signedUrl || asset.downloadUrl || null,
    size: asset.size,
    contentType: asset.contentType,
    uploadedAt: asset.uploadedAt,
    originalName: asset.originalName,
    backgroundRemoved: Boolean(asset.backgroundRemoved),
  };
};

const sanitizeAssetForSnapshot = (asset) => {
  if (!asset) return null;
  return {
    key: asset.key,
    url: asset.url,
    signedUrl: asset.signedUrl || null,
    downloadUrl: asset.url || asset.downloadUrl || asset.signedUrl || null,
    size: asset.size || 0,
    contentType: asset.contentType || null,
    uploadedAt: asset.uploadedAt ? new Date(asset.uploadedAt) : new Date(),
    originalName: asset.originalName || null,
    backgroundRemoved: Boolean(asset.backgroundRemoved),
  };
};

const sanitizeAssetListForSnapshot = (assets) =>
  Array.isArray(assets)
    ? assets
        .map((asset) => sanitizeAssetForSnapshot(asset))
        .filter((asset) => Boolean(asset?.key || asset?.url))
    : [];

const cloneDocument = (value) =>
  value && typeof value.toObject === 'function'
    ? value.toObject({ depopulate: true })
    : value
    ? JSON.parse(JSON.stringify(value))
    : null;

const attachFreshSignedUrl = async (asset) => {
  if (!asset) return null;
  const cloned = cloneDocument(asset) || {};
  if (!cloned.key) {
    cloned.backgroundRemoved = Boolean(cloned.backgroundRemoved);
    return cloned;
  }

  const signedUrl = await getSignedUrlForKey(cloned.key).catch(() => null);
  cloned.signedUrl = signedUrl || cloned.signedUrl || null;
  cloned.downloadUrl = cloned.url || cloned.downloadUrl || signedUrl || null;
  cloned.backgroundRemoved = Boolean(cloned.backgroundRemoved);
  return cloned;
};

const attachFreshSignedUrlsToPages = async (pages = [], options = {}) => {
  const { bookPages = [] } = options;
  const bookPagesArray = Array.isArray(bookPages) ? bookPages : [];
  const bookPagesById = new Map();
  const bookPagesByOrder = new Map();

  bookPagesArray.forEach((page) => {
    const cloned = cloneDocument(page) || {};
    if (cloned._id) {
      bookPagesById.set(String(cloned._id), cloned);
    }
    const orderValue = Number(cloned.order);
    if (Number.isFinite(orderValue)) {
      bookPagesByOrder.set(orderValue, cloned);
    }
  });

  const hydrations = await Promise.all(
    (pages || []).map(async (page) => {
      if (!page) return null;
      const clonedPage = cloneDocument(page) || {};
      const pageId = clonedPage._id || clonedPage.pageId;
      const pageOrder = Number(clonedPage.order);
      const bookPageCandidate =
        (pageId && bookPagesById.get(String(pageId))) ||
        (Number.isFinite(pageOrder) && bookPagesByOrder.get(pageOrder)) ||
        null;

      // Prefer the most up-to-date book assets (which may have background removal applied after snapshot creation).
      const backgroundSource =
        (bookPageCandidate && bookPageCandidate.backgroundImage) || clonedPage.background;
      const resolvedBackground = await attachFreshSignedUrl(backgroundSource);

      // ALWAYS prefer the character asset stored on the book page (which reflects background removal).
      // The book page characterImage is the source of truth after background removal has been applied.
      let characterSource = null;
      if (bookPageCandidate?.characterImage) {
        // Use book page character image (may have backgroundRemoved = true)
        characterSource = bookPageCandidate.characterImage;
      } else if (clonedPage.character) {
        // Fallback to snapshot character only if book page has none
        characterSource = clonedPage.character;
      }
      const resolvedCharacter = await attachFreshSignedUrl(characterSource);

      const originalSource =
        clonedPage.characterOriginal ||
        bookPageCandidate?.characterImageOriginal ||
        // If the snapshot predates background removal, keep a reference to the original upload.
        (!bookPageCandidate?.characterImage?.backgroundRemoved
          ? bookPageCandidate?.characterImage
          : null);
      const resolvedCharacterOriginal = await attachFreshSignedUrl(originalSource);

      const resolvedCandidateAssets = Array.isArray(clonedPage.candidateAssets)
        ? await Promise.all(clonedPage.candidateAssets.map((asset) => attachFreshSignedUrl(asset)))
        : [];

      clonedPage.background = resolvedBackground;
      clonedPage.character = resolvedCharacter;
      clonedPage.characterOriginal = resolvedCharacterOriginal;
      clonedPage.candidateAssets = resolvedCandidateAssets.filter(Boolean);
      return clonedPage;
    })
  );

  return hydrations
    .filter(Boolean)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
};

const hydrateBookDocument = async (book) => {
  if (!book) return null;

  const clonedBook = cloneDocument(book);
  if (!clonedBook) return null;

  clonedBook.coverImage = await attachFreshSignedUrl(clonedBook.coverImage);

  const hydratedPages = await Promise.all(
    (clonedBook.pages || []).map(async (page) => {
      const clonedPage = cloneDocument(page) || {};
      return {
        ...clonedPage,
        backgroundImage: await attachFreshSignedUrl(clonedPage.backgroundImage),
        characterImage: await attachFreshSignedUrl(clonedPage.characterImage),
        characterImageOriginal: await attachFreshSignedUrl(clonedPage.characterImageOriginal),
      };
    })
  );

  clonedBook.pages = hydratedPages
    .filter(Boolean)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  clonedBook.pdfAssets = await Promise.all(
    (clonedBook.pdfAssets || []).map(async (asset) => {
      const clonedAsset = cloneDocument(asset) || {};
      clonedAsset.pages = await attachFreshSignedUrlsToPages(clonedAsset.pages || [], {
        bookPages: clonedBook.pages || [],
      });
      return clonedAsset;
    })
  );

  return clonedBook;
};

const ensureBackgroundRemovedCharacter = async ({
  book,
  bookSlug,
  storyPage,
  bookPage,
}) => {
  const existingCharacter = storyPage.character;
  console.log('[ensureBackgroundRemoved] Starting for page', storyPage.order, 'hasCharacter:', Boolean(existingCharacter));

  if (!existingCharacter) {
    if (bookPage) {
      bookPage.characterImage = null;
      bookPage.characterImageOriginal = null;
    }
    return false;
  }

  const normalizedCharacter = await attachFreshSignedUrl(existingCharacter);
  console.log('[ensureBackgroundRemoved] normalizedCharacter.backgroundRemoved:', normalizedCharacter.backgroundRemoved, 'key:', normalizedCharacter.key);
  const previousCharacterImage = bookPage ? cloneDocument(bookPage.characterImage) : null;
  const previousCharacterImageOriginal = bookPage
    ? cloneDocument(bookPage.characterImageOriginal)
    : null;

  let finalCharacterAsset = normalizedCharacter;
  // Preserve the original character asset before any background removal processing
  // If storyPage.characterOriginal exists and is different from character, keep it (already processed before)
  // Otherwise, use the current character as the original (first time processing)
  let finalOriginalAsset = null;
  if (storyPage.characterOriginal &&
      storyPage.characterOriginal.key &&
      storyPage.characterOriginal.key !== normalizedCharacter.key) {
    // Already has a different original stored
    finalOriginalAsset = storyPage.characterOriginal;
  } else if (bookPage?.characterImageOriginal) {
    // Use book page's original if available
    finalOriginalAsset = cloneDocument(bookPage.characterImageOriginal);
  } else {
    // First time: use current character as original
    finalOriginalAsset = { ...normalizedCharacter };
  }

  if (normalizedCharacter.backgroundRemoved && normalizedCharacter.key) {
    console.log('[ensureBackgroundRemoved] Character already has background removed, skipping Brio');
    storyPage.character = normalizedCharacter;
    storyPage.characterOriginal = finalOriginalAsset;

    if (bookPage) {
      bookPage.characterImage = normalizedCharacter;
      bookPage.characterImageOriginal = finalOriginalAsset;

      const updatedCharacterImage = cloneDocument(bookPage.characterImage);
      const updatedCharacterImageOriginal = cloneDocument(bookPage.characterImageOriginal);

      return (
        JSON.stringify(previousCharacterImage) !== JSON.stringify(updatedCharacterImage) ||
        JSON.stringify(previousCharacterImageOriginal) !== JSON.stringify(updatedCharacterImageOriginal)
      );
    }

    return false;
  }

  console.log('[ensureBackgroundRemoved] Background not removed yet, will call Brio');

  const candidate = { ...normalizedCharacter };

  if (!candidate.signedUrl && candidate.key) {
    candidate.signedUrl = await getSignedUrlForKey(candidate.key).catch(
      () => candidate.signedUrl || null
    );
  }

  try {
    const processedBuffer = await removeBackground(candidate);
    console.log('[ensureBackgroundRemoved] Brio returned buffer length:', processedBuffer ? processedBuffer.length : null);
    if (processedBuffer && processedBuffer.length) {
      const key = generateBookCharacterOverlayKey(
        bookSlug,
        storyPage.order,
        candidate.originalName || `character-${storyPage.order}.png`
      );

      const { url } = await uploadBufferToS3(processedBuffer, key, 'image/png', {
        acl: 'public-read',
      });
      console.log('[ensureBackgroundRemoved] Uploaded background-removed image to S3:', key);
      const signedUrl = await getSignedUrlForKey(key).catch(() => null);
      const storedAsset = {
        key,
        url,
        signedUrl: signedUrl || url,
        downloadUrl: url,
        size: processedBuffer.length,
        contentType: 'image/png',
        uploadedAt: new Date(),
        originalName: candidate.originalName || `character-${storyPage.order}.png`,
        backgroundRemoved: true,
      };

      finalCharacterAsset = storedAsset;
      // Keep the finalOriginalAsset that was determined earlier (preserves original before background removal)
      // Only use candidate as original if finalOriginalAsset wasn't set
      if (!finalOriginalAsset || !finalOriginalAsset.key) {
        finalOriginalAsset = candidate;
      }
      storyPage.character = storedAsset;
      storyPage.characterOriginal = finalOriginalAsset;
      console.log('[ensureBackgroundRemoved] Set storyPage.character.backgroundRemoved:', storedAsset.backgroundRemoved);

      if (bookPage) {
        bookPage.characterImage = storedAsset;
        bookPage.characterImageOriginal = finalOriginalAsset;
        console.log('[ensureBackgroundRemoved] Set bookPage.characterImage.backgroundRemoved:', storedAsset.backgroundRemoved);

        const updatedCharacterImage = cloneDocument(bookPage.characterImage);
        const updatedCharacterImageOriginal = cloneDocument(bookPage.characterImageOriginal);

        return (
          JSON.stringify(previousCharacterImage) !== JSON.stringify(updatedCharacterImage) ||
          JSON.stringify(previousCharacterImageOriginal) !== JSON.stringify(updatedCharacterImageOriginal)
        );
      }

      return true;
    }
  } catch (error) {
    console.error(
      `[storybook] Background removal failed for page ${storyPage.order} during PDF generation:`,
      error.message
    );
  }

  storyPage.character = finalCharacterAsset;
  storyPage.characterOriginal = finalOriginalAsset;

  if (bookPage) {
    bookPage.characterImage = finalCharacterAsset;
    bookPage.characterImageOriginal = finalOriginalAsset;

    const updatedCharacterImage = cloneDocument(bookPage.characterImage);
    const updatedCharacterImageOriginal = cloneDocument(bookPage.characterImageOriginal);

    return (
      JSON.stringify(previousCharacterImage) !== JSON.stringify(updatedCharacterImage) ||
      JSON.stringify(previousCharacterImageOriginal) !== JSON.stringify(updatedCharacterImageOriginal)
    );
  }

  return false;
};

/**
 * @route GET /api/books
 */
exports.getAllBooks = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const books = await Book.find(filter).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: books.length,
      data: books,
    });
  } catch (error) {
    console.error('Error fetching books:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch books',
      error: error.message,
    });
  }
};

/**
 * @route GET /api/books/:id
 */
exports.getBookById = async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);

    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found',
      });
    }

    const hydratedBook = await hydrateBookDocument(book);

    res.status(200).json({
      success: true,
      data: hydratedBook || book,
    });
  } catch (error) {
    console.error('Error fetching book:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch book',
      error: error.message,
    });
  }
};

/**
 * @route POST /api/books
 */
exports.createBook = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
    });
  }

  const uploadedKeys = [];

  try {
    const { name, description, gender, status } = req.body;
    const pagesRaw = parsePagesPayload(req.body.pages);

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Book name is required',
      });
    }

    const pagesPayload = pagesRaw.map((page, index) => {
      const promptValue =
        normalizeString(page?.prompt) || normalizeString(page?.characterPrompt);

      return {
        order: Number(page.order) || index + 1,
        text: typeof page.text === 'string' ? page.text : '',
        characterPrompt: promptValue,
        hasNewImage: normalizeBoolean(page.hasNewImage),
      };
    });

    if (!pagesPayload.length) {
      return res.status(400).json({
        success: false,
        message: 'Provide at least one page for the book',
      });
    }

    const slug = `${slugify(name)}-${Date.now()}`;
    const coverFile = req.files?.coverImage?.[0];
    const pageImageFiles = req.files?.pageImages || [];

    let coverImage = null;
    if (coverFile) {
      const coverKey = generateBookCoverKey(slug, coverFile.originalname);
      const { url } = await uploadBufferToS3(coverFile.buffer, coverKey, coverFile.mimetype, {
        acl: 'public-read',
      });
      uploadedKeys.push(coverKey);
      coverImage = buildImageResponse(coverFile, coverKey, url);
    }

    let pageImageCursor = 0;
    const pages = [];

    for (let index = 0; index < pagesPayload.length; index += 1) {
      const pageDefinition = pagesPayload[index];
      const pageData = {
        order: pageDefinition.order,
        text: pageDefinition.text,
        characterPrompt: normalizeString(pageDefinition.characterPrompt),
      };

      if (pageDefinition.hasNewImage) {
        const file = pageImageFiles[pageImageCursor];
        if (!file) {
          throw new Error(`Missing background image for page at position ${index + 1}`);
        }
        pageImageCursor += 1;
        const key = generateBookPageImageKey(slug, pageData.order, file.originalname);
        const { url } = await uploadBufferToS3(file.buffer, key, file.mimetype, {
          acl: 'public-read',
        });
        uploadedKeys.push(key);
        pageData.backgroundImage = buildImageResponse(file, key, url);
      }

      pages.push(pageData);
    }

    if (pageImageCursor !== pageImageFiles.length) {
      throw new Error(
        `Received ${pageImageFiles.length} page images but only ${
          pageImageCursor
        } were mapped. Ensure files align with pages.`
      );
    }

    const book = await Book.create({
      name,
      description,
      gender,
      status: status || 'active',
      slug,
      coverImage,
      pages,
    });

    res.status(201).json({
      success: true,
      message: 'Book created successfully',
      data: book,
    });
  } catch (error) {
    console.error('Error creating book:', error);
    await cleanupKeys(uploadedKeys);
    res.status(500).json({
      success: false,
      message: 'Failed to create book',
      error: error.message,
    });
  }
};

/**
 * @route PUT /api/books/:id
 */
exports.updateBook = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array(),
    });
  }

  const uploadedKeys = [];
  const keysToDelete = [];

  try {
    const { id } = req.params;
    const { name, description, gender, status } = req.body;
    const coverAction = (req.body.coverAction || 'keep').toLowerCase();

    const book = await Book.findById(id);
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found',
      });
    }

    const slug = book.slug || `${slugify(book.name)}-${Date.now()}`;
    const coverFile = req.files?.coverImage?.[0];
    const pageImageFiles = req.files?.pageImages || [];

    if (coverAction === 'replace' && !coverFile) {
      return res.status(400).json({
        success: false,
        message: 'Provide a cover image to replace the existing one',
      });
    }

    let coverImage = book.coverImage;
    if (coverAction === 'replace' && coverFile) {
      const key = generateBookCoverKey(slug, coverFile.originalname);
      const { url } = await uploadBufferToS3(coverFile.buffer, key, coverFile.mimetype, {
        acl: 'public-read',
      });
      uploadedKeys.push(key);
      if (coverImage?.key) {
        keysToDelete.push(coverImage.key);
      }
      coverImage = buildImageResponse(coverFile, key, url);
    } else if (coverAction === 'remove') {
      if (coverImage?.key) {
        keysToDelete.push(coverImage.key);
      }
      coverImage = null;
    }

    const pagesRaw = parsePagesPayload(req.body.pages);
    if (!pagesRaw.length) {
      return res.status(400).json({
        success: false,
        message: 'Provide at least one page for the book',
      });
    }

    const existingPagesMap = new Map(
      book.pages.map((page) => [page._id.toString(), page.toObject()])
    );
    const providedPageIds = new Set();
    const pages = [];
    let pageImageCursor = 0;

    for (let index = 0; index < pagesRaw.length; index += 1) {
      const incoming = pagesRaw[index];
      const pageId = incoming.id || incoming._id;
      const hasNewImage = normalizeBoolean(incoming.hasNewImage);
      const removeImage = normalizeBoolean(incoming.removeImage);
      const order = Number(incoming.order) || index + 1;
      const text = typeof incoming.text === 'string' ? incoming.text : '';
      const existing = pageId ? existingPagesMap.get(pageId) : null;
      const incomingPrompt =
        normalizeString(incoming.prompt) ||
        normalizeString(incoming.characterPrompt) ||
        normalizeString(existing?.characterPrompt);

      if (pageId) {
        providedPageIds.add(pageId);
      }

      const pageData = {
        order,
        text,
        characterPrompt: incomingPrompt,
      };

      if (pageId && existing) {
        pageData._id = existing._id;
      }

      let backgroundImage = existing?.backgroundImage || existing?.characterImage || null;

      if (hasNewImage) {
        const file = pageImageFiles[pageImageCursor];
        if (!file) {
          throw new Error(`Missing background image for page at position ${index + 1}`);
        }
        pageImageCursor += 1;

        if (backgroundImage?.key) {
          keysToDelete.push(backgroundImage.key);
        }

        const key = generateBookPageImageKey(slug, order, file.originalname);
        const { url } = await uploadBufferToS3(file.buffer, key, file.mimetype, {
          acl: 'public-read',
        });
        uploadedKeys.push(key);
        backgroundImage = buildImageResponse(file, key, url);
      } else if (removeImage) {
        if (backgroundImage?.key) {
          keysToDelete.push(backgroundImage.key);
        }
        backgroundImage = null;
      } else if (!backgroundImage && existing?.characterImage) {
        backgroundImage = existing.characterImage; // compatibility fallback
      }

      if (backgroundImage) {
        pageData.backgroundImage = backgroundImage;
      } else {
        pageData.backgroundImage = null;
      }

      pages.push(pageData);
    }

    if (pageImageCursor !== pageImageFiles.length) {
      throw new Error(
        `Received ${pageImageFiles.length} page images but only ${
          pageImageCursor
        } were mapped. Ensure files align with pages.`
      );
    }

    for (const existingPage of book.pages) {
      const idString = existingPage._id.toString();
      if (!providedPageIds.has(idString)) {
        if (existingPage.backgroundImage?.key) {
          keysToDelete.push(existingPage.backgroundImage.key);
        } else if (existingPage.characterImage?.key) {
          keysToDelete.push(existingPage.characterImage.key);
        }
      }
    }

    if (typeof name !== 'undefined') {
      book.name = name;
    }
    if (typeof description !== 'undefined') {
      book.description = description;
    }
    if (typeof gender !== 'undefined') {
      book.gender = gender;
    }
    if (typeof status !== 'undefined') {
      book.status = status;
    }
    book.coverImage = coverImage;
    book.pages = pages;

    const updatedBook = await book.save();

    await cleanupKeys(keysToDelete);

    res.status(200).json({
      success: true,
      message: 'Book updated successfully',
      data: updatedBook,
    });
  } catch (error) {
    console.error('Error updating book:', error);
    await cleanupKeys(uploadedKeys);
    res.status(500).json({
      success: false,
      message: 'Failed to update book',
      error: error.message,
    });
  }
};

/**
 * @route DELETE /api/books/:id
 */
exports.deleteBook = async (req, res) => {
  try {
    const { id } = req.params;
    const book = await Book.findById(id);

    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found',
      });
    }

    const keysToDelete = [];

    if (book.coverImage?.key) {
      keysToDelete.push(book.coverImage.key);
    }
    book.pages.forEach((page) => {
      if (page.backgroundImage?.key) {
        keysToDelete.push(page.backgroundImage.key);
      } else if (page.characterImage?.key) {
        keysToDelete.push(page.characterImage.key);
      }
    });
    book.pdfAssets.forEach((asset) => {
      if (asset.key) {
        keysToDelete.push(asset.key);
      }
    });

    await Book.findByIdAndDelete(id);
    await cleanupKeys(keysToDelete);

    res.status(200).json({
      success: true,
      message: 'Book deleted successfully',
      data: {},
    });
  } catch (error) {
    console.error('Error deleting book:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete book',
      error: error.message,
    });
  }
};

/**
 * @route GET /api/books/:id/storybooks
 */
exports.getBookStorybooks = async (req, res) => {
  try {
    const { id } = req.params;
    const book = await Book.findById(id);

    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found',
      });
    }

    const pdfAssets = Array.isArray(book.pdfAssets) ? book.pdfAssets : [];

    res.status(200).json({
      success: true,
      count: pdfAssets.length,
      data: await Promise.all(
        pdfAssets.map(async (asset) => {
          const clonedAsset = cloneDocument(asset) || {};
          clonedAsset.pages = await attachFreshSignedUrlsToPages(clonedAsset.pages || [], {
            bookPages: book.pages || [],
          });
          return clonedAsset;
        })
      ),
    });
  } catch (error) {
    console.error('Error fetching storybooks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch storybooks',
      error: error.message,
    });
  }
};

/**
 * @route GET /api/books/:id/storybooks/:assetId/pages
 */
exports.getStorybookAssetPages = async (req, res) => {
  try {
    const { id: bookId, assetId } = req.params;
    const book = await Book.findById(bookId);

    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found',
      });
    }

    const pdfAsset =
      book.pdfAssets.id(assetId) ||
      book.pdfAssets.find((asset) => asset.key === assetId);

    if (!pdfAsset) {
      return res.status(404).json({
        success: false,
        message: 'Storybook asset not found',
      });
    }

    const pages = await attachFreshSignedUrlsToPages(pdfAsset.pages || [], {
      bookPages: book.pages || [],
    });

    res.status(200).json({
      success: true,
      data: {
        pages,
      },
    });
  } catch (error) {
    console.error('Error fetching storybook pages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch storybook pages',
      error: error.message,
    });
  }
};

/**
 * @route POST /api/books/:id/storybooks
 */
exports.generateStorybook = async (req, res) => {
  const temporaryUploads = [];
  try {
    const { id } = req.params;
    const { title } = req.body;
    const pagesPayload = parsePagesPayload(req.body.pages);
    const readerId = normalizeString(req.body.readerId);
    let readerName = normalizeString(req.body.readerName);

    const book = await Book.findById(id);
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found',
      });
    }

    if (!pagesPayload.length) {
      return res.status(400).json({
        success: false,
        message: 'Provide at least one page definition to generate the storybook',
      });
    }

    if (!book.pages.length) {
      return res.status(400).json({
        success: false,
        message: 'Book has no pages to build a story from',
      });
    }

    if (!readerName && readerId) {
      const reader = await User.findById(readerId).select('name').lean();
      if (reader?.name) {
        readerName = normalizeString(reader.name);
      }
    }

    const characterFiles = req.files?.characterImages || [];
    let characterCursor = 0;
    const bookSlug = book.slug || `${slugify(book.name)}-${book._id.toString().slice(-6)}`;
    const pagesById = new Map(book.pages.map((page) => [page._id.toString(), page]));

    const storyPages = [];

    let backgroundRemovalApplied = false;

    for (let index = 0; index < pagesPayload.length; index += 1) {
      const inputPage = pagesPayload[index];
      const pageId = inputPage.id || inputPage._id || inputPage.bookPageId;
      const requestedOrder = Number(inputPage.order) || 0;

      let bookPage = null;
      if (pageId) {
        bookPage = pagesById.get(String(pageId));
      }
      if (!bookPage && requestedOrder > 0) {
        bookPage = book.pages.find((page) => page.order === requestedOrder) || null;
      }
      if (!bookPage) {
        bookPage = book.pages[index] || null;
      }

      if (!bookPage) {
        throw new Error(`Unable to locate book page for entry at position ${index + 1}`);
      }

      const order = requestedOrder || bookPage.order || index + 1;

      const backgroundSource = await buildAssetPayload(
        bookPage.backgroundImage || bookPage.characterImage || null
      );

      let characterSource = null;
      if (normalizeBoolean(inputPage.hasCharacterUpload)) {
        const file = characterFiles[characterCursor];
        if (!file) {
          throw new Error(`Missing character image for page ${index + 1}`);
        }
        characterCursor += 1;
        const characterKey = generateBookCharacterOverlayKey(bookSlug, order, file.originalname);
        const { url } = await uploadBufferToS3(file.buffer, characterKey, file.mimetype, {
          acl: 'public-read',
        });
        characterSource = await buildAssetPayload({
          key: characterKey,
          url,
          contentType: file.mimetype,
          originalName: file.originalname,
          size: file.size,
        });
        temporaryUploads.push(characterKey);
      } else if (inputPage.characterUrl) {
        const rawUrl = typeof inputPage.characterUrl === 'string' ? inputPage.characterUrl.trim() : '';
        if (rawUrl) {
          characterSource = {
            url: rawUrl,
            signedUrl: rawUrl,
            contentType: 'image/png',
          };
        }
      }
      const includeCharacter = Boolean(characterSource);

      const baseText =
        typeof inputPage.text === 'string' && inputPage.text.trim().length > 0
          ? inputPage.text
          : bookPage.text || '';
      const pageText = replaceReaderPlaceholders(baseText, readerName);
      const baseQuote = inputPage.hebrewQuote || inputPage.quote || '';
      const resolvedQuote = replaceReaderPlaceholders(baseQuote, readerName);

      const storyPage = {
        order,
        text: pageText,
        quote: resolvedQuote,
        background: backgroundSource,
        character: includeCharacter ? characterSource : null,
        characterOriginal: includeCharacter ? characterSource : null,
        useCharacter: includeCharacter,
        characterPosition: inputPage.characterPosition || 'auto',
        candidateAssets: [],
        generationId: null,
        selectedCandidateIndex: null,
      };

      console.log('[storybook] Prepared page', {
        order: storyPage.order,
        hasBackground: Boolean(storyPage.background),
        backgroundUrl: storyPage.background?.url,
        hasCharacter: Boolean(storyPage.character),
        characterUrl: storyPage.character?.url,
        quote: storyPage.quote,
        readerName,
      });

      const removalApplied = await ensureBackgroundRemovedCharacter({
        book,
        bookSlug,
        storyPage,
        bookPage,
      });

      backgroundRemovalApplied = backgroundRemovalApplied || removalApplied;
      storyPages.push(storyPage);
    }

    if (characterCursor !== characterFiles.length) {
      throw new Error(
        `Received ${characterFiles.length} character images but only ${characterCursor} were mapped. Ensure files align with pages.`
      );
    }

    const finalTitle = title || `${book.name} Storybook`;

    const { buffer: pdfBuffer, pageCount } = await generateStorybookPdf({
      title: finalTitle,
      pages: storyPages,
    });

    const pdfKey = generateBookPdfKey(bookSlug, finalTitle);
    const { url } = await uploadBufferToS3(pdfBuffer, pdfKey, 'application/pdf', { acl: 'public-read' });

    const now = new Date();
    const pagesSnapshot = storyPages.map((page) => ({
      order: page.order,
      text: page.text || '',
      quote: page.quote || '',
      background: sanitizeAssetForSnapshot(page.background),
      character: sanitizeAssetForSnapshot(page.character),
      characterOriginal: sanitizeAssetForSnapshot(page.characterOriginal),
      generationId: page.generationId || null,
      candidateAssets: sanitizeAssetListForSnapshot(page.candidateAssets),
      selectedCandidateIndex: Number.isFinite(page.selectedCandidateIndex)
        ? page.selectedCandidateIndex
        : null,
      rankingSummary: page.rankingSummary || '',
      rankingNotes: Array.isArray(page.rankingNotes) ? page.rankingNotes : [],
      updatedAt: now,
    }));

    const pdfAsset = {
      key: pdfKey,
      url,
      size: pdfBuffer.length,
      contentType: 'application/pdf',
      title: finalTitle,
      pageCount,
      createdAt: now,
      updatedAt: now,
      trainingId: null,
      storybookJobId: null,
      readerId: readerId || null,
      readerName: readerName || '',
      userId: readerId || null,
      pages: pagesSnapshot,
    };

    book.pdfAssets.push(pdfAsset);
    // Character assignments mutate nested page documents; ensure Mongoose persists them.
    book.markModified('pages');
    await book.save();

    // Don't delete keys that were used for background-removed character images
    const keysToKeep = new Set();
    for (const page of book.pages) {
      if (page.characterImage?.key && page.characterImage.backgroundRemoved) {
        keysToKeep.add(page.characterImage.key);
      }
    }
    const keysToDelete = temporaryUploads.filter(key => !keysToKeep.has(key));
    await cleanupKeys(keysToDelete);

    const hydratedPages = await attachFreshSignedUrlsToPages(pdfAsset.pages || [], {
      bookPages: book.pages || [],
    });

    res.status(201).json({
      success: true,
      message: 'Storybook generated successfully',
      data: {
        ...pdfAsset,
        pages: hydratedPages,
      },
    });
  } catch (error) {
    console.error('Error generating storybook:', error);
    await cleanupKeys(temporaryUploads);
    res.status(500).json({
      success: false,
      message: 'Failed to generate storybook',
      error: error.message,
    });
  }
};

/**
 * @route POST /api/books/:id/storybooks/:assetId/pages/:pageOrder/regenerate
 */
exports.regenerateStorybookPage = async (req, res) => {
  try {
    const { id: bookId, assetId, pageOrder } = req.params;
    const {
      trainingId: trainingIdOverride,
      userId: userIdOverride,
      readerId: readerIdOverride,
      readerName: readerNameOverride,
    } = req.body || {};

    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found',
      });
    }

    const pdfAsset =
      book.pdfAssets.id(assetId) ||
      book.pdfAssets.find((asset) => asset.key === assetId);

    if (!pdfAsset) {
      return res.status(404).json({
        success: false,
        message: 'Storybook asset not found',
      });
    }

    const trainingId = trainingIdOverride || pdfAsset.trainingId;
    if (!trainingId) {
      return res.status(400).json({
        success: false,
        message: 'Training ID is required to regenerate this page',
      });
    }

    const userId = userIdOverride || pdfAsset.userId || pdfAsset.readerId;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User context is required to regenerate this page',
      });
    }

    const readerId = readerIdOverride || pdfAsset.readerId || userId;
    const readerName = readerNameOverride || pdfAsset.readerName || '';

    const result = await regenerateStorybookPageService({
      bookId,
      assetId: pdfAsset._id ? pdfAsset._id.toString() : pdfAsset.key,
      pageOrder,
      trainingId,
      userId,
      readerId,
      readerName,
    });

    const hydratedPdfAssetPage = result.pdfAssetPage
      ? (
          await attachFreshSignedUrlsToPages([result.pdfAssetPage], {
            bookPages: result.page ? [result.page] : book.pages || [],
          })
        )[0]
      : null;

    const hydratedBookPage = result.page
      ? {
          ...cloneDocument(result.page),
          backgroundImage: await attachFreshSignedUrl(result.page.backgroundImage),
          characterImage: await attachFreshSignedUrl(result.page.characterImage),
          characterImageOriginal: await attachFreshSignedUrl(
            result.page.characterImageOriginal
          ),
        }
      : null;

    const hydratedCharacterAsset = await attachFreshSignedUrl(result.characterAsset);

    res.status(200).json({
      success: true,
      message: 'Storybook page regenerated successfully',
      data: {
        page: hydratedBookPage,
        pdfAssetPage: hydratedPdfAssetPage,
        characterAsset: hydratedCharacterAsset,
        winner: result.winner,
        generation: result.generation,
      },
    });
  } catch (error) {
    console.error('Error regenerating storybook page:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to regenerate storybook page',
      error: error.message,
    });
  }
};

exports.regenerateStorybookPdf = async (req, res) => {
  try {
    const { id: bookId, assetId } = req.params;
    const { title: overrideTitle } = req.body || {};

    const book = await Book.findById(bookId);
    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found',
      });
    }

    const pdfAssetDoc =
      (mongoose.Types.ObjectId.isValid(assetId) && book.pdfAssets.id(assetId)) ||
      book.pdfAssets.find((asset) => asset.key === assetId);

    if (!pdfAssetDoc) {
      return res.status(404).json({
        success: false,
        message: 'Storybook asset not found',
      });
    }

    const sortedBookPages = (book.pages || [])
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    if (!sortedBookPages.length) {
      return res.status(400).json({
        success: false,
        message: 'Book has no pages to rebuild the PDF',
      });
    }

    const bookSlug = book.slug || `${slugify(book.name)}-${book._id.toString().slice(-6)}`;
    const storyPages = [];
    let backgroundRemovalApplied = false;

    for (const bookPage of sortedBookPages) {
      const snapshot = (pdfAssetDoc.pages || []).find((page) => page.order === bookPage.order) || {};

      const backgroundSource = bookPage.backgroundImage
        ? await attachFreshSignedUrl(bookPage.backgroundImage)
        : snapshot.background
        ? await attachFreshSignedUrl(snapshot.background)
        : null;

      const characterSource = bookPage.characterImage
        ? await attachFreshSignedUrl(bookPage.characterImage)
        : snapshot.character
        ? await attachFreshSignedUrl(snapshot.character)
        : null;

      const originalCharacterSource = bookPage.characterImageOriginal
        ? await attachFreshSignedUrl(bookPage.characterImageOriginal)
        : snapshot.characterOriginal
        ? await attachFreshSignedUrl(snapshot.characterOriginal)
        : null;

      const storyPage = {
        order: bookPage.order,
        text: snapshot.text || bookPage.text || '',
        quote: snapshot.quote || '',
        background: backgroundSource,
        character: characterSource,
        characterOriginal: originalCharacterSource,
        useCharacter: Boolean(characterSource),
        characterPosition: snapshot.characterPosition || 'auto',
        rankingSummary: snapshot.rankingSummary || '',
        rankingNotes: Array.isArray(snapshot.rankingNotes) ? snapshot.rankingNotes : [],
        candidateAssets: sanitizeAssetListForSnapshot(snapshot.candidateAssets || []),
        generationId: snapshot.generationId || null,
        selectedCandidateIndex: Number.isFinite(snapshot.selectedCandidateIndex)
          ? snapshot.selectedCandidateIndex
          : null,
      };

      const removalApplied = await ensureBackgroundRemovedCharacter({
        book,
        bookSlug,
        storyPage,
        bookPage,
      });

      backgroundRemovalApplied = backgroundRemovalApplied || removalApplied;
      storyPages.push(storyPage);
    }

    if (!storyPages.length) {
      return res.status(400).json({
        success: false,
        message: 'Unable to resolve story pages for regeneration',
      });
    }

    const finalTitle = overrideTitle || pdfAssetDoc.title || `${book.name} Storybook`;
    const { buffer: pdfBuffer, pageCount } = await generateStorybookPdf({
      title: finalTitle,
      pages: storyPages,
    });

    await uploadBufferToS3(pdfBuffer, pdfAssetDoc.key, 'application/pdf', { acl: 'public-read' });

    const now = new Date();
    const pagesSnapshot = storyPages.map((page) => ({
      order: page.order,
      text: page.text || '',
      quote: page.quote || '',
      background: sanitizeAssetForSnapshot(page.background),
      character: sanitizeAssetForSnapshot(page.character),
      characterOriginal: sanitizeAssetForSnapshot(page.characterOriginal),
      generationId: page.generationId || null,
      candidateAssets: sanitizeAssetListForSnapshot(page.candidateAssets),
      selectedCandidateIndex: Number.isFinite(page.selectedCandidateIndex)
        ? page.selectedCandidateIndex
        : null,
      rankingSummary: page.rankingSummary || '',
      rankingNotes: Array.isArray(page.rankingNotes) ? page.rankingNotes : [],
      updatedAt: now,
    }));

    pdfAssetDoc.title = finalTitle;
    pdfAssetDoc.size = pdfBuffer.length;
    pdfAssetDoc.pageCount = pageCount;
    pdfAssetDoc.updatedAt = now;
    pdfAssetDoc.pages = pagesSnapshot;

    if (backgroundRemovalApplied) {
      book.markModified('pages');
    }
    book.markModified('pdfAssets');
    await book.save();

    const hydratedPages = await attachFreshSignedUrlsToPages(pagesSnapshot, {
      bookPages: book.pages || [],
    });

    res.status(200).json({
      success: true,
      message: 'Storybook PDF regenerated successfully',
      data: {
        ...cloneDocument(pdfAssetDoc),
        pages: hydratedPages,
      },
    });
  } catch (error) {
    console.error('Error regenerating storybook PDF:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to regenerate storybook PDF',
      error: error.message,
    });
  }
};

exports.selectStorybookPageCandidate = async (req, res) => {
  try {
    const { id: bookId, assetId, pageOrder } = req.params;
    const { candidateIndex } = req.body || {};

    const result = await applyStorybookCandidateSelection({
      bookId,
      assetId,
      pageOrder,
      candidateIndex,
    });

    const hydratedPages = result.pdfAssetPage
      ? await attachFreshSignedUrlsToPages([result.pdfAssetPage], {
          bookPages: result.page ? [result.page] : [],
        })
      : [];

    const hydratedCharacter = await attachFreshSignedUrl(result.characterAsset);
    const hydratedBookPage = result.page
      ? {
          ...result.page,
          backgroundImage: await attachFreshSignedUrl(result.page.backgroundImage),
          characterImage: await attachFreshSignedUrl(result.page.characterImage),
          characterImageOriginal: await attachFreshSignedUrl(
            result.page.characterImageOriginal
          ),
        }
      : null;

    res.status(200).json({
      success: true,
      message: 'Candidate image applied successfully',
      data: {
        page: hydratedBookPage,
        pdfAssetPage: hydratedPages[0] || null,
        characterAsset: hydratedCharacter,
        candidateIndex: result.candidateIndex,
      },
    });
  } catch (error) {
    console.error('Error applying storybook candidate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to apply storybook candidate',
      error: error.message,
    });
  }
};

/**
 * @route PATCH /api/books/:id/status
 */
exports.updateBookStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be active or inactive',
      });
    }

    const book = await Book.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!book) {
      return res.status(404).json({
        success: false,
        message: 'Book not found',
      });
    }

    res.status(200).json({
      success: true,
      message: `Book ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
      data: book,
    });
  } catch (error) {
    console.error('Error updating book status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update book status',
      error: error.message,
    });
  }
};
