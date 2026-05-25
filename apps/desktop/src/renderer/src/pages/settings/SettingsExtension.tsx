import type { ReactElement } from 'react'
export function SettingsExtension(): ReactElement {
  return (
    <div style={{ paddingTop: 12, textAlign: 'center' }}>
      <span className="codicon codicon-extensions" style={{ fontSize: 32, opacity: 0.4, marginBottom: 12, display: 'block' }} aria-hidden />
      <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>Coming in a future release</p>
      <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-muted)', maxWidth: 320, marginInline: 'auto' }}>Plugin management and marketplace (Phase 10).</p>
    </div>
  )
}
