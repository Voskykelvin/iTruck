class AppError extends Error {
  constructor(message, statusCode = 500, details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, details) {
    return new AppError(message, 400, details);
  }

  static unauthorized(message = 'Authentication required', details) {
    return new AppError(message, 401, details);
  }

  static forbidden(message = 'Forbidden', details) {
    return new AppError(message, 403, details);
  }

  static notFound(message = 'Not found', details) {
    return new AppError(message, 404, details);
  }
}

module.exports = AppError;
