import type { ConnectedAccount, GitRemoteEntry } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'

import { classifyGitRemoteUrl, truncateMiddleUrl, type GitProviderFamily } from './gitVcsProviderHost'

const CARD: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '12px 14px',
  background: 'var(--bg-panel)',
  minHeight: 108,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

function accountFor(accounts: ConnectedAccount[], provider: 'github' | 'gitlab'): ConnectedAccount | undefined {
  return accounts.find((a) => a.provider === provider)
}

function remotesForFamily(remotes: GitRemoteEntry[], family: GitProviderFamily): GitRemoteEntry[] {
  if (family === 'other') return []
  return remotes.filter((r) => classifyGitRemoteUrl(r.fetchUrl) === family)
}

export type GitVcsProviderRailProps = {
  accounts: ConnectedAccount[]
  remotes: GitRemoteEntry[]
  /** Resolved remote name used for Fetch (matches toolbar). */
  activeFetchRemote: string
  hasRepo: boolean
  /** Card click: prefer switching Fetch to this host's remote; otherwise parent may navigate to Cloud Git. */
  onActivateProvider: (provider: 'github' | 'gitlab') => void
}

export function GitVcsProviderRail({
  accounts,
  remotes,
  activeFetchRemote,
  hasRepo,
  onActivateProvider,
}: GitVcsProviderRailProps): ReactElement {
  const gh = accountFor(accounts, 'github')
  const gl = accountFor(accounts, 'gitlab')
  const ghRemotes = remotesForFamily(remotes, 'github')
  const glRemotes = remotesForFamily(remotes, 'gitlab')
  const activeUrl = remotes.find((r) => r.name === activeFetchRemote)?.fetchUrl
  const activeFamily: GitProviderFamily = activeUrl ? classifyGitRemoteUrl(activeUrl) : 'other'

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 12,
      }}
    >
      <ProviderCard
        provider="github"
        title="GitHub"
        iconClass="codicon-github"
        accent={activeFamily === 'github'}
        account={gh}
        remotes={ghRemotes}
        hasRepo={hasRepo}
        activeFetchRemote={activeFetchRemote}
        activeHere={activeFamily === 'github'}
        onActivate={() => onActivateProvider('github')}
      />
      <ProviderCard
        provider="gitlab"
        title="GitLab"
        iconClass="codicon-source-control"
        accent={activeFamily === 'gitlab'}
        account={gl}
        remotes={glRemotes}
        hasRepo={hasRepo}
        activeFetchRemote={activeFetchRemote}
        activeHere={activeFamily === 'gitlab'}
        onActivate={() => onActivateProvider('gitlab')}
      />
    </div>
  )
}

function ProviderCard(props: {
  provider: 'github' | 'gitlab'
  title: string
  iconClass: string
  accent: boolean
  account: ConnectedAccount | undefined
  remotes: GitRemoteEntry[]
  hasRepo: boolean
  activeFetchRemote: string
  activeHere: boolean
  onActivate: () => void
}): ReactElement {
  const { provider, title, iconClass, accent, account, remotes, hasRepo, activeFetchRemote, activeHere, onActivate } =
    props
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onActivate()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onActivate()
        }
      }}
      aria-label={`${title}: use this host for fetch or open Cloud Git`}
      style={{
        ...CARD,
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
        boxShadow: accent ? '0 0 0 2px var(--cg-accent, var(--accent))' : undefined,
        borderColor: accent ? 'var(--cg-accent, var(--accent))' : undefined,
        background: accent ? 'var(--cg-surface-deep, var(--bg-panel))' : CARD.background,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span className={`codicon ${iconClass}`} style={{ fontSize: 18, opacity: 0.9, flexShrink: 0 }} aria-hidden />
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: 0.02 }}>{title}</span>
        </div>
        <Link
          to={`/git?tab=cloud&provider=${provider}`}
          className="mono"
          onClick={(e) => e.stopPropagation()}
          style={{ fontSize: 11, color: 'var(--cg-accent, var(--accent))', textDecoration: 'none', flexShrink: 0 }}
        >
          Cloud Git
        </Link>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>
        {account ? (
          <span>
            Signed in as <span style={{ color: 'var(--text)', fontWeight: 600 }}>@{account.username}</span>
          </span>
        ) : (
          <span>Not connected — HTTPS sync needs a token in Cloud Git.</span>
        )}
      </div>
      {!hasRepo ? (
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Open a repository below to list remotes for this host.
        </div>
      ) : remotes.length === 0 ? (
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          No remotes in this repo point here (SSH/HTTPS URL detection).
        </div>
      ) : (
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 12,
            color: 'var(--text)',
            lineHeight: 1.5,
            wordBreak: 'break-all',
          }}
        >
          {remotes.map((r) => (
            <li key={r.name} className="mono">
              <strong>{r.name}</strong>{' '}
              <span style={{ color: 'var(--text-muted)' }}>{truncateMiddleUrl(r.fetchUrl)}</span>
            </li>
          ))}
        </ul>
      )}
      {hasRepo && activeHere ? (
        <div className="mono" style={{ fontSize: 11, color: 'var(--cg-accent, var(--accent))', fontWeight: 600 }}>
          Fetch uses remote “{activeFetchRemote}” on this host.
        </div>
      ) : null}
    </div>
  )
}
