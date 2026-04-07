import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import {
  type StaffChatPresence,
  StaffChatConversationSummary,
  StaffChatMessage,
  StaffChatPeer,
  fetchMe,
  fetchStaffChatConversations,
  fetchStaffChatMessages,
  fetchStaffChatPeers,
  getErrorMessage,
  deleteStaffChatMessage,
  fetchStaffChatHiddenMessages,
  getStaffChatWebSocketUrl,
  markStaffChatConversationRead,
  MeResponse,
  onAuthLogout,
  requestStaffChatUnreadRefresh,
  openStaffChatConversation,
  patchStaffChatMessage,
  sendStaffChatMessage,
  sendStaffChatMessageWithFile,
  setStaffChatMessageReaction,
  clearStaffChatMessageReaction,
  unhideStaffChatMessage,
  type StaffChatMessageReactionRow,
} from '../api'
import { StaffChatIcon } from '../components/Icons'
import { recordRecentMenu } from '../recentMenus'
import { presenceFromLastActivityIso } from '../staffChatPresence'

const DEFAULT_PROFILE_AVATAR = '/man-woman-icon-male-female-avatar-profile-vector-illustration-gender-symbols-pink-blue-gentleman-lady-toilet-signs_735449-462.png'

/** Same rule as backend `IsRegistrarOrStaff` and the staff-chat WebSocket. */
function staffChatRoleAllowed(me: Pick<MeResponse, 'is_staff' | 'is_superuser'> | null | undefined): boolean {
  return !!me && (!!me.is_staff || !!me.is_superuser)
}

function displayPeerLabel(peer: StaffChatPeer): string {
  const name = `${peer.first_name ?? ''} ${peer.last_name ?? ''}`.trim()
  return name || peer.username
}

function peerInitials(peer: StaffChatPeer): string {
  const parts = `${peer.first_name ?? ''} ${peer.last_name ?? ''}`.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
  if (parts.length === 1) return (parts[0].slice(0, 2) || peer.username.slice(0, 2)).toUpperCase()
  return peer.username.slice(0, 2).toUpperCase()
}

function normalizePeerPresence(raw: StaffChatPeer['presence'] | undefined): StaffChatPresence {
  return raw === 'online' || raw === 'away' || raw === 'offline' ? raw : 'offline'
}

/** Prefer time-based presence so dots drift online → away → offline without a full reload. */
function displayedPeerPresence(peer: StaffChatPeer): StaffChatPresence {
  const serverPresence = normalizePeerPresence(peer.presence)
  if (serverPresence === 'offline') return 'offline'
  const iso = peer.last_activity_at
  if (iso != null && iso !== '') {
    return presenceFromLastActivityIso(iso)
  }
  return serverPresence
}

function staffPresenceTitle(p: StaffChatPresence): string {
  switch (p) {
    case 'online':
      return 'Online — used the system within the last 30 seconds'
    case 'away':
      return 'Away — logged in but no activity for at least 30 seconds'
    case 'offline':
      return 'Offline — signed out or closed the site (tab close while logged in)'
  }
}

function StaffChatPeerAvatar({
  peer,
  presence,
  className = '',
}: {
  peer: StaffChatPeer
  presence: StaffChatPresence
  className?: string
}) {
  return (
    <span className={`staff-chat-avatar ${className}`.trim()}>
      <img src={peer.photo_url || DEFAULT_PROFILE_AVATAR} alt="" className="staff-chat-avatar-image" />
      <span
        className={`staff-chat-presence-dot staff-chat-presence-dot--compact staff-chat-presence-dot--${presence} staff-chat-avatar-status`}
        role="img"
        aria-label={staffPresenceTitle(presence)}
        title={staffPresenceTitle(presence)}
      />
    </span>
  )
}

