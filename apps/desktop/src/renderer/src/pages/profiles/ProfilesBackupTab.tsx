import type { ReactElement } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { TEMPLATE_ICONS } from './constants'
import { btn, btnDanger } from './profilesStyles'
import type { ProfilesPageViewModel } from './useProfilesPage'

export function ProfilesBackupTab({ vm }: { vm: ProfilesPageViewModel }): ReactElement {
  const { t } = vm
  return (

        <section style={{ padding: '16px 0' }}>
          <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 20 }}>{t('backup.title')}</div>
          <p
            style={{
              margin: '0 0 24px',
              fontSize: 14,
              color: 'var(--text-muted)',
              lineHeight: 1.6,
              maxWidth: 800,
            }}
          >
            {t('backup.subtitle')}
          </p>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <button
              type="button"
              style={{ ...btn, display: 'flex', alignItems: 'center', gap: 8 }}
              onClick={() => void vm.load()}
            >
              <span className="codicon codicon-refresh" /> {t('btn.refresh')}
            </button>
            <button
              type="button"
              style={{ ...btn, display: 'flex', alignItems: 'center', gap: 8 }}
              onClick={() => void vm.exportJson()}
            >
              <span className="codicon codicon-export" /> {t('btn.exportJson')}
            </button>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              style={{ ...btnDanger, display: 'flex', alignItems: 'center', gap: 8 }}
              onClick={async () => {
                // Stop all running compose stacks before clearing vm.profiles
                for (const p of vm.profiles) {
                  await invoke('ipc_invoke', {
                    channel: 'dh:compose:down',
                    payload: { profile: p.name },
                  }).catch(() => {})
                }
                await vm.save([], t('msg.cleared'))
              }}
            >
              <span className="codicon codicon-trash" /> {t('btn.clearAll')}
            </button>
          </div>

          <div style={{ position: 'relative' }}>
            <textarea
              value={vm.importText}
              onChange={(e) => vm.setImportText(e.target.value)}
              placeholder={t('backup.placeholder')}
              style={{
                width: '100%',
                minHeight: 240,
                resize: 'vertical',
                background: '#0a0a0d',
                color: 'var(--text)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: 16,
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                boxShadow: 'inset 0 4px 12px rgba(0,0,0,0.4)',
              }}
            />
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button
              type="button"
              style={{
                ...btn,
                padding: '12px 24px',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
              onClick={() => void vm.importJson()}
            >
              <span className="codicon codicon-add" /> {t('btn.importJson')}
            </button>
          </div>

          {vm.byTemplate.length > 0 && (
            <div
              style={{
                marginTop: 40,
                paddingTop: 32,
                borderTop: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 16 }}>
                {t('backup.coverage')}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {vm.byTemplate.map(([k, n]) => (
                  <div
                    key={k}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      padding: '8px 16px',
                      borderRadius: 20,
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span
                      className={`codicon codicon-${TEMPLATE_ICONS[k] || 'blank'}`}
                      style={{ color: 'var(--text-muted)' }}
                    />
                    <span style={{ fontWeight: 600 }}>{k}</span>
                    <span
                      style={{
                        background: 'rgba(255,255,255,0.1)',
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 11,
                      }}
                    >
                      {n}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
  )
}
