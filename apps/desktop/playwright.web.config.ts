import { defineConfig } from '@playwright/test'

function positiveNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const screenshotViewport = { width: 1600, height: 1000 }
const deviceScaleFactor = positiveNumber(
  process.env.PLAYWRIGHT_WEB_DEVICE_SCALE_FACTOR ?? process.env.E2E_SCREENSHOT_DEVICE_SCALE_FACTOR,
  2,
)

export default defineConfig({
  testDir: './e2e/05_web',
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-web' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_WEB_BASE_URL ?? 'http://127.0.0.1:3000/app/',
    trace: 'on-first-retry',
    viewport: screenshotViewport,
    deviceScaleFactor,
  },
  outputDir: 'test-results/web',
})
