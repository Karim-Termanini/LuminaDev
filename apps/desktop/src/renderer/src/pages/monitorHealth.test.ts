import { describe, expect, it } from 'vitest'

import {
  getMonitorHealthDescription,
  getMonitorHealthLevel,
} from './monitorHealth'

const t = (key: string) => key

describe('monitorHealth', () => {
  it('classifies CPU thresholds', () => {
    expect(getMonitorHealthLevel('cpu', 45)).toBe('good')
    expect(getMonitorHealthLevel('cpu', 75)).toBe('warn')
    expect(getMonitorHealthLevel('cpu', 95)).toBe('critical')
  })

  it('classifies RAM thresholds', () => {
    expect(getMonitorHealthLevel('ram', 41)).toBe('good')
    expect(getMonitorHealthLevel('ram', 85)).toBe('warn')
    expect(getMonitorHealthLevel('ram', 96)).toBe('critical')
  })

  it('classifies disk thresholds', () => {
    expect(getMonitorHealthLevel('disk', 42)).toBe('good')
    expect(getMonitorHealthLevel('disk', 90)).toBe('warn')
    expect(getMonitorHealthLevel('disk', 98)).toBe('critical')
  })

  it('returns health copy keys', () => {
    expect(getMonitorHealthDescription('cpu', 45, t)).toBe('health.cpu.good')
    expect(getMonitorHealthDescription('ram', 85, t)).toBe('health.ram.warn')
    expect(getMonitorHealthDescription('disk', 98, t)).toBe('health.disk.critical')
  })
})
