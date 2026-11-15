/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const ONLINE_NET_STATS_STORAGE_KEY = 'bantank_show_online_net_stats';
export const ONLINE_NET_STATS_PREF_EVENT = 'bantank-net-stats-pref-changed';

export function getShowOnlineNetStatsPreference(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return true;
  }
  try {
    const raw = window.localStorage.getItem(ONLINE_NET_STATS_STORAGE_KEY);
    if (raw === null) return true;
    return raw !== 'false';
  } catch {
    return true;
  }
}

export function setShowOnlineNetStatsPreference(enabled: boolean): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(ONLINE_NET_STATS_STORAGE_KEY, enabled ? 'true' : 'false');
    } catch {
      // Ignore storage quota / privacy mode errors
    }
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(
        new CustomEvent(ONLINE_NET_STATS_PREF_EVENT, { detail: { enabled } })
      );
    } catch {
      // Ignore CustomEvent issues in restricted runtimes
    }
  }
}
