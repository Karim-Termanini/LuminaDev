import type { ReactElement, ReactNode } from 'react'

export function SettingsStack({ children }: { children: ReactNode }): ReactElement {
  return <div className="settings-stack">{children}</div>
}

export function SettingsCard({
  title,
  description,
  children,
  className,
}: {
  title?: string
  description?: string
  children: ReactNode
  className?: string
}): ReactElement {
  return (
    <section className={`settings-card${className ? ` ${className}` : ''}`}>
      {title || description ? (
        <header className="settings-card-header">
          {title ? <h3>{title}</h3> : null}
          {description ? <p>{description}</p> : null}
        </header>
      ) : null}
      <div className="settings-card-body">{children}</div>
    </section>
  )
}

export function SettingsRow({
  label,
  description,
  children,
  last,
}: {
  label: string
  description?: string
  children: ReactNode
  last?: boolean
}): ReactElement {
  return (
    <div className={`settings-row${last ? ' settings-row-last' : ''}`}>
      <div className="settings-row-text">
        <div className="settings-row-label">{label}</div>
        {description ? <p className="settings-row-desc">{description}</p> : null}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  )
}

export function SettingsToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`settings-toggle${checked ? ' is-on' : ''}`}
      onClick={() => {
        if (!disabled) onChange(!checked)
      }}
    />
  )
}

export function SettingsSegmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: ReadonlyArray<{ value: T; label: string; icon?: string }>
  onChange: (v: T) => void
}): ReactElement {
  return (
    <div className="settings-segmented" role="group">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            className={`settings-segmented-btn${active ? ' active' : ''}`}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon ? <span className={`codicon codicon-${opt.icon}`} aria-hidden /> : null}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export function SettingsActions({ children }: { children: ReactNode }): ReactElement {
  return <div className="settings-actions">{children}</div>
}

export function SettingsFeedback({
  tone,
  children,
}: {
  tone: 'success' | 'error' | 'info' | 'muted'
  children: ReactNode
}): ReactElement {
  return <p className={`settings-feedback settings-feedback-${tone}`}>{children}</p>
}

export function SettingsDataTable({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="settings-data-table-wrap">
      <table className="settings-data-table">{children}</table>
    </div>
  )
}

export function SettingsGrid({ children }: { children: ReactNode }): ReactElement {
  return <div className="settings-grid-2">{children}</div>
}
