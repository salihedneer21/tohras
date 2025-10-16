const mongoose = require('mongoose');

/**
 * Generation Schema for storing image generation history
 */
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
      enum: ['processing', 'succeeded', 'failed'],
      default: 'processing',
    },
    imageUrls: {
      type: [String],
      default: [],
    },
    error: {
      type: String,
      default: null,
    },
    completedAt: {
      type: Date,
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

const Generation = mongoose.model('Generation', generationSchema);

module.exports = Generation;
