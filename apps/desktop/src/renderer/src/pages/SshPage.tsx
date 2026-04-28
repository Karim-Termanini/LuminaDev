import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { SshBookmark } from '@linux-dev-home/shared'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

type Target = 'sandbox' | 'host'

type Session = {
  id: string
  termId?: string
  bmId: string
  bmName: string
  user: string
  host: string
  port: number
  status: 'connecting' | 'connected' | 'disconnected'
  startTime: number
}

export function SshPage(): ReactElement {
  const [target] = useState<Target>('host')
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [pubKey, setPubKey] = useState('')
  const [testOk, setTestOk] = useState<boolean | null>(null)
  const [testResult, setTestResult] = useState('')
  const [status, setStatus] = useState('')
  const [bookmarks, setBookmarks] = useState<SshBookmark[]>([])

  const [newBmName, setNewBmName] = useState('')
  const [newBmUser, setNewBmUser] = useState('')
  const [newBmHost, setNewBmHost] = useState('')
  const [newBmPort, setNewBmPort] = useState('22')

  const [passModalSess, setPassModalSess] = useState<Session | null>(null)
  const [passInput, setPassInput] = useState('')

  const [sessions, setSessions] = useState<Session[]>([])
  const [activeTermSession, setActiveTermSession] = useState<Session | null>(null)

  // --- File Transfer ---
  const [ftSession, setFtSession] = useState<Session | null>(null)
  const [ftDirection, setFtDirection] = useState<'upload' | 'download'>('upload')
  const [ftLocalPaths, setFtLocalPaths] = useState<string[]>([])  // multiple selected files
  const [ftLocalDestDir, setFtLocalDestDir] = useState('')         // destination folder for download
  const [ftRemotePath, setFtRemotePath] = useState('.')
  const [ftTool, setFtTool] = useState<'scp' | 'rsync'>('scp')
  const [ftStatus, setFtStatus] = useState('')
  const [remoteEntries, setRemoteEntries] = useState<string[]>([])
  const [remoteBrowsing, setRemoteBrowsing] = useState(false)
  const [fingerprint, setFingerprint] = useState('')

  const termWrapRef = useRef<HTMLDivElement | null>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const pendingTransferCmdRef = useRef<string | null>(null)
  const connectedCount = sessions.filter((s) => s.status === 'connected').length

  function setPendingTransferCmd(cmd: string): void {
    pendingTransferCmdRef.current = cmd
  }

  useEffect(() => {
    void loadBookmarks()
  }, [])

  async function loadBookmarks(): Promise<void> {
    try {
      const res = (await window.dh.storeGet({ key: 'ssh_bookmarks' })) as SshBookmark[] | null
      if (res) setBookmarks(res)
    } catch (e) {
      console.error('Failed to load ssh bookmarks', e)
    }
  }

  async function saveBookmarks(next: SshBookmark[]): Promise<void> {
    setBookmarks(next)
    try {
      await window.dh.storeSet({ key: 'ssh_bookmarks', data: next })
    } catch (e) {
      console.error('Failed to save ssh bookmarks', e)
    }
  }

  async function generate(): Promise<void> {
    setBusy(true)
    setStatus('Generating key...')
    try {
      await window.dh.sshGenerate({ target, email })
      setStatus('SSH key generated successfully!')
      await loadPub()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function loadPub(): Promise<void> {
    setBusy(true)
    try {
      const res = (await window.dh.sshGetPub({ target })) as { pub: string; fingerprint: string } | null
      if (res) {
        setPubKey(res.pub)
        setFingerprint(res.fingerprint)
      } else {
        setPubKey('')
        setFingerprint('')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  async function copyPub(): Promise<void> {
    if (!pubKey) {
      alert('Please load the key first.')
      return
    }
    try {
      await navigator.clipboard.writeText(pubKey)
      setStatus('Public key copied to clipboard! ✅')
    } catch (err) {
      console.error('Clipboard error:', err)
    }
  }

  function setupKeysOnServer(sess: Session): void {
    setPassModalSess(sess)
    setPassInput('')
  }

  async function runSetupWithPassword(): Promise<void> {
    if (!passModalSess) return
    const sess = passModalSess
    const password = passInput
    
    setPassModalSess(null)
    setPassInput('')
    setBusy(true)
    setStatus(`Activating remote browser for ${sess.host}...`)

    try {
      const pubRes = await window.dh.sshGetPub({ target: 'host' })
      if (!pubRes || !pubRes.pub) {
        setStatus('⚠ Error: No SSH key found. Generate one in the Wizard first.')
        return
      }

      const setupRes = await window.dh.sshSetupRemoteKey({
        user: sess.user,
        host: sess.host,
        port: sess.port,
        password,
        publicKey: pubRes.pub.trim()
      })

      if (setupRes.ok) {
        setStatus(`Remote browser activated for ${sess.host}! ✅`)
      } else {
        setStatus(`Failed to activate: ${setupRes.error}`)
      }
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  async function testGithub(): Promise<void> {
    setBusy(true)
    setStatus('Testing connection to GitHub...')
    setTestOk(null)
    setTestResult('')
    try {
      const res = (await window.dh.sshTestGithub({ target })) as {
        ok: boolean
        output: string
        code: number | null
      }
      setTestResult(res.output)
      setTestOk(res.ok)
      setStatus(res.ok ? '✅ Connected to GitHub successfully!' : `❌ Test failed (code ${res.code ?? 'n/a'}).`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
      setTestOk(false)
    } finally {
      setBusy(false)
    }
  }

  function addBookmark(): void {
    if (!newBmName || !newBmHost) return
    const bm: SshBookmark = {
      id: Date.now().toString(),
      name: newBmName.trim(),
      user: newBmUser.trim() || 'root',
      host: newBmHost.trim(),
      port: Number(newBmPort) || 22,
    }
    const next = [...bookmarks, bm]
    void saveBookmarks(next)
    setNewBmName('')
    setNewBmUser('')
    setNewBmHost('')
    setNewBmPort('22')
  }

  function deleteBookmark(id: string): void {
    const next = bookmarks.filter((b) => b.id !== id)
    void saveBookmarks(next)
  }

  // --- Embedded Terminal Logic ---
  
  // Cleanup terminal when unmounting modal
  useEffect(() => {
    if (!activeTermSession || !termWrapRef.current) return
    const el = termWrapRef.current

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 13,
      theme: { background: '#0a0a0a', foreground: '#e8e8e8', cursor: '#7c4dff' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    fit.fit()
    xtermRef.current = term
    fitRef.current = fit

    let tid: string | undefined = undefined

    void (async () => {
      const sshArgs = ['-p', String(activeTermSession.port), `${activeTermSession.user}@${activeTermSession.host}`]
      const res = (await window.dh.terminalCreate({ 
        cols: term.cols, 
        rows: term.rows,
        cmd: 'ssh',
        args: sshArgs
      })) as
        | { ok: true; id: string }
        | { ok: false; error: string }
      if (!res.ok) {
        term.writeln(`\r\nError creating terminal: ${res.error}`)
        return
      }
      tid = res.id
      // Update session with termId
      setSessions((prev) => prev.map(s => s.id === activeTermSession.id ? { ...s, termId: tid, status: 'connected' } : s))

      // If there is a pending transfer command, run it immediately
      const transferCmd = pendingTransferCmdRef.current
      if (transferCmd) {
        pendingTransferCmdRef.current = null
        setTimeout(() => {
          window.dh.terminalWrite(res.id, transferCmd + '\r')
        }, 300)
      }
    })()

    const onData = (d: string): void => {
      if (tid) window.dh.terminalWrite(tid, d)
    }
    term.onData(onData)

    const offOut = window.dh.onTerminalData(({ id, data }) => {
      if (id === tid) term.write(data)
    })
    
    const offExit = window.dh.onTerminalExit(({ id }) => {
      if (id === tid) {
        term.writeln('\r\n[session ended]')
        setSessions((prev) => prev.map(s => s.id === activeTermSession.id ? { ...s, status: 'disconnected', termId: undefined } : s))
      }
    })

    const ro = new ResizeObserver(() => {
      fit.fit()
      if (tid) window.dh.terminalResize(tid, term.cols, term.rows)
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      offOut()
      offExit()
      term.dispose()
      xtermRef.current = null
      fitRef.current = null
    }
  }, [activeTermSession]) // Re-run if we open a new modal for a specific session

  async function handleConnect(bm: SshBookmark): Promise<void> {
    // Check if local identity exists, if not, generate one silently
    const pubRes = await window.dh.sshGetPub({ target: 'host' })
    if (!pubRes?.pub) {
      await generate()
    }

    const sId = Date.now().toString()
    const newSession: Session = {
      id: sId,
      bmId: bm.id,
      bmName: bm.name,
      user: bm.user,
      host: bm.host,
      port: bm.port,
      status: 'connecting',
      startTime: Date.now(),
    }
    setSessions((prev) => [newSession, ...prev])
    setActiveTermSession(newSession) // Open modal
  }

  function handleDisconnect(sess: Session): void {
    if (sess.termId) {
      window.dh.terminalWrite(sess.termId, '\r~.\rexit\r')
    }
    setSessions((prev) => prev.map((s) => s.id === sess.id ? { ...s, status: 'disconnected', termId: undefined } : s))
  }

  async function pickLocalFiles(): Promise<void> {
    const paths = await window.dh.filePickOpen({ multiple: true })
    if (paths.length > 0) setFtLocalPaths(paths)
  }

  async function pickLocalDestDir(): Promise<void> {
    const dir = await window.dh.filePickSave()
    if (dir) setFtLocalDestDir(dir)
  }

  async function browseRemote(path: string): Promise<void> {
    if (!ftSession) { setFtStatus('Select a session first.'); return }
    setRemoteBrowsing(true)
    setFtStatus('Browsing remote directory...')
    try {
      const res = await window.dh.sshListDir({ user: ftSession.user, host: ftSession.host, port: ftSession.port, remotePath: path })
      if (res.ok) {
        setRemoteEntries(res.entries.filter(e => e !== '.'))
        setFtRemotePath(path)
        setFtStatus('')
      } else {
        setFtStatus(`⚠ Cannot browse: ${res.error ?? 'Unknown error'}. Enter path manually.`)
      }
    } finally {
      setRemoteBrowsing(false)
    }
  }

  function runTransfer(): void {
    if (!ftSession) { setFtStatus('Please select a session first.'); return }

    const remote = `${ftSession.user}@${ftSession.host}`
    let cmd = ''

    if (ftDirection === 'upload') {
      if (ftLocalPaths.length === 0) { setFtStatus('Please select files to upload first.'); return }
      if (!ftRemotePath.trim()) { setFtStatus('Please select a remote destination folder.'); return }
      const files = ftLocalPaths.map(p => `"${p}"`).join(' ')
      cmd = ftTool === 'scp'
        ? `scp -P ${ftSession.port} -r ${files} ${remote}:${ftRemotePath}`
        : `rsync -avz -e 'ssh -p ${ftSession.port}' ${files} ${remote}:${ftRemotePath}`
    } else {
      if (!ftRemotePath.trim()) { setFtStatus('Please select a remote source file/folder.'); return }
      const localDest = ftLocalDestDir || '.'
      cmd = ftTool === 'scp'
        ? `scp -P ${ftSession.port} -r ${remote}:"${ftRemotePath}" "${localDest}"`
        : `rsync -avz -e 'ssh -p ${ftSession.port}' ${remote}:"${ftRemotePath}" "${localDest}"`
    }

    const sId = Date.now().toString()
    const newSession: Session = {
      id: sId,
      bmId: ftSession.bmId,
      bmName: `📦 Transfer → ${ftSession.bmName}`,
      user: ftSession.user,
      host: ftSession.host,
      port: ftSession.port,
      status: 'connecting',
      startTime: Date.now(),
    }
    setPendingTransferCmd(cmd)
    setSessions((prev) => [newSession, ...prev])
    setActiveTermSession(newSession)
    setFtStatus(`Launching transfer terminal...`)
    setFtSession(null) // Close modal
  }

  function resetFtState(sess: Session, dir: 'upload' | 'download') {
    setFtSession(sess)
    setFtDirection(dir)
    setFtLocalPaths([])
    setFtLocalDestDir('')
    setFtRemotePath('.')
    setFtStatus('')
    setRemoteEntries([])
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, paddingBottom: 40, alignItems: 'start' }}>
      
      {/* LEFT COLUMN: Setup & Bookmarks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <header>
          <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>SETTINGS.SSH</div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>SSH Identity & Servers</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: 10 }}>
            Configure your local identity and manage your remote connections securely.
          </p>
        </header>

        {/* SSH Identity Wizard Section */}
        <section>
          <h2 style={{ fontSize: 18, marginBottom: 16 }}>Local Identity Setup</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            
            <div className="hp-card">
              <div style={stepCircle}>1</div>
              <div>
                <h3 style={stepTitle}>Generate Local ID</h3>
                <p style={stepText}>Create a secure SSH key to identify this machine to remote servers.</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Label / Email (Optional)" className="hp-input" style={{ flex: 1 }} />
                  <button type="button" className="hp-btn hp-btn-primary" onClick={() => void generate()} disabled={busy}>Generate Key</button>
                </div>
              </div>
            </div>

            <div className="hp-card">
              <div style={stepCircle}>2</div>
              <div style={{ flex: 1 }}>
                <h3 style={stepTitle}>Identity Options</h3>
                <p style={stepText}>Copy your public key for manual setup, or use the automatic "Enable Remote Access" button after connecting.</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button type="button" className="hp-btn" onClick={() => { void loadPub().then(copyPub) }} disabled={busy}>Copy Public Key</button>
                  <button type="button" className="hp-btn" onClick={() => void testGithub()} disabled={busy}>Test GitHub Connection</button>
                </div>
                {fingerprint && (
                  <div style={{ marginTop: 12, fontSize: 12, padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6 }}>
                    <span style={{ color: 'var(--text-muted)', marginRight: 8 }}>Fingerprint:</span>
                    <span className="mono">{fingerprint}</span>
                  </div>
                )}
                {testOk !== null && (
                  <div style={{ marginTop: 8, fontSize: 12, padding: '8px 12px', background: testOk ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)', border: '1px solid ' + (testOk ? 'var(--green)' : 'var(--red)'), borderRadius: 6, whiteSpace: 'pre-wrap' }}>
                    <div style={{ fontWeight: 600, color: testOk ? 'var(--green)' : 'var(--red)', marginBottom: 4 }}>
                      {testOk ? '✅ GitHub Connection Successful' : '❌ GitHub Connection Failed'}
                    </div>
                    <div className="mono" style={{ fontSize: 11 }}>{testResult}</div>
                  </div>
                )}
                {pubKey && <textarea readOnly value={pubKey} style={{ ...area, marginTop: 12 }} />}
              </div>
            </div>

          </div>
          {status && (
            <div className={`hp-status-alert ${status.includes('✅') ? 'success' : status.includes('⚠') || status.includes('❌') ? 'warning' : ''}`} style={{ marginTop: 12 }}>
              <span style={{ fontSize: 18 }}>{status.includes('✅') ? '✔' : status.includes('⚠') || status.includes('❌') ? '⚠' : 'ℹ'}</span>
              <span>{status}</span>
            </div>
          )}
        </section>

        <hr style={{ border: 0, borderTop: '1px solid var(--border)' }} />

        {/* Bookmarks Section */}
        <section>
          <h2 style={{ fontSize: 18, marginBottom: 16 }}>Saved Servers</h2>
          <div
            className="hp-card"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'flex-end',
              marginBottom: 16,
            }}
          >
            <div style={{ flex: '1 1 140px', minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Label</div>
              <input value={newBmName} onChange={(e) => setNewBmName(e.target.value)} placeholder="e.g. My VPS" className="hp-input" style={{ width: '100%' }} />
            </div>
            <div style={{ flex: '1 1 100px', minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>User</div>
              <input value={newBmUser} onChange={(e) => setNewBmUser(e.target.value)} placeholder="root" className="hp-input" style={{ width: '100%' }} />
            </div>
            <div style={{ flex: '1.5 1 180px', minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Host (IP / Domain)</div>
              <input value={newBmHost} onChange={(e) => setNewBmHost(e.target.value)} placeholder="192.168.1.10" className="hp-input" style={{ width: '100%' }} />
            </div>
            <div style={{ flex: '0.5 1 80px', minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Port</div>
              <input value={newBmPort} onChange={(e) => setNewBmPort(e.target.value)} placeholder="22" className="hp-input" style={{ width: '100%' }} />
            </div>
            <button type="button" className="hp-btn hp-btn-primary" style={{ minHeight: 38 }} onClick={addBookmark}>
              Add
            </button>
          </div>

          {bookmarks.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>No saved servers yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {bookmarks.map((bm) => (
                <div key={bm.id} style={{ ...card, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{bm.name}</div>
                    <div className="mono" style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                      {bm.user}@{bm.host}:{bm.port}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="hp-btn" onClick={() => handleConnect(bm)}>Connect</button>
                    <button type="button" className="hp-btn hp-btn-danger" onClick={() => deleteBookmark(bm.id)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* RIGHT COLUMN: Connection History & Active Sessions */}



      {/* RIGHT COLUMN: Connection History & Active Sessions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>Connection History</h2>
          <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {connectedCount} active / {sessions.length} total
          </span>
        </div>
        
        {sessions.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 16, background: 'var(--bg-widget)', borderRadius: 8 }}>
            No connections yet. Click "Connect" on a saved server.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sessions.map((sess) => (
              <div key={sess.id} style={{ ...card, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontWeight: 600 }}>{sess.bmName}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: 4,
                      background: sess.status === 'connected' ? 'var(--green)' : sess.status === 'disconnected' ? 'var(--text-muted)' : 'var(--orange)',
                      boxShadow: sess.status === 'connected' ? '0 0 8px var(--green)' : 'none'
                    }} />
                    <span style={{ textTransform: 'capitalize', color: sess.status === 'connected' ? 'var(--green)' : 'var(--text-muted)' }}>
                      {sess.status}
                    </span>
                  </div>
                </div>
                
                <div className="mono" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                  {sess.user}@{sess.host}:{sess.port}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Started: {new Date(sess.startTime).toLocaleTimeString()}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {sess.status === 'connected' && (
                    <>
                      <button type="button" className="hp-btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => resetFtState(sess, 'upload')}>
                        📤 Upload
                      </button>
                      <button type="button" className="hp-btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => resetFtState(sess, 'download')}>
                        📥 Download
                      </button>
                      <button type="button" className="hp-btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setActiveTermSession(sess)}>
                        ⌨ Terminal
                      </button>
                      <button type="button" className="hp-btn" style={{ padding: '4px 8px', fontSize: 11, color: 'var(--accent)' }} onClick={() => void setupKeysOnServer(sess)}>
                        🔑 Enable Access
                      </button>
                      <button type="button" className="hp-btn hp-btn-danger" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => handleDisconnect(sess)}>
                        ✕ Disconnect
                      </button>
                    </>
                  )}
                  {sess.status === 'disconnected' && (
                    <button type="button" className="hp-btn" style={{ padding: '4px 8px', fontSize: 11, flex: 1 }} onClick={() => setSessions(prev => prev.filter(s => s.id !== sess.id))}>
                      Clear
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* File Transfer Modal Overlay */}
      {ftSession && (
        <div style={modalOverlay}>
          <div style={{ ...modalContent, maxWidth: 600, height: 'auto', maxHeight: '90vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>📦 File Transfer: {ftSession.bmName}</h2>
              <button type="button" style={{ background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 20 }} onClick={() => setFtSession(null)}>
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Device Selector (in case user wants to switch within modal) */}
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Connected Device</div>
                <select 
                  value={ftSession.id} 
                  onChange={(e) => {
                    const s = sessions.find(s => s.id === e.target.value)
                    if (s) resetFtState(s, ftDirection)
                  }}
                  className="hp-input"
                  style={{ cursor: 'pointer' }}
                >
                  {sessions.filter(s => s.status === 'connected').map(s => (
                    <option key={s.id} value={s.id}>{s.bmName} ({s.user}@ {s.host})</option>
                  ))}
                </select>
              </div>

              {/* Direction selector */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button"
                  className="hp-btn"
                  style={{ flex: 1, background: ftDirection === 'upload' ? 'var(--accent)' : 'var(--bg-input)', color: ftDirection === 'upload' ? '#000' : 'var(--text)' }}
                  onClick={() => setFtDirection('upload')}
                >
                  📤 Upload to Device
                </button>
                <button type="button"
                  className="hp-btn"
                  style={{ flex: 1, background: ftDirection === 'download' ? 'var(--accent)' : 'var(--bg-input)', color: ftDirection === 'download' ? '#000' : 'var(--text)' }}
                  onClick={() => setFtDirection('download')}
                >
                  📥 Download from Device
                </button>
              </div>

              {/* Tool selector */}
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Transfer Tool</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['scp', 'rsync'] as const).map(t => (
                    <button key={t} type="button"
                      className="hp-btn"
                      style={{ flex: 1, background: ftTool === t ? 'var(--accent)' : 'var(--bg-input)', color: ftTool === t ? '#000' : 'var(--text)' }}
                      onClick={() => setFtTool(t)}
                    >
                      {t.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* File Selection Flow */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 12, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                {ftDirection === 'upload' ? (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Step 1: Choose Local Files</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <button type="button" className="hp-btn hp-btn-primary" onClick={() => void pickLocalFiles()}>Select Files...</button>
                      <div style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)', maxHeight: 60, overflowY: 'auto' }}>
                        {ftLocalPaths.length === 0 ? 'No files selected' : ftLocalPaths.map((p, i) => <div key={i}>{p.split("/").pop()}</div>)}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>Step 2: Remote Destination</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={ftRemotePath} onChange={e => setFtRemotePath(e.target.value)} className="hp-input" style={{ flex: 1 }} placeholder="~/Downloads/" />
                      <button type="button" className="hp-btn" disabled={remoteBrowsing} onClick={() => void browseRemote(ftRemotePath || '~')}>Browse...</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Step 1: Choose Remote Files</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={ftRemotePath} onChange={e => setFtRemotePath(e.target.value)} className="hp-input" style={{ flex: 1 }} />
                      <button type="button" className="hp-btn" disabled={remoteBrowsing} onClick={() => void browseRemote(ftRemotePath || '~')}>Browse Remote...</button>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>Step 2: Local Destination</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="hp-btn hp-btn-primary" onClick={() => void pickLocalDestDir()}>Choose Folder...</button>
                      <div style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>
                        {ftLocalDestDir || 'Defaults to current directory'}
                      </div>
                    </div>
                  </>
                )}

                {/* Remote Browser results inside modal */}
                {remoteEntries.length > 0 && (
                  <div style={{ marginTop: 8, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 6, maxHeight: 150, overflowY: 'auto' }}>
                    {remoteEntries.map(entry => (
                      <div key={entry} 
                        style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}
                        onClick={() => {
                          if (entry === '..') {
                            const parent = ftRemotePath.replace(/\/[^/]+\/?$/, '') || '/'
                            void browseRemote(parent)
                          } else if (!entry.includes('.')) {
                            const newPath = ftRemotePath.replace(/\/$/, '') + '/' + entry
                            void browseRemote(newPath)
                          } else {
                            setFtRemotePath(ftRemotePath.replace(/\/$/, '') + '/' + entry)
                          }
                        }}
                      >
                        {entry.includes('.') ? '📄' : '📁'} {entry}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {ftStatus && <div style={{ fontSize: 12, color: 'var(--accent)' }}>{ftStatus}</div>}

              <button type="button" className="hp-btn hp-btn-primary" style={{ padding: '12px' }} onClick={runTransfer}>
                🚀 Start Transfer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terminal Modal overlay */}
      {activeTermSession && (
        <div style={modalOverlay}>
          <div style={modalContent}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 600 }}>SSH Session: {activeTermSession.bmName}</div>
              <button type="button" style={{ background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: 20 }} onClick={() => setActiveTermSession(null)}>
                ×
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 400, background: '#0a0a0a', borderRadius: 8, padding: 8, overflow: 'hidden' }}>
              <div ref={termWrapRef} style={{ width: '100%', height: '100%' }} />
            </div>
          </div>
        </div>
      )}

      {/* Password Modal for Key Setup */}
      {passModalSess && (
        <div style={modalOverlay}>
          <div style={{ ...modalContent, maxWidth: 400, height: 'auto', padding: 24 }}>
            <h2 style={{ margin: '0 0 16px 0', fontSize: 18 }}>🔑 Activate Remote Access</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Enter the password for <b>{passModalSess.user}@{passModalSess.host}</b> to enable the file browser.
            </p>
            <input 
              type="password" 
              value={passInput} 
              onChange={e => setPassInput(e.target.value)}
              placeholder="Server Password"
              onKeyDown={e => e.key === 'Enter' && runSetupWithPassword()}
              className="hp-input"
              style={{ marginBottom: 20 }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button type="button" className="hp-btn" onClick={() => setPassModalSess(null)}>Cancel</button>
              <button type="button" className="hp-btn hp-btn-primary" onClick={runSetupWithPassword} disabled={!passInput || busy}>
                {busy ? '⏳ Activating...' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const card = {
  background: 'var(--bg-widget)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 16,
  padding: 16,
}

const stepCircle = {
  width: 28,
  height: 28,
  borderRadius: 14,
  background: 'var(--accent)',
  color: '#000',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  fontSize: 14,
  flexShrink: 0,
}

const stepTitle = {
  margin: '0 0 4px 0',
  fontSize: 15,
  fontWeight: 600,
}

const stepText = {
  margin: '0 0 12px 0',
  fontSize: 13,
  color: 'var(--text-muted)',
  lineHeight: 1.4,
}

const inputStyle = {
  width: '100%',
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  padding: '8px 12px',
  borderRadius: 6,
  fontSize: 13,
}

const area = {
  ...inputStyle,
  minHeight: 60,
  fontFamily: 'monospace',
  fontSize: 12,
}

const modalOverlay: React.CSSProperties = {
  position: 'fixed',
  top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(0,0,0,0.6)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: 40,
}

const modalContent: React.CSSProperties = {
  width: '100%',
  maxWidth: 900,
  height: '100%',
  maxHeight: 600,
  background: 'var(--bg-widget)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 20,
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
}
