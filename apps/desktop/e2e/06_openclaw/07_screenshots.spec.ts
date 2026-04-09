/**
 * OpenClaw Screenshot E2E Tests
 *
 * Seeds mock data via IPC, navigates to each OpenClaw sub-page,
 * and captures screenshots for the website & documentation.
 *
 * Run:  pnpm --dir ./apps/desktop exec playwright test e2e/06_openclaw/07_screenshots.spec.ts
 */

import path from 'node:path'
import { type ElectronApplication, type Page, test } from '@playwright/test'
import { launchDesktopApp } from '../helpers'

const SCREENSHOT_DIR = path.resolve(__dirname, '../../test-results/openclaw-screenshots')

// ─── Mock Data ──────────────────────────────────────────────────────────────

const MOCK_AGENTS = [
  {
    id: 'shadow-assistant',
    name: 'Shadow Assistant',
    model: 'openai/gpt-4o',
    skills: ['web-search', 'calculator', 'code-runner'],
    identity: { name: 'Shadow', emoji: '🦞', theme: 'elegant' },
    enabled: true,
    temperature: 0.7,
    maxTokens: 4096,
  },
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    model: 'anthropic/claude-sonnet-4-20250514',
    skills: ['github', 'code-review'],
    identity: { name: 'Reviewer', emoji: '🔍', theme: 'tech' },
    enabled: true,
    temperature: 0.3,
    maxTokens: 8192,
  },
  {
    id: 'scheduler-bot',
    name: 'Schedule Bot',
    model: 'openai/gpt-4o-mini',
    skills: ['calendar', 'reminder'],
    identity: { name: 'Scheduler', emoji: '📅' },
    enabled: false,
    temperature: 0.5,
    maxTokens: 2048,
  },
]

const MOCK_MODELS: Record<string, unknown> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-••••mock',
    api: 'openai-completions',
    models: [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        contextWindow: 128000,
        maxTokens: 4096,
        input: ['text', 'image'],
      },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, maxTokens: 16384 },
      { id: 'o3-mini', name: 'o3-mini', reasoning: true, contextWindow: 200000, maxTokens: 16384 },
    ],
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'sk-ant-••••mock',
    api: 'anthropic-messages',
    models: [
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        contextWindow: 200000,
        maxTokens: 8192,
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        contextWindow: 200000,
        maxTokens: 4096,
      },
    ],
  },
  ollama: {
    baseUrl: 'http://localhost:11434/v1',
    api: 'ollama',
    models: [{ id: 'llama3.1:8b', name: 'Llama 3.1 8B', contextWindow: 128000, maxTokens: 4096 }],
  },
}

