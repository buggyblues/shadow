import { readFile } from 'node:fs/promises'
import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { output, outputError } from '../utils/output.js'

export function createMediaCommand(): Command {
  const media = new Command('media').description('Media upload and download commands')

  media
    .command('upload')
    .description('Upload a file')
    .requiredOption('--file <path>', 'File path to upload')
    .option('--server-id <id>', 'Server ID for server-scoped upload')
    .option('--channel-id <id>', 'Channel ID for channel-scoped upload')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: {
        file: string
        serverId?: string
        channelId?: string
        profile?: string
        json?: boolean
      }) => {
        try {
          const client = await getClient(options.profile)
          const content = await readFile(options.file)
          const blob = new Blob([content])
          const filename = options.file.split('/').pop() ?? 'upload'
          const result = await client.uploadMedia(blob, filename, {
            serverId: options.serverId,
            channelId: options.channelId,
          })
          output(result, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  media
    .command('download')
    .description('Download a file by contentRef')
    .argument('<content-ref>', 'Content reference (e.g., /shadow/uploads/xxx)')
    .option('--output <path>', 'Output file path')
    .option('--profile <name>', 'Profile to use')
    .action(async (contentRef: string, options: { output?: string; profile?: string }) => {
      try {
        const client = await getClient(options.profile)
        const res = await client.downloadFile(contentRef)
        const content = await res.arrayBuffer()
        if (options.output) {
          const { writeFile } = await import('node:fs/promises')
          await writeFile(options.output, Buffer.from(content))
          console.log(`Downloaded to ${options.output}`)
        } else {
          process.stdout.write(Buffer.from(content))
        }
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: false })
        process.exit(1)
      }
    })

  return media
}
