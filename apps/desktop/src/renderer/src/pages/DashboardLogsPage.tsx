import { ComposeProfileSchema, type JobSummary, type ContainerRow } from '@linux-dev-home/shared'
import './DashboardLogsPage.css'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { listen } from '@tauri-apps/api/event'

const profiles = ComposeProfileSchema.options

const darkThemeColors = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#aeafad',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#e5e5e5',
}

const lightThemeColors = {
  background: '#f6f8fa',
  foreground: '#24292e',
  cursor: '#24292e',
  black: '#24292e',
  red: '#d73a49',
  green: '#22863a',
  yellow: '#b08800',
  blue: '#032f62',
  magenta: '#6f42c1',
  cyan: '#005cc5',
  white: '#e1e4e6',
  brightBlack: '#959da5',
  brightRed: '#cb2431',
  brightGreen: '#28a745',
  brightYellow: '#ffd33d',
  brightBlue: '#005cc5',
  brightMagenta: '#ea4aaa',
  brightCyan: '#3192aa',
  brightWhite: '#fafbfc',
}

function getThemeColors(): typeof darkThemeColors {
  const isLight = document.documentElement.dataset['theme'] === 'light'
  return isLight ? lightThemeColors : darkThemeColors
}

function colorizeLine(line: string): string {
  if (line.includes('\x1b[')) {
    return line
  }

  // Prettier & VS Code style token highlighting
  if (line.startsWith('--- ') && line.endsWith(' ---')) {
    return `\x1b[1;36m${line}\x1b[0m`
  }
  if (line.startsWith('=== ') && line.endsWith(' ===')) {
    return `\x1b[1;35m${line}\x1b[0m`
  }

  let formatted = line

  // Timestamps (dimmed)
  const tsRegex = /^(\[?\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}|[A-Z]{3,4})?\]?)/i
  formatted = formatted.replace(tsRegex, '\x1b[90m$1\x1b[0m')

  // Log levels
  formatted = formatted
    .replace(/\b(ERROR|ERR|FATAL|FAIL|Failed|failed|critical|CRITICAL|Exception|exception)\b/g, '\x1b[1;31m$1\x1b[0m')
    .replace(/\b(WARNING|WARN|warning|warn)\b/g, '\x1b[1;33m$1\x1b[0m')
    .replace(/\b(INFO|info|success|SUCCESS|OK|ok)\b/g, '\x1b[32m$1\x1b[0m')
    .replace(/\b(LOG|log|DEBUG|debug|trace|TRACE)\b/g, '\x1b[34m$1\x1b[0m')

  // Key-value pairs (e.g. status=active or db: postgres)
  formatted = formatted.replace(/(\b[a-zA-Z_][a-zA-Z0-9_-]*\s*[:=]\s*)([^/\s][^\s]*)/g, (match, key, val) => {
    if (val.startsWith('http') || val.startsWith('//') || key.toLowerCase().includes('http') || key.toLowerCase().includes('at')) {
      return match
    }
    const colorVal = /^\d+$/.test(val) ? `\x1b[36m${val}\x1b[0m` : `\x1b[32m${val}\x1b[0m`
    return `\x1b[96m${key}\x1b[0m${colorVal}`
  })

  // Underline URLs
  formatted = formatted.replace(/(https?:\/\/[^\s]+)/g, '\x1b[4;34m$1\x1b[0m')

  return formatted
}

function stateColor(s: string): string {
  if (s === 'running') return 'var(--accent)'
  if (s === 'completed') return 'var(--green)'
  if (s === 'failed') return 'var(--red)'
  return 'var(--text-muted)'
}

function stateBg(s: string): string {
  if (s === 'running') return 'rgba(124, 77, 255, 0.12)'
  if (s === 'completed') return 'rgba(0, 230, 118, 0.12)'
  if (s === 'failed') return 'rgba(248, 81, 73, 0.12)'
  return 'rgba(128, 128, 128, 0.12)'
}

