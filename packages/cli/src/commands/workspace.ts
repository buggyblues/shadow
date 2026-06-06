import { readFile, writeFile } from 'node:fs/promises'
import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

async function handleWorkspaceGet(serverId: string, options: { profile?: string; json?: boolean }) {
  try {
    const client = await getClient(options.profile)
    const ws = await client.getWorkspace(serverId)
    output(ws, { json: options.json })
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), { json: options.json })
    process.exit(1)
  }
}

function shellQuote(value: string) {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) return value
  return `'${value.replace(/'/g, "'\\''")}'`
}

function inferMimeType(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const mimeMap: Record<string, string> = {
    csv: 'text/csv',
    gif: 'image/gif',
    html: 'text/html',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    json: 'application/json',
    md: 'text/markdown',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    pdf: 'application/pdf',
    png: 'image/png',
    svg: 'image/svg+xml',
    txt: 'text/plain',
    wav: 'audio/wav',
    webm: 'video/webm',
    webp: 'image/webp',
    xml: 'application/xml',
    zip: 'application/zip',
  }
  return mimeMap[ext] ?? 'application/octet-stream'
}

function withWorkspaceFileDownloadHint(serverId: string, value: Record<string, unknown>) {
  const next = { ...value }
  delete next.contentRef
  delete next.previewUrl

  const fileId = typeof next.id === 'string' ? next.id : null
  if (!fileId) return next

  const outputName =
    typeof next.name === 'string' && next.name.trim() ? next.name.trim() : `${fileId}.download`
  next.downloadCommand = [
    'shadowob workspace files download',
    shellQuote(serverId),
    shellQuote(fileId),
    '--output',
    shellQuote(outputName),
    '--json',
  ].join(' ')
  return next
}

function presentWorkspaceValue(serverId: string, value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => presentWorkspaceValue(serverId, item))
  if (!value || typeof value !== 'object') return value

  const record = value as Record<string, unknown>
  const presented: Record<string, unknown> =
    record.kind === 'file' || record.contentRef || record.previewUrl
      ? withWorkspaceFileDownloadHint(serverId, record)
      : { ...record }

  for (const [key, item] of Object.entries(presented)) {
    if (key === 'downloadCommand') continue
    presented[key] = presentWorkspaceValue(serverId, item)
  }
  return presented
}

async function handleWorkspaceFileUpload(
  serverId: string,
  options: {
    file: string
    name?: string
    parentId?: string
    profile?: string
    json?: boolean
  },
) {
  try {
    const client = await getClient(options.profile)
    const content = await readFile(options.file)
    const name = options.name ?? options.file.split('/').pop() ?? 'upload'
    const blob = new Blob([content], { type: inferMimeType(name) })
    const result = await client.uploadWorkspaceFile(serverId, blob, name, options.parentId)
    output(presentWorkspaceValue(serverId, result), { json: options.json })
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), {
      json: options.json,
    })
    process.exit(1)
  }
}

async function handleWorkspaceFileSearch(
  serverId: string,
  options: {
    searchText?: string
    ext?: string
    parentId?: string
    limit?: string
    profile?: string
    json?: boolean
  },
) {
  try {
    const client = await getClient(options.profile)
    const files = await client.searchWorkspaceFiles(serverId, {
      searchText: options.searchText,
      ext: options.ext,
      parentId: options.parentId,
      limit: parseInt(options.limit ?? '50', 10),
    })
    output(presentWorkspaceValue(serverId, files), { json: options.json })
  } catch (error) {
    outputError(error instanceof Error ? error.message : String(error), {
      json: options.json,
    })
    process.exit(1)
  }
}

