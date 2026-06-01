export const btn = {
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.05)',
  color: 'var(--text)',
  borderRadius: 6,
  padding: '8px 16px',
  cursor: 'pointer',
  fontWeight: 600,
  transition: 'all 0.2s ease',
}
export const btnDanger = { ...btn, color: 'var(--red)' }
export const btnSmallDanger = { ...btn, color: 'var(--red)', padding: '6px 10px', fontSize: 13 }
