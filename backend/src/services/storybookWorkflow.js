const mongoose = require('mongoose');
const Book = require('../models/Book');
const User = require('../models/User');
const Training = require('../models/Training');
const Generation = require('../models/Generation');
const StorybookJob = require('../models/StorybookJob');
const {
  uploadBufferToS3,
  generateBookCharacterOverlayKey,
  generateBookPdfKey,
  getSignedUrlForKey,
} = require('../config/s3');
const { generateStorybookPdf, removeBackground } = require('../utils/pdfGenerator');
const { emitStorybookUpdate } = require('./storybookEvents');
const { dispatchGenerationAttempt, populateForClient, broadcastGeneration } = require('./generationWorkflow');
const { subscribeToGenerationUpdates } = require('./generationEvents');

const MAX_GENERATION_WAIT_TIME_MS = Number(process.env.STORYBOOK_PAGE_TIMEOUT_MS || 15 * 60 * 1000);
const PAGE_CONCURRENCY = Math.max(
  1,
  Number(process.env.STORYBOOK_PAGE_CONCURRENCY || 2)
);

const generationWaiters = new Map();

subscribeToGenerationUpdates((payload) => {
  if (!payload?._id) return;
  const generationId = String(payload._id);
  const entry = generationWaiters.get(generationId);
  if (!entry) return;
  try {
    entry.onUpdate(payload);
    if (payload.status === 'succeeded') {
      generationWaiters.delete(generationId);
      entry.resolve(payload);
    } else if (payload.status === 'failed') {
      generationWaiters.delete(generationId);
      const errorMessage = payload.error || 'Generation failed';
      entry.reject(new Error(errorMessage));
    }
  } catch (error) {
    console.warn(`[storybook] watcher for generation ${generationId} threw:`, error);
  }
});

const clamp = (value, min, max) => {
  const num = Number(value);
  if (Number.isNaN(num)) return min;
  if (num < min) return min;
  if (num > max) return max;
  return num;
};

const slugify = (value) =>
  (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const replaceReaderPlaceholders = (value, readerName) => {
  if (!value || typeof value !== 'string') return value || '';
  if (!readerName) return value;
  return value.replace(/\{name\}/gi, readerName);
};

const createEvent = (type, message, metadata = null) => ({
  type,
  message,
  metadata,
  timestamp: new Date(),
});

const computeAveragePageProgress = (pages = []) => {
  if (!pages.length) return 0;
  const total = pages.reduce((sum, page) => sum + (page?.progress || 0), 0);
  return clamp(total / pages.length, 0, 100);
};

const computeJobProgress = (job) => {
  if (!job) return 0;
  if (job.status === 'succeeded') return 100;
  if (job.status === 'failed') return clamp(job.progress || 0, 0, 100);

  const average = computeAveragePageProgress(job.pages);
  if (job.status === 'assembling') {
    const assemblyProgress =
      (job.metadata && typeof job.metadata.assemblyProgress === 'number'
        ? clamp(job.metadata.assemblyProgress, 0, 10)
        : 0) || 0;
    return clamp(90 + assemblyProgress, 0, 100);
  }

  return Math.floor((average * 0.9) / 1);
};

const computeEtaSeconds = (job, progress) => {
  if (!job?.startedAt) return null;
  if (!Number.isFinite(progress) || progress <= 0 || progress >= 100) return null;
  const elapsedSeconds = (Date.now() - new Date(job.startedAt).getTime()) / 1000;
  if (elapsedSeconds <= 0) return null;
  const rate = progress / elapsedSeconds; // percent per second
  if (rate <= 0) return null;
  const remaining = (100 - progress) / rate;
  if (!Number.isFinite(remaining) || remaining < 0) return null;
  return Math.round(remaining);
};

const syncComputedFields = async (jobDoc) => {
  if (!jobDoc) return null;
  const jobPlain = jobDoc.toObject({ depopulate: true });
  const progress = computeJobProgress(jobPlain);
  const eta = computeEtaSeconds(jobPlain, progress);
  let needsSave = false;

  if (jobDoc.progress !== progress) {
    jobDoc.progress = progress;
    needsSave = true;
  }
  if (
    (eta === null && jobDoc.estimatedSecondsRemaining !== null) ||
    (eta !== null && jobDoc.estimatedSecondsRemaining !== eta)
  ) {
    jobDoc.estimatedSecondsRemaining = eta;
    needsSave = true;
  }

  if (needsSave) {
    await jobDoc.save();
  }

  const snapshot = jobDoc.toObject({ depopulate: true });
  snapshot.progress = progress;
  snapshot.estimatedSecondsRemaining = eta;
  return snapshot;
};

const emitJob = (jobDoc) => {
  if (!jobDoc) return null;
  const snapshot =
    typeof jobDoc.toObject === 'function' ? jobDoc.toObject({ depopulate: true }) : jobDoc;
  const progress = computeJobProgress(snapshot);
  const eta = computeEtaSeconds(snapshot, progress);
  snapshot.progress = progress;
  snapshot.estimatedSecondsRemaining = eta;
  emitStorybookUpdate(snapshot);
  return snapshot;
};

const updateJobAndEmit = async ({ jobId, update, arrayFilters }) => {
  const options = { new: true };
  if (Array.isArray(arrayFilters)) {
    options.arrayFilters = arrayFilters;
  }

  const jobDoc = await StorybookJob.findOneAndUpdate({ _id: jobId }, update, options);
  if (!jobDoc) return null;
  const snapshot = await syncComputedFields(jobDoc);
  emitStorybookUpdate(snapshot);
  return snapshot;
};

const registerGenerationWaiter = ({ generationId, jobId, pageId, pageOrder }) => {
  const generationKey = String(generationId);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (generationWaiters.has(generationKey)) {
        generationWaiters.delete(generationKey);
        reject(new Error('Generation timed out while waiting for completion'));
      }
    }, MAX_GENERATION_WAIT_TIME_MS);

    const clear = () => clearTimeout(timeout);

    generationWaiters.set(generationKey, {
      resolve: (payload) => {
        clear();
        resolve(payload);
      },
      reject: (error) => {
        clear();
        reject(error);
      },
      onUpdate: (payload) => handleGenerationUpdate({ payload, jobId, pageId, pageOrder }),
    });
  });
};

