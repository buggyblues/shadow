import { useEffect, useState } from 'react'

export function useDeferredQueryEnabled({
  enabled = true,
  delayMs = 3500,
}: {
  enabled?: boolean
  delayMs?: number
} = {}) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setReady(false)
      return
    }

    const id = window.setTimeout(() => setReady(true), delayMs)
    return () => window.clearTimeout(id)
  }, [delayMs, enabled])

  return ready
}
