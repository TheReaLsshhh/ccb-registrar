import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { api, getErrorMessage } from '../api'
import { DashboardIcon } from '../components/Icons'

type AuditLog = {
  id: number
  action: string
  entity: string
  entity_id: string
  actor_username: string | null
  created_at: string
}

type PaginatedAuditLogs = {
  count: number
  next: string | null
  previous: string | null
  results: AuditLog[]
}

const AUDIT_LOG_PAGE_SIZE = 20

type AcademicTerm = {
  id: number
  year_label: string
  semester: number
  is_active: boolean
}

type DuplicateReportStudent = {
  student_id: string
  student_name: string
  history_count: number
  ay_trim?: string
  semester?: number
  histories?: unknown[]
}

type DuplicateReport = {
  duplicate_student_count: number
  students: DuplicateReportStudent[]
}

/** Matches AppShell primary routes; staff chat uses `/chat` (see `main.tsx`). */
const DASHBOARD_QUICK_LINKS: { to: string; label: string }[] = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/admin', label: 'Admin' },
  { to: '/prospectus', label: 'Prospectus' },
  { to: '/enrollment', label: 'Enrollment' },
  { to: '/continuing', label: 'Continuing' },
  { to: '/transcript', label: 'Transcript' },
  { to: '/chat', label: 'Staff chat' },
  { to: '/profile', label: 'Edit profile' },
]

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatTermSemester(semester: number): string {
  if (semester === 1) return '1st Semester'
  if (semester === 2) return '2nd Semester'
  if (semester === 3) return 'Summer'
  return `Sem ${semester}`
}

function formatAuditAction(action: string): string {
  return action.replace(/_/g, ' ')
}

function getAuditActionTone(action: string): string {
  const normalizedAction = action.toLowerCase()

  if (normalizedAction.includes('folder_status')) return 'is-status'
  if (normalizedAction.includes('auto_load')) return 'is-automation'
  if (normalizedAction.includes('copy')) return 'is-copy'
  if (normalizedAction.includes('promote')) return 'is-promote'
  if (normalizedAction.includes('delete')) return 'is-danger'
  if (normalizedAction.includes('create')) return 'is-success'
  if (normalizedAction.includes('update')) return 'is-info'

  return 'is-default'
}

