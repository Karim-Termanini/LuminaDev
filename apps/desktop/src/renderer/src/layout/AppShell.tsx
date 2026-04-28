import type { ReactElement, ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import { ActiveJobsStrip } from './ActiveJobsStrip'
import { EnvironmentBanner } from './EnvironmentBanner'
import { TopBar } from './TopBar'
import { WidgetLayoutProvider } from './WidgetLayoutContext'

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/system', label: 'System', icon: 'server' },
  { to: '/workstation', label: 'Workstation', icon: 'device-desktop' },
  { to: '/docker', label: 'Docker', icon: 'package' },
  { to: '/ssh', label: 'SSH', icon: 'key' },
  { to: '/git-config', label: 'Git Config', icon: 'git-branch' },
  { to: '/registry', label: 'Registry', icon: 'package' },
  { to: '/profiles', label: 'Profiles', icon: 'account' },
  { to: '/terminal', label: 'Terminal', icon: 'terminal' },
] as const

export function AppShell({ children }: { children: ReactNode }): ReactElement {
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
          <div style={{ fontWeight: 700, letterSpacing: '0.02em' }}>HypeDev</div>
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
              to={item.to}
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
              {item.label}
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
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'var(--text-muted)',
              fontSize: 13,
            }}
          >
            <span className="codicon codicon-book" aria-hidden />
            Docs
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
          <EnvironmentBanner />
          <TopBar />
          <main style={{ flex: 1, overflow: 'auto', padding: 24 }}>{children}</main>
          <ActiveJobsStrip />
        </WidgetLayoutProvider>
      </div>
    </div>
  )
}
