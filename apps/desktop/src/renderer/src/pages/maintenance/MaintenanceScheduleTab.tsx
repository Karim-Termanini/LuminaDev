import type { MaintenanceStateStore, MaintenanceTask } from '@linux-dev-home/shared'
import type { TFunction } from 'i18next'
import type { ReactElement } from 'react'
import { MAINTENANCE_CRON_PRESETS, type RunbookOp } from '../maintenancePageHelpers'
import { MaintenanceRunbookStrip } from './MaintenanceUi'

export function MaintenanceScheduleTab({
  t,
  state,
  savingState,
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
  onAddTask,
  onUpdateTask,
  onRemoveTask,
  onSaveReminder,
  onRunHostProbe,
  onCommandPeek,
}: {
  t: TFunction<'maintenance'>
  state: MaintenanceStateStore
  savingState: boolean
  newTaskTitle: string
  setNewTaskTitle: (v: string) => void
  newCron: string
  setNewCron: (v: string) => void
  newCmd: string
  setNewCmd: (v: string) => void
  editTaskId: string | null
  setEditTaskId: (v: string | null) => void
  editDraft: string
  setEditDraft: (v: string) => void
  runbookBusyId: string | null
  onAddTask: () => void
  onUpdateTask: (taskId: string, patch: Partial<MaintenanceTask>) => void
  onRemoveTask: (taskId: string) => void
  onSaveReminder: (days: number) => void
  onRunHostProbe: (op: RunbookOp) => void
  onCommandPeek: (cmd: string) => void
}): ReactElement {
  return (
    <section className="maint-panel">
      <div className="maint-section-head">{t('section.maintenanceTasksRunbook')}</div>
      <p className="maint-section-lead">{t('tasks.lead')}</p>
      <div className="maint-task-form">
        <input
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          className="hp-input"
          placeholder={t('tasks.titlePlaceholder')}
        />
        <div className="hp-grid-2">
          <input value={newCron} onChange={(e) => setNewCron(e.target.value)} className="hp-input" placeholder={t('tasks.cronPlaceholder')} />
          <input value={newCmd} onChange={(e) => setNewCmd(e.target.value)} className="hp-input" placeholder={t('tasks.commandPlaceholder')} />
        </div>
        <div className="maint-cron-presets">
          <span className="maint-cron-presets-label">{t('tasks.cronPresets')}</span>
          {MAINTENANCE_CRON_PRESETS.map((preset) => (
            <button
              key={preset.cron}
              type="button"
              className="maint-cron-preset"
              title={t(preset.descKey)}
              onClick={() => setNewCron(preset.cron)}
              disabled={savingState}
            >
              <strong>{t(preset.labelKey)}</strong>
              <span className="hp-muted">{preset.cron}</span>
            </button>
          ))}
        </div>
        <button className="hp-btn hp-btn-primary" onClick={() => void onAddTask()} disabled={savingState || !newTaskTitle.trim()}>
          {t('tasks.add')}
        </button>
      </div>
      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
        {state.tasks.length === 0 ? (
          <div className="hp-muted">{t('tasks.noTasks')}</div>
        ) : (
          state.tasks.map((task) => (
            <div key={task.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
              <div className="hp-row-wrap" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <input
                    type="checkbox"
                    checked={task.done}
                    onChange={() => void onUpdateTask(task.id, { done: !task.done })}
                    aria-label={task.done ? 'Mark not done' : 'Mark done'}
                  />
                  {editTaskId === task.id ? (
                    <input
                      className="hp-input"
                      style={{ flex: 1, minWidth: 0 }}
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onBlur={() => {
                        void (async () => {
                          const title = editDraft.trim()
                          if (title) onUpdateTask(task.id, { title })
                          setEditTaskId(null)
                        })()
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        if (e.key === 'Escape') {
                          setEditTaskId(null)
                          setEditDraft('')
                        }
                      }}
                      autoFocus
                      aria-label="Edit task title"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditTaskId(task.id)
                        setEditDraft(task.title)
                      }}
                      className="hp-btn"
                      style={{
                        textAlign: 'left',
                        textDecoration: task.done ? 'line-through' : 'none',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        padding: '2px 6px',
                        font: 'inherit',
                        flex: 1,
                        minWidth: 0,
                      }}
                      title="Rename task"
                    >
                      {task.title}
                    </button>
                  )}
                </div>
                <button className="hp-btn hp-btn-danger" onClick={() => void onRemoveTask(task.id)}>
                  {t('tasks.delete')}
                </button>
              </div>
              {task.cronHint ? <div className="mono hp-muted" style={{ fontSize: 11, marginTop: 6 }}>cron: {task.cronHint}</div> : null}
              {task.commandHint ? (
                <div className="hp-row-wrap" style={{ marginTop: 6 }}>
                  <button type="button" className="hp-btn" onClick={() => onCommandPeek(task.commandHint ?? '')}>
                    {t('tasks.viewCommandHint')}
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
      <MaintenanceRunbookStrip runbookBusyId={runbookBusyId} onRun={onRunHostProbe} />
      <div className="maint-divider">
        <div className="maint-section-head">{t('schedule.remindersTitle')}</div>
        <p className="maint-section-lead">{t('schedule.remindersLead')}</p>
        <div className="hp-row-wrap">
          <button className="hp-btn" onClick={() => void onSaveReminder(3)}>
            {t('schedule.reminder3d')}
          </button>
          <button className="hp-btn" onClick={() => void onSaveReminder(7)}>
            {t('schedule.reminder7d')}
          </button>
          <button className="hp-btn" onClick={() => void onSaveReminder(14)}>
            {t('schedule.reminder14d')}
          </button>
          <span className="hp-muted">{t('schedule.currentReminder', { days: state.reminderDays ?? 'none' })}</span>
        </div>
      </div>
    </section>
  )
}
