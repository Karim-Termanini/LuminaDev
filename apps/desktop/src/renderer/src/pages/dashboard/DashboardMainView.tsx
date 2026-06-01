import type { ReactElement } from 'react'
import { isContainerRunningState } from '@linux-dev-home/shared'
import { dismissProfileSwitchError } from '../profileSwitchProgress'
import { persistPreferredEditorCmd } from './constants'
import {
  ActivityChart,
  DashboardMetricBar,
  EventFeed,
  ResourceDonutChart,
} from './charts'
import type { DashboardMainViewModel } from './useDashboardMainPage'

export function DashboardMainView({ vm }: { vm: DashboardMainViewModel }): ReactElement {
  const { t } = vm
  return (
<div className="dashboard-main-view">
        {vm.selectedProfile ? (
          <>
            {/* Hero Section */}
            <div className="profile-hero">
              <span
                className={`codicon codicon-${vm.selectedProfile.icon}`}
                style={{ fontSize: 48, color: vm.selectedProfile.accent }}
              />
              <h2 style={{ margin: '16px 0 8px', fontSize: 28, fontWeight: 700 }}>
                {vm.selectedProfile.title}
              </h2>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 15, maxWidth: 600 }}>
                {vm.selectedProfile.description}
              </p>
            </div>

            {/* Initialize Button */}
            <div
              style={{
                marginTop: 24,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={() => vm.setConfirmModalOpen(true)}
                disabled={
                  (vm.swState.active && vm.swState.targetProfile === vm.selectedProfileName) ||
                  (vm.isProfileActiveInStore && vm.profileStackRunning)
                }
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background:
                    vm.isProfileActiveInStore && vm.profileStackRunning
                      ? 'var(--green)'
                      : vm.selectedProfile.accent,
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 15,
                  cursor:
                    vm.isProfileActiveInStore && vm.profileStackRunning ? 'default' : 'pointer',
                  opacity:
                    vm.isProfileActiveInStore && vm.profileStackRunning
                      ? 0.6
                      : vm.swState.active && vm.swState.targetProfile === vm.selectedProfileName
                        ? 0.8
                        : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 0.2s ease',
                }}
              >
                {vm.swState.active && vm.swState.targetProfile === vm.selectedProfileName && (
                  <span
                    className="codicon codicon-loading"
                    style={{ animation: 'spin 1s linear infinite' }}
                  />
                )}
                {vm.selectedProfile.status === 'planned'
                  ? t('main.btn.comingSoon')
                  : vm.isProfileInitializing
                    ? t('main.btn.initializing')
                    : vm.isProfileActiveInStore && vm.profileStackRunning
                      ? t('main.btn.currentlyActive')
                      : vm.isProfileActiveInStore
                        ? t('main.btn.startStack')
                        : vm.activeProfile
                          ? t('main.btn.switchToThis')
                          : t('main.btn.initialize')}
              </button>
              {vm.betaFlags['enable_profile_auto_switch'] && (
                <div
                  title={t('main.btn.autoSwitchOn')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 10px',
                    borderRadius: 20,
                    background: 'rgba(124, 77, 255, 0.12)',
                    border: '1px solid rgba(124, 77, 255, 0.3)',
                    fontSize: 11,
                    color: 'var(--accent)',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span className="codicon codicon-sync" style={{ fontSize: 11 }} />
                  {t('main.btn.autoSwitchOn')}
                </div>
              )}
            </div>

            {vm.swState.active && vm.swState.targetProfile === vm.selectedProfileName && (
              <div
                style={{
                  marginTop: 20,
                  padding: '16px 20px',
                  borderRadius: 10,
                  background: vm.swState.failed ? 'rgba(180,40,40,0.15)' : 'rgba(0,0,0,0.35)',
                  border: vm.swState.failed
                    ? '1px solid rgba(220,80,80,0.55)'
                    : `1px solid ${vm.selectedProfile.accent}44`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 12,
                    marginBottom: vm.swState.failed ? 12 : 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {vm.swState.failed && (
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: 0.5,
                          color: '#f87171',
                          marginBottom: 6,
                        }}
                      >
                        {t('main.switch.setupFailed')}
                      </div>
                    )}
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: vm.swState.failed ? '#fecaca' : vm.selectedProfile.accent,
                        lineHeight: 1.45,
                        wordBreak: 'break-word',
                        display: 'block',
                      }}
                    >
                      {vm.swState.step || t('main.switch.step.starting')}
                    </span>
                  </div>
                  {!vm.swState.failed && (
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
                      {Math.round(vm.swState.progress)}%
                    </span>
                  )}
                </div>
                {!vm.swState.failed && (
                  <div
                    style={{
                      width: '100%',
                      height: 4,
                      background: 'rgba(255,255,255,0.08)',
                      borderRadius: 2,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${vm.swState.progress}%`,
                        height: '100%',
                        background: vm.selectedProfile.accent,
                        borderRadius: 2,
                        transition: 'width 0.4s ease-out',
                        boxShadow: `0 0 8px ${vm.selectedProfile.accent}80`,
                      }}
                    />
                  </div>
                )}
                {!vm.swState.failed && vm.canCancelWorkspaceSetup && (
                  <button
                    type="button"
                    disabled={vm.setupCancelling}
                    onClick={() => void vm.handleCancelWorkspaceSetup()}
                    style={{
                      marginTop: 12,
                      padding: '8px 14px',
                      borderRadius: 6,
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(180,40,40,0.25)',
                      color: '#fecaca',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: vm.setupCancelling ? 'wait' : 'pointer',
                      opacity: vm.setupCancelling ? 0.7 : 1,
                    }}
                  >
                    {vm.setupCancelling
                      ? t('main.switch.cancellingSetup')
                      : t('main.switch.cancelSetup')}
                  </button>
                )}
                {vm.swState.failed && (
                  <button
                    type="button"
                    onClick={() => dismissProfileSwitchError()}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 6,
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(0,0,0,0.25)',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {t('main.switch.dismissError')}
                  </button>
                )}
              </div>
            )}

            {/* Project Health Bar */}
            {vm.isProfileReady && (
              <div style={{ marginTop: 24, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(
                  [
                    {
                      label: t('main.health.git'),
                      status: vm.gitStatus
                        ? vm.gitStatus.conflictFileCount > 0
                          ? 'error'
                          : vm.gitStatus.staged.length + vm.gitStatus.unstaged.length > 0
                            ? 'warn'
                            : 'ok'
                        : 'unknown',
                    },
                    {
                      label: t('main.health.services'),
                      status:
                        vm.profileContainers.length === 0
                          ? 'unknown'
                          : vm.runningProfileContainers.length > 0
                            ? 'ok'
                            : 'warn',
                    },
                    {
                      label: t('main.health.storage'),
                      status: vm.m
                        ? vm.diskUsedPct > 85
                          ? 'error'
                          : vm.diskUsedPct > 70
                            ? 'warn'
                            : 'ok'
                        : 'unknown',
                    },
                    { label: t('main.health.build'), status: 'unknown' as const },
                    { label: t('main.health.deps'), status: 'unknown' as const },
                    {
                      label: t('main.health.env'),
                      status: vm.projectPath ? ('ok' as const) : ('unknown' as const),
                    },
                  ] as Array<{ label: string; status: 'ok' | 'warn' | 'error' | 'unknown' }>
                ).map((chip) => {
                  const colorMap = {
                    ok: 'var(--green)',
                    warn: 'var(--yellow)',
                    error: 'var(--red)',
                    unknown: 'var(--text-muted)',
                  }
                  const bgMap = {
                    ok: 'rgba(0,230,118,0.1)',
                    warn: 'rgba(255,193,7,0.1)',
                    error: 'rgba(255,82,82,0.1)',
                    unknown: 'rgba(255,255,255,0.04)',
                  }
                  const borderMap = {
                    ok: 'rgba(0,230,118,0.25)',
                    warn: 'rgba(255,193,7,0.25)',
                    error: 'rgba(255,82,82,0.25)',
                    unknown: 'rgba(255,255,255,0.08)',
                  }
                  const c = colorMap[chip.status]
                  const bg = bgMap[chip.status]
                  const border = borderMap[chip.status]
                  return (
                    <div
                      key={chip.label}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 12px',
                        borderRadius: 20,
                        background: bg,
                        border: `1px solid ${border}`,
                        fontSize: 12,
                      }}
                    >
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: c,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                        {chip.label}
                      </span>
                      <span style={{ color: c, fontWeight: 700, fontSize: 11 }}>
                        {chip.status.toUpperCase()}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {vm.isProfileInitializing && (
              <div style={{ marginTop: 32 }}>
                <div className="dashboard-widget">
                  <h3 className="dashboard-widget-title">{t('main.metrics.title')}</h3>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {t('main.metrics.pending')}
                  </p>
                </div>
              </div>
            )}

            {/* Section 2: System Metrics (Live) - Moved Up */}
            {vm.isProfileReady && vm.m && (
              <div style={{ marginTop: 32 }}>
                <div className="dashboard-widget">
                  <h3 className="dashboard-widget-title">{t('main.metrics.title')}</h3>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: 16,
                    }}
                  >
                    <DashboardMetricBar
                      label={t('main.metrics.cpu')}
                      valueText={`${vm.m.cpuUsagePercent.toFixed(0)}%`}
                      percent={vm.m.cpuUsagePercent}
                    />
                    <DashboardMetricBar
                      label={t('main.metrics.ram')}
                      valueText={`${((vm.m.totalMemMb - vm.m.freeMemMb) / 1024).toFixed(1)} / ${(vm.m.totalMemMb / 1024).toFixed(1)} GB`}
                      percent={vm.ramUsedPct}
                    />
                    <DashboardMetricBar
                      label={t('main.metrics.disk')}
                      valueText={t('main.projectPath.freeGb', { free: vm.m.diskFreeGb.toFixed(0) })}
                      percent={vm.diskUsedPct}
                    />
                  </div>
                </div>
              </div>
            )}

            {vm.isProfileInitializing && (
              <div style={{ marginTop: 32 }}>
                <div className="dashboard-widget">
                  <h3 className="dashboard-widget-title">{t('main.workspace.title')}</h3>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {t('main.workspace.pending')}
                  </p>
                </div>
              </div>
            )}

            {/* Workspace & Project Management */}
            {vm.isProfileReady && (
              <div style={{ marginTop: 32 }}>
                <div className="dashboard-widget">
                  <h3 className="dashboard-widget-title">{t('main.workspace.title')}</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                      <label
                        style={{
                          fontSize: 13,
                          color: 'var(--text-muted)',
                          marginBottom: 8,
                          display: 'block',
                        }}
                      >
                        {t('main.workspace.projectPath')}
                      </label>
                      {!vm.projectPath ? (
                        <>
                          <p
                            style={{
                              margin: '0 0 12px',
                              fontSize: 13,
                              color: 'var(--text-muted)',
                              lineHeight: 1.5,
                            }}
                          >
                            {t('main.workspace.noProjectHint')}
                          </p>
                          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            <input
                              type="text"
                              readOnly
                              value={t('main.workspace.noProject')}
                              style={{
                                flex: 1,
                                minWidth: 220,
                                padding: '10px 14px',
                                borderRadius: 6,
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(0,0,0,0.2)',
                                color: 'var(--text-muted)',
                                fontSize: 13,
                              }}
                            />
                            <button
                              onClick={vm.handleLinkProject}
                              style={{
                                padding: '0 16px',
                                borderRadius: 6,
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(255,255,255,0.05)',
                                color: 'var(--text)',
                                cursor: 'pointer',
                                fontSize: 13,
                                fontWeight: 600,
                              }}
                            >
                              {t('main.workspace.linkExisting')}
                            </button>
                            <button
                              onClick={() => vm.openCreateWorkspaceWizard()}
                              style={{
                                padding: '0 16px',
                                borderRadius: 6,
                                border: 'none',
                                background: vm.selectedProfile.accent,
                                color: '#fff',
                                cursor: 'pointer',
                                fontSize: 13,
                                fontWeight: 600,
                              }}
                            >
                              {t('main.workspace.createNew')}
                            </button>
                          </div>
                        </>
                      ) : (
                        <div style={{ display: 'flex', gap: 12 }}>
                          <input
                            type="text"
                            readOnly
                            value={vm.projectPath}
                            style={{
                              flex: 1,
                              padding: '10px 14px',
                              borderRadius: 6,
                              border: '1px solid rgba(255,255,255,0.1)',
                              background: 'rgba(0,0,0,0.2)',
                              color: 'var(--text)',
                              fontSize: 13,
                            }}
                          />
                          <button
                            onClick={async () => {
                              vm.setProjectPath(null)
                              await window.dh.storeDelete({
                                key: `project_dir_${vm.selectedProfileName}`,
                              })
                              vm.setToast({
                                type: 'success',
                                message: t('main.toast.projectUnlinked'),
                              })
                            }}
                            style={{
                              padding: '0 16px',
                              borderRadius: 6,
                              border: '1px solid rgba(255,255,255,0.1)',
                              background: 'rgba(255,0,0,0.1)',
                              color: 'var(--text)',
                              cursor: 'pointer',
                              fontSize: 13,
                              fontWeight: 600,
                              transition: 'background 0.2s',
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.background = 'rgba(255,0,0,0.2)')
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = 'rgba(255,0,0,0.1)')
                            }
                          >
                            {t('main.workspace.unlinkProject')}
                          </button>
                        </div>
                      )}
                    </div>
                    {vm.projectPath && (
                      <div>
                        <label
                          style={{
                            fontSize: 13,
                            color: 'var(--text-muted)',
                            marginBottom: 8,
                            display: 'block',
                          }}
                        >
                          {t('main.workspace.openInEditor')}
                        </label>
                        <div style={{ display: 'flex', gap: 12 }}>
                          <select
                            value={vm.selectedEditorCmd}
                            onChange={(e) => {
                              vm.setSelectedEditorCmd(e.target.value)
                              persistPreferredEditorCmd(e.target.value)
                            }}
                            style={{
                              padding: '10px 14px',
                              borderRadius: 6,
                              border: '1px solid rgba(255,255,255,0.1)',
                              background: 'rgba(0,0,0,0.2)',
                              color: 'var(--text)',
                              fontSize: 13,
                              minWidth: 200,
                            }}
                          >
                            {vm.installedEditors.length === 0 && (
                              <option value="">{t('main.workspace.noEditors')}</option>
                            )}
                            {vm.installedEditors.map((ed) => (
                              <option key={ed.name} value={ed.cmd}>
                                {ed.name}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={vm.handleOpenEditor}
                            disabled={!vm.selectedEditorCmd}
                            style={{
                              padding: '0 16px',
                              borderRadius: 6,
                              border: 'none',
                              background: 'var(--green)',
                              color: '#fff',
                              cursor: vm.selectedEditorCmd ? 'pointer' : 'not-allowed',
                              fontSize: 13,
                              fontWeight: 600,
                            }}
                          >
                            {t('main.workspace.openIDE')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Git Status Panel */}
            {vm.isProfileReady && vm.projectPath && (
              <div style={{ marginTop: 32 }}>
                <div className="dashboard-widget">
                  <h3
                    className="dashboard-widget-title"
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <span className="codicon codicon-git-branch" aria-hidden />
                    {t('main.git.title')}
                    {vm.gitStatus && (
                      <span
                        className="mono"
                        style={{
                          marginLeft: 4,
                          fontSize: 12,
                          color: 'var(--accent)',
                          fontWeight: 400,
                        }}
                      >
                        {vm.gitStatus.branch}
                      </span>
                    )}
                  </h3>
                  {vm.gitStatus ? (
                    <>
                      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 13,
                            color: 'var(--text-muted)',
                          }}
                        >
                          <span
                            className="codicon codicon-arrow-up"
                            style={{ color: 'var(--green)', fontSize: 12 }}
                            aria-hidden
                          />
                          {vm.gitStatus.ahead} {t('main.git.ahead')}
                        </span>
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 13,
                            color: 'var(--text-muted)',
                          }}
                        >
                          <span
                            className="codicon codicon-arrow-down"
                            style={{ color: 'var(--yellow)', fontSize: 12 }}
                            aria-hidden
                          />
                          {vm.gitStatus.behind} {t('main.git.behind')}
                        </span>
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 13,
                            color: 'var(--text-muted)',
                          }}
                        >
                          <span
                            className="codicon codicon-edit"
                            style={{ color: 'var(--accent)', fontSize: 12 }}
                            aria-hidden
                          />
                          {vm.gitStatus.staged.length + vm.gitStatus.unstaged.length}{' '}
                          {t('main.git.changed')}
                          {vm.gitStatus.staged.length > 0 && (
                            <span style={{ color: 'var(--green)', fontSize: 11 }}>
                              ({vm.gitStatus.staged.length} {t('main.git.staged')})
                            </span>
                          )}
                        </span>
                        {vm.gitStatus.conflictFileCount > 0 && (
                          <span
                            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                          >
                            <span
                              className="codicon codicon-warning"
                              style={{ color: 'var(--red)', fontSize: 12 }}
                              aria-hidden
                            />
                            <span style={{ color: 'var(--red)' }}>
                              {vm.gitStatus.conflictFileCount} {t('main.git.conflicts')}
                            </span>
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => vm.navigate('/git')}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '7px 14px',
                            borderRadius: 6,
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(255,255,255,0.05)',
                            color: 'var(--text)',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          <span
                            className="codicon codicon-git-commit"
                            style={{ fontSize: 13 }}
                            aria-hidden
                          />
                          {t('main.git.commit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => vm.navigate('/git')}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '7px 14px',
                            borderRadius: 6,
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(255,255,255,0.05)',
                            color: 'var(--text)',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          <span
                            className="codicon codicon-cloud-upload"
                            style={{ fontSize: 13 }}
                            aria-hidden
                          />
                          {t('main.git.push')}
                        </button>
                        <button
                          type="button"
                          onClick={() => vm.navigate('/git')}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '7px 14px',
                            borderRadius: 6,
                            border: '1px solid rgba(255,255,255,0.1)',
                            background: 'rgba(255,255,255,0.05)',
                            color: 'var(--text)',
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          <span
                            className="codicon codicon-cloud-download"
                            style={{ fontSize: 13 }}
                            aria-hidden
                          />
                          {t('main.git.pull')}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
                      {t('main.git.notRepo')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Active Jobs Panel */}
            {vm.isProfileReady && vm.jobs.some((j) => j.state === 'running') && (
              <div style={{ marginTop: 32 }}>
                <div className="dashboard-widget">
                  <h3 className="dashboard-widget-title">{t('main.activeJobs.title')}</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {vm.jobs
                      .filter((j) => j.state === 'running')
                      .map((j) => {
                        const pct = Math.min(100, Math.max(0, j.progress ?? 0))
                        return (
                          <div
                            key={j.id}
                            style={{ display: 'flex', alignItems: 'center', gap: 12 }}
                          >
                            <div style={{ flex: 1 }}>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  marginBottom: 6,
                                }}
                              >
                                <span style={{ fontSize: 13, fontWeight: 600 }}>{j.kind}</span>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                  {pct}%
                                </span>
                              </div>
                              <div
                                style={{
                                  height: 4,
                                  borderRadius: 2,
                                  background: 'rgba(255,255,255,0.08)',
                                  overflow: 'hidden',
                                }}
                              >
                                <div
                                  style={{
                                    width: `${pct}%`,
                                    height: '100%',
                                    background: vm.selectedProfile.accent,
                                    borderRadius: 2,
                                    transition: 'width 0.4s ease-out',
                                  }}
                                />
                              </div>
                              {j.logTail && j.logTail.length > 0 && (
                                <div
                                  style={{
                                    marginTop: 4,
                                    fontSize: 11,
                                    color: 'var(--text-muted)',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {j.logTail[j.logTail.length - 1]}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => void window.dh.jobCancel({ id: j.id })}
                              style={{
                                padding: '5px 10px',
                                borderRadius: 4,
                                border: '1px solid rgba(255,82,82,0.3)',
                                background: 'rgba(255,82,82,0.08)',
                                color: '#ff5252',
                                cursor: 'pointer',
                                fontSize: 11,
                                fontWeight: 600,
                                flexShrink: 0,
                              }}
                            >
                              {t('main.activeJobs.cancel')}
                            </button>
                          </div>
                        )
                      })}
                  </div>
                </div>
              </div>
            )}

            {/* Section 3: Analytics Grid (Activity + Container Status Side-by-Side) */}
            {vm.isProfileReady && vm.selectedProfileName && (
              <div
                style={{
                  marginTop: 32,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))',
                  gap: 20,
                }}
              >
                <ActivityChart data={vm.activityData} />
                <ResourceDonutChart data={vm.resourceAllocation} />
              </div>
            )}

            {/* Section 4: Active Containers + Services Grid */}
            <div
              style={{ marginTop: 32, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}
            >
              {/* Active Containers Table */}
              {vm.activeProfile && (
                <div>
                  <h3
                    style={{
                      margin: '0 0 16px',
                      fontSize: 14,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {t('main.containers.title')}
                  </h3>
                  {vm.profileContainers.length > 0 ? (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th
                              style={{
                                padding: '8px 12px',
                                textAlign: 'left',
                                color: 'var(--text-muted)',
                                fontWeight: 600,
                              }}
                            >
                              {t('main.containers.name')}
                            </th>
                            <th
                              style={{
                                padding: '8px 12px',
                                textAlign: 'left',
                                color: 'var(--text-muted)',
                                fontWeight: 600,
                              }}
                            >
                              {t('main.containers.state')}
                            </th>
                            <th
                              style={{
                                padding: '8px 12px',
                                textAlign: 'left',
                                color: 'var(--text-muted)',
                                fontWeight: 600,
                              }}
                            >
                              {t('main.containers.image')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {vm.profileContainers.map((row) => (
                            <tr key={row.id} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '8px 12px' }}>{row.name}</td>
                              <td
                                style={{
                                  padding: '8px 12px',
                                  color:
                                    row.state === 'running' ? 'var(--green)' : 'var(--text-muted)',
                                }}
                              >
                                {row.state}
                              </td>
                              <td
                                style={{
                                  padding: '8px 12px',
                                  color: 'var(--text-muted)',
                                  fontSize: 12,
                                }}
                              >
                                {row.image}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: '24px',
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                        fontSize: 13,
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                      }}
                    >
                      {t('main.containers.empty')}
                    </div>
                  )}
                </div>
              )}

              {/* Running Services */}
              {vm.selectedProfileName && (
                <div>
                  <h3
                    style={{
                      margin: '0 0 16px',
                      fontSize: 14,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {t('main.services.title')}
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {vm.runningProfileContainers.length > 0 ? (
                      vm.runningProfileContainers.map((c) => {
                        const isRunning = isContainerRunningState(c.state)
                        const isPending = c.state.toLowerCase().includes('restarting')
                        const dotColor = isRunning
                          ? 'var(--green)'
                          : isPending
                            ? 'var(--yellow)'
                            : 'var(--text-muted)'
                        const portMatches = [...c.ports.matchAll(/(\d+)->(\d+)\/(\w+)/g)]
                        return (
                          <div
                            key={c.id}
                            style={{
                              padding: '12px 14px',
                              borderRadius: 8,
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid rgba(255,255,255,0.06)',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: portMatches.length > 0 ? 8 : 0,
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    background: dotColor,
                                    flexShrink: 0,
                                  }}
                                />
                                <span
                                  style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}
                                >
                                  {c.name}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                  {c.status}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => vm.navigate('/docker')}
                                  title={t('main.services.viewDocker')}
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: 4,
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    background: 'rgba(255,255,255,0.04)',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    fontSize: 11,
                                  }}
                                >
                                  <span className="codicon codicon-link-external" aria-hidden />
                                </button>
                              </div>
                            </div>
                            {portMatches.length > 0 && (
                              <div
                                style={{
                                  display: 'flex',
                                  gap: 6,
                                  flexWrap: 'wrap',
                                  paddingLeft: 16,
                                }}
                              >
                                {portMatches.map((m, i) => {
                                  const hostPort = parseInt(m[1], 10)
                                  const HTTP_PORTS = new Set([
                                    80, 443, 3000, 3001, 4200, 5000, 5173, 8000, 8080, 8443, 9000,
                                  ])
                                  return (
                                    <span
                                      key={i}
                                      style={{
                                        fontSize: 11,
                                        color: 'var(--accent)',
                                        background: 'rgba(var(--accent-rgb, 100,149,237), 0.1)',
                                        padding: '2px 7px',
                                        borderRadius: 4,
                                        fontFamily: 'monospace',
                                      }}
                                    >
                                      {HTTP_PORTS.has(hostPort) ? (
                                        <a
                                          href={`http://localhost:${hostPort}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          style={{ color: 'inherit', textDecoration: 'none' }}
                                        >
                                          :{hostPort}
                                        </a>
                                      ) : (
                                        t('main.ports.protocol', {
                                          protocol: m[3].toUpperCase(),
                                          port: hostPort,
                                        })
                                      )}
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })
                    ) : (
                      <div
                        style={{
                          padding: '24px',
                          textAlign: 'center',
                          color: 'var(--text-muted)',
                          fontSize: 13,
                          background: 'rgba(255,255,255,0.02)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                        }}
                      >
                        {t('main.services.empty')}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Section 5: Recent Activity Feed at Bottom */}
            {vm.selectedProfileName && (
              <div style={{ marginTop: 32 }}>
                <EventFeed events={vm.liveEvents} />
              </div>
            )}
          </>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 16,
              textAlign: 'center',
              color: 'var(--text-muted)',
            }}
          >
            <span className="codicon codicon-person-add" style={{ fontSize: 48, opacity: 0.3 }} />
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600, color: 'var(--text)' }}>
                {t('main.noProfiles.title')}
              </p>
              <p style={{ margin: 0, fontSize: 14 }}>{t('main.noProfiles.description')}</p>
            </div>
          </div>
        )}
      </div>
  )
}
