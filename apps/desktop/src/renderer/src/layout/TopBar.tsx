import './TopBar.css'
import type { CSSProperties, ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { CloudGitInboxItem, ContainerRow, JobSummary } from '@linux-dev-home/shared'
import { useCloudGitInbox } from './useCloudGitInbox'

function inboxCategoryLabel(
  t: (key: string) => string,
  category: CloudGitInboxItem['category']
): string {
  switch (category) {
    case 'mention':
      return t('topbar.inboxMentions')
    case 'review_request':
      return t('topbar.inboxReviews')
    case 'pr_activity':
      return t('topbar.inboxPrActivity')
    default:
      return category
  }
}

const DISMISSED_JOBS_KEY = 'lumina_notif_dismissed_jobs'

function readDismissedJobIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_JOBS_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeDismissedJobIds(ids: Set<string>): void {
  sessionStorage.setItem(DISMISSED_JOBS_KEY, JSON.stringify([...ids]))
}

export function TopBar(): ReactElement {
  const { t } = useTranslation('nav')
  const location = useLocation()
  const navigate = useNavigate()
  const pathname = location.pathname
  const [q, setQ] = useState('')
  const [showNotifications, setShowNotifications] = useState(false)
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [dismissedJobIds, setDismissedJobIds] = useState<Set<string>>(readDismissedJobIds)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteIdx, setPaletteIdx] = useState(0)
  const [paletteContainers, setPaletteContainers] = useState<ContainerRow[]>([])
  const [paletteRuntimes, setPaletteRuntimes] = useState<Array<{ name: string; version: string }>>(
    []
  )
  const [paletteGitRepos, setPaletteGitRepos] = useState<Array<{ name: string; path: string }>>([])
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const paletteOpenRef = useRef(false)
  const cloudInbox = useCloudGitInbox(showNotifications)
  const inboxUnread = cloudInbox.items.some((item) => item.unread)
  const failedJobs = useMemo(
    () => jobs.filter((j) => j.state === 'failed' && !dismissedJobIds.has(j.id)),
    [jobs, dismissedJobIds]
  )
  const hasRunningJobs = jobs.some((j) => j.state === 'running')
  const showNotifBadge = hasRunningJobs || inboxUnread || failedJobs.length > 0

  const dismissFailedJobNotifications = useCallback(() => {
    const failedIds = jobs.filter((j) => j.state === 'failed').map((j) => j.id)
    if (failedIds.length === 0) return
    setDismissedJobIds((prev) => {
      const next = new Set(prev)
      for (const id of failedIds) next.add(id)
      writeDismissedJobIds(next)
      return next
    })
  }, [jobs])

  const openRuntimesFromNotification = useCallback(() => {
    setShowNotifications(false)
    navigate('/runtimes')
  }, [navigate])

  const titles: Record<string, string> = {
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
    paletteOpenRef.current = false
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

  const PAGES: ReadonlyArray<{ label: string; route: string; icon: string; keywords?: string[] }> =
    [
      // Top-level pages
      {
        label: 'Dashboard',
        route: '/dashboard',
        icon: 'dashboard',
        keywords: ['home', 'overview', 'main'],
      },
      {
        label: 'Docker',
        route: '/docker',
        icon: 'package',
        keywords: ['containers', 'images', 'volumes', 'networks', 'compose'],
      },
      {
        label: 'SSH',
        route: '/ssh',
        icon: 'key',
        keywords: ['keys', 'remote', 'secure shell', 'keygen'],
      },
      {
        label: 'Git',
        route: '/git',
        icon: 'git-branch',
        keywords: [
          'version control',
          'commit',
          'push',
          'pull',
          'branch',
          'vcs',
          'cloud',
          'github',
          'gitlab',
        ],
      },
      {
        label: 'Profiles',
        route: '/profiles',
        icon: 'account',
        keywords: ['workspace', 'switch', 'environment'],
      },
      {
        label: 'Terminal',
        route: '/terminal',
        icon: 'terminal',
        keywords: ['shell', 'bash', 'console', 'pty'],
      },
      {
        label: 'Runtimes',
        route: '/runtimes',
        icon: 'zap',
        keywords: [
          'node',
          'python',
          'rust',
          'go',
          'java',
          'php',
          'ruby',
          'bun',
          'zig',
          'dart',
          'flutter',
          'julia',
          'install',
          'sdk',
        ],
      },
      {
        label: 'Maintenance',
        route: '/maintenance',
        icon: 'shield',
        keywords: ['health', 'guardian', 'cleanup', 'prune'],
      },
      {
        label: 'Settings',
        route: '/settings',
        icon: 'settings',
        keywords: ['preferences', 'config', 'configure', 'options'],
      },
      // Dashboard sub-pages
      {
        label: 'Dashboard → Kernels',
        route: '/dashboard/kernels',
        icon: 'server-process',
        keywords: [
          'kernel',
          'kernels',
          'services',
          'jupyter',
          'nginx',
          'php-fpm',
          'phpfpm',
          'systemd',
          'start',
          'stop',
        ],
      },
      {
        label: 'Dashboard → Logs',
        route: '/dashboard/logs',
        icon: 'output',
        keywords: ['logs', 'log viewer', 'stream', 'container logs', 'job logs'],
      },
      {
        label: 'Dashboard → Monitor',
        route: '/dashboard/monitor',
        icon: 'pulse',
        keywords: [
          'cpu',
          'memory',
          'disk',
          'metrics',
          'performance',
          'processes',
          'ports',
          'system',
          'monitor',
        ],
      },
      {
        label: 'Git Assistant',
        route: '/git',
        icon: 'source-control',
        keywords: [
          'vcs',
          'commit',
          'push',
          'pull',
          'branch',
          'git config',
          'identity',
          'credential',
          'github',
          'gitlab',
          'clone',
          'save',
          'snapshot',
        ],
      },
      // Settings sub-tabs
      {
        label: 'Settings → Appearance',
        route: '/settings?tab=personalization',
        icon: 'color-mode',
        keywords: ['theme', 'accent', 'color', 'dark', 'light', 'personalization', 'appearance'],
      },
      {
        label: 'Settings → Remote',
        route: '/settings?tab=remote',
        icon: 'terminal-linux',
        keywords: ['ssh settings', 'terminal defaults', 'remote access'],
      },
      {
        label: 'Settings → System Info',
        route: '/settings?tab=system',
        icon: 'inspect',
        keywords: ['system info', 'host', 'environment', 'process env', 'hosts file'],
      },
      {
        label: 'Settings → Accounts',
        route: '/settings?tab=accounts',
        icon: 'github',
        keywords: ['login', 'oauth', 'token', 'cloud auth', 'accounts'],
      },
      {
        label: 'Settings → General',
        route: '/settings?tab=general',
        icon: 'settings',
        keywords: ['startup', 'projects home', 'wizard', 'general'],
      },
      {
        label: 'Settings → Updates',
        route: '/settings?tab=update',
        icon: 'arrow-circle-up',
        keywords: ['update', 'upgrade', 'version', 'release', 'check for updates'],
      },
      {
        label: 'Settings → Notifications',
        route: '/settings?tab=notification',
        icon: 'bell',
        keywords: ['alerts', 'mute', 'severity', 'notification'],
      },
      {
        label: 'Settings → Shortcuts',
        route: '/settings?tab=shortcuts',
        icon: 'keyboard',
        keywords: ['keybindings', 'hotkeys', 'keyboard', 'shortcuts', 'ctrl', 'alt'],
      },
      {
        label: 'Settings → Help & About',
        route: '/settings?tab=help-about',
        icon: 'question',
        keywords: ['help', 'about', 'version', 'docs', 'support', 'info'],
      },
      {
        label: 'Settings → Date & Time',
        route: '/settings?tab=datetime',
        icon: 'calendar',
        keywords: ['timezone', 'clock', '12h', '24h', 'time', 'date'],
      },
      {
        label: 'Settings → Languages',
        route: '/settings?tab=languages',
        icon: 'globe',
        keywords: ['language', 'locale', 'translation', 'arabic', 'german', 'english'],
      },
      {
        label: 'Settings → App Engine',
        route: '/settings?tab=app-engine',
        icon: 'server-process',
        keywords: ['ipc', 'timeout', 'thread pool', 'daemon', 'engine'],
      },
      {
        label: 'Settings → Builder',
        route: '/settings?tab=builder',
        icon: 'tools',
        keywords: ['toolchain', 'cargo', 'registry', 'mirror', 'builder'],
      },
      {
        label: 'Settings → Beta Features',
        route: '/settings?tab=beta',
        icon: 'beaker',
        keywords: ['beta', 'experimental', 'flags', 'preview'],
      },
    ]

  /** Fuzzy match: returns a relevance score (higher = better) or 0 if no match. */
  function fuzzyScore(query: string, target: string): number {
    const q = query.toLowerCase()
    const t = target.toLowerCase()
    let qi = 0
    let score = 0
    let consecutiveBonus = 0
    let prevMatchIdx = -1
    for (let ti = 0; ti < t.length && qi < q.length; ti++) {
      if (t[ti] === q[qi]) {
        qi++
        score += 1
        if (prevMatchIdx === ti - 1) {
          consecutiveBonus += 2
          score += consecutiveBonus
        } else {
          consecutiveBonus = 0
        }
        // Word boundary bonus
        if (ti === 0 || /[\s\-_./]/.test(t[ti - 1])) score += 3
        // Earlier matches are better
        score += Math.max(0, 5 - ti)
        prevMatchIdx = ti
      }
    }
    return qi === q.length ? score : 0
  }

  function bestFuzzyScore(label: string, keywords?: readonly string[]): number {
    let best = fuzzyScore(q, label)
    if (keywords) {
      for (const kw of keywords) best = Math.max(best, fuzzyScore(q, kw))
    }
    return best
  }

  type PaletteResult =
    | { kind: 'page'; label: string; route: string; icon: string; score: number }
    | { kind: 'container'; name: string; image: string; state: string; score: number }
    | { kind: 'runtime'; name: string; version: string; score: number }
    | { kind: 'repo'; name: string; path: string; score: number }

  const getPaletteResults = (query: string, containers: ContainerRow[]): PaletteResult[] => {
    const results: PaletteResult[] = []

    if (query === '') {
      // Empty query: top-level pages only, recency order
      for (const p of PAGES) {
        if (!p.route.includes('?')) {
          results.push({
            kind: 'page' as const,
            label: p.label,
            route: p.route,
            icon: p.icon,
            score: 100,
          })
        }
      }
      return results
    }

    // Fuzzy-scored pages
    for (const p of PAGES) {
      const s = bestFuzzyScore(p.label, p.keywords)
      if (s > 0) {
        results.push({
          kind: 'page' as const,
          label: p.label,
          route: p.route,
          icon: p.icon,
          score: s,
        })
      }
    }

    // Fuzzy-scored containers
    for (const c of containers) {
      const s = Math.max(fuzzyScore(query, c.name), fuzzyScore(query, c.image))
      if (s > 0) {
        results.push({
          kind: 'container',
          name: c.name,
          image: c.image,
          state: c.state,
          score: s,
        })
      }
    }

    // Fuzzy-scored runtimes
    for (const r of paletteRuntimes) {
      const s = fuzzyScore(query, r.name)
      if (s > 0) {
        results.push({ kind: 'runtime', name: r.name, version: r.version, score: s })
      }
    }

    // Fuzzy-scored git repos
    for (const repo of paletteGitRepos) {
      const s = Math.max(fuzzyScore(query, repo.name), fuzzyScore(query, repo.path))
      if (s > 0) {
        results.push({ kind: 'repo', name: repo.name, path: repo.path, score: s })
      }
    }

    // Sort by score descending, then alphabetically by display name
    results.sort((a, b) => {
      const nameA = a.kind === 'page' ? a.label : a.name
      const nameB = b.kind === 'page' ? b.label : b.name
      return b.score - a.score || nameA.localeCompare(nameB)
    })
    return results
  }

  const onPaletteOpen = useCallback(() => {
    // Clear any pending blur timer from a previous focus/blur cycle
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current)
      blurTimerRef.current = null
    }
    // Open synchronously so the palette renders before any blur can close it
    paletteOpenRef.current = true
    setPaletteOpen(true)
    setPaletteIdx(0)
    // Fetch live data in the background
    void (async () => {
      try {
        const res = await window.dh.dockerList()
        const bag = res as { ok?: boolean; rows?: ContainerRow[] }
        if (bag?.ok && Array.isArray(bag.rows)) setPaletteContainers(bag.rows)
      } catch {
        /* palette works without containers */
      }
      try {
        const statusRes = await window.dh.runtimeStatus()
        if (statusRes.ok && Array.isArray(statusRes.runtimes)) {
          setPaletteRuntimes(
            statusRes.runtimes
              .filter((r) => r.installed)
              .map((r) => ({ name: r.name, version: r.version ?? '' }))
          )
        }
      } catch {
        /* palette works without runtimes */
      }
      try {
        const gitRes = await window.dh.gitRecentList()
        if (gitRes.ok && Array.isArray(gitRes.repos)) {
          setPaletteGitRepos(
            gitRes.repos.map((r) => ({
              name: r.path.split('/').pop() || r.path,
              path: r.path,
            }))
          )
        }
      } catch {
        /* palette works without repos */
      }
    })()
  }, [])

  const onPaletteClose = useCallback(() => {
    paletteOpenRef.current = false
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
      else if (item.kind === 'repo') navigate(`/git?repoPath=${encodeURIComponent(item.path)}`)
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
      <div style={{ fontWeight: 700, letterSpacing: '0.04em', minWidth: 140 }}>
        {pathname === '/dashboard' || pathname.startsWith('/dashboard/')
          ? t('topbar.dashboardTitle')
          : (titles[pathname] ?? t('topbar.linuxDevHome'))}
      </div>
      <div style={{ display: 'flex', gap: 2, flex: 1, justifyContent: 'center' }}>
        {onDashboard ? (
          <>
            <DashTab
              to="/dashboard"
              end
              label={t('topbar.main')}
              tooltip={t('topbar.mainTooltip')}
              type="main"
            />
            <DashTab
              to="/dashboard/kernels"
              label={t('topbar.kernels')}
              tooltip={t('topbar.kernelsTooltip')}
              type="kernels"
            />
            <DashTab
              to="/dashboard/logs"
              label={t('topbar.logs')}
              tooltip={t('topbar.logsTooltip')}
              type="logs"
            />
            <DashTab
              to="/dashboard/monitor"
              label={t('topbar.monitor')}
              tooltip={t('topbar.monitorTooltip')}
              type="monitor"
            />
          </>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('topbar.overview')}</span>
        )}
      </div>
      <div className="cmd-palette-wrap">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            // Re-open palette on typing when it was closed (e.g. after Enter-navigate
            // left the input focused but paletteOpen was reset to false)
            if (!paletteOpenRef.current) onPaletteOpen()
          }}
          onFocus={() => void onPaletteOpen()}
          onBlur={() => {
            if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
            blurTimerRef.current = setTimeout(() => {
              // Only close if palette wasn't re-opened during the delay
              if (paletteOpenRef.current) onPaletteClose()
            }, 150)
          }}
          onKeyDown={handleInputKeyDown}
          placeholder={t('topbar.searchPlaceholder')}
          className="hp-search-input"
          role="combobox"
          aria-expanded={paletteOpen}
          aria-controls="cmd-palette"
          aria-autocomplete="list"
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

        {paletteOpen && (paletteResults.length > 0 || q !== '') && (
          <div id="cmd-palette" role="listbox" className="cmd-palette-panel">
            {paletteResults.length === 0 && q !== '' ? (
              <div className="cmd-palette-empty">No results for &ldquo;{q}&rdquo;</div>
            ) : (
              <>
                {paletteResults.some((r) => r.kind === 'page') && (
                  <div>
                    <div className="cmd-palette-section-label">Pages</div>
                    {paletteResults.map((item, idx) =>
                      item.kind !== 'page' ? null : (
                        <div
                          key={`page-${item.route}`}
                          role="option"
                          aria-selected={idx === paletteIdx}
                          className={`cmd-palette-item${idx === paletteIdx ? ' active' : ''}`}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            navigate(item.route)
                            onPaletteClose()
                            setQ('')
                          }}
                        >
                          <span className={`codicon codicon-${item.icon}`} aria-hidden />
                          <span className="cmd-palette-item-label">{item.label}</span>
                        </div>
                      )
                    )}
                  </div>
                )}
                {paletteResults.some((r) => r.kind === 'container') && (
                  <div>
                    <div className="cmd-palette-section-label">Containers</div>
                    {paletteResults.map((item, idx) =>
                      item.kind !== 'container' ? null : (
                        <div
                          key={`container-${item.name}`}
                          role="option"
                          aria-selected={idx === paletteIdx}
                          className={`cmd-palette-item${idx === paletteIdx ? ' active' : ''}`}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            navigate('/docker')
                            onPaletteClose()
                            setQ('')
                          }}
                        >
                          <span className="codicon codicon-package" aria-hidden />
                          <span className="cmd-palette-item-label">{item.name}</span>
                          <span className="cmd-palette-item-meta">{item.image}</span>
                          <span
                            className={`cmd-palette-item-badge ${item.state.toLowerCase() === 'running' ? 'cmd-palette-badge-running' : 'cmd-palette-badge-stopped'}`}
                          >
                            {item.state.toUpperCase()}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )}
                {paletteResults.some((r) => r.kind === 'runtime') && (
                  <div>
                    <div className="cmd-palette-section-label">Runtimes</div>
                    {paletteResults.map((item, idx) =>
                      item.kind !== 'runtime' ? null : (
                        <div
                          key={`runtime-${item.name}`}
                          role="option"
                          aria-selected={idx === paletteIdx}
                          className={`cmd-palette-item${idx === paletteIdx ? ' active' : ''}`}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            navigate('/runtimes')
                            onPaletteClose()
                            setQ('')
                          }}
                        >
                          <span className="codicon codicon-zap" aria-hidden />
                          <span className="cmd-palette-item-label">{item.name}</span>
                          {item.version && (
                            <span className="cmd-palette-item-meta">{item.version}</span>
                          )}
                        </div>
                      )
                    )}
                  </div>
                )}
                {paletteResults.some((r) => r.kind === 'repo') && (
                  <div>
                    <div className="cmd-palette-section-label">Repositories</div>
                    {paletteResults.map((item, idx) =>
                      item.kind !== 'repo' ? null : (
                        <div
                          key={`repo-${item.path}`}
                          role="option"
                          aria-selected={idx === paletteIdx}
                          className={`cmd-palette-item${idx === paletteIdx ? ' active' : ''}`}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            navigate(`/git?repoPath=${encodeURIComponent(item.path)}`)
                            onPaletteClose()
                            setQ('')
                          }}
                        >
                          <span className="codicon codicon-git-branch" aria-hidden />
                          <span className="cmd-palette-item-label">{item.name}</span>
                          <span className="cmd-palette-item-meta">{item.path}</span>
                        </div>
                      )
                    )}
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
          data-tooltip={t('topbar.notifications')}
          data-tooltip-position="bottom-notif"
          aria-label="Notifications"
          aria-expanded={showNotifications}
          aria-haspopup="dialog"
          style={{
            ...btnIcon,
            color:
              showNotifications || showNotifBadge
                ? 'var(--accent)'
                : 'var(--text-muted)',
            position: 'relative',
          }}
          onClick={() => setShowNotifications(!showNotifications)}
        >
          <span className="codicon codicon-bell" />
          {showNotifBadge && (
            <span
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--accent)',
                boxShadow: '0 0 4px var(--accent)',
              }}
            />
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
              width: 360,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
              padding: 12,
            }}
          >
            <div
              style={{
                fontWeight: 600,
                borderBottom: '1px solid var(--border)',
                paddingBottom: 8,
                marginBottom: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span id="notifications-title">{t('topbar.notifications')}</span>
              <button
                type="button"
                onClick={() => {
                  dismissFailedJobNotifications()
                  setShowNotifications(false)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <span className="codicon codicon-close" style={{ fontSize: 12 }} />
              </button>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 6,
                }}
              >
                {t('topbar.inboxGit')}
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                {cloudInbox.loading && cloudInbox.items.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '8px 0' }}>
                    {t('topbar.inboxLoading')}
                  </div>
                ) : cloudInbox.error && cloudInbox.items.length === 0 ? (
                  <div style={{ color: 'var(--orange)', fontSize: 12, padding: '8px 0' }}>
                    {cloudInbox.error}
                    <button
                      type="button"
                      onClick={() => navigate('/settings?tab=accounts')}
                      style={{
                        display: 'block',
                        marginTop: 8,
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent)',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: 12,
                      }}
                    >
                      {t('topbar.inboxConnectAccounts')}
                    </button>
                  </div>
                ) : cloudInbox.items.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '8px 0' }}>
                    {t('topbar.inboxEmpty')}
                  </div>
                ) : (
                  cloudInbox.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void window.dh.openExternal(item.url)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 6px',
                        marginBottom: 4,
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        background: item.unread ? 'rgba(124, 77, 255, 0.08)' : 'transparent',
                        color: 'var(--text)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: 10, color: 'var(--accent)', marginBottom: 2 }}>
                        {inboxCategoryLabel(t, item.category)} · {item.provider}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.35 }}>{item.title}</div>
                      {item.repo ? (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                          {item.repo}
                        </div>
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 6,
              }}
            >
              {t('topbar.inboxJobs')}
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {jobs.length === 0 ? (
                <div
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 12,
                    textAlign: 'center',
                    padding: '16px 0',
                  }}
                >
                  {t('topbar.noActivity')}
                </div>
              ) : (
                jobs
                  .slice(-5)
                  .reverse()
                  .map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => {
                        if (j.kind.startsWith('runtime_') || j.kind === 'install_deps') {
                          openRuntimesFromNotification()
                        }
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        padding: '6px 0',
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        color: 'inherit',
                        cursor:
                          j.kind.startsWith('runtime_') || j.kind === 'install_deps'
                            ? 'pointer'
                            : 'default',
                      }}
                    >
                      <div
                        style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}
                      >
                        <span style={{ fontWeight: 500, color: 'var(--text)' }}>
                          {j.kind.replace(/_/g, ' ')}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            color:
                              j.state === 'running'
                                ? 'var(--yellow)'
                                : j.state === 'completed'
                                  ? 'var(--green)'
                                  : 'var(--red)',
                          }}
                        >
                          {j.state.toUpperCase()}
                        </span>
                      </div>
                      {j.state === 'running' && (
                        <div
                          style={{
                            width: '100%',
                            height: 4,
                            background: 'rgba(255,255,255,0.06)',
                            borderRadius: 2,
                            overflow: 'hidden',
                            marginTop: 4,
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, Math.max(0, j.progress ?? 0))}%`,
                              height: '100%',
                              background: 'var(--accent)',
                            }}
                          />
                        </div>
                      )}
                      {j.state === 'failed' && j.logTail.length > 0 ? (
                        <div
                          style={{
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            lineHeight: 1.35,
                            marginTop: 2,
                          }}
                        >
                          {j.logTail[j.logTail.length - 1]}
                        </div>
                      ) : null}
                    </button>
                  ))
              )}
            </div>
          </div>
        )}
      </div>
      <button
        type="button"
        data-tooltip={t('topbar.terminal')}
        data-tooltip-position="bottom-term"
        aria-label="Console"
        style={btnIcon}
        onClick={() => navigate('/terminal')}
      >
        <span className="codicon codicon-terminal" />
      </button>
      <button
        type="button"
        data-tooltip={t('topbar.settings')}
        data-tooltip-position="bottom-sett"
        aria-label="Settings"
        style={btnIcon}
        onClick={() => navigate('/settings')}
      >
        <span className="codicon codicon-gear" />
      </button>
    </header>
  )
}

function DashTab(props: {
  to: string
  end?: boolean
  label: string
  tooltip: string
  type: string
}): ReactElement {
  return (
    <NavLink
      to={props.to}
      end={props.end}
      data-tooltip={props.tooltip}
      data-tooltip-position={`bottom-tab-${props.type}`}
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
        position: 'relative',
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
