/**
 * Playwright E2E: Main Deploy Flow (Store → Wizard → Deploy)
 *
 * Covers the critical user journey:
 *   1. Visit Agent Store page → see template list
 *   2. Click a template → see template detail page
 *   3. Click Deploy → enter Deploy Wizard
 *   4. Step 1: Review template → Continue
 *   5. Step 2: Configure namespace → Continue
 *   6. Step 3: Review & Deploy → Click "Start Deployment" → observe SSE logs → success/failure
 *
 * This test exercises the fixed deploy flow where the template JSON from
 * POST /api/init is used directly — the previous bug was calling GET /api/config
 * after init, which returned 404 because init didn't persist to disk.
 */

import { expect, test } from '@playwright/test'
import { SERVE_PORT } from '../../playwright.config.js'

const BASE = `http://localhost:${SERVE_PORT}`

/** Seed required env vars so deploy wizard Step 2 validation passes. */
async function seedRequiredEnvVars() {
  for (const key of ['OPENAI_API_KEY', 'DEEPSEEK_API_KEY']) {
    await fetch(`${BASE}/api/env/global`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: `e2e-stub-${key}`, isSecret: true }),
    })
  }
}

// ── Store → Template List ─────────────────────────────────────────────────────

test.describe('Main Deploy Flow', () => {
  // Seed env vars once before this describe block so Step 2 validation passes
  test.beforeAll(async () => {
    await seedRequiredEnvVars()
  })
  test('Store page lists templates', async ({ page }) => {
    await page.goto(`${BASE}/store`)
    await expect(page.getByRole('heading', { name: 'Deploy AI Agent Teams' })).toBeVisible()

    // Templates should load from GET /api/templates
    await expect(page.locator('[data-testid="template-card"], .group')).not.toHaveCount(0, {
      timeout: 10_000,
    })
  })

  test('Template detail page shows info', async ({ page }) => {
    await page.goto(`${BASE}/store`)
    await expect(page.getByRole('heading', { name: 'Deploy AI Agent Teams' })).toBeVisible()

    // Click on the first template card
    const firstCard = page.locator('a[href*="/store/"]').first()
    await expect(firstCard).toBeVisible({ timeout: 10_000 })
    await firstCard.click()

    // Should navigate to detail page
    await expect(page).toHaveURL(/\/store\/[^/]+$/)
    await expect(page.getByRole('link', { name: 'Deploy Template' })).toBeVisible()
  })

  test('Deploy Wizard Step 1 — template overview', async ({ page }) => {
    // Navigate directly to a deploy wizard page
    await page.goto(`${BASE}/store/shadowob-cloud/deploy`)

    // Step 1: Review Template
    await expect(page.getByText('Review Template')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('heading', { name: 'shadowob-cloud' })).toBeVisible()

    // Click Continue
    await page.getByRole('button', { name: 'Continue' }).click()

    // Step 2: Configure should appear
    await expect(page.getByText('Configure Deployment')).toBeVisible()
  })

  test('Deploy Wizard Step 2 — configure namespace', async ({ page }) => {
    await page.goto(`${BASE}/store/shadowob-cloud/deploy`)
    await expect(page.getByText('Review Template')).toBeVisible({ timeout: 10_000 })

    // Step 1 → Step 2
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('Configure Deployment')).toBeVisible()

    // Namespace input
    const nsInput = page.locator('#namespace')
    await expect(nsInput).toBeVisible()
    await nsInput.fill('test-namespace')

    // Wait for saved env vars to auto-populate (shows "Using saved" indicators)
    await expect(page.getByText(/Using saved/i).first()).toBeVisible({ timeout: 10_000 })

    // Step 2 → Step 3 (Review & Deploy)
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('Review & Deploy')).toBeVisible()
  })

  test('Deploy Wizard Step 3 — review and deploy', async ({ page }) => {
    await page.goto(`${BASE}/store/shadowob-cloud/deploy`)
    await expect(page.getByText('Review Template')).toBeVisible({ timeout: 10_000 })

    // Navigate through all steps (wait for saved env vars in Step 2)
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText(/Using saved/i).first()).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('Review & Deploy')).toBeVisible()

    // Review summary items should be visible
    await expect(page.getByText('shadowob-cloud').first()).toBeVisible()

    // Start Deployment button should be present
    await expect(page.getByRole('button', { name: /Start Deployment/i })).toBeVisible()
  })

  test('Deploy Wizard — full flow deploys and shows logs', async ({ page }) => {
    await page.goto(`${BASE}/store/shadowob-cloud/deploy`)
    await expect(page.getByText('Review Template')).toBeVisible({ timeout: 10_000 })

    // Navigate through all steps (wait for saved env vars in Step 2)
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText(/Using saved/i).first()).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'Continue' }).click()

    // Click "Start Deployment"
    await page.getByRole('button', { name: /Start Deployment/i }).click()

    // Should show deploying state
    await expect(page.getByRole('heading', { name: 'Deploying...' })).toBeVisible({
      timeout: 10_000,
    })

    // Verify SSE log streaming is working (log lines appear)
    await expect(page.getByText(/log lines? received/i)).toBeVisible({ timeout: 15_000 })
  })
})

