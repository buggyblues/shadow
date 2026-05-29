#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { arch, homedir, hostname, platform } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseToml } from 'smol-toml'
import { parse as parseYaml } from 'yaml'
import { ensureCcConnectFork, getCcConnectBinaryStatus } from './cc-connect-installer.js'
import {
  mergeCcConnectConfigContent,
  mergeEnvContent,
  mergeHermesConfigContent,
  mergeOpenClawConfigContent,
} from './config-writers.js'
import { createConnectorPlan, type ShadowConnectorTarget } from './index.js'

interface CliOptions {
  command: 'plan' | 'connect' | 'update' | 'doctor' | 'fix' | 'status' | 'scan' | 'daemon'
  target?: ShadowConnectorTarget
  serverUrl: string
  token: string
  apiKey?: string
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
  once: boolean
  pollIntervalMs: number
}

const TARGETS = new Set(['openclaw', 'hermes', 'cc-connect'])
const COMMANDS = new Set(['plan', 'connect', 'update', 'doctor', 'fix', 'status', 'scan', 'daemon'])
const ALL_TARGETS = ['openclaw', 'hermes', 'cc-connect'] as const
const SHADOW_CLI_PACKAGE = '@shadowob/cli@latest'
const SHADOW_CONNECTOR_PACKAGE = '@shadowob/connector@latest'
const DEFAULT_OPENCLAW_CONFIG = '~/.openclaw/openclaw.json'
const LEGACY_OPENCLAW_CONFIG = '~/.shadowob/openclaw.json'
const DEFAULT_DAEMON_POLL_INTERVAL_MS = 5_000

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
    '  shadowob-connector update --target <openclaw|hermes|cc-connect> --server-url <url> --token <token>',
    '  shadowob-connector fix --target <openclaw|hermes|cc-connect> --server-url <url> --token <token>',
    '  shadowob-connector scan [--target <openclaw|hermes|cc-connect>] [--server-url <url>] [--token <token>]',
    '  shadowob-connector --daemon --server-url <url> --api-key <machine-key>',
    '  shadowob-connector daemon --server-url <url> --api-key <machine-key>',
    '  shadowob-connector doctor [--target <openclaw|hermes|cc-connect>]',
    '  shadowob-connector status [--target <openclaw|hermes|cc-connect>]',
    '',
    'Options:',
    '  --server-url <url>      Shadow server URL, default https://shadowob.com',
    '  --api-key <key>         Connector daemon machine key',
    '  --openclaw-config <path> OpenClaw JSON config, default $OPENCLAW_CONFIG or ~/.openclaw/openclaw.json',
    '  --hermes-home <path>    Hermes config directory, default $HERMES_HOME or ~/.hermes',
    '  --work-dir <path>       cc-connect project work directory',
    '  --project-name <name>   cc-connect project name',
    '  --agent-type <type>     cc-connect agent type, default codex',
    '  --json                  Print the full plan as JSON',
    '  --force                 Overwrite target config files when needed',
    '  --install               Install connector runtime dependencies',
    '  --no-install            Skip connector runtime dependency installation',
    '  --start                 Start Hermes gateway or cc-connect after setup',
    '  --dry-run               Show what would be applied without changing files',
    '  --once                  Daemon mode: heartbeat, process one job batch, then exit',
    '  --poll-interval-ms <n>  Daemon mode polling interval, default 5000',
  ].join('\n')
}

function requireTarget(options: CliOptions): ShadowConnectorTarget {
  if (!options.target) throw new Error('Missing or invalid --target')
  return options.target
}

function parseArgs(args: string[]): CliOptions {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(usage())
    process.exit(0)
  }

  const commandArg = args[0]
  const hasCommand = commandArg ? COMMANDS.has(commandArg) : false
  const command = hasFlag(args, '--daemon')
    ? 'daemon'
    : hasCommand
      ? (commandArg as CliOptions['command'])
      : 'plan'
  const optionArgs = hasCommand ? args.slice(1) : args

  const target = readOption(optionArgs, '--target') as ShadowConnectorTarget | undefined
  if (target && !TARGETS.has(target)) {
    throw new Error('Missing or invalid --target')
  }
  if (
    !target &&
    command !== 'doctor' &&
    command !== 'status' &&
    command !== 'scan' &&
    command !== 'daemon'
  ) {
    throw new Error('Missing or invalid --target')
  }
  const install =
    command === 'fix' || command === 'update'
      ? !hasFlag(optionArgs, '--no-install')
      : target === 'cc-connect'
        ? hasFlag(optionArgs, '--install')
        : !hasFlag(optionArgs, '--no-install')

  return {
    command,
    target,
    serverUrl: readOption(optionArgs, '--server-url') ?? 'https://shadowob.com',
    token: readOption(optionArgs, '--token') ?? '',
    apiKey: readOption(optionArgs, '--api-key'),
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
    once: hasFlag(optionArgs, '--once'),
    pollIntervalMs:
      Number.parseInt(readOption(optionArgs, '--poll-interval-ms') ?? '', 10) ||
      DEFAULT_DAEMON_POLL_INTERVAL_MS,
  }
}

