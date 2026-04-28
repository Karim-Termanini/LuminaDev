/** Declarative registry for dashboard widgets (Phase 0: metadata + persistence; Phase 1+ adds behavior). */
export type WidgetDefinition = {
  typeId: string
  title: string
  description: string
  /** Minimum grid column span (1–4) for responsive layout hints */
  minCols: 1 | 2 | 3 | 4
  /** IPC surfaces this widget may call (informational for docs / Phase 2 guards) */
  ipcHints: readonly string[]
}

export const WIDGET_DEFINITIONS: readonly WidgetDefinition[] = [
  {
    typeId: 'static.docker-permission-hint',
    title: 'Docker access',
    description: 'Reminder about socket permissions and Flatpak overrides.',
    minCols: 1,
    ipcHints: ['dh:docker:list'],
  },
  {
    typeId: 'static.host-trust-hint',
    title: 'Trust levels',
    description: 'User-space installs vs system-wide tools that need elevated rights.',
    minCols: 1,
    ipcHints: [],
  },
  {
    typeId: 'link.workstation',
    title: 'Compose & workstation',
    description: 'Jump to bundled compose profiles and logs.',
    minCols: 1,
    ipcHints: ['dh:compose:logs', 'dh:compose:up'],
  },
  {
    typeId: 'link.system',
    title: 'System metrics',
    description: 'Open the system page for host metrics and GPU probe.',
    minCols: 1,
    ipcHints: ['dh:metrics', 'dh:host:exec'],
  },
  {
    typeId: 'custom.placeholder',
    title: 'Custom slot',
    description: 'Reserved for Phase 1 custom profile / user widgets.',
    minCols: 2,
    ipcHints: [],
  },
] as const

const allowed = new Set(WIDGET_DEFINITIONS.map((w) => w.typeId))

export function isRegisteredWidgetType(typeId: string): boolean {
  return allowed.has(typeId)
}

export function getWidgetDefinition(typeId: string): WidgetDefinition | undefined {
  return WIDGET_DEFINITIONS.find((w) => w.typeId === typeId)
}
