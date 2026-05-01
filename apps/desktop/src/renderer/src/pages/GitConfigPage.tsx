import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { assertGitOk } from './gitContract'
import { humanizeGitError } from './gitError'

// ─── Types ───────────────────────────────────────────────────────────────────

type Section = 'overview' | 'identity' | 'security' | 'behavior' | 'inspector'
type SecurityLevel = 'secure' | 'attention' | 'risk' | 'unknown'
type ProfileLabel = 'Personal' | 'Work' | 'Open Source' | ''

type ConfigRow = { key: string; value: string }

// ─── Scoring ─────────────────────────────────────────────────────────────────

function identityScore(cfg: Map<string, string>): number {
  let s = 0
  if (cfg.get('user.name')?.trim()) s += 40
  if (cfg.get('user.email')?.trim()) s += 40
  if (cfg.get('init.defaultbranch')?.trim()) s += 20
  return s
}

function securityScore(cfg: Map<string, string>): number {
  let s = 0
  const helper = cfg.get('credential.helper') ?? ''
  if (/libsecret|manager|osxkeychain|gnome|wincred|secretservice/.test(helper)) s += 35
  else if (/cache/.test(helper)) s += 15
  else if (/store/.test(helper)) s += 5
  if (cfg.get('commit.gpgsign') === 'true') s += 35
  if (cfg.get('http.sslverify') !== 'false') s += 30
  return Math.min(s, 100)
}

function performanceScore(cfg: Map<string, string>): number {
  let s = 40
  if (cfg.get('core.preloadindex') === 'true') s += 25
  if (cfg.get('core.fscache') === 'true') s += 20
  if (cfg.get('pull.rebase') === 'true') s += 15
  return Math.min(s, 100)
}

function compatibilityScore(cfg: Map<string, string>): number {
  let s = 40
  if (cfg.get('fetch.prune') === 'true') s += 25
  const autocrlf = cfg.get('core.autocrlf')
  if (autocrlf === 'input') s += 25
  else if (autocrlf === 'false') s += 10
  if (cfg.get('init.defaultbranch') === 'main') s += 10
  return Math.min(s, 100)
}

function totalScore(cfg: Map<string, string>): number {
  return Math.round((identityScore(cfg) + securityScore(cfg) + performanceScore(cfg) + compatibilityScore(cfg)) / 4)
}

// ─── Config helpers ───────────────────────────────────────────────────────────

const SENSITIVE_KEYS = new Set([
  'user.password', 'user.signingkey', 'credential.helper',
  'http.proxy', 'https.proxy', 'core.askpass', 'http.cookiefile', 'http.extraheader',
])

function isSensitive(key: string): boolean {
  return SENSITIVE_KEYS.has(key) || /password|secret|token|key$/i.test(key)
}

function maskValue(key: string, value: string, revealed: Set<string>): string {
  if (!isSensitive(key) || revealed.has(key)) return value
  return value.length <= 4 ? '●●●●' : value.slice(0, 2) + '●●●●' + value.slice(-2)
}

const CONFIG_CATEGORIES: Record<string, string> = {
  'user.': 'identity', 'author.': 'identity', 'committer.': 'identity',
  'credential.': 'security', 'commit.gpg': 'security', 'gpg.': 'security',
  'http.ssl': 'security', 'http.cookie': 'security', 'core.askpass': 'security',
  'core.preload': 'performance', 'core.fscache': 'performance', 'pack.': 'performance', 'gc.': 'performance',
}

function categorize(key: string): 'identity' | 'security' | 'performance' | 'advanced' {
  for (const [prefix, cat] of Object.entries(CONFIG_CATEGORIES)) {
    if (key.startsWith(prefix)) return cat as 'identity' | 'security' | 'performance'
  }
  return 'advanced'
}

const RISK_KEYS: Record<string, string> = {
  'http.sslverify': 'Disabling SSL verification exposes you to MITM attacks.',
  'http.cookiefile': 'Cookie file may contain session tokens — keep it private.',
  'credential.helper': 'Using plaintext credential storage (store) is insecure.',
}

