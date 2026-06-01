import type { TFunction } from 'i18next'
import type { ReactElement } from 'react'
import { Trans } from 'react-i18next'
import type { SshSession } from './types'

export function SshRightColumn({
  t,
  connectedCount,
  sessions,
  showPrereqs,
  setShowPrereqs,
  onResetFtState,
  onSetActiveTermSession,
  onSetupKeysOnServer,
  onDisconnect,
  onRemoveSession,
}: {
  t: TFunction<'ssh'>
  connectedCount: number
  sessions: SshSession[]
  showPrereqs: boolean
  setShowPrereqs: (fn: (v: boolean) => boolean) => void
  onResetFtState: (sess: SshSession, dir: 'upload' | 'download') => void
  onSetActiveTermSession: (sess: SshSession) => void
  onSetupKeysOnServer: (sess: SshSession) => void
  onDisconnect: (sess: SshSession) => void
  onRemoveSession: (id: string) => void
}): ReactElement {
  return (
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
                        onClick={() => onResetFtState(sess, 'upload')}
                      >
                        {t('session.uploadBtn')}
                      </button>
                      <button
                        type="button"
                        className="hp-btn"
                        style={{ padding: '4px 8px', fontSize: 11 }}
                        onClick={() => onResetFtState(sess, 'download')}
                      >
                        {t('session.downloadBtn')}
                      </button>
                      <button
                        type="button"
                        className="hp-btn"
                        style={{ padding: '4px 8px', fontSize: 11 }}
                        onClick={() => onSetActiveTermSession(sess)}
                      >
                        {t('session.terminalBtn')}
                      </button>
                      <button
                        type="button"
                        className="hp-btn"
                        style={{ padding: '4px 8px', fontSize: 11, color: 'var(--accent)' }}
                        onClick={() => void onSetupKeysOnServer(sess)}
                      >
                        {t('session.enableAccessBtn')}
                      </button>
                      <button
                        type="button"
                        className="hp-btn hp-btn-danger"
                        style={{ padding: '4px 8px', fontSize: 11 }}
                        onClick={() => onDisconnect(sess)}
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
                      onClick={() => onRemoveSession(sess.id)}
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

  )
}
