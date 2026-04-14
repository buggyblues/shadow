/**
 * Vitest config for E2E tests.
 *
 * Runs against live infrastructure:
 * - Shadow server: auto-started via docker-compose (postgres + redis + minio + server)
 * - Kubernetes: Rancher Desktop (rancher-desktop context)
 *
 * Usage:
 *   pnpm test:e2e
 */

import UnpluginTypia from '@typia/unplugin/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [UnpluginTypia({ cache: false })],
  test: {
    globals: true,
    environment: 'node',
    include: ['e2e/cli/**/*.test.ts'],

    // Global setup starts docker-compose and seeds Shadow server
    globalSetup: 'e2e/cli/global-setup.ts',
    globalTeardown: 'e2e/cli/global-teardown.ts',

    // E2E_ORIGIN points directly to Shadow server API (no web proxy needed)
    env: {
      E2E_ORIGIN: 'http://localhost:3002',
      E2E_NAMESPACE: 'shadowob-cloud-e2e',
    },

    // Tests run sequentially — they share cluster state and K8s namespace
    sequence: {
      concurrent: false,
    },

    // Long timeouts (docker-compose startup, Pulumi deploy, pod scheduling)
    testTimeout: 300_000, // 5 minutes per test
    hookTimeout: 600_000, // 10 minutes for beforeAll (docker-compose + build)
  },
})
