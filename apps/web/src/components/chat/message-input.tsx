import { Button, cn } from '@shadowob/ui'
import { type InfiniteData, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, FolderOpen, Image as ImageIcon, Plus, Send, Smile, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDraftStorage } from '../../hooks/use-draft-storage'
import { fetchApi } from '../../lib/api'
import { matchPinyin } from '../../lib/pinyin'
import { getSocket, sendTyping, sendWsMessage } from '../../lib/socket'
import { playSendSound } from '../../lib/sounds'
import { useAuthStore } from '../../stores/auth.store'
import { useChatStore } from '../../stores/chat.store'
import { UserAvatar } from '../common/avatar'
import { EmojiPicker } from '../common/emoji-picker'
import { type PickerResult, WorkspaceFilePicker } from '../workspace'
import { ImageViewer } from './image-viewer'

interface MessageInputProps {
  channelId: string
  channelName?: string
  replyToId?: string | null
  onClearReply?: () => void
  externalFiles?: File[]
  onExternalFilesConsumed?: () => void
}

interface PendingFile {
  file: File
  preview?: string
  /** If set, this file comes from workspace and already has a URL (skip re-upload) */
  workspaceUrl?: string
  workspaceName?: string
  workspaceMime?: string
  workspaceSize?: number
}

function getPendingFileKey(pf: PendingFile): string {
  return [
    pf.workspaceUrl,
    pf.preview,
    pf.file.name,
    pf.file.type,
    String(pf.file.size),
    String(pf.file.lastModified),
  ]
    .filter(Boolean)
    .join('::')
}

interface MemberUser {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  status: string
  isBot: boolean
}

interface Member {
  id: string
  userId: string
  user?: MemberUser
}

