const TRACKING_ROUTES = Object.freeze({
  "/plan-mejora": "tracking",
  "/plan-mejora/progreso": "progress",
  "/plan-mejora/progreso/historial": "progress-history",
  "/plan-mejora/hito": "progress",
});

export const trackingRoutePaths = Object.freeze(Object.keys(TRACKING_ROUTES));

export function resolveTrackingRoute(pathname = "/") {
  const path = String(pathname || "/").replace(/\/$/, "").toLowerCase() || "/";
  return TRACKING_ROUTES[path] || null;
}

export function trackingPathForPage(page) {
  return Object.entries(TRACKING_ROUTES).find(([, routePage]) => routePage === page)?.[0] || null;
}
