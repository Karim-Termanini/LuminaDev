import { describe, expect, it } from 'vitest'

import { IPC } from '../src/ipc'
import {
  IPC_CHANNELS_EXCLUDED_FROM_SCHEMA,
  IPC_REQUEST_SCHEMAS,
  ipcSchemaCoverageStats,
} from '../src/ipcSchemaMap'
import { SessionInfoRequestSchema } from '../src/foundation'
import { EmptyRequestSchema, GitVcsStatusRequestSchema } from '../src/schemas'

describe('ipcSchemaCoverage', () => {
  it('maps every dispatcher channel (ipc_invoke / ipc_send) to a Zod schema', () => {
    const stats = ipcSchemaCoverageStats()

    expect(stats.totalIpcChannels).toBe(138)
    expect(stats.excludedFromMap).toBe(5)
    expect(stats.dispatcherChannels).toBe(133)
    expect(stats.unmappedDispatcherChannels).toEqual([])
    expect(stats.mappedChannels).toBe(133)
    expect(stats.noPayloadChannels + stats.payloadChannels).toBe(133)
  })

  it('excludes dialog plugins and terminal event streams only', () => {
    expect(IPC_CHANNELS_EXCLUDED_FROM_SCHEMA).toEqual(
      new Set([
        IPC.selectFolder,
        IPC.filePickOpen,
        IPC.filePickSave,
        IPC.terminalData,
        IPC.terminalExit,
      ]),
    )
  })

  it('assigns EmptyRequestSchema to no-payload invoke channels', () => {
    expect(IPC_REQUEST_SCHEMAS[IPC.dockerList]).toBe(EmptyRequestSchema)
    expect(IPC_REQUEST_SCHEMAS[IPC.metrics]).toBe(EmptyRequestSchema)
    expect(IPC_REQUEST_SCHEMAS[IPC.systemReadinessCheck]).toBe(EmptyRequestSchema)
  })

  it('assigns payload schemas to ipc_send terminal channels', () => {
    expect(IPC_REQUEST_SCHEMAS[IPC.terminalWrite]).not.toBe(EmptyRequestSchema)
    expect(IPC_REQUEST_SCHEMAS[IPC.terminalClose]).not.toBe(EmptyRequestSchema)
  })

  it('maps named RequestSchema aliases for git vcs status and session info', () => {
    expect(IPC_REQUEST_SCHEMAS[IPC.gitVcsStatus]).toBe(GitVcsStatusRequestSchema)
    expect(IPC_REQUEST_SCHEMAS[IPC.sessionInfo]).toBe(SessionInfoRequestSchema)
    expect(SessionInfoRequestSchema).toBe(EmptyRequestSchema)
  })
})
