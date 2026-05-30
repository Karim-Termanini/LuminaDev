import type { CSSProperties, ReactElement } from 'react'
import type { TFunction } from 'i18next'

export function gitVcsProModeToggleStyle(proMode: boolean): CSSProperties {
  const accent = 'var(--cg-accent, var(--accent))'
  if (proMode) {
    return {
      borderColor: `color-mix(in srgb, ${accent} 50%, var(--border))`,
      background: `color-mix(in srgb, ${accent} 16%, var(--bg-panel))`,
      color: 'var(--text)',
      fontWeight: 600,
      boxShadow: `0 0 0 1px color-mix(in srgb, ${accent} 30%, transparent)`,
      flexShrink: 0,
      alignSelf: 'flex-start',
      marginTop: 2,
    }
  }
  return {
    borderColor: `color-mix(in srgb, ${accent} 75%, var(--border))`,
    background: `color-mix(in srgb, ${accent} 22%, var(--bg-panel))`,
    color: accent,
    fontWeight: 650,
    boxShadow: `0 0 0 2px color-mix(in srgb, ${accent} 35%, transparent), 0 0 16px color-mix(in srgb, ${accent} 18%, transparent)`,
    flexShrink: 0,
    alignSelf: 'flex-start',
    marginTop: 2,
  }
}

type GitVcsProModeToggleProps = {
  proMode: boolean
  toggling: boolean
  onToggle: () => void
  t: TFunction<'git'>
}

export function GitVcsProModeToggle({
  proMode,
  toggling,
  onToggle,
  t,
}: GitVcsProModeToggleProps): ReactElement {
  return (
    <button
      type="button"
      className="hp-btn"
      disabled={toggling}
      aria-pressed={proMode}
      onClick={onToggle}
      title={proMode ? t('toolbar.switchToSimple') : t('toolbar.switchToPro')}
      style={gitVcsProModeToggleStyle(proMode)}
    >
      <span
        className="codicon codicon-beaker"
        style={{ marginRight: 6, fontSize: 14, opacity: proMode ? 0.9 : 1 }}
        aria-hidden
      />
      {proMode ? t('toolbar.useSimpleMode') : t('toolbar.enableProMode')}
    </button>
  )
}
