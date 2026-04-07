import { ComponentType, FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import {
  api,
  fetchMe,
  getStaffChatWebSocketUrl,
  isAuthenticated,
  login,
  logout,
  logoutAllDevices,
  markStaffChatOfflinePresence,
  onAuthLogout,
  postStaffActivityTouch,
  requestStaffChatUnreadRefresh,
  type StaffChatMessage,
} from '../api'
import { recordRecentMenu } from '../recentMenus'
import {
  AdminIcon,
  ContinuingIcon,
  DashboardIcon,
  EnrollmentIcon,
  ProspectusIcon,
  StaffChatIcon,
  TORIcon,
} from './Icons'

const MOBILE_BREAKPOINT = 1024
const SIDEBAR_STATE_KEY = 'ccb_sidebar_collapsed'
const DEFAULT_PROFILE_AVATAR = '/man-woman-icon-male-female-avatar-profile-vector-illustration-gender-symbols-pink-blue-gentleman-lady-toilet-signs_735449-462.png'

const navItems: { path: string; label: string; icon: ComponentType; statusTag?: string }[] = [
  { path: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
  { path: '/admin', label: 'Admin', icon: AdminIcon },
  { path: '/prospectus', label: 'Prospectus', icon: ProspectusIcon },
  { path: '/enrollment', label: 'Enrollment', icon: EnrollmentIcon },
  { path: '/continuing', label: 'Continuing', icon: ContinuingIcon },
  { path: '/transcript', label: 'Transcript', icon: TORIcon, statusTag: 'Working' },
  { path: '/chat', label: 'Staff Chat', icon: StaffChatIcon },
]

function pathnameIsStaffChat(pathname: string): boolean {
  return pathname === '/chat' || pathname === '/chat/'
}

function staffChatUnreadFromMe(me: { staff_chat_unread_total?: unknown }): number {
  const n = Number(me.staff_chat_unread_total)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(99999, Math.floor(n))
}

/** Mirror backend staff-chat access: staff or superuser (same as IsRegistrarOrStaff). */
function staffChatWsEligibleFromMe(me: { is_staff?: boolean; is_superuser?: boolean }): boolean {
  return !!(me.is_staff || me.is_superuser)
}

function Icon({ name }: { name: string }) {
  if (name === 'menu') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }
  if (name === 'chevronLeft') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (name === 'chevronRight') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 18l6-6-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (name === 'logout') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 8l-4 4 4 4M5 12h10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 5h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (name === 'settings') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 9.25a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5Zm8 2.75-1.78-.49a6.58 6.58 0 0 0-.53-1.29l.95-1.58-1.88-1.88-1.58.95a6.58 6.58 0 0 0-1.29-.53L12 4h-2l-.49 1.78a6.58 6.58 0 0 0-1.29.53l-1.58-.95-1.88 1.88.95 1.58a6.58 6.58 0 0 0-.53 1.29L4 12v2l1.78.49c.12.45.3.89.53 1.29l-.95 1.58 1.88 1.88 1.58-.95c.4.23.84.41 1.29.53L10 20h2l.49-1.78c.45-.12.89-.3 1.29-.53l1.58.95 1.88-1.88-.95-1.58c.23-.4.41-.84.53-1.29L20 14v-2Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (name === 'login') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 16l4-4-4-4M19 12H9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  return null
}

function staffChatToastSummary(delta: number): string {
  return delta === 1
    ? 'Someone sent you a message in Staff Chat.'
    : `You have ${delta} new staff chat messages.`
}

/** When `attachment_kind` is missing on the wire, infer from name or URL (same rules as backend). */
function inferStaffChatAttachmentKind(
  msg: Pick<StaffChatMessage, 'attachment_kind' | 'attachment_url' | 'attachment_name'>,
): 'image' | 'file' | null {
  if (msg.attachment_kind === 'image' || msg.attachment_kind === 'file') {
    return msg.attachment_kind
  }
  const path = `${msg.attachment_name || ''} ${(msg.attachment_url || '').split(/[?#]/)[0]}`.toLowerCase()
  if (path && /\.(png|jpg|jpeg|gif|webp|bmp)(?:$|[?#])/.test(path.replace(/\\/g, '/'))) {
    return 'image'
  }
  if ((msg.attachment_url && msg.attachment_url.length > 0) || (msg.attachment_name && msg.attachment_name.length > 0)) {
    return 'file'
  }
  return null
}

function truncateBannerText(s: string, max: number): string {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function staffChatSenderLabel(msg: Pick<StaffChatMessage, 'sender_first_name' | 'sender_last_name' | 'sender_username'>): string {
  const fullName = `${msg.sender_first_name || ''} ${msg.sender_last_name || ''}`.trim()
  if (fullName) return fullName
  const uname = (msg.sender_username || '').trim()
  return uname || 'A colleague'
}

/** Build headline + detail for the top banner (incoming messages only). */
function staffChatIncomingBannerCopy(msg: StaffChatMessage): { headline: string; detail: string } {
  const who = staffChatSenderLabel(msg)
  const body = (msg.body || '').trim()
  const bodyShort = body ? truncateBannerText(body, 140) : ''
  const kind = inferStaffChatAttachmentKind(msg)
  const fileName = (msg.attachment_name || '').trim()

  if (kind === 'image') {
    if (body) {
      return {
        headline: `${who} sent a photo with a message`,
        detail: `Photo · ${bodyShort}`,
      }
    }
    return {
      headline: `${who} sent a photo`,
      detail: 'Open Staff Chat to view the image.',
    }
  }
  if (kind === 'file') {
    if (body) {
      const fileBit = fileName ? `File "${truncateBannerText(fileName, 60)}"` : 'A file'
      return {
        headline: `${who} sent a file with a message`,
        detail: `${fileBit} · ${bodyShort}`,
      }
    }
    return {
      headline: `${who} sent a file`,
      detail: fileName
        ? `${truncateBannerText(fileName, 120)} — open Staff Chat to download.`
        : 'Open Staff Chat to view the attachment.',
    }
  }
  if (body) {
    return {
      headline: `${who} sent you a message`,
      detail: bodyShort,
    }
  }
  return {
    headline: `${who} sent you a message`,
    detail: 'Open Staff Chat to read it.',
  }
}

function parseStaffChatMessageFromWs(raw: unknown): StaffChatMessage | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.sender_id !== 'number') return null
  const reactions = Array.isArray(o.reactions) ? o.reactions : []
  const ak = o.attachment_kind
  let attachment_kind: 'image' | 'file' | null = ak === 'image' || ak === 'file' ? ak : null
  const attachment_url = o.attachment_url === null || typeof o.attachment_url === 'string' ? o.attachment_url : null
  const attachment_name = o.attachment_name === null || typeof o.attachment_name === 'string' ? o.attachment_name : null
  const draft: StaffChatMessage = {
    id: typeof o.id === 'number' ? o.id : Number(o.id) || 0,
    conversation: typeof o.conversation === 'number' ? o.conversation : Number(o.conversation) || 0,
    sender_id: o.sender_id,
    sender_username: typeof o.sender_username === 'string' ? o.sender_username : undefined,
    sender_first_name: typeof o.sender_first_name === 'string' ? o.sender_first_name : undefined,
    sender_last_name: typeof o.sender_last_name === 'string' ? o.sender_last_name : undefined,
    body: typeof o.body === 'string' ? o.body : '',
    created_at: typeof o.created_at === 'string' ? o.created_at : '',
    edited_at: o.edited_at === null || typeof o.edited_at === 'string' ? o.edited_at : null,
    attachment_url,
    attachment_kind,
    attachment_name,
    reactions: reactions as StaffChatMessage['reactions'],
  }
  if (!attachment_kind) {
    const inferred = inferStaffChatAttachmentKind(draft)
    if (inferred) {
      draft.attachment_kind = inferred
    }
  }
  return draft
}

async function tryShowStaffChatDesktopNotification(delta: number, customBody?: string): Promise<void> {
  if (typeof Notification === 'undefined') return
  const body = (customBody && customBody.trim()) || staffChatToastSummary(delta)
  if (Notification.permission === 'granted') {
    new Notification('Staff Chat', { body, tag: 'staff-chat-unread', icon: '/ccb_registrar_logo.png' })
    return
  }
  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission()
    if (perm === 'granted') {
      new Notification('Staff Chat', { body, tag: 'staff-chat-unread', icon: '/ccb_registrar_logo.png' })
    }
  }
}

type StaffChatToastState =
  | { mode: 'generic'; delta: number }
  | { mode: 'incoming'; conversationId: number; headline: string; detail: string }

function staffChatReactionBannerCopy(actorUsername: string | undefined, emoji: string): { headline: string; detail: string } {
  const uname = (actorUsername || '').trim()
  const who = uname ? `@${uname}` : 'A colleague'
  return {
    headline: `${who} reacted ${emoji} to your message`,
    detail: 'Open Staff Chat to view the reaction.',
  }
}

export function AppShell() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authed, setAuthed] = useState(isAuthenticated())
  const [currentUsername, setCurrentUsername] = useState(() => localStorage.getItem('auth_username')?.trim() ?? '')
  const [welcomeUsername, setWelcomeUsername] = useState('')
  const [showWelcomeModal, setShowWelcomeModal] = useState(false)
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false)
  const [profileImage, setProfileImage] = useState<string | null>(null)
  const [staffChatUnreadTotal, setStaffChatUnreadTotal] = useState(0)
  const [staffChatWsEligible, setStaffChatWsEligible] = useState(false)
  const [meId, setMeId] = useState<number | null>(null)
  const [staffChatToast, setStaffChatToast] = useState<StaffChatToastState | null>(null)
  const [isAvatarPreviewOpen, setIsAvatarPreviewOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => localStorage.getItem(SIDEBAR_STATE_KEY) === 'true')
  const profileMenuRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const sessionPingRef = useRef<number | null>(null)
  const staffChatUnreadPrevRef = useRef<number | null>(null)
  const staffChatToastTimerRef = useRef<number | null>(null)
  const staffChatListenWsRef = useRef<WebSocket | null>(null)
  const staffChatWsEligibleRef = useRef(false)
  /** Latest user id for staff-chat WS handler (avoids reconnecting when /me/ loads and fixes stale closures). */
  const meIdRef = useRef<number | null>(null)
  const locationPathnameRef = useRef(location.pathname)
  /** When the WS path already showed a banner + desktop alert, skip duplicate from unread counter bump. */
  const staffChatSkipUnreadToastRef = useRef(false)
  /** Throttle POST /me/staff-activity/ from pointer/key (route changes bypass throttle). */
  const staffPresenceThrottleRef = useRef(0)

  useEffect(() => {
    locationPathnameRef.current = location.pathname
  }, [location.pathname])

  useEffect(() => {
    staffChatWsEligibleRef.current = staffChatWsEligible
  }, [staffChatWsEligible])

  useEffect(() => {
    meIdRef.current = meId
  }, [meId])

  const authedRef = useRef(authed)
  useEffect(() => {
    authedRef.current = authed
  }, [authed])

  /** Real UI activity only — GET /me/ polling must not refresh presence (or users never go Away). */
  useEffect(() => {
    if (!authed) return
    staffPresenceThrottleRef.current = Date.now()
    void postStaffActivityTouch().catch(() => {})
  }, [location.pathname, authed])

  useEffect(() => {
    if (!authed) return
    const maybeTouchPresence = () => {
      const now = Date.now()
      if (now - staffPresenceThrottleRef.current < 12_000) return
      staffPresenceThrottleRef.current = now
      void postStaffActivityTouch().catch(() => {})
    }
    const onPointerDown = () => maybeTouchPresence()
    const onKeyDown = () => maybeTouchPresence()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') maybeTouchPresence()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [authed])

  const refreshStaffChatUnreadFromServer = useCallback(() => {
    return fetchMe()
      .then((me) => {
        setStaffChatUnreadTotal(staffChatUnreadFromMe(me))
        setStaffChatWsEligible(staffChatWsEligibleFromMe(me))
        setMeId(typeof me.id === 'number' ? me.id : null)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const onPageHide = (e: PageTransitionEvent) => {
      if (e.persisted) return
      if (!staffChatWsEligibleRef.current) return
      const token = localStorage.getItem('access_token')
      if (!token) return
      const base = api.defaults.baseURL ?? ''
      void fetch(`${base}/me/staff-chat-offline/`, {
        method: 'POST',
        keepalive: true,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      })
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [])

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT
      setIsMobile(mobile)
      if (!mobile) {
        setIsMobileMenuOpen(false)
      }
    }

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    return onAuthLogout(() => {
      setAuthed(false)
      setCurrentUsername('')
      setWelcomeUsername('')
      setShowWelcomeModal(false)
      setIsProfileMenuOpen(false)
      setUsername('')
      setPassword('')
      setIsMobileMenuOpen(false)
      setProfileImage(null)
      setStaffChatUnreadTotal(0)
      setStaffChatWsEligible(false)
      setMeId(null)
      setStaffChatToast(null)
      navigate('/', { replace: true })
    })
  }, [navigate])

  useEffect(() => {
    if (!authed) {
      setProfileImage(null)
      setStaffChatUnreadTotal(0)
      setStaffChatWsEligible(false)
      setMeId(null)
      return
    }

    let cancelled = false
    fetchMe()
      .then((me) => {
        if (cancelled) return
        setProfileImage(me.photo_url)
        setStaffChatUnreadTotal(staffChatUnreadFromMe(me))
        setStaffChatWsEligible(staffChatWsEligibleFromMe(me))
        setMeId(typeof me.id === 'number' ? me.id : null)
      })
      .catch(() => {
        if (cancelled) return
        setProfileImage(null)
        setStaffChatUnreadTotal(0)
        setStaffChatWsEligible(false)
        setMeId(null)
      })
    return () => {
      cancelled = true
    }
  }, [authed, currentUsername])

  useEffect(() => {
    if (!authed) {
      if (sessionPingRef.current) {
        window.clearInterval(sessionPingRef.current)
        sessionPingRef.current = null
      }
      return
    }

    // Poll the backend so "logout-all" from another device is detected quickly.
    // Also refreshes profile (including avatar) when changed on another device.
    // Any 401 will be handled by the Axios interceptor and broadcast via onAuthLogout.
    sessionPingRef.current = window.setInterval(() => {
      fetchMe()
        .then((me) => {
          setProfileImage(me.photo_url ?? null)
          setCurrentUsername(me.username)
          setStaffChatUnreadTotal(staffChatUnreadFromMe(me))
          setStaffChatWsEligible(staffChatWsEligibleFromMe(me))
          setMeId(typeof me.id === 'number' ? me.id : null)
        })
        .catch(() => {
          // no-op; interceptor handles unauthorized
        })
    }, 4000)

    return () => {
      if (sessionPingRef.current) {
        window.clearInterval(sessionPingRef.current)
        sessionPingRef.current = null
      }
    }
  }, [authed])

  useEffect(() => {
    if (!authed) return
    let debounceId: number | null = null
    const onStaffChatUnreadRefresh = () => {
      if (debounceId != null) window.clearTimeout(debounceId)
      debounceId = window.setTimeout(() => {
        debounceId = null
        void refreshStaffChatUnreadFromServer()
      }, 200)
    }
    window.addEventListener('staff-chat-unread-refresh', onStaffChatUnreadRefresh)
    return () => {
      window.removeEventListener('staff-chat-unread-refresh', onStaffChatUnreadRefresh)
      if (debounceId != null) window.clearTimeout(debounceId)
    }
  }, [authed, refreshStaffChatUnreadFromServer])

  useEffect(() => {
    if (!authed) {
      staffChatUnreadPrevRef.current = null
      setStaffChatToast(null)
    }
  }, [authed])

  /** Staff-chat listener: connect on any authenticated session (do not wait for /me/ is_staff). Non-staff get 4003 and no reconnect. */
  useEffect(() => {
    let intentionalClose = false
    let reconnectTimer: number | null = null
    let reconnectAttempt = 0

    const clearReconnectTimer = () => {
      if (reconnectTimer != null) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    const connectListenWs = () => {
      if (!authedRef.current) return
      if (staffChatListenWsRef.current) return
      const token = localStorage.getItem('access_token')
      if (!token) return

      const url = getStaffChatWebSocketUrl(token)
      const ws = new WebSocket(url)
      staffChatListenWsRef.current = ws

      ws.onopen = () => {
        reconnectAttempt = 0
        void refreshStaffChatUnreadFromServer()
      }

      ws.onmessage = (event) => {
        try {
          const raw = typeof event.data === 'string' ? event.data : ''
          const data = JSON.parse(raw) as {
            type?: string
            message?: unknown
            conversation_id?: unknown
            actor_id?: unknown
            actor_username?: unknown
            target_sender_id?: unknown
            emoji?: unknown
          }
          if (typeof data?.type !== 'string' || !data.type.startsWith('staff_chat.')) {
            return
          }
          if (data.type === 'staff_chat.presence') {
            return
          }
          if (data.type === 'staff_chat.message') {
            const parsed = parseStaffChatMessageFromWs(data.message)
            const myId = meIdRef.current
            if (parsed && myId != null && parsed.sender_id === myId) {
              return
            }
            if (parsed && myId != null && parsed.sender_id !== myId && !pathnameIsStaffChat(locationPathnameRef.current)) {
              staffChatSkipUnreadToastRef.current = true
              const { headline, detail } = staffChatIncomingBannerCopy(parsed)
              setStaffChatToast({
                mode: 'incoming',
                conversationId: parsed.conversation > 0 ? parsed.conversation : 0,
                headline,
                detail,
              })
              const desk = `${headline}${detail ? ` — ${detail}` : ''}`
              void tryShowStaffChatDesktopNotification(1, desk.length > 200 ? `${desk.slice(0, 197)}…` : desk)
            }
          }
          if (data.type === 'staff_chat.reaction') {
            const myId = meIdRef.current
            const actorId = typeof data.actor_id === 'number' ? data.actor_id : null
            const targetSenderId = typeof data.target_sender_id === 'number' ? data.target_sender_id : null
            const conversationId = typeof data.conversation_id === 'number' ? data.conversation_id : 0
            const emoji = typeof data.emoji === 'string' ? data.emoji.trim() : ''
            const actorUsername = typeof data.actor_username === 'string' ? data.actor_username : undefined
            if (
              myId != null &&
              actorId != null &&
              targetSenderId === myId &&
              actorId !== myId &&
              emoji &&
              !pathnameIsStaffChat(locationPathnameRef.current)
            ) {
              const { headline, detail } = staffChatReactionBannerCopy(actorUsername, emoji)
              setStaffChatToast({
                mode: 'incoming',
                conversationId,
                headline,
                detail,
              })
              const desk = `${headline}${detail ? ` â€” ${detail}` : ''}`
              void tryShowStaffChatDesktopNotification(1, desk.length > 200 ? `${desk.slice(0, 197)}â€¦` : desk)
            }
          }
          void refreshStaffChatUnreadFromServer()
        } catch {
          /* ignore malformed payloads */
        }
      }

      ws.onclose = (ev) => {
        if (staffChatListenWsRef.current === ws) {
          staffChatListenWsRef.current = null
        }
        if (intentionalClose) return
        if (!authedRef.current) return
        if (ev.code === 4003) return
        if (!localStorage.getItem('access_token')) return
        clearReconnectTimer()
        reconnectAttempt += 1
        const delay = Math.min(30_000, 800 * Math.pow(1.6, reconnectAttempt - 1))
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null
          connectListenWs()
        }, delay)
      }
    }

    if (!authed) {
      intentionalClose = true
      clearReconnectTimer()
      if (staffChatListenWsRef.current) {
        try {
          staffChatListenWsRef.current.close()
        } catch {
          /* no-op */
        }
        staffChatListenWsRef.current = null
      }
      intentionalClose = false
      return () => {
        clearReconnectTimer()
      }
    }

    intentionalClose = false
    connectListenWs()

    return () => {
      intentionalClose = true
      clearReconnectTimer()
      if (staffChatListenWsRef.current) {
        try {
          staffChatListenWsRef.current.close()
        } catch {
          /* no-op */
        }
        staffChatListenWsRef.current = null
      }
    }
  }, [authed, refreshStaffChatUnreadFromServer])

  useEffect(() => {
    if (!authed) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshStaffChatUnreadFromServer()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [authed, refreshStaffChatUnreadFromServer])

  useEffect(() => {
    const prev = staffChatUnreadPrevRef.current
    const onStaffChatPage = pathnameIsStaffChat(location.pathname)

    if (prev === null) {
      staffChatUnreadPrevRef.current = staffChatUnreadTotal
      return
    }

    if (staffChatUnreadTotal > prev && !onStaffChatPage) {
      const delta = staffChatUnreadTotal - prev
      if (staffChatSkipUnreadToastRef.current) {
        staffChatSkipUnreadToastRef.current = false
      } else {
        setStaffChatToast({ mode: 'generic', delta })
        void tryShowStaffChatDesktopNotification(delta)
      }
    }

    staffChatUnreadPrevRef.current = staffChatUnreadTotal
  }, [staffChatUnreadTotal, location.pathname])

  useEffect(() => {
    if (!staffChatToast) {
      if (staffChatToastTimerRef.current != null) {
        window.clearTimeout(staffChatToastTimerRef.current)
        staffChatToastTimerRef.current = null
      }
      return
    }
    if (staffChatToastTimerRef.current != null) {
      window.clearTimeout(staffChatToastTimerRef.current)
    }
    staffChatToastTimerRef.current = window.setTimeout(() => {
      staffChatToastTimerRef.current = null
      setStaffChatToast(null)
    }, 12_000)
    return () => {
      if (staffChatToastTimerRef.current != null) {
        window.clearTimeout(staffChatToastTimerRef.current)
        staffChatToastTimerRef.current = null
      }
    }
  }, [staffChatToast])

  useEffect(() => {
    if (!staffChatToast) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setStaffChatToast(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [staffChatToast])

  useEffect(() => {
    const onPhotoUpdated = (e?: Event) => {
      const detail = (e as CustomEvent<{ photo_url: string | null }> | undefined)?.detail
      if (detail?.photo_url !== undefined) {
        setProfileImage(detail.photo_url)
        return
      }
      fetchMe().then((data) => setProfileImage(data.photo_url ?? null)).catch(() => {})
    }
    const onProfileUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ username: string; photo_url: string | null }>).detail
      if (detail?.username) {
        setCurrentUsername(detail.username)
        localStorage.setItem('auth_username', detail.username)
      }
      if (detail && 'photo_url' in detail) setProfileImage(detail.photo_url ?? null)
    }
    window.addEventListener('profile-photo-updated', onPhotoUpdated)
    window.addEventListener('profile-updated', onProfileUpdated)
    return () => {
      window.removeEventListener('profile-photo-updated', onPhotoUpdated)
      window.removeEventListener('profile-updated', onProfileUpdated)
    }
  }, [])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.sidebar-toggle')) {
        return
      }
      if (!profileMenuRef.current) return
      if (!profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false)
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProfileMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])
  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAuthError('')
    try {
      await login(username, password)
      const normalizedUsername = username.trim()
      setAuthed(true)
      setCurrentUsername(normalizedUsername)
      setWelcomeUsername(normalizedUsername)
      setShowWelcomeModal(true)
      setIsProfileMenuOpen(false)
      setIsMobileMenuOpen(false)
      navigate('/dashboard')
    } catch {
      setAuthError('Login failed. Check username/password.')
    }
  }

  const handleLogout = async () => {
    try {
      if (staffChatWsEligible && isAuthenticated()) {
        try {
          await markStaffChatOfflinePresence()
        } catch {
          /* session may already be invalid; continue signing out */
        }
      }
      await logoutAllDevices()
    } catch {
      // If request fails, still clear local session.
    } finally {
      logout()
      setAuthed(false)
      setCurrentUsername('')
      setWelcomeUsername('')
      setShowWelcomeModal(false)
      setIsProfileMenuOpen(false)
      setUsername('')
      setPassword('')
      setIsMobileMenuOpen(false)
      setProfileImage(null)
      setStaffChatUnreadTotal(0)
      setStaffChatWsEligible(false)
      setMeId(null)
      setStaffChatToast(null)
    }
  }

  const handleOpenAvatarPreview = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (!profileImage) return
    setIsAvatarPreviewOpen(true)
    setIsProfileMenuOpen(false)
  }

  const toggleSidebar = () => {
    if (isMobile) {
      setIsMobileMenuOpen((current) => !current)
      return
    }
    setIsSidebarCollapsed((current) => {
      const next = !current
      localStorage.setItem(SIDEBAR_STATE_KEY, String(next))
      return next
    })
  }

  const layoutClasses = `layout${!isMobile && isSidebarCollapsed ? ' layout-collapsed' : ''}`
  const sidebarClasses = `sidebar${isMobile && isMobileMenuOpen ? ' sidebar-mobile-open' : ''}`
  const isDesktopCollapsed = !isMobile && isSidebarCollapsed
  const profileName = currentUsername || 'Admin'
  const profileInitial = profileName.charAt(0).toUpperCase()

  if (!authed) {
    return (
      <div className="auth-layout">
        <section className="auth-card">
          <img src="/ccb_registrar_logo.png" alt="CCB Registrar" className="auth-logo" />
          <h1 style={{ textAlign: 'center' }}>Office of the Registrar System</h1>
          <p>Please log in using your Django superuser/staff account.</p>
          <form onSubmit={handleLogin} className="login-form auth-form">
            <label>
              Username
              <input value={username} onChange={(e) => setUsername(e.target.value)} required />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <button type="submit" className="auth-login-btn">
              <Icon name="login" />
              <span>Login</span>
            </button>
            {authError && <p className="error-text">{authError}</p>}
          </form>
        </section>
      </div>
    )
  }

  return (
    <div className={layoutClasses}>
      {isMobile && isMobileMenuOpen && <button className="sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} aria-label="Close menu" />}

      <aside className={sidebarClasses}>
        <div className="sidebar-header">
          <img src="/ccb_registrar_logo.png" alt="CCB Registrar" className="brand-logo" />
          {!isMobile && (
            <button type="button" onClick={toggleSidebar} className="sidebar-toggle" aria-label="Toggle sidebar">
              <Icon name={isSidebarCollapsed ? 'chevronRight' : 'chevronLeft'} />
            </button>
          )}
        </div>

        <div className="sidebar-content">
          <nav className="sidebar-nav">
            {navItems.map(({ path, label, icon: ItemIcon, statusTag }) => (
              <div
                key={path}
                className={`nav-item-wrapper${path === '/chat' ? ' nav-item-wrapper--chat' : ''}${statusTag ? ' nav-item-wrapper--status' : ''}`}
              >
                <NavLink
                  to={path}
                  className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                  onClick={() => {
                    recordRecentMenu(path, label)
                    setIsProfileMenuOpen(false)
                    if (isMobile) {
                      setIsMobileMenuOpen(false)
                    }
                  }}
                  title={isSidebarCollapsed && !isMobile ? label : ''}
                >
                  <span className="nav-icon">
                    <ItemIcon />
                  </span>
                  <span className="nav-label">
                    <span className="nav-label-text">{label}</span>
                    {statusTag ? <span className="nav-status-tag">{statusTag}</span> : null}
                  </span>
                </NavLink>
                {path === '/chat' && staffChatUnreadTotal > 0 ? (
                  <span className="nav-unread-badge" aria-label={`${staffChatUnreadTotal} unread staff chat messages`}>
                    {staffChatUnreadTotal > 99 ? '99+' : staffChatUnreadTotal}
                  </span>
                ) : null}
                {statusTag ? <span className="nav-status-dot" aria-hidden="true" /> : null}
              </div>
            ))}
          </nav>
          <div
            className={`sidebar-profile${isDesktopCollapsed ? ' sidebar-profile-collapsed' : ''}`}
            title={isDesktopCollapsed ? profileName : undefined}
            ref={profileMenuRef}
            onClick={isDesktopCollapsed ? () => setIsProfileMenuOpen((current) => !current) : undefined}
            role={isDesktopCollapsed ? 'button' : undefined}
            tabIndex={isDesktopCollapsed ? 0 : undefined}
            onKeyDown={
              isDesktopCollapsed
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setIsProfileMenuOpen((current) => !current)
                    }
                  }
                : undefined
            }
          >
            <button
              type="button"
              className="sidebar-profile-avatar"
              onClick={handleOpenAvatarPreview}
              aria-label={profileImage ? 'Open profile photo' : 'Profile avatar'}
              title={profileImage ? 'View profile photo' : 'Profile avatar'}
            >
              {profileImage ? <img src={profileImage} alt={`${profileName} profile`} className="sidebar-profile-avatar-image" /> : profileInitial}
            </button>
            <div className="sidebar-profile-meta">
              <strong className="sidebar-profile-name">{profileName}</strong>
              <span className="sidebar-profile-role">Administrator</span>
            </div>
            {!isDesktopCollapsed && (
              <button
                type="button"
                className="sidebar-profile-action"
                onClick={(event) => {
                  event.stopPropagation()
                  setIsProfileMenuOpen((current) => !current)
                }}
                title="Settings Menu"
                aria-label="Open settings menu"
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
              >
                <Icon name="settings" />
              </button>
            )}
            {isProfileMenuOpen && (
              <div className="sidebar-profile-menu" role="menu" aria-label="Profile menu">
                <button
                  type="button"
                  className="sidebar-profile-menu-item"
                  role="menuitem"
                  title="Edit Profile"
                  onClick={() => {
                    recordRecentMenu('/profile', 'Edit Profile')
                    navigate('/profile')
                    setIsProfileMenuOpen(false)
                  }}
                >
                  <span className="menu-item-icon">
                    <Icon name="settings" />
                  </span>
                  <span>Edit Profile</span>
                </button>
                <button
                  type="button"
                  className="sidebar-profile-menu-item is-danger"
                  role="menuitem"
                  title="Logout"
                  onClick={handleLogout}
                >
                  <span className="menu-item-icon">
                    <Icon name="logout" />
                  </span>
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {staffChatToast ? (
        <div className="staff-chat-notify" role="status" aria-live="polite" aria-atomic="true">
          <div className="staff-chat-notify__card">
            <div className="staff-chat-notify__inner">
              <span className="staff-chat-notify__icon" aria-hidden="true">
                <StaffChatIcon />
              </span>
              <div className="staff-chat-notify__text">
                <strong className="staff-chat-notify__title">
                  {staffChatToast.mode === 'incoming' ? staffChatToast.headline : 'Staff Chat'}
                </strong>
                <p className="staff-chat-notify__detail">
                  {staffChatToast.mode === 'incoming' ? staffChatToast.detail : staffChatToastSummary(staffChatToast.delta)}
                </p>
              </div>
              <div className="staff-chat-notify__actions">
                <button
                  type="button"
                  className="confirm-btn staff-chat-notify__primary"
                  onClick={() => {
                    recordRecentMenu('/chat', 'Staff Chat')
                    setStaffChatToast(null)
                    const path =
                      staffChatToast.mode === 'incoming' && staffChatToast.conversationId > 0
                        ? `/chat?conversation=${staffChatToast.conversationId}`
                        : '/chat'
                    navigate(path)
                    if (isMobile) {
                      setIsMobileMenuOpen(false)
                    }
                  }}
                >
                  Open Staff Chat
                </button>
                <button type="button" className="confirm-btn confirm-btn-secondary" onClick={() => setStaffChatToast(null)}>
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <main className="main">
        <div className="main-toolbar">
          {isMobile && (
            <button type="button" onClick={toggleSidebar} className="hamburger-btn" aria-label="Open menu">
              <Icon name="menu" />
            </button>
          )}
        </div>
        <Outlet />
      </main>

      {showWelcomeModal && (
        <div className="confirm-overlay" onClick={() => setShowWelcomeModal(false)}>
          <div className="confirm-modal welcome-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="welcome-modal-avatar-wrap" aria-hidden="true">
              <img
                src={profileImage || DEFAULT_PROFILE_AVATAR}
                alt=""
                className="welcome-modal-avatar"
              />
            </div>
            <h3>
              Welcome, <span>{welcomeUsername}</span>
            </h3>
            <p>You are now logged in.</p>
            <div className="confirm-actions">
              <button type="button" className="confirm-btn confirm-btn-secondary" onClick={() => setShowWelcomeModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {isAvatarPreviewOpen && profileImage && (
        <div className="confirm-overlay" onClick={() => setIsAvatarPreviewOpen(false)}>
          <div
            className="confirm-modal profile-photo-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Profile photo preview"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={profileImage} alt={`${profileName} profile`} className="profile-photo-preview-image" />
            <div className="confirm-actions">
              <button type="button" className="confirm-btn confirm-btn-secondary" onClick={() => setIsAvatarPreviewOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
