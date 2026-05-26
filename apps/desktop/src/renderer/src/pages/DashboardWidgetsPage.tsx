import type { ReactElement } from 'react'

export function DashboardWidgetsPage(): ReactElement {
  return (
    <div style={{ padding: 32, color: 'var(--text)' }}>
      <h2 style={{ margin: '0 0 8px', fontWeight: 700 }}>Widget Management</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
        Widget customization is coming in a future release.
      </p>
    </div>
  )
}
