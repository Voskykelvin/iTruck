const { mongoIdParam, pagination } = require('./common');

const listNotificationsSchema = [...pagination];
const markReadSchema = [mongoIdParam('id')];

module.exports = { listNotificationsSchema, markReadSchema };
