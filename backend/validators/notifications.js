const { body } = require('express-validator');
const { mongoIdParam, pagination } = require('./common');

const listNotificationsSchema = [...pagination];
const markReadSchema = [mongoIdParam('id')];
const preferenceBooleanFields = [
  'channels.inApp',
  'channels.push',
  'channels.email',
  'channels.sms',
  'categories.bookings',
  'categories.tracking',
  'categories.documents',
  'categories.payments',
  'categories.security',
  'categories.marketing',
  'categories.system',
  'quietHours.enabled',
  'quietHours.allowHighPriority'
];

const notificationPreferencesSchema = [
  ...preferenceBooleanFields.map((field) =>
    body(field).optional().isBoolean().withMessage(`${field} must be true or false`).toBoolean()
  ),
  body('quietHours.start')
    .optional()
    .matches(/^([01]\d|2[0-3]):[0-5]\d$/)
    .withMessage('quietHours.start must use HH:MM'),
  body('quietHours.end')
    .optional()
    .matches(/^([01]\d|2[0-3]):[0-5]\d$/)
    .withMessage('quietHours.end must use HH:MM'),
  body('quietHours.timezone')
    .optional()
    .trim()
    .isLength({ min: 3, max: 80 })
    .withMessage('quietHours.timezone is invalid')
    .custom((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value }).format();
        return true;
      } catch (_err) {
        throw new Error('quietHours.timezone must be a valid IANA timezone');
      }
    })
];

const pushSubscriptionSchema = [
  body('subscription').isObject().withMessage('subscription is required'),
  body('subscription.endpoint')
    .isURL({ protocols: ['https'], require_protocol: true })
    .withMessage('Invalid push endpoint'),
  body('subscription.keys.p256dh').isString().isLength({ min: 16 }).withMessage('Invalid push key'),
  body('subscription.keys.auth').isString().isLength({ min: 8 }).withMessage('Invalid push authentication secret')
];

module.exports = {
  listNotificationsSchema,
  markReadSchema,
  notificationPreferencesSchema,
  pushSubscriptionSchema
};
