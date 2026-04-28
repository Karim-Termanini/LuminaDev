import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const sharedRoot = resolve(__dirname, '../../packages/shared/src/index.ts')

export default defineConfig({
  main: {
    resolve: {
      alias: { '@linux-dev-home/shared': sharedRoot },
    },
    // Bundle workspace package so Electron main does not load compiled dist/ at runtime
    // (avoids ERR_MODULE_NOT_FOUND when dist/ is missing / stale incremental tsbuildinfo).
    plugins: [externalizeDepsPlugin({ exclude: ['@linux-dev-home/shared'] })],
  },
  preload: {
    resolve: {
      alias: { '@linux-dev-home/shared': sharedRoot },
    },
    plugins: [externalizeDepsPlugin({ exclude: ['@linux-dev-home/shared'] })],
  },
  renderer: {
    resolve: {
      alias: {
        '@linux-dev-home/shared': sharedRoot,
      },
    },
    plugins: [react()],
  },
})
