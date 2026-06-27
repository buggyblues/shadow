export type WorkspaceFileSourceKind = 'server' | 'cloud-computer' | 'webdav'

export type WorkspaceFileSourceCapabilities = {
  cloneFile: boolean
  downloadZip: boolean
  pasteNodes: boolean
  setWallpaper: boolean
  updateTextFile: boolean
}

export type WorkspaceFileSourceEndpoints = {
  cloneFile?: (fileId: string) => string
  createFile: string
  createFolder: string
  file: (fileId: string) => string
  folder: (folderId: string) => string
  folderDownload?: (folderId: string) => string
  mediaUpload?: string
  mediaUrl?: (fileId: string, params: URLSearchParams) => string
  pasteNodes?: string
  searchFiles: (searchText: string) => string
  stats: string
  tree: string
  upload: string
  workspace: string
  workspaceDownload?: string
}

export type WorkspaceFileSourceQueryKeys = {
  fileContent: (fileId: string) => readonly unknown[]
  mediaUrl: (
    fileId: string,
    contentRef: string | null | undefined,
    disposition: 'inline' | 'attachment',
  ) => readonly unknown[]
  search: (searchText: string) => readonly unknown[]
  stats: readonly unknown[]
  tree: readonly unknown[]
  workspace: readonly unknown[]
}

export type WorkspaceFileSource = {
  capabilities: WorkspaceFileSourceCapabilities
  endpoints: WorkspaceFileSourceEndpoints
  id: string
  kind: WorkspaceFileSourceKind
  label?: string
  queryKeys: WorkspaceFileSourceQueryKeys
  serverId?: string
}

const fullWorkspaceCapabilities: WorkspaceFileSourceCapabilities = {
  cloneFile: true,
  downloadZip: true,
  pasteNodes: true,
  setWallpaper: true,
  updateTextFile: true,
}

function scopedQueryKeys(scope: readonly unknown[]): WorkspaceFileSourceQueryKeys {
  return {
    fileContent: (fileId) => [...scope, 'file-content', fileId],
    mediaUrl: (fileId, contentRef, disposition) => [
      ...scope,
      'media-url',
      fileId,
      contentRef ?? null,
      disposition,
    ],
    search: (searchText) => [...scope, 'search', searchText],
    stats: [...scope, 'stats'],
    tree: [...scope, 'tree'],
    workspace: [...scope, 'workspace'],
  }
}

export function createServerWorkspaceSource(serverId: string): WorkspaceFileSource {
  return {
    capabilities: fullWorkspaceCapabilities,
    endpoints: {
      cloneFile: (fileId) => `/api/servers/${serverId}/workspace/files/${fileId}/clone`,
      createFile: `/api/servers/${serverId}/workspace/files`,
      createFolder: `/api/servers/${serverId}/workspace/folders`,
      file: (fileId) => `/api/servers/${serverId}/workspace/files/${fileId}`,
      folder: (folderId) => `/api/servers/${serverId}/workspace/folders/${folderId}`,
      folderDownload: (folderId) =>
        `/api/servers/${serverId}/workspace/folders/${folderId}/download`,
      mediaUpload: '/api/media/upload',
      mediaUrl: (fileId, params) =>
        `/api/servers/${serverId}/workspace/files/${fileId}/media-url?${params.toString()}`,
      pasteNodes: `/api/servers/${serverId}/workspace/nodes/paste`,
      searchFiles: (searchText) =>
        `/api/servers/${serverId}/workspace/files/search?searchText=${encodeURIComponent(
          searchText,
        )}`,
      stats: `/api/servers/${serverId}/workspace/stats`,
      tree: `/api/servers/${serverId}/workspace/tree`,
      upload: `/api/servers/${serverId}/workspace/upload`,
      workspace: `/api/servers/${serverId}/workspace`,
      workspaceDownload: `/api/servers/${serverId}/workspace/download`,
    },
    id: `server:${serverId}`,
    kind: 'server',
    queryKeys: {
      fileContent: (fileId) => ['workspace-file-content', fileId],
      mediaUrl: (fileId, contentRef, disposition) => [
        'workspace-media-url',
        serverId,
        fileId,
        contentRef ?? null,
        disposition,
      ],
      search: (searchText) => ['workspace-search', serverId, searchText],
      stats: ['workspace-stats', serverId],
      tree: ['workspace-tree', serverId],
      workspace: ['workspace', serverId],
    },
    serverId,
  }
}

export function createCloudComputerWorkspaceSource(cloudComputerId: string): WorkspaceFileSource {
  const base = `/api/cloud-computers/${cloudComputerId}/files`
  return {
    capabilities: {
      cloneFile: true,
      downloadZip: false,
      pasteNodes: true,
      setWallpaper: false,
      updateTextFile: true,
    },
    endpoints: {
      cloneFile: (fileId) => `${base}/files/${fileId}/clone`,
      createFile: `${base}/files`,
      createFolder: `${base}/folders`,
      file: (fileId) => `${base}/files/${fileId}`,
      folder: (folderId) => `${base}/folders/${folderId}`,
      mediaUpload: '/api/media/upload',
      mediaUrl: (fileId, params) => `${base}/files/${fileId}/media-url?${params.toString()}`,
      pasteNodes: `${base}/nodes/paste`,
      searchFiles: (searchText) =>
        `${base}/files/search?searchText=${encodeURIComponent(searchText)}`,
      stats: `${base}/stats`,
      tree: `${base}/tree`,
      upload: `${base}/upload`,
      workspace: base,
    },
    id: `cloud-computer:${cloudComputerId}`,
    kind: 'cloud-computer',
    queryKeys: scopedQueryKeys(['cloud-computer-workspace', cloudComputerId]),
  }
}

export function resolveWorkspaceFileSource(sourceOrServerId: WorkspaceFileSource | string) {
  return typeof sourceOrServerId === 'string'
    ? createServerWorkspaceSource(sourceOrServerId)
    : sourceOrServerId
}
