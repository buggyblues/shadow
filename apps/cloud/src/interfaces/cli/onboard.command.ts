/**
 * CLI: shadowob-cloud onboard — guided setup: check/install dependencies, init config, launch console.
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { platform } from 'node:os'
import { createInterface } from 'node:readline'
import { Command } from 'commander'
import type { ServiceContainer } from '../../services/container.js'

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

function isInstalled(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] })
    return true
  } catch {
    return false
  }
}

function hasBrew(): boolean {
  return isInstalled('brew')
}

function install(logger: ServiceContainer['logger'], name: string, cmd: string): boolean {
  logger.step(`Installing ${name}...`)
  logger.dim(`  $ ${cmd}`)
  try {
    execSync(cmd, { encoding: 'utf-8', timeout: 120_000, stdio: 'inherit' })
    logger.success(`${name} installed`)
    return true
  } catch {
    logger.error(`Failed to install ${name}. Please install manually.`)
    return false
  }
}

export function createOnboardCommand(container: ServiceContainer) {
  return new Command('onboard')
    .description('Guided setup: install dependencies, init config, and launch console')
    .option('--local', 'Set up a local kind cluster for development')
    .option('--skip-console', 'Do not launch console after setup')
    .action(async (options: { local?: boolean; skipConsole?: boolean }) => {
      const isMac = platform() === 'darwin'
      const brew = isMac && hasBrew()

      console.log()
      container.logger.step('Welcome to Shadow Cloud onboarding!')
      console.log()

      // ── Step 1: Check & install dependencies ──────────────────
      container.logger.step('Step 1/4 — Checking dependencies...')
      console.log()

      const deps: Array<{
        name: string
        cmd: string
        required: boolean
        fixCmd?: string
        checkFn?: () => boolean
      }> = [
        {
          name: 'Docker',
          cmd: 'docker',
          required: true,
          fixCmd: brew ? 'brew install --cask docker' : undefined,
        },
        {
          name: 'kubectl',
          cmd: 'kubectl',
          required: true,
          fixCmd: brew ? 'brew install kubectl' : undefined,
        },
        {
          name: 'Pulumi',
          cmd: 'pulumi',
          required: true,
          fixCmd: brew ? 'brew install pulumi' : 'curl -fsSL https://get.pulumi.com | sh',
        },
        {
          name: 'kind',
          cmd: 'kind',
          required: false,
          fixCmd: brew ? 'brew install kind' : undefined,
        },
      ]

      let allOk = true
      for (const dep of deps) {
        if (isInstalled(dep.cmd)) {
          container.logger.success(`${dep.name} — installed`)
        } else if (dep.fixCmd) {
          container.logger.warn(`${dep.name} — not found, installing...`)
          const ok = install(container.logger, dep.name, dep.fixCmd)
          if (!ok && dep.required) {
            allOk = false
          }
        } else {
          const level = dep.required ? 'error' : 'warn'
          container.logger[level](`${dep.name} — not found${dep.required ? '' : ' (optional)'}`)
          if (dep.required) allOk = false
        }
      }

      if (!allOk) {
        console.log()
        container.logger.error(
          'Some required dependencies could not be installed. Please install them manually and re-run.',
        )
        process.exit(1)
      }

      console.log()
      container.logger.success('All required dependencies are ready')
      console.log()

      // ── Step 2: Local cluster setup ───────────────────────────
      container.logger.step('Step 2/4 — Cluster setup...')
      console.log()

      if (options.local || !container.k8s.isKubeReachable()) {
        if (!isInstalled('kind')) {
          container.logger.warn('kind is not installed — skipping local cluster setup')
        } else if (container.k8s.kindClusterExists()) {
          container.logger.success('Local kind cluster already exists')
        } else {
          const shouldCreate = options.local
            ? 'y'
            : await ask('  No reachable cluster found. Create a local kind cluster? [Y/n] ')

          if (!shouldCreate || shouldCreate.toLowerCase() !== 'n') {
            container.logger.step('Creating local kind cluster...')
            try {
              container.k8s.createKindCluster()
              container.logger.success('Local kind cluster created')
            } catch {
              container.logger.error(
                'Failed to create kind cluster. You can create one manually: kind create cluster --name shadowob-cloud',
              )
            }
          }
        }
      } else {
        container.logger.success('Kubernetes cluster is reachable')
      }

      console.log()

      // ── Step 3: Config initialization ─────────────────────────
      container.logger.step('Step 3/4 — Configuration...')
      console.log()

      const configPath = 'shadowob-cloud.json'
      if (existsSync(configPath)) {
        container.logger.success(`Config file found: ${configPath}`)
      } else {
        const answer = await ask(`  No ${configPath} found. Create one from template? [Y/n] `)
        if (!answer || answer.toLowerCase() !== 'n') {
          const { createInitCommand } = await import('./init.command.js')
          const init = createInitCommand(container)
          await init.parseAsync(['--quick'], { from: 'user' })
        } else {
          container.logger.dim(`  Run 'shadowob-cloud init' later to create a config file`)
        }
      }

      console.log()

      // ── Step 4: Launch console ────────────────────────────────
      container.logger.step('Step 4/4 — Launch...')
      console.log()

      if (options.skipConsole) {
        container.logger.success('Onboarding complete!')
        container.logger.dim("  Run 'shadowob-cloud console' to start the dashboard")
        return
      }

      container.logger.success('Onboarding complete! Starting console...')
      console.log()

      const { createConsoleCommand } = await import('./dashboard.command.js')
      const console_ = createConsoleCommand(container)
      await console_.parseAsync([], { from: 'user' })
    })
}
