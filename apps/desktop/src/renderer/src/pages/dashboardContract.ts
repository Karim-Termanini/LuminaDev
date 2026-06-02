export type DashboardOpResult = { ok: boolean; error?: string }

export function assertDashboardOk(result: unknown, fallback = 'Dashboard operation failed.'): void {
  if (!result || typeof result !== 'object') {
    throw new Error(`${fallback} (invalid response payload)`)
  }
  const maybe = result as DashboardOpResult
  if (typeof maybe.ok !== 'boolean') {
    throw new Error(`${fallback} (missing ok flag)`)
  }
  if (maybe.ok === false) {
    throw new Error(maybe.error || fallback)
  }
}
