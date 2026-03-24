import { showToast } from './toast'

/**
 * Copy text to clipboard with fallback support.
 * Tries modern Clipboard API first, falls back to legacy execCommand.
 * Shows toast notification on success (unless silent is true).
 */
export async function copyToClipboard(
  text: string,
  options: { silent?: boolean; successMessage?: string } = {},
): Promise<boolean> {
  const { silent = false, successMessage = 'Copied to clipboard' } = options

  try {
    // Try modern Clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      if (!silent) {
        showToast(successMessage, 'success')
      }
      return true
    }
  } catch {
    // Fallback to legacy method
  }

  // Fallback: use execCommand (works in non-secure contexts)
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '-9999px'
    textarea.setAttribute('readonly', '')
    document.body.appendChild(textarea)

    textarea.select()
    textarea.setSelectionRange(0, text.length)

    const success = document.execCommand('copy')
    document.body.removeChild(textarea)

    if (success) {
      if (!silent) {
        showToast(successMessage, 'success')
      }
      return true
    }
  } catch {
    // Ignore fallback errors
  }

  // All methods failed
  if (!silent) {
    showToast('Failed to copy to clipboard', 'error')
  }
  return false
}

/**
 * Copy text to clipboard silently (no toast).
 * Returns true if successful, false otherwise.
 */
export async function copyToClipboardSilent(text: string): Promise<boolean> {
  return copyToClipboard(text, { silent: true })
}
