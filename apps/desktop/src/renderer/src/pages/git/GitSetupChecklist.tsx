import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import type { GitSetupChecklistItem, GitSetupChecklistItemId } from '../gitAssistantSetup'
import { settingsAccountsHref } from '../settingsAccountsHref'
import { GitAssistantSection } from './GitAssistantSection'

const ITEM_KEYS: Record<GitSetupChecklistItemId, string> = {
  identity: 'assistant.setup.identity',
  credential: 'assistant.setup.credential',
  github: 'assistant.setup.github',
  defaultBranch: 'assistant.setup.defaultBranch',
}

export type GitSetupChecklistProps = {
  items: GitSetupChecklistItem[]
  busy: boolean
  onSetIdentity: () => void
  onSetCredentialHelper: () => void
  onSetDefaultBranch: () => void
}

export function GitSetupChecklist({
  items,
  busy,
  onSetIdentity,
  onSetCredentialHelper,
  onSetDefaultBranch,
}: GitSetupChecklistProps): ReactElement {
  const { t } = useTranslation('git')

  return (
    <GitAssistantSection
      id="git-setup-heading"
      title={t('assistant.setup.title')}
      subtitle={t('assistant.setup.subtitle')}
      icon="settings-gear"
    >
      <ul className="git-assistant-checklist">
        {items.map((item) => (
          <li
            key={item.id}
            className={`git-assistant-checklist-row ${item.ok ? 'is-ok' : ''}`.trim()}
          >
            <span className="git-assistant-checklist-status">
              <span
                className={`codicon ${item.ok ? 'codicon-check' : 'codicon-warning'}`}
                aria-hidden
              />
              {t(ITEM_KEYS[item.id])}
            </span>
            {!item.ok ? (
              <FixButton
                id={item.id}
                busy={busy}
                onSetIdentity={onSetIdentity}
                onSetCredentialHelper={onSetCredentialHelper}
                onSetDefaultBranch={onSetDefaultBranch}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </GitAssistantSection>
  )
}

function FixButton(props: {
  id: GitSetupChecklistItemId
  busy: boolean
  onSetIdentity: () => void
  onSetCredentialHelper: () => void
  onSetDefaultBranch: () => void
}): ReactElement {
  const { t } = useTranslation('git')

  if (props.id === 'github') {
    return (
      <Link
        to={settingsAccountsHref('github')}
        className="hp-btn hp-btn-primary"
        style={{ fontSize: 12, textDecoration: 'none' }}
      >
        <span className="codicon codicon-link" aria-hidden />
        {t('assistant.setup.fixConnect')}
      </Link>
    )
  }

  const onClick =
    props.id === 'identity'
      ? props.onSetIdentity
      : props.id === 'credential'
        ? props.onSetCredentialHelper
        : props.onSetDefaultBranch

  return (
    <button type="button" className="hp-btn" disabled={props.busy} onClick={() => void onClick()} style={{ fontSize: 12 }}>
      {t('assistant.setup.fixNow')}
    </button>
  )
}
