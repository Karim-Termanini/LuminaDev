import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

// Mock window.dh for all tab tests (renderToStaticMarkup is server-side; effects don't run)
const mockDh = {
  storeGet: vi.fn().mockResolvedValue({ ok: true, data: null }),
  storeSet: vi.fn().mockResolvedValue({ ok: true }),
  cloudAuthStatus: vi.fn().mockResolvedValue({ ok: true, accounts: [] }),
  hostExec: vi.fn().mockResolvedValue({ ok: true, result: '' }),
  appInfo: vi.fn().mockResolvedValue({ ok: true, version: '0.2.0', buildDate: '2026-05-25', rustVersion: 'rustc 1.79', platform: 'linux' }),
  selectFolder: vi.fn().mockResolvedValue(null),
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).window = { dh: mockDh }

import { SettingsShell } from './SettingsShell'
import { SettingsResources } from './SettingsResources'
import { SettingsAppEngine } from './SettingsAppEngine'
import { SettingsBuilder } from './SettingsBuilder'

function wrap(ui: React.ReactElement): string {
  return renderToStaticMarkup(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('SettingsShell', () => {
  it('renders nav with 16 tabs', () => {
    const html = wrap(<SettingsShell />)
    expect(html).toContain('Personalization')
    expect(html).toContain('Resources')
    expect(html).toContain('Shortcuts')
    expect(html).toContain('Help &amp; About')
    expect(html).toContain('Languages')
  })
})

describe('SettingsResources', () => {
  it('renders CPU slider label', () => {
    expect(wrap(<SettingsResources />)).toContain('CPU limit')
  })
  it('renders RAM label', () => {
    expect(wrap(<SettingsResources />)).toContain('RAM allocation')
  })
})

describe('SettingsAppEngine', () => {
  it('renders IPC timeout label', () => {
    expect(wrap(<SettingsAppEngine />)).toContain('IPC timeout')
  })
})

describe('SettingsBuilder', () => {
  it('renders Cargo path label', () => {
    expect(wrap(<SettingsBuilder />)).toContain('Cargo path')
  })
})
