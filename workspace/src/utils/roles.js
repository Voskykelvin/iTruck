const commonRoutes = [
  '/app/profile',
  '/app/onboarding',
  '/app/documents',
  '/app/payments',
  '/app/messages',
  '/app/tracking'
];
const neutralRoutes = ['/app/marketplace'];
const roleRoutes = {
  client: ['/app/shipper', '/app/book', '/app/bids', ...commonRoutes],
  owner: ['/app/owner', '/app/vehicles', '/app/bids', ...commonRoutes],
  driver: ['/app/tracking', '/app/documents', '/app/messages', '/app/profile'],
  admin: ['/app/admin', '/app/profile']
};

export function roleForUser(user) {
  return ['owner', 'driver', 'admin'].includes(user?.role) ? user.role : 'client';
}

export function dashboardPathForRole(role) {
  if (role === 'owner') return '/app/owner';
  if (role === 'admin') return '/app/admin';
  if (role === 'driver') return '/app/tracking';
  return '/app/shipper';
}

export function routeAllowedForUser(route, user) {
  const role = roleForUser(user);
  const path = route.split('?')[0];
  if (path === '/app' || path === '/app/') return true;
  if (role === 'admin') {
    return roleRoutes.admin.some((allowed) => path === allowed || path.startsWith(`${allowed}/`));
  }
  if (neutralRoutes.some((allowed) => path === allowed || path.startsWith(`${allowed}/`))) return true;
  return (roleRoutes[role] || roleRoutes.client).some((allowed) => path === allowed || path.startsWith(`${allowed}/`));
}

export function roleName(role) {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  if (role === 'driver') return 'Driver';
  return 'Shipper';
}
