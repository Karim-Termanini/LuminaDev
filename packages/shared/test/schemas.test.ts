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
  parseOnLoginAutomation,
  parseSshBookmarks,
  parseStoredActiveProfile,
  RuntimeCheckDepsRequestSchema,
  WizardStateStoreSchema,
  RuntimeGetVersionsRequestSchema,
  RuntimeSetActiveRequestSchema,
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

  it('accepts maintenance host probes', () => {
    expect(HostExecRequestSchema.parse({ command: 'maintenance_docker_system_df' })).toEqual({
      command: 'maintenance_docker_system_df',
    })
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
    expect(RuntimeGetVersionsRequestSchema.parse({ runtimeId: 'node', method: 'local' })).toEqual({
      runtimeId: 'node',
      method: 'local',
    })
    expect(RuntimeCheckDepsRequestSchema.parse({ runtimeId: 'python' })).toEqual({ runtimeId: 'python' })
    expect(() =>
      RuntimeGetVersionsRequestSchema.parse({ runtimeId: '' })
    ).toThrow()
  })

  it('validates runtime set-active payload', () => {
    expect(RuntimeSetActiveRequestSchema.parse({ runtimeId: 'go', path: '/home/u/.local/share/lumina/go/1.22.0/bin/go' })).toEqual({
      runtimeId: 'go',
      path: '/home/u/.local/share/lumina/go/1.22.0/bin/go',
    })
    expect(() => RuntimeSetActiveRequestSchema.parse({ runtimeId: '', path: '/x' })).toThrow()
    expect(() => RuntimeSetActiveRequestSchema.parse({ runtimeId: 'go', path: '' })).toThrow()
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

  it('parses active_profile store set with compose enum only', () => {
    const v = StoreSetRequestSchema.parse({ key: 'active_profile', data: 'web-dev' })
    expect(v).toEqual({ key: 'active_profile', data: 'web-dev' })
    expect(() => StoreSetRequestSchema.parse({ key: 'active_profile', data: 'not-a-profile' as never })).toThrow()
  })

  it('parses wizard_state with optional stepIndex', () => {
    expect(WizardStateStoreSchema.parse({ completed: false, stepIndex: 3 })).toMatchObject({
      completed: false,
      stepIndex: 3,
      showOnStartup: false,
    })
    expect(() => WizardStateStoreSchema.parse({ completed: false, stepIndex: 99 })).toThrow()
  })

  it('parses wizard_state rich resume fields', () => {
    const v = WizardStateStoreSchema.parse({
      completed: false,
      stepIndex: 4,
      gitName: 'Ada',
      gitEmail: 'ada@example.com',
      gitTarget: 'host',
      sshPubKey: 'ssh-ed25519 AAAA',
      sshKeyGenerated: true,
      pickedStarterProfile: 'web-dev',
    })
    expect(v.gitName).toBe('Ada')
    expect(v.pickedStarterProfile).toBe('web-dev')
  })

  it('parseStoredActiveProfile accepts canonical and legacy ids', () => {
    expect(parseStoredActiveProfile('empty')).toBe('empty')
    expect(parseStoredActiveProfile('minimal')).toBe('empty')
    expect(parseStoredActiveProfile('desktop-qt')).toBe('desktop-gui')
    expect(parseStoredActiveProfile('typo')).toBe(null)
    expect(parseStoredActiveProfile(null)).toBe(null)
  })

  it('parseOnLoginAutomation falls back on invalid data', () => {
    expect(parseOnLoginAutomation(null)).toEqual({
      composeUpForActiveProfile: false,
      reloadDashboardLayout: false,
    })
    expect(parseOnLoginAutomation({ composeUpForActiveProfile: true })).toEqual({
      composeUpForActiveProfile: true,
      reloadDashboardLayout: false,
    })
  })

  it('parses on_login_automation store set', () => {
    const v = StoreSetRequestSchema.parse({
      key: 'on_login_automation',
      data: { composeUpForActiveProfile: true, reloadDashboardLayout: true },
    })
    expect(v).toEqual({
      key: 'on_login_automation',
      data: { composeUpForActiveProfile: true, reloadDashboardLayout: true },
    })
  })

  it('parseSshBookmarks returns [] on invalid data', () => {
    expect(parseSshBookmarks(null)).toEqual([])
    expect(parseSshBookmarks({})).toEqual([])
    expect(parseSshBookmarks([{ id: '', name: 'x', user: 'u', host: 'h', port: 22 }])).toEqual([])
  })

  it('parseSshBookmarks accepts valid bookmarks and store set', () => {
    const rows = [
      { id: 'a1', name: 'Prod', user: 'ubuntu', host: '10.0.0.1', port: 22 },
      { id: 'b2', name: 'Edge', user: 'root', host: 'edge.example', port: 2222 },
    ]
    expect(parseSshBookmarks(rows)).toEqual(rows)
    const v = StoreSetRequestSchema.parse({ key: 'ssh_bookmarks', data: rows })
    expect(v.key).toBe('ssh_bookmarks')
    if (v.key !== 'ssh_bookmarks') throw new Error('expected ssh_bookmarks branch')
    expect(v.data).toHaveLength(2)
  })

  it('parses ssh_bookmarks with default port when omitted', () => {
    const v = StoreSetRequestSchema.parse({
      key: 'ssh_bookmarks',
      data: [{ id: 'x', name: 'Home', user: 'me', host: 'home.local' }],
    })
    if (v.key !== 'ssh_bookmarks') throw new Error('expected ssh_bookmarks branch')
    expect(v.data[0].port).toBe(22)
  })
})
