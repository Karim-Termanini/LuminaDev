#!/usr/bin/env node
/**
 * Rasterize the Freedesktop SVG app icon into PNG sizes referenced by tauri.conf.json.
 * Requires: rsvg-convert (librsvg2-bin) on PATH when (re)generating.
 *
 * Skips when all target PNGs already exist (committed in repo) unless --force or FORCE=1.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..', '..')
const svg = path.join(
  repoRoot,
  'data/icons/hicolor/scalable/apps/io.github.karimodora.LinuxDevHome.svg',
)
const sizes = [32, 128, 256]
const force = process.argv.includes('--force') || process.env.FORCE === '1'

const outputs = sizes.map((size) =>
  path.join(repoRoot, 'data/icons/hicolor', `${size}x${size}`, 'apps', 'io.github.karimodora.LinuxDevHome.png'),
)

if (!force && outputs.every((p) => existsSync(p))) {
  console.log('generate-tauri-icons: PNGs present; skip (use --force to regenerate)')
  process.exit(0)
}

if (!existsSync(svg)) {
  console.error(`generate-tauri-icons: missing source SVG: ${svg}`)
  process.exit(1)
}

const rsvg = spawnSync('rsvg-convert', ['--version'], { encoding: 'utf8' })
if (rsvg.error || rsvg.status !== 0) {
  console.error(
    'generate-tauri-icons: install rsvg-convert (librsvg2-bin / librsvg on PATH) to rasterize icons',
  )
  process.exit(1)
}

for (let i = 0; i < sizes.length; i++) {
  const size = sizes[i]
  const out = outputs[i]
  const outDir = path.dirname(out)
  mkdirSync(outDir, { recursive: true })
  const r = spawnSync('rsvg-convert', ['-w', String(size), '-h', String(size), svg, '-o', out], {
    stdio: 'inherit',
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
  console.log(`wrote ${path.relative(repoRoot, out)}`)
}
