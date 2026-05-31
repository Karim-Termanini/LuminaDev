import type { ReactElement, ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ActiveJobsStrip } from './ActiveJobsStrip'
import { EnvironmentBanner } from './EnvironmentBanner'
import { OnLoginAutomationRunner } from './OnLoginAutomationRunner'
import { TopBar } from './TopBar'
import { openSetupWizard } from '../lib/setupWizard'
import './AppShell.css'

const DEFAULT_SHORTCUTS: Record<string, string> = {
  open_terminal: 'Ctrl+Alt+T',
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

export function AppShell({ children }: { children: ReactNode }): ReactElement {
  const navigate = useNavigate()
  const { t } = useTranslation('nav')
  const [profileName, setProfileName] = useState<string>('Local user')

  const navDefaults: Array<{ to: string; label: string; icon: string }> = [
    { to: '/dashboard', label: t('nav.dashboard'), icon: 'dashboard' },
    { to: '/docker', label: t('nav.docker'), icon: 'package' },
    { to: '/ssh', label: t('nav.ssh'), icon: 'key' },
    { to: '/git', label: t('nav.git'), icon: 'git-branch' },
    { to: '/profiles', label: t('nav.profiles'), icon: 'account' },
    { to: '/terminal', label: t('nav.terminal'), icon: 'terminal' },
    { to: '/runtimes', label: t('nav.runtimes'), icon: 'zap' },
    { to: '/maintenance', label: t('nav.maintenance'), icon: 'shield' },
    { to: '/system-readiness', label: t('nav.readiness'), icon: 'checklist' },
    { to: '/settings', label: t('nav.settings'), icon: 'settings' },
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
      go_system: '/dashboard/monitor',
      go_profiles: '/profiles',
      go_runtimes: '/runtimes',
      go_maintenance: '/maintenance',
      go_settings: '/settings',
    }

    const refreshBindings = (): void => {
      void window.dh.storeGet({ key: 'shortcuts_settings' }).then((res: unknown) => {
        const bag = res as { ok?: boolean; data?: unknown }
        if (
          bag.ok &&
          bag.data &&
          typeof bag.data === 'object' &&
          Object.keys(bag.data).length > 0
        ) {
          bindingsRef.current = { ...DEFAULT_SHORTCUTS, ...(bag.data as Record<string, string>) }
        } else {
          bindingsRef.current = { ...DEFAULT_SHORTCUTS }
        }
      })
    }

    refreshBindings()

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        return

      const parts: string[] = []
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      if (e.metaKey) parts.push('Meta')

      const keyName = e.key.length === 1 ? e.key.toUpperCase() : e.key
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return

      parts.push(keyName)
      const combo = parts.join('+')

      window.dispatchEvent(new CustomEvent('dh:shortcut:debug', { detail: combo }))

      for (const [action, binding] of Object.entries(bindingsRef.current)) {
        if (binding === combo) {
          e.preventDefault()
          e.stopPropagation()
          const route = ACTION_ROUTES[action]
          if (route) {
            navigate(route)
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
      {/* Permanent icon-only sidebar — always collapsed, no expand/collapse behavior */}
      <aside className="app-shell-nav">
        {/* Header: icon-only brand mark with tooltip */}
        <div className="app-shell-header" data-tooltip={t('appTitle')}>
          <span className="codicon codicon-home" aria-hidden />
        </div>

        <nav className="app-shell-nav-list">
          {navDefaults.map((item) => (
            <div key={item.to} className="app-shell-nav-item-wrap" data-tooltip={item.label}>
              <NavLink
                to={item.to}
                className={({ isActive }) => `app-shell-nav-item${isActive ? ' active' : ''}`}
                aria-label={item.label}
              >
                <span className={`codicon codicon-${item.icon}`} aria-hidden />
              </NavLink>
            </div>
          ))}
        </nav>

        <div className="app-shell-footer">
          <a
            href="#"
            data-tooltip={t('footer.docs')}
            onClick={(e) => {
              e.preventDefault()
              void window.dh.openExternal('https://docs.luminadev.app')
            }}
            className="app-shell-footer-link"
            aria-label={t('footer.docs')}
          >
            <span className="codicon codicon-book" aria-hidden />
          </a>
          <a
            href="#"
            data-tooltip={t('footer.setupWizard')}
            onClick={(e) => {
              e.preventDefault()
              void openSetupWizard()
            }}
            className="app-shell-footer-link"
            aria-label={t('footer.setupWizard')}
          >
            <span className="codicon codicon-wand" aria-hidden />
          </a>
          <div
            className="app-shell-profile-section"
            data-tooltip={`${profileName} — ${t('footer.switchProfile')}`}
            onClick={() => navigate('/profiles')}
            role="button"
            tabIndex={0}
            aria-label={t('footer.switchProfile')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate('/profiles')
            }}
          >
            <div className="app-shell-profile-avatar">
              <span className="codicon codicon-account" aria-hidden />
            </div>
          </div>
        </div>
      </aside>
      <div className="app-shell-main">
        <OnLoginAutomationRunner />
        <EnvironmentBanner />
        <TopBar />
        <main style={{ flex: 1, overflow: 'auto', padding: 24 }}>{children}</main>
        <ActiveJobsStrip />
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
      const customEvent = e as CustomEvent<string>
      setCombo(customEvent.detail)
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
    <div
      style={{
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
        border: '1px solid var(--accent)',
      }}
    >
      {combo}
    </div>
  )
}
