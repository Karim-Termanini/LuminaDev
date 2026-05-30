import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import type { GitSetupChecklistItem, GitSetupChecklistItemId } from '../gitAssistantSetup'
import { GitAssistantSection } from './GitAssistantSection'
import { GitSetupDoctorPanel } from './GitSetupDoctorPanel'

const ITEM_KEYS: Record<GitSetupChecklistItemId, string> = {
  identity: 'assistant.setup.identity',
  credential: 'assistant.setup.credential',
  cloud: 'assistant.setup.cloud',
  defaultBranch: 'assistant.setup.defaultBranch',
}

export type GitSetupChecklistProps = {
  items: GitSetupChecklistItem[]
  connectAccountsHref: string
  busy: boolean
  onSetIdentity: () => void
  onSetCredentialHelper: () => void
  onSetDefaultBranch: () => void
  onSetConfigKey: (key: string, value: string) => Promise<void>
  onReloadSetup: () => Promise<void>
}

export function GitSetupChecklist({
  items,
  connectAccountsHref,
  busy,
  onSetIdentity,
  onSetCredentialHelper,
  onSetDefaultBranch,
  onSetConfigKey,
  onReloadSetup,
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
                connectAccountsHref={connectAccountsHref}
                busy={busy}
                onSetIdentity={onSetIdentity}
                onSetCredentialHelper={onSetCredentialHelper}
                onSetDefaultBranch={onSetDefaultBranch}
              />
            ) : null}
          </li>
        ))}
      </ul>
      <GitSetupDoctorPanel busy={busy} onSetConfigKey={onSetConfigKey} onReloadSetup={onReloadSetup} />
    </GitAssistantSection>
  )
}

function FixButton(props: {
  id: GitSetupChecklistItemId
  connectAccountsHref: string
  busy: boolean
  onSetIdentity: () => void
  onSetCredentialHelper: () => void
  onSetDefaultBranch: () => void
}): ReactElement {
  const { t } = useTranslation('git')

  if (props.id === 'cloud') {
    return (
      <Link
        to={props.connectAccountsHref}
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
