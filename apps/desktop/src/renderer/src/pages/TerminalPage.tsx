import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

export function TerminalPage(): ReactElement {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const sessionRef = useRef<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [fallbackHint, setFallbackHint] = useState(false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, monospace',
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

    void (async () => {
      const res = (await window.dh.terminalCreate({ cols: term.cols, rows: term.rows })) as
        | { ok: true; id: string }
        | { ok: false; error: string }
      if (!res.ok) {
        setErr(res.error)
        setFallbackHint(true)
        return
      }
      sessionRef.current = res.id
      setErr(null)
      setFallbackHint(false)
    })()

    const onData = (d: string): void => {
      const id = sessionRef.current
      if (id) window.dh.terminalWrite(id, d)
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
      const id = sessionRef.current
      if (id) window.dh.terminalResize(id, term.cols, term.rows)
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      offOut()
      offExit()
      term.dispose()
      sessionRef.current = null
    }
  }, [])

  async function openExternal(): Promise<void> {
    const r = (await window.dh.openExternalTerminal()) as { ok: boolean }
    if (!r.ok) setErr('Could not spawn a host terminal. Install xdg-terminal-emulator or similar.')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 420 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0 }}>Embedded terminal</h1>
        <button
          type="button"
          onClick={() => void openExternal()}
          style={{ cursor: 'pointer', padding: '8px 12px' }}
        >
          Open external terminal
        </button>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
        Uses node-pty in the main process. Sandboxed Flatpak builds may block PTYs—use the external
        launcher as a fallback.
      </p>
      {err ? (
        <div style={{ color: 'var(--orange)', marginBottom: 8 }}>
          {err}
          {fallbackHint ? ' Try “Open external terminal”.' : ''}
        </div>
      ) : null}
      <div
        ref={wrapRef}
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
