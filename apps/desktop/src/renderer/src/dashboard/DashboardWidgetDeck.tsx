import type { DashboardLayoutFile, DashboardPlacement } from '@linux-dev-home/shared'
import { getWidgetDefinition } from '@linux-dev-home/shared'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'

export function DashboardWidgetDeck(props: {
  layout: DashboardLayoutFile
  onRemove: (instanceId: string) => void
  /** `comfortable` = shell rail under top bar (larger type + min card width). */
  density?: 'compact' | 'comfortable'
  heading?: string
}): ReactElement {
  const density = props.density ?? 'compact'
  const comfortable = density === 'comfortable'
  const heading = props.heading ?? 'Your widgets'

  return (
    <section style={{ marginTop: comfortable ? 0 : 8 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: comfortable ? 14 : 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: comfortable ? 18 : 16, fontWeight: 700 }}>{heading}</h2>
        <span className="mono" style={{ fontSize: comfortable ? 12 : 11, color: 'var(--text-muted)' }}>
          {props.layout.placements.length} / 24
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: comfortable
            ? 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))'
            : 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))',
          gap: comfortable ? 20 : 14,
        }}
      >
        {props.layout.placements.map((p) => (
          <WidgetTile
            key={p.instanceId}
            placement={p}
            comfortable={comfortable}
            onRemove={() => props.onRemove(p.instanceId)}
          />
        ))}
      </div>
    </section>
  )
}

function WidgetTile(props: {
  placement: DashboardPlacement
  comfortable: boolean
  onRemove: () => void
}): ReactElement {
  const c = props.comfortable
  const fs = (t: number) => (c ? t + 2 : t)

  const def = getWidgetDefinition(props.placement.widgetTypeId)
  const title = def?.title ?? props.placement.widgetTypeId
  const desc = def?.description ?? 'Unknown widget type'

  let body: ReactElement
  switch (props.placement.widgetTypeId) {
    case 'link.workstation':
      body = (
        <Link to="/workstation" style={{ color: 'var(--accent)', fontWeight: 600, fontSize: fs(13) }}>
          Open workstation →
        </Link>
      )
      break
    case 'link.system':
      body = (
        <Link to="/system" style={{ color: 'var(--accent)', fontWeight: 600, fontSize: fs(13) }}>
          Open system →
        </Link>
      )
      break
    case 'static.docker-permission-hint':
      body = (
        <p style={{ margin: 0, fontSize: fs(13), color: 'var(--text-muted)', lineHeight: c ? 1.55 : 1.45 }}>
          Grant Docker socket access for your Flatpak build, or run natively for full engine access. See the banner
          link for details.
        </p>
      )
      break
    case 'static.host-trust-hint':
      body = (
        <p style={{ margin: 0, fontSize: fs(13), color: 'var(--text-muted)', lineHeight: c ? 1.55 : 1.45 }}>
          Prefer user-level installers (rustup, nvm, pipx) when sandboxed. System packages need a trusted host session
          or elevated installer flows (planned).
        </p>
      )
      break
    case 'custom.placeholder':
      body = (
        <p style={{ margin: 0, fontSize: fs(13), color: 'var(--text-muted)', lineHeight: c ? 1.55 : 1.45 }}>
          Placeholder for Phase 1 custom profiles and user-defined widget packs.
        </p>
      )
      break
    default:
      body = (
        <p style={{ margin: 0, fontSize: fs(13), color: 'var(--orange)' }}>
          Unregistered widget type. Remove and add again from the registry.
        </p>
      )
  }

  return (
    <article
      style={{
        background: 'var(--bg-widget)',
        border: '1px solid var(--border)',
        borderRadius: c ? 12 : 'var(--radius)',
        padding: c ? 22 : 14,
        display: 'flex',
        flexDirection: 'column',
        gap: c ? 12 : 8,
        minHeight: c ? 200 : 120,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div>
          <div className="mono" style={{ fontSize: c ? 11 : 10, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
            {props.placement.instanceId}
          </div>
          <div style={{ fontWeight: 700, fontSize: c ? 18 : 15, marginTop: 4 }}>{title}</div>
        </div>
        <button
          type="button"
          onClick={props.onRemove}
          title="Remove widget"
          style={{
            border: '1px solid var(--border)',
            background: c ? 'var(--bg-input)' : 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: c ? 13 : 12,
            padding: c ? '6px 12px' : '4px 8px',
            borderRadius: 6,
            flexShrink: 0,
          }}
        >
          Remove
        </button>
      </div>
      <p style={{ margin: 0, fontSize: fs(13), color: 'var(--text-muted)', flex: 1, lineHeight: c ? 1.5 : 1.4 }}>
        {desc}
      </p>
      {body}
    </article>
  )
}
