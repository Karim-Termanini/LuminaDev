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

export function ReadinessWizardPage({ onComplete }: { onComplete: () => void }): ReactElement {
  const [categories, setCategories] = useState<RequirementCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<string | null>(null)

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
    void runProbes()
  }, [runProbes])

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

    // Hardware requirements
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

    // System Tools
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

    // Docker State
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

  const getFixId = (reqId: string): string => {
    // Map requirement IDs to fix IDs in readiness.rs
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

  const handleInstall = async (reqId: string) => {
    setInstalling(reqId)
    try {
      const fixId = getFixId(reqId)
      const res = (await window.dh.systemReadinessFix({ id: fixId })) as { ok: boolean; error?: string }
      if (res.ok) {
        await new Promise((r) => setTimeout(r, 500)) // Brief pause before recheck
        await runProbes()
      } else {
        alert(`Failed to fix ${reqId}: ${res.error || 'Unknown error'}`)
      }
    } catch (e) {
      alert(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setInstalling(null)
    }
  }

  const handleNext = async () => {
    await window.dh.storeSet({
      key: 'readiness_wizard_complete',
      data: true,
    })
    onComplete()
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
        {/* Hero */}
        <div className="readiness-hero">
          <h1 className="readiness-hero-title">Install LuminaDev</h1>
          <p className="readiness-hero-subtitle">System requirements check</p>
        </div>

        {/* Requirements */}
        <div className="readiness-content">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 48, marginBottom: 20 }} />
              <div style={{ color: 'var(--text-muted)' }}>Checking system requirements...</div>
            </div>
          ) : (
            <>
              {categories.map((cat) => (
                <div key={cat.title} className="readiness-category">
                  <div className="readiness-category-header">
                    <span className={`codicon codicon-${cat.icon}`} />
                    <h2>{cat.title}</h2>
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
            </>
          )}
        </div>

        {/* Footer */}
        <div className="readiness-footer">
          <button
            className="readiness-btn-next"
            onClick={() => void handleNext()}
            disabled={!allCriticalMet || loading}
            title={allCriticalMet ? 'Continue to setup' : 'Install missing requirements to continue'}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
