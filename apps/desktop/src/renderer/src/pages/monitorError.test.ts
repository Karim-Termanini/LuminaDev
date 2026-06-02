import { describe, expect, it } from 'vitest'
import { humanizeMonitorError } from './monitorError'

describe('humanizeMonitorError', () => {
  it('maps MONITOR_TOP_FAILED error code', () => {
    expect(
      humanizeMonitorError('[MONITOR_TOP_FAILED] could not read /proc')
    ).toBe('Failed to collect process list. could not read /proc')
  })

  it('maps DOCKER_UNAVAILABLE error code', () => {
    expect(
      humanizeMonitorError('[DOCKER_UNAVAILABLE] daemon not running')
    ).toBe('Docker daemon/socket unavailable. daemon not running')
  })

  it('maps HOST_COMMAND_TIMEOUT error code', () => {
    const result = humanizeMonitorError('[HOST_COMMAND_TIMEOUT] docker ps')
    expect(result).toContain('A host command took too long and was stopped.')
    expect(result).toContain('docker ps')
  })

  it('detects permission denied from raw text', () => {
    expect(
      humanizeMonitorError('Permission denied while accessing /proc/cpuinfo')
    ).toBe('Permission denied. Some metrics might require elevated access.')
  })

  it('detects missing file from raw text', () => {
    expect(
      humanizeMonitorError('Error: no such file or directory')
    ).toBe('System metrics source not found (non-Linux system?).')
  })

  it('detects timeout from raw text', () => {
    expect(
      humanizeMonitorError('Connection timeout after 30s')
    ).toBe('Metrics collection timed out.')
  })

  it('returns detail from unparsed Error', () => {
    const err = new Error('Some unexpected error')
    expect(humanizeMonitorError(err)).toBe('Some unexpected error')
  })

  it('falls back to default for empty error', () => {
    expect(humanizeMonitorError('')).toBe('Failed to collect monitor data.')
  })
})
