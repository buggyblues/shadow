import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { ShadowServerAppCommand, ShadowServerAppManifest } from '@shadowob/sdk'
import { Command } from 'commander'
import { getClient, resolveServerFlag } from '../utils/client.js'
import { output, outputError, outputSuccess } from '../utils/output.js'

function parseJsonInput(value?: string) {
  if (!value) return {}
  const parsed = JSON.parse(value)
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    'input' in parsed &&
    Object.keys(parsed).every((key) => key === 'input' || key === 'channelId')
  ) {
    return (parsed as { input?: unknown }).input ?? {}
  }
  return parsed
}

async function readJsonFile(path: string) {
  return JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>
}

function parsePermissions(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function commandHandlerError(error: unknown, json?: boolean) {
  outputError(error instanceof Error ? error.message : String(error), { json })
  process.exit(1)
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function commandSummary(command: ShadowServerAppCommand) {
  return command.help?.summary ?? command.description ?? command.title ?? command.permission
}

function formatAppCommandHelp(input: {
  appKey: string
  serverId: string
  manifest: ShadowServerAppManifest
  commandName?: string
}) {
  const { appKey, serverId, manifest, commandName } = input
  const command = commandName
    ? manifest.commands.find((item) => item.name === commandName)
    : undefined
  if (commandName && !command) throw new Error(`App command not found: ${commandName}`)

  if (!command) {
    const lines = [
      `${manifest.name} (${appKey})`,
      manifest.description ?? '',
      manifest.help?.overview ?? '',
      '',
      'Usage:',
      `  shadowob app call ${appKey} <command> --server "${serverId}" --json-input '<input-json>' --json`,
      `  shadowob app call ${appKey} <command> --server "${serverId}" --help`,
      manifest.binary?.supported
        ? `  shadowob app call ${appKey} <command> --server "${serverId}" --file ./asset.png --json-input '<input-json>' --json`
        : '',
      '',
      'Commands:',
      ...manifest.commands.map((item) => `  ${item.name.padEnd(24)} ${commandSummary(item)}`),
      manifest.realtime
        ? [
            '',
            'Realtime:',
            `  shadowob app events ${appKey} --server "${serverId}" --json`,
            manifest.realtime.subscribe?.help ?? '',
            manifest.realtime.publish?.help ?? '',
          ].join('\n')
        : '',
    ]
    return lines.filter(Boolean).join('\n')
  }

  const help = command.help
  const usage =
    help?.usage ??
    `shadowob app call ${appKey} ${command.name} --server "${serverId}" --json-input '<input-json>' --json`
  const lines = [
    `${manifest.name} ${command.name}`,
    commandSummary(command),
    '',
    'Usage:',
    `  ${usage}`,
    command.binary?.supported || command.input === 'multipart'
      ? `  shadowob app call ${appKey} ${command.name} --server "${serverId}" --file ./asset.png --json-input '<input-json>' --json`
      : '',
    help?.details ? ['', help.details].join('\n') : '',
    help?.examples?.length
      ? [
          '',
          'Examples:',
          ...help.examples.flatMap((example) => {
            const rendered = example.command
              ? [`  ${example.command}`]
              : example.input !== undefined
                ? [`  ${prettyJson(example.input).replace(/\n/g, '\n  ')}`]
                : []
            return example.title ? [`  # ${example.title}`, ...rendered] : rendered
          }),
        ].join('\n')
      : '',
    command.inputSchema ? ['', 'Input schema:', prettyJson(command.inputSchema)].join('\n') : '',
  ]
  return lines.filter(Boolean).join('\n')
}

function parseSseEvents(chunk: string, carry: string) {
  const frames = `${carry}${chunk}`.split(/\r?\n\r?\n/u)
  return {
    complete: frames.slice(0, -1),
    carry: frames.at(-1) ?? '',
  }
}

function decodeSseFrame(frame: string) {
  let event = 'message'
  const data: string[] = []
  for (const line of frame.split(/\r?\n/u)) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }
  return { event, data: data.join('\n') }
}

async function streamServerAppEvents(input: {
  url: string
  event?: string
  limit?: number
  json?: boolean
}) {
  const response = await fetch(input.url, { headers: { Accept: 'text/event-stream' } })
  if (!response.ok || !response.body) {
    throw new Error(`Event stream failed (${response.status})`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let carry = ''
  let count = 0
  const stop = () => reader.cancel().catch(() => undefined)
  process.once('SIGINT', stop)
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      const parsed = parseSseEvents(decoder.decode(next.value, { stream: true }), carry)
      carry = parsed.carry
      for (const frame of parsed.complete) {
        const decoded = decodeSseFrame(frame)
        if (!decoded.data || (input.event && decoded.event !== input.event)) continue
        let payload: unknown = decoded.data
        try {
          payload = JSON.parse(decoded.data)
        } catch {
          // Keep plain text event payloads readable.
        }
        if (input.json) console.log(JSON.stringify({ event: decoded.event, data: payload }))
        else
          console.log(
            `[${decoded.event}] ${typeof payload === 'string' ? payload : prettyJson(payload)}`,
          )
        count += 1
        if (input.limit && count >= input.limit) return
      }
    }
  } finally {
    process.off('SIGINT', stop)
  }
}

export function createAppCommand(): Command {
  const app = new Command('app').description('Server App integration commands')

  app
    .command('list')
    .description('List apps installed in a server')
    .requiredOption('--server <server>', 'Server ID or slug')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { server: string; profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const apps = await client.listServerApps(resolveServerFlag(options.server))
        output(
          apps.map((entry) => ({
            id: entry.id,
            name: `${entry.appKey} (${entry.name})`,
          })),
          { json: options.json },
        )
      } catch (error) {
        commandHandlerError(error, options.json)
      }
    })

  app
    .command('preview')
    .description('Discover and preview a server App manifest before installing it')
    .requiredOption('--server <server>', 'Server ID or slug')
    .option('--manifest-url <url>', 'Manifest URL')
    .option('--manifest-file <path>', 'Local manifest JSON file')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        server: string
        manifestUrl?: string
        manifestFile?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          if (!options.manifestUrl && !options.manifestFile) {
            throw new Error('Pass --manifest-url or --manifest-file')
          }
          const client = await getClient(options.profile)
          const manifest = options.manifestFile
            ? await readJsonFile(options.manifestFile)
            : undefined
          output(
            await client.discoverServerApp(resolveServerFlag(options.server), {
              manifestUrl: options.manifestUrl,
              manifest: manifest as never,
            }),
            { json: options.json },
          )
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('install')
    .description('Install or update a server App from a manifest')
    .requiredOption('--server <server>', 'Server ID or slug')
    .option('--manifest-url <url>', 'Manifest URL')
    .option('--manifest-file <path>', 'Local manifest JSON file')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        server: string
        manifestUrl?: string
        manifestFile?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          if (!options.manifestUrl && !options.manifestFile) {
            throw new Error('Pass --manifest-url or --manifest-file')
          }
          const client = await getClient(options.profile)
          const manifest = options.manifestFile
            ? await readJsonFile(options.manifestFile)
            : undefined
          const result = await client.installServerApp(resolveServerFlag(options.server), {
            manifestUrl: options.manifestUrl,
            manifest: manifest as never,
          })
          output(result, { json: options.json })
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('inspect')
    .description('Inspect an installed server App')
    .argument('<app-key>', 'App key')
    .requiredOption('--server <server>', 'Server ID or slug')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (appKey: string, options: { server: string; profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          output(await client.getServerApp(resolveServerFlag(options.server), appKey), {
            json: options.json,
          })
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('grant')
    .description('Grant a Buddy access to an installed server App')
    .argument('<app-key>', 'App key')
    .requiredOption('--server <server>', 'Server ID or slug')
    .requiredOption('--buddy <buddy-id>', 'Buddy ID')
    .requiredOption('--permissions <permissions>', 'Comma-separated permissions, or *')
    .option('--approval-mode <mode>', 'none, first_time, every_time, or policy', 'none')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        appKey: string,
        options: {
          server: string
          buddy: string
          permissions: string
          approvalMode?: 'none' | 'first_time' | 'every_time' | 'policy'
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const permissions = parsePermissions(options.permissions)
          const result = await client.grantServerAppToBuddy(
            resolveServerFlag(options.server),
            appKey,
            {
              buddyAgentId: options.buddy,
              permissions,
              approvalMode: options.approvalMode,
            },
          )
          output(result, { json: options.json })
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('defaults')
    .description('Set default app permissions that members and Buddies can use without prompting')
    .argument('<app-key>', 'App key')
    .requiredOption('--server <server>', 'Server ID or slug')
    .requiredOption('--permissions <permissions>', 'Comma-separated permissions, or *')
    .option('--approval-mode <mode>', 'none, first_time, every_time, or policy', 'none')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        appKey: string,
        options: {
          server: string
          permissions: string
          approvalMode?: 'none' | 'first_time' | 'every_time' | 'policy'
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const result = await client.updateServerAppAccessPolicy(
            resolveServerFlag(options.server),
            appKey,
            {
              defaultPermissions: parsePermissions(options.permissions),
              defaultApprovalMode: options.approvalMode,
            },
          )
          output(result, { json: options.json })
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('approve')
    .description('Approve one app command for yourself or a Buddy after a first-use prompt')
    .argument('<app-key>', 'App key')
    .argument('<command>', 'Command name')
    .requiredOption('--server <server>', 'Server ID or slug')
    .option('--buddy <buddy-id>', 'Buddy ID to approve for')
    .option('--no-remember', 'Approve only the immediate retry window')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        appKey: string,
        commandName: string,
        options: {
          server: string
          buddy?: string
          remember?: boolean
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const result = await client.approveServerAppCommand(
            resolveServerFlag(options.server),
            appKey,
            {
              commandName,
              buddyAgentId: options.buddy,
              remember: options.remember,
            },
          )
          output(result, { json: options.json })
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('discover')
    .description('Emit Skill-style command discovery for server Apps')
    .requiredOption('--server <server>', 'Server ID or slug')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { server: string; profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const server = resolveServerFlag(options.server)
        const apps = await client.listServerApps(server)
        const docs = await Promise.all(
          apps.map((entry) => client.getServerAppSkills(server, entry.appKey)),
        )
        if (options.json) {
          output(docs, { json: true })
        } else {
          console.log(docs.map((doc) => doc.markdown).join('\n\n---\n\n'))
        }
      } catch (error) {
        commandHandlerError(error, options.json)
      }
    })

  app
    .command('skills')
    .description('Emit Skill text for one installed server App')
    .argument('<app-key>', 'App key')
    .requiredOption('--server <server>', 'Server ID or slug')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (appKey: string, options: { server: string; profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          const result = await client.getServerAppSkills(resolveServerFlag(options.server), appKey)
          if (options.json) output(result, { json: true })
          else console.log(result.markdown)
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('events')
    .description('Subscribe to an installed server App event stream')
    .argument('<app-key>', 'App key')
    .requiredOption('--server <server>', 'Server ID or slug')
    .option('--event <event>', 'Only print one event type')
    .option('--limit <count>', 'Stop after this many matching events')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON lines')
    .action(
      async (
        appKey: string,
        options: {
          server: string
          event?: string
          limit?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const launch = await client.createServerAppLaunch(
            resolveServerFlag(options.server),
            appKey,
          )
          const limit = options.limit ? Number.parseInt(options.limit, 10) : undefined
          if (limit !== undefined && (!Number.isFinite(limit) || limit < 1)) {
            throw new Error('--limit must be a positive integer')
          }
          await streamServerAppEvents({
            url: client.serverAppEventStreamUrl(launch.eventStreamPath),
            event: options.event,
            limit,
            json: options.json,
          })
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('call')
    .description('Call a server App command')
    .helpOption(false)
    .argument('[app-key]', 'App key')
    .argument('[command]', 'Command name')
    .option('--server <server>', 'Server ID or slug')
    .option('--json-input <json>', 'JSON command input')
    .option('--input-file <path>', 'Read JSON command input from file')
    .option('--channel-id <id>', 'Current Shadow channel ID for approval prompts and app context')
    .option('--task-message-id <id>', 'Inbox task message ID to bind this app command to')
    .option('--task-card-id <id>', 'Inbox task card ID to bind this app command to')
    .option('--task-claim-id <id>', 'Inbox task claim ID to bind this app command to')
    .option('--file <path>', 'Attach a binary file')
    .option('--field <field>', 'Multipart file field name', 'file')
    .option('--output <path>', 'Write binary dataBase64 response to this path')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .option('-h, --help', 'Show app or command help from the installed manifest')
    .action(
      async (
        appKey: string | undefined,
        commandName: string | undefined,
        options: {
          server?: string
          jsonInput?: string
          inputFile?: string
          channelId?: string
          taskMessageId?: string
          taskCardId?: string
          taskClaimId?: string
          file?: string
          field?: string
          output?: string
          profile?: string
          json?: boolean
          help?: boolean
        },
      ) => {
        try {
          if (options.help) {
            if (!appKey) {
              console.log(
                [
                  'Usage:',
                  "  shadowob app call <app-key> <command> --server <server> --json-input '<input-json>' --json",
                  '  shadowob app call <app-key> <command> --server <server> --help',
                ].join('\n'),
              )
              return
            }
            const client = await getClient(options.profile)
            const server = resolveServerFlag(options.server)
            const app = await client.getServerApp(server, appKey)
            console.log(
              formatAppCommandHelp({
                appKey,
                serverId: app.serverId,
                manifest: app.manifest,
                commandName,
              }),
            )
            return
          }
          if (!appKey) throw new Error('Missing app key')
          if (!commandName) throw new Error('Missing command name')
          const client = await getClient(options.profile)
          const input = options.inputFile
            ? await readJsonFile(options.inputFile)
            : parseJsonInput(options.jsonInput)
          const server = resolveServerFlag(options.server)
          if (
            (options.taskMessageId || options.taskCardId || options.taskClaimId) &&
            !(options.taskMessageId && options.taskCardId)
          ) {
            throw new Error('--task-message-id and --task-card-id are required together')
          }
          const task =
            options.taskMessageId && options.taskCardId
              ? {
                  messageId: options.taskMessageId,
                  cardId: options.taskCardId,
                  ...(options.taskClaimId ? { claimId: options.taskClaimId } : {}),
                }
              : undefined
          const result = options.file
            ? await client.callServerAppCommandMultipart(server, appKey, commandName, {
                input,
                channelId: options.channelId,
                task,
                file: new Blob([await readFile(options.file)]),
                filename: basename(options.file),
                field: options.field,
              })
            : await client.callServerAppCommand(server, appKey, commandName, {
                input,
                channelId: options.channelId,
                task,
              })

          if (
            options.output &&
            result &&
            typeof result === 'object' &&
            'dataBase64' in result &&
            typeof (result as { dataBase64?: unknown }).dataBase64 === 'string'
          ) {
            await writeFile(
              options.output,
              Buffer.from((result as { dataBase64: string }).dataBase64, 'base64'),
            )
            outputSuccess(`Wrote ${options.output}`, { json: options.json })
            return
          }
          output(result, { json: options.json })
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  app
    .command('uninstall')
    .description('Uninstall a server App')
    .argument('<app-key>', 'App key')
    .requiredOption('--server <server>', 'Server ID or slug')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (appKey: string, options: { server: string; profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          await client.deleteServerApp(resolveServerFlag(options.server), appKey)
          const outputOpts = { json: options.json }
          if (options.json) output({ ok: true }, outputOpts)
          else outputSuccess(`Uninstalled ${appKey}`, outputOpts)
        } catch (error) {
          commandHandlerError(error, options.json)
        }
      },
    )

  return app
}
