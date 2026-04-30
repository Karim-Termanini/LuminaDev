import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { TERMINAL_OPEN_EXTERNAL_HINT } from './environmentHints'
import { humanizeTerminalError } from './terminalError'

export function TerminalPage(): ReactElement {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const sessionRef = useRef<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [fallbackHint, setFallbackHint] = useState(false)

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
        const res = await window.dh.terminalCreate({ cols: term.cols, rows: term.rows })
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
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 420 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Embedded terminal</h1>
        <button 
          className="hp-btn hp-btn-primary" 
          onClick={() => void window.dh.openExternalTerminal()}
          title="Open your system's native terminal"
        >
          <span className="codicon codicon-terminal" aria-hidden /> Open External Terminal
        </button>
      </div>
      {err ? (
        <div style={{ color: 'var(--orange)', marginBottom: 8 }}>
          {err}
          {fallbackHint ? ` ${TERMINAL_OPEN_EXTERNAL_HINT}` : ''}
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
        }}
      />
    </div>
  )
}
