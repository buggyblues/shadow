import { useQuery } from '@tanstack/react-query'
import { FileText, Image as ImageIcon, Plus, Send, Smile, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { sendTyping, sendWsMessage } from '../../lib/socket'
import { playSendSound } from '../../lib/sounds'
import { useChatStore } from '../../stores/chat.store'
import { UserAvatar } from '../common/avatar'
import { EmojiPicker } from '../common/emoji-picker'

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
  const [content, setContent] = useState('')
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Filter members by mention query
  const filteredMembers =
    mentionQuery !== null
      ? members
          .filter((m) => {
            const q = mentionQuery.toLowerCase()
            const username = m.user?.username?.toLowerCase() ?? ''
            const displayName = m.user?.displayName?.toLowerCase() ?? ''
            return username.includes(q) || displayName.includes(q)
          })
          .slice(0, 8)
      : []

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
      const newContent = `${before}<@${member.userId}> ${after}`
      setContent(newContent)
      setMentionQuery(null)
      setMentionIndex(0)

      // Restore cursor position after React re-render
      const mentionToken = `<@${member.userId}> `
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

    try {
      if (pendingFiles.length > 0) {
        // Upload files first, then create the message with all attachments
        // so the broadcast includes complete attachment data for AI agents.
        const uploadedAttachments: {
          filename: string
          url: string
          contentType: string
          size: number
        }[] = []
        for (const pf of pendingFiles) {
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

        // Create message with pre-uploaded attachments via REST
        const contentToSend = text || '\u200B' // zero-width space for file-only messages
        await fetchApi(`/api/channels/${channelId}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            content: contentToSend,
            ...(replyToId ? { replyToId } : {}),
            attachments: uploadedAttachments,
          }),
        })

        playSendSound()
      } else if (text) {
        // Text-only message — use WebSocket for low latency
        sendWsMessage({
          channelId,
          content: text,
          replyToId: replyToId ?? undefined,
        })
        playSendSound()
      }

      setContent('')
      setPendingFiles([])
      onClearReply?.()

      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setUploading(false)
    }
  }, [channelId, content, pendingFiles, replyToId, onClearReply])

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
    const mentionMatch = beforeCursor.match(/@([\w-]*)$/)
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1] ?? '')
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
      setMentionIndex(0)
    }

    // Typing indicator (throttled)
    if (!typingTimerRef.current) {
      sendTyping(channelId)
      typingTimerRef.current = setTimeout(() => {
        typingTimerRef.current = null
      }, 3000)
    }
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

  return (
    <div
      className="px-4 pb-4 mobile-safe-bottom relative"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* @mention autocomplete popup */}
      {mentionQuery !== null && filteredMembers.length > 0 && (
        <div
          ref={mentionListRef}
          className="absolute bottom-full left-4 right-4 mb-1 bg-bg-tertiary border border-border-dim rounded-lg shadow-xl py-1 max-h-[240px] overflow-y-auto z-50"
        >
          {filteredMembers.map((member, i) => (
            <button
              key={member.id}
              type="button"
              className={`flex items-center gap-2 w-full px-3 py-2 text-sm transition ${
                i === mentionIndex
                  ? 'bg-primary/20 text-text-primary'
                  : 'text-text-secondary hover:bg-bg-modifier-hover'
              }`}
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
                <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium ml-auto">
                  {t('common.bot')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {/* Reply indicator */}
      {replyToId && (
        <div className="flex items-center justify-between bg-bg-secondary rounded-t-lg px-4 py-2 text-xs text-text-secondary border-b border-black/10">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-text-muted">{t('chat.replyingTo')}</span>
          </div>
          <button
            onClick={onClearReply}
            className="text-text-muted hover:text-text-primary transition p-1 hover:bg-bg-modifier-hover rounded-full"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Pending file previews */}
      {pendingFiles.length > 0 && (
        <div
          className={`flex flex-wrap gap-2 bg-bg-secondary ${replyToId ? '' : 'rounded-t-lg'} border-b border-black/10 px-4 py-3`}
        >
          {pendingFiles.map((pf, i) => (
            <div key={i} className="relative group/file">
              {pf.preview ? (
                <div className="w-20 h-20 rounded-lg overflow-hidden border border-border-dim">
                  <img src={pf.preview} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-lg border border-border-dim bg-bg-tertiary flex flex-col items-center justify-center gap-1">
                  <FileText size={20} className="text-text-muted" />
                  <span className="text-[9px] text-text-muted truncate max-w-[72px] px-1">
                    {pf.file.name}
                  </span>
                </div>
              )}
              <button
                onClick={() => removeFile(i)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger rounded-full flex items-center justify-center text-white opacity-0 group-hover/file:opacity-100 transition"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={`flex items-center gap-1 bg-[#383a40] ${
          replyToId || pendingFiles.length > 0 ? 'rounded-b-lg' : 'rounded-lg'
        } px-3 py-1.5 shadow-sm`}
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-text-secondary hover:text-text-primary transition p-1.5 rounded-full hover:bg-bg-modifier-hover shrink-0 self-end mb-[3px]"
          title={t('chat.uploadFile')}
        >
          <Plus size={20} />
        </button>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={t('chat.inputPlaceholder', {
            channelName: channelName ?? t('chat.channelFallback'),
          })}
          rows={1}
          className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted outline-none resize-none text-[15px] leading-[22px] max-h-[50vh] min-h-[22px] py-[7px]"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-text-secondary hover:text-text-primary transition p-1.5 rounded-full hover:bg-bg-modifier-hover shrink-0 self-end mb-[3px]"
          title={t('chat.uploadImage')}
        >
          <ImageIcon size={20} />
        </button>

        <div className="relative shrink-0 self-end mb-[3px]">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="text-text-secondary hover:text-text-primary transition p-1.5 rounded-full hover:bg-bg-modifier-hover"
            title={t('chat.addEmoji')}
          >
            <Smile size={20} />
          </button>
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

        <button
          onClick={handleSend}
          disabled={(!content.trim() && pendingFiles.length === 0) || uploading}
          className="text-text-muted hover:text-primary transition p-1.5 rounded-full hover:bg-bg-modifier-hover shrink-0 self-end mb-[3px] disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Send size={20} />
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar,.7z"
      />
    </div>
  )
}
