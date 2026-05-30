import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import type { GitVcsOperation } from './GitVcsStateBanner'
import type { GitVcsNextAction } from './gitVcsNextAction'

export type GitVcsFlowHintsProps = {
  gitOperation: GitVcsOperation
  conflictFileCount: number
  stagedCount: number
  unstagedCount: number
  ahead: number | null
  behind: number | null
  nextAction: GitVcsNextAction
  /** Beginner layout: one-line next step only (no numbered playbook). */
  compact?: boolean
}

const CHIP: CSSProperties = {
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: 8,
  background: 'rgba(105, 240, 174, 0.2)',
  border: '1px solid rgba(105, 240, 174, 0.75)',
  color: '#c8e6c9',
  fontWeight: 700,
  fontSize: 13,
  verticalAlign: 'middle',
}

function NextChip({ children }: { children?: ReactNode }): ReactElement {
  return <span style={CHIP}>{children}</span>
}

function Ol({ children }: { children: ReactNode }): ReactElement {
  return (
    <ol
      style={{
        margin: '10px 0 0',
        paddingLeft: 22,
        fontSize: 13,
        lineHeight: 1.55,
        color: 'var(--text-muted)',
      }}
    >
      {children}
    </ol>
  )
}

function nextLead(nextAction: GitVcsNextAction, compact: boolean): ReactElement | null {
  if (!nextAction) return null
  if (nextAction === 'resolution_studio') {
    return (
      <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--text)' }}>
        <span className="codicon codicon-debug-step-into" style={{ marginRight: 8, color: '#69f0ae' }} aria-hidden />
        <Trans i18nKey="flow.lead.resolutionStudio" ns="git" components={{ chip: <NextChip />, chip5: <NextChip /> }} />
      </p>
    )
  }
  if (nextAction === 'continue_merge') {
    return (
      <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--text)' }}>
        <span className="codicon codicon-debug-step-into" style={{ marginRight: 8, color: '#69f0ae' }} aria-hidden />
        <Trans i18nKey="flow.lead.continueMerge" ns="git" components={{ chip: <NextChip /> }} />
      </p>
    )
  }
  if (nextAction === 'pull') {
    return (
      <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--text)' }}>
        <span className="codicon codicon-debug-step-into" style={{ marginRight: 8, color: '#69f0ae' }} aria-hidden />
        <Trans
          i18nKey={compact ? 'flow.lead.pullSimple' : 'flow.lead.pull'}
          ns="git"
          components={{ chip: <NextChip /> }}
        />
      </p>
    )
  }
  if (nextAction === 'commit_message') {
    return (
      <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--text)' }}>
        <span className="codicon codicon-debug-step-into" style={{ marginRight: 8, color: '#69f0ae' }} aria-hidden />
        <Trans
          i18nKey={compact ? 'flow.lead.commitMessageSimple' : 'flow.lead.commitMessage'}
          ns="git"
          components={{ chip: <NextChip />, chip5: <NextChip /> }}
        />
      </p>
    )
  }
  if (nextAction === 'commit') {
    return (
      <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--text)' }}>
        <span className="codicon codicon-debug-step-into" style={{ marginRight: 8, color: '#69f0ae' }} aria-hidden />
        <Trans
          i18nKey={compact ? 'flow.lead.commitSimple' : 'flow.lead.commit'}
          ns="git"
          components={{ chip: <NextChip /> }}
        />
      </p>
    )
  }
  if (nextAction === 'push') {
    return (
      <p style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--text)' }}>
        <span className="codicon codicon-debug-step-into" style={{ marginRight: 8, color: '#69f0ae' }} aria-hidden />
        <Trans
          i18nKey={compact ? 'flow.lead.pushSimple' : 'flow.lead.push'}
          ns="git"
          components={{ chip: <NextChip /> }}
        />
      </p>
    )
  }
  return null
}