function riskForRow(r: ConfigRow): string | null {
  if (r.key === 'http.sslverify' && r.value === 'false') return RISK_KEYS['http.sslverify']
  if (r.key === 'http.cookiefile') return RISK_KEYS['http.cookiefile']
  if (r.key === 'credential.helper' && /store/.test(r.value)) return RISK_KEYS['credential.helper']
  return null
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateIdentity(name: string, email: string, branch: string): string[] {
  const msgs: string[] = []
  if (!name.trim()) msgs.push('Full name is required.')
  if (!email.trim()) msgs.push('Email is required.')
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) msgs.push('Email format invalid (expect user@domain.tld).')
  if (branch.trim()) {
    if (/\s/.test(branch)) msgs.push('Branch name cannot contain spaces.')
    if (branch.includes('..') || /[~^:?*[\]\\]/.test(branch)) msgs.push('Branch name contains invalid characters.')
  }
  return msgs
}

// ─── Presets ──────────────────────────────────────────────────────────────────

type Preset = {
  label: string
  description: string
  keys: Record<string, string | null>
}

const PRESETS: Preset[] = [
  {
    label: 'Beginner Safe',
    description: 'Sensible defaults. Safe credential storage, main branch, nano editor.',
    keys: {
      'init.defaultbranch': 'main',
      'pull.rebase': 'false',
      'fetch.prune': 'true',
      'core.autocrlf': 'input',
      'core.preloadindex': 'true',
    },
  },
  {
    label: 'Developer Pro',
    description: 'Rebase workflow, auto prune, performance cache enabled.',
    keys: {
      'init.defaultbranch': 'main',
      'pull.rebase': 'true',
      'fetch.prune': 'true',
      'fetch.prunetags': 'true',
      'branch.autosetuprebase': 'always',
      'core.preloadindex': 'true',
      'core.fscache': 'true',
      'core.autocrlf': 'input',
    },
  },
  {
    label: 'Open Source Ready',
    description: 'Clean merge history, compatible line endings, prune on fetch.',
    keys: {
      'init.defaultbranch': 'main',
      'pull.rebase': 'false',
      'merge.ff': 'false',
      'fetch.prune': 'true',
      'core.autocrlf': 'input',
      'core.preloadindex': 'true',
    },
  },
  {
    label: 'High Security',
    description: 'GPG signing required, SSL verification enforced.',
    keys: {
      'commit.gpgsign': 'true',
      'http.sslverify': 'true',
      'fetch.prune': 'true',
      'core.preloadindex': 'true',
    },
  },
  {
    label: 'Corporate Policy',
    description: 'Merge commits, signed commits, strict SSL, prune enabled.',
    keys: {
      'pull.rebase': 'false',
      'merge.ff': 'false',
      'commit.gpgsign': 'true',
      'http.sslverify': 'true',
      'fetch.prune': 'true',
      'branch.autosetuprebase': 'never',
    },
  },
]

// ─── Suggestions ──────────────────────────────────────────────────────────────

type Suggestion = { text: string; priority: 'high' | 'medium'; action?: () => void }

function buildSuggestions(cfg: Map<string, string>, onSetKey: (k: string, v?: string) => Promise<void>): Suggestion[] {
  const out: Suggestion[] = []
  if (!cfg.get('user.name')?.trim()) out.push({ priority: 'high', text: 'Set your full name — required for commits to be attributed correctly.' })
  if (!cfg.get('user.email')?.trim()) out.push({ priority: 'high', text: 'Set your email — required for commit authorship.' })
  const helper = cfg.get('credential.helper') ?? ''
  if (!helper) out.push({ priority: 'high', text: 'No credential helper set. Git will prompt for password on every push.', action: () => void onSetKey('credential.helper', 'store') })
  else if (/store/.test(helper)) out.push({ priority: 'medium', text: 'credential.helper=store saves passwords as plaintext. Consider switching to libsecret.' })
  if (cfg.get('commit.gpgsign') !== 'true') out.push({ priority: 'medium', text: 'Commit signing is off. Enable GPG signing for verified commits.' })
  if (!cfg.get('fetch.prune')) out.push({ priority: 'medium', text: 'Enable fetch.prune to auto-delete stale remote-tracking branches.', action: () => void onSetKey('fetch.prune', 'true') })
  if (!cfg.get('init.defaultbranch')) out.push({ priority: 'medium', text: 'Set init.defaultBranch to "main" so new repos use a consistent default branch.', action: () => void onSetKey('init.defaultbranch', 'main') })
  if (!cfg.get('core.preloadindex')) out.push({ priority: 'medium', text: 'Enable core.preloadindex for faster git status on large repos.', action: () => void onSetKey('core.preloadindex', 'true') })
  return out
}

// ─── Score Card ───────────────────────────────────────────────────────────────

function scoreColor(s: number): string {
  if (s >= 80) return '#22c55e'
  if (s >= 50) return '#f59e0b'
  return '#ef4444'
}

