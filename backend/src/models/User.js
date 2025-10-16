const mongoose = require('mongoose');

const imageAssetSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, default: 0 },
    contentType: { type: String, default: null },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
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
    age: {
      type: Number,
      required: [true, 'Age is required'],
      min: [1, 'Age must be at least 1'],
      max: [150, 'Age cannot exceed 150'],
    },
    gender: {
      type: String,
      required: [true, 'Gender is required'],
      enum: {
        values: ['male', 'female', 'other'],
        message: '{VALUE} is not a valid gender',
      },
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      trim: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please enter a valid email address',
      ],
    },
    countryCode: {
      type: String,
      required: [true, 'Country code is required'],
      trim: true,
      match: [/^\+\d{1,4}$/, 'Please enter a valid country code (e.g., +1, +91)'],
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      match: [/^\d{6,15}$/, 'Please enter a valid phone number'],
    },
    imageAssets: {
      type: [imageAssetSchema],
      default: [],
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

// Virtual for full phone number
userSchema.virtual('fullPhoneNumber').get(function () {
  return `${this.countryCode}${this.phoneNumber}`;
});

userSchema.methods.removeImageAsset = function (assetId) {
  this.imageAssets = this.imageAssets.filter((asset) => asset._id.toString() !== assetId.toString());
};

// Ensure virtuals are included in JSON
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

const User = mongoose.model('User', userSchema);

module.exports = User;
