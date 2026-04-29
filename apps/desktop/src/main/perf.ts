import type { PerfSnapshot } from '@linux-dev-home/shared'

export function collectPerfSnapshot(appStartAtMs: number): PerfSnapshot {
  const mem = process.memoryUsage()
  return {
    startupMs: Math.max(0, Date.now() - appStartAtMs),
    rssMb: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
    heapUsedMb: Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10,
    heapTotalMb: Math.round((mem.heapTotal / (1024 * 1024)) * 10) / 10,
    uptimeSec: Math.round(process.uptime()),
  }
}
