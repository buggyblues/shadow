import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { Command, Option } from 'commander'
import {
  createLocalBridge,
  readLocalBridgeToken,
  resolveLocalBridgeRoot,
  resolveLocalBridgeToken,
} from '../utils/local-bridge.js'
import { output, outputError } from '../utils/output.js'

interface LocalBridgeConnectionGuide {
  checks: {
    doctorCommand: string
    inspectCommand: string
    logsCommand: string
    resourcesCommand: string
    startCommand: string
    statusCommand: string
    stopCommand: string
  }
  codex: {
    addCommand: string
  }
  extension: {
    address: string
    steps: string[]
    token: string
  }
  library: string
}

interface StartOptions {
  allowOrigin?: string[]
  detach?: boolean
  enableRuntime?: boolean
  json?: boolean
  log?: string
  port?: string
  quiet?: boolean
  root?: string
  token?: string
}

interface GuideOptions {
  json?: boolean
  port?: string
  root?: string
  token?: string
}

interface StatusOptions {
  json?: boolean
  root?: string
  token?: string
  url?: string
}

interface McpProxyOptions {
  root?: string
  token?: string
  url?: string
}

interface InspectOptions extends StatusOptions {
  limit?: string
  query?: string
}

interface LogsOptions {
  json?: boolean
  lines?: string
  root?: string
}

interface PluginRunOptions extends StatusOptions {
  idempotencyKey?: string
  name?: string
  option?: string[]
  optionsJson?: string
  timeout?: string
  wait?: boolean
}

interface TaskListOptions extends StatusOptions {
  limit?: string
}

interface TaskWaitOptions extends StatusOptions {
  timeout?: string
}

interface LibraryFilesOptions extends StatusOptions {
  cursor?: string
  limit?: string
  pathPrefix?: string
}

interface LibraryReadOptions extends StatusOptions {
  endLine?: string
  startLine?: string
}

interface RuntimeRunOptions extends StatusOptions {
  code?: string
  file?: string
  stdin?: string
  stdinFile?: string
  timeout?: string
}

interface McpServerRequestOptions extends StatusOptions {
  paramsJson?: string
}

interface ResourceCommandOptions extends StatusOptions {
  file?: string
  id?: string
  idempotencyKey?: string
  mimeType?: string
  payloadJson?: string
  replace?: boolean
  timeout?: string
  wait?: boolean
  yes?: boolean
}

interface LocalBridgeRuntimeState {
  background: boolean
  instanceId: string
  localRuntimeEnabled: boolean
  logPath?: string
  pid: number
  root: string
  startedAt: string
  url: string
  version: 1
}

export function createLocalBridgeCommand(): Command {
  const command = new Command('local-bridge').description(
    'Connect Shadow Clipper, local files, and MCP clients on this computer',
  )

  command
    .command('start')
    .description('Start the Local Bridge')
    .option('--root <directory>', 'Local library directory', '~/ClipperLibrary')
    .option('--port <number>', 'Loopback port', '32145')
    .option('--token <token>', 'Use a specific connection token')
    .option('--allow-origin <origin...>', 'Allow additional browser origins')
    .option('--enable-runtime', 'Allow explicitly requested local JavaScript and Python runs')
    .option('--detach', 'Run in the background')
    .option('--log <file>', 'Background log file')
    .option('--json', 'Print connection details as JSON')
    .addOption(new Option('--quiet').hideHelp())
    .action(startLocalBridge)

  command
    .command('status')
    .description('Check a running Local Bridge')
    .option('--url <url>', 'Local Bridge URL; defaults to the recorded running instance')
    .option('--root <directory>', 'Local library directory', '~/ClipperLibrary')
    .option('--token <token>', 'Use a specific connection token')
    .option('--json', 'Output as JSON')
    .action(showLocalBridgeStatus)

  command
    .command('stop')
    .description('Safely stop the Local Bridge for a library directory')
    .option('--url <url>', 'Local Bridge URL; defaults to the recorded running instance')
    .option('--root <directory>', 'Local library directory', '~/ClipperLibrary')
    .option('--token <token>', 'Use a specific connection token')
    .option('--json', 'Output as JSON')
    .action(stopLocalBridge)

  command
    .command('logs')
    .description('Show recent background Local Bridge logs')
    .option('--root <directory>', 'Local library directory', '~/ClipperLibrary')
    .option('--lines <number>', 'Number of lines to show', '100')
    .option('--json', 'Output as JSON')
    .action(showLocalBridgeLogs)

  const library = command.command('library').description('Read and search the synced library')

  addLocalBridgeConnectionOptions(
    library.command('overview').description('Summarize the synced library'),
  ).action(showLocalBridgeLibraryOverview)

  addLocalBridgeConnectionOptions(
    library
      .command('files')
      .description('List managed library files')
      .option('--limit <number>', 'Maximum files', '100')
      .option('--cursor <cursor>', 'Continue from a previous page')
      .option('--path-prefix <path>', 'Restrict results to a path prefix'),
  ).action(listLocalBridgeLibraryFiles)

  addLocalBridgeConnectionOptions(
    library
      .command('read <path>')
      .description('Read a managed text file')
      .option('--start-line <number>', 'First line to return', '1')
      .option('--end-line <number>', 'Last line to return'),
  ).action(readLocalBridgeLibraryFile)

  addLocalBridgeConnectionOptions(
    library
      .command('search <query>')
      .description('Search managed Markdown files')
      .option('--limit <number>', 'Maximum matches', '20')
      .option('--cursor <cursor>', 'Continue from a previous page')
      .option('--path-prefix <path>', 'Restrict results to a path prefix'),
  ).action(searchLocalBridgeLibrary)

  const plugins = command
    .command('plugins')
    .description('Discover and run capabilities provided by connected Shadow Clipper plugins')

  addLocalBridgeConnectionOptions(
    plugins.command('list').description('List connected plugins and their available tasks'),
  ).action(listLocalBridgePlugins)

  addLocalBridgeConnectionOptions(
    plugins
      .command('run <plugin-id> <task-id>')
      .description('Send a declared plugin task to Shadow Clipper')
      .option('--idempotency-key <key>', 'Reuse an existing task created with this key')
      .option('--name <name>', 'Optional task label')
      .option(
        '-O, --option <key=value>',
        'Task option; repeat for multiple values',
        collectValue,
        [],
      )
      .option('--options-json <json>', 'Task options as a JSON object')
      .option('--wait', 'Wait up to 30 seconds for the browser result')
      .option('--timeout <seconds>', 'Wait timeout in seconds, up to 60', '30'),
  ).action(runLocalBridgePluginTask)

  addLocalBridgeConnectionOptions(
    plugins
      .command('invoke <plugin-id> <interface-id>')
      .description('Invoke a callable plugin interface provided by Shadow Clipper')
      .option('--idempotency-key <key>', 'Reuse an existing task created with this key')
      .option('--name <name>', 'Optional task label')
      .option(
        '-O, --option <key=value>',
        'Interface option; repeat for multiple values',
        collectValue,
        [],
      )
      .option('--options-json <json>', 'Interface options as a JSON object')
      .option('--wait', 'Wait up to 30 seconds for the browser result')
      .option('--timeout <seconds>', 'Wait timeout in seconds, up to 60', '30'),
  ).action(invokeLocalBridgePluginInterface)

  const resources = command
    .command('resources')
    .description('Manage capabilities exposed by Shadow Clipper')
  addLocalBridgeConnectionOptions(
    resources.command('capabilities').description('List available resource operations'),
  ).action(listLocalBridgeResourceCapabilities)
  addResourceOperationOptions(
    resources.command('run <resource> <action>').description('Run a declared resource operation'),
    { allowFile: true, allowId: true },
  ).action(runLocalBridgeResourceOperation)

  registerResourceCommands(command)

  const tasks = command.command('tasks').description('Inspect and manage Shadow Clipper tasks')

  addLocalBridgeConnectionOptions(
    tasks
      .command('list')
      .description('List recent plugin tasks')
      .option('--limit <number>', 'Maximum tasks', '50'),
  ).action(listLocalBridgeTasks)

  addLocalBridgeConnectionOptions(
    tasks.command('get <task-id>').description('Read one plugin task'),
  ).action(getLocalBridgeTask)

  addLocalBridgeConnectionOptions(
    tasks
      .command('wait <task-id>')
      .description('Wait briefly for one plugin task to finish')
      .option('--timeout <seconds>', 'Wait timeout in seconds, up to 60', '30'),
  ).action(waitForLocalBridgeTaskCommand)

  addLocalBridgeConnectionOptions(
    tasks.command('cancel <task-id>').description('Cancel a task that has not started'),
  ).action(cancelLocalBridgeTask)

  const runtimes = command
    .command('runtimes')
    .description('Inspect and use explicitly enabled local runtimes')

  addLocalBridgeConnectionOptions(
    runtimes.command('list').description('List available local runtimes'),
  ).action(listLocalBridgeRuntimes)

  addLocalBridgeConnectionOptions(
    runtimes
      .command('run <runtime>')
      .description('Run JavaScript or Python through the Local Bridge')
      .option('--code <code>', 'Inline source code')
      .option('--file <path>', 'Read source code from a file')
      .option('--stdin <text>', 'Standard input text')
      .option('--stdin-file <path>', 'Read standard input from a file')
      .option('--timeout <seconds>', 'Safety timeout in seconds, up to 600', '120'),
  ).action(runLocalBridgeRuntime)

  const mcpServers = command
    .command('mcp-servers')
    .description('Access local MCP servers configured behind the Local Bridge')

  addLocalBridgeConnectionOptions(
    mcpServers.command('list').description('List configured local MCP servers'),
  ).action(listLocalBridgeMcpServers)

  addLocalBridgeConnectionOptions(
    mcpServers
      .command('request <server-id> <method>')
      .description('Send one supported request to a configured local MCP server')
      .option('--params-json <json>', 'MCP method parameters as a JSON object', '{}'),
  ).action(requestLocalBridgeMcpServer)

  command
    .command('inspect')
    .description('Inspect the synced library and connected browser tasks through MCP')
    .option('--url <url>', 'Local Bridge URL; defaults to the recorded running instance')
    .option('--root <directory>', 'Local library directory', '~/ClipperLibrary')
    .option('--token <token>', 'Use a specific connection token')
    .option('--query <text>', 'Also search the library for this text')
    .option('--limit <number>', 'Maximum search results', '10')
    .option('--json', 'Output as JSON')
    .action(inspectLocalBridge)

  command
    .command('doctor')
    .description('Diagnose the token, running service, library sync, and browser connection')
    .option('--url <url>', 'Local Bridge URL; defaults to the recorded running instance')
    .option('--root <directory>', 'Local library directory', '~/ClipperLibrary')
    .option('--token <token>', 'Use a specific connection token')
    .option('--json', 'Output as JSON')
    .action(diagnoseLocalBridge)

  command
    .command('guide')
    .description('Show the Shadow Clipper and Codex connection steps')
    .option('--root <directory>', 'Local library directory', '~/ClipperLibrary')
    .option('--port <number>', 'Loopback port', '32145')
    .option('--token <token>', 'Use a specific connection token')
    .option('--json', 'Output as JSON')
    .action(showLocalBridgeGuide)

  command
    .command('mcp')
    .description('Connect an MCP client to a running Local Bridge over stdio')
    .option('--url <url>', 'Local Bridge URL; defaults to the recorded running instance')
    .option('--root <directory>', 'Local library directory', '~/ClipperLibrary')
    .option('--token <token>', 'Use a specific connection token')
    .action(runLocalBridgeMcpProxy)

  return command
}

