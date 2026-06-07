#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile as readFileAsync, rm } from 'node:fs/promises'
import { arch, homedir, hostname, platform, tmpdir } from 'node:os'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseToml } from 'smol-toml'
import { parse as parseYaml } from 'yaml'
import { ensureCcConnectFork, getCcConnectBinaryStatus } from './cc-connect-installer.js'
import {
  mergeCcConnectConfigContent,
  mergeEnvContent,
  mergeHermesConfigContent,
  mergeOpenClawConfigContent,
  removeCcConnectProjectConfigContent,
  removeOpenClawAccountConfigContent,
  removeShadowOfficialCcConnectProviders,
} from './config-writers.js'
import { createConnectorPlan, type ShadowConnectorTarget } from './index.js'
import {
  type ConnectorModelProvider,
  type ConnectorModelProviderInput,
  normalizeConnectorModelProvider,
} from './model-provider.js'
import {
  CONNECTOR_RUNTIME_CATALOG,
  type ConnectorRuntimeCatalogEntry,
  type ConnectorRuntimeKind,
  connectorRuntimeById,
  connectorRuntimeInstallCommands,
} from './runtime-catalog.js'
import {
  diffRuntimeSessionSnapshots,
  type RuntimeSessionSnapshot,
  renderRuntimeSessionPanel,
  scanRuntimeSessions,
  sendRuntimeSessionMessage,
} from './runtime-sessions.js'
import {
  assertDurableConnectorHome,
  CONNECTOR_MANAGED_NODE_VERSION,
  commandExistsOnConnectorPath,
  connectorProcessEnv,
  ensureManagedNodeRuntime,
  findCommandOnConnectorPath,
  managedNodeBinDir,
  nodeGlobalBinDir,
  shellCommandNeedsNpm,
} from './toolchain.js'

interface CliOptions {
  command:
    | 'plan'
    | 'connect'
    | 'update'
    | 'doctor'
    | 'fix'
    | 'status'
    | 'scan'
    | 'daemon'
    | 'runtime-scan'
    | 'runtime-install'
    | 'runtime-watch'
    | 'session-list'
    | 'session-send'
    | 'remove-buddy'
  target?: ShadowConnectorTarget
  runtimeId?: string
  sessionId?: string
  message?: string
  opencodeUrl?: string
  serverUrl: string
  token: string
  apiKey?: string
  openclawConfig?: string
  hermesHome?: string
  workDir?: string
  workDirMapFile?: string
  projectName?: string
  buddyId?: string
  buddyName?: string
  buddyDescription?: string
  shadowAgentId?: string
  agentType?: string
  modelProviderId?: string
  modelProviderLabel?: string
  modelProviderBaseUrl?: string
  modelProviderApiKey?: string
  modelProviderOpenAIBaseUrl?: string
  modelProviderOpenAIApiKey?: string
  modelProviderAnthropicBaseUrl?: string
  modelProviderAnthropicApiKey?: string
  modelProviderModel?: string
  json: boolean
  force: boolean
  install: boolean
  start: boolean
  dryRun: boolean
  once: boolean
  sessions: boolean
  pollIntervalMs: number
}

const TARGETS = new Set(['openclaw', 'hermes', 'cc-connect'])
const COMMANDS = new Set([
  'plan',
  'connect',
  'update',
  'doctor',
  'fix',
  'status',
  'scan',
  'daemon',
  'runtime-scan',
  'runtime-install',
  'runtime-watch',
  'session-list',
  'session-send',
  'remove-buddy',
])
const ALL_TARGETS = ['openclaw', 'hermes', 'cc-connect'] as const
const SHADOW_CLI_PACKAGE = '@shadowob/cli@latest'
const SHADOW_CONNECTOR_PACKAGE = '@shadowob/connector@latest'
const DEFAULT_OPENCLAW_CONFIG = '~/.openclaw/openclaw.json'
const LEGACY_OPENCLAW_CONFIG = '~/.shadowob/openclaw.json'
const DEFAULT_DAEMON_POLL_INTERVAL_MS = 5_000
const RUNTIME_INSTALL_TIMEOUT_MS = 20 * 60_000
const SHELL_OUTPUT_MAX_CHARS = 24_000

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
    '  shadowob-connector runtime-scan [--sessions] [--json]',
    '  shadowob-connector runtime-watch [--runtime <runtime-id>] [--json] [--once]',
    '  shadowob-connector session-list --runtime <runtime-id> [--json]',
    '  shadowob-connector session-send --runtime <runtime-id> --session <session-id> --message <text|-|stdin>',
    '  shadowob-connector runtime-install --runtime <runtime-id> [--dry-run]',
    '  shadowob-connector --daemon --server-url <url> --api-key <machine-key>',
    '  shadowob-connector daemon --server-url <url> --api-key <machine-key>',
    '  shadowob-connector doctor [--target <openclaw|hermes|cc-connect>]',
    '  shadowob-connector status [--target <openclaw|hermes|cc-connect>]',
    '',
    'Options:',
    '  --server-url <url>      Shadow server URL, default https://shadowob.com',
    '  --api-key <key>         Connector daemon machine key',
    '  --runtime <id>          Agent runtime id for runtime-install',
    '  --session <id>          Runtime session id for session-send',
    '  --message <text>        Runtime session message; use - or omit to read stdin',
    '  --opencode-url <url>    OpenCode server URL, default http://127.0.0.1:4096',
    '  --openclaw-config <path> OpenClaw JSON config, default $OPENCLAW_CONFIG or ~/.openclaw/openclaw.json',
    '  --hermes-home <path>    Hermes config directory, default $HERMES_HOME or ~/.hermes',
    '  --work-dir <path>       cc-connect project work directory',
    '  --work-dir-map-file <path> Daemon-local JSON map for Buddy/runtime work directories',
    '  --project-name <name>   cc-connect project name',
    '  --agent-type <type>     cc-connect agent type, default codex',
    '  --model-provider-base-url <url> OpenAI-compatible model provider base URL',
    '  --model-provider-api-key <key> OpenAI-compatible model provider API key',
    '  --model-provider-openai-base-url <url> OpenAI-compatible provider base URL',
    '  --model-provider-openai-api-key <key> OpenAI-compatible provider API key',
    '  --model-provider-anthropic-base-url <url> Anthropic-compatible provider base URL',
    '  --model-provider-anthropic-api-key <key> Anthropic-compatible provider API key',
    '  --model-provider-model <model> Model id for the configured provider endpoints',
    '  --model-provider-id <id> Model provider id, default shadow-official',
    '  --json                  Print the full plan as JSON',
    '  --force                 Overwrite target config files when needed',
    '  --install               Install connector runtime dependencies',
    '  --no-install            Skip connector runtime dependency installation',
    '  --start                 Start Hermes gateway or cc-connect after setup',
    '  --dry-run               Show what would be applied without changing files',
    '  --once                  Daemon mode: heartbeat, process one job batch, then exit',
    '  --sessions              Include runtime session snapshots in runtime-scan',
    '  --poll-interval-ms <n>  Daemon/watch polling interval, default 5000',
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
    command !== 'daemon' &&
    command !== 'runtime-scan' &&
    command !== 'runtime-install' &&
    command !== 'runtime-watch' &&
    command !== 'session-list' &&
    command !== 'session-send' &&
    command !== 'remove-buddy'
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
    runtimeId: readOption(optionArgs, '--runtime'),
    sessionId: readOption(optionArgs, '--session'),
    message: readOption(optionArgs, '--message'),
    opencodeUrl: readOption(optionArgs, '--opencode-url'),
    serverUrl: readOption(optionArgs, '--server-url') ?? 'https://shadowob.com',
    token: readOption(optionArgs, '--token') ?? '',
    apiKey: readOption(optionArgs, '--api-key'),
    openclawConfig: readOption(optionArgs, '--openclaw-config'),
    hermesHome: readOption(optionArgs, '--hermes-home'),
    workDir: readOption(optionArgs, '--work-dir'),
    workDirMapFile: readOption(optionArgs, '--work-dir-map-file'),
    projectName: readOption(optionArgs, '--project-name'),
    agentType: readOption(optionArgs, '--agent-type'),
    modelProviderId: readOption(optionArgs, '--model-provider-id'),
    modelProviderLabel: readOption(optionArgs, '--model-provider-label'),
    modelProviderBaseUrl: readOption(optionArgs, '--model-provider-base-url'),
    modelProviderApiKey: readOption(optionArgs, '--model-provider-api-key'),
    modelProviderOpenAIBaseUrl: readOption(optionArgs, '--model-provider-openai-base-url'),
    modelProviderOpenAIApiKey: readOption(optionArgs, '--model-provider-openai-api-key'),
    modelProviderAnthropicBaseUrl: readOption(optionArgs, '--model-provider-anthropic-base-url'),
    modelProviderAnthropicApiKey: readOption(optionArgs, '--model-provider-anthropic-api-key'),
    modelProviderModel: readOption(optionArgs, '--model-provider-model'),
    json: hasFlag(optionArgs, '--json'),
    force: hasFlag(optionArgs, '--force'),
    install,
    start: hasFlag(optionArgs, '--start'),
    dryRun: hasFlag(optionArgs, '--dry-run'),
    once: hasFlag(optionArgs, '--once'),
    sessions: hasFlag(optionArgs, '--sessions'),
    pollIntervalMs:
      Number.parseInt(readOption(optionArgs, '--poll-interval-ms') ?? '', 10) ||
      DEFAULT_DAEMON_POLL_INTERVAL_MS,
  }
}

