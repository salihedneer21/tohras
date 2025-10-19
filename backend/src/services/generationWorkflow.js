const Generation = require('../models/Generation');
const User = require('../models/User');
const { replicate } = require('../config/replicate');
const { extractProgressFromReplicate } = require('../utils/replicate');
const { uploadGenerationOutputs, getSignedDownloadUrls } = require('./generationOutputs');
const { emitGenerationUpdate } = require('./generationEvents');
const { buildWebhookUrl } = require('../utils/webhook');
const { rankGeneratedImages } = require('./rankingService');

const MAX_ATTEMPTS = Number(process.env.GENERATION_MAX_ATTEMPTS || 3);
const WEBHOOK_EVENTS = ['start', 'logs', 'output', 'completed'];
const POLL_INTERVAL_MS = Number(process.env.GENERATION_POLL_INTERVAL_MS || 5000);
const MAX_POLL_INTERVAL_MS = Number(process.env.GENERATION_MAX_POLL_INTERVAL_MS || 20000);
const FORMAT_MIME_MAP = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};
const FINAL_PREDICTION_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

const populateForClient = async (generationId) =>
  Generation.findById(generationId)
    .populate('userId', 'name email')
    .populate('trainingId', 'modelName modelVersion');

const broadcastGeneration = async (generationId) => {
  const populated = await populateForClient(generationId);
  if (populated) {
    emitGenerationUpdate(populated);
  }
  return populated;
};

const predictionPollers = new Map();

const clearPredictionPolling = (generationId) => {
  const timer = predictionPollers.get(generationId);
  if (timer) {
    clearTimeout(timer);
    predictionPollers.delete(generationId);
  }
};

const schedulePredictionPolling = (generationId, predictionId, delay = POLL_INTERVAL_MS) => {
  clearPredictionPolling(generationId);
  const timer = setTimeout(async () => {
    try {
      const prediction = await replicate.predictions.get(predictionId);
      const terminal = FINAL_PREDICTION_STATUSES.has(prediction.status);
      const eventType = terminal ? 'completed' : 'update';
      await processPredictionEvent({
        generationId,
        prediction,
        eventType,
      });
      if (!terminal) {
        const nextDelay = Math.min(delay, MAX_POLL_INTERVAL_MS);
        schedulePredictionPolling(generationId, predictionId, nextDelay);
      }
    } catch (error) {
      console.warn(
        `⚠️  Failed to poll prediction ${predictionId} for generation ${generationId}:`,
        error.message
      );
      const retryDelay = Math.min(delay * 2, MAX_POLL_INTERVAL_MS);
      schedulePredictionPolling(generationId, predictionId, retryDelay);
    }
  }, delay);
  predictionPollers.set(generationId, timer);
};

const clampNumber = (value, fallback) => {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
};

const buildReplicateInputFromGeneration = (generation) => {
  const cfg = generation?.generationConfig || {};

  return {
    model: cfg.model || 'dev',
    prompt: generation.prompt,
    go_fast: Boolean(cfg.goFast),
    lora_scale: clampNumber(cfg.loraScale, 1),
    megapixels: cfg.megapixels || '1',
    num_outputs: clampNumber(cfg.numOutputs, 1),
    aspect_ratio: cfg.aspectRatio || '1:1',
    output_format: cfg.outputFormat || 'webp',
    guidance_scale: clampNumber(cfg.guidanceScale, 3),
    output_quality: clampNumber(cfg.outputQuality, 80),
    prompt_strength: clampNumber(cfg.promptStrength, 0.8),
    extra_lora_scale: clampNumber(cfg.extraLoraScale, 1),
    num_inference_steps: clampNumber(cfg.numInferenceSteps, 28),
  };
};

const prepareReplicateInput = (generation, input) => {
  if (input && typeof input === 'object') {
    return input;
  }

  if (generation?.replicateInput) {
    return generation.replicateInput;
  }

  return buildReplicateInputFromGeneration(generation);
};

const appendUpdateOperations = ({ set, pushEvents = [], pushLogs = [] }) => {
  const update = {};
  if (set && Object.keys(set).length) {
    update.$set = set;
  }
  if (pushEvents.length) {
    update.$push = update.$push || {};
    update.$push.events = {
      $each: pushEvents,
    };
  }
  if (pushLogs.length) {
    update.$push = update.$push || {};
    update.$push.logs = {
      $each: pushLogs,
    };
  }
  return update;
};

const ensureMaxAttempts = async (generation) => {
  if ((generation.attempts || 0) >= MAX_ATTEMPTS) {
    clearPredictionPolling(generation._id);
    await Generation.findByIdAndUpdate(generation._id, {
      $set: {
        status: 'failed',
        error: generation.error || `Reached maximum retry attempts (${MAX_ATTEMPTS})`,
        completedAt: new Date(),
      },
      $push: {
        events: {
          type: 'aborted',
          message: `Max retries reached (${MAX_ATTEMPTS}).`,
          metadata: { attempts: generation.attempts },
          timestamp: new Date(),
        },
      },
    });
    await broadcastGeneration(generation._id);
    return false;
  }
  return true;
};

