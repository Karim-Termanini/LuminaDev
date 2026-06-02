import type { ReactElement } from 'react'
import React from 'react'
import { broadcastActiveProfileChange } from '../../lib/activeProfileSync'
import { cancelProjectSetup, invalidateSetupRuns, readSetupSession } from '../projectSetupSession'
import {
  signalProfileSwitchDone,
  signalProfileSwitchFailed,
  signalProfileSwitchStarting,
} from '../profileSwitchProgress'
import { TEMPLATE_ICONS } from './constants'
import type { ProfilesPageViewModel } from './useProfilesPage'

export function ProfilesBuilderTab({ vm }: { vm: ProfilesPageViewModel }): ReactElement {
  const { t } = vm
  return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Dev Home Style Hero Banner */}
          <div className="dev-home-hero">
            <h2 className="dev-home-hero-title">{t('hero.title')}</h2>
            <p className="dev-home-hero-subtitle">{t('hero.subtitle')}</p>
            <button type="button" className="dev-home-btn" onClick={vm.openCreateModal}>
              {t('hero.btn')}
            </button>
          </div>

          {/* Horizontal Lists */}
          {vm.profiles.length === 0 ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 15,
              }}
            >
              {t('builder.empty')}
            </div>
          ) : (
            <div className="profiles-list-container">
              {vm.profiles.map((p, i) => {
                const envVarCount = (p.envVars || []).length
                const credCount = (p.credentialIds || []).length
                const icon = TEMPLATE_ICONS[p.baseTemplate] || 'blank'
                const isDropdownOpen = vm.openDropdownIdx === i

                return (
                  <div key={`${p.name}-${i}`} className="profiles-list-row">
                    <div className="row-left">
                      <div className="row-icon-box">
                        <span
                          className={`codicon codicon-${icon}`}
                          style={{ fontSize: 24, color: '#fff' }}
                        />
                      </div>
                      <div className="row-title-area">
                        <h3
                          className="row-title"
                          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                        >
                          <span
                            style={{
                              display: 'inline-block',
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              background: vm.runningProfiles.has(p.name)
                                ? 'var(--green)'
                                : 'rgba(255,255,255,0.15)',
                              border: vm.runningProfiles.has(p.name)
                                ? '2px solid var(--green)'
                                : '2px solid rgba(255,255,255,0.2)',
                              flexShrink: 0,
                            }}
                            title={vm.runningProfiles.has(p.name) ? 'Running' : 'Stopped'}
                          />
                          {p.name}
                          {vm.activeProfileTemplate === p.name && (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                background: 'color-mix(in srgb, var(--green) 20%, transparent)',
                                color: 'var(--green)',
                                border:
                                  '1px solid color-mix(in srgb, var(--green) 40%, transparent)',
                                borderRadius: 20,
                                padding: '2px 8px',
                                letterSpacing: '0.04em',
                              }}
                            >
                              {t('badge.active')}
                            </span>
                          )}
                        </h3>
                        <p className="row-subtitle">
                          <span
                            style={{
                              display: 'inline-block',
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: 'var(--green)',
                            }}
                          />
                          {p.baseTemplate}
                          <span
                            style={{
                              display: 'inline-block',
                              marginLeft: 8,
                              fontSize: 10,
                              fontWeight: 600,
                              padding: '1px 6px',
                              borderRadius: 10,
                              background:
                                (p.composeVariant ?? 'stub') === 'full'
                                  ? 'rgba(124,77,255,0.15)'
                                  : 'rgba(255,255,255,0.06)',
                              border:
                                (p.composeVariant ?? 'stub') === 'full'
                                  ? '1px solid rgba(124,77,255,0.3)'
                                  : '1px solid rgba(255,255,255,0.1)',
                              color:
                                (p.composeVariant ?? 'stub') === 'full'
                                  ? 'var(--accent)'
                                  : 'var(--text-muted)',
                              cursor: 'pointer',
                            }}
                            title={
                              (p.composeVariant ?? 'stub') === 'stub'
                                ? t('btn.stackStubHint')
                                : t('btn.stackFullHint')
                            }
                            onClick={() => {
                              const next = vm.profiles.map((prof, pi) =>
                                pi === i
                                  ? {
                                      ...prof,
                                      composeVariant: ((prof.composeVariant ?? 'stub') === 'stub'
                                        ? 'full'
                                        : 'stub') as 'stub' | 'full',
                                    }
                                  : prof
                              )
                              void vm.save(
                                next,
                                t('msg.switchedStack', {
                                  name: p.name,
                                  variant:
                                    (p.composeVariant ?? 'stub') === 'stub' ? 'full' : 'stub',
                                })
                              )
                            }}
                          >
                            {(p.composeVariant ?? 'stub') === 'stub'
                              ? t('btn.lite')
                              : t('btn.full')}
                          </span>
                        </p>
                        {vm.projectPaths[p.name] ? (
                          <p
                            className="row-subtitle mono"
                            style={{
                              fontSize: 11,
                              marginTop: 2,
                              color: 'var(--text-muted)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 260,
                            }}
                          >
                            <span className="codicon codicon-folder" style={{ marginRight: 4 }} />
                            {vm.projectPaths[p.name]}
                          </p>
                        ) : (
                          <p
                            className="row-subtitle"
                            style={{
                              fontSize: 11,
                              marginTop: 2,
                              color: 'var(--text-muted)',
                              fontStyle: 'italic',
                            }}
                          >
                            {t('badge.noProject')}
                          </p>
                        )}
                        {/* Description */}
                        {p.description && (
                          <p
                            className="row-subtitle"
                            style={{
                              fontSize: 12,
                              marginTop: 2,
                              color: 'var(--text-muted)',
                              fontStyle: 'italic',
                              maxWidth: 320,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {p.description}
                          </p>
                        )}
                        {/* Tags */}
                        {(p.tags ?? []).length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            {(p.tags ?? []).map((tag) => (
                              <span
                                key={tag}
                                style={{
                                  fontSize: 10,
                                  padding: '1px 7px',
                                  borderRadius: 12,
                                  fontWeight: 600,
                                  background: 'rgba(124,77,255,0.1)',
                                  border: '1px solid rgba(124,77,255,0.2)',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="row-stats">
                      <div className="row-stat-item">
                        <span className="codicon codicon-symbol-property" />{' '}
                        {t('stat.envVars', { count: envVarCount })}
                      </div>
                      <div className="row-stat-item">
                        <span className="codicon codicon-key" />{' '}
                        {t('stat.credentials', { count: credCount })}
                      </div>
                    </div>

                    <div className="row-actions">
                      {vm.runningProfiles.has(p.name) ? (
                        <>
                          <button
                            type="button"
                            style={{
                              padding: '8px 16px',
                              borderRadius: 6,
                              background: 'var(--red)',
                              color: '#fff',
                              border: 'none',
                              fontWeight: 700,
                              cursor: 'pointer',
                              fontSize: 13,
                            }}
                            disabled={!!vm.actionLoading[p.name]}
                            onClick={async () => {
                              vm.setStatus(null)
                              vm.setActionLoading((prev) => ({ ...prev, [p.name]: 'stopping' }))
                              const hasSetup = readSetupSession()?.profileName === p.name
                              if (hasSetup) invalidateSetupRuns()
                              try {
                                const r = await window.dh.composeStop({ profile: p.name })
                                if (r.ok) {
                                  const nowRunning = await vm.refreshRunning()
                                  if (nowRunning.size === 0) {
                                    await vm.setAsActive('empty')
                                  }
                                  vm.setStatus({ message: `${p.name} stopped.`, type: 'success' })
                                } else {
                                  await vm.refreshRunning()
                                  vm.setStatus({
                                    message: r.error || 'Failed to stop',
                                    type: 'warning',
                                  })
                                }
                                if (hasSetup) {
                                  await cancelProjectSetup(p.name)
                                }
                              } catch (e) {
                                vm.setStatus({
                                  message: e instanceof Error ? e.message : String(e),
                                  type: 'warning',
                                })
                              } finally {
                                vm.setActionLoading((prev) => ({ ...prev, [p.name]: null }))
                              }
                            }}
                          >
                            {vm.actionLoading[p.name] === 'stopping' ? (
                              <>
                                <span
                                  className="codicon codicon-loading codicon-modifier-spin"
                                  style={{ marginRight: 4 }}
                                />
                                Stopping...
                              </>
                            ) : (
                              <>
                                <span
                                  className="codicon codicon-debug-stop"
                                  style={{ marginRight: 4 }}
                                />
                                Stop
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            className="row-btn"
                            disabled={!!vm.actionLoading[p.name]}
                            onClick={async () => {
                              vm.setStatus(null)
                              vm.setActionLoading((prev) => ({ ...prev, [p.name]: 'restarting' }))
                              signalProfileSwitchStarting(p.name, { skipPoll: true })
                              try {
                                const r = await window.dh.profileSwitch({ from: p.name, to: p.name })
                                if (!r.ok) {
                                  const errMsg = r.error || 'Failed'
                                  signalProfileSwitchFailed(errMsg)
                                  vm.setStatus({ message: errMsg, type: 'warning' })
                                  return
                                }
                                signalProfileSwitchDone()
                                await vm.setAsActive(p.name)
                                broadcastActiveProfileChange(p.name)
                                void vm.refreshRunning()
                                vm.setStatus({ message: `${p.name} restarted.`, type: 'success' })
                              } catch (e) {
                                vm.setStatus({
                                  message: e instanceof Error ? e.message : String(e),
                                  type: 'warning',
                                })
                              } finally {
                                vm.setActionLoading((prev) => ({ ...prev, [p.name]: null }))
                              }
                            }}
                          >
                            {vm.actionLoading[p.name] === 'restarting' ? (
                              <>
                                <span
                                  className="codicon codicon-loading codicon-modifier-spin"
                                  style={{ marginRight: 4 }}
                                />
                                Restarting...
                              </>
                            ) : (
                              <>
                                <span className="codicon codicon-sync" style={{ marginRight: 4 }} />
                                Restart
                              </>
                            )}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={!!vm.actionLoading[p.name]}
                          style={{
                            padding: '8px 16px',
                            borderRadius: 6,
                            background: 'var(--accent)',
                            color: '#fff',
                            border: 'none',
                            fontWeight: 700,
                            cursor: vm.actionLoading[p.name] ? 'not-allowed' : 'pointer',
                            fontSize: 13,
                            opacity: vm.actionLoading[p.name] ? 0.7 : 1,
                          }}
                          onClick={async () => {
                            vm.setStatus(null)
                            vm.setRowError((prev) => {
                              // eslint-disable-next-line @typescript-eslint/no-unused-vars
                              const { [i]: _dropped, ...rest } = prev
                              return rest
                            })
                            vm.setActionLoading((prev) => ({ ...prev, [p.name]: 'starting' }))
                            signalProfileSwitchStarting(p.name, { skipPoll: true })
                            const previousActive =
                              vm.activeProfileTemplate &&
                              vm.activeProfileTemplate !== 'empty' &&
                              vm.activeProfileTemplate !== p.name
                                ? vm.activeProfileTemplate
                                : undefined
                            try {
                              const r = await window.dh.profileSwitch({
                                to: p.name,
                                ...(previousActive ? { from: previousActive } : {}),
                              })
                              if (!r.ok) {
                                const errMsg = r.error || r.log || 'Failed to start'
                                signalProfileSwitchFailed(errMsg)
                                vm.setRowError((prev) => ({ ...prev, [i]: errMsg }))
                                return
                              }
                              signalProfileSwitchDone()
                              await vm.setAsActive(p.name)
                              broadcastActiveProfileChange(p.name)
                              void vm.refreshRunning()
                              void vm.loadExtras(vm.profiles)
                              vm.setStatus({ message: `${p.name} started.`, type: 'success' })
                            } catch (e) {
                              vm.setRowError((prev) => ({
                                ...prev,
                                [i]: e instanceof Error ? e.message : String(e),
                              }))
                            } finally {
                              vm.setActionLoading((prev) => ({ ...prev, [p.name]: null }))
                            }
                          }}
                        >
                          {vm.actionLoading[p.name] === 'starting' ? (
                            <>
                              <span
                                className="codicon codicon-loading codicon-modifier-spin"
                                style={{ marginRight: 4 }}
                              />
                              Starting...
                            </>
                          ) : (
                            <>
                              <span className="codicon codicon-play" style={{ marginRight: 4 }} />
                              Start
                            </>
                          )}
                        </button>
                      )}
                      <button type="button" className="row-btn" onClick={() => vm.openEditModal(i)}>
                        {t('btn.edit')}
                      </button>
                      {vm.rowError[i] && (
                        <span
                          style={{
                            fontSize: 12,
                            color: 'var(--red)',
                            maxWidth: 200,
                            wordBreak: 'break-word',
                          }}
                        >
                          {vm.rowError[i]}
                        </span>
                      )}
                      <div style={{ position: 'relative' }}>
                        <button
                          type="button"
                          className="row-btn-icon"
                          onClick={() => vm.setOpenDropdownIdx(isDropdownOpen ? null : i)}
                        >
                          <span className="codicon codicon-ellipsis" />
                        </button>
                        {isDropdownOpen && (
                          <div
                            style={{
                              position: 'absolute',
                              top: '100%',
                              right: 0,
                              marginTop: 4,
                              background: 'rgba(20,20,24,0.95)',
                              border: '1px solid rgba(255,255,255,0.1)',
                              backdropFilter: 'blur(16px)',
                              borderRadius: 6,
                              minWidth: 160,
                              zIndex: 100,
                              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
                              padding: 4,
                            }}
                          >
                            <button
                              type="button"
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--text)',
                                fontSize: 13,
                                textAlign: 'left',
                                cursor: 'pointer',
                                borderRadius: 4,
                                marginBottom: 2,
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent'
                              }}
                              onClick={() => {
                                void vm.duplicateAt(i)
                                vm.setOpenDropdownIdx(null)
                              }}
                            >
                              <span
                                className="codicon codicon-copy"
                                style={{ marginRight: 8, fontSize: 14 }}
                              />{' '}
                              {t('btn.duplicate')}
                            </button>
                            <button
                              type="button"
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                border: 'none',
                                background: 'transparent',
                                color: 'var(--red)',
                                fontSize: 13,
                                textAlign: 'left',
                                cursor: 'pointer',
                                borderRadius: 4,
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255,0,0,0.1)'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'transparent'
                              }}
                              onClick={() => {
                                void vm.removeAt(i)
                                vm.setOpenDropdownIdx(null)
                              }}
                            >
                              <span
                                className="codicon codicon-trash"
                                style={{ marginRight: 8, fontSize: 14 }}
                              />{' '}
                              {t('btn.delete')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
  )
}