export function MessageInput({
  channelId,
  channelName,
  replyToId,
  onClearReply,
  externalFiles,
  onExternalFilesConsumed,
}: MessageInputProps) {
  const { t } = useTranslation()
  const { activeServerId } = useChatStore()
  const queryClient = useQueryClient()
  const [content, setContent] = useState('')
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false)
  const [viewingImage, setViewingImage] = useState<PendingFile | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Draft storage for persistent input
  const { scheduleSave, clear: clearDraft } = useDraftStorage(channelId, (savedText) => {
    setContent(savedText)
    // Auto-resize textarea after restoring content
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (el) {
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, 200)}px`
      }
    })
  })

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const mentionListRef = useRef<HTMLDivElement>(null)

  // Fetch members for @mention autocomplete
  const { data: members = [] } = useQuery({
    queryKey: ['members', activeServerId],
    queryFn: () => fetchApi<Member[]>(`/api/servers/${activeServerId}/members`),
    enabled: !!activeServerId,
  })

  // Filter members by mention query — buddies first, pinyin support, show all results
  const filteredMembers = useMemo(() => {
    if (mentionQuery === null) return []
    const q = mentionQuery.trim().toLocaleLowerCase()
    const scored = members
      .map((m) => {
        const username = m.user?.username ?? ''
        const displayName = m.user?.displayName ?? ''
        const usernameLc = username.toLocaleLowerCase()
        const displayNameLc = displayName.toLocaleLowerCase()
        const isBot = m.user?.isBot ?? false

        // Base bonus: buddies/bots get priority (+500)
        const botBonus = isBot ? 500 : 0

        // Query empty => show all members, buddies first
        if (!q) {
          return { member: m, score: 1000 + botBonus, usernameLc, displayNameLc }
        }

        let score = -1
        // Standard text matching
        if (usernameLc.startsWith(q)) score = Math.max(score, 300)
        else if (displayNameLc.startsWith(q)) score = Math.max(score, 250)
        else if (usernameLc.includes(q)) score = Math.max(score, 200)
        else if (displayNameLc.includes(q)) score = Math.max(score, 150)

        // Pinyin matching for Chinese names
        if (score < 0) {
          const pinyinMatch = matchPinyin(displayName, q) || matchPinyin(username, q)
          if (pinyinMatch === 'start') score = Math.max(score, 240)
          else if (pinyinMatch === 'partial') score = Math.max(score, 140)
        }

        if (score >= 0) score += botBonus

        return { member: m, score, usernameLc, displayNameLc }
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return (a.displayNameLc || a.usernameLc).localeCompare(b.displayNameLc || b.usernameLc)
      })

    return scored.map((x) => x.member)
  }, [members, mentionQuery])

  // Scroll active mention item into view
  useEffect(() => {
    if (mentionListRef.current && mentionQuery !== null) {
      const item = mentionListRef.current.children[mentionIndex] as HTMLElement
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [mentionIndex, mentionQuery])

  // Consume external files dropped into the chat area
  useEffect(() => {
    if (externalFiles && externalFiles.length > 0) {
      const newFiles: PendingFile[] = externalFiles.map((file) => {
        const pf: PendingFile = { file }
        if (file.type.startsWith('image/')) {
          pf.preview = URL.createObjectURL(file)
        }
        return pf
      })
      setPendingFiles((prev) => [...prev, ...newFiles])
      onExternalFilesConsumed?.()
      textareaRef.current?.focus()
    }
  }, [externalFiles, onExternalFilesConsumed])

  // Insert mention at cursor
  const insertMention = useCallback(
    (member: Member) => {
      const textarea = textareaRef.current
      if (!textarea) return

      const cursorPos = textarea.selectionStart
      const text = content

      // Find the @ that triggered this mention
      const beforeCursor = text.slice(0, cursorPos)
      const atIndex = beforeCursor.lastIndexOf('@')
      if (atIndex === -1) return

      const before = text.slice(0, atIndex)
      const after = text.slice(cursorPos)
      const username = member.user?.username ?? member.userId
      const newContent = `${before}@${username} ${after}`
      setContent(newContent)
      setMentionQuery(null)
      setMentionIndex(0)

      // Restore cursor position after React re-render
      const mentionToken = `@${username} `
      const newCursorPos = atIndex + mentionToken.length
      requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(newCursorPos, newCursorPos)
      })
    },
    [content],
  )

  const handleSend = useCallback(async () => {
    const text = content.trim()
    if (!text && pendingFiles.length === 0) return

    setUploading(true)

    // Insert optimistic message immediately for text-only sends
    const currentUser = useAuthStore.getState().user
    const tempId = `temp-${Date.now()}`
    type MessagesPage = { messages: Record<string, unknown>[]; hasMore: boolean }

    if (text && pendingFiles.length === 0) {
      const optimisticMsg = {
        id: tempId,
        content: text,
        channelId,
        authorId: currentUser?.id ?? '',
        threadId: null,
        replyToId: replyToId ?? null,
        isEdited: false,
        isPinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: currentUser
          ? {
              id: currentUser.id,
              username: currentUser.username,
              displayName: currentUser.displayName ?? currentUser.username,
              avatarUrl: currentUser.avatarUrl,
              isBot: false,
            }
          : undefined,
        sendStatus: 'sending' as const,
      }

      queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', channelId], (old) => {
        if (!old || old.pages.length === 0) return old
        const pages = [...old.pages]
        const firstPage = pages[0]!
        pages[0] = {
          ...firstPage,
          messages: [...firstPage.messages, optimisticMsg],
        }
        return { ...old, pages }
      })
    }

    // Clear input immediately for responsiveness
    const savedContent = text
    const savedReplyTo = replyToId
    const savedPendingFiles = [...pendingFiles]
    setContent('')
    setPendingFiles([])
    onClearReply?.()

    // Clear draft after successful send
    clearDraft()

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    playSendSound()

    try {
      if (savedPendingFiles.length > 0) {
        const uploadedAttachments: {
          filename: string
          url: string
          contentType: string
          size: number
        }[] = []
        for (const pf of savedPendingFiles) {
          if (pf.workspaceUrl) {
            uploadedAttachments.push({
              filename: pf.workspaceName ?? pf.file.name,
              url: pf.workspaceUrl,
              contentType: pf.workspaceMime ?? (pf.file.type || 'application/octet-stream'),
              size: pf.workspaceSize ?? pf.file.size,
            })
          } else {
            const formData = new FormData()
            formData.append('file', pf.file)
            const result = await fetchApi<{ url: string; size: number }>('/api/media/upload', {
              method: 'POST',
              body: formData,
            })
            uploadedAttachments.push({
              filename: pf.file.name,
              url: result.url,
              contentType: pf.file.type || 'application/octet-stream',
              size: result.size,
            })
          }
        }

        const contentToSend = savedContent || '\u200B'
        await fetchApi(`/api/channels/${channelId}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            content: contentToSend,
            ...(savedReplyTo ? { replyToId: savedReplyTo } : {}),
            attachments: uploadedAttachments,
          }),
        })
      } else if (savedContent) {
        const sock = getSocket()
        if (sock.connected) {
          sendWsMessage({
            channelId,
            content: savedContent,
            replyToId: savedReplyTo ?? undefined,
          })
          // WS: message:new will replace the temp message via dedup in chat-area
          // Set timeout to mark as failed if no confirmation
          setTimeout(() => {
            queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', channelId], (old) => {
              if (!old) return old
              const stillPending = old.pages.some((p) =>
                p.messages.some(
                  (m) =>
                    (m as { id: string; sendStatus?: string }).id === tempId &&
                    (m as { sendStatus?: string }).sendStatus === 'sending',
                ),
              )
              if (stillPending) {
                return {
                  ...old,
                  pages: old.pages.map((page) => ({
                    ...page,
                    messages: page.messages.map((m) =>
                      (m as { id: string }).id === tempId ? { ...m, sendStatus: 'failed' } : m,
                    ),
                  })),
                }
              }
              return old
            })
          }, 10000)
        } else {
          // Socket not connected — use REST fallback
          await fetchApi(`/api/channels/${channelId}/messages`, {
            method: 'POST',
            body: JSON.stringify({
              content: savedContent,
              ...(savedReplyTo ? { replyToId: savedReplyTo } : {}),
            }),
          })
        }
      }
    } catch (err) {
      console.error('Failed to send message:', err)
      // Mark optimistic message as failed
      queryClient.setQueryData<InfiniteData<MessagesPage>>(['messages', channelId], (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            messages: page.messages.map((m) =>
              (m as { id: string }).id === tempId ? { ...m, sendStatus: 'failed' } : m,
            ),
          })),
        }
      })
    } finally {
      setUploading(false)
    }
  }, [channelId, content, pendingFiles, replyToId, onClearReply, queryClient, clearDraft])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    // Handle pasted files from clipboard
    const items = e.clipboardData?.items
    if (!items) return

    const files: File[] = []
    for (const item of items) {
      // Check if the item is a file
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          files.push(file)
        }
      }
    }

    if (files.length > 0) {
      e.preventDefault() // Prevent pasting file content as text
      const newFiles: PendingFile[] = files.map((file) => {
        const pf: PendingFile = { file }
        if (file.type.startsWith('image/')) {
          pf.preview = URL.createObjectURL(file)
        }
        return pf
      })
      setPendingFiles((prev) => [...prev, ...newFiles])
    }
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle mention autocomplete navigation
    if (mentionQuery !== null && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((prev) => (prev + 1) % filteredMembers.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((prev) => (prev - 1 + filteredMembers.length) % filteredMembers.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const selected = filteredMembers[mentionIndex]
        if (selected?.user) {
          insertMention(selected)
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionQuery(null)
        setMentionIndex(0)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setContent(value)

    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`

    // Detect @mention trigger
    const cursorPos = el.selectionStart
    const beforeCursor = value.slice(0, cursorPos)
    const mentionMatch = beforeCursor.match(/(?:^|\s)@([^\s@]{0,32})$/u)
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1] ?? '')
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
      setMentionIndex(0)
    }

    // Typing indicator (heartbeat: send every 2s while typing)
    if (!typingTimerRef.current) {
      sendTyping(channelId)
      typingTimerRef.current = setTimeout(() => {
        typingTimerRef.current = null
      }, 2000)
    }

    // Auto-save draft (debounced)
    scheduleSave(value)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const newFiles: PendingFile[] = Array.from(files).map((file) => {
      const pf: PendingFile = { file }
      if (file.type.startsWith('image/')) {
        pf.preview = URL.createObjectURL(file)
      }
      return pf
    })

    setPendingFiles((prev) => [...prev, ...newFiles])
    e.target.value = ''
  }

  const removeFile = (index: number) => {
    setPendingFiles((prev) => {
      const removed = prev[index]
      if (removed?.preview) URL.revokeObjectURL(removed.preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    if (!files.length) return

    const newFiles: PendingFile[] = Array.from(files).map((file) => {
      const pf: PendingFile = { file }
      if (file.type.startsWith('image/')) {
        pf.preview = URL.createObjectURL(file)
      }
      return pf
    })

    setPendingFiles((prev) => [...prev, ...newFiles])
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  // Handle workspace file selection from picker
  const handleWorkspaceFileSelect = useCallback((result: PickerResult) => {
    const node = result.node
    if (!node?.contentRef) return

    // Create a placeholder File object for display purposes
    const placeholderFile = new globalThis.File([], node.name, {
      type: node.mime ?? 'application/octet-stream',
    })

    const pf: PendingFile = {
      file: placeholderFile,
      workspaceUrl: node.contentRef,
      workspaceName: node.name,
      workspaceMime: node.mime ?? undefined,
      workspaceSize: node.sizeBytes ?? undefined,
    }

    // Generate preview for images
    if (node.mime?.startsWith('image/') && node.contentRef) {
      pf.preview = node.contentRef
    }

    setPendingFiles((prev) => [...prev, pf])
    setShowWorkspacePicker(false)
    textareaRef.current?.focus()
  }, [])

  return (
    <section
      className="px-4 pb-4 mobile-safe-bottom relative"
      aria-label={t('chat.inputPlaceholder', {
        channelName: channelName ?? t('chat.channelFallback'),
      })}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* @mention autocomplete popup */}
      {mentionQuery !== null && filteredMembers.length > 0 && (
        <div
          ref={mentionListRef}
          className="absolute bottom-full left-4 right-4 mb-1 bg-bg-primary/95 backdrop-blur-xl border border-border-subtle rounded-[24px] shadow-[0_16px_64px_rgba(0,0,0,0.4)] py-1.5 max-h-[240px] overflow-y-auto z-50"
        >
          {filteredMembers.map((member, i) => (
            <button
              key={member.id}
              type="button"
              className={cn(
                'flex items-center gap-2 w-full px-3 py-2 text-sm transition',
                i === mentionIndex
                  ? 'bg-primary/10 text-text-primary'
                  : 'text-text-secondary hover:bg-primary/10',
              )}
              onMouseEnter={() => setMentionIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault() // prevent textarea blur
                if (member.user) insertMention(member)
              }}
            >
              <UserAvatar
                userId={member.user?.id}
                avatarUrl={member.user?.avatarUrl}
                displayName={member.user?.displayName ?? member.user?.username}
                size="sm"
              />
              <span className="font-medium">
                {member.user?.displayName ?? member.user?.username}
              </span>
              <span className="text-text-muted text-xs">@{member.user?.username}</span>
              {member.user?.isBot && (
                <span className="text-[11px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium ml-auto">
                  {t('common.bot')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {/* Reply indicator */}
      {replyToId && (
        <div className="flex items-center justify-between bg-primary/5 rounded-t-[20px] px-4 py-2 text-xs text-text-secondary border-l-2 border-primary animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <span className="font-bold text-text-muted">{t('chat.replyingTo')}</span>
          </div>
          <Button
            variant="ghost"
            size="xs"
            className="h-6 w-6 p-0 rounded-full"
            onClick={onClearReply}
          >
            <X size={14} />
          </Button>
        </div>
      )}

      {/* Pending file previews */}
      {pendingFiles.length > 0 && (
        <div
          className={cn(
            'flex flex-wrap gap-2 bg-bg-secondary/80 rounded-[24px] border-b border-border-subtle px-4 py-3',
            replyToId ? '' : 'rounded-t-[40px]',
          )}
        >
          {pendingFiles.map((pf, i) => (
            <div key={getPendingFileKey(pf)} className="relative group/file">
              {pf.preview ? (
                <button
                  type="button"
                  onClick={() => setViewingImage(pf)}
                  className="w-20 h-20 rounded-lg overflow-hidden border border-border-subtle hover:border-primary/30 transition cursor-pointer"
                >
                  <img src={pf.preview} alt="" className="w-full h-full object-cover" />
                </button>
              ) : (
                <div className="w-20 h-20 rounded-lg border border-border-subtle bg-bg-secondary/80 flex flex-col items-center justify-center gap-1">
                  <FileText size={20} className="text-text-muted" />
                  <span className="text-[9px] text-text-muted truncate max-w-[72px] px-1">
                    {pf.workspaceName ?? pf.file.name}
                  </span>
                </div>
              )}
              {pf.workspaceUrl && (
                <span className="absolute bottom-0.5 left-0.5 text-[8px] bg-primary/80 text-white px-1 py-0.5 rounded">
                  工作区
                </span>
              )}
              <Button
                variant="ghost"
                size="xs"
                className="absolute -top-1.5 -right-1.5 h-5 w-5 p-0 rounded-full bg-danger text-white opacity-0 group-hover/file:opacity-100"
                onClick={() => removeFile(i)}
              >
                <X size={10} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div
        className={cn(
          'flex items-center gap-1 bg-white/3 backdrop-blur-xl border-2 border-border-subtle px-3 py-1.5 shadow-lg shadow-black/10 transition-all focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/20',
          replyToId || pendingFiles.length > 0 ? 'rounded-b-[40px]' : 'rounded-[40px]',
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 self-end mb-[3px]"
          onClick={() => fileInputRef.current?.click()}
          title={t('chat.uploadFile')}
        >
          <Plus size={20} />
        </Button>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={t('chat.inputPlaceholder', {
            channelName: channelName ?? t('chat.channelFallback'),
          })}
          rows={1}
          className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted outline-none resize-none text-[15px] leading-[24px] max-h-[50vh] min-h-[24px] py-[7px]"
        />

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 self-end mb-[3px]"
          onClick={() => fileInputRef.current?.click()}
          title={t('chat.uploadImage')}
        >
          <ImageIcon size={20} />
        </Button>

        {activeServerId && (
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 self-end mb-[3px]"
            onClick={() => setShowWorkspacePicker(true)}
            title="从工作区选择文件"
          >
            <FolderOpen size={20} />
          </Button>
        )}

        <div className="relative shrink-0 self-end mb-[3px]">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            title={t('chat.addEmoji')}
          >
            <Smile size={20} />
          </Button>
          {showEmojiPicker && (
            <EmojiPicker
              onSelect={(emoji) => {
                setContent((prev) => prev + emoji)
                textareaRef.current?.focus()
              }}
              onClose={() => setShowEmojiPicker(false)}
              position="top"
            />
          )}
        </div>

        <Button
          size="icon"
          className="h-9 w-9 rounded-full bg-primary hover:bg-primary/80 shrink-0 self-end mb-[3px] disabled:opacity-30 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-shadow"
          onClick={handleSend}
          disabled={(!content.trim() && pendingFiles.length === 0) || uploading}
        >
          <Send size={20} />
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar,.7z"
      />

      {showWorkspacePicker && activeServerId && (
        <WorkspaceFilePicker
          serverId={activeServerId}
          mode="select-file"
          title="选择工作区文件发送"
          onConfirm={handleWorkspaceFileSelect}
          onClose={() => setShowWorkspacePicker(false)}
        />
      )}

      {/* Image viewer for pending files */}
      {viewingImage && (
        <ImageViewer
          src={viewingImage.preview || viewingImage.workspaceUrl || ''}
          filename={viewingImage.workspaceName ?? viewingImage.file.name}
          size={viewingImage.workspaceSize ?? viewingImage.file.size}
          onClose={() => setViewingImage(null)}
        />
      )}
    </section>
  )
}
