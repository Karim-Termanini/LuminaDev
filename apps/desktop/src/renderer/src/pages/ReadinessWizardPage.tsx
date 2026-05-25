import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
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

const OPEN_SOURCE_LICENSE = `LuminaDev - Open Source License

Copyright (c) 2024-present LuminaDev Contributors

This software is released under the MIT License. You are free to use, modify, and distribute this software, provided that you include this license notice in all copies or substantial portions of the software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

For more information, visit: https://github.com/luminadev/luminadev`

export function ReadinessWizardPage({ onComplete }: { onComplete: () => void }): ReactElement {
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
  }, [])

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
      { id: 'git', label: 'Saving Git identity...', status: 'pending', progress: 0 },
      { id: 'theme', label: 'Applying theme preference...', status: 'pending', progress: 0 },
      { id: 'profile', label: 'Saving starter profile...', status: 'pending', progress: 0 },
      { id: 'projects-dir', label: 'Configuring projects directory...', status: 'pending', progress: 0 },
      { id: 'complete', label: 'Finalizing setup...', status: 'pending', progress: 0 },
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
        label: 'RAM',
        description: '≥4GB required',
        status: hardware.ram_total_gb >= 4 ? 'ok' : 'warning',
        critical: hardware.ram_total_gb >= 4,
        value: `${hardware.ram_total_gb.toFixed(1)}GB total`,
      },
      {
        id: 'cpu',
        label: 'CPU Cores',
        description: '≥2 required',
        status: hardware.cpu_cores >= 2 ? 'ok' : 'warning',
        critical: hardware.cpu_cores >= 2,
        value: `${hardware.cpu_cores} cores`,
      },
      {
        id: 'arch',
        label: 'Architecture',
        description: 'x86_64 required',
        status: hardware.architecture === 'x86_64' ? 'ok' : 'error',
        critical: hardware.architecture === 'x86_64',
        value: hardware.architecture,
      },
      {
        id: 'virt',
        label: 'Virtualization',
        description: 'KVM support required',
        status: software.kvm_supported ? 'ok' : 'error',
        critical: software.kvm_supported,
        value: software.kvm_supported ? 'Enabled' : 'Not available',
      },
    ]

    const toolReqs: Requirement[] = [
      {
        id: 'docker',
        label: 'Docker',
        description: 'v20.10+',
        status: software.docker_installed ? 'ok' : 'error',
        critical: true,
        value: software.docker_installed ? software.docker_version : 'Not installed',
      },
      {
        id: 'git',
        label: 'Git',
        description: 'Required',
        status: tools.git ? 'ok' : 'error',
        critical: true,
      },
      {
        id: 'curl',
        label: 'Curl',
        description: 'Required',
        status: tools.curl ? 'ok' : 'warning',
        critical: false,
      },
      {
        id: 'tar',
        label: 'Tar',
        description: 'Required',
        status: tools.tar ? 'ok' : 'warning',
        critical: false,
      },
      {
        id: 'unzip',
        label: 'Unzip',
        description: 'Required',
        status: tools.unzip ? 'ok' : 'warning',
        critical: false,
      },
    ]

    const dockerReqs: Requirement[] = [
      {
        id: 'daemon',
        label: 'Docker Daemon',
        description: 'Must be running',
        status: software.docker_running ? 'ok' : 'error',
        critical: true,
        value: software.docker_running ? 'Running' : 'Not running',
      },
      {
        id: 'group',
        label: 'Docker Group',
        description: 'User in docker group',
        status: software.in_docker_group ? 'ok' : 'warning',
        critical: true,
        value: software.in_docker_group ? 'Yes' : 'No',
      },
    ]

    setCategories([
      { title: 'Hardware', icon: 'circuit-board', requirements: hardwareReqs },
      { title: 'System Tools', icon: 'wrench', requirements: toolReqs },
      { title: 'Docker', icon: 'package', requirements: dockerReqs },
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
      'install-docker': 'Installing Docker container runtime...',
      'install-git': 'Installing Git version control...',
      'install-curl': 'Installing Curl HTTP client...',
      'install-tar': 'Installing Tar archiver...',
      'install-unzip': 'Installing Unzip utility...',
      'docker-start': 'Starting Docker daemon...',
      'docker-group': 'Adding user to docker group...',
    }
    return messageMap[fixId] || 'Processing...'
  }

  const handleInstall = async (reqId: string) => {
    const fixId = getFixId(reqId)
    setInstalling(reqId)
    setProgress({ reqId, fixId, status: 'running', message: getProgressMessage(fixId) })

    try {
      const res = (await window.dh.systemReadinessFix({ id: fixId })) as { ok: boolean; error?: string }

      if (res.ok) {
        setProgress((p) => p ? { ...p, status: 'complete', message: 'Installation complete. Verifying...' } : null)
        await new Promise((r) => setTimeout(r, 800))
        await runProbes()
        setProgress(null)
      } else {
        setProgress((p) => ({
          ...(p || { reqId, fixId, status: 'error', message: '' }),
          status: 'error',
          error: res.error || 'Installation failed',
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
          setSshError(pubRes.error || 'Failed to retrieve public key')
        }
      } else {
        setSshError(genRes.error || 'Failed to generate SSH key')
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
              <h1 className="readiness-welcome-title">Welcome to LuminaDev</h1>
              <p className="readiness-welcome-subtitle">A premium development container orchestration platform</p>
              <p className="readiness-welcome-description">
                This installer will check your system, verify prerequisites, and prepare LuminaDev for first use.
              </p>
            </div>
          )}

          {/* STEP 2: License */}
          {currentStep === 2 && (
            <div className="readiness-step-license">
              <h2 className="readiness-license-title">Open Source License</h2>
              <p className="readiness-license-subtitle">Please review our open source license agreement</p>
              <div className="readiness-license-box">
                <pre className="readiness-license-text">{OPEN_SOURCE_LICENSE}</pre>
              </div>
              <label className="readiness-license-agree">
                <input type="checkbox" defaultChecked disabled />
                <span>I agree to the terms and conditions</span>
              </label>
            </div>
          )}

          {/* STEP 3: Pre-Requisites */}
          {currentStep === 3 && (
            <div className="readiness-step-prereqs">
              <h2 className="readiness-prereqs-title">System Requirements</h2>
              <p className="readiness-prereqs-subtitle">Verifying your system meets LuminaDev requirements</p>

              {loading ? (
                <div className="readiness-loading">
                  <div className="codicon codicon-loading codicon-modifier-spin" />
                  <div>Checking system requirements...</div>
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
                                  title={`Fix: ${req.label}`}
                                >
                                  {installing === req.id ? (
                                    <>
                                      <span className="codicon codicon-loading codicon-modifier-spin" />
                                      Installing...
                                    </>
                                  ) : (
                                    'Fix It'
                                  )}
                                </button>
                                <button
                                  className="readiness-btn readiness-btn-help"
                                  title="How to fix manually"
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
                    title="Re-run all system probes"
                  >
                    {recheckLoading ? (
                      <><span className="codicon codicon-loading codicon-modifier-spin" /> Checking...</>
                    ) : (
                      <><span className="codicon codicon-refresh" /> Recheck All</>
                    )}
                  </button>
                  {!allCriticalMet && (
                    <div className="readiness-prereqs-notice" style={{ margin: 0 }}>
                      <span className="codicon codicon-warning" />
                      <div>
                        <strong>Fix all critical requirements to continue.</strong> Click "Fix It" on any red items to install automatically, then press Recheck All.
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
              <h2 className="readiness-location-title">Projects Home Directory</h2>
              <p className="readiness-location-subtitle">Choose where LuminaDev stores your development projects</p>

              <div className="readiness-location-section">
                <label className="readiness-location-label">Projects Directory</label>
                <div className="readiness-location-input-group">
                  <input
                    type="text"
                    className="readiness-location-input"
                    value={projectsDir}
                    onChange={(e) => setProjectsDir(e.target.value)}
                    placeholder="~/LuminaProjects"
                  />
                  <button
                    className="readiness-location-browse"
                    title="Browse for folder"
                    onClick={() => {
                      void window.dh.selectFolder().then((p) => {
                        if (p) setProjectsDir(p)
                      })
                    }}
                  >
                    <span className="codicon codicon-folder-open" />
                  </button>
                </div>
                <p className="readiness-location-hint">Each new project will be created inside this folder (e.g. ~/LuminaProjects/data-science/my-project)</p>
              </div>

              <div className="readiness-location-info">
                <span className="codicon codicon-info" />
                <div>
                  <strong>Recommended:</strong> Use a path on a fast SSD with at least 20GB of free space. You can change this later in Settings.
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Configuration */}
          {currentStep === 5 && (
            <div className="readiness-step-config">
              <h2 className="readiness-config-title">User Configuration</h2>
              <p className="readiness-config-subtitle">Set your preferences before starting</p>

              <div className="readiness-config-section">
                <label className="readiness-config-label">Theme</label>
                <div className="readiness-config-theme-options">
                  <button
                    className={`readiness-theme-option ${theme === 'dark' ? 'active' : ''}`}
                    onClick={() => setTheme('dark')}
                  >
                    <span className="codicon codicon-circle-large-filled" />
                    <div>Dark</div>
                  </button>
                  <button
                    className={`readiness-theme-option ${theme === 'light' ? 'active' : ''}`}
                    onClick={() => setTheme('light')}
                  >
                    <span className="codicon codicon-circle-large-filled" />
                    <div>Light</div>
                  </button>
                </div>
              </div>

              <div className="readiness-config-section">
                <label className="readiness-config-label">Git Identity</label>
                <div className="readiness-config-fields">
                  <input
                    type="text"
                    className="readiness-config-input"
                    placeholder="Your Name"
                    value={gitName}
                    onChange={(e) => setGitName(e.target.value)}
                  />
                  <input
                    type="email"
                    className="readiness-config-input"
                    placeholder="your.email@example.com"
                    value={gitEmail}
                    onChange={(e) => setGitEmail(e.target.value)}
                  />
                </div>
                <p className="readiness-config-hint">Used for commits in your development environment</p>
              </div>
            </div>
          )}

          {/* STEP 6: SSH Key Generation */}
          {currentStep === 6 && (
            <div className="readiness-step-ssh">
              <h2 className="readiness-ssh-title">SSH Key Generation</h2>
              <p className="readiness-ssh-subtitle">Generate an Ed25519 SSH key for GitHub/GitLab authentication</p>

              {sshPublicKey ? (
                <div className="readiness-ssh-success">
                  <div className="readiness-ssh-icon">
                    <span className="codicon codicon-check" />
                  </div>
                  <p className="readiness-ssh-message">Key generated! Add this to your GitHub account:</p>
                  <pre className="readiness-ssh-key">{sshPublicKey}</pre>
                  <p className="readiness-ssh-hint">Save this key in your GitHub Settings → SSH and GPG keys</p>
                </div>
              ) : (
                <div className="readiness-ssh-info">
                  <span className="codicon codicon-info" />
                  <div>
                    <strong>What is an SSH key?</strong> It's a secure way to authenticate with GitHub/GitLab without passwords. We'll generate one at <code>~/.ssh/id_ed25519</code>
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
                        Generating...
                      </>
                    ) : (
                      <>
                        <span className="codicon codicon-key" />
                        Generate SSH Key
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
              <h2 className="readiness-profile-title">Choose a Starter Profile</h2>
              <p className="readiness-profile-subtitle">Select your development environment preset. You can change this anytime in Profiles.</p>

              <div className="readiness-profile-grid">
                {STARTER_PROFILES.map((profile) => (
                  <button
                    key={profile.id}
                    className={`readiness-profile-option ${pickedProfile === profile.id ? 'active' : ''}`}
                    onClick={() => setPickedProfile(profile.id)}
                  >
                    <span className="readiness-profile-icon">{profile.icon}</span>
                    <span className="readiness-profile-label">{profile.label}</span>
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
                  <h2 className="readiness-install-complete-title">Installation Complete</h2>
                  <p className="readiness-install-complete-subtitle">LuminaDev is ready to use</p>
                  <p className="readiness-install-complete-message">
                    Your development environment has been configured and all dependencies are installed. Ready to launch!
                  </p>
                </div>
              ) : installationStatus === 'error' ? (
                <div className="readiness-install-error">
                  <div className="readiness-install-error-icon">
                    <span className="codicon codicon-error" />
                  </div>
                  <h2 className="readiness-install-error-title">Installation Failed</h2>
                  <p className="readiness-install-error-message">{installationError}</p>
                  <button className="readiness-install-retry-btn" onClick={handleRetryInstallation}>
                    <span className="codicon codicon-refresh" />
                    Retry Installation
                  </button>
                </div>
              ) : (
                <div className="readiness-install-progress">
                  <h2 className="readiness-install-title">Setting Up LuminaDev</h2>
                  <p className="readiness-install-subtitle">Initializing your development environment...</p>

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
                    <div>Installation in progress...</div>
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
            title={currentStep === 1 || currentStep === 8 ? 'Cannot go back' : 'Go back'}
          >
            <span className="codicon codicon-chevron-left" />
            Back
          </button>

          <button
            className="readiness-btn-nav readiness-btn-next"
            onClick={() => void handleNext()}
            disabled={!canProceed()}
            title={
              currentStep === 3 && !allCriticalMet
                ? 'Install missing requirements to continue'
                : currentStep === 8 && installationStatus !== 'complete'
                  ? 'Waiting for installation to complete'
                  : currentStep === 8
                    ? 'Start LuminaDev'
                    : 'Continue to next step'
            }
          >
            {currentStep === 8 && installationStatus === 'complete' ? 'Start LuminaDev' : 'Next'}
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
                <h3 className="readiness-progress-title">Installation Failed</h3>
                <p className="readiness-progress-error-message">{progress.error}</p>
                <div className="readiness-progress-actions">
                  <button className="readiness-progress-btn readiness-progress-btn-primary" onClick={() => void handleRetry()}>
                    Retry
                  </button>
                  <button className="readiness-progress-btn" onClick={handleDismissError}>
                    Dismiss
                  </button>
                </div>
              </>
            ) : progress.status === 'complete' ? (
              <>
                <div className="readiness-progress-success-icon">
                  <span className="codicon codicon-check" />
                </div>
                <h3 className="readiness-progress-title">Success</h3>
                <p className="readiness-progress-message">{progress.message}</p>
                <div className="readiness-progress-bar readiness-progress-bar-complete" />
              </>
            ) : (
              <>
                <div className="readiness-progress-spinner">
                  <span className="codicon codicon-loading codicon-modifier-spin" />
                </div>
                <h3 className="readiness-progress-title">Installing</h3>
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
