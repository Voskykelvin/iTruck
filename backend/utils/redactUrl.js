function redactUrlSecrets(value = '') {
  return String(value).replace(/([?&](?:token|secret)=)[^&#\s]*/gi, '$1[redacted]');
}

module.exports = { redactUrlSecrets };
