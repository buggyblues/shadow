import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useRef } from 'react'

const DRAFT_KEY_PREFIX = 'shadow:draft:'
const DRAFT_EXPIRY_DAYS = 7

interface DraftData {
  text: string
  timestamp: number
}

/**
 * Get the AsyncStorage key for a channel
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
 * Load draft from AsyncStorage
 */
export async function loadDraft(channelId: string): Promise<string | null> {
  try {
    const key = getDraftKey(channelId)
    const stored = await AsyncStorage.getItem(key)
    if (!stored) return null

    const data = JSON.parse(stored) as DraftData
    if (isDraftExpired(data.timestamp)) {
      await AsyncStorage.removeItem(key)
      return null
    }
    return data.text
  } catch {
    return null
  }
}

/**
 * Save draft to AsyncStorage
 */
export async function saveDraft(channelId: string, text: string): Promise<void> {
  try {
    const key = getDraftKey(channelId)
    if (!text.trim()) {
      await AsyncStorage.removeItem(key)
      return
    }
    const data: DraftData = {
      text,
      timestamp: Date.now(),
    }
    await AsyncStorage.setItem(key, JSON.stringify(data))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clear draft from AsyncStorage
 */
export async function clearDraft(channelId: string): Promise<void> {
  try {
    const key = getDraftKey(channelId)
    await AsyncStorage.removeItem(key)
  } catch {
    // Ignore
  }
}

/**
 * Hook to manage draft storage with auto-save
 */
export function useDraftStorage(channelId: string | null, onRestore?: (text: string) => void) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Restore draft on mount
  useEffect(() => {
    if (!channelId) return
    loadDraft(channelId).then((draft) => {
      if (draft && onRestore) {
        onRestore(draft)
      }
    })
  }, [channelId, onRestore])

  // Debounced save function
  const scheduleSave = useCallback(
    (text: string) => {
      if (!channelId) return
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
    if (!channelId) return
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
    loadDraft: () => loadDraft(channelId || ''),
    saveDraft: (text: string) => saveDraft(channelId || '', text),
  }
}
