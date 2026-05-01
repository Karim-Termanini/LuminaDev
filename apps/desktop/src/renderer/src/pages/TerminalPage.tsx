import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { TERMINAL_OPEN_EXTERNAL_HINT, TERMINAL_PTY_HINT } from './environmentHints'
import { humanizeTerminalError } from './terminalError'

export function TerminalPage(): ReactElement {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const sessionRef = useRef<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [fallbackHint, setFallbackHint] = useState(false)
  const [sessionKey, setSessionKey] = useState(0)
  const [showConfig, setShowConfig] = useState(false)
  const [envVars, setEnvVars] = useState<string>('')
  const [activeEnv, setActiveEnv] = useState<Record<string, string>>({})
  const [shellCmd, setShellCmd] = useState<string>('/bin/bash')
  const [fullEnv, setFullEnv] = useState<Record<string, string>>({})
  const [showAllEnv, setShowAllEnv] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let cancelled = false

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, monospace',
      convertEol: true,
      theme: {
        background: '#0d0d0d',
        foreground: '#e8e8e8',
        cursor: '#7c4dff',
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    fit.fit()
    term.focus()

    void (async () => {
      try {
        const envObj: Record<string, string> = {}
        envVars.split('\n').forEach((line) => {
          const [key, ...rest] = line.split('=')
          const trimmedKey = key?.trim()
          if (trimmedKey) {
            envObj[trimmedKey] = rest.join('=').trim()
          }
        })

        setActiveEnv(envObj)

        const res = await window.dh.terminalCreate({
          cols: term.cols,
          rows: term.rows,
          cmd: shellCmd,
          env: envObj,
        })
        if (cancelled) {
          if (res.ok && res.id) window.dh.terminalClose(res.id)
          return
        }
        if (!res.ok) {
          setErr(humanizeTerminalError(res.error))
          setFallbackHint(true)
          return
        }
        if (!res.id) {
          setErr(humanizeTerminalError('[TERMINAL_UNKNOWN] Missing terminal session id.'))
          setFallbackHint(true)
          return
        }
        sessionRef.current = res.id
        setErr(null)
        setFallbackHint(false)
      } catch (e) {
        setErr(humanizeTerminalError(e))
        setFallbackHint(true)
        return
      }
    })()

    const onData = (d: string): void => {
      const id = sessionRef.current
      if (id) {
        window.dh.terminalWrite(id, d)
      }
    }
    term.onData(onData)

    const offOut = window.dh.onTerminalData(({ id, data }) => {
      if (id === sessionRef.current) term.write(data)
    })
    const offExit = window.dh.onTerminalExit(({ id }) => {
      if (id === sessionRef.current) {
        term.writeln('\r\n[session ended]')
        sessionRef.current = null
      }
    })

    const ro = new ResizeObserver(() => {
      fit.fit()
      term.focus()
      const id = sessionRef.current
      if (id) window.dh.terminalResize(id, term.cols, term.rows)
    })
    ro.observe(el)

    return () => {
      cancelled = true
      ro.disconnect()
      offOut()
      offExit()
      const sid = sessionRef.current
      if (sid) window.dh.terminalClose(sid)
      sessionRef.current = null
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 420 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Embedded terminal</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={`hp-btn ${showConfig ? 'hp-btn-primary' : ''}`}
            onClick={() => setShowConfig(!showConfig)}
            title="Configure terminal session"
          >
            <span className="codicon codicon-settings" aria-hidden /> Configuration
          </button>
          <button
            className="hp-btn hp-btn-primary"
            onClick={() => void window.dh.openExternalTerminal()}
            title="Open your system's native terminal"
          >
            <span className="codicon codicon-terminal" aria-hidden /> Open External Terminal
          </button>
        </div>
      </div>

      {showConfig && (
        <div className="hp-card" style={{ marginBottom: 16, display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) 2fr', gap: 20 }}>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <div className="hp-section-title">Terminal Configuration</div>
              <div style={{ display: 'grid', gap: 8 }}>
                <label className="hp-muted">Shell Command</label>
                <input 
                  className="hp-input mono" 
                  value={shellCmd} 
                  onChange={e => setShellCmd(e.target.value)}
                  placeholder="/bin/bash"
                />
              </div>
            </div>
            <div>
              <div className="hp-muted" style={{ marginBottom: 8 }}>
                Edit Environment Variables (<code>KEY=VALUE</code>)
              </div>
              <textarea
                className="hp-input mono"
                style={{ width: '100%', minHeight: 120, resize: 'vertical' }}
                placeholder="MY_VAR=hello&#10;DEBUG=lumina"
                value={envVars}
                onChange={(e) => setEnvVars(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <button className="hp-btn hp-btn-primary" onClick={() => setSessionKey((k) => k + 1)}>
                <span className="codicon codicon-refresh" aria-hidden /> Apply & Restart Terminal
              </button>
            </div>
          </div>

          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 20, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div className="hp-section-title" style={{ margin: 0, fontSize: 14 }}>Active Environment</div>
              <div style={{ position: 'relative', flex: '1 1 150px' }}>
                <span className="codicon codicon-search" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-muted)' }} />
                <input 
                  className="hp-input" 
                  style={{ paddingLeft: 28, width: '100%', height: 28, fontSize: 12, borderRadius: 6 }} 
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <button 
                className="hp-btn" 
                style={{ fontSize: 11, height: 28, padding: '0 10px', whiteSpace: 'nowrap' }}
                onClick={async () => {
                  if (!showAllEnv && Object.keys(fullEnv).length === 0) {
                    const res = await window.dh.terminalGetAllEnv()
                    if (res.ok) setFullEnv(res.env)
                  }
                  setShowAllEnv(!showAllEnv)
                }}
              >
                <span className={`codicon ${showAllEnv ? 'codicon-filter-filled' : 'codicon-filter'}`} style={{ marginRight: 4, fontSize: 12 }} />
                {showAllEnv ? 'Custom' : 'All (System)'}
              </button>
            </div>
            <div className="hp-muted" style={{ marginBottom: 12 }}>
              {showAllEnv ? 'Showing all environment variables inherited by the shell.' : 'Showing custom variables applied to this session.'}
            </div>
            <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 4, padding: 8, background: 'rgba(0,0,0,0.2)', flex: 1 }}>
              {(() => {
                const displayEnv = showAllEnv ? { ...fullEnv, ...activeEnv } : activeEnv
                const q = searchQuery.toLowerCase()
                const keys = Object.keys(displayEnv)
                  .filter(k => k.toLowerCase().includes(q) || displayEnv[k].toLowerCase().includes(q))
                  .sort()
                if (keys.length > 0) {
                  return (
                    <div style={{ display: 'grid', gap: 4 }}>
                      {keys.map((k) => (
                        <div key={k} style={{ display: 'flex', gap: 8, fontSize: 11, borderBottom: '1px solid var(--border)', paddingBottom: 4, marginBottom: 4 }}>
                          <span style={{ color: showAllEnv && activeEnv[k] ? 'var(--orange)' : 'var(--accent)', fontWeight: 600 }}>{k}</span>
                          <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>= {displayEnv[k]}</span>
                        </div>
                      ))}
                    </div>
                  )
                }
                return <div className="hp-muted" style={{ fontStyle: 'italic', textAlign: 'center', marginTop: 40 }}>No variables to display.</div>
              })()}
            </div>
          </div>
        </div>
      )}
      {err ? (
        <div style={{ color: 'var(--orange)', marginBottom: 8 }}>
          {err}
          {fallbackHint ? ` ${TERMINAL_PTY_HINT} ${TERMINAL_OPEN_EXTERNAL_HINT}` : ''}
        </div>
      ) : null}
      <div
        ref={wrapRef}
        onClick={() => {
          const xtermScreen = wrapRef.current?.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null
          xtermScreen?.focus()
        }}
        style={{
          flex: 1,
          minHeight: 360,
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          background: '#0d0d0d',
          padding: '16px',
        }}
      />
    </div>
  )
}
