import * as AlertDialog from '@radix-ui/react-alert-dialog'
import type { ReactNode, SyntheticEvent } from 'react'
import { t } from '../i18n.js'

function stopPortalPropagation(event: SyntheticEvent) {
  event.stopPropagation()
}

export function ConfirmDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => void
  busy?: boolean
}) {
  return (
    <AlertDialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          className="confirmOverlay"
          onClick={stopPortalPropagation}
          onPointerDown={stopPortalPropagation}
        />
        <AlertDialog.Content
          className="confirmDialog"
          onClick={stopPortalPropagation}
          onPointerDown={stopPortalPropagation}
        >
          <AlertDialog.Title className="confirmTitle">{props.title}</AlertDialog.Title>
          <AlertDialog.Description className="confirmDescription">
            {props.description}
          </AlertDialog.Description>
          <div className="confirmActions">
            <AlertDialog.Cancel className="secondary" disabled={props.busy}>
              {t('board.cancel')}
            </AlertDialog.Cancel>
            <AlertDialog.Action
              className="dangerButton"
              disabled={props.busy}
              onClick={(event) => {
                event.stopPropagation()
                props.onConfirm()
              }}
            >
              {props.confirmLabel ?? t('board.confirmDelete')}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}

export function ConfirmActionButton(props: {
  className?: string
  children: ReactNode
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>
        <button className={props.className} disabled={props.disabled} type={props.type ?? 'button'}>
          {props.children}
        </button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          className="confirmOverlay"
          onClick={stopPortalPropagation}
          onPointerDown={stopPortalPropagation}
        />
        <AlertDialog.Content
          className="confirmDialog"
          onClick={stopPortalPropagation}
          onPointerDown={stopPortalPropagation}
        >
          <AlertDialog.Title className="confirmTitle">{props.title}</AlertDialog.Title>
          <AlertDialog.Description className="confirmDescription">
            {props.description}
          </AlertDialog.Description>
          <div className="confirmActions">
            <AlertDialog.Cancel className="secondary">{t('board.cancel')}</AlertDialog.Cancel>
            <AlertDialog.Action
              className="dangerButton"
              onClick={(event) => {
                event.stopPropagation()
                props.onConfirm()
              }}
            >
              {props.confirmLabel ?? t('board.confirmDelete')}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
