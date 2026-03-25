import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export function createMarketplaceCommand(): Command {
  const marketplace = new Command('marketplace').description('Marketplace commands')

  // Listings
  const listings = marketplace.command('listings').description('Listing commands')

  listings
    .command('list')
    .description('Browse marketplace listings')
    .option('--search <text>', 'Search query')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--min-price <n>', 'Minimum price per hour')
    .option('--max-price <n>', 'Maximum price per hour')
    .option('--limit <n>', 'Number of results', '20')
    .option('--offset <n>', 'Pagination offset', '0')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        search?: string
        tags?: string
        minPrice?: string
        maxPrice?: string
        limit?: string
        offset?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          const params: {
            search?: string
            tags?: string[]
            minPrice?: number
            maxPrice?: number
            limit?: number
            offset?: number
          } = {}

          if (options.search) params.search = options.search
          if (options.tags) params.tags = options.tags.split(',').map((t) => t.trim())
          if (options.minPrice) params.minPrice = parseFloat(options.minPrice)
          if (options.maxPrice) params.maxPrice = parseFloat(options.maxPrice)
          if (options.limit) params.limit = parseInt(options.limit, 10)
          if (options.offset) params.offset = parseInt(options.offset, 10)

          const results = await client.browseListings(params)
          output(results, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  listings
    .command('get')
    .description('Get listing details')
    .argument('<listing-id>', 'Listing ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (listingId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const listing = await client.getListing(listingId)
        output(listing, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  listings
    .command('create')
    .description('Create a listing')
    .requiredOption('--agent-id <id>', 'Agent ID')
    .requiredOption('--title <title>', 'Listing title')
    .requiredOption('--price <n>', 'Price per hour')
    .option('--description <desc>', 'Listing description')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        agentId: string
        title: string
        price: string
        description?: string
        tags?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          const listing = await client.createListing({
            agentId: options.agentId,
            title: options.title,
            pricePerHour: parseFloat(options.price),
            description: options.description ?? '',
            tags: options.tags?.split(',').map((t) => t.trim()),
          })
          output(listing, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  listings
    .command('update')
    .description('Update a listing')
    .argument('<listing-id>', 'Listing ID')
    .option('--title <title>', 'New title')
    .option('--price <n>', 'New price per hour')
    .option('--description <desc>', 'New description')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        listingId: string,
        options: {
          title?: string
          price?: string
          description?: string
          tags?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const data: {
            title?: string
            pricePerHour?: number
            description?: string
            tags?: string[]
          } = {}
          if (options.title) data.title = options.title
          if (options.price) data.pricePerHour = parseFloat(options.price)
          if (options.description) data.description = options.description
          if (options.tags) data.tags = options.tags.split(',').map((t) => t.trim())
          const listing = await client.updateListing(listingId, data)
          output(listing, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  listings
    .command('delete')
    .description('Delete a listing')
    .argument('<listing-id>', 'Listing ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (listingId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.deleteListing(listingId)
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('Listing deleted', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  // Contracts
  const contracts = marketplace.command('contracts').description('Contract commands')

  contracts
    .command('list')
    .description('List contracts')
    .option('--as-renter', 'Show only contracts where you are the renter')
    .option('--as-owner', 'Show only contracts where you are the owner')
    .option('--active-only', 'Show only active contracts')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        asRenter?: boolean
        asOwner?: boolean
        activeOnly?: boolean
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          const params: { role?: 'tenant' | 'owner'; status?: string } = {}
          if (options.asRenter) params.role = 'tenant'
          else if (options.asOwner) params.role = 'owner'
          if (options.activeOnly) params.status = 'active'
          const results = await client.listContracts(params)
          output(results, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  contracts
    .command('get')
    .description('Get contract details')
    .argument('<contract-id>', 'Contract ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (contractId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const contract = await client.getContract(contractId)
        output(contract, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  contracts
    .command('create')
    .description('Sign a contract for a listing')
    .requiredOption('--listing-id <id>', 'Listing ID')
    .requiredOption('--hours <n>', 'Number of hours')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: { listingId: string; hours: string; profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          const contract = await client.signContract({
            listingId: options.listingId,
            hours: parseInt(options.hours, 10),
          })
          output(contract, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  contracts
    .command('cancel')
    .description('Terminate a contract')
    .argument('<contract-id>', 'Contract ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (contractId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.terminateContract(contractId)
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('Contract terminated', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  return marketplace
}