const waitForStandaloneGeneration = (generationId) => {
  const generationKey = String(generationId);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Generation timed out while waiting for completion'));
    }, MAX_GENERATION_WAIT_TIME_MS);

    let unsubscribe = null;
    const cleanup = () => {
      clearTimeout(timeout);
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    };

    const listener = (payload) => {
      if (!payload?._id) return;
      if (String(payload._id) !== generationKey) return;

      if (payload.status === 'succeeded') {
        cleanup();
        resolve(payload);
      } else if (payload.status === 'failed') {
        cleanup();
        const errorMessage = payload.error || 'Generation failed';
        reject(new Error(errorMessage));
      }
    };

    unsubscribe = subscribeToGenerationUpdates(listener);
  });
};

const handleGenerationUpdate = async ({ payload, jobId, pageId, pageOrder }) => {
  const pageFilter = [];
  if (pageId) {
    const objectId =
      typeof pageId === 'string' ? new mongoose.Types.ObjectId(pageId) : pageId;
    pageFilter.push({ 'page.pageId': objectId });
  } else if (typeof pageOrder === 'number') {
    pageFilter.push({ 'page.order': pageOrder });
  }

  const arrayFilters = pageFilter.length
    ? pageFilter
    : [{ 'page.order': payload.generationConfig?.pageOrder || payload.storybookContext?.pageOrder }];

  const events = [];

  const progress = clamp(payload.progress || 0, 0, 100);

  let status = 'generating';
  if (payload.status === 'failed') {
    status = 'failed';
  } else if (payload.ranking && payload.ranking.winners && payload.ranking.winners.length) {
    status = 'completed';
  } else if (
    Array.isArray(payload.events) &&
    payload.events.some((event) => event?.type === 'ranking')
  ) {
    status = 'ranking';
  }

  const update = {
    $set: {
      'pages.$[page].progress': progress,
      'pages.$[page].status': status,
    },
  };

  if (payload.status === 'failed') {
    update.$set['pages.$[page].error'] = payload.error || 'Generation failed';
  }

  update.$push = {
    'pages.$[page].events': createEvent('generation-update', `Generation ${payload.status}`, {
      generationId: payload._id,
      status: payload.status,
      progress,
    }),
  };

  await updateJobAndEmit({
    jobId,
    update,
    arrayFilters,
  });
};

const attachJobEvent = async (jobId, event) => {
  await updateJobAndEmit({
    jobId,
    update: {
      $push: { events: event },
    },
  });
};

