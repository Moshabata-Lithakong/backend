const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false,
  },
  role: {
    type: String,
    enum: ['admin', 'vendor', 'taxi_driver', 'passenger'],
    default: 'passenger',
  },
  profile: {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      validate: {
        validator: function (v) {
          return /^\+266\d{8}$/.test(v);
        },
        message: 'Please provide a valid Lesotho phone number (+266 followed by 8 digits)',
      },
    },
    avatar: {
      type: String,
      default: 'default-avatar.png',
    },
  },
  vendorInfo: {
    shopName: String,
    shopLocation: {
      address: String,
      coordinates: {
        latitude: {
          type: Number,
          min: [-90, 'Latitude must be between -90 and 90'],
          max: [90, 'Latitude must be between -90 and 90'],
        },
        longitude: {
          type: Number,
          min: [-180, 'Longitude must be between -180 and 180'],
          max: [180, 'Longitude must be between -180 and 180'],
        },
      },
    },
    taxNumber: String,
    verified: {
      type: Boolean,
      default: false,
    },
  },
  taxiDriverInfo: {
    licenseNumber: String,
    vehicleType: String,
    vehiclePlate: String,
    available: {
      type: Boolean,
      default: false,
    },
    currentLocation: {
      coordinates: {
        latitude: {
          type: Number,
          min: [-90, 'Latitude must be between -90 and 90'],
          max: [90, 'Latitude must be between -90 and 90'],
        },
        longitude: {
          type: Number,
          min: [-180, 'Longitude must be between -180 and 180'],
          max: [180, 'Longitude must be between -180 and 180'],
        },
      },
    },
  },
  preferences: {
    language: {
      type: String,
      enum: ['en', 'st'],
      default: 'en',
    },
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light',
    },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastLogin: Date,
  passwordChangedAt: Date,
}, {
  timestamps: true,
});

// Index for better query performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ 'vendorInfo.verified': 1 });

// Pre-save middleware to hash password
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Instance method to check password
userSchema.methods.correctPassword = async function (candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// Instance method to check if password was changed after token issuance
userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Instance method to update last login
userSchema.methods.updateLastLogin = function () {
  this.lastLogin = new Date();
  return this.save({ validateBeforeSave: false });
};

// Safe model export to prevent OverwriteModelError
module.exports = mongoose.models.User || mongoose.model('User', userSchema);