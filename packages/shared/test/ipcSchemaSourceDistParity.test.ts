import { describe, expect, it } from 'vitest'

import * as distFoundation from '../dist/foundation.js'
import * as distSchemas from '../dist/schemas.js'
import {
  IPC_CHANNELS_EXCLUDED_FROM_SCHEMA,
  IPC_PAYLOAD_CHANNEL_SCHEMAS,
  IPC_REQUEST_SCHEMAS,
} from '../src/ipcSchemaMap'
import * as srcFoundation from '../src/foundation'
import * as srcSchemas from '../src/schemas'
import { IPC } from '../src/ipc'

function exportNameForSchema(
  module: Record<string, unknown>,
  schema: unknown,
): string | undefined {
  return Object.entries(module).find(([, value]) => value === schema)?.[0]
}

const srcModule = { ...srcSchemas, ...srcFoundation } as Record<string, unknown>
const distModule = { ...distSchemas, ...distFoundation } as Record<string, unknown>

describe('ipcSchemaSourceDistParity', () => {
  it('maps every dispatcher channel to a defined Zod parser', () => {
    for (const channel of Object.values(IPC)) {
      if (IPC_CHANNELS_EXCLUDED_FROM_SCHEMA.has(channel)) continue
      const schema = IPC_REQUEST_SCHEMAS[channel]
      expect(schema, `missing schema for ${channel}`).toBeDefined()
      expect(typeof schema.parse).toBe('function')
    }
  })

  it('exports every ipcSchemaMap payload schema from source', () => {
    for (const [channel, schema] of IPC_PAYLOAD_CHANNEL_SCHEMAS) {
      const name = exportNameForSchema(srcModule, schema)
      expect(name, `payload schema for ${channel} is not exported from source`).toBeDefined()
      expect(typeof schema.parse).toBe('function')
    }
  })

  it('exports every ipcSchemaMap payload schema from dist (requires pnpm build)', () => {
    const driftProne = [
      'ProfileCredentialsIdRequestSchema',
      'DockerSearchRequestSchema',
      'DockerGetTagsRequestSchema',
      'DockerInspectRequestSchema',
      'DockerReconfigureRequestSchema',
      'DockerTerminalRequestSchema',
      'LogStreamStartRequestSchema',
      'LogStreamStopRequestSchema',
      'TerminalResizeRequestSchema',
      'TerminalWriteRequestSchema',
      'SshListDirRequestSchema',
      'SshSetupRemoteKeyRequestSchema',
      'GitConfigListRequestSchema',
      'GitRecentAddRequestSchema',
      'SshGenerateRequestSchema',
    ] as const

    for (const name of driftProne) {
      expect(srcModule[name], `${name} missing from source`).toBeDefined()
      expect(distModule[name], `${name} missing from dist — run pnpm build`).toBeDefined()
      expect(typeof (distModule[name] as { parse?: unknown }).parse).toBe('function')
    }

    for (const [channel, schema] of IPC_PAYLOAD_CHANNEL_SCHEMAS) {
      const name = exportNameForSchema(srcModule, schema)
      expect(name, `payload schema for ${channel}`).toBeDefined()
      expect(distModule[name!], `${name} missing from dist for ${channel}`).toBeDefined()
    }
  })
})