const dispatchGenerationAttempt = async ({ generationId, modelVersion, input, reason = 'initial' }) => {
  const generation = await Generation.findById(generationId);
  if (!generation) {
    throw new Error(`Generation ${generationId} not found`);
  }

  const canAttempt = await ensureMaxAttempts(generation);
  if (!canAttempt) {
    throw new Error(`Maximum attempts reached for generation ${generationId}`);
  }

  const webhook = buildWebhookUrl('generation', generationId);
  if (!webhook) {
    throw new Error(
      'REPLICATE_WEBHOOK_BASE_URL (or WEBHOOK_BASE_URL / APP_URL) must be configured to use webhooks.'
    );
  }

  const attemptNumber = (generation.attempts || 0) + 1;
  const preparedInput = prepareReplicateInput(generation, input);

  try {
    const prediction = await replicate.predictions.create({
      version: modelVersion,
      input: preparedInput,
      webhook,
      webhook_events_filter: WEBHOOK_EVENTS,
    });

    const now = new Date();
    console.log(
      `📬 Dispatched Replicate prediction ${prediction.id} for generation ${generationId} (attempt ${attemptNumber})`
    );
    console.log(`   ↪ Webhook: ${webhook}`);
    await Generation.findByIdAndUpdate(generationId, {
      $set: {
        replicatePredictionId: prediction.id,
        attempts: attemptNumber,
        status: 'queued',
        progress: 0,
        error: null,
        replicateInput: preparedInput,
      },
      $push: {
        events: {
          type: 'attempt',
          message: `Dispatched attempt ${attemptNumber}${reason ? ` (${reason})` : ''}`,
          metadata: {
            attempt: attemptNumber,
            reason,
            predictionId: prediction.id,
            webhook,
          },
          timestamp: now,
        },
      },
    });

    await broadcastGeneration(generationId);
    schedulePredictionPolling(generationId, prediction.id);
    return prediction;
  } catch (error) {
    const now = new Date();
    await Generation.findByIdAndUpdate(generationId, {
      $push: {
        events: {
          type: 'error',
          message: `Attempt ${attemptNumber} failed to dispatch: ${error.message}`,
          metadata: {
            attempt: attemptNumber,
            reason,
          },
          timestamp: now,
        },
      },
    });
    await broadcastGeneration(generationId);
    throw error;
  }
};

