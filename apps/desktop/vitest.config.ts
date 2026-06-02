import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/renderer/src/pages/**/*.{ts,tsx}',
        'src/renderer/src/lib/**/*.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
      ],
      // No global thresholds: full pages/* is for visibility. Contract/error
      // modules are enforced via pnpm test:roundtrip + dedicated unit tests.
    },
  },
})
