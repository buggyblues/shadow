import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config for the Cloud Console E2E tests.
 *
 * Prerequisites before running:
 *   1. Build the cloud CLI:    cd apps/cloud && pnpm build
 *   2. Build the console:      cd apps/cloud && pnpm console:build
 *
 * Usage:
 *   cd apps/cloud && pnpm test:e2e:console
 *   cd apps/cloud && pnpm test:e2e:console:ui   (interactive mode)
 *
 * The tests start their own `xcloud serve` instance on port 4749
 * and serve the built console via rsbuild preview on port 4750.
 */

// Shadow-cloud serve port (API + SPA on same origin)
export const SERVE_PORT = 4749

export default defineConfig({
  testDir: './e2e/console',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://localhost:${SERVE_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    locale: 'en-US',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  outputDir: 'test-results',

  // Global setup: build and start serve + preview before all tests
  globalSetup: './e2e/console/global-setup.ts',
  globalTeardown: './e2e/console/global-teardown.ts',
})
