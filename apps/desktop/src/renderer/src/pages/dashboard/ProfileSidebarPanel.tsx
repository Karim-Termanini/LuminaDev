import type { ReactElement } from 'react'
import type { DashboardMainViewModel } from './useDashboardMainPage'

export function ProfileSidebarPanel({ vm }: { vm: DashboardMainViewModel }): ReactElement {
  const { t } = vm
  return (
<div className="dashboard-sidebar">
        <h3
          style={{
            margin: '0 0 12px',
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          {t('main.sidebar.title')}
        </h3>
        <div className="profile-list">
          {vm.allProfiles.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
              {t('main.sidebar.empty')}
            </p>
          )}
          {vm.allProfiles.map((prof) => (
            <button
              key={prof.name}
              type="button"
              onClick={() => vm.setSelectedProfileName(prof.name)}
              className={`profile-list-item ${vm.selectedProfileName === prof.name ? 'active' : ''}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '10px 12px',
                border:
                  vm.selectedProfileName === prof.name
                    ? `1px solid ${prof.accent}`
                    : '1px solid var(--border)',
                borderRadius: 6,
                background:
                  vm.selectedProfileName === prof.name
                    ? `color-mix(in srgb, ${prof.accent} 8%, var(--bg-widget))`
                    : 'transparent',
                color: 'var(--text)',
                cursor: 'pointer',
                fontSize: 13,
                marginBottom: 8,
                transition: 'all 0.2s ease',
              }}
            >
              <span
                className={`codicon codicon-${prof.icon}`}
                style={{ fontSize: 16, color: prof.accent, flexShrink: 0 }}
              />
              <span
                style={{
                  flex: 1,
                  textAlign: 'left',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {prof.title}
              </span>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: vm.activeProfile === prof.name ? prof.accent : 'var(--border)',
                  flexShrink: 0,
                }}
              />
            </button>
          ))}
        </div>
      </div>
  )
}
