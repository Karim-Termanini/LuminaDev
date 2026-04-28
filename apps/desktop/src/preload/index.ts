import { contextBridge, ipcRenderer } from 'electron'

import { IPC, type ComposeProfile } from '@linux-dev-home/shared'

export type DhApi = {
  dockerList: () => unknown
  dockerAction: (payload: { id: string; action: string }) => unknown
  dockerLogs: (payload: { id: string; tail?: number }) => unknown
  dockerCreate: (payload: {
    image: string
    name: string
    command?: string
    ports?: Array<{ hostPort: number; containerPort: number; protocol?: 'tcp' | 'udp' }>
    env?: string[]
    volumes?: Array<{ hostPath: string; containerPath: string }>
    autoStart?: boolean
  }) => unknown
  dockerPull: (payload: { image: string }) => unknown
  dockerRemapPort: (payload: { id: string; oldHostPort: number; newHostPort: number }) => unknown
  dockerImagesList: () => unknown
  dockerImageAction: (payload: { id: string; action: 'remove'; force?: boolean }) => unknown
  dockerVolumesList: () => unknown
  dockerVolumeAction: (payload: { name: string; action: 'remove' }) => unknown
  dockerVolumeCreate: (payload: { name: string }) => unknown
  dockerNetworksList: () => unknown
  dockerNetworkAction: (payload: { id: string; action: 'remove' }) => unknown
  dockerNetworkCreate: (payload: { name: string }) => unknown
  dockerPrune: () => unknown
  dockerPrunePreview: () => unknown
  dockerCleanupRun: (payload: { containers?: boolean; images?: boolean; volumes?: boolean; networks?: boolean }) => unknown
  metrics: () => unknown
  hostExec: (payload: unknown) => unknown
  composeUp: (payload: { profile: ComposeProfile }) => unknown
  composeLogs: (payload: { profile: ComposeProfile }) => unknown
  terminalCreate: (payload: { cols: number; rows: number; cmd?: string; args?: string[] }) => unknown
  terminalWrite: (id: string, data: string) => void
  terminalResize: (id: string, cols: number, rows: number) => void
  openExternalTerminal: () => unknown
  gitClone: (payload: { url: string; targetDir: string }) => unknown
  gitStatus: (payload: { repoPath: string }) => unknown
  gitRecentList: () => unknown
  gitRecentAdd: (payload: { path: string }) => unknown
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

const api: DhApi = {
  dockerList: () => ipcRenderer.invoke(IPC.dockerList),
  dockerAction: (payload) => ipcRenderer.invoke(IPC.dockerAction, payload),
  dockerLogs: (payload) => ipcRenderer.invoke(IPC.dockerLogs, payload),
  dockerCreate: (payload) => ipcRenderer.invoke(IPC.dockerCreate, payload),
  dockerPull: (payload) => ipcRenderer.invoke(IPC.dockerPull, payload),
  dockerRemapPort: (payload) => ipcRenderer.invoke(IPC.dockerRemapPort, payload),
  dockerImagesList: () => ipcRenderer.invoke(IPC.dockerImagesList),
  dockerImageAction: (payload) => ipcRenderer.invoke(IPC.dockerImageAction, payload),
  dockerVolumesList: () => ipcRenderer.invoke(IPC.dockerVolumesList),
  dockerVolumeAction: (payload) => ipcRenderer.invoke(IPC.dockerVolumeAction, payload),
  dockerVolumeCreate: (payload) => ipcRenderer.invoke(IPC.dockerVolumeCreate, payload),
  dockerNetworksList: () => ipcRenderer.invoke(IPC.dockerNetworksList),
  dockerNetworkAction: (payload) => ipcRenderer.invoke(IPC.dockerNetworkAction, payload),
  dockerNetworkCreate: (payload) => ipcRenderer.invoke(IPC.dockerNetworkCreate, payload),
  dockerPrune: () => ipcRenderer.invoke(IPC.dockerPrune),
  dockerPrunePreview: () => ipcRenderer.invoke(IPC.dockerPrunePreview),
  dockerCleanupRun: (payload) => ipcRenderer.invoke(IPC.dockerCleanupRun, payload),
  metrics: () => ipcRenderer.invoke(IPC.metrics),
  hostExec: (payload) => ipcRenderer.invoke(IPC.hostExec, payload),
  composeUp: (payload) => ipcRenderer.invoke(IPC.composeUp, payload),
  composeLogs: (payload) => ipcRenderer.invoke(IPC.composeLogs, payload),
  terminalCreate: (payload) => ipcRenderer.invoke(IPC.terminalCreate, payload),
  terminalWrite: (id, data) => ipcRenderer.send(IPC.terminalWrite, { id, data }),
  terminalResize: (id, cols, rows) => ipcRenderer.send(IPC.terminalResize, { id, cols, rows }),
  openExternalTerminal: () => ipcRenderer.invoke(IPC.openExternalTerminal),
  gitClone: (payload) => ipcRenderer.invoke(IPC.gitClone, payload),
  gitStatus: (payload) => ipcRenderer.invoke(IPC.gitStatus, payload),
  gitRecentList: () => ipcRenderer.invoke(IPC.gitRecentList),
  gitRecentAdd: (payload) => ipcRenderer.invoke(IPC.gitRecentAdd, payload),
  gitConfigSet: (payload) => ipcRenderer.invoke(IPC.gitConfigSet, payload),
  gitConfigList: (payload) => ipcRenderer.invoke(IPC.gitConfigList, payload),
  sshGenerate: (payload) => ipcRenderer.invoke(IPC.sshGenerate, payload),
  sshGetPub: (payload) => ipcRenderer.invoke(IPC.sshGetPub, payload),
  sshTestGithub: (payload) => ipcRenderer.invoke(IPC.sshTestGithub, payload),
  selectFolder: () => ipcRenderer.invoke(IPC.selectFolder),
  filePickOpen: (opts) => ipcRenderer.invoke(IPC.filePickOpen, opts),
  filePickSave: () => ipcRenderer.invoke(IPC.filePickSave),
  sshListDir: (payload) => ipcRenderer.invoke(IPC.sshListDir, payload),
  sshSetupRemoteKey: (payload) => ipcRenderer.invoke(IPC.sshSetupRemoteKey, payload),
  onTerminalData: (handler) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      msg: { id: string; data: string }
    ): void => {
      handler(msg)
    }
    ipcRenderer.on(IPC.terminalData, listener)
    return () => ipcRenderer.removeListener(IPC.terminalData, listener)
  },
  onTerminalExit: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, msg: { id: string }): void => {
      handler(msg)
    }
    ipcRenderer.on(IPC.terminalExit, listener)
    return () => ipcRenderer.removeListener(IPC.terminalExit, listener)
  },
  openExternal: (url) => ipcRenderer.invoke('dh:openExternal', url),
  sessionInfo: () => ipcRenderer.invoke(IPC.sessionInfo),
  layoutGet: () => ipcRenderer.invoke(IPC.layoutGet),
  layoutSet: (layout) => ipcRenderer.invoke(IPC.layoutSet, layout),
  storeGet: (payload) => ipcRenderer.invoke(IPC.storeGet, payload),
  storeSet: (payload) => ipcRenderer.invoke(IPC.storeSet, payload),
  jobStart: (payload) => ipcRenderer.invoke(IPC.jobStart, payload),
  jobsList: () => ipcRenderer.invoke(IPC.jobsList),
  jobCancel: (payload) => ipcRenderer.invoke(IPC.jobCancel, payload),
  dockerInstall: (payload) => ipcRenderer.invoke(IPC.dockerInstall, payload),
  dockerCheckInstalled: () => ipcRenderer.invoke(IPC.dockerCheckInstalled),
  getHostDistro: () => ipcRenderer.invoke(IPC.getHostDistro),
  dockerSearch: (term) => ipcRenderer.invoke(IPC.dockerSearch, term),
  dockerGetTags: (image) => ipcRenderer.invoke(IPC.dockerGetTags, image),
  dockerTerminal: (payload) => ipcRenderer.invoke(IPC.dockerTerminal, payload),
}

contextBridge.exposeInMainWorld('dh', api)
