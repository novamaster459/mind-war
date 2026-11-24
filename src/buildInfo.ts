// ============================================================================
// Build identification. Values are injected at build time by Vite (see
// vite.config.ts `define`). Shown in the UI so you can verify at a glance
// whether the browser is actually running the build you just deployed.
// ============================================================================

/** Compact unique id for this build, e.g. "20261124112530". */
export const BUILD_ID: string = __BUILD_ID__;

/** Human-readable build date/time. */
export const BUILD_DATE: string = __BUILD_DATE__;

/** Short label shown in the UI, e.g. "BUILD 20261124-1125". */
export const BUILD_LABEL = `BUILD ${BUILD_ID.slice(0, 8)}-${BUILD_ID.slice(8, 12)}`;

/**
 * Unregister every service worker, drop all caches, then hard-reload.
 * Used when a stale cached build is stuck in the browser.
 */
export async function forceRefresh(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (err) {
    console.warn('[build] forceRefresh cleanup failed', err);
  }
  // Reload without the cache so the new shell is fetched for certain.
  window.location.reload();
}