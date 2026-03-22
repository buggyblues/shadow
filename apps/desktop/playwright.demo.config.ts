import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '04_visual/03_demo_flow.spec.ts',
  timeout: 180_000,
  use: {
    baseURL: process.env.E2E_ORIGIN ?? 'http://127.0.0.1:3000/app/',
    viewport: { width: 1420, height: 900 },
    colorScheme: 'dark',
  },
  outputDir: 'test-results/demo-flow',
})
