import {
  ClickableCard,
  Tooltip,
  TooltipContent,
  TooltipIconButton,
  TooltipPortal,
  TooltipProvider,
  TooltipTrigger,
} from '@shadowob/ui'
import { Download, FolderPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatFileSize, getFileTypeVisual } from '../common/file-type-visual'

interface FileCardProps {
  filename: string
  url: string
  contentType: string
  size: number
  onClick?: () => void
  /** Optional handler to save this attachment to a workspace folder */
  onSaveToWorkspace?: () => void
}

export function FileCard({
  filename,
  url,
  contentType,
  size,
  onClick,
  onSaveToWorkspace,
}: FileCardProps) {
  const { t } = useTranslation()
  const meta = getFileTypeVisual(contentType, filename)
  const Icon = meta.icon

  return (
    <ClickableCard
      className="group/fc flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-bg-tertiary border border-border-subtle hover:border-border-subtle transition cursor-pointer min-w-[240px] max-w-[360px]"
      aria-label={filename}
      onPress={() => onClick?.()}
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

      <TooltipProvider delayDuration={200}>
        {/* Save to workspace button */}
        {onSaveToWorkspace && (
          <TooltipIconButton
            label={t('workspace.saveToWorkspace')}
            onClick={(e) => {
              e.stopPropagation()
              onSaveToWorkspace()
            }}
            variant="ghost"
            size="icon"
            className="shrink-0 h-auto w-auto p-1.5 rounded-md text-text-muted hover:text-warning hover:bg-warning/10 transition opacity-0 group-hover/fc:opacity-100"
          >
            <FolderPlus size={16} />
          </TooltipIconButton>
        )}

        {/* Download button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={url}
              download={filename}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover transition opacity-0 group-hover/fc:opacity-100"
              aria-label={t('workspace.download')}
            >
              <Download size={16} />
            </a>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent>{t('workspace.download')}</TooltipContent>
          </TooltipPortal>
        </Tooltip>
      </TooltipProvider>
    </ClickableCard>
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
