import {
  WizardStateStoreSchema,
  type ComposeProfile,
  type SessionInfo,
  type WizardStateStore,
} from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { assertGitOk } from '../pages/gitContract'
import { humanizeGitError } from '../pages/gitError'
import { assertSshOk } from '../pages/sshContract'
import { humanizeSshError } from '../pages/sshError'

export function WizardFlow({ onComplete }: { onComplete: () => void }): ReactElement {
  const [step, setStep] = useState(0)
  const [hydrated, setHydrated] = useState(false)
  const exitingRef = useRef(false)
  const [isFlatpak, setIsFlatpak] = useState(false)
  const [dockerOk, setDockerOk] = useState<boolean | null>(null)
  
  const [gitName, setGitName] = useState('')
  const [gitEmail, setGitEmail] = useState('')
  const [target, setTarget] = useState<'sandbox' | 'host'>('sandbox')
  const [busy, setBusy] = useState(false)
  const [showAgainNextLaunch, setShowAgainNextLaunch] = useState(false)

  const [pubKey, setPubKey] = useState<string | null>(null)
  const [pickedProfile, setPickedProfile] = useState<ComposeProfile | null>(null)

  useEffect(() => {
    window.dh.sessionInfo().then((s: unknown) => setIsFlatpak((s as SessionInfo).kind === 'flatpak'))
    window.dh.dockerList().then((res: unknown) => setDockerOk((res as {ok: boolean}).ok))
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const raw = await window.dh.storeGet({ key: 'wizard_state' })
        const bag = raw as { ok?: boolean; data?: unknown }
        if (bag.ok) {
          const w = WizardStateStoreSchema.safeParse(bag.data)
          if (w.success && !w.data.completed) {
            if (typeof w.data.stepIndex === 'number') {
              setStep(w.data.stepIndex)
            }
            setGitName(w.data.gitName ?? '')
            setGitEmail(w.data.gitEmail ?? '')
            if (w.data.gitTarget) setTarget(w.data.gitTarget)
            if (w.data.pickedStarterProfile) setPickedProfile(w.data.pickedStarterProfile)
            if (w.data.sshPubKey) {
              setPubKey(w.data.sshPubKey)
            } else if (w.data.sshKeyGenerated) {
              const tgt = w.data.gitTarget ?? 'sandbox'
              try {
                const pub = await window.dh.sshGetPub({ target: tgt })
                if (pub.ok && pub.pub) setPubKey(pub.pub)
              } catch {
                /* ignore */
              }
            }
          }
        }
      } finally {
        setHydrated(true)
      }
    })()
  }, [])

  useEffect(() => {
    if (!hydrated || exitingRef.current) return
    void (async () => {
      try {
        const raw = await window.dh.storeGet({ key: 'wizard_state' })
        const bag = raw as { ok?: boolean; data?: unknown }
        const prev = bag.ok ? WizardStateStoreSchema.safeParse(bag.data) : null
        const prevShow = prev?.success ? (prev.data.showOnStartup ?? false) : false
        const showOnStartup = step >= 6 ? showAgainNextLaunch : prevShow

        const draft: WizardStateStore = {
          completed: false,
          showOnStartup,
          stepIndex: step,
          gitTarget: target,
        }
        const gn = gitName.trim()
        const ge = gitEmail.trim()
        if (gn) draft.gitName = gn
        if (ge) draft.gitEmail = ge
        if (pubKey) {
          draft.sshPubKey = pubKey
          draft.sshKeyGenerated = true
        } else if (prev?.success) {
          if (prev.data.sshPubKey) draft.sshPubKey = prev.data.sshPubKey
          if (prev.data.sshKeyGenerated) draft.sshKeyGenerated = prev.data.sshKeyGenerated
        }
        const starter = pickedProfile ?? (prev?.success ? prev.data.pickedStarterProfile : undefined)
        if (starter) draft.pickedStarterProfile = starter

        await window.dh.storeSet({
          key: 'wizard_state',
          data: WizardStateStoreSchema.parse(draft),
        })
      } catch {
        /* best effort */
      }
    })()
  }, [step, showAgainNextLaunch, hydrated, gitName, gitEmail, target, pubKey, pickedProfile])

  const handleComplete = async () => {
    exitingRef.current = true
    await window.dh.storeSet({
      key: 'wizard_state',
      data: { completed: true, showOnStartup: showAgainNextLaunch },
    })
    onComplete()
  }

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <>
            <h2>Welcome to HypeDevHome</h2>
            <p>Let's set up your ultimate developer dashboard. This wizard will verify your environment and set up basic credentials.</p>
            <div style={actions}>
              <button style={btnPrimary} onClick={() => setStep(1)}>Get Started →</button>
            </div>
          </>
        )
      case 1:
        return (
          <>
            <h2>Environment Check</h2>
            <p>You are running in <strong>{isFlatpak ? 'Flatpak (Isolated Sandbox)' : 'Native (Host)'}</strong> mode.</p>
            {isFlatpak && (
              <p style={{ color: 'var(--orange)' }}>
                Since you are in a Flatpak, some tools (like Docker and system-wide Git) require explicit permissions. 
                We provide a <strong>Dual Execution Strategy</strong>: you can choose to configure things isolated within the sandbox, or system-wide using the host.
              </p>
            )}
            <div style={actions}>
              <button style={btnPrimary} onClick={() => setStep(2)}>Next</button>
            </div>
          </>
        )
      case 2:
        return (
          <>
            <h2>Docker Connectivity</h2>
            {dockerOk === null ? <p>Checking Docker socket...</p> : dockerOk ? (
              <p style={{ color: 'var(--green)' }}>Docker daemon is reachable! 🎉</p>
            ) : (
              <div>
                <p style={{ color: 'var(--red)' }}>Docker daemon could not be reached.</p>
                <p style={{ color: 'var(--text-muted)' }}>
                  No terminal steps required here. Open Docker page and use <strong>Install / Setup</strong>,
                  then press <strong>Retry check</strong>.
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    style={btn}
                    onClick={() => {
                      setDockerOk(null)
                      void window.dh.dockerList().then((res: unknown) => setDockerOk((res as { ok: boolean }).ok))
                    }}
                  >
                    Retry check
                  </button>
                </div>
              </div>
            )}
            <div style={actions}>
              <button style={btnPrimary} onClick={() => setStep(3)}>Next</button>
            </div>
          </>
        )
      case 3:
        return (
          <>
            <h2>Git Setup</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input 
                style={input} placeholder="Your Name" value={gitName} 
                onChange={e => setGitName(e.target.value)} 
              />
              <input 
                style={input} placeholder="your.email@example.com" value={gitEmail} 
                onChange={e => setGitEmail(e.target.value)} 
              />
              {isFlatpak && (
                <div style={{ marginTop: 10 }}>
                  <label style={{ marginRight: 10 }}>Target:</label>
                  <select style={input} value={target} onChange={e => setTarget(e.target.value as 'sandbox'|'host')}>
                    <option value="sandbox">Sandbox (Beginner - Isolated)</option>
                    <option value="host">System-wide (Advanced - Host ~/.gitconfig)</option>
                  </select>
                </div>
              )}
            </div>
            <div style={actions}>
              <button style={btn} onClick={() => setStep(4)}>Skip</button>
              <button style={btnPrimary} disabled={!gitName || !gitEmail || busy} onClick={async () => {
                setBusy(true)
                try {
                  const res = await window.dh.gitConfigSet({ name: gitName, email: gitEmail, target })
                  assertGitOk(res, 'Failed to apply git identity.')
                  setStep(4)
                } catch (e) {
                  alert(humanizeGitError(e))
                }
                setBusy(false)
              }}>Apply &amp; Next</button>
            </div>
          </>
        )
      case 4:
        return (
          <>
            <h2>SSH Generation</h2>
            <p>Generate an Ed25519 SSH key to push to GitHub/GitLab.</p>
            {pubKey ? (
              <div>
                <p style={{ color: 'var(--green)' }}>Key generated! Add this to your GitHub account:</p>
                <pre style={pre}>{pubKey}</pre>
                <p><i>We will add direct GitHub API Sync in Phase 12!</i></p>
              </div>
            ) : (
              <p>Click below to generate a new keypair in <code>~/.ssh/id_ed25519</code></p>
            )}
            <div style={actions}>
              {!pubKey && <button style={btn} onClick={() => setStep(5)}>Skip</button>}
              {!pubKey ? (
                <button style={btnPrimary} disabled={busy} onClick={async () => {
                  setBusy(true)
                  try {
                    const genRes = await window.dh.sshGenerate({ target })
                    assertSshOk(genRes, 'Failed to generate SSH key.')
                    const pub = await window.dh.sshGetPub({ target })
                    setPubKey(pub.ok ? pub.pub : '')
                  } catch (e) {
                    alert(humanizeSshError(e))
                  }
                  setBusy(false)
                }}>Generate Key</button>
              ) : (
                <button style={btnPrimary} onClick={() => setStep(5)}>Next</button>
              )}
            </div>
          </>
        )
      case 5: {
        const presets: Array<{ id: ComposeProfile; label: string; icon: string }> = [
          { id: 'web-dev',     label: 'Web Development', icon: '🌐' },
          { id: 'data-science', label: 'Data Science',   icon: '📊' },
          { id: 'ai-ml',       label: 'AI / ML Local',   icon: '🤖' },
          { id: 'mobile',      label: 'Mobile App Dev',  icon: '📱' },
          { id: 'game-dev',    label: 'Game Dev',        icon: '🎮' },
          { id: 'infra',       label: 'Infra / K8s',     icon: '🏗' },
          { id: 'desktop-gui', label: 'Desktop Qt/GTK',  icon: '🖥' },
          { id: 'docs',        label: 'Docs / Writing',  icon: '📝' },
          { id: 'empty',       label: 'Empty Minimal',   icon: '⬜' },
        ]
        return (
          <>
            <h2>Pick a Starter Profile</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Sets your active environment. You can change this any time in Profiles.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPickedProfile(p.id)}
                  style={{
                    border: `1px solid ${pickedProfile === p.id ? 'var(--accent)' : 'var(--border)'}`,
                    background: pickedProfile === p.id ? 'rgba(124,77,255,0.12)' : 'transparent',
                    color: 'var(--text)',
                    borderRadius: 8,
                    padding: '10px 6px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    fontWeight: pickedProfile === p.id ? 700 : 400,
                  }}
                >
                  <span style={{ fontSize: 20 }}>{p.icon}</span>
                  {p.label}
                </button>
              ))}
            </div>
            <div style={actions}>
              <button style={btn} onClick={() => setStep(6)}>Skip</button>
              <button
                style={btnPrimary}
                disabled={busy}
                onClick={async () => {
                  if (pickedProfile) {
                    setBusy(true)
                    try {
                      await window.dh.storeSet({ key: 'active_profile', data: pickedProfile })
                    } catch { /* best effort */ }
                    setBusy(false)
                  }
                  setStep(6)
                }}
              >
                {pickedProfile ? 'Set Profile & Next' : 'Next'}
              </button>
            </div>
          </>
        )
      }
      case 6:
        return (
          <>
            <h2>All Set!</h2>
            <p>Your environment is ready. Click finish to head to your new Dashboard.</p>
            {pickedProfile && (
              <p style={{ fontSize: 13, color: 'var(--green)', marginTop: 8 }}>
                Active profile set to <strong>{pickedProfile}</strong>.
              </p>
            )}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 14,
                fontSize: 13,
                color: 'var(--text-muted)',
              }}
            >
              <input
                type="checkbox"
                checked={showAgainNextLaunch}
                onChange={(e) => setShowAgainNextLaunch(e.target.checked)}
              />
              Show this wizard again next launch
            </label>
            <div style={actions}>
              <button style={btnPrimary} onClick={handleComplete}>Finish &amp; Launch</button>
            </div>
          </>
        )
      default:
        return null
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg-base)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        width: 500, background: 'var(--bg-widget)', borderRadius: 12, padding: 30,
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)', border: '1px solid var(--border)'
      }}>
        {renderStep()}
        
        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 40 }}>
          {[0,1,2,3,4,5,6].map(i => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: 4,
              background: i === step ? 'var(--accent)' : 'var(--border)'
            }} />
          ))}
        </div>
      </div>
    </div>
  )
}

const actions = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 12,
  marginTop: 24,
}

const btn = {
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text)',
  borderRadius: 8,
  padding: '8px 16px',
  cursor: 'pointer',
}

const btnPrimary = {
  border: 'none',
  background: 'var(--accent)',
  color: '#fff',
  fontWeight: 600,
  borderRadius: 8,
  padding: '8px 16px',
  cursor: 'pointer',
}

const input = {
  border: '1px solid var(--border)',
  background: 'var(--bg-input)',
  color: 'var(--text)',
  borderRadius: 6,
  padding: '10px 12px',
  width: '100%',
  boxSizing: 'border-box' as const,
}

const pre = {
  background: '#0a0a0a',
  padding: 10,
  borderRadius: 6,
  border: '1px solid var(--border)',
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-all' as const,
  fontSize: 12,
}

