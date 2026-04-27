import axios from 'axios'

export const API_ORIGIN = `http://${window.location.hostname}:8000`
const API_BASE_URL = `${API_ORIGIN}/api`
const AUTH_USERNAME_STORAGE_KEY = 'auth_username'
const AUTH_LOGOUT_EVENT = 'auth:logout'

type LogoutEventDetail = { reason: 'unauthorized' | 'manual' }

let didBroadcastLogout = false

function broadcastLogout(reason: LogoutEventDetail['reason']) {
  if (didBroadcastLogout) return
  didBroadcastLogout = true
  window.dispatchEvent(new CustomEvent<LogoutEventDetail>(AUTH_LOGOUT_EVENT, { detail: { reason } }))
}

export function onAuthLogout(handler: (detail: LogoutEventDetail) => void) {
  const listener = (event: Event) => handler((event as CustomEvent<LogoutEventDetail>).detail)
  window.addEventListener(AUTH_LOGOUT_EVENT, listener)
  return () => window.removeEventListener(AUTH_LOGOUT_EVENT, listener)
}

export const api = axios.create({
  baseURL: API_BASE_URL,
})

export type LoginResponse = {
  access: string
  refresh: string
}

export const authApi = axios.create({
  baseURL: API_BASE_URL,
})

let refreshPromise: Promise<string | null> | null = null

const PROACTIVE_REFRESH_SKEW_MS = 2 * 60 * 1000

/** `exp` claim in seconds, or null if missing/unparseable. */
function getJwtAccessExpMs(token: string): number | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : ''
    const payload = JSON.parse(atob(b64 + pad)) as { exp?: unknown }
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

function shouldProactivelyRefreshAccessToken(): boolean {
  const access = localStorage.getItem('access_token')
  const refresh = localStorage.getItem('refresh_token')
  if (!access || !refresh) return false
  const exp = getJwtAccessExpMs(access)
  if (exp == null) return false
  return exp - PROACTIVE_REFRESH_SKEW_MS < Date.now()
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refresh_token')
  if (!refreshToken) return null

  if (!refreshPromise) {
    refreshPromise = authApi
      .post<{ access: string }>('/auth/refresh/', { refresh: refreshToken })
      .then((response) => {
        const nextAccess = response.data.access
        localStorage.setItem('access_token', nextAccess)
        return nextAccess
      })
      .catch(() => {
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem(AUTH_USERNAME_STORAGE_KEY)
        return null
      })
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

api.interceptors.request.use(async (config) => {
  if (shouldProactivelyRefreshAccessToken()) {
    await refreshAccessToken()
  }
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const originalRequest = error.config as (typeof error.config & { _retry?: boolean }) | undefined
      const isAuthRoute = originalRequest?.url?.includes('/auth/login/') || originalRequest?.url?.includes('/auth/refresh/')

      if (originalRequest && !originalRequest._retry && !isAuthRoute) {
        originalRequest._retry = true
        const nextAccess = await refreshAccessToken()
        if (nextAccess) {
          originalRequest.headers = originalRequest.headers ?? {}
          originalRequest.headers.Authorization = `Bearer ${nextAccess}`
          return api(originalRequest)
        }
      }

      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem(AUTH_USERNAME_STORAGE_KEY)
      broadcastLogout('unauthorized')
    }
    return Promise.reject(error)
  },
)

export async function login(username: string, password: string): Promise<LoginResponse> {
  const response = await authApi.post<LoginResponse>('/auth/login/', { username, password })
  localStorage.setItem('access_token', response.data.access)
  localStorage.setItem('refresh_token', response.data.refresh)
  localStorage.setItem(AUTH_USERNAME_STORAGE_KEY, username)
  didBroadcastLogout = false
  return response.data
}

export function logout() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem(AUTH_USERNAME_STORAGE_KEY)
  broadcastLogout('manual')
}

