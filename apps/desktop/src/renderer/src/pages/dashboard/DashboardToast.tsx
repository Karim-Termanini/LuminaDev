import type { ReactElement } from 'react'
import type { DashboardMainViewModel } from './useDashboardMainPage'

export function DashboardToast({ vm }: { vm: DashboardMainViewModel }): ReactElement | null {
  if (!vm.toast) return null
  return (
    <div
      style={{
        position: 'fixed',
        top: 24,
        right: 24,
        background: vm.toast.type === 'success' ? 'var(--green)' : 'var(--orange)',
        color: '#fff',
        padding: '12px 16px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
        zIndex: 2000,
        animation: 'slideInRight 0.3s ease-out',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        maxWidth: vm.toast.type === 'error' ? 480 : 320,
      }}
    >
      <span
        className={`codicon ${vm.toast.type === 'success' ? 'codicon-check' : 'codicon-error'}`}
        style={{ fontSize: 16, flexShrink: 0 }}
      />
      <span style={{ flex: 1, wordBreak: 'break-word', lineHeight: 1.45 }}>{vm.toast.message}</span>
      <button
        type="button"
        onClick={() => vm.setToast(null)}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          padding: 4,
          display: 'flex',
          opacity: 0.7,
          flexShrink: 0,
          marginLeft: 8,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '1'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '0.7'
        }}
      >
        <span className="codicon codicon-close" style={{ fontSize: 16 }} />
      </button>
    </div>
  )
}
