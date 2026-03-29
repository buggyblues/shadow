import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'

type Session = {
  origin: string
  appBaseUrl: string
  owner: { email: string; password: string; displayName: string }
  viewer: { email: string; password: string; displayName: string }
  server: { id: string; slug: string; name: string; inviteCode: string }
  channels: { generalId: string; announcementsId: string }
}

const repoRoot = process.cwd().endsWith(path.join('apps', 'desktop'))
  ? path.resolve(process.cwd(), '../..')
  : process.cwd()
const sessionPath = process.env.E2E_SESSION_PATH
  ? path.resolve(process.env.E2E_SESSION_PATH)
  : path.resolve(repoRoot, 'docs/e2e/session.json')
const screenshotDir = process.env.E2E_SCREENSHOT_DIR
  ? path.resolve(process.env.E2E_SCREENSHOT_DIR)
  : path.resolve(repoRoot, 'docs/e2e/screenshots')

async function readSession(): Promise<Session> {
  const raw = await fs.readFile(sessionPath, 'utf8')
  return JSON.parse(raw) as Session
}

async function ensureScreenshotDir() {
  await fs.mkdir(screenshotDir, { recursive: true })
}

async function loginViaUi(page: import('@playwright/test').Page, user: Session['owner']) {
  await page.goto('login')
  await page.locator('input[autocomplete="username"]').fill(user.email)
  await page.locator('input[autocomplete="current-password"]').fill(user.password)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL(/\/app\/settings/)
}

async function screenshot(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({
    path: path.join(screenshotDir, name),
    fullPage: false,
  })
}

/** Login via API and return JWT token */
async function apiLogin(origin: string, email: string, password: string) {
  const res = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`Login failed: ${res.status}`)
  return (await res.json()) as { accessToken: string }
}

