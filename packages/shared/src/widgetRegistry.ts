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
    typeId: 'link.cloud-git',
    title: 'Cloud Git',
    description: 'Link GitHub or GitLab (device flow or PAT) for HTTPS remotes, PRs, issues, CI, and releases.',
    minCols: 1,
    ipcHints: ['dh:cloud:auth:status', 'dh:cloud:auth:connect-start'],
  },
  {
    typeId: 'live.git-recents',
    title: 'Recent Git repos',
    description: 'Recently opened local repositories with branch and dirty/sync snapshot.',
    minCols: 2,
    ipcHints: ['dh:git:recent:list', 'dh:git:vcs:status'],
  },
  {
    typeId: 'custom.placeholder',
    title: 'Custom slot',
    description: 'Reserved for Phase 1 custom profile / user widgets.',
    minCols: 2,
    ipcHints: [],
  },
  {
    typeId: 'guardian.summary',
    title: 'Guardian Status',
    description: 'High-level system health and maintenance summary.',
    minCols: 1,
    ipcHints: ['dh:metrics', 'dh:monitor:security', 'dh:job:list'],
  },
] as const

const allowed = new Set(WIDGET_DEFINITIONS.map((w) => w.typeId))

export function isRegisteredWidgetType(typeId: string): boolean {
  return allowed.has(typeId)
}

export function getWidgetDefinition(typeId: string): WidgetDefinition | undefined {
  return WIDGET_DEFINITIONS.find((w) => w.typeId === typeId)
}
