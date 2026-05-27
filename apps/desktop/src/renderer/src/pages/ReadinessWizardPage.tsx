import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './ReadinessWizardPage.css'

type RequirementStatus = 'ok' | 'warning' | 'error'

type Requirement = {
  id: string
  label: string
  description: string
  status: RequirementStatus
  critical: boolean
  value?: string
}

type RequirementCategory = {
  title: string
  icon: string
  requirements: Requirement[]
}

type InstallProgress = {
  reqId: string
  fixId: string
  status: 'pending' | 'running' | 'complete' | 'error'
  error?: string
  message: string
}

const TOTAL_STEPS = 8

type ComposeProfile = 'web-dev' | 'data-science' | 'ai-ml' | 'mobile' | 'game-dev' | 'infra' | 'desktop-gui' | 'docs' | 'empty'

const STARTER_PROFILES: Array<{ id: ComposeProfile; label: string; icon: string }> = [
  { id: 'web-dev', label: 'Web Development', icon: '🌐' },
  { id: 'data-science', label: 'Data Science', icon: '📊' },
  { id: 'ai-ml', label: 'AI / ML Local', icon: '🤖' },
  { id: 'mobile', label: 'Mobile App Dev', icon: '📱' },
  { id: 'game-dev', label: 'Game Dev', icon: '🎮' },
  { id: 'infra', label: 'Infra / K8s', icon: '🏗' },
  { id: 'desktop-gui', label: 'Desktop Qt/GTK', icon: '🖥' },
  { id: 'docs', label: 'Docs / Writing', icon: '📝' },
  { id: 'empty', label: 'Empty Minimal', icon: '⬜' },
]

type InstallationTask = {
  id: string
  label: string
  status: 'pending' | 'running' | 'complete'
  progress: number
}

