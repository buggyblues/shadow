import { randomUUID } from 'node:crypto'
import { Command } from 'commander'
import { getClient, resolveServerFlag } from '../utils/client.js'
import { output, outputError } from '../utils/output.js'

type CommonOptions = { profile?: string; json?: boolean }

function buildIdempotencyKey(value: string | undefined, prefix: string): string {
  return value?.trim() || `${prefix}-${randomUUID()}`
}

function parsePositiveInteger(value: string | undefined, name: string): number | undefined {
  if (value == null) return undefined
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

function parseMetadata(value: string | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined
  const parsed = JSON.parse(value) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('--metadata must be a JSON object')
  }
  return parsed as Record<string, unknown>
}

async function runCommand<T>(options: CommonOptions, task: () => Promise<T>): Promise<void> {
  try {
    const result = await task()
    output(result, { json: options.json })
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exit(1)
  }
}

export function createCommerceCommand(): Command {
  const commerce = new Command('commerce').description('Commerce, purchases, delivery, and assets')

  const products = commerce.command('products').description('Buyer-facing product commands')

  products
    .command('context')
    .description('Get buyer-facing product context')
    .argument('<product-id>', 'Product ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action((productId: string, options: CommonOptions) =>
      runCommand(options, async () => {
        const client = await getClient(options.profile)
        return client.getCommerceProductContext(productId)
      }),
    )

  const offers = commerce.command('offers').description('Commerce offer commands')

  offers
    .command('preview')
    .description('Preview checkout for an offer')
    .argument('<offer-id>', 'Offer ID')
    .option('--sku-id <id>', 'SKU ID')
    .option('--viewer-user-id <id>', 'Viewer user ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action((offerId: string, options: CommonOptions & { skuId?: string; viewerUserId?: string }) =>
      runCommand(options, async () => {
        const client = await getClient(options.profile)
        return client.getCommerceOfferCheckoutPreview(offerId, {
          skuId: options.skuId,
          viewerUserId: options.viewerUserId,
        })
      }),
    )

  offers
    .command('purchase')
    .description('Purchase an offer')
    .argument('<offer-id>', 'Offer ID')
    .option('--sku-id <id>', 'SKU ID')
    .option('--destination-kind <kind>', 'Delivery destination kind, currently channel')
    .option('--destination-id <id>', 'Delivery destination ID')
    .option('--idempotency-key <key>', 'Idempotency key, generated if omitted')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      (
        offerId: string,
        options: CommonOptions & {
          skuId?: string
          destinationKind?: string
          destinationId?: string
          idempotencyKey?: string
        },
      ) =>
        runCommand(options, async () => {
          const client = await getClient(options.profile)
          return client.purchaseCommerceOffer(offerId, {
            skuId: options.skuId,
            idempotencyKey: buildIdempotencyKey(options.idempotencyKey, 'cli-offer-purchase'),
            destinationKind: options.destinationId
              ? ((options.destinationKind ?? 'channel') as 'channel')
              : undefined,
            destinationId: options.destinationId,
          })
        }),
    )

  const cards = commerce.command('cards').description('Chat commerce card commands')

  cards
    .command('list')
    .description('List commerce product cards available for a channel')
    .requiredOption('--channel-id <id>', 'Channel ID')
    .option('--keyword <keyword>', 'Search keyword')
    .option('--limit <n>', 'Maximum cards')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      (
        options: CommonOptions & {
          channelId: string
          keyword?: string
          limit?: string
        },
      ) =>
        runCommand(options, async () => {
          const client = await getClient(options.profile)
          return client.listCommerceProductCards({
            target: 'channel',
            channelId: options.channelId,
            keyword: options.keyword,
            limit: parsePositiveInteger(options.limit, '--limit'),
          })
        }),
    )

  cards
    .command('purchase')
    .description('Purchase a chat commerce card')
    .argument('<message-id>', 'Message ID')
    .argument('<card-id>', 'Commerce card ID')
    .option('--sku-id <id>', 'SKU ID')
    .option('--idempotency-key <key>', 'Idempotency key, generated if omitted')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      (
        messageId: string,
        cardId: string,
        options: CommonOptions & { skuId?: string; idempotencyKey?: string },
      ) =>
        runCommand(options, async () => {
          const client = await getClient(options.profile)
          return client.purchaseMessageCommerceCard(messageId, cardId, {
            skuId: options.skuId,
            idempotencyKey: buildIdempotencyKey(options.idempotencyKey, 'cli-card-purchase'),
          })
        }),
    )

  const entitlements = commerce.command('entitlements').description('Purchase entitlement commands')

  entitlements
    .command('list')
    .description('List my purchase entitlements')
    .option('--server <server>', 'Limit to a server shop entitlement list')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action((options: CommonOptions & { server?: string }) =>
      runCommand(options, async () => {
        const client = await getClient(options.profile)
        return options.server
          ? client.getEntitlements(resolveServerFlag(options.server))
          : client.getAllEntitlements()
      }),
    )

  entitlements
    .command('get')
    .description('Get purchase delivery detail')
    .argument('<entitlement-id>', 'Entitlement ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action((entitlementId: string, options: CommonOptions) =>
      runCommand(options, async () => {
        const client = await getClient(options.profile)
        return client.getEntitlement(entitlementId)
      }),
    )

  entitlements
    .command('verify')
    .description('Verify entitlement provisioning/access')
    .argument('<entitlement-id>', 'Entitlement ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action((entitlementId: string, options: CommonOptions) =>
      runCommand(options, async () => {
        const client = await getClient(options.profile)
        return client.verifyEntitlement(entitlementId)
      }),
    )

  entitlements
    .command('cancel')
    .description('Cancel an entitlement and request any available refund')
    .argument('<entitlement-id>', 'Entitlement ID')
    .option('--reason <reason>', 'Cancellation reason')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action((entitlementId: string, options: CommonOptions & { reason?: string }) =>
      runCommand(options, async () => {
        const client = await getClient(options.profile)
        return client.cancelEntitlement(entitlementId, options.reason)
      }),
    )

  entitlements
    .command('cancel-renewal')
    .description('Stop subscription renewal while keeping current access')
    .argument('<entitlement-id>', 'Entitlement ID')
    .option('--reason <reason>', 'Cancellation reason')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action((entitlementId: string, options: CommonOptions & { reason?: string }) =>
      runCommand(options, async () => {
        const client = await getClient(options.profile)
        return client.cancelEntitlementRenewal(entitlementId, options.reason)
      }),
    )

  const assets = commerce.command('assets').description('Community asset commands')

  assets
    .command('list')
    .description('List my community assets')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action((options: CommonOptions) =>
      runCommand(options, async () => {
        const client = await getClient(options.profile)
        return client.listCommunityAssets()
      }),
    )

  assets
    .command('get')
    .description('Get a community asset grant')
    .argument('<grant-id>', 'Asset grant ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action((grantId: string, options: CommonOptions) =>
      runCommand(options, async () => {
        const client = await getClient(options.profile)
        return client.getCommunityAsset(grantId)
      }),
    )

  for (const action of ['consume', 'lock', 'unlock'] as const) {
    assets
      .command(action)
      .description(`${action} a community asset grant`)
      .argument('<grant-id>', 'Asset grant ID')
      .option('--idempotency-key <key>', 'Idempotency key, generated if omitted')
      .option('--profile <name>', 'Profile to use')
      .option('--json', 'Output as JSON')
      .action((grantId: string, options: CommonOptions & { idempotencyKey?: string }) =>
        runCommand(options, async () => {
          const client = await getClient(options.profile)
          const data = {
            idempotencyKey: buildIdempotencyKey(options.idempotencyKey, `cli-asset-${action}`),
          }
          if (action === 'consume') return client.consumeCommunityAsset(grantId, data)
          if (action === 'lock') return client.lockCommunityAsset(grantId, data)
          return client.unlockCommunityAsset(grantId, data)
        }),
      )
  }

  assets
    .command('revoke')
    .description('Revoke a community asset grant')
    .argument('<grant-id>', 'Asset grant ID')
    .option('--reason <reason>', 'Revocation reason')
    .option('--idempotency-key <key>', 'Idempotency key, generated if omitted')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      (grantId: string, options: CommonOptions & { reason?: string; idempotencyKey?: string }) =>
        runCommand(options, async () => {
          const client = await getClient(options.profile)
          return client.revokeCommunityAsset(grantId, {
            reason: options.reason,
            idempotencyKey: buildIdempotencyKey(options.idempotencyKey, 'cli-asset-revoke'),
          })
        }),
    )

  const paidFiles = commerce.command('paid-files').description('Protected paid file commands')

  paidFiles
    .command('open')
    .description('Open a paid file with entitlement authorization')
    .argument('<file-id>', 'Paid file/workspace file ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action((fileId: string, options: CommonOptions) =>
      runCommand(options, async () => {
        const client = await getClient(options.profile)
        return client.openPaidFile(fileId)
      }),
    )

  const settlements = commerce.command('settlements').description('Settlement commands')

  settlements
    .command('list')
    .description('List settlement lines')
    .option('--limit <n>', 'Maximum settlement lines')
    .option('--offset <n>', 'Offset')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action((options: CommonOptions & { limit?: string; offset?: string }) =>
      runCommand(options, async () => {
        const client = await getClient(options.profile)
        return client.listSettlements({
          limit: parsePositiveInteger(options.limit, '--limit'),
          offset: options.offset ? Number.parseInt(options.offset, 10) : undefined,
        })
      }),
    )

  settlements
    .command('settle')
    .description('Settle currently available settlement lines')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action((options: CommonOptions) =>
      runCommand(options, async () => {
        const client = await getClient(options.profile)
        return client.settleAvailableSettlements()
      }),
    )

  const tips = commerce.command('tips').description('Tip commands')

  tips
    .command('send')
    .description('Send a tip')
    .requiredOption('--recipient-user-id <id>', 'Recipient user ID')
    .requiredOption('--amount <amount>', 'Amount')
    .option('--message <message>', 'Message')
    .option('--context <json>', 'Context JSON object')
    .option('--idempotency-key <key>', 'Idempotency key, generated if omitted')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      (
        options: CommonOptions & {
          recipientUserId: string
          amount: string
          message?: string
          context?: string
          idempotencyKey?: string
        },
      ) =>
        runCommand(options, async () => {
          const client = await getClient(options.profile)
          const amount = parsePositiveInteger(options.amount, '--amount')
          return client.sendTip({
            recipientUserId: options.recipientUserId,
            amount: amount ?? 0,
            message: options.message,
            context: parseMetadata(options.context) as { kind: string; id: string } | undefined,
            idempotencyKey: buildIdempotencyKey(options.idempotencyKey, 'cli-tip'),
          })
        }),
    )

  const gifts = commerce.command('gifts').description('Gift commands')

  gifts
    .command('list')
    .description('List gifts')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action((options: CommonOptions) =>
      runCommand(options, async () => {
        const client = await getClient(options.profile)
        return client.listGifts()
      }),
    )

  gifts
    .command('send')
    .description('Send a gift')
    .requiredOption('--recipient-user-id <id>', 'Recipient user ID')
    .option('--assets <json>', 'Assets JSON array')
    .option('--currencies <json>', 'Currencies JSON array')
    .option('--message <message>', 'Message')
    .option('--idempotency-key <key>', 'Idempotency key, generated if omitted')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      (
        options: CommonOptions & {
          recipientUserId: string
          assets?: string
          currencies?: string
          message?: string
          idempotencyKey?: string
        },
      ) =>
        runCommand(options, async () => {
          const client = await getClient(options.profile)
          return client.sendGift({
            recipientUserId: options.recipientUserId,
            assets: options.assets
              ? (JSON.parse(options.assets) as Array<{ assetGrantId: string; quantity?: number }>)
              : undefined,
            currencies: options.currencies
              ? (JSON.parse(options.currencies) as Array<{
                  currencyCode: 'shrimp_coin'
                  amount: number
                }>)
              : undefined,
            message: options.message,
            idempotencyKey: buildIdempotencyKey(options.idempotencyKey, 'cli-gift'),
          })
        }),
    )

  return commerce
}
