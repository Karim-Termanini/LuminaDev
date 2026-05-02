export type CloudAuthOpResult = { ok: boolean; error?: string }

export function assertCloudAuthOk(result: unknown, fallback = 'Cloud auth operation failed.'): void {
  if (!result || typeof result !== 'object') {
    throw new Error(`${fallback} (invalid response payload)`)
  }
  const maybe = result as CloudAuthOpResult
  if (typeof maybe.ok !== 'boolean') {
    throw new Error(`${fallback} (missing ok flag)`)
  }
  if (maybe.ok === false) {
    throw new Error(maybe.error || fallback)
  }
}
