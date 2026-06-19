#!/usr/bin/env node
/**
 * Rasterize the Freedesktop SVG app icon into PNG sizes referenced by tauri.conf.json.
 * Requires: rsvg-convert (librsvg) on PATH.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..', '..')
const svg = path.join(
  repoRoot,
  'data/icons/hicolor/scalable/apps/io.github.karimodora.LinuxDevHome.svg',
)
const sizes = [32, 128, 256]

const rsvg = spawnSync('rsvg-convert', ['--version'], { encoding: 'utf8' })
if (rsvg.error || rsvg.status !== 0) {
  console.error('generate-tauri-icons: install rsvg-convert (librsvg) to rasterize icons')
  process.exit(1)
}

for (const size of sizes) {
  const outDir = path.join(repoRoot, 'data/icons/hicolor', `${size}x${size}`, 'apps')
  const out = path.join(outDir, 'io.github.karimodora.LinuxDevHome.png')
  mkdirSync(outDir, { recursive: true })
  const r = spawnSync('rsvg-convert', ['-w', String(size), '-h', String(size), svg, '-o', out], {
    stdio: 'inherit',
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
  console.log(`wrote ${path.relative(repoRoot, out)}`)
}
