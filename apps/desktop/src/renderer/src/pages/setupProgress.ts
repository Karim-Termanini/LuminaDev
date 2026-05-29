/** Profile switch (Docker) finishes in this band; dependency install uses the rest. */
export const STACK_PROGRESS_CAP = 80
export const INSTALL_PROGRESS_START = 72
export const INSTALL_PROGRESS_END = 99

/** Map pip / npm / R install log lines to 72–99%. */
export function progressFromInstallLog(raw: string, current: number): number {
  let next = Math.max(current, INSTALL_PROGRESS_START)
  const line = raw.trim()
  if (!line) return next

  const pctMatches = [...line.matchAll(/(\d{1,3})%/g)]
  const pctMatch = pctMatches.length > 0 ? pctMatches[pctMatches.length - 1] : null
  if (pctMatch) {
    const pct = Number(pctMatch[1]) / 100
    next = Math.max(
      next,
      INSTALL_PROGRESS_START + pct * (INSTALL_PROGRESS_END - INSTALL_PROGRESS_START)
    )
    return Math.min(INSTALL_PROGRESS_END, next)
  }

  const dlMatch = line.match(/([\d.]+)\s*\/\s*([\d.]+)\s*(k|M|G)?i?B/i)
  if (dlMatch) {
    const cur = Number.parseFloat(dlMatch[1])
    const total = Number.parseFloat(dlMatch[2])
    if (total > 0) {
      const frac = cur / total
      next = Math.max(
        next,
        INSTALL_PROGRESS_START + frac * (INSTALL_PROGRESS_END - INSTALL_PROGRESS_START)
      )
    }
  } else {
    next = Math.min(INSTALL_PROGRESS_END, next + 0.25)
  }

  return Math.min(INSTALL_PROGRESS_END, Math.max(current, next))
}

/** Slow ramp while polling for containers after compose (only if stack not already verified). */
export function stackWaitProgress(attempt: number, maxAttempts: number, current: number): number {
  const base = Math.max(current, STACK_PROGRESS_CAP - 10)
  const span = 8
  return Math.min(STACK_PROGRESS_CAP, base + Math.floor((attempt / maxAttempts) * span))
}
