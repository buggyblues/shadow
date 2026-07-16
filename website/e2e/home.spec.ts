import { expect, test } from '@playwright/test'

test('Chinese homepage keeps the original hero and community showcase', async ({ page }) => {
  await page.goto('/zh/')

  await expect(page.locator('h1.home-typing-slogan')).toBeVisible()
  await expect(page.getByRole('link', { name: '发现空间' })).toBeVisible()
  await expect(
    page.getByRole('heading', { level: 2, name: '看看社区里正在发生什么' }),
  ).toBeVisible()
  await expect(page.locator('.home-community-showcase-shot')).toHaveCount(3)
})

test('mobile navigation exposes product and developer entry points', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/zh/')

  await page.getByRole('button', { name: '打开导航' }).click()
  await expect(page.locator('#shadow-home-mobile-menu a[href="/zh/spaces.html"]')).toBeVisible()
  await expect(page.getByRole('link', { name: '开发者概览' })).toBeVisible()
})

test('community discovery is available in both languages', async ({ page }) => {
  await page.goto('/spaces.html')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Discover a community to join' }),
  ).toBeVisible()

  await page.goto('/zh/spaces.html')
  await expect(page.getByRole('heading', { level: 1, name: '发现可以加入的社区' })).toBeVisible()
})
