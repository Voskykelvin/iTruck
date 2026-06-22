import { describe, expect, it } from 'vitest';
import { dashboardPathForRole, roleForUser, roleName, routeAllowedForUser } from './roles.js';

describe('role routing policy', () => {
  it('keeps drivers inside assigned-job surfaces', () => {
    const driver = { role: 'driver' };
    expect(roleForUser(driver)).toBe('driver');
    expect(dashboardPathForRole('driver')).toBe('/app/tracking');
    expect(roleName('driver')).toBe('Driver');
    expect(routeAllowedForUser('/app/tracking?shipment=1', driver)).toBe(true);
    expect(routeAllowedForUser('/app/documents', driver)).toBe(true);
    expect(routeAllowedForUser('/app/owner', driver)).toBe(false);
    expect(routeAllowedForUser('/app/payments', driver)).toBe(false);
  });

  it('preserves shipper, owner, and admin boundaries', () => {
    expect(routeAllowedForUser('/app/book', { role: 'client' })).toBe(true);
    expect(routeAllowedForUser('/app/vehicles', { role: 'client' })).toBe(false);
    expect(routeAllowedForUser('/app/vehicles', { role: 'owner' })).toBe(true);
    expect(routeAllowedForUser('/app/admin', { role: 'admin' })).toBe(true);
  });
});
