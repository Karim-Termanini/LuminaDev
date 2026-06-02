import type { CSSProperties, ReactElement } from 'react'

/** Primary Git term with optional beginner sub-label (Stack Overflow–friendly). */
export function GitDualLabel(props: {
  primary: string
  sub?: string
  style?: CSSProperties
  inline?: boolean
}): ReactElement {
  return (
    <span
      className="git-dual-label"
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: props.inline ? 'center' : 'flex-start',
        gap: 2,
        ...props.style,
      }}
    >
      <span className="git-dual-label-primary">{props.primary}</span>
      {props.sub ? <span className="git-dual-label-sub">{props.sub}</span> : null}
    </span>
  )
}