const processPredictionEvent = async ({ generationId, prediction, eventType }) => {
  const generation = await Generation.findById(generationId);
  if (!generation) {
    throw new Error(`Generation ${generationId} not found for webhook update`);
  }

  if (
    prediction?.id &&
    generation.replicatePredictionId &&
    prediction.id !== generation.replicatePredictionId
  ) {
    console.warn(
      `⚠️  Ignoring webhook event for stale prediction ${prediction.id} (current: ${generation.replicatePredictionId})`
    );
    clearPredictionPolling(generationId);
    return null;
  }

  const now = new Date();
  const progress = extractProgressFromReplicate(prediction);
  const set = {};
  const events = [];
  const logs = [];

  console.log(
    `🔔 Prediction update for generation ${generationId}: event=${eventType} status=${prediction.status} progress=${progress ?? 'n/a'}`
  );

  if (progress !== null) {
    set.progress = Math.max(progress, generation.progress || 0);
  }

  if (eventType === 'start') {
    set.status = 'processing';
    if (!generation.startedAt) {
      set.startedAt = now;
    }
    events.push({
      type: 'start',
      message: 'Generation started on Replicate',
      metadata: { predictionId: prediction.id },
      timestamp: now,
    });
  }

  if (eventType === 'logs' && prediction.logs) {
    const existingMessages = new Set((generation.logs || []).map((entry) => entry.message));
    const freshLines = prediction.logs
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !existingMessages.has(line));

    logs.push(...freshLines.map((message) => ({ message, timestamp: now })));
  }

  if (eventType === 'output' && Array.isArray(prediction.output)) {
    events.push({
      type: 'output',
      message: `Received ${prediction.output.length} output update(s)`,
      metadata: {
        count: prediction.output.length,
      },
      timestamp: now,
    });

    const expectedOutputs = clampNumber(generation.generationConfig?.numOutputs, prediction.output.length);
    if (expectedOutputs > 0) {
      const outputProgress = Math.min(
        100,
        Math.round((prediction.output.length / expectedOutputs) * 100)
      );
      const currentProgress =
        set.progress !== undefined ? set.progress : generation.progress || 0;
      if (outputProgress > currentProgress) {
        set.progress = outputProgress;
      }
    }
  }

  if (eventType === 'completed') {
    clearPredictionPolling(generationId);
    events.push({
      type: 'completed',
      message: `Replicate completed with status ${prediction.status}`,
      metadata: { status: prediction.status },
      timestamp: now,
    });

    if (prediction.status === 'succeeded') {
      const outputs = Array.isArray(prediction.output)
        ? prediction.output
        : prediction.output
        ? [prediction.output]
        : [];

      if (!outputs.length) {
        events.push({
          type: 'warning',
          message: 'Replicate reports success but no outputs were returned.',
          metadata: {},
          timestamp: now,
        });
      } else {
        const targetFormat = generation.generationConfig?.outputFormat || 'webp';
        const fallbackContentType =
          FORMAT_MIME_MAP[targetFormat.toLowerCase()] || 'application/octet-stream';

        const { imageUrls, imageAssets } = await uploadGenerationOutputs({
          outputs,
          userId: generation.userId,
          generationId: generation._id,
          targetFormat,
          fallbackContentType,
        });

        const isRankedMode =
          generation.generationConfig?.mode === 'ranked' ||
          generation.generationConfig?.model === 'ranked';

        set.status = 'succeeded';
        set.imageUrls = imageUrls;
        set.imageAssets = imageAssets;

        const currentProgressAfterUpload =
          set.progress !== undefined ? set.progress : generation.progress || 0;
        const uploadProgress = isRankedMode ? 90 : 100;
        if (uploadProgress > currentProgressAfterUpload) {
          set.progress = uploadProgress;
        }

        if (!isRankedMode) {
          set.completedAt = now;
        }

        events.push({
          type: 'outputs-uploaded',
          message: `Uploaded ${imageUrls.length} generated image(s).`,
          metadata: { count: imageUrls.length },
          timestamp: now,
        });

        if (isRankedMode) {
          const rankStartTime = new Date();
          events.push({
            type: 'ranking',
            message: 'Ranking generated images with LLM evaluator',
            metadata: { count: imageAssets.length },
            timestamp: rankStartTime,
          });

          const currentProgress =
            set.progress !== undefined ? set.progress : generation.progress || 0;
          if (currentProgress < 95) {
            set.progress = 95;
          }

          try {
            const signedAssets = await getSignedDownloadUrls(imageAssets);
            const userDoc = await User.findById(generation.userId).select('name gender age');

            const ranking = await rankGeneratedImages({
              prompt: generation.prompt,
              assets: signedAssets,
              childProfile: userDoc
                ? {
                    name: userDoc.name,
                    gender: userDoc.gender,
                    age: userDoc.age,
                  }
                : null,
            });

            set.ranking = {
              summary: ranking.summary,
              promptReflection: ranking.promptReflection || '',
              winners:
                ranking.winners && ranking.winners.length
                  ? ranking.winners
                  : [ranking.ranked[0]?.imageIndex || 1],
              ranked: ranking.ranked,
              createdAt: new Date(),
              raw: ranking.raw || null,
              childProfile: ranking.childProfile,
            };

            set.progress = 100;
            set.completedAt = new Date();

            events.push({
              type: 'ranking-complete',
              message: 'Ranking completed successfully',
              metadata: {
                winners: set.ranking.winners,
              },
              timestamp: new Date(),
            });

            events.push({
              type: 'succeeded',
              message: 'Ranked generation finished',
              metadata: {
                totalOutputs: imageAssets.length,
              },
              timestamp: new Date(),
            });
          } catch (rankingError) {
            events.push({
              type: 'ranking-error',
              message: `Ranking failed: ${rankingError.message}`,
              metadata: {},
              timestamp: new Date(),
            });
            set.status = 'failed';
            set.error = `Ranking failed: ${rankingError.message}`;
            set.completedAt = new Date();
          }
        }
        else {
          set.completedAt = now;
        }
      }
    } else {
      const failureMessage = prediction.error || 'Generation failed';
      const attempts = generation.attempts || 0;
      const willRetry = attempts < MAX_ATTEMPTS;

      events.push({
        type: 'failed',
        message: failureMessage,
        metadata: {
          attempts,
          willRetry,
        },
        timestamp: now,
      });

      if (!willRetry) {
        set.status = 'failed';
        set.error = failureMessage;
        set.completedAt = now;
      }
    }
  }

  const update = appendUpdateOperations({ set, pushEvents: events, pushLogs: logs });
  if (Object.keys(update).length) {
    await Generation.findByIdAndUpdate(generationId, update);
  }

  const populated = await broadcastGeneration(generationId);

  if (eventType === 'completed' && prediction.status !== 'succeeded') {
    const attempts = generation.attempts || 0;
    if (attempts < MAX_ATTEMPTS) {
      const retryAttempt = attempts + 1;
      const retryMessage = `Retrying generation (attempt ${retryAttempt} of ${MAX_ATTEMPTS})`;
      await Generation.findByIdAndUpdate(generationId, {
        $push: {
          events: {
            type: 'retry',
            message: retryMessage,
            metadata: { attempt: retryAttempt },
            timestamp: new Date(),
          },
        },
      });
      await broadcastGeneration(generationId);

      const preparedInput = prepareReplicateInput(generation);
      await dispatchGenerationAttempt({
        generationId,
        modelVersion: generation.modelVersion,
        input: preparedInput,
        reason: 'retry',
      });
    }
  }

  return populated;
};

module.exports = {
  dispatchGenerationAttempt,
  processPredictionEvent,
  broadcastGeneration,
  populateForClient,
  buildReplicateInputFromGeneration,
  prepareReplicateInput,
  MAX_ATTEMPTS,
};
