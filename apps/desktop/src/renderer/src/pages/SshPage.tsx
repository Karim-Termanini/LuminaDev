import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import type { SshBookmark } from '@linux-dev-home/shared'
import { parseSshBookmarks } from '@linux-dev-home/shared'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import './SshPage.css'
import { assertSshOk } from './sshContract'
import { humanizeSshError } from './sshError'

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
  isTransfer?: boolean
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

  const [enableLocalLog, setEnableLocalLog] = useState('')
  const [enableLocalBusy, setEnableLocalBusy] = useState(false)
  const [showPrereqs, setShowPrereqs] = useState(false)

  const [newBmName, setNewBmName] = useState('')
  const [newBmUser, setNewBmUser] = useState('')
  const [newBmHost, setNewBmHost] = useState('')
  const [newBmPort, setNewBmPort] = useState('22')

  const [editBmId, setEditBmId] = useState<string | null>(null)
  const [editBmName, setEditBmName] = useState('')
  const [editBmUser, setEditBmUser] = useState('')
  const [editBmHost, setEditBmHost] = useState('')
  const [editBmPort, setEditBmPort] = useState('')

  const [passModalSess, setPassModalSess] = useState<Session | null>(null)
  const [passInput, setPassInput] = useState('')

  const [sessions, setSessions] = useState<Session[]>([])
  const [activeTermSession, setActiveTermSession] = useState<Session | null>(null)

  // --- File Transfer ---
  const [ftSession, setFtSession] = useState<Session | null>(null)
  const [ftDirection, setFtDirection] = useState<'upload' | 'download'>('upload')
  const [ftLocalPaths, setFtLocalPaths] = useState<string[]>([]) // multiple selected files
  const [ftLocalDestDir, setFtLocalDestDir] = useState('') // destination folder for download
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
  /** Active embedded SSH terminal session id (for `terminalClose` on unmount). */
  const embedTermIdRef = useRef<string | undefined>(undefined)
  const { t } = useTranslation('ssh')
  const connectedCount = sessions.filter((s) => s.status === 'connected').length

  function setPendingTransferCmd(cmd: string): void {
    pendingTransferCmdRef.current = cmd
  }

  useEffect(() => {
    void loadBookmarks()
    void loadPub()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadBookmarks(): Promise<void> {
    try {
      const res = await window.dh.storeGet({ key: 'ssh_bookmarks' })
      if (res.ok) setBookmarks(parseSshBookmarks(res.data))
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
    setStatus(t('generate.inProgress'))
    try {
      const res = await window.dh.sshGenerate({ target, email })
      assertSshOk(res, 'Failed to generate SSH key.', t)
      setStatus(t('generate.success'))
      await loadPub()
    } catch (e) {
      setStatus(`❌ ${humanizeSshError(e, t)}`)
    } finally {
      setBusy(false)
    }
  }

  async function loadPub(): Promise<void> {
    setBusy(true)
    try {
      const res = await window.dh.sshGetPub({ target })
      if (res.ok && res.pub) {
        setPubKey(res.pub)
        setFingerprint(res.fingerprint)
      } else {
        setPubKey('')
        setFingerprint('')
        if (res.error && !res.error.includes('SSH_NO_KEY')) {
          setStatus(`❌ ${humanizeSshError(res.error, t)}`)
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  async function enableLocalSsh(): Promise<void> {
    setEnableLocalBusy(true)
    setEnableLocalLog('')
    try {
      const res = await window.dh.sshEnableLocal()
      setEnableLocalLog(res.log + (res.error ? `\n✗ ${humanizeSshError(res.error, t)}` : ''))
    } catch (e) {
      setEnableLocalLog(`✗ ${humanizeSshError(e, t)}`)
    } finally {
      setEnableLocalBusy(false)
    }
  }

  async function copyPub(): Promise<void> {
    if (!pubKey) {
      alert(t('copyPubAlert'))
      return
    }
    try {
      await navigator.clipboard.writeText(pubKey)
      setStatus(t('identity.copySuccess'))
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

    // setPassModalSess(null) // Keep it open for now
    // setPassInput('') // Don't clear yet
    setBusy(true)
    setStatus(t('password.activating', { host: sess.host }))

    try {
      const pubRes = await window.dh.sshGetPub({ target: 'host' })
      if (!pubRes.ok || !pubRes.pub) {
        setStatus(`⚠ ${humanizeSshError(pubRes.error || t('password.noKey'), t)}`)
        return
      }

      const setupRes = await window.dh.sshSetupRemoteKey({
        user: sess.user,
        host: sess.host,
        port: sess.port,
        password,
        publicKey: pubRes.pub.trim(),
      })

      if (setupRes.ok) {
        setStatus(t('password.success', { host: sess.host }))
        setPassModalSess(null)
        setPassInput('')
      } else {
        setStatus(t('password.failed', { error: humanizeSshError(setupRes.error, t) }))
      }
    } catch (err) {
      setStatus(t('error.suffix', { msg: err instanceof Error ? err.message : String(err) }))
    } finally {
      setBusy(false)
    }
  }

  async function testGithub(): Promise<void> {
    setBusy(true)
    setStatus(t('identity.testInProgress'))
    setTestOk(null)
    setTestResult('')
    try {
      const res = await window.dh.sshTestGithub({ target })
      setTestResult(res.output)
      setTestOk(res.ok)
      setStatus(
        res.ok
          ? t('identity.testSuccess')
          : `❌ ${humanizeSshError(res.error || t('identity.testFailGeneric', { code: res.code ?? 'n/a' }), t)}`
      )
    } catch (e) {
      setStatus(humanizeSshError(e, t))
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

  function startEditBookmark(bm: SshBookmark): void {
    setEditBmId(bm.id)
    setEditBmName(bm.name)
    setEditBmUser(bm.user)
    setEditBmHost(bm.host)
    setEditBmPort(String(bm.port))
  }

  function saveEditBookmark(): void {
    if (!editBmId || !editBmHost) return
    const next = bookmarks.map((b) =>
      b.id === editBmId
        ? {
            ...b,
            name: editBmName.trim() || b.name,
            user: editBmUser.trim() || b.user,
            host: editBmHost.trim(),
            port: Number(editBmPort) || 22,
          }
        : b
    )
    void saveBookmarks(next)
    setEditBmId(null)
  }

  // --- Embedded Terminal Logic ---

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
    xtermRef.current = term
    fitRef.current = fit

    // Terminal ID is resolved asynchronously. Buffer data/exit events that
    // arrive before we know the ID (SSH can fail in <1ms on unreachable hosts).
    let terminalId: string | undefined
    const earlyData: Array<{ id: string; data: string }> = []
    const earlyExits = new Set<string>()

    // For SSH sessions: auto-close 2s after the remote shell is running.
    // We detect "shell running" by counting newlines — password prompt has 0,
    // shell startup (fish/bash motd + prompt) produces 3+.
    let shellLineCount = 0
    let autoCloseTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleAutoClose = (): void => {
      if (activeTermSession.isTransfer) return
      if (autoCloseTimer) clearTimeout(autoCloseTimer)
      autoCloseTimer = setTimeout(() => {
        setSessions((prev) =>
          prev.map((s) => (s.id === activeTermSession.id ? { ...s, status: 'connected' } : s))
        )
        setActiveTermSession(null)
      }, 2000)
    }

    const offOut = window.dh.onTerminalData(({ id, data }) => {
      if (terminalId !== undefined) {
        if (id === terminalId) {
          term.write(data)
          shellLineCount += (data.match(/\n/g) ?? []).length
          if (shellLineCount >= 3) scheduleAutoClose()
        }
      } else {
        earlyData.push({ id, data })
      }
    })

    const handleExit = (): void => {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeTermSession.id ? { ...s, status: 'disconnected', termId: undefined } : s
        )
      )
      setTimeout(() => setActiveTermSession(null), 1500)
    }

    const offExit = window.dh.onTerminalExit(({ id }) => {
      if (terminalId !== undefined) {
        if (id === terminalId) handleExit()
      } else {
        earlyExits.add(id)
      }
    })

    term.onData((d: string) => {
      if (terminalId) window.dh.terminalWrite(terminalId, d)
    })

    const ro = new ResizeObserver(() => {
      fit.fit()
      if (terminalId) window.dh.terminalResize(terminalId, term.cols, term.rows)
    })
    ro.observe(el)

    // Defer terminal creation until after layout so fit.fit() reads real dimensions.
    requestAnimationFrame(() => {
      fit.fit()

      const transferCmd = pendingTransferCmdRef.current
      if (transferCmd) pendingTransferCmdRef.current = null

      // Transfer sessions run SCP/rsync locally; SSH sessions connect to remote.
      const termCmd = activeTermSession.isTransfer ? 'bash' : 'ssh'
      const termArgs = activeTermSession.isTransfer
        ? [
            '-c',
            `${transferCmd ?? 'echo "No transfer command"'}; echo; echo "[transfer done — closing in 2s]"; sleep 2`,
          ]
        : [
            '-o',
            'StrictHostKeyChecking=no',
            '-o',
            'PubkeyAuthentication=no',
            '-o',
            'PasswordAuthentication=yes',
            '-p',
            String(activeTermSession.port),
            `${activeTermSession.user}@${activeTermSession.host}`,
          ]

      void (async () => {
        const res = (await window.dh.terminalCreate({
          cols: term.cols,
          rows: term.rows,
          cmd: termCmd,
          args: termArgs,
        })) as { ok: true; id: string } | { ok: false; error: string }

        if (!res.ok) {
          term.writeln(`\r\n${t('terminal.createError', { error: res.error })}`)
          return
        }

        terminalId = res.id
        embedTermIdRef.current = res.id

        // Flush buffered output/exits that arrived before we had the ID.
        for (const { id, data } of earlyData) {
          if (id === res.id) {
            term.write(data)
            shellLineCount += (data.match(/\n/g) ?? []).length
          }
        }
        earlyData.length = 0
        if (shellLineCount >= 3) scheduleAutoClose()

        if (earlyExits.has(res.id)) {
          handleExit()
        } else {
          setSessions((prev) =>
            prev.map((s) =>
              s.id === activeTermSession.id ? { ...s, termId: res.id, status: 'connected' } : s
            )
          )
        }
      })()
    })

    return () => {
      if (autoCloseTimer) clearTimeout(autoCloseTimer)
      ro.disconnect()
      offOut()
      offExit()
      if (terminalId) window.dh.terminalClose(terminalId)
      embedTermIdRef.current = undefined
      term.dispose()
      xtermRef.current = null
      fitRef.current = null
    }
  }, [activeTermSession, t])

  async function handleConnect(bm: SshBookmark): Promise<void> {
    // Check if local identity exists, if not, generate one silently
    const pubRes = await window.dh.sshGetPub({ target: 'host' })
    if (!pubRes.ok || !pubRes.pub) {
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
      window.dh.terminalClose(sess.termId)
    }
    setSessions((prev) =>
      prev.map((s) => (s.id === sess.id ? { ...s, status: 'disconnected', termId: undefined } : s))
    )
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
    if (!ftSession) {
      setFtStatus(t('ft.selectSession'))
      return
    }
    setRemoteBrowsing(true)
    setFtStatus(t('ft.browsingRemote'))
    try {
      const res = await window.dh.sshListDir({
        user: ftSession.user,
        host: ftSession.host,
        port: ftSession.port,
        remotePath: path || '.',
      })
      if (res.ok) {
        // Filter out current dir marker, keep parent marker for navigation
        const clean = res.entries.filter((e) => e !== './' && e !== '.')
        setRemoteEntries(clean)
        setFtRemotePath(path)
        setFtStatus('')
      } else {
        setFtStatus(`❌ ${humanizeSshError(res.error, t)}`)
      }
    } finally {
      setRemoteBrowsing(false)
    }
  }

  function runTransfer(): void {
    if (!ftSession) {
      setFtStatus(t('ft.selectSession'))
      return
    }

    const remote = `${ftSession.user}@${ftSession.host}`
    let cmd = ''

    if (ftDirection === 'upload') {
      if (ftLocalPaths.length === 0) {
        setFtStatus(t('ft.selectFiles'))
        return
      }
      if (!ftRemotePath.trim()) {
        setFtStatus(t('ft.selectRemoteDest'))
        return
      }
      const files = ftLocalPaths.map((p) => `"${p}"`).join(' ')
      cmd =
        ftTool === 'scp'
          ? `scp -P ${ftSession.port} -r ${files} ${remote}:${ftRemotePath}`
          : `rsync -avz -e 'ssh -p ${ftSession.port}' ${files} ${remote}:${ftRemotePath}`
    } else {
      if (!ftRemotePath.trim()) {
        setFtStatus(t('ft.selectRemoteSource'))
        return
      }
      const localDest = ftLocalDestDir || '.'
      // mkdir -p ensures destination directory exists before scp/rsync
      const mkdirPrefix = `mkdir -p "${localDest}" && `
      cmd =
        mkdirPrefix +
        (ftTool === 'scp'
          ? `scp -P ${ftSession.port} -r ${remote}:"${ftRemotePath}" "${localDest}"`
          : `rsync -avz -e 'ssh -p ${ftSession.port}' ${remote}:"${ftRemotePath}" "${localDest}"`)
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
      isTransfer: true,
    }
    setPendingTransferCmd(cmd)
    setSessions((prev) => [newSession, ...prev])
    setActiveTermSession(newSession)
    setFtStatus(t('ft.launching'))
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
    <div className="ssh-page elevated-page">
      {/* LEFT COLUMN: Setup & Bookmarks */}
      <div className="ssh-left-column">
        <header className="ssh-hero">
          <div className="ssh-section-label">{t('page.sectionLabel')}</div>
          <h1 className="ssh-hero-title">{t('page.title')}</h1>
          <p className="ssh-hero-subtitle">{t('page.subtitle')}</p>
        </header>

        {/* Enable SSH on This Machine */}
        <section className="ssh-section">
          <div className="ssh-section-header">
            <div className="ssh-section-label">{t('step0.label')}</div>
            <h2 className="ssh-section-title">{t('step0.title')}</h2>
            <p className="ssh-section-subtitle">
              <Trans t={t} i18nKey="step0.subtitle" components={{ em: <em /> }}>
                Turn this machine into an SSH host. Other devices on your network can then connect
                to it. Skip if you only need to connect <em>to</em> remote servers.
              </Trans>
            </p>
          </div>
          <div className="elevated-card" style={{ flexDirection: 'column', gap: 12 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 16,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                  {t('enable.title')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {t('enable.desc')}
                </div>
              </div>
              <button
                type="button"
                className="hp-btn hp-btn-primary"
                style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                onClick={() => void enableLocalSsh()}
                disabled={enableLocalBusy}
              >
                {enableLocalBusy ? t('enable.inProgress') : t('enable.btn')}
              </button>
            </div>
            {enableLocalLog && (
              <pre
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontFamily: 'monospace',
                  background: 'rgba(0, 0, 0, 0.2)',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  whiteSpace: 'pre-wrap',
                  color: 'var(--text-muted)',
                }}
              >
                {enableLocalLog}
              </pre>
            )}
          </div>
        </section>

        <hr className="ssh-divider" />

        {/* SSH Identity Wizard Section */}
        <section className="ssh-section">
          <div className="ssh-section-header">
            <div className="ssh-section-label">{t('step1.label')}</div>
            <h2 className="ssh-section-title">{t('step1.title')}</h2>
            <p className="ssh-section-subtitle">{t('step1.subtitle')}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="elevated-card">
              <div style={stepCircle}>1</div>
              <div>
                <h3 style={stepTitle}>{t('generate.title')}</h3>
                <p style={stepText}>{t('generate.desc')}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('generate.emailPlaceholder')}
                    className="hp-input"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="hp-btn hp-btn-primary"
                    onClick={() => void generate()}
                    disabled={busy}
                  >
                    {t('generate.btn')}
                  </button>
                </div>
              </div>
            </div>

            <div className="elevated-card">
              <div style={stepCircle}>2</div>
              <div style={{ flex: 1 }}>
                <h3 style={stepTitle}>{t('identity.title')}</h3>
                <p style={stepText}>{t('identity.desc')}</p>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="hp-btn"
                    onClick={() => {
                      void loadPub().then(copyPub)
                    }}
                    disabled={busy}
                  >
                    {t('identity.copyBtn')}
                  </button>
                  <button
                    type="button"
                    className="hp-btn"
                    onClick={() => void testGithub()}
                    disabled={busy}
                  >
                    {t('identity.testBtn')}
                  </button>
                </div>
                {fingerprint && (
                  <div
                    style={{
                      marginTop: 12,
                      fontSize: 12,
                      padding: '8px 12px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)', marginRight: 8 }}>
                      {t('identity.fingerprint')}
                    </span>
                    <span className="mono">{fingerprint}</span>
                  </div>
                )}
                {testOk !== null && (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      padding: '8px 12px',
                      background: testOk ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
                      border: '1px solid ' + (testOk ? 'var(--green)' : 'var(--red)'),
                      borderRadius: 6,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        color: testOk ? 'var(--green)' : 'var(--red)',
                        marginBottom: 4,
                      }}
                    >
                      {testOk ? t('identity.testSuccessLabel') : t('identity.testFailLabel')}
                    </div>
                    <div className="mono" style={{ fontSize: 11 }}>
                      {testResult}
                    </div>
                  </div>
                )}
                {pubKey && <textarea readOnly value={pubKey} style={{ ...area, marginTop: 12 }} />}
              </div>
            </div>
          </div>
          {status && (
            <div
              className={`hp-status-alert ${status.includes('✅') ? 'success' : status.includes('⚠') || status.includes('❌') ? 'warning' : ''}`}
              style={{ marginTop: 12 }}
            >
              <span style={{ fontSize: 18 }}>
                {status.includes('✅')
                  ? '✔'
                  : status.includes('⚠') || status.includes('❌')
                    ? '⚠'
                    : 'ℹ'}
              </span>
              <span>{status}</span>
            </div>
          )}
        </section>

        <hr className="ssh-divider" />

        {/* Bookmarks Section */}
        <section className="ssh-section">
          <div className="ssh-section-header">
            <div className="ssh-section-label">{t('step2.label')}</div>
            <h2 className="ssh-section-title">{t('step2.title')}</h2>
            <p className="ssh-section-subtitle">
              <Trans t={t} i18nKey="step2.subtitle" components={{ strong: <strong /> }}>
                Bookmark remote machines by label. Hit <strong>Connect</strong> to open a live
                shell, browse files, or push your public key automatically.
              </Trans>
            </p>
          </div>
          <div
            className="elevated-card"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'flex-end',
              marginBottom: 16,
            }}
          >
            <div style={{ flex: '1 1 140px', minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                {t('bookmark.label')}
              </div>
              <input
                value={newBmName}
                onChange={(e) => setNewBmName(e.target.value)}
                placeholder={t('bookmark.labelPlaceholder')}
                className="hp-input"
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ flex: '1 1 100px', minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                {t('bookmark.user')}
              </div>
              <input
                value={newBmUser}
                onChange={(e) => setNewBmUser(e.target.value)}
                placeholder={t('bookmark.userPlaceholder')}
                className="hp-input"
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ flex: '1.5 1 180px', minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                {t('bookmark.host')}
              </div>
              <input
                value={newBmHost}
                onChange={(e) => setNewBmHost(e.target.value)}
                placeholder={t('bookmark.hostPlaceholder')}
                className="hp-input"
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ flex: '0.5 1 80px', minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                {t('bookmark.port')}
              </div>
              <input
                value={newBmPort}
                onChange={(e) => setNewBmPort(e.target.value)}
                placeholder={t('bookmark.portPlaceholder')}
                className="hp-input"
                style={{ width: '100%' }}
              />
            </div>
            <button
              type="button"
              className="hp-btn hp-btn-primary"
              style={{ minHeight: 38 }}
              onClick={addBookmark}
            >
              {t('bookmark.addBtn')}
            </button>
          </div>

          {bookmarks.length === 0 ? (
            <div className="ssh-empty-state">{t('bookmark.empty')}</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {bookmarks.map((bm) =>
                editBmId === bm.id ? (
                  <div
                    key={bm.id}
                    className="ssh-bookmark-item"
                    style={{ flexDirection: 'column', gap: 12 }}
                  >
                    <div
                      style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}
                    >
                      <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                        <div className="ssh-form-label">{t('bookmark.editLabel')}</div>
                        <input
                          value={editBmName}
                          onChange={(e) => setEditBmName(e.target.value)}
                          className="hp-input"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div style={{ flex: '1 1 90px', minWidth: 0 }}>
                        <div className="ssh-form-label">{t('bookmark.editUser')}</div>
                        <input
                          value={editBmUser}
                          onChange={(e) => setEditBmUser(e.target.value)}
                          className="hp-input"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div style={{ flex: '1.5 1 160px', minWidth: 0 }}>
                        <div className="ssh-form-label">{t('bookmark.editHost')}</div>
                        <input
                          value={editBmHost}
                          onChange={(e) => setEditBmHost(e.target.value)}
                          className="hp-input"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div style={{ flex: '0.5 1 60px', minWidth: 0 }}>
                        <div className="ssh-form-label">{t('bookmark.editPort')}</div>
                        <input
                          value={editBmPort}
                          onChange={(e) => setEditBmPort(e.target.value)}
                          className="hp-input"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button type="button" className="hp-btn" onClick={() => setEditBmId(null)}>
                        {t('bookmark.cancelBtn')}
                      </button>
                      <button
                        type="button"
                        className="hp-btn hp-btn-primary"
                        onClick={saveEditBookmark}
                      >
                        {t('bookmark.saveBtn')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={bm.id}
                    className="ssh-bookmark-item"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div className="ssh-bookmark-name">{bm.name}</div>
                      <div className="ssh-bookmark-info">
                        {bm.user}@{bm.host}:{bm.port}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="hp-btn" onClick={() => handleConnect(bm)}>
                        {t('bookmark.connectBtn')}
                      </button>
                      <button
                        type="button"
                        className="hp-btn"
                        onClick={() => startEditBookmark(bm)}
                      >
                        {t('bookmark.editBtn')}
                      </button>
                      <button
                        type="button"
                        className="hp-btn hp-btn-danger"
                        onClick={() => deleteBookmark(bm.id)}
                      >
                        {t('bookmark.removeBtn')}
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </section>
      </div>

      {/* RIGHT COLUMN: Connection History & Active Sessions */}
      <div className="ssh-right-column">
        <div className="ssh-activity-header">
          <div>
            <div className="ssh-section-label">{t('activity.sectionLabel')}</div>
            <h2 className="ssh-section-title">{t('activity.title')}</h2>
            <p className="ssh-section-subtitle">{t('activity.subtitle')}</p>
          </div>
          <span className="ssh-activity-stats">
            {t('activity.stats', { active: connectedCount, total: sessions.length })}
          </span>
        </div>

        {/* Prerequisites accordion */}
        <div className="ssh-prereqs-accordion">
          <button
            type="button"
            onClick={() => setShowPrereqs((v) => !v)}
            className="ssh-prereqs-button"
          >
            <span>{t('prereqs.title')}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {showPrereqs ? '▲' : '▼'}
            </span>
          </button>
          {showPrereqs && (
            <div className="ssh-prereqs-content">
              <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                <Trans t={t} i18nKey="prereqs.desc" components={{ b: <b /> }}>
                  The <b>remote machine</b> must have SSH running and port 22 open before you can
                  connect. Run the commands matching its distro:
                </Trans>
              </p>

              {(
                [
                  {
                    labelKey: 'prereqs.distroFedora',
                    color: '#3b82f6',
                    cmds: [
                      'sudo systemctl enable --now sshd',
                      'sudo firewall-cmd --add-service=ssh --permanent',
                      'sudo firewall-cmd --reload',
                    ],
                  },
                  {
                    labelKey: 'prereqs.distroUbuntu',
                    color: '#f97316',
                    cmds: [
                      'sudo systemctl enable --now ssh',
                      'sudo ufw allow ssh',
                      'sudo ufw enable',
                    ],
                  },
                  {
                    labelKey: 'prereqs.distroArch',
                    color: '#1d9bf0',
                    cmds: [
                      'sudo systemctl enable --now sshd',
                      'sudo ufw allow ssh',
                      'sudo ufw enable',
                      'sudo systemctl enable --now ufw',
                    ],
                  },
                  {
                    labelKey: 'prereqs.distroOpenSuse',
                    color: '#22c55e',
                    cmds: [
                      'sudo systemctl enable --now sshd',
                      'sudo firewall-cmd --add-service=ssh --permanent',
                      'sudo firewall-cmd --reload',
                    ],
                  },
                  {
                    labelKey: 'prereqs.distroIptables',
                    color: '#a855f7',
                    cmds: [
                      'sudo systemctl enable --now sshd',
                      'sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT',
                    ],
                  },
                ] as const
              ).map(({ labelKey, color, cmds }) => (
                <div key={labelKey} className="ssh-prereqs-distro">
                  <div className="ssh-prereqs-distro-title" style={{ color }}>
                    ▸ {t(labelKey)}
                  </div>
                  <pre className="ssh-prereqs-code">{cmds.join('\n')}</pre>
                </div>
              ))}

              <div className="ssh-prereqs-hint">
                <Trans
                  t={t}
                  i18nKey="prereqs.localMachine"
                  components={{
                    strong: <b className="ssh-prereqs-hint-strong" />,
                    code: <span className="mono" />,
                  }}
                >
                  <strong>Local machine</strong> also needs <code>ssh</code> and{' '}
                  <code>sshpass</code> installed.
                </Trans>
                <br />
                <Trans
                  t={t}
                  i18nKey="prereqs.fedoraInstall"
                  components={{ code: <span className="mono" /> }}
                >
                  Fedora: <code>sudo dnf install openssh sshpass</code>
                </Trans>
                <br />
                <Trans
                  t={t}
                  i18nKey="prereqs.ubuntuInstall"
                  components={{ code: <span className="mono" /> }}
                >
                  Ubuntu/Debian: <code>sudo apt install openssh-client sshpass</code>
                </Trans>
                <br />
                <Trans
                  t={t}
                  i18nKey="prereqs.archInstall"
                  components={{ code: <span className="mono" /> }}
                >
                  Arch: <code>sudo pacman -S openssh sshpass</code>
                </Trans>
              </div>
            </div>
          )}
        </div>

        {sessions.length === 0 ? (
          <div className="ssh-empty-state">{t('activity.empty')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sessions.map((sess) => (
              <div key={sess.id} className="ssh-session-item">
                <div className="ssh-session-header">
                  <div className="ssh-session-name">{sess.bmName}</div>
                  <div className="ssh-session-status">
                    <div
                      className="ssh-session-status-dot"
                      style={{
                        background:
                          sess.status === 'connected'
                            ? 'var(--green)'
                            : sess.status === 'disconnected'
                              ? 'var(--text-muted)'
                              : 'var(--orange)',
                        boxShadow: sess.status === 'connected' ? '0 0 8px var(--green)' : 'none',
                      }}
                    />
                    <span
                      style={{
                        textTransform: 'capitalize',
                        color: sess.status === 'connected' ? 'var(--green)' : 'var(--text-muted)',
                      }}
                    >
                      {sess.status}
                    </span>
                  </div>
                </div>

                <div className="ssh-session-info">
                  {sess.user}@{sess.host}:{sess.port}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {t('activity.started', { time: new Date(sess.startTime).toLocaleTimeString() })}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {sess.status === 'connected' && (
                    <>
                      <button
                        type="button"
                        className="hp-btn"
                        style={{ padding: '4px 8px', fontSize: 11 }}
                        onClick={() => resetFtState(sess, 'upload')}
                      >
                        {t('session.uploadBtn')}
                      </button>
                      <button
                        type="button"
                        className="hp-btn"
                        style={{ padding: '4px 8px', fontSize: 11 }}
                        onClick={() => resetFtState(sess, 'download')}
                      >
                        {t('session.downloadBtn')}
                      </button>
                      <button
                        type="button"
                        className="hp-btn"
                        style={{ padding: '4px 8px', fontSize: 11 }}
                        onClick={() => setActiveTermSession(sess)}
                      >
                        {t('session.terminalBtn')}
                      </button>
                      <button
                        type="button"
                        className="hp-btn"
                        style={{ padding: '4px 8px', fontSize: 11, color: 'var(--accent)' }}
                        onClick={() => void setupKeysOnServer(sess)}
                      >
                        {t('session.enableAccessBtn')}
                      </button>
                      <button
                        type="button"
                        className="hp-btn hp-btn-danger"
                        style={{ padding: '4px 8px', fontSize: 11 }}
                        onClick={() => handleDisconnect(sess)}
                      >
                        {t('session.disconnectBtn')}
                      </button>
                    </>
                  )}
                  {sess.status === 'disconnected' && (
                    <button
                      type="button"
                      className="hp-btn"
                      style={{ padding: '4px 8px', fontSize: 11, flex: 1 }}
                      onClick={() => setSessions((prev) => prev.filter((s) => s.id !== sess.id))}
                    >
                      {t('session.clearBtn')}
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
        <div className="ssh-modal-overlay">
          <div className="ssh-modal ssh-modal-small">
            <div className="ssh-modal-header">
              <h2 className="ssh-modal-title">{t('ft.modalTitle', { name: ftSession.bmName })}</h2>
              <button type="button" className="ssh-modal-close" onClick={() => setFtSession(null)}>
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Device Selector (in case user wants to switch within modal) */}
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                  {t('ft.connectedDevice')}
                </div>
                <select
                  value={ftSession.id}
                  onChange={(e) => {
                    const s = sessions.find((s) => s.id === e.target.value)
                    if (s) resetFtState(s, ftDirection)
                  }}
                  className="hp-input"
                  style={{ cursor: 'pointer' }}
                >
                  {sessions
                    .filter((s) => s.status === 'connected')
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.bmName} ({s.user}@ {s.host})
                      </option>
                    ))}
                </select>
              </div>

              {/* Direction selector */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="hp-btn"
                  style={{
                    flex: 1,
                    background: ftDirection === 'upload' ? 'var(--accent)' : 'var(--bg-input)',
                    color: ftDirection === 'upload' ? '#000' : 'var(--text)',
                  }}
                  onClick={() => setFtDirection('upload')}
                >
                  {t('ft.uploadBtn')}
                </button>
                <button
                  type="button"
                  className="hp-btn"
                  style={{
                    flex: 1,
                    background: ftDirection === 'download' ? 'var(--accent)' : 'var(--bg-input)',
                    color: ftDirection === 'download' ? '#000' : 'var(--text)',
                  }}
                  onClick={() => setFtDirection('download')}
                >
                  {t('ft.downloadBtn')}
                </button>
              </div>

              {/* Tool selector */}
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                  {t('ft.toolLabel')}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['scp', 'rsync'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="hp-btn"
                      style={{
                        flex: 1,
                        background: ftTool === t ? 'var(--accent)' : 'var(--bg-input)',
                        color: ftTool === t ? '#000' : 'var(--text)',
                      }}
                      onClick={() => setFtTool(t)}
                    >
                      {t.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* File Selection Flow */}
              <div className="ssh-file-transfer-section">
                {ftDirection === 'upload' ? (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{t('ft.step1Local')}</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <button
                        type="button"
                        className="hp-btn hp-btn-primary"
                        onClick={() => void pickLocalFiles()}
                      >
                        {t('ft.selectFilesBtn')}
                      </button>
                      <div
                        style={{
                          flex: 1,
                          fontSize: 12,
                          color: 'var(--text-muted)',
                          maxHeight: 60,
                          overflowY: 'auto',
                        }}
                      >
                        {ftLocalPaths.length === 0
                          ? t('ft.noFiles')
                          : ftLocalPaths.map((p, i) => <div key={i}>{p.split('/').pop()}</div>)}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>
                      {t('ft.step2Remote')}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={ftRemotePath}
                        onChange={(e) => setFtRemotePath(e.target.value)}
                        className="hp-input"
                        style={{ flex: 1 }}
                        placeholder={t('ft.remotePlaceholder')}
                      />
                      <button
                        type="button"
                        className="hp-btn"
                        disabled={remoteBrowsing}
                        onClick={() => void browseRemote(ftRemotePath || '~')}
                      >
                        {t('ft.browseBtn')}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{t('ft.step1Remote')}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={ftRemotePath}
                        onChange={(e) => setFtRemotePath(e.target.value)}
                        className="hp-input"
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="hp-btn"
                        disabled={remoteBrowsing}
                        onClick={() => void browseRemote(ftRemotePath || '~')}
                      >
                        {t('ft.browseRemoteBtn')}
                      </button>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8 }}>
                      {t('ft.step2Local')}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        className="hp-btn hp-btn-primary"
                        onClick={() => void pickLocalDestDir()}
                      >
                        {t('ft.chooseFolderBtn')}
                      </button>
                      <div style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>
                        {ftLocalDestDir || t('ft.defaultDir')}
                      </div>
                    </div>
                  </>
                )}

                {/* Remote Browser results inside modal */}
                {remoteEntries.length > 0 && (
                  <div className="ssh-remote-browser">
                    {remoteEntries.map((entry) => {
                      const isDir = entry.endsWith('/') || entry === '../'
                      const cleanName = entry.replace(/\/$/, '')

                      return (
                        <div
                          key={entry}
                          className="ssh-remote-entry"
                          onClick={() => {
                            if (entry === '../') {
                              const parent = ftRemotePath.replace(/\/[^/]+\/?$/, '') || '/'
                              void browseRemote(parent)
                            } else if (isDir) {
                              const newPath = ftRemotePath.replace(/\/$/, '') + '/' + cleanName
                              void browseRemote(newPath)
                            } else {
                              // It's a file
                              setFtRemotePath(ftRemotePath.replace(/\/$/, '') + '/' + cleanName)
                            }
                          }}
                        >
                          <span className="ssh-remote-entry-icon">{isDir ? '📁' : '📄'}</span>
                          <span className="ssh-remote-entry-name">
                            {entry === '../' ? t('ft.parentDir') : cleanName}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {ftStatus && <div style={{ fontSize: 12, color: 'var(--accent)' }}>{ftStatus}</div>}

              <button
                type="button"
                className="hp-btn hp-btn-primary"
                style={{ padding: '12px' }}
                onClick={runTransfer}
              >
                {t('ft.startBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terminal Modal overlay */}
      {activeTermSession && (
        <div className="ssh-modal-overlay">
          <div className="ssh-modal">
            <div className="ssh-modal-header">
              <div style={{ fontWeight: 600 }}>
                {t('terminal.title', { name: activeTermSession.bmName })}
              </div>
              <button
                type="button"
                className="ssh-modal-close"
                onClick={() => setActiveTermSession(null)}
              >
                ×
              </button>
            </div>
            <div className="ssh-terminal-container">
              <div ref={termWrapRef} style={{ width: '100%', height: '100%', padding: '16px' }} />
            </div>
            {!activeTermSession.isTransfer && (
              <div className="ssh-terminal-hint">
                <Trans
                  t={t}
                  i18nKey="terminal.hint"
                  components={{
                    code: <span className="mono" style={{ color: 'var(--accent)' }} />,
                  }}
                >
                  Type <code>exit</code> to end the session — window closes automatically
                </Trans>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Password Modal for Key Setup */}
      {passModalSess && (
        <div className="ssh-modal-overlay">
          <div className="ssh-modal ssh-modal-password">
            <h2 className="ssh-modal-title">{t('password.title')}</h2>
            <p
              className="ssh-modal-title"
              style={{
                fontSize: 13,
                color: 'var(--text-muted)',
                margin: '0 0 16px 0',
                fontWeight: 400,
              }}
            >
              <Trans
                t={t}
                i18nKey="password.desc"
                values={{ user: passModalSess.user, host: passModalSess.host }}
                components={{ b: <b /> }}
              >
                Enter the password for <b>user@host</b> to enable the file browser.
              </Trans>
            </p>
            <input
              type="password"
              value={passInput}
              onChange={(e) => setPassInput(e.target.value)}
              placeholder={t('password.placeholder')}
              onKeyDown={(e) => e.key === 'Enter' && runSetupWithPassword()}
              className="hp-input"
              style={{ marginBottom: 20 }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button type="button" className="hp-btn" onClick={() => setPassModalSess(null)}>
                {t('password.cancelBtn')}
              </button>
              <button
                type="button"
                className="hp-btn hp-btn-primary"
                onClick={runSetupWithPassword}
                disabled={!passInput || busy}
              >
                {busy ? t('password.inProgress') : t('password.activateBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
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
