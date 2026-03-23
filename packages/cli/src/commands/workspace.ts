import { readFile } from 'node:fs/promises'
import { Command } from 'commander'
import { getClient } from '../utils/client.js'
import { type OutputOptions, output, outputError, outputSuccess } from '../utils/output.js'

export function createWorkspaceCommand(): Command {
  const workspace = new Command('workspace').description('Workspace file management commands')

  workspace
    .command('get')
    .description('Get workspace info')
    .argument('<server-id>', 'Server ID or slug')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(async (serverId: string, options: { profile?: string; json?: boolean }) => {
      try {
        const client = await getClient(options.profile)
        const ws = await client.getWorkspace(serverId)
        output(ws, { json: options.json })
      } catch (error) {
        outputError(error instanceof Error ? error.message : String(error), { json: options.json })
        process.exit(1)
      }
    })

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
        output(tree, { json: options.json })
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
          output(children, { json: options.json })
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
    .action(
      async (
        serverId: string,
        options: {
          file: string
          name?: string
          parentId?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const content = await readFile(options.file)
          const blob = new Blob([content])
          const name = options.name ?? options.file.split('/').pop() ?? 'upload'
          const result = await client.uploadWorkspaceFile(serverId, blob, name, options.parentId)
          output(result, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

  files
    .command('search')
    .description('Search files')
    .argument('<server-id>', 'Server ID or slug')
    .option('--search-text <text>', 'Search text')
    .option('--ext <ext>', 'File extension')
    .option('--parent-id <id>', 'Parent folder ID')
    .option('--limit <n>', 'Limit results', '50')
    .option('--profile <name>', 'Profile to use')
    .option('--json', 'Output as JSON')
    .action(
      async (
        serverId: string,
        options: {
          searchText?: string
          ext?: string
          parentId?: string
          limit?: string
          profile?: string
          json?: boolean
        },
      ) => {
        try {
          const client = await getClient(options.profile)
          const files = await client.searchWorkspaceFiles(serverId, {
            searchText: options.searchText,
            ext: options.ext,
            parentId: options.parentId,
            limit: parseInt(options.limit ?? '50', 10),
          })
          output(files, { json: options.json })
        } catch (error) {
          outputError(error instanceof Error ? error.message : String(error), {
            json: options.json,
          })
          process.exit(1)
        }
      },
    )

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
