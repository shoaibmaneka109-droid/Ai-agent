/**
 * Standardised JSON envelope used across all API endpoints.
 *
 * Success:  { success: true,  data: {...}, meta?: {...} }
 * Error:    { success: false, error: { code, message, details? } }
 */

const sendSuccess = (res, data = null, statusCode = 200, meta = null) => {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
};

const sendCreated = (res, data = null, meta = null) =>
  sendSuccess(res, data, 201, meta);

const sendError = (res, message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) => {
  const body = {
    success: false,
    error: { code, message },
  };
  if (details) body.error.details = details;
  return res.status(statusCode).json(body);
};

const sendValidationError = (res, details) =>
  sendError(res, 'Validation failed', 422, 'VALIDATION_ERROR', details);

const sendUnauthorized = (res, message = 'Unauthorized') =>
  sendError(res, message, 401, 'UNAUTHORIZED');

const sendForbidden = (res, message = 'Forbidden') =>
  sendError(res, message, 403, 'FORBIDDEN');

const sendNotFound = (res, resource = 'Resource') =>
  sendError(res, `${resource} not found`, 404, 'NOT_FOUND');

const sendConflict = (res, message) =>
  sendError(res, message, 409, 'CONFLICT');

module.exports = {
  sendSuccess,
  sendCreated,
  sendError,
  sendValidationError,
  sendUnauthorized,
  sendForbidden,
  sendNotFound,
  sendConflict,
};
