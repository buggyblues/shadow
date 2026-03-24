import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export function createMediaCommand(): Command {
  const media = new Command('media').description('Media management commands')

  media
    .command('upload')
    .description('Upload a file')
    .requiredOption('--file <path>', 'File path to upload')
    .option('--message-id <id>', 'Associate with message')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (options: { file: string; messageId?: string; profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          const buffer = readFileSync(options.file)
          const filename = options.file.split('/').pop() || 'file'
          // Try to determine content type from extension
          const ext = filename.split('.').pop()?.toLowerCase()
          const contentTypeMap: Record<string, string> = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            gif: 'image/gif',
            webp: 'image/webp',
            pdf: 'application/pdf',
            txt: 'text/plain',
            json: 'application/json',
          }
          const contentType = contentTypeMap[ext || ''] || 'application/octet-stream'

          const result = await client.uploadMedia(
            buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
            filename,
            contentType,
            options.messageId,
          )
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
    .description('Download a file')
    .argument('<file-url>', 'File URL or key')
    .option('--output <path>', 'Output file path')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (fileUrl: string, options: { output?: string; profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          const result = await client.downloadFile(fileUrl)

          if (options.output) {
            const { writeFileSync } = await import('node:fs')
            writeFileSync(options.output, Buffer.from(result.buffer))
            const outputOpts: OutputOptions = { json: options.json }
            outputSuccess(`Downloaded to ${options.output}`, outputOpts)
          } else {
            // Output metadata
            output(
              {
                filename: result.filename,
                contentType: result.contentType,
                size: result.buffer.byteLength,
              },
              { json: options.json },
            )
          }
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  return media
}
