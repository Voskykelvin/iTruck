const jwt = require('jsonwebtoken');
const { bookingRoomQuery, socketUserFromToken } = require('../socket');
const jwtSecret = process.env.JWT_SECRET || 'dev-secret';

test('socket authentication rejects missing invalid and malformed tokens', () => {
  expect(() => socketUserFromToken()).toThrow('Authentication required');
  expect(() => socketUserFromToken('invalid-token')).toThrow();
  expect(() => socketUserFromToken(jwt.sign({ id: 'user-1', role: 'unknown' }, jwtSecret))).toThrow(
    'Invalid token claims'
  );
  expect(socketUserFromToken(jwt.sign({ id: 'client-1', role: 'client' }, jwtSecret))).toEqual({
    _id: 'client-1',
    role: 'client'
  });
});

test('socket booking rooms are scoped to the authenticated booking party', () => {
  expect(bookingRoomQuery({ _id: 'client-1', role: 'client' }, 'booking-1')).toEqual({
    _id: 'booking-1',
    client: 'client-1'
  });
  expect(bookingRoomQuery({ _id: 'owner-1', role: 'owner' }, 'booking-1')).toEqual({
    _id: 'booking-1',
    $or: [{ owner: 'owner-1' }, { 'bids.owner': 'owner-1' }]
  });
  expect(bookingRoomQuery({ _id: 'admin-1', role: 'admin' }, 'booking-1')).toEqual({
    _id: 'booking-1'
  });
  expect(bookingRoomQuery({ _id: 'user-1', role: 'unknown' }, 'booking-1')).toBeNull();
});
