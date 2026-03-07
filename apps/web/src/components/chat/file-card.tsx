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
} from 'lucide-react'

interface FileCardProps {
  filename: string
  url: string
  contentType: string
  size: number
  onClick?: () => void
}

/** Map content-type prefixes / extensions to an icon + accent colour */
function getFileMeta(contentType: string, filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''

  // Audio
  if (contentType.startsWith('audio/'))
    return { icon: FileAudio, color: 'text-orange-400', bg: 'bg-orange-500/15', label: 'Audio' }

  // Video
  if (contentType.startsWith('video/'))
    return { icon: FileVideo, color: 'text-purple-400', bg: 'bg-purple-500/15', label: 'Video' }

  // PDF
  if (contentType === 'application/pdf' || ext === 'pdf')
    return { icon: FileText, color: 'text-red-400', bg: 'bg-red-500/15', label: 'PDF' }

  // Spreadsheet
  if (
    ['csv', 'xls', 'xlsx', 'tsv'].includes(ext) ||
    contentType.includes('spreadsheet') ||
    contentType === 'text/csv'
  )
    return {
      icon: FileSpreadsheet,
      color: 'text-green-400',
      bg: 'bg-green-500/15',
      label: ext.toUpperCase(),
    }

  // JSON
  if (contentType === 'application/json' || ext === 'json')
    return { icon: FileJson, color: 'text-yellow-400', bg: 'bg-yellow-500/15', label: 'JSON' }

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
      color: 'text-blue-400',
      bg: 'bg-blue-500/15',
      label: ext.toUpperCase() || 'Code',
    }

  // HTML / XML / SVG
  if (
    ['html', 'htm', 'xml', 'svg', 'xhtml'].includes(ext) ||
    contentType.includes('html') ||
    contentType.includes('xml')
  )
    return { icon: Code2, color: 'text-cyan-400', bg: 'bg-cyan-500/15', label: ext.toUpperCase() }

  // CSS
  if (ext === 'css' || ext === 'scss' || ext === 'less' || contentType === 'text/css')
    return {
      icon: FileType,
      color: 'text-pink-400',
      bg: 'bg-pink-500/15',
      label: ext.toUpperCase(),
    }

  // Markdown
  if (ext === 'md' || ext === 'mdx' || contentType === 'text/markdown')
    return { icon: FileText, color: 'text-slate-300', bg: 'bg-slate-500/15', label: 'Markdown' }

  // Archives
  if (
    ['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'tgz'].includes(ext) ||
    contentType.includes('zip') ||
    contentType.includes('tar') ||
    contentType.includes('compressed')
  )
    return {
      icon: FileArchive,
      color: 'text-amber-400',
      bg: 'bg-amber-500/15',
      label: ext.toUpperCase(),
    }

  // Plain text
  if (contentType.startsWith('text/') || ext === 'txt' || ext === 'log')
    return {
      icon: FileText,
      color: 'text-slate-300',
      bg: 'bg-slate-500/15',
      label: ext.toUpperCase() || 'Text',
    }

  // Fallback
  return {
    icon: File,
    color: 'text-slate-400',
    bg: 'bg-slate-500/15',
    label: ext.toUpperCase() || 'File',
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FileCard({ filename, url, contentType, size, onClick }: FileCardProps) {
  const meta = getFileMeta(contentType, filename)
  const Icon = meta.icon

  return (
    <div
      className="group/fc flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-bg-tertiary border border-white/8 hover:border-white/15 transition cursor-pointer min-w-[240px] max-w-[360px]"
      onClick={onClick}
    >
      {/* File type icon */}
      <div className={`shrink-0 w-10 h-10 rounded-lg ${meta.bg} flex items-center justify-center`}>
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

      {/* Download button */}
      <a
        href={url}
        download={filename}
        onClick={(e) => e.stopPropagation()}
        className="shrink-0 p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-white/10 transition opacity-0 group-hover/fc:opacity-100"
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
  ]
  return previewExts.includes(ext)
}
