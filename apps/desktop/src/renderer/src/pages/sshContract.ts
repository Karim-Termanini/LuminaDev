export type SshOpResult = { ok: boolean; error?: string }

export function assertSshOk(result: unknown, fallback?: string, t?: (key: string) => string): void {
  const fb = fallback || (t ? t('error.fallback') : 'SSH operation failed.')
  if (!result || typeof result !== 'object') {
    throw new Error(`${fb} (invalid response payload)`)
  }
  const maybe = result as SshOpResult
  if (typeof maybe.ok !== 'boolean') {
    throw new Error(`${fb} (missing ok flag)`)
  }
  if (maybe.ok === false) {
    throw new Error(maybe.error || fb)
  }
}
