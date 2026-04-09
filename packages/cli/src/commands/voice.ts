import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export function createVoiceCommand(): Command {
  const voice = new Command('voice').description('Voice channel commands')

  voice
    .command('join')
    .description('Join a voice channel as a buddy/agent')
    .argument('<channel-id>', 'Voice channel ID to join')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (channelId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const outputOpts: OutputOptions = { json: options.json }

        // Request RTC connection info from server
        const connectionInfo = await client.getRtcJoinInfo(channelId)

        output(connectionInfo, outputOpts)

        if (!options.json) {
          console.log('\n🎤 Voice Channel Connection Info')
          console.log(`  Channel: ${connectionInfo.channelName} (${channelId})`)
          console.log(`  RTC UID: ${connectionInfo.uid}`)
          console.log(`  Token expires at: ${new Date(connectionInfo.expireAt).toISOString()}`)
          if (connectionInfo.policy) {
            console.log(`  Policy: ${JSON.stringify(connectionInfo.policy)}`)
          }
          console.log('\n💡 Use this info to connect your buddy agent to the voice channel.')
        }
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), {
          json: options.json,
        })
        process.exit(1)
      }
    })

  voice
    .command('leave')
    .description('Leave a voice channel')
    .argument('<channel-id>', 'Voice channel ID to leave')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (channelId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const outputOpts: OutputOptions = { json: options.json }

        // Get channel info to verify
        const channel = await client.getChannel(channelId)
        if (channel.type !== 'voice') {
          outputError('Channel is not a voice channel', outputOpts)
          process.exit(1)
        }

        outputSuccess(`Ready to leave voice channel: ${channel.name}`, outputOpts)
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), {
          json: options.json,
        })
        process.exit(1)
      }
    })

  voice
    .command('status')
    .description('Get voice channel status')
    .argument('<channel-id>', 'Voice channel ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (channelId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const outputOpts: OutputOptions = { json: options.json }

        const channel = await client.getChannel(channelId)
        if (channel.type !== 'voice') {
          outputError('Channel is not a voice channel', outputOpts)
          process.exit(1)
        }

        const policy = await client.getBuddyPolicy(channelId).catch(() => null)

        output(
          {
            channelId,
            name: channel.name,
            serverId: channel.serverId,
            buddyPolicy: policy,
          },
          outputOpts,
        )
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), {
          json: options.json,
        })
        process.exit(1)
      }
    })

  return voice
}