function addLocalBridgeConnectionOptions(command: Command): Command {
  return command
    .option('--url <url>', 'Local Bridge URL; defaults to the recorded running instance')
    .option('--root <directory>', 'Local library directory', '~/ClipperLibrary')
    .option('--token <token>', 'Use a specific connection token')
    .option('--json', 'Output as JSON')
}

function addResourceOperationOptions(
  command: Command,
  options: { allowFile?: boolean; allowId?: boolean; allowPayload?: boolean } = {},
): Command {
  addLocalBridgeConnectionOptions(command)
  if (options.allowId) command.option('--id <id>', 'Resource identifier')
  if (options.allowFile) {
    command.option('--file <path>', 'Local file to upload')
    command.option('--mime-type <type>', 'Override uploaded file media type')
  }
  command
    .option('--payload-json <json>', 'Operation payload as a JSON object', '{}')
    .option('--replace', 'Allow an existing resource to be updated')
    .option('--yes', 'Confirm a remove operation')
    .option('--idempotency-key <key>', 'Reuse an existing operation created with this key')
    .option('--no-wait', 'Return after queueing instead of waiting for the browser result')
    .option('--timeout <seconds>', 'Wait timeout in seconds, up to 60', '30')
  return command
}

function registerResourceCommands(command: Command): void {
  const definitions: Array<{
    command: string
    description: string
    resource: string
    actions: Array<{ action: string; argument?: 'id' | 'file'; description: string }>
  }> = [
    {
      command: 'custom-plugins',
      description: 'Publish and manage safe declarative browser plugins',
      resource: 'custom-plugins',
      actions: [
        { action: 'list', description: 'List custom plugins' },
        { action: 'get', argument: 'id', description: 'Read a custom plugin manifest' },
        { action: 'validate', argument: 'file', description: 'Validate a plugin.json manifest' },
        {
          action: 'publish',
          argument: 'file',
          description: 'Publish or update a plugin.json manifest',
        },
        { action: 'remove', argument: 'id', description: 'Remove a custom plugin' },
      ],
    },
    {
      command: 'plugin-settings',
      description: 'Read and update plugin settings',
      resource: 'plugin-settings',
      actions: [
        { action: 'list', description: 'List settings for all plugins' },
        { action: 'get', argument: 'id', description: 'Read one plugin setting' },
        {
          action: 'set',
          argument: 'id',
          description: 'Set enabled state or plugin options using --payload-json',
        },
        { action: 'reset', argument: 'id', description: 'Reset one plugin to default options' },
      ],
    },
    {
      command: 'plugin-agents',
      description: 'Inspect Agents, interfaces, and tasks exposed by plugins',
      resource: 'plugin-agents',
      actions: [
        { action: 'list', description: 'List plugin Agent interfaces and tasks' },
        { action: 'get', argument: 'id', description: 'Read one plugin Agent surface' },
      ],
    },
    {
      command: 'pets',
      description: 'Install and select Codex Pet packages',
      resource: 'pets',
      actions: [
        { action: 'list', description: 'List installed Codex Pets' },
        { action: 'get', argument: 'id', description: 'Read one Codex Pet' },
        { action: 'install', argument: 'file', description: 'Install a .codex-pet.zip package' },
        { action: 'select', argument: 'id', description: 'Select the active Codex Pet' },
        { action: 'remove', argument: 'id', description: 'Remove a Codex Pet' },
      ],
    },
    {
      command: 'themes',
      description: 'Read and apply Shadow Clipper themes',
      resource: 'themes',
      actions: [
        { action: 'get', description: 'Read the active theme and appearance' },
        { action: 'apply', description: 'Apply theme and appearance using --payload-json' },
        { action: 'reset', description: 'Restore the default theme' },
      ],
    },
    {
      command: 'wallpapers',
      description: 'Install and select workspace wallpapers',
      resource: 'wallpapers',
      actions: [
        { action: 'list', description: 'List built-in and custom wallpapers' },
        { action: 'get', description: 'Read the active wallpaper' },
        {
          action: 'install',
          argument: 'file',
          description: 'Install or update a custom wallpaper',
        },
        { action: 'select', argument: 'id', description: 'Select a wallpaper' },
        { action: 'remove', description: 'Remove the custom wallpaper' },
      ],
    },
    {
      command: 'skills',
      description: 'Install and manage Agent Skills',
      resource: 'skills',
      actions: [
        { action: 'list', description: 'List installed Skills' },
        { action: 'get', argument: 'id', description: 'Read one installed Skill' },
        { action: 'install', argument: 'file', description: 'Install a Skill zip or SKILL.md' },
        { action: 'enable', argument: 'id', description: 'Enable a Skill' },
        { action: 'disable', argument: 'id', description: 'Disable a Skill' },
        { action: 'remove', argument: 'id', description: 'Remove a Skill' },
      ],
    },
  ]
  for (const definition of definitions) {
    const group = command.command(definition.command).description(definition.description)
    for (const item of definition.actions) {
      const syntax = item.argument ? `${item.action} <${item.argument}>` : item.action
      const subcommand = addResourceOperationOptions(
        group.command(syntax).description(item.description),
        { allowFile: item.argument === 'file' },
      )
      if (item.argument === 'id') {
        subcommand.action((id: string, options: ResourceCommandOptions) =>
          runResourceAlias(definition.resource, item.action, id, undefined, options),
        )
      } else if (item.argument === 'file') {
        subcommand.action((file: string, options: ResourceCommandOptions) =>
          runResourceAlias(definition.resource, item.action, undefined, file, options),
        )
      } else {
        subcommand.action((options: ResourceCommandOptions) =>
          runResourceAlias(definition.resource, item.action, undefined, undefined, options),
        )
      }
    }
  }
}

