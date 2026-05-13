#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureCcConnectFork } from './cc-connect-installer.js'
import {
  mergeCcConnectConfigContent,
  mergeEnvContent,
  mergeHermesConfigContent,
  mergeOpenClawConfigContent,
} from './config-writers.js'
import { createConnectorPlan, type ShadowConnectorTarget } from './index.js'

interface CliOptions {
  command: 'plan' | 'connect'
  target: ShadowConnectorTarget
  serverUrl: string
  token: string
  openclawConfig?: string
  hermesHome?: string
  workDir?: string
  projectName?: string
  agentType?: string
  json: boolean
  force: boolean
  install: boolean
  start: boolean
  dryRun: boolean
}

const TARGETS = new Set(['openclaw', 'hermes', 'cc-connect'])

function readOption(args: string[], name: string): string | undefined {
  const prefix = `${name}=`
  const inline = args.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)
  const index = args.indexOf(name)
  if (index >= 0) return args[index + 1]
  return undefined
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name)
}

function usage(): string {
  return [
    'Usage:',
    '  shadowob-connector plan --target <openclaw|hermes|cc-connect> --server-url <url> --token <token>',
    '  shadowob-connector connect --target <openclaw|hermes|cc-connect> --server-url <url> --token <token>',
    '',
    'Options:',
    '  --openclaw-config <path> OpenClaw JSON config, default $OPENCLAW_CONFIG or ~/.shadowob/openclaw.json',
    '  --hermes-home <path>    Hermes config directory, default $HERMES_HOME or ~/.hermes',
    '  --work-dir <path>       cc-connect project work directory',
    '  --project-name <name>   cc-connect project name',
    '  --agent-type <type>     cc-connect agent type, default codex',
    '  --json                  Print the full plan as JSON',
    '  --force                 Overwrite target config files when needed',
    '  --install               Install the ShadowOB cc-connect fork when target is cc-connect',
    '  --no-install            Skip Hermes dependency install and plugin enablement',
    '  --start                 Start Hermes gateway or cc-connect after setup',
    '  --dry-run               Show what would be applied without changing files',
  ].join('\n')
}

function parseArgs(args: string[]): CliOptions {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(usage())
    process.exit(0)
  }

  const commandArg = args[0]
  const command = commandArg === 'connect' || commandArg === 'plan' ? commandArg : 'plan'
  const optionArgs = command === 'plan' ? args.filter((arg) => arg !== 'plan') : args.slice(1)

  const target = readOption(optionArgs, '--target') as ShadowConnectorTarget | undefined
  if (!target || !TARGETS.has(target)) {
    throw new Error('Missing or invalid --target')
  }
  const install =
    target === 'cc-connect'
      ? hasFlag(optionArgs, '--install')
      : !hasFlag(optionArgs, '--no-install')

  return {
    command,
    target,
    serverUrl: readOption(optionArgs, '--server-url') ?? 'https://shadowob.com',
    token: readOption(optionArgs, '--token') ?? '',
    openclawConfig: readOption(optionArgs, '--openclaw-config'),
    hermesHome: readOption(optionArgs, '--hermes-home'),
    workDir: readOption(optionArgs, '--work-dir'),
    projectName: readOption(optionArgs, '--project-name'),
    agentType: readOption(optionArgs, '--agent-type'),
    json: hasFlag(optionArgs, '--json'),
    force: hasFlag(optionArgs, '--force'),
    install,
    start: hasFlag(optionArgs, '--start'),
    dryRun: hasFlag(optionArgs, '--dry-run'),
  }
}

function printPlan(options: CliOptions): void {
  const plan = createConnectorPlan(options)
  if (options.json) {
    console.log(JSON.stringify(plan, null, 2))
    return
  }

  console.log(`# ${plan.title}`)
  console.log(plan.summary)
  console.log('')
  console.log('## Quick command')
  console.log(plan.quickCommand)
  for (const block of plan.configBlocks) {
    console.log('')
    console.log(`## ${block.label}`)
    console.log(block.content)
  }
}

function runShell(command: string, dryRun: boolean): void {
  if (dryRun) {
    console.log(`[dry-run] ${command}`)
    return
  }
  const result = spawnSync(command, { shell: true, stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status ?? 'unknown'}: ${command}`)
  }
}

function runBinary(binaryPath: string, args: string[], dryRun: boolean): void {
  const rendered = [binaryPath, ...args]
    .map((arg) => (/^[A-Za-z0-9_./:@=-]+$/.test(arg) ? arg : JSON.stringify(arg)))
    .join(' ')
  if (dryRun) {
    console.log(`[dry-run] ${rendered}`)
    return
  }
  const result = spawnSync(binaryPath, args, { stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status ?? 'unknown'}: ${rendered}`)
  }
}

function writeFile(path: string, content: string, dryRun: boolean): void {
  if (dryRun) {
    console.log(`[dry-run] write ${path}`)
    return
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content.endsWith('\n') ? content : `${content}\n`)
}

