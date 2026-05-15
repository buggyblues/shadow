import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-web' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_WEB_BASE_URL ?? 'http://127.0.0.1:3000/app/',
    trace: 'on-first-retry',
    viewport: { width: 1600, height: 1000 },
  },
  outputDir: 'test-results/web',
})
