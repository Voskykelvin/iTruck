const { maskIp, parseDevice } = require('../utils/deviceParser');

test('parseDevice creates a safe browser device descriptor', () => {
  const descriptor = parseDevice(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
    '192.168.1.44'
  );

  expect(descriptor.deviceType).toBe('desktop');
  expect(descriptor.deviceName).toContain('Chrome');
  expect(descriptor.ipAddress).toBe('192.168.1.*');
});

test('maskIp redacts IPv4 and shortens IPv6 values', () => {
  expect(maskIp('10.0.0.99')).toBe('10.0.0.*');
  expect(maskIp('2001:db8:85a3:0000:0000:8a2e:0370:7334')).toBe('2001:db8:85a3:0000:...');
});
