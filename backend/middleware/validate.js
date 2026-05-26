const { validationResult } = require('express-validator');

function validate(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  res.status(400).json({
    message: 'Validation failed',
    errors: errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg
    }))
  });
}

module.exports = validate;
