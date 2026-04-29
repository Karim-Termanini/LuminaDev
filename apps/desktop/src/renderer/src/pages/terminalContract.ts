export type TerminalOpResult = { ok: boolean; error?: string }

export function assertTerminalOk(result: unknown, fallback = 'Terminal operation failed.'): void {
  if (!result || typeof result !== 'object') {
    throw new Error(`${fallback} (invalid response payload)`)
  }
  const maybe = result as TerminalOpResult
  if (typeof maybe.ok !== 'boolean') {
    throw new Error(`${fallback} (missing ok flag)`)
  }
  if (maybe.ok === false) {
    throw new Error(maybe.error || fallback)
  }
}
