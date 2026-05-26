import type { ReactElement, ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'

import { ActiveJobsStrip } from './ActiveJobsStrip'
import { EnvironmentBanner } from './EnvironmentBanner'
import { OnLoginAutomationRunner } from './OnLoginAutomationRunner'
import { TopBar } from './TopBar'
import { WidgetLayoutProvider } from './WidgetLayoutContext'
import './AppShell.css'

type RouteStatus = 'live' | 'partial' | 'stub'

/** Keep in sync with `docs/ROUTE_STATUS.md` (nav pill is operator-facing, not marketing). */
const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', status: 'live' as RouteStatus },
  { to: '/system', label: 'Monitor', icon: 'pulse', status: 'live' as RouteStatus },
  { to: '/docker', label: 'Docker', icon: 'package', status: 'live' as RouteStatus },
  { to: '/ssh', label: 'SSH', icon: 'key', status: 'live' as RouteStatus },
  { to: '/git', label: 'Developer Git', icon: 'git-branch', status: 'live' as RouteStatus },
  { to: '/profiles', label: 'Profiles', icon: 'account', status: 'live' as RouteStatus },
  { to: '/terminal', label: 'Terminal', icon: 'terminal', status: 'live' as RouteStatus },
  { to: '/runtimes', label: 'Runtimes', icon: 'zap', status: 'live' as RouteStatus },
  { to: '/maintenance', label: 'Maintenance', icon: 'shield', status: 'live' as RouteStatus },
  { to: '/system-readiness', label: 'Readiness', icon: 'checklist', status: 'live' as RouteStatus },
  { to: '/settings', label: 'Settings', icon: 'settings', status: 'live' as RouteStatus },
] as const

const statusStyles: Record<RouteStatus, { label: string; color: string; bg: string; border: string }> = {
  live: { label: 'LIVE', color: 'var(--green)', bg: 'rgba(0, 230, 118, 0.1)', border: 'rgba(0, 230, 118, 0.25)' },
  partial: { label: 'PARTIAL', color: 'var(--yellow)', bg: 'rgba(255, 193, 7, 0.1)', border: 'rgba(255, 193, 7, 0.25)' },
  stub: { label: 'STUB', color: '#ff8a80', bg: 'rgba(255, 82, 82, 0.1)', border: 'rgba(255, 82, 82, 0.25)' },
}
export function AppShell({ children }: { children: ReactNode }): ReactElement {
  const navigate = useNavigate()
  const [profileName, setProfileName] = useState<string>('Local user')

  useEffect(() => {
    void window.dh.storeGet({ key: 'active_profile' }).then((res: unknown) => {
      const bag = res as { ok?: boolean; data?: unknown }
      if (bag.ok && typeof bag.data === 'string' && bag.data.trim()) {
        setProfileName(bag.data)
      }
    })
  }, [])

  return (
    <div className="app-shell">
      <aside className="app-shell-nav">
        <div className="app-shell-header">
          <div className="app-shell-header-title">LuminaDev</div>
          <div className="mono app-shell-header-subtitle">Linux session</div>
        </div>
        <nav className="app-shell-nav-list">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `app-shell-nav-item ${isActive ? 'active' : ''}`}
            >
              <span className={`codicon codicon-${item.icon}`} aria-hidden />
              <span className="app-shell-nav-item-label">{item.label}</span>
              <span
                className={`mono app-shell-nav-item-status ${item.status}`}
                title={`Route status: ${item.status}`}
              >
                {statusStyles[item.status].label}
              </span>
            </NavLink>
          ))}
        </nav>
        <div className="app-shell-footer">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              void window.dh.openExternal('https://github.com/')
            }}
            className="app-shell-footer-link"
          >
            <span className="codicon codicon-book" aria-hidden />
            Docs
          </a>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              void window.dh.storeSet({
                key: 'wizard_state',
                data: { completed: false, showOnStartup: true, stepIndex: 0 },
              })
                .then(() => window.location.reload())
            }}
            className="app-shell-footer-link"
          >
            <span className="codicon codicon-wand" aria-hidden />
            Setup Wizard
          </a>
          <div
            className="app-shell-profile-section"
            onClick={() => navigate('/profiles')}
            role="button"
            tabIndex={0}
            aria-label="Switch profile"
            onKeyDown={(e) => { if (e.key === 'Enter') navigate('/profiles') }}
          >
            <div className="app-shell-profile-avatar">
              <span className="codicon codicon-account" aria-hidden />
            </div>
            <div className="app-shell-profile-info">
              <div className="app-shell-profile-name">{profileName}</div>
              <div className="app-shell-profile-session">Switch Profile ›</div>
            </div>
          </div>
        </div>
      </aside>
      <div className="app-shell-main">
        <WidgetLayoutProvider>
          <OnLoginAutomationRunner />
          <EnvironmentBanner />
          <TopBar />
          <main style={{ flex: 1, overflow: 'auto', padding: 24 }}>{children}</main>
          <ActiveJobsStrip />
        </WidgetLayoutProvider>
      </div>
    </div>
  )
}
