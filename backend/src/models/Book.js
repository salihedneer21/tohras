const mongoose = require('mongoose');

const imageAssetSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    url: { type: String, required: true },
    signedUrl: { type: String, default: null },
    downloadUrl: { type: String, default: null },
    size: { type: Number, default: 0 },
    contentType: { type: String, default: null },
    uploadedAt: { type: Date, default: Date.now },
    originalName: { type: String, default: null },
    backgroundRemoved: { type: Boolean, default: false },
  },
  { _id: true }
);

const rankingNoteSchema = new mongoose.Schema(
  {
    imageIndex: { type: Number, default: null },
    score: { type: Number, default: null },
    verdict: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  { _id: false }
);

const coverConfigSchema = new mongoose.Schema(
  {
    headline: {
      type: String,
      default: '',
      trim: true,
    },
    footer: {
      type: String,
      default: '',
      trim: true,
    },
    bodyOverride: {
      type: String,
      default: '',
      trim: true,
    },
    qrCodeImage: {
      type: imageAssetSchema,
      default: null,
    },
    uppercaseName: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const pageSchema = new mongoose.Schema(
  {
    order: {
      type: Number,
      required: true,
      min: 1,
    },
    text: {
      type: String,
      default: '',
      trim: true,
    },
    characterPrompt: {
      type: String,
      default: '',
      trim: true,
    },
    backgroundImage: {
      type: imageAssetSchema,
      default: null,
    },
    characterImage: {
      type: imageAssetSchema,
      default: null,
    },
    characterImageOriginal: {
      type: imageAssetSchema,
      default: null,
    },
    pageType: {
      type: String,
      enum: ['story', 'cover'],
      default: 'story',
    },
    cover: {
      type: coverConfigSchema,
      default: null,
    },
  },
  { _id: true }
);

const pageSnapshotSchema = new mongoose.Schema(
  {
    order: { type: Number, required: true },
    text: { type: String, default: '' },
    quote: { type: String, default: '' },
    background: { type: imageAssetSchema, default: null },
    character: { type: imageAssetSchema, default: null },
    characterOriginal: { type: imageAssetSchema, default: null },
    generationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Generation', default: null },
    candidateAssets: { type: [imageAssetSchema], default: [] },
    selectedCandidateIndex: { type: Number, default: null },
    rankingSummary: { type: String, default: '' },
    rankingNotes: { type: [rankingNoteSchema], default: [] },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const pdfAssetSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, default: 0 },
    contentType: { type: String, default: 'application/pdf' },
    title: { type: String, default: '' },
    pageCount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    trainingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Training', default: null },
    storybookJobId: { type: mongoose.Schema.Types.ObjectId, ref: 'StorybookJob', default: null },
    readerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    readerName: { type: String, default: '' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    pages: { type: [pageSnapshotSchema], default: [] },
    variant: {
      type: String,
      enum: ['standard', 'split'],
      default: 'standard',
    },
    derivedFromAssetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: true }
);

const bookSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Book name is required'],
      trim: true,
      minlength: [3, 'Book name must be at least 3 characters'],
      maxlength: [120, 'Book name cannot exceed 120 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'both'],
      default: 'both',
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
    slug: {
      type: String,
      unique: true,
      index: true,
    },
    coverImage: {
      type: imageAssetSchema,
      default: null,
    },
    pages: {
      type: [pageSchema],
      default: [],
    },
    pdfAssets: {
      type: [pdfAssetSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

bookSchema.index({ status: 1 });
bookSchema.index({ name: 'text', description: 'text' });

const Book = mongoose.model('Book', bookSchema);

module.exports = Book;
