import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalButtonGroup,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from '@shadowob/ui'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DialogMode } from './workspace-types'

interface WorkspaceDialogsProps {
  dialog: DialogMode
  onClose: () => void
  onSubmit: (value: string) => void
  isPending: boolean
}

export function WorkspaceDialogs({ dialog, onClose, onSubmit, isPending }: WorkspaceDialogsProps) {
  const { t } = useTranslation()

  if (!dialog) return null

  const title =
    dialog.kind === 'create-folder'
      ? t('workspace.newFolder')
      : dialog.kind === 'create-file'
        ? t('workspace.newFile')
        : t('workspace.rename')

  const placeholder =
    dialog.kind === 'create-folder'
      ? t('workspace.folderNamePlaceholder')
      : dialog.kind === 'create-file'
        ? t('workspace.fileNamePlaceholder')
        : t('workspace.newNamePlaceholder')

  const defaultValue = dialog.kind === 'rename' ? dialog.currentName : ''
  const confirmLabel = dialog.kind === 'rename' ? t('common.save') : t('common.create')

  return (
    <Modal open onClose={onClose}>
      <ModalContent maxWidth="max-w-md">
        <ModalHeader title={title} closeLabel={t('common.close')} />
        <DialogInput
          defaultValue={defaultValue}
          placeholder={placeholder}
          onSubmit={onSubmit}
          isPending={isPending}
          confirmLabel={confirmLabel}
          cancelLabel={t('common.cancel')}
          onCancel={onClose}
        />
      </ModalContent>
    </Modal>
  )
}

/* ─── Reusable dialog input form ─── */

function DialogInput({
  defaultValue,
  placeholder,
  onSubmit,
  isPending,
  confirmLabel,
  cancelLabel,
  onCancel,
}: {
  defaultValue: string
  placeholder: string
  onSubmit: (value: string) => void
  isPending: boolean
  confirmLabel: string
  cancelLabel: string
  onCancel: () => void
}) {
  const [inputValue, setInputValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setInputValue(defaultValue)
  }, [defaultValue])

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    if (defaultValue) {
      input.select()
    }
  }, [defaultValue])

  return (
    <>
      <ModalBody className="py-5">
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value)
          }}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              const val = inputValue.trim()
              if (val) onSubmit(val)
            } else if (e.key === 'Escape') {
              onCancel()
            }
          }}
          placeholder={placeholder}
          className="mb-1"
        />
      </ModalBody>
      <ModalFooter>
        <ModalButtonGroup>
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              const val = inputValue.trim()
              if (val) onSubmit(val)
            }}
            disabled={isPending}
            loading={isPending}
          >
            {confirmLabel}
          </Button>
        </ModalButtonGroup>
      </ModalFooter>
    </>
  )
}
