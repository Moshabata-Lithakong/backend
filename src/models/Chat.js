const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  message: {
    type: String,
    required: [true, 'Message content is required'],
    trim: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  read: {
    type: Boolean,
    default: false
  }
});

const chatSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  messages: [messageSchema],
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  lastMessageAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for better query performance
chatSchema.index({ participants: 1 });
chatSchema.index({ orderId: 1 });
chatSchema.index({ lastMessageAt: -1 });

// Method to add a message
chatSchema.methods.addMessage = function(senderId, message) {
  this.messages.push({
    senderId: senderId,
    message: message
  });
  this.lastMessageAt = new Date();
  return this.save();
};

const Chat = mongoose.model('Chat', chatSchema);

module.exports = Chat;