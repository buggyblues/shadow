import { useEffect } from 'react'

export function applyWebsiteDarkTheme() {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  root.classList.add('dark')
  root.classList.remove('light')
  root.style.colorScheme = 'dark'
}

export function useWebsiteTheme() {
  useEffect(() => {
    applyWebsiteDarkTheme()

    const root = document.documentElement
    const observer = new MutationObserver(() => {
      if (root.classList.contains('dark') && !root.classList.contains('light')) return
      applyWebsiteDarkTheme()
    })
    observer.observe(root, { attributeFilter: ['class'] })

    return () => observer.disconnect()
  }, [])
}
