import { z } from 'zod'

export const DockerContainerActionSchema = z.enum(['start', 'stop', 'restart', 'remove'])
export const DockerImageActionSchema = z.enum(['remove'])
export const DockerVolumeActionSchema = z.enum(['remove'])
export const DockerNetworkActionSchema = z.enum(['remove'])
export const DockerErrorCodeSchema = z.enum([
  'DOCKER_PERMISSION_DENIED',
  'DOCKER_UNAVAILABLE',
  'DOCKER_NOT_FOUND',
  'DOCKER_CONFLICT',
  'DOCKER_TIMEOUT',
  'DOCKER_INVALID_REQUEST',
  'DOCKER_UNKNOWN',
])

export const DockerLogsRequestSchema = z.object({
  id: z.string().min(1).max(256),
  tail: z.number().int().min(1).max(5000).optional(),
})

export const DockerCreateRequestSchema = z.object({
  image: z.string().min(1).max(256),
  name: z.string().trim().min(1).max(64),
  command: z.string().max(512).optional(),
  ports: z.array(z.object({ hostPort: z.number().int().min(1).max(65535), containerPort: z.number().int().min(1).max(65535), protocol: z.enum(['tcp', 'udp']).optional() })).optional(),
  env: z.array(z.string().min(1).max(1024)).optional(),
  volumes: z.array(z.object({ hostPath: z.string().min(1).max(4096), containerPath: z.string().min(1).max(4096) })).optional(),
  autoStart: z.boolean().optional(),
})

export const DockerPullRequestSchema = z.object({
  image: z.string().trim().min(1).max(256),
})

export const DockerVolumeCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(256),
})

export const DockerNetworkCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(256),
})

export const DockerRemapPortRequestSchema = z.object({
  id: z.string().min(1).max(256),
  oldHostPort: z.number().int().min(1).max(65535),
  newHostPort: z.number().int().min(1).max(65535),
})

export const DockerImageActionRequestSchema = z.object({
  id: z.string().min(1).max(256),
  action: DockerImageActionSchema,
  force: z.boolean().optional(),
})

export const DockerVolumeActionRequestSchema = z.object({
  name: z.string().min(1).max(256),
  action: DockerVolumeActionSchema,
})

export const DockerNetworkActionRequestSchema = z.object({
  id: z.string().min(1).max(256),
  action: DockerNetworkActionSchema,
})

export const HostExecRequestSchema = z.object({
  command: z.enum([
    'systemctl_is_active',
    'nvidia_smi_short',
    'flatpak_spawn_echo',
    'docker_install_step',
    /** Fixed whitelisted host probes; output shown in-app (Maintenance runbook). */
    'maintenance_docker_system_df',
    'maintenance_docker_ps_table',
    'maintenance_journalctl_docker',
    'maintenance_du_cache_tail',
  ] as const),
  unit: z.string().max(128).optional(),
  distro: z.enum(['ubuntu', 'fedora', 'arch']).optional(),
  stepIndex: z.number().int().min(0).max(8).optional(),
})

export const ComposeProfileSchema = z.enum([
  'web-dev',
  'data-science',
  'ai-ml',
  'mobile',
  'game-dev',
  'infra',
  'desktop-gui',
  'docs',
  'empty',
])

/** Preserved compose template id for a user-named dashboard profile. */
export const CustomProfileEntrySchema = z.object({
  name: z.string().trim().min(1).max(128),
  baseTemplate: ComposeProfileSchema,
})

export const CustomProfilesStoreSchema = z.array(CustomProfileEntrySchema).max(50)

export const WizardStateStoreSchema = z.object({
  completed: z.boolean(),
  /** If true, wizard is shown again on next launch. */
  showOnStartup: z.boolean().optional().default(false),
  /** When `completed` is false, last wizard step (0–6) for resume-after-restart. */
  stepIndex: z.number().int().min(0).max(6).optional(),
  /** Git step (draft); applied to host/sandbox only when user clicks Apply. */
  gitName: z.string().max(128).optional(),
  gitEmail: z.string().max(256).optional(),
  gitTarget: z.enum(['sandbox', 'host']).optional(),
  /** SSH public key shown after Generate (public material only). */
  sshPubKey: z.string().max(8192).optional(),
  /** True once keygen succeeded this run; used to refetch pub key on resume if `sshPubKey` missing. */
  sshKeyGenerated: z.boolean().optional(),
  /** Starter profile picked on step 5 (before optional `active_profile` store write). */
  pickedStarterProfile: ComposeProfileSchema.optional(),
})

/** Optional actions after app shell loads (wizard dismissed). */
export const OnLoginAutomationStoreSchema = z.object({
  /** Run `composeUp` for persisted `active_profile` once per launch. */
  composeUpForActiveProfile: z.boolean().optional().default(false),
  /** Re-read `layout.json` and `layoutSet` it (same pattern as Maintenance “refresh widgets”). */
  reloadDashboardLayout: z.boolean().optional().default(false),
})

export const MaintenanceTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  done: z.boolean(),
  cronHint: z.string().trim().max(200).optional(),
  commandHint: z.string().trim().max(400).optional(),
  updatedAtIso: z.string().datetime(),
})

export const MaintenanceProfileHealthSchema = z.object({
  profile: ComposeProfileSchema,
  health: z.enum(['healthy', 'degraded', 'offline', 'unknown']),
  lastCheckedAtIso: z.string().datetime().optional(),
  lastRunAtIso: z.string().datetime().optional(),
  note: z.string().max(300).optional(),
})

