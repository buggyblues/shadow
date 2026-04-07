import { useQuery } from '@tanstack/react-query'
import { Clock, Edit3, Loader2, Save } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkspaceNode } from '../../../stores/workspace.store'
import { type FileVersion, useWorkspaceData, useWorkspaceMutations } from '../workspace-hooks'
import { getLanguageFromExt } from '../workspace-utils'
import { VersionHistoryPanel } from './VersionHistoryPanel'

/**
 * CodeRenderer — fetch file content and render with syntax highlighting.
 * Supports inline editing with save functionality.
 */
export function CodeRenderer({ node, serverId }: { node: WorkspaceNode; serverId: string }) {
  const language = getLanguageFromExt(node.ext)
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

  // Sync edit content when switching to edit mode or when content loads
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
      // Restoring version: fetch old content, then save it (this also creates a new version of current)
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
      // Allow Tab to insert tab character
      if (e.key === 'Tab') {
        e.preventDefault()
        const textarea = textareaRef.current
        if (!textarea) return
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const val = editContent
        const newVal = `${val.substring(0, start)}  ${val.substring(end)}`
        setEditContent(newVal)
        setIsDirty(true)
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2
        })
      }
    },
    [isDirty, handleSave, handleCancel, editContent],
  )

  if (!node.contentRef) {
    return <EmptyFileEditor node={node} serverId={serverId} language={language} />
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

  const versionCount = Array.isArray(node.flags?.versions)
    ? (node.flags.versions as FileVersion[]).length
    : 0

  return (
    <div className="w-full h-full overflow-auto flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-bg-tertiary/80 border-b border-border-subtle shrink-0">
        <span className="text-[11px] text-text-muted font-mono">{node.name}</span>
        <div className="flex items-center gap-1.5">
          {isEditing && isDirty && <span className="text-[11px] text-warning">● 未保存</span>}
          <span className="text-[11px] text-text-muted/70 bg-bg-primary/50 px-1.5 py-0.5 rounded-md">
            {language}
          </span>
          <button
            type="button"
            onClick={() => setShowVersions(!showVersions)}
            className={`flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md transition-all duration-150 ${
              showVersions
                ? 'bg-primary/15 text-primary'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover'
            }`}
            title="版本历史"
          >
            <Clock size={11} />
            {versionCount > 0 && <span>{versionCount}</span>}
          </button>
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={!isDirty || mutations.updateFileContent.isPending}
                className="flex items-center gap-1 text-[11px] px-2 py-0.5 bg-primary/90 hover:bg-primary text-white rounded-md transition-all duration-150 disabled:opacity-40"
                title="保存 (⌘S)"
              >
                {mutations.updateFileContent.isPending ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <Save size={11} />
                )}
                保存
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="text-[11px] px-1.5 py-0.5 text-text-muted hover:text-text-primary rounded-md transition-colors"
              >
                取消
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleEdit}
              className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 text-text-muted hover:text-text-primary hover:bg-bg-modifier-hover rounded-md transition-all duration-150"
              title="编辑"
            >
              <Edit3 size={11} />
              编辑
            </button>
          )}
        </div>
      </div>

      {/* Content + Version panel */}
      <div className="flex flex-1 min-h-0">
        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-auto">
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => {
                setEditContent(e.target.value)
                setIsDirty(true)
              }}
              onKeyDown={handleKeyDown}
              className="flex-1 p-4 text-sm leading-relaxed bg-[#1e1e2e] text-[#cdd6f4] font-mono resize-none outline-none rounded-b-lg"
              spellCheck={false}
            />
          ) : (
            <pre className="flex-1 p-4 text-sm leading-relaxed overflow-x-auto bg-[#1e1e2e] text-[#cdd6f4] rounded-b-lg">
              <code className={`language-${language}`}>{textContent}</code>
            </pre>
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

/* ─── Empty file inline editor ─── */

function EmptyFileEditor({
  node,
  serverId,
  language,
}: {
  node: WorkspaceNode
  serverId: string
  language: string
}) {
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
      if (e.key === 'Tab') {
        e.preventDefault()
        const textarea = textareaRef.current
        if (!textarea) return
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const newVal = `${content.substring(0, start)}  ${content.substring(end)}`
        setContent(newVal)
        setIsDirty(true)
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 2
        })
      }
    },
    [isDirty, handleSave, content],
  )

  return (
    <div className="w-full h-full overflow-auto flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 bg-bg-tertiary/80 border-b border-border-subtle shrink-0">
        <span className="text-[11px] text-text-muted font-mono">{node.name}</span>
        <div className="flex items-center gap-1.5">
          {isDirty && <span className="text-[11px] text-warning">● 未保存</span>}
          <span className="text-[11px] text-text-muted/70 bg-bg-primary/50 px-1.5 py-0.5 rounded-md">
            {language}
          </span>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || mutations.updateFileContent.isPending}
            className="flex items-center gap-1 text-[11px] px-2 py-0.5 bg-primary/90 hover:bg-primary text-white rounded-md transition-all duration-150 disabled:opacity-40"
            title="保存 (⌘S)"
          >
            {mutations.updateFileContent.isPending ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Save size={11} />
            )}
            保存
          </button>
        </div>
      </div>
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
        placeholder="开始编辑..."
      />
    </div>
  )
}
