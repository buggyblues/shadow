import type { CSSProperties } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

const MESSAGE_ACTIONS_ACTIVE_EVENT = 'shadow:message-actions-active'

type MessageActionsActiveEvent = CustomEvent<{ messageId: string }>

export function useMessageFloatingActions(messageId: string, canShowActions: boolean) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showFullPicker, setShowFullPicker] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const messageRef = useRef<HTMLDivElement>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showActions = isHovered && canShowActions

  const closeFloatingActions = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setIsHovered(false)
    setShowEmojiPicker(false)
    setShowFullPicker(false)
    setShowMoreMenu(false)
  }, [])

  const closeMoreMenu = useCallback(() => {
    setShowMoreMenu(false)
  }, [])

  useEffect(() => {
    if (!showActions && !showEmojiPicker && !showFullPicker && !showMoreMenu) return
    const scrollParent = messageRef.current?.closest(
      '[class*="overflow-y-auto"]',
    ) as HTMLElement | null
    if (!scrollParent) return
    const handleScroll = () => closeFloatingActions()
    scrollParent.addEventListener('scroll', handleScroll, { passive: true })
    return () => scrollParent.removeEventListener('scroll', handleScroll)
  }, [closeFloatingActions, showActions, showEmojiPicker, showFullPicker, showMoreMenu])

  useEffect(() => {
    if (canShowActions) return
    closeFloatingActions()
  }, [canShowActions, closeFloatingActions])

  useEffect(() => {
    const handleActiveMessageActions = (event: Event) => {
      const activeMessageId = (event as MessageActionsActiveEvent).detail?.messageId
      if (!activeMessageId || activeMessageId === messageId) return
      closeFloatingActions()
    }
    window.addEventListener(MESSAGE_ACTIONS_ACTIVE_EVENT, handleActiveMessageActions)
    return () => {
      window.removeEventListener(MESSAGE_ACTIONS_ACTIVE_EVENT, handleActiveMessageActions)
    }
  }, [closeFloatingActions, messageId])

  useEffect(() => {
    if (!showActions && !showEmojiPicker && !showFullPicker && !showMoreMenu) return
    const handleDocumentMouseLeave = (event: MouseEvent) => {
      if (!event.relatedTarget) closeFloatingActions()
    }
    window.addEventListener('blur', closeFloatingActions)
    document.addEventListener('mouseleave', handleDocumentMouseLeave)
    return () => {
      window.removeEventListener('blur', closeFloatingActions)
      document.removeEventListener('mouseleave', handleDocumentMouseLeave)
    }
  }, [closeFloatingActions, showActions, showEmojiPicker, showFullPicker, showMoreMenu])

  useEffect(() => {
    if (!showActions && !showEmojiPicker && !showFullPicker && !showMoreMenu) return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        closeFloatingActions()
        return
      }
      if (messageRef.current?.contains(target)) return
      if (
        target instanceof HTMLElement &&
        target.closest('[data-message-actions-floating="true"]')
      ) {
        return
      }
      closeFloatingActions()
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [closeFloatingActions, showActions, showEmojiPicker, showFullPicker, showMoreMenu])

  const activateHover = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    window.dispatchEvent(new CustomEvent(MESSAGE_ACTIONS_ACTIVE_EVENT, { detail: { messageId } }))
    setIsHovered(true)
  }, [messageId])

  const deactivateHover = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
    hoverTimeoutRef.current = setTimeout(() => {
      closeFloatingActions()
    }, 150)
  }, [closeFloatingActions])

  const getFloatingControlsStyle = useCallback(
    (offsetTop: number, estimatedWidth: number): CSSProperties | null => {
      if (typeof window === 'undefined') return null
      const rect = messageRef.current?.getBoundingClientRect()
      if (!rect) return null

      const floatingBounds = messageRef.current
        ?.closest('.chat-scroll-surface, .chat-panel')
        ?.getBoundingClientRect()
      const bounds = floatingBounds ?? {
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
        left: 0,
      }
      const minTop = bounds.top + 8
      const maxTop = Math.max(minTop, bounds.bottom - 56)
      const minLeft = bounds.left + 8
      const maxLeft = Math.max(minLeft, bounds.right - estimatedWidth - 8)
      const desiredLeft = rect.right - estimatedWidth - 16

      return {
        top: Math.min(Math.max(minTop, rect.top - offsetTop), maxTop),
        left: Math.min(Math.max(minLeft, desiredLeft), maxLeft),
      }
    },
    [],
  )

  const handleTouchStart = useCallback(() => {
    longPressTimerRef.current = setTimeout(() => {
      activateHover()
    }, 500)
  }, [activateHover])

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  return {
    activateHover,
    clearLongPress,
    closeMoreMenu,
    deactivateHover,
    getFloatingControlsStyle,
    handleTouchStart,
    messageRef,
    setShowEmojiPicker,
    setShowFullPicker,
    setShowMoreMenu,
    showActions,
    showEmojiPicker,
    showFullPicker,
    showMoreMenu,
  }
}
