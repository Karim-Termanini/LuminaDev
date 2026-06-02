import { describe, expect, it } from 'vitest'
import { humanizeDashboardError } from './dashboardError'

describe('humanizeDashboardError', () => {
  it('maps DOCKER_PERMISSION_DENIED error code', () => {
    expect(
      humanizeDashboardError('[DOCKER_PERMISSION_DENIED] access denied')
    ).toBe('Docker permission denied. access denied')
  })

  it('maps DOCKER_UNAVAILABLE error code', () => {
    expect(
      humanizeDashboardError('[DOCKER_UNAVAILABLE] daemon not running')
    ).toBe('Docker daemon/socket unavailable. daemon not running')
  })

  it('maps DOCKER_TIMEOUT error code', () => {
    expect(
      humanizeDashboardError('[DOCKER_TIMEOUT] operation took too long')
    ).toBe('Docker operation timed out. operation took too long')
  })

  it('maps HOST_COMMAND_TIMEOUT error code with prefix', () => {
    const result = humanizeDashboardError('[HOST_COMMAND_TIMEOUT] docker ps')
    expect(result).toContain('A host command took too long and was stopped.')
    expect(result).toContain('docker ps')
  })

  it('detects permission denied from raw text', () => {
    expect(
      humanizeDashboardError('Permission denied while accessing /proc/cpuinfo')
    ).toBe('Permission denied. Some metrics might require elevated access.')
  })

  it('detects EACCES from raw text', () => {
    expect(
      humanizeDashboardError('EACCES: permission denied')
    ).toBe('Permission denied. Some metrics might require elevated access.')
  })

  it('detects missing file from raw text', () => {
    expect(
      humanizeDashboardError('Error: no such file or directory')
    ).toBe('System metrics source not found (non-Linux system?).')
  })

  it('detects timeout from raw text', () => {
    expect(
      humanizeDashboardError('Connection timeout after 30s')
    ).toBe('Metrics collection timed out.')
  })

  it('returns detail from unparsed Error with unknown patterns', () => {
    const err = new Error('Some unexpected dashboard failure')
    expect(humanizeDashboardError(err)).toBe('Some unexpected dashboard failure')
  })

  it('falls back to default for empty error', () => {
    expect(humanizeDashboardError('')).toBe('Failed to collect dashboard metrics.')
  })

  it('handles non-Error string input', () => {
    expect(humanizeDashboardError('plain string error')).toBe('plain string error')
  })

  it('handles Error objects with permission denied', () => {
    const err = new Error('EACCES: permission denied, open /var/run/docker.sock')
    expect(humanizeDashboardError(err)).toBe(
      'Permission denied. Some metrics might require elevated access.'
    )
  })
})