const MOCK_CRON_TASKS = [
  {
    name: 'Daily Standup Reminder',
    description: 'Send standup questions to team channel every weekday morning',
    enabled: true,
    agentId: 'shadow-assistant',
    schedule: { kind: 'cron' as const, expr: '0 9 * * 1-5', tz: 'Asia/Shanghai' },
    payload: { kind: 'agentTurn' as const, message: 'Good morning team! Time for standup.' },
  },
  {
    name: 'Weekly Code Review',
    description: 'Generate and post weekly code metrics report on Fridays',
    enabled: true,
    agentId: 'code-reviewer',
    schedule: { kind: 'cron' as const, expr: '0 17 * * 5' },
    payload: { kind: 'agentTurn' as const, message: 'Generate weekly code review summary.' },
  },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

let app: ElectronApplication
let page: Page

async function seedData(p: Page) {
  await p.evaluate(
    async (data) => {
      const api = (
        window as unknown as Record<
          string,
          Record<string, (...args: unknown[]) => Promise<unknown>>
        >
      ).desktopAPI?.openClaw
      if (!api) return

      // Agents
      for (const agent of data.agents) {
        try {
          await api.createAgent(agent)
        } catch {
          /* may already exist */
        }
      }
      // Model providers
      for (const [id, provider] of Object.entries(data.models)) {
        try {
          await api.saveModel(id, provider)
        } catch {}
      }
      // Channel config
      try {
        await api.saveChannelConfig('telegram', {
          botToken: '7xxxx:____mock____',
          allowedChats: ['team-general'],
        })
      } catch {}
      // Cron tasks
      for (const task of data.cronTasks) {
        try {
          await api.saveCronTask(task)
        } catch {}
      }
      // Buddy connection
      try {
        await api.addBuddyConnection({
          id: 'buddy-demo',
          label: 'Team Shadow Server',
          serverUrl: 'https://shadow.example.com',
          apiToken: 'mock-token',
          agentId: 'shadow-assistant',
          autoConnect: true,
        })
      } catch {}
    },
    { agents: MOCK_AGENTS, models: MOCK_MODELS, cronTasks: MOCK_CRON_TASKS },
  )
}

async function cleanupData(p: Page) {
  await p.evaluate(async () => {
    const api = (
      window as unknown as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>
    ).desktopAPI?.openClaw
    if (!api) return
    for (const id of ['shadow-assistant', 'code-reviewer', 'scheduler-bot']) {
      try {
        await api.deleteAgent(id)
      } catch {}
    }
    for (const id of ['openai', 'anthropic', 'ollama']) {
      try {
        await api.deleteModel(id)
      } catch {}
    }
    try {
      await api.deleteChannelConfig('telegram')
    } catch {}
    try {
      await api.removeBuddyConnection('buddy-demo')
    } catch {}
  })
}

/**
 * Click a sidebar navigation item via JS-level DOM traversal.
 * Falls back to expanding a collapsed section if the target isn't found.
 */
async function clickNav(p: Page, itemLabel: string, sectionLabel?: string) {
  const clicked = await p.evaluate(
    ({ label, section }) => {
      const aside = document.querySelector('aside')
      if (!aside) return false
      const buttons = Array.from(aside.querySelectorAll('button'))

      // Expand collapsed section if needed
      if (section) {
        const sectionBtn = buttons.find((b) => b.textContent?.includes(section))
        if (sectionBtn) sectionBtn.click()
      }

      // Find and click the nav item by matching text content
      const target = buttons.find((b) => b.textContent?.includes(label))
      if (target) {
        target.click()
        return true
      }
      return false
    },
    { label: itemLabel, section: sectionLabel },
  )

  if (!clicked) {
    // Fallback: wait a moment (section may need to render) then try again
    await p.waitForTimeout(600)
    await p.evaluate((label) => {
      const aside = document.querySelector('aside')
      if (!aside) return
      const buttons = Array.from(aside.querySelectorAll('button'))
      const target = buttons.find((b) => b.textContent?.includes(label))
      target?.click()
    }, itemLabel)
  }

  await p.waitForTimeout(1500)
}

function screenshotPath(name: string) {
  return path.join(SCREENSHOT_DIR, `${name}.png`)
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

test.beforeAll(async () => {
  ;({ app, page } = await launchDesktopApp())

  // Auth mock — prevents the app from redirecting to login
  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'e2e-screenshot-token')
    localStorage.setItem('refreshToken', 'e2e-screenshot-refresh')
    // Expand collapsed nav sections so all items are always visible
    localStorage.setItem(
      'openclaw-nav-collapsed',
      JSON.stringify({ start: false, basic: false, advanced: false }),
    )
    // biome-ignore lint/suspicious/noExplicitAny: E2E mock injection
    ;(globalThis as any).__SHADOW_FETCH_API_MOCK__ = (path: string) => {
      if (path === '/api/auth/me') {
        return {
          id: 'e2e',
          email: 'e2e@test.com',
          username: 'e2e',
          displayName: 'E2E User',
          avatarUrl: null,
          status: 'online',
        }
      }
      if (path.includes('/servers') || path.includes('/channels') || path.includes('/buddies'))
        return []
      return {}
    }
  })

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)

  // Seed realistic mock data through real IPC
  await seedData(page)

  // Navigate to OpenClaw
  await page.evaluate(() => {
    window.location.hash = '#/app/openclaw'
  })
  await page.waitForTimeout(3000)

  // Consistent viewport for screenshots
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(500)
})

test.afterAll(async () => {
  await cleanupData(page).catch(() => {})
  await app?.close()
})

// ─── Screenshot Tests ───────────────────────────────────────────────────────

test.describe
  .serial('OpenClaw Screenshots', () => {
    test.setTimeout(30_000)

    test('oc-01-dashboard', async () => {
      await clickNav(page, '仪表盘')
      await page.screenshot({ path: screenshotPath('oc-01-dashboard') })
    })

    test('oc-02-agents', async () => {
      await clickNav(page, '我的龙虾')
      // Click first agent in list to show the editor panel
      const agentItem = page.locator('button:has-text("Shadow Assistant")').first()
      if (await agentItem.isVisible().catch(() => false)) {
        await agentItem.click()
        await page.waitForTimeout(800)
      }
      await page.screenshot({ path: screenshotPath('oc-02-agents') })
    })

    test('oc-03-skillhub', async () => {
      await clickNav(page, '技能商店')
      await page.screenshot({ path: screenshotPath('oc-03-skillhub') })
    })

    test('oc-04-cron', async () => {
      await clickNav(page, '定时任务')
      await page.screenshot({ path: screenshotPath('oc-04-cron') })
    })

    test('oc-05-buddy', async () => {
      await clickNav(page, '连接 Buddy')
      await page.screenshot({ path: screenshotPath('oc-05-buddy') })
    })

    test('oc-06-help', async () => {
      await clickNav(page, '帮助中心')
      await page.screenshot({ path: screenshotPath('oc-06-help') })
    })

    test('oc-07-models', async () => {
      await clickNav(page, '模型提供商', '进阶')
      await page.screenshot({ path: screenshotPath('oc-07-models') })
    })

    test('oc-08-channels', async () => {
      await clickNav(page, 'IM 通道', '进阶')
      await page.screenshot({ path: screenshotPath('oc-08-channels') })
    })

    test('oc-09-debug', async () => {
      await clickNav(page, '调试控制台', '进阶')
      await page.screenshot({ path: screenshotPath('oc-09-debug') })
    })

    test('oc-10-onboard', async () => {
      await clickNav(page, '设置向导')
      await page.screenshot({ path: screenshotPath('oc-10-onboard') })
    })
  })
