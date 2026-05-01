import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { assertGitOk } from './gitContract'
import { humanizeGitError } from './gitError'

// ─── Types ───────────────────────────────────────────────────────────────────

type Section = 'overview' | 'identity' | 'security' | 'behavior' | 'inspector' | 'diagnostics' | 'backups'
type SecurityLevel = 'secure' | 'attention' | 'risk' | 'unknown'
type ProfileLabel = 'Personal' | 'Work' | 'Open Source' | 'Default'

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

const GLASS_CARD = {
  background: 'rgba(30, 30, 30, 0.4)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255, 255, 255, 0.05)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
} as const


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
    <div className="hp-card" style={{ 
      flex: '1 1 200px', 
      textAlign: 'center', 
      padding: '24px 16px',
      background: 'rgba(30, 30, 30, 0.4)',
      backdropFilter: 'blur(8px)',
      border: `1px solid rgba(255, 255, 255, 0.05)`,
      transition: 'transform 0.2s, border-color 0.2s',
      position: 'relative',
      overflow: 'hidden'
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-4px)'
      e.currentTarget.style.borderColor = `${color}44`
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'translateY(0)'
      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)'
    }}>
      <div style={{ 
        position: 'absolute', 
        top: -20, right: -20, 
        width: 60, height: 60, 
        background: color, 
        filter: 'blur(40px)', 
        opacity: 0.15 
      }} />
      <div style={{ fontSize: 42, fontWeight: 900, color, letterSpacing: -2, marginBottom: 4 }}>{score}%</div>
      <div style={{ fontWeight: 700, fontSize: 14, color: '#f1f1f1', marginBottom: 4 }}>{title}</div>
      <div className="hp-muted" style={{ fontSize: 11, fontWeight: 500 }}>{subtitle}</div>
      <div style={{ 
        height: 4, 
        background: 'rgba(255,255,255,0.05)', 
        borderRadius: 2, 
        marginTop: 16,
        overflow: 'hidden'
      }}>
        <div style={{ 
          height: '100%', 
          width: `${score}%`, 
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          borderRadius: 2,
          boxShadow: `0 0 8px ${color}66`
        }} />
      </div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header style={{ 
        padding: '32px 0', 
        background: 'linear-gradient(135deg, rgba(124, 77, 255, 0.05) 0%, transparent 100%)',
        borderRadius: 16,
        border: '1px solid rgba(124, 77, 255, 0.1)',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ 
          position: 'absolute', 
          top: '50%', left: '50%', 
          transform: 'translate(-50%, -50%)',
          width: '120%', height: '120%', 
          background: `radial-gradient(circle, ${scoreColor(total)}11 0%, transparent 70%)`,
          zIndex: 0
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ 
            fontSize: 72, 
            fontWeight: 900, 
            color: scoreColor(total), 
            letterSpacing: -4,
            textShadow: `0 0 30px ${scoreColor(total)}33`
          }}>{total}%</div>
          <div style={{ fontWeight: 800, fontSize: 24, marginTop: -8, letterSpacing: -0.5 }}>Configuration Health</div>
          <p className="hp-muted" style={{ maxWidth: 500, margin: '12px auto 0', fontSize: 14 }}>
            {total >= 80 ? 'Your Git environment is in pristine condition.' : total >= 50 ? 'Optimization is recommended for better security and workflow.' : 'Critical misconfigurations detected. High priority action required.'}
          </p>
        </div>
      </header>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <ScoreCard title="Identity" score={identityScore(cfg)} subtitle="Name, email, branch" />
        <ScoreCard title="Security" score={securityScore(cfg)} subtitle="Credentials, signing, SSL" />
        <ScoreCard title="Performance" score={performanceScore(cfg)} subtitle="Cache, index preload" />
        <ScoreCard title="Compatibility" score={compatibilityScore(cfg)} subtitle="Line endings, prune" />
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
  const [profileLabel, setProfileLabel] = useState<ProfileLabel>('Default')
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="hp-card" style={GLASS_CARD}>
        <div className="hp-section-title" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="codicon codicon-tag" style={{ color: 'var(--accent)' }} />
          Profile Label
        </div>
        <div className="hp-row-wrap" style={{ gap: 10 }}>
          {(['Default', 'Personal', 'Work', 'Open Source'] as ProfileLabel[]).map((l) => (
            <button
              key={l}
              type="button"
              className={`hp-btn${profileLabel === l ? ' hp-btn-primary' : ''}`}
              style={{ 
                padding: '10px 20px', 
                borderRadius: 10,
                background: profileLabel === l ? 'var(--accent)' : 'rgba(255,255,255,0.03)',
                color: profileLabel === l ? '#000' : 'var(--text)',
                border: '1px solid rgba(255,255,255,0.08)',
                fontWeight: 700
              }}
              onClick={() => setProfileLabel(l)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="hp-card" style={GLASS_CARD}>
        <div className="hp-section-title" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="codicon codicon-account" style={{ color: 'var(--accent)' }} />
          User Identity
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, display: 'block', marginBottom: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Full Name</label>
            <input className="hp-input" style={{ width: '100%', padding: '12px 14px', background: 'rgba(0,0,0,0.2)' }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" disabled={busy} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, display: 'block', marginBottom: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email Address</label>
            <input className="hp-input" style={{ width: '100%', padding: '12px 14px', background: 'rgba(0,0,0,0.2)' }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" disabled={busy} type="email" />
          </div>
        </div>
      </div>

      <div className="hp-card" style={GLASS_CARD}>
        <div className="hp-section-title" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="codicon codicon-settings" style={{ color: 'var(--accent)' }} />
          Repository Defaults
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, display: 'block', marginBottom: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Default Branch</label>
            <div className="hp-row-wrap" style={{ gap: 6, marginBottom: 12 }}>
              {['main', 'master', 'develop'].map((b) => (
                <button key={b} type="button" className={`hp-btn${branch === b ? ' hp-btn-primary' : ''}`} style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setBranch(b)} disabled={busy}>
                  {b}
                </button>
              ))}
            </div>
            <input className="hp-input" style={{ width: '100%', padding: '12px 14px', background: 'rgba(0,0,0,0.2)' }} value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" disabled={busy} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 800, display: 'block', marginBottom: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Default Editor</label>
            <div className="hp-row-wrap" style={{ gap: 6, marginBottom: 12 }}>
              {EDITORS.map((e) => (
                <button key={e.value} type="button" className={`hp-btn${editor === e.value ? ' hp-btn-primary' : ''}`} style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setEditor(e.value)} disabled={busy}>
                  {e.label}
                </button>
              ))}
            </div>
            <input className="hp-input" style={{ width: '100%', padding: '12px 14px', background: 'rgba(0,0,0,0.2)' }} value={editor} onChange={(e) => setEditor(e.target.value)} placeholder="code --wait" disabled={busy} />
          </div>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="hp-status-alert warning" style={{ borderRadius: 12, border: '1px solid rgba(255, 140, 66, 0.2)' }}>
          <span style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: 11 }}>Warning</span>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>{errors.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      {status && !errors.length && (
        <div className="hp-status-alert success" style={{ borderRadius: 12, border: '1px solid rgba(63, 185, 80, 0.2)' }}>
          <span className="codicon codicon-pass" />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{status}</span>
        </div>
      )}

      <div className="hp-row-wrap" style={{ gap: 12, marginTop: 8 }}>
        <button type="button" className="hp-btn" style={{ padding: '12px 24px', borderRadius: 10 }} onClick={handleValidateOnly} disabled={busy}>
          Validate Configuration
        </button>
        <button type="button" className="hp-btn hp-btn-primary" style={{ padding: '12px 24px', borderRadius: 10 }} onClick={() => void handleApply()} disabled={busy}>
          Apply Changes
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="hp-card" style={GLASS_CARD}>
        <div className="hp-section-title" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="codicon codicon-shield" style={{ color: 'var(--accent)' }} />
          Security Overview
        </div>
        <div className="hp-muted" style={{ fontSize: 12, marginBottom: 24 }}>
          Review your Git security posture. Green = secure, Yellow = attention needed, Red = risk.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
      </div>

      <div className="hp-card" style={GLASS_CARD}>
        <div className="hp-section-title" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="codicon codicon-lock" style={{ color: 'var(--accent)' }} />
          Privacy Actions
        </div>
        <div className="hp-row-wrap" style={{ gap: 12 }}>
          <button type="button" className="hp-btn" style={{ padding: '10px 16px' }} disabled={busy} onClick={() => void onSetKey('commit.gpgsign', gpgSign ? 'false' : 'true')}>
            {gpgSign ? 'Disable Commit Signing' : 'Enable Commit Signing'}
          </button>
          <button type="button" className="hp-btn" style={{ padding: '10px 16px' }} disabled={busy} onClick={() => void onSetKey('http.sslverify', sslVerify ? 'false' : 'true')}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="hp-card" style={GLASS_CARD}>
        <div className="hp-section-title" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="codicon codicon-zap" style={{ color: 'var(--accent)' }} />
          Preset Templates
        </div>
        <div className="hp-muted" style={{ fontSize: 13, marginBottom: 20 }}>
          Apply a curated set of settings in one click. You can fine-tune individual toggles below afterwards.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {PRESETS.map((p) => (
            <div key={p.label} className="hp-card" style={{ 
              background: 'rgba(255,255,255,0.02)', 
              padding: '16px', 
              cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.05)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'}>
              <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6, color: 'var(--accent)' }}>{p.label}</div>
              <div className="hp-muted" style={{ fontSize: 12, marginBottom: 16, lineHeight: 1.4 }}>{p.description}</div>
              <button
                type="button"
                className="hp-btn hp-btn-primary"
                style={{ width: '100%', fontSize: 12, padding: '8px' }}
                disabled={busy || presetApplying !== ''}
                onClick={() => void applyPreset(p)}
              >
                {presetApplying === p.label ? 'Applying…' : 'Apply Preset'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="hp-card" style={GLASS_CARD}>
        <div className="hp-section-title" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="codicon codicon-checklist" style={{ color: 'var(--accent)' }} />
          Behavior Toggles
        </div>
        <div className="hp-muted" style={{ fontSize: 13, marginBottom: 20 }}>Toggle individual Git behavior settings for your local environment.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
            description="core.fscache=true — caches filesystem data for improved performance."
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
          <div style={{ padding: '16px 0' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Line Ending Mode</div>
            <div className="hp-muted" style={{ fontSize: 12, marginBottom: 12 }}>
              core.autocrlf — normalizes line endings on checkout/commit. On Linux, Input is usually best.
            </div>
            <div className="hp-row-wrap" style={{ gap: 10 }}>
              {[['input', 'Input'], ['false', 'Off']].map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  className={`hp-btn${cfg.get('core.autocrlf') === v ? ' hp-btn-primary' : ''}`}
                  style={{ padding: '8px 16px' }}
                  onClick={() => void onSetKey('core.autocrlf', v)}
                  disabled={busy}
                >
                  {l}
                </button>
              ))}
            </div>
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
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="hp-card" style={GLASS_CARD}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
          <div style={{ flex: '1 1 300px', position: 'relative' }}>
            <span className="codicon codicon-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="hp-input"
              style={{ width: '100%', paddingLeft: 40, background: 'rgba(0,0,0,0.2)' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search keys or values…"
              disabled={loading}
            />
          </div>
          <div className="hp-row-wrap" style={{ gap: 8 }}>
            {CATEGORY_OPTIONS.map((c) => (
              <button key={c} type="button" className={`hp-btn${category === c ? ' hp-btn-primary' : ''}`} style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setCategory(c)}>
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, marginBottom: 20, cursor: loading ? 'default' : 'pointer', color: 'var(--text-muted)' }}>
          <input
            type="checkbox"
            checked={showSensitiveValues}
            style={{ width: 16, height: 16 }}
            onChange={(e) => {
              setShowSensitiveValues(e.target.checked)
              if (e.target.checked) setRevealed(new Set())
            }}
            disabled={loading}
          />
          <span>Show sensitive values (tokens, helpers, signing keys)</span>
        </label>
        <div className="hp-muted" style={{ fontSize: 11, marginBottom: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {filtered.length} of {rows.length} configuration entries
        </div>
        {filtered.length === 0 ? (
          <div className="hp-muted" style={{ fontSize: 14, textAlign: 'center', padding: '40px 0' }}>
            {rows.length === 0 ? 'No global config entries found.' : 'No entries match your search criteria.'}
          </div>
        ) : (
          <div className="hp-table-wrap" style={{ borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.1)' }}>
            <table className="hp-table">
              <thead>
                <tr className="hp-table-head" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <th className="hp-table-sort" style={{ width: '30%', padding: '12px 16px', fontWeight: 700 }} onClick={() => handleSort('key')}>
                    Key {sortKey === 'key' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th className="hp-table-sort" style={{ width: '40%', padding: '12px 16px', fontWeight: 700 }} onClick={() => handleSort('value')}>
                    Value {sortKey === 'value' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ width: '15%', padding: '12px 16px', fontWeight: 700 }}>Category</th>
                  <th style={{ width: '15%', padding: '12px 16px', fontWeight: 700 }}>Risk</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const risk = riskForRow(r)
                  const sensitive = isSensitive(r.key)
                  const cat = categorize(r.key)
                  const catColors: Record<string, string> = {
                    identity: '#3b82f6', security: '#ef4444', performance: '#22c55e', advanced: '#6b7280',
                  }
                  return (
                    <tr key={r.key} className="hp-table-row" style={{ 
                      background: risk ? 'rgba(239,68,68,0.04)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                      borderTop: '1px solid rgba(255,255,255,0.03)'
                    }}>
                      <td className="mono" style={{ padding: '12px 16px', fontSize: 12, color: 'var(--blue)' }}>{r.key}</td>
                      <td className="mono" style={{ padding: '12px 16px', fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {cellValue(r)}
                          {sensitive && !showSensitiveValues && (
                            <button type="button" className="hp-btn" style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.05)' }} onClick={() => toggleReveal(r.key)}>
                              {revealed.has(r.key) ? 'Hide' : 'Reveal'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: catColors[cat] + '15', color: catColors[cat], textTransform: 'uppercase' }}>
                          {cat}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {risk ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444' }}>
                            <span className="codicon codicon-warning" style={{ fontSize: 14 }} />
                            <span title={risk} style={{ fontSize: 11, fontWeight: 700, cursor: 'help' }}>RISK</span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', opacity: 0.3 }}>—</span>
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

// ─── Diagnostics Section (Git Doctor) ──────────────────────────────────────────

function DiagnosticsSection({ cfg, busy, onSetKey }: {
  cfg: Map<string, string>
  busy: boolean
  onSetKey: (k: string, v?: string) => Promise<void>
}): ReactElement {
  const suggestions = buildSuggestions(cfg, onSetKey)
  const total = totalScore(cfg)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="hp-card" style={{ 
        borderLeft: `6px solid ${scoreColor(total)}`,
        background: 'linear-gradient(90deg, rgba(30, 30, 30, 0.6) 0%, rgba(20, 20, 20, 0.4) 100%)',
        backdropFilter: 'blur(12px)',
        padding: '32px 24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ position: 'relative' }}>
            <svg width="80" height="80" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
              <circle cx="50" cy="50" r="45" fill="none" stroke={scoreColor(total)} strokeWidth="8" 
                strokeDasharray={`${total * 2.82} 282.6`} strokeLinecap="round" transform="rotate(-90 50 50)" 
                style={{ transition: 'stroke-dasharray 1s ease' }} />
            </svg>
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontWeight: 900, fontSize: 20, color: scoreColor(total) }}>{total}%</div>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: -0.5 }}>Git Doctor Diagnostics</div>
            <div className="hp-muted" style={{ fontSize: 14, marginTop: 4 }}>System health is <strong>{total >= 90 ? 'Optimal' : total >= 70 ? 'Stable' : 'Critical'}</strong>. {suggestions.length} issues identified.</div>
          </div>
        </div>
      </div>

      <div className="hp-card">
        <div className="hp-section-title" style={{ marginBottom: 16 }}>
          <span className="codicon codicon-heart" style={{ marginRight: 8, color: 'var(--red)' }} />
          Smart Diagnostics
        </div>
        {suggestions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div className="codicon codicon-check-all" style={{ fontSize: 32, color: 'var(--green)', marginBottom: 12 }} />
            <div style={{ fontWeight: 600 }}>No issues detected. Your Git environment is healthy!</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {suggestions.map((s, i) => (
              <div key={i} style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 12, 
                padding: 16, 
                borderRadius: 8, 
                background: 'var(--bg-subtle)',
                border: `1px solid ${s.priority === 'high' ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`
              }}>
                <span className={`codicon codicon-${s.priority === 'high' ? 'error' : 'warning'}`} 
                      style={{ fontSize: 20, color: s.priority === 'high' ? 'var(--orange)' : 'var(--yellow)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, textTransform: 'uppercase', color: s.priority === 'high' ? 'var(--orange)' : 'var(--yellow)', marginBottom: 2 }}>
                    {s.priority} Priority
                  </div>
                  <div style={{ fontSize: 13 }}>{s.text}</div>
                </div>
                {s.action && (
                  <button type="button" className="hp-btn hp-btn-primary" style={{ fontSize: 12 }} onClick={s.action} disabled={busy}>
                    Auto Fix
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Backups Section ──────────────────────────────────────────────────────────

function BackupsSection({ rows, onApplyPreset }: { 
  rows: ConfigRow[]
  onApplyPreset: (p: Preset) => Promise<void> 
}): ReactElement {
  const [importText, setImportText] = useState('')
  const [status, setStatus] = useState('')

  async function handleExport(): Promise<void> {
    const data = JSON.stringify(rows, null, 2)
    try {
      await navigator.clipboard.writeText(data)
      setStatus('Configuration exported to clipboard as JSON.')
    } catch {
      setImportText(data)
      setStatus('Clipboard unavailable. JSON pasted in the box below.')
    }
    setTimeout(() => setStatus(''), 3000)
  }

  async function handleImport(): Promise<void> {
    try {
      const parsed = JSON.parse(importText) as ConfigRow[]
      if (!Array.isArray(parsed)) throw new Error('Invalid JSON format.')
      const keys: Record<string, string> = {}
      parsed.forEach(r => { keys[r.key] = r.value })
      await onApplyPreset({ label: 'Imported Backup', description: 'User provided JSON backup', keys })
      setStatus('Backup imported successfully.')
      setImportText('')
    } catch (e) {
      setStatus(`Import failed: ${e instanceof Error ? e.message : String(e)}`)
    }
    setTimeout(() => setStatus(''), 4000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="hp-card" style={{ 
        background: 'rgba(30, 30, 30, 0.4)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        padding: '24px'
      }}>
        <div className="hp-section-title" style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, marginBottom: 20 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(124, 77, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="codicon codicon-cloud-download" style={{ color: 'var(--accent)' }} />
          </div>
          Export Settings
        </div>
        <p className="hp-muted" style={{ fontSize: 14, marginBottom: 24 }}>Generate a secure, portable JSON snapshot of your current global Git configurations to keep as backup or sync across machines.</p>
        <button type="button" className="hp-btn hp-btn-primary" style={{ padding: '12px 24px', borderRadius: 10 }} onClick={() => void handleExport()}>
          Export to Clipboard
        </button>
      </div>

      <div className="hp-card">
        <div className="hp-section-title">Import Settings</div>
        <p className="hp-muted" style={{ fontSize: 13, marginBottom: 12 }}>Paste a previously exported JSON array to restore your settings.</p>
        <textarea 
          className="hp-input mono" 
          style={{ minHeight: 120, fontSize: 11, marginBottom: 12 }}
          value={importText}
          onChange={e => setImportText(e.target.value)}
          placeholder='[{"key": "user.name", "value": "Jane Doe"}, ...]'
        />
        <button type="button" className="hp-btn" onClick={() => void handleImport()} disabled={!importText.trim()}>
          Restore Backup
        </button>
      </div>
      {status && <div className="hp-status-alert success">{status}</div>}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: Section; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'dashboard' },
  { id: 'identity', label: 'Identity', icon: 'account' },
  { id: 'security', label: 'Security', icon: 'shield' },
  { id: 'behavior', label: 'Behavior', icon: 'settings-gear' },
  { id: 'inspector', label: 'Config Inspector', icon: 'search' },
  { id: 'diagnostics', label: 'Git Doctor', icon: 'heart' },
  { id: 'backups', label: 'Backups', icon: 'cloud-download' },
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
         width: 220,
         flexShrink: 0,
         background: 'rgba(20, 20, 20, 0.4)',
         backdropFilter: 'blur(16px)',
         borderRight: '1px solid rgba(255, 255, 255, 0.05)',
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
              gap: 12,
              width: '100%',
              padding: '12px 16px',
              border: 'none',
              background: section === item.id ? 'rgba(124, 77, 255, 0.08)' : 'transparent',
              color: section === item.id ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
              textAlign: 'left',
              position: 'relative',
              transition: 'all 0.3s'
            }}
          >
            <div style={{
              position: 'absolute',
              left: 0, top: '20%', bottom: '20%',
              width: 3,
              background: section === item.id ? 'var(--accent)' : 'transparent',
              boxShadow: section === item.id ? '0 0 10px var(--accent)' : 'none',
              transition: 'all 0.3s'
            }} />
            <span className={`codicon codicon-${item.icon}`} style={{ 
              fontSize: 16, 
              color: section === item.id ? 'var(--accent)' : 'var(--text-muted)',
              textShadow: section === item.id ? '0 0 8px var(--accent)66' : 'none',
              transition: 'all 0.3s'
            }} />
            <span style={{ 
              flex: 1, 
              fontSize: 13, 
              fontWeight: section === item.id ? 700 : 500,
              letterSpacing: section === item.id ? '0.02em' : 'normal',
              color: section === item.id ? 'var(--text)' : 'inherit'
            }}>{item.label}</span>
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
        {section === 'diagnostics' && (
          <DiagnosticsSection cfg={cfg} busy={busy} onSetKey={handleSetKey} />
        )}
        {section === 'backups' && (
          <BackupsSection rows={rows} onApplyPreset={handleApplyPreset} />
        )}
      </main>
    </div>
  )
}
