import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  outputDir: 'test-results',
  webServer: {
    command: 'pnpm dev --port 5173',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
