const mongoose = require('mongoose');

const DriverEarningsSchema = new mongoose.Schema({
  driverId: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  orderId: {
    type: mongoose.Schema.ObjectId,
    ref: 'Order',
    required: true
  },
  deliveryFee: {
    type: Number,
    required: true,
    min: 0
  },
  commission: {
    type: Number,
    default: 0, // Platform commission if any
    min: 0
  },
  driverAmount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'LSL'
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'paid', 'cancelled'],
    default: 'pending'
  },
  paymentDate: {
    type: Date
  },
  paymentMethod: {
    type: String,
    enum: ['mpesa', 'ecocash', 'bank', 'cash'],
    default: 'mpesa'
  },
  transactionId: {
    type: String
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// Index for faster queries
DriverEarningsSchema.index({ driverId: 1 });
DriverEarningsSchema.index({ orderId: 1 });
DriverEarningsSchema.index({ status: 1 });
DriverEarningsSchema.index({ createdAt: 1 });

// Static method to get driver's total earnings
DriverEarningsSchema.statics.getDriverTotalEarnings = function(driverId) {
  return this.aggregate([
    {
      $match: {
        driverId: new mongoose.Types.ObjectId(driverId),
        status: 'paid'
      }
    },
    {
      $group: {
        _id: '$driverId',
        totalEarnings: { $sum: '$driverAmount' },
        totalDeliveries: { $sum: 1 },
        averageEarning: { $avg: '$driverAmount' }
      }
    }
  ]);
};

// Static method to get driver's weekly/monthly earnings
DriverEarningsSchema.statics.getDriverEarningsByPeriod = function(driverId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        driverId: new mongoose.Types.ObjectId(driverId),
        status: 'paid',
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
        },
        dailyEarnings: { $sum: '$driverAmount' },
        deliveryCount: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
};

module.exports = mongoose.model('DriverEarnings', DriverEarningsSchema);