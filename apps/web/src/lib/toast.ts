/**
 * Simple toast notification system for displaying temporary feedback messages.
 * Uses DOM manipulation to avoid React re-render overhead.
 */

export type ToastType = 'error' | 'success' | 'info'

type ToastHook = (message: string, type?: ToastType) => void

const TOAST_DURATION = 3500
const TOAST_CONTAINER_ID = '__shadow_toast_container'

function getOrCreateContainer(): HTMLElement {
  let container = document.getElementById(TOAST_CONTAINER_ID)
  if (!container) {
    container = document.createElement('div')
    container.id = TOAST_CONTAINER_ID
    container.style.cssText =
      'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;max-width:90vw;'
    document.body.appendChild(container)
  }
  return container
}

const COLORS: Record<ToastType, { bg: string; border: string; text: string }> = {
  error: { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B' },
  success: { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534' },
  info: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1E40AF' },
}

export function showToast(message: string, type: ToastType = 'info') {
  const testToastHook = (globalThis as { __SHADOW_SHOW_TOAST_MOCK__?: ToastHook })
    .__SHADOW_SHOW_TOAST_MOCK__
  if (testToastHook) {
    testToastHook(message, type)
    return
  }
  const container = getOrCreateContainer()
  const colors = COLORS[type]

  const el = document.createElement('div')
  el.style.cssText = `
    padding:10px 20px;border-radius:12px;font-size:13px;font-weight:600;
    background:${colors.bg};border:1px solid ${colors.border};color:${colors.text};
    box-shadow:0 4px 12px rgba(0,0,0,0.08);pointer-events:auto;
    opacity:0;transform:translateY(-8px);transition:all 0.3s ease;
    max-width:380px;word-break:break-word;line-height:1.5;
  `
  el.textContent = message
  container.appendChild(el)

  // Animate in
  requestAnimationFrame(() => {
    el.style.opacity = '1'
    el.style.transform = 'translateY(0)'
  })

  // Animate out and remove
  setTimeout(() => {
    el.style.opacity = '0'
    el.style.transform = 'translateY(-8px)'
    setTimeout(() => el.remove(), 300)
  }, TOAST_DURATION)
}

/**
 * Factory function that creates an i18n-aware toast function.
 * Useful outside of React component context (e.g. in services, utilities,
 * or after fetching the i18n instance).
 *
 * Usage:
 * ```ts
 * import { i18n } from './i18n'
 * const toast = createI18nToast(i18n)
 * toast('toast.error.network', 'error')
 * ```
 */
export function createI18nToast(t: (key: string) => string) {
  return (messageKey: string, type: ToastType = 'info') => {
    const message = t(messageKey)
    showToast(message, type)
  }
}
