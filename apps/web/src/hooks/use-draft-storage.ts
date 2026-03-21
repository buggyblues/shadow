import { useCallback, useEffect, useRef } from 'react'

const DRAFT_KEY_PREFIX = 'shadow:draft:'
const DRAFT_EXPIRY_DAYS = 7

interface DraftData {
  text: string
  timestamp: number
}

/**
 * Get the localStorage key for a channel
 */
function getDraftKey(channelId: string): string {
  return `${DRAFT_KEY_PREFIX}${channelId}`
}

/**
 * Check if draft is expired
 */
function isDraftExpired(timestamp: number): boolean {
  const expiryTime = DRAFT_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  return Date.now() - timestamp > expiryTime
}

/**
 * Load draft from localStorage
 */
export function loadDraft(channelId: string): string | null {
  try {
    const key = getDraftKey(channelId)
    const stored = localStorage.getItem(key)
    if (!stored) return null

    const data = JSON.parse(stored) as DraftData
    if (isDraftExpired(data.timestamp)) {
      localStorage.removeItem(key)
      return null
    }
    return data.text
  } catch {
    return null
  }
}

/**
 * Save draft to localStorage
 */
export function saveDraft(channelId: string, text: string): void {
  try {
    const key = getDraftKey(channelId)
    if (!text.trim()) {
      localStorage.removeItem(key)
      return
    }
    const data: DraftData = {
      text,
      timestamp: Date.now(),
    }
    localStorage.setItem(key, JSON.stringify(data))
  } catch {
    // Ignore storage errors (e.g., quota exceeded)
  }
}

/**
 * Clear draft from localStorage
 */
export function clearDraft(channelId: string): void {
  try {
    const key = getDraftKey(channelId)
    localStorage.removeItem(key)
  } catch {
    // Ignore
  }
}

/**
 * Hook to manage draft storage with auto-save
 */
export function useDraftStorage(channelId: string, onRestore?: (text: string) => void) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onRestoreRef = useRef(onRestore)
  onRestoreRef.current = onRestore

  // Restore draft when channelId changes (not when callback ref changes)
  useEffect(() => {
    if (!channelId) return
    const draft = loadDraft(channelId)
    if (draft && onRestoreRef.current) {
      onRestoreRef.current(draft)
    }
  }, [channelId])

  // Debounced save function
  const scheduleSave = useCallback(
    (text: string) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
      saveTimerRef.current = setTimeout(() => {
        saveDraft(channelId, text)
      }, 500)
    },
    [channelId],
  )

  // Clear draft immediately
  const clear = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    clearDraft(channelId)
  }, [channelId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  return {
    scheduleSave,
    clear,
    loadDraft: () => loadDraft(channelId),
    saveDraft: (text: string) => saveDraft(channelId, text),
  }
}
