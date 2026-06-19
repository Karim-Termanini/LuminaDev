import { z } from 'zod'

import { EmptyRequestSchema } from './schemas.js'

/** No-payload request for `dh:session:info`. */
export const SessionInfoRequestSchema = EmptyRequestSchema
export type SessionInfoRequest = z.infer<typeof SessionInfoRequestSchema>

/** Response subset for `dh:session:info` (full IPC envelope includes `ok`, `mode`, `platform`). */
export const SessionInfoSchema = z.object({
  kind: z.literal('native'),
  /** Short hint for UI */
  summary: z.string().max(512),
})
export type SessionInfo = z.infer<typeof SessionInfoSchema>

export const JobStartRequestSchema = z.object({
  kind: z.enum([
    'demo_countdown',
    'runtime_install',
    'runtime_update',
    'runtime_uninstall',
    'install_deps',
  ]),
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
  /** Whether to automatically add the bin path to shell profile (~/.bashrc, etc.) */
  addToPath: z.boolean().optional(),
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