export function DashboardPage() {
  const [auditLogPage, setAuditLogPage] = useState(1)
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [logsTotalCount, setLogsTotalCount] = useState<number | null>(null)
  const [logsLoading, setLogsLoading] = useState(true)
  const [logsError, setLogsError] = useState('')
  const activityScrollRef = useRef<HTMLDivElement>(null)

  const [terms, setTerms] = useState<AcademicTerm[]>([])
  const [departmentCount, setDepartmentCount] = useState<number | null>(null)
  const [programCount, setProgramCount] = useState<number | null>(null)
  const [sectionCount, setSectionCount] = useState<number | null>(null)
  const [subjectCount, setSubjectCount] = useState<number | null>(null)
  const [duplicateReport, setDuplicateReport] = useState<DuplicateReport | null>(null)
  const [statsError, setStatsError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLogsLoading(true)
    setLogsError('')
    api
      .get<PaginatedAuditLogs>('/audit-logs/', {
        params: { page: auditLogPage, page_size: AUDIT_LOG_PAGE_SIZE },
      })
      .then((response) => {
        if (cancelled) return
        const body = response.data
        if (Array.isArray(body)) {
          setLogs(body as AuditLog[])
          setLogsTotalCount((body as AuditLog[]).length)
        } else {
          setLogs(body.results ?? [])
          setLogsTotalCount(typeof body.count === 'number' ? body.count : 0)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLogsError(getErrorMessage(err))
          setLogs([])
          setLogsTotalCount(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLogsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [auditLogPage])

  useEffect(() => {
    activityScrollRef.current?.scrollTo({ top: 0 })
  }, [auditLogPage])

  useEffect(() => {
    let cancelled = false
    const loadStats = async () => {
      setStatsError('')
      try {
        const [deptResp, progResp, secResp, subjResp, termResp, dupResp] = await Promise.all([
          api.get<{ id: number }[]>('/departments/'),
          api.get<{ id: number }[]>('/programs/'),
          api.get<{ id: number }[]>('/sections/'),
          api.get<{ id: number }[]>('/subjects/'),
          api.get<AcademicTerm[]>('/terms/'),
          api.get<DuplicateReport>('/academic-history/duplicate-students-report/').catch(() => ({
            data: { duplicate_student_count: 0, students: [] as DuplicateReportStudent[] },
          })),
        ])
        if (cancelled) return
        setDepartmentCount(deptResp.data.length)
        setProgramCount(progResp.data.length)
        setSectionCount(secResp.data.length)
        setSubjectCount(subjResp.data.length)
        setTerms(termResp.data)
        setDuplicateReport(dupResp.data)
      } catch (err) {
        if (!cancelled) setStatsError(getErrorMessage(err))
      }
    }
    void loadStats()
    return () => {
      cancelled = true
    }
  }, [])

  const activeTerms = useMemo(() => terms.filter((t) => t.is_active), [terms])

  const statTiles = useMemo(
    () => [
      { label: 'Departments', value: departmentCount },
      { label: 'Programs', value: programCount },
      { label: 'Sections', value: sectionCount },
      { label: 'Subjects', value: subjectCount },
      { label: 'Academic terms', value: terms.length },
    ],
    [departmentCount, programCount, sectionCount, subjectCount, terms.length],
  )

  const auditLogTotalPages =
    logsTotalCount != null ? Math.max(1, Math.ceil(logsTotalCount / AUDIT_LOG_PAGE_SIZE)) : 1

  return (
    <section className="card dashboard-page">
      <header className="dashboard-page-header">
        <h1 className="dashboard-page-title">
          <DashboardIcon aria-hidden />
          <span>Dashboard</span>
        </h1>
        <p className="dashboard-page-lede">City College of Bayawan — Local Registrar System</p>
      </header>

      <p className="workflow-route-hint">
        Typical registrar flow: <strong>Admin</strong> (structure and terms) → <strong>Prospectus</strong> (subjects and mappings) →{' '}
        <strong>Enrollment</strong> (new students and loads) → <strong>Continuing</strong> (returning cohorts). Use <strong>Transcript</strong>{' '}
        for read-only TOR lookup. Counts and the audit feed are read-only on this page; use the modules (or <strong>Quick Links</strong> in
        the snapshot) to work in each area.
      </p>

      <div className="dashboard-main-grid">
        <div className="dashboard-menus-block">
          <section
            className="dashboard-snapshot dashboard-activity-section"
            aria-labelledby="dashboard-activity-heading"
          >
            <div className="dashboard-activity-header">
              <h2 id="dashboard-activity-heading" className="section-title dashboard-section-title">
                Recent Activity
              </h2>
              <p className="dashboard-activity-lede">
                Full audit log (read-only), newest first. Scroll the current page; use pagination for older entries.
              </p>
            </div>
            {logsError ? <p className="error-text">{logsError}</p> : null}

            {logsLoading && !logsError ? <p className="dashboard-activity-empty">Loading audit log…</p> : null}

            {!logsLoading && !logs.length && !logsError ? (
              <p className="dashboard-activity-empty">No audit entries yet.</p>
            ) : null}

            {!logsLoading && logs.length > 0 ? (
              <>
                <div
                  ref={activityScrollRef}
                  className="dashboard-activity-feed-scroll"
                  role="region"
                  aria-label={`Audit log entries, page ${auditLogPage} of ${auditLogTotalPages}`}
                  tabIndex={0}
                >
                  <ul className="dashboard-activity-feed">
                    {logs.map((log) => (
                      <li key={log.id} className="dashboard-activity-item">
                        <div className="dashboard-activity-time">{formatDateTime(log.created_at)}</div>
                        <div className="dashboard-activity-body">
                          <span className={`dashboard-activity-action ${getAuditActionTone(log.action)}`}>
                            {formatAuditAction(log.action)}
                          </span>
                          <span className="dashboard-activity-meta">
                            <span className="dashboard-activity-entity">
                              {log.entity} <span className="dashboard-activity-id">#{log.entity_id}</span>
                            </span>
                            <span className="dashboard-activity-actor">{log.actor_username ?? 'System'}</span>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {logsTotalCount != null && logsTotalCount > 0 ? (
                  <nav className="dashboard-activity-pagination" aria-label="Audit log pagination">
                    <button
                      type="button"
                      className="dashboard-activity-page-btn"
                      disabled={auditLogPage <= 1 || logsLoading}
                      onClick={() => setAuditLogPage((p) => Math.max(1, p - 1))}
                    >
                      ◀️
                    </button>
                    <span className="dashboard-activity-page-indicator">
                      Page {auditLogPage} of {auditLogTotalPages}
                      <span className="dashboard-activity-page-meta">
                        ({logsTotalCount.toLocaleString()} {logsTotalCount === 1 ? 'entry' : 'entries'})
                      </span>
                    </span>
                    <button
                      type="button"
                      className="dashboard-activity-page-btn"
                      disabled={auditLogPage >= auditLogTotalPages || logsLoading}
                      onClick={() => setAuditLogPage((p) => Math.min(auditLogTotalPages, p + 1))}
                    >
                      ▶️
                    </button>
                  </nav>
                ) : null}
              </>
            ) : null}
          </section>
        </div>

        <aside className="dashboard-snapshot" aria-label="Registrar snapshot read-only">
          <h2 className="section-title dashboard-section-title">Registrar snapshot</h2>
          <p className="dashboard-snapshot-lede">Live counts from the server (read-only).</p>
          {statsError ? <p className="error-text dashboard-snapshot-error">{statsError}</p> : null}

          <div className="dashboard-stat-tiles">
            {statTiles.map((tile) => (
              <div key={tile.label} className="dashboard-stat-tile">
                <span className="dashboard-stat-value">{tile.value === null ? '—' : tile.value}</span>
                <span className="dashboard-stat-label">{tile.label}</span>
              </div>
            ))}
          </div>

          <div className={`dashboard-active-term ${activeTerms.length ? 'is-ok' : 'is-muted'}`}>
            <div className="dashboard-active-term-label">Active term (enrollment / auto-load)</div>
            {activeTerms.length ? (
              <ul className="dashboard-active-term-list">
                {activeTerms.map((t) => (
                  <li key={t.id}>
                    <strong>{t.year_label}</strong> · {formatTermSemester(t.semester)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dashboard-active-term-empty">None marked active — set one under Admin → Create Academic Term.</p>
            )}
          </div>

          {duplicateReport ? (
            <div
              className={`dashboard-dup-panel ${duplicateReport.duplicate_student_count > 0 ? 'is-warn' : 'is-ok'}`}
              role="status"
            >
              <div className="dashboard-dup-title">Academic history key check</div>
              {duplicateReport.duplicate_student_count > 0 ? (
                <>
                  <p className="dashboard-dup-body">
                    <strong>{duplicateReport.duplicate_student_count}</strong> duplicate <strong>term group(s)</strong> (same student,
                    trimmed school year, and semester with multiple history rows). Run backend <code>dedupe_academic_history</code> or fix in
                    the database if shown.
                  </p>
                  <ul className="dashboard-dup-list">
                    {duplicateReport.students.slice(0, 6).map((s) => (
                      <li key={`${s.student_id}-${s.ay_trim ?? ''}-${s.semester ?? ''}`}>
                        <code>{s.student_id}</code>
                        {s.student_name ? ` — ${s.student_name}` : ''}
                        <span className="dashboard-dup-meta">
                          {' '}
                          · {s.ay_trim ?? '?'} /{' '}
                          {s.semester != null ? formatTermSemester(s.semester) : '-'} ({s.history_count} rows)
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="dashboard-dup-body">No duplicate (student, school year, semester) groups reported in the current check.</p>
              )}
            </div>
          ) : null}

          <nav className="dashboard-quick-links" aria-label="Quick links to registrar modules">
            <h3 className="dashboard-quick-links-heading">Quick Links</h3>
            <div className="dashboard-quick-links-rule" aria-hidden="true" />
            <div className="dashboard-quick-links-actions">
              {DASHBOARD_QUICK_LINKS.map((item) => (
                <Link key={item.to} to={item.to} className="dashboard-quick-link-btn">
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </aside>
      </div>
    </section>
  )
}
