import { Command } from 'commander'
import { configManager } from '../config/manager.js'
import { output, outputSuccess, outputError, type OutputOptions } from '../utils/output.js'
import { ShadowClient } from '@shadowob/sdk'

export function createAuthCommand(): Command {
  const auth = new Command('auth').description('Authentication commands')

  auth
    .command('login')
    .description('Authenticate with a Shadow server')
    .requiredOption('--server-url <url>', 'Shadow server URL')
    .requiredOption('--token <token>', 'JWT token')
    .option('--profile <name>', 'Profile name', 'default')
    .option('--json', 'Output as JSON')
    .action(async (options: { serverUrl: string; token: string; profile: string; json?: boolean }) => {
      try {
        const client = new ShadowClient(options.serverUrl, options.token)
        const user = await client.getMe()

        await configManager.setProfile(options.profile, {
          serverUrl: options.serverUrl,
          token: options.token,
        })
        await configManager.switchProfile(options.profile)

        const outputOpts: OutputOptions = { json: options.json }
        if (options.json) {
          output({ success: true, profile: options.profile, user }, outputOpts)
        } else {
          outputSuccess(`Logged in as ${user.username} (${options.profile})`, outputOpts)
        }
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  auth
    .command('logout')
    .description('Remove a profile')
    .option('--profile <name>', 'Profile name (default: current)')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const profileName = options.profile ?? (await configManager.getCurrentProfileName())
        if (!profileName) {
          outputError('No profile specified and no current profile', { json: options.json })
          process.exit(1)
        }

        const deleted = await configManager.deleteProfile(profileName)
        if (!deleted) {
          outputError(`Profile "${profileName}" not found`, { json: options.json })
          process.exit(1)
        }

        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess(`Logged out (${profileName})`, outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  auth
    .command('whoami')
    .description('Show current user and profile')
    .option('--profile <name>', 'Profile name (default: current)')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const profileName = options.profile ?? (await configManager.getCurrentProfileName())
        const profile = await configManager.getProfile(options.profile)

        if (!profile) {
          outputError(
            profileName
              ? `Profile "${profileName}" not found`
              : 'Not authenticated. Run: shadowob auth login',
            { json: options.json }
          )
          process.exit(1)
        }

        const client = new ShadowClient(profile.serverUrl, profile.token)
        const user = await client.getMe()

        const outputOpts: OutputOptions = { json: options.json }
        if (options.json) {
          output({ profile: profileName, user, serverUrl: profile.serverUrl }, outputOpts)
        } else {
          console.log(`Profile: ${profileName}`)
          console.log(`Server:  ${profile.serverUrl}`)
          console.log(`User:    ${user.username}`)
          if (user.displayName && user.displayName !== user.username) {
            console.log(`Name:    ${user.displayName}`)
          }
        }
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  auth
    .command('switch')
    .description('Switch to a different profile')
    .argument('<profile>', 'Profile name')
    .option('--json', 'Output as JSON')
    .action(async (profileName: string, options: { json?: boolean }) => {
      try {
        const switched = await configManager.switchProfile(profileName)
        if (!switched) {
          outputError(`Profile "${profileName}" not found`, { json: options.json })
          process.exit(1)
        }

        const outputOpts: OutputOptions = { json: options.json }
        outputSuccess(`Switched to profile: ${profileName}`, outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  auth
    .command('list')
    .description('List all profiles')
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      try {
        const profiles = await configManager.listProfiles()
        const current = await configManager.getCurrentProfileName()

        const outputOpts: OutputOptions = { json: options.json }
        if (options.json) {
          output({ profiles, current }, outputOpts)
        } else {
          if (profiles.length === 0) {
            console.log('No profiles. Run: shadowob auth login')
            return
          }
          for (const name of profiles) {
            const marker = name === current ? '* ' : '  '
            console.log(`${marker}${name}`)
          }
        }
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  return auth
}
