const logger = require('../logger');

/** An error that maps directly onto the shared error envelope. */
class AppError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const notFound = (req, res, next) =>
  next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`));

// Express identifies error handlers by arity, so `next` must stay in the signature.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.name === 'ValidationError') {
    err = new AppError(400, 'VALIDATION_FAILED', 'Validation failed',
      Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message])));
  } else if (err.name === 'CastError') {
    err = new AppError(400, 'INVALID_ID', `Invalid value for ${err.path}`);
  } else if (err.code === 11000) {
    err = new AppError(409, 'DUPLICATE', 'Resource already exists', err.keyValue);
  } else if (err.type === 'entity.parse.failed') {
    err = new AppError(400, 'MALFORMED_JSON', 'Request body is not valid JSON');
  }

  const status = err.status || 500;
  if (status >= 500) logger.error({ err, requestId: req.id }, 'unhandled error');

  res.status(status).json({
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: status >= 500 ? 'Something went wrong' : err.message,
      details: err.details || {},
      requestId: req.id,
    },
  });
}

/** Wraps an async route handler so rejected promises reach the error handler. */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { AppError, notFound, errorHandler, ah };
