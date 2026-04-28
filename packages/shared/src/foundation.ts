import { z } from 'zod'

/** Runtime session (Flatpak vs native install). */
export const SessionKindSchema = z.enum(['flatpak', 'native'])
export type SessionKind = z.infer<typeof SessionKindSchema>

export const SessionInfoSchema = z.object({
  kind: SessionKindSchema,
  /** FLATPAK_ID when kind is flatpak */
  flatpakId: z.string().max(256).optional(),
  /** Short hint for UI */
  summary: z.string().max(512),
})
export type SessionInfo = z.infer<typeof SessionInfoSchema>

/** One placed widget on the dashboard (Phase 0: registry + persistence). */
export const DashboardPlacementSchema = z.object({
  instanceId: z.string().min(1).max(64),
  widgetTypeId: z.string().min(1).max(128),
})

export const DashboardLayoutFileSchema = z.object({
  version: z.literal(1),
  placements: z.array(DashboardPlacementSchema).max(24),
})
export type DashboardLayoutFile = z.infer<typeof DashboardLayoutFileSchema>
export type DashboardPlacement = z.infer<typeof DashboardPlacementSchema>

export const JobStartRequestSchema = z.object({
  kind: z.enum(['demo_countdown', 'runtime_install', 'runtime_update', 'runtime_uninstall', 'install_deps']),
  /** Total duration for the demo job (default 4s). */
  durationMs: z.number().int().min(400).max(120_000).optional(),
  /** For runtime_install/runtime_update/runtime_uninstall/install_deps: e.g. 'node', 'rust', 'python' */
  runtimeId: z.string().max(32).optional(),
  /** Optional version to install */
  version: z.string().max(64).optional(),
  /** Installation method: system package manager or local script */
  method: z.enum(['system', 'local']).optional(),
  /** For runtime_uninstall: remove runtime only, or include safe autoremove deps */
  removeMode: z.enum(['runtime_only', 'runtime_and_deps']).optional(),
})
export type JobStartRequest = z.infer<typeof JobStartRequestSchema>

export const JobStateSchema = z.enum(['running', 'completed', 'failed', 'cancelled'])
export type JobState = z.infer<typeof JobStateSchema>

export const JobSummarySchema = z.object({
  id: z.string().uuid(),
  kind: z.string().max(64),
  state: JobStateSchema,
  progress: z.number().int().min(0).max(100),
  logTail: z.array(z.string().max(2000)).max(20),
})
export type JobSummary = z.infer<typeof JobSummarySchema>

export const JobCancelRequestSchema = z.object({
  id: z.string().uuid(),
})
export type JobCancelRequest = z.infer<typeof JobCancelRequestSchema>

/** Default placements when no layout file exists yet. */
export function defaultDashboardLayout(): DashboardLayoutFile {
  return {
    version: 1,
    placements: [
      { instanceId: 'default-docker-hint', widgetTypeId: 'static.docker-permission-hint' },
      { instanceId: 'default-trust-hint', widgetTypeId: 'static.host-trust-hint' },
    ],
  }
}
