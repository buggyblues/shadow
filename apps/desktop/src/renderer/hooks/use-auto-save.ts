import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Generic debounced auto-save hook.
 * Tracks dirty state and triggers a save callback after `delay` ms of inactivity.
 *
 * @param saveFn - async function that performs the save
 * @param delay - debounce delay in ms (default 1500)
 */
export function useAutoSave(saveFn: () => Promise<void>, delay = 1500) {
  const [autoSaveStatus, setAutoSaveStatus] = useState<
    'idle' | 'pending' | 'saving' | 'saved' | 'error'
  >('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveFnRef = useRef(saveFn)
  saveFnRef.current = saveFn

  const scheduleAutoSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setAutoSaveStatus('pending')
    timerRef.current = setTimeout(async () => {
      setAutoSaveStatus('saving')
      try {
        await saveFnRef.current()
        setAutoSaveStatus('saved')
        // Reset to idle after a brief "saved" indicator
        setTimeout(() => setAutoSaveStatus('idle'), 2000)
      } catch {
        setAutoSaveStatus('error')
        setTimeout(() => setAutoSaveStatus('idle'), 3000)
      }
    }, delay)
  }, [delay])

  const cancelAutoSave = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setAutoSaveStatus('idle')
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { autoSaveStatus, scheduleAutoSave, cancelAutoSave }
}
