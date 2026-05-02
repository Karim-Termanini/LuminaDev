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
  createdAt: string
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
  swapTotalMb: number
  swapFreeMb: number
  uptimeSec: number
  diskTotalGb: number
  diskFreeGb: number
  diskReadMbps: number
  diskWriteMbps: number
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

export type FileEntry = {
  path: string
  status: 'M' | 'A' | 'D' | 'R' | '?' | 'C'
  oldPath?: string
}

export type BranchEntry = {
  name: string
  remote: boolean
  current: boolean
}

/** Named Git remote with fetch URL from `git remote -v` (fetch line). */
export type GitRemoteEntry = {
  name: string
  fetchUrl: string
}

export type HostPortRow = {
  protocol: 'tcp' | 'udp'
  port: number
  state: string
  service: string
}

export type TopProcessRow = {
  pid: number
  command: string
  cpuPercent: number
  memPercent: number
}

export type HostSecuritySnapshot = {
  firewall: 'active' | 'inactive' | 'unknown'
  selinux: string
  sshPermitRootLogin: string
  sshPasswordAuth: string
  failedAuth24h: number
  riskyOpenPorts: number[]
}

export type HostSecurityDrilldown = {
  failedAuthSamples: string[]
  riskyPortOwners: Array<{ port: number; process: string; pid?: number }>
}

export type HostSysInfo = {
  hostname: string
  os: string
  kernel: string
  arch: string
  uptime: number
  ip?: string
  distro?: string
  shell?: string
  de?: string
  wm?: string
  gpu?: string
  memoryUsage?: string
  packages?: string
  resolution?: string
}

export type RuntimeStatus = {
  id: string
  name: string
  installed: boolean
  version?: string
  path?: string
  allVersions?: Array<{ version: string; path: string }>
}

export type RuntimeStatusResponse = {
  runtimes: RuntimeStatus[]
}

export type PerfSnapshot = {
  startupMs: number
  rssMb: number
  heapUsedMb: number
  heapTotalMb: number
  uptimeSec: number
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
  /** Renderer → main: drop stdin handle and release PTY/child tracking (call on unmount). */
  terminalClose: 'dh:terminal:close',
  terminalData: 'dh:terminal:data',
  terminalExit: 'dh:terminal:exit',
  openExternalTerminal: 'dh:terminal:openExternal',
  gitClone: 'dh:git:clone',
  gitStatus: 'dh:git:status',
  gitRecentList: 'dh:git:recent:list',
  gitRecentAdd: 'dh:git:recent:add',
  gitConfigSet: 'dh:git:config:set',
  gitConfigSetKey: 'dh:git:config:set-key',
  gitConfigList: 'dh:git:config:list',
  sshGenerate: 'dh:ssh:generate',
  sshGetPub: 'dh:ssh:get:pub',
  sshTestGithub: 'dh:ssh:test:github',
  selectFolder: 'dh:dialog:folder',
  filePickOpen: 'dh:dialog:file:open',
  filePickSave: 'dh:dialog:file:save',
  sshListDir: 'dh:ssh:list:dir',
  sshSetupRemoteKey: 'dh:ssh:setup:remote:key',
  sshEnableLocal: 'dh:ssh:enable:local',
  sessionInfo: 'dh:session:info',
  layoutGet: 'dh:layout:get',
  layoutSet: 'dh:layout:set',
  storeGet: 'dh:store:get',
  storeSet: 'dh:store:set',
  storeDelete: 'dh:store:delete',
  jobStart: 'dh:job:start',
  jobsList: 'dh:job:list',
  jobCancel: 'dh:job:cancel',
  dockerInstall: 'dh:docker:install',
  dockerCheckInstalled: 'dh:docker:check-installed',
  getHostDistro: 'dh:host:distro',
  dockerSearch: 'dh:docker:search',
  dockerGetTags: 'dh:docker:tags',
  dockerTerminal: 'dh:docker:terminal',
  getHostPorts: 'dh:host:ports',
  getHostSysInfo: 'dh:host:sysinfo',
  monitorTopProcesses: 'dh:monitor:top-processes',
  monitorSecurity: 'dh:monitor:security',
  monitorSecurityDrilldown: 'dh:monitor:security-drilldown',
  runtimeStatus: 'dh:runtime:status',
  runtimeGetVersions: 'dh:runtime:get-versions',
  runtimeSetActive: 'dh:runtime:set-active',
  runtimeCheckDeps: 'dh:runtime:check-deps',
  runtimeUninstallPreview: 'dh:runtime:uninstall:preview',
  runtimeRemoveVersion: 'dh:runtime:remove-version',
  perfSnapshot: 'dh:perf:snapshot',
  diagnosticsBundleCreate: 'dh:diagnostics:bundle:create',
  terminalGetAllEnv: 'dh:terminal:get-all-env',
  cloudAuthConnectStart: 'dh:cloud:auth:connect-start',
  cloudAuthConnectPoll: 'dh:cloud:auth:connect-poll',
  cloudAuthConnectPat: 'dh:cloud:auth:connect-pat',
  cloudAuthDisconnect: 'dh:cloud:auth:disconnect',
  cloudAuthStatus: 'dh:cloud:auth:status',
  cloudGitPrs: 'dh:cloud:git:prs',
  gitVcsStatus: 'dh:git:vcs:status',
  gitVcsRemotes: 'dh:git:vcs:remotes',
  gitVcsDiff: 'dh:git:vcs:diff',
  gitVcsStage: 'dh:git:vcs:stage',
  gitVcsUnstage: 'dh:git:vcs:unstage',
  gitVcsCommit: 'dh:git:vcs:commit',
  gitVcsPush: 'dh:git:vcs:push',
  gitVcsPull: 'dh:git:vcs:pull',
  gitVcsFetch: 'dh:git:vcs:fetch',
  gitVcsBranches: 'dh:git:vcs:branches',
  gitVcsCheckout: 'dh:git:vcs:checkout',
  gitVcsStash: 'dh:git:vcs:stash',
} as const

export type DockerActionPayload = { id: string; action: DockerContainerAction }
export type DockerImageActionPayload = { id: string; action: DockerImageAction; force?: boolean }
export type DockerVolumeActionPayload = { name: string; action: DockerVolumeAction }
export type DockerNetworkActionPayload = { id: string; action: DockerNetworkAction }

export type ComposeUpPayload = { profile: ComposeProfile }
