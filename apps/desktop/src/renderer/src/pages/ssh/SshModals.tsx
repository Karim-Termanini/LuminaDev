import type { TFunction } from 'i18next'
import type { ReactElement, RefObject } from 'react'
import { Trans } from 'react-i18next'
import type { SshSession } from './types'

export function SshModals({
  t,
  ftSession,
  setFtSession,
  ftDirection,
  setFtDirection,
  ftTool,
  setFtTool,
  ftLocalPaths,
  ftLocalDestDir,
  ftRemotePath,
  setFtRemotePath,
  ftStatus,
  remoteEntries,
  remoteBrowsing,
  sessions,
  onResetFtState,
  onPickLocalFiles,
  onPickLocalDestDir,
  onBrowseRemote,
  onRunTransfer,
  activeTermSession,
  setActiveTermSession,
  termWrapRef,
  passModalSess,
  setPassModalSess,
  passInput,
  setPassInput,
  onRunSetupWithPassword,
  busy,
}: {
  t: TFunction<'ssh'>
  ftSession: SshSession | null
  setFtSession: (v: SshSession | null) => void
  ftDirection: 'upload' | 'download'
  setFtDirection: (v: 'upload' | 'download') => void
  ftTool: 'scp' | 'rsync'
  setFtTool: (v: 'scp' | 'rsync') => void
  ftLocalPaths: string[]
  ftLocalDestDir: string
  ftRemotePath: string
  setFtRemotePath: (v: string) => void
  ftStatus: string
  remoteEntries: string[]
  remoteBrowsing: boolean
  sessions: SshSession[]
  onResetFtState: (sess: SshSession, dir: 'upload' | 'download') => void
  onPickLocalFiles: () => void
  onPickLocalDestDir: () => void
  onBrowseRemote: (path: string) => void
  onRunTransfer: () => void
  activeTermSession: SshSession | null
  setActiveTermSession: (v: SshSession | null) => void
  termWrapRef: RefObject<HTMLDivElement | null>
  passModalSess: SshSession | null
  setPassModalSess: (v: SshSession | null) => void
  passInput: string
  setPassInput: (v: string) => void
  onRunSetupWithPassword: () => void
  busy: boolean
}): ReactElement {
  return (
    <>
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
                    if (s) onResetFtState(s, ftDirection)
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
                        onClick={() => void onPickLocalFiles()}
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
                        onClick={() => void onBrowseRemote(ftRemotePath || '~')}
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
                        onClick={() => void onBrowseRemote(ftRemotePath || '~')}
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
                        onClick={() => void onPickLocalDestDir()}
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
                              void onBrowseRemote(parent)
                            } else if (isDir) {
                              const newPath = ftRemotePath.replace(/\/$/, '') + '/' + cleanName
                              void onBrowseRemote(newPath)
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
                onClick={onRunTransfer}
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
              onKeyDown={(e) => e.key === 'Enter' && onRunSetupWithPassword()}
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
                onClick={onRunSetupWithPassword}
                disabled={!passInput || busy}
              >
                {busy ? t('password.inProgress') : t('password.activateBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  )
}
