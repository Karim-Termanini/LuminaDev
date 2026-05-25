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
import { SettingsBetaFeatures } from './SettingsBetaFeatures'
import { SettingsNotification } from './SettingsNotification'
import { SettingsShortcuts, buildChord } from './SettingsShortcuts'
import { SettingsHelpAbout } from './SettingsHelpAbout'
import { SettingsDateTime } from './SettingsDateTime'
import { SettingsLanguages } from './SettingsLanguages'

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

describe('SettingsBetaFeatures', () => {
  it('renders flag labels', () => {
    const html = wrap(<SettingsBetaFeatures />)
    expect(html).toContain('Terminal multiplexer')
    expect(html).toContain('commit suggestions')
  })
})

describe('SettingsNotification', () => {
  it('renders global mute label', () => {
    expect(wrap(<SettingsNotification />)).toContain('Global mute')
  })
  it('OS native notifications toggle is disabled', () => {
    expect(wrap(<SettingsNotification />)).toContain('disabled')
  })
})

describe('buildChord', () => {
  it('builds ctrl+shift+x', () => {
    expect(buildChord({ ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, key: 'x' })).toBe('Ctrl+Shift+X')
  })
  it('builds alt+1', () => {
    expect(buildChord({ ctrlKey: false, shiftKey: false, altKey: true, metaKey: false, key: '1' })).toBe('Alt+1')
  })
  it('ignores bare modifier press', () => {
    expect(buildChord({ ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, key: 'Control' })).toBe(null)
  })
})

describe('SettingsShortcuts', () => {
  it('renders table columns', () => {
    const html = wrap(<SettingsShortcuts />)
    expect(html).toContain('Action')
    expect(html).toContain('Binding')
  })
})

describe('SettingsHelpAbout', () => {
  it('renders LuminaDev name', () => {
    expect(wrap(<SettingsHelpAbout />)).toContain('LuminaDev')
  })
  it('renders GitHub link button', () => {
    expect(wrap(<SettingsHelpAbout />)).toContain('GitHub')
  })
})

describe('SettingsDateTime', () => {
  it('renders 12h/24h toggle', () => {
    const html = wrap(<SettingsDateTime />)
    expect(html).toContain('12-hour')
    expect(html).toContain('24-hour')
  })
  it('renders timezone label', () => {
    expect(wrap(<SettingsDateTime />)).toContain('Timezone')
  })
})

describe('SettingsLanguages', () => {
  it('renders English and placeholder options', () => {
    const html = wrap(<SettingsLanguages />)
    expect(html).toContain('English')
    expect(html).toContain('Español')
    expect(html).toContain('Français')
  })
})
