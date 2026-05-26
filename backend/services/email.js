const logger = require('../config/logger');

async function sendMail({ to, subject }) {
  logger.info({ to, subject }, 'Email queued');
  return { accepted: [to] };
}

module.exports = {
  sendMail,
  templates: {
    welcome: user => 'Welcome ' + user.firstName
  }
};