const attachPageEvent = async (jobId, pageFilter, event) => {
  await updateJobAndEmit({
    jobId,
    update: {
      $push: {
        'pages.$[page].events': event,
      },
    },
    arrayFilters: [pageFilter],
  });
};

const resolveArrayFilterForPage = (page) => {
  if (page.pageId) {
    const objectId =
      typeof page.pageId === 'string' ? new mongoose.Types.ObjectId(page.pageId) : page.pageId;
    return { 'page.pageId': objectId };
  }
  return { 'page.order': page.order };
};

const copyAssetToBookCharacterSlot = async ({ book, page, asset }) => {
  if (!asset?.key) {
    throw new Error('Generation asset is missing S3 key');
  }

  const source = { ...asset };

  const bookSlug = book.slug || `${slugify(book.name)}-${book._id.toString().slice(-6)}`;
  const key = generateBookCharacterOverlayKey(
    bookSlug,
    page.order,
    asset.originalName || `character-${page.order}.png`
  );

  const originalBuffer = await downloadFromS3(asset.key);
  if (!originalBuffer || !originalBuffer.length) {
    throw new Error(`Failed to download asset buffer for page ${page.order}`);
  }

  if (!source.signedUrl && source.key) {
    source.signedUrl = await getSignedUrlForKey(source.key).catch(() => source.url || null);
  }

  let processedBuffer = null;
  let backgroundRemoved = Boolean(asset.backgroundRemoved);

  if (backgroundRemoved) {
    processedBuffer = originalBuffer;
  } else {
    try {
      const removalBuffer = await removeBackground(source);
      if (removalBuffer && removalBuffer.length) {
        processedBuffer = removalBuffer;
        backgroundRemoved = true;
      }
    } catch (error) {
      console.warn(
        `[storybook] background removal failed for page ${page.order}:`,
        error.message
      );
    }
  }

  if (!processedBuffer || !processedBuffer.length) {
    processedBuffer = originalBuffer;
    backgroundRemoved = false;
  }

  if (!processedBuffer || !processedBuffer.length) {
    throw new Error(`Unable to obtain character buffer for page ${page.order}`);
  }

  const contentType = backgroundRemoved ? 'image/png' : asset.contentType || 'image/png';
  const { url } = await uploadBufferToS3(processedBuffer, key, contentType, { acl: 'public-read' });
  const signedUrl = await getSignedUrlForKey(key).catch(() => null);

  return {
    key,
    url,
    signedUrl: signedUrl || url,
    size: processedBuffer.length,
    contentType,
    uploadedAt: new Date(),
    originalName: asset.originalName || `character-${page.order}.png`,
    backgroundRemoved,
  };
};

const updateBookCharacterImage = async ({ bookId, page, newAsset }) => {
  const hasPageId = Boolean(page.pageId);
  const arrayFilters = [];

  if (hasPageId) {
    const objectId =
      typeof page.pageId === 'string' ? new mongoose.Types.ObjectId(page.pageId) : page.pageId;
    arrayFilters.push({ 'page._id': objectId });
  } else {
    arrayFilters.push({ 'page.order': page.order });
  }

  await Book.updateOne(
    { _id: bookId },
    {
      $set: {
        'pages.$[page].characterImage': newAsset,
      },
    },
    {
      arrayFilters,
    }
  );
};

const preparePageStoryContent = ({ bookPage, jobPage, readerName }) => {
  const pageText = replaceReaderPlaceholders(bookPage.text || '', readerName);
  return {
    order: bookPage.order,
    text: pageText,
    background: bookPage.backgroundImage || null,
    character: jobPage.characterAsset || null,
    quote: '',
    characterPosition: 'auto',
    rankingSummary: jobPage.rankingSummary || '',
    rankingNotes: Array.isArray(jobPage.rankingNotes) ? jobPage.rankingNotes : [],
  };
};

const sanitizeAssetForSnapshot = (asset) => {
  if (!asset) return null;
  return {
    key: asset.key,
    url: asset.url,
    signedUrl: asset.signedUrl || null,
    size: asset.size || 0,
    contentType: asset.contentType || null,
    uploadedAt: asset.uploadedAt ? new Date(asset.uploadedAt) : new Date(),
    originalName: asset.originalName || null,
    backgroundRemoved: Boolean(asset.backgroundRemoved),
  };
};

