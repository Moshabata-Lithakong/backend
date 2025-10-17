const multer = require('multer');
const path = require('path');
const AppError = require('../utils/appError');

// Configure multer for file uploads
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Check file type
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new AppError('Only image files are allowed', 400), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

// Middleware for single file upload
exports.uploadSingle = (fieldName) => {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return next(new AppError('File too large. Maximum size is 5MB', 400));
          }
        }
        return next(err);
      }
      next();
    });
  };
};

// Middleware for multiple file uploads
exports.uploadMultiple = (fieldName, maxCount = 5) => {
  return (req, res, next) => {
    upload.array(fieldName, maxCount)(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return next(new AppError('File too large. Maximum size is 5MB', 400));
          }
          if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return next(new AppError('Too many files uploaded', 400));
          }
        }
        return next(err);
      }
      next();
    });
  };
};

// Helper function to validate file dimensions (for images)
exports.validateImageDimensions = (width, height) => {
  return (req, res, next) => {
    if (!req.file) return next();
    
    // This would require additional image processing libraries like sharp
    // For now, it's a placeholder for future implementation
    next();
  };
};