export function isAuthenticated(): boolean {
  return Boolean(localStorage.getItem('access_token'))
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status
    const data = error.response?.data
    if (typeof data === 'string') {
      const trimmed = data.trimStart()
      if (trimmed.startsWith('<!') || trimmed.includes('<!DOCTYPE') || data.length > 600) {
        return status
          ? `Something went wrong on the server (${status}). If you are a developer, check the backend terminal or logs.`
          : 'Something went wrong on the server. Check the backend terminal or logs.'
      }
      return data
    }
    if (data?.detail && typeof data.detail === 'string') {
      return data.detail
    }
    if (data && typeof data === 'object') {
      const firstValue = Object.values(data)[0]
      if (Array.isArray(firstValue) && firstValue[0]) {
        return String(firstValue[0])
      }
    }
    return error.message
  }
  return 'Unexpected error occurred.'
}

export type MeResponse = {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  password_hashed: string
  last_login: string | null
  is_staff: boolean
  is_superuser: boolean
  is_active: boolean
  date_joined: string
  photo_url: string | null
  /** Total unread peer messages across all staff chat threads (0 for non-staff). */
  staff_chat_unread_total: number
}

/** Ask shell (and any listener) to refresh `staff_chat_unread_total` via `/me/`. Debounce in AppShell. */
export function requestStaffChatUnreadRefresh() {
  window.dispatchEvent(new CustomEvent('staff-chat-unread-refresh'))
}

export type MeUpdatePayload = {
  username?: string
  email?: string
  first_name?: string
  last_name?: string
  password?: string
  is_active?: boolean
}

export type RegistrarAccountCreatePayload = {
  username: string
  email?: string
  first_name?: string
  last_name?: string
  password: string
  is_active?: boolean
}

export type RegistrarAccountResponse = {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  is_staff: boolean
  is_superuser: boolean
  is_active: boolean
}

export async function fetchMe(): Promise<MeResponse> {
  const response = await api.get<MeResponse>('/me/')
  return response.data
}

/** Staff/superuser only: record real UI activity for peer presence (not used by session polling). */
export async function postStaffActivityTouch(): Promise<void> {
  await api.post('/me/staff-activity/')
}

/** Mark staff chat presence offline (sidebar logout or unload); no-op for non-staff. */
export async function markStaffChatOfflinePresence(): Promise<void> {
  await api.post('/me/staff-chat-offline/')
}

export async function updateMe(payload: MeUpdatePayload): Promise<MeResponse> {
  const response = await api.patch<MeResponse>('/me/', payload)
  return response.data
}

type ProfilePhotoResponse = { username: string; photo_url: string | null }

export async function uploadMyProfilePhoto(file: File): Promise<ProfilePhotoResponse> {
  const formData = new FormData()
  formData.append('photo', file)
  const response = await api.post<ProfilePhotoResponse>('/me/profile-photo/', formData)
  return response.data
}

export async function removeMyProfilePhoto(): Promise<ProfilePhotoResponse> {
  const response = await api.delete<ProfilePhotoResponse>('/me/profile-photo/')
  return response.data
}

export async function logoutAllDevices(): Promise<void> {
  await api.post('/auth/logout-all/')
}

export async function createRegistrarAccount(payload: RegistrarAccountCreatePayload): Promise<RegistrarAccountResponse> {
  const response = await api.post<RegistrarAccountResponse>('/auth/registrar-accounts/', payload)
  return response.data
}

export function getStaffChatWebSocketUrl(accessToken: string): string {
  const base = new URL(API_ORIGIN)
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
  base.pathname = '/ws/staff-chat/'
  base.search = `token=${encodeURIComponent(accessToken)}`
  return base.toString()
}

export type StaffChatPresence = 'online' | 'away' | 'offline'

export type StaffChatPeer = {
  id: number
  username: string
  first_name: string
  last_name: string
  photo_url: string | null
  presence: StaffChatPresence
  /** ISO 8601 timestamp from server; used for live presence without polling. */
  last_activity_at: string | null
}

export type StaffChatLastMessage = {
  body: string
  created_at: string
  sender_id: number
} | null

export type StaffChatConversationSummary = {
  id: number
  other_user: StaffChatPeer
  last_message: StaffChatLastMessage
  updated_at: string
  unread_count: number
}

export type StaffChatMessageReactionRow = {
  user_id: number
  emoji: string
}