// ── Secrets Page ──────────────────────────────────────────────────────────────

test.describe('Secrets Management', () => {
  test('Secrets page loads and shows sections with group tabs', async ({ page }) => {
    await page.goto(`${BASE}/secrets`)
    await expect(page.getByRole('heading', { name: 'Secrets & Environment' })).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByRole('heading', { name: /Provider Secrets/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Environment Variables/i })).toBeVisible()

    // Group tab should be visible (at least "default")
    await expect(page.getByRole('button', { name: 'default' })).toBeVisible()
  })
})

// ── My Templates ──────────────────────────────────────────────────────────────

test.describe('My Templates', () => {
  test('My Templates page loads and shows fork button', async ({ page }) => {
    await page.goto(`${BASE}/my-templates`)
    await expect(page.getByRole('heading', { name: 'My Templates' })).toBeVisible({
      timeout: 10_000,
    })

    // Fork button should be visible (header or empty state)
    await expect(page.getByRole('button', { name: /Fork/i }).first()).toBeVisible()
  })
})

// ── Config Editor (via My Templates Edit) ─────────────────────────────────────

test.describe('Config Editor', () => {
  // Ensure a forked template exists
  test.beforeAll(async () => {
    await fetch(`${BASE}/api/my-templates/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'shadowob-cloud', name: 'e2e-editor-test' }),
    })
  })

  test('Config editor page loads with Monaco editor', async ({ page }) => {
    // Navigate to the template detail page directly
    await page.goto(`${BASE}/my-templates/e2e-editor-test`)
    await expect(page.getByRole('heading', { name: 'e2e-editor-test' })).toBeVisible({
      timeout: 10_000,
    })

    // Click on the Editor tab
    await page.getByRole('button', { name: /Editor/i }).click()

    // Monaco editor loads (look for the Monaco container)
    await expect(page.getByRole('code')).toBeVisible({
      timeout: 15_000,
    })
  })

  test('Config editor can load a store template', async ({ page }) => {
    await page.goto(`${BASE}/my-templates/e2e-editor-test`)
    await expect(page.getByRole('heading', { name: 'e2e-editor-test' })).toBeVisible({
      timeout: 10_000,
    })

    // Click on the Editor tab
    await page.getByRole('button', { name: /Editor/i }).click()

    // Valid JSON indicator should appear (forked template has valid content)
    await expect(page.getByText('Valid JSON')).toBeVisible({ timeout: 10_000 })
  })
})

// ── Overview Page (no OnboardingGuide) ────────────────────────────────────────

test.describe('Overview Page', () => {
  test('Overview page loads without onboarding guide', async ({ page }) => {
    await page.goto(`${BASE}/`)
    await expect(page.getByText('Shadow Cloud Console')).toBeVisible({ timeout: 10_000 })

    // OnboardingGuide should NOT be present
    await expect(page.getByText('Welcome to Shadow Cloud')).not.toBeVisible()

    // Quick Actions should be visible
    await expect(page.getByText('Quick Actions')).toBeVisible()
  })
})
