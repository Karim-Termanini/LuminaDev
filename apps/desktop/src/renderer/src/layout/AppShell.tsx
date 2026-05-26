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

  useEffect(() => {
    const ACTION_ROUTES: Record<string, string> = {
      open_terminal: '/terminal',
      go_dashboard: '/dashboard',
      go_docker: '/docker',
      go_git: '/git',
      go_system: '/system',
      go_profiles: '/profiles',
      go_runtimes: '/runtimes',
      go_maintenance: '/maintenance',
      go_settings: '/settings',
    }
    let bindings: Record<string, string> = {}

    const refreshBindings = (): void => {
      void window.dh.storeGet({ key: 'shortcuts_settings' }).then((res: unknown) => {
        const bag = res as { ok?: boolean; data?: unknown }
        if (bag.ok && bag.data && typeof bag.data === 'object') {
          bindings = bag.data as Record<string, string>
        }
      })
    }

    refreshBindings()
    const onShortcutsUpdated = (): void => refreshBindings()

    const onKey = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in a text field
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      
      const parts: string[] = []
      // Standardize modifier order: Ctrl+Alt+Shift+Meta (matches buildChord)
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      if (e.metaKey) parts.push('Meta')
      
      // Handle the key name. For letters, we want upper case (e.g. 'K'). 
      // For functional keys, we use the name as-is (e.g. 'Escape').
      const keyName = e.key.length === 1 ? e.key.toUpperCase() : e.key
      
      // If the key pressed IS a modifier itself, don't build a chord
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return

      parts.push(keyName)
      const combo = parts.join('+')

      // Search for a match in user bindings
      for (const [action, binding] of Object.entries(bindings)) {
        if (binding === combo) {
          e.preventDefault()
          e.stopPropagation()
          const route = ACTION_ROUTES[action]
          if (route) {
            navigate(route)
          } else if (action === 'toggle_sidebar') {
             const aside = document.querySelector('.app-shell-nav')
             if (aside) aside.classList.toggle('collapsed')
          } else if (action === 'focus_search') {
             const search = document.querySelector('.hp-search-input') as HTMLInputElement
             if (search) search.focus()
          }
          break
        }
      }
    }
    // Use capture phase to ensure we intercept keys before components like Modals
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('dh:shortcuts:updated', onShortcutsUpdated as EventListener)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('dh:shortcuts:updated', onShortcutsUpdated as EventListener)
    }
  }, [navigate])

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
