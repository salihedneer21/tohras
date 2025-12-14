const mongoose = require('mongoose');

const storybookLogEventSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    message: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: true }
);

const storybookGeneratedLogSchema = new mongoose.Schema(
  {
    storybookJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StorybookJob',
      required: true,
      index: true,
    },
    bookId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book',
      default: null,
      index: true,
    },
    events: {
      type: [storybookLogEventSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'storybooksGeneratedLogs',
  }
);

const StorybookGeneratedLog = mongoose.model(
  'StorybookGeneratedLog',
  storybookGeneratedLogSchema
);

module.exports = StorybookGeneratedLog;

