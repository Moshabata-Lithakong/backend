const User = require('../models/user');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const APIFeatures = require('../utils/apiFeatures');

exports.getAllUsers = catchAsync(async (req, res, next) => {
  const features = new APIFeatures(User.find(), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const users = await features.query;

  res.status(200).json({
    status: 'success',
    results: users.length,
    data: {
      users,
    },
  });
});

exports.getUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      user,
    },
  });
});

exports.updateUser = catchAsync(async (req, res, next) => {
  // Filter out fields that are not allowed to be updated
  const filteredBody = {};
  const allowedFields = ['profile', 'vendorInfo', 'taxiDriverInfo', 'preferences', 'isActive'];
  
  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredBody[key] = req.body[key];
    }
  });

  const user = await User.findByIdAndUpdate(req.params.id, filteredBody, {
    new: true,
    runValidators: true,
  });

  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      user,
    },
  });
});

exports.deleteUser = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true }
  );

  if (!user) {
    return next(new AppError('No user found with that ID', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
});

exports.getUserStats = catchAsync(async (req, res, next) => {
  const stats = await User.aggregate([
    {
      $match: { isActive: true }
    },
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 },
        avgRating: { $avg: '$ratings.average' }
      }
    },
    {
      $sort: { count: -1 }
    }
  ]);

  const totalUsers = await User.countDocuments({ isActive: true });
  const activeToday = await User.countDocuments({
    lastLogin: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  });

  res.status(200).json({
    status: 'success',
    data: {
      stats,
      totalUsers,
      activeToday,
    },
  });
});

exports.getVendors = catchAsync(async (req, res, next) => {
  const features = new APIFeatures(
    User.find({ role: 'vendor', isActive: true }),
    req.query
  )
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const vendors = await features.query.populate('vendorInfo');

  res.status(200).json({
    status: 'success',
    results: vendors.length,
    data: {
      vendors,
    },
  });
});

exports.getTaxiDrivers = catchAsync(async (req, res, next) => {
  const features = new APIFeatures(
    User.find({ role: 'taxi_driver', isActive: true, 'taxiDriverInfo.available': true }),
    req.query
  )
    .filter()
    .sort()
    .limitFields()
    .paginate();

  const drivers = await features.query.populate('taxiDriverInfo');

  res.status(200).json({
    status: 'success',
    results: drivers.length,
    data: {
      drivers,
    },
  });
});