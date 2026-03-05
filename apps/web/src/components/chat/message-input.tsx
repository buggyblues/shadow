import { FileText, Image as ImageIcon, Plus, Send, Smile, X } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../../lib/api'
import { sendTyping, sendWsMessage } from '../../lib/socket'
import { EmojiPicker } from '../common/emoji-picker'

interface MessageInputProps {
  channelId: string
  channelName?: string
  replyToId?: string | null
  onClearReply?: () => void
}

interface PendingFile {
  file: File
  preview?: string
}

export function MessageInput({
  channelId,
  channelName,
  replyToId,
  onClearReply,
}: MessageInputProps) {
  const { t } = useTranslation()
  const [content, setContent] = useState('')
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSend = useCallback(async () => {
    const text = content.trim()
    if (!text && pendingFiles.length === 0) return

    setUploading(true)

    try {
      // Upload files first
      const uploadedUrls: string[] = []
      for (const pf of pendingFiles) {
        const formData = new FormData()
        formData.append('file', pf.file)
        const result = await fetchApi<{ url: string; size: number }>('/api/media/upload', {
          method: 'POST',
          body: formData,
        })
        uploadedUrls.push(result.url)
      }

      // Build message content with file links
      let finalContent = text
      if (uploadedUrls.length > 0) {
        const fileLinks = uploadedUrls.map((url, i) => {
          const file = pendingFiles[i]!
          if (file.file.type.startsWith('image/')) {
            return `![${file.file.name}](${url})`
          }
          return `[${file.file.name}](${url})`
        })
        finalContent = finalContent
          ? `${finalContent}\n${fileLinks.join('\n')}`
          : fileLinks.join('\n')
      }

      if (finalContent) {
        sendWsMessage({
          channelId,
          content: finalContent,
          replyToId: replyToId ?? undefined,
        })
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)

    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`

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
    <div className="px-4 pb-4" onDrop={handleDrop} onDragOver={handleDragOver}>
      {/* Reply indicator */}
      {replyToId && (
        <div className="flex items-center justify-between bg-bg-tertiary rounded-t-lg px-3 py-1.5 text-xs text-text-muted border-b border-white/5">
          <span>{t('chat.replyingTo')}</span>
          <button
            onClick={onClearReply}
            className="text-text-muted hover:text-text-primary transition"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Pending file previews */}
      {pendingFiles.length > 0 && (
        <div
          className={`flex flex-wrap gap-2 bg-bg-primary/50 ${replyToId ? '' : 'rounded-t-lg'} border border-b-0 border-white/5 px-4 py-3`}
        >
          {pendingFiles.map((pf, i) => (
            <div key={i} className="relative group/file">
              {pf.preview ? (
                <div className="w-20 h-20 rounded-lg overflow-hidden border border-white/10">
                  <img src={pf.preview} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-lg border border-white/10 bg-bg-tertiary flex flex-col items-center justify-center gap-1">
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
        className={`flex items-end gap-2 bg-bg-primary/50 ${
          replyToId || pendingFiles.length > 0 ? 'rounded-b-lg' : 'rounded-lg'
        } border border-white/5 px-4 py-2`}
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-text-muted hover:text-text-primary transition pb-1"
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
          className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted outline-none resize-none text-sm leading-relaxed max-h-[200px]"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-text-muted hover:text-text-primary transition pb-1"
          title={t('chat.uploadImage')}
        >
          <ImageIcon size={18} />
        </button>

        <div className="relative">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="text-text-muted hover:text-text-primary transition pb-1"
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
          className="text-text-muted hover:text-primary transition pb-1 disabled:opacity-30"
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
