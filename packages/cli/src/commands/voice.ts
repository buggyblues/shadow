import { join } from 'node:path'
import { Command } from 'commander'
import { getClient, getSocket, parsePositiveInt } from '../utils/client.js'
import { output, outputError, outputSuccess } from '../utils/output.js'
import {
  defaultScreenIntervalMs,
  installVoiceTestBrowser,
  resolveVoiceTestBrowserPath,
  runVoiceMediaBridge,
  validateVoiceBridgeOptions,
} from '../utils/voice-media-bridge.js'

function resolveProfileOption(options: { profile?: string }, command: Command) {
  return options.profile ?? (command.optsWithGlobals() as { profile?: string }).profile
}

export function createVoiceCommand(): Command {
  const voice = new Command('voice').description('Voice channel commands')

  voice
    .command('join')
    .description('Join a voice channel and print Agora connection info')
    .argument('<channel-id>', 'Voice channel ID')
    .option('--muted', 'Join muted')
    .option('--deafened', 'Join deafened')
    .option('--watch', 'Keep the process attached and print voice events')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        channelId: string,
        options: {
          muted?: boolean
          deafened?: boolean
          watch?: boolean
          profile?: string
          json?: boolean
        },
        command: Command,
      ) => {
        try {
          const profile = resolveProfileOption(options, command)
          const client = await getClient(profile)
          const clientId = options.watch
            ? `shadowob-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`
            : 'shadowob-cli'
          const result = await client.joinVoiceChannel(channelId, {
            muted: options.muted,
            deafened: options.deafened,
            clientId,
          })
          output(result, { json: options.json })
          if (!options.watch) return

          const socket = await getSocket(profile)
          socket.on('voice:participant-joined', (event) => output(event, { json: options.json }))
          socket.on('voice:participant-left', (event) => output(event, { json: options.json }))
          socket.on('voice:participant-updated', (event) => output(event, { json: options.json }))
          socket.connect()
          await socket.waitForConnect()
          await socket.joinVoiceChannel(channelId, {
            muted: options.muted,
            deafened: options.deafened,
            clientId,
          })
          process.on('SIGINT', () => {
            void client.leaveVoiceChannel(channelId, { clientId }).finally(() => process.exit(0))
          })
          socket.raw.on('disconnect', () => process.exit(0))
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  voice
    .command('leave')
    .description('Leave a voice channel')
    .argument('<channel-id>', 'Voice channel ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        channelId: string,
        options: { profile?: string; json?: boolean },
        command: Command,
      ) => {
        try {
          const client = await getClient(resolveProfileOption(options, command))
          await client.leaveVoiceChannel(channelId)
          outputSuccess('Left voice channel', { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  voice
    .command('status')
    .description('Show voice channel state')
    .argument('<channel-id>', 'Voice channel ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        channelId: string,
        options: { profile?: string; json?: boolean },
        command: Command,
      ) => {
        try {
          const client = await getClient(resolveProfileOption(options, command))
          output(await client.getVoiceState(channelId), { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  voice
    .command('mute')
    .description('Set local voice mute state')
    .argument('<channel-id>', 'Voice channel ID')
    .option('--off', 'Unmute instead of mute')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        channelId: string,
        options: { off?: boolean; profile?: string; json?: boolean },
        command: Command,
      ) => {
        try {
          const client = await getClient(resolveProfileOption(options, command))
          output(await client.updateVoiceState(channelId, { muted: !options.off }), {
            json: options.json,
          })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  voice
    .command('bridge')
    .description(
      'Join a voice channel through a local Chrome/Chromium media bridge for audio and screen data',
    )
    .argument('<channel-id>', 'Voice channel ID')
    .option('--record-out <dir>', 'Record a full media archive with audio WAV and video WebM files')
    .option('--audio-out <dir>', 'Record remote audio tracks as per-user WAV files')
    .option('--video-out <dir>', 'Record remote video or screen-share tracks as WebM files')
    .option('--screen-out <dir>', 'Record remote screen shares as PNG frame sequences')
    .option(
      '--screen-interval-ms <ms>',
      'Screen-share capture interval in milliseconds',
      String(defaultScreenIntervalMs),
    )
    .option('--input <file>', 'Publish an audio file into the voice channel')
    .option('--stdin-pcm', 'Publish raw signed 16-bit little-endian PCM from stdin')
    .option('--sample-rate <hz>', 'Sample rate for --stdin-pcm', '24000')
    .option('--channels <count>', 'Channel count for --stdin-pcm', '1')
    .option('--browser <path>', 'Chrome/Chromium executable path, or set SHADOWOB_BROWSER')
    .option('--install-browser', 'Install an isolated test Chromium when no managed browser exists')
    .option(
      '--agora-sdk <path>',
      'Agora Web SDK browser bundle path, or set SHADOWOB_AGORA_WEB_SDK',
    )
    .option('--headful', 'Run Chrome/Chromium with a visible window')
    .option('--keep-browser', 'Keep the browser profile open after the bridge exits')
    .option('--duration <seconds>', 'Run for a fixed duration, then leave the voice channel')
    .option('--muted', 'Join Shadow voice presence as muted')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output bridge events as JSON lines')
    .action(
      async (
        channelId: string,
        options: {
          recordOut?: string
          audioOut?: string
          videoOut?: string
          screenOut?: string
          screenIntervalMs: string
          input?: string
          stdinPcm?: boolean
          sampleRate: string
          channels: string
          browser?: string
          installBrowser?: boolean
          agoraSdk?: string
          headful?: boolean
          keepBrowser?: boolean
          duration?: string
          muted?: boolean
          profile?: string
          json?: boolean
        },
        command: Command,
      ) => {
        try {
          if (options.input && options.stdinPcm) {
            throw new Error('Use either --input or --stdin-pcm, not both')
          }
          const screenIntervalMs = parsePositiveInt(
            options.screenIntervalMs,
            '--screen-interval-ms',
          )
          const stdinSampleRate = parsePositiveInt(options.sampleRate, '--sample-rate')
          const stdinChannels = parsePositiveInt(options.channels, '--channels')
          const durationSeconds = options.duration
            ? parsePositiveInt(options.duration, '--duration')
            : undefined
          const audioOutDir =
            options.audioOut ?? (options.recordOut ? join(options.recordOut, 'audio') : undefined)
          const videoOutDir =
            options.videoOut ?? (options.recordOut ? join(options.recordOut, 'video') : undefined)

          await validateVoiceBridgeOptions({
            audioOutDir,
            videoOutDir,
            screenOutDir: options.screenOut,
            inputFile: options.input,
            stdinSampleRate,
            stdinChannels,
          })

          const client = await getClient(resolveProfileOption(options, command))
          await runVoiceMediaBridge({
            client,
            channelId,
            muted: options.muted,
            browser: options.browser,
            installBrowser: options.installBrowser,
            agoraSdk: options.agoraSdk,
            headful: options.headful,
            keepBrowser: options.keepBrowser,
            durationSeconds,
            audioOutDir,
            videoOutDir,
            screenOutDir: options.screenOut,
            screenIntervalMs,
            inputFile: options.input,
            stdinPcm: options.stdinPcm,
            stdinSampleRate,
            stdinChannels,
            json: options.json,
          })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  const browser = new Command('browser').description('Voice bridge browser runtime commands')

  browser
    .command('install')
    .description('Install an isolated Chromium runtime for voice bridge tests')
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      try {
        const executable = await installVoiceTestBrowser({ json: options.json })
        output({ executable }, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), {
          json: options.json,
        })
        process.exit(1)
      }
    })

  browser
    .command('path')
    .description('Show the installed voice bridge test browser path')
    .option('--json', 'Output as JSON')
    .action(async (options: { json?: boolean }) => {
      try {
        const executable = await resolveVoiceTestBrowserPath()
        if (!executable) {
          throw new Error('No managed voice bridge browser is installed')
        }
        output({ executable }, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), {
          json: options.json,
        })
        process.exit(1)
      }
    })

  voice.addCommand(browser)

  return voice
}
