import type { SessionInfo } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'

export function WizardFlow({ onComplete }: { onComplete: () => void }): ReactElement {
  const [step, setStep] = useState(0)
  const [isFlatpak, setIsFlatpak] = useState(false)
  const [dockerOk, setDockerOk] = useState<boolean | null>(null)
  
  const [gitName, setGitName] = useState('')
  const [gitEmail, setGitEmail] = useState('')
  const [target, setTarget] = useState<'sandbox' | 'host'>('sandbox')
  const [busy, setBusy] = useState(false)
  const [showAgainNextLaunch, setShowAgainNextLaunch] = useState(false)

  const [pubKey, setPubKey] = useState<string | null>(null)

  useEffect(() => {
    window.dh.sessionInfo().then((s: unknown) => setIsFlatpak((s as SessionInfo).kind === 'flatpak'))
    window.dh.dockerList().then((res: unknown) => setDockerOk((res as {ok: boolean}).ok))
  }, [])

  const handleComplete = async () => {
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
                <p>If you are using Flatpak, you may need to grant socket access:</p>
                <pre style={pre}>flatpak override --user --talk-name=org.freedesktop.Flatpak io.github.karimodora.LinuxDevHome</pre>
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
                  await window.dh.gitConfigSet({ name: gitName, email: gitEmail, target })
                  setStep(4)
                } catch (e) {
                  alert(e)
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
                    await window.dh.sshGenerate({ target })
                    const pub = await window.dh.sshGetPub({ target })
                    setPubKey(pub?.pub ?? '')
                  } catch (e) {
                    alert(e)
                  }
                  setBusy(false)
                }}>Generate Key</button>
              ) : (
                <button style={btnPrimary} onClick={() => setStep(5)}>Next</button>
              )}
            </div>
          </>
        )
      case 5:
        return (
          <>
            <h2>All Set!</h2>
            <p>Your environment is ready. Click finish to head to your new Dashboard.</p>
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
          {[0,1,2,3,4,5].map(i => (
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
