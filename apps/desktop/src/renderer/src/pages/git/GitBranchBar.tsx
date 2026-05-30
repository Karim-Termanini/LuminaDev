import type { BranchEntry } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { GitDualLabel } from './gitDualLabel'
import { GitAssistantSection } from './GitAssistantSection'

export type GitBranchBarProps = {
  branches: BranchEntry[]
  currentBranch: string
  busy: boolean
  onCheckout: (name: string) => void
  onCreateBranch: (name: string) => void
}

export function GitBranchBar({
  branches,
  currentBranch,
  busy,
  onCheckout,
  onCreateBranch,
}: GitBranchBarProps): ReactElement {
  const { t } = useTranslation('git')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  const locals = branches.filter((b) => !b.remote).sort((a, b) => a.name.localeCompare(b.name))

  return (
    <GitAssistantSection
      id="git-branch-heading"
      title={t('assistant.branch.sectionTitle')}
      subtitle={t('assistant.branch.sectionSubtitle')}
      icon="source-control"
    >
      <div className="hp-row-wrap">
        <select
          key={currentBranch}
          className="hp-input mono"
          value={currentBranch}
          disabled={busy || locals.length === 0}
          onChange={(e) => {
            const name = e.target.value
            if (name && name !== currentBranch) onCheckout(name)
          }}
          style={{ flex: '1 1 200px', minWidth: 160 }}
          aria-label={t('assistant.branch.primary')}
        >
          {locals.length === 0 ? (
            <option value={currentBranch}>{currentBranch || t('assistant.branch.none')}</option>
          ) : (
            locals.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
                {b.current ? ' *' : ''}
              </option>
            ))
          )}
        </select>
        {creating ? (
          <>
            <input
              className="hp-input mono"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('branch.newPlaceholder')}
              disabled={busy}
              style={{ flex: '1 1 140px' }}
            />
            <button
              type="button"
              className="hp-btn hp-btn-primary"
              disabled={busy || !newName.trim()}
              onClick={() => {
                onCreateBranch(newName.trim())
                setCreating(false)
                setNewName('')
              }}
            >
              {t('branch.create')}
            </button>
            <button type="button" className="hp-btn" disabled={busy} onClick={() => setCreating(false)}>
              {t('pr.cancel')}
            </button>
          </>
        ) : (
          <button type="button" className="hp-btn" disabled={busy} onClick={() => setCreating(true)}>
            <GitDualLabel
              primary={t('assistant.branch.createPrimary')}
              sub={t('assistant.branch.createSub')}
              inline
            />
          </button>
        )}
      </div>
    </GitAssistantSection>
  )
}
