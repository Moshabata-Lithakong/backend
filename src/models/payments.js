const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Order',
    required: true
  },
  passengerId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  vendorId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['mpesa', 'ecocash', 'cash'],
    required: true
  },
  phoneNumber: {
    type: String,
    required: function() {
      return this.paymentMethod !== 'cash';
    }
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  reference: {
    type: String, // M-Pesa CheckoutRequestID or EcoCash transaction ID
    required: function() {
      return this.paymentMethod !== 'cash';
    }
  },
  completedAt: {
    type: Date
  },
  failureReason: {
    type: String
  }
}, {
  timestamps: true
});

// Index for faster queries
PaymentSchema.index({ orderId: 1 });
PaymentSchema.index({ passengerId: 1 });
PaymentSchema.index({ vendorId: 1 });
PaymentSchema.index({ status: 1 });

module.exports = mongoose.model('Payment', PaymentSchema);