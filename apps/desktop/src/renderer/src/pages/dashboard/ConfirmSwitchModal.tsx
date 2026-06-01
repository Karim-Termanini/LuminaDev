import type { ReactElement } from 'react'
import type { DashboardMainViewModel } from './useDashboardMainPage'

export function ConfirmSwitchModal({ vm }: { vm: DashboardMainViewModel }): ReactElement | null {
  const { t } = vm
  if (!vm.confirmModalOpen || !vm.selectedProfile) return null
  return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.7)',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'var(--bg-widget)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            }}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 700 }}>
              {t('main.confirm.title')}
            </h3>
            <p
              style={{
                margin: '0 0 20px',
                color: 'var(--text-muted)',
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              {vm.activeProfile ? (
                <>
                  {t('main.confirm.composeDown')}{' '}
                  <strong style={{ color: 'var(--text)' }}>{vm.activeProfile}</strong>,{' '}
                  {t('main.confirm.thenStart')}{' '}
                  <strong style={{ color: 'var(--text)' }}>{vm.selectedProfile.title}</strong>?
                </>
              ) : (
                <>
                  {t('main.confirm.start')}{' '}
                  <strong style={{ color: 'var(--text)' }}>{vm.selectedProfile.title}</strong>?
                </>
              )}
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                onClick={() => vm.setConfirmModalOpen(false)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  background: 'transparent',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {t('main.confirm.cancel')}
              </button>
              <button
                type="button"
                onClick={vm.handleConfirmSwitch}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  border: 'none',
                  borderRadius: 6,
                  background: vm.selectedProfile.accent,
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {t('main.confirm.confirm')}
              </button>
            </div>
          </div>
        </div>
  )
}
