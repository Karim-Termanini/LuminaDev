import './TopBar.css'
import type { CSSProperties, ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ContainerRow, JobSummary } from '@linux-dev-home/shared'

export function TopBar(): ReactElement {
  const { t } = useTranslation('nav')
  const location = useLocation()
  const navigate = useNavigate()
  const pathname = location.pathname
  const [q, setQ] = useState('')
  const [showNotifications, setShowNotifications] = useState(false)
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteIdx, setPaletteIdx] = useState(0)
  const [paletteContainers, setPaletteContainers] = useState<ContainerRow[]>([])
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  useEffect(() => {
    setQ('')
    setShowNotifications(false)
    setPaletteOpen(false)

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

  useEffect(() => {
    setPaletteIdx(0)
  }, [q])

  const PAGES: ReadonlyArray<{ label: string; route: string; icon: string; keywords?: string[] }> = [
    // Top-level pages
    { label: 'Dashboard', route: '/dashboard', icon: 'dashboard', keywords: ['home', 'overview', 'main'] },
    { label: 'Monitor', route: '/system', icon: 'pulse', keywords: ['cpu', 'memory', 'disk', 'metrics', 'performance', 'processes', 'ports', 'system'] },
    { label: 'Docker', route: '/docker', icon: 'package', keywords: ['containers', 'images', 'volumes', 'networks', 'compose'] },
    { label: 'SSH', route: '/ssh', icon: 'key', keywords: ['keys', 'remote', 'secure shell', 'keygen'] },
    { label: 'Git', route: '/git', icon: 'git-branch', keywords: ['version control', 'commit', 'push', 'pull', 'branch', 'vcs', 'cloud', 'github', 'gitlab'] },
    { label: 'Profiles', route: '/profiles', icon: 'account', keywords: ['workspace', 'switch', 'environment'] },
    { label: 'Terminal', route: '/terminal', icon: 'terminal', keywords: ['shell', 'bash', 'console', 'pty'] },
    { label: 'Runtimes', route: '/runtimes', icon: 'zap', keywords: ['node', 'python', 'rust', 'go', 'java', 'php', 'ruby', 'bun', 'zig', 'dart', 'flutter', 'julia', 'install', 'sdk'] },
    { label: 'Maintenance', route: '/maintenance', icon: 'shield', keywords: ['health', 'guardian', 'cleanup', 'prune'] },
    { label: 'Settings', route: '/settings', icon: 'settings', keywords: ['preferences', 'config', 'configure', 'options'] },
    // Dashboard sub-pages
    { label: 'Dashboard → Kernels', route: '/dashboard/kernels', icon: 'server-process', keywords: ['kernel', 'kernels', 'services', 'jupyter', 'nginx', 'php-fpm', 'phpfpm', 'systemd', 'start', 'stop'] },
    { label: 'Dashboard → Logs', route: '/dashboard/logs', icon: 'output', keywords: ['logs', 'log viewer', 'stream', 'container logs', 'job logs'] },
    { label: 'Dashboard → Widgets', route: '/dashboard/widgets', icon: 'layout', keywords: ['widgets', 'widget gallery', 'dashboard layout', 'customize'] },
    // Git sub-tabs
    { label: 'Git → Version Control', route: '/git?tab=vcs', icon: 'source-control', keywords: ['vcs', 'commit', 'push', 'pull', 'branch', 'diff', 'merge', 'rebase', 'conflict'] },
    { label: 'Git → Config', route: '/git?tab=config', icon: 'settings-gear', keywords: ['git config', 'identity', 'email', 'name', 'gpg', 'credential', 'doctor', 'diagnostics'] },
    { label: 'Git → Cloud', route: '/git?tab=cloud', icon: 'github', keywords: ['github', 'gitlab', 'cloud git', 'pr', 'pull request', 'issues', 'pipeline', 'ci'] },
    // Settings sub-tabs
    { label: 'Settings → Appearance', route: '/settings?tab=personalization', icon: 'color-mode', keywords: ['theme', 'accent', 'color', 'dark', 'light', 'personalization', 'appearance'] },
    { label: 'Settings → Remote', route: '/settings?tab=remote', icon: 'terminal-linux', keywords: ['ssh settings', 'terminal defaults', 'remote access'] },
    { label: 'Settings → System Info', route: '/settings?tab=system', icon: 'inspect', keywords: ['system info', 'host', 'environment', 'process env', 'hosts file'] },
    { label: 'Settings → Accounts', route: '/settings?tab=accounts', icon: 'github', keywords: ['login', 'oauth', 'token', 'cloud auth', 'accounts'] },
    { label: 'Settings → General', route: '/settings?tab=general', icon: 'settings', keywords: ['startup', 'projects home', 'wizard', 'general'] },
    { label: 'Settings → Updates', route: '/settings?tab=update', icon: 'arrow-circle-up', keywords: ['update', 'upgrade', 'version', 'release', 'check for updates'] },
    { label: 'Settings → Notifications', route: '/settings?tab=notification', icon: 'bell', keywords: ['alerts', 'mute', 'severity', 'notification'] },
    { label: 'Settings → Shortcuts', route: '/settings?tab=shortcuts', icon: 'keyboard', keywords: ['keybindings', 'hotkeys', 'keyboard', 'shortcuts', 'ctrl', 'alt'] },
    { label: 'Settings → Help & About', route: '/settings?tab=help-about', icon: 'question', keywords: ['help', 'about', 'version', 'docs', 'support', 'info'] },
    { label: 'Settings → Date & Time', route: '/settings?tab=datetime', icon: 'calendar', keywords: ['timezone', 'clock', '12h', '24h', 'time', 'date'] },
    { label: 'Settings → Languages', route: '/settings?tab=languages', icon: 'globe', keywords: ['language', 'locale', 'translation', 'arabic', 'german', 'english'] },
    { label: 'Settings → App Engine', route: '/settings?tab=app-engine', icon: 'server-process', keywords: ['ipc', 'timeout', 'thread pool', 'daemon', 'engine'] },
    { label: 'Settings → Builder', route: '/settings?tab=builder', icon: 'tools', keywords: ['toolchain', 'cargo', 'registry', 'mirror', 'builder'] },
    { label: 'Settings → Extensions', route: '/settings?tab=extension', icon: 'extensions', keywords: ['plugins', 'extensions', 'addon'] },
    { label: 'Settings → Beta Features', route: '/settings?tab=beta', icon: 'beaker', keywords: ['beta', 'experimental', 'flags', 'preview'] },
  ]

  const getCachedRuntimes = (): Array<{ name: string; version: string }> => {
    try {
      const raw = localStorage.getItem('dh:runtimes:status-cache:v1')
      if (!raw) return []
      const cached = JSON.parse(raw) as { ts: number; runtimes: Array<{ name: string; installed: boolean; version?: string }> }
      return cached.runtimes.filter((r) => r.installed).map((r) => ({ name: r.name, version: r.version ?? '' }))
    } catch {
      return []
    }
  }

  type PaletteResult =
    | { kind: 'page'; label: string; route: string; icon: string }
    | { kind: 'container'; name: string; image: string; state: string }
    | { kind: 'runtime'; name: string; version: string }

  const getPaletteResults = (query: string, containers: ContainerRow[]): PaletteResult[] => {
    const lq = query.toLowerCase()
    const results: PaletteResult[] = []
    const matchedPages = PAGES.filter((p) => {
      if (query === '') return !p.route.includes('?') // empty query: top-level pages only
      if (p.label.toLowerCase().includes(lq)) return true
      return p.keywords?.some((kw) => kw.toLowerCase().includes(lq)) ?? false
    })
    results.push(...matchedPages.map((p) => ({ kind: 'page' as const, label: p.label, route: p.route, icon: p.icon })))
    if (query !== '') {
      containers
        .filter((c) => c.name.toLowerCase().includes(lq) || c.image.toLowerCase().includes(lq))
        .forEach((c) => results.push({ kind: 'container', name: c.name, image: c.image, state: c.state }))
      getCachedRuntimes()
        .filter((r) => r.name.toLowerCase().includes(lq))
        .forEach((r) => results.push({ kind: 'runtime', name: r.name, version: r.version }))
    }
    return results
  }

  const onPaletteOpen = useCallback(async () => {
    setPaletteOpen(true)
    setPaletteIdx(0)
    try {
      const res = await window.dh.dockerList()
      const bag = res as { ok?: boolean; rows?: ContainerRow[] }
      if (bag?.ok && Array.isArray(bag.rows)) setPaletteContainers(bag.rows)
    } catch { /* palette works without containers */ }
  }, [])

  const onPaletteClose = useCallback(() => {
    setPaletteOpen(false)
    setPaletteIdx(0)
  }, [])

  const paletteResults = paletteOpen ? getPaletteResults(q, paletteContainers) : []

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!paletteOpen) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setPaletteIdx((i) => Math.min(i + 1, paletteResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setPaletteIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = paletteResults[paletteIdx]
      if (!item) return
      if (item.kind === 'page') navigate(item.route)
      else if (item.kind === 'container') navigate('/docker')
      else if (item.kind === 'runtime') navigate('/runtimes')
      onPaletteClose()
      setQ('')
    } else if (e.key === 'Escape') {
      onPaletteClose()
      setQ('')
    }
  }

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
direction: 'ltr',
      }}
    >
      <div style={{ fontWeight: 700, letterSpacing: '0.04em', minWidth: 140 }}>{pathname === '/dashboard' || pathname.startsWith('/dashboard/') ? t('topbar.dashboardTitle') : (titles[pathname] ?? t('topbar.linuxDevHome'))}</div>
      <div style={{ display: 'flex', gap: 2, flex: 1, justifyContent: 'center' }}>
        {onDashboard ? (
          <>
            <DashTab to="/dashboard" end label={t('topbar.main')} />
            <DashTab to="/dashboard/kernels" label={t('topbar.kernels')} />
            <DashTab to="/dashboard/logs" label={t('topbar.logs')} />
            <DashTab to="/dashboard/widgets" label={t('topbar.widgets')} />
          </>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('topbar.overview')}</span>
        )}
      </div>
      <div className="cmd-palette-wrap">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => void onPaletteOpen()}
          onBlur={() => {
            blurTimerRef.current = setTimeout(() => onPaletteClose(), 150)
          }}
          onKeyDown={handleInputKeyDown}
          placeholder={t('topbar.searchPlaceholder')}
          className="hp-search-input"
          role="combobox"
          aria-expanded={paletteOpen}
          aria-controls="cmd-palette"
          aria-autocomplete="list"
          style={{ width: 220, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 13 }}
        />

        {paletteOpen && (paletteResults.length > 0 || q !== '') && (
          <div
            id="cmd-palette"
            role="listbox"
            className="cmd-palette-panel"
          >
            {paletteResults.length === 0 && q !== '' ? (
              <div className="cmd-palette-empty">No results for &ldquo;{q}&rdquo;</div>
            ) : (
              <>
                {paletteResults.some((r) => r.kind === 'page') && (
                  <div>
                    <div className="cmd-palette-section-label">Pages</div>
                    {paletteResults.map((item, idx) => item.kind !== 'page' ? null : (
                      <div
                        key={`page-${item.route}`}
                        role="option"
                        aria-selected={idx === paletteIdx}
                        className={`cmd-palette-item${idx === paletteIdx ? ' active' : ''}`}
                        onMouseDown={(e) => { e.preventDefault(); navigate(item.route); onPaletteClose(); setQ('') }}
                      >
                        <span className={`codicon codicon-${item.icon}`} aria-hidden />
                        <span className="cmd-palette-item-label">{item.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                {paletteResults.some((r) => r.kind === 'container') && (
                  <div>
                    <div className="cmd-palette-section-label">Containers</div>
                    {paletteResults.map((item, idx) => item.kind !== 'container' ? null : (
                      <div
                        key={`container-${item.name}`}
                        role="option"
                        aria-selected={idx === paletteIdx}
                        className={`cmd-palette-item${idx === paletteIdx ? ' active' : ''}`}
                        onMouseDown={(e) => { e.preventDefault(); navigate('/docker'); onPaletteClose(); setQ('') }}
                      >
                        <span className="codicon codicon-package" aria-hidden />
                        <span className="cmd-palette-item-label">{item.name}</span>
                        <span className="cmd-palette-item-meta">{item.image}</span>
                        <span className={`cmd-palette-item-badge ${item.state.toLowerCase() === 'running' ? 'cmd-palette-badge-running' : 'cmd-palette-badge-stopped'}`}>
                          {item.state.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {paletteResults.some((r) => r.kind === 'runtime') && (
                  <div>
                    <div className="cmd-palette-section-label">Runtimes</div>
                    {paletteResults.map((item, idx) => item.kind !== 'runtime' ? null : (
                      <div
                        key={`runtime-${item.name}`}
                        role="option"
                        aria-selected={idx === paletteIdx}
                        className={`cmd-palette-item${idx === paletteIdx ? ' active' : ''}`}
                        onMouseDown={(e) => { e.preventDefault(); navigate('/runtimes'); onPaletteClose(); setQ('') }}
                      >
                        <span className="codicon codicon-zap" aria-hidden />
                        <span className="cmd-palette-item-label">{item.name}</span>
                        {item.version && <span className="cmd-palette-item-meta">{item.version}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
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
