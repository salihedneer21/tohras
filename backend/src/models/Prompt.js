const mongoose = require('mongoose');

/**
 * Prompt Schema for storing generated prompts and their source images
 */
const promptSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      required: [true, 'Original file name is required'],
      trim: true,
    },
    mimeType: {
      type: String,
      default: null,
      trim: true,
    },
    size: {
      type: Number,
      default: 0,
      min: 0,
    },
    prompt: {
      type: String,
      required: [true, 'Prompt text is required'],
      trim: true,
    },
    negativePrompt: {
      type: String,
      default: null,
      trim: true,
    },
    additionalContext: {
      type: String,
      default: null,
      trim: true,
    },
    s3Key: {
      type: String,
      required: [true, 'S3 object key is required'],
      index: true,
      trim: true,
    },
    s3Url: {
      type: String,
      required: [true, 'S3 public URL is required'],
      trim: true,
    },
    provider: {
      type: String,
      default: 'openrouter',
      trim: true,
    },
    model: {
      type: String,
      default: null,
      trim: true,
    },
    status: {
      type: String,
      enum: ['succeeded', 'failed'],
      default: 'succeeded',
    },
    quality: {
      type: String,
      enum: ['neutral', 'good'],
      default: 'neutral',
      index: true,
    },
    tags: {
      type: [String],
      default: [],
      set: (values) => {
        if (!Array.isArray(values)) return [];
        const seen = new Set();
        const result = [];
        values.forEach((value) => {
          if (typeof value !== 'string') return;
          const trimmed = value.trim();
          if (!trimmed) return;
          const lower = trimmed.toLowerCase();
          if (seen.has(lower)) return;
          seen.add(lower);
          result.push(lower);
        });
        return result.slice(0, 12);
      },
    },
    requestContext: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

promptSchema.index(
  {
    prompt: 'text',
    fileName: 'text',
    additionalContext: 'text',
  },
  {
    name: 'PromptSearchIndex',
    weights: {
      prompt: 5,
      fileName: 2,
      additionalContext: 1,
    },
    default_language: 'english',
  }
);

promptSchema.index({ tags: 1 });

module.exports = mongoose.model('Prompt', promptSchema);
