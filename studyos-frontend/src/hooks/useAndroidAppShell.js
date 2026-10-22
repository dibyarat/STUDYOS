import { useEffect, useState } from 'react';
import { isAndroidApp, androidBridge } from '../lib/androidBridge.js';

/**
 * React hook to detect and adapt StudyOS UI when embedded in the Native Android Shell.
 * - Adds 'in-android-shell' to <body> to trigger CSS header/footer hiding
 * - Binds native search queries and native bottom nav tab clicks
 * - Accurately coordinates Pull-to-Refresh so scrolling back up never triggers accidental refresh
 */
export function useAndroidAppShell(onNavigateTab, onSearchQuery) {
  const [isApp, setIsApp] = useState(false);

  useEffect(() => {
    const runningInShell = isAndroidApp();
    setIsApp(runningInShell);

    if (runningInShell) {
      document.body.classList.add('in-android-shell');
    }

    // Register Native Search Listener
    const cleanupSearch = androidBridge.onNativeSearch((query) => {
      if (onSearchQuery) {
        onSearchQuery(query);
      }
    });

    // Register Native Tab Switch Listener
    const cleanupTab = androidBridge.onNativeTabChanged((tabId) => {
      if (onNavigateTab) {
        onNavigateTab(tabId);
      }
    });

    // Coordinate pull-to-refresh: only enable when scrolled to the absolute top
    let lastState = true;
    const checkScrollState = () => {
      if (!runningInShell) return;
      const winY = window.scrollY || window.pageYOffset || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
      if (winY > 4) {
        if (lastState) {
          lastState = false;
          androidBridge.setPullToRefreshEnabled(false);
        }
        return;
      }
      const mainEl = document.querySelector('main') || document.querySelector('.main-content');
      if (mainEl && mainEl.scrollTop > 4) {
        if (lastState) {
          lastState = false;
          androidBridge.setPullToRefreshEnabled(false);
        }
        return;
      }
      if (!lastState) {
        lastState = true;
        androidBridge.setPullToRefreshEnabled(true);
      }
    };

    window.addEventListener('scroll', checkScrollState, { capture: true, passive: true });
    window.addEventListener('touchstart', checkScrollState, { passive: true });
    window.addEventListener('touchmove', checkScrollState, { passive: true });
    window.addEventListener('touchend', checkScrollState, { passive: true });

    return () => {
      cleanupSearch();
      cleanupTab();
      window.removeEventListener('scroll', checkScrollState, true);
      window.removeEventListener('touchstart', checkScrollState);
      window.removeEventListener('touchmove', checkScrollState);
      window.removeEventListener('touchend', checkScrollState);
    };
  }, [onNavigateTab, onSearchQuery]);

  return { isApp, bridge: androidBridge };
}
