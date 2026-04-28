import type { CSSProperties, ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

const titles: Record<string, string> = {
  '/system': 'System',
  '/workstation': 'Workstation',
  '/docker': 'Docker',
  '/ssh': 'SSH',
  '/git-config': 'Git Config',
  '/registry': 'Registry',
  '/profiles': 'Profiles',
  '/terminal': 'Terminal',
}

function screenTitle(pathname: string): string {
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    return 'HYPEDEVHOME'
  }
  return titles[pathname] ?? 'Linux Dev Home'
}

export function TopBar(): ReactElement {
  const location = useLocation()
  const pathname = location.pathname
  const [q, setQ] = useState('')

  useEffect(() => {
    setQ('')
  }, [pathname])

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
      }}
    >
      <div style={{ fontWeight: 700, letterSpacing: '0.04em', minWidth: 140 }}>{screenTitle(pathname)}</div>
      <div style={{ display: 'flex', gap: 2, flex: 1, justifyContent: 'center' }}>
        {onDashboard ? (
          <>
            <DashTab to="/dashboard" end label="Main" />
            <DashTab to="/dashboard/widgets" label="Widget" />
            <DashTab to="/dashboard/kernels" label="Kernels" />
            <DashTab to="/dashboard/logs" label="Logs" />
          </>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Overview</span>
        )}
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search workstation..."
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
      <button type="button" aria-label="Notifications" style={btnIcon}>
        <span className="codicon codicon-bell" />
      </button>
      <button type="button" aria-label="Console" style={btnIcon}>
        <span className="codicon codicon-terminal" />
      </button>
      <button type="button" aria-label="Settings" style={btnIcon}>
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
