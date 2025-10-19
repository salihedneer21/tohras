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
const { generateStorybookPdf } = require('../utils/pdfGenerator');

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
    size: asset.size,
    contentType: asset.contentType,
    uploadedAt: asset.uploadedAt,
    originalName: asset.originalName,
  };
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

    res.status(200).json({
      success: true,
      data: book,
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

    res.status(200).json({
      success: true,
      count: book.pdfAssets.length,
      data: book.pdfAssets,
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
        useCharacter: includeCharacter,
        characterPosition: inputPage.characterPosition || 'auto',
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

    const pdfAsset = {
      key: pdfKey,
      url,
      size: pdfBuffer.length,
      contentType: 'application/pdf',
      title: finalTitle,
      pageCount,
      createdAt: new Date(),
    };

    book.pdfAssets.push(pdfAsset);
    await book.save();
    await cleanupKeys(temporaryUploads);

    res.status(201).json({
      success: true,
      message: 'Storybook generated successfully',
      data: pdfAsset,
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
