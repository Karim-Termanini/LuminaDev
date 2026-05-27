import type { ReactElement, ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ActiveJobsStrip } from './ActiveJobsStrip'
import { EnvironmentBanner } from './EnvironmentBanner'
import { OnLoginAutomationRunner } from './OnLoginAutomationRunner'
import { TopBar } from './TopBar'
import { WidgetLayoutProvider } from './WidgetLayoutContext'
import './AppShell.css'

type RouteStatus = 'live' | 'partial' | 'stub'

const DEFAULT_SHORTCUTS: Record<string, string> = {
  open_terminal: 'Ctrl+Alt+T',
  toggle_sidebar: 'Ctrl+B',
  focus_search: 'Ctrl+K',
  go_dashboard: 'Alt+1',
  go_system: 'Alt+2',
  go_docker: 'Alt+3',
  go_git: 'Alt+4',
  go_profiles: 'Alt+5',
  go_runtimes: 'Alt+6',
  go_maintenance: 'Alt+7',
  go_settings: 'Ctrl+,',
}

type NavItem = { to: string; label: string; icon: string; status: RouteStatus }

const statusStyles: Record<RouteStatus, { label: string; color: string; bg: string; border: string }> = {
  live: { label: 'LIVE', color: 'var(--green)', bg: 'rgba(0, 230, 118, 0.1)', border: 'rgba(0, 230, 118, 0.25)' },
  partial: { label: 'PARTIAL', color: 'var(--yellow)', bg: 'rgba(255, 193, 7, 0.1)', border: 'rgba(255, 193, 7, 0.25)' },
  stub: { label: 'STUB', color: '#ff8a80', bg: 'rgba(255, 82, 82, 0.1)', border: 'rgba(255, 82, 82, 0.25)' },
}

export function AppShell({ children }: { children: ReactNode }): ReactElement {
  const navigate = useNavigate()
  const { t } = useTranslation('nav')
  const [profileName, setProfileName] = useState<string>('Local user')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const nav: NavItem[] = [
    { to: '/dashboard', label: t('nav.dashboard'), icon: 'dashboard', status: 'live' as RouteStatus },
    { to: '/system', label: t('nav.monitor'), icon: 'pulse', status: 'live' as RouteStatus },
    { to: '/docker', label: t('nav.docker'), icon: 'package', status: 'live' as RouteStatus },
    { to: '/ssh', label: t('nav.ssh'), icon: 'key', status: 'live' as RouteStatus },
    { to: '/git', label: t('nav.git'), icon: 'git-branch', status: 'live' as RouteStatus },
    { to: '/profiles', label: t('nav.profiles'), icon: 'account', status: 'live' as RouteStatus },
    { to: '/terminal', label: t('nav.terminal'), icon: 'terminal', status: 'live' as RouteStatus },
    { to: '/runtimes', label: t('nav.runtimes'), icon: 'zap', status: 'live' as RouteStatus },
    { to: '/maintenance', label: t('nav.maintenance'), icon: 'shield', status: 'live' as RouteStatus },
    { to: '/system-readiness', label: t('nav.readiness'), icon: 'checklist', status: 'live' as RouteStatus },
    { to: '/settings', label: t('nav.settings'), icon: 'settings', status: 'live' as RouteStatus },
  ]
  
  // High-reliability ref for event listener to access latest bindings without re-render
  const bindingsRef = useRef<Record<string, string>>(DEFAULT_SHORTCUTS)

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

    const refreshBindings = (): void => {
      void window.dh.storeGet({ key: 'shortcuts_settings' }).then((res: unknown) => {
        const bag = res as { ok?: boolean; data?: unknown }
        if (bag.ok && bag.data && typeof bag.data === 'object' && Object.keys(bag.data).length > 0) {
          // Merge user bindings OVER defaults
          bindingsRef.current = { ...DEFAULT_SHORTCUTS, ...(bag.data as Record<string, string>) }
        } else {
          bindingsRef.current = { ...DEFAULT_SHORTCUTS }
        }
      })
    }

    refreshBindings()
    
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      
      const parts: string[] = []
      // Standardize modifier order: Ctrl+Alt+Shift+Meta (matches buildChord in SettingsShortcuts.tsx)
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      if (e.metaKey) parts.push('Meta')
      
      const keyName = e.key.length === 1 ? e.key.toUpperCase() : e.key
      
      // If the key pressed IS a modifier itself, don't build a chord
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return

      parts.push(keyName)
      const combo = parts.join('+')

      // Use a custom event to show keys on screen for debug
      window.dispatchEvent(new CustomEvent('dh:shortcut:debug', { detail: combo }))

      for (const [action, binding] of Object.entries(bindingsRef.current)) {
        if (binding === combo) {
          e.preventDefault()
          e.stopPropagation()
          const route = ACTION_ROUTES[action]
          if (route) {
            navigate(route)
          } else if (action === 'toggle_sidebar') {
             setSidebarCollapsed(prev => !prev)
          } else if (action === 'focus_search') {
             const search = document.querySelector('.hp-search-input') as HTMLInputElement
             if (search) search.focus()
          }
          break
        }
      }
    }

    const onShortcutsUpdated = () => refreshBindings()

    window.addEventListener('keydown', onKey, true)
    window.addEventListener('dh:shortcuts:updated', onShortcutsUpdated)
    
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('dh:shortcuts:updated', onShortcutsUpdated)
    }
  }, [navigate])

  return (
    <div className="app-shell">
      <aside className={`app-shell-nav ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="app-shell-header">
          <div className="app-shell-header-title">{t('appTitle')}</div>
          <div className="mono app-shell-header-subtitle">{t('footer.linuxSession')}</div>
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
            {t('footer.docs')}
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
            {t('footer.setupWizard')}
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
              <div className="app-shell-profile-session">{t('footer.switchProfile')}</div>
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
        <ShortcutVisualizer />
      </div>
    </div>
  )
}

function ShortcutVisualizer() {
  const [combo, setCombo] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

   useEffect(() => {
     const handler = (e: Event) => {
       const customEvent = e as CustomEvent<string>;
       setCombo(customEvent.detail);
       if (timer.current) clearTimeout(timer.current)
       timer.current = setTimeout(() => setCombo(null), 1500)
     }
     window.addEventListener('dh:shortcut:debug', handler)
     return () => {
       window.removeEventListener('dh:shortcut:debug', handler)
       if (timer.current) clearTimeout(timer.current)
     }
   }, [])

  if (!combo) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 80,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.85)',
      color: '#fff',
      padding: '10px 20px',
      borderRadius: '30px',
      zIndex: 100000,
      fontSize: '14px',
      fontWeight: 600,
      fontFamily: 'monospace',
      boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      pointerEvents: 'none',
      border: '1px solid var(--accent)'
    }}>
      {combo}
    </div>
  )
}
