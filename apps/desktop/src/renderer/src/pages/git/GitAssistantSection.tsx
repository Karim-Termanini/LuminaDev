import type { ReactElement, ReactNode } from 'react'

export type GitAssistantSectionProps = {
  id: string
  title: string
  subtitle?: ReactNode
  icon?: string
  children: ReactNode
  className?: string
}

export function GitAssistantSection({
  id,
  title,
  subtitle,
  icon,
  children,
  className = '',
}: GitAssistantSectionProps): ReactElement {
  return (
    <section
      className={`git-assistant-card ${className}`.trim()}
      aria-labelledby={id}
    >
      <header className="git-assistant-card-head">
        {icon ? (
          <span className="git-assistant-card-icon" aria-hidden>
            <span className={`codicon codicon-${icon}`} />
          </span>
        ) : null}
        <div style={{ minWidth: 0 }}>
          <h2 id={id} className="git-assistant-card-title">
            {title}
          </h2>
          {subtitle != null && subtitle !== '' ? (
            <div className="git-assistant-card-desc">{subtitle}</div>
          ) : null}
        </div>
      </header>
      <div>{children}</div>
    </section>
  )
}
