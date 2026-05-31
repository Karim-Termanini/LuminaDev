import { describe, expect, it } from 'vitest'

import { isUnitNotFoundError } from './maintenanceSystemdServices'

describe('maintenanceSystemdServices', () => {
  it('detects missing systemd unit errors', () => {
    expect(isUnitNotFoundError('[SYSTEMCTL_START_FAILED] Failed to start ufw.service: Unit ufw.service not found.')).toBe(true)
    expect(isUnitNotFoundError('Unit nginx.service could not be found.')).toBe(true)
    expect(isUnitNotFoundError('permission denied')).toBe(false)
  })
})
