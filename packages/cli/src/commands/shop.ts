import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export function createShopCommand(): Command {
  const shop = new Command('shop').description('Shop and marketplace commands')

  // Shop info
  shop
    .command('get')
    .description('Get shop info')
    .argument('<server-id>', 'Server ID or slug')
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
    .command('update')
    .description('Update shop settings')
    .argument('<server-id>', 'Server ID or slug')
    .option('--name <name>', 'Shop name')
    .option('--description <desc>', 'Shop description')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        serverId: string,
        options: { name?: string; description?: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          const shopData = await client.updateShop(serverId, {
            name: options.name,
            description: options.description,
          })
          output(shopData, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  // Categories
  const categories = shop.command('categories').description('Category management')

  categories
    .command('list')
    .description('List categories')
    .argument('<server-id>', 'Server ID or slug')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (serverId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const categoriesData = await client.listCategories(serverId)
        output(categoriesData, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  categories
    .command('create')
    .description('Create a category')
    .argument('<server-id>', 'Server ID or slug')
    .requiredOption('--name <name>', 'Category name')
    .option('--description <desc>', 'Category description')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        serverId: string,
        options: { name: string; description?: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          const category = await client.createCategory(serverId, {
            name: options.name,
            description: options.description,
          })
          output(category, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  categories
    .command('update')
    .description('Update a category')
    .argument('<server-id>', 'Server ID or slug')
    .argument('<category-id>', 'Category ID')
    .option('--name <name>', 'New name')
    .option('--description <desc>', 'New description')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        serverId: string,
        categoryId: string,
        options: { name?: string; description?: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          const category = await client.updateCategory(serverId, categoryId, {
            name: options.name,
            description: options.description,
          })
          output(category, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  categories
    .command('delete')
    .description('Delete a category')
    .argument('<server-id>', 'Server ID or slug')
    .argument('<category-id>', 'Category ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        serverId: string,
        categoryId: string,
        options: { profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          await client.deleteCategory(serverId, categoryId)
          const outputOpts: OutputOptions = { json: options.json }
          outputSuccess('Category deleted', outputOpts)
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  // Products
  const products = shop.command('products').description('Product management')

  products
    .command('list')
    .description('List products')
    .argument('<server-id>', 'Server ID or slug')
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
          const productsData = await client.listProducts(serverId, {
            categoryId: options.categoryId,
          })
          output(productsData, { json: options.json })
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
    .argument('<server-id>', 'Server ID or slug')
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
    .command('create')
    .description('Create a product')
    .argument('<server-id>', 'Server ID or slug')
    .requiredOption('--name <name>', 'Product name')
    .requiredOption('--price <price>', 'Product price')
    .option('--description <desc>', 'Product description')
    .option('--category-id <id>', 'Category ID')
    .option('--stock <n>', 'Stock quantity', '0')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        serverId: string,
        options: {
          name: string
          price: string
          description?: string
          categoryId?: string
          stock?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          // Validate price
          const price = parseFloat(options.price)
          if (Number.isNaN(price) || price < 0) {
            throw new Error('Price must be a non-negative number')
          }
          // Validate stock
          const stock = parseInt(options.stock ?? '0', 10)
          if (Number.isNaN(stock) || stock < 0) {
            throw new Error('Stock must be a non-negative integer')
          }
          const client = await getClient(options.profile)
          const product = await client.createProduct(serverId, {
            name: options.name,
            price,
            description: options.description,
            categoryId: options.categoryId,
            stock,
          })
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
    .command('update')
    .description('Update a product')
    .argument('<server-id>', 'Server ID or slug')
    .argument('<product-id>', 'Product ID')
    .option('--name <name>', 'New name')
    .option('--price <price>', 'New price')
    .option('--description <desc>', 'New description')
    .option('--stock <n>', 'New stock quantity')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        serverId: string,
        productId: string,
        options: {
          name?: string
          price?: string
          description?: string
          stock?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const product = await client.updateProduct(serverId, productId, {
            name: options.name,
            price: options.price ? parseFloat(options.price) : undefined,
            description: options.description,
            stock: options.stock ? parseInt(options.stock, 10) : undefined,
          })
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
    .command('delete')
    .description('Delete a product')
    .argument('<server-id>', 'Server ID or slug')
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
          await client.deleteProduct(serverId, productId)
          const outputOpts: OutputOptions = { json: options.json }
          outputSuccess('Product deleted', outputOpts)
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  // Cart
  const cart = shop.command('cart').description('Shopping cart')

  cart
    .command('list')
    .description('List cart items')
    .argument('<server-id>', 'Server ID or slug')
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

  cart
    .command('add')
    .description('Add item to cart')
    .argument('<server-id>', 'Server ID or slug')
    .requiredOption('--product-id <id>', 'Product ID')
    .option('--quantity <n>', 'Quantity', '1')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        serverId: string,
        options: { productId: string; quantity?: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          const item = await client.addToCart(serverId, {
            productId: options.productId,
            quantity: parseInt(options.quantity ?? '1', 10),
          })
          output(item, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  cart
    .command('remove')
    .description('Remove item from cart')
    .argument('<server-id>', 'Server ID or slug')
    .argument('<item-id>', 'Cart item ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (serverId: string, itemId: string, options: { profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          await client.removeCartItem(serverId, itemId)
          const outputOpts: OutputOptions = { json: options.json }
          outputSuccess('Item removed from cart', outputOpts)
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  // Orders
  const orders = shop.command('orders').description('Order management')

  orders
    .command('list')
    .description('List orders')
    .argument('<server-id>', 'Server ID or slug')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (serverId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const ordersData = await client.listOrders(serverId)
        output(ordersData, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  orders
    .command('get')
    .description('Get order details')
    .argument('<server-id>', 'Server ID or slug')
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

  orders
    .command('create')
    .description('Create an order from cart')
    .argument('<server-id>', 'Server ID or slug')
    .option('--note <text>', 'Order note')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (serverId: string, options: { note?: string; profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          const order = await client.createOrder(serverId, { note: options.note })
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
  const wallet = shop.command('wallet').description('Wallet management')

  wallet
    .command('balance')
    .description('Get wallet balance')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const balance = await client.getWallet()
        output(balance, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  wallet
    .command('transactions')
    .description('List wallet transactions')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const transactions = await client.getWalletTransactions()
        output(transactions, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  wallet
    .command('topup')
    .description('Top up wallet')
    .requiredOption('--amount <n>', 'Amount to add')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { amount: string; profile?: string; json?: boolean }) => {
      try {
        const amount = parseFloat(options.amount)
        if (Number.isNaN(amount) || amount <= 0) {
          throw new Error('Amount must be a positive number')
        }
        const client = await getClient(options.profile)
        const result = await client.topUpWallet(amount)
        output(result, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  return shop
}
