import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import sharp from 'sharp'
import { loginWithStoredTokens } from './auth-helpers'

type UserCredentials = {
  email: string
  password: string
  displayName: string
}

type WindowRect = {
  x: number
  y: number
  width: number
  height: number
}

type CapturePlan = {
  kind: 'home' | 'channel' | 'inbox' | 'file' | 'builtin'
  screenshot: string
  fileName?: string
  previewText?: string
  builtinKey?: string
  websiteAsset?: string
  window?: WindowRect
}

type DocsScenarioSession = {
  key?: string
  label?: string
  origin: string
  owner: UserCredentials
  server: {
    id: string
    slug: string
    name: string
  }
  cloudComputer?: {
    id: string
    name: string
    status?: string
  }
  channels: Record<
    string,
    {
      id: string
      name: string
      type?: string
    }
  >
  workspace?: {
    files: Array<{
      id: string
      name: string
      mime?: string
    }>
  }
  agents?: Array<{
    id: string
    name: string
    username?: string
  }>
  inboxes?: Array<{
    agentId?: string
    agentName?: string
    channelId?: string
    channelName?: string
  }>
  inboxTask?: {
    title: string
    body?: string
  }
  capture?: CapturePlan
}

type DocsScreenshotSession = DocsScenarioSession & {
  scenarios?: DocsScenarioSession[]
}

const repoRoot = process.cwd().endsWith(path.join('apps', 'desktop'))
  ? path.resolve(process.cwd(), '../..')
  : process.cwd()

function resolveRepoPath(value: string | undefined, fallback: string) {
  if (!value) return fallback
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value)
}

const sessionPath = resolveRepoPath(
  process.env.E2E_SESSION_PATH,
  path.resolve(repoRoot, '.tmp/e2e/docs-screenshot-session.json'),
)
const screenshotDir = resolveRepoPath(
  process.env.E2E_SCREENSHOT_DIR,
  path.resolve(repoRoot, 'docs/e2e/screenshots'),
)
const screenshotViewport = { width: 1600, height: 1000 }
const minimumRetinaScale = 2

async function readSession(): Promise<DocsScreenshotSession> {
  const raw = await fs.readFile(sessionPath, 'utf8')
  return JSON.parse(raw) as DocsScreenshotSession
}

async function ensureScreenshotDir() {
  await fs.mkdir(screenshotDir, { recursive: true })
}

async function settleProductPage(page: import('@playwright/test').Page) {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.waitForTimeout(1400)
  await expect(page.locator('body')).toBeVisible()
}

async function capture(page: import('@playwright/test').Page, name: string, websiteAsset?: string) {
  await settleProductPage(page)
  const outputPath = path.join(screenshotDir, name)
  await page.screenshot({
    path: outputPath,
    fullPage: false,
    scale: 'device',
  })
  const buffer = await fs.readFile(outputPath)
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)

  expect(width).toBeGreaterThanOrEqual(screenshotViewport.width * minimumRetinaScale)
  expect(height).toBeGreaterThanOrEqual(screenshotViewport.height * minimumRetinaScale)

  if (websiteAsset) {
    if (websiteAsset !== path.basename(websiteAsset) || !websiteAsset.endsWith('.webp')) {
      throw new Error(`Invalid website screenshot asset name: ${websiteAsset}`)
    }
    const websiteOutputDir = path.resolve(
      repoRoot,
      'website/docs/public/home-assets/community-shots',
    )
    await fs.mkdir(websiteOutputDir, { recursive: true })
    await sharp(outputPath)
      .resize(screenshotViewport.width, screenshotViewport.height, { fit: 'cover' })
      .sharpen({ sigma: 0.55 })
      .webp({ quality: 88, effort: 6 })
      .toFile(path.join(websiteOutputDir, websiteAsset))
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function scenarioCapture(scenario: DocsScenarioSession): CapturePlan {
  return scenario.capture ?? { kind: 'home', screenshot: 'docs-desktop-home.png' }
}

async function clearDesktopWindowState(page: import('@playwright/test').Page, serverId: string) {
  await page.evaluate((targetServerId) => {
    for (const key of ['shadow:os-windows:v2', 'shadow:os-desktop-files:v1']) {
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>
        delete parsed[targetServerId]
        window.localStorage.setItem(key, JSON.stringify(parsed))
      } catch {
        window.localStorage.removeItem(key)
      }
    }
  }, serverId)
}

