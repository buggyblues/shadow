import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export function createAppsCommand(): Command {
  const apps = new Command('apps').description('App management commands')

  apps
    .command('list')
    .description('List apps in a server')
    .argument('<server-id>', 'Server ID or slug')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (serverId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const appsData = await client.listApps(serverId)
        output(appsData, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  apps
    .command('get')
    .description('Get app details')
    .argument('<server-id>', 'Server ID or slug')
    .argument('<app-id>', 'App ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (serverId: string, appId: string, options: { profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          const app = await client.getApp(serverId, appId)
          output(app, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  apps
    .command('create')
    .description('Create an app')
    .argument('<server-id>', 'Server ID or slug')
    .requiredOption('--name <name>', 'App name')
    .requiredOption('--type <type>', 'App type (url, workspace, static)')
    .option('--url <url>', 'Source URL for URL apps')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        serverId: string,
        options: {
          name: string
          type: string
          url?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const app = await client.createApp(serverId, {
            name: options.name,
            slug: options.name.toLowerCase().replace(/\s+/g, '-'),
            type: options.type,
            url: options.url,
          })
          output(app, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  apps
    .command('update')
    .description('Update an app')
    .argument('<server-id>', 'Server ID or slug')
    .argument('<app-id>', 'App ID')
    .option('--name <name>', 'New name')
    .option('--url <url>', 'New source URL')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        serverId: string,
        appId: string,
        options: {
          name?: string
          url?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const app = await client.updateApp(serverId, appId, {
            name: options.name,
            url: options.url,
          })
          output(app, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  apps
    .command('delete')
    .description('Delete an app')
    .argument('<server-id>', 'Server ID or slug')
    .argument('<app-id>', 'App ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (serverId: string, appId: string, options: { profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          await client.deleteApp(serverId, appId)
          const outputOpts: OutputOptions = { json: options.json }
          outputSuccess('App deleted', outputOpts)
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  apps
    .command('publish')
    .description('Publish app from workspace')
    .argument('<server-id>', 'Server ID or slug')
    .requiredOption('--name <name>', 'App name')
    .requiredOption('--slug <slug>', 'App slug')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        serverId: string,
        options: {
          name: string
          slug: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const app = await client.publishApp(serverId, {
            name: options.name,
            slug: options.slug,
          })
          output(app, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  return apps
}
