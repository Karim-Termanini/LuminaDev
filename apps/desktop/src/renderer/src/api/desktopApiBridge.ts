import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'

import { IPC } from '@linux-dev-home/shared'

type DhApi = Window['dh']

const isTauriRuntime = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const tauriInvoke = async <T>(channel: string, payload?: unknown): Promise<T> =>
  await invoke<T>('ipc_invoke', { channel, payload })

function createTauriDhApi(): DhApi {
  return {
    dockerList: () => tauriInvoke(IPC.dockerList),
    dockerAction: (payload) => tauriInvoke(IPC.dockerAction, payload),
    dockerLogs: (payload) => tauriInvoke(IPC.dockerLogs, payload),
    dockerCreate: (payload) => tauriInvoke(IPC.dockerCreate, payload),
    dockerPull: (payload) => tauriInvoke(IPC.dockerPull, payload),
    dockerRemapPort: (payload) => tauriInvoke(IPC.dockerRemapPort, payload),
    dockerImagesList: () => tauriInvoke(IPC.dockerImagesList),
    dockerImageAction: (payload) => tauriInvoke(IPC.dockerImageAction, payload),
    dockerVolumesList: () => tauriInvoke(IPC.dockerVolumesList),
    dockerVolumeAction: (payload) => tauriInvoke(IPC.dockerVolumeAction, payload),
    dockerVolumeCreate: (payload) => tauriInvoke(IPC.dockerVolumeCreate, payload),
    dockerNetworksList: () => tauriInvoke(IPC.dockerNetworksList),
    dockerNetworkAction: (payload) => tauriInvoke(IPC.dockerNetworkAction, payload),
    dockerNetworkCreate: (payload) => tauriInvoke(IPC.dockerNetworkCreate, payload),
    dockerPrune: () => tauriInvoke(IPC.dockerPrune),
    dockerPrunePreview: () => tauriInvoke(IPC.dockerPrunePreview),
    dockerCleanupRun: (payload) => tauriInvoke(IPC.dockerCleanupRun, payload),
    metrics: () => tauriInvoke(IPC.metrics),
    hostExec: (payload) => tauriInvoke(IPC.hostExec, payload),
    composeUp: (payload) => tauriInvoke(IPC.composeUp, payload),
    composeLogs: (payload) => tauriInvoke(IPC.composeLogs, payload),
    terminalCreate: (payload) => tauriInvoke(IPC.terminalCreate, payload),
    terminalWrite: (id, data) => {
      void invoke('ipc_send', { channel: IPC.terminalWrite, payload: { id, data } })
    },
    terminalResize: (id, cols, rows) => {
      void invoke('ipc_send', { channel: IPC.terminalResize, payload: { id, cols, rows } })
    },
    terminalClose: (id) => {
      void invoke('ipc_send', { channel: IPC.terminalClose, payload: { id } })
    },
    openExternalTerminal: () => tauriInvoke(IPC.openExternalTerminal),
    gitClone: (payload) => tauriInvoke(IPC.gitClone, payload),
    gitStatus: (payload) => tauriInvoke(IPC.gitStatus, payload),
    gitRecentList: () => tauriInvoke(IPC.gitRecentList),
    gitRecentAdd: (payload) => tauriInvoke(IPC.gitRecentAdd, payload),
    gitConfigSet: (payload) => tauriInvoke(IPC.gitConfigSet, payload),
    gitConfigList: (payload) => tauriInvoke(IPC.gitConfigList, payload),
    sshGenerate: (payload) => tauriInvoke(IPC.sshGenerate, payload),
    sshGetPub: (payload) => tauriInvoke(IPC.sshGetPub, payload),
    sshTestGithub: (payload) => tauriInvoke(IPC.sshTestGithub, payload),
    selectFolder: async () => {
      const p = await openDialog({ directory: true, multiple: false })
      return typeof p === 'string' ? p : null
    },
    filePickOpen: async (opts) => {
      const result = await openDialog({
        directory: !!opts?.folders,
        multiple: !!opts?.multiple,
      })
      if (!result) return []
      return Array.isArray(result) ? result.filter((x): x is string => typeof x === 'string') : [result]
    },
    filePickSave: async () => {
      const p = await saveDialog({})
      return typeof p === 'string' ? p : null
    },
    sshListDir: (payload) => tauriInvoke(IPC.sshListDir, payload),
    sshSetupRemoteKey: (payload) => tauriInvoke(IPC.sshSetupRemoteKey, payload),
    sshEnableLocal: () => tauriInvoke(IPC.sshEnableLocal),
    onTerminalData: (handler) => {
      let unlisten: (() => void) | null = null
      void listen<{ id: string; data: string }>(IPC.terminalData, (event) => {
        handler(event.payload)
      }).then((fn) => {
        unlisten = fn
      })
      return () => {
        if (unlisten) unlisten()
      }
    },
    onTerminalExit: (handler) => {
      let unlisten: (() => void) | null = null
      void listen<{ id: string }>(IPC.terminalExit, (event) => {
        handler(event.payload)
      }).then((fn) => {
        unlisten = fn
      })
      return () => {
        if (unlisten) unlisten()
      }
    },
    openExternal: async (url) => {
      await openUrl(url)
      return { ok: true }
    },
    sessionInfo: () => tauriInvoke(IPC.sessionInfo),
    layoutGet: () => tauriInvoke(IPC.layoutGet),
    layoutSet: (layout) => tauriInvoke(IPC.layoutSet, layout),
    storeGet: (payload) => tauriInvoke(IPC.storeGet, payload),
    storeSet: (payload) => tauriInvoke(IPC.storeSet, payload),
    jobStart: (payload) => tauriInvoke(IPC.jobStart, payload),
    jobsList: () => tauriInvoke(IPC.jobsList),
    jobCancel: (payload) => tauriInvoke(IPC.jobCancel, payload),
    dockerInstall: (payload) => tauriInvoke(IPC.dockerInstall, payload),
    dockerCheckInstalled: () => tauriInvoke(IPC.dockerCheckInstalled),
    getHostDistro: () => tauriInvoke(IPC.getHostDistro),
    dockerSearch: (term) => tauriInvoke(IPC.dockerSearch, term),
    dockerGetTags: (image) => tauriInvoke(IPC.dockerGetTags, image),
    dockerTerminal: (payload) => tauriInvoke(IPC.dockerTerminal, payload),
    getHostPorts: () => tauriInvoke(IPC.getHostPorts),
    getHostSysInfo: () => tauriInvoke(IPC.getHostSysInfo),
    monitorTopProcesses: () => tauriInvoke(IPC.monitorTopProcesses),
    monitorSecurity: () => tauriInvoke(IPC.monitorSecurity),
    monitorSecurityDrilldown: () => tauriInvoke(IPC.monitorSecurityDrilldown),
    runtimeStatus: () => tauriInvoke(IPC.runtimeStatus),
    getAvailableVersions: (runtimeId, method) => tauriInvoke(IPC.runtimeGetVersions, { runtimeId, method }),
    runtimeSetActive: (payload) => tauriInvoke(IPC.runtimeSetActive, payload),
    checkDependencies: (runtimeId) => tauriInvoke(IPC.runtimeCheckDeps, { runtimeId }),
    runtimeUninstallPreview: (payload) => tauriInvoke(IPC.runtimeUninstallPreview, payload),
    runtimeRemoveVersion: (payload) => tauriInvoke(IPC.runtimeRemoveVersion, payload),
    perfSnapshot: () => tauriInvoke(IPC.perfSnapshot),
    diagnosticsBundleCreate: (payload) => tauriInvoke(IPC.diagnosticsBundleCreate, payload),
  } satisfies DhApi
}

export function ensureDesktopApi(): void {
  if (!isTauriRuntime()) return
  if (window.dh) return
  ;(window as Window).dh = createTauriDhApi()
}