function printPlan(options: CliOptions): void {
  const target = requireTarget(options)
  const plan = createConnectorPlan({ ...options, target })
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

function resolveOpenClawConfigPath(options: CliOptions): string {
  return expandHome(
    options.openclawConfig ??
      process.env.OPENCLAW_CONFIG ??
      process.env.OPENCLAW_CONFIG_PATH ??
      DEFAULT_OPENCLAW_CONFIG,
  )
}

function normalizeServerUrl(value: string): string {
  const trimmed = value.trim() || 'https://shadowob.com'
  return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed.replace(/\/$/, '')
}

function shellQuote(value: string): string {
  if (!value) return "''"
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function tokenForCommand(options: CliOptions): string {
  return options.token.trim() || '<BUDDY_TOKEN>'
}

function connectorCommand(
  command: 'connect' | 'update' | 'fix' | 'doctor' | 'status',
  target: ShadowConnectorTarget,
  options: CliOptions,
  extras: string[] = [],
): string {
  const parts = ['shadowob-connector', command, '--target', target]
  if (command !== 'doctor' && command !== 'status') {
    parts.push(
      '--server-url',
      normalizeServerUrl(options.serverUrl),
      '--token',
      tokenForCommand(options),
    )
  }
  parts.push(...extras)
  return parts.map(shellQuote).join(' ')
}

function commandExists(command: string): boolean {
  const result = spawnSync(command, ['--version'], { stdio: 'ignore' })
  return result.status === 0
}

function writeExecutable(path: string, content: string, dryRun: boolean): void {
  writeFile(path, content, dryRun)
  if (dryRun) return
  chmodSync(path, 0o755)
}

function ensureNpxShim(options: {
  command: string
  packageSpec: string
  binaryName: string
  dryRun: boolean
}): void {
  if (commandExists(options.command)) return
  const localBin = resolve(homedir(), '.local/bin')
  const target = resolve(localBin, options.command)
  const content = [
    '#!/usr/bin/env sh',
    `exec npx -y ${options.packageSpec} ${options.binaryName === options.command ? '' : options.binaryName} "$@"`,
    '',
  ]
    .join('\n')
    .replace('  "$@"', ' "$@"')
  console.log(`Applying: Install ${options.command} shim ${target}`)
  writeExecutable(target, content, options.dryRun)
  const pathEntries = (process.env.PATH ?? '').split(':')
  if (!pathEntries.includes(localBin)) {
    console.log(`Note: add ${localBin} to PATH so agents can run ${options.command}`)
  }
}

function shadowCliProfileName(options: CliOptions): string {
  return options.projectName?.trim() || 'shadow-buddy'
}

function writeShadowCliProfile(options: CliOptions): void {
  const configPath = resolve(homedir(), '.shadowob/shadowob.config.json')
  const current = (() => {
    try {
      return JSON.parse(readExisting(configPath)) as {
        profiles?: Record<string, { serverUrl: string; token: string }>
        currentProfile?: string
      }
    } catch {
      return {}
    }
  })()
  const profileName = shadowCliProfileName(options)
  const next = {
    ...current,
    profiles: {
      ...(current.profiles ?? {}),
      [profileName]: {
        serverUrl: normalizeServerUrl(options.serverUrl),
        token: options.token,
      },
    },
    currentProfile: profileName,
  }
  console.log(`Applying: Configure Shadow CLI profile ${profileName}`)
  writeFile(configPath, JSON.stringify(next, null, 2), options.dryRun)
}

function shadowobSkillMarkdown(): string {
  const candidates = [
    resolve(packageRoot(), 'skills/shadowob/SKILL.md'),
    resolve(process.cwd(), 'skills/shadowob-cli/SKILL.md'),
    resolve(process.cwd(), 'packages/openclaw-shadowob/skills/shadowob/SKILL.md'),
  ]
  let currentDir = packageRoot()
  while (true) {
    candidates.push(resolve(currentDir, 'skills/shadowob-cli/SKILL.md'))
    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) break
    currentDir = parentDir
  }
  const found = candidates.find((candidate) => existsSync(candidate))
  if (!found) throw new Error('Cannot find bundled Shadow CLI skill')
  return readFileSync(found, 'utf8')
}

function shadowobSkillTargets(options: CliOptions): string[] {
  const hermesDir = expandHome(options.hermesHome ?? process.env.HERMES_HOME ?? '~/.hermes')
  return Array.from(
    new Set([
      resolve(homedir(), '.shadowob/skills/shadowob/SKILL.md'),
      resolve(homedir(), '.agents/skills/shadowob/SKILL.md'),
      resolve(homedir(), '.codex/skills/shadowob/SKILL.md'),
      resolve(homedir(), '.claude/skills/shadowob/SKILL.md'),
      resolve(homedir(), '.gemini/skills/shadowob/SKILL.md'),
      resolve(homedir(), '.opencode/skills/shadowob/SKILL.md'),
      resolve(homedir(), '.openclaw/skills/shadowob/SKILL.md'),
      resolve(hermesDir, 'skills/shadowob/SKILL.md'),
    ]),
  )
}

function installShadowCliAndSkills(options: CliOptions): void {
  ensureNpxShim({
    command: 'shadowob',
    packageSpec: SHADOW_CLI_PACKAGE,
    binaryName: 'shadowob',
    dryRun: options.dryRun,
  })
  ensureNpxShim({
    command: 'shadowob-connector',
    packageSpec: SHADOW_CONNECTOR_PACKAGE,
    binaryName: 'shadowob-connector',
    dryRun: options.dryRun,
  })
  const skill = shadowobSkillMarkdown()
  for (const target of shadowobSkillTargets(options)) {
    console.log(`Applying: Install Shadow skill ${target}`)
    writeFile(target, skill, options.dryRun)
  }
  writeShadowCliProfile(options)
}

type DiagnosticTarget = 'common' | ShadowConnectorTarget
type DiagnosticStatus = 'ok' | 'warn' | 'fail'

interface DiagnosticCheck {
  target: DiagnosticTarget
  status: DiagnosticStatus
  label: string
  detail?: string
  fix?: string
}

function check(
  target: DiagnosticTarget,
  status: DiagnosticStatus,
  label: string,
  detail?: string,
  fix?: string,
): DiagnosticCheck {
  return { target, status, label, detail, fix }
}

function selectedTargets(options: CliOptions): ShadowConnectorTarget[] {
  return options.target ? [options.target] : [...ALL_TARGETS]
}

function parseJsonFile(
  path: string,
  label: string,
): { value?: Record<string, unknown>; error?: string } {
  try {
    const content = readExisting(path)
    if (!content.trim()) return { error: `${label} config is empty` }
    const parsed = JSON.parse(content) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: `${label} config must be an object` }
    }
    return { value: parsed as Record<string, unknown> }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function diagnoseCommon(options: CliOptions): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [
    check(
      'common',
      commandExists('shadowob') ? 'ok' : 'warn',
      'Shadow CLI command',
      commandExists('shadowob') ? 'shadowob is on PATH' : 'shadowob is not on PATH',
      'Run fix/update to install the ~/.local/bin/shadowob shim.',
    ),
    check(
      'common',
      commandExists('shadowob-connector') ? 'ok' : 'warn',
      'Connector command',
      commandExists('shadowob-connector')
        ? 'shadowob-connector is on PATH'
        : 'shadowob-connector is not on PATH',
      'Run fix/update to install the ~/.local/bin/shadowob-connector shim.',
    ),
  ]

  const profilePath = resolve(homedir(), '.shadowob/shadowob.config.json')
  if (!existsSync(profilePath)) {
    checks.push(
      check(
        'common',
        'warn',
        'Shadow CLI profile',
        `${profilePath} does not exist`,
        'Run fix/update with --token to write the Buddy profile.',
      ),
    )
  } else {
    const parsed = parseJsonFile(profilePath, 'Shadow CLI')
    const profiles = asObject(parsed.value?.profiles)
    const profileName = shadowCliProfileName(options)
    checks.push(
      check(
        'common',
        parsed.error ? 'fail' : profiles[profileName] ? 'ok' : 'warn',
        'Shadow CLI profile',
        parsed.error ??
          (profiles[profileName]
            ? `profile ${profileName} exists`
            : `profile ${profileName} is missing`),
        'Run fix/update with --token to write the Buddy profile.',
      ),
    )
  }

  const skillTargets = shadowobSkillTargets(options)
  const installed = skillTargets.filter((target) => existsSync(target)).length
  checks.push(
    check(
      'common',
      installed > 0 ? 'ok' : 'warn',
      'Shadow skill files',
      `${installed}/${skillTargets.length} common skill locations contain shadowob/SKILL.md`,
      'Run fix/update to install the official Shadow skill files.',
    ),
  )

  return checks
}