const buildPdfAsset = async ({ book, job, pages }) => {
  const { buffer, pageCount } = await generateStorybookPdf({
    title: job.title || `${book.name} Storybook`,
    pages,
  });

  const bookSlug = book.slug || `${slugify(book.name)}-${book._id.toString().slice(-6)}`;
  const pdfKey = generateBookPdfKey(bookSlug, job.title || `${book.name} Storybook`);
  const { url } = await uploadBufferToS3(buffer, pdfKey, 'application/pdf', { acl: 'public-read' });

  return {
    key: pdfKey,
    url,
    size: buffer.length,
    contentType: 'application/pdf',
    title: job.title || `${book.name} Storybook`,
    pageCount,
    createdAt: new Date(),
    updatedAt: new Date(),
    trainingId: job.trainingId || null,
    storybookJobId: job._id || null,
    readerId: job.readerId || null,
    readerName: job.readerName || '',
    userId: job.userId || null,
    pages: pages.map((page) => ({
      order: page.order,
      text: page.text || '',
      quote: page.quote || '',
      background: sanitizeAssetForSnapshot(page.background),
      character: sanitizeAssetForSnapshot(page.character),
      rankingSummary: page.rankingSummary || '',
      rankingNotes: Array.isArray(page.rankingNotes) ? page.rankingNotes : [],
      updatedAt: new Date(),
    })),
  };
};

const waitForGeneration = async ({ generationId, job, page }) => {
  const payload = await registerGenerationWaiter({
    generationId,
    jobId: job._id,
    pageId: page.pageId,
    pageOrder: page.order,
  });
  return payload;
};

const normaliseWinnerIndex = (value, total) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;

  if (parsed >= 1 && parsed <= total) {
    return Math.floor(parsed) - 1;
  }

  if (parsed >= 0 && parsed < total) {
    return Math.floor(parsed);
  }

  return null;
};

const deriveWinnerAsset = (generation) => {
  if (!generation) return null;
  const assets = generation.imageAssets || [];
  if (!assets.length) return null;

  const rankedEntries = Array.isArray(generation.ranking?.ranked)
    ? generation.ranking.ranked
    : [];
  const rawWinners = Array.isArray(generation.ranking?.winners)
    ? generation.ranking.winners
    : [];

  const preferredIndexes = rawWinners
    .map((value) => normaliseWinnerIndex(value, assets.length))
    .filter((value) => value !== null);

  let winnerIndex = preferredIndexes.length ? preferredIndexes[0] : null;

  if (winnerIndex === null && rankedEntries.length) {
    const sortedRanked = rankedEntries
      .slice()
      .sort((a, b) => {
        const rankA = Number.isFinite(a.rank) ? a.rank : Number.POSITIVE_INFINITY;
        const rankB = Number.isFinite(b.rank) ? b.rank : Number.POSITIVE_INFINITY;
        if (rankA !== rankB) {
          return rankA - rankB;
        }
        const scoreA = Number.isFinite(a.score) ? a.score : 0;
        const scoreB = Number.isFinite(b.score) ? b.score : 0;
        return scoreB - scoreA;
      });
    const bestRanked = sortedRanked[0];
    winnerIndex =
      bestRanked && bestRanked.imageIndex !== undefined
        ? normaliseWinnerIndex(bestRanked.imageIndex, assets.length)
        : null;
  }

  if (winnerIndex === null) {
    winnerIndex = 0;
  }

  const asset = assets[winnerIndex] || assets[0];
  const winnerNumber = winnerIndex + 1;

  return {
    asset,
    winner: winnerNumber,
    summary: generation.ranking?.summary || '',
    notes: rankedEntries.map((entry) => ({
      imageIndex: entry.imageIndex,
      score: entry.score,
      verdict: entry.verdict,
      notes: entry.notes,
    })),
  };
};

