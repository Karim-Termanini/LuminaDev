import type { ReactElement, ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import { ActiveJobsStrip } from './ActiveJobsStrip'
import { EnvironmentBanner } from './EnvironmentBanner'
import { OnLoginAutomationRunner } from './OnLoginAutomationRunner'
import { TopBar } from './TopBar'
import { WidgetLayoutProvider } from './WidgetLayoutContext'

type RouteStatus = 'live' | 'partial' | 'stub'

/** Keep in sync with `docs/ROUTE_STATUS.md` (nav pill is operator-facing, not marketing). */
const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', status: 'live' as RouteStatus },
  { to: '/system', label: 'Monitor', icon: 'pulse', status: 'live' as RouteStatus },
  { to: '/docker', label: 'Docker', icon: 'package', status: 'live' as RouteStatus },
  { to: '/ssh', label: 'SSH', icon: 'key', status: 'partial' as RouteStatus },
  { to: '/git-config', label: 'Git Config', icon: 'git-branch', status: 'live' as RouteStatus },
  { to: '/git-vcs', label: 'Git VCS', icon: 'source-control', status: 'partial' as RouteStatus },
  { to: '/cloud-git', label: 'Cloud Git', icon: 'github', status: 'partial' as RouteStatus },
  { to: '/registry', label: 'Registry', icon: 'package', status: 'partial' as RouteStatus },
  { to: '/profiles', label: 'Profiles', icon: 'account', status: 'partial' as RouteStatus },
  { to: '/terminal', label: 'Terminal', icon: 'terminal', status: 'live' as RouteStatus },
  { to: '/runtimes', label: 'Runtimes', icon: 'zap', status: 'live' as RouteStatus },
  { to: '/maintenance', label: 'Maintenance', icon: 'shield', status: 'live' as RouteStatus },
  { to: '/settings', label: 'Settings', icon: 'settings', status: 'partial' as RouteStatus },
] as const

const statusStyles: Record<RouteStatus, { label: string; color: string; bg: string; border: string }> = {
  live: { label: 'LIVE', color: 'var(--green)', bg: 'rgba(0, 230, 118, 0.1)', border: 'rgba(0, 230, 118, 0.25)' },
  partial: { label: 'PARTIAL', color: 'var(--yellow)', bg: 'rgba(255, 193, 7, 0.1)', border: 'rgba(255, 193, 7, 0.25)' },
  stub: { label: 'STUB', color: '#ff8a80', bg: 'rgba(255, 82, 82, 0.1)', border: 'rgba(255, 82, 82, 0.25)' },
}

function resolveCloudGitNavTarget(): string {
  try {
    const raw = window.localStorage.getItem('cloud_git_last_tab')
    const tab = raw === 'gitlab' ? 'gitlab' : 'github'
    return `/cloud-git?tab=${tab}`
  } catch {
    return '/cloud-git?tab=github'
  }
}

function resolveCloudGitTab(): 'github' | 'gitlab' {
  try {
    const raw = window.localStorage.getItem('cloud_git_last_tab')
    return raw === 'gitlab' ? 'gitlab' : 'github'
  } catch {
    return 'github'
  }
}

export function AppShell({ children }: { children: ReactNode }): ReactElement {
  const cloudGitTab = resolveCloudGitTab()
  const cloudGitTarget = resolveCloudGitNavTarget()
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <aside
        style={{
          width: 'var(--rail-width)',
          background: 'var(--bg-panel)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        <div style={{ padding: '18px 16px 12px' }}>
          <div style={{ fontWeight: 700, letterSpacing: '0.02em' }}>LuminaDev</div>
          <div
            className="mono"
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              marginTop: 4,
              textTransform: 'uppercase',
            }}
          >
            Linux session
          </div>
        </div>
        <nav style={{ flex: 1, padding: '8px 0' }}>
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to === '/cloud-git' ? cloudGitTarget : item.to}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 16px',
                color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                background: isActive ? 'rgba(124, 77, 255, 0.08)' : 'transparent',
                borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                textDecoration: 'none',
                fontWeight: isActive ? 600 : 500,
                fontSize: 14,
              })}
            >
              <span className={`codicon codicon-${item.icon}`} aria-hidden />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.to === '/cloud-git' ? (
                <span
                  className="mono"
                  title={`Last selected provider: ${cloudGitTab}`}
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    color: cloudGitTab === 'gitlab' ? '#fc6d26' : '#58a6ff',
                    border: `1px solid ${cloudGitTab === 'gitlab' ? 'rgba(252,109,38,0.35)' : 'rgba(88,166,255,0.35)'}`,
                    background: cloudGitTab === 'gitlab' ? 'rgba(252,109,38,0.1)' : 'rgba(88,166,255,0.1)',
                    borderRadius: 999,
                    padding: '2px 6px',
                  }}
                >
                  {cloudGitTab === 'gitlab' ? 'GL' : 'GH'}
                </span>
              ) : null}
              <span
                className="mono"
                title={`Route status: ${item.status}`}
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  color: statusStyles[item.status].color,
                  border: `1px solid ${statusStyles[item.status].border}`,
                  background: statusStyles[item.status].bg,
                  borderRadius: 999,
                  padding: '2px 6px',
                }}
              >
                {statusStyles[item.status].label}
              </span>
            </NavLink>
          ))}
        </nav>
        <div
          style={{
            borderTop: '1px solid var(--border)',
            padding: '12px 16px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              void window.dh.openExternal('https://github.com/')
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}
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
            style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}
          >
            <span className="codicon codicon-wand" aria-hidden />
            Setup Wizard
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <span
              className="codicon codicon-account"
              style={{ fontSize: 22, color: 'var(--text-muted)' }}
              aria-hidden
            />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Local user</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Developer</div>
            </div>
          </div>
        </div>
      </aside>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
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