async function startLocalBridge(options: StartOptions): Promise<void> {
  let runtimeState: LocalBridgeRuntimeState | undefined
  try {
    const root = resolveLocalBridgeRoot(options.root)
    const port = parsePort(options.port)
    if (options.detach) {
      await startDetachedLocalBridge(root, port, options)
      return
    }
    if (options.log && !options.quiet) throw new Error('--log can only be used with --detach')
    await clearStaleLocalBridgeState(root)
    const bridge = await createLocalBridge({
      allowedOrigins: options.allowOrigin,
      localRuntimeEnabled: Boolean(options.enableRuntime),
      root,
      token: options.token,
    })
    await new Promise<void>((resolveListen, rejectListen) => {
      bridge.server.once('error', rejectListen)
      bridge.server.listen(port, '127.0.0.1', resolveListen)
    })
    const address = bridge.server.address() as AddressInfo
    const url = `http://127.0.0.1:${address.port}`
    const guide = buildConnectionGuide(root, url, bridge.token)
    runtimeState = {
      background: Boolean(options.quiet),
      instanceId: bridge.instanceId,
      localRuntimeEnabled: bridge.localRuntimeEnabled,
      ...(options.log ? { logPath: resolveLogFile(options.log, root) } : {}),
      pid: process.pid,
      root,
      startedAt: bridge.startedAt,
      url,
      version: 1,
    }
    await writeLocalBridgeState(runtimeState)

    if (!options.quiet && options.json) {
      output(
        {
          background: false,
          instanceId: bridge.instanceId,
          localRuntimeEnabled: bridge.localRuntimeEnabled,
          ok: true,
          ...guide,
        },
        { json: true },
      )
    } else if (!options.quiet) {
      printConnectionGuide(guide, { mode: 'foreground' })
      if (!bridge.localRuntimeEnabled) {
        console.log('')
        console.log('Local code execution is off. Use --enable-runtime only when you need it.')
      }
    }

    await new Promise<void>((resolveClose) => {
      const close = () => void bridge.shutdown()
      bridge.server.once('close', resolveClose)
      process.once('SIGINT', close)
      process.once('SIGTERM', close)
      bridge.server.once('close', () => {
        process.removeListener('SIGINT', close)
        process.removeListener('SIGTERM', close)
      })
    })
  } catch (error) {
    const message =
      record(error).code === 'EADDRINUSE'
        ? `Port ${options.port ?? '32145'} is already in use. Run local-bridge status or choose another --port.`
        : error instanceof Error
          ? error.message
          : String(error)
    outputError(message, { json: options.json })
    process.exitCode = 1
  } finally {
    if (runtimeState) await clearLocalBridgeState(runtimeState.root, runtimeState.instanceId)
  }
}

async function startDetachedLocalBridge(
  root: string,
  port: number,
  options: StartOptions,
): Promise<void> {
  await clearStaleLocalBridgeState(root)
  const token = await resolveLocalBridgeToken(root, options.token)
  const logPath = resolveLogFile(options.log, root)
  await mkdir(dirname(logPath), { recursive: true })
  const log = await open(logPath, 'a', 0o600)
  await log.chmod(0o600)
  let child: ReturnType<typeof spawn> | undefined
  try {
    const entry = process.argv[1]
    if (!entry) throw new Error('Unable to locate the Shadow CLI executable')
    const args = [
      entry,
      'local-bridge',
      'start',
      '--root',
      root,
      '--port',
      String(port),
      '--quiet',
      '--log',
      logPath,
      ...(options.enableRuntime ? ['--enable-runtime'] : []),
      ...(options.allowOrigin?.length ? ['--allow-origin', ...options.allowOrigin] : []),
    ]
    child = spawn(process.execPath, args, {
      detached: true,
      env: process.env,
      stdio: ['ignore', log.fd, log.fd],
    })
    child.unref()
  } finally {
    await log.close()
  }
  if (!child.pid) throw new Error('Unable to start Local Bridge in the background')
  let state: LocalBridgeRuntimeState
  try {
    state = await waitForLocalBridgeStart(root, child.pid)
  } catch (error) {
    child.kill('SIGTERM')
    const recentLog = await readRecentLog(logPath, 20).catch(() => '')
    throw new Error(
      `${error instanceof Error ? error.message : 'Local Bridge did not start'}${recentLog ? `\n${recentLog}` : ''}`,
    )
  }
  const guide = buildConnectionGuide(root, state.url, token)
  if (options.json) {
    output(
      {
        background: true,
        instanceId: state.instanceId,
        localRuntimeEnabled: state.localRuntimeEnabled,
        logPath,
        ok: true,
        pid: state.pid,
        ...guide,
      },
      { json: true },
    )
  } else {
    printConnectionGuide(guide, { logPath, mode: 'background' })
  }
}

async function waitForLocalBridgeStart(
  root: string,
  pid: number,
): Promise<LocalBridgeRuntimeState> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const state = await readLocalBridgeState(root)
    if (state?.pid === pid) {
      const health = await fetchHealth(state.url)
      if (health?.instanceId === state.instanceId) return state
    }
    await delay(50)
  }
  throw new Error('Timed out waiting for the background Local Bridge')
}

