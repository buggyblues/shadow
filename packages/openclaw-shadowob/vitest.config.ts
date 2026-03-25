import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.{test,spec}.ts'],
    exclude: ['__tests__/e2e/**'],
    alias: {
      'openclaw/plugin-sdk/core': resolve(__dirname, '__tests__/__mocks__/openclaw-sdk-core.ts'),
      'openclaw/plugin-sdk/runtime-store': resolve(
        __dirname,
        '__tests__/__mocks__/openclaw-sdk-runtime-store.ts',
      ),
      'openclaw/plugin-sdk/plugin-entry': resolve(
        __dirname,
        '__tests__/__mocks__/openclaw-sdk-plugin-entry.ts',
      ),
    },
  },
})
