const { liveMongoIdParam } = require('./common');

const bookingDocumentSchema = [liveMongoIdParam('bookingId')];

module.exports = { bookingDocumentSchema };
