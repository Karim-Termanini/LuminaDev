import type {
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

export type ContainerPortBinding = {
  hostPort: number
  containerPort: number
  protocol: 'tcp' | 'udp'
}

export type ContainerReconfigureRequest = {
  id: string
  ports?: ContainerPortBinding[]
  env?: string[]
  networkMode?: string
  restartPolicy?: string
}

export type ContainerInspectData = {
  id: string
  name: string
  image: string
  state: string
  ports: ContainerPortBinding[]
  env: string[]
  networks: string[]
  volumes: string[]
  restartPolicy: string
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
  /** `C` = unmerged / merge conflict (from `git status --porcelain` XY). */
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

export type DoctorFindingCategory =
  | 'configuration'
  | 'security'
  | 'performance'
  | 'environment'
  | 'overview'
export type DoctorFindingSeverity = 'critical' | 'warning' | 'info' | 'ok'

export type DoctorFinding = {
  id: string
  category: DoctorFindingCategory
  severity: DoctorFindingSeverity
  title: string
  detail: string
  fix?: { label: string; action?: string }
}

export type GitDoctorScanResponse =
  | {
      ok: true
      gitVersion: string | null
      healthScore: number
      findings: DoctorFinding[]
    }
  | {
      ok: false
      error: string
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
  /** Host has a default SSH public key (~/.ssh/id_ed25519.pub or id_rsa.pub). */
  sshHostKeyPresent: boolean
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

/** Store key `kernel_links`: maps kernel ID to linked project path. */
export type KernelLinks = Record<string, string>

export type PerfSnapshot = {
  startupMs: number
  rssMb: number
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
  dockerInspect: 'dh:docker:inspect',
  dockerReconfigure: 'dh:docker:reconfigure',
  dockerContainerStats: 'dh:docker:container:stats',
  /** Returns HostMetricsResponse (metrics + read-only systemd rows). */
  metrics: 'dh:metrics',
  hostExec: 'dh:host:exec',
  composeUp: 'dh:compose:up',
  composeLogs: 'dh:compose:logs',
  composeDown: 'dh:compose:down',
  /** Stop containers without removing them (docker compose stop). */
  composeStop: 'dh:compose:stop',
  profileSwitch: 'dh:profile:switch',
  profileCredentialsStore: 'dh:profile:credentials:store',
  profileCredentialsList: 'dh:profile:credentials:list',
  profileCredentialsDelete: 'dh:profile:credentials:delete',
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
  gitDoctorScan: 'dh:git:doctor:scan',
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
  storeGet: 'dh:store:get',
  storeSet: 'dh:store:set',
  storeDelete: 'dh:store:delete',
  jobStart: 'dh:job:start',
  jobsList: 'dh:job:list',
  jobCancel: 'dh:job:cancel',
  logStreamStart: 'dh:log:stream:start',
  logStreamStop: 'dh:log:stream:stop',
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
  runtimeInstalledVersions: 'dh:runtime:installed-versions',
  runtimeGetVersions: 'dh:runtime:get-versions',
  runtimeSetActive: 'dh:runtime:set-active',
  runtimeCheckDeps: 'dh:runtime:check-deps',
  runtimeUninstallPreview: 'dh:runtime:uninstall:preview',
  runtimeRemoveVersion: 'dh:runtime:remove-version',
  perfSnapshot: 'dh:perf:snapshot',
  diagnosticsBundleCreate: 'dh:diagnostics:bundle:create',
  systemReadinessCheck: 'dh:system:readiness:check',
  systemReadinessFix: 'dh:system:readiness:fix',
  terminalGetAllEnv: 'dh:terminal:get-all-env',
  cloudAuthConnectStart: 'dh:cloud:auth:connect-start',
  cloudAuthConnectPoll: 'dh:cloud:auth:connect-poll',
  cloudAuthConnectPat: 'dh:cloud:auth:connect-pat',
  cloudAuthDisconnect: 'dh:cloud:auth:disconnect',
  cloudAuthStatus: 'dh:cloud:auth:status',
  cloudGitPrs: 'dh:cloud:git:prs',
  cloudGitReviewRequests: 'dh:cloud:git:review-requests',
  cloudGitInbox: 'dh:cloud:git:inbox',
  cloudGitPipelines: 'dh:cloud:git:pipelines',
  cloudGitIssues: 'dh:cloud:git:issues',
  cloudGitReleases: 'dh:cloud:git:releases',
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
  /** Legacy — Pro Git UI removed; handler kept for tests. */
  gitVcsMerge: 'dh:git:vcs:merge',
  /** Legacy — Pro Git UI removed; handler kept for tests. */
  gitVcsRebase: 'dh:git:vcs:rebase',
  /** Legacy — Pro Git UI removed; handler kept for tests. */
  gitVcsStashPop: 'dh:git:vcs:stash-pop',
  gitVcsMergeAbort: 'dh:git:vcs:merge-abort',
  gitVcsRebaseAbort: 'dh:git:vcs:rebase-abort',
  gitVcsMergeContinue: 'dh:git:vcs:merge-continue',
  gitVcsRebaseContinue: 'dh:git:vcs:rebase-continue',
  /** Legacy — Pro Git UI removed; handler kept for tests. */
  gitVcsRebaseSkip: 'dh:git:vcs:rebase-skip',
  /** Legacy — Pro Git UI removed; handler kept for tests. */
  gitVcsRenameBranch: 'dh:git:vcs:rename-branch',
  /** Legacy — Pro Git UI removed; handler kept for tests. */
  gitVcsConflictDiff: 'dh:git:vcs:conflict-diff',
  /** Legacy — Pro Git UI removed; handler kept for tests. */
  gitVcsConflictHunks: 'dh:git:vcs:conflict-hunks',
  /** Legacy — Pro Git UI removed; handler kept for tests. */
  gitVcsResolveConflict: 'dh:git:vcs:resolve-conflict',
  /** Legacy — Pro Git UI removed; handler kept for tests. */
  gitVcsResolveHunk: 'dh:git:vcs:resolve-hunk',
  editorList: 'dh:editor:list',
  editorOpen: 'dh:editor:open',
  cloudGitCreatePr: 'dh:cloud:git:create-pr',
  cloudGitFindPr: 'dh:cloud:git:find-pr',
  cloudGitGetPrChecks: 'dh:cloud:git:get-pr-checks',
  /** Removed from product scope — in-app PR merge; open PR in browser instead. Handler kept for contract tests. */
  cloudGitMergePr: 'dh:cloud:git:merge-pr',
  appInfo: 'dh:app:info',
  appUpdateCheck: 'dh:app:update:check',
  profileRunningStatus: 'dh:profile:running-status',
  profileCredentialsGet: 'dh:profile:credentials:get',
  portsSuggest: 'dh:ports:suggest',
  projectEnsureDir: 'dh:project:ensure_dir',
  projectScaffold: 'dh:project:scaffold',
  projectInstallDeps: 'dh:project:install_deps',
  fsExists: 'dh:fs:exists',
  /** Open a directory path in the system file manager (xdg-open). */
  fsOpen: 'dh:fs:open',
} as const

export type DockerImageActionPayload = { id: string; action: DockerImageAction; force?: boolean }
export type DockerVolumeActionPayload = { name: string; action: DockerVolumeAction }
export type DockerNetworkActionPayload = { id: string; action: DockerNetworkAction }
