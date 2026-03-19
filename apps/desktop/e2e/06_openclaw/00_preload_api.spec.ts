/**
 * OpenClaw Preload API E2E Tests
 *
 * Verifies that the openClaw API is properly exposed to the renderer
 * process via the preload bridge, and all expected methods exist.
 */

import { type ElectronApplication, expect, type Page, test } from '@playwright/test'
import { launchDesktopApp } from '../helpers'

let app: ElectronApplication
let page: Page

test.beforeAll(async () => {
  ;({ app, page } = await launchDesktopApp())
})

test.afterAll(async () => {
  await app?.close()
})

// ─── API Surface ────────────────────────────────────────────────────────────

test.describe('OpenClaw Preload API Surface', () => {
  test('desktopAPI.openClaw is exposed', async () => {
    const hasOpenClaw = await page.evaluate(
      () => 'desktopAPI' in window && 'openClaw' in (window as any).desktopAPI,
    )
    expect(hasOpenClaw).toBe(true)
  })

  test('openClaw exposes gateway lifecycle methods', async () => {
    const methods = await page.evaluate(() => {
      const oc = (window as any).desktopAPI.openClaw
      return {
        getGatewayStatus: typeof oc.getGatewayStatus,
        startGateway: typeof oc.startGateway,
        stopGateway: typeof oc.stopGateway,
        restartGateway: typeof oc.restartGateway,
        installOpenClaw: typeof oc.installOpenClaw,
        onGatewayStatusChanged: typeof oc.onGatewayStatusChanged,
        onGatewayLog: typeof oc.onGatewayLog,
      }
    })
    expect(methods.getGatewayStatus).toBe('function')
    expect(methods.startGateway).toBe('function')
    expect(methods.stopGateway).toBe('function')
    expect(methods.restartGateway).toBe('function')
    expect(methods.installOpenClaw).toBe('function')
    expect(methods.onGatewayStatusChanged).toBe('function')
    expect(methods.onGatewayLog).toBe('function')
  })

  test('openClaw exposes config methods', async () => {
    const methods = await page.evaluate(() => {
      const oc = (window as any).desktopAPI.openClaw
      return {
        getConfig: typeof oc.getConfig,
        saveConfig: typeof oc.saveConfig,
      }
    })
    expect(methods.getConfig).toBe('function')
    expect(methods.saveConfig).toBe('function')
  })

  test('openClaw exposes agent CRUD methods', async () => {
    const methods = await page.evaluate(() => {
      const oc = (window as any).desktopAPI.openClaw
      return {
        listAgents: typeof oc.listAgents,
        getAgent: typeof oc.getAgent,
        createAgent: typeof oc.createAgent,
        updateAgent: typeof oc.updateAgent,
        deleteAgent: typeof oc.deleteAgent,
      }
    })
    expect(methods.listAgents).toBe('function')
    expect(methods.getAgent).toBe('function')
    expect(methods.createAgent).toBe('function')
    expect(methods.updateAgent).toBe('function')
    expect(methods.deleteAgent).toBe('function')
  })

  test('openClaw exposes channel methods', async () => {
    const methods = await page.evaluate(() => {
      const oc = (window as any).desktopAPI.openClaw
      return {
        getChannelRegistry: typeof oc.getChannelRegistry,
        getChannelMeta: typeof oc.getChannelMeta,
        getChannelConfigs: typeof oc.getChannelConfigs,
        getChannelConfig: typeof oc.getChannelConfig,
        saveChannelConfig: typeof oc.saveChannelConfig,
        deleteChannelConfig: typeof oc.deleteChannelConfig,
      }
    })
    expect(methods.getChannelRegistry).toBe('function')
    expect(methods.getChannelMeta).toBe('function')
    expect(methods.getChannelConfigs).toBe('function')
    expect(methods.getChannelConfig).toBe('function')
    expect(methods.saveChannelConfig).toBe('function')
    expect(methods.deleteChannelConfig).toBe('function')
  })

  test('openClaw exposes model provider methods', async () => {
    const methods = await page.evaluate(() => {
      const oc = (window as any).desktopAPI.openClaw
      return {
        listModels: typeof oc.listModels,
        saveModel: typeof oc.saveModel,
        deleteModel: typeof oc.deleteModel,
      }
    })
    expect(methods.listModels).toBe('function')
    expect(methods.saveModel).toBe('function')
    expect(methods.deleteModel).toBe('function')
  })

  test('openClaw exposes cron task methods', async () => {
    const methods = await page.evaluate(() => {
      const oc = (window as any).desktopAPI.openClaw
      return {
        listCronTasks: typeof oc.listCronTasks,
        saveCronTask: typeof oc.saveCronTask,
        deleteCronTask: typeof oc.deleteCronTask,
        triggerCronTask: typeof oc.triggerCronTask,
        getCronHistory: typeof oc.getCronHistory,
      }
    })
    expect(methods.listCronTasks).toBe('function')
    expect(methods.saveCronTask).toBe('function')
    expect(methods.deleteCronTask).toBe('function')
    expect(methods.triggerCronTask).toBe('function')
    expect(methods.getCronHistory).toBe('function')
  })

  test('openClaw exposes skill management methods', async () => {
    const methods = await page.evaluate(() => {
      const oc = (window as any).desktopAPI.openClaw
      return {
        listSkills: typeof oc.listSkills,
        updateSkillConfig: typeof oc.updateSkillConfig,
        getSkillReadme: typeof oc.getSkillReadme,
        searchSkills: typeof oc.searchSkills,
        installSkill: typeof oc.installSkill,
        uninstallSkill: typeof oc.uninstallSkill,
        getRegistries: typeof oc.getRegistries,
        updateRegistries: typeof oc.updateRegistries,
      }
    })
    expect(methods.listSkills).toBe('function')
    expect(methods.updateSkillConfig).toBe('function')
    expect(methods.getSkillReadme).toBe('function')
    expect(methods.searchSkills).toBe('function')
    expect(methods.installSkill).toBe('function')
    expect(methods.uninstallSkill).toBe('function')
    expect(methods.getRegistries).toBe('function')
    expect(methods.updateRegistries).toBe('function')
  })

  test('openClaw exposes buddy connection methods', async () => {
    const methods = await page.evaluate(() => {
      const oc = (window as any).desktopAPI.openClaw
      return {
        listBuddyConnections: typeof oc.listBuddyConnections,
        addBuddyConnection: typeof oc.addBuddyConnection,
        removeBuddyConnection: typeof oc.removeBuddyConnection,
        updateBuddyConnection: typeof oc.updateBuddyConnection,
        connectBuddy: typeof oc.connectBuddy,
        disconnectBuddy: typeof oc.disconnectBuddy,
        connectAllBuddies: typeof oc.connectAllBuddies,
        onBuddyStatusChanged: typeof oc.onBuddyStatusChanged,
      }
    })
    expect(methods.listBuddyConnections).toBe('function')
    expect(methods.addBuddyConnection).toBe('function')
    expect(methods.removeBuddyConnection).toBe('function')
    expect(methods.updateBuddyConnection).toBe('function')
    expect(methods.connectBuddy).toBe('function')
    expect(methods.disconnectBuddy).toBe('function')
    expect(methods.connectAllBuddies).toBe('function')
    expect(methods.onBuddyStatusChanged).toBe('function')
  })
})
