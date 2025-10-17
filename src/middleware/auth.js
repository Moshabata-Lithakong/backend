const jwt = require('jsonwebtoken');
const User = require('../models/user');
const AppError = require('../utils/appError');

exports.protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Also check for token in query string (for testing)
    if (!token && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      console.log('Authentication failed: No token provided');
      return next(new AppError('You are not logged in. Please log in to access.', 401));
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded) {
      console.log('Authentication failed: Invalid token');
      return next(new AppError('Invalid token. Please log in again.', 401));
    }

    // Check if user still exists
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      console.log('Authentication failed: User not found');
      return next(new AppError('The user belonging to this token no longer exists.', 401));
    }

    // Check if user changed password after token was issued
    if (currentUser.changedPasswordAfter && currentUser.changedPasswordAfter(decoded.iat)) {
      console.log('Authentication failed: Password changed');
      return next(new AppError('User recently changed password. Please log in again.', 401));
    }

    // Grant access to protected route
    req.user = currentUser;
    console.log(`✅ User authenticated: ${currentUser.email} (${currentUser.role})`);
    next();
  } catch (error) {
    console.log('Authentication error:', error.message);
    return next(new AppError('Authentication failed. Please log in again.', 401));
  }
};

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      console.log('Authorization failed: No user in request');
      return next(new AppError('You are not logged in.', 401));
    }

    if (!roles.includes(req.user.role)) {
      console.log(`Authorization failed: User role ${req.user.role} not in ${roles}`);
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  };
};

exports.restrictToUser = (req, res, next) => {
  if (req.user.role === 'admin' || req.user._id.toString() === req.params.id) {
    return next();
  }
  console.log(`Authorization failed: User ${req.user.id} cannot access resource ${req.params.id}`);
  return next(new AppError('You do not have permission to access this resource', 403));
};