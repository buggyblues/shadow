import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export function createOAuthCommand(): Command {
  const oauth = new Command('oauth').description('OAuth app management commands')

  oauth
    .command('list')
    .description('List OAuth apps')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const apps = await client.getOAuthApps()
        output(apps, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  oauth
    .command('get')
    .description('Get OAuth app details')
    .argument('<app-id>', 'OAuth App ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (appId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const app = await client.getOAuthApp(appId)
        output(app, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  oauth
    .command('create')
    .description('Create OAuth app')
    .requiredOption('--name <name>', 'App name')
    .option('--description <desc>', 'App description')
    .option('--redirect-uri <uri>', 'Redirect URI')
    .option('--homepage <url>', 'Homepage URL')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        name: string
        description?: string
        redirectUri?: string
        homepage?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          const app = await client.createOAuthApp({
            name: options.name,
            description: options.description,
            redirectUri: options.redirectUri,
            homepage: options.homepage,
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
    .argument('<app-id>', 'OAuth App ID')
    .option('--name <name>', 'New name')
    .option('--description <desc>', 'New description')
    .option('--redirect-uri <uri>', 'New redirect URI')
    .option('--homepage <url>', 'New homepage URL')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        appId: string,
        options: {
          name?: string
          description?: string
          redirectUri?: string
          homepage?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const app = await client.updateOAuthApp(appId, {
            name: options.name,
            description: options.description,
            redirectUri: options.redirectUri,
            homepage: options.homepage,
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
    .command('delete')
    .description('Delete OAuth app')
    .argument('<app-id>', 'OAuth App ID')
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
    .command('regenerate-secret')
    .description('Regenerate OAuth app secret')
    .argument('<app-id>', 'OAuth App ID')
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

  // Consents (authorized apps)
  const consents = oauth.command('consents').description('OAuth consents management')

  consents
    .command('list')
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

  consents
    .command('revoke')
    .description('Revoke OAuth consent')
    .argument('<app-id>', 'App ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (appId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.revokeOAuthConsent(appId)
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('Consent revoked', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  return oauth
}
