import type { ReactElement } from 'react'
import './RuntimesPage.css'
import { RuntimeDetailPanel } from './runtimes/RuntimeDetailPanel'
import { RuntimeInstallWizard } from './runtimes/RuntimeInstallWizard'
import { RuntimeSidebar } from './runtimes/RuntimeSidebar'
import { RuntimeUninstallModal } from './runtimes/RuntimeUninstallModal'
import { useRuntimesPage } from './runtimes/useRuntimesPage'

const pageShellStyle = {
  display: 'flex',
  height: 'calc(100vh - 120px)',
  overflow: 'hidden',
  position: 'relative',
} as const

const mainStyle = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-main)',
  overflowY: 'auto',
} as const

export function RuntimesPage(): ReactElement {
  const vm = useRuntimesPage()

  return (
    <div className="runtimes-page elevated-page" style={pageShellStyle}>
      <RuntimeSidebar vm={vm} />

      <main style={mainStyle}>
        {vm.errorMessage && (
          <div
            style={{
              padding: '12px 20px',
              background: 'rgba(255, 82, 82, 0.1)',
              borderBottom: '1px solid rgba(255, 82, 82, 0.2)',
              color: '#ff8a80',
              fontSize: 13,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="codicon codicon-error" />
              {vm.errorMessage}
            </div>
            <button
              onClick={() => vm.setErrorMessage(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#ff8a80',
                cursor: 'pointer',
                fontSize: 16,
              }}
            >
              ×
            </button>
          </div>
        )}

        {vm.selectedRuntime && !vm.showWizard ? (
          <RuntimeDetailPanel vm={vm} selectedRuntime={vm.selectedRuntime} />
        ) : vm.showWizard ? (
          <RuntimeInstallWizard vm={vm} />
        ) : (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
            }}
          >
            {vm.t('page.selectPrompt')}
          </div>
        )}
      </main>

      {vm.showUninstallModal && vm.selectedRuntime && (
        <RuntimeUninstallModal vm={vm} selectedRuntime={vm.selectedRuntime} />
      )}
    </div>
  )
}
