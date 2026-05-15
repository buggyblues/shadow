import type {
  CommerceProductCard,
  MentionSuggestion,
  MentionSuggestionTrigger,
  MessageMention,
} from '@shadowob/shared'
import { assignMentionRanges, canonicalMentionToken } from '@shadowob/shared'
import { Button, cn, InputValley } from '@shadowob/ui'
import { type InfiniteData, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AtSign,
  Bot,
  Command as CommandIcon,
  FileText,
  FolderOpen,
  Hash,
  Image as ImageIcon,
  Plus,
  Search,
  Send,
  Server as ServerIcon,
  ShoppingBag,
  Smile,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDraftStorage } from '../../hooks/use-draft-storage'
import { fetchApi } from '../../lib/api'
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

interface SlashCommand {
  name: string
  description?: string
  aliases?: string[]
  packId?: string
  agentId: string
  botUserId: string
  botUsername: string
  botDisplayName?: string | null
}

interface CommerceProductPickerGroup {
  key: string
  labelKey: string
  shopName?: string | null
  cards: CommerceProductCard[]
}

interface CommerceProductPickerResponse {
  cards: CommerceProductCard[]
  groups?: CommerceProductPickerGroup[]
}

function getCommerceCardPrice(
  card: CommerceProductCard,
  t?: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (card.snapshot.currency === 'shrimp_coin') {
    const unit = t?.('common.shrimpCoin', { defaultValue: '虾币' }) ?? 'shrimp_coin'
    return `${card.snapshot.price.toLocaleString()} ${unit}`
  }
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: card.snapshot.currency,
    maximumFractionDigits: 2,
  }).format(card.snapshot.price / 100)
}

function mentionFromSuggestion(
  suggestion: MentionSuggestion,
  range?: MessageMention['range'],
): MessageMention {
  return {
    kind: suggestion.kind,
    targetId: suggestion.targetId,
    token: canonicalMentionToken(suggestion),
    sourceToken: suggestion.token,
    label: suggestion.label,
    serverId: suggestion.serverId,
    serverSlug: suggestion.serverSlug,
    serverName: suggestion.serverName,
    channelId: suggestion.channelId,
    channelName: suggestion.channelName,
    userId: suggestion.userId,
    username: suggestion.username,
    displayName: suggestion.displayName,
    avatarUrl: suggestion.avatarUrl,
    isBot: suggestion.isBot,
    isPrivate: suggestion.isPrivate,
    range,
  }
}

function mergeMention(list: MessageMention[], mention: MessageMention): MessageMention[] {
  const mentionKey = (item: MessageMention) =>
    `${item.kind}:${item.targetId}:${item.range?.start ?? 'x'}:${item.range?.end ?? 'x'}`
  return [...list.filter((item) => mentionKey(item) !== mentionKey(mention)), mention]
}

