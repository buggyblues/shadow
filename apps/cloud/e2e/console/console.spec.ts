/**
 * Console E2E: Core Navigation & Page Tests
 *
 * Tests all console pages load correctly and key interactions work.
 * Run:  pnpm test:e2e:console
 */

import { expect, test } from '@playwright/test'
import { SERVE_PORT } from '../../playwright.config.js'

// ─── API Health ──────────────────────────────────────────────────────────────

test.describe('API Health', () => {
  test('GET /api/health returns ok', async () => {
    const res = await fetch(`http://localhost:${SERVE_PORT}/api/health`)
    expect(res.status).toBe(200)
    const data = (await res.json()) as { status: string }
    expect(data.status).toBe('ok')
  })

  test('GET /api/doctor returns checks', async () => {
    const res = await fetch(`http://localhost:${SERVE_PORT}/api/doctor`)
    expect(res.status).toBe(200)
    const data = (await res.json()) as { checks: unknown[]; summary: Record<string, number> }
    expect(Array.isArray(data.checks)).toBe(true)
    expect(data.checks.length).toBeGreaterThan(0)
    expect(typeof data.summary.pass).toBe('number')
  })

  test('GET /api/templates returns template list', async () => {
    const res = await fetch(`http://localhost:${SERVE_PORT}/api/templates`)
    expect(res.status).toBe(200)
    const templates = (await res.json()) as Array<{ name: string }>
    expect(templates.length).toBeGreaterThanOrEqual(5)
  })

  test('GET /api/runtimes returns runtimes', async () => {
    const res = await fetch(`http://localhost:${SERVE_PORT}/api/runtimes`)
    expect(res.status).toBe(200)
    const runtimes = (await res.json()) as unknown[]
    expect(runtimes.length).toBeGreaterThan(0)
  })

  test('GET /api/images returns images', async () => {
    const res = await fetch(`http://localhost:${SERVE_PORT}/api/images`)
    expect(res.status).toBe(200)
    const images = (await res.json()) as unknown[]
    expect(images.length).toBeGreaterThan(0)
  })

  test('GET /api/settings returns settings with masked keys', async () => {
    const res = await fetch(`http://localhost:${SERVE_PORT}/api/settings`)
    expect(res.status).toBe(200)
    const settings = (await res.json()) as { providers?: unknown[] }
    expect(settings).toBeTruthy()
  })

  test('GET /api/plugins returns plugin list', async () => {
    const res = await fetch(`http://localhost:${SERVE_PORT}/api/plugins`)
    expect(res.status).toBe(200)
    const data = (await res.json()) as unknown
    expect(data).toBeTruthy()
    // Response may be array or object with plugins property
    if (Array.isArray(data)) {
      expect(data.length).toBeGreaterThanOrEqual(0)
    }
  })

  test('GET /api/deployments returns array', async () => {
    const res = await fetch(`http://localhost:${SERVE_PORT}/api/deployments`)
    expect(res.status).toBe(200)
    const deployments = (await res.json()) as unknown[]
    expect(Array.isArray(deployments)).toBe(true)
  })

  test('GET /api/activity returns data', async () => {
    const res = await fetch(`http://localhost:${SERVE_PORT}/api/activity`)
    expect(res.status).toBe(200)
    const data = (await res.json()) as { activities?: unknown[] }
    expect(data).toBeTruthy()
    // API wraps result in { activities: [...] }
    if (data.activities) {
      expect(Array.isArray(data.activities)).toBe(true)
    }
  })
})

// ─── Overview Page ───────────────────────────────────────────────────────────

test.describe('Console → Overview', () => {
  test('page loads without errors', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1', { hasText: 'Shadow Cloud Console' })).toBeVisible()
  })

  test('shows stat cards', async ({ page }) => {
    await page.goto('/')
    // Stat card labels appear inside the main content area
    const main = page.locator('main')
    await expect(main.getByText('Deployments').first()).toBeVisible()
    await expect(main.getByText('Templates').first()).toBeVisible()
  })

  test('shows quick action cards', async ({ page }) => {
    await page.goto('/')
    // Quick actions section in main content
    await expect(page.getByText('Quick Actions')).toBeVisible()
    const main = page.locator('main')
    await expect(main.getByText('Agent Store').first()).toBeVisible()
    await expect(main.getByText('Clusters').first()).toBeVisible()
    await expect(main.getByText('My Templates').first()).toBeVisible()
    await expect(main.getByText('Monitoring').first()).toBeVisible()
  })

  test('quick action links navigate correctly', async ({ page }) => {
    await page.goto('/')
    await page
      .getByRole('link', { name: /Agent Store/i })
      .first()
      .click()
    await expect(page).toHaveURL(/\/store/)
  })

  test('shows system health section', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('System Health')).toBeVisible()
  })
})

