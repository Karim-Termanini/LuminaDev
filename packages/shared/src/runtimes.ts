/**
 * Distro package manager only — no isolated/local installer in the install wizard.
 * Must match Rust `SYSTEM_ONLY_RUNTIMES` in runtime_jobs.rs.
 */
export const RUNTIME_SYSTEM_ONLY_IDS = ['lisp', 'c_cpp', 'matlab', 'php'] as const

export type RuntimeSystemOnlyId = (typeof RUNTIME_SYSTEM_ONLY_IDS)[number]

export function runtimeIsSystemOnly(runtimeId: string): boolean {
  return (RUNTIME_SYSTEM_ONLY_IDS as readonly string[]).includes(runtimeId)
}

export function runtimeSupportsLocalInstall(runtimeId: string): boolean {
  return !runtimeIsSystemOnly(runtimeId)
}
