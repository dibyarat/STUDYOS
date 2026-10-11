import { app } from './firebase';

let analyticsPromise = null;

async function getAnalyticsInstance() {
  if (typeof window === 'undefined') return null;
  if (!app) return null;

  if (!analyticsPromise) {
    analyticsPromise = (async () => {
      try {
        const { getAnalytics, isSupported } = await import('firebase/analytics');
        const supported = await isSupported();
        if (supported) {
          return getAnalytics(app);
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('[Analytics] Initialization skipped:', err?.message || err);
        }
      }
      return null;
    })();
  }

  return analyticsPromise;
}

const REDACTED_KEYS = new Set([
  'token',
  'access_token',
  'password',
  'email',
  'rollNumber',
  'phone',
  'residency',
  'secret',
  'credential',
]);

function sanitizeParams(params = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(params)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      clean[key] = value;
    }
  }
  return clean;
}

export async function trackPageView(pageName) {
  try {
    const analytics = await getAnalyticsInstance();
    if (!analytics) return;
    const { logEvent } = await import('firebase/analytics');
    logEvent(analytics, 'page_view', {
      page_title: pageName,
      page_location: window.location.href,
      page_path: window.location.pathname,
    });
  } catch {
    // silently ignore analytics errors
  }
}

export async function trackEvent(eventName, params = {}) {
  try {
    const analytics = await getAnalyticsInstance();
    if (!analytics) return;
    const { logEvent } = await import('firebase/analytics');
    logEvent(analytics, eventName, sanitizeParams(params));
  } catch {
    // silently ignore analytics errors
  }
}

