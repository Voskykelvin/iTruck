const mongoose = require('mongoose');
const { body, param, query } = require('express-validator');
const { mongoReady } = require('../config/runtime');

function requiredString(field, max = 500) {
  return body(field).trim().isLength({ min: 1, max }).withMessage(`${field} is required`);
}

function optionalString(field, max = 500) {
  return body(field)
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max })
    .withMessage(`${field} must be at most ${max} characters`);
}

function optionalPositiveNumber(field) {
  return body(field)
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage(`${field} must be a positive number`)
    .toFloat();
}

function positiveAmount(field = 'amount') {
  return body(field).isFloat({ min: 0.01 }).withMessage(`${field} must be greater than zero`).toFloat();
}

function booleanBody(field) {
  return body(field).isBoolean().withMessage(`${field} must be true or false`).toBoolean();
}

function optionalBooleanQuery(field) {
  return query(field)
    .optional({ checkFalsy: true })
    .isBoolean()
    .withMessage(`${field} must be true or false`)
    .toBoolean();
}

function mongoIdParam(field = 'id') {
  return param(field).trim().isMongoId().withMessage(`${field} is invalid`);
}

function liveMongoIdParam(field = 'id') {
  return param(field)
    .trim()
    .notEmpty()
    .withMessage(`${field} is required`)
    .bail()
    .custom((value) => {
      if (!mongoReady() || mongoose.Types.ObjectId.isValid(value)) return true;
      throw new Error(`${field} is invalid`);
    });
}

function liveMongoIdBody(fields, options = {}) {
  const candidates = Array.isArray(fields) ? fields : [fields];
  const required = options.required === true;

  return body().custom((_, { req }) => {
    const value = candidates.map((field) => req.body?.[field]).find(Boolean);
    if (!value) {
      if (required) throw new Error(`${candidates[0]} is required`);
      return true;
    }
    if (!mongoReady() || mongoose.Types.ObjectId.isValid(value)) return true;
    throw new Error(`${candidates[0]} is invalid`);
  });
}

const pagination = [
  query('page').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('page must be a positive integer').toInt(),
  query('limit')
    .optional({ checkFalsy: true })
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100')
    .toInt()
];

module.exports = {
  booleanBody,
  liveMongoIdBody,
  liveMongoIdParam,
  mongoIdParam,
  optionalBooleanQuery,
  optionalPositiveNumber,
  optionalString,
  pagination,
  positiveAmount,
  requiredString
};
