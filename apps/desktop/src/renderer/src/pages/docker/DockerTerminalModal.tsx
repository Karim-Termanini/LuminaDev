import type { ContainerRow } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { humanizeDockerError } from '../dockerError'

const modalOverlay: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
}

const modalContent: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-widget)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 20,
  display: 'flex',
  flexDirection: 'column',
}

const closeBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text)',
  fontSize: 24,
  cursor: 'pointer',
}

export function DockerTerminalModal({
  container,
  onClose,
}: {
  container: ContainerRow
  onClose: () => void
}): ReactElement {
  const termWrapRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const termIdRef = useRef<string | undefined>(undefined)
  const unlistenRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!termWrapRef.current) return
    const el = termWrapRef.current
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
    xtermRef.current = term

    void (async () => {
      let res: { ok: boolean; id?: string; error?: string }
      try {
        res = await window.dh.dockerTerminal({
          containerId: container.id,
          cols: term.cols,
          rows: term.rows,
        })
      } catch (e) {
        if (cancelled) return
        term.writeln(`\r\nError creating terminal: ${humanizeDockerError(e)}`)
        return
      }
      if (cancelled) {
        if (res.ok && res.id) window.dh.terminalClose(res.id)
        return
      }
      if (!res.ok || !res.id) {
        term.writeln(
          `\r\nError creating terminal: ${res.ok ? 'missing id' : humanizeDockerError(res.error ?? 'Terminal session failed.')}`
        )
        return
      }
      const tid = res.id
      termIdRef.current = tid

      const onData = (d: string): void => {
        const id = termIdRef.current
        if (id) {
          window.dh.terminalWrite(id, d)
        }
      }
      term.onData(onData)

      const offOut = window.dh.onTerminalData(({ id, data }: { id: string; data: string }) => {
        if (id === tid) term.write(data)
      })
      const offExit = window.dh.onTerminalExit(({ id }: { id: string }) => {
        if (id === tid) {
          term.writeln('\r\n[process exited — terminal remains open]')
          termIdRef.current = undefined
        }
      })
      unlistenRef.current = () => {
        offOut()
        offExit()
      }

      term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
        window.dh.terminalResize(tid, cols, rows)
      })
    })()

    const handleResize = () => fit.fit()
    window.addEventListener('resize', handleResize)

    return () => {
      cancelled = true
      window.removeEventListener('resize', handleResize)
      unlistenRef.current?.()
      unlistenRef.current = null
      const id = termIdRef.current
      if (id) window.dh.terminalClose(id)
      termIdRef.current = undefined
      term.dispose()
    }
  }, [container.id, onClose])

  return (
    <div style={modalOverlay}>
      <div style={{ ...modalContent, width: '90%', height: '80%', maxWidth: 1000 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <div style={{ fontWeight: 600 }}>Terminal: {container.name}</div>
          <button onClick={onClose} style={closeBtn}>
            &times;
          </button>
        </div>
        <div
          ref={termWrapRef}
          onClick={() => {
            const ta = termWrapRef.current?.querySelector(
              '.xterm-helper-textarea'
            ) as HTMLTextAreaElement | null
            ta?.focus()
          }}
          style={{
            flex: 1,
            background: '#0a0a0a',
            borderRadius: 8,
            padding: '16px',
            overflow: 'hidden',
          }}
        />
      </div>
    </div>
  )
}
