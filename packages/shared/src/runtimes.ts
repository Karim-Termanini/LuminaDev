/** Supported runtimes on `/runtimes` — must match Rust `handle_runtime_status` checks. */
export const RUNTIME_IDS = [
  'node',
  'python',
  'java',
  'go',
  'rust',
  'php',
  'dotnet',
] as const

export type RuntimeId = (typeof RUNTIME_IDS)[number]

/**
 * Distro package manager only — no isolated/local installer in the install wizard.
 * Must match Rust `SYSTEM_ONLY_RUNTIMES` in runtime_jobs.rs.
 */
export const RUNTIME_SYSTEM_ONLY_IDS = ['php'] as const

export type RuntimeSystemOnlyId = (typeof RUNTIME_SYSTEM_ONLY_IDS)[number]

export function runtimeIsSystemOnly(runtimeId: string): boolean {
  return (RUNTIME_SYSTEM_ONLY_IDS as readonly string[]).includes(runtimeId)
}

export function runtimeSupportsLocalInstall(runtimeId: string): boolean {
  return !runtimeIsSystemOnly(runtimeId)
}

export function isSupportedRuntimeId(runtimeId: string): runtimeId is RuntimeId {
  return (RUNTIME_IDS as readonly string[]).includes(runtimeId)
}
