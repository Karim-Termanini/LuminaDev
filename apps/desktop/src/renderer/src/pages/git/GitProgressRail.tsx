import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import type { GitProgressRailState, GitProgressStep } from '../gitAssistantProgressRail'

const STEPS: GitProgressStep[] = ['setup', 'project', 'save', 'share']

const LABEL_KEYS: Record<GitProgressStep, string> = {
  setup: 'assistant.rail.setup',
  project: 'assistant.rail.project',
  save: 'assistant.rail.save',
  share: 'assistant.rail.share',
}

const STEP_ICONS: Record<GitProgressStep, string> = {
  setup: 'settings-gear',
  project: 'folder',
  save: 'save',
  share: 'cloud-upload',
}

export type GitProgressRailProps = {
  rail: GitProgressRailState
  onStepClick?: (step: GitProgressStep) => void
}

export function GitProgressRail({ rail, onStepClick }: GitProgressRailProps): ReactElement {
  const { t } = useTranslation('git')

  return (
    <div className="git-assistant-rail-wrap" role="navigation" aria-label={t('assistant.rail.aria')}>
      <div className="git-assistant-rail-inner">
        <p className="git-assistant-rail-hint">{t('assistant.rail.hint')}</p>
        <div className="git-assistant-rail-steps">
          {STEPS.map((step) => {
            const complete = rail[step] === 'complete'
            const active = rail.active === step
            const classes = [
              'git-assistant-rail-step',
              complete ? 'is-complete' : '',
              active ? 'is-active' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <button
                key={step}
                type="button"
                className={classes}
                onClick={() => onStepClick?.(step)}
                aria-current={active ? 'step' : undefined}
              >
                <span className="git-assistant-rail-dot" aria-hidden />
                <span className={`codicon codicon-${STEP_ICONS[step]}`} aria-hidden />
                {t(LABEL_KEYS[step])}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
