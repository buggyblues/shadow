export function cardDetailHref(cardId: string, windowRef?: Window | null) {
  const encodedCardId = encodeURIComponent(cardId)
  const win = windowRef ?? (typeof window === 'undefined' ? null : window)
  if (!win) return `#/cards/${encodedCardId}`
  const scope = cardScopeQuery(win)
  return `${win.location.origin}${win.location.pathname}#/cards/${encodedCardId}${
    scope ? `?${scope}` : ''
  }`
}

export async function copyCardDetailLink(cardId: string, windowRef?: Window | null) {
  const win = windowRef ?? (typeof window === 'undefined' ? null : window)
  if (!win) throw new Error('clipboard_unavailable')
  const href = cardDetailHref(cardId, win)
  const clipboard = win.navigator.clipboard
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(href)
      return
    } catch {
      // Embedded iframes can deny the async Clipboard API through Permissions Policy.
    }
  }
  if (copyTextWithTextarea(href, win)) return
  throw new Error('clipboard_unavailable')
}

function cardScopeQuery(win: Window) {
  const search = new URLSearchParams(win.location.search)
  const hashQuery = win.location.hash.includes('?')
    ? new URLSearchParams(win.location.hash.slice(win.location.hash.indexOf('?') + 1))
    : null
  const params = new URLSearchParams()
  for (const key of ['projectId', 'boardId']) {
    const value = search.get(key) ?? hashQuery?.get(key)
    if (value) params.set(key, value)
  }
  return params.toString()
}

function copyTextWithTextarea(text: string, win: Window) {
  const doc = win.document
  if (!doc?.body) return false
  const activeElement = doc.activeElement instanceof HTMLElement ? doc.activeElement : null
  const selection = win.getSelection()
  const ranges =
    selection && selection.rangeCount > 0
      ? Array.from({ length: selection.rangeCount }, (_item, index) => selection.getRangeAt(index))
      : []
  const textarea = doc.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.inset = '0 auto auto -9999px'
  textarea.style.width = '1px'
  textarea.style.height = '1px'
  textarea.style.opacity = '0'
  doc.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, text.length)
  let copied = false
  try {
    copied = doc.execCommand('copy')
  } catch {
    copied = false
  } finally {
    textarea.remove()
    if (selection) {
      selection.removeAllRanges()
      for (const range of ranges) selection.addRange(range)
    }
    activeElement?.focus({ preventScroll: true })
  }
  return copied
}
