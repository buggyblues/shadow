import {
  Code2,
  Download,
  File,
  FileArchive,
  FileAudio,
  FileCode,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  FolderPlus,
} from 'lucide-react'

interface FileCardProps {
  filename: string
  url: string
  contentType: string
  size: number
  onClick?: () => void
  /** Optional handler to save this attachment to a workspace folder */
  onSaveToWorkspace?: () => void
}

/** Map content-type prefixes / extensions to an icon + accent colour */
function getFileMeta(contentType: string, filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''

  // Audio
  if (contentType.startsWith('audio/'))
    return { icon: FileAudio, color: 'text-warning', bg: 'bg-warning/15', label: 'Audio' }

  // Video
  if (contentType.startsWith('video/'))
    return { icon: FileVideo, color: 'text-info', bg: 'bg-info/15', label: 'Video' }

  // PDF
  if (contentType === 'application/pdf' || ext === 'pdf')
    return { icon: FileText, color: 'text-danger', bg: 'bg-danger/15', label: 'PDF' }

  // Spreadsheet
  if (
    ['csv', 'xls', 'xlsx', 'tsv'].includes(ext) ||
    contentType.includes('spreadsheet') ||
    contentType === 'text/csv'
  )
    return {
      icon: FileSpreadsheet,
      color: 'text-success',
      bg: 'bg-success/15',
      label: ext.toUpperCase(),
    }

  // JSON
  if (contentType === 'application/json' || ext === 'json')
    return { icon: FileJson, color: 'text-accent', bg: 'bg-accent/15', label: 'JSON' }

  // Code / script / config
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
    contentType.includes('javascript') ||
    contentType.includes('typescript') ||
    contentType.includes('x-python') ||
    contentType.includes('x-yaml')
  )
    return {
      icon: FileCode,
      color: 'text-primary',
      bg: 'bg-primary/15',
      label: ext.toUpperCase() || 'Code',
    }

  // HTML / XML / SVG
  if (
    ['html', 'htm', 'xml', 'svg', 'xhtml'].includes(ext) ||
    contentType.includes('html') ||
    contentType.includes('xml')
  )
    return { icon: Code2, color: 'text-primary', bg: 'bg-primary/15', label: ext.toUpperCase() }

  // CSS
  if (ext === 'css' || ext === 'scss' || ext === 'less' || contentType === 'text/css')
    return {
      icon: FileType,
      color: 'text-info',
      bg: 'bg-info/15',
      label: ext.toUpperCase(),
    }

  // Markdown
  if (ext === 'md' || ext === 'mdx' || contentType === 'text/markdown')
    return { icon: FileText, color: 'text-text-muted', bg: 'bg-bg-tertiary', label: 'Markdown' }

  // Archives
  if (
    ['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'tgz'].includes(ext) ||
    contentType.includes('zip') ||
    contentType.includes('tar') ||
    contentType.includes('compressed')
  )
    return {
      icon: FileArchive,
      color: 'text-warning',
      bg: 'bg-warning/15',
      label: ext.toUpperCase(),
    }

  // Plain text
  if (contentType.startsWith('text/') || ext === 'txt' || ext === 'log')
    return {
      icon: FileText,
      color: 'text-text-muted',
      bg: 'bg-bg-tertiary',
      label: ext.toUpperCase() || 'Text',
    }

  // Fallback
  return {
    icon: File,
    color: 'text-text-muted',
    bg: 'bg-bg-tertiary',
    label: ext.toUpperCase() || 'File',
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileCard({
  filename,
  url,
  contentType,
  size,
  onClick,
  onSaveToWorkspace,
}: FileCardProps) {
  const meta = getFileMeta(contentType, filename)
  const Icon = meta.icon

  return (
    <div
      className="group/fc flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-bg-tertiary border border-border-subtle hover:border-border-subtle transition cursor-pointer min-w-[240px] max-w-[360px]"
      onClick={onClick}
    >
      {/* File type icon */}
      <div className={`shrink-0 w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center`}>
        <Icon size={20} className={meta.color} />
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate group-hover/fc:underline">
          {filename}
        </p>
        <p className="text-xs text-text-muted mt-0.5">
          {meta.label} · {formatFileSize(size)}
        </p>
      </div>

      {/* Save to workspace button */}
      {onSaveToWorkspace && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSaveToWorkspace()
          }}
          className="shrink-0 p-1.5 rounded-md text-text-muted hover:text-warning hover:bg-warning/10 transition opacity-0 group-hover/fc:opacity-100"
          title="保存到工作区"
        >
          <FolderPlus size={16} />
        </button>
      )}

      {/* Download button */}
      <a
        href={url}
        download={filename}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover transition opacity-0 group-hover/fc:opacity-100"
        title="Download"
      >
        <Download size={16} />
      </a>
    </div>
  )
}

/** Check whether a file type is previewable in the floating panel */
export function isPreviewable(contentType: string, filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  // Text-based
  if (contentType.startsWith('text/')) return true
  if (contentType === 'application/json') return true
  if (contentType === 'application/pdf') return true
  if (contentType.startsWith('image/')) return true
  if (contentType.startsWith('audio/')) return true
  if (contentType.startsWith('video/')) return true
  if (contentType.includes('javascript') || contentType.includes('typescript')) return true
  if (contentType.includes('xml') || contentType.includes('html')) return true
  if (contentType.includes('yaml')) return true
  // Excel
  if (contentType.includes('spreadsheet') || contentType.includes('ms-excel')) return true
  // Archives (ZIP, etc.)
  if (
    contentType.includes('zip') ||
    contentType.includes('tar') ||
    contentType.includes('compressed')
  )
    return true
  // By extension
  const previewExts = [
    'txt',
    'log',
    'md',
    'json',
    'csv',
    'tsv',
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
    'cs',
    'swift',
    'kt',
    'sh',
    'bash',
    'yaml',
    'yml',
    'toml',
    'ini',
    'env',
    'sql',
    'html',
    'htm',
    'xml',
    'css',
    'scss',
    'svg',
    'graphql',
    'pdf',
    'mp3',
    'wav',
    'ogg',
    'mp4',
    'webm',
    'zip',
    'tar',
    'gz',
    'bz2',
    'xz',
    '7z',
    'rar',
    'tgz',
    'jar',
    'war',
    'xls',
    'xlsx',
  ]
  return previewExts.includes(ext)
}