function ScoreCard({ title, score, subtitle }: { title: string; score: number; subtitle: string }): ReactElement {
  const color = scoreColor(score)
  return (
    <div className="hp-card" style={{ flex: '1 1 200px', textAlign: 'center', padding: '20px 16px' }}>
      <div style={{ fontSize: 36, fontWeight: 700, color, letterSpacing: -1 }}>{score}</div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, margin: '8px 0' }}>
        <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{title}</div>
      <div className="hp-muted" style={{ fontSize: 11 }}>{subtitle}</div>
    </div>
  )
}

// ─── Security Row ─────────────────────────────────────────────────────────────

function SecurityRow({ label, level, description, action, actionLabel }: {
  label: string
  level: SecurityLevel
  description: string
  action?: () => void
  actionLabel?: string
}): ReactElement {
  const chip: Record<SecurityLevel, { bg: string; color: string; text: string }> = {
    secure: { bg: '#dcfce7', color: '#166534', text: 'SECURE' },
    attention: { bg: '#fef9c3', color: '#854d0e', text: 'ATTENTION' },
    risk: { bg: '#fee2e2', color: '#991b1b', text: 'RISK' },
    unknown: { bg: 'var(--bg-subtle)', color: 'var(--text-muted)', text: 'UNKNOWN' },
  }
  const c = chip[level]
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: c.bg, color: c.color, whiteSpace: 'nowrap', marginTop: 1 }}>
        {c.text}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
        <div className="hp-muted" style={{ fontSize: 12, marginTop: 2 }}>{description}</div>
      </div>
      {action && actionLabel && (
        <button type="button" className="hp-btn" style={{ fontSize: 11, padding: '3px 10px' }} onClick={action}>
          {actionLabel}
        </button>
      )}
    </div>
  )
}

// ─── Behavior Toggle ──────────────────────────────────────────────────────────

function BehaviorToggle({ label, description, checked, onChange, disabled }: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled: boolean
}): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
        <div className="hp-muted" style={{ fontSize: 12, marginTop: 2 }}>{description}</div>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{
          flexShrink: 0,
          width: 44,
          height: 24,
          borderRadius: 12,
          border: 'none',
          cursor: disabled ? 'default' : 'pointer',
          background: checked ? '#3b82f6' : 'var(--border)',
          position: 'relative',
          transition: 'background 0.2s',
        }}
      >
        <span style={{
          position: 'absolute',
          top: 3,
          left: checked ? 23 : 3,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        }} />
      </button>
    </div>
  )
}

// ─── Overview Section ─────────────────────────────────────────────────────────

function OverviewSection({ cfg, onSection, onSetKey }: {
  cfg: Map<string, string>
  onSection: (s: Section) => void
  onSetKey: (k: string, v?: string) => Promise<void>
}): ReactElement {
  const total = totalScore(cfg)
  const suggestions = buildSuggestions(cfg, onSetKey)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 6 }}>
          <div style={{ fontSize: 48, fontWeight: 800, color: scoreColor(total), letterSpacing: -2 }}>{total}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Configuration Score</div>
            <div className="hp-muted" style={{ fontSize: 13 }}>
              {total >= 80 ? 'Your Git environment is well configured.' : total >= 50 ? 'Some improvements recommended.' : 'Several issues need attention.'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <ScoreCard title="Identity" score={identityScore(cfg)} subtitle="Name, email, branch" />
          <ScoreCard title="Security" score={securityScore(cfg)} subtitle="Credentials, signing, SSL" />
          <ScoreCard title="Performance" score={performanceScore(cfg)} subtitle="Cache, index preload" />
          <ScoreCard title="Compatibility" score={compatibilityScore(cfg)} subtitle="Line endings, prune" />
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="hp-card">
          <div className="hp-section-title">Smart Suggestions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {suggestions.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : undefined }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginTop: 2,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: s.priority === 'high' ? '#fee2e2' : '#fef9c3',
                    color: s.priority === 'high' ? '#991b1b' : '#854d0e',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.priority === 'high' ? 'High' : 'Medium'}
                </span>
                <div style={{ flex: 1, fontSize: 13 }}>{s.text}</div>
                {s.action && (
                  <button type="button" className="hp-btn" style={{ fontSize: 11, padding: '3px 10px' }} onClick={s.action}>
                    Fix
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="hp-card">
        <div className="hp-section-title">Quick Actions</div>
        <div className="hp-row-wrap" style={{ gap: 10 }}>
          <button type="button" className="hp-btn" onClick={() => onSection('identity')}>Edit Identity</button>
          <button type="button" className="hp-btn" onClick={() => onSection('security')}>Review Security</button>
          <button type="button" className="hp-btn" onClick={() => onSection('behavior')}>Behavior Settings</button>
          <button type="button" className="hp-btn" onClick={() => onSection('inspector')}>Config Inspector</button>
        </div>
      </div>
    </div>
  )
}

