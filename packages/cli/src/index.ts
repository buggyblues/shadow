#!/usr/bin/env node
import { Command } from 'commander'
import { createAgentsCommand } from './commands/agents.js'
import { createAppsCommand } from './commands/apps.js'
import { createAuthCommand } from './commands/auth.js'
import { createChannelsCommand } from './commands/channels.js'
import { createDmsCommand } from './commands/dms.js'
import { createFriendsCommand } from './commands/friends.js'
import { createInvitesCommand } from './commands/invites.js'
import { createListenCommand } from './commands/listen.js'
import { createMarketplaceCommand } from './commands/marketplace.js'
import { createMediaCommand } from './commands/media.js'
import { createNotificationsCommand } from './commands/notifications.js'
import { createOAuthCommand } from './commands/oauth.js'
import { createSearchCommand } from './commands/search.js'
import { createServersCommand } from './commands/servers.js'
import { createShopCommand } from './commands/shop.js'
import { createThreadsCommand } from './commands/threads.js'
import { createWorkspaceCommand } from './commands/workspace.js'
import { configManager } from './config/manager.js'

const program = new Command()

program
  .name('shadowob')
  .description('Shadow CLI — command-line interface for Shadow servers')
  .version('0.1.0')
  .configureHelp({
    sortSubcommands: true,
  })

// Global options
program.option('--profile <name>', 'Profile to use (default: current)')

// Commands
program.addCommand(createAuthCommand())
program.addCommand(createServersCommand())
program.addCommand(createChannelsCommand())
program.addCommand(createThreadsCommand())
program.addCommand(createAgentsCommand())
program.addCommand(createListenCommand())
program.addCommand(createDmsCommand())
program.addCommand(createWorkspaceCommand())
program.addCommand(createShopCommand())
program.addCommand(createAppsCommand())
program.addCommand(createNotificationsCommand())
program.addCommand(createFriendsCommand())
program.addCommand(createInvitesCommand())
program.addCommand(createOAuthCommand())
program.addCommand(createMarketplaceCommand())
program.addCommand(createMediaCommand())
program.addCommand(createSearchCommand())

// Config command
program
  .command('config')
  .description('Show configuration file path')
  .action(() => {
    console.log(configManager.getConfigPath())
  })

program.parse()
