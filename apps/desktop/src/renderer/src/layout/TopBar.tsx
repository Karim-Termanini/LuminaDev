import type { CSSProperties, ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { JobSummary } from '@linux-dev-home/shared'

export function TopBar(): ReactElement {
  const { t } = useTranslation('nav')
  const location = useLocation()
  const navigate = useNavigate()
  const pathname = location.pathname
  const [q, setQ] = useState('')

  const titles: Record<string, string> = {
    '/system': t('topbar.system'),
    '/workstation': t('topbar.workstation'),
    '/docker': t('topbar.docker'),
    '/ssh': t('topbar.ssh'),
    '/git': t('topbar.git'),
    '/profiles': t('topbar.profiles'),
    '/terminal': t('topbar.terminal'),
    '/runtimes': t('topbar.runtimes'),
    '/maintenance': t('topbar.maintenance'),
    '/settings': t('topbar.settings'),
  }
  const [showNotifications, setShowNotifications] = useState(false)
  const [jobs, setJobs] = useState<JobSummary[]>([])

  useEffect(() => {
    setQ('')
    setShowNotifications(false)

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowNotifications(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [pathname])

  useEffect(() => {
    if (!showNotifications) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowNotifications(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showNotifications])

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const res = await window.dh.jobsList()
        if (Array.isArray(res)) setJobs(res)
      } catch {
        // ignore
      }
    }
    void fetchJobs()
    const id = setInterval(() => void fetchJobs(), 3000)
    return () => clearInterval(id)
  }, [])

  const onDashboard = pathname === '/dashboard' || pathname.startsWith('/dashboard/')

  return (
    <header
      style={{
        minHeight: 'var(--top-height)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: 16,
        background: 'var(--bg-panel)',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      <div style={{ fontWeight: 700, letterSpacing: '0.04em', minWidth: 140 }}>{pathname === '/dashboard' || pathname.startsWith('/dashboard/') ? t('topbar.dashboardTitle') : (titles[pathname] ?? t('topbar.linuxDevHome'))}</div>
      <div style={{ display: 'flex', gap: 2, flex: 1, justifyContent: 'center' }}>
        {onDashboard ? (
          <>
            <DashTab to="/dashboard" end label={t('topbar.main')} />
            <DashTab to="/dashboard/kernels" label={t('topbar.kernels')} />
            <DashTab to="/dashboard/logs" label={t('topbar.logs')} />
          </>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('topbar.overview')}</span>
        )}
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('topbar.searchPlaceholder')}
        className="hp-search-input"
        style={{
          width: 220,
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '6px 10px',
          color: 'var(--text)',
          fontSize: 13,
        }}
      />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', direction: 'ltr' }}>
        <button
          type="button"
          aria-label="Notifications"
          aria-expanded={showNotifications}
          aria-haspopup="dialog"
          style={{
            ...btnIcon,
            color: showNotifications || jobs.some(j => j.state === 'running') ? 'var(--accent)' : 'var(--text-muted)',
            position: 'relative',
          }}
          onClick={() => setShowNotifications(!showNotifications)}
        >
          <span className="codicon codicon-bell" />
          {jobs.some(j => j.state === 'running') && (
            <span style={{
              position: 'absolute',
              top: 4,
              right: 4,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--accent)',
              boxShadow: '0 0 4px var(--accent)',
            }} />
          )}
        </button>

        {showNotifications && (
          <div
            role="dialog"
            aria-labelledby="notifications-title"
            style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: 8,
            width: 320,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            padding: 12,
          }}>
            <div style={{ fontWeight: 600, borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span id="notifications-title">{t('topbar.notifications')}</span>
              <button
                type="button"
                onClick={() => setShowNotifications(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <span className="codicon codicon-close" style={{ fontSize: 12 }} />
              </button>
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {jobs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>
                  {t('topbar.noActivity')}
                </div>
              ) : (
                jobs.slice(-5).reverse().map((j) => (
                  <div key={j.id} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ fontWeight: 500, color: 'var(--text)' }}>{j.kind.replace(/_/g, ' ')}</span>
                      <span style={{
                        fontSize: 10,
                        color: j.state === 'running' ? 'var(--yellow)' : j.state === 'completed' ? 'var(--green)' : 'var(--red)',
                      }}>
                        {j.state.toUpperCase()}
                      </span>
                    </div>
                    {j.state === 'running' && (
                      <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
                        <div style={{ width: `${Math.min(100, Math.max(0, j.progress ?? 0))}%`, height: '100%', background: 'var(--accent)' }} />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label="Console"
        style={btnIcon}
        onClick={() => navigate('/terminal')}
      >
        <span className="codicon codicon-terminal" />
      </button>
      <button
        type="button"
        aria-label="Settings"
        style={btnIcon}
        onClick={() => navigate('/settings')}
      >
        <span className="codicon codicon-gear" />
      </button>
    </header>
  )
}

function DashTab(props: { to: string; end?: boolean; label: string }): ReactElement {
  return (
    <NavLink
      to={props.to}
      end={props.end}
      style={({ isActive }) => ({
        border: 'none',
        background: 'none',
        color: isActive ? 'var(--text)' : 'var(--text-muted)',
        fontWeight: isActive ? 600 : 500,
        borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        padding: '10px 12px',
        cursor: 'pointer',
        fontSize: 13,
        textDecoration: 'none',
      })}
    >
      {props.label}
    </NavLink>
  )
}

const btnIcon: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: 6,
  borderRadius: 6,
}
