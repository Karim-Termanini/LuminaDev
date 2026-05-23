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
      const res = (await window.dh.systemReadinessCheck()) as { ok: boolean; report?: unknown }
      if (res.ok) {
        buildCategories()
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

  const buildCategories = () => {
    // Placeholder: will be populated with real probe data
    setCategories([
      {
        title: 'Hardware',
        icon: 'circuit-board',
        requirements: [
          { id: 'ram', label: 'RAM', description: '≥4GB required', status: 'ok', critical: true, value: '16GB' },
          { id: 'cpu', label: 'CPU Cores', description: '≥2 required', status: 'ok', critical: true, value: '8' },
          { id: 'virt', label: 'Virtualization', description: 'KVM/VT-x required', status: 'ok', critical: true, value: 'Enabled' },
        ],
      },
      {
        title: 'System Tools',
        icon: 'wrench',
        requirements: [
          { id: 'docker', label: 'Docker', description: 'v20.10+', status: 'error', critical: true },
          { id: 'git', label: 'Git', description: 'Required', status: 'ok', critical: true, value: 'v2.40.0' },
          { id: 'ssh', label: 'SSH', description: 'Required', status: 'ok', critical: true },
          { id: 'curl', label: 'Curl', description: 'Required', status: 'ok', critical: false },
          { id: 'tar', label: 'Tar', description: 'Required', status: 'ok', critical: false },
        ],
      },
      {
        title: 'Docker State',
        icon: 'package',
        requirements: [
          { id: 'daemon', label: 'Daemon Running', description: 'Must be active', status: 'error', critical: true },
          { id: 'group', label: 'Docker Group', description: 'User must be in group', status: 'warning', critical: true },
        ],
      },
    ])
  }

  const allCriticalMet = categories.every((cat) =>
    cat.requirements.every((req) => !req.critical || req.status === 'ok'),
  )

  const handleInstall = async (reqId: string) => {
    setInstalling(reqId)
    try {
      const res = await window.dh.systemReadinessFix({ id: reqId })
      if (res.ok) {
        await runProbes()
      } else {
        alert(`Failed to install: ${res.error}`)
      }
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
                            >
                              {installing === req.id ? 'Installing...' : 'Install'}
                            </button>
                            <button className="readiness-btn readiness-btn-help" title="How to fix manually">
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
