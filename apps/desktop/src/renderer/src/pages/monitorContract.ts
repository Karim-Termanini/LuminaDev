export type MonitorOpResult<T, K extends string> = {
  ok: boolean
  error?: string
} & Partial<Record<K, T>>

export function assertMonitorOk<T, K extends string>(
  result: unknown,
  key: K,
  fallback = 'Monitor operation failed.'
): T {
  if (!result || typeof result !== 'object') {
    throw new Error(`${fallback} (invalid response payload)`)
  }
  const maybe = result as MonitorOpResult<T, K>
  if (typeof maybe.ok !== 'boolean') {
    throw new Error(`${fallback} (missing ok flag)`)
  }
  if (maybe.ok === false) {
    throw new Error(maybe.error || fallback)
  }
  if (!(key in maybe)) {
    throw new Error(`${fallback} (missing ${key} payload)`)
  }
  return maybe[key] as T
}
