import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const WEB_BASE = 'http://localhost:3000'
const SERVER_BASE = 'http://localhost:3002'
const SCREENSHOT_DIR = path.resolve(
  '/Users/maopeng/Projects/shadow/.research/shadow-cloud-qa-2026-04-22/screenshots',
)

const adminEmail = 'admin@shadowob.app'
const adminPassword = 'admin123456'
const namespace = `qa-p0-${Date.now()}`
const patName = `qa-p0-${Date.now()}`

await mkdir(SCREENSHOT_DIR, { recursive: true })

async function api(pathname, options = {}) {
  const response = await fetch(`${SERVER_BASE}${pathname}`, options)
  const text = await response.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { response, body }
}

async function poll(fn, { timeoutMs = 300_000, intervalMs = 2_000, label = 'condition' } = {}) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const result = await fn()
    if (result) return result
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function clickFirst(page, selectors) {
  for (const selector of selectors) {
    const locator = selector()
    const count = await locator.count().catch(() => 0)
    if (count > 0) {
      await locator.first().click()
      return true
    }
  }
  return false
}

async function waitForVisibleLocator(
  page,
  selectors,
  { timeoutMs = 15_000, intervalMs = 200, label = 'visible locator' } = {},
) {
  return poll(
    async () => {
      for (const selector of selectors) {
        const locator = selector()
        const count = await locator.count().catch(() => 0)
        if (count === 0) continue

        const first = locator.first()
        const visible = await first.isVisible().catch(() => false)
        if (visible) return first
      }
      return null
    },
    { timeoutMs, intervalMs, label },
  )
}

async function waitForLocatorToDisappear(
  page,
  selectors,
  { timeoutMs = 15_000, intervalMs = 200, label = 'locator to disappear' } = {},
) {
  return poll(
    async () => {
      for (const selector of selectors) {
        const locator = selector()
        const count = await locator.count().catch(() => 0)
        if (count === 0) continue

        const first = locator.first()
        const visible = await first.isVisible().catch(() => false)
        if (visible) return null
      }
      return true
    },
    { timeoutMs, intervalMs, label },
  )
}

async function overrideAndFillEnv(page, key, value) {
  const label = page
    .locator('label')
    .filter({ hasText: new RegExp(`^${escapeRegExp(key)}\\b`) })
    .first()

  if ((await label.count()) === 0) {
    throw new Error(`Env row not found for ${key}`)
  }

  const row = label.locator('xpath=..')

  const overrideButton = row.getByRole('button', { name: /override|覆盖|重写/i })
  if ((await overrideButton.count()) > 0) {
    await overrideButton.first().click()
  }

  const input = row.locator('input').first()
  await input.fill(value)

  const actualValue = await input.inputValue()
  if (actualValue !== value) {
    throw new Error(`Failed to fill ${key}: expected ${value}, got ${actualValue}`)
  }
}

const loginResult = await api('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: adminEmail, password: adminPassword }),
})

if (!loginResult.response.ok || !loginResult.body?.accessToken) {
  throw new Error(
    `Login failed: ${loginResult.response.status} ${JSON.stringify(loginResult.body)}`,
  )
}

const accessToken = loginResult.body.accessToken
const refreshToken = loginResult.body.refreshToken ?? null
const authHeaders = {
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
}

const invalidCreate = await api('/api/cloud-saas/deployments', {
  method: 'POST',
  headers: authHeaders,
  body: JSON.stringify({
    namespace: `${namespace}-invalid`,
    name: `${namespace}-invalid`,
    templateSlug: 'buddy-rental-host',
    resourceTier: 'lightweight',
    configSnapshot: {},
  }),
})

const patResult = await api('/api/tokens', {
  method: 'POST',
  headers: authHeaders,
  body: JSON.stringify({ name: patName, scope: 'user:read', expiresInDays: 1 }),
})

if (!patResult.response.ok || !patResult.body?.token || !patResult.body?.id) {
  throw new Error(
    `PAT creation failed: ${patResult.response.status} ${JSON.stringify(patResult.body)}`,
  )
}

const patId = patResult.body.id
const patToken = patResult.body.token

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
let deploymentId = null
let finalDeployment = null
let destroyStatus = null
let revokeError = null

