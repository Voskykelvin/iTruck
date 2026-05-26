const jwt = require('jsonwebtoken');
const { demoUsers, safeUser } = require('../data/demo-users');

test('safeUser removes password fields from demo users', () => {
  const output = safeUser(demoUsers[0]);
  expect(output.email).toBe('admin@itruck.africa');
  expect(output.password).toBeUndefined();
});

test('demo user token payload can carry id and role', () => {
  const token = jwt.sign({ id: demoUsers[0]._id, role: demoUsers[0].role }, process.env.JWT_SECRET);
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  expect(decoded.role).toBe('admin');
});