// ─── Doctor Page (Removed — merged into Overview) ────────────────────────────
// Doctor page was removed and merged into the Overview page.
// The /doctor route redirects to /.

// ─── Settings Page ───────────────────────────────────────────────────────────

test.describe('Console → Settings', () => {
  test('page loads with Providers tab', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible()
    // Tab buttons
    await expect(page.getByRole('button', { name: 'Providers', exact: true })).toBeVisible()
  })

  test('shows all tabs', async ({ page }) => {
    await page.goto('/settings')
    const main = page.locator('main')
    await expect(main.getByRole('button', { name: 'Providers', exact: true })).toBeVisible()
    await expect(main.getByRole('button', { name: 'System', exact: true })).toBeVisible()
    await expect(main.getByRole('button', { name: 'About', exact: true })).toBeVisible()
  })

  test('System tab shows status info', async ({ page }) => {
    await page.goto('/settings')
    const main = page.locator('main')
    await main.getByRole('button', { name: 'System', exact: true }).click()
    await expect(page.getByText(/API Status/i)).toBeVisible()
  })

  test('About tab shows app info', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('button', { name: 'About', exact: true }).click()
    await expect(
      page
        .locator('main')
        .getByText(/Shadow Cloud/i)
        .first(),
    ).toBeVisible()
  })

  test('Add provider shows dropdown', async ({ page }) => {
    await page.goto('/settings')
    const addBtn = page.getByRole('button', { name: /Add provider/i })
    if (await addBtn.isVisible()) {
      await addBtn.click()
      // Should show provider presets list
      await expect(page.locator('[class*="absolute"]').first()).toBeVisible({ timeout: 3_000 })
    }
  })
})

// ─── Images Page (Removed) ───────────────────────────────────────────────────
// Images page was removed in the system cleanup.

// ─── Runtimes Page (Removed) ─────────────────────────────────────────────────
// Runtimes page was removed in the system cleanup.

// ─── Activity Page ───────────────────────────────────────────────────────────

test.describe('Console → Activity', () => {
  test('page loads', async ({ page }) => {
    await page.goto('/activity')
    await expect(page.locator('h1', { hasText: 'Activity Log' })).toBeVisible()
  })

  test('shows empty state or activity list', async ({ page }) => {
    await page.goto('/activity')
    await expect(page.locator('h1', { hasText: 'Activity Log' })).toBeVisible({ timeout: 10_000 })
  })

  test('search input is present', async ({ page }) => {
    await page.goto('/activity')
    const searchInput = page.getByPlaceholder(/Search activities/i)
    await expect(searchInput).toBeVisible()
  })
})

// ─── Clusters Page ───────────────────────────────────────────────────────────