function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..')
}

function expandHome(value: string): string {
  return value.startsWith('~/') ? resolve(homedir(), value.slice(2)) : resolve(value)
}

function readExisting(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

function normalizeServerUrl(value: string): string {
  const trimmed = value.trim() || 'https://shadowob.com'
  return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed.replace(/\/$/, '')
}

function hermesPluginSource(): string {
  const candidates = [
    resolve(packageRoot(), 'hermes-shadowob-plugin'),
    resolve(process.cwd(), 'packages/connector/hermes-shadowob-plugin'),
  ]
  const found = candidates.find((candidate) => existsSync(candidate))
  if (!found) throw new Error('Cannot find bundled hermes-shadowob-plugin directory')
  return found
}

function applyOpenClaw(options: CliOptions): void {
  const plan = createConnectorPlan(options)
  const configPath = expandHome(
    options.openclawConfig ?? process.env.OPENCLAW_CONFIG ?? '~/.shadowob/openclaw.json',
  )

  console.log('Applying: Install plugin')
  runShell('openclaw plugins install @shadowob/openclaw-shadowob', options.dryRun)

  console.log(`Applying: Merge OpenClaw config ${configPath}`)
  const next = mergeOpenClawConfigContent(readExisting(configPath), {
    token: options.token,
    serverUrl: normalizeServerUrl(options.serverUrl),
  })
  writeFile(configPath, next, options.dryRun)

  const restart = plan.commands.find((step) => step.label === 'Restart gateway')
  if (restart) {
    console.log(`Applying: ${restart.label}`)
    runShell(restart.command, options.dryRun)
  }
}

function applyHermes(options: CliOptions): void {
  const plan = createConnectorPlan(options)
  const hermesDir = expandHome(options.hermesHome ?? process.env.HERMES_HOME ?? '~/.hermes')
  const pluginTarget = resolve(hermesDir, 'plugins/shadowob')
  const envPath = resolve(hermesDir, '.env')
  const configPath = resolve(hermesDir, 'config.yaml')
  const envBlock = plan.configBlocks.find((block) => block.label === '~/.hermes/.env')

  if (!envBlock) throw new Error('Hermes plan is missing config blocks')

  if (options.dryRun) {
    console.log(`[dry-run] copy ${hermesPluginSource()} -> ${pluginTarget}`)
  } else {
    mkdirSync(resolve(hermesDir, 'plugins'), { recursive: true })
    cpSync(hermesPluginSource(), pluginTarget, { recursive: true, force: true })
  }
  const nextEnv = options.force
    ? envBlock.content
    : mergeEnvContent(readExisting(envPath), {
        token: options.token,
        serverUrl: normalizeServerUrl(options.serverUrl),
      })
  writeFile(envPath, nextEnv, options.dryRun)

  const nextConfig = mergeHermesConfigContent(options.force ? '' : readExisting(configPath), {
    token: options.token,
    serverUrl: normalizeServerUrl(options.serverUrl),
  })
  writeFile(configPath, nextConfig, options.dryRun)

  if (options.install) {
    runShell(
      `python -m pip install -r "${resolve(pluginTarget, 'requirements.txt')}"`,
      options.dryRun,
    )
    runShell('hermes plugins enable shadowob', options.dryRun)
  }

  if (options.start) {
    runShell('hermes gateway', options.dryRun)
  }
}

async function applyCcConnect(options: CliOptions): Promise<void> {
  const plan = createConnectorPlan(options)
  const configBlock = plan.configBlocks.find((block) => block.label === '~/.cc-connect/config.toml')
  if (!configBlock) throw new Error('cc-connect plan is missing config block')

  const configPath = resolve(homedir(), '.cc-connect/config.toml')
  const nextConfig = options.force
    ? configBlock.content
    : mergeCcConnectConfigContent(readExisting(configPath), {
        token: options.token,
        serverUrl: normalizeServerUrl(options.serverUrl),
        projectName: options.projectName?.trim() || 'shadow-buddy',
        workDir: options.workDir?.trim() || '.',
        agentType: options.agentType?.trim() || 'codex',
      })
  writeFile(configPath, nextConfig, options.dryRun)

  let binaryPath: string | undefined
  if (options.install || options.start) {
    const installed = await ensureCcConnectFork({
      dryRun: options.dryRun,
      log: (message) => console.log(message),
    })
    binaryPath = installed.binaryPath
    console.log(`cc-connect binary: ${binaryPath}`)
  }

  if (options.start) {
    runBinary(binaryPath ?? 'cc-connect', [], options.dryRun)
  }
}

async function connect(options: CliOptions): Promise<void> {
  if (options.target === 'openclaw') {
    applyOpenClaw(options)
    return
  }
  if (options.target === 'hermes') {
    applyHermes(options)
    return
  }
  await applyCcConnect(options)
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (options.command === 'connect') {
    await connect(options)
  } else {
    printPlan(options)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  console.error('')
  console.error(usage())
  process.exit(1)
})
