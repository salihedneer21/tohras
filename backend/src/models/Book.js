const mongoose = require('mongoose');

const imageAssetSchema = new mongoose.Schema(
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
  },
  { _id: true }
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