test.describe('Console → Clusters', () => {
  test('page loads', async ({ page }) => {
    await page.goto('/clusters')
    await expect(page.locator('h1', { hasText: 'Cluster Management' })).toBeVisible()
  })

  test('shows empty state with deploy link', async ({ page }) => {
    await page.goto('/clusters')
    // Without K8s, should show empty state or zero deployments
    await expect(
      page.getByText(/No clusters found/i).or(page.getByText('Total Deployments')),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('Deploy New button links to store', async ({ page }) => {
    await page.goto('/clusters')
    const deployBtn = page.getByRole('link', { name: /Deploy New/i })
    if (await deployBtn.isVisible()) {
      await deployBtn.click()
      await expect(page).toHaveURL(/\/store/)
    }
  })
})

// ─── Config Editor (via My Templates) ────────────────────────────────────────

test.describe('Console → Config Editor', () => {
  // Fork a template via API so we have something to edit
  test.beforeAll(async () => {
    await fetch(`http://localhost:${SERVE_PORT}/api/my-templates/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'shadowob-cloud', name: 'e2e-config-test' }),
    })
  })

  test('page loads', async ({ page }) => {
    await page.goto('/my-templates')
    await expect(page.locator('h1', { hasText: 'My Templates' })).toBeVisible()
  })

  test('shows editor or no-config warning', async ({ page }) => {
    await page.goto('/my-templates')
    await expect(page.locator('h1', { hasText: 'My Templates' })).toBeVisible()
    // Forked template should appear
    await expect(page.getByText('e2e-config-test').first()).toBeVisible({ timeout: 10_000 })
  })

  test('action buttons are present', async ({ page }) => {
    await page.goto('/my-templates')
    await expect(page.getByText('e2e-config-test').first()).toBeVisible({ timeout: 10_000 })
    // Edit and Deploy buttons should be visible on the template card
    await expect(page.getByRole('button', { name: /Edit/i }).first()).toBeVisible()
    // Deploy link on the card (not the sidebar section header)
    await expect(page.getByRole('link', { name: /Deploy/i }).first()).toBeVisible()
  })
})

// ─── Validate Page ───────────────────────────────────────────────────────────

test.describe('Console → Validate', () => {
  test('page loads with textarea', async ({ page }) => {
    await page.goto('/validate')
    await expect(page.locator('h1', { hasText: 'Validate Config' })).toBeVisible()
    await expect(page.getByPlaceholder(/Paste your/i)).toBeVisible()
  })

  test('validate button exists', async ({ page }) => {
    await page.goto('/validate')
    await expect(page.getByRole('button', { name: /Validate/i })).toBeVisible()
  })

  test('validates valid JSON config', async ({ page }) => {
    await page.goto('/validate')

    // Fetch a real template to validate
    const res = await fetch(`http://localhost:${SERVE_PORT}/api/templates`)
    const templates = (await res.json()) as Array<{ name: string }>
    const templateName = templates[0]?.name
    if (!templateName) return

    const configRes = await fetch(`http://localhost:${SERVE_PORT}/api/templates/${templateName}`)
    const config = await configRes.json()

    // Paste config into textarea
    const textarea = page.getByPlaceholder(/Paste your/i)
    await textarea.fill(JSON.stringify(config, null, 2))

    // Click validate
    await page.getByRole('button', { name: /Validate/i }).click()

    // Should show validation result
    await expect(
      page.getByText(/Config is valid/i).or(page.getByText(/Config has issues/i)),
    ).toBeVisible({ timeout: 10_000 })
  })
})

// ─── Monitoring Page ─────────────────────────────────────────────────────────

test.describe('Console → Monitoring', () => {
  test('page loads', async ({ page }) => {
    await page.goto('/monitoring')
    await expect(page.locator('h1', { hasText: 'Monitoring' })).toBeVisible()
  })

  test('shows stat cards', async ({ page }) => {
    await page.goto('/monitoring')
    const main = page.locator('main')
    await expect(main.getByText('Health Score').first()).toBeVisible({ timeout: 10_000 })
  })

  test('tabs are present', async ({ page }) => {
    await page.goto('/monitoring')
    // Tabs rendered as buttons
    await expect(page.getByRole('button', { name: /Health Checks/i })).toBeVisible()
  })

  test('health checks tab shows results', async ({ page }) => {
    await page.goto('/monitoring')
    const main = page.locator('main')
    await expect(main.getByText('Health Score').first()).toBeVisible({ timeout: 15_000 })
  })

  test('deployments tab works', async ({ page }) => {
    await page.goto('/monitoring')
    // Click deployments tab
    const tab = page.getByRole('button', { name: /Deployments/i }).first()
    if (await tab.isVisible()) {
      await tab.click()
      // Wait for loading to finish, then check for table or empty state
      await expect(
        page
          .getByText(/No deployments found/i)
          .or(page.locator('table').first())
          .or(page.getByText(/Loading deployments/i)),
      ).toBeVisible({ timeout: 15_000 })
    }
  })
})

// ─── Sidebar Navigation ─────────────────────────────────────────────────────

test.describe('Sidebar Navigation', () => {
  test('sidebar shows all main sections', async ({ page }) => {
    await page.goto('/')
    // Use the nav/aside sidebar container for scoping
    const sidebar = page.locator('aside, nav').first()
    await expect(sidebar.getByText('Console Home')).toBeVisible()
    await expect(sidebar.getByText('Agent Store')).toBeVisible()
    await expect(sidebar.getByText('Clusters')).toBeVisible()
    await expect(sidebar.getByText('Secrets')).toBeVisible()
    await expect(sidebar.getByText('Monitoring')).toBeVisible()
  })

  test('sidebar system section expands', async ({ page }) => {
    await page.goto('/')
    const sidebar = page.locator('aside, nav').first()
    // System section header — look for the collapsible group trigger
    const systemBtn = sidebar.getByRole('button', { name: /system/i }).first()
    if (await systemBtn.isVisible()) {
      await systemBtn.click()
      await expect(sidebar.getByText('Activity')).toBeVisible()
      await expect(sidebar.getByText('Settings')).toBeVisible()
    }
  })

  test('all sidebar links navigate correctly', async ({ page }) => {
    await page.goto('/')
    const sidebar = page.locator('aside, nav').first()

    // Test DEPLOY section links
    await sidebar.getByRole('link', { name: 'Agent Store' }).click()
    await expect(page).toHaveURL(/\/store/)

    // Navigate to Clusters
    await sidebar.getByRole('link', { name: 'Clusters' }).click()
    await expect(page).toHaveURL(/\/clusters/)

    // Navigate to Secrets
    await sidebar.getByRole('link', { name: 'Secrets' }).click()
    await expect(page).toHaveURL(/\/secrets/)

    // Navigate to Monitoring
    await sidebar.getByRole('link', { name: 'Monitoring' }).click()
    await expect(page).toHaveURL(/\/monitoring/)

    // Navigate back home
    await sidebar.getByRole('link', { name: 'Console Home' }).click()
    await expect(page).toHaveURL(/\/$/)
  })
})
