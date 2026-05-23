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

const TOTAL_STEPS = 6

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
  const [installing, setInstalling] = useState<string | null>(null)
  const [progress, setProgress] = useState<InstallProgress | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [gitName, setGitName] = useState('')
  const [gitEmail, setGitEmail] = useState('')
  const [installPath, setInstallPath] = useState('/home')
  const [installationTasks, setInstallationTasks] = useState<InstallationTask[]>([])
  const [installationStatus, setInstallationStatus] = useState<'not-started' | 'running' | 'complete' | 'error'>('not-started')
  const [installationError, setInstallationError] = useState<string | null>(null)

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
    if (currentStep === 6 && installationStatus === 'not-started') {
      void runInstallation()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep])

  const runInstallation = async () => {
    setInstallationStatus('running')
    setInstallationError(null)

    const tasks: InstallationTask[] = [
      { id: 'validate', label: 'Validating system configuration...', status: 'pending', progress: 0 },
      { id: 'download', label: 'Downloading LuminaDev components...', status: 'pending', progress: 0 },
      { id: 'extract', label: 'Extracting files...', status: 'pending', progress: 0 },
      { id: 'config', label: 'Configuring application...', status: 'pending', progress: 0 },
      { id: 'finalize', label: 'Finalizing setup...', status: 'pending', progress: 0 },
    ]

    setInstallationTasks(tasks)

    try {
      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i]
        task.status = 'running'
        setInstallationTasks([...tasks])

        await simulateTaskProgress(task, tasks)

        task.status = 'complete'
        task.progress = 100
        setInstallationTasks([...tasks])

        await new Promise((r) => setTimeout(r, 300))
      }

      setInstallationStatus('complete')
      await window.dh.storeSet({
        key: 'readiness_wizard_complete',
        data: true,
      })

      await new Promise((r) => setTimeout(r, 1000))
      onComplete()
    } catch (e) {
      setInstallationStatus('error')
      setInstallationError(e instanceof Error ? e.message : String(e))
    }
  }

  const simulateTaskProgress = async (task: InstallationTask, tasks: InstallationTask[]) => {
    const duration = 2000 + Math.random() * 1000
    const startTime = Date.now()

    return new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime
        const progress = Math.min((elapsed / duration) * 100, 95)

        task.progress = progress
        setInstallationTasks([...tasks])

        if (elapsed >= duration) {
          clearInterval(interval)
          resolve()
        }
      }, 100)
    })
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
    if (currentStep === 6) return installationStatus === 'complete'
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

              {!loading && !allCriticalMet && (
                <div className="readiness-prereqs-notice">
                  <span className="codicon codicon-info" />
                  <div>
                    <strong>Fix all critical requirements to continue.</strong> Click "Fix It" on any red items to install
                    automatically.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Install Location */}
          {currentStep === 4 && (
            <div className="readiness-step-location">
              <h2 className="readiness-location-title">Installation Location</h2>
              <p className="readiness-location-subtitle">Choose where to store your LuminaDev working directory</p>

              <div className="readiness-location-section">
                <label className="readiness-location-label">Install Path</label>
                <div className="readiness-location-input-group">
                  <input
                    type="text"
                    className="readiness-location-input"
                    value={installPath}
                    onChange={(e) => setInstallPath(e.target.value)}
                    placeholder="/home/user/luminadev"
                  />
                  <button className="readiness-location-browse">
                    <span className="codicon codicon-folder-open" />
                  </button>
                </div>
                <p className="readiness-location-hint">This is where LuminaDev will store configurations and working data</p>
              </div>

              <div className="readiness-location-info">
                <span className="codicon codicon-info" />
                <div>
                  <strong>Recommended:</strong> Use a path on a fast SSD with at least 20GB of free space
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

          {/* STEP 6: Installation Progress */}
          {currentStep === 6 && (
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
            disabled={currentStep === 1 || currentStep === 6}
            title={currentStep === 1 || currentStep === 6 ? 'Cannot go back' : 'Go back'}
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
                : currentStep === 6 && installationStatus !== 'complete'
                  ? 'Waiting for installation to complete'
                  : currentStep === 6
                    ? 'Start LuminaDev'
                    : 'Continue to next step'
            }
          >
            {currentStep === 6 && installationStatus === 'complete' ? 'Start LuminaDev' : 'Next'}
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
