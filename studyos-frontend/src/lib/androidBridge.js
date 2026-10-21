/**
 * AndroidBridge Web Utility (StudyOS)
 * Facilitates bi-directional communication with the Native Android Shell.
 * Completely safe for standard desktop/mobile browsers (no-ops gracefully).
 */

export const isAndroidApp = () => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return ua.includes('AndroidShell') || Boolean(window.AndroidBridge || window.Android);
};

export const getBridge = () => {
  if (typeof window === 'undefined') return null;
  return window.AndroidBridge || window.Android || null;
};

export const androidBridge = {
  isApp: isAndroidApp,

  updateBadge(count) {
    const bridge = getBridge();
    if (bridge?.updateBadge) {
      bridge.updateBadge(Math.max(0, Math.floor(count || 0)));
    }
  },

  updateTabBadge(tabId, count) {
    const bridge = getBridge();
    if (bridge?.updateTabBadge) {
      bridge.updateTabBadge(tabId, Math.max(0, Math.floor(count || 0)));
    }
  },

  openShare(title, url = window.location.href) {
    const bridge = getBridge();
    if (bridge?.openNativeShare) {
      bridge.openNativeShare(title || 'StudyOS', url);
    } else if (navigator.share) {
      navigator.share({ title, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).then(() => {
        alert('Link copied to clipboard!');
      }).catch(() => {});
    }
  },

  showToast(message) {
    const bridge = getBridge();
    if (bridge?.showToast) {
      bridge.showToast(message);
    }
  },

  triggerHaptic() {
    const bridge = getBridge();
    if (bridge?.triggerHapticFeedback) {
      bridge.triggerHapticFeedback();
    } else if ('vibrate' in navigator) {
      try {
        navigator.vibrate(15);
      } catch (_) {}
    }
  },

  getAppVersion() {
    const bridge = getBridge();
    return bridge?.getAppVersion ? bridge.getAppVersion() : null;
  },

  onNativeSearch(callback) {
    window.__onNativeSearch = callback;
    return () => {
      if (window.__onNativeSearch === callback) {
        delete window.__onNativeSearch;
      }
    };
  },

  onNativeTabChanged(callback) {
    window.__onNativeTabChanged = callback;
    return () => {
      if (window.__onNativeTabChanged === callback) {
        delete window.__onNativeTabChanged;
      }
    };
  }
};

