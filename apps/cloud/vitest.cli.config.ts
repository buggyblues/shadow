/**
 * Vitest config for CLI integration tests.
 *
 * Tests the shadowob-cloud CLI commands against real template files,
 * without requiring Kubernetes, Docker, or any external services.
 *
 * What is tested:
 *   - `shadowob-cloud validate` on every template (schema + config validation)
 *   - `shadowob-cloud generate manifests` on every template (full manifest build pipeline)
 *
 * Usage:
 *   pnpm test:e2e:cli
 *
 * Prerequisites:
 *   pnpm build  (dist/index.js must exist)
 */

import UnpluginTypia from '@typia/unplugin/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [UnpluginTypia({ cache: false })],
  test: {
    globals: true,
    environment: 'node',
    include: ['e2e/cli/validate-all-templates.test.ts', 'e2e/cli/generate-manifests.test.ts'],

    // No global setup needed — these tests start their own processes
    globalSetup: undefined,
    globalTeardown: undefined,

    // Tests are independent and can run in parallel
    sequence: {
      concurrent: true,
    },

    // Each test spawns a child process — allow up to 30s per template
    testTimeout: 60_000,
    hookTimeout: 90_000,
  },
})