function stateBorder(s: string): string {
  if (s === 'running') return 'rgba(124, 77, 255, 0.35)'
  if (s === 'completed') return 'rgba(0, 230, 118, 0.35)'
  if (s === 'failed') return 'rgba(248, 81, 73, 0.35)'
  return 'rgba(128, 128, 128, 0.3)'
}

export function DashboardLogsPage(): ReactElement {
const { t } = useTranslation('dashboard')
  const [activeSource, setActiveSource] = useState<{
    type: 'compose' | 'job' | 'unified' | 'container'
    id?: string
    label: string
}>({ type: 'unified', label: t('logs.unifiedLabel') })
  const [searchText, setSearchText] = useState('')
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [containers, setContainers] = useState<ContainerRow[]>([])

  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const streamIdRef = useRef<string | null>(null)
  const unlistenRef = useRef<(() => void) | null>(null)

  const refreshJobs = useCallback(async () => {
    try {
      const list = (await window.dh.jobsList()) as JobSummary[]
      setJobs(Array.isArray(list) ? list : [])
    } catch {
      setJobs([])
    }
  }, [])

  const refreshContainers = useCallback(async () => {
    try {
      const res = await window.dh.dockerList()
      const bag = res as { ok: boolean; rows?: ContainerRow[] }
      if (bag && bag.ok && Array.isArray(bag.rows)) {
        setContainers(bag.rows)
      } else {
        setContainers([])
      }
    } catch {
      setContainers([])
    }
  }, [])

  const startStream = useCallback(async () => {
    // Stop previous stream
    if (streamIdRef.current) {
      await window.dh.logStreamStop({ streamId: streamIdRef.current }).catch(() => {})
      streamIdRef.current = null
    }
    if (unlistenRef.current) {
      unlistenRef.current()
      unlistenRef.current = null
    }

    const term = terminalRef.current
    if (!term) return

    term.write(`\r\n\x1b[90m--- ${activeSource.label} ---\x1b[0m\r\n`)

    try {
      const res = await window.dh.logStreamStart({
        source: activeSource.type as 'compose' | 'container' | 'unified',
        id: activeSource.id,
      })
      if (!res.ok) return
      streamIdRef.current = res.streamId

      const unlisten = await listen<{ streamId: string; source: string; line: string }>(
        'dh:log:line',
        (event) => {
          if (event.payload.streamId !== streamIdRef.current) return
          const t = terminalRef.current
          if (!t) return
          const atBottom = t.buffer.active.viewportY >= t.buffer.active.length - t.rows - 1
          t.write(colorizeLine(event.payload.line) + '\r\n')
          if (atBottom) t.scrollToBottom()
        }
      )
      unlistenRef.current = unlisten
    } catch (e) {
      term.write(`\x1b[31m[stream error: ${e instanceof Error ? e.message : String(e)}]\x1b[0m\r\n`)
    }
  }, [activeSource])

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: getThemeColors(),
      fontSize: 12,
      fontFamily: 'Consolas, "Liberation Mono", Menlo, Courier, monospace',
      cursorBlink: true,
      convertEol: true,
      rows: 24,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    
    // Slight delay to ensure parent container dimensions are populated
    setTimeout(() => {
      try {
        fitAddon.fit()
      } catch (err) {
        console.warn("xterm fit error", err)
      }
    }, 50)

    terminalRef.current = term
    fitAddonRef.current = fitAddon

    // Set up MutationObserver to update theme dynamically when data-theme changes on documentElement
    const observer = new MutationObserver(() => {
      term.options.theme = getThemeColors()
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    const handleResize = () => {
      try {
        fitAddon.fit()
      } catch (err) {
        console.warn("xterm resize fit error", err)
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      observer.disconnect()
      term.dispose()
    }
  }, [])

  // Stream: start on source change, stop on unmount
  useEffect(() => {
    void startStream()
    return () => {
      if (streamIdRef.current) {
        void window.dh.logStreamStop({ streamId: streamIdRef.current })
        streamIdRef.current = null
      }
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
    }
  }, [startStream])

  // Poll jobs/containers for the sidebar source list (slower, 5s)
  useEffect(() => {
    void refreshJobs()
    void refreshContainers()
    const id = setInterval(() => {
      void refreshJobs()
      void refreshContainers()
    }, 5000)
    return () => clearInterval(id)
  }, [refreshJobs, refreshContainers])

  const runningJobs = jobs.filter((j) => j.state === 'running')
  const doneJobs = jobs.filter((j) => j.state !== 'running').slice(-12)
  const allJobsDisplay = [...runningJobs, ...doneJobs]

  return (
    <div className="elevated-page logs-page">
      {/* ── Hero ── */}
      <div className="logs-hero-section">
        <div>
          <div className="logs-eyebrow">
            <span className="codicon codicon-output" />
            {t('logs.heroEyebrow')}
          </div>
          <h1 className="logs-title">{t('logs.heroTitle')}</h1>
          <p className="logs-subtitle">
{t('logs.heroSubtitle')}
          </p>
        </div>
      </div>

      {/* ── Dashboard Grid ── */}
      <div className="logs-dashboard-grid">
        {/* Left Column: Compose Terminal */}
        <div className="logs-main-col">
          <div className="logs-card-container">
            <div className="logs-card-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="logs-card-header-title">
                  <span className="codicon codicon-terminal" style={{ color: 'var(--accent)' }} />
                  {activeSource.label}
                </div>
              </div>
              <div className="logs-controls" style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', flexWrap: 'wrap' }}>
                {/* Search Input */}
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                  <span className="codicon codicon-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13 }} />
                  <input
                    type="text"
placeholder={t('logs.searchPlaceholder')}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 32px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-input)',
                      color: 'var(--text)',
                      fontSize: 13,
                    }}
                  />
                  {searchText && (
                    <button
                      type="button"
                      onClick={() => setSearchText('')}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      <span className="codicon codicon-close" style={{ fontSize: 12 }} />
                    </button>
                  )}
                </div>

                {/* Source Selector */}
                <div className="logs-select-wrapper" style={{ minWidth: 200 }}>
                  <select
                    className="logs-select"
                    value={activeSource.type === 'unified' ? 'unified' : `${activeSource.type}:${activeSource.id}`}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === 'unified') {
setActiveSource({ type: 'unified', label: t('logs.unifiedLabel') })
                      } else {
                        const [type, ...rest] = val.split(':')
                        const id = rest.join(':')
                        if (type === 'compose') {
                          setActiveSource({ type: 'compose', id, label: `${t('logs.composeLabel')}: ${id}` })
                        } else if (type === 'container') {
                          const container = containers.find(c => c.id === id)
                          setActiveSource({ type: 'container', id, label: `${t('logs.containerLabel')}: ${container?.name || id}` })
                        } else if (type === 'job') {
                          const job = jobs.find(j => j.id === id)
                          setActiveSource({ type: 'job', id, label: `${t('logs.jobLabel')}: ${job?.kind || id}` })
                        }
                      }
                    }}
                  >
