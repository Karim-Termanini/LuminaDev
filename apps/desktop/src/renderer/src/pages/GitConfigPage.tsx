import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DoctorFinding } from '@linux-dev-home/shared'
import { assertGitOk } from './gitContract'
import { humanizeGitError } from './gitError'
import './GitConfigPage.css'

// ─── Types ───────────────────────────────────────────────────────────────────

type Section =
  | 'overview'
  | 'identity'
  | 'security'
  | 'behavior'
  | 'inspector'
  | 'diagnostics'
  | 'backups'
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
  return Math.round(
    (identityScore(cfg) + securityScore(cfg) + performanceScore(cfg) + compatibilityScore(cfg)) / 4
  )
}

// ─── Config helpers ───────────────────────────────────────────────────────────

const SENSITIVE_KEYS = new Set([
  'user.password',
  'user.signingkey',
  'credential.helper',
  'http.proxy',
  'https.proxy',
  'core.askpass',
  'http.cookiefile',
  'http.extraheader',
])

function isSensitive(key: string): boolean {
  return SENSITIVE_KEYS.has(key) || /password|secret|token|key$/i.test(key)
}

function maskValue(key: string, value: string, revealed: Set<string>): string {
  if (!isSensitive(key) || revealed.has(key)) return value
  return value.length <= 4 ? '●●●●' : value.slice(0, 2) + '●●●●' + value.slice(-2)
}

const CONFIG_CATEGORIES: Record<string, string> = {
  'user.': 'identity',
  'author.': 'identity',
  'committer.': 'identity',
  'credential.': 'security',
  'commit.gpg': 'security',
  'gpg.': 'security',
  'http.ssl': 'security',
  'http.cookie': 'security',
  'core.askpass': 'security',
  'core.preload': 'performance',
  'core.fscache': 'performance',
  'pack.': 'performance',
  'gc.': 'performance',
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
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    msgs.push('Email format invalid (expect user@domain.tld).')
  if (branch.trim()) {
    if (/\s/.test(branch)) msgs.push('Branch name cannot contain spaces.')
    if (branch.includes('..') || /[~^:?*[\]\\]/.test(branch))
      msgs.push('Branch name contains invalid characters.')
  }
  return msgs
}

const GLASS_CARD = {
  background: 'var(--bg-widget)',
  border: '1px solid var(--border)',
  boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
} as const

// ─── Presets ──────────────────────────────────────────────────────────────────

type Preset = {
  label: string
  labelKey: string
  description: string
  descKey: string
  keys: Record<string, string | null>
}

