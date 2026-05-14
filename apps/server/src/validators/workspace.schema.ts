import { z } from 'zod'

const nodeName = () =>
  z
    .string()
    .min(1, 'Name is required')
    .max(500)
    .regex(/^[^\x00/\\]+$/, 'Name cannot contain /, \\, or null bytes')

// ─── Workspace ───

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(255).optional().default('工作区'),
  description: z.string().max(2000).optional(),
})

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
})

// ─── Folder ───

export const createFolderSchema = z.object({
  parentId: z.string().uuid().nullable().optional().default(null),
  name: nodeName(),
})

export const updateFolderSchema = z.object({
  name: nodeName().optional(),
  parentId: z.string().uuid().nullable().optional(),
  pos: z.number().int().min(0).optional(),
})

// ─── File ───

export const createFileSchema = z.object({
  parentId: z.string().uuid().nullable().optional().default(null),
  name: nodeName(),
  ext: z.string().max(50).nullable().optional(),
  mime: z.string().max(255).nullable().optional(),
  sizeBytes: z.number().int().min(0).nullable().optional(),
  contentRef: z.string().nullable().optional(),
  previewUrl: z.string().url().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
})

export const updateFileSchema = z.object({
  name: nodeName().optional(),
  parentId: z.string().uuid().nullable().optional(),
  pos: z.number().int().min(0).optional(),
  ext: z.string().max(50).nullable().optional(),
  mime: z.string().max(255).nullable().optional(),
  sizeBytes: z.number().int().min(0).nullable().optional(),
  contentRef: z.string().nullable().optional(),
  previewUrl: z.string().url().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
})

// ─── Search ───

export const searchFilesSchema = z.object({
  parentId: z.string().uuid().nullable().optional(),
  searchText: z.string().max(200).optional(),
  ext: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

export const searchFoldersSchema = z.object({
  searchText: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
})

export const searchChildrenSchema = z.object({
  parentId: z.string().uuid().nullable().optional(),
})

export const batchChildrenSchema = z.object({
  parentIds: z.array(z.string().uuid().nullable()).min(1).max(50),
})

// ─── Paste ───

export const pasteNodesSchema = z.object({
  sourceWorkspaceId: z.string().uuid(),
  targetParentId: z.string().uuid().nullable().optional().default(null),
  nodeIds: z.array(z.string().uuid()).min(1).max(200),
  mode: z.enum(['copy', 'cut']),
})

// ─── Commands ───

const commandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create-folder'),
    parentId: z.string().uuid().nullable().optional(),
    name: nodeName(),
  }),
  z.object({
    action: z.literal('rename-folder'),
    folderId: z.string().uuid(),
    name: nodeName(),
  }),
  z.object({
    action: z.literal('move-folder'),
    folderId: z.string().uuid(),
    parentId: z.string().uuid().nullable(),
  }),
  z.object({ action: z.literal('delete-folder'), folderId: z.string().uuid() }),
  z.object({
    action: z.literal('create-file'),
    parentId: z.string().uuid().nullable().optional(),
    name: nodeName(),
    ext: z.string().max(50).nullable().optional(),
    mime: z.string().max(255).nullable().optional(),
    contentRef: z.string().nullable().optional(),
  }),
  z.object({
    action: z.literal('rename-file'),
    fileId: z.string().uuid(),
    name: nodeName(),
  }),
  z.object({
    action: z.literal('move-file'),
    fileId: z.string().uuid(),
    parentId: z.string().uuid().nullable(),
  }),
  z.object({
    action: z.literal('update-file'),
    fileId: z.string().uuid(),
    name: nodeName().optional(),
    ext: z.string().max(50).nullable().optional(),
    mime: z.string().max(255).nullable().optional(),
    contentRef: z.string().nullable().optional(),
  }),
  z.object({ action: z.literal('delete-file'), fileId: z.string().uuid() }),
])

export const executeCommandsSchema = z.object({
  commands: z.array(commandSchema).min(1).max(100),
})

// ─── Types ───

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>
export type CreateFolderInput = z.infer<typeof createFolderSchema>
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>
export type CreateFileInput = z.infer<typeof createFileSchema>
export type UpdateFileInput = z.infer<typeof updateFileSchema>
export type SearchFilesInput = z.infer<typeof searchFilesSchema>
export type SearchFoldersInput = z.infer<typeof searchFoldersSchema>
export type PasteNodesInput = z.infer<typeof pasteNodesSchema>
export type WorkspaceCommand = z.infer<typeof commandSchema>
