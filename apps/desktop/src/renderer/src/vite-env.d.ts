/// <reference types="vite/client" />

import type { ComposeProfile, DashboardLayoutFile, HostPortRow, HostSysInfo } from '@linux-dev-home/shared'

export {}

declare global {
  interface Window {
    dh: {
      dockerList: () => Promise<unknown>
      dockerAction: (payload: { id: string; action: string }) => Promise<{ ok: boolean; error?: string }>
      dockerLogs: (payload: { id: string; tail?: number }) => Promise<unknown>
      dockerCreate: (payload: {
        image: string
        name: string
        command?: string
        ports?: Array<{ hostPort: number; containerPort: number; protocol?: 'tcp' | 'udp' }>
        env?: string[]
        volumes?: Array<{ hostPath: string; containerPath: string }>
        autoStart?: boolean
      }) => Promise<unknown>
      dockerPull: (payload: { image: string }) => Promise<unknown>
      dockerRemapPort: (payload: { id: string; oldHostPort: number; newHostPort: number }) => Promise<unknown>
      dockerImagesList: () => Promise<unknown>
      dockerImageAction: (payload: { id: string; action: 'remove'; force?: boolean }) => Promise<unknown>
      dockerVolumesList: () => Promise<unknown>
      dockerVolumeAction: (payload: { name: string; action: 'remove' }) => Promise<unknown>
      dockerVolumeCreate: (payload: { name: string }) => Promise<unknown>
      dockerNetworksList: () => Promise<unknown>
      dockerNetworkAction: (payload: { id: string; action: 'remove' }) => Promise<unknown>
      dockerNetworkCreate: (payload: { name: string }) => Promise<unknown>
      dockerPrune: () => Promise<unknown>
      dockerPrunePreview: () => Promise<unknown>
      dockerCleanupRun: (payload: { containers?: boolean; images?: boolean; volumes?: boolean; networks?: boolean }) => Promise<unknown>
      metrics: () => Promise<import('@linux-dev-home/shared').HostMetricsResponse & { ok: boolean; error?: string }>
      hostExec: (payload: unknown) => Promise<{ ok: boolean; result: unknown; error?: string }>
      composeUp: (payload: { profile: ComposeProfile }) => Promise<{ ok: boolean; log: string; error?: string }>
      composeLogs: (payload: { profile: ComposeProfile }) => Promise<{ ok: boolean; log: string; error?: string }>
      terminalCreate: (payload: { cols: number; rows: number; cmd?: string; args?: string[] }) => Promise<{ ok: boolean; id?: string; error?: string }>
      terminalWrite: (id: string, data: string) => void
      terminalResize: (id: string, cols: number, rows: number) => void
      openExternalTerminal: () => Promise<{ ok: boolean; error?: string }>
      gitClone: (payload: { url: string; targetDir: string }) => Promise<{ ok: boolean; error?: string }>
      gitStatus: (payload: { repoPath: string }) => Promise<{ ok: boolean; info: { branch: string; tracking: string | null; ahead: number; behind: number; modified: number; created: number; deleted: number }; error?: string }>
      gitRecentList: () => Promise<{ ok: boolean; repos: import('@linux-dev-home/shared').GitRepoEntry[]; error?: string }>
      gitRecentAdd: (payload: { path: string }) => Promise<{ ok: boolean; error?: string }>
      gitConfigSet: (payload: { name: string; email: string; defaultBranch?: string; defaultEditor?: string; target: 'sandbox'|'host' }) => Promise<{ ok: boolean; error?: string }>
      gitConfigList: (payload: { target: 'sandbox'|'host' }) => Promise<{ ok: boolean; rows: Array<{ key: string; value: string }>; error?: string }>
      sshGenerate: (payload: { target: 'sandbox'|'host'; email?: string }) => Promise<{ ok: boolean; error?: string }>
      sshGetPub: (payload: { target: 'sandbox'|'host' }) => Promise<{ ok: boolean; pub: string; fingerprint: string; error?: string }>
      sshTestGithub: (payload: { target: 'sandbox'|'host' }) => Promise<{ ok: boolean; output: string; code: number | null; error?: string }>
      selectFolder: () => Promise<string | null>
      filePickOpen: (opts?: { folders?: boolean; multiple?: boolean }) => Promise<string[]>
      filePickSave: () => Promise<string | null>
      sshListDir: (payload: { user: string; host: string; port: number; remotePath: string }) => Promise<{ ok: boolean; entries: string[]; error?: string }>
      sshSetupRemoteKey: (payload: { user: string; host: string; port: number; password: string; publicKey: string }) => Promise<{ ok: boolean; error?: string }>
      onTerminalData: (handler: (msg: { id: string; data: string }) => void) => () => void
      onTerminalExit: (handler: (msg: { id: string }) => void) => () => void
      openExternal: (url: string) => Promise<unknown>
      sessionInfo: () => Promise<unknown>
      layoutGet: () => Promise<{ ok: boolean; layout: DashboardLayoutFile; error?: string }>
      layoutSet: (layout: unknown) => Promise<{ ok: boolean; error?: string }>
      storeGet: (payload: import('@linux-dev-home/shared').StoreGetRequest) => Promise<{ ok: boolean; data: unknown; error?: string }>
      storeSet: (payload: import('@linux-dev-home/shared').StoreSetRequest) => Promise<{ ok: boolean; error?: string }>
      jobStart: (payload: { kind: string; durationMs?: number; runtimeId?: string; version?: string; method?: 'system' | 'local'; removeMode?: 'runtime_only' | 'runtime_and_deps'; addToPath?: boolean }) => Promise<{ id: string }>
      jobsList: () => Promise<unknown>
      jobCancel: (payload: { id: string }) => Promise<unknown>
      dockerInstall: (payload: { distro: 'ubuntu'|'fedora'|'arch'; password?: string; components?: string[] }) => Promise<{ ok: boolean; log: string[]; error?: string }>
      dockerCheckInstalled: () => Promise<{ docker: boolean; compose: boolean; buildx: boolean }>
      getHostDistro: () => Promise<string>
      dockerSearch: (term: string) => Promise<{ ok: boolean; results: Array<{ name: string; description: string; star_count: number; is_official: boolean }>; error?: string }>
      dockerGetTags: (image: string) => Promise<{ ok: boolean; tags: string[]; error?: string }>
      dockerTerminal: (payload: { containerId: string; cols: number; rows: number }) => Promise<{ ok: boolean; id?: string; error?: string }>
      getHostPorts: () => Promise<{ ok: boolean; ports: HostPortRow[]; error?: string }>
      getHostSysInfo: () => Promise<{ ok: boolean; info: HostSysInfo; error?: string }>
      monitorTopProcesses: () => Promise<{ ok: boolean; processes: import('@linux-dev-home/shared').TopProcessRow[]; error?: string }>
      monitorSecurity: () => Promise<{ ok: boolean; snapshot: import('@linux-dev-home/shared').HostSecuritySnapshot; error?: string }>
      monitorSecurityDrilldown: () => Promise<{ ok: boolean; drilldown: import('@linux-dev-home/shared').HostSecurityDrilldown; error?: string }>
      runtimeStatus: () => Promise<import('@linux-dev-home/shared').RuntimeStatusResponse & { ok: boolean; error?: string }>
      getAvailableVersions: (runtimeId: string) => Promise<{ ok: boolean; versions: string[]; error?: string }>
      checkDependencies: (runtimeId: string) => Promise<{ ok: boolean; dependencies: Array<{ name: string; status: string; ok: boolean }>; error?: string }>
      runtimeUninstallPreview: (payload: { runtimeId: string; removeMode: 'runtime_only' | 'runtime_and_deps' }) => Promise<{ ok: boolean; distro?: string; runtimePackages?: string[]; removableDeps?: string[]; blockedSharedDeps?: string[]; finalPackages?: string[]; note?: string; error?: string }>
      perfSnapshot: () => Promise<{ ok: boolean; snapshot?: import('@linux-dev-home/shared').PerfSnapshot; error?: string }>
      diagnosticsBundleCreate: (payload: { report: unknown; includeSensitive?: boolean }) => Promise<{ ok: boolean; path?: string; error?: string }>
    }
  }
}
