import { expect, test } from '@playwright/test'

test.describe('Landing Page (EN)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en/')
  })

  test('hero section loads with correct branding', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Super Community')
    await expect(page.locator('text=Connect you and your AI Buddies')).toBeVisible()
  })

  test('primary CTA links to app', async ({ page }) => {
    const launchBtn = page.locator('a:has-text("Launch")').first()
    await expect(launchBtn).toHaveAttribute('href', /\/app/)
  })

  test('secondary CTA links to guide', async ({ page }) => {
    const guideBtn = page.locator('a:has-text("Getting Started Guide")').first()
    await expect(guideBtn).toHaveAttribute('href', /\/guide/)
  })

  test('value cards display 3 brand values', async ({ page }) => {
    await expect(page.locator('text=Buddy is a First-Class Citizen')).toBeVisible()
    await expect(page.locator('text=Business System for Super Individuals')).toBeVisible()
    await expect(page.locator('text=Work + Play')).toBeVisible()
  })

  test('pricing section shows correct tiers', async ({ page }) => {
    await expect(page.locator('text=Community').first()).toBeVisible()
    await expect(page.locator('text=Home').first()).toBeVisible()
    await expect(page.locator('text=Team').first()).toBeVisible()
    // Enterprise should NOT exist
    await expect(page.locator('h3:has-text("Enterprise")')).toHaveCount(0)
  })

  test('user persona section exists', async ({ page }) => {
    await expect(page.locator('text=Who Is Shadow For?')).toBeVisible()
  })

  test('platform comparison table exists', async ({ page }) => {
    await expect(page.locator('text=Why Shadow?')).toBeVisible()
  })
})

test.describe('Landing Page (ZH)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/zh/')
  })

  test('hero section loads with Chinese branding', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('超级社区')
    await expect(page.locator('text=连接你和 AI Buddy')).toBeVisible()
  })

  test('value cards display Chinese brand values', async ({ page }) => {
    await expect(page.locator('text=Buddy 是一等公民')).toBeVisible()
    await expect(page.locator('text=超级个体的商业系统')).toBeVisible()
    await expect(page.locator('text=工作 + 玩耍')).toBeVisible()
  })

  test('pricing section shows correct Chinese tiers', async ({ page }) => {
    await expect(page.locator('text=社区版').first()).toBeVisible()
    await expect(page.locator('text=家庭版').first()).toBeVisible()
    await expect(page.locator('text=团队版').first()).toBeVisible()
    // 企业版 should NOT exist
    await expect(page.locator('h3:has-text("企业版")')).toHaveCount(0)
  })
})

test.describe('Guide Page', () => {
  test('EN guide page loads with 3 paths', async ({ page }) => {
    await page.goto('/en/guide/')
    await expect(page.locator('h1')).toContainText('Getting Started')
    await expect(page.locator('text=Create My Own AI Buddy')).toBeVisible()
    await expect(page.locator("text=Try Others' Buddies First")).toBeVisible()
    await expect(page.locator('text=Create a Community First')).toBeVisible()
  })

  test('ZH guide page loads with 3 paths', async ({ page }) => {
    await page.goto('/zh/guide/')
    await expect(page.locator('h1')).toContainText('玩法指南')
    await expect(page.locator('text=创建自己的 AI Buddy')).toBeVisible()
    await expect(page.locator('text=先试试别人的 Buddy')).toBeVisible()
    await expect(page.locator('text=先创建一个社区')).toBeVisible()
  })
})

test.describe('Shrimp Coins Page', () => {
  test('EN shrimp coins page loads', async ({ page }) => {
    await page.goto('/en/guide/shrimp-coins')
    await expect(page.locator('h1')).toContainText('Shrimp Coins')
    await expect(page.locator('text=How to Earn')).toBeVisible()
    await expect(page.locator('text=How to Spend')).toBeVisible()
  })

  test('ZH shrimp coins page loads', async ({ page }) => {
    await page.goto('/zh/guide/shrimp-coins')
    await expect(page.locator('h1')).toContainText('虾币')
    await expect(page.locator('text=如何赚取')).toBeVisible()
    await expect(page.locator('text=如何消费')).toBeVisible()
  })
})

test.describe('Pricing Page', () => {
  test('EN pricing shows correct tiers', async ({ page }) => {
    await page.goto('/en/pricing')
    await expect(page.locator('h1')).toContainText('Pricing')
    // Should have Community/Home/Team, NOT Enterprise
    await expect(page.locator('h3:has-text("Community")')).toBeVisible()
    await expect(page.locator('h3:has-text("Home")')).toBeVisible()
    await expect(page.locator('h3:has-text("Team")')).toBeVisible()
    await expect(page.locator('h3:has-text("Enterprise")')).toHaveCount(0)
  })

  test('ZH pricing shows correct tiers', async ({ page }) => {
    await page.goto('/zh/pricing')
    await expect(page.locator('h1')).toContainText('定价')
    await expect(page.locator('h3:has-text("社区版")')).toBeVisible()
    await expect(page.locator('h3:has-text("家庭版")')).toBeVisible()
    await expect(page.locator('h3:has-text("团队版")')).toBeVisible()
    await expect(page.locator('h3:has-text("企业版")')).toHaveCount(0)
  })
})

