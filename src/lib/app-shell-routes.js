export const appShellRoutes = {
  '/projects/': { partial: '/partials/projects', cache: false },
  '/adminproject/': { partial: '/partials/adminproject', cache: false },
  '/dashboard/': '/partials/dashboard',
  '/proposals/': '/partials/proposals',
  '/wip/': '/partials/wip',
  '/sprintview/': '/partials/sprintview',
  '/cleanview/': '/partials/cleanview',
  '/development/': '/partials/development',
  '/global-config/': '/partials/global-config',
  '/board/': '/partials/board'
};

const normalizeRoute = (value) => {
  const cleaned = (value || '/').toString().split('?')[0].split('#')[0];
  const trimmed = cleaned.replace(/\/$/, '');
  return trimmed || '/';
};

const resolveRoutePartial = (entry) => {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return '';
  return entry.partial || entry.partialUrl || '';
};

export const resolveAppShellPartial = (pathname) => {
  const normalizedPath = normalizeRoute(pathname);
  const match = Object.entries(appShellRoutes).find(([route]) => normalizeRoute(route) === normalizedPath);
  if (!match) return '';
  return resolveRoutePartial(match[1]);
};
