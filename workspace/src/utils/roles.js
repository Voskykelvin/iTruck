export function roleForUser(user) {
  return ['owner', 'driver', 'admin'].includes(user?.role) ? user.role : 'client';
}

export function dashboardPathForRole(role) {
  if (role === 'owner') return '/app/owner';
  if (role === 'admin') return '/app/admin';
  if (role === 'driver') return '/app/shipments';
  return '/app/shipper';
}

export function roleName(role) {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  if (role === 'driver') return 'Driver';
  return 'Shipper';
}