function diagnoseOpenClaw(options: CliOptions): DiagnosticCheck[] {
  const configPath = resolveOpenClawConfigPath(options)
  const checks: DiagnosticCheck[] = [
    check(
      'openclaw',
      commandExists('openclaw') ? 'ok' : 'warn',
      'OpenClaw command',
      commandExists('openclaw') ? 'openclaw is on PATH' : 'openclaw is not on PATH',
      'Install OpenClaw before starting the gateway.',
    ),
  ]

  if (!existsSync(configPath)) {
    checks.push(
      check(
        'openclaw',
        'fail',
        'OpenClaw config',
        `${configPath} does not exist`,
        'Run fix/update.',
      ),
    )
    return checks
  }

  const parsed = parseJsonFile(configPath, 'OpenClaw')
  if (parsed.error) {
    checks.push(
      check(
        'openclaw',
        'fail',
        'OpenClaw config',
        parsed.error,
        'Fix the JSON or run fix/update with --force.',
      ),
    )
    return checks
  }

  const root = parsed.value ?? {}
  const channels = asObject(root.channels)
  const shadow = asObject(channels.shadowob)
  const plugins = asObject(root.plugins)
  const pluginEntries = asObject(plugins.entries)
  checks.push(
    check(
      'openclaw',
      typeof shadow.token === 'string' && shadow.token.length > 0 ? 'ok' : 'fail',
      'OpenClaw Shadow token',
      typeof shadow.token === 'string' && shadow.token.length > 0
        ? 'channels.shadowob.token is set'
        : 'channels.shadowob.token is missing',
      'Run fix/update with --token.',
    ),
    check(
      'openclaw',
      typeof shadow.serverUrl === 'string' && shadow.serverUrl.length > 0 ? 'ok' : 'fail',
      'OpenClaw Shadow server URL',
      typeof shadow.serverUrl === 'string' && shadow.serverUrl.length > 0
        ? `channels.shadowob.serverUrl=${shadow.serverUrl}`
        : 'channels.shadowob.serverUrl is missing',
      'Run fix/update with --server-url.',
    ),
    check(
      'openclaw',
      asObject(pluginEntries['openclaw-shadowob']).enabled === true ? 'ok' : 'warn',
      'OpenClaw Shadow plugin entry',
      asObject(pluginEntries['openclaw-shadowob']).enabled === true
        ? 'openclaw-shadowob plugin entry is enabled'
        : 'openclaw-shadowob plugin entry is missing or disabled',
      'Run fix/update.',
    ),
  )
  return checks
}

