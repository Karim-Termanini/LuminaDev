export type GitVcsOpResult = { ok: boolean; error?: string }

export function assertGitVcsOk(
  result: unknown,
  fallback = 'Git VCS operation failed.',
): void {
  if (!result || typeof result !== 'object') {
    throw new Error(`${fallback} (invalid response payload)`)
  }
  const maybe = result as GitVcsOpResult
  if (typeof maybe.ok !== 'boolean') {
    throw new Error(`${fallback} (missing ok flag)`)
  }
  if (maybe.ok === false) {
    throw new Error(maybe.error || fallback)
  }
}
