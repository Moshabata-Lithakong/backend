const mongoose = require('mongoose');
const AppError = require('./appError');

const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch((err) => {
      console.error('Caught error in catchAsync:', {
        message: err.message,
        stack: err.stack,
        path: req.originalUrl,
        method: req.method,
      });

      // Transform uncaught errors into AppError
      if (!(err instanceof AppError)) {
        return next(
          new AppError(
            err.message || 'An unexpected error occurred',
            500,
            'UNEXPECTED_ERROR',
            { originalError: err.message },
          ),
        );
      }
      return next(err);
    });
  };
};

module.exports = catchAsync;