function printPlan(options: CliOptions): void {
  const target = requireTarget(options)
  const plan = createConnectorPlan({
    ...options,
    target,
    modelProvider: modelProviderFromOptions(options),
  })
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

function runShell(
  command: string,
  dryRun: boolean,
  env: NodeJS.ProcessEnv = connectorProcessEnv(),
  timeoutMs = 0,
): void {
  if (dryRun) {
    console.log(`[dry-run] ${command}`)
    return
  }
  const result = spawnSync(command, { shell: true, stdio: 'inherit', env, timeout: timeoutMs })
  if (result.error) {
    throw new Error(shellExecutionErrorMessage(command, result.error, timeoutMs))
  }
  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status ?? 'unknown'}: ${command}`)
  }
}

function compactShellOutput(output: string): string {
  const trimmed = output.trim()
  if (trimmed.length <= SHELL_OUTPUT_MAX_CHARS) return trimmed
  return `${trimmed.slice(0, 4000)}\n...\n${trimmed.slice(-SHELL_OUTPUT_MAX_CHARS + 4000)}`
}

function shellExecutionErrorMessage(command: string, error: Error, timeoutMs: number): string {
  const code = (error as NodeJS.ErrnoException).code
  if (code === 'ETIMEDOUT') {
    return `Command timed out after ${Math.round(timeoutMs / 1000)}s: ${command}`
  }
  return error.message || `Command failed: ${command}`
}

function runShellQuiet(
  command: string,
  dryRun: boolean,
  env: NodeJS.ProcessEnv = connectorProcessEnv(),
  timeoutMs = 0,
): void {
  if (dryRun) return
  const result = spawnSync(command, {
    shell: true,
    encoding: 'utf8',
    env,
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
  })
  if (result.error) {
    const output = compactShellOutput(`${result.stdout ?? ''}${result.stderr ?? ''}`)
    throw new Error(
      [shellExecutionErrorMessage(command, result.error, timeoutMs), output]
        .filter(Boolean)
        .join('\n'),
    )
  }
  if (result.status !== 0) {
    const output = compactShellOutput(`${result.stdout ?? ''}${result.stderr ?? ''}`)
    throw new Error(
      output || `Command failed with exit code ${result.status ?? 'unknown'}: ${command}`,
    )
  }
}

async function runShellAsync(
  command: string,
  dryRun: boolean,
  env: NodeJS.ProcessEnv = connectorProcessEnv(),
): Promise<void> {
  if (dryRun) {
    console.log(`[dry-run] ${command}`)
    return
  }
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(command, { shell: true, stdio: 'inherit', env })
    child.once('error', rejectRun)
    child.once('close', (code) => {
      if (code === 0) {
        resolveRun()
        return
      }
      rejectRun(new Error(`Command failed with exit code ${code ?? 'unknown'}: ${command}`))
    })
  })
}

async function envForShellCommand(command: string, dryRun: boolean): Promise<NodeJS.ProcessEnv> {
  if (shellCommandNeedsNpm(command) && !commandExists('npm')) {
    await ensureManagedNodeRuntime({ dryRun, log: (message) => console.log(message) })
  }
  return connectorProcessEnv()
}

function runBinary(binaryPath: string, args: string[], dryRun: boolean): void {
  const rendered = [binaryPath, ...args]
    .map((arg) => (/^[A-Za-z0-9_./:@=-]+$/.test(arg) ? arg : JSON.stringify(arg)))
    .join(' ')
  if (dryRun) {
    console.log(`[dry-run] ${rendered}`)
    return
  }
  const result = spawnSync(binaryPath, args, { stdio: 'inherit', env: connectorProcessEnv() })
  if (result.status !== 0) {
    throw new Error(`Command failed with exit code ${result.status ?? 'unknown'}: ${rendered}`)
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitForProcessExit(pid: number, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return
    await delay(150)
  }
}

interface ProcessView {
  pid: number
  command: string
}

function processCommand(pid: number): Promise<string | null> {
  return new Promise((resolveCommand) => {
    const child = spawn('ps', ['-p', String(pid), '-o', 'command='], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    let output = ''
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      output += chunk
    })
    child.on('error', () => resolveCommand(null))
    child.on('close', (code) => {
      const command = output.trim()
      resolveCommand(code === 0 && command ? command : null)
    })
  })
}

function listProcesses(): Promise<ProcessView[]> {
  return new Promise((resolveProcesses) => {
    const child = spawn('ps', ['-axo', 'pid=,command='], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    let output = ''
    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      output += chunk
    })
    child.on('error', () => resolveProcesses([]))
    child.on('close', (code) => {
      if (code !== 0) {
        resolveProcesses([])
        return
      }
      resolveProcesses(
        output
          .split(/\r?\n/)
          .flatMap((line): ProcessView[] => {
            const match = /^\s*(\d+)\s+(.+)$/.exec(line)
            if (!match) return []
            const pid = Number.parseInt(match[1] ?? '', 10)
            const command = match[2]?.trim() ?? ''
            return Number.isFinite(pid) && command ? [{ pid, command }] : []
          })
          .filter((processView) => processView.pid > 0),
      )
    })
  })
}

function commandExecutable(command: string): string {
  return command.trim().split(/\s+/, 1)[0] ?? ''
}

function isManagedCcConnectCommand(command: string, binaryPath?: string | null): boolean {
  const executable = commandExecutable(command)
  if (binaryPath && executable === binaryPath) return true
  return (
    executable.includes('/.shadowob/connector/cc-connect/') && executable.endsWith('/cc-connect')
  )
}

async function isManagedCcConnectProcess(
  pid: number,
  binaryPath?: string | null,
): Promise<boolean> {
  const command = await processCommand(pid)
  return command ? isManagedCcConnectCommand(command, binaryPath) : false
}

async function listManagedCcConnectProcesses(binaryPath?: string | null): Promise<ProcessView[]> {
  return (await listProcesses()).filter(
    (processView) =>
      processView.pid !== process.pid && isManagedCcConnectCommand(processView.command, binaryPath),
  )
}

async function stopManagedProcess(
  processView: ProcessView,
  binaryPath: string | null | undefined,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    console.log(`[dry-run] stop cc-connect pid ${processView.pid}`)
    return
  }
  try {
    process.kill(processView.pid, 'SIGTERM')
  } catch {
    return
  }
  await waitForProcessExit(processView.pid, 5000)
  if (
    isProcessAlive(processView.pid) &&
    (await isManagedCcConnectProcess(processView.pid, binaryPath))
  ) {
    try {
      process.kill(processView.pid, 'SIGKILL')
    } catch {
      // The process may have exited after the final check.
    }
    await waitForProcessExit(processView.pid, 1500)
  }
}

async function releaseCcConnectConfigLock(
  dryRun: boolean,
  binaryPath?: string | null,
): Promise<void> {
  const lockPath = resolve(homedir(), '.cc-connect/.config.toml.lock')
  let pid: number | null = null
  try {
    const raw = (await readFileAsync(lockPath, 'utf8')).trim()
    const parsed = Number.parseInt(raw, 10)
    pid = Number.isFinite(parsed) && parsed > 0 ? parsed : null
  } catch {
    pid = null
  }

  const candidates = await listManagedCcConnectProcesses(binaryPath)
  const byPid = new Map(candidates.map((processView) => [processView.pid, processView]))
  if (
    pid &&
    pid !== process.pid &&
    !byPid.has(pid) &&
    isProcessAlive(pid) &&
    (await isManagedCcConnectProcess(pid, binaryPath))
  ) {
    const command = await processCommand(pid)
    byPid.set(pid, { pid, command: command ?? 'cc-connect' })
  }
  for (const processView of byPid.values()) {
    await stopManagedProcess(processView, binaryPath, dryRun)
  }
  if (dryRun) {
    console.log(`[dry-run] remove cc-connect lock ${lockPath}`)
    return
  }
  await rm(lockPath, { force: true }).catch(() => undefined)
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

function isPathInside(path: string, parent: string): boolean {
  const resolvedPath = resolve(path)
  const resolvedParent = resolve(parent)
  return resolvedPath === resolvedParent || resolvedPath.startsWith(`${resolvedParent}${sep}`)
}

function isSystemTempPath(path: string): boolean {
  return isPathInside(path, tmpdir())
}

function tempHomeAllowed(): boolean {
  return process.env.SHADOW_CONNECTOR_ALLOW_TEMP_HOME === '1'
}

function assertDurableHomeForLocalWrites(): void {
  if (!isSystemTempPath(homedir()) || tempHomeAllowed()) return
  throw new Error(
    `${homedir()} is under a system temporary directory and may be cleaned by the OS. ` +
      'Run the daemon under a user with a durable HOME, or set SHADOW_CONNECTOR_ALLOW_TEMP_HOME=1 only for disposable tests.',
  )
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

function modelProviderFromOptions(options: CliOptions): ConnectorModelProvider | undefined {
  const input: ConnectorModelProviderInput = {
    id: options.modelProviderId,
    label: options.modelProviderLabel,
    baseUrl: options.modelProviderBaseUrl,
    apiKey: options.modelProviderApiKey,
    openAIBaseUrl: options.modelProviderOpenAIBaseUrl,
    openAIApiKey: options.modelProviderOpenAIApiKey,
    anthropicBaseUrl: options.modelProviderAnthropicBaseUrl,
    anthropicApiKey: options.modelProviderAnthropicApiKey,
    model: options.modelProviderModel,
  }
  return normalizeConnectorModelProvider(input) ?? undefined
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
  return commandExistsOnConnectorPath(command)
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
  const localBin = resolve(homedir(), '.local/bin')
  const target = resolve(localBin, options.command)
  if (commandExists(options.command) && existsSync(target)) return
  const pathPrefix = [localBin, nodeGlobalBinDir(), managedNodeBinDir()].map(shellQuote).join(':')
  const delegateCandidates = [
    '/usr/local/bin',
    nodeGlobalBinDir(),
    managedNodeBinDir(),
    '/usr/bin',
    '/bin',
  ].map((dir) => resolve(dir, options.binaryName))
  const content = [
    '#!/usr/bin/env sh',
    `PATH=${pathPrefix}:$PATH`,
    'export PATH',
    `for candidate in ${delegateCandidates.map(shellQuote).join(' ')}; do`,
    '  if [ -x "$candidate" ] && [ "$candidate" != "$0" ]; then exec "$candidate" "$@"; fi',
    'done',
    `if command -v ${options.binaryName} >/dev/null 2>&1; then`,
    `  resolved="$(command -v ${options.binaryName})"`,
    '  if [ "$resolved" != "$0" ]; then exec "$resolved" "$@"; fi',
    'fi',
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

async function installShadowNpmPackages(options: CliOptions): Promise<void> {
  if (commandExists('shadowob') && commandExists('shadowob-connector')) return
  if (!options.dryRun) assertDurableConnectorHome()
  if (!commandExists('npm')) {
    await ensureManagedNodeRuntime({
      dryRun: options.dryRun,
      log: (message) => console.log(message),
    })
  }
  console.log('Applying: Install Shadow CLI packages')
  runShellQuiet(
    `npm install -g ${SHADOW_CLI_PACKAGE} ${SHADOW_CONNECTOR_PACKAGE}`,
    options.dryRun,
    connectorProcessEnv(),
  )
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
      resolve(homedir(), '.opencode/skills/shadowob/SKILL.md'),
      resolve(homedir(), '.openclaw/skills/shadowob/SKILL.md'),
      resolve(hermesDir, 'skills/shadowob/SKILL.md'),
    ]),
  )
}

async function installShadowCliAndSkills(options: CliOptions): Promise<void> {
  if (!options.dryRun) assertDurableHomeForLocalWrites()
  await installShadowNpmPackages(options)
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

function temporaryHomeChecks(): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = []
  if (isSystemTempPath(homedir())) {
    checks.push(
      check(
        'common',
        'warn',
        'Home directory',
        `${homedir()} is under the system temp directory`,
        'Run the daemon under a user with a durable HOME, or set SHADOW_CONNECTOR_HOME to ~/.shadowob/connector.',
      ),
    )
  }

  const connectorHomeOverride = process.env.SHADOW_CONNECTOR_HOME?.trim()
  if (connectorHomeOverride) {
    const path = expandHome(connectorHomeOverride)
    if (isSystemTempPath(path)) {
      checks.push(
        check(
          'common',
          'warn',
          'Connector install home',
          `SHADOW_CONNECTOR_HOME points to ${path}, which may be cleaned by the OS`,
          'Unset SHADOW_CONNECTOR_HOME or set it to ~/.shadowob/connector.',
        ),
      )
    }
  }
  return checks
}

function ccConnectTemporaryHomeChecks(): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = []
  const ccConnectHomeOverride = process.env.SHADOW_CC_CONNECT_HOME?.trim()
  if (ccConnectHomeOverride) {
    const path = expandHome(ccConnectHomeOverride)
    if (isSystemTempPath(path)) {
      checks.push(
        check(
          'cc-connect',
          'warn',
          'cc-connect install home',
          `SHADOW_CC_CONNECT_HOME points to ${path}, which may be cleaned by the OS`,
          'Unset SHADOW_CC_CONNECT_HOME or set it to ~/.shadowob/connector/cc-connect.',
        ),
      )
    }
  }
  return checks
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
  checks.push(...temporaryHomeChecks())

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
  const binaryFix =
    binary.source === 'env'
      ? 'Unset SHADOW_CC_CONNECT_BIN or point it to the pinned Shadow fork outside system temp.'
      : 'Run fix/update with --install.'
  const checks: DiagnosticCheck[] = [
    ...ccConnectTemporaryHomeChecks(),
    check(
      'cc-connect',
      binary.usable ? 'ok' : 'warn',
      'cc-connect Shadow fork',
      binary.usable
        ? `${binary.binaryPath} passes version check`
        : `${binary.binaryPath} is missing or does not match the pinned Shadow fork`,
      binaryFix,
    ),
  ]
  if (isSystemTempPath(binary.binaryPath)) {
    checks.push(
      check(
        'cc-connect',
        'warn',
        'cc-connect binary location',
        `${binary.binaryPath} is under the system temp directory and may be cleaned by the OS`,
        binary.source === 'env'
          ? 'Move the binary to a durable path or unset SHADOW_CC_CONNECT_BIN.'
          : process.env.SHADOW_CC_CONNECT_HOME?.trim()
            ? 'Unset SHADOW_CC_CONNECT_HOME or use ~/.shadowob/connector/cc-connect.'
            : 'Run the daemon under a durable HOME or set SHADOW_CC_CONNECT_HOME to ~/.shadowob/connector/cc-connect.',
      ),
    )
  }

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
    const requestedProjectName = options.projectName?.trim()
    const workDir = options.workDir?.trim() || '.'
    const project = requestedProjectName
      ? projects.find((item) => asObject(item).name === requestedProjectName)
      : (projects.find((item) => {
          const platformsValue = asObject(item).platforms
          const platforms = Array.isArray(platformsValue) ? platformsValue : []
          return platforms.some((platform) => asObject(platform).type === 'shadowob')
        }) ??
        projects.find(
          (item) => asObject(asObject(asObject(item).agent).options).work_dir === workDir,
        ))
    const projectName = requestedProjectName || String(asObject(project).name || 'shadow-buddy')
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

interface DaemonRuntime {
  id: string
  label: string
  kind: ConnectorRuntimeKind
  status: 'available' | 'missing'
  version?: string | null
  command?: string | null
  iconId?: string | null
  installCommand?: string | null
  installCommands?: string[]
  helpUrl?: string | null
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
    modelProvider?: ConnectorModelProvider
  }
}

interface AppliedDaemonJob {
  runtimeId: string
  projectName: string
  target: ShadowConnectorTarget
  agentType?: string
  bridgeStart: boolean
  waitForProjectReady?: boolean
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' && key.trim() && entry.trim()) result[key.trim()] = entry.trim()
  }
  return result
}

function readDaemonWorkDirMap(options: CliOptions): {
  buddies: Record<string, string>
  runtimes: Record<string, string>
  defaultWorkDir: string
} {
  if (!options.workDirMapFile?.trim()) {
    return { buddies: {}, runtimes: {}, defaultWorkDir: '' }
  }
  try {
    const filePath = expandHome(options.workDirMapFile)
    const root = JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
    return {
      buddies: stringRecord(root.buddies),
      runtimes: stringRecord(root.runtimes),
      defaultWorkDir: typeof root.default === 'string' ? root.default.trim() : '',
    }
  } catch {
    return { buddies: {}, runtimes: {}, defaultWorkDir: '' }
  }
}

function resolveDaemonWorkDir(job: DaemonJob, options: CliOptions): string {
  const payload = job.payload
  const workDirMap = readDaemonWorkDirMap(options)
  const buddyKeys = [
    job.agentId,
    payload.buddy?.id,
    payload.buddy?.username,
    payload.buddy?.displayName,
    payload.projectName,
  ]
    .map((value) => value?.trim())
    .filter((value, index, values): value is string =>
      Boolean(value && values.indexOf(value) === index),
    )
  const buddyWorkDir =
    buddyKeys.map((key) => workDirMap.buddies[key]).find((value) => Boolean(value)) ?? ''
  return (
    buddyWorkDir ||
    workDirMap.runtimes[payload.runtimeId] ||
    workDirMap.defaultWorkDir ||
    payload.workDir?.trim() ||
    options.workDir?.trim() ||
    '.'
  )
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

function resolveSpawnCommand(command: string, env: NodeJS.ProcessEnv): string | null {
  return findCommandOnConnectorPath(command.trim(), env)
}

function isWindowsShellShim(executable: string): boolean {
  return process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable)
}

function quoteWindowsShellArg(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}

function commandVersionWithArgs(
  command: string,
  args: string[] = ['--version'],
): Promise<{ ok: boolean; version?: string | null }> {
  return new Promise((resolve) => {
    const env = connectorProcessEnv()
    const executable = resolveSpawnCommand(command, env)
    if (!executable) {
      resolve({ ok: false })
      return
    }

    let child: ReturnType<typeof spawn>
    try {
      child = isWindowsShellShim(executable)
        ? spawn(
            'cmd.exe',
            [
              '/d',
              '/s',
              '/c',
              [quoteWindowsShellArg(executable), ...args.map(quoteWindowsShellArg)].join(' '),
            ],
            {
              env,
              stdio: ['ignore', 'pipe', 'pipe'],
            },
          )
        : spawn(executable, args, {
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
          })
    } catch {
      resolve({ ok: false })
      return
    }
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (value: { ok: boolean; version?: string | null }) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(value)
    }
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      finish({ ok: false })
    }, 3500)
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', () => finish({ ok: false }))
    child.on('close', (code) => {
      if (code !== 0) {
        finish({ ok: false })
        return
      }
      const output = `${stdout}${stderr}`.trim()
      finish({ ok: true, version: output.split(/\r?\n/)[0]?.slice(0, 120) || null })
    })
  })
}

async function commandVersion(command: string): Promise<{ ok: boolean; version?: string | null }> {
  const candidates = [['--version'], ['version'], ['-v']]
  for (const args of candidates) {
    const result = await commandVersionWithArgs(command, args)
    if (result.ok) return result
  }
  return { ok: false }
}

async function commandVersionForRuntime(
  command: string,
  preferredArgs?: string[],
): Promise<{ ok: boolean; version?: string | null }> {
  if (!preferredArgs) return commandVersion(command)
  const result = await commandVersionWithArgs(command, preferredArgs)
  return result.ok ? result : commandVersion(command)
}

async function detectRuntime(input: {
  id: string
  label: string
  kind: ConnectorRuntimeKind
  command: string
  commands?: string[]
  iconId?: string
  installCommand?: string | null
  installCommands?: string[]
  helpUrl?: string
  versionArgs?: string[]
}): Promise<DaemonRuntime> {
  const commands = input.commands ?? [input.command]
  for (const command of commands) {
    const version = await commandVersionForRuntime(command, input.versionArgs)
    if (!version.ok) continue
    return {
      id: input.id,
      label: input.label,
      kind: input.kind,
      status: 'available',
      version: version.version ?? null,
      command,
      iconId: input.iconId ?? input.id,
      installCommand: input.installCommand ?? null,
      installCommands: input.installCommands ?? [],
      helpUrl: input.helpUrl ?? null,
      detectedAt: new Date().toISOString(),
    }
  }
  return {
    id: input.id,
    label: input.label,
    kind: input.kind,
    status: 'missing',
    version: null,
    command: input.command,
    iconId: input.iconId ?? input.id,
    installCommand: input.installCommand ?? null,
    installCommands: input.installCommands ?? [],
    helpUrl: input.helpUrl ?? null,
    detectedAt: new Date().toISOString(),
  }
}

function detectCatalogRuntime(runtime: ConnectorRuntimeCatalogEntry): Promise<DaemonRuntime> {
  const installCommands = connectorRuntimeInstallCommands(runtime.id)
  return detectRuntime({
    id: runtime.id,
    label: runtime.label,
    kind: runtime.kind,
    command: runtime.command,
    commands: runtime.commands,
    iconId: runtime.iconId,
    installCommand: installCommands[0] ?? null,
    installCommands,
    helpUrl: runtime.install.helpUrl,
    versionArgs: runtime.versionArgs,
  })
}

function scanDaemonRuntimes(): Promise<DaemonRuntime[]> {
  return Promise.all(CONNECTOR_RUNTIME_CATALOG.map(detectCatalogRuntime))
}

async function printRuntimeScan(options: CliOptions): Promise<void> {
  const runtimes = await scanDaemonRuntimes()
  const sessionSnapshot = options.sessions
    ? await scanRuntimeSessions({
        runtimeId: options.runtimeId,
        opencodeUrl: options.opencodeUrl,
        env: connectorProcessEnv(),
      })
    : null
  if (options.json) {
    console.log(JSON.stringify({ runtimes, runtimeSessions: sessionSnapshot }, null, 2))
    return
  }

  console.log('# Agent runtimes')
  for (const runtime of runtimes) {
    const marker = runtime.status === 'available' ? 'OK' : 'MISSING'
    console.log(`[${marker}] ${runtime.label}${runtime.version ? ` - ${runtime.version}` : ''}`)
    if (runtime.status === 'missing') {
      if (runtime.installCommand) console.log(`       install: ${runtime.installCommand}`)
      if (runtime.helpUrl) console.log(`       help: ${runtime.helpUrl}`)
    }
  }
  if (sessionSnapshot) {
    console.log('')
    console.log(renderRuntimeSessionPanel(sessionSnapshot))
  }
}

async function installRuntime(options: CliOptions): Promise<void> {
  const runtime = connectorRuntimeById(options.runtimeId)
  if (!runtime) {
    throw new Error(
      `Missing or invalid --runtime. Supported runtimes: ${CONNECTOR_RUNTIME_CATALOG.map((item) => item.id).join(', ')}`,
    )
  }
  const commands = connectorRuntimeInstallCommands(runtime.id)
  if (commands.length === 0) {
    throw new Error(
      `No install command is available for ${runtime.label}. See ${runtime.install.helpUrl}`,
    )
  }
  const errors: string[] = []
  let installedCommand = ''
  for (const command of commands) {
    const env = await envForShellCommand(command, options.dryRun)
    try {
      if (options.json) {
        runShellQuiet(command, options.dryRun, env, RUNTIME_INSTALL_TIMEOUT_MS)
      } else {
        runShell(command, options.dryRun, env, RUNTIME_INSTALL_TIMEOUT_MS)
      }
      installedCommand = command
      break
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  if (!installedCommand) {
    throw new Error(
      `All install commands failed for ${runtime.label}:\n${errors
        .map((error, index) => `${index + 1}. ${error}`)
        .join('\n')}`,
    )
  }
  const detected = await detectCatalogRuntime(runtime)
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: detected.status === 'available' || options.dryRun,
          runtimeId: runtime.id,
          commands,
          installedCommand,
          runtime: detected,
        },
        null,
        2,
      ),
    )
    return
  }
  console.log(
    `${runtime.label}: ${detected.status === 'available' ? 'installed' : 'install command completed'}`,
  )
}

async function ensureDaemonRuntimeAvailable(runtimeId: string, options: CliOptions): Promise<void> {
  const runtime = connectorRuntimeById(runtimeId)
  if (!runtime) {
    throw new Error(
      `Unsupported runtime "${runtimeId}". Supported runtimes: ${CONNECTOR_RUNTIME_CATALOG.map((item) => item.id).join(', ')}`,
    )
  }

  const detected = await detectCatalogRuntime(runtime)
  if (detected.status === 'available') return

  const commands = connectorRuntimeInstallCommands(runtime.id)
  if (commands.length === 0) {
    throw new Error(`Missing ${runtime.label}. Install it first: ${runtime.install.helpUrl}`)
  }

  console.log(`[daemon] ${runtime.label} is missing; installing runtime`)
  await installRuntime({ ...options, runtimeId: runtime.id, json: false })
  if (options.dryRun) return

  const afterInstall = await detectCatalogRuntime(runtime)
  if (afterInstall.status !== 'available') {
    throw new Error(
      `${runtime.label} is still missing after install. Try manually: ${commands.join(' && ')}`,
    )
  }
}

async function printSessionList(options: CliOptions): Promise<void> {
  const snapshot = await scanRuntimeSessions({
    runtimeId: options.runtimeId,
    opencodeUrl: options.opencodeUrl,
    env: connectorProcessEnv(),
  })
  if (options.json) {
    console.log(JSON.stringify(snapshot, null, 2))
    return
  }
  console.log(renderRuntimeSessionPanel(snapshot))
}

function readStdinText(): Promise<string> {
  if (process.stdin.isTTY) return Promise.resolve('')
  return new Promise((resolve, reject) => {
    let text = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      text += chunk
    })
    process.stdin.once('error', reject)
    process.stdin.once('end', () => resolve(text.trim()))
    process.stdin.resume()
  })
}

async function messageFromOptions(options: CliOptions): Promise<string> {
  if (options.message && options.message !== '-') return options.message
  const piped = await readStdinText()
  if (piped) return piped
  throw new Error('Missing --message. Pass --message <text>, --message -, or pipe stdin.')
}

async function sendSessionMessage(options: CliOptions): Promise<void> {
  if (!options.runtimeId?.trim()) throw new Error('Missing --runtime')
  if (!options.sessionId?.trim()) throw new Error('Missing --session')
  const result = await sendRuntimeSessionMessage({
    runtimeId: options.runtimeId,
    sessionId: options.sessionId,
    message: await messageFromOptions(options),
    opencodeUrl: options.opencodeUrl,
    env: connectorProcessEnv(),
  })
  if (options.json) {
    console.log(JSON.stringify(result, null, 2))
    return
  }
  console.log(
    `${result.runtimeId} session ${result.sessionId}: ${result.accepted ? 'accepted' : 'failed'} (${result.mode})`,
  )
  if (!result.accepted && result.stderr) console.error(result.stderr.trim())
}

async function watchRuntimeSessions(options: CliOptions): Promise<void> {
  let stopped = false
  const stop = () => {
    stopped = true
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)

  let previous: RuntimeSessionSnapshot | null = null
  do {
    const snapshot = await scanRuntimeSessions({
      runtimeId: options.runtimeId,
      opencodeUrl: options.opencodeUrl,
      env: connectorProcessEnv(),
    })
    const events = diffRuntimeSessionSnapshots(previous, snapshot)
    if (options.json) {
      for (const event of events) console.log(JSON.stringify(event))
    } else {
      process.stdout.write('\x1b[2J\x1b[H')
      console.log(renderRuntimeSessionPanel(snapshot))
      console.log('')
      console.log(
        `Polling every ${Math.max(1000, options.pollIntervalMs)}ms. Press Ctrl-C to stop.`,
      )
    }
    previous = snapshot
    if (options.once) break
    await delay(Math.max(1000, options.pollIntervalMs))
  } while (!stopped)
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
  const runtimes = await scanDaemonRuntimes()
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
    cursor: 'cursor',
    kimi: 'kimi',
    copilot: 'copilot',
    antigravity: 'antigravity',
  }
  return map[runtimeId] ?? runtimeId
}

function daemonModelProviderForRuntime(
  runtimeId: string,
  provider: DaemonJob['payload']['modelProvider'],
): DaemonJob['payload']['modelProvider'] | undefined {
  void runtimeId
  return provider
}

function safeConnectorProfileName(value: string): string {
  const safe = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 96)
  return safe || 'shadow-buddy'
}

function connectorHermesHome(projectName: string): string {
  return resolve(homedir(), '.shadowob/connector/hermes', safeConnectorProfileName(projectName))
}

const DAEMON_BRIDGE_READY_TIMEOUT_MS = 12_000
const DAEMON_BRIDGE_PROJECT_READY_TIMEOUT_MS = 45_000
const DAEMON_BRIDGE_LOG_LIMIT = 80
const daemonBridgeProcesses = new Map<
  string,
  {
    child: ReturnType<typeof spawn>
    logs: string[]
  }
>()

function appendDaemonBridgeLog(key: string, logs: string[], chunk: Buffer | string): string[] {
  const lines = String(chunk)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  for (const line of lines) {
    logs.push(line)
    if (
      /level=(WARN|ERROR)/.test(line) ||
      /^Error:/.test(line) ||
      line.includes('cc-connect is running') ||
      line.includes('api server started') ||
      line.includes('shutting down')
    ) {
      console.log(`[daemon:${key}] ${line}`)
    }
  }
  while (logs.length > DAEMON_BRIDGE_LOG_LIMIT) logs.shift()
  return lines
}

function readyProjectFromBridgeLog(line: string): string | null {
  if (!line.includes('platform ready') || !line.includes('platform=shadowob')) return null
  const match = /\bproject=([^\s]+)/.exec(line)
  return match?.[1] ?? null
}

async function stopDaemonBridgeProcesses(): Promise<void> {
  const entries = [...daemonBridgeProcesses.entries()]
  daemonBridgeProcesses.clear()
  for (const [key, entry] of entries) {
    if (entry.child.exitCode !== null || entry.child.killed) continue
    try {
      entry.child.kill('SIGTERM')
    } catch {
      continue
    }
    const deadline = Date.now() + 4000
    while (Date.now() < deadline && entry.child.exitCode === null && !entry.child.killed) {
      await delay(150)
    }
    if (entry.child.exitCode === null && !entry.child.killed) {
      try {
        entry.child.kill('SIGKILL')
      } catch {
        // Process may have exited between checks.
      }
    }
    console.log(`[daemon] stopped ${key} bridge`)
  }
}

async function startDetached(binaryPath: string, args: string[], dryRun: boolean): Promise<void> {
  if (dryRun) {
    console.log(`[dry-run] start detached ${[binaryPath, ...args].join(' ')}`)
    return
  }
  let child: ReturnType<typeof spawn>
  try {
    child = spawn(binaryPath, args, {
      detached: true,
      env: connectorProcessEnv(),
      stdio: 'ignore',
    })
  } catch (error) {
    throw new Error(
      `Failed to start ${binaryPath}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  child.unref()
  await new Promise<void>((resolveStart, rejectStart) => {
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      resolveStart()
    }, 2000)
    const cleanup = () => {
      clearTimeout(timeout)
      child.off('error', onError)
      child.off('exit', onExit)
    }
    const onError = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      rejectStart(error)
    }
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return
      settled = true
      cleanup()
      rejectStart(
        new Error(
          `${binaryPath} exited during startup${code !== null ? ` with code ${code}` : ''}${signal ? ` (${signal})` : ''}`,
        ),
      )
    }
    child.once('error', onError)
    child.once('exit', onExit)
  })
}