export function GitVcsFlowHints({
  gitOperation,
  conflictFileCount,
  stagedCount,
  unstagedCount,
  ahead,
  behind,
  nextAction,
  compact = false,
}: GitVcsFlowHintsProps): ReactElement {
  const { t } = useTranslation('git')
  const behindRemote = behind != null && behind > 0
  const aheadOfRemote = ahead != null && ahead > 0

  let title: string
  let body: ReactElement

  const chipMap = { chip: <NextChip />, chip3: <NextChip />, chip4: <NextChip />, chip5: <NextChip />, chip7: <NextChip />, chip8: <NextChip />, chip9: <NextChip />, chip10: <NextChip />, bold: <strong />, bold2: <strong />, mono6: <span className="mono" /> }

  if (conflictFileCount > 0) {
    title = t('flow.title.conflicts')
    body = compact ? (
      <></>
    ) : (
      <Ol>
        <li><Trans i18nKey="flow.body.conflict1" ns="git" components={{ chip: <NextChip /> }} /></li>
        <li><Trans i18nKey="flow.body.conflict2" ns="git" components={{ chip: <NextChip /> }} /></li>
        {gitOperation === 'none' ? (
          <li><Trans i18nKey="flow.body.conflict3" ns="git" components={{ chip: <NextChip />, chip3: <NextChip /> }} /></li>
        ) : null}
      </Ol>
    )
  } else if (gitOperation === 'merging' || gitOperation === 'rebasing') {
    title = t('flow.title.operation', { op: gitOperation === 'merging' ? t('integrate.merge').toLowerCase() : t('integrate.rebase').toLowerCase() })
    body = compact ? (
      <></>
    ) : (
      <Ol>
        <li><Trans i18nKey="flow.body.operation1" ns="git" components={{}} /></li>
        <li><Trans i18nKey="flow.body.operation2" ns="git" values={{ op: gitOperation === 'merging' ? t('integrate.merge').toLowerCase() : t('integrate.rebase').toLowerCase() }} components={{ bold: <strong /> }} /></li>
      </Ol>
    )
  } else {
    title = compact ? t('flow.title.simple') : t('flow.title.e2e')
    body = compact ? (
      <></>
    ) : (
      <Ol>
        <li><Trans i18nKey="flow.body.line1" ns="git" components={chipMap} /></li>
        <li><Trans i18nKey="flow.body.line2" ns="git" components={chipMap} /></li>
        <li><Trans i18nKey="flow.body.line3" ns="git" components={chipMap} /></li>
        {behindRemote ? (
          <li style={{ color: '#ffb74d' }}><Trans i18nKey="flow.body.line4Behind" ns="git" values={{ behind }} components={chipMap} /></li>
        ) : null}
        {aheadOfRemote && !behindRemote ? (
          <li><Trans i18nKey="flow.body.line4Ahead" ns="git" values={{ ahead }} components={chipMap} /></li>
        ) : null}
        {ahead != null && behind != null && ahead === 0 && behind === 0 ? (
          <li style={{ color: 'var(--text-muted)' }}><Trans i18nKey="flow.body.line4Even" ns="git" components={chipMap} /></li>
        ) : null}
        <li><Trans i18nKey="flow.body.line5" ns="git" components={chipMap} /></li>
        <li><Trans i18nKey="flow.body.line6" ns="git" components={{}} /></li>
      </Ol>
    )
  }

  const lead = nextLead(nextAction, compact)

  const extra =
    !compact &&
    nextAction !== 'commit_message' &&
    nextAction !== 'commit' &&
    stagedCount === 0 &&
    unstagedCount > 0 &&
    conflictFileCount === 0 &&
    gitOperation === 'none' ? (
      <p className="hp-muted" style={{ margin: '10px 0 0', fontSize: 12, lineHeight: 1.45 }}>
        <span className="codicon codicon-info" style={{ marginRight: 6, opacity: 0.85 }} aria-hidden />
        <Trans i18nKey="flow.extra.stageInfo" ns="git" components={chipMap} />
      </p>
    ) : null

  return (
    <section
      className="hp-card"
      aria-label="Workflow hints"
      style={{
        padding: compact ? '12px 14px' : '14px 16px',
        borderColor: 'color-mix(in srgb, var(--accent) 22%, var(--border))',
        background: 'color-mix(in srgb, var(--accent) 6%, var(--bg-widget))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span
          className="codicon codicon-map"
          style={{ fontSize: 18, color: 'var(--cg-accent, var(--accent))', flexShrink: 0, marginTop: 1 }}
          aria-hidden
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 650, fontSize: 14, color: 'var(--text)', marginBottom: 2 }}>{title}</div>
          {lead}
          {body}
          {extra}
        </div>
      </div>
    </section>
  )
}