function diagnoseHermes(options: CliOptions): DiagnosticCheck[] {
  const hermesDir = expandHome(options.hermesHome ?? process.env.HERMES_HOME ?? '~/.hermes')
  const pluginTarget = resolve(hermesDir, 'plugins/shadowob')
  const envPath = resolve(hermesDir, '.env')
  const configPath = resolve(hermesDir, 'config.yaml')
  const checks: DiagnosticCheck[] = [
    check(
      'hermes',
      commandExists('hermes') ? 'ok' : 'warn',
      'Hermes command',
      commandExists('hermes') ? 'hermes is on PATH' : 'hermes is not on PATH',
      'Install Hermes before starting the gateway.',
    ),
    check(
      'hermes',
      existsSync(pluginTarget) ? 'ok' : 'fail',
      'Hermes Shadow plugin',
      existsSync(pluginTarget) ? `${pluginTarget} exists` : `${pluginTarget} is missing`,
      'Run fix/update.',
    ),
  ]

  const env = readExisting(envPath)
  checks.push(
    check(
      'hermes',
      env.includes('SHADOW_TOKEN=') && env.includes('SHADOW_BASE_URL=') ? 'ok' : 'fail',
      'Hermes environment',
      existsSync(envPath)
        ? 'SHADOW_TOKEN and SHADOW_BASE_URL are present'
        : `${envPath} does not exist`,
      'Run fix/update with --token and --server-url.',
    ),
  )

  if (!existsSync(configPath)) {
    checks.push(
      check('hermes', 'fail', 'Hermes config', `${configPath} does not exist`, 'Run fix/update.'),
    )
    return checks
  }

  try {
    const parsed = parseYaml(readExisting(configPath)) as unknown
    const root = asObject(parsed)
    const shadow = asObject(asObject(root.platforms).shadowob)
    checks.push(
      check(
        'hermes',
        shadow.enabled === true && typeof shadow.token === 'string' ? 'ok' : 'fail',
        'Hermes Shadow platform',
        shadow.enabled === true && typeof shadow.token === 'string'
          ? 'platforms.shadowob is enabled'
          : 'platforms.shadowob is missing token or enabled=true',
        'Run fix/update.',
      ),
    )
  } catch (error) {
    checks.push(
      check(
        'hermes',
        'fail',
        'Hermes config',
        error instanceof Error ? error.message : String(error),
        'Fix the YAML or run fix/update with --force.',
      ),
    )
  }
  return checks
}