export const MaintenanceStateStoreSchema = z.object({
  tasks: z.array(MaintenanceTaskSchema).max(100).default([]),
  profileHealth: z.array(MaintenanceProfileHealthSchema).max(40).default([]),
  history: z
    .array(
      z.object({
        id: z.string().uuid(),
        atIso: z.string().datetime(),
        action: z.string().min(1).max(120),
        result: z.enum(['success', 'warning', 'failed']),
        note: z.string().max(400).optional(),
        reclaimedMb: z.number().min(0).max(1_000_000).optional(),
      })
    )
    .max(200)
    .default([]),
  lastMaintenanceAtIso: z.string().datetime().optional(),
  reminderDays: z.number().int().min(1).max(60).optional(),
})

/** Keys with typed payloads persisted under userData (`store_<key>.json`). */
export const StoreKeySchema = z.enum([
  'custom_profiles',
  'wizard_state',
  'ssh_bookmarks',
  'maintenance_state',
  'active_profile',
  'on_login_automation',
])

export const StoreGetRequestSchema = z.object({
  key: StoreKeySchema,
})

export const StoreSetRequestSchema = z.discriminatedUnion('key', [
  z.object({
    key: z.literal('custom_profiles'),
    data: CustomProfilesStoreSchema,
  }),
  z.object({
    key: z.literal('wizard_state'),
    data: WizardStateStoreSchema,
  }),
  z.object({
    key: z.literal('ssh_bookmarks'),
    data: z.array(z.object({
      id: z.string(),
      name: z.string(),
      user: z.string(),
      host: z.string(),
      port: z.number().default(22),
    })),
  }),
  z.object({
    key: z.literal('maintenance_state'),
    data: MaintenanceStateStoreSchema,
  }),
  z.object({
    key: z.literal('active_profile'),
    // Stores the ComposeProfile id of the active preset environment.
    data: ComposeProfileSchema,
  }),
  z.object({
    key: z.literal('on_login_automation'),
    data: OnLoginAutomationStoreSchema,
  }),
])
export const ComposeUpRequestSchema = z.object({
  profile: ComposeProfileSchema,
})

export const GitCloneRequestSchema = z.object({
  url: z.string().url().max(2048),
  targetDir: z.string().min(1).max(4096),
})

export const GitStatusRequestSchema = z.object({
  repoPath: z.string().min(1).max(4096),
})

export const GitRecentAddSchema = z.object({
  path: z.string().min(1).max(4096),
})

export const GitConfigSetSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  defaultBranch: z.string().max(64).optional(),
  defaultEditor: z.string().max(256).optional(),
  target: z.enum(['sandbox', 'host']),
})

export const GitConfigListSchema = z.object({
  target: z.enum(['sandbox', 'host']),
})

export const SshGenerateSchema = z.object({
  target: z.enum(['sandbox', 'host']),
  email: z.string().optional(),
})

export const SshGetPubSchema = z.object({
  target: z.enum(['sandbox', 'host']),
})

export const SshTestGithubSchema = z.object({
  target: z.enum(['sandbox', 'host']),
})

export const RuntimeGetVersionsRequestSchema = z.object({
  runtimeId: z.string().min(1).max(64).optional(),
  method: z.enum(['system', 'local']).optional(),
})

export const RuntimeSetActiveRequestSchema = z.object({
  runtimeId: z.string().min(1).max(64),
  path: z.string().min(1).max(4096),
})

export const RuntimeCheckDepsRequestSchema = z.object({
  runtimeId: z.string().min(1).max(64).optional(),
})

export const RuntimeUninstallPreviewRequestSchema = z.object({
  runtimeId: z.string().min(1).max(64),
  removeMode: z.enum(['runtime_only', 'runtime_and_deps']).default('runtime_only'),
})

export type DockerContainerAction = z.infer<typeof DockerContainerActionSchema>
export type DockerImageAction = z.infer<typeof DockerImageActionSchema>
export type DockerVolumeAction = z.infer<typeof DockerVolumeActionSchema>
export type DockerNetworkAction = z.infer<typeof DockerNetworkActionSchema>
export type DockerErrorCode = z.infer<typeof DockerErrorCodeSchema>
export type ComposeProfile = z.infer<typeof ComposeProfileSchema>
export type CustomProfileEntry = z.infer<typeof CustomProfileEntrySchema>
export type MaintenanceTask = z.infer<typeof MaintenanceTaskSchema>
export type MaintenanceProfileHealth = z.infer<typeof MaintenanceProfileHealthSchema>
export type MaintenanceStateStore = z.infer<typeof MaintenanceStateStoreSchema>
export type StoreKey = z.infer<typeof StoreKeySchema>
export type StoreGetRequest = z.infer<typeof StoreGetRequestSchema>
export type StoreSetRequest = z.infer<typeof StoreSetRequestSchema>
export type WizardStateStore = z.infer<typeof WizardStateStoreSchema>
export type OnLoginAutomationStore = z.infer<typeof OnLoginAutomationStoreSchema>
export type SshBookmark = { id: string; name: string; user: string; host: string; port: number }

const defaultOnLoginAutomation: OnLoginAutomationStore = {
  composeUpForActiveProfile: false,
  reloadDashboardLayout: false,
}

/** Coerce persisted `on_login_automation` (or missing/invalid) to a safe object. */
export function parseOnLoginAutomation(data: unknown): OnLoginAutomationStore {
  const r = OnLoginAutomationStoreSchema.safeParse(data)
  return r.success ? r.data : defaultOnLoginAutomation
}

/** Normalize a persisted `active_profile` value: canonical enum or legacy aliases → ComposeProfile | null. */
export function parseStoredActiveProfile(data: unknown): ComposeProfile | null {
  if (typeof data !== 'string') return null
  const val = data.trim()
  if (val === 'minimal') return 'empty'
  if (val === 'desktop-qt') return 'desktop-gui'
  const parsed = ComposeProfileSchema.safeParse(val)
  return parsed.success ? parsed.data : null
}
