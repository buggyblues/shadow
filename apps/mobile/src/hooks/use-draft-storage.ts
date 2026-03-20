import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useRef, useState } from 'react'

const DRAFT_KEY_PREFIX = 'shadow:draft:'
const DRAFT_EXPIRY_DAYS = 7

interface PendingFile {
  uri: string
  name: string
  type: string
  size?: number
}

interface DraftData {
  text: string
  pendingFiles: PendingFile[]
  timestamp: number
}

function getDraftKey(channelId: string): string {
  return `${DRAFT_KEY_PREFIX}${channelId}`
}

function isDraftExpired(timestamp: number): boolean {
  const expiryTime = DRAFT_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  return Date.now() - timestamp > expiryTime
}

export async function loadDraft(channelId: string): Promise<DraftData | null> {
  try {
    const key = getDraftKey(channelId)
    const stored = await AsyncStorage.getItem(key)
    if (!stored) return null

    const data = JSON.parse(stored) as DraftData
    if (isDraftExpired(data.timestamp)) {
      await AsyncStorage.removeItem(key)
      return null
    }
    return data
  } catch {
    return null
  }
}

export async function saveDraft(
  channelId: string,
  text: string,
  pendingFiles: PendingFile[] = [],
): Promise<void> {
  try {
    const key = getDraftKey(channelId)
    if (!text.trim() && pendingFiles.length === 0) {
      await AsyncStorage.removeItem(key)
      return
    }
    const data: DraftData = {
      text,
      pendingFiles,
      timestamp: Date.now(),
    }
    await AsyncStorage.setItem(key, JSON.stringify(data))
  } catch {
    // Ignore storage errors
  }
}

export async function clearDraft(channelId: string): Promise<void> {
  try {
    const key = getDraftKey(channelId)
    await AsyncStorage.removeItem(key)
  } catch {
    // Ignore
  }
}

export function useDraftStorage(channelId: string | null) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [restoredDraft, setRestoredDraft] = useState<DraftData | null>(null)
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!channelId || hasLoadedRef.current) return

    loadDraft(channelId).then((draft) => {
      if (draft) {
        setRestoredDraft(draft)
      }
      hasLoadedRef.current = true
    })

    return () => {
      hasLoadedRef.current = false
    }
  }, [channelId])

  const scheduleSave = useCallback(
    (text: string, pendingFiles: PendingFile[] = []) => {
      if (!channelId) return
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
      saveTimerRef.current = setTimeout(() => {
        saveDraft(channelId, text, pendingFiles)
      }, 500)
    },
    [channelId],
  )

  const clear = useCallback(() => {
    if (!channelId) return
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    clearDraft(channelId)
    setRestoredDraft(null)
  }, [channelId])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  return {
    restoredDraft,
    scheduleSave,
    clear,
    loadDraft: () => loadDraft(channelId || ''),
    saveDraft: (text: string, pendingFiles?: PendingFile[]) =>
      saveDraft(channelId || '', text, pendingFiles),
  }
}