function diagnoseCcConnect(options: CliOptions): DiagnosticCheck[] {
  const configPath = resolve(homedir(), '.cc-connect/config.toml')
  const binary = getCcConnectBinaryStatus()
  const checks: DiagnosticCheck[] = [
    check(
      'cc-connect',
      binary.usable ? 'ok' : 'warn',
      'cc-connect Shadow fork',
      binary.usable
        ? `${binary.binaryPath} passes version check`
        : `${binary.binaryPath} is missing or does not match the pinned Shadow fork`,
      'Run fix/update with --install.',
    ),
  ]

  if (!existsSync(configPath)) {
    checks.push(
      check(
        'cc-connect',
        'fail',
        'cc-connect config',
        `${configPath} does not exist`,
        'Run fix/update.',
      ),
    )
    return checks
  }

  try {
    const root = parseToml(readExisting(configPath)) as Record<string, unknown>
    const projects = Array.isArray(root.projects) ? root.projects : []
    const projectName = options.projectName?.trim() || 'shadow-buddy'
    const workDir = options.workDir?.trim() || '.'
    const project =
      projects.find((item) => asObject(item).name === projectName) ??
      projects.find((item) => asObject(asObject(asObject(item).agent).options).work_dir === workDir)
    const projectPlatforms = asObject(project).platforms
    const platforms = Array.isArray(projectPlatforms) ? projectPlatforms : []
    const shadow = platforms.find((item) => asObject(item).type === 'shadowob')
    const shadowOptions = asObject(asObject(shadow).options)
    checks.push(
      check(
        'cc-connect',
        project ? 'ok' : 'fail',
        'cc-connect project',
        project ? `project ${projectName} is configured` : `project ${projectName} is missing`,
        'Run fix/update with --project-name and --work-dir.',
      ),
      check(
        'cc-connect',
        typeof shadowOptions.token === 'string' && typeof shadowOptions.server_url === 'string'
          ? 'ok'
          : 'fail',
        'cc-connect Shadow platform',
        typeof shadowOptions.token === 'string' && typeof shadowOptions.server_url === 'string'
          ? 'shadowob platform has token and server_url'
          : 'shadowob platform is missing token or server_url',
        'Run fix/update with --token and --server-url.',
      ),
    )
  } catch (error) {
    checks.push(
      check(
        'cc-connect',
        'fail',
        'cc-connect config',
        error instanceof Error ? error.message : String(error),
        'Fix the TOML or run fix/update with --force.',
      ),
    )
  }
  return checks
}

function diagnostics(options: CliOptions): DiagnosticCheck[] {
  const checks = diagnoseCommon(options)
  for (const target of selectedTargets(options)) {
    if (target === 'openclaw') checks.push(...diagnoseOpenClaw(options))
    if (target === 'hermes') checks.push(...diagnoseHermes(options))
    if (target === 'cc-connect') checks.push(...diagnoseCcConnect(options))
  }
  return checks
}

function printDiagnostics(options: CliOptions, mode: 'doctor' | 'status'): boolean {
  const checks = diagnostics(options)
  if (options.json) {
    console.log(
      JSON.stringify({ ok: !checks.some((item) => item.status === 'fail'), checks }, null, 2),
    )
    return !checks.some((item) => item.status === 'fail')
  }

  console.log(`# Connector ${mode}`)
  for (const item of checks) {
    const marker = item.status === 'ok' ? 'OK' : item.status === 'warn' ? 'WARN' : 'FAIL'
    console.log(
      `[${marker}] ${item.target}: ${item.label}${item.detail ? ` - ${item.detail}` : ''}`,
    )
    if (mode === 'doctor' && item.status !== 'ok' && item.fix) {
      console.log(`       fix: ${item.fix}`)
    }
  }
  return !checks.some((item) => item.status === 'fail')
}

interface ScanResult {
  target: ShadowConnectorTarget
  detected: boolean
  evidence: string[]
  configPath?: string
  connectCommand: string
  updateCommand: string
  doctorCommand: string
  statusCommand: string
}

function firstExistingPath(paths: string[]): string | undefined {
  return paths.find((path) => existsSync(path))
}

function openClawConfigCandidates(options: CliOptions): string[] {
  return Array.from(
    new Set(
      [
        options.openclawConfig,
        process.env.OPENCLAW_CONFIG,
        process.env.OPENCLAW_CONFIG_PATH,
        DEFAULT_OPENCLAW_CONFIG,
        LEGACY_OPENCLAW_CONFIG,
      ]
        .filter((value): value is string => !!value?.trim())
        .map(expandHome),
    ),
  )
}

function ccConnectScanExtras(options: CliOptions): string[] {
  const configPath = resolve(homedir(), '.cc-connect/config.toml')
  const fallback = [
    '--work-dir',
    options.workDir?.trim() || '.',
    '--project-name',
    options.projectName?.trim() || 'shadow-buddy',
    '--agent-type',
    options.agentType?.trim() || 'codex',
  ]
  if (!existsSync(configPath)) return fallback

  try {
    const root = parseToml(readExisting(configPath)) as Record<string, unknown>
    const projects = Array.isArray(root.projects) ? root.projects : []
    const configuredProject =
      projects.find((project) => {
        const platformsValue = asObject(project).platforms
        const platforms = Array.isArray(platformsValue) ? platformsValue : []
        return platforms.some((platform) => asObject(platform).type === 'shadowob')
      }) ?? projects[0]
    const project = asObject(configuredProject)
    const agent = asObject(project.agent)
    const agentOptions = asObject(agent.options)
    return [
      '--work-dir',
      options.workDir?.trim() ||
        (typeof agentOptions.work_dir === 'string' ? agentOptions.work_dir : '.'),
      '--project-name',
      options.projectName?.trim() ||
        (typeof project.name === 'string' ? project.name : 'shadow-buddy'),
      '--agent-type',
      options.agentType?.trim() || (typeof agent.type === 'string' ? agent.type : 'codex'),
    ]
  } catch {
    return fallback
  }
}

