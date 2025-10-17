const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Vendor ID is required'],
    validate: {
      validator: async function (value) {
        try {
          const User = mongoose.model('User');
          const user = await User.findById(value);
          return user && user.role === 'vendor';
        } catch (error) {
          return false;
        }
      },
      message: 'Vendor ID must reference a valid vendor user',
    },
  },
  name: {
    en: {
      type: String,
      required: [true, 'English product name is required'],
      trim: true,
    },
    st: {
      type: String,
      required: [true, 'Sesotho product name is required'],
      trim: true,
    },
  },
  description: {
    en: {
      type: String,
      required: [true, 'English description is required'],
    },
    st: {
      type: String,
      required: [true, 'Sesotho description is required'],
    },
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['food', 'drinks', 'clothing', 'electronics', 'household', 'other'],
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative'],
  },
  currency: {
    type: String,
    default: 'LSL',
    enum: ['LSL', 'ZAR'],
  },
  images: [{
    url: {
      type: String,
      required: [true, 'Image URL is required'],
      validate: {
        validator: function (v) {
          return /^(https?:\/\/[^\s$.?#].[^\s]*)$/.test(v);
        },
        message: 'Invalid image URL',
      },
    },
    publicId: {
      type: String,
      required: [true, 'Image public ID is required'],
    },
  }],
  tags: [{
    type: String,
    enum: ['organic', 'local', 'vegan', 'handmade', 'new', 'sale', 'featured'],
    default: [],
  }],
  available: {
    type: Boolean,
    default: true,
  },
  stockQuantity: {
    type: Number,
    required: [true, 'Stock quantity is required'],
    min: [0, 'Stock quantity cannot be negative'],
  },
  priority: {
    type: Number,
    default: 1,
    min: [1, 'Priority must be at least 1'],
    max: [10, 'Priority cannot exceed 10'],
  },
  ratings: {
    average: {
      type: Number,
      default: 0,
      min: [0, 'Rating cannot be negative'],
      max: [5, 'Rating cannot exceed 5'],
    },
    count: {
      type: Number,
      default: 0,
      min: [0, 'Rating count cannot be negative'],
    },
  },
}, {
  timestamps: true,
});

// Indexes for better performance
productSchema.index({ vendorId: 1 });
productSchema.index({ category: 1 });
productSchema.index({ available: 1 });
productSchema.index({ priority: -1 });
productSchema.index({ 'name.en': 'text', 'name.st': 'text', 'description.en': 'text', 'description.st': 'text' });

// Virtual for checking if product is in stock
productSchema.virtual('inStock').get(function () {
  return this.stockQuantity > 0;
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

// FIX: Check if model already exists to prevent overwrite
module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);