export function createWorkspaceCommand(): Command {
  const workspace = new Command('workspace').description('Workspace file management commands')

  workspace
    .command('get')
    .alias('info')
    .description('Get workspace info')
    .argument('<server-id>', 'Server ID or slug')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(handleWorkspaceGet)

  workspace
    .command('tree')
    .description('Get workspace file tree')
    .argument('<server-id>', 'Server ID or slug')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (serverId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const tree = await client.getWorkspaceTree(serverId)
        output(presentWorkspaceValue(serverId, tree), { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  workspace
    .command('stats')
    .description('Get workspace stats')
    .argument('<server-id>', 'Server ID or slug')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (serverId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const stats = await client.getWorkspaceStats(serverId)
        output(stats, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

  workspace
    .command('children')
    .description('List children in a folder')
    .argument('<server-id>', 'Server ID or slug')
    .option('--parent-id <id>', 'Parent folder ID (omit for root)')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        serverId: string,
        options: { parentId?: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          const children = await client.getWorkspaceChildren(serverId, options.parentId ?? null)
          output(presentWorkspaceValue(serverId, children), { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  // Files
  const files = workspace.command('files').description('File operations')

  workspace
    .command('upload')
    .description('Upload a file (alias for files upload)')
    .argument('<server-id>', 'Server ID or slug')
    .requiredOption('--file <path>', 'File path to upload')
    .option('--name <name>', 'File name (defaults to filename)')
    .option('--parent-id <id>', 'Parent folder ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(handleWorkspaceFileUpload)

  files
    .command('get')
    .description('Get file details')
    .argument('<server-id>', 'Server ID or slug')
    .argument('<file-id>', 'File ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (serverId: string, fileId: string, options: { profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          const file = await client.getWorkspaceFile(serverId, fileId)
          output(presentWorkspaceValue(serverId, file), { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  files
    .command('download')
    .description('Download workspace file content')
    .argument('<server-id>', 'Server ID or slug')
    .argument('<file-id>', 'File ID')
    .option('--output <path>', 'Output path (defaults to server filename)')
    .option('--content-ref <ref>', 'Specific file contentRef/version to download')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        serverId: string,
        fileId: string,
        options: { output?: string; contentRef?: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          const downloaded = await client.downloadWorkspaceFile(serverId, fileId, {
            contentRef: options.contentRef,
          })
          const outputPath = options.output ?? downloaded.filename
          await writeFile(outputPath, Buffer.from(downloaded.buffer))
          const result = {
            ok: true,
            path: outputPath,
            filename: downloaded.filename,
            contentType: downloaded.contentType,
            sizeBytes: downloaded.buffer.byteLength,
          }
          if (options.json) output(result, { json: true })
          else outputSuccess(`Downloaded ${downloaded.filename} to ${outputPath}`, { json: false })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  files
    .command('update')
    .description('Update a file')
    .argument('<server-id>', 'Server ID or slug')
    .argument('<file-id>', 'File ID')
    .option('--name <name>', 'New name')
    .option('--parent-id <id>', 'New parent folder ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        serverId: string,
        fileId: string,
        options: { name?: string; parentId?: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          const file = await client.updateWorkspaceFile(serverId, fileId, {
            name: options.name,
            parentId: options.parentId,
          })
          output(file, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  files
    .command('delete')
    .description('Delete a file')
    .argument('<server-id>', 'Server ID or slug')
    .argument('<file-id>', 'File ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (serverId: string, fileId: string, options: { profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          await client.deleteWorkspaceFile(serverId, fileId)
          const outputOpts: OutputOptions = { json: options.json }
          outputSuccess('File deleted', outputOpts)
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  files
    .command('upload')
    .description('Upload a file')
    .argument('<server-id>', 'Server ID or slug')
    .requiredOption('--file <path>', 'File path to upload')
    .option('--name <name>', 'File name (defaults to filename)')
    .option('--parent-id <id>', 'Parent folder ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(handleWorkspaceFileUpload)

  files
    .command('search')
    .alias('list')
    .description('Search files')
    .argument('<server-id>', 'Server ID or slug')
    .option('--search-text <text>', 'Search text')
    .option('--ext <ext>', 'File extension')
    .option('--parent-id <id>', 'Parent folder ID')
    .option('--limit <n>', 'Limit results', '50')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(handleWorkspaceFileSearch)

  // Folders
  const folders = workspace.command('folders').description('Folder operations')

  folders
    .command('create')
    .description('Create a folder')
    .argument('<server-id>', 'Server ID or slug')
    .requiredOption('--name <name>', 'Folder name')
    .option('--parent-id <id>', 'Parent folder ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        serverId: string,
        options: { name: string; parentId?: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          const folder = await client.createWorkspaceFolder(serverId, {
            name: options.name,
            parentId: options.parentId,
          })
          output(folder, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  folders
    .command('update')
    .description('Update a folder')
    .argument('<server-id>', 'Server ID or slug')
    .argument('<folder-id>', 'Folder ID')
    .option('--name <name>', 'New name')
    .option('--parent-id <id>', 'New parent folder ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        serverId: string,
        folderId: string,
        options: { name?: string; parentId?: string; profile?: string; json?: boolean },
      ) => {
        try {
          const client = await getClient(options.profile)
          const folder = await client.updateWorkspaceFolder(serverId, folderId, {
            name: options.name,
            parentId: options.parentId,
          })
          output(folder, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  folders
    .command('delete')
    .description('Delete a folder')
    .argument('<server-id>', 'Server ID or slug')
    .argument('<folder-id>', 'Folder ID')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (serverId: string, folderId: string, options: { profile?: string; json?: boolean }) => {
        try {
          const client = await getClient(options.profile)
          await client.deleteWorkspaceFolder(serverId, folderId)
          const outputOpts: OutputOptions = { json: options.json }
          outputSuccess('Folder deleted', outputOpts)
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  return workspace
}
