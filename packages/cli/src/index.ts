#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { createApiTokensCommand } from './commands/api-tokens.js'
import { createAuthCommand } from './commands/auth.js'
import { createBuddiesCommand } from './commands/buddies.js'
import { createChannelsCommand } from './commands/channels.js'
import { createCloudCommand } from './commands/cloud.js'
import { createCommerceCommand } from './commands/commerce.js'
import { createConfigCommand } from './commands/config.js'
import { createDiscoverCommand } from './commands/discover.js'
import { createDirectMessagesCommand } from './commands/dms.js'
import { createFriendsCommand } from './commands/friends.js'
import { createInboxCommand } from './commands/inbox.js'
import { createInvitesCommand } from './commands/invites.js'
import { createListenCommand } from './commands/listen.js'
import { createLocalBridgeCommand } from './commands/local-bridge.js'
import { createMarketplaceCommand } from './commands/marketplace.js'
import { createMediaCommand } from './commands/media.js'
import { createNotificationsCommand } from './commands/notifications.js'
import { createOAuthCommand } from './commands/oauth.js'
import { createPingCommand } from './commands/ping.js'
import { createProfileCommentsCommand } from './commands/profile-comments.js'
import { createSearchCommand } from './commands/search.js'
import { createServersCommand } from './commands/servers.js'
import { createShopCommand } from './commands/shop.js'
import { createSpaceAppCommand } from './commands/space-app.js'
import { createStatusCommand } from './commands/status.js'
import { createThreadsCommand } from './commands/threads.js'
import { createVoiceCommand } from './commands/voice.js'
import { createWorkspaceCommand } from './commands/workspace.js'

function cliVersion(): string {
  try {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version?: unknown }
    return typeof packageJson.version === 'string' ? packageJson.version : '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export function createProgram(): Command {
  const program = new Command()

  program
    .name('shadowob')
    .description('Shadow CLI — command-line interface for Shadow servers')
    .version(cliVersion())
    .configureHelp({
      sortSubcommands: true,
    })

  program.addCommand(createAuthCommand())
  program.addCommand(createSpaceAppCommand())
  program.addCommand(createServersCommand())
  program.addCommand(createChannelsCommand())
  program.addCommand(createThreadsCommand())
  program.addCommand(createBuddiesCommand())
  program.addCommand(createInboxCommand())
  program.addCommand(createListenCommand())
  program.addCommand(createLocalBridgeCommand())
  program.addCommand(createDirectMessagesCommand())
  program.addCommand(createWorkspaceCommand())
  program.addCommand(createShopCommand())
  program.addCommand(createCommerceCommand())
  program.addCommand(createNotificationsCommand())
  program.addCommand(createFriendsCommand())
  program.addCommand(createInvitesCommand())
  program.addCommand(createOAuthCommand())
  program.addCommand(createMarketplaceCommand())
  program.addCommand(createMediaCommand())
  program.addCommand(createSearchCommand())
  program.addCommand(createConfigCommand())
  program.addCommand(createPingCommand())
  program.addCommand(createStatusCommand())
  program.addCommand(createCloudCommand())
  program.addCommand(createApiTokensCommand())
  program.addCommand(createDiscoverCommand())
  program.addCommand(createProfileCommentsCommand())
  program.addCommand(createVoiceCommand())

  return program
}

export function isMainModule(metaUrl: string, entryPath: string | undefined): boolean {
  if (!entryPath) return false
  const modulePath = fileURLToPath(metaUrl)
  try {
    return realpathSync(modulePath) === realpathSync(entryPath)
  } catch {
    return modulePath === resolve(entryPath)
  }
}

const entryPath = process.argv[1]
if (isMainModule(import.meta.url, entryPath)) {
  createProgram().parse()
}
