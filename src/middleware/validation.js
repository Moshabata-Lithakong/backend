const { validationResult } = require('express-validator');
const AppError = require('../utils/appError');

exports.validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    const errorMessages = errors.array().map(error => error.msg);
    return next(new AppError(errorMessages.join(', '), 400));
  };
};

exports.sanitizeInput = (req, res, next) => {
  // Sanitize request body
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim();
        
        // Remove potentially dangerous characters
        req.body[key] = req.body[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        
        // Limit string length for certain fields
        if (key === 'email' && req.body[key].length > 254) {
          req.body[key] = req.body[key].substring(0, 254);
        }
      }
    });
  }
  
  next();
};