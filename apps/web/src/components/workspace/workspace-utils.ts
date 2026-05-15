import {
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  FolderClosed,
  FolderOpen,
  type LucideIcon,
} from 'lucide-react'
import type { WorkspaceNode } from '../../stores/workspace.store'
import type { FileCategory, VisibleRow } from './workspace-types'

/* ─── Image extensions / MIME sets ─── */

const IMAGE_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.ico',
  '.avif',
])
const VIDEO_EXT = new Set(['.mp4', '.avi', '.mov', '.webm', '.mkv', '.m4v'])
const AUDIO_EXT = new Set(['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'])
const ARCHIVE_EXT = new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'])
const SPREADSHEET_EXT = new Set(['.xls', '.xlsx', '.csv', '.ods'])
const CODE_EXT = new Set([
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.json',
  '.yaml',
  '.yml',
  '.xml',
  '.html',
  '.css',
  '.sql',
  '.sh',
  '.rb',
  '.php',
  '.swift',
  '.kt',
  '.lua',
  '.zig',
])
const TEXT_EXT = new Set(['.txt', '.log', '.ini', '.cfg', '.conf', '.env', '.toml'])
const MD_EXT = new Set(['.md', '.mdx', '.markdown'])

/* ─── Determine file category by ext/mime ─── */

export function getFileCategory(node: WorkspaceNode): FileCategory {
  const ext = (node.ext ?? '').toLowerCase()
  const mime = (node.mime ?? '').toLowerCase()

  if (mime.startsWith('image/') || IMAGE_EXT.has(ext)) return 'image'
  if (mime.startsWith('video/') || VIDEO_EXT.has(ext)) return 'video'
  if (mime.startsWith('audio/') || AUDIO_EXT.has(ext)) return 'audio'
  if (mime === 'application/pdf' || ext === '.pdf') return 'pdf'
  if (MD_EXT.has(ext)) return 'markdown'
  if (CODE_EXT.has(ext) || mime.startsWith('text/x-')) return 'code'
  if (TEXT_EXT.has(ext) || mime.startsWith('text/')) return 'text'
  if (SPREADSHEET_EXT.has(ext)) return 'spreadsheet'
  if (ARCHIVE_EXT.has(ext)) return 'archive'
  return 'unknown'
}

/* ─── Icon component for a node ─── */

export function getNodeIcon(node: WorkspaceNode, isExpanded?: boolean): LucideIcon {
  if (node.kind === 'dir') return isExpanded ? FolderOpen : FolderClosed
  const cat = getFileCategory(node)
  switch (cat) {
    case 'image':
      return FileImage
    case 'video':
      return FileVideo
    case 'audio':
      return FileAudio
    case 'archive':
      return FileArchive
    case 'spreadsheet':
      return FileSpreadsheet
    case 'code':
      return FileCode
    case 'markdown':
    case 'text':
    case 'pdf':
      return FileText
    default:
      return File
  }
}

/* ─── Format file size ─── */

export function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/* ─── Flatten tree into visible rows ─── */

export function buildVisibleRows(
  nodes: WorkspaceNode[],
  expandedIds: Set<string>,
  depth = 0,
): VisibleRow[] {
  const rows: VisibleRow[] = []
  for (const node of nodes) {
    rows.push({ id: node.id, node, depth })
    if (node.kind === 'dir' && expandedIds.has(node.id) && node.children?.length) {
      rows.push(...buildVisibleRows(node.children, expandedIds, depth + 1))
    }
  }
  return rows
}

/* ─── Recursive find node by ID ─── */

export function findNodeById(nodes: WorkspaceNode[], id: string): WorkspaceNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNodeById(node.children, id)
      if (found) return found
    }
  }
  return null
}

/* ─── Resolve the target folder for a selected node ─── */

export function resolveParentForTarget(
  tree: WorkspaceNode[],
  nodeId: string | null,
): string | null {
  if (!nodeId) return null
  const node = findNodeById(tree, nodeId)
  if (!node) return null
  return node.kind === 'dir' ? node.id : node.parentId
}

/* ─── Check if node is descendant of ancestor ─── */

export function isDescendantOf(
  tree: WorkspaceNode[],
  ancestorId: string,
  targetId: string,
): boolean {
  const ancestor = findNodeById(tree, ancestorId)
  if (!ancestor?.children) return false
  function check(nodes: WorkspaceNode[]): boolean {
    for (const node of nodes) {
      if (node.id === targetId) return true
      if (node.children && check(node.children)) return true
    }
    return false
  }
  return check(ancestor.children)
}

/* ─── Language identifier for code highlighting ─── */

export function getLanguageFromExt(ext: string | null): string {
  const e = (ext ?? '').toLowerCase()
  const map: Record<string, string> = {
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.xml': 'xml',
    '.html': 'html',
    '.css': 'css',
    '.sql': 'sql',
    '.sh': 'bash',
    '.rb': 'ruby',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.md': 'markdown',
    '.mdx': 'markdown',
    '.lua': 'lua',
    '.zig': 'zig',
  }
  return map[e] ?? 'plaintext'
}
