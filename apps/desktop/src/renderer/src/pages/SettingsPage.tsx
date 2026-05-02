import type { ReactElement } from 'react'

/** Phase 8 shell: bookmarks, hosts, env, theme will ship incrementally (see `phasesPlan.md`). */
export function SettingsPage(): ReactElement {
  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, marginBottom: 8 }}>
        SETTINGS
      </div>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Settings</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.55, fontSize: 15 }}>
        Placeholder for Phase 8: SSH bookmarks, hosts editor, profile-scoped environment variables, and theme controls.
        Nothing here persists yet beyond this screen copy.
      </p>
    </div>
  )
}
