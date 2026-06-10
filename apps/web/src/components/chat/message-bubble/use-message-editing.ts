import type { TFunction } from 'i18next'
import { useCallback, useRef, useState } from 'react'
import { fetchApi } from '../../../lib/api'
import { copyToClipboard } from '../../../lib/clipboard'
import { useConfirmStore } from '../../common/confirm-dialog'
import type { Message } from './types'

interface UseMessageEditingArgs {
  deleteApi?: (messageId: string) => Promise<void>
  editApi?: (messageId: string, content: string) => Promise<Message>
  message: Message
  onCloseMoreMenu: () => void
  onMessageDelete?: (messageId: string) => void
  onMessageUpdate?: (message: Message) => void
  t: TFunction
}

export function useMessageEditing({
  deleteApi,
  editApi,
  message,
  onCloseMoreMenu,
  onMessageDelete,
  onMessageUpdate,
  t,
}: UseMessageEditingArgs) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [copied, setCopied] = useState(false)
  const editInputRef = useRef<HTMLTextAreaElement>(null)

  const handleEditContentChange = useCallback((value: string) => {
    setEditContent(value)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false)
  }, [])

  const handleEdit = useCallback(() => {
    setEditContent(message.content)
    setIsEditing(true)
    onCloseMoreMenu()
    setTimeout(() => editInputRef.current?.focus(), 50)
  }, [message.content, onCloseMoreMenu])

  const handleSaveEdit = useCallback(async () => {
    if (!editContent.trim() || editContent.trim() === message.content) {
      setIsEditing(false)
      return
    }
    try {
      const updated = editApi
        ? await editApi(message.id, editContent.trim())
        : await fetchApi<Message>(`/api/messages/${message.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ content: editContent.trim() }),
          })
      onMessageUpdate?.(updated)
      setIsEditing(false)
    } catch {
      /* keep editing on error */
    }
  }, [editApi, editContent, message.content, message.id, onMessageUpdate])

  const handleDelete = useCallback(async () => {
    onCloseMoreMenu()
    const ok = await useConfirmStore.getState().confirm({
      title: t('chat.deleteMessage'),
      message: t('chat.deleteConfirm'),
    })
    if (!ok) return
    try {
      if (deleteApi) {
        await deleteApi(message.id)
      } else {
        await fetchApi(`/api/messages/${message.id}`, { method: 'DELETE' })
      }
      onMessageDelete?.(message.id)
    } catch {
      /* ignore */
    }
  }, [deleteApi, message.id, onCloseMoreMenu, onMessageDelete, t])

  const markCopied = useCallback(() => {
    setCopied(true)
    onCloseMoreMenu()
    setTimeout(() => setCopied(false), 2000)
  }, [onCloseMoreMenu])

  const handleCopy = useCallback(async () => {
    const didCopy = await copyToClipboard(message.content, {
      successMessage: t('common.copied'),
      errorMessage: t('chat.copyFailed'),
    })
    if (didCopy) markCopied()
  }, [markCopied, message.content, t])

  const handleShareLink = useCallback(async () => {
    const url = `${window.location.origin}${window.location.pathname}?msg=${message.id}`
    const didCopy = await copyToClipboard(url, {
      successMessage: t('common.copied'),
      errorMessage: t('chat.copyFailed'),
    })
    if (didCopy) markCopied()
  }, [markCopied, message.id, t])

  return {
    copied,
    editContent,
    editInputRef,
    handleCancelEdit,
    handleCopy,
    handleDelete,
    handleEdit,
    handleEditContentChange,
    handleSaveEdit,
    handleShareLink,
    isEditing,
  }
}
