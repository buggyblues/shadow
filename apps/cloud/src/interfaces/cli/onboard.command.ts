/**
 * CLI: shadowob-cloud onboard — guided setup: check/install dependencies, init config, launch console.
 */

import { execFile, spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { platform } from 'node:os'
import { createInterface } from 'node:readline'
import { promisify } from 'node:util'
import { Command } from 'commander'
import type { ServiceContainer } from '../../services/container.js'

const execFileAsync = promisify(execFile)

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate)
    return true
  } catch {
    return false
  }
}

async function isInstalled(cmd: string): Promise<boolean> {
  try {
    await execFileAsync('which', [cmd], { encoding: 'utf-8' })
    return true
  } catch {
    return false
  }
}

async function hasBrew(): Promise<boolean> {
  return await isInstalled('brew')
}

function runShellInherited(cmd: string, timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, { shell: true, stdio: 'inherit' })
    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error(`command timed out after ${timeout}ms`))
    }, timeout)
    proc.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`command exited with code ${code ?? 1}`))
    })
  })
}

async function install(
  logger: ServiceContainer['logger'],
  name: string,
  cmd: string,
): Promise<boolean> {
  logger.step(`Installing ${name}...`)
  logger.dim(`  $ ${cmd}`)
  try {
    await runShellInherited(cmd, 120_000)
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
      const brew = isMac && (await hasBrew())

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
        if (await isInstalled(dep.cmd)) {
          container.logger.success(`${dep.name} — installed`)
        } else if (dep.fixCmd) {
          container.logger.warn(`${dep.name} — not found, installing...`)
          const ok = await install(container.logger, dep.name, dep.fixCmd)
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

      if (options.local || !(await container.k8s.isKubeReachable())) {
        if (!(await isInstalled('kind'))) {
          container.logger.warn('kind is not installed — skipping local cluster setup')
        } else if (await container.k8s.kindClusterExists()) {
          container.logger.success('Local kind cluster already exists')
        } else {
          const shouldCreate = options.local
            ? 'y'
            : await ask('  No reachable cluster found. Create a local kind cluster? [Y/n] ')

          if (!shouldCreate || shouldCreate.toLowerCase() !== 'n') {
            container.logger.step('Creating local kind cluster...')
            try {
              await container.k8s.createKindCluster()
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
      if (await pathExists(configPath)) {
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
