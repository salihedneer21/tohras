const mongoose = require('mongoose');

const toOptionalTrimmedString = (value) => {
  if (typeof value !== 'string') return value === '' ? undefined : value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const toOptionalLowercaseString = (value) => {
  if (typeof value !== 'string') return value === '' ? undefined : value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed.toLowerCase();
};

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

const shippingAddressSchema = new mongoose.Schema(
  {
    country: {
      type: String,
      trim: true,
      default: null,
      set: toOptionalTrimmedString,
    },
    firstName: {
      type: String,
      trim: true,
      default: null,
      set: toOptionalTrimmedString,
    },
    lastName: {
      type: String,
      trim: true,
      default: null,
      set: toOptionalTrimmedString,
    },
    addressLine1: {
      type: String,
      trim: true,
      default: null,
      set: toOptionalTrimmedString,
    },
    addressLine2: {
      type: String,
      trim: true,
      default: null,
      set: toOptionalTrimmedString,
    },
    city: {
      type: String,
      trim: true,
      default: null,
      set: toOptionalTrimmedString,
    },
    postCode: {
      type: String,
      trim: true,
      default: null,
      set: toOptionalTrimmedString,
    },
    state: {
      type: String,
      trim: true,
      default: null,
      set: toOptionalTrimmedString,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
      set: toOptionalLowercaseString,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
      set: toOptionalTrimmedString,
    },
  },
  { _id: false }
);

/**
 * User Schema for storing student/child information
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters long'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    secondTitle: {
      type: String,
      trim: true,
      maxlength: [500, 'Second title cannot exceed 500 characters'],
      set: toOptionalTrimmedString,
      default: '',
    },
    shareMessage: {
      type: String,
      trim: true,
      maxlength: [2000, 'Share message cannot exceed 2000 characters'],
      set: toOptionalTrimmedString,
      default: null,
    },
    age: {
      type: Number,
      min: [0, 'Age must be at least 0'],
      max: [150, 'Age cannot exceed 150'],
      default: null,
    },
    gender: {
      type: String,
      enum: {
        values: ['male', 'female', 'other'],
        message: '{VALUE} is not a valid gender',
      },
      set: toOptionalTrimmedString,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email address',
      ],
      set: toOptionalLowercaseString,
    },
    phone: {
      type: String,
      trim: true,
      default: null,
      set: toOptionalTrimmedString,
    },
    shopifyOrderName: {
      type: String,
      trim: true,
      default: null,
    },
    shopifyBookName: {
      type: String,
      trim: true,
      default: null,
    },
    shopifyOrderId: {
      type: String,
      trim: true,
    },
    imageAssets: {
      type: [imageAssetSchema],
      default: [],
    },
    shippingAddress: {
      type: shippingAddressSchema,
      default: null,
    },
    printOrderPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
userSchema.index({ status: 1 });
userSchema.index({ shopifyOrderId: 1 }, { unique: true, sparse: true });

userSchema.methods.removeImageAsset = function (assetId) {
  this.imageAssets = this.imageAssets.filter((asset) => asset._id.toString() !== assetId.toString());
};

// Ensure virtuals are included in JSON
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

const User = mongoose.model('User', userSchema);

module.exports = User;
