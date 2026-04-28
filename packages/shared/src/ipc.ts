import type {
  ComposeProfile,
  DockerContainerAction,
  DockerImageAction,
  DockerNetworkAction,
  DockerVolumeAction,
} from './schemas.js'

export type ContainerRow = {
  id: string
  name: string
  image: string
  imageId?: string
  state: string
  status: string
  ports: string
  networks?: string[]
  volumes?: string[]
}

export type ImageRow = {
  id: string
  repoTags: string[]
  sizeMb: number
  createdAt: number
}

export type VolumeRow = {
  name: string
  driver: string
  mountpoint: string
  scope: string
  usedBy?: string[]
}

export type NetworkRow = {
  id: string
  name: string
  driver: string
  scope: string
  usedBy?: string[]
}

export type HostMetrics = {
  cpuUsagePercent: number
  cpuModel: string
  loadAvg: number[]
  totalMemMb: number
  freeMemMb: number
  uptimeSec: number
  diskTotalGb: number
  diskFreeGb: number
  netRxMbps: number
  netTxMbps: number
}

export type SystemdRow = {
  name: string
  state: Readonly<'active' | 'inactive' | 'failed' | 'unknown'>
}

export type GitRepoEntry = {
  path: string
  lastOpened: number
}

/** Renderer ↔ main IPC channel names */
export type HostMetricsResponse = {
  metrics: HostMetrics
  systemd: SystemdRow[]
}

export const IPC = {
  dockerList: 'dh:docker:list',
  dockerAction: 'dh:docker:action',
  dockerLogs: 'dh:docker:logs',
  dockerCreate: 'dh:docker:create',
  dockerImagesList: 'dh:docker:images:list',
  dockerImageAction: 'dh:docker:image:action',
  dockerVolumesList: 'dh:docker:volumes:list',
  dockerVolumeAction: 'dh:docker:volume:action',
  dockerVolumeCreate: 'dh:docker:volume:create',
  dockerNetworksList: 'dh:docker:networks:list',
  dockerNetworkAction: 'dh:docker:network:action',
  dockerNetworkCreate: 'dh:docker:network:create',
  dockerPrune: 'dh:docker:prune',
  dockerPrunePreview: 'dh:docker:prune:preview',
  dockerCleanupRun: 'dh:docker:cleanup:run',
  dockerPull: 'dh:docker:pull',
  dockerRemapPort: 'dh:docker:remap-port',
  /** Returns HostMetricsResponse (metrics + read-only systemd rows). */
  metrics: 'dh:metrics',
  hostExec: 'dh:host:exec',
  composeUp: 'dh:compose:up',
  composeLogs: 'dh:compose:logs',
  terminalCreate: 'dh:terminal:create',
  terminalWrite: 'dh:terminal:write',
  terminalResize: 'dh:terminal:resize',
  terminalData: 'dh:terminal:data',
  terminalExit: 'dh:terminal:exit',
  openExternalTerminal: 'dh:terminal:openExternal',
  gitClone: 'dh:git:clone',
  gitStatus: 'dh:git:status',
  gitRecentList: 'dh:git:recent:list',
  gitRecentAdd: 'dh:git:recent:add',
  gitConfigSet: 'dh:git:config:set',
  gitConfigList: 'dh:git:config:list',
  sshGenerate: 'dh:ssh:generate',
  sshGetPub: 'dh:ssh:get:pub',
  sshTestGithub: 'dh:ssh:test:github',
  selectFolder: 'dh:dialog:folder',
  filePickOpen: 'dh:dialog:file:open',
  filePickSave: 'dh:dialog:file:save',
  sshListDir: 'dh:ssh:list:dir',
  sshSetupRemoteKey: 'dh:ssh:setup:remote:key',
  sessionInfo: 'dh:session:info',
  layoutGet: 'dh:layout:get',
  layoutSet: 'dh:layout:set',
  storeGet: 'dh:store:get',
  storeSet: 'dh:store:set',
  jobStart: 'dh:job:start',
  jobsList: 'dh:job:list',
  jobCancel: 'dh:job:cancel',
  dockerInstall: 'dh:docker:install',
  dockerCheckInstalled: 'dh:docker:check-installed',
  getHostDistro: 'dh:host:distro',
  dockerSearch: 'dh:docker:search',
  dockerGetTags: 'dh:docker:tags',
  dockerTerminal: 'dh:docker:terminal',
} as const

export type DockerActionPayload = { id: string; action: DockerContainerAction }
export type DockerImageActionPayload = { id: string; action: DockerImageAction; force?: boolean }
export type DockerVolumeActionPayload = { name: string; action: DockerVolumeAction }
export type DockerNetworkActionPayload = { id: string; action: DockerNetworkAction }

export type ComposeUpPayload = { profile: ComposeProfile }