const processJobPage = async ({ job, page, book, training, readerName }) => {
  const pageFilter = resolveArrayFilterForPage(page);
  const generationPrompt = replaceReaderPlaceholders(page.prompt || page.text || '', readerName);

  await updateJobAndEmit({
    jobId: job._id,
    update: {
      $set: {
        'pages.$[page].status': 'generating',
        'pages.$[page].startedAt': new Date(),
        'pages.$[page].progress': 5,
      },
      $push: {
        'pages.$[page].events': createEvent(
          'page-started',
          `Started generation for page ${page.order}`,
          { prompt: generationPrompt }
        ),
      },
    },
    arrayFilters: [pageFilter],
  });

  const generationInput = {
    prompt: generationPrompt,
    guidance_scale: 2,
    output_quality: 100,
    output_format: 'png',
    num_outputs: 4,
    go_fast: false,
    num_inference_steps: 28,
    megapixels: '1',
    lora_scale: 1,
    extra_lora_scale: 1,
    pageOrder: page.order,
  };

  const createdAt = new Date();
  const generation = await Generation.create({
    userId: job.userId,
    trainingId: training._id,
    modelVersion: training.modelVersion,
    prompt: generationPrompt,
    generationConfig: {
      model: 'ranked',
      mode: 'ranked',
      goFast: Boolean(generationInput.go_fast),
      loraScale: generationInput.lora_scale,
      megapixels: generationInput.megapixels,
      numOutputs: generationInput.num_outputs,
      aspectRatio: generationInput.aspect_ratio || '1:1',
      outputFormat: generationInput.output_format,
      guidanceScale: generationInput.guidance_scale,
      outputQuality: generationInput.output_quality,
      promptStrength: generationInput.prompt_strength || 0.8,
      extraLoraScale: generationInput.extra_lora_scale,
      numInferenceSteps: generationInput.num_inference_steps,
      pageOrder: page.order,
    },
    status: 'queued',
    progress: 0,
    attempts: 0,
    replicateInput: generationInput,
    storybookContext: {
      jobId: job._id,
      bookId: job.bookId,
      pageId: page.pageId,
      pageOrder: page.order,
    },
    events: [
      {
        type: 'created',
        message: 'Storybook ranked generation queued',
        metadata: {
          jobId: job._id,
          pageOrder: page.order,
        },
        timestamp: createdAt,
      },
    ],
  });

  await updateJobAndEmit({
    jobId: job._id,
    update: {
      $set: {
        'pages.$[page].generationId': generation._id,
      },
      $push: {
        events: createEvent('page-generation-created', `Generation created for page ${page.order}`, {
          generationId: generation._id,
        }),
        'pages.$[page].events': createEvent(
          'generation-created',
          'Ranked generation created',
          {
            generationId: generation._id,
          }
        ),
      },
    },
    arrayFilters: [pageFilter],
  });

  await broadcastGeneration(generation._id);

  const generationPromise = waitForGeneration({
    generationId: generation._id,
    job,
    page,
  });

  try {
    await dispatchGenerationAttempt({
      generationId: generation._id,
      modelVersion: training.modelVersion,
      input: generationInput,
      reason: 'storybook-page',
    });
  } catch (error) {
    await updateJobAndEmit({
      jobId: job._id,
      update: {
        $set: {
          'pages.$[page].status': 'failed',
          'pages.$[page].error': error.message,
          'pages.$[page].completedAt': new Date(),
        },
        $push: {
          'pages.$[page].events': createEvent(
            'generation-dispatch-error',
            `Failed to dispatch generation: ${error.message}`
          ),
        },
      },
      arrayFilters: [pageFilter],
    });
    throw error;
  }

  const finalGeneration = await generationPromise.catch(async (error) => {
    await updateJobAndEmit({
      jobId: job._id,
      update: {
        $set: {
          'pages.$[page].status': 'failed',
          'pages.$[page].error': error.message,
          'pages.$[page].completedAt': new Date(),
        },
        $push: {
          'pages.$[page].events': createEvent(
            'generation-failed',
            `Generation failed: ${error.message}`
          ),
        },
      },
      arrayFilters: [pageFilter],
    });
    throw error;
  });

  const populatedGeneration = await populateForClient(generation._id);
  const winner = deriveWinnerAsset(populatedGeneration);

  if (!winner || !winner.asset) {
    throw new Error(`No winning asset found for page ${page.order}`);
  }

  const bookCharacterAsset = await copyAssetToBookCharacterSlot({
    book,
    page,
    asset: winner.asset,
  });

  await updateBookCharacterImage({
    bookId: book._id,
    page,
    newAsset: bookCharacterAsset,
  });

  await updateJobAndEmit({
    jobId: job._id,
    update: {
      $set: {
        'pages.$[page].status': 'completed',
        'pages.$[page].completedAt': new Date(),
        'pages.$[page].characterAsset': bookCharacterAsset,
        'pages.$[page].characterAssetOriginal': winner.asset,
        'pages.$[page].rankingWinner': winner.winner,
        'pages.$[page].rankingSummary': winner.summary,
        'pages.$[page].rankingNotes': winner.notes,
        'pages.$[page].progress': 100,
      },
      $push: {
        'pages.$[page].events': createEvent('page-completed', 'Page generation completed', {
          generationId: generation._id,
          winner: winner.winner,
        }),
      },
    },
    arrayFilters: [pageFilter],
  });
};

