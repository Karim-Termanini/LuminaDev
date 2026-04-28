/// <reference types="vite/client" />

import type { ComposeProfile } from '@linux-dev-home/shared'

export {}

declare global {
  interface Window {
    dh: {
      dockerList: () => Promise<unknown>
      dockerAction: (payload: { id: string; action: string }) => Promise<unknown>
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
      metrics: () => Promise<unknown>
      hostExec: (payload: unknown) => Promise<unknown>
      composeUp: (payload: { profile: ComposeProfile }) => Promise<unknown>
      composeLogs: (payload: { profile: ComposeProfile }) => Promise<unknown>
      terminalCreate: (payload: { cols: number; rows: number; cmd?: string; args?: string[] }) => Promise<unknown>
      terminalWrite: (id: string, data: string) => void
      terminalResize: (id: string, cols: number, rows: number) => void
      openExternalTerminal: () => Promise<unknown>
      gitClone: (payload: { url: string; targetDir: string }) => Promise<unknown>
      gitStatus: (payload: { repoPath: string }) => Promise<unknown>
      gitRecentList: () => Promise<unknown>
      gitRecentAdd: (payload: { path: string }) => Promise<unknown>
      gitConfigSet: (payload: { name: string; email: string; defaultBranch?: string; defaultEditor?: string; target: 'sandbox'|'host' }) => Promise<unknown>
      gitConfigList: (payload: { target: 'sandbox'|'host' }) => Promise<unknown>
      sshGenerate: (payload: { target: 'sandbox'|'host'; email?: string }) => Promise<unknown>
      sshGetPub: (payload: { target: 'sandbox'|'host' }) => Promise<{ pub: string; fingerprint: string } | null>
      sshTestGithub: (payload: { target: 'sandbox'|'host' }) => Promise<unknown>
      selectFolder: () => Promise<string | null>
      filePickOpen: (opts?: { folders?: boolean; multiple?: boolean }) => Promise<string[]>
      filePickSave: () => Promise<string | null>
      sshListDir: (payload: { user: string; host: string; port: number; remotePath: string }) => Promise<{ ok: boolean; entries: string[]; error?: string }>
      sshSetupRemoteKey: (payload: { user: string; host: string; port: number; password: string; publicKey: string }) => Promise<{ ok: boolean; error?: string }>
      onTerminalData: (handler: (msg: { id: string; data: string }) => void) => () => void
      onTerminalExit: (handler: (msg: { id: string }) => void) => () => void
      openExternal: (url: string) => Promise<unknown>
      sessionInfo: () => Promise<unknown>
      layoutGet: () => Promise<unknown>
      layoutSet: (layout: unknown) => Promise<unknown>
      storeGet: (payload: import('@linux-dev-home/shared').StoreGetRequest) => Promise<unknown>
      storeSet: (payload: import('@linux-dev-home/shared').StoreSetRequest) => Promise<unknown>
      jobStart: (payload: { kind: string; durationMs?: number }) => Promise<unknown>
      jobsList: () => Promise<unknown>
      jobCancel: (payload: { id: string }) => Promise<unknown>
      dockerInstall: (payload: { distro: 'ubuntu'|'fedora'|'arch'; password?: string; components?: string[] }) => Promise<{ ok: boolean; log: string[]; error?: string }>
      dockerCheckInstalled: () => Promise<{ docker: boolean; compose: boolean; buildx: boolean }>
      getHostDistro: () => Promise<string>
      dockerSearch: (term: string) => Promise<Array<{ name: string; description: string; star_count: number; is_official: boolean }>>
      dockerGetTags: (image: string) => Promise<string[]>
      dockerTerminal: (payload: { containerId: string; cols: number; rows: number }) => Promise<{ ok: boolean; id?: string; error?: string }>
    }
  }
}
