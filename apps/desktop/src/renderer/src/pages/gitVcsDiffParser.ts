export type DiffLine = {
  type: '+' | '-' | ' '
  content: string
  oldNum?: number
  newNum?: number
}

export type DiffHunk = {
  header: string
  lines: DiffLine[]
}

export function parseUnifiedDiff(raw: string): DiffHunk[] {
  const hunks: DiffHunk[] = []
  let current: DiffHunk | null = null
  let oldLine = 0
  let newLine = 0

  for (const line of raw.split('\n')) {
    // Hunk header: @@ -a,b +c,d @@
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunkMatch) {
      if (current) hunks.push(current)
      oldLine = parseInt(hunkMatch[1], 10)
      newLine = parseInt(hunkMatch[2], 10)
      current = { header: line, lines: [] }
      continue
    }
    if (!current) continue
    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.lines.push({ type: '+', content: line.slice(1), newNum: newLine++ })
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      current.lines.push({ type: '-', content: line.slice(1), oldNum: oldLine++ })
    } else if (line.startsWith(' ')) {
      current.lines.push({ type: ' ', content: line.slice(1), oldNum: oldLine++, newNum: newLine++ })
    }
  }
  if (current) hunks.push(current)
  return hunks
}