export type StaffChatMessage = {
  id: number
  conversation: number
  sender_id: number
  sender_username?: string
  sender_first_name?: string
  sender_last_name?: string
  body: string
  created_at: string
  edited_at: string | null
  attachment_url: string | null
  attachment_kind: 'image' | 'file' | null
  attachment_name: string | null
  reactions: StaffChatMessageReactionRow[]
}

export async function fetchStaffChatPeers(): Promise<StaffChatPeer[]> {
  const response = await api.get<StaffChatPeer[]>('/staff-chat/peers/')
  return response.data
}

export async function fetchStaffChatConversations(): Promise<StaffChatConversationSummary[]> {
  const response = await api.get<StaffChatConversationSummary[]>('/staff-chat/conversations/')
  return response.data
}

export async function openStaffChatConversation(otherUserId: number): Promise<{ created: boolean; conversation: StaffChatConversationSummary }> {
  const response = await api.post<{ created: boolean; conversation: StaffChatConversationSummary }>('/staff-chat/conversations/', {
    other_user: otherUserId,
  })
  return response.data
}

export async function fetchStaffChatMessages(conversationId: number, limit = 80): Promise<StaffChatMessage[]> {
  const response = await api.get<StaffChatMessage[]>(`/staff-chat/conversations/${conversationId}/messages/`, {
    params: { limit },
  })
  return response.data
}

export async function fetchStaffChatHiddenMessages(conversationId: number, limit = 80): Promise<StaffChatMessage[]> {
  const response = await api.get<StaffChatMessage[]>(
    `/staff-chat/conversations/${conversationId}/messages/hidden/`,
    { params: { limit } },
  )
  return response.data
}

export async function sendStaffChatMessage(conversationId: number, body: string): Promise<StaffChatMessage> {
  const response = await api.post<StaffChatMessage>(`/staff-chat/conversations/${conversationId}/messages/`, { body })
  return response.data
}

export async function sendStaffChatMessageWithFile(
  conversationId: number,
  file: File,
  body?: string,
): Promise<StaffChatMessage> {
  const formData = new FormData()
  formData.append('attachment', file)
  if (body?.trim()) {
    formData.append('body', body.trim())
  }
  const response = await api.post<StaffChatMessage>(
    `/staff-chat/conversations/${conversationId}/messages/`,
    formData,
  )
  return response.data
}

export async function markStaffChatConversationRead(conversationId: number): Promise<void> {
  await api.post(`/staff-chat/conversations/${conversationId}/read/`)
}

export async function patchStaffChatMessage(
  conversationId: number,
  messageId: number,
  payload: { body?: string; remove_attachment?: boolean },
): Promise<StaffChatMessage> {
  const response = await api.patch<StaffChatMessage>(
    `/staff-chat/conversations/${conversationId}/messages/${messageId}/`,
    payload,
  )
  return response.data
}

export type StaffChatDeleteScope = 'everyone' | 'self'

export async function deleteStaffChatMessage(
  conversationId: number,
  messageId: number,
  options?: { scope?: StaffChatDeleteScope },
): Promise<void> {
  await api.delete(`/staff-chat/conversations/${conversationId}/messages/${messageId}/`, {
    params: options?.scope === 'self' ? { scope: 'self' } : {},
  })
}

export async function unhideStaffChatMessage(conversationId: number, messageId: number): Promise<StaffChatMessage> {
  const response = await api.post<StaffChatMessage>(
    `/staff-chat/conversations/${conversationId}/messages/${messageId}/unhide/`,
  )
  return response.data
}

export async function setStaffChatMessageReaction(
  conversationId: number,
  messageId: number,
  emoji: string,
): Promise<StaffChatMessage> {
  const response = await api.post<StaffChatMessage>(
    `/staff-chat/conversations/${conversationId}/messages/${messageId}/reaction/`,
    { emoji },
  )
  return response.data
}

export async function clearStaffChatMessageReaction(
  conversationId: number,
  messageId: number,
): Promise<StaffChatMessage> {
  const response = await api.delete<StaffChatMessage>(
    `/staff-chat/conversations/${conversationId}/messages/${messageId}/reaction/`,
  )
  return response.data
}
