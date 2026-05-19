import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
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
    .command('call')
    .description('Call a server App command')
    .argument('<app-key>', 'App key')
    .argument('<command>', 'Command name')
    .requiredOption('--server <server>', 'Server ID or slug')
    .option('--json-input <json>', 'JSON command input')
    .option('--input-file <path>', 'Read JSON command input from file')
    .option('--channel-id <id>', 'Current Shadow channel ID for approval prompts and app context')
    .option('--file <path>', 'Attach a binary file')
    .option('--field <field>', 'Multipart file field name', 'file')
    .option('--output <path>', 'Write binary dataBase64 response to this path')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        appKey: string,
        commandName: string,
        options: {
          server: string
          jsonInput?: string
          inputFile?: string
          channelId?: string
          file?: string
          field?: string
          output?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const input = options.inputFile
            ? await readJsonFile(options.inputFile)
            : parseJsonInput(options.jsonInput)
          const server = resolveServerFlag(options.server)
          const result = options.file
            ? await client.callServerAppCommandMultipart(server, appKey, commandName, {
                input,
                channelId: options.channelId,
                file: new Blob([await readFile(options.file)]),
                filename: basename(options.file),
                field: options.field,
              })
            : await client.callServerAppCommand(server, appKey, commandName, {
                input,
                channelId: options.channelId,
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
