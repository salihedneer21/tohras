const mongoose = require('mongoose');

const evaluationSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true, trim: true },
    mimeType: { type: String, default: null },
    size: { type: Number, default: 0 },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    verdict: {
      type: String,
      enum: ['accept', 'needs_more', 'reject'],
      default: 'needs_more',
      index: true,
    },
    acceptable: { type: Boolean, default: false },
    score: { type: Number, default: 0 },
    confidence: { type: Number, default: 0 },
    summary: { type: String, default: '' },
    recommendations: {
      type: [String],
      default: [],
    },
    criteria: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    evaluation: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    tags: {
      type: [String],
      default: [],
      set: (values) => {
        if (!Array.isArray(values)) return [];
        const set = new Set();
        const result = [];
        values.forEach((value) => {
          if (typeof value !== 'string') return;
          const trimmed = value.trim();
          if (!trimmed) return;
          const lower = trimmed.toLowerCase();
          if (set.has(lower)) return;
          set.add(lower);
          result.push(trimmed);
        });
        return result.slice(0, 12);
      },
    },
    decision: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    s3Key: { type: String, required: true, index: true },
    s3Url: { type: String, required: true },
  },
  {
    timestamps: true,
  }
);

evaluationSchema.index({ fileName: 'text', summary: 'text', recommendations: 'text' });
evaluationSchema.index({ tags: 1 });

module.exports = mongoose.model('Evaluation', evaluationSchema);