async function clearStaleLocalBridgeState(root: string): Promise<void> {
  const state = await readLocalBridgeState(root)
  if (!state) return
  const health = await fetchHealth(state.url)
  if (health?.instanceId === state.instanceId) {
    throw new Error(`Local Bridge is already running at ${state.url}`)
  }
  await clearLocalBridgeState(root, state.instanceId)
}

async function showLocalBridgeStatus(options: StatusOptions): Promise<void> {
  try {
    const root = resolveLocalBridgeRoot(options.root)
    const token = await readLocalBridgeToken(root, options.token)
    const url = await resolveLocalBridgeUrl(root, options.url)
    const headers = { Authorization: `Bearer ${token}` }
    const [health, library, tasks] = await Promise.all([
      fetchJson(`${url}/v1/health`),
      fetchJson(`${url}/v1/library/status`, headers),
      fetchJson(`${url}/v1/tasks`, headers),
    ])
    const taskList = Array.isArray(tasks.tasks) ? tasks.tasks : []
    const state = await readLocalBridgeState(root)
    const activeState = state?.instanceId === health.instanceId ? state : undefined
    const result = {
      instance: {
        background: activeState?.background,
        instanceId: health.instanceId,
        logPath: activeState?.logPath,
        pid: activeState?.pid,
        startedAt: health.startedAt,
        uptimeSeconds: health.uptimeSeconds,
      },
      library,
      ok: health.ok === true && library.ok === true && tasks.ok === true,
      service: health.service,
      tasks: {
        cancelled: taskList.filter((task) => record(task).status === 'cancelled').length,
        queued: taskList.filter((task) => record(task).status === 'queued').length,
        running: taskList.filter((task) => record(task).status === 'running').length,
        total: taskList.length,
      },
      url,
    }
    output(result, { json: options.json })
    if (!result.ok) process.exitCode = 1
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

async function stopLocalBridge(options: StatusOptions): Promise<void> {
  try {
    const root = resolveLocalBridgeRoot(options.root)
    const token = await readLocalBridgeToken(root, options.token)
    const state = await readLocalBridgeState(root)
    const url = await resolveLocalBridgeUrl(root, options.url)
    const health = await fetchJson(`${url}/v1/health`)
    if (!options.url && state?.instanceId && health.instanceId !== state.instanceId) {
      throw new Error('The recorded Local Bridge instance does not match the service on this port')
    }
    const stopped = await fetchJson(
      `${url}/v1/admin/stop`,
      {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      'POST',
    )
    await waitForLocalBridgeStop(url)
    if (typeof stopped.instanceId === 'string') {
      await clearLocalBridgeState(root, stopped.instanceId)
    }
    output(
      {
        instanceId: stopped.instanceId,
        ok: stopped.ok === true,
        stopped: true,
        url,
      },
      { json: options.json },
    )
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

async function showLocalBridgeLogs(options: LogsOptions): Promise<void> {
  try {
    const root = resolveLocalBridgeRoot(options.root)
    const state = await readLocalBridgeState(root)
    const logPath = state?.logPath ?? localBridgeLogPath(root)
    const lines = parseIntegerOption(options.lines, 1, 10_000, 'Lines')
    const content = await readFile(logPath, 'utf8')
    const trimmed = content.replace(/\s+$/, '')
    const selected = trimmed ? trimmed.split(/\r?\n/).slice(-lines) : []
    if (options.json) {
      output({ lines: selected, logPath, ok: true }, { json: true })
    } else {
      output(selected.join('\n'), {})
    }
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

async function showLocalBridgeLibraryOverview(options: StatusOptions): Promise<void> {
  try {
    const { token, url } = await resolveLocalBridgeConnection(options)
    const overview = await fetchJson(`${url}/v1/library/overview`, authorizationHeaders(token))
    output(overview, { json: options.json })
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

async function listLocalBridgeLibraryFiles(options: LibraryFilesOptions): Promise<void> {
  try {
    const { token, url } = await resolveLocalBridgeConnection(options)
    const endpoint = localBridgeEndpoint(url, '/v1/library/files', {
      cursor: options.cursor,
      limit: String(parseIntegerOption(options.limit, 1, 200, 'Limit')),
      pathPrefix: options.pathPrefix,
    })
    const result = await fetchJson(endpoint, authorizationHeaders(token))
    const files = Array.isArray(result.files) ? result.files : []
    if (options.json) output(result, { json: true })
    else {
      for (const file of files) console.log(String(record(file).path ?? ''))
      if (typeof result.nextCursor === 'string') console.log(`Next cursor: ${result.nextCursor}`)
    }
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

async function readLocalBridgeLibraryFile(
  path: string,
  options: LibraryReadOptions,
): Promise<void> {
  try {
    const { token, url } = await resolveLocalBridgeConnection(options)
    const result = await fetchJson(
      localBridgeEndpoint(url, '/v1/library/read', {
        endLine: options.endLine
          ? String(parseIntegerOption(options.endLine, 1, 10_000_000, 'End line'))
          : undefined,
        path,
        startLine: String(parseIntegerOption(options.startLine, 1, 10_000_000, 'Start line')),
      }),
      authorizationHeaders(token),
    )
    if (options.json) output(result, { json: true })
    else console.log(String(result.text ?? ''))
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

async function searchLocalBridgeLibrary(
  query: string,
  options: LibraryFilesOptions,
): Promise<void> {
  try {
    const { token, url } = await resolveLocalBridgeConnection(options)
    const result = await fetchJson(
      localBridgeEndpoint(url, '/v1/library/search', {
        cursor: options.cursor,
        limit: String(parseIntegerOption(options.limit, 1, 50, 'Limit')),
        pathPrefix: options.pathPrefix,
        query,
      }),
      authorizationHeaders(token),
    )
    const matches = Array.isArray(result.matches) ? result.matches : []
    if (options.json) output(result, { json: true })
    else {
      for (const matchValue of matches) {
        const match = record(matchValue)
        console.log(`${String(match.title ?? match.path ?? '')}  ${String(match.path ?? '')}`)
        if (typeof match.excerpt === 'string') console.log(`  ${match.excerpt}`)
      }
      if (typeof result.nextCursor === 'string') console.log(`Next cursor: ${result.nextCursor}`)
    }
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

async function listLocalBridgePlugins(options: StatusOptions): Promise<void> {
  try {
    const { token, url } = await resolveLocalBridgeConnection(options)
    const response = await fetchJson(`${url}/v1/plugins`, authorizationHeaders(token))
    const clients = Array.isArray(response.clients) ? response.clients : []
    if (options.json) {
      output({ clients, connected: clients.length > 0, ok: true, url }, { json: true })
    } else {
      printPluginCapabilities(clients)
    }
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

async function listLocalBridgeResourceCapabilities(options: StatusOptions): Promise<void> {
  try {
    const { token, url } = await resolveLocalBridgeConnection(options)
    const result = await fetchJson(`${url}/v1/resources/capabilities`, authorizationHeaders(token))
    if (options.json) output(result, { json: true })
    else {
      for (const clientValue of Array.isArray(result.clients) ? result.clients : []) {
        const client = record(clientValue)
        console.log(`Client: ${String(client.clientId ?? 'unknown')}`)
        for (const [resource, actions] of Object.entries(record(client.resources))) {
          console.log(`  ${resource}: ${Array.isArray(actions) ? actions.join(', ') : ''}`)
        }
      }
    }
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

async function runLocalBridgeResourceOperation(
  resource: string,
  action: string,
  options: ResourceCommandOptions,
): Promise<void> {
  await runResourceAlias(resource, action, options.id, options.file, options)
}

async function runResourceAlias(
  resource: string,
  action: string,
  id: string | undefined,
  file: string | undefined,
  options: ResourceCommandOptions,
): Promise<void> {
  try {
    const { token, url } = await resolveLocalBridgeConnection(options)
    const payload = parseJsonObject(options.payloadJson, '--payload-json')
    if (options.replace) payload.replace = true
    if (action === 'remove') {
      if (!options.yes) throw new Error('Remove operations require --yes')
      payload.confirm = true
    }
    const artifactId = file
      ? await uploadLocalBridgeArtifact(url, token, file, options.mimeType)
      : undefined
    const queued = await fetchJson(
      `${url}/v1/resources/${encodeURIComponent(resource)}/${encodeURIComponent(action)}`,
      authorizationHeaders(token, true),
      'POST',
      {
        ...(artifactId ? { artifactId } : {}),
        ...(id?.trim() ? { id: id.trim() } : {}),
        ...(options.idempotencyKey?.trim()
          ? { idempotencyKey: options.idempotencyKey.trim() }
          : {}),
        payload,
      },
    )
    let task = record(queued.task)
    if (options.wait !== false && typeof task.id === 'string') {
      task = await waitForTaskViaApi(url, token, task.id, parseTimeoutMs(options.timeout))
    }
    if (options.json) output({ ok: true, resource, action, task, url }, { json: true })
    else
      printTask(
        task,
        options.wait === false ? 'Resource operation queued' : 'Resource operation result',
      )
    if (task.status === 'failed') process.exitCode = 1
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

async function uploadLocalBridgeArtifact(
  url: string,
  token: string,
  input: string,
  mimeType?: string,
): Promise<string> {
  const path = resolveUserFile(input)
  const bytes = await readFile(path)
  if (!bytes.byteLength || bytes.byteLength > 32 * 1024 * 1024)
    throw new Error('Upload must be between 1 byte and 32 MB')
  const filename = path.replace(/\\/g, '/').split('/').pop() || 'artifact.bin'
  const response = await fetch(`${url}/v1/artifacts`, {
    body: bytes,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': mimeType?.trim() || commandArtifactMimeType(filename),
      'X-Clipper-Filename': encodeURIComponent(filename),
    },
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
  })
  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok)
    throw new Error(
      typeof result.error === 'string' ? result.error : `Local Bridge HTTP ${response.status}`,
    )
  const id = record(result.artifact).id
  if (typeof id !== 'string') throw new Error('Local Bridge did not return an artifact ID')
  return id
}

function commandArtifactMimeType(filename: string): string {
  if (/\.json$/i.test(filename)) return 'application/json'
  if (/\.png$/i.test(filename)) return 'image/png'
  if (/\.webp$/i.test(filename)) return 'image/webp'
  if (/\.jpe?g$/i.test(filename)) return 'image/jpeg'
  if (/\.gif$/i.test(filename)) return 'image/gif'
  if (/\.md$/i.test(filename)) return 'text/markdown'
  if (/\.zip$/i.test(filename)) return 'application/zip'
  return 'application/octet-stream'
}

async function runLocalBridgePluginTask(
  pluginId: string,
  taskId: string,
  options: PluginRunOptions,
): Promise<void> {
  try {
    const { token, url } = await resolveLocalBridgeConnection(options)
    const taskOptions = parsePluginTaskOptions(options.optionsJson, options.option)
    const queued = await fetchJson(`${url}/v1/tasks`, authorizationHeaders(token, true), 'POST', {
      ...(options.idempotencyKey?.trim() ? { idempotencyKey: options.idempotencyKey.trim() } : {}),
      ...(options.name?.trim() ? { name: options.name.trim() } : {}),
      options: taskOptions,
      pluginId,
      taskId,
    })
    let task = record(queued.task)
    if (options.wait && typeof task.id === 'string') {
      task = await waitForTaskViaApi(url, token, task.id, parseTimeoutMs(options.timeout))
    }
    if (options.json) {
      output({ ok: true, task, url, waited: Boolean(options.wait) }, { json: true })
    } else {
      printTask(task, options.wait ? 'Task result' : 'Task queued')
    }
    if (task.status === 'failed') process.exitCode = 1
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

async function invokeLocalBridgePluginInterface(
  pluginId: string,
  interfaceId: string,
  options: PluginRunOptions,
): Promise<void> {
  try {
    const { token, url } = await resolveLocalBridgeConnection(options)
    const queued = await fetchJson(
      `${url}/v1/plugins/${encodeURIComponent(pluginId)}/interfaces/${encodeURIComponent(interfaceId)}/run`,
      authorizationHeaders(token, true),
      'POST',
      {
        ...(options.idempotencyKey?.trim()
          ? { idempotencyKey: options.idempotencyKey.trim() }
          : {}),
        ...(options.name?.trim() ? { name: options.name.trim() } : {}),
        options: parsePluginTaskOptions(options.optionsJson, options.option),
      },
    )
    let task = record(queued.task)
    if (options.wait && typeof task.id === 'string') {
      task = await waitForTaskViaApi(url, token, task.id, parseTimeoutMs(options.timeout))
    }
    if (options.json) {
      output(
        { interfaceId, ok: true, pluginId, task, url, waited: Boolean(options.wait) },
        { json: true },
      )
    } else {
      printTask(task, options.wait ? 'Interface result' : 'Interface queued')
    }
    if (task.status === 'failed') process.exitCode = 1
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

async function listLocalBridgeTasks(options: TaskListOptions): Promise<void> {
  try {
    const { token, url } = await resolveLocalBridgeConnection(options)
    const response = await fetchJson(`${url}/v1/tasks`, authorizationHeaders(token))
    const limit = parseIntegerOption(options.limit, 1, 200, 'Limit')
    const tasks = (Array.isArray(response.tasks) ? response.tasks : []).slice(0, limit)
    if (options.json) output({ ok: true, tasks, url }, { json: true })
    else printTasks(tasks)
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

async function getLocalBridgeTask(taskId: string, options: StatusOptions): Promise<void> {
  try {
    const { token, url } = await resolveLocalBridgeConnection(options)
    const response = await fetchJson(
      `${url}/v1/tasks/${encodeURIComponent(taskId)}`,
      authorizationHeaders(token),
    )
    const task = record(response.task)
    if (options.json) output({ ok: true, task, url }, { json: true })
    else printTask(task, 'Task')
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

async function waitForLocalBridgeTaskCommand(
  taskId: string,
  options: TaskWaitOptions,
): Promise<void> {
  try {
    const { token, url } = await resolveLocalBridgeConnection(options)
    const task = await waitForTaskViaApi(url, token, taskId, parseTimeoutMs(options.timeout))
    if (options.json) output({ ok: true, task, url }, { json: true })
    else printTask(task, 'Task result')
    if (task.status === 'failed') process.exitCode = 1
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

async function cancelLocalBridgeTask(taskId: string, options: StatusOptions): Promise<void> {
  try {
    const { token, url } = await resolveLocalBridgeConnection(options)
    const response = await fetchJson(
      `${url}/v1/tasks/${encodeURIComponent(taskId)}/cancel`,
      authorizationHeaders(token, true),
      'POST',
    )
    const task = record(response.task)
    if (options.json) output({ ok: true, task, url }, { json: true })
    else printTask(task, 'Task cancelled')
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

async function listLocalBridgeRuntimes(options: StatusOptions): Promise<void> {
  try {
    const { token, url } = await resolveLocalBridgeConnection(options)
    const result = await fetchJson(`${url}/v1/runtimes`, authorizationHeaders(token))
    if (options.json) output(result, { json: true })
    else {
      for (const runtimeValue of Array.isArray(result.runtimes) ? result.runtimes : []) {
        const runtime = record(runtimeValue)
        console.log(
          `${String(runtime.id ?? 'unknown')}  ${runtime.available === true ? 'available' : 'unavailable'}${runtime.version ? `  ${String(runtime.version)}` : ''}`,
        )
      }
    }
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

async function runLocalBridgeRuntime(runtime: string, options: RuntimeRunOptions): Promise<void> {
  try {
    if (runtime !== 'javascript' && runtime !== 'python') {
      throw new Error('Runtime must be javascript or python')
    }
    if (Boolean(options.code) === Boolean(options.file)) {
      throw new Error('Provide exactly one of --code or --file')
    }
    if (options.stdin !== undefined && options.stdinFile) {
      throw new Error('Use only one of --stdin or --stdin-file')
    }
    const [code, stdin] = await Promise.all([
      options.file
        ? readFile(resolveUserFile(options.file), 'utf8')
        : Promise.resolve(options.code ?? ''),
      options.stdinFile
        ? readFile(resolveUserFile(options.stdinFile), 'utf8')
        : Promise.resolve(options.stdin ?? ''),
    ])
    const { token, url } = await resolveLocalBridgeConnection(options)
    const result = await fetchJson(
      `${url}/v1/runtimes/execute`,
      authorizationHeaders(token, true),
      'POST',
      {
        code,
        runtime,
        stdin,
        timeoutMs: parseIntegerOption(options.timeout, 1, 600, 'Timeout') * 1_000,
      },
    )
    if (options.json) output(result, { json: true })
    else {
      if (typeof result.stdout === 'string' && result.stdout) process.stdout.write(result.stdout)
      if (typeof result.stderr === 'string' && result.stderr) process.stderr.write(result.stderr)
      if (result.error) console.error(String(result.error))
    }
    if (result.ok !== true) process.exitCode = 1
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

async function listLocalBridgeMcpServers(options: StatusOptions): Promise<void> {
  try {
    const { token, url } = await resolveLocalBridgeConnection(options)
    const result = await fetchJson(`${url}/v1/mcp-servers`, authorizationHeaders(token))
    if (options.json) output(result, { json: true })
    else {
      for (const serverValue of Array.isArray(result.servers) ? result.servers : []) {
        console.log(String(record(serverValue).id ?? ''))
      }
    }
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

async function requestLocalBridgeMcpServer(
  serverId: string,
  method: string,
  options: McpServerRequestOptions,
): Promise<void> {
  try {
    const params = parseJsonObject(options.paramsJson, '--params-json')
    const { token, url } = await resolveLocalBridgeConnection(options)
    const result = await fetchJson(
      `${url}/v1/mcp-servers/${encodeURIComponent(serverId)}/request`,
      authorizationHeaders(token, true),
      'POST',
      { method, params },
    )
    output(options.json ? result : result.result, { json: options.json })
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

async function inspectLocalBridge(options: InspectOptions): Promise<void> {
  try {
    const root = resolveLocalBridgeRoot(options.root)
    const token = await readLocalBridgeToken(root, options.token)
    const url = await resolveLocalBridgeUrl(root, options.url)
    const limit = parseIntegerOption(options.limit, 1, 50, 'Limit')
    const [overview, plugins, tasks, search] = await Promise.all([
      callLocalBridgeTool(url, token, 'clipper_library_overview', {}),
      callLocalBridgeTool(url, token, 'clipper_list_plugins', {}),
      callLocalBridgeTool(url, token, 'clipper_list_tasks', { limit: 20 }),
      options.query?.trim()
        ? callLocalBridgeTool(url, token, 'clipper_search_library', {
            limit,
            query: options.query.trim(),
          })
        : undefined,
    ])
    output(
      {
        ok: true,
        overview,
        plugins,
        ...(search ? { search } : {}),
        tasks,
        url,
      },
      { json: options.json },
    )
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

async function diagnoseLocalBridge(options: StatusOptions): Promise<void> {
  const root = resolveLocalBridgeRoot(options.root)
  let url: string
  try {
    url = await resolveLocalBridgeUrl(root, options.url)
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
    return
  }
  const checks: Array<{ check: string; message: string; ok: boolean }> = []
  let token = ''
  try {
    token = await readLocalBridgeToken(root, options.token)
    checks.push({ check: 'token', message: 'Connection token is available', ok: true })
  } catch {
    checks.push({
      check: 'token',
      message: `No token found. Start the bridge once with --root ${root}`,
      ok: false,
    })
  }
  if (token) {
    try {
      const health = await fetchJson(`${url}/v1/health`)
      checks.push({
        check: 'service',
        message: health.ok === true ? `Local Bridge is running at ${url}` : 'Health check failed',
        ok: health.ok === true,
      })
      const library = await fetchJson(`${url}/v1/library/status`, {
        Authorization: `Bearer ${token}`,
      })
      const fileCount = Number(record(library.files).total ?? library.files ?? 0)
      checks.push({
        check: 'library',
        message:
          fileCount > 0
            ? `${fileCount} managed files are available`
            : 'The library is empty. Choose Sync now in Shadow Clipper.',
        ok: fileCount > 0,
      })
      const clients = Array.isArray(library.clients) ? library.clients : []
      checks.push({
        check: 'browser',
        message:
          clients.length > 0
            ? `${clients.length} Shadow Clipper client${clients.length === 1 ? ' is' : 's are'} connected`
            : 'No recent Shadow Clipper heartbeat. Open Chrome and test the connection.',
        ok: clients.length > 0,
      })
    } catch (error) {
      checks.push({
        check: 'service',
        message: error instanceof Error ? error.message : 'Local Bridge is unavailable',
        ok: false,
      })
    }
  }
  const result = { checks, ok: checks.length >= 4 && checks.every((check) => check.ok), root, url }
  output(result, { json: options.json })
  if (!result.ok) process.exitCode = 1
}

async function showLocalBridgeGuide(options: GuideOptions): Promise<void> {
  try {
    const root = resolveLocalBridgeRoot(options.root)
    const port = parsePort(options.port)
    const token = await resolveLocalBridgeToken(root, options.token)
    const guide = buildConnectionGuide(root, `http://127.0.0.1:${port}`, token)
    if (options.json) output(guide, { json: true })
    else printConnectionGuide(guide, { mode: 'guide' })
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exitCode = 1
  }
}

export function buildConnectionGuide(
  library: string,
  address: string,
  token: string,
): LocalBridgeConnectionGuide {
  return {
    checks: {
      doctorCommand: `shadowob local-bridge doctor --url ${address} --root ${shellQuote(library)}`,
      inspectCommand: `shadowob local-bridge inspect --url ${address} --root ${shellQuote(library)}`,
      logsCommand: `shadowob local-bridge logs --root ${shellQuote(library)}`,
      resourcesCommand: `shadowob local-bridge resources capabilities --url ${address} --root ${shellQuote(library)}`,
      startCommand: `shadowob local-bridge start --detach --port ${new URL(address).port || '80'} --root ${shellQuote(library)}`,
      statusCommand: `shadowob local-bridge status --url ${address} --root ${shellQuote(library)}`,
      stopCommand: `shadowob local-bridge stop --url ${address} --root ${shellQuote(library)}`,
    },
    codex: {
      addCommand: `codex mcp add shadow-clipper -- shadowob local-bridge mcp --url ${address} --root ${shellQuote(library)}`,
    },
    extension: {
      address,
      steps: [
        'Open Shadow Clipper → Settings → Sync → Local Bridge.',
        'Paste the address and token shown here, then choose Test connection.',
        'Choose Sync now once; later library changes can sync automatically.',
      ],
      token,
    },
    library,
  }
}

function printConnectionGuide(
  guide: LocalBridgeConnectionGuide,
  options: { logPath?: string; mode: 'background' | 'foreground' | 'guide' },
): void {
  if (options.mode === 'guide') console.log('Local Bridge connection guide')
  else
    console.log(`Local Bridge is ready${options.mode === 'background' ? ' in the background' : ''}`)
  console.log('')
  if (options.mode === 'guide') {
    console.log('Start Local Bridge:')
    console.log(`  ${guide.checks.startCommand}`)
    console.log('')
  }
  console.log(`Address: ${guide.extension.address}`)
  console.log(`Library: ${guide.library}`)
  console.log(`Token:   ${guide.extension.token}`)
  console.log('')
  console.log('Connect Shadow Clipper:')
  guide.extension.steps.forEach((step, index) => console.log(`  ${index + 1}. ${step}`))
  console.log('')
  console.log('Connect Codex (optional):')
  console.log(`  ${guide.codex.addCommand}`)
  console.log('')
  console.log('Verify the connection:')
  console.log(`  ${guide.checks.doctorCommand}`)
  console.log(`  ${guide.checks.inspectCommand}`)
  console.log(`  ${guide.checks.resourcesCommand}`)
  console.log('')
  if (options.mode === 'background') {
    if (options.logPath) console.log(`Logs: ${options.logPath}`)
    console.log(`Stop: ${guide.checks.stopCommand}`)
  } else if (options.mode === 'foreground') {
    console.log('Keep this terminal open while the extension or Codex is connected.')
  }
}

function parsePort(input?: string): number {
  const port = Number(input ?? '32145')
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error('Port must be an integer between 0 and 65535')
  }
  return port
}

export function normalizeLoopbackUrl(input?: string): string {
  const url = new URL(input?.trim() || 'http://127.0.0.1:32145')
  if (url.protocol !== 'http:' || (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')) {
    throw new Error('Local Bridge URL must use HTTP on 127.0.0.1 or localhost')
  }
  url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

async function runLocalBridgeMcpProxy(options: McpProxyOptions): Promise<void> {
  let url: string
  let token: string
  try {
    const root = resolveLocalBridgeRoot(options.root)
    url = await resolveLocalBridgeUrl(root, options.url)
    token = await readLocalBridgeToken(root, options.token)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  const lines = createInterface({ crlfDelay: Number.POSITIVE_INFINITY, input: process.stdin })
  for await (const line of lines) {
    if (!line.trim()) continue
    let message: Record<string, unknown>
    try {
      message = record(JSON.parse(line))
    } catch {
      process.stdout.write(
        `${JSON.stringify({ error: { code: -32700, message: 'Parse error' }, id: null, jsonrpc: '2.0' })}\n`,
      )
      continue
    }

    try {
      const result = await forwardLocalBridgeMcpMessage(url, token, message)
      if (result !== undefined) process.stdout.write(`${JSON.stringify(result)}\n`)
    } catch (error) {
      if (message.id === undefined) {
        console.error(error instanceof Error ? error.message : String(error))
        continue
      }
      process.stdout.write(
        `${JSON.stringify({
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : 'Local Bridge request failed',
          },
          id: message.id ?? null,
          jsonrpc: '2.0',
        })}\n`,
      )
    }
  }
}

export async function forwardLocalBridgeMcpMessage(
  url: string,
  token: string,
  message: Record<string, unknown>,
): Promise<Record<string, unknown> | undefined> {
  const response = await fetch(`${normalizeLoopbackUrl(url)}/mcp`, {
    body: JSON.stringify(message),
    headers: {
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.timeout(65_000),
  })
  if (response.status === 202) return undefined
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const message = record(body.error).message
    throw new Error(typeof message === 'string' ? message : `Local Bridge HTTP ${response.status}`)
  }
  return body
}

async function fetchJson(
  url: string,
  headers?: Record<string, string>,
  method: 'GET' | 'POST' = 'GET',
  requestBody?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...(requestBody ? { body: JSON.stringify(requestBody) } : {}),
    headers,
    method,
    signal: AbortSignal.timeout(5_000),
  })
  const responseBody = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    throw new Error(
      typeof responseBody.error === 'string'
        ? responseBody.error
        : `Local Bridge HTTP ${response.status}`,
    )
  }
  return responseBody
}

async function resolveLocalBridgeConnection(options: StatusOptions): Promise<{
  token: string
  url: string
}> {
  const root = resolveLocalBridgeRoot(options.root)
  const [token, url] = await Promise.all([
    readLocalBridgeToken(root, options.token),
    resolveLocalBridgeUrl(root, options.url),
  ])
  return { token, url }
}

function authorizationHeaders(token: string, json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  }
}

function localBridgeEndpoint(
  url: string,
  path: string,
  values: Record<string, string | undefined>,
): string {
  const endpoint = new URL(path, `${url}/`)
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') endpoint.searchParams.set(key, value)
  }
  return endpoint.toString()
}

function resolveUserFile(path: string): string {
  return resolve(expandUserPath(path.trim()))
}

function parseJsonObject(input: string | undefined, label: string): Record<string, unknown> {
  const parsed = JSON.parse(input?.trim() || '{}') as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must contain a JSON object`)
  }
  return parsed as Record<string, unknown>
}

async function waitForTaskViaApi(
  url: string,
  token: string,
  taskId: string,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs
  let task: Record<string, unknown>
  do {
    const response = await fetchJson(
      `${url}/v1/tasks/${encodeURIComponent(taskId)}`,
      authorizationHeaders(token),
    )
    task = record(response.task)
    if (task.status !== 'queued' && task.status !== 'running') return task
    const remaining = deadline - Date.now()
    if (remaining <= 0) return task
    await delay(Math.min(250, remaining))
  } while (true)
}

function parseTimeoutMs(input?: string): number {
  return parseIntegerOption(input, 0, 60, 'Timeout') * 1_000
}

function collectValue(value: string, previous: string[]): string[] {
  return [...previous, value]
}

function parsePluginTaskOptions(
  optionsJson: string | undefined,
  entries: string[] | undefined,
): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {}
  if (optionsJson?.trim()) {
    for (const [key, value] of Object.entries(parseJsonObject(optionsJson, '--options-json'))) {
      if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
        throw new Error(`Task option ${key} must be a string, number, or boolean`)
      }
      values[key] = value
    }
  }
  for (const entry of entries ?? []) {
    const separator = entry.indexOf('=')
    if (separator <= 0) throw new Error(`Task option must use key=value: ${entry}`)
    const key = entry.slice(0, separator).trim()
    if (!key) throw new Error(`Task option must use key=value: ${entry}`)
    values[key] = parsePluginTaskOptionValue(entry.slice(separator + 1))
  }
  return values
}

function parsePluginTaskOptionValue(value: string): string | number | boolean {
  try {
    const parsed = JSON.parse(value) as unknown
    if (typeof parsed === 'string' || typeof parsed === 'number' || typeof parsed === 'boolean') {
      return parsed
    }
  } catch {
    // Plain strings do not need JSON quoting.
  }
  return value
}

function printPluginCapabilities(clients: unknown[]): void {
  if (!clients.length) {
    console.log('No connected Shadow Clipper plugins. Open Chrome and test the connection first.')
    return
  }
  for (const clientValue of clients) {
    const client = record(clientValue)
    console.log(`Client: ${String(client.clientId ?? 'unknown')}`)
    const plugins = Array.isArray(client.plugins) ? client.plugins : []
    if (!plugins.length) console.log('  No plugin tasks declared')
    for (const pluginValue of plugins) {
      const plugin = record(pluginValue)
      console.log(`  ${String(plugin.id ?? 'unknown')}  ${String(plugin.name ?? '')}`.trimEnd())
      const capabilities = Array.isArray(plugin.capabilities) ? plugin.capabilities.map(String) : []
      if (capabilities.length) console.log(`    Capabilities: ${capabilities.join(', ')}`)
      for (const interfaceValue of Array.isArray(plugin.interfaces) ? plugin.interfaces : []) {
        const agentInterface = record(interfaceValue)
        const interfaceLabel = localizedText(agentInterface.label)
        console.log(
          `    Interface: ${String(agentInterface.id ?? 'unknown')}${interfaceLabel ? ` — ${interfaceLabel}` : ''} → ${String(agentInterface.taskId ?? 'unknown')}${agentInterface.capability ? ` (${String(agentInterface.capability)})` : ''}`,
        )
      }
      for (const taskValue of Array.isArray(plugin.tasks) ? plugin.tasks : []) {
        const task = record(taskValue)
        const taskLabel = localizedText(task.label)
        console.log(`    ${String(task.id ?? 'unknown')}${taskLabel ? ` — ${taskLabel}` : ''}`)
        for (const optionValue of Array.isArray(task.options) ? task.options : []) {
          const option = record(optionValue)
          const details = [
            typeof option.type === 'string' ? option.type : undefined,
            option.required === true ? 'required' : undefined,
            option.defaultValue !== undefined
              ? `default=${String(option.defaultValue)}`
              : undefined,
          ].filter(Boolean)
          console.log(
            `      --option ${String(option.id ?? 'unknown')}=<value>${details.length ? `  (${details.join(', ')})` : ''}`,
          )
        }
      }
    }
  }
}

function localizedText(value: unknown): string {
  const localized = record(value)
  return typeof localized.en === 'string'
    ? localized.en
    : typeof localized.zh === 'string'
      ? localized.zh
      : ''
}

function printTasks(tasks: unknown[]): void {
  if (!tasks.length) {
    console.log('No plugin tasks')
    return
  }
  for (const taskValue of tasks) {
    const task = record(taskValue)
    const target =
      task.kind === 'resource-operation'
        ? `${String(record(task.operation).resource ?? 'unknown')}/${String(record(task.operation).action ?? 'unknown')}`
        : `${String(task.pluginId ?? 'unknown')}/${String(task.taskId ?? 'unknown')}`
    console.log(`${String(task.id ?? 'unknown')}  ${String(task.status ?? 'unknown')}  ${target}`)
  }
}

function printTask(task: Record<string, unknown>, heading: string): void {
  console.log(`${heading}: ${String(task.id ?? 'unknown')}`)
  console.log(`Status: ${String(task.status ?? 'unknown')}`)
  if (task.kind === 'resource-operation') {
    const operation = record(task.operation)
    console.log(
      `Resource: ${String(operation.resource ?? 'unknown')}/${String(operation.action ?? 'unknown')}`,
    )
  } else {
    console.log(`Plugin: ${String(task.pluginId ?? 'unknown')}/${String(task.taskId ?? 'unknown')}`)
  }
  if (task.result !== undefined) console.log(`Result: ${JSON.stringify(task.result)}`)
}

async function resolveLocalBridgeUrl(root: string, explicit?: string): Promise<string> {
  if (explicit?.trim()) return normalizeLoopbackUrl(explicit)
  const state = await readLocalBridgeState(root)
  return normalizeLoopbackUrl(state?.url)
}

function localBridgeStatePath(root: string): string {
  return join(root, '.clipper', 'local-bridge.json')
}

function localBridgeLogPath(root: string): string {
  return join(root, '.clipper', 'local-bridge.log')
}

function resolveLogFile(input: string | undefined, root: string): string {
  if (!input?.trim()) return localBridgeLogPath(root)
  return resolve(expandUserPath(input.trim()))
}

function expandUserPath(value: string): string {
  if (value === '~') return homedir()
  if (value.startsWith('~/')) return join(homedir(), value.slice(2))
  return value
}

async function readLocalBridgeState(root: string): Promise<LocalBridgeRuntimeState | undefined> {
  try {
    const value = record(JSON.parse(await readFile(localBridgeStatePath(root), 'utf8')))
    if (
      value.version !== 1 ||
      typeof value.background !== 'boolean' ||
      typeof value.instanceId !== 'string' ||
      typeof value.localRuntimeEnabled !== 'boolean' ||
      typeof value.pid !== 'number' ||
      !Number.isInteger(value.pid) ||
      value.pid <= 0 ||
      typeof value.root !== 'string' ||
      typeof value.startedAt !== 'string' ||
      typeof value.url !== 'string'
    ) {
      return undefined
    }
    const stateRoot = resolve(value.root)
    if (stateRoot !== root) return undefined
    return {
      background: value.background,
      instanceId: value.instanceId,
      localRuntimeEnabled: value.localRuntimeEnabled,
      ...(typeof value.logPath === 'string' ? { logPath: resolve(value.logPath) } : {}),
      pid: Number(value.pid),
      root: stateRoot,
      startedAt: value.startedAt,
      url: normalizeLoopbackUrl(value.url),
      version: 1,
    }
  } catch {
    return undefined
  }
}

async function writeLocalBridgeState(state: LocalBridgeRuntimeState): Promise<void> {
  const target = localBridgeStatePath(state.root)
  const temporary = `${target}.${randomUUID()}.tmp`
  await mkdir(dirname(target), { recursive: true })
  try {
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
    await rename(temporary, target)
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined)
  }
}

async function clearLocalBridgeState(root: string, instanceId: string): Promise<void> {
  const state = await readLocalBridgeState(root)
  if (state?.instanceId !== instanceId) return
  await rm(localBridgeStatePath(root), { force: true })
}

async function fetchHealth(url: string): Promise<Record<string, unknown> | undefined> {
  try {
    const health = await fetchJson(`${normalizeLoopbackUrl(url)}/v1/health`)
    return health.service === 'shadow-local-bridge' ? health : undefined
  } catch {
    return undefined
  }
}

async function waitForLocalBridgeStop(url: string): Promise<void> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (!(await fetchHealth(url))) return
    await delay(50)
  }
  throw new Error('Timed out waiting for Local Bridge to stop')
}

async function readRecentLog(path: string, lines: number): Promise<string> {
  const content = await readFile(path, 'utf8')
  return content.replace(/\s+$/, '').split(/\r?\n/).slice(-lines).join('\n')
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}

async function callLocalBridgeTool(
  url: string,
  token: string,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await forwardLocalBridgeMcpMessage(url, token, {
    id: `inspect-${name}`,
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { arguments: args, name },
  })
  const error = record(response?.error)
  if (typeof error.message === 'string') throw new Error(error.message)
  const result = record(response?.result)
  if (result.isError === true) {
    const first = Array.isArray(result.content) ? record(result.content[0]) : {}
    throw new Error(typeof first.text === 'string' ? first.text : `${name} failed`)
  }
  return record(result.structuredContent)
}

function parseIntegerOption(
  input: string | undefined,
  minimum: number,
  maximum: number,
  label: string,
): number {
  const value = Number(input)
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`)
  }
  return value
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@~-]+$/.test(value)) return value
  return `'${value.replace(/'/g, "'\\''")}'`
}
