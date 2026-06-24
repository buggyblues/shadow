import {
  Code2,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  type LucideIcon,
} from 'lucide-react'

export interface FileTypeVisualMeta {
  icon: LucideIcon
  color: string
  bg: string
  label: string
}

export function getFileTypeVisual(contentType: string | null | undefined, filename: string) {
  const type = contentType ?? ''
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''

  if (type.startsWith('audio/')) {
    return { icon: FileAudio, color: 'text-warning', bg: 'bg-warning/15', label: 'Audio' }
  }

  if (type.startsWith('video/')) {
    return { icon: FileVideo, color: 'text-info', bg: 'bg-info/15', label: 'Video' }
  }

  if (type === 'application/pdf' || ext === 'pdf') {
    return { icon: FileText, color: 'text-danger', bg: 'bg-danger/15', label: 'PDF' }
  }

  if (
    ['csv', 'xls', 'xlsx', 'tsv'].includes(ext) ||
    type.includes('spreadsheet') ||
    type === 'text/csv'
  ) {
    return {
      icon: FileSpreadsheet,
      color: 'text-success',
      bg: 'bg-success/15',
      label: ext.toUpperCase(),
    }
  }

  if (type === 'application/json' || ext === 'json') {
    return { icon: FileJson, color: 'text-accent', bg: 'bg-accent/15', label: 'JSON' }
  }

  if (
    [
      'js',
      'ts',
      'jsx',
      'tsx',
      'py',
      'rb',
      'go',
      'rs',
      'java',
      'c',
      'cpp',
      'h',
      'hpp',
      'cs',
      'swift',
      'kt',
      'sh',
      'bash',
      'zsh',
      'fish',
      'bat',
      'ps1',
      'yaml',
      'yml',
      'toml',
      'ini',
      'conf',
      'env',
      'sql',
      'graphql',
      'proto',
      'dockerfile',
      'makefile',
      'cmake',
    ].includes(ext) ||
    type.includes('javascript') ||
    type.includes('typescript') ||
    type.includes('x-python') ||
    type.includes('x-yaml')
  ) {
    return {
      icon: FileCode,
      color: 'text-primary',
      bg: 'bg-primary/15',
      label: ext.toUpperCase() || 'Code',
    }
  }

  if (
    ['html', 'htm', 'xml', 'svg', 'xhtml'].includes(ext) ||
    type.includes('html') ||
    type.includes('xml')
  ) {
    return { icon: Code2, color: 'text-primary', bg: 'bg-primary/15', label: ext.toUpperCase() }
  }

  if (ext === 'css' || ext === 'scss' || ext === 'less' || type === 'text/css') {
    return {
      icon: FileType,
      color: 'text-info',
      bg: 'bg-info/15',
      label: ext.toUpperCase(),
    }
  }

  if (ext === 'md' || ext === 'mdx' || type === 'text/markdown') {
    return { icon: FileText, color: 'text-text-muted', bg: 'bg-bg-tertiary', label: 'Markdown' }
  }

  if (
    ['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'tgz'].includes(ext) ||
    type.includes('zip') ||
    type.includes('tar') ||
    type.includes('compressed')
  ) {
    return {
      icon: FileArchive,
      color: 'text-warning',
      bg: 'bg-warning/15',
      label: ext.toUpperCase(),
    }
  }

  if (type.startsWith('text/') || ext === 'txt' || ext === 'log') {
    return {
      icon: FileText,
      color: 'text-text-muted',
      bg: 'bg-bg-tertiary',
      label: ext.toUpperCase() || 'Text',
    }
  }

  return {
    icon: File,
    color: 'text-text-muted',
    bg: 'bg-bg-tertiary',
    label: ext.toUpperCase() || 'File',
  }
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
