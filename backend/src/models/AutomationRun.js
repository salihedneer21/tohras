const mongoose = require('mongoose');

const automationEventSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    message: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: true }
);

const automationRunSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    bookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book',
      required: true,
    },
    trainingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Training',
      default: null,
    },
    storybookJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StorybookJob',
      default: null,
    },
    status: {
      type: String,
      enum: [
        'creating_user',
        'uploading_images',
        'training',
        'storybook_pending',
        'storybook',
        'completed',
        'failed',
      ],
      default: 'creating_user',
    },
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    error: {
      type: String,
      default: null,
    },
    steps: {
      type: Map,
      of: String,
      default: {},
    },
    trainingSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    storybookSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    events: {
      type: [automationEventSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

automationRunSchema.index({ createdAt: -1 });
automationRunSchema.index({ trainingId: 1 });
automationRunSchema.index({ storybookJobId: 1 });

const AutomationRun = mongoose.model('AutomationRun', automationRunSchema);

module.exports = AutomationRun;