const processStorybookJob = async (jobId) => {
  const job = await StorybookJob.findById(jobId);
  if (!job) {
    throw new Error(`Storybook job ${jobId} not found`);
  }

  if (!job.startedAt) {
    job.startedAt = new Date();
    await job.save();
  }

  const book = await Book.findById(job.bookId);
  if (!book) {
    throw new Error('Book not found for storybook automation');
  }

  const training = await Training.findById(job.trainingId);
  if (!training || training.status !== 'succeeded' || !training.modelVersion) {
    throw new Error('Training must be successful with a model version');
  }

  const reader = job.readerId ? await User.findById(job.readerId) : null;
  const readerName = job.readerName || reader?.name || '';

  await updateJobAndEmit({
    jobId: job._id,
    update: {
      $set: {
        status: 'generating',
      },
      $push: {
        events: createEvent('job-started', 'Storybook automation started'),
      },
    },
  });

  const errors = [];
  let cursor = 0;

  const runWorker = async () => {
    while (cursor < job.pages.length) {
      const index = cursor;
      cursor += 1;
      const page = job.pages[index];
      try {
        await processJobPage({
          job,
          page,
          book,
          training,
          readerName,
        });
      } catch (error) {
        errors.push({ page, error });
        return;
      }
    }
  };

  const workerCount = Math.min(PAGE_CONCURRENCY, job.pages.length);
  const workers = Array.from({ length: workerCount }, () => runWorker());
  await Promise.all(workers);

  if (errors.length) {
    const failure = errors[0];
    await updateJobAndEmit({
      jobId: job._id,
      update: {
        $set: {
          status: 'failed',
          error: failure.error.message,
          completedAt: new Date(),
        },
        $push: {
          events: createEvent('job-failed', failure.error.message, {
            pageOrder: failure.page?.order,
          }),
        },
      },
    });
    throw failure.error;
  }

  await updateJobAndEmit({
    jobId: job._id,
    update: {
      $set: {
        status: 'assembling',
        metadata: { assemblyProgress: 0 },
      },
      $push: {
        events: createEvent('job-assembling', 'Generating final PDF'),
      },
    },
  });

  const refreshedJob = await StorybookJob.findById(job._id);
  const refreshedBook = await Book.findById(job.bookId);

  const pdfPages = refreshedBook.pages
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((bookPage) => {
      const jobPage = refreshedJob.pages.find(
        (entry) =>
          (entry.pageId && entry.pageId.toString() === bookPage._id.toString()) ||
          entry.order === bookPage.order
      );
      return preparePageStoryContent({
        bookPage,
        jobPage: jobPage || {},
        readerName,
      });
    });

  const pdfAsset = await buildPdfAsset({
    book: refreshedBook,
    job: refreshedJob,
    pages: pdfPages,
  });

  await Book.findByIdAndUpdate(book._id, {
    $push: {
      pdfAssets: pdfAsset,
    },
  });

  await updateJobAndEmit({
    jobId: job._id,
    update: {
      $set: {
        status: 'succeeded',
        pdfAsset,
        completedAt: new Date(),
        metadata: { assemblyProgress: 10 },
      },
      $push: {
        events: createEvent('job-completed', 'Storybook automation completed successfully', {
          pdfKey: pdfAsset.key,
        }),
      },
    },
  });
};

const formatBookPagesForJob = (book) =>
  (book.pages || [])
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((page) => ({
      pageId: page._id,
      order: page.order,
      prompt: page.characterPrompt || '',
      text: page.text || '',
      status: 'queued',
      progress: 0,
      events: [createEvent('page-queued', 'Page queued for generation')],
    }));

