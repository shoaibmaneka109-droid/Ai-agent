const { validationResult } = require('express-validator');
const { sendValidationError } = require('../utils/apiResponse');

/**
 * Run express-validator checks and return 422 if any fail.
 * Pass an array of validator chains as `validators`.
 *
 * Usage:
 *   router.post('/login', validate([
 *     body('email').isEmail(),
 *     body('password').notEmpty(),
 *   ]), loginHandler)
 */
const validate = (validators) => {
  return async (req, res, next) => {
    for (const validator of validators) {
      await validator.run(req);
    }

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    const details = errors.array().map((e) => ({
      field: e.path,
      message: e.msg,
    }));

    return sendValidationError(res, details);
  };
};

module.exports = validate;
