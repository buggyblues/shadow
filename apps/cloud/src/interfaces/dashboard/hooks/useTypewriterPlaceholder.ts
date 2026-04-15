import { useEffect, useState } from 'react'

const TYPING_SPEED = 45
const PAUSE_AFTER_TYPE = 1800
const ERASE_SPEED = 22
const PAUSE_AFTER_ERASE = 400

export function useTypewriterPlaceholder(phrases: string[]): string {
  const [display, setDisplay] = useState(phrases[0] ?? '')

  useEffect(() => {
    if (phrases.length === 0) return

    let phraseIndex = 0
    let charIndex = display.length
    let isErasing = false
    let timeoutId: ReturnType<typeof setTimeout>

    function tick() {
      const current = phrases[phraseIndex] ?? ''

      if (!isErasing) {
        if (charIndex < current.length) {
          charIndex++
          setDisplay(current.slice(0, charIndex))
          timeoutId = setTimeout(tick, TYPING_SPEED)
        } else {
          isErasing = true
          timeoutId = setTimeout(tick, PAUSE_AFTER_TYPE)
        }
      } else {
        if (charIndex > 0) {
          charIndex--
          setDisplay(current.slice(0, charIndex))
          timeoutId = setTimeout(tick, ERASE_SPEED)
        } else {
          isErasing = false
          phraseIndex = (phraseIndex + 1) % phrases.length
          charIndex = 0
          timeoutId = setTimeout(tick, PAUSE_AFTER_ERASE)
        }
      }
    }

    timeoutId = setTimeout(tick, PAUSE_AFTER_TYPE)
    return () => clearTimeout(timeoutId)
    // Only run on mount — phrases array is stable i18n data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return display
}
