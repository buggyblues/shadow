import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

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

  // Products
  const products = shop.command('products').description('Product commands')

  products
    .command('list')
    .description('List products')
    .argument('<server-id>', 'Server ID')
    .option('--category-id <id>', 'Filter by category')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        serverId: string,
        options: { categoryId?: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          const products = await client.listProducts(serverId, { categoryId: options.categoryId })
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
