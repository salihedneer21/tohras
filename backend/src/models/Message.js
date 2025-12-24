const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['admin', 'guest'],
      required: true,
    },
    content: {
      type: String,
      trim: true,
      required: true,
      maxlength: 2000,
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ userId: 1, createdAt: 1, _id: 1 });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;

