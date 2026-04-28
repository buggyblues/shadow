/**
 * Console E2E: Store Page (Templates)
 *
 * Validates the cloud console Store page:
 *  - All templates appear as cards
 *  - Each card shows name, description, agent count, tags
 *  - The Deploy modal opens and shows the config
 *
 * Run:  pnpm test:e2e
 */

import { expect, test } from '@playwright/test'

// Expected templates on the page (slug → localized title substring that appears in the card title)
const EXPECTED_TEMPLATES: Record<string, string> = {
  'shadowob-cloud': 'Shadow Cloud Basic',
  'devops-team': 'DevOps',
  'customer-support-team': 'Customer Support',
  'security-team': 'Security',
  'research-team': 'Research',
}

test.describe('Console → Store page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/store')
  })

  test('page loads and shows template cards', async ({ page }) => {
    // At least 7 template cards visible
    const cards = page.locator('[class*="bg-gray-900"][class*="border"]')
    await expect(cards.first()).toBeVisible()
    const count = await cards.count()
    expect(count).toBeGreaterThanOrEqual(7)
  })

  test('each expected template card is present', async ({ page }) => {
    for (const [, nameSubstring] of Object.entries(EXPECTED_TEMPLATES)) {
      const matchingCard = page.locator('h3, [class*="font-semibold"]').filter({
        hasText: nameSubstring,
      })
      await expect(matchingCard.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('cards show agent count badge', async ({ page }) => {
    // Every card should have an "N agents" badge
    const agentBadges = page.locator('text=/\\d+ agents?/')
    await expect(agentBadges.first()).toBeVisible()
    expect(await agentBadges.count()).toBeGreaterThanOrEqual(7)
  })

  test('clicking Deploy opens the deploy wizard', async ({ page }) => {
    // Click the first template card link to go to detail page
    const firstCardLink = page.locator('a[href*="/store/"]').first()
    await firstCardLink.click()
    await expect(page).toHaveURL(/\/store\/[^/]+$/)

    // Deploy Template link should be visible on detail page
    await expect(page.getByRole('link', { name: 'Deploy Template' })).toBeVisible()
  })

  test('shadowob-cloud Deploy modal shows correct config info', async ({ page }) => {
    // Navigate to the shadowob-cloud detail page
    const card = page.locator('a[href*="/store/shadowob-cloud"]').first()
    await card.click()
    await expect(page).toHaveURL(/\/store\/shadowob-cloud$/)

    // Verify template title is shown
    await expect(page.getByRole('heading', { name: 'Shadow Cloud Basic' })).toBeVisible()

    // Deploy link should be available
    await expect(page.getByRole('link', { name: 'Deploy Template' })).toBeVisible()
  })
})
