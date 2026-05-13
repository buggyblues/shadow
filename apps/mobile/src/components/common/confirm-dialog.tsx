import { StyleSheet } from 'react-native'
import { Button, Dialog } from '../ui'

interface ConfirmDialogProps {
  visible: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      visible={visible}
      onClose={onCancel}
      title={title}
      description={message}
      actions={
        <>
          <Button variant="glass" size="md" style={styles.action} onPress={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            size="md"
            style={styles.action}
            onPress={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  )
}

const styles = StyleSheet.create({
  action: {
    flex: 1,
  },
})
