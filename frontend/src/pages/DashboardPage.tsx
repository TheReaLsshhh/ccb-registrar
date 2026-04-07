import { ComponentType, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { api, getErrorMessage } from '../api'
import { AdminIcon, ContinuingIcon, DashboardIcon, EnrollmentIcon, ProspectusIcon, StaffChatIcon, TranscriptIcon } from '../components/Icons'

type RecentMenu = {
  path: string
  label: string
}

type AuditLog = {
  id: number
  action: string
  entity: string
  entity_id: string
  actor_username: string | null
  created_at: string
}

const iconMap: Record<string, ComponentType> = {
  Dashboard: DashboardIcon,
  Admin: AdminIcon,
  Prospectus: ProspectusIcon,
  Enrollment: EnrollmentIcon,
  Continuing: ContinuingIcon,
  'Staff chat': StaffChatIcon,
  'Staff Chat': StaffChatIcon,
  Transcript: TranscriptIcon,
  'Edit Profile': AdminIcon,
}

const RECENT_MENU_KEY = 'ccb_recent_menus'

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function DashboardPage() {
  const [recentMenus, setRecentMenus] = useState<RecentMenu[]>([])
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_MENU_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as RecentMenu[]
      setRecentMenus(parsed)
    } catch {
      setRecentMenus([])
    }
  }, [])

  useEffect(() => {
    api
      .get<AuditLog[]>('/audit-logs/')
      .then((response) => setLogs(response.data.slice(0, 20)))
      .catch((err) => setError(getErrorMessage(err)))
  }, [])

  const quickActions = useMemo(() => {
    if (recentMenus.length) return recentMenus
    return [
      { path: '/admin', label: 'Admin' },
      { path: '/prospectus', label: 'Prospectus' },
      { path: '/enrollment', label: 'Enrollment' },
      { path: '/continuing', label: 'Continuing' },
      { path: '/profile', label: 'Edit Profile' },
    ]
  }, [recentMenus])

  return (
    <section className="card">
      <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <DashboardIcon /> Dashboard
      </h1>
      <p>Welcome to the City College of Bayawan Local Registrar System.</p>

      <h2 className="section-title">Recently Used Menus</h2>
      <div className="dashboard-actions">
        {quickActions.map((item) => {
          const Icon = iconMap[item.label]
          return (
            <Link key={item.path} to={item.path} className="dashboard-action-btn">
              {Icon && <Icon />}
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>

      <h2 className="section-title">Activity Logs</h2>
      {error && <p className="error-text">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>User</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Entity ID</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{formatDateTime(log.created_at)}</td>
                <td>{log.actor_username ?? 'System'}</td>
                <td>{log.action}</td>
                <td>{log.entity}</td>
                <td>{log.entity_id}</td>
              </tr>
            ))}
            {!logs.length && (
              <tr>
                <td colSpan={5}>No logs yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