async function startDaemonManagedBridge(
  key: string,
  binaryPath: string,
  args: string[],
  dryRun: boolean,
  bridgeOptions: {
    expectedProjects?: string[]
    env?: NodeJS.ProcessEnv
    readyPatterns?: RegExp[]
    aliveFallbackMs?: number
    restart?: boolean
  } = {},
): Promise<void> {
  const existing = daemonBridgeProcesses.get(key)
  if (existing && existing.child.exitCode === null && !existing.child.killed) {
    if (!bridgeOptions.restart) return
    await stopDaemonBridgeProcess(key)
  }

  if (dryRun) {
    console.log(`[dry-run] start managed ${key} bridge ${[binaryPath, ...args].join(' ')}`)
    return
  }

  const logs: string[] = []
  const expectedProjects = bridgeOptions.expectedProjects ?? []
  let child: ReturnType<typeof spawn>
  try {
    child = spawn(binaryPath, args, {
      env: bridgeOptions.env ?? connectorProcessEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (error) {
    throw new Error(
      `Failed to start ${key} bridge (${binaryPath}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
  daemonBridgeProcesses.set(key, { child, logs })

  await new Promise<void>((resolveStart, rejectStart) => {
    let settled = false
    let processReady = false
    const pendingProjects = new Set(expectedProjects.filter(Boolean))
    const aliveFallback =
      bridgeOptions.aliveFallbackMs && bridgeOptions.aliveFallbackMs > 0
        ? setTimeout(() => {
            if (settled || child.exitCode !== null || child.killed) return
            processReady = true
            maybeReady()
          }, bridgeOptions.aliveFallbackMs)
        : null
    const settle = (callback: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (aliveFallback) clearTimeout(aliveFallback)
      child.off('error', onError)
      child.off('exit', onExit)
      callback()
    }
    const maybeReady = () => {
      if (processReady && pendingProjects.size === 0) settle(resolveStart)
    }
    const onOutput = (chunk: Buffer | string) => {
      const lines = appendDaemonBridgeLog(key, logs, chunk)
      if (
        lines.some(
          (line) => line.includes('cc-connect is running') || line.includes('api server started'),
        ) ||
        lines.some((line) => bridgeOptions.readyPatterns?.some((pattern) => pattern.test(line)))
      ) {
        processReady = true
      }
      for (const line of lines) {
        const projectName = readyProjectFromBridgeLog(line)
        if (projectName) pendingProjects.delete(projectName)
      }
      maybeReady()
    }
    const onError = (error: Error) => {
      daemonBridgeProcesses.delete(key)
      settle(() => rejectStart(error))
    }
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      daemonBridgeProcesses.delete(key)
      settle(() =>
        rejectStart(
          new Error(
            `${key} bridge exited during startup${code !== null ? ` with code ${code}` : ''}${signal ? ` (${signal})` : ''}: ${logs.slice(-8).join('\n')}`,
          ),
        ),
      )
    }
    const timeout = setTimeout(
      () => {
        if (
          child.exitCode === null &&
          !child.killed &&
          processReady &&
          pendingProjects.size === 0
        ) {
          settle(resolveStart)
          return
        }
        settle(() =>
          rejectStart(
            new Error(
              `${key} bridge did not become ready${pendingProjects.size > 0 ? ` for projects ${[...pendingProjects].join(', ')}` : ''}: ${logs.slice(-12).join('\n')}`,
            ),
          ),
        )
      },
      expectedProjects.length > 0
        ? DAEMON_BRIDGE_PROJECT_READY_TIMEOUT_MS
        : DAEMON_BRIDGE_READY_TIMEOUT_MS,
    )

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', onOutput)
    child.stderr?.on('data', onOutput)
    child.once('error', onError)
    child.once('exit', onExit)
  })

  child.once('exit', (code, signal) => {
    const current = daemonBridgeProcesses.get(key)
    if (current?.child === child) daemonBridgeProcesses.delete(key)
    console.error(
      `[daemon] ${key} bridge exited${code !== null ? ` with code ${code}` : ''}${signal ? ` (${signal})` : ''}`,
    )
    if (logs.length > 0) {
      console.error(
        logs
          .slice(-12)
          .map((line) => `[daemon:${key}] ${line}`)
          .join('\n'),
      )
    }
  })
}

async function stopDaemonBridgeProcess(key: string): Promise<void> {
  const entry = daemonBridgeProcesses.get(key)
  if (!entry || entry.child.exitCode !== null || entry.child.killed) return
  daemonBridgeProcesses.delete(key)
  try {
    entry.child.kill('SIGTERM')
  } catch {
    return
  }
  const deadline = Date.now() + 4000
  while (Date.now() < deadline && entry.child.exitCode === null && !entry.child.killed) {
    await delay(150)
  }
  if (entry.child.exitCode === null && !entry.child.killed) {
    try {
      entry.child.kill('SIGKILL')
    } catch {
      // Process may have already exited.
    }
  }
}

async function applyRemoveDaemonJob(
  job: DaemonJob,
  baseOptions: CliOptions,
): Promise<AppliedDaemonJob> {
  const payload = job.payload
  const runtimeId = payload.runtimeId
  const projectName = payload.projectName?.trim() || payload.buddy?.username || 'shadow-buddy'

  if (runtimeId === 'openclaw') {
    const configPath = resolveOpenClawConfigPath(baseOptions)
    console.log(`Applying: Remove OpenClaw Shadow account ${projectName}`)
    writeFile(
      configPath,
      removeOpenClawAccountConfigContent(readExisting(configPath), projectName),
      baseOptions.dryRun,
    )
    return {
      runtimeId,
      projectName,
      target: 'openclaw',
      bridgeStart: true,
      waitForProjectReady: false,
    }
  }

  if (runtimeId === 'hermes') {
    const key = `hermes:${safeConnectorProfileName(projectName)}`
    console.log(`Applying: Remove Hermes profile ${projectName}`)
    await stopDaemonBridgeProcess(key)
    if (baseOptions.dryRun) {
      console.log(`[dry-run] remove ${connectorHermesHome(projectName)}`)
    } else {
      await rm(connectorHermesHome(projectName), { recursive: true, force: true })
    }
    return { runtimeId, projectName, target: 'hermes', bridgeStart: false }
  }

  const configPath = resolve(homedir(), '.cc-connect/config.toml')
  console.log(`Applying: Remove cc-connect project ${projectName}`)
  await stopDaemonBridgeProcess('cc-connect')
  await releaseCcConnectConfigLock(baseOptions.dryRun)
  writeFile(
    configPath,
    removeCcConnectProjectConfigContent(readExisting(configPath), projectName),
    baseOptions.dryRun,
  )
  return {
    runtimeId,
    projectName,
    target: 'cc-connect',
    agentType: ccAgentTypeForRuntime(runtimeId),
    bridgeStart: true,
    waitForProjectReady: false,
  }
}

async function applyDaemonJob(job: DaemonJob, baseOptions: CliOptions): Promise<AppliedDaemonJob> {
  if (job.type === 'remove-buddy') {
    return applyRemoveDaemonJob(job, baseOptions)
  }
  if (job.type !== 'configure-buddy') {
    throw new Error(`Unsupported daemon job type: ${job.type}`)
  }

  const payload = job.payload
  const runtimeId = payload.runtimeId
  const projectName = payload.projectName?.trim() || payload.buddy?.username || 'shadow-buddy'
  const workDir = resolveDaemonWorkDir(job, baseOptions)
  const modelProvider = daemonModelProviderForRuntime(runtimeId, payload.modelProvider)

  await ensureDaemonRuntimeAvailable(runtimeId, baseOptions)

  if (runtimeId === 'openclaw') {
    await applyOpenClaw(
      {
        ...baseOptions,
        target: 'openclaw',
        serverUrl: payload.serverUrl,
        token: payload.token,
        projectName,
        workDir,
        buddyId: payload.buddy?.id,
        buddyName: payload.buddy?.displayName ?? payload.buddy?.username,
        shadowAgentId: job.agentId ?? payload.buddy?.id,
        modelProviderId: modelProvider?.id,
        modelProviderLabel: modelProvider?.label,
        modelProviderBaseUrl: modelProvider?.baseUrl,
        modelProviderApiKey: modelProvider?.apiKey,
        modelProviderOpenAIBaseUrl: modelProvider?.openAIBaseUrl,
        modelProviderOpenAIApiKey: modelProvider?.openAIApiKey,
        modelProviderAnthropicBaseUrl: modelProvider?.anthropicBaseUrl,
        modelProviderAnthropicApiKey: modelProvider?.anthropicApiKey,
        modelProviderModel: modelProvider?.model,
        install: true,
      },
      { restart: false },
    )
    return { runtimeId, projectName, target: 'openclaw', bridgeStart: true }
  }

  if (runtimeId === 'hermes') {
    await applyHermes({
      ...baseOptions,
      target: 'hermes',
      serverUrl: payload.serverUrl,
      token: payload.token,
      projectName,
      hermesHome: connectorHermesHome(projectName),
      workDir,
      buddyId: payload.buddy?.id,
      buddyName: payload.buddy?.displayName ?? payload.buddy?.username,
      shadowAgentId: job.agentId ?? payload.buddy?.id,
      modelProviderId: modelProvider?.id,
      modelProviderLabel: modelProvider?.label,
      modelProviderBaseUrl: modelProvider?.baseUrl,
      modelProviderApiKey: modelProvider?.apiKey,
      modelProviderOpenAIBaseUrl: modelProvider?.openAIBaseUrl,
      modelProviderOpenAIApiKey: modelProvider?.openAIApiKey,
      modelProviderAnthropicBaseUrl: modelProvider?.anthropicBaseUrl,
      modelProviderAnthropicApiKey: modelProvider?.anthropicApiKey,
      modelProviderModel: modelProvider?.model,
      install: true,
      start: false,
    })
    return { runtimeId, projectName, target: 'hermes', bridgeStart: true }
  }

  await applyCcConnect({
    ...baseOptions,
    target: 'cc-connect',
    serverUrl: payload.serverUrl,
    token: payload.token,
    projectName,
    workDir,
    agentType: ccAgentTypeForRuntime(runtimeId),
    modelProviderId: modelProvider?.id,
    modelProviderLabel: modelProvider?.label,
    modelProviderBaseUrl: modelProvider?.baseUrl,
    modelProviderApiKey: modelProvider?.apiKey,
    modelProviderOpenAIBaseUrl: modelProvider?.openAIBaseUrl,
    modelProviderOpenAIApiKey: modelProvider?.openAIApiKey,
    modelProviderAnthropicBaseUrl: modelProvider?.anthropicBaseUrl,
    modelProviderAnthropicApiKey: modelProvider?.anthropicApiKey,
    modelProviderModel: modelProvider?.model,
    install: true,
    start: false,
  })
  return {
    runtimeId,
    projectName,
    target: 'cc-connect',
    agentType: ccAgentTypeForRuntime(runtimeId),
    bridgeStart: true,
  }
}

async function removeLocalBuddy(options: CliOptions): Promise<void> {
  const runtimeId = options.runtimeId?.trim()
  const projectName = options.projectName?.trim()
  if (!runtimeId) throw new Error('Missing --runtime')
  if (!projectName) throw new Error('Missing --project-name')

  let target: ShadowConnectorTarget = 'cc-connect'
  if (runtimeId === 'openclaw') {
    target = 'openclaw'
    const configPath = resolveOpenClawConfigPath(options)
    writeFile(
      configPath,
      removeOpenClawAccountConfigContent(readExisting(configPath), projectName),
      options.dryRun,
    )
  } else if (runtimeId === 'hermes') {
    target = 'hermes'
    if (options.dryRun) {
      console.log(`[dry-run] remove ${connectorHermesHome(projectName)}`)
    } else {
      await rm(connectorHermesHome(projectName), { recursive: true, force: true })
    }
  } else {
    const configPath = resolve(homedir(), '.cc-connect/config.toml')
    await releaseCcConnectConfigLock(options.dryRun)
    writeFile(
      configPath,
      removeCcConnectProjectConfigContent(readExisting(configPath), projectName),
      options.dryRun,
    )
  }

  if (options.json) {
    console.log(JSON.stringify({ ok: true, runtimeId, projectName, target }, null, 2))
    return
  }
  console.log(`Removed ${projectName} from ${target}`)
}

async function sanitizeCcConnectNativeProviders(options: CliOptions): Promise<boolean> {
  const configPath = resolve(homedir(), '.cc-connect/config.toml')
  const existing = readExisting(configPath)
  if (!existing.trim()) return false
  const next = removeShadowOfficialCcConnectProviders(existing)
  if (next === existing || next.trim() === existing.trim()) return false
  await releaseCcConnectConfigLock(options.dryRun)
  writeFile(configPath, next, options.dryRun)
  console.log('[daemon] removed stale Shadow official provider from cc-connect native projects')
  return true
}

function daemonBridgeKey(result: AppliedDaemonJob): string {
  if (result.target === 'hermes') return `hermes:${safeConnectorProfileName(result.projectName)}`
  return result.target
}

async function startDaemonBridge(
  result: AppliedDaemonJob,
  options: CliOptions,
  expectedProjects: string[] = [],
): Promise<void> {
  if (!result.bridgeStart) return
  if (result.target === 'openclaw') {
    await runShellAsync('openclaw gateway restart', options.dryRun)
    return
  }
  if (result.target === 'hermes') {
    const hermesHome = connectorHermesHome(result.projectName)
    await startDaemonManagedBridge(daemonBridgeKey(result), 'hermes', ['gateway'], options.dryRun, {
      env: { ...connectorProcessEnv(), HERMES_HOME: hermesHome },
      readyPatterns: [
        /Shadow bot connected as/i,
        /gateway .*started/i,
        /gateway .*running/i,
        /platform .*shadow/i,
      ],
      aliveFallbackMs: 5000,
      restart: true,
    })
    return
  }
  if (result.target === 'cc-connect') {
    const installed = await ensureCcConnectFork({
      dryRun: options.dryRun,
      log: (message) => console.log(message),
    })
    await releaseCcConnectConfigLock(options.dryRun, installed.binaryPath)
    await startDaemonManagedBridge(
      'cc-connect',
      installed.binaryPath ?? 'cc-connect',
      [],
      options.dryRun,
      { expectedProjects, restart: true },
    )
  }
}

async function completeDaemonJob(
  options: CliOptions,
  job: DaemonJob,
  status: 'completed' | 'failed',
  result: Record<string, unknown> | null,
  error?: string,
): Promise<void> {
  await apiJson(options, `/api/connector/daemon/jobs/${job.id}/complete`, {
    method: 'POST',
    body: JSON.stringify(
      status === 'completed' ? { status, result: result ?? {} } : { status, error },
    ),
  })
}

function appliedDaemonJobResult(result: AppliedDaemonJob): Record<string, unknown> {
  return {
    runtimeId: result.runtimeId,
    projectName: result.projectName,
    target: result.target,
    ...(result.agentType ? { agentType: result.agentType } : {}),
  }
}

async function applyDaemonJobsBatch(jobs: DaemonJob[], options: CliOptions): Promise<void> {
  const applied: Array<{ job: DaemonJob; result: AppliedDaemonJob }> = []
  for (const job of jobs) {
    try {
      console.log(`[daemon] configuring job ${job.id} (${job.type})`)
      const result = await applyDaemonJob(job, options)
      applied.push({ job, result })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await completeDaemonJob(options, job, 'failed', null, message).catch(() => {})
      console.error(`[daemon] failed job ${job.id}: ${message}`)
    }
  }

  const bridgeResults = new Map<string, AppliedDaemonJob[]>()
  for (const item of applied) {
    if (!item.result.bridgeStart) continue
    const key = daemonBridgeKey(item.result)
    bridgeResults.set(key, [...(bridgeResults.get(key) ?? []), item.result])
  }

  const bridgeErrors = new Map<string, string>()
  for (const [key, results] of bridgeResults) {
    const result = results[0]
    if (!result) continue
    try {
      console.log(`[daemon] starting ${result.target} bridge`)
      await startDaemonBridge(
        result,
        options,
        results
          .filter((item) => item.waitForProjectReady !== false)
          .map((item) => item.projectName),
      )
    } catch (error) {
      bridgeErrors.set(key, error instanceof Error ? error.message : String(error))
    }
  }

  for (const item of applied) {
    const bridgeError = item.result.bridgeStart
      ? bridgeErrors.get(daemonBridgeKey(item.result))
      : undefined
    if (bridgeError) {
      await completeDaemonJob(options, item.job, 'failed', null, bridgeError).catch(() => {})
      console.error(`[daemon] failed job ${item.job.id}: ${bridgeError}`)
      continue
    }
    await completeDaemonJob(options, item.job, 'completed', appliedDaemonJobResult(item.result))
    console.log(`[daemon] completed job ${item.job.id}`)
  }
}

async function pollJobs(options: CliOptions): Promise<void> {
  const response = await apiJson<{ jobs: DaemonJob[] }>(options, '/api/connector/daemon/jobs')
  if (response.jobs.length === 0) return

  await applyDaemonJobsBatch(response.jobs, options)
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
  try {
    await sanitizeCcConnectNativeProviders(options).catch((error) => {
      console.warn(
        `[daemon] cc-connect provider cleanup failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    })
    do {
      await heartbeat(options)
      await pollJobs(options)
      if (options.once) break
      await delay(Math.max(1000, options.pollIntervalMs))
    } while (!stopped)
  } finally {
    await stopDaemonBridgeProcesses()
    console.log('[daemon] stopped')
  }
}

function hermesPluginSource(): string {
  const candidates = [
    resolve(packageRoot(), 'hermes-shadowob-plugin'),
    resolve('/opt/shadowob/hermes-shadowob-plugin'),
    resolve(process.cwd(), 'packages/connector/hermes-shadowob-plugin'),
  ].filter((candidate): candidate is string => Boolean(candidate))
  const found = candidates.find((candidate) => existsSync(candidate))
  if (!found) throw new Error('Cannot find bundled hermes-shadowob-plugin directory')
  return found
}

function findCommandOnCurrentPath(command: string): string | null {
  const pathValue = process.env.PATH ?? process.env.Path ?? ''
  const separator = process.platform === 'win32' ? ';' : ':'
  const extensions =
    process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';') : ['']
  for (const dir of pathValue.split(separator).filter(Boolean)) {
    for (const ext of extensions) {
      const candidate = resolve(dir, process.platform === 'win32' ? `${command}${ext}` : command)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

function hermesPythonCommand(): string {
  const hermes = findCommandOnCurrentPath('hermes') ?? findCommandOnConnectorPath('hermes')
  const siblingPython = hermes ? resolve(dirname(hermes), 'python') : null
  const candidates = [siblingPython, '/opt/hermes/.venv/bin/python'].filter(
    (candidate): candidate is string => Boolean(candidate),
  )
  return candidates.find((candidate) => existsSync(candidate)) ?? 'python'
}

async function applyOpenClaw(
  options: CliOptions,
  behavior: { restart: boolean } = { restart: true },
): Promise<void> {
  const target = requireTarget(options)
  const modelProvider = modelProviderFromOptions(options)
  const plan = createConnectorPlan({ ...options, target, modelProvider })
  const configPath = resolveOpenClawConfigPath(options)

  await installShadowCliAndSkills(options)

  console.log(`Applying: Merge OpenClaw config ${configPath}`)
  const next = mergeOpenClawConfigContent(readExisting(configPath), {
    token: options.token,
    serverUrl: normalizeServerUrl(options.serverUrl),
    projectName: options.projectName,
    buddyId: options.buddyId,
    buddyName: options.buddyName,
    buddyDescription: options.buddyDescription,
    agentId: options.shadowAgentId,
    modelProvider,
  })
  writeFile(configPath, next, options.dryRun)

  if (options.install) {
    console.log('Applying: Install plugin')
    await runShellAsync('openclaw plugins install @shadowob/openclaw-shadowob', options.dryRun)
  }

  const restart = plan.commands.find((step) => step.label === 'Restart gateway')
  if (restart && behavior.restart) {
    console.log(`Applying: ${restart.label}`)
    await runShellAsync(restart.command, options.dryRun)
  }
}

async function applyHermes(options: CliOptions): Promise<void> {
  const target = requireTarget(options)
  const modelProvider = modelProviderFromOptions(options)
  const plan = createConnectorPlan({ ...options, target, modelProvider })
  const hermesDir = expandHome(options.hermesHome ?? process.env.HERMES_HOME ?? '~/.hermes')
  const pluginTarget = resolve(hermesDir, 'plugins/shadowob')
  const envPath = resolve(hermesDir, '.env')
  const configPath = resolve(hermesDir, 'config.yaml')
  const envBlock = plan.configBlocks.find((block) => block.label === '~/.hermes/.env')

  if (!envBlock) throw new Error('Hermes plan is missing config blocks')

  if (options.install) {
    await installShadowCliAndSkills(options)
  } else {
    writeShadowCliProfile(options)
  }

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
        projectName: options.projectName,
        buddyId: options.buddyId,
        buddyName: options.buddyName,
        buddyDescription: options.buddyDescription,
        agentId: options.shadowAgentId,
        modelProvider,
      })
  writeFile(envPath, nextEnv, options.dryRun)

  const nextConfig = mergeHermesConfigContent(options.force ? '' : readExisting(configPath), {
    token: options.token,
    serverUrl: normalizeServerUrl(options.serverUrl),
    projectName: options.projectName,
    buddyId: options.buddyId,
    buddyName: options.buddyName,
    buddyDescription: options.buddyDescription,
    agentId: options.shadowAgentId,
    modelProvider,
  })
  writeFile(configPath, nextConfig, options.dryRun)

  if (options.install) {
    const python = shellQuote(hermesPythonCommand())
    await runShellAsync(
      `${python} -m pip --version >/dev/null 2>&1 || ${python} -m ensurepip --upgrade`,
      options.dryRun,
    )
    await runShellAsync(
      `${python} -m pip install -r ${shellQuote(resolve(pluginTarget, 'requirements.txt'))}`,
      options.dryRun,
    )
    await runShellAsync('hermes plugins enable shadowob', options.dryRun)
  }

  if (options.start) {
    await runShellAsync('hermes gateway', options.dryRun)
  }
}

async function applyCcConnect(options: CliOptions): Promise<void> {
  const target = requireTarget(options)
  const modelProvider = modelProviderFromOptions(options)
  const plan = createConnectorPlan({ ...options, target, modelProvider })
  const configBlock = plan.configBlocks.find((block) => block.label === '~/.cc-connect/config.toml')
  if (!configBlock) throw new Error('cc-connect plan is missing config block')

  if (!options.dryRun) {
    assertDurableHomeForLocalWrites()
    assertDurableConnectorHome()
  }

  let binaryPath: string | undefined
  if (options.install || options.start) {
    const installed = await ensureCcConnectFork({
      dryRun: options.dryRun,
      log: (message) => console.log(message),
    })
    binaryPath = installed.binaryPath
    console.log(`cc-connect binary: ${binaryPath}`)
  }

  await installShadowCliAndSkills(options)

  const configPath = resolve(homedir(), '.cc-connect/config.toml')
  const nextConfig = options.force
    ? configBlock.content
    : mergeCcConnectConfigContent(readExisting(configPath), {
        token: options.token,
        serverUrl: normalizeServerUrl(options.serverUrl),
        projectName: options.projectName?.trim() || 'shadow-buddy',
        workDir: options.workDir?.trim() || '.',
        agentType: options.agentType?.trim() || 'codex',
        modelProvider,
      })
  writeFile(configPath, nextConfig, options.dryRun)

  if (options.start) {
    await releaseCcConnectConfigLock(options.dryRun, binaryPath)
    runBinary(binaryPath ?? 'cc-connect', [], options.dryRun)
  }
}

async function connect(options: CliOptions): Promise<void> {
  const target = requireTarget(options)
  if (target === 'openclaw') {
    await applyOpenClaw(options)
    return
  }
  if (target === 'hermes') {
    await applyHermes(options)
    return
  }
  await applyCcConnect(options)
}

async function repair(options: CliOptions, mode: 'fix' | 'update'): Promise<void> {
  const target = requireTarget(options)
  console.log(`Applying: ${mode} ${target} connector`)
  if (target === 'openclaw') {
    await applyOpenClaw(options, { restart: options.start })
    return
  }
  if (target === 'hermes') {
    await applyHermes({ ...options, start: options.start })
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
  } else if (options.command === 'runtime-scan') {
    await printRuntimeScan(options)
  } else if (options.command === 'runtime-install') {
    await installRuntime(options)
  } else if (options.command === 'runtime-watch') {
    await watchRuntimeSessions(options)
  } else if (options.command === 'session-list') {
    await printSessionList(options)
  } else if (options.command === 'session-send') {
    await sendSessionMessage(options)
  } else if (options.command === 'remove-buddy') {
    await removeLocalBuddy(options)
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
