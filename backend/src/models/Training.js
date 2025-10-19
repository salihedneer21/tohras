const mongoose = require('mongoose');

const trainingImageAssetSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, default: 0 },
    contentType: { type: String, default: null },
    uploadedAt: { type: Date, default: Date.now },
    originalName: { type: String, default: null },
  },
  { _id: true }
);

/**
 * Training Schema for storing fine-tuning jobs
 */
const trainingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    replicateTrainingId: {
      type: String,
      default: null,
    },
    modelVersion: {
      type: String,
      default: null,
    },
    modelName: {
      type: String,
      required: true,
    },
    imageUrls: {
      type: [String],
      default: [],
    },
    imageAssets: {
      type: [trainingImageAssetSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ['queued', 'starting', 'processing', 'succeeded', 'failed', 'canceled'],
      default: 'queued',
    },
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    logs: [
      {
        message: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    events: [
      {
        type: { type: String, required: true },
        message: { type: String, default: '' },
        metadata: { type: mongoose.Schema.Types.Mixed, default: null },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    logsUrl: {
      type: String,
      default: null,
    },
    error: {
      type: String,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    trainingConfig: {
      steps: {
        type: Number,
        default: 1000,
      },
      learningRate: {
        type: Number,
        default: 0.0004,
      },
      batchSize: {
        type: Number,
        default: 1,
      },
      triggerWord: {
        type: String,
        default: null,
      },
      zipPath: {
        type: String,
        default: null,
      },
      source: {
        type: String,
        enum: ['urls', 'upload', 'user-library'],
        default: 'urls',
      },
      originalZipName: {
        type: String,
        default: null,
      },
      zipUrl: {
        type: String,
        default: null,
      },
      userAssetIds: [
        {
          type: mongoose.Schema.Types.ObjectId,
        },
      ],
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
trainingSchema.index({ userId: 1 });
trainingSchema.index({ status: 1 });
trainingSchema.index(
  { replicateTrainingId: 1 },
  { unique: true, partialFilterExpression: { replicateTrainingId: { $exists: true, $ne: null } } }
);

const Training = mongoose.model('Training', trainingSchema);

module.exports = Training;
