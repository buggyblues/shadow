import { Code2, Download, Eye, File, FileArchive, FolderOpen, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// ── Types ──────────────────────────────────────────────────────────────

interface PreviewAttachment {
  id: string
  filename: string
  url: string
  contentType: string
  size: number
}

interface FilePreviewPanelProps {
  attachment: PreviewAttachment
  onClose: () => void
}

// ── Utilities ──────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Map file extension → shiki language id */
function extToLang(ext: string): string {
  const map: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    mjs: 'javascript',
    cjs: 'javascript',
    ts: 'typescript',
    tsx: 'tsx',
    mts: 'typescript',
    cts: 'typescript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    cs: 'csharp',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    fish: 'fish',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    ini: 'ini',
    json: 'json',
    jsonc: 'jsonc',
    html: 'html',
    htm: 'html',
    xml: 'xml',
    svg: 'xml',
    xhtml: 'html',
    css: 'css',
    scss: 'scss',
    less: 'less',
    sql: 'sql',
    graphql: 'graphql',
    proto: 'proto',
    md: 'markdown',
    mdx: 'mdx',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    env: 'dotenv',
    conf: 'ini',
    txt: 'text',
    log: 'text',
    csv: 'csv',
    tsv: 'csv',
  }
  return map[ext] ?? 'text'
}

/** Determine file category for preview mode selection */
function getFileCategory(ct: string, ext: string) {
  if (ct.startsWith('image/')) return 'image'
  if (ct.startsWith('audio/')) return 'audio'
  if (ct.startsWith('video/')) return 'video'
  if (ct === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (ext === 'md' || ext === 'mdx' || ct === 'text/markdown') return 'markdown'
  if (ext === 'html' || ext === 'htm' || ct === 'text/html' || ct.includes('html')) return 'html'
  if (ext === 'csv' || ext === 'tsv' || ct === 'text/csv') return 'csv'
  if (
    ['zip', 'tar', 'gz', 'bz2', 'xz', '7z', 'rar', 'tgz', 'jar', 'war'].includes(ext) ||
    ct.includes('zip') ||
    ct.includes('tar') ||
    ct.includes('compressed')
  )
    return 'archive'
  // Text/code
  if (
    ct.startsWith('text/') ||
    ct === 'application/json' ||
    ct.includes('javascript') ||
    ct.includes('typescript') ||
    ct.includes('xml') ||
    ct.includes('yaml') ||
    [
      'txt',
      'log',
      'json',
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
      'css',
      'scss',
      'svg',
      'graphql',
      'dockerfile',
      'makefile',
      'proto',
      'xml',
    ].includes(ext)
  )
    return 'text'
  return 'unknown'
}

/** Whether a file category supports the Preview/Code toggle */
function hasPreviewMode(category: string): boolean {
  return ['markdown', 'html', 'csv'].includes(category)
}

// ── CSV Parser ─────────────────────────────────────────────────────────

function parseCSV(text: string, separator?: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split('\n')
  const firstLine = lines[0]
  if (lines.length === 0 || !firstLine) return { headers: [], rows: [] }

  // Auto-detect separator
  const sep = separator ?? (firstLine.includes('\t') ? '\t' : ',')

  // Simple CSV parse (handles quoted fields)
  const parseLine = (line: string): string[] => {
    const cells: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"' && (i === 0 || line[i - 1] !== '\\')) {
        inQuotes = !inQuotes
      } else if (ch === sep && !inQuotes) {
        cells.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    cells.push(current.trim())
    return cells
  }

  const headers = parseLine(firstLine)
  const rows = lines.slice(1).filter(Boolean).map(parseLine)
  return { headers, rows }
}

// ── ZIP File List ──────────────────────────────────────────────────────

interface ZipEntry {
  name: string
  size: number
  compressedSize: number
  isDirectory: boolean
}

async function loadZipEntries(url: string): Promise<ZipEntry[]> {
  const { default: JSZip } = await import('jszip')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = await res.arrayBuffer()
  const zip = await JSZip.loadAsync(buf)
  const entries: ZipEntry[] = []
  zip.forEach((relativePath, file) => {
    entries.push({
      name: relativePath,
      // biome-ignore lint/suspicious/noExplicitAny: JSZip internal structure
      size: (file as any)._data?.uncompressedSize ?? 0,
      // biome-ignore lint/suspicious/noExplicitAny: JSZip internal structure
      compressedSize: (file as any)._data?.compressedSize ?? 0,
      isDirectory: file.dir,
    })
  })
  // Sort: directories first, then alphabetical
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return entries
}

// ── Syntax Highlighter (lazy-loaded) ───────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: shiki highlighter type is complex
let highlighterPromise: Promise<any> | null = null

function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then((mod) =>
      mod.createHighlighter({
        themes: ['github-dark'],
        langs: [
          'javascript',
          'typescript',
          'jsx',
          'tsx',
          'python',
          'ruby',
          'go',
          'rust',
          'java',
          'kotlin',
          'swift',
          'csharp',
          'c',
          'cpp',
          'bash',
          'yaml',
          'toml',
          'json',
          'jsonc',
          'html',
          'xml',
          'css',
          'scss',
          'less',
          'sql',
          'graphql',
          'markdown',
          'mdx',
          'dockerfile',
          'ini',
          'csv',
          'dotenv',
        ],
      }),
    )
  }
  return highlighterPromise
}

