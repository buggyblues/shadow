import { useCallback, useEffect, useState } from 'react'

export function useActionNotice(timeoutMs = 2200) {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!message) return undefined
    const timer = window.setTimeout(() => setMessage(null), timeoutMs)
    return () => window.clearTimeout(timer)
  }, [message, timeoutMs])

  const showNotice = useCallback((nextMessage: string) => {
    setMessage(nextMessage)
  }, [])

  return { message, showNotice }
}
