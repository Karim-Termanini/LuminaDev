import type { DashboardLayoutFile } from '@linux-dev-home/shared'

export type DashboardLayoutGetResult = {
  ok: boolean
  layout?: DashboardLayoutFile
  error?: string
}

export function assertDashboardLayoutGet(
  result: unknown,
  fallback = 'Failed to load dashboard layout.'
): DashboardLayoutFile {
  if (!result || typeof result !== 'object') {
    throw new Error(`${fallback} (invalid response payload)`)
  }
  const maybe = result as DashboardLayoutGetResult
  if (typeof maybe.ok !== 'boolean') {
    throw new Error(`${fallback} (missing ok flag)`)
  }
  if (maybe.ok === false) {
    throw new Error(maybe.error || fallback)
  }
  if (!maybe.layout || typeof maybe.layout !== 'object') {
    throw new Error(`${fallback} (missing layout payload)`)
  }
  return maybe.layout
}
