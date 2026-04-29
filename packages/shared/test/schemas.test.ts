import { describe, expect, it } from 'vitest'
import { DashboardLayoutFileSchema } from '../src/foundation'
import {
  ComposeUpRequestSchema,
  CustomProfilesStoreSchema,
  DockerErrorCodeSchema,
  DockerLogsRequestSchema,
  GitCloneRequestSchema,
  GitConfigSetSchema,
  HostExecRequestSchema,
  RuntimeCheckDepsRequestSchema,
  RuntimeGetVersionsRequestSchema,
  RuntimeUninstallPreviewRequestSchema,
  SshGenerateSchema,
  StoreSetRequestSchema,
} from '../src/schemas'
import { isRegisteredWidgetType } from '../src/widgetRegistry'

describe('schemas', () => {
  it('rejects arbitrary host exec', () => {
    expect(() =>
      HostExecRequestSchema.parse({ command: 'rm_rf_root' as never })
    ).toThrow()
  })

  it('accepts docker logs with bounds', () => {
    expect(DockerLogsRequestSchema.parse({ id: 'abc', tail: 100 })).toEqual({
      id: 'abc',
      tail: 100,
    })
  })

  it('accepts known docker error codes', () => {
    expect(DockerErrorCodeSchema.parse('DOCKER_UNAVAILABLE')).toBe('DOCKER_UNAVAILABLE')
    expect(() => DockerErrorCodeSchema.parse('RANDOM_ERROR')).toThrow()
  })

  it('accepts compose profiles only', () => {
    expect(ComposeUpRequestSchema.parse({ profile: 'web-dev' })).toEqual({
      profile: 'web-dev',
    })
  })

  it('validates git clone url', () => {
    expect(() =>
      GitCloneRequestSchema.parse({
        url: 'not-a-url',
        targetDir: '/tmp/x',
      })
    ).toThrow()
  })

  it('validates git config payload and rejects malformed values', () => {
    expect(
      GitConfigSetSchema.parse({
        name: 'Dev User',
        email: 'dev@example.com',
        target: 'host',
      })
    ).toMatchObject({ target: 'host' })
    expect(() =>
      GitConfigSetSchema.parse({
        name: 'Dev User',
        email: 'not-an-email',
        target: 'host',
      })
    ).toThrow()
  })

  it('validates ssh generate payload and rejects missing target', () => {
    expect(SshGenerateSchema.parse({ target: 'sandbox', email: 'dev@example.com' })).toMatchObject({
      target: 'sandbox',
    })
    expect(() => SshGenerateSchema.parse({ email: 'dev@example.com' })).toThrow()
  })

  it('validates runtime version/check-deps request payload bounds', () => {
    expect(RuntimeGetVersionsRequestSchema.parse({ runtimeId: 'node' })).toEqual({ runtimeId: 'node' })
    expect(RuntimeCheckDepsRequestSchema.parse({ runtimeId: 'python' })).toEqual({ runtimeId: 'python' })
    expect(() =>
      RuntimeGetVersionsRequestSchema.parse({ runtimeId: '' })
    ).toThrow()
  })

  it('validates runtime uninstall preview payload and default mode', () => {
    expect(RuntimeUninstallPreviewRequestSchema.parse({ runtimeId: 'node' })).toEqual({
      runtimeId: 'node',
      removeMode: 'runtime_only',
    })
    expect(() =>
      RuntimeUninstallPreviewRequestSchema.parse({ runtimeId: 'node', removeMode: 'remove_all' })
    ).toThrow()
  })

  it('parses dashboard layout file', () => {
    const v = DashboardLayoutFileSchema.parse({
      version: 1,
      placements: [{ instanceId: 'a', widgetTypeId: 'static.docker-permission-hint' }],
    })
    expect(v.placements).toHaveLength(1)
    expect(isRegisteredWidgetType('static.docker-permission-hint')).toBe(true)
    expect(isRegisteredWidgetType('unknown.widget')).toBe(false)
  })

  it('parses typed store set for custom_profiles', () => {
    const v = StoreSetRequestSchema.parse({
      key: 'custom_profiles',
      data: [{ name: 'My stack', baseTemplate: 'web-dev' }],
    })
    expect(v.key).toBe('custom_profiles')
    expect(v.data).toHaveLength(1)
  })

  it('rejects store set with unknown key', () => {
    expect(() =>
      StoreSetRequestSchema.parse({
        key: 'other',
        data: [],
      } as never)
    ).toThrow()
  })

  it('rejects custom profile with invalid baseTemplate', () => {
    expect(() =>
      CustomProfilesStoreSchema.parse([{ name: 'x', baseTemplate: 'not-real' as never }])
    ).toThrow()
  })
})
