import type { ReactElement } from 'react'

export type InstallDistroId = 'ubuntu' | 'fedora' | 'arch'

export const DOCKER_ENGINE_INSTALL_DOCS = 'https://docs.docker.com/engine/install/'

export interface DockerInstallModalProps {
  t: (key: string) => string
  showInstallModal: boolean
  hostDistroId: string
  installDistro: InstallDistroId
  setInstallDistro: (id: InstallDistroId) => void
  detectedInstallFamily: InstallDistroId | null
  installStep: number
  setInstallStep: (step: number) => void
  installLogs: string[]
  installError: string | null
  installBusy: boolean
  installedFeatures: { docker: boolean; compose: boolean; buildx: boolean }
  selectedFeatures: string[]
  setSelectedFeatures: React.Dispatch<React.SetStateAction<string[]>>
  onClose: () => void
  onRunInstallation: () => Promise<void>
}

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
  padding: 20,
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

const sectionBox: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: 10,
  background: 'var(--bg-input)',
}

export default function DockerInstallModal(props: DockerInstallModalProps): ReactElement {
  const {
    t,
    showInstallModal,
    hostDistroId,
    installDistro,
    setInstallDistro,
    detectedInstallFamily,
    installStep,
    setInstallStep,
    installLogs,
    installError,
    installBusy,
    installedFeatures,
    selectedFeatures,
    setSelectedFeatures,
    onClose,
    onRunInstallation,
  } = props

  if (!showInstallModal) return <></>

  return (
    <div style={modalOverlay}>
      <div
        style={{
          ...modalContent,
          maxWidth: 600,
          minHeight: 450,
          background: 'var(--bg-panel)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
            borderBottom: '1px solid var(--border)',
            paddingBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 32,
                height: 32,
                background: 'var(--accent)',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 700,
              }}
            >
              D
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>{t('wizard.title')}</h2>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Step {installStep + 1} of 5
              </div>
            </div>
          </div>
          <button type="button" style={closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {installStep === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <>
                <div className="hp-status-alert success">
                  <span className="codicon codicon-pass" aria-hidden />
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {t('wizard.available')}
                    </div>
                    <div style={{ fontSize: 13 }}>
                      This build can run your distro&apos;s package steps (with{' '}
                      <span className="mono">sudo</span>) for Docker Engine and selected
                      components. You can still follow the official guide instead if you prefer.
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  Continue to choose components and enter your sudo password on the next steps.
                </div>
                <button
                  type="button"
                  className="hp-btn"
                  onClick={() => void window.dh.openExternal(DOCKER_ENGINE_INSTALL_DOCS)}
                >
                  <span className="codicon codicon-link-external" aria-hidden /> Official Docker
                  install guide (manual path)
                </button>
              </>
            </div>
          )}

          {installStep === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{t('wizard.distribution')}</h3>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
                Pick the package family for install commands (<span className="mono">apt</span>,{' '}
                <span className="mono">dnf</span>, or <span className="mono">pacman</span>).
              </p>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Detected host distro: <span className="mono">{hostDistroId}</span>
              </div>
              {detectedInstallFamily ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Installer locked to: <span className="mono">{detectedInstallFamily}</span>
                </div>
              ) : null}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {(
                  [
                    { id: 'ubuntu' as const, label: t('wizard.distro.ubuntu') },
                    { id: 'fedora' as const, label: t('wizard.distro.fedora') },
                    { id: 'arch' as const, label: t('wizard.distro.arch') },
                  ] as { id: InstallDistroId; label: string }[]
                ).map((d) => (
                  <label
                    key={d.id}
                    className="hp-card"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 14px',
                      cursor: 'pointer',
                      border:
                        installDistro === d.id
                          ? '2px solid var(--accent)'
                          : '1px solid var(--border)',
                      background:
                        installDistro === d.id
                          ? 'rgba(124, 77, 255, 0.08)'
                          : 'var(--bg-input)',
                    }}
                  >
                    <input
                      type="radio"
                      name="install-distro"
                      checked={installDistro === d.id}
                      disabled={
                        Boolean(detectedInstallFamily) && d.id !== detectedInstallFamily
                      }
                      onChange={() => setInstallDistro(d.id)}
                    />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{d.label}</span>
                  </label>
                ))}
              </div>
              <h3 style={{ margin: 0, fontSize: 16 }}>{t('wizard.components')}</h3>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
                We scanned your system and found some components are already installed.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { id: 'docker', title: 'Docker Engine', desc: 'Core daemon and CLI tools.' },
                  {
                    id: 'compose',
                    title: 'Docker Compose',
                    desc: 'Tool for defining and running multi-container apps.',
                  },
                  {
                    id: 'buildx',
                    title: 'Docker Buildx',
                    desc: 'Extended build capabilities with BuildKit.',
                  },
                ].map((feat) => {
                  const isInstalled =
                    installedFeatures[feat.id as keyof typeof installedFeatures]
                  return (
                    <label
                      key={feat.id}
                      className="hp-card"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 16px',
                        opacity: isInstalled ? 0.6 : 1,
                        cursor: isInstalled ? 'default' : 'pointer',
                        background: selectedFeatures.includes(feat.id)
                          ? 'rgba(124, 77, 255, 0.05)'
                          : 'var(--bg-input)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFeatures.includes(feat.id) || isInstalled}
                        disabled={isInstalled}
                        onChange={() => {
                          if (selectedFeatures.includes(feat.id))
                            setSelectedFeatures((prev) => prev.filter((x) => x !== feat.id))
                          else setSelectedFeatures((prev) => [...prev, feat.id])
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 600 }}>{feat.title}</span>
                          {isInstalled && (
                            <span
                              style={{
                                fontSize: 10,
                                color: 'var(--green)',
                                background: 'rgba(76, 175, 80, 0.1)',
                                padding: '2px 6px',
                                borderRadius: 4,
                              }}
                            >
                              INSTALLED
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {feat.desc}
                        </div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {installStep === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>{t('wizard.auth')}</h3>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
                Installation requires root privileges. You will be prompted by your system's
                graphical security dialog (Polkit / pkexec) to authenticate securely.
              </p>
              <div
                style={{
                  ...sectionBox,
                  background: 'rgba(255, 159, 67, 0.05)',
                  borderColor: 'rgba(255, 159, 67, 0.2)',
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--orange)' }}>
                  ⚠️ Ensure your user has sudo privileges on the host machine.
                </div>
              </div>
            </div>
          )}

          {installStep === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <h3 style={{ margin: 0, fontSize: 16 }}>{t('wizard.installing')}</h3>
                {installBusy && (
                  <div
                    className="spinner"
                    style={{
                      width: 20,
                      height: 20,
                      border: '2px solid var(--accent)',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                    }}
                  />
                )}
              </div>
              <div
                style={{
                  flex: 1,
                  background: '#000',
                  borderRadius: 8,
                  padding: 12,
                  fontFamily: 'monospace',
                  fontSize: 11,
                  color: '#0f0',
                  overflowY: 'auto',
                  maxHeight: 240,
                  minHeight: 200,
                }}
              >
                {installLogs.map((log, i) => (
                  <div key={i} style={{ marginBottom: 4 }}>
                    {log}
                  </div>
                ))}
                {installError && (
                  <div style={{ color: 'var(--red)', marginTop: 8, fontWeight: 700 }}>
                    Error: {installError}
                  </div>
                )}
              </div>
              {installError && (
                <button className="hp-btn hp-btn-danger" onClick={() => setInstallStep(2)}>
                  {t('action.retryStep')}
                </button>
              )}
            </div>
          )}

          {installStep === 4 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                alignItems: 'center',
                textAlign: 'center',
                padding: '20px 0',
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  background: 'var(--green)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 32,
                  marginBottom: 12,
                }}
              >
                ✔
              </div>
              <h2 style={{ margin: 0 }}>{t('wizard.complete')}</h2>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)', maxWidth: 400 }}>
                Docker Engine has been successfully installed and started. You can now manage
                containers directly from this dashboard.
              </p>
              <div style={{ ...sectionBox, textAlign: 'left', width: '100%' }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                  {t('wizard.nextSteps')}
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 20,
                    fontSize: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <li>{t('wizard.step.refreshDashboard')}</li>
                  <li>{t('wizard.step.verify')}</li>
                  <li>{t('wizard.step.permissions')}</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: 32,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
            borderTop: '1px solid var(--border)',
            paddingTop: 20,
          }}
        >
          {installStep === 0 && (
            <>
              <button className="hp-btn" onClick={onClose}>
                Close
              </button>
              <button
                type="button"
                className="hp-btn hp-btn-primary"
                onClick={() => setInstallStep(1)}
              >
                Continue to wizard
              </button>
            </>
          )}
          {installStep === 1 && (
            <>
              <button className="hp-btn" onClick={() => setInstallStep(0)}>
                {'<'}- Back
              </button>
              <button
                className="hp-btn hp-btn-primary"
                disabled={selectedFeatures.length === 0}
                onClick={() => setInstallStep(2)}
              >
                Next {'>'}
              </button>
            </>
          )}
          {installStep === 2 && (
            <>
              <button className="hp-btn" onClick={() => setInstallStep(1)}>
                {'<'}- Back
              </button>
              <button className="hp-btn hp-btn-primary" onClick={() => void onRunInstallation()}>
                {t('action.installNow')}
              </button>
            </>
          )}
          {installStep === 3 && !installBusy && (
            <button className="hp-btn" onClick={() => setInstallStep(0)}>
              {t('action.abort')}
            </button>
          )}
          {installStep === 4 && (
            <button className="hp-btn hp-btn-primary" onClick={onClose}>
              {t('action.finish')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