function scanOpenClaw(options: CliOptions): ScanResult {
  const configPath = firstExistingPath(openClawConfigCandidates(options))
  const evidence: string[] = []
  if (commandExists('openclaw')) evidence.push('openclaw command is on PATH')
  if (configPath) evidence.push(`config found at ${configPath}`)
  const detected = evidence.length > 0
  return {
    target: 'openclaw',
    detected,
    evidence,
    configPath,
    connectCommand: connectorCommand('connect', 'openclaw', options),
    updateCommand: connectorCommand('update', 'openclaw', options),
    doctorCommand: connectorCommand('doctor', 'openclaw', options),
    statusCommand: connectorCommand('status', 'openclaw', options),
  }
}

function scanHermes(options: CliOptions): ScanResult {
  const hermesDir = expandHome(options.hermesHome ?? process.env.HERMES_HOME ?? '~/.hermes')
  const configPath = resolve(hermesDir, 'config.yaml')
  const evidence: string[] = []
  if (commandExists('hermes')) evidence.push('hermes command is on PATH')
  if (existsSync(configPath)) evidence.push(`config found at ${configPath}`)
  if (existsSync(resolve(hermesDir, 'plugins/shadowob'))) {
    evidence.push(`shadowob plugin found under ${resolve(hermesDir, 'plugins/shadowob')}`)
  }
  return {
    target: 'hermes',
    detected: evidence.length > 0,
    evidence,
    configPath: existsSync(configPath) ? configPath : undefined,
    connectCommand: connectorCommand('connect', 'hermes', options),
    updateCommand: connectorCommand('update', 'hermes', options),
    doctorCommand: connectorCommand('doctor', 'hermes', options),
    statusCommand: connectorCommand('status', 'hermes', options),
  }
}

function scanCcConnect(options: CliOptions): ScanResult {
  const configPath = resolve(homedir(), '.cc-connect/config.toml')
  const binary = getCcConnectBinaryStatus()
  const evidence: string[] = []
  if (commandExists('cc-connect')) evidence.push('cc-connect command is on PATH')
  if (binary.usable) evidence.push(`Shadow fork binary found at ${binary.binaryPath}`)
  if (existsSync(configPath)) evidence.push(`config found at ${configPath}`)
  const extras = ccConnectScanExtras(options)
  return {
    target: 'cc-connect',
    detected: evidence.length > 0,
    evidence,
    configPath: existsSync(configPath) ? configPath : undefined,
    connectCommand: connectorCommand('connect', 'cc-connect', options, extras),
    updateCommand: connectorCommand('update', 'cc-connect', options, extras),
    doctorCommand: connectorCommand('doctor', 'cc-connect', options),
    statusCommand: connectorCommand('status', 'cc-connect', options),
  }
}

function scanConnectors(options: CliOptions): ScanResult[] {
  return selectedTargets(options).map((target) => {
    if (target === 'openclaw') return scanOpenClaw(options)
    if (target === 'hermes') return scanHermes(options)
    return scanCcConnect(options)
  })
}

function printScan(options: CliOptions): void {
  const results = scanConnectors(options)
  if (options.json) {
    console.log(
      JSON.stringify({ serverUrl: normalizeServerUrl(options.serverUrl), results }, null, 2),
    )
    return
  }

  console.log('# Connector scan')
  console.log(`Shadow server URL: ${normalizeServerUrl(options.serverUrl)}`)
  console.log(`Buddy token: ${options.token.trim() ? 'provided' : '<BUDDY_TOKEN>'}`)
  for (const result of results) {
    console.log('')
    console.log(`## ${result.target}`)
    console.log(`Detected: ${result.detected ? 'yes' : 'no'}`)
    if (result.evidence.length > 0) {
      console.log('Evidence:')
      for (const item of result.evidence) console.log(`- ${item}`)
    }
    console.log('Connection instructions:')
    console.log(`- connect: ${result.connectCommand}`)
    console.log(`- update: ${result.updateCommand}`)
    console.log(`- doctor: ${result.doctorCommand}`)
    console.log(`- status: ${result.statusCommand}`)
  }
}

type ConnectorRuntimeKind = 'openclaw' | 'cli'

interface DaemonRuntime {
  id: string
  label: string
  kind: ConnectorRuntimeKind
  status: 'available' | 'missing'
  version?: string | null
  command?: string | null
  detectedAt: string
}

interface DaemonJob {
  id: string
  type: 'configure-buddy' | string
  agentId?: string | null
  payload: {
    serverUrl: string
    token: string
    runtimeId: string
    projectName?: string
    workDir?: string
    buddy?: { id?: string; username?: string; displayName?: string | null }
  }
}

