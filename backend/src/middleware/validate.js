const { validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      error: 'Validation failed',
      details: errors.array().map(({ msg, path }) => ({ field: path, message: msg })),
    });
  }
  next();
};

module.exports = validate;
