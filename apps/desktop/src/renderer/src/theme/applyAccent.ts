/** Default from `theme/global.css` :root when no override is set. */
export const DEFAULT_ACCENT_HEX = '#7c4dff'

const HEX = /^#[0-9A-Fa-f]{6}$/

/** Apply or clear `--accent` / `--accent-dim` on the document root (falls back to global.css when cleared). */
export function applyAppearanceAccent(hex: string | undefined): void {
  const root = document.documentElement
  if (!hex || !HEX.test(hex)) {
    root.style.removeProperty('--accent')
    root.style.removeProperty('--accent-dim')
    return
  }
  const r = Number.parseInt(hex.slice(1, 3), 16)
  const g = Number.parseInt(hex.slice(3, 5), 16)
  const b = Number.parseInt(hex.slice(5, 7), 16)
  root.style.setProperty('--accent', hex)
  root.style.setProperty('--accent-dim', `rgba(${r},${g},${b},0.35)`)
}