// ── Sub-components ─────────────────────────────────────────────────────

/** Tab button for Preview / Code toggle */
function TabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: typeof Eye
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition ${
        active
          ? 'bg-white/12 text-text-primary'
          : 'text-text-muted hover:text-text-secondary hover:bg-white/5'
      }`}
    >
      <Icon size={13} />
      {label}
    </button>
  )
}

/** CSV table viewer */
function CSVTable({ text, ext }: { text: string; ext: string }) {
  const { headers, rows } = useMemo(
    () => parseCSV(text, ext === 'tsv' ? '\t' : undefined),
    [text, ext],
  )
  if (headers.length === 0) return <p className="text-text-muted text-sm p-4">Empty file</p>

  return (
    <div className="overflow-auto flex-1">
      <table className="w-full border-collapse text-[13px]">
        <thead className="sticky top-0 z-10">
          <tr className="bg-bg-tertiary border-b border-white/10">
            <th className="px-3 py-2 text-[11px] font-bold text-text-muted text-right w-10 border-r border-white/5">
              #
            </th>
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 text-left font-semibold text-text-primary whitespace-nowrap border-r border-white/5 last:border-r-0"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-white/5 hover:bg-white/3 transition-colors">
              <td className="px-3 py-1.5 text-[11px] text-text-muted text-right border-r border-white/5 tabular-nums select-none">
                {ri + 1}
              </td>
              {headers.map((_, ci) => (
                <td
                  key={ci}
                  className="px-3 py-1.5 text-text-secondary whitespace-nowrap border-r border-white/5 last:border-r-0 max-w-[300px] truncate"
                  title={row[ci] ?? ''}
                >
                  {row[ci] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-3 py-2 text-[11px] text-text-muted border-t border-white/8">
        {rows.length} rows × {headers.length} columns
      </div>
    </div>
  )
}

/** ZIP file listing */
function ZipListing({ url }: { url: string }) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<ZipEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setError(null)
    loadZipEntries(url)
      .then(setEntries)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [url])

  if (loading)
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <span className="animate-pulse">{t('common.loading')}</span>
      </div>
    )
  if (error)
    return (
      <div className="flex-1 flex items-center justify-center text-red-400 text-sm">
        {t('chat.previewError', { error })}
      </div>
    )
  if (!entries || entries.length === 0)
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
        Empty archive
      </div>
    )

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-3 py-2 text-[11px] text-text-muted border-b border-white/8 flex items-center gap-2">
        <FileArchive size={12} />
        {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
      </div>
      <div className="divide-y divide-white/5">
        {entries.map((entry, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 px-3 py-1.5 text-[13px] hover:bg-white/3 transition-colors"
          >
            {entry.isDirectory ? (
              <FolderOpen size={14} className="text-yellow-400 shrink-0" />
            ) : (
              <File size={14} className="text-text-muted shrink-0" />
            )}
            <span
              className={`flex-1 min-w-0 truncate ${entry.isDirectory ? 'text-yellow-400 font-medium' : 'text-text-secondary'}`}
            >
              {entry.name}
            </span>
            {!entry.isDirectory && (
              <span className="text-[11px] text-text-muted shrink-0 tabular-nums">
                {formatFileSize(entry.size)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Syntax-highlighted code viewer */
function HighlightedCode({ text, lang }: { text: string; lang: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    getHighlighter()
      .then((highlighter) => {
        if (cancelled) return
        // Load the language dynamically if not already loaded
        const loadedLangs = highlighter.getLoadedLanguages()
        const langToUse = loadedLangs.includes(lang as never) ? lang : 'text'
        const result = highlighter.codeToHtml(text, {
          lang: langToUse,
          theme: 'github-dark',
        })
        setHtml(result)
        setLoaded(true)
      })
      .catch(() => {
        // Fallback: plain text
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [text, lang])

  if (!loaded) {
    return (
      <pre className="text-[13px] leading-relaxed text-text-secondary font-mono whitespace-pre-wrap break-words p-4 select-text">
        {text}
      </pre>
    )
  }

  if (html) {
    return (
      <div
        ref={containerRef}
        className="shiki-container text-[13px] leading-relaxed select-text [&_pre]:!bg-transparent [&_pre]:!p-4 [&_pre]:!m-0 [&_code]:!bg-transparent [&_.line]:whitespace-pre-wrap [&_.line]:break-words"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output is trusted
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }

  // Fallback — plain text
  return (
    <pre className="text-[13px] leading-relaxed text-text-secondary font-mono whitespace-pre-wrap break-words p-4 select-text">
      {text}
    </pre>
  )
}

/** Markdown preview renderer */
function MarkdownPreview({ text }: { text: string }) {
  return (
    <div
      className="p-5 text-[14px] text-text-secondary leading-relaxed max-w-none
      [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-text-primary [&_h1]:mt-4 [&_h1]:mb-2
      [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-text-primary [&_h2]:mt-3 [&_h2]:mb-1.5
      [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-text-primary [&_h3]:mt-3 [&_h3]:mb-1
      [&_p]:mb-2.5 [&_p]:leading-relaxed
      [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:mb-2
      [&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:mb-2
      [&_li]:mb-1
      [&_code]:bg-white/8 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[13px] [&_code]:font-mono [&_code]:text-primary
      [&_pre]:bg-bg-tertiary [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0
      [&_blockquote]:border-l-2 [&_blockquote]:border-primary/50 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-text-muted [&_blockquote]:my-2
      [&_a]:text-primary [&_a]:underline [&_a]:hover:text-primary-hover
      [&_hr]:border-white/10 [&_hr]:my-4
      [&_table]:w-full [&_table]:border-collapse [&_table]:my-3
      [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:text-text-primary [&_th]:border-b [&_th]:border-white/10 [&_th]:text-[13px]
      [&_td]:px-3 [&_td]:py-1.5 [&_td]:border-b [&_td]:border-white/5 [&_td]:text-[13px]
      [&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-2
      [&_strong]:text-text-primary [&_strong]:font-semibold
      [&_em]:italic
      "
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
}

/** HTML preview renderer (sandboxed iframe) */
function HTMLPreview({ text, url }: { text?: string; url: string }) {
  const iframeSrc = useMemo(() => {
    if (text) {
      return `data:text/html;charset=utf-8,${encodeURIComponent(text)}`
    }
    return url
  }, [text, url])

  return (
    <iframe
      src={iframeSrc}
      title="HTML Preview"
      sandbox="allow-same-origin"
      className="w-full h-full border-0 bg-white rounded"
    />
  )
}

// ── Main Component ─────────────────────────────────────────────────────

/**
 * Floating file preview panel that appears on the right side of the chat area.
 *
 * Features:
 * - Preview / Code toggle for Markdown, HTML, CSV
 * - Syntax highlighting via shiki (lazy-loaded)
 * - CSV → table rendering
 * - Markdown rich preview with GFM tables
 * - HTML sandboxed preview
 * - ZIP archive file listing
 * - Image / Audio / Video / PDF native preview
 */
export function FilePreviewPanel({ attachment, onClose }: FilePreviewPanelProps) {
  const { t } = useTranslation()
  const [textContent, setTextContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'preview' | 'code'>('preview')

  const ext = attachment.filename.split('.').pop()?.toLowerCase() ?? ''
  const category = getFileCategory(attachment.contentType, ext)
  const showToggle = hasPreviewMode(category)

  // Fetch text content for text-based files
  useEffect(() => {
    const isTextBased =
      category === 'text' || category === 'markdown' || category === 'html' || category === 'csv'
    if (!isTextBased) return

    setLoading(true)
    setError(null)
    setTextContent(null)
    setMode('preview')

    fetch(attachment.url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.text()
      })
      .then((text) => {
        // Limit to ~500KB to avoid browser freeze
        if (text.length > 500_000) {
          setTextContent(`${text.slice(0, 500_000)}\n\n… (truncated)`)
        } else {
          setTextContent(text)
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [attachment.url, category])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const renderContent = useCallback(() => {
    // Image
    if (category === 'image') {
      return (
        <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
          <img
            src={attachment.url}
            alt={attachment.filename}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      )
    }

    // Audio
    if (category === 'audio') {
      return (
        <div className="flex-1 flex items-center justify-center p-6">
          <audio controls src={attachment.url} className="w-full max-w-md">
            <track kind="captions" />
          </audio>
        </div>
      )
    }

    // Video
    if (category === 'video') {
      return (
        <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
          <video controls src={attachment.url} className="max-w-full max-h-full rounded-lg">
            <track kind="captions" />
          </video>
        </div>
      )
    }

    // PDF — iframe
    if (category === 'pdf') {
      return (
        <div className="flex-1 overflow-hidden p-2">
          <iframe
            src={attachment.url}
            title={attachment.filename}
            className="w-full h-full rounded-lg border border-white/5"
          />
        </div>
      )
    }

    // Archive / ZIP
    if (category === 'archive') {
      return <ZipListing url={attachment.url} />
    }

    // Loading state for text-based content
    if (loading) {
      return (
        <div className="flex-1 flex items-center justify-center text-text-muted">
          <span className="animate-pulse">{t('common.loading')}</span>
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex-1 flex items-center justify-center text-red-400 text-sm">
          {t('chat.previewError', { error })}
        </div>
      )
    }

    if (textContent === null) {
      // Unsupported
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-text-muted gap-3 p-6">
          <p className="text-sm">{t('chat.previewUnsupported')}</p>
          <a
            href={attachment.url}
            download={attachment.filename}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition flex items-center gap-2"
          >
            <Download size={14} />
            {t('chat.downloadFile')}
          </a>
        </div>
      )
    }

    // ── Text-based content with mode switching ──

    // CSV — Preview mode shows table, Code mode shows raw
    if (category === 'csv') {
      if (mode === 'preview') {
        return <CSVTable text={textContent} ext={ext} />
      }
      return (
        <div className="flex-1 overflow-auto bg-bg-primary/50 rounded-lg m-2 border border-white/5">
          <HighlightedCode text={textContent} lang="csv" />
        </div>
      )
    }

    // Markdown — Preview mode shows rendered, Code mode shows raw
    if (category === 'markdown') {
      if (mode === 'preview') {
        return (
          <div className="flex-1 overflow-auto">
            <MarkdownPreview text={textContent} />
          </div>
        )
      }
      return (
        <div className="flex-1 overflow-auto bg-bg-primary/50 rounded-lg m-2 border border-white/5">
          <HighlightedCode text={textContent} lang="markdown" />
        </div>
      )
    }

    // HTML — Preview mode shows iframe, Code mode shows raw
    if (category === 'html') {
      if (mode === 'preview') {
        return (
          <div className="flex-1 overflow-hidden p-2">
            <HTMLPreview text={textContent} url={attachment.url} />
          </div>
        )
      }
      return (
        <div className="flex-1 overflow-auto bg-bg-primary/50 rounded-lg m-2 border border-white/5">
          <HighlightedCode text={textContent} lang="html" />
        </div>
      )
    }

    // General text/code — always shows highlighted code
    const lang = extToLang(ext)
    return (
      <div className="flex-1 overflow-auto bg-bg-primary/50 rounded-lg m-2 border border-white/5">
        <HighlightedCode text={textContent} lang={lang} />
      </div>
    )
  }, [category, attachment, loading, error, textContent, mode, ext, t])

  return (
    <div className="w-[420px] h-full bg-bg-secondary border-l border-white/8 flex flex-col shrink-0 animate-slide-in-right">
      {/* Header */}
      <div className="h-12 px-4 flex items-center gap-3 border-b border-white/8 shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{attachment.filename}</p>
          <p className="text-[11px] text-text-muted">{formatFileSize(attachment.size)}</p>
        </div>

        {/* Preview / Code toggle */}
        {showToggle && (
          <div className="flex items-center gap-0.5 bg-bg-tertiary rounded-lg p-0.5">
            <TabButton
              active={mode === 'preview'}
              icon={Eye}
              label={t('chat.previewTab')}
              onClick={() => setMode('preview')}
            />
            <TabButton
              active={mode === 'code'}
              icon={Code2}
              label={t('chat.codeTab')}
              onClick={() => setMode('code')}
            />
          </div>
        )}

        <a
          href={attachment.url}
          download={attachment.filename}
          className="p-1.5 text-text-muted hover:text-text-primary hover:bg-white/10 rounded-md transition"
          title={t('chat.downloadFile')}
        >
          <Download size={16} />
        </a>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-text-muted hover:text-text-primary hover:bg-white/10 rounded-md transition"
          title={t('common.close')}
        >
          <X size={16} />
        </button>
      </div>

      {/* Preview content */}
      {renderContent()}
    </div>
  )
}