export function ReadinessWizardPage({ onComplete }: { onComplete: () => void }): ReactElement {
  const { t } = useTranslation('readiness')
  const [currentStep, setCurrentStep] = useState(1)
  const [categories, setCategories] = useState<RequirementCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [recheckLoading, setRecheckLoading] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const [progress, setProgress] = useState<InstallProgress | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [gitName, setGitName] = useState('')
  const [gitEmail, setGitEmail] = useState('')
  const [projectsDir, setProjectsDir] = useState('~/LuminaProjects')
  const [installationTasks, setInstallationTasks] = useState<InstallationTask[]>([])
  const [installationStatus, setInstallationStatus] = useState<'not-started' | 'running' | 'complete' | 'error'>('not-started')
  const [installationError, setInstallationError] = useState<string | null>(null)
  const [sshPublicKey, setSshPublicKey] = useState<string | null>(null)
  const [sshGenerating, setSshGenerating] = useState(false)
  const [sshError, setSshError] = useState<string | null>(null)
  const [pickedProfile, setPickedProfile] = useState<ComposeProfile | null>(null)

  const runProbes = useCallback(async () => {
    setLoading(true)
    try {
      const res = (await window.dh.systemReadinessCheck()) as {
        ok: boolean
        report?: {
          hardware: { ram_total_gb: number; cpu_cores: number; architecture: string }
          software: {
            docker_installed: boolean
            docker_running: boolean
            docker_version: string
            in_docker_group: boolean
            kvm_supported: boolean
          }
          tools: { git: boolean; curl: boolean; tar: boolean; unzip: boolean }
        }
      }
      if (res.ok && res.report) {
        buildCategories(res.report)
      }
    } catch (e) {
      console.error('Readiness check failed', e)
    } finally {
      setLoading(false)
    }
  }, [buildCategories])

  useEffect(() => {
    if (currentStep === 3) {
      void runProbes()
    }
  }, [currentStep, runProbes])

  useEffect(() => {
    if (currentStep === 8 && installationStatus === 'not-started') {
      void runFinalization()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep])

  const runFinalization = async () => {
    setInstallationStatus('running')
    setInstallationError(null)

    type FinalizationTask = { id: string; label: string; status: 'pending' | 'running' | 'complete'; progress: number }
    const tasks: FinalizationTask[] = [
      { id: 'git', label: t('wizard.install.taskGit'), status: 'pending', progress: 0 },
      { id: 'theme', label: t('wizard.install.taskTheme'), status: 'pending', progress: 0 },
      { id: 'profile', label: t('wizard.install.taskProfile'), status: 'pending', progress: 0 },
      { id: 'projects-dir', label: t('wizard.install.taskProjectsDir'), status: 'pending', progress: 0 },
      { id: 'complete', label: t('wizard.install.taskComplete'), status: 'pending', progress: 0 },
    ]
    setInstallationTasks(tasks)

    const setTask = (idx: number, patch: Partial<FinalizationTask>) => {
      tasks[idx] = { ...tasks[idx], ...patch }
      setInstallationTasks([...tasks])
    }

    try {
      // Task 1: Save Git identity
      setTask(0, { status: 'running', progress: 10 })
      if (gitName.trim()) {
        await window.dh.gitConfigSetKey({ key: 'user.name', value: gitName.trim() })
      }
      if (gitEmail.trim()) {
        await window.dh.gitConfigSetKey({ key: 'user.email', value: gitEmail.trim() })
      }
      setTask(0, { status: 'complete', progress: 100 })

      // Task 2: Apply theme
      setTask(1, { status: 'running', progress: 10 })
      await window.dh.storeSet({ key: 'appearance', data: { theme } })
      setTask(1, { status: 'complete', progress: 100 })

      // Task 3: Save starter profile
      setTask(2, { status: 'running', progress: 10 })
      if (pickedProfile) {
        await window.dh.storeSet({ key: 'onboarding_profile', data: pickedProfile })
      }
      setTask(2, { status: 'complete', progress: 100 })

      // Task 4: Save projects directory
      setTask(3, { status: 'running', progress: 10 })
      await window.dh.storeSet({ key: 'projects_home_dir', data: projectsDir })
      setTask(3, { status: 'complete', progress: 100 })

      // Task 5: Mark wizard complete
      setTask(4, { status: 'running', progress: 10 })
      await window.dh.storeSet({ key: 'readiness_wizard_complete', data: true })
      setTask(4, { status: 'complete', progress: 100 })

      setInstallationStatus('complete')
      await new Promise((r) => setTimeout(r, 800))
      onComplete()
    } catch (e) {
      setInstallationStatus('error')
      setInstallationError(e instanceof Error ? e.message : String(e))
    }
  }

  const buildCategories = (report: {
    hardware: { ram_total_gb: number; cpu_cores: number; architecture: string }
    software: {
      docker_installed: boolean
      docker_running: boolean
      docker_version: string
      in_docker_group: boolean
      kvm_supported: boolean
    }
    tools: { git: boolean; curl: boolean; tar: boolean; unzip: boolean }
  }) => {
    const { hardware, software, tools } = report

    const hardwareReqs: Requirement[] = [
      {
        id: 'ram',
        label: t('wizard.prereqs.reqRam'),
        description: t('wizard.prereqs.reqRamDesc'),
        status: hardware.ram_total_gb >= 4 ? 'ok' : 'warning',
        critical: hardware.ram_total_gb >= 4,
        value: t('wizard.prereqs.reqRamValue', { gb: hardware.ram_total_gb.toFixed(1) }),
      },
      {
        id: 'cpu',
        label: t('wizard.prereqs.reqCpu'),
        description: t('wizard.prereqs.reqCpuDesc'),
        status: hardware.cpu_cores >= 2 ? 'ok' : 'warning',
        critical: hardware.cpu_cores >= 2,
        value: t('wizard.prereqs.reqCpuValue', { cores: hardware.cpu_cores }),
      },
      {
        id: 'arch',
        label: t('wizard.prereqs.reqArch'),
        description: t('wizard.prereqs.reqArchDesc'),
        status: hardware.architecture === 'x86_64' ? 'ok' : 'error',
        critical: hardware.architecture === 'x86_64',
        value: hardware.architecture,
      },
      {
        id: 'virt',
        label: t('wizard.prereqs.reqVirt'),
        description: t('wizard.prereqs.reqVirtDesc'),
        status: software.kvm_supported ? 'ok' : 'error',
        critical: software.kvm_supported,
        value: software.kvm_supported ? t('wizard.prereqs.virtEnabled') : t('wizard.prereqs.virtNotAvailable'),
      },
    ]

    const toolReqs: Requirement[] = [
      {
        id: 'docker',
        label: t('wizard.prereqs.reqDocker'),
        description: t('wizard.prereqs.reqDockerDesc'),
        status: software.docker_installed ? 'ok' : 'error',
        critical: true,
        value: software.docker_installed ? software.docker_version : t('wizard.prereqs.dockerNotInstalled'),
      },
      {
        id: 'git',
        label: t('wizard.prereqs.reqGit'),
        description: t('wizard.prereqs.reqGitDesc'),
        status: tools.git ? 'ok' : 'error',
        critical: true,
      },
      {
        id: 'curl',
        label: t('wizard.prereqs.reqCurl'),
        description: t('wizard.prereqs.reqCurlDesc'),
        status: tools.curl ? 'ok' : 'warning',
        critical: false,
      },
      {
        id: 'tar',
        label: t('wizard.prereqs.reqTar'),
        description: t('wizard.prereqs.reqTarDesc'),
        status: tools.tar ? 'ok' : 'warning',
        critical: false,
      },
      {
        id: 'unzip',
        label: t('wizard.prereqs.reqUnzip'),
        description: t('wizard.prereqs.reqUnzipDesc'),
        status: tools.unzip ? 'ok' : 'warning',
        critical: false,
      },
    ]

    const dockerReqs: Requirement[] = [
      {
        id: 'daemon',
        label: t('wizard.prereqs.reqDaemon'),
        description: t('wizard.prereqs.reqDaemonDesc'),
        status: software.docker_running ? 'ok' : 'error',
        critical: true,
        value: software.docker_running ? t('wizard.prereqs.daemonRunning') : t('wizard.prereqs.daemonNotRunning'),
      },
      {
        id: 'group',
        label: t('wizard.prereqs.reqGroup'),
        description: t('wizard.prereqs.reqGroupDesc'),
        status: software.in_docker_group ? 'ok' : 'warning',
        critical: true,
        value: software.in_docker_group ? t('wizard.prereqs.groupYes') : t('wizard.prereqs.groupNo'),
      },
    ]

    setCategories([
      { title: t('wizard.prereqs.categoryHardware'), icon: 'circuit-board', requirements: hardwareReqs },
      { title: t('wizard.prereqs.categoryTools'), icon: 'wrench', requirements: toolReqs },
      { title: t('wizard.prereqs.categoryDocker'), icon: 'package', requirements: dockerReqs },
    ])
  }

  const allCriticalMet = categories.every((cat) =>
    cat.requirements.every((req) => !req.critical || req.status === 'ok'),
  )

  const canProceed = (): boolean => {
    if (currentStep === 3) return allCriticalMet
    if (currentStep === 8) return installationStatus === 'complete'
    return true
  }

  const getFixId = (reqId: string): string => {
    const fixMap: Record<string, string> = {
      docker: 'install-docker',
      git: 'install-git',
      curl: 'install-curl',
      tar: 'install-tar',
      unzip: 'install-unzip',
      daemon: 'docker-start',
      group: 'docker-group',
    }
    return fixMap[reqId] || reqId
  }

  const getProgressMessage = (fixId: string): string => {
    const messageMap: Record<string, string> = {
      'install-docker': t('wizard.progress.docker'),
      'install-git': t('wizard.progress.git'),
      'install-curl': t('wizard.progress.curl'),
      'install-tar': t('wizard.progress.tar'),
      'install-unzip': t('wizard.progress.unzip'),
      'docker-start': t('wizard.progress.dockerStart'),
      'docker-group': t('wizard.progress.dockerGroup'),
    }
    return messageMap[fixId] || t('wizard.progress.processing')
  }

  const handleInstall = async (reqId: string) => {
    const fixId = getFixId(reqId)
    setInstalling(reqId)
    setProgress({ reqId, fixId, status: 'running', message: getProgressMessage(fixId) })

    try {
      const res = (await window.dh.systemReadinessFix({ id: fixId })) as { ok: boolean; error?: string }

      if (res.ok) {
        setProgress((p) => p ? { ...p, status: 'complete', message: t('wizard.progress.verifying') } : null)
        await new Promise((r) => setTimeout(r, 800))
        await runProbes()
        setProgress(null)
      } else {
        setProgress((p) => ({
          ...(p || { reqId, fixId, status: 'error', message: '' }),
          status: 'error',
          error: res.error || t('wizard.progress.installFailed'),
        }))
      }
    } catch (e) {
      setProgress((p) => ({
        ...(p || { reqId, fixId, status: 'error', message: '' }),
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      }))
    } finally {
      setInstalling(null)
    }
  }

  const handleRetry = async () => {
    if (!progress) return
    setProgress(null)
    await handleInstall(progress.reqId)
  }

  const handleDismissError = () => {
    setProgress(null)
  }

  const handleNext = async () => {
    if (!canProceed()) return

    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleRetryInstallation = () => {
    setInstallationStatus('not-started')
    setInstallationError(null)
    setInstallationTasks([])
    // Immediately re-trigger finalization
    void runFinalization()
  }

  const handleGenerateSshKey = async () => {
    setSshGenerating(true)
    setSshError(null)
    try {
      const genRes = (await window.dh.sshGenerate({ target: 'host' })) as { ok: boolean; error?: string }
      if (genRes.ok) {
        const pubRes = (await window.dh.sshGetPub({ target: 'host' })) as { ok: boolean; pub?: string; error?: string }
        if (pubRes.ok && pubRes.pub) {
          setSshPublicKey(pubRes.pub)
        } else {
          setSshError(pubRes.error || t('wizard.ssh.failedRetrieve'))
        }
      } else {
        setSshError(genRes.error || t('wizard.ssh.failedGenerate'))
      }
    } catch (e) {
      setSshError(e instanceof Error ? e.message : String(e))
    } finally {
      setSshGenerating(false)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1)
  }

  const statusIcon = (status: RequirementStatus) => {
    switch (status) {
      case 'ok':
        return 'check'
      case 'warning':
        return 'warning'
      case 'error':
        return 'close'
    }
  }

  const statusColor = (status: RequirementStatus) => {
    switch (status) {
      case 'ok':
        return 'var(--green)'
      case 'warning':
        return 'var(--yellow)'
      case 'error':
        return 'var(--red)'
    }
  }

  return (
    <div className="readiness-wizard">
      <div className="readiness-wizard-bg" />

      <div className="readiness-wizard-container">
        {/* Progress Dots */}
        <div className="readiness-progress-dots">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((step) => (
            <div
              key={step}
              className={`readiness-progress-dot ${step === currentStep ? 'active' : ''} ${step < currentStep ? 'complete' : ''}`}
            />
          ))}
        </div>

        {/* Content Area */}
        <div className={`readiness-content readiness-step-${currentStep}`}>
          {/* STEP 1: Welcome */}
          {currentStep === 1 && (
            <div className="readiness-step-welcome">
              <div className="readiness-welcome-icon">
                <span className="codicon codicon-circle-large-filled" />
              </div>
              <h1 className="readiness-welcome-title">{t('wizard.welcome.title')}</h1>
              <p className="readiness-welcome-subtitle">{t('wizard.welcome.subtitle')}</p>
              <p className="readiness-welcome-description">
                {t('wizard.welcome.description')}
              </p>
            </div>
          )}

          {/* STEP 2: License */}
          {currentStep === 2 && (
            <div className="readiness-step-license">
              <h2 className="readiness-license-title">{t('wizard.license.title')}</h2>
              <p className="readiness-license-subtitle">{t('wizard.license.subtitle')}</p>
              <div className="readiness-license-box">
                <pre className="readiness-license-text">{t('wizard.license.text')}</pre>
              </div>
              <label className="readiness-license-agree">
                <input type="checkbox" defaultChecked disabled />
                <span>{t('wizard.license.agree')}</span>
              </label>
            </div>
          )}

          {/* STEP 3: Pre-Requisites */}
          {currentStep === 3 && (
            <div className="readiness-step-prereqs">
              <h2 className="readiness-prereqs-title">{t('wizard.prereqs.title')}</h2>
              <p className="readiness-prereqs-subtitle">{t('wizard.prereqs.subtitle')}</p>

              {loading ? (
                <div className="readiness-loading">
                  <div className="codicon codicon-loading codicon-modifier-spin" />
                  <div>{t('wizard.prereqs.checking')}</div>
                </div>
              ) : (
                <div className="readiness-categories">
                  {categories.map((cat) => (
                    <div key={cat.title} className="readiness-category">
                      <div className="readiness-category-header">
                        <span className={`codicon codicon-${cat.icon}`} />
                        <h3>{cat.title}</h3>
                      </div>

                      <div className="readiness-requirements">
                        {cat.requirements.map((req) => (
                          <div key={req.id} className={`readiness-requirement readiness-requirement-${req.status}`}>
                            <div className="readiness-requirement-left">
                              <div
                                className="readiness-requirement-icon"
                                style={{ color: statusColor(req.status) }}
                              >
                                <span className={`codicon codicon-${statusIcon(req.status)}`} />
                              </div>
                              <div className="readiness-requirement-text">
                                <div className="readiness-requirement-label">{req.label}</div>
                                <div className="readiness-requirement-desc">{req.description}</div>
                              </div>
                              {req.value && <div className="readiness-requirement-value">{req.value}</div>}
                            </div>

                            {req.status !== 'ok' && (
                              <div className="readiness-requirement-actions">
                                <button
                                  className="readiness-btn readiness-btn-install"
                                  onClick={() => void handleInstall(req.id)}
                                  disabled={installing === req.id}
                                  title={t('wizard.prereqs.fixTitle', { name: req.label })}
                                >
                                  {installing === req.id ? (
                                    <>
                                      <span className="codicon codicon-loading codicon-modifier-spin" />
                                      {t('wizard.prereqs.installing')}
                                    </>
                                  ) : (
                                    t('wizard.prereqs.fixIt')
                                  )}
                                </button>
                                <button
                                  className="readiness-btn readiness-btn-help"
                                  title={t('wizard.prereqs.helpTitle')}
                                >
                                  <span className="codicon codicon-question" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!loading && (
                <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    className="readiness-btn readiness-btn-install"
                    onClick={() => {
                      setRecheckLoading(true)
                      void runProbes().finally(() => setRecheckLoading(false))
                    }}
                    disabled={recheckLoading}
                    title={t('wizard.prereqs.recheckTitle')}
                  >
                    {recheckLoading ? (
                      <><span className="codicon codicon-loading codicon-modifier-spin" /> {t('wizard.prereqs.checking')}</>
                    ) : (
                      <><span className="codicon codicon-refresh" /> {t('wizard.prereqs.recheck')}</>
                    )}
                  </button>
                  {!allCriticalMet && (
                    <div className="readiness-prereqs-notice" style={{ margin: 0 }}>
                      <span className="codicon codicon-warning" />
                      <div>
                        {t('wizard.prereqs.notice')}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Projects Home Directory */}
          {currentStep === 4 && (
            <div className="readiness-step-location">
              <h2 className="readiness-location-title">{t('wizard.location.title')}</h2>
              <p className="readiness-location-subtitle">{t('wizard.location.subtitle')}</p>

              <div className="readiness-location-section">
                <label className="readiness-location-label">{t('wizard.location.label')}</label>
                <div className="readiness-location-input-group">
                  <input
                    type="text"
                    className="readiness-location-input"
                    value={projectsDir}
                    onChange={(e) => setProjectsDir(e.target.value)}
                    placeholder={t('wizard.location.placeholder')}
                  />
                  <button
                    className="readiness-location-browse"
                    title={t('wizard.location.browseTitle')}
                    onClick={() => {
                      void window.dh.selectFolder().then((p) => {
                        if (p) setProjectsDir(p)
                      })
                    }}
                  >
                    <span className="codicon codicon-folder-open" />
                  </button>
                </div>
                <p className="readiness-location-hint">{t('wizard.location.hint')}</p>
              </div>

              <div className="readiness-location-info">
                <span className="codicon codicon-info" />
                <div>
                  {t('wizard.location.info')}
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Configuration */}
          {currentStep === 5 && (
            <div className="readiness-step-config">
              <h2 className="readiness-config-title">{t('wizard.config.title')}</h2>
              <p className="readiness-config-subtitle">{t('wizard.config.subtitle')}</p>

              <div className="readiness-config-section">
                <label className="readiness-config-label">{t('wizard.config.themeLabel')}</label>
                <div className="readiness-config-theme-options">
                  <button
                    className={`readiness-theme-option ${theme === 'dark' ? 'active' : ''}`}
                    onClick={() => setTheme('dark')}
                  >
                    <span className="codicon codicon-circle-large-filled" />
                    <div>{t('wizard.config.dark')}</div>
                  </button>
                  <button
                    className={`readiness-theme-option ${theme === 'light' ? 'active' : ''}`}
                    onClick={() => setTheme('light')}
                  >
                    <span className="codicon codicon-circle-large-filled" />
                    <div>{t('wizard.config.light')}</div>
                  </button>
                </div>
              </div>

              <div className="readiness-config-section">
                <label className="readiness-config-label">{t('wizard.config.gitLabel')}</label>
                <div className="readiness-config-fields">
                  <input
                    type="text"
                    className="readiness-config-input"
                    placeholder={t('wizard.config.namePlaceholder')}
                    value={gitName}
                    onChange={(e) => setGitName(e.target.value)}
                  />
                  <input
                    type="email"
                    className="readiness-config-input"
                    placeholder={t('wizard.config.emailPlaceholder')}
                    value={gitEmail}
                    onChange={(e) => setGitEmail(e.target.value)}
                  />
                </div>
                <p className="readiness-config-hint">{t('wizard.config.hint')}</p>
              </div>
            </div>
          )}

          {/* STEP 6: SSH Key Generation */}
          {currentStep === 6 && (
            <div className="readiness-step-ssh">
              <h2 className="readiness-ssh-title">{t('wizard.ssh.title')}</h2>
              <p className="readiness-ssh-subtitle">{t('wizard.ssh.subtitle')}</p>

              {sshPublicKey ? (
                <div className="readiness-ssh-success">
                  <div className="readiness-ssh-icon">
                    <span className="codicon codicon-check" />
                  </div>
                  <p className="readiness-ssh-message">{t('wizard.ssh.generated')}</p>
                  <pre className="readiness-ssh-key">{sshPublicKey}</pre>
                  <p className="readiness-ssh-hint">{t('wizard.ssh.saveHint')}</p>
                </div>
              ) : (
                <div className="readiness-ssh-info">
                  <span className="codicon codicon-info" />
                  <div>
                    {t('wizard.ssh.whatIs')}
                  </div>
                </div>
              )}

              {sshError && (
                <div className="readiness-ssh-error">
                  <span className="codicon codicon-error" />
                  <div>{sshError}</div>
                </div>
              )}

              <div className="readiness-ssh-actions">
                {!sshPublicKey && (
                  <button
                    className="readiness-ssh-generate-btn"
                    onClick={() => void handleGenerateSshKey()}
                    disabled={sshGenerating}
                  >
                    {sshGenerating ? (
                      <>
                        <span className="codicon codicon-loading codicon-modifier-spin" />
                        {t('wizard.ssh.generating')}
                      </>
                    ) : (
                      <>
                        <span className="codicon codicon-key" />
                        {t('wizard.ssh.generate')}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* STEP 7: Starter Profile Selection */}
          {currentStep === 7 && (
            <div className="readiness-step-profile">
              <h2 className="readiness-profile-title">{t('wizard.profile.title')}</h2>
              <p className="readiness-profile-subtitle">{t('wizard.profile.subtitle')}</p>

              <div className="readiness-profile-grid">
                {STARTER_PROFILES.map((profile) => (
                  <button
                    key={profile.id}
                    className={`readiness-profile-option ${pickedProfile === profile.id ? 'active' : ''}`}
                    onClick={() => setPickedProfile(profile.id)}
                  >
                    <span className="readiness-profile-icon">{profile.icon}</span>
                    <span className="readiness-profile-label">{t(`wizard.profile.${profile.id}`)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* STEP 8: Installation Progress */}
          {currentStep === 8 && (
            <div className="readiness-step-install">
              {installationStatus === 'complete' ? (
                <div className="readiness-install-complete">
                  <div className="readiness-install-success-icon">
                    <span className="codicon codicon-check-all" />
                  </div>
                  <h2 className="readiness-install-complete-title">{t('wizard.install.completeTitle')}</h2>
                  <p className="readiness-install-complete-subtitle">{t('wizard.install.completeSubtitle')}</p>
                  <p className="readiness-install-complete-message">
                    {t('wizard.install.completeMessage')}
                  </p>
                </div>
              ) : installationStatus === 'error' ? (
                <div className="readiness-install-error">
                  <div className="readiness-install-error-icon">
                    <span className="codicon codicon-error" />
                  </div>
                  <h2 className="readiness-install-error-title">{t('wizard.install.failedTitle')}</h2>
                  <p className="readiness-install-error-message">{installationError}</p>
                  <button className="readiness-install-retry-btn" onClick={handleRetryInstallation}>
                    <span className="codicon codicon-refresh" />
                    {t('wizard.install.retry')}
                  </button>
                </div>
              ) : (
                <div className="readiness-install-progress">
                  <h2 className="readiness-install-title">{t('wizard.install.title')}</h2>
                  <p className="readiness-install-subtitle">{t('wizard.install.subtitle')}</p>

                  <div className="readiness-install-tasks">
                    {installationTasks.map((task) => (
                      <div key={task.id} className={`readiness-install-task readiness-install-task-${task.status}`}>
                        <div className="readiness-install-task-header">
                          <div className="readiness-install-task-icon">
                            {task.status === 'complete' ? (
                              <span className="codicon codicon-check" />
                            ) : task.status === 'running' ? (
                              <span className="codicon codicon-loading codicon-modifier-spin" />
                            ) : (
                              <span className="codicon codicon-circle-outline" />
                            )}
                          </div>
                          <div className="readiness-install-task-label">{task.label}</div>
                          <div className="readiness-install-task-percent">{Math.round(task.progress)}%</div>
                        </div>
                        <div className="readiness-install-task-bar">
                          <div className="readiness-install-task-bar-fill" style={{ width: `${task.progress}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="readiness-install-status">
                    <div className="readiness-install-status-spinner">
                      <span className="codicon codicon-loading codicon-modifier-spin" />
                    </div>
                    <div>{t('wizard.install.inProgress')}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="readiness-footer">
          <button
            className="readiness-btn-nav readiness-btn-back"
            onClick={handleBack}
            disabled={currentStep === 1 || currentStep === 8}
            title={currentStep === 1 || currentStep === 8 ? t('wizard.footer.backDisabledTitle') : t('wizard.footer.backTitle')}
          >
            <span className="codicon codicon-chevron-left" />
            {t('wizard.footer.back')}
          </button>

          <button
            className="readiness-btn-nav readiness-btn-next"
            onClick={() => void handleNext()}
            disabled={!canProceed()}
            title={
              currentStep === 3 && !allCriticalMet
                ? t('wizard.footer.nextDisabledPrereqs')
                : currentStep === 8 && installationStatus !== 'complete'
                  ? t('wizard.footer.nextDisabledInstalling')
                  : currentStep === 8
                    ? t('wizard.footer.nextStartTitle')
                    : t('wizard.footer.nextContinueTitle')
            }
          >
            {currentStep === 8 && installationStatus === 'complete' ? t('wizard.footer.start') : t('wizard.footer.next')}
            <span className="codicon codicon-chevron-right" />
          </button>
        </div>
      </div>

      {/* Progress Modal */}
      {progress && (
        <div className="readiness-progress-overlay">
          <div className="readiness-progress-modal">
            {progress.status === 'error' ? (
              <>
                <div className="readiness-progress-error-icon">
                  <span className="codicon codicon-error" />
                </div>
                <h3 className="readiness-progress-title">{t('wizard.progress.failed')}</h3>
                <p className="readiness-progress-error-message">{progress.error}</p>
                <div className="readiness-progress-actions">
                  <button className="readiness-progress-btn readiness-progress-btn-primary" onClick={() => void handleRetry()}>
                    {t('wizard.progress.retry')}
                  </button>
                  <button className="readiness-progress-btn" onClick={handleDismissError}>
                    {t('wizard.progress.dismiss')}
                  </button>
                </div>
              </>
            ) : progress.status === 'complete' ? (
              <>
                <div className="readiness-progress-success-icon">
                  <span className="codicon codicon-check" />
                </div>
                <h3 className="readiness-progress-title">{t('wizard.progress.success')}</h3>
                <p className="readiness-progress-message">{progress.message}</p>
                <div className="readiness-progress-bar readiness-progress-bar-complete" />
              </>
            ) : (
              <>
                <div className="readiness-progress-spinner">
                  <span className="codicon codicon-loading codicon-modifier-spin" />
                </div>
                <h3 className="readiness-progress-title">{t('wizard.progress.installing')}</h3>
                <p className="readiness-progress-message">{progress.message}</p>
                <div className="readiness-progress-bar">
                  <div className="readiness-progress-bar-fill" />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
