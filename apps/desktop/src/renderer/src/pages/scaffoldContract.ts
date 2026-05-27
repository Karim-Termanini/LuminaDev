export type ScaffoldResult = { ok: boolean; error?: string; path?: string }
export type ScaffoldDepsResult = { ok: boolean; error?: string; log?: string }

export function assertScaffoldOk(result: unknown, fallback = 'Project scaffolding failed'): void {
  if (!result || typeof result !== 'object') {
    throw new Error(`${fallback} (invalid response payload)`)
  }
  const maybe = result as ScaffoldResult
  if (typeof maybe.ok !== 'boolean') {
    throw new Error(`${fallback} (missing ok flag)`)
  }
  if (maybe.ok === false) {
    throw new Error(maybe.error || fallback)
  }
}

export function assertScaffoldDepsOk(result: unknown, fallback = 'Dependency install failed'): void {
  if (!result || typeof result !== 'object') {
    throw new Error(`${fallback} (invalid response payload)`)
  }
  const maybe = result as ScaffoldDepsResult
  if (typeof maybe.ok !== 'boolean') {
    throw new Error(`${fallback} (missing ok flag)`)
  }
  if (maybe.ok === false) {
    throw new Error(maybe.error || fallback)
  }
}
