import { useEffect, useState } from 'react';
import { isAndroidApp, androidBridge } from '../lib/androidBridge.js';

/**
 * React hook to detect and adapt StudyOS UI when embedded in the Native Android Shell.
 * - Adds 'in-android-shell' to <body> to trigger CSS header/footer hiding
 * - Binds native search queries and native bottom nav tab clicks
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

    return () => {
      cleanupSearch();
      cleanupTab();
    };
  }, [onNavigateTab, onSearchQuery]);

  return { isApp, bridge: androidBridge };
}