try {
  await page.goto(WEB_BASE, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ({ token, refresh }) => {
      localStorage.setItem('accessToken', token)
      if (refresh) localStorage.setItem('refreshToken', refresh)
    },
    { token: accessToken, refresh: refreshToken },
  )

  await page.goto(`${WEB_BASE}/app/cloud`, { waitUntil: 'domcontentloaded' })
  await waitForVisibleLocator(
    page,
    [
      () => page.getByRole('button', { name: /deploy template|部署模板/i }),
      () => page.getByRole('link', { name: /deploy template|部署模板/i }),
      () => page.getByRole('link', { name: /Buddy Rental Host/i }),
      () => page.getByText(/Buddy Rental Host/i, { exact: false }),
    ],
    { label: 'cloud console entry point' },
  )
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'p0-verify-01-cloud-root.png'),
    fullPage: true,
  })

  const deployClicked = await clickFirst(page, [
    () => page.getByRole('button', { name: /deploy template|部署模板/i }),
    () => page.getByRole('link', { name: /deploy template|部署模板/i }),
  ])

  if (!deployClicked) {
    await clickFirst(page, [
      () => page.getByRole('link', { name: /Buddy Rental Host/i }),
      () => page.getByText(/Buddy Rental Host/i, { exact: false }),
    ])

    await waitForVisibleLocator(
      page,
      [
        () => page.getByRole('button', { name: /deploy template|部署模板/i }),
        () => page.getByRole('link', { name: /deploy template|部署模板/i }),
      ],
      { label: 'template detail deploy action' },
    )
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'p0-verify-02-template-detail.png'),
      fullPage: true,
    })
  }

  if (!deployClicked) {
    const detailDeployClicked = await clickFirst(page, [
      () => page.getByRole('button', { name: /deploy template|部署模板/i }),
      () => page.getByRole('link', { name: /deploy template|部署模板/i }),
    ])

    if (!detailDeployClicked) {
      throw new Error('Could not open deploy wizard from the store flow')
    }
  }

  await waitForVisibleLocator(page, [() => page.getByRole('button', { name: /continue|继续/i })], {
    label: 'wizard step 1 continue button',
  })
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'p0-verify-03-deploy-step-1.png'),
    fullPage: true,
  })

  await clickFirst(page, [() => page.getByRole('button', { name: /continue|继续/i })])

  await waitForVisibleLocator(page, [() => page.locator('#namespace')], {
    label: 'namespace input',
  })
  const namespaceInput = page.locator('#namespace')
  await namespaceInput.fill(namespace)
  if ((await namespaceInput.inputValue()) !== namespace) {
    throw new Error(`Failed to fill namespace with ${namespace}`)
  }

  await overrideAndFillEnv(page, 'SHADOW_SERVER_URL', 'http://server:3002')
  await overrideAndFillEnv(page, 'SHADOW_USER_TOKEN', patToken)

  if ((await namespaceInput.inputValue()) !== namespace) {
    throw new Error(`Namespace was unexpectedly changed to ${await namespaceInput.inputValue()}`)
  }

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'p0-verify-04-deploy-step-2-filled.png'),
    fullPage: true,
  })

  await clickFirst(page, [() => page.getByRole('button', { name: /continue|继续/i })])

  const startDeploymentButton = page
    .getByRole('button', { name: /start deployment|开始部署/i })
    .last()
  await startDeploymentButton.waitFor({
    state: 'visible',
    timeout: 10_000,
  })
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'p0-verify-05-deploy-step-3-review.png'),
    fullPage: true,
  })

  let createResponse = null
  try {
    ;[createResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().includes('/api/cloud-saas/deployments'),
        { timeout: 30_000 },
      ),
      startDeploymentButton.click(),
    ])
  } catch {
    createResponse = null
  }

  if (!createResponse) {
    throw new Error('Deploy submit did not trigger POST /api/cloud-saas/deployments')
  }

  if (!createResponse.ok()) {
    const errorText = await createResponse.text().catch(() => '')
    throw new Error(
      `Deploy request failed: ${createResponse.status()} ${errorText || createResponse.statusText()}`,
    )
  }

  await page.waitForTimeout(1500)
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'p0-verify-06-deploy-started.png'),
    fullPage: true,
  })

  finalDeployment = await poll(
    async () => {
      const list = await api('/api/cloud-saas/deployments?limit=100&offset=0', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!list.response.ok || !Array.isArray(list.body)) return null
      const match = list.body.find((item) => item.namespace === namespace)
      if (!match) return null
      deploymentId = match.id
      if (match.status === 'pending' || match.status === 'deploying') return null
      return match
    },
    { timeoutMs: 420_000, intervalMs: 3_000, label: `deployment ${namespace}` },
  )

  const detailResult = await api(`/api/cloud-saas/deployments/${deploymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!detailResult.response.ok) {
    throw new Error(`Failed to load deployment detail: ${detailResult.response.status}`)
  }

  const redactedConfig = JSON.stringify(detailResult.body?.configSnapshot ?? null)
  const detailRedactionOk =
    !redactedConfig.includes(patToken) &&
    !redactedConfig.includes('__shadowobRuntime') &&
    !redactedConfig.includes('http://server:3002')

  await waitForVisibleLocator(
    page,
    [() => page.getByRole('button', { name: /open namespace|打开命名空间/i })],
    { timeoutMs: 60_000, label: 'open namespace action after deploy success' },
  )
  await clickFirst(page, [() => page.getByRole('button', { name: /open namespace|打开命名空间/i })])

  await waitForVisibleLocator(
    page,
    [
      () => page.getByText(namespace, { exact: false }),
      () => page.getByRole('link', { name: /deployments|部署/i }),
    ],
    { timeoutMs: 20_000, label: `namespace page ${namespace}` },
  )

  const deploymentsLinkClicked = await clickFirst(page, [
    () => page.getByRole('link', { name: /^deployments$/i }),
    () => page.getByRole('link', { name: /deployments|部署/i }),
  ])

  if (!deploymentsLinkClicked) {
    throw new Error('Could not navigate to deployments page from namespace view')
  }

  await waitForVisibleLocator(
    page,
    [
      () => page.getByRole('button', { name: /deploy new|刷新/i }),
      () => page.getByRole('heading', { name: /deployments|部署/i }),
      () => page.getByText(namespace, { exact: false }),
    ],
    { timeoutMs: 20_000, label: 'deployments page after create' },
  )
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'p0-verify-07-deployments-after-create.png'),
    fullPage: true,
  })

  const destroyResult = await api(`/api/cloud-saas/deployments/${deploymentId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!destroyResult.response.ok) {
    throw new Error(
      `Destroy request failed: ${destroyResult.response.status} ${JSON.stringify(destroyResult.body)}`,
    )
  }

  destroyStatus = await poll(
    async () => {
      const detail = await api(`/api/cloud-saas/deployments/${deploymentId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!detail.response.ok) return null
      if (detail.body?.status === 'destroying') return null
      return detail.body?.status ?? null
    },
    { timeoutMs: 180_000, intervalMs: 3_000, label: `destroy ${deploymentId}` },
  )

  const refreshClicked = await clickFirst(page, [
    () => page.getByRole('button', { name: /refresh|刷新/i }),
  ])

  if (!refreshClicked) {
    throw new Error('Could not refresh deployments page after destroy')
  }

  await waitForVisibleLocator(
    page,
    [
      () => page.getByRole('button', { name: /deploy new|部署新/i }),
      () => page.getByRole('button', { name: /refresh|刷新/i }),
      () => page.getByRole('heading', { name: /deployments|部署/i }),
    ],
    { timeoutMs: 20_000, label: 'deployments page after destroy' },
  )
  await waitForLocatorToDisappear(page, [() => page.getByText(namespace, { exact: false })], {
    timeoutMs: 20_000,
    label: `namespace ${namespace} removal from deployments page`,
  })
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'p0-verify-08-deployments-after-destroy.png'),
    fullPage: true,
  })

  console.log(
    JSON.stringify(
      {
        invalidCreateStatus: invalidCreate.response.status,
        invalidCreateBody: invalidCreate.body,
        deploymentId,
        namespace,
        deploymentStatus: finalDeployment?.status ?? null,
        deploymentErrorMessage: finalDeployment?.errorMessage ?? null,
        detailRedactionOk,
        destroyStatus,
        screenshots: [
          'p0-verify-01-cloud-root.png',
          'p0-verify-02-template-detail.png',
          'p0-verify-03-deploy-step-1.png',
          'p0-verify-04-deploy-step-2-filled.png',
          'p0-verify-05-deploy-step-3-review.png',
          'p0-verify-06-deploy-started.png',
          'p0-verify-07-deployments-after-create.png',
          'p0-verify-08-deployments-after-destroy.png',
        ],
      },
      null,
      2,
    ),
  )
} finally {
  try {
    const revokeResult = await api(`/api/tokens/${patId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!revokeResult.response.ok) {
      revokeError = {
        status: revokeResult.response.status,
        body: revokeResult.body,
      }
    }
  } catch (error) {
    revokeError = { message: error instanceof Error ? error.message : String(error) }
  }

  await browser.close()

  if (revokeError) {
    console.error(JSON.stringify({ revokeError }, null, 2))
  }
}
