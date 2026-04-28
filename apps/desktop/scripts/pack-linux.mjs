import { cpSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(desktopRoot, '..', '..')
const stage = path.join(desktopRoot, 'pack-staging')

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run('pnpm', ['--filter', '@linux-dev-home/shared', 'build'], { cwd: repoRoot })
run('pnpm', ['build'], { cwd: desktopRoot })

rmSync(stage, { recursive: true, force: true })

run('pnpm', ['deploy', path.relative(repoRoot, stage), '--filter', 'desktop'], { cwd: repoRoot })

const bundledCompose = path.join(stage, 'docker-bundled', 'compose')
mkdirSync(path.dirname(bundledCompose), { recursive: true })
cpSync(path.join(repoRoot, 'docker', 'compose'), bundledCompose, { recursive: true })

const pkgPath = path.join(stage, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
if (!pkg.build?.extraResources?.[0]) {
  console.error('package.json missing build.extraResources[0]')
  process.exit(1)
}
pkg.build.extraResources[0].from = 'docker-bundled/compose'
const iconRel = path.relative(
  stage,
  path.join(repoRoot, 'data', 'icons', 'hicolor', 'scalable', 'apps', 'io.github.karimodora.LinuxDevHome.svg')
)
pkg.build.linux.icon = iconRel
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

run('pnpm', ['exec', 'electron-builder', '--linux', 'dir'], { cwd: stage })
