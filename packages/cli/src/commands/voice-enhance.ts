import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { output, outputError } from '../utils/output.js'

export function createVoiceEnhanceCommand(): Command {
  const voice = new Command('voice-enhance').description('Voice enhancement commands')

  voice
    .command('enhance')
    .description('Enhance a voice transcript')
    .requiredOption('--transcript <text>', 'Transcript text to enhance')
    .option('--language <lang>', 'Language code (e.g. zh-CN, en-US)')
    .option('--no-self-correction', 'Disable self-correction')
    .option('--no-list-formatting', 'Disable list formatting')
    .option('--no-filler-removal', 'Disable filler word removal')
    .option('--tone-adjustment', 'Enable tone adjustment')
    .option('--target-tone <tone>', 'Target tone (formal, casual, professional)')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: Record<string, unknown>) => {
      try {
        const client = await getClient(options.profile as string)
        const result = await client.enhanceVoice({
          transcript: options.transcript as string,
          language: options.language as string | undefined,
          options: {
            enableSelfCorrection: options.selfCorrection !== false,
            enableListFormatting: options.listFormatting !== false,
            enableFillerRemoval: options.fillerRemoval !== false,
            enableToneAdjustment: options.toneAdjustment === true,
            targetTone: options.targetTone as 'formal' | 'casual' | 'professional' | undefined,
          },
        })
        output(result, { json: options.json as boolean })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), {
          json: options.json as boolean,
        })
        process.exit(1)
      }
    })

  voice
    .command('config')
    .description('Get voice enhancement config')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const config = await client.getVoiceConfig()
        output(config, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), {
          json: options.json,
        })
        process.exit(1)
      }
    })

  return voice
}
