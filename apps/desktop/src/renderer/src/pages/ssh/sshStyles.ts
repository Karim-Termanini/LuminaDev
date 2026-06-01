import type { CSSProperties } from 'react'

export const stepCircle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 14,
  background: 'var(--accent)',
  color: '#000',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  fontSize: 14,
  flexShrink: 0,
}

export const stepTitle: CSSProperties = {
  margin: '0 0 4px 0',
  fontSize: 15,
  fontWeight: 600,
}

export const stepText: CSSProperties = {
  margin: '0 0 12px 0',
  fontSize: 13,
  color: 'var(--text-muted)',
  lineHeight: 1.4,
}

export const inputStyle: CSSProperties = {
  width: '100%',
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  padding: '8px 12px',
  borderRadius: 6,
  fontSize: 13,
}

export const area: CSSProperties = {
  ...inputStyle,
  minHeight: 60,
  fontFamily: 'monospace',
  fontSize: 12,
}