function packageVersion(): string {
  try {
    const json = JSON.parse(readFileSync(resolve(packageRoot(), 'package.json'), 'utf8')) as {
      version?: string
    }
    return json.version ?? 'dev'
  } catch {
    return 'dev'
  }
}

function commandVersion(command: string): { ok: boolean; version?: string | null } {
  const result = spawnSync(command, ['--version'], { encoding: 'utf8' })
  if (result.status !== 0) return { ok: false }
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
  return { ok: true, version: output.split(/\r?\n/)[0]?.slice(0, 120) || null }
}

function detectRuntime(input: {
  id: string
  label: string
  kind: ConnectorRuntimeKind
  command: string
}): DaemonRuntime {
  const version = commandVersion(input.command)
  return {
    id: input.id,
    label: input.label,
    kind: input.kind,
    status: version.ok ? 'available' : 'missing',
    version: version.version ?? null,
    command: input.command,
    detectedAt: new Date().toISOString(),
  }
}

function scanDaemonRuntimes(): DaemonRuntime[] {
  return [
    detectRuntime({ id: 'openclaw', label: 'OpenClaw', kind: 'openclaw', command: 'openclaw' }),
    detectRuntime({ id: 'claude-code', label: 'Claude Code', kind: 'cli', command: 'claude' }),
    detectRuntime({ id: 'codex', label: 'Codex CLI', kind: 'cli', command: 'codex' }),
    detectRuntime({ id: 'opencode', label: 'OpenCode', kind: 'cli', command: 'opencode' }),
    detectRuntime({ id: 'gemini', label: 'Gemini CLI', kind: 'cli', command: 'gemini' }),
    detectRuntime({ id: 'cursor', label: 'Cursor CLI', kind: 'cli', command: 'cursor' }),
    detectRuntime({ id: 'kimi', label: 'Kimi CLI', kind: 'cli', command: 'kimi' }),
    detectRuntime({ id: 'copilot', label: 'Copilot CLI', kind: 'cli', command: 'copilot' }),
    detectRuntime({
      id: 'antigravity',
      label: 'Antigravity CLI',
      kind: 'cli',
      command: 'antigravity',
    }),
  ]
}

function daemonHeaders(options: CliOptions): Record<string, string> {
  if (!options.apiKey?.trim()) throw new Error('Missing --api-key for daemon mode')
  return {
    Authorization: `Bearer ${options.apiKey.trim()}`,
    'Content-Type': 'application/json',
  }
}

function apiUrl(options: CliOptions, path: string): string {
  return `${normalizeServerUrl(options.serverUrl)}${path}`
}

async function apiJson<T>(options: CliOptions, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(options, path), {
    ...init,
    headers: {
      ...daemonHeaders(options),
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Daemon API ${path} failed (${response.status}): ${body}`)
  }
  return response.json() as Promise<T>
}

async function heartbeat(options: CliOptions): Promise<void> {
  const runtimes = scanDaemonRuntimes()
  const available = runtimes.filter((runtime) => runtime.status === 'available')
  await apiJson(options, '/api/connector/daemon/heartbeat', {
    method: 'POST',
    body: JSON.stringify({
      hostname: hostname(),
      os: platform(),
      arch: arch(),
      daemonVersion: packageVersion(),
      runtimes,
    }),
  })
  console.log(`[daemon] heartbeat sent (${available.length}/${runtimes.length} runtimes available)`)
}

function ccAgentTypeForRuntime(runtimeId: string): string {
  const map: Record<string, string> = {
    'claude-code': 'claudecode',
    codex: 'codex',
    opencode: 'opencode',
    gemini: 'gemini',
    cursor: 'cursor',
    kimi: 'kimi',
    copilot: 'copilot',
    antigravity: 'antigravity',
  }
  return map[runtimeId] ?? runtimeId
}

function startDetached(binaryPath: string, dryRun: boolean): void {
  if (dryRun) {
    console.log(`[dry-run] start detached ${binaryPath}`)
    return
  }
  const child = spawn(binaryPath, [], {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}

async function applyDaemonJob(
  job: DaemonJob,
  baseOptions: CliOptions,
): Promise<Record<string, unknown>> {
  if (job.type !== 'configure-buddy') {
    throw new Error(`Unsupported daemon job type: ${job.type}`)
  }

  const payload = job.payload
  const runtimeId = payload.runtimeId
  const projectName = payload.projectName?.trim() || payload.buddy?.username || 'shadow-buddy'
  const workDir = payload.workDir?.trim() || '.'

  if (runtimeId === 'openclaw') {
    applyOpenClaw(
      {
        ...baseOptions,
        target: 'openclaw',
        serverUrl: payload.serverUrl,
        token: payload.token,
        projectName,
        workDir,
        install: true,
      },
      { restart: true },
    )
    return { runtimeId, target: 'openclaw' }
  }

  await applyCcConnect({
    ...baseOptions,
    target: 'cc-connect',
    serverUrl: payload.serverUrl,
    token: payload.token,
    projectName,
    workDir,
    agentType: ccAgentTypeForRuntime(runtimeId),
    install: true,
    start: false,
  })
  const installed = await ensureCcConnectFork({
    dryRun: baseOptions.dryRun,
    log: (message) => console.log(message),
  })
  startDetached(installed.binaryPath ?? 'cc-connect', baseOptions.dryRun)
  return { runtimeId, target: 'cc-connect', agentType: ccAgentTypeForRuntime(runtimeId) }
}

async function pollJobs(options: CliOptions): Promise<void> {
  const response = await apiJson<{ jobs: DaemonJob[] }>(options, '/api/connector/daemon/jobs')
  if (response.jobs.length === 0) return

  for (const job of response.jobs) {
    try {
      console.log(`[daemon] running job ${job.id} (${job.type})`)
      const result = await applyDaemonJob(job, options)
      await apiJson(options, `/api/connector/daemon/jobs/${job.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ status: 'completed', result }),
      })
      console.log(`[daemon] completed job ${job.id}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await apiJson(options, `/api/connector/daemon/jobs/${job.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ status: 'failed', error: message }),
      }).catch(() => {})
      console.error(`[daemon] failed job ${job.id}: ${message}`)
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

