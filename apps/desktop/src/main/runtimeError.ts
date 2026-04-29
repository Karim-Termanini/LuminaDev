export function runtimeErrorString(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err)
  const m = raw.toLowerCase()

  if (/permission denied|eacces|pkexec:/.test(m)) {
    return `[RUNTIME_PERMISSION_DENIED] Permission denied. Elevated privileges are required for system installation.`
  }
  if (/no such file or directory|enoent/.test(m)) {
    return `[RUNTIME_NOT_FOUND] Tools or directories needed for installation were not found.`
  }
  if (/timeout|timed out|etimedout/.test(m)) {
    return `[RUNTIME_TIMEOUT] The operation timed out. This might be due to a slow network connection.`
  }
  if (/no space left on device|enospc/.test(m)) {
    return `[RUNTIME_NO_SPACE] Installation failed: No space left on device.`
  }
  if (/invalid version|not found in registry/.test(m)) {
    return `[RUNTIME_INVALID_VERSION] The requested version is not available or invalid.`
  }
  if (/dependency installation failed/.test(m)) {
    return `[RUNTIME_DEP_FAIL] Failed to install required system dependencies (e.g. build-essential, libssl).`
  }

  return `[RUNTIME_UNKNOWN] ${raw || fallback}`
}
