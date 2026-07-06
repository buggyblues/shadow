/**
 * Health handler — liveness and doctor checks.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Hono } from 'hono'
import type { HandlerContext } from './types.js'

const execFileAsync = promisify(execFile)

async function getVersion(cmd: string, versionFlag = '--version'): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(cmd, [versionFlag], {
      encoding: 'utf-8',
      timeout: 10_000,
    })
    return stdout.trim()
  } catch {
    return null
  }
}

export function createHealthHandler(ctx: HandlerContext): Hono {
  const app = new Hono()

  app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

  app.get('/doctor', async (c) => {
    const { container } = ctx
    const checks: Array<{ name: string; status: 'pass' | 'warn' | 'fail'; message: string }> = []

    const nodeVersion = process.version
    const major = Number.parseInt(nodeVersion.slice(1), 10)
    checks.push(
      major >= 22
        ? { name: 'Node.js', status: 'pass', message: nodeVersion }
        : {
            name: 'Node.js',
            status: major >= 20 ? 'warn' : 'fail',
            message: `${nodeVersion} (22+ recommended)`,
          },
    )

    if (await container.k8s.isToolInstalled('docker')) {
      checks.push({
        name: 'Docker',
        status: 'pass',
        message: (await getVersion('docker')) ?? 'installed',
      })
    } else {
      checks.push({ name: 'Docker', status: 'fail', message: 'not found' })
    }

    if (await container.k8s.isToolInstalled('kubectl')) {
      const reachable = await container.k8s.isKubeReachable()
      checks.push({
        name: 'kubectl',
        status: reachable ? 'pass' : 'warn',
        message: reachable ? 'connected' : 'installed but unreachable',
      })
    } else {
      checks.push({ name: 'kubectl', status: 'fail', message: 'not found' })
    }

    if (await container.k8s.isToolInstalled('pulumi')) {
      checks.push({
        name: 'Pulumi',
        status: 'pass',
        message: (await getVersion('pulumi', 'version')) ?? 'installed',
      })
    } else {
      checks.push({ name: 'Pulumi', status: 'fail', message: 'not found' })
    }

    if (await container.k8s.isToolInstalled('kind')) {
      const hasCluster = await container.k8s.kindClusterExists()
      checks.push({
        name: 'kind',
        status: 'pass',
        message: hasCluster ? 'installed + cluster exists' : 'installed',
      })
    } else {
      checks.push({ name: 'kind', status: 'warn', message: 'not found (optional)' })
    }

    // Plugin health checks
    try {
      const { checkPluginHealth, loadAllPlugins, getPluginRegistry } = await import(
        '../../../plugins/index.js'
      )
      try {
        await loadAllPlugins(getPluginRegistry())
      } catch {
        /* already loaded */
      }

      const configRow = ctx.configDao.findByName('current')
      let cloudConfig = {} as Record<string, unknown>
      if (configRow) {
        cloudConfig = configRow.content as Record<string, unknown>
      }

      const pluginHealthResults = await checkPluginHealth(cloudConfig as never)
      for (const result of pluginHealthResults) {
        checks.push({
          name: `Plugin: ${result.name}`,
          status: result.healthy ? 'pass' : 'warn',
          message: result.message,
        })
      }
    } catch {
      // Plugin health check is optional
    }

    return c.json({
      checks,
      summary: {
        pass: checks.filter((ch) => ch.status === 'pass').length,
        warn: checks.filter((ch) => ch.status === 'warn').length,
        fail: checks.filter((ch) => ch.status === 'fail').length,
      },
    })
  })

  return app
}
