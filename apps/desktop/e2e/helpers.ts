// Shared helpers for desktop E2E tests
import path from 'node:path'
import { type ElectronApplication, _electron as electron, type Page } from 'playwright'

export async function launchDesktopApp(): Promise<{
  app: ElectronApplication
  page: Page
}> {
  const electronBin = require('electron') as unknown as string
  const projectRoot = path.resolve(__dirname, '..')

  const app = await electron.launch({
    executablePath: electronBin,
    args: [projectRoot],
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
  })

  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  return { app, page }
}

/**
 * Collect console errors during a callback execution.
 * Returns array of error messages.
 */
export async function collectConsoleErrors(
  page: Page,
  action: () => Promise<void>,
): Promise<string[]> {
  const errors: string[] = []
  const handler = (err: Error) => errors.push(err.message)
  page.on('pageerror', handler)
  await action()
  page.removeListener('pageerror', handler)
  return errors
}
