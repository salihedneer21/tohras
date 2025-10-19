const mongoose = require('mongoose');

/**
 * Generation Schema for storing image generation history
 */
const generationImageAssetSchema = new mongoose.Schema(
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

const rankingEntrySchema = new mongoose.Schema(
  {
    imageIndex: { type: Number, required: true, min: 1 },
    rank: { type: Number, required: true, min: 1 },
    score: { type: Number, required: true, min: 0, max: 100 },
    verdict: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor'],
      default: 'good',
    },
    notes: { type: String, default: '' },
  },
  { _id: false }
);

const rankingChildProfileSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    gender: { type: String, default: '' },
    age: { type: Number, default: null },
  },
  { _id: false }
);

const generationLogEntrySchema = new mongoose.Schema(
  {
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const generationEventSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    message: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const generationRankingSchema = new mongoose.Schema(
  {
    summary: { type: String, default: '' },
    promptReflection: { type: String, default: '' },
    winners: {
      type: [Number],
      default: [],
    },
    ranked: {
      type: [rankingEntrySchema],
      default: [],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    raw: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    childProfile: {
      type: rankingChildProfileSchema,
      default: null,
    },
  },
  { _id: false }
);

const generationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    trainingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Training',
      required: [true, 'Training ID is required'],
    },
    modelVersion: {
      type: String,
      required: [true, 'Model version is required'],
    },
    prompt: {
      type: String,
      required: [true, 'Prompt is required'],
      minlength: [3, 'Prompt must be at least 3 characters long'],
    },
    generationConfig: {
      model: {
        type: String,
        default: 'dev',
      },
      goFast: {
        type: Boolean,
        default: false,
      },
      loraScale: {
        type: Number,
        default: 1,
        min: 0,
        max: 2,
      },
      megapixels: {
        type: String,
        default: '1',
      },
      numOutputs: {
        type: Number,
        default: 1,
        min: 1,
        max: 4,
      },
      aspectRatio: {
        type: String,
        default: '1:1',
      },
      outputFormat: {
        type: String,
        enum: ['webp', 'jpg', 'png'],
        default: 'webp',
      },
      guidanceScale: {
        type: Number,
        default: 3,
        min: 0,
        max: 10,
      },
      outputQuality: {
        type: Number,
        default: 80,
        min: 0,
        max: 100,
      },
      promptStrength: {
        type: Number,
        default: 0.8,
        min: 0,
        max: 1,
      },
      extraLoraScale: {
        type: Number,
        default: 1,
        min: 0,
        max: 2,
      },
      numInferenceSteps: {
        type: Number,
        default: 28,
        min: 1,
        max: 50,
      },
    },
    status: {
      type: String,
      enum: ['queued', 'processing', 'succeeded', 'failed'],
      default: 'queued',
    },
    imageUrls: {
      type: [String],
      default: [],
    },
    imageAssets: {
      type: [generationImageAssetSchema],
      default: [],
    },
    ranking: {
      type: generationRankingSchema,
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
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    replicatePredictionId: {
      type: String,
      default: null,
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },
    logs: {
      type: [generationLogEntrySchema],
      default: [],
    },
    events: {
      type: [generationEventSchema],
      default: [],
    },
    replicateInput: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
generationSchema.index({ userId: 1 });
generationSchema.index({ trainingId: 1 });
generationSchema.index({ status: 1 });
generationSchema.index({ createdAt: -1 });
generationSchema.index({ replicatePredictionId: 1 });

const Generation = mongoose.model('Generation', generationSchema);

module.exports = Generation;
