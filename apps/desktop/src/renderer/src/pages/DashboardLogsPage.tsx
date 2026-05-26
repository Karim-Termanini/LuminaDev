import { ComposeProfileSchema, type JobSummary, type ContainerRow, type ComposeProfile } from '@linux-dev-home/shared'
import './DashboardLogsPage.css'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

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
  const [activeSource, setActiveSource] = useState<{
    type: 'compose' | 'job' | 'unified' | 'container'
    id?: string
    label: string
  }>({ type: 'unified', label: 'Unified Log Feed' })
  const [searchText, setSearchText] = useState('')
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [containers, setContainers] = useState<ContainerRow[]>([])

  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef(false)

  const writeLogs = useCallback((text: string, filter: string) => {
    const term = terminalRef.current
    if (!term) return

    term.clear()
    
    const lines = text.split('\n')
    const filteredLines = filter
      ? lines.filter(line => line.toLowerCase().includes(filter.toLowerCase()))
      : lines

    if (filteredLines.length === 0) {
      term.write('\r\n(No lines matching search filter)\r\n')
    } else {
      for (const line of filteredLines) {
        term.write(colorizeLine(line) + '\r\n')
      }
    }
  }, [])

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

  const getUnifiedLogs = useCallback(async () => {
    let unified = '=== UNIFIED FEED (COMPOSE STACKS + RUNNING CONTAINERS + BACKGROUND JOBS) ===\r\n\r\n'
    
    const composeResults = await Promise.all(
      profiles.map(async (p) => {
        try {
          const res = await window.dh.composeLogs({ profile: p })
          if (res.ok && res.log) {
            return `--- Compose Profile: ${p} ---\r\n${res.log}\r\n`
          }
        } catch {
          // ignore
        }
        return ''
      })
    )
    unified += composeResults.filter(Boolean).join('\r\n')

    const containerResults = await Promise.all(
      containers.filter(c => c.state.toLowerCase() === 'running').map(async (c) => {
        try {
          const res = await window.dh.dockerLogs({ id: c.id, tail: 50 })
          let logStr = ''
          if (typeof res === 'string') {
            logStr = res
          } else if (res && typeof res === 'object' && 'ok' in res) {
            const bag = res as { ok: boolean; text?: string }
            if (bag.ok && bag.text) logStr = bag.text
          }
          if (logStr) {
            return `--- Container: ${c.name} (${c.image}) ---\r\n${logStr}\r\n`
          }
        } catch {
          // ignore
        }
        return ''
      })
    )
    unified += containerResults.filter(Boolean).join('\r\n')

    try {
      const list = (await window.dh.jobsList()) as JobSummary[]
      if (Array.isArray(list) && list.length > 0) {
        unified += '\r\n--- Background Job Logs ---\r\n'
        for (const j of list) {
          if (j.logTail && j.logTail.length > 0) {
            unified += `[Job: ${j.kind}] (${j.state})\r\n` + j.logTail.join('\r\n') + '\r\n\r\n'
          }
        }
      }
    } catch {
      // ignore
    }

    return unified
  }, [containers])

  const loadSourceLogs = useCallback(async () => {
    let rawText = ''
    if (activeSource.type === 'unified') {
      rawText = await getUnifiedLogs()
    } else if (activeSource.type === 'compose') {
      try {
        const res = await window.dh.composeLogs({ profile: activeSource.id as ComposeProfile })
        rawText = res.ok ? res.log || '(no output yet)' : res.error || '(error fetching logs)'
      } catch (e) {
        rawText = `Error: ${e instanceof Error ? e.message : String(e)}`
      }
    } else if (activeSource.type === 'container') {
      try {
        const res = await window.dh.dockerLogs({ id: activeSource.id!, tail: 200 })
        if (typeof res === 'string') {
          rawText = res || '(no output yet)'
        } else if (res && typeof res === 'object' && 'ok' in res) {
          const bag = res as { ok: boolean; text?: string; error?: string }
          rawText = bag.ok ? bag.text || '(no output yet)' : bag.error || '(error fetching logs)'
        } else {
          rawText = '(no output yet)'
        }
      } catch (e) {
        rawText = `Error: ${e instanceof Error ? e.message : String(e)}`
      }
    } else if (activeSource.type === 'job') {
      const job = jobs.find(j => j.id === activeSource.id)
      if (job) {
        rawText = `=== Background Job: ${job.kind} (${job.state}) ===\r\n` +
          `Progress: ${job.progress}%\r\n\r\n` +
          `--- Logs ---\r\n` +
          (job.logTail || []).join('\r\n')
      } else {
        rawText = `Job with ID ${activeSource.id} not found.`
      }
    }

    writeLogs(rawText, searchText)
  }, [activeSource, searchText, jobs, getUnifiedLogs, writeLogs])

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

  useEffect(() => {
    void loadSourceLogs()
  }, [loadSourceLogs])

  useEffect(() => {
    activeRef.current = jobs.some(j => j.state === 'running') || containers.some(c => c.state === 'running')
  }, [jobs, containers])

  useEffect(() => {
    void refreshJobs()
    void refreshContainers()
    const id = setInterval(() => {
      if (activeRef.current) {
        void refreshJobs()
        void refreshContainers()
      }
    }, 2000)
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
            Dashboard · Logs
          </div>
          <h1 className="logs-title">Logs &amp; Activity</h1>
          <p className="logs-subtitle">
            Compose stack output, docker container logs, and background job history.
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
                    placeholder="Search logs (filtering line-by-line)..."
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
                        setActiveSource({ type: 'unified', label: 'Unified Log Feed' })
                      } else {
                        const [type, ...rest] = val.split(':')
                        const id = rest.join(':')
                        if (type === 'compose') {
                          setActiveSource({ type: 'compose', id, label: `Compose: ${id}` })
                        } else if (type === 'container') {
                          const container = containers.find(c => c.id === id)
                          setActiveSource({ type: 'container', id, label: `Container: ${container?.name || id}` })
                        } else if (type === 'job') {
                          const job = jobs.find(j => j.id === id)
                          setActiveSource({ type: 'job', id, label: `Job: ${job?.kind || id}` })
                        }
                      }
                    }}
                  >
                    <option value="unified">Unified Log Feed</option>
                    <optgroup label="Docker Compose Profiles">
                      {profiles.map((p) => (
                        <option key={p} value={`compose:${p}`}>Compose: {p}</option>
                      ))}
                    </optgroup>
                    {containers.length > 0 && (
                      <optgroup label="Active Docker Containers">
                        {containers.map((c) => (
                          <option key={c.id} value={`container:${c.id}`}>Container: {c.name} ({c.state})</option>
                        ))}
                      </optgroup>
                    )}
                    {jobs.length > 0 && (
                      <optgroup label="Background Jobs">
                        {jobs.map((j) => (
                          <option key={j.id} value={`job:${j.id}`}>Job: {j.kind.replace(/_/g, ' ')} ({j.state})</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <span className="codicon codicon-chevron-down logs-select-arrow" />
                </div>

                <button
                  type="button"
                  className="logs-btn"
                  onClick={() => void loadSourceLogs()}
                >
                  <span className="codicon codicon-refresh" style={{ marginRight: 6 }} />
                  Refresh
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
              <div className="logs-section-subtitle">Active Processes</div>
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
                Job History
              </div>
              <span
                className="logs-status-badge"
                style={{
                  color: runningJobs.length > 0 ? 'var(--accent)' : 'var(--text-muted)',
                  background: runningJobs.length > 0 ? 'rgba(124, 77, 255, 0.12)' : 'rgba(128, 128, 128, 0.12)',
                  border: `1px solid ${runningJobs.length > 0 ? 'rgba(124, 77, 255, 0.35)' : 'rgba(128, 128, 128, 0.3)'}`,
                }}
              >
                {runningJobs.length > 0 ? `${runningJobs.length} active` : 'idle'}
              </span>
            </div>

            {allJobsDisplay.length === 0 ? (
              <div className="logs-empty-state">
                <span className="codicon codicon-history" style={{ fontSize: 32, color: 'var(--text-muted)' }} />
                <p className="logs-empty-title">No jobs recorded</p>
                <p className="logs-empty-desc">
                  Install a runtime or switch compose profiles to initiate tasks.
                </p>
              </div>
            ) : (
              <div className="logs-jobs-list">
                {allJobsDisplay.map((j, i) => {
                  const isActive = activeSource.type === 'job' && activeSource.id === j.id
                  return (
                    <div
                      key={j.id}
                      onClick={() => setActiveSource({ type: 'job', id: j.id, label: `Job: ${j.kind.replace(/_/g, ' ')}` })}
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
