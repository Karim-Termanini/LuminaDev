import { describe, expect, it } from 'vitest'
import {
  CloudGitCreatePrRequestSchema,
  CloudGitFindPrRequestSchema,
  CloudGitGetPrChecksRequestSchema,
  CloudGitMergePrRequestSchema,
  CloudPrDetailsSchema,
  ComposeDownRequestSchema,
  ComposeUpRequestSchema,
  CustomProfilesStoreSchema,
  DockerActionRequestSchema,
  DockerErrorCodeSchema,
  DiagnosticsBundleCreateRequestSchema,
  DockerCleanupRunRequestSchema,
  DockerGetTagsRequestSchema,
  DockerInspectRequestSchema,
  DockerInstallRequestSchema,
  DockerLogsRequestSchema,
  DockerReconfigureRequestSchema,
  DockerSearchRequestSchema,
  DockerTerminalRequestSchema,
  EditorOpenRequestSchema,
  FsExistsRequestSchema,
  FsOpenRequestSchema,
  GitCloneRequestSchema,
  GitConfigSetKeyRequestSchema,
  GitConfigSetRequestSchema,
  GitConfigSetSchema,
  GitRecentAddRequestSchema,
  GitVcsStageRequestSchema,
  GitVcsStatusRequestSchema,
  GitVcsConflictHunksRequestSchema,
  HostExecRequestSchema,
  LogStreamStartRequestSchema,
  LogStreamStopRequestSchema,
  parseAppearance,
  parseOnLoginAutomation,
  parseSshBookmarks,
  parseStoredActiveProfile,
  PortsSuggestRequestSchema,
  ProfileCredentialsIdRequestSchema,
  ProfileCredentialsStoreRequestSchema,
  ProfileRunningStatusRequestSchema,
  ProfileSwitchRequestSchema,
  ProjectScaffoldRequestSchema,
  RuntimeCheckDepsRequestSchema,
  RuntimeInstalledVersionsRequestSchema,
  RuntimeRemoveVersionRequestSchema,
  WizardStateStoreSchema,
  RuntimeGetVersionsRequestSchema,
  RuntimeSetActiveRequestSchema,
  RuntimeUninstallPreviewRequestSchema,
  SshGenerateRequestSchema,
  SshGenerateSchema,
  SshListDirRequestSchema,
  SshSetupRemoteKeyRequestSchema,
  StoreSetRequestSchema,
  SystemReadinessFixRequestSchema,
  TerminalCloseRequestSchema,
  TerminalCreateRequestSchema,
  TerminalResizeRequestSchema,
  TerminalWriteRequestSchema,
} from '../src/schemas'
import { JobCancelRequestSchema, JobStartRequestSchema, SessionInfoRequestSchema } from '../src/foundation'
import { isStoredActiveProfileValid, resolveActiveProfileName } from '../src/activeProfile'

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

  it('accepts settings_read_hosts host exec', () => {
    expect(HostExecRequestSchema.parse({ command: 'settings_read_hosts' })).toEqual({
      command: 'settings_read_hosts',
    })
  })

  it('accepts settings_process_env host exec', () => {
    expect(HostExecRequestSchema.parse({ command: 'settings_process_env' })).toEqual({
      command: 'settings_process_env',
    })
  })

  it('accepts settings write host exec payloads', () => {
    expect(
      HostExecRequestSchema.parse({ command: 'settings_write_hosts', content: '127.0.0.1 localhost\n' }),
    ).toEqual({
      command: 'settings_write_hosts',
      content: '127.0.0.1 localhost\n',
    })
    expect(HostExecRequestSchema.parse({ command: 'settings_read_profile_env' })).toEqual({
      command: 'settings_read_profile_env',
    })
    expect(
      HostExecRequestSchema.parse({
        command: 'settings_write_profile_env',
        action: 'set',
        key: 'NODE_ENV',
        value: 'development',
      }),
    ).toEqual({
      command: 'settings_write_profile_env',
      action: 'set',
      key: 'NODE_ENV',
      value: 'development',
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

  it('validates compose down/stop by custom profile name', () => {
    expect(ComposeDownRequestSchema.parse({ profile: 'my-frontend' })).toEqual({
      profile: 'my-frontend',
    })
    expect(() => ComposeDownRequestSchema.parse({ profile: '' })).toThrow()
  })

  it('validates profile switch and running-status payloads', () => {
    expect(
      ProfileSwitchRequestSchema.parse({
        to: 'lab',
        from: 'old-lab',
        envVars: [{ key: 'PORT', value: '8080' }],
      })
    ).toMatchObject({ to: 'lab' })
    expect(ProfileRunningStatusRequestSchema.parse({ names: ['a', 'b'] })).toEqual({
      names: ['a', 'b'],
    })
  })

  it('validates docker container actions', () => {
    expect(
      DockerActionRequestSchema.parse({ id: 'abc', action: 'restart' })
    ).toMatchObject({ id: 'abc', action: 'restart' })
    expect(() =>
      DockerActionRequestSchema.parse({ id: 'abc', action: 'invalid' as never })
    ).toThrow()
  })

  it('validates ports suggest, fs exists, editor open, terminal create', () => {
    expect(
      PortsSuggestRequestSchema.parse({
        template: 'web-dev',
        profile: 'my-app',
        subTemplate: 'react-native',
      })
    ).toMatchObject({ profile: 'my-app' })
    expect(FsExistsRequestSchema.parse({ path: '/tmp/x' })).toEqual({ path: '/tmp/x' })
    expect(EditorOpenRequestSchema.parse({ path: '~/proj', cmd: 'code' })).toEqual({
      path: '~/proj',
      cmd: 'code',
    })
    expect(TerminalCreateRequestSchema.parse({ cols: 80, rows: 24, cmd: '/bin/bash' })).toEqual({
      cols: 80,
      rows: 24,
      cmd: '/bin/bash',
    })
  })

  it('validates project scaffold payload shape', () => {
    expect(
      ProjectScaffoldRequestSchema.parse({
        path: '~/proj',
        template: 'data-science',
        options: { python: '3.12' },
      })
    ).toMatchObject({ template: 'data-science' })
  })

  it('validates cloud git PR IPC payloads', () => {
    expect(
      CloudGitCreatePrRequestSchema.parse({
        provider: 'github',
        repoPath: '/tmp/repo',
        title: 'Fix bug',
        head: 'feature',
        base: 'main',
      })
    ).toMatchObject({ title: 'Fix bug' })
    expect(
      CloudGitFindPrRequestSchema.parse({
        provider: 'gitlab',
        repoPath: '/tmp/repo',
        head: 'feature',
      })
    ).toMatchObject({ head: 'feature' })
    expect(
      CloudGitMergePrRequestSchema.parse({
        provider: 'github',
        repoPath: '/tmp/repo',
        prUrl: 'https://github.com/o/r/pull/1',
      })
    ).toMatchObject({ prUrl: 'https://github.com/o/r/pull/1' })
    expect(() =>
      CloudGitCreatePrRequestSchema.parse({
        provider: 'github',
        repoPath: '/tmp/repo',
        title: '',
        head: 'feature',
        base: 'main',
      })
    ).toThrow()
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

  it('parseOnLoginAutomation falls back on invalid data', () => {
    expect(parseOnLoginAutomation(null)).toEqual({
      composeUpForActiveProfile: false,
    })
    expect(parseOnLoginAutomation({ composeUpForActiveProfile: true })).toEqual({
      composeUpForActiveProfile: true,
    })
  })

  it('parses on_login_automation store set', () => {
    const v = StoreSetRequestSchema.parse({
      key: 'on_login_automation',
      data: { composeUpForActiveProfile: true },
    })
    expect(v).toEqual({
      key: 'on_login_automation',
      data: { composeUpForActiveProfile: true },
    })
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

  it('parses active_profile store set with any valid string', () => {
    const v = StoreSetRequestSchema.parse({ key: 'active_profile', data: 'web-dev' })
    expect(v).toEqual({ key: 'active_profile', data: 'web-dev' })
    const v2 = StoreSetRequestSchema.parse({ key: 'active_profile', data: 'Custom Profile Name' })
    expect(v2).toEqual({ key: 'active_profile', data: 'Custom Profile Name' })
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

  it('parseStoredActiveProfile accepts canonical, legacy, and custom ids', () => {
    expect(parseStoredActiveProfile('empty')).toBe('empty')
    expect(parseStoredActiveProfile('minimal')).toBe('empty')
    expect(parseStoredActiveProfile('desktop-qt')).toBe('desktop-gui')
    expect(parseStoredActiveProfile('typo')).toBe('typo')
    expect(parseStoredActiveProfile(null)).toBe(null)
  })

  it('resolveActiveProfileName maps template ids to custom profiles', () => {
    const custom = [{ name: 'My Web', baseTemplate: 'web-dev' as const }]
    expect(resolveActiveProfileName('web-dev', custom)).toBe('My Web')
    expect(resolveActiveProfileName('My Web', custom)).toBe('My Web')
    expect(resolveActiveProfileName('web-dev', [])).toBe(null)
    expect(resolveActiveProfileName('orphan', custom)).toBe(null)
    expect(isStoredActiveProfileValid('web-dev', custom)).toBe(true)
    expect(isStoredActiveProfileValid('orphan', custom)).toBe(false)
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

  it('parseAppearance returns {} on invalid data', () => {
    expect(parseAppearance(null)).toEqual({})
    expect(parseAppearance({ accent: 'not-a-color' })).toEqual({})
  })

  it('parseAppearance keeps valid theme modes', () => {
    expect(parseAppearance({ theme: 'high-contrast' })).toEqual({ theme: 'high-contrast' })
  })

  it('parseAppearance keeps valid hex', () => {
    expect(parseAppearance({ accent: '#aabbcc' })).toEqual({ accent: '#aabbcc' })
  })

  it('parses appearance store set', () => {
    const v = StoreSetRequestSchema.parse({
      key: 'appearance',
      data: { accent: '#ff7043' },
    })
    if (v.key !== 'appearance') throw new Error('expected appearance branch')
    expect(v.data.accent).toBe('#ff7043')
  })

  it('rejects appearance store set with invalid hex', () => {
    expect(() =>
      StoreSetRequestSchema.parse({
        key: 'appearance',
        data: { accent: 'red' },
      } as never)
    ).toThrow()
  })

  it('accepts cloud_oauth_clients store set', () => {
    const v = StoreSetRequestSchema.parse({
      key: 'cloud_oauth_clients',
      data: { github_client_id: 'Iv1.test', gitlab_client_id: 'glid' },
    })
    if (v.key !== 'cloud_oauth_clients') throw new Error('expected cloud_oauth_clients')
    expect(v.data.github_client_id).toBe('Iv1.test')
    expect(v.data.gitlab_client_id).toBe('glid')
  })

  it('accepts git VCS stage-all (empty filePaths)', () => {
    expect(
      GitVcsStageRequestSchema.parse({ repoPath: '/repo', filePaths: [], stageAll: true }),
    ).toEqual({ repoPath: '/repo', filePaths: [], stageAll: true })
  })

  it('rejects git VCS stage-all with non-empty filePaths', () => {
    expect(() =>
      GitVcsStageRequestSchema.parse({ repoPath: '/repo', filePaths: ['a.ts'], stageAll: true }),
    ).toThrow()
  })

  it('rejects git VCS stage paths with empty filePaths', () => {
    expect(() => GitVcsStageRequestSchema.parse({ repoPath: '/repo', filePaths: [] })).toThrow()
  })

  it('validates cloud git PR checks request and response shapes', () => {
    expect(
      CloudGitGetPrChecksRequestSchema.parse({
        provider: 'github',
        repoPath: '/home/user/repo',
        reference: 'main',
      }),
    ).toEqual({
      provider: 'github',
      repoPath: '/home/user/repo',
      reference: 'main',
    })

    expect(
      CloudPrDetailsSchema.parse({
        mergeable: true,
        mergeable_state: 'clean',
        base_branch: 'main',
        checks: [{ id: '1', name: 'CI', status: 'completed', conclusion: 'success' }],
      }),
    ).toMatchObject({ mergeable: true, checks: [{ id: '1', name: 'CI' }] })

    expect(() =>
      CloudGitGetPrChecksRequestSchema.parse({
        provider: 'github',
        repoPath: '/repo',
        reference: '',
      }),
    ).toThrow()
  })

  describe('P10 batch 2 — payload schemas', () => {
    it('validates docker inspect, reconfigure, search, tags, terminal', () => {
      expect(DockerInspectRequestSchema.parse({ id: 'abc123' })).toEqual({ id: 'abc123' })
      expect(
        DockerReconfigureRequestSchema.parse({
          id: 'abc123',
          ports: [{ hostPort: 8080, containerPort: 80, protocol: 'tcp' }],
          networkMode: 'bridge',
        }),
      ).toMatchObject({ id: 'abc123', networkMode: 'bridge' })
      expect(DockerSearchRequestSchema.parse('nginx')).toBe('nginx')
      expect(DockerGetTagsRequestSchema.parse('library/nginx')).toBe('library/nginx')
      expect(
        DockerTerminalRequestSchema.parse({ containerId: 'c1', cols: 120, rows: 34 }),
      ).toEqual({ containerId: 'c1', cols: 120, rows: 34 })
      expect(() => DockerInspectRequestSchema.parse({ id: '' })).toThrow()
    })

    it('validates ssh list-dir and setup-remote-key', () => {
      expect(
        SshListDirRequestSchema.parse({
          user: 'dev',
          host: 'example.com',
          port: 22,
          remotePath: '/home/dev',
        }),
      ).toMatchObject({ user: 'dev', host: 'example.com' })
      expect(
        SshSetupRemoteKeyRequestSchema.parse({
          user: 'dev',
          host: 'example.com',
          publicKey: 'ssh-ed25519 AAAA user@host',
        }),
      ).toMatchObject({ publicKey: 'ssh-ed25519 AAAA user@host' })
      expect(() => SshSetupRemoteKeyRequestSchema.parse({ user: 'u', host: 'h', publicKey: '' })).toThrow()
    })

    it('validates log stream start/stop and terminal write/resize', () => {
      expect(LogStreamStartRequestSchema.parse({ source: 'compose', id: 'web-dev' })).toEqual({
        source: 'compose',
        id: 'web-dev',
      })
      expect(LogStreamStopRequestSchema.parse({ streamId: 'stream-1' })).toEqual({
        streamId: 'stream-1',
      })
      expect(TerminalWriteRequestSchema.parse({ id: 't1', data: 'ls\n' })).toEqual({
        id: 't1',
        data: 'ls\n',
      })
      expect(TerminalResizeRequestSchema.parse({ id: 't1', cols: 80, rows: 24 })).toEqual({
        id: 't1',
        cols: 80,
        rows: 24,
      })
    })

    it('validates profile credentials and job start payloads', () => {
      expect(
        ProfileCredentialsStoreRequestSchema.parse({ id: 'OPENAI_API_KEY', value: 'sk-test' }),
      ).toEqual({ id: 'OPENAI_API_KEY', value: 'sk-test' })
      expect(ProfileCredentialsIdRequestSchema.parse({ id: 'OPENAI_API_KEY' })).toEqual({
        id: 'OPENAI_API_KEY',
      })
      expect(
        JobStartRequestSchema.parse({ kind: 'runtime_install', runtimeId: 'node', method: 'local' }),
      ).toMatchObject({ kind: 'runtime_install', runtimeId: 'node' })
      expect(JobCancelRequestSchema.parse({ id: '550e8400-e29b-41d4-a716-446655440000' })).toEqual({
        id: '550e8400-e29b-41d4-a716-446655440000',
      })
    })

    it('aliases git recent/config and ssh generate request schemas', () => {
      expect(GitRecentAddRequestSchema.parse({ path: '/home/user/repo' })).toEqual({
        path: '/home/user/repo',
      })
      expect(
        GitConfigSetRequestSchema.parse({
          name: 'Dev',
          email: 'dev@example.com',
          target: 'host',
        }),
      ).toMatchObject({ email: 'dev@example.com' })
      expect(GitConfigSetKeyRequestSchema.parse({ key: 'core.editor', value: 'vim' })).toEqual({
        key: 'core.editor',
        value: 'vim',
      })
      expect(SshGenerateRequestSchema).toBe(SshGenerateSchema)
    })
  })

  describe('P10 batch 3 — remaining payload schemas', () => {
    it('validates docker install, cleanup, diagnostics, fs open', () => {
      expect(
        DockerInstallRequestSchema.parse({ distro: 'arch', components: ['docker', 'compose'] }),
      ).toMatchObject({ distro: 'arch' })
      expect(
        DockerCleanupRunRequestSchema.parse({
          containers: true,
          images: false,
          volumes: true,
        }),
      ).toMatchObject({ containers: true, volumes: true })
      expect(
        DiagnosticsBundleCreateRequestSchema.parse({
          includeSensitive: false,
          report: { phase: 'P10' },
        }),
      ).toMatchObject({ includeSensitive: false })
      expect(FsOpenRequestSchema.parse({ path: '/tmp' })).toEqual({ path: '/tmp' })
      expect(() => DockerInstallRequestSchema.parse({ distro: 'debian' })).toThrow()
    })

    it('validates runtime, system readiness, terminal close, git vcs aliases', () => {
      expect(RuntimeInstalledVersionsRequestSchema.parse({ runtimeId: 'node' })).toEqual({
        runtimeId: 'node',
      })
      expect(
        RuntimeRemoveVersionRequestSchema.parse({
          runtimeId: 'node',
          path: '/home/user/.nvm/versions/node/v20.0.0',
          version: '20.0.0',
        }),
      ).toMatchObject({ runtimeId: 'node' })
      expect(SystemReadinessFixRequestSchema.parse({ id: 'docker-group' })).toEqual({
        id: 'docker-group',
      })
      expect(TerminalCloseRequestSchema.parse({ id: 'term-1' })).toEqual({ id: 'term-1' })
      expect(GitVcsStatusRequestSchema.parse({ repoPath: '/repo' })).toEqual({ repoPath: '/repo' })
      expect(
        GitVcsConflictHunksRequestSchema.parse({ repoPath: '/repo', filePath: 'src/a.ts' }),
      ).toEqual({ repoPath: '/repo', filePath: 'src/a.ts' })
      expect(SessionInfoRequestSchema.parse({})).toEqual({})
    })
  })
})
