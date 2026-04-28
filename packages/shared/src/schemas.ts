import { z } from 'zod'

export const DockerContainerActionSchema = z.enum(['start', 'stop', 'restart', 'remove'])
export const DockerImageActionSchema = z.enum(['remove'])
export const DockerVolumeActionSchema = z.enum(['remove'])
export const DockerNetworkActionSchema = z.enum(['remove'])

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
})

/** Keys with typed payloads persisted under userData (`store_<key>.json`). */
export const StoreKeySchema = z.enum(['custom_profiles', 'wizard_state', 'ssh_bookmarks'])

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

export type DockerContainerAction = z.infer<typeof DockerContainerActionSchema>
export type DockerImageAction = z.infer<typeof DockerImageActionSchema>
export type DockerVolumeAction = z.infer<typeof DockerVolumeActionSchema>
export type DockerNetworkAction = z.infer<typeof DockerNetworkActionSchema>
export type ComposeProfile = z.infer<typeof ComposeProfileSchema>
export type CustomProfileEntry = z.infer<typeof CustomProfileEntrySchema>
export type StoreKey = z.infer<typeof StoreKeySchema>
export type StoreGetRequest = z.infer<typeof StoreGetRequestSchema>
export type StoreSetRequest = z.infer<typeof StoreSetRequestSchema>
export type WizardStateStore = z.infer<typeof WizardStateStoreSchema>
export type SshBookmark = { id: string; name: string; user: string; host: string; port: number }
