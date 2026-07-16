export function readSearchParam(key: string) {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(key)
}

export function writeSearchParams(patch: Record<string, number | string | null | undefined>) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  Object.entries(patch).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      url.searchParams.delete(key)
      return
    }
    url.searchParams.set(key, String(value))
  })
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}
