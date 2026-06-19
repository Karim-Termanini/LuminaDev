import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const apiDir = dirname(fileURLToPath(import.meta.url))

/** Top-level `window.dh` method keys (excludes nested payload/response fields). */
const DH_METHOD_LINE = /^\s*(?:\(\w+\)\s*=>\s*)?(\w+):\s*(?:\(|async\b)/

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  if (start < 0) {
    throw new Error(`marker not found: ${startMarker}`)
  }
  const from = start + startMarker.length
  const end = source.indexOf(endMarker, from)
  if (end < 0) {
    throw new Error(`end marker not found after: ${startMarker}`)
  }
  return source.slice(from, end)
}

function extractDhBlockFromViteEnv(source: string): string {
  const anchor = source.indexOf('dh: {')
  if (anchor < 0) {
    throw new Error('vite-env.d.ts: dh block not found')
  }
  let depth = 0
  let begin = -1
  for (let i = anchor; i < source.length; i++) {
    const ch = source[i]
    if (ch === '{') {
      if (depth === 0) begin = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && begin >= 0) {
        return source.slice(begin, i + 1)
      }
    }
  }
  throw new Error('vite-env.d.ts: unclosed dh block')
}

function extractMethodNamesFromObjectBlock(block: string): string[] {
  const names: string[] = []
  for (const line of block.split('\n')) {
    const match = line.match(DH_METHOD_LINE)
    if (match) {
      names.push(match[1])
    }
  }
  return names
}

export function readDhMethodNamesFromViteEnv(): string[] {
  const source = readFileSync(join(apiDir, '../vite-env.d.ts'), 'utf8')
  return extractMethodNamesFromObjectBlock(extractDhBlockFromViteEnv(source))
}

export function readDhMethodNamesFromBridge(): string[] {
  const source = readFileSync(join(apiDir, 'desktopApiBridge.ts'), 'utf8')
  const body = sliceBetween(source, 'return {', '} satisfies DhApi')
  return extractMethodNamesFromObjectBlock(`{${body}}`)
}

export function diffSortedSets(a: string[], b: string[]): { onlyA: string[]; onlyB: string[] } {
  const setB = new Set(b)
  const setA = new Set(a)
  return {
    onlyA: a.filter((x) => !setB.has(x)).sort(),
    onlyB: b.filter((x) => !setA.has(x)).sort(),
  }
}
