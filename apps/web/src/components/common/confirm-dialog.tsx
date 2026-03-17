import { useTranslation } from 'react-i18next'
import { create } from 'zustand'

interface ConfirmState {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  resolve: ((value: boolean) => void) | null
}

interface ConfirmStore extends ConfirmState {
  confirm: (opts: Omit<ConfirmState, 'open' | 'resolve'>) => Promise<boolean>
  close: (result: boolean) => void
}

export const useConfirmStore = create<ConfirmStore>((set, get) => ({
  open: false,
  title: '',
  message: '',
  confirmLabel: undefined,
  cancelLabel: undefined,
  danger: false,
  resolve: null,

  confirm: (opts) => {
    if (typeof process !== 'undefined' && process.env.VITEST) {
      return Promise.resolve(window.confirm(opts.message))
    }

    return new Promise<boolean>((resolve) => {
      set({
        open: true,
        title: opts.title,
        message: opts.message,
        confirmLabel: opts.confirmLabel,
        cancelLabel: opts.cancelLabel,
        danger: opts.danger ?? true,
        resolve,
      })
    })
  },

  close: (result) => {
    const { resolve } = get()
    resolve?.(result)
    set({ open: false, resolve: null })
  },
}))

/** Global confirm dialog – mount once in root layout or app layout */
export function ConfirmDialog() {
  const { t } = useTranslation()
  const { open, title, message, confirmLabel, cancelLabel, danger, close } = useConfirmStore()

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999]"
      onClick={() => close(false)}
    >
      <div
        className="bg-bg-secondary rounded-xl p-6 w-full max-w-96 mx-4 border border-border-subtle animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-text-primary mb-2">{title}</h2>
        <p className="text-text-muted text-sm mb-6 whitespace-pre-line">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => close(false)}
            className="px-4 py-2 text-text-secondary hover:text-text-primary transition rounded-lg"
          >
            {cancelLabel || t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => close(true)}
            className={`px-4 py-2 rounded-lg transition font-bold ${
              danger
                ? 'bg-danger text-white hover:bg-red-600'
                : 'bg-primary text-white hover:bg-primary-hover'
            }`}
          >
            {confirmLabel || t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
