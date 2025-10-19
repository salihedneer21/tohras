const Training = require('../models/Training');
const { replicate } = require('../config/replicate');
const { extractProgressFromReplicate } = require('../utils/replicate');
const { buildWebhookUrl } = require('../utils/webhook');
const { emitTrainingUpdate } = require('./trainingEvents');

const MAX_TRAINING_ATTEMPTS = Number(process.env.TRAINING_MAX_ATTEMPTS || 1);
const TRAINING_WEBHOOK_EVENTS = ['start', 'logs', 'output', 'completed'];
const TRAINING_POLL_INTERVAL_MS = Number(process.env.TRAINING_POLL_INTERVAL_MS || 10000);
const TRAINING_MAX_POLL_INTERVAL_MS = Number(process.env.TRAINING_MAX_POLL_INTERVAL_MS || 60000);

const pollers = new Map();

const clampProgress = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num <= 0) return 0;
  if (num >= 100) return 100;
  return Math.round(num * 10) / 10;
};

const parseProgressFromLogs = (logsText) => {
  if (!logsText || typeof logsText !== 'string') return null;
  const lines = logsText.split('\n');

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const originalLine = lines[index];
    if (!originalLine) continue;
    const line = originalLine.trim();
    if (!line) continue;
    if (!line.toLowerCase().includes('flux_train_replicate')) {
      continue;
    }

    const match = line.match(/(\d{1,3})%/);
    if (match) {
      const value = clampProgress(Number(match[1]));
      if (value !== null) {
        return value;
      }
    }
  }

  return null;
};

const populateTrainingForClient = async (trainingId) =>
  Training.findById(trainingId)
    .populate('userId', 'name email age gender');

const broadcastTraining = async (trainingId) => {
  const populated = await populateTrainingForClient(trainingId);
  if (populated) {
    emitTrainingUpdate(populated);
  }
  return populated;
};

const clearTrainingPolling = (trainingId) => {
  const timer = pollers.get(trainingId);
  if (timer) {
    clearTimeout(timer);
    pollers.delete(trainingId);
  }
};

const scheduleTrainingPolling = (trainingId, replicateTrainingId, delay = TRAINING_POLL_INTERVAL_MS) => {
  clearTrainingPolling(trainingId);
  const timer = setTimeout(async () => {
    try {
      const replicateTraining = await replicate.trainings.get(replicateTrainingId);
      const terminal = ['succeeded', 'failed', 'canceled'].includes(replicateTraining.status);
      const eventType = terminal ? 'completed' : 'update';
      await processTrainingEvent({
        trainingId,
        replicateTraining,
        eventType,
      });
      if (!terminal) {
        const nextDelay = Math.min(delay, TRAINING_MAX_POLL_INTERVAL_MS);
        scheduleTrainingPolling(trainingId, replicateTrainingId, nextDelay);
      }
    } catch (error) {
      console.warn(
        `⚠️  Failed to poll training ${replicateTrainingId} for training ${trainingId}:`,
        error.message
      );
      const retryDelay = Math.min(delay * 2, TRAINING_MAX_POLL_INTERVAL_MS);
      scheduleTrainingPolling(trainingId, replicateTrainingId, retryDelay);
    }
  }, delay);
  pollers.set(trainingId, timer);
};

const appendTrainingUpdates = ({ set, pushLogs = [], pushEvents = [] }) => {
  const update = {};
  if (set && Object.keys(set).length) {
    update.$set = set;
  }
  if (pushLogs.length) {
    update.$push = update.$push || {};
    update.$push.logs = {
      $each: pushLogs,
    };
  }
  if (pushEvents.length) {
    update.$push = update.$push || {};
    update.$push.events = {
      $each: pushEvents,
    };
  }
  return update;
};

