/* Route modules live behind one shared registry so App can lazy-load them and
   the navigation can warm the exact same chunks on pointer/keyboard intent.
   `import()` is cached by the browser, so preloading never evaluates a page
   twice and a failed preload can still be retried by React.lazy later. */
const ROUTE_IMPORTERS = {
  '/about': () => import('../Pages/About/About'),
  '/team': () => import('../Pages/Team/Team'),
  '/events': () => import('../Pages/Events/Events'),
  '/projects': () => import('../Pages/Projects/Projects'),
  '/race': () => import('../Pages/Race/Race'),
  '*': () => import('../Pages/NotFound/NotFound'),
};

export const loadRoute = (path) => {
  const importer = ROUTE_IMPORTERS[path];
  if (!importer) {
    return Promise.reject(new Error(`No route module registered for ${path}`));
  }
  return importer();
};

export const prefetchRouteModule = (path) => {
  const importer = ROUTE_IMPORTERS[path];
  if (importer) importer().catch(() => {});
};

