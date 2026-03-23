import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export function createMarketplaceCommand(): Command {
  const marketplace = new Command('marketplace').description('Marketplace and rental commands')

  // Listings
  const listings = marketplace.command('listings').description('Agent listings')

  listings
    .command('list')
    .description('List available agent listings')
    .option('--agent-id <id>', 'Filter by agent ID')
    .option('--min-price <n>', 'Minimum price')
    .option('--max-price <n>', 'Maximum price')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        agentId?: string
        minPrice?: string
        maxPrice?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          const listingsData = await client.browseListings({
            agentId: options.agentId,
            minPrice: options.minPrice ? parseFloat(options.minPrice) : undefined,
            maxPrice: options.maxPrice ? parseFloat(options.maxPrice) : undefined,
          })
          output(listingsData, { json: options.json })
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
    .requiredOption('--agent-id <id>', 'Agent ID to list')
    .requiredOption('--price <n>', 'Price per hour')
    .option('--description <text>', 'Listing description')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        agentId: string
        price: string
        description?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          const listing = await client.createListing({
            agentId: options.agentId,
            price: parseFloat(options.price),
            description: options.description,
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
    .option('--price <n>', 'New price')
    .option('--description <text>', 'New description')
    .option('--active <bool>', 'Set active status')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        listingId: string,
        options: {
          price?: string
          description?: string
          active?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const listing = await client.updateListing(listingId, {
            price: options.price ? parseFloat(options.price) : undefined,
            description: options.description,
            active: options.active ? options.active === 'true' : undefined,
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
  const contracts = marketplace.command('contracts').description('Rental contracts')

  contracts
    .command('list')
    .description('List contracts')
    .option('--as-renter', 'Show contracts where you are renter')
    .option('--as-owner', 'Show contracts where you are owner')
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
          const contractsData = await client.listContracts({
            asRenter: options.asRenter,
            asOwner: options.asOwner,
            activeOnly: options.activeOnly,
          })
          output(contractsData, { json: options.json })
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
    .description('Rent an agent (create contract)')
    .requiredOption('--listing-id <id>', 'Listing ID')
    .requiredOption('--hours <n>', 'Number of hours to rent')
    .option('--note <text>', 'Rental note')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        listingId: string
        hours: string
        note?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          const contract = await client.signContract({
            listingId: options.listingId,
            hours: parseInt(options.hours, 10),
            note: options.note,
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
    .description('Cancel a contract')
    .argument('<contract-id>', 'Contract ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (contractId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        await client.terminateContract(contractId)
        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess('Contract cancelled', outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  contracts
    .command('extend')
    .description('Extend a contract')
    .argument('<contract-id>', 'Contract ID')
    .requiredOption('--hours <n>', 'Additional hours')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (contractId: string, options: { hours: string; profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          const contract = await client.extendRentalContract(contractId, {
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

  return marketplace
}
