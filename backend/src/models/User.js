const mongoose = require('mongoose');

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
    imageUrls: {
      type: [String],
      default: [],
      validate: {
        validator: function (urls) {
          return urls.every((url) => {
            try {
              new URL(url);
              return true;
            } catch (error) {
              return false;
            }
          });
        },
        message: 'All image URLs must be valid URLs',
      },
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

// Index for faster queries (unique email index)
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ status: 1 });

// Virtual for full phone number
userSchema.virtual('fullPhoneNumber').get(function () {
  return `${this.countryCode}${this.phoneNumber}`;
});

// Ensure virtuals are included in JSON
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

const User = mongoose.model('User', userSchema);

module.exports = User;