const startStorybookAutomation = async ({
  bookId,
  trainingId,
  userId,
  readerId,
  readerName,
  title,
}) => {
  const book = await Book.findById(bookId);
  if (!book) {
    throw new Error('Book not found');
  }

  if (!Array.isArray(book.pages) || !book.pages.length) {
    throw new Error('Book has no pages to generate');
  }

  const training = await Training.findById(trainingId);
  if (!training) {
    throw new Error('Training not found');
  }

  if (training.status !== 'succeeded' || !training.modelVersion) {
    throw new Error('Training must be completed successfully before generating images');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User (reader) not found for generation');
  }

  const resolvedReaderId = readerId || userId;
  const resolvedReaderName = readerName || user.name || '';

  const job = await StorybookJob.create({
    bookId,
    trainingId,
    userId,
    readerId: resolvedReaderId,
    readerName: resolvedReaderName,
    title: title || `${book.name} Storybook`,
    status: 'queued',
    progress: 0,
    pages: formatBookPagesForJob(book),
    events: [createEvent('job-queued', 'Storybook automation queued')],
  });

  process.nextTick(() => {
    processStorybookJob(job._id).catch((error) => {
      console.error(`[storybook] job ${job._id} failed:`, error);
    });
  });

  const jobDoc = await StorybookJob.findById(job._id);
  const snapshot = await syncComputedFields(jobDoc);
  emitStorybookUpdate(snapshot);
  return snapshot;
};

const getStorybookJobById = async (jobId) => {
  const job = await StorybookJob.findById(jobId);
  if (!job) return null;
  return emitJob(job);
};

const listStorybookJobsForBook = async (bookId, limit = 10) => {
  const jobs = await StorybookJob.find({ bookId })
    .sort({ createdAt: -1 })
    .limit(limit);
  return jobs.map((job) => {
    const snapshot = job.toObject({ depopulate: true });
    snapshot.progress = computeJobProgress(snapshot);
    snapshot.estimatedSecondsRemaining = computeEtaSeconds(snapshot, snapshot.progress);
    return snapshot;
  });
};

