import {
  Button,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@shadowob/ui'
import { AlertTriangle } from 'lucide-react'
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

  return (
    <Modal open={open} onClose={() => close(false)}>
      <ModalContent maxWidth="max-w-96">
        <ModalHeader
          overline={t('common.confirm', '确认')}
          icon={<AlertTriangle size={18} strokeWidth={2.4} />}
          title={title}
          closeLabel={t('common.close', '关闭')}
        />
        <ModalBody className="py-5">
          <p className="whitespace-pre-line text-sm font-medium text-text-muted">{message}</p>
        </ModalBody>
        <ModalFooter>
          <ModalButtonGroup>
            <Button variant="ghost" size="sm" onClick={() => close(false)}>
              {cancelLabel || t('common.cancel')}
            </Button>
            <Button variant={danger ? 'danger' : 'primary'} size="sm" onClick={() => close(true)}>
              {confirmLabel || t('common.confirm')}
            </Button>
          </ModalButtonGroup>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
