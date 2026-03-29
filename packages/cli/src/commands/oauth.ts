import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export function createOAuthCommand(): Command {
  const oauth = new Command('oauth').description('OAuth management commands')

  oauth
    .command('list')
    .description('List OAuth apps')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const apps = await client.listOAuthApps()
        output(apps, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  oauth
    .command('create')
    .description('Create OAuth app')
    .requiredOption('--name <name>', 'App name')
    .requiredOption('--redirect-uris <uris>', 'Comma-separated redirect URIs')
    .option('--scopes <scopes>', 'Comma-separated scopes')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        name: string
        redirectUris: string
        scopes?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          const app = await client.createOAuthApp({
            name: options.name,
            redirectUris: options.redirectUris.split(',').map((u) => u.trim()),
            scopes: options.scopes?.split(',').map((s) => s.trim()),
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

  oauth
    .command('update')
    .description('Update OAuth app')
    .argument('<app-id>', 'App ID')
    .option('--name <name>', 'New name')
    .option('--redirect-uris <uris>', 'Comma-separated redirect URIs')
    .option('--scopes <scopes>', 'Comma-separated scopes')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        appId: string,
        options: {
          name?: string
          redirectUris?: string
          scopes?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const data: { name?: string; redirectUris?: string[]; scopes?: string[] } = {}
          if (options.name) data.name = options.name
          if (options.redirectUris)
            data.redirectUris = options.redirectUris.split(',').map((u) => u.trim())
          if (options.scopes) data.scopes = options.scopes.split(',').map((s) => s.trim())
          const app = await client.updateOAuthApp(appId, data)
          output(app, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  oauth
    .command('delete')
    .description('Delete OAuth app')
    .argument('<app-id>', 'App ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (appId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.deleteOAuthApp(appId)
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('OAuth app deleted', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  oauth
    .command('reset-secret')
    .description('Reset OAuth app client secret')
    .argument('<app-id>', 'App ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (appId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const result = await client.resetOAuthAppSecret(appId)
        output(result, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  oauth
    .command('consents')
    .description('List OAuth consents (authorized apps)')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const consents = await client.listOAuthConsents()
        output(consents, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  oauth
    .command('revoke')
    .description('Revoke OAuth consent for an app')
    .argument('<app-id>', 'App ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (appId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.revokeOAuthConsent(appId)
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('OAuth consent revoked', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  return oauth
}
