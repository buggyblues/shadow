import { useEffect, useMemo, useRef } from 'react'
import { PanResponder, type TextInput } from 'react-native'
import { spacing } from '../../../theme'

export function useHomeCommandCenter({
  showCommandCenter,
  setShowCommandCenter,
  homeCommandPaletteRequestId,
  setPendingAction,
}: {
  showCommandCenter: boolean
  setShowCommandCenter: (open: boolean) => void
  homeCommandPaletteRequestId: number
  setPendingAction: (action: string | null) => void
}) {
  const handledRequestIdRef = useRef(0)
  const searchInputRef = useRef<TextInput>(null)

  useEffect(() => {
    if (homeCommandPaletteRequestId <= handledRequestIdRef.current) return
    handledRequestIdRef.current = homeCommandPaletteRequestId
    setShowCommandCenter(true)
    setPendingAction(null)
  }, [homeCommandPaletteRequestId, setPendingAction, setShowCommandCenter])

  useEffect(() => {
    if (!showCommandCenter) return

    const frame = requestAnimationFrame(() => {
      searchInputRef.current?.focus()
    })
    const timers = [80, 220, 420].map((delay) =>
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, delay),
    )

    return () => {
      cancelAnimationFrame(frame)
      timers.forEach(clearTimeout)
    }
  }, [showCommandCenter])

  const dismissPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          showCommandCenter &&
          gesture.dy > spacing.sm &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > spacing['2xl']) {
            setShowCommandCenter(false)
          }
        },
      }),
    [setShowCommandCenter, showCommandCenter],
  )

  return {
    commandSearchInputRef: searchInputRef,
    commandDismissPanResponder: dismissPanResponder,
  }
}
