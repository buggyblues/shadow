/**
 * i18n-aware toast hook.
 * Wraps showToast with useTranslation so components can pass translation keys
 * instead of hardcoded strings.
 */
import { useTranslation } from 'react-i18next'
import { showToast, type ToastType } from '../lib/toast'

/** Return type: a function that accepts a translation key and shows a toast. */
export type UseToastFn = (messageKey: string, type?: ToastType) => void

/**
 * Hook that returns a toast function bound to the current i18n context.
 *
 * Usage:
 * ```tsx
 * const toast = useToast()
 * toast('toast.success.saved', 'success')
 * ```
 */
export function useToast(): UseToastFn {
  const { t } = useTranslation()

  return (messageKey: string, type: ToastType = 'info') => {
    const message = t(messageKey, messageKey) // fallback to key itself if missing
    showToast(message, type)
  }
}
