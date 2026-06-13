export type ToastType = 'error' | 'success' | 'info'

export interface ToastPayload {
  id: string
  message: string
  type: ToastType
}

type ToastListener = (toast: ToastPayload) => void

const listeners = new Set<ToastListener>()
let toastSequence = 0

export function subscribeToast(listener: ToastListener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function showToast(message: string, type: ToastType = 'info') {
  const toast: ToastPayload = {
    id: `toast-${Date.now()}-${toastSequence++}`,
    message,
    type,
  }

  for (const listener of listeners) listener(toast)
}
