const { UAParser } = require('ua-parser-js');

function maskIp(ip) {
  if (!ip) return null;
  const first = String(ip).split(',')[0].trim();
  const v4 = first.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.*`;
  if (first.includes(':')) return `${first.split(':').slice(0, 4).join(':')}:...`;
  return first;
}

function parseDevice(userAgent = '', ip = null) {
  const parser = new UAParser(userAgent);
  const result = parser.getResult();
  const browser = result.browser.name || '';
  const os = result.os.name || '';
  const device = result.device || {};
  const parts = [browser, os].filter(Boolean);

  let deviceType = 'unknown';
  if (device.type === 'mobile') deviceType = 'mobile';
  else if (device.type === 'tablet') deviceType = 'tablet';
  else if (browser || os) deviceType = 'desktop';

  return {
    deviceName: parts.length ? parts.join(' on ') : 'Unknown device',
    deviceType,
    ipAddress: maskIp(ip)
  };
}

module.exports = { maskIp, parseDevice };
