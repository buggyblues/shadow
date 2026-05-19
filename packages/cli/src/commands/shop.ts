import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { output, outputError } from '../utils/output.js'

function parseJsonObject(value: string | undefined, optionName: string): Record<string, unknown> {
  if (!value) return {}
  const parsed = JSON.parse(value) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${optionName} must be a JSON object`)
  }
  return parsed as Record<string, unknown>
}

function parseOptionalNumber(value: string | undefined, optionName: string): number | undefined {
  if (value == null) return undefined
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${optionName} must be a positive integer`)
  }
  return parsed
}

export function createShopCommand(): Command {
  const shop = new Command('shop').description('Shop commands')

  // Shop info
  shop
    .command('get')
    .description('Get shop info')
    .argument('<server-id>', 'Server ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (serverId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const shopData = await client.getShop(serverId)
        output(shopData, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  shop
    .command('get-by-id')
    .description('Get shop info by shop ID')
    .argument('<shop-id>', 'Shop ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (shopId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const shopData = await client.getShopById(shopId)
        output(shopData, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  const me = shop.command('me').description('Personal shop commands')

  me.command('get')
    .description('Get my personal shop')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        output(await client.getMyShop(), { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  me.command('upsert')
    .description('Create or update my personal shop')
    .option('--data <json>', 'Shop JSON payload')
    .option('--name <name>', 'Shop name')
    .option('--description <description>', 'Shop description')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        data?: string
        name?: string
        description?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          const payload = parseJsonObject(options.data, '--data')
          if (options.name) payload.name = options.name
          if (options.description) payload.description = options.description
          output(await client.upsertMyShop(payload), { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  // Products
  const products = shop.command('products').description('Product commands')

  products
    .command('list')
    .description('List products')
    .argument('<server-id>', 'Server ID')
    .option('--category-id <id>', 'Filter by category')
    .option('--status <status>', 'Filter by status')
    .option('--keyword <keyword>', 'Search keyword')
    .option('--limit <n>', 'Maximum products')
    .option('--offset <n>', 'Offset')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        serverId: string,
        options: {
          categoryId?: string
          status?: string
          keyword?: string
          limit?: string
          offset?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const products = await client.listProducts(serverId, {
            categoryId: options.categoryId,
            status: options.status,
            keyword: options.keyword,
            limit: parseOptionalNumber(options.limit, '--limit'),
            offset: options.offset ? Number.parseInt(options.offset, 10) : undefined,
          })
          output(products, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  products
    .command('list-by-shop')
    .description('List products by shop ID')
    .argument('<shop-id>', 'Shop ID')
    .option('--keyword <keyword>', 'Search keyword')
    .option('--limit <n>', 'Maximum products')
    .option('--offset <n>', 'Offset')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        shopId: string,
        options: {
          keyword?: string
          limit?: string
          offset?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const result = await client.listShopProducts(shopId, {
            keyword: options.keyword,
            limit: parseOptionalNumber(options.limit, '--limit'),
            offset: options.offset ? Number.parseInt(options.offset, 10) : undefined,
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

  products
    .command('get')
    .description('Get product details')
    .argument('<server-id>', 'Server ID')
    .argument('<product-id>', 'Product ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        serverId: string,
        productId: string,
        options: { profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          const product = await client.getProduct(serverId, productId)
          output(product, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  products
    .command('create-by-shop')
    .description('Create a product by shop ID using a JSON payload')
    .argument('<shop-id>', 'Shop ID')
    .requiredOption('--data <json>', 'Product JSON payload')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (shopId: string, options: { data: string; profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        output(await client.createShopProduct(shopId, parseJsonObject(options.data, '--data')), {
          json: options.json,
        })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), {
          json: options.json,
        })
        process.exit(1)
      }
    })

  products
    .command('update-by-shop')
    .description('Update a product by shop ID using a JSON payload')
    .argument('<shop-id>', 'Shop ID')
    .argument('<product-id>', 'Product ID')
    .requiredOption('--data <json>', 'Product JSON payload')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        shopId: string,
        productId: string,
        options: { data: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          output(
            await client.updateShopProduct(
              shopId,
              productId,
              parseJsonObject(options.data, '--data'),
            ),
            { json: options.json },
          )
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  products
    .command('purchase')
    .description('Purchase a product by shop ID')
    .argument('<shop-id>', 'Shop ID')
    .argument('<product-id>', 'Product ID')
    .option('--sku-id <id>', 'SKU ID')
    .requiredOption('--idempotency-key <key>', 'Idempotency key')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        shopId: string,
        productId: string,
        options: { skuId?: string; idempotencyKey: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          output(
            await client.purchaseShopProduct(shopId, productId, {
              skuId: options.skuId,
              idempotencyKey: options.idempotencyKey,
            }),
            { json: options.json },
          )
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  const offers = shop.command('offers').description('Commerce offer commands')

  offers
    .command('list')
    .description('List commerce offers for a shop')
    .argument('<shop-id>', 'Shop ID')
    .option('--keyword <keyword>', 'Search keyword')
    .option('--limit <n>', 'Maximum offers')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        shopId: string,
        options: { keyword?: string; limit?: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          output(
            await client.listCommerceOffers(shopId, {
              keyword: options.keyword,
              limit: parseOptionalNumber(options.limit, '--limit'),
            }),
            { json: options.json },
          )
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  offers
    .command('create')
    .description('Create a commerce offer for a shop')
    .argument('<shop-id>', 'Shop ID')
    .requiredOption('--product-id <id>', 'Product ID')
    .option('--allowed-surfaces <list>', 'Comma-separated surfaces, e.g. channel,dm')
    .option('--price-override <amount>', 'Price override')
    .option('--seller-buddy-user-id <id>', 'Seller Buddy user ID')
    .option('--status <status>', 'Offer status')
    .option('--metadata <json>', 'Metadata JSON object')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        shopId: string,
        options: {
          productId: string
          allowedSurfaces?: string
          priceOverride?: string
          sellerBuddyUserId?: string
          status?: 'draft' | 'active' | 'paused' | 'archived'
          metadata?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          output(
            await client.createCommerceOffer(shopId, {
              productId: options.productId,
              allowedSurfaces: options.allowedSurfaces
                ? (options.allowedSurfaces.split(',').map((item) => item.trim()) as Array<
                    'channel' | 'dm'
                  >)
                : undefined,
              priceOverride: options.priceOverride ? Number(options.priceOverride) : undefined,
              sellerBuddyUserId: options.sellerBuddyUserId,
              status: options.status,
              metadata: options.metadata
                ? parseJsonObject(options.metadata, '--metadata')
                : undefined,
            }),
            { json: options.json },
          )
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  const deliverables = offers.command('deliverables').description('Commerce deliverable commands')

  deliverables
    .command('create')
    .description('Create a deliverable for an offer')
    .argument('<shop-id>', 'Shop ID')
    .argument('<offer-id>', 'Offer ID')
    .requiredOption('--resource-id <id>', 'Resource ID')
    .option('--kind <kind>', 'Deliverable kind')
    .option('--resource-type <type>', 'Resource type')
    .option('--sender-buddy-user-id <id>', 'Sender Buddy user ID')
    .option('--message-template-key <key>', 'Message template key')
    .option('--metadata <json>', 'Metadata JSON object')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        shopId: string,
        offerId: string,
        options: {
          resourceId: string
          kind?:
            | 'paid_file'
            | 'message'
            | 'external'
            | 'entitlement'
            | 'community_asset'
            | 'currency'
          resourceType?: string
          senderBuddyUserId?: string
          messageTemplateKey?: string
          metadata?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          output(
            await client.createCommerceDeliverable(shopId, offerId, {
              resourceId: options.resourceId,
              kind: options.kind,
              resourceType: options.resourceType,
              senderBuddyUserId: options.senderBuddyUserId,
              messageTemplateKey: options.messageTemplateKey,
              metadata: options.metadata
                ? parseJsonObject(options.metadata, '--metadata')
                : undefined,
            }),
            { json: options.json },
          )
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  const assetDefinitions = shop.command('assets').description('Shop asset definition commands')

  assetDefinitions
    .command('list')
    .description('List shop asset definitions')
    .argument('<shop-id>', 'Shop ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (shopId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        output(await client.listShopAssetDefinitions(shopId), { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), {
          json: options.json,
        })
        process.exit(1)
      }
    })

  assetDefinitions
    .command('create')
    .description('Create a shop asset definition')
    .argument('<shop-id>', 'Shop ID')
    .requiredOption('--asset-type <type>', 'Asset type')
    .requiredOption('--name <name>', 'Asset name')
    .option('--data <json>', 'Additional asset definition JSON')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        shopId: string,
        options: {
          assetType: string
          name: string
          data?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          output(
            await client.createShopAssetDefinition(shopId, {
              ...parseJsonObject(options.data, '--data'),
              assetType: options.assetType as Parameters<
                typeof client.createShopAssetDefinition
              >[1]['assetType'],
              name: options.name,
            }),
            { json: options.json },
          )
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  assetDefinitions
    .command('update')
    .description('Update a shop asset definition')
    .argument('<shop-id>', 'Shop ID')
    .argument('<asset-definition-id>', 'Asset definition ID')
    .requiredOption('--data <json>', 'Asset definition JSON payload')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        shopId: string,
        assetDefinitionId: string,
        options: { data: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          output(
            await client.updateShopAssetDefinition(
              shopId,
              assetDefinitionId,
              parseJsonObject(options.data, '--data'),
            ),
            { json: options.json },
          )
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  const entitlements = shop.command('entitlements').description('Shop entitlement commands')

  entitlements
    .command('list')
    .description('List entitlements for a shop')
    .argument('<shop-id>', 'Shop ID')
    .option('--limit <n>', 'Maximum entitlements')
    .option('--offset <n>', 'Offset')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        shopId: string,
        options: { limit?: string; offset?: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          output(
            await client.listShopEntitlements(shopId, {
              limit: parseOptionalNumber(options.limit, '--limit'),
              offset: options.offset ? Number.parseInt(options.offset, 10) : undefined,
            }),
            { json: options.json },
          )
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  // Cart
  const cart = shop.command('cart').description('Cart commands')

  cart
    .command('list')
    .description('List cart items')
    .argument('<server-id>', 'Server ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (serverId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const cartData = await client.getCart(serverId)
        output(cartData, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  // Orders
  const orders = shop.command('orders').description('Order commands')

  orders
    .command('list')
    .description('List orders')
    .argument('<server-id>', 'Server ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (serverId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const orders = await client.listOrders(serverId)
        output(orders, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  orders
    .command('get')
    .description('Get order details')
    .argument('<server-id>', 'Server ID')
    .argument('<order-id>', 'Order ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (serverId: string, orderId: string, options: { profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          const order = await client.getOrder(serverId, orderId)
          output(order, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  // Wallet
  const wallet = shop.command('wallet').description('Wallet commands')

  wallet
    .command('balance')
    .description('Get wallet balance')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const wallet = await client.getWallet()
        output(wallet, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  return shop
}
