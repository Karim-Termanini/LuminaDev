import type { SshBookmark } from '@linux-dev-home/shared'
import { parseSshBookmarks } from '@linux-dev-home/shared'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { assertSshOk } from '../sshContract'
import { humanizeSshError } from '../sshError'
import { shQuote } from './shQuote'
import type { SshSession, SshTarget } from './types'

export function useSshPage() {
  const [target] = useState<SshTarget>('host')
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

  const [passModalSess, setPassModalSess] = useState<SshSession | null>(null)
  const [passInput, setPassInput] = useState('')

  const [sessions, setSessions] = useState<SshSession[]>([])
  const [activeTermSession, setActiveTermSession] = useState<SshSession | null>(null)

  // --- File Transfer ---
  const [ftSession, setFtSession] = useState<SshSession | null>(null)
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

  /** Safely single-quote a value for use in shell commands executed via bash -c.
   *  Escapes internal single quotes using the standard '\'' pattern. */
  // moved to shQuote.ts
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

  function setupKeysOnServer(sess: SshSession): void {
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
    const newSession: SshSession = {
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

  function handleDisconnect(sess: SshSession): void {
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

    const remote = shQuote(`${ftSession.user}@${ftSession.host}`)
    const port = String(ftSession.port)
    let cmd: string

    if (ftDirection === 'upload') {
      if (ftLocalPaths.length === 0) {
        setFtStatus(t('ft.selectFiles'))
        return
      }
      if (!ftRemotePath.trim()) {
        setFtStatus(t('ft.selectRemoteDest'))
        return
      }
      const files = ftLocalPaths.map((p) => shQuote(p)).join(' ')
      const remoteDest = shQuote(`${ftRemotePath}`)
      cmd =
        ftTool === 'scp'
          ? `scp -P ${port} -r ${files} ${remote}:${remoteDest}`
          : `rsync -avz -e ${shQuote(`ssh -p ${port}`)} ${files} ${remote}:${remoteDest}`
    } else {
      if (!ftRemotePath.trim()) {
        setFtStatus(t('ft.selectRemoteSource'))
        return
      }
      const localDest = ftLocalDestDir || '.'
      const localDestQ = shQuote(localDest)
      const remoteSrc = shQuote(`${ftRemotePath}`)
      // mkdir -p ensures destination directory exists before scp/rsync
      cmd =
        `mkdir -p ${localDestQ} && ` +
        (ftTool === 'scp'
          ? `scp -P ${port} -r ${remote}:${remoteSrc} ${localDestQ}`
          : `rsync -avz -e ${shQuote(`ssh -p ${port}`)} ${remote}:${remoteSrc} ${localDestQ}`)
    }

    const sId = Date.now().toString()
    const newSession: SshSession = {
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

  function resetFtState(sess: SshSession, dir: 'upload' | 'download') {
    setFtSession(sess)
    setFtDirection(dir)
    setFtLocalPaths([])
    setFtLocalDestDir('')
    setFtRemotePath('.')
    setFtStatus('')
    setRemoteEntries([])
  }

  return {
    t,
    target,
    busy,
    email,
    setEmail,
    pubKey,
    testOk,
    testResult,
    status,
    bookmarks,
    enableLocalLog,
    enableLocalBusy,
    showPrereqs,
    setShowPrereqs,
    newBmName,
    setNewBmName,
    newBmUser,
    setNewBmUser,
    newBmHost,
    setNewBmHost,
    newBmPort,
    setNewBmPort,
    editBmId,
    setEditBmId,
    editBmName,
    setEditBmName,
    editBmUser,
    setEditBmUser,
    editBmHost,
    setEditBmHost,
    editBmPort,
    setEditBmPort,
    passModalSess,
    setPassModalSess,
    passInput,
    setPassInput,
    sessions,
    setSessions,
    activeTermSession,
    setActiveTermSession,
    ftSession,
    setFtSession,
    ftDirection,
    setFtDirection,
    ftLocalPaths,
    ftLocalDestDir,
    setFtLocalDestDir,
    ftRemotePath,
    setFtRemotePath,
    ftTool,
    setFtTool,
    ftStatus,
    remoteEntries,
    remoteBrowsing,
    fingerprint,
    termWrapRef,
    connectedCount,
    loadBookmarks,
    saveBookmarks,
    generate,
    loadPub,
    enableLocalSsh,
    copyPub,
    setupKeysOnServer,
    runSetupWithPassword,
    testGithub,
    addBookmark,
    deleteBookmark,
    startEditBookmark,
    saveEditBookmark,
    handleConnect,
    handleDisconnect,
    pickLocalFiles,
    pickLocalDestDir,
    browseRemote,
    runTransfer,
    resetFtState,
  }
}