// ─── Identity Section ─────────────────────────────────────────────────────────

function IdentitySection({ cfg, busy, onSave }: {
  cfg: Map<string, string>
  busy: boolean
  onSave: (fields: { name: string; email: string; branch: string; editor: string }) => Promise<void>
}): ReactElement {
  const [name, setName] = useState(cfg.get('user.name') ?? '')
  const [email, setEmail] = useState(cfg.get('user.email') ?? '')
  const [branch, setBranch] = useState(cfg.get('init.defaultbranch') ?? '')
  const [editor, setEditor] = useState(cfg.get('core.editor') ?? '')
  const [profileLabel, setProfileLabel] = useState<ProfileLabel>('')
  const [errors, setErrors] = useState<string[]>([])
  const [status, setStatus] = useState('')

  // Sync when cfg changes (after reload)
  useEffect(() => {
    setName(cfg.get('user.name') ?? '')
    setEmail(cfg.get('user.email') ?? '')
    setBranch(cfg.get('init.defaultbranch') ?? '')
    setEditor(cfg.get('core.editor') ?? '')
  }, [cfg])

  function handleValidateOnly(): void {
    const errs = validateIdentity(name, email, branch)
    setErrors(errs)
    if (errs.length) {
      setStatus('')
    } else {
      setStatus('Validation passed. You can apply to write global Git config.')
    }
  }

  async function handleApply(): Promise<void> {
    const errs = validateIdentity(name, email, branch)
    if (errs.length) { setErrors(errs); setStatus(''); return }
    setErrors([])
    setStatus('')
    await onSave({ name, email, branch, editor })
    setStatus('Identity saved successfully.')
  }

  const EDITORS = [
    { label: 'VS Code', value: 'code --wait' },
    { label: 'Vim', value: 'vim' },
    { label: 'Nano', value: 'nano' },
    { label: 'Emacs', value: 'emacs' },
    { label: 'Neovim', value: 'nvim' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="hp-card">
        <div className="hp-section-title" style={{ marginBottom: 16 }}>Profile Label</div>
        <div className="hp-row-wrap" style={{ gap: 8 }}>
          {(['', 'Personal', 'Work', 'Open Source'] as ProfileLabel[]).map((l) => (
            <button
              key={l || 'none'}
              type="button"
              className={`hp-btn${profileLabel === l ? ' hp-btn-primary' : ''}`}
              onClick={() => setProfileLabel(l)}
            >
              {l || 'None'}
            </button>
          ))}
        </div>
      </div>

      <div className="hp-card">
        <div className="hp-section-title" style={{ marginBottom: 16 }}>User Identity</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Full Name</label>
            <input className="hp-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" disabled={busy} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Email Address</label>
            <input className="hp-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" disabled={busy} type="email" />
          </div>
        </div>
      </div>

      <div className="hp-card">
        <div className="hp-section-title" style={{ marginBottom: 16 }}>Repository Defaults</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Default Branch</label>
            <div className="hp-row-wrap" style={{ gap: 6, marginBottom: 6 }}>
              {['main', 'master', 'develop'].map((b) => (
                <button key={b} type="button" className={`hp-btn${branch === b ? ' hp-btn-primary' : ''}`} onClick={() => setBranch(b)} disabled={busy}>
                  {b}
                </button>
              ))}
            </div>
            <input className="hp-input" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" disabled={busy} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Default Editor</label>
            <div className="hp-row-wrap" style={{ gap: 6, marginBottom: 6 }}>
              {EDITORS.map((e) => (
                <button key={e.value} type="button" className={`hp-btn${editor === e.value ? ' hp-btn-primary' : ''}`} onClick={() => setEditor(e.value)} disabled={busy}>
                  {e.label}
                </button>
              ))}
            </div>
            <input className="hp-input" value={editor} onChange={(e) => setEditor(e.target.value)} placeholder="code --wait" disabled={busy} />
          </div>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="hp-status-alert warning">
          <span style={{ fontWeight: 700 }}>Warning</span>
          <ul style={{ margin: 0, paddingLeft: 16 }}>{errors.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      {status && !errors.length && <div className="hp-status-alert success"><span style={{ fontWeight: 700 }}>OK</span><span>{status}</span></div>}

      <div className="hp-row-wrap" style={{ gap: 10 }}>
        <button type="button" className="hp-btn" onClick={handleValidateOnly} disabled={busy}>
          Validate
        </button>
        <button type="button" className="hp-btn hp-btn-primary" onClick={() => void handleApply()} disabled={busy}>
          Apply
        </button>
      </div>
    </div>
  )
}

// ─── Security Section ─────────────────────────────────────────────────────────

function SecuritySection({ cfg, busy, onSetKey }: {
  cfg: Map<string, string>
  busy: boolean
  onSetKey: (k: string, v?: string) => Promise<void>
}): ReactElement {
  const helper = cfg.get('credential.helper') ?? ''
  const gpgSign = cfg.get('commit.gpgsign') === 'true'
  const sslVerify = cfg.get('http.sslverify') !== 'false'
  const hasCookieFile = !!cfg.get('http.cookiefile')
  const signingKey = cfg.get('user.signingkey') ?? ''

  function credLevel(): SecurityLevel {
    if (!helper) return 'risk'
    if (/libsecret|manager|osxkeychain|gnome|wincred|secretservice/.test(helper)) return 'secure'
    if (/cache/.test(helper)) return 'attention'
    return 'risk'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="hp-card">
        <div className="hp-section-title" style={{ marginBottom: 4 }}>Security Overview</div>
        <div className="hp-muted" style={{ fontSize: 12, marginBottom: 16 }}>
          Review your Git security posture. Green = secure, Yellow = attention needed, Red = risk.
        </div>
        <SecurityRow
          label="Credential Storage"
          level={credLevel()}
          description={helper ? `Using: ${helper}` : 'No credential helper configured — Git will prompt for password every time.'}
          action={!helper ? () => void onSetKey('credential.helper', 'store') : undefined}
          actionLabel="Set basic store"
        />
        <SecurityRow
          label="Commit Signing"
          level={gpgSign ? 'secure' : 'attention'}
          description={gpgSign ? `GPG signing enabled${signingKey ? ` (key: ${signingKey.slice(0, 12)}…)` : ''}.` : 'Commits are not cryptographically signed. Others cannot verify authorship.'}
          action={!gpgSign ? () => void onSetKey('commit.gpgsign', 'true') : undefined}
          actionLabel="Enable signing"
        />
        <SecurityRow
          label="SSL Verification"
          level={sslVerify ? 'secure' : 'risk'}
          description={sslVerify ? 'SSL certificate verification is enabled (default).' : 'SSL verification is disabled — vulnerable to man-in-the-middle attacks.'}
          action={!sslVerify ? () => void onSetKey('http.sslverify', 'true') : undefined}
          actionLabel="Re-enable SSL"
        />
        <SecurityRow
          label="Cookie File"
          level={hasCookieFile ? 'attention' : 'secure'}
          description={hasCookieFile ? `http.cookiefile is set — make sure this file has restricted permissions (chmod 600).` : 'No cookie file configured.'}
        />
        <div style={{ borderBottom: 'none' }}>
          <SecurityRow
            label="Sensitive Config"
            level={isSensitiveExposed(cfg) ? 'attention' : 'secure'}
            description={isSensitiveExposed(cfg) ? 'Some sensitive keys (tokens, keys) are stored in global config. Review Config Inspector.' : 'No obviously sensitive values detected in global config.'}
          />
        </div>
      </div>

      <div className="hp-card">
        <div className="hp-section-title" style={{ marginBottom: 12 }}>Privacy Review</div>
        <div className="hp-row-wrap" style={{ gap: 10 }}>
          <button type="button" className="hp-btn" disabled={busy} onClick={() => void onSetKey('commit.gpgsign', gpgSign ? 'false' : 'true')}>
            {gpgSign ? 'Disable Commit Signing' : 'Enable Commit Signing'}
          </button>
          <button type="button" className="hp-btn" disabled={busy} onClick={() => void onSetKey('http.sslverify', sslVerify ? 'false' : 'true')}>
            {sslVerify ? 'Disable SSL Verify (unsafe)' : 'Restore SSL Verify'}
          </button>
        </div>
      </div>
    </div>
  )
}

function isSensitiveExposed(cfg: Map<string, string>): boolean {
  for (const key of cfg.keys()) {
    if (/token|password|secret/.test(key)) return true
  }
  return false
}

// ─── Behavior Section ─────────────────────────────────────────────────────────

function BehaviorSection({ cfg, busy, onSetKey, onApplyPreset }: {
  cfg: Map<string, string>
  busy: boolean
  onSetKey: (k: string, v?: string) => Promise<void>
  onApplyPreset: (p: Preset) => Promise<void>
}): ReactElement {
  const [presetApplying, setPresetApplying] = useState('')

  async function applyPreset(p: Preset): Promise<void> {
    setPresetApplying(p.label)
    await onApplyPreset(p)
    setPresetApplying('')
  }

  const bool = (k: string) => cfg.get(k) === 'true'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="hp-card">
        <div className="hp-section-title" style={{ marginBottom: 4 }}>Preset Templates</div>
        <div className="hp-muted" style={{ fontSize: 12, marginBottom: 16 }}>
          Apply a curated set of settings in one click. You can fine-tune individual toggles below afterwards.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {PRESETS.map((p) => (
            <div key={p.label} className="hp-card" style={{ flex: '1 1 180px', padding: '12px 14px', cursor: 'pointer' }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{p.label}</div>
              <div className="hp-muted" style={{ fontSize: 11, marginBottom: 10 }}>{p.description}</div>
              <button
                type="button"
                className="hp-btn hp-btn-primary"
                style={{ width: '100%', fontSize: 12 }}
                disabled={busy || presetApplying !== ''}
                onClick={() => void applyPreset(p)}
              >
                {presetApplying === p.label ? 'Applying…' : 'Apply'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="hp-card">
        <div className="hp-section-title" style={{ marginBottom: 4 }}>Behavior Settings</div>
        <div className="hp-muted" style={{ fontSize: 12, marginBottom: 16 }}>Toggle individual Git behavior settings.</div>
        <BehaviorToggle
          label="Rebase on Pull"
          description="pull.rebase=true — rewrites local commits on top of remote instead of creating a merge commit."
          checked={bool('pull.rebase')}
          onChange={(v) => void onSetKey('pull.rebase', String(v))}
          disabled={busy}
        />
        <BehaviorToggle
          label="Auto Prune Stale Branches"
          description="fetch.prune=true — deletes local remote-tracking branches that no longer exist on the remote."
          checked={bool('fetch.prune')}
          onChange={(v) => void onSetKey('fetch.prune', String(v))}
          disabled={busy}
        />
        <BehaviorToggle
          label="Auto Prune Tags"
          description="fetch.prunetags=true — also removes stale remote tags during fetch."
          checked={bool('fetch.prunetags')}
          onChange={(v) => void onSetKey('fetch.prunetags', String(v))}
          disabled={busy}
        />
        <BehaviorToggle
          label="Performance Index Preload"
          description="core.preloadindex=true — parallelizes stat calls during git status on large repos."
          checked={bool('core.preloadindex')}
          onChange={(v) => void onSetKey('core.preloadindex', String(v))}
          disabled={busy}
        />
        <BehaviorToggle
          label="File System Cache"
          description="core.fscache=true — caches filesystem data for improved performance (Windows primarily, harmless elsewhere)."
          checked={bool('core.fscache')}
          onChange={(v) => void onSetKey('core.fscache', String(v))}
          disabled={busy}
        />
        <BehaviorToggle
          label="Auto Stash on Rebase"
          description="rebase.autostash=true — stash working directory changes before rebase, pop them after."
          checked={bool('rebase.autostash')}
          onChange={(v) => void onSetKey('rebase.autostash', String(v))}
          disabled={busy}
        />
        <BehaviorToggle
          label="Commit Signing (GPG)"
          description="commit.gpgsign=true — all commits will be cryptographically signed with your GPG key."
          checked={bool('commit.gpgsign')}
          onChange={(v) => void onSetKey('commit.gpgsign', String(v))}
          disabled={busy}
        />
        <div>
          <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Line Ending Mode</div>
            <div className="hp-muted" style={{ fontSize: 12, marginBottom: 8 }}>
              core.autocrlf — normalizes line endings on checkout/commit. On Linux, Input is usually best.
            </div>
            <div className="hp-row-wrap" style={{ gap: 8 }}>
              {[['input', 'Input'], ['false', 'Off']].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  className={`hp-btn${cfg.get('core.autocrlf') === v ? ' hp-btn-primary' : ''}`}
                  onClick={() => void onSetKey('core.autocrlf', v)}
                  disabled={busy}
                >
                  {l}
                </button>
              ))}
            </div>
            {cfg.get('core.autocrlf') === 'true' && (
              <div className="hp-muted" style={{ fontSize: 11, marginTop: 8 }}>
                Your config has <span className="mono">core.autocrlf=true</span> (legacy Windows-oriented). Choose Input or Off above to change it, or edit the raw value in Config Inspector.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Inspector Section ────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = ['all', 'identity', 'security', 'performance', 'advanced'] as const
type CategoryFilter = typeof CATEGORY_OPTIONS[number]

function InspectorSection({ rows, loading }: { rows: ConfigRow[]; loading: boolean }): ReactElement {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [sortKey, setSortKey] = useState<'key' | 'value'>('key')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  /** When false, sensitive values are masked unless individually revealed. */
  const [showSensitiveValues, setShowSensitiveValues] = useState(false)

  function toggleReveal(key: string): void {
    setRevealed((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const filtered = rows
    .filter((r) => {
      if (category !== 'all' && categorize(r.key) !== category) return false
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return r.key.toLowerCase().includes(q) || r.value.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const va = a[sortKey].toLowerCase(), vb = b[sortKey].toLowerCase()
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })

  function handleSort(k: 'key' | 'value'): void {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }

  const CATEGORY_LABELS: Record<CategoryFilter, string> = {
    all: 'All', identity: 'Identity', security: 'Security', performance: 'Performance', advanced: 'Advanced',
  }

  function cellValue(r: ConfigRow): string {
    if (showSensitiveValues && isSensitive(r.key)) return r.value
    return maskValue(r.key, r.value, revealed)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="hp-card">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <input
            className="hp-input"
            style={{ flex: '1 1 200px' }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search keys or values…"
            disabled={loading}
          />
          <div className="hp-row-wrap" style={{ gap: 6 }}>
            {CATEGORY_OPTIONS.map((c) => (
              <button key={c} type="button" className={`hp-btn${category === c ? ' hp-btn-primary' : ''}`} style={{ fontSize: 12 }} onClick={() => setCategory(c)}>
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 12, cursor: loading ? 'default' : 'pointer' }}>
          <input
            type="checkbox"
            checked={showSensitiveValues}
            onChange={(e) => {
              setShowSensitiveValues(e.target.checked)
              if (e.target.checked) setRevealed(new Set())
            }}
            disabled={loading}
          />
          <span>Show sensitive values (tokens, helpers, signing keys)</span>
        </label>
        <div className="hp-muted" style={{ fontSize: 11, marginBottom: 8 }}>
          {filtered.length} of {rows.length} entries
        </div>
        {filtered.length === 0 ? (
          <div className="hp-muted" style={{ fontSize: 13 }}>
            {rows.length === 0 ? 'No global config entries found.' : 'No entries match your filter.'}
          </div>
        ) : (
          <div className="hp-table-wrap">
            <table className="hp-table">
              <thead>
                <tr className="hp-table-head">
                  <th className="hp-table-sort" style={{ width: '30%' }} onClick={() => handleSort('key')}>
                    Key {sortKey === 'key' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="hp-table-sort" style={{ width: '40%' }} onClick={() => handleSort('value')}>
                    Value {sortKey === 'value' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ width: '15%', padding: '8px 6px' }}>Category</th>
                  <th style={{ width: '15%', padding: '8px 6px' }}>Risk</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const risk = riskForRow(r)
                  const sensitive = isSensitive(r.key)
                  const cat = categorize(r.key)
                  const catColors: Record<string, string> = {
                    identity: '#3b82f6', security: '#ef4444', performance: '#22c55e', advanced: '#6b7280',
                  }
                  return (
                    <tr key={r.key} className="hp-table-row" style={{ background: risk ? 'rgba(239,68,68,0.04)' : undefined }}>
                      <td className="mono" style={{ padding: '9px 6px', fontSize: 12 }}>{r.key}</td>
                      <td className="mono" style={{ padding: '9px 6px', fontSize: 12 }}>
                        {cellValue(r)}
                        {sensitive && !showSensitiveValues && (
                          <button type="button" className="hp-btn" style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px' }} onClick={() => toggleReveal(r.key)}>
                            {revealed.has(r.key) ? 'Hide' : 'Show'}
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '9px 6px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: catColors[cat] + '22', color: catColors[cat] }}>
                          {cat}
                        </span>
                      </td>
                      <td style={{ padding: '9px 6px' }}>
                        {risk ? (
                          <span title={risk} style={{ fontSize: 11, color: '#ef4444', cursor: 'help' }}>Risk</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'identity', label: 'Identity' },
  { id: 'security', label: 'Security' },
  { id: 'behavior', label: 'Behavior' },
  { id: 'inspector', label: 'Config Inspector' },
]

export function GitConfigPage(): ReactElement {
  const [section, setSection] = useState<Section>('overview')
  const [rows, setRows] = useState<ConfigRow[]>([])
  const [cfg, setCfg] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  function showToast(msg: string, ok = true): void {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.dh.gitConfigList({ target: 'host' })
      assertGitOk(res, 'Failed to load config.')
      const nextRows = res.rows ?? []
      setRows(nextRows)
      setCfg(new Map(nextRows.map((r) => [r.key.toLowerCase(), r.value])))
    } catch (e) {
      showToast(humanizeGitError(e), false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadConfig() }, [loadConfig])

  async function handleSetKey(key: string, value?: string): Promise<void> {
    setBusy(true)
    try {
      const res = await window.dh.gitConfigSetKey({ key, value })
      if (!res.ok) throw new Error(res.error ?? 'Set key failed.')
      await loadConfig()
      showToast(`${key} updated.`)
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), false)
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveIdentity(fields: { name: string; email: string; branch: string; editor: string }): Promise<void> {
    setBusy(true)
    try {
      const res = await window.dh.gitConfigSet({
        name: fields.name.trim(),
        email: fields.email.trim(),
        defaultBranch: fields.branch.trim() || undefined,
        defaultEditor: fields.editor.trim() || undefined,
        target: 'host',
      })
      assertGitOk(res, 'Failed to save identity.')
      await loadConfig()
      showToast('Identity saved successfully.')
    } catch (e) {
      showToast(humanizeGitError(e), false)
    } finally {
      setBusy(false)
    }
  }

  async function handleApplyPreset(preset: Preset): Promise<void> {
    setBusy(true)
    try {
      for (const [key, value] of Object.entries(preset.keys)) {
        const res = await window.dh.gitConfigSetKey({ key, value: value ?? undefined })
        if (!res.ok) throw new Error(res.error ?? `Failed to set ${key}`)
      }
      await loadConfig()
      showToast(`Preset "${preset.label}" applied.`)
    } catch (e) {
      showToast(String(e instanceof Error ? e.message : e), false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Sidebar */}
      <nav style={{
        width: 200,
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        paddingTop: 24,
        paddingBottom: 16,
        overflowY: 'auto',
      }}>
        <div style={{ padding: '0 16px 16px', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Git Config</div>
          <div className="hp-muted" style={{ fontSize: 11 }}>Environment Manager</div>
        </div>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '9px 16px',
              border: 'none',
              background: section === item.id ? 'var(--bg-subtle)' : 'transparent',
              color: section === item.id ? 'var(--accent)' : 'var(--text)',
              fontWeight: section === item.id ? 600 : 400,
              fontSize: 13,
              cursor: 'pointer',
              textAlign: 'left',
              borderLeft: section === item.id ? '3px solid var(--accent)' : '3px solid transparent',
            }}
          >
            {item.label}
          </button>
        ))}
        <div style={{ padding: '16px 16px 0', borderTop: '1px solid var(--border)', marginTop: 8 }}>
          <button type="button" className="hp-btn" style={{ width: '100%', fontSize: 12 }} onClick={() => void loadConfig()} disabled={loading || busy}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </nav>

      {/* Content */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', position: 'relative' }}>
        {toast && (
          <div style={{
            position: 'fixed',
            top: 20,
            right: 24,
            zIndex: 9999,
            padding: '10px 18px',
            borderRadius: 8,
            background: toast.ok ? '#166534' : '#991b1b',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            pointerEvents: 'none',
          }}>
            {toast.ok ? 'OK: ' : 'Error: '}{toast.msg}
          </div>
        )}

        {section === 'overview' && (
          <OverviewSection cfg={cfg} onSection={setSection} onSetKey={handleSetKey} />
        )}
        {section === 'identity' && (
          <IdentitySection cfg={cfg} busy={busy} onSave={handleSaveIdentity} />
        )}
        {section === 'security' && (
          <SecuritySection cfg={cfg} busy={busy} onSetKey={handleSetKey} />
        )}
        {section === 'behavior' && (
          <BehaviorSection cfg={cfg} busy={busy} onSetKey={handleSetKey} onApplyPreset={handleApplyPreset} />
        )}
        {section === 'inspector' && (
          <InspectorSection rows={rows} loading={loading} />
        )}
      </main>
    </div>
  )
}
