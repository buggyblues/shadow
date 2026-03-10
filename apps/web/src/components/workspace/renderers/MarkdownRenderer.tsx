import { useQuery } from '@tanstack/react-query'
import { Clock, Edit3, Eye, Loader2, Save } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkspaceNode } from '../../../stores/workspace.store'
import { type FileVersion, useWorkspaceData, useWorkspaceMutations } from '../workspace-hooks'
import { VersionHistoryPanel } from './VersionHistoryPanel'

/**
 * MarkdownRenderer — fetch .md content and render with basic Markdown formatting.
 * Supports inline editing with live preview toggle and save functionality.
 */
export function MarkdownRenderer({ node, serverId }: { node: WorkspaceNode; serverId: string }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [showVersions, setShowVersions] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { refetchTree, invalidateStats } = useWorkspaceData(serverId)
  const mutations = useWorkspaceMutations({ serverId, refetchTree, invalidateStats })

  const { data: textContent, isLoading } = useQuery({
    queryKey: ['workspace-file-content', node.id, node.contentRef],
    queryFn: async () => {
      if (!node.contentRef) return null
      const res = await fetch(node.contentRef)
      if (!res.ok) return null
      return res.text()
    },
    enabled: !!node.contentRef,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (textContent != null) {
      setEditContent(textContent)
      setIsDirty(false)
    }
  }, [textContent])

  const handleEdit = useCallback(() => {
    setEditContent(textContent ?? '')
    setIsEditing(true)
    setIsDirty(false)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }, [textContent])

  const handleCancel = useCallback(() => {
    setIsEditing(false)
    setEditContent(textContent ?? '')
    setIsDirty(false)
  }, [textContent])

  const handleSave = useCallback(() => {
    mutations.updateFileContent.mutate(
      {
        fileId: node.id,
        content: editContent,
        filename: node.name,
        currentContentRef: node.contentRef,
        currentSizeBytes: node.sizeBytes,
        currentFlags: node.flags,
      },
      {
        onSuccess: () => {
          setIsEditing(false)
          setIsDirty(false)
        },
      },
    )
  }, [
    editContent,
    node.id,
    node.name,
    node.contentRef,
    node.sizeBytes,
    node.flags,
    mutations.updateFileContent,
  ])

  const handleRestoreVersion = useCallback(
    (version: FileVersion) => {
      fetch(version.contentRef)
        .then((res) => res.text())
        .then((oldContent) => {
          mutations.updateFileContent.mutate(
            {
              fileId: node.id,
              content: oldContent,
              filename: node.name,
              currentContentRef: node.contentRef,
              currentSizeBytes: node.sizeBytes,
              currentFlags: node.flags,
            },
            {
              onSuccess: () => {
                setShowVersions(false)
                setIsEditing(false)
                setIsDirty(false)
              },
            },
          )
        })
    },
    [node.id, node.name, node.contentRef, node.sizeBytes, node.flags, mutations.updateFileContent],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (isDirty) handleSave()
      }
      if (e.key === 'Escape') {
        handleCancel()
      }
    },
    [isDirty, handleSave, handleCancel],
  )

  if (!node.contentRef) {
    return <EmptyMarkdownEditor node={node} serverId={serverId} />
  }

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-text-muted">
        <div className="animate-pulse text-sm">加载中...</div>
      </div>
    )
  }

  if (textContent == null) {
    return <div className="text-text-muted text-sm">无法加载文件内容</div>
  }

  const previewHtml = simpleMarkdownToHtml(isEditing ? editContent : textContent)
  const versionCount = Array.isArray(node.flags?.versions)
    ? (node.flags.versions as FileVersion[]).length
    : 0

  return (
    <div className="w-full h-full overflow-auto flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-bg-tertiary border-b border-border-subtle rounded-t-lg shrink-0">
        <span className="text-xs text-text-muted font-mono">{node.name}</span>
        <div className="flex items-center gap-2">
          {isEditing && isDirty && <span className="text-xs text-yellow-400">● 未保存</span>}
          <button
            type="button"
            onClick={() => setShowVersions(!showVersions)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition ${
              showVersions
                ? 'bg-[#5865F2]/20 text-[#5865F2]'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover'
            }`}
            title="版本历史"
          >
            <Clock size={12} />
            {versionCount > 0 && <span>{versionCount}</span>}
          </button>
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={!isDirty || mutations.updateFileContent.isPending}
                className="flex items-center gap-1 text-xs px-2 py-1 bg-primary hover:bg-primary-hover text-white rounded transition disabled:opacity-40"
                title="保存 (⌘S)"
              >
                {mutations.updateFileContent.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Save size={12} />
                )}
                保存
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="text-xs px-2 py-1 text-text-muted hover:text-text-primary rounded transition"
              >
                取消
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleEdit}
              className="flex items-center gap-1 text-xs px-2 py-1 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover rounded transition"
              title="编辑"
            >
              <Edit3 size={12} />
              编辑
            </button>
          )}
        </div>
      </div>

      {/* Content + Version panel */}
      <div className="flex flex-1 min-h-0">
        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {isEditing ? (
            <div className="flex flex-1 min-h-0">
              {/* Editor */}
              <div className="flex-1 flex flex-col border-r border-border-subtle">
                <div className="px-3 py-1.5 text-[10px] text-text-muted bg-bg-secondary border-b border-border-subtle flex items-center gap-1">
                  <Edit3 size={10} />
                  编辑
                </div>
                <textarea
                  ref={textareaRef}
                  value={editContent}
                  onChange={(e) => {
                    setEditContent(e.target.value)
                    setIsDirty(true)
                  }}
                  onKeyDown={handleKeyDown}
                  className="flex-1 p-4 text-sm leading-relaxed bg-[#1e1e2e] text-[#cdd6f4] font-mono resize-none outline-none"
                  spellCheck={false}
                />
              </div>
              {/* Live preview */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-3 py-1.5 text-[10px] text-text-muted bg-bg-secondary border-b border-border-subtle flex items-center gap-1">
                  <Eye size={10} />
                  预览
                </div>
                <div className="flex-1 overflow-auto">
                  <article
                    className="prose prose-invert prose-sm max-w-none p-6"
                    // biome-ignore lint: dangerouslySetInnerHTML needed for markdown rendering
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <article
                className="prose prose-invert prose-sm max-w-none p-6"
                // biome-ignore lint: dangerouslySetInnerHTML needed for markdown rendering
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          )}
        </div>

        {/* Version history side panel */}
        {showVersions && (
          <div className="w-64 shrink-0 border-l border-border-subtle bg-bg-secondary overflow-hidden">
            <VersionHistoryPanel
              node={node}
              onClose={() => setShowVersions(false)}
              onRestore={handleRestoreVersion}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Minimal Markdown-to-HTML converter (no external dependency).
 * Handles headings, bold, italic, code blocks, inline code, links, images, lists, blockquotes, horizontal rules.
 */
function simpleMarkdownToHtml(md: string): string {
  const escaped = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const lines = escaped.split('\n')
  const result: string[] = []
  let inCodeBlock = false
  let codeLang = ''

  for (const line of lines) {
    // Code block toggle
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        result.push('</code></pre>')
        inCodeBlock = false
      } else {
        codeLang = line.slice(3).trim()
        result.push(
          `<pre class="bg-[#1e1e2e] text-[#cdd6f4] rounded-lg p-4 overflow-x-auto text-sm"><code class="language-${codeLang}">`,
        )
        inCodeBlock = true
      }
      continue
    }
    if (inCodeBlock) {
      result.push(line)
      continue
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/)
    if (headingMatch) {
      const level = headingMatch[1]!.length
      result.push(`<h${level}>${inlineFormat(headingMatch[2] ?? '')}</h${level}>`)
      continue
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      result.push('<hr />')
      continue
    }

    // Blockquote
    if (line.startsWith('&gt; ')) {
      result.push(`<blockquote><p>${inlineFormat(line.slice(5))}</p></blockquote>`)
      continue
    }

    // Unordered list
    if (/^[\s]*[-*+]\s/.test(line)) {
      result.push(`<li>${inlineFormat(line.replace(/^[\s]*[-*+]\s/, ''))}</li>`)
      continue
    }

    // Ordered list
    if (/^[\s]*\d+\.\s/.test(line)) {
      result.push(`<li>${inlineFormat(line.replace(/^[\s]*\d+\.\s/, ''))}</li>`)
      continue
    }

    // Empty line
    if (line.trim() === '') {
      result.push('<br />')
      continue
    }

    // Paragraph
    result.push(`<p>${inlineFormat(line)}</p>`)
  }

  if (inCodeBlock) result.push('</code></pre>')
  return result.join('\n')
}

function inlineFormat(text: string): string {
  return (
    text
      // Images: ![alt](url)
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="max-w-full rounded" />')
      // Links: [text](url)
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener" class="text-primary hover:underline">$1</a>',
      )
      // Bold
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      // Inline code
      .replace(
        /`([^`]+)`/g,
        '<code class="bg-bg-tertiary px-1 py-0.5 rounded text-xs font-mono">$1</code>',
      )
  )
}

/* ─── Empty Markdown file inline editor ─── */

function EmptyMarkdownEditor({ node, serverId }: { node: WorkspaceNode; serverId: string }) {
  const [content, setContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { refetchTree, invalidateStats } = useWorkspaceData(serverId)
  const mutations = useWorkspaceMutations({ serverId, refetchTree, invalidateStats })

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSave = useCallback(() => {
    mutations.updateFileContent.mutate(
      {
        fileId: node.id,
        content,
        filename: node.name,
        currentContentRef: null,
        currentSizeBytes: null,
        currentFlags: null,
      },
      {
        onSuccess: () => {
          setIsDirty(false)
        },
      },
    )
  }, [content, node.id, node.name, mutations.updateFileContent])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (isDirty) handleSave()
      }
    },
    [isDirty, handleSave],
  )

  const previewHtml = simpleMarkdownToHtml(content)

  return (
    <div className="w-full h-full overflow-auto flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-bg-tertiary border-b border-border-subtle rounded-t-lg shrink-0">
        <span className="text-xs text-text-muted font-mono">{node.name}</span>
        <div className="flex items-center gap-2">
          {isDirty && <span className="text-xs text-yellow-400">● 未保存</span>}
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || mutations.updateFileContent.isPending}
            className="flex items-center gap-1 text-xs px-2 py-1 bg-primary hover:bg-primary-hover text-white rounded transition disabled:opacity-40"
            title="保存 (⌘S)"
          >
            {mutations.updateFileContent.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Save size={12} />
            )}
            保存
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value)
            setIsDirty(true)
          }}
          onKeyDown={handleKeyDown}
          className="flex-1 p-4 text-sm leading-relaxed bg-[#1e1e2e] text-[#cdd6f4] font-mono resize-none outline-none"
          spellCheck={false}
          placeholder="开始编写 Markdown..."
        />
        {content && (
          <div className="flex-1 p-4 overflow-auto border-l border-border-subtle">
            <div
              className="prose prose-invert max-w-none text-text-primary text-sm leading-relaxed markdown-body"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: markdown preview
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
