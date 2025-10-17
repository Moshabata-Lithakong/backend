const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  // Order Identification
  passengerId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Order must belong to a passenger']
  },
  vendorId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Order must belong to a vendor']
  },
  taxiDriverId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },

  // Order Items
  items: [{
    productId: {
      type: mongoose.Schema.ObjectId,
      ref: 'Product',
      required: true
    },
    productName: {
      en: { type: String, required: true },
      st: { type: String, required: true }
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1']
    },
    price: {
      type: Number,
      required: true,
      min: [0, 'Price must be positive']
    },
    _id: false
  }],

  // Location Information
  pickupLocation: {
    address: {
      type: String,
      required: [true, 'Pickup address is required']
    },
    coordinates: {
      latitude: {
        type: Number,
        required: [true, 'Pickup latitude is required'],
        min: -90,
        max: 90
      },
      longitude: {
        type: Number,
        required: [true, 'Pickup longitude is required'],
        min: -180,
        max: 180
      }
    },
    vendorName: String,
    vendorPhone: String
  },

  destination: {
    address: {
      type: String,
      required: [true, 'Destination address is required']
    },
    coordinates: {
      latitude: {
        type: Number,
        required: [true, 'Destination latitude is required'],
        min: -90,
        max: 90
      },
      longitude: {
        type: Number,
        required: [true, 'Destination longitude is required'],
        min: -180,
        max: 180
      }
    },
    instructions: String,
    passengerName: String,
    passengerPhone: String
  },

  // Payment Information
  payment: {
    method: {
      type: String,
      enum: ['cash', 'mpesa', 'ecocash'],
      required: [true, 'Payment method is required']
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
      default: 'pending'
    },
    phoneNumber: String,
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0, 'Payment amount must be positive']
    },
    transactionId: String,
    paymentDate: Date
  },

  // Order Status & Tracking
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'ready', 'delivering', 'completed', 'cancelled'],
    default: 'pending'
  },
  totalAmount: {
    type: Number,
    required: [true, 'Total amount is required'],
    min: [0, 'Total amount must be positive']
  },
  deliveryFee: {
    type: Number,
    required: true,
    default: 15.0,
    min: [0, 'Delivery fee must be positive']
  },
  isUrgent: {
    type: Boolean,
    default: false
  },

  // Driver & Delivery Information
  driverAssignedAt: Date,
  pickupConfirmedAt: Date,
  deliveryConfirmedAt: Date,
  estimatedDelivery: Date,
  actualDelivery: Date,

  // NEW: Cancellation tracking fields
  cancelledAt: Date,
  cancelledBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },

  // Order Details
  notes: String,
  rejectedDrivers: [{
    driverId: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    },
    reason: String,
    rejectedAt: {
      type: Date,
      default: Date.now
    },
    _id: false
  }],

  // Ratings & Feedback
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  feedback: String,
  vendorRating: {
    type: Number,
    min: 1,
    max: 5
  },
  driverRating: {
    type: Number,
    min: 1,
    max: 5
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for order duration
OrderSchema.virtual('duration').get(function() {
  if (this.createdAt && this.actualDelivery) {
    return this.actualDelivery - this.createdAt;
  }
  return null;
});

// Virtual for isDelayed
OrderSchema.virtual('isDelayed').get(function() {
  if (this.estimatedDelivery && new Date() > this.estimatedDelivery) {
    return true;
  }
  return false;
});

// Virtual for cancellation information
OrderSchema.virtual('cancellationInfo').get(function() {
  if (this.status === 'cancelled' && this.cancelledAt) {
    return {
      cancelledAt: this.cancelledAt,
      cancelledBy: this.cancelledBy,
      wasCancelled: true
    };
  }
  return { wasCancelled: false };
});

// Indexes for performance
OrderSchema.index({ passengerId: 1 });
OrderSchema.index({ vendorId: 1 });
OrderSchema.index({ taxiDriverId: 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ 'payment.status': 1 });
OrderSchema.index({ vendorId: 1, status: 1 });
OrderSchema.index({ taxiDriverId: 1, status: 1 });
OrderSchema.index({ cancelledAt: 1 }); // NEW: Index for cancellation queries

// Pre-save middleware to update timestamps
OrderSchema.pre('save', function(next) {
  if (this.status === 'delivering' && !this.pickupConfirmedAt) {
    this.pickupConfirmedAt = new Date();
  }
  if (this.status === 'completed' && !this.actualDelivery) {
    this.actualDelivery = new Date();
  }
  if (this.status === 'cancelled' && !this.cancelledAt) {
    this.cancelledAt = new Date();
  }
  next();
});

// Static method to get orders by status
OrderSchema.statics.getOrdersByStatus = function(status) {
  return this.find({ status }).populate('passengerId vendorId taxiDriverId');
};

// Static method to get vendor orders
OrderSchema.statics.getVendorOrders = function(vendorId) {
  return this.find({ vendorId })
    .populate('passengerId', 'profile')
    .populate('taxiDriverId', 'profile')
    .sort({ createdAt: -1 });
};

// Static method to get driver orders
OrderSchema.statics.getDriverOrders = function(driverId) {
  return this.find({ taxiDriverId: driverId })
    .populate('passengerId', 'profile')
    .populate('vendorId', 'profile')
    .sort({ createdAt: -1 });
};

// Static method to get available delivery orders
OrderSchema.statics.getAvailableDeliveryOrders = function() {
  return this.find({ 
    status: { $in: ['ready', 'confirmed'] }, 
    taxiDriverId: null 
  })
  .populate('passengerId', 'profile')
  .populate('vendorId', 'profile vendorInfo')
  .select('+pickupLocation +destination +deliveryFee +payment +items')
  .sort({ createdAt: -1 });
};

// NEW: Static method to get driver assigned deliveries
OrderSchema.statics.getDriverAssignedDeliveries = function(driverId) {
  return this.find({ 
    taxiDriverId: driverId,
    status: { $in: ['delivering', 'ready', 'confirmed'] }
  })
  .populate('passengerId', 'profile')
  .populate('vendorId', 'profile vendorInfo')
  .select('+pickupLocation +destination +deliveryFee +payment +items')
  .sort({ createdAt: -1 });
};

// Instance method to check if user can update order
OrderSchema.methods.canUserUpdate = function(userId, userRole) {
  if (userRole === 'admin') return true;
  if (userRole === 'vendor' && this.vendorId.toString() === userId) return true;
  if (userRole === 'taxi_driver' && this.taxiDriverId && this.taxiDriverId.toString() === userId) return true;
  if (userRole === 'passenger' && this.passengerId.toString() === userId) return true;
  return false;
};

// NEW: Instance method to check if passenger can cancel order
OrderSchema.methods.canPassengerCancel = function() {
  return this.status === 'pending' || this.status === 'confirmed';
};

// Instance method to get order summary
OrderSchema.methods.getOrderSummary = function() {
  return {
    orderId: this._id,
    status: this.status,
    totalAmount: this.totalAmount,
    deliveryFee: this.deliveryFee,
    itemCount: this.items.reduce((sum, item) => sum + item.quantity, 0),
    createdAt: this.createdAt,
    estimatedDelivery: this.estimatedDelivery,
    isCancellable: this.canPassengerCancel()
  };
};

// NEW: Instance method to cancel order
OrderSchema.methods.cancelOrder = function(cancelledByUserId) {
  if (this.status === 'cancelled') {
    throw new Error('Order is already cancelled');
  }
  
  if (!this.canPassengerCancel() && cancelledByUserId.toString() === this.passengerId.toString()) {
    throw new Error('Order cannot be cancelled at this stage');
  }

  this.status = 'cancelled';
  this.cancelledAt = new Date();
  this.cancelledBy = cancelledByUserId;
  
  return this.save();
};

module.exports = mongoose.model('Order', OrderSchema);