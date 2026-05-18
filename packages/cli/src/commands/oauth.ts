import { Command } from 'commander'
import { getClient, getClientWithToken } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

function resolveOAuthAccessToken(options: { accessToken?: string }): string {
  const token = options.accessToken || process.env.SHADOWOB_OAUTH_TOKEN
  if (!token) {
    throw new Error('Provide --access-token or SHADOWOB_OAUTH_TOKEN for OAuth commerce APIs')
  }
  return token
}

function parseMetadata(
  value: string | undefined,
): Record<string, string | number | boolean | null> | undefined {
  if (!value) return undefined
  const parsed = JSON.parse(value) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--metadata must be a JSON object')
  }
  return parsed as Record<string, string | number | boolean | null>
}

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

  const commerce = oauth.command('commerce').description('OAuth commerce entitlement commands')

  commerce
    .command('check')
    .description('Check the OAuth token user entitlement for the calling app')
    .option('--resource-type <type>', 'Resource type, defaults to external_app')
    .option('--resource-id <id>', 'App resource ID or app-id:feature')
    .option('--capability <capability>', 'Capability, defaults to use')
    .option('--access-token <token>', 'OAuth access token; defaults to SHADOWOB_OAUTH_TOKEN')
    .option('--profile <name>', 'Profile to use for server URL')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        resourceType?: string
        resourceId?: string
        capability?: string
        accessToken?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClientWithToken(resolveOAuthAccessToken(options), options.profile)
          const result = await client.getOAuthCommerceEntitlementAccess({
            resourceType: options.resourceType,
            resourceId: options.resourceId,
            capability: options.capability,
          })
          output(result, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  commerce
    .command('redeem')
    .description('Redeem the OAuth token user entitlement for the calling app')
    .requiredOption('--idempotency-key <key>', 'Provider idempotency key')
    .option('--resource-type <type>', 'Resource type, defaults to external_app')
    .option('--resource-id <id>', 'App resource ID or app-id:feature')
    .option('--capability <capability>', 'Capability, defaults to use')
    .option('--metadata <json>', 'Flat provider metadata JSON object')
    .option('--access-token <token>', 'OAuth access token; defaults to SHADOWOB_OAUTH_TOKEN')
    .option('--profile <name>', 'Profile to use for server URL')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        idempotencyKey: string
        resourceType?: string
        resourceId?: string
        capability?: string
        metadata?: string
        accessToken?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClientWithToken(resolveOAuthAccessToken(options), options.profile)
          const result = await client.redeemOAuthCommerceEntitlement({
            idempotencyKey: options.idempotencyKey,
            resourceType: options.resourceType,
            resourceId: options.resourceId,
            capability: options.capability,
            metadata: parseMetadata(options.metadata),
          })
          output(result, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  return oauth
}
