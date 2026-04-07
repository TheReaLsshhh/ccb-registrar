import type { StaffChatPresence } from './api'

/** Keep in sync with backend `registrar/staff_presence.py`. */
/** No recorded activity for this long → no longer "online" (then "away", not time-based offline). */
export const STAFF_CHAT_ONLINE_SECONDS = 30

/** Offline only when server clears activity (logout / tab-close signal); long idle stays "away". */
export function presenceFromLastActivityIso(iso: string | null | undefined): StaffChatPresence {
  if (iso == null || iso === '') return 'offline'
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 'offline'
  const deltaSec = (Date.now() - t) / 1000
  if (deltaSec < STAFF_CHAT_ONLINE_SECONDS) return 'online'
  return 'away'
}