function formatStaffLastActive(iso: string | null | undefined, presence: StaffChatPresence): string {
  if (presence === 'online') return 'Active now'
  if (iso == null || iso === '') {
    return presence === 'offline' ? 'Last seen recently' : 'Away'
  }
  const t = Date.parse(iso)
  if (Number.isNaN(t)) {
    return presence === 'offline' ? 'Last seen recently' : 'Away'
  }
  const seenAt = new Date(t)
  const now = new Date()
  const diffMs = Math.max(0, now.getTime() - t)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day
  const month = 30 * day
  const year = 365 * day
  const timeLabel = seenAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfSeenDay = new Date(seenAt.getFullYear(), seenAt.getMonth(), seenAt.getDate()).getTime()
  const dayDiff = Math.floor((startOfToday - startOfSeenDay) / day)

  if (presence === 'offline') {
    if (dayDiff === 0) return `Last seen today at ${timeLabel}`
    if (dayDiff === 1) return `Last seen yesterday at ${timeLabel}`
  } else if (diffMs < hour) {
    const minutes = Math.max(1, Math.floor(diffMs / minute))
    return `Active ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  }

  let value = 0
  let unit = ''
  if (diffMs < day) {
    value = Math.floor(diffMs / hour)
    unit = value === 1 ? 'hour' : 'hours'
  } else if (diffMs < week) {
    value = Math.floor(diffMs / day)
    unit = value === 1 ? 'day' : 'days'
  } else if (diffMs < month) {
    value = Math.floor(diffMs / week)
    unit = value === 1 ? 'week' : 'weeks'
  } else if (diffMs < year) {
    value = Math.floor(diffMs / month)
    unit = value === 1 ? 'month' : 'months'
  } else {
    value = Math.floor(diffMs / year)
    unit = value === 1 ? 'year' : 'years'
  }

  return presence === 'offline'
    ? `Last seen ${value} ${unit} ago`
    : `Active ${value} ${unit} ago`
}

const STAFF_CHAT_FILE_ACCEPT =
  'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Same order as backend `STAFF_CHAT_ALLOWED_REACTION_EMOJIS`. */
const STAFF_CHAT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const

function normalizeStaffChatMessage(row: StaffChatMessage): StaffChatMessage {
  return {
    ...row,
    edited_at: row.edited_at ?? null,
    attachment_url: row.attachment_url ?? null,
    attachment_kind: row.attachment_kind ?? null,
    attachment_name: row.attachment_name ?? null,
    reactions: Array.isArray(row.reactions) ? row.reactions : [],
  }
}

function staffChatReactionSummary(reactions: StaffChatMessageReactionRow[] | undefined) {
  if (!reactions?.length) return []
  const map = new Map<string, number>()
  for (const r of reactions) {
    map.set(r.emoji, (map.get(r.emoji) ?? 0) + 1)
  }
  return [...map.entries()]
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji))
}

/** Messenger-style pill: distinct emojis + single total (total hidden when only one reaction). */
function staffChatReactionPillModel(reactions: StaffChatMessageReactionRow[] | undefined) {
  const summary = staffChatReactionSummary(reactions)
  if (!summary.length) return null
  const total = summary.reduce((n, x) => n + x.count, 0)
  return {
    emojis: summary.map((x) => x.emoji),
    total,
  }
}

function StaffChatReactionPill({ reactions }: { reactions: StaffChatMessageReactionRow[] | undefined }) {
  const model = staffChatReactionPillModel(reactions)
  if (!model) return null
  return (
    <div
      className="staff-chat-reaction-pill"
      aria-label={`${model.total} reaction${model.total === 1 ? '' : 's'}`}
    >
      <span className="staff-chat-reaction-pill-emojis">
        {model.emojis.map((emo) => (
          <span key={emo} className="staff-chat-reaction-pill-emoji">
            {emo}
          </span>
        ))}
      </span>
      {model.total > 1 ? (
        <span className="staff-chat-reaction-pill-total" aria-hidden="true">
          {model.total}
        </span>
      ) : null}
    </div>
  )
}

function previewTextForConversationList(msg: StaffChatMessage): string {
  const t = (msg.body || '').trim()
  if (t) return t
  if (msg.attachment_name) return `📎 ${msg.attachment_name}`
  if (msg.attachment_url) return '📎 Attachment'
  return ''
}

function sortStaffChatMessages(rows: StaffChatMessage[]): StaffChatMessage[] {
  return [...rows].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id - b.id,
  )
}

export function StaffChatPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [me, setMe] = useState<MeResponse | null>(null)
  const staffChatOk = staffChatRoleAllowed(me)
  const [loadError, setLoadError] = useState('')
  const [peers, setPeers] = useState<StaffChatPeer[]>([])
  const [conversations, setConversations] = useState<StaffChatConversationSummary[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [messages, setMessages] = useState<StaffChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [pendingAttachment, setPendingAttachment] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [fileUploading, setFileUploading] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [editRemoveAttachment, setEditRemoveAttachment] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [messageMenuOpenId, setMessageMenuOpenId] = useState<number | null>(null)
  const [reactionMenuOpenId, setReactionMenuOpenId] = useState<number | null>(null)
  /** Opened from Colleagues before the thread has any messages (not returned in Conversations list yet). */
  const [conversationDraft, setConversationDraft] = useState<{
    id: number
    other_user: StaffChatPeer
  } | null>(null)
  const [hiddenMessages, setHiddenMessages] = useState<StaffChatMessage[]>([])
  const [hiddenOpen, setHiddenOpen] = useState(false)
  const [wsState, setWsState] = useState<'connecting' | 'open' | 'closed'>('closed')
  const wsRef = useRef<WebSocket | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const reconnectAttemptRef = useRef(0)
  const messagesScrollRef = useRef<HTMLDivElement | null>(null)
  const messagesInnerRef = useRef<HTMLDivElement | null>(null)
  const editSaveLockRef = useRef(false)
  const selectedIdRef = useRef<number | null>(null)
  selectedIdRef.current = selectedId
  const myUserIdRef = useRef<number | null>(null)

  useEffect(() => {
    myUserIdRef.current = me?.id ?? null
  }, [me?.id])

  const refreshConversations = useCallback(async () => {
    const list = await fetchStaffChatConversations()
    setConversations(list)
    requestStaffChatUnreadRefresh()
    return list
  }, [])

  useEffect(() => {
    if (!conversationDraft) return
    if (conversations.some((c) => c.id === conversationDraft.id)) {
      setConversationDraft(null)
    }
  }, [conversations, conversationDraft])

  useEffect(() => {
    recordRecentMenu('/chat', 'Staff chat')
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchMe()
      .then((data) => {
        if (!cancelled) setMe(data)
      })
      .catch(() => {
        if (!cancelled) setMe(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!staffChatOk) return

    let cancelled = false
    setLoadError('')
    Promise.all([fetchStaffChatPeers(), refreshConversations()])
      .then(([peerList]) => {
        if (cancelled) return
        setPeers(peerList)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(getErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [staffChatOk, refreshConversations])

  /** Deep link from notification banner: `/chat?conversation=<id>` */
  useEffect(() => {
    if (!staffChatOk) return
    const raw = searchParams.get('conversation')
    if (raw == null || raw === '') return
    const convId = Number.parseInt(raw, 10)
    if (!Number.isFinite(convId) || convId <= 0) {
      navigate('/chat', { replace: true })
      return
    }
    if (conversations.length === 0) return
    if (conversations.some((c) => c.id === convId)) {
      setSelectedId(convId)
      setConversationDraft(null)
      navigate('/chat', { replace: true })
      return
    }
    navigate('/chat', { replace: true })
  }, [staffChatOk, conversations, searchParams, navigate])

  useEffect(() => {
    if (!staffChatOk) return

    const id = window.setInterval(() => {
      setPeers((prev) =>
        prev.map((p) => ({ ...p, presence: displayedPeerPresence(p) })),
      )
      setConversations((prev) =>
        prev.map((c) => ({
          ...c,
          other_user: {
            ...c.other_user,
            presence: displayedPeerPresence(c.other_user),
          },
        })),
      )
    }, 5_000)

    return () => window.clearInterval(id)
  }, [staffChatOk])

  useEffect(() => {
    if (!staffChatOk) return

    const id = window.setInterval(() => {
      fetchStaffChatPeers()
        .then((list) => setPeers(list))
        .catch(() => {})
      void refreshConversations()
    }, 120_000)

    return () => window.clearInterval(id)
  }, [staffChatOk, refreshConversations])

  const applyStaffPresenceFromWs = useCallback(
    (payload: { user_id: number; last_activity_at: string | null; presence: StaffChatPresence }) => {
      const { user_id, last_activity_at } = payload
      const presence =
        payload.presence === 'offline'
          ? 'offline'
          : last_activity_at != null && last_activity_at !== ''
            ? presenceFromLastActivityIso(last_activity_at)
            : payload.presence
      setPeers((prev) => prev.map((p) => (p.id === user_id ? { ...p, last_activity_at, presence } : p)))
      setConversations((prev) =>
        prev.map((c) =>
          c.other_user.id === user_id
            ? { ...c, other_user: { ...c.other_user, last_activity_at, presence } }
            : c,
        ),
      )
    },
    [],
  )

  const mergeIncomingMessage = useCallback((conversationId: number, msg: StaffChatMessage) => {
    const myId = myUserIdRef.current
    const fromOther = myId != null && msg.sender_id !== myId
    const viewing = selectedIdRef.current === conversationId

    setConversations((prev) => {
      if (!prev.some((c) => c.id === conversationId)) {
        void refreshConversations()
        return prev
      }
      const mapped = prev.map((c) => {
        if (c.id !== conversationId) return c
        const bump = fromOther && !viewing ? 1 : 0
        const base = (c.unread_count ?? 0) + bump
        const unread_count = fromOther && viewing ? 0 : Math.max(0, base)
        return {
          ...c,
          last_message: {
            body: previewTextForConversationList(msg),
            created_at: msg.created_at,
            sender_id: msg.sender_id,
          },
          updated_at: msg.created_at,
          unread_count,
        }
      })
      return [...mapped].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
    })

    setMessages((m) => {
      if (selectedIdRef.current !== conversationId) return m
      if (m.some((row) => row.id === msg.id)) return m
      return [...m, msg]
    })

    if (fromOther && viewing) {
      void markStaffChatConversationRead(conversationId)
    }

    requestStaffChatUnreadRefresh()
  }, [refreshConversations])

  const connectWs = useCallback(() => {
    if (!staffChatOk) return
    const token = localStorage.getItem('access_token')
    if (!token) return

    if (wsRef.current) {
      try {
        wsRef.current.close()
      } catch {
        // no-op
      }
      wsRef.current = null
    }

    setWsState('connecting')
    const url = getStaffChatWebSocketUrl(token)
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setWsState('open')
      reconnectAttemptRef.current = 0
    }

    ws.onmessage = (event) => {
      try {
        const raw = typeof event.data === 'string' ? event.data : ''
        const data = JSON.parse(raw) as {
          type?: string
          conversation_id?: number
          message?: StaffChatMessage
          message_id?: number
          scope?: string
          list_in_hidden_ui?: boolean
          user_id?: number
          presence?: string
          last_activity_at?: string | null
        }
        if (data.type === 'staff_chat.presence' && typeof data.user_id === 'number') {
          const p = data.presence
          if (p === 'online' || p === 'away' || p === 'offline') {
            const at = typeof data.last_activity_at === 'string' ? data.last_activity_at : null
            applyStaffPresenceFromWs({
              user_id: data.user_id,
              last_activity_at: at,
              presence: p,
            })
          }
          return
        }
        if (data.type === 'staff_chat.message' && data.message && typeof data.conversation_id === 'number') {
          mergeIncomingMessage(data.conversation_id, normalizeStaffChatMessage(data.message as StaffChatMessage))
          return
        }
        if (data.type === 'staff_chat.message_updated' && data.message && typeof data.conversation_id === 'number') {
          const msg = normalizeStaffChatMessage(data.message as StaffChatMessage)
          setMessages((rows) => rows.map((x) => (x.id === msg.id ? msg : x)))
          setHiddenMessages((rows) => rows.map((x) => (x.id === msg.id ? msg : x)))
          void refreshConversations()
          return
        }
        if (
          data.type === 'staff_chat.message_deleted' &&
          typeof data.message_id === 'number' &&
          typeof data.conversation_id === 'number'
        ) {
          if (selectedIdRef.current === data.conversation_id) {
            setMessages((rows) => rows.filter((x) => x.id !== data.message_id))
            setHiddenMessages((rows) => rows.filter((x) => x.id !== data.message_id))
            void fetchStaffChatHiddenMessages(data.conversation_id)
              .then((rows) => setHiddenMessages(rows.map(normalizeStaffChatMessage)))
              .catch(() => {})
          }
          void refreshConversations()
          requestStaffChatUnreadRefresh()
          return
        }
        if (
          data.type === 'staff_chat.message_hidden' &&
          typeof data.message_id === 'number' &&
          typeof data.conversation_id === 'number'
        ) {
          if (selectedIdRef.current === data.conversation_id) {
            setMessages((rows) => rows.filter((x) => x.id !== data.message_id))
            if (data.list_in_hidden_ui !== false) {
              void fetchStaffChatHiddenMessages(data.conversation_id)
                .then((rows) => setHiddenMessages(rows.map(normalizeStaffChatMessage)))
                .catch(() => {})
            }
          }
          void refreshConversations()
          requestStaffChatUnreadRefresh()
          return
        }
        if (
          data.type === 'staff_chat.message_unhidden' &&
          data.message &&
          typeof data.conversation_id === 'number'
        ) {
          const msg = normalizeStaffChatMessage(data.message as StaffChatMessage)
          if (selectedIdRef.current === data.conversation_id) {
            setMessages((rows) => {
              if (rows.some((x) => x.id === msg.id)) return rows
              return sortStaffChatMessages([...rows, msg])
            })
            setHiddenMessages((rows) => rows.filter((x) => x.id !== msg.id))
          }
          void refreshConversations()
          requestStaffChatUnreadRefresh()
          return
        }
      } catch {
        // ignore malformed frames
      }
    }

    ws.onclose = () => {
      setWsState('closed')
      wsRef.current = null
      if (!staffChatOk) return
      if (!localStorage.getItem('access_token')) return

      const attempt = reconnectAttemptRef.current + 1
      reconnectAttemptRef.current = attempt
      const delay = Math.min(30_000, 800 * Math.pow(1.6, attempt - 1))
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null
        connectWs()
      }, delay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [staffChatOk, mergeIncomingMessage, refreshConversations, applyStaffPresenceFromWs])

  useEffect(() => {
    if (!staffChatOk) return
    connectWs()
    return () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (wsRef.current) {
        try {
          wsRef.current.close()
        } catch {
          // no-op
        }
        wsRef.current = null
      }
    }
  }, [staffChatOk, connectWs])

  useEffect(() => {
    return onAuthLogout(() => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (wsRef.current) {
        try {
          wsRef.current.close()
        } catch {
          // no-op
        }
        wsRef.current = null
      }
      setWsState('closed')
    })
  }, [])

  useEffect(() => {
    if (!selectedId || !staffChatOk) return
    let cancelled = false
    Promise.all([fetchStaffChatMessages(selectedId), fetchStaffChatHiddenMessages(selectedId)])
      .then(([mainRows, hiddenRows]) => {
        if (cancelled) return
        setMessages(mainRows.map(normalizeStaffChatMessage))
        setHiddenMessages(hiddenRows.map(normalizeStaffChatMessage))
        setConversations((prev) =>
          prev.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c)),
        )
        requestStaffChatUnreadRefresh()
        void markStaffChatConversationRead(selectedId)
      })
      .catch(() => {
        if (cancelled) return
        setMessages([])
        setHiddenMessages([])
      })
    return () => {
      cancelled = true
    }
  }, [selectedId, staffChatOk])

  const scrollThreadToBottom = useCallback(() => {
    const el = messagesScrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  /** Scroll after paint and after async layout (images, fonts). */
  useEffect(() => {
    if (selectedId == null) return
    scrollThreadToBottom()
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        scrollThreadToBottom()
      })
    })
    const t1 = window.setTimeout(() => scrollThreadToBottom(), 50)
    const t2 = window.setTimeout(() => scrollThreadToBottom(), 250)
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [messages, selectedId, scrollThreadToBottom])

  useEffect(() => {
    if (selectedId == null) return
    const outer = messagesScrollRef.current
    const inner = messagesInnerRef.current
    if (!outer || !inner) return
    const ro = new ResizeObserver(() => {
      outer.scrollTop = outer.scrollHeight
    })
    ro.observe(inner)
    return () => ro.disconnect()
  }, [selectedId])

  useEffect(() => {
    setEditingId(null)
    setEditDraft('')
    setEditRemoveAttachment(false)
    setEditSaving(false)
    editSaveLockRef.current = false
    setMessageMenuOpenId(null)
    setReactionMenuOpenId(null)
    setHiddenMessages([])
    setHiddenOpen(false)
    setPendingAttachment(null)
  }, [selectedId])

  useEffect(() => {
    if (messageMenuOpenId == null && reactionMenuOpenId == null) return
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('.staff-chat-msg-menu-root')) {
        setMessageMenuOpenId(null)
        setReactionMenuOpenId(null)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMessageMenuOpenId(null)
        setReactionMenuOpenId(null)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [messageMenuOpenId, reactionMenuOpenId])

  const cancelEdit = () => {
    if (editSaving) return
    setEditingId(null)
    setEditDraft('')
    setEditRemoveAttachment(false)
  }

  const startEdit = (m: StaffChatMessage) => {
    setMessageMenuOpenId(null)
    setReactionMenuOpenId(null)
    setEditingId(m.id)
    setEditDraft(m.body ?? '')
    setEditRemoveAttachment(false)
  }

  const toggleMessageMenu = (messageId: number) => {
    setReactionMenuOpenId(null)
    setMessageMenuOpenId((prev) => (prev === messageId ? null : messageId))
  }

  const toggleReactionMenu = (messageId: number) => {
    setMessageMenuOpenId(null)
    setReactionMenuOpenId((prev) => (prev === messageId ? null : messageId))
  }

  const pickMessageReaction = async (m: StaffChatMessage, emoji: string) => {
    if (selectedId == null) return
    setReactionMenuOpenId(null)
    setLoadError('')
    try {
      const updated = await setStaffChatMessageReaction(selectedId, m.id, emoji)
      setMessages((rows) => rows.map((x) => (x.id === updated.id ? normalizeStaffChatMessage(updated) : x)))
    } catch (err: unknown) {
      setLoadError(getErrorMessage(err))
    }
  }

  const clearMessageReaction = async (m: StaffChatMessage) => {
    if (selectedId == null) return
    setReactionMenuOpenId(null)
    setLoadError('')
    try {
      const updated = await clearStaffChatMessageReaction(selectedId, m.id)
      setMessages((rows) => rows.map((x) => (x.id === updated.id ? normalizeStaffChatMessage(updated) : x)))
    } catch (err: unknown) {
      setLoadError(getErrorMessage(err))
    }
  }

  const saveEdit = async () => {
    if (selectedId == null || editingId == null || editSaveLockRef.current) return
    editSaveLockRef.current = true
    setEditSaving(true)
    setLoadError('')
    try {
      const updated = await patchStaffChatMessage(selectedId, editingId, {
        body: editDraft,
        remove_attachment: editRemoveAttachment,
      })
      setMessages((rows) => rows.map((x) => (x.id === updated.id ? normalizeStaffChatMessage(updated) : x)))
      setEditingId(null)
      setEditDraft('')
      setEditRemoveAttachment(false)
      void refreshConversations()
    } catch (err: unknown) {
      setLoadError(getErrorMessage(err))
    } finally {
      editSaveLockRef.current = false
      setEditSaving(false)
    }
  }

  const onEditKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void saveEdit()
    }
  }

  const deleteOwnMessageForEveryone = async (m: StaffChatMessage) => {
    if (selectedId == null) return
    if (
      !window.confirm(
        'Delete for everyone? The message and any file or photo will be permanently removed. Neither you nor the other person can view or recover it from the chat.',
      )
    ) {
      return
    }
    setLoadError('')
    try {
      await deleteStaffChatMessage(selectedId, m.id, { scope: 'everyone' })
      setMessages((rows) => rows.filter((x) => x.id !== m.id))
      setHiddenMessages((rows) => rows.filter((x) => x.id !== m.id))
      if (editingId === m.id) cancelEdit()
      const rows = await fetchStaffChatHiddenMessages(selectedId)
      setHiddenMessages(rows.map(normalizeStaffChatMessage))
      void refreshConversations()
    } catch (err: unknown) {
      setLoadError(getErrorMessage(err))
    }
  }

  const deleteOwnMessageForMe = async (m: StaffChatMessage) => {
    if (selectedId == null) return
    if (
      !window.confirm(
        'Delete for you only? The other person keeps the message, file, or photo. It will be removed from your view for good—it will not appear under Hidden and you cannot bring it back here.',
      )
    ) {
      return
    }
    setLoadError('')
    try {
      await deleteStaffChatMessage(selectedId, m.id, { scope: 'self' })
      setMessages((rows) => rows.filter((x) => x.id !== m.id))
      if (editingId === m.id) cancelEdit()
      void refreshConversations()
    } catch (err: unknown) {
      setLoadError(getErrorMessage(err))
    }
  }

  const hideOthersMessage = async (m: StaffChatMessage) => {
    if (selectedId == null) return
    if (
      !window.confirm(
        'Hide this message from your view? You can unhide it later from the Hidden section.',
      )
    ) {
      return
    }
    setLoadError('')
    try {
      await deleteStaffChatMessage(selectedId, m.id)
      setMessages((rows) => rows.filter((x) => x.id !== m.id))
      const rows = await fetchStaffChatHiddenMessages(selectedId)
      setHiddenMessages(rows.map(normalizeStaffChatMessage))
      void refreshConversations()
    } catch (err: unknown) {
      setLoadError(getErrorMessage(err))
    }
  }

  const unhideMessage = async (m: StaffChatMessage) => {
    if (selectedId == null) return
    setLoadError('')
    try {
      const restored = await unhideStaffChatMessage(selectedId, m.id)
      const msg = normalizeStaffChatMessage(restored)
      setHiddenMessages((rows) => rows.filter((x) => x.id !== msg.id))
      setMessages((rows) => {
        if (rows.some((x) => x.id === msg.id)) return rows
        return sortStaffChatMessages([...rows, msg])
      })
      void refreshConversations()
    } catch (err: unknown) {
      setLoadError(getErrorMessage(err))
    }
  }

  const onSelectPeer = async (peer: StaffChatPeer) => {
    setLoadError('')
    try {
      const { conversation } = await openStaffChatConversation(peer.id)
      setConversationDraft({ id: conversation.id, other_user: conversation.other_user })
      setSelectedId(conversation.id)
    } catch (e: unknown) {
      setLoadError(getErrorMessage(e))
    }
  }

  const onAttachClick = () => {
    fileInputRef.current?.click()
  }

  const onFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || selectedId == null || !staffChatOk) return
    setPendingAttachment(file)
  }

  const submitCompose = async () => {
    if (!selectedId || sending || fileUploading) return
    const text = draft.trim()
    if (!text && !pendingAttachment) return

    setLoadError('')
    if (pendingAttachment) {
      setFileUploading(true)
      try {
        const msg = await sendStaffChatMessageWithFile(selectedId, pendingAttachment, text || undefined)
        setDraft('')
        setPendingAttachment(null)
        mergeIncomingMessage(selectedId, normalizeStaffChatMessage(msg))
        setConversations((prev) =>
          prev.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c)),
        )
      } catch (err: unknown) {
        setLoadError(getErrorMessage(err))
      } finally {
        setFileUploading(false)
      }
      return
    }

    setSending(true)
    try {
      const msg = await sendStaffChatMessage(selectedId, text)
      setDraft('')
      mergeIncomingMessage(selectedId, normalizeStaffChatMessage(msg))
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c)),
      )
    } catch (e: unknown) {
      setLoadError(getErrorMessage(e))
    } finally {
      setSending(false)
    }
  }

  const onSend = (event: FormEvent) => {
    event.preventDefault()
    void submitCompose()
  }

  const onComposeKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submitCompose()
    }
  }

  if (!me) {
    return (
      <section className="card staff-chat-page">
        <p className="staff-chat-muted">Loading…</p>
      </section>
    )
  }

  if (!staffChatOk) {
    return (
      <section className="card staff-chat-page">
        <h1 className="page-title staff-chat-page-title">
          <StaffChatIcon />
          Staff Chat
        </h1>
        <p className="staff-chat-muted">Only registrar staff or administrator accounts can use office chat.</p>
      </section>
    )
  }

  const selected: StaffChatConversationSummary | undefined = (() => {
    const fromList = conversations.find((c) => c.id === selectedId)
    if (fromList) return fromList
    if (conversationDraft?.id === selectedId) {
      const ou =
        peers.find((p) => p.id === conversationDraft.other_user.id) ?? conversationDraft.other_user
      return {
        id: conversationDraft.id,
        other_user: ou,
        last_message: null,
        updated_at: '',
        unread_count: 0,
      }
    }
    return undefined
  })()

  return (
    <section className="card staff-chat-page">
      <header className="staff-chat-header">
        <h1 className="page-title staff-chat-page-title">
          <StaffChatIcon />
          Staff Chat
        </h1>
        <span
          className={`staff-chat-ws staff-chat-ws--${wsState}`}
          role="img"
          aria-label={
            wsState === 'open'
              ? 'Realtime connected'
              : wsState === 'connecting'
                ? 'Realtime connecting'
                : 'Realtime disconnected'
          }
          title={
            wsState === 'open'
              ? 'Realtime: connected'
              : wsState === 'connecting'
                ? 'Realtime: connecting'
                : 'Realtime: disconnected'
          }
        />
      </header>

      {loadError ? <p className="form-error staff-chat-banner">{loadError}</p> : null}

      <div className={`staff-chat-layout${selected ? ' is-thread-open' : ''}`}>
        <aside className="staff-chat-sidebar">
          <div className="staff-chat-sidebar-section">
          <h2 className="staff-chat-sidebar-title">Colleagues</h2>
          <ul className="staff-chat-peer-list">
            {peers.map((peer) => (
              <li key={peer.id}>
                <button type="button" className="staff-chat-peer-btn" onClick={() => onSelectPeer(peer)}>
                  {(() => {
                    const presence = displayedPeerPresence(peer)
                    const presenceLabel = formatStaffLastActive(peer.last_activity_at, presence)
                    return (
                  <span className="staff-chat-peer-text">
                    <StaffChatPeerAvatar peer={peer} presence={presence} className="staff-chat-list-avatar" />
                    <span className="staff-chat-peer-copy">
                      <span className="staff-chat-peer-name-row">
                        <span className="staff-chat-peer-name">{displayPeerLabel(peer)}</span>
                      </span>
                      <span className="staff-chat-peer-active">{presenceLabel}</span>
                    </span>
                  </span>
                    )
                  })()}
                </button>
              </li>
            ))}
          </ul>
          </div>

          <div className="staff-chat-sidebar-section staff-chat-sidebar-section--conversations">
          <h2 className="staff-chat-sidebar-title">Conversations</h2>
          <ul className="staff-chat-conv-list">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`staff-chat-conv-btn${c.id === selectedId ? ' is-active' : ''}`}
                  onClick={() => {
                    setConversationDraft(null)
                    setSelectedId(c.id)
                  }}
                >
                  {(() => {
                    const presence = displayedPeerPresence(c.other_user)
                    const presenceLabel = formatStaffLastActive(c.other_user.last_activity_at, presence)
                    return (
                      <>
                        <span className="staff-chat-conv-row-top">
                          <span className="staff-chat-conv-identity">
                            <StaffChatPeerAvatar peer={c.other_user} presence={presence} className="staff-chat-list-avatar" />
                            <span className="staff-chat-conv-name-row">
                              <span className="staff-chat-conv-name">{displayPeerLabel(c.other_user)}</span>
                            </span>
                          </span>
                          {(c.unread_count ?? 0) > 0 ? (
                            <span className="staff-chat-unread-badge" aria-label={`${c.unread_count} unread messages`}>
                              {c.unread_count > 99 ? '99+' : c.unread_count}
                            </span>
                          ) : null}
                        </span>
                        <span className="staff-chat-conv-active">{presenceLabel}</span>
                        {c.last_message ? (
                          <span className="staff-chat-conv-preview">{c.last_message.body}</span>
                        ) : (
                          <span className="staff-chat-conv-preview staff-chat-conv-preview--empty">No messages yet</span>
                        )}
                      </>
                    )
                  })()}
                </button>
              </li>
            ))}
          </ul>
          </div>
        </aside>

        <section className="staff-chat-thread" aria-label="Conversation">
          {selected ? (
            <>
              <div className="staff-chat-thread-header">
                <button
                  type="button"
                  className="staff-chat-thread-back"
                  onClick={() => {
                    setSelectedId(null)
                    setConversationDraft(null)
                  }}
                  aria-label="Back to conversations"
                >
                  <span aria-hidden="true">‹</span>
                </button>
                <div className="staff-chat-thread-title-block">
                  <StaffChatPeerAvatar
                    peer={selected.other_user}
                    presence={displayedPeerPresence(selected.other_user)}
                    className="staff-chat-thread-avatar"
                  />
                  <div className="staff-chat-thread-names">
                    <h2 className="staff-chat-thread-heading">{displayPeerLabel(selected.other_user)}</h2>
                    <span className="staff-chat-thread-sub">
                      {formatStaffLastActive(selected.other_user.last_activity_at, displayedPeerPresence(selected.other_user))}
                    </span>
                  </div>
                </div>
              </div>
              <div className="staff-chat-messages" ref={messagesScrollRef}>
                <div className="staff-chat-messages-inner" ref={messagesInnerRef}>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`staff-chat-bubble-row${m.sender_id === me.id ? ' is-mine' : ''}`}
                  >
                    <div className={`staff-chat-bubble${m.sender_id === me.id ? ' is-mine' : ''}`}>
                      {editingId === m.id ? (
                        <div className="staff-chat-edit-panel">
                          <label className="staff-chat-edit-label" htmlFor={`staff-chat-edit-${m.id}`}>
                            Edit message
                          </label>
                          <textarea
                            id={`staff-chat-edit-${m.id}`}
                            className="staff-chat-input staff-chat-edit-textarea"
                            rows={2}
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={onEditKeyDown}
                            disabled={editSaving}
                          />
                          <p className="staff-chat-edit-kbd-hint">Enter to save · Shift+Enter new line · Esc cancel</p>
                          {(m.attachment_url || m.attachment_name) ? (
                            <label className="staff-chat-edit-remove-file">
                              <input
                                type="checkbox"
                                checked={editRemoveAttachment}
                                onChange={(e) => setEditRemoveAttachment(e.target.checked)}
                                disabled={editSaving}
                              />
                              Remove attachment (image or file)
                            </label>
                          ) : null}
                          {(m.attachment_url || m.attachment_name) && editRemoveAttachment ? (
                            <p className="staff-chat-edit-hint">Attachment will be removed when you save.</p>
                          ) : null}
                          <div className="staff-chat-edit-actions">
                            <button
                              type="button"
                              className="confirm-btn confirm-btn-secondary staff-chat-edit-cancel"
                              onClick={cancelEdit}
                              disabled={editSaving}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {m.attachment_url && m.attachment_kind === 'image' ? (
                            <a
                              href={m.attachment_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="staff-chat-bubble-image-wrap"
                            >
                              <img
                                src={m.attachment_url}
                                alt={m.attachment_name ?? 'Attached image'}
                                className="staff-chat-bubble-image"
                                onLoad={scrollThreadToBottom}
                              />
                            </a>
                          ) : null}
                          {m.attachment_url && m.attachment_kind === 'file' ? (
                            <a
                              href={m.attachment_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="staff-chat-attachment-link"
                            >
                              📎 {m.attachment_name ?? 'Download file'}
                            </a>
                          ) : null}
                          {m.body?.trim() ? <p className="staff-chat-bubble-body">{m.body}</p> : null}
                        </>
                      )}
                      {editingId !== m.id ? (
                        <div className="staff-chat-bubble-meta">
                          <time className="staff-chat-bubble-time" dateTime={m.created_at}>
                            {new Date(m.created_at).toLocaleString()}
                          </time>
                          {m.edited_at ? <span className="staff-chat-edited-flag"> · Edited</span> : null}
                        </div>
                      ) : null}
                      {editingId !== m.id ? <StaffChatReactionPill reactions={m.reactions} /> : null}
                    </div>
                    {editingId !== m.id ? (
                      <div className="staff-chat-msg-menu-root">
                        <div className="staff-chat-msg-hover-actions">
                          <div className="staff-chat-msg-react-wrap">
                            <button
                              type="button"
                              className="staff-chat-msg-react-trigger"
                              title="React"
                              aria-label="React"
                              aria-expanded={reactionMenuOpenId === m.id}
                              aria-haspopup="true"
                              onClick={() => toggleReactionMenu(m.id)}
                            >
                              <svg className="staff-chat-msg-react-icon" viewBox="0 0 24 24" aria-hidden="true">
                                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.75" />
                                <circle cx="9" cy="10" r="1.25" fill="currentColor" />
                                <circle cx="15" cy="10" r="1.25" fill="currentColor" />
                                <path
                                  d="M8.5 14.5c1.1 1.9 2.3 2.5 3.5 2.5s2.4-.6 3.5-2.5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </button>
                            {reactionMenuOpenId === m.id ? (
                              <div className="staff-chat-react-popover" role="menu">
                                <div className="staff-chat-react-popover-emojis" role="group" aria-label="Choose reaction">
                                  {STAFF_CHAT_REACTION_EMOJIS.map((emo) => {
                                    const myEmoji = m.reactions?.find((r) => r.user_id === me.id)?.emoji
                                    const isMyReaction = myEmoji === emo
                                    return (
                                      <button
                                        key={emo}
                                        type="button"
                                        className={`staff-chat-react-popover-emoji${isMyReaction ? ' is-selected' : ''}`}
                                        title={isMyReaction ? 'Remove reaction' : `React with ${emo}`}
                                        aria-label={isMyReaction ? `Remove ${emo} reaction` : `React with ${emo}`}
                                        aria-pressed={isMyReaction}
                                        onClick={() => void pickMessageReaction(m, emo)}
                                      >
                                        {emo}
                                      </button>
                                    )
                                  })}
                                </div>
                                {m.reactions?.some((r) => r.user_id === me.id) ? (
                                  <button
                                    type="button"
                                    className="staff-chat-react-popover-remove"
                                    role="menuitem"
                                    onClick={() => void clearMessageReaction(m)}
                                  >
                                    Remove my reaction
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                          <div className="staff-chat-msg-more-wrap">
                            <button
                              type="button"
                              className="staff-chat-msg-menu-trigger"
                              aria-label="Message options"
                              aria-expanded={messageMenuOpenId === m.id}
                              aria-haspopup="menu"
                              onClick={() => toggleMessageMenu(m.id)}
                            >
                              <svg className="staff-chat-msg-menu-icon" viewBox="0 0 24 24" aria-hidden="true">
                                <circle cx="12" cy="5" r="2" fill="currentColor" />
                                <circle cx="12" cy="12" r="2" fill="currentColor" />
                                <circle cx="12" cy="19" r="2" fill="currentColor" />
                              </svg>
                            </button>
                            {messageMenuOpenId === m.id ? (
                              <div className="staff-chat-msg-menu" role="menu">
                                {m.sender_id === me.id ? (
                                  <>
                                    <button
                                      type="button"
                                      className="staff-chat-msg-menu-item"
                                      role="menuitem"
                                      onClick={() => startEdit(m)}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="staff-chat-msg-menu-item staff-chat-msg-menu-item-danger"
                                      role="menuitem"
                                      onClick={() => {
                                        setMessageMenuOpenId(null)
                                        setReactionMenuOpenId(null)
                                        void deleteOwnMessageForEveryone(m)
                                      }}
                                    >
                                      Delete for everyone
                                    </button>
                                    <button
                                      type="button"
                                      className="staff-chat-msg-menu-item"
                                      role="menuitem"
                                      onClick={() => {
                                        setMessageMenuOpenId(null)
                                        setReactionMenuOpenId(null)
                                        void deleteOwnMessageForMe(m)
                                      }}
                                    >
                                      Delete for me
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    className="staff-chat-msg-menu-item staff-chat-msg-menu-item-danger"
                                    role="menuitem"
                                    onClick={() => {
                                      setMessageMenuOpenId(null)
                                      setReactionMenuOpenId(null)
                                      void hideOthersMessage(m)
                                    }}
                                  >
                                    Hide
                                  </button>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
                </div>
              </div>
              {hiddenMessages.length > 0 ? (
                <div className="staff-chat-hidden-wrap">
                  <button
                    type="button"
                    className="staff-chat-hidden-toggle"
                    aria-expanded={hiddenOpen}
                    onClick={() => setHiddenOpen((o) => !o)}
                  >
                    Hidden for you ({hiddenMessages.length})
                  </button>
                  {hiddenOpen ? (
                    <div className="staff-chat-hidden-list" role="region" aria-label="Hidden messages">
                      <p className="staff-chat-hidden-hint">
                        Hidden from the main thread. Unhide to show a message again.
                      </p>
                      {hiddenMessages.map((hm) => (
                        <div
                          key={hm.id}
                          className={`staff-chat-hidden-row${hm.sender_id === me.id ? ' is-mine' : ''}`}
                        >
                          <div className={`staff-chat-bubble staff-chat-bubble--dimmed${hm.sender_id === me.id ? ' is-mine' : ''}`}>
                            {hm.attachment_url && hm.attachment_kind === 'image' ? (
                              <a
                                href={hm.attachment_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="staff-chat-bubble-image-wrap"
                              >
                                <img
                                  src={hm.attachment_url}
                                  alt={hm.attachment_name ?? 'Attached image'}
                                  className="staff-chat-bubble-image"
                                  onLoad={scrollThreadToBottom}
                                />
                              </a>
                            ) : null}
                            {hm.attachment_url && hm.attachment_kind === 'file' ? (
                              <a
                                href={hm.attachment_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="staff-chat-attachment-link"
                              >
                                📎 {hm.attachment_name ?? 'Download file'}
                              </a>
                            ) : null}
                            {hm.body?.trim() ? <p className="staff-chat-bubble-body">{hm.body}</p> : null}
                            <div className="staff-chat-bubble-meta">
                              <time className="staff-chat-bubble-time" dateTime={hm.created_at}>
                                {new Date(hm.created_at).toLocaleString()}
                              </time>
                              {hm.edited_at ? <span className="staff-chat-edited-flag"> · Edited</span> : null}
                            </div>
                            <StaffChatReactionPill reactions={hm.reactions} />
                          </div>
                          <button
                            type="button"
                            className="confirm-btn confirm-btn-secondary staff-chat-unhide-btn"
                            onClick={() => void unhideMessage(hm)}
                          >
                            Unhide
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <form className="staff-chat-compose" onSubmit={onSend}>
                <div className="staff-chat-compose-row">
                  <div className="staff-chat-compose-field">
                    <label className="visually-hidden" htmlFor="staff-chat-draft">
                      Message
                    </label>
                    <textarea
                      id="staff-chat-draft"
                      className="staff-chat-input"
                      rows={2}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={onComposeKeyDown}
                      placeholder="Send a message."
                      disabled={sending || fileUploading}
                    />
                    {pendingAttachment ? (
                      <div className="staff-chat-pending-attachment">
                        <span className="staff-chat-pending-attachment-name" title={pendingAttachment.name}>
                          📎 {pendingAttachment.name}
                        </span>
                        <button
                          type="button"
                          className="staff-chat-pending-attachment-remove"
                          onClick={() => setPendingAttachment(null)}
                          disabled={sending || fileUploading}
                          aria-label="Remove attached file"
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <div className="staff-chat-compose-actions">
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="visually-hidden"
                      accept={STAFF_CHAT_FILE_ACCEPT}
                      onChange={onFileSelected}
                      aria-label="Choose file or image to send"
                    />
                    <button
                      type="button"
                      className="confirm-btn staff-chat-attach"
                      onClick={onAttachClick}
                      disabled={sending || fileUploading || selectedId == null}
                    >
                      {fileUploading ? 'Uploading…' : 'Attach'}
                    </button>
                    <button
                      type="submit"
                      className="confirm-btn staff-chat-send"
                      disabled={sending || fileUploading || (!draft.trim() && !pendingAttachment)}
                    >
                      Send
                    </button>
                  </div>
                </div>
              </form>
            </>
          ) : (
            <p className="staff-chat-empty staff-chat-muted">Choose a colleague or conversation to start messaging.</p>
          )}
        </section>
      </div>
    </section>
  )
}