async function runDaemon(options: CliOptions): Promise<void> {
  if (!options.apiKey?.trim()) throw new Error('Missing --api-key for daemon mode')
  let stopped = false
  const stop = () => {
    stopped = true
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)

  console.log(`[daemon] connecting to ${normalizeServerUrl(options.serverUrl)}`)
  do {
    await heartbeat(options)
    await pollJobs(options)
    if (options.once) break
    await delay(Math.max(1000, options.pollIntervalMs))
  } while (!stopped)
  console.log('[daemon] stopped')
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

function applyOpenClaw(
  options: CliOptions,
  behavior: { restart: boolean } = { restart: true },
): void {
  const target = requireTarget(options)
  const plan = createConnectorPlan({ ...options, target })
  const configPath = resolveOpenClawConfigPath(options)

  installShadowCliAndSkills(options)

  console.log(`Applying: Merge OpenClaw config ${configPath}`)
  const next = mergeOpenClawConfigContent(readExisting(configPath), {
    token: options.token,
    serverUrl: normalizeServerUrl(options.serverUrl),
  })
  writeFile(configPath, next, options.dryRun)

  if (options.install) {
    console.log('Applying: Install plugin')
    runShell('openclaw plugins install @shadowob/openclaw-shadowob', options.dryRun)
  }

  const restart = plan.commands.find((step) => step.label === 'Restart gateway')
  if (restart && behavior.restart) {
    console.log(`Applying: ${restart.label}`)
    runShell(restart.command, options.dryRun)
  }
}

function applyHermes(options: CliOptions): void {
  const target = requireTarget(options)
  const plan = createConnectorPlan({ ...options, target })
  const hermesDir = expandHome(options.hermesHome ?? process.env.HERMES_HOME ?? '~/.hermes')
  const pluginTarget = resolve(hermesDir, 'plugins/shadowob')
  const envPath = resolve(hermesDir, '.env')
  const configPath = resolve(hermesDir, 'config.yaml')
  const envBlock = plan.configBlocks.find((block) => block.label === '~/.hermes/.env')

  if (!envBlock) throw new Error('Hermes plan is missing config blocks')

  installShadowCliAndSkills(options)

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
  const target = requireTarget(options)
  const plan = createConnectorPlan({ ...options, target })
  const configBlock = plan.configBlocks.find((block) => block.label === '~/.cc-connect/config.toml')
  if (!configBlock) throw new Error('cc-connect plan is missing config block')

  installShadowCliAndSkills(options)

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
  const target = requireTarget(options)
  if (target === 'openclaw') {
    applyOpenClaw(options)
    return
  }
  if (target === 'hermes') {
    applyHermes(options)
    return
  }
  await applyCcConnect(options)
}

async function repair(options: CliOptions, mode: 'fix' | 'update'): Promise<void> {
  const target = requireTarget(options)
  console.log(`Applying: ${mode} ${target} connector`)
  if (target === 'openclaw') {
    applyOpenClaw(options, { restart: options.start })
    return
  }
  if (target === 'hermes') {
    applyHermes({ ...options, start: options.start })
    return
  }
  await applyCcConnect({ ...options, start: options.start })
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (options.command === 'daemon') {
    await runDaemon(options)
  } else if (options.command === 'connect') {
    await connect(options)
  } else if (options.command === 'fix' || options.command === 'update') {
    await repair(options, options.command)
  } else if (options.command === 'doctor' || options.command === 'status') {
    const ok = printDiagnostics(options, options.command)
    if (options.command === 'doctor' && !ok) process.exitCode = 1
  } else if (options.command === 'scan') {
    printScan(options)
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
