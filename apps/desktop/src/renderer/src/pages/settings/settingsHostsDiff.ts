/** Normalize line endings for hosts file comparison. */
export function normalizeHostsText(text: string): string {
  return text.replace(/\r\n/g, '\n').trimEnd()
}

export function hostsHasChanges(before: string, after: string): boolean {
  return normalizeHostsText(before) !== normalizeHostsText(after)
}

/** Line-level add/remove preview for /etc/hosts edits. */
export function hostsLineDiff(before: string, after: string): string[] {
  const beforeLines = normalizeHostsText(before).split('\n')
  const afterLines = normalizeHostsText(after).split('\n')
  const afterSet = new Set(afterLines)
  const beforeSet = new Set(beforeLines)
  const lines: string[] = []
  for (const line of beforeLines) {
    if (!afterSet.has(line)) lines.push(`- ${line}`)
  }
  for (const line of afterLines) {
    if (!beforeSet.has(line)) lines.push(`+ ${line}`)
  }
  return lines
}
