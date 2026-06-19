import type { SshBookmark } from '@linux-dev-home/shared'
import type { TFunction } from 'i18next'
import type { ReactElement } from 'react'
import { Trans } from 'react-i18next'
import { GITHUB_SSH_KEYS_URL, isGithubPublicKeyDenied } from './githubTest'
import { area, stepCircle, stepText, stepTitle } from './sshStyles'

export function SshLeftColumn({
  t,
  enableLocalLog,
  enableLocalBusy,
  localSshEnabled,
  onEnableLocalSsh,
  email,
  setEmail,
  busy,
  onGenerate,
  pubKey,
  fingerprint,
  testOk,
  testResult,
  status,
  onLoadPubAndCopy,
  onTestGithub,
  newBmName,
  setNewBmName,
  newBmUser,
  setNewBmUser,
  newBmHost,
  setNewBmHost,
  newBmPort,
  setNewBmPort,
  onAddBookmark,
  bookmarks,
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
  onSaveEditBookmark,
  onConnect,
  onStartEditBookmark,
  onDeleteBookmark,
}: {
  t: TFunction<'ssh'>
  enableLocalLog: string
  enableLocalBusy: boolean
  localSshEnabled: boolean | null
  onEnableLocalSsh: () => void
  email: string
  setEmail: (v: string) => void
  busy: boolean
  onGenerate: () => void
  pubKey: string
  fingerprint: string
  testOk: boolean | null
  testResult: string
  status: string
  onLoadPubAndCopy: () => void
  onTestGithub: () => void
  newBmName: string
  setNewBmName: (v: string) => void
  newBmUser: string
  setNewBmUser: (v: string) => void
  newBmHost: string
  setNewBmHost: (v: string) => void
  newBmPort: string
  setNewBmPort: (v: string) => void
  onAddBookmark: () => void
  bookmarks: SshBookmark[]
  editBmId: string | null
  setEditBmId: (v: string | null) => void
  editBmName: string
  setEditBmName: (v: string) => void
  editBmUser: string
  setEditBmUser: (v: string) => void
  editBmHost: string
  setEditBmHost: (v: string) => void
  editBmPort: string
  setEditBmPort: (v: string) => void
  onSaveEditBookmark: () => void
  onConnect: (bm: SshBookmark) => void
  onStartEditBookmark: (bm: SshBookmark) => void
  onDeleteBookmark: (id: string) => void
}): ReactElement {
  return (
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
                onClick={() => void onEnableLocalSsh()}
                disabled={enableLocalBusy || localSshEnabled === true}
              >
                {enableLocalBusy
                  ? t('enable.inProgress')
                  : localSshEnabled
                    ? t('enable.alreadyEnabled')
                    : t('enable.btn')}
              </button>
            </div>
            {localSshEnabled ? (
              <div
                style={{
                  margin: 0,
                  fontSize: 12,
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--green)',
                  background: 'rgba(76, 175, 80, 0.1)',
                  color: 'var(--green)',
                  lineHeight: 1.5,
                }}
                role="status"
              >
                {t('enable.alreadyEnabledDetail')}
              </div>
            ) : null}
            {enableLocalLog && !localSshEnabled ? (
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
            ) : null}
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
                    onClick={() => void onGenerate()}
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
                      void onLoadPubAndCopy()
                    }}
                    disabled={busy}
                  >
                    {t('identity.copyBtn')}
                  </button>
                  <button
                    type="button"
                    className="hp-btn"
                    onClick={() => void onTestGithub()}
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
                    {testOk === false && isGithubPublicKeyDenied(testResult) ? (
                      <div className="ssh-github-setup-help" style={{ marginTop: 10 }}>
                        <p style={{ margin: '0 0 8px', fontSize: 12, lineHeight: 1.5, color: 'var(--text)' }}>
                          {t('identity.githubPublickeySteps')}
                        </p>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            className="hp-btn hp-btn-primary"
                            onClick={() => {
                              void onLoadPubAndCopy()
                            }}
                            disabled={busy}
                          >
                            {t('identity.copyBtn')}
                          </button>
                          <button
                            type="button"
                            className="hp-btn"
                            onClick={() => void window.dh.openExternal(GITHUB_SSH_KEYS_URL)}
                          >
                            {t('identity.openGithubSshSettings')}
                          </button>
                        </div>
                      </div>
                    ) : null}
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
              onClick={onAddBookmark}
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
                        onClick={onSaveEditBookmark}
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
                      <button type="button" className="hp-btn" onClick={() => onConnect(bm)}>
                        {t('bookmark.connectBtn')}
                      </button>
                      <button
                        type="button"
                        className="hp-btn"
                        onClick={() => onStartEditBookmark(bm)}
                      >
                        {t('bookmark.editBtn')}
                      </button>
                      <button
                        type="button"
                        className="hp-btn hp-btn-danger"
                        onClick={() => onDeleteBookmark(bm.id)}
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

  )
}
