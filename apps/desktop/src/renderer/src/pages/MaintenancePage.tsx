import type { ReactElement } from 'react'
import { getMaintenanceOverallLabel } from './maintenanceHealth'
import { MAINT_TAB_META, TABS } from './maintenance/constants'
import { MaintenanceCleanupTab } from './maintenance/MaintenanceCleanupTab'
import { MaintenanceDataProfilesTab } from './maintenance/MaintenanceDataProfilesTab'
import { MaintenanceLogsTab } from './maintenance/MaintenanceLogsTab'
import { MaintenanceOverviewTab } from './maintenance/MaintenanceOverviewTab'
import { MaintenanceScheduleTab } from './maintenance/MaintenanceScheduleTab'
import { useMaintenancePage } from './maintenance/useMaintenancePage'
import './MaintenancePage.css'

export function MaintenancePage(): ReactElement {
  const vm = useMaintenancePage()
  const {
    t,
    activeTab,
    setActiveTab,
    m,
    memPct,
    diskPct,
    runningContainers,
    containers,
    guardian,
    guardianOverallLevel,
    degradedProfiles,
    lastMaintenanceDaysAgo,
    activeJobCount,
    pendingTasks,
    tabShortLabel,
    tabFullLabel,
    status,
    setStatus,
    statusTone,
    runbook,
    setRunbook,
    commandPeek,
    setCommandPeek,
    recommendedSelection,
    setRecommendedSelection,
    state,
    savingState,
    busyCleanup,
    serviceState,
    systemdBusy,
    systemdError,
    newTaskTitle,
    setNewTaskTitle,
    newCron,
    setNewCron,
    newCmd,
    setNewCmd,
    editTaskId,
    setEditTaskId,
    editDraft,
    setEditDraft,
    runbookBusyId,
    jobs,
    diagnostics,
    runningDiagnostics,
    includeSensitiveBundle,
    setIncludeSensitiveBundle,
    topProcesses,
    security,
    updateTask,
  } = vm

  return (
    <div className="maint-page elevated-page">
      <div className="maint-scroll">
        <header className="maint-hero">
          <div className="maint-hero-eyebrow">
            <span className="codicon codicon-tools" aria-hidden />
            {t('page.eyebrow')}
          </div>
          <div className="maint-hero-row">
            <div>
              <h1 className="maint-hero-title">{t('page.contentTitle')}</h1>
              <p className="maint-hero-sub">
                {degradedProfiles > 0 ? t('page.statusIssues', { count: degradedProfiles }) : t('page.statusHealthy')}{' '}
                {lastMaintenanceDaysAgo === null
                  ? t('page.lastMaintenanceNever')
                  : t('page.lastMaintenance', { days: lastMaintenanceDaysAgo })}
              </p>
            </div>
            <div className="maint-live-pill" role="status">
              <span className="maint-live-dot" aria-hidden />
              {t('page.live')}
            </div>
          </div>
        </header>

        <section className="maint-spotlight" aria-label={t('summary.aria')}>
          <div className="maint-spotlight-item">
            <span className="maint-spotlight-label">{t('summary.guardian')}</span>
            <span
              className={`maint-spotlight-value${guardian.score != null && guardian.score >= 70 ? ' is-ok' : guardian.score != null ? ' is-warn' : ''}`}
            >
              {guardian.score === null ? '—' : `${guardian.score}%`}
            </span>
            <span className="maint-spotlight-sub">
              {guardian.score != null ? getMaintenanceOverallLabel(guardianOverallLevel, t) : t('summary.guardian_sub')}
            </span>
          </div>
          <div className="maint-spotlight-item">
            <span className="maint-spotlight-label">{t('summary.cpu')}</span>
            <span className={`maint-spotlight-value${m && m.cpuUsagePercent >= 85 ? ' is-warn' : ''}`}>
              {m ? `${m.cpuUsagePercent.toFixed(1)}%` : '—'}
            </span>
            <span className="maint-spotlight-sub">{t('summary.cpu_sub')}</span>
          </div>
          <div className="maint-spotlight-item">
            <span className="maint-spotlight-label">{t('summary.memory')}</span>
            <span className={`maint-spotlight-value${memPct != null && memPct >= 90 ? ' is-warn' : ''}`}>
              {memPct != null ? `${memPct}%` : '—'}
            </span>
            <span className="maint-spotlight-sub">{t('summary.memory_sub')}</span>
          </div>
          <div className="maint-spotlight-item">
            <span className="maint-spotlight-label">{t('summary.docker')}</span>
            <span className="maint-spotlight-value">
              {runningContainers}/{containers.length}
            </span>
            <span className="maint-spotlight-sub">{t('summary.docker_sub')}</span>
          </div>
          <div className="maint-spotlight-item">
            <span className="maint-spotlight-label">{t('summary.tasks')}</span>
            <span className={`maint-spotlight-value${pendingTasks.length > 0 ? ' is-warn' : ''}`}>{pendingTasks.length}</span>
            <span className="maint-spotlight-sub">{t('summary.tasks_sub')}</span>
          </div>
          <div className="maint-spotlight-item">
            <span className="maint-spotlight-label">{t('summary.disk')}</span>
            <span className={`maint-spotlight-value${diskPct != null && diskPct >= 92 ? ' is-warn' : ''}`}>
              {diskPct != null ? `${diskPct}%` : '—'}
            </span>
            <span className="maint-spotlight-sub">{t('summary.disk_sub')}</span>
          </div>
        </section>

        <nav className="maint-tabs" aria-label="Maintenance sections">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`maint-tab ${activeTab === tab ? 'maint-tab-active' : ''}`}
              title={tabFullLabel[tab]}
              onClick={() => setActiveTab(tab)}
            >
              <span className={`codicon codicon-${MAINT_TAB_META[tab].icon}`} aria-hidden />
              <span>{tabShortLabel[tab]}</span>
              <span className="maint-tab-full">{tabFullLabel[tab]}</span>
            </button>
          ))}
        </nav>

        {activeTab === 'Overview / Health Dashboard' ? (
          <MaintenanceOverviewTab
            t={t}
            activeJobCount={activeJobCount}
            onOpenLogsTab={() => setActiveTab('Logs & History')}
            guardian={guardian}
            guardianOverallLevel={guardianOverallLevel}
            m={m}
            memPct={memPct}
            diskPct={diskPct}
            runningContainers={runningContainers}
            containers={containers}
            topProcesses={topProcesses}
            security={security}
            pendingTasks={pendingTasks}
            onOpenTab={setActiveTab}
            onOpenScheduleTab={() => setActiveTab('Scheduled / Automation')}
            onUpdateTaskDone={(taskId, done) => void updateTask(taskId, { done })}
          />
        ) : null}

        {activeTab === 'System Cleanup' ? (
          <MaintenanceCleanupTab
            t={t}
            recommendedSelection={recommendedSelection}
            setRecommendedSelection={setRecommendedSelection}
            onRunRecommended={() => void vm.runRecommendedMaintenance()}
            busyCleanup={busyCleanup}
            savingState={savingState}
          />
        ) : null}

        {activeTab === 'Data & Profiles' ? (
          <MaintenanceDataProfilesTab
            t={t}
            state={state}
            savingState={savingState}
            serviceState={serviceState}
            systemdBusy={systemdBusy}
            systemdError={systemdError}
            onCheckAllProfiles={() => void vm.checkAllProfiles()}
            onRefreshSystemd={() => void vm.refreshSystemdSnapshot()}
            onCheckProfile={(profile) => void vm.checkProfileHealth(profile)}
            onRunProfile={(profile) => void vm.runProfile(profile)}
            onStartSystemd={(id) => void vm.startSystemdService(id)}
          />
        ) : null}

        {activeTab === 'Scheduled / Automation' ? (
          <MaintenanceScheduleTab
            t={t}
            state={state}
            savingState={savingState}
            newTaskTitle={newTaskTitle}
            setNewTaskTitle={setNewTaskTitle}
            newCron={newCron}
            setNewCron={setNewCron}
            newCmd={newCmd}
            setNewCmd={setNewCmd}
            editTaskId={editTaskId}
            setEditTaskId={setEditTaskId}
            editDraft={editDraft}
            setEditDraft={setEditDraft}
            runbookBusyId={runbookBusyId}
            onAddTask={() => void vm.addTask()}
            onUpdateTask={(taskId, patch) => void updateTask(taskId, patch)}
            onRemoveTask={(taskId) => void vm.removeTask(taskId)}
            onSaveReminder={(days) => void vm.saveReminder(days)}
            onRunHostProbe={vm.runHostProbe}
            onCommandPeek={setCommandPeek}
          />
        ) : null}

        {activeTab === 'Logs & History' ? (
          <MaintenanceLogsTab
            t={t}
            jobs={jobs}
            state={state}
            diagnostics={diagnostics}
            runningDiagnostics={runningDiagnostics}
            includeSensitiveBundle={includeSensitiveBundle}
            setIncludeSensitiveBundle={setIncludeSensitiveBundle}
            onRunDiagnostics={() => void vm.runDiagnosticsWizard()}
            onExportReport={() => void vm.exportDiagnosticReport()}
          />
        ) : null}

        {runbook ? (
          <section className="maint-output-panel" aria-live="polite">
            <div className="maint-output-head">
              <h2 className="maint-output-title">{runbook.title}</h2>
              <button type="button" className="hp-btn" onClick={() => setRunbook(null)}>
                {t('page.close')}
              </button>
            </div>
            <pre className="maint-output-body">{runbook.text}</pre>
          </section>
        ) : null}

        {commandPeek ? (
          <section className="maint-output-panel">
            <div className="maint-output-head">
              <h2 className="maint-output-title">{t('section.commandHint')}</h2>
              <button type="button" className="hp-btn" onClick={() => setCommandPeek(null)}>
                {t('page.close')}
              </button>
            </div>
            <pre className="maint-output-body maint-output-body--compact">{commandPeek}</pre>
          </section>
        ) : null}

        {status ? (
          <div
            role="status"
            className={`hp-status-alert ${statusTone === 'success' ? 'success' : 'warning'}`}
            style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
          >
            <span style={{ flex: '1 1 220px', minWidth: 0 }}>{status}</span>
            <button type="button" className="hp-btn" onClick={() => setStatus('')} aria-label={t('page.dismissNotification')}>
              {t('page.dismiss')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
