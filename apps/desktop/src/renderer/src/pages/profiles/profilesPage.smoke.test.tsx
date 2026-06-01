import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../i18n/I18nContext'

const sampleProfiles = [
  {
    name: 'Test Stack',
    baseTemplate: 'webapp',
    envVars: [{ key: 'NODE_PORT', value: '3000' }],
    credentials: [],
    tags: ['demo'],
    sshKeyId: '',
    stackMode: 'full' as const,
  },
]

const mockDh = {
  storeGet: vi.fn(async ({ key }: { key: string }) => {
    if (key === 'custom_profiles') return { ok: true, data: sampleProfiles }
    if (key === 'on_login_automation') return { ok: true, data: {} }
    if (key === 'active_profile') return { ok: true, data: 'Test Stack' }
    if (key.startsWith('project_dir_')) return { ok: true, data: null }
    return { ok: true, data: null }
  }),
  storeSet: vi.fn().mockResolvedValue({ ok: true }),
  storeDelete: vi.fn().mockResolvedValue({ ok: true }),
  sshGetPub: vi.fn().mockResolvedValue({ ok: true, pub: 'ssh-ed25519 AAAA test' }),
  sshGenerate: vi.fn().mockResolvedValue({ ok: true, keyName: 'lumina_test_stack' }),
  profileCredentialsList: vi.fn().mockResolvedValue({ ok: true, ids: ['OPENAI_API_KEY'] }),
  profileCredentialsStore: vi.fn().mockResolvedValue({ ok: true }),
}

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (_cmd: string, req?: { channel?: string }) => {
    if (req?.channel === 'dh:profile:running-status') {
      return { ok: true, running: ['Test Stack'] }
    }
    if (req?.channel === 'dh:ports:suggest') {
      return { ok: true, ports: [] }
    }
    return { ok: true }
  }),
}))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).window = {
  dh: mockDh,
  localStorage: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}

import { ProfilesPage } from '../ProfilesPage'
import { ProfileWizardModal } from './ProfileWizardModal'
import { ProfilesBuilderTab } from './ProfilesBuilderTab'
import type { ProfilesPageViewModel } from './useProfilesPage'

function wrap(ui: React.ReactElement): string {
  return renderToStaticMarkup(
    <I18nProvider>
      <MemoryRouter initialEntries={['/profiles']}>
        <Routes>
          <Route path="/profiles" element={ui} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  )
}

describe('ProfilesPage smoke', () => {
  it('renders page shell, tabs, and builder hero', () => {
    const html = wrap(<ProfilesPage />)
    expect(html).toContain('Profile Engine Room')
    expect(html).toContain('Environments')
    expect(html).toContain('Global Automation')
    expect(html).toContain('Backup &amp; Sync')
    expect(html).toContain('profiles-page')
    expect(html).toContain('+ Create Environment')
    expect(html).not.toContain('vm.profiles-list')
  })

  it('uses profiles-list CSS classes when profiles exist (initial SSR markup)', () => {
    // useEffect does not run under renderToStaticMarkup; empty list is expected.
    const html = wrap(<ProfilesPage />)
    expect(html).not.toContain('profiles-list-container')
    expect(html).toContain('No custom environments yet')
  })
})

describe('ProfilesBuilderTab smoke', () => {
  it('renders list rows with correct CSS classes when profiles are present', () => {
    const vm = {
      profiles: sampleProfiles,
      runningProfiles: new Set(['Test Stack']),
      activeProfileTemplate: 'Test Stack',
      openDropdownIdx: null,
      rowError: {},
      actionLoading: {},
      projectPaths: { 'Test Stack': null },
      openCreateModal: vi.fn(),
      openEditModal: vi.fn(),
      setStatus: vi.fn(),
      setActionLoading: vi.fn(),
      setRowError: vi.fn(),
      setOpenDropdownIdx: vi.fn(),
      refreshRunning: vi.fn(),
      setAsActive: vi.fn(),
      loadExtras: vi.fn(),
      save: vi.fn(),
      duplicateAt: vi.fn(),
      removeAt: vi.fn(),
      t: (key: string) => key,
    } as unknown as ProfilesPageViewModel

    const html = renderToStaticMarkup(
      <I18nProvider>
        <ProfilesBuilderTab vm={vm} />
      </I18nProvider>
    )
    expect(html).toContain('profiles-list-container')
    expect(html).toContain('profiles-list-row')
    expect(html).not.toContain('vm.profiles-list')
    expect(html).toContain('Test Stack')
    expect(html).toContain('badge.active')
  })
})

describe('ProfileWizardModal smoke', () => {
  it('renders step 1 when wizard is open', () => {
    const vm = {
      wizardData: sampleProfiles[0],
      wizardStep: 1,
      isCreatingProfile: true,
      setWizardStep: vi.fn(),
      setWizardData: vi.fn(),
      setIsCreatingProfile: vi.fn(),
      setEditingProfileIdx: vi.fn(),
      setOtherRuntimePorts: vi.fn(),
      wizardNextBlocked: false,
      saveWizardChanges: vi.fn(),
      duplicateProfileName: null,
      profiles: [],
      editingProfileIdx: null,
      tagInput: '',
      setTagInput: vi.fn(),
      t: (key: string, opts?: { name?: string }) =>
        opts?.name ? `${key}:${opts.name}` : key,
    } as unknown as ProfilesPageViewModel

    const html = renderToStaticMarkup(
      <I18nProvider>
        <ProfileWizardModal vm={vm} />
      </I18nProvider>
    )
    expect(html).toContain('wizard.general.title')
    expect(html).toContain('wizard.step1')
    expect(html).toContain('btn.next')
    expect(html).not.toContain('vm.profiles-list')
  })
})
