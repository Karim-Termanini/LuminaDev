export const DASHBOARD_SELECTED_PROFILE_KEY = 'dashboard-selected-profile'
export const ACTIVE_PROFILE_CHANGED_EVENT = 'dh:active-profile-changed'

export function readDashboardSelectedProfile(): string | null {
  try {
    const saved = localStorage.getItem(DASHBOARD_SELECTED_PROFILE_KEY)
    return saved && saved.trim() ? saved.trim() : null
  } catch {
    return null
  }
}

export function syncDashboardSelectedProfile(name: string | null): void {
  try {
    if (name) localStorage.setItem(DASHBOARD_SELECTED_PROFILE_KEY, name)
    else localStorage.removeItem(DASHBOARD_SELECTED_PROFILE_KEY)
  } catch {
    /* ignore */
  }
}

export function broadcastActiveProfileChange(name: string): void {
  syncDashboardSelectedProfile(name)
  window.dispatchEvent(new CustomEvent(ACTIVE_PROFILE_CHANGED_EVENT, { detail: name }))
}
