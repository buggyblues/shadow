import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '04_visual/02_device_showcase.spec.ts',
  timeout: 60_000,
  use: {
    viewport: { width: 1420, height: 900 },
  },
  outputDir: 'test-results/showcase',
})