/** Make an API request with JWT auth */
async function apiRequest<T = unknown>(
  origin: string,
  urlPath: string,
  opts: { method?: string; token: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${origin}${urlPath}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.token}`,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

test.describe.serial('OAuth Developer Settings — UI', () => {
  test('creates, inspects, and deletes an OAuth app from developer settings', async ({
    browser,
  }) => {
    await ensureScreenshotDir()
    const session = await readSession()

    const ctx = await browser.newContext()
    const page = await ctx.newPage()

    // Login as the owner
    await loginViaUi(page, session.owner)

    // Navigate to developer settings tab
    await page.goto('settings')
    await page.waitForURL(/\/app\/settings/)
    const devTab = page.getByText('开发者', { exact: true }).first()
    await devTab.click()
    await page.waitForTimeout(500)

    // Verify the developer settings page renders
    await expect(page.getByText('开发者设置')).toBeVisible()
    await screenshot(page, '20-oauth-developer-empty.png')

    // --- Create an OAuth app ---
    await page.getByText('创建应用').click()
    await page.waitForTimeout(300)

    // Fill out the form
    const nameInput = page.locator('input[placeholder="My App"]')
    await nameInput.fill('E2E Test OAuth App')

    const descInput = page.locator('input[placeholder="简要描述你的应用"]')
    await descInput.fill('Created by Playwright E2E')

    const redirectInput = page.locator('input[placeholder="https://your-app.com/callback"]')
    await redirectInput.fill('https://e2e-test.shadowob.com/callback')

    await screenshot(page, '21-oauth-create-form.png')

    // Submit the form
    const submitBtn = page.getByRole('button', { name: /创建应用/ })
    await submitBtn.click()

    // Wait for the secret banner to appear
    await expect(page.getByText('Client Secret（仅显示一次）')).toBeVisible({ timeout: 10_000 })
    await screenshot(page, '22-oauth-app-created-secret.png')

    // Dismiss the secret banner
    await page.getByText('我已保存，关闭提示').click()
    await page.waitForTimeout(300)

    // Verify the app card appears with the correct name
    await expect(page.getByText('E2E Test OAuth App')).toBeVisible()
    await expect(page.getByText('Created by Playwright E2E')).toBeVisible()

    // Verify Client ID is visible
    const clientIdEl = page.locator('code').filter({ hasText: /^shadow_/ })
    await expect(clientIdEl).toBeVisible()
    await screenshot(page, '23-oauth-app-card.png')

    // --- Reset secret ---
    const resetBtn = page.locator('button[title="重置 Secret"]')
    await resetBtn.click()
    await expect(page.getByText('Client Secret（仅显示一次）')).toBeVisible({ timeout: 10_000 })
    await screenshot(page, '24-oauth-secret-reset.png')
    await page.getByText('我已保存，关闭提示').click()

    // --- Delete the app ---
    const deleteBtn = page.locator('button[title="删除应用"]')
    await deleteBtn.click()

    // Confirm deletion
    await expect(page.getByText('确定要删除此应用吗？此操作不可恢复。')).toBeVisible()
    await screenshot(page, '25-oauth-delete-confirm.png')
    await page.getByRole('button', { name: '确认删除' }).click()

    // Verify app is gone
    await page.waitForTimeout(500)
    await expect(page.getByText('E2E Test OAuth App')).not.toBeVisible()
    await expect(page.getByText('暂无 OAuth 应用')).toBeVisible()
    await screenshot(page, '26-oauth-developer-after-delete.png')

    await ctx.close()
  })
})

test.describe.serial('OAuth Authorization Flow — Full E2E', () => {
  test('create app → authorize → redirect with code → exchange token', async ({ browser }) => {
    await ensureScreenshotDir()
    const session = await readSession()

    // Step 1: Get JWT via API login
    const { accessToken } = await apiLogin(
      session.origin,
      session.owner.email,
      session.owner.password,
    )

    // Step 2: Create an OAuth app via API
    const CALLBACK_URL = 'https://oauth-e2e-demo.example.com/callback'
    const app = await apiRequest<{
      id: string
      clientId: string
      clientSecret: string
      name: string
    }>(session.origin, '/api/oauth/apps', {
      method: 'POST',
      token: accessToken,
      body: {
        name: 'OAuth Flow Demo App',
        description: 'Demonstrates the full OAuth authorization flow',
        redirectUris: [CALLBACK_URL],
        homepageUrl: 'https://oauth-e2e-demo.example.com',
      },
    })

    try {
      // Step 3: Login via UI so the browser has a session cookie
      const ctx = await browser.newContext()
      const page = await ctx.newPage()
      await loginViaUi(page, session.owner)

      // Step 4: Intercept the callback redirect to capture the auth code
      let capturedCode = ''
      await page.route('**/oauth-e2e-demo.example.com/**', async (route) => {
        const url = new URL(route.request().url())
        capturedCode = url.searchParams.get('code') ?? ''
        const state = url.searchParams.get('state') ?? ''
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: `<html><body style="background:#1e1e2e;color:#cdd6f4;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh">
            <div style="text-align:center;max-width:480px">
              <div style="font-size:48px;margin-bottom:16px">✅</div>
              <h1 style="font-size:24px;margin-bottom:8px">Authorization Successful</h1>
              <p style="color:#a6adc8;margin-bottom:24px">The app has been authorized. Auth code received.</p>
              <div style="background:#313244;padding:16px;border-radius:8px;text-align:left;font-size:13px">
                <p><strong>code:</strong> <code>${capturedCode.slice(0, 8)}...${capturedCode.slice(-8)}</code></p>
                <p><strong>state:</strong> <code>${state}</code></p>
              </div>
            </div>
          </body></html>`,
        })
      })

      // Step 5: Navigate to the OAuth authorize page
      const scopes = 'user:read user:email servers:read servers:write channels:read channels:write'
      const authorizeUrl = `oauth/authorize?response_type=code&client_id=${encodeURIComponent(app.clientId)}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&scope=${encodeURIComponent(scopes)}&state=e2e_flow_test`

      await page.goto(authorizeUrl)
      await page.waitForTimeout(1000)

      // Step 6: Screenshot the authorization consent page
      await expect(page.getByText('授权应用')).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText('OAuth Flow Demo App')).toBeVisible()
      await expect(page.getByText('该应用请求以下权限：')).toBeVisible()
      await screenshot(page, '27-oauth-authorize-consent.png')

      // Step 7: Click Authorize → triggers redirect to callback URL
      await page.getByRole('button', { name: '授权' }).click()
      await page.waitForURL(/oauth-e2e-demo\.example\.com\/callback/, { timeout: 15_000 })
      await page.waitForTimeout(500)
      await screenshot(page, '28-oauth-authorize-redirect-success.png')

      // Step 8: Verify the auth code was captured
      expect(capturedCode).toBeTruthy()
      expect(capturedCode.length).toBeGreaterThan(20)

      // Step 9: Exchange the code for an access token
      const tokenRes = await fetch(`${session.origin}/api/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code: capturedCode,
          client_id: app.clientId,
          client_secret: app.clientSecret,
          redirect_uri: CALLBACK_URL,
        }),
      })
      expect(tokenRes.ok).toBeTruthy()
      const tokenData = (await tokenRes.json()) as {
        access_token: string
        token_type: string
        expires_in: number
        refresh_token: string
        scope: string
      }
      expect(tokenData.access_token).toBeTruthy()
      expect(tokenData.token_type).toBe('Bearer')
      expect(tokenData.refresh_token).toBeTruthy()
      expect(tokenData.scope).toBe(scopes)

      // Step 10: Verify the token works — call userinfo
      const userinfoRes = await fetch(`${session.origin}/api/oauth/userinfo`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
      expect(userinfoRes.ok).toBeTruthy()
      const userinfo = (await userinfoRes.json()) as { username: string; email: string }
      expect(userinfo.username).toBeTruthy()
      expect(userinfo.email).toBe(session.owner.email)

      await ctx.close()
    } finally {
      // Cleanup: delete the OAuth app
      await apiRequest(session.origin, `/api/oauth/apps/${app.id}`, {
        method: 'DELETE',
        token: accessToken,
      })
    }
  })
})