function mentionsForContent(content: string, mentions: MessageMention[]): MessageMention[] {
  return assignMentionRanges(content, mentions).slice(0, 20)
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
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [productQuery, setProductQuery] = useState('')
  const [selectedCommerceCards, setSelectedCommerceCards] = useState<CommerceProductCard[]>([])
  const [viewingImage, setViewingImage] = useState<PendingFile | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const focusComposer = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea || textarea.disabled) return
    if (document.querySelector('[role="dialog"]')) return
    textarea.focus({ preventScroll: true })
    const cursor = textarea.value.length
    textarea.setSelectionRange(cursor, cursor)
  }, [])

  // Auto-focus textarea when channel changes
  useEffect(() => {
    let animationFrame = window.requestAnimationFrame(focusComposer)
    const timers = [80, 220, 520].map((delay) => window.setTimeout(focusComposer, delay))
    return () => {
      window.cancelAnimationFrame(animationFrame)
      for (const timer of timers) window.clearTimeout(timer)
    }
  }, [channelId, focusComposer])

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
  const [mentionTrigger, setMentionTrigger] = useState<MentionSuggestionTrigger | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [selectedMentions, setSelectedMentions] = useState<MessageMention[]>([])
  const mentionListRef = useRef<HTMLDivElement>(null)

  // Slash command autocomplete state
  const [slashQuery, setSlashQuery] = useState<string | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const slashListRef = useRef<HTMLDivElement>(null)

  const { data: mentionSuggestionData } = useQuery({
    queryKey: ['mention-suggestions', channelId, mentionTrigger, mentionQuery ?? ''],
    queryFn: () => {
      const params = new URLSearchParams({
        channelId,
        trigger: mentionTrigger ?? '@',
        q: mentionQuery ?? '',
        limit: '20',
      })
      return fetchApi<{ suggestions: MentionSuggestion[] }>(`/api/mentions/suggest?${params}`)
    },
    enabled: Boolean(activeServerId && channelId && mentionTrigger && mentionQuery !== null),
    staleTime: 5_000,
  })

  const { data: slashCommandData } = useQuery({
    queryKey: ['channel-slash-commands', channelId],
    queryFn: () =>
      fetchApi<{ commands: SlashCommand[] }>(`/api/channels/${channelId}/slash-commands`),
    enabled: Boolean(activeServerId && channelId),
    staleTime: 30_000,
  })

  const { data: productPickerData, isFetching: isFetchingProducts } = useQuery({
    queryKey: ['commerce-product-picker', 'channel', channelId, productQuery],
    queryFn: () =>
      fetchApi<CommerceProductPickerResponse>(
        `/api/commerce/product-picker?target=channel&channelId=${encodeURIComponent(channelId)}&keyword=${encodeURIComponent(productQuery.trim())}`,
      ),
    enabled: Boolean(channelId && showProductPicker),
    staleTime: 15_000,
  })

  const slashCommands = slashCommandData?.commands ?? []

  useEffect(() => {
    const socket = getSocket()
    const refreshSlashCommands = () => {
      queryClient.invalidateQueries({ queryKey: ['channel-slash-commands', channelId] })
    }
    const handleMemberJoined = (payload: { channelId?: string; isBot?: boolean }) => {
      if (payload.channelId === channelId && payload.isBot) refreshSlashCommands()
    }
    const handleMemberLeft = (payload: { channelId?: string }) => {
      if (payload.channelId === channelId) refreshSlashCommands()
    }
    const handleSlashCommandsUpdated = (payload: { channelId?: string }) => {
      if (payload.channelId === channelId) refreshSlashCommands()
    }

    socket.on('member:joined', handleMemberJoined)
    socket.on('member:left', handleMemberLeft)
    socket.on('channel:slash-commands-updated', handleSlashCommandsUpdated)
    return () => {
      socket.off('member:joined', handleMemberJoined)
      socket.off('member:left', handleMemberLeft)
      socket.off('channel:slash-commands-updated', handleSlashCommandsUpdated)
    }
  }, [channelId, queryClient])

  const mentionSuggestions = mentionSuggestionData?.suggestions ?? []

  const filteredSlashCommands = useMemo(() => {
    if (slashQuery === null) return []
    const q = slashQuery.trim().toLocaleLowerCase()
    return slashCommands
      .filter((command) => {
        if (!q) return true
        const haystack = [
          command.name,
          ...(command.aliases ?? []),
          command.description ?? '',
          command.packId ?? '',
          command.botUsername,
          command.botDisplayName ?? '',
        ]
          .join(' ')
          .toLocaleLowerCase()
        return haystack.includes(q)
      })
      .sort((a, b) => {
        const aExact = a.name.toLocaleLowerCase() === q ? 1 : 0
        const bExact = b.name.toLocaleLowerCase() === q ? 1 : 0
        if (aExact !== bExact) return bExact - aExact
        return a.name.localeCompare(b.name)
      })
      .slice(0, 12)
  }, [slashCommands, slashQuery])

  const productCards = productPickerData?.cards ?? []
  const productPickerGroups = useMemo<CommerceProductPickerGroup[]>(() => {
    const groups = productPickerData?.groups?.filter((group) => group.cards.length > 0)
    if (groups?.length) return groups
    return productCards.length
      ? [{ key: 'all', labelKey: 'chat.productPickerGroupAll', cards: productCards }]
      : []
  }, [productPickerData?.groups, productCards])

  const addCommerceCard = useCallback((card: CommerceProductCard) => {
    setSelectedCommerceCards((prev) => {
      if (
        prev.some(
          (item) =>
            (item.offerId && item.offerId === card.offerId) ||
            (item.productId === card.productId && item.skuId === card.skuId),
        )
      ) {
        return prev
      }
      return [...prev, card].slice(0, 3)
    })
    setShowProductPicker(false)
    textareaRef.current?.focus()
  }, [])

  const removeCommerceCard = useCallback((cardId: string) => {
    setSelectedCommerceCards((prev) => prev.filter((card) => card.id !== cardId))
  }, [])

  const removeComposerRange = useCallback(
    (start: number, end: number) => {
      const textarea = textareaRef.current
      const next = `${content.slice(0, start)}${content.slice(end)}`
      setContent(next)
      scheduleSave(next)
      requestAnimationFrame(() => {
        textarea?.focus()
        textarea?.setSelectionRange(start, start)
      })
    },
    [content, scheduleSave],
  )

  const openProductPickerFromComposer = useCallback(
    (start?: number, end?: number) => {
      if (typeof start === 'number' && typeof end === 'number') {
        removeComposerRange(start, end)
      }
      setSlashQuery(null)
      setSlashIndex(0)
      setMentionQuery(null)
      setMentionTrigger(null)
      setMentionIndex(0)
      setShowAttachMenu(false)
      setShowProductPicker(true)
    },
    [removeComposerRange],
  )

  const openFileDialog = useCallback((accept?: string) => {
    const input = fileInputRef.current
    if (!input) return
    input.accept = accept ?? ''
    input.click()
    setShowAttachMenu(false)
  }, [])

  const openWorkspacePicker = useCallback(() => {
    setShowAttachMenu(false)
    setShowWorkspacePicker(true)
  }, [])

  // Scroll active mention item into view
  useEffect(() => {
    if (mentionListRef.current && mentionQuery !== null) {
      const item = mentionListRef.current.children[mentionIndex] as HTMLElement
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [mentionIndex, mentionQuery])

  useEffect(() => {
    if (slashListRef.current && slashQuery !== null) {
      const item = slashListRef.current.children[slashIndex] as HTMLElement
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [slashIndex, slashQuery])

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

  // Insert mention/reference at cursor
  const insertMention = useCallback(
    (suggestion: MentionSuggestion) => {
      const textarea = textareaRef.current
      if (!textarea || !mentionTrigger) return

      const cursorPos = textarea.selectionStart
      const text = content

      // Find the trigger that opened this palette
      const beforeCursor = text.slice(0, cursorPos)
      const triggerIndex = beforeCursor.lastIndexOf(mentionTrigger)
      if (triggerIndex === -1) return

      const before = text.slice(0, triggerIndex)
      const after = text.slice(cursorPos)
      const token = `${suggestion.token} `
      const newContent = `${before}${token}${after}`
      setContent(newContent)
      setSelectedMentions((prev) =>
        mergeMention(
          prev,
          mentionFromSuggestion(suggestion, {
            start: triggerIndex,
            end: triggerIndex + suggestion.token.length,
          }),
        ),
      )
      setMentionQuery(null)
      setMentionTrigger(null)
      setMentionIndex(0)

      // Restore cursor position after React re-render
      const newCursorPos = triggerIndex + token.length
      requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(newCursorPos, newCursorPos)
      })
    },
    [content, mentionTrigger],
  )

  const insertSlashCommand = useCallback(
    (command: SlashCommand) => {
      const textarea = textareaRef.current
      if (!textarea) return

      const cursorPos = textarea.selectionStart
      const beforeCursor = content.slice(0, cursorPos)
      const after = content.slice(cursorPos)
      const match = beforeCursor.match(/^\/([^\s/]{0,64})$/u)
      if (!match) return

      const token = `/${command.name} `
      const newContent = `${token}${after}`
      setContent(newContent)
      setSlashQuery(null)
      setSlashIndex(0)

      requestAnimationFrame(() => {
        textarea.focus()
        textarea.setSelectionRange(token.length, token.length)
      })
    },
    [content],
  )

  const handleSend = useCallback(async () => {
    const text = content.trim()
    if (!text && pendingFiles.length === 0 && selectedCommerceCards.length === 0) return

    setUploading(true)
    const mentionsToSend = mentionsForContent(text, selectedMentions)
    const metadataToSend =
      mentionsToSend.length > 0 || selectedCommerceCards.length > 0
        ? {
            ...(mentionsToSend.length > 0 ? { mentions: mentionsToSend } : {}),
            ...(selectedCommerceCards.length > 0 ? { commerceCards: selectedCommerceCards } : {}),
          }
        : undefined

    // Insert optimistic message immediately for text-only sends
    const currentUser = useAuthStore.getState().user
    const tempId = `temp-${Date.now()}`
    type MessagesPage = { messages: Record<string, unknown>[]; hasMore: boolean }

    if ((text || selectedCommerceCards.length > 0) && pendingFiles.length === 0) {
      const optimisticMsg = {
        id: tempId,
        content: text || '\u200B',
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
        metadata: metadataToSend,
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
    const savedMentions = mentionsToSend
    const savedCommerceCards = [...selectedCommerceCards]
    const savedMetadata = metadataToSend
    setContent('')
    setSelectedMentions([])
    setMentionQuery(null)
    setMentionTrigger(null)
    setPendingFiles([])
    setSelectedCommerceCards([])
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
            ...(savedMentions.length > 0 ? { mentions: savedMentions } : {}),
            ...(savedMetadata ? { metadata: savedMetadata } : {}),
            attachments: uploadedAttachments,
          }),
        })
      } else if (savedContent || savedCommerceCards.length > 0) {
        const sock = getSocket()
        const contentToSend = savedContent || '\u200B'
        if (sock.connected) {
          sendWsMessage({
            channelId,
            content: contentToSend,
            replyToId: savedReplyTo ?? undefined,
            mentions: savedMentions,
            metadata: savedMetadata,
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
              content: contentToSend,
              ...(savedReplyTo ? { replyToId: savedReplyTo } : {}),
              ...(savedMentions.length > 0 ? { mentions: savedMentions } : {}),
              ...(savedMetadata ? { metadata: savedMetadata } : {}),
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
  }, [
    channelId,
    content,
    pendingFiles,
    replyToId,
    selectedMentions,
    selectedCommerceCards,
    onClearReply,
    queryClient,
    clearDraft,
  ])

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
    const commerceSlashCommand = slashQuery?.trim().toLocaleLowerCase()
    if (
      slashQuery !== null &&
      (commerceSlashCommand === 'product' || commerceSlashCommand === 'shop') &&
      (e.key === 'Enter' || e.key === 'Tab')
    ) {
      e.preventDefault()
      const textarea = textareaRef.current
      const cursorPos = textarea?.selectionStart ?? content.length
      const beforeCursor = content.slice(0, cursorPos)
      const match = beforeCursor.match(/^\/(?:product|shop)$/iu)
      if (match) {
        openProductPickerFromComposer(0, cursorPos)
      } else {
        openProductPickerFromComposer()
      }
      return
    }

    // Handle slash command autocomplete navigation
    if (slashQuery !== null && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex((prev) => (prev + 1) % filteredSlashCommands.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex(
          (prev) => (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length,
        )
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const selected = filteredSlashCommands[slashIndex]
        if (selected) insertSlashCommand(selected)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlashQuery(null)
        setSlashIndex(0)
        return
      }
    }

    // Handle mention autocomplete navigation
    if (mentionQuery !== null && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((prev) => (prev + 1) % mentionSuggestions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex(
          (prev) => (prev - 1 + mentionSuggestions.length) % mentionSuggestions.length,
        )
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const selected = mentionSuggestions[mentionIndex]
        if (selected) insertMention(selected)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionQuery(null)
        setMentionTrigger(null)
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
    if (/(?:^|\s)\+$/u.test(beforeCursor)) {
      const next = `${value.slice(0, cursorPos - 1)}${value.slice(cursorPos)}`
      setContent(next)
      setSlashQuery(null)
      setSlashIndex(0)
      setMentionQuery(null)
      setMentionTrigger(null)
      setMentionIndex(0)
      setShowAttachMenu(true)
      scheduleSave(next)
      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(cursorPos - 1, cursorPos - 1)
      })
      return
    }
    const slashMatch = beforeCursor.match(/^\/([^\s/]{0,64})$/u)
    if (slashMatch) {
      setSlashQuery(slashMatch[1] ?? '')
      setSlashIndex(0)
      setMentionQuery(null)
      setMentionTrigger(null)
      setMentionIndex(0)
    } else {
      setSlashQuery(null)
      setSlashIndex(0)
    }

    const mentionMatch = beforeCursor.match(/(?:^|\s)([@#])([^\s@#]{0,128})$/u)
    if (!slashMatch && mentionMatch) {
      setMentionTrigger((mentionMatch[1] as MentionSuggestionTrigger | undefined) ?? '@')
      setMentionQuery(mentionMatch[2] ?? '')
      setMentionIndex(0)
    } else {
      setMentionQuery(null)
      setMentionTrigger(null)
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
    e.target.accept = ''
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
      {/* Slash command autocomplete popup */}
      {slashQuery !== null && filteredSlashCommands.length > 0 && (
        <div
          ref={slashListRef}
          className="absolute bottom-[calc(100%+8px)] left-4 right-4 bg-white/95 dark:bg-[#1A1D24]/95 backdrop-blur-2xl border border-black/5 dark:border-white/10 rounded-[16px] shadow-[0_12px_48px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.5)] py-2 px-1.5 max-h-[280px] overflow-y-auto z-50 flex flex-col gap-0.5 animate-in fade-in slide-in-from-bottom-2 duration-100"
        >
          <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted flex items-center gap-1.5">
            <CommandIcon size={13} />
            {t('chat.slashCommands')}
          </div>
          {filteredSlashCommands.map((command, i) => (
            <button
              key={`${command.agentId}:${command.name}`}
              type="button"
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2.5 text-left transition-colors rounded-[10px]',
                i === slashIndex
                  ? 'bg-black/5 dark:bg-white/10 text-text-primary'
                  : 'text-text-primary hover:bg-black/5 dark:hover:bg-white/10',
              )}
              onMouseEnter={() => setSlashIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                insertSlashCommand(command)
              }}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <CommandIcon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-[14px]">/{command.name}</span>
                <span className="block truncate text-xs text-text-muted">
                  {command.description ?? t('chat.slashCommandNoDescription')}
                </span>
              </span>
              <span className="hidden sm:flex items-center gap-1.5 max-w-[180px] text-xs text-text-muted">
                <Bot size={13} className="shrink-0" />
                <span className="truncate">
                  {t('chat.slashCommandFrom', {
                    name: command.botDisplayName ?? command.botUsername,
                  })}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {/* Mention/reference autocomplete popup */}
      {mentionQuery !== null && mentionSuggestions.length > 0 && (
        <div
          ref={mentionListRef}
          className="absolute bottom-[calc(100%+8px)] left-4 right-4 bg-white/95 dark:bg-[#1A1D24]/95 backdrop-blur-2xl border border-black/5 dark:border-white/10 rounded-[16px] shadow-[0_12px_48px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_48px_rgba(0,0,0,0.5)] py-2 px-1.5 max-h-[240px] overflow-y-auto z-50 flex flex-col gap-0.5 animate-in fade-in slide-in-from-bottom-2 duration-100"
        >
          {mentionSuggestions.map((suggestion, i) => (
            <button
              key={suggestion.id}
              type="button"
              className={cn(
                'flex items-center gap-2.5 w-full px-3 py-2 text-[14px] font-medium transition-colors rounded-[10px]',
                i === mentionIndex
                  ? 'bg-black/5 dark:bg-white/10 text-text-primary'
                  : 'text-text-primary hover:bg-black/5 dark:hover:bg-white/10',
              )}
              onMouseEnter={() => setMentionIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault() // prevent textarea blur
                insertMention(suggestion)
              }}
            >
              {suggestion.kind === 'user' || suggestion.kind === 'buddy' ? (
                <UserAvatar
                  userId={suggestion.userId}
                  avatarUrl={suggestion.avatarUrl}
                  displayName={suggestion.displayName ?? suggestion.username ?? suggestion.label}
                  size="sm"
                />
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  {suggestion.kind === 'channel' ? (
                    <Hash size={16} />
                  ) : suggestion.kind === 'server' ? (
                    <ServerIcon size={16} />
                  ) : (
                    <AtSign size={16} />
                  )}
                </span>
              )}
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate font-medium">{suggestion.label}</span>
                {suggestion.description && (
                  <span className="block truncate text-xs text-text-muted">
                    {suggestion.description}
                  </span>
                )}
              </span>
              {suggestion.isBot && (
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
      {(pendingFiles.length > 0 || selectedCommerceCards.length > 0) && (
        <div
          className={cn(
            'flex flex-wrap gap-2 bg-bg-secondary/80 rounded-[24px] border-b border-border-subtle px-4 py-3',
            replyToId ? '' : 'rounded-t-[40px]',
          )}
        >
          {selectedCommerceCards.map((card) => (
            <div
              key={card.id}
              className="relative flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-primary/75 px-3 py-2 pr-8 max-w-[260px]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <ShoppingBag size={17} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold text-text-primary">
                  {card.snapshot.name}
                </span>
                <span className="block text-[11px] text-text-muted">
                  {getCommerceCardPrice(card, t)}
                </span>
              </span>
              <Button
                variant="ghost"
                size="xs"
                className="absolute right-1 top-1 h-5 w-5 rounded-full p-0 text-text-muted"
                onClick={() => removeCommerceCard(card.id)}
                title={t('chat.removeProductCard')}
              >
                <X size={12} />
              </Button>
            </div>
          ))}
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
                <span className="absolute bottom-0.5 left-0.5 text-[8px] bg-primary/80 text-bg-deep px-1 py-0.5 rounded">
                  {t('chat.workspaceFileBadge')}
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

      <InputValley
        className={cn(
          'flex items-center gap-2 px-4 py-2',
          replyToId || pendingFiles.length > 0 || selectedCommerceCards.length > 0
            ? 'rounded-b-[20px]'
            : 'rounded-[20px]',
        )}
      >
        <div className="relative shrink-0 self-end mb-[3px]">
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-9 w-9', showAttachMenu && 'bg-primary/10 text-primary')}
            onClick={() => setShowAttachMenu((open) => !open)}
            title={t('chat.addMenu')}
            aria-label={t('chat.addMenu')}
          >
            <Plus size={20} />
          </Button>
          {showAttachMenu && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 cursor-default"
                aria-label={t('common.close')}
                onClick={() => setShowAttachMenu(false)}
              />
              <div className="absolute bottom-11 left-0 z-50 w-[280px] rounded-2xl border border-border-subtle bg-bg-primary p-2 shadow-2xl">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-bg-secondary"
                  onClick={() => openFileDialog()}
                >
                  <FileText size={18} className="text-primary" />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-text-primary">
                      {t('chat.uploadFile')}
                    </span>
                    <span className="block truncate text-xs text-text-muted">
                      {t('chat.addMenuUploadFileDesc')}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-bg-secondary"
                  onClick={() => openFileDialog('image/*')}
                >
                  <ImageIcon size={18} className="text-primary" />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-text-primary">
                      {t('chat.uploadImage')}
                    </span>
                    <span className="block truncate text-xs text-text-muted">
                      {t('chat.addMenuUploadImageDesc')}
                    </span>
                  </span>
                </button>
                {activeServerId && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-bg-secondary"
                    onClick={openWorkspacePicker}
                  >
                    <FolderOpen size={18} className="text-primary" />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-text-primary">
                        {t('chat.selectWorkspaceFile')}
                      </span>
                      <span className="block truncate text-xs text-text-muted">
                        {t('chat.addMenuWorkspaceFileDesc')}
                      </span>
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-bg-secondary"
                  onClick={() => {
                    setShowAttachMenu(false)
                    setShowProductPicker(true)
                  }}
                >
                  <ShoppingBag size={18} className="text-primary" />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-text-primary">
                      {t('chat.productPicker')}
                    </span>
                    <span className="block truncate text-xs text-text-muted">
                      {t('chat.addMenuProductDesc')}
                    </span>
                  </span>
                </button>
              </div>
            </>
          )}
        </div>

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
          autoFocus
          className="flex-1 bg-transparent text-text-primary placeholder:text-text-muted outline-none resize-none text-[15px] leading-[24px] max-h-[50vh] min-h-[24px] py-[7px]"
        />

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
          className="h-9 w-9 rounded-full shrink-0 self-end mb-0.5 disabled:opacity-30 transition-all duration-300 bg-primary hover:bg-primary-strong text-white border-none shadow-none flex items-center justify-center"
          onClick={handleSend}
          disabled={
            (!content.trim() && pendingFiles.length === 0 && selectedCommerceCards.length === 0) ||
            uploading
          }
        >
          <Send size={16} className="text-white" />
        </Button>
      </InputValley>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {showWorkspacePicker && activeServerId && (
        <WorkspaceFilePicker
          serverId={activeServerId}
          mode="select-file"
          title={t('chat.selectWorkspaceFileTitle')}
          onConfirm={handleWorkspaceFileSelect}
          onClose={() => setShowWorkspacePicker(false)}
        />
      )}

      {showProductPicker && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/30 px-4 pb-6 pt-20 sm:items-center">
          <div className="w-full max-w-lg rounded-2xl border border-border-subtle bg-bg-primary shadow-2xl">
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-bold text-text-primary">
                <ShoppingBag size={18} className="text-primary" />
                {t('chat.productPicker')}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowProductPicker(false)}
              >
                <X size={16} />
              </Button>
            </div>
            <div className="border-b border-border-subtle p-3">
              <label className="flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-secondary px-3 py-2 text-sm text-text-primary">
                <Search size={16} className="text-text-muted" />
                <input
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  placeholder={t('chat.productPickerSearch')}
                  className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-text-muted"
                  autoFocus
                />
              </label>
            </div>
            <div className="max-h-[420px] overflow-y-auto p-2">
              {isFetchingProducts ? (
                <div className="px-4 py-8 text-center text-sm text-text-muted">
                  {t('chat.productPickerLoading')}
                </div>
              ) : productCards.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-text-muted">
                  {t('chat.productPickerEmpty')}
                </div>
              ) : (
                productPickerGroups.map((group) => (
                  <div key={group.key} className="py-1">
                    <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
                      <ShoppingBag size={13} />
                      <span>{t(group.labelKey)}</span>
                      {group.shopName && (
                        <span className="min-w-0 truncate normal-case tracking-normal">
                          {group.shopName}
                        </span>
                      )}
                    </div>
                    {group.cards.map((card) => (
                      <button
                        key={card.id}
                        type="button"
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-bg-secondary"
                        onClick={() => addCommerceCard(card)}
                      >
                        {card.snapshot.imageUrl ? (
                          <img
                            src={card.snapshot.imageUrl}
                            alt=""
                            className="h-12 w-12 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                            <ShoppingBag size={20} />
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-text-primary">
                            {card.snapshot.name}
                          </span>
                          {card.snapshot.summary && (
                            <span className="block truncate text-xs text-text-muted">
                              {card.snapshot.summary}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-sm font-bold text-primary">
                          {getCommerceCardPrice(card, t)}
                        </span>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
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
