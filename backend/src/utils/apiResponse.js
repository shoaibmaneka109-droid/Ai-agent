/**
 * Standardised JSON response helpers.
 * All API responses follow the shape:
 *   { success, data?, error?, meta? }
 */

function success(res, data = null, statusCode = 200, meta = null) {
  const body = { success: true };
  if (data !== null) body.data = data;
  if (meta !== null) body.meta = meta;
  return res.status(statusCode).json(body);
}

function created(res, data = null) {
  return success(res, data, 201);
}

function noContent(res) {
  return res.status(204).send();
}

function error(res, message, statusCode = 400, details = null) {
  const body = { success: false, error: { message } };
  if (details) body.error.details = details;
  return res.status(statusCode).json(body);
}

function notFound(res, resource = 'Resource') {
  return error(res, `${resource} not found`, 404);
}

function unauthorized(res, message = 'Unauthorized') {
  return error(res, message, 401);
}

function forbidden(res, message = 'Forbidden') {
  return error(res, message, 403);
}

function validationError(res, errors) {
  return error(res, 'Validation failed', 422, errors);
}

module.exports = { success, created, noContent, error, notFound, unauthorized, forbidden, validationError };
