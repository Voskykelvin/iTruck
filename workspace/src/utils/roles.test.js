import { describe, expect, it } from 'vitest';
import { dashboardPathForRole, roleForUser, roleName } from './roles';

describe('role utilities', () => {
  it.each([
    [{ role: 'owner' }, 'owner'],
    [{ role: 'driver' }, 'driver'],
    [{ role: 'admin' }, 'admin'],
    [{ role: 'client' }, 'client'],
    [null, 'client']
  ])('normalizes user roles', (user, expected) => {
    expect(roleForUser(user)).toBe(expected);
  });

  it.each([
    ['owner', '/app/owner'],
    ['driver', '/app/shipments'],
    ['admin', '/app/admin'],
    ['client', '/app/shipper']
  ])('maps %s to its dashboard', (role, expected) => {
    expect(dashboardPathForRole(role)).toBe(expected);
  });

  it('uses readable role names', () => {
    expect(roleName('owner')).toBe('Owner');
    expect(roleName('client')).toBe('Shipper');
  });
});
