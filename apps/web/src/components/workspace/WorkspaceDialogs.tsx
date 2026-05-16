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
      ? t('workspace.newFolder', { defaultValue: '新建文件夹' })
      : dialog.kind === 'create-file'
        ? t('workspace.newFile', { defaultValue: '新建文件' })
        : t('workspace.rename', { defaultValue: '重命名' })

  const placeholder =
    dialog.kind === 'create-folder'
      ? t('workspace.folderNamePlaceholder', { defaultValue: '文件夹名称' })
      : dialog.kind === 'create-file'
        ? t('workspace.fileNamePlaceholder', { defaultValue: '文件名称（如 README.md）' })
        : t('workspace.newNamePlaceholder', { defaultValue: '新名称' })

  const defaultValue = dialog.kind === 'rename' ? dialog.currentName : ''
  const confirmLabel =
    dialog.kind === 'rename'
      ? t('common.save', { defaultValue: '保存' })
      : t('common.create', { defaultValue: '创建' })

  return (
    <Modal open onClose={onClose}>
      <ModalContent maxWidth="max-w-md">
        <ModalHeader title={title} closeLabel={t('common.close', { defaultValue: '关闭' })} />
        <DialogInput
          defaultValue={defaultValue}
          placeholder={placeholder}
          onSubmit={onSubmit}
          isPending={isPending}
          confirmLabel={confirmLabel}
          cancelLabel={t('common.cancel', { defaultValue: '取消' })}
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
