import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const sharedRoot = resolve(__dirname, '../../packages/shared/src/index.ts')

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  plugins: [react()],
  resolve: {
    alias: {
      '@linux-dev-home/shared': sharedRoot,
    },
  },
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: resolve(__dirname, 'out/renderer'),
    emptyOutDir: true,
  },
})