test.describe('Navigation', () => {
  test('EN nav contains all expected links', async ({ page }) => {
    await page.goto('/en/')
    const nav = page.locator('nav')
    await expect(nav.locator('a:has-text("Buddy")')).toBeVisible()
    await expect(nav.locator('a:has-text("Guide")')).toBeVisible()
    await expect(nav.locator('a:has-text("Docs")')).toBeVisible()
    await expect(nav.locator('a:has-text("API")')).toBeVisible()
    await expect(nav.locator('a:has-text("Download")')).toBeVisible()
  })

  test('ZH nav contains all expected links', async ({ page }) => {
    await page.goto('/zh/')
    const nav = page.locator('nav')
    await expect(nav.locator('a:has-text("Buddy")')).toBeVisible()
    await expect(nav.locator('a:has-text("玩法指南")')).toBeVisible()
    await expect(nav.locator('a:has-text("下载")')).toBeVisible()
  })

  test('nav links point to correct paths', async ({ page }) => {
    await page.goto('/en/')
    await expect(page.locator('nav a:has-text("Guide")')).toHaveAttribute('href', /\/guide\//)
    await expect(page.locator('nav a:has-text("Buddy")')).toHaveAttribute('href', /\/buddy/)
    await expect(page.locator('nav a:has-text("Download")')).toHaveAttribute('href', /\/download/)
  })
})

test.describe('Footer', () => {
  test('EN footer has rich link groups', async ({ page }) => {
    await page.goto('/en/')
    const footer = page.locator('footer')
    await expect(footer.locator('h4:has-text("Product")')).toBeVisible()
    await expect(footer.locator('h4:has-text("Resources")')).toBeVisible()
    await expect(footer.locator('h4:has-text("Community")')).toBeVisible()
    await expect(footer.locator('h4:has-text("Legal")')).toBeVisible()
  })

  test('ZH footer has rich link groups', async ({ page }) => {
    await page.goto('/zh/')
    const footer = page.locator('footer')
    await expect(footer.locator('h4:has-text("产品")')).toBeVisible()
    await expect(footer.locator('h4:has-text("资源")')).toBeVisible()
    await expect(footer.locator('h4:has-text("社区")')).toBeVisible()
    await expect(footer.locator('h4:has-text("法律")')).toBeVisible()
  })

  test('footer links are valid', async ({ page }) => {
    await page.goto('/en/')
    const footerLinks = page.locator('footer a[href]')
    const count = await footerLinks.count()
    expect(count).toBeGreaterThan(10) // Should have many footer links
  })
})

test.describe('Language Switching', () => {
  test('can switch from EN to ZH', async ({ page }) => {
    await page.goto('/en/')
    // Find language switcher button
    const langBtn = page.locator('button:has-text("EN")')
    if (await langBtn.isVisible()) {
      await langBtn.click()
      const zhLink = page.locator('a:has-text("中文")')
      await expect(zhLink).toBeVisible()
    }
  })
})

test.describe('Landing Flow Integrity', () => {
  test('EN: landing → guide flow works', async ({ page }) => {
    await page.goto('/en/')
    // Click the secondary CTA to go to guide
    const guideLink = page.locator('a:has-text("Getting Started Guide")').first()
    await guideLink.click()
    await expect(page).toHaveURL(/\/guide\//)
    await expect(page.locator('h1')).toContainText('Getting Started')
  })

  test('EN: guide → buddy flow works', async ({ page }) => {
    await page.goto('/en/guide/')
    const marketBtn = page.locator('a:has-text("Explore Buddy Market")')
    await expect(marketBtn).toHaveAttribute('href', /\/buddy/)
  })

  test('EN: guide → download flow works', async ({ page }) => {
    await page.goto('/en/guide/')
    const downloadBtn = page.locator('a:has-text("Download Shadow Desktop")')
    await expect(downloadBtn).toHaveAttribute('href', /\/download/)
  })

  test('EN: landing → buddy flow works', async ({ page }) => {
    await page.goto('/en/')
    const buddyNav = page.locator('nav a:has-text("Buddy")')
    await buddyNav.click()
    await expect(page).toHaveURL(/\/buddy/)
  })

  test('EN: landing → download flow works', async ({ page }) => {
    await page.goto('/en/')
    const downloadNav = page.locator('nav a:has-text("Download")')
    await downloadNav.click()
    await expect(page).toHaveURL(/\/download/)
  })
})