const PRESETS: Preset[] = [
  {
    label: 'Beginner Safe',
    labelKey: 'config.presets.beginnerSafe',
    description: 'Sensible defaults. Safe credential storage, main branch, nano editor.',
    descKey: 'config.presets.beginnerSafeDesc',
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
    labelKey: 'config.presets.devPro',
    description: 'Rebase workflow, auto prune, performance cache enabled.',
    descKey: 'config.presets.devProDesc',
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
    labelKey: 'config.presets.oss',
    description: 'Clean merge history, compatible line endings, prune on fetch.',
    descKey: 'config.presets.ossDesc',
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
    labelKey: 'config.presets.highSecurity',
    description: 'GPG signing required, SSL verification enforced.',
    descKey: 'config.presets.highSecurityDesc',
    keys: {
      'commit.gpgsign': 'true',
      'http.sslverify': 'true',
      'fetch.prune': 'true',
      'core.preloadindex': 'true',
    },
  },
  {
    label: 'Corporate Policy',
    labelKey: 'config.presets.corporate',
    description: 'Merge commits, signed commits, strict SSL, prune enabled.',
    descKey: 'config.presets.corporateDesc',
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

function buildSuggestions(
  cfg: Map<string, string>,
  onSetKey: (k: string, v?: string) => Promise<void>
): Suggestion[] {
  const out: Suggestion[] = []
  if (!cfg.get('user.name')?.trim())
    out.push({
      priority: 'high',
      text: 'Set your full name — required for commits to be attributed correctly.',
    })
  if (!cfg.get('user.email')?.trim())
    out.push({ priority: 'high', text: 'Set your email — required for commit authorship.' })
  const helper = cfg.get('credential.helper') ?? ''
  if (!helper)
    out.push({
      priority: 'high',
      text: 'No credential helper set. Git will prompt for password on every push.',
      action: () => void onSetKey('credential.helper', 'store'),
    })
  else if (/store/.test(helper))
    out.push({
      priority: 'medium',
      text: 'credential.helper=store saves passwords as plaintext. Consider switching to libsecret.',
    })
  if (cfg.get('commit.gpgsign') !== 'true')
    out.push({
      priority: 'medium',
      text: 'Commit signing is off. Enable GPG signing for verified commits.',
    })
  if (!cfg.get('fetch.prune'))
    out.push({
      priority: 'medium',
      text: 'Enable fetch.prune to auto-delete stale remote-tracking branches.',
      action: () => void onSetKey('fetch.prune', 'true'),
    })
  if (!cfg.get('init.defaultbranch'))
    out.push({
      priority: 'medium',
      text: 'Set init.defaultBranch to "main" so new repos use a consistent default branch.',
      action: () => void onSetKey('init.defaultbranch', 'main'),
    })
  if (!cfg.get('core.preloadindex'))
    out.push({
      priority: 'medium',
      text: 'Enable core.preloadindex for faster git status on large repos.',
      action: () => void onSetKey('core.preloadindex', 'true'),
    })
  return out
}

// ─── Score Card ───────────────────────────────────────────────────────────────

function scoreColor(s: number): string {
  if (s >= 80) return '#22c55e'
  if (s >= 50) return '#f59e0b'
  return '#ef4444'
}

function ScoreCard({
  title,
  score,
  subtitle,
}: {
  title: string
  score: number
  subtitle: string
}): ReactElement {
  const color = scoreColor(score)
  return (
    <div
      className="hp-card"
      style={{
        flex: '1 1 200px',
        textAlign: 'center',
        padding: '24px 16px',
        background: 'var(--bg-widget)',
        border: '1px solid var(--border)',
        transition: 'transform 0.2s, border-color 0.2s',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)'
        e.currentTarget.style.borderColor = `${color}44`
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.borderColor = 'var(--border)'
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -20,
          right: -20,
          width: 60,
          height: 60,
          background: color,
          filter: 'blur(40px)',
          opacity: 0.15,
        }}
      />
      <div style={{ fontSize: 42, fontWeight: 900, color, letterSpacing: -2, marginBottom: 4 }}>
        {score}%
      </div>
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
        {title}
      </div>
      <div className="hp-muted" style={{ fontSize: 11, fontWeight: 500 }}>
        {subtitle}
      </div>
      <div
        style={{
          height: 4,
          background: 'var(--border)',
          borderRadius: 2,
          marginTop: 16,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${score}%`,
            background: `linear-gradient(90deg, ${color}88, ${color})`,
            borderRadius: 2,
            boxShadow: `0 0 8px ${color}66`,
          }}
        />
      </div>
    </div>
  )
}

// ─── Security Row ─────────────────────────────────────────────────────────────

function SecurityRow({
  label,
  level,
  description,
  action,
  actionLabel,
}: {
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
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '12px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          padding: '2px 8px',
          borderRadius: 4,
          background: c.bg,
          color: c.color,
          whiteSpace: 'nowrap',
          marginTop: 1,
        }}
      >
        {c.text}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
        <div className="hp-muted" style={{ fontSize: 12, marginTop: 2 }}>
          {description}
        </div>
      </div>
      {action && actionLabel && (
        <button
          type="button"
          className="hp-btn"
          style={{ fontSize: 11, padding: '3px 10px' }}
          onClick={action}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

// ─── Behavior Toggle ──────────────────────────────────────────────────────────

function BehaviorToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled: boolean
}): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        padding: '12px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
        <div className="hp-muted" style={{ fontSize: 12, marginTop: 2 }}>
          {description}
        </div>
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
        <span
          style={{
            position: 'absolute',
            top: 3,
            left: checked ? 23 : 3,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          }}
        />
      </button>
    </div>
  )
}

// ─── Overview Section ─────────────────────────────────────────────────────────

// ─── Git Doctor ───────────────────────────────────────────────────────────────

const SEVERITY_STYLES = {
  critical: {
    chipBg: 'color-mix(in srgb, var(--red) 15%, transparent)',
    chipColor: 'var(--red)',
    label: 'CRITICAL',
  },
  warning: {
    chipBg: 'color-mix(in srgb, var(--orange) 15%, transparent)',
    chipColor: 'var(--orange)',
    label: 'WARNING',
  },
  info: {
    chipBg: 'color-mix(in srgb, var(--accent) 12%, transparent)',
    chipColor: 'var(--accent)',
    label: 'INFO',
  },
  ok: {
    chipBg: 'color-mix(in srgb, var(--green) 12%, transparent)',
    chipColor: 'var(--green)',
    label: 'OK',
  },
} as const

const CATEGORY_ICONS: Record<string, string> = {
  configuration: 'settings-gear',
  security: 'shield',
  performance: 'dashboard',
  environment: 'server-environment',
  overview: 'check',
}

function fixActionToHandler(
  action: string | undefined,
  onSetKey: (k: string, v?: string) => Promise<void>
): (() => void) | undefined {
  switch (action) {
    case 'set-credential-cache':
      return () => {
        void onSetKey('credential.helper', 'cache --timeout=3600')
      }
    case 'enable-ssl':
      return () => {
        void onSetKey('http.sslverify', 'true')
      }
    case 'enable-gpg-sign':
      return () => {
        void onSetKey('commit.gpgsign', 'true')
      }
    case 'enable-preload':
      return () => {
        void onSetKey('core.preloadindex', 'true')
      }
    case 'enable-prune':
      return () => {
        void onSetKey('fetch.prune', 'true')
      }
    case 'git-config-set':
    case 'set-default-branch':
      return () => {
        void onSetKey('init.defaultbranch', 'main')
      }
    case 'set-credential-store':
      return () => {
        void onSetKey('credential.helper', 'store')
      }
    default:
      return undefined
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function runDiagnostics(
  cfg: Map<string, string>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onSetKey: (k: string, v?: string) => Promise<void>
): DoctorFinding[] {
  const findings: DoctorFinding[] = []

  // Identity
  if (!cfg.get('user.name')?.trim())
    findings.push({
      id: 'no-name',
      category: 'configuration',
      severity: 'critical',
      title: 'No user name configured',
      detail: 'Every commit requires an author name. Set it in Identity.',
    })
  if (!cfg.get('user.email')?.trim())
    findings.push({
      id: 'no-email',
      category: 'configuration',
      severity: 'critical',
      title: 'No email configured',
      detail: 'Git attaches email to every commit. Required for push to GitHub/GitLab.',
    })
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cfg.get('user.email')!))
    findings.push({
      id: 'bad-email',
      category: 'configuration',
      severity: 'warning',
      title: 'Email format looks invalid',
      detail: `Current value: "${cfg.get('user.email')}"`,
    })

  // Default branch
  if (!cfg.get('init.defaultbranch'))
    findings.push({
      id: 'no-branch',
      category: 'configuration',
      severity: 'warning',
      title: 'No default branch set',
      detail:
        'New repos will use Git\'s built-in default (often "master"). Set to "main" for modern convention.',
      fix: { label: 'Set to main', action: 'set-default-branch' },
    })

  // Credential helper
  const helper = cfg.get('credential.helper') ?? ''
  if (!helper)
    findings.push({
      id: 'no-cred',
      category: 'security',
      severity: 'critical',
      title: 'No credential helper',
      detail: 'Git will prompt for password on every push/pull. Set a helper to cache credentials.',
      fix: { label: 'Use store (basic)', action: 'set-credential-store' },
    })
  else if (/\bstore\b/.test(helper))
    findings.push({
      id: 'plaintext-cred',
      category: 'security',
      severity: 'warning',
      title: 'Credentials stored in plaintext',
      detail:
        'credential.helper=store writes passwords to ~/.git-credentials unencrypted. Use libsecret or manager instead.',
    })

  // SSL
  if (cfg.get('http.sslverify') === 'false')
    findings.push({
      id: 'no-ssl',
      category: 'security',
      severity: 'critical',
      title: 'SSL verification disabled',
      detail: 'http.sslverify=false exposes connections to man-in-the-middle attacks.',
      fix: { label: 'Re-enable', action: 'enable-ssl' },
    })

  // Performance
  if (!cfg.get('core.preloadindex'))
    findings.push({
      id: 'no-preload',
      category: 'performance',
      severity: 'info',
      title: 'core.preloadindex not set',
      detail: 'Enables parallel stat calls during git status — faster on large repos.',
      fix: { label: 'Enable', action: 'enable-preload' },
    })
  if (!cfg.get('fetch.prune'))
    findings.push({
      id: 'no-prune',
      category: 'performance',
      severity: 'info',
      title: 'fetch.prune not set',
      detail: 'Stale remote-tracking branches accumulate. Enable auto-prune on fetch.',
      fix: { label: 'Enable', action: 'enable-prune' },
    })

  // Deprecated / dangerous
  if (cfg.get('pull.ff') === 'only')
    findings.push({
      id: 'pull-ff-only',
      category: 'configuration',
      severity: 'info',
      title: 'pull.ff=only is set',
      detail:
        'This prevents merge commits on pull but fails if remote has diverged. Consider pull.rebase=true instead.',
    })
  if (cfg.has('credential.username'))
    findings.push({
      id: 'cred-username',
      category: 'security',
      severity: 'warning',
      title: 'credential.username in global config',
      detail:
        'Storing a username globally can cause authentication issues across multiple accounts.',
    })

  if (findings.length === 0)
    findings.push({
      id: 'all-ok',
      category: 'overview',
      severity: 'ok',
      title: 'No issues found',
      detail: 'Git configuration looks healthy.',
    })

  return findings
}

function GitDoctor({
  onSetKey,
}: {
  onSetKey: (k: string, v?: string) => Promise<void>
}): ReactElement {
  const { t } = useTranslation('git')
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle')
  const [findings, setFindings] = useState<import('@linux-dev-home/shared').DoctorFinding[]>([])
  const [score, setScore] = useState(0)
  const [gitVer, setGitVer] = useState<string | null>(null)

  async function runScan(): Promise<void> {
    setPhase('scanning')
    try {
      const res = await window.dh.gitDoctorScan()
      if (!res.ok) {
        setPhase('error')
        return
      }
      setFindings(res.findings ?? [])
      setScore(res.healthScore ?? 0)
      setGitVer(res.gitVersion ?? null)
      setPhase('done')
    } catch {
      setPhase('error')
    }
  }

  const issues = findings.filter((f) => f.severity !== 'ok')
  const critCount = findings.filter((f) => f.severity === 'critical').length
  const warnCount = findings.filter((f) => f.severity === 'warning').length
  const okCount = findings.filter((f) => f.severity === 'ok').length

  const categories = new Map<string, typeof findings>()
  for (const f of findings) {
    const list = categories.get(f.category) ?? []
    list.push(f)
    categories.set(f.category, list)
  }

  const scoreColor = score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--orange)' : 'var(--red)'

  return (
    <div
      className="hp-card"
      style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border)' }}
    >
      <div
        style={{
          padding: '28px 24px 20px',
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--accent) 6%, transparent) 0%, transparent 60%)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span
                className="codicon codicon-heart"
                style={{ fontSize: 18, color: 'var(--accent)' }}
              />
              <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>
                {t('config.doctor.title')}
              </span>
              {gitVer && phase === 'done' && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: '2px 8px',
                    borderRadius: 10,
                    background: 'var(--bg-subtle)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {t('config.diagnostics.gitVersion', {
                    version: gitVer.replace(/^git version /, ''),
                  })}
                </span>
              )}
            </div>
            <p
              className="hp-muted"
              style={{ fontSize: 13, margin: 0, maxWidth: 520, lineHeight: 1.5 }}
            >
              {phase === 'idle' && t('config.doctor.scanDesc')}
              {phase === 'scanning' && t('config.diagnostics.scanning')}
              {phase === 'done' && issues.length === 0 && t('config.diagnostics.noIssues')}
              {phase === 'done' &&
                issues.length > 0 &&
                t('config.doctor.issues', { critical: critCount, warnings: warnCount })}
              {phase === 'error' && 'Scan failed. Check that Git is installed.'}
            </p>
          </div>
          <button
            type="button"
            className="hp-btn hp-btn-primary"
            onClick={() => void runScan()}
            disabled={phase === 'scanning'}
            style={{ flexShrink: 0, fontSize: 13, padding: '10px 20px', borderRadius: 8 }}
          >
            {phase === 'scanning' ? (
              <>
                <span
                  className="git-config-spinner"
                  style={{ width: 14, height: 14, borderWidth: 2 }}
                />{' '}
                {t('config.diagnostics.scanning')}
              </>
            ) : phase === 'done' ? (
              t('config.doctor.rescanBtn')
            ) : (
              t('config.doctor.scanBtn')
            )}
          </button>
        </div>

        {phase === 'done' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 20 }}>
            <div style={{ position: 'relative', width: 64, height: 64 }}>
              <svg width="64" height="64" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" strokeWidth="7" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke={scoreColor}
                  strokeWidth="7"
                  strokeDasharray={`${score * 2.64} 264`}
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)"
                  style={{
                    transition: 'stroke-dasharray 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    filter: `drop-shadow(0 0 8px ${scoreColor}44)`,
                  }}
                />
              </svg>
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontWeight: 800,
                  fontSize: 16,
                  color: scoreColor,
                  letterSpacing: -1,
                }}
              >
                {score}%
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
                {score >= 80
                  ? t('config.diagnostics.optimal')
                  : score >= 50
                    ? t('config.diagnostics.stable')
                    : t('config.diagnostics.critical')}
              </div>
              <div className="hp-muted" style={{ fontSize: 12, marginTop: 2 }}>
                {t('config.diagnostics.checksPassed', { count: okCount })} · {issues.length} issue
                {issues.length !== 1 ? 's' : ''} found
              </div>
            </div>
          </div>
        )}
      </div>

      {phase === 'scanning' && (
        <div style={{ padding: 24 }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 0',
                borderBottom: i < 3 ? '1px solid var(--border)' : undefined,
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 20,
                  borderRadius: 4,
                  background: 'var(--bg-subtle)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
              <div
                style={{
                  flex: 1,
                  height: 14,
                  borderRadius: 4,
                  background: 'var(--bg-subtle)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                  animationDelay: `${i * 0.15}s`,
                }}
              />
              <div
                style={{
                  width: 80,
                  height: 14,
                  borderRadius: 4,
                  background: 'var(--bg-subtle)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                  animationDelay: `${i * 0.3}s`,
                }}
              />
            </div>
          ))}
        </div>
      )}

      {phase === 'done' && (
        <div style={{ padding: '4px 0' }}>
          {[...categories.entries()]
            .filter(([cat]) => cat !== 'overview')
            .map(([category, catFindings]) => {
              const icon = CATEGORY_ICONS[category] ?? 'symbol-misc'
              return (
                <div key={category}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '12px 24px 6px',
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                      color: 'var(--text-muted)',
                    }}
                  >
                    <span className={`codicon codicon-${icon}`} style={{ fontSize: 14 }} />
                    {t(`config.diagnostics.category.${category}`, category)}
                  </div>
                  {catFindings.map((f) => {
                    const sty = SEVERITY_STYLES[f.severity] ?? SEVERITY_STYLES.info
                    const handler = f.fix ? fixActionToHandler(f.fix.action, onSetKey) : undefined
                    return (
                      <div
                        key={f.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 12,
                          padding: '12px 24px',
                          borderBottom:
                            '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
                          transition: 'background 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--bg-subtle)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <span
                          style={{
                            flexShrink: 0,
                            marginTop: 1,
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: 0.5,
                            padding: '3px 8px',
                            borderRadius: 4,
                            background: sty.chipBg,
                            color: sty.chipColor,
                            border: `1px solid color-mix(in srgb, ${sty.chipColor} 25%, transparent)`,
                          }}
                        >
                          {sty.label}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 13,
                              color: 'var(--text)',
                              marginBottom: 3,
                            }}
                          >
                            {f.title}
                          </div>
                          <div className="hp-muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
                            {f.detail}
                          </div>
                        </div>
                        {handler && (
                          <button
                            type="button"
                            className="hp-btn"
                            style={{
                              fontSize: 11,
                              padding: '4px 12px',
                              flexShrink: 0,
                              borderRadius: 6,
                            }}
                            onClick={async () => {
                              await handler()
                              void runScan()
                            }}
                          >
                            {f.fix!.label}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}

          {categories.has('overview') && (
            <div
              style={{
                margin: '4px 24px 12px',
                padding: '12px 16px',
                borderRadius: 8,
                background: 'color-mix(in srgb, var(--green) 6%, transparent)',
                border: '1px solid color-mix(in srgb, var(--green) 15%, transparent)',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--green)',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                <span className="codicon codicon-check-all" style={{ marginRight: 6 }} />
                {t('config.diagnostics.checksPassed', { count: okCount })}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {categories.get('overview')!.map((f) => (
                  <span
                    key={f.id}
                    style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}
                  >
                    <span
                      className="codicon codicon-check"
                      style={{ fontSize: 11, color: 'var(--green)', marginRight: 4 }}
                    />
                    {f.title}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 'error' && (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <span
            className="codicon codicon-error"
            style={{ fontSize: 32, color: 'var(--red)', marginBottom: 12, display: 'block' }}
          />
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Scan failed</div>
          <p className="hp-muted" style={{ fontSize: 13, margin: '0 auto', maxWidth: 360 }}>
            Could not complete the diagnostic scan. Ensure Git is installed and accessible from your
            PATH.
          </p>
          <button
            type="button"
            className="hp-btn hp-btn-primary"
            style={{ marginTop: 16 }}
            onClick={() => void runScan()}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

function OverviewSection({
  cfg,
  onSection,
  onSetKey,
}: {
  cfg: Map<string, string>
  onSection: (s: Section) => void
  onSetKey: (k: string, v?: string) => Promise<void>
}): ReactElement {
  const { t } = useTranslation('git')
  const total = totalScore(cfg)
  const suggestions = buildSuggestions(cfg, onSetKey)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header
        style={{
          padding: '32px 0',
          background: 'linear-gradient(135deg, rgba(124, 77, 255, 0.05) 0%, transparent 100%)',
          borderRadius: 16,
          border: '1px solid rgba(124, 77, 255, 0.1)',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '120%',
            height: '120%',
            background: `radial-gradient(circle, ${scoreColor(total)}11 0%, transparent 70%)`,
            zIndex: 0,
          }}
        />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 900,
              color: scoreColor(total),
              letterSpacing: -4,
              textShadow: `0 0 30px ${scoreColor(total)}33`,
            }}
          >
            {total}%
          </div>
          <div style={{ fontWeight: 800, fontSize: 24, marginTop: -8, letterSpacing: -0.5 }}>
            {t('config.score.health')}
          </div>
          <p className="hp-muted" style={{ maxWidth: 500, margin: '12px auto 0', fontSize: 14 }}>
            {total >= 80
              ? t('config.score.pristine')
              : total >= 50
                ? t('config.score.optimization')
                : t('config.score.critical')}
          </p>
        </div>
      </header>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <ScoreCard
          title={t('config.score.identity')}
          score={identityScore(cfg)}
          subtitle={t('config.score.identitySub')}
        />
        <ScoreCard
          title={t('config.score.security')}
          score={securityScore(cfg)}
          subtitle={t('config.score.securitySub')}
        />
        <ScoreCard
          title={t('config.score.performance')}
          score={performanceScore(cfg)}
          subtitle={t('config.score.performanceSub')}
        />
        <ScoreCard
          title={t('config.score.compatibility')}
          score={compatibilityScore(cfg)}
          subtitle={t('config.score.compatibilitySub')}
        />
      </div>

      {suggestions.length > 0 && (
        <div className="hp-card">
          <div className="hp-section-title">{t('config.suggestions.title')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {suggestions.map((s, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: '10px 0',
                  borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : undefined,
                }}
              >
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
                  {s.priority === 'high'
                    ? t('config.suggestions.high')
                    : t('config.suggestions.medium')}
                </span>
                <div style={{ flex: 1, fontSize: 13 }}>{s.text}</div>
                {s.action && (
                  <button
                    type="button"
                    className="hp-btn"
                    style={{ fontSize: 11, padding: '3px 10px' }}
                    onClick={s.action}
                  >
                    {t('config.suggestions.fix')}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <GitDoctor onSetKey={onSetKey} />

      <div className="hp-card">
        <div className="hp-section-title">{t('config.quickActions.title')}</div>
        <div className="hp-row-wrap" style={{ gap: 10 }}>
          <button type="button" className="hp-btn" onClick={() => onSection('identity')}>
            {t('config.quickActions.editIdentity')}
          </button>
          <button type="button" className="hp-btn" onClick={() => onSection('security')}>
            {t('config.quickActions.reviewSecurity')}
          </button>
          <button type="button" className="hp-btn" onClick={() => onSection('behavior')}>
            {t('config.quickActions.behaviorSettings')}
          </button>
          <button type="button" className="hp-btn" onClick={() => onSection('inspector')}>
            {t('config.quickActions.inspector')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Identity Section ─────────────────────────────────────────────────────────

function IdentitySection({
  cfg,
  busy,
  onSave,
}: {
  cfg: Map<string, string>
  busy: boolean
  onSave: (fields: { name: string; email: string; branch: string; editor: string }) => Promise<void>
}): ReactElement {
  const { t } = useTranslation('git')
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
      setStatus(t('config.identity.validationPassed'))
    }
  }

  async function handleApply(): Promise<void> {
    const errs = validateIdentity(name, email, branch)
    if (errs.length) {
      setErrors(errs)
      setStatus('')
      return
    }
    setErrors([])
    setStatus('')
    await onSave({ name, email, branch, editor })
    setStatus(t('config.identity.saved'))
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
        <div
          className="hp-section-title"
          style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span className="codicon codicon-tag" style={{ color: 'var(--accent)' }} />
          {t('config.identity.profileLabel')}
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
                background: profileLabel === l ? 'var(--accent)' : 'var(--bg-input)',
                color: profileLabel === l ? '#fff' : 'var(--text)',
                border: '1px solid var(--border)',
                fontWeight: 700,
              }}
              onClick={() => setProfileLabel(l)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="hp-card" style={GLASS_CARD}>
        <div
          className="hp-section-title"
          style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span className="codicon codicon-account" style={{ color: 'var(--accent)' }} />
          {t('config.identity.userIdentity')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <label
              style={{
                fontSize: 11,
                fontWeight: 800,
                display: 'block',
                marginBottom: 8,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {t('config.identity.fullName')}
            </label>
            <input
              className="hp-input"
              style={{ width: '100%', padding: '12px 14px', background: 'var(--bg-input)' }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              disabled={busy}
            />
          </div>
          <div>
            <label
              style={{
                fontSize: 11,
                fontWeight: 800,
                display: 'block',
                marginBottom: 8,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {t('config.identity.email')}
            </label>
            <input
              className="hp-input"
              style={{ width: '100%', padding: '12px 14px', background: 'var(--bg-input)' }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              disabled={busy}
              type="email"
            />
          </div>
        </div>
      </div>

      <div className="hp-card" style={GLASS_CARD}>
        <div
          className="hp-section-title"
          style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span className="codicon codicon-settings" style={{ color: 'var(--accent)' }} />
          {t('config.identity.repoDefaults')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <label
              style={{
                fontSize: 11,
                fontWeight: 800,
                display: 'block',
                marginBottom: 8,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {t('config.identity.defaultBranch')}
            </label>
            <div className="hp-row-wrap" style={{ gap: 6, marginBottom: 12 }}>
              {['main', 'master', 'develop'].map((b) => (
                <button
                  key={b}
                  type="button"
                  className={`hp-btn${branch === b ? ' hp-btn-primary' : ''}`}
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => setBranch(b)}
                  disabled={busy}
                >
                  {b}
                </button>
              ))}
            </div>
            <input
              className="hp-input"
              style={{ width: '100%', padding: '12px 14px', background: 'var(--bg-input)' }}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              disabled={busy}
            />
          </div>
          <div>
            <label
              style={{
                fontSize: 11,
                fontWeight: 800,
                display: 'block',
                marginBottom: 8,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {t('config.identity.defaultEditor')}
            </label>
            <div className="hp-row-wrap" style={{ gap: 6, marginBottom: 12 }}>
              {EDITORS.map((e) => (
                <button
                  key={e.value}
                  type="button"
                  className={`hp-btn${editor === e.value ? ' hp-btn-primary' : ''}`}
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => setEditor(e.value)}
                  disabled={busy}
                >
                  {e.label}
                </button>
              ))}
            </div>
            <input
              className="hp-input"
              style={{ width: '100%', padding: '12px 14px', background: 'var(--bg-input)' }}
              value={editor}
              onChange={(e) => setEditor(e.target.value)}
              placeholder="code --wait"
              disabled={busy}
            />
          </div>
        </div>
      </div>

      {errors.length > 0 && (
        <div
          className="hp-status-alert warning"
          style={{ borderRadius: 12, border: '1px solid rgba(255, 140, 66, 0.2)' }}
        >
          <span style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: 11 }}>
            {t('config.identity.warning')}
          </span>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>
            {errors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {status && !errors.length && (
        <div
          className="hp-status-alert success"
          style={{ borderRadius: 12, border: '1px solid rgba(63, 185, 80, 0.2)' }}
        >
          <span className="codicon codicon-pass" />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{status}</span>
        </div>
      )}

      <div className="hp-row-wrap" style={{ gap: 12, marginTop: 8 }}>
        <button
          type="button"
          className="hp-btn"
          style={{ padding: '12px 24px', borderRadius: 10 }}
          onClick={handleValidateOnly}
          disabled={busy}
        >
          {t('config.identity.validate')}
        </button>
        <button
          type="button"
          className="hp-btn hp-btn-primary"
          style={{ padding: '12px 24px', borderRadius: 10 }}
          onClick={() => void handleApply()}
          disabled={busy}
        >
          {t('config.identity.apply')}
        </button>
      </div>
    </div>
  )
}

// ─── Security Section ─────────────────────────────────────────────────────────

function SecuritySection({
  cfg,
  busy,
  onSetKey,
}: {
  cfg: Map<string, string>
  busy: boolean
  onSetKey: (k: string, v?: string) => Promise<void>
}): ReactElement {
  const { t } = useTranslation('git')
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
        <div
          className="hp-section-title"
          style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span className="codicon codicon-shield" style={{ color: 'var(--accent)' }} />
          {t('config.security.title')}
        </div>
        <div className="hp-muted" style={{ fontSize: 12, marginBottom: 24 }}>
          {t('config.security.desc')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <SecurityRow
            label={t('config.security.credStorage')}
            level={credLevel()}
            description={
              helper
                ? `${t('config.security.usingHelper')} ${helper}`
                : t('config.security.noHelper')
            }
            action={!helper ? () => void onSetKey('credential.helper', 'store') : undefined}
            actionLabel={t('config.security.setBasicStore')}
          />
          <SecurityRow
            label={t('config.security.commitSigning')}
            level={gpgSign ? 'secure' : 'attention'}
            description={
              gpgSign
                ? `${t('config.security.gpgEnabled')}${signingKey ? ` (key: ${signingKey.slice(0, 12)}…)` : ''}.`
                : t('config.security.gpgDisabled')
            }
            action={!gpgSign ? () => void onSetKey('commit.gpgsign', 'true') : undefined}
            actionLabel={t('config.security.enableSigning')}
          />
          <SecurityRow
            label={t('config.security.sslVerify')}
            level={sslVerify ? 'secure' : 'risk'}
            description={
              sslVerify ? t('config.security.sslEnabled') : t('config.security.sslDisabled')
            }
            action={!sslVerify ? () => void onSetKey('http.sslverify', 'true') : undefined}
            actionLabel={t('config.security.reenableSsl')}
          />
          <SecurityRow
            label={t('config.security.cookieFile')}
            level={hasCookieFile ? 'attention' : 'secure'}
            description={
              hasCookieFile ? t('config.security.cookieSet') : t('config.security.cookieNone')
            }
          />
          <div style={{ borderBottom: 'none' }}>
            <SecurityRow
              label={t('config.security.sensitiveConfig')}
              level={isSensitiveExposed(cfg) ? 'attention' : 'secure'}
              description={
                isSensitiveExposed(cfg)
                  ? t('config.security.sensitiveExposed')
                  : t('config.security.sensitiveClean')
              }
            />
          </div>
        </div>
      </div>

      <div className="hp-card" style={GLASS_CARD}>
        <div
          className="hp-section-title"
          style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span className="codicon codicon-lock" style={{ color: 'var(--accent)' }} />
          {t('config.security.privacyTitle')}
        </div>
        <div className="hp-row-wrap" style={{ gap: 12 }}>
          <button
            type="button"
            className="hp-btn"
            style={{ padding: '10px 16px' }}
            disabled={busy}
            onClick={() => void onSetKey('commit.gpgsign', gpgSign ? 'false' : 'true')}
          >
            {gpgSign ? t('config.security.disableSigning') : t('config.security.enableSigning')}
          </button>
          <button
            type="button"
            className="hp-btn"
            style={{ padding: '10px 16px' }}
            disabled={busy}
            onClick={() => void onSetKey('http.sslverify', sslVerify ? 'false' : 'true')}
          >
            {sslVerify ? t('config.security.disableSSL') : t('config.security.restoreSSL')}
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

function BehaviorSection({
  cfg,
  busy,
  onSetKey,
  onApplyPreset,
}: {
  cfg: Map<string, string>
  busy: boolean
  onSetKey: (k: string, v?: string) => Promise<void>
  onApplyPreset: (p: Preset) => Promise<void>
}): ReactElement {
  const { t } = useTranslation('git')
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
        <div
          className="hp-section-title"
          style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span className="codicon codicon-zap" style={{ color: 'var(--accent)' }} />
          {t('config.behavior.presetsTitle')}
        </div>
        <div className="hp-muted" style={{ fontSize: 13, marginBottom: 20 }}>
          {t('config.behavior.presetsDesc')}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          {PRESETS.map((p) => (
            <div
              key={p.label}
              className="hp-card"
              style={{
                background: 'var(--bg-widget)',
                padding: '16px',
                cursor: 'pointer',
                border: '1px solid var(--border)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <div
                style={{ fontWeight: 800, fontSize: 14, marginBottom: 6, color: 'var(--accent)' }}
              >
                {t(p.labelKey)}
              </div>
              <div className="hp-muted" style={{ fontSize: 12, marginBottom: 16, lineHeight: 1.4 }}>
                {t(p.descKey)}
              </div>
              <button
                type="button"
                className="hp-btn hp-btn-primary"
                style={{ width: '100%', fontSize: 12, padding: '8px' }}
                disabled={busy || presetApplying !== ''}
                onClick={() => void applyPreset(p)}
              >
                {presetApplying === p.label
                  ? t('config.behavior.applying')
                  : t('config.behavior.applyPreset')}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="hp-card" style={GLASS_CARD}>
        <div
          className="hp-section-title"
          style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span className="codicon codicon-checklist" style={{ color: 'var(--accent)' }} />
          {t('config.behavior.togglesTitle')}
        </div>
        <div className="hp-muted" style={{ fontSize: 13, marginBottom: 20 }}>
          {t('config.behavior.togglesDesc')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <BehaviorToggle
            label={t('config.behavior.rebaseOnPull')}
            description={t('config.behavior.rebaseDesc')}
            checked={bool('pull.rebase')}
            onChange={(v) => void onSetKey('pull.rebase', String(v))}
            disabled={busy}
          />
          <BehaviorToggle
            label={t('config.behavior.autoPruneBranches')}
            description={t('config.behavior.pruneBranchesDesc')}
            checked={bool('fetch.prune')}
            onChange={(v) => void onSetKey('fetch.prune', String(v))}
            disabled={busy}
          />
          <BehaviorToggle
            label={t('config.behavior.autoPruneTags')}
            description={t('config.behavior.pruneTagsDesc')}
            checked={bool('fetch.prunetags')}
            onChange={(v) => void onSetKey('fetch.prunetags', String(v))}
            disabled={busy}
          />
          <BehaviorToggle
            label={t('config.behavior.preloadIndex')}
            description={t('config.behavior.preloadDesc')}
            checked={bool('core.preloadindex')}
            onChange={(v) => void onSetKey('core.preloadindex', String(v))}
            disabled={busy}
          />
          <BehaviorToggle
            label={t('config.behavior.fsCache')}
            description={t('config.behavior.fsCacheDesc')}
            checked={bool('core.fscache')}
            onChange={(v) => void onSetKey('core.fscache', String(v))}
            disabled={busy}
          />
          <BehaviorToggle
            label={t('config.behavior.autoStash')}
            description={t('config.behavior.autoStashDesc')}
            checked={bool('rebase.autostash')}
            onChange={(v) => void onSetKey('rebase.autostash', String(v))}
            disabled={busy}
          />
          <BehaviorToggle
            label={t('config.behavior.gpgSigning')}
            description={t('config.behavior.gpgDesc')}
            checked={bool('commit.gpgsign')}
            onChange={(v) => void onSetKey('commit.gpgsign', String(v))}
            disabled={busy}
          />
          <div style={{ padding: '16px 0' }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
              {t('config.behavior.lineEndingTitle')}
            </div>
            <div className="hp-muted" style={{ fontSize: 12, marginBottom: 12 }}>
              {t('config.behavior.lineEndingDesc')}
            </div>
            <div className="hp-row-wrap" style={{ gap: 10 }}>
              {[
                ['input', t('config.behavior.inputMode')],
                ['false', t('config.behavior.offMode')],
              ].map(([v, l]) => (
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
type CategoryFilter = (typeof CATEGORY_OPTIONS)[number]

function InspectorSection({
  rows,
  loading,
}: {
  rows: ConfigRow[]
  loading: boolean
}): ReactElement {
  const { t } = useTranslation('git')
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
      const va = a[sortKey].toLowerCase(),
        vb = b[sortKey].toLowerCase()
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })

  function handleSort(k: 'key' | 'value'): void {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir('asc')
    }
  }

  const CATEGORY_LABELS: Record<CategoryFilter, string> = {
    all: t('config.categories.all'),
    identity: t('config.categories.identity'),
    security: t('config.categories.security'),
    performance: t('config.categories.performance'),
    advanced: t('config.categories.advanced'),
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
            <span
              className="codicon codicon-search"
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              className="hp-input"
              style={{ width: '100%', paddingLeft: 40, background: 'var(--bg-input)' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('config.inspector.searchPlaceholder')}
              disabled={loading}
            />
          </div>
          <div className="hp-row-wrap" style={{ gap: 8 }}>
            {CATEGORY_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                className={`hp-btn${category === c ? ' hp-btn-primary' : ''}`}
                style={{ fontSize: 12, padding: '6px 12px' }}
                onClick={() => setCategory(c)}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            marginBottom: 20,
            cursor: loading ? 'default' : 'pointer',
            color: 'var(--text-muted)',
          }}
        >
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
          <span>{t('config.inspector.showSensitive')}</span>
        </label>
        <div
          className="hp-muted"
          style={{
            fontSize: 11,
            marginBottom: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {t('config.inspector.entries', { count: filtered.length, total: rows.length })}
        </div>
        {filtered.length === 0 ? (
          <div
            className="hp-muted"
            style={{ fontSize: 14, textAlign: 'center', padding: '40px 0' }}
          >
            {rows.length === 0 ? t('config.inspector.noEntries') : t('config.inspector.noMatch')}
          </div>
        ) : (
          <div
            className="hp-table-wrap"
            style={{
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-widget)',
            }}
          >
            <table className="hp-table">
              <thead>
                <tr className="hp-table-head" style={{ background: 'var(--bg-input)' }}>
                  <th
                    className="hp-table-sort"
                    style={{ width: '30%', padding: '12px 16px', fontWeight: 700 }}
                    onClick={() => handleSort('key')}
                  >
                    {t('config.inspector.colKey')}{' '}
                    {sortKey === 'key' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th
                    className="hp-table-sort"
                    style={{ width: '40%', padding: '12px 16px', fontWeight: 700 }}
                    onClick={() => handleSort('value')}
                  >
                    {t('config.inspector.colValue')}{' '}
                    {sortKey === 'value' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ width: '15%', padding: '12px 16px', fontWeight: 700 }}>
                    {t('config.inspector.colCategory')}
                  </th>
                  <th style={{ width: '15%', padding: '12px 16px', fontWeight: 700 }}>
                    {t('config.inspector.colRisk')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const risk = riskForRow(r)
                  const sensitive = isSensitive(r.key)
                  const cat = categorize(r.key)
                  const catColors: Record<string, string> = {
                    identity: '#3b82f6',
                    security: '#ef4444',
                    performance: '#22c55e',
                    advanced: '#6b7280',
                  }
                  return (
                    <tr
                      key={r.key}
                      className="hp-table-row"
                      style={{
                        background: risk
                          ? 'color-mix(in srgb, var(--red) 6%, transparent)'
                          : i % 2 === 0
                            ? 'transparent'
                            : 'var(--bg-input)',
                        borderTop: '1px solid var(--border)',
                      }}
                    >
                      <td
                        className="mono"
                        style={{ padding: '12px 16px', fontSize: 12, color: 'var(--blue)' }}
                      >
                        {r.key}
                      </td>
                      <td className="mono" style={{ padding: '12px 16px', fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {cellValue(r)}
                          {sensitive && !showSensitiveValues && (
                            <button
                              type="button"
                              className="hp-btn"
                              style={{
                                fontSize: 10,
                                padding: '2px 8px',
                                borderRadius: 4,
                                background: 'var(--bg-input)',
                              }}
                              onClick={() => toggleReveal(r.key)}
                            >
                              {revealed.has(r.key)
                                ? t('config.inspector.hide')
                                : t('config.inspector.reveal')}
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: catColors[cat] + '15',
                            color: catColors[cat],
                            textTransform: 'uppercase',
                          }}
                        >
                          {cat}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {risk ? (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              color: 'var(--red)',
                            }}
                          >
                            <span className="codicon codicon-warning" style={{ fontSize: 14 }} />
                            <span
                              title={risk}
                              style={{ fontSize: 11, fontWeight: 700, cursor: 'help' }}
                            >
                              {t('config.inspector.riskLabel')}
                            </span>
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

function DiagnosticsSection({
  onSetKey,
}: {
  cfg?: Map<string, string>
  busy?: boolean
  onSetKey: (k: string, v?: string) => Promise<void>
}): ReactElement {
  const { t } = useTranslation('git')
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle')
  const [findings, setFindings] = useState<import('@linux-dev-home/shared').DoctorFinding[]>([])
  const [score, setScore] = useState(0)

  useEffect(() => {
    void runScan()
  }, [])

  async function runScan(): Promise<void> {
    setPhase('scanning')
    try {
      const res = await window.dh.gitDoctorScan()
      if (!res.ok) {
        setPhase('error')
        return
      }
      setFindings(res.findings ?? [])
      setScore(res.healthScore ?? 0)
      setPhase('done')
    } catch {
      setPhase('error')
    }
  }

  const issues = findings.filter((f) => f.severity !== 'ok')
  const okCount = findings.filter((f) => f.severity === 'ok').length
  const scoreColor = score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--orange)' : 'var(--red)'

  const categories = new Map<string, typeof findings>()
  for (const f of findings) {
    const list = categories.get(f.category) ?? []
    list.push(f)
    categories.set(f.category, list)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Hero health card */}
      <div
        className="hp-card"
        style={{
          padding: 0,
          overflow: 'hidden',
          border: '1px solid var(--border)',
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--accent) 4%, transparent) 0%, transparent 50%)',
        }}
      >
        <div style={{ padding: '36px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            {/* Animated health ring */}
            <div style={{ position: 'relative', width: 100, height: 100, flexShrink: 0 }}>
              {phase === 'scanning' ? (
                <div
                  style={{
                    width: 100,
                    height: 100,
                    borderRadius: '50%',
                    border: '7px solid var(--border)',
                    borderTopColor: 'var(--accent)',
                    animation: 'spin 1s linear infinite',
                  }}
                />
              ) : phase === 'done' ? (
                <>
                  <svg width="100" height="100" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="var(--border)"
                      strokeWidth="7"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke={scoreColor}
                      strokeWidth="7"
                      strokeDasharray={`${score * 2.64} 264`}
                      strokeLinecap="round"
                      transform="rotate(-90 50 50)"
                      style={{
                        transition: 'stroke-dasharray 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        filter: `drop-shadow(0 0 10px ${scoreColor}55)`,
                      }}
                    />
                  </svg>
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      fontWeight: 900,
                      fontSize: 22,
                      color: scoreColor,
                      letterSpacing: -1.5,
                    }}
                  >
                    {score}%
                  </div>
                </>
              ) : (
                <>
                  <svg width="100" height="100" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="var(--border)"
                      strokeWidth="7"
                    />
                  </svg>
                  <div
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <span
                      className="codicon codicon-pulse"
                      style={{ fontSize: 28, color: 'var(--text-muted)' }}
                    />
                  </div>
                </>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span
                  className="codicon codicon-heart"
                  style={{ fontSize: 18, color: 'var(--accent)' }}
                />
                <span
                  style={{
                    fontWeight: 800,
                    fontSize: 22,
                    letterSpacing: -0.5,
                    color: 'var(--text)',
                  }}
                >
                  {t('config.diagnostics.title')}
                </span>
              </div>
              <p
                className="hp-muted"
                style={{ fontSize: 14, margin: 0, lineHeight: 1.5, maxWidth: 500 }}
              >
                {phase === 'idle' && t('config.doctor.scanDesc')}
                {phase === 'scanning' && t('config.diagnostics.scanning')}
                {phase === 'done' && issues.length === 0 && t('config.diagnostics.noIssues')}
                {phase === 'done' &&
                  issues.length > 0 &&
                  `${t('config.diagnostics.healthPrefix')} ${score >= 80 ? t('config.diagnostics.optimal') : score >= 50 ? t('config.diagnostics.stable') : t('config.diagnostics.critical')}. ${t('config.diagnostics.healthSuffix', { count: issues.length })}`}
                {phase === 'error' && 'Scan failed. Verify Git is installed and accessible.'}
              </p>
              {phase !== 'scanning' && (
                <button
                  type="button"
                  className="hp-btn hp-btn-primary"
                  style={{ marginTop: 16, fontSize: 13, padding: '10px 20px', borderRadius: 8 }}
                  onClick={() => void runScan()}
                >
                  {phase === 'done' ? t('config.doctor.rescanBtn') : t('config.doctor.scanBtn')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scanning skeleton */}
      {phase === 'scanning' && (
        <div className="hp-card" style={{ padding: 24 }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 12,
                padding: '12px 0',
                borderBottom: i < 4 ? '1px solid var(--border)' : undefined,
              }}
            >
              <div
                style={{
                  width: 72,
                  height: 18,
                  borderRadius: 4,
                  background: 'var(--bg-subtle)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
              <div
                style={{
                  flex: 1,
                  height: 14,
                  borderRadius: 4,
                  background: 'var(--bg-subtle)',
                  animation: 'pulse 1.5s ease-in-out infinite',
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Done: category-grouped findings */}
      {phase === 'done' && findings.length > 0 && (
        <>
          {[...categories.entries()]
            .filter(([cat]) => cat !== 'overview')
            .map(([category, catFindings]) => (
              <div key={category} className="hp-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div
                  style={{
                    padding: '14px 24px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: 'var(--bg-subtle)',
                  }}
                >
                  <span
                    className={`codicon codicon-${CATEGORY_ICONS[category] ?? 'symbol-misc'}`}
                    style={{ fontSize: 16, color: 'var(--accent)' }}
                  />
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 13,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      color: 'var(--text)',
                    }}
                  >
                    {t(`config.diagnostics.category.${category}`, category)}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                    {catFindings.length} issue{catFindings.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {catFindings.map((f, i) => {
                  const sty = SEVERITY_STYLES[f.severity] ?? SEVERITY_STYLES.info
                  const handler = f.fix ? fixActionToHandler(f.fix.action, onSetKey) : undefined
                  return (
                    <div
                      key={f.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        padding: '14px 24px',
                        borderBottom:
                          i < catFindings.length - 1
                            ? '1px solid color-mix(in srgb, var(--border) 60%, transparent)'
                            : undefined,
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--bg-subtle)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <span
                        style={{
                          flexShrink: 0,
                          marginTop: 1,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 0.5,
                          padding: '3px 8px',
                          borderRadius: 4,
                          background: sty.chipBg,
                          color: sty.chipColor,
                          border: `1px solid color-mix(in srgb, ${sty.chipColor} 25%, transparent)`,
                        }}
                      >
                        {sty.label}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            color: 'var(--text)',
                            marginBottom: 3,
                          }}
                        >
                          {f.title}
                        </div>
                        <div className="hp-muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
                          {f.detail}
                        </div>
                      </div>
                      {handler && (
                        <button
                          type="button"
                          className="hp-btn"
                          style={{
                            fontSize: 11,
                            padding: '4px 12px',
                            flexShrink: 0,
                            borderRadius: 6,
                          }}
                          onClick={async () => {
                            await handler()
                            void runScan()
                          }}
                        >
                          {f.fix!.label}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}

          {/* OK items summary */}
          {categories.has('overview') && (
            <div
              className="hp-card"
              style={{
                padding: '16px 24px',
                background: 'color-mix(in srgb, var(--green) 6%, transparent)',
                border: '1px solid color-mix(in srgb, var(--green) 20%, transparent)',
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--green)',
                  marginBottom: 10,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                <span className="codicon codicon-check-all" style={{ marginRight: 8 }} />
                {t('config.diagnostics.checksPassed', { count: okCount })}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {categories.get('overview')!.map((f) => (
                  <span key={f.id} style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    <span
                      className="codicon codicon-check"
                      style={{ fontSize: 11, color: 'var(--green)', marginRight: 4 }}
                    />
                    {f.title}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* All-clear state */}
      {phase === 'done' && findings.length === 0 && (
        <div className="hp-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div
            className="codicon codicon-check-all"
            style={{ fontSize: 48, color: 'var(--green)', marginBottom: 16 }}
          />
          <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)', marginBottom: 6 }}>
            {t('config.diagnostics.noIssues')}
          </div>
          <p className="hp-muted" style={{ fontSize: 13, maxWidth: 400, margin: '0 auto' }}>
            All diagnostic checks passed. Your Git environment is properly configured.
          </p>
        </div>
      )}

      {/* Error state */}
      {phase === 'error' && (
        <div className="hp-card" style={{ textAlign: 'center', padding: 40 }}>
          <span
            className="codicon codicon-error"
            style={{ fontSize: 32, color: 'var(--red)', marginBottom: 12, display: 'block' }}
          />
          <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Scan Failed</div>
          <p className="hp-muted" style={{ fontSize: 13, margin: '0 auto 16px', maxWidth: 360 }}>
            Could not complete the diagnostic scan. Ensure Git is installed and accessible from your
            PATH.
          </p>
          <button type="button" className="hp-btn hp-btn-primary" onClick={() => void runScan()}>
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Backups Section ──────────────────────────────────────────────────────────

function BackupsSection({
  rows,
  onApplyPreset,
}: {
  rows: ConfigRow[]
  onApplyPreset: (p: Preset) => Promise<void>
}): ReactElement {
  const { t } = useTranslation('git')
  const [importText, setImportText] = useState('')
  const [status, setStatus] = useState('')

  async function handleExport(): Promise<void> {
    const data = JSON.stringify(rows, null, 2)
    try {
      await navigator.clipboard.writeText(data)
      setStatus(t('config.backups.exportSuccess'))
    } catch {
      setImportText(data)
      setStatus(t('config.backups.clipboardUnavailable'))
    }
    setTimeout(() => setStatus(''), 3000)
  }

  async function handleImport(): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(importText)
      if (!Array.isArray(parsed)) throw new Error(t('config.backups.invalidFormat'))
      const keys: Record<string, string> = {}
      parsed.forEach((r, i) => {
        if (r === null || typeof r !== 'object')
          throw new Error(`${t('config.backups.invalidFormat')} Row ${i + 1} is not an object.`)
        const row = r as Record<string, unknown>
        if (typeof row.key !== 'string' || typeof row.value !== 'string')
          throw new Error(
            `${t('config.backups.invalidFormat')} Row ${i + 1} must have "key" and "value" as strings.`
          )
        keys[row.key] = row.value
      })
      await onApplyPreset({
        label: 'Imported Backup',
        labelKey: '',
        description: 'User provided JSON backup',
        descKey: '',
        keys,
      })
      setStatus(t('config.backups.importSuccess'))
      setImportText('')
    } catch (e) {
      setStatus(`${t('config.backups.importFail')} ${e instanceof Error ? e.message : String(e)}`)
    }
    setTimeout(() => setStatus(''), 4000)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div
        className="hp-card"
        style={{
          background: 'var(--bg-widget)',
          border: '1px solid var(--border)',
          padding: '24px',
        }}
      >
        <div
          className="hp-section-title"
          style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, marginBottom: 20 }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'var(--accent-dim)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className="codicon codicon-cloud-download" style={{ color: 'var(--accent)' }} />
          </div>
          {t('config.backups.exportTitle')}
        </div>
        <p className="hp-muted" style={{ fontSize: 14, marginBottom: 24 }}>
          {t('config.backups.exportDesc')}
        </p>
        <button
          type="button"
          className="hp-btn hp-btn-primary"
          style={{ padding: '12px 24px', borderRadius: 10 }}
          onClick={() => void handleExport()}
        >
          {t('config.backups.exportBtn')}
        </button>
      </div>

      <div className="hp-card">
        <div className="hp-section-title">{t('config.backups.importTitle')}</div>
        <p className="hp-muted" style={{ fontSize: 13, marginBottom: 12 }}>
          {t('config.backups.importDesc')}
        </p>
        <textarea
          className="hp-input mono"
          style={{ minHeight: 120, fontSize: 11, marginBottom: 12 }}
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder='[{"key": "user.name", "value": "Jane Doe"}, ...]'
        />
        <button
          type="button"
          className="hp-btn"
          onClick={() => void handleImport()}
          disabled={!importText.trim()}
        >
          {t('config.backups.restoreBtn')}
        </button>
      </div>
      {status && <div className="hp-status-alert success">{status}</div>}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const NAV_ITEM_ICONS: { id: Section; icon: string }[] = [
  { id: 'overview', icon: 'dashboard' },
  { id: 'identity', icon: 'account' },
  { id: 'security', icon: 'shield' },
  { id: 'behavior', icon: 'settings-gear' },
  { id: 'inspector', icon: 'search' },
  { id: 'diagnostics', icon: 'heart' },
  { id: 'backups', icon: 'cloud-download' },
]

export function GitConfigPage(): ReactElement {
  const { t } = useTranslation('git')
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

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

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

  async function handleSaveIdentity(fields: {
    name: string
    email: string
    branch: string
    editor: string
  }): Promise<void> {
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
      showToast(t('config.identity.saved'))
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
    <div className="git-config-page elevated-page">
      {/* Header */}
      <header style={{ marginBottom: 4 }}>
        <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>
          {t('config.pageLabel')}
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>{t('config.pageTitle')}</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 10, maxWidth: 760, lineHeight: 1.5 }}>
          {t('config.pageDesc')}
        </p>
      </header>

      {/* Horizontal Tabs */}
      <nav className="git-config-tabs-wrap">
        {NAV_ITEM_ICONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            className={`git-config-tab ${section === item.id ? 'git-config-tab-active' : ''}`}
          >
            <span className={`codicon codicon-${item.icon}`} />
            <span>{t(`config.nav.${item.id}`)}</span>
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="git-config-content">
        {toast && (
          <div
            style={{
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
            }}
          >
            {toast.ok ? t('config.toast.ok') : t('config.toast.error')}
            {toast.msg}
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
          <BehaviorSection
            cfg={cfg}
            busy={busy}
            onSetKey={handleSetKey}
            onApplyPreset={handleApplyPreset}
          />
        )}
        {section === 'inspector' && <InspectorSection rows={rows} loading={loading} />}
        {section === 'diagnostics' && (
          <DiagnosticsSection cfg={cfg} busy={busy} onSetKey={handleSetKey} />
        )}
        {section === 'backups' && <BackupsSection rows={rows} onApplyPreset={handleApplyPreset} />}
      </main>
    </div>
  )
}