async function openDesktopHome(
  page: import('@playwright/test').Page,
  scenario: DocsScenarioSession,
) {
  await clearDesktopWindowState(page, scenario.server.id)
  await page.goto(`/app/spaces/${encodeURIComponent(scenario.server.slug)}`)
  await settleProductPage(page)
  await expect(page.getByText(scenario.server.name).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: /Workspace/i }).first()).toBeVisible({
    timeout: 30_000,
  })
}

async function dispatchDesktopCommand(
  page: import('@playwright/test').Page,
  scenario: DocsScenarioSession,
  detail: Record<string, unknown>,
) {
  await page.evaluate(
    (command) => {
      window.dispatchEvent(new CustomEvent('shadow:os-command', { detail: command }))
    },
    {
      serverId: scenario.server.id,
      serverSlug: scenario.server.slug,
      ...detail,
    },
  )
  await settleProductPage(page)
}

async function positionStoredWindow(
  page: import('@playwright/test').Page,
  scenario: DocsScenarioSession,
  matcher: {
    kind?: string
    builtinKey?: string
    workspaceFileName?: string
  },
  rect: WindowRect,
) {
  await page
    .waitForFunction(
      ({ serverId, matcher: inputMatcher }) => {
        const raw = window.localStorage.getItem('shadow:os-windows:v2')
        if (!raw) return false
        const storage = JSON.parse(raw) as Record<string, { windows?: Array<Record<string, any>> }>
        const windows = storage[serverId]?.windows ?? []
        return windows.some((item) => {
          if (inputMatcher.kind && item.kind !== inputMatcher.kind) return false
          if (inputMatcher.builtinKey && item.builtinKey !== inputMatcher.builtinKey) return false
          if (
            inputMatcher.workspaceFileName &&
            item.workspaceNode?.name !== inputMatcher.workspaceFileName
          ) {
            return false
          }
          return true
        })
      },
      { serverId: scenario.server.id, matcher },
      { timeout: 5_000 },
    )
    .catch(() => undefined)

  await page.evaluate(
    ({ serverId, matcher: inputMatcher, rect: nextRect }) => {
      const raw = window.localStorage.getItem('shadow:os-windows:v2')
      if (!raw) return
      const storage = JSON.parse(raw) as Record<
        string,
        {
          windows?: Array<Record<string, any>>
          focusedWindowId?: string | null
        }
      >
      const state = storage[serverId]
      if (!state?.windows) return
      let focusedWindowId = state.focusedWindowId ?? null
      state.windows = state.windows.map((item, index) => {
        const matches =
          (!inputMatcher.kind || item.kind === inputMatcher.kind) &&
          (!inputMatcher.builtinKey || item.builtinKey === inputMatcher.builtinKey) &&
          (!inputMatcher.workspaceFileName ||
            item.workspaceNode?.name === inputMatcher.workspaceFileName)
        if (!matches) return item
        focusedWindowId = item.id
        return {
          ...item,
          ...nextRect,
          z: 80 + index,
          minimized: false,
          maximized: false,
        }
      })
      state.focusedWindowId = focusedWindowId
      window.localStorage.setItem('shadow:os-windows:v2', JSON.stringify(storage))
    },
    { serverId: scenario.server.id, matcher, rect },
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settleProductPage(page)
}

async function captureScenario(
  page: import('@playwright/test').Page,
  scenario: DocsScenarioSession,
) {
  const plan = scenarioCapture(scenario)
  await page.setViewportSize(screenshotViewport)
  await page.addInitScript(() => {
    localStorage.setItem('shadow-lang', 'en')
  })
  await loginWithStoredTokens(
    page,
    scenario.origin,
    scenario.owner,
    `/app/spaces/${encodeURIComponent(scenario.server.slug)}`,
  )

  await openDesktopHome(page, scenario)

  if (plan.kind === 'home') {
    await capture(page, plan.screenshot, plan.websiteAsset)
    return
  }

  if (plan.kind === 'builtin') {
    await dispatchDesktopCommand(page, scenario, {
      action: 'open-builtin',
      builtinKey: plan.builtinKey,
    })
    if (plan.window) {
      await positionStoredWindow(
        page,
        scenario,
        { kind: 'builtin', builtinKey: plan.builtinKey },
        plan.window,
      )
    }
    await expect(page.getByText(/Cloud Computers|Workspace|App Center/i).first()).toBeVisible({
      timeout: 30_000,
    })
    if (plan.builtinKey === 'workspace' && plan.fileName) {
      const fileEntry = page
        .locator('section[data-focused="true"]')
        .getByText(plan.fileName, { exact: true })
        .first()
      await expect(fileEntry).toBeVisible({ timeout: 30_000 })
      await fileEntry.click()
      if (plan.previewText) {
        await expect(page.getByText(plan.previewText, { exact: true }).first()).toBeVisible({
          timeout: 30_000,
        })
      }
    }
    await capture(page, plan.screenshot, plan.websiteAsset)
    return
  }

  if (plan.kind === 'file' && plan.fileName) {
    const fileButton = page
      .getByRole('button', { name: new RegExp(escapeRegExp(plan.fileName), 'i') })
      .first()
    await expect(fileButton).toBeVisible({ timeout: 30_000 })
    await fileButton.dblclick()
    await expect(page.getByText(plan.fileName).first()).toBeVisible({ timeout: 30_000 })
    if (plan.window) {
      await positionStoredWindow(
        page,
        scenario,
        { kind: 'builtin', builtinKey: 'workspace', workspaceFileName: plan.fileName },
        plan.window,
      )
      await expect(page.getByText(plan.fileName).first()).toBeVisible({ timeout: 30_000 })
    }
    await capture(page, plan.screenshot, plan.websiteAsset)
    return
  }

  if (plan.kind === 'channel') {
    const channel = scenario.channels.briefing ?? scenario.channels.general
    await dispatchDesktopCommand(page, scenario, {
      action: 'open-channel',
      channelId: channel.id,
    })
    await expect(page.getByText(channel.name).first()).toBeVisible({ timeout: 30_000 })
    if (plan.previewText) {
      await expect(page.getByText(plan.previewText, { exact: true }).first()).toBeVisible({
        timeout: 30_000,
      })
    }
    await capture(page, plan.screenshot, plan.websiteAsset)
    return
  }

  if (plan.kind === 'inbox') {
    const inbox = scenario.inboxes?.find((entry) => entry.agentId && entry.channelId)
    await dispatchDesktopCommand(page, scenario, {
      action: 'open-inbox',
      agentId: inbox?.agentId ?? scenario.agents?.[0]?.id,
      channelId: inbox?.channelId,
    })
    await expect(page.getByText(scenario.inboxTask?.title ?? /Prepare/i).first()).toBeVisible({
      timeout: 30_000,
    })
    await capture(page, plan.screenshot, plan.websiteAsset)
  }
}

test.describe('docs screenshot capture', () => {
  test.beforeAll(async () => {
    await ensureScreenshotDir()
  })

  test('captures seeded desktop-mode product scenarios for website docs', async ({ page }) => {
    const session = await readSession()
    const scenarios = session.scenarios?.length ? session.scenarios : [session]

    for (const scenario of scenarios) {
      await captureScenario(page, scenario)
    }
  })
})
