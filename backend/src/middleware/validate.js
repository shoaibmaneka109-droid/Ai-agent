const { validationResult } = require('express-validator');
const { validationError }  = require('../utils/apiResponse');

/**
 * Middleware to collect express-validator errors and short-circuit on failure.
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return validationError(res, errors.array());
  }
  next();
}

module.exports = validate;
