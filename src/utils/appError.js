class AppError extends Error {
  constructor(message, statusCode, errorCode = 'GENERIC_ERROR', details = {}) {
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.errorCode = errorCode;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);

    // Log non-operational errors for debugging
    if (!this.isOperational) {
      console.error('Non-operational error:', {
        message,
        statusCode,
        errorCode,
        details,
        stack: this.stack,
      });
    }
  }
}

module.exports = AppError;