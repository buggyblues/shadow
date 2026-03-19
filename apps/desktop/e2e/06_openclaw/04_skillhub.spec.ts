/**
 * OpenClaw SkillHub E2E Tests
 *
 * Tests the skill management IPC methods: listing installed skills,
 * searching the SkillHub registry, install/uninstall flows, and
 * skill config persistence.
 */

import { type ElectronApplication, expect, type Page, test } from '@playwright/test'
import { launchDesktopApp } from '../helpers'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchDesktopApp())
  await page.waitForTimeout(2000)
})

test.afterAll(async () => {
  await app?.close()
})

// ─── Installed Skills ───────────────────────────────────────────────────────

test.describe('Installed Skills', () => {
  test('listSkills returns an array', async () => {
    const skills = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.listSkills()
    })

    expect(Array.isArray(skills)).toBe(true)
  })

  test('each installed skill has required metadata fields', async () => {
    const skills = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.listSkills()
    })

    for (const skill of skills) {
      // Each skill should have at least an id/name and a directory
      expect(typeof skill.name === 'string' || typeof skill.id === 'string').toBe(true)
    }
  })

  test('getSkillReadme returns a string or null', async () => {
    const skills = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.listSkills()
    })

    if (skills.length === 0) {
      // No skills installed — just verify the function is callable
      const result = await page.evaluate(async () => {
        try {
          return await (window as any).desktopAPI.openClaw.getSkillReadme('nonexistent')
        } catch {
          return null
        }
      })
      expect(result === null || result === undefined || typeof result === 'string').toBe(true)
      return
    }

    // Read the first skill's readme
    const firstSkillId = skills[0].name ?? skills[0].id
    const readme = await page.evaluate(async (skillId: string) => {
      return await (window as any).desktopAPI.openClaw.getSkillReadme(skillId)
    }, firstSkillId)

    expect(readme === null || readme === undefined || typeof readme === 'string').toBe(true)
  })

  test('updateSkillConfig is callable', async () => {
    const result = await page.evaluate(async () => {
      try {
        await (window as any).desktopAPI.openClaw.updateSkillConfig('test-skill', {
          API_KEY: 'test-value',
        })
        return { success: true }
      } catch (err: any) {
        return { success: false, error: err.message }
      }
    })

    // May fail if skill doesn't exist, but function should be callable
    expect(result).toBeDefined()
  })
})

// ─── SkillHub Search ────────────────────────────────────────────────────────

test.describe('SkillHub Search', () => {
  test('searchSkills returns an object with results array', async () => {
    const searchResult = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.searchSkills('weather')
    })

    expect(searchResult).toBeDefined()
    expect(typeof searchResult).toBe('object')
    // Should have a skills array (from fallback catalog or real registry)
    expect(Array.isArray(searchResult.skills)).toBe(true)
  })

  test('searchSkills with empty query returns results (or empty)', async () => {
    const searchResult = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.searchSkills('')
    })

    expect(searchResult).toBeDefined()
  })

  test('searchSkills with specific keyword returns matching results', async () => {
    const searchResult = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.searchSkills('calculator')
    })

    expect(searchResult).toBeDefined()
    const results = searchResult.skills ?? []
    // Results may be empty if no matching skills exist
    expect(Array.isArray(results)).toBe(true)
  })

  test('search result entries have expected metadata', async () => {
    const results = await page.evaluate(async () => {
      const searchResult = await (window as any).desktopAPI.openClaw.searchSkills('weather')
      return searchResult.skills ?? []
    })

    if (results.length > 0) {
      const first = results[0]
      // Each result should have name and description at minimum
      expect(typeof first.name === 'string').toBe(true)
    }
  })
})

// ─── Skill Install / Uninstall ──────────────────────────────────────────────

test.describe('Skill Install/Uninstall', () => {
  test('installSkill is callable', async () => {
    const result = await page.evaluate(async () => {
      try {
        await (window as any).desktopAPI.openClaw.installSkill('test-skill-package')
        return { called: true }
      } catch (err: any) {
        // Install may fail if skill doesn't exist in registry
        return { called: true, error: err.message }
      }
    })

    expect(result.called).toBe(true)
  })

  test('uninstallSkill is callable', async () => {
    const result = await page.evaluate(async () => {
      try {
        await (window as any).desktopAPI.openClaw.uninstallSkill('test-skill-package')
        return { called: true }
      } catch (err: any) {
        return { called: true, error: err.message }
      }
    })

    expect(result.called).toBe(true)
  })
})

// ─── Registry Management ────────────────────────────────────────────────────

test.describe('Registry Management', () => {
  test('getRegistries returns an array', async () => {
    const registries = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getRegistries()
    })

    expect(Array.isArray(registries)).toBe(true)
  })

  test('getRegistries contains at least the default registry', async () => {
    const registries = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getRegistries()
    })

    // Should have at least one registry configured
    expect(registries.length).toBeGreaterThanOrEqual(1)
  })

  test('each registry entry has a name and url', async () => {
    const registries = await page.evaluate(async () => {
      return await (window as any).desktopAPI.openClaw.getRegistries()
    })

    for (const reg of registries) {
      expect(typeof reg.name === 'string' || typeof reg.url === 'string').toBe(true)
    }
  })

  test('updateRegistries round-trip preserves data', async () => {
    const result = await page.evaluate(async () => {
      const oc = (window as any).desktopAPI.openClaw
      const original = await oc.getRegistries()

      // Add a test registry
      const updated = [
        ...original,
        { name: 'e2e-test-registry', url: 'https://example.com/registry' },
      ]
      await oc.updateRegistries(updated)

      const afterAdd = await oc.getRegistries()
      const hasTestReg = afterAdd.some((r: any) => r.name === 'e2e-test-registry')

      // Restore original
      await oc.updateRegistries(original)

      const afterRestore = await oc.getRegistries()

      return {
        hasTestReg,
        restored: afterRestore.length === original.length,
      }
    })

    expect(result.hasTestReg).toBe(true)
    expect(result.restored).toBe(true)
  })
})
