export const RECENT_MENU_KEY = 'ccb_recent_menus'

export function recordRecentMenu(path: string, label: string): void {
  try {
    const existingRaw = localStorage.getItem(RECENT_MENU_KEY)
    const existing = existingRaw ? (JSON.parse(existingRaw) as Array<{ path: string; label: string }>) : []
    const filtered = existing.filter((item) => item.path !== path)
    const updated = [{ path, label }, ...filtered].slice(0, 5)
    localStorage.setItem(RECENT_MENU_KEY, JSON.stringify(updated))
  } catch {
    // no-op for storage parsing issues
  }
}
