import { cpSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const dest = resolve(root, 'out/docker-profiles')
mkdirSync(dest, { recursive: true })
cpSync(resolve(root, '../../docker/compose'), resolve(dest, 'compose'), { recursive: true })
console.log('Copied docker compose profiles to', dest)

