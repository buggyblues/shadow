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
import { useEffect, useState } from 'react'
import type { DialogMode } from './workspace-types'

interface WorkspaceDialogsProps {
  dialog: DialogMode
  onClose: () => void
  onSubmit: (value: string) => void
  isPending: boolean
}

export function WorkspaceDialogs({ dialog, onClose, onSubmit, isPending }: WorkspaceDialogsProps) {
  if (!dialog) return null

  const title =
    dialog.kind === 'create-folder'
      ? '新建文件夹'
      : dialog.kind === 'create-file'
        ? '新建文件'
        : '重命名'

  const placeholder =
    dialog.kind === 'create-folder'
      ? '文件夹名称'
      : dialog.kind === 'create-file'
        ? '文件名称（如 README.md）'
        : '新名称'

  const defaultValue = dialog.kind === 'rename' ? dialog.currentName : ''
  const confirmLabel = dialog.kind === 'rename' ? '保存' : '创建'

  return (
    <Modal open onClose={onClose}>
      <ModalContent maxWidth="max-w-md">
        <ModalHeader title={title} closeLabel="关闭" />
        <DialogInput
          defaultValue={defaultValue}
          placeholder={placeholder}
          onSubmit={onSubmit}
          isPending={isPending}
          confirmLabel={confirmLabel}
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
  onCancel,
}: {
  defaultValue: string
  placeholder: string
  onSubmit: (value: string) => void
  isPending: boolean
  confirmLabel: string
  onCancel: () => void
}) {
  const [inputValue, setInputValue] = useState(defaultValue)

  useEffect(() => {
    setInputValue(defaultValue)
  }, [defaultValue])

  return (
    <>
      <ModalBody className="py-5">
        <Input
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
            取消
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