const regenerateStorybookPage = async ({
  bookId,
  assetId = null,
  pageOrder,
  trainingId,
  userId,
  readerId,
  readerName,
}) => {
  if (!bookId) {
    throw new Error('Book ID is required for regeneration');
  }
  if (!trainingId) {
    throw new Error('Training ID is required to regenerate a page');
  }
  if (!userId) {
    throw new Error('User context is required to regenerate a page');
  }

  const book = await Book.findById(bookId);
  if (!book) {
    throw new Error('Book not found');
  }

  let targetPage = null;
  let targetOrder = null;
  const numericOrder = Number(pageOrder);
  if (Number.isFinite(numericOrder) && numericOrder > 0) {
    targetPage = book.pages.find((page) => page.order === numericOrder) || null;
    if (targetPage) {
      targetOrder = numericOrder;
    }
  }
  if (!targetPage && mongoose.Types.ObjectId.isValid(pageOrder)) {
    const pageDoc = book.pages.id(pageOrder);
    if (pageDoc) {
      targetPage = pageDoc;
      targetOrder = pageDoc.order;
    }
  }
  if (!targetPage) {
    throw new Error('Requested page was not found in this book');
  }
  if (!targetOrder) {
    targetOrder = targetPage.order;
  }

  const training = await Training.findById(trainingId);
  if (!training) {
    throw new Error('Training not found for regeneration');
  }
  if (training.status !== 'succeeded' || !training.modelVersion) {
    throw new Error('Training must be completed successfully before regenerating a page');
  }

  const resolvedReaderId = readerId || null;
  let resolvedReaderName = readerName || '';
  if (!resolvedReaderName && resolvedReaderId) {
    const readerDoc = await User.findById(resolvedReaderId).select('name').lean();
    if (readerDoc?.name) {
      resolvedReaderName = readerDoc.name;
    }
  }

  const generationPrompt = replaceReaderPlaceholders(
    targetPage.characterPrompt || targetPage.text || '',
    resolvedReaderName
  );

  const generationInput = {
    prompt: generationPrompt,
    guidance_scale: 2,
    output_quality: 100,
    output_format: 'png',
    num_outputs: 4,
    go_fast: false,
    num_inference_steps: 28,
    megapixels: '1',
    lora_scale: 1,
    extra_lora_scale: 1,
    pageOrder: targetOrder,
  };

  const createdAt = new Date();
  const generation = await Generation.create({
    userId,
    trainingId: training._id,
    modelVersion: training.modelVersion,
    prompt: generationPrompt,
    generationConfig: {
      model: 'ranked',
      mode: 'ranked',
      goFast: Boolean(generationInput.go_fast),
      loraScale: generationInput.lora_scale,
      megapixels: generationInput.megapixels,
      numOutputs: generationInput.num_outputs,
      aspectRatio: generationInput.aspect_ratio || '1:1',
      outputFormat: generationInput.output_format,
      guidanceScale: generationInput.guidance_scale,
      outputQuality: generationInput.output_quality,
      promptStrength: generationInput.prompt_strength || 0.8,
      extraLoraScale: generationInput.extra_lora_scale,
      numInferenceSteps: generationInput.num_inference_steps,
      pageOrder: targetOrder,
    },
    status: 'queued',
    progress: 0,
    attempts: 0,
    replicateInput: generationInput,
    storybookContext: {
      bookId,
      pageId: targetPage._id,
      pageOrder: targetOrder,
      runType: 'storybook-regenerate',
    },
    events: [
      {
        type: 'created',
        message: 'Storybook page regeneration queued',
        metadata: {
          bookId,
          pageOrder: targetOrder,
        },
        timestamp: createdAt,
      },
    ],
  });

  await broadcastGeneration(generation._id);

  const generationPromise = waitForStandaloneGeneration(generation._id);

  try {
    await dispatchGenerationAttempt({
      generationId: generation._id,
      modelVersion: training.modelVersion,
      input: generationInput,
      reason: 'storybook-page-regenerate',
    });
  } catch (error) {
    await Generation.findByIdAndUpdate(generation._id, {
      status: 'failed',
      error: error.message,
      completedAt: new Date(),
    });
    throw error;
  }

  await generationPromise.catch(async (error) => {
    await Generation.findByIdAndUpdate(generation._id, {
      status: 'failed',
      error: error.message,
      completedAt: new Date(),
    });
    throw error;
  });

  const populatedGeneration = await populateForClient(generation._id);
  const winner = deriveWinnerAsset(populatedGeneration);
  if (!winner || !winner.asset) {
    throw new Error('No winning asset found for regenerated page');
  }

  const bookCharacterAsset = await copyAssetToBookCharacterSlot({
    book,
    page: { pageId: targetPage._id, order: targetOrder },
    asset: winner.asset,
  });

  await updateBookCharacterImage({
    bookId,
    page: { pageId: targetPage._id, order: targetOrder },
    newAsset: bookCharacterAsset,
  });

  const timestamp = new Date();
  if (assetId) {
    const sanitizedCharacter = sanitizeAssetForSnapshot(bookCharacterAsset);
    const assetFilter = mongoose.Types.ObjectId.isValid(assetId)
      ? { 'asset._id': new mongoose.Types.ObjectId(assetId) }
      : { 'asset.key': assetId };
    await Book.updateOne(
      { _id: bookId },
      {
        $set: {
          'pdfAssets.$[asset].pages.$[page].character': sanitizedCharacter,
          'pdfAssets.$[asset].pages.$[page].rankingSummary': winner.summary || '',
          'pdfAssets.$[asset].pages.$[page].rankingNotes': winner.notes || [],
          'pdfAssets.$[asset].pages.$[page].updatedAt': timestamp,
          'pdfAssets.$[asset].updatedAt': timestamp,
        },
      },
      {
        arrayFilters: [assetFilter, { 'page.order': targetOrder }],
      }
    ).catch((error) => {
      console.warn(
        `[storybook] failed to update PDF asset snapshot for regeneration:`,
        error.message
      );
    });
  }

  const refreshedBook = await Book.findById(bookId);
  const refreshedPage =
    refreshedBook?.pages.id(targetPage._id) ||
    refreshedBook?.pages.find((page) => page.order === targetOrder) ||
    null;

  let refreshedPdfAssetPage = null;
  if (assetId && refreshedBook) {
    const candidateAsset =
      (mongoose.Types.ObjectId.isValid(assetId) && refreshedBook.pdfAssets.id(assetId)) ||
      refreshedBook.pdfAssets.find((asset) => asset.key === assetId);
    if (candidateAsset && Array.isArray(candidateAsset.pages)) {
      refreshedPdfAssetPage =
        candidateAsset.pages.find((page) => page.order === targetOrder) || null;
    }
  }

  return {
    page: refreshedPage ? refreshedPage.toObject({ depopulate: true }) : null,
    pdfAssetPage: refreshedPdfAssetPage
      ? refreshedPdfAssetPage.toObject
        ? refreshedPdfAssetPage.toObject({ depopulate: true })
        : refreshedPdfAssetPage
      : null,
    characterAsset: bookCharacterAsset,
    winner,
    generation: populatedGeneration ? populatedGeneration.toObject({ depopulate: true }) : null,
  };
};

module.exports = {
  startStorybookAutomation,
  getStorybookJobById,
  listStorybookJobsForBook,
  regenerateStorybookPage,
};
