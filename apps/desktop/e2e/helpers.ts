import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { type ElectronApplication, _electron as electron, type Page } from 'playwright'

export async function launchDesktopApp(): Promise<{
  app: ElectronApplication
  page: Page
}> {
  const electronBin = require('electron') as unknown as string
  const projectRoot = path.resolve(__dirname, '..')
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'xiadou-e2e-'))

  const app = await electron.launch({
    executablePath: electronBin,
    args: [projectRoot],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DESKTOP_WEB_ORIGIN: 'https://shadowob.app',
      DESKTOP_USER_DATA_DIR: userDataDir,
    },
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.locator('.pet-sprite').waitFor({ state: 'visible' })
  return { app, page }
}