const dispatchTraining = async ({ trainingId, replicateArgs, reason = 'initial' }) => {
  const training = await Training.findById(trainingId);
  if (!training) {
    throw new Error(`Training ${trainingId} not found`);
  }

  if ((training.attempts || 0) >= MAX_TRAINING_ATTEMPTS) {
    throw new Error(`Maximum attempts reached for training ${trainingId}`);
  }

  const webhook = buildWebhookUrl('training', trainingId);
  if (!webhook) {
    throw new Error('REPLICATE_WEBHOOK_BASE_URL must be configured to use training webhooks.');
  }

  const attemptNumber = (training.attempts || 0) + 1;

  const { owner, project, version, ...options } = replicateArgs;

  const args = {
    ...options,
    webhook,
    webhook_events_filter: TRAINING_WEBHOOK_EVENTS,
  };

  const replicateTraining = await replicate.trainings.create(owner, project, version, args);

  const now = new Date();
  await Training.findByIdAndUpdate(trainingId, {
    $set: {
      replicateTrainingId: replicateTraining.id,
      attempts: attemptNumber,
      status: replicateTraining.status,
      logsUrl: replicateTraining.logs,
      progress: 0,
      error: null,
    },
    $push: {
      events: {
        type: 'attempt',
        message: `Dispatched training attempt ${attemptNumber}${reason ? ` (${reason})` : ''}`,
        metadata: {
          attempt: attemptNumber,
          reason,
          replicateTrainingId: replicateTraining.id,
          webhook,
        },
        timestamp: now,
      },
    },
  });

  console.log(
    `🎯 Dispatched Replicate training ${replicateTraining.id} for training ${trainingId} (attempt ${attemptNumber})`
  );
  console.log(`   ↪ Webhook: ${webhook}`);

  await broadcastTraining(trainingId);
  scheduleTrainingPolling(trainingId, replicateTraining.id);
  return replicateTraining;
};

const processTrainingEvent = async ({ trainingId, replicateTraining, eventType }) => {
  const training = await Training.findById(trainingId);
  if (!training) {
    throw new Error(`Training ${trainingId} not found for webhook update`);
  }

  if (
    replicateTraining?.id &&
    training.replicateTrainingId &&
    replicateTraining.id !== training.replicateTrainingId
  ) {
    console.warn(
      `⚠️  Ignoring webhook for stale training ${replicateTraining.id} (current: ${training.replicateTrainingId})`
    );
    clearTrainingPolling(trainingId);
    return null;
  }

  const now = new Date();
  const progress = extractProgressFromReplicate(replicateTraining);
  const set = {};
  const pushLogs = [];
  const pushEvents = [];

  const ensureProgress = (candidate) => {
    if (candidate === null || candidate === undefined) return;
    const existing =
      set.progress !== undefined && set.progress !== null
        ? set.progress
        : training.progress || 0;
    const next = Math.max(existing, candidate);
    set.progress = clampProgress(next);
  };

  if (progress !== null) {
    ensureProgress(progress);
  }

  if (eventType === 'start') {
    set.status = replicateTraining.status || 'processing';
    set.startedAt = set.startedAt || training.startedAt || now;
    pushEvents.push({
      type: 'start',
      message: 'Training started on Replicate',
      metadata: { replicateTrainingId: replicateTraining.id },
      timestamp: now,
    });
  }

  if (replicateTraining.logs) {
    const existingMessages = new Set((training.logs || []).map((entry) => entry.message));
    replicateTraining.logs
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !existingMessages.has(line))
      .forEach((message) => pushLogs.push({ message, timestamp: now }));

    const logProgress = parseProgressFromLogs(replicateTraining.logs);
    if (logProgress !== null) {
      ensureProgress(logProgress);
    }
  }

  set.status = replicateTraining.status || training.status;
  set.logsUrl = replicateTraining.logs || training.logsUrl;

  if (replicateTraining.status === 'succeeded') {
    set.progress = 100;
    set.completedAt = now;
    set.modelVersion = replicateTraining.output?.version || training.modelVersion;
    pushEvents.push({
      type: 'completed',
      message: 'Training completed successfully',
      metadata: {
        replicateTrainingId: replicateTraining.id,
        modelVersion: set.modelVersion,
      },
      timestamp: now,
    });
  } else if (replicateTraining.status === 'failed') {
    set.completedAt = now;
    set.error = replicateTraining.error || 'Training failed';
    pushEvents.push({
      type: 'failed',
      message: set.error,
      metadata: {
        replicateTrainingId: replicateTraining.id,
      },
      timestamp: now,
    });
  }

  const update = appendTrainingUpdates({ set, pushLogs, pushEvents });
  if (Object.keys(update).length) {
    await Training.findByIdAndUpdate(trainingId, update);
  }

  clearTrainingPolling(trainingId);
  return broadcastTraining(trainingId);
};

module.exports = {
  dispatchTraining,
  processTrainingEvent,
  broadcastTraining,
  scheduleTrainingPolling,
  clearTrainingPolling,
  populateTrainingForClient,
};