<option value="unified">{t('logs.unifiedLabel')}</option>
                    <optgroup label={t('logs.composeProfilesGroup')}>
                      {profiles.map((p) => (
                        <option key={p} value={`compose:${p}`}>{t('logs.composeLabel')}: {p}</option>
                      ))}
                    </optgroup>
                    {containers.length > 0 && (
                      <optgroup label={t('logs.activeContainersGroup')}>
                        {containers.map((c) => (
                          <option key={c.id} value={`container:${c.id}`}>{t('logs.containerLabel')}: {c.name} ({c.state})</option>
                        ))}
                      </optgroup>
                    )}
                    {jobs.length > 0 && (
<optgroup label={t('logs.jobsGroup')}>
                        {jobs.map((j) => (
                          <option key={j.id} value={`job:${j.id}`}>{t('logs.jobLabel')}: {j.kind.replace(/_/g, ' ')} ({j.state})</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <span className="codicon codicon-chevron-down logs-select-arrow" />
                </div>

                <button
                  type="button"
                  className="logs-btn"
                  onClick={() => void startStream()}
                >
                  <span className="codicon codicon-refresh" style={{ marginRight: 6 }} />
{t('logs.refresh')}
                </button>
              </div>
            </div>
            <div style={{ position: 'relative', width: '100%', height: 480, background: 'var(--bg-terminal, #1e1e1e)', borderRadius: 8, padding: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
            </div>
          </div>
        </div>

        {/* Right Column: Job History & Progress */}
        <div className="logs-side-col">
          {/* Running Job Banners */}
          {runningJobs.length > 0 && (
            <div className="logs-active-jobs-group">
              <div className="logs-section-subtitle">{t('logs.activeProcesses')}</div>
              {runningJobs.map((j) => (
                <div key={j.id} className="logs-running-banner">
                  <div className="logs-banner-top">
                    <span className="logs-pulse-dot" />
                    <span className="logs-job-name">{j.kind.replace(/_/g, ' ')}</span>
                    <span className="logs-job-pct">{j.progress}%</span>
                  </div>
                  <div className="logs-progress-track">
                    <div className="logs-progress-fill" style={{ width: `${j.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Background Jobs Card */}
          <div className="logs-card-container">
            <div className="logs-card-header">
              <div className="logs-card-header-title">
                <span className="codicon codicon-run-all" style={{ color: 'var(--accent)' }} />
                {t('logs.jobHistory')}
              </div>
              <span
                className="logs-status-badge"
                style={{
                  color: runningJobs.length > 0 ? 'var(--accent)' : 'var(--text-muted)',
                  background: runningJobs.length > 0 ? 'rgba(124, 77, 255, 0.12)' : 'rgba(128, 128, 128, 0.12)',
                  border: `1px solid ${runningJobs.length > 0 ? 'rgba(124, 77, 255, 0.35)' : 'rgba(128, 128, 128, 0.3)'}`,
                }}
              >
                {runningJobs.length > 0 ? `${runningJobs.length} ${t('logs.active')}` : t('logs.idle')}
              </span>
            </div>

            {allJobsDisplay.length === 0 ? (
              <div className="logs-empty-state">
                <span className="codicon codicon-history" style={{ fontSize: 32, color: 'var(--text-muted)' }} />
                <p className="logs-empty-title">{t('logs.noJobsRecorded')}</p>
                <p className="logs-empty-desc">
                  {t('logs.noJobsDescription')}
                </p>
              </div>
            ) : (
              <div className="logs-jobs-list">
                {allJobsDisplay.map((j, i) => {
                  const isActive = activeSource.type === 'job' && activeSource.id === j.id
                  return (
                    <div
                      key={j.id}
onClick={() => setActiveSource({ type: 'job', id: j.id, label: `${t('logs.jobLabel')}: ${j.kind.replace(/_/g, ' ')}` })}
                      className="logs-job-row"
                      style={{
                        borderBottom: i < allJobsDisplay.length - 1 ? '1px solid var(--border)' : 'none',
                        cursor: 'pointer',
                        background: isActive ? 'rgba(124, 77, 255, 0.08)' : 'transparent',
                        padding: '12px 8px',
                        borderRadius: 6,
                        borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div className="logs-job-row-top">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            className="logs-job-dot"
                            style={{
                              background: stateColor(j.state),
                              boxShadow: j.state === 'running' ? `0 0 6px ${stateColor(j.state)}` : 'none',
                            }}
                          />
                          <span className="logs-job-kind">{j.kind.replace(/_/g, ' ')}</span>
                        </div>
                        <span
                          className="logs-state-pill"
                          style={{
                            color: stateColor(j.state),
                            background: stateBg(j.state),
                            border: `1px solid ${stateBorder(j.state)}`,
                          }}
                        >
                          {j.state}
                        </span>
                      </div>
{j.logTail && j.logTail.length > 0 && (
                        <div className="logs-job-tail-snippet">
                          {j.logTail[j.logTail.length - 1]}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
