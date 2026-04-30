const logger = require('../utils/logger');
const { sendError } = require('../utils/apiResponse');

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    userId: req.user?.id,
    organizationId: req.user?.organizationId,
  });

  // PostgreSQL unique constraint violations
  if (err.code === '23505') {
    return sendError(res, 'A record with this value already exists', 409, 'CONFLICT');
  }

  // PostgreSQL foreign key violations
  if (err.code === '23503') {
    return sendError(res, 'Referenced resource not found', 400, 'REFERENCE_ERROR');
  }

  if (err.name === 'SyntaxError' && err.type === 'entity.parse.failed') {
    return sendError(res, 'Invalid JSON body', 400, 'PARSE_ERROR');
  }

  const statusCode = err.statusCode || err.status || 500;
  const message =
    process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'An unexpected error occurred'
      : err.message;

  return sendError(res, message, statusCode, err.code || 'INTERNAL_ERROR');
};

module.exports = errorHandler;
